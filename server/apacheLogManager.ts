import { RemoteServer } from '../src/types';
import { runAdaptiveSshCommand } from './linuxServerMonitor';
import { discoverApacheInstallation } from './apacheDiscovery';
import {
  ApacheDiscoveredLogFile,
  ApacheLogsDiscoverySummary,
  ApacheLogStreamResponse,
  ApacheParsedAccessLogEntry,
  ApacheParsedErrorLogEntry,
  ApacheLogEntry,
} from '../src/types';

/**
 * Sanitize shell arguments to prevent command injection
 */
function sanitizeArg(val: string): string {
  return val.replace(/[^a-zA-Z0-9_\-\.\:\/\s]/g, '');
}

/**
 * Python script to scan Apache configuration files, extract all
 * active CustomLog, TransferLog, and ErrorLog directives (with their VirtualHost contexts),
 * resolve Apache environment variables (${APACHE_LOG_DIR}, ServerRoot), verify file presence
 * on the filesystem, calculate sizes, and list them safely.
 */
const PYTHON_APACHE_LOGS_DISCOVERY = (confPath: string, serverRoot: string) => `python3 - << 'PYEOF'
import sys, os, re, json, glob, datetime

main_conf = '''${confPath}'''
server_root = '''${serverRoot}'''

discovered_files = {} # path -> dict
warnings = []
env_vars = {}

# 1. Parse /etc/apache2/envvars or other standard environment files if present
envvars_candidates = [
    '/etc/apache2/envvars',
    os.path.join(server_root, 'envvars'),
    '/usr/local/apache2/bin/envvars'
]

for ev_path in envvars_candidates:
    if os.path.exists(ev_path):
        try:
            with open(ev_path, 'r', encoding='utf-8', errors='ignore') as f:
                for line in f:
                    line = line.strip()
                    if line.startswith('export '):
                        eq_idx = line.find('=')
                        if eq_idx != -1:
                            var_name = line[7:eq_idx].strip()
                            var_val = line[eq_idx+1:].strip().strip("'\\"")
                            # If references other variables like $SUFFIX, strip or evaluate
                            var_val = re.sub(r'\\$[A-Za-z0-9_]+', '', var_val)
                            env_vars[var_name] = var_val
        except Exception as e:
            warnings.append(f"Failed to parse envvars: {str(e)}")

# Fallbacks for standard Apache log directories if not found in envvars
if 'APACHE_LOG_DIR' not in env_vars:
    if os.path.exists('/var/log/apache2'):
        env_vars['APACHE_LOG_DIR'] = '/var/log/apache2'
    elif os.path.exists('/var/log/httpd'):
        env_vars['APACHE_LOG_DIR'] = '/var/log/httpd'
    else:
        env_vars['APACHE_LOG_DIR'] = os.path.join(server_root, 'logs')

if 'APACHE_RUN_DIR' not in env_vars:
    env_vars['APACHE_RUN_DIR'] = '/var/run/apache2' if os.path.exists('/var/run/apache2') else '/var/run/httpd'

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

def expand_apache_vars(path_str):
    if not path_str:
        return ""
    for k, v in env_vars.items():
        var_pattern1 = "${" + k + "}"
        var_pattern2 = "$" + k
        path_str = path_str.replace(var_pattern1, v)
        path_str = path_str.replace(var_pattern2, v)
    return path_str

def resolve_apache_path(target_path):
    target_path = expand_apache_vars(strip_quotes(target_path))
    if not target_path:
        return ""
    if target_path.startswith('|') or target_path.lower().startswith('syslog'):
        return target_path
    if os.path.isabs(target_path):
        return os.path.normpath(target_path)
    return os.path.normpath(os.path.join(server_root, target_path))

def inspect_file(raw_filepath, log_type, scope, server_name=None, vhost_id=None, defined_in=None, log_format=None, log_level=None):
    if not raw_filepath:
        return

    is_piped = False
    piped_cmd = None
    cleaned_path = strip_quotes(raw_filepath)

    if cleaned_path.startswith('|'):
        is_piped = True
        piped_cmd = cleaned_path[1:].strip()
        # Try finding the target file inside the piped command (e.g. rotatelogs /var/log/httpd/access_log ...)
        pipe_parts = piped_cmd.split()
        potential_path = None
        for part in pipe_parts[1:]:
            if '/' in part and not part.startswith('-'):
                # Strip date formatting wildcards like %Y-%m-%d
                cleaned_pipe_file = re.sub(r'%[a-zA-Z]', '', part).rstrip('.')
                if cleaned_pipe_file:
                    potential_path = cleaned_pipe_file
                    break
        norm_path = potential_path or f"piped:{piped_cmd[:40]}"
    else:
        norm_path = resolve_apache_path(cleaned_path)

    if not norm_path:
        return

    if norm_path in discovered_files:
        existing = discovered_files[norm_path]
        if server_name and not existing.get('associatedServerName'):
            existing['associatedServerName'] = server_name
        if vhost_id and not existing.get('associatedVHostId'):
            existing['associatedVHostId'] = vhost_id
        return

    exists = False
    is_readable = False
    size_bytes = 0
    size_human = "0 B"
    last_mod = None
    line_count = None

    if not is_piped and os.path.exists(norm_path):
        exists = True
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
        "associatedServerName": server_name or ("Global / ServerRoot" if scope == 'global' else None),
        "associatedVHostId": vhost_id,
        "definedInFile": defined_in or "Apache Defaults",
        "exists": exists,
        "isReadable": is_readable,
        "sizeBytes": size_bytes,
        "sizeHuman": size_human,
        "lastModified": last_mod,
        "format": log_format,
        "logLevel": log_level,
        "isPiped": is_piped,
        "pipedCommand": piped_cmd
    }

# 2. Check well-known distribution default log locations
default_candidates = [
    # Debian / Ubuntu
    ('/var/log/apache2/access.log', 'access', 'global', 'Global / Default', 'System Default (Debian/Ubuntu)'),
    ('/var/log/apache2/error.log', 'error', 'global', 'Global / Default', 'System Default (Debian/Ubuntu)'),
    ('/var/log/apache2/other_vhosts_access.log', 'access', 'global', 'Global / VHosts', 'System Default (Debian/Ubuntu)'),
    # RHEL / CentOS / Rocky / Alma / Fedora
    ('/var/log/httpd/access_log', 'access', 'global', 'Global / Default', 'System Default (RHEL/Rocky)'),
    ('/var/log/httpd/error_log', 'error', 'global', 'Global / Default', 'System Default (RHEL/Rocky)'),
    ('/var/log/httpd/ssl_access_log', 'access', 'global', 'Global / SSL Default', 'System Default (RHEL/Rocky)'),
    ('/var/log/httpd/ssl_error_log', 'error', 'global', 'Global / SSL Default', 'System Default (RHEL/Rocky)'),
    # Alpine / Custom ServerRoot
    (os.path.join(server_root, 'logs/access_log'), 'access', 'global', 'Global / ServerRoot', 'ServerRoot Default'),
    (os.path.join(server_root, 'logs/error_log'), 'error', 'global', 'Global / ServerRoot', 'ServerRoot Default'),
    (os.path.join(server_root, 'logs/access.log'), 'access', 'global', 'Global / ServerRoot', 'ServerRoot Default'),
    (os.path.join(server_root, 'logs/error.log'), 'error', 'global', 'Global / ServerRoot', 'ServerRoot Default'),
]

for path_cand, l_type, l_scope, s_name, def_in in default_candidates:
    if os.path.exists(path_cand):
        inspect_file(path_cand, l_type, l_scope, server_name=s_name, defined_in=def_in)

# 3. Recursively scan Apache configuration files starting from main_conf
files_to_scan = []
visited_files = set()

def scan_includes(fp):
    if not fp or fp in visited_files:
        return
    visited_files.add(fp)

    resolved_fp = resolve_apache_path(fp)
    if not os.path.exists(resolved_fp):
        return

    files_to_scan.append(resolved_fp)
    try:
        with open(resolved_fp, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
    except Exception as e:
        warnings.append(f"Cannot read config {resolved_fp}: {str(e)}")
        return

    # Look for Include and IncludeOptional
    for m in re.finditer(r'^[ \\t]*(?:Include|IncludeOptional)[ \\t]+([^\\r\\n#]+)', content, re.MULTILINE | re.IGNORECASE):
        inc_target = strip_quotes(m.group(1))
        expanded_target = expand_apache_vars(inc_target)
        if not os.path.isabs(expanded_target):
            full_inc = os.path.normpath(os.path.join(server_root, expanded_target))
        else:
            full_inc = os.path.normpath(expanded_target)

        # Handle globs
        if any(c in full_inc for c in ['*', '?', '[']):
            for match in glob.glob(full_inc):
                if os.path.isfile(match):
                    scan_includes(match)
        elif os.path.isdir(full_inc):
            for root, dirs, fnames in os.walk(full_inc):
                dirs[:] = [d for d in dirs if not d.startswith('.')]
                for fname in sorted(fnames):
                    if not fname.startswith('.'):
                        scan_includes(os.path.join(root, fname))
        elif os.path.isfile(full_inc):
            scan_includes(full_inc)

if main_conf and os.path.exists(main_conf):
    scan_includes(main_conf)

# 4. Parse scanned config files for ErrorLog, CustomLog, TransferLog, and LogLevel
for conf_file in files_to_scan:
    try:
        with open(conf_file, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
    except Exception:
        continue

    # Strip pure comment lines for clean tokenization
    clean_lines = []
    for line in content.splitlines():
        clean_lines.append(re.sub(r'#.*$', '', line))
    clean_content = "\\n".join(clean_lines)

    # 4a. Find all <VirtualHost ...> blocks
    vhost_matches = list(re.finditer(r'<VirtualHost\\s+([^>]+)>(.*?)</VirtualHost>', clean_content, re.DOTALL | re.IGNORECASE))
    
    # Track positions of VirtualHosts to exclude global matches
    vhost_spans = [m.span() for m in vhost_matches]

    def is_inside_vhost(pos):
        for s, e in vhost_spans:
            if s <= pos < e:
                return True
        return False

    # Process VirtualHosts
    for vm in vhost_matches:
        vhost_header = vm.group(1).strip()
        vhost_body = vm.group(2)

        # Extract ServerName
        sn_match = re.search(r'^[ \\t]*ServerName[ \\t]+([^\\r\\n]+)', vhost_body, re.MULTILINE | re.IGNORECASE)
        s_name = strip_quotes(sn_match.group(1)) if sn_match else vhost_header.split()[0]
        vhost_id = f"{s_name}_{vhost_header}"

        # VirtualHost ErrorLog
        for em in re.finditer(r'^[ \\t]*ErrorLog[ \\t]+([^\\r\\n]+)', vhost_body, re.MULTILINE | re.IGNORECASE):
            raw_target = strip_quotes(em.group(1))
            if raw_target:
                inspect_file(raw_target, 'error', 'virtualhost', server_name=s_name, vhost_id=vhost_id, defined_in=conf_file)

        # VirtualHost CustomLog / TransferLog
        for cm in re.finditer(r'^[ \\t]*CustomLog[ \\t]+([^\\s]+)(?:[ \\t]+([^\\r\\n]+))?', vhost_body, re.MULTILINE | re.IGNORECASE):
            raw_target = strip_quotes(cm.group(1))
            fmt = strip_quotes(cm.group(2)) if cm.group(2) else 'combined'
            if raw_target:
                inspect_file(raw_target, 'access', 'virtualhost', server_name=s_name, vhost_id=vhost_id, defined_in=conf_file, log_format=fmt)

        for tm in re.finditer(r'^[ \\t]*TransferLog[ \\t]+([^\\r\\n]+)', vhost_body, re.MULTILINE | re.IGNORECASE):
            raw_target = strip_quotes(tm.group(1))
            if raw_target:
                inspect_file(raw_target, 'access', 'virtualhost', server_name=s_name, vhost_id=vhost_id, defined_in=conf_file, log_format='common')

    # 4b. Global scope ErrorLog
    for em in re.finditer(r'^[ \\t]*ErrorLog[ \\t]+([^\\r\\n]+)', clean_content, re.MULTILINE | re.IGNORECASE):
        if not is_inside_vhost(em.start()):
            raw_target = strip_quotes(em.group(1))
            if raw_target:
                inspect_file(raw_target, 'error', 'global', server_name='Global / ServerRoot', defined_in=conf_file)

    # 4c. Global scope CustomLog & TransferLog
    for cm in re.finditer(r'^[ \\t]*CustomLog[ \\t]+([^\\s]+)(?:[ \\t]+([^\\r\\n]+))?', clean_content, re.MULTILINE | re.IGNORECASE):
        if not is_inside_vhost(cm.start()):
            raw_target = strip_quotes(cm.group(1))
            fmt = strip_quotes(cm.group(2)) if cm.group(2) else 'combined'
            if raw_target:
                inspect_file(raw_target, 'access', 'global', server_name='Global / ServerRoot', defined_in=conf_file, log_format=fmt)

    for tm in re.finditer(r'^[ \\t]*TransferLog[ \\t]+([^\\r\\n]+)', clean_content, re.MULTILINE | re.IGNORECASE):
        if not is_inside_vhost(tm.start()):
            raw_target = strip_quotes(tm.group(1))
            if raw_target:
                inspect_file(raw_target, 'access', 'global', server_name='Global / ServerRoot', defined_in=conf_file, log_format='common')

# 5. Check if standard log directories have additional active log files (.log, _log)
search_dirs = [env_vars.get('APACHE_LOG_DIR'), '/var/log/apache2', '/var/log/httpd', os.path.join(server_root, 'logs')]
for s_dir in search_dirs:
    if s_dir and os.path.isdir(s_dir):
        try:
            for entry in os.listdir(s_dir):
                if entry.endswith('.log') or entry.endswith('_log'):
                    # Skip old compressed archives like .log.1.gz
                    if any(entry.endswith(ext) for ext in ['.gz', '.xz', '.zip', '.tar', '.1', '.2', '.3', '.4', '.5', '.old', '.bak']):
                        continue
                    full_p = os.path.join(s_dir, entry)
                    if os.path.isfile(full_p) and full_p not in discovered_files:
                        l_type = 'error' if 'error' in entry.lower() else 'access'
                        inspect_file(full_p, l_type, 'global', server_name='Auto-Discovered Log Directory', defined_in=s_dir)
        except Exception:
            pass

files_list = list(discovered_files.values())
access_count = sum(1 for f in files_list if f['type'] == 'access')
error_count = sum(1 for f in files_list if f['type'] == 'error')

output = {
    "totalLogFiles": len(files_list),
    "accessLogFilesCount": access_count,
    "errorLogFilesCount": error_count,
    "availableLogFiles": files_list,
    "warnings": warnings,
    "envVars": env_vars
}

print("===APACHE_LOGS_JSON_START===")
print(json.dumps(output))
print("===APACHE_LOGS_JSON_END===")
PYEOF
`;

