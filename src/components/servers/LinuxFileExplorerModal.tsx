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
  Upload,
  Calendar,
  User,
  Users,
  Save,
  Scissors,
  ClipboardPaste,
} from 'lucide-react';
import { RemoteServer, LinuxFsItem, LinuxFsListResult, LinuxQuickDir, LinuxFileContentResult, LinuxItemProperties } from '../../types';
import {
  fetchLinuxDirectory,
  fetchLinuxQuickDirs,
  readLinuxRemoteFile,
  writeLinuxRemoteFile,
  createLinuxRemoteDirectory,
  createLinuxRemoteEmptyFile,
  renameLinuxRemoteItem,
  deleteLinuxRemoteItem,
  deleteLinuxRemoteItems,
  downloadLinuxFiles,
  uploadLinuxFile,
  fetchLinuxItemProperties,
  updateLinuxItemAttributes,
  fetchLinuxSystemUsersAndGroups,
  pasteLinuxItems,
  compressLinuxRemoteItems,
  extractLinuxRemoteArchive,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

function isArchiveItem(item?: LinuxFsItem | null): boolean {
  if (!item || item.type !== 'file') return false;
  const name = item.name.toLowerCase();
  return (
    name.endsWith('.zip') ||
    name.endsWith('.tar.gz') ||
    name.endsWith('.tgz') ||
    name.endsWith('.tar.bz2') ||
    name.endsWith('.tbz2') ||
    name.endsWith('.tar.xz') ||
    name.endsWith('.txz') ||
    name.endsWith('.tar') ||
    name.endsWith('.7z') ||
    name.endsWith('.rar') ||
    name.endsWith('.gz') ||
    name.endsWith('.bz2') ||
    name.endsWith('.xz')
  );
}

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

// Dedicated Modern Filled & Layered Folder Icon for Grid View
const ModernFolderIcon: React.FC<{ className?: string; isSelected?: boolean }> = ({
  className = 'w-14 h-14 sm:w-16 sm:h-16',
  isSelected = false
}) => (
  <svg
    viewBox="0 0 64 54"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`${className} transition-transform duration-200 group-hover:scale-105 shrink-0 select-none drop-shadow-md`}
  >
    <defs>
      <linearGradient id="lfe-folder-back" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#d97706" />
      </linearGradient>
      <linearGradient id="lfe-folder-front" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={isSelected ? '#38bdf8' : '#fbbf24'} />
        <stop offset="100%" stopColor={isSelected ? '#0284c7' : '#f59e0b'} />
      </linearGradient>
      <linearGradient id="lfe-folder-paper" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
        <stop offset="100%" stopColor="#f1f5f9" stopOpacity="0.85" />
      </linearGradient>
    </defs>
    {/* Folder Back Plate & Tab */}
    <path
      d="M6 10C6 7.79086 7.79086 6 10 6H23.1716C24.2324 6 25.2497 6.42143 26 7.17157L29.8284 11H54C56.2091 11 58 12.7909 58 15V44C58 46.2091 56.2091 48 54 48H10C7.79086 48 6 46.2091 6 44V10Z"
      fill={isSelected ? '#0369a1' : 'url(#lfe-folder-back)'}
    />
    {/* Interior Document Sheet Peek */}
    <rect
      x="12"
      y="14"
      width="40"
      height="16"
      rx="3"
      fill="url(#lfe-folder-paper)"
    />
    <line x1="16" y1="18" x2="32" y2="18" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="16" y1="22" x2="26" y2="22" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" />
    {/* Front Flap (Cover) */}
    <path
      d="M4 20C4 17.7909 5.79086 16 8 16H56C58.2091 16 60 17.7909 60 20V46C60 48.2091 58.2091 50 56 50H8C5.79086 50 4 48.2091 4 46V20Z"
      fill="url(#lfe-folder-front)"
    />
    {/* Front Flap Top Edge Highlight Line */}
    <path
      d="M8 17H56C57.6569 17 59 18.3431 59 20C59 20.5523 58.5523 21 58 21H6C5.44772 21 5 20.5523 5 20C5 18.3431 6.34315 17 8 17Z"
      fill="#ffffff"
      opacity="0.4"
    />
    {/* Bottom subtle edge */}
    <path
      d="M4 46C4 48.2091 5.79086 50 8 50H56C58.2091 50 60 48.2091 60 46H4Z"
      fill={isSelected ? '#075985' : '#b45309'}
      opacity="0.3"
    />
  </svg>
);

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
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
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
    items: LinuxFsItem[];
    isRecursive: boolean;
    loading: boolean;
    error: string | null;
    isMaximized?: boolean;
  }>({
    isOpen: false,
    items: [],
    isRecursive: true,
    loading: false,
    error: null,
    isMaximized: false,
  });

  const [passwordModal, setPasswordModal] = useState<{ isOpen: boolean; passwordInput: string }>({
    isOpen: false,
    passwordInput: '',
  });

  // Multi-selection & Download State
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);

  // Upload Modal State
  const [uploadModal, setUploadModal] = useState<{
    isOpen: boolean;
    targetPath: string;
    selectedFiles: File[];
    isUploading: boolean;
    uploadProgress: number;
    currentFileIndex: number;
    error: string | null;
  }>({
    isOpen: false,
    targetPath: '',
    selectedFiles: [],
    isUploading: false,
    uploadProgress: 0,
    currentFileIndex: 0,
    error: null,
  });

  // Compression Modal State
  const [compressModal, setCompressModal] = useState<{
    isOpen: boolean;
    items: LinuxFsItem[];
    archiveName: string;
    format: 'tar.gz' | 'zip' | 'tar.bz2' | 'tar.xz' | 'tar';
    compressionLevel: number;
    deleteSource: boolean;
    destinationDir: string;
    loading: boolean;
    error: string | null;
    isMaximized?: boolean;
  } | null>(null);

  // Extraction Modal State
  const [extractModal, setExtractModal] = useState<{
    isOpen: boolean;
    item: LinuxFsItem;
    destinationDir: string;
    createSubfolder: boolean;
    overwrite: boolean;
    deleteArchiveAfterExtract: boolean;
    loading: boolean;
    error: string | null;
    isMaximized?: boolean;
  } | null>(null);

  // Properties / Info Modal State
  const [propertiesModal, setPropertiesModal] = useState<{
    isOpen: boolean;
    item: LinuxFsItem | null;
    targetPath: string;
    data: LinuxItemProperties | null;
    loading: boolean;
    error: string | null;
  }>({
    isOpen: false,
    item: null,
    targetPath: '',
    data: null,
    loading: false,
    error: null,
  });

  // Permissions & Ownership Interactive Editor State
  const [permEdit, setPermEdit] = useState<{
    octal: string;
    ownerRead: boolean;
    ownerWrite: boolean;
    ownerExec: boolean;
    groupRead: boolean;
    groupWrite: boolean;
    groupExec: boolean;
    othersRead: boolean;
    othersWrite: boolean;
    othersExec: boolean;
    suid: boolean;
    sgid: boolean;
    sticky: boolean;
    owner: string;
    group: string;
    recursive: boolean;
  }>({
    octal: '0755',
    ownerRead: true,
    ownerWrite: true,
    ownerExec: true,
    groupRead: true,
    groupWrite: false,
    groupExec: true,
    othersRead: true,
    othersWrite: false,
    othersExec: true,
    suid: false,
    sgid: false,
    sticky: false,
    owner: 'root',
    group: 'root',
    recursive: false,
  });

  const [isSavingAttributes, setIsSavingAttributes] = useState(false);
  const [attributeSaveSuccess, setAttributeSaveSuccess] = useState<string | null>(null);
  const [attributeSaveError, setAttributeSaveError] = useState<string | null>(null);
  const [systemUsers, setSystemUsers] = useState<string[]>([]);
  const [systemGroups, setSystemGroups] = useState<string[]>([]);
  const [isLoadingUsersGroups, setIsLoadingUsersGroups] = useState(false);

  // Clipboard State for Copy / Cut / Paste across directories
  const [clipboard, setClipboard] = useState<{
    items: LinuxFsItem[];
    operation: 'copy' | 'cut';
    sourceDirectory: string;
  } | null>(null);
  const [isPasting, setIsPasting] = useState(false);

  // Context Menu State for Right-Click Actions (item can be null for empty space)
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    item: LinuxFsItem | null;
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

  const handleEmptyAreaContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedPaths(new Set());
    setSelectedItem(null);
    const menuWidth = 240;
    const menuHeight = 220;
    const x = Math.max(12, Math.min(e.clientX, window.innerWidth - menuWidth - 12));
    const y = Math.max(12, Math.min(e.clientY, window.innerHeight - menuHeight - 12));
    setContextMenu({
      isOpen: true,
      x,
      y,
      item: null,
    });
  };

  const handleUploadFiles = async () => {
    if (!server || uploadModal.selectedFiles.length === 0) return;
    setUploadModal((prev) => ({ ...prev, isUploading: true, error: null, uploadProgress: 0 }));

    const total = uploadModal.selectedFiles.length;
    let uploadedCount = 0;

    for (let i = 0; i < total; i++) {
      const file = uploadModal.selectedFiles[i];
      setUploadModal((prev) => ({
        ...prev,
        currentFileIndex: i,
        uploadProgress: Math.round((i / total) * 100),
      }));

      try {
        const res = await uploadLinuxFile(
          server.id,
          uploadModal.targetPath || currentPath,
          file,
          ephemeralPassword || sessionPassword
        );
        if (!res.success) {
          setUploadModal((prev) => ({
            ...prev,
            isUploading: false,
            error:
              res.error ||
              (isEn ? `Failed to upload "${file.name}"` : `خطا در بارگذاری فایل "${file.name}"`),
          }));
          return;
        }
        uploadedCount++;
      } catch (err: any) {
        setUploadModal((prev) => ({
          ...prev,
          isUploading: false,
          error:
            err?.message ||
            (isEn ? `Error uploading "${file.name}"` : `خطا در بارگذاری فایل "${file.name}"`),
        }));
        return;
      }
    }

    const destPath = uploadModal.targetPath || currentPath;
    setUploadModal({
      isOpen: false,
      targetPath: '',
      selectedFiles: [],
      isUploading: false,
      uploadProgress: 100,
      currentFileIndex: 0,
      error: null,
    });

    setDownloadNotice(
      isEn
        ? `${uploadedCount} file(s) uploaded successfully`
        : `${uploadedCount} فایل با موفقیت در پوشه بارگذاری شد`
    );
    setTimeout(() => setDownloadNotice(null), 3500);

    // Refresh directory
    loadDirectory(destPath, ephemeralPassword, false);
  };

  const handleOpenProperties = (item: LinuxFsItem | null, customPath?: string) => {
    if (!server) return;
    const targetPath = item ? item.path : (customPath || currentPath);
    setPropertiesModal({
      isOpen: true,
      item,
      targetPath,
      data: null,
      loading: true,
      error: null,
    });
    setContextMenu(null);
    setAttributeSaveSuccess(null);
    setAttributeSaveError(null);

    // Fetch live system users & groups if not already loaded
    if (systemUsers.length === 0) {
      setIsLoadingUsersGroups(true);
      fetchLinuxSystemUsersAndGroups(server.id, ephemeralPassword || sessionPassword)
        .then((ugRes) => {
          if (ugRes.success) {
            if (ugRes.users) setSystemUsers(ugRes.users);
            if (ugRes.groups) setSystemGroups(ugRes.groups);
          }
        })
        .catch(() => {})
        .finally(() => setIsLoadingUsersGroups(false));
    }

    fetchLinuxItemProperties(server.id, targetPath, ephemeralPassword || sessionPassword)
      .then((res) => {
        if (res.success && res.properties) {
          const props = res.properties;
          setPropertiesModal((prev) => ({
            ...prev,
            data: props,
            loading: false,
            error: null,
          }));

          const rawOct = (props.octalPermissions || '0755').replace(/[^0-7]/g, '');
          let s = 0;
          let u = 7;
          let g = 5;
          let o = 5;
          if (rawOct.length === 4) {
            s = parseInt(rawOct[0], 10) || 0;
            u = parseInt(rawOct[1], 10) || 0;
            g = parseInt(rawOct[2], 10) || 0;
            o = parseInt(rawOct[3], 10) || 0;
          } else if (rawOct.length === 3) {
            s = 0;
            u = parseInt(rawOct[0], 10) || 0;
            g = parseInt(rawOct[1], 10) || 0;
            o = parseInt(rawOct[2], 10) || 0;
          }

          setPermEdit({
            octal: `${s}${u}${g}${o}`,
            ownerRead: Boolean(u & 4),
            ownerWrite: Boolean(u & 2),
            ownerExec: Boolean(u & 1),
            groupRead: Boolean(g & 4),
            groupWrite: Boolean(g & 2),
            groupExec: Boolean(g & 1),
            othersRead: Boolean(o & 4),
            othersWrite: Boolean(o & 2),
            othersExec: Boolean(o & 1),
            suid: Boolean(s & 4) || Boolean(props.suid),
            sgid: Boolean(s & 2) || Boolean(props.sgid),
            sticky: Boolean(s & 1) || Boolean(props.sticky),
            owner: props.ownerUser || 'root',
            group: props.groupName || 'root',
            recursive: false,
          });
        } else {
          setPropertiesModal((prev) => ({
            ...prev,
            loading: false,
            error: res.error || (isEn ? 'Failed to fetch detailed attributes' : 'خطا در دریافت مشخصات تفصیلی'),
          }));
        }
      })
      .catch((err) => {
        setPropertiesModal((prev) => ({
          ...prev,
          loading: false,
          error: err?.message || (isEn ? 'Connection error' : 'خطای ارتباط با سرور'),
        }));
      });
  };

  // Toggle individual permission bit and recompute octal
  const handleTogglePerm = (key: keyof typeof permEdit) => {
    setPermEdit((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      const s = (next.suid ? 4 : 0) + (next.sgid ? 2 : 0) + (next.sticky ? 1 : 0);
      const u = (next.ownerRead ? 4 : 0) + (next.ownerWrite ? 2 : 0) + (next.ownerExec ? 1 : 0);
      const g = (next.groupRead ? 4 : 0) + (next.groupWrite ? 2 : 0) + (next.groupExec ? 1 : 0);
      const o = (next.othersRead ? 4 : 0) + (next.othersWrite ? 2 : 0) + (next.othersExec ? 1 : 0);
      next.octal = `${s}${u}${g}${o}`;
      return next;
    });
  };

  // Update permissions directly from manual octal input (3 or 4 digits)
  const handleOctalInputChange = (val: string) => {
    const digits = val.replace(/[^0-7]/g, '').slice(0, 4);
    setPermEdit((prev) => {
      let s = 0;
      let u = 0;
      let g = 0;
      let o = 0;
      if (digits.length === 4) {
        s = parseInt(digits[0], 10) || 0;
        u = parseInt(digits[1], 10) || 0;
        g = parseInt(digits[2], 10) || 0;
        o = parseInt(digits[3], 10) || 0;
      } else if (digits.length === 3) {
        s = 0;
        u = parseInt(digits[0], 10) || 0;
        g = parseInt(digits[1], 10) || 0;
        o = parseInt(digits[2], 10) || 0;
      } else {
        return { ...prev, octal: digits };
      }

      return {
        ...prev,
        octal: digits,
        ownerRead: Boolean(u & 4),
        ownerWrite: Boolean(u & 2),
        ownerExec: Boolean(u & 1),
        groupRead: Boolean(g & 4),
        groupWrite: Boolean(g & 2),
        groupExec: Boolean(g & 1),
        othersRead: Boolean(o & 4),
        othersWrite: Boolean(o & 2),
        othersExec: Boolean(o & 1),
        suid: Boolean(s & 4),
        sgid: Boolean(s & 2),
        sticky: Boolean(s & 1),
      };
    });
  };

  // Apply quick permission presets
  const handleApplyPreset = (presetOctal: string) => {
    handleOctalInputChange(presetOctal);
  };

  // Live preview string (e.g. -rwxr-xr-x or drwxrwsr-x)
  const computedPreviewPerms = useMemo(() => {
    const isDir = propertiesModal.data?.type === 'directory' || propertiesModal.item?.type === 'directory';
    const typeChar = isDir ? 'd' : '-';
    const uR = permEdit.ownerRead ? 'r' : '-';
    const uW = permEdit.ownerWrite ? 'w' : '-';
    const uX = permEdit.ownerExec ? (permEdit.suid ? 's' : 'x') : (permEdit.suid ? 'S' : '-');
    const gR = permEdit.groupRead ? 'r' : '-';
    const gW = permEdit.groupWrite ? 'w' : '-';
    const gX = permEdit.groupExec ? (permEdit.sgid ? 's' : 'x') : (permEdit.sgid ? 'S' : '-');
    const oR = permEdit.othersRead ? 'r' : '-';
    const oW = permEdit.othersWrite ? 'w' : '-';
    const oX = permEdit.othersExec ? (permEdit.sticky ? 't' : 'x') : (permEdit.sticky ? 'T' : '-');
    return `${typeChar}${uR}${uW}${uX}${gR}${gW}${gX}${oR}${oW}${oX}`;
  }, [permEdit, propertiesModal.data?.type, propertiesModal.item?.type]);

  // Save changes to permissions and ownership via SSH
  const handleSaveAttributes = async () => {
    if (!server) return;
    const targetPath = propertiesModal.data?.path || propertiesModal.targetPath;
    if (!targetPath) return;

    setIsSavingAttributes(true);
    setAttributeSaveSuccess(null);
    setAttributeSaveError(null);

    try {
      const res = await updateLinuxItemAttributes(server.id, {
        path: targetPath,
        mode: permEdit.octal,
        owner: permEdit.owner.trim() || undefined,
        group: permEdit.group.trim() || undefined,
        recursive: permEdit.recursive,
        password: ephemeralPassword || sessionPassword,
      });

      if (res.success) {
        setAttributeSaveSuccess(
          isEn
            ? 'Permissions & ownership updated successfully!'
            : 'سطح دسترسی و مالکیت با موفقیت اعمال و ذخیره شد!'
        );
        if (res.properties) {
          setPropertiesModal((prev) => ({
            ...prev,
            data: res.properties!,
          }));
        }
        // Refresh directory listing so the file list immediately reflects new permissions
        loadDirectory(currentPath, ephemeralPassword, false);
      } else {
        setAttributeSaveError(
          res.error || (isEn ? 'Failed to update attributes' : 'خطا در اعمال تغییرات دسترسی و مالکیت')
        );
      }
    } catch (err: any) {
      setAttributeSaveError(err?.message || (isEn ? 'Connection error' : 'خطای ارتباط با سرور'));
    } finally {
      setIsSavingAttributes(false);
    }
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

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

  // Clipboard Operations (Copy, Cut, Paste)
  const handleCopyItems = useCallback((itemsToCopy: LinuxFsItem[]) => {
    if (itemsToCopy.length === 0) return;
    setClipboard({
      items: itemsToCopy,
      operation: 'copy',
      sourceDirectory: currentPath,
    });
    setContextMenu(null);
    setFeedback({
      message: isEn
        ? `Copied ${itemsToCopy.length} item(s) to clipboard`
        : `${itemsToCopy.length} مورد به حافظه موقت کپی شد`,
      type: 'info',
    });
    setTimeout(() => setFeedback(null), 3500);
  }, [currentPath, isEn]);

  const handleCutItems = useCallback((itemsToCut: LinuxFsItem[]) => {
    if (itemsToCut.length === 0) return;
    setClipboard({
      items: itemsToCut,
      operation: 'cut',
      sourceDirectory: currentPath,
    });
    setContextMenu(null);
    setFeedback({
      message: isEn
        ? `Cut ${itemsToCut.length} item(s). Ready to paste.`
        : `${itemsToCut.length} مورد برش (کات) شد. آماده برای انتقال و چسباندن.`,
      type: 'info',
    });
    setTimeout(() => setFeedback(null), 3500);
  }, [currentPath, isEn]);

  const handlePasteItems = useCallback(async (targetDirectory: string) => {
    if (!server || !clipboard || clipboard.items.length === 0) return;
    setIsPasting(true);
    setContextMenu(null);
    const count = clipboard.items.length;
    const op = clipboard.operation;
    try {
      const res = await pasteLinuxItems(
        server.id,
        clipboard.items.map((i) => i.path),
        targetDirectory,
        op,
        ephemeralPassword || sessionPassword
      );
      if (!res.success) {
        setFeedback({
          message: res.error || (isEn ? 'Failed to paste items' : 'خطا در عملیات چسباندن آیتم‌ها'),
          type: 'error',
        });
      } else {
        setFeedback({
          message: isEn
            ? `Successfully ${op === 'cut' ? 'moved' : 'copied'} ${res.processedCount || count} item(s) to ${targetDirectory}`
            : `${res.processedCount || count} مورد با موفقیت به ${targetDirectory} ${op === 'cut' ? 'منتقل شد' : 'کپی شد'}`,
          type: 'success',
        });
        if (op === 'cut') {
          setClipboard(null);
        }
        loadDirectory(currentPath, ephemeralPassword, false);
      }
    } catch (err: any) {
      setFeedback({
        message: err?.message || (isEn ? 'Error pasting items' : 'خطا در پردازش چسباندن'),
        type: 'error',
      });
    } finally {
      setIsPasting(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  }, [server, clipboard, ephemeralPassword, sessionPassword, isEn, currentPath, loadDirectory]);

  const handleClearClipboard = useCallback(() => {
    setClipboard(null);
    setContextMenu(null);
  }, []);

  // Keyboard shortcuts (Ctrl+C, Ctrl+X, Ctrl+V, Escape)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.getAttribute('role') === 'textbox')
      ) {
        return;
      }

      // Ctrl+C / Cmd+C (Copy)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (selectedPaths.size > 0) {
          e.preventDefault();
          const selItems = items.filter((it) => selectedPaths.has(it.path));
          if (selItems.length > 0) {
            handleCopyItems(selItems);
          }
        }
      }
      // Ctrl+X / Cmd+X (Cut)
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        if (selectedPaths.size > 0) {
          e.preventDefault();
          const selItems = items.filter((it) => selectedPaths.has(it.path));
          if (selItems.length > 0) {
            handleCutItems(selItems);
          }
        }
      }
      // Ctrl+V / Cmd+V (Paste)
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (clipboard && clipboard.items.length > 0) {
          e.preventDefault();
          handlePasteItems(currentPath);
        }
      }
      // Escape to cancel cut
      else if (e.key === 'Escape' && clipboard?.operation === 'cut') {
        setClipboard(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedPaths, items, clipboard, currentPath, handleCopyItems, handleCutItems, handlePasteItems]);

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

  // Delete Items (Bulk & Single)
  const handleDeleteItems = async () => {
    if (!server || !deleteDialog.items || deleteDialog.items.length === 0) return;
    setDeleteDialog((prev) => ({ ...prev, loading: true, error: null }));

    const pathsToDelete = deleteDialog.items.map((it) => it.path);
    try {
      const res = await deleteLinuxRemoteItems(
        server.id,
        pathsToDelete,
        deleteDialog.isRecursive,
        ephemeralPassword
      );
      if (res.success) {
        const count = res.deletedCount ?? deleteDialog.items.length;
        const msg =
          count === 1
            ? isEn
              ? `Deleted "${deleteDialog.items[0].name}"`
              : `آیتم "${deleteDialog.items[0].name}" با موفقیت حذف شد`
            : isEn
            ? `Successfully deleted ${count} items`
            : `${count} مورد با موفقیت حذف شدند`;
        setDeleteDialog({
          isOpen: false,
          items: [],
          isRecursive: true,
          loading: false,
          error: null,
          isMaximized: false,
        });
        setSelectedPaths(new Set());
        showToast(msg, 'info');
        loadDirectory(currentPath, ephemeralPassword, false);
      } else {
        setDeleteDialog((prev) => ({
          ...prev,
          loading: false,
          error: res.error || 'Failed to delete items',
        }));
      }
    } catch (err: any) {
      setDeleteDialog((prev) => ({
        ...prev,
        loading: false,
        error: err?.message || 'Connection error',
      }));
    }
  };

  // Copy Path to Clipboard
  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    showToast(isEn ? `Path copied: ${path}` : `مسیر در کلیپ‌بورد کپی شد: ${path}`, 'info');
  };

  // Open Compression Modal
  const handleOpenCompress = (targetItems: LinuxFsItem[]) => {
    if (!targetItems || targetItems.length === 0) return;
    const firstItem = targetItems[0];
    let defaultBaseName = targetItems.length === 1 ? firstItem.name : 'archive';
    if (targetItems.length === 1 && firstItem.type === 'file') {
      const lastDot = defaultBaseName.lastIndexOf('.');
      if (lastDot > 0) {
        defaultBaseName = defaultBaseName.substring(0, lastDot);
      }
    }
    setCompressModal({
      isOpen: true,
      items: targetItems,
      archiveName: defaultBaseName,
      format: 'tar.gz',
      compressionLevel: 6,
      deleteSource: false,
      destinationDir: currentPath,
      loading: false,
      error: null,
      isMaximized: false,
    });
    setContextMenu(null);
  };

  // Execute Compression on Remote Server
  const handleExecuteCompress = async () => {
    if (!server || !compressModal) return;
    setCompressModal((prev) => (prev ? { ...prev, loading: true, error: null } : null));

    try {
      const res = await compressLinuxRemoteItems(server.id, {
        sourcePaths: compressModal.items.map((it) => it.path),
        archiveName: compressModal.archiveName,
        destinationDir: compressModal.destinationDir || currentPath,
        format: compressModal.format,
        compressionLevel: compressModal.compressionLevel,
        deleteSource: compressModal.deleteSource,
        password: ephemeralPassword,
      });

      if (res.success) {
        const createdName = res.archivePath
          ? res.archivePath.split('/').pop()
          : `${compressModal.archiveName}.${compressModal.format}`;
        setCompressModal(null);
        showToast(
          isEn
            ? `Compressed successfully: ${createdName}${res.sizeHuman ? ` (${res.sizeHuman})` : ''}`
            : `فشرده‌سازی با موفقیت انجام شد: ${createdName}${res.sizeHuman ? ` (${res.sizeHuman})` : ''}`,
          'success'
        );
        loadDirectory(currentPath, ephemeralPassword, false);
      } else {
        setCompressModal((prev) => (prev ? { ...prev, loading: false, error: res.error || 'Failed to compress' } : null));
      }
    } catch (err: any) {
      setCompressModal((prev) => (prev ? { ...prev, loading: false, error: err?.message || 'Connection error' } : null));
    }
  };

  // Open Extract Modal
  const handleOpenExtract = (item: LinuxFsItem) => {
    setExtractModal({
      isOpen: true,
      item,
      destinationDir: currentPath,
      createSubfolder: true,
      overwrite: true,
      deleteArchiveAfterExtract: false,
      loading: false,
      error: null,
      isMaximized: false,
    });
    setContextMenu(null);
  };

  // Quick Extract into Current Directory
  const handleQuickExtractCurrentDir = async (item: LinuxFsItem) => {
    if (!server) return;
    setContextMenu(null);
    showToast(
      isEn
        ? `Extracting "${item.name}" into current directory...`
        : `در حال استخراج "${item.name}" در مسیر جاری...`,
      'info'
    );
    try {
      const res = await extractLinuxRemoteArchive(server.id, {
        archivePath: item.path,
        destinationDir: currentPath,
        createSubfolder: false,
        overwrite: true,
        deleteArchiveAfterExtract: false,
        password: ephemeralPassword,
      });

      if (res.success) {
        showToast(
          isEn
            ? `Extracted successfully into "${res.extractedTo || currentPath}"`
            : `استخراج با موفقیت در پوشه "${res.extractedTo || currentPath}" انجام شد`,
          'success'
        );
        loadDirectory(currentPath, ephemeralPassword, false);
      } else {
        showToast(res.error || (isEn ? 'Failed to extract archive' : 'خطا در استخراج فایل فشرده'), 'error');
      }
    } catch (err: any) {
      showToast(err?.message || (isEn ? 'Connection error' : 'خطای ارتباط با سرور'), 'error');
    }
  };

  // Execute Extract from Modal
  const handleExecuteExtract = async () => {
    if (!server || !extractModal) return;
    setExtractModal((prev) => (prev ? { ...prev, loading: true, error: null } : null));

    try {
      const res = await extractLinuxRemoteArchive(server.id, {
        archivePath: extractModal.item.path,
        destinationDir: extractModal.destinationDir || currentPath,
        createSubfolder: extractModal.createSubfolder,
        overwrite: extractModal.overwrite,
        deleteArchiveAfterExtract: extractModal.deleteArchiveAfterExtract,
        password: ephemeralPassword,
      });

      if (res.success) {
        const dest = res.extractedTo || extractModal.destinationDir || currentPath;
        setExtractModal(null);
        showToast(
          isEn
            ? `Extracted successfully into "${dest}"`
            : `استخراج با موفقیت در پوشه "${dest}" انجام شد`,
          'success'
        );
        loadDirectory(currentPath, ephemeralPassword, false);
      } else {
        setExtractModal((prev) => (prev ? { ...prev, loading: false, error: res.error || 'Failed to extract' } : null));
      }
    } catch (err: any) {
      setExtractModal((prev) => (prev ? { ...prev, loading: false, error: err?.message || 'Connection error' } : null));
    }
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

  return createPortal(
    <div
      className={
        isMaximized
          ? 'fixed top-0 left-0 right-0 bottom-8 z-[9999] p-0 flex flex-col'
          : 'fixed top-0 left-0 right-0 bottom-8 z-[9999] p-2 sm:p-4 bg-black/80 backdrop-blur-sm flex items-center justify-center'
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
          className={`flex items-center justify-between px-4 sm:px-6 py-3 border-b shrink-0 relative z-20 ${
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
          <div className="flex items-center gap-1.5 shrink-0 relative z-20">
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

                {/* Compress Selected */}
                {selectedPaths.size > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const selItems = items.filter((it) => selectedPaths.has(it.path));
                      handleOpenCompress(selItems);
                    }}
                    title={isEn ? `Compress selected (${selectedPaths.size})` : `فشرده‌سازی موارد انتخابی (${selectedPaths.size})`}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30 text-xs font-semibold cursor-pointer transition animate-in fade-in"
                  >
                    <FileArchive className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">
                      {isEn ? `Compress (${selectedPaths.size})` : `فشرده‌سازی (${selectedPaths.size})`}
                    </span>
                  </button>
                )}

                {/* Delete Selected (Bulk Delete) */}
                {selectedPaths.size > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const selItems = items.filter((it) => selectedPaths.has(it.path));
                      setDeleteDialog({
                        isOpen: true,
                        items: selItems,
                        isRecursive: true,
                        loading: false,
                        error: null,
                        isMaximized: false,
                      });
                    }}
                    title={
                      isEn
                        ? `Delete selected (${selectedPaths.size}) items permanently`
                        : `حذف قطعی موارد انتخابی (${selectedPaths.size})`
                    }
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 text-xs font-semibold cursor-pointer transition animate-in fade-in"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span className="hidden sm:inline">
                      {isEn ? `Delete (${selectedPaths.size})` : `حذف (${selectedPaths.size})`}
                    </span>
                  </button>
                )}

                {/* Upload File */}
                <button
                  type="button"
                  onClick={() =>
                    setUploadModal({
                      isOpen: true,
                      targetPath: currentPath,
                      selectedFiles: [],
                      isUploading: false,
                      uploadProgress: 0,
                      currentFileIndex: 0,
                      error: null,
                    })
                  }
                  title={isEn ? 'Upload file to this folder' : 'بارگذاری فایل در این پوشه'}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/40 hover:bg-blue-500/30 text-xs font-semibold cursor-pointer transition"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{isEn ? 'Upload' : 'بارگذاری'}</span>
                </button>

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
            <div
              className="flex-1 overflow-y-auto p-3 relative"
              onContextMenu={handleEmptyAreaContextMenu}
            >
              {/* Active Clipboard Status Banner */}
              {clipboard && clipboard.items.length > 0 && (
                <div
                  className={`p-2.5 px-4 mb-3 rounded-xl border flex flex-wrap items-center justify-between gap-3 shadow-md backdrop-blur-md animate-in slide-in-from-top-2 ${
                    isLightMode
                      ? 'bg-amber-50/95 border-amber-300 text-amber-950'
                      : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs">
                    {clipboard.operation === 'cut' ? (
                      <Scissors className="w-4 h-4 text-amber-400 shrink-0" />
                    ) : (
                      <Copy className="w-4 h-4 text-cyan-400 shrink-0" />
                    )}
                    <span className="font-semibold">
                      {clipboard.operation === 'cut'
                        ? (isEn ? 'Cut to clipboard:' : 'برش در کلیپ‌بورد:')
                        : (isEn ? 'Copied to clipboard:' : 'کپی در کلیپ‌بورد:')}
                    </span>
                    <span className="font-mono bg-black/20 px-2 py-0.5 rounded text-[11px] font-bold">
                      {isEn
                        ? `${clipboard.items.length} item(s)`
                        : `${clipboard.items.length} مورد`}
                    </span>
                    <span className="text-[11px] text-slate-400 hidden md:inline truncate max-w-xs font-mono">
                      ({isEn ? 'from' : 'از'} {clipboard.sourceDirectory})
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handlePasteItems(currentPath)}
                      disabled={isPasting}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition font-bold text-xs cursor-pointer shadow disabled:opacity-50"
                    >
                      {isPasting ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ClipboardPaste className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {isEn
                          ? `Paste Here (${clipboard.items.length})`
                          : `چسباندن در اینجا (${clipboard.items.length})`}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={handleClearClipboard}
                      title={isEn ? 'Clear Clipboard' : 'خالی کردن حافظه موقت'}
                      className="p-1.5 rounded-lg hover:bg-black/20 text-slate-400 hover:text-white transition cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

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
                        const isCutItem = clipboard?.operation === 'cut' && clipboard.items.some((ci) => ci.path === item.path);

                        return (
                          <tr
                            key={item.path}
                            onClick={(e) => handleItemClick(item, e)}
                            onDoubleClick={() => handleItemDoubleClick(item)}
                            onContextMenu={(e) => handleItemContextMenu(e, item)}
                            className={`transition cursor-pointer select-none ${
                              isCutItem
                                ? 'opacity-40 border-dashed border-amber-500/50 italic bg-amber-500/10'
                                : isSelected
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
                                <div className="min-w-0 flex items-center gap-1.5">
                                  <span className="font-mono text-xs truncate block hover:underline">
                                    {item.name}
                                  </span>
                                  {isCutItem && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                                      <Scissors className="w-2.5 h-2.5 animate-pulse" />
                                      {isEn ? 'Cut' : 'برش'}
                                    </span>
                                  )}
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
                    const isCutItem = clipboard?.operation === 'cut' && clipboard.items.some((ci) => ci.path === item.path);

                    return (
                      <div
                        key={item.path}
                        onClick={(e) => handleItemClick(item, e)}
                        onDoubleClick={() => handleItemDoubleClick(item)}
                        onContextMenu={(e) => handleItemContextMenu(e, item)}
                        className={`p-3 rounded-xl border flex flex-col items-center text-center transition cursor-pointer relative group select-none ${
                          isCutItem
                            ? 'opacity-40 border-dashed border-amber-500/60 bg-amber-500/10 ring-1 ring-amber-400/40'
                            : isSelected
                            ? isLightMode
                              ? 'bg-cyan-50 border-cyan-500/60 text-cyan-950 font-semibold ring-2 ring-cyan-400'
                              : 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200 font-semibold ring-2 ring-cyan-400/60'
                            : isLightMode
                            ? 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md text-slate-800'
                            : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900 text-slate-200'
                        }`}
                      >
                        {isCutItem && (
                          <div className="absolute top-1.5 left-1.5 px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[9px] flex items-center gap-1 font-bold">
                            <Scissors className="w-2.5 h-2.5 animate-pulse" />
                            {isEn ? 'Cut' : 'برش'}
                          </div>
                        )}
                        {item.type === 'directory' ? (
                          <div className="py-1 flex items-center justify-center">
                            <ModernFolderIcon className="w-14 h-14 sm:w-16 sm:h-16" isSelected={isSelected} />
                          </div>
                        ) : (
                          <div className={`p-2.5 rounded-xl ${iconInfo.bgColor} ${iconInfo.color} mb-1.5 flex items-center justify-center transition-transform group-hover:scale-105`}>
                            <IconComp className="w-7 h-7" />
                          </div>
                        )}
                        <span className="font-mono text-xs truncate max-w-full block font-medium mt-1">
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
          <div className="fixed top-0 left-0 right-0 bottom-8 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
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
          <div className="fixed top-0 left-0 right-0 bottom-8 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
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
          <div className="fixed top-0 left-0 right-0 bottom-8 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
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
        {/* DELETE CONFIRMATION DIALOG (SINGLE & BULK RECURSIVE)      */}
        {/* ======================================================== */}
        {deleteDialog.isOpen && deleteDialog.items.length > 0 &&
          createPortal(
            <div
              className={`fixed top-0 left-0 right-0 bottom-8 z-[99999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs transition-all ${
                deleteDialog.isMaximized ? 'p-0' : ''
              }`}
            >
              <div
                className={`flex flex-col transition-all duration-200 border shadow-2xl ${
                  deleteDialog.isMaximized
                    ? 'fixed top-0 left-0 right-0 bottom-8 z-[99999] w-full h-auto rounded-none border-none'
                    : 'w-full max-w-lg rounded-2xl max-h-[90vh]'
                } ${
                  isLightMode
                    ? 'bg-white border-slate-200 text-slate-900'
                    : 'bg-slate-950 border-rose-500/30 text-slate-100'
                }`}
              >
                {/* Header with 3 control buttons */}
                <div
                  className={`px-5 py-4 border-b flex items-center justify-between shrink-0 ${
                    isLightMode ? 'border-slate-200 bg-rose-50/50' : 'border-rose-500/20 bg-rose-950/20'
                  }`}
                >
                  <div className="flex items-center gap-2.5 text-rose-400">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <div>
                      <h3 className="font-bold text-sm leading-tight">
                        {isEn
                          ? deleteDialog.items.length > 1
                            ? `Confirm Deletion (${deleteDialog.items.length} Items)`
                            : 'Confirm Deletion'
                          : deleteDialog.items.length > 1
                          ? `تأیید حذف گروهی (${deleteDialog.items.length} مورد)`
                          : 'تأیید حذف آیتم'}
                      </h3>
                      <p className="text-[11px] text-slate-400 font-mono">
                        {server?.name || server?.ip}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Minimize */}
                    <button
                      type="button"
                      onClick={() =>
                        setDeleteDialog((prev) => ({
                          ...prev,
                          isOpen: false,
                        }))
                      }
                      title={isEn ? 'Minimize' : 'کوچک‌سازی'}
                      className={`p-1.5 rounded-lg border transition cursor-pointer ${
                        isLightMode
                          ? 'border-slate-200 text-slate-500 hover:bg-slate-100'
                          : 'border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>

                    {/* Maximize / Restore */}
                    <button
                      type="button"
                      onClick={() =>
                        setDeleteDialog((prev) => ({
                          ...prev,
                          isMaximized: !prev.isMaximized,
                        }))
                      }
                      title={
                        deleteDialog.isMaximized
                          ? isEn
                            ? 'Exit Fullscreen'
                            : 'خروج از تمام‌صفحه'
                          : isEn
                          ? 'Fullscreen'
                          : 'تمام‌صفحه'
                      }
                      className={`p-1.5 rounded-lg border transition cursor-pointer ${
                        isLightMode
                          ? 'border-slate-200 text-slate-500 hover:bg-slate-100'
                          : 'border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {deleteDialog.isMaximized ? (
                        <Minimize2 className="w-3.5 h-3.5" />
                      ) : (
                        <Maximize2 className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {/* Close */}
                    <button
                      type="button"
                      onClick={() =>
                        setDeleteDialog({
                          isOpen: false,
                          items: [],
                          isRecursive: true,
                          loading: false,
                          error: null,
                          isMaximized: false,
                        })
                      }
                      title={isEn ? 'Close' : 'بستن'}
                      className="p-1.5 rounded-lg border border-rose-500/20 text-rose-400 hover:bg-rose-500/15 transition cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
                  {/* Question Prompt */}
                  <p className="font-medium text-slate-300">
                    {isEn
                      ? deleteDialog.items.length > 1
                        ? `Are you sure you want to permanently delete these ${deleteDialog.items.length} items from the remote server?`
                        : `Are you sure you want to permanently delete this ${
                            deleteDialog.items[0]?.type === 'directory' ? 'directory' : 'file'
                          }?`
                      : deleteDialog.items.length > 1
                      ? `آیا از حذف قطعی این ${deleteDialog.items.length} مورد از سرور اطمینان دارید؟`
                      : `آیا از حذف قطعی این ${
                          deleteDialog.items[0]?.type === 'directory' ? 'پوشه' : 'فایل'
                        } مطمئن هستید؟`}
                  </p>

                  {/* List of items to delete */}
                  <div
                    className={`rounded-xl border max-h-48 overflow-y-auto divide-y font-mono ${
                      isLightMode
                        ? 'bg-rose-50/40 border-rose-200 divide-rose-100'
                        : 'bg-rose-950/20 border-rose-500/30 divide-rose-500/20'
                    }`}
                  >
                    {deleteDialog.items.map((item) => (
                      <div
                        key={item.path}
                        className="p-2.5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {item.type === 'directory' ? (
                            <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                          ) : (
                            <File className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                          <span className="font-semibold text-rose-400 truncate">
                            {item.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 text-[11px] text-slate-400">
                          {item.type === 'directory' ? (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                              {isEn ? 'Folder' : 'پوشه'}
                            </span>
                          ) : (
                            <span>{item.sizeHuman}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Folder recursive deletion warning banner */}
                  {deleteDialog.items.some((it) => it.type === 'directory') && (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="text-xs leading-relaxed">
                        <span className="font-bold">
                          {isEn ? 'Directory Content Warning: ' : 'هشدار محتوای پوشه: '}
                        </span>
                        <span>
                          {isEn
                            ? 'One or more folders are selected. Deleting a folder will recursively remove all files, scripts, and nested subfolders inside it.'
                            : 'یک یا چند پوشه انتخاب شده است. حذف پوشه به صورت بازگشتی تمام فایل‌ها، اسکریپت‌ها و زیرپوشه‌های درون آن را به کلی حذف خواهد کرد.'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Recursive Checkbox Option */}
                  {deleteDialog.items.some((it) => it.type === 'directory') && (
                    <div
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 select-none ${
                        isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={deleteDialog.isRecursive}
                          onChange={(e) =>
                            setDeleteDialog((prev) => ({ ...prev, isRecursive: e.target.checked }))
                          }
                          className="rounded text-rose-500 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                        />
                        <span className="font-medium text-slate-200">
                          {isEn
                            ? 'Delete recursively (rm -rf: all nested files and subfolders)'
                            : 'حذف به صورت بازگشتی (rm -rf: تمام فایل‌ها و زیرپوشه‌ها)'}
                        </span>
                      </label>

                      <FieldInfoTooltip
                        title={isEn ? 'Recursive Directory Deletion' : 'حذف بازگشتی دایرکتوری'}
                        infoWhatEn="Instructs the system to use 'rm -rf', deleting the folder along with every single subfolder and contained file inside it."
                        infoWhatFa="اجرای حذف بازگشتی دایرکتوری با دستور rm -rf تا تمام زیرپوشه‌ها و محتویات درون آن بدون خطا به طور کامل پاک شوند."
                        infoWhyEn="Without recursive deletion, Linux refuses to delete non-empty directories and returns 'Directory not empty' error."
                        infoWhyFa="بدون فعال بودن این گزینه، لینوکس از حذف پوشه‌های غیرخالی ممانعت کرده و خطای دایرکتوری خالی نیست می‌دهد."
                        infoExampleEn="rm -rf /var/www/my-app /opt/custom-tools"
                        infoExampleFa="حذف دایرکتوری‌های حاوی پروژه‌ها، لاگ‌ها یا فایل‌های موقت همراه با تمامی زیرشاخه‌ها"
                      />
                    </div>
                  )}

                  {/* Error Notification */}
                  {deleteDialog.error && (
                    <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 font-mono text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                      <span>{deleteDialog.error}</span>
                    </div>
                  )}
                </div>

                {/* Footer Buttons */}
                <div
                  className={`p-4 border-t flex items-center justify-end gap-2.5 shrink-0 ${
                    isLightMode ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-900/50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setDeleteDialog({
                        isOpen: false,
                        items: [],
                        isRecursive: true,
                        loading: false,
                        error: null,
                        isMaximized: false,
                      })
                    }
                    className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-semibold hover:bg-white/10 transition cursor-pointer"
                  >
                    {isEn ? 'Cancel' : 'انصراف'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteItems}
                    disabled={deleteDialog.loading}
                    className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition cursor-pointer shadow-lg shadow-rose-900/30 flex items-center gap-2 disabled:opacity-50"
                  >
                    {deleteDialog.loading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>{isEn ? 'Deleting...' : 'در حال حذف...'}</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>
                          {isEn
                            ? deleteDialog.items.length > 1
                              ? `Delete All (${deleteDialog.items.length}) Items`
                              : 'Delete Permanently'
                            : deleteDialog.items.length > 1
                            ? `حذف قطعی (${deleteDialog.items.length}) مورد`
                            : 'حذف قطعی'}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {/* ======================================================== */}
        {/* PASSWORD REQUIRED PROMPT MODAL (Zero-Storage Policy)    */}
        {/* ======================================================== */}
        {passwordModal.isOpen && (
          <div className="fixed top-0 left-0 right-0 bottom-8 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
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
        {/* FILE UPLOAD MODAL DIALOG                                  */}
        {/* ======================================================== */}
        {uploadModal.isOpen && (
          <div className="fixed top-0 left-0 right-0 bottom-8 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div
              className={`w-full max-w-lg p-5 rounded-2xl border shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 ${
                isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-100'
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <div className="flex items-center gap-2 text-blue-400">
                  <Upload className="w-5 h-5" />
                  <h3 className="font-bold text-sm">
                    {isEn ? 'Upload Files to Server' : 'بارگذاری فایل در سرور لینوکس'}
                  </h3>
                </div>
                <button
                  type="button"
                  disabled={uploadModal.isUploading}
                  onClick={() =>
                    setUploadModal({
                      isOpen: false,
                      targetPath: '',
                      selectedFiles: [],
                      isUploading: false,
                      uploadProgress: 0,
                      currentFileIndex: 0,
                      error: null,
                    })
                  }
                  className="p-1 rounded text-slate-400 hover:text-white cursor-pointer disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Target Path Display */}
              <div className="flex items-center gap-2 p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs font-mono">
                <span className="text-blue-400 font-sans font-medium shrink-0">
                  {isEn ? 'Target Folder:' : 'پوشه مقصد:'}
                </span>
                <span className="truncate text-slate-200" title={uploadModal.targetPath || currentPath}>
                  {uploadModal.targetPath || currentPath}
                </span>
              </div>

              {/* Error Message */}
              {uploadModal.error && (
                <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-mono">
                  {uploadModal.error}
                </div>
              )}

              {/* Drag & Drop Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingOver(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    const dropped = Array.from(e.dataTransfer.files);
                    setUploadModal((prev) => ({
                      ...prev,
                      selectedFiles: [...prev.selectedFiles, ...dropped],
                    }));
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2 ${
                  isDraggingOver
                    ? 'border-blue-400 bg-blue-500/15'
                    : isLightMode
                    ? 'border-slate-300 hover:border-blue-400 bg-slate-50'
                    : 'border-slate-800 hover:border-blue-500/50 bg-slate-900/50'
                }`}
              >
                <Upload className={`w-8 h-8 ${isDraggingOver ? 'text-blue-400 animate-bounce' : 'text-slate-400'}`} />
                <div className="text-xs font-medium">
                  {isEn ? 'Drop files here or click to browse' : 'فایل‌ها را اینجا بکشید و رها کنید یا کلیک کنید'}
                </div>
                <div className="text-[11px] text-slate-400">
                  {isEn ? 'Supports single or multiple files' : 'پشتیبانی از انواع فایل‌ها (تکی یا گروهی)'}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      const chosen = Array.from(e.target.files);
                      setUploadModal((prev) => ({
                        ...prev,
                        selectedFiles: [...prev.selectedFiles, ...chosen],
                      }));
                      e.target.value = '';
                    }
                  }}
                />
              </div>

              {/* Selected Files List */}
              {uploadModal.selectedFiles.length > 0 && (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  <div className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
                    <span>
                      {isEn
                        ? `Selected Files (${uploadModal.selectedFiles.length})`
                        : `فایل‌های انتخاب شده (${uploadModal.selectedFiles.length})`}
                    </span>
                    {!uploadModal.isUploading && (
                      <button
                        type="button"
                        onClick={() => setUploadModal((prev) => ({ ...prev, selectedFiles: [] }))}
                        className="text-rose-400 hover:underline text-[10px] cursor-pointer"
                      >
                        {isEn ? 'Clear All' : 'پاک کردن همه'}
                      </button>
                    )}
                  </div>
                  {uploadModal.selectedFiles.map((f, idx) => (
                    <div
                      key={`${f.name}-${idx}`}
                      className={`flex items-center justify-between p-2 rounded-lg text-xs font-mono ${
                        isLightMode ? 'bg-slate-100' : 'bg-slate-900 border border-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                        <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="truncate">{f.name}</span>
                        <span className="text-[10px] text-slate-400 shrink-0">({formatBytes(f.size)})</span>
                      </div>
                      {!uploadModal.isUploading && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setUploadModal((prev) => ({
                              ...prev,
                              selectedFiles: prev.selectedFiles.filter((_, i) => i !== idx),
                            }));
                          }}
                          className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer ml-2"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Progress Indicator */}
              {uploadModal.isUploading && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-blue-400 flex items-center gap-1.5">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      {isEn
                        ? `Uploading file ${uploadModal.currentFileIndex + 1} of ${uploadModal.selectedFiles.length}...`
                        : `در حال بارگذاری فایل ${uploadModal.currentFileIndex + 1} از ${uploadModal.selectedFiles.length}...`}
                    </span>
                    <span className="text-slate-400 font-bold">{uploadModal.uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(5, uploadModal.uploadProgress)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  disabled={uploadModal.isUploading}
                  onClick={() =>
                    setUploadModal({
                      isOpen: false,
                      targetPath: '',
                      selectedFiles: [],
                      isUploading: false,
                      uploadProgress: 0,
                      currentFileIndex: 0,
                      error: null,
                    })
                  }
                  className="px-3.5 py-1.5 rounded-xl border border-slate-700 text-xs font-medium hover:bg-white/10 cursor-pointer disabled:opacity-50"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="button"
                  disabled={uploadModal.isUploading || uploadModal.selectedFiles.length === 0}
                  onClick={handleUploadFiles}
                  className="px-4 py-1.5 rounded-xl bg-blue-500 text-white font-bold text-xs hover:bg-blue-400 transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {uploadModal.isUploading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{isEn ? 'Uploading...' : 'در حال بارگذاری...'}</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      <span>
                        {isEn
                          ? `Upload (${uploadModal.selectedFiles.length})`
                          : `شروع بارگذاری (${uploadModal.selectedFiles.length})`}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* FILE / DIRECTORY PROPERTIES & INFO MODAL (PORTAL)        */}
        {/* ======================================================== */}
        {propertiesModal.isOpen &&
          createPortal(
            <div className="fixed top-0 left-0 right-0 bottom-8 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs select-none animate-in fade-in duration-150">
              <div
                className={`w-full max-w-xl rounded-2xl border shadow-2xl flex flex-col max-h-[92vh] overflow-hidden ${
                  isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-100'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div
                  className={`px-5 py-3.5 border-b flex items-center justify-between shrink-0 ${
                    isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/80 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 shrink-0">
                      {propertiesModal.item?.type === 'directory' || (!propertiesModal.item && propertiesModal.targetPath) ? (
                        <Folder className="w-5 h-5 text-amber-400" />
                      ) : (
                        <FileText className="w-5 h-5 text-indigo-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm truncate font-mono">
                          {propertiesModal.data?.name || propertiesModal.item?.name || propertiesModal.targetPath.split('/').pop() || '/'}
                        </h3>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${
                            (propertiesModal.data?.type === 'directory' || propertiesModal.item?.type === 'directory')
                              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                              : (propertiesModal.data?.type === 'symlink' || propertiesModal.item?.type === 'symlink')
                              ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                              : 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                          }`}
                        >
                          {propertiesModal.data?.typeHuman ||
                            (propertiesModal.item?.type === 'directory'
                              ? isEn
                                ? 'Directory'
                                : 'پوشه'
                              : isEn
                              ? 'Regular File'
                              : 'فایل معمولی')}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate font-mono mt-0.5">
                        {propertiesModal.targetPath}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setPropertiesModal({
                        isOpen: false,
                        item: null,
                        targetPath: '',
                        data: null,
                        loading: false,
                        error: null,
                      })
                    }
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Body Content */}
                <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs font-sans">
                  {propertiesModal.loading ? (
                    <div className="flex flex-col items-center justify-center py-12 space-y-3">
                      <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
                      <p className="text-xs text-slate-400 font-mono">
                        {isEn ? 'Querying file properties via stat / SFTP...' : 'در حال واکشی اطلاعات تفصیلی فایل...'}
                      </p>
                    </div>
                  ) : (
                    <>
                      {propertiesModal.error && (
                        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>{propertiesModal.error}</span>
                        </div>
                      )}

                      {/* Section 1: General Info Card */}
                      <div
                        className={`p-3.5 rounded-xl border space-y-2.5 ${
                          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
                        }`}
                      >
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Info className="w-3.5 h-3.5 text-indigo-400" />
                          <span>{isEn ? 'General Information' : 'اطلاعات عمومی'}</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="text-slate-400 block text-[11px]">
                              {isEn ? 'Full Path' : 'مسیر کامل'}:
                            </span>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="font-mono text-cyan-400 break-all select-text text-[11px]">
                                {propertiesModal.data?.path || propertiesModal.targetPath}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopyPath(propertiesModal.data?.path || propertiesModal.targetPath)}
                                title={isEn ? 'Copy Path' : 'کپی مسیر'}
                                className="p-1 rounded text-slate-400 hover:text-white shrink-0 cursor-pointer"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          <div>
                            <span className="text-slate-400 block text-[11px]">
                              {isEn ? 'Size' : 'حجم'}:
                            </span>
                            <span className="font-mono font-bold text-slate-200 mt-0.5 block">
                              {propertiesModal.data?.sizeHuman || propertiesModal.item?.sizeHuman || '0 B'}{' '}
                              <span className="text-[10px] text-slate-400 font-normal">
                                ({(propertiesModal.data?.size ?? propertiesModal.item?.size ?? 0).toLocaleString()} {isEn ? 'bytes' : 'بایت'})
                              </span>
                            </span>
                          </div>

                          {propertiesModal.data?.symlinkTarget && (
                            <div className="sm:col-span-2">
                              <span className="text-slate-400 block text-[11px]">
                                {isEn ? 'Symlink Target Destination' : 'مقصد پیوند نمادین (Target)'}:
                              </span>
                              <span className="font-mono text-amber-300 break-all block mt-0.5">
                                → {propertiesModal.data.symlinkTarget}
                              </span>
                            </div>
                          )}

                          {propertiesModal.data?.itemCount !== undefined && (
                            <div>
                              <span className="text-slate-400 block text-[11px]">
                                {isEn ? 'Contained Items' : 'تعداد آیتم‌های درون پوشه'}:
                              </span>
                              <span className="font-mono text-emerald-400 mt-0.5 block font-bold">
                                {propertiesModal.data.itemCount} {isEn ? 'items (direct children)' : 'مورد'}
                              </span>
                            </div>
                          )}

                          <div>
                            <span className="text-slate-400 block text-[11px]">
                              {isEn ? 'Parent Directory' : 'پوشه والد'}:
                            </span>
                            <span className="font-mono text-slate-300 truncate mt-0.5 block">
                              {propertiesModal.data?.parentPath ||
                                propertiesModal.targetPath.substring(0, propertiesModal.targetPath.lastIndexOf('/')) ||
                                '/'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Section 2: Ownership & Access Permissions (Interactive Editor) */}
                      <div
                        className={`p-3.5 rounded-xl border space-y-3.5 ${
                          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
                        }`}
                      >
                        {/* Section Header */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <Lock className="w-4 h-4 text-amber-400" />
                            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                              {isEn ? 'Ownership & Permissions' : 'مالکیت و سطح دسترسی'}
                            </span>
                            <FieldInfoTooltip
                              isEn={isEn}
                              isLightMode={isLightMode}
                              title={isEn ? 'Linux File Permissions' : 'مجوزهای دسترسی لینوکس'}
                              infoWhatEn="Controls POSIX read, write, and execute permissions across Owner, Group, and Others, alongside SUID/SGID/Sticky special modes."
                              infoWhatFa="کنترل مجوزهای خواندن، نوشتن و اجرای لینوکس برای مالک، گروه و سایرین به همراه بیت‌های خاص SUID و SGID و Sticky."
                              infoWhyEn="Protects sensitive data from unauthorized tampering and grants appropriate privileges to system services."
                              infoWhyFa="محافظت از فایل‌های سیستمی و داده‌های محرمانه در برابر تغییر غیرمجاز و تخصیص سطح دسترسی به سرویس‌ها."
                              infoExampleEn="chmod 0755 script.sh or chown www-data:www-data /var/www"
                              infoExampleFa="دستورات chmod 0755 و chown www-data:www-data"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Octal editable badge/input */}
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-slate-400 font-mono">
                                {isEn ? 'Octal:' : 'اکتال:'}
                              </span>
                              <input
                                type="text"
                                maxLength={4}
                                value={permEdit.octal}
                                onChange={(e) => handleOctalInputChange(e.target.value)}
                                className={`font-mono text-xs w-16 px-2 py-0.5 rounded-md border text-center font-bold outline-none transition ${
                                  isLightMode
                                    ? 'bg-amber-50 border-amber-300 text-amber-700 focus:border-amber-500'
                                    : 'bg-amber-500/15 border-amber-500/30 text-amber-300 focus:border-amber-400'
                                }`}
                                title={isEn ? 'Edit Octal Mode (e.g. 0755)' : 'ویرایش مد اکتال (مثلاً 0755)'}
                              />
                            </div>
                            {/* Preview String Badge */}
                            <span className="font-mono text-xs px-2.5 py-0.5 rounded-md bg-slate-800 text-cyan-300 border border-slate-700 font-bold select-all">
                              {computedPreviewPerms}
                            </span>
                          </div>
                        </div>

                        {/* Owner & Group Editable Fields */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          {/* Owner User */}
                          <div
                            className={`p-2.5 rounded-lg border flex flex-col gap-1.5 ${
                              isLightMode ? 'bg-white border-slate-200' : 'bg-black/20 border-white/5'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5 text-cyan-400" />
                                <span className="text-[11px] font-semibold text-slate-300">
                                  {isEn ? 'Owner (User)' : 'کاربر مالک (Owner)'}
                                </span>
                              </div>
                              <FieldInfoTooltip
                                isEn={isEn}
                                isLightMode={isLightMode}
                                title={isEn ? 'File Owner' : 'کاربر مالک فایل'}
                                infoWhatEn="The Linux user account that owns this item and is governed by Owner (u) permissions."
                                infoWhatFa="نام حساب کاربری لینوکس که مالکیت فایل را بر عهده دارد و قوانین دسترسی مالک (u) روی آن اعمال می‌شود."
                                infoWhyEn="Determines who has direct management rights and owner privileges over the file or directory."
                                infoWhyFa="تعیین‌کننده اختیارات مدیریتی و دسترسی‌های مستقیم مالک فایل."
                                infoExampleEn="root, www-data, nginx, ubuntu, or numeric UID like 1000"
                                infoExampleFa="root یا www-data یا nginx یا ubuntu یا شناسه UID عددی"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                list="linux-users-datalist"
                                value={permEdit.owner}
                                onChange={(e) => setPermEdit((prev) => ({ ...prev, owner: e.target.value }))}
                                placeholder="root"
                                className={`w-full px-2.5 py-1 text-xs font-mono rounded-lg border outline-none transition ${
                                  isLightMode
                                    ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-500'
                                    : 'bg-slate-900 border-slate-700 text-slate-200 focus:border-cyan-400'
                                }`}
                              />
                            </div>
                            <datalist id="linux-users-datalist">
                              {systemUsers.map((u) => (
                                <option key={u} value={u} />
                              ))}
                            </datalist>
                          </div>

                          {/* Group */}
                          <div
                            className={`p-2.5 rounded-lg border flex flex-col gap-1.5 ${
                              isLightMode ? 'bg-white border-slate-200' : 'bg-black/20 border-white/5'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5 text-purple-400" />
                                <span className="text-[11px] font-semibold text-slate-300">
                                  {isEn ? 'Group' : 'گروه کاربری (Group)'}
                                </span>
                              </div>
                              <FieldInfoTooltip
                                isEn={isEn}
                                isLightMode={isLightMode}
                                title={isEn ? 'File Group' : 'گروه کاربری فایل'}
                                infoWhatEn="The primary system group assigned to this item, governed by Group (g) permissions."
                                infoWhatFa="گروه کاربری سیستمی که به این فایل یا پوشه اختصاص داده شده است."
                                infoWhyEn="Allows multiple users belonging to the same group to share read or write privileges."
                                infoWhyFa="امکان دسترسی مشترک اعضای گروه به فایل بدون اعطای مجوز دسترسی همگانی."
                                infoExampleEn="root, www-data, docker, wheel, or numeric GID like 1000"
                                infoExampleFa="root یا www-data یا docker یا wheel یا شناسه عددی GID"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                list="linux-groups-datalist"
                                value={permEdit.group}
                                onChange={(e) => setPermEdit((prev) => ({ ...prev, group: e.target.value }))}
                                placeholder="root"
                                className={`w-full px-2.5 py-1 text-xs font-mono rounded-lg border outline-none transition ${
                                  isLightMode
                                    ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-purple-500'
                                    : 'bg-slate-900 border-slate-700 text-slate-200 focus:border-purple-400'
                                }`}
                              />
                            </div>
                            <datalist id="linux-groups-datalist">
                              {systemGroups.map((g) => (
                                <option key={g} value={g} />
                              ))}
                            </datalist>
                          </div>
                        </div>

                        {/* Interactive Permission Checkbox Matrix */}
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                              {isEn ? 'Standard Access Rights (chmod)' : 'ماتریس دسترسی استاندارد (chmod)'}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {isEn ? 'Click any cell to toggle' : 'روی هر خانه برای تغییر کلیک کنید'}
                            </span>
                          </div>

                          <div className="border border-white/10 rounded-lg overflow-hidden font-mono text-[11px]">
                            <div className="grid grid-cols-4 bg-white/5 p-2 font-bold text-slate-300 border-b border-white/10">
                              <span>{isEn ? 'Role' : 'نقش'}</span>
                              <span className="text-center">{isEn ? 'Read (r / 4)' : 'خواندن (r / 4)'}</span>
                              <span className="text-center">{isEn ? 'Write (w / 2)' : 'نوشتن (w / 2)'}</span>
                              <span className="text-center">{isEn ? 'Execute (x / 1)' : 'اجرا (x / 1)'}</span>
                            </div>

                            {/* Owner Row */}
                            <div className="grid grid-cols-4 p-2 items-center border-b border-white/5">
                              <span className="font-sans font-medium text-cyan-300">
                                {isEn ? 'Owner (u)' : 'مالک (u)'}
                              </span>
                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => handleTogglePerm('ownerRead')}
                                  className={`px-2.5 py-1 rounded text-[10px] font-bold transition cursor-pointer ${
                                    permEdit.ownerRead
                                      ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                                      : 'bg-white/5 text-slate-500 hover:text-slate-300'
                                  }`}
                                >
                                  {permEdit.ownerRead ? '✓ Read' : '—'}
                                </button>
                              </div>
                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => handleTogglePerm('ownerWrite')}
                                  className={`px-2.5 py-1 rounded text-[10px] font-bold transition cursor-pointer ${
                                    permEdit.ownerWrite
                                      ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                                      : 'bg-white/5 text-slate-500 hover:text-slate-300'
                                  }`}
                                >
                                  {permEdit.ownerWrite ? '✓ Write' : '—'}
                                </button>
                              </div>
                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => handleTogglePerm('ownerExec')}
                                  className={`px-2.5 py-1 rounded text-[10px] font-bold transition cursor-pointer ${
                                    permEdit.ownerExec
                                      ? 'bg-purple-500/25 text-purple-300 border border-purple-500/40'
                                      : 'bg-white/5 text-slate-500 hover:text-slate-300'
                                  }`}
                                >
                                  {permEdit.ownerExec ? '✓ Exec' : '—'}
                                </button>
                              </div>
                            </div>

                            {/* Group Row */}
                            <div className="grid grid-cols-4 p-2 items-center bg-white/[0.02] border-b border-white/5">
                              <span className="font-sans font-medium text-purple-300">
                                {isEn ? 'Group (g)' : 'گروه (g)'}
                              </span>
                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => handleTogglePerm('groupRead')}
                                  className={`px-2.5 py-1 rounded text-[10px] font-bold transition cursor-pointer ${
                                    permEdit.groupRead
                                      ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                                      : 'bg-white/5 text-slate-500 hover:text-slate-300'
                                  }`}
                                >
                                  {permEdit.groupRead ? '✓ Read' : '—'}
                                </button>
                              </div>
                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => handleTogglePerm('groupWrite')}
                                  className={`px-2.5 py-1 rounded text-[10px] font-bold transition cursor-pointer ${
                                    permEdit.groupWrite
                                      ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                                      : 'bg-white/5 text-slate-500 hover:text-slate-300'
                                  }`}
                                >
                                  {permEdit.groupWrite ? '✓ Write' : '—'}
                                </button>
                              </div>
                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => handleTogglePerm('groupExec')}
                                  className={`px-2.5 py-1 rounded text-[10px] font-bold transition cursor-pointer ${
                                    permEdit.groupExec
                                      ? 'bg-purple-500/25 text-purple-300 border border-purple-500/40'
                                      : 'bg-white/5 text-slate-500 hover:text-slate-300'
                                  }`}
                                >
                                  {permEdit.groupExec ? '✓ Exec' : '—'}
                                </button>
                              </div>
                            </div>

                            {/* Others Row */}
                            <div className="grid grid-cols-4 p-2 items-center">
                              <span className="font-sans font-medium text-slate-400">
                                {isEn ? 'Others (o)' : 'سایرین (o)'}
                              </span>
                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => handleTogglePerm('othersRead')}
                                  className={`px-2.5 py-1 rounded text-[10px] font-bold transition cursor-pointer ${
                                    permEdit.othersRead
                                      ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                                      : 'bg-white/5 text-slate-500 hover:text-slate-300'
                                  }`}
                                >
                                  {permEdit.othersRead ? '✓ Read' : '—'}
                                </button>
                              </div>
                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => handleTogglePerm('othersWrite')}
                                  className={`px-2.5 py-1 rounded text-[10px] font-bold transition cursor-pointer ${
                                    permEdit.othersWrite
                                      ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                                      : 'bg-white/5 text-slate-500 hover:text-slate-300'
                                  }`}
                                >
                                  {permEdit.othersWrite ? '✓ Write' : '—'}
                                </button>
                              </div>
                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => handleTogglePerm('othersExec')}
                                  className={`px-2.5 py-1 rounded text-[10px] font-bold transition cursor-pointer ${
                                    permEdit.othersExec
                                      ? 'bg-purple-500/25 text-purple-300 border border-purple-500/40'
                                      : 'bg-white/5 text-slate-500 hover:text-slate-300'
                                  }`}
                                >
                                  {permEdit.othersExec ? '✓ Exec' : '—'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Quick Presets */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[10px] text-slate-400 font-semibold mr-1">
                            {isEn ? 'Quick Presets:' : 'الگوهای سریع:'}
                          </span>
                          {[
                            { octal: '0755', label: '755 (rwxr-xr-x)', hint: isEn ? 'Standard Exec / Dir' : 'پوشه و فایل اجرایی' },
                            { octal: '0644', label: '644 (rw-r--r--)', hint: isEn ? 'Standard File' : 'فایل استاندارد' },
                            { octal: '0700', label: '700 (rwx------)', hint: isEn ? 'Private Dir' : 'پوشه اختصاصی' },
                            { octal: '0600', label: '600 (rw-------)', hint: isEn ? 'Secret Key' : 'کلید خصوصی / راز' },
                            { octal: '0777', label: '777 (rwxrwxrwx)', hint: isEn ? 'Full Access' : 'دسترسی همگانی' },
                          ].map((preset) => (
                            <button
                              key={preset.octal}
                              type="button"
                              onClick={() => handleApplyPreset(preset.octal)}
                              title={preset.hint}
                              className={`px-2 py-0.5 rounded text-[10px] font-mono transition cursor-pointer border ${
                                permEdit.octal.endsWith(preset.octal.slice(-3))
                                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-bold'
                                  : isLightMode
                                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                                  : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
                              }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>

                        {/* Special Permissions (SUID, SGID, Sticky) */}
                        <div
                          className={`p-2.5 rounded-lg border space-y-2 ${
                            isLightMode ? 'bg-amber-50/50 border-amber-200' : 'bg-black/30 border-amber-500/20'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5">
                              <span>⚡</span>
                              <span>{isEn ? 'Special Permission Bits' : 'بیت‌های دسترسی خاص (Special Bits)'}</span>
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              SUID (4) / SGID (2) / Sticky (1)
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {/* SUID */}
                            <label className="flex items-center justify-between p-2 rounded bg-black/20 border border-white/5 cursor-pointer hover:bg-white/5 transition">
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={permEdit.suid}
                                  onChange={() => handleTogglePerm('suid')}
                                  className="w-3.5 h-3.5 rounded text-amber-500 cursor-pointer"
                                />
                                <span className="text-[11px] font-mono text-slate-200 font-medium">
                                  SUID (4000)
                                </span>
                              </div>
                              <FieldInfoTooltip
                                isEn={isEn}
                                isLightMode={isLightMode}
                                title={isEn ? 'SUID (Set User ID)' : 'بیت SUID (Set User ID)'}
                                infoWhatEn="Executes file with the owner's privileges instead of the executing user."
                                infoWhatFa="فایل اجرایی را با اختیارات کاربر مالک (مانند root) به جای کاربر اجراکننده اجرا می‌کند."
                                infoWhyEn="Required for administrative utilities that need elevated root access (e.g. /usr/bin/passwd)."
                                infoWhyFa="برای ابزارهایی که کاربران عادی باید با سطح دسترسی ارتقایافته اجرا کنند ضروری است."
                                infoExampleEn="chmod u+s /usr/local/bin/my_tool (Octal: 4755)"
                                infoExampleFa="دستور chmod u+s یا اکتال 4755"
                              />
                            </label>

                            {/* SGID */}
                            <label className="flex items-center justify-between p-2 rounded bg-black/20 border border-white/5 cursor-pointer hover:bg-white/5 transition">
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={permEdit.sgid}
                                  onChange={() => handleTogglePerm('sgid')}
                                  className="w-3.5 h-3.5 rounded text-amber-500 cursor-pointer"
                                />
                                <span className="text-[11px] font-mono text-slate-200 font-medium">
                                  SGID (2000)
                                </span>
                              </div>
                              <FieldInfoTooltip
                                isEn={isEn}
                                isLightMode={isLightMode}
                                title={isEn ? 'SGID (Set Group ID)' : 'بیت SGID (Set Group ID)'}
                                infoWhatEn="Files inherit group privileges; directories inherit parent group for new child items."
                                infoWhatFa="روی فایل‌ها با مجوز گروه اجرا می‌شود؛ روی پوشه‌ها باعث ارث‌بری خودکار گروه توسط فایل‌های جدید می‌گردد."
                                infoWhyEn="Essential for shared collaborative team folders (e.g. /var/www)."
                                infoWhyFa="برای پوشه‌های اشتراکی گروهی وب‌سرور یا تیم‌های کاری بسیار حیاتی است."
                                infoExampleEn="chmod g+s /var/www/shared (Octal: 2775)"
                                infoExampleFa="دستور chmod g+s یا اکتال 2775"
                              />
                            </label>

                            {/* Sticky Bit */}
                            <label className="flex items-center justify-between p-2 rounded bg-black/20 border border-white/5 cursor-pointer hover:bg-white/5 transition">
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={permEdit.sticky}
                                  onChange={() => handleTogglePerm('sticky')}
                                  className="w-3.5 h-3.5 rounded text-amber-500 cursor-pointer"
                                />
                                <span className="text-[11px] font-mono text-slate-200 font-medium">
                                  Sticky (1000)
                                </span>
                              </div>
                              <FieldInfoTooltip
                                isEn={isEn}
                                isLightMode={isLightMode}
                                title={isEn ? 'Sticky Bit (+t)' : 'بیت چسبنده (Sticky Bit)'}
                                infoWhatEn="Restricts deletion so only the file owner or root can delete files inside the directory."
                                infoWhatFa="حق حذف فایل در پوشه عمومی را فقط به مالک خود فایل یا کاربر root محدود می‌سازد."
                                infoWhyEn="Prevents users from maliciously deleting each other's files in public folders like /tmp."
                                infoWhyFa="مانع از حذف یا تغییر نام تصادفی یا مخرب فایل‌های کاربران توسط یکدیگر در پوشه /tmp می‌شود."
                                infoExampleEn="chmod +t /tmp (Octal: 1777)"
                                infoExampleFa="دستور chmod +t /tmp یا اکتال 1777"
                              />
                            </label>
                          </div>
                        </div>

                        {/* Recursive Option (if directory) */}
                        {(propertiesModal.data?.type === 'directory' || propertiesModal.item?.type === 'directory') && (
                          <div className="p-2.5 rounded-lg bg-black/20 border border-white/5 flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={permEdit.recursive}
                                onChange={(e) => setPermEdit((prev) => ({ ...prev, recursive: e.target.checked }))}
                                className="w-4 h-4 rounded text-cyan-500 cursor-pointer"
                              />
                              <span className="text-xs font-medium text-slate-200">
                                {isEn
                                  ? 'Apply changes recursively to all subdirectories & files (-R)'
                                  : 'اعمال سلسله‌مراتبی و بازگشتی تغییرات به تمامی زیرپوشه‌ها و فایل‌ها (-R)'}
                              </span>
                            </label>
                            <FieldInfoTooltip
                              isEn={isEn}
                              isLightMode={isLightMode}
                              title={isEn ? 'Recursive Attribute Application' : 'اعمال بازگشتی صفات (-R)'}
                              infoWhatEn="Propagates permissions and ownership to every nested child file and directory."
                              infoWhatFa="تنظیمات دسترسی و مالکیت را به تمام فایل‌ها و زیرشاخه‌های درونی تعمیم می‌دهد."
                              infoWhyEn="Saves manual effort when configuring entire site trees or project folders."
                              infoWhyFa="صرفه‌جویی در زمان هنگام تغییر سطح دسترسی یا مالک کل پروژه."
                              infoExampleEn="chmod -R 0755 /var/www && chown -R www-data:www-data /var/www"
                              infoExampleFa="دستور chmod -R 0755 /var/www"
                            />
                          </div>
                        )}

                        {/* Attribute Save Feedback */}
                        {attributeSaveSuccess && (
                          <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
                            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span>{attributeSaveSuccess}</span>
                          </div>
                        )}

                        {attributeSaveError && (
                          <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 animate-in fade-in">
                            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                            <span>{attributeSaveError}</span>
                          </div>
                        )}

                        {/* Save Actions Row inside Section */}
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={handleSaveAttributes}
                            disabled={isSavingAttributes}
                            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer shadow-lg ${
                              isSavingAttributes
                                ? 'bg-amber-600/50 text-white/70 cursor-not-allowed'
                                : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold shadow-amber-500/20'
                            }`}
                          >
                            {isSavingAttributes ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>{isEn ? 'Applying Changes...' : 'در حال اعمال تغییرات...'}</span>
                              </>
                            ) : (
                              <>
                                <Save className="w-3.5 h-3.5 text-slate-950" />
                                <span>{isEn ? 'Save & Apply Attributes' : 'ذخیره و اعمال تغییرات'}</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Section 3: Timestamps */}
                      <div
                        className={`p-3.5 rounded-xl border space-y-2.5 ${
                          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
                        }`}
                      >
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-cyan-400" />
                          <span>{isEn ? 'Timestamps & Dates' : 'تاریخچه و زمان‌بندی'}</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                          <div>
                            <span className="text-[11px] text-slate-400 block">
                              {isEn ? 'Last Modified (mtime)' : 'آخرین تغییر محتوا (mtime)'}:
                            </span>
                            <span className="font-mono text-slate-200 mt-0.5 block select-text">
                              {propertiesModal.data?.modifiedTime || propertiesModal.item?.modifiedTime || '—'}
                            </span>
                          </div>

                          {propertiesModal.data?.accessTime && (
                            <div>
                              <span className="text-[11px] text-slate-400 block">
                                {isEn ? 'Last Accessed (atime)' : 'آخرین زمان دسترسی (atime)'}:
                              </span>
                              <span className="font-mono text-slate-300 mt-0.5 block select-text">
                                {propertiesModal.data.accessTime}
                              </span>
                            </div>
                          )}

                          {propertiesModal.data?.createdTime && (
                            <div>
                              <span className="text-[11px] text-slate-400 block">
                                {isEn ? 'Created / Changed (ctime)' : 'زمان ایجاد یا تغییر وضعیت (ctime)'}:
                              </span>
                              <span className="font-mono text-slate-300 mt-0.5 block select-text">
                                {propertiesModal.data.createdTime}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Footer Controls */}
                <div
                  className={`px-5 py-3 border-t flex flex-wrap items-center justify-between gap-2 shrink-0 ${
                    isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/80 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyPath(propertiesModal.data?.path || propertiesModal.targetPath)}
                      className="px-3 py-1.5 rounded-xl border border-slate-700 text-xs font-medium hover:bg-white/10 flex items-center gap-1.5 cursor-pointer text-slate-300"
                    >
                      <Copy className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{isEn ? 'Copy Path' : 'کپی مسیر'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const oct = permEdit.octal || '0755';
                        const p = propertiesModal.data?.path || propertiesModal.targetPath;
                        handleCopyPath(`chmod ${oct} "${p}"`);
                      }}
                      className="px-3 py-1.5 rounded-xl border border-slate-700 text-xs font-medium hover:bg-white/10 flex items-center gap-1.5 cursor-pointer text-slate-300"
                    >
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                      <span>{isEn ? 'Copy Chmod' : 'کپی دستور Chmod'}</span>
                    </button>
                    {permEdit.owner && permEdit.group && (
                      <button
                        type="button"
                        onClick={() => {
                          const p = propertiesModal.data?.path || propertiesModal.targetPath;
                          handleCopyPath(`chown ${permEdit.owner}:${permEdit.group} "${p}"`);
                        }}
                        className="px-3 py-1.5 rounded-xl border border-slate-700 text-xs font-medium hover:bg-white/10 flex items-center gap-1.5 cursor-pointer text-slate-300"
                      >
                        <User className="w-3.5 h-3.5 text-purple-400" />
                        <span>{isEn ? 'Copy Chown' : 'کپی دستور Chown'}</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setPropertiesModal({
                          isOpen: false,
                          item: null,
                          targetPath: '',
                          data: null,
                          loading: false,
                          error: null,
                        })
                      }
                      className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-medium text-xs transition cursor-pointer"
                    >
                      {isEn ? 'Close' : 'بستن'}
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAttributes}
                      disabled={isSavingAttributes}
                      className={`px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-md ${
                        isSavingAttributes
                          ? 'bg-amber-600/50 text-white/70 cursor-not-allowed'
                          : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold'
                      }`}
                    >
                      {isSavingAttributes ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>{isEn ? 'Saving...' : 'در حال ذخیره...'}</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5 text-slate-950" />
                          <span>{isEn ? 'Save' : 'ذخیره تغییرات'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}

        {/* ======================================================== */}
        {/* COMPRESSION MODAL (PORTAL, 3-CONTROL, FIELD INFO TOOLTIP)*/}
        {/* ======================================================== */}
        {compressModal && compressModal.isOpen &&
          createPortal(
            <div
              className={
                compressModal.isMaximized
                  ? 'fixed top-0 left-0 right-0 bottom-8 z-[99999] p-0 flex flex-col'
                  : 'fixed top-0 left-0 right-0 bottom-8 z-[99999] p-3 sm:p-4 bg-black/75 backdrop-blur-xs flex items-center justify-center'
              }
              dir={isEn ? 'ltr' : 'rtl'}
              onClick={() => {
                if (!compressModal.loading) {
                  setCompressModal(null);
                }
              }}
            >
              <div
                className={`flex flex-col overflow-hidden transition-all duration-200 shadow-2xl border ${
                  compressModal.isMaximized
                    ? 'w-full h-full max-w-none max-h-full rounded-none border-none'
                    : 'w-full max-w-xl max-h-[92vh] rounded-2xl'
                } ${
                  isLightMode
                    ? 'bg-white border-slate-200 text-slate-800'
                    : 'bg-slate-950 border-slate-800 text-slate-100'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header with 3 control buttons */}
                <div
                  className={`px-5 py-3.5 border-b flex items-center justify-between shrink-0 ${
                    isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/90 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400 shrink-0">
                      <FileArchive className="w-5 h-5 text-purple-400" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm truncate">
                        {isEn ? 'Compress Files & Folders' : 'فشرده‌سازی فایل‌ها و پوشه‌ها'}
                      </h3>
                      <p className="text-[11px] text-slate-400 truncate font-mono">
                        {isEn
                          ? `Creating archive from ${compressModal.items.length} item(s)`
                          : `ایجاد آرشیو فشرده از ${compressModal.items.length} مورد`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Minimize / Close */}
                    <button
                      type="button"
                      onClick={() => setCompressModal(null)}
                      title={isEn ? 'Close' : 'بستن'}
                      className={`p-1.5 rounded-lg border transition cursor-pointer ${
                        isLightMode
                          ? 'border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                          : 'border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    {/* Maximize Toggle */}
                    <button
                      type="button"
                      onClick={() =>
                        setCompressModal((prev) =>
                          prev ? { ...prev, isMaximized: !prev.isMaximized } : null
                        )
                      }
                      title={
                        compressModal.isMaximized
                          ? isEn
                            ? 'Exit Fullscreen'
                            : 'خروج از تمام‌صفحه'
                          : isEn
                          ? 'Fullscreen'
                          : 'تمام‌صفحه'
                      }
                      className={`p-1.5 rounded-lg border transition cursor-pointer ${
                        isLightMode
                          ? 'border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                          : 'border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {compressModal.isMaximized ? (
                        <Minimize2 className="w-3.5 h-3.5" />
                      ) : (
                        <Maximize2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                    {/* Close */}
                    <button
                      type="button"
                      onClick={() => setCompressModal(null)}
                      title={isEn ? 'Close' : 'بستن'}
                      className={`p-1.5 rounded-lg border transition cursor-pointer ${
                        isLightMode
                          ? 'border-slate-200 text-slate-500 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200'
                          : 'border-white/10 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/30'
                      }`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {/* Selected items summary */}
                  <div
                    className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                      isLightMode
                        ? 'bg-purple-50/60 border-purple-200 text-purple-900'
                        : 'bg-purple-500/10 border-purple-500/20 text-purple-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-purple-400 shrink-0" />
                      <span>
                        {isEn
                          ? `Total items to compress: ${compressModal.items.length}`
                          : `مجموع آیتم‌های انتخابی برای فشرده‌سازی: ${compressModal.items.length}`}
                      </span>
                    </div>
                    <span className="font-mono font-semibold">
                      {formatBytes(compressModal.items.reduce((acc, it) => acc + (it.size || 0), 0))}
                    </span>
                  </div>

                  {/* Archive File Name */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold">
                        {isEn ? 'Archive File Name' : 'نام فایل آرشیو فشرده'}
                      </label>
                      <FieldInfoTooltip
                        fieldName={isEn ? 'Archive Name' : 'نام فایل فشرده'}
                        whatIsIt={
                          isEn
                            ? 'The base filename for the created compressed archive.'
                            : 'نام پایه فایل فشرده ایجاد شده در سرور.'
                        }
                        whyNeeded={
                          isEn
                            ? 'Identifies the generated archive file in the target filesystem directory.'
                            : 'برای مشخص شدن نام فایل فشرده نهایی در دایرکتوری مقصد.'
                        }
                        practicalExample={
                          isEn ? 'backup-configs-2026 or site_assets' : 'backup-configs-2026 یا site_assets'
                        }
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </div>
                    <div className="flex items-center rounded-xl border overflow-hidden font-mono text-xs focus-within:ring-2 focus-within:ring-purple-500">
                      <input
                        type="text"
                        value={compressModal.archiveName}
                        onChange={(e) =>
                          setCompressModal((prev) =>
                            prev ? { ...prev, archiveName: e.target.value } : null
                          )
                        }
                        placeholder={isEn ? 'archive-name' : 'نام آرشیو'}
                        className={`flex-1 px-3 py-2 outline-none font-mono ${
                          isLightMode ? 'bg-white text-slate-800' : 'bg-slate-900 text-slate-100'
                        }`}
                        dir="ltr"
                      />
                      <span
                        className={`px-3 py-2 font-mono font-bold text-xs select-none border-s ${
                          isLightMode
                            ? 'bg-slate-100 border-slate-200 text-purple-700'
                            : 'bg-slate-800 border-slate-700 text-purple-300'
                        }`}
                        dir="ltr"
                      >
                        .{compressModal.format}
                      </span>
                    </div>
                  </div>

                  {/* Archive Format Selector */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold">
                        {isEn ? 'Compression Format & Algorithm' : 'فرمت و الگوریتم فشرده‌سازی'}
                      </label>
                      <FieldInfoTooltip
                        fieldName={isEn ? 'Archive Format' : 'فرمت آرشیو'}
                        whatIsIt={
                          isEn
                            ? 'The compression format and container algorithm used to pack the files.'
                            : 'الگوریتم و ساختار ظرف فشرده‌سازی مورد استفاده برای بسته‌بندی فایل‌ها.'
                        }
                        whyNeeded={
                          isEn
                            ? 'Different formats offer varying compression ratios, CPU consumption, and cross-platform compatibility.'
                            : 'فرمت‌های مختلف سطوح متفاوتی از نرخ فشردگی، سرعت پردازش و سازگاری با سیستم‌عامل‌های دیگر ارائه می‌دهند.'
                        }
                        practicalExample={
                          isEn
                            ? 'tar.gz for standard Linux archives, zip for Windows/Mac compatibility, tar.xz for maximum compression.'
                            : 'tar.gz برای لینوکس استاندارد، zip برای سازگاری کامل با ویندوز و مک، tar.xz برای بالاترین نرخ فشردگی.'
                        }
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        {
                          id: 'tar.gz',
                          label: '.tar.gz (Gzip)',
                          desc: isEn ? 'Standard Linux, Fast' : 'استاندارد لینوکس و سریع',
                          badge: isEn ? 'Recommended' : 'پیشنهادی',
                        },
                        {
                          id: 'zip',
                          label: '.zip (ZIP)',
                          desc: isEn ? 'Universal Windows/Mac' : 'سازگار با ویندوز و مک',
                        },
                        {
                          id: 'tar.bz2',
                          label: '.tar.bz2 (Bzip2)',
                          desc: isEn ? 'High ratio for text/logs' : 'فشردگی بالا برای متن و لاگ',
                        },
                        {
                          id: 'tar.xz',
                          label: '.tar.xz (XZ)',
                          desc: isEn ? 'Maximum compression' : 'بیشترین میزان فشردگی',
                        },
                        {
                          id: 'tar',
                          label: '.tar (Tarball)',
                          desc: isEn ? 'Uncompressed archive' : 'بسته‌بندی بدون فشرده‌سازی',
                        },
                      ].map((fmt) => (
                        <button
                          key={fmt.id}
                          type="button"
                          onClick={() =>
                            setCompressModal((prev) =>
                              prev ? { ...prev, format: fmt.id as any } : null
                            )
                          }
                          className={`p-2.5 rounded-xl border text-start transition cursor-pointer flex flex-col justify-between ${
                            compressModal.format === fmt.id
                              ? 'border-purple-500 bg-purple-500/15 text-purple-300 ring-1 ring-purple-500'
                              : isLightMode
                              ? 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                              : 'border-white/10 bg-slate-900/60 text-slate-300 hover:bg-white/5'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono font-bold text-xs">{fmt.label}</span>
                            {fmt.badge && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-semibold">
                                {fmt.badge}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 mt-1">{fmt.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Compression Level (for compressed formats) */}
                  {compressModal.format !== 'tar' && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold">
                          {isEn ? 'Compression Level' : 'سطح فشردگی (Compression Level)'}
                        </label>
                        <FieldInfoTooltip
                          fieldName={isEn ? 'Compression Level' : 'سطح فشردگی'}
                          whatIsIt={
                            isEn
                              ? 'Determines trade-off between CPU processing time and archive file size.'
                              : 'میزان تعادل میان زمان پردازش پردازنده و اندازه نهایی فایل فشرده.'
                          }
                          whyNeeded={
                            isEn
                              ? 'Level 1 is fast with lower compression; Level 9 maximizes compression using more CPU.'
                              : 'سطح ۱ سریع‌ترین پردازش با حجم بیشتر است؛ سطح ۹ بیشترین فشردگی را با مصرف بیشتر پردازنده فراهم می‌آورد.'
                          }
                          practicalExample={isEn ? 'Level 6 (Balanced default)' : 'سطح ۶ (حالت متوازن پیش‌فرض)'}
                          isEn={isEn}
                          isLightMode={isLightMode}
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          {
                            lvl: 1,
                            title: isEn ? '1 - Fastest' : '۱ - سریع‌ترین',
                            desc: isEn ? 'Low CPU, larger file' : 'مصرف کم پردازنده',
                          },
                          {
                            lvl: 6,
                            title: isEn ? '6 - Balanced' : '۶ - متوازن',
                            desc: isEn ? 'Optimal size/speed' : 'بهترین تعادل سرعت و حجم',
                          },
                          {
                            lvl: 9,
                            title: isEn ? '9 - Maximum' : '۹ - بیشترین فشردگی',
                            desc: isEn ? 'Smallest file, slow' : 'کوچک‌ترین حجم ممکن',
                          },
                        ].map((l) => (
                          <button
                            key={l.lvl}
                            type="button"
                            onClick={() =>
                              setCompressModal((prev) =>
                                prev ? { ...prev, compressionLevel: l.lvl } : null
                              )
                            }
                            className={`p-2 rounded-xl border text-start transition cursor-pointer ${
                              compressModal.compressionLevel === l.lvl
                                ? 'border-purple-500 bg-purple-500/15 text-purple-300 font-semibold'
                                : isLightMode
                                ? 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                                : 'border-white/10 bg-slate-900/60 text-slate-300 hover:bg-white/5'
                            }`}
                          >
                            <p className="text-xs font-mono font-bold">{l.title}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{l.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Destination Directory */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold">
                        {isEn ? 'Destination Directory' : 'مسیر ذخیره‌سازی آرشیو'}
                      </label>
                      <FieldInfoTooltip
                        fieldName={isEn ? 'Destination Directory' : 'مسیر مقصد'}
                        whatIsIt={
                          isEn
                            ? 'The remote folder path where the compressed archive will be saved.'
                            : 'مسیر پوشه در سرور راه دور که فایل فشرده در آن ذخیره خواهد شد.'
                        }
                        whyNeeded={
                          isEn
                            ? 'Allows saving the compressed file in the current directory or routing it to another folder like /tmp or /backup.'
                            : 'امکان ذخیره فایل در مسیر جاری یا انتقال مستقیم به پوشه‌های دیگر مانند /tmp یا /backup.'
                        }
                        practicalExample={isEn ? '/tmp or /backup or current folder' : '/tmp یا /backup یا پوشه جاری'}
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={compressModal.destinationDir}
                        onChange={(e) =>
                          setCompressModal((prev) =>
                            prev ? { ...prev, destinationDir: e.target.value } : null
                          )
                        }
                        className={`flex-1 px-3 py-2 rounded-xl border font-mono text-xs outline-none ${
                          isLightMode
                            ? 'bg-white border-slate-200 text-slate-800 focus:border-purple-500'
                            : 'bg-slate-900 border-slate-700 text-slate-100 focus:border-purple-500'
                        }`}
                        dir="ltr"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setCompressModal((prev) =>
                            prev ? { ...prev, destinationDir: currentPath } : null
                          )
                        }
                        className="px-2.5 py-2 rounded-xl border border-slate-700 text-xs font-mono text-slate-300 hover:bg-white/10 shrink-0 cursor-pointer"
                        title={isEn ? 'Reset to current directory' : 'تنظیم به مسیر جاری'}
                      >
                        {isEn ? 'Current Dir' : 'مسیر جاری'}
                      </button>
                    </div>
                  </div>

                  {/* Delete Source Files Checkbox */}
                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-dashed border-rose-500/30 bg-rose-500/5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={compressModal.deleteSource}
                      onChange={(e) =>
                        setCompressModal((prev) =>
                          prev ? { ...prev, deleteSource: e.target.checked } : null
                        )
                      }
                      className="mt-0.5 rounded text-rose-500"
                    />
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-rose-300">
                          {isEn
                            ? 'Delete original files after successful compression'
                            : 'حذف فایل‌ها و پوشه‌های اصلی پس از فشرده‌سازی موفق'}
                        </span>
                        <FieldInfoTooltip
                          fieldName={isEn ? 'Delete Source Files' : 'حذف فایل‌های اصلی'}
                          whatIsIt={
                            isEn
                              ? 'Automatically removes the source items once the archive is verified to save disk space.'
                              : 'پس از اطمینان از ایجاد صحیح آرشیو، فایل‌ها و پوشه‌های اولیه را برای آزادسازی فضای دیسک حذف می‌کند.'
                          }
                          whyNeeded={
                            isEn
                              ? 'Helpful when freeing disk space on servers with limited storage during log rotation or archiving.'
                              : 'برای آزاد کردن سریع فضای دیسک در سرورهایی با محدودیت فضا هنگام پشتیبان‌گیری و آرشیو لاگ‌ها.'
                          }
                          practicalExample={
                            isEn ? 'Enable when archiving old rotated logs' : 'فعال‌سازی هنگام فشرده‌سازی لاگ‌های قدیمی'
                          }
                          isEn={isEn}
                          isLightMode={isLightMode}
                        />
                      </div>
                      <p className="text-[10px] text-rose-400/80">
                        {isEn
                          ? 'Warning: Source files will be permanently erased after archiving is complete.'
                          : 'هشدار: آیتم‌های مبدا پس از پایان فشرده‌سازی برای همیشه از روی سرور پاک خواهند شد.'}
                      </p>
                    </div>
                  </label>

                  {/* Source items preview list */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-slate-400">
                      {isEn ? 'Selected Items to Include:' : 'آیتم‌های انتخابی برای گنجاندن در آرشیو:'}
                    </span>
                    <div
                      className={`max-h-36 overflow-y-auto rounded-xl border p-2 space-y-1 font-mono text-xs ${
                        isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      {compressModal.items.map((it) => (
                        <div key={it.path} className="flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-white/5">
                          <div className="flex items-center gap-1.5 truncate">
                            {it.type === 'directory' ? (
                              <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            ) : (
                              <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            )}
                            <span className="truncate">{it.name}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                            {it.type === 'directory' ? (isEn ? 'Folder' : 'پوشه') : it.sizeHuman}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Error display */}
                  {compressModal.error && (
                    <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-mono flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                      <span>{compressModal.error}</span>
                    </div>
                  )}
                </div>

                {/* Footer Controls */}
                <div
                  className={`px-5 py-3 border-t flex items-center justify-between shrink-0 ${
                    isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/80 border-slate-800'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setCompressModal(null)}
                    disabled={compressModal.loading}
                    className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-medium hover:bg-white/10 transition cursor-pointer text-slate-300"
                  >
                    {isEn ? 'Cancel' : 'انصراف'}
                  </button>

                  <button
                    type="button"
                    onClick={handleExecuteCompress}
                    disabled={compressModal.loading || !compressModal.archiveName.trim()}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {compressModal.loading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>{isEn ? 'Compressing on Server...' : 'در حال فشرده‌سازی روی سرور...'}</span>
                      </>
                    ) : (
                      <>
                        <FileArchive className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Create Compressed Archive' : 'ایجاد آرشیو فشرده'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {/* ======================================================== */}
        {/* EXTRACTION MODAL (PORTAL)                                */}
        {/* ======================================================== */}
        {extractModal?.isOpen &&
          createPortal(
            <div
              className={
                extractModal.isMaximized
                  ? 'fixed top-0 left-0 right-0 bottom-8 z-[99999] p-0 flex flex-col'
                  : 'fixed top-0 left-0 right-0 bottom-8 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150'
              }
            >
              <div
                className={`flex flex-col shadow-2xl overflow-hidden transition-all duration-200 ${
                  extractModal.isMaximized
                    ? 'w-full h-full max-w-none max-h-full rounded-none border-none'
                    : 'w-full max-w-lg rounded-2xl border max-h-[90vh]'
                } ${
                  isLightMode
                    ? 'bg-white border-slate-200 text-slate-800'
                    : 'bg-slate-950 border-slate-800 text-slate-100'
                }`}
              >
                {/* Header with 3 control buttons: Close, Minimize, Fullscreen */}
                <div
                  className={`px-5 py-3.5 border-b flex items-center justify-between shrink-0 ${
                    isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/80 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                      <Archive className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm">
                        {isEn ? 'Extract Archive' : 'استخراج از حالت فشرده'}
                      </h3>
                      <p className="text-[11px] text-slate-400 truncate max-w-xs font-mono">
                        {extractModal.item.name}
                      </p>
                    </div>
                  </div>

                  {/* Header 3 Controls: Close (X), Minimize (Minus), Fullscreen (Maximize2/Minimize2) */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setExtractModal((prev) =>
                          prev ? { ...prev, isMaximized: !prev.isMaximized } : null
                        )
                      }
                      title={
                        extractModal.isMaximized
                          ? isEn
                            ? 'Exit Fullscreen'
                            : 'خروج از تمام‌صفحه'
                          : isEn
                          ? 'Fullscreen'
                          : 'تمام‌صفحه'
                      }
                      className={`p-1.5 rounded-lg transition cursor-pointer ${
                        isLightMode
                          ? 'hover:bg-slate-200 text-slate-600'
                          : 'hover:bg-white/10 text-slate-400'
                      }`}
                    >
                      {extractModal.isMaximized ? (
                        <Minimize2 className="w-4 h-4" />
                      ) : (
                        <Maximize2 className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setExtractModal(null)}
                      title={isEn ? 'Minimize' : 'کوچک‌سازی (بستن پنجره)'}
                      className={`p-1.5 rounded-lg transition cursor-pointer ${
                        isLightMode
                          ? 'hover:bg-slate-200 text-slate-600'
                          : 'hover:bg-white/10 text-slate-400'
                      }`}
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setExtractModal(null)}
                      title={isEn ? 'Close' : 'بستن'}
                      className={`p-1.5 rounded-lg transition cursor-pointer ${
                        isLightMode
                          ? 'hover:bg-rose-100 text-rose-600'
                          : 'hover:bg-rose-500/20 text-rose-400'
                      }`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Body Content */}
                <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
                  {/* Archive Item Details Banner */}
                  <div
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                      isLightMode
                        ? 'bg-amber-50/60 border-amber-200/80 text-amber-900'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Archive className="w-5 h-5 text-amber-400 shrink-0" />
                      <div className="truncate">
                        <span className="font-semibold block truncate">{extractModal.item.name}</span>
                        <span className="text-[10px] opacity-75 font-mono truncate block">
                          {extractModal.item.path}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold shrink-0">
                      {extractModal.item.sizeHuman || ''}
                    </span>
                  </div>

                  {/* Destination Directory */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <label className="font-semibold text-slate-300">
                          {isEn ? 'Destination Directory' : 'دایرکتوری مقصد جهت استخراج'}
                        </label>
                        <FieldInfoTooltip
                          fieldName={isEn ? 'Destination Directory' : 'دایرکتوری مقصد'}
                          whatIsIt={
                            isEn
                              ? 'The target directory where the archive contents will be extracted on the remote server.'
                              : 'مسیر پوشه مقصدی که محتویات فایل فشرده در آن استخراج و باز خواهد شد.'
                          }
                          whyNeeded={
                            isEn
                              ? 'Allows choosing between unpacking in the current folder or sending files directly to an application path.'
                              : 'امکان انتخاب بین استخراج در همان پوشه جاری یا سازمان‌دهی فایل‌ها در مسیر مشخص و سفارشی.'
                          }
                          practicalExample={
                            isEn ? '/var/www/html or /opt/app' : '/var/www/html یا مسیر جاری دایرکتوری'
                          }
                          isEn={isEn}
                          isLightMode={isLightMode}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setExtractModal((prev) =>
                            prev ? { ...prev, destinationDir: currentPath } : null
                          )
                        }
                        className="text-[10px] text-amber-400 hover:underline cursor-pointer"
                      >
                        {isEn ? 'Use Current Path' : 'مسیر جاری'}
                      </button>
                    </div>
                    <div className="relative">
                      <Folder className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={extractModal.destinationDir}
                        onChange={(e) =>
                          setExtractModal((prev) =>
                            prev ? { ...prev, destinationDir: e.target.value } : null
                          )
                        }
                        placeholder={currentPath}
                        className={`w-full pl-9 pr-3 py-2 rounded-xl border text-xs font-mono transition focus:outline-none focus:ring-2 focus:ring-amber-500/50 ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-800'
                            : 'bg-slate-900 border-slate-700 text-slate-100'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Create Subfolder checkbox */}
                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                        : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800/40'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={extractModal.createSubfolder}
                      onChange={(e) =>
                        setExtractModal((prev) =>
                          prev ? { ...prev, createSubfolder: e.target.checked } : null
                        )
                      }
                      className="mt-0.5 rounded border-slate-700 text-amber-500 focus:ring-amber-500 cursor-pointer"
                    />
                    <div className="flex-1 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-200">
                          {isEn ? 'Extract to Subfolder' : 'استخراج درون پوشه‌ای به نام فایل'}
                        </span>
                        <FieldInfoTooltip
                          fieldName={isEn ? 'Extract to Subfolder' : 'استخراج درون پوشه اختصاصی'}
                          whatIsIt={
                            isEn
                              ? 'Creates a subfolder named after the archive and places all extracted contents inside it.'
                              : 'یک پوشه جدید هم‌نام با فایل آرشیو ساخته و محتویات را درون آن پوشه استخراج می‌کند.'
                          }
                          whyNeeded={
                            isEn
                              ? 'Prevents cluttering the target folder if the archive does not contain an enclosing top-level folder.'
                              : 'از شلوغ شدن و پراکنده شدن صدها فایل آزاد در پوشه مقصد در صورتی که آرشیو فاقد پوشه ریشه باشد جلوگیری می‌کند.'
                          }
                          practicalExample={
                            isEn
                              ? 'Recommended for unpacking site_backup.tar.gz into site_backup/'
                              : 'پیشنهاد می‌شود تا محتویات به جای پخش شدن، در یک پوشه مرتب جمع شوند'
                          }
                          isEn={isEn}
                          isLightMode={isLightMode}
                        />
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {isEn
                          ? 'Creates a new directory matching the archive name so contents stay grouped.'
                          : 'پوشه‌ای اختصاصی همنام با آرشیو ایجاد می‌کند تا فایل‌ها منظم بمانند.'}
                      </p>
                    </div>
                  </label>

                  {/* Overwrite Existing Files checkbox */}
                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                        : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800/40'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={extractModal.overwrite}
                      onChange={(e) =>
                        setExtractModal((prev) =>
                          prev ? { ...prev, overwrite: e.target.checked } : null
                        )
                      }
                      className="mt-0.5 rounded border-slate-700 text-amber-500 focus:ring-amber-500 cursor-pointer"
                    />
                    <div className="flex-1 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-200">
                          {isEn ? 'Overwrite Existing Files' : 'بازنویسی فایل‌های موجود (Overwrite)'}
                        </span>
                        <FieldInfoTooltip
                          fieldName={isEn ? 'Overwrite Existing' : 'بازنویسی فایل‌های موجود'}
                          whatIsIt={
                            isEn
                              ? 'Automatically replaces existing files with the same name during extraction.'
                              : 'در صورت وجود فایل‌های هم‌نام در پوشه مقصد، فایل‌های استخراج شده را جایگزین فایل‌های قبلی می‌کند.'
                          }
                          whyNeeded={
                            isEn
                              ? 'Required when deploying software updates or replacing corrupted configuration files.'
                              : 'هنگام آپدیت نرم‌افزارها، قالب‌ها یا جایگزینی فایل‌های پیکربندی قبلی کاربرد دارد.'
                          }
                          practicalExample={
                            isEn ? 'Keep enabled for clean updates' : 'فعال برای به‌روزرسانی بی‌نقص فایل‌ها'
                          }
                          isEn={isEn}
                          isLightMode={isLightMode}
                        />
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {isEn
                          ? 'Replace existing files if duplicates are found in the target directory.'
                          : 'در صورت برخورد با فایل تکراری در پوشه مقصد، فایل جدید جایگزین می‌شود.'}
                      </p>
                    </div>
                  </label>

                  {/* Delete Archive After Extraction */}
                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                        : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800/40'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={extractModal.deleteArchiveAfterExtract}
                      onChange={(e) =>
                        setExtractModal((prev) =>
                          prev ? { ...prev, deleteArchiveAfterExtract: e.target.checked } : null
                        )
                      }
                      className="mt-0.5 rounded border-slate-700 text-rose-500 focus:ring-rose-500 cursor-pointer"
                    />
                    <div className="flex-1 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-200">
                          {isEn
                            ? 'Delete Archive After Extraction'
                            : 'حذف فایل فشرده پس از استخراج موفق'}
                        </span>
                        <FieldInfoTooltip
                          fieldName={
                            isEn ? 'Delete Archive After Extract' : 'حذف فایل فشرده پس از استخراج'
                          }
                          whatIsIt={
                            isEn
                              ? 'Permanently deletes the original compressed archive file once extraction completes.'
                              : 'پس از اتمام موفق استخراج، فایل آرشیو اولیه را از سرور پاک می‌کند.'
                          }
                          whyNeeded={
                            isEn
                              ? 'Frees disk space on the server after unpacking installation packages or backups.'
                              : 'با حذف فایل فشرده موقت پس از بازگشایی، باعث آزادسازی فضای ذخیره‌سازی سرور می‌شود.'
                          }
                          practicalExample={
                            isEn
                              ? 'Useful when server has tight disk quota'
                              : 'مفید در سرورهایی با محدودیت فضای دیسک'
                          }
                          isEn={isEn}
                          isLightMode={isLightMode}
                        />
                      </div>
                      <p className="text-[11px] text-rose-400/80">
                        {isEn
                          ? 'Warning: The archive file will be erased from server after unpacking.'
                          : 'هشدار: فایل فشرده پس از استخراج به طور دائم از روی سرور حذف خواهد شد.'}
                      </p>
                    </div>
                  </label>

                  {/* Error banner */}
                  {extractModal.error && (
                    <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-mono flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                      <span>{extractModal.error}</span>
                    </div>
                  )}
                </div>

                {/* Footer Controls */}
                <div
                  className={`px-5 py-3 border-t flex items-center justify-between shrink-0 ${
                    isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/80 border-slate-800'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setExtractModal(null)}
                    disabled={extractModal.loading}
                    className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-medium hover:bg-white/10 transition cursor-pointer text-slate-300"
                  >
                    {isEn ? 'Cancel' : 'انصراف'}
                  </button>

                  <button
                    type="button"
                    onClick={handleExecuteExtract}
                    disabled={extractModal.loading || !extractModal.destinationDir.trim()}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {extractModal.loading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>{isEn ? 'Extracting on Server...' : 'در حال استخراج روی سرور...'}</span>
                      </>
                    ) : (
                      <>
                        <Archive className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Extract Archive Now' : 'شروع استخراج فایل'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {/* ======================================================== */}
        {/* ITEM / EMPTY SPACE CONTEXT MENU (PORTAL)                  */}
        {/* ======================================================== */}
        {contextMenu?.isOpen &&
          createPortal(
            <div
              style={{ top: contextMenu.y, left: contextMenu.x }}
              className={`fixed z-[9999] w-64 rounded-xl border shadow-2xl p-1.5 text-xs font-sans select-none animate-in fade-in zoom-in-95 duration-100 ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-800 shadow-slate-300/50'
                  : 'bg-slate-900 border-slate-800 text-slate-100 shadow-black/80'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {!contextMenu.item ? (
                <>
                  {/* Empty Area Folder Header */}
                  <div className="px-2.5 py-1.5 mb-1 border-b border-white/10 flex items-center justify-between">
                    <span className="font-mono font-bold truncate text-[11px] text-blue-400">
                      {currentPath}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {isEn ? 'Current Directory' : 'پوشه فعلی'}
                    </span>
                  </div>

                  {/* Upload File to this folder */}
                  <button
                    type="button"
                    onClick={() => {
                      setUploadModal({
                        isOpen: true,
                        targetPath: currentPath,
                        selectedFiles: [],
                        isUploading: false,
                        uploadProgress: 0,
                        currentFileIndex: 0,
                        error: null,
                      });
                      setContextMenu(null);
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-start ${
                      isLightMode
                        ? 'hover:bg-blue-50 text-blue-700 font-semibold'
                        : 'hover:bg-blue-500/15 text-blue-300 font-semibold'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>{isEn ? 'Upload File Here' : 'بارگذاری فایل در این پوشه'}</span>
                  </button>

                  {/* New Folder */}
                  <button
                    type="button"
                    onClick={() => {
                      setNewDirDialog({ isOpen: true, name: '', loading: false, error: null });
                      setContextMenu(null);
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-start ${
                      isLightMode ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-white/10 text-slate-200'
                    }`}
                  >
                    <FolderPlus className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{isEn ? 'New Folder' : 'پوشه جدید'}</span>
                  </button>

                  {/* New Empty File */}
                  <button
                    type="button"
                    onClick={() => {
                      setNewFileDialog({ isOpen: true, name: '', loading: false, error: null });
                      setContextMenu(null);
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-start ${
                      isLightMode ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-white/10 text-slate-200'
                    }`}
                  >
                    <FilePlus className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>{isEn ? 'New Empty File' : 'فایل جدید'}</span>
                  </button>

                  {/* Paste into Current Directory if Clipboard has items */}
                  {clipboard && clipboard.items.length > 0 && (
                    <>
                      <div className="my-1 border-t border-white/10" />
                      <button
                        type="button"
                        onClick={() => handlePasteItems(currentPath)}
                        disabled={isPasting}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-start ${
                          isLightMode
                            ? 'hover:bg-emerald-50 text-emerald-700 font-semibold'
                            : 'hover:bg-emerald-500/15 text-emerald-300 font-semibold'
                        }`}
                      >
                        {isPasting ? (
                          <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin shrink-0" />
                        ) : (
                          <ClipboardPaste className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        )}
                        <span>
                          {isEn
                            ? `Paste (${clipboard.items.length}) Items Here`
                            : `چسباندن (${clipboard.items.length}) مورد در اینجا`}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={handleClearClipboard}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-start ${
                          isLightMode ? 'hover:bg-slate-100 text-slate-500' : 'hover:bg-white/10 text-slate-400'
                        }`}
                      >
                        <X className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{isEn ? 'Clear Clipboard' : 'خالی کردن حافظه موقت'}</span>
                      </button>
                    </>
                  )}

                  <div className="my-1 border-t border-white/10" />

                  {/* Refresh */}
                  <button
                    type="button"
                    onClick={() => {
                      loadDirectory(currentPath, ephemeralPassword, false);
                      setContextMenu(null);
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-start ${
                      isLightMode ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-white/10 text-slate-200'
                    }`}
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{isEn ? 'Refresh Directory' : 'تازه‌سازی دایرکتوری'}</span>
                  </button>

                  <div className="my-1 border-t border-white/10" />

                  {/* Directory Properties */}
                  <button
                    type="button"
                    onClick={() => handleOpenProperties(null, currentPath)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-start ${
                      isLightMode ? 'hover:bg-indigo-50 text-indigo-700 font-medium' : 'hover:bg-indigo-500/15 text-indigo-300 font-medium'
                    }`}
                  >
                    <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span>{isEn ? 'Directory Properties' : 'مشخصات پوشه (Properties)'}</span>
                  </button>
                </>
              ) : selectedPaths.size > 1 ? (
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

                  {/* Copy Selected Items */}
                  <button
                    type="button"
                    onClick={() => handleCopyItems(items.filter((it) => selectedPaths.has(it.path)))}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-start ${
                      isLightMode ? 'hover:bg-slate-100 text-slate-700 font-medium' : 'hover:bg-white/10 text-slate-200 font-medium'
                    }`}
                  >
                    <Copy className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>{isEn ? `Copy (${selectedPaths.size}) Items` : `کپی (${selectedPaths.size}) مورد`}</span>
                  </button>

                  {/* Cut Selected Items */}
                  <button
                    type="button"
                    onClick={() => handleCutItems(items.filter((it) => selectedPaths.has(it.path)))}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-start ${
                      isLightMode ? 'hover:bg-amber-50 text-amber-700 font-medium' : 'hover:bg-amber-500/15 text-amber-300 font-medium'
                    }`}
                  >
                    <Scissors className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{isEn ? `Cut (${selectedPaths.size}) Items` : `برش / کات (${selectedPaths.size}) مورد`}</span>
                  </button>

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

                  {/* Compress Selected Items */}
                  <button
                    type="button"
                    onClick={() => {
                      const selItems = items.filter((it) => selectedPaths.has(it.path));
                      handleOpenCompress(selItems);
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-start ${
                      isLightMode ? 'hover:bg-purple-50 text-purple-700 font-medium' : 'hover:bg-purple-500/15 text-purple-300 font-medium'
                    }`}
                  >
                    <FileArchive className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span>{isEn ? `Compress (${selectedPaths.size}) Items...` : `فشرده‌سازی (${selectedPaths.size}) مورد...`}</span>
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
                      const selItems = items.filter((it) => selectedPaths.has(it.path));
                      setDeleteDialog({
                        isOpen: true,
                        items: selItems.length > 0 ? selItems : (contextMenu.item ? [contextMenu.item] : []),
                        isRecursive: true,
                        loading: false,
                        error: null,
                        isMaximized: false,
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

                  {/* Copy Single Item */}
                  <button
                    type="button"
                    onClick={() => handleCopyItems([contextMenu.item!])}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-start ${
                      isLightMode ? 'hover:bg-slate-100 text-slate-700 font-medium' : 'hover:bg-white/10 text-slate-200 font-medium'
                    }`}
                  >
                    <Copy className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>{isEn ? 'Copy' : 'کپی (Copy)'}</span>
                  </button>

                  {/* Cut Single Item */}
                  <button
                    type="button"
                    onClick={() => handleCutItems([contextMenu.item!])}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-start ${
                      isLightMode ? 'hover:bg-amber-50 text-amber-700 font-medium' : 'hover:bg-amber-500/15 text-amber-300 font-medium'
                    }`}
                  >
                    <Scissors className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{isEn ? 'Cut' : 'برش / کات (Cut)'}</span>
                  </button>

                  {/* Paste Into this Folder (if folder and clipboard active) */}
                  {contextMenu.item.type === 'directory' && clipboard && clipboard.items.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handlePasteItems(contextMenu.item!.path)}
                      disabled={isPasting}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-start ${
                        isLightMode
                          ? 'hover:bg-emerald-50 text-emerald-700 font-semibold'
                          : 'hover:bg-emerald-500/15 text-emerald-300 font-semibold'
                      }`}
                    >
                      {isPasting ? (
                        <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin shrink-0" />
                      ) : (
                        <ClipboardPaste className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                      <span>
                        {isEn
                          ? `Paste (${clipboard.items.length}) Into Folder`
                          : `چسباندن (${clipboard.items.length}) در این پوشه`}
                      </span>
                    </button>
                  )}

                  <div className="my-1 border-t border-white/10" />

                  {/* Upload Into Directory */}
                  {contextMenu.item.type === 'directory' && (
                    <button
                      type="button"
                      onClick={() => {
                        setUploadModal({
                          isOpen: true,
                          targetPath: contextMenu.item!.path,
                          selectedFiles: [],
                          isUploading: false,
                          uploadProgress: 0,
                          currentFileIndex: 0,
                          error: null,
                        });
                        setContextMenu(null);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-start ${
                        isLightMode
                          ? 'hover:bg-blue-50 text-blue-700 font-medium'
                          : 'hover:bg-blue-500/15 text-blue-300 font-medium'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span>{isEn ? 'Upload Files Into Folder' : 'بارگذاری فایل در این پوشه'}</span>
                    </button>
                  )}

                  {/* Download Single File or Folder */}
                  <button
                    type="button"
                    onClick={() => handleDownload([contextMenu.item!.path], contextMenu.item!.type === 'directory')}
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

                  {/* Compress Single Item */}
                  <button
                    type="button"
                    onClick={() => handleOpenCompress([contextMenu.item!])}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-start ${
                      isLightMode ? 'hover:bg-purple-50 text-purple-700 font-medium' : 'hover:bg-purple-500/15 text-purple-300 font-medium'
                    }`}
                  >
                    <FileArchive className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span>{isEn ? 'Compress / Archive...' : 'فشرده‌سازی (Compress)...'}</span>
                  </button>

                  {/* Extract Archive (if file is an archive) */}
                  {isArchiveItem(contextMenu.item) && (
                    <>
                      {/* Extract in Current Folder */}
                      <button
                        type="button"
                        onClick={() => handleQuickExtractCurrentDir(contextMenu.item!)}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-start ${
                          isLightMode ? 'hover:bg-amber-50 text-amber-700 font-semibold' : 'hover:bg-amber-500/15 text-amber-300 font-semibold'
                        }`}
                      >
                        <Archive className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>{isEn ? 'Extract Here (Current Folder)' : 'استخراج در همین پوشه'}</span>
                      </button>

                      {/* Extract to Custom Directory */}
                      <button
                        type="button"
                        onClick={() => handleOpenExtract(contextMenu.item!)}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-start ${
                          isLightMode ? 'hover:bg-amber-50 text-amber-700 font-medium' : 'hover:bg-amber-500/15 text-amber-300 font-medium'
                        }`}
                      >
                        <Archive className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>{isEn ? 'Extract Archive...' : 'استخراج به مسیر دلخواه (Extract)...'}</span>
                      </button>
                    </>
                  )}

                  {/* Copy Path */}
                  <button
                    type="button"
                    onClick={() => {
                      handleCopyPath(contextMenu.item!.path);
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
                        newName: contextMenu.item!.name,
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

                  {/* Properties / Info */}
                  <button
                    type="button"
                    onClick={() => handleOpenProperties(contextMenu.item)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-start ${
                      isLightMode ? 'hover:bg-indigo-50 text-indigo-700 font-medium' : 'hover:bg-indigo-500/15 text-indigo-300 font-medium'
                    }`}
                  >
                    <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span>{isEn ? 'Properties / Info' : 'مشخصات و جزئیات (Properties)'}</span>
                  </button>

                  <div className="my-1 border-t border-white/10" />

                  {/* Delete Single Item */}
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteDialog({
                        isOpen: true,
                        items: [contextMenu.item!],
                        isRecursive: true,
                        loading: false,
                        error: null,
                        isMaximized: false,
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
    </div>,
    document.body
  );
};
