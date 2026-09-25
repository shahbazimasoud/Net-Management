import { RemoteServer } from '../src/types';
import { runAdaptiveSshCommand } from './linuxServerMonitor';
import { discoverNginxConfigTopology } from './nginxConfigParser';

export interface NginxServerBlockLocation {
  path: string;
  proxyPass?: string;
  root?: string;
  alias?: string;
  tryFiles?: string;
  websocketSupport?: boolean;
  fastcgiPass?: string;
  returnDirective?: string;
}

export interface NginxServerBlock {
  id: string;
  context: 'http' | 'stream';
  serverNames: string[];
  primaryDomain: string;
  listens: {
    raw: string;
    port: number;
    isSsl: boolean;
    isHttp2: boolean;
    isHttp3: boolean;
    isDefaultServer: boolean;
    isIpv6: boolean;
    ip?: string;
  }[];
  rootPath?: string;
  indexFiles?: string[];
  sslCertificate?: string;
  sslCertificateKey?: string;
  sslEnabled: boolean;
  locations: NginxServerBlockLocation[];
  definedInFile: string;
  fileRelativePath: string;
  lineStart?: number;
  lineEnd?: number;
  isEnabled: boolean; // based on symlink in sites-enabled or active inclusion
  rawBlockSnippet: string;
}

export interface NginxSitesSummary {
  totalSites: number;
  activeSites: number;
  disabledSites: number;
  sslSites: number;
  proxySites: number;
  staticSites: number;
  streamSites: number;
  sites: NginxServerBlock[];
  warnings: string[];
}

/**
 * Python-based robust AST extractor for server blocks across all scanned Nginx files.
 */
