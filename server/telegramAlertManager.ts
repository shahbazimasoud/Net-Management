import http from 'http';
import https from 'https';
import { URL } from 'url';
import { getTelegramConfig, TelegramAlertConfig } from './db';

export type AlertSeverity = 'critical' | 'warning' | 'resolved' | 'info';

export interface TelegramAlertMessage {
  title: string;
  level: AlertSeverity;
  message: string;
  details?: string;
  targetDevice?: {
    name?: string;
    ip?: string;
    platform?: string;
    type?: string;
    category?: string;
  };
  eventKey?: string; // Unique key for flap damping & de-duplication, e.g. "device:192.168.1.1:down"
  source?: string;
  timestamp?: string;
  metadata?: Record<string, any>;
}

export interface TelegramTestResult {
  success: boolean;
  botUsername?: string;
  botFirstName?: string;
  chatId?: string;
  chatTitle?: string;
  messageId?: number;
  error?: string;
  error_fa?: string;
  statusCode?: number;
  details?: any;
}

interface FlapRecord {
  firstOccurred: number;
  lastSent: number;
  suppressedCount: number;
  lastLevel: AlertSeverity;
}

// In-memory flap tracking and rate-limiting map
const flapTracker = new Map<string, FlapRecord>();

// Clean up old flap records every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of flapTracker.entries()) {
    if (now - record.lastSent > 3600000) { // 1 hour
      flapTracker.delete(key);
    }
  }
}, 600000);

/**
 * Escapes characters for Telegram HTML parse_mode
 */
function escapeHtml(text: string | undefined | null): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Formats a clean Persian timestamp and ISO timestamp
 */
function getFormattedTimestamps(): { fa: string; iso: string } {
  const now = new Date();
  const iso = now.toISOString();
  let fa = now.toLocaleString('fa-IR', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return { fa, iso };
}

/**
 * Low-level HTTP/HTTPS request dispatcher with proxy support
 */
function makeHttpRequest(
  targetUrl: string,
  options: {
    method: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    proxyUrl?: string;
    timeoutMs?: number;
  }
): Promise<{ statusCode: number; data: string; json?: any }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(targetUrl);
    const timeoutMs = options.timeoutMs || 15000;
    const bodyData = options.body;

    const reqHeaders: Record<string, string> = {
      'User-Agent': 'NetTopology-NOC-Alert-Manager/1.0',
      'Accept': 'application/json',
      ...(options.headers || {}),
    };

    if (bodyData) {
      reqHeaders['Content-Length'] = Buffer.byteLength(bodyData).toString();
      if (!reqHeaders['Content-Type']) {
        reqHeaders['Content-Type'] = 'application/json';
      }
    }

    const proxyStr = (options.proxyUrl || '').trim();

    // Case 1: HTTP CONNECT Proxy (e.g. http://127.0.0.1:8080)
    if (proxyStr.startsWith('http://') || proxyStr.startsWith('https://')) {
      try {
        const proxyObj = new URL(proxyStr);
        const proxyPort = parseInt(proxyObj.port, 10) || 8080;
        const proxyHost = proxyObj.hostname;

        const connectReq = http.request({
          host: proxyHost,
          port: proxyPort,
          method: 'CONNECT',
          path: `${urlObj.hostname}:${urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80)}`,
          headers: {
            'Host': `${urlObj.hostname}:${urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80)}`,
            'User-Agent': 'NetTopology-NOC-Alert-Manager/1.0',
            ...(proxyObj.username ? {
              'Proxy-Authorization': 'Basic ' + Buffer.from(`${decodeURIComponent(proxyObj.username)}:${decodeURIComponent(proxyObj.password)}`).toString('base64'),
            } : {}),
          },
          timeout: timeoutMs,
        });

        connectReq.on('connect', (_res, socket) => {
          const isHttps = urlObj.protocol === 'https:';
          const clientModule = isHttps ? https : http;

          const clientReq = (clientModule.request as any)({
            host: urlObj.hostname,
            port: urlObj.port ? Number(urlObj.port) : (isHttps ? 443 : 80),
            path: `${urlObj.pathname}${urlObj.search}`,
            method: options.method,
            headers: reqHeaders,
            createConnection: () => socket,
            agent: false,
            timeout: timeoutMs,
          }, (res: http.IncomingMessage) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              let parsedJson: any = null;
              try { parsedJson = JSON.parse(data); } catch {}
              resolve({ statusCode: res.statusCode || 200, data, json: parsedJson });
            });
          });

          clientReq.on('error', (err) => reject(err));
          clientReq.on('timeout', () => {
            clientReq.destroy(new Error(`Telegram proxy request timed out after ${timeoutMs}ms`));
          });

          if (bodyData) clientReq.write(bodyData);
          clientReq.end();
        });

        connectReq.on('error', (err) => reject(new Error(`Proxy connection error (${proxyHost}:${proxyPort}): ${err.message}`)));
        connectReq.on('timeout', () => {
          connectReq.destroy(new Error(`Proxy connection timed out after ${timeoutMs}ms`));
        });
        connectReq.end();
        return;
      } catch (err: any) {
        return reject(new Error(`Invalid proxy URL configuration: ${err.message}`));
      }
    }

    // Case 2: Direct connection to targetUrl (default)
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;

    const req = client.request({
      protocol: urlObj.protocol,
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: `${urlObj.pathname}${urlObj.search}`,
      method: options.method,
      headers: reqHeaders,
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsedJson: any = null;
        try { parsedJson = JSON.parse(data); } catch {}
        resolve({ statusCode: res.statusCode || 200, data, json: parsedJson });
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy(new Error(`Telegram request timed out after ${timeoutMs}ms`));
    });

    if (bodyData) req.write(bodyData);
    req.end();
  });
}

