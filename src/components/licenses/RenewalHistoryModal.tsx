import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  History,
  X,
  Minus,
  Maximize2,
  Minimize2,
  Calendar,
  DollarSign,
  FileText,
  Download,
  Eye,
  CheckCircle2,
  Clock,
  RotateCw,
  ArrowRight,
  ArrowLeft,
  Building2,
  ShieldCheck,
  Tag,
  AlertCircle
} from 'lucide-react';
import { LicenseItem, ContractItem, AttachmentFile } from '../../types';
import { fetchLicenseHistoryApi, fetchContractHistoryApi } from '../../services/api';
import { useModalDock } from '../../context/ModalDockContext';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

interface RenewalHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'license' | 'contract';
  item: LicenseItem | ContractItem | null;
  isLightMode?: boolean;
  isEn?: boolean;
  onPreviewAttachment?: (attachment: AttachmentFile) => void;
}

export const RenewalHistoryModal: React.FC<RenewalHistoryModalProps> = ({
  isOpen,
  onClose,
  type,
  item,
  isLightMode = false,
  isEn = true,
  onPreviewAttachment,
}) => {
  const { dockModal } = useModalDock();
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [historyItems, setHistoryItems] = useState<(LicenseItem | ContractItem)[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !item) return;

    let isMounted = true;
    const loadHistory = async () => {
      setLoading(true);
      setError(null);
      try {
        if (type === 'license') {
          const res = await fetchLicenseHistoryApi(item.id);
          if (isMounted) setHistoryItems(res.history || []);
        } else {
          const res = await fetchContractHistoryApi(item.id);
          if (isMounted) setHistoryItems(res.history || []);
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Failed to load renewal history');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadHistory();
    return () => {
      isMounted = false;
    };
  }, [isOpen, item, type]);

  if (!isOpen || isMinimized || !item) return null;

  const handleMinimize = () => {
    dockModal({
      id: `history-modal-${item.id}`,
      labelEn: `History: ${item.title}`,
      labelFa: `سوابق: ${item.title}`,
      badge: 'Hist',
      category: 'tools',
      onRestore: () => setIsMinimized(false),
      onClose: () => {
        setIsMinimized(false);
        onClose();
      },
    });
    setIsMinimized(true);
  };

  const formatCost = (val?: number, curr?: string) => {
    if (val === undefined || val === null || val === 0) return isEn ? 'Free / Included' : 'رایگان / بدون هزینه';
    return `${val.toLocaleString()} ${curr || 'IRR'}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            {isEn ? 'Active' : 'معتبر و فعال'}
          </span>
        );
      case 'renewed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <RotateCw className="w-3 h-3" />
            {isEn ? 'Renewed' : 'تمدید شده'}
          </span>
        );
      case 'expiring_soon':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3" />
            {isEn ? 'Expiring Soon' : 'نزدیک انقضا'}
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle className="w-3 h-3" />
            {isEn ? 'Expired' : 'منقضی شده'}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">
            {status}
          </span>
        );
    }
  };

  const modalContent = (
    <div className="fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div
        className={`flex flex-col rounded-2xl shadow-2xl transition-all duration-200 border overflow-hidden ${
          isMaximized
            ? 'w-full h-full max-w-none max-h-none rounded-none'
            : 'w-full max-w-4xl max-h-[90vh]'
        } ${
          isLightMode
            ? 'bg-white border-slate-200 text-slate-800'
            : 'bg-slate-900 border-slate-800 text-slate-100'
        }`}
        dir={isEn ? 'ltr' : 'rtl'}
      >
        {/* Header */}
        <div
          className={`px-6 py-4 border-b flex items-center justify-between select-none ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-lg leading-tight">
                  {isEn ? 'Renewal & Version History Chain' : 'سوابق تمدید و زنجیره تاریخی نسخه‌ها'}
                </h3>
                <span className="px-2 py-0.5 text-xs rounded font-mono font-medium bg-cyan-500/20 text-cyan-300">
                  {type === 'license' ? (isEn ? 'License' : 'لایسنس') : (isEn ? 'Contract' : 'قرارداد')}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xl">
                {item.title}
              </p>
            </div>
          </div>

          {/* Triad Control Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleMinimize}
              className={`p-1.5 rounded-lg transition-colors ${
                isLightMode ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-slate-800 text-slate-400'
              }`}
              title={isEn ? 'Minimize to ToolsDock' : 'مینیمایز به نوار داک'}
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className={`p-1.5 rounded-lg transition-colors ${
                isLightMode ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-slate-800 text-slate-400'
              }`}
              title={isMaximized ? (isEn ? 'Restore Window' : 'حالت عادی') : (isEn ? 'Fullscreen' : 'تمام‌صفحه')}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg transition-colors hover:bg-rose-500/20 text-slate-400 hover:text-rose-400"
              title={isEn ? 'Close' : 'بستن'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Summary Banner */}
          <div
            className={`p-4 rounded-xl border flex items-center justify-between ${
              isLightMode
                ? 'bg-cyan-50/50 border-cyan-200 text-cyan-900'
                : 'bg-cyan-950/20 border-cyan-800/40 text-cyan-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <RotateCw className="w-6 h-6 text-cyan-400 shrink-0" />
              <div>
                <h4 className="text-sm font-semibold">
                  {isEn ? 'Complete Historical Audit Trail' : 'ردگیری کامل سوابق و تعهدات مالی'}
                </h4>
                <p className="text-xs opacity-80 mt-0.5">
                  {isEn
                    ? 'All previous contract and license cycles are preserved intact with historical terms, prices, and attached signed documents.'
                    : 'کلیه دوره‌های گذشته قرارداد و لایسنس به همراه مبالغ، فایل‌های پیوست و الحاقیه‌های امضاشده بدون تغییر بایگانی شده‌اند.'}
                </p>
              </div>
            </div>
            <div className="text-center px-4 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
              <span className="text-xs block text-slate-400">
                {isEn ? 'Total Cycles' : 'تعداد دوره‌ها'}
              </span>
              <span className="text-lg font-bold text-cyan-400 font-mono">
                {historyItems.length || 1}
              </span>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <RotateCw className="w-8 h-8 animate-spin text-cyan-400 mb-3" />
              <p className="text-sm">{isEn ? 'Loading version history chain...' : 'در حال بارگذاری زنجیره سوابق...'}</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : historyItems.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <History className="w-12 h-12 mx-auto text-slate-600 mb-3" />
              <p className="text-sm">
                {isEn ? 'No previous renewal cycles found for this item.' : 'هیچ دوره تمدید قبلی برای این مورد ثبت نشده است.'}
              </p>
            </div>
          ) : (
            <div className="relative pl-6 pr-6 space-y-6 before:absolute before:inset-y-0 before:left-8 before:w-0.5 before:bg-cyan-500/20">
              {historyItems.map((hItem, index) => {
                const isCurrent = hItem.id === item.id;
                const cycleNum = index + 1;
                const costVal = (hItem as any).totalCost !== undefined ? (hItem as any).totalCost : (hItem as any).cost;
                const currVal = (hItem as any).currency || 'IRR';
                const attachments = hItem.attachments || [];

                return (
                  <div
                    key={hItem.id}
                    className={`relative p-5 rounded-xl border transition-all ${
                      isCurrent
                        ? isLightMode
                          ? 'bg-cyan-50/60 border-cyan-400 ring-2 ring-cyan-400/20'
                          : 'bg-cyan-950/20 border-cyan-500/40 ring-1 ring-cyan-500/20'
                        : isLightMode
                        ? 'bg-slate-50 border-slate-200'
                        : 'bg-slate-950/40 border-slate-800'
                    }`}
                  >
                    {/* Timeline bullet */}
                    <div
                      className={`absolute -left-10 top-6 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold font-mono border ${
                        isCurrent
                          ? 'bg-cyan-500 text-slate-950 border-cyan-300 ring-4 ring-cyan-500/20'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {cycleNum}
                    </div>

                    <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-base text-slate-100 flex items-center gap-2">
                            {hItem.title}
                          </h4>
                          {isCurrent && (
                            <span className="px-2 py-0.5 text-xs rounded font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                              {isEn ? 'Current Selection' : 'انتخاب فعلی'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          {type === 'contract'
                            ? `${isEn ? 'Contract #' : 'شماره قرارداد: '} ${(hItem as ContractItem).contractNumber || '—'}`
                            : `${isEn ? 'Key: ' : 'کلید لایسنس: '} ${(hItem as LicenseItem).licenseKey || '—'}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(hItem.status)}
                      </div>
                    </div>

                    {/* Metric Cards Row */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 my-3">
                      <div className={`p-3 rounded-lg border text-xs ${isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
                        <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                          <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                          <span>{isEn ? 'Validity Period' : 'دوره زمانی اعتبار'}</span>
                        </div>
                        <p className="font-mono font-medium text-slate-200">
                          {hItem.startDate} <span className="text-slate-500">→</span> {hItem.endDate}
                        </p>
                      </div>

                      <div className={`p-3 rounded-lg border text-xs ${isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
                        <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                          <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{isEn ? 'Agreed Cost' : 'مبلغ و هزینه دوره'}</span>
                        </div>
                        <p className="font-medium text-emerald-400">
                          {formatCost(costVal, currVal)}
                        </p>
                      </div>

                      <div className={`p-3 rounded-lg border text-xs ${isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
                        <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                          <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                          <span>{isEn ? 'Vendor / Partner' : 'شرکت پیمانکار / طرف قرارداد'}</span>
                        </div>
                        <p className="font-medium text-slate-200 truncate">
                          {type === 'contract' ? (hItem as ContractItem).vendorName : (hItem as LicenseItem).vendor}
                        </p>
                      </div>
                    </div>

                    {/* Notes */}
                    {hItem.notes && (
                      <p className="text-xs text-slate-400 italic bg-black/20 p-2.5 rounded-lg border border-slate-800/40 my-2">
                        {hItem.notes}
                      </p>
                    )}

                    {/* Attached Files Section */}
                    {attachments.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-800/60">
                        <span className="text-xs font-semibold text-slate-400 block mb-2">
                          {isEn ? `Attached Documents (${attachments.length})` : `اسناد و فایل‌های پیوست (${attachments.length})`}
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {attachments.map((att) => (
                            <div
                              key={att.id}
                              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs ${
                                isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                              }`}
                            >
                              <FileText className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                              <span className="max-w-[160px] truncate" title={att.fileName}>
                                {att.fileName}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                {(att.fileSize / 1024).toFixed(0)} KB
                              </span>
                              <div className="flex items-center gap-1 ml-1">
                                {onPreviewAttachment && (
                                  <button
                                    onClick={() => onPreviewAttachment(att)}
                                    className="p-1 rounded hover:bg-cyan-500/20 text-cyan-400"
                                    title={isEn ? 'Preview' : 'پیش‌نمایش'}
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <a
                                  href={`/api/licenses-contracts/download/${att.id}`}
                                  download={att.fileName}
                                  className="p-1 rounded hover:bg-slate-700 text-slate-300"
                                  title={isEn ? 'Download' : 'دانلود'}
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`px-6 py-3 border-t flex items-center justify-between ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}
        >
          <div className="text-xs text-slate-400">
            {isEn ? 'Preserved under Mandatory Audit Trail Policy' : 'نگهداری شده تحت خط‌مشی حسابرسی و لاگ‌های امنیتی'}
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-medium rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            {isEn ? 'Close Window' : 'بستن پنجره'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
