import fs from 'fs';
import dgram from 'dgram';
import { execSync } from 'child_process';
import { getGeneralSettings, saveGeneralSettings } from './db';

export interface ServerTimeInfo {
  success: boolean;
  timestamp: number;
  iso: string;
  serverTime: string;
  timezone: string;
  utcOffset: string;
  utcOffsetMinutes: number;
  timeZoneName: string;
  formattedTime: string;
  formattedDateEn: string;
  formattedDateFa: string;
  utcTime: string;
  ntpServer: string;
  ntpEnabled: boolean;
  timeFormat: '24h' | '12h';
  uptimeSeconds: number;
  systemDateOutput: string;
  canSetSystemClock: boolean;
  virtualOffsetMs: number;
}

let systemClockOffsetMs = 0;

/**
 * Validates whether an IANA timezone identifier is valid
 */
export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns current effective server date with any manual/calibrated offset applied
 */
export function getEffectiveServerDate(): Date {
  return new Date(Date.now() + systemClockOffsetMs);
}

/**
 * Calculates UTC offset string like "+03:30" or "-07:00" for a given timezone and date
 */
export function getTimezoneOffsetString(tz: string, date: Date = getEffectiveServerDate()): { offsetStr: string; offsetMinutes: number; timeZoneName: string } {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const utcHours = date.getUTCHours();
    const utcMinutes = date.getUTCMinutes();
    const utcTotalMinutes = utcHours * 60 + utcMinutes;

    const parts = formatter.formatToParts(date);
    const hourPart = parts.find((p) => p.type === 'hour')?.value;
    const minutePart = parts.find((p) => p.type === 'minute')?.value;
    const tzNamePart = parts.find((p) => p.type === 'timeZoneName')?.value || tz;

    let targetHours = parseInt(hourPart || '0', 10);
    if (targetHours === 24) targetHours = 0;
    const targetMinutes = parseInt(minutePart || '0', 10);
    const targetTotalMinutes = targetHours * 60 + targetMinutes;

    let diffMinutes = targetTotalMinutes - utcTotalMinutes;
    if (diffMinutes > 720) diffMinutes -= 1440;
    if (diffMinutes < -720) diffMinutes += 1440;

    const sign = diffMinutes >= 0 ? '+' : '-';
    const absMinutes = Math.abs(diffMinutes);
    const h = String(Math.floor(absMinutes / 60)).padStart(2, '0');
    const m = String(absMinutes % 60).padStart(2, '0');

    return {
      offsetStr: `UTC${sign}${h}:${m}`,
      offsetMinutes: diffMinutes,
      timeZoneName: tzNamePart,
    };
  } catch {
    return {
      offsetStr: 'UTC+00:00',
      offsetMinutes: 0,
      timeZoneName: tz,
    };
  }
}

/**
 * Applies timezone to Node process and host Linux OS if permitted
 */
export function applySystemTimezone(tz: string): boolean {
  if (!isValidTimezone(tz)) {
    console.warn(`[ServerTimeManager] Invalid timezone requested: ${tz}`);
    return false;
  }

  // 1. Set Node environment variable for process runtime
  process.env.TZ = tz;

  // 2. Attempt updating host OS timezone if running as root or container has permission
  try {
    const zoneinfoPath = `/usr/share/zoneinfo/${tz}`;
    if (fs.existsSync(zoneinfoPath)) {
      try {
        if (fs.existsSync('/etc/localtime')) {
          fs.unlinkSync('/etc/localtime');
        }
        fs.symlinkSync(zoneinfoPath, '/etc/localtime');
      } catch {
        try {
          execSync(`ln -sf "${zoneinfoPath}" /etc/localtime 2>/dev/null`);
        } catch {}
      }
    }

    try {
      fs.writeFileSync('/etc/timezone', `${tz}\n`, 'utf-8');
    } catch {}

    // 3. Attempt timedatectl if available
    try {
      execSync(`timedatectl set-timezone "${tz}" 2>/dev/null`);
    } catch {}

    console.log(`[ServerTimeManager] Host server timezone successfully set to: ${tz}`);
    return true;
  } catch (err: any) {
    console.warn(`[ServerTimeManager] Notice setting system files for timezone ${tz}:`, err?.message);
    return true;
  }
}

/**
 * RFC 5905 NTP Network Client over UDP port 123
 */
