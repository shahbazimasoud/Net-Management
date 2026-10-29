import net from 'net';
import { Client, ConnectConfig } from 'ssh2';
import { resolveDynamicVaultPassword, addAuditLog, getAllDevices, decryptFernetToken } from './db';
import { decryptServerSecret } from './vaultCrypto';
import { resolveSshBackend, executeSshBridgeAction } from './sshBackendResolver';

export interface CiscoConfigState {
  success: boolean;
  connected: boolean;
  device_id: string;
  device_name: string;
  ip: string;
  platform: string;
  timestamp: string;
  hostname: string;
  domain_name: string;
  vty: {
    transport_input: 'ssh' | 'telnet' | 'all' | 'none';
    exec_timeout_min: number;
    exec_timeout_sec: number;
    ssh_version: number;
    ssh_timeout: number;
    ssh_retries: number;
    rsa_bits?: number;
    login_local: boolean;
  };
  ntp: {
    servers: Array<{ server: string; prefer?: boolean }>;
    source_interface?: string;
    timezone_name?: string;
    timezone_offset_hours?: number;
    timezone_offset_minutes?: number;
    summer_time_enabled?: boolean;
    clock_time?: string;
    is_synced?: boolean;
    stratum?: number;
    reference?: string;
  };
  snmp: {
    communities: Array<{ community: string; permission: 'RO' | 'RW'; acl?: string }>;
    v3_users: Array<{ username: string; group?: string; auth?: string; priv?: string }>;
    traps_receivers: Array<{ host: string; version: string; community: string }>;
    location?: string;
    contact?: string;
    chassis_id?: string;
  };
  users: Array<{
    username: string;
    privilege: number;
    secret_type: string;
  }>;
  enable_secret_configured: boolean;
  stp: {
    mode: 'pvst' | 'rapid-pvst' | 'mst';
    bridge_priorities: Record<string, number>;
    portfast_default: boolean;
    bpduguard_default: boolean;
    bpdufilter_default: boolean;
    loopguard_default: boolean;
  };
  vtp: {
    mode: 'server' | 'client' | 'transparent' | 'off';
    domain: string;
    version: number;
    pruning: boolean;
    revision?: number;
  };
  syslog: {
    servers: string[];
    severity_level: string;
    timestamp_format: string;
    buffered_size: number;
  };
  vlans: Array<{
    id: number;
    name: string;
    status: string;
  }>;
  svi: {
    interface: string;
    ip: string;
    subnet: string;
    status: string;
  };
  default_gateway: string;
  l2_security: {
    dhcp_snooping: boolean;
    dhcp_snooping_vlans: string;
    arp_inspection: boolean;
    arp_inspection_vlans: string;
    ip_source_guard: boolean;
    errdisable_recovery_interval: number;
    errdisable_recovery_causes: string[];
  };
  raw_running_config?: string;
  has_unsaved_changes?: boolean;
  error?: string;
  errorFa?: string;
}

/**
 * Resolves and decrypts device credentials in memory for authentic connection establishment.
 * Strictly adheres to Rule 14 (in-flight server-side decryption only, zero frontend credential leak)
 * Supports dynamic Vault binding, AES-256-GCM tokens (enc:v1:), legacy Fernet tokens (enc:fernet:),
 * and hierarchy resolution from device.connection and device.ssh_* properties.
 */
export async function resolveDecryptedDeviceCredentials(device: any): Promise<{
  protocol: 'ssh' | 'telnet';
  host: string;
  port: number;
  username: string;
  password: string;
  enablePassword: string;
  sshVersion: 'legacy' | 'modern';
}> {
  // 1. Target Protocol determination
  const rawProto = (
    device.connection_protocol ||
    device.connection?.protocol ||
    (device.ssh_port === 23 || device.port === 23 ? 'telnet' : 'ssh')
  ).toLowerCase();
  const protocol: 'ssh' | 'telnet' = rawProto === 'telnet' ? 'telnet' : 'ssh';

  // 2. Target Host / IP determination
  const host = (
    device.connection?.host ||
    device.ssh_host ||
    device.ip ||
    ''
  ).trim();

  // 3. Port determination
  const defaultPort = protocol === 'telnet' ? 23 : 22;
  const port = Number(
    device.connection?.port ||
    device.ssh_port ||
    device.port ||
    defaultPort
  );

  // 4. Username determination
  const username = String(
    device.connection?.username ||
    device.ssh_username ||
    device.username ||
    'admin'
  ).trim();

  // 5. In-flight password decryption
  let rawPassword = String(
    device.connection?.password ||
    device.ssh_password ||
    device.password ||
    ''
  ).trim();

  if (device.ssh_vault_item_id && (!rawPassword || rawPassword.startsWith('vault:'))) {
    try {
      const resolved = await resolveDynamicVaultPassword(device.ssh_vault_item_id);
      if (resolved) rawPassword = resolved;
    } catch (e: any) {
      console.warn(`[CiscoConfigEngine] Dynamic vault resolution warning for ssh password:`, e?.message);
    }
  }

  let password = rawPassword;
  if (rawPassword.startsWith('enc:v1:')) {
    try {
      password = decryptServerSecret(rawPassword);
    } catch (err: any) {
      console.warn(`[CiscoConfigEngine] AES-256-GCM secret decryption notice:`, err?.message);
    }
  } else if (rawPassword.startsWith('enc:fernet:')) {
    try {
      const dec = decryptFernetToken(rawPassword);
      if (dec && !dec.startsWith('enc:fernet:')) {
        password = dec;
      }
    } catch (err: any) {
      console.warn(`[CiscoConfigEngine] Fernet token decryption notice:`, err?.message);
    }
  }

  // 6. In-flight enable password decryption
  let rawEnablePassword = String(device.enable_password || '').trim();
  if (device.enable_vault_item_id && (!rawEnablePassword || rawEnablePassword.startsWith('vault:'))) {
    try {
      const resolved = await resolveDynamicVaultPassword(device.enable_vault_item_id);
      if (resolved) rawEnablePassword = resolved;
    } catch (e: any) {
      console.warn(`[CiscoConfigEngine] Dynamic vault resolution warning for enable password:`, e?.message);
    }
  }

  let enablePassword = rawEnablePassword;
  if (rawEnablePassword.startsWith('enc:v1:')) {
    try {
      enablePassword = decryptServerSecret(rawEnablePassword);
    } catch (err: any) {
      console.warn(`[CiscoConfigEngine] AES-256-GCM enable secret decryption notice:`, err?.message);
    }
  } else if (rawEnablePassword.startsWith('enc:fernet:')) {
    try {
      const dec = decryptFernetToken(rawEnablePassword);
      if (dec && !dec.startsWith('enc:fernet:')) {
        enablePassword = dec;
      }
    } catch (err: any) {
      console.warn(`[CiscoConfigEngine] Fernet enable token decryption notice:`, err?.message);
    }
  }

  // 7. SSH version profile
  const rawSshVer = (
    device.ssh_version ||
    device.connection?.ssh_version ||
    (device.platform?.includes('modern') ? 'modern' : 'legacy')
  ).toLowerCase();
  const sshVersion: 'legacy' | 'modern' = rawSshVer === 'modern' ? 'modern' : 'legacy';

  return {
    protocol,
    host,
    port,
    username,
    password,
    enablePassword,
    sshVersion,
  };
}

