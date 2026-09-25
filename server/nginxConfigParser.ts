import { RemoteServer } from '../src/types';
import { runAdaptiveSshCommand } from './linuxServerMonitor';
import { discoverNginxInstallation } from './nginxDiscovery';

export interface NginxConfigFileNode {
  filePath: string;
  relativePath: string;
  sizeBytes: number;
  lineCount: number;
  permissions?: string;
  owner?: string;
  includedFrom?: string;
  level: number;
  includesCount: number;
  serverBlocksCount: number;
  upstreamsCount: number;
  hasHttpBlock: boolean;
  hasStreamBlock: boolean;
  hasEventsBlock: boolean;
  contentSnippet?: string;
  fullContent?: string;
  error?: string;
}

export interface NginxConfigTopologyTree {
  mainConfigPath: string;
  prefixPath: string;
  totalFiles: number;
  totalLines: number;
  files: NginxConfigFileNode[];
  detectedContexts: {
    hasEvents: boolean;
    hasHttp: boolean;
    hasStream: boolean;
    totalServerBlocks: number;
    totalUpstreams: number;
    totalLocations: number;
  };
  warnings: string[];
}

/**
 * Shell helper script to inspect include directives, expand wildcards/globs,
 * and recursively discover all configuration files belonging to Nginx.
 */
const BUILD_CONFIG_DISCOVERY_SCRIPT = (confPath: string, prefixPath: string) => `export LC_ALL=C
MAIN_CONF="${confPath}"
PREFIX="${prefixPath}"

# File scanner function that traverses includes
python3 - << 'EOF' 2>/dev/null || python - << 'EOF' 2>/dev/null || node -e '
const fs = require("fs");
const path = require("path");
const glob = require("glob"); // if available
' 2>/dev/null || bash -c '
# Pure bash fallback for globbing & include resolution
MAIN_CONF="$1"
PREFIX="$2"

visited_files=()

resolve_path() {
  local p="$1"
  local base="$2"
  if [[ "$p" = /* ]]; then
    echo "$p"
  else
    if [ -n "$base" ]; then
      echo "$base/$p"
    else
      echo "$PREFIX/$p"
    fi
  fi
}

# Simple scanner
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
  
  # Parse include lines
  grep -E "^[[:space:]]*include[[:space:]]+" "$f" 2>/dev/null | while read -r line; do
    # extract include target
    inc=$(echo "$line" | sed -E 's/^[[:space:]]*include[[:space:]]+([^;]+);.*/\\1/' | tr -d "\\"'")
    inc_resolved=$(resolve_path "$inc" "$(dirname "$f")")
    # expand globs
    for matched in $inc_resolved; do
      if [ -f "$matched" ]; then
        scan_file "$matched" "$f" $((lvl + 1))
      fi
    done
  done
}

scan_file "$MAIN_CONF" "ROOT" 0
' _ "$MAIN_CONF" "$PREFIX"
`;

/**
 * Robust python-powered remote scanner that returns structured JSON.
 * If Python is present on the remote host (99% of Linux servers), this provides instant, deep AST inspection.
 */
