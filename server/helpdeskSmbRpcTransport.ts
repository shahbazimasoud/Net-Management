import crypto from 'crypto';
import net from 'net';

// ============================================================================
// 1. SHARED NTLMv2 + SPNEGO (RFC 4178 / MS-NLMP) CRYPTO ENGINE
// ============================================================================

export function md4(message: Buffer): Buffer {
  const bitLen = BigInt(message.length) * 8n;
  const padLen = ((55 - (message.length % 64)) + 64) % 64;
  const padded = Buffer.alloc(message.length + 1 + padLen + 8);
  message.copy(padded, 0);
  padded[message.length] = 0x80;
  padded.writeBigUInt64LE(bitLen, padded.length - 8);

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  const rotl = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) >>> 0;
  const F = (x: number, y: number, z: number) => ((x & y) | (~x & z)) >>> 0;
  const G = (x: number, y: number, z: number) => ((x & y) | (x & z) | (y & z)) >>> 0;
  const H = (x: number, y: number, z: number) => (x ^ y ^ z) >>> 0;

  const x = new Uint32Array(16);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) x[i] = padded.readUInt32LE(offset + i * 4);
    const aa = a;
    const bb = b;
    const cc = c;
    const dd = d;

    const r1 = [
      [0, 3], [1, 7], [2, 11], [3, 19],
      [4, 3], [5, 7], [6, 11], [7, 19],
      [8, 3], [9, 7], [10, 11], [11, 19],
      [12, 3], [13, 7], [14, 11], [15, 19],
    ];
    for (let i = 0; i < 16; i++) {
      const [k, s] = r1[i];
      if (i % 4 === 0) a = rotl((a + F(b, c, d) + x[k]) >>> 0, s);
      else if (i % 4 === 1) d = rotl((d + F(a, b, c) + x[k]) >>> 0, s);
      else if (i % 4 === 2) c = rotl((c + F(d, a, b) + x[k]) >>> 0, s);
      else b = rotl((b + F(c, d, a) + x[k]) >>> 0, s);
    }

    const r2 = [
      [0, 3], [4, 5], [8, 9], [12, 13],
      [1, 3], [5, 5], [9, 9], [13, 13],
      [2, 3], [6, 5], [10, 9], [14, 13],
      [3, 3], [7, 5], [11, 9], [15, 13],
    ];
    for (let i = 0; i < 16; i++) {
      const [k, s] = r2[i];
      if (i % 4 === 0) a = rotl((a + G(b, c, d) + x[k] + 0x5a827999) >>> 0, s);
      else if (i % 4 === 1) d = rotl((d + G(a, b, c) + x[k] + 0x5a827999) >>> 0, s);
      else if (i % 4 === 2) c = rotl((c + G(d, a, b) + x[k] + 0x5a827999) >>> 0, s);
      else b = rotl((b + G(c, d, a) + x[k] + 0x5a827999) >>> 0, s);
    }

    const r3 = [
      [0, 3], [8, 9], [4, 11], [12, 15],
      [2, 3], [10, 9], [6, 11], [14, 15],
      [1, 3], [9, 9], [5, 11], [13, 15],
      [3, 3], [11, 9], [7, 11], [15, 15],
    ];
    for (let i = 0; i < 16; i++) {
      const [k, s] = r3[i];
      if (i % 4 === 0) a = rotl((a + H(b, c, d) + x[k] + 0x6ed9eba1) >>> 0, s);
      else if (i % 4 === 1) d = rotl((d + H(a, b, c) + x[k] + 0x6ed9eba1) >>> 0, s);
      else if (i % 4 === 2) c = rotl((c + H(d, a, b) + x[k] + 0x6ed9eba1) >>> 0, s);
      else b = rotl((b + H(c, d, a) + x[k] + 0x6ed9eba1) >>> 0, s);
    }

    a = (a + aa) >>> 0;
    b = (b + bb) >>> 0;
    c = (c + cc) >>> 0;
    d = (d + dd) >>> 0;
  }

  const out = Buffer.alloc(16);
  out.writeUInt32LE(a, 0);
  out.writeUInt32LE(b, 4);
  out.writeUInt32LE(c, 8);
  out.writeUInt32LE(d, 12);
  return out;
}

export function hmacMd5(key: Buffer, data: Buffer): Buffer {
  return crypto.createHmac('md5', key).update(data).digest();
}

/**
 * Parses Windows credentials according to MS-NLMP §3.3.2:
 * - DOMAIN\user      -> { domain: 'DOMAIN', user: 'user', isUpn: false, explicitLocal: false }
 * - .\user           -> { domain: '', user: 'user', isUpn: false, explicitLocal: true }
 * - user@domain.tld  -> { domain: '', user: 'user@domain.tld', isUpn: true, explicitLocal: false }
 *   (Per MS-NLMP, UPN logins MUST keep DomainName empty and place full UPN in UserName!)
 * - user             -> { domain: '', user: 'user', isUpn: false, explicitLocal: false }
 */
export function parseNtlmCredentials(rawUsername: string): {
  domain: string;
  user: string;
  isUpn: boolean;
  explicitLocal: boolean;
} {
  const trimmed = rawUsername.trim();
  if (trimmed.includes('\\')) {
    const idx = trimmed.indexOf('\\');
    const dom = trimmed.slice(0, idx).trim();
    const usr = trimmed.slice(idx + 1).trim();
    if (dom === '.') {
      return { domain: '', user: usr, isUpn: false, explicitLocal: true };
    }
    return { domain: dom, user: usr, isUpn: false, explicitLocal: false };
  }
  if (trimmed.includes('@')) {
    // MS-NLMP UPN format: UserName = user@domain.local, DomainName = ""
    return { domain: '', user: trimmed, isUpn: true, explicitLocal: false };
  }
  return { domain: '', user: trimmed, isUpn: false, explicitLocal: false };
}

// NTLM Negotiate Flags
const NTLMSSP_NEGOTIATE_UNICODE = 0x00000001;
const NTLMSSP_REQUEST_TARGET = 0x00000004;
const NTLMSSP_NEGOTIATE_SIGN = 0x00000010;
const NTLMSSP_NEGOTIATE_NTLM = 0x00000200;
const NTLMSSP_NEGOTIATE_ALWAYS_SIGN = 0x00008000;
const NTLMSSP_NEGOTIATE_EXTENDED_SESSIONSECURITY = 0x00080000;
const NTLMSSP_NEGOTIATE_128 = 0x20000000;
const NTLMSSP_NEGOTIATE_56 = 0x80000000;

export const DEFAULT_NTLM_FLAGS =
  (NTLMSSP_NEGOTIATE_UNICODE |
    NTLMSSP_REQUEST_TARGET |
    NTLMSSP_NEGOTIATE_SIGN |
    NTLMSSP_NEGOTIATE_NTLM |
    NTLMSSP_NEGOTIATE_ALWAYS_SIGN |
    NTLMSSP_NEGOTIATE_EXTENDED_SESSIONSECURITY |
    NTLMSSP_NEGOTIATE_128 |
    NTLMSSP_NEGOTIATE_56) >>> 0;

export function createNtlmType1Buffer(flags = DEFAULT_NTLM_FLAGS): Buffer {
  const buf = Buffer.alloc(32);
  buf.write('NTLMSSP\0', 0, 'ascii');
  buf.writeUInt32LE(1, 8); // Type 1 (NEGOTIATE_MESSAGE)
  buf.writeUInt32LE(flags >>> 0, 12);
  return buf;
}

// Minimal DER/ASN.1 encoder for SPNEGO (RFC 4178)
function asn1Length(len: number): Buffer {
  if (len < 0x80) return Buffer.from([len]);
  if (len < 0x100) return Buffer.from([0x81, len]);
  return Buffer.from([0x82, (len >> 8) & 0xff, len & 0xff]);
}

function asn1Wrap(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), asn1Length(content.length), content]);
}

