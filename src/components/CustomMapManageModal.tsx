import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Plus,
  Edit2,
  Trash2,
  Check,
  Globe,
  Lock,
  Users,
  AlertTriangle,
  UserCheck,
  ShieldCheck,
  Search,
  FolderTree,
  Server,
  User,
} from 'lucide-react';
import { CustomTopologyMap, MapVisibility } from '../types';
import { useLanguage } from '../i18n';

export interface AuthorizedMapSubject {
  id: string;
  rawId: string;
  name: string;
  displayName: string;
  type: 'local_user' | 'ad_user' | 'ad_group' | 'local_group';
  role?: string;
  policyName?: string;
  policyId?: string;
  badge: string;
  badge_fa: string;
  secondaryText?: string;
  email?: string;
  department?: string;
  memberCount?: number;
}

interface CustomMapManageModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'create' | 'edit' | 'delete';
  currentMap?: CustomTopologyMap | null;
  onCreateMap: (
    name: string,
    description?: string,
    visibility?: MapVisibility,
    allowedUsers?: string[]
  ) => void;
  onUpdateMap: (
    id: string,
    name: string,
    description?: string,
    visibility?: MapVisibility,
    allowedUsers?: string[]
  ) => void;
  onDeleteMap: (id: string) => void;
  onMinimize?: () => void;
  isLightMode?: boolean;
}

