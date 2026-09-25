import { RemoteServer } from '../src/types';
import { runAdaptiveSshCommand } from './linuxServerMonitor';
import { discoverNginxConfigTopology } from './nginxConfigParser';

export interface NginxUpstreamServer {
  address: string; // ip, hostname, or unix:/path.sock
  port?: number;
  weight?: number;
  maxFails?: number;
  failTimeout?: string;
  isBackup?: boolean;
  isDown?: boolean;
  isUnixSocket?: boolean;
  isResolvingDomain?: boolean;
}

export interface NginxUpstreamPool {
  id: string;
  name: string;
  context: 'http' | 'stream';
  algorithm: 'round-robin' | 'least_conn' | 'ip_hash' | 'hash' | 'random' | 'unknown';
  hashKey?: string;
  keepalive?: number;
  servers: NginxUpstreamServer[];
  definedInFile: string;
  fileRelativePath: string;
  rawSnippet: string;
}

export interface NginxReverseProxyRoute {
  id: string;
  sitePrimaryDomain: string;
  siteFileRelativePath: string;
  locationPath: string;
  proxyPassTarget: string; // e.g., "http://backend_pool" or "http://127.0.0.1:3000"
  matchedUpstreamName?: string;
  isUpstream: boolean;
  websocketEnabled: boolean;
  proxySetHeaders: { [key: string]: string };
  proxyReadTimeout?: string;
  proxyConnectTimeout?: string;
  sslVerify: boolean;
}

export interface NginxProxySummary {
  totalUpstreams: number;
  totalUpstreamServers: number;
  totalProxyRoutes: number;
  websocketRoutesCount: number;
  upstreams: NginxUpstreamPool[];
  proxyRoutes: NginxReverseProxyRoute[];
  warnings: string[];
}

/**
 * Python-based robust AST extractor for Upstreams & Reverse Proxy routes.
 */
