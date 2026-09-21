import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  UserCheck,
  MessageSquare,
  Send,
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Terminal,
  Shield,
  ShieldAlert,
  Radio,
  ExternalLink,
  Info,
  X,
} from 'lucide-react';
import { RemoteServer, LinuxSystemUser, LinuxLoggedInUser } from '../../types';
import { fetchLinuxServerUsers, sendLinuxServerUserMessage } from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

interface LinuxUsersTabProps {
  server: RemoteServer;
  ephemeralPassword?: string;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const LinuxUsersTab: React.FC<LinuxUsersTabProps> = ({
  server,
  ephemeralPassword,
  isLightMode = false,
  isEn = true,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loggedInUsers, setLoggedInUsers] = useState<LinuxLoggedInUser[]>([]);
  const [systemUsers, setSystemUsers] = useState<LinuxSystemUser[]>([]);

  // Search & Filters
  const [userSearch, setUserSearch] = useState('');
  const [userCategory, setUserCategory] = useState<'all' | 'human' | 'system' | 'root'>('all');

  // Message Sending State
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [messageTarget, setMessageTarget] = useState<string>('all'); // 'all' or specific username/tty
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageFeedback, setMessageFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadUserData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchLinuxServerUsers(server.id, ephemeralPassword);
      if (res.success) {
        setLoggedInUsers(res.loggedInUsers || []);
        setSystemUsers(res.systemUsers || []);
      } else {
        setError(res.error || (isEn ? 'Failed to fetch users from server' : 'خطا در واکشی اطلاعات یوزرهای سرور'));
      }
    } catch (err: any) {
      setError(err?.message || (isEn ? 'Network error fetching server users' : 'خطای ارتباط در بارگذاری اطلاعات یوزرها'));
    } finally {
      setLoading(false);
    }
  }, [server.id, ephemeralPassword, isEn]);

  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;

    setSendingMessage(true);
    setMessageFeedback(null);

    try {
      const res = await sendLinuxServerUserMessage(server.id, messageTarget, messageText.trim(), ephemeralPassword);
      if (res.success) {
        setMessageFeedback({
          message: res.message || (isEn ? 'Message broadcasted successfully' : 'پیام با موفقیت ارسال شد'),
          type: 'success',
        });
        setMessageText('');
        setTimeout(() => {
          setIsMessageModalOpen(false);
          setMessageFeedback(null);
        }, 2000);
      } else {
        setMessageFeedback({
          message: res.message || res.error || (isEn ? 'Failed to deliver message' : 'خطا در ارسال پیام'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setMessageFeedback({
        message: err?.message || (isEn ? 'Network error delivering message' : 'خطای شبکه در ارسال پیام'),
        type: 'error',
      });
    } finally {
      setSendingMessage(false);
    }
  };

  const filteredSystemUsers = useMemo(() => {
    let list = [...systemUsers];

    if (userCategory === 'human') {
      list = list.filter((u) => !u.isSystem && u.uid !== 0);
    } else if (userCategory === 'system') {
      list = list.filter((u) => u.isSystem);
    } else if (userCategory === 'root') {
      list = list.filter((u) => u.uid === 0);
    }

    if (userSearch.trim()) {
      const q = userSearch.toLowerCase();
      list = list.filter(
        (u) =>
          u.username.toLowerCase().includes(q) ||
          u.shell.toLowerCase().includes(q) ||
          u.homeDir.toLowerCase().includes(q) ||
          String(u.uid).includes(q)
      );
    }

    return list;
  }, [systemUsers, userCategory, userSearch]);

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Users className="w-4 h-4 text-cyan-400" />
              <span>{isEn ? 'Users & Active Sessions' : 'کاربران و نشست‌های فعال'}</span>
            </h3>
            <FieldInfoTooltip
              title={isEn ? 'Linux System Users' : 'کاربران لینوکس'}
              infoWhatEn="Detailed list of system accounts from /etc/passwd and real-time interactive terminal sessions from who/w."
              infoWhatFa="فهرست جامع حساب‌های کاربری سیستم از /etc/passwd و نشست‌های فعال ترمینالی با جزئیات زمان لاگین و آی‌پی."
              infoWhyEn="Required for system auditing, monitoring active administrators, and broadcasting urgent terminal alerts."
              infoWhyFa="برای مانیتورینگ امنیتی ادمین‌های حاضر در سیستم، حسابرسی دسترسی‌ها و ارسال هشدارهای فوری کنسولی."
              infoExampleEn="Send maintenance alert via wall or inspect who is currently logged in on pts/0."
              infoExampleFa="ارسال پیام تعمیرات سراسری یا بررسی ادمین‌های لاگین‌شده روی pts/0."
              isEn={isEn}
              isLightMode={isLightMode}
            />
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {isEn
              ? 'Inspect logged-in terminal sessions, login duration, and all registered system accounts.'
              : 'مشاهده نشست‌های لاگین‌شده، مدت زمان اتصال، ارسال پیام به کنسول و فهرست کل یوزرهای سیستم.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setMessageTarget('all');
              setIsMessageModalOpen(true);
            }}
            className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{isEn ? 'Send Terminal Message' : 'ارسال پیام به یوزر'}</span>
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={loadUserData}
            title={isEn ? 'Refresh Users' : 'بازخوانی فهرست یوزرها'}
            className={`p-2 rounded-lg border transition cursor-pointer disabled:opacity-50 ${
              isLightMode
                ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                : 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-slate-300'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div
          className={`p-3 rounded-xl border flex items-center gap-2 text-xs ${
            isLightMode ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
          }`}
        >
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span className="font-mono">{error}</span>
        </div>
      )}

      {/* Section 1: Active Logged-In Sessions */}
      <div
        className={`p-4 rounded-xl border space-y-3 ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold">{isEn ? 'Currently Logged-In Users' : 'یوزرهای متصل و در حال فعالیت'}</h4>
              <span className="text-[10px] text-slate-400 font-mono">
                {loggedInUsers.length} {isEn ? 'active session(s)' : 'نشست فعال'}
              </span>
            </div>
          </div>

          <span
            className={`text-xs font-mono px-2 py-0.5 rounded-full border ${
              loggedInUsers.length > 0
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
            }`}
          >
            {loggedInUsers.length > 0 ? (isEn ? 'Live' : 'آنلاین') : (isEn ? 'No Active TTY' : 'بدون نشست فعال')}
          </span>
        </div>

        {loggedInUsers.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400 font-mono">
            {isEn ? 'No interactive users currently logged in.' : 'هیچ کاربری در حال حاضر از طریق کنسول یا SSH لاگین نکرده است.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr
                  className={`border-b text-[11px] ${
                    isLightMode ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'
                  }`}
                >
                  <th className="pb-2 font-semibold">{isEn ? 'User' : 'کاربر'}</th>
                  <th className="pb-2 font-semibold">{isEn ? 'TTY / Terminal' : 'کنسول / TTY'}</th>
                  <th className="pb-2 font-semibold">{isEn ? 'From / Remote IP' : 'آی‌پی مبدا'}</th>
                  <th className="pb-2 font-semibold">{isEn ? 'Login Time' : 'زمان لاگین'}</th>
                  <th className="pb-2 font-semibold">{isEn ? 'Idle Time' : 'مدت بیکاری'}</th>
                  <th className="pb-2 font-semibold">{isEn ? 'Current Process' : 'پردازش جاری'}</th>
                  <th className="pb-2 text-right font-semibold">{isEn ? 'Action' : 'عملیات'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loggedInUsers.map((u, idx) => (
                  <tr
                    key={`${u.user}-${u.tty}-${idx}`}
                    className={`transition-colors ${
                      isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-2.5 font-bold text-cyan-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
                      <span>{u.user}</span>
                    </td>
                    <td className="py-2.5 text-slate-300">{u.tty}</td>
                    <td className="py-2.5 text-slate-300">
                      {u.from && u.from !== '-' ? u.from : (isEn ? 'Local Console' : 'کنسول محلی')}
                    </td>
                    <td className="py-2.5 text-slate-300 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{u.loginTime || '-'}</span>
                    </td>
                    <td className="py-2.5 text-amber-400 font-semibold">{u.idleTime || '0s'}</td>
                    <td className="py-2.5 text-slate-300 truncate max-w-[160px]" title={u.what}>
                      {u.what || '-'}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setMessageTarget(u.tty || u.user);
                          setIsMessageModalOpen(true);
                        }}
                        className="px-2 py-1 rounded bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-400 border border-cyan-500/30 text-[11px] font-bold transition cursor-pointer"
                      >
                        {isEn ? 'Message' : 'پیام'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 2: All System Accounts */}
      <div
        className={`p-4 rounded-xl border space-y-4 ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-bold flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-400" />
              <span>{isEn ? 'All Registered System Accounts' : 'کل کاربران ثبت‌شده در سیستم (/etc/passwd)'}</span>
            </h4>
            <span className="text-[10px] text-slate-400 font-mono">
              {filteredSystemUsers.length} of {systemUsers.length} {isEn ? 'accounts listed' : 'کاربر'}
            </span>
          </div>

          {/* Filters & Search */}
          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
            {/* Category tabs */}
            <div
              className={`p-0.5 rounded-lg border flex items-center text-[11px] font-semibold ${
                isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-800/80 border-slate-700'
              }`}
            >
              <button
                type="button"
                onClick={() => setUserCategory('all')}
                className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                  userCategory === 'all'
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isEn ? 'All' : 'همه'}
              </button>
              <button
                type="button"
                onClick={() => setUserCategory('human')}
                className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                  userCategory === 'human'
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isEn ? 'Human' : 'کاربران عادی'}
              </button>
              <button
                type="button"
                onClick={() => setUserCategory('system')}
                className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                  userCategory === 'system'
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isEn ? 'System' : 'سیستمی'}
              </button>
              <button
                type="button"
                onClick={() => setUserCategory('root')}
                className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                  userCategory === 'root'
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Root
              </button>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 sm:w-48">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={isEn ? 'Filter users...' : 'جستجوی کاربر...'}
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className={`w-full pl-8 pr-3 py-1 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
                  isLightMode ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-200'
                }`}
              />
            </div>
          </div>
        </div>

        {/* User table */}
        <div className="max-h-[380px] overflow-y-auto border rounded-xl overflow-x-auto border-white/5">
          <table className="w-full text-left text-xs font-mono">
            <thead
              className={`sticky top-0 border-b text-[11px] ${
                isLightMode ? 'bg-slate-100 border-slate-200 text-slate-600' : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}
            >
              <tr>
                <th className="py-2.5 px-3 font-semibold">{isEn ? 'Username' : 'نام کاربری'}</th>
                <th className="py-2.5 px-3 font-semibold">UID</th>
                <th className="py-2.5 px-3 font-semibold">GID</th>
                <th className="py-2.5 px-3 font-semibold">{isEn ? 'Type' : 'نوع کاربر'}</th>
                <th className="py-2.5 px-3 font-semibold">{isEn ? 'Home Directory' : 'مسیر پوشه خانگی'}</th>
                <th className="py-2.5 px-3 font-semibold">{isEn ? 'Login Shell' : 'شل لاگین'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredSystemUsers.map((u) => (
                <tr
                  key={u.username}
                  className={`transition-colors ${
                    isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/30'
                  }`}
                >
                  <td className="py-2 px-3 font-bold text-slate-200 flex items-center gap-1.5">
                    {u.uid === 0 ? (
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    ) : u.isSystem ? (
                      <Shield className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    ) : (
                      <Terminal className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    )}
                    <span className={u.uid === 0 ? 'text-rose-400' : ''}>{u.username}</span>
                  </td>
                  <td className="py-2 px-3 text-slate-400">{u.uid}</td>
                  <td className="py-2 px-3 text-slate-400">{u.gid}</td>
                  <td className="py-2 px-3">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                        u.uid === 0
                          ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          : u.isSystem
                          ? 'bg-slate-500/15 text-slate-400'
                          : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {u.uid === 0 ? 'Root' : u.isSystem ? (isEn ? 'System' : 'سیستمی') : (isEn ? 'Normal User' : 'کاربر استاندارد')}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-slate-400 truncate max-w-[180px]" title={u.homeDir}>
                    {u.homeDir}
                  </td>
                  <td className="py-2 px-3 text-slate-300 font-mono">
                    <span
                      className={
                        u.shell.includes('nologin') || u.shell.includes('false')
                          ? 'text-slate-500'
                          : 'text-cyan-300 font-semibold'
                      }
                    >
                      {u.shell}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Message Modal */}
      {isMessageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div
            className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl space-y-4 ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-700 text-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-400">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">
                    {isEn ? 'Broadcast / Send Terminal Message' : 'ارسال پیام به کنسول ترمینال'}
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">
                    Target: {messageTarget === 'all' ? (isEn ? 'Broadcast to ALL (wall)' : 'عمومی (wall)') : messageTarget}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMessageModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {messageFeedback && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  messageFeedback.type === 'success'
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                }`}
              >
                {messageFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span className="font-mono">{messageFeedback.message}</span>
              </div>
            )}

            <form onSubmit={handleSendMessage} className="space-y-4">
              <div>
                <label className="text-xs font-semibold block mb-1">
                  {isEn ? 'Recipient' : 'گیرنده پیام'}
                </label>
                <select
                  value={messageTarget}
                  onChange={(e) => setMessageTarget(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-300 text-slate-800'
                      : 'bg-slate-950 border-slate-700 text-white'
                  }`}
                >
                  <option value="all">{isEn ? '📢 Broadcast to ALL (wall command)' : '📢 ارسال همگانی به تمامی کاربران (دستور wall)'}</option>
                  {loggedInUsers.map((u) => (
                    <option key={`${u.user}-${u.tty}`} value={u.tty || u.user}>
                      {u.user} ({u.tty} - {u.from || 'local'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1">
                  {isEn ? 'Message Text' : 'متن پیام کنسول'}
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder={
                    isEn
                      ? 'e.g., Server maintenance scheduled in 10 minutes. Please save your work.'
                      : 'مثال: تعمیرات سرور تا ۱۰ دقیقه دیگر آغاز می‌شود. لطفاً اطلاعات خود را ذخیره کنید.'
                  }
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-300 text-slate-800'
                      : 'bg-slate-950 border-slate-700 text-white'
                  }`}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsMessageModalOpen(false)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                    isLightMode
                      ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                      : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>

                <button
                  type="submit"
                  disabled={sendingMessage || !messageText.trim()}
                  className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Send className={`w-3.5 h-3.5 ${sendingMessage ? 'animate-spin' : ''}`} />
                  <span>{sendingMessage ? (isEn ? 'Sending...' : 'در حال ارسال...') : (isEn ? 'Deliver Message' : 'ارسال پیام')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
