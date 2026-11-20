import { Router, Request, Response } from 'express';
import tls from 'tls';
import net from 'net';
import crypto from 'crypto';
import { verifyToken, UserSessionPayload } from './auth';
import {
  findUserById,
  findUserByUsername,
  getEffectivePolicyForUser,
  addPortalAuditLog,
  getEmailConfig,
  getGeneralSettings,
  getSslCertificatesFromDb,
  getSslCertificateByIdFromDb,
  upsertSslCertificateInDb,
  deleteSslCertificateFromDb,
} from './db';
import { createMailTransport } from './emailService';
import { emitSystemNotification } from './commsService';
import type {
  SslCertificateItem,
  SslCertificateStatus,
  SslCertificateSourceType,
  SslCertificateChainEntry,
  SslCertificateCheckHistoryEntry,
  SslCertificateProbeResult,
  SslCertificatesSummary,
} from '../src/types';

export const sslCertificateRouter = Router();

const MAX_PEM_BYTES = 65536;
const MAX_CHECK_HISTORY = 15;
const TLS_CONNECT_TIMEOUT_MS = 10000;
const BULK_CHECK_CONCURRENCY = 5;

const BLOCKED_METADATA_HOSTS = new Set([
  '169.254.169.254',
  'metadata.google.internal',
  'metadata.google.com',
  'metadata.azure.com',
  '100.100.100.200',
  'fd00:ec2::254',
]);

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || '127.0.0.1';
}

function isSuperAdminUser(user?: UserSessionPayload | null, policy?: any): boolean {
  const roleLower = String(user?.role || '').toLowerCase();
  return (
    policy?.id === 'policy-super-admin' ||
    (policy?.targetScope === 'all' && Number(policy?.priority || 0) >= 100) ||
    roleLower.includes('super') ||
    roleLower === 'admin' ||
    roleLower === 'administrator'
  );
}

async function authenticateRequest(req: Request): Promise<{
  authenticated: boolean;
  user?: UserSessionPayload;
  policy?: any;
  isSuperAdmin?: boolean;
  error?: string;
  statusCode?: number;
}> {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  if (!token) {
    return { authenticated: false, error: 'Authentication token required', statusCode: 401 };
  }
  const payload = verifyToken(token);
  if (!payload) {
    return { authenticated: false, error: 'Invalid or expired authentication token', statusCode: 401 };
  }
  const userRecord = (await findUserById(payload.userId)) || (await findUserByUsername(payload.username));
  if (userRecord && userRecord.status === 'disabled') {
    return { authenticated: false, error: 'Account disabled', statusCode: 403 };
  }
  const effectivePolicy = await getEffectivePolicyForUser(userRecord || payload);
  const isSuper = isSuperAdminUser(payload, effectivePolicy);
  return { authenticated: true, user: payload, policy: effectivePolicy, isSuperAdmin: isSuper };
}

function isItemInPolicyScope(certId: string, policy: any, isSuper: boolean): boolean {
  if (isSuper) return true;
  if (!policy) return true;
  if (policy.targetSslScope === 'specific') {
    const allowed = Array.isArray(policy.targetSslIds) ? policy.targetSslIds : [];
    return allowed.includes(certId);
  }
  return true;
}

function canViewSsl(policy: any, isSuper: boolean): boolean {
  if (isSuper) return true;
  return policy?.canViewSslCertificates !== false;
}

function canAddSsl(policy: any, isSuper: boolean): boolean {
  if (isSuper) return true;
  if (!canViewSsl(policy, isSuper)) return false;
  if (policy?.canAddSslCertificates === false) return false;
  return Boolean(policy?.canAddSslCertificates ?? policy?.canManageSslCertificates ?? true);
}

function canEditSsl(certId: string, policy: any, isSuper: boolean): boolean {
  if (isSuper) return true;
  if (!canViewSsl(policy, isSuper)) return false;
  if (!isItemInPolicyScope(certId, policy, isSuper)) return false;
  if (policy?.canEditSslCertificates === false && policy?.canManageSslCertificates === false) return false;
  return Boolean(policy?.canEditSslCertificates ?? policy?.canManageSslCertificates ?? true);
}

function canDeleteSsl(certId: string, policy: any, isSuper: boolean): boolean {
  if (isSuper) return true;
  if (!canViewSsl(policy, isSuper)) return false;
  if (!isItemInPolicyScope(certId, policy, isSuper)) return false;
  if (policy?.canDeleteSslCertificates === false) return false;
  return Boolean(policy?.canDeleteSslCertificates ?? true);
}

function canCheckSsl(certId: string | null, policy: any, isSuper: boolean): boolean {
  if (isSuper) return true;
  if (!canViewSsl(policy, isSuper)) return false;
  if (certId && !isItemInPolicyScope(certId, policy, isSuper)) return false;
  if (policy?.canCheckSslCertificates === false) return false;
  return Boolean(policy?.canCheckSslCertificates ?? policy?.canEditSslCertificates ?? policy?.canManageSslCertificates ?? true);
}

export function normalizeDomainInput(rawDomain: string, rawPort?: number | string): {
  host: string;
  port: number;
  error?: string;
} {
  let text = String(rawDomain || '').trim();
  if (!text) {
    return { host: '', port: 443, error: 'Domain or host is required.' };
  }

  let parsedPort: number | undefined;
  if (rawPort !== undefined && rawPort !== null && String(rawPort).trim() !== '') {
    const n = Number(rawPort);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      return { host: '', port: 443, error: 'Port must be an integer between 1 and 65535.' };
    }
    parsedPort = n;
  }

  // Allow users to paste https://example.com:8443/path and extract cleanly
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(text)) {
    try {
      const u = new URL(text);
      if (u.protocol !== 'https:' && u.protocol !== 'http:' && u.protocol !== 'tls:') {
        return { host: '', port: 443, error: 'Only domain names, IP addresses, or HTTPS URLs are supported.' };
      }
      text = u.hostname;
      if (!parsedPort && u.port) {
        const up = Number(u.port);
        if (Number.isInteger(up) && up >= 1 && up <= 65535) parsedPort = up;
      }
    } catch {
      return { host: '', port: 443, error: 'Invalid URL or domain format.' };
    }
  } else {
    // Strip path if any
    const slashIdx = text.indexOf('/');
    if (slashIdx >= 0) text = text.slice(0, slashIdx);
    // Extract host:port for non-IPv6 or [ipv6]:port
    if (text.startsWith('[')) {
      const closing = text.indexOf(']');
      if (closing < 0) return { host: '', port: 443, error: 'Invalid IPv6 host format.' };
      const inside = text.slice(1, closing);
      const rest = text.slice(closing + 1);
      text = inside;
      if (!parsedPort && rest.startsWith(':')) {
        const rp = Number(rest.slice(1));
        if (!Number.isInteger(rp) || rp < 1 || rp > 65535) {
          return { host: '', port: 443, error: 'Port must be an integer between 1 and 65535.' };
        }
        parsedPort = rp;
      }
    } else if (text.includes(':') && net.isIP(text) === 0) {
      const parts = text.split(':');
      if (parts.length === 2) {
        text = parts[0];
        if (!parsedPort && parts[1]) {
          const rp = Number(parts[1]);
          if (!Number.isInteger(rp) || rp < 1 || rp > 65535) {
            return { host: '', port: 443, error: 'Port must be an integer between 1 and 65535.' };
          }
          parsedPort = rp;
        }
      }
    }
  }

  const host = text.trim().toLowerCase().replace(/\.$/, '');
  if (!host || host.length > 253) {
    return { host: '', port: 443, error: 'Hostname is empty or exceeds maximum length.' };
  }

  // Block cloud instance metadata targets
  if (BLOCKED_METADATA_HOSTS.has(host) || host.startsWith('169.254.169.')) {
    return { host: '', port: 443, error: 'Target host is restricted by security policy.' };
  }

  const ipVer = net.isIP(host);
  if (ipVer === 0) {
    // Validate RFC hostname characters (also permit wildcard prefix stripped or normal labels)
    const hostnameRegex = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
    if (!hostnameRegex.test(host)) {
      return { host: '', port: 443, error: 'Invalid hostname characters. Provide a valid domain or IP address.' };
    }
  }

  return { host, port: parsedPort || 443 };
}

