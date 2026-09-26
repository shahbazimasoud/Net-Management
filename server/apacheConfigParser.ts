import { RemoteServer, ApacheConfigFileNode, ApacheConfigTopologyTree } from '../src/types';
import { runAdaptiveSshCommand } from './linuxServerMonitor';
import { discoverApacheInstallation, isLikelyApacheBinary } from './apacheDiscovery';

/**
 * Shell helper script using python3 to deeply and accurately scan Apache's Include tree.
 * In Apache HTTP Server, relative Include and IncludeOptional paths are ALWAYS relative to ServerRoot.
 * Also handles directory inclusions (e.g. Include sites-enabled/) and wildcards (e.g. Include conf.d/*.conf).
 */
const PYTHON_APACHE_SCANNER = (confPath: string, serverRoot: string) => `python3 - << 'PYEOF'
import sys, os, glob, re, json, stat

main_conf = "${confPath}"
server_root = "${serverRoot}"

visited = set()
results = []
warnings = []
all_listen_ports = set()

def resolve_apache_path(inc_target):
    inc_target = inc_target.strip().strip("'\\"")
    if not inc_target:
        return []
    
    # In Apache, relative includes are relative to ServerRoot
    if os.path.isabs(inc_target):
        base_path = inc_target
    else:
        base_path = os.path.normpath(os.path.join(server_root, inc_target))

    # If glob characters present
    if any(c in base_path for c in ['*', '?', '[']):
        matched = glob.glob(base_path)
        # Sort matched for deterministic order
        return sorted([m for m in matched if os.path.isfile(m)])

    # If it is an existing directory, include all files inside
    if os.path.isdir(base_path):
        sub_files = []
        for root, dirs, files in os.walk(base_path):
            # Do not traverse hidden dirs
            dirs[:] = [d for d in dirs if not d.startswith('.')]
            for f in sorted(files):
                if not f.startswith('.'):
                    sub_files.append(os.path.join(root, f))
        return sub_files

    # If it is a file
    if os.path.isfile(base_path):
        return [base_path]

    return [base_path]

def count_apache_directives(content):
    # Strip comments (# ...)
    clean_lines = []
    for line in content.splitlines():
        # Remove comment part
        cleaned = re.sub(r'#.*$', '', line).strip()
        if cleaned:
            clean_lines.append(cleaned)
    text = '\\n'.join(clean_lines)

    vhosts_count = len(re.findall(r'<VirtualHost\\b', text, re.IGNORECASE))
    directories_count = len(re.findall(r'<Directory\\b', text, re.IGNORECASE))
    locations_count = len(re.findall(r'<Location\\b', text, re.IGNORECASE))
    proxy_pass_count = len(re.findall(r'\\bProxyPass\\b', text, re.IGNORECASE))
    ssl_enabled = bool(re.search(r'\\bSSLEngine\\s+on\\b|\\bSSLCertificateFile\\b', text, re.IGNORECASE))
    has_custom_log = bool(re.search(r'\\bCustomLog\\b', text, re.IGNORECASE))
    has_error_log = bool(re.search(r'\\bErrorLog\\b', text, re.IGNORECASE))
    load_modules_count = len(re.findall(r'\\bLoadModule\\b', text, re.IGNORECASE))

    # Listen ports (e.g. Listen 80, Listen 443, Listen 0.0.0.0:8080)
    listens = re.findall(r'\\bListen\\s+(?:[0-9a-zA-Z\\.\\_\\[\\]\\:]+:)?(\\d+)', text, re.IGNORECASE)
    for p in listens:
        try:
            p_int = int(p)
            if 1 <= p_int <= 65535:
                all_listen_ports.add(p_int)
        except:
            pass

    # Extract all Include and IncludeOptional paths
    include_matches = []
    inc_pattern = re.compile(r'\\b(?:Include|IncludeOptional)\\s+([^\\r\\n]+)', re.IGNORECASE)
    for match in inc_pattern.finditer(text):
        target = match.group(1).strip().strip("'\\"")
        if target:
            include_matches.append(target)

    return {
        "vhosts": vhosts_count,
        "directories": directories_count,
        "locations": locations_count,
        "proxy_passes": proxy_pass_count,
        "ssl_enabled": ssl_enabled,
        "has_custom_log": has_custom_log,
        "has_error_log": has_error_log,
        "load_modules": load_modules_count,
        "includes": include_matches
    }

def scan_file(fpath, parent="ROOT", level=0):
    norm = os.path.normpath(fpath)
    if norm in visited:
        return
    visited.add(norm)

    if not os.path.exists(norm):
        warnings.append(f"Referenced config file not found: {norm}")
        return

    try:
        st = os.stat(norm)
        size_bytes = st.st_size
        perms = oct(stat.S_IMODE(st.st_mode))
        try:
            import pwd
            owner = pwd.getpwuid(st.st_uid).pw_name
        except:
            owner = str(st.st_uid)
    except Exception as e:
        warnings.append(f"Cannot stat {norm}: {str(e)}")
        size_bytes = 0
        perms = "unknown"
        owner = "unknown"

    try:
        with open(norm, 'r', encoding='utf-8', errors='replace') as fp:
            content = fp.read()
    except Exception as e:
        content = ""
        warnings.append(f"Cannot read {norm}: {str(e)}")

    lines = content.splitlines()
    analysis = count_apache_directives(content)

    snippet = '\\n'.join(lines[:45])
    rel_path = os.path.relpath(norm, server_root) if norm.startswith(server_root) else norm

    node = {
        "filePath": norm,
        "relativePath": rel_path,
        "sizeBytes": size_bytes,
        "lineCount": len(lines),
        "permissions": str(perms),
        "owner": owner,
        "includedFrom": parent if parent != "ROOT" else None,
        "level": level,
        "includesCount": len(analysis["includes"]),
        "virtualHostsCount": analysis["vhosts"],
        "directoriesCount": analysis["directories"],
        "locationsCount": analysis["locations"],
        "proxyPassCount": analysis["proxy_passes"],
        "sslEnabled": analysis["ssl_enabled"],
        "hasCustomLog": analysis["has_custom_log"],
        "hasErrorLog": analysis["has_error_log"],
        "loadModulesCount": analysis["load_modules"],
        "contentSnippet": snippet,
        "fullContent": content if len(content) < 80000 else None
    }
    results.append(node)

    # Recurse through resolved includes
    for raw_inc in analysis["includes"]:
        resolved_files = resolve_apache_path(raw_inc)
        for r_file in resolved_files:
            scan_file(r_file, norm, level + 1)

try:
    if os.path.exists(main_conf):
        scan_file(main_conf, "ROOT", 0)
    else:
        warnings.append(f"Main Apache configuration file does not exist: {main_conf}")
except Exception as e:
    warnings.append(f"Scanner exception: {str(e)}")

out_obj = {
    "mainConfigPath": main_conf,
    "serverRoot": server_root,
    "totalFiles": len(results),
    "totalLines": sum(n["lineCount"] for n in results),
    "files": results,
    "detectedContexts": {
        "totalVirtualHosts": sum(n["virtualHostsCount"] for n in results),
        "totalDirectories": sum(n["directoriesCount"] for n in results),
        "totalLocations": sum(n["locationsCount"] for n in results),
        "totalProxyDirectives": sum(n["proxyPassCount"] for n in results),
        "totalSslBlocks": sum(1 for n in results if n["sslEnabled"]),
        "totalLoadedModules": sum(n["loadModulesCount"] for n in results),
        "listenPorts": sorted(list(all_listen_ports))
    },
    "warnings": warnings
}

print("JSON_START:::" + json.dumps(out_obj) + ":::JSON_END")
PYEOF
`;

