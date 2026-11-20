import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  ShieldCheck,
  Globe,
  FileCode2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Upload,
  Clock,
  Mail,
  Bell,
  Server,
  Lock,
  Sparkles,
  Calendar,
  Info,
} from 'lucide-react';
import {
  SslCertificateItem,
  SslCertificateSourceType,
  SslCertificateEnvironment,
  SslCertificateProbeResult,
} from '../../types';
import {
  probeSslCertificateApi,
  createSslCertificateApi,
  updateSslCertificateApi,
} from '../../services/api';
import { useModalDock } from '../../context/ModalDockContext';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

interface SslCertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (certificate: SslCertificateItem) => void;
  editingCert?: SslCertificateItem | null;
  isLightMode?: boolean;
  isEn?: boolean;
}

const PORT_PRESETS = [
  { port: 443, label: '443 (HTTPS)' },
  { port: 8443, label: '8443 (Alt-HTTPS)' },
  { port: 465, label: '465 (SMTPS)' },
  { port: 993, label: '993 (IMAPS)' },
  { port: 636, label: '636 (LDAPS)' },
];

const INTERVAL_PRESETS = [
  { hours: 6, en: '6h', fa: '۶ ساعته' },
  { hours: 12, en: '12h', fa: '۱۲ ساعته' },
  { hours: 24, en: '24h (Daily)', fa: '۲۴ ساعته (روزانه)' },
  { hours: 48, en: '48h', fa: '۴۸ ساعته' },
  { hours: 168, en: '7d (Weekly)', fa: '۷ روزه (هفتگی)' },
];

