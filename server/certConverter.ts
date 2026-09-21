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

/**
 * Parses X.509 certificate metadata using Node.js crypto.X509Certificate and OpenSSL
 */
function parseCertificateDetails(certPem: string): CertInfoMetadata {
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
  } catch (err: any) {
    throw new Error(`Failed to parse certificate syntax: ${err.message}`);
  }
}

/**
 * Verifies if private key matches public certificate
 */
function verifyKeyModulusMatch(certPath: string, keyPath: string): KeyMatchResult {
  try {
    const certMod = execSync(`openssl x509 -noout -modulus -in "${certPath}" 2>/dev/null`)
      .toString()
      .trim();
    const keyMod = execSync(`openssl rsa -noout -modulus -in "${keyPath}" 2>/dev/null`)
      .toString()
      .trim();

    if (!certMod || !keyMod) {
      // Fallback for EC or other key types using public key hash
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
      let { certText, keyText, caBundleText, pfxPassword, friendlyName } = req.body || {};

      certText = (certText || '').trim();
      keyText = (keyText || '').trim();
      caBundleText = (caBundleText || '').trim();
      pfxPassword = pfxPassword !== undefined ? String(pfxPassword) : '';
      friendlyName = (friendlyName || '').trim();

      if (!certText) {
        return res.status(400).json({
          success: false,
          error: 'Certificate content is required. Please paste or upload an SSL/TLS certificate.',
        });
      }

      // If user provided a raw certificate without standard PEM headers, attempt to wrap it
      if (!certText.includes('-----BEGIN CERTIFICATE-----')) {
        // Check if it's base64 without headers
        const cleaned = certText.replace(/\s+/g, '');
        if (/^[A-Za-z0-9+/=]+$/.test(cleaned) && cleaned.length > 200) {
          certText = `-----BEGIN CERTIFICATE-----\n${certText.trim()}\n-----END CERTIFICATE-----`;
        }
      }

      // Create isolated temporary workspace
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssl-conv-'));
      const certPath = path.join(tmpDir, 'cert.pem');
      const keyPath = path.join(tmpDir, 'key.pem');
      const caPath = path.join(tmpDir, 'ca.pem');

      fs.writeFileSync(certPath, certText, 'utf8');

      // Parse metadata
      const certInfo = parseCertificateDetails(certText);
      const safeCn = (certInfo.commonName || 'certificate')
        .replace(/[^a-zA-Z0-9.-]/g, '_')
        .replace(/^\*\_?/, 'wildcard_');
      const alias = friendlyName || certInfo.commonName || 'ssl_cert';

      // Check if CA bundle is supplied
      const hasCa = Boolean(caBundleText && caBundleText.includes('-----BEGIN CERTIFICATE-----'));
      if (hasCa) {
        fs.writeFileSync(caPath, caBundleText, 'utf8');
      }

      // Check if Private Key is supplied
      const hasKey = Boolean(keyText && (keyText.includes('PRIVATE KEY-----') || keyText.length > 100));
      if (hasKey) {
        fs.writeFileSync(keyPath, keyText, 'utf8');
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
        text: certText,
        descriptionEn: 'Standard Base64 ASCII format with BEGIN/END headers. Default for Nginx, Apache, HAProxy, Linux servers.',
        descriptionFa: 'فرمت استاندارد متنی Base64 با هدرهای استاندارد. مناسب برای وب‌سرورهای Nginx، Apache، HAProxy و سرورهای لینوکس.',
        targetPlatforms: ['Nginx', 'Apache HTTPD', 'HAProxy', 'Linux / Unix', 'cPanel / DirectAdmin'],
        sizeBytes: Buffer.byteLength(certText, 'utf8'),
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
        const fullChainText = `${certText.trim()}\n\n${caBundleText.trim()}\n`;
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
          text: caBundleText.trim() + '\n',
          descriptionEn: 'Standalone intermediate and root authority certificate chain. Used for SSLCertificateChainFile in Apache and legacy systems.',
          descriptionFa: 'زنجیره مستقل مراجع میانی و ریشه. مورد نیاز برای پارامتر SSLCertificateChainFile در وب‌سرورهای قدیمی آپاچی.',
          targetPlatforms: ['Apache (SSLCertificateChainFile)', 'Postfix / Dovecot', 'Sendmail'],
          sizeBytes: Buffer.byteLength(caBundleText, 'utf8'),
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
          const passOpt = pfxPassword ? `-passout "pass:${pfxPassword}"` : `-passout "pass:"`;
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
              descriptionEn: `Encrypted password-protected container holding public certificate, private key, and intermediate chain. Mandatory for Microsoft IIS, Azure App Services, Windows Server, Tomcat. (Password: ${pfxPassword ? 'Custom Password Set' : 'Blank/None'})`,
              descriptionFa: `کانتینر رمزشده حاوی گواهی عمومی، کلید خصوصی و زنجیره میانی. فرمت الزامی برای Microsoft IIS، سرویس‌های Azure و ویندوز سرور. (رمز عبور: ${pfxPassword ? 'رمز سفارشی تنظیم شده' : 'بدون رمز'})`,
              targetPlatforms: ['Microsoft IIS', 'Azure App Services', 'Windows Server', 'Tomcat', 'Citrix Gateway'],
              sizeBytes: pfxBuffer.length,
            });
          }
        } catch (pfxErr: any) {
          console.warn('[CertConverter] PFX export error:', pfxErr.message);
        }

        // 8. Combined PEM (.pem) (Cert + CA Bundle + Private Key)
        try {
          const combinedParts: string[] = [certText.trim()];
          if (hasCa) {
            combinedParts.push(caBundleText.trim());
          }
          combinedParts.push(keyText.trim());
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
          text: keyText.trim() + '\n',
          descriptionEn: 'Extracted standalone private key in PEM format. Keep this secure and never share it publicly.',
          descriptionFa: 'کلید خصوصی مستقل در فرمت استاندارد PEM. این فایل را محرمانه نگه داشته و از افشای آن خودداری کنید.',
          targetPlatforms: ['Nginx (ssl_certificate_key)', 'Apache (SSLCertificateKeyFile)', 'Node.js HTTPS', 'Golang TLS'],
          sizeBytes: Buffer.byteLength(keyText, 'utf8'),
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

      // Clean up headers and bag attributes if needed
      const cleanCertMatch = certPem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/);
      const cleanCert = cleanCertMatch ? cleanCertMatch[0] : certPem;

      const cleanKeyMatch = privateKeyPem.match(/-----BEGIN (RSA |EC )?PRIVATE KEY-----[\s\S]+?-----END (RSA |EC )?PRIVATE KEY-----/);
      const cleanKey = cleanKeyMatch ? cleanKeyMatch[0] : privateKeyPem;

      const certInfo = parseCertificateDetails(cleanCert);

      return res.json({
        success: true,
        certPem: cleanCert,
        privateKeyPem: cleanKey,
        caChainPem: caChainPem.trim(),
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