/**
 * Pure bash fallback scanner when python3 is unavailable on the remote Linux host.
 */
const BASH_APACHE_SCANNER = (confPath: string, serverRoot: string) => `export LC_ALL=C
MAIN_CONF="${confPath}"
SERVER_ROOT="${serverRoot}"

visited_files=()

resolve_path() {
  local p="$1"
  if [[ "$p" = /* ]]; then
    echo "$p"
  else
    echo "$SERVER_ROOT/$p"
  fi
}

scan_file() {
  local f="$1"
  local parent="$2"
  local lvl="$3"

  if [ ! -f "$f" ]; then
    return
  fi

  for v in "\${visited_files[@]}"; do
    if [ "$v" = "$f" ]; then
      return
    fi
  done
  visited_files+=("$f")

  echo "FILE_ENTRY:::$f:::$parent:::$lvl"
  ls -ld "$f" 2>/dev/null || true
  wc -l < "$f" 2>/dev/null || echo "0"
  
  # Parse Include and IncludeOptional lines
  grep -iE "^[[:space:]]*(Include|IncludeOptional)[[:space:]]+" "$f" 2>/dev/null | while read -r line; do
    inc=$(echo "$line" | sed -E 's/^[[:space:]]*(Include|IncludeOptional)[[:space:]]+//i' | tr -d "\\"'")
    inc_resolved=$(resolve_path "$inc")
    for matched in $inc_resolved; do
      if [ -f "$matched" ]; then
        scan_file "$matched" "$f" $((lvl + 1))
      fi
    done
  done
}

scan_file "$MAIN_CONF" "ROOT" 0
`;