export function computeDaysRemaining(validTo?: string | null): number | null {
  if (!validTo) return null;
  const endTs = new Date(validTo).getTime();
  if (Number.isNaN(endTs)) return null;
  const diffMs = endTs - Date.now();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function computeSslStatus(
  validTo?: string | null,
  isActive?: boolean,
  lastCheckError?: string | null
): SslCertificateStatus {
  if (isActive === false) return 'inactive';
  const days = computeDaysRemaining(validTo);
  if (days === null) {
    return lastCheckError ? 'check_failed' : 'check_failed';
  }
  if (days < 0) return 'expired';
  if (days <= 7) return 'critical';
  if (days <= 30) return 'expiring_soon';
  return 'valid';
}

function parseDistinguishedNameField(dn: string | undefined, key: string): string | undefined {
  if (!dn) return undefined;
  const lines = dn.split(/\r?\n|,\s*/);
  for (const part of lines) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      if (k.toUpperCase() === key.toUpperCase() && v) return v;
    }
  }
  return undefined;
}

function parseSanList(sanStr?: string): string[] {
  if (!sanStr) return [];
  return sanStr
    .split(',')
    .map((entry) => entry.trim())
    .map((entry) => entry.replace(/^(DNS|IP Address|IP|URI|email):/i, '').trim())
    .filter(Boolean);
}

function extractPublicKeyInfo(x509: crypto.X509Certificate): { keyAlgorithm?: string; keySize?: number } {
  try {
    const pub = x509.publicKey;
    const keyType = pub.asymmetricKeyType || undefined;
    const details: any = pub.asymmetricKeyDetails || {};
    let keyAlgorithm = keyType ? keyType.toUpperCase() : undefined;
    let keySize: number | undefined;

    if (typeof details.modulusLength === 'number') {
      keySize = details.modulusLength;
    } else if (typeof details.namedCurve === 'string') {
      keyAlgorithm = `ECDSA (${details.namedCurve})`;
      const match = details.namedCurve.match(/(\d{3})/);
      if (match) keySize = Number(match[1]);
    } else if (keyType === 'ed25519') {
      keyAlgorithm = 'Ed25519';
      keySize = 256;
    } else if (keyType === 'ed448') {
      keyAlgorithm = 'Ed448';
      keySize = 448;
    }
    return { keyAlgorithm, keySize };
  } catch {
    return {};
  }
}

function derToPem(raw: Buffer): string {
  const b64 = raw.toString('base64');
  const wrapped = b64.match(/.{1,64}/g)?.join('\n') || b64;
  return `-----BEGIN CERTIFICATE-----\n${wrapped}\n-----END CERTIFICATE-----`;
}

export function parsePemCertificate(pemInput: string): SslCertificateProbeResult {
  const startedAt = Date.now();
  const raw = String(pemInput || '').trim();
  if (!raw) {
    return {
      success: false,
      sourceType: 'manual_pem',
      daysRemaining: null,
      status: 'check_failed',
      error: 'PEM certificate content is required.',
      durationMs: Date.now() - startedAt,
    };
  }
  if (Buffer.byteLength(raw, 'utf-8') > MAX_PEM_BYTES) {
    return {
      success: false,
      sourceType: 'manual_pem',
      daysRemaining: null,
      status: 'check_failed',
      error: 'Certificate input exceeds maximum allowed size (64 KB).',
      durationMs: Date.now() - startedAt,
    };
  }
  if (/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i.test(raw)) {
    return {
      success: false,
      sourceType: 'manual_pem',
      daysRemaining: null,
      status: 'check_failed',
      error: 'Private keys are strictly rejected. Upload or paste only the public X.509 certificate PEM.',
      durationMs: Date.now() - startedAt,
    };
  }

  const certBlocks = raw.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  if (!certBlocks || certBlocks.length === 0) {
    return {
      success: false,
      sourceType: 'manual_pem',
      daysRemaining: null,
      status: 'check_failed',
      error: 'No valid -----BEGIN CERTIFICATE----- PEM block found.',
      durationMs: Date.now() - startedAt,
    };
  }

  try {
    const leaf = new crypto.X509Certificate(certBlocks[0]);
    const validFromIso = new Date(leaf.validFrom).toISOString();
    const validToIso = new Date(leaf.validTo).toISOString();
    const daysRemaining = computeDaysRemaining(validToIso);
    const status = computeSslStatus(validToIso, true, null);
    const subjectCN = parseDistinguishedNameField(leaf.subject, 'CN');
    const subjectOrg = parseDistinguishedNameField(leaf.subject, 'O');
    const issuerCN = parseDistinguishedNameField(leaf.issuer, 'CN');
    const issuerOrg = parseDistinguishedNameField(leaf.issuer, 'O');
    const sans = parseSanList(leaf.subjectAltName);
    const { keyAlgorithm, keySize } = extractPublicKeyInfo(leaf);
    const selfSigned = leaf.subject === leaf.issuer;

    const chainSummary: SslCertificateChainEntry[] = [];
    for (const block of certBlocks.slice(0, 8)) {
      try {
        const c = new crypto.X509Certificate(block);
        chainSummary.push({
          subject: parseDistinguishedNameField(c.subject, 'CN') || c.subject,
          issuer: parseDistinguishedNameField(c.issuer, 'CN') || c.issuer,
          validFrom: new Date(c.validFrom).toISOString(),
          validTo: new Date(c.validTo).toISOString(),
          fingerprintSha256: c.fingerprint256,
        });
      } catch {}
    }

    return {
      success: true,
      sourceType: 'manual_pem',
      domain: subjectCN || sans[0] || undefined,
      validFrom: validFromIso,
      validTo: validToIso,
      daysRemaining,
      status,
      subjectCN,
      subjectOrg,
      issuerCN,
      issuerOrg,
      serialNumber: leaf.serialNumber,
      fingerprintSha256: leaf.fingerprint256,
      sans,
      keyAlgorithm,
      keySize,
      selfSigned,
      authorized: !selfSigned && daysRemaining !== null && daysRemaining >= 0,
      chainSummary,
      pemCertificate: certBlocks[0],
      durationMs: Date.now() - startedAt,
    };
  } catch (err: any) {
    return {
      success: false,
      sourceType: 'manual_pem',
      daysRemaining: null,
      status: 'check_failed',
      error: `Failed to parse X.509 PEM certificate: ${err?.message || 'Invalid certificate format'}`,
      durationMs: Date.now() - startedAt,
    };
  }
}

