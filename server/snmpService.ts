import snmp from 'net-snmp';
import { resolveDynamicVaultPassword } from './db.js';

export interface SnmpTestOptions {
  host: string;
  port?: number;
  version?: 'v1' | 'v2c' | 'v3';
  community?: string;
  community_vault_item_id?: string;
  v3_user?: string;
  v3_security_level?: 'noAuthNoPriv' | 'authNoPriv' | 'authPriv';
  v3_auth_protocol?: 'MD5' | 'SHA-1' | 'SHA-224' | 'SHA-256' | 'SHA-384' | 'SHA-512';
  v3_auth_password?: string;
  v3_auth_vault_item_id?: string;
  v3_priv_protocol?: 'DES' | 'AES-128' | 'AES-192' | 'AES-256' | '3DES';
  v3_priv_password?: string;
  v3_priv_vault_item_id?: string;
  v3_context?: string;
  timeout?: number;
  retries?: number;
}

export interface SnmpTestResult {
  success: boolean;
  version: 'v1' | 'v2c' | 'v3';
  port: number;
  target: string;
  latency_ms?: number;
  sysName?: string;
  sysDescr?: string;
  sysObjectID?: string;
  sysUpTime?: string;
  error?: string;
  errorFa?: string;
}

/**
 * Maps human-readable SNMPv3 Auth Protocol string to net-snmp AuthProtocols enum
 */
function resolveAuthProtocol(proto?: string): number {
  const p = (proto || 'SHA-256').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (p === 'MD5') return snmp.AuthProtocols.md5;
  if (p === 'SHA' || p === 'SHA1') return snmp.AuthProtocols.sha;
  if (p === 'SHA224') return snmp.AuthProtocols.sha224;
  if (p === 'SHA256') return snmp.AuthProtocols.sha256;
  if (p === 'SHA384') return snmp.AuthProtocols.sha384;
  if (p === 'SHA512') return snmp.AuthProtocols.sha512;
  return snmp.AuthProtocols.sha256;
}

/**
 * Maps human-readable SNMPv3 Privacy Protocol string to net-snmp PrivProtocols enum
 */
function resolvePrivProtocol(proto?: string): number {
  const p = (proto || 'AES-128').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (p === 'DES') return snmp.PrivProtocols.des;
  if (p === 'AES' || p === 'AES128') return snmp.PrivProtocols.aes;
  if (p === 'AES256' || p === 'AES256B') return snmp.PrivProtocols.aes256b;
  if (p === 'AES256R' || p === 'AES192') return snmp.PrivProtocols.aes256r;
  return snmp.PrivProtocols.aes;
}

/**
 * Formats timeticks (hundredths of a second) into standard human-readable uptime string
 */
