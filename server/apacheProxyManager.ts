import {
  RemoteServer,
  ApacheProxyRoute,
  ApacheBalancerMember,
  ApacheBalancerPool,
  ApacheProxyModuleRequirement,
  ApacheProxySummary,
  CreateApacheProxyRouteParams,
} from '../src/types';
import { runAdaptiveSshCommand } from './linuxServerMonitor';
import { discoverApacheInstallation, isLikelyApacheBinary } from './apacheDiscovery';

/**
 * Standard Apache Reverse Proxy module catalog with purpose definitions.
 */
export const APACHE_PROXY_MODULES: Array<{
  name: string;
  moduleName: string;
  purpose: string;
  purpose_fa: string;
  requiredFor: string;
}> = [
  {
    name: 'mod_proxy',
    moduleName: 'proxy_module',
    purpose: 'Core proxy engine for Apache HTTP Server',
    purpose_fa: 'موتور هسته پروکسی و فوروارد درخواست‌ها در سرور آپاچی',
    requiredFor: 'Required for all reverse proxy, forward proxy, and load balancer operations.',
  },
  {
    name: 'mod_proxy_http',
    moduleName: 'proxy_http_module',
    purpose: 'HTTP and HTTPS proxy support handler',
    purpose_fa: 'پروتکل پروکسی HTTP و HTTPS به سرورهای بک‌اند',
    requiredFor: 'Required to forward requests to HTTP/HTTPS application servers.',
  },
  {
    name: 'mod_proxy_wstunnel',
    moduleName: 'proxy_wstunnel_module',
    purpose: 'WebSocket tunneling proxy support',
    purpose_fa: 'پروکسی و تانل سوکت‌های دوطرفه وب‌سوکت (ws:// و wss://)',
    requiredFor: 'Required for real-time WebSocket communication and upgrade handshakes.',
  },
  {
    name: 'mod_proxy_balancer',
    moduleName: 'proxy_balancer_module',
    purpose: 'Load balancing clustering and health distribution',
    purpose_fa: 'کلاسترینگ و توزیع بار بین چندین سرور بک‌اند (Load Balancer)',
    requiredFor: 'Required for balancer:// cluster pools and member failover.',
  },
  {
    name: 'mod_lbmethod_byrequests',
    moduleName: 'lbmethod_byrequests_module',
    purpose: 'Request-counting load balancing scheduler',
    purpose_fa: 'الگوریتم توزیع بار بر اساس شمارش تعداد درخواست‌ها',
    requiredFor: 'Used by default in balancer clusters for weighted request distribution.',
  },
  {
    name: 'mod_lbmethod_bytraffic',
    moduleName: 'lbmethod_bytraffic_module',
    purpose: 'Traffic-byte volume load balancing scheduler',
    purpose_fa: 'الگوریتم توزیع بار بر اساس حجم ترافیک ارسالی/دریافتی',
    requiredFor: 'Used for bandwidth-sensitive balancer clusters.',
  },
  {
    name: 'mod_lbmethod_bybusyness',
    moduleName: 'lbmethod_bybusyness_module',
    purpose: 'Active-connection queue load balancing scheduler',
    purpose_fa: 'الگوریتم توزیع بار بر اساس کمترین تعداد کانکشن فعال در لحظه',
    requiredFor: 'Used for least-busy connection load balancing.',
  },
  {
    name: 'mod_headers',
    moduleName: 'headers_module',
    purpose: 'HTTP request and response header manipulation',
    purpose_fa: 'تغییر، افزودن و تنظیم هدرهای درخواست مانند X-Forwarded-Proto و X-Real-IP',
    requiredFor: 'Required for setting custom proxy headers and preserving original client metadata.',
  },
  {
    name: 'mod_ssl',
    moduleName: 'ssl_module',
    purpose: 'Strong cryptography using SSL/TLS engines',
    purpose_fa: 'رمزنگاری ارتباطات با پروتکل‌های امن SSL و TLS',
    requiredFor: 'Required when proxying to HTTPS backends (SSLProxyEngine On) or securing frontend ports.',
  },
  {
    name: 'mod_rewrite',
    moduleName: 'rewrite_module',
    purpose: 'Rule-based URL and protocol rewriting engine',
    purpose_fa: 'موتور قدرتمند بازنویسی آدرس‌ها و ریدایرکت‌های شرطی',
    requiredFor: 'Used for conditional WebSocket upgrade rewrites and advanced path mappings.',
  },
];

/**
 * Python-based robust AST extractor for Apache Reverse Proxy routes,
 * Balancer pools, and active proxy modules.
 */