/**
 * Discovers and builds the complete Apache configuration topology graph.
 */
export async function discoverApacheConfigTopology(
  server: RemoteServer,
  ephemeralPassword?: string,
  targetConfPath?: string,
  targetServerRoot?: string
): Promise<ApacheConfigTopologyTree> {
  // If confPath or serverRoot are not supplied, resolve via discoverApacheInstallation
  let confPath = targetConfPath;
  let serverRoot = targetServerRoot;

  if (!confPath || !serverRoot) {
    const discovery = await discoverApacheInstallation(server, ephemeralPassword);
    if (!confPath) {
      confPath = discovery.confPath || (discovery.serverRoot ? `${discovery.serverRoot}/apache2.conf` : '/etc/apache2/apache2.conf');
    }
    if (!serverRoot) {
      serverRoot = discovery.serverRoot || (confPath.includes('/httpd') ? '/etc/httpd' : '/etc/apache2');
    }
  }

  // 1. Attempt Python-based high-fidelity AST scanner
  try {
    const pyScript = PYTHON_APACHE_SCANNER(confPath, serverRoot);
    const rawOutput = await runAdaptiveSshCommand(server, pyScript, ephemeralPassword, 15000);

    if (rawOutput.includes('JSON_START:::') && rawOutput.includes(':::JSON_END')) {
      const jsonStr = rawOutput.split('JSON_START:::')[1].split(':::JSON_END')[0].trim();
      const parsed: ApacheConfigTopologyTree = JSON.parse(jsonStr);
      return parsed;
    }
  } catch (err: any) {
    // Continue to Bash fallback
  }

  // 2. Bash fallback scanner
  try {
    const bashScript = BASH_APACHE_SCANNER(confPath, serverRoot);
    const rawBash = await runAdaptiveSshCommand(server, bashScript, ephemeralPassword, 15000);

    const nodes: ApacheConfigFileNode[] = [];
    const chunks = rawBash.split('FILE_ENTRY:::');

    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      const lines = chunk.split('\n');
      const header = lines[0]; // fpath:::parent:::lvl
      const parts = header.split(':::');
      if (parts.length >= 3) {
        const filePath = parts[0].trim();
        const parent = parts[1].trim() === 'ROOT' ? undefined : parts[1].trim();
        const level = parseInt(parts[2].trim(), 10) || 0;

        const statLine = lines[1] || '';
        const lineCount = parseInt(lines[2] || '0', 10) || 0;

        // Extract permissions and owner from ls -ld output
        const statParts = statLine.trim().split(/\s+/);
        const perms = statParts[0] || undefined;
        const owner = statParts[2] || undefined;
        const sizeBytes = parseInt(statParts[4] || '0', 10) || 0;

        const relPath = filePath.startsWith(serverRoot)
          ? filePath.replace(`${serverRoot}/`, '')
          : filePath;

        nodes.push({
          filePath,
          relativePath: relPath,
          sizeBytes,
          lineCount,
          permissions: perms,
          owner,
          includedFrom: parent,
          level,
          includesCount: 0,
          virtualHostsCount: 0,
          directoriesCount: 0,
          locationsCount: 0,
          proxyPassCount: 0,
          sslEnabled: false,
          hasCustomLog: false,
          hasErrorLog: false,
          loadModulesCount: 0,
        });
      }
    }

    return {
      mainConfigPath: confPath,
      serverRoot: serverRoot,
      totalFiles: nodes.length,
      totalLines: nodes.reduce((sum, n) => sum + n.lineCount, 0),
      files: nodes,
      detectedContexts: {
        totalVirtualHosts: 0,
        totalDirectories: 0,
        totalLocations: 0,
        totalProxyDirectives: 0,
        totalSslBlocks: 0,
        totalLoadedModules: 0,
        listenPorts: [80],
      },
      warnings: ['Used shell fallback scanner (python3 not present on host)'],
    };
  } catch (err: any) {
    return {
      mainConfigPath: confPath,
      serverRoot: serverRoot,
      totalFiles: 0,
      totalLines: 0,
      files: [],
      detectedContexts: {
        totalVirtualHosts: 0,
        totalDirectories: 0,
        totalLocations: 0,
        totalProxyDirectives: 0,
        totalSslBlocks: 0,
        totalLoadedModules: 0,
        listenPorts: [],
      },
      warnings: [`Failed to scan Apache configuration topology: ${err?.message || err}`],
    };
  }
}
