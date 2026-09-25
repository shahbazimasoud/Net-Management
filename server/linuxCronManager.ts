import { RemoteServer, LinuxCronJob, LinuxCronOverview, LinuxCronJobPayload, LinuxCronExecutionResult } from '../src/types';
import { runAdaptiveSshCommand } from './linuxServerMonitor';

/**
 * =========================================================================
 * LINUX CRON JOBS MANAGER (CRONTAB & SYSTEM CRON)
 * Authentically reads, parses, creates, toggles, edits and runs cron jobs
 * on target Linux hosts via real SSH command execution.
 * Zero Fake Data Guarantee.
 * =========================================================================
 */

/**
 * Helper to escape single quotes in bash strings
 */
function bashEscape(str: string): string {
  return str.replace(/'/g, "'\\''");
}

/**
 * Checks if a line matches a cron schedule (5 fields or special @keyword)
 */
function parseCronScheduleAndCommand(
  line: string,
  isSystemFile: boolean
): { schedule: string; command: string; user?: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#!')) return null;

  // Check special schedules (@reboot, @daily, etc.)
  const specialMatch = trimmed.match(/^(@(?:reboot|yearly|annually|monthly|weekly|daily|midnight|hourly))\s+(\S+.*)$/i);
  if (specialMatch) {
    const schedule = specialMatch[1].toLowerCase();
    const rest = specialMatch[2].trim();
    if (isSystemFile) {
      const restParts = rest.split(/\s+/);
      const user = restParts[0];
      const command = restParts.slice(1).join(' ');
      return { schedule, user, command };
    }
    return { schedule, command: rest };
  }

  // Standard 5-field cron: min hour dom mon dow
  // Example: 0 2 * * * /path/to/cmd
  // System file: 0 2 * * * root /path/to/cmd
  const cronRegex = /^([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+(\S+.*)$/;
  const match = trimmed.match(cronRegex);
  if (!match) return null;

  const schedule = `${match[1]} ${match[2]} ${match[3]} ${match[4]} ${match[5]}`;
  const rest = match[6].trim();

  if (isSystemFile) {
    const parts = rest.split(/\s+/);
    const user = parts[0];
    const command = parts.slice(1).join(' ');
    return { schedule, user, command };
  }

  return { schedule, command: rest };
}

/**
 * Fetches real Linux cron jobs across user crontabs and system cron files
 */
export async function fetchLinuxCronOverviewSSH(
  server: RemoteServer,
  ephemeralPassword?: string,
  targetUser?: string
): Promise<LinuxCronOverview> {
  const script = `export LC_ALL=C
echo "===DAEMON_STATUS==="
if systemctl is-active cron >/dev/null 2>&1; then
  echo "cron:active"
elif systemctl is-active crond >/dev/null 2>&1; then
  echo "crond:active"
else
  echo "cron:inactive"
fi
if systemctl is-enabled cron >/dev/null 2>&1; then
  echo "cron:enabled"
elif systemctl is-enabled crond >/dev/null 2>&1; then
  echo "crond:enabled"
else
  echo "cron:disabled"
fi

echo "===CURRENT_USER==="
whoami

echo "===SYSTEM_USERS==="
getent passwd 2>/dev/null | awk -F: '$3 == 0 || $3 >= 1000 || $1 == "www-data" || $1 == "nginx" || $1 == "postgres" || $1 == "mysql" {print $1}' || true

echo "===USER_CRONTABS==="
# Fetch crontab for current user
CURRENT_USER=$(whoami)
echo "---USER:$CURRENT_USER---"
crontab -l 2>/dev/null || true

# If target user specified and different from current user
TARGET="${bashEscape(targetUser || '')}"
if [ -n "$TARGET" ] && [ "$TARGET" != "$CURRENT_USER" ]; then
  echo "---USER:$TARGET---"
  sudo crontab -u "$TARGET" -l 2>/dev/null || crontab -u "$TARGET" -l 2>/dev/null || true
fi

# Also check root crontab if not already checked
if [ "$CURRENT_USER" != "root" ] && [ "$TARGET" != "root" ]; then
  echo "---USER:root---"
  sudo crontab -u root -l 2>/dev/null || true
fi

echo "===ETC_CRONTAB==="
if [ -f /etc/crontab ]; then
  cat /etc/crontab 2>/dev/null || true
fi

echo "===CRON_D==="
if [ -d /etc/cron.d ]; then
  for f in /etc/cron.d/*; do
    if [ -f "$f" ]; then
      echo "---FILE:$f---"
      cat "$f" 2>/dev/null || true
    fi
  done
fi
`;

  const output = await runAdaptiveSshCommand(server, script, ephemeralPassword, 15000);

  // 1. Parse daemon status
  const daemonSection = output.split('===DAEMON_STATUS===')[1]?.split('===CURRENT_USER===')[0] || '';
  let serviceName = 'cron';
  let active = false;
  let enabled = false;

  if (daemonSection.includes('crond:active')) {
    serviceName = 'crond';
    active = true;
  } else if (daemonSection.includes('cron:active')) {
    serviceName = 'cron';
    active = true;
  }

  if (daemonSection.includes('crond:enabled') || daemonSection.includes('cron:enabled')) {
    enabled = true;
  }

  // 2. Parse current user
  const currentUserSection = output.split('===CURRENT_USER===')[1]?.split('===SYSTEM_USERS===')[0] || '';
  const currentUser = currentUserSection.trim().split('\n')[0] || server.ssh_username || 'root';

  // 3. Parse system users
  const systemUsersSection = output.split('===SYSTEM_USERS===')[1]?.split('===USER_CRONTABS===')[0] || '';
  const systemUsers = Array.from(
    new Set(
      systemUsersSection
        .split('\n')
        .map((u) => u.trim())
        .filter((u) => u.length > 0 && !u.startsWith('#'))
    )
  );
  if (!systemUsers.includes('root')) systemUsers.unshift('root');
  if (!systemUsers.includes(currentUser)) systemUsers.push(currentUser);

  // 4. Parse user crontabs
  const userCrontabsSection = output.split('===USER_CRONTABS===')[1]?.split('===ETC_CRONTAB===')[0] || '';
  const jobs: LinuxCronJob[] = [];

  const userBlocks = userCrontabsSection.split(/---USER:([^\n]+)---/);
  for (let i = 1; i < userBlocks.length; i += 2) {
    const user = userBlocks[i]?.trim();
    const content = userBlocks[i + 1] || '';
    if (!user) continue;

    parseCrontabContent(content, user, 'user_crontab', undefined, jobs);
  }

  // 5. Parse /etc/crontab
  const etcCrontabSection = output.split('===ETC_CRONTAB===')[1]?.split('===CRON_D===')[0] || '';
  if (etcCrontabSection.trim()) {
    parseCrontabContent(etcCrontabSection, 'root', 'etc_crontab', '/etc/crontab', jobs, true);
  }

  // 6. Parse /etc/cron.d/*
  const cronDSection = output.split('===CRON_D===')[1] || '';
  const cronDBlocks = cronDSection.split(/---FILE:([^\n]+)---/);
  for (let i = 1; i < cronDBlocks.length; i += 2) {
    const filePath = cronDBlocks[i]?.trim();
    const fileContent = cronDBlocks[i + 1] || '';
    if (!filePath) continue;

    parseCrontabContent(fileContent, 'root', 'cron_d', filePath, jobs, true);
  }

  return {
    jobs,
    systemUsers,
    cronDaemonStatus: {
      serviceName,
      active,
      running: active,
      enabled,
    },
    currentUser,
  };
}

/**
 * Parses lines in crontab text and pushes recognized jobs into `jobs` array
 */
function parseCrontabContent(
  content: string,
  defaultUser: string,
  source: LinuxCronJob['source'],
  sourceFile: string | undefined,
  jobs: LinuxCronJob[],
  isSystemFormat: boolean = false
) {
  const lines = content.split('\n');
  let pendingComment: string | undefined = undefined;
  const currentEnvVars: Record<string, string> = {};

  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx];
    const trimmed = raw.trim();

    if (!trimmed) {
      pendingComment = undefined;
      continue;
    }

    // Check environment assignment (e.g., PATH=/bin:/usr/bin, SHELL=/bin/bash)
    const envMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (envMatch && !trimmed.startsWith('#')) {
      const key = envMatch[1];
      const val = envMatch[2].replace(/^["']|["']$/g, '');
      currentEnvVars[key] = val;
      pendingComment = undefined;
      continue;
    }

    // Check disabled / stopped cron line
    // Pattern: # [DISABLED] 0 2 * * * /cmd
    // Or: #* * * * * /cmd or # 0 2 * * * /cmd
    const disabledPrefixMatch = trimmed.match(/^#\s*(?:\[DISABLED\]|\[STOPPED\]|DISABLED:|STOPPED:)\s*(.*)$/i);
    const genericCommentedCronMatch = !disabledPrefixMatch && trimmed.match(/^#\s*(@\w+|[0-9*,\/-]+\s+[0-9*,\/-]+\s+[0-9*,\/-]+\s+[0-9*,\/-]+\s+[0-9*,\/-]+)\s+(.*)$/);

    if (disabledPrefixMatch || genericCommentedCronMatch) {
      const lineToParse = disabledPrefixMatch ? disabledPrefixMatch[1] : (genericCommentedCronMatch ? `${genericCommentedCronMatch[1]} ${genericCommentedCronMatch[2]}` : '');
      const parsed = parseCronScheduleAndCommand(lineToParse, isSystemFormat);
      if (parsed) {
        const jobId = `${parsed.user || defaultUser}_${source}_${idx}_${Buffer.from(parsed.command).toString('base64').slice(0, 10)}`;
        jobs.push({
          id: jobId,
          user: parsed.user || defaultUser,
          schedule: parsed.schedule,
          command: parsed.command,
          comment: pendingComment,
          isEnabled: false,
          source,
          sourceFile,
          rawLine: raw,
          lineNumber: idx + 1,
          environmentVars: Object.keys(currentEnvVars).length > 0 ? { ...currentEnvVars } : undefined,
        });
        pendingComment = undefined;
        continue;
      }
    }

    // Check normal comment line
    if (trimmed.startsWith('#')) {
      const commentText = trimmed.replace(/^#+\s*/, '').trim();
      // Ignore system file headers
      if (!commentText.toLowerCase().includes('edit this file') && !commentText.toLowerCase().includes('m h dom mon dow')) {
        pendingComment = commentText;
      }
      continue;
    }

    // Check active cron job line
    const parsed = parseCronScheduleAndCommand(trimmed, isSystemFormat);
    if (parsed) {
      const jobId = `${parsed.user || defaultUser}_${source}_${idx}_${Buffer.from(parsed.command).toString('base64').slice(0, 10)}`;
      jobs.push({
        id: jobId,
        user: parsed.user || defaultUser,
        schedule: parsed.schedule,
        command: parsed.command,
        comment: pendingComment,
        isEnabled: true,
        source,
        sourceFile,
        rawLine: raw,
        lineNumber: idx + 1,
        environmentVars: Object.keys(currentEnvVars).length > 0 ? { ...currentEnvVars } : undefined,
      });
      pendingComment = undefined;
      continue;
    }

    pendingComment = undefined;
  }
}

/**
 * Creates or updates a cron job in a user's crontab on target host
 */
export async function saveLinuxCronJobSSH(
  server: RemoteServer,
  payload: LinuxCronJobPayload,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string; job?: LinuxCronJob }> {
  const targetUser = (payload.user || 'root').trim();
  const schedule = payload.schedule.trim();
  const command = payload.command.trim();
  const comment = payload.comment?.trim();
  const isEnabled = payload.isEnabled !== false;

  if (!schedule) {
    throw new Error('Cron schedule expression cannot be empty.');
  }
  if (!command) {
    throw new Error('Cron command cannot be empty.');
  }

  // 1. Fetch current crontab
  const getCrontabScript = `sudo crontab -u "${bashEscape(targetUser)}" -l 2>/dev/null || crontab -u "${bashEscape(targetUser)}" -l 2>/dev/null || true`;
  const existingCrontab = await runAdaptiveSshCommand(server, getCrontabScript, ephemeralPassword, 10000);

  const lines = existingCrontab.split('\n');
  const cronLine = isEnabled ? `${schedule} ${command}` : `# [DISABLED] ${schedule} ${command}`;

  let targetIndex = -1;

  // Search if editing existing job
  if (payload.originalCommand || payload.originalSchedule) {
    const origCmd = (payload.originalCommand || '').trim();
    const origSched = (payload.originalSchedule || '').trim();

    targetIndex = lines.findIndex((l) => {
      const clean = l.replace(/^#\s*(?:\[DISABLED\]|\[STOPPED\])?\s*/i, '').trim();
      return (origCmd && clean.includes(origCmd)) || (origSched && clean.startsWith(origSched));
    });
  }

  const updatedLines: string[] = [];
  if (targetIndex >= 0) {
    // Replace existing
    for (let i = 0; i < lines.length; i++) {
      if (i === targetIndex) {
        // If line immediately before was a comment, check if we should update it
        if (comment) {
          // If previous line was already a comment for this job, replace it
          if (updatedLines.length > 0 && updatedLines[updatedLines.length - 1].trim().startsWith('#')) {
            updatedLines[updatedLines.length - 1] = `# ${comment}`;
          } else {
            updatedLines.push(`# ${comment}`);
          }
        }
        updatedLines.push(cronLine);
      } else {
        updatedLines.push(lines[i]);
      }
    }
  } else {
    // Append new job
    for (const l of lines) {
      if (l.trim()) updatedLines.push(l);
    }
    if (comment) {
      updatedLines.push(`# ${comment}`);
    }
    updatedLines.push(cronLine);
  }

  // Filter trailing empty lines and join with newline
  const newCrontabContent = updatedLines.join('\n').trim() + '\n';

  // 2. Install new crontab safely
  const installScript = `export LC_ALL=C
TMPFILE=$(mktemp /tmp/crontab.XXXXXX)
cat << 'EOFCRON' > "$TMPFILE"
${newCrontabContent}
EOFCRON

if sudo crontab -u "${bashEscape(targetUser)}" "$TMPFILE" 2>/dev/null || crontab -u "${bashEscape(targetUser)}" "$TMPFILE" 2>/dev/null; then
  rm -f "$TMPFILE"
  echo "CRONTAB_SAVED_SUCCESS"
else
  ERR=$?
  rm -f "$TMPFILE"
  echo "CRONTAB_SAVE_FAILED:$ERR"
fi
`;

  const result = await runAdaptiveSshCommand(server, installScript, ephemeralPassword, 12000);

  if (!result.includes('CRONTAB_SAVED_SUCCESS')) {
    throw new Error(`Failed to update crontab for user ${targetUser}: ${result.trim()}`);
  }

  return {
    success: true,
    message: `Cron job successfully saved for user "${targetUser}".`,
  };
}

/**
 * Toggles a cron job between Enabled and Disabled (Stopped/Paused)
 */
export async function toggleLinuxCronJobSSH(
  server: RemoteServer,
  payload: { user: string; schedule: string; command: string; enable: boolean },
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const targetUser = (payload.user || 'root').trim();
  const schedule = payload.schedule.trim();
  const command = payload.command.trim();
  const enable = payload.enable;

  const getCrontabScript = `sudo crontab -u "${bashEscape(targetUser)}" -l 2>/dev/null || crontab -u "${bashEscape(targetUser)}" -l 2>/dev/null || true`;
  const existingCrontab = await runAdaptiveSshCommand(server, getCrontabScript, ephemeralPassword, 10000);

  const lines = existingCrontab.split('\n');
  let modified = false;

  const updatedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    // Check if this line corresponds to our command & schedule
    const cleanLine = trimmed.replace(/^#\s*(?:\[DISABLED\]|\[STOPPED\])?\s*/i, '').trim();

    if (cleanLine.includes(command)) {
      modified = true;
      if (enable) {
        // Remove disabled comment prefix
        return `${schedule} ${command}`;
      } else {
        // Comment out with [DISABLED]
        return `# [DISABLED] ${schedule} ${command}`;
      }
    }
    return line;
  });

  if (!modified) {
    throw new Error(`Target cron job with command "${command}" was not found in ${targetUser}'s crontab.`);
  }

  const newCrontabContent = updatedLines.join('\n').trim() + '\n';

  const installScript = `export LC_ALL=C
TMPFILE=$(mktemp /tmp/crontab.XXXXXX)
cat << 'EOFCRON' > "$TMPFILE"
${newCrontabContent}
EOFCRON

if sudo crontab -u "${bashEscape(targetUser)}" "$TMPFILE" 2>/dev/null || crontab -u "${bashEscape(targetUser)}" "$TMPFILE" 2>/dev/null; then
  rm -f "$TMPFILE"
  echo "CRONTAB_TOGGLE_SUCCESS"
else
  ERR=$?
  rm -f "$TMPFILE"
  echo "CRONTAB_TOGGLE_FAILED:$ERR"
fi
`;

  const result = await runAdaptiveSshCommand(server, installScript, ephemeralPassword, 12000);

  if (!result.includes('CRONTAB_TOGGLE_SUCCESS')) {
    throw new Error(`Failed to toggle cron job state: ${result.trim()}`);
  }

  return {
    success: true,
    message: enable
      ? `Cron job has been enabled and resumed.`
      : `Cron job has been disabled and stopped (paused).`,
  };
}

/**
 * Deletes a cron job from user's crontab on target host
 */
export async function deleteLinuxCronJobSSH(
  server: RemoteServer,
  payload: { user: string; schedule: string; command: string },
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const targetUser = (payload.user || 'root').trim();
  const command = payload.command.trim();

  const getCrontabScript = `sudo crontab -u "${bashEscape(targetUser)}" -l 2>/dev/null || crontab -u "${bashEscape(targetUser)}" -l 2>/dev/null || true`;
  const existingCrontab = await runAdaptiveSshCommand(server, getCrontabScript, ephemeralPassword, 10000);

  const lines = existingCrontab.split('\n');
  const updatedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const clean = trimmed.replace(/^#\s*(?:\[DISABLED\]|\[STOPPED\])?\s*/i, '').trim();

    if (clean.includes(command)) {
      // If previous line was a comment describing this job, remove it too
      if (updatedLines.length > 0 && updatedLines[updatedLines.length - 1].trim().startsWith('#')) {
        updatedLines.pop();
      }
      continue; // Skip the job line
    }
    updatedLines.push(line);
  }

  const finalContent = updatedLines.join('\n').trim();

  let installScript = '';
  if (!finalContent) {
    // If crontab became empty, remove it cleanly
    installScript = `sudo crontab -u "${bashEscape(targetUser)}" -r 2>/dev/null || crontab -u "${bashEscape(targetUser)}" -r 2>/dev/null || true
echo "CRONTAB_DELETE_SUCCESS"
`;
  } else {
    installScript = `export LC_ALL=C
TMPFILE=$(mktemp /tmp/crontab.XXXXXX)
cat << 'EOFCRON' > "$TMPFILE"
${finalContent}

EOFCRON

if sudo crontab -u "${bashEscape(targetUser)}" "$TMPFILE" 2>/dev/null || crontab -u "${bashEscape(targetUser)}" "$TMPFILE" 2>/dev/null; then
  rm -f "$TMPFILE"
  echo "CRONTAB_DELETE_SUCCESS"
else
  ERR=$?
  rm -f "$TMPFILE"
  echo "CRONTAB_DELETE_FAILED:$ERR"
fi
`;
  }

  const result = await runAdaptiveSshCommand(server, installScript, ephemeralPassword, 12000);

  if (!result.includes('CRONTAB_DELETE_SUCCESS')) {
    throw new Error(`Failed to delete cron job: ${result.trim()}`);
  }

  return {
    success: true,
    message: `Cron job successfully removed from ${targetUser}'s crontab.`,
  };
}

/**
 * Runs a cron command immediately on demand to verify exit code and output
 */
export async function runLinuxCronJobNowSSH(
  server: RemoteServer,
  payload: { user: string; command: string },
  ephemeralPassword?: string
): Promise<LinuxCronExecutionResult> {
  const targetUser = (payload.user || 'root').trim();
  const command = payload.command.trim();

  const script = `export LC_ALL=C
START_TIME=$(date +%s%3N)
OUT_FILE=$(mktemp /tmp/cron_run.XXXXXX)

if [ "${bashEscape(targetUser)}" = "root" ] || [ "$(whoami)" = "${bashEscape(targetUser)}" ]; then
  eval "${bashEscape(command)}" > "$OUT_FILE" 2>&1
  EXIT_CODE=$?
else
  sudo -u "${bashEscape(targetUser)}" bash -c "${bashEscape(command)}" > "$OUT_FILE" 2>&1
  EXIT_CODE=$?
fi

END_TIME=$(date +%s%3N)
DURATION=$((END_TIME - START_TIME))

echo "===EXECUTION_EXIT_CODE:$EXIT_CODE==="
echo "===EXECUTION_DURATION_MS:$DURATION==="
echo "===EXECUTION_OUTPUT==="
cat "$OUT_FILE" 2>/dev/null || true
rm -f "$OUT_FILE"
`;

  const startTime = Date.now();
  try {
    const rawOutput = await runAdaptiveSshCommand(server, script, ephemeralPassword, 30000);

    const exitCodeMatch = rawOutput.match(/===EXECUTION_EXIT_CODE:(\d+)===/);
    const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : 0;

    const durationMatch = rawOutput.match(/===EXECUTION_DURATION_MS:(\d+)===/);
    const durationMs = durationMatch ? parseInt(durationMatch[1], 10) : Date.now() - startTime;

    const outputContent = rawOutput.split('===EXECUTION_OUTPUT===')[1] || '';

    return {
      command,
      exitCode,
      stdout: outputContent.trim(),
      stderr: exitCode !== 0 ? outputContent.trim() : '',
      durationMs,
      success: exitCode === 0,
    };
  } catch (err: any) {
    return {
      command,
      exitCode: -1,
      stdout: '',
      stderr: err?.message || 'Execution failed or timed out.',
      durationMs: Date.now() - startTime,
      success: false,
    };
  }
}