const PYTHON_PROXY_EXTRACTOR = (serverRoot: string) => `python3 - << 'PYEOF'
import sys, os, re, json, glob

server_root = "${serverRoot}"
routes = []
balancers = []
warnings = []

def find_all_candidate_files():
    candidates = set()
    # 1. Search ServerRoot for *.conf
    if os.path.isdir(server_root):
        for root, dirs, files in os.walk(server_root):
            dirs[:] = [d for d in dirs if not d.startswith('.')]
            for f in files:
                if f.endswith('.conf') or f.endswith('.conf.disabled'):
                    candidates.add(os.path.join(root, f))

    # 2. Check standard distribution paths
    distro_paths = [
        "/etc/apache2/sites-available/*.conf",
        "/etc/apache2/sites-enabled/*.conf",
        "/etc/apache2/conf-available/*.conf",
        "/etc/apache2/conf-enabled/*.conf",
        "/etc/httpd/conf.d/*.conf",
        "/etc/httpd/conf.d/*.conf.disabled",
        "/etc/httpd/conf/httpd.conf",
        "/etc/apache2/apache2.conf"
    ]
    for p in distro_paths:
        for m in glob.glob(p):
            if os.path.isfile(m):
                candidates.add(m)

    return sorted(list(candidates))

def parse_proxy_blocks(content, filepath):
    rel_path = os.path.relpath(filepath, server_root) if filepath.startswith(server_root) else filepath

    # 1. Scan <Proxy balancer://...> blocks
    balancer_pattern = re.compile(r'<Proxy\\s+["\\']?balancer://([^"\\'>\\s]+)["\\']?\\s*>(.*?)</Proxy>', re.IGNORECASE | re.DOTALL)
    for b_match in balancer_pattern.finditer(content):
        b_name = b_match.group(1).strip()
        b_body = b_match.group(2)

        # Parse BalancerMember
        members = []
        member_matches = re.finditer(r'\\bBalancerMember\\s+["\\']?([^"\\'\\s]+)["\\']?([^\\r\\n]*)', b_body, re.IGNORECASE)
        for mm in member_matches:
            m_url = mm.group(1).strip()
            params_raw = mm.group(2).strip()

            loadfactor = 1
            status = ""
            route = ""
            is_backup = False
            is_drain = False

            for p in params_raw.split():
                if p.startswith('loadfactor='):
                    try:
                        loadfactor = int(p.split('=', 1)[1])
                    except:
                        pass
                elif p.startswith('status='):
                    status = p.split('=', 1)[1]
                    if '+H' in status or 'H' in status:
                        is_backup = True
                    if '+D' in status or 'D' in status:
                        is_drain = True
                elif p.startswith('route='):
                    route = p.split('=', 1)[1]

            members.append({
                "url": m_url,
                "loadfactor": loadfactor,
                "status": status,
                "route": route,
                "isBackup": is_backup,
                "isDrain": is_drain
            })

        # Algorithm
        algo = 'byrequests'
        algo_m = re.search(r'\\b(?:ProxySet\\s+)?lbmethod=([a-zA-Z0-9_]+)', b_body, re.IGNORECASE)
        if algo_m:
            raw_algo = algo_m.group(1).lower()
            if 'traffic' in raw_algo:
                algo = 'bytraffic'
            elif 'busyness' in raw_algo:
                algo = 'bybusyness'
            elif 'heartbeat' in raw_algo:
                algo = 'heartbeat'
            else:
                algo = 'byrequests'

        snippet = b_match.group(0).strip()
        balancers.append({
            "id": f"bal-{abs(hash(filepath + b_name))}",
            "name": b_name,
            "algorithm": algo,
            "members": members,
            "definedInFile": filepath,
            "fileRelativePath": rel_path,
            "rawSnippet": snippet[:3000]
        })

    # 2. Extract context headers & settings in file
    preserve_host_global = bool(re.search(r'\\bProxyPreserveHost\\s+on\\b', content, re.IGNORECASE))
    ssl_engine_global = bool(re.search(r'\\bSSLProxyEngine\\s+on\\b', content, re.IGNORECASE))
    ssl_check_peer = not bool(re.search(r'\\bSSLProxyCheckPeer(?:Name|CN)\\s+off\\b', content, re.IGNORECASE))

    # 3. Check WebSocket rewrite rules
    ws_rewrite_present = bool(re.search(r'\\bRewriteCond\\s+%\\{HTTP:Upgrade\\}\\s+=\\s*websocket', content, re.IGNORECASE))

    # 4. Extract ProxyPass directives
    # We can match inside <VirtualHost> or at global/file level
    vhost_pattern = re.compile(r'<VirtualHost\\s+([^>]+)>(.*?)</VirtualHost>', re.IGNORECASE | re.DOTALL)
    vhost_spans = []
    for vm in vhost_pattern.finditer(content):
        vhost_body = vm.group(2)
        sname_m = re.search(r'\\bServerName\\s+([^\\s\\r\\n]+)', vhost_body, re.IGNORECASE)
        v_name = sname_m.group(1).strip() if sname_m else vm.group(1).strip()
        vhost_spans.append((vm.start(), vm.end(), v_name))

    # Also match <Location ...> blocks with ProxyPass inside
    location_pattern = re.compile(r'<Location\\s+["\\']?([^"\\'>\\s]+)["\\']?\\s*>(.*?)</Location>', re.IGNORECASE | re.DOTALL)
    for loc_m in location_pattern.finditer(content):
        loc_path = loc_m.group(1).strip()
        loc_body = loc_m.group(2)

        pp_m = re.search(r'\\bProxyPass\\s+["\\']?([^"\\'\\s]+)["\\']?(?:\\s+([^\\r\\n]+))?', loc_body, re.IGNORECASE)
        if not pp_m:
            continue

        target = pp_m.group(1).strip()
        params = pp_m.group(2).strip() if pp_m.group(2) else ""
        if target == '!':
            continue

        ppr_m = re.search(r'\\bProxyPassReverse\\s+["\\']?([^"\\'\\s]+)["\\']?', loc_body, re.IGNORECASE)
        reverse_target = ppr_m.group(1).strip() if ppr_m else None

        preserve_host = preserve_host_global or bool(re.search(r'\\bProxyPreserveHost\\s+on\\b', loc_body, re.IGNORECASE))
        ssl_backend = ssl_engine_global or bool(re.search(r'\\bSSLProxyEngine\\s+on\\b', loc_body, re.IGNORECASE)) or target.startswith('https://') or target.startswith('wss://')

        # Check headers
        headers = {}
        for hm in re.finditer(r'\\bRequestHeader\\s+(?:set|add|append)\\s+([a-zA-Z0-9_\\-]+)\\s+["\\']?([^"\\'\\r\\n]+)["\\']?', loc_body, re.IGNORECASE):
            headers[hm.group(1).strip()] = hm.group(2).strip()

        # Timeouts
        t_val = None
        ct_val = None
        for p in params.split():
            if p.startswith('timeout='):
                try:
                    t_val = int(p.split('=', 1)[1])
                except:
                    pass
            elif p.startswith('connectiontimeout='):
                try:
                    ct_val = int(p.split('=', 1)[1])
                except:
                    pass

        # WebSocket check
        is_ws = target.startswith('ws://') or target.startswith('wss://') or 'upgrade=websocket' in params.lower() or bool(re.search(r'\\bRewriteCond\\s+%\\{HTTP:Upgrade\\}\\s+=\\s*websocket', loc_body, re.IGNORECASE))

        protocol = 'http'
        is_balancer = target.startswith('balancer://')
        balancer_name = target.replace('balancer://', '').split('/')[0] if is_balancer else None

        if is_balancer:
            protocol = 'balancer'
        elif target.startswith('wss://'):
            protocol = 'wss'
        elif target.startswith('ws://'):
            protocol = 'ws'
        elif target.startswith('https://'):
            protocol = 'https'
        elif target.startswith('unix:'):
            protocol = 'unix'

        # ServerName from enclosing vhost
        vhost_server_name = ""
        for vstart, vend, vsname in vhost_spans:
            if vstart <= loc_m.start() and loc_m.end() <= vend:
                vhost_server_name = vsname
                break

        start_line = content[:loc_m.start()].count('\\n') + 1

        route_id = f"apr-{abs(hash(filepath + ':' + loc_path + ':' + target))}"
        routes.append({
            "id": route_id,
            "path": loc_path,
            "target": target,
            "reverseTarget": reverse_target,
            "protocol": protocol,
            "isBalancer": is_balancer,
            "balancerName": balancer_name,
            "websocketEnabled": is_ws,
            "preserveHost": preserve_host,
            "timeout": t_val,
            "connectTimeout": ct_val,
            "sslBackend": ssl_backend,
            "sslVerify": ssl_check_peer,
            "headers": headers,
            "serverName": vhost_server_name,
            "definedInFile": filepath,
            "fileRelativePath": rel_path,
            "lineStart": start_line,
            "rawSnippet": loc_m.group(0).strip()[:2000]
        })

    # 5. Extract standalone ProxyPass <path> <target> [params] outside <Location>
    standalone_pattern = re.compile(r'^[ \\t]*ProxyPass\\s+["\\']?([^"\\'\\s]+)["\\']?\\s+["\\']?([^"\\'\\s]+)["\\']?(?:\\s+([^\\r\\n]+))?', re.IGNORECASE | re.MULTILINE)
    for sp_m in standalone_pattern.finditer(content):
        # Verify not inside an already captured <Location> block
        sp_start = sp_m.start()
        in_loc = False
        for lm in location_pattern.finditer(content):
            if lm.start() <= sp_start and sp_start <= lm.end():
                in_loc = True
                break
        if in_loc:
            continue

        p_path = sp_m.group(1).strip()
        target = sp_m.group(2).strip()
        params = sp_m.group(3).strip() if sp_m.group(3) else ""

        if target == '!':
            continue

        # Look for matching ProxyPassReverse
        ppr_pattern = re.compile(rf'^[ \\t]*ProxyPassReverse\\s+["\\']?{re.escape(p_path)}["\\']?\\s+["\\']?([^"\\'\\s]+)["\\']?', re.IGNORECASE | re.MULTILINE)
        ppr_m = ppr_pattern.search(content)
        reverse_target = ppr_m.group(1).strip() if ppr_m else None

        is_ws = target.startswith('ws://') or target.startswith('wss://') or 'upgrade=websocket' in params.lower() or ws_rewrite_present
        is_balancer = target.startswith('balancer://')
        balancer_name = target.replace('balancer://', '').split('/')[0] if is_balancer else None

        protocol = 'http'
        if is_balancer:
            protocol = 'balancer'
        elif target.startswith('wss://'):
            protocol = 'wss'
        elif target.startswith('ws://'):
            protocol = 'ws'
        elif target.startswith('https://'):
            protocol = 'https'
        elif target.startswith('unix:'):
            protocol = 'unix'

        t_val = None
        ct_val = None
        for p in params.split():
            if p.startswith('timeout='):
                try:
                    t_val = int(p.split('=', 1)[1])
                except:
                    pass
            elif p.startswith('connectiontimeout='):
                try:
                    ct_val = int(p.split('=', 1)[1])
                except:
                    pass

        vhost_server_name = ""
        for vstart, vend, vsname in vhost_spans:
            if vstart <= sp_start and sp_start <= vend:
                vhost_server_name = vsname
                break

        start_line = content[:sp_start].count('\\n') + 1
        route_id = f"apr-{abs(hash(filepath + ':' + p_path + ':' + target))}"

        # Avoid duplicates
        if not any(r["id"] == route_id for r in routes):
            routes.append({
                "id": route_id,
                "path": p_path,
                "target": target,
                "reverseTarget": reverse_target,
                "protocol": protocol,
                "isBalancer": is_balancer,
                "balancerName": balancer_name,
                "websocketEnabled": is_ws,
                "preserveHost": preserve_host_global,
                "timeout": t_val,
                "connectTimeout": ct_val,
                "sslBackend": ssl_engine_global or target.startswith('https://') or target.startswith('wss://'),
                "sslVerify": ssl_check_peer,
                "headers": {},
                "serverName": vhost_server_name,
                "definedInFile": filepath,
                "fileRelativePath": rel_path,
                "lineStart": start_line,
                "rawSnippet": sp_m.group(0).strip()[:1000]
            })

candidate_files = find_all_candidate_files()
for c_file in candidate_files:
    try:
        with open(c_file, 'r', encoding='utf-8', errors='replace') as fp:
            content = fp.read()
        if 'ProxyPass' in content or 'balancer://' in content:
            parse_proxy_blocks(content, c_file)
    except Exception as e:
        warnings.append(f"Cannot read {c_file}: {str(e)}")

out_obj = {
    "routes": routes,
    "balancers": balancers,
    "warnings": warnings
}

print("PROXY_JSON_START:::" + json.dumps(out_obj) + ":::PROXY_JSON_END")
PYEOF
`;

