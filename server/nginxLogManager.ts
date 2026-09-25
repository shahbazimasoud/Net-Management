import { RemoteServer } from '../src/types';
import { runAdaptiveSshCommand } from './linuxServerMonitor';
import { discoverNginxConfigTopology } from './nginxConfigParser';
import {
  NginxDiscoveredLogFile,
  NginxLogsDiscoverySummary,
  NginxLogStreamResponse,
  NginxParsedAccessLogEntry,
  NginxParsedErrorLogEntry,
  NginxLogEntry,
} from '../src/types';

/**
 * Sanitize shell arguments to prevent injection
 */
function sanitizeArg(val: string): string {
  return val.replace(/[^a-zA-Z0-9_\-\.\:\/\s]/g, '');
}

/**
 * Python script to scan all Nginx configuration files, extract all
 * active access_log and error_log directives (with their server_name contexts),
 * verify file presence on the filesystem, calculate sizes, and list them safely.
 */
const PYTHON_LOGS_DISCOVERY = (fileListJson: string) => `python3 - << 'PYEOF'
import sys, os, re, json, datetime

try:
    files_to_scan = json.loads('''${fileListJson}''')
except Exception:
    files_to_scan = []

discovered_files = {} # path -> dict
warnings = []

def strip_quotes(s):
    if not s:
        return ""
    return s.strip().strip("'\\"").strip()

def format_size(bytes_val):
    if bytes_val < 1024:
        return f"{bytes_val} B"
    elif bytes_val < 1024 * 1024:
        return f"{bytes_val / 1024:.1f} KB"
    elif bytes_val < 1024 * 1024 * 1024:
        return f"{bytes_val / (1024 * 1024):.1f} MB"
    else:
        return f"{bytes_val / (1024 * 1024 * 1024):.2f} GB"

def inspect_file(filepath, log_type, scope, server_name=None, defined_in=None, log_format=None):
    if not filepath or filepath == 'off':
        return

    # Normalize path if relative
    norm_path = os.path.abspath(filepath)
    if norm_path in discovered_files:
        existing = discovered_files[norm_path]
        if server_name and not existing.get('associatedServerName'):
            existing['associatedServerName'] = server_name
        return

    exists = os.path.exists(norm_path)
    is_readable = False
    size_bytes = 0
    size_human = "0 B"
    last_mod = None
    line_count = None

    if exists:
        try:
            st = os.stat(norm_path)
            size_bytes = st.st_size
            size_human = format_size(size_bytes)
            last_mod = datetime.datetime.fromtimestamp(st.st_mtime).isoformat()
            is_readable = os.access(norm_path, os.R_OK)
        except Exception:
            pass

    log_id = re.sub(r'[^a-zA-Z0-9]', '_', norm_path)
    discovered_files[norm_path] = {
        "id": log_id,
        "filePath": norm_path,
        "type": log_type,
        "scope": scope,
        "associatedServerName": server_name or ("Global / Default" if scope == 'global' else None),
        "definedInFile": defined_in or "Nginx Defaults",
        "exists": exists,
        "isReadable": is_readable,
        "sizeBytes": size_bytes,
        "sizeHuman": size_human,
        "lastModified": last_mod,
        "format": log_format
    }

# 1. First register standard well-known default locations
inspect_file('/var/log/nginx/access.log', 'access', 'global', server_name='Global / Default', defined_in='System Default')
inspect_file('/var/log/nginx/error.log', 'error', 'global', server_name='Global / Default', defined_in='System Default')

# 2. Parse configuration files
for fp in files_to_scan:
    if not os.path.exists(fp):
        continue
    try:
        with open(fp, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
    except Exception as e:
        warnings.append(f"Failed to read {fp}: {str(e)}")
        continue

    # Strip comments
    clean_lines = []
    for line in content.splitlines():
        clean_lines.append(re.sub(r'#.*$', '', line))
    clean_content = "\\n".join(clean_lines)

    # Global / HTTP directives
    # access_log path [format];
    for m in re.finditer(r'(?:^|\\s)access_log\\s+([^;\\s]+)(?:\\s+([^;]+))?;', clean_content):
        log_path = strip_quotes(m.group(1))
        log_fmt = strip_quotes(m.group(2)) if m.group(2) else None
        if log_path and log_path != 'off':
            inspect_file(log_path, 'access', 'global', defined_in=fp, log_format=log_fmt)

    # error_log path [level];
    for m in re.finditer(r'(?:^|\\s)error_log\\s+([^;\\s]+)(?:\\s+([^;]+))?;', clean_content):
        log_path = strip_quotes(m.group(1))
        log_lvl = strip_quotes(m.group(2)) if m.group(2) else None
        if log_path and log_path != 'off':
            inspect_file(log_path, 'error', 'global', defined_in=fp, log_format=log_lvl)

    # Server blocks inspection
    pos = 0
    while True:
        match = re.search(r'(?:^|\\s)server\\s*\\{', clean_content[pos:])
        if not match:
            break
        b_start = pos + match.end() - 1
        depth = 1
        curr = b_start + 1
        while curr < len(clean_content) and depth > 0:
            if clean_content[curr] == '{':
                depth += 1
            elif clean_content[curr] == '}':
                depth -= 1
            curr += 1
        
        server_block = clean_content[b_start:curr]
        pos = curr

        # Extract server_name
        sn_match = re.search(r'(?:^|\\s)server_name\\s+([^;]+);', server_block)
        s_name = "default"
        if sn_match:
            s_name = sn_match.group(1).split()[0].strip()

        # Check access_log inside server block
        for sm in re.finditer(r'(?:^|\\s)access_log\\s+([^;\\s]+)(?:\\s+([^;]+))?;', server_block):
            lp = strip_quotes(sm.group(1))
            lfmt = strip_quotes(sm.group(2)) if sm.group(2) else None
            if lp and lp != 'off':
                inspect_file(lp, 'access', 'server_block', server_name=s_name, defined_in=fp, log_format=lfmt)

        # Check error_log inside server block
        for sm in re.finditer(r'(?:^|\\s)error_log\\s+([^;\\s]+)(?:\\s+([^;]+))?;', server_block):
            lp = strip_quotes(sm.group(1))
            llvl = strip_quotes(sm.group(2)) if sm.group(2) else None
            if lp and lp != 'off':
                inspect_file(lp, 'error', 'server_block', server_name=s_name, defined_in=fp, log_format=llvl)

files_list = list(discovered_files.values())
access_count = sum(1 for f in files_list if f['type'] == 'access')
error_count = sum(1 for f in files_list if f['type'] == 'error')

output = {
    "totalLogFiles": len(files_list),
    "accessLogFilesCount": access_count,
    "errorLogFilesCount": error_count,
    "availableLogFiles": files_list,
    "warnings": warnings
}

print("===JSON_START===")
print(json.dumps(output))
print("===JSON_END===")
PYEOF
`;