/**
 * Resolves the Telegram API base URL (allowing custom reverse proxies)
 */
function resolveTelegramBaseUrl(proxyUrl?: string): string {
  const p = (proxyUrl || '').trim();
  // If proxyUrl is a reverse proxy (e.g. https://teleproxy.company.internal or https://tapi.bale.ai)
  if (p && (p.startsWith('http://') || p.startsWith('https://')) && !p.includes(':1080') && !p.includes(':8080') && !p.includes(':3128')) {
    // If it looks like a reverse proxy endpoint rather than a forward proxy
    return p.replace(/\/+$/, '');
  }
  return 'https://api.telegram.org';
}

/**
 * Formats a Telegram Alert HTML message with NOC standards
 */
export function formatTelegramAlertHtml(msg: TelegramAlertMessage, suppressedCount: number = 0): string {
  const times = getFormattedTimestamps();

  let levelIcon = 'ℹ️';
  let levelTitle = 'INFO / اطلاع‌رسانی';

  switch (msg.level) {
    case 'critical':
      levelIcon = '🔴';
      levelTitle = 'CRITICAL ALERT / رویداد بحرانی';
      break;
    case 'warning':
      levelIcon = '🟡';
      levelTitle = 'WARNING / اخطار شبکه';
      break;
    case 'resolved':
      levelIcon = '🟢';
      levelTitle = 'RESOLVED / رفع اختلال';
      break;
    case 'info':
      levelIcon = 'ℹ️';
      levelTitle = 'SYSTEM NOTICE / اعلان سیستم';
      break;
  }

  const lines: string[] = [
    `${levelIcon} <b>[${levelTitle}]</b>`,
    `<b>📌 عنوان:</b> <code>${escapeHtml(msg.title)}</code>`,
  ];

  if (msg.targetDevice) {
    const dev = msg.targetDevice;
    const devName = escapeHtml(dev.name || 'Unknown');
    const devIp = escapeHtml(dev.ip || '-');
    const devType = escapeHtml(dev.type || dev.platform || 'Network Equipment');
    lines.push(`🏢 <b>تجهیز هدف:</b> <code>${devName}</code> (${devIp}) [${devType}]`);
  }

  lines.push('');
  lines.push(`⚠️ <b>شرح رویداد:</b>`);
  lines.push(escapeHtml(msg.message));

  if (msg.details) {
    lines.push('');
    lines.push(`🔍 <b>جزئیات فنی:</b>`);
    lines.push(`<pre>${escapeHtml(msg.details.slice(0, 1000))}</pre>`);
  }

  if (suppressedCount > 0) {
    lines.push('');
    lines.push(`🛡️ <i>(مکانیزم ضد رگبار: ${suppressedCount} رویداد مشابه قبلی ادغام شد)</i>`);
  }

  lines.push('');
  lines.push(`⏱ <b>زمان:</b> <code>${times.fa}</code> (IRDT)`);
  lines.push(`🌐 <i>سامانه مدیریت هوشمند زیرساخت NetTopology NOC</i>`);

  return lines.join('\n');
}

/**
 * Dispatches an automated incident or telemetry alert to Telegram
 */
