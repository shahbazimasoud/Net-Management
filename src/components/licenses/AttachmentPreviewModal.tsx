import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Maximize2,
  Minimize2,
  Download,
  FileText,
  FileCode,
  Image as ImageIcon,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCw,
  AlertCircle
} from 'lucide-react';
import { AttachmentFile } from '../../types';

interface AttachmentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: AttachmentFile | null;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const AttachmentPreviewModal: React.FC<AttachmentPreviewModalProps> = ({
  isOpen,
  onClose,
  file,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotation, setRotation] = useState(0);

  if (!isOpen || !file) return null;

  const isPdf =
    file.fileType?.toLowerCase().includes('pdf') ||
    file.fileName?.toLowerCase().endsWith('.pdf');

  const isImage =
    file.fileType?.toLowerCase().startsWith('image/') ||
    /\.(png|jpe?g|gif|webp|svg)$/i.test(file.fileName);

  const isText =
    file.fileType?.toLowerCase().startsWith('text/') ||
    /\.(txt|json|log|csv|md)$/i.test(file.fileName);

  // Construct source URL
  let srcUrl = '';
  if (file.downloadUrl) {
    srcUrl = file.downloadUrl;
  } else if (file.dataBase64) {
    srcUrl = file.dataBase64.startsWith('data:')
      ? file.dataBase64
      : `data:${file.fileType || 'application/octet-stream'};base64,${file.dataBase64}`;
  } else if (file.id) {
    srcUrl = `/api/licenses-contracts/download/${encodeURIComponent(file.id)}`;
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const handleDownload = () => {
    if (!srcUrl) return;
    const link = document.createElement('a');
    link.href = srcUrl;
    link.download = file.fileName || 'attachment';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return createPortal(
    <div
      className={
        isMaximized
          ? 'fixed top-0 left-0 right-0 bottom-8 z-[999995] p-0 flex flex-col'
          : 'fixed top-0 left-0 right-0 bottom-8 z-[999995] p-2 sm:p-4 bg-black/80 backdrop-blur-sm flex items-center justify-center'
      }
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`flex flex-col transition-all duration-200 shadow-2xl ${
          isMaximized
            ? 'w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-5xl max-h-[88vh] rounded-2xl border'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-300 text-slate-800'
            : 'bg-slate-950 border-slate-800 text-slate-100'
        }`}
      >
        {/* Modal Header */}
        <div
          className={`flex items-center justify-between px-5 py-3 border-b shrink-0 ${
            isLightMode ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900/80'
          }`}
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
              {isPdf ? (
                <FileText className="w-5 h-5 text-rose-400" />
              ) : isImage ? (
                <ImageIcon className="w-5 h-5 text-emerald-400" />
              ) : (
                <FileCode className="w-5 h-5 text-indigo-400" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold truncate flex items-center gap-2">
                <span>{file.fileName}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {formatFileSize(file.fileSize)}
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                {file.fileType || (isPdf ? 'application/pdf' : 'Document file')}
                {file.uploadDate && ` • ${new Date(file.uploadDate).toLocaleDateString()}`}
              </p>
            </div>
          </div>

          {/* Action and Control buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            {isImage && (
              <>
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.2))}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    isLightMode ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-slate-800 text-slate-400'
                  }`}
                  title={isEn ? 'Zoom Out' : 'کوچک‌نمایی'}
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.min(3, z + 0.2))}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    isLightMode ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-slate-800 text-slate-400'
                  }`}
                  title={isEn ? 'Zoom In' : 'بزرگ‌نمایی'}
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    isLightMode ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-slate-800 text-slate-400'
                  }`}
                  title={isEn ? 'Rotate' : 'چرخش'}
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              </>
            )}

            {srcUrl && (
              <button
                type="button"
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-colors cursor-pointer"
                title={isEn ? 'Download File' : 'دانلود فایل'}
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{isEn ? 'Download' : 'دانلود'}</span>
              </button>
            )}

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

        {/* Modal Content / Preview Area */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-950/60 min-h-[350px]">
          {isPdf ? (
            <div className="w-full h-full min-h-[500px] flex flex-col rounded-xl overflow-hidden border border-slate-800 bg-slate-900 shadow-inner">
              <iframe
                src={`${srcUrl}#toolbar=1&navpanes=0`}
                className="w-full h-full flex-1 border-none rounded-xl"
                title={file.fileName}
              />
            </div>
          ) : isImage ? (
            <div className="w-full h-full flex items-center justify-center overflow-auto p-2">
              <img
                src={srcUrl}
                alt={file.fileName}
                style={{
                  transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
                  transition: 'transform 0.2s ease-out',
                }}
                className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-xl"
              />
            </div>
          ) : isText && file.dataBase64 ? (
            <div className="w-full h-full max-h-[70vh] overflow-auto p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed">
              {(() => {
                try {
                  const cleaned = file.dataBase64.replace(/^data:.*?;base64,/, '');
                  return atob(cleaned);
                } catch {
                  return isEn ? 'Binary text content could not be decoded.' : 'قالب متنی فایل قابل خواندن نیست.';
                }
              })()}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
              <div className="p-4 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <FileText className="w-12 h-12" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-200">
                  {isEn ? 'Direct Preview Not Supported' : 'پیش‌نمایش مستقیم این پسوند در دسترس نیست'}
                </h3>
                <p className="text-xs text-slate-400 max-w-md mt-1">
                  {isEn
                    ? 'This file type cannot be previewed natively in the browser frame. Please download the document to open it with your local application.'
                    : 'امکان رندر مستقیم این فرمت در مرورگر وجود ندارد. لطفاً فایل را دانلود و در نرم‌افزار مربوطه مشاهده فرمایید.'}
                </p>
              </div>
              {srcUrl && (
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>{isEn ? 'Download File' : 'دانلود مستقیم فایل'}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
