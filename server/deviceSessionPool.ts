import { Client, ClientChannel, ConnectConfig } from 'ssh2';
import { StringDecoder } from 'string_decoder';
import { resolveDynamicVaultPassword, getDeviceById } from './db';
import { decryptServerSecret } from './vaultCrypto';
import { cleanCliOutput } from './deviceLogService';

export interface DeviceSession {
  sessionId: string;
  deviceId: string;
  deviceName: string;
  host: string;
  port: number;
  platform: string;
  isMikroTik: boolean;
  isLinux: boolean;
  isCisco: boolean;
  client: Client;
  stream: ClientChannel;
  status: 'connecting' | 'connected' | 'error' | 'closed';
  createdAt: number;
  lastActive: number;
  refCount: number;
  keepAliveTimer?: NodeJS.Timeout;
  banner: string;
}

interface QueuedCommand {
  cmd: string;
  timeoutMs: number;
  resolve: (output: string) => void;
  reject: (err: Error) => void;
}

class DeviceSessionManager {
  private sessions = new Map<string, DeviceSession>();
  private commandQueues = new Map<string, QueuedCommand[]>();
  private activeExecutions = new Map<string, boolean>();
  private currentAccumulators = new Map<string, string>();
  private dataListeners = new Map<string, () => void>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  private static readonly PROMPT_REGEX =
    /^(?:[A-Za-z0-9_.:/@-]+(?:\[[^\]]+\]|\([^\)]+\))?[#>$]|\[[^\]\r\n]+\]\s*(?:\/[^\s>]*)?>|[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+:[^\r\n]*[$#]|[#>])\s*$/;
  private static readonly MORE_REGEX = /--More--|--- more ---/i;

  private stripAnsiAndCr(text: string): string {
    if (!text) return '';
    return text
      .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
      .replace(/\x1b[@-Z\\-_]/g, '')
      .replace(/[\x00\r]/g, '');
  }

  constructor() {
    // Background idle cleanup every 60s: close sessions with 0 refCount or inactive for > 15 minutes
    this.cleanupInterval = setInterval(() => {
      this.sweepIdleSessions();
    }, 60000);
  }

  private sweepIdleSessions() {
    const now = Date.now();
    for (const [deviceId, session] of this.sessions.entries()) {
      const idleTime = now - session.lastActive;
      // Close session if inactive for > 10 minutes
      if (idleTime > 10 * 60 * 1000) {
        console.log(`[DeviceSessionPool] Sweeping idle session for device ${deviceId} (idle ${Math.round(idleTime / 1000)}s)`);
        this.closeDeviceSession(deviceId, 'Idle timeout expired');
      }
    }
  }

  public hasActiveSession(deviceId: string): boolean {
    const session = this.sessions.get(deviceId);
    return Boolean(session && session.status === 'connected');
  }

  public getSession(deviceId: string): DeviceSession | undefined {
    return this.sessions.get(deviceId);
  }

  /**
   * Opens or attaches to a persistent SSH session for a target device
   */
  public async openDeviceSession(deviceOrId: any): Promise<{
    success: boolean;
    sessionId: string;
    deviceId: string;
    deviceName: string;
    status: string;
    banner: string;
    isExisting: boolean;
    error?: string;
  }> {
    const device = typeof deviceOrId === 'string' ? await getDeviceById(deviceOrId) : deviceOrId;
    if (!device) {
      throw new Error('Device not found in inventory');
    }

    const deviceId = device.id;
    const existing = this.sessions.get(deviceId);
    if (existing && existing.status === 'connected') {
      existing.refCount++;
      existing.lastActive = Date.now();
      console.log(`[DeviceSessionPool] Re-using active persistent session for device ${deviceId} (refCount: ${existing.refCount})`);
      return {
        success: true,
        sessionId: existing.sessionId,
        deviceId,
        deviceName: existing.deviceName,
        status: existing.status,
        banner: existing.banner,
        isExisting: true,
      };
    }

    // Resolve connection parameters
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

    const isCisco = !isMikroTik && !isLinux;

    // Resolve credentials securely (Rule 14)
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
      throw new Error(`Device host IP address is missing for device '${deviceName}'`);
    }

    console.log(`[DeviceSessionPool] Opening new persistent SSH session for ${deviceName} (${host}:${port})`);

    return new Promise((resolve) => {
      const conn = new Client();
      let stream: ClientChannel | null = null;
      let initialBanner = '';
      let isSettled = false;
      const connectTimeout = 25000;

      const finishConnect = (res: { success: boolean; error?: string }) => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timeoutTimer);
          if (res.success && stream) {
            const session: DeviceSession = {
              sessionId: `${deviceId}_${Date.now()}`,
              deviceId,
              deviceName,
              host,
              port,
              platform,
              isMikroTik,
              isLinux,
              isCisco,
              client: conn,
              stream,
              status: 'connected',
              createdAt: Date.now(),
              lastActive: Date.now(),
              refCount: 1,
              banner: initialBanner,
            };

            // Setup keepalive timer (every 25s, send null or newline to prevent VTY timeout while modal open)
            session.keepAliveTimer = setInterval(() => {
              if (session.status === 'connected' && session.stream && session.stream.writable) {
                try {
                  // SSH keepalive null byte or client ping
                  if (typeof (session.client as any).ping === 'function') {
                    (session.client as any).ping();
                  } else {
                    session.stream.write('\0');
                  }
                } catch {}
              }
            }, 25000);

            this.sessions.set(deviceId, session);
            this.commandQueues.set(deviceId, []);
            this.activeExecutions.set(deviceId, false);
            this.currentAccumulators.set(deviceId, '');

            resolve({
              success: true,
              sessionId: session.sessionId,
              deviceId,
              deviceName,
              status: 'connected',
              banner: initialBanner,
              isExisting: false,
            });
          } else {
            try {
              conn.end();
              (conn as any).destroy?.();
            } catch {}
            resolve({
              success: false,
              sessionId: '',
              deviceId,
              deviceName,
              status: 'error',
              banner: '',
              isExisting: false,
              error: res.error || 'Failed to establish persistent SSH session',
            });
          }
        }
      };

      const timeoutTimer = setTimeout(() => {
        finishConnect({
          success: false,
          error: `Connection to ${host}:${port} timed out after ${connectTimeout / 1000}s`,
        });
      }, connectTimeout);

      conn.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finishKbd) => {
        const answers = prompts.map((p) => {
          if (/user/i.test(p.prompt)) return username;
          return password;
        });
        finishKbd(answers.length > 0 ? answers : [password]);
      });

      conn.on('banner', (message) => {
        initialBanner += message;
      });

      conn.on('ready', () => {
        console.log(`[DeviceSessionPool] SSH transport ready for ${deviceName}. Allocating interactive shell channel.`);
        conn.shell(
          {
            term: 'vt100',
            cols: 250,
            rows: 100,
          },
          (err, channel) => {
            if (err) {
              return finishConnect({
                success: false,
                error: `SSH shell allocation error: ${err.message}`,
              });
            }

            stream = channel;
            const decoder = new StringDecoder('utf-8');

            // Hook up data streaming (event-driven wake-up for active command listeners)
            stream.on('data', (d: Buffer) => {
              const text = decoder.write(d);
              const current = this.currentAccumulators.get(deviceId) || '';
              this.currentAccumulators.set(deviceId, current + text);
              const listener = this.dataListeners.get(deviceId);
              if (listener) {
                listener();
              }
            });

            stream.on('close', () => {
              console.log(`[DeviceSessionPool] Shell channel closed for device ${deviceId}`);
              this.closeDeviceSession(deviceId, 'Remote host closed shell channel');
            });

            stream.on('error', (sErr: any) => {
              console.warn(`[DeviceSessionPool] Shell stream error on device ${deviceId}:`, sErr?.message);
            });

            this.currentAccumulators.set(deviceId, '');
            let settleTimer: NodeJS.Timeout | null = null;
            const completeInitialSettle = () => {
              if (settleTimer) {
                clearTimeout(settleTimer);
                settleTimer = null;
              }
              this.dataListeners.delete(deviceId);
              this.currentAccumulators.set(deviceId, '');
              finishConnect({ success: true });
            };

            this.dataListeners.set(deviceId, () => {
              const cleaned = this.stripAnsiAndCr(this.currentAccumulators.get(deviceId) || '');
              const lines = cleaned.split('\n');
              const lastLine = lines[lines.length - 1] || '';
              if (
                DeviceSessionManager.PROMPT_REGEX.test(lastLine) &&
                !DeviceSessionManager.MORE_REGEX.test(lastLine)
              ) {
                completeInitialSettle();
              }
            });

            // Initial setup commands
            if (isCisco) {
              // Disable terminal pagination permanently for this persistent session
              stream.write('terminal length 0\n');
            } else if (isMikroTik) {
              // MikroTik RouterOS console configuration
              stream.write('\r\n');
            }

            // Cap initial prompt settle at 350ms so slow banners don't delay modal ready state
            settleTimer = setTimeout(completeInitialSettle, 350);
          }
        );
      });

      conn.on('error', (err) => {
        console.error(`[DeviceSessionPool] SSH connection error for ${deviceName}:`, err.message);
        finishConnect({ success: false, error: err.message });
      });

      conn.on('close', () => {
        console.log(`[DeviceSessionPool] SSH connection closed for device ${deviceId}`);
        const session = this.sessions.get(deviceId);
        if (session) {
          session.status = 'closed';
          if (session.keepAliveTimer) clearInterval(session.keepAliveTimer);
          this.sessions.delete(deviceId);
        }
      });

      // Adaptive cipher and kex list matching production hardware
      const sshConfig: ConnectConfig = {
        host,
        port,
        username,
        readyTimeout: 20000,
        keepaliveInterval: 15000,
        keepaliveCountMax: 3,
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
            'chacha20-poly1305@openssh.com',
            'aes128-gcm@openssh.com',
            'aes256-gcm@openssh.com',
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
            'hmac-sha2-256',
            'hmac-sha2-512',
            'hmac-sha1',
            'hmac-sha1-96',
            'hmac-md5',
          ],
        },
      };

      if (privateKey) {
        sshConfig.privateKey = privateKey;
      }
      if (password) {
        sshConfig.password = password;
      }
      sshConfig.tryKeyboard = true;

      try {
        conn.connect(sshConfig);
      } catch (err: any) {
        finishConnect({ success: false, error: err.message });
      }
    });
  }

  /**
   * Executes a command (or array of commands) sequentially through the active shell session.
   * Handles prompt detection and clean output stripping.
   */
  public async executeCommandOnSession(
    deviceId: string,
    command: string,
    timeoutMs: number = 18000
  ): Promise<{ success: boolean; output: string; raw: string; error?: string }> {
    const session = this.sessions.get(deviceId);
    if (!session || session.status !== 'connected' || !session.stream) {
      return {
        success: false,
        output: '',
        raw: '',
        error: `No active persistent session found for device ${deviceId}`,
      };
    }

    session.lastActive = Date.now();

    return new Promise((resolve, reject) => {
      const queue = this.commandQueues.get(deviceId) || [];
      queue.push({
        cmd: command,
        timeoutMs,
        resolve: (out) => resolve({ success: true, output: cleanCliOutput(out), raw: out }),
        reject: (err) => resolve({ success: false, output: '', raw: '', error: err.message }),
      });
      this.commandQueues.set(deviceId, queue);

      this.processQueue(deviceId);
    });
  }

  private async processQueue(deviceId: string) {
    if (this.activeExecutions.get(deviceId)) {
      return; // Already executing a command in this session
    }

    const queue = this.commandQueues.get(deviceId);
    if (!queue || queue.length === 0) {
      return;
    }

    const session = this.sessions.get(deviceId);
    if (!session || session.status !== 'connected' || !session.stream) {
      // Drain and reject all
      while (queue.length > 0) {
        const item = queue.shift();
        item?.reject(new Error('Session disconnected before execution'));
      }
      return;
    }

    const currentItem = queue.shift()!;
    this.activeExecutions.set(deviceId, true);
    this.currentAccumulators.set(deviceId, '');

    const cmdLines = currentItem.cmd
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));

    if (cmdLines.length === 0) {
      this.activeExecutions.set(deviceId, false);
      currentItem.resolve('');
      this.processQueue(deviceId);
      return;
    }

    let isDone = false;
    let safetyInterval: NodeJS.Timeout | null = null;
    const collectedRawParts: string[] = [];
    let stepIndex = 0;
    let sentMoreCount = 0;

    const cleanupStepTimers = () => {
      this.dataListeners.delete(deviceId);
      if (safetyInterval) {
        clearInterval(safetyInterval);
        safetyInterval = null;
      }
    };

    const timer = setTimeout(() => {
      if (!isDone) {
        isDone = true;
        cleanupStepTimers();
        this.activeExecutions.set(deviceId, false);
        currentItem.reject(
          new Error(`Command timed out after ${currentItem.timeoutMs}ms: ${currentItem.cmd}`)
        );
        this.processQueue(deviceId);
      }
    }, currentItem.timeoutMs);

    const checkStepCompletion = () => {
      if (isDone) return;

      const rawStep = this.currentAccumulators.get(deviceId) || '';
      const cleanStep = this.stripAnsiAndCr(rawStep);

      // Advance --More-- pagination only once per new occurrence
      const moreMatches = cleanStep.match(/--More--|--- more ---/gi);
      const moreCount = moreMatches ? moreMatches.length : 0;
      if (moreCount > sentMoreCount && session.status === 'connected' && session.stream.writable) {
        sentMoreCount = moreCount;
        session.stream.write(' ');
      }

      const lines = cleanStep.split('\n');
      if (lines.length > 1) {
        const lastLine = lines[lines.length - 1] || '';
        if (
          DeviceSessionManager.PROMPT_REGEX.test(lastLine) &&
          !DeviceSessionManager.MORE_REGEX.test(lastLine)
        ) {
          collectedRawParts.push(rawStep);
          stepIndex++;

          if (stepIndex < cmdLines.length) {
            // Immediately dispatch the next command line event-driven (zero 100ms poll lag)
            sentMoreCount = 0;
            this.currentAccumulators.set(deviceId, '');
            if (session.status === 'connected' && session.stream.writable) {
              session.stream.write(`${cmdLines[stepIndex]}\n`);
            }
          } else {
            isDone = true;
            cleanupStepTimers();
            clearTimeout(timer);
            this.activeExecutions.set(deviceId, false);
            currentItem.resolve(collectedRawParts.join('\n'));
            this.processQueue(deviceId);
          }
        }
      }
    };

    this.dataListeners.set(deviceId, checkStepCompletion);
    // Low-frequency safety check in case stream data settles quietly without trailing event
    safetyInterval = setInterval(checkStepCompletion, 500);

    // Send first line immediately
    session.stream.write(`${cmdLines[0]}\n`);
  }

  /**
   * Fast log retrieval through the open persistent session without SSH re-connect
   */
  public async fetchLogsOnSession(
    deviceId: string,
    limit: number = 150
  ): Promise<string[] | null> {
    const session = this.sessions.get(deviceId);
    if (!session || session.status !== 'connected') {
      return null;
    }

    session.lastActive = Date.now();
    let cmd = 'show logging\n';
    if (session.isMikroTik) {
      cmd = '/log print without-paging\n';
    } else if (session.isLinux) {
      cmd = `journalctl -n ${limit} --no-pager 2>/dev/null || dmesg -T 2>/dev/null | tail -n ${limit}\n`;
    }

    const execResult = await this.executeCommandOnSession(deviceId, cmd, 10000);
    if (!execResult.success || !execResult.output) {
      return null;
    }

    const clean = cleanCliOutput(execResult.output);
    const allLines = clean
      .split('\n')
      .map((l) => l.trimEnd())
      .filter((l) => l.trim().length > 0);

    // Filter out the echoed command itself
    return allLines.filter(
      (l) =>
        !l.includes('show logging') &&
        !l.includes('/log print') &&
        !l.includes('terminal length 0') &&
        !l.endsWith('#') &&
        !l.endsWith('>')
    );
  }

  /**
   * Closes a persistent session cleanly when the port modal is closed
   */
  public async closeDeviceSession(deviceId: string, reason: string = 'User closed port modal'): Promise<boolean> {
    const session = this.sessions.get(deviceId);
    if (!session) {
      return false;
    }

    console.log(`[DeviceSessionPool] Closing persistent session for device ${deviceId}. Reason: ${reason}`);

    if (session.keepAliveTimer) {
      clearInterval(session.keepAliveTimer);
    }

    // Try graceful exit command
    if (session.stream && session.stream.writable) {
      try {
        session.stream.write('exit\n');
        session.stream.end();
      } catch {}
    }

    try {
      session.client.end();
      (session.client as any).destroy?.();
    } catch {}

    session.status = 'closed';
    this.dataListeners.delete(deviceId);
    const pendingQueue = this.commandQueues.get(deviceId);
    if (pendingQueue && pendingQueue.length > 0) {
      while (pendingQueue.length > 0) {
        pendingQueue.shift()?.reject(new Error(`Session closed: ${reason}`));
      }
    }
    this.sessions.delete(deviceId);
    this.commandQueues.delete(deviceId);
    this.activeExecutions.delete(deviceId);
    this.currentAccumulators.delete(deviceId);

    return true;
  }
}

// Global Singleton Instance across backend
export const deviceSessionPool = new DeviceSessionManager();
