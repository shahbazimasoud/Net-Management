import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2, Box, Server, ShieldCheck, X, AlertCircle, StickyNote, Paperclip, FileText, ScrollText, KeyRound } from 'lucide-react';
import { MountedHardwareDevice } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

export interface DeleteDeviceTarget {
  type: 'device';
  id: string;
  name: string;
  ip?: string;
  role?: string;
  model?: string;
}

export interface DeleteRackTarget {
  type: 'rack';
  id: string;
  name: string;
  units: number;
  devices: MountedHardwareDevice[];
}

export interface DeleteRackDeviceTarget {
  type: 'rack_device';
  id: string;
  name: string;
  rackId: string;
  rackName?: string;
  startU: number;
  heightU: number;
  model?: string;
  brand?: string;
}

export interface DeleteStickyNoteTarget {
  type: 'note';
  id: string;
  title?: string;
  content: string;
  linkedDeviceName?: string;
}

export interface DeleteAttachmentTarget {
  type: 'attachment';
  id: string;
  name: string;
  fileSize?: number;
  fileType?: string;
  parentTitle?: string;
  itemType?: 'contract' | 'license' | 'document';
}

export interface DeleteContractTarget {
  type: 'contract';
  id: string;
  name: string;
  contractNumber?: string;
  vendorName?: string;
}

export interface DeleteLicenseTarget {
  type: 'license';
  id: string;
  name: string;
  licenseKey?: string;
  vendor?: string;
}

export interface DeleteGenericTarget {
  type: 'generic';
  id: string;
  name: string;
  category?: string;
  description?: string;
}

