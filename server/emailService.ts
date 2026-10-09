import nodemailer from 'nodemailer';
import { EmailConfig } from './db';

export interface TestEmailResult {
  success: boolean;
  messageId?: string;
  response?: string;
  error?: string;
  error_fa?: string;
  code?: string;
  latencyMs: number;
  server_auth_methods?: string[];
  used_auth_method?: string;
}

/**
 * Creates and configures a nodemailer transport from EmailConfig
 */
export function createMailTransport(
  config: EmailConfig,
  transportOverrides?: {
    logger?: any;
    debug?: boolean;
    forceAuthMethod?: 'PLAIN' | 'LOGIN' | 'CRAM-MD5';
  }
) {
  const port = Number(config.smtp_port) || 587;
  const isDirectSsl = config.smtp_secure === 'ssl' || port === 465;
  const isStartTls = config.smtp_secure === 'tls' && !isDirectSsl;
  const isPlain = config.smtp_secure === 'none';
  const allowSelfSigned = config.allow_self_signed === true || config.reject_unauthorized === false;

  const transportOptions: any = {
    host: config.smtp_host.trim(),
    port: port,
    secure: isDirectSsl,
    requireTLS: isStartTls,
    ignoreTLS: isPlain,
    tls: {
      rejectUnauthorized: !allowSelfSigned,
      // For Exchange and internal servers: allow compatible cipher suites and security levels
      // while maintaining modern TLS by default
      ciphers: allowSelfSigned ? 'DEFAULT@SECLEVEL=0' : undefined,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  };

  if (transportOverrides?.logger) {
    transportOptions.logger = transportOverrides.logger;
  }
  if (transportOverrides?.debug !== undefined) {
    transportOptions.debug = transportOverrides.debug;
  }

  // If require_auth is false, do not send any auth at all (supports anonymous relay connectors)
  if (config.require_auth && config.smtp_user) {
    const auth: any = {
      user: config.smtp_user.trim(),
      pass: config.smtp_pass || '',
    };

    const methodToUse =
      transportOverrides?.forceAuthMethod ||
      (config.auth_method && config.auth_method !== 'auto' ? config.auth_method.toUpperCase() : undefined);

    if (methodToUse) {
      auth.method = methodToUse;
    }

    transportOptions.auth = auth;
  }

  return nodemailer.createTransport(transportOptions);
}

/**
 * Translates common SMTP errors to user-friendly messages
 */
function parseSmtpError(err: any): { en: string; fa: string; code?: string } {
  const code = err.code || err.responseCode || 'SMTP_ERROR';
  const rawMsg = err.response || err.message || String(err);
  const msgStr = `${err.message || ''} ${err.response || ''}`;
  const responseCode = Number(err.responseCode) || (rawMsg.match(/\b(504|535|530)\b/) ? Number(rawMsg.match(/\b(504|535|530)\b/)![1]) : 0);

  // 1. 504 / Unrecognized authentication type
  if (
    responseCode === 504 ||
    msgStr.includes('504') ||
    msgStr.toLowerCase().includes('unrecognized authentication type')
  ) {
    return {
      en: `SMTP Authentication method rejected by server (504): The server does not accept the offered authentication mechanism. Basic authentication (AUTH LOGIN / AUTH PLAIN) may be disabled on the Exchange Receive Connector, or only integrated Windows authentication (NTLM/GSSAPI) is offered. Suggestions: (1) Select another Authentication Method in settings (e.g., LOGIN or PLAIN), (2) Enable Basic Authentication on the Exchange Receive Connector, or (3) If an anonymous relay connector is configured for this server's IP address, uncheck 'Requires Authentication' to send without login credentials. Server response: "${rawMsg}"`,
      fa: `روش احراز هویت توسط میل‌سرور رد شد (کد ۵۰۴): سرور روش احراز هویت ارائه‌شده را نمی‌پذیرد. ممکن است احراز هویت پایه (Basic Authentication شامل LOGIN / PLAIN) در Receive Connector اکسچنج غیرفعال باشد، یا سرور فقط NTLM/GSSAPI را مجاز بداند. راهکارها: ۱) روش احراز هویت (Auth Method) را در تنظیمات تغییر دهید (مثلاً LOGIN یا PLAIN)، ۲) گزینه Basic Authentication را روی Receive Connector اکسچنج فعال نمایید، یا ۳) در صورت تعریف Relay Connector مجاز برای آی‌پی این سرور، تیک «نیاز به احراز هویت» را غیرفعال کنید. پاسخ سرور: "${rawMsg}"`,
      code: 'EAUTH_504',
    };
  }

  // 2. 530 / Must issue a STARTTLS command first
  if (
    responseCode === 530 ||
    msgStr.includes('530') ||
    msgStr.toLowerCase().includes('must issue a starttls') ||
    msgStr.toLowerCase().includes('starttls command first')
  ) {
    return {
      en: `STARTTLS encryption required by server (530): The mail server requires a STARTTLS command before authentication or message submission. Ensure 'Encryption Protocol' is set to 'STARTTLS' (Port 587 or 25). If using an internal Exchange certificate, also keep 'Allow Self-Signed / Untrusted TLS Certificates' enabled. Server response: "${rawMsg}"`,
      fa: `رمزنگاری STARTTLS توسط سرور الزامی است (کد ۵۳۰): میل‌سرور ارسال دستور STARTTLS را پیش از احراز هویت یا تحویل پیام اجباری کرده است. پروتکل رمزنگاری را روی STARTTLS (پورت ۵۸۷ یا ۲۵) قرار دهید و در صورت استفاده از گواهی داخلی اکسچنج، گزینه «پذیرش سرتیفیکیت‌های خودامضا و CA داخلی» را نیز فعال نگه دارید. پاسخ سرور: "${rawMsg}"`,
      code: 'ETLS_REQUIRED',
    };
  }

  // 3. 535 / BadCredentials / Invalid username or password
  if (
    responseCode === 535 ||
    msgStr.includes('535') ||
    msgStr.includes('BadCredentials') ||
    code === 'EAUTH'
  ) {
    return {
      en: `SMTP Authentication failed (535): Invalid username or password. For Gmail or Microsoft 365, ensure an App Password is used. For Microsoft Exchange, verify Active Directory format (DOMAIN\\username or user@domain.com). Server response: "${rawMsg}"`,
      fa: `احراز هویت سرور ایمیل ناموفق بود (کد ۵۳۵): نام کاربری یا رمز عبور نامعتبر است. در صورت استفاده از جیمیل یا اوت‌لوک از App Password، و برای سرور اکسچنج سازمانی از فرمت کاربری دامین (DOMAIN\\username یا user@domain.com) استفاده فرمایید. پاسخ سرور: "${rawMsg}"`,
      code: 'EAUTH',
    };
  }

  // 4. Timeout
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT' || msgStr.toLowerCase().includes('timeout')) {
    return {
      en: `Connection timed out while connecting to SMTP server. Verify the server hostname, port, and outbound firewall rules. Server response: "${rawMsg}"`,
      fa: `مهلت برقراری ارتباط با سرور ایمیل به پایان رسید (Timeout). نام سرور، شماره پورت و دسترسی فایروال را بررسی نمایید. پاسخ سرور: "${rawMsg}"`,
      code: 'ETIMEDOUT',
    };
  }

  // 5. Connection refused
  if (code === 'ECONNREFUSED') {
    return {
      en: `Connection refused by the target mail server. Check if the SMTP service is active and the port is open. Server response: "${rawMsg}"`,
      fa: `ارتباط توسط سرور مقصد رد شد (Connection Refused). وضعیت سرویس ایمیل و باز بودن پورت را بررسی کنید. پاسخ سرور: "${rawMsg}"`,
      code: 'ECONNREFUSED',
    };
  }

  // 6. DNS Not Found
  if (code === 'ENOTFOUND') {
    return {
      en: `SMTP Hostname could not be resolved (DNS Error). Please verify the server address. Server response: "${rawMsg}"`,
      fa: `آدرس هاست ایمیل در DNS یافت نشد (دامنه نامعتبر است). آدرس سرور را بررسی فرمایید. پاسخ سرور: "${rawMsg}"`,
      code: 'ENOTFOUND',
    };
  }

  // 7. TLS Certificate Errors
  if (
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
    code === 'CERT_HAS_EXPIRED' ||
    msgStr.toLowerCase().includes('self-signed') ||
    msgStr.toLowerCase().includes('certificate') ||
    msgStr.toLowerCase().includes('unable to verify')
  ) {
    return {
      en: `TLS Certificate verification failed (Self-Signed or Untrusted Certificate). Enable 'Allow Self-Signed / Untrusted TLS Certificates' if using an internal relay or Microsoft Exchange server. Server response: "${rawMsg}"`,
      fa: `اعتبارسنجی سرتیفیکیت TLS ناموفق بود (گواهی داخلی یا خودامضا). در صورت استفاده از میل سرور محلی یا مایکروسافت اکسچنج، گزینه «پذیرش سرتیفیکیت‌های خودامضا و CA داخلی» را فعال نمایید. پاسخ سرور: "${rawMsg}"`,
      code: 'ECERT',
    };
  }

  return {
    en: `SMTP delivery failed: ${rawMsg}`,
    fa: `خطا در ارسال ایمیل: ${rawMsg}`,
    code: String(code),
  };
}

