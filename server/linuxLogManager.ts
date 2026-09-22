import { RemoteServer, LinuxLogCategory, LinuxLogEntry, LinuxSystemLogsResponse, LinuxLogFileMetadata } from '../src/types';
import { runAdaptiveSshCommand } from './linuxServerMonitor';

/**
 * Sanitize shell input parameters
 */
function sanitizeArg(val: string): string {
  return val.replace(/[^a-zA-Z0-9_\-\.\:\/\s]/g, '');
}

/**
 * Determine severity level from line text
 */
function parseLogLevel(line: string): LinuxLogEntry['level'] {
  const lower = line.toLowerCase();
  if (lower.includes('emerg') || lower.includes('panic')) return 'emergency';
  if (lower.includes('alert')) return 'alert';
  if (lower.includes('crit')) return 'critical';
  if (
    lower.includes('err') ||
    lower.includes('error') ||
    lower.includes('failed') ||
    lower.includes('failure') ||
    lower.includes('fatal') ||
    lower.includes('denied') ||
    lower.includes('segfault')
  ) {
    return 'error';
  }
  if (lower.includes('warn') || lower.includes('warning') || lower.includes('invalid') || lower.includes('timeout')) {
    return 'warning';
  }
  if (lower.includes('notice') || lower.includes('note')) return 'notice';
  if (lower.includes('debug') || lower.includes('trace')) return 'debug';
  return 'info';
}

/**
 * Parse standard Linux syslog / journal lines into structured entry
 */
function parseLogLine(raw: string, index: number): LinuxLogEntry {
  const trimmed = raw.trim();
  const id = `log-${Date.now()}-${index}`;
  const level = parseLogLevel(trimmed);

  // Common syslog pattern: "Mmm dd hh:mm:ss hostname service[pid]: message"
  const syslogMatch = trimmed.match(
    /^([A-Z][a-z]{2}\s+\d+\s+\d{2}:\d{2}:\d{2})\s+([^\s]+)\s+([^:\[]+)(?:\[\d+\])?:\s*(.*)$/
  );
  if (syslogMatch) {
    return {
      id,
      raw: trimmed,
      timestamp: syslogMatch[1],
      hostname: syslogMatch[2],
      service: syslogMatch[3],
      level,
      message: syslogMatch[4] || trimmed,
    };
  }

  // ISO timestamp pattern (systemd/journalctl): "2026-09-22T10:15:30.123456+00:00 hostname service[pid]: message"
  const isoMatch = trimmed.match(
    /^(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}:?\d{2}|Z)?)\s+([^\s]+)\s+([^:\[]+)(?:\[\d+\])?:\s*(.*)$/
  );
  if (isoMatch) {
    return {
      id,
      raw: trimmed,
      timestamp: isoMatch[1],
      hostname: isoMatch[2],
      service: isoMatch[3],
      level,
      message: isoMatch[4] || trimmed,
    };
  }

  // dmesg pattern: "[ 12345.678901] message" or "[Sat Sep 22 10:15:30 2026] message"
  const dmesgMatch = trimmed.match(/^\[(.*?)\]\s*(.*)$/);
  if (dmesgMatch) {
    return {
      id,
      raw: trimmed,
      timestamp: dmesgMatch[1],
      service: 'kernel',
      level,
      message: dmesgMatch[2] || trimmed,
    };
  }

  return {
    id,
    raw: trimmed,
    level,
    message: trimmed,
  };
}

/**
 * Fetch Linux system logs and journal records via SSH
 */
