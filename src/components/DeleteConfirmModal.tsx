import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2, Box, Server, ShieldCheck, X, AlertCircle, StickyNote, Paperclip, FolderTree, Printer, FolderX } from 'lucide-react';
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

export interface DeleteDeviceGroupTarget {
  type: 'device_group';
  id: string;
  name: string;
  description?: string;
  deviceCount?: number;
  serverCount?: number;
  tags?: string[];
}

export interface DeletePrinterTarget {
  type: 'printer';
  id: string;
  name: string;
  host?: string;
  portName?: string;
  driverName?: string;
  scope?: 'machine' | 'user' | 'unknown';
  ownerUser?: string;
}

export interface DeleteNetworkShareTarget {
  type: 'network_share';
  id: string;
  name: string;
  driveLetter?: string;
  remotePath: string;
  host?: string;
  scope?: 'user' | 'all_users' | 'machine';
  ownerUser?: string;
  ownerSid?: string;
  managedRuleName?: string;
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
  | DeleteDeviceGroupTarget
  | DeletePrinterTarget
  | DeleteNetworkShareTarget
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
  onConfirmDeleteGroup?: (groupId: string) => void;
  onConfirmDeletePrinter?: (printerTarget: DeletePrinterTarget) => void;
  onConfirmDeleteNetworkShare?: (shareTarget: DeleteNetworkShareTarget) => void;
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
  onConfirmDeleteGroup,
  onConfirmDeletePrinter,
  onConfirmDeleteNetworkShare,
  onConfirm,
  isLightMode: propIsLightMode,
}) => {
  const { isEn } = useLanguage();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !target) return null;

  const isLightMode =
    propIsLightMode ??
    (typeof document !== 'undefined' &&
      (document.querySelector('.theme-light') !== null ||
        document.documentElement.classList.contains('light') ||
        document.body.classList.contains('light') ||
        localStorage.getItem('nettopology_theme') === 'light'));

  const isRack = target.type === 'rack';
  const isRackDevice = target.type === 'rack_device';
  const isNote = target.type === 'note';
  const isAttachment = target.type === 'attachment';
  const isDeviceGroup = target.type === 'device_group';
  const isPrinter = target.type === 'printer';
  const isNetworkShare = target.type === 'network_share';
  const isGeneric = target.type === 'generic';
  const rackTarget = isRack ? (target as DeleteRackTarget) : null;
  const rackDeviceTarget = isRackDevice ? (target as DeleteRackDeviceTarget) : null;
  const noteTarget = isNote ? (target as DeleteStickyNoteTarget) : null;
  const attachmentTarget = isAttachment ? (target as DeleteAttachmentTarget) : null;
  const groupTarget = isDeviceGroup ? (target as DeleteDeviceGroupTarget) : null;
  const printerTarget = isPrinter ? (target as DeletePrinterTarget) : null;
  const shareTarget = isNetworkShare ? (target as DeleteNetworkShareTarget) : null;
  const genericTarget = isGeneric ? (target as DeleteGenericTarget) : null;
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
        dir={isEn ? 'ltr' : 'rtl'}
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
                : isDeviceGroup
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-500'
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
              ) : isDeviceGroup ? (
                <FolderTree className="w-5 h-5" />
              ) : isPrinter ? (
                <Printer className="w-5 h-5" />
              ) : isNetworkShare ? (
                <FolderX className="w-5 h-5" />
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
                  : isDeviceGroup
                  ? isEn
                    ? `Delete Group ("${target.name}")`
                    : `حذف گروه («${target.name}»)`
                  : isPrinter
                  ? isEn
                    ? `Remove Printer ("${target.name}")`
                    : `حذف پرینتر («${target.name}»)`
                  : isNetworkShare
                  ? isEn
                    ? `Disconnect Mapped Share (${shareTarget?.driveLetter || shareTarget?.remotePath})`
                    : `قطع اتصال پوشه اشتراکی («${shareTarget?.driveLetter || shareTarget?.remotePath}»)`
                  : isGeneric
                  ? isEn
                    ? `Delete ${genericTarget?.category || 'Item'} ("${target.name}")`
                    : `حذف ${genericTarget?.category || 'مورد'} («${target.name}»)`
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
                  : isDeviceGroup
                  ? isEn
                    ? `Network Zone & Resource Group • ${(groupTarget?.deviceCount || 0) + (groupTarget?.serverCount || 0)} Members`
                    : `گروه تجهیزات و زون شبکه • ${(groupTarget?.deviceCount || 0) + (groupTarget?.serverCount || 0)} عضو`
                  : isPrinter
                  ? isEn
                    ? `${printerTarget?.host ? `Workstation ${printerTarget.host} • ` : ''}${printerTarget?.portName || 'Print Queue'}`
                    : `${printerTarget?.host ? `سیستم ${printerTarget.host} • ` : ''}${printerTarget?.portName || 'صف چاپ'}`
                  : isNetworkShare
                  ? isEn
                    ? `${shareTarget?.host ? `Workstation ${shareTarget.host} • ` : ''}${shareTarget?.remotePath}`
                    : `${shareTarget?.host ? `سیستم ${shareTarget.host} • ` : ''}${shareTarget?.remotePath}`
                  : isGeneric
                  ? genericTarget?.description || (isEn ? 'Permanent Removal Confirmation' : 'تایید حذف دائمی')
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
          ) : isDeviceGroup ? (
            /* Device Group Deletion Content */
            <div className="space-y-3">
              <div className={`p-3.5 rounded-xl border text-xs space-y-2.5 ${
                isLightMode
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-rose-950/25 border-rose-500/40 text-rose-200'
              }`}>
                <div className={`flex items-center gap-2 font-bold ${isLightMode ? 'text-rose-700' : 'text-rose-300'}`}>
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    {isEn ? 'Confirm Group & Network Zone Deletion' : 'تایید حذف گروه تجهیزات و زون شبکه'}
                  </span>
                </div>
                <p className={`leading-relaxed ${isLightMode ? 'text-slate-700' : 'text-slate-200'}`}>
                  {isEn
                    ? `Are you sure you want to permanently delete the group "${groupTarget?.name}"?`
                    : `آیا از حذف دائمی گروه «${groupTarget?.name}» اطمینان دارید؟`}
                </p>
                {groupTarget?.description && (
                  <p className={`text-[11px] leading-relaxed ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                    {groupTarget.description}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono pt-1">
                  <span className={`px-2 py-0.5 rounded ${isLightMode ? 'bg-cyan-100 text-cyan-800 border border-cyan-200' : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'}`}>
                    {isEn ? 'Devices' : 'تجهیزات'}: <strong>{groupTarget?.deviceCount ?? 0}</strong>
                  </span>
                  <span className={`px-2 py-0.5 rounded ${isLightMode ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' : 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'}`}>
                    {isEn ? 'Servers' : 'سرورها'}: <strong>{groupTarget?.serverCount ?? 0}</strong>
                  </span>
                  {Array.isArray(groupTarget?.tags) &&
                    groupTarget.tags.slice(0, 4).map((tg) => (
                      <span
                        key={tg}
                        className={`px-2 py-0.5 rounded ${isLightMode ? 'bg-slate-200 text-slate-800' : 'bg-slate-800 text-slate-300'}`}
                      >
                        #{tg}
                      </span>
                    ))}
                </div>
              </div>
              <p className={`text-[11px] leading-relaxed ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                {isEn
                  ? 'This action cannot be undone. Removing this group deletes the zone definition from the database; all member devices and servers will remain safely preserved in the system inventory.'
                  : 'توجه: این عملیات غیرقابل بازگشت است و ساختار این گروه از پایگاه داده حذف می‌شود؛ با این حال تمام تجهیزات و سرورهای عضو در فهرست کل تجهیزات سامانه باقی خواهند ماند.'}
              </p>
            </div>
          ) : isPrinter ? (
            /* Printer Removal Content */
            <div className="space-y-3">
              <div className={`p-3.5 rounded-xl border text-xs space-y-2.5 ${
                isLightMode
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-rose-950/25 border-rose-500/40 text-rose-200'
              }`}>
                <div className={`flex items-center gap-2 font-bold ${isLightMode ? 'text-rose-700' : 'text-rose-300'}`}>
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    {isEn ? 'Confirm Printer Removal from Endpoint' : 'تایید حذف پرینتر از سیستم کاربر'}
                  </span>
                </div>
                <p className={`leading-relaxed ${isLightMode ? 'text-slate-700' : 'text-slate-200'}`}>
                  {isEn
                    ? `Are you sure you want to remove printer "${printerTarget?.name}" from ${printerTarget?.host || 'this workstation'}?`
                    : `آیا از حذف پرینتر «${printerTarget?.name}» از روی سیستم ${printerTarget?.host || 'کاربر'} اطمینان دارید؟`}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono pt-1">
                  {printerTarget?.driverName && (
                    <span className={`px-2 py-0.5 rounded ${isLightMode ? 'bg-slate-200 text-slate-800' : 'bg-slate-800 text-slate-300'}`}>
                      {isEn ? 'Driver' : 'درایور'}: <strong>{printerTarget.driverName}</strong>
                    </span>
                  )}
                  {printerTarget?.scope && (
                    <span className={`px-2 py-0.5 rounded ${isLightMode ? 'bg-sky-100 text-sky-900 border border-sky-200' : 'bg-sky-500/15 text-sky-300 border border-sky-500/30'}`}>
                      {printerTarget.scope === 'user'
                        ? isEn ? `User Profile (${printerTarget.ownerUser || 'Active User'})` : `پروفایل کاربر (${printerTarget.ownerUser || 'کاربر فعال'})`
                        : isEn ? 'Machine / All Users' : 'سیستمی / همه کاربران'}
                    </span>
                  )}
                </div>
              </div>
              <p className={`text-[11px] leading-relaxed ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                {isEn
                  ? 'If this is a network connection from a print server, it will be unmapped from the workstation/active user profile without affecting the print server itself.'
                  : 'در صورت اشتراکی بودن پرینتر، تنها اتصال آن از سیستم/پروفایل کاربر حذف می‌شود و تنظیمات خود پرینت سرور تغییری نمی‌کند.'}
              </p>
            </div>
          ) : isNetworkShare ? (
            /* Network Share Disconnect Content */
            <div className="space-y-3">
              <div className={`p-3.5 rounded-xl border text-xs space-y-2.5 ${
                isLightMode
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-rose-950/25 border-rose-500/40 text-rose-200'
              }`}>
                <div className={`flex items-center gap-2 font-bold ${isLightMode ? 'text-rose-700' : 'text-rose-300'}`}>
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    {isEn ? 'Confirm Network Share Disconnect' : 'تایید قطع اتصال (Disconnect) پوشه اشتراکی'}
                  </span>
                </div>
                <p className={`leading-relaxed ${isLightMode ? 'text-slate-700' : 'text-slate-200'}`}>
                  {isEn
                    ? `Are you sure you want to disconnect "${shareTarget?.driveLetter ? `${shareTarget.driveLetter} (${shareTarget.remotePath})` : shareTarget?.remotePath}" from ${shareTarget?.host || 'this workstation'}?`
                    : `آیا از قطع اتصال پوشه اشتراکی «${shareTarget?.driveLetter ? `${shareTarget.driveLetter} (${shareTarget.remotePath})` : shareTarget?.remotePath}» روی سیستم ${shareTarget?.host || 'کاربر'} اطمینان دارید؟`}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono pt-1">
                  {shareTarget?.driveLetter && (
                    <span className={`px-2 py-0.5 rounded ${isLightMode ? 'bg-slate-200 text-slate-800' : 'bg-slate-800 text-slate-300'}`}>
                      {isEn ? 'Drive' : 'درایو'}: <strong>{shareTarget.driveLetter}</strong>
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded ${isLightMode ? 'bg-sky-100 text-sky-900 border border-sky-200' : 'bg-sky-500/15 text-sky-300 border border-sky-500/30'}`}>
                    {shareTarget?.scope === 'all_users'
                      ? isEn ? 'All Users Logon Rule + Profiles' : 'قانون همه کاربران سیستم + پروفایل‌ها'
                      : shareTarget?.scope === 'user'
                      ? isEn ? `User Profile (${shareTarget.ownerUser || 'Active User'})` : `پروفایل کاربر (${shareTarget.ownerUser || 'کاربر فعال'})`
                      : isEn ? 'Workstation Session' : 'نشست سیستم'}
                  </span>
                </div>
              </div>
              <p className={`text-[11px] leading-relaxed ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                {isEn
                  ? 'Disconnecting removes the mapped drive letter, clears persistent HKU\\Network entries (and any NetTopo All-Users logon rule if applicable) without deleting files on the file server.'
                  : 'این عملیات فقط اتصال درایو شبکه/رجیستری کاربر (و در حالت همه کاربران، قانون Logon مربوطه) را روی سیستم کلاینت قطع می‌کند و هیچ فایلی را از روی فایل سرور حذف نمی‌کند.'}
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
          ) : isDeviceGroup ? (
            <button
              type="button"
              id="confirm-delete-group-btn"
              onClick={() => {
                if (groupTarget && onConfirmDeleteGroup) {
                  onConfirmDeleteGroup(groupTarget.id);
                } else if (onConfirm) {
                  onConfirm();
                }
                onClose();
              }}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold border border-rose-500/50 shadow-lg transition active:scale-95 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isEn ? 'Delete Group' : 'حذف گروه'}</span>
            </button>
          ) : isPrinter ? (
            <button
              type="button"
              id="confirm-delete-printer-btn"
              onClick={() => {
                if (printerTarget && onConfirmDeletePrinter) {
                  onConfirmDeletePrinter(printerTarget);
                } else if (onConfirm) {
                  onConfirm();
                }
                onClose();
              }}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold border border-rose-500/50 shadow-lg transition active:scale-95 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isEn ? 'Remove Printer' : 'حذف پرینتر'}</span>
            </button>
          ) : isNetworkShare ? (
            <button
              type="button"
              id="confirm-disconnect-share-btn"
              onClick={() => {
                if (shareTarget && onConfirmDeleteNetworkShare) {
                  onConfirmDeleteNetworkShare(shareTarget);
                } else if (onConfirm) {
                  onConfirm();
                }
                onClose();
              }}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold border border-rose-500/50 shadow-lg transition active:scale-95 cursor-pointer"
            >
              <FolderX className="w-4 h-4" />
              <span>{isEn ? 'Disconnect Share' : 'قطع اتصال (Disconnect)'}</span>
            </button>
          ) : isGeneric ? (
            <button
              type="button"
              id="confirm-delete-generic-btn"
              onClick={() => {
                if (onConfirm) {
                  onConfirm();
                }
                onClose();
              }}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold border border-rose-500/50 shadow-lg transition active:scale-95 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isEn ? 'Confirm Delete' : 'تایید حذف'}</span>
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