/**
 * Discovers and models all Apache reverse proxy routes, load balancer pools,
 * and proxy module readiness status on the target remote server.
 */
export async function discoverApacheProxyArchitecture(
  server: RemoteServer,
  ephemeralPassword?: string
): Promise<ApacheProxySummary> {
  const discovery = await discoverApacheInstallation(server, ephemeralPassword);
  const serverRoot =
    discovery.serverRoot ||
    (discovery.confPath?.includes('/httpd') ? '/etc/httpd' : '/etc/apache2');

  // Check loaded modules
  const loadedList = discovery.loadedModules || [];
  const loadedNorm = loadedList.map((m) => m.toLowerCase());

  const moduleStatus: ApacheProxyModuleRequirement[] = APACHE_PROXY_MODULES.map((mod) => {
    const isLoaded = loadedNorm.some(
      (m) =>
        m.includes(mod.moduleName.toLowerCase()) ||
        m.includes(mod.name.toLowerCase()) ||
        m.startsWith(mod.moduleName.toLowerCase())
    );

    return {
      name: mod.name,
      moduleName: mod.moduleName,
      isLoaded,
      isAvailable: true, // will be verified during enable command
      purpose: mod.purpose,
      purpose_fa: mod.purpose_fa,
      requiredFor: mod.requiredFor,
    };
  });

  const coreLoaded = moduleStatus.find((m) => m.name === 'mod_proxy')?.isLoaded ?? false;
  const httpLoaded = moduleStatus.find((m) => m.name === 'mod_proxy_http')?.isLoaded ?? false;

  const missingModules: string[] = [];
  if (!coreLoaded) missingModules.push('proxy');
  if (!httpLoaded) missingModules.push('proxy_http');

  let routes: ApacheProxyRoute[] = [];
  let balancers: ApacheBalancerPool[] = [];
  let warnings: string[] = [];

  try {
    const pyScript = PYTHON_PROXY_EXTRACTOR(serverRoot);
    const rawOutput = await runAdaptiveSshCommand(server, pyScript, ephemeralPassword, 15000);

    if (rawOutput.includes('PROXY_JSON_START:::') && rawOutput.includes(':::PROXY_JSON_END')) {
      const jsonStr = rawOutput.split('PROXY_JSON_START:::')[1].split(':::PROXY_JSON_END')[0].trim();
      const parsed = JSON.parse(jsonStr);
      routes = parsed.routes || [];
      balancers = parsed.balancers || [];
      warnings = parsed.warnings || [];
    }
  } catch (err: any) {
    warnings.push(`AST proxy extractor error: ${err.message || String(err)}`);
  }

  const totalMembers = balancers.reduce((acc, b) => acc + (b.members?.length || 0), 0);
  const wsCount = routes.filter((r) => r.websocketEnabled).length;
  const sslCount = routes.filter((r) => r.sslBackend).length;

  return {
    totalRoutes: routes.length,
    totalBalancers: balancers.length,
    totalBalancerMembers: totalMembers,
    websocketRoutesCount: wsCount,
    sslBackendCount: sslCount,
    routes,
    balancers,
    moduleStatus,
    allRequiredModulesLoaded: missingModules.length === 0,
    missingModules,
    warnings,
  };
}