export async function probeDomainTls(
  rawDomain: string,
  rawPort?: number | string,
  rawSniHost?: string
): Promise<SslCertificateProbeResult> {
  const startedAt = Date.now();
  const normalized = normalizeDomainInput(rawDomain, rawPort);
  if (normalized.error || !normalized.host) {
    return {
      success: false,
      sourceType: 'domain',
      daysRemaining: null,
      status: 'check_failed',
      error: normalized.error || 'Invalid domain.',
      durationMs: Date.now() - startedAt,
    };
  }

  let sniHost: string | undefined;
  if (rawSniHost && String(rawSniHost).trim()) {
    const normSni = normalizeDomainInput(String(rawSniHost).trim());
    if (normSni.error) {
      return {
        success: false,
        sourceType: 'domain',
        domain: normalized.host,
        port: normalized.port,
        daysRemaining: null,
        status: 'check_failed',
        error: `Invalid SNI hostname: ${normSni.error}`,
        durationMs: Date.now() - startedAt,
      };
    }
    sniHost = normSni.host;
  }

  const effectiveServername = sniHost || (net.isIP(normalized.host) === 0 ? normalized.host : undefined);

  return new Promise<SslCertificateProbeResult>((resolve) => {
    let settled = false;
    const finish = (result: SslCertificateProbeResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let socket: tls.TLSSocket | null = null;
    try {
      socket = tls.connect(
        {
          host: normalized.host,
          port: normalized.port,
          servername: effectiveServername,
          rejectUnauthorized: false,
          timeout: TLS_CONNECT_TIMEOUT_MS,
        },
        () => {
          try {
            const peer: any = socket?.getPeerCertificate(true);
            const tlsProtocol = socket?.getProtocol() || undefined;
            const cipher = socket?.getCipher();
            const cipherName = cipher?.name || undefined;
            const authorized = Boolean(socket?.authorized);
            const authorizationError = socket?.authorizationError ? String(socket.authorizationError) : undefined;
            const durationMs = Date.now() - startedAt;

            socket?.end();
            socket?.destroy();

            if (!peer || Object.keys(peer).length === 0) {
              return finish({
                success: false,
                sourceType: 'domain',
                domain: normalized.host,
                port: normalized.port,
                sniHost,
                daysRemaining: null,
                status: 'check_failed',
                error: 'No SSL/TLS peer certificate presented by remote server.',
                durationMs,
              });
            }

            let validFromIso: string | undefined;
            let validToIso: string | undefined;
            let keyAlgorithm: string | undefined;
            let keySize: number | undefined;
            let pemCertificate: string | undefined;

            if (peer.raw && Buffer.isBuffer(peer.raw)) {
              try {
                const x509 = new crypto.X509Certificate(peer.raw);
                validFromIso = new Date(x509.validFrom).toISOString();
                validToIso = new Date(x509.validTo).toISOString();
                const pk = extractPublicKeyInfo(x509);
                keyAlgorithm = pk.keyAlgorithm;
                keySize = pk.keySize;
                pemCertificate = derToPem(peer.raw);
              } catch {}
            }

            if (!validFromIso && peer.valid_from) {
              const d = new Date(peer.valid_from);
              if (!Number.isNaN(d.getTime())) validFromIso = d.toISOString();
            }
            if (!validToIso && peer.valid_to) {
              const d = new Date(peer.valid_to);
              if (!Number.isNaN(d.getTime())) validToIso = d.toISOString();
            }

            const daysRemaining = computeDaysRemaining(validToIso);
            const status = computeSslStatus(validToIso, true, null);
            const subjectCN = Array.isArray(peer.subject?.CN) ? peer.subject.CN[0] : peer.subject?.CN;
            const subjectOrg = Array.isArray(peer.subject?.O) ? peer.subject.O[0] : peer.subject?.O;
            const issuerCN = Array.isArray(peer.issuer?.CN) ? peer.issuer.CN[0] : peer.issuer?.CN;
            const issuerOrg = Array.isArray(peer.issuer?.O) ? peer.issuer.O[0] : peer.issuer?.O;
            const sans = parseSanList(peer.subjectaltname);
            const fingerprintSha256 = peer.fingerprint256 || peer.fingerprint || undefined;

            // Walk issuer chain safely without loops
            const chainSummary: SslCertificateChainEntry[] = [];
            const seenFingerprints = new Set<string>();
            let curr: any = peer;
            let depth = 0;
            while (curr && depth < 10) {
              const fp = curr.fingerprint256 || curr.fingerprint || `depth-${depth}`;
              if (seenFingerprints.has(fp)) break;
              seenFingerprints.add(fp);
              const subCn = Array.isArray(curr.subject?.CN) ? curr.subject.CN[0] : curr.subject?.CN;
              const issCn = Array.isArray(curr.issuer?.CN) ? curr.issuer.CN[0] : curr.issuer?.CN;
              const subO = Array.isArray(curr.subject?.O) ? curr.subject.O[0] : curr.subject?.O;
              const issO = Array.isArray(curr.issuer?.O) ? curr.issuer.O[0] : curr.issuer?.O;
              chainSummary.push({
                subject: subCn || subO || 'Unknown Subject',
                issuer: issCn || issO || 'Unknown Issuer',
                validFrom: curr.valid_from ? new Date(curr.valid_from).toISOString() : undefined,
                validTo: curr.valid_to ? new Date(curr.valid_to).toISOString() : undefined,
                fingerprintSha256: curr.fingerprint256 || curr.fingerprint || undefined,
              });
              if (!curr.issuerCertificate || curr.issuerCertificate === curr) break;
              curr = curr.issuerCertificate;
              depth++;
            }

            const selfSigned =
              Boolean(subjectCN && issuerCN && subjectCN === issuerCN && chainSummary.length === 1) ||
              authorizationError === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
              authorizationError === 'SELF_SIGNED_CERT_IN_CHAIN';

            return finish({
              success: true,
              sourceType: 'domain',
              domain: normalized.host,
              port: normalized.port,
              sniHost,
              validFrom: validFromIso,
              validTo: validToIso,
              daysRemaining,
              status,
              subjectCN,
              subjectOrg,
              issuerCN,
              issuerOrg,
              serialNumber: peer.serialNumber,
              fingerprintSha256,
              sans,
              tlsProtocol,
              cipherName,
              keyAlgorithm,
              keySize,
              authorized,
              authorizationError,
              selfSigned,
              chainSummary,
              pemCertificate,
              durationMs,
            });
          } catch (innerErr: any) {
            socket?.destroy();
            return finish({
              success: false,
              sourceType: 'domain',
              domain: normalized.host,
              port: normalized.port,
              sniHost,
              daysRemaining: null,
              status: 'check_failed',
              error: innerErr?.message || 'Error extracting TLS peer certificate.',
              durationMs: Date.now() - startedAt,
            });
          }
        }
      );

      socket.setTimeout(TLS_CONNECT_TIMEOUT_MS, () => {
        socket?.destroy();
        finish({
          success: false,
          sourceType: 'domain',
          domain: normalized.host,
          port: normalized.port,
          sniHost,
          daysRemaining: null,
          status: 'check_failed',
          error: `TLS connection timed out after ${TLS_CONNECT_TIMEOUT_MS / 1000}s (${normalized.host}:${normalized.port}).`,
          durationMs: Date.now() - startedAt,
        });
      });

      socket.on('error', (err: any) => {
        socket?.destroy();
        finish({
          success: false,
          sourceType: 'domain',
          domain: normalized.host,
          port: normalized.port,
          sniHost,
          daysRemaining: null,
          status: 'check_failed',
          error: err?.message || `Failed to connect to ${normalized.host}:${normalized.port}`,
          durationMs: Date.now() - startedAt,
        });
      });
    } catch (err: any) {
      socket?.destroy();
      finish({
        success: false,
        sourceType: 'domain',
        domain: normalized.host,
        port: normalized.port,
        sniHost,
        daysRemaining: null,
        status: 'check_failed',
        error: err?.message || 'Unable to initiate TLS connection.',
        durationMs: Date.now() - startedAt,
      });
    }
  });
}

function hydrateSslRecord(item: SslCertificateItem): SslCertificateItem {
  const isAct = item.isActive !== false;
  const daysRemaining = computeDaysRemaining(item.validTo);
  const status = !isAct
    ? 'inactive'
    : item.lastCheckError && daysRemaining === null
    ? 'check_failed'
    : computeSslStatus(item.validTo, isAct, item.lastCheckError);
  return {
    ...item,
    isActive: isAct,
    daysRemaining,
    status,
  };
}

function buildSummary(items: SslCertificateItem[]): SslCertificatesSummary {
  let lastGlobalCheckAt: string | null = null;
  for (const item of items) {
    if (item.lastCheckedAt && (!lastGlobalCheckAt || item.lastCheckedAt > lastGlobalCheckAt)) {
      lastGlobalCheckAt = item.lastCheckedAt;
    }
  }
  return {
    total: items.length,
    valid: items.filter((c) => c.status === 'valid').length,
    expiring_soon: items.filter((c) => c.status === 'expiring_soon').length,
    critical: items.filter((c) => c.status === 'critical').length,
    expired: items.filter((c) => c.status === 'expired').length,
    check_failed: items.filter((c) => c.status === 'check_failed').length,
    inactive: items.filter((c) => c.status === 'inactive').length,
    autoCheckEnabled: items.filter((c) => c.isActive !== false && c.autoCheckEnabled !== false).length,
    lastGlobalCheckAt,
  };
}

async function performSingleCertificateCheck(
  cert: SslCertificateItem,
  triggeredBy: string
): Promise<SslCertificateItem> {
  const nowIso = new Date().toISOString();
  let probe: SslCertificateProbeResult;

  if (cert.sourceType === 'domain' && cert.domain) {
    probe = await probeDomainTls(cert.domain, cert.port || 443, cert.sniHost);
  } else if (cert.pemCertificate) {
    probe = parsePemCertificate(cert.pemCertificate);
  } else {
    // Manual date-only entry: recalculate days remaining cleanly
    const days = computeDaysRemaining(cert.validTo);
    const st = computeSslStatus(cert.validTo, cert.isActive !== false, null);
    probe = {
      success: days !== null,
      sourceType: 'manual_pem',
      validFrom: cert.validFrom,
      validTo: cert.validTo,
      daysRemaining: days,
      status: st,
      subjectCN: cert.subjectCN,
      issuerCN: cert.issuerCN,
      durationMs: 1,
      error: days === null ? 'No expiration date or PEM certificate configured.' : undefined,
    };
  }

  const nextStatus: SslCertificateStatus =
    cert.isActive === false ? 'inactive' : probe.success ? probe.status : 'check_failed';

  const historyEntry: SslCertificateCheckHistoryEntry = {
    checkedAt: nowIso,
    status: nextStatus,
    daysRemaining: probe.success ? probe.daysRemaining : computeDaysRemaining(cert.validTo),
    validTo: probe.validTo || cert.validTo,
    tlsProtocol: probe.tlsProtocol || cert.tlsProtocol,
    cipherName: probe.cipherName || cert.cipherName,
    authorized: probe.authorized,
    durationMs: probe.durationMs,
    error: probe.success ? undefined : probe.error,
    triggeredBy,
  };

  const prevHistory = Array.isArray(cert.checkHistory) ? cert.checkHistory : [];
  const updated: SslCertificateItem = {
    ...cert,
    ...(probe.success
      ? {
          validFrom: probe.validFrom ?? cert.validFrom,
          validTo: probe.validTo ?? cert.validTo,
          daysRemaining: probe.daysRemaining,
          subjectCN: probe.subjectCN ?? cert.subjectCN,
          subjectOrg: probe.subjectOrg ?? cert.subjectOrg,
          issuerCN: probe.issuerCN ?? cert.issuerCN,
          issuerOrg: probe.issuerOrg ?? cert.issuerOrg,
          serialNumber: probe.serialNumber ?? cert.serialNumber,
          fingerprintSha256: probe.fingerprintSha256 ?? cert.fingerprintSha256,
          sans: probe.sans && probe.sans.length > 0 ? probe.sans : cert.sans,
          tlsProtocol: probe.tlsProtocol ?? cert.tlsProtocol,
          cipherName: probe.cipherName ?? cert.cipherName,
          keyAlgorithm: probe.keyAlgorithm ?? cert.keyAlgorithm,
          keySize: probe.keySize ?? cert.keySize,
          authorized: probe.authorized,
          authorizationError: probe.authorizationError,
          selfSigned: probe.selfSigned,
          chainSummary: probe.chainSummary && probe.chainSummary.length > 0 ? probe.chainSummary : cert.chainSummary,
          pemCertificate: probe.pemCertificate ?? cert.pemCertificate,
          lastCheckError: undefined,
        }
      : {
          daysRemaining: computeDaysRemaining(cert.validTo),
          lastCheckError: probe.error || 'Certificate check failed.',
        }),
    status: nextStatus,
    lastCheckedAt: nowIso,
    lastCheckDurationMs: probe.durationMs,
    checkHistory: [historyEntry, ...prevHistory].slice(0, MAX_CHECK_HISTORY),
    updatedAt: nowIso,
  };

  await upsertSslCertificateInDb(updated);
  return updated;
}

async function sendSslAlertEmail(
  cert: SslCertificateItem,
  options?: { targetEmail?: string; isTest?: boolean }
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  try {
    const emailConfig = await getEmailConfig();
    if (!emailConfig || !emailConfig.smtp_host || !emailConfig.smtp_host.trim()) {
      return { success: false, error: 'SMTP Email server is not configured or enabled in Settings.' };
    }
    const recipients = options?.targetEmail
      ? [options.targetEmail.trim()]
      : Array.isArray(cert.notifyEmails) && cert.notifyEmails.length > 0
      ? cert.notifyEmails
      : cert.ownerEmail
      ? [cert.ownerEmail]
      : [];

    if (recipients.length === 0) {
      return { success: false, error: 'No notification email recipients configured for this SSL certificate.' };
    }

    const general = await getGeneralSettings();
    const appTitle = (general?.panelTitle && general.panelTitle.trim()) || 'NetTopology Enterprise';
    const days = computeDaysRemaining(cert.validTo);
    const isExpired = days !== null && days < 0;
    const prefix = options?.isTest ? '[TEST] ' : '';
    const subject = `${prefix}SSL/TLS Certificate Alert: ${cert.title} (${
      days === null ? cert.status : isExpired ? `EXPIRED ${Math.abs(days)}d ago` : `${days}d remaining`
    })`;

    const targetLabel =
      cert.sourceType === 'domain' && cert.domain ? `${cert.domain}:${cert.port || 443}` : cert.subjectCN || cert.title;

    const text = [
      `${appTitle} — SSL/TLS Certificate Lifecycle Monitor`,
      `Certificate: ${cert.title}`,
      `Target / CN: ${targetLabel}`,
      `Issuer: ${cert.issuerCN || cert.issuerOrg || 'Unknown'}`,
      `Status: ${cert.status.toUpperCase()}`,
      `Days Remaining: ${days === null ? 'Unknown' : days}`,
      `Valid Until: ${cert.validTo || 'N/A'}`,
      cert.lastCheckError ? `Last Check Error: ${cert.lastCheckError}` : '',
      cert.ownerName ? `Owner: ${cert.ownerName}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const fromAddr = (emailConfig.from_email && emailConfig.from_email.trim()) || (emailConfig.smtp_user || '').trim();
    const fromName = (emailConfig.from_name && emailConfig.from_name.trim()) || `${appTitle} SSL Monitor`;
    const transport = createMailTransport(emailConfig);
    const info = await transport.sendMail({
      from: fromName ? `"${fromName}" <${fromAddr}>` : fromAddr,
      to: recipients.join(', '),
      subject,
      text,
    });

    return { success: true, messageId: info?.messageId };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to send SSL alert email.' };
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIdx = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const idx = nextIdx++;
      if (idx >= items.length) break;
      results[idx] = await worker(items[idx]);
    }
  });

  await Promise.all(runners);
  return results;
}

const sslInboxNotifiedCache = new Set<string>();

export async function runScheduledSslCertificateChecks(forceAll: boolean = false): Promise<{
  checkedCount: number;
  failedCount: number;
  alertsSent: number;
}> {
  const all = (await getSslCertificatesFromDb()) as SslCertificateItem[];
  const now = Date.now();
  const todayStr = new Date().toISOString().slice(0, 10);

  const due = all.filter((cert) => {
    if (cert.isActive === false) return false;
    if (forceAll) return true;
    if (cert.autoCheckEnabled === false) return false;
    const intervalMs = Math.max(1, Number(cert.checkIntervalHours || 24)) * 60 * 60 * 1000;
    const lastTs = cert.lastCheckedAt ? new Date(cert.lastCheckedAt).getTime() : 0;
    return !lastTs || Number.isNaN(lastTs) || now - lastTs >= intervalMs;
  });

  let failedCount = 0;
  let alertsSent = 0;

  const updatedItems = await runWithConcurrency(due, BULK_CHECK_CONCURRENCY, async (cert) => {
    return performSingleCertificateCheck(cert, forceAll ? 'manual_bulk' : 'daily_scheduler');
  });

  for (const cert of updatedItems) {
    if (cert.status === 'check_failed') failedCount++;

    const days = computeDaysRemaining(cert.validTo);
    const thresholds = Array.isArray(cert.alertDays) && cert.alertDays.length > 0 ? cert.alertDays : [30, 14, 7, 3, 1, 0];
    const matchedThreshold =
      days !== null ? thresholds.sort((a, b) => a - b).find((d) => days <= d) : undefined;

    if (matchedThreshold !== undefined || cert.status === 'check_failed') {
      const cacheKey = `${cert.id}:${todayStr}:${matchedThreshold ?? 'failed'}`;
      if (!sslInboxNotifiedCache.has(cacheKey)) {
        sslInboxNotifiedCache.add(cacheKey);
        const severity =
          cert.status === 'expired' || cert.status === 'critical' || cert.status === 'check_failed'
            ? 'critical'
            : 'warning';
        emitSystemNotification({
          category: 'system_alert',
          severity,
          senderName: 'SSL/TLS Certificate Monitor',
          senderRole: 'Security Scheduler',
          title:
            cert.status === 'check_failed'
              ? `خطا در بررسی گواهینامه SSL: ${cert.title}`
              : days !== null && days < 0
              ? `انقضای گواهینامه SSL: ${cert.title}`
              : `هشدار انقضای گواهینامه SSL (${days} روز): ${cert.title}`,
          titleEn:
            cert.status === 'check_failed'
              ? `SSL Certificate Check Failed: ${cert.title}`
              : days !== null && days < 0
              ? `SSL Certificate Expired: ${cert.title}`
              : `SSL Certificate Expiring in ${days} Day(s): ${cert.title}`,
          body:
            cert.status === 'check_failed'
              ? `بررسی گواهینامه «${cert.title}» (${cert.domain || cert.subjectCN || '-'}) با خطا مواجه شد: ${cert.lastCheckError || 'خطای اتصال'}`
              : `گواهینامه SSL «${cert.title}» (${cert.domain || cert.subjectCN || '-'}) ${
                  days !== null && days < 0 ? `${Math.abs(days)} روز پیش منقضی شده است` : `تنها ${days} روز تا انقضا فاصله دارد`
                }.`,
          bodyEn:
            cert.status === 'check_failed'
              ? `SSL check for "${cert.title}" (${cert.domain || cert.subjectCN || '-'}) failed: ${cert.lastCheckError || 'Connection error'}`
              : `SSL certificate "${cert.title}" (${cert.domain || cert.subjectCN || '-'}) ${
                  days !== null && days < 0 ? `expired ${Math.abs(days)} day(s) ago` : `has ${days} day(s) remaining`
                }.`,
          linkedEntityType: 'ssl_certificate',
          linkedEntityId: cert.id,
          linkedEntityName: cert.title,
          actionTab: 'ssl-certificates',
        }).catch(() => {});
      }

      if (matchedThreshold !== undefined && cert.lastAlertSentDay !== matchedThreshold) {
        const mailRes = await sendSslAlertEmail(cert);
        if (mailRes.success) {
          alertsSent++;
          cert.lastAlertSentDay = matchedThreshold;
          cert.lastAlertSentAt = new Date().toISOString();
          await upsertSslCertificateInDb(cert);
          await addPortalAuditLog({
            category: 'ssl_certificates',
            action: 'SSL_CERT_EXPIRY_ALERT_SENT',
            title: `ارسال خودکار هشدار انقضای SSL: ${cert.title}`,
            title_en: `Dispatched automated SSL expiry alert: ${cert.title}`,
            user_name: 'ssl_scheduler',
            user_role: 'System Scheduler',
            client_ip: '127.0.0.1',
            target_type: 'ssl_certificate',
            target_id: cert.id,
            target_name: cert.title,
            severity: days !== null && days <= 7 ? 'critical' : 'warning',
            status: 'success',
            details: `هشدار آستانه ${matchedThreshold} روز برای ${cert.domain || cert.subjectCN || cert.title} (${days} روز باقی‌مانده) ارسال شد.`,
            details_en: `Sent ${matchedThreshold}-day threshold alert for ${cert.domain || cert.subjectCN || cert.title} (${days} days remaining).`,
          });
        }
      }
    }
  }

  return { checkedCount: updatedItems.length, failedCount, alertsSent };
}

export function startSslCertificateCronDaemon(): void {
  console.log('[SSL Monitor Scheduler] Initializing daily SSL/TLS certificate expiration check daemon...');
  setTimeout(async () => {
    try {
      const res = await runScheduledSslCertificateChecks(false);
      if (res.checkedCount > 0) {
        console.log(
          `[SSL Monitor Scheduler] Startup scan checked ${res.checkedCount} certificate(s) (${res.failedCount} failed, ${res.alertsSent} alerts).`
        );
      }
    } catch (err: any) {
      console.error('[SSL Monitor Scheduler] Startup scan error:', err?.message || err);
    }
  }, 45000);

  // Check hourly for certificates whose daily (or custom checkIntervalHours) check is due
  setInterval(async () => {
    try {
      const res = await runScheduledSslCertificateChecks(false);
      if (res.checkedCount > 0) {
        console.log(
          `[SSL Monitor Scheduler] Scheduled scan checked ${res.checkedCount} certificate(s) (${res.failedCount} failed, ${res.alertsSent} alerts).`
        );
      }
    } catch (err: any) {
      console.error('[SSL Monitor Scheduler] Scheduled scan error:', err?.message || err);
    }
  }, 60 * 60 * 1000);
}

// =========================================================================
// REST API Endpoints (/api/ssl-certificates/*)
// =========================================================================

// GET /api/ssl-certificates
sslCertificateRouter.get('/ssl-certificates', async (req: Request, res: Response) => {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  const isSuper = Boolean(auth.isSuperAdmin);
  if (!canViewSsl(auth.policy, isSuper)) {
    return res.status(403).json({
      success: false,
      error: 'Access denied: You do not have permission to view SSL/TLS certificates (canViewSslCertificates).',
    });
  }

  const rawList = (await getSslCertificatesFromDb()) as SslCertificateItem[];
  let certificates = rawList.map(hydrateSslRecord);

  if (!isSuper && auth.policy?.targetSslScope === 'specific') {
    const allowedIds = Array.isArray(auth.policy.targetSslIds) ? auth.policy.targetSslIds : [];
    certificates = certificates.filter((c) => allowedIds.includes(c.id));
  }

  // Sort by urgency: expired/check_failed/critical first, then nearest expiry
  certificates.sort((a, b) => {
    const da = a.daysRemaining ?? 99999;
    const db = b.daysRemaining ?? 99999;
    return da - db;
  });

  res.json({
    success: true,
    certificates,
    total: certificates.length,
    summary: buildSummary(certificates),
  });
});

// POST /api/ssl-certificates/probe (live TLS handshake or PEM parse preview before saving)
sslCertificateRouter.post('/ssl-certificates/probe', async (req: Request, res: Response) => {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  const isSuper = Boolean(auth.isSuperAdmin);
  if (!canAddSsl(auth.policy, isSuper) && !canCheckSsl(null, auth.policy, isSuper)) {
    return res.status(403).json({
      success: false,
      error: 'Access denied: Insufficient permissions to probe SSL/TLS certificates.',
    });
  }

  const sourceType: SslCertificateSourceType =
    req.body?.sourceType === 'manual_pem' ? 'manual_pem' : 'domain';

  const result =
    sourceType === 'manual_pem'
      ? parsePemCertificate(String(req.body?.pemCertificate || ''))
      : await probeDomainTls(String(req.body?.domain || ''), req.body?.port, req.body?.sniHost);

  return res.status(result.success ? 200 : 400).json(result);
});

// POST /api/ssl-certificates (create new SSL certificate or domain monitor)
sslCertificateRouter.post('/ssl-certificates', async (req: Request, res: Response) => {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  const isSuper = Boolean(auth.isSuperAdmin);
  if (!canAddSsl(auth.policy, isSuper)) {
    await addPortalAuditLog({
      category: 'ssl_certificates',
      action: 'SSL_CERT_CREATE_DENIED',
      title: 'تلاش غیرمجاز برای افزودن گواهینامه SSL',
      title_en: 'Unauthorized attempt to add SSL certificate',
      user_name: auth.user?.username,
      user_role: auth.user?.role,
      client_ip: getClientIp(req),
      target_type: 'ssl_certificate',
      target_name: String(req.body?.title || req.body?.domain || 'Unknown'),
      severity: 'warning',
      status: 'denied',
      details: 'کاربر فاقد مجوز canAddSslCertificates است.',
      details_en: 'User lacks canAddSslCertificates permission.',
    });
    return res.status(403).json({
      success: false,
      error: 'Access denied: You do not have permission to add SSL certificates (canAddSslCertificates).',
    });
  }

  const body = req.body || {};
  const sourceType: SslCertificateSourceType =
    body.sourceType === 'manual_pem' ? 'manual_pem' : 'domain';

  let domain: string | undefined;
  let port = 443;
  let sniHost: string | undefined;

  if (sourceType === 'domain') {
    const norm = normalizeDomainInput(String(body.domain || ''), body.port);
    if (norm.error || !norm.host) {
      return res.status(400).json({ success: false, error: norm.error || 'Valid domain or host is required.' });
    }
    domain = norm.host;
    port = norm.port;
    if (body.sniHost && String(body.sniHost).trim()) {
      const normSni = normalizeDomainInput(String(body.sniHost).trim());
      if (normSni.error) {
        return res.status(400).json({ success: false, error: `Invalid SNI host: ${normSni.error}` });
      }
      sniHost = normSni.host;
    }
  } else if (body.pemCertificate && String(body.pemCertificate).trim()) {
    const parsedCheck = parsePemCertificate(String(body.pemCertificate));
    if (!parsedCheck.success) {
      return res.status(400).json({ success: false, error: parsedCheck.error });
    }
  } else if (!body.validTo) {
    return res.status(400).json({
      success: false,
      error: 'Provide either a public PEM certificate or an explicit expiration date (validTo).',
    });
  }

  const title = String(body.title || domain || body.subjectCN || '').trim();
  if (!title) {
    return res.status(400).json({ success: false, error: 'Certificate title or domain is required.' });
  }

  const nowIso = new Date().toISOString();
  const newId = `ssl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const isActive = body.isActive !== false;
  const autoCheckEnabled = body.autoCheckEnabled !== undefined ? Boolean(body.autoCheckEnabled) : true;
  const checkIntervalHours = Math.max(1, Math.min(720, Number(body.checkIntervalHours) || 24));
  const alertDays =
    Array.isArray(body.alertDays) && body.alertDays.length > 0
      ? body.alertDays.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n) && n >= 0)
      : [60, 30, 14, 7, 3, 1, 0];
  const notifyEmails = Array.isArray(body.notifyEmails)
    ? body.notifyEmails.map((e: any) => String(e).trim()).filter(Boolean)
    : [];

  let record: SslCertificateItem = {
    id: newId,
    title,
    sourceType,
    domain,
    port: sourceType === 'domain' ? port : undefined,
    sniHost,
    environment: body.environment || 'production',
    ownerName: String(body.ownerName || auth.user?.fullName || auth.user?.username || '').trim(),
    ownerEmail: body.ownerEmail ? String(body.ownerEmail).trim() : '',
    department: body.department ? String(body.department).trim() : '',
    isActive,
    autoCheckEnabled,
    checkIntervalHours,
    alertDays,
    notifyEmails,
    notes: body.notes ? String(body.notes).trim() : '',
    pemCertificate: body.pemCertificate ? String(body.pemCertificate).trim() : undefined,
    validFrom: body.validFrom || undefined,
    validTo: body.validTo || undefined,
    subjectCN: body.subjectCN ? String(body.subjectCN).trim() : undefined,
    issuerCN: body.issuerCN ? String(body.issuerCN).trim() : undefined,
    status: computeSslStatus(body.validTo, isActive, null),
    daysRemaining: computeDaysRemaining(body.validTo),
    checkHistory: [],
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: auth.user?.username || 'system',
    updatedBy: auth.user?.username || 'system',
  };

  // Run real check immediately on creation (unless explicitly skipped)
  if (body.runInitialCheck !== false) {
    record = await performSingleCertificateCheck(record, `created_by:${auth.user?.username || 'user'}`);
  } else {
    await upsertSslCertificateInDb(record);
  }

  await addPortalAuditLog({
    category: 'ssl_certificates',
    action: 'SSL_CERT_CREATE',
    title: `ثبت گواهینامه SSL جدید: ${record.title}`,
    title_en: `Created SSL certificate monitor: ${record.title}`,
    user_name: auth.user?.username,
    user_role: auth.user?.role,
    client_ip: getClientIp(req),
    target_type: 'ssl_certificate',
    target_id: record.id,
    target_name: record.title,
    severity: 'info',
    status: 'success',
    details:
      record.sourceType === 'domain'
        ? `افزودن دامنه ${record.domain}:${record.port} (وضعیت: ${record.status} | روز باقی‌مانده: ${record.daysRemaining ?? 'نامشخص'})`
        : `ثبت گواهینامه PEM دستی (${record.subjectCN || record.title} | انقضا: ${record.validTo || 'نامشخص'})`,
    details_en:
      record.sourceType === 'domain'
        ? `Added domain ${record.domain}:${record.port} (status: ${record.status}, days remaining: ${record.daysRemaining ?? 'N/A'})`
        : `Added manual PEM certificate (${record.subjectCN || record.title}, expires: ${record.validTo || 'N/A'})`,
  });

  res.status(201).json({ success: true, certificate: record });
});

