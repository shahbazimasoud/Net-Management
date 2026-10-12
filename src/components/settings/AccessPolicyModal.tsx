import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  ShieldCheck,
  Compass,
  Terminal,
  Router as RouterIcon,
  Server,
  FileCode2,
  Sliders,
  Save,
  CheckCircle2,
  AlertCircle,
  Info,
  Layers,
  Lock,
  Eye,
  Settings,
  Users,
  Cpu,
  Flame,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import {
  AccessPolicy,
  LocalUser,
  LocalGroup,
  ActiveDirectoryConfig,
  Device,
  DeviceGroup,
  RemoteServer,
  ServerGroup,
} from '../../types';
import { useLanguage } from '../../i18n';
import { useModalDock } from '../../context/ModalDockContext';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export type PolicyModalTab =
  | 'identity'
  | 'navigation'
  | 'cisco'
  | 'mikrotik'
  | 'servers'
  | 'global'
  | 'matrix';

export interface AccessPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  isCreating: boolean;
  editingPolicy: AccessPolicy | null;
  onSavePolicy: (policy: AccessPolicy) => Promise<void> | void;
  isLightMode?: boolean;
  liveLocalUsers?: LocalUser[];
  liveLocalGroups?: LocalGroup[];
  liveAdConfig?: ActiveDirectoryConfig;
  devices?: Device[];
  liveDeviceGroups?: DeviceGroup[];
  liveServers?: RemoteServer[];
  liveServerGroups?: ServerGroup[];
}

