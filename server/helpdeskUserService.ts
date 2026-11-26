import net from 'net';
import tls from 'tls';
import dns from 'dns';
import ldap from 'ldapjs';
import { getActiveDirectoryConfig, HelpdeskExceptionRecord, listHelpdeskExceptionsFromDb } from './db';
import {
  executeHelpdeskPowerShell,
  HelpdeskPolicyScopeRules,
  HelpdeskProtocol,
  matchAdGroupPatternList,
  matchUserPatternList,
} from './helpdeskService';

export interface HelpdeskAdPolicyContext {
  policy?: HelpdeskPolicyScopeRules | null;
  hasFullAccess?: boolean;
}

// ============================================================================
// 1. TYPES & INTERFACES
// ============================================================================

export type LdapTransportProtocol = 'auto' | 'ldaps' | 'ldap';

export interface HelpdeskUserInspectInput {
  targetUsername: string;
  adminUsername: string;
  adminPassword: string;
  domainController?: string;
  ldapProtocol?: LdapTransportProtocol;
  exchangeServer?: string;
  winrmProtocol?: HelpdeskProtocol;
  includeMailbox?: boolean;
}

export interface HelpdeskUserMailboxInput extends HelpdeskUserInspectInput {}

export interface HelpdeskUserUnlockInput extends HelpdeskUserInspectInput {}

export interface HelpdeskUserRelatedPerson {
  dn: string;
  samAccountName: string;
  displayName: string;
  title: string;
  department: string;
  email: string;
}

export interface HelpdeskUserGroupEntry {
  cn: string;
  dn: string;
  isPrimary?: boolean;
}

export interface HelpdeskUserEmailAlias {
  address: string;
  protocol: string;
  isPrimary: boolean;
}

export interface HelpdeskUserDomainPolicy {
  domainName: string;
  source: 'pso' | 'domain_root' | 'unknown';
  psoName?: string;
  maxPasswordAgeDays: number | null;
  minPasswordAgeDays: number | null;
  minPasswordLength: number | null;
  lockoutThreshold: number | null;
  lockoutDurationMinutes: number | null;
  lockoutObservationWindowMinutes: number | null;
}

export interface HelpdeskUserMailboxInfo {
  hasMailbox: boolean;
  source: 'exchange_ps' | 'ad_only' | 'none';
  liveStatsRetrieved: boolean;
  exchangeHostTried?: string;
  exchangeHostUsed?: string;
  exchangeStatusMessage?: string;
  exchangeStatusMessageFa?: string;
  databaseName: string;
  serverName: string;
  mailNickname: string;
  recipientType?: string;
  storageLimitStatus?: string;
  useDatabaseQuotaDefaults: boolean | null;
  totalUsedBytes: number | null;
  deletedItemsBytes: number | null;
  itemCount: number | null;
  deletedItemCount: number | null;
  issueWarningQuotaBytes: number | null;
  prohibitSendQuotaBytes: number | null;
  prohibitSendReceiveQuotaBytes: number | null;
  effectiveQuotaBytes: number | null;
  usedPercent: number | null;
  isUnlimitedQuota: boolean;
  lastLogonTime: string | null;
  archiveEnabled: boolean;
  archiveStatus?: string;
  archiveGuid?: string;
  archiveUsedBytes?: number | null;
  archiveQuotaBytes?: number | null;
  forwardingAddress?: string;
  forwardingSmtpAddress?: string;
  deliverToMailboxAndForward?: boolean;
}

export interface HelpdeskUserDcLockoutEntry {
  dcHost: string;
  isPdc: boolean;
  reachable: boolean;
  accountLocked: boolean;
  lockoutTimeRaw: string;
  lockedAt: string | null;
  badPwdCount: number;
  badPasswordTime: string | null;
  lastLogon: string | null;
}

export interface HelpdeskUserLockoutEventEntry {
  eventId: number;
  eventType: 'locked_out' | 'unlocked' | 'bad_password' | 'logon_failed';
  timestamp: string;
  dcHost: string;
  callerComputer?: string;
  sourceIp?: string;
  actor?: string;
  subStatus?: string;
  message?: string;
}

export interface HelpdeskUserInspectionResult {
  found: boolean;
  collectedAt: string;
  queryTarget: string;
  connectionInfo: {
    method: 'ldaps' | 'ldap' | 'winrm_adsi';
    domainController: string;
    port: number;
    domainName: string;
    baseDn: string;
    pdcEmulator?: string;
  };
  profile: {
    samAccountName: string;
    userPrincipalName: string;
    displayName: string;
    cn: string;
    firstName: string;
    lastName: string;
    middleName: string;
    initials: string;
    description: string;
    jobTitle: string;
    department: string;
    company: string;
    office: string;
    division: string;
    employeeId: string;
    employeeNumber: string;
    manager: HelpdeskUserRelatedPerson | null;
    directReports: HelpdeskUserRelatedPerson[];
    distinguishedName: string;
    organizationalUnit: string;
    objectSid: string;
    objectGuid: string;
    whenCreated: string | null;
    whenChanged: string | null;
    thumbnailPhotoDataUrl: string | null;
    notes: string;
  };
  contact: {
    primaryEmail: string;
    emailAliases: HelpdeskUserEmailAlias[];
    internalPhones: string[];
    mobileNumbers: string[];
    homePhones: string[];
    faxNumber: string;
    webPage: string;
  };
  security: {
    accountEnabled: boolean;
    accountLocked: boolean;
    lockoutState: 'locked' | 'auto_expired_pending_clear' | 'unlocked';
    lockoutTimeRaw: string;
    lockedAt: string | null;
    lockoutExpiresAt: string | null;
    lockoutRemainingMinutes: number | null;
    lockoutSourceNote?: string;
    badPwdCount: number;
    badPwdSourceDc?: string;
    badPasswordTime: string | null;
    passwordLastSet: string | null;
    passwordAgeDays: number | null;
    passwordExpiresAt: string | null;
    passwordExpired: boolean;
    passwordNeverExpires: boolean;
    mustChangePasswordAtNextLogon: boolean;
    userCannotChangePassword: boolean;
    accountExpiresAt: string | null;
    accountNeverExpires: boolean;
    accountExpired: boolean;
    lastLogon: string | null;
    logonCount: number;
    userAccountControl: number;
    uacFlags: string[];
    domainPolicy: HelpdeskUserDomainPolicy;
    dcLockoutBreakdown?: HelpdeskUserDcLockoutEntry[];
    lockoutEventsStatus?: 'available' | 'empty' | 'unavailable';
    lockoutEventsNote?: string;
    lockoutEventsNoteFa?: string;
    lockoutEvents?: HelpdeskUserLockoutEventEntry[];
  };
  groups: HelpdeskUserGroupEntry[];
  mailbox: HelpdeskUserMailboxInfo;
  logonAndProfile?: HelpdeskUserLogonAndProfileInfo;
}

export interface HelpdeskUserLogonAndProfileInfo {
  userWorkstationsRaw: string;
  allowedWorkstations: string[];
  workstationRestrictionMode: 'unrestricted' | 'restricted';
  profilePath: string;
  profileType: 'roaming' | 'local';
  scriptPath: string;
  homeDirectory: string;
  homeDrive: string;
  logonHoursMode: 'unrestricted_24_7' | 'restricted' | 'unknown';
  logonHoursAllowedHoursCount: number | null;
  logonHoursSummaryEn: string;
  logonHoursSummaryFa: string;
  dcInteractiveRights: {
    status: 'available' | 'unavailable';
    dcHost: string;
    allowLocalOnDc: boolean | null;
    denyLocalOnDc: boolean | null;
    allowRdpOnDc: boolean | null;
    denyRdpOnDc: boolean | null;
    matchedAllowLocalTrustees: string[];
    matchedDenyLocalTrustees: string[];
    matchedAllowRdpTrustees: string[];
    matchedDenyRdpTrustees: string[];
    noteEn: string;
    noteFa: string;
  };
}

export interface HelpdeskUserUnlockResult {
  unlocked: boolean;
  wasLocked: boolean;
  stillLockedAfter: boolean;
  samAccountName: string;
  displayName: string;
  distinguishedName: string;
  domainController: string;
  methodUsed: 'ldaps_modify' | 'ldap_modify' | 'winrm_adsi';
  message: string;
  messageFa: string;
  unlockedAt: string;
}

// ============================================================================
// 2. VALIDATION, ESCAPING & BINARY DECODERS
// ============================================================================

const FILETIME_EPOCH_DIFF_MS = 11644473600000; // ms between 1601-01-01 and 1970-01-01
const MAX_FILETIME_THRESHOLD = 9223372036854775807n; // 0x7FFFFFFFFFFFFFFF

export function sanitizeAndValidateTargetUsername(raw: string): string {
  const clean = String(raw || '').trim();
  if (!clean) {
    throw new Error('Target username is required.');
  }
  if (clean.length > 128 || !/^[a-zA-Z0-9._@\\-]+$/.test(clean)) {
    throw new Error(
      'Invalid target username. Only letters, numbers, dots, underscores, hyphens, @, and \\ are permitted (1–128 chars).'
    );
  }
  return clean;
}

export function validateSafeHostOrIp(raw: string | undefined, label: string): string | undefined {
  const clean = String(raw || '').trim();
  if (!clean) return undefined;
  if (clean.length > 253 || !/^[a-zA-Z0-9.:_-]+$/.test(clean)) {
    throw new Error(`Invalid ${label}: contains forbidden characters.`);
  }
  return clean;
}

export function splitUsernameParts(raw: string): { sam: string; domain: string; isUpnOrEmail: boolean } {
  const clean = String(raw || '').trim();
  if (clean.includes('\\')) {
    const idx = clean.indexOf('\\');
    return {
      domain: clean.slice(0, idx).trim(),
      sam: clean.slice(idx + 1).trim(),
      isUpnOrEmail: false,
    };
  }
  if (clean.includes('@')) {
    const idx = clean.indexOf('@');
    return {
      sam: clean.slice(0, idx).trim(),
      domain: clean.slice(idx + 1).trim(),
      isUpnOrEmail: true,
    };
  }
  return { sam: clean, domain: '', isUpnOrEmail: false };
}

export function escapeLdapFilterValue(input: string): string {
  return String(input || '').replace(/[\0*()\\]/g, (ch) => {
    switch (ch) {
      case '\\':
        return '\\5c';
      case '*':
        return '\\2a';
      case '(':
        return '\\28';
      case ')':
        return '\\29';
      case '\0':
        return '\\00';
      default:
        return ch;
    }
  });
}

function filetimeToIso(raw: string | number | bigint | undefined | null): {
  iso: string | null;
  isNever: boolean;
  isZero: boolean;
} {
  if (raw === undefined || raw === null || raw === '') {
    return { iso: null, isNever: false, isZero: true };
  }
  try {
    const bi = BigInt(String(raw).trim());
    if (bi === 0n) {
      return { iso: null, isNever: false, isZero: true };
    }
    if (bi >= MAX_FILETIME_THRESHOLD || bi >= 2650467743990000000n) {
      return { iso: null, isNever: true, isZero: false };
    }
    const msSince1601 = Number(bi / 10000n);
    const unixMs = msSince1601 - FILETIME_EPOCH_DIFF_MS;
    if (!Number.isFinite(unixMs) || unixMs < -8640000000000000 || unixMs > 8640000000000000) {
      return { iso: null, isNever: false, isZero: false };
    }
    return { iso: new Date(unixMs).toISOString(), isNever: false, isZero: false };
  } catch {
    return { iso: null, isNever: false, isZero: false };
  }
}

function adDurationToMinutes(raw: string | number | bigint | undefined | null): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  try {
    let bi = BigInt(String(raw).trim());
    if (bi === 0n) return 0;
    // Large negative value near Int64 min means "never"
    if (bi <= -9223372036854775000n || bi >= MAX_FILETIME_THRESHOLD) return null;
    if (bi < 0n) bi = -bi;
    // 100ns ticks -> minutes: 60 * 10_000_000 = 600_000_000 ticks/min
    return Math.round(Number(bi / 600000000n));
  } catch {
    return null;
  }
}

export function adGeneralizedTimeToIso(raw: string | undefined | null): string | null {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseBinarySid(buf: Buffer | undefined): string {
  if (!buf || !Buffer.isBuffer(buf) || buf.length < 8) return '';
  try {
    const revision = buf.readUInt8(0);
    const subAuthCount = buf.readUInt8(1);
    let authority = 0n;
    for (let i = 2; i < 8; i++) {
      authority = (authority << 8n) | BigInt(buf.readUInt8(i));
    }
    const parts = [`S-${revision}-${authority.toString()}`];
    for (let i = 0; i < subAuthCount; i++) {
      const offset = 8 + i * 4;
      if (offset + 4 > buf.length) break;
      parts.push(String(buf.readUInt32LE(offset)));
    }
    return parts.join('-');
  } catch {
    return '';
  }
}

export function parseBinaryGuid(buf: Buffer | undefined): string {
  if (!buf || !Buffer.isBuffer(buf) || buf.length !== 16) return '';
  try {
    const p1 = buf.readUInt32LE(0).toString(16).padStart(8, '0');
    const p2 = buf.readUInt16LE(4).toString(16).padStart(4, '0');
    const p3 = buf.readUInt16LE(6).toString(16).padStart(4, '0');
    const p4 = buf.subarray(8, 10).toString('hex');
    const p5 = buf.subarray(10, 16).toString('hex');
    return `${p1}-${p2}-${p3}-${p4}-${p5}`.toLowerCase();
  } catch {
    return '';
  }
}

function sanitizeImageBufferToDataUrl(buf: Buffer | undefined): string | null {
  if (!buf || !Buffer.isBuffer(buf) || buf.length < 16 || buf.length > 262144) return null;
  // Verify JPEG (FF D8 FF) or PNG (89 50 4E 47) or WEBP (RIFF....WEBP) magic bytes strictly
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  }
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return `data:image/png;base64,${buf.toString('base64')}`;
  }
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return `data:image/webp;base64,${buf.toString('base64')}`;
  }
  return null;
}

export function dnToDomainName(dn: string): string {
  const dcParts = [...String(dn || '').matchAll(/DC=([^,]+)/gi)].map((m) => m[1].trim());
  return dcParts.join('.');
}

function domainToBaseDn(domain: string): string {
  const clean = String(domain || '').trim();
  if (!clean) return '';
  if (/^DC=/i.test(clean)) return clean;
  return clean
    .split('.')
    .filter(Boolean)
    .map((p) => `DC=${p}`)
    .join(',');
}

export function extractCnFromDn(dn: string): string {
  const m = String(dn || '').match(/^CN=([^,]+(?:\\,[^,]+)*)/i);
  if (m?.[1]) return m[1].replace(/\\,/g, ',').trim();
  return String(dn || '').trim();
}

export function extractOuBreadcrumb(dn: string): string {
  const parts: string[] = [];
  const tokens = String(dn || '').split(/(?<!\\),/);
  for (const t of tokens.slice(1)) {
    const trimmed = t.trim();
    if (/^OU=/i.test(trimmed)) {
      parts.push(trimmed.slice(3).replace(/\\,/g, ','));
    } else if (/^CN=Users$/i.test(trimmed)) {
      parts.push('Users');
    }
  }
  return parts.reverse().join(' / ') || '-';
}

function parseExchKbQuotaToBytes(raw: any): { bytes: number | null; unlimited: boolean } {
  if (raw === undefined || raw === null || raw === '') {
    return { bytes: null, unlimited: false };
  }
  const s = String(raw).trim();
  if (/unlimited/i.test(s)) return { bytes: null, unlimited: true };
  // Exchange size string like "2 GB (2,147,483,648 bytes)"
  const bytesMatch = s.match(/\(([\d,]+)\s*bytes\)/i);
  if (bytesMatch?.[1]) {
    const n = Number(bytesMatch[1].replace(/,/g, ''));
    return Number.isFinite(n) ? { bytes: n, unlimited: false } : { bytes: null, unlimited: false };
  }
  // AD integer attribute in KB (e.g. mDBStorageQuota = 2097152)
  const num = Number(s);
  if (Number.isFinite(num) && num >= 0) {
    return { bytes: Math.round(num * 1024), unlimited: false };
  }
  return { bytes: null, unlimited: false };
}

function extractEntryFieldsAndBuffers(entry: any): {
  attrs: Record<string, string[]>;
  buffers: Record<string, Buffer[]>;
  dn: string;
} {
  const attrs: Record<string, string[]> = {};
  const buffers: Record<string, Buffer[]> = {};
  if (!entry) return { attrs, buffers, dn: '' };

  const recordAttr = (nameRaw: string, valsRaw: any, bufsRaw?: any) => {
    const key = String(nameRaw || '').toLowerCase();
    if (!key) return;
    const arr = Array.isArray(valsRaw) ? valsRaw : valsRaw != null ? [valsRaw] : [];
    const bufArr = Array.isArray(bufsRaw) ? bufsRaw : [];
    const strOut: string[] = [];
    const binOut: Buffer[] = [];
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (Buffer.isBuffer(v)) {
        binOut.push(v);
        strOut.push(v.toString('utf8'));
      } else if (v != null) {
        strOut.push(String(v));
      }
    }
    for (const b of bufArr) {
      if (Buffer.isBuffer(b)) binOut.push(b);
    }
    if (strOut.length > 0) attrs[key] = strOut;
    if (binOut.length > 0) buffers[key] = binOut;
  };

  if (Array.isArray(entry.attributes)) {
    for (const a of entry.attributes) {
      if (!a?.type) continue;
      recordAttr(a.type, a.vals ?? a.values, a.buffers);
    }
  }
  try {
    const pojo =
      typeof entry._pojo === 'function'
        ? entry._pojo()
        : entry.pojo && typeof entry.pojo === 'object'
        ? entry.pojo
        : null;
    if (Array.isArray(pojo?.attributes)) {
      for (const a of pojo.attributes) {
        if (!a?.type) continue;
        if (!attrs[String(a.type).toLowerCase()]) {
          recordAttr(a.type, a.values ?? a.vals, a.buffers);
        }
      }
    }
  } catch {}

  const dn = String(entry.dn || entry.objectName || attrs.distinguishedname?.[0] || '');
  return { attrs, buffers, dn };
}

export function getFirstAttr(attrs: Record<string, string[]>, key: string): string {
  const arr = attrs[key.toLowerCase()];
  return arr && arr.length > 0 ? String(arr[0] || '').trim() : '';
}

export function getAllAttrs(attrs: Record<string, string[]>, key: string): string[] {
  const arr = attrs[key.toLowerCase()];
  if (!arr || arr.length === 0) return [];
  return arr.map((v) => String(v || '').trim()).filter(Boolean);
}

// ============================================================================
// 3. ADAPTIVE LDAP / LDAPS DISCOVERY & BINDING
// ============================================================================

function probePort(host: string, port: number, useTls: boolean, timeoutMs = 2500): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      resolve(ok);
    };

    if (useTls) {
      const sock = tls.connect({ host, port, rejectUnauthorized: false, timeout: timeoutMs }, () => {
        sock.destroy();
        finish(true);
      });
      sock.once('timeout', () => {
        sock.destroy();
        finish(false);
      });
      sock.once('error', () => {
        sock.destroy();
        finish(false);
      });
    } else {
      const sock = new net.Socket();
      sock.setTimeout(timeoutMs);
      sock.connect(port, host, () => {
        sock.destroy();
        finish(true);
      });
      sock.once('timeout', () => {
        sock.destroy();
        finish(false);
      });
      sock.once('error', () => {
        sock.destroy();
        finish(false);
      });
    }
  });
}

export async function discoverDcHostsWithPdc(params: {
  explicitDc?: string;
  adConfig?: any;
  domainHints: string[];
}): Promise<{ candidates: string[]; pdcHost: string }> {
  const candidates: string[] = [];
  let pdcHost = '';
  const pushUnique = (h?: string) => {
    const clean = String(h || '').trim().replace(/\.$/, '');
    if (!clean) return;
    if (!candidates.some((x) => x.toLowerCase() === clean.toLowerCase())) {
      candidates.push(clean);
    }
  };

  if (params.explicitDc) {
    pushUnique(params.explicitDc);
  }
  if (params.adConfig?.server) {
    pushUnique(params.adConfig.server);
  }

  for (const dom of params.domainHints) {
    const cleanDom = String(dom || '').trim();
    if (!cleanDom || !cleanDom.includes('.')) continue;

    // 1. Discover PDC Emulator first (authoritative for account lockouts, Event 4740, and unlocks)
    try {
      const pdcSrv = await Promise.race([
        dns.promises.resolveSrv(`_ldap._tcp.pdc._msdcs.${cleanDom}`),
        new Promise<dns.SrvRecord[]>((r) => setTimeout(() => r([]), 2200)),
      ]);
      if (pdcSrv[0]?.name) {
        const cleanPdc = String(pdcSrv[0].name).trim().replace(/\.$/, '');
        if (!pdcHost && cleanPdc) pdcHost = cleanPdc;
        pushUnique(cleanPdc);
      }
    } catch {}

    // 2. Discover all Domain Controllers for multi-DC non-replicated attribute aggregation (badPwdCount/lastLogon)
    try {
      const srv = await Promise.race([
        dns.promises.resolveSrv(`_ldap._tcp.dc._msdcs.${cleanDom}`),
        new Promise<dns.SrvRecord[]>((r) => setTimeout(() => r([]), 2500)),
      ]);
      const sorted = [...srv].sort((a, b) => a.priority - b.priority || b.weight - a.weight);
      for (const rec of sorted) {
        pushUnique(rec.name);
      }
    } catch {}
    // Direct domain DNS round-robin hostname as final fallback
    pushUnique(cleanDom);
  }

  return { candidates, pdcHost };
}