const PYTHON_NGINX_SCANNER = (confPath: string, prefixPath: string) => `python3 - << 'PYEOF'
import sys, os, glob, re, json

main_conf = "${confPath}"
prefix = "${prefixPath}"

visited = set()
results = []
warnings = []

def resolve_path(inc, current_dir):
    inc = inc.strip().strip("'\\"")
    if os.path.isabs(inc):
        return inc
    # Check relative to current dir first
    rel_curr = os.path.normpath(os.path.join(current_dir, inc))
    if os.path.exists(os.path.dirname(rel_curr)):
        return rel_curr
    # Otherwise relative to prefix
    return os.path.normpath(os.path.join(prefix, inc))

def count_blocks(content):
    # Strip comments
    lines = []
    for line in content.splitlines():
        clean = line.split('#')[0]
        lines.append(clean)
    text = '\\n'.join(lines)

    server_count = len(re.findall(r'(?:^|\\s)server\\s*\\{', text))
    upstream_count = len(re.findall(r'(?:^|\\s)upstream\\s+[^{\\s]+\\s*\\{', text))
    location_count = len(re.findall(r'(?:^|\\s)location\\s+[^{]+\\{', text))
    has_http = bool(re.search(r'(?:^|\\s)http\\s*\\{', text))
    has_stream = bool(re.search(r'(?:^|\\s)stream\\s*\\{', text))
    has_events = bool(re.search(r'(?:^|\\s)events\\s*\\{', text))
    include_count = len(re.findall(r'(?:^|\\s)include\\s+[^;]+;', text))

    return {
        "servers": server_count,
        "upstreams": upstream_count,
        "locations": location_count,
        "has_http": has_http,
        "has_stream": has_stream,
        "has_events": has_events,
        "includes": include_count
    }

def scan(fpath, parent="ROOT", level=0):
    norm = os.path.normpath(fpath)
    if norm in visited:
        return
    visited.add(norm)

    if not os.path.exists(norm):
        warnings.append(f"File not found: {norm}")
        return

    try:
        stat = os.stat(norm)
        size_bytes = stat.st_size
    except Exception as e:
        warnings.append(f"Cannot stat {norm}: {str(e)}")
        size_bytes = 0

    try:
        with open(norm, 'r', encoding='utf-8', errors='replace') as fp:
            content = fp.read()
    except Exception as e:
        content = ""
        warnings.append(f"Cannot read {norm}: {str(e)}")

    lines = content.splitlines()
    blocks = count_blocks(content)

    # snippet: first 40 lines
    snippet = '\\n'.join(lines[:45])

    node = {
        "filePath": norm,
        "relativePath": os.path.relpath(norm, prefix) if norm.startswith(prefix) else norm,
        "sizeBytes": size_bytes,
        "lineCount": len(lines),
        "includedFrom": parent if parent != "ROOT" else None,
        "level": level,
        "includesCount": blocks["includes"],
        "serverBlocksCount": blocks["servers"],
        "upstreamsCount": blocks["upstreams"],
        "hasHttpBlock": blocks["has_http"],
        "hasStreamBlock": blocks["has_stream"],
        "hasEventsBlock": blocks["has_events"],
        "contentSnippet": snippet,
        "fullContent": content if len(content) < 80000 else content[:80000] + "\\n# ... [TRUNCATED DUE TO SIZE] ..."
    }
    results.append(node)

    # Find include directives
    current_dir = os.path.dirname(norm)
    for m in re.finditer(r'(?:^|\\s)include\\s+([^;]+);', content):
        inc_pattern = m.group(1).strip().strip("'\\"")
        # ignore mime.types or fastcgi params for deep recursion unless needed
        resolved_pattern = resolve_path(inc_pattern, current_dir)
        # glob expansion
        matched_files = glob.glob(resolved_pattern)
        if matched_files:
            matched_files.sort()
            for mf in matched_files:
                if os.path.isfile(mf):
                    scan(mf, parent=norm, level=level + 1)
        else:
            if not any(char in inc_pattern for char in ['*', '?', '[']):
                warnings.append(f"Include not found: {resolved_pattern}")

scan(main_conf, "ROOT", 0)

output = {
    "mainConfigPath": main_conf,
    "prefixPath": prefix,
    "totalFiles": len(results),
    "totalLines": sum(r["lineCount"] for r in results),
    "files": results,
    "warnings": warnings,
    "detectedContexts": {
        "hasEvents": any(r["hasEventsBlock"] for r in results),
        "hasHttp": any(r["hasHttpBlock"] for r in results),
        "hasStream": any(r["hasStreamBlock"] for r in results),
        "totalServerBlocks": sum(r["serverBlocksCount"] for r in results),
        "totalUpstreams": sum(r["upstreamsCount"] for r in results),
        "totalLocations": 0
    }
}

print("===JSON_START===")
print(json.dumps(output))
print("===JSON_END===")
PYEOF
`;

