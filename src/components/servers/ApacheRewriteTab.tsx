import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Lock,
  Globe,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Copy,
  Plus,
  Edit3,
  Shield,
  Zap,
  FolderTree,
  Sliders,
  Check,
  ExternalLink,
  ChevronRight,
  Code2,
  Trash2,
  Key,
} from 'lucide-react';
import {
  RemoteServer,
  ApacheInstallationDetails,
  ApacheRewriteHtaccessSummary,
  ApacheHtaccessFile,
  ApacheRewriteRuleItem,
  ApacheCustomErrorDoc,
  ApacheBasicAuthProtectedArea,
} from '../../types';
import {
  fetchApacheRewriteSummary,
  enableApacheRewriteModule,
  saveApacheHtaccessFile,
  setupApacheBasicAuth,
  deployApacheCustomErrorDocs,
} from '../../services/api';

interface ApacheRewriteTabProps {
  server: RemoteServer;
  discovery: ApacheInstallationDetails | null;
  isEn: boolean;
  isLightMode: boolean;
  onRefreshDiscovery?: () => void;
}

export const ApacheRewriteTab: React.FC<ApacheRewriteTabProps> = ({
  server,
  discovery,
  isEn,
  isLightMode,
  onRefreshDiscovery,
}) => {
  const [summary, setSummary] = useState<ApacheRewriteHtaccessSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'presets' | 'htaccess' | 'auth' | 'errordocs'>('presets');

  // Modals & States
  const [isEnablingRewrite, setIsEnablingRewrite] = useState<boolean>(false);
  const [enableRewriteResult, setEnableRewriteResult] = useState<string | null>(null);

  // .htaccess file editor state
  const [selectedHtaccess, setSelectedHtaccess] = useState<ApacheHtaccessFile | null>(null);
  const [isEditingHtaccess, setIsEditingHtaccess] = useState<boolean>(false);
  const [htaccessDraftContent, setHtaccessDraftContent] = useState<string>('');
  const [isSavingHtaccess, setIsSavingHtaccess] = useState<boolean>(false);
  const [saveHtaccessResult, setSaveHtaccessResult] = useState<{ success: boolean; message: string } | null>(null);

  // New .htaccess modal state
  const [isNewHtaccessModalOpen, setIsNewHtaccessModalOpen] = useState<boolean>(false);
  const [newHtaccessDir, setNewHtaccessDir] = useState<string>('/var/www/html');
  const [newHtaccessContent, setNewHtaccessContent] = useState<string>(
    '# .htaccess configuration\nRewriteEngine On\n'
  );

  // Basic Auth Wizard state
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authTargetDir, setAuthTargetDir] = useState<string>('/var/www/html/admin');
  const [authName, setAuthName] = useState<string>('Restricted Administration Area');
  const [authUsername, setAuthUsername] = useState<string>('admin');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [isSavingAuth, setIsSavingAuth] = useState<boolean>(false);
  const [authResult, setAuthResult] = useState<{ success: boolean; message: string } | null>(null);

  // Custom Error Docs state
  const [errorDocsDraft, setErrorDocsDraft] = useState<ApacheCustomErrorDoc[]>([
    { statusCode: 403, reason: 'Forbidden', actionType: 'path', target: '/errors/403.html' },
    { statusCode: 404, reason: 'Not Found', actionType: 'path', target: '/errors/404.html' },
    { statusCode: 500, reason: 'Internal Server Error', actionType: 'path', target: '/errors/500.html' },
  ]);
  const [isSavingErrorDocs, setIsSavingErrorDocs] = useState<boolean>(false);
  const [errorDocsResult, setErrorDocsResult] = useState<{ success: boolean; message: string } | null>(null);

  // Copy indicator
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  // Fetch summary
  const loadSummary = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const res = await fetchApacheRewriteSummary(server.id);
      if (res.success && res.summary) {
        setSummary(res.summary);
        if (res.summary.configuredErrorDocs && res.summary.configuredErrorDocs.length > 0) {
          setErrorDocsDraft(res.summary.configuredErrorDocs);
        }
      } else {
        setError(res.error || (isEn ? 'Failed to retrieve rewrite & .htaccess telemetry' : 'خطا در دریافت وضعیت ریرایت و htaccess'));
      }
    } catch (err: any) {
      setError(err?.message || (isEn ? 'Connection failure while querying server' : 'خطای ارتباط با سرور'));
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [server.id, isEn]);

  useEffect(() => {
    loadSummary(true);
  }, [loadSummary]);

  // Enable mod_rewrite handler
  const handleEnableRewrite = async () => {
    setIsEnablingRewrite(true);
    setEnableRewriteResult(null);
    try {
      const res = await enableApacheRewriteModule(server.id);
      if (res.success) {
        setEnableRewriteResult(
          isEn
            ? 'mod_rewrite enabled, syntax test passed, and Apache reloaded successfully!'
            : 'ماژول mod_rewrite فعال شد، تست سینتکس تایید گردید و آپاچی بارگذاری شد!'
        );
        setTimeout(() => {
          loadSummary(false);
          if (onRefreshDiscovery) onRefreshDiscovery();
        }, 1500);
      } else {
        setEnableRewriteResult(
          (isEn ? 'Failed to enable mod_rewrite: ' : 'خطا در فعال‌سازی mod_rewrite: ') +
            (res.error || res.syntaxOutput || 'Syntax test failure')
        );
      }
    } catch (err: any) {
      setEnableRewriteResult((isEn ? 'Error: ' : 'خطا: ') + (err?.message || 'Request failed'));
    } finally {
      setIsEnablingRewrite(false);
    }
  };

  // Copy code helper
  const handleCopyCode = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  // Open edit modal for existing .htaccess
  const handleOpenEditHtaccess = (file: ApacheHtaccessFile) => {
    setSelectedHtaccess(file);
    setHtaccessDraftContent(file.fullContent || file.contentSnippet || '# .htaccess\n');
    setSaveHtaccessResult(null);
    setIsEditingHtaccess(true);
  };

  // Save .htaccess handler
  const handleSaveHtaccess = async (directory: string, content: string) => {
    setIsSavingHtaccess(true);
    setSaveHtaccessResult(null);
    try {
      const res = await saveApacheHtaccessFile(server.id, directory, content);
      if (res.success) {
        setSaveHtaccessResult({
          success: true,
          message: isEn
            ? `.htaccess saved to ${res.filePath}. Apache syntax test passed and service reloaded!`
            : `فایل .htaccess در ${res.filePath} با موفقیت ذخیره و سرویس آپاچی ریلود گردید!`,
        });
        setTimeout(() => {
          setIsEditingHtaccess(false);
          setIsNewHtaccessModalOpen(false);
          loadSummary(false);
        }, 1200);
      } else {
        setSaveHtaccessResult({
          success: false,
          message:
            (isEn ? 'Failed to save .htaccess: ' : 'خطا در ذخیره htaccess: ') +
            (res.error || res.syntaxOutput || 'Syntax error; rolled back safely.'),
        });
      }
    } catch (err: any) {
      setSaveHtaccessResult({
        success: false,
        message: (isEn ? 'Save error: ' : 'خطای ذخیره‌سازی: ') + (err?.message || 'Network exception'),
      });
    } finally {
      setIsSavingHtaccess(false);
    }
  };

  // Basic auth setup handler
  const handleSetupBasicAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authTargetDir.trim() || !authUsername.trim()) return;
    setIsSavingAuth(true);
    setAuthResult(null);
    try {
      const res = await setupApacheBasicAuth(server.id, {
        targetDirectory: authTargetDir,
        authName,
        username: authUsername,
        password: authPassword || undefined,
      });
      if (res.success) {
        setAuthResult({
          success: true,
          message: isEn
            ? `Protected area configured in ${res.filePath}! Credentials and .htaccess deployed.`
            : `مسیر محافظت‌شده در ${res.filePath} با موفقیت پیکربندی و اعمال شد!`,
        });
        setTimeout(() => {
          setIsAuthModalOpen(false);
          loadSummary(false);
        }, 1500);
      } else {
        setAuthResult({
          success: false,
          message:
            (isEn ? 'Basic Auth deployment failed: ' : 'خطا در تنظیم احراز هویت: ') +
            (res.error || res.syntaxOutput || 'Unknown error'),
        });
      }
    } catch (err: any) {
      setAuthResult({
        success: false,
        message: (isEn ? 'Error: ' : 'خطا: ') + (err?.message || 'Request failed'),
      });
    } finally {
      setIsSavingAuth(false);
    }
  };

  // Custom Error Documents deploy handler
  const handleDeployErrorDocs = async () => {
    setIsSavingErrorDocs(true);
    setErrorDocsResult(null);
    try {
      const res = await deployApacheCustomErrorDocs(server.id, errorDocsDraft);
      if (res.success) {
        setErrorDocsResult({
          success: true,
          message: isEn
            ? `ErrorDocument directives safely written to ${res.filePath}. Apache syntax test passed and service reloaded!`
            : `دستورات ErrorDocument در ${res.filePath} ذخیره، تست سینتکس تایید و سرویس ریلود شد!`,
        });
        setTimeout(() => {
          loadSummary(false);
        }, 1500);
      } else {
        setErrorDocsResult({
          success: false,
          message:
            (isEn ? 'Failed to deploy ErrorDocuments: ' : 'خطا در استقرار صفحات خطا: ') +
            (res.error || res.syntaxOutput || 'Syntax test failure'),
        });
      }
    } catch (err: any) {
      setErrorDocsResult({
        success: false,
        message: (err?.message || (isEn ? 'Request error' : 'خطای درخواست')),
      });
    } finally {
      setIsSavingErrorDocs(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Quick Status Bar */}
      <div
        className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-4 transition shadow-sm ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm">
              {isEn ? 'Apache Rewrite & .htaccess Studio' : 'استودیو ریرایت و فایل‌های .htaccess آپاچی'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEn
                ? 'mod_rewrite rules engine, URL redirects, .htaccess explorer, HTTP Basic Auth (htpasswd), and custom ErrorDocuments'
                : 'موتور قوانین mod_rewrite، تغییر مسیرهای ۳۰۱/۳۰۲، کاوشگر .htaccess، احراز هویت دایرکتوری و صفحات خطای سفارشی'}
            </p>
          </div>
        </div>

        {/* Status badges & actions */}
        <div className="flex items-center gap-2.5">
          {summary && (
            <>
              {/* mod_rewrite status */}
              <div
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 border ${
                  summary.isRewriteModuleLoaded
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    summary.isRewriteModuleLoaded ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
                  }`}
                />
                <span>mod_rewrite: {summary.isRewriteModuleLoaded ? (isEn ? 'Active' : 'فعال') : isEn ? 'Disabled' : 'غیرفعال'}</span>
              </div>

              {/* AllowOverride status */}
              <div
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 border ${
                  summary.globalAllowOverride.toLowerCase().includes('all')
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-slate-800 border-slate-700 text-slate-300'
                }`}
              >
                <span>AllowOverride: {summary.globalAllowOverride}</span>
              </div>
            </>
          )}

          {/* Refresh button */}
          <button
            type="button"
            onClick={() => loadSummary(true)}
            disabled={loading}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
              isLightMode
                ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            <span>{loading ? (isEn ? 'Scanning...' : 'در حال بررسی...') : isEn ? 'Refresh' : 'بروزرسانی'}</span>
          </button>
        </div>
      </div>

      {/* Notice if mod_rewrite is disabled */}
      {summary && !summary.isRewriteModuleLoaded && (
        <div
          className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
            isLightMode ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="text-xs">
              <div className="font-bold">{isEn ? 'mod_rewrite Module is Not Loaded' : 'ماژول mod_rewrite فعال نیست'}</div>
              <div className="opacity-90">
                {isEn
                  ? 'Apache rewrite directives will fail without mod_rewrite. Click below to enable it safely with a syntax test.'
                  : 'قوانین ریرایت بدون این ماژول کار نخواهند کرد. برای فعال‌سازی ایمن روی دکمه مقابل کلیک کنید.'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleEnableRewrite}
            disabled={isEnablingRewrite}
            className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm shrink-0"
          >
            {isEnablingRewrite ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            <span>{isEnablingRewrite ? (isEn ? 'Enabling...' : 'در حال فعال‌سازی...') : isEn ? 'Enable mod_rewrite' : 'فعال‌سازی mod_rewrite'}</span>
          </button>
        </div>
      )}

      {enableRewriteResult && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
            enableRewriteResult.includes('success') || enableRewriteResult.includes('موفقیت')
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {enableRewriteResult.includes('success') || enableRewriteResult.includes('موفقیت') ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{enableRewriteResult}</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 ${
            isLightMode ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
          }`}
        >
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <div className="font-bold">{isEn ? 'Scan Error' : 'خطای کاوش'}</div>
            <div>{error}</div>
          </div>
        </div>
      )}

      {/* 2. Sub-Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto text-xs">
        <button
          type="button"
          onClick={() => setActiveSubTab('presets')}
          className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer font-semibold shrink-0 ${
            activeSubTab === 'presets'
              ? 'bg-amber-500 text-slate-950 font-bold'
              : isLightMode
              ? 'text-slate-600 hover:bg-slate-100'
              : 'text-slate-400 hover:bg-slate-800'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>{isEn ? 'Rewrite Presets & Engine' : 'قوانین و الگوهای ریرایت'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('htaccess')}
          className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer font-semibold shrink-0 ${
            activeSubTab === 'htaccess'
              ? 'bg-amber-500 text-slate-950 font-bold'
              : isLightMode
              ? 'text-slate-600 hover:bg-slate-100'
              : 'text-slate-400 hover:bg-slate-800'
          }`}
        >
          <FolderTree className="w-3.5 h-3.5" />
          <span>{isEn ? '.htaccess Explorer' : 'کاوشگر فایل‌های .htaccess'}</span>
          {summary?.htaccessFiles && (
            <span className="px-1.5 py-0.2 rounded-full bg-black/20 text-[10px] font-mono">
              {summary.htaccessFiles.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('auth')}
          className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer font-semibold shrink-0 ${
            activeSubTab === 'auth'
              ? 'bg-amber-500 text-slate-950 font-bold'
              : isLightMode
              ? 'text-slate-600 hover:bg-slate-100'
              : 'text-slate-400 hover:bg-slate-800'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          <span>{isEn ? 'HTTP Basic Auth (.htpasswd)' : 'احراز هویت دایرکتوری'}</span>
          {summary?.protectedAreas && summary.protectedAreas.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-black/20 text-[10px] font-mono">
              {summary.protectedAreas.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('errordocs')}
          className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer font-semibold shrink-0 ${
            activeSubTab === 'errordocs'
              ? 'bg-amber-500 text-slate-950 font-bold'
              : isLightMode
              ? 'text-slate-600 hover:bg-slate-100'
              : 'text-slate-400 hover:bg-slate-800'
          }`}
        >
          <AlertCircle className="w-3.5 h-3.5" />
          <span>{isEn ? 'Custom Error Documents' : 'صفحات خطای سفارشی (ErrorDocument)'}</span>
        </button>
      </div>

      {/* 3. SUB-TAB CONTENT: PRESETS */}
      {activeSubTab === 'presets' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-bold text-xs sm:text-sm">
                {isEn ? 'Production Rewrite & Redirect Presets' : 'الگوهای استاندارد تغییر مسیر و ریرایت'}
              </h4>
              <p className="text-[11px] text-slate-400">
                {isEn
                  ? 'Tested mod_rewrite rule blocks ready to copy or deploy to any .htaccess or VirtualHost'
                  : 'بلوک‌های تست‌شده قوانین ریرایت جهت استفاده سریع در فایل‌های .htaccess یا هاست مجازی'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {summary?.defaultRewritePresets.map((preset) => (
              <div
                key={preset.id}
                className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 transition ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs sm:text-sm text-amber-400">{preset.name}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                      {preset.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{preset.description}</p>
                </div>

                {/* Code preview */}
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-200 overflow-x-auto">
                  <pre>{preset.rawSnippet}</pre>
                </div>

                {/* Card footer buttons */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-500 font-mono">{preset.flags}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyCode(preset.id, preset.rawSnippet)}
                      className="px-2.5 py-1 rounded-lg border border-slate-700 hover:border-slate-500 text-slate-300 text-xs flex items-center gap-1.5 transition cursor-pointer"
                    >
                      {copiedCodeId === preset.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">{isEn ? 'Copied' : 'کپی شد'}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>{isEn ? 'Copy' : 'کپی'}</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setNewHtaccessDir('/var/www/html');
                        setNewHtaccessContent(preset.rawSnippet);
                        setIsNewHtaccessModalOpen(true);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Deploy to .htaccess' : 'اعمال در .htaccess'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. SUB-TAB CONTENT: .HTACCESS EXPLORER */}
      {activeSubTab === 'htaccess' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="font-bold text-xs sm:text-sm">
                {isEn ? 'Discovered .htaccess Files Across Server' : 'فایل‌های .htaccess شناسایی‌شده روی سرور'}
              </h4>
              <p className="text-[11px] text-slate-400">
                {isEn
                  ? 'Real-time directory level override configurations across document roots'
                  : 'پیکربندی‌های محلی سطح پوشه در ریشه‌های وب فعال سرور'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setNewHtaccessDir('/var/www/html');
                setNewHtaccessContent('# .htaccess configuration\nRewriteEngine On\n');
                setIsNewHtaccessModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isEn ? 'Create New .htaccess' : 'ایجاد فایل .htaccess جدید'}</span>
            </button>
          </div>

          {summary?.htaccessFiles && summary.htaccessFiles.length === 0 ? (
            <div
              className={`p-8 rounded-xl border text-center space-y-2 ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <FolderTree className="w-8 h-8 text-slate-500 mx-auto" />
              <div className="font-bold text-sm text-slate-300">
                {isEn ? 'No .htaccess Files Found' : 'هیچ فایل .htaccess یافت نشد'}
              </div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                {isEn
                  ? 'No .htaccess files were detected in common web directories (/var/www, /srv/www). Click "Create New .htaccess" to create one safely.'
                  : 'در مسیرهای متداول وب فایل .htaccess وجود ندارد. می‌توانید با کلیک روی دکمه بالا یک فایل جدید ایجاد نمایید.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {summary?.htaccessFiles.map((file) => (
                <div
                  key={file.filePath}
                  className={`p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition ${
                    isLightMode ? 'bg-white border-slate-200 hover:border-slate-300' : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="font-mono font-bold text-xs truncate text-slate-200">
                        {file.filePath}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                      <span className="font-mono">Owner: {file.owner}</span>
                      <span>•</span>
                      <span className="font-mono">Perms: {file.permissions}</span>
                      <span>•</span>
                      <span className="font-mono">Lines: {file.lineCount}</span>
                      <span>•</span>
                      <span className="font-mono">Size: {file.sizeBytes} B</span>
                    </div>

                    {/* Features tags */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {file.hasRewriteEngine && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-mono">
                          RewriteEngine On
                        </span>
                      )}
                      {file.hasAuthBasic && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30 font-mono">
                          AuthType Basic
                        </span>
                      )}
                      {file.hasErrorDocument && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30 font-mono">
                          ErrorDocument
                        </span>
                      )}
                      {file.hasRequireDirectives && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono">
                          Require
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenEditHtaccess(file)}
                      className="px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Inspect & Edit' : 'مشاهده و ویرایش'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. SUB-TAB CONTENT: BASIC AUTH */}
      {activeSubTab === 'auth' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="font-bold text-xs sm:text-sm">
                {isEn ? 'Directory HTTP Basic Authentication Areas' : 'مسیرهای محافظت‌شده با رمز عبور (Basic Auth)'}
              </h4>
              <p className="text-[11px] text-slate-400">
                {isEn
                  ? 'Secure sensitive administration folders with standard browser login popup and encrypted .htpasswd'
                  : 'محافظت از پوشه‌های حساس و پنل‌ها با پنجره ورود مرورگر و فایل هش‌شده .htpasswd'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setAuthTargetDir('/var/www/html/admin');
                setAuthUsername('admin');
                setAuthPassword('');
                setAuthResult(null);
                setIsAuthModalOpen(true);
              }}
              className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{isEn ? 'Protect New Directory' : 'محافظت از دایرکتوری جدید'}</span>
            </button>
          </div>

          {summary?.protectedAreas && summary.protectedAreas.length === 0 ? (
            <div
              className={`p-8 rounded-xl border text-center space-y-2 ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <Lock className="w-8 h-8 text-slate-500 mx-auto" />
              <div className="font-bold text-sm text-slate-300">
                {isEn ? 'No Protected Directories Found' : 'هیچ پوشه محافظت‌شده‌ای یافت نشد'}
              </div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                {isEn
                  ? 'No AuthUserFile directives were found in server configuration. Click "Protect New Directory" to configure one securely.'
                  : 'دستور AuthUserFile در فایل‌های سرور یافت نشد. می‌توانید با دکمه بالا یک پوشه را با رمز عبور ایمن نمایید.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {summary?.protectedAreas.map((area) => (
                <div
                  key={area.id}
                  className={`p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-purple-400 shrink-0" />
                      <span className="font-mono font-bold text-xs text-slate-200">{area.targetPath}</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      <span>AuthName: "{area.authName}"</span>
                      <span className="mx-2">•</span>
                      <span className="font-mono text-[11px]">UserFile: {area.authUserFile}</span>
                    </div>
                  </div>

                  <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono">
                    Require {area.requireDirective}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 6. SUB-TAB CONTENT: CUSTOM ERROR DOCUMENTS */}
      {activeSubTab === 'errordocs' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="font-bold text-xs sm:text-sm">
                {isEn ? 'Custom ErrorDocument Handlers' : 'تنظیم صفحات خطای سفارشی (ErrorDocument)'}
              </h4>
              <p className="text-[11px] text-slate-400">
                {isEn
                  ? 'Define branded error response templates or redirect URLs for 403, 404, 500, 502, and 503'
                  : 'تخصیص قالب‌های اختصاصی یا پیام‌های دلخواه به کدهای وضعیت HTTP'}
              </p>
            </div>

            <button
              type="button"
              onClick={handleDeployErrorDocs}
              disabled={isSavingErrorDocs}
              className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm disabled:opacity-50"
            >
              {isSavingErrorDocs ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>{isSavingErrorDocs ? (isEn ? 'Deploying...' : 'در حال استقرار...') : isEn ? 'Save & Deploy ErrorDocs' : 'ذخیره و استقرار صفحات خطا'}</span>
            </button>
          </div>

          {errorDocsResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
                errorDocsResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {errorDocsResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{errorDocsResult.message}</span>
            </div>
          )}

          <div className="space-y-3">
            {errorDocsDraft.map((doc, idx) => (
              <div
                key={doc.statusCode}
                className={`p-3.5 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-sm text-amber-400 w-12">
                    {doc.statusCode}
                  </span>
                  <div>
                    <div className="font-bold text-xs text-slate-200">{doc.reason}</div>
                    <div className="text-[11px] text-slate-400">
                      {isEn ? 'Directive:' : 'دستور:'} ErrorDocument {doc.statusCode}
                    </div>
                  </div>
                </div>

                <div className="flex-1 max-w-md w-full">
                  <input
                    type="text"
                    value={doc.target}
                    onChange={(e) => {
                      const updated = [...errorDocsDraft];
                      updated[idx].target = e.target.value;
                      setErrorDocsDraft(updated);
                    }}
                    placeholder="/errors/404.html or custom message"
                    className={`w-full px-3 py-1.5 text-xs font-mono rounded-lg border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                      isLightMode ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-200'
                    }`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7. MODAL: EDIT .HTACCESS */}
      {isEditingHtaccess && selectedHtaccess && (
        <div className="fixed inset-0 z-[1000000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`w-full max-w-3xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
              isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-bold text-sm">
                    {isEn ? 'Edit .htaccess File' : 'ویرایش فایل .htaccess'}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">{selectedHtaccess.filePath}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingHtaccess(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto space-y-3">
              {saveHtaccessResult && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    saveHtaccessResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  {saveHtaccessResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span>{saveHtaccessResult.message}</span>
                </div>
              )}

              <textarea
                rows={14}
                value={htaccessDraftContent}
                onChange={(e) => setHtaccessDraftContent(e.target.value)}
                className={`w-full p-3 font-mono text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-amber-500 leading-relaxed ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-900'
                    : 'bg-slate-950 border-slate-800 text-slate-200'
                }`}
              />
            </div>

            <div className="p-4 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-400 font-mono">
                {isEn ? 'Automatic backup created prior to saving' : 'پشتیبان‌گیری خودکار قبل از ذخیره‌سازی'}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingHtaccess(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white text-xs cursor-pointer"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveHtaccess(selectedHtaccess.directory, htaccessDraftContent)}
                  disabled={isSavingHtaccess}
                  className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md disabled:opacity-50"
                >
                  {isSavingHtaccess ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>{isSavingHtaccess ? (isEn ? 'Saving...' : 'در حال ذخیره...') : isEn ? 'Save .htaccess' : 'ذخیره .htaccess'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. MODAL: CREATE NEW .HTACCESS */}
      {isNewHtaccessModalOpen && (
        <div className="fixed inset-0 z-[1000000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
              isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-sm">
                  {isEn ? 'Create New .htaccess File' : 'ایجاد فایل جدید .htaccess'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewHtaccessModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto space-y-3">
              {saveHtaccessResult && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    saveHtaccessResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  {saveHtaccessResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span>{saveHtaccessResult.message}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300 block">
                  {isEn ? 'Target Directory:' : 'مسیر دایرکتوری مقصد:'}
                </label>
                <input
                  type="text"
                  value={newHtaccessDir}
                  onChange={(e) => setNewHtaccessDir(e.target.value)}
                  placeholder="/var/www/html"
                  className={`w-full px-3 py-2 font-mono text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                    isLightMode ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-200'
                  }`}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300 block">
                  {isEn ? 'Directives:' : 'دستورات کانفیگ:'}
                </label>
                <textarea
                  rows={10}
                  value={newHtaccessContent}
                  onChange={(e) => setNewHtaccessContent(e.target.value)}
                  className={`w-full p-3 font-mono text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                    isLightMode ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-200'
                  }`}
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsNewHtaccessModalOpen(false)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>
              <button
                type="button"
                onClick={() => handleSaveHtaccess(newHtaccessDir, newHtaccessContent)}
                disabled={isSavingHtaccess}
                className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md disabled:opacity-50"
              >
                {isSavingHtaccess ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>{isSavingHtaccess ? (isEn ? 'Deploying...' : 'در حال ایجاد...') : isEn ? 'Create .htaccess' : 'ایجاد و ذخیره فایل'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. MODAL: BASIC AUTH WIZARD */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 z-[1000000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSetupBasicAuth}
            className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
              isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-sm">
                  {isEn ? 'Password Protect Directory (HTTP Basic Auth)' : 'محافظت از پوشه با رمز عبور'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto space-y-3 text-xs">
              {authResult && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    authResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  {authResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span>{authResult.message}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="font-bold text-slate-300 block">
                  {isEn ? 'Directory Path to Protect:' : 'مسیر دایرکتوری تحت حفاظت:'}
                </label>
                <input
                  type="text"
                  required
                  value={authTargetDir}
                  onChange={(e) => setAuthTargetDir(e.target.value)}
                  placeholder="/var/www/html/admin"
                  className={`w-full px-3 py-2 font-mono rounded-xl border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                    isLightMode ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-200'
                  }`}
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-300 block">
                  {isEn ? 'Auth Realm Name:' : 'عنوان اعلان ورود (AuthName):'}
                </label>
                <input
                  type="text"
                  required
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  placeholder="Restricted Administration Area"
                  className={`w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                    isLightMode ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-200'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-300 block">
                    {isEn ? 'Username:' : 'نام کاربری:'}
                  </label>
                  <input
                    type="text"
                    required
                    value={authUsername}
                    onChange={(e) => setAuthUsername(e.target.value)}
                    placeholder="admin"
                    className={`w-full px-3 py-2 font-mono rounded-xl border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                      isLightMode ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-200'
                    }`}
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-300 block">
                    {isEn ? 'Password:' : 'رمز عبور:'}
                  </label>
                  <input
                    type="password"
                    required
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`w-full px-3 py-2 font-mono rounded-xl border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                      isLightMode ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-200'
                    }`}
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(false)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>
              <button
                type="submit"
                disabled={isSavingAuth}
                className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md disabled:opacity-50"
              >
                {isSavingAuth ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                <span>{isSavingAuth ? (isEn ? 'Deploying...' : 'در حال اعمال...') : isEn ? 'Deploy Protection' : 'اعمال رمز عبور'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
