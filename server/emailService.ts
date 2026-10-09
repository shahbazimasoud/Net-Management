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
}

/**
 * Creates and configures a nodemailer transport from EmailConfig
 */
export function createMailTransport(config: EmailConfig) {
  const port = Number(config.smtp_port) || 587;
  const isSecure = config.smtp_secure === 'ssl' || port === 465;

  const transportOptions: any = {
    host: config.smtp_host.trim(),
    port: port,
    secure: isSecure,
    tls: {
      rejectUnauthorized: config.reject_unauthorized !== false,
      minVersion: 'TLSv1.2',
    },
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 18000,
  };

  if (config.require_auth && config.smtp_user) {
    transportOptions.auth = {
      user: config.smtp_user.trim(),
      pass: config.smtp_pass || '',
    };
  }

  return nodemailer.createTransport(transportOptions);
}

/**
 * Translates common SMTP errors to user-friendly messages
 */
function parseSmtpError(err: any): { en: string; fa: string; code?: string } {
  const code = err.code || err.responseCode || 'SMTP_ERROR';
  const msg = err.message || String(err);

  if (msg.includes('535') || msg.includes('BadCredentials') || code === 'EAUTH') {
    return {
      en: `SMTP Authentication failed (535): Invalid username or password. For Gmail or Microsoft 365, ensure an App Password is used. Details: ${msg}`,
      fa: `احراز هویت سرور ایمیل ناموفق بود (کد ۵۳۵): نام کاربری یا رمز عبور نامعتبر است. در صورت استفاده از جیمیل یا اوت‌لوک، حتماً از App Password استفاده کنید. جزئیات: ${msg}`,
      code: 'EAUTH',
    };
  }

  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT' || msg.includes('timeout')) {
    return {
      en: `Connection timed out while connecting to SMTP server. Verify the server hostname, port, and outbound firewall rules. Details: ${msg}`,
      fa: `مهلت برقراری ارتباط با سرور ایمیل به پایان رسید (Timeout). نام سرور، شماره پورت و دسترسی فایروال را بررسی نمایید. جزئیات: ${msg}`,
      code: 'ETIMEDOUT',
    };
  }

  if (code === 'ECONNREFUSED') {
    return {
      en: `Connection refused by the target mail server. Check if the SMTP service is active and the port is open. Details: ${msg}`,
      fa: `ارتباط توسط سرور مقصد رد شد (Connection Refused). وضعیت سرویس ایمیل و باز بودن پورت را بررسی کنید. جزئیات: ${msg}`,
      code: 'ECONNREFUSED',
    };
  }

  if (code === 'ENOTFOUND') {
    return {
      en: `SMTP Hostname could not be resolved (DNS Error). Please verify the server address. Details: ${msg}`,
      fa: `آدرس هاست ایمیل در DNS یافت نشد (دامنه نامعتبر است). آدرس سرور را بررسی فرمایید. جزئیات: ${msg}`,
      code: 'ENOTFOUND',
    };
  }

  if (code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || msg.includes('self-signed') || msg.includes('certificate')) {
    return {
      en: `TLS Certificate verification failed (Self-Signed or Untrusted Certificate). Enable 'Allow Self-Signed / Untrusted TLS Certificates' if using an internal relay. Details: ${msg}`,
      fa: `اعتبارسنجی سرتیفیکیت TLS ناموفق بود (سرتیفیکیت نامعتبر یا Self-Signed). در صورت استفاده از میل سرور محلی، گزینه «پذیرش سرتیفیکیت‌های خودامضا» را فعال نمایید. جزئیات: ${msg}`,
      code: 'ECERT',
    };
  }

  return {
    en: `SMTP delivery failed: ${msg}`,
    fa: `خطا در ارسال ایمیل: ${msg}`,
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

  try {
    const transporter = createMailTransport(config);

    // 1. Verify credentials and socket connection first
    await transporter.verify();

    // 2. Prepare envelope
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

    const info = await transporter.sendMail(mailOptions);
    const latencyMs = Date.now() - startTime;

    return {
      success: true,
      messageId: info.messageId,
      response: info.response,
      latencyMs,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const parsed = parseSmtpError(err);
    return {
      success: false,
      error: parsed.en,
      error_fa: parsed.fa,
      code: parsed.code,
      latencyMs,
    };
  }
}
