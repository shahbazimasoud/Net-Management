import type { Express, Request, Response } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

export interface ConvertedOutputItem {
  id: string;
  format: string;
  filename: string;
  mimeType: string;
  isBinary: boolean;
  text?: string;
  base64?: string;
  descriptionEn: string;
  descriptionFa: string;
  targetPlatforms: string[];
  sizeBytes: number;
}

export interface CertInfoMetadata {
  subject: string;
  commonName: string;
  issuer: string;
  issuerOrg: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number | null;
  isExpired: boolean;
  serialNumber: string;
  sha256Fingerprint: string;
  sha1Fingerprint: string;
  keyType: string;
  keyBits: number | null;
  sans: string[];
}

export interface KeyMatchResult {
  checked: boolean;
  matches: boolean;
  certModulusHash?: string;
  keyModulusHash?: string;
  messageEn?: string;
  messageFa?: string;
}

export interface ExtractedPemsResult {
  certPem: string;
  keyPem: string;
  caBundlePem: string;
  isCombinedFound: boolean;
  notes: string[];
}

/**
 * Normalizes PEM strings, removes Unicode dashes, strips BOM, fixes line endings,
 * and smartly extracts certificates, private keys, and CA bundles from single or combined inputs.
 */
export function normalizeAndExtractPems(
  certInput?: string,
  keyInput?: string,
  caInput?: string
): ExtractedPemsResult {
  const notes: string[] = [];

  function cleanString(str: any): string {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-') // Normalize all Unicode dashes to ASCII -
      .replace(/^\uFEFF/, '') // Strip UTF-8 BOM
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
  }

  function extractCertBlocks(str: string): string[] {
    const certs: string[] = [];
    if (!str) return certs;

    // Matches any certificate block variation: CERTIFICATE, SERVER CERTIFICATE, SSL CERTIFICATE,
    // X509 CERTIFICATE, X.509 CERTIFICATE, TRUSTED CERTIFICATE, PKCS7, etc.
    // Handles arbitrary dashes, tildes, spaces, and does not mandate newlines before/after headers.
    const certRegex = /[-~=_\s]*BEGIN\s+([A-Za-z0-9 ._/#-]*(?:CERTIFICATE|PKCS\s*#?\s*7|PKCS7|X509))[-~=_\s]*[\r\n\s]*([\s\S]*?)[\r\n\s]*[-~=_\s]*END\s+[A-Za-z0-9 ._/#-]*(?:CERTIFICATE|PKCS\s*#?\s*7|PKCS7|X509)[-~=_\s]*/gi;
    let match: RegExpExecArray | null;
    while ((match = certRegex.exec(str)) !== null) {
      const tag = match[1].trim().toUpperCase();
      const b64 = match[2].replace(/[^A-Za-z0-9+/=]/g, '');
      if (b64.length > 40) {
        const chunked = b64.match(/.{1,64}/g)?.join('\n') || b64;

        // If it is a PKCS#7 / P7B bundle, unpack individual certificates inside it
        if (tag.includes('PKCS')) {
          try {
            const tmpFile = path.join(os.tmpdir(), `ssl-p7-${Date.now()}-${Math.random().toString(36).slice(2)}.pem`);
            fs.writeFileSync(tmpFile, `-----BEGIN PKCS7-----\n${chunked}\n-----END PKCS7-----`, 'utf8');
            const p7out = execSync(`openssl pkcs7 -print_certs -in "${tmpFile}" 2>/dev/null`).toString();
            try { fs.unlinkSync(tmpFile); } catch {}
            const unpacked = extractCertBlocks(p7out);
            if (unpacked.length > 0) {
              certs.push(...unpacked);
              notes.push(`Unpacked ${unpacked.length} certificate(s) from PKCS#7 bundle.`);
              continue;
            }
          } catch {}
        }

        certs.push(`-----BEGIN CERTIFICATE-----\n${chunked}\n-----END CERTIFICATE-----`);
      }
    }
    return certs;
  }

  function extractKeyBlocks(str: string): string[] {
    const keys: string[] = [];
    if (!str) return keys;
    // Matches any private key block: RSA PRIVATE KEY, EC PRIVATE KEY, OPENSSH PRIVATE KEY, ENCRYPTED, etc.
    const keyRegex = /[-~=_\s]*BEGIN\s+([A-Za-z0-9 ._/#-]*PRIVATE\s+KEY)[-~=_\s]*[\r\n\s]*([\s\S]*?)[\r\n\s]*[-~=_\s]*END\s+[A-Za-z0-9 ._/#-]*PRIVATE\s+KEY[-~=_\s]*/gi;
    let match: RegExpExecArray | null;
    while ((match = keyRegex.exec(str)) !== null) {
      let header = match[1].trim().toUpperCase();
      if (!header.includes('KEY')) header = `${header} PRIVATE KEY`;
      const b64 = match[2].replace(/[^A-Za-z0-9+/=]/g, '');
      if (b64.length > 40) {
        const chunked = b64.match(/.{1,64}/g)?.join('\n') || b64;
        keys.push(`-----BEGIN ${header}-----\n${chunked}\n-----END ${header}-----`);
      }
    }
    return keys;
  }

  function tryParseRawDerOrBase64(str: string): string[] {
    if (!str) return [];
    const certs: string[] = [];

    // Strip private keys so their base64 doesn't interfere
    const textWithoutKeys = str.replace(/[-~=_\s]*BEGIN\s+[A-Za-z0-9 ._/#-]*PRIVATE\s+KEY[\s\S]*?END\s+[A-Za-z0-9 ._/#-]*PRIVATE\s+KEY[-~=_\s]*/gi, '');

    // Look for MII-prefixed base64 streams (all X.509 ASN.1 sequences > 256 bytes encode to MII in base64)
    const strippedWhitespace = textWithoutKeys.replace(/[\r\n\s]/g, '');
    const miiRegex = /(MII[A-Za-z0-9+/=]{80,})/g;
    let m: RegExpExecArray | null;
    while ((m = miiRegex.exec(strippedWhitespace)) !== null) {
      const candidate = m[1];
      try {
        const buf = Buffer.from(candidate, 'base64');
        if (buf.length > 80 && buf[0] === 0x30) {
          const chunked = candidate.match(/.{1,64}/g)?.join('\n') || candidate;
          certs.push(`-----BEGIN CERTIFICATE-----\n${chunked}\n-----END CERTIFICATE-----`);
        }
      } catch {}
    }

    if (certs.length > 0) return certs;

    // Filter out standard metadata lines (Bag Attributes, subject=, etc.) and inspect raw base64
    const lines = textWithoutKeys.split('\n');
    const filtered = lines.filter((l) => {
      const trimmed = l.trim();
      if (!trimmed) return false;
      if (
        trimmed.startsWith('Bag Attributes') ||
        trimmed.startsWith('subject=') ||
        trimmed.startsWith('issuer=') ||
        trimmed.startsWith('Certificate:') ||
        trimmed.startsWith('Data:')
      )
        return false;
      if (/^[-~=_ ]*(BEGIN|END)[-~=_ ]*/i.test(trimmed)) return false;
      return true;
    });

    const cleanB64 = filtered.join('').replace(/[^A-Za-z0-9+/=]/g, '');
    if (cleanB64.length > 80) {
      try {
        const buf = Buffer.from(cleanB64, 'base64');
        if (buf.length > 50 && buf[0] === 0x30) {
          const chunked = cleanB64.match(/.{1,64}/g)?.join('\n') || cleanB64;
          certs.push(`-----BEGIN CERTIFICATE-----\n${chunked}\n-----END CERTIFICATE-----`);
        }
      } catch {}
    }

    return certs;
  }

  function extractWithOpenSslCli(rawText: string): string[] {
    if (!rawText || rawText.length < 50) return [];
    try {
      const tmpFile = path.join(os.tmpdir(), `ssl-detect-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
      fs.writeFileSync(tmpFile, rawText, 'utf8');
      try {
        // 1. Try x509 direct load
        const out = execSync(`openssl x509 -in "${tmpFile}" 2>/dev/null`).toString();
        if (out && out.includes('BEGIN CERTIFICATE')) {
          fs.unlinkSync(tmpFile);
          return [out.trim()];
        }
      } catch {}

      try {
        // 2. Try pkcs7 unpack
        const p7out = execSync(`openssl pkcs7 -print_certs -in "${tmpFile}" 2>/dev/null`).toString();
        const matches = p7out.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
        if (matches && matches.length > 0) {
          fs.unlinkSync(tmpFile);
          return matches;
        }
      } catch {}

      try { fs.unlinkSync(tmpFile); } catch {}
    } catch {}
    return [];
  }

  const rawCert = cleanString(certInput);
  const rawKey = cleanString(keyInput);
  const rawCa = cleanString(caInput);

  let foundCerts = extractCertBlocks(rawCert);
  let foundKeys = extractKeyBlocks(rawKey);
  let isCombined = false;

  // Check if rawCert actually contained private key(s)
  const keysInCertField = extractKeyBlocks(rawCert);
  if (keysInCertField.length > 0) {
    isCombined = true;
    notes.push('Found private key inside public certificate input.');
    if (foundKeys.length === 0) {
      foundKeys = keysInCertField;
    }
    // Also remove the keys and retry finding certs in leftover text if foundCerts is empty
    if (foundCerts.length === 0) {
      const textNoKeys = rawCert.replace(
        /[-~=_\s]*BEGIN\s+[A-Za-z0-9 ._/#-]*PRIVATE\s+KEY[\s\S]*?END\s+[A-Za-z0-9 ._/#-]*PRIVATE\s+KEY[-~=_\s]*/gi,
        ''
      );
      foundCerts = extractCertBlocks(textNoKeys);
    }
  }

  // Check if rawKey actually contained certificate(s)
  const certsInKeyField = extractCertBlocks(rawKey);
  if (certsInKeyField.length > 0) {
    notes.push('Found certificate inside private key input.');
    if (foundCerts.length === 0) {
      foundCerts = certsInKeyField;
    }
  }

  // Extract from CA field as well
  const caCerts = extractCertBlocks(rawCa);

  // If no cert found with standard regex headers, try raw base64 or ASN.1 DER stream
  if (foundCerts.length === 0) {
    const rawParsed = tryParseRawDerOrBase64(rawCert);
    if (rawParsed.length > 0) {
      foundCerts.push(...rawParsed);
      notes.push('Reconstructed standard PEM from raw Base64 / ASN.1 stream.');
    }
  }

  // If still no cert found, invoke OpenSSL CLI as authoritative fallback
  if (foundCerts.length === 0) {
    const openSslCerts = extractWithOpenSslCli(rawCert);
    if (openSslCerts.length > 0) {
      foundCerts.push(...openSslCerts);
      notes.push('Extracted certificate via OpenSSL CLI engine.');
    }
  }

  const primaryCert = foundCerts[0] || '';
  const remainingCerts = foundCerts.slice(1);
  const allCaList = [...remainingCerts, ...caCerts];
  const primaryKey = foundKeys[0] || '';

  return {
    certPem: primaryCert,
    keyPem: primaryKey,
    caBundlePem: allCaList.join('\n\n'),
    isCombinedFound: isCombined,
    notes,
  };
}

/**
 * Parses X.509 certificate metadata using Node.js crypto.X509Certificate with automatic OpenSSL CLI fallback
 */
function parseCertificateDetails(certPem: string, fallbackDir?: string): CertInfoMetadata {
  try {
    const x509 = new crypto.X509Certificate(certPem);
    const now = new Date();
    const validToDate = new Date(x509.validTo);
    const validFromDate = new Date(x509.validFrom);
    const diffMs = validToDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const isExpired = daysRemaining <= 0;

    // Extract SANs
    const sans: string[] = [];
    if (x509.subjectAltName) {
      const parts = x509.subjectAltName.split(',').map((p) => p.trim());
      for (const p of parts) {
        if (p.startsWith('DNS:') || p.startsWith('IP Address:')) {
          sans.push(p.replace(/^(DNS:|IP Address:)/, '').trim());
        } else {
          sans.push(p);
        }
      }
    }

    // Extract CN and Issuer Org
    const subject = x509.subject;
    const issuer = x509.issuer;
    const cnMatch = subject.match(/CN=([^,\n/]+)/i);
    const commonName = cnMatch ? cnMatch[1].trim() : subject;
    const orgMatch = issuer.match(/O=([^,\n/]+)/i);
    const issuerOrg = orgMatch ? orgMatch[1].trim() : issuer;

    // Key details
    const keyDetails = x509.publicKey.asymmetricKeyDetails;
    const keyType = x509.publicKey.asymmetricKeyType?.toUpperCase() || 'RSA';
    const keyBits = keyDetails?.modulusLength || 2048;

    return {
      subject,
      commonName,
      issuer,
      issuerOrg,
      validFrom: validFromDate.toISOString().replace('T', ' ').substring(0, 19),
      validTo: validToDate.toISOString().replace('T', ' ').substring(0, 19),
      daysRemaining: isExpired ? 0 : daysRemaining,
      isExpired,
      serialNumber: x509.serialNumber,
      sha256Fingerprint: x509.fingerprint256,
      sha1Fingerprint: x509.fingerprint,
      keyType,
      keyBits,
      sans,
    };
  } catch (nodeErr: any) {
    // Resilient fallback using standard OpenSSL CLI
    let tempDirCreated = false;
    let dir = fallbackDir;
    if (!dir) {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssl-parse-'));
      tempDirCreated = true;
    }

    try {
      const certFile = path.join(dir, 'fallback_cert.pem');
      fs.writeFileSync(certFile, certPem, 'utf8');

      const subjectRaw = execSync(`openssl x509 -in "${certFile}" -noout -subject 2>/dev/null`).toString().trim();
      const issuerRaw = execSync(`openssl x509 -in "${certFile}" -noout -issuer 2>/dev/null`).toString().trim();
      const datesRaw = execSync(`openssl x509 -in "${certFile}" -noout -dates 2>/dev/null`).toString().trim();
      const serialRaw = execSync(`openssl x509 -in "${certFile}" -noout -serial 2>/dev/null`).toString().trim();
      const fp256Raw = execSync(`openssl x509 -in "${certFile}" -noout -fingerprint -sha256 2>/dev/null`).toString().trim();
      const fp1Raw = execSync(`openssl x509 -in "${certFile}" -noout -fingerprint -sha1 2>/dev/null`).toString().trim();
      const textRaw = execSync(`openssl x509 -in "${certFile}" -noout -text 2>/dev/null`).toString();

      const subject = subjectRaw.replace(/^subject=\s*/i, '');
      const issuer = issuerRaw.replace(/^issuer=\s*/i, '');
      const cnMatch = subject.match(/CN\s*=\s*([^,\n/]+)/i);
      const commonName = cnMatch ? cnMatch[1].trim() : subject;
      const orgMatch = issuer.match(/O\s*=\s*([^,\n/]+)/i);
      const issuerOrg = orgMatch ? orgMatch[1].trim() : issuer;

      const notBeforeMatch = datesRaw.match(/notBefore=(.*)/i);
      const notAfterMatch = datesRaw.match(/notAfter=(.*)/i);
      const validFromDate = notBeforeMatch ? new Date(notBeforeMatch[1].trim()) : new Date();
      const validToDate = notAfterMatch ? new Date(notAfterMatch[1].trim()) : new Date();

      const now = new Date();
      const diffMs = validToDate.getTime() - now.getTime();
      const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      const isExpired = daysRemaining <= 0;

      const serial = serialRaw.replace(/^serial=\s*/i, '');
      const sha256 = fp256Raw.replace(/.*=\s*/i, '');
      const sha1 = fp1Raw.replace(/.*=\s*/i, '');

      // SANs from text
      const sans: string[] = [];
      const sanMatch = textRaw.match(/X509v3 Subject Alternative Name:[^\n]*\n\s*([^\n]+)/i);
      if (sanMatch && sanMatch[1]) {
        const parts = sanMatch[1].split(',').map((s) => s.trim().replace(/^(DNS:|IP Address:)/i, ''));
        sans.push(...parts);
      }

      // Key details from text
      let keyType = 'RSA';
      let keyBits = 2048;
      if (textRaw.includes('Public Key Algorithm: id-ecPublicKey')) {
        keyType = 'EC';
      }
      const bitsMatch = textRaw.match(/Public-Key:\s*\((\d+)\s*bit\)/i);
      if (bitsMatch) {
        keyBits = parseInt(bitsMatch[1], 10);
      }

      return {
        subject,
        commonName,
        issuer,
        issuerOrg,
        validFrom: validFromDate.toISOString().replace('T', ' ').substring(0, 19),
        validTo: validToDate.toISOString().replace('T', ' ').substring(0, 19),
        daysRemaining: isExpired ? 0 : daysRemaining,
        isExpired,
        serialNumber: serial,
        sha256Fingerprint: sha256,
        sha1Fingerprint: sha1,
        keyType,
        keyBits,
        sans,
      };
    } catch (cliErr: any) {
      throw new Error(`Failed to parse certificate syntax: ${nodeErr.message} (OpenSSL: ${cliErr.message})`);
    } finally {
      if (tempDirCreated && dir && fs.existsSync(dir)) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch {}
      }
    }
  }
}

/**
 * Verifies if private key matches public certificate using OpenSSL modulus and public key hashing
 */
function verifyKeyModulusMatch(certPath: string, keyPath: string): KeyMatchResult {
  try {
    // Attempt standard RSA modulus comparison
    let certMod = '';
    let keyMod = '';
    try {
      certMod = execSync(`openssl x509 -noout -modulus -in "${certPath}" 2>/dev/null`).toString().trim();
      keyMod = execSync(`openssl rsa -noout -modulus -in "${keyPath}" 2>/dev/null`).toString().trim();
    } catch {}

    if (!certMod || !keyMod) {
      // Fallback for EC, Ed25519 or PKCS#8 keys using public key SHA-256 hash comparison
      try {
        const certPubHash = execSync(
          `openssl x509 -in "${certPath}" -noout -pubkey | openssl sha256 2>/dev/null`
        )
          .toString()
          .trim();
        const keyPubHash = execSync(
          `openssl pkey -in "${keyPath}" -pubout | openssl sha256 2>/dev/null`
        )
          .toString()
          .trim();

        const matches = certPubHash === keyPubHash && Boolean(certPubHash);
        return {
          checked: true,
          matches,
          certModulusHash: certPubHash.replace(/.*= /, ''),
          keyModulusHash: keyPubHash.replace(/.*= /, ''),
          messageEn: matches
            ? 'Public certificate matches private key (Verified via Public Key Hash).'
            : 'Warning: Private key does NOT match the public certificate!',
          messageFa: matches
            ? 'گواهی عمومی دقیقاً با کلید خصوصی مطابقت دارد (تأییدشده از طریق هش کلید عمومی).'
            : 'هشدار: کلید خصوصی ارائه‌شده با این گواهی عمومی مطابقت ندارد!',
        };
      } catch (pubErr: any) {
        return {
          checked: true,
          matches: false,
          messageEn: `Key verification check could not be completed: ${pubErr.message}`,
          messageFa: `بررسی تطابق کلید با خطا مواجه شد: ${pubErr.message}`,
        };
      }
    }

    const certHash = crypto.createHash('md5').update(certMod).digest('hex');
    const keyHash = crypto.createHash('md5').update(keyMod).digest('hex');
    const matches = certHash === keyHash;

    return {
      checked: true,
      matches,
      certModulusHash: certHash,
      keyModulusHash: keyHash,
      messageEn: matches
        ? 'Public certificate matches private key (Verified via Modulus MD5).'
        : 'Warning: Private key does NOT match the public certificate!',
      messageFa: matches
        ? 'گواهی عمومی دقیقاً با کلید خصوصی مطابقت دارد (تأییدشده با هش ماژولوس MD5).'
        : 'هشدار: کلید خصوصی ارائه‌شده با این گواهی عمومی مطابقت ندارد!',
    };
  } catch (err: any) {
    return {
      checked: true,
      matches: false,
      messageEn: `Key verification check failed: ${err.message}`,
      messageFa: `بررسی تطابق کلید با خطا مواجه شد: ${err.message}`,
    };
  }
}

export function registerCertConverterRoutes(app: Express): void {
  /**
   * Main Conversion API: Converts certificates and keys into all target formats
   */
  app.post('/api/tools/cert-convert', async (req: Request, res: Response) => {
    let tmpDir = '';
    try {
      const { certText, keyText, caBundleText, pfxPassword, friendlyName } = req.body || {};

      // Normalize and extract all components seamlessly
      const extracted = normalizeAndExtractPems(certText, keyText, caBundleText);
      const { certPem, keyPem, caBundlePem, isCombinedFound, notes } = extracted;

      if (!certPem) {
        return res.status(400).json({
          success: false,
          error:
            'Could not find a valid SSL/TLS certificate. Please ensure your input contains a valid certificate text (e.g. -----BEGIN CERTIFICATE-----) or upload a valid certificate file.',
        });
      }

      const pfxPass = pfxPassword !== undefined ? String(pfxPassword) : '';
      const safeAlias = (friendlyName || '').trim();

      // Create isolated temporary workspace
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssl-conv-'));
      const certPath = path.join(tmpDir, 'cert.pem');
      const keyPath = path.join(tmpDir, 'key.pem');
      const caPath = path.join(tmpDir, 'ca.pem');

      fs.writeFileSync(certPath, certPem, 'utf8');

      // Parse metadata with fallback to OpenSSL CLI
      const certInfo = parseCertificateDetails(certPem, tmpDir);
      const safeCn = (certInfo.commonName || 'certificate')
        .replace(/[^a-zA-Z0-9.-]/g, '_')
        .replace(/^\*\_?/, 'wildcard_');
      const alias = safeAlias || certInfo.commonName || 'ssl_cert';

      // Check if CA bundle is available
      const hasCa = Boolean(caBundlePem && caBundlePem.includes('-----BEGIN CERTIFICATE-----'));
      if (hasCa) {
        fs.writeFileSync(caPath, caBundlePem, 'utf8');
      }

      // Check if Private Key is available
      const hasKey = Boolean(keyPem && (keyPem.includes('KEY-----') || keyPem.length > 50));
      if (hasKey) {
        fs.writeFileSync(keyPath, keyPem, 'utf8');
      }

      // Key matching validation
      let keyMatch: KeyMatchResult = { checked: false, matches: false };
      if (hasKey) {
        keyMatch = verifyKeyModulusMatch(certPath, keyPath);
      }

      const outputs: ConvertedOutputItem[] = [];

      // 1. Standard PEM Certificate (.crt / .pem)
      outputs.push({
        id: 'pem_crt',
        format: 'PEM Certificate (.crt)',
        filename: `${safeCn}.crt`,
        mimeType: 'application/x-x509-ca-cert',
        isBinary: false,
        text: certPem,
        descriptionEn: 'Standard Base64 ASCII format with BEGIN/END headers. Default for Nginx, Apache, HAProxy, Linux servers.',
        descriptionFa: 'فرمت استاندارد متنی Base64 با هدرهای استاندارد. مناسب برای وب‌سرورهای Nginx، Apache، HAProxy و سرورهای لینوکس.',
        targetPlatforms: ['Nginx', 'Apache HTTPD', 'HAProxy', 'Linux / Unix', 'cPanel / DirectAdmin'],
        sizeBytes: Buffer.byteLength(certPem, 'utf8'),
      });

      // 2. Binary DER Certificate (.cer / .der)
      try {
        const derBuffer = execSync(`openssl x509 -in "${certPath}" -outform der 2>/dev/null`);
        outputs.push({
          id: 'der_cer',
          format: 'DER Binary Certificate (.cer / .der)',
          filename: `${safeCn}.cer`,
          mimeType: 'application/pkix-cert',
          isBinary: true,
          base64: derBuffer.toString('base64'),
          descriptionEn: 'Raw binary ASN.1 encoded format without text headers. Required by Windows Certificate Manager, Java Keystores, Cisco ASA/ISE, Fortinet.',
          descriptionFa: 'فرمت باینری خام ASN.1 بدون هدرهای متنی. مورد نیاز Windows Certificate Manager، Java Keystores، فایروال‌های Cisco و Fortinet.',
          targetPlatforms: ['Windows Cert Manager', 'Java KeyStore (JKS)', 'Cisco ASA / ISE', 'Fortinet FortiGate'],
          sizeBytes: derBuffer.length,
        });
      } catch (derErr: any) {
        console.warn('[CertConverter] DER generation error:', derErr.message);
      }

      // 3. PKCS#7 / P7B Base64 (.p7b)
      try {
        const p7bCmd = hasCa
          ? `openssl crl2pkcs7 -nocrl -certfile "${certPath}" -certfile "${caPath}" -outform PEM 2>/dev/null`
          : `openssl crl2pkcs7 -nocrl -certfile "${certPath}" -outform PEM 2>/dev/null`;
        const p7bText = execSync(p7bCmd).toString();
        outputs.push({
          id: 'pkcs7_p7b',
          format: 'PKCS#7 Certificate Chain (.p7b)',
          filename: `${safeCn}.p7b`,
          mimeType: 'application/x-pkcs7-certificates',
          isBinary: false,
          text: p7bText,
          descriptionEn: 'Cryptographic Message Syntax standard containing certificate and CA chains without private key. Used by Microsoft IIS, Exchange, Tomcat.',
          descriptionFa: 'استاندارد رمزنگاری حاوی گواهی و زنجیره CA بدون کلید خصوصی. مورد استفاده در Microsoft IIS، Exchange و سرورهای جاوا/Tomcat.',
          targetPlatforms: ['Microsoft IIS', 'Microsoft Exchange', 'Apache Tomcat', 'Lotus Domino'],
          sizeBytes: Buffer.byteLength(p7bText, 'utf8'),
        });
      } catch (p7bErr: any) {
        console.warn('[CertConverter] P7B generation error:', p7bErr.message);
      }

      // 4. PKCS#7 Binary DER (.p7b / .p7c)
      try {
        const p7bDerCmd = hasCa
          ? `openssl crl2pkcs7 -nocrl -certfile "${certPath}" -certfile "${caPath}" -outform DER 2>/dev/null`
          : `openssl crl2pkcs7 -nocrl -certfile "${certPath}" -outform DER 2>/dev/null`;
        const p7bDerBuffer = execSync(p7bDerCmd);
        outputs.push({
          id: 'pkcs7_der',
          format: 'PKCS#7 Binary (.p7c / .p7b)',
          filename: `${safeCn}.p7c`,
          mimeType: 'application/pkcs7-mime',
          isBinary: true,
          base64: p7bDerBuffer.toString('base64'),
          descriptionEn: 'Binary DER-encoded PKCS#7 certificate chain format.',
          descriptionFa: 'فرمت باینری DER برای زنجیره گواهی‌های PKCS#7.',
          targetPlatforms: ['Windows PKI', 'Java Application Servers'],
          sizeBytes: p7bDerBuffer.length,
        });
      } catch (p7bDerErr: any) {
        console.warn('[CertConverter] P7B DER generation error:', p7bDerErr.message);
      }

      // 5. Full Chain PEM (Certificate + CA Bundle)
      if (hasCa) {
        const fullChainText = `${certPem}\n\n${caBundlePem}\n`;
        outputs.push({
          id: 'fullchain_pem',
          format: 'Full Chain PEM (.pem / .crt)',
          filename: `${safeCn}_fullchain.pem`,
          mimeType: 'application/x-pem-file',
          isBinary: false,
          text: fullChainText,
          descriptionEn: 'Combines your public certificate with intermediate and root CA certificates into a single ordered bundle. Essential for Nginx ssl_certificate & Apache 2.4.8+.',
          descriptionFa: 'ترکیب گواهی عمومی شما با گواهی‌های میانی و ریشه CA در یک فایل پیوسته. حیاتی برای پیکربندی ssl_certificate در Nginx و Apache 2.4.8+.',
          targetPlatforms: ['Nginx (ssl_certificate)', 'Apache 2.4.8+', 'HAProxy', 'Let\'s Encrypt / Certbot compatible'],
          sizeBytes: Buffer.byteLength(fullChainText, 'utf8'),
        });

        // CA Bundle standalone
        outputs.push({
          id: 'ca_bundle_pem',
          format: 'Intermediate CA Bundle (.ca-bundle / .crt)',
          filename: `${safeCn}_ca_bundle.crt`,
          mimeType: 'application/x-x509-ca-cert',
          isBinary: false,
          text: caBundlePem + '\n',
          descriptionEn: 'Standalone intermediate and root authority certificate chain. Used for SSLCertificateChainFile in Apache and legacy systems.',
          descriptionFa: 'زنجیره مستقل مراجع میانی و ریشه. مورد نیاز برای پارامتر SSLCertificateChainFile در وب‌سرورهای قدیمی آپاچی.',
          targetPlatforms: ['Apache (SSLCertificateChainFile)', 'Postfix / Dovecot', 'Sendmail'],
          sizeBytes: Buffer.byteLength(caBundlePem, 'utf8'),
        });
      }

      // 6. Formatted Certificate Inspection Report (.txt)
      const reportLines = [
        '=================================================================',
        ` SSL / TLS CERTIFICATE SPECIFICATION REPORT`,
        '=================================================================',
        `Generated At:        ${new Date().toISOString()}`,
        `Common Name (CN):    ${certInfo.commonName}`,
        `Subject DN:          ${certInfo.subject}`,
        `Issuer Authority:    ${certInfo.issuer}`,
        `Issuer Organization: ${certInfo.issuerOrg}`,
        `Serial Number:       ${certInfo.serialNumber}`,
        `Key Algorithm:       ${certInfo.keyType} (${certInfo.keyBits} bits)`,
        `Valid From:          ${certInfo.validFrom} UTC`,
        `Valid To:            ${certInfo.validTo} UTC`,
        `Days Remaining:      ${certInfo.daysRemaining} days`,
        `Status:              ${certInfo.isExpired ? 'EXPIRED' : 'ACTIVE / VALID'}`,
        `SHA-256 Fingerprint: ${certInfo.sha256Fingerprint}`,
        `SHA-1 Fingerprint:   ${certInfo.sha1Fingerprint}`,
        '-----------------------------------------------------------------',
        `Subject Alternative Names (${certInfo.sans.length} SANs):`,
        ...certInfo.sans.map((s) => `  - ${s}`),
        '=================================================================',
      ];
      if (hasKey) {
        reportLines.push(
          `Private Key Status:  Provided`,
          `Modulus Match:       ${keyMatch.matches ? 'VERIFIED (100% Match)' : 'MISMATCH WARNING'}`,
          `Modulus MD5 Hash:    ${keyMatch.certModulusHash || 'N/A'}`
        );
      }
      const reportText = reportLines.join('\n') + '\n';
      outputs.push({
        id: 'cert_details_txt',
        format: 'Certificate Technical Report (.txt)',
        filename: `${safeCn}_details.txt`,
        mimeType: 'text/plain',
        isBinary: false,
        text: reportText,
        descriptionEn: 'Human-readable plain text report with all decoded X.509 fields, validity window, and cryptographic hashes.',
        descriptionFa: 'گزارش متنی شفاف با مشخصات کامل گواهی، بازه اعتبار و هش‌های رمزنگاری.',
        targetPlatforms: ['Documentation', 'Audit & Compliance', 'DevOps Handover'],
        sizeBytes: Buffer.byteLength(reportText, 'utf8'),
      });

      // If Private Key is provided:
      if (hasKey) {
        // 7. PKCS#12 / PFX (.pfx / .p12)
        try {
          const pfxPath = path.join(tmpDir, 'output.pfx');
          const passOpt = pfxPass ? `-passout "pass:${pfxPass}"` : `-passout "pass:"`;
          const caOpt = hasCa ? `-certfile "${caPath}"` : '';
          const nameOpt = alias ? `-name "${alias}"` : '';

          const pfxCmd = `openssl pkcs12 -export -out "${pfxPath}" -inkey "${keyPath}" -in "${certPath}" ${caOpt} ${nameOpt} ${passOpt} 2>/dev/null`;
          execSync(pfxCmd);

          if (fs.existsSync(pfxPath)) {
            const pfxBuffer = fs.readFileSync(pfxPath);
            outputs.push({
              id: 'pkcs12_pfx',
              format: 'PKCS#12 Archive (.pfx / .p12)',
              filename: `${safeCn}.pfx`,
              mimeType: 'application/x-pkcs12',
              isBinary: true,
              base64: pfxBuffer.toString('base64'),
              descriptionEn: `Encrypted password-protected container holding public certificate, private key, and intermediate chain. Mandatory for Microsoft IIS, Azure App Services, Windows Server, Tomcat. (Password: ${pfxPass ? 'Custom Password Set' : 'Blank/None'})`,
              descriptionFa: `کانتینر رمزشده حاوی گواهی عمومی، کلید خصوصی و زنجیره میانی. فرمت الزامی برای Microsoft IIS، سرویس‌های Azure و ویندوز سرور. (رمز عبور: ${pfxPass ? 'رمز سفارشی تنظیم شده' : 'بدون رمز'})`,
              targetPlatforms: ['Microsoft IIS', 'Azure App Services', 'Windows Server', 'Tomcat', 'Citrix Gateway'],
              sizeBytes: pfxBuffer.length,
            });
          }
        } catch (pfxErr: any) {
          console.warn('[CertConverter] PFX export error:', pfxErr.message);
        }

        // 8. Combined PEM (.pem) (Cert + CA Bundle + Private Key)
        try {
          const combinedParts: string[] = [certPem];
          if (hasCa) {
            combinedParts.push(caBundlePem);
          }
          combinedParts.push(keyPem);
          const combinedText = combinedParts.join('\n\n') + '\n';

          outputs.push({
            id: 'combined_pem',
            format: 'Combined PEM Bundle (.pem)',
            filename: `${safeCn}_combined.pem`,
            mimeType: 'application/x-pem-file',
            isBinary: false,
            text: combinedText,
            descriptionEn: 'Single unified PEM file concatenating Certificate, Intermediate CA Chain, and Private Key in standard RFC order. Required by HAProxy, Lighttpd, stunnel, Courier, AWS ELB.',
            descriptionFa: 'یک فایل یکپارچه PEM شامل گواهی، زنجیره میانی و کلید خصوصی با ترتیب استاندارد. مورد نیاز HAProxy، Lighttpd، stunnel و AWS ELB.',
            targetPlatforms: ['HAProxy', 'Lighttpd', 'stunnel', 'Courier IMAP', 'AWS ELB'],
            sizeBytes: Buffer.byteLength(combinedText, 'utf8'),
          });
        } catch (combErr: any) {
          console.warn('[CertConverter] Combined PEM error:', combErr.message);
        }

        // 9. Clean Private Key (.key)
        outputs.push({
          id: 'private_key',
          format: 'Private Key (.key)',
          filename: `${safeCn}.key`,
          mimeType: 'application/x-pem-file',
          isBinary: false,
          text: keyPem + '\n',
          descriptionEn: 'Extracted standalone private key in PEM format. Keep this secure and never share it publicly.',
          descriptionFa: 'کلید خصوصی مستقل در فرمت استاندارد PEM. این فایل را محرمانه نگه داشته و از افشای آن خودداری کنید.',
          targetPlatforms: ['Nginx (ssl_certificate_key)', 'Apache (SSLCertificateKeyFile)', 'Node.js HTTPS', 'Golang TLS'],
          sizeBytes: Buffer.byteLength(keyPem, 'utf8'),
        });

        // 10. PKCS#8 Unencrypted Private Key (.key)
        try {
          const pkcs8Text = execSync(
            `openssl pkcs8 -topk8 -inform PEM -outform PEM -in "${keyPath}" -nocrypt 2>/dev/null`
          ).toString();
          if (pkcs8Text && pkcs8Text.includes('BEGIN PRIVATE KEY-----')) {
            outputs.push({
              id: 'pkcs8_key',
              format: 'PKCS#8 Private Key (.key)',
              filename: `${safeCn}_pkcs8.key`,
              mimeType: 'application/x-pem-file',
              isBinary: false,
              text: pkcs8Text,
              descriptionEn: 'Modern standard PKCS#8 private key representation. Preferred by Java, modern cryptographic APIs, and cloud services.',
              descriptionFa: 'فرمت مدرن استاندارد PKCS#8 برای کلید خصوصی. مورد ترجیح در جاوا و فریم‌ورک‌های جدید وب.',
              targetPlatforms: ['Java / Netty', 'Google Cloud', 'Spring Boot', 'Modern OpenSSL'],
              sizeBytes: Buffer.byteLength(pkcs8Text, 'utf8'),
            });
          }
        } catch (pk8Err: any) {
          console.warn('[CertConverter] PKCS#8 key conversion error:', pk8Err.message);
        }
      }

      return res.json({
        success: true,
        certInfo,
        keyMatch,
        hasPrivateKey: hasKey,
        hasCaBundle: hasCa,
        isCombinedFound,
        extractedCertPem: certPem,
        extractedKeyPem: keyPem,
        extractedCaBundlePem: caBundlePem,
        notes,
        outputs,
      });
    } catch (err: any) {
      console.error('[CertConverter Error]', err);
      return res.status(400).json({
        success: false,
        error: err.message || 'An error occurred during certificate conversion.',
      });
    } finally {
      if (tmpDir && fs.existsSync(tmpDir)) {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {}
      }
    }
  });

  /**
   * PFX / PKCS#12 Extraction API: Extracts Certificate, Key, and Chain from uploaded PFX/P12
   */
  app.post('/api/tools/cert-extract-pfx', async (req: Request, res: Response) => {
    let tmpDir = '';
    try {
      const { pfxBase64, password } = req.body || {};
      if (!pfxBase64) {
        return res.status(400).json({
          success: false,
          error: 'PFX / PKCS#12 file content (Base64) is required.',
        });
      }

      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssl-ext-'));
      const pfxPath = path.join(tmpDir, 'input.pfx');
      const pfxBuffer = Buffer.from(pfxBase64, 'base64');
      fs.writeFileSync(pfxPath, pfxBuffer);

      const passArg = password ? `-passin "pass:${password}"` : `-passin "pass:"`;

      // 1. Extract Private Key
      let privateKeyPem = '';
      try {
        privateKeyPem = execSync(
          `openssl pkcs12 -in "${pfxPath}" -nocerts -nodes ${passArg} 2>/dev/null`
        ).toString();
      } catch (err: any) {
        return res.status(400).json({
          success: false,
          error: 'Failed to decrypt PFX/P12 archive. Please verify the password entered.',
        });
      }

      // 2. Extract Client / Server Certificate
      let certPem = '';
      try {
        certPem = execSync(
          `openssl pkcs12 -in "${pfxPath}" -clcerts -nokeys ${passArg} 2>/dev/null`
        ).toString();
      } catch (err: any) {
        return res.status(400).json({
          success: false,
          error: `Failed to extract leaf certificate from PFX: ${err.message}`,
        });
      }

      // 3. Extract CA Chain (Intermediate & Root)
      let caChainPem = '';
      try {
        caChainPem = execSync(
          `openssl pkcs12 -in "${pfxPath}" -cacerts -nokeys ${passArg} 2>/dev/null`
        ).toString();
      } catch {}

      // Normalize extracted components
      const extracted = normalizeAndExtractPems(certPem, privateKeyPem, caChainPem);
      const cleanCert = extracted.certPem;
      const cleanKey = extracted.keyPem;
      const cleanChain = extracted.caBundlePem;

      const certInfo = parseCertificateDetails(cleanCert, tmpDir);

      return res.json({
        success: true,
        certPem: cleanCert,
        privateKeyPem: cleanKey,
        caChainPem: cleanChain,
        certInfo,
      });
    } catch (err: any) {
      console.error('[CertExtractPFX Error]', err);
      return res.status(400).json({
        success: false,
        error: err.message || 'Failed to extract PFX archive.',
      });
    } finally {
      if (tmpDir && fs.existsSync(tmpDir)) {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {}
      }
    }
  });
}