export async function sendTelegramAlert(
  msg: TelegramAlertMessage,
  explicitConfig?: TelegramAlertConfig
): Promise<{ success: boolean; dispatched: boolean; messageId?: number; error?: string; suppressed?: boolean }> {
  try {
    const config = explicitConfig || await getTelegramConfig();

    if (!config.enabled) {
      return { success: false, dispatched: false, error: 'Telegram alert engine is disabled in settings.' };
    }

    if (!config.bot_token || !config.chat_id) {
      return { success: false, dispatched: false, error: 'Telegram Bot Token or Chat ID is not configured.' };
    }

    // Check event category filters
    if (msg.eventKey) {
      if (msg.eventKey.includes(':down') && !config.notify_on_host_down) {
        return { success: true, dispatched: false, error: 'Host down notifications are disabled in filter settings.' };
      }
      if (msg.eventKey.includes(':port_') && !config.notify_on_port_down) {
        return { success: true, dispatched: false, error: 'Port state notifications are disabled in filter settings.' };
      }
      if (msg.eventKey.includes(':cpu') && !config.notify_on_high_cpu) {
        return { success: true, dispatched: false, error: 'High CPU notifications are disabled in filter settings.' };
      }
      if (msg.eventKey.includes(':backup_failed') && !config.notify_on_backup_failure) {
        return { success: true, dispatched: false, error: 'Backup failure notifications are disabled in filter settings.' };
      }
      if (msg.eventKey.includes(':security') && !config.notify_on_security_events) {
        return { success: true, dispatched: false, error: 'Security event notifications are disabled in filter settings.' };
      }
    }

    // Flap Damping & Throttling
    const dampingSec = config.anti_flap_damping_sec || 60;
    const now = Date.now();
    let suppressedCount = 0;

    if (msg.eventKey) {
      const existing = flapTracker.get(msg.eventKey);
      if (existing) {
        const elapsed = (now - existing.lastSent) / 1000;
        // If state hasn't changed and within damping window, suppress
        if (elapsed < dampingSec && existing.lastLevel === msg.level) {
          existing.suppressedCount += 1;
          return { success: true, dispatched: false, suppressed: true, error: `Flap damped: alert suppressed for ${dampingSec - Math.floor(elapsed)}s.` };
        }
        suppressedCount = existing.suppressedCount;
      }

      flapTracker.set(msg.eventKey, {
        firstOccurred: existing ? existing.firstOccurred : now,
        lastSent: now,
        suppressedCount: 0,
        lastLevel: msg.level,
      });
    }

    const text = formatTelegramAlertHtml(msg, suppressedCount);
    const baseUrl = resolveTelegramBaseUrl(config.proxy_url);
    const targetUrl = `${baseUrl}/bot${config.bot_token}/sendMessage`;

    const payload = JSON.stringify({
      chat_id: config.chat_id,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });

    const res = await makeHttpRequest(targetUrl, {
      method: 'POST',
      body: payload,
      proxyUrl: config.proxy_url,
      timeoutMs: 15000,
    });

    if (res.statusCode >= 200 && res.statusCode < 300 && res.json?.ok) {
      return {
        success: true,
        dispatched: true,
        messageId: res.json?.result?.message_id,
      };
    }

    const errMsg = res.json?.description || `Telegram API error (${res.statusCode}): ${res.data}`;
    console.error('[TelegramAlertManager] Send error:', errMsg);
    return { success: false, dispatched: false, error: errMsg };
  } catch (err: any) {
    console.error('[TelegramAlertManager] Exception during alert dispatch:', err.message);
    return { success: false, dispatched: false, error: err.message };
  }
}

/**
 * Sends a live test alert to verify Telegram Bot Token and Chat ID
 */