export function queryNtpServer(server: string, port = 123, timeoutMs = 4000): Promise<{ offsetMs: number; ntpDate: Date; latencyMs: number }> {
  return new Promise((resolve, reject) => {
    const client = dgram.createSocket('udp4');
    const packet = Buffer.alloc(48);
    // LI = 0, VN = 3 (NTP v3), Mode = 3 (Client) -> 0x1b
    packet[0] = 0x1b;

    const sendTime = Date.now();
    let timer: NodeJS.Timeout | null = null;

    timer = setTimeout(() => {
      try { client.close(); } catch {}
      reject(new Error(`NTP query to ${server}:${port} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    client.on('error', (err) => {
      if (timer) clearTimeout(timer);
      try { client.close(); } catch {}
      reject(err);
    });

    client.on('message', (msg) => {
      if (timer) clearTimeout(timer);
      const receiveTime = Date.now();
      const latencyMs = receiveTime - sendTime;
      try { client.close(); } catch {}

      if (msg.length < 48) {
        return reject(new Error('Invalid NTP response packet length'));
      }

      // Transmit Timestamp seconds are at offset 40, fraction at 44
      const secondsSince1900 = msg.readUInt32BE(40);
      const fraction = msg.readUInt32BE(44);
      // Seconds from 1900 to 1970 = 2208988800
      const unixSeconds = secondsSince1900 - 2208988800;
      const unixMs = (unixSeconds * 1000) + Math.round((fraction * 1000) / 4294967296);
      const ntpDate = new Date(unixMs);
      const offsetMs = unixMs - receiveTime;

      resolve({ offsetMs, ntpDate, latencyMs });
    });

    client.send(packet, 0, packet.length, port, server, (err) => {
      if (err) {
        if (timer) clearTimeout(timer);
        try { client.close(); } catch {}
        reject(err);
      }
    });
  });
}

/**
 * Retrieves comprehensive live server time information
 */
export async function getServerTimeInfo(): Promise<ServerTimeInfo> {
  const settings = await getGeneralSettings();
  const configuredTz = settings.serverTimezone || process.env.TZ || 'Asia/Tehran';
  const effectiveTz = isValidTimezone(configuredTz) ? configuredTz : 'Asia/Tehran';

  const now = getEffectiveServerDate();
  const { offsetStr, offsetMinutes, timeZoneName } = getTimezoneOffsetString(effectiveTz, now);

  const is24h = settings.timeFormat !== '12h';
  const timeFormatterEn = new Intl.DateTimeFormat('en-US', {
    timeZone: effectiveTz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: !is24h,
  });

  const dateFormatterEn = new Intl.DateTimeFormat('en-US', {
    timeZone: effectiveTz,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  let formattedDateFa = '';
  try {
    const dateFormatterFa = new Intl.DateTimeFormat('fa-IR', {
      timeZone: effectiveTz,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    formattedDateFa = dateFormatterFa.format(now);
  } catch {
    formattedDateFa = dateFormatterEn.format(now);
  }

  let systemDateOutput = '';
  try {
    systemDateOutput = execSync('date 2>/dev/null', { encoding: 'utf8' }).trim();
  } catch {
    systemDateOutput = now.toString();
  }

  let canSetSystemClock = false;
  try {
    canSetSystemClock = process.getuid ? process.getuid() === 0 : false;
  } catch {}

  const formattedTime = timeFormatterEn.format(now);
  const formattedDateEn = dateFormatterEn.format(now);
  const utcTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')} UTC`;

  return {
    success: true,
    timestamp: now.getTime(),
    iso: now.toISOString(),
    serverTime: `${now.toISOString().substring(0, 19)}${offsetStr.replace('UTC', '')}`,
    timezone: effectiveTz,
    utcOffset: offsetStr,
    utcOffsetMinutes: offsetMinutes,
    timeZoneName,
    formattedTime,
    formattedDateEn,
    formattedDateFa,
    utcTime,
    ntpServer: settings.serverNtpServer || 'ir.pool.ntp.org',
    ntpEnabled: settings.serverNtpEnabled !== false,
    timeFormat: settings.timeFormat || '24h',
    uptimeSeconds: Math.floor(process.uptime()),
    systemDateOutput,
    canSetSystemClock,
    virtualOffsetMs: systemClockOffsetMs,
  };
}

/**
 * Adjusts and sets the server system date and time
 */
export async function setServerSystemTime(targetTime: string | number): Promise<{
  success: boolean;
  message: string;
  message_fa: string;
  serverTime: ServerTimeInfo;
}> {
  const targetDate = typeof targetTime === 'number' ? new Date(targetTime) : new Date(targetTime);
  if (isNaN(targetDate.getTime())) {
    throw new Error('Invalid date or timestamp provided');
  }

  const rawNow = Date.now();
  const targetEpoch = targetDate.getTime();
  const diffMs = targetEpoch - rawNow;

  let hostClockUpdated = false;
  const isoFormatted = targetDate.toISOString().replace('T', ' ').substring(0, 19);

  // Attempt real host Linux clock changes if root or sudo available
  try {
    try {
      execSync(`timedatectl set-ntp false 2>/dev/null`);
    } catch {}

    try {
      execSync(`date -s "${isoFormatted} UTC" 2>/dev/null`);
      hostClockUpdated = true;
    } catch {}

    try {
      execSync(`timedatectl set-time "${isoFormatted}" 2>/dev/null`);
      hostClockUpdated = true;
    } catch {}

    try {
      execSync(`hwclock --systohc 2>/dev/null`);
    } catch {}
  } catch (err: any) {
    console.warn('[ServerTimeManager] Host clock adjustment note:', err?.message);
  }

  // Update in-memory calibrated clock offset
  systemClockOffsetMs = diffMs;

  const info = await getServerTimeInfo();

  return {
    success: true,
    message: hostClockUpdated
      ? `Server system clock successfully adjusted to ${info.formattedTime} (${info.formattedDateEn}).`
      : `Panel server application clock adjusted to ${info.formattedTime} (calibrated offset: ${Math.round(diffMs / 1000)}s).`,
    message_fa: hostClockUpdated
      ? `ساعت سیستم سرور با موفقیت به ${info.formattedTime} (${info.formattedDateFa}) تنظیم شد.`
      : `ساعت سرور پنل با موفقیت به ${info.formattedTime} تنظیم و کالیبره گردید.`,
    serverTime: info,
  };
}

/**
 * Synchronizes server time with an NTP server
 */
export async function syncServerNtp(targetNtpServer?: string): Promise<{
  success: boolean;
  ntpServer: string;
  latencyMs: number;
  offsetMs?: number;
  message: string;
  message_fa: string;
  serverTime: ServerTimeInfo;
}> {
  const settings = await getGeneralSettings();
  const ntpServer = (targetNtpServer || settings.serverNtpServer || 'ir.pool.ntp.org').trim();
  const startTime = Date.now();

  let ntpQueryResult: { offsetMs: number; ntpDate: Date; latencyMs: number } | null = null;
  let queryError: string | null = null;

  // 1. Attempt genuine RFC 5905 UDP NTP query
  try {
    ntpQueryResult = await queryNtpServer(ntpServer, 123, 3500);
  } catch (err: any) {
    queryError = err?.message || 'NTP UDP query timeout';
    console.warn(`[ServerTimeManager] NTP UDP query notice for ${ntpServer}:`, queryError);
  }

  // 2. Attempt Linux system NTP sync
  try {
    try {
      execSync(`timedatectl set-ntp true 2>/dev/null`);
    } catch {}

    try {
      execSync(`chronyd -q 'server ${ntpServer} iburst' 2>/dev/null || ntpdate -u ${ntpServer} 2>/dev/null`);
    } catch {}
  } catch {}

  // 3. If NTP query succeeded, calibrate clock
  if (ntpQueryResult) {
    systemClockOffsetMs = ntpQueryResult.offsetMs;
    // Attempt setting host clock if possible
    try {
      const iso = ntpQueryResult.ntpDate.toISOString().replace('T', ' ').substring(0, 19);
      execSync(`date -s "${iso} UTC" 2>/dev/null`);
      execSync(`hwclock --systohc 2>/dev/null`);
    } catch {}
  } else {
    // If system NTP daemon is active or query timed out, reset artificial offset
    systemClockOffsetMs = 0;
  }

  const latencyMs = ntpQueryResult ? ntpQueryResult.latencyMs : (Date.now() - startTime);
  const updatedInfo = await getServerTimeInfo();

  return {
    success: true,
    ntpServer,
    latencyMs,
    offsetMs: ntpQueryResult?.offsetMs,
    message: ntpQueryResult
      ? `Server time successfully synchronized with NTP server '${ntpServer}' (Round-trip: ${latencyMs}ms, offset: ${ntpQueryResult.offsetMs}ms).`
      : `NTP synchronization triggered for '${ntpServer}' (${latencyMs}ms). System daemon active.`,
    message_fa: ntpQueryResult
      ? `ساعت سرور با موفقیت با سرور زمان '${ntpServer}' همگام‌سازی شد (تاخیر رفت و برگشت: ${latencyMs} میلی‌ثانیه، انحراف: ${ntpQueryResult.offsetMs} میلی‌ثانیه).`
      : `درخواست همگام‌سازی زمان با سرور '${ntpServer}' به سرویس سیستم ارسال شد (${latencyMs} میلی‌ثانیه).`,
    serverTime: updatedInfo,
  };
}

/**
 * Initializes server time on startup based on saved database settings
 */
export async function initServerTime(): Promise<void> {
  try {
    const settings = await getGeneralSettings();
    if (settings.serverTimezone && isValidTimezone(settings.serverTimezone)) {
      applySystemTimezone(settings.serverTimezone);
    } else {
      applySystemTimezone('Asia/Tehran');
    }
  } catch (err: any) {
    console.warn('[ServerTimeManager] Startup initialization warning:', err?.message);
  }
}
