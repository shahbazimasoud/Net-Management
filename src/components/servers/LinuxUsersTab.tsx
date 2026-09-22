import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  UserCheck,
  UserPlus,
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
  KeyRound,
  Lock,
  Unlock,
  Trash2,
  Layers,
  Check,
  Plus,
} from 'lucide-react';
import { RemoteServer, LinuxSystemUser, LinuxLoggedInUser, LinuxSystemGroup } from '../../types';
import {
  fetchLinuxServerUsers,
  sendLinuxServerUserMessage,
  toggleLinuxUserLock,
  createLinuxGroup,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { CreateUserModal } from './users/CreateUserModal';
import { ChangePasswordModal } from './users/ChangePasswordModal';
import { ManageUserGroupsModal } from './users/ManageUserGroupsModal';
import { DeleteUserModal } from './users/DeleteUserModal';

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
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const [loggedInUsers, setLoggedInUsers] = useState<LinuxLoggedInUser[]>([]);
  const [systemUsers, setSystemUsers] = useState<LinuxSystemUser[]>([]);
  const [systemGroups, setSystemGroups] = useState<LinuxSystemGroup[]>([]);

  // Sub-view toggle: 'users' or 'groups'
  const [activeSubView, setActiveSubView] = useState<'users' | 'groups'>('users');

  // Search & Filters
  const [userSearch, setUserSearch] = useState('');
  const [userCategory, setUserCategory] = useState<'all' | 'human' | 'system' | 'root'>('all');
  const [groupSearch, setGroupSearch] = useState('');

  // Modals state
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
  const [userForPassword, setUserForPassword] = useState<LinuxSystemUser | null>(null);
  const [userForGroups, setUserForGroups] = useState<LinuxSystemUser | null>(null);
  const [userForDelete, setUserForDelete] = useState<LinuxSystemUser | null>(null);

  // Group creation modal/inline state
  const [isNewGroupInputOpen, setIsNewGroupInputOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);

  // User Lock/Unlock in-flight indicator
  const [lockingUsername, setLockingUsername] = useState<string | null>(null);

  // Terminal Message Sending State
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [messageTarget, setMessageTarget] = useState<string>('all');
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
        setSystemGroups(res.systemGroups || []);
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

  const showNotification = (msg: string) => {
    setSuccessBanner(msg);
    setTimeout(() => {
      setSuccessBanner(null);
    }, 4000);
  };

  const handleToggleLock = async (user: LinuxSystemUser) => {
    if (user.uid === 0) {
      setError(isEn ? 'Cannot lock root account.' : 'امکان غیرفعال‌سازی حساب root وجود ندارد.');
      return;
    }

    const shouldLock = !user.isLocked;
    setLockingUsername(user.username);
    setError(null);

    try {
      const res = await toggleLinuxUserLock(server.id, user.username, shouldLock, ephemeralPassword);
      if (res.success) {
        showNotification(
          shouldLock
            ? (isEn ? `User "${user.username}" locked successfully` : `حساب کاربر «${user.username}» قفل/غیرفعال شد`)
            : (isEn ? `User "${user.username}" unlocked successfully` : `حساب کاربر «${user.username}» فعال‌سازی شد`)
        );
        loadUserData();
      } else {
        setError(res.error || (isEn ? 'Failed to update user lock state' : 'خطا در تغییر وضعیت قفل حساب'));
      }
    } catch (err: any) {
      setError(err?.message || (isEn ? 'Network error toggling user lock' : 'خطای ارتباط در قفل/بازگشایی کاربر'));
    } finally {
      setLockingUsername(null);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newGroupName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!clean) return;

    setCreatingGroup(true);
    setError(null);

    try {
      const res = await createLinuxGroup(server.id, clean, ephemeralPassword);
      if (res.success) {
        showNotification(isEn ? `Group "${clean}" created successfully` : `گروه «${clean}» با موفقیت ساخته شد`);
        setNewGroupName('');
        setIsNewGroupInputOpen(false);
        loadUserData();
      } else {
        setError(res.error || (isEn ? 'Failed to create group' : 'خطا در ساخت گروه'));
      }
    } catch (err: any) {
      setError(err?.message || (isEn ? 'Network error creating group' : 'خطای شبکه در ساخت گروه'));
    } finally {
      setCreatingGroup(false);
    }
  };

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
          String(u.uid).includes(q) ||
          (u.groups && u.groups.some((g) => g.toLowerCase().includes(q)))
      );
    }

    return list;
  }, [systemUsers, userCategory, userSearch]);

  const filteredGroups = useMemo(() => {
    if (!groupSearch.trim()) return systemGroups;
    const q = groupSearch.toLowerCase();
    return systemGroups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        String(g.gid).includes(q) ||
        g.members.some((m) => m.toLowerCase().includes(q))
    );
  }, [systemGroups, groupSearch]);

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
              title={isEn ? 'Linux User & Group Management' : 'مدیریت کاربران و گروه‌های لینوکس'}
              infoWhatEn="Complete administrative interface for Linux user accounts (/etc/passwd), passwords (/etc/shadow), group memberships (/etc/group), and terminal sessions (w/who)."
              infoWhatFa="پنل یکپارچه مدیریت حساب‌های لینوکس (/etc/passwd)، تغییر رمز عبور (/etc/shadow)، انتساب به گروه‌ها (/etc/group) و مدیریت نشست‌های آنلاین."
              infoWhyEn="Allows provisioning operators, granting sudo or docker permissions, managing passwords, and locking terminated accounts."
              infoWhyFa="امکان ساخت یوزر، اعطای دسترسی سودو و داکر به گروه‌ها، قفل یا فعال‌سازی حساب‌ها بدون نیاز به تایپ دستی دستورات کنسول."
              infoExampleEn="Create user 'developer', grant to 'sudo,docker', change password securely, or disable via usermod -L."
              infoExampleFa="ساخت کاربر با دسترسی sudo، تغییر امن رمز عبور و قفل کردن حساب‌های غیرفعال."
              isEn={isEn}
              isLightMode={isLightMode}
            />
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {isEn
              ? 'Manage accounts, passwords, groups, and inspect live terminal sessions.'
              : 'ساخت کاربر، تغییر رمز عبور، قفل/فعال‌سازی حساب، مدیریت دسترسی به گروه‌ها و نشست‌های متصل.'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setIsCreateUserModalOpen(true)}
            className="px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            <span>{isEn ? 'Create User' : 'ساخت کاربر جدید'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMessageTarget('all');
              setIsMessageModalOpen(true);
            }}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              isLightMode
                ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                : 'border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
            <span>{isEn ? 'Terminal Message' : 'پیام به کنسول'}</span>
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

      {/* Success Notification Banner */}
      {successBanner && (
        <div
          className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs font-mono animate-fadeIn ${
            isLightMode ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successBanner}</span>
        </div>
      )}

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
            {loggedInUsers.length > 0 ? (isEn ? 'Live Sessions' : 'آنلاین') : (isEn ? 'No Active TTY' : 'بدون نشست فعال')}
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

      {/* Section 2: User Accounts & Groups Directory */}
      <div
        className={`p-4 rounded-xl border space-y-4 ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        {/* Navigation / Sub-views Tab */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b pb-3 border-white/10">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setActiveSubView('users')}
              className={`flex items-center gap-2 pb-1 border-b-2 text-xs font-bold transition cursor-pointer ${
                activeSubView === 'users'
                  ? 'border-cyan-400 text-cyan-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>{isEn ? 'System Users' : 'کاربران سیستم (/etc/passwd)'}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 font-mono">
                {systemUsers.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubView('groups')}
              className={`flex items-center gap-2 pb-1 border-b-2 text-xs font-bold transition cursor-pointer ${
                activeSubView === 'groups'
                  ? 'border-cyan-400 text-cyan-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>{isEn ? 'Groups Directory' : 'فهرست گروه‌ها (/etc/group)'}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 font-mono">
                {systemGroups.length}
              </span>
            </button>
          </div>

          {/* Sub-view Controls */}
          {activeSubView === 'users' ? (
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
              <div className="relative flex-1 sm:w-44">
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
          ) : (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-56">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={isEn ? 'Filter groups / GID / members...' : 'جستجوی گروه یا اعضا...'}
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                  className={`w-full pl-8 pr-3 py-1 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
                    isLightMode ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-200'
                  }`}
                />
              </div>

              <button
                type="button"
                onClick={() => setIsNewGroupInputOpen(!isNewGroupInputOpen)}
                className="px-3 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition cursor-pointer flex items-center gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isEn ? 'New Group' : 'گروه جدید'}</span>
              </button>
            </div>
          )}
        </div>

        {/* View 1: Users Table */}
        {activeSubView === 'users' && (
          <div className="max-h-[480px] overflow-y-auto border rounded-xl overflow-x-auto border-white/5">
            <table className="w-full text-left text-xs font-mono">
              <thead
                className={`sticky top-0 border-b text-[11px] z-10 ${
                  isLightMode ? 'bg-slate-100 border-slate-200 text-slate-600' : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <tr>
                  <th className="py-2.5 px-3 font-semibold">{isEn ? 'Username' : 'نام کاربری'}</th>
                  <th className="py-2.5 px-3 font-semibold">{isEn ? 'Status' : 'وضعیت'}</th>
                  <th className="py-2.5 px-3 font-semibold">UID/GID</th>
                  <th className="py-2.5 px-3 font-semibold">{isEn ? 'Group Memberships' : 'گروه‌ها و دسترسی‌ها'}</th>
                  <th className="py-2.5 px-3 font-semibold">{isEn ? 'Home Directory' : 'مسیر پوشه خانگی'}</th>
                  <th className="py-2.5 px-3 font-semibold">{isEn ? 'Login Shell' : 'شل لاگین'}</th>
                  <th className="py-2.5 px-3 text-right font-semibold">{isEn ? 'Actions' : 'مدیریت'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredSystemUsers.map((u) => {
                  const isRoot = u.uid === 0;
                  const isLocking = lockingUsername === u.username;

                  return (
                    <tr
                      key={u.username}
                      className={`transition-colors ${
                        isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/30'
                      }`}
                    >
                      {/* Username */}
                      <td className="py-2.5 px-3 font-bold text-slate-200 flex items-center gap-2">
                        {isRoot ? (
                          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                        ) : u.isSystem ? (
                          <Shield className="w-4 h-4 text-slate-500 shrink-0" />
                        ) : (
                          <Terminal className="w-4 h-4 text-cyan-400 shrink-0" />
                        )}
                        <div>
                          <span className={isRoot ? 'text-rose-400 font-bold' : ''}>{u.username}</span>
                          {u.comment && (
                            <span className="text-[10px] text-slate-400 block font-sans font-normal truncate max-w-[140px]">
                              {u.comment}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3">
                        {u.isLocked ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            <Lock className="w-3 h-3" />
                            <span>{isEn ? 'Disabled' : 'غیرفعال'}</span>
                          </span>
                        ) : isRoot ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            Root
                          </span>
                        ) : u.isSystem ? (
                          <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-slate-500/15 text-slate-400">
                            {isEn ? 'System' : 'سیستمی'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            <span>{isEn ? 'Active' : 'فعال'}</span>
                          </span>
                        )}
                      </td>

                      {/* UID / GID */}
                      <td className="py-2.5 px-3 text-slate-400">
                        {u.uid} / {u.gid}
                      </td>

                      {/* Group Memberships */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1 flex-wrap max-w-[280px]">
                          {/* Primary Group */}
                          {u.primaryGroup && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              title={`Primary GID: ${u.gid}`}
                            >
                              {u.primaryGroup}
                            </span>
                          )}

                          {/* Supplementary Groups */}
                          {(u.groups || [])
                            .filter((g) => g !== u.primaryGroup)
                            .slice(0, 3)
                            .map((g) => (
                              <span
                                key={g}
                                className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                  g === 'sudo' || g === 'wheel'
                                    ? 'bg-rose-500/15 text-rose-300 border-rose-500/30 font-bold'
                                    : g === 'docker'
                                    ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                                    : 'bg-slate-800 text-slate-300 border-slate-700'
                                }`}
                              >
                                {g}
                              </span>
                            ))}

                          {(u.groups || []).filter((g) => g !== u.primaryGroup).length > 3 && (
                            <span className="text-[10px] text-slate-400">
                              +{(u.groups || []).filter((g) => g !== u.primaryGroup).length - 3}
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => setUserForGroups(u)}
                            title={isEn ? 'Edit Groups' : 'ویرایش و انتساب گروه‌ها'}
                            className="p-0.5 rounded text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition cursor-pointer"
                          >
                            <Shield className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* Home Dir */}
                      <td className="py-2.5 px-3 text-slate-400 truncate max-w-[160px]" title={u.homeDir}>
                        {u.homeDir}
                      </td>

                      {/* Shell */}
                      <td className="py-2.5 px-3 text-slate-300 font-mono">
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

                      {/* Action buttons */}
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Manage Groups */}
                          <button
                            type="button"
                            onClick={() => setUserForGroups(u)}
                            title={isEn ? 'Manage Groups' : 'مدیریت و دسترسی به گروه‌ها'}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition cursor-pointer"
                          >
                            <Shield className="w-3.5 h-3.5" />
                          </button>

                          {/* Change Password */}
                          <button
                            type="button"
                            onClick={() => setUserForPassword(u)}
                            title={isEn ? 'Change Password' : 'تغییر رمز عبور'}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 transition cursor-pointer"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>

                          {/* Lock / Unlock Toggle */}
                          {!isRoot && (
                            <button
                              type="button"
                              disabled={isLocking}
                              onClick={() => handleToggleLock(u)}
                              title={
                                u.isLocked
                                  ? (isEn ? 'Unlock / Enable Account' : 'فعال‌سازی کاربر')
                                  : (isEn ? 'Lock / Disable Account' : 'قفل / غیرفعال‌سازی کاربر')
                              }
                              className={`p-1.5 rounded-lg transition cursor-pointer ${
                                u.isLocked
                                  ? 'text-emerald-400 hover:bg-emerald-500/15'
                                  : 'text-slate-400 hover:text-rose-400 hover:bg-rose-500/10'
                              }`}
                            >
                              {isLocking ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : u.isLocked ? (
                                <Unlock className="w-3.5 h-3.5" />
                              ) : (
                                <Lock className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}

                          {/* Delete User */}
                          {!isRoot && (
                            <button
                              type="button"
                              onClick={() => setUserForDelete(u)}
                              title={isEn ? 'Delete User' : 'حذف کاربر'}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* View 2: Groups Directory Table */}
        {activeSubView === 'groups' && (
          <div className="space-y-3">
            {/* Inline Add New Group Form */}
            {isNewGroupInputOpen && (
              <form
                onSubmit={handleCreateGroup}
                className={`p-3.5 rounded-xl border flex flex-col sm:flex-row items-center gap-3 ${
                  isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-slate-900/90 border-cyan-500/30'
                }`}
              >
                <div className="flex items-center gap-2 flex-1 w-full">
                  <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
                  <input
                    type="text"
                    required
                    placeholder={isEn ? 'Enter new group name (e.g. operators, sysadmin)...' : 'نام گروه جدید (مثلاً developers)...'}
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className={`w-full px-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                      isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => setIsNewGroupInputOpen(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    {isEn ? 'Cancel' : 'انصراف'}
                  </button>
                  <button
                    type="submit"
                    disabled={creatingGroup || !newGroupName.trim()}
                    className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{creatingGroup ? (isEn ? 'Creating...' : 'در حال ایجاد...') : (isEn ? 'Create Group' : 'ایجاد گروه')}</span>
                  </button>
                </div>
              </form>
            )}

            <div className="max-h-[480px] overflow-y-auto border rounded-xl overflow-x-auto border-white/5">
              <table className="w-full text-left text-xs font-mono">
                <thead
                  className={`sticky top-0 border-b text-[11px] z-10 ${
                    isLightMode ? 'bg-slate-100 border-slate-200 text-slate-600' : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">{isEn ? 'Group Name' : 'نام گروه'}</th>
                    <th className="py-2.5 px-3 font-semibold">GID</th>
                    <th className="py-2.5 px-3 font-semibold">{isEn ? 'Type & Privileges' : 'نوع و سطح دسترسی'}</th>
                    <th className="py-2.5 px-3 font-semibold">{isEn ? 'Member Count' : 'تعداد اعضا'}</th>
                    <th className="py-2.5 px-3 font-semibold">{isEn ? 'User Members' : 'کاربران عضو'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredGroups.map((g) => {
                    const isPrivileged = ['root', 'sudo', 'wheel', 'docker', 'adm'].includes(g.name);

                    return (
                      <tr
                        key={g.name}
                        className={`transition-colors ${
                          isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/30'
                        }`}
                      >
                        <td className="py-2.5 px-3 font-bold text-slate-200 flex items-center gap-2">
                          <Layers className={`w-3.5 h-3.5 ${isPrivileged ? 'text-rose-400' : 'text-cyan-400'}`} />
                          <span className={isPrivileged ? 'text-rose-300 font-bold' : ''}>{g.name}</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">{g.gid}</td>
                        <td className="py-2.5 px-3">
                          {g.name === 'sudo' || g.name === 'wheel' ? (
                            <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                              {isEn ? 'Administrative / Sudo' : 'مدیریت و دسترسی روت (Sudo)'}
                            </span>
                          ) : g.name === 'docker' ? (
                            <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                              {isEn ? 'Container Access' : 'اجرای کانتینر داکر'}
                            </span>
                          ) : g.gid < 1000 ? (
                            <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-slate-500/15 text-slate-400">
                              {isEn ? 'System Group' : 'گروه سیستمی'}
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              {isEn ? 'User Group' : 'گروه کاربری'}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-300 font-bold">
                          {g.members.length}
                        </td>
                        <td className="py-2.5 px-3">
                          {g.members.length === 0 ? (
                            <span className="text-slate-500 text-[11px] italic">
                              {isEn ? 'No direct members' : 'بدون عضو مستقیم'}
                            </span>
                          ) : (
                            <div className="flex items-center gap-1 flex-wrap max-w-[320px]">
                              {g.members.map((m) => (
                                <span
                                  key={m}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700"
                                >
                                  {m}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
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

      {/* Create User Modal */}
      {isCreateUserModalOpen && (
        <CreateUserModal
          server={server}
          ephemeralPassword={ephemeralPassword}
          isLightMode={isLightMode}
          isEn={isEn}
          systemGroups={systemGroups}
          onClose={() => setIsCreateUserModalOpen(false)}
          onSuccess={() => {
            showNotification(isEn ? 'User created successfully' : 'کاربر جدید با موفقیت ایجاد شد');
            loadUserData();
          }}
        />
      )}

      {/* Change Password Modal */}
      {userForPassword && (
        <ChangePasswordModal
          server={server}
          user={userForPassword}
          ephemeralPassword={ephemeralPassword}
          isLightMode={isLightMode}
          isEn={isEn}
          onClose={() => setUserForPassword(null)}
          onSuccess={() => {
            showNotification(isEn ? `Password for ${userForPassword.username} updated successfully` : `رمز عبور کاربر ${userForPassword.username} با موفقیت به‌روزرسانی شد`);
            loadUserData();
          }}
        />
      )}

      {/* Manage Groups Modal */}
      {userForGroups && (
        <ManageUserGroupsModal
          server={server}
          user={userForGroups}
          systemGroups={systemGroups}
          ephemeralPassword={ephemeralPassword}
          isLightMode={isLightMode}
          isEn={isEn}
          onClose={() => setUserForGroups(null)}
          onSuccess={() => {
            showNotification(isEn ? `Group permissions for ${userForGroups.username} updated successfully` : `دسترسی گروه‌های کاربر ${userForGroups.username} با موفقیت ثبت شد`);
            loadUserData();
          }}
        />
      )}

      {/* Delete User Modal */}
      {userForDelete && (
        <DeleteUserModal
          server={server}
          user={userForDelete}
          ephemeralPassword={ephemeralPassword}
          isLightMode={isLightMode}
          isEn={isEn}
          onClose={() => setUserForDelete(null)}
          onSuccess={() => {
            showNotification(isEn ? `User ${userForDelete.username} deleted successfully` : `کاربر ${userForDelete.username} با موفقیت حذف شد`);
            loadUserData();
          }}
        />
      )}
    </div>
  );
};