export type DeleteTarget =
  | DeleteDeviceTarget
  | DeleteRackTarget
  | DeleteRackDeviceTarget
  | DeleteStickyNoteTarget
  | DeleteAttachmentTarget
  | DeleteContractTarget
  | DeleteLicenseTarget
  | DeleteGenericTarget;

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: DeleteTarget | null;
  onConfirmDeleteDevice?: (deviceId: string) => void;
  onConfirmDeleteRack?: (rackId: string, deleteMountedDevices: boolean) => void;
  onConfirmRemoveFromRack?: (rackId: string, deviceId: string) => void;
  onConfirmDeleteStickyNote?: (noteId: string) => void;
  onConfirmDeleteAttachment?: (attachmentId: string) => void;
  onConfirmDeleteContract?: (contractId: string) => void;
  onConfirmDeleteLicense?: (licenseId: string) => void;
  onConfirm?: () => void;
  isLightMode?: boolean;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  onClose,
  target,
  onConfirmDeleteDevice,
  onConfirmDeleteRack,
  onConfirmRemoveFromRack,
  onConfirmDeleteStickyNote,
  onConfirmDeleteAttachment,
  onConfirmDeleteContract,
  onConfirmDeleteLicense,
  onConfirm,
  isLightMode: propIsLightMode,
}) => {
  const { isEn } = useLanguage();

  if (!isOpen || !target) return null;

  const isLightMode =
    propIsLightMode ??
    (typeof document !== 'undefined' &&
      (document.documentElement.classList.contains('light') ||
        document.body.classList.contains('light') ||
        localStorage.getItem('nettopology_theme') === 'light'));

  const isRack = target.type === 'rack';
  const isRackDevice = target.type === 'rack_device';
  const isNote = target.type === 'note';
  const isAttachment = target.type === 'attachment';
  const rackTarget = isRack ? (target as DeleteRackTarget) : null;
  const rackDeviceTarget = isRackDevice ? (target as DeleteRackDeviceTarget) : null;
  const noteTarget = isNote ? (target as DeleteStickyNoteTarget) : null;
  const attachmentTarget = isAttachment ? (target as DeleteAttachmentTarget) : null;
  const deviceTarget = target.type === 'device' ? (target as DeleteDeviceTarget) : null;
  const hasMountedDevices = (rackTarget?.devices?.length || 0) > 0;

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const modalElement = (
    <div
      className="fixed top-0 left-0 right-0 bottom-8 z-[999995] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`relative w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border animate-scale-up ${
          isLightMode
            ? 'bg-white border-slate-200 text-slate-900'
            : 'bg-slate-900 border-slate-700/80 text-white'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${
          isLightMode ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950/60'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl border ${
              isRack && hasMountedDevices
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                : isNote
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                : isRackDevice
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                : isAttachment
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
            }`}>
              {isRack ? (
                <Box className="w-5 h-5" />
              ) : isNote ? (
                <StickyNote className="w-5 h-5" />
              ) : isRackDevice ? (
                <Server className="w-5 h-5" />
              ) : isAttachment ? (
                <Paperclip className="w-5 h-5" />
              ) : (
                <AlertTriangle className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className={`text-base font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                {isRack
                  ? isEn
                    ? `Delete Server Rack (${target.name})`
                    : `حذف رک سرور («${target.name}»)`
                  : isNote
                  ? isEn
                    ? noteTarget?.title ? `Delete Note ("${noteTarget.title}")` : 'Delete Sticky Note'
                    : noteTarget?.title ? `حذف یادداشت («${noteTarget.title}»)` : 'حذف یادداشت روی نقشه'
                  : isRackDevice
                  ? isEn
                    ? `Remove Device from Rack (${target.name})`
                    : `حذف تجهیز از داخل رک («${target.name}»)`
                  : isAttachment
                  ? isEn
                    ? `Delete Attachment ("${target.name}")`
                    : `حذف فایل پیوست («${target.name}»)`
                  : isEn
                  ? `Delete Device (${target.name})`
                  : `حذف تجهیز («${target.name}»)`}
              </h3>
              <p className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isRack
                  ? isEn
                    ? `${rackTarget?.units}U Datacenter Cabinet`
                    : `رک استاندارد دیتاسنتر ${rackTarget?.units} یونیت`
                  : isNote
                  ? noteTarget?.linkedDeviceName
                    ? isEn
                      ? `Linked to device: ${noteTarget.linkedDeviceName}`
                      : `متصل به تجهیز: ${noteTarget.linkedDeviceName}`
                    : isEn
                    ? 'Schematic Topology Canvas Note'
                    : 'یادداشت چسبان بوم توپولوژی'
                  : isRackDevice
                  ? isEn
                    ? `Rack: ${rackDeviceTarget?.rackName || 'Rack'} • Units U${rackDeviceTarget?.startU}-U${(rackDeviceTarget?.startU || 1) + (rackDeviceTarget?.heightU || 1) - 1}`
                    : `رک: ${rackDeviceTarget?.rackName || 'رک'} • یونیت‌های U${rackDeviceTarget?.startU} الی U${(rackDeviceTarget?.startU || 1) + (rackDeviceTarget?.heightU || 1) - 1}`
                  : isAttachment
                  ? isEn
                    ? `${attachmentTarget?.parentTitle ? `${attachmentTarget.parentTitle} • ` : ''}${formatFileSize(attachmentTarget?.fileSize)}`
                    : `${attachmentTarget?.parentTitle ? `مربوط به: «${attachmentTarget.parentTitle}» • ` : ''}${formatFileSize(attachmentTarget?.fileSize)}`
                  : deviceTarget?.model || deviceTarget?.ip || (isEn ? 'Network Hardware' : 'تجهیز شبکه')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-lg transition ${
              isLightMode ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-200' : 'text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4">
          {isRack ? (
            /* Rack Deletion Content */
            hasMountedDevices ? (
              <div className="space-y-3.5">
                <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/40 text-amber-200 text-xs space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-amber-300">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      {isEn
                        ? `Warning: This rack contains ${rackTarget?.devices.length} installed hardware devices!`
                        : `هشدار مهم: این رک شامل ${rackTarget?.devices.length} تجهیز سخت‌افزاری نصب‌شده است!`}
                    </span>
                  </div>
                  <p className="text-slate-300 leading-relaxed text-[11px]">
                    {isEn
                      ? 'Please specify what should happen to the devices installed inside this rack:'
                      : 'لطفاً مشخص فرمایید مایلید با تجهیزات داخل این رک چه رفتاری صورت گیرد:'}
                  </p>
                </div>

                {/* List of mounted devices in the rack */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 max-h-40 overflow-y-auto space-y-2">
                  <div className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
                    <span>{isEn ? 'Installed Devices' : 'لیست تجهیزات داخل رک:'}</span>
                    <span className="font-mono text-cyan-400">{rackTarget?.devices.length} {isEn ? 'units' : 'تجهیز'}</span>
                  </div>
                  {rackTarget?.devices.map((dev) => (
                    <div
                      key={dev.id}
                      className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-slate-900 border border-white/5 font-mono text-slate-200"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Server className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="font-bold truncate">{dev.name}</span>
                        <span className="text-[10px] text-slate-400">({dev.model})</span>
                      </div>
                      <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded shrink-0">
                        U{dev.startU}-U{dev.startU + dev.heightU - 1}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="text-xs text-slate-300 leading-relaxed font-medium">
                  {isEn
                    ? 'Do you want to keep these devices on the map as unmounted hardware, or delete them along with the rack?'
                    : 'آیا می‌خواهید تجهیزات به عنوان سخت‌افزار مستقل در نقشه نگهداری شوند، یا همه آنها همراه با رک حذف شوند؟'}
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60 text-slate-200 text-xs space-y-2">
                <p className="leading-relaxed">
                  {isEn
                    ? `This rack is currently empty. Are you sure you want to delete rack "${rackTarget?.name}"?`
                    : `این رک در حال حاضر خالی از تجهیزات است. آیا از حذف رک سرور «${rackTarget?.name}» اطمینان دارید؟`}
                </p>
              </div>
            )
          ) : isRackDevice ? (
            /* Rack Device Removal Content */
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-rose-950/25 border border-rose-500/40 text-rose-200 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-rose-300">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>
                    {isEn
                      ? `Confirm Device Removal from Rack`
                      : `تایید حذف و خروج تجهیز از رک`}
                  </span>
                  </div>
                <p className="leading-relaxed text-slate-200">
                  {isEn
                    ? `Are you sure you want to remove "${rackDeviceTarget?.name}" (${rackDeviceTarget?.brand || ''} ${rackDeviceTarget?.model || ''}) from rack "${rackDeviceTarget?.rackName || 'Rack'}"?`
                    : `آیا از حذف تجهیز «${rackDeviceTarget?.name}» (${rackDeviceTarget?.brand || ''} ${rackDeviceTarget?.model || ''}) از داخل رک «${rackDeviceTarget?.rackName || 'رک'}» اطمینان دارید؟`}
                </p>
                <div className="flex items-center gap-3 text-[11px] font-mono text-slate-300 pt-1">
                  <span>{isEn ? 'Position' : 'موقعیت'}: <strong className="text-amber-400">U{rackDeviceTarget?.startU}-U{(rackDeviceTarget?.startU || 1) + (rackDeviceTarget?.heightU || 1) - 1}</strong> ({rackDeviceTarget?.heightU}U)</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {isEn
                  ? 'This device will be unmounted from the rack. Its configuration and ports will remain safely preserved in the equipment inventory.'
                  : 'توجه: این تجهیز از رک پیاده‌سازی خواهد شد؛ اما مشخصات و پورت‌های آن جهت استفاده مجدد در لیست تجهیزات باقی می‌ماند.'}
              </p>
            </div>
          ) : isNote ? (
            /* Sticky Note Deletion Content */
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-amber-950/25 border border-amber-500/40 text-amber-200 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-300">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    {isEn
                      ? 'Confirm Sticky Note Deletion'
                      : 'تایید حذف یادداشت از روی نقشه'}
                  </span>
                </div>
                <p className="leading-relaxed text-slate-200">
                  {isEn
                    ? 'Are you sure you want to delete this sticky note? This action cannot be undone.'
                    : 'آیا از حذف دائمی این یادداشت از روی نقشه اطمینان دارید؟ این عملیات غیرقابل بازگشت است.'}
                </p>
                {noteTarget?.content && (
                  <div className="p-2.5 rounded-lg bg-slate-950/70 border border-amber-500/20 text-slate-300 text-[11px] font-sans italic max-h-24 overflow-y-auto leading-relaxed whitespace-pre-wrap">
                    "{noteTarget.content.length > 220 ? noteTarget.content.slice(0, 220) + '...' : noteTarget.content}"
                  </div>
                )}
              </div>
              {noteTarget?.linkedDeviceName && (
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {isEn
                    ? `Note: This sticky note is currently linked to "${noteTarget.linkedDeviceName}". Deleting it will permanently remove the note.`
                    : `توجه: این یادداشت به تجهیز «${noteTarget.linkedDeviceName}» پیوند دارد و حذف آن دائمی خواهد بود.`}
                </p>
              )}
            </div>
          ) : isAttachment ? (
            /* Attachment Deletion Content */
            <div className="space-y-3">
              <div className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                isLightMode
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-rose-950/25 border-rose-500/40 text-rose-200'
              }`}>
                <div className="flex items-center gap-2 font-bold text-rose-500">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    {isEn ? 'Confirm Attachment Deletion' : 'تایید حذف فایل پیوست'}
                  </span>
                </div>
                <p className={`leading-relaxed ${isLightMode ? 'text-slate-700' : 'text-slate-200'}`}>
                  {isEn
                    ? `Are you sure you want to delete the attached file "${attachmentTarget?.name}"?`
                    : `آیا از حذف سند و فایل پیوست «${attachmentTarget?.name}» اطمینان دارید؟`}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono pt-1">
                  {attachmentTarget?.parentTitle && (
                    <span className={`px-2 py-0.5 rounded ${isLightMode ? 'bg-slate-200 text-slate-800' : 'bg-slate-800 text-slate-300'}`}>
                      {isEn ? 'Item' : 'آیتم'}: <strong>{attachmentTarget.parentTitle}</strong>
                    </span>
                  )}
                  {attachmentTarget?.fileSize !== undefined && (
                    <span className={`px-2 py-0.5 rounded ${isLightMode ? 'bg-amber-100 text-amber-900' : 'bg-amber-500/15 text-amber-300'}`}>
                      {isEn ? 'Size' : 'حجم'}: <strong>{formatFileSize(attachmentTarget.fileSize)}</strong>
                    </span>
                  )}
                </div>
              </div>
              <p className={`text-[11px] leading-relaxed ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'This document will be permanently removed from this record. Please confirm your action to proceed.'
                  : 'توجه: این سند از پیوست‌های این بخش حذف خواهد شد. لطفاً جهت تکمیل فرآیند تایید نمایید.'}
              </p>
            </div>
          ) : (
            /* Device Deletion Content */
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-500/30 text-rose-200 text-xs space-y-2">
                <p className="leading-relaxed">
                  {isEn
                    ? `Are you sure you want to remove device "${deviceTarget?.name}"?`
                    : `آیا از حذف تجهیز «${deviceTarget?.name}» از نقشه اطمینان دارید؟`}
                </p>
                <div className="flex items-center gap-3 text-[11px] font-mono text-slate-300 pt-1">
                  {deviceTarget?.ip && <span>IP: <strong className="text-white">{deviceTarget.ip}</strong></span>}
                  {deviceTarget?.role && <span>Role: <strong className="text-white">{deviceTarget.role}</strong></span>}
                </div>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {isEn
                  ? 'All network links and cable connections connected to this device will also be removed.'
                  : 'توجه: کلیه کابل‌ها، خطوط اتصال و لینک‌های متصل به این تجهیز نیز به همراه آن حذف خواهند شد.'}
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className={`flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 px-5 py-4 border-t ${
          isLightMode ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950/70'
        }`}>
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-xs font-medium border transition active:scale-95 cursor-pointer ${
              isLightMode
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-white/10'
            }`}
          >
            {isEn ? 'Cancel' : 'انصراف'}
          </button>

          {isRack ? (
            hasMountedDevices ? (
              <>
                {/* Option 1: Keep devices, delete rack only */}
                <button
                  type="button"
                  onClick={() => {
                    if (rackTarget && onConfirmDeleteRack) {
                      onConfirmDeleteRack(rackTarget.id, false);
                    }
                    onClose();
                  }}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-bold border border-cyan-400/30 shadow-lg transition active:scale-95 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{isEn ? 'Keep Devices & Delete Rack' : 'حفظ تجهیزات در نقشه و حذف فقط رک'}</span>
                </button>

                {/* Option 2: Delete rack and all its devices */}
                <button
                  type="button"
                  onClick={() => {
                    if (rackTarget && onConfirmDeleteRack) {
                      onConfirmDeleteRack(rackTarget.id, true);
                    }
                    onClose();
                  }}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white text-xs font-bold border border-rose-500/50 shadow-lg transition active:scale-95 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isEn ? 'Delete Rack & All Devices' : 'حذف کامل رک به همراه تمام دیوایس‌ها'}</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (rackTarget && onConfirmDeleteRack) {
                    onConfirmDeleteRack(rackTarget.id, false);
                  }
                  onClose();
                }}
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold border border-rose-500/50 shadow-lg transition active:scale-95 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isEn ? 'Delete Rack' : 'حذف رک'}</span>
              </button>
            )
          ) : isRackDevice ? (
            <button
              type="button"
              onClick={() => {
                if (rackDeviceTarget && onConfirmRemoveFromRack) {
                  onConfirmRemoveFromRack(rackDeviceTarget.rackId, rackDeviceTarget.id);
                } else if (rackDeviceTarget && onConfirmDeleteDevice) {
                  onConfirmDeleteDevice(rackDeviceTarget.id);
                }
                onClose();
              }}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold border border-rose-500/50 shadow-lg transition active:scale-95 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isEn ? 'Confirm & Remove from Rack' : 'تایید و حذف از رک'}</span>
            </button>
          ) : isNote ? (
            <button
              type="button"
              id="confirm-delete-note-btn"
              onClick={() => {
                if (noteTarget && onConfirmDeleteStickyNote) {
                  onConfirmDeleteStickyNote(noteTarget.id);
                }
                onClose();
              }}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold border border-rose-500/50 shadow-lg transition active:scale-95 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isEn ? 'Delete Note' : 'حذف یادداشت'}</span>
            </button>
          ) : isAttachment ? (
            <button
              type="button"
              id="confirm-delete-attachment-btn"
              onClick={() => {
                if (attachmentTarget && onConfirmDeleteAttachment) {
                  onConfirmDeleteAttachment(attachmentTarget.id);
                }
                onClose();
              }}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold border border-rose-500/50 shadow-lg transition active:scale-95 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isEn ? 'Delete Attachment' : 'حذف فایل پیوست'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (deviceTarget && onConfirmDeleteDevice) {
                  onConfirmDeleteDevice(deviceTarget.id);
                }
                onClose();
              }}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold border border-rose-500/50 shadow-lg transition active:scale-95 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isEn ? 'Delete Device' : 'حذف تجهیز'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalElement, document.body);
  }
  return modalElement;
};