export async function sendTelegramTestAlert(params: {
  botToken?: string;
  chatId?: string;
  proxyUrl?: string;
  requestedBy?: string;
}): Promise<TelegramTestResult> {
  const current = await getTelegramConfig();
  const token = (params.botToken || current.bot_token || '').trim();
  const chatId = (params.chatId || current.chat_id || '').trim();
  const proxyUrl = (params.proxyUrl !== undefined ? params.proxyUrl : current.proxy_url || '').trim();
  const requestedBy = params.requestedBy || 'admin';

  if (!token) {
    return {
      success: false,
      error: 'Bot Token is required. Please obtain a bot token from @BotFather on Telegram.',
      error_fa: 'توکن ربات الزامی است. لطفاً از طریق ربات رسمی BotFather@ یک توکن دریافت کرده و وارد نمایید.',
    };
  }

  if (!chatId) {
    return {
      success: false,
      error: 'Chat ID or Channel Username is required (e.g. @MyChannel or -1001234567890).',
      error_fa: 'شناسه چت یا نام‌کاربری کانال الزامی است (مانند MyChannel@ یا شناسه عددی -100...).',
    };
  }

  // 1. Verify Bot via /getMe
  const baseUrl = resolveTelegramBaseUrl(proxyUrl);
  let botUsername = '';
  let botFirstName = '';

  try {
    const getMeUrl = `${baseUrl}/bot${token}/getMe`;
    const getMeRes = await makeHttpRequest(getMeUrl, {
      method: 'GET',
      proxyUrl: proxyUrl,
      timeoutMs: 12000,
    });

    if (!getMeRes.json?.ok) {
      const desc = getMeRes.json?.description || getMeRes.data || 'Invalid Bot Token';
      return {
        success: false,
        statusCode: getMeRes.statusCode,
        error: `Telegram authentication failed: ${desc}`,
        error_fa: `اعتبارسنجی توکن در تلگرام ناموفق بود: ${desc}`,
        details: getMeRes.json,
      };
    }

    botUsername = getMeRes.json?.result?.username || 'UnknownBot';
    botFirstName = getMeRes.json?.result?.first_name || 'NOC Bot';
  } catch (err: any) {
    return {
      success: false,
      error: `Network connection to Telegram failed: ${err.message}`,
      error_fa: `برقراری ارتباط با تلگرام با خطا مواجه شد (لطفاً پروکسی یا اتصال اینترنت سرور را بررسی کنید): ${err.message}`,
    };
  }

  // 2. Dispatch Test Message via /sendMessage
  try {
    const times = getFormattedTimestamps();
    const testMessageText = [
      `🚀 <b>[تست موفقیت‌آمیز ارتباط با تلگرام]</b>`,
      `<b>🛡️ سامانه مانیتورینگ و مدیریت شبکه NetTopology NOC</b>`,
      ``,
      `✅ ارتباط ربات تلگرام با هسته مانیتورینگ سرور با موفقیت برقرار شد.`,
      `🤖 <b>نام ربات:</b> <code>${escapeHtml(botFirstName)}</code> (@${escapeHtml(botUsername)})`,
      `🎯 <b>مقصد اعلان‌ها:</b> <code>${escapeHtml(chatId)}</code>`,
      `👤 <b>درخواست‌کننده تست:</b> <code>${escapeHtml(requestedBy)}</code>`,
      ``,
      `⏱ <b>زمان ارسال تست:</b> <code>${times.fa}</code> (IRDT)`,
      `ℹ️ <i>از این پس کلیه هشدارهای بحرانی، قطعی سوییچ‌ها، وضعیت پورت‌ها و گزارش‌های سلامت شبکه به این مقصد مخابره خواهد شد.</i>`,
    ].join('\n');

    const sendUrl = `${baseUrl}/bot${token}/sendMessage`;
    const sendPayload = JSON.stringify({
      chat_id: chatId,
      text: testMessageText,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });

    const sendRes = await makeHttpRequest(sendUrl, {
      method: 'POST',
      body: sendPayload,
      proxyUrl: proxyUrl,
      timeoutMs: 15000,
    });

    if (sendRes.json?.ok) {
      return {
        success: true,
        botUsername,
        botFirstName,
        chatId,
        chatTitle: sendRes.json?.result?.chat?.title || sendRes.json?.result?.chat?.username || chatId,
        messageId: sendRes.json?.result?.message_id,
      };
    }

    const desc = sendRes.json?.description || sendRes.data || 'Failed to dispatch message';
    let hintFa = 'ارسال پیام به مقصد با خطا مواجه شد.';
    if (desc.includes('chat not found')) {
      hintFa = 'چت یا کانال یافت نشد. اطمینان حاصل کنید که ربات را به کانال اضافه کرده و دسترسی Admin به آن داده‌اید، یا نام‌کاربری کانال را درست نوشته‌اید.';
    } else if (desc.includes('bot was blocked')) {
      hintFa = 'کاربر ربات را مسدود (بلاک) کرده است. وارد پیوی ربات شده و دکمه Start را بزنید.';
    } else if (desc.includes('not a member') || desc.includes('not enough rights')) {
      hintFa = 'ربات دسترسی لازم برای ارسال پیام ندارد. لطفاً ربات را به کانال/گروه اضافه کرده و دسترسی "Post Messages" را به آن اعطا نمایید.';
    }

    return {
      success: false,
      statusCode: sendRes.statusCode,
      botUsername,
      botFirstName,
      error: `Telegram dispatch failed: ${desc}`,
      error_fa: `${hintFa} (${desc})`,
      details: sendRes.json,
    };
  } catch (err: any) {
    return {
      success: false,
      botUsername,
      botFirstName,
      error: `Failed to deliver test message: ${err.message}`,
      error_fa: `خطا در ارسال پیام به تلگرام: ${err.message}`,
    };
  }
}