// PUT /api/ssl-certificates/:id
sslCertificateRouter.put('/ssl-certificates/:id', async (req: Request, res: Response) => {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  const { id } = req.params;
  const isSuper = Boolean(auth.isSuperAdmin);
  if (!canEditSsl(id, auth.policy, isSuper)) {
    await addPortalAuditLog({
      category: 'ssl_certificates',
      action: 'SSL_CERT_UPDATE_DENIED',
      title: `تلاش غیرمجاز برای ویرایش گواهینامه SSL (${id})`,
      title_en: `Unauthorized attempt to update SSL certificate (${id})`,
      user_name: auth.user?.username,
      user_role: auth.user?.role,
      client_ip: getClientIp(req),
      target_type: 'ssl_certificate',
      target_id: id,
      target_name: id,
      severity: 'warning',
      status: 'denied',
      details: 'کاربر فاقد مجوز ویرایش یا دسترسی به این آیتم SSL است.',
      details_en: 'User lacks edit or item-scope permission for this SSL certificate.',
    });
    return res.status(403).json({
      success: false,
      error: 'Access denied: You do not have permission to edit this SSL certificate (canEditSslCertificates).',
    });
  }

  const existing = (await getSslCertificateByIdFromDb(id)) as SslCertificateItem | null;
  if (!existing) {
    return res.status(404).json({ success: false, error: 'SSL certificate not found.' });
  }

  const body = req.body || {};
  const nextSourceType: SslCertificateSourceType =
    body.sourceType === 'manual_pem'
      ? 'manual_pem'
      : body.sourceType === 'domain'
      ? 'domain'
      : existing.sourceType;

  let domain = existing.domain;
  let port = existing.port || 443;
  let sniHost = existing.sniHost;

  if (nextSourceType === 'domain' && (body.domain !== undefined || body.port !== undefined)) {
    const norm = normalizeDomainInput(String(body.domain ?? existing.domain ?? ''), body.port ?? existing.port ?? 443);
    if (norm.error || !norm.host) {
      return res.status(400).json({ success: false, error: norm.error || 'Invalid domain.' });
    }
    domain = norm.host;
    port = norm.port;
  }
  if (body.sniHost !== undefined) {
    const trimmedSni = String(body.sniHost || '').trim();
    if (!trimmedSni) {
      sniHost = undefined;
    } else {
      const normSni = normalizeDomainInput(trimmedSni);
      if (normSni.error) {
        return res.status(400).json({ success: false, error: `Invalid SNI host: ${normSni.error}` });
      }
      sniHost = normSni.host;
    }
  }
  if (body.pemCertificate !== undefined && String(body.pemCertificate).trim()) {
    const parsedCheck = parsePemCertificate(String(body.pemCertificate));
    if (!parsedCheck.success) {
      return res.status(400).json({ success: false, error: parsedCheck.error });
    }
  }

  const nowIso = new Date().toISOString();
  const isActive = body.isActive !== undefined ? Boolean(body.isActive) : existing.isActive !== false;
  const checkIntervalHours =
    body.checkIntervalHours !== undefined
      ? Math.max(1, Math.min(720, Number(body.checkIntervalHours) || 24))
      : existing.checkIntervalHours || 24;

  let updated: SslCertificateItem = {
    ...existing,
    title: body.title !== undefined ? String(body.title).trim() || existing.title : existing.title,
    sourceType: nextSourceType,
    domain: nextSourceType === 'domain' ? domain : body.domain ?? existing.domain,
    port: nextSourceType === 'domain' ? port : undefined,
    sniHost,
    environment: body.environment !== undefined ? body.environment : existing.environment,
    ownerName: body.ownerName !== undefined ? String(body.ownerName).trim() : existing.ownerName,
    ownerEmail: body.ownerEmail !== undefined ? String(body.ownerEmail).trim() : existing.ownerEmail,
    department: body.department !== undefined ? String(body.department).trim() : existing.department,
    isActive,
    autoCheckEnabled: body.autoCheckEnabled !== undefined ? Boolean(body.autoCheckEnabled) : existing.autoCheckEnabled,
    checkIntervalHours,
    alertDays: Array.isArray(body.alertDays)
      ? body.alertDays.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n) && n >= 0)
      : existing.alertDays,
    notifyEmails: Array.isArray(body.notifyEmails)
      ? body.notifyEmails.map((e: any) => String(e).trim()).filter(Boolean)
      : existing.notifyEmails,
    notes: body.notes !== undefined ? String(body.notes).trim() : existing.notes,
    pemCertificate:
      body.pemCertificate !== undefined
        ? String(body.pemCertificate).trim() || undefined
        : existing.pemCertificate,
    validFrom: body.validFrom !== undefined ? body.validFrom : existing.validFrom,
    validTo: body.validTo !== undefined ? body.validTo : existing.validTo,
    subjectCN: body.subjectCN !== undefined ? String(body.subjectCN).trim() : existing.subjectCN,
    issuerCN: body.issuerCN !== undefined ? String(body.issuerCN).trim() : existing.issuerCN,
    updatedAt: nowIso,
    updatedBy: auth.user?.username || 'system',
  };

  if (body.recheckAfterSave) {
    updated = await performSingleCertificateCheck(updated, `updated_by:${auth.user?.username || 'user'}`);
  } else {
    updated = hydrateSslRecord(updated);
    await upsertSslCertificateInDb(updated);
  }

  const isToggleOnly = Object.keys(body).length === 1 && body.isActive !== undefined;
  await addPortalAuditLog({
    category: 'ssl_certificates',
    action: isToggleOnly ? 'SSL_CERT_TOGGLE_ACTIVE' : 'SSL_CERT_UPDATE',
    title: isToggleOnly
      ? `${updated.isActive ? 'فعال‌سازی' : 'غیرفعال‌سازی'} پایش SSL: ${updated.title}`
      : `ویرایش گواهینامه SSL: ${updated.title}`,
    title_en: isToggleOnly
      ? `${updated.isActive ? 'Activated' : 'Deactivated'} SSL monitor: ${updated.title}`
      : `Updated SSL certificate monitor: ${updated.title}`,
    user_name: auth.user?.username,
    user_role: auth.user?.role,
    client_ip: getClientIp(req),
    target_type: 'ssl_certificate',
    target_id: updated.id,
    target_name: updated.title,
    severity: 'info',
    status: 'success',
    details: `به‌روزرسانی تنظیمات گواهینامه ${updated.domain || updated.subjectCN || updated.title} (وضعیت: ${updated.status})`,
    details_en: `Updated certificate ${updated.domain || updated.subjectCN || updated.title} (status: ${updated.status})`,
  });

  res.json({ success: true, certificate: updated });
});