/**
 * Enables required Apache proxy modules adaptively across Debian/Ubuntu or RHEL/Rocky/Fedora.
 * Strictly executes syntax check before reloading the daemon.
 */
export async function enableApacheProxyModules(
  server: RemoteServer,
  modulesToEnable: string[],
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string; output?: string }> {
  if (!modulesToEnable || modulesToEnable.length === 0) {
    return { success: true, message: 'No modules requested to enable.' };
  }

  const discovery = await discoverApacheInstallation(server, ephemeralPassword);
  const binary = discovery.binaryPath || (discovery.controlBinaryPath ? discovery.controlBinaryPath : 'apache2');
  const serviceName = discovery.serviceName || 'apache2';

  if (!isLikelyApacheBinary(binary)) {
    throw new Error(`Untrusted or invalid Apache binary: ${binary}`);
  }

  // Clean module names (e.g. "mod_proxy_http" -> "proxy_http", "proxy" -> "proxy")
  const cleanModules = modulesToEnable.map((m) =>
    m.replace(/^mod_/, '').replace(/\.so$/, '').trim()
  );

  const script = `export LC_ALL=C
MODS="${cleanModules.join(' ')}"

# 1. Debian / Ubuntu a2enmod
if command -v a2enmod >/dev/null 2>&1; then
  echo "Enabling modules via a2enmod: $MODS"
  a2enmod $MODS 2>&1
elif [ -d /etc/httpd/conf.modules.d ]; then
  # 2. RHEL / Rocky / CentOS / Fedora / Alma
  echo "Configuring modules for RHEL family in /etc/httpd/conf.modules.d"
  for m in $MODS; do
    # Try to uncomment LoadModule line in 00-proxy.conf or similar
    sed -i "s/^[ \\t]*#[ \\t]*\\(LoadModule[ \\t]\\+\\w*proxy\${m}*\\)/\\1/g" /etc/httpd/conf.modules.d/*.conf 2>/dev/null || true
  done
fi

# 3. Syntax Verification
${binary} -t 2>&1
`;

  const output = await runAdaptiveSshCommand(server, script, ephemeralPassword, 15000);

  if (output.toLowerCase().includes('syntax ok')) {
    // Reload Apache gracefully
    const reloadCmd = `systemctl reload ${serviceName} 2>/dev/null || apachectl -k graceful 2>/dev/null || true`;
    await runAdaptiveSshCommand(server, reloadCmd, ephemeralPassword, 8000);
    return {
      success: true,
      message: `Apache proxy modules [${cleanModules.join(', ')}] enabled successfully`,
      output,
    };
  } else {
    throw new Error(
      `Apache configuration syntax error after enabling modules. Changes not committed:\n${output.trim()}`
    );
  }
}