// OID 1.3.6.1.5.5.2 (SPNEGO)
const OID_SPNEGO = Buffer.from([0x06, 0x06, 0x2b, 0x06, 0x01, 0x05, 0x05, 0x02]);
// OID 1.3.6.1.4.1.311.2.2.10 (NTLMSSP)
const OID_NTLMSSP = Buffer.from([0x06, 0x0a, 0x2b, 0x06, 0x01, 0x04, 0x01, 0x82, 0x37, 0x02, 0x02, 0x0a]);

export function wrapSpnegoNegTokenInit(ntlmType1: Buffer): Buffer {
  const mechTypes = asn1Wrap(0xa0, asn1Wrap(0x30, OID_NTLMSSP));
  const mechToken = asn1Wrap(0xa2, asn1Wrap(0x04, ntlmType1));
  const negTokenInit = asn1Wrap(0xa0, asn1Wrap(0x30, Buffer.concat([mechTypes, mechToken])));
  return asn1Wrap(0x60, Buffer.concat([OID_SPNEGO, negTokenInit]));
}

export function wrapSpnegoNegTokenResp(ntlmType3: Buffer): Buffer {
  const responseToken = asn1Wrap(0xa2, asn1Wrap(0x04, ntlmType3));
  return asn1Wrap(0xa1, asn1Wrap(0x30, responseToken));
}

export function unwrapSpnegoNtlmToken(raw: Buffer): Buffer {
  const sig = Buffer.from('NTLMSSP\0', 'ascii');
  const idx = raw.indexOf(sig);
  if (idx < 0) {
    throw new Error('Endpoint did not return a valid NTLMSSP challenge token.');
  }
  return raw.subarray(idx);
}

interface ParsedTargetInfo {
  nbDomainName: string;
  nbComputerName: string;
  dnsDomainName: string;
  timestamp: Buffer | null;
}

function parseAvPairs(targetInfo: Buffer): ParsedTargetInfo {
  const out: ParsedTargetInfo = {
    nbDomainName: '',
    nbComputerName: '',
    dnsDomainName: '',
    timestamp: null,
  };
  let offset = 0;
  while (offset + 4 <= targetInfo.length) {
    const avId = targetInfo.readUInt16LE(offset);
    const avLen = targetInfo.readUInt16LE(offset + 2);
    offset += 4;
    if (avId === 0) break; // MsvAvEOL
    if (offset + avLen > targetInfo.length) break;
    const val = targetInfo.subarray(offset, offset + avLen);
    if (avId === 0x0001) out.nbComputerName = val.toString('utf16le');
    else if (avId === 0x0002) out.nbDomainName = val.toString('utf16le');
    else if (avId === 0x0004) out.dnsDomainName = val.toString('utf16le');
    else if (avId === 0x0007 && avLen === 8) out.timestamp = Buffer.from(val);
    offset += avLen;
  }
  return out;
}

export interface NtlmType3Result {
  type3Buf: Buffer;
  sessionKey: Buffer;
  serverNbDomain: string;
  serverDnsDomain: string;
  negotiatedFlags: number;
}

export function createNtlmType3Result(
  type2RawOrSpnego: Buffer,
  rawUsername: string,
  password: string,
  options?: {
    workstation?: string;
    domainOverride?: string;
    requestFlags?: number;
  }
): NtlmType3Result {
  const type2 = unwrapSpnegoNtlmToken(type2RawOrSpnego);
  if (type2.length < 32 || type2.readUInt32LE(8) !== 2) {
    throw new Error('Invalid NTLM Type 2 challenge received from Windows endpoint.');
  }

  const serverFlags = type2.readUInt32LE(20);
  const serverChallenge = type2.subarray(24, 32);

  let targetInfo = Buffer.alloc(0);
  if (type2.length >= 48) {
    const targetInfoLen = type2.readUInt16LE(40);
    const targetInfoOffset = type2.readUInt32LE(44);
    if (targetInfoLen > 0 && targetInfoOffset + targetInfoLen <= type2.length) {
      targetInfo = type2.subarray(targetInfoOffset, targetInfoOffset + targetInfoLen);
    }
  }

  const parsedTarget = parseAvPairs(targetInfo);
  const parsedCred = parseNtlmCredentials(rawUsername);
  const effectiveDomain =
    options?.domainOverride !== undefined ? options.domainOverride : parsedCred.domain;
  const effectiveUser = parsedCred.user;
  const workstation = options?.workstation || 'NETTOPO-HD';

  // MS-NLMP §3.3.2: NTOWFv2 = HMAC_MD5(MD4(UTF16LE(password)), UTF16LE(UPPER(user) + domain))
  const ntHash = md4(Buffer.from(password, 'utf16le'));
  const ntlmv2Hash = hmacMd5(
    ntHash,
    Buffer.from(`${effectiveUser.toUpperCase()}${effectiveDomain}`, 'utf16le')
  );

  // Prefer server's MsvAvTimestamp from TargetInfo to avoid Active Directory clock-skew rejections
  let timestampBuf: Buffer;
  if (parsedTarget.timestamp) {
    timestampBuf = parsedTarget.timestamp;
  } else {
    const filetime = (BigInt(Date.now()) + 11644473600000n) * 10000n;
    timestampBuf = Buffer.alloc(8);
    timestampBuf.writeBigUInt64LE(filetime, 0);
  }

  const clientChallenge = crypto.randomBytes(8);
  const blobHeader = Buffer.alloc(28);
  blobHeader.writeUInt32LE(0x00000101, 0); // RespType=1, HiRespType=1
  blobHeader.writeUInt32LE(0, 4); // Reserved
  timestampBuf.copy(blobHeader, 8);
  clientChallenge.copy(blobHeader, 16);
  blobHeader.writeUInt32LE(0, 24);

  const blob = Buffer.concat([blobHeader, targetInfo, Buffer.alloc(4)]);
  const ntProofStr = hmacMd5(ntlmv2Hash, Buffer.concat([serverChallenge, blob]));
  const ntResponse = Buffer.concat([ntProofStr, blob]);

  // SessionBaseKey = HMAC_MD5(NTOWFv2, NTProofStr)
  // Without NTLMSSP_NEGOTIATE_KEY_EXCH, ExportedSessionKey === SessionBaseKey
  const sessionKey = hmacMd5(ntlmv2Hash, ntProofStr);

  // When MsvAvTimestamp is present in TargetInfo, MS-NLMP sets LMv2 response to 24 zero bytes
  const lmResponse = parsedTarget.timestamp
    ? Buffer.alloc(24)
    : Buffer.concat([
        hmacMd5(ntlmv2Hash, Buffer.concat([serverChallenge, clientChallenge])),
        clientChallenge,
      ]);

  const domainBuf = Buffer.from(effectiveDomain, 'utf16le');
  const userBuf = Buffer.from(effectiveUser, 'utf16le');
  const workstationBuf = Buffer.from(workstation, 'utf16le');

  const baseReqFlags = options?.requestFlags !== undefined ? options.requestFlags : DEFAULT_NTLM_FLAGS;
  // Intersect requested flags with server flags while guaranteeing Unicode + NTLM + Extended Security
  const negotiatedFlags =
    ((baseReqFlags & (serverFlags | NTLMSSP_NEGOTIATE_UNICODE | NTLMSSP_NEGOTIATE_NTLM)) |
      NTLMSSP_NEGOTIATE_UNICODE |
      NTLMSSP_NEGOTIATE_NTLM |
      NTLMSSP_NEGOTIATE_EXTENDED_SESSIONSECURITY) >>> 0;

  const headerLen = 64;
  let offset = headerLen;
  const lmOffset = offset;
  offset += lmResponse.length;
  const ntOffset = offset;
  offset += ntResponse.length;
  const domOffset = offset;
  offset += domainBuf.length;
  const userOffset = offset;
  offset += userBuf.length;
  const wsOffset = offset;
  offset += workstationBuf.length;

  const msg = Buffer.alloc(offset);
  msg.write('NTLMSSP\0', 0, 'ascii');
  msg.writeUInt32LE(3, 8); // Type 3 (AUTHENTICATE_MESSAGE)

  msg.writeUInt16LE(lmResponse.length, 12);
  msg.writeUInt16LE(lmResponse.length, 14);
  msg.writeUInt32LE(lmOffset, 16);

  msg.writeUInt16LE(ntResponse.length, 20);
  msg.writeUInt16LE(ntResponse.length, 22);
  msg.writeUInt32LE(ntOffset, 24);

  msg.writeUInt16LE(domainBuf.length, 28);
  msg.writeUInt16LE(domainBuf.length, 30);
  msg.writeUInt32LE(domOffset, 32);

  msg.writeUInt16LE(userBuf.length, 36);
  msg.writeUInt16LE(userBuf.length, 38);
  msg.writeUInt32LE(userOffset, 40);

  msg.writeUInt16LE(workstationBuf.length, 44);
  msg.writeUInt16LE(workstationBuf.length, 46);
  msg.writeUInt32LE(wsOffset, 48);

  // EncryptedRandomSessionKey (empty — using SessionBaseKey directly)
  msg.writeUInt16LE(0, 52);
  msg.writeUInt16LE(0, 54);
  msg.writeUInt32LE(offset, 56);

  msg.writeUInt32LE(negotiatedFlags, 60);

  lmResponse.copy(msg, lmOffset);
  ntResponse.copy(msg, ntOffset);
  domainBuf.copy(msg, domOffset);
  userBuf.copy(msg, userOffset);
  workstationBuf.copy(msg, wsOffset);

  return {
    type3Buf: msg,
    sessionKey,
    serverNbDomain: parsedTarget.nbDomainName,
    serverDnsDomain: parsedTarget.dnsDomainName,
    negotiatedFlags,
  };
}