// DELETE /api/ssl-certificates/:id
sslCertificateRouter.delete('/ssl-certificates/:id', async (req: Request, res: Response) => {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  const { id } = req.params;
  const isSuper = Boolean(auth.isSuperAdmin);
  if (!canDeleteSsl(id, auth.policy, isSuper)) {
    await addPortalAuditLog({
      category: 'ssl_certificates',
      action: 'SSL_CERT_DELETE_DENIED',
      title: `تلاش غیرمجاز برای حذف گواهینامه SSL (${id})`,
      title_en: `Unauthorized attempt to delete SSL certificate (${id})`,
      user_name: auth.user?.username,
      user_role: auth.user?.role,
      client_ip: getClientIp(req),
      target_type: 'ssl_certificate',
      target_id: id,
      target_name: id,
      severity: 'warning',
      status: 'denied',
      details: 'کاربر فاقد مجوز canDeleteSslCertificates یا دسترسی به این آیتم است.',
      details_en: 'User lacks canDeleteSslCertificates or item-scope permission.',
    });
    return res.status(403).json({
      success: false,
      error: 'Access denied: You do not have permission to delete this SSL certificate (canDeleteSslCertificates).',
    });
  }

  const existing = (await getSslCertificateByIdFromDb(id)) as SslCertificateItem | null;
  if (!existing) {
    return res.status(404).json({ success: false, error: 'SSL certificate not found.' });
  }

  await deleteSslCertificateFromDb(id);

  await addPortalAuditLog({
    category: 'ssl_certificates',
    action: 'SSL_CERT_DELETE',
    title: `حذف گواهینامه SSL: ${existing.title}`,
    title_en: `Deleted SSL certificate monitor: ${existing.title}`,
    user_name: auth.user?.username,
    user_role: auth.user?.role,
    client_ip: getClientIp(req),
    target_type: 'ssl_certificate',
    target_id: existing.id,
    target_name: existing.title,
    severity: 'warning',
    status: 'success',
    details: `حذف گواهینامه ${existing.domain || existing.subjectCN || existing.title} از لیست پایش SSL`,
    details_en: `Removed SSL certificate ${existing.domain || existing.subjectCN || existing.title} from SSL monitoring inventory`,
  });

  res.json({ success: true, deletedId: id });
});

