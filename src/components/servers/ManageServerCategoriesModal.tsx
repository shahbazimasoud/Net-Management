import React, { useState, useEffect, useMemo } from 'react';
import {
  FolderTree,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  Minus,
  Maximize2,
  Minimize2,
  Server,
  AlertTriangle,
  Search,
  Palette,
  Shield,
  ArrowRight,
  Layers,
  RefreshCw,
} from 'lucide-react';
import { ServerCategory } from '../../types';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface ManageServerCategoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onCategoriesChanged?: () => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

const PRESET_COLORS: { key: string; label: string; bg: string; text: string; border: string; ring: string }[] = [
  { key: 'blue', label: 'Blue', bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/40', ring: 'ring-blue-500' },
  { key: 'emerald', label: 'Emerald', bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/40', ring: 'ring-emerald-500' },
  { key: 'cyan', label: 'Cyan', bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/40', ring: 'ring-cyan-500' },
  { key: 'purple', label: 'Purple', bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/40', ring: 'ring-purple-500' },
  { key: 'amber', label: 'Amber', bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/40', ring: 'ring-amber-500' },
  { key: 'rose', label: 'Rose', bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/40', ring: 'ring-rose-500' },
  { key: 'indigo', label: 'Indigo', bg: 'bg-indigo-500/15', text: 'text-indigo-400', border: 'border-indigo-500/40', ring: 'ring-indigo-500' },
  { key: 'teal', label: 'Teal', bg: 'bg-teal-500/15', text: 'text-teal-400', border: 'border-teal-500/40', ring: 'ring-teal-500' },
  { key: 'orange', label: 'Orange', bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/40', ring: 'ring-orange-500' },
  { key: 'slate', label: 'Slate', bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-slate-500/40', ring: 'ring-slate-500' },
];

export const getColorStyles = (colorKey?: string) => {
  const matched = PRESET_COLORS.find((c) => c.key === colorKey?.toLowerCase());
  if (matched) return matched;
  return {
    key: 'indigo',
    label: 'Indigo',
    bg: 'bg-indigo-500/15',
    text: 'text-indigo-400',
    border: 'border-indigo-500/40',
    ring: 'ring-indigo-500',
  };
};

export const ManageServerCategoriesModal: React.FC<ManageServerCategoriesModalProps> = ({
  isOpen,
  onClose,
  onMinimize,
  onCategoriesChanged,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [categories, setCategories] = useState<ServerCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Mode: 'list' | 'add' | 'edit'
  const [activeFormMode, setActiveFormMode] = useState<'idle' | 'add' | 'edit'>('idle');
  const [editingCategory, setEditingCategory] = useState<ServerCategory | null>(null);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formNameFa, setFormNameFa] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formColor, setFormColor] = useState('indigo');
  const [isSaving, setIsSaving] = useState(false);

  // Delete & Reassign State
  const [categoryToDelete, setCategoryToDelete] = useState<ServerCategory | null>(null);
  const [reassignTarget, setReassignTarget] = useState<string>('Uncategorized');
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchCategories = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/server-categories');
      const data = await res.json();
      if (data.success && Array.isArray(data.categories)) {
        setCategories(data.categories);
      } else {
        setError(data.error || (isEn ? 'Failed to fetch categories' : 'خطا در دریافت لیست دسته‌بندی‌ها'));
      }
    } catch (err: any) {
      setError(err.message || (isEn ? 'Network error' : 'خطای ارتباط با سرور'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCategories();
      setActiveFormMode('idle');
      setEditingCategory(null);
      setCategoryToDelete(null);
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen]);

  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.name_fa && c.name_fa.toLowerCase().includes(q)) ||
        (c.description && c.description.toLowerCase().includes(q))
    );
  }, [categories, searchQuery]);

  const handleOpenAdd = () => {
    setActiveFormMode('add');
    setEditingCategory(null);
    setFormName('');
    setFormNameFa('');
    setFormDescription('');
    setFormColor('indigo');
    setError(null);
    setSuccessMsg(null);
  };

  const handleOpenEdit = (cat: ServerCategory) => {
    setActiveFormMode('edit');
    setEditingCategory(cat);
    setFormName(cat.name);
    setFormNameFa(cat.name_fa || '');
    setFormDescription(cat.description || '');
    setFormColor(cat.color || 'indigo');
    setError(null);
    setSuccessMsg(null);
  };

  const handleCancelForm = () => {
    setActiveFormMode('idle');
    setEditingCategory(null);
    setError(null);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setError(isEn ? 'Category name is required' : 'نام دسته‌بندی الزامی است');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      if (activeFormMode === 'add') {
        const res = await fetch('/api/server-categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName.trim(),
            name_fa: formNameFa.trim() || undefined,
            description: formDescription.trim() || undefined,
            color: formColor,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || (isEn ? 'Failed to create category' : 'خطا در ثبت دسته‌بندی'));
        }
        setSuccessMsg(isEn ? `Category "${formName.trim()}" created successfully` : `دسته‌بندی "${formName.trim()}" با موفقیت ایجاد شد`);
      } else if (activeFormMode === 'edit' && editingCategory) {
        const res = await fetch(`/api/server-categories/${editingCategory.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName.trim(),
            name_fa: formNameFa.trim() || undefined,
            description: formDescription.trim() || undefined,
            color: formColor,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || (isEn ? 'Failed to update category' : 'خطا در ویرایش دسته‌بندی'));
        }
        setSuccessMsg(
          isEn
            ? `Category "${formName.trim()}" updated successfully (servers synchronized)`
            : `دسته‌بندی "${formName.trim()}" با موفقیت به‌روزرسانی و سرورها همگام شدند`
        );
      }

      await fetchCategories();
      onCategoriesChanged?.();
      setActiveFormMode('idle');
      setEditingCategory(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenDelete = (cat: ServerCategory) => {
    if (cat.name.toLowerCase() === 'uncategorized') {
      setError(
        isEn
          ? 'The "Uncategorized" category is the system fallback and cannot be deleted.'
          : 'دسته‌بندی پیش‌فرض "دسته‌بندی‌نشده" جهت حفظ انسجام سیستم قابل حذف نیست.'
      );
      return;
    }
    setCategoryToDelete(cat);
    // Pick first other category as default target, prefer Uncategorized
    const uncategorized = categories.find((c) => c.name.toLowerCase() === 'uncategorized');
    const fallback = categories.find((c) => c.id !== cat.id);
    setReassignTarget(uncategorized?.name || fallback?.name || 'Uncategorized');
    setError(null);
    setSuccessMsg(null);
  };

  const handleConfirmDelete = async () => {
    if (!categoryToDelete) return;
    setIsDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/server-categories/${categoryToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reassignTo: reassignTarget }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || (isEn ? 'Failed to delete category' : 'خطا در حذف دسته‌بندی'));
      }
      setSuccessMsg(
        isEn
          ? `Deleted "${categoryToDelete.name}". Reassigned ${data.reassignedCount} server(s) to "${data.targetCategory}".`
          : `دسته‌بندی "${categoryToDelete.name}" حذف شد. تعداد ${data.reassignedCount} سرور به دسته "${data.targetCategory}" منتقل شدند.`
      );
      setCategoryToDelete(null);
      await fetchCategories();
      onCategoriesChanged?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="manage-server-categories-modal"
      className={
        isMaximized
          ? 'fixed top-0 left-0 right-0 bottom-8 z-50 p-0 flex flex-col bg-black/80 backdrop-blur-md'
          : 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm'
      }
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`flex flex-col overflow-hidden transition-all duration-200 ${
          isMaximized
            ? 'w-full h-full rounded-none border-none'
            : 'w-full max-w-4xl max-h-[92vh] rounded-2xl border shadow-2xl'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-200 text-slate-900'
            : 'bg-slate-950 border-slate-800 text-slate-100 shadow-indigo-950/40'
        }`}
      >
        {/* ================= HEADER (TRI-CONTROL BUTTONS) ================= */}
        <div
          className={`flex items-center justify-between px-5 py-4 border-b shrink-0 select-none ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl ${
                isLightMode ? 'bg-indigo-50 text-indigo-600' : 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
              }`}
            >
              <FolderTree className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-bold tracking-tight">
                  {isEn ? 'Server Categories Management' : 'مدیریت دسته‌بندی‌های سرور'}
                </h2>
                <span
                  className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                    isLightMode
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-indigo-950/60 text-indigo-300 border-indigo-700/50'
                  }`}
                >
                  {categories.length} {isEn ? 'Categories' : 'دسته'}
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'Organize, customize, and color-code server fleet categories with automatic fleet re-routing'
                  : 'سازمان‌دهی، ایجاد و ویرایش دسته‌بندی‌های اختصاصی سرورها با همگام‌سازی خودکار ناوگان'}
              </p>
            </div>
          </div>

          {/* Tri-Control Buttons */}
          <div className="flex items-center gap-1">
            {/* Minimize */}
            <button
              id="manage-categories-minimize-btn"
              onClick={onMinimize}
              title={isEn ? 'Minimize to Tools Dock' : 'کوچک‌نمایی به نوار ابزار پایین'}
              className={`p-2 rounded-lg transition-colors ${
                isLightMode ? 'text-slate-500 hover:bg-slate-100' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Minus className="w-4 h-4" />
            </button>

            {/* Maximize / Restore */}
            <button
              id="manage-categories-maximize-btn"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isMaximized ? (isEn ? 'Exit Fullscreen' : 'خروج از تمام‌صفحه') : (isEn ? 'Fullscreen' : 'تمام‌صفحه')}
              className={`p-2 rounded-lg transition-colors ${
                isLightMode ? 'text-slate-500 hover:bg-slate-100' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close */}
            <button
              id="manage-categories-close-btn"
              onClick={onClose}
              title={isEn ? 'Close' : 'بستن'}
              className={`p-2 rounded-lg transition-colors ${
                isLightMode
                  ? 'text-slate-500 hover:bg-rose-50 hover:text-rose-600'
                  : 'text-slate-400 hover:bg-rose-950/50 hover:text-rose-400'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ================= ALERTS / NOTICES ================= */}
        {error && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="hover:text-rose-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {successMsg && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="hover:text-emerald-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ================= MAIN CONTENT ================= */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* TOP TOOLBAR: Search + Add Button */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search
                className={`absolute ${
                  isEn ? 'left-3' : 'right-3'
                } top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${
                  isLightMode ? 'text-slate-400' : 'text-slate-500'
                }`}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isEn ? 'Filter categories by name or keyword...' : 'جستجو در نام یا توضیحات دسته‌بندی...'}
                className={`w-full ${
                  isEn ? 'pl-9 pr-3' : 'pr-9 pl-3'
                } py-2 rounded-xl border text-xs outline-none transition-colors ${
                  isLightMode
                    ? 'bg-white border-slate-200 text-slate-800 focus:border-indigo-500'
                    : 'bg-slate-900 border-slate-800 text-slate-200 focus:border-indigo-400'
                }`}
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={fetchCategories}
                disabled={isLoading}
                title={isEn ? 'Refresh categories' : 'تازه‌سازی دسته‌ها'}
                className={`p-2 rounded-xl border transition-colors ${
                  isLightMode
                    ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>

              {activeFormMode === 'idle' && (
                <button
                  id="add-category-btn"
                  onClick={handleOpenAdd}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-semibold text-xs text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isEn ? 'New Category' : 'دسته‌بندی جدید'}</span>
                </button>
              )}
            </div>
          </div>

          {/* ADD / EDIT FORM DRAWER */}
          {activeFormMode !== 'idle' && (
            <form
              onSubmit={handleSaveCategory}
              className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                isLightMode
                  ? 'bg-white border-indigo-200 shadow-sm'
                  : 'bg-slate-900/90 border-indigo-500/40 shadow-lg shadow-indigo-950/20'
              }`}
            >
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-inherit">
                <div className="flex items-center gap-2">
                  {activeFormMode === 'add' ? (
                    <Plus className="w-4 h-4 text-indigo-400" />
                  ) : (
                    <Edit2 className="w-4 h-4 text-indigo-400" />
                  )}
                  <h3 className="text-sm font-bold">
                    {activeFormMode === 'add'
                      ? isEn
                        ? 'Create New Category'
                        : 'افزودن دسته‌بندی جدید'
                      : isEn
                      ? `Edit Category: ${editingCategory?.name}`
                      : `ویرایش دسته‌بندی: ${editingCategory?.name}`}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleCancelForm}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
              </div>

              {activeFormMode === 'edit' && (editingCategory?.serverCount || 0) > 0 && (
                <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">
                      {isEn ? 'Cascade Renaming Notice:' : 'توجه به تغییر نام دسته‌بندی:'}
                    </span>{' '}
                    {isEn
                      ? `Renaming this category will automatically update ${editingCategory?.serverCount} server(s) currently assigned to it across the entire fleet in the database.`
                      : `در صورت تغییر نام این دسته، نام جدید به طور خودکار در تمامی ${editingCategory?.serverCount} سرور اختصاص‌یافته در دیتابیس جایگزین می‌شود.`}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Category Name (English / Primary) */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-semibold">
                      {isEn ? 'Category Name (Internal / Primary)' : 'نام دسته‌بندی (اصلی / انگلیسی)'}
                      <span className="text-rose-500 ml-0.5">*</span>
                    </label>
                    <FieldInfoTooltip
                      title={isEn ? 'Category Name' : 'نام دسته‌بندی'}
                      whatIsIt={
                        isEn
                          ? 'The primary unique key and label for grouping remote servers.'
                          : 'کلید و نام یکتای اصلی برای گروه‌بندی سرورهای ریموت در پایگاه داده.'
                      }
                      whyNeeded={
                        isEn
                          ? 'Used by queries, filter dropdowns, and automation playbooks to target specific infrastructure roles.'
                          : 'در فیلترهای نمایش، جستجو و اسکریپت‌های اتوماسیون برای تمایز نقش سرورها استفاده می‌شود.'
                      }
                      example={isEn ? 'e.g., Kubernetes, Web / App, Database' : 'مثال: Database، Web / App، DMZ Gateway'}
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder={isEn ? 'e.g., Kubernetes' : 'مثال: Kubernetes'}
                    className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-300 focus:border-indigo-500'
                        : 'bg-slate-950 border-slate-700 text-slate-100 focus:border-indigo-400'
                    }`}
                  />
                </div>

                {/* Category Persian Name */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-semibold">
                      {isEn ? 'Localized Title (Persian / Display)' : 'عنوان نمایشی (فارسی)'}
                    </label>
                    <FieldInfoTooltip
                      title={isEn ? 'Localized Display Title' : 'عنوان نمایشی فارسی'}
                      whatIsIt={
                        isEn
                          ? 'Persian translated title displayed when Persian language is active in the panel.'
                          : 'عنوان ترجمه‌شده دسته‌بندی برای زمانی که زبان پنل روی فارسی تنظیم است.'
                      }
                      whyNeeded={
                        isEn
                          ? 'Ensures strict localization and natural UI readability for Persian-speaking NOC engineers.'
                          : 'مطابق با استاندارد چندزبانگی جهت نمایش خوانا در محیط فارسی کاربری.'
                      }
                      example={isEn ? 'e.g., پایگاه‌های داده، کوبرنتیز' : 'مثال: پایگاه‌های داده، سرورهای وب و API'}
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>
                  <input
                    type="text"
                    value={formNameFa}
                    onChange={(e) => setFormNameFa(e.target.value)}
                    placeholder={isEn ? 'Optional Persian title...' : 'عنوان فارسی دسته‌بندی...'}
                    className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-300 focus:border-indigo-500'
                        : 'bg-slate-950 border-slate-700 text-slate-100 focus:border-indigo-400'
                    }`}
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-semibold">
                    {isEn ? 'Description / Purpose' : 'توضیحات و کاربرد'}
                  </label>
                  <textarea
                    rows={2}
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder={
                      isEn
                        ? 'Briefly describe the server roles in this category (e.g., PostgreSQL clusters, Redis nodes)...'
                        : 'توضیح مختصر درباره نقش سرورهای این دسته‌بندی...'
                    }
                    className={`w-full px-3 py-2 rounded-xl border text-xs outline-none resize-none ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-300 focus:border-indigo-500'
                        : 'bg-slate-950 border-slate-700 text-slate-100 focus:border-indigo-400'
                    }`}
                  />
                </div>

                {/* Color Preset Selector */}
                <div className="space-y-2 sm:col-span-2">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-semibold flex items-center gap-1">
                      <Palette className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{isEn ? 'Color Badge Theme' : 'رنگ نماد و برچسب دسته'}</span>
                    </label>
                    <FieldInfoTooltip
                      title={isEn ? 'Color Badge' : 'رنگ برچسب'}
                      whatIsIt={
                        isEn
                          ? 'Visual accent color associated with this category in server cards and filters.'
                          : 'رنگ شاخص بصری برای تفکیک سریع کارت‌های سرور در نمای ناوگان.'
                      }
                      whyNeeded={
                        isEn
                          ? 'Enables rapid visual scanning across large datacenters and clusters.'
                          : 'امکان تشخیص بصری فوری نقش سرورها را در میان صدها نود فراهم می‌سازد.'
                      }
                      example={isEn ? 'Emerald for DB, Rose for AD, Cyan for K8s' : 'سبز زمردی برای دیتابیس، سرخ برای اکتیو دایرکتوری'}
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map((p) => {
                      const isSelected = formColor.toLowerCase() === p.key;
                      return (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => setFormColor(p.key)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                            p.bg
                          } ${p.text} ${p.border} ${
                            isSelected ? `ring-2 ${p.ring} scale-105 shadow-sm font-bold` : 'opacity-70 hover:opacity-100'
                          }`}
                        >
                          <span className={`w-2.5 h-2.5 rounded-full ${p.bg} border ${p.border}`} />
                          <span>{p.label}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 ml-1" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 mt-5 pt-3 border-t border-inherit">
                <button
                  type="button"
                  onClick={handleCancelForm}
                  disabled={isSaving}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {isSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>
                    {activeFormMode === 'add'
                      ? isEn
                        ? 'Save Category'
                        : 'ذخیره دسته‌بندی'
                      : isEn
                      ? 'Update Category'
                      : 'به‌روزرسانی دسته‌بندی'}
                  </span>
                </button>
              </div>
            </form>
          )}

          {/* DELETE / REASSIGN DIALOG */}
          {categoryToDelete && (
            <div
              className={`p-5 rounded-2xl border transition-all ${
                isLightMode
                  ? 'bg-rose-50/70 border-rose-300 text-slate-900 shadow-sm'
                  : 'bg-rose-950/30 border-rose-500/40 text-slate-100 shadow-xl'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-rose-400">
                    {isEn
                      ? `Delete Category: "${categoryToDelete.name}"?`
                      : `حذف دسته‌بندی: "${categoryToDelete.name}"؟`}
                  </h3>
                  <p className={`text-xs mt-1 leading-relaxed ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
                    {isEn
                      ? `Are you sure you want to permanently delete this category? Servers will NOT be deleted; they will be safely reassigned.`
                      : `آیا از حذف دائمی این دسته‌بندی اطمینان دارید؟ توجه فرمایید که هیچ سروری پاک نخواهد شد و همگی به دسته مشخص‌شده منتقل می‌گردند.`}
                  </p>

                  {(categoryToDelete.serverCount || 0) > 0 ? (
                    <div className="mt-4 p-3.5 rounded-xl bg-black/20 border border-inherit space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold">
                        <Server className="w-4 h-4 text-indigo-400" />
                        <span>
                          {isEn
                            ? `Active Servers Reassignment (${categoryToDelete.serverCount} servers currently assigned):`
                            : `انتقال سرورهای فعال (${categoryToDelete.serverCount} سرور در حال حاضر به این دسته متصل هستند):`}
                        </span>
                        <FieldInfoTooltip
                          title={isEn ? 'Safe Server Reassignment' : 'انتقال ایمن سرورها'}
                          whatIsIt={
                            isEn
                              ? 'An automated procedure that re-links orphaned servers to a target category without data loss.'
                              : 'روال خودکاری که از بی‌دسته شدن سرورها جلوگیری نموده و آن‌ها را به دسته‌ای ایمن منتقل می‌کند.'
                          }
                          whyNeeded={
                            isEn
                              ? 'Prevents servers from having broken references or becoming inaccessible in category filters.'
                              : 'مانع از قطع ارتباط فیلترها و شکست ارجاعات سیستمی سرورها در دیتابیس می‌شود.'
                          }
                          example={isEn ? 'Reassign to "Uncategorized"' : 'مثال: انتقال به "دسته‌بندی‌نشده"'}
                          isEn={isEn}
                          isLightMode={isLightMode}
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">{isEn ? 'Move to:' : 'انتقال به:'}</span>
                        <select
                          value={reassignTarget}
                          onChange={(e) => setReassignTarget(e.target.value)}
                          className={`flex-1 px-3 py-1.5 rounded-lg border text-xs font-semibold outline-none cursor-pointer ${
                            isLightMode
                              ? 'bg-white border-slate-300 text-slate-800'
                              : 'bg-slate-900 border-slate-700 text-slate-100'
                          }`}
                        >
                          {categories
                            .filter((c) => c.id !== categoryToDelete.id)
                            .map((c) => (
                              <option key={c.id} value={c.name}>
                                {isEn ? c.name : c.name_fa || c.name} ({c.serverCount || 0}{' '}
                                {isEn ? 'servers' : 'سرور'})
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 text-xs text-emerald-400 flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" />
                      <span>
                        {isEn
                          ? 'This category has 0 servers assigned. It can be safely removed.'
                          : 'هیچ سروری به این دسته‌بندی متصل نیست و بدون تغییر در سرورها حذف خواهد شد.'}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-2.5 mt-4">
                    <button
                      onClick={() => setCategoryToDelete(null)}
                      disabled={isDeleting}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {isEn ? 'Cancel' : 'انصراف'}
                    </button>
                    <button
                      onClick={handleConfirmDelete}
                      disabled={isDeleting}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 transition-colors shadow-sm"
                    >
                      {isDeleting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Confirm Delete' : 'تأیید و حذف'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CATEGORIES GRID */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 px-1">
              <span>{isEn ? 'Configured Categories' : 'دسته‌بندی‌های پیکربندی‌شده'}</span>
              <span>
                {filteredCategories.length} {isEn ? 'showing' : 'مورد'}
              </span>
            </div>

            {filteredCategories.length === 0 ? (
              <div
                className={`py-12 text-center rounded-2xl border border-dashed ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
                }`}
              >
                <FolderTree className="w-10 h-10 mx-auto text-slate-500 mb-2 opacity-50" />
                <p className="text-xs font-medium text-slate-400">
                  {searchQuery
                    ? isEn
                      ? 'No categories match your search filter.'
                      : 'دسته‌بندی منطبق با عبارت جستجو یافت نشد.'
                    : isEn
                    ? 'No categories configured yet.'
                    : 'هنوز دسته‌بندی تعریف نشده است.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {filteredCategories.map((cat) => {
                  const colorTheme = getColorStyles(cat.color);
                  const isUncategorized = cat.name.toLowerCase() === 'uncategorized';
                  return (
                    <div
                      key={cat.id}
                      className={`relative flex flex-col justify-between p-4 rounded-2xl border transition-all ${
                        isLightMode
                          ? 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                          : 'bg-slate-900/70 border-slate-800/90 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        {/* Top card row: Name, Badge, Default flag */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-3 h-3 rounded-full border shrink-0 ${colorTheme.bg} ${colorTheme.border}`}
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-bold tracking-tight">
                                  {isEn ? cat.name : cat.name_fa || cat.name}
                                </h4>
                                {!isEn && cat.name_fa && (
                                  <span className="text-[10px] text-slate-400 font-mono">({cat.name})</span>
                                )}
                              </div>
                              {cat.description && (
                                <p className={`text-[11px] mt-0.5 line-clamp-2 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                  {cat.description}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {cat.is_default && (
                              <span
                                title={isEn ? 'System Preset Category' : 'دسته‌بندی پیش‌فرض سیستم'}
                                className={`text-[10px] px-2 py-0.5 rounded-full font-medium border flex items-center gap-1 ${
                                  isLightMode
                                    ? 'bg-slate-100 border-slate-200 text-slate-600'
                                    : 'bg-slate-800/80 border-slate-700 text-slate-300'
                                }`}
                              >
                                <Shield className="w-2.5 h-2.5" />
                                <span>{isEn ? 'System' : 'سیستمی'}</span>
                              </span>
                            )}
                            <span
                              className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${colorTheme.bg} ${colorTheme.text} ${colorTheme.border}`}
                            >
                              {cat.serverCount || 0} {isEn ? 'Servers' : 'سرور'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Card Footer: Action Buttons */}
                      <div className="flex items-center justify-between pt-3 mt-3 border-t border-inherit/60">
                        <div className="text-[10px] text-slate-400 font-mono">
                          ID: <span className="opacity-75">{cat.id}</span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(cat)}
                            title={isEn ? 'Edit category' : 'ویرایش دسته‌بندی'}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isLightMode
                                ? 'text-slate-500 hover:bg-slate-100 hover:text-indigo-600'
                                : 'text-slate-400 hover:bg-slate-800 hover:text-indigo-400'
                            }`}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleOpenDelete(cat)}
                            disabled={isUncategorized}
                            title={
                              isUncategorized
                                ? isEn
                                  ? 'Default system fallback cannot be deleted'
                                  : 'دسته‌بندی پیش‌فرض سیستم قابل حذف نیست'
                                : isEn
                                ? 'Delete category'
                                : 'حذف دسته‌بندی'
                            }
                            className={`p-1.5 rounded-lg transition-colors ${
                              isUncategorized
                                ? 'opacity-30 cursor-not-allowed text-slate-500'
                                : isLightMode
                                ? 'text-slate-500 hover:bg-rose-50 hover:text-rose-600'
                                : 'text-slate-400 hover:bg-rose-950/40 hover:text-rose-400'
                            }`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ================= FOOTER ================= */}
        <div
          className={`flex items-center justify-between px-5 py-3 border-t shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Layers className="w-4 h-4 text-indigo-400" />
            <span>
              {isEn
                ? 'Changes are automatically persisted to PostgreSQL and the local cluster store.'
                : 'کلیه تغییرات در دیتابیس PostgreSQL و فایل ذخیره‌ساز سیستم ثبت می‌گردند.'}
            </span>
          </div>

          <button
            onClick={onClose}
            className={`px-4 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
              isLightMode
                ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {isEn ? 'Close' : 'بستن'}
          </button>
        </div>
      </div>
    </div>
  );
};
