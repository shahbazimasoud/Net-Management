import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  KeyRound,
  Search,
  Check,
  Shield,
  ShieldCheck,
  Server,
  Lock,
  Loader2,
  X,
  Minus,
  Maximize2,
  Minimize2,
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface VaultItemSummary {
  id: string;
  name: string;
  username?: string;
  category?: string;
  target_host?: string;
  targetHost?: string;
  notes?: string;
  strength?: string;
  updated_at?: string;
  updatedAt?: string;
}

export interface VaultPasswordPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  onSelectPassword: (password: string, username?: string) => void;
  targetHost?: string;
  isLightMode?: boolean;
  isEn?: boolean;
  zIndex?: number;
}

export const VaultPasswordPickerModal: React.FC<VaultPasswordPickerModalProps> = ({
  isOpen,
  onClose,
  onMinimize,
  onSelectPassword,
  targetHost = '',
  isLightMode = false,
  isEn = false,
  zIndex = 10005,
}) => {
  const { user, token } = useAuth();
  const [items, setItems] = useState<VaultItemSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isMaximized, setIsMaximized] = useState<boolean>(false);

  // Re-authentication state for revealing & picking password
  const [selectedItemForAuth, setSelectedItemForAuth] = useState<VaultItemSummary | null>(null);
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSelectedItemForAuth(null);
      setLoginPassword('');
      setAuthError(null);
      return;
    }

    const fetchItems = async () => {
      setLoading(true);
      setError(null);
      try {
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

        const res = await fetch('/api/vault', { headers });
        if (!res.ok) {
          if (res.status === 401) {
            throw new Error(
              isEn
                ? 'Authentication required to access your personal vault'
                : 'جهت دسترسی به والت کلمات عبور شخصی، احراز هویت کاربری الزامی است'
            );
          }
          throw new Error(isEn ? 'Failed to fetch vault items' : 'خطا در دریافت اقلام ولت گذرواژه');
        }
        const data = await res.json();
        if (data && Array.isArray(data.items)) {
          setItems(data.items);
        } else {
          setItems([]);
        }
      } catch (err: any) {
        setError(err.message || (isEn ? 'Error connecting to vault API' : 'خطا در ارتباط با سرویس ولت'));
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, [isOpen, isEn, token, user?.id, user?.username]);

  if (!isOpen) return null;

  // Filter items based on search and category
  const filteredItems = items.filter((item) => {
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    const q = searchQuery.toLowerCase().trim();
    if (!q) return matchesCategory;

    const itemHost = (item.targetHost || item.target_host || '').toLowerCase();
    const matchesSearch =
      (item.name && item.name.toLowerCase().includes(q)) ||
      (item.username && item.username.toLowerCase().includes(q)) ||
      itemHost.includes(q) ||
      (item.notes && item.notes.toLowerCase().includes(q));

    return matchesCategory && matchesSearch;
  });

  // Handle clicking on an item to initiate password selection
  const handleItemClick = (item: VaultItemSummary) => {
    setSelectedItemForAuth(item);
    setLoginPassword('');
    setAuthError(null);
  };

  // Submit re-auth to decrypt and pick password
  const handleConfirmAuth = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedItemForAuth) return;

    if (!loginPassword.trim()) {
      setAuthError(isEn ? 'Please enter your login password' : 'لطفاً رمز عبور ورود خود را وارد نمایید');
      return;
    }

    setAuthLoading(true);
    setAuthError(null);

    try {
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

      const res = await fetch(`/api/vault/${selectedItemForAuth.id}/reveal`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          loginPassword: loginPassword.trim(),
          password: loginPassword.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const errorMsg = isEn
          ? (data.error || 'Authentication failed. Please verify your login password.')
          : (data.message || data.error || 'احراز هویت ناموفق بود. لطفاً رمز عبور ورود را بررسی نمایید.');
        throw new Error(errorMsg);
      }

      if (data && typeof data.password === 'string') {
        onSelectPassword(data.password, selectedItemForAuth.username);
        setSelectedItemForAuth(null);
        onClose();
      } else {
        throw new Error(isEn ? 'Invalid password payload received' : 'پاسخ رمز عبور نامعتبر است');
      }
    } catch (err: any) {
      setAuthError(err.message || (isEn ? 'Failed to verify password' : 'خطا در اعتبارسنجی رمز'));
    } finally {
      setAuthLoading(false);
    }
  };

  const subModalZIndex = (zIndex || 999995) + 5;

  const modalContent = (
    <div
      id="vault-password-picker-modal-root"
      style={{ zIndex: zIndex || 999995 }}
      className={`fixed top-0 left-0 right-0 bottom-8 transition-all duration-200 ${
        isMaximized
          ? 'p-0 flex flex-col bg-black/80 backdrop-blur-md'
          : 'flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm'
      }`}
    >
      <div
        className={`flex flex-col shadow-2xl transition-all duration-200 overflow-hidden ${
          isMaximized
            ? 'w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-2xl max-h-[85vh] rounded-2xl border'
        } ${
          isLightMode
            ? 'bg-white border-slate-200 text-slate-900'
            : 'bg-slate-950 border-slate-800 text-slate-100'
        }`}
      >
        {/* Header */}
        <div
          className={`px-5 py-3.5 border-b flex items-center justify-between shrink-0 ${
            isLightMode ? 'bg-slate-50/80 border-slate-200' : 'bg-slate-900/50 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm">
                  {isEn ? 'Select Password from Personal Vault' : 'انتخاب گذرواژه از ولت شخصی'}
                </h3>
                <div
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                    isLightMode
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-emerald-950/50 text-emerald-400 border-emerald-700/50'
                  }`}
                  title={isEn ? 'User-scoped private vault' : 'ولت اختصاصی با تفکیک کاربر'}
                >
                  <ShieldCheck className="w-3 h-3" />
                  <span>
                    {isEn ? `Owner: ${user?.username || 'You'}` : `مالک: ${user?.username || 'شما'}`}
                  </span>
                </div>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  whatIsIt={
                    isEn
                      ? 'Secure access to your personal encrypted credentials stored in your private vault.'
                      : 'دسترسی امن به اطلاعات احراز هویت رمزنگاری‌شده شخصی شما در ولت اختصاصی خودتان.'
                  }
                  whyNeeded={
                    isEn
                      ? 'Ensures strict per-user vault isolation so only credentials owned by the logged-in user can be auto-filled, preventing credential sharing and security leaks.'
                      : 'تضمین ایزولاسیون کامل و صددرصدی ولت‌ها؛ به گونه‌ای که هر کاربر فقط به گذرواژه‌های ولت شخصی خود دسترسی داشته و از نشت امنیتی یا استفاده سایر کاربران جلوگیری می‌شود.'
                  }
                  example={
                    isEn
                      ? 'Select an existing Linux SSH, network switch or Windows secret without re-typing or exposing plaintext.'
                      : 'انتخاب سریع رمز عبور تجهیز شبکه، سرور لینوکس یا ویندوز بدون نیاز به تایپ دستی یا نمایش علنی رمز عبور.'
                  }
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isEn
                  ? 'Only passwords saved in your private vault are listed.'
                  : 'تنها گذرواژه‌های ذخیره‌شده در ولت اختصاصی حساب شما نمایش داده می‌شوند.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onMinimize || onClose}
              title={isEn ? 'Minimize' : 'کوچک‌سازی'}
              className={`p-1.5 rounded-lg transition ${
                isLightMode ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-slate-800 text-slate-400'
              }`}
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isMaximized ? (isEn ? 'Exit Fullscreen' : 'خروج از تمام‌صفحه') : (isEn ? 'Fullscreen' : 'تمام‌صفحه')}
              className={`p-1.5 rounded-lg transition ${
                isLightMode ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-slate-800 text-slate-400'
              }`}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Close' : 'بستن'}
              className={`p-1.5 rounded-lg transition ${
                isLightMode ? 'hover:bg-red-50 text-slate-600 hover:text-red-600' : 'hover:bg-red-500/10 text-slate-400 hover:text-red-400'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Search & Filter Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isEn ? 'Search title, username, host...' : 'جستجو در عنوان، نام کاربری، هاست...'}
                className={`w-full pl-8 pr-3 py-1.5 rounded-lg text-xs border outline-none ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-cyan-500'
                    : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-cyan-500'
                }`}
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className={`px-2.5 py-1.5 rounded-lg text-xs border outline-none ${
                isLightMode
                  ? 'bg-slate-50 border-slate-200 text-slate-900'
                  : 'bg-slate-900 border-slate-800 text-slate-100'
              }`}
            >
              <option value="all">{isEn ? 'All Categories' : 'همه دسته‌ها'}</option>
              <option value="network">{isEn ? 'Network Devices' : 'تجهیزات شبکه'}</option>
              <option value="servers">{isEn ? 'Servers' : 'سرورها'}</option>
              <option value="firewall">{isEn ? 'Firewalls' : 'فایروال‌ها'}</option>
              <option value="cloud">{isEn ? 'Cloud / VPS' : 'سرویس‌های ابری'}</option>
              <option value="database">{isEn ? 'Databases' : 'پایگاه‌های داده'}</option>
              <option value="general">{isEn ? 'General' : 'عمومی'}</option>
            </select>
          </div>

          {/* Items Listing */}
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
              <span className="text-xs">{isEn ? 'Loading your vault items...' : 'در حال بارگذاری اقلام ولت شما...'}</span>
            </div>
          ) : error ? (
            <div className={`p-4 rounded-xl border text-xs flex items-center gap-3 ${
              isLightMode ? 'bg-red-50 border-red-200 text-red-700' : 'bg-red-500/10 border-red-500/20 text-red-400'
            }`}>
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
              <KeyRound className="w-8 h-8 opacity-30" />
              <p className="text-xs font-medium">
                {searchQuery || selectedCategory !== 'all'
                  ? isEn
                    ? 'No matching passwords found in your vault.'
                    : 'هیچ گذرواژه‌ای با مشخصات جستجو شده یافت نشد.'
                  : isEn
                  ? 'Your personal password vault is empty.'
                  : 'ولت گذرواژه شخصی شما در حال حاضر خالی است.'}
              </p>
              <p className="text-[11px] text-slate-500 text-center max-w-sm">
                {isEn
                  ? 'You can add credentials via the Password Vault modal in the top bar or profile menu.'
                  : 'می‌توانید کلمات عبور خود را از طریق دکمه «ولت گذرواژه‌ها» در نوار بالا یا منوی پروفایل ثبت نمایید.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredItems.map((item) => {
                const itemHost = item.targetHost || item.target_host || '';
                const isTargetMatch = Boolean(
                  targetHost && itemHost && (
                    itemHost.toLowerCase().includes(targetHost.toLowerCase()) ||
                    targetHost.toLowerCase().includes(itemHost.toLowerCase())
                  )
                );
                return (
                  <div
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between group ${
                      isLightMode
                        ? 'bg-white hover:bg-cyan-50/50 border-slate-200 hover:border-cyan-400'
                        : 'bg-slate-900/60 hover:bg-cyan-950/20 border-slate-800 hover:border-cyan-500/40'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isLightMode ? 'bg-slate-100 text-slate-600' : 'bg-slate-800 text-slate-300'
                      }`}>
                        <Lock className="w-4 h-4 group-hover:text-cyan-400 transition" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-xs truncate">{item.name}</h4>
                          {isTargetMatch && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                              {isEn ? 'Host Match' : 'تطابق هاست'}
                            </span>
                          )}
                          {item.category && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-400 border border-slate-500/20">
                              {item.category}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-0.5">
                          {item.username && (
                            <span className="font-mono truncate">
                              {isEn ? 'User: ' : 'کاربر: '}
                              <strong className="font-semibold text-slate-300">{item.username}</strong>
                            </span>
                          )}
                          {itemHost && (
                            <span className="font-mono text-slate-500 truncate">
                              @{itemHost}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="px-2.5 py-1 rounded-lg text-xs font-medium bg-cyan-500/10 hover:bg-cyan-500 text-cyan-400 hover:text-white border border-cyan-500/30 transition shrink-0"
                    >
                      {isEn ? 'Use Password' : 'انتخاب رمز'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`px-5 py-3 border-t flex items-center justify-between shrink-0 text-xs text-slate-400 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/40 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-cyan-500" />
            <span>
              {isEn
                ? 'Secured with AES-256-GCM and per-user vault isolation'
                : 'محافظت‌شده با رمزنگاری AES-256-GCM و تفکیک قطعی ولت هر کاربر'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`px-3 py-1.5 rounded-lg border text-xs transition ${
              isLightMode
                ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            {isEn ? 'Cancel' : 'انصراف'}
          </button>
        </div>
      </div>

      {/* Re-Authentication Sub-Modal */}
      {selectedItemForAuth && (
        <div
          id="vault-reauth-submodal-root"
          style={{ zIndex: subModalZIndex }}
          className="fixed inset-0 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        >
          <div
            className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 ${
              isLightMode
                ? 'bg-white border-slate-200 text-slate-900'
                : 'bg-slate-950 border-slate-800 text-slate-100'
            }`}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/40">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm">
                    {isEn ? 'Confirm Identity to Unlock Password' : 'احراز هویت جهت بازگشایی گذرواژه'}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    {isEn ? 'Security policy requires your account password.' : 'سیاست امنیتی ولت نیازمند تأیید رمز عبور کاربری شماست.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedItemForAuth(null);
                  setLoginPassword('');
                  setAuthError(null);
                }}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmAuth} className="space-y-3">
              <div className="p-2.5 rounded-lg border text-xs space-y-1 bg-cyan-500/5 border-cyan-500/20 text-cyan-400">
                <div className="flex justify-between">
                  <span className="text-slate-400">{isEn ? 'Target Secret:' : 'رمز عبور انتخابی:'}</span>
                  <span className="font-semibold">{selectedItemForAuth.name}</span>
                </div>
                {selectedItemForAuth.username && (
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-400">{isEn ? 'Username:' : 'نام کاربری:'}</span>
                    <span>{selectedItemForAuth.username}</span>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">
                  {isEn ? 'Your Account Login Password' : 'رمز عبور ورود به سامانه شما'}
                </label>
                <input
                  type="password"
                  autoFocus
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  className={`w-full px-3 py-2 rounded-lg text-xs font-mono border outline-none ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-cyan-500'
                      : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-cyan-500'
                  }`}
                />
              </div>

              {authError && (
                <div className={`p-2.5 rounded-lg border text-xs flex items-center gap-2 ${
                  isLightMode ? 'bg-red-50 border-red-200 text-red-600' : 'bg-red-500/10 border-red-500/20 text-red-400'
                }`}>
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedItemForAuth(null);
                    setLoginPassword('');
                    setAuthError(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg border text-xs transition ${
                    isLightMode
                      ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                      : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
                  }`}
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="submit"
                  disabled={authLoading}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {authLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isEn ? 'Verify & Use' : 'تأیید و اعمال رمز'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