// POST /api/ssl-certificates/:id/check (live single certificate check)
sslCertificateRouter.post('/ssl-certificates/:id/check', async (req: Request, res: Response) => {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  const { id } = req.params;
  const isSuper = Boolean(auth.isSuperAdmin);
  if (!canCheckSsl(id, auth.policy, isSuper)) {
    return res.status(403).json({
      success: false,
      error: 'Access denied: You do not have permission to run SSL checks on this item (canCheckSslCertificates).',
    });
  }

  const existing = (await getSslCertificateByIdFromDb(id)) as SslCertificateItem | null;
  if (!existing) {
    return res.status(404).json({ success: false, error: 'SSL certificate not found.' });
  }

  const updated = await performSingleCertificateCheck(existing, `user:${auth.user?.username || 'user'}`);

  await addPortalAuditLog({
    category: 'ssl_certificates',
    action: 'SSL_CERT_CHECK',
    title: `بررسی زنده گواهینامه SSL: ${updated.title}`,
    title_en: `Ran live SSL certificate check: ${updated.title}`,
    user_name: auth.user?.username,
    user_role: auth.user?.role,
    client_ip: getClientIp(req),
    target_type: 'ssl_certificate',
    target_id: updated.id,
    target_name: updated.title,
    severity: updated.status === 'check_failed' || updated.status === 'expired' ? 'warning' : 'info',
    status: updated.status === 'check_failed' ? 'failed' : 'success',
    details: updated.lastCheckError
      ? `بررسی ${updated.domain || updated.title} ناموفق بود: ${updated.lastCheckError}`
      : `بررسی ${updated.domain || updated.subjectCN || updated.title} انجام شد — وضعیت: ${updated.status}، باقی‌مانده: ${updated.daysRemaining ?? '-'} روز`,
    details_en: updated.lastCheckError
      ? `Live check for ${updated.domain || updated.title} failed: ${updated.lastCheckError}`
      : `Live check for ${updated.domain || updated.subjectCN || updated.title} completed — status: ${updated.status}, remaining: ${updated.daysRemaining ?? '-'} days`,
  });

  res.json({ success: true, certificate: updated });
});