/**
 * Creates and deploys a new Apache Reverse Proxy Route or Load Balancer pool.
 * Validates module prerequisites and runs syntax dry-run verification before reload.
 */
export async function createApacheProxyRoute(
  server: RemoteServer,
  params: CreateApacheProxyRouteParams,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string; filePath: string; output?: string }> {
  const discovery = await discoverApacheInstallation(server, ephemeralPassword);
  const binary = discovery.binaryPath || 'apache2';
  const serviceName = discovery.serviceName || 'apache2';

  if (!isLikelyApacheBinary(binary)) {
    throw new Error(`Untrusted or invalid Apache binary: ${binary}`);
  }

  // Parameter validation
  const path = (params.path || '/').trim();
  if (!path.startsWith('/')) {
    throw new Error('Proxy path must start with a forward slash (e.g. / or /api)');
  }

  let backendUrl = (params.backendUrl || '').trim();
  if (params.isBalancer && params.balancerName) {
    const cleanBalName = params.balancerName.trim().replace(/[^a-zA-Z0-9_\-]/g, '');
    backendUrl = `balancer://${cleanBalName}`;
  }

  if (!backendUrl) {
    throw new Error('Backend URL or Load Balancer name is required.');
  }

  // Check and auto-enable missing required modules if requested
  const modulesNeeded: string[] = ['proxy', 'proxy_http'];
  if (params.websocketSupport || backendUrl.startsWith('ws://') || backendUrl.startsWith('wss://')) {
    modulesNeeded.push('proxy_wstunnel', 'rewrite');
  }
  if (params.isBalancer || backendUrl.startsWith('balancer://')) {
    modulesNeeded.push('proxy_balancer', 'lbmethod_byrequests');
  }
  if (params.sslBackend || backendUrl.startsWith('https://') || backendUrl.startsWith('wss://')) {
    modulesNeeded.push('ssl');
  }
  if (params.customHeaders && params.customHeaders.length > 0) {
    modulesNeeded.push('headers');
  }

  if (params.autoEnableModules !== false) {
    const loadedList = (discovery.loadedModules || []).map((m) => m.toLowerCase());
    const toEnable: string[] = [];

    for (const mod of modulesNeeded) {
      const isLoaded = loadedList.some(
        (m) => m.includes(`${mod}_module`) || m.includes(`mod_${mod}`)
      );
      if (!isLoaded) {
        toEnable.push(mod);
      }
    }

    if (toEnable.length > 0) {
      await enableApacheProxyModules(server, toEnable, ephemeralPassword);
    }
  }

  // Construct Apache configuration snippet
  let configSnippet = `\n# --- AI Studio Managed Apache Reverse Proxy Route: ${path} ---\n`;

  // 1. If Load Balancer pool is requested, define <Proxy balancer://...>
  if (params.isBalancer && params.balancerName && params.balancerMembers && params.balancerMembers.length > 0) {
    const balName = params.balancerName.trim().replace(/[^a-zA-Z0-9_\-]/g, '');
    const algo = params.balancerAlgorithm || 'byrequests';

    configSnippet += `<Proxy "balancer://${balName}">\n`;
    for (const member of params.balancerMembers) {
      if (member.url?.trim()) {
        const lf = member.loadfactor || 1;
        configSnippet += `    BalancerMember "${member.url.trim()}" loadfactor=${lf}\n`;
      }
    }
    configSnippet += `    ProxySet lbmethod=${algo}\n`;
    configSnippet += `</Proxy>\n\n`;
  }

  // 2. Define <Location "..."> block
  configSnippet += `<Location "${path}">\n`;
  let proxyPassOptions = '';
  if (params.timeout && params.timeout > 0) {
    proxyPassOptions += ` timeout=${params.timeout}`;
  }
  if (params.connectTimeout && params.connectTimeout > 0) {
    proxyPassOptions += ` connectiontimeout=${params.connectTimeout}`;
  }

  configSnippet += `    ProxyPass "${backendUrl}"${proxyPassOptions}\n`;
  configSnippet += `    ProxyPassReverse "${backendUrl}"\n`;

  if (params.preserveHost) {
    configSnippet += `    ProxyPreserveHost On\n`;
  }

  if (params.sslBackend) {
    configSnippet += `    SSLProxyEngine On\n`;
    if (params.sslVerify === false) {
      configSnippet += `    SSLProxyCheckPeerCN Off\n`;
      configSnippet += `    SSLProxyCheckPeerName Off\n`;
    }
  }

  // Standard reverse proxy headers
  configSnippet += `    RequestHeader set X-Forwarded-Proto "http"\n`;
  configSnippet += `    RequestHeader set X-Real-IP "%{REMOTE_ADDR}s"\n`;

  if (params.customHeaders && params.customHeaders.length > 0) {
    for (const h of params.customHeaders) {
      if (h.name?.trim() && h.value?.trim()) {
        configSnippet += `    RequestHeader set ${h.name.trim()} "${h.value.trim()}"\n`;
      }
    }
  }

  // WebSocket upgrade handling
  if (params.websocketSupport) {
    configSnippet += `    # WebSocket Upgrade Support\n`;
    configSnippet += `    RewriteEngine On\n`;
    configSnippet += `    RewriteCond %{HTTP:Upgrade} =websocket [NC]\n`;
    configSnippet += `    RewriteCond %{HTTP:Connection} upgrade [NC]\n`;
    const wsTarget = backendUrl.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
    configSnippet += `    RewriteRule .* "${wsTarget}%{REQUEST_URI}" [P,QSA,L]\n`;
  }

  configSnippet += `</Location>\n# --- End AI Studio Managed Route ---\n`;

  // Determine file placement
  const cleanId = Math.random().toString(36).substring(2, 8);
  const cleanPathTag = path.replace(/[^a-zA-Z0-9]/g, '-').replace(/^-+|-+$/g, '') || 'root';

  let targetFile = params.targetConfFile?.trim();
  let isDedicatedNewFile = false;

  if (!targetFile || targetFile === '') {
    isDedicatedNewFile = true;
    if (discovery.serverRoot?.includes('/httpd') || discovery.confPath?.includes('/httpd')) {
      targetFile = `/etc/httpd/conf.d/proxy-${cleanPathTag}-${cleanId}.conf`;
    } else {
      targetFile = `/etc/apache2/conf-available/proxy-${cleanPathTag}-${cleanId}.conf`;
    }
  }

  const base64Snippet = Buffer.from(configSnippet, 'utf-8').toString('base64');

  // Script to atomically deploy and verify syntax
  const deployScript = `export LC_ALL=C
TARGET_FILE="${targetFile}"
IS_NEW="${isDedicatedNewFile ? '1' : '0'}"

# Create backup if modifying existing file
if [ -f "$TARGET_FILE" ] && [ "$IS_NEW" = "0" ]; then
  cp "$TARGET_FILE" "\${TARGET_FILE}.bak_proxy" 2>&1
fi

mkdir -p "$(dirname "$TARGET_FILE")"

if [ "$IS_NEW" = "1" ]; then
  # Write dedicated file
  echo "${base64Snippet}" | base64 -d > "$TARGET_FILE"
  # On Debian/Ubuntu enable conf
  if command -v a2enconf >/dev/null 2>&1 && [[ "$TARGET_FILE" == */conf-available/* ]]; then
    CONF_NAME="$(basename "$TARGET_FILE" .conf)"
    a2enconf "$CONF_NAME" 2>&1
  fi
else
  # Append to existing file or insert before </VirtualHost> if present
  if grep -qi "</VirtualHost>" "$TARGET_FILE"; then
    python3 -c '
import sys
content = open(sys.argv[1], "r").read()
snippet = """${configSnippet}"""
pos = content.rfind("</VirtualHost>")
if pos != -1:
    new_content = content[:pos] + "\\n" + snippet + "\\n" + content[pos:]
    open(sys.argv[1], "w").write(new_content)
else:
    open(sys.argv[1], "a").write("\\n" + snippet)
' "$TARGET_FILE"
  else
    echo "${base64Snippet}" | base64 -d >> "$TARGET_FILE"
  fi
fi

# Syntax verification
${binary} -t 2>&1
`;

  const output = await runAdaptiveSshCommand(server, deployScript, ephemeralPassword, 15000);

  if (output.toLowerCase().includes('syntax ok')) {
    // Reload Apache gracefully
    const reloadCmd = `systemctl reload ${serviceName} 2>/dev/null || apachectl -k graceful 2>/dev/null || true`;
    await runAdaptiveSshCommand(server, reloadCmd, ephemeralPassword, 8000);

    // Clean up temporary backup on success
    if (!isDedicatedNewFile) {
      await runAdaptiveSshCommand(
        server,
        `rm -f "${targetFile}.bak_proxy" 2>/dev/null || true`,
        ephemeralPassword,
        4000
      ).catch(() => {});
    }

    return {
      success: true,
      message: `Reverse proxy route for '${path}' -> '${backendUrl}' created and deployed successfully.`,
      filePath: targetFile,
      output,
    };
  } else {
    // Rollback changes on syntax failure!
    const rollbackScript = `export LC_ALL=C
TARGET_FILE="${targetFile}"
IS_NEW="${isDedicatedNewFile ? '1' : '0'}"

if [ "$IS_NEW" = "1" ]; then
  if command -v a2disconf >/dev/null 2>&1 && [[ "$TARGET_FILE" == */conf-available/* ]]; then
    CONF_NAME="$(basename "$TARGET_FILE" .conf)"
    a2disconf "$CONF_NAME" 2>/dev/null || true
  fi
  rm -f "$TARGET_FILE"
elif [ -f "\${TARGET_FILE}.bak_proxy" ]; then
  mv "\${TARGET_FILE}.bak_proxy" "$TARGET_FILE"
fi
`;
    await runAdaptiveSshCommand(server, rollbackScript, ephemeralPassword, 8000).catch(() => {});

    throw new Error(
      `Apache configuration syntax error detected. Changes rolled back:\n${output.trim()}`
    );
  }
}