function formatTimeTicks(ticks: number): string {
  if (typeof ticks !== 'number' || isNaN(ticks)) return '';
  const totalSeconds = Math.floor(ticks / 100);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

/**
 * Executes an authentic, live SNMP query against a target device
 * Queries MIB-2 System group (sysDescr, sysObjectID, sysUpTime, sysName)
 * Follows Rule 8 (Absolute Prohibition of Fake or Simulated Data)
 */
export async function testSnmpConnection(options: SnmpTestOptions): Promise<SnmpTestResult> {
  const host = (options.host || '').trim();
  if (!host) {
    return {
      success: false,
      version: options.version || 'v2c',
      port: options.port || 161,
      target: host,
      error: 'Target host or IP address is required for SNMP testing',
      errorFa: 'آدرس IP یا نام هاست مقصد جهت تست پروتکل SNMP الزامی است',
    };
  }

  const port = Number(options.port) || 161;
  const version = options.version || 'v2c';
  const timeout = Math.min(Math.max(Number(options.timeout) || 5000, 1000), 15000);
  const retries = Math.min(Math.max(Number(options.retries) || 1, 0), 3);

  // In-flight credential resolution from Vault if linked
  let community = options.community || 'public';
  if (options.community_vault_item_id) {
    const vSecret = await resolveDynamicVaultPassword(options.community_vault_item_id);
    if (vSecret) community = vSecret;
  }

  let v3AuthPassword = options.v3_auth_password || '';
  if (options.v3_auth_vault_item_id) {
    const vSecret = await resolveDynamicVaultPassword(options.v3_auth_vault_item_id);
    if (vSecret) v3AuthPassword = vSecret;
  }

  let v3PrivPassword = options.v3_priv_password || '';
  if (options.v3_priv_vault_item_id) {
    const vSecret = await resolveDynamicVaultPassword(options.v3_priv_vault_item_id);
    if (vSecret) v3PrivPassword = vSecret;
  }

  const startTime = Date.now();

  // MIB-2 System OIDs
  const OID_SYS_DESCR = '1.3.6.1.2.1.1.1.0';
  const OID_SYS_OBJECT_ID = '1.3.6.1.2.1.1.2.0';
  const OID_SYS_UPTIME = '1.3.6.1.2.1.1.3.0';
  const OID_SYS_NAME = '1.3.6.1.2.1.1.5.0';
  const oids = [OID_SYS_DESCR, OID_SYS_OBJECT_ID, OID_SYS_UPTIME, OID_SYS_NAME];

  return new Promise<SnmpTestResult>((resolve) => {
    let session: any = null;

    const cleanup = () => {
      if (session) {
        try {
          session.close();
        } catch {
          // ignore close error
        }
        session = null;
      }
    };

    try {
      if (version === 'v3') {
        const secLevelStr = options.v3_security_level || 'authPriv';
        let level = snmp.SecurityLevel.noAuthNoPriv;
        if (secLevelStr === 'authNoPriv') level = snmp.SecurityLevel.authNoPriv;
        else if (secLevelStr === 'authPriv') level = snmp.SecurityLevel.authPriv;

        const user: any = {
          name: (options.v3_user || 'admin').trim(),
          level,
        };

        if (level === snmp.SecurityLevel.authNoPriv || level === snmp.SecurityLevel.authPriv) {
          user.authProtocol = resolveAuthProtocol(options.v3_auth_protocol);
          user.authKey = v3AuthPassword;
        }

        if (level === snmp.SecurityLevel.authPriv) {
          user.privProtocol = resolvePrivProtocol(options.v3_priv_protocol);
          user.privKey = v3PrivPassword;
        }

        session = snmp.createV3Session(host, user, {
          port,
          retries,
          timeout,
          context: options.v3_context ? options.v3_context.trim() : undefined,
        });
      } else {
        const netVersion = version === 'v1' ? snmp.Version1 : snmp.Version2c;
        session = snmp.createSession(host, community, {
          port,
          retries,
          timeout,
          version: netVersion,
        });
      }

      session.on('error', (err: any) => {
        cleanup();
        const latency = Date.now() - startTime;
        resolve({
          success: false,
          version,
          port,
          target: host,
          latency_ms: latency,
          error: err?.message || 'SNMP Session initialization error',
          errorFa: `خطا در ایجاد نشست SNMP: ${err?.message || 'عدم امکان برقراری ارتباط'}`,
        });
      });

      session.get(oids, (err: any, varbinds: any[]) => {
        const latency = Date.now() - startTime;
        cleanup();

        if (err) {
          const errMsg = err.message || String(err);
          let errorFa = 'خطای عدم پاسخگویی از طریق SNMP';
          if (errMsg.toLowerCase().includes('timeout') || errMsg.toLowerCase().includes('timed out')) {
            errorFa = `عدم دریافت پاسخ در مهلت زمانی (${timeout} میلی‌ثانیه). بررسی کنید پورت UDP ${port} روی دستگاه باز و SNMP فعال باشد.`;
          } else if (errMsg.toLowerCase().includes('auth') || errMsg.toLowerCase().includes('credential')) {
            errorFa = 'عدم تطابق اعتبارسنجی SNMP (Community String یا مشخصات SNMPv3 نامعتبر است).';
          }

          resolve({
            success: false,
            version,
            port,
            target: host,
            latency_ms: latency,
            error: errMsg,
            errorFa,
          });
          return;
        }

        if (!Array.isArray(varbinds) || varbinds.length === 0) {
          resolve({
            success: false,
            version,
            port,
            target: host,
            latency_ms: latency,
            error: 'No SNMP varbinds returned by the device',
            errorFa: 'پاسخ معتبری از دستگاه دریافت نشد (هیچ رکوردی برنگشت)',
          });
          return;
        }

        let sysDescr = '';
        let sysObjectID = '';
        let sysUpTime = '';
        let sysName = '';

        for (const vb of varbinds) {
          if (snmp.isVarbindError(vb)) {
            continue;
          }
          const oid = vb.oid;
          const val = vb.value;

          if (oid === OID_SYS_DESCR) {
            sysDescr = Buffer.isBuffer(val) ? val.toString('utf-8') : String(val || '');
          } else if (oid === OID_SYS_OBJECT_ID) {
            sysObjectID = String(val || '');
          } else if (oid === OID_SYS_UPTIME) {
            sysUpTime = typeof val === 'number' ? formatTimeTicks(val) : String(val || '');
          } else if (oid === OID_SYS_NAME) {
            sysName = Buffer.isBuffer(val) ? val.toString('utf-8') : String(val || '');
          }
        }

        resolve({
          success: true,
          version,
          port,
          target: host,
          latency_ms: latency,
          sysName: sysName || host,
          sysDescr: sysDescr.trim(),
          sysObjectID: sysObjectID.trim(),
          sysUpTime,
        });
      });
    } catch (createErr: any) {
      cleanup();
      const latency = Date.now() - startTime;
      resolve({
        success: false,
        version,
        port,
        target: host,
        latency_ms: latency,
        error: createErr.message || 'SNMP initialization exception',
        errorFa: `استثنا در راه‌اندازی SNMP: ${createErr.message || 'خطای نامشخص'}`,
      });
    }
  });
}