/**
 * High performance Python log reader, parser, and real-time statistics aggregator for Apache HTTP Server.
 * Tail-reads the last N lines, extracts fields accurately, performs server-side filtering,
 * and compiles distribution metrics.
 */
const PYTHON_APACHE_LOG_READER = (
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
    print("===APACHE_LOG_STREAM_JSON_START===")
    print(json.dumps({"error": f"Log file does not exist: {target_path}", "exists": False}))
    print("===APACHE_LOG_STREAM_JSON_END===")
    sys.exit(0)

if not os.access(target_path, os.R_OK):
    print("===APACHE_LOG_STREAM_JSON_START===")
    print(json.dumps({"error": f"Permission denied reading log file: {target_path}", "exists": True, "readable": False}))
    print("===APACHE_LOG_STREAM_JSON_END===")
    sys.exit(0)

st = os.stat(target_path)
size_bytes = st.st_size
last_mod = datetime.datetime.fromtimestamp(st.st_mtime).isoformat()

def format_size(bytes_val):
    if bytes_val < 1024:
        return f"{bytes_val} B"
    elif bytes_val < 1024 * 1024:
        return f"{bytes_val / 1024:.1f} KB"
    elif bytes_val < 1024 * 1024 * 1024:
        return f"{bytes_val / (1024 * 1024):.1f} MB"
    else:
        return f"{bytes_val / (1024 * 1024 * 1024):.2f} GB"

size_human = format_size(size_bytes)

# Read backwards efficiently
lines_to_fetch = max_lines * 4
raw_lines = []

try:
    with open(target_path, 'rb') as f:
        if size_bytes < 2 * 1024 * 1024:
            content = f.read().decode('utf-8', errors='replace')
            raw_lines = content.splitlines()[-lines_to_fetch:]
        else:
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
except Exception:
    raw_lines = []

is_error_log = "error" in target_path.lower()
parsed_entries = []

# Regex patterns for Apache HTTP Server
# 1. Combined / CLF / vhost_combined:
# Format: [vhost:port] ip - user [time] "METHOD uri HTTP/1.x" status bytes "referer" "user-agent"
COMBINED_RE = re.compile(
    r'^(?:(\\S+:\\d+)\\s+)?(\\S+)\\s+(\\S+)\\s+(\\S+)\\s+\\[(.*?)\\]\\s+"([A-Z]+)\\s+(.*?)(?:\\s+(HTTP\\/[0-9\\.]+))?"\\s+(\\d{3})\\s+(\\d+|-)(?:\\s+"(.*?)"\\s+"(.*?)")?'
)

# 2. Apache 2.4 Error Log format:
# [Fri Sep 25 15:30:00.123456 2026] [module:level] [pid 12345:tid 139876543210] [client 192.168.1.100:54321] AH00020: message
APACHE24_ERROR_RE = re.compile(
    r'^\\[(.*?)\\]\\s+\\[(?:([a-zA-Z0-9_]+):)?([a-zA-Z0-9_]+)\\]\\s+\\[pid\\s+(\\d+)(?::tid\\s+([a-zA-Z0-9_]+))?\\](?:\\s+\\[client\\s+([^:\\]]+)(?::(\\d+))?\\])?\\s+(?:(AH\\d{5}):\\s+)?(.*)$'
)

# 3. Apache 2.2 Error Log format:
# [Fri Sep 25 15:30:00 2026] [error] [client 192.168.1.100] message
APACHE22_ERROR_RE = re.compile(
    r'^\\[(.*?)\\]\\s+\\[([a-zA-Z0-9_]+)\\](?:\\s+\\[client\\s+([^:\\]]+)(?::(\\d+))?\\])?\\s+(.*)$'
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
module_counter = Counter()
error_code_counter = Counter()

raw_lines.reverse()

for idx, line in enumerate(raw_lines):
    line_str = line.strip()
    if not line_str:
        continue

    if search_query and search_query not in line_str.lower():
        continue

    entry_id = f"apache-entry-{idx}"

    # Try parsing access log if not strictly an error log
    if not is_error_log:
        m = COMBINED_RE.match(line_str)
        if m:
            vhost_prefix = m.group(1)
            c_ip = m.group(2)
            ident_user = m.group(3) if m.group(3) != '-' else None
            auth_user = m.group(4) if m.group(4) != '-' else None
            t_stamp = m.group(5)
            method = m.group(6)
            uri = m.group(7)
            proto = m.group(8) or "HTTP/1.1"
            status_code = int(m.group(9))
            b_sent = int(m.group(10)) if m.group(10) and m.group(10) != '-' else 0
            referer = m.group(11) or ""
            user_agent = m.group(12) or ""

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

            if status_filter:
                if status_filter in ['2xx', '3xx', '4xx', '5xx']:
                    if cat != status_filter:
                        continue
                else:
                    if str(status_code) != status_filter:
                        continue

            ip_counter[c_ip] += 1
            clean_uri = uri.split('?')[0] if '?' in uri else uri
            uri_counter[clean_uri] += 1
            status_counter[status_code] += 1

            parsed_entries.append({
                "id": entry_id,
                "raw": line_str,
                "type": "access",
                "clientIp": c_ip,
                "remoteUser": auth_user,
                "timestamp": t_stamp,
                "method": method,
                "uri": uri,
                "protocol": proto,
                "statusCode": status_code,
                "statusCategory": cat,
                "bytesSent": b_sent,
                "referer": referer,
                "userAgent": user_agent,
                "virtualHost": vhost_prefix
            })
            if len(parsed_entries) >= max_lines:
                break
            continue

    # Try Apache 2.4 Error Log format
    em24 = APACHE24_ERROR_RE.match(line_str)
    if em24:
        t_stamp = em24.group(1)
        mod_name = em24.group(2) or "core"
        lvl_name = (em24.group(3) or "error").lower()
        pid_val = int(em24.group(4)) if em24.group(4) else None
        tid_val = em24.group(5)
        c_ip = em24.group(6)
        c_port = int(em24.group(7)) if em24.group(7) else None
        ah_code = em24.group(8)
        msg_text = em24.group(9)

        if lvl_name in ['error', 'crit', 'alert', 'emerg']:
            count_errors += 1
        elif lvl_name in ['warn', 'warning']:
            count_warns += 1

        if level_filter and lvl_name != level_filter:
            continue

        if c_ip:
            ip_counter[c_ip] += 1
        if mod_name:
            module_counter[mod_name] += 1
        if ah_code:
            error_code_counter[ah_code] += 1

        parsed_entries.append({
            "id": entry_id,
            "raw": line_str,
            "type": "error",
            "timestamp": t_stamp,
            "module": mod_name,
            "level": lvl_name,
            "pid": pid_val,
            "tid": tid_val,
            "clientIp": c_ip,
            "clientPort": c_port,
            "errorCode": ah_code,
            "message": msg_text
        })
        if len(parsed_entries) >= max_lines:
            break
        continue

    # Try Apache 2.2 Error Log format
    em22 = APACHE22_ERROR_RE.match(line_str)
    if em22:
        t_stamp = em22.group(1)
        lvl_name = (em22.group(2) or "error").lower()
        c_ip = em22.group(3)
        c_port = int(em22.group(4)) if em22.group(4) else None
        msg_text = em22.group(5)

        if lvl_name in ['error', 'crit', 'alert', 'emerg']:
            count_errors += 1
        elif lvl_name in ['warn', 'warning']:
            count_warns += 1

        if level_filter and lvl_name != level_filter:
            continue

        if c_ip:
            ip_counter[c_ip] += 1

        parsed_entries.append({
            "id": entry_id,
            "raw": line_str,
            "type": "error",
            "timestamp": t_stamp,
            "module": "core",
            "level": lvl_name,
            "clientIp": c_ip,
            "clientPort": c_port,
            "message": msg_text
        })
        if len(parsed_entries) >= max_lines:
            break
        continue

    # Generic unparsed line fallback
    quick_status = None
    st_match = re.search(r'\\s(200|201|204|301|302|304|400|401|403|404|405|500|502|503|504)\\s', line_str)
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
top_modules = [{"module": mod, "count": cnt} for mod, cnt in module_counter.most_common(5)]
top_error_codes = [{"code": code, "count": cnt} for code, cnt in error_code_counter.most_common(5)]

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
        "topStatusCodes": top_status,
        "topErrorModules": top_modules,
        "topErrorCodes": top_error_codes
    },
    "fileMetadata": {
        "exists": True,
        "sizeBytes": size_bytes,
        "sizeHuman": size_human,
        "lastModified": last_mod
    }
}

