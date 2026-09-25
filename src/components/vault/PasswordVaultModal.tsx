import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  Check,
  Plus,
  Trash2,
  Edit2,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Server,
  Router,
  Cloud,
  Database,
  Wifi,
  FileText,
  RefreshCw,
  X,
  Minus,
  Maximize2,
  Minimize2,
  Sparkles,
  Download,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { FieldInfoTooltip } from '../vpn/FieldInfoTooltip';

export interface VaultItem {
  id: string;
  userId: string;
  name: string;
  username: string;
  category: string;
  targetHost: string;
  notes: string;
  tags: string[];
  strength: string;
  hasPassword: boolean;
  maskedPassword: string;
  createdAt: string;
  updatedAt: string;
}

export interface PasswordVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize: () => void;
  isLightMode: boolean;
  isEn: boolean;
}

const CATEGORIES = [
  { id: 'all', labelEn: 'All Categories', labelFa: 'همه دسته‌بندی‌ها', icon: Lock },
  { id: 'network', labelEn: 'Network Devices', labelFa: 'تجهیزات شبکه (سوئیچ/روتر)', icon: Router },
  { id: 'servers', labelEn: 'Servers & VMs', labelFa: 'سرورها و ماشین‌های مجازی', icon: Server },
  { id: 'cloud', labelEn: 'Cloud & Web Portals', labelFa: 'پرتال‌های ابری و وب', icon: Cloud },
  { id: 'database', labelEn: 'Databases', labelFa: 'پایگاه‌های داده', icon: Database },
  { id: 'vpn', labelEn: 'VPN & Wi-Fi', labelFa: 'ارتباطات VPN و وای‌فای', icon: Wifi },
  { id: 'general', labelEn: 'General & Other', labelFa: 'سایر و عمومی', icon: FileText },
];

function calculatePasswordStrength(pass: string): {
  score: number;
  labelEn: string;
  labelFa: string;
  color: string;
} {
  if (!pass) return { score: 0, labelEn: 'Empty', labelFa: 'خالی', color: 'slate' };
  let score = 0;
  if (pass.length >= 8) score += 25;
  if (pass.length >= 14) score += 25;
  if (/[a-z]/.test(pass) && /[A-Z]/.test(pass)) score += 20;
  if (/\d/.test(pass)) score += 15;
  if (/[^a-zA-Z0-9]/.test(pass)) score += 15;

  if (score >= 85) return { score, labelEn: 'Very Strong', labelFa: 'بسیار قوی', color: 'emerald' };
  if (score >= 60) return { score, labelEn: 'Strong', labelFa: 'قوی', color: 'cyan' };
  if (score >= 40) return { score, labelEn: 'Medium', labelFa: 'متوسط', color: 'amber' };
  return { score, labelEn: 'Weak', labelFa: 'ضعیف', color: 'rose' };
}

function generateRandomPassword(length = 18): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$%^&*()_+~=';
  let result = '';
  const array = new Uint32Array(length);
  window.crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}

