import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Folder,
  FolderPlus,
  File,
  FilePlus,
  FileText,
  FileCode,
  FileCog,
  FileArchive,
  Terminal,
  Image as ImageIcon,
  Key,
  ShieldAlert,
  ArrowUp,
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  Search,
  Eye,
  EyeOff,
  LayoutGrid,
  List as ListIcon,
  Trash2,
  Edit2,
  Copy,
  Check,
  RotateCcw,
  ExternalLink,
  ChevronRight,
  HardDrive,
  Clock,
  Lock,
  Unlock,
  AlertTriangle,
  Info,
  Layers,
  FolderTree,
  MoreVertical,
  Download,
  Archive,
} from 'lucide-react';
import { RemoteServer, LinuxFsItem, LinuxFsListResult, LinuxQuickDir, LinuxFileContentResult } from '../../types';
import {
  fetchLinuxDirectory,
  fetchLinuxQuickDirs,
  readLinuxRemoteFile,
  writeLinuxRemoteFile,
  createLinuxRemoteDirectory,
  createLinuxRemoteEmptyFile,
  renameLinuxRemoteItem,
  deleteLinuxRemoteItem,
  downloadLinuxFiles,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface LinuxFileExplorerModalProps {
  isOpen: boolean;
  server: RemoteServer | null;
  sessionPassword?: string;
  onClose: () => void;
  onMinimize: () => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

// Helper to determine icon & color by file type and extension
function getFileIconInfo(item: LinuxFsItem) {
  if (item.type === 'directory') {
    return { icon: Folder, color: 'text-amber-400', bgColor: 'bg-amber-500/15', label: 'Directory' };
  }

  if (item.type === 'symlink') {
    return { icon: ExternalLink, color: 'text-purple-400', bgColor: 'bg-purple-500/15', label: 'Symlink' };
  }

  const ext = (item.extension || '').toLowerCase();

  // Code & Scripts
  if (['sh', 'bash', 'zsh', 'py', 'js', 'ts', 'jsx', 'tsx', 'php', 'rb', 'pl', 'go', 'rs', 'c', 'cpp', 'h'].includes(ext)) {
    return { icon: FileCode, color: 'text-emerald-400', bgColor: 'bg-emerald-500/15', label: 'Script / Code' };
  }

  // Configurations
  if (['conf', 'cfg', 'ini', 'cnf', 'env', 'service', 'yaml', 'yml', 'json', 'toml', 'xml'].includes(ext)) {
    return { icon: FileCog, color: 'text-cyan-400', bgColor: 'bg-cyan-500/15', label: 'Configuration' };
  }

  // Logs & Plain Text
  if (['log', 'txt', 'md', 'out', 'err', 'journal'].includes(ext)) {
    return { icon: FileText, color: 'text-blue-400', bgColor: 'bg-blue-500/15', label: 'Log / Text' };
  }

  // Archives & Packages
  if (['tar', 'gz', 'bz2', 'xz', 'zip', '7z', 'rar', 'deb', 'rpm', 'iso'].includes(ext)) {
    return { icon: FileArchive, color: 'text-rose-400', bgColor: 'bg-rose-500/15', label: 'Archive' };
  }

  // Keys & Certificates
  if (['key', 'pem', 'crt', 'pub', 'cer', 'pfx', 'p12', 'der'].includes(ext)) {
    return { icon: Key, color: 'text-yellow-400', bgColor: 'bg-yellow-500/15', label: 'Key / Cert' };
  }

  // Images
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp'].includes(ext)) {
    return { icon: ImageIcon, color: 'text-pink-400', bgColor: 'bg-pink-500/15', label: 'Image' };
  }

  // Binaries
  if (item.permissions.includes('x') || ['bin', 'so', 'run'].includes(ext)) {
    return { icon: Terminal, color: 'text-lime-400', bgColor: 'bg-lime-500/15', label: 'Executable' };
  }

  return { icon: File, color: 'text-slate-400', bgColor: 'bg-slate-500/15', label: 'File' };
}

// Format bytes into readable format
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export const LinuxFileExplorerModal: React.FC<LinuxFileExplorerModalProps> = ({
  isOpen,
  server,
  sessionPassword,
  onClose,
  onMinimize,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);

  // Navigation State
  const [currentPath, setCurrentPath] = useState<string>('/');
  const [pathInputValue, setPathInputValue] = useState<string>('/');
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [history, setHistory] = useState<string[]>(['/']);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // Data State
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<LinuxFsItem[]>([]);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [totalFiles, setTotalFiles] = useState<number>(0);
  const [totalDirectories, setTotalDirectories] = useState<number>(0);
  const [quickDirs, setQuickDirs] = useState<LinuxQuickDir[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [ephemeralPassword, setEphemeralPassword] = useState<string | undefined>(sessionPassword);

  // Filter and Sort
  const [searchQuery, setSearchQuery] = useState('');
  const [quickDirSearch, setQuickDirSearch] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'mtime' | 'type'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Selected Item
  const [selectedItem, setSelectedItem] = useState<LinuxFsItem | null>(null);

  // Feedback Toast
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Dialogs
  const [newDirDialog, setNewDirDialog] = useState<{ isOpen: boolean; name: string; loading: boolean; error: string | null }>({
    isOpen: false,
    name: '',
    loading: false,
    error: null,
  });

  const [newFileDialog, setNewFileDialog] = useState<{ isOpen: boolean; name: string; loading: boolean; error: string | null }>({
    isOpen: false,
    name: '',
    loading: false,
    error: null,
  });

  const [renameDialog, setRenameDialog] = useState<{
    isOpen: boolean;
    item: LinuxFsItem | null;
    newName: string;
    loading: boolean;
    error: string | null;
  }>({
    isOpen: false,
    item: null,
    newName: '',
    loading: false,
    error: null,
  });

  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    item: LinuxFsItem | null;
    isRecursive: boolean;
    loading: boolean;
    error: string | null;
  }>({
    isOpen: false,
    item: null,
    isRecursive: false,
    loading: false,
    error: null,
  });

  const [passwordModal, setPasswordModal] = useState<{ isOpen: boolean; passwordInput: string }>({
    isOpen: false,
    passwordInput: '',
  });

  // Multi-selection & Download State
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);

  // Context Menu State for Right-Click Actions
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    item: LinuxFsItem;
  } | null>(null);

  // Close context menu on window click or Escape
  useEffect(() => {
    if (!contextMenu?.isOpen) return;
    const handleClose = () => setContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('click', handleClose);
    window.addEventListener('contextmenu', handleClose);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('contextmenu', handleClose);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu?.isOpen]);

  const handleItemContextMenu = (e: React.MouseEvent, item: LinuxFsItem) => {
    e.preventDefault();
    e.stopPropagation();

    // If item was already part of multi-selection, keep selection, else select only this item
    setSelectedPaths((prev) => {
      if (prev.has(item.path) && prev.size > 1) {
        return prev;
      }
      return new Set([item.path]);
    });
    setSelectedItem(item);

    const menuWidth = 250;
    const menuHeight = 280;
    const x = Math.max(12, Math.min(e.clientX, window.innerWidth - menuWidth - 12));
    const y = Math.max(12, Math.min(e.clientY, window.innerHeight - menuHeight - 12));
    setContextMenu({
      isOpen: true,
      x,
      y,
      item,
    });
  };

  const handleDownload = async (pathsToDownload?: string[], forceArchive: boolean = false) => {
    if (!server) return;
    const paths =
      pathsToDownload && pathsToDownload.length > 0
        ? pathsToDownload
        : selectedPaths.size > 0
        ? Array.from(selectedPaths)
        : selectedItem
        ? [selectedItem.path]
        : [];

    if (paths.length === 0) return;

    try {
      setIsDownloading(true);
      setDownloadNotice(
        isEn
          ? paths.length > 1 || forceArchive
            ? 'Archiving and downloading ZIP...'
            : 'Downloading file...'
          : paths.length > 1 || forceArchive
          ? 'در حال فشرده‌سازی و دانلود فایل ZIP...'
          : 'در حال دریافت فایل...'
      );
      const res = await downloadLinuxFiles(
        server.id,
        paths,
        ephemeralPassword || sessionPassword,
        forceArchive || paths.length > 1
      );
      if (!res.success) {
        setDownloadNotice(res.error || (isEn ? 'Download failed' : 'خطا در دانلود'));
        setTimeout(() => setDownloadNotice(null), 4000);
      } else {
        setDownloadNotice(isEn ? 'Download started' : 'دانلود با موفقیت آغاز شد');
        setTimeout(() => setDownloadNotice(null), 2500);
      }
    } catch (err: any) {
      setDownloadNotice(err?.message || (isEn ? 'Download error' : 'خطا در دانلود'));
      setTimeout(() => setDownloadNotice(null), 4000);
    } finally {
      setIsDownloading(false);
      setContextMenu(null);
    }
  };

  const pathInputRef = useRef<HTMLInputElement>(null);

  // Show Toast
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setFeedback({ message, type });
    setTimeout(() => setFeedback(null), 4000);
  }, []);

  // Fetch Quick Dirs on mount
  useEffect(() => {
    if (!isOpen || !server) return;
    let mounted = true;
    fetchLinuxQuickDirs(server.id)
      .then((res) => {
        if (mounted && res.success && res.quickDirs) {
          setQuickDirs(res.quickDirs);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [isOpen, server]);

  // Load Directory Items
  const loadDirectory = useCallback(
    async (targetPath: string, customPassword?: string, updateHistory = true) => {
      if (!server) return;
      setLoading(true);
      setError(null);
      setSelectedItem(null);
      setSelectedPaths(new Set());

      const pwdToUse = customPassword !== undefined ? customPassword : ephemeralPassword;

      try {
        const res = await fetchLinuxDirectory(server.id, targetPath, pwdToUse);
        if (res.success && res.result) {
          setCurrentPath(res.result.currentPath);
          setPathInputValue(res.result.currentPath);
          setParentPath(res.result.parentPath);
          setItems(res.result.items || []);
          setTotalFiles(res.result.totalFiles || 0);
          setTotalDirectories(res.result.totalDirectories || 0);
          setRequiresPassword(false);
          setError(null);

          if (updateHistory) {
            setHistory((prev) => {
              const sliced = prev.slice(0, historyIndex + 1);
              if (sliced[sliced.length - 1] !== res.result!.currentPath) {
                const next = [...sliced, res.result!.currentPath];
                setHistoryIndex(next.length - 1);
                return next;
              }
              return sliced;
            });
          }
        } else {
          if (res.requires_password) {
            setRequiresPassword(true);
            setPasswordModal({ isOpen: true, passwordInput: '' });
          }
          setError(res.error || (isEn ? 'Failed to read directory' : 'خطا در خواندن محتویات دایرکتوری'));
        }
      } catch (err: any) {
        setError(err?.message || (isEn ? 'Connection error' : 'خطای ارتباط با سرور'));
      } finally {
        setLoading(false);
      }
    },
    [server, ephemeralPassword, historyIndex, isEn]
  );

  // Trigger load when modal opens or server changes
  useEffect(() => {
    if (isOpen && server) {
      loadDirectory(currentPath, ephemeralPassword, false);
    }
  }, [isOpen, server]);

  // Handle Back and Forward
  const handleGoBack = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const target = history[newIndex];
      setHistoryIndex(newIndex);
      loadDirectory(target, ephemeralPassword, false);
    }
  };

  const handleGoForward = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const target = history[newIndex];
      setHistoryIndex(newIndex);
      loadDirectory(target, ephemeralPassword, false);
    }
  };

  // Handle Navigate Up
  const handleGoUp = () => {
    if (parentPath && parentPath !== currentPath) {
      loadDirectory(parentPath, ephemeralPassword, true);
    }
  };

  // Handle Direct Path Submit
  const handlePathSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsEditingPath(false);
    let target = pathInputValue.trim();
    if (!target) target = '/';
    if (!target.startsWith('/')) target = '/' + target;
    loadDirectory(target, ephemeralPassword, true);
  };

  // Handle Item Click (with Ctrl/Meta multi-selection support)
  const handleItemClick = (item: LinuxFsItem, e?: React.MouseEvent) => {
    if (e && (e.ctrlKey || e.metaKey)) {
      setSelectedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(item.path)) {
          next.delete(item.path);
        } else {
          next.add(item.path);
        }
        return next;
      });
      setSelectedItem(item);
    } else {
      setSelectedPaths(new Set([item.path]));
      setSelectedItem(item);
    }
  };

  const handleItemDoubleClick = (item: LinuxFsItem) => {
    if (item.type === 'directory') {
      loadDirectory(item.path, ephemeralPassword, true);
    } else {
      setSelectedItem(item);
    }
  };

  // Create Directory
  const handleCreateDirectory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!server || !newDirDialog.name.trim()) return;
    setNewDirDialog((prev) => ({ ...prev, loading: true, error: null }));

    const targetDir =
      currentPath === '/'
        ? `/${newDirDialog.name.trim()}`
        : `${currentPath}/${newDirDialog.name.trim()}`;

    try {
      const res = await createLinuxRemoteDirectory(server.id, targetDir, ephemeralPassword);
      if (res.success) {
        setNewDirDialog({ isOpen: false, name: '', loading: false, error: null });
        showToast(
          isEn ? `Directory created: ${newDirDialog.name.trim()}` : `پوشه جدید ایجاد شد: ${newDirDialog.name.trim()}`,
          'success'
        );
        loadDirectory(currentPath, ephemeralPassword, false);
      } else {
        setNewDirDialog((prev) => ({ ...prev, loading: false, error: res.error || 'Failed to create directory' }));
      }
    } catch (err: any) {
      setNewDirDialog((prev) => ({ ...prev, loading: false, error: err?.message || 'Connection error' }));
    }
  };

  // Create File
  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!server || !newFileDialog.name.trim()) return;
    setNewFileDialog((prev) => ({ ...prev, loading: true, error: null }));

    const targetFile =
      currentPath === '/'
        ? `/${newFileDialog.name.trim()}`
        : `${currentPath}/${newFileDialog.name.trim()}`;

    try {
      const res = await createLinuxRemoteEmptyFile(server.id, targetFile, ephemeralPassword);
      if (res.success) {
        setNewFileDialog({ isOpen: false, name: '', loading: false, error: null });
        showToast(
          isEn ? `File created: ${newFileDialog.name.trim()}` : `فایل جدید ایجاد شد: ${newFileDialog.name.trim()}`,
          'success'
        );
        loadDirectory(currentPath, ephemeralPassword, false);
      } else {
        setNewFileDialog((prev) => ({ ...prev, loading: false, error: res.error || 'Failed to create file' }));
      }
    } catch (err: any) {
      setNewFileDialog((prev) => ({ ...prev, loading: false, error: err?.message || 'Connection error' }));
    }
  };

  // Rename Item
  const handleRenameItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!server || !renameDialog.item || !renameDialog.newName.trim()) return;
    setRenameDialog((prev) => ({ ...prev, loading: true, error: null }));

    const oldPath = renameDialog.item.path;
    const parent = currentPath === '/' ? '' : currentPath;
    const newPath = `${parent}/${renameDialog.newName.trim()}`;

    try {
      const res = await renameLinuxRemoteItem(server.id, oldPath, newPath, ephemeralPassword);
      if (res.success) {
        setRenameDialog({ isOpen: false, item: null, newName: '', loading: false, error: null });
        showToast(
          isEn ? `Renamed to ${renameDialog.newName.trim()}` : `با موفقیت تغییر نام یافت`,
          'success'
        );
        loadDirectory(currentPath, ephemeralPassword, false);
      } else {
        setRenameDialog((prev) => ({ ...prev, loading: false, error: res.error || 'Failed to rename' }));
      }
    } catch (err: any) {
      setRenameDialog((prev) => ({ ...prev, loading: false, error: err?.message || 'Connection error' }));
    }
  };

  // Delete Item
  const handleDeleteItem = async () => {
    if (!server || !deleteDialog.item) return;
    setDeleteDialog((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const res = await deleteLinuxRemoteItem(
        server.id,
        deleteDialog.item.path,
        deleteDialog.isRecursive,
        ephemeralPassword
      );
      if (res.success) {
        const deletedName = deleteDialog.item.name;
        setDeleteDialog({ isOpen: false, item: null, isRecursive: false, loading: false, error: null });
        showToast(
          isEn ? `Deleted ${deletedName}` : `مورد با موفقیت حذف شد: ${deletedName}`,
          'info'
        );
        loadDirectory(currentPath, ephemeralPassword, false);
      } else {
        setDeleteDialog((prev) => ({ ...prev, loading: false, error: res.error || 'Failed to delete' }));
      }
    } catch (err: any) {
      setDeleteDialog((prev) => ({ ...prev, loading: false, error: err?.message || 'Connection error' }));
    }
  };

  // Copy Path to Clipboard
  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    showToast(isEn ? `Path copied: ${path}` : `مسیر در کلیپ‌بورد کپی شد: ${path}`, 'info');
  };

  // Handle Ephemeral Password Submission
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pwd = passwordModal.passwordInput;
    setEphemeralPassword(pwd);
    setPasswordModal({ isOpen: false, passwordInput: '' });
    loadDirectory(currentPath, pwd, false);
  };

  // Filtered & Sorted items
  const displayItems = useMemo(() => {
    let result = [...items];

    // Filter hidden files
    if (!showHidden) {
      result = result.filter((item) => !item.name.startsWith('.'));
    }

    // Filter search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((item) => item.name.toLowerCase().includes(q));
    }

    // Sort items (directories always on top)
    result.sort((a, b) => {
      const aIsDir = a.type === 'directory';
      const bIsDir = b.type === 'directory';
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;

      let compare = 0;
      if (sortBy === 'name') {
        compare = a.name.localeCompare(b.name);
      } else if (sortBy === 'size') {
        compare = a.size - b.size;
      } else if (sortBy === 'mtime') {
        compare = new Date(a.modifiedTime).getTime() - new Date(b.modifiedTime).getTime();
      } else if (sortBy === 'type') {
        compare = (a.extension || '').localeCompare(b.extension || '');
      }

      return sortOrder === 'asc' ? compare : -compare;
    });

    return result;
  }, [items, showHidden, searchQuery, sortBy, sortOrder]);

  // Filtered Quick Directories
  const filteredQuickDirs = useMemo(() => {
    if (!quickDirSearch.trim()) return quickDirs;
    const q = quickDirSearch.toLowerCase().trim();
    return quickDirs.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.path.toLowerCase().includes(q) ||
        (isEn ? d.description.toLowerCase().includes(q) : d.description_fa.includes(q))
    );
  }, [quickDirs, quickDirSearch, isEn]);

  // Split current path into clickable breadcrumbs
  const breadcrumbSegments = useMemo(() => {
    const parts = currentPath.split('/').filter(Boolean);
    const result = [{ name: '/', path: '/' }];
    let accum = '';
    for (const p of parts) {
      accum += '/' + p;
      result.push({ name: p, path: accum });
    }
    return result;
  }, [currentPath]);

  if (!isOpen || !server) return null;

  return (
    <div
      className={
        isMaximized
          ? 'fixed top-0 left-0 right-0 bottom-8 z-50 p-0 flex flex-col'
          : 'fixed inset-0 z-50 p-2 sm:p-4 bg-black/80 backdrop-blur-sm flex items-center justify-center'
      }
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`flex flex-col overflow-hidden transition-all duration-200 shadow-2xl ${
          isMaximized
            ? 'w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-6xl h-[88vh] max-h-[920px] rounded-2xl border'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-200 text-slate-800'
            : 'bg-slate-950 border-slate-800 text-slate-100'
        }`}
      >
        {/* ======================================================== */}
        {/* MODAL HEADER (Universal 3-Control & Strict Bounds)        */}
        {/* ======================================================== */}
        <div
          className={`flex items-center justify-between px-4 sm:px-6 py-3 border-b shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shrink-0">
              <FolderTree className="w-5 h-5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold tracking-tight truncate">
                  {server.name}
                </h2>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  {isEn ? 'File Explorer & SFTP' : 'کاوشگر فایل و SFTP'}
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                  {server.ip}:{server.ssh_port || 22}
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 uppercase">
                  {server.os_distro || 'Linux'}
                </span>
                {loading && (
                  <span className="flex items-center gap-1 text-[11px] text-amber-400 font-mono animate-pulse">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>{isEn ? 'Browsing...' : 'در حال واکشی...'}</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5 font-mono">
                {currentPath} • {items.length} {isEn ? 'items in directory' : 'آیتم در دایرکتوری'}
              </p>
            </div>
          </div>

          {/* 3-Control Header Action Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Minimize to ToolsDock */}
            <button
              type="button"
              onClick={onMinimize}
              title={isEn ? 'Minimize to Dock' : 'کوچک‌سازی به نوار ابزار'}
              className={`p-2 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  : 'border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Minus className="w-4 h-4" />
            </button>

            {/* Maximize / Restore */}
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              title={
                isMaximized
                  ? isEn
                    ? 'Exit Fullscreen'
                    : 'خروج از تمام‌صفحه'
                  : isEn
                  ? 'Fullscreen'
                  : 'تمام‌صفحه'
              }
              className={`p-2 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  : 'border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Close File Explorer' : 'بستن کاوشگر فایل'}
              className="p-2 rounded-lg border border-rose-500/20 text-rose-400 hover:bg-rose-500/15 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Feedback Toast */}
        {feedback && (
          <div
            className={`px-4 py-2 text-xs font-semibold flex items-center justify-between border-b transition-all ${
              feedback.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : feedback.type === 'error'
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
            }`}
          >
            <span>{feedback.message}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="p-0.5 hover:opacity-75 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ======================================================== */}
        {/* MAIN BODY: SPLIT VIEW (1/4 Left, 3/4 Right)              */}
        {/* ======================================================== */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* ========================================== */}
          {/* LEFT PANE (1/4 WIDTH): QUICK DIRECTORIES   */}
          {/* ========================================== */}
          <div
            className={`w-full md:w-1/4 border-b md:border-b-0 ${
              isEn ? 'md:border-r' : 'md:border-l'
            } shrink-0 flex flex-col h-auto md:h-full overflow-hidden ${
              isLightMode ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-900/40 border-slate-800/80'
            }`}
          >
            {/* Quick Dirs Header */}
            <div
              className={`p-3 border-b flex items-center justify-between shrink-0 ${
                isLightMode ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900/60'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Folder className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  {isEn ? 'System Directories' : 'دایرکتوری‌های اصلی سیستم'}
                </span>
                <FieldInfoTooltip
                  title={isEn ? 'Linux System Directories' : 'دایرکتوری‌های اصلی لینوکس'}
                  infoWhatEn="Key standardized Linux file hierarchy paths (/etc for configs, /var/log for logs, /home for user spaces, /root for superuser, /opt for add-ons)."
                  infoWhatFa="مسیرهای استاندارد ساختار فایل لینوکس (/etc برای کانفیگ‌ها، /var/log برای لاگ‌ها، /home برای کاربران، /root برای ادمین، /opt برای نرم‌افزارهای مستقل)."
                  infoWhyEn="Enables one-click instant navigation to critical operational files without typing long nested paths."
                  infoWhyFa="دسترسی سریع و با یک کلیک به فایل‌ها و کانفیگ‌های حساس بدون نیاز به تایپ مسیرهای طولانی."
                  infoExampleEn="/etc/nginx/nginx.conf, /var/log/syslog, /etc/ssh/sshd_config"
                  infoExampleFa="/etc/nginx/nginx.conf و /var/log/auth.log و /etc/systemd/system"
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold">
                {filteredQuickDirs.length}
              </span>
            </div>

            {/* Quick Dir Search */}
            <div className="p-2 border-b border-slate-800/60 shrink-0">
              <div className="relative">
                <Search className={`w-3.5 h-3.5 absolute top-2.5 ${isEn ? 'left-2.5' : 'right-2.5'} text-slate-400`} />
                <input
                  type="text"
                  value={quickDirSearch}
                  onChange={(e) => setQuickDirSearch(e.target.value)}
                  placeholder={isEn ? 'Filter locations...' : 'جستجوی دایرکتوری...'}
                  className={`w-full text-xs rounded-lg py-1.5 ${
                    isEn ? 'pl-8 pr-3' : 'pr-8 pl-3'
                  } border transition outline-none ${
                    isLightMode
                      ? 'bg-white border-slate-200 text-slate-800 placeholder-slate-400 focus:border-cyan-500'
                      : 'bg-slate-950 border-slate-800 text-slate-200 placeholder-slate-500 focus:border-cyan-400'
                  }`}
                />
              </div>
            </div>

            {/* Quick Dirs List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredQuickDirs.map((dir) => {
                const isCurrent = currentPath === dir.path;
                const isInside = currentPath.startsWith(dir.path) && dir.path !== '/';

                return (
                  <button
                    key={dir.path}
                    type="button"
                    onClick={() => loadDirectory(dir.path, ephemeralPassword, true)}
                    className={`w-full flex items-center justify-between p-2 rounded-xl text-xs transition cursor-pointer ${
                      isCurrent
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold shadow-sm'
                        : isInside
                        ? isLightMode
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : isLightMode
                        ? 'text-slate-700 hover:bg-slate-200/70 border border-transparent'
                        : 'text-slate-300 hover:bg-slate-800/70 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Folder
                        className={`w-4 h-4 shrink-0 ${
                          isCurrent ? 'text-amber-400 fill-amber-400/20' : 'text-amber-500/70'
                        }`}
                      />
                      <div className="flex flex-col text-left rtl:text-right min-w-0">
                        <span className="font-mono font-medium truncate">{dir.path}</span>
                        <span className="text-[10px] text-slate-400 truncate">
                          {isEn ? dir.description : dir.description_fa}
                        </span>
                      </div>
                    </div>
                    {isCurrent && (
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Bottom Location & Server Spec Summary */}
            <div
              className={`p-3 border-t text-[11px] shrink-0 font-mono ${
                isLightMode ? 'bg-white border-slate-200 text-slate-600' : 'bg-slate-950/80 border-slate-800 text-slate-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <span>{isEn ? 'Target Host:' : 'سرور مقصد:'}</span>
                <span className="font-semibold text-cyan-400">{server.ip}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span>{isEn ? 'Files / Folders:' : 'فایل‌ها / پوشه‌ها:'}</span>
                <span className="font-semibold text-amber-400">
                  {totalFiles} / {totalDirectories}
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span>{isEn ? 'Protocol:' : 'پروتکل:'}</span>
                <span className="text-emerald-400 font-semibold">SFTP over SSH</span>
              </div>
            </div>
          </div>

          {/* ========================================== */}
          {/* RIGHT PANE (3/4 WIDTH): BROWSER & CONTENT  */}
          {/* ========================================== */}
          <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
            {/* Top Navigation & Action Toolbar */}
            <div
              className={`p-2.5 border-b shrink-0 flex flex-wrap items-center justify-between gap-2 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
              }`}
            >
              {/* Back / Forward / Up / Refresh */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleGoBack}
                  disabled={historyIndex <= 0}
                  title={isEn ? 'Go Back' : 'بازگشت به مسیر قبلی'}
                  className={`p-1.5 rounded-lg border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    isLightMode
                      ? 'border-slate-200 text-slate-700 hover:bg-slate-100'
                      : 'border-white/10 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleGoForward}
                  disabled={historyIndex >= history.length - 1}
                  title={isEn ? 'Go Forward' : 'مسیر بعدی'}
                  className={`p-1.5 rounded-lg border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    isLightMode
                      ? 'border-slate-200 text-slate-700 hover:bg-slate-100'
                      : 'border-white/10 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleGoUp}
                  disabled={!parentPath || parentPath === currentPath}
                  title={isEn ? 'Go to Parent Directory' : 'رفتن به دایرکتوری والد'}
                  className={`p-1.5 rounded-lg border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    isLightMode
                      ? 'border-slate-200 text-slate-700 hover:bg-slate-100'
                      : 'border-white/10 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => loadDirectory(currentPath, ephemeralPassword, false)}
                  title={isEn ? 'Refresh Directory' : 'تازه‌سازی دایرکتوری'}
                  className={`p-1.5 rounded-lg border transition cursor-pointer ${
                    isLightMode
                      ? 'border-slate-200 text-slate-700 hover:bg-slate-100'
                      : 'border-white/10 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
                </button>
              </div>

              {/* Breadcrumb Path Bar */}
              <div className="flex-1 min-w-[200px] max-w-full">
                {isEditingPath ? (
                  <form onSubmit={handlePathSubmit} className="flex items-center gap-1 w-full">
                    <input
                      ref={pathInputRef}
                      type="text"
                      value={pathInputValue}
                      onChange={(e) => setPathInputValue(e.target.value)}
                      onBlur={() => setIsEditingPath(false)}
                      autoFocus
                      className={`w-full font-mono text-xs px-2.5 py-1.5 rounded-lg border outline-none ${
                        isLightMode
                          ? 'bg-slate-100 border-cyan-500 text-slate-900'
                          : 'bg-slate-950 border-cyan-400 text-cyan-300'
                      }`}
                    />
                    <button
                      type="submit"
                      className="px-2.5 py-1.5 rounded-lg bg-cyan-500 text-slate-950 font-bold text-xs cursor-pointer"
                    >
                      {isEn ? 'Go' : 'برو'}
                    </button>
                  </form>
                ) : (
                  <div
                    onClick={() => {
                      setIsEditingPath(true);
                      setPathInputValue(currentPath);
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border font-mono text-xs overflow-x-auto cursor-text ${
                      isLightMode
                        ? 'bg-slate-100/80 border-slate-200 text-slate-800 hover:border-slate-300'
                        : 'bg-slate-950/70 border-slate-800 text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    {breadcrumbSegments.map((seg, idx) => (
                      <React.Fragment key={seg.path}>
                        {idx > 0 && <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            loadDirectory(seg.path, ephemeralPassword, true);
                          }}
                          className={`hover:text-amber-400 hover:underline px-1 py-0.5 rounded ${
                            seg.path === currentPath ? 'font-bold text-amber-400' : ''
                          }`}
                        >
                          {seg.name === '/' ? '/' : seg.name}
                        </button>
                      </React.Fragment>
                    ))}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyPath(currentPath);
                      }}
                      title={isEn ? 'Copy path' : 'کپی مسیر'}
                      className="ml-auto p-1 hover:text-cyan-400 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* Action Buttons: New Folder, New File, View Mode, Search */}
              <div className="flex items-center gap-1.5">
                {/* Search In Folder */}
                <div className="relative">
                  <Search className={`w-3.5 h-3.5 absolute top-2.5 ${isEn ? 'left-2' : 'right-2'} text-slate-400`} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={isEn ? 'Search files...' : 'جستجوی فایل...'}
                    className={`text-xs rounded-lg py-1.5 ${
                      isEn ? 'pl-7 pr-2' : 'pr-7 pl-2'
                    } w-28 sm:w-36 border outline-none ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'
                        : 'bg-slate-950 border-slate-800 text-slate-200 placeholder-slate-500'
                    }`}
                  />
                </div>

                {/* Show/Hide Hidden Files */}
                <button
                  type="button"
                  onClick={() => setShowHidden(!showHidden)}
                  title={
                    showHidden
                      ? isEn
                        ? 'Hide dotfiles'
                        : 'مخفی کردن فایل‌های نقطه‌دار'
                      : isEn
                      ? 'Show hidden files'
                      : 'نمایش فایل‌های مخفی'
                  }
                  className={`p-1.5 rounded-lg border transition cursor-pointer ${
                    showHidden
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                      : isLightMode
                      ? 'border-slate-200 text-slate-600 hover:bg-slate-100'
                      : 'border-white/10 text-slate-400 hover:bg-white/10'
                  }`}
                >
                  {showHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>

                {/* View Mode Toggle */}
                <button
                  type="button"
                  onClick={() => setViewMode(viewMode === 'table' ? 'grid' : 'table')}
                  title={
                    viewMode === 'table'
                      ? isEn
                        ? 'Switch to Grid View'
                        : 'نمایش شبکه‌ای'
                      : isEn
                      ? 'Switch to List View'
                      : 'نمایش جدولی'
                  }
                  className={`p-1.5 rounded-lg border transition cursor-pointer ${
                    isLightMode
                      ? 'border-slate-200 text-slate-700 hover:bg-slate-100'
                      : 'border-white/10 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {viewMode === 'table' ? <LayoutGrid className="w-3.5 h-3.5" /> : <ListIcon className="w-3.5 h-3.5" />}
                </button>

                {/* Download Selected */}
                {selectedPaths.size > 0 && (
                  <button
                    type="button"
                    onClick={() => handleDownload(Array.from(selectedPaths), selectedPaths.size > 1)}
                    disabled={isDownloading}
                    title={
                      isEn
                        ? `Download selected (${selectedPaths.size})`
                        : `دانلود موارد انتخابی (${selectedPaths.size})`
                    }
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 text-xs font-semibold cursor-pointer transition animate-in fade-in"
                  >
                    {isDownloading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : selectedPaths.size > 1 ? (
                      <Archive className="w-3.5 h-3.5" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span className="hidden sm:inline">
                      {isEn ? `Download (${selectedPaths.size})` : `دانلود (${selectedPaths.size})`}
                    </span>
                  </button>
                )}

                {/* Create Folder */}
                <button
                  type="button"
                  onClick={() => setNewDirDialog({ isOpen: true, name: '', loading: false, error: null })}
                  title={isEn ? 'Create New Folder' : 'ایجاد پوشه جدید'}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 text-xs font-semibold cursor-pointer transition"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{isEn ? 'New Folder' : 'پوشه جدید'}</span>
                </button>

                {/* Create File */}
                <button
                  type="button"
                  onClick={() => setNewFileDialog({ isOpen: true, name: '', loading: false, error: null })}
                  title={isEn ? 'Create Empty File' : 'ایجاد فایل جدید'}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 text-xs font-semibold cursor-pointer transition"
                >
                  <FilePlus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{isEn ? 'New File' : 'فایل جدید'}</span>
                </button>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-3 relative">
              {/* Error State */}
              {error && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 shrink-0 text-rose-400" />
                    <div>
                      <div className="font-bold text-xs">{isEn ? 'Access Error' : 'خطای دسترسی'}</div>
                      <div className="text-xs font-mono mt-0.5">{error}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {requiresPassword && (
                      <button
                        type="button"
                        onClick={() => setPasswordModal({ isOpen: true, passwordInput: '' })}
                        className="px-3 py-1 rounded-lg bg-rose-500 text-white text-xs font-semibold cursor-pointer"
                      >
                        {isEn ? 'Enter Password' : 'ورود رمز عبور'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => loadDirectory(currentPath, ephemeralPassword, false)}
                      className="px-3 py-1 rounded-lg border border-rose-500/40 text-rose-300 text-xs font-semibold hover:bg-rose-500/20 cursor-pointer"
                    >
                      {isEn ? 'Retry' : 'تلاش مجدد'}
                    </button>
                  </div>
                </div>
              )}

              {/* Loading Indicator */}
              {loading && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <RefreshCw className="w-7 h-7 text-amber-400 animate-spin" />
                  <span className="text-xs font-mono text-slate-400">
                    {isEn ? 'Negotiating SFTP & reading directory contents...' : 'در حال خواندن محتویات از طریق SFTP...'}
                  </span>
                </div>
              )}

              {/* Empty Directory State */}
              {!loading && !error && displayItems.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                  <Folder className="w-12 h-12 stroke-1 text-slate-500" />
                  <div className="text-sm font-semibold">
                    {isEn ? 'This directory is empty' : 'این دایرکتوری خالی است'}
                  </div>
                  <p className="text-xs text-slate-500 font-mono">
                    {searchQuery ? (isEn ? 'No files match your search filter' : 'هیچ فایلی با این عبارت پیدا نشد') : currentPath}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setNewFileDialog({ isOpen: true, name: '', loading: false, error: null })}
                      className="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs font-semibold hover:bg-cyan-500/30 cursor-pointer"
                    >
                      + {isEn ? 'Create First File' : 'ایجاد اولین فایل'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewDirDialog({ isOpen: true, name: '', loading: false, error: null })}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-semibold hover:bg-amber-500/30 cursor-pointer"
                    >
                      + {isEn ? 'Create Subfolder' : 'ایجاد زیرپوشه'}
                    </button>
                  </div>
                </div>
              )}

              {/* TABLE VIEW */}
              {!loading && !error && displayItems.length > 0 && viewMode === 'table' && (
                <div className="w-full overflow-x-auto rounded-xl border border-slate-800/80">
                  <table className="w-full text-xs text-left rtl:text-right">
                    <thead
                      className={`font-semibold border-b ${
                        isLightMode
                          ? 'bg-slate-100 text-slate-700 border-slate-200'
                          : 'bg-slate-900/90 text-slate-300 border-slate-800'
                      }`}
                    >
                      <tr>
                        <th
                          className="px-3 py-2.5 cursor-pointer hover:text-amber-400"
                          onClick={() => {
                            if (sortBy === 'name') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                            else {
                              setSortBy('name');
                              setSortOrder('asc');
                            }
                          }}
                        >
                          {isEn ? 'Name' : 'نام فایل یا پوشه'}
                        </th>
                        <th
                          className="px-3 py-2.5 cursor-pointer hover:text-amber-400"
                          onClick={() => {
                            if (sortBy === 'size') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                            else {
                              setSortBy('size');
                              setSortOrder('asc');
                            }
                          }}
                        >
                          {isEn ? 'Size' : 'اندازه'}
                        </th>
                        <th className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            <span>{isEn ? 'Permissions' : 'مجوزها'}</span>
                            <FieldInfoTooltip
                              title={isEn ? 'UNIX Permissions' : 'مجوزهای فایل لینوکس'}
                              infoWhatEn="Standard POSIX file modes (e.g. drwxr-xr-x / 0755) representing Read, Write, and Execute rights for Owner, Group, and Others."
                              infoWhatFa="سطوح دسترسی استاندارد POSIX (مانند 0755 یا drwxr-xr-x) که حق خواندن، نوشتن و اجرا را برای مالک، گروه و دیگران مشخص می‌کند."
                              infoWhyEn="Ensures process security and prevents unauthorized execution or configuration corruption."
                              infoWhyFa="تضمین امنیت سیستم‌عامل و جلوگیری از تغییر یا اجرای غیرمجاز فایل‌های حساس سیستمی."
                              infoExampleEn="0644 (rw-r--r--) for configs, 0755 (rwxr-xr-x) for scripts"
                              infoExampleFa="0644 برای فایل‌های کانفیگ و لاگ، 0755 برای اسکریپت‌ها و باینری‌ها"
                              isEn={isEn}
                              isLightMode={isLightMode}
                            />
                          </div>
                        </th>
                        <th className="px-3 py-2.5">{isEn ? 'Owner:Group' : 'مالک:گروه'}</th>
                        <th
                          className="px-3 py-2.5 cursor-pointer hover:text-amber-400"
                          onClick={() => {
                            if (sortBy === 'mtime') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                            else {
                              setSortBy('mtime');
                              setSortOrder('asc');
                            }
                          }}
                        >
                          {isEn ? 'Modified' : 'تاریخ ویرایش'}
                        </th>
                        <th className="px-3 py-2.5 text-center">{isEn ? 'Actions' : 'عملیات'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                      {displayItems.map((item) => {
                        const iconInfo = getFileIconInfo(item);
                        const IconComp = iconInfo.icon;
                        const isSelected = selectedPaths.has(item.path);

                        return (
                          <tr
                            key={item.path}
                            onClick={(e) => handleItemClick(item, e)}
                            onDoubleClick={() => handleItemDoubleClick(item)}
                            onContextMenu={(e) => handleItemContextMenu(e, item)}
                            className={`transition cursor-pointer select-none ${
                              isSelected
                                ? isLightMode
                                  ? 'bg-cyan-100/90 text-slate-950 font-semibold ring-1 ring-cyan-500/40'
                                  : 'bg-cyan-500/25 text-white font-semibold ring-1 ring-cyan-500/50'
                                : isLightMode
                                ? 'hover:bg-slate-100 text-slate-700'
                                : 'hover:bg-slate-900/60 text-slate-200'
                            }`}
                          >
                            {/* Item Name & Icon */}
                            <td className="px-3 py-2 min-w-[220px]">
                              <div className="flex items-center gap-2">
                                <div className={`p-1.5 rounded-lg ${iconInfo.bgColor} ${iconInfo.color} shrink-0`}>
                                  <IconComp className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                  <span className="font-mono text-xs truncate block hover:underline">
                                    {item.name}
                                  </span>
                                  {item.type === 'symlink' && item.target && (
                                    <span className="text-[10px] text-purple-400 font-mono flex items-center gap-1">
                                      <span>→</span> {item.target}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Size */}
                            <td className="px-3 py-2 font-mono text-xs whitespace-nowrap text-slate-400">
                              {item.type === 'directory' ? '—' : item.sizeHuman}
                            </td>

                            {/* Permissions */}
                            <td className="px-3 py-2 font-mono text-[11px] whitespace-nowrap">
                              <span className="px-1.5 py-0.5 rounded bg-slate-800/80 text-cyan-400 border border-slate-700/60">
                                {item.permissions}
                              </span>
                            </td>

                            {/* Owner:Group */}
                            <td className="px-3 py-2 font-mono text-xs whitespace-nowrap text-slate-400">
                              {item.owner}:{item.group}
                            </td>

                            {/* Modified Date */}
                            <td className="px-3 py-2 font-mono text-xs whitespace-nowrap text-slate-400">
                              {item.modifiedTime ? new Date(item.modifiedTime).toLocaleString() : '—'}
                            </td>

                            {/* Actions */}
                            <td className="px-3 py-2 whitespace-nowrap text-center">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const menuWidth = 210;
                                  const menuHeight = 220;
                                  const x = Math.max(12, Math.min(isEn ? rect.right : rect.left - menuWidth, window.innerWidth - menuWidth - 12));
                                  const y = Math.max(12, Math.min(rect.bottom + 4, window.innerHeight - menuHeight - 12));
                                  setSelectedItem(item);
                                  setContextMenu({
                                    isOpen: true,
                                    x,
                                    y,
                                    item,
                                  });
                                }}
                                title={isEn ? 'Options (Right-click)' : 'گزینه‌ها (یا راست‌کلیک)'}
                                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* GRID VIEW */}
              {!loading && !error && displayItems.length > 0 && viewMode === 'grid' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {displayItems.map((item) => {
                    const iconInfo = getFileIconInfo(item);
                    const IconComp = iconInfo.icon;
                    const isSelected = selectedPaths.has(item.path);

                    return (
                      <div
                        key={item.path}
                        onClick={(e) => handleItemClick(item, e)}
                        onDoubleClick={() => handleItemDoubleClick(item)}
                        onContextMenu={(e) => handleItemContextMenu(e, item)}
                        className={`p-3 rounded-xl border flex flex-col items-center text-center transition cursor-pointer relative group select-none ${
                          isSelected
                            ? isLightMode
                              ? 'bg-cyan-50 border-cyan-500/60 text-cyan-950 font-semibold ring-2 ring-cyan-400'
                              : 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200 font-semibold ring-2 ring-cyan-400/60'
                            : isLightMode
                            ? 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md text-slate-800'
                            : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900 text-slate-200'
                        }`}
                      >
                        <div className={`p-3 rounded-xl ${iconInfo.bgColor} ${iconInfo.color} mb-2`}>
                          <IconComp className="w-6 h-6" />
                        </div>
                        <span className="font-mono text-xs truncate max-w-full block font-medium">
                          {item.name}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {item.type === 'directory' ? (isEn ? 'Folder' : 'پوشه') : item.sizeHuman}
                        </span>

                        {/* Options button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            const menuWidth = 210;
                            const menuHeight = 220;
                            const x = Math.max(12, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12));
                            const y = Math.max(12, Math.min(rect.bottom + 4, window.innerHeight - menuHeight - 12));
                            setSelectedItem(item);
                            setContextMenu({
                              isOpen: true,
                              x,
                              y,
                              item,
                            });
                          }}
                          title={isEn ? 'Options (Right-click)' : 'گزینه‌ها (یا راست‌کلیک)'}
                          className="absolute top-1.5 right-1.5 p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer opacity-40 group-hover:opacity-100"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* NEW FOLDER DIALOG                                        */}
        {/* ======================================================== */}
        {newDirDialog.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <form
              onSubmit={handleCreateDirectory}
              className={`w-full max-w-md p-5 rounded-2xl border shadow-2xl space-y-4 ${
                isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderPlus className="w-5 h-5 text-amber-400" />
                  <h3 className="font-bold text-sm">
                    {isEn ? 'Create New Directory' : 'ایجاد دایرکتوری جدید'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setNewDirDialog({ isOpen: false, name: '', loading: false, error: null })}
                  className="p-1 rounded text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-xs font-mono text-slate-400 truncate">
                {isEn ? 'Location:' : 'مسیر مقصد:'} {currentPath}
              </div>

              {newDirDialog.error && (
                <div className="p-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-mono">
                  {newDirDialog.error}
                </div>
              )}

              <input
                type="text"
                value={newDirDialog.name}
                onChange={(e) => setNewDirDialog((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={isEn ? 'e.g. backup_configs' : 'نام پوشه جدید...'}
                autoFocus
                required
                className={`w-full text-xs font-mono px-3 py-2 rounded-xl border outline-none ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-amber-500'
                    : 'bg-slate-900 border-slate-700 text-slate-100 focus:border-amber-400'
                }`}
              />

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setNewDirDialog({ isOpen: false, name: '', loading: false, error: null })}
                  className="px-3 py-1.5 rounded-xl border border-slate-700 text-xs font-medium hover:bg-white/10"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="submit"
                  disabled={newDirDialog.loading || !newDirDialog.name.trim()}
                  className="px-4 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 transition cursor-pointer disabled:opacity-50"
                >
                  {newDirDialog.loading ? (isEn ? 'Creating...' : 'در حال ساخت...') : isEn ? 'Create' : 'ایجاد'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ======================================================== */}
        {/* NEW FILE DIALOG                                          */}
        {/* ======================================================== */}
        {newFileDialog.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <form
              onSubmit={handleCreateFile}
              className={`w-full max-w-md p-5 rounded-2xl border shadow-2xl space-y-4 ${
                isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FilePlus className="w-5 h-5 text-cyan-400" />
                  <h3 className="font-bold text-sm">
                    {isEn ? 'Create Empty File' : 'ایجاد فایل متنی جدید'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setNewFileDialog({ isOpen: false, name: '', loading: false, error: null })}
                  className="p-1 rounded text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-xs font-mono text-slate-400 truncate">
                {isEn ? 'Location:' : 'مسیر مقصد:'} {currentPath}
              </div>

              {newFileDialog.error && (
                <div className="p-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-mono">
                  {newFileDialog.error}
                </div>
              )}

              <input
                type="text"
                value={newFileDialog.name}
                onChange={(e) => setNewFileDialog((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={isEn ? 'e.g. app_config.env or deploy.sh' : 'نام فایل مثلا config.yaml...'}
                autoFocus
                required
                className={`w-full text-xs font-mono px-3 py-2 rounded-xl border outline-none ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-500'
                    : 'bg-slate-900 border-slate-700 text-slate-100 focus:border-cyan-400'
                }`}
              />

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setNewFileDialog({ isOpen: false, name: '', loading: false, error: null })}
                  className="px-3 py-1.5 rounded-xl border border-slate-700 text-xs font-medium hover:bg-white/10"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="submit"
                  disabled={newFileDialog.loading || !newFileDialog.name.trim()}
                  className="px-4 py-1.5 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs hover:bg-cyan-400 transition cursor-pointer disabled:opacity-50"
                >
                  {newFileDialog.loading ? (isEn ? 'Creating...' : 'در حال ساخت...') : isEn ? 'Create' : 'ایجاد'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ======================================================== */}
        {/* RENAME DIALOG                                            */}
        {/* ======================================================== */}
        {renameDialog.isOpen && renameDialog.item && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <form
              onSubmit={handleRenameItem}
              className={`w-full max-w-md p-5 rounded-2xl border shadow-2xl space-y-4 ${
                isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-amber-400" />
                  <h3 className="font-bold text-sm">
                    {isEn ? 'Rename Item' : 'تغییر نام آیتم'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setRenameDialog({ isOpen: false, item: null, newName: '', loading: false, error: null })}
                  className="p-1 rounded text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-xs font-mono text-slate-400 truncate">
                {isEn ? 'Current path:' : 'مسیر فعلی:'} {renameDialog.item.path}
              </div>

              {renameDialog.error && (
                <div className="p-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-mono">
                  {renameDialog.error}
                </div>
              )}

              <input
                type="text"
                value={renameDialog.newName}
                onChange={(e) => setRenameDialog((prev) => ({ ...prev, newName: e.target.value }))}
                autoFocus
                required
                className={`w-full text-xs font-mono px-3 py-2 rounded-xl border outline-none ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-amber-500'
                    : 'bg-slate-900 border-slate-700 text-slate-100 focus:border-amber-400'
                }`}
              />

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRenameDialog({ isOpen: false, item: null, newName: '', loading: false, error: null })}
                  className="px-3 py-1.5 rounded-xl border border-slate-700 text-xs font-medium hover:bg-white/10"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="submit"
                  disabled={renameDialog.loading || !renameDialog.newName.trim()}
                  className="px-4 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 transition cursor-pointer disabled:opacity-50"
                >
                  {renameDialog.loading ? (isEn ? 'Renaming...' : 'تغییر نام...') : isEn ? 'Rename' : 'اعمال نام'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ======================================================== */}
        {/* DELETE CONFIRMATION DIALOG                               */}
        {/* ======================================================== */}
        {deleteDialog.isOpen && deleteDialog.item && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div
              className={`w-full max-w-md p-5 rounded-2xl border shadow-2xl space-y-4 ${
                isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-rose-400">
                  <AlertTriangle className="w-5 h-5" />
                  <h3 className="font-bold text-sm">
                    {isEn ? 'Confirm Deletion' : 'تأیید حذف آیتم'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteDialog({ isOpen: false, item: null, isRecursive: false, loading: false, error: null })}
                  className="p-1 rounded text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-300">
                {isEn
                  ? `Are you sure you want to delete ${deleteDialog.item.type === 'directory' ? 'the directory' : 'the file'}:`
                  : `آیا از حذف ${deleteDialog.item.type === 'directory' ? 'پوشه' : 'فایل'} زیر مطمئن هستید؟`}
              </p>

              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 font-mono text-xs text-rose-300 break-all">
                {deleteDialog.item.path}
              </div>

              {deleteDialog.item.type === 'directory' && (
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={deleteDialog.isRecursive}
                    onChange={(e) => setDeleteDialog((prev) => ({ ...prev, isRecursive: e.target.checked }))}
                    className="rounded text-rose-500"
                  />
                  <span>
                    {isEn
                      ? 'Delete recursively (all nested files and subfolders)'
                      : 'حذف به صورت بازگشتی (شامل تمامی فایل‌ها و زیرپوشه‌ها)'}
                  </span>
                </label>
              )}

              {deleteDialog.error && (
                <div className="p-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-mono">
                  {deleteDialog.error}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteDialog({ isOpen: false, item: null, isRecursive: false, loading: false, error: null })}
                  className="px-3 py-1.5 rounded-xl border border-slate-700 text-xs font-medium hover:bg-white/10"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="button"
                  onClick={handleDeleteItem}
                  disabled={deleteDialog.loading}
                  className="px-4 py-1.5 rounded-xl bg-rose-500 text-white font-bold text-xs hover:bg-rose-400 transition cursor-pointer disabled:opacity-50"
                >
                  {deleteDialog.loading ? (isEn ? 'Deleting...' : 'در حال حذف...') : isEn ? 'Delete Permanently' : 'حذف قطعی'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* PASSWORD REQUIRED PROMPT MODAL (Zero-Storage Policy)    */}
        {/* ======================================================== */}
        {passwordModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <form
              onSubmit={handlePasswordSubmit}
              className={`w-full max-w-md p-5 rounded-2xl border shadow-2xl space-y-4 ${
                isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-cyan-400">
                  <Lock className="w-5 h-5" />
                  <h3 className="font-bold text-sm">
                    {isEn ? 'SSH Authentication Required' : 'رمز عبور SSH برای دسترسی به فایل‌ها'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setPasswordModal({ isOpen: false, passwordInput: '' })}
                  className="p-1 rounded text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-400">
                {isEn
                  ? 'This server has a Zero-Storage policy enabled. Please provide the SSH password to negotiate SFTP session in-flight.'
                  : 'این سرور تحت سیاست عدم ذخیره رمز (Zero-Storage) تنظیم شده است. لطفاً رمز SSH را جهت بازگشایی نشست SFTP وارد نمایید.'}
              </p>

              <input
                type="password"
                value={passwordModal.passwordInput}
                onChange={(e) => setPasswordModal((prev) => ({ ...prev, passwordInput: e.target.value }))}
                placeholder={isEn ? 'SSH Password...' : 'رمز عبور SSH...'}
                autoFocus
                required
                className={`w-full text-xs font-mono px-3 py-2 rounded-xl border outline-none ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-500'
                    : 'bg-slate-900 border-slate-700 text-slate-100 focus:border-cyan-400'
                }`}
              />

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPasswordModal({ isOpen: false, passwordInput: '' })}
                  className="px-3 py-1.5 rounded-xl border border-slate-700 text-xs font-medium hover:bg-white/10"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="submit"
                  disabled={!passwordModal.passwordInput}
                  className="px-4 py-1.5 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs hover:bg-cyan-400 transition cursor-pointer disabled:opacity-50"
                >
                  {isEn ? 'Authenticate' : 'تأیید و اتصال'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ======================================================== */}
        {/* ITEM CONTEXT MENU (PORTAL)                               */}
        {/* ======================================================== */}
        {contextMenu?.isOpen &&
          createPortal(
            <div
              style={{ top: contextMenu.y, left: contextMenu.x }}
              className={`fixed z-[9999] w-60 rounded-xl border shadow-2xl p-1.5 text-xs font-sans select-none animate-in fade-in zoom-in-95 duration-100 ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-800 shadow-slate-300/50'
                  : 'bg-slate-900 border-slate-800 text-slate-100 shadow-black/80'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {selectedPaths.size > 1 ? (
                <>
                  {/* Multi-selection Header */}
                  <div className="px-2.5 py-1.5 mb-1 border-b border-white/10 flex items-center justify-between">
                    <span className="font-bold text-xs text-cyan-400">
                      {isEn ? `${selectedPaths.size} items selected` : `${selectedPaths.size} مورد انتخاب شده`}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Ctrl+Click
                    </span>
                  </div>

                  {/* Download All as ZIP */}
                  <button
                    type="button"
                    onClick={() => handleDownload(Array.from(selectedPaths), true)}
                    disabled={isDownloading}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-start ${
                      isLightMode ? 'hover:bg-cyan-50 text-cyan-700 font-semibold' : 'hover:bg-cyan-500/15 text-cyan-300 font-semibold'
                    }`}
                  >
                    <Archive className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>{isEn ? 'Download as ZIP (.zip)' : 'دانلود در قالب فایل فشرده (ZIP)'}</span>
                  </button>

                  {/* Copy All Paths */}
                  <button
                    type="button"
                    onClick={() => {
                      handleCopyPath(Array.from(selectedPaths).join('\n'));
                      setContextMenu(null);
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-start ${
                      isLightMode ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-white/10 text-slate-200'
                    }`}
                  >
                    <Copy className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{isEn ? 'Copy Selected Paths' : 'کپی مسیر موارد انتخابی'}</span>
                  </button>

                  <div className="my-1 border-t border-white/10" />

                  {/* Delete Selected Items */}
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteDialog({
                        isOpen: true,
                        item: contextMenu.item,
                        isRecursive: true,
                        loading: false,
                        error: null,
                      });
                      setContextMenu(null);
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-rose-400 text-start ${
                      isLightMode ? 'hover:bg-rose-50' : 'hover:bg-rose-500/15'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span>{isEn ? `Delete (${selectedPaths.size}) Items` : `حذف (${selectedPaths.size}) مورد`}</span>
                  </button>
                </>
              ) : (
                <>
                  {/* Single Item Header */}
                  <div className="px-2.5 py-1.5 mb-1 border-b border-white/10 flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono font-bold truncate text-[11px] text-cyan-400">
                        {contextMenu.item.name}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {contextMenu.item.type === 'directory' ? (isEn ? 'Folder' : 'پوشه') : contextMenu.item.sizeHuman}
                      </p>
                    </div>
                  </div>

                  {/* Download Single File or Folder */}
                  <button
                    type="button"
                    onClick={() => handleDownload([contextMenu.item.path], contextMenu.item.type === 'directory')}
                    disabled={isDownloading}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-start ${
                      isLightMode ? 'hover:bg-cyan-50 text-cyan-700 font-medium' : 'hover:bg-cyan-500/15 text-cyan-300 font-medium'
                    }`}
                  >
                    {contextMenu.item.type === 'directory' ? (
                      <>
                        <Archive className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span>{isEn ? 'Download as ZIP' : 'دانلود در قالب فایل ZIP'}</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span>{isEn ? 'Download File' : 'دانلود فایل'}</span>
                      </>
                    )}
                  </button>

                  {/* Copy Path */}
                  <button
                    type="button"
                    onClick={() => {
                      handleCopyPath(contextMenu.item.path);
                      setContextMenu(null);
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-start ${
                      isLightMode ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-white/10 text-slate-200'
                    }`}
                  >
                    <Copy className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{isEn ? 'Copy Full Path' : 'کپی مسیر کامل'}</span>
                  </button>

                  {/* Rename */}
                  <button
                    type="button"
                    onClick={() => {
                      setRenameDialog({
                        isOpen: true,
                        item: contextMenu.item,
                        newName: contextMenu.item.name,
                        loading: false,
                        error: null,
                      });
                      setContextMenu(null);
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-start ${
                      isLightMode ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-white/10 text-slate-200'
                    }`}
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{isEn ? 'Rename' : 'تغییر نام'}</span>
                  </button>

                  <div className="my-1 border-t border-white/10" />

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteDialog({
                        isOpen: true,
                        item: contextMenu.item,
                        isRecursive: contextMenu.item.type === 'directory',
                        loading: false,
                        error: null,
                      });
                      setContextMenu(null);
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-rose-400 text-start ${
                      isLightMode ? 'hover:bg-rose-50' : 'hover:bg-rose-500/15'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span>{isEn ? 'Delete' : 'حذف'}</span>
                  </button>
                </>
              )}
            </div>,
            document.body
          )}

        {/* ======================================================== */}
        {/* DOWNLOAD NOTIFICATION TOAST                              */}
        {/* ======================================================== */}
        {downloadNotice && (
          <div className="fixed bottom-12 right-6 z-[99999] px-4 py-2.5 rounded-xl border border-cyan-500/40 bg-slate-900/95 text-white shadow-2xl backdrop-blur-md flex items-center gap-2 text-xs font-mono animate-in slide-in-from-bottom-2">
            {isDownloading ? (
              <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
            ) : (
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>{downloadNotice}</span>
          </div>
        )}
      </div>
    </div>
  );
};
