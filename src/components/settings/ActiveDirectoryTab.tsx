import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserCheck,
  ShieldCheck,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Shield,
  Layers,
  Check,
  X,
  Server,
  Lock,
  ArrowRight,
  ArrowLeft,
  Filter,
  Save,
  Trash2,
  Undo2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { ActiveDirectoryConfig, ADSecurityGroup, ADUser, AccessPolicy } from '../../types';
import { syncActiveDirectoryApi, saveAccessPoliciesApi } from '../../services/api';
import { loadAccessPolicies, saveAccessPolicies, syncAccessPoliciesFromDatabase } from '../../services/settingsStorage';
import { useLanguage } from '../../i18n';

interface ActiveDirectoryTabProps {
  config: ActiveDirectoryConfig;
  onSaveConfig: (cfg: ActiveDirectoryConfig) => void;
  onNavigateToConnectionSettings?: () => void;
  isLightMode?: boolean;
}

export const ActiveDirectoryTab: React.FC<ActiveDirectoryTabProps> = ({
  config,
  onSaveConfig,
  onNavigateToConnectionSettings,
  isLightMode = false,
}) => {
  const { isRtl, isEn } = useLanguage();
  const [activeSubTab, setActiveSubTab] = useState<'groups' | 'users'>('groups');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Domain Users Pagination State
  const [usersPage, setUsersPage] = useState<number>(1);
  const [usersPerPage, setUsersPerPage] = useState<number>(25);

  // Access Policies state for RBAC mapping
  const [persistedPolicies, setPersistedPolicies] = useState<AccessPolicy[]>(() => loadAccessPolicies());
  const [workingPolicies, setWorkingPolicies] = useState<AccessPolicy[]>(() => loadAccessPolicies());
  const [isSavingPolicies, setIsSavingPolicies] = useState(false);

  useEffect(() => {
    syncAccessPoliciesFromDatabase()
      .then((dbPolicies) => {
        if (Array.isArray(dbPolicies) && dbPolicies.length > 0) {
          setPersistedPolicies(dbPolicies);
          setWorkingPolicies(dbPolicies);
        }
      })
      .catch(() => {});
  }, []);

  // Auto-sync domain users if connection is configured but users list is empty
  const autoSyncedRef = React.useRef(false);
  useEffect(() => {
    if (
      !autoSyncedRef.current &&
      config?.server &&
      config.server.trim() &&
      (!config.syncedUsers || config.syncedUsers.length === 0) &&
      !isSyncing
    ) {
      autoSyncedRef.current = true;
      handleSyncNow();
    }
  }, [config?.server, config?.syncedUsers]);

  const hasUnsavedChanges = useMemo(() => {
    return JSON.stringify(persistedPolicies) !== JSON.stringify(workingPolicies);
  }, [persistedPolicies, workingPolicies]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      const res = await syncActiveDirectoryApi(config);
      if (res.success) {
        const updated: ActiveDirectoryConfig = {
          ...config,
          syncedGroups: res.groups || [],
          syncedUsers: res.users || [],
          lastSyncStatus: 'success',
          lastSyncMessage:
            res.message ||
            (isEn
              ? `Successfully synchronized ${res.groups?.length || 0} security groups and ${res.users?.length || 0} domain users.`
              : `همگام‌سازی با موفقیت انجام شد (${res.groups?.length || 0} گروه و ${res.users?.length || 0} کاربر دریافت گردید).`),
          lastSyncTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
        };
        onSaveConfig(updated);
        showToast(
          isEn
            ? `Synced ${res.groups?.length || 0} groups and ${res.users?.length || 0} users from Active Directory.`
            : `تعداد ${res.groups?.length || 0} گروه امنیتی و ${res.users?.length || 0} کاربر از اکتیو دایرکتوری همگام‌سازی شد.`
        );
      } else {
        const errorMsg =
          res.error ||
          (isEn
            ? 'Failed to synchronize objects from Active Directory'
            : 'خطا در دریافت و همگام‌سازی آبجکت‌ها از اکتیو دایرکتوری');
        setSyncError(errorMsg);
      }
    } catch (err: any) {
      setSyncError(
        err.message ||
          (isEn
            ? 'Failed to connect to Active Directory server for synchronization'
            : 'خطا در برقراری ارتباط با سرور دامین جهت همگام‌سازی')
      );
    } finally {
      setIsSyncing(false);
    }
  };

  // Find policy assigned to a specific AD group in working policies
  const getPolicyForGroup = (groupDn: string): AccessPolicy | undefined => {
    return workingPolicies.find(
      (p) => p.subjectType === 'ad_group' && p.subjectId === groupDn
    );
  };

  // Find direct policy assigned to an AD user
  const getDirectPolicyForUser = (user: ADUser): AccessPolicy | undefined => {
    return workingPolicies.find(
      (p) =>
        p.subjectType === 'ad_user' &&
        (p.subjectId === user.samAccountName || p.subjectId === user.dn || (user.email && p.subjectId === user.email))
    );
  };

  // Find inherited group policies for an AD user
  const getInheritedPoliciesForUser = (user: ADUser): AccessPolicy[] => {
    const userGroups = user.groups || [];
    return workingPolicies.filter(
      (p) =>
        p.subjectType === 'ad_group' &&
        userGroups.some((g) => g === p.subjectName || p.subjectId.includes(g) || p.subjectId.toLowerCase() === g.toLowerCase())
    );
  };

  // Assign or update panel access policy for an AD group (staged in memory until Saved)
  const handleAssignPolicyToGroup = (group: ADSecurityGroup, policyId: string) => {
    let updated: AccessPolicy[] = [...workingPolicies];

    if (!policyId || policyId === 'none') {
      updated = updated.filter(
        (p) => !(p.subjectType === 'ad_group' && p.subjectId === group.dn)
      );
    } else {
      const sourceTemplate = workingPolicies.find((p) => p.id === policyId) || persistedPolicies.find((p) => p.id === policyId);
      if (!sourceTemplate) return;

      const existingIdx = updated.findIndex(
        (p) => p.subjectType === 'ad_group' && p.subjectId === group.dn
      );

      if (existingIdx >= 0) {
        updated[existingIdx] = {
          ...sourceTemplate,
          id: updated[existingIdx].id,
          name: `${sourceTemplate.name} (${group.cn})`,
          subjectType: 'ad_group',
          subjectId: group.dn,
          subjectName: `${group.cn} (Active Directory)`,
          isBuiltin: false,
        };
      } else {
        const newPolicy: AccessPolicy = {
          ...sourceTemplate,
          id: `policy-ad-group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: `${sourceTemplate.name} (${group.cn})`,
          description: isEn
            ? `Panel role mapped to Active Directory security group ${group.cn}`
            : `نقش دسترسی پنل متصل به گروه امنیتی اکتیو دایرکتوری ${group.cn}`,
          subjectType: 'ad_group',
          subjectId: group.dn,
          subjectName: `${group.cn} (Active Directory)`,
          isBuiltin: false,
          priority: 50,
        };
        updated.push(newPolicy);
      }
    }

    setWorkingPolicies(updated);
  };

  // Assign or update direct panel access policy for an individual domain user (staged in memory until Saved)
  const handleAssignPolicyToUser = (user: ADUser, policyId: string) => {
    let updated: AccessPolicy[] = [...workingPolicies];

    if (!policyId || policyId === 'none') {
      updated = updated.filter(
        (p) => !(p.subjectType === 'ad_user' && (p.subjectId === user.samAccountName || p.subjectId === user.dn))
      );
    } else {
      const sourceTemplate = workingPolicies.find((p) => p.id === policyId) || persistedPolicies.find((p) => p.id === policyId);
      if (!sourceTemplate) return;

      const existingIdx = updated.findIndex(
        (p) => p.subjectType === 'ad_user' && (p.subjectId === user.samAccountName || p.subjectId === user.dn)
      );

      if (existingIdx >= 0) {
        updated[existingIdx] = {
          ...sourceTemplate,
          id: updated[existingIdx].id,
          name: `${sourceTemplate.name} (${user.displayName || user.samAccountName})`,
          subjectType: 'ad_user',
          subjectId: user.samAccountName,
          subjectName: `${user.displayName || user.samAccountName} (AD User)`,
          isBuiltin: false,
        };
      } else {
        const newPolicy: AccessPolicy = {
          ...sourceTemplate,
          id: `policy-ad-user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: `${sourceTemplate.name} (${user.displayName || user.samAccountName})`,
          description: isEn
            ? `Direct panel role mapped to Active Directory domain user ${user.samAccountName}`
            : `نقش دسترسی مستقیم پنل متصل به کاربر دامین ${user.samAccountName}`,
          subjectType: 'ad_user',
          subjectId: user.samAccountName,
          subjectName: `${user.displayName || user.samAccountName} (AD User)`,
          isBuiltin: false,
          priority: 60,
        };
        updated.push(newPolicy);
      }
    }

    setWorkingPolicies(updated);
  };

  // Persist all staged changes to server PostgreSQL database and local storage
  const handleSaveAllPolicies = async () => {
    setIsSavingPolicies(true);
    try {
      saveAccessPolicies(workingPolicies);
      const res = (await saveAccessPoliciesApi(workingPolicies)) as any;
      if (res.success) {
        setPersistedPolicies(workingPolicies);
        showToast(
          isEn
            ? 'All Active Directory RBAC policy assignments saved successfully to database.'
            : 'تمامی دسترسی‌ها و نقش‌های اکتیو دایرکتوری با موفقیت در پایگاه داده سرور ذخیره شد.'
        );
      } else {
        showToast(
          isEn ? `Failed to save policies: ${res?.error || 'Server error'}` : 'خطا در ذخیره پالیسی‌ها در پایگاه داده'
        );
      }
    } catch (e: any) {
      showToast(isEn ? 'Failed to save policies to database' : 'خطا در ارتباط با سرور جهت ذخیره پایگاه داده');
    } finally {
      setIsSavingPolicies(false);
    }
  };

  // Revert all unstaged edits to the persisted database state
  const handleRevertChanges = () => {
    setWorkingPolicies(persistedPolicies);
    showToast(
      isEn
        ? 'Reverted all unsaved modifications to database state.'
        : 'تغییرات ذخیره‌نشده لغو و به آخرین وضعیت پایگاه داده بازگردانده شد.'
    );
  };

  // Count assigned groups
  const assignedGroupsCount = useMemo(() => {
    return (config.syncedGroups || []).filter((g) => Boolean(getPolicyForGroup(g.dn))).length;
  }, [config.syncedGroups, workingPolicies]);

  // Count assigned users (direct or inherited)
  const assignedUsersCount = useMemo(() => {
    return (config.syncedUsers || []).filter((u) => {
      const direct = getDirectPolicyForUser(u);
      const inherited = getInheritedPoliciesForUser(u);
      return Boolean(direct || inherited.length > 0);
    }).length;
  }, [config.syncedUsers, workingPolicies]);

  // Filter groups with search and role assigned filter
  const filteredGroups = useMemo(() => {
    return (config.syncedGroups || []).filter((g) => {
      const assignedPolicy = getPolicyForGroup(g.dn);
      if (roleFilter === 'assigned' && !assignedPolicy) return false;
      if (roleFilter === 'unassigned' && assignedPolicy) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        g.cn.toLowerCase().includes(q) ||
        g.description.toLowerCase().includes(q) ||
        g.dn.toLowerCase().includes(q) ||
        (assignedPolicy && assignedPolicy.name.toLowerCase().includes(q))
      );
    });
  }, [config.syncedGroups, searchQuery, roleFilter, workingPolicies]);

  // Filter users with search and role assigned filter
  const filteredUsers = useMemo(() => {
    return (config.syncedUsers || []).filter((u) => {
      const direct = getDirectPolicyForUser(u);
      const inherited = getInheritedPoliciesForUser(u);
      const hasAnyRole = Boolean(direct || inherited.length > 0);

      if (roleFilter === 'assigned' && !hasAnyRole) return false;
      if (roleFilter === 'unassigned' && hasAnyRole) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const displayName = String(u.displayName || u.samAccountName || '').toLowerCase();
      const samAccountName = String(u.samAccountName || '').toLowerCase();
      const department = String(u.department || '').toLowerCase();
      const email = String(u.email || '').toLowerCase();
      const title = String(u.title || '').toLowerCase();

      return (
        displayName.includes(q) ||
        samAccountName.includes(q) ||
        department.includes(q) ||
        email.includes(q) ||
        title.includes(q) ||
        (direct && String(direct.name || '').toLowerCase().includes(q)) ||
        inherited.some((p) => String(p.name || '').toLowerCase().includes(q))
      );
    });
  }, [config.syncedUsers, searchQuery, roleFilter, workingPolicies]);

  // Reset to first page when search query, filter, or sub-tab changes
  useEffect(() => {
    setUsersPage(1);
  }, [searchQuery, roleFilter, activeSubTab]);

  // Domain Users Pagination calculations
  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / usersPerPage));
  const safeUsersPage = Math.min(Math.max(1, usersPage), totalUserPages);
  const usersStartIndex = (safeUsersPage - 1) * usersPerPage;
  const usersEndIndex = Math.min(usersStartIndex + usersPerPage, filteredUsers.length);
  const paginatedUsers = useMemo(() => {
    return filteredUsers.slice(usersStartIndex, usersEndIndex);
  }, [filteredUsers, usersStartIndex, usersEndIndex]);

  const getPaginationNumbers = (current: number, total: number) => {
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages: (number | '...')[] = [];
    pages.push(1);
    if (current > 3) {
      pages.push('...');
    }
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    if (current < total - 2) {
      pages.push('...');
    }
    pages.push(total);
    return pages;
  };

  const renderPaginationControls = () => {
    if (filteredUsers.length <= 0) return null;

    return (
      <div
        className={`flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-xl border text-xs ${
          isLightMode
            ? 'bg-slate-100/80 border-slate-200 text-slate-700'
            : 'bg-slate-900/60 border-white/10 text-slate-300'
        }`}
      >
        {/* Left: Range and total count info */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-medium">
            {isEn
              ? `Showing ${filteredUsers.length === 0 ? 0 : usersStartIndex + 1}–${usersEndIndex} of ${filteredUsers.length} users`
              : `نمایش ${filteredUsers.length === 0 ? 0 : usersStartIndex + 1} تا ${usersEndIndex} از ${filteredUsers.length} کاربر`}
            {filteredUsers.length < (config.syncedUsers || []).length && (
              <span className="text-[11px] opacity-75 ms-1">
                ({isEn ? `filtered from ${(config.syncedUsers || []).length}` : `فیلترشده از ${(config.syncedUsers || []).length}`})
              </span>
            )}
          </span>

          {/* Per-page selector */}
          <div className="flex items-center gap-1.5 ms-2">
            <span className="text-[11px] opacity-80">{isEn ? 'Per page:' : 'در هر صفحه:'}</span>
            <select
              value={usersPerPage}
              onChange={(e) => {
                setUsersPerPage(Number(e.target.value));
                setUsersPage(1);
              }}
              className={`px-2 py-0.5 rounded-lg border text-xs font-mono outline-none cursor-pointer ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-800'
                  : 'bg-slate-800 border-white/15 text-white'
              }`}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
            </select>
          </div>
        </div>

        {/* Right: Page navigation buttons */}
        {totalUserPages > 1 && (
          <div className="flex items-center gap-1 flex-wrap">
            {/* First Page */}
            <button
              type="button"
              onClick={() => setUsersPage(1)}
              disabled={safeUsersPage <= 1}
              className={`p-1 rounded-lg border transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                isLightMode
                  ? 'hover:bg-slate-200 border-slate-300 text-slate-700'
                  : 'hover:bg-white/10 border-white/15 text-white'
              }`}
              title={isEn ? 'First page' : 'صفحه نخست'}
            >
              {isRtl ? <ChevronsRight className="w-3.5 h-3.5" /> : <ChevronsLeft className="w-3.5 h-3.5" />}
            </button>

            {/* Previous Page */}
            <button
              type="button"
              onClick={() => setUsersPage((p) => Math.max(1, p - 1))}
              disabled={safeUsersPage <= 1}
              className={`p-1 rounded-lg border transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                isLightMode
                  ? 'hover:bg-slate-200 border-slate-300 text-slate-700'
                  : 'hover:bg-white/10 border-white/15 text-white'
              }`}
              title={isEn ? 'Previous page' : 'صفحه قبل'}
            >
              {isRtl ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
            </button>

            {/* Page number buttons */}
            <div className="flex items-center gap-1 mx-1">
              {getPaginationNumbers(safeUsersPage, totalUserPages).map((p, idx) =>
                p === '...' ? (
                  <span key={`dots-${idx}`} className="px-1 text-slate-500 font-mono">
                    ...
                  </span>
                ) : (
                  <button
                    key={`page-${p}`}
                    type="button"
                    onClick={() => setUsersPage(p)}
                    className={`min-w-[28px] h-7 px-1.5 rounded-lg text-xs font-mono font-semibold transition cursor-pointer ${
                      safeUsersPage === p
                        ? 'bg-cyan-500 text-white shadow-xs'
                        : isLightMode
                        ? 'hover:bg-slate-200 text-slate-700 border border-slate-200'
                        : 'hover:bg-white/10 text-slate-300 border border-white/10'
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
            </div>

            {/* Next Page */}
            <button
              type="button"
              onClick={() => setUsersPage((p) => Math.min(totalUserPages, p + 1))}
              disabled={safeUsersPage >= totalUserPages}
              className={`p-1 rounded-lg border transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                isLightMode
                  ? 'hover:bg-slate-200 border-slate-300 text-slate-700'
                  : 'hover:bg-white/10 border-white/15 text-white'
              }`}
              title={isEn ? 'Next page' : 'صفحه بعد'}
            >
              {isRtl ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>

            {/* Last Page */}
            <button
              type="button"
              onClick={() => setUsersPage(totalUserPages)}
              disabled={safeUsersPage >= totalUserPages}
              className={`p-1 rounded-lg border transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                isLightMode
                  ? 'hover:bg-slate-200 border-slate-300 text-slate-700'
                  : 'hover:bg-white/10 border-white/15 text-white'
              }`}
              title={isEn ? 'Last page' : 'صفحه آخر'}
            >
              {isRtl ? <ChevronsLeft className="w-3.5 h-3.5" /> : <ChevronsRight className="w-3.5 h-3.5" />}
            </button>

            {/* Jump to Page (only if total pages > 5) */}
            {totalUserPages > 5 && (
              <div className="flex items-center gap-1 ms-2">
                <span className="text-[10px] opacity-70">{isEn ? 'Go:' : 'برو:'}</span>
                <input
                  type="number"
                  min={1}
                  max={totalUserPages}
                  defaultValue={safeUsersPage}
                  key={`jump-${safeUsersPage}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = parseInt((e.target as HTMLInputElement).value, 10);
                      if (!isNaN(val)) {
                        setUsersPage(Math.min(Math.max(1, val), totalUserPages));
                      }
                    }
                  }}
                  className={`w-12 px-1.5 py-0.5 rounded border text-center text-xs font-mono outline-none ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800'
                      : 'bg-slate-800 border-white/15 text-white'
                  }`}
                />
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const isConnected = config.lastSyncStatus === 'success';

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner Card */}
      <div
        className={`p-5 rounded-2xl border backdrop-blur-xl relative overflow-hidden shadow-xl ${
          isLightMode
            ? 'bg-white/90 border-slate-200'
            : 'bg-slate-950/70 border-white/10'
        }`}
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="p-3 rounded-2xl bg-gradient-to-tr from-cyan-600 to-indigo-600 text-white shadow-lg shadow-cyan-500/25 shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold font-mono text-white">
                  {isEn
                    ? 'Active Directory Users, Groups & Panel Access Control'
                    : 'مدیریت کاربران، گروه‌ها و سطوح دسترسی اکتیو دایرکتوری'}
                </h2>
                {isConnected ? (
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{config.domain || 'corp.internal'}</span>
                  </span>
                ) : (
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-slate-500/20 text-slate-300 font-mono border border-slate-500/30">
                    {isEn ? 'Not Connected' : 'ارتباط برقرار نیست'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {isEn
                  ? 'Manage synchronized Active Directory security groups, domain users, and map them to NOC panel access policies (RBAC).'
                  : 'مشاهده کاربران و گروه‌های امنیتی همگام‌شده دامین و اختصاص مستقیم نقش‌ها و سطوح دسترسی پنل (RBAC) به آن‌ها.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap self-start md:self-auto">
            {onNavigateToConnectionSettings && (
              <button
                onClick={onNavigateToConnectionSettings}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-600/30 to-indigo-600/30 hover:from-sky-600/50 hover:to-indigo-600/50 text-sky-200 border border-sky-500/40 text-xs font-semibold transition active:scale-95 cursor-pointer shadow-xs"
                title={isEn ? 'Configure Domain Controller connection parameters' : 'تنظیم پارامترهای اتصال دامین کنترلر در بخش سیتینگ'}
              >
                <Server className="w-3.5 h-3.5 text-sky-400" />
                <span>{isEn ? 'Connection Parameters (Settings)' : 'تنظیمات اتصال (در سیتینگ)'}</span>
                <ExternalLink className="w-3 h-3 text-sky-300" />
              </button>
            )}

            <button
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs shadow-md transition active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? (isEn ? 'Syncing...' : 'درحال همگام‌سازی...') : (isEn ? 'Sync Objects' : 'همگام‌سازی آبجکت‌ها')}</span>
            </button>
          </div>
        </div>
      </div>

      {toastMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2 animate-fadeIn shadow-md">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {syncError && (
        <div className="p-3.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs flex items-center justify-between gap-2 animate-fadeIn shadow-md">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{syncError}</span>
          </div>
          <button onClick={() => setSyncError(null)} className="text-rose-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Container: Synced AD Objects Explorer & RBAC Assignment */}
      <div
        className={`p-6 rounded-2xl border backdrop-blur-xl shadow-lg space-y-5 ${
          isLightMode
            ? 'bg-white/90 border-slate-200'
            : 'bg-slate-950/60 border-white/10'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveSubTab('groups')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeSubTab === 'groups'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-xs'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>{isEn ? 'Active Directory Groups & Panel Roles' : 'گروه‌های امنیتی دامین و نقش‌های پنل'}</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/25 text-cyan-200">
                {config.syncedGroups?.length || 0}
              </span>
            </button>

            <button
              onClick={() => setActiveSubTab('users')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeSubTab === 'users'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-xs'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>{isEn ? 'Domain Users' : 'کاربران دامین'}</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/25 text-cyan-200">
                {config.syncedUsers?.length || 0}
              </span>
            </button>
          </div>

          {/* Filter Bar: Role Assignment Filter & Search */}
          <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto">
            {activeSubTab === 'groups' && (
              <div
                className={`flex items-center gap-1 p-1 rounded-xl border text-xs ${
                  isLightMode
                    ? 'bg-slate-100 border-slate-200'
                    : 'bg-slate-900/90 border-white/10'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setRoleFilter('all')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 ${
                    roleFilter === 'all'
                      ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>{isEn ? 'All Groups' : 'همه گروه‌ها'}</span>
                  <span className="text-[10px] font-mono opacity-80">
                    ({(config.syncedGroups || []).length})
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setRoleFilter('assigned')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                    roleFilter === 'assigned'
                      ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 shadow-xs'
                      : 'text-slate-400 hover:text-emerald-300'
                  }`}
                  title={isEn ? 'Filter groups with an assigned panel RBAC policy' : 'فیلتر گروه‌های دارای نقش دسترسی انتساب‌یافته در پنل'}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{isEn ? 'Role Assigned' : 'دارای نقش'}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-500/30 text-emerald-200 font-bold">
                    {assignedGroupsCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setRoleFilter('unassigned')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 ${
                    roleFilter === 'unassigned'
                      ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40 shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>{isEn ? 'No Role' : 'بدون نقش'}</span>
                  <span className="text-[10px] font-mono opacity-80">
                    {Math.max(0, (config.syncedGroups || []).length - assignedGroupsCount)}
                  </span>
                </button>
              </div>
            )}

            {activeSubTab === 'users' && (
              <div
                className={`flex items-center gap-1 p-1 rounded-xl border text-xs ${
                  isLightMode
                    ? 'bg-slate-100 border-slate-200'
                    : 'bg-slate-900/90 border-white/10'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setRoleFilter('all')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 ${
                    roleFilter === 'all'
                      ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>{isEn ? 'All Users' : 'همه کاربران'}</span>
                  <span className="text-[10px] font-mono opacity-80">
                    ({(config.syncedUsers || []).length})
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setRoleFilter('assigned')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                    roleFilter === 'assigned'
                      ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 shadow-xs'
                      : 'text-slate-400 hover:text-emerald-300'
                  }`}
                  title={isEn ? 'Filter users with direct or inherited panel roles' : 'فیلتر کاربران دارای نقش مستقیم یا موروثی در پنل'}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{isEn ? 'Role Assigned' : 'دارای نقش'}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-500/30 text-emerald-200 font-bold">
                    {assignedUsersCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setRoleFilter('unassigned')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 ${
                    roleFilter === 'unassigned'
                      ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40 shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>{isEn ? 'No Role' : 'بدون نقش'}</span>
                  <span className="text-[10px] font-mono opacity-80">
                    {Math.max(0, (config.syncedUsers || []).length - assignedUsersCount)}
                  </span>
                </button>
              </div>
            )}

            <div className="relative w-full sm:w-64 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isEn ? 'Search objects, roles, DN...' : 'جستجو در گروه‌ها، کاربران، نقش‌ها...'}
                className="w-full pl-9 pr-3 rtl:pl-3 rtl:pr-9 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>
        </div>

        {/* Unsaved Changes Banner & Database Persistence Controls */}
        {hasUnsavedChanges && (
          <div
            className={`p-3.5 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fadeIn shadow-md ${
              isLightMode
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping shrink-0" />
              <div className="text-xs">
                <span className="font-bold">
                  {isEn ? 'Unsaved Role Modifications:' : 'تغییرات ذخیره‌نشده در نقش‌های دسترسی:'}
                </span>{' '}
                <span className="opacity-90">
                  {isEn
                    ? 'Role assignments are currently staged in memory. Click "Save to Database" to commit them authoritatively to PostgreSQL.'
                    : 'نقش‌های انتساب‌یافته در حافظه موقت هستند. جهت اعمال قطعی و ذخیره در پایگاه داده سرور روی دکمه "ذخیره در پایگاه داده" کلیک کنید.'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
              <button
                type="button"
                onClick={handleRevertChanges}
                disabled={isSavingPolicies}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50 ${
                  isLightMode
                    ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                    : 'border-white/20 text-slate-300 hover:bg-white/10'
                }`}
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>{isEn ? 'Revert' : 'لغو تغییرات'}</span>
              </button>

              <button
                type="button"
                onClick={handleSaveAllPolicies}
                disabled={isSavingPolicies}
                className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md transition active:scale-95 cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                <Save className={`w-3.5 h-3.5 ${isSavingPolicies ? 'animate-spin' : ''}`} />
                <span>
                  {isSavingPolicies
                    ? (isEn ? 'Saving to Database...' : 'درحال ذخیره در دیتابیس...')
                    : (isEn ? 'Save to Database' : 'ذخیره در پایگاه داده')}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Sub-tab 1: Security Groups with Direct Role Assignment */}
        {activeSubTab === 'groups' && (
          <div>
            {filteredGroups.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredGroups.map((grp) => {
                  const assignedPolicy = getPolicyForGroup(grp.dn);
                  return (
                    <div
                      key={grp.dn || grp.cn}
                      className={`p-4 rounded-xl border transition space-y-3 overflow-hidden ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-200 hover:border-cyan-500/50 text-slate-900'
                          : 'bg-slate-900/70 border-white/10 hover:border-cyan-500/40 text-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 min-w-0">
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shrink-0 mt-0.5">
                            <Users className="w-4 h-4 sm:w-5 sm:h-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-xs sm:text-sm flex items-center gap-1.5 flex-wrap">
                              <span className="truncate max-w-[140px] sm:max-w-[200px]" title={grp.cn}>
                                {grp.cn}
                              </span>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shrink-0">
                                {grp.memberCount} {isEn ? 'Members' : 'عضو'}
                              </span>
                            </div>
                            <div
                              className="text-[10px] text-slate-400 font-mono truncate w-full mt-0.5"
                              title={grp.dn}
                            >
                              {grp.dn}
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center">
                          {assignedPolicy ? (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold max-w-[130px] sm:max-w-[170px] truncate"
                              title={`${isEn ? 'Assigned Role:' : 'نقش انتساب‌یافته:'} ${assignedPolicy.name}`}
                            >
                              <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                              <span className="truncate">{assignedPolicy.name}</span>
                            </span>
                          ) : (
                            <span
                              className={`inline-flex items-center text-[10px] font-mono px-2 py-0.5 rounded-md border shrink-0 whitespace-nowrap ${
                                isLightMode
                                  ? 'bg-slate-200 text-slate-600 border-slate-300'
                                  : 'bg-slate-800 text-slate-400 border-white/5'
                              }`}
                              title={isEn ? 'No Role Assigned' : 'بدون نقش پنل'}
                            >
                              {isEn ? 'No Role Assigned' : 'بدون نقش پنل'}
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed">
                        {grp.description ||
                          (isEn
                            ? 'No description set on domain object.'
                            : 'توضیحاتی برای این گروه در دامین تنظیم نشده است.')}
                      </p>

                      {/* RBAC Panel Permission Assignment Selector */}
                      <div className="pt-2.5 border-t border-white/10 space-y-1.5 min-w-0">
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 shrink-0">
                            <Shield className="w-3.5 h-3.5 text-indigo-400" />
                            <span>{isEn ? 'Panel RBAC Policy:' : 'نقش دسترسی پنل:'}</span>
                          </span>
                          {assignedPolicy && (
                            <span className="text-[10px] font-mono text-emerald-400 truncate max-w-[140px] font-medium">
                              {assignedPolicy.name}
                            </span>
                          )}
                        </div>

                        <div className="relative w-full min-w-0">
                          <select
                            value={assignedPolicy?.id || 'none'}
                            onChange={(e) => handleAssignPolicyToGroup(grp, e.target.value)}
                            className={`w-full min-w-0 px-3 py-1.5 rounded-xl border text-xs font-medium focus:outline-none focus:ring-1 focus:ring-cyan-400 cursor-pointer truncate ${
                              isLightMode
                                ? 'bg-white border-slate-300 text-slate-800'
                                : 'bg-slate-800/95 border-white/15 text-white'
                            }`}
                          >
                            <option value="none">
                              {isEn ? '— No Panel Access (Revoke) —' : '— بدون دسترسی به پنل (فاقد نقش) —'}
                            </option>
                            {workingPolicies
                              .filter((p) => p.isBuiltin || p.subjectType !== 'ad_group' || p.subjectId === grp.dn)
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-14 flex flex-col items-center justify-center text-center p-6 rounded-2xl border border-dashed border-white/15 bg-white/[0.01]">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-3">
                  <Users className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-white mb-1">
                  {(config.syncedGroups || []).length === 0
                    ? isEn
                      ? 'No Security Groups Synchronized Yet'
                      : 'هنوز هیچ گروه امنیتی همگام‌سازی نشده است'
                    : roleFilter === 'assigned'
                    ? isEn
                      ? 'No Groups with Assigned Roles Found'
                      : 'هیچ گروهی با نقش انتساب‌یافته یافت نشد'
                    : roleFilter === 'unassigned'
                    ? isEn
                      ? 'All Groups Have Assigned Roles'
                      : 'تمامی گروه‌ها دارای نقش انتساب‌یافته هستند'
                    : isEn
                    ? 'No Matching Security Groups'
                    : 'هیچ گروهی منطبق بر جستجو یافت نشد'}
                </h4>
                <p className="text-xs text-slate-400 max-w-md mb-4">
                  {(config.syncedGroups || []).length === 0
                    ? isEn
                      ? 'To synchronize groups, please enter your Domain Controller parameters in Settings, then click "Sync Objects".'
                      : 'جهت دریافت گروه‌های دامین، لطفاً ابتدا پارامترهای اتصال دامین کنترلر را در بخش سیتینگ تکمیل کرده و دکمه «همگام‌سازی آبجکت‌ها» را بزنید.'
                    : roleFilter === 'assigned'
                    ? isEn
                      ? 'Assign a Panel RBAC Policy to any group above to grant panel access permissions.'
                      : 'برای اعطای سطح دسترسی به پنل، از منوی هر گروه نقش موردنظر را انتخاب نمایید.'
                    : isEn
                    ? `No security groups match "${searchQuery}".`
                    : `هیچ گروهی با عبارت «${searchQuery}» مطابقت ندارد.`}
                </p>

                {(config.syncedGroups || []).length === 0 && (
                  <div className="flex items-center gap-3">
                    {onNavigateToConnectionSettings && (
                      <button
                        onClick={onNavigateToConnectionSettings}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition shadow-md cursor-pointer"
                      >
                        <Server className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Configure in Settings' : 'ورود تنظیمات در سیتینگ'}</span>
                      </button>
                    )}
                    <button
                      onClick={handleSyncNow}
                      disabled={isSyncing}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-xs transition cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                      <span>{isEn ? 'Sync Objects' : 'همگام‌سازی'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Sub-tab 2: Domain Users & Inherited Permissions */}
        {activeSubTab === 'users' && (
          <div>
            {filteredUsers.length > 0 ? (
              <div className="space-y-3">
                {renderPaginationControls()}

                {paginatedUsers.map((user) => {
                  const inherited = getInheritedPoliciesForUser(user);
                  return (
                    <div
                      key={user.samAccountName || user.dn}
                      className={`flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 p-3.5 rounded-xl border transition ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-200 hover:border-cyan-500/50 text-slate-900'
                          : 'bg-slate-900/70 border-white/10 hover:border-cyan-500/40 text-white'
                      }`}
                    >
                      <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-600 flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-md">
                          {user.samAccountName ? user.samAccountName.slice(0, 2).toUpperCase() : 'AD'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs sm:text-sm truncate max-w-[200px]" title={user.displayName || user.samAccountName}>
                              {user.displayName || user.samAccountName}
                            </span>
                            <span className="text-[10px] font-mono text-cyan-300 shrink-0">
                              ({user.samAccountName})
                            </span>
                            {user.enabled ? (
                              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium shrink-0">
                                {isEn ? 'Active' : 'فعال'}
                              </span>
                            ) : (
                              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-medium shrink-0">
                                {isEn ? 'Disabled' : 'غیرفعال'}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 truncate max-w-full">
                            {user.department ? `${user.department} • ` : ''}
                            {user.title ? `${user.title} • ` : ''}
                            <span className="font-mono truncate">{user.email}</span>
                          </div>

                          {/* Member of Groups badges */}
                          {user.groups && user.groups.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap mt-1.5 max-w-full">
                              {user.groups.slice(0, 5).map((g) => (
                                <span
                                  key={g}
                                  className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-950/80 border border-cyan-800/40 text-cyan-300 truncate max-w-[140px]"
                                  title={g}
                                >
                                  {g}
                                </span>
                              ))}
                              {user.groups.length > 5 && (
                                <span
                                  className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-800 border border-white/10 text-slate-400 cursor-help shrink-0"
                                  title={user.groups.slice(5).join(', ')}
                                >
                                  +{user.groups.length - 5}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Direct Role Assignment Selector & Inherited Role / Group Badges */}
                      <div className="flex flex-col items-end gap-1.5 shrink-0 w-full lg:w-80 max-w-full lg:max-w-[320px] ml-auto rtl:mr-auto rtl:ml-0">
                        {/* Direct Role Selector */}
                        <div className="w-full space-y-1">
                          <div className="flex items-center justify-between gap-2 min-w-0">
                            <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5 shrink-0">
                              <Shield className="w-3 h-3 text-cyan-400" />
                              <span>{isEn ? 'Direct Panel Role:' : 'نقش اختصاصی پنل:'}</span>
                            </span>
                            {getDirectPolicyForUser(user) && (
                              <span className="text-[10px] font-mono text-cyan-300 font-semibold truncate max-w-[130px]" title={getDirectPolicyForUser(user)?.name}>
                                {getDirectPolicyForUser(user)?.name}
                              </span>
                            )}
                          </div>
                          <select
                            value={getDirectPolicyForUser(user)?.id || 'none'}
                            onChange={(e) => handleAssignPolicyToUser(user, e.target.value)}
                            className={`w-full min-w-0 max-w-full px-2.5 py-1.5 rounded-lg border text-xs font-medium focus:outline-none focus:ring-1 focus:ring-cyan-400 cursor-pointer truncate ${
                              isLightMode
                                ? 'bg-white border-slate-300 text-slate-800'
                                : 'bg-slate-800/95 border-white/15 text-white'
                            }`}
                          >
                            <option value="none">
                              {isEn ? '— Inherit from Groups (No Direct Role) —' : '— ارث‌بری از گروه‌ها (بدون نقش مستقیم) —'}
                            </option>
                            {workingPolicies
                              .filter((p) => p.isBuiltin || p.subjectType !== 'ad_user' || p.subjectId === user.samAccountName || p.subjectId === user.dn)
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                          </select>
                        </div>

                        {/* Inherited Group Role Badges */}
                        <div className="flex items-center gap-1.5 flex-wrap justify-end max-w-full">
                          {inherited.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap justify-end max-w-full">
                              <span className="text-[10px] text-slate-400 shrink-0">{isEn ? 'Via group:' : 'از گروه:'}</span>
                              {inherited.map((p) => (
                                <span
                                  key={p.id}
                                  className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold truncate max-w-[130px]"
                                  title={p.name}
                                >
                                  {p.name}
                                </span>
                              ))}
                            </div>
                          )}
                          {!getDirectPolicyForUser(user) && inherited.length === 0 && (
                            <span
                              className={`text-[10px] font-mono px-2 py-0.5 rounded-md border shrink-0 ${
                                isLightMode
                                  ? 'bg-slate-200 text-slate-600 border-slate-300'
                                  : 'bg-slate-800 text-slate-400 border-white/5'
                              }`}
                            >
                              {isEn ? 'No Panel Role' : 'بدون نقش پنل'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {renderPaginationControls()}
              </div>
            ) : (
              <div className="py-14 flex flex-col items-center justify-center text-center p-6 rounded-2xl border border-dashed border-white/15 bg-white/[0.01]">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3">
                  <UserCheck className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-white mb-1">
                  {(config.syncedUsers || []).length === 0
                    ? isEn
                      ? 'No Domain Users Synchronized Yet'
                      : 'هنوز هیچ کاربری از دامین دریافت نشده است'
                    : isEn
                    ? 'No Matching Domain Users'
                    : 'هیچ کاربری منطبق بر جستجو یافت نشد'}
                </h4>
                <p className="text-xs text-slate-400 max-w-md mb-4">
                  {(config.syncedUsers || []).length === 0
                    ? isEn
                      ? 'Set up Domain Controller parameters in Settings, then click "Sync Objects" to fetch domain user profiles.'
                      : 'تنظیمات دامین کنترلر را در بخش سیتینگ وارد کرده و دکمه «همگام‌سازی» را بزنید تا حساب‌های کاربری واقعی استعلام شوند.'
                    : isEn
                    ? `No domain users match "${searchQuery}".`
                    : `هیچ کاربری با عبارت «${searchQuery}» مطابقت ندارد.`}
                </p>
                {(config.syncedUsers || []).length === 0 && (
                  <button
                    onClick={handleSyncNow}
                    disabled={isSyncing}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition shadow-md cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isEn ? 'Sync Objects' : 'همگام‌سازی آبجکت‌ها'}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