/**
 * High performance Python log reader, parser, and real-time statistics aggregator.
 * Tail-reads the last N lines, extracts fields accurately, performs server-side filtering,
 * and compiles distribution metrics.
 */
const PYTHON_LOG_READER = (
  targetFilePath: string,
  linesToRead: number,
  filterSearch: string,
  statusCodeFilter: string,
  logLevelFilter: string
) => `python3 - << 'PYEOF'
import sys, os, re, json, datetime
from collections import Counter

target_path = '''${targetFilePath}'''
max_lines = ${linesToRead}
search_query = '''${filterSearch}'''.lower().strip()
status_filter = '''${statusCodeFilter}'''.strip().lower()
level_filter = '''${logLevelFilter}'''.strip().lower()

if not os.path.exists(target_path):
    print("===JSON_START===")
    print(json.dumps({"error": f"Log file does not exist: {target_path}", "exists": False}))
    print("===JSON_END===")
    sys.exit(0)

# Check readable
if not os.access(target_path, os.R_OK):
    print("===JSON_START===")
    print(json.dumps({"error": f"Permission denied reading log file: {target_path}", "exists": True, "readable": False}))
    print("===JSON_END===")
    sys.exit(0)

# Stat file
st = os.stat(target_path)
size_bytes = st.st_size

def format_size(bytes_val):
    if bytes_val < 1024:
        return f"{bytes_val} B"
    elif bytes_val < 1024 * 1024:
        return f"{bytes_val / 1024:.1f} KB"
    elif bytes_val < 1024 * 1024 * 1024:
        return f"{bytes_val / (1024 * 1024):.1f} MB"
    else:
        return f"{bytes_val / (1024 * 1024 * 1024):.2f} GB"

# Efficient reverse tail of last max_lines * 3 (to allow filtering room)
lines_to_fetch = max_lines * 4
raw_lines = []

try:
    with open(target_path, 'rb') as f:
        # If file is small, read all
        if size_bytes < 2 * 1024 * 1024:
            content = f.read().decode('utf-8', errors='replace')
            raw_lines = content.splitlines()[-lines_to_fetch:]
        else:
            # Seek backwards
            buf_size = 8192
            lines = []
            f.seek(0, os.SEEK_END)
            curr_pos = f.tell()
            remaining = ''
            while curr_pos > 0 and len(lines) < lines_to_fetch:
                read_size = min(buf_size, curr_pos)
                curr_pos -= read_size
                f.seek(curr_pos)
                chunk = f.read(read_size).decode('utf-8', errors='replace') + remaining
                chunk_lines = chunk.splitlines()
                if len(chunk_lines) > 1:
                    remaining = chunk_lines[0]
                    lines = chunk_lines[1:] + lines
                else:
                    remaining = chunk
            raw_lines = lines[-lines_to_fetch:]
except Exception as e:
    raw_lines = []

# Determine log type based on name or first line heuristics
is_error_log = "error" in target_path.lower()
parsed_entries = []

# Regex patterns
# Standard Combined: 127.0.0.1 - - [25/Sep/2026:15:30:00 +0000] "GET /api/test HTTP/1.1" 200 452 "http://ref" "User-Agent"
COMBINED_RE = re.compile(
    r'^(\\S+)\\s+\\S+\\s+(\\S+)\\s+\\[(.*?)\\]\\s+"([A-Z]+)\\s+(.*?)(?:\\s+(HTTP\\/[0-9\\.]+))?"\\s+(\\d{3})\\s+(\\d+|-)(?:\\s+"(.*?)"\\s+"(.*?)")?'
)

# Error log: 2026/09/25 15:30:00 [error] 1234#0: *5678 client: 192.168.1.1, server: domain.com, request: "GET / HTTP/1.1", host: "example.com", message
ERROR_RE = re.compile(
    r'^(\\d{4}\\/\\d{2}\\/\\d{2}\\s+\\d{2}:\\d{2}:\\d{2})\\s+\\[(\\w+)\\]\\s+(\\d+)(?:#(\\d+))?:\\s+(?:\\*\\d+\\s+)?(.*)$'
)

count_2xx = 0
count_3xx = 0
count_4xx = 0
count_5xx = 0
count_errors = 0
count_warns = 0

ip_counter = Counter()
uri_counter = Counter()
status_counter = Counter()

# Reverse raw_lines so newest entries appear first
raw_lines.reverse()

for idx, line in enumerate(raw_lines):
    line_str = line.strip()
    if not line_str:
        continue

    # Apply search filter if provided
    if search_query and search_query not in line_str.lower():
        continue

    entry_id = f"entry-{idx}"
    
    # Try parsing as access log if not explicitly error log
    if not is_error_log:
        m = COMBINED_RE.match(line_str)
        if m:
            c_ip = m.group(1)
            t_stamp = m.group(3)
            method = m.group(4)
            uri = m.group(5)
            proto = m.group(6) or "HTTP/1.1"
            status_code = int(m.group(7))
            b_sent = int(m.group(8)) if m.group(8) and m.group(8) != '-' else 0
            referer = m.group(9) or ""
            user_agent = m.group(10) or ""

            # Categorize status
            cat = 'other'
            if 200 <= status_code < 300:
                cat = '2xx'
                count_2xx += 1
            elif 300 <= status_code < 400:
                cat = '3xx'
                count_3xx += 1
            elif 400 <= status_code < 500:
                cat = '4xx'
                count_4xx += 1
            elif 500 <= status_code < 600:
                cat = '5xx'
                count_5xx += 1

            # Check status filter
            if status_filter:
                if status_filter in ['2xx', '3xx', '4xx', '5xx']:
                    if cat != status_filter:
                        continue
                else:
                    if str(status_code) != status_filter:
                        continue

            ip_counter[c_ip] += 1
            # Clean uri (strip query parameters for counter)
            clean_uri = uri.split('?')[0] if '?' in uri else uri
            uri_counter[clean_uri] += 1
            status_counter[status_code] += 1

            parsed_entries.append({
                "id": entry_id,
                "raw": line_str,
                "type": "access",
                "clientIp": c_ip,
                "timestamp": t_stamp,
                "method": method,
                "uri": uri,
                "protocol": proto,
                "statusCode": status_code,
                "statusCategory": cat,
                "bytesSent": b_sent,
                "referer": referer,
                "userAgent": user_agent
            })
            if len(parsed_entries) >= max_lines:
                break
            continue

    # Fallback or error log parser
    em = ERROR_RE.match(line_str)
    if em:
        t_stamp = em.group(1)
        level_name = em.group(2).lower()
        pid = int(em.group(3))
        tid = int(em.group(4)) if em.group(4) else None
        rest_msg = em.group(5)

        if level_name in ['error', 'crit', 'alert', 'emerg']:
            count_errors += 1
        elif level_name == 'warn':
            count_warns += 1

        if level_filter and level_name != level_filter:
            continue

        # Extract optional fields from error message (client, server, request, host)
        c_ip = None
        s_domain = None
        r_uri = None
        host_val = None

        c_match = re.search(r'client:\\s+([^,]+)', rest_msg)
        if c_match:
            c_ip = c_match.group(1).strip()
            ip_counter[c_ip] += 1

        s_match = re.search(r'server:\\s+([^,]+)', rest_msg)
        if s_match:
            s_domain = s_match.group(1).strip()

        req_match = re.search(r'request:\\s+"([^"]+)"', rest_msg)
        if req_match:
            r_uri = req_match.group(1).strip()
            clean_uri = r_uri.split()[1] if len(r_uri.split()) > 1 else r_uri
            uri_counter[clean_uri] += 1

        parsed_entries.append({
            "id": entry_id,
            "raw": line_str,
            "type": "error",
            "timestamp": t_stamp,
            "level": level_name,
            "pid": pid,
            "tid": tid,
            "clientIp": c_ip,
            "serverDomain": s_domain,
            "requestUri": r_uri,
            "message": rest_msg
        })
        if len(parsed_entries) >= max_lines:
            break
        continue

    # If unmatched format, create generic entry
    # Try quick heuristic for status code in line
    quick_status = None
    st_match = re.search(r'\\s(200|201|204|301|302|304|400|401|403|404|405|499|500|502|503|504)\\s', line_str)
    if st_match:
        quick_status = int(st_match.group(1))

    parsed_entries.append({
        "id": entry_id,
        "raw": line_str,
        "type": "error" if is_error_log else "access",
        "timestamp": None,
        "message": line_str,
        "statusCode": quick_status,
        "statusCategory": f"{str(quick_status)[0]}xx" if quick_status else "other"
    })
    if len(parsed_entries) >= max_lines:
        break

top_ips = [{"ip": ip, "count": cnt} for ip, cnt in ip_counter.most_common(5)]
top_uris = [{"uri": uri, "count": cnt} for uri, cnt in uri_counter.most_common(5)]
top_status = [{"code": code, "count": cnt} for code, cnt in status_counter.most_common(5)]

result = {
    "filePath": target_path,
    "logType": "error" if is_error_log else "access",
    "totalLinesScanned": len(raw_lines),
    "returnedLines": len(parsed_entries),
    "entries": parsed_entries,
    "stats": {
        "totalEntries": len(parsed_entries),
        "count2xx": count_2xx,
        "count3xx": count_3xx,
        "count4xx": count_4xx,
        "count5xx": count_5xx,
        "countErrors": count_errors,
        "countWarns": count_warns,
        "uniqueIpsCount": len(ip_counter),
        "topIps": top_ips,
        "topUris": top_uris,
        "topStatusCodes": top_status
    },
    "fileMetadata": {
        "exists": True,
        "sizeBytes": size_bytes,
        "sizeHuman": format_size(size_bytes),
        "lastModified": datetime.datetime.fromtimestamp(st.st_mtime).isoformat()
    }
}

print("===JSON_START===")
print(json.dumps(result))
print("===JSON_END===")
PYEOF
`;

