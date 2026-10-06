import React, { useState, useEffect } from 'react';
import {
  Server,
  Zap,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Terminal,
  KeyRound,
  Shield,
  ArrowRight,
  ArrowLeft,
  X,
  Lock,
  Layers,
  Users
} from 'lucide-react';
import { ActiveDirectoryConfig, ADTestResult } from '../../types';
import { testActiveDirectoryConnectionApi, syncActiveDirectoryApi } from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { useLanguage } from '../../i18n';
import { APP_VERSION } from '../../version';

interface LdapConnectionSettingsViewProps {
  config: ActiveDirectoryConfig;
  onSaveConfig: (cfg: ActiveDirectoryConfig) => void;
  onNavigateToDirectory?: () => void;
  isLightMode?: boolean;
}

export const LdapConnectionSettingsView: React.FC<LdapConnectionSettingsViewProps> = ({
  config,
  onSaveConfig,
  onNavigateToDirectory,
  isLightMode = false,
}) => {
  const { isRtl, isEn } = useLanguage();
  const [formData, setFormData] = useState<ActiveDirectoryConfig>({ ...config });
  const [showPassword, setShowPassword] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ADTestResult | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState(false);

  useEffect(() => {
    setFormData({ ...config });
  }, [config]);

  const handleInputChange = (field: keyof ActiveDirectoryConfig, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig(formData);
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 3000);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    setSyncError(null);
    try {
      const result = await testActiveDirectoryConnectionApi(formData);
      setTestResult(result);
      const updated: ActiveDirectoryConfig = {
        ...formData,
        lastSyncStatus: result.success ? 'success' : 'failed',
        lastSyncMessage: result.message,
        lastSyncTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
      };
      setFormData(updated);
      onSaveConfig(updated);
    } catch (err: any) {
      const failResult: ADTestResult = {
        success: false,
        latency_ms: 0,
        message:
          err.message ||
          (isEn
            ? 'Failed to test connection to Active Directory server'
            : 'خطا در تست ارتباط با سرور دامین کنترلر'),
        logs: [`[Client Exception] ${err.message || 'Connection failure'}`],
      };
      setTestResult(failResult);
      const updated: ActiveDirectoryConfig = {
        ...formData,
        lastSyncStatus: 'failed',
        lastSyncMessage: failResult.message,
        lastSyncTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
      };
      setFormData(updated);
      onSaveConfig(updated);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      const res = await syncActiveDirectoryApi(formData);
      if (res.success) {
        const updated: ActiveDirectoryConfig = {
          ...formData,
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
        setFormData(updated);
        onSaveConfig(updated);
      } else {
        const errorMsg =
          res.error ||
          (isEn
            ? 'Failed to synchronize objects from Active Directory'
            : 'خطا در دریافت آبجکت‌ها از اکتیو دایرکتوری');
        setSyncError(errorMsg);
        const updated: ActiveDirectoryConfig = {
          ...formData,
          lastSyncStatus: 'failed',
          lastSyncMessage: errorMsg,
          lastSyncTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
        };
        setFormData(updated);
        onSaveConfig(updated);
      }
    } catch (err: any) {
      const errorMsg =
        err.message ||
        (isEn
          ? 'Failed to connect to Active Directory server for synchronization'
          : 'خطا در برقراری ارتباط با سرور دامین جهت همگام‌سازی');
      setSyncError(errorMsg);
      const updated: ActiveDirectoryConfig = {
        ...formData,
        lastSyncStatus: 'failed',
        lastSyncMessage: errorMsg,
        lastSyncTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
      };
      setFormData(updated);
      onSaveConfig(updated);
    } finally {
      setIsSyncing(false);
    }
  };

  const isConnected = formData.lastSyncStatus === 'success';
  const isFailed = formData.lastSyncStatus === 'failed';

  return (
    <div
      className={`min-h-full p-4 lg:p-8 space-y-6 transition-colors duration-200 ${
        isLightMode ? 'text-slate-900' : 'text-slate-100'
      }`}
    >
      {/* Top Header Banner */}
      <div
        className={`p-6 rounded-2xl border backdrop-blur-xl relative overflow-hidden shadow-xl ${
          isLightMode
            ? 'bg-white/90 border-slate-200 shadow-slate-200/50'
            : 'bg-slate-950/70 border-white/10 shadow-black/40'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="p-3 rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white shadow-lg shadow-sky-500/25 shrink-0">
              <KeyRound className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight font-mono">
                  {isEn ? 'Domain Controller Connection Parameters' : 'تنظیمات اتصال دامین کنترلر و ال‌دپ'}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  LDAP / LDAPS
                </span>
                {isConnected ? (
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {isEn ? 'Connected' : 'متصل'}
                  </span>
                ) : isFailed ? (
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-mono border border-rose-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                    {isEn ? 'Error' : 'خطا در اتصال'}
                  </span>
                ) : (
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-500/20 text-slate-300 font-mono border border-slate-500/30">
                    {isEn ? 'Not Tested' : 'بررسی‌نشده'}
                  </span>
                )}
              </div>
              <p
                className={`text-xs sm:text-sm mt-1 ${
                  isLightMode ? 'text-slate-600' : 'text-slate-400'
                }`}
              >
                {isEn
                  ? 'Configure authentic connection parameters to Microsoft Active Directory or OpenLDAP Domain Controllers.'
                  : 'پیکربندی پارامترهای ارتباط مستقیم با دامین کنترلر اکتیو دایرکتوری مایکروسافت یا سرورهای OpenLDAP سازمانی.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap self-start md:self-auto">
            {onNavigateToDirectory && (
              <button
                onClick={onNavigateToDirectory}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-cyan-300 border border-white/15 text-xs font-semibold transition active:scale-95 cursor-pointer"
                title={isEn ? 'View synced groups/users and manage panel access' : 'مشاهده کاربران، گروه‌ها و مدیریت دسترسی‌های پنل'}
              >
                <Users className="w-4 h-4 text-cyan-400" />
                <span>{isEn ? 'Directory Users & Roles' : 'کاربران و دسترسی‌های دامین'}</span>
                {isRtl ? <ArrowLeft className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
              </button>
            )}

            <button
              onClick={handleSyncNow}
              disabled={isSyncing || isTesting}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white border border-white/15 text-xs font-semibold transition active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-cyan-400' : ''}`} />
              <span>{isSyncing ? (isEn ? 'Syncing...' : 'درحال استعلام...') : (isEn ? 'Sync Objects' : 'همگام‌سازی آبجکت‌ها')}</span>
            </button>

            <button
              onClick={handleTestConnection}
              disabled={isTesting || isSyncing}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md transition active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <Zap className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
              <span>{isTesting ? (isEn ? 'Testing...' : 'درحال تست...') : (isEn ? 'Test Connection' : 'تست اتصال زنده')}</span>
            </button>
          </div>
        </div>
      </div>

      {saveToast && (
        <div className="p-3.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2 animate-fadeIn shadow-md">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{isEn ? 'Active Directory connection parameters saved successfully.' : 'پارامترهای اتصال اکتیو دایرکتوری با موفقیت در پایگاه‌داده ذخیره شد.'}</span>
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

      {/* Main Grid: Connection Parameters Form + Live Diagnostic Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Connection Form */}
        <form
          onSubmit={handleSave}
          className={`lg:col-span-7 space-y-4 p-6 rounded-2xl border backdrop-blur-xl shadow-lg ${
            isLightMode
              ? 'bg-white/90 border-slate-200'
              : 'bg-slate-950/60 border-white/10'
          }`}
        >
          <div className="border-b border-white/10 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-sky-400" />
              <h3 className="font-bold text-sm text-white">
                {isEn ? 'Domain Controller Configuration' : 'پیکربندی اتصال دامین کنترلر'}
              </h3>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={formData.enabled}
                onChange={(e) => handleInputChange('enabled', e.target.checked)}
                className="w-4 h-4 accent-sky-500 rounded cursor-pointer"
              />
              <span className="font-semibold">{isEn ? 'Enable AD Integration' : 'فعال‌سازی ارتباط AD'}</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  {isEn ? 'Server Host / IP' : 'آدرس سرور یا IP دامین کنترلر'}
                </label>
                <FieldInfoTooltip
                  isEn={isEn}
                  title={isEn ? 'Active Directory Server Host' : 'آدرس سرور اکتیو دایرکتوری'}
                  infoWhatEn="Hostname or IP address of the Windows Server Domain Controller or LDAP server."
                  infoWhatFa="آدرس آی‌پی یا نام دامنه سرور دامین کنترلر ویندوز سرور یا سرور LDAP سازمان."
                  infoWhyEn="Required to establish authentic TCP socket connection and query corporate directory objects."
                  infoWhyFa="جهت برقراری ارتباط سوکت TCP با سرور اکتیو دایرکتوری و استعلام لحظه‌ای آبجکت‌ها الزامی است."
                  infoExampleEn="192.168.1.10 or dc01.corp.internal"
                  infoExampleFa="192.168.1.10 یا dc01.corp.internal"
                />
              </div>
              <input
                type="text"
                required
                value={formData.server}
                onChange={(e) => handleInputChange('server', e.target.value)}
                placeholder="192.168.1.10 or dc01.corp.internal"
                className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-sky-400"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  {isEn ? 'Port' : 'پورت'}
                </label>
                <FieldInfoTooltip
                  isEn={isEn}
                  title={isEn ? 'LDAP Port' : 'پورت پروتکل LDAP'}
                  infoWhatEn="TCP network port where LDAP / LDAPS is listening."
                  infoWhatFa="پورت شبکه جهت برقراری نشست با سرویس دایرکتوری."
                  infoWhyEn="Standard LDAP operates on port 389, while SSL/TLS encrypted LDAPS operates on port 636."
                  infoWhyFa="پورت پیش‌فرض برای LDAP عادی ۳۸۹ و برای نسخه امن رمزنگاری‌شده با گواهی ۶۳۶ است."
                  infoExampleEn="389 (LDAP) or 636 (LDAPS)"
                  infoExampleFa="389 (عادی) یا 636 (امن SSL)"
                />
              </div>
              <input
                type="number"
                required
                value={formData.port}
                onChange={(e) => handleInputChange('port', parseInt(e.target.value, 10) || 389)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-sky-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  {isEn ? 'Active Directory Domain' : 'نام دامین (Domain)'}
                </label>
                <FieldInfoTooltip
                  isEn={isEn}
                  title={isEn ? 'Active Directory Domain' : 'نام دامنه دایرکتوری'}
                  infoWhatEn="Full domain name of the Active Directory Forest / Realm."
                  infoWhatFa="نام کامل دامین تحت مدیریت ویندوز سرور."
                  infoWhyEn="Used for Kerberos authentication, user principal name (UPN) resolution, and directory context."
                  infoWhyFa="جهت تعیین فضای نام کاربران و تطابق قوانین دسترسی بر اساس دامین سازمان."
                  infoExampleEn="corp.internal or domain.local"
                  infoExampleFa="corp.internal یا domain.local"
                />
              </div>
              <input
                type="text"
                required
                value={formData.domain}
                onChange={(e) => handleInputChange('domain', e.target.value)}
                placeholder="corp.internal"
                className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-sky-400"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  {isEn ? 'Base DN' : 'پایه دایرکتوری (Base DN)'}
                </label>
                <FieldInfoTooltip
                  isEn={isEn}
                  title={isEn ? 'Base Distinguished Name (BaseDN)' : 'پایه نام متمایز (Base DN)'}
                  infoWhatEn="Root distinguished name defining the top-level directory search boundary."
                  infoWhatFa="مسیر ریشه ساختار دایرکتوری در اکتیو دایرکتوری مایکروسافت."
                  infoWhyEn="Limits directory search operations to your organization domain partition."
                  infoWhyFa="مشخص‌کننده محدوده کل جستجو در دیتابیس دایرکتوری برای جلوگیری از سرچ بیهوده سایر کانتینرها."
                  infoExampleEn="DC=corp,DC=internal"
                  infoExampleFa="DC=corp,DC=internal"
                />
              </div>
              <input
                type="text"
                required
                value={formData.baseDn}
                onChange={(e) => handleInputChange('baseDn', e.target.value)}
                placeholder="DC=corp,DC=internal"
                className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-sky-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  {isEn ? 'Service Account / Bind User' : 'کاربر اتصال (Bind User / Service Account)'}
                </label>
                <FieldInfoTooltip
                  isEn={isEn}
                  title={isEn ? 'LDAP Bind Account' : 'حساب کاربری اتصال (Bind User)'}
                  infoWhatEn="Username or Distinguished Name of the service account used to authenticate LDAP queries."
                  infoWhatFa="نام کاربری یا اکانت سرویس جهت بایند و احراز هویت اولیه در اکتیو دایرکتوری."
                  infoWhyEn="Active Directory rejects anonymous LDAP queries; this account reads groups and user profiles."
                  infoWhyFa="اکتیو دایرکتوری درخواست‌های ناشناس را رد می‌کند و برای استعلام گروه‌ها به اکانت بایند نیاز است."
                  infoExampleEn="svc-netops@corp.internal or CN=svc,OU=ServiceAccounts,DC=corp,DC=internal"
                  infoExampleFa="svc-netops@corp.internal یا CN=ldap_svc,DC=corp,DC=internal"
                />
              </div>
              <input
                type="text"
                required
                value={formData.bindUser}
                onChange={(e) => handleInputChange('bindUser', e.target.value)}
                placeholder="svc-netops@corp.internal"
                className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-sky-400"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  {isEn ? 'Bind Password' : 'رمز عبور اکانت سرویس'}
                </label>
                <FieldInfoTooltip
                  isEn={isEn}
                  title={isEn ? 'Bind Password' : 'رمز عبور اکانت سرویس'}
                  infoWhatEn="Password credential for the LDAP Bind Service Account."
                  infoWhatFa="رمز عبور حساب سرویس برای احراز هویت در دامین کنترلر."
                  infoWhyEn="Required to complete the simple bind handshake with the Domain Controller."
                  infoWhyFa="جهت اعتبارسنجی نشست LDAP و کسب مجوز خواندن ساختار سازمانی."
                  infoExampleEn="SecureServicePass!2026"
                  infoExampleFa="کلمه عبور امن اکانت سرویس دامین"
                />
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.bindPassword || ''}
                  onChange={(e) => handleInputChange('bindPassword', e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-3 pr-10 rtl:pl-10 rtl:pr-3 py-2 rounded-xl bg-slate-900/80 border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-sky-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 rtl:right-auto rtl:left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  {isEn ? 'Security Groups Search OU' : 'واحد سازمانی گروه‌ها (Groups OU)'}
                </label>
                <FieldInfoTooltip
                  isEn={isEn}
                  title={isEn ? 'Groups Search Base' : 'مسیر جستجوی گروه‌ها (Groups OU)'}
                  infoWhatEn="Specific Organizational Unit (OU) where corporate security groups are located."
                  infoWhatFa="مسیر دقیق OU حاوی گروه‌های امنیتی شبکه در اکتیو دایرکتوری."
                  infoWhyEn="Limits queries to authorized network security groups rather than scanning millions of irrelevant objects."
                  infoWhyFa="باعث افزایش سرعت استعلام و تفکیک گروه‌های عملیاتی شبکه از سایر گروه‌های متفرقه می‌شود."
                  infoExampleEn="OU=SecurityGroups,DC=corp,DC=internal"
                  infoExampleFa="OU=SecurityGroups,DC=corp,DC=internal"
                />
              </div>
              <input
                type="text"
                value={formData.groupSearchBase}
                onChange={(e) => handleInputChange('groupSearchBase', e.target.value)}
                placeholder="OU=SecurityGroups,DC=corp,DC=internal"
                className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-sky-400"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  {isEn ? 'Users Search OU' : 'واحد سازمانی کاربران (Users OU)'}
                </label>
                <FieldInfoTooltip
                  isEn={isEn}
                  title={isEn ? 'Users Search Base' : 'مسیر جستجوی کاربران (Users OU)'}
                  infoWhatEn="Specific Organizational Unit (OU) where domain user accounts reside."
                  infoWhatFa="مسیر سازمانی OU که اکانت‌های کاربران و کارشناسان در آن قرار دارد."
                  infoWhyEn="Restricts user synchronization to relevant department staff and skips machine/computer accounts."
                  infoWhyFa="فقط پرسنل بخش مربوطه را بازیابی می‌کند و حساب‌های سیستمی و رایانه‌ای را فیلتر می‌نماید."
                  infoExampleEn="OU=Staff,DC=corp,DC=internal"
                  infoExampleFa="OU=Staff,DC=corp,DC=internal"
                />
              </div>
              <input
                type="text"
                value={formData.userSearchBase}
                onChange={(e) => handleInputChange('userSearchBase', e.target.value)}
                placeholder="OU=Staff,DC=corp,DC=internal"
                className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-sky-400"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={formData.useSsl}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setFormData((prev) => ({
                    ...prev,
                    useSsl: checked,
                    port: checked ? (prev.port === 389 ? 636 : prev.port) : (prev.port === 636 ? 389 : prev.port),
                  }));
                }}
                className="w-4 h-4 accent-sky-500 rounded cursor-pointer"
              />
              <span className="font-semibold">{isEn ? 'Use SSL / TLS (LDAPS Port 636)' : 'استفاده از پروتکل امن SSL/TLS (LDAPS)'}</span>
            </label>

            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold text-xs transition shadow-md shadow-sky-600/30 cursor-pointer active:scale-95"
            >
              {isEn ? 'Save AD Configuration' : 'ذخیره تنظیمات دایرکتوری'}
            </button>
          </div>
        </form>

        {/* Right Column: Diagnostics & Live Socket Console */}
        <div
          className={`lg:col-span-5 flex flex-col p-6 rounded-2xl border backdrop-blur-xl shadow-lg ${
            isLightMode
              ? 'bg-white/90 border-slate-200'
              : 'bg-slate-950/80 border-white/10'
          }`}
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-sky-400" />
              <h3 className="font-bold text-xs text-sky-300 font-mono">
                {isEn ? 'LDAP Diagnostic & Health Console' : 'کنسول مانیتورینگ اتصال و عیب‌یابی'}
              </h3>
            </div>
            {formData.lastSyncTime && (
              <span className="text-[10px] text-slate-400 font-mono">
                {formData.lastSyncTime.slice(11)}
              </span>
            )}
          </div>

          <div className="space-y-3 flex-1 flex flex-col justify-between">
            <div className="space-y-1.5 font-mono text-[11px] text-slate-300 p-3.5 rounded-xl bg-slate-900/90 border border-white/10 min-h-[200px] max-h-[300px] overflow-y-auto custom-scrollbar">
              {testResult ? (
                testResult.logs.map((line, idx) => {
                  const isSuccess =
                    line.includes('SUCCESS') ||
                    line.includes('Success') ||
                    line.includes('Connected') ||
                    line.includes('Verified');
                  const isFail =
                    line.includes('Failure') ||
                    line.includes('Error') ||
                    line.includes('failed') ||
                    line.includes('rejected');
                  const isProbe =
                    line.includes('Probe') ||
                    line.includes('Testing') ||
                    line.includes('Attempting');
                  return (
                    <div
                      key={idx}
                      className={`${
                        isFail
                          ? 'text-rose-400'
                          : isSuccess
                          ? 'text-emerald-400'
                          : isProbe
                          ? 'text-sky-300'
                          : 'text-slate-300'
                      }`}
                    >
                      {line}
                    </div>
                  );
                })
              ) : (
                <div className="text-slate-500 italic py-10 text-center text-xs">
                  {isEn
                    ? 'Click "Test Connection" to perform real TCP socket probe, validate bind credentials, and query directory RootDSE.'
                    : 'برای بررسی اتصال زنده سوکت LDAP، اعتبارسنجی بایند و بررسی ساختار BaseDN دکمه «تست اتصال زنده» را کلیک کنید.'}
                </div>
              )}
            </div>

            {testResult && (
              <div
                className={`p-3.5 rounded-xl border text-xs flex items-center justify-between shadow-xs ${
                  testResult.success
                    ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span className="font-semibold">{testResult.message}</span>
                </div>
                {testResult.latency_ms > 0 && (
                  <span
                    className={`font-mono text-[10px] px-2 py-0.5 rounded border shrink-0 ${
                      testResult.success
                        ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-200 border-rose-500/40'
                    }`}
                  >
                    {testResult.latency_ms} ms
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