const PYTHON_SITES_EXTRACTOR = (fileListJson: string) => `python3 - << 'PYEOF'
import sys, os, re, json

try:
    files_to_scan = json.loads('''${fileListJson}''')
except Exception as e:
    files_to_scan = []

sites = []
warnings = []

def parse_server_block(content, filepath, context, start_idx=0):
    # Quick extraction of directives inside a server { ... } block
    # Parse listen directives
    listens = []
    # listen 80; listen 443 ssl http2; listen [::]:80;
    listen_matches = re.finditer(r'(?:^|\\s)listen\\s+([^;]+);', content)
    for lm in listen_matches:
        raw_l = lm.group(1).strip()
        parts = raw_l.split()
        first = parts[0]
        
        is_ssl = 'ssl' in parts
        is_http2 = 'http2' in parts
        is_http3 = 'quic' in parts or 'http3' in parts
        is_default = 'default_server' in parts or 'default' in parts
        is_ipv6 = '[' in first
        
        port = 80
        ip = None
        
        if is_ipv6:
            # e.g. [::]:80 or [::1]:443
            p_m = re.search(r'\\]:(\\d+)', first)
            if p_m:
                port = int(p_m.group(1))
            else:
                port = 80
        else:
            if ':' in first:
                ip, p_str = first.split(':', 1)
                try:
                    port = int(p_str)
                except:
                    port = 80
            else:
                try:
                    port = int(first)
                except:
                    port = 80
                    
        listens.append({
            "raw": raw_l,
            "port": port,
            "isSsl": is_ssl,
            "isHttp2": is_http2,
            "isHttp3": is_http3,
            "isDefaultServer": is_default,
            "isIpv6": is_ipv6,
            "ip": ip
        })
        
    if not listens:
        listens.append({
            "raw": "80 (default)",
            "port": 80,
            "isSsl": False,
            "isHttp2": False,
            "isHttp3": False,
            "isDefaultServer": False,
            "isIpv6": False
        })

    # server_name directive
    server_names = []
    sn_matches = re.finditer(r'(?:^|\\s)server_name\\s+([^;]+);', content)
    for snm in sn_matches:
        names = snm.group(1).strip().split()
        for n in names:
            n_clean = n.strip().strip("'\\"")
            if n_clean and n_clean not in server_names:
                server_names.append(n_clean)
                
    primary_domain = server_names[0] if server_names else "_ (catch-all)"

    # root directive
    root_match = re.search(r'(?:^|\\s)root\\s+([^;]+);', content)
    root_path = root_match.group(1).strip().strip("'\\"") if root_match else None

    # index directive
    index_match = re.search(r'(?:^|\\s)index\\s+([^;]+);', content)
    index_files = index_match.group(1).strip().split() if index_match else []

    # SSL certificates
    ssl_cert_match = re.search(r'(?:^|\\s)ssl_certificate\\s+([^;]+);', content)
    ssl_key_match = re.search(r'(?:^|\\s)ssl_certificate_key\\s+([^;]+);', content)
    ssl_cert = ssl_cert_match.group(1).strip().strip("'\\"") if ssl_cert_match else None
    ssl_key = ssl_key_match.group(1).strip().strip("'\\"") if ssl_key_match else None
    ssl_enabled = bool(ssl_cert or any(l["isSsl"] for l in listens))

    # Parse locations
    locations = []
    # Match location blocks
    loc_blocks = re.finditer(r'(?:^|\\s)location\\s+([^{]+)\\{([^}]*)\\}', content)
    for lbm in loc_blocks:
        loc_path = lbm.group(1).strip()
        loc_body = lbm.group(2)
        
        proxy_match = re.search(r'(?:^|\\s)proxy_pass\\s+([^;]+);', loc_body)
        root_loc = re.search(r'(?:^|\\s)root\\s+([^;]+);', loc_body)
        alias_loc = re.search(r'(?:^|\\s)alias\\s+([^;]+);', loc_body)
        try_files = re.search(r'(?:^|\\s)try_files\\s+([^;]+);', loc_body)
        fastcgi = re.search(r'(?:^|\\s)fastcgi_pass\\s+([^;]+);', loc_body)
        return_dir = re.search(r'(?:^|\\s)return\\s+([^;]+);', loc_body)
        
        is_ws = bool(re.search(r'Upgrade|\\$http_upgrade', loc_body, re.I))
        
        locations.append({
            "path": loc_path,
            "proxyPass": proxy_match.group(1).strip() if proxy_match else None,
            "root": root_loc.group(1).strip().strip("'\\"") if root_loc else None,
            "alias": alias_loc.group(1).strip().strip("'\\"") if alias_loc else None,
            "tryFiles": try_files.group(1).strip() if try_files else None,
            "websocketSupport": is_ws,
            "fastcgiPass": fastcgi.group(1).strip() if fastcgi else None,
            "returnDirective": return_dir.group(1).strip() if return_dir else None
        })

    # Enabled status check:
    # If in sites-available and NOT in sites-enabled, disabled.
    is_enabled = True
    if "sites-available" in filepath:
        # Check if corresponding link exists in sites-enabled
        enabled_dir = filepath.replace("sites-available", "sites-enabled")
        if not os.path.exists(enabled_dir):
            is_enabled = False

    site_id = f"site-{abs(hash(filepath + primary_domain + str(listens)))}"

    snippet_lines = content.strip().splitlines()
    snippet = "\\n".join(snippet_lines[:45])

    return {
        "id": site_id,
        "context": context,
        "serverNames": server_names,
        "primaryDomain": primary_domain,
        "listens": listens,
        "rootPath": root_path,
        "indexFiles": index_files,
        "sslCertificate": ssl_cert,
        "sslCertificateKey": ssl_key,
        "sslEnabled": ssl_enabled,
        "locations": locations,
        "definedInFile": filepath,
        "fileRelativePath": os.path.basename(filepath),
        "isEnabled": is_enabled,
        "rawBlockSnippet": snippet
    }

def find_server_blocks(filepath):
    if not os.path.exists(filepath):
        return
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as fp:
            text = fp.read()
    except Exception as e:
        warnings.append(f"Cannot read {filepath}: {str(e)}")
        return

    # Strip simple comments
    cleaned_lines = []
    for l in text.splitlines():
        cleaned_lines.append(l.split('#')[0])
    cleaned = '\\n'.join(cleaned_lines)

    # Context detection: http or stream or root
    context = "http"
    if "stream {" in cleaned or "stream{" in cleaned:
        context = "stream"

    # Find balanced curly braces for 'server {'
    pos = 0
    while True:
        m = re.search(r'(?:^|\\s)server\\s*\\{', cleaned[pos:])
        if not m:
            break
        server_start = pos + m.end()
        # Find matching closing brace
        depth = 1
        i = server_start
        while i < len(cleaned) and depth > 0:
            if cleaned[i] == '{':
                depth += 1
            elif cleaned[i] == '}':
                depth -= 1
            i += 1
        
        if depth == 0:
            block_body = cleaned[server_start:i-1]
            try:
                parsed = parse_server_block(block_body, filepath, context, pos)
                if parsed:
                    sites.append(parsed)
            except Exception as pe:
                warnings.append(f"Parse error in {filepath}: {str(pe)}")
            pos = i
        else:
            pos = server_start

for f in files_to_scan:
    find_server_blocks(f)

# Sort sites: active first, then primary domain
sites.sort(key=lambda s: (not s["isEnabled"], s["primaryDomain"]))

total = len(sites)
active = sum(1 for s in sites if s["isEnabled"])
disabled = sum(1 for s in sites if not s["isEnabled"])
ssl_count = sum(1 for s in sites if s["sslEnabled"])
proxy_count = sum(1 for s in sites if any(l.get("proxyPass") for l in s["locations"]))
static_count = sum(1 for s in sites if not any(l.get("proxyPass") for l in s["locations"]) and s["rootPath"])
stream_count = sum(1 for s in sites if s["context"] == "stream")

output = {
    "totalSites": total,
    "activeSites": active,
    "disabledSites": disabled,
    "sslSites": ssl_count,
    "proxySites": proxy_count,
    "staticSites": static_count,
    "streamSites": stream_count,
    "sites": sites,
    "warnings": warnings
}

print("===JSON_START===")
print(json.dumps(output))
print("===JSON_END===")
PYEOF
`;

