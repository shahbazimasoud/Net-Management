import net from 'net';
import { Client, ConnectConfig } from 'ssh2';

export interface SshDiscoveryOptions {
  ip: string;
  ssh_host?: string;
  ssh_port?: number;
  port?: number;
  ssh_username?: string;
  username?: string;
  ssh_password?: string;
  password?: string;
  enable_password?: string;
  protocol?: 'ssh' | 'telnet';
  connection_protocol?: 'ssh' | 'telnet';
  platform?: string;
  connection_mode?: 'ssh' | 'simulator';
  simulate?: boolean;
}

export interface DiscoveredSwitchPort {
  port_id: string;
  name: string;
  status: 'up' | 'down';
  admin_status: 'enabled' | 'disabled';
  mode: 'trunk' | 'access';
  vlan: number;
  allowed_vlans: string;
  speed: string;
  duplex: string;
  description: string;
  connected_device: string;
  type?: string;
}

export interface SshDiscoveryResult {
  success: boolean;
  connected: boolean;
  protocol: string;
  ip: string;
  port: number;
  latency_ms?: number;
  message: string;
  error?: string;
  banner?: string;
  hostname?: string;
  model?: string;
  total_ports?: number;
  ports?: DiscoveredSwitchPort[];
  raw_status_output?: string;
  live_discovery?: boolean;
  simulated?: boolean;
}

/**
 * Parses Cisco `show interfaces status` CLI command output into structured port records.
 */
export function parseShowInterfacesStatus(output: string): DiscoveredSwitchPort[] {
  const lines = output.split(/\r?\n/);
  const ports: DiscoveredSwitchPort[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('Port ') || trimmed.startsWith('----') || trimmed.includes('Invalid input')) {
      continue;
    }

    // Matches standard Cisco switch interface names: Gi1/0/1, Fa0/1, Te1/0/1, Et0/0, GigabitEthernet1/0/1, etc.
    const portMatch = trimmed.match(/^([A-Za-z]{1,4}\d+(?:\/\d+)*(?:\.\d+)?)\s+(.*)$/);
    if (!portMatch) continue;

    const portName = portMatch[1];
    const rest = portMatch[2];

    // Status is typically: connected | notconnect | disabled | err-disabled | inactive | monitoring | suspended | up | down
    const m = rest.match(/(.*?)\s*(connected|notconnect|disabled|err-disabled|inactive|monitoring|suspended|up|down)\s+(\S+)\s+(\S+)\s+(\S+)(?:\s+(.*))?$/i);
    if (m) {
      const description = (m[1] || '').trim();
      const statusRaw = m[2].toLowerCase();
      const vlanRaw = m[3];
      const duplexRaw = m[4];
      const speedRaw = m[5];
      const typeRaw = (m[6] || '').trim();

      const isConnected = statusRaw === 'connected' || statusRaw === 'up';
      const isDisabled = statusRaw === 'disabled' || statusRaw === 'err-disabled';
      const isTrunk = vlanRaw.toLowerCase() === 'trunk' || vlanRaw.toLowerCase() === 'routed';
      const vlanNum = parseInt(vlanRaw, 10) || 1;

      ports.push({
        port_id: portName,
        name: portName,
        status: isConnected ? 'up' : 'down',
        admin_status: isDisabled ? 'disabled' : 'enabled',
        mode: isTrunk ? 'trunk' : 'access',
        vlan: isTrunk ? 1 : vlanNum,
        allowed_vlans: isTrunk ? 'ALL' : String(vlanNum),
        speed: speedRaw.replace(/^a-/, ''),
        duplex: duplexRaw.replace(/^a-/, ''),
        description: description || '',
        connected_device: description || (isConnected ? 'Connected Device' : '-'),
        type: typeRaw || undefined,
      });
    }
  }

  return ports;
}

/**
 * Extracts hostname and hardware model from Cisco `show version` & `show running-config` command outputs.
 */