/**
 * Discovers all active Nginx log files defined across configurations and system directories.
 */
export async function discoverNginxLogFiles(
  server: RemoteServer,
  ephemeralPassword?: string
): Promise<NginxLogsDiscoverySummary> {
  const configTree = await discoverNginxConfigTopology(server, ephemeralPassword);
  const filePaths = configTree.files.map((f) => f.filePath);

  const jsonFileList = JSON.stringify(filePaths).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const pythonCmd = PYTHON_LOGS_DISCOVERY(jsonFileList);

  try {
    const rawOut = await runAdaptiveSshCommand(server, pythonCmd, ephemeralPassword, 15000);
    if (rawOut.includes('===JSON_START===') && rawOut.includes('===JSON_END===')) {
      const jsonStr = rawOut.split('===JSON_START===')[1].split('===JSON_END===')[0].trim();
      const parsed: NginxLogsDiscoverySummary = JSON.parse(jsonStr);
      return parsed;
    }
  } catch (err: any) {
    console.warn(`[NginxLogManager] Python discovery failed on ${server.id}:`, err?.message || err);
  }

  // Fallback response with system defaults
  return {
    totalLogFiles: 2,
    accessLogFilesCount: 1,
    errorLogFilesCount: 1,
    availableLogFiles: [
      {
        id: 'var_log_nginx_access_log',
        filePath: '/var/log/nginx/access.log',
        type: 'access',
        scope: 'global',
        associatedServerName: 'Global / Default',
        definedInFile: 'Standard Default',
        exists: true,
        isReadable: true,
        sizeBytes: 0,
        sizeHuman: '0 B',
      },
      {
        id: 'var_log_nginx_error_log',
        filePath: '/var/log/nginx/error.log',
        type: 'error',
        scope: 'global',
        associatedServerName: 'Global / Default',
        definedInFile: 'Standard Default',
        exists: true,
        isReadable: true,
        sizeBytes: 0,
        sizeHuman: '0 B',
      },
    ],
    warnings: ['Fallback to standard log paths due to command execution limits.'],
  };
}