export const PasswordVaultModal: React.FC<PasswordVaultModalProps> = ({
  isOpen,
  onClose,
  onMinimize,
  isLightMode,
  isEn,
}) => {
  const { user, token } = useAuth();
  const [isMaximized, setIsMaximized] = useState(false);
  const [items, setItems] = useState<VaultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Reveal cache (id -> decrypted password)
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
  const [revealingIds, setRevealingIds] = useState<Record<string, boolean>>({});

  // Copy feedback (id -> boolean)
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VaultItem | null>(null);
  const [formName, setFormName] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formCategory, setFormCategory] = useState('general');
  const [formTargetHost, setFormTargetHost] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formShowPassword, setFormShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Re-authentication states for secret reveal & copy
  const [authPromptItem, setAuthPromptItem] = useState<VaultItem | null>(null);
  const [authPromptAction, setAuthPromptAction] = useState<'reveal' | 'copy'>('reveal');
  const [authPasswordInput, setAuthPasswordInput] = useState('');
  const [authPasswordShow, setAuthPasswordShow] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isVerifyingAuth, setIsVerifyingAuth] = useState(false);

  // Delete confirm
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Auth headers helper
  const getAuthHeaders = useCallback(() => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (user?.id) {
      headers['x-user-id'] = user.id;
    }
    if (user?.username) {
      headers['x-username'] = user.username;
    }
    return headers;
  }, [token, user]);

  // Fetch items
  const fetchVaultItems = useCallback(async () => {
    if (!isOpen) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/vault', {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }
      const data = await res.json();
      if (data.success && Array.isArray(data.items)) {
        setItems(data.items);
      } else {
        throw new Error(data.error || 'Failed to load vault');
      }
    } catch (err: any) {
      console.error('Fetch vault error:', err);
      setErrorMsg(
        isEn
          ? 'Unable to connect to your isolated password vault. Please ensure you are logged in.'
          : 'خطا در برقراری ارتباط با والت گذرواژه‌ها. لطفاً اطمینان حاصل کنید که وارد سامانه شده‌اید.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [isOpen, getAuthHeaders, isEn]);

  useEffect(() => {
    if (isOpen) {
      fetchVaultItems();
    } else {
      // Clear sensitive reveals when closed
      setRevealedPasswords({});
      setIsFormOpen(false);
      setEditingItem(null);
      setAuthPromptItem(null);
      setAuthPasswordInput('');
      setAuthError(null);
    }
  }, [isOpen, fetchVaultItems]);

  // Reveal password on-demand (prompts user for login password)
  const handleToggleReveal = (item: VaultItem) => {
    if (revealedPasswords[item.id]) {
      // Hide
      setRevealedPasswords((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      return;
    }

    // Prompt user for account login password
    setAuthPromptItem(item);
    setAuthPromptAction('reveal');
    setAuthPasswordInput('');
    setAuthPasswordShow(false);
    setAuthError(null);
  };

  // Copy password (reveals if not revealed yet or directly copies)
  const handleCopyPassword = async (item: VaultItem) => {
    const pass = revealedPasswords[item.id];
    if (pass) {
      await navigator.clipboard.writeText(pass);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2500);
      return;
    }

    // Prompt user for account login password to decrypt and copy
    setAuthPromptItem(item);
    setAuthPromptAction('copy');
    setAuthPasswordInput('');
    setAuthPasswordShow(false);
    setAuthError(null);
  };

  // Confirm user's master login password and decrypt
  const handleConfirmAuth = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!authPromptItem || !authPasswordInput.trim() || isVerifyingAuth) return;

    setIsVerifyingAuth(true);
    setAuthError(null);

    try {
      const res = await fetch(`/api/vault/${authPromptItem.id}/reveal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          loginPassword: authPasswordInput.trim(),
        }),
      });

      const data = await res.json();

      if (res.ok && data.success && data.password !== undefined) {
        setRevealedPasswords((prev) => ({ ...prev, [authPromptItem.id]: data.password }));

        if (authPromptAction === 'copy') {
          try {
            await navigator.clipboard.writeText(data.password);
            setCopiedId(authPromptItem.id);
            setTimeout(() => setCopiedId(null), 2500);
          } catch (clipErr) {
            console.error('Clipboard copy error:', clipErr);
          }
        }

        // Close auth modal
        setAuthPromptItem(null);
        setAuthPasswordInput('');
        setAuthError(null);
      } else {
        const errMsg = isEn
          ? (data.error || 'Authentication failed. Please verify your login password.')
          : (data.message || data.error || 'رمز عبور حساب کاربری نامعتبر است.');
        setAuthError(errMsg);
      }
    } catch (err: any) {
      console.error('Auth reveal error:', err);
      setAuthError(isEn ? 'Network error during password verification.' : 'خطای ارتباطی حین احراز هویت گذرواژه.');
    } finally {
      setIsVerifyingAuth(false);
    }
  };

  // Open add form
  const handleOpenAddForm = () => {
    setEditingItem(null);
    setFormName('');
    setFormPassword('');
    setFormUsername('');
    setFormCategory('general');
    setFormTargetHost('');
    setFormNotes('');
    setFormShowPassword(true);
    setIsFormOpen(true);
  };

  // Open edit form
  const handleOpenEditForm = async (item: VaultItem) => {
    setEditingItem(item);
    setFormName(item.name);
    setFormUsername(item.username);
    setFormCategory(item.category || 'general');
    setFormTargetHost(item.targetHost || '');
    setFormNotes(item.notes || '');
    setFormPassword(''); // Empty means don't change
    setFormShowPassword(false);
    setIsFormOpen(true);

    // Pre-fetch password if revealed
    if (revealedPasswords[item.id]) {
      setFormPassword(revealedPasswords[item.id]);
    }
  };

  // Save form handler
  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      alert(isEn ? 'Please enter a name for this password entry.' : 'لطفاً یک نام برای این ورودی گذرواژه مشخص کنید.');
      return;
    }
    if (!editingItem && !formPassword.trim()) {
      alert(isEn ? 'Password cannot be empty.' : 'گذرواژه نمی‌تواند خالی باشد.');
      return;
    }

    setIsSaving(true);
    try {
      const strength = calculatePasswordStrength(formPassword).labelEn.toLowerCase();
      const payload: any = {
        name: formName.trim(),
        username: formUsername.trim(),
        category: formCategory,
        targetHost: formTargetHost.trim(),
        notes: formNotes.trim(),
        strength,
      };

      if (formPassword.trim()) {
        payload.password = formPassword.trim();
      }

      let res: Response;
      if (editingItem) {
        res = await fetch(`/api/vault/${editingItem.id}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/vault', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (data.success && data.item) {
        if (formPassword.trim()) {
          setRevealedPasswords((prev) => ({ ...prev, [data.item.id]: formPassword.trim() }));
        }
        setIsFormOpen(false);
        fetchVaultItems();
      } else {
        alert(isEn ? 'Failed to save: ' + (data.error || 'Unknown error') : 'خطا در ذخیره‌سازی: ' + (data.error || 'خطای نامشخص'));
      }
    } catch (err: any) {
      console.error('Save vault item error:', err);
      alert(isEn ? 'Network error saving password' : 'خطای ارتباطی در ذخیره گذرواژه');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete item handler
  const handleDeleteItem = async (id: string) => {
    try {
      const res = await fetch(`/api/vault/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setItems((prev) => prev.filter((i) => i.id !== id));
        setDeleteConfirmId(null);
        setRevealedPasswords((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      } else {
        alert(isEn ? 'Failed to delete entry' : 'خطا در حذف آیتم');
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  // Export JSON
  const handleExportJSON = () => {
    const exportData = {
      vaultOwner: user?.username || 'user',
      exportedAt: new Date().toISOString(),
      itemCount: items.length,
      items: items.map((i) => ({
        name: i.name,
        username: i.username,
        category: i.category,
        targetHost: i.targetHost,
        notes: i.notes,
        createdAt: i.createdAt,
      })),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `password_vault_${user?.username || 'user'}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.name.toLowerCase().includes(q);
        const matchUser = item.username.toLowerCase().includes(q);
        const matchHost = item.targetHost.toLowerCase().includes(q);
        const matchNotes = item.notes.toLowerCase().includes(q);
        return matchName || matchUser || matchHost || matchNotes;
      }
      return true;
    });
  }, [items, selectedCategory, searchQuery]);

  if (!isOpen) return null;

  const currentStrength = calculatePasswordStrength(formPassword);

  return createPortal(
    <div
      id="password-vault-modal-root"
      dir={isEn ? 'ltr' : 'rtl'}
      className={`fixed top-0 left-0 right-0 bottom-8 ${
        isMaximized ? 'p-0' : 'p-3 sm:p-5'
      } z-[999990] flex items-center justify-center bg-black/75 backdrop-blur-sm transition-all duration-200 select-text`}
    >
      <div
        id="password-vault-modal-container"
        className={`flex flex-col w-full overflow-hidden transition-all duration-200 shadow-2xl ${
          isMaximized
            ? 'w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'max-w-5xl h-[88vh] max-h-[860px] rounded-2xl border'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-200 text-slate-800 shadow-slate-300/50'
            : 'bg-slate-950 border-slate-800 text-slate-100 shadow-cyan-950/40'
        }`}
      >
        {/* =====================================================================
            HEADER (UNIVERSAL 3 CONTROLS: CLOSE, MINIMIZE, FULLSCREEN)
            ===================================================================== */}
        <div
          id="password-vault-header"
          className={`flex items-center justify-between px-5 py-3.5 border-b select-none shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800/80'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl flex items-center justify-center shadow-sm ${
                isLightMode ? 'bg-cyan-100 text-cyan-800 border border-cyan-200' : 'bg-cyan-950/70 text-cyan-400 border border-cyan-700/50'
              }`}
            >
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold tracking-tight">
                  {isEn ? 'Personal Password Vault' : 'کیف امن گذرواژه‌ها (ولت اختصاصی)'}
                </h2>
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                    isLightMode
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-emerald-950/50 text-emerald-400 border-emerald-700/50'
                  }`}
                  title={isEn ? 'Hardware-grade AES-256-GCM encryption per user' : 'رمزنگاری مستقل سخت‌افزاری با کلید اختصاصی کاربر'}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>
                    {isEn ? `Owner: ${user?.username || 'You'}` : `مالک ولت: ${user?.username || 'شما'}`}
                  </span>
                </div>
              </div>
              <p className={`text-xs mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'Zero-knowledge encrypted password manager. Only you can decrypt and access your credentials.'
                  : 'مدیریت امن رمزهای عبور با ایزولاسیون کامل دیتابیس؛ فقط شخص شما دسترسی رمزگشایی و مشاهده کلمات عبور خود را دارید.'}
              </p>
            </div>
          </div>

          {/* Controls: Minimize, Fullscreen, Close */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              id="password-vault-minimize-btn"
              onClick={onMinimize}
              title={isEn ? 'Minimize to Bottom Dock' : 'کوچک‌نمایی و ارسال به داک پایین'}
              className={`p-2 rounded-lg transition-colors border ${
                isLightMode
                  ? 'hover:bg-slate-100 text-slate-600 border-slate-200'
                  : 'hover:bg-slate-800 text-slate-400 border-slate-800'
              }`}
            >
              <Minus className="w-4 h-4" />
            </button>

            <button
              type="button"
              id="password-vault-fullscreen-btn"
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
              className={`p-2 rounded-lg transition-colors border ${
                isLightMode
                  ? 'hover:bg-slate-100 text-slate-600 border-slate-200'
                  : 'hover:bg-slate-800 text-slate-400 border-slate-800'
              }`}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              id="password-vault-close-btn"
              onClick={onClose}
              title={isEn ? 'Close Vault' : 'بستن ولت'}
              className={`p-2 rounded-lg transition-colors border ${
                isLightMode
                  ? 'hover:bg-rose-50 text-slate-600 hover:text-rose-600 border-slate-200 hover:border-rose-200'
                  : 'hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border-slate-800 hover:border-rose-800/50'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* =====================================================================
            TOP STATS & ACTION TOOLBAR
            ===================================================================== */}
        <div
          id="password-vault-toolbar"
          className={`px-5 py-3 border-b flex flex-wrap items-center justify-between gap-3 shrink-0 ${
            isLightMode ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-900/40 border-slate-800/60'
          }`}
        >
          {/* Search Input */}
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search
              className={`absolute top-2.5 w-4 h-4 pointer-events-none ${
                isEn ? 'left-3' : 'right-3'
              } ${isLightMode ? 'text-slate-400' : 'text-slate-500'}`}
            />
            <input
              type="text"
              id="password-vault-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isEn ? 'Search passwords, users, hosts...' : 'جستجو در نام، کاربر، هاست، توضیحات...'}
              className={`w-full py-1.5 text-xs sm:text-sm rounded-xl border transition-all outline-none ${
                isEn ? 'pl-9 pr-3' : 'pr-9 pl-3'
              } ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-900 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500'
                  : 'bg-slate-900 border-slate-700/80 text-white focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400'
              }`}
            />
          </div>

          {/* Quick Stats Pill */}
          <div className="flex items-center gap-2">
            <div
              className={`px-3 py-1 rounded-xl text-xs font-medium border flex items-center gap-1.5 ${
                isLightMode ? 'bg-white border-slate-200 text-slate-600' : 'bg-slate-900 border-slate-800 text-slate-300'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5 text-cyan-500" />
              <span>
                {isEn ? `${items.length} Saved Passwords` : `${items.length} گذرواژه ذخیره‌شده`}
              </span>
            </div>

            {/* Refresh */}
            <button
              type="button"
              id="password-vault-refresh-btn"
              onClick={fetchVaultItems}
              disabled={isLoading}
              title={isEn ? 'Refresh Vault' : 'تازه‌سازی اطلاعات'}
              className={`p-2 rounded-xl border transition-colors ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-cyan-500' : ''}`} />
            </button>

            {/* Export JSON */}
            <button
              type="button"
              id="password-vault-export-btn"
              onClick={handleExportJSON}
              disabled={items.length === 0}
              title={isEn ? 'Export Metadata' : 'خروجی فایل متاداده'}
              className={`p-2 rounded-xl border transition-colors ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-50'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            {/* Add New Password Button */}
            <button
              type="button"
              id="password-vault-add-new-btn"
              onClick={handleOpenAddForm}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-sm ${
                isLightMode
                  ? 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-cyan-600/20'
                  : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-cyan-500/20'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>{isEn ? 'Add Password' : 'افزودن گذرواژه جدید'}</span>
            </button>
          </div>
        </div>

        {/* =====================================================================
            CATEGORY SELECTOR TABS
            ===================================================================== */}
        <div
          id="password-vault-categories-bar"
          className={`px-5 py-2.5 border-b flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800/80'
          }`}
        >
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isSelected = selectedCategory === cat.id;
            const count =
              cat.id === 'all'
                ? items.length
                : items.filter((i) => i.category === cat.id).length;

            return (
              <button
                key={cat.id}
                type="button"
                id={`vault-cat-${cat.id}`}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs whitespace-nowrap font-medium transition-all border ${
                  isSelected
                    ? isLightMode
                      ? 'bg-cyan-50 border-cyan-300 text-cyan-900 shadow-sm'
                      : 'bg-cyan-950/60 border-cyan-500/70 text-cyan-300 shadow-sm shadow-cyan-900/30'
                    : isLightMode
                    ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
                    : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-cyan-500' : 'text-slate-400'}`} />
                <span>{isEn ? cat.labelEn : cat.labelFa}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-md text-[10px] font-bold ${
                    isSelected
                      ? isLightMode
                        ? 'bg-cyan-200 text-cyan-900'
                        : 'bg-cyan-800 text-cyan-100'
                      : isLightMode
                      ? 'bg-slate-200 text-slate-600'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* =====================================================================
            BODY CONTENT AREA
            ===================================================================== */}
        <div
          id="password-vault-body"
          className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar"
        >
          {errorMsg && (
            <div
              className={`mb-4 p-3.5 rounded-xl text-xs flex items-center gap-2.5 border ${
                isLightMode
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
              }`}
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {isLoading && items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-cyan-500" />
              <p className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn ? 'Loading your isolated password vault...' : 'در حال بارگذاری ولت کلمات عبور اختصاصی شما...'}
              </p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div
              className={`flex flex-col items-center justify-center py-16 px-4 text-center rounded-2xl border border-dashed ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-600'
                  : 'bg-slate-900/30 border-slate-800 text-slate-400'
              }`}
            >
              <div
                className={`p-4 rounded-2xl mb-4 ${
                  isLightMode ? 'bg-cyan-50 text-cyan-600' : 'bg-cyan-950/50 text-cyan-400'
                }`}
              >
                <Lock className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold mb-1">
                {searchQuery || selectedCategory !== 'all'
                  ? isEn
                    ? 'No matching password records'
                    : 'هیچ رکوردی با این مشخصات یافت نشد'
                  : isEn
                  ? 'Your Vault is Currently Empty'
                  : 'کیف امن گذرواژه‌های شما در حال حاضر خالی است'}
              </h3>
              <p className="text-xs max-w-md mb-5 leading-relaxed">
                {searchQuery || selectedCategory !== 'all'
                  ? isEn
                    ? 'Try clearing the search query or changing category filter.'
                    : 'لطفاً عبارت جستجو را پاک کرده یا دسته‌بندی دیگری انتخاب نمایید.'
                  : isEn
                  ? 'Store switch enable secrets, router passwords, SSH credentials, and server keys with complete personal privacy.'
                  : 'کلمات عبور سوئیچ‌ها، روترها، پرتال‌ها، سرورها و کلیدهای محرمانه خود را با امنیت حداکثری و ایزولاسیون کامل در ولت شخصی ثبت نمایید.'}
              </p>
              <button
                type="button"
                onClick={handleOpenAddForm}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all ${
                  isLightMode
                    ? 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-cyan-600/20'
                    : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-cyan-500/20'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>{isEn ? 'Add Your First Password' : 'افزودن اولین گذرواژه به ولت'}</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredItems.map((item) => {
                const isRevealed = Boolean(revealedPasswords[item.id]);
                const isRevealing = Boolean(revealingIds[item.id]);
                const isCopied = copiedId === item.id;
                const isConfirmingDelete = deleteConfirmId === item.id;

                const catObj = CATEGORIES.find((c) => c.id === item.category) || CATEGORIES[CATEGORIES.length - 1];
                const CatIcon = catObj.icon;

                return (
                  <div
                    key={item.id}
                    id={`vault-item-card-${item.id}`}
                    className={`flex flex-col justify-between p-4 rounded-2xl border transition-all duration-200 group ${
                      isLightMode
                        ? 'bg-white border-slate-200 hover:border-cyan-300 hover:shadow-md hover:shadow-slate-200'
                        : 'bg-slate-900/70 border-slate-800/80 hover:border-cyan-500/50 hover:bg-slate-900 hover:shadow-lg hover:shadow-cyan-950/20'
                    }`}
                  >
                    {/* Card Top: Category & Actions */}
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2.5">
                        <div
                          className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-medium border ${
                            isLightMode
                              ? 'bg-slate-100 text-slate-600 border-slate-200'
                              : 'bg-slate-800/80 text-slate-300 border-slate-700/60'
                          }`}
                        >
                          <CatIcon className="w-3 h-3 text-cyan-500" />
                          <span>{isEn ? catObj.labelEn : catObj.labelFa}</span>
                        </div>

                        {/* Edit & Delete Buttons */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditForm(item)}
                            title={isEn ? 'Edit Entry' : 'ویرایش مشخصات'}
                            className={`p-1.5 rounded-lg transition-colors border ${
                              isLightMode
                                ? 'hover:bg-slate-100 text-slate-500 hover:text-slate-800 border-transparent hover:border-slate-200'
                                : 'hover:bg-slate-800 text-slate-400 hover:text-white border-transparent hover:border-slate-700'
                            }`}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(item.id)}
                            title={isEn ? 'Delete Password' : 'حذف گذرواژه'}
                            className={`p-1.5 rounded-lg transition-colors border ${
                              isLightMode
                                ? 'hover:bg-rose-50 text-slate-500 hover:text-rose-600 border-transparent hover:border-rose-200'
                                : 'hover:bg-rose-950/50 text-slate-400 hover:text-rose-400 border-transparent hover:border-rose-800/60'
                            }`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Name / Title */}
                      <h4 className="text-sm font-bold truncate leading-snug mb-1 text-slate-900 dark:text-slate-100">
                        {item.name}
                      </h4>

                      {/* Username & Target Host */}
                      <div className="space-y-1 mb-3">
                        {item.username && (
                          <div className="flex items-center justify-between text-xs">
                            <span className={isLightMode ? 'text-slate-500' : 'text-slate-400'}>
                              {isEn ? 'User:' : 'نام کاربری:'}
                            </span>
                            <span className="font-mono font-medium truncate max-w-[170px]">
                              {item.username}
                            </span>
                          </div>
                        )}
                        {item.targetHost && (
                          <div className="flex items-center justify-between text-xs">
                            <span className={isLightMode ? 'text-slate-500' : 'text-slate-400'}>
                              {isEn ? 'Host / IP:' : 'آدرس / هاست:'}
                            </span>
                            <span className="font-mono text-cyan-600 dark:text-cyan-400 font-medium truncate max-w-[170px]">
                              {item.targetHost}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Notes snippet if any */}
                      {item.notes && (
                        <p
                          className={`text-[11px] mb-3 line-clamp-2 leading-relaxed ${
                            isLightMode ? 'text-slate-500 bg-slate-50 p-2 rounded-lg' : 'text-slate-400 bg-slate-950/60 p-2 rounded-lg border border-slate-800/60'
                          }`}
                        >
                          {item.notes}
                        </p>
                      )}
                    </div>

                    {/* Card Bottom: Password display, Reveal, Copy */}
                    <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
                      <div
                        className={`flex items-center justify-between p-2 rounded-xl border mb-2 font-mono text-xs ${
                          isLightMode ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-950 border-slate-800'
                        }`}
                      >
                        <div className="truncate flex-1 pr-2">
                          {isRevealed ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold select-all tracking-wider">
                              {revealedPasswords[item.id]}
                            </span>
                          ) : (
                            <span className="text-slate-400 tracking-widest font-sans select-none">
                              ••••••••••••
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {/* Reveal/Hide Button */}
                          <button
                            type="button"
                            onClick={() => handleToggleReveal(item)}
                            disabled={isRevealing}
                            title={isRevealed ? (isEn ? 'Hide Password' : 'مخفی‌سازی') : (isEn ? 'Reveal Password' : 'نمایش گذرواژه')}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isLightMode
                                ? 'hover:bg-slate-200 text-slate-600'
                                : 'hover:bg-slate-800 text-slate-300'
                            }`}
                          >
                            {isRevealing ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-500" />
                            ) : isRevealed ? (
                              <EyeOff className="w-3.5 h-3.5 text-amber-500" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* Copy Button */}
                          <button
                            type="button"
                            onClick={() => handleCopyPassword(item)}
                            title={isEn ? 'Copy Password' : 'کپی گذرواژه'}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isCopied
                                ? 'bg-emerald-500 text-white'
                                : isLightMode
                                ? 'hover:bg-slate-200 text-slate-600'
                                : 'hover:bg-slate-800 text-slate-300'
                            }`}
                          >
                            {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 px-0.5">
                        <span>
                          {isEn
                            ? `Updated: ${new Date(item.updatedAt).toLocaleDateString()}`
                            : `بروزرسانی: ${new Date(item.updatedAt).toLocaleDateString('fa-IR')}`}
                        </span>
                        {isCopied && (
                          <span className="text-emerald-500 font-semibold animate-pulse">
                            {isEn ? 'Copied!' : 'کپی شد!'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Delete Confirmation Overlay */}
                    {isConfirmingDelete && (
                      <div
                        className={`absolute inset-0 p-4 rounded-2xl flex flex-col items-center justify-center text-center backdrop-blur-md z-10 ${
                          isLightMode ? 'bg-white/95 text-slate-900' : 'bg-slate-950/95 text-white'
                        }`}
                      >
                        <Trash2 className="w-8 h-8 text-rose-500 mb-2 animate-bounce" />
                        <h5 className="text-xs font-bold mb-1">
                          {isEn ? 'Delete this password?' : 'آیا از حذف این گذرواژه اطمینان دارید؟'}
                        </h5>
                        <p className="text-[11px] text-slate-400 mb-3 max-w-[200px]">
                          {isEn
                            ? 'This action cannot be undone.'
                            : 'این عملیات غیرقابل بازگشت است و رمز برای همیشه حذف می‌شود.'}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(null)}
                            className={`px-3 py-1 rounded-xl text-xs font-medium border ${
                              isLightMode ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'
                            }`}
                          >
                            {isEn ? 'Cancel' : 'انصراف'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item.id)}
                            className="px-3 py-1 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-sm"
                          >
                            {isEn ? 'Yes, Delete' : 'بله، حذف کن'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* =====================================================================
            ADD / EDIT MODAL (POPUP DIALOG WITH 5-RULE STANDARDS & FIELD INFO)
            ===================================================================== */}
        {isFormOpen && (
          <div
            id="password-vault-form-backdrop"
            className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <form
              onSubmit={handleSaveForm}
              id="password-vault-entry-form"
              className={`flex flex-col w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden transition-all ${
                isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-100'
              }`}
            >
              {/* Form Header */}
              <div
                className={`flex items-center justify-between px-5 py-3.5 border-b ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`p-1.5 rounded-lg ${
                      isLightMode ? 'bg-cyan-100 text-cyan-800' : 'bg-cyan-950 text-cyan-400'
                    }`}
                  >
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold">
                    {editingItem
                      ? isEn
                        ? 'Edit Vault Password'
                        : 'ویرایش گذرواژه در ولت'
                      : isEn
                      ? 'Add New Password to Vault'
                      : 'افزودن گذرواژه جدید به ولت شخصی'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isLightMode ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-slate-800 text-slate-400'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form Fields with 3-Part FieldInfoTooltip */}
              <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar text-xs">
                {/* 1. Name / Label */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <label htmlFor="form-vault-name" className="font-semibold text-slate-700 dark:text-slate-200">
                        {isEn ? 'Entry Label / Name *' : 'نام یا عنوان گذرواژه *'}
                      </label>
                      <FieldInfoTooltip
                        isEn={isEn}
                        isLightMode={isLightMode}
                        title={isEn ? 'Password Label' : 'عنوان ورودی'}
                        whatIsIt={
                          isEn
                            ? 'A distinct, recognizable identifier for this credential.'
                            : 'یک شناسه شفاف و مشخص برای این رکورد احراز هویت.'
                        }
                        whyNeeded={
                          isEn
                            ? 'Allows fast search and distinct identification among hundreds of devices and servers.'
                            : 'امکان جستجوی سریع و تفکیک فوری کلمه عبور در میان صدها سوئیچ، روتر یا سرور را فراهم می‌کند.'
                        }
                        practicalExample={
                          isEn
                            ? 'e.g., "Core Switch Cisco 2960 Enable Secret" or "Proxmox Root VM Node 1"'
                            : 'مثال: «سوئیچ کور - پسورد Enable» یا «سرور لینوکس دیتابیس - کاربر root»'
                        }
                      />
                    </div>
                  </div>
                  <input
                    id="form-vault-name"
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder={isEn ? 'e.g., Cisco 2960 Enable Secret' : 'مثال: سوئیچ لایه ۳ - پسورد Enable'}
                    className={`w-full px-3 py-2 rounded-xl border text-xs outline-none transition-all ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-cyan-500'
                        : 'bg-slate-900 border-slate-700 text-white focus:border-cyan-400'
                    }`}
                  />
                </div>

                {/* 2. Password with generator and strength meter */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <label htmlFor="form-vault-password" className="font-semibold text-slate-700 dark:text-slate-200">
                        {editingItem
                          ? isEn
                            ? 'Password (leave blank to keep current)'
                            : 'گذرواژه (برای حفظ رمز فعلی خالی بگذارید)'
                          : isEn
                          ? 'Password Value *'
                          : 'مقدار کلمه عبور *'}
                      </label>
                      <FieldInfoTooltip
                        isEn={isEn}
                        isLightMode={isLightMode}
                        title={isEn ? 'Password Secret' : 'گذرواژه محرمانه'}
                        whatIsIt={
                          isEn
                            ? 'The secret string encrypted with AES-256-GCM before storage.'
                            : 'رشته محرمانه کلمه عبور که پیش از ذخیره در دیتابیس با استاندارد AES-256-GCM رمزگذاری می‌شود.'
                        }
                        whyNeeded={
                          isEn
                            ? 'Protects your infrastructure credentials with hardware-level confidentiality.'
                            : 'تجهیزات زیرساخت شما را با امنیت سخت‌افزاری در برابر نفوذ و افشای کلمات عبور ایمن می‌سازد.'
                        }
                        practicalExample={
                          isEn
                            ? 'e.g., "C!sc0_Sec#re_2026!xK" or click "Generate Strong"'
                            : 'مثال: «C!sc0_Sec#re_2026!xK» یا استفاده از کلید «ساخت پسورد قوی»'
                        }
                      />
                    </div>

                    {/* Quick Generator Button */}
                    <button
                      type="button"
                      onClick={() => {
                        const pass = generateRandomPassword(20);
                        setFormPassword(pass);
                        setFormShowPassword(true);
                      }}
                      className="flex items-center gap-1 text-[11px] text-cyan-600 dark:text-cyan-400 hover:underline font-medium"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>{isEn ? 'Generate Strong' : 'ساخت رمز قوی'}</span>
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      id="form-vault-password"
                      type={formShowPassword ? 'text' : 'password'}
                      required={!editingItem}
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      placeholder={editingItem ? '••••••••••••' : (isEn ? 'Enter password or generate...' : 'گذرواژه را وارد یا بسازید...')}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-mono outline-none transition-all ${
                        isEn ? 'pr-9' : 'pl-9'
                      } ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-cyan-500'
                          : 'bg-slate-900 border-slate-700 text-white focus:border-cyan-400'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setFormShowPassword(!formShowPassword)}
                      className={`absolute top-2.5 ${isEn ? 'right-3' : 'left-3'} text-slate-400 hover:text-slate-200`}
                    >
                      {formShowPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Real-time strength meter */}
                  {formPassword && (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className={isLightMode ? 'text-slate-500' : 'text-slate-400'}>
                          {isEn ? 'Strength Score:' : 'شاخص امنیت:'}
                        </span>
                        <span
                          className={`font-bold ${
                            currentStrength.score >= 80
                              ? 'text-emerald-500'
                              : currentStrength.score >= 50
                              ? 'text-cyan-500'
                              : currentStrength.score >= 30
                              ? 'text-amber-500'
                              : 'text-rose-500'
                          }`}
                        >
                          {isEn ? currentStrength.labelEn : currentStrength.labelFa} ({currentStrength.score}%)
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            currentStrength.score >= 80
                              ? 'bg-emerald-500'
                              : currentStrength.score >= 50
                              ? 'bg-cyan-500'
                              : currentStrength.score >= 30
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                          }`}
                          style={{ width: `${currentStrength.score}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Username */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <label htmlFor="form-vault-username" className="font-semibold text-slate-700 dark:text-slate-200">
                        {isEn ? 'Username / Account (Optional)' : 'نام کاربری یا اکانت (اختیاری)'}
                      </label>
                      <FieldInfoTooltip
                        isEn={isEn}
                        isLightMode={isLightMode}
                        title={isEn ? 'Associated Username' : 'نام کاربری وابسته'}
                        whatIsIt={
                          isEn
                            ? 'The login username paired with this password secret.'
                            : 'نام کاربری که این گذرواژه برای ورود به آن تعلق دارد.'
                        }
                        whyNeeded={
                          isEn
                            ? 'Stores both user and password together for fast 1-click clipboard paste during remote operations.'
                            : 'اطلاعات ورود را کامل نگه می‌دارد تا در اتصال‌های SSH یا وب بدون نیاز به حفظ کردن، مستقیماً کپی شود.'
                        }
                        practicalExample={isEn ? 'e.g., "admin", "cisco", or "root"' : 'مثال: «admin» یا «cisco» یا «root»'}
                      />
                    </div>
                  </div>
                  <input
                    id="form-vault-username"
                    type="text"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    placeholder={isEn ? 'e.g., admin, cisco, or root' : 'مثال: admin یا cisco'}
                    className={`w-full px-3 py-2 rounded-xl border text-xs outline-none transition-all ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-cyan-500'
                        : 'bg-slate-900 border-slate-700 text-white focus:border-cyan-400'
                    }`}
                  />
                </div>

                {/* 4. Category & Target Host */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <label htmlFor="form-vault-category" className="font-semibold text-slate-700 dark:text-slate-200">
                        {isEn ? 'Category' : 'دسته‌بندی'}
                      </label>
                      <FieldInfoTooltip
                        isEn={isEn}
                        isLightMode={isLightMode}
                        title={isEn ? 'Category Filter' : 'دسته‌بندی'}
                        whatIsIt={
                          isEn
                            ? 'Classification group for organizing your credentials.'
                            : 'گروه‌بندی جهت سازماندهی و فیلتر کردن آسان کلمات عبور.'
                        }
                        whyNeeded={
                          isEn
                            ? 'Enables quick filtering by Network, Servers, VPN, or Database.'
                            : 'امکان دسته‌بندی موضوعی بر اساس روتر، سرور، پرتال یا دیتابیس را فراهم می‌کند.'
                        }
                        practicalExample={isEn ? 'e.g., "Network Devices" or "Servers & VMs"' : 'مثال: «تجهیزات شبکه» یا «سرورها»'}
                      />
                    </div>
                    <select
                      id="form-vault-category"
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      className={`w-full px-3 py-2 rounded-xl border text-xs outline-none transition-all ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-cyan-500'
                          : 'bg-slate-900 border-slate-700 text-white focus:border-cyan-400'
                      }`}
                    >
                      {CATEGORIES.filter((c) => c.id !== 'all').map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {isEn ? cat.labelEn : cat.labelFa}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <label htmlFor="form-vault-host" className="font-semibold text-slate-700 dark:text-slate-200">
                        {isEn ? 'Target Host / IP (Optional)' : 'آدرس هاست یا IP (اختیاری)'}
                      </label>
                      <FieldInfoTooltip
                        isEn={isEn}
                        isLightMode={isLightMode}
                        title={isEn ? 'Target IP / Host' : 'آدرس مقصد'}
                        whatIsIt={
                          isEn
                            ? 'The IP address, domain name, or URL this credential authenticates against.'
                            : 'آدرس آی‌پی، دامنه یا آدرس اینترنتی دستگاهی که این رمز متعلق به آن است.'
                        }
                        whyNeeded={
                          isEn
                            ? 'Helps you associate passwords directly to network devices on the map or server fleet.'
                            : 'امکان اتصال مستقیم گذرواژه به نودهای توپولوژی و سرورهای پنل را فراهم می‌سازد.'
                        }
                        practicalExample={isEn ? 'e.g., "192.168.1.1" or "switch-core.corp.local"' : 'مثال: «192.168.1.1» یا «switch-core.local»'}
                      />
                    </div>
                    <input
                      id="form-vault-host"
                      type="text"
                      value={formTargetHost}
                      onChange={(e) => setFormTargetHost(e.target.value)}
                      placeholder={isEn ? 'e.g., 192.168.1.1' : 'مثال: 192.168.1.1'}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-mono outline-none transition-all ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-cyan-500'
                          : 'bg-slate-900 border-slate-700 text-white focus:border-cyan-400'
                      }`}
                    />
                  </div>
                </div>

                {/* 5. Notes / Description */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <label htmlFor="form-vault-notes" className="font-semibold text-slate-700 dark:text-slate-200">
                      {isEn ? 'Notes / Secret Remarks (Optional)' : 'توضیحات و نکات تکمیلی (اختیاری)'}
                    </label>
                    <FieldInfoTooltip
                      isEn={isEn}
                      isLightMode={isLightMode}
                      title={isEn ? 'Notes & Details' : 'توضیحات و جزئیات'}
                      whatIsIt={
                        isEn
                          ? 'Additional contextual notes such as port numbers, enable level, or recovery PIN.'
                          : 'یادداشت‌های کاربردی جانبی نظیر سطح دسترسی، پورت غیراستاندارد یا پین ریکاوری.'
                      }
                      whyNeeded={
                        isEn
                          ? 'Keeps operational instructions right beside the password.'
                          : 'دستورالعمل‌ها و یادداشت‌های فنی را مستقیماً کنار گذرواژه در دسترس نگه می‌دارد.'
                      }
                      practicalExample={
                        isEn
                          ? 'e.g., "Level 15 enable privilege secret, reset after maintenance window"'
                          : 'مثال: «پسورد سطح ۱۵ پریویلیج روتر، تغییر پس از هر دوره نگهداری»'
                      }
                    />
                  </div>
                  <textarea
                    id="form-vault-notes"
                    rows={2}
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder={isEn ? 'Enter any additional instructions or reminders...' : 'نکات یا یادآوری‌های تکمیلی را اینجا یادداشت کنید...'}
                    className={`w-full px-3 py-2 rounded-xl border text-xs outline-none transition-all resize-none ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-cyan-500'
                        : 'bg-slate-900 border-slate-700 text-white focus:border-cyan-400'
                    }`}
                  />
                </div>
              </div>

              {/* Form Footer */}
              <div
                className={`flex items-center justify-end gap-2 px-5 py-3 border-t ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                    isLightMode
                      ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                      : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                    isLightMode
                      ? 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-cyan-600/20'
                      : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/20'
                  } disabled:opacity-50`}
                >
                  {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                  <span>
                    {isSaving
                      ? isEn
                        ? 'Encrypting & Saving...'
                        : 'در حال رمزنگاری و ذخیره...'
                      : isEn
                      ? 'Save to Vault'
                      : 'ذخیره در ولت امن'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* =====================================================================
            RE-AUTHENTICATION MODAL (MASTER PASSWORD VERIFICATION)
            ===================================================================== */}
        {authPromptItem && (
          <div className="fixed top-0 left-0 right-0 bottom-8 z-[999995] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div
              id="vault-reauth-modal"
              className={`w-full max-w-md rounded-2xl shadow-2xl border overflow-hidden transition-all ${
                isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
              }`}
            >
              {/* Header */}
              <div
                className={`px-5 py-4 border-b flex items-center justify-between ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold">
                      {isEn ? 'Master Password Verification' : 'تأیید هویت و رمز عبور اصلی'}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {isEn ? 'Security Re-Authentication Required' : 'احراز هویت مجدد جهت دسترسی به گذرواژه'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAuthPromptItem(null);
                    setAuthPasswordInput('');
                    setAuthError(null);
                  }}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isLightMode ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-slate-800 text-slate-400'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form Body */}
              <form onSubmit={handleConfirmAuth} className="p-5 space-y-4">
                <div
                  className={`p-3 rounded-xl border text-xs leading-relaxed ${
                    isLightMode
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-amber-950/30 border-amber-800/40 text-amber-200'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium mb-1">
                        {isEn ? (
                          <>
                            To {authPromptAction === 'copy' ? 'copy' : 'reveal'} the secret for{' '}
                            <strong className="font-bold">{authPromptItem.name}</strong>, please enter your user login password.
                          </>
                        ) : (
                          <>
                            جهت {authPromptAction === 'copy' ? 'کپی' : 'مشاهده'} گذرواژه برای{' '}
                            <strong className="font-bold">«{authPromptItem.name}»</strong>، لطفاً رمز عبور ورود به سیستم خود را وارد نمایید.
                          </>
                        )}
                      </p>
                      <p className="text-[10px] opacity-80">
                        {isEn
                          ? 'Zero-knowledge decryption: secrets are decrypted on-demand after validating credentials.'
                          : 'رمزگشایی برخط: اطلاعات محرمانه فقط پس از احراز هویت موفقیت‌آمیز در سمت سرور رمزگشایی می‌شوند.'}
                      </p>
                    </div>
                  </div>
                </div>

                {authError && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-medium">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{authError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold mb-1.5">
                    {isEn ? 'Your Login Password' : 'رمز عبور حساب کاربری شما'}
                  </label>
                  <div className="relative">
                    <input
                      type={authPasswordShow ? 'text' : 'password'}
                      autoFocus
                      value={authPasswordInput}
                      onChange={(e) => {
                        setAuthPasswordInput(e.target.value);
                        if (authError) setAuthError(null);
                      }}
                      placeholder={isEn ? 'Enter current login password' : 'رمز عبور ورود به سامانه را وارد کنید'}
                      className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-mono border transition-all ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-cyan-500'
                          : 'bg-slate-950 border-slate-700 text-slate-100 focus:border-cyan-400'
                      } outline-none`}
                    />
                    <button
                      type="button"
                      onClick={() => setAuthPasswordShow(!authPasswordShow)}
                      tabIndex={-1}
                      className={`absolute top-1/2 -translate-y-1/2 ${
                        isEn ? 'right-3' : 'left-3'
                      } p-1 text-slate-400 hover:text-slate-200`}
                    >
                      {authPasswordShow ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthPromptItem(null);
                      setAuthPasswordInput('');
                      setAuthError(null);
                    }}
                    disabled={isVerifyingAuth}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                      isLightMode
                        ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                        : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {isEn ? 'Cancel' : 'انصراف'}
                  </button>
                  <button
                    type="submit"
                    disabled={isVerifyingAuth || !authPasswordInput.trim()}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                      isLightMode
                        ? 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-cyan-600/20'
                        : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/20'
                    } disabled:opacity-50`}
                  >
                    {isVerifyingAuth ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {isVerifyingAuth
                        ? isEn
                          ? 'Verifying...'
                          : 'در حال بررسی...'
                        : isEn
                        ? 'Verify & Decrypt'
                        : 'تأیید و رمزگشایی'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* =====================================================================
            FOOTER STATUS BAR
            ===================================================================== */}
        <div
          id="password-vault-footer"
          className={`px-5 py-2.5 border-t flex flex-wrap items-center justify-between gap-2 text-[11px] shrink-0 ${
            isLightMode ? 'bg-white border-slate-200 text-slate-500' : 'bg-slate-900/90 border-slate-800/80 text-slate-400'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            <span>
              {isEn
                ? 'AES-256-GCM Encrypted & Salted PBKDF2 Hashed Storage Active'
                : 'رمزنگاری AES-256-GCM و ذخیره‌سازی هش نمک‌دار PBKDF2 فعال است'}
            </span>
          </div>
          <div>
            <span>
              {isEn
                ? 'User Login Password verification enforced on reveal.'
                : 'مشاهده گذرواژه مستلزم ورود رمز عبور حساب کاربری است.'}
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