export const AccessPolicyModal: React.FC<AccessPolicyModalProps> = ({
  isOpen,
  onClose,
  onMinimize,
  isCreating,
  editingPolicy: initialPolicy,
  onSavePolicy,
  isLightMode: propIsLightMode,
  liveLocalUsers = [],
  liveLocalGroups = [],
  liveAdConfig,
  devices = [],
  liveDeviceGroups = [],
  liveServers = [],
  liveServerGroups = [],
}) => {
  const { isRtl, isEn } = useLanguage();
  const { dockModal } = useModalDock();

  const isLightMode =
    propIsLightMode ??
    (typeof document !== 'undefined' &&
      (document.querySelector('.theme-light') !== null ||
        document.documentElement.classList.contains('light') ||
        localStorage.getItem('panel_theme') === 'light' ||
        localStorage.getItem('theme_mode') === 'light'));

  const [activeTab, setActiveTab] = useState<PolicyModalTab>('identity');
  const [isMaximized, setIsMaximized] = useState(false);
  const [draftPolicy, setDraftPolicy] = useState<AccessPolicy | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync draft policy whenever initialPolicy changes or modal opens
  useEffect(() => {
    if (isOpen && initialPolicy) {
      setDraftPolicy({ ...initialPolicy });
      setErrorMessage(null);
      setIsMaximized(false);
      setActiveTab('identity');
    }
  }, [isOpen, initialPolicy]);

  if (!isOpen || !draftPolicy) return null;

  const handleMinimize = () => {
    if (onMinimize) {
      onMinimize();
      return;
    }
    dockModal({
      id: `access-policy-${draftPolicy.id || 'new'}`,
      labelEn: isCreating ? 'New Access Policy' : `Policy: ${draftPolicy.name || 'Edit'}`,
      labelFa: isCreating ? 'تعریف پالیسی دسترسی' : `پالیسی: ${draftPolicy.name || 'ویرایش'}`,
      badge: 'RBAC',
      category: 'config',
      onRestore: () => {
        // Will be re-opened by parent controller
      },
      onClose: () => {
        onClose();
      },
    });
    onClose();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftPolicy.name.trim()) {
      setErrorMessage(
        isEn
          ? 'Policy name is required. Please specify a descriptive name.'
          : 'عنوان پالیسی الزامی است. لطفاً یک نام مشخص وارد فرمایید.'
      );
      setActiveTab('identity');
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage(null);
      await onSavePolicy(draftPolicy);
      onClose();
    } catch (err: any) {
      setErrorMessage(
        err.message ||
          (isEn
            ? 'Failed to save access policy to database.'
            : 'خطا در ذخیره‌سازی پالیسی سطح دسترسی در پایگاه داده.')
      );
    } finally {
      setIsSaving(false);
    }
  };

  const tabsConfig: Array<{
    id: PolicyModalTab;
    labelEn: string;
    labelFa: string;
    icon: React.ComponentType<{ className?: string }>;
    badgeCount?: number;
    color: string;
  }> = [
    {
      id: 'identity',
      labelEn: 'Identity & Scope',
      labelFa: 'هویت و دامنه',
      icon: ShieldCheck,
      color: 'text-indigo-400',
    },
    {
      id: 'navigation',
      labelEn: 'Navigation & Views',
      labelFa: 'صفحات و ابزارها',
      icon: Compass,
      color: 'text-cyan-400',
    },
    {
      id: 'cisco',
      labelEn: 'Cisco IOS Equipment',
      labelFa: 'تجهیزات سیسکو',
      icon: Terminal,
      color: 'text-sky-400',
    },
    {
      id: 'mikrotik',
      labelEn: 'MikroTik RouterOS',
      labelFa: 'تجهیزات میکروتیک',
      icon: RouterIcon,
      color: 'text-emerald-400',
    },
    {
      id: 'servers',
      labelEn: 'Linux & Servers',
      labelFa: 'ناوگان سرورها',
      icon: Server,
      color: 'text-amber-400',
    },
    {
      id: 'global',
      labelEn: 'Global & Templates',
      labelFa: 'عملیات و الگوها',
      icon: FileCode2,
      color: 'text-purple-400',
    },
    {
      id: 'matrix',
      labelEn: 'Granular Matrix',
      labelFa: 'ماتریس تفکیکی',
      icon: Sliders,
      color: 'text-rose-400',
    },
  ];

  return createPortal(
    <div
      className="fixed top-0 left-0 right-0 bottom-8 z-[9999] flex items-center justify-center p-2 sm:p-4 modal-backdrop-blur animate-fadeIn overflow-y-auto"
      data-modal-backdrop="true"
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`flex flex-col border shadow-2xl overflow-hidden transition-all duration-200 backdrop-blur-2xl ${
          isLightMode
            ? 'bg-slate-50/95 border-slate-300 text-slate-800'
            : 'bg-slate-900/95 border-indigo-500/40 text-slate-100 shadow-[0_0_60px_rgba(99,102,241,0.25)]'
        } ${
          isMaximized
            ? 'w-full h-full max-w-none max-h-none rounded-none'
            : 'w-full max-w-6xl max-h-[92vh] sm:max-h-[88vh] my-auto rounded-2xl'
        }`}
      >
        {/* Header - Pinned with 3 Control Buttons (Minus, Maximize, Close) */}
        <div
          className={`flex items-center justify-between p-4 sm:p-5 border-b shrink-0 ${
            isLightMode
              ? 'bg-white border-slate-200'
              : 'bg-slate-950/80 border-white/10'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border ${
                isLightMode
                  ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
                  : 'bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-300 border-indigo-500/40 shadow-[0_0_15px_rgba(99,102,241,0.3)]'
              }`}
            >
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3
                  className={`font-bold text-sm sm:text-base ${
                    isLightMode ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  {isCreating
                    ? isEn
                      ? 'Create Access Policy'
                      : 'تعریف پالیسی سطح دسترسی جدید'
                    : isEn
                    ? 'Edit Access Policy'
                    : 'ویرایش پالیسی سطح دسترسی'}
                </h3>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-md border font-semibold ${
                    isLightMode
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                  }`}
                >
                  PostgreSQL RBAC
                </span>
                {draftPolicy.id === 'policy-super-admin' && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border ${
                      isLightMode
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : 'bg-amber-950/60 text-amber-300 border-amber-800/60'
                    }`}
                  >
                    {isEn ? 'Super Admin' : 'مدیر ارشد'}
                  </span>
                )}
              </div>
              <p
                className={`text-xs mt-0.5 ${
                  isLightMode ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                {isEn
                  ? 'Granular Multi-Vendor Access Governance across Cisco, MikroTik RouterOS, and Linux fleet.'
                  : 'مدیریت و کنترل یکپارچه اختیارات و محدودیت‌های عملیاتی برای تجهیزات سیسکو، میکروتیک و ناوگان سرورها'}
              </p>
            </div>
          </div>

          {/* Header Triple Control Buttons */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleMinimize}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                isLightMode
                  ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
              title={isEn ? 'Minimize to Tools Dock' : 'کوچک‌سازی به داک ابزارها'}
              aria-label="Minimize"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                isLightMode
                  ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
              title={
                isMaximized
                  ? isEn
                    ? 'Restore Window Size'
                    : 'بازیابی اندازه پنجره'
                  : isEn
                  ? 'Maximize Window'
                  : 'تمام‌صفحه کردن پنجره'
              }
              aria-label="Maximize"
            >
              {isMaximized ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                isLightMode
                  ? 'text-slate-500 hover:text-rose-600 hover:bg-rose-50'
                  : 'text-slate-400 hover:text-rose-400 hover:bg-rose-500/10'
              }`}
              title={isEn ? 'Close' : 'بستن'}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation Bar */}
        <div
          className={`px-3 py-2 border-b flex items-center gap-1.5 overflow-x-auto shrink-0 select-none ${
            isLightMode
              ? 'bg-slate-100/80 border-slate-200'
              : 'bg-slate-950/50 border-white/5'
          }`}
        >
          {tabsConfig.map((tab) => {
            const IconComponent = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  isActive
                    ? isLightMode
                      ? 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                      : 'bg-indigo-600/30 text-white border border-indigo-500/50 shadow-[0_0_12px_rgba(99,102,241,0.3)]'
                    : isLightMode
                    ? 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <IconComponent
                  className={`w-3.5 h-3.5 ${
                    isActive ? tab.color : 'text-slate-400'
                  }`}
                />
                <span>{isEn ? tab.labelEn : tab.labelFa}</span>
              </button>
            );
          })}
        </div>

        {/* Error Notice */}
        {errorMessage && (
          <div
            className={`mx-5 mt-4 p-3 rounded-xl border flex items-center gap-2 text-xs shrink-0 ${
              isLightMode
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-rose-500/20 border-rose-500/40 text-rose-200'
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Body Content (Tab Panels Container) */}
        <form onSubmit={handleSave} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            {/* TAB 1: Identity & Target Scope */}
            {activeTab === 'identity' && (
              <div className="space-y-4 animate-fadeIn">
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode
                      ? 'bg-white border-slate-200 shadow-xs'
                      : 'bg-slate-950/60 border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldCheck className="w-4 h-4 text-indigo-400" />
                    <h4
                      className={`text-xs font-bold ${
                        isLightMode ? 'text-slate-900' : 'text-white'
                      }`}
                    >
                      {isEn
                        ? 'Policy Identity & Priority'
                        : 'مشخصات عنوان، توضیحات و اولویت پالیسی'}
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <label
                        className={`block text-xs font-semibold mb-1 ${
                          isLightMode ? 'text-slate-700' : 'text-slate-300'
                        }`}
                      >
                        {isEn ? 'Policy Name' : 'عنوان پالیسی دسترسی'}{' '}
                        <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={draftPolicy.name}
                        onChange={(e) =>
                          setDraftPolicy({ ...draftPolicy, name: e.target.value })
                        }
                        placeholder={
                          isEn
                            ? 'e.g. Helpdesk Operations Policy'
                            : 'مثال: پالیسی تیم پشتیبانی و هلپ‌دسک'
                        }
                        className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none transition ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-900 focus:border-indigo-600'
                            : 'bg-slate-900 border-white/15 text-white focus:border-indigo-500'
                        }`}
                      />
                    </div>
                    <div>
                      <label
                        className={`block text-xs font-semibold mb-1 ${
                          isLightMode ? 'text-slate-700' : 'text-slate-300'
                        }`}
                      >
                        {isEn ? 'Priority (1-100)' : 'ضریب اولویت (۱ تا ۱۰۰)'}
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={draftPolicy.priority || 50}
                        onChange={(e) =>
                          setDraftPolicy({
                            ...draftPolicy,
                            priority: Math.max(1, Math.min(100, Number(e.target.value))),
                          })
                        }
                        className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none transition ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-900 focus:border-indigo-600'
                            : 'bg-slate-900 border-white/15 text-white focus:border-indigo-500'
                        }`}
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label
                        className={`block text-xs font-semibold mb-1 ${
                          isLightMode ? 'text-slate-700' : 'text-slate-300'
                        }`}
                      >
                        {isEn ? 'Description' : 'توضیحات و اهداف امنیتی'}
                      </label>
                      <input
                        type="text"
                        value={draftPolicy.description || ''}
                        onChange={(e) =>
                          setDraftPolicy({ ...draftPolicy, description: e.target.value })
                        }
                        placeholder={
                          isEn
                            ? 'Brief operational memo or organizational purpose'
                            : 'توضیح کوتاه در مورد اختیارات و وظایف این پالیسی'
                        }
                        className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none transition ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-900 focus:border-indigo-600'
                            : 'bg-slate-900 border-white/15 text-white focus:border-indigo-500'
                        }`}
                      />
                    </div>
                  </div>
                </div>

                {/* Subject Assignment & Target Scope */}
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode
                      ? 'bg-white border-slate-200 shadow-xs'
                      : 'bg-slate-950/60 border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="w-4 h-4 text-cyan-400" />
                    <h4
                      className={`text-xs font-bold ${
                        isLightMode ? 'text-slate-900' : 'text-white'
                      }`}
                    >
                      {isEn
                        ? 'Subject Identity & Authorization Target'
                        : 'انتساب هویت کاربر/گروه و محدوده تجهیزات تحت کنترل'}
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label
                        className={`block text-xs font-semibold mb-1 ${
                          isLightMode ? 'text-slate-700' : 'text-slate-300'
                        }`}
                      >
                        {isEn ? 'Subject Type' : 'نوع هویت انتسابی'}
                      </label>
                      <select
                        value={draftPolicy.subjectType}
                        onChange={(e) =>
                          setDraftPolicy({
                            ...draftPolicy,
                            subjectType: e.target.value as any,
                          })
                        }
                        className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none transition ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-900 focus:border-indigo-600'
                            : 'bg-slate-900 border-white/15 text-white focus:border-indigo-500'
                        }`}
                      >
                        <option value="ad_user">
                          {isEn
                            ? 'Active Directory User (LDAP)'
                            : 'کاربر اکتیو دایرکتوری (LDAP User)'}
                        </option>
                        <option value="ad_group">
                          {isEn
                            ? 'Active Directory Security Group'
                            : 'گروه امنیتی اکتیو دایرکتوری (AD Group)'}
                        </option>
                        <option value="local_user">
                          {isEn
                            ? 'Local Database User'
                            : 'کاربر محلی دیتابیس (Local User)'}
                        </option>
                        <option value="local_group">
                          {isEn
                            ? 'Local Role / User Group'
                            : 'گروه کاربری محلی (Local Group)'}
                        </option>
                      </select>
                    </div>

                    <div>
                      <label
                        className={`block text-xs font-semibold mb-1 ${
                          isLightMode ? 'text-slate-700' : 'text-slate-300'
                        }`}
                      >
                        {isEn ? 'Target Equipment Scope' : 'محدوده تجهیزات هدف'}
                      </label>
                      <select
                        value={draftPolicy.targetScope}
                        onChange={(e) =>
                          setDraftPolicy({
                            ...draftPolicy,
                            targetScope: e.target.value as any,
                          })
                        }
                        className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none transition ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-900 focus:border-indigo-600'
                            : 'bg-slate-900 border-white/15 text-white focus:border-indigo-500'
                        }`}
                      >
                        <option value="all">
                          {isEn
                            ? 'All Network Devices & Remote Servers'
                            : 'تمامی تجهیزات شبکه و تمامی سرورهای ریموت'}
                        </option>
                        <option value="groups">
                          {isEn
                            ? 'Specific Device & Server Groups'
                            : 'گروه‌های مشخص‌شده از تجهیزات و سرورها'}
                        </option>
                        <option value="specific">
                          {isEn
                            ? 'Explicit Single Devices / Servers'
                            : 'دستگاه‌ها و سرورهای انتخاب‌شده به صورت مجزا'}
                        </option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: Navigation & Views */}
            {activeTab === 'navigation' && (
              <div className="space-y-4 animate-fadeIn">
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode
                      ? 'bg-white border-slate-200 shadow-xs'
                      : 'bg-slate-950/60 border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Compass className="w-4 h-4 text-cyan-400" />
                    <h4
                      className={`text-xs font-bold ${
                        isLightMode ? 'text-slate-900' : 'text-white'
                      }`}
                    >
                      {isEn
                        ? 'Navigation Menus & Panel Views Access'
                        : 'سطح دسترسی به منوهای اصلی و صفحات پنل'}
                    </h4>
                  </div>
                  <p
                    className={`text-[11px] mb-4 ${
                      isLightMode ? 'text-slate-500' : 'text-slate-400'
                    }`}
                  >
                    {isEn
                      ? 'Users assigned to this policy will only be able to view and interact with checked tabs in the navigation bar.'
                      : 'کاربران تحت این پالیسی فقط قادر به مشاهده و ورود به تب‌هایی خواهند بود که در این بخش تیک خورده باشند.'}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      {
                        key: 'canViewDashboard',
                        labelEn: 'Dashboard & Metrics',
                        labelFa: 'داشبورد و وضعیت لحظه‌ای',
                        descEn: 'Executive summary & real-time telemetry',
                        descFa: 'خلاصه آمار و وضعیت تلمتری شبکه',
                      },
                      {
                        key: 'canViewTopology',
                        labelEn: 'Interactive Topology Map',
                        labelFa: 'نقشه توپولوژی تعاملی',
                        descEn: 'Schematic diagrams and live cable links',
                        descFa: 'دیاگرام‌های شماتیک و وضعیت خطوط ارتباطی',
                      },
                      {
                        key: 'canViewDevices',
                        labelEn: 'Equipment Inventory',
                        labelFa: 'تجهیزات و سوییچ‌ها',
                        descEn: 'Network switch and router lists',
                        descFa: 'لیست و وضعیت سوییچ‌ها و روترهای شبکه',
                      },
                      {
                        key: 'canViewPorts',
                        labelEn: 'Port Management View',
                        labelFa: 'مدیریت و مانیتورینگ پورت‌ها',
                        descEn: 'Multi-device port inspection & status',
                        descFa: 'مشاهده و تحلیل وضعیت پورت‌ها در سطح شبکه',
                      },
                      {
                        key: 'canViewDiscovery',
                        labelEn: 'CDP & LLDP Discovery',
                        labelFa: 'اسکن همسایگی CDP/LLDP',
                        descEn: 'Hardware neighbor discovery scanner',
                        descFa: 'پویش سخت‌افزاری پروتکل‌های کشف همسایه',
                      },
                      {
                        key: 'canViewTemplates',
                        labelEn: 'Config Templates & Patterns',
                        labelFa: 'الگوها و اسکریپت‌های کانفیگ',
                        descEn: 'Multi-vendor configuration templates',
                        descFa: 'بانک تمپلیت‌های آماده و کدهای پیکربندی',
                      },
                      {
                        key: 'canViewServers',
                        labelEn: 'Remote Servers Fleet',
                        labelFa: 'ناوگان سرورهای ریموت',
                        descEn: 'Linux and Windows servers management',
                        descFa: 'مدیریت سرورهای لینوکسی و ویندوزی',
                      },
                      {
                        key: 'canViewNetworkTools',
                        labelEn: 'Network Tools Suite',
                        labelFa: 'جعبه‌ابزار مهندسی شبکه',
                        descEn: 'IP subnet, Port scanner, Traceroute, Vault',
                        descFa: 'ابزارهای ساب‌نت، اسکنر پورت، تریس و والت',
                      },
                      {
                        key: 'canViewPhysicalPlacement',
                        labelEn: 'Physical Placement (Racks)',
                        labelFa: 'جانمایی فیزیکی و رک‌ها',
                        descEn: 'Buildings, floors, rooms, and racks layout',
                        descFa: 'چیدمان فیزیکی در ساختمان، طبقات و رک‌ها',
                      },
                    ].map((item) => {
                      const isChecked = (draftPolicy as any)[item.key] !== false;
                      return (
                        <label
                          key={item.key}
                          className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition select-none ${
                            isChecked
                              ? isLightMode
                                ? 'bg-cyan-50/80 border-cyan-300 text-cyan-900'
                                : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
                              : isLightMode
                              ? 'bg-slate-100 border-slate-200 text-slate-500'
                              : 'bg-slate-900/60 border-white/10 text-slate-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) =>
                              setDraftPolicy({
                                ...draftPolicy,
                                [item.key]: e.target.checked,
                              })
                            }
                            className="w-4 h-4 mt-0.5 accent-cyan-500 rounded"
                          />
                          <div>
                            <div
                              className={`font-bold text-xs ${
                                isLightMode ? 'text-slate-900' : 'text-white'
                              }`}
                            >
                              {isEn ? item.labelEn : item.labelFa}
                            </div>
                            <div
                              className={`text-[10px] mt-0.5 ${
                                isLightMode ? 'text-slate-600' : 'text-slate-400'
                              }`}
                            >
                              {isEn ? item.descEn : item.descFa}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: Cisco IOS Equipment */}
            {activeTab === 'cisco' && (
              <div className="space-y-4 animate-fadeIn">
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode
                      ? 'bg-white border-slate-200 shadow-xs'
                      : 'bg-slate-950/60 border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Terminal className="w-4 h-4 text-sky-400" />
                    <h4
                      className={`text-xs font-bold ${
                        isLightMode ? 'text-slate-900' : 'text-white'
                      }`}
                    >
                      {isEn
                        ? 'Cisco IOS Terminal & Command Execution'
                        : 'سطح دسترسی خط فرمان (CLI Terminal) و کنسول سیسکو'}
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[
                      {
                        value: 'none',
                        labelEn: 'No Terminal Access',
                        labelFa: 'مسدود (بدون دسترسی به ترمینال)',
                        descEn: 'Terminal tab and buttons will be hidden',
                        descFa: 'دسترسی به کنسول و صدور دستورات کاملاً بسته است',
                      },
                      {
                        value: 'view_only',
                        labelEn: 'View-Only (Non-Privileged)',
                        labelFa: 'فقط مشاهده (دستورات مانیتورینگ)',
                        descEn: 'Inspect show commands without write access',
                        descFa: 'مشاهده دستورات نمایشی بدون امکان اعمال تغییرات',
                      },
                      {
                        value: 'full',
                        labelEn: 'Full Interactive Terminal',
                        labelFa: 'ترمینال کامل و تعاملی (Enable/Config)',
                        descEn: 'Full privileged CLI console session',
                        descFa: 'دسترسی نامحدود به شل و اجرای کامل کانفیگ',
                      },
                    ].map((mode) => {
                      const isSelected = draftPolicy.terminalAccess === mode.value;
                      return (
                        <label
                          key={mode.value}
                          className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition select-none ${
                            isSelected
                              ? isLightMode
                                ? 'bg-sky-50 border-sky-300 text-sky-900'
                                : 'bg-sky-500/20 border-sky-500/40 text-sky-200'
                              : isLightMode
                              ? 'bg-slate-100 border-slate-200 text-slate-500'
                              : 'bg-slate-900/60 border-white/10 text-slate-400'
                          }`}
                        >
                          <input
                            type="radio"
                            name="cisco_terminal"
                            value={mode.value}
                            checked={isSelected}
                            onChange={() =>
                              setDraftPolicy({
                                ...draftPolicy,
                                terminalAccess: mode.value as any,
                              })
                            }
                            className="w-4 h-4 mt-0.5 accent-sky-500"
                          />
                          <div>
                            <div
                              className={`font-bold text-xs ${
                                isLightMode ? 'text-slate-900' : 'text-white'
                              }`}
                            >
                              {isEn ? mode.labelEn : mode.labelFa}
                            </div>
                            <div
                              className={`text-[10px] mt-0.5 ${
                                isLightMode ? 'text-slate-600' : 'text-slate-400'
                              }`}
                            >
                              {isEn ? mode.descEn : mode.descFa}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Cisco Port & Operations */}
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode
                      ? 'bg-white border-slate-200 shadow-xs'
                      : 'bg-slate-950/60 border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Layers className="w-4 h-4 text-sky-400" />
                    <h4
                      className={`text-xs font-bold ${
                        isLightMode ? 'text-slate-900' : 'text-white'
                      }`}
                    >
                      {isEn
                        ? 'Cisco Port & Hardware Capabilities'
                        : 'اختیارات عملیاتی پورت‌ها و سخت‌افزار سیسکو'}
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      {
                        key: 'canToggleAdminStatus',
                        labelEn: 'Toggle Interface Power (Shutdown/No Shut)',
                        labelFa: 'خاموش/روشن کردن پورت (Shutdown/No Shut)',
                        descEn: 'Administrative link state control',
                        descFa: 'تغییر وضعیت فعال یا غیرفعال بودن اینترفیس',
                      },
                      {
                        key: 'canChangeVlan',
                        labelEn: 'Assign Access VLAN & PVID',
                        labelFa: 'تغییر و انتساب VLAN به پورت‌ها',
                        descEn: 'Reassign ports to authorized network VLANs',
                        descFa: 'تغییر شماره VLAN اینترفیس‌های لایه ۲',
                      },
                      {
                        key: 'canTogglePortSecurity',
                        labelEn: 'Port Security & MAC Sticky',
                        labelFa: 'تنظیمات Port Security و کنترل MAC',
                        descEn: 'Manage port violation modes and limits',
                        descFa: 'پیکربندی امنیت مک‌آدرس و قفل پورت',
                      },
                      {
                        key: 'canEditDescription',
                        labelEn: 'Modify Interface Description',
                        labelFa: 'ویرایش توضیحات پورت (Description)',
                        descEn: 'Update port documentation memos',
                        descFa: 'ثبت و تغییر یادداشت‌های شناسایی پورت',
                      },
                      {
                        key: 'canWriteMemory',
                        labelEn: 'Save Running Config to NVRAM (Write Memory)',
                        labelFa: 'ذخیره‌سازی کانفیگ در حافظه پایدار (write mem)',
                        descEn: 'Persist active running config across reboots',
                        descFa: 'انتقال تنظیمات موقت به استارت‌آپ سوییچ',
                      },
                      {
                        key: 'canBulkConfigurePorts',
                        labelEn: 'Bulk Multi-Port Configuration',
                        labelFa: 'پیکربندی دسته‌ای و همزمان چندین پورت',
                        descEn: 'Apply bulk commands to range of interfaces',
                        descFa: 'اعمال یکباره تغییرات روی رنجی از پورت‌ها',
                      },
                    ].map((item) => {
                      const isChecked = Boolean((draftPolicy as any)[item.key]);
                      return (
                        <label
                          key={item.key}
                          className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition select-none ${
                            isChecked
                              ? isLightMode
                                ? 'bg-sky-50 border-sky-300 text-sky-900'
                                : 'bg-sky-500/15 border-sky-500/40 text-sky-200'
                              : isLightMode
                              ? 'bg-slate-100 border-slate-200 text-slate-500'
                              : 'bg-slate-900/60 border-white/10 text-slate-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) =>
                              setDraftPolicy({
                                ...draftPolicy,
                                [item.key]: e.target.checked,
                              })
                            }
                            className="w-4 h-4 mt-0.5 accent-sky-500 rounded"
                          />
                          <div>
                            <div
                              className={`font-bold text-xs ${
                                isLightMode ? 'text-slate-900' : 'text-white'
                              }`}
                            >
                              {isEn ? item.labelEn : item.labelFa}
                            </div>
                            <div
                              className={`text-[10px] mt-0.5 ${
                                isLightMode ? 'text-slate-600' : 'text-slate-400'
                              }`}
                            >
                              {isEn ? item.descEn : item.descFa}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: MikroTik RouterOS */}
            {activeTab === 'mikrotik' && (
              <div className="space-y-4 animate-fadeIn">
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode
                      ? 'bg-white border-slate-200 shadow-xs'
                      : 'bg-slate-950/60 border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <RouterIcon className="w-4 h-4 text-emerald-400" />
                    <h4
                      className={`text-xs font-bold ${
                        isLightMode ? 'text-slate-900' : 'text-white'
                      }`}
                    >
                      {isEn
                        ? 'MikroTik RouterOS Capabilities & Safety'
                        : 'اختیارات عملیاتی و ماژول‌های امنیتی میکروتیک'}
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      {
                        key: 'canMikrotikSafeMode',
                        labelEn: 'RouterOS Safe Mode Protection',
                        labelFa: 'محافظت حالت امن (Safe Mode)',
                        descEn: 'Automatic rollback on connection loss',
                        descFa: 'بازگردانی خودکار تغییرات در صورت قطعی ارتباط',
                      },
                      {
                        key: 'canMikrotikFirewall',
                        labelEn: 'Firewall Filter & NAT Rules',
                        labelFa: 'مدیریت فایروال و رول‌های NAT',
                        descEn: 'Inspect and modify /ip/firewall rules',
                        descFa: 'مشاهده و ویرایش جدول‌های فیلتر و نت',
                      },
                      {
                        key: 'canMikrotikBackup',
                        labelEn: 'System Backup & Export (.rsc)',
                        labelFa: 'بکاپ‌گیری و استخراج فایل کانفیگ (.rsc)',
                        descEn: 'Trigger /system/backup and /export scripts',
                        descFa: 'تهیه نسخه پشتیبان باینری و اسکریپت خروجی',
                      },
                      {
                        key: 'canMikrotikBridgeVlan',
                        labelEn: 'Bridge VLAN Filtering & Ports',
                        labelFa: 'مدیریت Bridge و فیلترینگ VLAN',
                        descEn: 'Configure bridge ports and tagged PVIDs',
                        descFa: 'تغییر تنظیمات پورت‌های بریج و تگ‌های VLAN',
                      },
                      {
                        key: 'canMikrotikToggleInterface',
                        labelEn: 'Enable / Disable Interfaces',
                        labelFa: 'فعال/غیرفعال‌سازی اینترفیس‌های روتر',
                        descEn: 'Toggle Ethernet, SFP, and Tunnel links',
                        descFa: 'روشن یا خاموش کردن پورت‌ها و تانل‌ها',
                      },
                      {
                        key: 'canMikrotikComment',
                        labelEn: 'Modify Interface Comments',
                        labelFa: 'ثبت و ویرایش کامنت اینترفیس‌ها',
                        descEn: 'Attach operational notes to interfaces',
                        descFa: 'نوشتن کامنت‌های شناسایی روی خطوط ارتباطی',
                      },
                    ].map((item) => {
                      const isChecked = Boolean((draftPolicy as any)[item.key]);
                      return (
                        <label
                          key={item.key}
                          className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition select-none ${
                            isChecked
                              ? isLightMode
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                                : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                              : isLightMode
                              ? 'bg-slate-100 border-slate-200 text-slate-500'
                              : 'bg-slate-900/60 border-white/10 text-slate-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) =>
                              setDraftPolicy({
                                ...draftPolicy,
                                [item.key]: e.target.checked,
                              })
                            }
                            className="w-4 h-4 mt-0.5 accent-emerald-500 rounded"
                          />
                          <div>
                            <div
                              className={`font-bold text-xs ${
                                isLightMode ? 'text-slate-900' : 'text-white'
                              }`}
                            >
                              {isEn ? item.labelEn : item.labelFa}
                            </div>
                            <div
                              className={`text-[10px] mt-0.5 ${
                                isLightMode ? 'text-slate-600' : 'text-slate-400'
                              }`}
                            >
                              {isEn ? item.descEn : item.descFa}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: Linux & Servers Fleet */}
            {activeTab === 'servers' && (
              <div className="space-y-4 animate-fadeIn">
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode
                      ? 'bg-white border-slate-200 shadow-xs'
                      : 'bg-slate-950/60 border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Server className="w-4 h-4 text-amber-400" />
                    <h4
                      className={`text-xs font-bold ${
                        isLightMode ? 'text-slate-900' : 'text-white'
                      }`}
                    >
                      {isEn
                        ? 'Linux & Remote Servers Fleet Permissions'
                        : 'اختیارات مدیریتی ناوگان سرورهای لینوکس و ریموت'}
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      {
                        key: 'terminal',
                        labelEn: 'Remote SSH Terminal (Interactive)',
                        labelFa: 'ترمینال شل SSH تعاملی سرور',
                        descEn: 'Direct shell console access to remote OS',
                        descFa: 'ورود مستقیم به شل و خط فرمان سیستم‌عامل سرور',
                      },
                      {
                        key: 'file_explorer',
                        labelEn: 'SFTP File Explorer & Safe Editor',
                        labelFa: 'کاوشگر فایل و ادیتور امن SFTP',
                        descEn: 'Browse directories, upload & edit files',
                        descFa: 'مشاهده دایرکتوری‌ها، دانلود، آپلود و ویرایش فایل‌ها',
                      },
                      {
                        key: 'server_management',
                        labelEn: 'System Resources & Metrics Monitor',
                        labelFa: 'پایش و مانیتورینگ زنده منابع سرور',
                        descEn: 'CPU, RAM, Disk, Systemd services telemetry',
                        descFa: 'بررسی لایو پردازنده، رم، دیسک و وضعیت سرویس‌ها',
                      },
                      {
                        key: 'power_control',
                        labelEn: 'Power Actions (Reboot / Shutdown)',
                        labelFa: 'کنترل تغذیه و ریستارت سرور (Reboot)',
                        descEn: 'Trigger graceful or hard system restart',
                        descFa: 'صدور فرمان خاموش‌سازی و راه‌اندازی مجدد سرور',
                      },
                      {
                        key: 'database_management',
                        labelEn: 'Database Fleet (PostgreSQL & MySQL)',
                        labelFa: 'مدیریت پایگاه‌های داده (PostgreSQL/MySQL)',
                        descEn: 'Inspect queries, tables, and DB services',
                        descFa: 'مشاهده جداول، کوئری‌ها و سرویس‌های دیتابیس',
                      },
                      {
                        key: 'web_management',
                        labelEn: 'Web Servers (Nginx & Apache)',
                        labelFa: 'مدیریت وب‌سرورها (Nginx و Apache)',
                        descEn: 'Configure virtual hosts and reverse proxies',
                        descFa: 'ویرایش تنظیمات هاست‌های مجازی و پروکسی معکوس',
                      },
                    ].map((item) => {
                      const isChecked = Boolean(
                        draftPolicy.defaultServerPermissions &&
                          (draftPolicy.defaultServerPermissions as any)[item.key]
                      );
                      return (
                        <label
                          key={item.key}
                          className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition select-none ${
                            isChecked
                              ? isLightMode
                                ? 'bg-amber-50 border-amber-300 text-amber-900'
                                : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                              : isLightMode
                              ? 'bg-slate-100 border-slate-200 text-slate-500'
                              : 'bg-slate-900/60 border-white/10 text-slate-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) =>
                              setDraftPolicy({
                                ...draftPolicy,
                                defaultServerPermissions: {
                                  ...draftPolicy.defaultServerPermissions,
                                  [item.key]: e.target.checked,
                                },
                              })
                            }
                            className="w-4 h-4 mt-0.5 accent-amber-500 rounded"
                          />
                          <div>
                            <div
                              className={`font-bold text-xs ${
                                isLightMode ? 'text-slate-900' : 'text-white'
                              }`}
                            >
                              {isEn ? item.labelEn : item.labelFa}
                            </div>
                            <div
                              className={`text-[10px] mt-0.5 ${
                                isLightMode ? 'text-slate-600' : 'text-slate-400'
                              }`}
                            >
                              {isEn ? item.descEn : item.descFa}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 6: Global & Templates */}
            {activeTab === 'global' && (
              <div className="space-y-4 animate-fadeIn">
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode
                      ? 'bg-white border-slate-200 shadow-xs'
                      : 'bg-slate-950/60 border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <FileCode2 className="w-4 h-4 text-purple-400" />
                    <h4
                      className={`text-xs font-bold ${
                        isLightMode ? 'text-slate-900' : 'text-white'
                      }`}
                    >
                      {isEn
                        ? 'Global Infrastructure Operations & Config Templates'
                        : 'عملیات عمومی زیرساخت و اختیارات الگوهای کانفیگ'}
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      {
                        key: 'canApplyTemplates',
                        labelEn: 'Apply Configuration Templates',
                        labelFa: 'اعمال الگوها و اسکریپت‌های کانفیگ (Templates)',
                        descEn:
                          'Enables template deployment and initial config during device registration',
                        descFa:
                          'مجوز ارسال قالب به تجهیزات و باز شدن قفل تمپلیت اولیه در ثبت تجهیز',
                      },
                      {
                        key: 'canExportTemplates',
                        labelEn: 'Export Config Templates Package',
                        labelFa: 'استخراج و خروجی الگوهای کانفیگ (Export)',
                        descEn: 'Download configuration templates package as JSON',
                        descFa: 'مجوز استخراج و دانلود بانک تمپلیت‌ها به فرمت JSON',
                      },
                      {
                        key: 'canImportTemplates',
                        labelEn: 'Import Config Templates Package',
                        labelFa: 'ورود و بارگذاری الگوهای کانفیگ (Import)',
                        descEn: 'Upload and register templates from JSON package',
                        descFa: 'مجوز افزودن و بارگذاری تمپلیت‌های جدید از فایل بسته',
                      },
                      {
                        key: 'canManageDevices',
                        labelEn: 'Manage Equipment (Add, Edit, Delete)',
                        labelFa: 'مدیریت تجهیزات (ثبت، ویرایش و حذف)',
                        descEn: 'Full lifecycle administration of network hardware',
                        descFa: 'امکان ثبت دستگاه جدید، تغییر مشخصات و حذف از نقشه',
                      },
                      {
                        key: 'canExportBackup',
                        labelEn: 'Export Disaster Recovery Backup',
                        labelFa: 'خروجی بکاپ جامع دیتابیس و شبکه',
                        descEn: 'Generate full encrypted disaster recovery snapshots',
                        descFa: 'تولید پکیج بکاپ کامل سیستم برای بازیابی فاجعه',
                      },
                      {
                        key: 'canImportBackup',
                        labelEn: 'Import & Restore Network Backup',
                        labelFa: 'بازگردانی و ریستور نسخه پشتیبان',
                        descEn: 'Restore application state from archive package',
                        descFa: 'اعمال و ریستور دیتابیس از روی فایل بکاپ',
                      },
                    ].map((item) => {
                      const isChecked = Boolean((draftPolicy as any)[item.key]);
                      return (
                        <label
                          key={item.key}
                          className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition select-none ${
                            isChecked
                              ? isLightMode
                                ? 'bg-purple-50 border-purple-300 text-purple-900'
                                : 'bg-purple-500/15 border-purple-500/40 text-purple-200'
                              : isLightMode
                              ? 'bg-slate-100 border-slate-200 text-slate-500'
                              : 'bg-slate-900/60 border-white/10 text-slate-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) =>
                              setDraftPolicy({
                                ...draftPolicy,
                                [item.key]: e.target.checked,
                              })
                            }
                            className="w-4 h-4 mt-0.5 accent-purple-500 rounded"
                          />
                          <div>
                            <div
                              className={`font-bold text-xs ${
                                isLightMode ? 'text-slate-900' : 'text-white'
                              }`}
                            >
                              {isEn ? item.labelEn : item.labelFa}
                            </div>
                            <div
                              className={`text-[10px] mt-0.5 ${
                                isLightMode ? 'text-slate-600' : 'text-slate-400'
                              }`}
                            >
                              {isEn ? item.descEn : item.descFa}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 7: Granular Overrides Matrix */}
            {activeTab === 'matrix' && (
              <div className="space-y-4 animate-fadeIn">
                <div
                  className={`p-4 rounded-xl border ${
                    isLightMode
                      ? 'bg-white border-slate-200 shadow-xs'
                      : 'bg-slate-950/60 border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Sliders className="w-4 h-4 text-rose-400" />
                    <h4
                      className={`text-xs font-bold ${
                        isLightMode ? 'text-slate-900' : 'text-white'
                      }`}
                    >
                      {isEn
                        ? 'Granular Per-Device & Per-Server Matrix Overrides'
                        : 'ماتریس اختیارات تفکیکی به ازای هر تجهیز یا سرور مجزا'}
                    </h4>
                  </div>
                  <p
                    className={`text-[11px] mb-4 ${
                      isLightMode ? 'text-slate-500' : 'text-slate-400'
                    }`}
                  >
                    {isEn
                      ? 'Override general policy permissions for specific mission-critical switches, core routers, or database servers.'
                      : 'تعریف استثنائات و سطوح دسترسی سفارشی برای سوییچ‌های حساس، روترهای مرکزی یا سرورهای پایگاه داده'}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div
                      className={`p-3 rounded-xl border ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-200'
                          : 'bg-slate-900/60 border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold">
                          {isEn ? 'Network Equipment Overrides' : 'اوررایدهای تجهیزات شبکه'}
                        </span>
                        <span className="text-[10px] font-mono text-cyan-400">
                          {Object.keys(draftPolicy.perDevicePermissions || {}).length}{' '}
                          {isEn ? 'devices configured' : 'دستگاه اختصاصی'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        {isEn
                          ? 'Fine-tune 3-dots action menus and interface operations on high-security equipment.'
                          : 'شخصی‌سازی منوی ۳-نقطه و عملیات پورت‌ها برای تجهیزات خاص شبکه.'}
                      </p>
                    </div>

                    <div
                      className={`p-3 rounded-xl border ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-200'
                          : 'bg-slate-900/60 border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold">
                          {isEn ? 'Remote Server Fleet Overrides' : 'اوررایدهای ناوگان سرورها'}
                        </span>
                        <span className="text-[10px] font-mono text-amber-400">
                          {Object.keys(draftPolicy.perServerPermissions || {}).length}{' '}
                          {isEn ? 'servers configured' : 'سرور اختصاصی'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        {isEn
                          ? 'Fine-tune terminal, file explorer, power, and database access for specific Linux servers.'
                          : 'تنظیم دقیق دسترسی به شل، فایل‌ها، پاور و سرویس‌ها برای سرورهای مشخص.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sticky Modal Footer with Actions */}
          <div
            className={`p-4 border-t flex items-center justify-between gap-3 shrink-0 ${
              isLightMode
                ? 'bg-white border-slate-200'
                : 'bg-slate-950/90 border-white/10'
            }`}
          >
            <div className="flex items-center gap-2 text-xs">
              <span
                className={`text-[11px] ${
                  isLightMode ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                {isEn ? 'Active Tab:' : 'بخش فعال:'}
              </span>
              <span className="font-semibold text-indigo-400">
                {tabsConfig.find((t) => t.id === activeTab)?.labelEn}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  isLightMode
                    ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-2 transition shadow-lg shadow-indigo-600/30 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>
                  {isSaving
                    ? isEn
                      ? 'Saving to Database...'
                      : 'در حال ذخیره‌سازی...'
                    : isEn
                    ? 'Save Policy'
                    : 'ثبت و ذخیره پالیسی'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
