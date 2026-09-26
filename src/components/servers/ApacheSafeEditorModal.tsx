import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  FileCode,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
  RotateCcw,
  GitCompare,
  History,
  HardDrive,
  Download,
  AlertTriangle,
  Play,
  Save,
} from 'lucide-react';
import {
  RemoteServer,
  ApacheConfigFileBackup,
  ApacheEditorSaveResult,
  ApacheEditorTestResult,
} from '../../types';
import {
  readApacheConfigFile,
  testApacheConfigFileCandidate,
  saveApacheConfigFileSafe,
  listApacheFileBackups,
  restoreApacheFileBackup,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface ApacheSafeEditorModalProps {
  isOpen: boolean;
  server: RemoteServer | null;
  filePath: string | null;
  initialContent?: string;
  sessionPassword?: string;
  onClose: () => void;
  onMinimize: () => void;
  onSaved: (savedFilePath: string) => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

interface DiffLine {
  type: 'unchanged' | 'added' | 'removed';
  content: string;
  oldNum?: number;
  newNum?: number;
}

/**
 * Computes line-by-line difference between original and modified Apache configuration
 */
function computeLineDiff(originalText: string, newText: string): DiffLine[] {
  const origLines = originalText.split('\n');
  const newLines = newText.split('\n');

  if (originalText === newText) {
    return origLines.map((line, idx) => ({
      type: 'unchanged',
      content: line,
      oldNum: idx + 1,
      newNum: idx + 1,
    }));
  }

  const n = origLines.length;
  const m = newLines.length;

  if (n * m > 1000000) {
    const result: DiffLine[] = [];
    const maxLen = Math.max(n, m);
    for (let i = 0; i < maxLen; i++) {
      const o = origLines[i];
      const nw = newLines[i];
      if (o === nw) {
        result.push({ type: 'unchanged', content: o, oldNum: i + 1, newNum: i + 1 });
      } else {
        if (o !== undefined) result.push({ type: 'removed', content: o, oldNum: i + 1 });
        if (nw !== undefined) result.push({ type: 'added', content: nw, newNum: i + 1 });
      }
    }
    return result;
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (origLines[i] === newLines[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const diff: DiffLine[] = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origLines[i - 1] === newLines[j - 1]) {
      diff.unshift({
        type: 'unchanged',
        content: origLines[i - 1],
        oldNum: i,
        newNum: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diff.unshift({
        type: 'added',
        content: newLines[j - 1],
        newNum: j,
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      diff.unshift({
        type: 'removed',
        content: origLines[i - 1],
        oldNum: i,
      });
      i--;
    }
  }

  return diff;
}

export const ApacheSafeEditorModal: React.FC<ApacheSafeEditorModalProps> = ({
  isOpen,
  server,
  filePath,
  initialContent,
  sessionPassword,
  onClose,
  onMinimize,
  onSaved,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [fileMeta, setFileMeta] = useState<{ sizeBytes: number; lastModified?: string; permissions?: string } | null>(null);

  // Testing & Saving state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ApacheEditorTestResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<ApacheEditorSaveResult | null>(null);
  const [autoReload, setAutoReload] = useState(true);

  // Diff & Backups Viewers
  const [viewMode, setViewMode] = useState<'editor' | 'diff' | 'backups'>('editor');
  const [backups, setBackups] = useState<ApacheConfigFileBackup[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Load configuration file when modal opens or path changes
  useEffect(() => {
    if (!isOpen || !server || !filePath) return;

    let isMounted = true;
    setLoading(true);
    setTestResult(null);
    setSaveResult(null);
    setViewMode('editor');

    if (initialContent !== undefined) {
      setContent(initialContent);
      setOriginalContent(initialContent);
    }

    readApacheConfigFile(server.id, filePath, sessionPassword)
      .then((res) => {
        if (!isMounted) return;
        if (res.success) {
          setContent(res.content);
          setOriginalContent(res.content);
          setFileMeta({
            sizeBytes: res.sizeBytes,
            lastModified: res.lastModified,
            permissions: res.permissions,
          });
        } else {
          setSaveResult({
            success: false,
            filePath,
            syntaxTestPassed: false,
            syntaxOutput: '',
            serviceReloaded: false,
            error: res.error || (isEn ? 'Failed to read Apache configuration file' : 'خطا در خواندن فایل پیکربندی آپاچی'),
          });
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setSaveResult({
          success: false,
          filePath,
          syntaxTestPassed: false,
          syntaxOutput: '',
          serviceReloaded: false,
          error: err?.message || (isEn ? 'Communication error' : 'خطای ارتباطی'),
        });
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    // Also fetch backups list
    listApacheFileBackups(server.id, filePath, sessionPassword)
      .then((bRes) => {
        if (isMounted && bRes.success && bRes.backups) {
          setBackups(bRes.backups);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [isOpen, server, filePath, sessionPassword]);

  // Handle Load Backups
  const fetchBackupsList = async () => {
    if (!server || !filePath) return;
    setLoadingBackups(true);
    try {
      const res = await listApacheFileBackups(server.id, filePath, sessionPassword);
      if (res.success && res.backups) {
        setBackups(res.backups);
      }
    } finally {
      setLoadingBackups(false);
    }
  };

  // Test candidate configuration syntax
  const handleTestSyntax = async () => {
    if (!server || !filePath || testing) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testApacheConfigFileCandidate(server.id, filePath, content, sessionPassword);
      if (res.success && res.test) {
        setTestResult(res.test);
      } else {
        setTestResult({
          isValid: false,
          output: res.error || (isEn ? 'Configuration syntax check failed' : 'بررسی ساختار کانفیگ ناموفق بود'),
          error: res.error,
        });
      }
    } catch (err: any) {
      setTestResult({
        isValid: false,
        output: err?.message || (isEn ? 'Failed to execute remote syntax check' : 'خطا در اجرای تست ساختار بر روی سرور'),
        error: err?.message,
      });
    } finally {
      setTesting(false);
    }
  };

  // Safely Save Configuration
  const handleSave = async () => {
    if (!server || !filePath || saving) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await saveApacheConfigFileSafe(server.id, filePath, content, autoReload, sessionPassword);
      setSaveResult(res);
      if (res.success) {
        setOriginalContent(content);
        fetchBackupsList();
        onSaved(filePath);
      }
    } catch (err: any) {
      setSaveResult({
        success: false,
        filePath,
        syntaxTestPassed: false,
        syntaxOutput: '',
        serviceReloaded: false,
        error: err?.message || (isEn ? 'Failed to save configuration' : 'خطا در ذخیره‌سازی پیکربندی'),
      });
    } finally {
      setSaving(false);
    }
  };

  // Restore from a specific backup
  const handleRestoreBackup = async (backupPath: string) => {
    if (!server || !filePath || restoringBackup) return;
    setRestoringBackup(backupPath);
    setSaveResult(null);
    try {
      const res = await restoreApacheFileBackup(server.id, filePath, backupPath, autoReload, sessionPassword);
      setSaveResult(res);
      if (res.success) {
        // Re-read file to update editor
        const readRes = await readApacheConfigFile(server.id, filePath, sessionPassword);
        if (readRes.success) {
          setContent(readRes.content);
          setOriginalContent(readRes.content);
        }
        fetchBackupsList();
        onSaved(filePath);
      }
    } catch (err: any) {
      setSaveResult({
        success: false,
        filePath,
        syntaxTestPassed: false,
        syntaxOutput: '',
        serviceReloaded: false,
        error: err?.message || (isEn ? 'Failed to restore backup' : 'خطا در بازیابی نسخه پشتیبان'),
      });
    } finally {
      setRestoringBackup(null);
    }
  };

  // Copy content
  const handleCopyContent = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Reset to original
  const handleReset = () => {
    setContent(originalContent);
    setTestResult(null);
  };

  const isDirty = content !== originalContent;
  const lineCount = useMemo(() => content.split('\n').length, [content]);
  const diffLines = useMemo(() => (viewMode === 'diff' ? computeLineDiff(originalContent, content) : []), [viewMode, originalContent, content]);
  const diffStats = useMemo(() => {
    const added = diffLines.filter((l) => l.type === 'added').length;
    const removed = diffLines.filter((l) => l.type === 'removed').length;
    return { added, removed };
  }, [diffLines]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`w-full h-full flex flex-col rounded-2xl border shadow-2xl overflow-hidden transition-all duration-300 ${
          isMaximized ? 'max-w-none max-h-none rounded-none' : 'max-w-6xl max-h-[92vh]'
        } ${isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-100'}`}
      >
        {/* ======================================================== */}
        {/* HEADER                                                   */}
        {/* ======================================================== */}
        <div
          className={`flex items-center justify-between px-4 sm:px-6 py-3 border-b select-none shrink-0 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/80 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
              <FileCode className="w-5 h-5" />
            </div>
            <div className="truncate">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm sm:text-base truncate">
                  {isEn ? 'Apache Safe Configuration Editor' : 'ویرایشگر امن پیکربندی آپاچی'}
                </span>
                {isDirty && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0 flex items-center gap-1 animate-pulse">
                    ● {isEn ? 'Modified' : 'تغییریافته'}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400 font-mono truncate flex items-center gap-2 mt-0.5">
                <span className="truncate">{filePath || 'untitled.conf'}</span>
                {fileMeta && (
                  <span className="text-[11px] text-slate-500 shrink-0">
                    ({(fileMeta.sizeBytes / 1024).toFixed(1)} KB • {lineCount} lines)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Header Controls: Minimize, Maximize, Close */}
          <div className="flex items-center gap-1.5 shrink-0">
            <FieldInfoTooltip
              fieldName="Apache Safe Editor with Atomic Rollback"
              infoWhatEn="A non-destructive configuration editor that creates timestamped backups and executes remote syntax validation (apachectl -t) before applying."
              infoWhatFa="یک ویرایشگر امن که قبل از ذخیره نهایی، بکاپ زمانی ایجاد کرده و تست سینتکس (apachectl -t) را اجرا می‌کند؛ در صورت بروز خطا فوراً رول‌بک می‌نماید."
              infoWhyEn="Completely prevents server downtime caused by typo errors or syntax mismatches in Apache directives."
              infoWhyFa="از خاموش شدن یا داون شدن سرور در اثر خطاهای تایپی در دایرکتیوهای آپاچی کاملاً پیشگیری می‌کند."
              infoExampleEn="apachectl -t → Syntax OK → systemctl reload apache2"
              infoExampleFa="apachectl -t → Syntax OK → systemctl reload apache2"
              isEn={isEn}
              isLightMode={isLightMode}
            />

            <button
              type="button"
              onClick={onMinimize}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-300 text-slate-600 hover:bg-slate-200'
                  : 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title={isEn ? 'Minimize' : 'مینیمایز'}
            >
              <Minus className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-300 text-slate-600 hover:bg-slate-200'
                  : 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title={isMaximized ? (isEn ? 'Restore' : 'اندازه عادی') : isEn ? 'Maximize' : 'تمام‌صفحه'}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition cursor-pointer"
              title={isEn ? 'Close' : 'بستن'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* TOOLBAR                                                  */}
        {/* ======================================================== */}
        <div
          className={`px-4 sm:px-6 py-2.5 border-b flex items-center justify-between flex-wrap gap-2 text-xs shrink-0 ${
            isLightMode ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-900/40 border-slate-800/80'
          }`}
        >
          {/* Left: View Mode Switches */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setViewMode('editor')}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                viewMode === 'editor'
                  ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-200'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>{isEn ? 'Editor' : 'ویرایشگر'}</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('diff')}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                viewMode === 'diff'
                  ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-200'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              <span>{isEn ? 'Visual Diff' : 'مقایسه تغییرات'}</span>
              {isDirty && (
                <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-black/20 text-white font-bold">
                  +{diffStats.added} -{diffStats.removed}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setViewMode('backups');
                fetchBackupsList();
              }}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                viewMode === 'backups'
                  ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-200'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>{isEn ? 'Versioned Backups' : 'نسخه‌های پشتیبان'}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-black/20 font-bold">
                {backups.length}
              </span>
            </button>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Copy button */}
            <button
              type="button"
              onClick={handleCopyContent}
              className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1 transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-300 text-slate-700 hover:bg-slate-200'
                  : 'border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
              title={isEn ? 'Copy configuration text' : 'کپی متن پیکربندی'}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? (isEn ? 'Copied' : 'کپی شد') : isEn ? 'Copy' : 'کپی'}</span>
            </button>

            {/* Reset button */}
            {isDirty && (
              <button
                type="button"
                onClick={handleReset}
                className="px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 flex items-center gap-1 transition cursor-pointer"
                title={isEn ? 'Reset draft to remote file content' : 'بازنشانی تغییرات به نسخه ریموت'}
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>{isEn ? 'Reset' : 'بازنشانی'}</span>
              </button>
            )}

            {/* Remote Syntax Test Button */}
            <button
              type="button"
              onClick={handleTestSyntax}
              disabled={testing || loading}
              className="px-3 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              title={isEn ? 'Run remote apachectl -t syntax test' : 'اجرای تست سینتکس apachectl -t بر روی سرور'}
            >
              {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              <span>{testing ? (isEn ? 'Testing...' : 'در حال بررسی...') : isEn ? 'Test Syntax' : 'تست سینتکس'}</span>
            </button>

            {/* Auto Reload Toggle */}
            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none px-2 py-1 rounded bg-black/20">
              <input
                type="checkbox"
                checked={autoReload}
                onChange={(e) => setAutoReload(e.target.checked)}
                className="rounded border-slate-700 text-amber-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
              <span className="text-[11px] text-slate-400 font-mono">
                {isEn ? 'Auto-reload' : 'لود خودکار'}
              </span>
            </label>

            {/* Safe Save & Apply Button */}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading || !isDirty}
              className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer disabled:opacity-40"
              title={isEn ? 'Save with backup and atomic rollback' : 'ذخیره ایمن با بکاپ و رول‌بک خودکار'}
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>
                {saving
                  ? isEn
                    ? 'Verifying & Saving...'
                    : 'در حال اعتبارسنجی و ذخیره...'
                  : isEn
                  ? 'Save & Apply Safe'
                  : 'ذخیره و اعمال ایمن'}
              </span>
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* NOTICES & SYNTAX TEST / SAVE RESULTS BANNERS             */}
        {/* ======================================================== */}
        {testResult && (
          <div
            className={`px-4 sm:px-6 py-2.5 border-b flex items-start gap-2.5 text-xs ${
              testResult.isValid
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}
          >
            {testResult.isValid ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 overflow-hidden font-mono">
              <div className="font-bold flex items-center gap-2">
                <span>
                  {testResult.isValid
                    ? isEn
                      ? 'Syntax Test Passed (Syntax OK)'
                      : 'تست سینتکس با موفقیت تایید شد (Syntax OK)'
                    : isEn
                    ? 'Syntax Test Failed'
                    : 'خطا در سینتکس کانفیگ آپاچی'}
                </span>
                <button
                  type="button"
                  onClick={() => setTestResult(null)}
                  className="text-slate-400 hover:text-white text-[11px] underline cursor-pointer ml-auto"
                >
                  {isEn ? 'Dismiss' : 'بستن'}
                </button>
              </div>
              <pre className="mt-1 whitespace-pre-wrap text-[11px] max-h-24 overflow-y-auto leading-relaxed opacity-90">
                {testResult.output}
              </pre>
            </div>
          </div>
        )}

        {saveResult && (
          <div
            className={`px-4 sm:px-6 py-3 border-b flex items-start gap-2.5 text-xs ${
              saveResult.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}
          >
            {saveResult.success ? (
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 overflow-hidden font-mono">
              <div className="font-bold text-sm flex items-center gap-2">
                <span>
                  {saveResult.success
                    ? isEn
                      ? 'Configuration Safely Applied'
                      : 'پیکربندی با موفقیت و ایمنی کامل اعمال گردید'
                    : isEn
                    ? 'Atomic Rollback Triggered — Changes Reverted'
                    : 'رول‌بک خودکار فعال شد — تغییرات به حالت قبلی بازگردانده شدند'}
                </span>
                <button
                  type="button"
                  onClick={() => setSaveResult(null)}
                  className="text-slate-400 hover:text-white text-xs underline cursor-pointer ml-auto"
                >
                  {isEn ? 'Dismiss' : 'بستن'}
                </button>
              </div>
              <div className="mt-1 text-xs opacity-90">
                {saveResult.backupCreated && (
                  <div>
                    {isEn ? 'Timestamped Backup: ' : 'بکاپ زمان‌بندی‌شده: '}
                    <span className="text-amber-300">{saveResult.backupCreated}</span>
                  </div>
                )}
                {saveResult.serviceReloaded && (
                  <div className="text-emerald-400">
                    {isEn ? '✓ Apache service gracefully reloaded with zero downtime' : '✓ سرویس آپاچی بدون قطعی ریلود گردید'}
                  </div>
                )}
                {saveResult.error && <div className="text-red-300 font-bold mt-1">{saveResult.error}</div>}
              </div>
              {saveResult.syntaxOutput && (
                <pre className="mt-1.5 whitespace-pre-wrap text-[11px] max-h-24 overflow-y-auto leading-relaxed p-2 rounded bg-black/40">
                  {saveResult.syntaxOutput}
                </pre>
              )}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* MAIN BODY AREA                                           */}
        {/* ======================================================== */}
        <div className="flex-1 overflow-hidden relative">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center space-y-3 text-slate-400">
              <RefreshCw className="w-7 h-7 animate-spin text-amber-400" />
              <div className="text-xs font-mono">
                {isEn ? 'Reading configuration from remote server...' : 'در حال خواندن فایل پیکربندی از سرور...'}
              </div>
            </div>
          ) : viewMode === 'editor' ? (
            /* CODE EDITOR VIEW */
            <div className="h-full flex flex-col">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                spellCheck={false}
                className={`w-full h-full p-4 font-mono text-xs leading-relaxed resize-none focus:outline-none transition ${
                  isLightMode
                    ? 'bg-slate-50 text-slate-900 border-none'
                    : 'bg-slate-950 text-slate-100 border-none'
                }`}
                placeholder={isEn ? '# Apache configuration directives...' : '# دایرکتیوهای پیکربندی آپاچی...'}
              />
            </div>
          ) : viewMode === 'diff' ? (
            /* VISUAL DIFF VIEW */
            <div className="h-full overflow-y-auto font-mono text-xs leading-relaxed p-4 space-y-0.5">
              <div className="mb-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center justify-between text-xs">
                <span>
                  {isEn
                    ? `Comparing Current Draft with Remote Server Original (${diffStats.added} additions, ${diffStats.removed} deletions)`
                    : `مقایسه پیش‌نویس با نسخه ریموت (${diffStats.added} افزودن، ${diffStats.removed} حذف)`}
                </span>
                <button
                  type="button"
                  onClick={() => setViewMode('editor')}
                  className="px-2.5 py-1 rounded bg-amber-500 text-slate-950 font-bold cursor-pointer"
                >
                  {isEn ? 'Return to Editor' : 'بازگشت به ویرایشگر'}
                </button>
              </div>

              {diffLines.map((line, idx) => (
                <div
                  key={idx}
                  className={`flex items-start px-2 py-0.5 rounded select-text ${
                    line.type === 'added'
                      ? 'bg-emerald-500/20 text-emerald-300 border-l-2 border-emerald-500'
                      : line.type === 'removed'
                      ? 'bg-red-500/20 text-red-300 border-l-2 border-red-500'
                      : 'text-slate-400 hover:bg-white/5'
                  }`}
                >
                  <span className="w-12 text-slate-600 text-right pr-3 select-none shrink-0 text-[10px]">
                    {line.oldNum || ''}
                  </span>
                  <span className="w-12 text-slate-600 text-right pr-3 select-none shrink-0 text-[10px]">
                    {line.newNum || ''}
                  </span>
                  <span className="w-4 select-none shrink-0 font-bold">
                    {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                  </span>
                  <span className="whitespace-pre-wrap break-all flex-1">{line.content}</span>
                </div>
              ))}
            </div>
          ) : (
            /* VERSIONED BACKUPS VIEW */
            <div className="h-full overflow-y-auto p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm flex items-center gap-2">
                    <History className="w-4 h-4 text-amber-400" />
                    <span>{isEn ? 'Timestamped Configuration Backups' : 'نسخه‌های پشتیبان زمان‌بندی‌شده'}</span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">
                    {isEn
                      ? 'Stored safely under /var/backups/nettopology_apache/ before every write'
                      : 'ذخیره‌شده در /var/backups/nettopology_apache/ قبل از هرگونه تغییر'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fetchBackupsList}
                  disabled={loadingBackups}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs flex items-center gap-1.5 cursor-pointer hover:bg-slate-800"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingBackups ? 'animate-spin' : ''}`} />
                  <span>{isEn ? 'Refresh Backups' : 'بروزرسانی بکاپ‌ها'}</span>
                </button>
              </div>

              {backups.length === 0 ? (
                <div className="p-8 rounded-xl border border-dashed border-slate-800 text-center text-xs text-slate-400">
                  {isEn
                    ? 'No backups found for this file yet. A backup is created automatically upon first save.'
                    : 'هنوز نسخه پشتیبانی برای این فایل ثبت نشده است. در اولین ذخیره، بکاپ به صورت خودکار ایجاد می‌شود.'}
                </div>
              ) : (
                <div className="space-y-2">
                  {backups.map((bk) => (
                    <div
                      key={bk.id}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs font-mono ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <div className="truncate">
                        <div className="font-bold text-slate-200 truncate">{bk.id}</div>
                        <div className="text-[11px] text-slate-400 truncate mt-0.5">
                          {bk.backupPath} • {bk.sizeHuman} • {new Date(bk.timestamp).toLocaleString()}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleRestoreBackup(bk.backupPath)}
                          disabled={restoringBackup === bk.backupPath}
                          className="px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {restoringBackup === bk.backupPath ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {restoringBackup === bk.backupPath
                              ? isEn
                                ? 'Restoring...'
                                : 'در حال بازیابی...'
                              : isEn
                              ? 'Restore Backup'
                              : 'بازیابی این نسخه'}
                          </span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* FOOTER BAR                                               */}
        {/* ======================================================== */}
        <div
          className={`px-4 sm:px-6 py-2.5 border-t flex items-center justify-between text-xs font-mono shrink-0 select-none ${
            isLightMode ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-slate-900/80 border-slate-800 text-slate-400'
          }`}
        >
          <div className="flex items-center gap-3 truncate">
            <span>
              {isEn ? 'Status: ' : 'وضعیت: '}
              <strong className={isDirty ? 'text-amber-400' : 'text-emerald-400'}>
                {isDirty ? (isEn ? 'Unsaved changes' : 'تغییرات ذخیره‌نشده') : isEn ? 'Synced with remote' : 'همگام با سرور'}
              </strong>
            </span>
            <span>•</span>
            <span>{lineCount} lines</span>
            <span>•</span>
            <span>{content.length} characters</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              {isEn ? 'Close' : 'بستن'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