// ============================================================================
// 2. SMB 2.0.2 / 2.1 / 3.0 SIGNING (HMAC-SHA256 & AES-128-CMAC / SP800-108)
// ============================================================================

function aes128EncryptBlock(key: Buffer, block: Buffer): Buffer {
  const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(block), cipher.final()]);
}

function leftShiftOneBit(input: Buffer): Buffer {
  const out = Buffer.alloc(16);
  let overflow = 0;
  for (let i = 15; i >= 0; i--) {
    out[i] = ((input[i] << 1) | overflow) & 0xff;
    overflow = (input[i] & 0x80) ? 1 : 0;
  }
  return out;
}

function xor16(a: Buffer, b: Buffer): Buffer {
  const out = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) out[i] = a[i] ^ b[i];
  return out;
}

// RFC 4493 AES-128-CMAC for SMB 3.0 packet signing
export function aes128Cmac(key: Buffer, message: Buffer): Buffer {
  const zero = Buffer.alloc(16);
  const L = aes128EncryptBlock(key, zero);
  const Rb = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x87]);

  let K1 = leftShiftOneBit(L);
  if (L[0] & 0x80) K1 = xor16(K1, Rb);

  let K2 = leftShiftOneBit(K1);
  if (K1[0] & 0x80) K2 = xor16(K2, Rb);

  const n = Math.max(1, Math.ceil(message.length / 16));
  const complete = message.length > 0 && message.length % 16 === 0;

  let lastBlock: Buffer;
  if (complete) {
    lastBlock = xor16(message.subarray((n - 1) * 16, n * 16), K1);
  } else {
    const padded = Buffer.alloc(16);
    const rem = message.subarray((n - 1) * 16);
    rem.copy(padded, 0);
    padded[rem.length] = 0x80;
    lastBlock = xor16(padded, K2);
  }

  let X = Buffer.alloc(16);
  for (let i = 0; i < n - 1; i++) {
    const block = message.subarray(i * 16, (i + 1) * 16);
    X = aes128EncryptBlock(key, xor16(X, block));
  }
  return aes128EncryptBlock(key, xor16(X, lastBlock));
}

// NIST SP800-108 Counter Mode KDF for SMB 3.0 SigningKey (MS-SMB2 §3.1.4.2)
function deriveSmb3SigningKey(sessionKey: Buffer): Buffer {
  const key16 = Buffer.alloc(16);
  sessionKey.copy(key16, 0, 0, Math.min(16, sessionKey.length));
  const label = Buffer.from('SMB2AESCMAC\0', 'ascii');
  const context = Buffer.from('SmbSign\0', 'ascii');
  const data = Buffer.alloc(4 + label.length + 1 + context.length + 4);
  let o = 0;
  data.writeUInt32BE(1, o); o += 4;
  label.copy(data, o); o += label.length;
  data[o++] = 0x00;
  context.copy(data, o); o += context.length;
  data.writeUInt32BE(128, o); // L = 128 bits
  return crypto.createHmac('sha256', key16).update(data).digest().subarray(0, 16);
}

// ============================================================================
// 3. PURE TYPESCRIPT SMB2 CLIENT (MS-SMB2 over TCP 445)
// ============================================================================

const SMB2_MAGIC = Buffer.from([0xfe, 0x53, 0x4d, 0x42]);

const SMB2_CMD = {
  NEGOTIATE: 0x0000,
  SESSION_SETUP: 0x0001,
  LOGOFF: 0x0002,
  TREE_CONNECT: 0x0003,
  TREE_DISCONNECT: 0x0004,
  CREATE: 0x0005,
  CLOSE: 0x0006,
  READ: 0x0008,
  WRITE: 0x0009,
  IOCTL: 0x000b,
  SET_INFO: 0x0011,
} as const;

const NT_STATUS = {
  SUCCESS: 0x00000000,
  PENDING: 0x00000103,
  MORE_PROCESSING_REQUIRED: 0xc0000016,
  END_OF_FILE: 0xc0000011,
  ACCESS_DENIED: 0xc0000022,
  OBJECT_NAME_NOT_FOUND: 0xc0000034,
  SHARING_VIOLATION: 0xc0000043,
  LOGON_FAILURE: 0xc000006d,
  ACCOUNT_RESTRICTION: 0xc000006e,
  BAD_NETWORK_NAME: 0xc00000cc,
} as const;

function formatNtStatusError(status: number, context: string): Error {
  const hex = `0x${(status >>> 0).toString(16).padStart(8, '0').toUpperCase()}`;
  if (status === NT_STATUS.LOGON_FAILURE) {
    return new Error(
      `SMB/RPC authentication rejected (${hex} STATUS_LOGON_FAILURE). Verify Domain Admin username (DOMAIN\\admin or admin@domain.local) and password.`
    );
  }
  if (status === NT_STATUS.ACCESS_DENIED) {
    return new Error(
      `SMB/RPC access denied (${hex} STATUS_ACCESS_DENIED) during ${context}. Ensure the account has Domain Admin (or unrestricted local Administrator) privileges on this workstation.`
    );
  }
  if (status === NT_STATUS.BAD_NETWORK_NAME) {
    return new Error(
      `Administrative share unavailable (${hex} STATUS_BAD_NETWORK_NAME) during ${context}. Ensure ADMIN$ / File & Printer Sharing is active on the Windows workstation.`
    );
  }
  if (status === NT_STATUS.ACCOUNT_RESTRICTION) {
    return new Error(
      `Windows account logon restriction (${hex} STATUS_ACCOUNT_RESTRICTION) during ${context}. Check Active Directory logon hours or workstation restrictions.`
    );
  }
  return new Error(`SMB2 ${context} failed with NTSTATUS ${hex}.`);
}

interface Smb2Response {
  status: number;
  command: number;
  flags: number;
  messageId: bigint;
  treeId: number;
  sessionId: bigint;
  body: Buffer;
}

class Smb2Client {
  private host: string;
  private port: number;
  private timeoutMs: number;
  private socket: net.Socket | null = null;
  private rxBuf: Buffer = Buffer.alloc(0);
  private pendingReads: Array<{
    resolve: (frame: Buffer) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];
  private closedError: Error | null = null;

  private messageId: bigint = 0n;
  private sessionId: bigint = 0n;
  private dialect: number = 0x0210;
  private signingRequired: boolean = false;
  private signingKey: Buffer | null = null;
  private maxReadSize: number = 65536;
  private maxWriteSize: number = 65536;