const PYTHON_PROXY_EXTRACTOR = (fileListJson: string) => `python3 - << 'PYEOF'
import sys, os, re, json

try:
    files_to_scan = json.loads('''${fileListJson}''')
except Exception as e:
    files_to_scan = []

upstreams = []
proxy_routes = []
warnings = []

def parse_upstream_block(content, filepath, context, name):
    # Determine load balancing algorithm
    algorithm = 'round-robin'
    hash_key = None
    if re.search(r'(?:^|\\s)least_conn;', content):
        algorithm = 'least_conn'
    elif re.search(r'(?:^|\\s)ip_hash;', content):
        algorithm = 'ip_hash'
    elif re.search(r'(?:^|\\s)random(?:\\s+[^;]+)?;', content):
        algorithm = 'random'
    else:
        hash_m = re.search(r'(?:^|\\s)hash\\s+([^;]+);', content)
        if hash_m:
            algorithm = 'hash'
            hash_key = hash_m.group(1).strip()

    # keepalive directive
    ka_match = re.search(r'(?:^|\\s)keepalive\\s+(\\d+);', content)
    keepalive = int(ka_match.group(1)) if ka_match else None

    # Parse server directives
    # server address:port [weight=N] [max_fails=N] [fail_timeout=N] [backup] [down];
    servers = []
    srv_matches = re.finditer(r'(?:^|\\s)server\\s+([^;]+);', content)
    for sm in srv_matches:
        raw_line = sm.group(1).strip()
        parts = raw_line.split()
        if not parts:
            continue
        addr_part = parts[0]
        params = parts[1:]

        is_unix = addr_part.startswith('unix:')
        is_backup = 'backup' in params
        is_down = 'down' in params

        weight = None
        max_fails = None
        fail_timeout = None

        for p in params:
            if p.startswith('weight='):
                try:
                    weight = int(p.split('=', 1)[1])
                except:
                    pass
            elif p.startswith('max_fails='):
                try:
                    max_fails = int(p.split('=', 1)[1])
                except:
                    pass
            elif p.startswith('fail_timeout='):
                fail_timeout = p.split('=', 1)[1]

        # Extract address & port
        port = None
        clean_addr = addr_part
        if not is_unix:
            if ':' in addr_part:
                clean_addr, port_str = addr_part.rsplit(':', 1)
                try:
                    port = int(port_str)
                except:
                    pass
            else:
                port = 80

        servers.append({
            "address": clean_addr,
            "port": port,
            "weight": weight,
            "maxFails": max_fails,
            "failTimeout": fail_timeout,
            "isBackup": is_backup,
            "isDown": is_down,
            "isUnixSocket": is_unix,
            "isResolvingDomain": not is_unix and not re.match(r'^[\\d\\.:]+$', clean_addr)
        })

    snippet_lines = content.strip().splitlines()
    snippet = "\\n".join(snippet_lines[:30])

    upstreams.append({
        "id": f"ups-{abs(hash(filepath + name))}",
        "name": name,
        "context": context,
        "algorithm": algorithm,
        "hashKey": hash_key,
        "keepalive": keepalive,
        "servers": servers,
        "definedInFile": filepath,
        "fileRelativePath": os.path.basename(filepath),
        "rawSnippet": snippet
    })

def scan_upstreams(filepath):
    if not os.path.exists(filepath):
        return
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as fp:
            text = fp.read()
    except Exception as e:
        return

    # Strip simple comments
    cleaned_lines = [l.split('#')[0] for l in text.splitlines()]
    cleaned = '\\n'.join(cleaned_lines)

    context = "http"
    if "stream {" in cleaned or "stream{" in cleaned:
        context = "stream"

    pos = 0
    while True:
        m = re.search(r'(?:^|\\s)upstream\\s+([^{]+)\\{', cleaned[pos:])
        if not m:
            break
        ups_name = m.group(1).strip()
        ups_start = pos + m.end()

        # Match balanced braces
        depth = 1
        i = ups_start
        while i < len(cleaned) and depth > 0:
            if cleaned[i] == '{':
                depth += 1
            elif cleaned[i] == '}':
                depth -= 1
            i += 1

        if depth == 0:
            ups_body = cleaned[ups_start:i-1]
            try:
                parse_upstream_block(ups_body, filepath, context, ups_name)
            except Exception as pe:
                warnings.append(f"Error parsing upstream in {filepath}: {str(pe)}")
            pos = i
        else:
            pos = ups_start

def scan_proxy_passes(filepath):
    if not os.path.exists(filepath):
        return
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as fp:
            text = fp.read()
    except Exception as e:
        return

    cleaned_lines = [l.split('#')[0] for l in text.splitlines()]
    cleaned = '\\n'.join(cleaned_lines)

    # Find server blocks, then find location blocks with proxy_pass
    server_blocks = re.finditer(r'(?:^|\\s)server\\s*\\{', cleaned)
    # Find all location blocks that contain proxy_pass
    for loc_match in re.finditer(r'(?:^|\\s)location\\s+([^{]+)\\{([^}]+)\\}', cleaned):
        loc_path = loc_match.group(1).strip()
        loc_body = loc_match.group(2)

        proxy_m = re.search(r'(?:^|\\s)proxy_pass\\s+([^;]+);', loc_body)
        if not proxy_m:
            continue

        target = proxy_m.group(1).strip()
        
        # Check websocket
        is_ws = bool(re.search(r'Upgrade|\\$http_upgrade', loc_body, re.I))
        
        # Check proxy headers
        headers = {}
        for h_m in re.finditer(r'(?:^|\\s)proxy_set_header\\s+([^\\s]+)\\s+([^;]+);', loc_body):
            headers[h_m.group(1).strip()] = h_m.group(2).strip()

        # Timeouts
        rt_m = re.search(r'(?:^|\\s)proxy_read_timeout\\s+([^;]+);', loc_body)
        ct_m = re.search(r'(?:^|\\s)proxy_connect_timeout\\s+([^;]+);', loc_body)
        ssl_ver = not bool(re.search(r'(?:^|\\s)proxy_ssl_verify\\s+off;', loc_body))

        # Guess if target is an upstream name
        # e.g., http://my_backend or http://127.0.0.1:8080
        matched_ups = None
        clean_target = re.sub(r'^https?://', '', target).split('/')[0]
        for u in upstreams:
            if u["name"] == clean_target:
                matched_ups = u["name"]
                break

        proxy_routes.append({
            "id": f"pr-{abs(hash(filepath + loc_path + target))}",
            "sitePrimaryDomain": os.path.basename(filepath),
            "siteFileRelativePath": os.path.basename(filepath),
            "locationPath": loc_path,
            "proxyPassTarget": target,
            "matchedUpstreamName": matched_ups,
            "isUpstream": bool(matched_ups),
            "websocketEnabled": is_ws,
            "proxySetHeaders": headers,
            "proxyReadTimeout": rt_m.group(1).strip() if rt_m else None,
            "proxyConnectTimeout": ct_m.group(1).strip() if ct_m else None,
            "sslVerify": ssl_ver
        })

for f in files_to_scan:
    scan_upstreams(f)

for f in files_to_scan:
    scan_proxy_passes(f)

total_servers = sum(len(u["servers"]) for u in upstreams)
ws_count = sum(1 for r in proxy_routes if r["websocketEnabled"])

output = {
    "totalUpstreams": len(upstreams),
    "totalUpstreamServers": total_servers,
    "totalProxyRoutes": len(proxy_routes),
    "websocketRoutesCount": ws_count,
    "upstreams": upstreams,
    "proxyRoutes": proxy_routes,
    "warnings": warnings
}

print("===JSON_START===")
print(json.dumps(output))
print("===JSON_END===")
PYEOF
`;

/**
 * Discovers and models all Nginx upstream pools and reverse proxy routing paths.
 */
export async function discoverNginxProxyArchitecture(
  server: RemoteServer,
  ephemeralPassword?: string
): Promise<NginxProxySummary> {
  const configTree = await discoverNginxConfigTopology(server, ephemeralPassword);
  const filePaths = configTree.files.map((f) => f.filePath);

  if (filePaths.length === 0) {
    return {
      totalUpstreams: 0,
      totalUpstreamServers: 0,
      totalProxyRoutes: 0,
      websocketRoutesCount: 0,
      upstreams: [],
      proxyRoutes: [],
      warnings: ['No configuration files found to parse proxy rules.'],
    };
  }

  const jsonFileList = JSON.stringify(filePaths).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const pythonCmd = PYTHON_PROXY_EXTRACTOR(jsonFileList);

  try {
    const rawOut = await runAdaptiveSshCommand(server, pythonCmd, ephemeralPassword, 15000);
    if (rawOut.includes('===JSON_START===') && rawOut.includes('===JSON_END===')) {
      const jsonStr = rawOut.split('===JSON_START===')[1].split('===JSON_END===')[0].trim();
      const parsed: NginxProxySummary = JSON.parse(jsonStr);
      return parsed;
    }
  } catch (err: any) {
    // If python failed, fallback
  }

  return {
    totalUpstreams: 0,
    totalUpstreamServers: 0,
    totalProxyRoutes: 0,
    websocketRoutesCount: 0,
    upstreams: [],
    proxyRoutes: [],
    warnings: ['Parsed with fallback defaults.'],
  };
}