/**
 * Safely removes a reverse proxy route or load balancer configuration.
 */
export async function deleteApacheProxyRoute(
  server: RemoteServer,
  routeId: string,
  filePath: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string; output?: string }> {
  const discovery = await discoverApacheInstallation(server, ephemeralPassword);
  const binary = discovery.binaryPath || 'apache2';
  const serviceName = discovery.serviceName || 'apache2';

  if (!isLikelyApacheBinary(binary)) {
    throw new Error(`Untrusted or invalid Apache binary: ${binary}`);
  }

  const script = `export LC_ALL=C
FILE="${filePath}"

if [ ! -f "$FILE" ]; then
  echo "File does not exist: $FILE"
  exit 0
fi

# If it is a dedicated proxy-*.conf file, remove or disable it
if [[ "$(basename "$FILE")" == proxy-*.conf ]]; then
  if command -v a2disconf >/dev/null 2>&1 && [[ "$FILE" == */conf-available/* ]]; then
    CONF_NAME="$(basename "$FILE" .conf)"
    a2disconf "$CONF_NAME" 2>/dev/null || true
  fi
  rm -f "$FILE"
else
  # It is inside a shared or VirtualHost file, remove AI Studio managed block or comment it
  cp "$FILE" "\${FILE}.bak_pdel"
  python3 -c '
import sys, re
fpath = sys.argv[1]
with open(fpath, "r") as fp:
    c = fp.read()
# Try removing matched block
c_clean = re.sub(r"# --- AI Studio Managed Apache Reverse Proxy Route:.*?# --- End AI Studio Managed Route ---", "", c, flags=re.DOTALL)
with open(fpath, "w") as fp:
    fp.write(c_clean)
' "$FILE"
fi

# Syntax check
${binary} -t 2>&1
`;

  const output = await runAdaptiveSshCommand(server, script, ephemeralPassword, 15000);

  if (output.toLowerCase().includes('syntax ok')) {
    const reloadCmd = `systemctl reload ${serviceName} 2>/dev/null || apachectl -k graceful 2>/dev/null || true`;
    await runAdaptiveSshCommand(server, reloadCmd, ephemeralPassword, 8000);
    await runAdaptiveSshCommand(server, `rm -f "${filePath}.bak_pdel" 2>/dev/null || true`, ephemeralPassword, 4000).catch(() => {});
    return {
      success: true,
      message: 'Apache reverse proxy route deleted successfully.',
      output,
    };
  } else {
    // Rollback
    await runAdaptiveSshCommand(
      server,
      `[ -f "${filePath}.bak_pdel" ] && mv "${filePath}.bak_pdel" "${filePath}"`,
      ephemeralPassword,
      6000
    ).catch(() => {});
    throw new Error(`Apache configuration syntax error after deletion. Changes rolled back:\n${output.trim()}`);
  }
}