export const CustomMapManageModal: React.FC<CustomMapManageModalProps> = ({
  isOpen,
  onClose,
  mode,
  currentMap,
  onCreateMap,
  onUpdateMap,
  onDeleteMap,
  onMinimize,
  isLightMode: propIsLightMode,
}) => {
  const { isEn, isRtl } = useLanguage();
  const [name, setName] = useState(currentMap?.name || '');
  const [description, setDescription] = useState(currentMap?.description || '');
  const [visibility, setVisibility] = useState<MapVisibility>(currentMap?.visibility || 'public');
  const [allowedUsers, setAllowedUsers] = useState<string[]>(currentMap?.allowedUsers || []);
  const [customUserCandidate, setCustomUserCandidate] = useState('');
  const [isMaximized, setIsMaximized] = useState(false);

  // Authorized Subjects loaded from backend database
  const [availableSubjects, setAvailableSubjects] = useState<AuthorizedMapSubject[]>([]);
  const [subjectCategories, setSubjectCategories] = useState<{
    localUsers: AuthorizedMapSubject[];
    adUsers: AuthorizedMapSubject[];
    adGroups: AuthorizedMapSubject[];
    localGroups: AuthorizedMapSubject[];
  }>({
    localUsers: [],
    adUsers: [],
    adGroups: [],
    localGroups: [],
  });
  const [activeCategoryTab, setActiveCategoryTab] = useState<
    'all' | 'local_user' | 'ad_user' | 'ad_group' | 'local_group'
  >('all');
  const [subjectSearchQuery, setSubjectSearchQuery] = useState('');
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(false);

  const isLightMode = propIsLightMode ?? (typeof document !== 'undefined' && (
    document.querySelector('.theme-light') !== null ||
    localStorage.getItem('panel_theme') === 'light' ||
    localStorage.getItem('theme_mode') === 'light'
  ));

  // Load policy-assigned subjects and local users from database
  useEffect(() => {
    let isMounted = true;
    setIsLoadingSubjects(true);
    fetch('/api/settings/authorized-map-subjects')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted) return;
        if (data?.success && Array.isArray(data?.subjects)) {
          setAvailableSubjects(data.subjects);
          if (data.categories) {
            setSubjectCategories(data.categories);
          }
        } else {
          // Fallback to /api/settings/users if needed
          fetch('/api/settings/users')
            .then((r) => (r.ok ? r.json() : null))
            .then((uData) => {
              if (isMounted && Array.isArray(uData?.users)) {
                const mapped: AuthorizedMapSubject[] = uData.users.map((u: any) => ({
                  id: (u.username || '').toLowerCase(),
                  rawId: u.id,
                  name: u.username,
                  displayName: u.fullName ? `${u.fullName} (${u.username})` : u.username,
                  type: 'local_user',
                  role: u.role || 'Operator',
                  badge: 'Local User',
                  badge_fa: 'کاربر محلی',
                  policyName: u.role || 'Local User',
                }));
                setAvailableSubjects(mapped);
                setSubjectCategories((prev) => ({ ...prev, localUsers: mapped }));
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsLoadingSubjects(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Sync state when currentMap changes
  useEffect(() => {
    if (currentMap) {
      setName(currentMap.name || '');
      setDescription(currentMap.description || '');
      setVisibility(currentMap.visibility || 'public');
      setAllowedUsers(currentMap.allowedUsers || []);
    } else {
      setName('');
      setDescription('');
      setVisibility('public');
      setAllowedUsers([]);
    }
  }, [currentMap, mode]);

  // Filter subjects based on category tab and search query
  const filteredSubjects = useMemo(() => {
    return availableSubjects.filter((s) => {
      if (activeCategoryTab !== 'all' && s.type !== activeCategoryTab) {
        return false;
      }
      if (subjectSearchQuery.trim()) {
        const q = subjectSearchQuery.toLowerCase().trim();
        const matchName = (s.name || '').toLowerCase().includes(q);
        const matchDisplay = (s.displayName || '').toLowerCase().includes(q);
        const matchPolicy = (s.policyName || '').toLowerCase().includes(q);
        const matchBadge = (isEn ? s.badge : s.badge_fa).toLowerCase().includes(q);
        const matchEmail = (s.email || '').toLowerCase().includes(q);
        if (!matchName && !matchDisplay && !matchPolicy && !matchBadge && !matchEmail) {
          return false;
        }
      }
      return true;
    });
  }, [availableSubjects, activeCategoryTab, subjectSearchQuery, isEn]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    if (mode === 'create') {
      onCreateMap(trimmed, description.trim() || undefined, visibility, allowedUsers);
    } else if (mode === 'edit' && currentMap) {
      onUpdateMap(currentMap.id, trimmed, description.trim() || undefined, visibility, allowedUsers);
    }
    onClose();
  };

  const handleDeleteConfirm = () => {
    if (currentMap) {
      onDeleteMap(currentMap.id);
      onClose();
    }
  };

  const handleToggleSubject = (subjectIdOrName: string) => {
    const clean = subjectIdOrName.trim().toLowerCase();
    if (!clean) return;
    setAllowedUsers((prev) => {
      const lower = prev.map((p) => p.toLowerCase());
      if (lower.includes(clean)) {
        return prev.filter((p) => p.toLowerCase() !== clean);
      }
      return [...prev, clean];
    });
  };

  const handleAddCandidateUser = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ('key' in e && e.key !== 'Enter') return;
    e.preventDefault();
    const clean = customUserCandidate.trim().toLowerCase();
    if (clean && !allowedUsers.map((u) => u.toLowerCase()).includes(clean)) {
      setAllowedUsers((prev) => [...prev, clean]);
      setCustomUserCandidate('');
    }
  };

  return (
    <div
      className="fixed top-0 left-0 right-0 bottom-8 z-[100000] flex items-center justify-center p-2 sm:p-4 modal-backdrop-blur"
      data-modal-backdrop="true"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div
        className={`w-full shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150 border transition-all ${
          isMaximized
            ? 'h-full max-w-none rounded-none'
            : 'max-w-2xl max-h-[90vh] rounded-2xl'
        } ${
          isLightMode
            ? 'bg-white border-slate-200 text-slate-800 shadow-slate-300/60'
            : 'bg-slate-900 border-slate-750 text-slate-100 shadow-slate-950/90'
        }`}
      >
        {/* Header */}
        <div
          className={`p-4 sm:px-6 border-b flex items-center justify-between shrink-0 ${
            isLightMode
              ? 'bg-slate-50 border-slate-200'
              : 'bg-slate-950/90 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl ${
                mode === 'delete'
                  ? isLightMode
                    ? 'bg-rose-50 border border-rose-200 text-rose-600'
                    : 'bg-rose-950/50 border border-rose-900 text-rose-400'
                  : isLightMode
                  ? 'bg-indigo-50 border border-indigo-200 text-indigo-600'
                  : 'bg-indigo-950/50 border border-indigo-800 text-indigo-400'
              }`}
            >
              {mode === 'delete' ? (
                <Trash2 className="w-5 h-5" />
              ) : mode === 'edit' ? (
                <Edit2 className="w-5 h-5" />
              ) : (
                <Plus className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className={`text-base font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                {mode === 'create'
                  ? (isEn ? 'Create New Topology Map' : 'ایجاد نقشه توپولوژی سفارشی جدید')
                  : mode === 'edit'
                  ? (isEn ? 'Edit Topology Map & Access Rules' : 'ویرایش مشخصات و سطح دسترسی نقشه')
                  : (isEn ? 'Delete Custom Topology Map' : 'حذف نقشه سفارشی توپولوژی')}
              </h3>
              <p className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {mode === 'delete'
                  ? (isEn ? 'This action cannot be undone.' : 'این عملیات غیرقابل بازگشت است.')
                  : (isEn ? 'Set title, description, and visibility permissions.' : 'نام، توضیحات و مجوزهای مشاهده نقشه را تعیین کنید.')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                isLightMode
                  ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-200/60'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title={isMaximized ? (isEn ? 'Restore' : 'اندازه عادی') : (isEn ? 'Maximize' : 'تمام‌صفحه')}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            {onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  isLightMode
                    ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-200/60'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title={isEn ? 'Minimize' : 'کوچک‌کردن'}
              >
                <Minus className="w-5 h-5" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                isLightMode
                  ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-200/60'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title={isEn ? 'Close' : 'بستن'}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        {mode === 'delete' ? (
          <div className={`p-6 space-y-4 text-xs ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
            <div
              className={`p-3.5 rounded-xl border flex items-start gap-2.5 ${
                isLightMode
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-rose-950/40 border-rose-900/60 text-rose-300'
              }`}
            >
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">
                  {isEn
                    ? `Are you sure you want to delete map "${currentMap?.name}"?`
                    : `آیا از حذف نقشه «${currentMap?.name}» اطمینان دارید؟`}
                </p>
                <p className="mt-1 text-[11px] opacity-80 leading-relaxed">
                  {isEn
                    ? 'All custom device arrangements, connections, and rack representations on this map will be removed.'
                    : 'تمامی چیدمان‌های سفارشی دیوایس‌ها، ارتباطات و رک‌های ذخیره‌شده در این نقشه حذف خواهند شد.'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className={`px-4 py-2 rounded-xl border font-medium transition cursor-pointer ${
                  isLightMode
                    ? 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                    : 'border-slate-750 bg-slate-800 text-slate-300 hover:bg-slate-750 hover:text-white'
                }`}
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition shadow-sm cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isEn ? 'Yes, Delete Map' : 'بله، نقشه حذف شود'}</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 flex-1 overflow-y-auto custom-scrollbar">
            {/* Map Title */}
            <div>
              <label className={`block text-xs font-bold mb-1.5 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                {isEn ? 'Map Title / Name:' : 'عنوان یا نام نقشه:'}
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isEn ? 'e.g. Data Center Core Network, Branch Office WAN' : 'مثال: شبکه دیتاسنتر اصلی، توپولوژی شعب بانکی'}
                className={`w-full px-3.5 py-2.5 rounded-xl border text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none font-medium transition ${
                  isLightMode
                    ? 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'
                    : 'border-slate-750 bg-slate-950 text-white placeholder:text-slate-500'
                }`}
              />
            </div>

            {/* Description */}
            <div>
              <label className={`block text-xs font-bold mb-1.5 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                {isEn ? 'Description (Optional):' : 'توضیحات نقشه (اختیاری):'}
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={isEn ? 'Optional details about VLAN trunking, redundant links...' : 'توضیحات اختیاری در مورد لینک‌ها، ترانک‌ها یا افزونگی...'}
                className={`w-full px-3.5 py-2.5 rounded-xl border text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none transition ${
                  isLightMode
                    ? 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'
                    : 'border-slate-750 bg-slate-950 text-white placeholder:text-slate-500'
                }`}
              />
            </div>

            {/* Map Visibility and Access Control */}
            <div className="pt-1">
              <label className={`block text-xs font-bold mb-2 flex items-center justify-between ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-indigo-500" />
                  {isEn ? 'Map Visibility & Permissions:' : 'مجوزهای مشاهده و دسترسی به نقشه:'}
                </span>
                {currentMap?.ownerName && (
                  <span className="text-[10px] font-normal px-2 py-0.5 rounded-md bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                    {isEn ? `Owner: ${currentMap.ownerName}` : `مالک: ${currentMap.ownerName}`}
                  </span>
                )}
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* 1. Public */}
                <button
                  type="button"
                  onClick={() => setVisibility('public')}
                  className={`p-3 rounded-xl border text-right transition cursor-pointer flex flex-col justify-between ${
                    visibility === 'public'
                      ? isLightMode
                        ? 'border-indigo-500 bg-indigo-50/60 text-indigo-900 shadow-sm ring-1 ring-indigo-400'
                        : 'border-indigo-500 bg-indigo-950/40 text-indigo-200 shadow-sm ring-1 ring-indigo-500'
                      : isLightMode
                      ? 'border-slate-250 bg-slate-50/70 text-slate-700 hover:border-slate-350 hover:bg-slate-100/60'
                      : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <Globe className={`w-4 h-4 ${visibility === 'public' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
                    {visibility === 'public' && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
                  </div>
                  <div>
                    <div className="text-xs font-bold">{isEn ? 'Public' : 'عمومی (پابلیک)'}</div>
                    <div className="text-[10px] opacity-75 mt-0.5 leading-tight">
                      {isEn ? 'Visible to all users' : 'قابل مشاهده برای تمام کاربران'}
                    </div>
                  </div>
                </button>

                {/* 2. Private */}
                <button
                  type="button"
                  onClick={() => setVisibility('private')}
                  className={`p-3 rounded-xl border text-right transition cursor-pointer flex flex-col justify-between ${
                    visibility === 'private'
                      ? isLightMode
                        ? 'border-amber-500 bg-amber-50/60 text-amber-900 shadow-sm ring-1 ring-amber-400'
                        : 'border-amber-500 bg-amber-950/40 text-amber-200 shadow-sm ring-1 ring-amber-500'
                      : isLightMode
                      ? 'border-slate-250 bg-slate-50/70 text-slate-700 hover:border-slate-350 hover:bg-slate-100/60'
                      : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <Lock className={`w-4 h-4 ${visibility === 'private' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`} />
                    {visibility === 'private' && <Check className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />}
                  </div>
                  <div>
                    <div className="text-xs font-bold">{isEn ? 'Private' : 'شخصی (فقط خود من)'}</div>
                    <div className="text-[10px] opacity-75 mt-0.5 leading-tight">
                      {isEn ? 'Visible only to creator' : 'تنها برای سازنده نقشه'}
                    </div>
                  </div>
                </button>

                {/* 3. Restricted / Specific Users */}
                <button
                  type="button"
                  onClick={() => setVisibility('restricted')}
                  className={`p-3 rounded-xl border text-right transition cursor-pointer flex flex-col justify-between ${
                    visibility === 'restricted'
                      ? isLightMode
                        ? 'border-cyan-500 bg-cyan-50/60 text-cyan-900 shadow-sm ring-1 ring-cyan-400'
                        : 'border-cyan-500 bg-cyan-950/40 text-cyan-200 shadow-sm ring-1 ring-cyan-500'
                      : isLightMode
                      ? 'border-slate-250 bg-slate-50/70 text-slate-700 hover:border-slate-350 hover:bg-slate-100/60'
                      : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <Users className={`w-4 h-4 ${visibility === 'restricted' ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-400'}`} />
                    {visibility === 'restricted' && <Check className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />}
                  </div>
                  <div>
                    <div className="text-xs font-bold">{isEn ? 'Specific Users' : 'کاربران منتخب'}</div>
                    <div className="text-[10px] opacity-75 mt-0.5 leading-tight">
                      {isEn ? 'Share with chosen users' : 'اشتراک با کاربران مجاز'}
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Restricted User & Domain Group Selection Panel */}
            {visibility === 'restricted' && (
              <div
                className={`p-4 rounded-xl border space-y-3.5 animate-in fade-in slide-in-from-top-2 duration-150 ${
                  isLightMode
                    ? 'bg-slate-50/90 border-slate-200'
                    : 'bg-slate-950/70 border-slate-800'
                }`}
              >
                {/* Header row with count & clear */}
                <div className="flex items-center justify-between gap-2">
                  <label className={`text-xs font-bold flex items-center gap-1.5 ${isLightMode ? 'text-slate-800' : 'text-slate-200'}`}>
                    <UserCheck className="w-4 h-4 text-cyan-500" />
                    <span>{isEn ? 'Authorized Users & Domain Groups:' : 'لیست کاربران و گروه‌های مجاز دارای پالیسی:'}</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                      {allowedUsers.length} {isEn ? 'authorized' : 'سوژه مجاز'}
                    </span>
                    {allowedUsers.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setAllowedUsers([])}
                        className="text-[10px] text-rose-400 hover:text-rose-300 transition cursor-pointer"
                      >
                        {isEn ? 'Clear all' : 'پاک‌سازی همه'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Info Note */}
                <p className={`text-[11px] leading-relaxed ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                  {isEn
                    ? 'Only local users and Active Directory users/groups with an assigned RBAC policy in the database are listed.'
                    : 'صرفاً کاربران محلی و کاربران یا گروه‌هایی از اکتیو دایرکتوری که دارای پالیسی معتبر در دیتابیس هستند نمایش داده می‌شوند.'}
                </p>

                {/* Category Filter Tabs */}
                <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-900/60 dark:bg-slate-950/80 rounded-xl border border-white/10 text-xs">
                  <button
                    type="button"
                    onClick={() => setActiveCategoryTab('all')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1.5 ${
                      activeCategoryTab === 'all'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : isLightMode ? 'text-slate-700 hover:bg-slate-200/60' : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span>{isEn ? 'All' : 'همه'}</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 font-mono">
                      {availableSubjects.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveCategoryTab('local_user')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1.5 ${
                      activeCategoryTab === 'local_user'
                        ? 'bg-cyan-600 text-white shadow-sm'
                        : isLightMode ? 'text-slate-700 hover:bg-slate-200/60' : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <User className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{isEn ? 'Local Users' : 'کاربران محلی'}</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 font-mono">
                      {subjectCategories.localUsers.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveCategoryTab('ad_user')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1.5 ${
                      activeCategoryTab === 'ad_user'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : isLightMode ? 'text-slate-700 hover:bg-slate-200/60' : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Server className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{isEn ? 'AD Users (Policy)' : 'کاربران دامین (پالیسی)'}</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 font-mono">
                      {subjectCategories.adUsers.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveCategoryTab('ad_group')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1.5 ${
                      activeCategoryTab === 'ad_group'
                        ? 'bg-purple-600 text-white shadow-sm'
                        : isLightMode ? 'text-slate-700 hover:bg-slate-200/60' : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <FolderTree className="w-3.5 h-3.5 text-purple-400" />
                    <span>{isEn ? 'AD Groups (Policy)' : 'گروه‌های دامین (پالیسی)'}</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 font-mono">
                      {subjectCategories.adGroups.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveCategoryTab('local_group')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1.5 ${
                      activeCategoryTab === 'local_group'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : isLightMode ? 'text-slate-700 hover:bg-slate-200/60' : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 text-amber-400" />
                    <span>{isEn ? 'Local Groups' : 'گروه‌های محلی'}</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 font-mono">
                      {subjectCategories.localGroups.length}
                    </span>
                  </button>
                </div>

                {/* Quick Search Input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute top-2.5 left-3 text-slate-400 rtl:right-3 rtl:left-auto" />
                  <input
                    type="text"
                    value={subjectSearchQuery}
                    onChange={(e) => setSubjectSearchQuery(e.target.value)}
                    placeholder={isEn ? 'Filter by name, display name or assigned policy...' : 'فیلتر بر اساس نام، نام نمایشی یا پالیسی متصل...'}
                    className={`w-full pl-8 pr-3 py-1.5 rtl:pr-8 rtl:pl-3 rounded-xl border text-xs focus:ring-2 focus:ring-cyan-500 focus:outline-none transition ${
                      isLightMode
                        ? 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'
                        : 'border-slate-750 bg-slate-900 text-white placeholder:text-slate-500'
                    }`}
                  />
                  {subjectSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setSubjectSearchQuery('')}
                      className="absolute top-2 right-2.5 rtl:left-2.5 rtl:right-auto text-slate-400 hover:text-white text-xs"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Subjects Selection Grid */}
                <div className="max-h-56 overflow-y-auto custom-scrollbar p-1 space-y-1.5 border rounded-xl border-white/5 bg-slate-900/30">
                  {isLoadingSubjects ? (
                    <div className="py-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                      <span>{isEn ? 'Loading authorized subjects from database...' : 'در حال بارگذاری سوژه‌های دارای پالیسی از دیتابیس...'}</span>
                    </div>
                  ) : filteredSubjects.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400">
                      {subjectSearchQuery
                        ? (isEn ? 'No authorized subjects match your search.' : 'هیچ کاربری یا گروهی مطابق با جستجوی شما یافت نشد.')
                        : activeCategoryTab === 'ad_user'
                        ? (isEn ? 'No Active Directory users have been assigned a policy yet.' : 'هنوز پالیسی‌ای به کاربران اکتیو دایرکتوری در تب AD تخصیص داده نشده است.')
                        : activeCategoryTab === 'ad_group'
                        ? (isEn ? 'No Active Directory groups have been assigned a policy yet.' : 'هنوز پالیسی‌ای به گروه‌های اکتیو دایرکتوری در تب AD تخصیص داده نشده است.')
                        : (isEn ? 'No authorized subjects found in this category.' : 'موردی در این دسته‌بندی یافت نشد.')}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {filteredSubjects.map((s) => {
                        const isSelected = allowedUsers.some(
                          (u) => u.toLowerCase() === s.id.toLowerCase() || u.toLowerCase() === s.name.toLowerCase()
                        );
                        return (
                          <div
                            key={`${s.type}-${s.id}`}
                            onClick={() => handleToggleSubject(s.name || s.id)}
                            className={`p-2 rounded-xl border transition cursor-pointer flex items-center justify-between gap-2 ${
                              isSelected
                                ? isLightMode
                                  ? 'bg-cyan-50/80 border-cyan-500 text-cyan-950 shadow-sm ring-1 ring-cyan-400'
                                  : 'bg-cyan-950/40 border-cyan-500 text-cyan-200 shadow-sm ring-1 ring-cyan-500'
                                : isLightMode
                                ? 'bg-white border-slate-250 text-slate-700 hover:border-slate-350 hover:bg-slate-50'
                                : 'bg-slate-900 border-slate-750 text-slate-300 hover:border-slate-650 hover:bg-slate-850'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className={`p-1.5 rounded-lg shrink-0 ${
                                  s.type === 'ad_user'
                                    ? 'bg-emerald-500/15 text-emerald-400'
                                    : s.type === 'ad_group'
                                    ? 'bg-purple-500/15 text-purple-400'
                                    : s.type === 'local_group'
                                    ? 'bg-amber-500/15 text-amber-400'
                                    : 'bg-cyan-500/15 text-cyan-400'
                                }`}
                              >
                                {s.type === 'ad_user' ? (
                                  <Server className="w-3.5 h-3.5" />
                                ) : s.type === 'ad_group' ? (
                                  <FolderTree className="w-3.5 h-3.5" />
                                ) : s.type === 'local_group' ? (
                                  <Users className="w-3.5 h-3.5" />
                                ) : (
                                  <User className="w-3.5 h-3.5" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-bold truncate">
                                  {s.displayName || s.name}
                                </div>
                                <div className="text-[10px] opacity-75 truncate flex items-center gap-1.5 mt-0.5">
                                  {s.policyName && (
                                    <span className="font-semibold text-cyan-400 truncate">
                                      {isEn ? `Role: ${s.policyName}` : `نقش: ${s.policyName}`}
                                    </span>
                                  )}
                                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-black/25 shrink-0">
                                    {isEn ? s.badge : s.badge_fa}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div
                              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                isSelected
                                  ? 'bg-cyan-500 border-cyan-500 text-slate-950 font-bold'
                                  : isLightMode
                                  ? 'border-slate-300 bg-white'
                                  : 'border-slate-700 bg-slate-950'
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Custom Candidate Input for manual write-ins */}
                <div className="pt-1">
                  <div className="text-[10px] text-slate-400 mb-1">
                    {isEn ? 'Or manually add custom username or group:' : 'یا نام کاربری یا گروه خاص دیگری را به صورت دستی اضافه کنید:'}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={customUserCandidate}
                      onChange={(e) => setCustomUserCandidate(e.target.value)}
                      onKeyDown={handleAddCandidateUser}
                      placeholder={isEn ? 'e.g. j.smith, Domain Admins...' : 'مثال: j.smith یا Domain Admins...'}
                      className={`flex-1 px-3 py-1.5 rounded-lg border text-xs focus:ring-2 focus:ring-cyan-500 focus:outline-none ${
                        isLightMode
                          ? 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'
                          : 'border-slate-750 bg-slate-900 text-white placeholder:text-slate-500'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={handleAddCandidateUser}
                      disabled={!customUserCandidate.trim()}
                      className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-bold transition cursor-pointer"
                    >
                      {isEn ? 'Add' : 'افزودن'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className={`px-4 py-2 rounded-xl border text-xs font-medium transition cursor-pointer ${
                  isLightMode
                    ? 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                    : 'border-slate-750 bg-slate-800 text-slate-300 hover:bg-slate-750 hover:text-white'
                }`}
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white text-xs font-bold shadow-sm transition cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{mode === 'create' ? (isEn ? 'Create Map' : 'ایجاد نقشه') : (isEn ? 'Save Changes' : 'ذخیره تغییرات')}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