export function parseDeviceVersionAndHostname(output: string): { hostname: string; model: string } {
  let hostname = '';
  let model = '';

  // Hostname extraction: from `hostname <name>` or prompt `<name>#` or `<name>>`
  const hostMatch = output.match(/hostname\s+([A-Za-z0-9_\-\.]+)/i) ||
                    output.match(/([A-Za-z0-9_\-\.]+)[>#]\s*$/m) ||
                    output.match(/([A-Za-z0-9_\-\.]+)#\s*show/i);
  if (hostMatch) {
    hostname = hostMatch[1].trim();
  }

  // Model extraction from show version
  const modelMatch = output.match(/Model\s*(?:number)?\s*:\s*([A-Za-z0-9\-]+)/i) ||
                     output.match(/cisco\s+([A-Za-z0-9\-]+)\s+\(/i) ||
                     output.match(/Switch\s+1\s+\d+\s+([A-Za-z0-9\-]+)/i) ||
                     output.match(/Cisco\s+(Catalyst\s+[A-Za-z0-9\-]+)/i);
  if (modelMatch) {
    model = modelMatch[1].trim();
  }

  return { hostname, model };
}

/**
 * Generates realistic Cisco Catalyst switch port telemetry for sandbox/simulator testing.
 */
export function generateSimulatedSwitchData(targetHost: string, baseModel?: string): {
  hostname: string;
  model: string;
  total_ports: number;
  ports: DiscoveredSwitchPort[];
  raw_status_output: string;
} {
  const model = baseModel || 'Cisco Catalyst 2960X-24TD-L';
  const cleanHost = targetHost.replace(/[^a-zA-Z0-9]/g, '-').toUpperCase();
  const hostname = `SW-CAT2960X-${cleanHost.slice(-6) || 'ACC01'}`;

  const portDefinitions: Array<{
    id: string;
    desc: string;
    status: 'up' | 'down';
    admin: 'enabled' | 'disabled';
    mode: 'trunk' | 'access';
    vlan: number;
    speed: string;
    duplex: string;
    type: string;
  }> = [
    { id: 'Gi1/0/1', desc: 'Uplink-To-Core-SW01', status: 'up', admin: 'enabled', mode: 'trunk', vlan: 1, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/2', desc: 'SW-DISTRIBUTION-02', status: 'up', admin: 'enabled', mode: 'trunk', vlan: 1, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/3', desc: 'Server-ESXi01-MGMT', status: 'up', admin: 'enabled', mode: 'access', vlan: 10, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/4', desc: 'Server-ESXi02-VMs', status: 'up', admin: 'enabled', mode: 'access', vlan: 10, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/5', desc: 'AP-Cisco-Floor1-North', status: 'up', admin: 'enabled', mode: 'trunk', vlan: 1, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/6', desc: 'AP-Cisco-Floor1-South', status: 'up', admin: 'enabled', mode: 'trunk', vlan: 1, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/7', desc: 'Printer-Admin-Dept', status: 'up', admin: 'enabled', mode: 'access', vlan: 20, speed: '100', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/8', desc: 'Workstation-Finance-01', status: 'up', admin: 'enabled', mode: 'access', vlan: 30, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/9', desc: 'Workstation-Finance-02', status: 'up', admin: 'enabled', mode: 'access', vlan: 30, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/10', desc: '', status: 'down', admin: 'enabled', mode: 'access', vlan: 1, speed: 'auto', duplex: 'auto', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/11', desc: 'VoIP-Conference-Room', status: 'up', admin: 'enabled', mode: 'access', vlan: 40, speed: '100', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/12', desc: 'CCTV-Gate-Camera-01', status: 'up', admin: 'enabled', mode: 'access', vlan: 50, speed: '100', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/13', desc: 'CCTV-Gate-Camera-02', status: 'up', admin: 'enabled', mode: 'access', vlan: 50, speed: '100', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/14', desc: 'Security-Port-Disabled', status: 'down', admin: 'disabled', mode: 'access', vlan: 1, speed: 'auto', duplex: 'auto', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/15', desc: 'Workstation-IT-01', status: 'up', admin: 'enabled', mode: 'access', vlan: 10, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/16', desc: 'Workstation-IT-02', status: 'up', admin: 'enabled', mode: 'access', vlan: 10, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/17', desc: '', status: 'down', admin: 'enabled', mode: 'access', vlan: 1, speed: 'auto', duplex: 'auto', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/18', desc: '', status: 'down', admin: 'enabled', mode: 'access', vlan: 1, speed: 'auto', duplex: 'auto', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/19', desc: 'NAS-Backup-Vault', status: 'up', admin: 'enabled', mode: 'access', vlan: 10, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/20', desc: 'Workstation-Marketing-01', status: 'up', admin: 'enabled', mode: 'access', vlan: 60, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/21', desc: '', status: 'down', admin: 'enabled', mode: 'access', vlan: 1, speed: 'auto', duplex: 'auto', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/22', desc: 'Monitoring-Probe-01', status: 'up', admin: 'enabled', mode: 'access', vlan: 1, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/23', desc: 'Trunk-To-Backup-SW', status: 'up', admin: 'enabled', mode: 'trunk', vlan: 1, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Gi1/0/24', desc: 'Trunk-DMZ-Segment', status: 'up', admin: 'enabled', mode: 'trunk', vlan: 1, speed: '1000', duplex: 'full', type: '10/100/1000BaseTX' },
    { id: 'Te1/0/1', desc: '10G-Fiber-Core-Link-A', status: 'up', admin: 'enabled', mode: 'trunk', vlan: 1, speed: '10G', duplex: 'full', type: 'SFP-10GBase-SR' },
    { id: 'Te1/0/2', desc: '10G-Fiber-Core-Link-B', status: 'down', admin: 'enabled', mode: 'trunk', vlan: 1, speed: 'auto', duplex: 'auto', type: 'Not Present' },
  ];

  let rawStatusOutput = `Port      Name               Status       Vlan       Duplex  Speed Type\n`;
  const ports: DiscoveredSwitchPort[] = portDefinitions.map((p) => {
    const statusText = p.admin === 'disabled' ? 'disabled' : (p.status === 'up' ? 'connected' : 'notconnect');
    const vlanText = p.mode === 'trunk' ? 'trunk' : String(p.vlan);
    const duplexText = p.duplex === 'full' ? 'a-full' : (p.duplex === 'half' ? 'a-half' : 'auto');
    const speedText = p.speed === '1000' ? 'a-1000' : (p.speed === '100' ? 'a-100' : p.speed);

    rawStatusOutput += `${p.id.padEnd(9)} ${p.desc.padEnd(18)} ${statusText.padEnd(12)} ${vlanText.padEnd(10)} ${duplexText.padEnd(7)} ${speedText.padEnd(6)} ${p.type}\n`;

    return {
      port_id: p.id,
      name: p.id,
      status: p.status,
      admin_status: p.admin,
      mode: p.mode,
      vlan: p.vlan,
      allowed_vlans: p.mode === 'trunk' ? 'ALL' : String(p.vlan),
      speed: p.speed,
      duplex: p.duplex,
      description: p.desc,
      connected_device: p.desc || (p.status === 'up' ? 'Connected Host' : '-'),
      type: p.type,
    };
  });

  return {
    hostname,
    model,
    total_ports: ports.length,
    ports,
    raw_status_output: rawStatusOutput,
  };
}

/**
 * Connects to the switch via real SSH, runs `show interfaces status` and `show version`,
 * and extracts switch ports, hostname, model, and port count.
 */
export async function testAndDiscoverDeviceViaSsh(options: SshDiscoveryOptions): Promise<SshDiscoveryResult> {
  const ip = (options.ssh_host || options.ip || '').trim();
  const proto = (options.protocol || options.connection_protocol || 'ssh').toLowerCase() as 'ssh' | 'telnet';
  const defaultPort = proto === 'telnet' ? 23 : 22;
  const port = Number(options.ssh_port || options.port || defaultPort);
  const user = (options.ssh_username || options.username || 'admin').trim();
  const pwd = options.ssh_password || options.password || '';
  const enablePwd = options.enable_password || '';
  const isSimulator = options.connection_mode === 'simulator' || options.simulate === true;

  if (!ip) {
    return {
      success: false,
      connected: false,
      protocol: proto.toUpperCase(),
      ip: '',
      port,
      message: 'آدرس IP تجهیز الزامی است.',
      error: 'IP address is required',
    };
  }

  // If simulator mode is explicitly set, return simulated live discovery
  if (isSimulator) {
    const simData = generateSimulatedSwitchData(ip, options.platform);
    return {
      success: true,
      connected: true,
      simulated: true,
      protocol: 'SSH (Simulator Live)',
      ip,
      port,
      latency_ms: 12,
      hostname: simData.hostname,
      model: simData.model,
      total_ports: simData.total_ports,
      ports: simData.ports,
      raw_status_output: simData.raw_status_output,
      live_discovery: true,
      message: `اتصال شبیه‌ساز با موفقیت برقرار شد. ${simData.total_ports} پورت با دستور show interface status شناسایی شد.`,
    };
  }

  // 1. Initial TCP socket connection probe (timeout: 2500ms)
  const startT = Date.now();
  const socketCheck = await new Promise<{ ok: boolean; banner?: string; error?: string }>((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2500);

    socket.once('connect', () => {
      socket.setTimeout(1200);
      socket.once('data', (data) => {
        const banner = data.toString('utf-8', 0, Math.min(data.length, 512)).trim();
        socket.destroy();
        resolve({ ok: true, banner });
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve({ ok: true, banner: `${proto.toUpperCase()} socket connected` });
      });
    });

    socket.once('timeout', () => {
      socket.destroy();
      resolve({ ok: false, error: `Connection timed out to ${ip}:${port}` });
    });

    socket.once('error', (err) => {
      socket.destroy();
      resolve({ ok: false, error: err.message });
    });

    socket.connect(port, ip);
  });

  const latency = Date.now() - startT;

  if (!socketCheck.ok) {
    return {
      success: false,
      connected: false,
      protocol: proto.toUpperCase(),
      ip,
      port,
      latency_ms: latency,
      error: socketCheck.error || `Failed to connect to ${ip}:${port}`,
      message: `عدم برقراری ارتباط با ${ip}:${port}: تجهیز پاسخگو نیست یا پورت ${port} بسته است.`,
    };
  }

  // 2. Real SSH session execution via ssh2
  if (proto === 'ssh') {
    return new Promise<SshDiscoveryResult>((resolve) => {
      const conn = new Client();
      let streamOutput = '';
      let isResolved = false;

      const finishResolve = (res: SshDiscoveryResult) => {
        if (!isResolved) {
          isResolved = true;
          try {
            conn.end();
          } catch {
            // ignore
          }
          resolve(res);
        }
      };

      const sshTimeout = setTimeout(() => {
        finishResolve({
          success: false,
          connected: true,
          protocol: 'SSH',
          ip,
          port,
          latency_ms: latency,
          error: 'SSH command execution timed out after 7 seconds',
          message: `اتصال اولیه SSH برقرار شد اما پاسخ دستورات از تجهیز ${ip} به موقع دریافت نگردید.`,
        });
      }, 7000);

      conn.on('keyboard-interactive', (name, instructions, lang, prompts, finish) => {
        finish([pwd]);
      });

      conn.on('error', (err) => {
        clearTimeout(sshTimeout);
        finishResolve({
          success: false,
          connected: false,
          protocol: 'SSH',
          ip,
          port,
          latency_ms: latency,
          error: err.message,
          message: `خطای احراز هویت یا دسترسی SSH به ${ip}:${port}: ${err.message}`,
        });
      });

      conn.on('ready', () => {
        // Authenticated! Now allocate an interactive pseudo-terminal shell
        conn.shell({ term: 'vt100', cols: 250, rows: 80 }, (err, stream) => {
          if (err) {
            clearTimeout(sshTimeout);
            return finishResolve({
              success: false,
              connected: true,
              protocol: 'SSH',
              ip,
              port,
              latency_ms: latency,
              error: `Failed to open SSH shell: ${err.message}`,
              message: `احراز هویت موفق بود ولی امکان ایجاد پوسته تعاملی (Shell) بر روی دستگاه وجود ندارد.`,
            });
          }

          stream.on('data', (chunk: Buffer) => {
            streamOutput += chunk.toString('utf-8');
          });

          stream.on('close', () => {
            clearTimeout(sshTimeout);
            processOutput();
          });

          // Send discovery command sequence to Cisco switch
          try {
            stream.write('terminal length 0\n');
            stream.write('terminal width 512\n');

            if (enablePwd) {
              stream.write('enable\n');
              setTimeout(() => {
                stream.write(`${enablePwd}\n`);
                stream.write('terminal length 0\n');
              }, 400);
            }

            setTimeout(() => {
              stream.write('show version\n');
              stream.write('show running-config | include hostname\n');
              stream.write('show interfaces status\n');
              stream.write('exit\n');
            }, 800);

            // Give the switch 2.5 seconds to send all port tables
            setTimeout(() => {
              clearTimeout(sshTimeout);
              processOutput();
            }, 3000);
          } catch (writeErr: any) {
            clearTimeout(sshTimeout);
            finishResolve({
              success: false,
              connected: true,
              protocol: 'SSH',
              ip,
              port,
              latency_ms: latency,
              error: writeErr.message,
              message: `خطا در ارسال فرامین به تجهیز: ${writeErr.message}`,
            });
          }

          function processOutput() {
            try {
              const { hostname, model } = parseDeviceVersionAndHostname(streamOutput);
              const ports = parseShowInterfacesStatus(streamOutput);
              const totalPorts = ports.length > 0 ? ports.length : 24;

              finishResolve({
                success: true,
                connected: true,
                live_discovery: true,
                protocol: 'SSH',
                ip,
                port,
                latency_ms: latency,
                banner: socketCheck.banner,
                hostname: hostname || undefined,
                model: model || undefined,
                total_ports: totalPorts,
                ports,
                raw_status_output: streamOutput,
                message: `ارتباط SSH با ${ip}:${port} برقرار و احراز هویت با موفقیت انجام شد. تعداد ${ports.length} پورت شناسایی گردید.`,
              });
            } catch (procErr: any) {
              finishResolve({
                success: true,
                connected: true,
                protocol: 'SSH',
                ip,
                port,
                latency_ms: latency,
                message: `اتصال SSH برقرار شد اما پردازش خروجی پورت‌ها با اخطار همراه بود: ${procErr.message}`,
              });
            }
          }
        });
      });

      // Connect with broad cipher suites to support both legacy and modern Cisco gear
      const connectOptions: ConnectConfig = {
        host: ip,
        port,
        username: user,
        password: pwd,
        readyTimeout: 5000,
        keepaliveInterval: 1000,
        tryKeyboard: true,
        algorithms: {
          kex: [
            'curve25519-sha256',
            'curve25519-sha256@libssh.org',
            'ecdh-sha2-nistp256',
            'ecdh-sha2-nistp384',
            'ecdh-sha2-nistp521',
            'diffie-hellman-group-exchange-sha256',
            'diffie-hellman-group14-sha256',
            'diffie-hellman-group14-sha1',
            'diffie-hellman-group-exchange-sha1',
            'diffie-hellman-group1-sha1',
          ],
          cipher: [
            'aes128-ctr',
            'aes192-ctr',
            'aes256-ctr',
            'aes128-gcm',
            'aes128-gcm@openssh.com',
            'aes256-gcm',
            'aes256-gcm@openssh.com',
            'aes256-cbc',
            'aes128-cbc',
            '3des-cbc',
          ],
          serverHostKey: [
            'ssh-ed25519',
            'ecdsa-sha2-nistp256',
            'ecdsa-sha2-nistp384',
            'ecdsa-sha2-nistp521',
            'rsa-sha2-512',
            'rsa-sha2-256',
            'ssh-rsa',
            'ssh-dss',
          ],
        },
      };

      try {
        conn.connect(connectOptions);
      } catch (connErr: any) {
        clearTimeout(sshTimeout);
        finishResolve({
          success: false,
          connected: false,
          protocol: 'SSH',
          ip,
          port,
          latency_ms: latency,
          error: connErr.message,
          message: `خطای راه‌اندازی اتصال SSH: ${connErr.message}`,
        });
      }
    });
  }

  // Fallback for Telnet
  return {
    success: true,
    connected: true,
    protocol: 'TELNET',
    ip,
    port,
    latency_ms: latency,
    banner: socketCheck.banner,
    message: `پورت تلنت ${ip}:${port} باز و در دسترس است.`,
  };
}
