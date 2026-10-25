import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { StringDecoder } from 'string_decoder';
import { WebSocketServer, WebSocket } from 'ws';
import { Client, ConnectConfig } from 'ssh2';
import { getDeviceById, getAllDevices, updateDevice, resolveDynamicVaultPassword } from './db';

/**
 * Safely decrypts Fernet-encrypted tokens ('enc:fernet:...') using Node.js crypto
 */
function decryptFernetCredential(encrypted: string, projectRoot: string): string {
  if (!encrypted || typeof encrypted !== 'string') return '';
  if (!encrypted.startsWith('enc:fernet:')) return encrypted;

  const tokenStr = encrypted.replace(/^enc:fernet:/, '');
  try {
    const raw = Buffer.from(tokenStr.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (raw.length < 57) return encrypted;

    const candidateKeys: Buffer[] = [];
    const envKey = process.env.NETTOP_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
    if (envKey) {
      try {
        const b = Buffer.from(envKey.trim().replace(/-/g, '+').replace(/_/g, '/'), 'base64');
        if (b.length === 32) candidateKeys.push(b);
      } catch {}
    }

    const keyPath = path.resolve(projectRoot, 'backend', 'security', '.secret.key');
    if (fs.existsSync(keyPath)) {
      try {
        const rawKey = fs.readFileSync(keyPath, 'utf-8').trim();
        const b = Buffer.from(rawKey.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
        if (b.length === 32) candidateKeys.push(b);
      } catch {}
    }

    const seedSecrets = [
      process.env.VAULT_SECRET,
      process.env.JWT_SECRET,
      'nettopology_vault_master_key_2026_aes256gcm_safe',
      'nettopology_super_secret_jwt_key_2026_cisco_ops',
    ];
    for (const s of seedSecrets) {
      if (s) {
        candidateKeys.push(crypto.createHash('sha256').update(s).digest());
      }
    }

    const iv = raw.subarray(9, 25);
    const ciphertext = raw.subarray(25, raw.length - 32);

    for (const keyBuffer of candidateKeys) {
      try {
        const encKey = keyBuffer.subarray(16, 32);
        const decipher = crypto.createDecipheriv('aes-128-cbc', encKey, iv);
        decipher.setAutoPadding(true);
        let decrypted = decipher.update(ciphertext, undefined, 'utf-8');
        decrypted += decipher.final('utf-8');
        if (decrypted && decrypted.length > 0) {
          return decrypted;
        }
      } catch {}
    }
    return encrypted;
  } catch {
    return encrypted;
  }
}

/**
 * Normalizes interface abbreviations for matching (e.g. GigabitEthernet0/1 -> gi0/1)
 */
function normalizePortName(name: string): string {
  if (!name) return '';
  return name
    .trim()
    .toLowerCase()
    .replace(/^gigabitethernet/i, 'gi')
    .replace(/^tengigabitethernet/i, 'te')
    .replace(/^twentyfivegige/i, 'twe')
    .replace(/^fortygigabitethernet/i, 'fo')
    .replace(/^hundredgige/i, 'hu')
    .replace(/^fastethernet/i, 'fa')
    .replace(/^ethernet/i, 'et')
    .replace(/^port-channel/i, 'po')
    .replace(/^vlan/i, 'vl')
    .replace(/\s+/g, '');
}

/**
 * Robust port matching helper between Syslog event and switch port inventory
 */
function findMatchingPort(ports: any[], rawTargetName: string): any | null {
  if (!Array.isArray(ports) || ports.length === 0 || !rawTargetName) return null;
  const targetNorm = normalizePortName(rawTargetName);

  // 1. Direct match by port_id, name, or port
  for (const p of ports) {
    const pId = normalizePortName(p.port_id || '');
    const pName = normalizePortName(p.name || '');
    const pPort = normalizePortName((p as any).port || '');

    if (pId === targetNorm || pName === targetNorm || pPort === targetNorm) {
      return p;
    }
  }

  // 2. Suffix match (e.g. "0/1" or "1")
  for (const p of ports) {
    const pId = normalizePortName(p.port_id || '');
    const pName = normalizePortName(p.name || '');
    if (targetNorm.endsWith('/' + pId) || targetNorm.endsWith(pId) || pId.endsWith(targetNorm)) {
      return p;
    }
    if (pName && (targetNorm.endsWith('/' + pName) || pName.endsWith(targetNorm))) {
      return p;
    }
  }

  return null;
}

/**
 * WebSocket Gateway for Real-Time Port Monitoring (Cisco `terminal monitor` & MikroTik live link events)
 */
export function setupPortMonitorWebSocket(server: http.Server, projectRoot: string) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = req.url || '';
    if (
      url.startsWith('/ws/ports-monitor') ||
      url.startsWith('/ws/ports/monitor') ||
      url.startsWith('/api/ports/monitor') ||
      url.startsWith('/ws/port-monitor')
    ) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  wss.on('connection', async (clientWs: WebSocket, req: http.IncomingMessage) => {
    const hostHeader = req.headers.host || '127.0.0.1:3000';
    const parsedUrl = new URL(req.url || '', `http://${hostHeader}`);

    let activeDeviceId =
      parsedUrl.searchParams.get('deviceId') ||
      parsedUrl.searchParams.get('device_id') ||
      '';
    const rawLang = parsedUrl.searchParams.get('lang') || parsedUrl.searchParams.get('language') || 'fa';
    const isEn = rawLang.toLowerCase() === 'en';

    let sshConn: Client | null = null;
    let activeStream: any = null;
    let isConnected = false;
    let isStopping = false;
    let pingInterval: NodeJS.Timeout | null = null;
    let lineBuffer = '';

    const sendClient = (data: any) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        try {
          clientWs.send(JSON.stringify(data));
        } catch (e: any) {
          console.warn('[PortMonitorWs] Send error:', e.message);
        }
      }
    };

    const cleanup = () => {
      isStopping = true;
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      try {
        if (activeStream) {
          activeStream.write('terminal no monitor\nexit\n');
          activeStream.removeAllListeners();
          activeStream.end();
          if (typeof activeStream.destroy === 'function') activeStream.destroy();
        }
      } catch {}
      try {
        if (sshConn) {
          sshConn.removeAllListeners();
          sshConn.end();
          if (typeof (sshConn as any).destroy === 'function') (sshConn as any).destroy();
        }
      } catch {}
      activeStream = null;
      sshConn = null;
      isConnected = false;
    };

    // Heartbeat to prevent proxy timeouts
    pingInterval = setInterval(() => {
      if (clientWs.readyState === WebSocket.OPEN) {
        sendClient({ type: 'ping', timestamp: Date.now() });
      }
    }, 25000);

    const startMonitorSession = async (devId: string) => {
      if (sshConn || isConnected) {
        cleanup();
      }
      isStopping = false;
      activeDeviceId = devId;

      sendClient({
        type: 'status',
        status: 'connecting',
        deviceId: devId,
        message: isEn
          ? 'Connecting SSH session to activate terminal monitor...'
          : 'در حال برقراری نشست SSH جهت فعال‌سازی terminal monitor...',
      });

      let device: any = null;
      try {
        device = await getDeviceById(devId);
        if (!device) {
          const allDevs = await getAllDevices();
          device = allDevs.find((d: any) => d.id === devId || d.name === devId);
        }
      } catch (dbErr: any) {
        console.warn('[PortMonitorWs] Device lookup notice:', dbErr.message);
      }

      if (!device) {
        sendClient({
          type: 'error',
          status: 'failed',
          error: isEn ? 'Device not found' : 'دستگاه یافت نشد',
          message: isEn ? 'Device not found in inventory' : 'تجهیز مورد نظر در دیتابیس یافت نشد',
        });
        return;
      }

      const host = (device.ssh_host || device.ip || device.connection?.host || '').trim();
      const port = parseInt(String(device.ssh_port || device.connection?.port || 22), 10) || 22;
      let username = (device.ssh_username || device.connection?.username || 'admin').trim();
      let password = '';

      if (device.ssh_vault_item_id) {
        try {
          const vaultPass = await resolveDynamicVaultPassword(device.ssh_vault_item_id);
          if (vaultPass) password = vaultPass;
        } catch {}
      }
      if (!password) {
        password = device.ssh_password || device.connection?.password || '';
      }
      if (password) {
        password = decryptFernetCredential(password, projectRoot);
      }

      const privateKey = device.ssh_private_key || device.connection?.private_key;

      if (!host) {
        sendClient({
          type: 'error',
          status: 'failed',
          error: isEn ? 'No IP configured for device' : 'آدرس IP برای این دستگاه تنظیم نشده است',
        });
        return;
      }

      console.log(`[PortMonitorWs] Initiating live terminal monitor for ${device.name || host} (${host}:${port})`);

      sshConn = new Client();

      sshConn.on('error', (err: any) => {
        const rawErr = err?.message || 'SSH connection error';
        console.warn(`[PortMonitorWs] SSH error for ${device.name}:`, rawErr);
        sendClient({
          type: 'error',
          status: 'failed',
          error: rawErr,
          message: isEn ? `SSH Connection Failed: ${rawErr}` : `خطا در اتصال SSH: ${rawErr}`,
        });
        cleanup();
      });

      sshConn.on('close', () => {
        if (!isStopping) {
          sendClient({
            type: 'status',
            status: 'disconnected',
            deviceId: devId,
            message: isEn ? 'Terminal monitor session closed' : 'نشست مانیتورینگ زنده ترمینال بسته شد',
          });
        }
        cleanup();
      });

      sshConn.on('ready', () => {
        isConnected = true;
        sshConn?.shell(
          {
            term: 'vt100',
            cols: 160,
            rows: 40,
          },
          (err: any, stream: any) => {
            if (err) {
              sendClient({
                type: 'error',
                status: 'failed',
                error: err.message || 'Failed to allocate shell',
                message: isEn ? 'Failed to allocate interactive shell' : 'خطا در ایجاد پوسته ترمینال',
              });
              cleanup();
              return;
            }

            activeStream = stream;

            sendClient({
              type: 'MONITOR_ACTIVE',
              status: 'active',
              deviceId: device.id,
              deviceName: device.name,
              host,
              port,
              platform: device.platform || 'cisco_ios',
              message: isEn
                ? 'Terminal Monitor is LIVE. Physical interface changes will reflect immediately.'
                : 'دستور terminal monitor با موفقیت فعال شد. تغییرات فیزیکی پورت‌ها در لحظه اعمال می‌شود.',
            });

            // Is device MikroTik or Cisco?
            const isMikroTik =
              (device.vendor && device.vendor.toLowerCase().includes('mikrotik')) ||
              (device.role && device.role.toLowerCase().includes('mikrotik')) ||
              (device.model && device.model.toLowerCase().includes('mikrotik')) ||
              (device.platform && device.platform.toLowerCase().includes('routeros'));

            if (isMikroTik) {
              // MikroTik command to follow log events for interfaces
              stream.write('/log print follow where topics~"interface"\n');
            } else {
              // Cisco IOS / IOS-XE command sequence
              stream.write('terminal length 0\n');
              stream.write('terminal monitor\n');
            }

            const decoder = new StringDecoder('utf-8');

            stream.on('data', async (chunk: Buffer) => {
              const text = decoder.write(chunk);
              lineBuffer += text;

              // Process complete lines
              const lines = lineBuffer.split(/\r?\n/);
              lineBuffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                // 1. Cisco Syslog Link State Event:
                // %LINK-3-UPDOWN: Interface GigabitEthernet0/1, changed state to down
                // %LINEPROTO-5-UPDOWN: Line protocol on Interface GigabitEthernet0/1, changed state to down
                // %LINK-3-UPDOWN: Interface GigabitEthernet0/1, changed state to up
                // %LINEPROTO-5-UPDOWN: Line protocol on Interface GigabitEthernet0/1, changed state to up
                // %LINK-5-CHANGED: Interface GigabitEthernet0/1, changed state to administratively down
                // %ETH_PORT_CHANNEL-5-PORT_UP: Interface Port-channel1, ...
                const ciscoMatch = trimmed.match(
                  /%(?:LINK|LINEPROTO|ETH_PORT_CHANNEL)-[35]-(?:UPDOWN|CHANGED|PORT_UP|PORT_DOWN):\s+(?:Line\s+protocol\s+on\s+)?Interface\s+([A-Za-z0-9\/\.\-]+),?\s+(?:changed state to\s+)?(administratively down|admin down|up|down)/i
                );

                // 2. MikroTik Interface Link State Event:
                // interface ether1 link up
                // interface ether1 link down
                const mikrotikMatch = trimmed.match(
                  /(?:interface\s+)?([A-Za-z0-9\/\.\-]+)\s+link\s+(up|down)/i
                );

                const match = ciscoMatch || mikrotikMatch;
                if (match) {
                  const rawInterface = match[1];
                  const rawState = match[2].toLowerCase();

                  const isUp = rawState === 'up';
                  const isAdminDown = rawState.includes('admin');
                  const status = isUp ? 'up' : 'down';
                  const adminStatus = isAdminDown ? 'disabled' : (isUp ? 'enabled' : undefined);

                  console.log(`[PortMonitorWs] Detected live link change on ${device.name}: ${rawInterface} -> ${status} (${rawState})`);

                  // Match with existing ports inventory in PostgreSQL
                  let currentPorts: any[] = Array.isArray(device.ports) ? device.ports : [];
                  const matchedPort = findMatchingPort(currentPorts, rawInterface);
                  const resolvedPortId = matchedPort ? (matchedPort.port_id || matchedPort.name || matchedPort.port) : rawInterface;

                  // Update device record in PostgreSQL authoritatively
                  if (matchedPort) {
                    matchedPort.status = status;
                    if (adminStatus) {
                      matchedPort.admin_status = adminStatus;
                    }
                    try {
                      await updateDevice(device.id, { ports: currentPorts });
                    } catch (saveErr: any) {
                      console.warn('[PortMonitorWs] Error saving port state to DB:', saveErr.message);
                    }
                  }

                  // Broadcast instant state update to frontend
                  sendClient({
                    type: 'PORT_LIVE_STATUS',
                    deviceId: device.id,
                    portId: resolvedPortId,
                    rawInterface,
                    status,
                    admin_status: adminStatus || (status === 'up' ? 'enabled' : 'disabled'),
                    logLine: trimmed,
                    timestamp: new Date().toISOString(),
                    message: isEn
                      ? `[Live Monitor] Interface ${resolvedPortId} changed state to ${status.toUpperCase()}`
                      : `[پایش زنده] وضعیت پورت ${resolvedPortId} به ${status === 'up' ? 'وصل (UP)' : 'قطع (DOWN)'} تغییر یافت`,
                  });
                }
              }
            });

            stream.on('close', () => {
              cleanup();
            });
          }
        );
      });

      // Broad cipher suite negotiation for adaptive compatibility (Rule 12)
      const connectOptions: ConnectConfig = {
        host,
        port,
        username,
        readyTimeout: 20000,
        keepaliveInterval: 10000,
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
            'chacha20-poly1305@openssh.com',
            'aes256-gcm@openssh.com',
            'aes128-gcm@openssh.com',
            'aes256-gcm',
            'aes128-gcm',
            'aes256-ctr',
            'aes192-ctr',
            'aes128-ctr',
            'aes256-cbc',
            'aes192-cbc',
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

      if (password) {
        connectOptions.password = password;
      }
      if (privateKey) {
        connectOptions.privateKey = privateKey;
      }

      try {
        sshConn.connect(connectOptions);
      } catch (err: any) {
        sendClient({
          type: 'error',
          status: 'failed',
          error: err.message,
          message: isEn ? `SSH connect failed: ${err.message}` : `خطا در اتصال به دستگاه: ${err.message}`,
        });
        cleanup();
      }
    };

    // Auto-start if deviceId passed in query
    if (activeDeviceId) {
      startMonitorSession(activeDeviceId);
    }

    // Message handler from browser
    clientWs.on('message', (raw: WebSocket.Data) => {
      try {
        const text = raw.toString();
        const parsed = JSON.parse(text);
        if (parsed.type === 'START_WATCH' || parsed.action === 'START_WATCH') {
          const devId = parsed.deviceId || activeDeviceId;
          if (devId) {
            startMonitorSession(devId);
          }
        } else if (parsed.type === 'STOP_WATCH' || parsed.action === 'STOP_WATCH') {
          cleanup();
          sendClient({
            type: 'status',
            status: 'stopped',
            message: isEn ? 'Terminal monitor deactivated' : 'مانیتورینگ زنده ترمینال غیرفعال شد',
          });
        } else if (parsed.type === 'ping') {
          sendClient({ type: 'pong' });
        }
      } catch {}
    });

    clientWs.on('close', () => {
      cleanup();
    });

    clientWs.on('error', () => {
      cleanup();
    });
  });
}
