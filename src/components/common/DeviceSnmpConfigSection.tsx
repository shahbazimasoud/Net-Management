import React, { useState } from 'react';
import {
  Activity,
  Shield,
  Key,
  Lock,
  Eye,
  EyeOff,
  Server,
  Zap,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Sliders,
  Radio,
  ExternalLink,
} from 'lucide-react';
import {
  SnmpVersion,
  SnmpV3SecurityLevel,
  SnmpV3AuthProtocol,
  SnmpV3PrivProtocol,
} from '../../types';
import { FieldInfoTooltip } from './FieldInfoTooltip';
import { VaultPasswordPickerModal } from '../vault/VaultPasswordPickerModal';
import { VaultLinkedPasswordBadge } from '../vault/VaultLinkedPasswordBadge';
import { testSnmpConnection, SnmpTestResult } from '../../services/api';

export interface DeviceSnmpConfigSectionProps {
  // Device Host/IP for testing
  targetHost: string;
  isLightMode: boolean;
  isEn: boolean;

  // Form State
  snmpEnabled: boolean;
  setSnmpEnabled: (val: boolean) => void;
  snmpVersion: SnmpVersion;
  setSnmpVersion: (val: SnmpVersion) => void;
  snmpPort: number;
  setSnmpPort: (val: number) => void;
  snmpTimeout: number;
  setSnmpTimeout: (val: number) => void;
  snmpRetries: number;
  setSnmpRetries: (val: number) => void;

  // v1 & v2c
  snmpCommunity: string;
  setSnmpCommunity: (val: string) => void;
  snmpCommunityVaultItemId?: string;
  setSnmpCommunityVaultItemId: (val: string | undefined) => void;
  snmpCommunityVaultItemName?: string;
  setSnmpCommunityVaultItemName: (val: string) => void;
  snmpCommunitySet?: boolean;

  // v3
  snmpV3User: string;
  setSnmpV3User: (val: string) => void;
  snmpV3SecurityLevel: SnmpV3SecurityLevel;
  setSnmpV3SecurityLevel: (val: SnmpV3SecurityLevel) => void;

  snmpV3AuthProtocol: SnmpV3AuthProtocol;
  setSnmpV3AuthProtocol: (val: SnmpV3AuthProtocol) => void;
  snmpV3AuthPassword: string;
  setSnmpV3AuthPassword: (val: string) => void;
  snmpV3AuthVaultItemId?: string;
  setSnmpV3AuthVaultItemId: (val: string | undefined) => void;
  snmpV3AuthVaultItemName?: string;
  setSnmpV3AuthVaultItemName: (val: string) => void;
  snmpV3AuthPasswordSet?: boolean;

  snmpV3PrivProtocol: SnmpV3PrivProtocol;
  setSnmpV3PrivProtocol: (val: SnmpV3PrivProtocol) => void;
  snmpV3PrivPassword: string;
  setSnmpV3PrivPassword: (val: string) => void;
  snmpV3PrivVaultItemId?: string;
  setSnmpV3PrivVaultItemId: (val: string | undefined) => void;
  snmpV3PrivVaultItemName?: string;
  setSnmpV3PrivVaultItemName: (val: string) => void;
  snmpV3PrivPasswordSet?: boolean;

  snmpV3Context: string;
  setSnmpV3Context: (val: string) => void;
}