export async function fetchLinuxSystemLogsSSH(
  server: RemoteServer,
  options: {
    category: LinuxLogCategory;
    lines?: number;
    grepFilter?: string;
    customPath?: string;
    priority?: string;
    unit?: string;
    since?: string;
  },
  ephemeralPassword?: string
): Promise<LinuxSystemLogsResponse> {
  const lineCount = Math.min(Math.max(Number(options.lines) || 200, 10), 2000);
  const filter = options.grepFilter ? sanitizeArg(options.grepFilter.trim()) : '';
  const category = options.category || 'journal';
  const customPath = options.customPath ? sanitizeArg(options.customPath.trim()) : '';
  const priority = options.priority ? sanitizeArg(options.priority.trim()) : '';
  const unit = options.unit ? sanitizeArg(options.unit.trim()) : '';
  const since = options.since ? sanitizeArg(options.since.trim()) : '';

  // Script to discover log files in /var/log/
  const SCRIPT = `export LC_ALL=C
CATEGORY="${category}"
LINES=${lineCount}
FILTER="${filter}"
CUSTOM="${customPath}"
PRIORITY="${priority}"
UNIT="${unit}"
SINCE="${since}"

echo "===ACTIVE_FILE==="
TARGET_FILE=""
USE_JOURNAL="0"
USE_DMESG="0"

if [ "$CATEGORY" = "journal" ]; then
  USE_JOURNAL="1"
  TARGET_FILE="systemd-journal"
elif [ "$CATEGORY" = "auth" ]; then
  if [ -f /var/log/auth.log ]; then TARGET_FILE="/var/log/auth.log"
  elif [ -f /var/log/secure ]; then TARGET_FILE="/var/log/secure"
  else USE_JOURNAL="1"; UNIT="ssh"; TARGET_FILE="journalctl -u ssh/sshd"; fi
elif [ "$CATEGORY" = "syslog" ]; then
  if [ -f /var/log/syslog ]; then TARGET_FILE="/var/log/syslog"
  elif [ -f /var/log/messages ]; then TARGET_FILE="/var/log/messages"
  else USE_JOURNAL="1"; TARGET_FILE="systemd-journal"; fi
elif [ "$CATEGORY" = "dmesg" ]; then
  USE_DMESG="1"
  TARGET_FILE="/var/log/dmesg"
elif [ "$CATEGORY" = "nginx" ]; then
  if [ -f /var/log/nginx/error.log ]; then TARGET_FILE="/var/log/nginx/error.log"
  elif [ -f /var/log/nginx/access.log ]; then TARGET_FILE="/var/log/nginx/access.log"
  else TARGET_FILE="/var/log/nginx/error.log"; fi
elif [ "$CATEGORY" = "apache" ]; then
  if [ -f /var/log/apache2/error.log ]; then TARGET_FILE="/var/log/apache2/error.log"
  elif [ -f /var/log/httpd/error_log ]; then TARGET_FILE="/var/log/httpd/error_log"
  else TARGET_FILE="/var/log/apache2/error.log"; fi
elif [ "$CATEGORY" = "dpkg" ]; then
  if [ -f /var/log/dpkg.log ]; then TARGET_FILE="/var/log/dpkg.log"
  elif [ -f /var/log/apt/history.log ]; then TARGET_FILE="/var/log/apt/history.log"
  elif [ -f /var/log/dnf.log ]; then TARGET_FILE="/var/log/dnf.log"
  elif [ -f /var/log/yum.log ]; then TARGET_FILE="/var/log/yum.log"
  else TARGET_FILE="/var/log/dpkg.log"; fi
elif [ "$CATEGORY" = "cron" ]; then
  if [ -f /var/log/cron ]; then TARGET_FILE="/var/log/cron"
  elif [ -f /var/log/syslog ]; then TARGET_FILE="/var/log/syslog"
  else USE_JOURNAL="1"; UNIT="cron"; TARGET_FILE="journalctl -u cron"; fi
elif [ "$CATEGORY" = "fail2ban" ]; then
  TARGET_FILE="/var/log/fail2ban.log"
elif [ "$CATEGORY" = "boot" ]; then
  if [ -f /var/log/boot.log ]; then TARGET_FILE="/var/log/boot.log"
  else USE_JOURNAL="1"; TARGET_FILE="journalctl -b"; fi
elif [ "$CATEGORY" = "custom" ] && [ -n "$CUSTOM" ]; then
  TARGET_FILE="$CUSTOM"
else
  USE_JOURNAL="1"
  TARGET_FILE="systemd-journal"
fi

echo "$TARGET_FILE"

echo "===METADATA==="
if [ -n "$TARGET_FILE" ] && [ "$USE_JOURNAL" = "0" ] && [ "$USE_DMESG" = "0" ]; then
  if [ -f "$TARGET_FILE" ]; then
    echo "EXISTS:1"
    ls -lh "$TARGET_FILE" 2>/dev/null | awk '{print "SIZE:"$5}'
    stat -c "MODIFIED:%y" "$TARGET_FILE" 2>/dev/null || true
    wc -l "$TARGET_FILE" 2>/dev/null | awk '{print "LINES:"$1}'
  else
    echo "EXISTS:0"
  fi
elif [ "$USE_JOURNAL" = "1" ]; then
  echo "EXISTS:1"
  journalctl --disk-usage 2>/dev/null | awk '{print "SIZE:"$7}'
elif [ "$USE_DMESG" = "1" ]; then
  echo "EXISTS:1"
  echo "SIZE:RingBuffer"
fi

echo "===LOGS_START==="
if [ "$USE_JOURNAL" = "1" ]; then
  J_CMD="journalctl -n $LINES --no-pager"
  if [ -n "$PRIORITY" ]; then J_CMD="$J_CMD -p $PRIORITY"; fi
  if [ -n "$UNIT" ]; then J_CMD="$J_CMD -u $UNIT"; fi
  if [ -n "$SINCE" ]; then J_CMD="$J_CMD --since '$SINCE'"; fi
  if [ "$CATEGORY" = "boot" ]; then J_CMD="$J_CMD -b 0"; fi
  if [ -n "$FILTER" ]; then
    sudo -n $J_CMD 2>/dev/null | grep -i -- "$FILTER" || $J_CMD 2>/dev/null | grep -i -- "$FILTER" || true
  else
    sudo -n $J_CMD 2>/dev/null || $J_CMD 2>/dev/null || true
  fi
elif [ "$USE_DMESG" = "1" ]; then
  if [ -n "$FILTER" ]; then
    (dmesg -T --color=never 2>/dev/null || cat /var/log/dmesg 2>/dev/null || true) | tail -n $LINES | grep -i -- "$FILTER" || true
  else
    (dmesg -T --color=never 2>/dev/null || cat /var/log/dmesg 2>/dev/null || true) | tail -n $LINES
  fi
elif [ -n "$TARGET_FILE" ] && [ -f "$TARGET_FILE" ]; then
  if [ "$CATEGORY" = "cron" ] && [ "$TARGET_FILE" = "/var/log/syslog" ]; then
    if [ -n "$FILTER" ]; then
      sudo -n tail -n 2000 "$TARGET_FILE" 2>/dev/null | grep -i "cron" | tail -n $LINES | grep -i -- "$FILTER" || true
    else
      sudo -n tail -n 2000 "$TARGET_FILE" 2>/dev/null | grep -i "cron" | tail -n $LINES || true
    fi
  else
    if [ -n "$FILTER" ]; then
      sudo -n tail -n 2000 "$TARGET_FILE" 2>/dev/null | grep -i -- "$FILTER" | tail -n $LINES || tail -n 2000 "$TARGET_FILE" 2>/dev/null | grep -i -- "$FILTER" | tail -n $LINES || true
    else
      sudo -n tail -n $LINES "$TARGET_FILE" 2>/dev/null || tail -n $LINES "$TARGET_FILE" 2>/dev/null || true
    fi
  fi
else
  echo "[NetTopology] Log target not found or permission denied: $TARGET_FILE"
fi
echo "===LOGS_END==="

echo "===AVAILABLE_LOGS==="
ls -lh /var/log/*.log /var/log/*/*.log 2>/dev/null | awk '{print $9"|"$5"|"$6" "$7" "$8}' | head -n 35 || true
echo "===SCRIPT_DONE==="
`;

  try {
    const rawOutput = await runAdaptiveSshCommand(server, SCRIPT, ephemeralPassword, 12000);

    const sections: Record<string, string[]> = {};
    let currentSec = '';
    for (const line of rawOutput.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith('===') && trimmed.endsWith('===')) {
        currentSec = trimmed.replace(/===/g, '').trim();
        sections[currentSec] = [];
      } else if (currentSec) {
        sections[currentSec].push(line);
      }
    }

    const activeFileLine = (sections['ACTIVE_FILE'] || [])[0] || '';
    const metadataLines = sections['METADATA'] || [];
    const logLines = sections['LOGS_START'] || [];
    const availableLines = sections['AVAILABLE_LOGS'] || [];

    const fileMeta: LinuxLogFileMetadata = {
      path: activeFileLine || 'journalctl',
      exists: true,
    };

    for (const m of metadataLines) {
      if (m.startsWith('EXISTS:')) fileMeta.exists = m.split(':')[1] === '1';
      if (m.startsWith('SIZE:')) fileMeta.sizeHuman = m.substring(5).trim();
      if (m.startsWith('MODIFIED:')) fileMeta.lastModified = m.substring(9).trim();
      if (m.startsWith('LINES:')) fileMeta.lineCount = parseInt(m.substring(6).trim(), 10) || undefined;
    }

    // Parse available files
    const availableLogFiles: LinuxLogFileMetadata[] = [];
    for (const av of availableLines) {
      const parts = av.trim().split('|');
      if (parts.length >= 2 && parts[0]) {
        availableLogFiles.push({
          path: parts[0],
          exists: true,
          sizeHuman: parts[1] || undefined,
          lastModified: parts[2] || undefined,
        });
      }
    }

    // Parse log entries
    const parsedLogs: LinuxLogEntry[] = [];
    let errCount = 0;
    let warnCount = 0;

    for (let i = 0; i < logLines.length; i++) {
      const raw = logLines[i];
      if (!raw || raw.startsWith('===') || raw.startsWith('[NetTopology] Log target not found')) {
        continue;
      }
      const parsed = parseLogLine(raw, i);
      if (parsed.level === 'error' || parsed.level === 'critical' || parsed.level === 'alert' || parsed.level === 'emergency') {
        errCount++;
      } else if (parsed.level === 'warning') {
        warnCount++;
      }
      parsedLogs.push(parsed);
    }

    return {
      success: true,
      category,
      filePath: activeFileLine || (category === 'journal' ? 'systemd-journal' : 'unknown'),
      logs: parsedLogs,
      rawText: logLines.join('\n'),
      lineCount: parsedLogs.length,
      errorCount: errCount,
      warnCount,
      fileMetadata: fileMeta,
      availableLogFiles,
    };
  } catch (err: any) {
    return {
      success: false,
      category,
      filePath: category,
      logs: [],
      rawText: '',
      lineCount: 0,
      errorCount: 0,
      warnCount: 0,
      error: err.message || 'Failed to fetch Linux system logs via SSH',
    };
  }
}