/**
 * Executes CLI commands over an authentic Telnet connection (port 23 or custom)
 * Handles Cisco Telnet login challenges (Username:, Password:), privilege enable elevation,
 * and command batch streaming.
 */
export async function executeCiscoTelnet(
  host: string,
  port: number,
  user: string,
  pass: string,
  enablePass: string,
  commands: string[] | string,
  timeoutMs: number = 30000
): Promise<{ success: boolean; output: string; error?: string }> {
  const cliLines = Array.isArray(commands) ? commands : commands.split('\n');

  return new Promise((resolve) => {
    let accumulatedOutput = '';
    let isFinished = false;
    const socket = new net.Socket();

    const finish = (result: { success: boolean; output: string; error?: string }) => {
      if (!isFinished) {
        isFinished = true;
        clearTimeout(timer);
        try { socket.destroy(); } catch {}
        resolve(result);
      }
    };

    const timer = setTimeout(() => {
      finish({
        success: false,
        output: accumulatedOutput,
        error: `Telnet connection to ${host}:${port} timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    socket.setTimeout(timeoutMs);

    let sentUser = false;
    let sentPass = false;
    let sentEnable = false;
    let sentEnablePass = false;
    let commandsDispatched = false;

    socket.connect(port, host, () => {
      // Connected, await Telnet banner or login challenge
    });

    socket.on('data', (chunk: Buffer) => {
      // Handle Telnet IAC option negotiation
      const responseBuf: number[] = [];
      for (let i = 0; i < chunk.length; i++) {
        if (chunk[i] === 255 && i + 2 < chunk.length) {
          const cmd = chunk[i + 1];
          const opt = chunk[i + 2];
          if (cmd === 253) {
            responseBuf.push(255, 252, opt);
          } else if (cmd === 251) {
            responseBuf.push(255, 253, opt);
          }
          i += 2;
        }
      }
      if (responseBuf.length > 0) {
        try { socket.write(Buffer.from(responseBuf)); } catch {}
      }

      const text = chunk.toString('utf-8');
      accumulatedOutput += text;
      const lower = accumulatedOutput.toLowerCase();

      // Check authentication failures
      if (
        (lower.includes('% login invalid') || lower.includes('% bad passwords') || lower.includes('authentication failed')) &&
        sentPass
      ) {
        finish({
          success: false,
          output: accumulatedOutput,
          error: `Telnet authentication failed for user "${user}" on ${host}:${port}. Please verify credentials in Terminal Protocol & Credentials.`,
        });
        return;
      }

      // Respond to Username / Login prompt
      if (!sentUser && (lower.includes('username:') || lower.includes('login:'))) {
        sentUser = true;
        socket.write(`${user}\r\n`);
        return;
      }

      // Respond to Password prompt (initial login)
      if (!sentPass && lower.includes('password:') && !sentEnable) {
        sentPass = true;
        socket.write(`${pass}\r\n`);
        return;
      }

      // Check if prompt ends in '>' (Unprivileged mode, enter enable)
      if (
        !sentEnable &&
        (accumulatedOutput.trim().endsWith('>') || />\s*$/.test(accumulatedOutput))
      ) {
        sentEnable = true;
        socket.write('enable\r\n');
        return;
      }

      // Respond to enable password challenge
      if (sentEnable && !sentEnablePass && lower.includes('password:')) {
        sentEnablePass = true;
        socket.write(`${enablePass || pass}\r\n`);
        return;
      }

      // Enter privileged mode or user mode and dispatch commands
      const readyForCommands =
        (accumulatedOutput.includes('#') || accumulatedOutput.includes('>')) &&
        (sentPass || !pass);

      if (readyForCommands && !commandsDispatched) {
        commandsDispatched = true;
        socket.write('terminal length 0\r\n');

        setTimeout(() => {
          for (const line of cliLines) {
            if (line.trim()) {
              socket.write(`${line.trim()}\r\n`);
            }
          }

          setTimeout(() => {
            socket.write('\r\nexit\r\n');
            setTimeout(() => {
              finish({
                success: true,
                output: accumulatedOutput,
              });
            }, 1200);
          }, 800);
        }, 400);
      }
    });

    socket.on('error', (err) => {
      finish({
        success: false,
        output: accumulatedOutput,
        error: `Telnet error on ${host}:${port}: ${err.message}`,
      });
    });

    socket.on('close', () => {
      if (commandsDispatched) {
        finish({
          success: true,
          output: accumulatedOutput,
        });
      } else {
        finish({
          success: false,
          output: accumulatedOutput,
          error: `Telnet connection closed prematurely by ${host}:${port}`,
        });
      }
    });
  });
}

/**
 * Executes a CLI block on a Cisco device using adaptive SSH/Telnet with decrypted credentials.
 */
export async function executeCiscoCliDirect(
  device: any,
  commands: string[] | string,
  timeoutMs: number = 30000
): Promise<{ success: boolean; output: string; error?: string }> {
  const cliString = Array.isArray(commands) ? commands.join('\n') : commands;
  const creds = await resolveDecryptedDeviceCredentials(device);

  if (!creds.host) {
    return {
      success: false,
      output: '',
      error: 'No target IP address or hostname configured for device',
    };
  }

  // 1. If protocol is Telnet, execute via Telnet socket engine
  if (creds.protocol === 'telnet') {
    return executeCiscoTelnet(
      creds.host,
      creds.port,
      creds.username,
      creds.password,
      creds.enablePassword,
      commands,
      timeoutMs
    );
  }

  // 2. SSH Execution: First try Paramiko bridge with decrypted credentials
  try {
    const backend = resolveSshBackend(creds.sshVersion);
    const bridgeRes = await executeSshBridgeAction(
      'port-action',
      {
        device: {
          ...device,
          ssh_host: creds.host,
          ssh_port: creds.port,
          ssh_username: creds.username,
          ssh_password: creds.password,
          enable_password: creds.enablePassword,
        },
        action: 'batch_update',
        cli_command: cliString,
      },
      backend.version,
      timeoutMs
    );

    if (bridgeRes && bridgeRes.success && bridgeRes.output) {
      return {
        success: true,
        output: bridgeRes.output,
      };
    }
    if (bridgeRes && bridgeRes.error) {
      console.warn(`[CiscoConfigEngine Bridge Warning] ${bridgeRes.error}, attempting native ssh2 fallback...`);
    }
  } catch (bridgeErr: any) {
    console.warn(`[CiscoConfigEngine Bridge Exception] ${bridgeErr.message}, attempting native ssh2 fallback...`);
  }

  // 3. Native ssh2 client with comprehensive adaptive cipher suite & keyboard-interactive (Rule 12)
  return new Promise((resolve) => {
    const conn = new Client();
    let accumulatedOutput = '';
    let isFinished = false;

    const finish = (result: { success: boolean; output: string; error?: string }) => {
      if (!isFinished) {
        isFinished = true;
        clearTimeout(timer);
        try { conn.end(); } catch {}
        resolve(result);
      }
    };

    const timer = setTimeout(() => {
      finish({
        success: false,
        output: accumulatedOutput,
        error: `SSH execution to ${creds.host}:${creds.port} timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    conn.on('keyboard-interactive', (name, instructions, lang, prompts, finishKbd) => {
      const answers = prompts.map((p) => {
        if (/user/i.test(p.prompt)) return creds.username;
        return creds.password;
      });
      finishKbd(answers.length > 0 ? answers : [creds.password]);
    });

    conn.on('ready', () => {
      conn.shell({ term: 'vt100', cols: 250, rows: 80 }, (err, stream) => {
        if (err) {
          return finish({
            success: false,
            output: accumulatedOutput,
            error: `Failed to open SSH shell: ${err.message}`,
          });
        }

        stream.on('data', (d: Buffer) => {
          accumulatedOutput += d.toString('utf-8');
        });

        stream.on('close', () => {
          finish({
            success: true,
            output: accumulatedOutput,
          });
        });

        // Elevated prompt handling & Command streaming
        setTimeout(() => {
          // If switch prompt ends in '>', attempt entering enable mode
          if (accumulatedOutput.trim().endsWith('>') || />\s*$/.test(accumulatedOutput)) {
            stream.write('enable\r\n');
            if (creds.enablePassword) {
              setTimeout(() => {
                stream.write(`${creds.enablePassword}\r\n`);
              }, 300);
            }
          }

          setTimeout(() => {
            stream.write('terminal length 0\r\n');
            setTimeout(() => {
              const lines = cliString.split('\n');
              for (const line of lines) {
                if (line.trim()) {
                  stream.write(`${line.trim()}\r\n`);
                }
              }
              stream.write('\r\nexit\r\n');
            }, 300);
          }, 400);
        }, 300);
      });
    });

    conn.on('error', (err: any) => {
      const errMsg = err?.message || 'SSH connection error';
      finish({
        success: false,
        output: accumulatedOutput,
        error: errMsg.includes('All configured authentication methods failed')
          ? `SSH authentication rejected for user "${creds.username}" on ${creds.host}:${creds.port}. Please verify password in Terminal Protocol & Credentials.`
          : errMsg,
      });
    });

    const sshConfig: ConnectConfig = {
      host: creds.host,
      port: creds.port,
      username: creds.username,
      password: creds.password,
      readyTimeout: 12000,
      tryKeyboard: true,
      algorithms: {
        kex: [
          'curve25519-sha256',
          'curve25519-sha256@libssh.org',
          'ecdh-sha2-nistp256',
          'ecdh-sha2-nistp384',
          'ecdh-sha2-nistp521',
          'diffie-hellman-group1-sha1',
          'diffie-hellman-group14-sha1',
          'diffie-hellman-group14-sha256',
          'diffie-hellman-group16-sha512',
          'diffie-hellman-group18-sha512',
          'diffie-hellman-group-exchange-sha1',
          'diffie-hellman-group-exchange-sha256',
        ],
        cipher: [
          'aes128-cbc',
          '3des-cbc',
          'aes192-cbc',
          'aes256-cbc',
          'aes128-ctr',
          'aes192-ctr',
          'aes256-ctr',
          'aes128-gcm@openssh.com',
          'aes256-gcm@openssh.com',
          'chacha20-poly1305@openssh.com',
        ],
        serverHostKey: [
          'ssh-rsa',
          'ssh-dss',
          'ecdsa-sha2-nistp256',
          'ssh-ed25519',
          'rsa-sha2-256',
          'rsa-sha2-512',
        ],
        hmac: [
          'hmac-sha2-256-etm@openssh.com',
          'hmac-sha2-512-etm@openssh.com',
          'hmac-sha2-256',
          'hmac-sha2-512',
          'hmac-sha1',
          'hmac-sha1-96',
          'hmac-md5',
        ],
      },
    };

    try {
      conn.connect(sshConfig);
    } catch (e: any) {
      finish({
        success: false,
        output: accumulatedOutput,
        error: e?.message || 'Failed to initialize SSH connection',
      });
    }
  });
}

/**
 * Fetches and parses live configuration state from an authentic Cisco switch over SSH.
 */
export async function fetchCiscoConfigState(device: any): Promise<CiscoConfigState> {
  const host = (device.connection?.host || device.ssh_host || device.ip || '').trim();
  const baseResult: CiscoConfigState = {
    success: false,
    connected: false,
    device_id: device.id,
    device_name: device.name || 'Cisco Switch',
    ip: host,
    platform: device.platform || 'cisco_ios_xe',
    timestamp: new Date().toISOString(),
    hostname: device.name || 'Switch',
    domain_name: '',
    vty: {
      transport_input: 'ssh',
      exec_timeout_min: 10,
      exec_timeout_sec: 0,
      ssh_version: 2,
      ssh_timeout: 60,
      ssh_retries: 3,
      rsa_bits: 2048,
      login_local: true,
    },
    ntp: {
      servers: [],
      source_interface: 'Vlan1',
      timezone_name: 'IRST',
      timezone_offset_hours: 3,
      timezone_offset_minutes: 30,
      summer_time_enabled: true,
      clock_time: '',
      is_synced: false,
      stratum: 16,
    },
    snmp: {
      communities: [],
      v3_users: [],
      traps_receivers: [],
      location: '',
      contact: '',
      chassis_id: '',
    },
    users: [],
    enable_secret_configured: false,
    stp: {
      mode: 'pvst',
      bridge_priorities: { '1': 32768 },
      portfast_default: false,
      bpduguard_default: false,
      bpdufilter_default: false,
      loopguard_default: false,
    },
    vtp: {
      mode: 'transparent',
      domain: '',
      version: 2,
      pruning: false,
      revision: 0,
    },
    syslog: {
      servers: [],
      severity_level: 'informational',
      timestamp_format: 'datetime msec localtime show-timezone',
      buffered_size: 64000,
    },
    vlans: [
      { id: 1, name: 'default', status: 'active' },
    ],
    svi: {
      interface: 'Vlan1',
      ip: host,
      subnet: '255.255.255.0',
      status: 'up',
    },
    default_gateway: '',
    l2_security: {
      dhcp_snooping: false,
      dhcp_snooping_vlans: '',
      arp_inspection: false,
      arp_inspection_vlans: '',
      ip_source_guard: false,
      errdisable_recovery_interval: 300,
      errdisable_recovery_causes: ['bpduguard', 'dhcp-rate-limit', 'arp-inspection'],
    },
    has_unsaved_changes: Boolean(device.has_unsaved_changes),
  };

  if (!host) {
    baseResult.error = 'No IP address or terminal host configured';
    baseResult.errorFa = 'آدرس IP یا هاست اتصال برای این تجهیز در بخش Terminal Protocol & Credentials تنظیم نشده است';
    return baseResult;
  }

  // Probe live switch with comprehensive show commands
  const commands = [
    'terminal length 0',
    'show running-config',
    'show clock',
    'show ntp status',
    'show ntp associations',
    'show vtp status',
    'show spanning-tree summary',
    'show vlan brief',
    'show ip interface brief',
    'show ip default-gateway',
    'show ip dhcp snooping',
  ];

  const execRes = await executeCiscoCliDirect(device, commands, 35000);
  if (!execRes.success || !execRes.output) {
    baseResult.error = execRes.error || 'Failed to connect to Cisco switch';
    baseResult.errorFa = `برقراری ارتباط با سوئیچ سیسکو میسر نشد: ${execRes.error || 'عدم پاسخگویی سوئیچ'}. لطفاً از صحت آدرس IP، پورت، پروتکل و اطلاعات کاربری (Terminal Protocol & Credentials) در ویرایش تجهیز اطمینان حاصل فرمایید.`;
    return baseResult;
  }

  const out = execRes.output;
  baseResult.connected = true;
  baseResult.success = true;
  baseResult.raw_running_config = out;

  // 1. Hostname & Domain Name
  const hostMatch = out.match(/^hostname\s+([^\r\n]+)/im);
  if (hostMatch) baseResult.hostname = hostMatch[1].trim();

  const domainMatch = out.match(/^ip\s+domain[ -]name\s+([^\r\n]+)/im);
  if (domainMatch) baseResult.domain_name = domainMatch[1].trim();

  // 2. Line VTY & SSH
  const sshVerMatch = out.match(/^ip\s+ssh\s+version\s+(\d+)/im);
  if (sshVerMatch) baseResult.vty.ssh_version = parseInt(sshVerMatch[1], 10);

  const sshTimeoutMatch = out.match(/^ip\s+ssh\s+time-out\s+(\d+)/im);
  if (sshTimeoutMatch) baseResult.vty.ssh_timeout = parseInt(sshTimeoutMatch[1], 10);

  const sshRetryMatch = out.match(/^ip\s+ssh\s+authentication-retries\s+(\d+)/im);
  if (sshRetryMatch) baseResult.vty.ssh_retries = parseInt(sshRetryMatch[1], 10);

  if (/transport\s+input\s+all/i.test(out)) baseResult.vty.transport_input = 'all';
  else if (/transport\s+input\s+ssh\s+telnet/i.test(out) || /transport\s+input\s+telnet\s+ssh/i.test(out)) baseResult.vty.transport_input = 'all';
  else if (/transport\s+input\s+telnet/i.test(out)) baseResult.vty.transport_input = 'telnet';
  else if (/transport\s+input\s+ssh/i.test(out)) baseResult.vty.transport_input = 'ssh';
  else if (/transport\s+input\s+none/i.test(out)) baseResult.vty.transport_input = 'none';

  const execTimeoutMatch = out.match(/exec-timeout\s+(\d+)\s+(\d+)/i);
  if (execTimeoutMatch) {
    baseResult.vty.exec_timeout_min = parseInt(execTimeoutMatch[1], 10);
    baseResult.vty.exec_timeout_sec = parseInt(execTimeoutMatch[2], 10);
  }

  // 3. NTP & Clock
  const ntpServerMatches = out.matchAll(/^ntp\s+server\s+([a-zA-Z0-9\.\-_]+)(\s+prefer)?/gim);
  for (const m of ntpServerMatches) {
    baseResult.ntp.servers.push({
      server: m[1],
      prefer: Boolean(m[2]),
    });
  }

  const ntpSourceMatch = out.match(/^ntp\s+source\s+([^\r\n]+)/im);
  if (ntpSourceMatch) baseResult.ntp.source_interface = ntpSourceMatch[1].trim();

  const tzMatch = out.match(/^clock\s+timezone\s+([A-Za-z]+)\s+([+\-]?\d+)(?:\s+(\d+))?/im);
  if (tzMatch) {
    baseResult.ntp.timezone_name = tzMatch[1];
    baseResult.ntp.timezone_offset_hours = parseInt(tzMatch[2], 10);
    baseResult.ntp.timezone_offset_minutes = tzMatch[3] ? parseInt(tzMatch[3], 10) : 0;
  }

  const clockMatch = out.match(/(\d{1,2}:\d{2}:\d{2}\.\d+)\s+([A-Za-z]+)\s+([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})/i);
  if (clockMatch) {
    baseResult.ntp.clock_time = `${clockMatch[1]} ${clockMatch[2]} ${clockMatch[4]} ${clockMatch[3]} ${clockMatch[5]}`;
  }

  if (/Clock is synchronized/i.test(out)) {
    baseResult.ntp.is_synced = true;
    const stratMatch = out.match(/stratum\s+(\d+)/i);
    if (stratMatch) baseResult.ntp.stratum = parseInt(stratMatch[1], 10);
    const refMatch = out.match(/reference is\s+([^\r\n,]+)/i);
    if (refMatch) baseResult.ntp.reference = refMatch[1].trim();
  }

  // 4. SNMP
  const communityMatches = out.matchAll(/^snmp-server\s+community\s+([^\s]+)\s+(RO|RW)(?:\s+([^\r\n]+))?/gim);
  for (const cm of communityMatches) {
    baseResult.snmp.communities.push({
      community: cm[1],
      permission: cm[2].toUpperCase() as 'RO' | 'RW',
      acl: cm[3] ? cm[3].trim() : undefined,
    });
  }

  const snmpHostMatches = out.matchAll(/^snmp-server\s+host\s+([^\s]+)\s+(?:version\s+(\S+))?\s+([^\r\n]+)/gim);
  for (const sh of snmpHostMatches) {
    baseResult.snmp.traps_receivers.push({
      host: sh[1],
      version: sh[2] || '2c',
      community: sh[3] || 'public',
    });
  }

  const snmpLocMatch = out.match(/^snmp-server\s+location\s+([^\r\n]+)/im);
  if (snmpLocMatch) baseResult.snmp.location = snmpLocMatch[1].trim();

  const snmpContactMatch = out.match(/^snmp-server\s+contact\s+([^\r\n]+)/im);
  if (snmpContactMatch) baseResult.snmp.contact = snmpContactMatch[1].trim();

  // 5. Users
  const userMatches = out.matchAll(/^username\s+([^\s]+)(?:\s+privilege\s+(\d+))?(?:\s+(secret|password))?\s+([^\r\n]+)/gim);
  for (const um of userMatches) {
    baseResult.users.push({
      username: um[1],
      privilege: um[2] ? parseInt(um[2], 10) : 1,
      secret_type: um[3] || 'secret',
    });
  }

  if (/^enable\s+secret/im.test(out)) {
    baseResult.enable_secret_configured = true;
  }

  // 6. Spanning Tree
  if (/spanning-tree\s+mode\s+rapid-pvst/i.test(out)) baseResult.stp.mode = 'rapid-pvst';
  else if (/spanning-tree\s+mode\s+mst/i.test(out)) baseResult.stp.mode = 'mst';
  else if (/spanning-tree\s+mode\s+pvst/i.test(out)) baseResult.stp.mode = 'pvst';

  baseResult.stp.portfast_default = /spanning-tree\s+portfast\s+(default|edge\s+default)/i.test(out);
  baseResult.stp.bpduguard_default = /spanning-tree\s+portfast\s+bpduguard\s+default/i.test(out);
  baseResult.stp.bpdufilter_default = /spanning-tree\s+portfast\s+bpdufilter\s+default/i.test(out);

  const prioMatches = out.matchAll(/^spanning-tree\s+vlan\s+([0-9,\-]+)\s+priority\s+(\d+)/gim);
  for (const pm of prioMatches) {
    baseResult.stp.bridge_priorities[pm[1]] = parseInt(pm[2], 10);
  }

  // 7. VTP
  const vtpModeMatch = out.match(/VTP\s+Operating\s+Mode\s*:\s*([A-Za-z]+)/i) || out.match(/^vtp\s+mode\s+([a-z]+)/im);
  if (vtpModeMatch) {
    const rawMode = vtpModeMatch[1].toLowerCase();
    if (['server', 'client', 'transparent', 'off'].includes(rawMode)) {
      baseResult.vtp.mode = rawMode as any;
    }
  }

  const vtpDomainMatch = out.match(/VTP\s+Domain\s+Name\s*:\s*([^\r\n]+)/i) || out.match(/^vtp\s+domain\s+([^\r\n]+)/im);
  if (vtpDomainMatch) baseResult.vtp.domain = vtpDomainMatch[1].trim();

  const vtpVerMatch = out.match(/VTP\s+version\s+running\s*:\s*(\d+)/i) || out.match(/^vtp\s+version\s+(\d+)/im);
  if (vtpVerMatch) baseResult.vtp.version = parseInt(vtpVerMatch[1], 10);

  const vtpRevMatch = out.match(/Configuration\s+Revision\s*:\s*(\d+)/i);
  if (vtpRevMatch) baseResult.vtp.revision = parseInt(vtpRevMatch[1], 10);

  baseResult.vtp.pruning = /VTP\s+Pruning\s+Mode\s*:\s*Enabled/i.test(out) || /^vtp\s+pruning/im.test(out);

  // 8. Syslog
  const logHostMatches = out.matchAll(/^logging\s+host\s+([^\s\r\n]+)/gim);
  for (const lh of logHostMatches) {
    baseResult.syslog.servers.push(lh[1]);
  }

  const logTrapMatch = out.match(/^logging\s+trap\s+([^\r\n]+)/im);
  if (logTrapMatch) baseResult.syslog.severity_level = logTrapMatch[1].trim();

  const logBufMatch = out.match(/^logging\s+buffered\s+(\d+)/im);
  if (logBufMatch) baseResult.syslog.buffered_size = parseInt(logBufMatch[1], 10);

  // 9. VLANs & Management SVI
  const vlanBriefMatches = out.matchAll(/^(\d+)\s+([a-zA-Z0-9_\-\.]+)\s+(active|act\/unsup|suspend)/gim);
  const foundVlans: Array<{ id: number; name: string; status: string }> = [];
  for (const vm of vlanBriefMatches) {
    foundVlans.push({
      id: parseInt(vm[1], 10),
      name: vm[2],
      status: vm[3].includes('act') ? 'active' : 'suspended',
    });
  }
  if (foundVlans.length > 0) {
    baseResult.vlans = foundVlans;
  }

  const sviMatch = out.match(/interface\s+Vlan(\d+)[\s\S]*?ip\s+address\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)/im);
  if (sviMatch) {
    baseResult.svi = {
      interface: `Vlan${sviMatch[1]}`,
      ip: sviMatch[2],
      subnet: sviMatch[3],
      status: 'up',
    };
  }

  const gwMatch = out.match(/^ip\s+default-gateway\s+([^\r\n]+)/im);
  if (gwMatch) baseResult.default_gateway = gwMatch[1].trim();

  // 10. Layer 2 Security
  baseResult.l2_security.dhcp_snooping = /ip\s+dhcp\s+snooping(?!\s+vlan)/im.test(out);
  const dhcpVlansMatch = out.match(/^ip\s+dhcp\s+snooping\s+vlan\s+([^\r\n]+)/im);
  if (dhcpVlansMatch) baseResult.l2_security.dhcp_snooping_vlans = dhcpVlansMatch[1].trim();

  baseResult.l2_security.arp_inspection = /ip\s+arp\s+inspection\s+vlan/im.test(out);
  const daiVlansMatch = out.match(/^ip\s+arp\s+inspection\s+vlan\s+([^\r\n]+)/im);
  if (daiVlansMatch) baseResult.l2_security.arp_inspection_vlans = daiVlansMatch[1].trim();

  return baseResult;
}

/**
 * Builds authentic Cisco IOS configuration commands and deploys them to the switch.
 */
export async function applyCiscoConfigTab(
  device: any,
  tab: string,
  payload: any,
  userName: string = 'admin',
  clientIp: string = '127.0.0.1'
): Promise<{ success: boolean; output: string; executedCommands: string[]; error?: string; errorFa?: string }> {
  const commands: string[] = ['configure terminal'];
  let actionLabel = `Cisco Config - Tab: ${tab}`;

  switch (tab) {
    case 'vty': {
      actionLabel = 'Cisco VTY & SSH Update';
      if (payload.domain_name) {
        commands.push(`ip domain-name ${payload.domain_name}`);
      }
      if (payload.rsa_bits) {
        commands.push(`crypto key generate rsa modulus ${Number(payload.rsa_bits)}`);
      }
      if (payload.ssh_version) {
        commands.push(`ip ssh version ${Number(payload.ssh_version)}`);
      }
      if (payload.ssh_timeout) {
        commands.push(`ip ssh time-out ${Number(payload.ssh_timeout)}`);
      }
      if (payload.ssh_retries) {
        commands.push(`ip ssh authentication-retries ${Number(payload.ssh_retries)}`);
      }
      commands.push('line vty 0 15');
      if (payload.transport_input) {
        if (payload.transport_input === 'ssh') commands.push(' transport input ssh');
        else if (payload.transport_input === 'telnet') commands.push(' transport input telnet');
        else if (payload.transport_input === 'all') commands.push(' transport input ssh telnet');
        else if (payload.transport_input === 'none') commands.push(' transport input none');
      }
      if (payload.exec_timeout_min !== undefined) {
        const sec = payload.exec_timeout_sec || 0;
        commands.push(` exec-timeout ${Number(payload.exec_timeout_min)} ${sec}`);
      }
      commands.push(' login local');
      commands.push('exit');
      break;
    }

    case 'ntp': {
      actionLabel = 'Cisco NTP & Clock Update';
      if (Array.isArray(payload.servers)) {
        for (const s of payload.servers) {
          const sIp = typeof s === 'string' ? s : s.server;
          const isPrefer = typeof s === 'object' && s.prefer;
          commands.push(`ntp server ${sIp}${isPrefer ? ' prefer' : ''}`);
        }
      }
      if (payload.source_interface) {
        commands.push(`ntp source ${payload.source_interface}`);
      }
      if (payload.timezone_name && payload.timezone_offset_hours !== undefined) {
        const offset = `${payload.timezone_offset_hours} ${payload.timezone_offset_minutes || 0}`;
        commands.push(`clock timezone ${payload.timezone_name} ${offset}`);
      }
      if (payload.summer_time_enabled) {
        commands.push('clock summer-time IRDT recurring');
      }
      break;
    }

    case 'snmp': {
      actionLabel = 'Cisco SNMP Suite Update';
      if (Array.isArray(payload.communities)) {
        for (const c of payload.communities) {
          commands.push(`snmp-server community ${c.community} ${c.permission || 'RO'}${c.acl ? ` ${c.acl}` : ''}`);
        }
      }
      if (Array.isArray(payload.traps_receivers)) {
        for (const tr of payload.traps_receivers) {
          commands.push(`snmp-server host ${tr.host} version ${tr.version || '2c'} ${tr.community || 'public'}`);
        }
      }
      if (payload.location) {
        commands.push(`snmp-server location ${payload.location}`);
      }
      if (payload.contact) {
        commands.push(`snmp-server contact ${payload.contact}`);
      }
      if (payload.chassis_id) {
        commands.push(`snmp-server chassis-id ${payload.chassis_id}`);
      }
      break;
    }

    case 'users': {
      actionLabel = 'Cisco Local User Provisioning';
      // Support array of users to provision: payload.users or payload.users_to_add
      const usersList = Array.isArray(payload.users)
        ? payload.users
        : (Array.isArray(payload.users_to_add) ? payload.users_to_add : []);

      if (usersList.length > 0) {
        for (const u of usersList) {
          if (u.username && (u.secret || u.password)) {
            const priv = u.privilege !== undefined ? parseInt(String(u.privilege), 10) : 15;
            const secretType = u.secret_type === 'password' ? 'password' : 'secret';
            const pass = u.secret || u.password;
            commands.push(`username ${u.username} privilege ${priv} ${secretType} ${pass}`);
          }
        }
      } else if (payload.username && (payload.secret || payload.password)) {
        const priv = payload.privilege !== undefined ? parseInt(String(payload.privilege), 10) : 15;
        const secretType = payload.secret_type === 'password' ? 'password' : 'secret';
        const pass = payload.secret || payload.password;
        commands.push(`username ${payload.username} privilege ${priv} ${secretType} ${pass}`);
      }

      // Support removing/deleting users
      const deleteList = Array.isArray(payload.delete_users)
        ? payload.delete_users
        : (Array.isArray(payload.users_to_remove) ? payload.users_to_remove : []);
      for (const delUser of deleteList) {
        const uName = typeof delUser === 'string' ? delUser : delUser?.username;
        if (uName && typeof uName === 'string') {
          commands.push(`no username ${uName.trim()}`);
        }
      }

      if (payload.enable_secret) {
        commands.push(`enable secret ${payload.enable_secret}`);
      }
      commands.push('line con 0');
      commands.push(' login local');
      commands.push('exit');
      break;
    }

    case 'stp': {
      actionLabel = 'Cisco STP & Spanning-Tree Update';
      if (payload.mode) {
        commands.push(`spanning-tree mode ${payload.mode}`);
      }
      if (payload.bridge_priorities && typeof payload.bridge_priorities === 'object') {
        for (const [vlan, prio] of Object.entries(payload.bridge_priorities)) {
          commands.push(`spanning-tree vlan ${vlan} priority ${prio}`);
        }
      }
      if (payload.portfast_default !== undefined) {
        commands.push(`spanning-tree portfast ${payload.portfast_default ? 'default' : 'no default'}`);
      }
      if (payload.bpduguard_default !== undefined) {
        commands.push(`spanning-tree portfast bpduguard ${payload.bpduguard_default ? 'default' : 'no default'}`);
      }
      if (payload.bpdufilter_default !== undefined) {
        commands.push(`spanning-tree portfast bpdufilter ${payload.bpdufilter_default ? 'default' : 'no default'}`);
      }
      break;
    }

    case 'vtp': {
      actionLabel = 'Cisco VTP Suite Update';
      if (payload.domain) {
        commands.push(`vtp domain ${payload.domain}`);
      }
      if (payload.mode) {
        commands.push(`vtp mode ${payload.mode}`);
      }
      if (payload.version) {
        commands.push(`vtp version ${payload.version}`);
      }
      if (payload.password) {
        commands.push(`vtp password ${payload.password}`);
      }
      if (payload.pruning !== undefined) {
        commands.push(payload.pruning ? 'vtp pruning' : 'no vtp pruning');
      }
      break;
    }

    case 'syslog': {
      actionLabel = 'Cisco Syslog Logging Update';
      if (Array.isArray(payload.servers)) {
        for (const s of payload.servers) {
          commands.push(`logging host ${s}`);
        }
      }
      if (payload.severity_level) {
        commands.push(`logging trap ${payload.severity_level}`);
      }
      if (payload.buffered_size) {
        commands.push(`logging buffered ${payload.buffered_size}`);
      }
      commands.push('service timestamps log datetime msec localtime show-timezone');
      break;
    }

    case 'vlans': {
      actionLabel = 'Cisco VLAN & SVI Update';
      if (Array.isArray(payload.vlans)) {
        for (const v of payload.vlans) {
          commands.push(`vlan ${v.id}`);
          if (v.name) commands.push(` name ${v.name}`);
          commands.push('exit');
        }
      }
      if (payload.svi && payload.svi.interface && payload.svi.ip && payload.svi.subnet) {
        commands.push(`interface ${payload.svi.interface}`);
        commands.push(` ip address ${payload.svi.ip} ${payload.svi.subnet}`);
        commands.push(' no shutdown');
        commands.push('exit');
      }
      if (payload.default_gateway) {
        commands.push(`ip default-gateway ${payload.default_gateway}`);
      }
      break;
    }

    case 'l2_security': {
      actionLabel = 'Cisco Layer 2 Security Update';
      if (payload.dhcp_snooping !== undefined) {
        commands.push(payload.dhcp_snooping ? 'ip dhcp snooping' : 'no ip dhcp snooping');
        if (payload.dhcp_snooping_vlans) {
          commands.push(`ip dhcp snooping vlan ${payload.dhcp_snooping_vlans}`);
        }
      }
      if (payload.arp_inspection !== undefined && payload.arp_inspection_vlans) {
        commands.push(`ip arp inspection vlan ${payload.arp_inspection_vlans}`);
      }
      if (payload.errdisable_recovery_interval) {
        commands.push(`errdisable recovery interval ${Number(payload.errdisable_recovery_interval)}`);
      }
      break;
    }

    case 'write_memory':
    case 'save_nvram': {
      actionLabel = 'Cisco NVRAM Commit (Write Memory)';
      commands.length = 0; // Don't need configure terminal for write memory
      commands.push('write memory');
      break;
    }

    default:
      if (Array.isArray(payload.commands)) {
        commands.push(...payload.commands);
      }
  }

  if (tab !== 'write_memory' && tab !== 'save_nvram') {
    commands.push('end');
    if (payload.write_memory !== false) {
      commands.push('write memory');
    }
  }

  // Execute on hardware
  const execRes = await executeCiscoCliDirect(device, commands, 40000);

  // Add audit log entry
  await addAuditLog({
    userName,
    action: actionLabel,
    category: 'config',
    target: `${device.name || 'Cisco Switch'} (${device.ip || 'N/A'})`,
    status: execRes.success ? 'success' : 'failed',
    details: JSON.stringify({
      tab,
      commands,
      output: execRes.output.slice(0, 1000),
      error: execRes.error,
    }),
    ipAddress: clientIp,
  });

  return {
    success: execRes.success,
    output: execRes.output,
    executedCommands: commands,
    error: execRes.error,
    errorFa: execRes.error ? `خطا در اعمال تنظیمات روی سوئیچ سیسکو: ${execRes.error}` : undefined,
  };
}