export interface ActiveLdapSession {
  client: ldap.Client;
  host: string;
  port: number;
  useSsl: boolean;
  defaultNamingContext: string;
  configurationNamingContext: string;
  domainName: string;
  close: () => void;
}

export async function openAuthenticatedLdapSession(params: {
  input: HelpdeskUserInspectInput;
  adConfig: any;
  dcCandidates: string[];
  domainHints: string[];
}): Promise<{ session: ActiveLdapSession | null; errors: string[] }> {
  const errors: string[] = [];
  const requestedProto = params.input.ldapProtocol || 'auto';

  const adminUser = String(params.input.adminUsername || '').trim();
  const adminPass = String(params.input.adminPassword || '');
  const adminParts = splitUsernameParts(adminUser);

  const buildBindIdentities = (discoveredDomain?: string): string[] => {
    const list: string[] = [];
    const push = (id: string) => {
      const c = String(id || '').trim();
      if (c && !list.includes(c)) list.push(c);
    };

    push(adminUser);

    const effectiveDomain =
      adminParts.domain || discoveredDomain || params.domainHints.find((d) => d.includes('.')) || '';

    if (effectiveDomain) {
      const shortNetbios = effectiveDomain.includes('.') ? effectiveDomain.split('.')[0] : effectiveDomain;
      if (adminParts.sam) {
        push(`${shortNetbios}\\${adminParts.sam}`);
        if (effectiveDomain.includes('.')) {
          push(`${adminParts.sam}@${effectiveDomain}`);
        }
      }
    }
    return list;
  };

  const protoAttempts: Array<{ useSsl: boolean; port: number }> =
    requestedProto === 'ldaps'
      ? [{ useSsl: true, port: 636 }]
      : requestedProto === 'ldap'
      ? [{ useSsl: false, port: 389 }]
      : [
          { useSsl: true, port: 636 },
          { useSsl: false, port: 389 },
        ];

  for (const host of params.dcCandidates) {
    for (const attempt of protoAttempts) {
      const reachable = await probePort(host, attempt.port, attempt.useSsl, 2500);
      if (!reachable) {
        errors.push(`${attempt.useSsl ? 'LDAPS' : 'LDAP'} ${host}:${attempt.port} unreachable`);
        continue;
      }

      const url = `${attempt.useSsl ? 'ldaps' : 'ldap'}://${host}:${attempt.port}`;
      let client: ldap.Client | null = null;
      try {
        client = ldap.createClient({
          url,
          timeout: 15000,
          connectTimeout: 8000,
          tlsOptions: attempt.useSsl ? { rejectUnauthorized: false } : undefined,
        });

        client.on('error', () => {});

        // Quick anonymous RootDSE check (optional — helps discover exact domain name)
        let rootDefaultNc = '';
        let rootConfigNc = '';
        try {
          const rootEntries = await ldapSearchEntries(client, '', {
            scope: 'base',
            filter: '(objectClass=*)',
            attributes: ['defaultNamingContext', 'configurationNamingContext', 'rootDomainNamingContext'],
          });
          if (rootEntries[0]) {
            rootDefaultNc = getFirstAttr(rootEntries[0].attrs, 'defaultNamingContext');
            rootConfigNc = getFirstAttr(rootEntries[0].attrs, 'configurationNamingContext');
          }
        } catch {}

        const discoveredDomain = rootDefaultNc ? dnToDomainName(rootDefaultNc) : '';
        const bindIds = buildBindIdentities(discoveredDomain);

        let bound = false;
        let lastBindErr = '';
        for (const bindId of bindIds) {
          const ok = await new Promise<boolean>((resolve) => {
            client!.bind(bindId, adminPass, (err) => {
              if (err) {
                lastBindErr = err.message || 'Invalid credentials';
                resolve(false);
              } else {
                resolve(true);
              }
            });
          });
          if (ok) {
            bound = true;
            break;
          }
        }

        if (!bound) {
          errors.push(
            `${attempt.useSsl ? 'LDAPS' : 'LDAP'} bind failed on ${host}:${attempt.port}: ${lastBindErr}`
          );
          try {
            client.destroy();
          } catch {}
          continue;
        }

        // Query RootDSE post-bind if anonymous RootDSE was disallowed
        if (!rootDefaultNc) {
          try {
            const rootEntries = await ldapSearchEntries(client, '', {
              scope: 'base',
              filter: '(objectClass=*)',
              attributes: ['defaultNamingContext', 'configurationNamingContext'],
            });
            if (rootEntries[0]) {
              rootDefaultNc = getFirstAttr(rootEntries[0].attrs, 'defaultNamingContext');
              rootConfigNc = getFirstAttr(rootEntries[0].attrs, 'configurationNamingContext');
            }
          } catch {}
        }

        const fallbackBase =
          params.adConfig?.baseDn ||
          domainToBaseDn(params.domainHints.find((d) => d.includes('.')) || '') ||
          '';
        const defaultNamingContext = rootDefaultNc || fallbackBase;
        const configurationNamingContext =
          rootConfigNc || (defaultNamingContext ? `CN=Configuration,${defaultNamingContext}` : '');
        const domainName = dnToDomainName(defaultNamingContext) || discoveredDomain || params.domainHints[0] || '';

        return {
          session: {
            client,
            host,
            port: attempt.port,
            useSsl: attempt.useSsl,
            defaultNamingContext,
            configurationNamingContext,
            domainName,
            close: () => {
              try {
                client?.unbind(() => {});
              } catch {}
              try {
                client?.destroy();
              } catch {}
            },
          },
          errors,
        };
      } catch (err: any) {
        errors.push(`${attempt.useSsl ? 'LDAPS' : 'LDAP'} error on ${host}:${attempt.port}: ${err?.message || err}`);
        try {
          client?.destroy();
        } catch {}
      }
    }
  }

  return { session: null, errors };
}

export function ldapSearchEntries(
  client: ldap.Client,
  searchBase: string,
  options: ldap.SearchOptions,
  controls?: any
): Promise<Array<{ attrs: Record<string, string[]>; buffers: Record<string, Buffer[]>; dn: string }>> {
  return new Promise((resolve, reject) => {
    const rows: Array<{ attrs: Record<string, string[]>; buffers: Record<string, Buffer[]>; dn: string }> = [];
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      if (err && rows.length === 0) reject(err);
      else resolve(rows);
    };

    const handleSearch = (err: Error | null, res: any) => {
      if (err || !res) return finish(err || new Error('LDAP search failed'));
      res.on('searchEntry', (entry: any) => {
        rows.push(extractEntryFieldsAndBuffers(entry));
      });
      res.on('searchReference', () => {});
      res.on('pageError', () => {});
      res.on('error', (sErr: Error) => finish(sErr));
      res.on('end', () => finish());
    };

    if (controls) {
      client.search(searchBase, options, controls, handleSearch);
    } else {
      client.search(searchBase, options, handleSearch);
    }
  });
}

// ============================================================================
// 4. UAC FLAGS, PASSWORD POLICY, GROUPS & EXCHANGE PS QUERY
// ============================================================================

function decodeUacFlags(uac: number): string[] {
  const flags: Array<[number, string]> = [
    [0x0002, 'ACCOUNTDISABLE'],
    [0x0010, 'LOCKOUT'],
    [0x0020, 'PASSWD_NOTREQD'],
    [0x0040, 'PASSWD_CANT_CHANGE'],
    [0x0200, 'NORMAL_ACCOUNT'],
    [0x10000, 'DONT_EXPIRE_PASSWORD'],
    [0x40000, 'SMARTCARD_REQUIRED'],
    [0x800000, 'PASSWORD_EXPIRED'],
  ];
  return flags.filter(([bit]) => (uac & bit) !== 0).map(([, name]) => name);
}

export function dedupeStrings(items: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const clean = String(item || '').trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

const INTERNAL_AD_DOMAIN_TLDS = new Set([
  'local',
  'lan',
  'internal',
  'intranet',
  'corp',
  'home',
  'localdomain',
  'priv',
  'arpa',
  'workgroup',
  'ad',
  'ds',
  'test',
  'localhost',
]);

function isIpLiteralHost(host: string): boolean {
  return net.isIP(host) !== 0;
}

export function isPublicSuffixDomain(domainHint: string | undefined | null): boolean {
  const clean = String(domainHint || '').trim().replace(/^\.+|\.+$/g, '').toLowerCase();
  if (!clean || !clean.includes('.') || isIpLiteralHost(clean)) return false;
  const labels = clean.split('.').filter(Boolean);
  if (labels.length < 2) return false;
  const lastTld = labels[labels.length - 1];
  if (!/^[a-z]{2,24}$/.test(lastTld)) return false;
  if (INTERNAL_AD_DOMAIN_TLDS.has(lastTld)) return false;
  return true;
}

function extractDomainFromIdentity(val: string | undefined | null): string {
  const clean = String(val || '').trim();
  if (!clean.includes('@')) return '';
  const dom = clean.split('@').pop()?.trim().replace(/^\.+|\.+$/g, '').toLowerCase() || '';
  return dom.includes('.') ? dom : '';
}

function deriveDefaultExchangeHost(domainHint: string | undefined | null): string {
  const clean = String(domainHint || '').trim().replace(/^\.+|\.+$/g, '').toLowerCase();
  if (!clean || !clean.includes('.') || isIpLiteralHost(clean)) return '';
  if (clean.startsWith('mail.')) return clean;
  return `mail.${clean}`;
}

function buildPrioritizedExchangeCandidates(params: {
  explicitExch?: string;
  primaryEmail?: string;
  emailAliases?: HelpdeskUserEmailAlias[];
  upn?: string;
  targetDomain?: string;
  adminDomain?: string;
  sessionDomain?: string;
  adConfigDomain?: string;
  discoveredExchHost?: string;
  fallbackHost?: string;
}): { defaultMailHost: string; candidates: string[] } {
  const emailDomains = dedupeStrings([
    extractDomainFromIdentity(params.primaryEmail),
    ...(params.emailAliases || []).map((a) => extractDomainFromIdentity(a.address)),
  ]);
  const otherDomains = dedupeStrings([
    extractDomainFromIdentity(params.upn),
    params.targetDomain,
    params.adminDomain,
    params.sessionDomain,
    params.adConfigDomain,
  ]).filter((d) => d.includes('.') && !isIpLiteralHost(d));

  // Strictly prefer:
  // 1) User's own registered email domain if it has a public TLD
  // 2) Any public-TLD domain (UPN / AD domain / etc.)
  // 3) User's own registered email domain (even if internal)
  // 4) Any remaining dotted AD domain
  const publicEmailHosts = emailDomains
    .filter((d) => isPublicSuffixDomain(d))
    .map((d) => deriveDefaultExchangeHost(d));
  const publicOtherHosts = otherDomains
    .filter((d) => isPublicSuffixDomain(d))
    .map((d) => deriveDefaultExchangeHost(d));
  const anyEmailHosts = emailDomains.map((d) => deriveDefaultExchangeHost(d));
  const fallbackMailHosts = otherDomains.map((d) => deriveDefaultExchangeHost(d));

  const orderedMailSubdomains = dedupeStrings([
    ...publicEmailHosts,
    ...publicOtherHosts,
    ...anyEmailHosts,
    ...fallbackMailHosts,
  ]);

  // If the caller supplied an explicit exchangeServer that uses an internal suffix
  // while no manual override flag was intended, explicitExch still goes first when present,
  // followed immediately by mail.<public_domain or user_email_domain>.
  const defaultMailHost = orderedMailSubdomains[0] || '';
  const candidates = dedupeStrings([
    params.explicitExch,
    ...orderedMailSubdomains,
    params.discoveredExchHost,
    params.fallbackHost,
  ]);

  return { defaultMailHost, candidates };
}

function parseProxyAddresses(
  primaryMail: string,
  proxyRaw: string[]
): { primaryEmail: string; aliases: HelpdeskUserEmailAlias[] } {
  const list: HelpdeskUserEmailAlias[] = [];
  const seen = new Set<string>();

  for (const entry of proxyRaw) {
    const idx = entry.indexOf(':');
    if (idx <= 0) continue;
    const proto = entry.slice(0, idx).trim();
    const addr = entry.slice(idx + 1).trim();
    if (!addr || !/^smtp$/i.test(proto)) continue;
    const isPrimary = proto === 'SMTP';
    const key = addr.toLowerCase();
    if (seen.has(key)) {
      if (isPrimary) {
        const ex = list.find((a) => a.address.toLowerCase() === key);
        if (ex) ex.isPrimary = true;
      }
      continue;
    }
    seen.add(key);
    list.push({ address: addr, protocol: proto, isPrimary });
  }

  const effectivePrimary =
    list.find((a) => a.isPrimary)?.address || primaryMail || list[0]?.address || '';

  if (effectivePrimary && !seen.has(effectivePrimary.toLowerCase())) {
    list.unshift({ address: effectivePrimary, protocol: 'SMTP', isPrimary: true });
  }

  // Ensure primary is sorted first
  list.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));

  return { primaryEmail: effectivePrimary, aliases: list };
}

