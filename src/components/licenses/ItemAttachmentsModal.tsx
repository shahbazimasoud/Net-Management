import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  FileText,
  Paperclip,
  Download,
  Eye,
  FileCode,
  Image as ImageIcon,
  FileArchive,
  Calendar,
  HardDrive,
  DownloadCloud
} from 'lucide-react';
import { AttachmentFile } from '../../types';

interface ItemAttachmentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  itemTitle: string;
  attachments: AttachmentFile[];
  isLightMode?: boolean;
  isEn?: boolean;
  onPreviewFile?: (file: AttachmentFile) => void;
}

export const ItemAttachmentsModal: React.FC<ItemAttachmentsModalProps> = ({
  isOpen,
  onClose,
  onMinimize,
  itemTitle,
  attachments = [],
  isLightMode = false,
  isEn = true,
  onPreviewFile,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);

  if (!isOpen) return null;

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const getFileIcon = (file: AttachmentFile) => {
    const type = file.fileType?.toLowerCase() || '';
    const name = file.fileName?.toLowerCase() || '';

    if (type.includes('pdf') || name.endsWith('.pdf')) {
      return <FileText className="w-5 h-5 text-rose-400" />;
    }
    if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(name)) {
      return <ImageIcon className="w-5 h-5 text-emerald-400" />;
    }
    if (type.includes('zip') || type.includes('tar') || /\.(zip|rar|7z|tar|gz)$/i.test(name)) {
      return <FileArchive className="w-5 h-5 text-amber-400" />;
    }
    if (type.includes('text') || /\.(txt|json|log|csv|md)$/i.test(name)) {
      return <FileCode className="w-5 h-5 text-cyan-400" />;
    }
    return <Paperclip className="w-5 h-5 text-indigo-400" />;
  };

  const canPreview = (file: AttachmentFile) => {
    const type = file.fileType?.toLowerCase() || '';
    const name = file.fileName?.toLowerCase() || '';
    return (
      type.includes('pdf') ||
      name.endsWith('.pdf') ||
      type.startsWith('image/') ||
      /\.(png|jpe?g|gif|webp|svg)$/i.test(name) ||
      type.includes('text/') ||
      /\.(txt|json|log|csv|md)$/i.test(name)
    );
  };

  const resolveDownloadUrl = (file: AttachmentFile) => {
    if (file.downloadUrl) return file.downloadUrl;
    if (file.dataBase64) {
      return file.dataBase64.startsWith('data:')
        ? file.dataBase64
        : `data:${file.fileType || 'application/octet-stream'};base64,${file.dataBase64}`;
    }
    if (file.id) {
      return `/api/licenses-contracts/download/${encodeURIComponent(file.id)}`;
    }
    return '';
  };

  const handleDownload = (file: AttachmentFile) => {
    const url = resolveDownloadUrl(file);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = file.fileName || 'attachment';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadAll = () => {
    attachments.forEach((file, index) => {
      setTimeout(() => {
        handleDownload(file);
      }, index * 250);
    });
  };

  const totalBytes = attachments.reduce((sum, f) => sum + (f.fileSize || 0), 0);

  return createPortal(
    <div
      className={
        isMaximized
          ? 'fixed top-0 left-0 right-0 bottom-8 z-[999990] p-0 flex flex-col'
          : 'fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md modal-backdrop-blur'
      }
      data-modal-backdrop="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 transition-all ${
          isMaximized
            ? 'w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-2xl max-h-[85vh] rounded-2xl border shadow-2xl'
        } ${
          isLightMode
            ? 'bg-white border-slate-200 text-slate-800'
            : 'bg-slate-900 border-slate-800 text-slate-100'
        }`}
      >
        {/* Modal Header */}
        <div
          className={`px-5 py-4 border-b flex items-center justify-between shrink-0 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
              <Paperclip className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold truncate">
                {isEn ? 'Attached Files & Documents' : 'فایل‌ها و اسناد پیوست'}
              </h2>
              <p className="text-xs text-slate-400 truncate mt-0.5" title={itemTitle}>
                {itemTitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {attachments.length > 1 && (
              <button
                type="button"
                onClick={handleDownloadAll}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer"
                title={isEn ? 'Download all attached files' : 'دریافت تمامی پیوست‌ها'}
              >
                <DownloadCloud className="w-3.5 h-3.5" />
                <span>{isEn ? 'Download All' : 'دانلود همه'}</span>
              </button>
            )}

            {/* Rule 7.1: Header 3 control buttons: Close, Minimize, Fullscreen */}
            <button
              type="button"
              onClick={() => {
                if (onMinimize) onMinimize();
                else onClose();
              }}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isLightMode
                  ? 'hover:bg-slate-200 text-slate-600'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-cyan-300'
              }`}
              title={isEn ? 'Minimize' : 'کمینه‌سازی'}
            >
              <Minus className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isLightMode
                  ? 'hover:bg-slate-200 text-slate-600'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-cyan-300'
              }`}
              title={isMaximized ? (isEn ? 'Exit Fullscreen' : 'خروج از تمام‌صفحه') : isEn ? 'Fullscreen' : 'تمام‌صفحه'}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isLightMode
                  ? 'hover:bg-rose-100 text-slate-600 hover:text-rose-600'
                  : 'hover:bg-rose-950/40 text-slate-400 hover:text-rose-400'
              }`}
              title={isEn ? 'Close' : 'بستن'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Summary Bar */}
        <div
          className={`px-5 py-2.5 border-b text-xs flex items-center justify-between ${
            isLightMode ? 'bg-slate-100/70 border-slate-200 text-slate-600' : 'bg-slate-950/30 border-slate-800 text-slate-400'
          }`}
        >
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5 text-indigo-400" />
              <span>
                {attachments.length} {isEn ? (attachments.length === 1 ? 'file' : 'files') : 'فایل پیوست'}
              </span>
            </span>
            <span className="flex items-center gap-1.5 font-mono">
              <HardDrive className="w-3.5 h-3.5 text-slate-400" />
              <span>{formatFileSize(totalBytes)}</span>
            </span>
          </div>

          {attachments.length > 1 && (
            <button
              type="button"
              onClick={handleDownloadAll}
              className="sm:hidden text-indigo-400 hover:underline flex items-center gap-1"
            >
              <DownloadCloud className="w-3 h-3" />
              <span>{isEn ? 'Download All' : 'دانلود همه'}</span>
            </button>
          )}
        </div>

        {/* Modal Body / File List */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1 min-h-[160px]">
          {attachments.length === 0 ? (
            <div className="text-center py-10">
              <Paperclip className="w-10 h-10 text-slate-600 mx-auto mb-2 opacity-50" />
              <p className="text-sm text-slate-400">
                {isEn ? 'No files attached to this record.' : 'هیچ فایل پیوستی برای این مورد ثبت نشده است.'}
              </p>
            </div>
          ) : (
            attachments.map((file, idx) => {
              const previewable = canPreview(file);
              return (
                <div
                  key={file.id || idx}
                  className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                    isLightMode
                      ? 'bg-slate-50 hover:bg-slate-100/80 border-slate-200'
                      : 'bg-slate-950/50 hover:bg-slate-800/40 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`p-2.5 rounded-xl shrink-0 ${
                        isLightMode ? 'bg-white border border-slate-200 shadow-sm' : 'bg-slate-900 border border-slate-800'
                      }`}
                    >
                      {getFileIcon(file)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-semibold truncate text-slate-200" title={file.fileName}>
                        {file.fileName || `Attachment-${idx + 1}`}
                      </p>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1 flex-wrap">
                        <span className="font-mono">{formatFileSize(file.fileSize)}</span>
                        {file.uploadDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            <span>{file.uploadDate.split('T')[0]}</span>
                          </span>
                        )}
                        {file.fileType && (
                          <span className="px-1.5 py-0.2 rounded bg-slate-800/70 text-slate-400 text-[10px] uppercase font-mono">
                            {file.fileType.split('/')[1] || file.fileType}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions for this file */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {previewable && onPreviewFile && (
                      <button
                        type="button"
                        onClick={() => {
                          onPreviewFile(file);
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                          isLightMode
                            ? 'bg-white hover:bg-slate-100 text-indigo-700 border-indigo-200 shadow-sm'
                            : 'bg-indigo-950/40 hover:bg-indigo-900/50 text-indigo-300 border-indigo-800/60'
                        }`}
                        title={isEn ? 'Preview file' : 'پیش‌نمایش فایل'}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{isEn ? 'Preview' : 'مشاهده'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDownload(file)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        isLightMode
                          ? 'bg-slate-800 hover:bg-slate-900 text-white shadow-sm'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                      }`}
                      title={isEn ? `Download ${file.fileName}` : 'دانلود این فایل'}
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Download' : 'دانلود'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div
          className={`px-5 py-3 border-t flex items-center justify-end ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
              isLightMode
                ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
          >
            {isEn ? 'Close' : 'بستن'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