// POST /api/ssl-certificates/check-all (concurrent bulk live check of all authorized active SSL items)
sslCertificateRouter.post('/ssl-certificates/check-all', async (req: Request, res: Response) => {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  const isSuper = Boolean(auth.isSuperAdmin);
  if (!canCheckSsl(null, auth.policy, isSuper)) {
    return res.status(403).json({
      success: false,
      error: 'Access denied: You do not have permission to trigger bulk SSL checks (canCheckSslCertificates).',
    });
  }

  const all = (await getSslCertificatesFromDb()) as SslCertificateItem[];
  const authorized = all.filter((c) => isItemInPolicyScope(c.id, auth.policy, isSuper));
  const activeTargets = authorized.filter((c) => c.isActive !== false);

  const checked = await runWithConcurrency(activeTargets, BULK_CHECK_CONCURRENCY, async (cert) => {
    return performSingleCertificateCheck(cert, `bulk:${auth.user?.username || 'user'}`);
  });

  const failedCount = checked.filter((c) => c.status === 'check_failed').length;
  const expiringOrExpired = checked.filter(
    (c) => c.status === 'expired' || c.status === 'critical' || c.status === 'expiring_soon'
  ).length;

  await addPortalAuditLog({
    category: 'ssl_certificates',
    action: 'SSL_CERT_BULK_CHECK',
    title: `بررسی گروهی تمامی گواهینامه‌های SSL (${checked.length} مورد)`,
    title_en: `Ran bulk live SSL check across ${checked.length} certificate(s)`,
    user_name: auth.user?.username,
    user_role: auth.user?.role,
    client_ip: getClientIp(req),
    target_type: 'ssl_certificate',
    target_name: 'SSL Certificates Fleet',
    severity: failedCount > 0 || expiringOrExpired > 0 ? 'warning' : 'info',
    status: 'success',
    details: `بررسی همزمان ${checked.length} گواهینامه فعال انجام شد (${expiringOrExpired} مورد در آستانه/منقضی، ${failedCount} خطای اتصال).`,
    details_en: `Checked ${checked.length} active certificate(s) (${expiringOrExpired} expiring/expired, ${failedCount} check failures).`,
  });

  // Reload full authorized list with fresh state
  const refreshedAll = ((await getSslCertificatesFromDb()) as SslCertificateItem[])
    .map(hydrateSslRecord)
    .filter((c) => isItemInPolicyScope(c.id, auth.policy, isSuper))
    .sort((a, b) => (a.daysRemaining ?? 99999) - (b.daysRemaining ?? 99999));

  res.json({
    success: true,
    checkedCount: checked.length,
    failedCount,
    expiringOrExpired,
    certificates: refreshedAll,
    summary: buildSummary(refreshedAll),
  });
});