  constructor(host: string, port = 445, timeoutMs = 20000) {
    this.host = host;
    this.port = port;
    this.timeoutMs = timeoutMs;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const sock = new net.Socket();
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        sock.destroy();
        reject(new Error(`TCP connection to ${this.host}:${this.port} timed out.`));
      }, Math.min(this.timeoutMs, 8000));

      sock.once('connect', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.socket = sock;
        sock.setNoDelay(true);
        sock.on('data', (chunk: Buffer) => this.onData(chunk));
        sock.on('error', (err: Error) => this.failAll(err));
        sock.on('close', () => this.failAll(new Error(`SMB2 connection to ${this.host}:${this.port} closed.`)));
        resolve();
      });

      sock.once('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Unable to connect to ${this.host}:${this.port} (${err.message}).`));
      });

      sock.connect(this.port, this.host);
    });
  }

  destroy(): void {
    try {
      this.socket?.destroy();
    } catch {}
    this.socket = null;
  }

  private onData(chunk: Buffer): void {
    this.rxBuf = this.rxBuf.length === 0 ? chunk : Buffer.concat([this.rxBuf, chunk]);
    while (this.pendingReads.length > 0 && this.rxBuf.length >= 4) {
      const frameLen =
        ((this.rxBuf[1] << 16) | (this.rxBuf[2] << 8) | this.rxBuf[3]) >>> 0;
      if (this.rxBuf.length < 4 + frameLen) break;
      const frame = this.rxBuf.subarray(4, 4 + frameLen);
      this.rxBuf = this.rxBuf.subarray(4 + frameLen);
      const waiter = this.pendingReads.shift()!;
      clearTimeout(waiter.timer);
      waiter.resolve(frame);
    }
  }

  private failAll(err: Error): void {
    if (!this.closedError) this.closedError = err;
    while (this.pendingReads.length > 0) {
      const w = this.pendingReads.shift()!;
      clearTimeout(w.timer);
      w.reject(err);
    }
  }

  private readFrame(timeoutOverrideMs?: number): Promise<Buffer> {
    if (this.rxBuf.length >= 4) {
      const frameLen =
        ((this.rxBuf[1] << 16) | (this.rxBuf[2] << 8) | this.rxBuf[3]) >>> 0;
      if (this.rxBuf.length >= 4 + frameLen) {
        const frame = this.rxBuf.subarray(4, 4 + frameLen);
        this.rxBuf = this.rxBuf.subarray(4 + frameLen);
        return Promise.resolve(frame);
      }
    }
    if (this.closedError) return Promise.reject(this.closedError);
    return new Promise((resolve, reject) => {
      const ms = timeoutOverrideMs || this.timeoutMs;
      const timer = setTimeout(() => {
        const idx = this.pendingReads.findIndex((w) => w.resolve === resolve);
        if (idx >= 0) this.pendingReads.splice(idx, 1);
        reject(new Error(`SMB2 response from ${this.host}:${this.port} timed out after ${ms}ms.`));
      }, ms);
      this.pendingReads.push({ resolve, reject, timer });
    });
  }

  private signPacket(pkt: Buffer): void {
    if (!this.signingKey) return;
    // Set SMB2_FLAGS_SIGNED (0x00000008) and zero signature bytes 48..64 before computing
    const curFlags = pkt.readUInt32LE(16);
    pkt.writeUInt32LE((curFlags | 0x00000008) >>> 0, 16);
    pkt.fill(0, 48, 64);

    let sig: Buffer;
    if (this.dialect >= 0x0300) {
      sig = aes128Cmac(this.signingKey, pkt).subarray(0, 16);
    } else {
      sig = crypto.createHmac('sha256', this.signingKey).update(pkt).digest().subarray(0, 16);
    }
    sig.copy(pkt, 48, 0, 16);
  }

  private async request(
    command: number,
    body: Buffer,
    treeId = 0,
    opts?: { sign?: boolean; timeoutMs?: number }
  ): Promise<Smb2Response> {
    if (!this.socket || this.closedError) {
      throw this.closedError || new Error('SMB2 socket is not connected.');
    }

    const header = Buffer.alloc(64);
    SMB2_MAGIC.copy(header, 0);
    header.writeUInt16LE(64, 4); // StructureSize
    header.writeUInt16LE(0, 6); // CreditCharge
    header.writeUInt32LE(0, 8); // Status
    header.writeUInt16LE(command, 12);
    header.writeUInt16LE(31, 14); // CreditRequest
    header.writeUInt32LE(0, 16); // Flags
    header.writeUInt32LE(0, 20); // NextCommand
    const msgId = this.messageId++;
    header.writeBigUInt64LE(msgId, 24);
    header.writeUInt32LE(0, 32); // Reserved / ProcessId
    header.writeUInt32LE(treeId >>> 0, 36);
    header.writeBigUInt64LE(this.sessionId, 40);

    const pkt = Buffer.concat([header, body]);
    const shouldSign =
      opts?.sign !== undefined ? opts.sign : Boolean(this.signingRequired && this.signingKey);
    if (shouldSign && this.signingKey) {
      this.signPacket(pkt);
    }

    const nb = Buffer.alloc(4);
    nb[0] = 0x00;
    nb[1] = (pkt.length >> 16) & 0xff;
    nb[2] = (pkt.length >> 8) & 0xff;
    nb[3] = pkt.length & 0xff;

    this.socket.write(Buffer.concat([nb, pkt]));

    // Loop past any interim STATUS_PENDING async responses
    while (true) {
      const frame = await this.readFrame(opts?.timeoutMs);
      if (frame.length < 64 || !frame.subarray(0, 4).equals(SMB2_MAGIC)) {
        throw new Error('Invalid SMB2 response header received from Windows endpoint.');
      }
      const status = frame.readUInt32LE(8);
      const flags = frame.readUInt32LE(16);
      // Interim async STATUS_PENDING (SMB2_FLAGS_ASYNC_COMMAND = 0x02) -> wait for final completion frame
      if (status === NT_STATUS.PENDING && (flags & 0x00000002) !== 0) {
        continue;
      }
      return {
        status,
        command: frame.readUInt16LE(12),
        flags,
        messageId: frame.readBigUInt64LE(24),
        treeId: frame.readUInt32LE(36),
        sessionId: frame.readBigUInt64LE(40),
        body: frame.subarray(64),
      };
    }
  }

  async negotiate(): Promise<void> {
    // Offer SMB 2.0.2 (0x0202), SMB 2.1 (0x0210), and SMB 3.0 (0x0300)
    const dialects = [0x0202, 0x0210, 0x0300];
    const body = Buffer.alloc(36 + dialects.length * 2);
    body.writeUInt16LE(36, 0); // StructureSize
    body.writeUInt16LE(dialects.length, 2); // DialectCount
    body.writeUInt16LE(0x0001, 4); // SecurityMode: Signing Enabled
    body.writeUInt16LE(0, 6); // Reserved
    body.writeUInt32LE(0, 8); // Capabilities
    crypto.randomBytes(16).copy(body, 12); // ClientGuid
    body.writeBigUInt64LE(0n, 28); // ClientStartTime
    dialects.forEach((d, idx) => body.writeUInt16LE(d, 36 + idx * 2));

    const res = await this.request(SMB2_CMD.NEGOTIATE, body, 0, { sign: false });
    if (res.status !== NT_STATUS.SUCCESS || res.body.length < 64) {
      throw formatNtStatusError(res.status, 'NEGOTIATE');
    }

    const securityMode = res.body.readUInt16LE(2);
    this.dialect = res.body.readUInt16LE(4);
    this.signingRequired = (securityMode & 0x0002) !== 0;
    const srvMaxRead = res.body.readUInt32LE(32);
    const srvMaxWrite = res.body.readUInt32LE(36);
    if (srvMaxRead > 0) this.maxReadSize = Math.min(srvMaxRead, 65536);
    if (srvMaxWrite > 0) this.maxWriteSize = Math.min(srvMaxWrite, 65536);
  }

  private buildSessionSetupBody(secBuf: Buffer): Buffer {
    const fixed = Buffer.alloc(24);
    fixed.writeUInt16LE(25, 0); // StructureSize
    fixed[2] = 0; // Flags
    fixed[3] = 0x01; // SecurityMode: Signing Enabled
    fixed.writeUInt32LE(0, 4); // Capabilities
    fixed.writeUInt32LE(0, 8); // Channel
    fixed.writeUInt16LE(64 + 24, 12); // SecurityBufferOffset (from SMB2 header start)
    fixed.writeUInt16LE(secBuf.length, 14); // SecurityBufferLength
    fixed.writeBigUInt64LE(0n, 16); // PreviousSessionId
    return Buffer.concat([fixed, secBuf]);
  }

  async authenticate(username: string, password: string): Promise<{ serverDomain: string }> {
    const attemptAuth = async (
      domainOverride?: string
    ): Promise<{ ok: boolean; serverDomain: string; status: number; serverNbDomain: string }> => {
      this.sessionId = 0n;
      const type1 = wrapSpnegoNegTokenInit(createNtlmType1Buffer());
      const res1 = await this.request(SMB2_CMD.SESSION_SETUP, this.buildSessionSetupBody(type1), 0, {
        sign: false,
      });

      if (res1.status !== NT_STATUS.MORE_PROCESSING_REQUIRED) {
        throw formatNtStatusError(res1.status, 'SESSION_SETUP (Type 1)');
      }

      this.sessionId = res1.sessionId;
      const secOffset = res1.body.readUInt16LE(4) - 64;
      const secLen = res1.body.readUInt16LE(6);
      if (secOffset < 0 || secOffset + secLen > res1.body.length) {
        throw new Error('Malformed SMB2 SESSION_SETUP Type 2 security buffer.');
      }
      const type2Token = res1.body.subarray(secOffset, secOffset + secLen);

      const type3Info = createNtlmType3Result(type2Token, username, password, {
        domainOverride,
      });
      const type3Spnego = wrapSpnegoNegTokenResp(type3Info.type3Buf);

      const res2 = await this.request(
        SMB2_CMD.SESSION_SETUP,
        this.buildSessionSetupBody(type3Spnego),
        0,
        { sign: false }
      );

      if (res2.status !== NT_STATUS.SUCCESS) {
        return {
          ok: false,
          serverDomain: '',
          status: res2.status,
          serverNbDomain: type3Info.serverNbDomain,
        };
      }

      this.sessionId = res2.sessionId;
      const sessionFlags = res2.body.length >= 4 ? res2.body.readUInt16LE(2) : 0;
      const isGuestOrNull = (sessionFlags & 0x0003) !== 0;
      if (!isGuestOrNull) {
        this.signingKey =
          this.dialect >= 0x0300
            ? deriveSmb3SigningKey(type3Info.sessionKey)
            : type3Info.sessionKey;
      }
      return {
        ok: true,
        serverDomain: type3Info.serverNbDomain || type3Info.serverDnsDomain || '',
        status: NT_STATUS.SUCCESS,
        serverNbDomain: type3Info.serverNbDomain,
      };
    };

    const first = await attemptAuth();
    if (first.ok) {
      return { serverDomain: first.serverDomain };
    }

    // If user typed a bare domain admin username (without DOMAIN\ or @domain) and server advertised its AD NetBIOS domain,
    // gracefully retry once with the discovered domain name!
    const parsed = parseNtlmCredentials(username);
    if (
      first.status === NT_STATUS.LOGON_FAILURE &&
      !parsed.domain &&
      !parsed.isUpn &&
      !parsed.explicitLocal &&
      first.serverNbDomain
    ) {
      const retry = await attemptAuth(first.serverNbDomain);
      if (retry.ok) {
        return { serverDomain: retry.serverDomain };
      }
      throw formatNtStatusError(retry.status, 'SESSION_SETUP');
    }

    throw formatNtStatusError(first.status, 'SESSION_SETUP');
  }

  async treeConnect(shareName: string): Promise<number> {
    const unc = `\\\\${this.host}\\${shareName}`;
    const pathBuf = Buffer.from(unc, 'utf16le');
    const fixed = Buffer.alloc(8);
    fixed.writeUInt16LE(9, 0); // StructureSize
    fixed.writeUInt16LE(0, 2); // Reserved/Flags
    fixed.writeUInt16LE(64 + 8, 4); // PathOffset
    fixed.writeUInt16LE(pathBuf.length, 6); // PathLength

    const res = await this.request(SMB2_CMD.TREE_CONNECT, Buffer.concat([fixed, pathBuf]), 0);
    if (res.status !== NT_STATUS.SUCCESS) {
      throw formatNtStatusError(res.status, `TREE_CONNECT (${shareName})`);
    }
    return res.treeId;
  }

  async treeDisconnect(treeId: number): Promise<void> {
    const body = Buffer.alloc(4);
    body.writeUInt16LE(4, 0);
    await this.request(SMB2_CMD.TREE_DISCONNECT, body, treeId).catch(() => {});
  }

  async logoff(): Promise<void> {
    const body = Buffer.alloc(4);
    body.writeUInt16LE(4, 0);
    await this.request(SMB2_CMD.LOGOFF, body, 0).catch(() => {});
  }

  async createFile(
    treeId: number,
    relativePath: string,
    opts: {
      desiredAccess: number;
      shareAccess: number;
      createDisposition: number;
      createOptions?: number;
      fileAttributes?: number;
    }
  ): Promise<{ fileId: Buffer; endOfFile: bigint }> {
    const nameBuf = Buffer.from(relativePath, 'utf16le');
    const fixed = Buffer.alloc(56);
    fixed.writeUInt16LE(57, 0); // StructureSize
    fixed[2] = 0; // SecurityFlags
    fixed[3] = 0; // RequestedOplockLevel (None)
    fixed.writeUInt32LE(2, 4); // ImpersonationLevel: Impersonation
    fixed.writeBigUInt64LE(0n, 8); // SmbCreateFlags
    fixed.writeBigUInt64LE(0n, 16); // Reserved
    fixed.writeUInt32LE(opts.desiredAccess >>> 0, 24);
    fixed.writeUInt32LE((opts.fileAttributes ?? 0x00000080) >>> 0, 28); // FILE_ATTRIBUTE_NORMAL
    fixed.writeUInt32LE(opts.shareAccess >>> 0, 32);
    fixed.writeUInt32LE(opts.createDisposition >>> 0, 36);
    fixed.writeUInt32LE((opts.createOptions ?? 0x00000040) >>> 0, 40); // FILE_NON_DIRECTORY_FILE
    fixed.writeUInt16LE(64 + 56, 44); // NameOffset
    fixed.writeUInt16LE(nameBuf.length, 46); // NameLength
    fixed.writeUInt32LE(0, 48); // CreateContextsOffset
    fixed.writeUInt32LE(0, 52); // CreateContextsLength

    const payload = nameBuf.length > 0 ? Buffer.concat([fixed, nameBuf]) : Buffer.concat([fixed, Buffer.alloc(2)]);
    const res = await this.request(SMB2_CMD.CREATE, payload, treeId);
    if (res.status !== NT_STATUS.SUCCESS || res.body.length < 80) {
      throw formatNtStatusError(res.status, `CREATE (${relativePath})`);
    }
    const endOfFile = res.body.readBigUInt64LE(48);
    const fileId = Buffer.from(res.body.subarray(64, 80));
    return { fileId, endOfFile };
  }

  async closeFile(treeId: number, fileId: Buffer): Promise<void> {
    const body = Buffer.alloc(24);
    body.writeUInt16LE(24, 0); // StructureSize
    body.writeUInt16LE(0, 2); // Flags
    body.writeUInt32LE(0, 4); // Reserved
    fileId.copy(body, 8, 0, 16);
    await this.request(SMB2_CMD.CLOSE, body, treeId).catch(() => {});
  }

  async writeFileAll(treeId: number, relativePath: string, data: Buffer): Promise<void> {
    // FILE_OVERWRITE_IF = 5, GENERIC_WRITE | DELETE | SYNCHRONIZE = 0x40110000 -> use 0x00120116
    const { fileId } = await this.createFile(treeId, relativePath, {
      desiredAccess: 0x00120116, // FILE_WRITE_DATA | FILE_APPEND_DATA | WRITE_EA | WRITE_ATTR | READ_CONTROL | SYNCHRONIZE
      shareAccess: 0x00000001, // FILE_SHARE_READ
      createDisposition: 5, // FILE_OVERWRITE_IF
    });

    try {
      const chunkMax = Math.max(4096, Math.min(this.maxWriteSize, 32768));
      let offset = 0;
      while (offset < data.length) {
        const chunk = data.subarray(offset, Math.min(data.length, offset + chunkMax));
        const fixed = Buffer.alloc(48);
        fixed.writeUInt16LE(49, 0); // StructureSize
        fixed.writeUInt16LE(64 + 48, 2); // DataOffset
        fixed.writeUInt32LE(chunk.length, 4); // Length
        fixed.writeBigUInt64LE(BigInt(offset), 8); // Offset
        fileId.copy(fixed, 16, 0, 16);
        fixed.writeUInt32LE(0, 32); // Channel
        fixed.writeUInt32LE(0, 36); // RemainingBytes
        fixed.writeUInt16LE(0, 40); // WriteChannelInfoOffset
        fixed.writeUInt16LE(0, 42); // WriteChannelInfoLength
        fixed.writeUInt32LE(0, 44); // Flags

        const res = await this.request(SMB2_CMD.WRITE, Buffer.concat([fixed, chunk]), treeId);
        if (res.status !== NT_STATUS.SUCCESS) {
          throw formatNtStatusError(res.status, `WRITE (${relativePath})`);
        }
        const written = res.body.readUInt32LE(4);
        offset += written > 0 ? written : chunk.length;
      }
    } finally {
      await this.closeFile(treeId, fileId);
    }
  }

  async readFileIfExists(treeId: number, relativePath: string): Promise<Buffer | null> {
    let fileId: Buffer;
    try {
      const opened = await this.createFile(treeId, relativePath, {
        desiredAccess: 0x00120089, // FILE_READ_DATA | READ_EA | READ_ATTR | READ_CONTROL | SYNCHRONIZE
        shareAccess: 0x00000007, // READ | WRITE | DELETE
        createDisposition: 1, // FILE_OPEN
      });
      fileId = opened.fileId;
    } catch (err: any) {
      if (/0xC0000034|0xC0000043/i.test(String(err?.message || ''))) {
        return null;
      }
      throw err;
    }

    try {
      const chunks: Buffer[] = [];
      let offset = 0;
      const chunkMax = Math.max(4096, Math.min(this.maxReadSize, 65536));
      const maxTotalBytes = 4 * 1024 * 1024; // 4 MB safety cap

      while (offset < maxTotalBytes) {
        const body = Buffer.alloc(49);
        body.writeUInt16LE(49, 0); // StructureSize
        body[2] = 0; // Padding
        body[3] = 0; // Flags
        body.writeUInt32LE(chunkMax, 4); // Length
        body.writeBigUInt64LE(BigInt(offset), 8); // Offset
        fileId.copy(body, 16, 0, 16);
        body.writeUInt32LE(0, 32); // MinimumCount
        body.writeUInt32LE(0, 36); // Channel
        body.writeUInt32LE(0, 40); // RemainingBytes
        body.writeUInt16LE(0, 44); // ReadChannelInfoOffset
        body.writeUInt16LE(0, 46); // ReadChannelInfoLength
        body[48] = 0;

        const res = await this.request(SMB2_CMD.READ, body, treeId);
        if (res.status === NT_STATUS.END_OF_FILE) break;
        if (res.status !== NT_STATUS.SUCCESS) {
          throw formatNtStatusError(res.status, `READ (${relativePath})`);
        }
        const dataOffset = res.body[2] - 64;
        const dataLen = res.body.readUInt32LE(4);
        if (dataLen === 0) break;
        chunks.push(Buffer.from(res.body.subarray(dataOffset, dataOffset + dataLen)));
        offset += dataLen;
        if (dataLen < chunkMax) break;
      }
      return Buffer.concat(chunks);
    } finally {
      await this.closeFile(treeId, fileId);
    }
  }

  async deleteFileBestEffort(treeId: number, relativePath: string): Promise<void> {
    try {
      // Open with DELETE (0x00010000) and FILE_DELETE_ON_CLOSE (0x00001000)
      const { fileId } = await this.createFile(treeId, relativePath, {
        desiredAccess: 0x00010080, // DELETE | FILE_READ_ATTRIBUTES
        shareAccess: 0x00000007,
        createDisposition: 1, // FILE_OPEN
        createOptions: 0x00001040, // FILE_NON_DIRECTORY_FILE | FILE_DELETE_ON_CLOSE
      });
      // Also set FileDispositionInformation (class 13) = 1
      const setBody = Buffer.alloc(33);
      setBody.writeUInt16LE(33, 0); // StructureSize
      setBody[2] = 1; // SMB2_0_INFO_FILE
      setBody[3] = 13; // FileDispositionInformation
      setBody.writeUInt32LE(1, 4); // BufferLength
      setBody.writeUInt16LE(64 + 32, 8); // BufferOffset
      setBody.writeUInt16LE(0, 10);
      setBody.writeUInt32LE(0, 12); // AdditionalInformation
      fileId.copy(setBody, 16, 0, 16);
      setBody[32] = 1; // DeletePending = TRUE
      await this.request(SMB2_CMD.SET_INFO, setBody, treeId).catch(() => {});
      await this.closeFile(treeId, fileId);
    } catch {
      // Best-effort cleanup
    }
  }

  async pipeTransceive(treeId: number, fileId: Buffer, inputData: Buffer): Promise<Buffer> {
    const fixed = Buffer.alloc(56);
    fixed.writeUInt16LE(57, 0); // StructureSize
    fixed.writeUInt16LE(0, 2); // Reserved
    fixed.writeUInt32LE(0x0011c017, 4); // FSCTL_PIPE_TRANSCEIVE
    fileId.copy(fixed, 8, 0, 16);
    fixed.writeUInt32LE(64 + 56, 24); // InputOffset
    fixed.writeUInt32LE(inputData.length, 28); // InputCount
    fixed.writeUInt32LE(0, 32); // MaxInputResponse
    fixed.writeUInt32LE(0, 36); // OutputOffset
    fixed.writeUInt32LE(0, 40); // OutputCount
    fixed.writeUInt32LE(16384, 44); // MaxOutputResponse
    fixed.writeUInt32LE(0x00000001, 48); // SMB2_0_IOCTL_IS_FSCTL
    fixed.writeUInt32LE(0, 52); // Reserved2

    const res = await this.request(SMB2_CMD.IOCTL, Buffer.concat([fixed, inputData]), treeId, {
      timeoutMs: Math.max(this.timeoutMs, 35000),
    });
    if (res.status !== NT_STATUS.SUCCESS && res.status !== 0x80000005 /* STATUS_BUFFER_OVERFLOW */) {
      throw formatNtStatusError(res.status, 'IOCTL (FSCTL_PIPE_TRANSCEIVE)');
    }
    const outOffset = res.body.readUInt32LE(32) - 64;
    const outLen = res.body.readUInt32LE(36);
    if (outOffset < 0 || outOffset + outLen > res.body.length) {
      return Buffer.alloc(0);
    }
    return Buffer.from(res.body.subarray(outOffset, outOffset + outLen));
  }
}