/**
 * Truncate/Clear a log file safely (e.g. truncate -s 0 /var/log/...)
 */
export async function truncateLinuxLogSSH(
  server: RemoteServer,
  filePath: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const sanitizedPath = sanitizeArg(filePath.trim());

  // Security guard: Only allow log files in /var/log/
  if (!sanitizedPath.startsWith('/var/log/') || sanitizedPath.includes('..')) {
    throw new Error('Only files inside /var/log/ can be cleared or truncated for safety.');
  }

  // Extra safety: Do NOT allow clearing auth or secure logs directly without explicit intent
  if (sanitizedPath === '/var/log/auth.log' || sanitizedPath === '/var/log/secure') {
    throw new Error('Clearing security audit logs (auth.log/secure) is blocked by security policy.');
  }

  const SCRIPT = `export LC_ALL=C
if [ -f "${sanitizedPath}" ]; then
  sudo -n truncate -s 0 "${sanitizedPath}" 2>/dev/null || truncate -s 0 "${sanitizedPath}" 2>/dev/null
  echo "SUCCESS"
else
  echo "NOT_FOUND"
fi
`;

  const output = await runAdaptiveSshCommand(server, SCRIPT, ephemeralPassword, 8000);
  if (output.includes('SUCCESS')) {
    return { success: true, message: `File ${sanitizedPath} truncated successfully.` };
  } else if (output.includes('NOT_FOUND')) {
    throw new Error(`Log file ${sanitizedPath} does not exist.`);
  } else {
    throw new Error(`Failed to truncate log file. Permission denied or command failed.`);
  }
}