// POST /api/ssl-certificates/:id/test-alert
sslCertificateRouter.post('/ssl-certificates/:id/test-alert', async (req: Request, res: Response) => {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }
  const { id } = req.params;
  const isSuper = Boolean(auth.isSuperAdmin);
  if (!canCheckSsl(id, auth.policy, isSuper)) {
    return res.status(403).json({
      success: false,
      error: 'Access denied: Insufficient permissions to dispatch SSL test alerts.',
    });
  }

  const existing = (await getSslCertificateByIdFromDb(id)) as SslCertificateItem | null;
  if (!existing) {
    return res.status(404).json({ success: false, error: 'SSL certificate not found.' });
  }

  const targetEmail = req.body?.targetEmail ? String(req.body.targetEmail).trim() : undefined;
  const result = await sendSslAlertEmail(existing, { targetEmail, isTest: true });

  await addPortalAuditLog({
    category: 'ssl_certificates',
    action: 'SSL_CERT_TEST_ALERT',
    title: `ارسال ایمیل تست هشدار SSL: ${existing.title}`,
    title_en: `Dispatched SSL test alert email: ${existing.title}`,
    user_name: auth.user?.username,
    user_role: auth.user?.role,
    client_ip: getClientIp(req),
    target_type: 'ssl_certificate',
    target_id: existing.id,
    target_name: existing.title,
    severity: result.success ? 'info' : 'warning',
    status: result.success ? 'success' : 'failed',
    details: result.success
      ? `ایمیل تست با موفقیت به ${targetEmail || (existing.notifyEmails || []).join(', ') || existing.ownerEmail} ارسال شد.`
      : `خطا در ارسال ایمیل تست: ${result.error}`,
    details_en: result.success
      ? `Test email sent successfully to ${targetEmail || (existing.notifyEmails || []).join(', ') || existing.ownerEmail}.`
      : `Failed to send test alert email: ${result.error}`,
  });

  if (!result.success) {
    return res.status(500).json({ success: false, error: result.error });
  }
  res.json({ success: true, messageId: result.messageId });
});