// ============================================================================
// 4. DCERPC v5 + MS-SCMR (\pipe\svcctl) CLIENT
// ============================================================================

// MS-SCMR Interface UUID: 367abb81-9844-35f1-ad32-98f038001003 v2.0
const UUID_SVCCTL = Buffer.from([
  0x81, 0xbb, 0x7a, 0x36,
  0x44, 0x98,
  0xf1, 0x35,
  0xad, 0x32,
  0x98, 0xf0, 0x38, 0x00, 0x10, 0x03,
]);

// NDR Transfer Syntax UUID: 8a885d04-1ceb-11c9-9fe8-08002b104860 v2.0
const UUID_NDR = Buffer.from([
  0x04, 0x5d, 0x88, 0x8a,
  0xeb, 0x1c,
  0xc9, 0x11,
  0x9f, 0xe8,
  0x08, 0x00, 0x2b, 0x10, 0x48, 0x60,
]);

function align4(len: number): number {
  return (4 - (len % 4)) % 4;
}

function encodeNdrUnicodeString(str: string, referentId?: number): Buffer {
  const charCount = str.length + 1; // include NUL terminator
  const strBytes = Buffer.from(`${str}\0`, 'utf16le');
  const pad = Buffer.alloc(align4(strBytes.length));
  const prefix = Buffer.alloc(referentId !== undefined ? 16 : 12);
  let o = 0;
  if (referentId !== undefined) {
    prefix.writeUInt32LE(referentId >>> 0, o);
    o += 4;
  }
  prefix.writeUInt32LE(charCount, o); // MaxCount
  prefix.writeUInt32LE(0, o + 4); // Offset
  prefix.writeUInt32LE(charCount, o + 8); // ActualCount
  return Buffer.concat([prefix, strBytes, pad]);
}