function buildExchangeMailboxPsScript(params: {
  identity: string;
  adminUsername: string;
  adminPassword: string;
  exchangeHosts: string[];
}): string {
  // Target identity already strictly validated against /^[a-zA-Z0-9._@\\-]+$/
  const safeId = params.identity.replace(/'/g, "''");
  const safeHosts = params.exchangeHosts
    .map((h) => `'${h.replace(/'/g, "''")}'`)
    .join(', ');
  const adminPwdB64 = Buffer.from(params.adminPassword, 'utf16le').toString('base64');
  const safeAdminUser = params.adminUsername.replace(/'/g, "''");

  return `
$ErrorActionPreference = 'Stop'
$targetId = '${safeId}'
$candidateHosts = @(${safeHosts})
$adminUser = '${safeAdminUser}'
$pwdBytes = [Convert]::FromBase64String('${adminPwdB64}')
$pwdPlain = [System.Text.Encoding]::Unicode.GetString($pwdBytes)
$secPwd = ConvertTo-SecureString $pwdPlain -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential($adminUser, $secPwd)

function Convert-ExchSizeToBytes {
  param($val)
  if ($null -eq $val) { return $null }
  $s = [string]$val
  if ($s -match 'Unlimited') { return -1 }
  if ($s -match '\\(([0-9,]+)\\s*bytes\\)') {
    return [int64]($matches[1] -replace ',', '')
  }
  try {
    if ($val.Value -and $val.Value.ToBytes) { return [int64]$val.Value.ToBytes() }
  } catch {}
  try {
    if ($val.ToBytes) { return [int64]$val.ToBytes() }
  } catch {}
  if ($s -match '^([0-9.,]+)\\s*(KB|MB|GB|TB|B)$') {
    $num = [double]($matches[1] -replace ',', '')
    switch ($matches[2].ToUpper()) {
      'B'  { return [int64]$num }
      'KB' { return [int64]($num * 1024) }
      'MB' { return [int64]($num * 1048576) }
      'GB' { return [int64]($num * 1073741824) }
      'TB' { return [int64]($num * 1099511627776) }
    }
  }
  return $null
}

$sessionCreated = $null
$usedHost = ''
$localSnapLoaded = $false

# 1. Try local Exchange snap-in first (fastest if executing directly on an Exchange Server)
foreach ($snap in @('Microsoft.Exchange.Management.PowerShell.SnapIn', 'Microsoft.Exchange.Management.PowerShell.E2010', 'Microsoft.Exchange.Management.PowerShell.Admin')) {
  try {
    if (Get-PSSnapin -Name $snap -Registered -ErrorAction SilentlyContinue) {
      if (-not (Get-PSSnapin -Name $snap -ErrorAction SilentlyContinue)) {
        Add-PSSnapin $snap -ErrorAction Stop | Out-Null
      }
      $localSnapLoaded = $true
      $usedHost = $env:COMPUTERNAME
      break
    }
  } catch {}
}

$connErrors = @()
if (-not $localSnapLoaded) {
  foreach ($h in $candidateHosts) {
    if ([string]::IsNullOrWhiteSpace($h)) { continue }
    foreach ($scheme in @('http', 'https')) {
      $uri = "$($scheme)://$h/PowerShell/"
      try {
        $sopt = New-PSSessionOption -SkipCACheck -SkipCNCheck -SkipRevocationCheck -OperationTimeout 20000 -OpenTimeout 12000
        $sessionCreated = New-PSSession -ConfigurationName Microsoft.Exchange -ConnectionUri $uri -Credential $cred -Authentication Negotiate -SessionOption $sopt -ErrorAction Stop
        Import-PSSession $sessionCreated -DisableNameChecking -AllowClobber -CommandName Get-Mailbox,Get-MailboxStatistics,Get-MailboxDatabase -ErrorAction Stop | Out-Null
        $usedHost = $h
        break
      } catch {
        $connErrors += "$uri => $($_.Exception.Message)"
        if ($sessionCreated) {
          try { Remove-PSSession $sessionCreated -ErrorAction SilentlyContinue } catch {}
          $sessionCreated = $null
        }
      }
    }
    if ($sessionCreated) { break }
  }
}

if (-not $localSnapLoaded -and -not $sessionCreated) {
  [PSCustomObject]@{
    ok = $false
    error = ($connErrors -join ' | ')
  } | ConvertTo-Json -Compress
  return
}

try {
  $mbx = Get-Mailbox -Identity $targetId -ErrorAction Stop
  $stats = $null
  try {
    $stats = Get-MailboxStatistics -Identity $mbx.DistinguishedName -ErrorAction Stop
  } catch {
    $stats = Get-MailboxStatistics -Identity $targetId -ErrorAction SilentlyContinue
  }

  $useDbDefaults = [bool]$mbx.UseDatabaseQuotaDefaults
  $warnBytes = Convert-ExchSizeToBytes $mbx.IssueWarningQuota
  $sendBytes = Convert-ExchSizeToBytes $mbx.ProhibitSendQuota
  $recvBytes = Convert-ExchSizeToBytes $mbx.ProhibitSendReceiveQuota

  if ($useDbDefaults -and $mbx.Database) {
    try {
      $db = Get-MailboxDatabase -Identity ([string]$mbx.Database) -ErrorAction Stop
      if ($db) {
        $warnBytes = Convert-ExchSizeToBytes $db.IssueWarningQuota
        $sendBytes = Convert-ExchSizeToBytes $db.ProhibitSendQuota
        $recvBytes = Convert-ExchSizeToBytes $db.ProhibitSendReceiveQuota
      }
    } catch {}
  }

  $archUsedBytes = $null
  $archQuotaBytes = Convert-ExchSizeToBytes $mbx.ArchiveQuota
  if ([string]$mbx.ArchiveStatus -eq 'Active' -or $mbx.ArchiveGuid -ne [Guid]::Empty) {
    try {
      $archStats = Get-MailboxStatistics -Identity $mbx.DistinguishedName -Archive -ErrorAction SilentlyContinue
      if ($archStats) {
        $archUsedBytes = Convert-ExchSizeToBytes $archStats.TotalItemSize
      }
    } catch {}
  }

  $lastLogonIso = $null
  if ($stats -and $stats.LastLogonTime) {
    try { $lastLogonIso = ([datetime]$stats.LastLogonTime).ToUniversalTime().ToString('o') } catch {}
  }

  [PSCustomObject]@{
    ok = $true
    usedHost = [string]$usedHost
    databaseName = [string]$mbx.Database
    serverName = [string]$mbx.ServerName
    recipientType = [string]$mbx.RecipientTypeDetails
    useDatabaseQuotaDefaults = $useDbDefaults
    totalUsedBytes = if ($stats) { Convert-ExchSizeToBytes $stats.TotalItemSize } else { $null }
    deletedItemsBytes = if ($stats) { Convert-ExchSizeToBytes $stats.TotalDeletedItemSize } else { $null }
    itemCount = if ($stats -and $null -ne $stats.ItemCount) { [int64]$stats.ItemCount } else { $null }
    deletedItemCount = if ($stats -and $null -ne $stats.DeletedItemCount) { [int64]$stats.DeletedItemCount } else { $null }
    storageLimitStatus = if ($stats) { [string]$stats.StorageLimitStatus } else { '' }
    issueWarningQuotaBytes = $warnBytes
    prohibitSendQuotaBytes = $sendBytes
    prohibitSendReceiveQuotaBytes = $recvBytes
    lastLogonTime = $lastLogonIso
    archiveEnabled = ([string]$mbx.ArchiveStatus -eq 'Active' -or ($mbx.ArchiveGuid -and $mbx.ArchiveGuid -ne [Guid]::Empty))
    archiveStatus = [string]$mbx.ArchiveStatus
    archiveUsedBytes = $archUsedBytes
    archiveQuotaBytes = $archQuotaBytes
    forwardingAddress = [string]$mbx.ForwardingAddress
    forwardingSmtpAddress = [string]$mbx.ForwardingSmtpAddress
    deliverToMailboxAndForward = [bool]$mbx.DeliverToMailboxAndForward
  } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{
    ok = $false
    usedHost = [string]$usedHost
    error = [string]$_.Exception.Message
  } | ConvertTo-Json -Compress
} finally {
  if ($sessionCreated) {
    try { Remove-PSSession $sessionCreated -ErrorAction SilentlyContinue } catch {}
  }
}
`;
}

// ============================================================================
// 5. WINRM ADSI FALLBACK (IF PORT 389/636 IS BLOCKED BUT WINRM/SMB 445 OPEN)
// ============================================================================

async function inspectUserViaWinRmAdsiFallback(params: {
  targetUsername: string;
  adminUsername: string;
  adminPassword: string;
  host: string;
  winrmProtocol?: HelpdeskProtocol;
}): Promise<HelpdeskUserInspectionResult> {
  const safeTarget = sanitizeAndValidateTargetUsername(params.targetUsername).replace(/'/g, "''");
  const parts = splitUsernameParts(params.targetUsername);
  const safeSam = parts.sam.replace(/'/g, "''");

  const psScript = `
$ErrorActionPreference = 'Stop'
$idFull = '${safeTarget}'
$idSam = '${safeSam}'

$root = [ADSI]"LDAP://RootDSE"
$defaultNc = [string]$root.defaultNamingContext
$configNc = [string]$root.configurationNamingContext

$searcher = New-Object System.DirectoryServices.DirectorySearcher
$searcher.SearchRoot = [ADSI]"LDAP://$defaultNc"
$searcher.Filter = "(&(objectCategory=person)(objectClass=user)(|(sAMAccountName=$idSam)(userPrincipalName=$idFull)(mail=$idFull)))"
$props = @(
  'sAMAccountName','userPrincipalName','displayName','cn','givenName','sn','middleName','initials','description',
  'title','department','company','physicalDeliveryOfficeName','employeeID','employeeNumber','division','manager',
  'directReports','distinguishedName','whenCreated','whenChanged','objectSID','objectGUID','thumbnailPhoto','info',
  'telephoneNumber','otherTelephone','ipPhone','otherIpPhone','mobile','otherMobile','homePhone','otherHomePhone',
  'facsimileTelephoneNumber','mail','proxyAddresses','wWWHomePage',
  'userAccountControl','msDS-User-Account-Control-Computed','pwdLastSet','msDS-UserPasswordExpiryTimeComputed',
  'lockoutTime','badPwdCount','badPasswordTime','accountExpires','lastLogon','lastLogonTimestamp','logonCount',
  'userWorkstations','profilePath','scriptPath','homeDirectory','homeDrive','logonHours',
  'memberOf','primaryGroupID','msDS-ResultantPSO',
  'msExchMailboxGuid','msExchArchiveGUID','msExchArchiveName','homeMDB','msExchHomeServerName','mailNickname',
  'mDBUseDefaults','mDBStorageQuota','mDBOverQuotaLimit','mDBOverHardQuotaLimit','msExchArchiveQuota'
)
foreach ($p in $props) { [void]$searcher.PropertiesToLoad.Add($p) }
$res = $searcher.FindOne()

if (-not $res) {
  [PSCustomObject]@{ found = $false; defaultNc = $defaultNc } | ConvertTo-Json -Compress
  return
}

function Get-SingleProp($r, $name) {
  $col = $r.Properties[$name.ToLower()]
  if ($col -and $col.Count -gt 0) { return [string]$col[0] }
  return ''
}
function Get-MultiProp($r, $name) {
  $col = $r.Properties[$name.ToLower()]
  $arr = @()
  if ($col) { foreach ($v in $col) { $arr += [string]$v } }
  return ,$arr
}

# Domain password policy
$domEntry = [ADSI]"LDAP://$defaultNc"
$maxPwdAge = if ($domEntry.Properties['maxPwdAge'] -and $domEntry.Properties['maxPwdAge'].Count -gt 0) {
  $li = $domEntry.Properties['maxPwdAge'][0]
  try { [string]$domEntry.InvokeGet('maxPwdAge') } catch { '' }
} else { '' }

# Fetch msDS-User-Account-Control-Computed, Expiry, and tokenGroups via DirectoryEntry RefreshCache
$userDe = $res.GetDirectoryEntry()
try { $userDe.RefreshCache(@('msDS-User-Account-Control-Computed','msDS-UserPasswordExpiryTimeComputed','tokenGroups')) } catch {}
$uacComputed = 0
try { if ($userDe.Properties['msDS-User-Account-Control-Computed'].Count -gt 0) { $uacComputed = [int]$userDe.Properties['msDS-User-Account-Control-Computed'][0] } } catch {}
$pwdExpiryRaw = ''
try {
  if ($userDe.Properties['msDS-UserPasswordExpiryTimeComputed'].Count -gt 0) {
    $v = $userDe.Properties['msDS-UserPasswordExpiryTimeComputed'][0]
    $pwdExpiryRaw = [string]([int64]$userDe.ConvertLargeIntegerToInt64($v))
  }
} catch {}
$tokenSids = @()
try {
  if ($userDe.Properties['tokenGroups'].Count -gt 0) {
    foreach ($tb in $userDe.Properties['tokenGroups']) {
      if ($tb) {
        $tokenSids += (New-Object System.Security.Principal.SecurityIdentifier($tb, 0)).Value
      }
    }
  }
} catch {}

# Policy Int64 helper
$polSearch = New-Object System.DirectoryServices.DirectorySearcher([ADSI]"LDAP://$defaultNc")
$polSearch.SearchScope = [System.DirectoryServices.SearchScope]::Base
$polSearch.Filter = '(objectClass=*)'
foreach ($pp in @('maxPwdAge','minPwdAge','minPwdLength','lockoutThreshold','lockoutDuration','lockOutObservationWindow')) { [void]$polSearch.PropertiesToLoad.Add($pp) }
$polRes = $polSearch.FindOne()

# Resolve homeMDB owning server if present
$homeMdbDn = Get-SingleProp $res 'homeMDB'
$dbName = ''
$exchFqdn = ''
$dbWarn = ''
$dbSend = ''
$dbRecv = ''
if ($homeMdbDn) {
  try {
    $dbDe = [ADSI]"LDAP://$homeMdbDn"
    $dbName = [string]$dbDe.Properties['cn'][0]
    if ($dbDe.Properties['mDBStorageQuota'].Count -gt 0) { $dbWarn = [string]$dbDe.Properties['mDBStorageQuota'][0] }
    if ($dbDe.Properties['mDBOverQuotaLimit'].Count -gt 0) { $dbSend = [string]$dbDe.Properties['mDBOverQuotaLimit'][0] }
    if ($dbDe.Properties['mDBOverHardQuotaLimit'].Count -gt 0) { $dbRecv = [string]$dbDe.Properties['mDBOverHardQuotaLimit'][0] }
    if ($dbDe.Properties['msExchOwningServer'].Count -gt 0) {
      $srvDe = [ADSI]"LDAP://$([string]$dbDe.Properties['msExchOwningServer'][0])"
      if ($srvDe.Properties['dNSHostName'].Count -gt 0) { $exchFqdn = [string]$srvDe.Properties['dNSHostName'][0] }
    }
  } catch {}
}

$mgrDn = Get-SingleProp $res 'manager'
$mgrObj = $null
if ($mgrDn) {
  try {
    $mDe = [ADSI]"LDAP://$mgrDn"
    $mgrObj = [PSCustomObject]@{
      dn = $mgrDn
      samAccountName = [string]$mDe.Properties['sAMAccountName'][0]
      displayName = [string]$mDe.Properties['displayName'][0]
      title = [string]$mDe.Properties['title'][0]
      department = [string]$mDe.Properties['department'][0]
      email = [string]$mDe.Properties['mail'][0]
    }
  } catch {}
}

$reportsArr = @()
foreach ($rDn in (Get-MultiProp $res 'directReports' | Select-Object -First 30)) {
  try {
    $rDe = [ADSI]"LDAP://$rDn"
    $reportsArr += [PSCustomObject]@{
      dn = $rDn
      samAccountName = [string]$rDe.Properties['sAMAccountName'][0]
      displayName = [string]$rDe.Properties['displayName'][0]
      title = [string]$rDe.Properties['title'][0]
      department = [string]$rDe.Properties['department'][0]
      email = [string]$rDe.Properties['mail'][0]
    }
  } catch {}
}

$sidStr = ''
try {
  $sidBytes = $res.Properties['objectsid'][0]
  if ($sidBytes) { $sidStr = (New-Object System.Security.Principal.SecurityIdentifier($sidBytes, 0)).Value }
} catch {}
$guidStr = ''
try {
  $gBytes = $res.Properties['objectguid'][0]
  if ($gBytes) { $guidStr = (New-Object System.Guid(,$gBytes)).ToString() }
} catch {}
$photoB64 = ''
try {
  $pBytes = $res.Properties['thumbnailphoto'][0]
  if ($pBytes -and $pBytes.Length -le 262144) { $photoB64 = [Convert]::ToBase64String($pBytes) }
} catch {}
$logonHoursB64 = ''
try {
  $lhBytes = $res.Properties['logonhours'][0]
  if ($lhBytes -and $lhBytes.Length -gt 0) { $logonHoursB64 = [Convert]::ToBase64String($lhBytes) }
} catch {}

$mbxGuidSet = $false
try { $mbxGuidSet = ($res.Properties['msexchmailboxguid'].Count -gt 0) } catch {}
$archGuidSet = $false
try { $archGuidSet = ($res.Properties['msexcharchiveguid'].Count -gt 0) } catch {}

[PSCustomObject]@{
  found = $true
  defaultNc = $defaultNc
  samAccountName = Get-SingleProp $res 'sAMAccountName'
  userPrincipalName = Get-SingleProp $res 'userPrincipalName'
  displayName = Get-SingleProp $res 'displayName'
  cn = Get-SingleProp $res 'cn'
  firstName = Get-SingleProp $res 'givenName'
  lastName = Get-SingleProp $res 'sn'
  middleName = Get-SingleProp $res 'middleName'
  initials = Get-SingleProp $res 'initials'
  description = Get-SingleProp $res 'description'
  jobTitle = Get-SingleProp $res 'title'
  department = Get-SingleProp $res 'department'
  company = Get-SingleProp $res 'company'
  office = Get-SingleProp $res 'physicalDeliveryOfficeName'
  division = Get-SingleProp $res 'division'
  employeeId = Get-SingleProp $res 'employeeID'
  employeeNumber = Get-SingleProp $res 'employeeNumber'
  distinguishedName = Get-SingleProp $res 'distinguishedName'
  notes = Get-SingleProp $res 'info'
  whenCreated = Get-SingleProp $res 'whenCreated'
  whenChanged = Get-SingleProp $res 'whenChanged'
  objectSid = $sidStr
  objectGuid = $guidStr
  photoB64 = $photoB64
  manager = $mgrObj
  directReports = $reportsArr
  mail = Get-SingleProp $res 'mail'
  proxyAddresses = Get-MultiProp $res 'proxyAddresses'
  telephoneNumber = Get-SingleProp $res 'telephoneNumber'
  otherTelephone = Get-MultiProp $res 'otherTelephone'
  ipPhone = Get-SingleProp $res 'ipPhone'
  otherIpPhone = Get-MultiProp $res 'otherIpPhone'
  mobile = Get-SingleProp $res 'mobile'
  otherMobile = Get-MultiProp $res 'otherMobile'
  homePhone = Get-SingleProp $res 'homePhone'
  otherHomePhone = Get-MultiProp $res 'otherHomePhone'
  fax = Get-SingleProp $res 'facsimileTelephoneNumber'
  webPage = Get-SingleProp $res 'wWWHomePage'
  uac = [int](Get-SingleProp $res 'userAccountControl')
  uacComputed = $uacComputed
  pwdLastSet = Get-SingleProp $res 'pwdLastSet'
  pwdExpiryComputed = $pwdExpiryRaw
  lockoutTime = Get-SingleProp $res 'lockoutTime'
  badPwdCount = [int](Get-SingleProp $res 'badPwdCount')
  badPasswordTime = Get-SingleProp $res 'badPasswordTime'
  accountExpires = Get-SingleProp $res 'accountExpires'
  lastLogon = Get-SingleProp $res 'lastLogon'
  lastLogonTimestamp = Get-SingleProp $res 'lastLogonTimestamp'
  logonCount = [int](Get-SingleProp $res 'logonCount')
  userWorkstations = Get-SingleProp $res 'userWorkstations'
  profilePath = Get-SingleProp $res 'profilePath'
  scriptPath = Get-SingleProp $res 'scriptPath'
  homeDirectory = Get-SingleProp $res 'homeDirectory'
  homeDrive = Get-SingleProp $res 'homeDrive'
  logonHoursB64 = $logonHoursB64
  tokenGroupSids = $tokenSids
  memberOf = Get-MultiProp $res 'memberOf'
  primaryGroupID = Get-SingleProp $res 'primaryGroupID'
  polMaxPwdAge = if ($polRes) { Get-SingleProp $polRes 'maxPwdAge' } else { '' }
  polMinPwdAge = if ($polRes) { Get-SingleProp $polRes 'minPwdAge' } else { '' }
  polMinPwdLen = if ($polRes) { Get-SingleProp $polRes 'minPwdLength' } else { '' }
  polLockoutThreshold = if ($polRes) { Get-SingleProp $polRes 'lockoutThreshold' } else { '' }
  polLockoutDuration = if ($polRes) { Get-SingleProp $polRes 'lockoutDuration' } else { '' }
  polLockoutObs = if ($polRes) { Get-SingleProp $polRes 'lockOutObservationWindow' } else { '' }
  mbxGuidSet = $mbxGuidSet
  archGuidSet = $archGuidSet
  homeMdbDn = $homeMdbDn
  dbName = $dbName
  exchFqdn = $exchFqdn
  mailNickname = Get-SingleProp $res 'mailNickname'
  mDBUseDefaults = Get-SingleProp $res 'mDBUseDefaults'
  userWarn = Get-SingleProp $res 'mDBStorageQuota'
  userSend = Get-SingleProp $res 'mDBOverQuotaLimit'
  userRecv = Get-SingleProp $res 'mDBOverHardQuotaLimit'
  dbWarn = $dbWarn
  dbSend = $dbSend
  dbRecv = $dbRecv
} | ConvertTo-Json -Depth 5 -Compress
`;

  const execRes = await executeHelpdeskPowerShell(
    {
      targetIp: params.host,
      protocol: params.winrmProtocol || 'auto',
      username: params.adminUsername,
      password: params.adminPassword,
      timeoutMs: 26000,
    },
    psScript
  );

  const trimmed = execRes.stdout.trim();
  const sIdx = trimmed.indexOf('{');
  const eIdx = trimmed.lastIndexOf('}');
  if (sIdx === -1 || eIdx < sIdx) {
    throw new Error(`Domain controller returned non-JSON output for AD lookup.`);
  }
  const raw: any = JSON.parse(trimmed.slice(sIdx, eIdx + 1));
  if (!raw.found) {
    throw new Error(
      `Domain user "${params.targetUsername}" was not found in Active Directory (${dnToDomainName(raw.defaultNc || '') || params.host}).`
    );
  }

  const domainName = dnToDomainName(raw.defaultNc || '');
  const uac = Number(raw.uac || 0);
  const uacComp = Number(raw.uacComputed || 0);
  const lockoutFt = filetimeToIso(raw.lockoutTime);
  const lockDurMin = adDurationToMinutes(raw.polLockoutDuration);
  const lockObsMin = adDurationToMinutes(raw.polLockoutObs);
  const lockEval = evaluateLockoutState({
    uac,
    uacComputed: uacComp,
    hasUacComputed: raw.uacComputed !== undefined && raw.uacComputed !== null && raw.uacComputed !== '',
    lockoutFt,
    lockoutDurationMinutes: lockDurMin,
  });
  const isLocked = lockEval.accountLocked;
  const pwdLastFt = filetimeToIso(raw.pwdLastSet);
  const pwdExpiryFt = filetimeToIso(raw.pwdExpiryComputed);
  const badPwdFt = filetimeToIso(raw.badPasswordTime);
  const accExpFt = filetimeToIso(raw.accountExpires);
  const lastLogonFt = filetimeToIso(raw.lastLogon || raw.lastLogonTimestamp);

  const maxPwdAgeDays = adDurationToMinutes(raw.polMaxPwdAge);
  const minPwdAgeDays = adDurationToMinutes(raw.polMinPwdAge);

  const passwordNeverExpires = (uac & 0x10000) !== 0;
  let computedExpiryIso = pwdExpiryFt.iso;
  if (!computedExpiryIso && !passwordNeverExpires && pwdLastFt.iso && maxPwdAgeDays && maxPwdAgeDays > 0) {
    computedExpiryIso = new Date(new Date(pwdLastFt.iso).getTime() + maxPwdAgeDays * 60000).toISOString();
  }
  const passwordExpired =
    !passwordNeverExpires &&
    ((uac & 0x800000) !== 0 ||
      (uacComp & 0x800000) !== 0 ||
      (computedExpiryIso ? new Date(computedExpiryIso).getTime() <= Date.now() : false));

  const { primaryEmail, aliases } = parseProxyAddresses(
    String(raw.mail || ''),
    Array.isArray(raw.proxyAddresses) ? raw.proxyAddresses : []
  );

  const internalPhones = dedupeStrings([
    raw.telephoneNumber,
    ...(Array.isArray(raw.otherTelephone) ? raw.otherTelephone : []),
    raw.ipPhone,
    ...(Array.isArray(raw.otherIpPhone) ? raw.otherIpPhone : []),
  ]);
  const mobileNumbers = dedupeStrings([
    raw.mobile,
    ...(Array.isArray(raw.otherMobile) ? raw.otherMobile : []),
  ]);
  const homePhones = dedupeStrings([
    raw.homePhone,
    ...(Array.isArray(raw.otherHomePhone) ? raw.otherHomePhone : []),
  ]);

  let photoDataUrl: string | null = null;
  if (raw.photoB64) {
    photoDataUrl = sanitizeImageBufferToDataUrl(Buffer.from(String(raw.photoB64), 'base64'));
  }

  const useDbDefaults =
    String(raw.mDBUseDefaults || '').toLowerCase() === 'true'
      ? true
      : String(raw.mDBUseDefaults || '').toLowerCase() === 'false'
      ? false
      : null;

  const warnQ = parseExchKbQuotaToBytes(useDbDefaults === false && raw.userWarn ? raw.userWarn : raw.dbWarn);
  const sendQ = parseExchKbQuotaToBytes(useDbDefaults === false && raw.userSend ? raw.userSend : raw.dbSend);
  const recvQ = parseExchKbQuotaToBytes(useDbDefaults === false && raw.userRecv ? raw.userRecv : raw.dbRecv);

  const hasMailbox = Boolean(raw.mbxGuidSet || raw.homeMdbDn || raw.mailNickname);
  const groups: HelpdeskUserGroupEntry[] = (Array.isArray(raw.memberOf) ? raw.memberOf : []).map((dn: string) => ({
    dn,
    cn: extractCnFromDn(dn),
  }));
  if (String(raw.primaryGroupID) === '513') {
    groups.unshift({ cn: 'Domain Users', dn: `CN=Domain Users,CN=Users,${raw.defaultNc || ''}`, isPrimary: true });
  }

  return {
    found: true,
    collectedAt: new Date().toISOString(),
    queryTarget: params.targetUsername,
    connectionInfo: {
      method: 'winrm_adsi',
      domainController: params.host,
      port: execRes.portUsed,
      domainName,
      baseDn: String(raw.defaultNc || ''),
    },
    profile: {
      samAccountName: String(raw.samAccountName || parts.sam),
      userPrincipalName: String(raw.userPrincipalName || ''),
      displayName: String(raw.displayName || raw.cn || raw.samAccountName || ''),
      cn: String(raw.cn || ''),
      firstName: String(raw.firstName || ''),
      lastName: String(raw.lastName || ''),
      middleName: String(raw.middleName || ''),
      initials: String(raw.initials || ''),
      description: String(raw.description || ''),
      jobTitle: String(raw.jobTitle || ''),
      department: String(raw.department || ''),
      company: String(raw.company || ''),
      office: String(raw.office || ''),
      division: String(raw.division || ''),
      employeeId: String(raw.employeeId || ''),
      employeeNumber: String(raw.employeeNumber || ''),
      manager: raw.manager || null,
      directReports: Array.isArray(raw.directReports) ? raw.directReports : [],
      distinguishedName: String(raw.distinguishedName || ''),
      organizationalUnit: extractOuBreadcrumb(String(raw.distinguishedName || '')),
      objectSid: String(raw.objectSid || ''),
      objectGuid: String(raw.objectGuid || ''),
      whenCreated: raw.whenCreated ? new Date(raw.whenCreated).toISOString() : null,
      whenChanged: raw.whenChanged ? new Date(raw.whenChanged).toISOString() : null,
      thumbnailPhotoDataUrl: photoDataUrl,
      notes: String(raw.notes || ''),
    },
    contact: {
      primaryEmail,
      emailAliases: aliases,
      internalPhones,
      mobileNumbers,
      homePhones,
      faxNumber: String(raw.fax || ''),
      webPage: String(raw.webPage || ''),
    },
    security: {
      accountEnabled: (uac & 0x2) === 0,
      accountLocked: isLocked,
      lockoutState: lockEval.lockoutState,
      lockoutTimeRaw: String(raw.lockoutTime || '0'),
      lockedAt: lockoutFt.iso,
      lockoutExpiresAt: lockEval.lockoutExpiresAt,
      lockoutRemainingMinutes: lockEval.lockoutRemainingMinutes,
      badPwdCount: Number(raw.badPwdCount || 0),
      badPwdSourceDc: Number(raw.badPwdCount || 0) > 0 ? params.host : undefined,
      badPasswordTime: badPwdFt.iso,
      passwordLastSet: pwdLastFt.iso,
      passwordAgeDays: pwdLastFt.iso
        ? Math.max(0, Math.floor((Date.now() - new Date(pwdLastFt.iso).getTime()) / 86400000))
        : null,
      passwordExpiresAt: passwordNeverExpires ? null : computedExpiryIso,
      passwordExpired,
      passwordNeverExpires,
      mustChangePasswordAtNextLogon: !passwordNeverExpires && pwdLastFt.isZero,
      userCannotChangePassword: (uac & 0x40) !== 0,
      accountExpiresAt: accExpFt.iso,
      accountNeverExpires: accExpFt.isNever || accExpFt.isZero,
      accountExpired: !accExpFt.isNever && !accExpFt.isZero && Boolean(accExpFt.iso && new Date(accExpFt.iso).getTime() <= Date.now()),
      lastLogon: lastLogonFt.iso,
      logonCount: Number(raw.logonCount || 0),
      userAccountControl: uac,
      uacFlags: decodeUacFlags(uac),
      domainPolicy: {
        domainName,
        source: 'domain_root',
        maxPasswordAgeDays: maxPwdAgeDays !== null ? Math.round(maxPwdAgeDays / 1440) : null,
        minPasswordAgeDays: minPwdAgeDays !== null ? Math.round(minPwdAgeDays / 1440) : null,
        minPasswordLength: raw.polMinPwdLen ? Number(raw.polMinPwdLen) : null,
        lockoutThreshold: raw.polLockoutThreshold ? Number(raw.polLockoutThreshold) : null,
        lockoutDurationMinutes: lockDurMin,
        lockoutObservationWindowMinutes: lockObsMin,
      },
      dcLockoutBreakdown: [
        {
          dcHost: params.host,
          isPdc: false,
          reachable: true,
          accountLocked: isLocked,
          lockoutTimeRaw: String(raw.lockoutTime || '0'),
          lockedAt: lockoutFt.iso,
          badPwdCount: Number(raw.badPwdCount || 0),
          badPasswordTime: badPwdFt.iso,
          lastLogon: lastLogonFt.iso,
        },
      ],
    },
    groups,
    mailbox: {
      hasMailbox,
      source: hasMailbox ? 'ad_only' : 'none',
      liveStatsRetrieved: false,
      exchangeHostTried: raw.exchFqdn || undefined,
      databaseName: String(raw.dbName || ''),
      serverName: String(raw.exchFqdn || ''),
      mailNickname: String(raw.mailNickname || ''),
      useDatabaseQuotaDefaults: useDbDefaults,
      totalUsedBytes: null,
      deletedItemsBytes: null,
      itemCount: null,
      deletedItemCount: null,
      issueWarningQuotaBytes: warnQ.bytes,
      prohibitSendQuotaBytes: sendQ.bytes,
      prohibitSendReceiveQuotaBytes: recvQ.bytes,
      effectiveQuotaBytes: sendQ.bytes ?? recvQ.bytes ?? warnQ.bytes ?? null,
      usedPercent: null,
      isUnlimitedQuota: sendQ.unlimited || recvQ.unlimited,
      lastLogonTime: null,
      archiveEnabled: Boolean(raw.archGuidSet),
    },
    logonAndProfile: buildLogonAndProfileInfo({
      userWorkstationsRaw: String(raw.userWorkstations || ''),
      profilePath: String(raw.profilePath || ''),
      scriptPath: String(raw.scriptPath || ''),
      homeDirectory: String(raw.homeDirectory || ''),
      homeDrive: String(raw.homeDrive || ''),
      logonHoursBuf: raw.logonHoursB64 ? Buffer.from(String(raw.logonHoursB64), 'base64') : null,
      dcInteractiveRights: {
        status: 'unavailable',
        dcHost: params.host,
        allowLocalOnDc: null,
        denyLocalOnDc: null,
        allowRdpOnDc: null,
        denyRdpOnDc: null,
        matchedAllowLocalTrustees: [],
        matchedDenyLocalTrustees: [],
        matchedAllowRdpTrustees: [],
        matchedDenyRdpTrustees: [],
        noteEn: 'DC User Rights Assignment check pending.',
        noteFa: 'بررسی مجوزهای ورود محلی دامین کنترلر در حال انجام است.',
      },
    }),
    _tokenGroupSids: Array.isArray(raw.tokenGroupSids) ? raw.tokenGroupSids.map(String) : [],
  } as HelpdeskUserInspectionResult & { _tokenGroupSids?: string[] };
}

// ============================================================================
// 6. MAIN SERVICE: INSPECT DOMAIN USER & EXCHANGE MAILBOX
// ============================================================================

const USER_LDAP_ATTRIBUTES = [
  'sAMAccountName',
  'userPrincipalName',
  'displayName',
  'cn',
  'givenName',
  'sn',
  'middleName',
  'initials',
  'description',
  'title',
  'department',
  'company',
  'physicalDeliveryOfficeName',
  'employeeID',
  'employeeNumber',
  'division',
  'manager',
  'directReports',
  'distinguishedName',
  'whenCreated',
  'whenChanged',
  'objectSID',
  'objectGUID',
  'thumbnailPhoto',
  'info',
  'telephoneNumber',
  'otherTelephone',
  'ipPhone',
  'otherIpPhone',
  'mobile',
  'otherMobile',
  'homePhone',
  'otherHomePhone',
  'facsimileTelephoneNumber',
  'mail',
  'proxyAddresses',
  'wWWHomePage',
  'userAccountControl',
  'msDS-User-Account-Control-Computed',
  'pwdLastSet',
  'msDS-UserPasswordExpiryTimeComputed',
  'lockoutTime',
  'badPwdCount',
  'badPasswordTime',
  'accountExpires',
  'lastLogon',
  'lastLogonTimestamp',
  'logonCount',
  'userWorkstations',
  'profilePath',
  'scriptPath',
  'homeDirectory',
  'homeDrive',
  'logonHours',
  'memberOf',
  'primaryGroupID',
  'msDS-ResultantPSO',
  'msExchMailboxGuid',
  'msExchArchiveGUID',
  'msExchArchiveName',
  'homeMDB',
  'msExchHomeServerName',
  'mailNickname',
  'mDBUseDefaults',
  'mDBStorageQuota',
  'mDBOverQuotaLimit',
  'mDBOverHardQuotaLimit',
  'msExchArchiveQuota',
  'msExchRecipientDisplayType',
];

async function enrichLiveMailboxStats(params: {
  mailbox: HelpdeskUserMailboxInfo;
  identity: string;
  adminUsername: string;
  adminPassword: string;
  exchangeHosts: string[];
  winrmProtocol?: HelpdeskProtocol;
}): Promise<HelpdeskUserMailboxInfo> {
  const uniqueHosts = dedupeStrings(params.exchangeHosts);
  if (uniqueHosts.length === 0) {
    return {
      ...params.mailbox,
      liveStatsRetrieved: false,
      exchangeStatusMessage:
        'Exchange Server host was not auto-discovered and no Exchange host was provided. Enter an Exchange Server hostname/IP to query live TotalItemSize.',
      exchangeStatusMessageFa:
        'سرور Exchange به صورت خودکار شناسایی نشد و آدرسی نیز وارد نشده است. برای دریافت حجم مصرفی لحظه‌ای (TotalItemSize)، نام یا IP سرور Exchange را وارد کنید.',
    };
  }

  const psScript = buildExchangeMailboxPsScript({
    identity: params.identity,
    adminUsername: params.adminUsername,
    adminPassword: params.adminPassword,
    exchangeHosts: uniqueHosts,
  });

  // Try connecting via first reachable host (Exchange host first, then DC host as WinRM jump host)
  let lastError = '';
  for (const runnerHost of uniqueHosts) {
    try {
      const execRes = await executeHelpdeskPowerShell(
        {
          targetIp: runnerHost,
          protocol: params.winrmProtocol || 'auto',
          username: params.adminUsername,
          password: params.adminPassword,
          timeoutMs: 28000,
        },
        psScript
      );

      const trimmed = execRes.stdout.trim();
      const sIdx = trimmed.indexOf('{');
      const eIdx = trimmed.lastIndexOf('}');
      if (sIdx === -1 || eIdx < sIdx) {
        lastError = `${runnerHost}: Non-JSON Exchange PowerShell response`;
        continue;
      }
      const parsed: any = JSON.parse(trimmed.slice(sIdx, eIdx + 1));
      if (!parsed.ok) {
        lastError = `${runnerHost}: ${parsed.error || 'Exchange PowerShell session failed'}`;
        continue;
      }

      const normalizeQuota = (val: any): { bytes: number | null; unlimited: boolean } => {
        if (val === -1) return { bytes: null, unlimited: true };
        if (typeof val === 'number' && Number.isFinite(val) && val >= 0) {
          return { bytes: val, unlimited: false };
        }
        return { bytes: null, unlimited: false };
      };

      const warnQ = normalizeQuota(parsed.issueWarningQuotaBytes);
      const sendQ = normalizeQuota(parsed.prohibitSendQuotaBytes);
      const recvQ = normalizeQuota(parsed.prohibitSendReceiveQuotaBytes);

      const usedBytes =
        typeof parsed.totalUsedBytes === 'number' && parsed.totalUsedBytes >= 0
          ? parsed.totalUsedBytes
          : null;
      const effectiveQuota =
        sendQ.bytes ??
        recvQ.bytes ??
        warnQ.bytes ??
        params.mailbox.effectiveQuotaBytes ??
        null;
      const usedPct =
        usedBytes !== null && effectiveQuota && effectiveQuota > 0
          ? Math.round((usedBytes / effectiveQuota) * 1000) / 10
          : null;

      return {
        ...params.mailbox,
        hasMailbox: true,
        source: 'exchange_ps',
        liveStatsRetrieved: true,
        exchangeHostTried: uniqueHosts.join(', '),
        exchangeHostUsed: parsed.usedHost || runnerHost,
        exchangeStatusMessage: undefined,
        exchangeStatusMessageFa: undefined,
        databaseName: parsed.databaseName || params.mailbox.databaseName,
        serverName: parsed.serverName || params.mailbox.serverName || runnerHost,
        recipientType: parsed.recipientType || params.mailbox.recipientType,
        storageLimitStatus: parsed.storageLimitStatus || undefined,
        useDatabaseQuotaDefaults:
          typeof parsed.useDatabaseQuotaDefaults === 'boolean'
            ? parsed.useDatabaseQuotaDefaults
            : params.mailbox.useDatabaseQuotaDefaults,
        totalUsedBytes: usedBytes,
        deletedItemsBytes:
          typeof parsed.deletedItemsBytes === 'number' && parsed.deletedItemsBytes >= 0
            ? parsed.deletedItemsBytes
            : null,
        itemCount: typeof parsed.itemCount === 'number' ? parsed.itemCount : null,
        deletedItemCount:
          typeof parsed.deletedItemCount === 'number' ? parsed.deletedItemCount : null,
        issueWarningQuotaBytes: warnQ.bytes ?? params.mailbox.issueWarningQuotaBytes,
        prohibitSendQuotaBytes: sendQ.bytes ?? params.mailbox.prohibitSendQuotaBytes,
        prohibitSendReceiveQuotaBytes: recvQ.bytes ?? params.mailbox.prohibitSendReceiveQuotaBytes,
        effectiveQuotaBytes: effectiveQuota,
        usedPercent: usedPct,
        isUnlimitedQuota: sendQ.unlimited || recvQ.unlimited,
        lastLogonTime: parsed.lastLogonTime || null,
        archiveEnabled: Boolean(parsed.archiveEnabled ?? params.mailbox.archiveEnabled),
        archiveStatus: parsed.archiveStatus || undefined,
        archiveUsedBytes:
          typeof parsed.archiveUsedBytes === 'number' && parsed.archiveUsedBytes >= 0
            ? parsed.archiveUsedBytes
            : null,
        archiveQuotaBytes:
          typeof parsed.archiveQuotaBytes === 'number' && parsed.archiveQuotaBytes > 0
            ? parsed.archiveQuotaBytes
            : params.mailbox.archiveQuotaBytes,
        forwardingAddress: parsed.forwardingAddress || undefined,
        forwardingSmtpAddress: parsed.forwardingSmtpAddress || undefined,
        deliverToMailboxAndForward: Boolean(parsed.deliverToMailboxAndForward),
      };
    } catch (err: any) {
      lastError = `${runnerHost}: ${err?.message || err}`;
    }
  }

  return {
    ...params.mailbox,
    liveStatsRetrieved: false,
    exchangeHostTried: uniqueHosts.join(', '),
    exchangeStatusMessage:
      `AD mailbox attributes loaded, but live Exchange usage query (Get-MailboxStatistics) could not connect over WinRM/PowerShell: ${lastError}`,
    exchangeStatusMessageFa:
      `اطلاعات سهمیه میل‌باکس از Active Directory دریافت شد، اما دریافت حجم مصرفی لحظه‌ای (TotalItemSize) از سرور Exchange ناموفق بود: ${lastError}`,
  };
}

function evaluateLockoutState(params: {
  uac: number;
  uacComputed: number;
  hasUacComputed: boolean;
  lockoutFt: { iso: string | null; isNever: boolean; isZero: boolean };
  lockoutDurationMinutes: number | null;
}): {
  accountLocked: boolean;
  lockoutState: 'locked' | 'auto_expired_pending_clear' | 'unlocked';
  lockoutExpiresAt: string | null;
  lockoutRemainingMinutes: number | null;
} {
  const lockedByUacComp = (params.uacComputed & 0x10) !== 0;
  const lockedByUac = (params.uac & 0x10) !== 0;
  const hasLockoutTime =
    !params.lockoutFt.isZero && !params.lockoutFt.isNever && Boolean(params.lockoutFt.iso);

  let lockoutExpiresAt: string | null = null;
  let lockoutRemainingMinutes: number | null = null;
  if (hasLockoutTime && params.lockoutFt.iso && params.lockoutDurationMinutes && params.lockoutDurationMinutes > 0) {
    const expMs = new Date(params.lockoutFt.iso).getTime() + params.lockoutDurationMinutes * 60000;
    lockoutExpiresAt = new Date(expMs).toISOString();
    lockoutRemainingMinutes = Math.max(0, Math.ceil((expMs - Date.now()) / 60000));
  }

  if (lockedByUacComp || lockedByUac) {
    return {
      accountLocked: true,
      lockoutState: 'locked',
      lockoutExpiresAt,
      lockoutRemainingMinutes,
    };
  }

  if (hasLockoutTime) {
    // If AD computed bit explicitly says 0, or computed duration elapsed, the lockout timer expired (AD clears lockoutTime upon next logon)
    if (params.hasUacComputed) {
      return {
        accountLocked: false,
        lockoutState: 'auto_expired_pending_clear',
        lockoutExpiresAt,
        lockoutRemainingMinutes: 0,
      };
    }
    if (lockoutExpiresAt && new Date(lockoutExpiresAt).getTime() <= Date.now()) {
      return {
        accountLocked: false,
        lockoutState: 'auto_expired_pending_clear',
        lockoutExpiresAt,
        lockoutRemainingMinutes: 0,
      };
    }
    return {
      accountLocked: true,
      lockoutState: 'locked',
      lockoutExpiresAt,
      lockoutRemainingMinutes,
    };
  }

  return {
    accountLocked: false,
    lockoutState: 'unlocked',
    lockoutExpiresAt: null,
    lockoutRemainingMinutes: null,
  };
}

async function querySingleDcLockoutAttributes(params: {
  dcHost: string;
  isPdc: boolean;
  userDn: string;
  adminUsername: string;
  adminPassword: string;
  domainHints: string[];
  adConfig: any;
  ldapProtocol?: LdapTransportProtocol;
}): Promise<HelpdeskUserDcLockoutEntry> {
  try {
    const { session } = await openAuthenticatedLdapSession({
      input: {
        targetUsername: 'probe',
        adminUsername: params.adminUsername,
        adminPassword: params.adminPassword,
        domainController: params.dcHost,
        ldapProtocol: params.ldapProtocol || 'auto',
      },
      adConfig: params.adConfig,
      dcCandidates: [params.dcHost],
      domainHints: params.domainHints,
    });
    if (!session) {
      return {
        dcHost: params.dcHost,
        isPdc: params.isPdc,
        reachable: false,
        accountLocked: false,
        lockoutTimeRaw: '0',
        lockedAt: null,
        badPwdCount: 0,
        badPasswordTime: null,
        lastLogon: null,
      };
    }
    try {
      const rows = await ldapSearchEntries(session.client, params.userDn, {
        scope: 'base',
        filter: '(objectClass=*)',
        attributes: [
          'lockoutTime',
          'badPwdCount',
          'badPasswordTime',
          'lastLogon',
          'userAccountControl',
          'msDS-User-Account-Control-Computed',
        ],
      });
      const attrs = rows[0]?.attrs || {};
      const lockRaw = getFirstAttr(attrs, 'lockoutTime') || '0';
      const lockFt = filetimeToIso(lockRaw);
      const uac = Number(getFirstAttr(attrs, 'userAccountControl') || 0);
      const compStr = getFirstAttr(attrs, 'msDS-User-Account-Control-Computed');
      const uacComp = Number(compStr || 0);
      const badPwdFt = filetimeToIso(getFirstAttr(attrs, 'badPasswordTime'));
      const lastLogonFt = filetimeToIso(getFirstAttr(attrs, 'lastLogon'));
      const evalRes = evaluateLockoutState({
        uac,
        uacComputed: uacComp,
        hasUacComputed: compStr !== '',
        lockoutFt: lockFt,
        lockoutDurationMinutes: null,
      });

      return {
        dcHost: params.dcHost,
        isPdc: params.isPdc,
        reachable: true,
        accountLocked: evalRes.accountLocked,
        lockoutTimeRaw: lockRaw,
        lockedAt: lockFt.iso,
        badPwdCount: Number(getFirstAttr(attrs, 'badPwdCount') || 0),
        badPasswordTime: badPwdFt.iso,
        lastLogon: lastLogonFt.iso,
      };
    } finally {
      session.close();
    }
  } catch {
    return {
      dcHost: params.dcHost,
      isPdc: params.isPdc,
      reachable: false,
      accountLocked: false,
      lockoutTimeRaw: '0',
      lockedAt: null,
      badPwdCount: 0,
      badPasswordTime: null,
      lastLogon: null,
    };
  }
}

async function collectUserLockoutSecurityEvents(params: {
  dcHosts: string[];
  samAccountName: string;
  adminUsername: string;
  adminPassword: string;
  winrmProtocol?: HelpdeskProtocol;
}): Promise<{
  status: 'available' | 'empty' | 'unavailable';
  note?: string;
  noteFa?: string;
  events: HelpdeskUserLockoutEventEntry[];
}> {
  const uniqueHosts = dedupeStrings(params.dcHosts).slice(0, 2);
  if (uniqueHosts.length === 0) {
    return {
      status: 'unavailable',
      note: 'No Domain Controller candidate available for Security Event Log inspection.',
      noteFa: 'هیچ دامین کنترلری برای بررسی رویدادهای Security Event Log در دسترس نبود.',
      events: [],
    };
  }

  const samB64 = Buffer.from(params.samAccountName, 'utf8').toString('base64');
  const psScript = `
$ErrorActionPreference = 'Stop'
$targetSam = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${samB64}')).Trim().ToLower()
$since = (Get-Date).AddDays(-7)
$out = @()

try {
  $evts = Get-WinEvent -FilterHashtable @{ LogName='Security'; Id=4740,4767,4771,4625; StartTime=$since } -MaxEvents 400 -ErrorAction Stop
  foreach ($e in $evts) {
    $xml = [xml]$e.ToXml()
    $data = @{}
    foreach ($d in $xml.Event.EventData.Data) {
      if ($d.Name) { $data[$d.Name] = [string]$d.'#text' }
    }
    $tUser = ([string]($data['TargetUserName'])).Trim().ToLower()
    $tShort = if ($tUser.Contains('\\')) { $tUser.Split('\\')[-1] } elseif ($tUser.Contains('@')) { $tUser.Split('@')[0] } else { $tUser }
    if ($tShort -ne $targetSam) { continue }

    $caller = ''
    if ($e.Id -eq 4740) { $caller = [string]$data['TargetDomainName'] }
    elseif ($e.Id -eq 4625) { $caller = [string]$data['WorkstationName'] }

    $ip = ''
    if ($data['IpAddress'] -and $data['IpAddress'] -ne '-' -and $data['IpAddress'] -ne '::1' -and $data['IpAddress'] -ne '127.0.0.1') {
      $ip = [string]$data['IpAddress']
    } elseif ($e.Id -eq 4771 -and $data['IpAddress']) {
      $ip = ([string]$data['IpAddress']) -replace '^::ffff:', ''
    }

    $actor = ''
    if ($e.Id -eq 4767) { $actor = [string]$data['SubjectUserName'] }

    $sub = ''
    if ($data['SubStatus']) { $sub = [string]$data['SubStatus'] }
    elseif ($data['Status']) { $sub = [string]$data['Status'] }

    $evtType = switch ($e.Id) {
      4740 { 'locked_out' }
      4767 { 'unlocked' }
      4771 { 'bad_password' }
      default { 'logon_failed' }
    }

    $out += [PSCustomObject]@{
      eventId = [int]$e.Id
      eventType = $evtType
      timestamp = $e.TimeCreated.ToUniversalTime().ToString('o')
      dcHost = [string]$e.MachineName
      callerComputer = $caller
      sourceIp = $ip
      actor = $actor
      subStatus = $sub
    }
    if ($out.Count -ge 15) { break }
  }
  [PSCustomObject]@{ ok = $true; events = $out } | ConvertTo-Json -Depth 4 -Compress
} catch {
  [PSCustomObject]@{ ok = $false; error = [string]$_.Exception.Message; events = @() } | ConvertTo-Json -Compress
}
`;

  let lastErr = '';
  for (const host of uniqueHosts) {
    try {
      const execRes = await executeHelpdeskPowerShell(
        {
          targetIp: host,
          protocol: params.winrmProtocol || 'auto',
          username: params.adminUsername,
          password: params.adminPassword,
          timeoutMs: 9000,
        },
        psScript
      );
      const trimmed = execRes.stdout.trim();
      const sIdx = trimmed.indexOf('{');
      const eIdx = trimmed.lastIndexOf('}');
      if (sIdx === -1 || eIdx < sIdx) continue;
      const parsed = JSON.parse(trimmed.slice(sIdx, eIdx + 1));
      if (!parsed.ok) {
        lastErr = String(parsed.error || 'Security log access denied');
        continue;
      }
      const events: HelpdeskUserLockoutEventEntry[] = Array.isArray(parsed.events) ? parsed.events : [];
      if (events.length === 0) {
        return {
          status: 'empty',
          note: `Queried Windows Security Log on ${host} (last 7 days): 0 lockout (4740), unlock (4767), or failed auth (4771/4625) events found for ${params.samAccountName}.`,
          noteFa: `لاگ امنیتی ویندوز روی دامین کنترلر ${host} (۷ روز گذشته) بررسی شد: هیچ رویداد قفل (4740)، رفع قفل (4767) یا رمز اشتباه (4771/4625) برای کاربر ${params.samAccountName} ثبت نشده است.`,
          events: [],
        };
      }
      return {
        status: 'available',
        note: `Retrieved ${events.length} Security Event(s) from ${host} (last 7 days).`,
        noteFa: `${events.length} رویداد امنیتی قفل/ورود از دامین کنترلر ${host} (۷ روز گذشته) دریافت شد.`,
        events,
      };
    } catch (err: any) {
      lastErr = `${host}: ${err?.message || err}`;
    }
  }

  return {
    status: 'unavailable',
    note: lastErr
      ? `WinRM Security Event Log check skipped/unavailable (${lastErr}). Showing live multi-DC AD attributes.`
      : 'WinRM Security Event Log unavailable; showing live Active Directory attributes.',
    noteFa: lastErr
      ? `خواندن Security Event Log از طریق WinRM روی دامین کنترلر در دسترس نبود (${lastErr})؛ مقادیر زنده از Active Directory نمایش داده می‌شوند.`
      : 'دسترسی WinRM به Security Event Log برقرار نشد؛ اطلاعات زنده از دایرکتوری نمایش داده می‌شود.',
    events: [],
  };
}

function parseUserWorkstations(raw: string): {
  userWorkstationsRaw: string;
  allowedWorkstations: string[];
  workstationRestrictionMode: 'unrestricted' | 'restricted';
} {
  const clean = String(raw || '').trim();
  const list = dedupeStrings(
    clean
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return {
    userWorkstationsRaw: clean,
    allowedWorkstations: list,
    workstationRestrictionMode: list.length > 0 ? 'restricted' : 'unrestricted',
  };
}

function decodeLogonHoursBuffer(buf?: Buffer | null): {
  mode: 'unrestricted_24_7' | 'restricted' | 'unknown';
  allowedHoursCount: number | null;
  summaryEn: string;
  summaryFa: string;
} {
  if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
    return {
      mode: 'unrestricted_24_7',
      allowedHoursCount: 168,
      summaryEn: 'Unrestricted (24/7 — all 168 hours/week allowed)',
      summaryFa: 'نامحدود (تمام ۲۴ ساعت و ۷ روز هفته مجاز است)',
    };
  }
  if (buf.length < 21) {
    return {
      mode: 'unknown',
      allowedHoursCount: null,
      summaryEn: `Unrecognized AD logonHours binary length (${buf.length} bytes)`,
      summaryFa: `ساختار باینری ساعات ورود نامعتبر (${buf.length} بایت)`,
    };
  }

  const daysEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const daysFa = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'];
  let totalAllowed = 0;
  const dayRangesEn: string[] = [];
  const dayRangesFa: string[] = [];

  for (let d = 0; d < 7; d++) {
    const allowedHours: number[] = [];
    for (let h = 0; h < 24; h++) {
      const bitIndex = d * 24 + h;
      const byteIdx = Math.floor(bitIndex / 8);
      const bitPos = bitIndex % 8;
      if ((buf[byteIdx] & (1 << bitPos)) !== 0) {
        totalAllowed++;
        allowedHours.push(h);
      }
    }
    if (allowedHours.length > 0 && allowedHours.length < 24) {
      const minH = String(allowedHours[0]).padStart(2, '0');
      const maxH = String((allowedHours[allowedHours.length - 1] + 1) % 24).padStart(2, '0');
      dayRangesEn.push(`${daysEn[d]} ${minH}:00-${maxH}:00`);
      dayRangesFa.push(`${daysFa[d]} ${minH}:00-${maxH}:00`);
    } else if (allowedHours.length === 24) {
      dayRangesEn.push(`${daysEn[d]} Full`);
      dayRangesFa.push(`${daysFa[d]} تمام‌وقت`);
    }
  }

  if (totalAllowed === 168) {
    return {
      mode: 'unrestricted_24_7',
      allowedHoursCount: 168,
      summaryEn: 'Unrestricted (24/7 — 168/168 hours/week allowed)',
      summaryFa: 'نامحدود (تمام ۲۴ ساعت و ۷ روز هفته مجاز است — ۱۶۸ از ۱۶۸ ساعت)',
    };
  }

  if (totalAllowed === 0) {
    return {
      mode: 'restricted',
      allowedHoursCount: 0,
      summaryEn: 'Blocked by Logon Hours schedule (0/168 hours allowed)',
      summaryFa: 'مسدود توسط جدول ساعات ورود (۰ از ۱۶۸ ساعت مجاز)',
    };
  }

  return {
    mode: 'restricted',
    allowedHoursCount: totalAllowed,
    summaryEn: `Restricted (${totalAllowed}/168 hrs/week UTC): ${dayRangesEn.join(', ')}`,
    summaryFa: `محدودشده (${totalAllowed} از ۱۶۸ ساعت در هفته UTC): ${dayRangesFa.join('، ')}`,
  };
}

function buildLogonAndProfileInfo(params: {
  userWorkstationsRaw: string;
  profilePath: string;
  scriptPath: string;
  homeDirectory: string;
  homeDrive: string;
  logonHoursBuf?: Buffer | null;
  dcInteractiveRights: HelpdeskUserLogonAndProfileInfo['dcInteractiveRights'];
}): HelpdeskUserLogonAndProfileInfo {
  const ws = parseUserWorkstations(params.userWorkstationsRaw);
  const lh = decodeLogonHoursBuffer(params.logonHoursBuf);
  const profilePath = String(params.profilePath || '').trim();
  const scriptPath = String(params.scriptPath || '').trim();
  const homeDirectory = String(params.homeDirectory || '').trim();
  const homeDrive = String(params.homeDrive || '').trim();

  return {
    userWorkstationsRaw: ws.userWorkstationsRaw,
    allowedWorkstations: ws.allowedWorkstations,
    workstationRestrictionMode: ws.workstationRestrictionMode,
    profilePath,
    profileType: profilePath ? 'roaming' : 'local',
    scriptPath,
    homeDirectory,
    homeDrive,
    logonHoursMode: lh.mode,
    logonHoursAllowedHoursCount: lh.allowedHoursCount,
    logonHoursSummaryEn: lh.summaryEn,
    logonHoursSummaryFa: lh.summaryFa,
    dcInteractiveRights: params.dcInteractiveRights,
  };
}

async function collectDcUserLogonRights(params: {
  dcHosts: string[];
  targetSids: string[];
  adminUsername: string;
  adminPassword: string;
  winrmProtocol?: HelpdeskProtocol;
}): Promise<HelpdeskUserLogonAndProfileInfo['dcInteractiveRights']> {
  const uniqueHosts = dedupeStrings(params.dcHosts).slice(0, 2);
  const cleanSids = dedupeStrings(
    params.targetSids.filter((s) => /^S-\d+(?:-\d+)+$/.test(String(s || '').trim()))
  );

  if (uniqueHosts.length === 0 || cleanSids.length === 0) {
    return {
      status: 'unavailable',
      dcHost: uniqueHosts[0] || '',
      allowLocalOnDc: null,
      denyLocalOnDc: null,
      allowRdpOnDc: null,
      denyRdpOnDc: null,
      matchedAllowLocalTrustees: [],
      matchedDenyLocalTrustees: [],
      matchedAllowRdpTrustees: [],
      matchedDenyRdpTrustees: [],
      noteEn: 'DC User Rights Assignment inspection skipped (no reachable DC host or SID token).',
      noteFa: 'بررسی سطح دسترسی لاگان لوکال روی دامین کنترلر انجام نشد (عدم وجود DC یا SID).',
    };
  }

  const sidsB64 = Buffer.from(JSON.stringify(cleanSids), 'utf8').toString('base64');
  const psScript = `
$ErrorActionPreference = 'Stop'
$userSids = New-Object System.Collections.Generic.HashSet[string]([StringComparer]::OrdinalIgnoreCase)
$decoded = ([System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${sidsB64}')) | ConvertFrom-Json)
foreach ($s in $decoded) { if ($s) { [void]$userSids.Add([string]$s) } }

$tmpInf = Join-Path $env:TEMP ("hd_ur_" + [Guid]::NewGuid().ToString('N') + ".inf")
try {
  $null = & secedit.exe /export /cfg $tmpInf /areas USER_RIGHTS /quiet 2>&1
  if (-not (Test-Path $tmpInf)) {
    throw "secedit did not export USER_RIGHTS policy."
  }
  $lines = Get-Content -Path $tmpInf -Encoding Unicode -ErrorAction SilentlyContinue
  if (-not $lines) { $lines = Get-Content -Path $tmpInf -ErrorAction SilentlyContinue }

  $rights = @{}
  foreach ($line in $lines) {
    if ($line -match '^\\s*(SeInteractiveLogonRight|SeDenyInteractiveLogonRight|SeRemoteInteractiveLogonRight|SeDenyRemoteInteractiveLogonRight)\\s*=\\s*(.+)$') {
      $key = $matches[1]
      $tokens = $matches[2].Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
      $matchedNames = @()
      foreach ($tok in $tokens) {
        $sidVal = ''
        $friendly = $tok
        if ($tok.StartsWith('*')) {
          $sidVal = $tok.Substring(1).Trim()
          try {
            $friendly = (New-Object System.Security.Principal.SecurityIdentifier($sidVal)).Translate([System.Security.Principal.NTAccount]).Value
          } catch {
            $friendly = $sidVal
          }
        } else {
          try {
            $nt = New-Object System.Security.Principal.NTAccount($tok)
            $sidVal = $nt.Translate([System.Security.Principal.SecurityIdentifier]).Value
          } catch {}
        }
        if ($sidVal -and $userSids.Contains($sidVal)) {
          $matchedNames += $friendly
        }
      }
      $rights[$key] = @($matchedNames | Select-Object -Unique)
    }
  }

  $allowLoc = @($rights['SeInteractiveLogonRight'])
  $denyLoc = @($rights['SeDenyInteractiveLogonRight'])
  $allowRdp = @($rights['SeRemoteInteractiveLogonRight'])
  $denyRdp = @($rights['SeDenyRemoteInteractiveLogonRight'])

  [PSCustomObject]@{
    ok = $true
    dcHost = $env:COMPUTERNAME
    allowLocal = ($allowLoc.Count -gt 0 -and $denyLoc.Count -eq 0)
    denyLocal = ($denyLoc.Count -gt 0)
    allowRdp = ($allowRdp.Count -gt 0 -and $denyRdp.Count -eq 0)
    denyRdp = ($denyRdp.Count -gt 0)
    matchedAllowLocal = $allowLoc
    matchedDenyLocal = $denyLoc
    matchedAllowRdp = $allowRdp
    matchedDenyRdp = $denyRdp
  } | ConvertTo-Json -Depth 4 -Compress
} catch {
  [PSCustomObject]@{ ok = $false; error = [string]$_.Exception.Message } | ConvertTo-Json -Compress
} finally {
  if (Test-Path $tmpInf) { Remove-Item -Path $tmpInf -Force -ErrorAction SilentlyContinue }
}
`;

  let lastErr = '';
  for (const host of uniqueHosts) {
    try {
      const execRes = await executeHelpdeskPowerShell(
        {
          targetIp: host,
          protocol: params.winrmProtocol || 'auto',
          username: params.adminUsername,
          password: params.adminPassword,
          timeoutMs: 8500,
        },
        psScript
      );
      const trimmed = execRes.stdout.trim();
      const sIdx = trimmed.indexOf('{');
      const eIdx = trimmed.lastIndexOf('}');
      if (sIdx === -1 || eIdx < sIdx) continue;
      const parsed: any = JSON.parse(trimmed.slice(sIdx, eIdx + 1));
      if (!parsed.ok) {
        lastErr = String(parsed.error || 'secedit failed');
        continue;
      }

      const mAllowLoc: string[] = Array.isArray(parsed.matchedAllowLocal) ? parsed.matchedAllowLocal : [];
      const mDenyLoc: string[] = Array.isArray(parsed.matchedDenyLocal) ? parsed.matchedDenyLocal : [];
      const mAllowRdp: string[] = Array.isArray(parsed.matchedAllowRdp) ? parsed.matchedAllowRdp : [];
      const mDenyRdp: string[] = Array.isArray(parsed.matchedDenyRdp) ? parsed.matchedDenyRdp : [];

      return {
        status: 'available',
        dcHost: host,
        allowLocalOnDc: Boolean(parsed.allowLocal),
        denyLocalOnDc: Boolean(parsed.denyLocal),
        allowRdpOnDc: Boolean(parsed.allowRdp),
        denyRdpOnDc: Boolean(parsed.denyRdp),
        matchedAllowLocalTrustees: mAllowLoc,
        matchedDenyLocalTrustees: mDenyLoc,
        matchedAllowRdpTrustees: mAllowRdp,
        matchedDenyRdpTrustees: mDenyRdp,
        noteEn: `Evaluated live Windows User Rights Assignment (secedit) on ${host} using user + nested tokenGroups SIDs.`,
        noteFa: `سیاست‌های محلی دامین کنترلر ${host} (secedit USER_RIGHTS) به صورت زنده با تطبیق SID کاربر و تمام گروه‌های عضو بررسی شد.`,
      };
    } catch (err: any) {
      lastErr = `${host}: ${err?.message || err}`;
    }
  }

  return {
    status: 'unavailable',
    dcHost: uniqueHosts[0],
    allowLocalOnDc: null,
    denyLocalOnDc: null,
    allowRdpOnDc: null,
    denyRdpOnDc: null,
    matchedAllowLocalTrustees: [],
    matchedDenyLocalTrustees: [],
    matchedAllowRdpTrustees: [],
    matchedDenyRdpTrustees: [],
    noteEn: lastErr
      ? `WinRM User Rights check on ${uniqueHosts[0]} unavailable (${lastErr}). AD workstation & profile paths still apply.`
      : `WinRM User Rights check on ${uniqueHosts[0]} unavailable; showing AD workstation & profile attributes.`,
    noteFa: lastErr
      ? `بررسی سیاست محلی WinRM روی ${uniqueHosts[0]} در دسترس نبود (${lastErr})؛ تنظیمات سیستم‌های مجاز و پروفایل از AD خوانده شده است.`
      : `دسترسی WinRM به سیاست محلی دامین کنترلر برقرار نشد؛ تنظیمات پروفایل و سیستم‌های مجاز از AD نمایش داده می‌شود.`,
  };
}

export interface HelpdeskUserSearchInput {
  query?: string;
  adminUsername: string;
  adminPassword: string;
  domainController?: string;
  ldapProtocol?: LdapTransportProtocol;
  winrmProtocol?: HelpdeskProtocol;
  limit?: number;
}

export interface HelpdeskUserSearchHit {
  samAccountName: string;
  userPrincipalName: string;
  displayName: string;
  cn: string;
  distinguishedName: string;
  organizationalUnit: string;
  department: string;
  jobTitle: string;
  email: string;
  accountEnabled: boolean;
  accountLocked: boolean;
  whenCreated: string | null;
}

export async function searchDomainUsers(
  input: HelpdeskUserSearchInput,
  policyContext?: HelpdeskAdPolicyContext
): Promise<{
  domainController: string;
  domainName: string;
  method: 'ldaps' | 'ldap' | 'winrm_adsi';
  port: number;
  users: HelpdeskUserSearchHit[];
}> {
  const adminUsername = String(input.adminUsername || '').trim();
  const adminPassword = String(input.adminPassword || '');
  if (!adminUsername || !adminPassword) {
    throw new Error('Privileged domain username and password are required to search Active Directory users.');
  }

  // Fast exit if policy restricts AD scope to 'selected' with empty allowlists
  if (
    policyContext &&
    !policyContext.hasFullAccess &&
    policyContext.policy?.targetHelpdeskAdScope === 'selected' &&
    (policyContext.policy.allowedHelpdeskAdUsers || []).length === 0 &&
    (policyContext.policy.allowedHelpdeskAdGroups || []).length === 0
  ) {
    return {
      domainController: String(input.domainController || ''),
      domainName: '',
      method: 'ldaps',
      port: 636,
      users: [],
    };
  }

  const explicitDc = validateSafeHostOrIp(input.domainController, 'Domain Controller');
  const adConfig = await getActiveDirectoryConfig().catch(() => null);
  const adminParts = splitUsernameParts(adminUsername);
  const domainHints = dedupeStrings([adminParts.domain, adConfig?.domain]);

  const { candidates: dcCandidates } = await discoverDcHostsWithPdc({
    explicitDc,
    adConfig,
    domainHints,
  });

  if (dcCandidates.length === 0) {
    throw new Error(
      'No Domain Controller could be resolved automatically. Specify the Domain Controller host/IP in Connection Options or enter credentials with a domain suffix (e.g., admin@corp.local).'
    );
  }

  const query = String(input.query || '').trim();
  const limit = Math.max(5, Math.min(100, Number(input.limit) || 50));

  const { session, errors } = await openAuthenticatedLdapSession({
    input: {
      targetUsername: adminUsername,
      adminUsername,
      adminPassword,
      domainController: explicitDc,
      ldapProtocol: input.ldapProtocol || 'auto',
    },
    adConfig,
    dcCandidates,
    domainHints,
  });

  if (session) {
    try {
      const escapedQ = escapeLdapFilterValue(query);
      const filter = query
        ? `(&(objectCategory=person)(objectClass=user)(|(sAMAccountName=*${escapedQ}*)(userPrincipalName=*${escapedQ}*)(displayName=*${escapedQ}*)(cn=*${escapedQ}*)(mail=*${escapedQ}*)(department=*${escapedQ}*)(title=*${escapedQ}*)))`
        : '(&(objectCategory=person)(objectClass=user))';

      const rows = await ldapSearchEntries(session.client, session.defaultNamingContext, {
        scope: 'sub',
        filter,
        attributes: [
          'sAMAccountName',
          'userPrincipalName',
          'displayName',
          'cn',
          'distinguishedName',
          'department',
          'title',
          'mail',
          'memberOf',
          'primaryGroupID',
          'userAccountControl',
          'lockoutTime',
          'msDS-User-Account-Control-Computed',
          'whenCreated',
        ],
        sizeLimit: Math.min(250, limit * 2),
        paged: { pageSize: Math.min(250, limit * 2) },
      });

      const mapped = rows
        .map((r) => {
          const sam = getFirstAttr(r.attrs, 'sAMAccountName');
          if (!sam) return null;
          const dn = r.dn || getFirstAttr(r.attrs, 'distinguishedName');
          const cn = getFirstAttr(r.attrs, 'cn') || sam;
          const displayName = getFirstAttr(r.attrs, 'displayName') || cn || sam;
          const uac = Number(getFirstAttr(r.attrs, 'userAccountControl') || 0);
          const uacComp = Number(getFirstAttr(r.attrs, 'msDS-User-Account-Control-Computed') || 0);
          const lockRaw = getFirstAttr(r.attrs, 'lockoutTime') || '0';
          const accountEnabled = (uac & 0x2) === 0;
          const accountLocked =
            (uacComp & 0x10) !== 0 || (lockRaw !== '' && lockRaw !== '0');
          const groupEntries: HelpdeskUserGroupEntry[] = getAllAttrs(r.attrs, 'memberOf').map((gDn) => ({
            cn: extractCnFromDn(gDn),
            dn: gDn,
          }));
          if (getFirstAttr(r.attrs, 'primaryGroupID') === '513') {
            groupEntries.unshift({
              cn: 'Domain Users',
              dn: `CN=Domain Users,CN=Users,${session.defaultNamingContext}`,
              isPrimary: true,
            });
          }

          return {
            hit: {
              samAccountName: sam,
              userPrincipalName: getFirstAttr(r.attrs, 'userPrincipalName'),
              displayName,
              cn,
              distinguishedName: dn,
              organizationalUnit: extractOuBreadcrumb(dn),
              department: getFirstAttr(r.attrs, 'department'),
              jobTitle: getFirstAttr(r.attrs, 'title'),
              email: getFirstAttr(r.attrs, 'mail'),
              accountEnabled,
              accountLocked,
              whenCreated: adGeneralizedTimeToIso(getFirstAttr(r.attrs, 'whenCreated')),
            } as HelpdeskUserSearchHit,
            groups: groupEntries,
          };
        })
        .filter((u): u is { hit: HelpdeskUserSearchHit; groups: HelpdeskUserGroupEntry[] } => Boolean(u));

      const filtered = await filterDomainUserSearchHits(mapped, session.domainName, policyContext);

      filtered.sort((a, b) => {
        if (a.accountLocked !== b.accountLocked) return a.accountLocked ? -1 : 1;
        return (a.displayName || a.samAccountName).localeCompare(b.displayName || b.samAccountName);
      });

      return {
        domainController: session.host,
        domainName: session.domainName,
        method: session.useSsl ? 'ldaps' : 'ldap',
        port: session.port,
        users: filtered.slice(0, limit),
      };
    } finally {
      session.close();
    }
  }

  // Adaptive legacy fallback: try WinRM / SMB ADSI on first candidate DC unless LDAP returned invalid credentials
  const fallbackHost = dcCandidates[0];
  const hasBindFailure = errors.some((e) => /bind failed|invalid credentials/i.test(e));
  if (!hasBindFailure && fallbackHost) {
    const safeQ = query.replace(/[()\\*\0]/g, '').replace(/'/g, "''");
    const ldapFilter = safeQ
      ? `(&(objectCategory=person)(objectClass=user)(|(sAMAccountName=*${safeQ}*)(userPrincipalName=*${safeQ}*)(displayName=*${safeQ}*)(cn=*${safeQ}*)(mail=*${safeQ}*)(department=*${safeQ}*)))`
      : '(&(objectCategory=person)(objectClass=user))';
    const psScript = `
$ErrorActionPreference = 'Stop'
$rootDse = [ADSI]"LDAP://RootDSE"
$defaultNc = [string]$rootDse.defaultNamingContext
$ds = New-Object System.DirectoryServices.DirectorySearcher([ADSI]"LDAP://$defaultNc")
$ds.Filter = '${ldapFilter}'
$ds.PageSize = ${limit}
$ds.SizeLimit = ${limit}
@('sAMAccountName','userPrincipalName','displayName','cn','distinguishedName','department','title','mail','memberOf','primaryGroupID','userAccountControl','lockoutTime','whenCreated') | ForEach-Object { [void]$ds.PropertiesToLoad.Add($_) }
$hits = @()
foreach ($r in $ds.FindAll()) {
  $p = $r.Properties
  $sam = if ($p['samaccountname'].Count -gt 0) { [string]$p['samaccountname'][0] } else { '' }
  if (-not $sam) { continue }
  $uac = if ($p['useraccountcontrol'].Count -gt 0) { [int]$p['useraccountcontrol'][0] } else { 0 }
  $lt = if ($p['lockouttime'].Count -gt 0) { [string]$p['lockouttime'][0] } else { '0' }
  $wc = if ($p['whencreated'].Count -gt 0) { [datetime]$p['whencreated'][0] } else { $null }
  $moList = @()
  if ($p['memberof']) { foreach ($mo in $p['memberof']) { $moList += [string]$mo } }
  $pgId = if ($p['primarygroupid'].Count -gt 0) { [string]$p['primarygroupid'][0] } else { '' }
  $hits += [PSCustomObject]@{
    samAccountName = $sam
    userPrincipalName = if ($p['userprincipalname'].Count -gt 0) { [string]$p['userprincipalname'][0] } else { '' }
    displayName = if ($p['displayname'].Count -gt 0) { [string]$p['displayname'][0] } elseif ($p['cn'].Count -gt 0) { [string]$p['cn'][0] } else { $sam }
    cn = if ($p['cn'].Count -gt 0) { [string]$p['cn'][0] } else { $sam }
    distinguishedName = if ($p['distinguishedname'].Count -gt 0) { [string]$p['distinguishedname'][0] } else { '' }
    department = if ($p['department'].Count -gt 0) { [string]$p['department'][0] } else { '' }
    jobTitle = if ($p['title'].Count -gt 0) { [string]$p['title'][0] } else { '' }
    email = if ($p['mail'].Count -gt 0) { [string]$p['mail'][0] } else { '' }
    memberOf = $moList
    primaryGroupId = $pgId
    accountEnabled = (($uac -band 2) -eq 0)
    accountLocked = ($lt -ne '' -and $lt -ne '0')
    whenCreated = if ($wc) { $wc.ToUniversalTime().ToString('o') } else { $null }
  }
}
[PSCustomObject]@{
  defaultNc = $defaultNc
  users = $hits
} | ConvertTo-Json -Depth 4 -Compress
`;
    const execRes = await executeHelpdeskPowerShell(
      {
        targetIp: fallbackHost,
        protocol: input.winrmProtocol || 'auto',
        username: adminUsername,
        password: adminPassword,
        timeoutMs: 22000,
      },
      psScript
    );
    const trimmed = execRes.stdout.trim();
    const sIdx = trimmed.indexOf('{');
    const eIdx = trimmed.lastIndexOf('}');
    if (sIdx !== -1 && eIdx >= sIdx) {
      const parsed: any = JSON.parse(trimmed.slice(sIdx, eIdx + 1));
      const rawUsers: any[] = Array.isArray(parsed?.users)
        ? parsed.users
        : parsed?.users
        ? [parsed.users]
        : [];
      const winrmDomain = dnToDomainName(String(parsed?.defaultNc || '')) || domainHints[0] || fallbackHost;
      const mapped = rawUsers
        .map((u) => {
          const sam = String(u.samAccountName || '');
          if (!sam) return null;
          const groupEntries: HelpdeskUserGroupEntry[] = (Array.isArray(u.memberOf) ? u.memberOf : []).map(
            (gDn: any) => ({
              cn: extractCnFromDn(String(gDn || '')),
              dn: String(gDn || ''),
            })
          );
          if (String(u.primaryGroupId || '') === '513' && parsed?.defaultNc) {
            groupEntries.unshift({
              cn: 'Domain Users',
              dn: `CN=Domain Users,CN=Users,${String(parsed.defaultNc)}`,
              isPrimary: true,
            });
          }
          return {
            hit: {
              samAccountName: sam,
              userPrincipalName: String(u.userPrincipalName || ''),
              displayName: String(u.displayName || sam),
              cn: String(u.cn || sam),
              distinguishedName: String(u.distinguishedName || ''),
              organizationalUnit: extractOuBreadcrumb(String(u.distinguishedName || '')),
              department: String(u.department || ''),
              jobTitle: String(u.jobTitle || ''),
              email: String(u.email || ''),
              accountEnabled: u.accountEnabled !== false,
              accountLocked: Boolean(u.accountLocked),
              whenCreated: u.whenCreated ? String(u.whenCreated) : null,
            } as HelpdeskUserSearchHit,
            groups: groupEntries,
          };
        })
        .filter((x): x is { hit: HelpdeskUserSearchHit; groups: HelpdeskUserGroupEntry[] } => Boolean(x));

      const filtered = await filterDomainUserSearchHits(mapped, winrmDomain, policyContext);
      filtered.sort((a, b) => {
        if (a.accountLocked !== b.accountLocked) return a.accountLocked ? -1 : 1;
        return (a.displayName || a.samAccountName).localeCompare(b.displayName || b.samAccountName);
      });
      return {
        domainController: fallbackHost,
        domainName: winrmDomain,
        method: 'winrm_adsi',
        port: execRes.portUsed,
        users: filtered.slice(0, limit),
      };
    }
  }

  throw new Error(
    `Failed to bind to Active Directory via LDAPS/LDAP: ${errors.slice(0, 4).join(' ; ')}`
  );
}

export async function inspectTargetDomainUser(
  input: HelpdeskUserInspectInput,
  policyContext?: HelpdeskAdPolicyContext
): Promise<HelpdeskUserInspectionResult> {
  const cleanTarget = sanitizeAndValidateTargetUsername(input.targetUsername);
  const adminUsername = String(input.adminUsername || '').trim();
  const adminPassword = String(input.adminPassword || '');
  if (!adminUsername || !adminPassword) {
    throw new Error('Privileged domain username and password are required to query Active Directory.');
  }

  const targetParts = splitUsernameParts(cleanTarget);
  // Pre-connect policy guard (blocks explicitly denylisted users or empty AD allowlist before contacting AD)
  const preCheck = await checkDomainUserPreConnectPolicy(cleanTarget, targetParts.domain, policyContext);
  if (preCheck.blocked) {
    const err: any = new Error(preCheck.reasonEn);
    err.reasonFa = preCheck.reasonFa;
    err.blockedByException = true;
    throw err;
  }

  const explicitDc = validateSafeHostOrIp(input.domainController, 'Domain Controller');
  const explicitExch = validateSafeHostOrIp(input.exchangeServer, 'Exchange Server');
  const adConfig = await getActiveDirectoryConfig().catch(() => null);

  const adminParts = splitUsernameParts(adminUsername);
  const domainHints = dedupeStrings([
    adminParts.domain,
    targetParts.domain,
    adConfig?.domain,
  ]);

  const { candidates: dcCandidates, pdcHost } = await discoverDcHostsWithPdc({
    explicitDc,
    adConfig,
    domainHints,
  });

  if (dcCandidates.length === 0) {
    throw new Error(
      'No Domain Controller could be resolved automatically. Specify the Domain Controller host/IP in Connection Options or enter credentials with a domain suffix (e.g., admin@corp.local).'
    );
  }

  const { session, errors } = await openAuthenticatedLdapSession({
    input,
    adConfig,
    dcCandidates,
    domainHints,
  });

  if (!session) {
    // Fallback: if explicit DC or discovered DC answers WinRM/SMB (ports 5986/5985/445), try WinRM ADSI
    const fallbackHost = dcCandidates[0];
    const hasBindFailure = errors.some((e) => /bind failed|invalid credentials/i.test(e));
    if (!hasBindFailure && fallbackHost) {
      try {
        const winrmRaw = await inspectUserViaWinRmAdsiFallback({
          targetUsername: cleanTarget,
          adminUsername,
          adminPassword,
          host: fallbackHost,
          winrmProtocol: input.winrmProtocol,
        });
        const winrmSids = dedupeStrings([
          winrmRaw.profile.objectSid,
          ...(((winrmRaw as any)._tokenGroupSids as string[]) || []),
          'S-1-5-11',
          'S-1-1-0',
        ]);
        delete (winrmRaw as any)._tokenGroupSids;
        const winrmRes: HelpdeskUserInspectionResult = winrmRaw;
        const winrmPolicyErr = await checkDomainUserExceptionPolicy({
          samAccountName: winrmRes.profile.samAccountName,
          userPrincipalName: winrmRes.profile.userPrincipalName,
          distinguishedName: winrmRes.profile.distinguishedName,
          domainName: winrmRes.connectionInfo.domainName,
          groups: winrmRes.groups,
          policyContext,
          actionLabel: 'Inspection',
          actionLabelFa: 'بررسی کاربر',
        });
        if (winrmPolicyErr.blocked) {
          const err: any = new Error(winrmPolicyErr.reasonEn);
          err.reasonFa = winrmPolicyErr.reasonFa;
          err.blockedByException = true;
          throw err;
        }
        const [evRes, dcRightsRes] = await Promise.all([
          collectUserLockoutSecurityEvents({
            dcHosts: pdcHost ? [pdcHost, fallbackHost] : [fallbackHost],
            samAccountName: winrmRes.profile.samAccountName,
            adminUsername,
            adminPassword,
            winrmProtocol: input.winrmProtocol,
          }).catch(() => null),
          collectDcUserLogonRights({
            dcHosts: pdcHost ? [pdcHost, fallbackHost] : [fallbackHost],
            targetSids: winrmSids,
            adminUsername,
            adminPassword,
            winrmProtocol: input.winrmProtocol,
          }).catch(() => null),
        ]);
        if (evRes) {
          winrmRes.security.lockoutEventsStatus = evRes.status;
          winrmRes.security.lockoutEventsNote = evRes.note;
          winrmRes.security.lockoutEventsNoteFa = evRes.noteFa;
          winrmRes.security.lockoutEvents = evRes.events;
        }
        if (dcRightsRes && winrmRes.logonAndProfile) {
          winrmRes.logonAndProfile.dcInteractiveRights = dcRightsRes;
        }
        if (input.includeMailbox !== false && winrmRes.mailbox.hasMailbox) {
          const { defaultMailHost, candidates } = buildPrioritizedExchangeCandidates({
            explicitExch,
            primaryEmail: winrmRes.contact.primaryEmail,
            emailAliases: winrmRes.contact.emailAliases,
            upn: winrmRes.profile.userPrincipalName,
            targetDomain: targetParts.domain,
            adminDomain: adminParts.domain,
            sessionDomain: winrmRes.connectionInfo.domainName,
            adConfigDomain: adConfig?.domain,
            discoveredExchHost: winrmRes.mailbox.serverName,
            fallbackHost,
          });
          if (!explicitExch && defaultMailHost) {
            winrmRes.mailbox.exchangeHostTried = defaultMailHost;
            if (!winrmRes.mailbox.serverName) {
              winrmRes.mailbox.serverName = defaultMailHost;
            }
          }
          winrmRes.mailbox = await enrichLiveMailboxStats({
            mailbox: winrmRes.mailbox,
            identity:
              winrmRes.contact.primaryEmail ||
              winrmRes.profile.userPrincipalName ||
              winrmRes.profile.samAccountName ||
              cleanTarget,
            adminUsername,
            adminPassword,
            exchangeHosts: candidates,
            winrmProtocol: input.winrmProtocol,
          });
        }
        return winrmRes;
      } catch (winrmErr: any) {
        if (winrmErr?.blockedByException) throw winrmErr;
        errors.push(`WinRM ADSI fallback (${fallbackHost}): ${winrmErr?.message || winrmErr}`);
      }
    }

    throw new Error(
      `Failed to connect or authenticate to Active Directory (${dcCandidates.join(', ')}): ${errors.join(' | ')}`
    );
  }

  try {
    const searchBase = adConfig?.userSearchBase || session.defaultNamingContext;
    if (!searchBase) {
      throw new Error('Could not determine Active Directory Base DN (defaultNamingContext).');
    }

    const escFull = escapeLdapFilterValue(cleanTarget);
    const escSam = escapeLdapFilterValue(targetParts.sam || cleanTarget);
    const filter = `(&(objectCategory=person)(objectClass=user)(|(sAMAccountName=${escSam})(userPrincipalName=${escFull})(mail=${escFull})(proxyAddresses=smtp:${escFull})(proxyAddresses=SMTP:${escFull})))`;

    let entries = await ldapSearchEntries(session.client, searchBase, {
      scope: 'sub',
      filter,
      attributes: USER_LDAP_ATTRIBUTES,
      sizeLimit: 5,
    });

    // Retry from root defaultNamingContext if userSearchBase excluded the user's OU
    if (entries.length === 0 && searchBase !== session.defaultNamingContext && session.defaultNamingContext) {
      entries = await ldapSearchEntries(session.client, session.defaultNamingContext, {
        scope: 'sub',
        filter,
        attributes: USER_LDAP_ATTRIBUTES,
        sizeLimit: 5,
      });
    }

    if (entries.length === 0) {
      throw new Error(
        `User "${cleanTarget}" was not found in Active Directory (${session.domainName || session.host}). Verify the username, UPN, or email address.`
      );
    }

    const entry = entries[0];
    const attrs = entry.attrs;
    const bufs = entry.buffers;
    const userDn = entry.dn;

    const sam = getFirstAttr(attrs, 'sAMAccountName') || targetParts.sam;
    const upn = getFirstAttr(attrs, 'userPrincipalName');
    const primaryMail = getFirstAttr(attrs, 'mail');
    const { primaryEmail, aliases } = parseProxyAddresses(
      primaryMail,
      getAllAttrs(attrs, 'proxyAddresses')
    );

    const internalPhones = dedupeStrings([
      ...getAllAttrs(attrs, 'telephoneNumber'),
      ...getAllAttrs(attrs, 'otherTelephone'),
      ...getAllAttrs(attrs, 'ipPhone'),
      ...getAllAttrs(attrs, 'otherIpPhone'),
    ]);
    const mobileNumbers = dedupeStrings([
      ...getAllAttrs(attrs, 'mobile'),
      ...getAllAttrs(attrs, 'otherMobile'),
    ]);
    const homePhones = dedupeStrings([
      ...getAllAttrs(attrs, 'homePhone'),
      ...getAllAttrs(attrs, 'otherHomePhone'),
    ]);

    // Resolve manager & direct reports cleanly
    const resolvePersonByDn = async (personDn: string): Promise<HelpdeskUserRelatedPerson | null> => {
      if (!personDn) return null;
      try {
        const res = await ldapSearchEntries(session.client, personDn, {
          scope: 'base',
          filter: '(objectClass=*)',
          attributes: ['sAMAccountName', 'displayName', 'cn', 'title', 'department', 'mail'],
        });
        if (!res[0]) return null;
        return {
          dn: personDn,
          samAccountName: getFirstAttr(res[0].attrs, 'sAMAccountName'),
          displayName: getFirstAttr(res[0].attrs, 'displayName') || getFirstAttr(res[0].attrs, 'cn') || extractCnFromDn(personDn),
          title: getFirstAttr(res[0].attrs, 'title'),
          department: getFirstAttr(res[0].attrs, 'department'),
          email: getFirstAttr(res[0].attrs, 'mail'),
        };
      } catch {
        return {
          dn: personDn,
          samAccountName: '',
          displayName: extractCnFromDn(personDn),
          title: '',
          department: '',
          email: '',
        };
      }
    };

    const managerDn = getFirstAttr(attrs, 'manager');
    const directReportDns = getAllAttrs(attrs, 'directReports').slice(0, 25);

    const [managerResolved, directReportsResolved, tokenGroupsRows] = await Promise.all([
      resolvePersonByDn(managerDn),
      Promise.all(directReportDns.map((d) => resolvePersonByDn(d))),
      ldapSearchEntries(session.client, userDn, {
        scope: 'base',
        filter: '(objectClass=*)',
        attributes: ['tokenGroups'],
      }).catch(() => []),
    ]);

    const userObjectSid = parseBinarySid(bufs['objectsid']?.[0]);
    const tokenGroupSids = (tokenGroupsRows[0]?.buffers?.['tokengroups'] || [])
      .map((b) => parseBinarySid(b))
      .filter(Boolean);
    const effectiveUserSids = dedupeStrings([userObjectSid, ...tokenGroupSids, 'S-1-5-11', 'S-1-1-0']);

    // Domain password & lockout policy (+ check Fine-Grained Password Policy if msDS-ResultantPSO is set)
    let domainPolicy: HelpdeskUserDomainPolicy = {
      domainName: session.domainName,
      source: 'unknown',
      maxPasswordAgeDays: null,
      minPasswordAgeDays: null,
      minPasswordLength: null,
      lockoutThreshold: null,
      lockoutDurationMinutes: null,
      lockoutObservationWindowMinutes: null,
    };

    const psoDn = getFirstAttr(attrs, 'msDS-ResultantPSO');
    if (psoDn) {
      try {
        const psoRows = await ldapSearchEntries(session.client, psoDn, {
          scope: 'base',
          filter: '(objectClass=*)',
          attributes: [
            'cn',
            'msDS-MaximumPasswordAge',
            'msDS-MinimumPasswordAge',
            'msDS-MinimumPasswordLength',
            'msDS-LockoutThreshold',
            'msDS-LockoutDuration',
            'msDS-LockoutObservationWindow',
          ],
        });
        if (psoRows[0]) {
          const pa = psoRows[0].attrs;
          const maxMin = adDurationToMinutes(getFirstAttr(pa, 'msDS-MaximumPasswordAge'));
          const minMin = adDurationToMinutes(getFirstAttr(pa, 'msDS-MinimumPasswordAge'));
          domainPolicy = {
            domainName: session.domainName,
            source: 'pso',
            psoName: getFirstAttr(pa, 'cn') || extractCnFromDn(psoDn),
            maxPasswordAgeDays: maxMin !== null ? Math.round(maxMin / 1440) : null,
            minPasswordAgeDays: minMin !== null ? Math.round(minMin / 1440) : null,
            minPasswordLength: getFirstAttr(pa, 'msDS-MinimumPasswordLength')
              ? Number(getFirstAttr(pa, 'msDS-MinimumPasswordLength'))
              : null,
            lockoutThreshold: getFirstAttr(pa, 'msDS-LockoutThreshold')
              ? Number(getFirstAttr(pa, 'msDS-LockoutThreshold'))
              : null,
            lockoutDurationMinutes: adDurationToMinutes(getFirstAttr(pa, 'msDS-LockoutDuration')),
            lockoutObservationWindowMinutes: adDurationToMinutes(
              getFirstAttr(pa, 'msDS-LockoutObservationWindow')
            ),
          };
        }
      } catch {}
    }

    if (domainPolicy.source === 'unknown' && session.defaultNamingContext) {
      try {
        const domRows = await ldapSearchEntries(session.client, session.defaultNamingContext, {
          scope: 'base',
          filter: '(objectClass=*)',
          attributes: [
            'maxPwdAge',
            'minPwdAge',
            'minPwdLength',
            'lockoutThreshold',
            'lockoutDuration',
            'lockOutObservationWindow',
          ],
        });
        if (domRows[0]) {
          const da = domRows[0].attrs;
          const maxMin = adDurationToMinutes(getFirstAttr(da, 'maxPwdAge'));
          const minMin = adDurationToMinutes(getFirstAttr(da, 'minPwdAge'));
          domainPolicy = {
            domainName: session.domainName,
            source: 'domain_root',
            maxPasswordAgeDays: maxMin !== null ? Math.round(maxMin / 1440) : null,
            minPasswordAgeDays: minMin !== null ? Math.round(minMin / 1440) : null,
            minPasswordLength: getFirstAttr(da, 'minPwdLength')
              ? Number(getFirstAttr(da, 'minPwdLength'))
              : null,
            lockoutThreshold: getFirstAttr(da, 'lockoutThreshold')
              ? Number(getFirstAttr(da, 'lockoutThreshold'))
              : null,
            lockoutDurationMinutes: adDurationToMinutes(getFirstAttr(da, 'lockoutDuration')),
            lockoutObservationWindowMinutes: adDurationToMinutes(
              getFirstAttr(da, 'lockOutObservationWindow')
            ),
          };
        }
      } catch {}
    }

    // Security & Lockout & Password calculations
    const uac = Number(getFirstAttr(attrs, 'userAccountControl') || 0);
    const uacComputedStr = getFirstAttr(attrs, 'msDS-User-Account-Control-Computed');
    const uacComputed = Number(uacComputedStr || 0);
    const lockoutRaw = getFirstAttr(attrs, 'lockoutTime') || '0';
    const lockoutFt = filetimeToIso(lockoutRaw);
    const primaryLockEval = evaluateLockoutState({
      uac,
      uacComputed,
      hasUacComputed: uacComputedStr !== '',
      lockoutFt,
      lockoutDurationMinutes: domainPolicy.lockoutDurationMinutes,
    });

    const pwdLastFt = filetimeToIso(getFirstAttr(attrs, 'pwdLastSet'));
    const pwdExpiryComputedFt = filetimeToIso(getFirstAttr(attrs, 'msDS-UserPasswordExpiryTimeComputed'));
    const badPwdFt = filetimeToIso(getFirstAttr(attrs, 'badPasswordTime'));
    const accExpiresFt = filetimeToIso(getFirstAttr(attrs, 'accountExpires'));
    const lastLogonDirectFt = filetimeToIso(getFirstAttr(attrs, 'lastLogon'));
    const lastLogonTsFt = filetimeToIso(getFirstAttr(attrs, 'lastLogonTimestamp'));

    const primaryIsPdc =
      Boolean(pdcHost) &&
      (session.host.toLowerCase() === pdcHost.toLowerCase() ||
        session.host.split('.')[0].toLowerCase() === pdcHost.split('.')[0].toLowerCase());

    const primaryDcEntry: HelpdeskUserDcLockoutEntry = {
      dcHost: session.host,
      isPdc: primaryIsPdc,
      reachable: true,
      accountLocked: primaryLockEval.accountLocked,
      lockoutTimeRaw: lockoutRaw,
      lockedAt: lockoutFt.iso,
      badPwdCount: Number(getFirstAttr(attrs, 'badPwdCount') || 0),
      badPasswordTime: badPwdFt.iso,
      lastLogon: lastLogonDirectFt.iso,
    };

    // Multi-DC non-replicated telemetry + Security Event Log in parallel (non-blocking)
    const otherDcs = dcCandidates
      .filter((h) => h.toLowerCase() !== session.host.toLowerCase() && h.toLowerCase() !== session.domainName.toLowerCase())
      .slice(0, 4);

    const [otherDcResults, secEventsResult, dcRightsResult] = await Promise.all([
      Promise.all(
        otherDcs.map((h) =>
          querySingleDcLockoutAttributes({
            dcHost: h,
            isPdc:
              Boolean(pdcHost) &&
              (h.toLowerCase() === pdcHost.toLowerCase() ||
                h.split('.')[0].toLowerCase() === pdcHost.split('.')[0].toLowerCase()),
            userDn,
            adminUsername,
            adminPassword,
            domainHints,
            adConfig,
            ldapProtocol: input.ldapProtocol,
          })
        )
      ),
      collectUserLockoutSecurityEvents({
        dcHosts: pdcHost ? [pdcHost, session.host] : [session.host],
        samAccountName: sam,
        adminUsername,
        adminPassword,
        winrmProtocol: input.winrmProtocol,
      }),
      collectDcUserLogonRights({
        dcHosts: pdcHost ? [pdcHost, session.host] : [session.host],
        targetSids: effectiveUserSids,
        adminUsername,
        adminPassword,
        winrmProtocol: input.winrmProtocol,
      }),
    ]);

    const dcLockoutBreakdown = [primaryDcEntry, ...otherDcResults.filter((d) => d.reachable)];
    const totalBadPwdCount = dcLockoutBreakdown.reduce((sum, d) => sum + (Number(d.badPwdCount) || 0), 0);
    const highestBadPwdDc = dcLockoutBreakdown
      .slice()
      .sort((a, b) => b.badPwdCount - a.badPwdCount)[0];
    const newestBadPwdEntry = dcLockoutBreakdown
      .filter((d) => d.badPasswordTime)
      .sort((a, b) => new Date(b.badPasswordTime!).getTime() - new Date(a.badPasswordTime!).getTime())[0];
    const newestLogonEntry = dcLockoutBreakdown
      .filter((d) => d.lastLogon)
      .sort((a, b) => new Date(b.lastLogon!).getTime() - new Date(a.lastLogon!).getTime())[0];
    const lockedDcEntry = dcLockoutBreakdown.find((d) => d.accountLocked) || dcLockoutBreakdown.find((d) => d.lockedAt);

    const effectiveLockedAt = lockoutFt.iso || lockedDcEntry?.lockedAt || null;
    const effectiveLockRaw =
      lockoutRaw !== '0' ? lockoutRaw : lockedDcEntry?.lockoutTimeRaw || '0';
    const effectiveAccountLocked =
      primaryLockEval.accountLocked || Boolean(dcLockoutBreakdown.some((d) => d.accountLocked));
    const effectiveLockEval = evaluateLockoutState({
      uac: effectiveAccountLocked ? uac | 0x10 : uac,
      uacComputed: effectiveAccountLocked ? uacComputed | 0x10 : uacComputed,
      hasUacComputed: uacComputedStr !== '',
      lockoutFt: effectiveLockedAt
        ? { iso: effectiveLockedAt, isNever: false, isZero: false }
        : lockoutFt,
      lockoutDurationMinutes: domainPolicy.lockoutDurationMinutes,
    });
    const bestLastLogonIso = newestLogonEntry?.lastLogon || lastLogonDirectFt.iso || lastLogonTsFt.iso;

    const passwordNeverExpires = (uac & 0x10000) !== 0 || pwdExpiryComputedFt.isNever;
    let passwordExpiresAt: string | null = passwordNeverExpires ? null : pwdExpiryComputedFt.iso;

    if (!passwordNeverExpires && !passwordExpiresAt && pwdLastFt.iso && domainPolicy.maxPasswordAgeDays && domainPolicy.maxPasswordAgeDays > 0) {
      passwordExpiresAt = new Date(
        new Date(pwdLastFt.iso).getTime() + domainPolicy.maxPasswordAgeDays * 86400000
      ).toISOString();
    }

    const passwordExpired =
      !passwordNeverExpires &&
      ((uac & 0x800000) !== 0 ||
        (uacCompHasExpired(uacComputed)) ||
        (passwordExpiresAt ? new Date(passwordExpiresAt).getTime() <= Date.now() : false));

    const passwordAgeDays = pwdLastFt.iso
      ? Math.max(0, Math.floor((Date.now() - new Date(pwdLastFt.iso).getTime()) / 86400000))
      : null;

    // Groups
    const groups: HelpdeskUserGroupEntry[] = getAllAttrs(attrs, 'memberOf').map((gDn) => ({
      cn: extractCnFromDn(gDn),
      dn: gDn,
    }));
    const primaryGroupId = getFirstAttr(attrs, 'primaryGroupID');
    if (primaryGroupId === '513') {
      groups.unshift({
        cn: 'Domain Users',
        dn: `CN=Domain Users,CN=Users,${session.defaultNamingContext}`,
        isPrimary: true,
      });
    } else if (primaryGroupId) {
      groups.unshift({
        cn: `Primary Group (RID ${primaryGroupId})`,
        dn: `RID:${primaryGroupId}`,
        isPrimary: true,
      });
    }

    // Enforce Global HelpDesk Exceptions & Access Policy AD scope before Exchange/returning data
    const ldapPolicyErr = await checkDomainUserExceptionPolicy({
      samAccountName: sam,
      userPrincipalName: upn,
      distinguishedName: userDn,
      domainName: session.domainName,
      groups,
      policyContext,
      actionLabel: 'Inspection',
      actionLabelFa: 'بررسی کاربر',
    });
    if (ldapPolicyErr.blocked) {
      const err: any = new Error(ldapPolicyErr.reasonEn);
      err.reasonFa = ldapPolicyErr.reasonFa;
      err.blockedByException = true;
      throw err;
    }

    // Exchange AD Mailbox & Database Inspection
    const homeMdbDn = getFirstAttr(attrs, 'homeMDB');
    const mbxGuid = parseBinaryGuid(bufs['msexchmailboxguid']?.[0]);
    const archGuid = parseBinaryGuid(bufs['msexcharchiveguid']?.[0]);
    const mailNickname = getFirstAttr(attrs, 'mailNickname');
    const useDbDefaultsRaw = getFirstAttr(attrs, 'mDBUseDefaults').toLowerCase();
    const useDatabaseQuotaDefaults =
      useDbDefaultsRaw === 'true' ? true : useDbDefaultsRaw === 'false' ? false : null;

    let dbName = homeMdbDn ? extractCnFromDn(homeMdbDn) : '';
    let discoveredExchHost = '';
    let dbWarnRaw = '';
    let dbSendRaw = '';
    let dbRecvRaw = '';

    if (homeMdbDn) {
      try {
        const dbRows = await ldapSearchEntries(session.client, homeMdbDn, {
          scope: 'base',
          filter: '(objectClass=*)',
          attributes: [
            'cn',
            'mDBStorageQuota',
            'mDBOverQuotaLimit',
            'mDBOverHardQuotaLimit',
            'msExchOwningServer',
          ],
        });
        if (dbRows[0]) {
          const dba = dbRows[0].attrs;
          dbName = getFirstAttr(dba, 'cn') || dbName;
          dbWarnRaw = getFirstAttr(dba, 'mDBStorageQuota');
          dbSendRaw = getFirstAttr(dba, 'mDBOverQuotaLimit');
          dbRecvRaw = getFirstAttr(dba, 'mDBOverHardQuotaLimit');
          const owningSrvDn = getFirstAttr(dba, 'msExchOwningServer');
          if (owningSrvDn) {
            try {
              const srvRows = await ldapSearchEntries(session.client, owningSrvDn, {
                scope: 'base',
                filter: '(objectClass=*)',
                attributes: ['dNSHostName', 'cn'],
              });
              if (srvRows[0]) {
                discoveredExchHost =
                  getFirstAttr(srvRows[0].attrs, 'dNSHostName') ||
                  getFirstAttr(srvRows[0].attrs, 'cn');
              }
            } catch {}
          }
        }
      } catch {}
    }

    if (!discoveredExchHost) {
      const homeSrvLegacy = getFirstAttr(attrs, 'msExchHomeServerName');
      const m = homeSrvLegacy.match(/\/cn=([^/]+)$/i);
      if (m?.[1]) discoveredExchHost = m[1];
    }

    const userWarnRaw = getFirstAttr(attrs, 'mDBStorageQuota');
    const userSendRaw = getFirstAttr(attrs, 'mDBOverQuotaLimit');
    const userRecvRaw = getFirstAttr(attrs, 'mDBOverHardQuotaLimit');

    const warnQ = parseExchKbQuotaToBytes(useDatabaseQuotaDefaults === false && userWarnRaw ? userWarnRaw : dbWarnRaw || userWarnRaw);
    const sendQ = parseExchKbQuotaToBytes(useDatabaseQuotaDefaults === false && userSendRaw ? userSendRaw : dbSendRaw || userSendRaw);
    const recvQ = parseExchKbQuotaToBytes(useDatabaseQuotaDefaults === false && userRecvRaw ? userRecvRaw : dbRecvRaw || userRecvRaw);
    const archQuotaQ = parseExchKbQuotaToBytes(getFirstAttr(attrs, 'msExchArchiveQuota'));

    const hasMailbox = Boolean(mbxGuid || homeMdbDn || mailNickname || explicitExch);
    const { defaultMailHost, candidates: exchangeCandidates } = buildPrioritizedExchangeCandidates({
      explicitExch,
      primaryEmail,
      emailAliases: aliases,
      upn,
      targetDomain: targetParts.domain,
      adminDomain: adminParts.domain,
      sessionDomain: session.domainName,
      adConfigDomain: adConfig?.domain,
      discoveredExchHost,
      fallbackHost: session.host,
    });
    const effectiveExchangeTarget = explicitExch || defaultMailHost || discoveredExchHost;

    let mailbox: HelpdeskUserMailboxInfo = {
      hasMailbox,
      source: hasMailbox ? 'ad_only' : 'none',
      liveStatsRetrieved: false,
      exchangeHostTried: effectiveExchangeTarget || undefined,
      databaseName: dbName,
      serverName: effectiveExchangeTarget || discoveredExchHost,
      mailNickname,
      useDatabaseQuotaDefaults,
      totalUsedBytes: null,
      deletedItemsBytes: null,
      itemCount: null,
      deletedItemCount: null,
      issueWarningQuotaBytes: warnQ.bytes,
      prohibitSendQuotaBytes: sendQ.bytes,
      prohibitSendReceiveQuotaBytes: recvQ.bytes,
      effectiveQuotaBytes: sendQ.bytes ?? recvQ.bytes ?? warnQ.bytes ?? null,
      usedPercent: null,
      isUnlimitedQuota: sendQ.unlimited || recvQ.unlimited,
      lastLogonTime: null,
      archiveEnabled: Boolean(archGuid),
      archiveGuid: archGuid || undefined,
      archiveQuotaBytes: archQuotaQ.bytes,
    };

    if (input.includeMailbox !== false && hasMailbox) {
      mailbox = await enrichLiveMailboxStats({
        mailbox,
        identity: primaryEmail || upn || sam,
        adminUsername,
        adminPassword,
        exchangeHosts: exchangeCandidates,
        winrmProtocol: input.winrmProtocol,
      });
    } else if (!hasMailbox) {
      mailbox.exchangeStatusMessage = 'No Exchange mailbox attributes (homeMDB / msExchMailboxGuid) detected on this AD account.';
      mailbox.exchangeStatusMessageFa = 'هیچ ویژگی میل‌باکس Exchange (مانند homeMDB یا msExchMailboxGuid) روی این اکانت اکتیو دایرکتوری ثبت نشده است.';
    }

    return {
      found: true,
      collectedAt: new Date().toISOString(),
      queryTarget: cleanTarget,
      connectionInfo: {
        method: session.useSsl ? 'ldaps' : 'ldap',
        domainController: session.host,
        port: session.port,
        domainName: session.domainName,
        baseDn: session.defaultNamingContext,
        pdcEmulator: pdcHost || undefined,
      },
      profile: {
        samAccountName: sam,
        userPrincipalName: upn,
        displayName: getFirstAttr(attrs, 'displayName') || getFirstAttr(attrs, 'cn') || sam,
        cn: getFirstAttr(attrs, 'cn'),
        firstName: getFirstAttr(attrs, 'givenName'),
        lastName: getFirstAttr(attrs, 'sn'),
        middleName: getFirstAttr(attrs, 'middleName'),
        initials: getFirstAttr(attrs, 'initials'),
        description: getFirstAttr(attrs, 'description'),
        jobTitle: getFirstAttr(attrs, 'title'),
        department: getFirstAttr(attrs, 'department'),
        company: getFirstAttr(attrs, 'company'),
        office: getFirstAttr(attrs, 'physicalDeliveryOfficeName'),
        division: getFirstAttr(attrs, 'division'),
        employeeId: getFirstAttr(attrs, 'employeeID'),
        employeeNumber: getFirstAttr(attrs, 'employeeNumber'),
        manager: managerResolved,
        directReports: directReportsResolved.filter(Boolean) as HelpdeskUserRelatedPerson[],
        distinguishedName: userDn,
        organizationalUnit: extractOuBreadcrumb(userDn),
        objectSid: parseBinarySid(bufs['objectsid']?.[0]),
        objectGuid: parseBinaryGuid(bufs['objectguid']?.[0]),
        whenCreated: adGeneralizedTimeToIso(getFirstAttr(attrs, 'whenCreated')),
        whenChanged: adGeneralizedTimeToIso(getFirstAttr(attrs, 'whenChanged')),
        thumbnailPhotoDataUrl: sanitizeImageBufferToDataUrl(bufs['thumbnailphoto']?.[0]),
        notes: getFirstAttr(attrs, 'info'),
      },
      contact: {
        primaryEmail,
        emailAliases: aliases,
        internalPhones,
        mobileNumbers,
        homePhones,
        faxNumber: getFirstAttr(attrs, 'facsimileTelephoneNumber'),
        webPage: getFirstAttr(attrs, 'wWWHomePage'),
      },
      security: {
        accountEnabled: (uac & 0x2) === 0,
        accountLocked: effectiveAccountLocked,
        lockoutState: effectiveLockEval.lockoutState,
        lockoutTimeRaw: effectiveLockRaw,
        lockedAt: effectiveLockedAt,
        lockoutExpiresAt: effectiveLockEval.lockoutExpiresAt,
        lockoutRemainingMinutes: effectiveLockEval.lockoutRemainingMinutes,
        badPwdCount: totalBadPwdCount,
        badPwdSourceDc:
          highestBadPwdDc && highestBadPwdDc.badPwdCount > 0 ? highestBadPwdDc.dcHost : undefined,
        badPasswordTime: newestBadPwdEntry?.badPasswordTime || badPwdFt.iso,
        passwordLastSet: pwdLastFt.iso,
        passwordAgeDays,
        passwordExpiresAt,
        passwordExpired,
        passwordNeverExpires,
        mustChangePasswordAtNextLogon: !passwordNeverExpires && pwdLastFt.isZero,
        userCannotChangePassword: (uac & 0x40) !== 0,
        accountExpiresAt: accExpiresFt.iso,
        accountNeverExpires: accExpiresFt.isNever || accExpiresFt.isZero,
        accountExpired:
          !accExpiresFt.isNever &&
          !accExpiresFt.isZero &&
          Boolean(accExpiresFt.iso && new Date(accExpiresFt.iso).getTime() <= Date.now()),
        lastLogon: bestLastLogonIso,
        logonCount: Number(getFirstAttr(attrs, 'logonCount') || 0),
        userAccountControl: uac,
        uacFlags: decodeUacFlags(uac),
        domainPolicy,
        dcLockoutBreakdown,
        lockoutEventsStatus: secEventsResult.status,
        lockoutEventsNote: secEventsResult.note,
        lockoutEventsNoteFa: secEventsResult.noteFa,
        lockoutEvents: secEventsResult.events,
      },
      groups,
      mailbox,
      logonAndProfile: buildLogonAndProfileInfo({
        userWorkstationsRaw: getFirstAttr(attrs, 'userWorkstations'),
        profilePath: getFirstAttr(attrs, 'profilePath'),
        scriptPath: getFirstAttr(attrs, 'scriptPath'),
        homeDirectory: getFirstAttr(attrs, 'homeDirectory'),
        homeDrive: getFirstAttr(attrs, 'homeDrive'),
        logonHoursBuf: bufs['logonhours']?.[0] || null,
        dcInteractiveRights: dcRightsResult,
      }),
    };
  } finally {
    session.close();
  }
}

function uacCompHasExpired(uacComp: number): boolean {
  return (uacComp & 0x800000) !== 0;
}

export async function inspectTargetDomainMailbox(
  input: HelpdeskUserMailboxInput,
  policyContext?: HelpdeskAdPolicyContext
): Promise<HelpdeskUserMailboxInfo> {
  const full = await inspectTargetDomainUser({ ...input, includeMailbox: true }, policyContext);
  return full.mailbox;
}

// ============================================================================
// 7. HELPDESK USER EXCEPTION GUARD & ACCOUNT UNLOCK
// ============================================================================

function normalizeDomainCmp(d: string): string {
  const clean = String(d || '').trim().toLowerCase();
  return clean.includes('.') ? clean.split('.')[0] : clean;
}

function buildUserIdentityCandidates(params: {
  samAccountName: string;
  userPrincipalName?: string;
  distinguishedName?: string;
  domainName?: string;
}): string[] {
  const sam = String(params.samAccountName || '').trim();
  const upn = String(params.userPrincipalName || '').trim();
  const dn = String(params.distinguishedName || '').trim();
  const domFull = String(params.domainName || '').trim();
  const domShort = normalizeDomainCmp(domFull);
  return dedupeStrings([
    sam,
    upn,
    dn,
    domShort && sam ? `${domShort}\\${sam}` : '',
    domFull && sam ? `${domFull}\\${sam}` : '',
  ]);
}

async function checkDomainUserPreConnectPolicy(
  rawTarget: string,
  targetDomain: string,
  policyContext?: HelpdeskAdPolicyContext
): Promise<{ blocked: boolean; reasonEn?: string; reasonFa?: string }> {
  const pol = policyContext && !policyContext.hasFullAccess ? policyContext.policy : null;
  if (
    pol &&
    pol.targetHelpdeskAdScope === 'selected' &&
    (pol.allowedHelpdeskAdUsers || []).length === 0 &&
    (pol.allowedHelpdeskAdGroups || []).length === 0
  ) {
    return {
      blocked: true,
      reasonEn:
        'Access blocked by RBAC HelpDesk Policy: AD scope is set to Selected Only, but no AD groups or users are permitted.',
      reasonFa:
        'دسترسی توسط پالیسی هلپ‌دسک مسدود شد: محدوده اکتیو دایرکتوری روی «فقط موارد مجاز» است اما هیچ گروه یا کاربری مجاز تعریف نشده است.',
    };
  }

  const allRules = await listHelpdeskExceptionsFromDb().catch(() => [] as HelpdeskExceptionRecord[]);
  const enabled = allRules.filter((r) => r && r.enabled && r.ruleType === 'ad_user');
  const clean = String(rawTarget || '').trim();
  const parts = splitUsernameParts(clean);
  const domShort = normalizeDomainCmp(targetDomain || parts.domain);

  for (const rule of enabled) {
    const rv = String(rule.targetValue || '').trim().toLowerCase();
    const rvParts = splitUsernameParts(rv);
    const rDom = normalizeDomainCmp(rule.domainName || rvParts.domain);
    if (rDom && domShort && rDom !== domShort) continue;
    if (rvParts.sam === parts.sam.toLowerCase() || rv === clean.toLowerCase()) {
      return {
        blocked: true,
        reasonEn: `Blocked by HelpDesk exception policy: user "${clean}" matches excluded AD user rule "${rule.targetValue}".`,
        reasonFa: `دسترسی توسط قانون استثنائات هلپ‌دسک مسدود شد: کاربر «${clean}» مشمول قانون مسدودسازی «${rule.targetValue}» است.`,
      };
    }
  }

  if (pol && (pol.blockedHelpdeskAdUsers || []).length > 0) {
    const matched = matchUserPatternList(
      pol.blockedHelpdeskAdUsers || [],
      buildUserIdentityCandidates({ samAccountName: parts.sam, userPrincipalName: clean, domainName: targetDomain }),
      targetDomain,
      false
    );
    if (matched) {
      return {
        blocked: true,
        reasonEn: `Blocked by RBAC HelpDesk Policy: user "${clean}" matches restricted AD user rule "${matched.pattern}".`,
        reasonFa: `دسترسی توسط پالیسی هلپ‌دسک مسدود شد: کاربر «${clean}» در لیست مسدودشده «${matched.pattern}» قرار دارد.`,
      };
    }
  }

  return { blocked: false };
}

async function filterDomainUserSearchHits(
  entries: Array<{ hit: HelpdeskUserSearchHit; groups: HelpdeskUserGroupEntry[] }>,
  domainName: string,
  policyContext?: HelpdeskAdPolicyContext
): Promise<HelpdeskUserSearchHit[]> {
  const allRules = await listHelpdeskExceptionsFromDb().catch(() => [] as HelpdeskExceptionRecord[]);
  const enabledUserRules = allRules.filter((r) => r && r.enabled && r.ruleType === 'ad_user');
  const enabledGroupRules = allRules.filter((r) => r && r.enabled && r.ruleType === 'ad_group');
  const domShort = normalizeDomainCmp(domainName);
  const pol = policyContext && !policyContext.hasFullAccess ? policyContext.policy : null;
  const blockedUsers = pol?.blockedHelpdeskAdUsers || [];
  const blockedGroups = pol?.blockedHelpdeskAdGroups || [];
  const adSelectedOnly = pol?.targetHelpdeskAdScope === 'selected';
  const allowedUsers = pol?.allowedHelpdeskAdUsers || [];
  const allowedGroups = pol?.allowedHelpdeskAdGroups || [];

  const result: HelpdeskUserSearchHit[] = [];
  for (const item of entries) {
    const h = item.hit;
    const samL = h.samAccountName.toLowerCase();
    const upnL = (h.userPrincipalName || '').toLowerCase();

    // Global AD user block
    let blocked = enabledUserRules.some((rule) => {
      const rv = String(rule.targetValue || '').trim().toLowerCase();
      const rvParts = splitUsernameParts(rv);
      const rDom = normalizeDomainCmp(rule.domainName || rvParts.domain);
      if (rDom && domShort && rDom !== domShort) return false;
      return rvParts.sam === samL || (upnL && rv === upnL) || rv === samL;
    });
    if (blocked) continue;

    // Global AD group block
    blocked = enabledGroupRules.some((rule) => {
      const rv = String(rule.targetValue || '').trim().toLowerCase();
      const rCn = rv.includes('cn=') ? extractCnFromDn(rv).toLowerCase() : rv.includes('\\') ? rv.split('\\').pop()! : rv;
      const rDom = normalizeDomainCmp(rule.domainName);
      if (rDom && domShort && rDom !== domShort) return false;
      return item.groups.some((g) => g.cn.toLowerCase() === rCn || g.dn.toLowerCase() === rv);
    });
    if (blocked) continue;

    const candidates = buildUserIdentityCandidates({
      samAccountName: h.samAccountName,
      userPrincipalName: h.userPrincipalName,
      distinguishedName: h.distinguishedName,
      domainName,
    });
    const groupEntries = item.groups.map((g) => ({ cn: g.cn, sam: g.cn, dn: g.dn }));

    if (blockedUsers.length > 0 && matchUserPatternList(blockedUsers, candidates, domainName, false)) {
      continue;
    }
    if (blockedGroups.length > 0 && matchAdGroupPatternList(blockedGroups, groupEntries, domainName)) {
      continue;
    }

    if (adSelectedOnly) {
      const userAllowed = allowedUsers.length > 0 && Boolean(matchUserPatternList(allowedUsers, candidates, domainName, false));
      const groupAllowed = allowedGroups.length > 0 && Boolean(matchAdGroupPatternList(allowedGroups, groupEntries, domainName));
      if (!userAllowed && !groupAllowed) continue;
    }

    result.push(h);
  }
  return result;
}

async function checkDomainUserExceptionPolicy(params: {
  samAccountName: string;
  userPrincipalName: string;
  distinguishedName?: string;
  domainName: string;
  groups: HelpdeskUserGroupEntry[];
  policyContext?: HelpdeskAdPolicyContext;
  actionLabel?: string;
  actionLabelFa?: string;
}): Promise<{ blocked: boolean; reasonEn?: string; reasonFa?: string; rule?: HelpdeskExceptionRecord }> {
  const allRules = await listHelpdeskExceptionsFromDb().catch(() => [] as HelpdeskExceptionRecord[]);
  const enabled = allRules.filter((r) => r && r.enabled);
  const samLower = params.samAccountName.toLowerCase();
  const upnLower = params.userPrincipalName.toLowerCase();
  const domShort = normalizeDomainCmp(params.domainName);
  const actEn = params.actionLabel || 'Unlock';
  const actFa = params.actionLabelFa || 'عملیات';

  for (const rule of enabled) {
    if (rule.ruleType === 'ad_user') {
      const rv = String(rule.targetValue || '').trim().toLowerCase();
      const rvParts = splitUsernameParts(rv);
      const rDom = normalizeDomainCmp(rule.domainName || rvParts.domain);
      if (rDom && domShort && rDom !== domShort) continue;
      if (rvParts.sam === samLower || (upnLower && rv === upnLower) || rv === samLower) {
        return {
          blocked: true,
          rule,
          reasonEn: `${actEn} blocked by HelpDesk exception policy: user "${params.samAccountName}" matches excluded AD user rule "${rule.targetValue}".`,
          reasonFa: `${actFa} توسط قانون استثنائات هلپ‌دسک مسدود شد: کاربر «${params.samAccountName}» مشمول قانون مسدودسازی «${rule.targetValue}» است.`,
        };
      }
    } else if (rule.ruleType === 'ad_group') {
      const rv = String(rule.targetValue || '').trim().toLowerCase();
      const rCn = rv.includes('cn=') ? extractCnFromDn(rv).toLowerCase() : rv.includes('\\') ? rv.split('\\').pop()! : rv;
      const rDom = normalizeDomainCmp(rule.domainName);
      if (rDom && domShort && rDom !== domShort) continue;
      const matchedGroup = params.groups.find(
        (g) => g.cn.toLowerCase() === rCn || g.dn.toLowerCase() === rv
      );
      if (matchedGroup) {
        return {
          blocked: true,
          rule,
          reasonEn: `${actEn} blocked by HelpDesk exception policy: user belongs to excluded AD group "${matchedGroup.cn}".`,
          reasonFa: `${actFa} توسط قانون استثنائات هلپ‌دسک مسدود شد: کاربر عضو گروه مسدودشده «${matchedGroup.cn}» است.`,
        };
      }
    }
  }

  const pol = params.policyContext && !params.policyContext.hasFullAccess ? params.policyContext.policy : null;
  if (pol) {
    const candidates = buildUserIdentityCandidates({
      samAccountName: params.samAccountName,
      userPrincipalName: params.userPrincipalName,
      distinguishedName: params.distinguishedName,
      domainName: params.domainName,
    });
    const groupEntries = params.groups.map((g) => ({ cn: g.cn, sam: g.cn, dn: g.dn }));

    if ((pol.blockedHelpdeskAdUsers || []).length > 0) {
      const m = matchUserPatternList(pol.blockedHelpdeskAdUsers || [], candidates, params.domainName, false);
      if (m) {
        return {
          blocked: true,
          reasonEn: `${actEn} blocked by RBAC HelpDesk Policy: user "${params.samAccountName}" matches restricted AD user rule "${m.pattern}".`,
          reasonFa: `${actFa} توسط پالیسی هلپ‌دسک مسدود شد: کاربر «${params.samAccountName}» مشمول قانون مسدودسازی «${m.pattern}» است.`,
        };
      }
    }

    if ((pol.blockedHelpdeskAdGroups || []).length > 0) {
      const m = matchAdGroupPatternList(pol.blockedHelpdeskAdGroups || [], groupEntries, params.domainName);
      if (m) {
        return {
          blocked: true,
          reasonEn: `${actEn} blocked by RBAC HelpDesk Policy: user belongs to restricted AD group "${m.matchedGroup}" (rule: "${m.pattern}").`,
          reasonFa: `${actFa} توسط پالیسی هلپ‌دسک مسدود شد: کاربر عضو گروه مسدودشده «${m.matchedGroup}» (قانون «${m.pattern}») است.`,
        };
      }
    }

    if (pol.targetHelpdeskAdScope === 'selected') {
      const allowedUsers = pol.allowedHelpdeskAdUsers || [];
      const allowedGroups = pol.allowedHelpdeskAdGroups || [];
      const userAllowed =
        allowedUsers.length > 0 &&
        Boolean(matchUserPatternList(allowedUsers, candidates, params.domainName, false));
      const groupAllowed =
        allowedGroups.length > 0 &&
        Boolean(matchAdGroupPatternList(allowedGroups, groupEntries, params.domainName));
      if (!userAllowed && !groupAllowed) {
        return {
          blocked: true,
          reasonEn: `${actEn} blocked by RBAC HelpDesk Policy: user "${params.samAccountName}" is outside your policy's permitted AD users/groups scope.`,
          reasonFa: `${actFa} توسط پالیسی هلپ‌دسک مسدود شد: کاربر «${params.samAccountName}» در محدوده کاربران و گروه‌های مجاز پالیسی شما قرار ندارد.`,
        };
      }
    }
  }

  return { blocked: false };
}

export async function unlockTargetDomainUser(
  input: HelpdeskUserUnlockInput,
  policyContext?: HelpdeskAdPolicyContext
): Promise<HelpdeskUserUnlockResult> {
  const inspected = await inspectTargetDomainUser({ ...input, includeMailbox: false }, policyContext);
  const exc = await checkDomainUserExceptionPolicy({
    samAccountName: inspected.profile.samAccountName,
    userPrincipalName: inspected.profile.userPrincipalName,
    distinguishedName: inspected.profile.distinguishedName,
    domainName: inspected.connectionInfo.domainName,
    groups: inspected.groups,
    policyContext,
    actionLabel: 'Unlock',
    actionLabelFa: 'رفع قفل',
  });
  if (exc.blocked) {
    const err: any = new Error(exc.reasonEn);
    err.reasonFa = exc.reasonFa;
    err.blockedByException = true;
    throw err;
  }

  const wasLocked = inspected.security.accountLocked;
  const userDn = inspected.profile.distinguishedName;
  const dcHost = inspected.connectionInfo.domainController;
  const adConfig = await getActiveDirectoryConfig().catch(() => null);

  let ldapError = '';
  if (inspected.connectionInfo.method === 'ldaps' || inspected.connectionInfo.method === 'ldap') {
    const { session } = await openAuthenticatedLdapSession({
      input: {
        ...input,
        domainController: dcHost,
        ldapProtocol: inspected.connectionInfo.method === 'ldaps' ? 'ldaps' : 'auto',
      },
      adConfig,
      dcCandidates: [dcHost],
      domainHints: [inspected.connectionInfo.domainName],
    });

    if (session) {
      try {
        await new Promise<void>((resolve, reject) => {
          const ChangeCtor: any = (ldap as any).Change;
          const change = new ChangeCtor({
            operation: 'replace',
            modification: { lockoutTime: '0' },
          });
          session.client.modify(userDn, change, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        // Re-verify lockout state authentically
        const verifyRows = await ldapSearchEntries(session.client, userDn, {
          scope: 'base',
          filter: '(objectClass=*)',
          attributes: ['lockoutTime', 'msDS-User-Account-Control-Computed'],
        });
        const postLockRaw = verifyRows[0] ? getFirstAttr(verifyRows[0].attrs, 'lockoutTime') || '0' : '0';
        const postComp = verifyRows[0]
          ? Number(getFirstAttr(verifyRows[0].attrs, 'msDS-User-Account-Control-Computed') || 0)
          : 0;
        const stillLocked = (postComp & 0x10) !== 0 || (postLockRaw !== '0' && postLockRaw !== '');

        return {
          unlocked: !stillLocked,
          wasLocked,
          stillLockedAfter: stillLocked,
          samAccountName: inspected.profile.samAccountName,
          displayName: inspected.profile.displayName,
          distinguishedName: userDn,
          domainController: session.host,
          methodUsed: session.useSsl ? 'ldaps_modify' : 'ldap_modify',
          message: stillLocked
            ? `Modify succeeded on ${session.host}, but AD still reports account as locked.`
            : wasLocked
            ? `Account ${inspected.profile.samAccountName} has been unlocked on ${session.host}.`
            : `Lockout timer cleared for ${inspected.profile.samAccountName} on ${session.host}.`,
          messageFa: stillLocked
            ? `تغییر در دامین کنترلر ${session.host} اعمال شد، اما اکانت همچنان در وضعیت قفل قرار دارد.`
            : wasLocked
            ? `اکانت ${inspected.profile.samAccountName} با موفقیت روی دامین کنترلر ${session.host} از حالت قفل (Unlock) خارج شد.`
            : `وضعیت قفل اکانت ${inspected.profile.samAccountName} روی دامین کنترلر ${session.host} بازنشانی شد.`,
          unlockedAt: new Date().toISOString(),
        };
      } catch (err: any) {
        ldapError = err?.message || String(err);
      } finally {
        session.close();
      }
    }
  }

  // Fallback to WinRM/SMB ADSI unlock on Domain Controller
  const safeDn = userDn.replace(/'/g, "''");
  const safeSam = inspected.profile.samAccountName.replace(/'/g, "''");
  const psUnlock = `
$ErrorActionPreference = 'Stop'
$dn = '${safeDn}'
$de = [ADSI]"LDAP://$dn"
$de.Properties['lockoutTime'].Value = 0
$de.CommitChanges()
$de.RefreshCache(@('lockoutTime','msDS-User-Account-Control-Computed'))
$lt = if ($de.Properties['lockoutTime'].Count -gt 0) { [string]$de.Properties['lockoutTime'][0] } else { '0' }
$comp = if ($de.Properties['msDS-User-Account-Control-Computed'].Count -gt 0) { [int]$de.Properties['msDS-User-Account-Control-Computed'][0] } else { 0 }
[PSCustomObject]@{
  ok = $true
  sam = '${safeSam}'
  lockoutTime = $lt
  uacComputed = $comp
} | ConvertTo-Json -Compress
`;

  try {
    const execRes = await executeHelpdeskPowerShell(
      {
        targetIp: dcHost,
        protocol: input.winrmProtocol || 'auto',
        username: input.adminUsername,
        password: input.adminPassword,
        timeoutMs: 22000,
      },
      psUnlock
    );
    const trimmed = execRes.stdout.trim();
    const sIdx = trimmed.indexOf('{');
    const eIdx = trimmed.lastIndexOf('}');
    const parsed = sIdx !== -1 && eIdx >= sIdx ? JSON.parse(trimmed.slice(sIdx, eIdx + 1)) : {};
    const stillLocked = (Number(parsed.uacComputed || 0) & 0x10) !== 0;

    return {
      unlocked: !stillLocked,
      wasLocked,
      stillLockedAfter: stillLocked,
      samAccountName: inspected.profile.samAccountName,
      displayName: inspected.profile.displayName,
      distinguishedName: userDn,
      domainController: dcHost,
      methodUsed: 'winrm_adsi',
      message: stillLocked
        ? `Unlock command ran on ${dcHost}, but account still reports locked.`
        : `Account ${inspected.profile.samAccountName} has been unlocked on ${dcHost}.`,
      messageFa: stillLocked
        ? `دستور رفع قفل روی ${dcHost} اجرا شد اما اکانت هنوز قفل است.`
        : `اکانت ${inspected.profile.samAccountName} با موفقیت روی ${dcHost} از قفل خارج (Unlock) شد.`,
      unlockedAt: new Date().toISOString(),
    };
  } catch (winrmErr: any) {
    throw new Error(
      `Failed to unlock account ${inspected.profile.samAccountName}: ${[
        ldapError ? `LDAP: ${ldapError}` : '',
        `WinRM/ADSI: ${winrmErr?.message || winrmErr}`,
      ]
        .filter(Boolean)
        .join(' | ')}`
    );
  }
}