export const DeviceSnmpConfigSection: React.FC<DeviceSnmpConfigSectionProps> = ({
  targetHost,
  isLightMode,
  isEn,

  snmpEnabled,
  setSnmpEnabled,
  snmpVersion,
  setSnmpVersion,
  snmpPort,
  setSnmpPort,
  snmpTimeout,
  setSnmpTimeout,
  snmpRetries,
  setSnmpRetries,

  snmpCommunity,
  setSnmpCommunity,
  snmpCommunityVaultItemId,
  setSnmpCommunityVaultItemId,
  snmpCommunityVaultItemName,
  setSnmpCommunityVaultItemName,
  snmpCommunitySet,

  snmpV3User,
  setSnmpV3User,
  snmpV3SecurityLevel,
  setSnmpV3SecurityLevel,

  snmpV3AuthProtocol,
  setSnmpV3AuthProtocol,
  snmpV3AuthPassword,
  setSnmpV3AuthPassword,
  snmpV3AuthVaultItemId,
  setSnmpV3AuthVaultItemId,
  snmpV3AuthVaultItemName,
  setSnmpV3AuthVaultItemName,
  snmpV3AuthPasswordSet,

  snmpV3PrivProtocol,
  setSnmpV3PrivProtocol,
  snmpV3PrivPassword,
  setSnmpV3PrivPassword,
  snmpV3PrivVaultItemId,
  setSnmpV3PrivVaultItemId,
  snmpV3PrivVaultItemName,
  setSnmpV3PrivVaultItemName,
  snmpV3PrivPasswordSet,

  snmpV3Context,
  setSnmpV3Context,
}) => {
  // Local visibility toggles
  const [showCommunity, setShowCommunity] = useState(false);
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [showPrivPassword, setShowPrivPassword] = useState(false);

  // Vault picker state
  const [isVaultPickerOpen, setIsVaultPickerOpen] = useState(false);
  const [vaultPickerTarget, setVaultPickerTarget] = useState<'community' | 'v3auth' | 'v3priv'>('community');

  // Live SNMP reachability testing state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<SnmpTestResult | null>(null);

  const handleOpenVaultPicker = (target: 'community' | 'v3auth' | 'v3priv') => {
    setVaultPickerTarget(target);
    setIsVaultPickerOpen(true);
  };

  const handleTestSnmp = async () => {
    const host = targetHost.trim();
    if (!host) {
      setTestResult({
        success: false,
        version: snmpVersion,
        port: snmpPort,
        target: '',
        error: isEn ? 'Please specify an IP address or hostname first' : 'لطفاً ابتدا آدرس IP یا نام دستگاه را وارد کنید',
        errorFa: 'لطفاً ابتدا آدرس IP یا نام دستگاه را وارد کنید',
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await testSnmpConnection({
        host,
        port: snmpPort,
        version: snmpVersion,
        community: snmpCommunity,
        community_vault_item_id: snmpCommunityVaultItemId,
        v3_user: snmpV3User,
        v3_security_level: snmpV3SecurityLevel,
        v3_auth_protocol: snmpV3AuthProtocol,
        v3_auth_password: snmpV3AuthPassword,
        v3_auth_vault_item_id: snmpV3AuthVaultItemId,
        v3_priv_protocol: snmpV3PrivProtocol,
        v3_priv_password: snmpV3PrivPassword,
        v3_priv_vault_item_id: snmpV3PrivVaultItemId,
        v3_context: snmpV3Context,
        timeout: snmpTimeout,
        retries: snmpRetries,
        is_en: isEn,
      });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        version: snmpVersion,
        port: snmpPort,
        target: host,
        error: err.message || (isEn ? 'Failed to test SNMP connectivity' : 'خطا در برقراری ارتباط با SNMP'),
        errorFa: 'خطا در برقراری ارتباط با SNMP',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const authProtocols: SnmpV3AuthProtocol[] = ['SHA-256', 'SHA-512', 'SHA-384', 'SHA-224', 'SHA-1', 'MD5'];
  const privProtocols: SnmpV3PrivProtocol[] = ['AES-128', 'AES-192', 'AES-256', '3DES', 'DES'];

  return (
    <div
      className={`p-3.5 rounded-xl border space-y-3.5 transition-all ${
        isLightMode
          ? 'bg-slate-50/90 border-slate-200 shadow-xs'
          : 'bg-slate-900/80 border-slate-700/80 shadow-md'
      }`}
    >
      {/* Header with Enable Toggle and Badge */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-1.5 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div
            className={`p-1.5 rounded-lg ${
              snmpEnabled
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-slate-500/15 text-slate-500 dark:text-slate-400'
            }`}
          >
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold ${isLightMode ? 'text-slate-900' : 'text-slate-100'}`}>
                {isEn ? 'SNMP Telemetry & Monitoring Profile' : 'پروفایل پایش و دورسنجی SNMP'}
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-medium ${
                  snmpEnabled
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/50'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {snmpEnabled ? (isEn ? 'Active' : 'فعال') : (isEn ? 'Disabled' : 'غیرفعال')}
              </span>
            </div>
            <p className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn
                ? 'Query hardware health, interface counters, CPU load & MIB-2 telemetry'
                : 'دریافت بار پردازنده، وضعیت سخت‌افزار، ترافیک اینترفیس‌ها و شاخص‌های MIB-2'}
            </p>
          </div>
        </div>

        {/* Master Toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span className={`text-xs font-medium ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
            {isEn ? 'Enable SNMP' : 'فعال‌سازی SNMP'}
          </span>
          <div className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={snmpEnabled}
              onChange={(e) => setSnmpEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div
              className={`w-11 h-6 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${
                isLightMode ? 'dark:bg-slate-700' : 'bg-slate-700'
              } peer-checked:bg-emerald-600`}
            ></div>
          </div>
        </label>
      </div>

      {snmpEnabled && (
        <div className="space-y-3.5">
          {/* Version Selector Tabs & Port/Timeout Row */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            {/* Version Selection */}
            <div className="md:col-span-7 space-y-1">
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-semibold ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                  {isEn ? 'Protocol Version:' : 'نسخه پروتکل SNMP:'}
                </span>
                <FieldInfoTooltip
                  title={isEn ? 'SNMP Protocol Version' : 'نسخه پروتکل SNMP'}
                  whatIsIt={
                    isEn
                      ? 'Selects between legacy unencrypted SNMP (v1, v2c) and cryptographic User-Based Security (v3).'
                      : 'انتخاب بین پروتکل‌های قدیمی بدون رمزنگاری (v1، v2c) یا استاندارد مدرن و رمزنگاری‌شده (v3).'
                  }
                  whyNeeded={
                    isEn
                      ? 'Different Cisco switches and network platforms require matching SNMP protocol versions for telemetry polling.'
                      : 'سوییچ‌های سیسکو و تجهیزات شبکه بر اساس معماری خود نیازمند نسخه منطبق جهت ارسال تلمتری هستند.'
                  }
                  practicalExample={
                    isEn
                      ? 'Use v2c for standard campus LANs or v3 (authPriv) for high-security environments.'
                      : 'برای شبکه‌های داخلی سازمانی v2c و برای زیرساخت‌های حساس با الزامات امنیتی v3 پیشنهاد می‌شود.'
                  }
                  isLightMode={isLightMode}
                  isEn={isEn}
                />
              </div>

              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-950/60 border border-slate-300 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setSnmpVersion('v2c')}
                  className={`py-1.5 px-2 rounded-md text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    snmpVersion === 'v2c'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : isLightMode
                      ? 'text-slate-700 hover:bg-slate-300/60'
                      : 'text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <span>v2c</span>
                  <span className="text-[10px] opacity-80">({isEn ? 'Standard' : 'استاندارد'})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSnmpVersion('v3')}
                  className={`py-1.5 px-2 rounded-md text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    snmpVersion === 'v3'
                      ? 'bg-cyan-600 text-white shadow-xs'
                      : isLightMode
                      ? 'text-slate-700 hover:bg-slate-300/60'
                      : 'text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <Shield className="w-3 h-3" />
                  <span>v3</span>
                  <span className="text-[10px] opacity-80">({isEn ? 'Secure' : 'امن'})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSnmpVersion('v1')}
                  className={`py-1.5 px-2 rounded-md text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    snmpVersion === 'v1'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : isLightMode
                      ? 'text-slate-700 hover:bg-slate-300/60'
                      : 'text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <span>v1</span>
                  <span className="text-[10px] opacity-80">({isEn ? 'Legacy' : 'قدیمی'})</span>
                </button>
              </div>
            </div>

            {/* UDP Port & Timeout */}
            <div className="md:col-span-5 grid grid-cols-2 gap-2">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[11px] font-semibold ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                    {isEn ? 'UDP Port:' : 'پورت UDP:'}
                  </span>
                  <FieldInfoTooltip
                    title={isEn ? 'SNMP UDP Port' : 'پورت ارتباطی SNMP'}
                    whatIsIt={isEn ? 'Destination UDP listening port of the device.' : 'پورت شنود پروتکل SNMP روی دستگاه.'}
                    whyNeeded={isEn ? 'Default standard is 161; custom firewalls may map to non-standard ports.' : 'پورت استاندارد ۱۶۱ است؛ در فایروال‌ها گاهی پورت تغییر داده می‌شود.'}
                    practicalExample="161"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <input
                  type="number"
                  min="1"
                  max="65535"
                  value={snmpPort}
                  onChange={(e) => setSnmpPort(Number(e.target.value) || 161)}
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono transition ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-900 focus:border-indigo-600'
                      : 'bg-slate-950 border-slate-700 text-white focus:border-indigo-500'
                  }`}
                  dir="ltr"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[11px] font-semibold ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                    {isEn ? 'Timeout (ms):' : 'مهلت (میلی‌ثانیه):'}
                  </span>
                  <FieldInfoTooltip
                    title={isEn ? 'SNMP Request Timeout' : 'مهلت پاسخگویی SNMP'}
                    whatIsIt={isEn ? 'Wait time before timing out when querying OIDs.' : 'حداکثر زمان انتظار برای دریافت پاسخ تلمتری از تجهیز.'}
                    whyNeeded={isEn ? 'Prevents polling hangs on slow WAN or congested links.' : 'از قفل شدن درخواست‌ها در لینک‌های کم‌سرعت یا شلوغ جلوگیری می‌کند.'}
                    practicalExample="5000"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
                <input
                  type="number"
                  min="500"
                  max="30000"
                  step="500"
                  value={snmpTimeout}
                  onChange={(e) => setSnmpTimeout(Number(e.target.value) || 5000)}
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono transition ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-900 focus:border-indigo-600'
                      : 'bg-slate-950 border-slate-700 text-white focus:border-indigo-500'
                  }`}
                  dir="ltr"
                />
              </div>
            </div>
          </div>

          {/* Conditional Credential Controls based on version */}
          {(snmpVersion === 'v1' || snmpVersion === 'v2c') && (
            <div
              className={`p-3 rounded-lg border space-y-2.5 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950/60 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-indigo-500" />
                  <span className={`text-xs font-bold ${isLightMode ? 'text-slate-800' : 'text-slate-200'}`}>
                    {isEn ? 'SNMP Community String:' : 'رشته احراز هویت (Community String):'}
                  </span>
                </div>
                <FieldInfoTooltip
                  title={isEn ? 'SNMP Community String' : 'رشته Community'}
                  whatIsIt={
                    isEn
                      ? 'Passphrase acting as a password for SNMP v1 and v2c polling.'
                      : 'کلمه عبور مشترک بین سامانه مانیتورینگ و تجهیز جهت خواندن اطلاعات.'
                  }
                  whyNeeded={
                    isEn
                      ? 'Required by switches to authorize GET queries against system and port MIBs.'
                      : 'بدون این رشته، دستگاه به درخواست‌های دریافت اطلاعات پاسخ نخواهد داد.'
                  }
                  practicalExample="public, private, or C1sc0_M0nitor"
                  isLightMode={isLightMode}
                  isEn={isEn}
                />
              </div>

              {/* Vault Linked Badge or Input Field */}
              {snmpCommunityVaultItemId ? (
                <VaultLinkedPasswordBadge
                  vaultItemId={snmpCommunityVaultItemId}
                  vaultItemName={snmpCommunityVaultItemName}
                  onUnlink={() => {
                    setSnmpCommunityVaultItemId(undefined);
                    setSnmpCommunityVaultItemName('');
                  }}
                  isLightMode={isLightMode}
                  isEn={isEn}
                  subtitle={isEn ? 'Live Community string resolved from Vault' : 'رشته Community مستقیماً از ولت حل می‌شود'}
                />
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showCommunity ? 'text' : 'password'}
                        value={snmpCommunity}
                        onChange={(e) => setSnmpCommunity(e.target.value)}
                        placeholder={snmpCommunitySet ? (isEn ? '•••••• (Already configured)' : '•••••• (در دیتابیس ذخیره شده)') : 'public'}
                        className={`w-full px-3 py-1.5 pr-9 rounded-lg border text-xs font-mono transition ${
                          isLightMode
                            ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-indigo-600'
                            : 'bg-slate-900 border-slate-700 text-white focus:bg-slate-950 focus:border-indigo-500'
                        }`}
                        dir="ltr"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCommunity(!showCommunity)}
                        className={`absolute right-2.5 top-1/2 -translate-y-1/2 transition ${
                          isLightMode ? 'text-slate-400 hover:text-slate-700' : 'text-slate-500 hover:text-slate-300'
                        }`}
                        title={showCommunity ? (isEn ? 'Hide' : 'مخفی کردن') : (isEn ? 'Show' : 'نمایش')}
                      >
                        {showCommunity ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenVaultPicker('community')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer shrink-0 ${
                        isLightMode
                          ? 'bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border-cyan-300 shadow-2xs'
                          : 'bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 border-cyan-700/60'
                      }`}
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Link from Vault' : 'پیوند از ولت'}</span>
                    </button>
                  </div>

                  {snmpCommunitySet && !snmpCommunity && (
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>{isEn ? 'Existing Community string safely preserved in DB.' : 'رشته Community قبلی در پایگاه داده حفظ شده است.'}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* SNMPv3 Comprehensive Controls */}
          {snmpVersion === 'v3' && (
            <div
              className={`p-3.5 rounded-lg border space-y-3 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950/60 border-slate-800'
              }`}
            >
              {/* Security Level Selector */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-bold ${isLightMode ? 'text-slate-800' : 'text-slate-200'}`}>
                    {isEn ? 'SNMPv3 Security Level:' : 'سطح امنیت SNMPv3:'}
                  </span>
                  <FieldInfoTooltip
                    title={isEn ? 'SNMPv3 Security Level' : 'سطح امنیتی پروتکل SNMPv3'}
                    whatIsIt={
                      isEn
                        ? 'USM Security Level determines whether Authentication and Privacy Encryption are applied.'
                        : 'مشخص‌کننده نوع حفاظت بسته‌های اطلاعاتی بر اساس مدل امنیتی USM.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Cisco IOS/IOS-XE supports noAuthNoPriv, authNoPriv, and full authPriv for compliance.'
                        : 'سوییچ‌های سیسکو برای الزامات ممیزی نیازمند احراز هویت قوی و رمزنگاری داده‌ها هستند.'
                    }
                    practicalExample="authPriv (Authentication + Encryption)"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSnmpV3SecurityLevel('authPriv')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition cursor-pointer flex flex-col items-center justify-center text-center gap-0.5 ${
                      snmpV3SecurityLevel === 'authPriv'
                        ? 'bg-cyan-600 text-white border-cyan-500 shadow-xs'
                        : isLightMode
                        ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-850'
                    }`}
                  >
                    <span>authPriv</span>
                    <span className="text-[10px] opacity-85">({isEn ? 'Auth + Encrypted' : 'رمزنگاری کامل'})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSnmpV3SecurityLevel('authNoPriv')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition cursor-pointer flex flex-col items-center justify-center text-center gap-0.5 ${
                      snmpV3SecurityLevel === 'authNoPriv'
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                        : isLightMode
                        ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-850'
                    }`}
                  >
                    <span>authNoPriv</span>
                    <span className="text-[10px] opacity-85">({isEn ? 'Auth Only' : 'احراز هویت تنها'})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSnmpV3SecurityLevel('noAuthNoPriv')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition cursor-pointer flex flex-col items-center justify-center text-center gap-0.5 ${
                      snmpV3SecurityLevel === 'noAuthNoPriv'
                        ? 'bg-slate-700 text-white border-slate-600 shadow-xs'
                        : isLightMode
                        ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-850'
                    }`}
                  >
                    <span>noAuthNoPriv</span>
                    <span className="text-[10px] opacity-85">({isEn ? 'Username Only' : 'فقط نام کاربری'})</span>
                  </button>
                </div>
              </div>

              {/* Username & Context Name Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[11px] font-semibold ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                      {isEn ? 'SNMPv3 Username:' : 'نام کاربری SNMPv3:'}
                    </span>
                    <FieldInfoTooltip
                      title={isEn ? 'SNMPv3 Security Username' : 'نام کاربری امنیتی SNMPv3'}
                      whatIsIt={isEn ? 'USM user configured on target device.' : 'کاربر USM تعریف‌شده در پیکربندی تجهیز سیسکو.'}
                      whyNeeded={isEn ? 'Queries are authenticated against this identity.' : 'درخواست‌ها با هویت این کاربر احراز می‌شوند.'}
                      practicalExample="snmpuser or monitor_admin"
                      isLightMode={isLightMode}
                      isEn={isEn}
                    />
                  </div>
                  <input
                    type="text"
                    value={snmpV3User}
                    onChange={(e) => setSnmpV3User(e.target.value)}
                    placeholder="snmpadmin"
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono transition ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-cyan-600'
                        : 'bg-slate-900 border-slate-700 text-white focus:bg-slate-950 focus:border-cyan-500'
                    }`}
                    dir="ltr"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[11px] font-semibold ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                      {isEn ? 'Context Name (Optional):' : 'نام Context (اختیاری):'}
                    </span>
                    <FieldInfoTooltip
                      title={isEn ? 'SNMPv3 Context' : 'کانتکست SNMPv3'}
                      whatIsIt={isEn ? 'Context name for VRF or VLAN-aware polling.' : 'نام کانتکست جهت خواندن جدول‌های VRF یا VLAN خاص در سیسکو.'}
                      whyNeeded={isEn ? 'Used when querying specific VRFs or Cisco VTP contexts.' : 'جهت واکشی داده‌های VRFهای اختصاصی به کار می‌رود.'}
                      practicalExample="vlan-10 or vrf-management"
                      isLightMode={isLightMode}
                      isEn={isEn}
                    />
                  </div>
                  <input
                    type="text"
                    value={snmpV3Context}
                    onChange={(e) => setSnmpV3Context(e.target.value)}
                    placeholder={isEn ? 'e.g. vlan-1 (optional)' : 'مثلاً vlan-1 (اختیاری)'}
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono transition ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-cyan-600'
                        : 'bg-slate-900 border-slate-700 text-white focus:bg-slate-950 focus:border-cyan-500'
                    }`}
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Authentication Credentials (if authNoPriv or authPriv) */}
              {(snmpV3SecurityLevel === 'authNoPriv' || snmpV3SecurityLevel === 'authPriv') && (
                <div
                  className={`p-2.5 rounded-lg border space-y-2 ${
                    isLightMode ? 'bg-slate-50/80 border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold ${isLightMode ? 'text-slate-800' : 'text-slate-200'}`}>
                      {isEn ? 'Authentication Protocol & Password:' : 'الگوریتم و گذرواژه احراز هویت (Auth):'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                    <div className="md:col-span-4">
                      <select
                        value={snmpV3AuthProtocol}
                        onChange={(e) => setSnmpV3AuthProtocol(e.target.value as SnmpV3AuthProtocol)}
                        className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-semibold font-mono transition cursor-pointer ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-900 focus:border-cyan-600'
                            : 'bg-slate-950 border-slate-700 text-white focus:border-cyan-500'
                        }`}
                      >
                        {authProtocols.map((proto) => (
                          <option key={proto} value={proto}>
                            {proto} {proto === 'SHA-256' ? (isEn ? '(Recommended)' : '(پیش‌فرض)') : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-8">
                      {snmpV3AuthVaultItemId ? (
                        <VaultLinkedPasswordBadge
                          vaultItemId={snmpV3AuthVaultItemId}
                          vaultItemName={snmpV3AuthVaultItemName}
                          onUnlink={() => {
                            setSnmpV3AuthVaultItemId(undefined);
                            setSnmpV3AuthVaultItemName('');
                          }}
                          isLightMode={isLightMode}
                          isEn={isEn}
                          compact={true}
                          subtitle={isEn ? 'Auth password from Vault' : 'گذرواژه Auth متصل به ولت'}
                        />
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <div className="relative flex-1">
                            <input
                              type={showAuthPassword ? 'text' : 'password'}
                              value={snmpV3AuthPassword}
                              onChange={(e) => setSnmpV3AuthPassword(e.target.value)}
                              placeholder={snmpV3AuthPasswordSet ? (isEn ? '•••••• (Saved in DB)' : '•••••• (ذخیره‌شده)') : (isEn ? 'Auth password (min 8 chars)' : 'رمز احراز هویت')}
                              className={`w-full px-2.5 py-1.5 pr-8 rounded-lg border text-xs font-mono transition ${
                                isLightMode
                                  ? 'bg-white border-slate-300 text-slate-900 focus:border-cyan-600'
                                  : 'bg-slate-950 border-slate-700 text-white focus:border-cyan-500'
                              }`}
                              dir="ltr"
                            />
                            <button
                              type="button"
                              onClick={() => setShowAuthPassword(!showAuthPassword)}
                              className={`absolute right-2 top-1/2 -translate-y-1/2 transition ${
                                isLightMode ? 'text-slate-400 hover:text-slate-700' : 'text-slate-500 hover:text-slate-300'
                              }`}
                            >
                              {showAuthPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOpenVaultPicker('v3auth')}
                            className={`p-1.5 rounded-lg border text-xs font-medium transition cursor-pointer shrink-0 ${
                              isLightMode
                                ? 'bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border-cyan-300'
                                : 'bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 border-cyan-700/60'
                            }`}
                            title={isEn ? 'Link Auth Password from Vault' : 'پیوند رمز Auth از ولت'}
                          >
                            <Lock className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Privacy Encryption Credentials (if authPriv) */}
              {snmpV3SecurityLevel === 'authPriv' && (
                <div
                  className={`p-2.5 rounded-lg border space-y-2 ${
                    isLightMode ? 'bg-slate-50/80 border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold ${isLightMode ? 'text-slate-800' : 'text-slate-200'}`}>
                      {isEn ? 'Privacy Encryption Protocol & Key (Priv):' : 'الگوریتم و کلید رمزنگاری محتوا (Priv):'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                    <div className="md:col-span-4">
                      <select
                        value={snmpV3PrivProtocol}
                        onChange={(e) => setSnmpV3PrivProtocol(e.target.value as SnmpV3PrivProtocol)}
                        className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-semibold font-mono transition cursor-pointer ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-900 focus:border-cyan-600'
                            : 'bg-slate-950 border-slate-700 text-white focus:border-cyan-500'
                        }`}
                      >
                        {privProtocols.map((proto) => (
                          <option key={proto} value={proto}>
                            {proto} {proto === 'AES-128' ? (isEn ? '(Recommended)' : '(پیش‌فرض)') : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-8">
                      {snmpV3PrivVaultItemId ? (
                        <VaultLinkedPasswordBadge
                          vaultItemId={snmpV3PrivVaultItemId}
                          vaultItemName={snmpV3PrivVaultItemName}
                          onUnlink={() => {
                            setSnmpV3PrivVaultItemId(undefined);
                            setSnmpV3PrivVaultItemName('');
                          }}
                          isLightMode={isLightMode}
                          isEn={isEn}
                          compact={true}
                          subtitle={isEn ? 'Privacy key from Vault' : 'کلید Priv متصل به ولت'}
                        />
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <div className="relative flex-1">
                            <input
                              type={showPrivPassword ? 'text' : 'password'}
                              value={snmpV3PrivPassword}
                              onChange={(e) => setSnmpV3PrivPassword(e.target.value)}
                              placeholder={snmpV3PrivPasswordSet ? (isEn ? '•••••• (Saved in DB)' : '•••••• (ذخیره‌شده)') : (isEn ? 'Privacy key (min 8 chars)' : 'کلید رمزنگاری محتوا')}
                              className={`w-full px-2.5 py-1.5 pr-8 rounded-lg border text-xs font-mono transition ${
                                isLightMode
                                  ? 'bg-white border-slate-300 text-slate-900 focus:border-cyan-600'
                                  : 'bg-slate-950 border-slate-700 text-white focus:border-cyan-500'
                              }`}
                              dir="ltr"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPrivPassword(!showPrivPassword)}
                              className={`absolute right-2 top-1/2 -translate-y-1/2 transition ${
                                isLightMode ? 'text-slate-400 hover:text-slate-700' : 'text-slate-500 hover:text-slate-300'
                              }`}
                            >
                              {showPrivPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOpenVaultPicker('v3priv')}
                            className={`p-1.5 rounded-lg border text-xs font-medium transition cursor-pointer shrink-0 ${
                              isLightMode
                                ? 'bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border-cyan-300'
                                : 'bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 border-cyan-700/60'
                            }`}
                            title={isEn ? 'Link Privacy Key from Vault' : 'پیوند کلید Priv از ولت'}
                          >
                            <Lock className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Test SNMP Reachability Action & Real-Time Feedback */}
          <div className="pt-1 flex flex-col gap-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <button
                type="button"
                onClick={handleTestSnmp}
                disabled={isTesting}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer ${
                  isTesting
                    ? 'opacity-70 cursor-not-allowed bg-slate-400 text-white'
                    : isLightMode
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                <Zap className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                <span>
                  {isTesting
                    ? (isEn ? 'Querying SNMP MIB-2...' : 'در حال سنجش ارتباط SNMP...')
                    : (isEn ? 'Test SNMP Reachability' : 'تست ارتباط SNMP')}
                </span>
              </button>

              <span className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'Queries sysDescr & sysUpTime via live UDP packet'
                  : 'ارسال بسته استاندارد و دریافت بلادرنگ sysDescr و sysUpTime'}
              </span>
            </div>

            {/* Authentic Live Test Result Display */}
            {testResult && (
              <div
                className={`p-2.5 rounded-lg border text-xs space-y-1.5 animate-fadeIn ${
                  testResult.success
                    ? isLightMode
                      ? 'bg-emerald-50/90 border-emerald-300 text-emerald-900'
                      : 'bg-emerald-950/40 border-emerald-600/50 text-emerald-200'
                    : isLightMode
                    ? 'bg-rose-50/90 border-rose-300 text-rose-900'
                    : 'bg-rose-950/40 border-rose-700/50 text-rose-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold">
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-500" />
                    )}
                    <span>
                      {testResult.success
                        ? (isEn ? 'SNMP Service Responded Successfully' : 'پاسخ موفقیت‌آمیز از سرویس SNMP تجهیز')
                        : (isEn ? 'SNMP Connection Failed' : 'عدم برقراری ارتباط با SNMP')}
                    </span>
                  </div>
                  {testResult.latency_ms !== undefined && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {testResult.latency_ms} ms
                    </span>
                  )}
                </div>

                {testResult.success ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] pt-1 border-t border-emerald-200 dark:border-emerald-800/60 font-mono">
                    {testResult.sysName && (
                      <div>
                        <span className="opacity-70">{isEn ? 'sysName: ' : 'نام سیستم: '}</span>
                        <span className="font-semibold">{testResult.sysName}</span>
                      </div>
                    )}
                    {testResult.sysUpTime && (
                      <div>
                        <span className="opacity-70">{isEn ? 'sysUpTime: ' : 'مدت زمان کارکرد: '}</span>
                        <span className="font-semibold">{testResult.sysUpTime}</span>
                      </div>
                    )}
                    {testResult.sysDescr && (
                      <div className="sm:col-span-2 truncate" title={testResult.sysDescr}>
                        <span className="opacity-70">{isEn ? 'sysDescr: ' : 'شرح سیستم: '}</span>
                        <span>{testResult.sysDescr}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-[11px] font-sans">
                    <p>{isEn ? testResult.error : (testResult.errorFa || testResult.error)}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Password Vault Selection Modal */}
      <VaultPasswordPickerModal
        isOpen={isVaultPickerOpen}
        onClose={() => setIsVaultPickerOpen(false)}
        targetHost={targetHost}
        isLightMode={isLightMode}
        isEn={isEn}
        onSelectPassword={(password) => {
          if (vaultPickerTarget === 'community') {
            setSnmpCommunity(password);
          } else if (vaultPickerTarget === 'v3auth') {
            setSnmpV3AuthPassword(password);
          } else if (vaultPickerTarget === 'v3priv') {
            setSnmpV3PrivPassword(password);
          }
        }}
        onSelectSecret={(secret) => {
          if (vaultPickerTarget === 'community') {
            setSnmpCommunityVaultItemId(secret.id || undefined);
            setSnmpCommunityVaultItemName(secret.name || '');
            if (secret.password) setSnmpCommunity(secret.password);
          } else if (vaultPickerTarget === 'v3auth') {
            setSnmpV3AuthVaultItemId(secret.id || undefined);
            setSnmpV3AuthVaultItemName(secret.name || '');
            if (secret.password) setSnmpV3AuthPassword(secret.password);
          } else if (vaultPickerTarget === 'v3priv') {
            setSnmpV3PrivVaultItemId(secret.id || undefined);
            setSnmpV3PrivVaultItemName(secret.name || '');
            if (secret.password) setSnmpV3PrivPassword(secret.password);
          }
        }}
      />
    </div>
  );
};
