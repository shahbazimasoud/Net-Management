import React, { useState } from 'react';
import {
  X,
  Plus,
  Edit2,
  Trash2,
  Check,
  Layers,
  AlertTriangle
} from 'lucide-react';
import { CustomTopologyMap } from '../types';
import { useLanguage } from '../i18n';

interface CustomMapManageModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'create' | 'edit' | 'delete';
  currentMap?: CustomTopologyMap | null;
  onCreateMap: (name: string, description?: string) => void;
  onUpdateMap: (id: string, name: string, description?: string) => void;
  onDeleteMap: (id: string) => void;
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
  isLightMode: propIsLightMode,
}) => {
  const { t, isEn, isRtl } = useLanguage();
  const [name, setName] = useState(currentMap?.name || '');
  const [description, setDescription] = useState(currentMap?.description || '');

  const isLightMode = propIsLightMode ?? (typeof document !== 'undefined' && (
    document.querySelector('.theme-light') !== null ||
    localStorage.getItem('panel_theme') === 'light' ||
    localStorage.getItem('theme_mode') === 'light'
  ));

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    if (mode === 'create') {
      onCreateMap(trimmed, description.trim() || undefined);
    } else if (mode === 'edit' && currentMap) {
      onUpdateMap(currentMap.id, trimmed, description.trim() || undefined);
    }
    onClose();
  };

  const handleDeleteConfirm = () => {
    if (currentMap) {
      onDeleteMap(currentMap.id);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center p-4 modal-backdrop-blur"
      data-modal-backdrop="true"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div
        className={`rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150 border ${
          isLightMode
            ? 'bg-white border-slate-200 text-slate-800 shadow-slate-300/60'
            : 'bg-slate-900 border-slate-750 text-slate-100 shadow-slate-950/90'
        }`}
      >
        {/* Header */}
        <div
          className={`p-4 sm:px-6 border-b flex items-center justify-between ${
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
                  ? (isEn ? 'Edit Topology Map Details' : 'ویرایش مشخصات نقشه توپولوژی')
                  : (isEn ? 'Delete Custom Topology Map' : 'حذف نقشه سفارشی توپولوژی')}
              </h3>
              <p className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {mode === 'delete'
                  ? (isEn ? 'This action cannot be undone.' : 'این عملیات غیرقابل بازگشت است.')
                  : (isEn ? 'Define layout name and optional description.' : 'نام و توضیحات اختیاری نقشه را مشخص کنید.')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-lg transition cursor-pointer ${
              isLightMode
                ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-200/60'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
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
                <p className="text-[11px] mt-1 opacity-90 leading-relaxed">
                  {isEn
                    ? 'All custom device positions and manual cable links on this map will be permanently deleted. Devices in your inventory will remain untouched.'
                    : 'تمام موقعیت‌ها و کابل‌کشی‌های این نقشه پاک خواهد شد، اما تجهیزات در انبار شبکه دست‌نخورده باقی می‌مانند.'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className={`px-4 py-2 rounded-xl border transition font-medium cursor-pointer ${
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
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
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

            <div>
              <label className={`block text-xs font-bold mb-1.5 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                {isEn ? 'Description / Scope (Optional):' : 'توضیحات و حوزه شبکه (اختیاری):'}
              </label>
              <textarea
                rows={3}
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

            <div className="flex items-center justify-end gap-2 pt-2">
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