export const SslCertificateModal: React.FC<SslCertificateModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  editingCert,
  isLightMode = false,
  isEn = true,
}) => {
  const { dockModal, undockModal } = useModalDock();
  const dockId = editingCert ? `ssl-cert-edit-${editingCert.id}` : 'ssl-cert-create';

  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isProbing, setIsProbing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [probeResult, setProbeResult] = useState<SslCertificateProbeResult | null>(null);

  // Core fields
  const [sourceType, setSourceType] = useState<SslCertificateSourceType>('domain');
  const [title, setTitle] = useState('');
  const [domain, setDomain] = useState('');
  const [port, setPort] = useState<number>(443);
  const [sniHost, setSniHost] = useState('');
  const [pemCertificate, setPemCertificate] = useState('');
  const [manualValidFrom, setManualValidFrom] = useState('');
  const [manualValidTo, setManualValidTo] = useState('');

  // Metadata & Scheduling
  const [environment, setEnvironment] = useState<SslCertificateEnvironment>('production');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [autoCheckEnabled, setAutoCheckEnabled] = useState(true);
  const [checkIntervalHours, setCheckIntervalHours] = useState<number>(24);
  const [alertDaysText, setAlertDaysText] = useState('60, 30, 14, 7, 3, 1, 0');
  const [notifyEmailsText, setNotifyEmailsText] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState('');
  const [runCheckOnSave, setRunCheckOnSave] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setIsMinimized(false);
    setErrorMsg(null);
    setProbeResult(null);

    if (editingCert) {
      setSourceType(editingCert.sourceType || 'domain');
      setTitle(editingCert.title || '');
      setDomain(editingCert.domain || '');
      setPort(editingCert.port || 443);
      setSniHost(editingCert.sniHost || '');
      setPemCertificate(editingCert.pemCertificate || '');
      setManualValidFrom(editingCert.validFrom ? editingCert.validFrom.slice(0, 10) : '');
      setManualValidTo(editingCert.validTo ? editingCert.validTo.slice(0, 10) : '');
      setEnvironment(editingCert.environment || 'production');
      setOwnerName(editingCert.ownerName || '');
      setOwnerEmail(editingCert.ownerEmail || '');
      setDepartment(editingCert.department || '');
      setAutoCheckEnabled(editingCert.autoCheckEnabled !== false);
      setCheckIntervalHours(editingCert.checkIntervalHours || 24);
      setAlertDaysText(
        Array.isArray(editingCert.alertDays) && editingCert.alertDays.length > 0
          ? editingCert.alertDays.join(', ')
          : '60, 30, 14, 7, 3, 1, 0'
      );
      setNotifyEmailsText(
        Array.isArray(editingCert.notifyEmails) ? editingCert.notifyEmails.join(', ') : ''
      );
      setIsActive(editingCert.isActive !== false);
      setNotes(editingCert.notes || '');
      setRunCheckOnSave(false);
    } else {
      setSourceType('domain');
      setTitle('');
      setDomain('');
      setPort(443);
      setSniHost('');
      setPemCertificate('');
      setManualValidFrom('');
      setManualValidTo('');
      setEnvironment('production');
      setOwnerName('');
      setOwnerEmail('');
      setDepartment('');
      setAutoCheckEnabled(true);
      setCheckIntervalHours(24);
      setAlertDaysText('60, 30, 14, 7, 3, 1, 0');
      setNotifyEmailsText('');
      setIsActive(true);
      setNotes('');
      setRunCheckOnSave(true);
    }
  }, [isOpen, editingCert]);

  useEffect(() => {
    return () => {
      undockModal(dockId);
    };
  }, [dockId, undockModal]);

  const handleMinimize = () => {
    setIsMinimized(true);
    dockModal({
      id: dockId,
      labelEn: editingCert ? `Edit SSL: ${editingCert.title}` : 'Add SSL Certificate',
      labelFa: editingCert ? `ویرایش SSL: ${editingCert.title}` : 'افزودن گواهینامه SSL',
      badge: 'SSL',
      category: 'config',
      onRestore: () => setIsMinimized(false),
      onClose: () => {
        setIsMinimized(false);
        onClose();
      },
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 64 * 1024) {
      setErrorMsg(
        isEn
          ? 'Certificate file exceeds 64 KB limit. Upload a standard PEM/CRT public certificate only.'
          : 'حجم فایل گواهینامه بیش از ۶۴ کیلوبایت است. لطفاً فقط فایل عمومی PEM/CRT استاندارد بارگذاری کنید.'
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '').trim();
      if (/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i.test(content)) {
        setErrorMsg(
          isEn
            ? 'Security block: Private keys are strictly rejected. Upload only the public certificate (BEGIN CERTIFICATE).'
            : 'مسدودسازی امنیتی: کلید خصوصی (Private Key) پذیرفته نمی‌شود. منحصراً گواهینامه عمومی (BEGIN CERTIFICATE) را وارد کنید.'
        );
        return;
      }
      setErrorMsg(null);
      setPemCertificate(content);
      if (!title.trim()) {
        setTitle(file.name.replace(/\.(pem|crt|cer|txt)$/i, ''));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleProbe = async () => {
    setErrorMsg(null);
    setProbeResult(null);

    if (sourceType === 'domain' && !domain.trim()) {
      setErrorMsg(
        isEn
          ? 'Enter a domain or hostname first (e.g., api.example.com).'
          : 'ابتدا نام دامنه یا هاست را وارد کنید (مثلاً api.example.com).'
      );
      return;
    }

    if (sourceType === 'manual_pem') {
      if (!pemCertificate.trim()) {
        setErrorMsg(
          isEn
            ? 'Paste or upload a PEM public certificate first to parse it.'
            : 'ابتدا متن گواهینامه عمومی PEM را وارد یا بارگذاری کنید.'
        );
        return;
      }
      if (/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i.test(pemCertificate)) {
        setErrorMsg(
          isEn
            ? 'Security block: Private keys are strictly rejected. Remove the PRIVATE KEY block.'
            : 'مسدودسازی امنیتی: کلید خصوصی مجاز نیست. لطفاً بخش PRIVATE KEY را حذف کنید.'
        );
        return;
      }
    }

    setIsProbing(true);
    try {
      const result = await probeSslCertificateApi({
        sourceType,
        domain: sourceType === 'domain' ? domain.trim() : undefined,
        port: sourceType === 'domain' ? Number(port) || 443 : undefined,
        sniHost: sourceType === 'domain' && sniHost.trim() ? sniHost.trim() : undefined,
        pemCertificate: sourceType === 'manual_pem' ? pemCertificate.trim() : undefined,
      });
      setProbeResult(result);

      if (result.success) {
        if (!title.trim()) {
          setTitle(result.subjectCN || result.domain || domain.trim());
        }
        if (result.validFrom) setManualValidFrom(result.validFrom.slice(0, 10));
        if (result.validTo) setManualValidTo(result.validTo.slice(0, 10));
      }
    } catch (err: any) {
      setErrorMsg(
        err?.message ||
          (isEn ? 'Failed to inspect SSL certificate.' : 'خطا در بررسی گواهینامه SSL.')
      );
    } finally {
      setIsProbing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (sourceType === 'domain' && !domain.trim()) {
      setErrorMsg(
        isEn
          ? 'Domain or hostname is required for live TLS monitoring.'
          : 'وارد کردن دامنه یا هاست برای پایش زنده TLS الزامی است.'
      );
      return;
    }

    if (sourceType === 'manual_pem') {
      if (!pemCertificate.trim() && !manualValidTo.trim()) {
        setErrorMsg(
          isEn
            ? 'Provide a PEM public certificate or specify an expiry date.'
            : 'متن گواهینامه PEM یا تاریخ انقضای دستی را وارد کنید.'
        );
        return;
      }
      if (pemCertificate && /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i.test(pemCertificate)) {
        setErrorMsg(
          isEn
            ? 'Security block: Private keys cannot be stored. Provide only the public certificate.'
            : 'مسدودسازی امنیتی: ذخیره کلید خصوصی مجاز نیست. فقط گواهینامه عمومی را وارد کنید.'
        );
        return;
      }
    }

    const parsedAlertDays = alertDaysText
      .split(/[\s,;]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 3650);

    const parsedEmails = notifyEmailsText
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes('@'));

    const payload: Partial<SslCertificateItem> & {
      runInitialCheck?: boolean;
      recheckAfterSave?: boolean;
    } = {
      title: title.trim() || domain.trim() || (isEn ? 'SSL Certificate' : 'گواهینامه SSL'),
      sourceType,
      domain: sourceType === 'domain' ? domain.trim() : domain.trim() || undefined,
      port: sourceType === 'domain' ? Number(port) || 443 : undefined,
      sniHost: sourceType === 'domain' ? sniHost.trim() || undefined : undefined,
      pemCertificate: sourceType === 'manual_pem' ? pemCertificate.trim() || undefined : undefined,
      validFrom:
        sourceType === 'manual_pem' && !pemCertificate.trim() && manualValidFrom
          ? new Date(`${manualValidFrom}T00:00:00.000Z`).toISOString()
          : undefined,
      validTo:
        sourceType === 'manual_pem' && !pemCertificate.trim() && manualValidTo
          ? new Date(`${manualValidTo}T23:59:59.000Z`).toISOString()
          : undefined,
      environment,
      ownerName: ownerName.trim() || undefined,
      ownerEmail: ownerEmail.trim() || undefined,
      department: department.trim() || undefined,
      autoCheckEnabled,
      checkIntervalHours: Math.max(1, Math.min(720, Number(checkIntervalHours) || 24)),
      alertDays: parsedAlertDays.length > 0 ? parsedAlertDays : [60, 30, 14, 7, 3, 1, 0],
      notifyEmails: parsedEmails,
      isActive,
      notes: notes.trim() || undefined,
    };

    if (editingCert) {
      payload.recheckAfterSave = runCheckOnSave;
    } else {
      payload.runInitialCheck = runCheckOnSave;
    }

    setIsSaving(true);
    try {
      const res = editingCert
        ? await updateSslCertificateApi(editingCert.id, payload)
        : await createSslCertificateApi(payload);
      undockModal(dockId);
      onSaved(res.certificate);
      onClose();
    } catch (err: any) {
      setErrorMsg(
        err?.message ||
          (isEn ? 'Failed to save SSL certificate.' : 'خطا در ذخیره گواهینامه SSL.')
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || isMinimized) return null;

  const inputClass = `w-full px-3 py-2 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500/40 ${
    isLightMode
      ? 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
      : 'bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500'
  }`;

  const labelClass = `flex items-center gap-1.5 text-xs font-semibold mb-1.5 ${
    isLightMode ? 'text-slate-700' : 'text-slate-300'
  }`;

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
            : 'w-full max-w-3xl max-h-full rounded-2xl'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-200 text-slate-900'
            : 'bg-slate-950 border-slate-800 text-slate-100'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0 ${
            isLightMode
              ? 'bg-white border-slate-200'
              : 'bg-slate-900/90 border-slate-800'
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
              <h2 className="text-sm md:text-base font-bold truncate">
                {editingCert
                  ? isEn
                    ? 'Edit SSL / TLS Certificate Monitor'
                    : 'ویرایش گواهینامه و پایشگر SSL / TLS'
                  : isEn
                    ? 'Add Domain or SSL / TLS Certificate'
                    : 'افزودن دامنه یا گواهینامه SSL / TLS'}
              </h2>
              <p className={`text-xs truncate ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'Monitor live HTTPS/TLS endpoints or register public X.509 PEM certificates for daily expiry tracking'
                  : 'پایش زنده دامنه‌های HTTPS/TLS یا ثبت گواهینامه عمومی X.509 جهت بررسی خودکار روزانه انقضا'}
              </p>
            </div>
          </div>

          {/* Mandatory 3-button header controls: Minimize, Fullscreen, Close */}
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {errorMsg && (
            <div
              className={`flex items-start gap-2.5 p-3.5 rounded-xl border text-xs ${
                isLightMode
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <span className="leading-relaxed">{errorMsg}</span>
            </div>
          )}

          {/* Source Type Switcher */}
          <div>
            <div className={labelClass}>
              <span>{isEn ? 'Certificate Source Mode' : 'روش معرفی گواهینامه SSL'}</span>
              <FieldInfoTooltip
                title={isEn ? 'Certificate Source Mode' : 'روش معرفی گواهینامه'}
                whatIsIt={
                  isEn
                    ? 'Choose whether to inspect a live TLS endpoint by domain/port or register an offline X.509 public PEM certificate.'
                    : 'تعیین می‌کند گواهینامه به صورت زنده از طریق اتصال TLS به دامنه بررسی شود یا به صورت دستی (فایل PEM عمومی) ثبت گردد.'
                }
                whyNeeded={
                  isEn
                    ? 'Live Domain mode automatically re-fetches renewed certificates daily; Manual PEM mode covers air-gapped or internal certificates.'
                    : 'حالت دامنه زنده پس از تمدید گواهینامه، تاریخ جدید را خودکار تشخیص می‌دهد؛ حالت دستی برای گواهینامه‌های داخلی یا آفلاین کاربرد دارد.'
                }
                practicalExample={
                  isEn
                    ? 'Use Live Domain for portal.company.com:443, or Manual PEM for an internal firewall CA cert.'
                    : 'برای portal.company.com:443 حالت دامنه زنده و برای گواهینامه داخلی فایروال حالت PEM دستی.'
                }
                isEn={isEn}
                isLightMode={isLightMode}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setSourceType('domain');
                  setProbeResult(null);
                  setErrorMsg(null);
                }}
                className={`flex items-center gap-3 p-3.5 rounded-xl border text-start transition-all cursor-pointer ${
                  sourceType === 'domain'
                    ? isLightMode
                      ? 'bg-cyan-50 border-cyan-500 text-cyan-900 shadow-sm'
                      : 'bg-cyan-500/15 border-cyan-500/60 text-cyan-100'
                    : isLightMode
                      ? 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <Globe className={`w-5 h-5 shrink-0 ${sourceType === 'domain' ? 'text-cyan-500' : ''}`} />
                <div className="min-w-0">
                  <div className="text-xs font-bold">
                    {isEn ? 'Live Domain / TLS Endpoint' : 'دامنه زنده / سرویس TLS'}
                  </div>
                  <div className="text-[11px] opacity-80">
                    {isEn
                      ? 'Real-time TLS handshake & daily auto-check'
                      : 'اتصال مستقیم TLS و بررسی روزانه خودکار'}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSourceType('manual_pem');
                  setProbeResult(null);
                  setErrorMsg(null);
                }}
                className={`flex items-center gap-3 p-3.5 rounded-xl border text-start transition-all cursor-pointer ${
                  sourceType === 'manual_pem'
                    ? isLightMode
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-900 shadow-sm'
                      : 'bg-indigo-500/15 border-indigo-500/60 text-indigo-100'
                    : isLightMode
                      ? 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <FileCode2 className={`w-5 h-5 shrink-0 ${sourceType === 'manual_pem' ? 'text-indigo-500' : ''}`} />
                <div className="min-w-0">
                  <div className="text-xs font-bold">
                    {isEn ? 'Upload / Paste PEM Certificate' : 'بارگذاری یا ثبت دستی گواهینامه PEM'}
                  </div>
                  <div className="text-[11px] opacity-80">
                    {isEn
                      ? 'Parse public X.509 PEM/CRT or set expiry date'
                      : 'استخراج خودکار تاریخ انقضا از PEM عمومی یا ثبت دستی'}
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Live Domain Section */}
          {sourceType === 'domain' && (
            <div
              className={`p-4 rounded-xl border space-y-4 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-6">
                  <label className={labelClass}>
                    <span>{isEn ? 'Domain / Hostname *' : 'نام دامنه یا آدرس هاست *'}</span>
                    <FieldInfoTooltip
                      title={isEn ? 'Domain / Hostname' : 'دامنه یا هاست'}
                      whatIsIt={
                        isEn
                          ? 'The DNS domain name or IP address serving the SSL/TLS certificate.'
                          : 'نام دامنه (FQDN) یا آدرس IP سروری که گواهینامه SSL روی آن فعال است.'
                      }
                      whyNeeded={
                        isEn
                          ? 'Used by the server to open a live TLS socket and inspect the active certificate chain and expiration date.'
                          : 'سرور از این آدرس برای برقراری اتصال TLS زنده و خواندن تاریخ انقضای واقعی گواهینامه استفاده می‌کند.'
                      }
                      practicalExample={
                        isEn
                          ? 'example.com, vpn.company.org, or https://mail.company.org:443'
                          : 'example.com یا vpn.company.ir یا https://mail.company.ir:443'
                      }
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="example.com or https://api.example.com"
                    className={inputClass}
                  />
                </div>

                <div className="md:col-span-3">
                  <label className={labelClass}>
                    <span>{isEn ? 'TLS Port' : 'پورت TLS'}</span>
                  </label>
                  <input
                    type="number"
                    dir="ltr"
                    min={1}
                    max={65535}
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value) || 443)}
                    className={inputClass}
                  />
                </div>

                <div className="md:col-span-3">
                  <label className={labelClass}>
                    <span>{isEn ? 'SNI Host (Optional)' : 'نام SNI (اختیاری)'}</span>
                    <FieldInfoTooltip
                      title={isEn ? 'SNI Servername' : 'نام میزبان SNI'}
                      whatIsIt={
                        isEn
                          ? 'Optional Server Name Indication header sent during the TLS handshake.'
                          : 'نام دامنه جایگزین ارسال‌شده در مرحله Handshake پروتکل TLS برای سرورهای چنددامنه‌ای.'
                      }
                      whyNeeded={
                        isEn
                          ? 'Useful when connecting directly to an internal IP address that hosts multiple virtual HTTPS sites.'
                          : 'زمانی که به یک IP داخلی متصل می‌شوید که چندین سایت HTTPS مختلف روی آن میزبانی می‌شود.'
                      }
                      practicalExample={
                        isEn ? 'Domain: 10.10.20.5, SNI: app.internal.local' : 'دامنه: 10.10.20.5 و SNI: app.internal.local'
                      }
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={sniHost}
                    onChange={(e) => setSniHost(e.target.value)}
                    placeholder="optional.domain.com"
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Port Quick Presets + Live Probe Button */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {PORT_PRESETS.map((p) => (
                    <button
                      key={p.port}
                      type="button"
                      onClick={() => setPort(p.port)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                        port === p.port
                          ? isLightMode
                            ? 'bg-cyan-100 border-cyan-400 text-cyan-900'
                            : 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                          : isLightMode
                            ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                            : 'bg-slate-800/70 border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleProbe}
                  disabled={isProbing || !domain.trim()}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isProbing ? 'animate-spin' : ''}`} />
                  {isProbing
                    ? isEn
                      ? 'Inspecting TLS...'
                      : 'در حال بررسی زنده TLS...'
                    : isEn
                      ? 'Test & Inspect Live SSL'
                      : 'تست و استعلام زنده SSL'}
                </button>
              </div>
            </div>
          )}

          {/* Manual PEM Section */}
          {sourceType === 'manual_pem' && (
            <div
              className={`p-4 rounded-xl border space-y-3 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className={labelClass}>
                  <span>{isEn ? 'Public Certificate (PEM / CRT)' : 'گواهینامه عمومی (PEM / CRT)'}</span>
                  <FieldInfoTooltip
                    title={isEn ? 'Public PEM Certificate' : 'گواهینامه عمومی PEM'}
                    whatIsIt={
                      isEn
                        ? 'The Base64-encoded public X.509 certificate starting with -----BEGIN CERTIFICATE-----.'
                        : 'متن رمزنگاری‌شده Base64 گواهینامه عمومی که با -----BEGIN CERTIFICATE----- شروع می‌شود.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Allows automatic extraction of Common Name, Issuer CA, SANs, Fingerprint, and exact expiration countdown.'
                        : 'باعث استخراج خودکار نام دامنه، صادرکننده (CA)، SANها، اثرانگشت و روزهای باقی‌مانده تا انقضا می‌شود.'
                    }
                    practicalExample={
                      isEn
                        ? 'Upload fullchain.pem or cert.crt. NEVER paste a Private Key.'
                        : 'فایل cert.crt یا fullchain.pem را بارگذاری کنید. هرگز کلید خصوصی وارد نکنید.'
                    }
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </label>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pem,.crt,.cer,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                        : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {isEn ? 'Upload .pem / .crt' : 'آپلود فایل .pem / .crt'}
                  </button>
                  <button
                    type="button"
                    onClick={handleProbe}
                    disabled={isProbing || !pemCertificate.trim()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-colors cursor-pointer"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${isProbing ? 'animate-spin' : ''}`} />
                    {isProbing
                      ? isEn
                        ? 'Parsing...'
                        : 'در حال تحلیل...'
                      : isEn
                        ? 'Parse PEM Now'
                        : 'استخراج مشخصات PEM'}
                  </button>
                </div>
              </div>

              <textarea
                dir="ltr"
                rows={5}
                value={pemCertificate}
                onChange={(e) => setPemCertificate(e.target.value)}
                placeholder={'-----BEGIN CERTIFICATE-----\nMIIF...\n-----END CERTIFICATE-----'}
                className={`${inputClass} font-mono text-xs`}
              />

              <div
                className={`flex items-center gap-2 text-[11px] px-3 py-2 rounded-lg border ${
                  isLightMode
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-amber-500/10 border-amber-500/25 text-amber-300'
                }`}
              >
                <Info className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isEn
                    ? 'Security notice: Upload only public certificates. Private keys are blocked automatically. If you do not have the PEM file, enter manual dates below.'
                    : 'نکته امنیتی: منحصراً گواهینامه عمومی را وارد کنید؛ کلیدهای خصوصی مسدود می‌شوند. در نبود فایل PEM می‌توانید تاریخ را دستی ثبت کنید.'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <label className={labelClass}>
                    <span>{isEn ? 'Associated Domain (Optional)' : 'دامنه مرتبط (اختیاری)'}</span>
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="internal.company.local"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    <span>{isEn ? 'Manual Valid From' : 'تاریخ شروع اعتبار (دستی)'}</span>
                  </label>
                  <input
                    type="date"
                    dir="ltr"
                    value={manualValidFrom}
                    onChange={(e) => setManualValidFrom(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    <span>{isEn ? 'Manual Expiry Date' : 'تاریخ انقضا (دستی)'}</span>
                  </label>
                  <input
                    type="date"
                    dir="ltr"
                    value={manualValidTo}
                    onChange={(e) => setManualValidTo(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Live Probe Preview Banner */}
          {probeResult && (
            <div
              className={`p-4 rounded-xl border text-xs space-y-2 ${
                probeResult.success
                  ? isLightMode
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  : isLightMode
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-bold">
                  {probeResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                  )}
                  <span>
                    {probeResult.success
                      ? isEn
                        ? 'Live Certificate Inspected Successfully'
                        : 'گواهینامه با موفقیت استعلام و بررسی شد'
                      : isEn
                        ? 'Certificate Inspection Failed'
                        : 'خطا در استعلام گواهینامه'}
                  </span>
                </div>
                {probeResult.success && typeof probeResult.daysRemaining === 'number' && (
                  <span
                    className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                      probeResult.daysRemaining <= 0
                        ? 'bg-rose-600 text-white'
                        : probeResult.daysRemaining <= 7
                          ? 'bg-rose-500/20 text-rose-500 border border-rose-500/40'
                          : probeResult.daysRemaining <= 30
                            ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/40'
                            : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/40'
                    }`}
                  >
                    {probeResult.daysRemaining <= 0
                      ? isEn
                        ? `Expired (${Math.abs(probeResult.daysRemaining)}d ago)`
                        : `منقضی شده (${Math.abs(probeResult.daysRemaining)} روز پیش)`
                      : isEn
                        ? `${probeResult.daysRemaining} days remaining`
                        : `${probeResult.daysRemaining} روز باقی‌مانده`}
                  </span>
                )}
              </div>

              {probeResult.success ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 opacity-90">
                  <div>
                    <div className="text-[10px] opacity-70">{isEn ? 'Subject CN' : 'نام گواهینامه (CN)'}</div>
                    <div className="font-mono font-semibold truncate" dir="ltr">
                      {probeResult.subjectCN || '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] opacity-70">{isEn ? 'Issuer CA' : 'صادرکننده (CA)'}</div>
                    <div className="font-semibold truncate">{probeResult.issuerOrg || probeResult.issuerCN || '—'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] opacity-70">{isEn ? 'Valid Until' : 'تاریخ انقضا'}</div>
                    <div className="font-mono font-semibold" dir="ltr">
                      {probeResult.validTo ? probeResult.validTo.slice(0, 10) : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] opacity-70">{isEn ? 'TLS & Trust' : 'پروتکل و اعتبار'}</div>
                    <div className="font-mono font-semibold" dir="ltr">
                      {probeResult.tlsProtocol || 'X.509'} •{' '}
                      {probeResult.selfSigned
                        ? 'Self-Signed'
                        : probeResult.authorized === false
                          ? 'Untrusted'
                          : 'Trusted'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="font-mono text-[11px]" dir="ltr">
                  {probeResult.error}
                </div>
              )}
            </div>
          )}

          {/* General Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>
                <span>{isEn ? 'Display Title *' : 'عنوان نمایشی *'}</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  isEn ? 'e.g. Production API Gateway SSL' : 'مثلاً گواهینامه SSL درگاه اصلی سایت'
                }
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>
                <span>{isEn ? 'Environment' : 'محیط استقرار'}</span>
              </label>
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value as SslCertificateEnvironment)}
                className={inputClass}
              >
                <option value="production">{isEn ? 'Production' : 'عملیاتی (Production)'}</option>
                <option value="staging">{isEn ? 'Staging / Pre-Prod' : 'آزمایشی (Staging)'}</option>
                <option value="internal">{isEn ? 'Internal Network' : 'شبکه داخلی (Internal)'}</option>
                <option value="edge">{isEn ? 'Edge / CDN / WAF' : 'لبه / CDN / فایروال'}</option>
                <option value="other">{isEn ? 'Other' : 'سایر'}</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>
                <span>{isEn ? 'Responsible Owner' : 'مسئول فنی / مالک سرویس'}</span>
              </label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder={isEn ? 'e.g. NetOps Team' : 'مثلاً تیم زیرساخت و شبکه'}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>
                <span>{isEn ? 'Owner Email' : 'ایمیل مسئول'}</span>
              </label>
              <input
                type="email"
                dir="ltr"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="netops@company.com"
                className={inputClass}
              />
            </div>
          </div>

          {/* Daily Auto-Check & Alerting Configuration */}
          <div
            className={`p-4 rounded-xl border space-y-4 ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-500" />
                <span className="text-xs font-bold">
                  {isEn ? 'Automated Daily Check & Expiry Alerts' : 'پایش خودکار دوره‌ای و هشدارهای انقضا'}
                </span>
                <FieldInfoTooltip
                  title={isEn ? 'Automated Periodic Check' : 'پایش خودکار دوره‌ای'}
                  whatIsIt={
                    isEn
                      ? 'Automatically checks this SSL certificate in the background according to the configured interval.'
                      : 'گواهینامه را به صورت خودکار در پس‌زمینه مطابق بازه زمانی تعیین‌شده (پیش‌فرض روزانه ۲۴ ساعت) بررسی می‌کند.'
                  }
                  whyNeeded={
                    isEn
                      ? 'Prevents unexpected HTTPS outages by updating remaining days and triggering email/in-app alerts before expiry.'
                      : 'از قطعی ناگهانی سرویس‌های HTTPS جلوگیری کرده و پیش از انقضا هشدار ایمیل و اعلان پنل ارسال می‌کند.'
                  }
                  practicalExample={
                    isEn
                      ? 'Keep enabled at 24h (Daily) with alert thresholds 60, 30, 14, 7, 3, 1, 0 days.'
                      : 'بازه ۲۴ ساعته (روزانه) با آستانه‌های هشدار ۶۰، ۳۰، ۱۴، ۷، ۳، ۱ و ۰ روز مانده.'
                  }
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>

              <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCheckEnabled}
                  onChange={(e) => setAutoCheckEnabled(e.target.checked)}
                  className="rounded border-slate-400 text-cyan-600 focus:ring-cyan-500"
                />
                <span>{isEn ? 'Enable Daily Auto-Check' : 'فعال‌سازی پایش خودکار'}</span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>
                  <span>{isEn ? 'Check Interval (Hours)' : 'فاصله بررسی خودکار (ساعت)'}</span>
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {INTERVAL_PRESETS.map((preset) => (
                    <button
                      key={preset.hours}
                      type="button"
                      onClick={() => setCheckIntervalHours(preset.hours)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                        checkIntervalHours === preset.hours
                          ? isLightMode
                            ? 'bg-cyan-100 border-cyan-400 text-cyan-900'
                            : 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                          : isLightMode
                            ? 'bg-slate-50 border-slate-200 text-slate-600'
                            : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      {isEn ? preset.en : preset.fa}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  dir="ltr"
                  min={1}
                  max={720}
                  value={checkIntervalHours}
                  onChange={(e) => setCheckIntervalHours(Number(e.target.value) || 24)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>
                  <span>{isEn ? 'Alert Thresholds (Days Before Expiry)' : 'آستانه‌های هشدار (روز مانده به انقضا)'}</span>
                  <FieldInfoTooltip
                    title={isEn ? 'Alert Threshold Days' : 'روزهای ارسال هشدار'}
                    whatIsIt={
                      isEn
                        ? 'Comma-separated list of remaining-day milestones at which email and panel alerts are dispatched.'
                        : 'لیست روزهای باقی‌مانده تا انقضا (جداشده با ویرگول) که در آن هشدار ایمیل و اعلان پنل ارسال می‌شود.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Gives operations teams staged reminders from 60 days out down to the final expiration day without spamming.'
                        : 'به تیم فنی یادآوری مرحله‌ای از ۶۰ روز قبل تا روز انقضا می‌دهد بدون اینکه ایمیل تکراری ارسال شود.'
                    }
                    practicalExample="60, 30, 14, 7, 3, 1, 0"
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={alertDaysText}
                  onChange={(e) => setAlertDaysText(e.target.value)}
                  placeholder="60, 30, 14, 7, 3, 1, 0"
                  className={inputClass}
                />
                <p className={`text-[11px] mt-1 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  {isEn
                    ? 'Comma-separated days (e.g. 60, 30, 14, 7, 3, 1, 0)'
                    : 'اعداد جداشده با کاما (مثلاً 60, 30, 14, 7, 3, 1, 0)'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>
                  <Mail className="w-3.5 h-3.5 text-cyan-500" />
                  <span>{isEn ? 'Alert Notification Emails' : 'ایمیل‌های دریافت هشدار انقضا'}</span>
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={notifyEmailsText}
                  onChange={(e) => setNotifyEmailsText(e.target.value)}
                  placeholder="noc@company.com, secops@company.com"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>
                  <span>{isEn ? 'Department / Team' : 'واحد / دپارتمان'}</span>
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder={isEn ? 'e.g. Infrastructure & Security' : 'مثلاً زیرساخت و امنیت'}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Notes & Options */}
          <div>
            <label className={labelClass}>
              <span>{isEn ? 'Notes & Renewal Instructions' : 'توضیحات و راهنمای تمدید'}</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                isEn
                  ? 'e.g. Renew via Certbot / ACME DNS-01 on Reverse Proxy #1...'
                  : 'مثلاً تمدید از طریق Certbot یا پنل شرکت صادرکننده روی ریورس پروکسی...'
              }
              className={inputClass}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-slate-400 text-emerald-600 focus:ring-emerald-500"
              />
              <span>
                {isEn ? 'Active monitoring item' : 'پایش این گواهینامه فعال باشد'}
              </span>
            </label>

            <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={runCheckOnSave}
                onChange={(e) => setRunCheckOnSave(e.target.checked)}
                className="rounded border-slate-400 text-cyan-600 focus:ring-cyan-500"
              />
              <span>
                {isEn
                  ? 'Inspect certificate immediately upon save'
                  : 'بلافاصله پس از ذخیره، بررسی زنده انجام شود'}
              </span>
            </label>
          </div>
        </form>

        {/* Footer */}
        <div
          className={`flex items-center justify-end gap-2.5 px-5 py-3.5 border-t shrink-0 ${
            isLightMode
              ? 'bg-white border-slate-200'
              : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
              isLightMode
                ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {isEn ? 'Cancel' : 'انصراف'}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 disabled:opacity-60 text-white shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
          >
            {isSaving ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="w-4 h-4" />
            )}
            {isSaving
              ? isEn
                ? 'Saving & Checking...'
                : 'در حال ذخیره و بررسی...'
              : editingCert
                ? isEn
                  ? 'Save Changes'
                  : 'ذخیره تغییرات'
                : isEn
                  ? 'Add SSL Certificate'
                  : 'ثبت گواهینامه SSL'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