function buildDceRpcBind(callId: number): Buffer {
  const body = Buffer.alloc(56);
  body.writeUInt16LE(4280, 0); // max_xmit_frag
  body.writeUInt16LE(4280, 2); // max_recv_frag
  body.writeUInt32LE(0, 4); // assoc_group_id
  body[8] = 1; // p_context_elem.n_context_elem
  body[9] = 0;
  body.writeUInt16LE(0, 10);
  // Context item 0
  body.writeUInt16LE(0, 12); // p_cont_id
  body[14] = 1; // n_transfer_syn
  body[15] = 0;
  UUID_SVCCTL.copy(body, 16);
  body.writeUInt16LE(2, 32); // Interface Version Major = 2
  body.writeUInt16LE(0, 34); // Interface Version Minor = 0
  UUID_NDR.copy(body, 36);
  body.writeUInt32LE(2, 52); // NDR Syntax Version = 2

  const header = Buffer.alloc(16);
  header[0] = 5; // rpc_vers = 5
  header[1] = 0; // rpc_vers_minor = 0
  header[2] = 11; // PTYPE = Bind
  header[3] = 0x03; // PFC_FIRST_FRAG | PFC_LAST_FRAG
  header.writeUInt32LE(0x00000010, 4); // Packed Data Representation (Little-Endian, ASCII, IEEE)
  header.writeUInt16LE(header.length + body.length, 8); // frag_length
  header.writeUInt16LE(0, 10); // auth_length
  header.writeUInt32LE(callId, 12);
  return Buffer.concat([header, body]);
}