/**
 * Extracts and models all virtual hosts / server blocks from the discovered configuration.
 */
export async function discoverNginxServerBlocks(
  server: RemoteServer,
  ephemeralPassword?: string
): Promise<NginxSitesSummary> {
  // 1. Get complete configuration tree
  const configTree = await discoverNginxConfigTopology(server, ephemeralPassword);
  const filePaths = configTree.files.map((f) => f.filePath);

  // If no files found, return empty
  if (filePaths.length === 0) {
    return {
      totalSites: 0,
      activeSites: 0,
      disabledSites: 0,
      sslSites: 0,
      proxySites: 0,
      staticSites: 0,
      streamSites: 0,
      sites: [],
      warnings: configTree.warnings || ['No configuration files found to parse sites.'],
    };
  }

  // 2. Run AST extraction on the remote machine
  const jsonFileList = JSON.stringify(filePaths).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const pythonCmd = PYTHON_SITES_EXTRACTOR(jsonFileList);

  try {
    const rawOut = await runAdaptiveSshCommand(server, pythonCmd, ephemeralPassword, 15000);
    if (rawOut.includes('===JSON_START===') && rawOut.includes('===JSON_END===')) {
      const jsonStr = rawOut.split('===JSON_START===')[1].split('===JSON_END===')[0].trim();
      const parsed: NginxSitesSummary = JSON.parse(jsonStr);
      return parsed;
    }
  } catch (err: any) {
    // If python failed or execution timed out, fallback
  }

  // 3. Fallback extraction using bash/grep
  const fallbackSites: NginxServerBlock[] = [];
  for (const f of configTree.files) {
    if (f.serverBlocksCount > 0) {
      fallbackSites.push({
        id: `site-fb-${f.relativePath}`,
        context: f.hasStreamBlock ? 'stream' : 'http',
        serverNames: ['_'],
        primaryDomain: f.relativePath.replace(/\.conf$/, ''),
        listens: [{ raw: '80', port: 80, isSsl: false, isHttp2: false, isHttp3: false, isDefaultServer: false, isIpv6: false }],
        sslEnabled: false,
        locations: [],
        definedInFile: f.filePath,
        fileRelativePath: f.relativePath,
        isEnabled: true,
        rawBlockSnippet: f.contentSnippet || '',
      });
    }
  }

  return {
    totalSites: fallbackSites.length,
    activeSites: fallbackSites.length,
    disabledSites: 0,
    sslSites: 0,
    proxySites: 0,
    staticSites: fallbackSites.length,
    streamSites: 0,
    sites: fallbackSites,
    warnings: ['Extracted via fallback method.'],
  };
}