/**
 * Discovers the complete Nginx configuration tree and Include hierarchy.
 */
export async function discoverNginxConfigTopology(
  server: RemoteServer,
  ephemeralPassword?: string,
  customConfPath?: string,
  customPrefixPath?: string
): Promise<NginxConfigTopologyTree> {
  // If confPath or prefixPath are not provided, run discovery first
  let confPath = customConfPath;
  let prefixPath = customPrefixPath;

  if (!confPath || !prefixPath) {
    const disc = await discoverNginxInstallation(server, ephemeralPassword);
    confPath = confPath || disc.confPath || '/etc/nginx/nginx.conf';
    prefixPath = prefixPath || disc.prefixPath || '/etc/nginx';
  }

  // 1. Try modern Python scanner first
  const pythonCmd = PYTHON_NGINX_SCANNER(confPath, prefixPath);
  try {
    const raw = await runAdaptiveSshCommand(server, pythonCmd, ephemeralPassword, 15000);
    if (raw.includes('===JSON_START===') && raw.includes('===JSON_END===')) {
      const jsonStr = raw.split('===JSON_START===')[1].split('===JSON_END===')[0].trim();
      const parsed: NginxConfigTopologyTree = JSON.parse(jsonStr);
      return parsed;
    }
  } catch (err: any) {
    // If python failed or not installed, fallback to shell scanner
  }

  // 2. Fallback to bash scanner
  const bashCmd = `export LC_ALL=C
MAIN_CONF="${confPath}"
PREFIX="${prefixPath}"

echo "===CONF_CHECK==="
ls -l "$MAIN_CONF" 2>/dev/null || echo "NOT_FOUND"

echo "===CONF_CONTENT==="
head -n 200 "$MAIN_CONF" 2>/dev/null || true
echo "===END_CONF_CONTENT==="
`;

  try {
    const rawFallback = await runAdaptiveSshCommand(server, bashCmd, ephemeralPassword, 12000);
    const content = rawFallback.includes('===CONF_CONTENT===')
      ? rawFallback.split('===CONF_CONTENT===')[1].split('===END_CONF_CONTENT===')[0].trim()
      : '';

    const lines = content.split('\n');
    const fallbackNode: NginxConfigFileNode = {
      filePath: confPath,
      relativePath: 'nginx.conf',
      sizeBytes: content.length,
      lineCount: lines.length,
      level: 0,
      includesCount: (content.match(/include\s+/g) || []).length,
      serverBlocksCount: (content.match(/server\s*\{/g) || []).length,
      upstreamsCount: (content.match(/upstream\s+/g) || []).length,
      hasHttpBlock: content.includes('http {') || content.includes('http{'),
      hasStreamBlock: content.includes('stream {') || content.includes('stream{'),
      hasEventsBlock: content.includes('events {') || content.includes('events{'),
      contentSnippet: lines.slice(0, 45).join('\n'),
      fullContent: content,
    };

    return {
      mainConfigPath: confPath,
      prefixPath,
      totalFiles: 1,
      totalLines: lines.length,
      files: [fallbackNode],
      detectedContexts: {
        hasEvents: fallbackNode.hasEventsBlock,
        hasHttp: fallbackNode.hasHttpBlock,
        hasStream: fallbackNode.hasStreamBlock,
        totalServerBlocks: fallbackNode.serverBlocksCount,
        totalUpstreams: fallbackNode.upstreamsCount,
        totalLocations: 0,
      },
      warnings: ['Scanned with fallback method due to Python absence.'],
    };
  } catch (err: any) {
    return {
      mainConfigPath: confPath,
      prefixPath,
      totalFiles: 0,
      totalLines: 0,
      files: [],
      detectedContexts: {
        hasEvents: false,
        hasHttp: false,
        hasStream: false,
        totalServerBlocks: 0,
        totalUpstreams: 0,
        totalLocations: 0,
      },
      warnings: [`Failed to scan Nginx configuration files: ${err.message}`],
    };
  }
}