function buildDceRpcRequest(callId: number, opnum: number, stub: Buffer): Buffer {
  const header = Buffer.alloc(24);
  header[0] = 5; // rpc_vers
  header[1] = 0; // rpc_vers_minor
  header[2] = 0; // PTYPE = Request
  header[3] = 0x03; // PFC_FIRST_FRAG | PFC_LAST_FRAG
  header.writeUInt32LE(0x00000010, 4); // Little-endian NDR
  header.writeUInt16LE(header.length + stub.length, 8); // frag_length
  header.writeUInt16LE(0, 10); // auth_length
  header.writeUInt32LE(callId, 12);
  header.writeUInt32LE(stub.length, 16); // alloc_hint
  header.writeUInt16LE(0, 20); // p_cont_id
  header.writeUInt16LE(opnum, 22);
  return Buffer.concat([header, stub]);
}

function parseDceRpcResponseStub(resp: Buffer, opName: string): Buffer {
  if (resp.length < 24) {
    throw new Error(`Truncated DCERPC response during ${opName}.`);
  }
  const ptype = resp[2];
  if (ptype === 3 /* Fault */) {
    const status = resp.length >= 28 ? resp.readUInt32LE(24) : 0;
    throw new Error(
      `DCERPC fault (0x${(status >>> 0).toString(16).padStart(8, '0')}) during ${opName}.`
    );
  }
  if (ptype !== 2 /* Response */) {
    throw new Error(`Unexpected DCERPC packet type ${ptype} during ${opName}.`);
  }
  return resp.subarray(24);
}

// ============================================================================
// 5. PUBLIC DOMAIN ADMIN SMB2/RPC POWERSHELL EXECUTOR (TCP 445)
// ============================================================================

