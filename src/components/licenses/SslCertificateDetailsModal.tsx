import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Globe,
  FileCode2,
  RefreshCw,
  Copy,
  Check,
  Download,
  Clock,
  Layers,
  History,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  KeyRound,
  Mail,
} from 'lucide-react';
import { SslCertificateItem } from '../../types';
import { useModalDock } from '../../context/ModalDockContext';

interface SslCertificateDetailsModalProps {
  certificate: SslCertificateItem | null;
  onClose: () => void;
  onCheckNow?: (cert: SslCertificateItem) => Promise<void>;
  isChecking?: boolean;
  canCheck?: boolean;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const SslCertificateDetailsModal: React.FC<SslCertificateDetailsModalProps> = ({
  certificate,
  onClose,
  onCheckNow,
  isChecking = false,
  canCheck = false,
  isLightMode = false,
  isEn = true,
}) => {
  const { dockModal, undockModal } = useModalDock();
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'chain' | 'history' | 'pem'>('overview');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const dockId = certificate ? `ssl-cert-details-${certificate.id}` : 'ssl-cert-details';

  useEffect(() => {
    if (certificate) {
      setIsMinimized(false);
    }
  }, [certificate?.id]);

  useEffect(() => {
    return () => {
      undockModal(dockId);
    };
  }, [dockId, undockModal]);

  if (!certificate || isMinimized) return null;

  const handleMinimize = () => {
    setIsMinimized(true);
    dockModal({
      id: dockId,
      labelEn: `SSL Inspector: ${certificate.title}`,
      labelFa: `جزئیات SSL: ${certificate.title}`,
      badge: 'SSL',
      category: 'tools',
      onRestore: () => setIsMinimized(false),
      onClose: () => {
        setIsMinimized(false);
        onClose();
      },
    });
  };

  const handleCopy = (label: string, value?: string) => {
    if (!value) return;
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 1800);
  };

