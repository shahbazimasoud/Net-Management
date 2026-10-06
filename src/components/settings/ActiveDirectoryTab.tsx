import React, { useState, useEffect } from 'react';
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
  ArrowLeft
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
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Access Policies state for RBAC mapping
  const [policies, setPolicies] = useState<AccessPolicy[]>(() => loadAccessPolicies());

  useEffect(() => {
    syncAccessPoliciesFromDatabase()
      .then((dbPolicies) => {
        if (Array.isArray(dbPolicies) && dbPolicies.length > 0) {
          setPolicies(dbPolicies);
        }
      })
      .catch(() => {});
  }, []);

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

  // Find policy assigned to a specific AD group
  const getPolicyForGroup = (groupDn: string): AccessPolicy | undefined => {
    return policies.find(
      (p) => p.subjectType === 'ad_group' && p.subjectId === groupDn
    );
  };

  // Find policy inherited by a domain user through their group memberships
  const getInheritedPoliciesForUser = (user: ADUser): AccessPolicy[] => {
    const userGroups = user.groups || [];
    return policies.filter(
      (p) =>
        (p.subjectType === 'ad_group' && userGroups.some((g) => g === p.subjectName || p.subjectId.includes(g))) ||
        (p.subjectType === 'ad_user' && (p.subjectId === user.samAccountName || p.subjectId === user.dn))
    );
  };

  // Assign or update panel access policy for an AD group
  const handleAssignPolicyToGroup = async (group: ADSecurityGroup, policyId: string) => {
    try {
      let updatedPolicies: AccessPolicy[] = [...policies];

      if (!policyId || policyId === 'none') {
        // Remove existing policy assignment for this group
        updatedPolicies = updatedPolicies.filter(
          (p) => !(p.subjectType === 'ad_group' && p.subjectId === group.dn)
        );
      } else {
        const sourceTemplate = policies.find((p) => p.id === policyId);
        if (!sourceTemplate) return;

        // Check if a policy already specifically targets this group
        const existingIdx = updatedPolicies.findIndex(
          (p) => p.subjectType === 'ad_group' && p.subjectId === group.dn
        );

        if (existingIdx >= 0) {
          // Update the existing group policy with template capabilities
          updatedPolicies[existingIdx] = {
            ...sourceTemplate,
            id: updatedPolicies[existingIdx].id,
            name: `${sourceTemplate.name} (${group.cn})`,
            subjectType: 'ad_group',
            subjectId: group.dn,
            subjectName: `${group.cn} (Active Directory)`,
            isBuiltin: false,
          };
        } else {
          // Create new policy mapping for this AD group
          const newPolicy: AccessPolicy = {
            ...sourceTemplate,
            id: `policy-ad-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
          updatedPolicies.push(newPolicy);
        }
      }

      setPolicies(updatedPolicies);
      saveAccessPolicies(updatedPolicies);
      await saveAccessPoliciesApi(updatedPolicies).catch(() => {});

      showToast(
        policyId === 'none'
          ? (isEn
              ? `Removed panel access policy from group ${group.cn}`
              : `دسترسی پنل از گروه ${group.cn} حذف شد`)
          : (isEn
              ? `Successfully assigned panel role to ${group.cn}`
              : `نقش دسترسی پنل با موفقیت به گروه ${group.cn} اختصاص یافت`)
      );
    } catch (e: any) {
      showToast(isEn ? 'Failed to save policy mapping' : 'خطا در ذخیره اختصاص نقش');
    }
  };

  // Filter groups & users
  const filteredGroups = (config.syncedGroups || []).filter(
    (g) =>
      g.cn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.dn.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredUsers = (config.syncedUsers || []).filter(
    (u) =>
      u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.samAccountName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

          <div className="relative w-full sm:w-72">
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
                            {policies
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
                    : isEn
                    ? 'No Matching Security Groups'
                    : 'هیچ گروهی منطبق بر جستجو یافت نشد'}
                </h4>
                <p className="text-xs text-slate-400 max-w-md mb-4">
                  {(config.syncedGroups || []).length === 0
                    ? isEn
                      ? 'To synchronize groups, please enter your Domain Controller parameters in Settings, then click "Sync Objects".'
                      : 'جهت دریافت گروه‌های دامین، لطفاً ابتدا پارامترهای اتصال دامین کنترلر را در بخش سیتینگ تکمیل کرده و دکمه «همگام‌سازی آبجکت‌ها» را بزنید.'
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
                {filteredUsers.map((user) => {
                  const inherited = getInheritedPoliciesForUser(user);
                  return (
                    <div
                      key={user.samAccountName || user.dn}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border transition overflow-hidden ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-200 hover:border-cyan-500/50 text-slate-900'
                          : 'bg-slate-900/70 border-white/10 hover:border-cyan-500/40 text-white'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
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
                        </div>
                      </div>

                      {/* Inherited Role & Group Badges */}
                      <div className="flex flex-col sm:items-end gap-1.5 shrink-0 max-w-full">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {inherited.length > 0 ? (
                            inherited.map((p) => (
                              <span
                                key={p.id}
                                className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold truncate max-w-[160px]"
                                title={isEn ? 'Panel role granted via group policy' : 'نقش پنل اعطاشده از طریق پالیسی گروه'}
                              >
                                {p.name}
                              </span>
                            ))
                          ) : (
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

                        <div className="flex items-center gap-1 flex-wrap">
                          {(user.groups || []).map((g) => (
                            <span
                              key={g}
                              className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-950/80 border border-cyan-800/40 text-cyan-300"
                            >
                              {g}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
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