export async function runDomainAdminSmbRpcPowerShell(opts: {
  host: string;
  port?: number;
  username: string;
  password: string;
  script: string;
  timeoutMs: number;
}): Promise<{ stdout: string; stderr: string; exitCode: number; serverDomain: string }> {
  const port = opts.port || 445;
  const timeoutMs = Math.max(10000, Math.min(300000, opts.timeoutMs || 25000));
  const runId = crypto.randomBytes(6).toString('hex');
  const svcName = `NetTopoHD_${runId}`;
  const psRelPath = `Temp\\nt_hd_${runId}.ps1`;
  const outRelPath = `Temp\\nt_hd_${runId}.out`;
  const errRelPath = `Temp\\nt_hd_${runId}.err`;
  const doneRelPath = `Temp\\nt_hd_${runId}.done`;

  const client = new Smb2Client(opts.host, port, Math.min(timeoutMs, 30000));
  let ipcTreeId: number | null = null;
  let adminTreeId: number | null = null;
  let pipeFileId: Buffer | null = null;
  let hScm: Buffer | null = null;
  let hSvc: Buffer | null = null;
  let callId = 1;

  const rpcCall = async (opnum: number, opName: string, stub: Buffer): Promise<Buffer> => {
    if (ipcTreeId === null || !pipeFileId) throw new Error('SVCCTL pipe is not open.');
    const reqPkt = buildDceRpcRequest(callId++, opnum, stub);
    const resp = await client.pipeTransceive(ipcTreeId, pipeFileId, reqPkt);
    return parseDceRpcResponseStub(resp, opName);
  };

  try {
    await client.connect();
    await client.negotiate();
    const { serverDomain } = await client.authenticate(opts.username, opts.password);

    // 1. Connect to ADMIN$ and stage the hardcoded allowlisted PowerShell script
    //    with atomic UTF-8 stdout/stderr/.done file capture inside PowerShell itself
    //    (zero cmd.exe escaping hazards, zero partial-read races, and immune to 30s SCM timeout).
    adminTreeId = await client.treeConnect('ADMIN$');
    const wrappedPs = [
      `$OutputEncoding = [System.Text.Encoding]::UTF8`,
      `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`,
      `$__ntOutPath = "$env:SystemRoot\\${outRelPath}"`,
      `$__ntErrPath = "$env:SystemRoot\\${errRelPath}"`,
      `$__ntDonePath = "$env:SystemRoot\\${doneRelPath}"`,
      `$__ntExit = 0`,
      `try {`,
      `  $__ntRes = & {`,
      opts.script,
      `  } 2>&1`,
      `  $__ntOut = New-Object System.Collections.Generic.List[string]`,
      `  $__ntErr = New-Object System.Collections.Generic.List[string]`,
      `  foreach ($__ntItem in $__ntRes) {`,
      `    if ($__ntItem -is [System.Management.Automation.ErrorRecord]) {`,
      `      $__ntErr.Add($__ntItem.ToString())`,
      `    } else {`,
      `      $__ntOut.Add([string]$__ntItem)`,
      `    }`,
      `  }`,
      `  [System.IO.File]::WriteAllText($__ntOutPath, ($__ntOut -join "\`n"), [System.Text.UTF8Encoding]::new($false))`,
      `  if ($__ntErr.Count -gt 0) {`,
      `    [System.IO.File]::WriteAllText($__ntErrPath, ($__ntErr -join "\`n"), [System.Text.UTF8Encoding]::new($false))`,
      `  }`,
      `} catch {`,
      `  $__ntExit = 1`,
      `  [System.IO.File]::WriteAllText($__ntErrPath, ($_.Exception.Message | Out-String), [System.Text.UTF8Encoding]::new($false))`,
      `} finally {`,
      `  [System.IO.File]::WriteAllText($__ntDonePath, [string]$__ntExit, [System.Text.UTF8Encoding]::new($false))`,
      `}`,
    ].join('\r\n');

    const psPayload = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]), // UTF-8 BOM for Windows PowerShell 5.1 compatibility
      Buffer.from(wrappedPs, 'utf-8'),
    ]);
    await client.writeFileAll(adminTreeId, psRelPath, psPayload);

    // 2. Connect to IPC$ and bind MS-SCMR (\pipe\svcctl)
    ipcTreeId = await client.treeConnect('IPC$');
    const openedPipe = await client.createFile(ipcTreeId, 'svcctl', {
      desiredAccess: 0x0012019f, // FILE_READ_DATA | FILE_WRITE_DATA | READ_EA | WRITE_EA | READ_ATTR | WRITE_ATTR | READ_CONTROL | SYNCHRONIZE
      shareAccess: 0x00000003,
      createDisposition: 1, // FILE_OPEN
      createOptions: 0x00000040,
      fileAttributes: 0,
    });
    pipeFileId = openedPipe.fileId;

    const bindResp = await client.pipeTransceive(ipcTreeId, pipeFileId, buildDceRpcBind(callId++));
    if (bindResp.length < 24 || bindResp[2] !== 12 /* BindAck */) {
      throw new Error('Windows Service Control Manager (\\pipe\\svcctl) rejected DCERPC Bind.');
    }

    // 3. ROpenSCManagerW (Opnum 15)
    const openScmStub = Buffer.alloc(12);
    openScmStub.writeUInt32LE(0, 0); // lpMachineName = NULL
    openScmStub.writeUInt32LE(0, 4); // lpDatabaseName = NULL
    openScmStub.writeUInt32LE(0x000f003f, 8); // SC_MANAGER_ALL_ACCESS
    const scmRes = await rpcCall(15, 'ROpenSCManagerW', openScmStub);
    if (scmRes.length < 24) throw new Error('Invalid ROpenSCManagerW response from endpoint.');
    const scmRc = scmRes.readUInt32LE(20);
    if (scmRc !== 0) {
      throw new Error(
        `ROpenSCManagerW failed with Win32 error ${scmRc}. Ensure the account is a Domain Admin or unrestricted local Administrator.`
      );
    }
    hScm = Buffer.from(scmRes.subarray(0, 20));

    // 4. RCreateServiceW (Opnum 12) — detached one-shot service executing only our staged allowlisted script
    const cmdLine =
      `%COMSPEC% /Q /C start "" /MIN powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%SystemRoot%\\${psRelPath}"`;

    const svcNameNdr = encodeNdrUnicodeString(svcName); // [in, string] ref pointer -> no referentId
    const displayNameNdr = encodeNdrUnicodeString(`NetTopology HelpDesk Task (${runId})`, 0x00020000); // [in, string, unique]
    const svcParams = Buffer.alloc(16);
    svcParams.writeUInt32LE(0x000f01ff, 0); // SERVICE_ALL_ACCESS
    svcParams.writeUInt32LE(0x00000010, 4); // SERVICE_WIN32_OWN_PROCESS
    svcParams.writeUInt32LE(0x00000003, 8); // SERVICE_DEMAND_START
    svcParams.writeUInt32LE(0x00000000, 12); // SERVICE_ERROR_IGNORE
    const binPathNdr = encodeNdrUnicodeString(cmdLine); // [in, string] ref pointer -> no referentId
    const tailNulls = Buffer.alloc(28); // LoadOrderGroup, TagId, Dependencies, DependSize, StartName, Password, PwSize = all 0

    const createSvcStub = Buffer.concat([
      hScm,
      svcNameNdr,
      displayNameNdr,
      svcParams,
      binPathNdr,
      tailNulls,
    ]);
    const createSvcRes = await rpcCall(12, 'RCreateServiceW', createSvcStub);
    if (createSvcRes.length < 28) throw new Error('Invalid RCreateServiceW response from endpoint.');
    const createRc = createSvcRes.readUInt32LE(24);
    if (createRc !== 0) {
      throw new Error(`RCreateServiceW failed with Win32 error ${createRc}.`);
    }
    hSvc = Buffer.from(createSvcRes.subarray(4, 24));

    // 5. RStartServiceW (Opnum 19)
    // Note: cmd.exe does not implement SCM control dispatcher, so Win32 1053 (ERROR_SERVICE_REQUEST_TIMEOUT) is expected after cmd launches!
    const startStub = Buffer.concat([hSvc, Buffer.alloc(8)]); // argc=0, argv=NULL
    const startRes = await rpcCall(19, 'RStartServiceW', startStub);
    const startRc = startRes.length >= 4 ? startRes.readUInt32LE(0) : 0;
    if (startRc !== 0 && startRc !== 1053) {
      throw new Error(`RStartServiceW failed with Win32 error ${startRc}.`);
    }

    // 6. Immediately delete the ephemeral service entry from SCM (process keeps running until done)
    await rpcCall(2, 'RDeleteService', hSvc).catch(() => {});
    await rpcCall(0, 'RCloseServiceHandle', hSvc).catch(() => {});
    hSvc = null;
    await rpcCall(0, 'RCloseServiceHandle', hScm).catch(() => {});
    hScm = null;

    // 7. Poll ADMIN$\Temp\nt_hd_<id>.done until script finishes
    const deadline = Date.now() + timeoutMs;
    let doneBuf: Buffer | null = null;
    while (Date.now() < deadline) {
      doneBuf = await client.readFileIfExists(adminTreeId, doneRelPath);
      if (doneBuf !== null) break;
      await new Promise((r) => setTimeout(r, 400));
    }

    if (doneBuf === null) {
      throw new Error(
        `Domain Admin SMB/RPC command on ${opts.host} timed out after ${Math.round(timeoutMs / 1000)}s waiting for output.`
      );
    }

    const outBuf = (await client.readFileIfExists(adminTreeId, outRelPath)) || Buffer.alloc(0);
    const errBuf = (await client.readFileIfExists(adminTreeId, errRelPath)) || Buffer.alloc(0);

    const exitCodeParsed = parseInt(doneBuf.toString('utf-8').trim(), 10);
    const exitCode = Number.isFinite(exitCodeParsed) ? exitCodeParsed : 0;

    return {
      stdout: outBuf.toString('utf-8').replace(/^\uFEFF/, ''),
      stderr: errBuf.toString('utf-8').replace(/^\uFEFF/, ''),
      exitCode,
      serverDomain,
    };
  } finally {
    // Always clean up ephemeral SCM handles and temp files on ADMIN$
    if (hSvc && ipcTreeId !== null && pipeFileId) {
      await rpcCall(2, 'RDeleteService', hSvc).catch(() => {});
      await rpcCall(0, 'RCloseServiceHandle', hSvc).catch(() => {});
    }
    if (hScm && ipcTreeId !== null && pipeFileId) {
      await rpcCall(0, 'RCloseServiceHandle', hScm).catch(() => {});
    }
    if (adminTreeId !== null) {
      await client.deleteFileBestEffort(adminTreeId, psRelPath);
      await client.deleteFileBestEffort(adminTreeId, outRelPath);
      await client.deleteFileBestEffort(adminTreeId, errRelPath);
      await client.deleteFileBestEffort(adminTreeId, doneRelPath);
      await client.treeDisconnect(adminTreeId);
    }
    if (ipcTreeId !== null && pipeFileId) {
      await client.closeFile(ipcTreeId, pipeFileId);
    }
    if (ipcTreeId !== null) {
      await client.treeDisconnect(ipcTreeId);
    }
    await client.logoff();
    client.destroy();
  }
}