  const handleDownloadPem = () => {
    if (!certificate.pemCertificate) return;
    const blob = new Blob([certificate.pemCertificate], { type: 'application/x-pem-file' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (certificate.domain || certificate.title || 'certificate')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .slice(0, 60);
    a.download = `${safeName}.pem`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const formatDateTime = (iso?: string) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleString(isEn ? 'en-US' : 'fa-IR', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const statusMeta = (() => {
    switch (certificate.status) {
      case 'valid':
        return {
          label: isEn ? 'Valid & Healthy' : 'معتبر و سالم',
          badgeClass: isLightMode
            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
          icon: CheckCircle2,
        };
      case 'expiring_soon':
        return {
          label: isEn ? 'Expiring Soon' : 'نزدیک به انقضا',
          badgeClass: isLightMode
            ? 'bg-amber-100 text-amber-800 border-amber-300'
            : 'bg-amber-500/15 text-amber-300 border-amber-500/35',
          icon: AlertTriangle,
        };
      case 'critical':
        return {
          label: isEn ? 'Critical Expiry' : 'انقضای بحرانی',
          badgeClass: isLightMode
            ? 'bg-rose-100 text-rose-800 border-rose-300'
            : 'bg-rose-500/15 text-rose-300 border-rose-500/35',
          icon: ShieldAlert,
        };
      case 'expired':
        return {
          label: isEn ? 'Expired' : 'منقضی شده',
          badgeClass: isLightMode
            ? 'bg-rose-600 text-white border-rose-700'
            : 'bg-rose-600/85 text-white border-rose-500',
          icon: XCircle,
        };
      case 'check_failed':
        return {
          label: isEn ? 'Check Failed' : 'خطا در بررسی',
          badgeClass: isLightMode
            ? 'bg-red-100 text-red-800 border-red-300'
            : 'bg-red-500/15 text-red-300 border-red-500/35',
          icon: XCircle,
        };
      default:
        return {
          label: isEn ? 'Inactive' : 'غیرفعال',
          badgeClass: isLightMode
            ? 'bg-slate-200 text-slate-700 border-slate-300'
            : 'bg-slate-800 text-slate-400 border-slate-700',
          icon: Clock,
        };
    }
  })();

  const StatusIcon = statusMeta.icon;
  const cardBg = isLightMode
    ? 'bg-white border-slate-200'
    : 'bg-slate-900/70 border-slate-800';

  return createPortal(
    <div
      dir={isEn ? 'ltr' : 'rtl'}
      className="fixed top-0 left-0 right-0 bottom-8 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 md:p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`flex flex-col overflow-hidden border shadow-2xl transition-all duration-200 ${
          isMaximized
            ? 'w-full h-full rounded-xl'
            : 'w-full max-w-4xl max-h-full rounded-2xl'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-200 text-slate-900'
            : 'bg-slate-950 border-slate-800 text-slate-100'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                isLightMode
                  ? 'bg-cyan-50 text-cyan-700 border border-cyan-200'
                  : 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
              }`}
            >
              <Lock className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm md:text-base font-bold truncate">{certificate.title}</h2>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${statusMeta.badgeClass}`}
                >
                  <StatusIcon className="w-3 h-3" />
                  {statusMeta.label}
                </span>
              </div>
              <p className={`text-xs font-mono truncate ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`} dir="ltr">
                {certificate.sourceType === 'domain'
                  ? `${certificate.domain || '—'}:${certificate.port || 443}${certificate.sniHost ? ` (SNI: ${certificate.sniHost})` : ''}`
                  : isEn
                    ? `Manual X.509 PEM Certificate${certificate.domain ? ` • ${certificate.domain}` : ''}`
                    : `گواهینامه دستی X.509 PEM${certificate.domain ? ` • ${certificate.domain}` : ''}`}
              </p>
            </div>
          </div>

          {/* Mandatory 3-button controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleMinimize}
              title={isEn ? 'Minimize to Dock' : 'کوچک‌نمایی در نوار پایین'}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isLightMode
                  ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsMaximized((prev) => !prev)}
              title={
                isMaximized
                  ? isEn
                    ? 'Exit Fullscreen'
                    : 'خروج از تمام‌صفحه'
                  : isEn
                    ? 'Fullscreen'
                    : 'تمام‌صفحه'
              }
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isLightMode
                  ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Close' : 'بستن'}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isLightMode
                  ? 'text-slate-500 hover:bg-rose-50 hover:text-rose-600'
                  : 'text-slate-400 hover:bg-rose-500/15 hover:text-rose-400'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sub-navigation Tabs */}
        <div
          className={`flex items-center gap-1 px-5 pt-2.5 border-b shrink-0 overflow-x-auto ${
            isLightMode ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-900/50 border-slate-800'
          }`}
        >
          {[
            { id: 'overview', icon: ShieldCheck, en: 'X.509 & TLS Overview', fa: 'مشخصات X.509 و TLS' },
            {
              id: 'chain',
              icon: Layers,
              en: `Certificate Chain (${certificate.chainSummary?.length || 0})`,
              fa: `زنجیره گواهینامه (${certificate.chainSummary?.length || 0})`,
            },
            {
              id: 'history',
              icon: History,
              en: `Check History (${certificate.checkHistory?.length || 0})`,
              fa: `تاریخچه بررسی‌ها (${certificate.checkHistory?.length || 0})`,
            },
            { id: 'pem', icon: FileCode2, en: 'Public PEM', fa: 'متن عمومی PEM' },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'border-cyan-500 text-cyan-500'
                    : isLightMode
                      ? 'border-transparent text-slate-600 hover:text-slate-900'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {isEn ? tab.en : tab.fa}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {certificate.lastCheckError && (
            <div
              className={`flex items-start gap-2.5 p-3.5 rounded-xl border text-xs ${
                isLightMode
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <div>
                <div className="font-bold mb-0.5">
                  {isEn ? 'Last Check Error' : 'خطای آخرین بررسی زنده'}
                </div>
                <div className="font-mono text-[11px]" dir="ltr">
                  {certificate.lastCheckError}
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'overview' && (
            <>
              {/* Countdown & Trust Hero Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className={`p-4 rounded-xl border ${cardBg}`}>
                  <div className={`text-[11px] font-semibold mb-1 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isEn ? 'Remaining Validity' : 'زمان باقی‌مانده تا انقضا'}
                  </div>
                  <div className="text-2xl font-extrabold">
                    {typeof certificate.daysRemaining === 'number'
                      ? certificate.daysRemaining < 0
                        ? isEn
                          ? `${Math.abs(certificate.daysRemaining)}d expired`
                          : `${Math.abs(certificate.daysRemaining)} روز گذشته`
                        : isEn
                          ? `${certificate.daysRemaining} days`
                          : `${certificate.daysRemaining} روز`
                      : '—'}
                  </div>
                  <div className={`text-[11px] mt-1 font-mono ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`} dir="ltr">
                    {certificate.validTo ? `Expires: ${certificate.validTo.slice(0, 10)}` : '—'}
                  </div>
                </div>

                <div className={`p-4 rounded-xl border ${cardBg}`}>
                  <div className={`text-[11px] font-semibold mb-1 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isEn ? 'Trust & Verification' : 'اعتبار و زنجیره اعتماد'}
                  </div>
                  <div className="text-sm font-bold flex items-center gap-1.5">
                    {certificate.selfSigned ? (
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                    ) : certificate.authorized === false ? (
                      <XCircle className="w-4 h-4 text-rose-500" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    )}
                    <span>
                      {certificate.selfSigned
                        ? isEn
                          ? 'Self-Signed Certificate'
                          : 'گواهینامه خودامضا (Self-Signed)'
                        : certificate.authorized === false
                          ? isEn
                            ? 'Untrusted Chain'
                            : 'زنجیره نامعتبر (Untrusted)'
                          : isEn
                            ? 'Trusted Public CA'
                            : 'تاییدشده توسط CA معتبر'}
                    </span>
                  </div>
                  {certificate.authorizationError && (
                    <div className="text-[11px] text-rose-400 font-mono mt-1 truncate" dir="ltr">
                      {certificate.authorizationError}
                    </div>
                  )}
                </div>

                <div className={`p-4 rounded-xl border ${cardBg}`}>
                  <div className={`text-[11px] font-semibold mb-1 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isEn ? 'Protocol & Cryptography' : 'پروتکل و کلید رمزنگاری'}
                  </div>
                  <div className="text-sm font-bold font-mono" dir="ltr">
                    {certificate.tlsProtocol || 'X.509'}
                    {certificate.keyAlgorithm
                      ? ` • ${certificate.keyAlgorithm.toUpperCase()}${certificate.keySize ? ` ${certificate.keySize}-bit` : ''}`
                      : ''}
                  </div>
                  <div className={`text-[11px] font-mono mt-1 truncate ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`} dir="ltr">
                    {certificate.cipherName || (isEn ? 'Offline PEM inspection' : 'بررسی آفلاین PEM')}
                  </div>
                </div>
              </div>

              {/* Detailed X.509 Fields */}
              <div className={`p-4 rounded-xl border ${cardBg}`}>
                <h3 className="text-xs font-bold uppercase tracking-wider mb-3 opacity-75">
                  {isEn ? 'X.509 Certificate Identity & Metadata' : 'مشخصات هویتی گواهینامه X.509'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {[
                    {
                      k: isEn ? 'Subject Common Name (CN)' : 'نام اصلی گواهینامه (Subject CN)',
                      v: certificate.subjectCN,
                      mono: true,
                    },
                    {
                      k: isEn ? 'Subject Organization' : 'سازمان صاحب گواهینامه',
                      v: certificate.subjectOrg,
                    },
                    {
                      k: isEn ? 'Issuer CN / Authority' : 'صادرکننده (Issuer CN)',
                      v: certificate.issuerCN,
                    },
                    {
                      k: isEn ? 'Issuer Organization' : 'سازمان صادرکننده (CA)',
                      v: certificate.issuerOrg,
                    },
                    {
                      k: isEn ? 'Valid From (Not Before)' : 'تاریخ شروع اعتبار',
                      v: formatDateTime(certificate.validFrom),
                    },
                    {
                      k: isEn ? 'Valid Until (Not After)' : 'تاریخ انقضا',
                      v: formatDateTime(certificate.validTo),
                    },
                    {
                      k: isEn ? 'Serial Number' : 'شماره سریال',
                      v: certificate.serialNumber,
                      mono: true,
                    },
                    {
                      k: isEn ? 'Last Checked At' : 'زمان آخرین بررسی',
                      v: certificate.lastCheckedAt
                        ? `${formatDateTime(certificate.lastCheckedAt)}${
                            certificate.lastCheckDurationMs ? ` (${certificate.lastCheckDurationMs}ms)` : ''
                          }`
                        : '—',
                    },
                  ].map((row, idx) => (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-lg border ${
                        isLightMode ? 'bg-slate-50 border-slate-200/80' : 'bg-slate-950/60 border-slate-800'
                      }`}
                    >
                      <div className={`text-[10px] font-semibold mb-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        {row.k}
                      </div>
                      <div
                        className={`font-semibold break-all ${row.mono ? 'font-mono text-[11px]' : ''}`}
                        dir={row.mono ? 'ltr' : undefined}
                      >
                        {row.v || '—'}
                      </div>
                    </div>
                  ))}
                </div>

                {/* SHA-256 Fingerprint */}
                {certificate.fingerprintSha256 && (
                  <div
                    className={`mt-3 p-3 rounded-lg border flex items-center justify-between gap-2 ${
                      isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className={`text-[10px] font-semibold mb-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        {isEn ? 'SHA-256 Fingerprint' : 'اثرانگشت SHA-256'}
                      </div>
                      <div className="font-mono text-[11px] break-all" dir="ltr">
                        {certificate.fingerprintSha256}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy('fp', certificate.fingerprintSha256)}
                      className={`p-1.5 rounded-lg shrink-0 transition-colors cursor-pointer ${
                        isLightMode ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-slate-800 text-slate-300'
                      }`}
                      title={isEn ? 'Copy Fingerprint' : 'کپی اثرانگشت'}
                    >
                      {copiedField === 'fp' ? (
                        <Check className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* SANs */}
              {certificate.sans && certificate.sans.length > 0 && (
                <div className={`p-4 rounded-xl border ${cardBg}`}>
                  <div className="text-xs font-bold mb-2.5 flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-cyan-500" />
                    <span>
                      {isEn
                        ? `Subject Alternative Names (${certificate.sans.length})`
                        : `دامنه‌های تحت پوشش (SANs - ${certificate.sans.length})`}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto" dir="ltr">
                    {certificate.sans.map((san, idx) => (
                      <span
                        key={idx}
                        className={`px-2 py-0.5 rounded-md font-mono text-[11px] border ${
                          isLightMode
                            ? 'bg-slate-100 border-slate-200 text-slate-700'
                            : 'bg-slate-800 border-slate-700 text-cyan-300'
                        }`}
                      >
                        {san}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Monitoring & Ownership */}
              <div className={`p-4 rounded-xl border ${cardBg}`}>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <div className={`text-[10px] font-semibold ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {isEn ? 'Schedule & Alert Days' : 'زمان‌بندی و آستانه هشدار'}
                    </div>
                    <div className="font-semibold mt-0.5">
                      {certificate.autoCheckEnabled !== false
                        ? isEn
                          ? `Auto every ${certificate.checkIntervalHours || 24}h`
                          : `خودکار هر ${certificate.checkIntervalHours || 24} ساعت`
                        : isEn
                          ? 'Manual checks only'
                          : 'فقط بررسی دستی'}
                    </div>
                    <div className="text-[11px] opacity-75 font-mono mt-0.5" dir="ltr">
                      Days: {(certificate.alertDays || [60, 30, 14, 7, 3, 1, 0]).join(', ')}
                    </div>
                  </div>
                  <div>
                    <div className={`text-[10px] font-semibold ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {isEn ? 'Owner / Department' : 'مسئول / دپارتمان'}
                    </div>
                    <div className="font-semibold mt-0.5">
                      {certificate.ownerName || '—'}
                      {certificate.department ? ` (${certificate.department})` : ''}
                    </div>
                    {certificate.ownerEmail && (
                      <div className="text-[11px] opacity-75 font-mono" dir="ltr">
                        {certificate.ownerEmail}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className={`text-[10px] font-semibold ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {isEn ? 'Alert Recipients' : 'گیرندگان ایمیل هشدار'}
                    </div>
                    <div className="text-[11px] font-mono mt-0.5 break-all" dir="ltr">
                      {certificate.notifyEmails && certificate.notifyEmails.length > 0
                        ? certificate.notifyEmails.join(', ')
                        : certificate.ownerEmail || '—'}
                    </div>
                  </div>
                </div>
                {certificate.notes && (
                  <div
                    className={`mt-3 pt-3 border-t text-xs whitespace-pre-wrap ${
                      isLightMode ? 'border-slate-200 text-slate-600' : 'border-slate-800 text-slate-300'
                    }`}
                  >
                    {certificate.notes}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Chain Tab */}
          {activeSubTab === 'chain' && (
            <div className="space-y-3">
              {!certificate.chainSummary || certificate.chainSummary.length === 0 ? (
                <div className={`p-8 text-center rounded-xl border text-xs ${cardBg}`}>
                  {isEn
                    ? 'No certificate chain metadata captured yet. Run a live TLS check to inspect the full chain.'
                    : 'هنوز اطلاعات زنجیره گواهینامه ثبت نشده است. برای مشاهده زنجیره کامل، بررسی زنده اجرا کنید.'}
                </div>
              ) : (
                certificate.chainSummary.map((entry, idx) => (
                  <div key={idx} className={`p-4 rounded-xl border ${cardBg}`}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="inline-flex items-center gap-2 text-xs font-bold">
                        <span className="w-6 h-6 rounded-full bg-cyan-500/15 text-cyan-500 flex items-center justify-center text-[11px] font-mono">
                          {idx + 1}
                        </span>
                        {idx === 0
                          ? isEn
                            ? 'Leaf (Server) Certificate'
                            : 'گواهینامه سرور (Leaf)'
                          : idx === certificate.chainSummary!.length - 1
                            ? isEn
                              ? 'Root / Top CA Certificate'
                              : 'گواهینامه ریشه / بالاترین CA'
                            : isEn
                              ? 'Intermediate CA Certificate'
                              : 'گواهینامه میانی (Intermediate CA)'}
                      </span>
                      <span className="text-[11px] font-mono opacity-75" dir="ltr">
                        {entry.validTo ? `Exp: ${entry.validTo.slice(0, 10)}` : ''}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="opacity-60">{isEn ? 'Subject: ' : 'موضوع: '}</span>
                        <span className="font-mono font-semibold" dir="ltr">
                          {entry.subject}
                        </span>
                      </div>
                      <div>
                        <span className="opacity-60">{isEn ? 'Issuer: ' : 'صادرکننده: '}</span>
                        <span className="font-mono font-semibold" dir="ltr">
                          {entry.issuer}
                        </span>
                      </div>
                    </div>
                    {entry.fingerprintSha256 && (
                      <div className="mt-1.5 text-[10px] font-mono opacity-70 break-all" dir="ltr">
                        SHA-256: {entry.fingerprintSha256}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Check History Tab */}
          {activeSubTab === 'history' && (
            <div className="space-y-2">
              {!certificate.checkHistory || certificate.checkHistory.length === 0 ? (
                <div className={`p-8 text-center rounded-xl border text-xs ${cardBg}`}>
                  {isEn
                    ? 'No check history recorded yet.'
                    : 'هنوز تاریخچه‌ای از بررسی‌های این گواهینامه ثبت نشده است.'}
                </div>
              ) : (
                certificate.checkHistory.map((entry, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-xs ${cardBg}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {entry.status === 'check_failed' || entry.status === 'expired' ? (
                        <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                      ) : entry.status === 'critical' || entry.status === 'expiring_soon' ? (
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold flex items-center gap-2 flex-wrap">
                          <span>{formatDateTime(entry.checkedAt)}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-500/15">
                            {entry.triggeredBy || 'system'}
                          </span>
                          {entry.durationMs !== undefined && (
                            <span className="text-[10px] font-mono opacity-70">{entry.durationMs}ms</span>
                          )}
                        </div>
                        {entry.error && (
                          <div className="text-[11px] text-rose-400 font-mono mt-0.5" dir="ltr">
                            {entry.error}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[11px]" dir="ltr">
                      {entry.tlsProtocol && <span className="opacity-75">{entry.tlsProtocol}</span>}
                      <span className="font-bold">
                        {typeof entry.daysRemaining === 'number' ? `${entry.daysRemaining}d` : 'N/A'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* PEM Tab */}
          {activeSubTab === 'pem' && (
            <div className={`p-4 rounded-xl border space-y-3 ${cardBg}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-cyan-500" />
                  <span>{isEn ? 'Public X.509 PEM Certificate' : 'متن عمومی گواهینامه PEM'}</span>
                </div>
                {certificate.pemCertificate && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopy('pem', certificate.pemCertificate)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                          : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      {copiedField === 'pem' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {isEn ? 'Copy PEM' : 'کپی PEM'}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadPem}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {isEn ? 'Download .pem' : 'دانلود فایل .pem'}
                    </button>
                  </div>
                )}
              </div>
              {certificate.pemCertificate ? (
                <pre
                  dir="ltr"
                  className={`p-3 rounded-lg font-mono text-[11px] overflow-x-auto max-h-80 border ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-800'
                      : 'bg-slate-950 border-slate-800 text-cyan-200'
                  }`}
                >
                  {certificate.pemCertificate}
                </pre>
              ) : (
                <div className="text-xs opacity-70 py-6 text-center">
                  {isEn
                    ? 'Public PEM body is not stored yet. Run a live TLS check to capture the public certificate.'
                    : 'متن عمومی PEM هنوز ذخیره نشده است. برای دریافت آن یک بررسی زنده اجرا کنید.'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`flex items-center justify-between gap-2 px-5 py-3 border-t shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="text-[11px] opacity-70">
            {certificate.updatedBy &&
              (isEn
                ? `Updated by ${certificate.updatedBy}`
                : `آخرین ویرایش توسط ${certificate.updatedBy}`)}
          </div>
          <div className="flex items-center gap-2">
            {canCheck && onCheckNow && (
              <button
                type="button"
                onClick={() => onCheckNow(certificate)}
                disabled={isChecking}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                {isChecking
                  ? isEn
                    ? 'Checking...'
                    : 'در حال بررسی...'
                  : isEn
                    ? 'Run Live Check Now'
                    : 'اجرای بررسی زنده'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                  : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
              }`}
            >
              {isEn ? 'Close' : 'بستن'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
