import React, { useState, useEffect, useMemo } from 'react';
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
  Edit3,
  HardDrive,
  Download,
  AlertTriangle,
  Play,
  Save,
} from 'lucide-react';
import {
  RemoteServer,
  NginxConfigFileBackup,
  NginxEditorSaveResult,
  NginxEditorTestResult,
} from '../../types';
import {
  readNginxFile,
  testNginxFileCandidate,
  saveNginxFileSafe,
  fetchNginxFileBackups,
  restoreNginxFileBackup,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface NginxSafeEditorModalProps {
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
 * Computes line-by-line difference between original and modified text
 */
function computeLineDiff(originalText: string, newText: string): DiffLine[] {
  const origLines = originalText.split('\n');
  const newLines = newText.split('\n');

  // Fast path for identical content
  if (originalText === newText) {
    return origLines.map((line, idx) => ({
      type: 'unchanged',
      content: line,
      oldNum: idx + 1,
      newNum: idx + 1,
    }));
  }

  // Simple LCS line diff
  const n = origLines.length;
  const m = newLines.length;

  // If file is very large (> 2000 lines), use chunk-based diff to prevent UI stall
  if (n * m > 1000000) {
    // Basic line mapping
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

  // Dynamic programming LCS table
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

  // Backtrack to build diff
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

export const NginxSafeEditorModal: React.FC<NginxSafeEditorModalProps> = ({
  isOpen,
  server,
  filePath,
  initialContent,
  sessionPassword,
  onClose,
  onMinimize,
  onSaved,
  isLightMode = false,
  isEn = false,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [activeView, setActiveView] = useState<'editor' | 'diff' | 'backups'>('editor');

  // Content states
  const [originalContent, setOriginalContent] = useState('');
  const [editedContent, setEditedContent] = useState('');
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [fileSizeBytes, setFileSizeBytes] = useState<number>(0);
  const [lastModified, setLastModified] = useState<string | null>(null);

  // Testing & Saving states
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<NginxEditorTestResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<NginxEditorSaveResult | null>(null);
  const [autoReload, setAutoReload] = useState(true);

  // Backups timeline
  const [backups, setBackups] = useState<NginxConfigFileBackup[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [restoringBackupId, setRestoringBackupId] = useState<string | null>(null);

  const [copiedCode, setCopiedCode] = useState(false);

  const isDirty = editedContent !== originalContent;

  // Load raw content when modal opens or filePath changes
  useEffect(() => {
    if (!isOpen || !server || !filePath) return;

    if (initialContent !== undefined) {
      setOriginalContent(initialContent);
      setEditedContent(initialContent);
    }

    const loadContent = async () => {
      setIsLoadingFile(true);
      setTestResult(null);
      setSaveResult(null);
      try {
        const res = await readNginxFile(server.id, filePath, sessionPassword || server.ssh_password);
        if (res.success) {
          setOriginalContent(res.content);
          setEditedContent(res.content);
          setFileSizeBytes(res.sizeBytes);
          setLastModified(res.lastModified || null);
        }
      } catch (err) {
        console.error('Failed to read config file:', err);
      } finally {
        setIsLoadingFile(false);
      }
    };

    loadContent();
  }, [isOpen, server, filePath, initialContent, sessionPassword]);

  // Load backups when backups view is selected
  useEffect(() => {
    if (!isOpen || !server || !filePath || activeView !== 'backups') return;

    const loadBackups = async () => {
      setIsLoadingBackups(true);
      try {
        const res = await fetchNginxFileBackups(server.id, filePath, sessionPassword || server.ssh_password);
        if (res.success) {
          setBackups(res.backups);
        }
      } catch (err) {
        console.error('Failed to load file backups:', err);
      } finally {
        setIsLoadingBackups(false);
      }
    };

    loadBackups();
  }, [isOpen, server, filePath, activeView, sessionPassword]);

  // Computed line diff
  const diffLines = useMemo(() => {
    if (activeView !== 'diff') return [];
    return computeLineDiff(originalContent, editedContent);
  }, [originalContent, editedContent, activeView]);

  const diffCounts = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const d of diffLines) {
      if (d.type === 'added') added++;
      if (d.type === 'removed') removed++;
    }
    return { added, removed };
  }, [diffLines]);

  if (!isOpen || !server || !filePath) return null;

  // Handle isolated syntax test
  const handleTestSyntax = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testNginxFileCandidate(
        server.id,
        filePath,
        editedContent,
        sessionPassword || server.ssh_password
      );
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        isValid: false,
        output: err?.message || 'Syntax test exception',
        error: err?.message || 'Verification failed',
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Handle safe atomic save
  const handleSaveSafe = async () => {
    setIsSaving(true);
    setSaveResult(null);
    try {
      const res = await saveNginxFileSafe(
        server.id,
        filePath,
        editedContent,
        autoReload,
        sessionPassword || server.ssh_password
      );
      setSaveResult(res);
      if (res.success) {
        setOriginalContent(editedContent);
        onSaved(filePath);
      }
    } catch (err: any) {
      setSaveResult({
        success: false,
        filePath,
        syntaxTestPassed: false,
        syntaxOutput: err?.message || 'Save exception',
        serviceReloaded: false,
        error: err?.message || 'Save failed',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle restoring a backup
  const handleRestoreBackup = async (backup: NginxConfigFileBackup) => {
    const confirmMsg = isEn
      ? `Restore this configuration file from backup dated ${new Date(backup.timestamp).toLocaleString()}?`
      : `آیا از بازگردانی این فایل کانفیگ از روی نسخه پشتیبان تاریخ ${new Date(backup.timestamp).toLocaleString('fa-IR')} اطمینان دارید؟`;

    if (!window.confirm(confirmMsg)) return;

    setRestoringBackupId(backup.id);
    try {
      const res = await restoreNginxFileBackup(
        server.id,
        filePath,
        backup.backupPath,
        autoReload,
        sessionPassword || server.ssh_password
      );
      if (res.success) {
        // Re-read file content
        const readRes = await readNginxFile(server.id, filePath, sessionPassword || server.ssh_password);
        if (readRes.success) {
          setOriginalContent(readRes.content);
          setEditedContent(readRes.content);
        }
        onSaved(filePath);
        setActiveView('editor');
        alert(isEn ? 'Configuration restored and verified successfully.' : 'کانفیگ با موفقیت بازیابی و اعتبارسنجی شد.');
      } else {
        alert(res.error || (isEn ? 'Failed to restore backup' : 'خطا در بازیابی نسخه پشتیبان'));
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to restore backup');
    } finally {
      setRestoringBackupId(null);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(editedContent);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleDownloadFile = () => {
    const blob = new Blob([editedContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filePath.split('/').pop() || 'nginx.conf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed top-0 left-0 right-0 bottom-8 z-[999996] flex items-center justify-center p-3 sm:p-5 bg-black/65 backdrop-blur-xs transition-all"
    >
      <div
        className={`w-full flex flex-col rounded-2xl border shadow-2xl transition-all overflow-hidden ${
          isMaximized ? 'h-full max-w-full rounded-none border-none' : 'max-w-5xl max-h-[94vh] h-[85vh]'
        } ${
          isLightMode
            ? 'bg-white border-slate-300 text-slate-800'
            : 'bg-slate-950 border-slate-800 text-slate-100'
        }`}
      >
        {/* ======================================================== */}
        {/* HEADER: Title, File info & Control Trio (Close, Min, Max) */}
        {/* ======================================================== */}
        <div
          className={`flex items-center justify-between px-5 py-3 border-b select-none shrink-0 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <FileCode className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold flex items-center gap-2 truncate">
                <span>{isEn ? 'Safe Nginx Configuration Editor' : 'ویرایشگر امن و اتمیک پیکربندی Nginx'}</span>
                {isDirty && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {isEn ? 'Modified' : 'تغییریافته'}
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                {filePath} {fileSizeBytes > 0 && `• ${(fileSizeBytes / 1024).toFixed(1)} KB`}
                {lastModified && ` • ${new Date(lastModified).toLocaleTimeString()}`}
              </p>
            </div>
          </div>

          {/* Right Action Icons & Control Trio */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleCopyCode}
              title={isEn ? 'Copy Configuration' : 'کپی متن کانفیگ'}
              className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 transition cursor-pointer"
            >
              {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={handleDownloadFile}
              title={isEn ? 'Download Configuration File' : 'دانلود فایل کانفیگ'}
              className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
            </button>

            <div className="h-4 w-px bg-slate-700 mx-1" />

            {/* Control Trio */}
            <button
              type="button"
              onClick={onMinimize}
              title={isEn ? 'Minimize' : 'کوچک‌سازی'}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode ? 'border-slate-300 hover:bg-slate-200 text-slate-600' : 'border-slate-700 hover:bg-slate-800 text-slate-300'
              }`}
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isEn ? 'Fullscreen' : 'تمام‌صفحه'}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode ? 'border-slate-300 hover:bg-slate-200 text-slate-600' : 'border-slate-700 hover:bg-slate-800 text-slate-300'
              }`}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Close' : 'بستن'}
              className="p-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* SUBHEADER: View Mode Tabs (Editor, Diff, Backups)        */}
        {/* ======================================================== */}
        <div
          className={`flex items-center justify-between border-b px-5 py-2 select-none text-xs shrink-0 ${
            isLightMode ? 'bg-slate-100/80 border-slate-200' : 'bg-slate-900/60 border-slate-800'
          }`}
        >
          {/* View Mode Toggle */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveView('editor')}
              className={`px-3 py-1 rounded-lg font-medium flex items-center gap-1.5 transition cursor-pointer ${
                activeView === 'editor'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-xs'
                  : isLightMode
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isEn ? 'Editor' : 'ویرایشگر کد'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView('diff')}
              className={`px-3 py-1 rounded-lg font-medium flex items-center gap-1.5 transition cursor-pointer ${
                activeView === 'diff'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-xs'
                  : isLightMode
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              <span>{isEn ? 'Diff Viewer' : 'پیش‌نمایش تغییرات (Diff)'}</span>
              {isDirty && (
                <span className="flex items-center gap-1 text-[10px] font-mono ml-0.5">
                  <span className="text-emerald-400 font-bold">+{diffCounts.added}</span>
                  <span className="text-rose-400 font-bold">-{diffCounts.removed}</span>
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveView('backups')}
              className={`px-3 py-1 rounded-lg font-medium flex items-center gap-1.5 transition cursor-pointer ${
                activeView === 'backups'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-xs'
                  : isLightMode
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>{isEn ? 'Backups & Rollback' : 'نسخه‌های پشتیبان و بازگردانی'}</span>
              {backups.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300 font-mono">
                  {backups.length}
                </span>
              )}
            </button>
          </div>

          {/* Quick Reset Button if Dirty */}
          {isDirty && activeView === 'editor' && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(isEn ? 'Discard all unsaved edits?' : 'آیا تغییرات اعمال‌نشده لغو شوند؟')) {
                  setEditedContent(originalContent);
                }
              }}
              className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isEn ? 'Reset Changes' : 'بازنشانی تغییرات'}</span>
            </button>
          )}
        </div>

        {/* ======================================================== */}
        {/* MAIN BODY: Active View                                   */}
        {/* ======================================================== */}
        <div className="flex-1 overflow-hidden flex flex-col p-4">
          {isLoadingFile ? (
            <div className="flex-1 flex flex-col items-center justify-center text-xs text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-400 mb-2" />
              <span>{isEn ? 'Reading configuration from server...' : 'در حال خواندن فایل از سرور...'}</span>
            </div>
          ) : activeView === 'editor' ? (
            /* EDITOR MODE */
            <div className="flex-1 flex flex-col rounded-xl border border-slate-800 bg-slate-950 overflow-hidden font-mono text-xs">
              <div className="flex-1 relative flex overflow-hidden">
                {/* Line Numbers Gutter */}
                <div className="w-12 py-3 bg-slate-900/80 text-slate-600 text-right pr-2.5 select-none shrink-0 overflow-hidden font-mono text-[11px] leading-relaxed">
                  {editedContent.split('\n').map((_, idx) => (
                    <div key={idx}>{idx + 1}</div>
                  ))}
                </div>

                {/* Editor Textarea */}
                <textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  placeholder={isEn ? 'Nginx configuration directives...' : 'دایرکتیوهای کانفیگ Nginx...'}
                  spellCheck={false}
                  className="flex-1 p-3 bg-transparent text-emerald-300 font-mono text-xs focus:outline-none resize-none leading-relaxed overflow-auto whitespace-pre tab-4"
                />
              </div>
            </div>
          ) : activeView === 'diff' ? (
            /* DIFF VIEWER MODE */
            <div className="flex-1 flex flex-col rounded-xl border border-slate-800 bg-slate-950 overflow-hidden font-mono text-xs">
              <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between text-[11px] text-slate-400">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>+{diffCounts.added} {isEn ? 'added' : 'افزوده شده'}</span>
                  </span>
                  <span className="flex items-center gap-1 text-rose-400">
                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                    <span>-{diffCounts.removed} {isEn ? 'removed' : 'حذف شده'}</span>
                  </span>
                </div>
                <span>{isEn ? 'Line-by-Line Changes' : 'مقایسه خط به خط با فایل اصلی'}</span>
              </div>

              <div className="flex-1 overflow-auto p-2 font-mono text-xs leading-relaxed space-y-0.5">
                {diffLines.length === 0 || (!diffCounts.added && !diffCounts.removed) ? (
                  <div className="p-8 text-center text-slate-400">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                    <span>{isEn ? 'No modifications made yet. File is identical to server version.' : 'هیچ تغییری اعمال نشده است. فایل با نسخه سرور یکسان است.'}</span>
                  </div>
                ) : (
                  diffLines.map((line, idx) => (
                    <div
                      key={idx}
                      className={`flex items-start px-2 py-0.5 rounded font-mono text-xs ${
                        line.type === 'added'
                          ? 'bg-emerald-500/15 text-emerald-300 border-l-2 border-emerald-500'
                          : line.type === 'removed'
                          ? 'bg-rose-500/15 text-rose-300 border-l-2 border-rose-500'
                          : 'text-slate-400'
                      }`}
                    >
                      <span className="w-8 text-right pr-2 text-slate-600 select-none text-[10px] shrink-0">
                        {line.oldNum || ''}
                      </span>
                      <span className="w-8 text-right pr-2 text-slate-600 select-none text-[10px] shrink-0">
                        {line.newNum || ''}
                      </span>
                      <span className="w-4 select-none font-bold shrink-0">
                        {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                      </span>
                      <span className="whitespace-pre-wrap break-all flex-1">{line.content || ' '}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            /* BACKUPS TIMELINE MODE */
            <div className="flex-1 flex flex-col rounded-xl border border-slate-800 bg-slate-950 overflow-hidden p-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                <div>
                  <h4 className="text-xs font-bold text-slate-200">
                    {isEn ? 'Automated Backups Timeline' : 'تاریخچه نسخه‌های پشتیبان خودکار'}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    {isEn
                      ? 'Every safe save automatically preserves a timestamped snapshot for one-click rollback.'
                      : 'پیش از هر ویرایش امن، یک کپی پشتیبان با تاریخ مشخص ذخیره می‌شود تا بتوانید آن را با یک کلیک بازگردانید.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    setIsLoadingBackups(true);
                    try {
                      const res = await fetchNginxFileBackups(server.id, filePath, sessionPassword || server.ssh_password);
                      if (res.success) setBackups(res.backups);
                    } finally {
                      setIsLoadingBackups(false);
                    }
                  }}
                  disabled={isLoadingBackups}
                  className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBackups ? 'animate-spin' : ''}`} />
                  <span>{isEn ? 'Refresh' : 'بروزرسانی'}</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {isLoadingBackups ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-400" />
                    <span>{isEn ? 'Scanning backups...' : 'در حال اسکن فایل‌های پشتیبان...'}</span>
                  </div>
                ) : backups.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    <History className="w-6 h-6 text-slate-500 mx-auto mb-2" />
                    <span>{isEn ? 'No previous backups found for this file.' : 'هیچ نسخه پشتیبانی برای این فایل یافت نشد.'}</span>
                  </div>
                ) : (
                  backups.map((b) => (
                    <div
                      key={b.id}
                      className="p-3 rounded-xl border border-slate-800/80 bg-slate-900/60 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <HardDrive className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="font-mono text-slate-200 font-bold truncate">{b.id}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                            {b.sizeHuman}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono">
                          {new Date(b.timestamp).toLocaleString(isEn ? 'en-US' : 'fa-IR')}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRestoreBackup(b)}
                        disabled={restoringBackupId === b.id}
                        className="px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {restoringBackupId === b.id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3.5 h-3.5" />
                        )}
                        <span>{isEn ? 'Restore This Version' : 'بازگردانی این نسخه'}</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Test & Save Notifications */}
          {testResult && (
            <div
              className={`mt-3 p-3 rounded-xl border text-xs flex items-start gap-2.5 shrink-0 ${
                testResult.isValid
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
              }`}
            >
              {testResult.isValid ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5 min-w-0">
                <strong className="block font-bold">
                  {testResult.isValid
                    ? isEn ? 'Syntax Test Passed (OK)' : 'صحت سینتکس تأیید شد (OK)'
                    : isEn ? 'Syntax Test Error' : 'خطای سینتکس در تست ایزوله'}
                </strong>
                <pre className="font-mono text-[11px] whitespace-pre-wrap opacity-90 max-h-24 overflow-y-auto">
                  {testResult.output}
                </pre>
              </div>
            </div>
          )}

          {saveResult && (
            <div
              className={`mt-3 p-3 rounded-xl border text-xs flex items-start gap-2.5 shrink-0 ${
                saveResult.success
                  ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
                  : 'border-rose-500/50 bg-rose-500/15 text-rose-200'
              }`}
            >
              {saveResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5 min-w-0">
                <strong className="block font-bold">
                  {saveResult.success
                    ? isEn ? 'Configuration Successfully Saved & Deployed!' : 'پیکربندی با موفقیت ذخیره و اعمال شد!'
                    : isEn ? 'Save Rejected (Automatic Rollback Executed)' : 'استقرار متوقف شد (رول‌بک خودکار انجام گردید)'}
                </strong>
                {saveResult.backupCreated && (
                  <p className="font-mono text-[11px] opacity-80">
                    Backup: {saveResult.backupCreated}
                  </p>
                )}
                {saveResult.serviceReloaded && (
                  <p className="text-emerald-400 font-medium text-[11px]">
                    ✓ {isEn ? 'Nginx service reloaded seamlessly.' : 'سرویس Nginx بدون داون‌تایم ریلود شد.'}
                  </p>
                )}
                {saveResult.error && (
                  <p className="text-rose-400 font-mono text-[11px]">{saveResult.error}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* FOOTER: Auto-reload option, Test Syntax & Safe Save      */}
        {/* ======================================================== */}
        <div
          className={`flex items-center justify-between px-5 py-3 border-t select-none shrink-0 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          {/* Left: Auto-reload toggle */}
          <label className="flex items-center gap-2 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={autoReload}
              onChange={(e) => setAutoReload(e.target.checked)}
              className="rounded accent-emerald-500 w-4 h-4 cursor-pointer"
            />
            <span className="text-slate-300">
              {isEn ? 'Auto-reload Nginx on save' : 'ریلود خودکار Nginx پس از ذخیره موفق'}
            </span>
            <FieldInfoTooltip
              fieldName="Auto Reload"
              infoWhatEn="Reloads the Nginx master process with zero downtime if configuration test passes."
              infoWhatFa="در صورت تأیید سلامت کانفیگ، وب‌سرور Nginx را بدون قطعی سرویس ریلود می‌کند."
              infoWhyEn="Applies changes immediately to live traffic without terminating existing connections."
              infoWhyFa="تغییرات را فوراً بر روی ترافیک زنده فعال می‌کند بدون اینکه اتصالات قبلی قطع شوند."
              infoExampleEn="systemctl reload nginx"
              infoExampleFa="systemctl reload nginx"
              isEn={isEn}
              isLightMode={isLightMode}
            />
          </label>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Test Syntax Button */}
            <button
              type="button"
              onClick={handleTestSyntax}
              disabled={isTesting || isSaving}
              className={`px-3.5 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                isLightMode
                  ? 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
                  : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-emerald-400' : ''}`} />
              <span>{isTesting ? (isEn ? 'Testing Syntax...' : 'در حال تست...') : (isEn ? 'Test Syntax' : 'تست سلامت سینتکس')}</span>
            </button>

            {/* Safe Save & Deploy Button */}
            <button
              type="button"
              onClick={handleSaveSafe}
              disabled={isSaving || isTesting || !isDirty}
              className="px-5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition shadow-md shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{isEn ? 'Verifying & Saving...' : 'در حال اعتبارسنجی و ذخیره...'}</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>{isEn ? 'Safe Save & Deploy' : 'ذخیره و استقرار امن'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