/**
 * Sends a real test email through the configured SMTP server to the target recipient
 */
export async function sendTestEmail(options: {
  config: EmailConfig;
  to: string;
  subject?: string;
  notes?: string;
}): Promise<TestEmailResult> {
  const startTime = Date.now();
  const { config, to, subject, notes } = options;

  if (!config.smtp_host || !config.smtp_host.trim()) {
    return {
      success: false,
      error: 'SMTP Host is missing or empty.',
      error_fa: 'آدرس هاست یا سرور ایمیل (SMTP Host) وارد نشده است.',
      latencyMs: 0,
    };
  }

  if (!to || !to.trim() || !to.includes('@')) {
    return {
      success: false,
      error: 'A valid recipient destination email address is required.',
      error_fa: 'یک آدرس ایمیل معتبر برای گیرنده الزامی است.',
      latencyMs: 0,
    };
  }

  // Capability lines (250-AUTH ...) captured via Nodemailer logger/debug (no passwords logged)
  const serverAuthMethods: string[] = [];
  const captureLogger = {
    level: () => {},
    trace: () => {},
    debug: (...args: any[]) => {
      for (const a of args) {
        let text = '';
        if (typeof a === 'string') {
          text = a;
        } else if (a && typeof a === 'object') {
          text = `${a.msg || ''} ${a.data || ''}`;
        }
        if (text) {
          const match = text.match(/250[- ]AUTH\s+([^\r\n]+)/i);
          if (match && match[1]) {
            const tokens = match[1].trim().split(/\s+/).filter(Boolean);
            for (const t of tokens) {
              const upper = t.toUpperCase().trim();
              if (upper && !serverAuthMethods.includes(upper)) {
                serverAuthMethods.push(upper);
              }
            }
          }
        }
      }
    },
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
  };

  const fromAddr = (config.from_email && config.from_email.trim()) || config.smtp_user.trim();
  const fromName = (config.from_name && config.from_name.trim()) || 'NetTopology Alerts';
  const from = fromName ? `"${fromName}" <${fromAddr}>` : fromAddr;
  const emailSubject = subject || '[NetTopology] Email Gateway Diagnostic Test / تست اتصال سامانه ایمیل';
  const timestampStr = new Date().toUTCString();

  const mailOptions = {
    from,
    to: to.trim(),
    subject: emailSubject,
    text: `NetTopology Email Gateway Diagnostic Test\n\nThis is a diagnostic message sent from NetTopology to verify that outgoing mail delivery is functioning correctly.\n\nConfiguration Details:\n- SMTP Host: ${config.smtp_host}:${config.smtp_port}\n- Security: ${config.smtp_secure.toUpperCase()}\n- Sender: ${fromAddr}\n- Recipient: ${to.trim()}\n- Timestamp: ${timestampStr}\n${notes ? `\nNote: ${notes}` : ''}`,
    html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { margin: 0; padding: 0; background-color: #0b1120; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9; }
            .container { max-width: 620px; margin: 30px auto; background-color: #0f172a; border-radius: 16px; border: 1px solid #1e293b; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
            .header { background: linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%); padding: 28px 24px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; }
            .header p { margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 13px; font-weight: 500; }
            .body { padding: 32px 28px; }
            .status-badge { background-color: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 12px; padding: 14px 18px; margin-bottom: 24px; display: block; }
            .status-title { color: #34d399; font-size: 15px; font-weight: 700; margin: 0; }
            .desc { color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0; }
            .details-box { background-color: #1e293b; border-radius: 12px; padding: 18px; margin-bottom: 24px; border: 1px solid #334155; }
            .details-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; font-family: monospace; }
            .details-row:last-child { margin-bottom: 0; }
            .details-label { color: #94a3b8; }
            .details-value { color: #f8fafc; font-weight: 600; }
            .note-box { background-color: rgba(56, 189, 248, 0.1); border-left: 4px solid #38bdf8; padding: 12px 16px; border-radius: 0 8px 8px 0; margin-bottom: 20px; color: #bae6fd; font-size: 13px; }
            .footer { padding: 20px 28px; background-color: #0b1329; border-top: 1px solid #1e293b; text-align: center; font-size: 11px; color: #64748b; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>NetTopology & Device Manager</h1>
              <p>Enterprise Outgoing Mail Gateway Verification</p>
            </div>
            <div class="body">
              <div class="status-badge">
                <p class="status-title">✓ SMTP Delivery & Authentication Successful</p>
              </div>
              <p class="desc">
                Congratulations! Your mail server settings have been validated. NetTopology has successfully authenticated with your outgoing SMTP provider and delivered this message.
              </p>
              <div class="details-box">
                <div class="details-row"><span class="details-label">Mail Server (Host):</span> <span class="details-value">${config.smtp_host}:${config.smtp_port}</span></div>
                <div class="details-row"><span class="details-label">Security Protocol:</span> <span class="details-value">${config.smtp_secure.toUpperCase()}</span></div>
                <div class="details-row"><span class="details-label">Sender Address:</span> <span class="details-value">${fromAddr}</span></div>
                <div class="details-row"><span class="details-label">Target Recipient:</span> <span class="details-value">${to.trim()}</span></div>
                <div class="details-row"><span class="details-label">Server Timestamp:</span> <span class="details-value">${timestampStr}</span></div>
              </div>
              ${notes ? `<div class="note-box"><strong>User Memo:</strong> ${notes}</div>` : ''}
              <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                All future system alerts, configuration backup reports, and automated notifications will be routed through this verified channel.
              </p>
            </div>
            <div class="footer">
              NetTopology Diagnostic Notification • Generated automatically by your local management engine
            </div>
          </div>
        </body>
        </html>
      `,
  };

  const attemptDelivery = async (forceAuthMethod?: 'PLAIN' | 'LOGIN' | 'CRAM-MD5') => {
    const transporter = createMailTransport(config, {
      logger: captureLogger,
      debug: true,
      forceAuthMethod,
    });
    await transporter.verify();
    return await transporter.sendMail(mailOptions);
  };

  const isAutoMode = (!config.auth_method || config.auth_method === 'auto') && config.require_auth;

  try {
    const info = await attemptDelivery();
    const latencyMs = Date.now() - startTime;
    return {
      success: true,
      messageId: info.messageId,
      response: info.response,
      latencyMs,
      server_auth_methods: serverAuthMethods.length > 0 ? serverAuthMethods : undefined,
      used_auth_method: config.auth_method ? config.auth_method.toUpperCase() : 'AUTO',
    };
  } catch (firstErr: any) {
    const is504OrEauth =
      firstErr.responseCode === 504 ||
      firstErr.code === 'EAUTH' ||
      String(firstErr.message || '').includes('504') ||
      String(firstErr.message || '').toLowerCase().includes('unrecognized authentication type');

    // When auth_method is 'auto' and first attempt fails with 504 or EAUTH:
    // automatically retry ONCE with LOGIN and once with PLAIN (different from what was tried). Never retry more than that (avoid account lockout).
    if (isAutoMode && is504OrEauth) {
      let firstAttemptMethod: 'LOGIN' | 'PLAIN' | undefined = undefined;
      const cmdUpper = String(firstErr.command || '').toUpperCase();
      if (cmdUpper.includes('LOGIN')) {
        firstAttemptMethod = 'LOGIN';
      } else if (cmdUpper.includes('PLAIN')) {
        firstAttemptMethod = 'PLAIN';
      }

      // Determine methods to retry (different from what was already attempted, at most once per method)
      const methodsToRetry: Array<'LOGIN' | 'PLAIN'> = [];
      if (firstAttemptMethod === 'PLAIN') {
        methodsToRetry.push('LOGIN');
      } else if (firstAttemptMethod === 'LOGIN') {
        methodsToRetry.push('PLAIN');
      } else {
        methodsToRetry.push('LOGIN', 'PLAIN');
      }

      for (const method of methodsToRetry) {
        try {
          const infoRetry = await attemptDelivery(method);
          const latencyMs = Date.now() - startTime;
          return {
            success: true,
            messageId: infoRetry.messageId,
            response: infoRetry.response,
            latencyMs,
            server_auth_methods: serverAuthMethods.length > 0 ? serverAuthMethods : undefined,
            used_auth_method: method,
          };
        } catch (_retryErr: any) {
          // If this retry failed, continue to the next eligible method if any
        }
      }

      const latencyMs = Date.now() - startTime;
      const parsed = parseSmtpError(firstErr);
      const triedList = ['Auto' + (firstAttemptMethod ? ` [${firstAttemptMethod}]` : ''), ...methodsToRetry].join(', ');
      const failurePrefix = `All attempted authentication methods (${triedList}) failed. `;
      const failurePrefixFa = `تمامی روش‌های احراز هویت آزموده‌شده (${triedList}) با شکست مواجه شدند. `;
      return {
        success: false,
        error: `${failurePrefix}${parsed.en}`,
        error_fa: `${failurePrefixFa}${parsed.fa}`,
        code: parsed.code,
        latencyMs,
        server_auth_methods: serverAuthMethods.length > 0 ? serverAuthMethods : undefined,
      };
    }

    const latencyMs = Date.now() - startTime;
    const parsed = parseSmtpError(firstErr);
    return {
      success: false,
      error: parsed.en,
      error_fa: parsed.fa,
      code: parsed.code,
      latencyMs,
      server_auth_methods: serverAuthMethods.length > 0 ? serverAuthMethods : undefined,
    };
  }
}