print("===APACHE_LOG_STREAM_JSON_START===")
print(json.dumps(result))
print("===APACHE_LOG_STREAM_JSON_END===")
PYEOF
`;

/**
 * Discovers all active Apache log files configured in the server's VirtualHosts and global settings.
 */
export async function discoverApacheLogFiles(
  server: RemoteServer,
  ephemeralPassword?: string
): Promise<ApacheLogsDiscoverySummary> {
  const installation = await discoverApacheInstallation(server, ephemeralPassword);
  if (!installation.isInstalled) {
    throw new Error('Apache HTTP Server is not installed or detected on this server.');
  }

  const confPath = installation.confPath || '/etc/apache2/apache2.conf';
  const serverRoot = installation.serverRoot || '/etc/apache2';

  const script = PYTHON_APACHE_LOGS_DISCOVERY(confPath, serverRoot);
  const rawOutput = await runAdaptiveSshCommand(server, script, ephemeralPassword, 15000);

  const match = rawOutput.match(/===APACHE_LOGS_JSON_START===([\s\S]*?)===APACHE_LOGS_JSON_END===/);
  if (!match) {
    throw new Error('Invalid JSON payload returned from Apache log discovery engine');
  }

  try {
    const parsed = JSON.parse(match[1].trim());
    return parsed as ApacheLogsDiscoverySummary;
  } catch (err: any) {
    throw new Error(`Failed to parse Apache logs discovery output: ${err?.message || err}`);
  }
}

/**
 * Streams, parses, filters, and computes real-time statistics for a specific Apache log file.
 */
export async function streamApacheLogFile(
  server: RemoteServer,
  params: {
    filePath: string;
    lines?: number;
    search?: string;
    statusCode?: string;
    level?: string;
  },
  ephemeralPassword?: string
): Promise<ApacheLogStreamResponse> {
  const filePath = sanitizeArg(params.filePath);
  const lines = Math.min(Math.max(params.lines || 100, 10), 2000);
  const search = (params.search || '').replace(/['"\\]/g, '');
  const statusCode = (params.statusCode || '').replace(/['"\\]/g, '');
  const level = (params.level || '').replace(/['"\\]/g, '');

  const script = PYTHON_APACHE_LOG_READER(filePath, lines, search, statusCode, level);
  const rawOutput = await runAdaptiveSshCommand(server, script, ephemeralPassword, 15000);

  const match = rawOutput.match(/===APACHE_LOG_STREAM_JSON_START===([\s\S]*?)===APACHE_LOG_STREAM_JSON_END===/);
  if (!match) {
    throw new Error(`Invalid output or failed to read log file: ${filePath}`);
  }

  try {
    const parsed = JSON.parse(match[1].trim());
    if (parsed.error) {
      throw new Error(parsed.error);
    }
    return parsed as ApacheLogStreamResponse;
  } catch (err: any) {
    throw new Error(`Failed to parse Apache log stream output: ${err?.message || err}`);
  }
}
