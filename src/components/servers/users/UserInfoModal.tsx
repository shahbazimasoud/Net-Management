import React, { useState, useEffect } from 'react';
import {
  Info,
  X,
  Minus,
  Maximize2,
  Minimize2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  Calendar,
  Clock,
  KeyRound,
  Globe,
  Terminal,
  Activity,
  UserCheck,
  Copy,
  Check,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { RemoteServer, LinuxSystemUser, LinuxUserSecurityInfo } from '../../../types';
import { fetchLinuxUserSecurityInfo } from '../../../services/api';
import { FieldInfoTooltip } from '../../common/FieldInfoTooltip';

interface UserInfoModalProps {
  server: RemoteServer;
  user: LinuxSystemUser;
  ephemeralPassword?: string;
  isLightMode?: boolean;
  isEn?: boolean;
  onClose: () => void;
  onEditUser?: () => void;
}

export const UserInfoModal: React.FC<UserInfoModalProps> = ({
  server,
  user,
  ephemeralPassword,
  isLightMode = false,
  isEn = true,
  onClose,
  onEditUser,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<LinuxUserSecurityInfo | null>(null);
  const [copiedIp, setCopiedIp] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchLinuxUserSecurityInfo(server.id, user.username, ephemeralPassword);
      if (res.success && res.data) {
        setInfo(res.data);
      } else {
        setError(res.error || (isEn ? 'Failed to retrieve user security audit' : 'خطا در دریافت اطلاعات امنیتی کاربر'));
      }
    } catch (err: any) {
      setError(err?.message || (isEn ? 'Network error fetching user audit' : 'خطای شبکه در دریافت ممیزی کاربر'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [server.id, user.username]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIp(text);
    setTimeout(() => setCopiedIp(null), 2000);
  };

  const isIpPrivate = (ip: string) => {
    if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
    if (ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
    return false;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div
        className={`flex flex-col border shadow-2xl transition-all duration-200 overflow-hidden ${
          isMaximized
            ? 'fixed top-0 left-0 right-0 bottom-8 z-50 p-0 w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-3xl max-h-[92vh] rounded-2xl'
        } ${isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'}`}
      >
        {/* Header with Mandatory 3 Controls */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${
            isLightMode ? 'bg-slate-100/80 border-slate-200' : 'bg-slate-900/80 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/15 text-cyan-400">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold">
                  {isEn ? `User Security Audit: ${user.username}` : `گزارش امنیتی و اتصالات کاربر: ${user.username}`}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  UID {user.uid}
                </span>
                <FieldInfoTooltip
                  title={isEn ? 'Linux User Security Audit' : 'ممیزی امنیتی کاربر لینوکس'}
                  whatIsIt={isEn
                    ? 'Gathers authentic, real-time audit details directly from /etc/shadow, chage, lastlog, last, and active login sessions via SSH.'
                    : 'استخراج داده‌های زنده و واقعی مستقیماً از فایل shadow و دستورات chage، lastlog و نشست‌های فعال سرور.'}
                  whyNeeded={isEn
                    ? 'Essential for cybersecurity compliance, credential age monitoring, expiration verification, and incident response.'
                    : 'برای انطباق امنیتی، نظارت بر انقضای حساب‌ها، تغییر به‌موقع رمزها و ردیابی آی‌پی‌های متصل شونده کاربر ضروری است.'}
                  practicalExample={isEn
                    ? 'Audits chage -l <user>, lastlog -u <user>, and last <user>.'
                    : 'تحلیل امنیتی دستورات chage -l و lastlog و last کاربر.'}
                />
              </div>
              <p className="text-xs text-slate-400 font-mono">
                {server.name || server.ip} • {user.shell}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={loadData}
              title={isEn ? 'Refresh' : 'تازه‌سازی'}
              disabled={loading}
              className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-white/5 transition cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Minimize' : 'کوچک‌سازی'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition cursor-pointer"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isEn ? (isMaximized ? 'Exit Fullscreen' : 'Fullscreen') : isMaximized ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition cursor-pointer"
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Close' : 'بستن'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 custom-scrollbar">
          {error && (
            <div
              className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-mono ${
                isLightMode ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
              }`}
            >
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {loading && !info && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
              <p className="text-xs text-slate-400 font-mono">
                {isEn ? 'Auditing user credentials and login history from remote server...' : 'در حال واکشی اطلاعات امنیتی و تاریخچه ورود کاربر از سرور...'}
              </p>
            </div>
          )}

          {info && (
            <>
              {/* Summary 4-Grid Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 1. Account Lock Status */}
                <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                  info.isLocked
                    ? isLightMode ? 'bg-rose-50 border-rose-200' : 'bg-rose-950/20 border-rose-500/30'
                    : isLightMode ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-950/20 border-emerald-500/30'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      {isEn ? 'Lock Status' : 'وضعیت قفل'}
                    </span>
                    {info.isLocked ? (
                      <Lock className="w-4 h-4 text-rose-400" />
                    ) : (
                      <Unlock className="w-4 h-4 text-emerald-400" />
                    )}
                  </div>
                  <div>
                    <span className={`text-sm font-bold block ${info.isLocked ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {info.isLocked ? (isEn ? 'Locked / Disabled' : 'قفل شده') : (isEn ? 'Unlocked / Active' : 'فعال و آزاد')}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {info.isLocked
                        ? (isEn ? 'Password logins blocked in shadow' : 'ورود با رمز در shadow مسدود است')
                        : (isEn ? 'Interactive auth enabled' : 'احراز هویت مجاز است')}
                    </span>
                  </div>
                </div>

                {/* 2. Account Expiration */}
                <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                  info.isExpired
                    ? isLightMode ? 'bg-rose-50 border-rose-200' : 'bg-rose-950/20 border-rose-500/30'
                    : info.daysUntilExpire !== null && info.daysUntilExpire <= 14
                    ? isLightMode ? 'bg-amber-50 border-amber-200' : 'bg-amber-950/20 border-amber-500/30'
                    : isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      {isEn ? 'Account Expiration' : 'انقضای حساب'}
                    </span>
                    <Calendar className={`w-4 h-4 ${
                      info.isExpired ? 'text-rose-400' : info.daysUntilExpire !== null && info.daysUntilExpire <= 14 ? 'text-amber-400' : 'text-cyan-400'
                    }`} />
                  </div>
                  <div>
                    <span className={`text-sm font-bold block ${
                      info.isExpired ? 'text-rose-400' : info.daysUntilExpire !== null && info.daysUntilExpire <= 14 ? 'text-amber-400' : ''
                    }`}>
                      {info.isExpired
                        ? (isEn ? 'Account Expired' : 'منقضی شده')
                        : info.daysUntilExpire !== null
                        ? (isEn ? `${info.daysUntilExpire} Days Left` : `${info.daysUntilExpire} روز باقی‌مانده`)
                        : (isEn ? 'Never Expires' : 'همیشگی (بدون انقضا)')}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5 font-mono truncate" title={info.accountExpires}>
                      {info.accountExpires !== 'Never' ? info.accountExpires : (isEn ? 'Permanent Account' : 'حساب دائمی')}
                    </span>
                  </div>
                </div>

                {/* 3. Last Password Change */}
                <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                  info.mustChangePassword
                    ? isLightMode ? 'bg-amber-50 border-amber-200' : 'bg-amber-950/20 border-amber-500/30'
                    : isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      {isEn ? 'Password Age' : 'سن رمز عبور'}
                    </span>
                    <KeyRound className={`w-4 h-4 ${info.mustChangePassword ? 'text-amber-400' : 'text-amber-400/80'}`} />
                  </div>
                  <div>
                    <span className={`text-sm font-bold block ${info.mustChangePassword ? 'text-amber-400' : ''}`}>
                      {info.mustChangePassword
                        ? (isEn ? 'Must Change' : 'الزام به تغییر رمز')
                        : (isEn ? 'Up to date' : 'معتبر')}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5 font-mono truncate" title={info.lastPasswordChange}>
                      {isEn ? 'Last changed: ' : 'آخرین تغییر: '}{info.lastPasswordChange}
                    </span>
                  </div>
                </div>

                {/* 4. Last Login */}
                <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      {isEn ? 'Last Login' : 'آخرین ورود'}
                    </span>
                    <Clock className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div>
                    <span className="text-sm font-bold block font-mono truncate">
                      {info.lastLogin ? (info.lastLogin.ip || info.lastLogin.tty || 'Active') : (isEn ? 'Never Logged In' : 'تاکنون وارد نشده')}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5 font-mono truncate" title={info.lastLogin?.time || ''}>
                      {info.lastLogin?.time || (isEn ? 'No previous session recorded' : 'هیچ نشستی ثبت نشده')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Connected IP Addresses Section */}
              <div className={`p-4 rounded-xl border ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-800'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold">
                      {isEn ? 'Connected & Source IP Addresses' : 'آدرس‌های IP متصل‌شده به این حساب'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      {info.uniqueIps.length} {isEn ? 'IPs' : 'آی‌پی'}
                    </span>
                  </div>
                  <FieldInfoTooltip
                    title={isEn ? 'Connected Remote IP History' : 'تاریخچه آی‌پی‌های متصل'}
                    whatIsIt={isEn
                      ? 'Extracts distinct network IP addresses from authentication history, lastlog records, and wtmp/utmp logs.'
                      : 'فهرست آدرس‌های آی‌پی شبکه‌ای که این کاربر از طریق آن‌ها لاگین کرده است (استخراج شده از wtmp و lastlog).'}
                    whyNeeded={isEn
                      ? 'Crucial for detecting unauthorized access from unfamiliar locations, foreign IPs, or anomalous networks.'
                      : 'شناسایی و ردیابی ورودهای غیرمجاز، بررسی دسترسی‌ها از شبکه‌های ناشناخته یا کشورهای خارجی.'}
                    practicalExample={isEn ? '192.168.1.105, 10.8.0.42, 5.120.30.12' : '192.168.1.105, 10.8.0.42'}
                  />
                </div>

                {info.uniqueIps.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400 font-mono">
                    {isEn ? 'No remote IP connections recorded for this account.' : 'هیچ آدرس IP اتصالی برای این کاربر در لاگ‌های سرور ثبت نشده است.'}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {info.uniqueIps.map((ip) => {
                      const isPriv = isIpPrivate(ip);
                      const isCopied = copiedIp === ip;
                      return (
                        <div
                          key={ip}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono text-xs transition ${
                            isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-200'
                          }`}
                        >
                          <Globe className={`w-3.5 h-3.5 ${isPriv ? 'text-cyan-400' : 'text-emerald-400'}`} />
                          <span className="font-semibold">{ip}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                            isPriv
                              ? isLightMode ? 'bg-slate-100 text-slate-600' : 'bg-slate-900 text-slate-400'
                              : isLightMode ? 'bg-emerald-50 text-emerald-700' : 'bg-emerald-950/60 text-emerald-300'
                          }`}>
                            {isPriv ? (isEn ? 'Private/LAN' : 'شبکه داخلی') : (isEn ? 'Public WAN' : 'اینترنت عمومی')}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(ip)}
                            title={isEn ? 'Copy IP' : 'کپی آی‌پی'}
                            className="text-slate-400 hover:text-cyan-400 transition cursor-pointer ml-1"
                          >
                            {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Active Sessions (if any) */}
              {info.activeSessions && info.activeSessions.length > 0 && (
                <div className={`p-4 rounded-xl border ${
                  isLightMode ? 'bg-cyan-50/50 border-cyan-200' : 'bg-cyan-950/15 border-cyan-500/20'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
                      <span className="text-xs font-bold text-cyan-400">
                        {isEn ? 'Currently Active Sessions' : 'نشست‌های فعال کنونی'}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/20 text-cyan-300">
                        {info.activeSessions.length} {isEn ? 'live' : 'فعال'}
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr className="text-left text-[11px] text-slate-400 border-b border-cyan-500/20">
                          <th className="pb-2 font-medium">{isEn ? 'TTY' : 'ترمینال'}</th>
                          <th className="pb-2 font-medium">{isEn ? 'From / IP' : 'مبدا / آی‌پی'}</th>
                          <th className="pb-2 font-medium">{isEn ? 'Login Time' : 'زمان ورود'}</th>
                          <th className="pb-2 font-medium">{isEn ? 'Idle' : 'بیکاری'}</th>
                          <th className="pb-2 font-medium">{isEn ? 'Current Process' : 'دستور جاری'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cyan-500/10">
                        {info.activeSessions.map((s, idx) => (
                          <tr key={idx} className="hover:bg-white/5 transition">
                            <td className="py-2 text-cyan-300 font-bold">{s.tty}</td>
                            <td className="py-2">{s.from || '-'}</td>
                            <td className="py-2 text-slate-400">{s.loginTime}</td>
                            <td className="py-2 text-slate-400">{s.idleTime}</td>
                            <td className="py-2 truncate max-w-xs" title={s.what}>{s.what}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Login History Table */}
              <div className={`p-4 rounded-xl border ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-800'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold">
                      {isEn ? 'Recent Login Audit Log' : 'تاریخچه آخرین ورودهای ثبت شده'}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      ({info.loginHistory.length} {isEn ? 'records' : 'مورد'})
                    </span>
                  </div>
                  <FieldInfoTooltip
                    title={isEn ? 'Login Audit Trail' : 'رد پای لاگین‌ها'}
                    whatIsIt={isEn ? 'Historical authentication records parsed directly from Linux /var/log/wtmp using the last utility.' : 'سوابق ثبت شده در /var/log/wtmp از طریق ابزار last.'}
                    whyNeeded={isEn ? 'Enables forensic analysis of past sessions, session durations, and connection sources.' : 'بررسی سوابق نشست‌ها و مدت زمان اتصال جهت ممیزی امنیت.'}
                    practicalExample={isEn ? 'last -n 15 <username>' : 'last -n 15 <username>'}
                  />
                </div>

                {info.loginHistory.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400 font-mono">
                    {isEn ? 'No login history found in system records.' : 'هیچ سابقه‌ای از لاگین در پایگاه داده سوابق سیستم موجود نیست.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-56 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-xs font-mono">
                      <thead className="sticky top-0 bg-inherit">
                        <tr className={`text-left text-[11px] text-slate-400 border-b ${
                          isLightMode ? 'border-slate-200' : 'border-slate-800'
                        }`}>
                          <th className="pb-2 font-medium">{isEn ? 'TTY' : 'ترمینال'}</th>
                          <th className="pb-2 font-medium">{isEn ? 'IP Address' : 'آدرس آی‌پی'}</th>
                          <th className="pb-2 font-medium">{isEn ? 'Login Timestamp' : 'زمان لاگین'}</th>
                          <th className="pb-2 font-medium">{isEn ? 'Duration' : 'مدت زمان'}</th>
                          <th className="pb-2 font-medium">{isEn ? 'Status' : 'وضعیت'}</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isLightMode ? 'divide-slate-200' : 'divide-slate-800/60'}`}>
                        {info.loginHistory.map((item, idx) => (
                          <tr key={idx} className="hover:bg-white/5 transition">
                            <td className="py-2 text-cyan-400">{item.tty}</td>
                            <td className="py-2 font-bold">{item.ip}</td>
                            <td className="py-2 text-slate-400">{item.loginTime}</td>
                            <td className="py-2 text-slate-400">{item.duration}</td>
                            <td className="py-2">
                              {item.stillLoggedIn ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/20">
                                  {isEn ? 'Active' : 'فعال'}
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-500">
                                  {isEn ? 'Closed' : 'خاتمه‌یافته'}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Shadow & Aging Policy Breakdown */}
              <div className={`p-4 rounded-xl border grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/40 border-slate-800'
              }`}>
                <div>
                  <span className="text-[11px] text-slate-400 block mb-0.5">
                    {isEn ? 'Min Days Between Changes' : 'حداقل فاصله بین تغییر رمز'}
                  </span>
                  <span className="font-mono font-bold text-slate-200">
                    {info.minDaysBetweenChange} {isEn ? 'days' : 'روز'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block mb-0.5">
                    {isEn ? 'Max Days Password Valid' : 'حداکثر اعتبار رمز عبور'}
                  </span>
                  <span className="font-mono font-bold text-slate-200">
                    {info.maxDaysBetweenChange >= 99999 ? (isEn ? 'Unlimited (99999)' : 'نامحدود') : `${info.maxDaysBetweenChange} ${isEn ? 'days' : 'روز'}`}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block mb-0.5">
                    {isEn ? 'Expiration Warning Window' : 'مهلت هشدار قبل از انقضا'}
                  </span>
                  <span className="font-mono font-bold text-slate-200">
                    {info.warnDaysBeforeExpire} {isEn ? 'days' : 'روز'}
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-white/10">
            <div>
              {onEditUser && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEditUser();
                  }}
                  className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-md"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Edit This User' : 'ویرایش این کاربر'}</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className={`px-5 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                isLightMode ? 'border-slate-300 text-slate-700 hover:bg-slate-100' : 'border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {isEn ? 'Close' : 'بستن'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
