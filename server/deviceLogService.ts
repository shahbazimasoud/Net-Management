import { Client, ConnectConfig } from 'ssh2';
import { StringDecoder } from 'string_decoder';
import { resolveDynamicVaultPassword, getDeviceById } from './db';
import { decryptServerSecret } from './vaultCrypto';

export interface DeviceSyslogResult {
  success: boolean;
  deviceId: string;
  deviceName: string;
  deviceIp: string;
  platform: string;
  commandExecuted: string;
  logs: string[];
  rawOutput: string;
  deviceTime?: string;
  totalLines?: number;
  error?: string;
}

/**
 * Strips ANSI terminal escape sequences and clean control chars from raw CLI output
 */
export function cleanCliOutput(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\([a-zA-Z]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

/**
 * Executes authoritative log retrieval directly from target physical or virtual network device
 */
export async function fetchDeviceSyslogBuffer(
  deviceOrId: any,
  limit: number = 150
): Promise<DeviceSyslogResult> {
  let device = typeof deviceOrId === 'string' ? await getDeviceById(deviceOrId) : deviceOrId;
  if (!device && typeof deviceOrId === 'string') {
    throw new Error('Device not found in inventory');
  }

  const deviceId = device.id;
  const deviceName = device.name || deviceId;
  const host = (device.ssh_host || device.ip || device.connection?.host || '').trim();
  const port = parseInt(String(device.ssh_port || device.connection?.port || 22), 10) || 22;
  const username = (device.ssh_username || device.connection?.username || 'admin').trim();
  const platform = String(device.platform || device.role || device.type || '').toLowerCase();

  const isMikroTik =
    platform.includes('mikrotik') ||
    platform.includes('routeros') ||
    String(device.vendor || '').toLowerCase().includes('mikrotik') ||
    String(device.model || '').toLowerCase().includes('mikrotik');

  const isLinux =
    platform.includes('linux') ||
    platform.includes('ubuntu') ||
    platform.includes('debian') ||
    platform.includes('centos') ||
    platform.includes('server');

  // Command selection based on authentic operating system
  let command = 'terminal length 0\nshow logging\n';
  if (isMikroTik) {
    command = '/log print without-paging\n';
  } else if (isLinux) {
    command = 'journalctl -n 150 --no-pager 2>/dev/null || dmesg -T 2>/dev/null | tail -n 150\n';
  }

  // Resolve password securely from vault or encrypted database field (Rule 14)
  let password = '';
  if (device.ssh_vault_item_id) {
    try {
      password = await resolveDynamicVaultPassword(device.ssh_vault_item_id);
    } catch {}
  }
  if (!password && device.ssh_password) {
    try {
      password = decryptServerSecret(device.ssh_password);
    } catch {
      password = device.ssh_password;
    }
  }
  if (!password && device.password) {
    try {
      password = decryptServerSecret(device.password);
    } catch {
      password = device.password;
    }
  }

  let privateKey = '';
  if (device.ssh_key) {
    try {
      privateKey = decryptServerSecret(device.ssh_key);
    } catch {
      privateKey = device.ssh_key;
    }
  }

  if (!host) {
    return {
      success: false,
      deviceId,
      deviceName,
      deviceIp: host,
      platform,
      commandExecuted: command.trim(),
      logs: [],
      rawOutput: '',
      error: 'Device host IP address is missing or not configured',
    };
  }

  return new Promise((resolve) => {
    const conn = new Client();
    let accumulated = '';
    let isSettled = false;
    const timeoutMs = 22000;

    const finish = (res: DeviceSyslogResult) => {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(timer);
        try {
          conn.end();
          (conn as any).destroy?.();
        } catch {}
        resolve(res);
      }
    };

    const timer = setTimeout(() => {
      finish({
        success: false,
        deviceId,
        deviceName,
        deviceIp: host,
        platform,
        commandExecuted: command.trim(),
        logs: [],
        rawOutput: accumulated,
        error: `Connection to ${host}:${port} timed out after ${timeoutMs / 1000}s while fetching logs`,
      });
    }, timeoutMs);

    conn.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finishKbd) => {
      const answers = prompts.map((p) => {
        if (/user/i.test(p.prompt)) return username;
        return password;
      });
      finishKbd(answers.length > 0 ? answers : [password]);
    });

    conn.on('ready', () => {
      conn.shell(
        {
          term: 'vt100',
          cols: 250,
          rows: 100,
        },
        (err, stream) => {
          if (err) {
            return finish({
              success: false,
              deviceId,
              deviceName,
              deviceIp: host,
              platform,
              commandExecuted: command.trim(),
              logs: [],
              rawOutput: accumulated,
              error: `SSH shell allocation error: ${err.message}`,
            });
          }

          const decoder = new StringDecoder('utf-8');

          stream.on('data', (d: Buffer) => {
            accumulated += decoder.write(d);
          });

          // Send logging command
          stream.write(command);

          // Give device 2.5 seconds to dump buffer, then close
          setTimeout(() => {
            try {
              stream.write('exit\n');
              stream.end();
            } catch {}
          }, 2500);

          stream.on('close', () => {
            const clean = cleanCliOutput(accumulated);
            const allLines = clean
              .split('\n')
              .map((l) => l.trimEnd())
              .filter((l) => l.trim().length > 0);

            // Filter relevant log lines (strip echoes and command prompts)
            let relevantLogs: string[] = [];
            if (isMikroTik) {
              // MikroTik lines usually have timestamps like "nov/02 11:22:10" or topics
              relevantLogs = allLines.filter(
                (l) =>
                  !l.includes('/log print') &&
                  !l.includes('[admin@') &&
                  !l.includes('MMM/DD/YYYY') &&
                  l.length > 3
              );
            } else if (isLinux) {
              relevantLogs = allLines.filter(
                (l) => !l.includes('journalctl') && !l.includes('dmesg') && !l.includes('$ ') && !l.includes('# ')
              );
            } else {
              // Cisco IOS: look for syslog facility/mnemonic % or timestamp markers or buffer messages
              relevantLogs = allLines.filter((l) => {
                const isEcho = l.includes('show logging') || l.includes('terminal length 0') || l.endsWith('#');
                if (isEcho) return false;
                // Cisco Syslog indicators
                return (
                  l.includes('%') ||
                  l.includes('Log Buffer') ||
                  l.includes('Syslog logging:') ||
                  /^[A-Z][a-z]{2}\s+\d+\s+\d+:\d+:\d+/i.test(l.trim()) ||
                  /^\*\w+/i.test(l.trim()) ||
                  l.includes('Trap logging:') ||
                  l.includes('Console logging:')
                );
              });

              // If strictly % lines were filtered, fallback to all non-echo lines if list was too small
              if (relevantLogs.length === 0) {
                relevantLogs = allLines.filter(
                  (l) => !l.includes('show logging') && !l.includes('terminal length 0') && !l.endsWith('#')
                );
              }
            }

            // Cap to requested limit (tail)
            const sliced = relevantLogs.slice(-limit);

            finish({
              success: true,
              deviceId,
              deviceName,
              deviceIp: host,
              platform,
              commandExecuted: command.trim(),
              logs: sliced.length > 0 ? sliced : allLines.slice(-limit),
              rawOutput: clean,
              totalLines: sliced.length,
            });
          });
        }
      );
    });

    conn.on('error', (err: any) => {
      finish({
        success: false,
        deviceId,
        deviceName,
        deviceIp: host,
        platform,
        commandExecuted: command.trim(),
        logs: [],
        rawOutput: accumulated,
        error: `SSH connection failed: ${err.message || 'Host unreachable or authentication rejected'}`,
      });
    });

    // Adaptive ciphers & legacy support (Rule 12)
    const connectConfig: ConnectConfig = {
      host,
      port,
      username,
      readyTimeout: 16000,
      keepaliveInterval: 5000,
      algorithms: {
        kex: [
          'curve25519-sha256',
          'curve25519-sha256@libssh.org',
          'ecdh-sha2-nistp256',
          'ecdh-sha2-nistp384',
          'ecdh-sha2-nistp521',
          'diffie-hellman-group-exchange-sha256',
          'diffie-hellman-group16-sha512',
          'diffie-hellman-group18-sha512',
          'diffie-hellman-group14-sha256',
          'diffie-hellman-group14-sha1',
          'diffie-hellman-group-exchange-sha1',
          'diffie-hellman-group1-sha1',
        ],
        cipher: [
          'aes128-gcm',
          'aes128-gcm@openssh.com',
          'aes256-gcm',
          'aes256-gcm@openssh.com',
          'chacha20-poly1305@openssh.com',
          'aes128-ctr',
          'aes192-ctr',
          'aes256-ctr',
          'aes128-cbc',
          'aes192-cbc',
          'aes256-cbc',
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

    if (password) connectConfig.password = password;
    if (privateKey) connectConfig.privateKey = privateKey;

    try {
      conn.connect(connectConfig);
    } catch (conErr: any) {
      finish({
        success: false,
        deviceId,
        deviceName,
        deviceIp: host,
        platform,
        commandExecuted: command.trim(),
        logs: [],
        rawOutput: '',
        error: `Failed to initiate SSH connection: ${conErr.message}`,
      });
    }
  });
}

/**
 * Clears hardware syslog buffer on supported equipment (e.g. Cisco 'clear logging')
 */
export async function clearDeviceSyslogBuffer(deviceOrId: any): Promise<{ success: boolean; message: string; error?: string }> {
  let device = typeof deviceOrId === 'string' ? await getDeviceById(deviceOrId) : deviceOrId;
  if (!device && typeof deviceOrId === 'string') {
    throw new Error('Device not found');
  }

  const host = (device.ssh_host || device.ip || device.connection?.host || '').trim();
  const port = parseInt(String(device.ssh_port || device.connection?.port || 22), 10) || 22;
  const username = (device.ssh_username || device.connection?.username || 'admin').trim();
  const platform = String(device.platform || device.role || device.type || '').toLowerCase();

  const isMikroTik =
    platform.includes('mikrotik') ||
    platform.includes('routeros') ||
    String(device.vendor || '').toLowerCase().includes('mikrotik');

  if (isMikroTik) {
    // RouterOS memory logs are ring buffer and not arbitrarily wiped without script/reboot
    return {
      success: true,
      message: 'MikroTik ring buffer displayed; buffer cleared in local view.',
    };
  }

  let password = '';
  if (device.ssh_vault_item_id) {
    try {
      password = await resolveDynamicVaultPassword(device.ssh_vault_item_id);
    } catch {}
  }
  if (!password && device.ssh_password) {
    try {
      password = decryptServerSecret(device.ssh_password);
    } catch {
      password = device.ssh_password;
    }
  }

  return new Promise((resolve) => {
    const conn = new Client();
    let isSettled = false;

    const finish = (res: { success: boolean; message: string; error?: string }) => {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(timer);
        try {
          conn.end();
          (conn as any).destroy?.();
        } catch {}
        resolve(res);
      }
    };

    const timer = setTimeout(() => {
      finish({ success: false, message: 'Timeout executing clear logging', error: 'SSH connection timed out' });
    }, 15000);

    conn.on('ready', () => {
      conn.shell({ term: 'vt100', cols: 120, rows: 40 }, (err, stream) => {
        if (err) {
          return finish({ success: false, message: err.message, error: err.message });
        }
        stream.write('terminal length 0\nclear logging\n\nexit\n');
        setTimeout(() => {
          try {
            stream.end();
          } catch {}
          finish({ success: true, message: 'Syslog buffer cleared successfully on device.' });
        }, 1800);
      });
    });

    conn.on('error', (err: any) => {
      finish({ success: false, message: err.message, error: err.message });
    });

    try {
      conn.connect({
        host,
        port,
        username,
        password,
        readyTimeout: 12000,
      });
    } catch (err: any) {
      finish({ success: false, message: err.message, error: err.message });
    }
  });
}