/**
 * Streams, parses, filters, and computes live statistics for a specific Nginx log file.
 */
export async function streamNginxLogFile(
  server: RemoteServer,
  params: {
    filePath: string;
    lines?: number;
    search?: string;
    statusCode?: string;
    level?: string;
  },
  ephemeralPassword?: string
): Promise<NginxLogStreamResponse> {
  const { filePath, lines = 100, search = '', statusCode = '', level = '' } = params;

  // Security: prevent path traversal or reading sensitive non-log files
  const cleanPath = filePath.trim();
  if (
    cleanPath.includes('..') ||
    cleanPath.includes('/etc/shadow') ||
    cleanPath.includes('/etc/passwd') ||
    cleanPath.includes('.ssh') ||
    cleanPath.includes('.env')
  ) {
    throw new Error('Access denied: Unauthorized file path requested.');
  }

  const safeLines = Math.min(Math.max(lines, 10), 1000);
  const safeSearch = sanitizeArg(search);
  const safeStatus = sanitizeArg(statusCode);
  const safeLevel = sanitizeArg(level);

  const pythonCmd = PYTHON_LOG_READER(
    cleanPath,
    safeLines,
    safeSearch,
    safeStatus,
    safeLevel
  );

  try {
    const rawOut = await runAdaptiveSshCommand(server, pythonCmd, ephemeralPassword, 15000);
    if (rawOut.includes('===JSON_START===') && rawOut.includes('===JSON_END===')) {
      const jsonStr = rawOut.split('===JSON_START===')[1].split('===JSON_END===')[0].trim();
      const parsed = JSON.parse(jsonStr);
      if (parsed.error) {
        throw new Error(parsed.error);
      }
      return parsed;
    }
  } catch (err: any) {
    console.warn(`[NginxLogManager] Python log stream failed on ${server.id}:`, err?.message || err);
    throw err;
  }

  throw new Error('Failed to retrieve log stream output from remote host.');
}
