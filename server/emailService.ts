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

/**
 * Sends a high-security, responsive Two-Factor Authentication OTP email
 * in a stunning enterprise-grade HTML format.
 */
export async function sendTwoFactorAuthEmail(
  to: string,
  code: string,
  options?: {
    username?: string;
    ip?: string;
    userAgent?: string;
    lang?: 'fa' | 'en';
    expiresMinutes?: number;
  }
): Promise<{ success: boolean; messageId?: string; error?: string; error_fa?: string }> {
  const username = options?.username || 'User';
  const ip = options?.ip || '127.0.0.1';
  const userAgent = options?.userAgent || 'Web Browser';
  const expiresMinutes = options?.expiresMinutes || 5;
  const isEn = options?.lang === 'en';
  const timestampStr = new Date().toUTCString();

  // Retrieve outgoing mail gateway settings
  let config: EmailConfig;
  try {
    const { getEmailConfig } = await import('./db');
    config = await getEmailConfig();
  } catch (err: any) {
    console.warn('[Two-Factor Auth Mailer] Failed to load email config:', err.message);
    return {
      success: false,
      error: 'Failed to load SMTP email settings from database.',
      error_fa: 'بارگذاری تنظیمات درگاه ایمیل از پایگاه‌داده با خطا مواجه شد.',
    };
  }

  // Always log the 2FA code to console so administrator has complete visibility
  console.log(`[Two-Factor Auth Security Gateway] 🔐 OTP Code for '${username}' (${to}): [${code}]`);

  // Verify SMTP configuration
  if (!config.smtp_host || !config.smtp_host.trim()) {
    console.warn(`[Two-Factor Auth] SMTP host is not configured. Verification code logged to server output.`);
    return {
      success: false,
      error: 'SMTP outgoing mail server is not configured in Email Settings.',
      error_fa: 'سرور ارسال ایمیل SMTP در بخش تنظیمات ایمیل پنل هنوز پیکربندی نشده است.',
    };
  }

  const fromAddr = (config.from_email && config.from_email.trim()) || config.smtp_user.trim();
  const fromName = (config.from_name && config.from_name.trim()) || 'NetTopology Security';
  const from = fromName ? `"${fromName}" <${fromAddr}>` : fromAddr;

  const subject = isEn
    ? `[NetTopology] ${code} is your Two-Step Verification Code`
    : `[NetTopology] کد تایید ورود دو مرحله‌ای شما: ${code}`;

  const textBody = isEn
    ? `NetTopology Two-Step Verification Code\n\nHello ${username},\n\nYour one-time sign-in verification code is:\n\n${code}\n\nThis code is valid for ${expiresMinutes} minutes.\nNever share this code with anyone.\n\nSign-in details:\n- Username: ${username}\n- IP Address: ${ip}\n- Timestamp: ${timestampStr}\n- Client: ${userAgent}\n`
    : `کد تایید ورود دو مرحله‌ای NetTopology\n\nکاربر گرامی ${username}،\n\nکد تایید یک‌بار مصرف ورود به سامانه:\n\n${code}\n\nاین کد تا ${expiresMinutes} دقیقه دیگر معتبر است.\nهرگز این کد را در اختیار افراد دیگر قرار ندهید.\n\nمشخصات درخواست:\n- نام کاربری: ${username}\n- آدرس آی‌پی: ${ip}\n- تاریخ: ${timestampStr}\n- مرورگر: ${userAgent}\n`;

  const htmlBody = `
<!DOCTYPE html>
<html lang="${isEn ? 'en' : 'fa'}" dir="${isEn ? 'ltr' : 'rtl'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #060b18;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: #f1f5f9;
      -webkit-font-smoothing: antialiased;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table {
      border-collapse: separate;
    }
    .outer-table {
      width: 100% !important;
      background-color: #060b18;
      margin: 0;
      padding: 0;
    }
    .center-cell {
      padding: 50px 20px;
      text-align: center;
      vertical-align: top;
    }
    .email-card {
      width: 100%;
      max-width: 480px;
      margin: 0 auto;
      background-color: #0f172a;
      border-radius: 20px;
      border: 1px solid #1e293b;
      overflow: hidden;
      box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.7);
      text-align: ${isEn ? 'left' : 'right'};
    }
    @media only screen and (min-width: 600px) {
      .email-card {
        width: 480px !important;
        max-width: 480px !important;
      }
    }
    .top-accent {
      height: 4px;
      background: linear-gradient(90deg, #6366f1 0%, #06b6d4 50%, #10b981 100%);
    }
    .header {
      background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 70%, #082f49 100%);
      padding: 32px 30px 24px;
      text-align: center;
      border-bottom: 1px solid #1e293b;
    }
    .shield-badge {
      display: inline-block;
      width: 56px;
      height: 56px;
      line-height: 56px;
      background: rgba(14, 165, 233, 0.15);
      border: 1px solid rgba(14, 165, 233, 0.4);
      border-radius: 16px;
      font-size: 26px;
      margin-bottom: 14px;
    }
    .header h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.3px;
    }
    .header p {
      margin: 6px 0 0;
      color: #94a3b8;
      font-size: 13px;
    }
    .content {
      padding: 32px 30px;
    }
    .greeting {
      font-size: 15px;
      color: #e2e8f0;
      margin: 0 0 16px;
      line-height: 1.6;
    }
    .intro {
      font-size: 14px;
      color: #cbd5e1;
      margin: 0 0 24px;
      line-height: 1.7;
    }
    .code-box {
      background: #020617;
      border: 2px dashed #0284c7;
      border-radius: 16px;
      padding: 24px 20px;
      text-align: center;
      margin: 24px 0;
      box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.6);
    }
    .code-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #38bdf8;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .code-number {
      font-family: 'SFMono-Regular', Consolas, 'Courier New', monospace;
      font-size: 44px;
      font-weight: 900;
      letter-spacing: 14px;
      color: #38bdf8;
      text-shadow: 0 0 20px rgba(56, 189, 248, 0.45);
      padding-left: 14px;
      margin: 6px 0;
    }
    .validity-tag {
      display: inline-block;
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: #fbbf24;
      border-radius: 20px;
      padding: 4px 14px;
      font-size: 12px;
      font-weight: 600;
      margin-top: 10px;
    }
    .metadata-box {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 14px;
      padding: 18px 20px;
      margin: 24px 0;
    }
    .metadata-title {
      font-size: 12px;
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin: 0 0 12px;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .meta-row:last-child {
      margin-bottom: 0;
      padding-bottom: 0;
      border-bottom: none;
    }
    .meta-label {
      color: #94a3b8;
    }
    .meta-val {
      color: #f1f5f9;
      font-weight: 600;
      font-family: monospace;
    }
    .warning-box {
      background: rgba(239, 68, 68, 0.1);
      border-left: 4px solid #ef4444;
      border-radius: 0 12px 12px 0;
      padding: 14px 18px;
      margin: 24px 0 0;
      color: #fca5a5;
      font-size: 13px;
      line-height: 1.6;
    }
    .footer {
      padding: 22px 30px;
      background: #090e1c;
      border-top: 1px solid #1e293b;
      text-align: center;
      font-size: 11px;
      color: #64748b;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <!-- Outer Centering Table -->
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="outer-table" style="background-color: #060b18; width: 100%; table-layout: fixed;">
    <tr>
      <td align="center" class="center-cell" style="padding: 50px 20px; background-color: #060b18;">
        <!-- Centered Card: Constrained to ~1/3 screen width (max 480px) with generous margins -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="email-card" style="max-width: 480px; width: 100%; margin: 0 auto; background-color: #0f172a; border-radius: 20px; border: 1px solid #1e293b; overflow: hidden; box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.7);">
          <tr>
            <td>
              <div class="top-accent"></div>
              <div class="header">
                <div class="shield-badge">🛡️</div>
                <h1>NetTopology Enterprise</h1>
                <p>${isEn ? 'Two-Step Verification Gateway' : 'درگاه امنیتی احراز هویت دو مرحله‌ای'}</p>
              </div>
              <div class="content">
                <p class="greeting">
                  ${isEn ? `Hello <strong>${username}</strong>,` : `کاربر گرامی <strong>${username}</strong>،`}
                </p>
                <p class="intro">
                  ${
                    isEn
                      ? 'A sign-in attempt was initiated for your NetTopology account. Please submit the one-time security code below to complete your login:'
                      : 'یک درخواست ورود به حساب کاربری شما در سامانه مدیریت شبکه NetTopology ثبت گردید. جهت تایید هویت و تکمیل ورود، کد امنیتی ۶ رقمی زیر را وارد فرمایید:'
                  }
                </p>

                <div class="code-box">
                  <div class="code-label">${isEn ? 'One-Time Security Code' : 'کد تایید یک‌بار مصرف'}</div>
                  <div class="code-number">${code}</div>
                  <div class="validity-tag">
                    ⏱️ ${isEn ? `Valid for ${expiresMinutes} minutes` : `معتبر به مدت ${expiresMinutes} دقیقه`}
                  </div>
                </div>

                <div class="metadata-box">
                  <div class="metadata-title">${isEn ? 'Sign-In Request Details' : 'مشخصات درخواست ورود'}</div>
                  <div class="meta-row">
                    <span class="meta-label">${isEn ? 'Account:' : 'نام کاربری:'}</span>
                    <span class="meta-val">${username}</span>
                  </div>
                  <div class="meta-row">
                    <span class="meta-label">${isEn ? 'IP Address:' : 'آدرس آی‌پی:'}</span>
                    <span class="meta-val">${ip}</span>
                  </div>
                  <div class="meta-row">
                    <span class="meta-label">${isEn ? 'Timestamp:' : 'تاریخ و زمان:'}</span>
                    <span class="meta-val">${timestampStr}</span>
                  </div>
                  <div class="meta-row">
                    <span class="meta-label">${isEn ? 'Client / Agent:' : 'دستگاه / مرورگر:'}</span>
                    <span class="meta-val">${userAgent.slice(0, 40)}</span>
                  </div>
                </div>

                <div class="warning-box">
                  <strong>⚠️ ${isEn ? 'Security Notice:' : 'هشدار امنیتی:'}</strong>
                  ${
                    isEn
                      ? 'Never disclose this code to anyone. NetTopology administrators will never ask for your verification code. If you did not request this login, please secure your account immediately.'
                      : 'این کد کاملاً محرمانه است و نباید در اختیار فرد دیگری قرار گیرد. پشتیبانی سامانه هرگز این کد را از شما نخواهد خواست. در صورتی که این ورود توسط شما انجام نشده است، بلافاصله کلمه عبور خود را تغییر دهید.'
                  }
                </div>
              </div>
              <div class="footer">
                NetTopology Security • Automated System Dispatch<br>
                © ${new Date().getFullYear()} NetTopology Enterprise Network Platform. All rights reserved.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  try {
    const transporter = createMailTransport(config);
    const info = await transporter.sendMail({
      from,
      to: to.trim(),
      subject,
      text: textBody,
      html: htmlBody,
    });

    console.log(`[Two-Factor Auth] ✓ 2FA email delivered successfully to ${to} (MessageId: ${info.messageId})`);
    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (err: any) {
    const parsed = parseSmtpError(err);
    console.error(`[Two-Factor Auth Mail Error] Failed to send email to ${to}:`, err.message);
    return {
      success: false,
      error: parsed.en,
      error_fa: parsed.fa,
    };
  }
}

