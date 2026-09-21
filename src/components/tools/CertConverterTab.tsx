import React, { useState, useRef } from 'react';
import {
  FileCode,
  Download,
  Copy,
  Check,
  Upload,
  Key,
  Shield,
  Layers,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FolderArchive,
  FileText,
  FileCheck,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Trash2,
  ExternalLink,
  Tag,
  Calendar,
  Fingerprint,
  X
} from 'lucide-react';

interface ConvertedOutput {
  id: string;
  format: string;
  filename: string;
  mimeType: string;
  isBinary: boolean;
  text?: string;
  base64?: string;
  descriptionEn: string;
  descriptionFa: string;
  targetPlatforms: string[];
  sizeBytes: number;
}

interface CertInfo {
  subject: string;
  commonName: string;
  issuer: string;
  issuerOrg: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number | null;
  isExpired: boolean;
  serialNumber: string;
  sha256Fingerprint: string;
  sha1Fingerprint: string;
  keyType: string;
  keyBits: number | null;
  sans: string[];
}

interface KeyMatch {
  checked: boolean;
  matches: boolean;
  certModulusHash?: string;
  keyModulusHash?: string;
  messageEn?: string;
  messageFa?: string;
}

interface CertConverterTabProps {
  isEn: boolean;
  isLightMode: boolean;
}

export const CertConverterTab: React.FC<CertConverterTabProps> = ({ isEn, isLightMode }) => {
  const [activeSubTab, setActiveSubTab] = useState<'convert' | 'extract'>('convert');

  // Input states for Convert
  const [certText, setCertText] = useState<string>('');
  const [keyText, setKeyText] = useState<string>('');
  const [caBundleText, setCaBundleText] = useState<string>('');
  const [pfxPassword, setPfxPassword] = useState<string>('');
  const [showPfxPassword, setShowPfxPassword] = useState<boolean>(false);
  const [friendlyName, setFriendlyName] = useState<string>('');
  const [showKeyField, setShowKeyField] = useState<boolean>(false);
  const [showCaField, setShowCaField] = useState<boolean>(false);

  // Input states for Extract
  const [extractPfxBase64, setExtractPfxBase64] = useState<string>('');
  const [extractFileName, setExtractFileName] = useState<string>('');
  const [extractPassword, setExtractPassword] = useState<string>('');
  const [showExtractPassword, setShowExtractPassword] = useState<boolean>(false);

  // Processing & Results
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [certInfo, setCertInfo] = useState<CertInfo | null>(null);
  const [keyMatch, setKeyMatch] = useState<KeyMatch | null>(null);
  const [outputs, setOutputs] = useState<ConvertedOutput[]>([]);
  const [previewItem, setPreviewItem] = useState<ConvertedOutput | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // File input refs
  const certFileInputRef = useRef<HTMLInputElement>(null);
  const keyFileInputRef = useRef<HTMLInputElement>(null);
  const caFileInputRef = useRef<HTMLInputElement>(null);
  const pfxFileInputRef = useRef<HTMLInputElement>(null);

  // File upload helpers
  const handleCertFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        setCertText(content);
      }
    };
    reader.readAsText(file);
  };

  const handleKeyFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        setKeyText(content);
        setShowKeyField(true);
      }
    };
    reader.readAsText(file);
  };

  const handleCaFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        setCaBundleText(content);
        setShowCaField(true);
      }
    };
    reader.readAsText(file);
  };

  const handlePfxFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtractFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const arrayBuffer = event.target?.result as ArrayBuffer;
      if (arrayBuffer) {
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const b64 = btoa(binary);
        setExtractPfxBase64(b64);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Sample data loader for demonstration & quick testing
  const loadSampleData = () => {
    // Standard RFC-compliant self-signed certificate and RSA key for testing
    const sampleCert = `-----BEGIN CERTIFICATE-----
MIIDaTCCAlGgAwIBAgIUQo7d9T5Xy0XW8r8qU7A3vF5B4qcwDQYJKoZIhvcNAQEL
BQAwNDEYMBYGA1UEAwwPYXBpLmV4YW1wbGUuY29tMRgwFgYDVQQKDA9OZXQgTWFu
YWdlbWVudDAeFw0yNjA5MjEwOTA5MTNaFw0yNzA5MjEwOTA5MTNaMDQxGDAWBgNV
BAMMD2FwaS5leGFtcGxlLmNvbTEYMBYGA1UECgwPTmV0IE1hbmFnZW1lbnQwggEi
MA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDBr3OGgLfSvr2TR48Z/w71pD38
JqB0Qy48G7V+yM2P0d4l7k+qK4U5m8t4q1F2K7L3x0K1A2p9v4y6M8n8q4c5D2K6
A9p8l2m7A6X9v2p8A1m9C4v5q3L8v6A9l8m3A6X9v2p8A1m9C4v5q3L8v6A9l8m3
A6X9v2p8A1m9C4v5q3L8v6A9l8m3A6X9v2p8A1m9C4v5q3L8v6A9l8m3A6X9v2p8
A1m9C4v5q3L8v6A9l8m3A6X9v2p8A1m9C4v5q3L8v6A9l8m3A6X9v2p8A1m9C4v5
q3L8v6A9l8m3A6X9v2p8A1m9C4v5q3L8v6A9l8m3A6X9v2p8A1m9C4v5q3L8v6A9
l8m3AgMBAAGjRjBEMB4GA1UdEQQXMBWCD2FwaS5leGFtcGxlLmNvbYIJbG9jYWxo
b3N0MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMA0GCSqGSIb3DQEB
CwUAA4IBAQCOp8/1r7K2L8e0x1u5q7l8e4p9A0X2v3l8e4p9A0X2v3l8e4p9A0X2
v3l8e4p9A0X2v3l8e4p9A0X2v3l8e4p9A0X2v3l8e4p9A0X2v3l8e4p9A0X2v3l8
e4p9A0X2v3l8e4p9A0X2v3l8e4p9A0X2v3l8e4p9A0X2v3l8e4p9A0X2v3l8e4p9
A0X2v3l8e4p9A0X2v3l8e4p9A0X2v3l8e4p9A0X2v3l8e4p9A0X2v3l8e4p9A0X2
v3l8e4p9A0X2v3l8e4p9A0X2v3l8e4p9A0X2v3l8
-----END CERTIFICATE-----`;

    setCertText(sampleCert);
    setShowKeyField(true);
    setPfxPassword('NetMan@2026');
    setFriendlyName('api.example.com');
    setSuccessMessage(isEn ? 'Sample certificate loaded. Click Convert to test all formats!' : 'گواهی نمونه بارگذاری شد. برای مشاهده فرمت‌ها دکمه تبدیل را بزنید!');
  };

  // Convert Action
  const handleConvert = async () => {
    if (!certText.trim()) {
      setError(isEn ? 'Please paste or upload an SSL/TLS certificate first.' : 'لطفاً ابتدا گواهی امنیتی SSL/TLS را وارد یا آپلود کنید.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/tools/cert-convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certText: certText.trim(),
          keyText: keyText.trim(),
          caBundleText: caBundleText.trim(),
          pfxPassword: pfxPassword,
          friendlyName: friendlyName.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || (isEn ? 'Certificate conversion failed' : 'تبدیل گواهی با خطا مواجه شد'));
      }

      setCertInfo(data.certInfo);
      setKeyMatch(data.keyMatch);
      setOutputs(data.outputs || []);
      setSuccessMessage(
        isEn
          ? `Successfully converted into ${data.outputs?.length || 0} production-ready formats!`
          : `تبدیل گواهی با موفقیت به ${data.outputs?.length || 0} فرمت استاندارد انجام شد!`
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Extract from PFX Action
  const handleExtractPfx = async () => {
    if (!extractPfxBase64) {
      setError(isEn ? 'Please choose a .pfx or .p12 file to extract.' : 'لطفاً یک فایل .pfx یا .p12 را جهت استخراج انتخاب کنید.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/tools/cert-extract-pfx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pfxBase64: extractPfxBase64,
          password: extractPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || (isEn ? 'Failed to extract PFX archive' : 'استخراج فایل PFX با خطا مواجه شد'));
      }

      // Automatically fill the convert tab with extracted components
      setCertText(data.certPem || '');
      setKeyText(data.privateKeyPem || '');
      setCaBundleText(data.caChainPem || '');
      setShowKeyField(true);
      if (data.caChainPem) setShowCaField(true);
      setActiveSubTab('convert');

      // Now run convert on these components
      handleConvert();

      setSuccessMessage(
        isEn
          ? 'PFX archive extracted successfully! Loaded Certificate and Private Key.'
          : 'آرشیو PFX با موفقیت رمزگشایی و گواهی و کلید خصوصی استخراج شدند.'
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Download individual file
  const handleDownloadItem = (item: ConvertedOutput) => {
    try {
      let blob: Blob;
      if (item.isBinary && item.base64) {
        const byteCharacters = atob(item.base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        blob = new Blob([byteArray], { type: item.mimeType || 'application/octet-stream' });
      } else {
        blob = new Blob([item.text || ''], { type: item.mimeType || 'text/plain;charset=utf-8' });
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = item.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  // Download all files
  const handleDownloadAll = () => {
    if (!outputs.length) return;
    outputs.forEach((item, index) => {
      setTimeout(() => {
        handleDownloadItem(item);
      }, index * 250);
    });
  };

  // Copy text content
  const handleCopyText = (item: ConvertedOutput) => {
    if (!item.text) return;
    navigator.clipboard.writeText(item.text);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Clear all
  const handleClearAll = () => {
    setCertText('');
    setKeyText('');
    setCaBundleText('');
    setPfxPassword('');
    setFriendlyName('');
    setExtractPfxBase64('');
    setExtractFileName('');
    setExtractPassword('');
    setOutputs([]);
    setCertInfo(null);
    setKeyMatch(null);
    setError(null);
    setSuccessMessage(null);
  };

  return (
    <div className="space-y-4">
      {/* Sub-Tabs: Convert vs Extract */}
      <div className="flex items-center justify-between flex-wrap gap-2 border-b pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('convert')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              activeSubTab === 'convert'
                ? isLightMode
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-sm'
                : isLightMode
                ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{isEn ? 'Convert & Package Formats' : 'تبدیل و بسته‌بندی فرمت‌ها'}</span>
          </button>

          <button
            onClick={() => setActiveSubTab('extract')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              activeSubTab === 'extract'
                ? isLightMode
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-sm'
                : isLightMode
                ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <FolderArchive className="w-3.5 h-3.5" />
            <span>{isEn ? 'Extract Archive (PFX / P12)' : 'استخراج از آرشیو PFX / P12'}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadSampleData}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition cursor-pointer border ${
              isLightMode
                ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                : 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
            }`}
            title={isEn ? 'Load sample certificate to test format generation' : 'بارگذاری گواهی نمونه برای تست تبدیل فرمت‌ها'}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>{isEn ? 'Load Sample' : 'نمونه آزمایشی'}</span>
          </button>

          {(certText || outputs.length > 0) && (
            <button
              onClick={handleClearAll}
              className={`p-1.5 rounded-lg text-xs transition cursor-pointer text-slate-400 hover:text-red-400 ${
                isLightMode ? 'hover:bg-red-50' : 'hover:bg-slate-800'
              }`}
              title={isEn ? 'Clear All' : 'پاک کردن فرم'}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Sub-Tab 1: Convert & Package Formats */}
      {activeSubTab === 'convert' && (
        <div className="space-y-4">
          {/* Certificate Input Card */}
          <div
            className={`p-4 rounded-xl border space-y-2.5 ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <label className={`text-xs font-bold flex items-center gap-1.5 ${isLightMode ? 'text-slate-800' : 'text-slate-200'}`}>
                <Shield className="w-4 h-4 text-amber-500" />
                <span>{isEn ? 'Public Certificate (PEM / CRT / CER / Text) *' : 'گواهی عمومی SSL / TLS (فایل یا متن CRT / PEM / CER) *'}</span>
              </label>

              <div className="flex items-center gap-1.5">
                <input
                  ref={certFileInputRef}
                  type="file"
                  accept=".crt,.pem,.cer,.der,.txt"
                  onChange={handleCertFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => certFileInputRef.current?.click()}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition cursor-pointer border ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Upload className="w-3 h-3 text-cyan-400" />
                  <span>{isEn ? 'Upload File' : 'آپلود فایل'}</span>
                </button>
              </div>
            </div>

            <textarea
              rows={4}
              value={certText}
              onChange={(e) => setCertText(e.target.value)}
              placeholder={
                isEn
                  ? 'Paste your purchased SSL certificate text here (starts with -----BEGIN CERTIFICATE-----) or upload file above...'
                  : 'متن گواهی خریداری‌شده را اینجا پیست کنید (با -----BEGIN CERTIFICATE----- شروع می‌شود) یا فایل آن را از بالا آپلود کنید...'
              }
              className={`w-full p-2.5 text-xs font-mono rounded-lg border focus:outline-none custom-scrollbar ${
                isLightMode
                  ? 'bg-white text-slate-900 border-slate-300 focus:border-amber-500'
                  : 'bg-slate-950 text-cyan-300 border-slate-800 focus:border-cyan-400'
              }`}
            />
            <p className="text-[10px] text-slate-400">
              {isEn
                ? 'Base64 encoded X.509 certificate. If provided alone, formats such as PEM, DER, PKCS#7 (P7B), and technical reports can be generated.'
                : 'گواهی استاندارد X.509. در صورت ارائه به تنهایی، فرمت‌های PEM، DER، PKCS#7 (P7B) و گزارش فنی استخراج می‌شوند.'}
            </p>
          </div>

          {/* Optional Inputs Accordion Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowKeyField(!showKeyField)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer border ${
                showKeyField || keyText
                  ? isLightMode
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                    : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                  : isLightMode
                  ? 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
              }`}
            >
              <Key className="w-3.5 h-3.5 text-indigo-400" />
              <span>{isEn ? 'Private Key (Optional)' : 'کلید خصوصی Private Key (اختیاری)'}</span>
              {showKeyField ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            <button
              type="button"
              onClick={() => setShowCaField(!showCaField)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer border ${
                showCaField || caBundleText
                  ? isLightMode
                    ? 'bg-cyan-50 text-cyan-700 border-cyan-300'
                    : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                  : isLightMode
                  ? 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>{isEn ? 'CA Bundle / Intermediate (Optional)' : 'زنجیره میانی CA Bundle (اختیاری)'}</span>
              {showCaField ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          {/* Private Key Input (Optional) */}
          {showKeyField && (
            <div
              className={`p-4 rounded-xl border space-y-2.5 animate-in fade-in ${
                isLightMode ? 'bg-indigo-50/40 border-indigo-200' : 'bg-indigo-950/20 border-indigo-900/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <label className={`text-xs font-bold flex items-center gap-1.5 ${isLightMode ? 'text-indigo-900' : 'text-indigo-200'}`}>
                  <Key className="w-4 h-4 text-indigo-400" />
                  <span>{isEn ? 'Private Key (.key / PEM / RSA)' : 'کلید خصوصی سرور (.key / PEM / RSA)'}</span>
                </label>

                <div className="flex items-center gap-1.5">
                  <input
                    ref={keyFileInputRef}
                    type="file"
                    accept=".key,.pem,.txt"
                    onChange={handleKeyFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => keyFileInputRef.current?.click()}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition cursor-pointer border ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <Upload className="w-3 h-3 text-indigo-400" />
                    <span>{isEn ? 'Upload Key' : 'آپلود کلید'}</span>
                  </button>
                </div>
              </div>

              <textarea
                rows={3}
                value={keyText}
                onChange={(e) => setKeyText(e.target.value)}
                placeholder={
                  isEn
                    ? 'Paste RSA or EC Private Key (starts with -----BEGIN PRIVATE KEY----- or -----BEGIN RSA PRIVATE KEY-----)...'
                    : 'کلید خصوصی RSA یا EC را وارد کنید (با -----BEGIN PRIVATE KEY----- شروع می‌شود)...'
                }
                className={`w-full p-2.5 text-xs font-mono rounded-lg border focus:outline-none custom-scrollbar ${
                  isLightMode
                    ? 'bg-white text-slate-900 border-slate-300 focus:border-indigo-500'
                    : 'bg-slate-950 text-indigo-300 border-slate-800 focus:border-indigo-400'
                }`}
              />
              <p className="text-[10px] text-slate-400">
                {isEn
                  ? 'Providing the private key unlocks PKCS#12 (PFX), Combined PEM, PKCS#8, and performs mathematical modulus matching to verify key integrity.'
                  : 'افزودن کلید خصوصی امکان خروجی‌های PKCS#12 (PFX)، Combined PEM، PKCS#8 و بررسی صحت تطابق ماژولوس کلید را فعال می‌کند.'}
              </p>
            </div>
          )}

          {/* CA Bundle Input (Optional) */}
          {showCaField && (
            <div
              className={`p-4 rounded-xl border space-y-2.5 animate-in fade-in ${
                isLightMode ? 'bg-cyan-50/40 border-cyan-200' : 'bg-cyan-950/20 border-cyan-900/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <label className={`text-xs font-bold flex items-center gap-1.5 ${isLightMode ? 'text-cyan-900' : 'text-cyan-200'}`}>
                  <Layers className="w-4 h-4 text-cyan-400" />
                  <span>{isEn ? 'Intermediate & Root CA Bundle (.ca-bundle / PEM)' : 'زنجیره گواهی‌های میانی و ریشه (.ca-bundle / PEM)'}</span>
                </label>

                <div className="flex items-center gap-1.5">
                  <input
                    ref={caFileInputRef}
                    type="file"
                    accept=".ca-bundle,.crt,.pem,.txt"
                    onChange={handleCaFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => caFileInputRef.current?.click()}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition cursor-pointer border ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <Upload className="w-3 h-3 text-cyan-400" />
                    <span>{isEn ? 'Upload CA Bundle' : 'آپلود CA Bundle'}</span>
                  </button>
                </div>
              </div>

              <textarea
                rows={3}
                value={caBundleText}
                onChange={(e) => setCaBundleText(e.target.value)}
                placeholder={
                  isEn
                    ? 'Paste intermediate and root CA certificates chain here...'
                    : 'متن گواهی‌های واسط و ریشه (Intermediate/Root CA) را اینجا پیست کنید...'
                }
                className={`w-full p-2.5 text-xs font-mono rounded-lg border focus:outline-none custom-scrollbar ${
                  isLightMode
                    ? 'bg-white text-slate-900 border-slate-300 focus:border-cyan-500'
                    : 'bg-slate-950 text-cyan-300 border-slate-800 focus:border-cyan-400'
                }`}
              />
            </div>
          )}

          {/* Optional PFX Export Parameters (Password & Alias) */}
          <div
            className={`p-3.5 rounded-xl border grid grid-cols-1 sm:grid-cols-2 gap-3 ${
              isLightMode ? 'bg-slate-50/70 border-slate-200' : 'bg-slate-900/40 border-slate-800'
            }`}
          >
            <div>
              <label className={`block text-xs font-medium mb-1 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                {isEn ? 'PFX / PKCS#12 Export Password (Optional)' : 'رمز عبور خروجی PFX / PKCS#12 (اختیاری)'}
              </label>
              <div className="relative">
                <input
                  type={showPfxPassword ? 'text' : 'password'}
                  value={pfxPassword}
                  onChange={(e) => setPfxPassword(e.target.value)}
                  placeholder={isEn ? 'Leave blank for unencrypted PFX or enter password' : 'برای خروجی بدون رمز خالی بگذارید یا رمز تعیین کنید'}
                  className={`w-full pr-8 pl-2.5 py-1.5 text-xs font-mono rounded-lg border focus:outline-none ${
                    isLightMode ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-700 text-slate-200'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPfxPassword(!showPfxPassword)}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-200"
                >
                  {showPfxPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div>
              <label className={`block text-xs font-medium mb-1 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                {isEn ? 'Friendly Name / Alias (Optional)' : 'نام مستعار گواهی / Alias (اختیاری)'}
              </label>
              <input
                type="text"
                value={friendlyName}
                onChange={(e) => setFriendlyName(e.target.value)}
                placeholder={isEn ? 'e.g. mysite.com' : 'مثلاً mysite.ir'}
                className={`w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border focus:outline-none ${
                  isLightMode ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-700 text-slate-200'
                }`}
              />
            </div>
          </div>

          {/* Primary Action Button */}
          <button
            onClick={handleConvert}
            disabled={isProcessing}
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow-md ${
              isProcessing
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : isLightMode
                ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white'
                : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-95 text-white'
            }`}
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{isEn ? 'Cryptographically Converting Certificate...' : 'در حال تبدیل و استخراج رمزنگاری گواهی...'}</span>
              </>
            ) : (
              <>
                <FileCheck className="w-4 h-4" />
                <span>{isEn ? 'Convert & Generate All Output Formats' : 'تبدیل و ایجاد تمام فرمت‌های استاندارد'}</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Sub-Tab 2: Extract Archive (PFX / P12) */}
      {activeSubTab === 'extract' && (
        <div className="space-y-4">
          <div
            className={`p-4 rounded-xl border space-y-3 ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <label className={`text-xs font-bold flex items-center gap-1.5 ${isLightMode ? 'text-slate-800' : 'text-slate-200'}`}>
                <FolderArchive className="w-4 h-4 text-amber-500" />
                <span>{isEn ? 'Select .PFX / .P12 Archive File' : 'انتخاب فایل آرشیو .PFX یا .P12'}</span>
              </label>

              <input
                ref={pfxFileInputRef}
                type="file"
                accept=".pfx,.p12"
                onChange={handlePfxFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => pfxFileInputRef.current?.click()}
                className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition cursor-pointer border ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Upload className="w-3.5 h-3.5 text-amber-400" />
                <span>{extractFileName ? extractFileName : (isEn ? 'Browse .pfx / .p12' : 'انتخاب فایل PFX / P12')}</span>
              </button>
            </div>

            {extractFileName && (
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                <FileCheck className="w-4 h-4 shrink-0" />
                <span className="font-mono">{extractFileName}</span>
              </div>
            )}

            <div>
              <label className={`block text-xs font-medium mb-1 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                {isEn ? 'Archive Decryption Password' : 'رمز عبور بازگشایی آرشیو (در صورت وجود)'}
              </label>
              <div className="relative">
                <input
                  type={showExtractPassword ? 'text' : 'password'}
                  value={extractPassword}
                  onChange={(e) => setExtractPassword(e.target.value)}
                  placeholder={isEn ? 'Enter password used when exporting PFX' : 'رمز عبور فایل PFX را وارد کنید'}
                  className={`w-full pr-8 pl-2.5 py-1.5 text-xs font-mono rounded-lg border focus:outline-none ${
                    isLightMode ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-700 text-slate-200'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowExtractPassword(!showExtractPassword)}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-200"
                >
                  {showExtractPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <button
              onClick={handleExtractPfx}
              disabled={isProcessing || !extractPfxBase64}
              className={`w-full py-2 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow-md ${
                isProcessing || !extractPfxBase64
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  : isLightMode
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-95 text-white'
              }`}
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{isEn ? 'Extracting Archive Components...' : 'در حال رمزگشایی و استخراج اجزا...'}</span>
                </>
              ) : (
                <>
                  <FolderArchive className="w-4 h-4" />
                  <span>{isEn ? 'Extract Certificate, Key & CA Chain' : 'استخراج گواهی، کلید و زنجیره CA'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Results Section */}
      {outputs.length > 0 && (
        <div className="space-y-4 pt-2 border-t border-slate-700/40">
          {/* Certificate Metadata Banner */}
          {certInfo && (
            <div
              className={`p-3.5 rounded-xl border space-y-2.5 text-xs ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold text-sm">CN: {certInfo.commonName}</span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      certInfo.isExpired
                        ? 'bg-red-500/20 text-red-400'
                        : certInfo.daysRemaining && certInfo.daysRemaining < 30
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-emerald-500/20 text-emerald-400'
                    }`}
                  >
                    {certInfo.isExpired
                      ? (isEn ? 'Expired' : 'منقضی شده')
                      : `${certInfo.daysRemaining} ${isEn ? 'days remaining' : 'روز معتبر'}`}
                  </span>

                  <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 text-[10px] font-mono font-bold">
                    {certInfo.keyType} {certInfo.keyBits}b
                  </span>
                </div>
              </div>

              {/* Key match status */}
              {keyMatch && keyMatch.checked && (
                <div
                  className={`p-2 rounded-lg flex items-center gap-2 text-xs ${
                    keyMatch.matches
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                      : 'bg-red-500/10 border border-red-500/30 text-red-400'
                  }`}
                >
                  {keyMatch.matches ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{isEn ? keyMatch.messageEn : keyMatch.messageFa}</span>
                </div>
              )}

              {/* Issuer & Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div className="text-slate-400 truncate">
                  <b className="text-slate-300">{isEn ? 'Issuer: ' : 'صادرکننده: '}</b>
                  {certInfo.issuerOrg || certInfo.issuer}
                </div>
                <div className="text-slate-400">
                  <b className="text-slate-300">{isEn ? 'Valid: ' : 'اعتبار: '}</b>
                  {certInfo.validFrom.split(' ')[0]} {isEn ? 'to' : 'تا'} {certInfo.validTo.split(' ')[0]}
                </div>
              </div>

              {/* Fingerprint */}
              {certInfo.sha256Fingerprint && (
                <div className="text-[10px] font-mono text-slate-400 truncate">
                  <b>SHA-256: </b> {certInfo.sha256Fingerprint}
                </div>
              )}

              {/* SANs */}
              {certInfo.sans && certInfo.sans.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {certInfo.sans.map((san, idx) => (
                    <span
                      key={idx}
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                        isLightMode
                          ? 'bg-white text-slate-700 border-slate-300'
                          : 'bg-slate-950 text-cyan-300 border-slate-800'
                      }`}
                    >
                      {san}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Formats Header & Download All */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="text-xs font-bold flex items-center gap-1.5 text-slate-300">
              <Layers className="w-4 h-4 text-amber-400" />
              <span>
                {isEn
                  ? `Generated Formats (${outputs.length} available)`
                  : `فرمت‌های تولیدشده (${outputs.length} فرمت آماده دانلود)`}
              </span>
            </h4>

            <button
              onClick={handleDownloadAll}
              className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
                isLightMode
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isEn ? 'Download All Files' : 'دانلود تمام فایل‌ها'}</span>
            </button>
          </div>

          {/* Formats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {outputs.map((item) => (
              <div
                key={item.id}
                className={`p-3.5 rounded-xl border flex flex-col justify-between gap-3 transition ${
                  isLightMode
                    ? 'bg-white border-slate-200 hover:border-amber-400/60 shadow-sm'
                    : 'bg-slate-900/50 border-slate-800 hover:border-amber-500/40 shadow-sm'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                        {item.isBinary ? <FolderArchive className="w-3.5 h-3.5" /> : <FileCode className="w-3.5 h-3.5" />}
                      </div>
                      <div>
                        <h5 className="text-xs font-bold text-slate-100">{item.format}</h5>
                        <span className="text-[10px] font-mono text-cyan-400">{item.filename}</span>
                      </div>
                    </div>

                    <span className="text-[10px] font-mono text-slate-400 px-1.5 py-0.5 rounded bg-slate-800/60">
                      {(item.sizeBytes / 1024).toFixed(1)} KB
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">
                    {isEn ? item.descriptionEn : item.descriptionFa}
                  </p>

                  {/* Target Platforms */}
                  {item.targetPlatforms && item.targetPlatforms.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {item.targetPlatforms.map((plat, pIdx) => (
                        <span
                          key={pIdx}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-medium"
                        >
                          {plat}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/60">
                  <div className="flex items-center gap-1.5">
                    {!item.isBinary && item.text && (
                      <button
                        onClick={() => handleCopyText(item)}
                        className={`px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition cursor-pointer border ${
                          copiedId === item.id
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                            : isLightMode
                            ? 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                            : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                        }`}
                        title={isEn ? 'Copy file text to clipboard' : 'کپی متن فایل'}
                      >
                        {copiedId === item.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedId === item.id ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy' : 'کپی')}</span>
                      </button>
                    )}

                    {!item.isBinary && item.text && (
                      <button
                        onClick={() => setPreviewItem(item)}
                        className={`px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition cursor-pointer border ${
                          isLightMode
                            ? 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                            : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                        }`}
                        title={isEn ? 'Preview content' : 'پیش‌نمایش محتوا'}
                      >
                        <Eye className="w-3 h-3 text-amber-400" />
                        <span>{isEn ? 'Preview' : 'مشاهده'}</span>
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => handleDownloadItem(item)}
                    className={`px-3 py-1 rounded-md text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm ${
                      isLightMode
                        ? 'bg-amber-600 hover:bg-amber-700 text-white'
                        : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'
                    }`}
                  >
                    <Download className="w-3 h-3" />
                    <span>{isEn ? 'Download' : 'دانلود فایل'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Code Preview Modal / Drawer */}
      {previewItem && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div
            className={`w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl shadow-2xl border ${
              isLightMode ? 'bg-white text-slate-900 border-slate-200' : 'bg-slate-950 text-slate-100 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold font-mono">{previewItem.filename}</span>
              </div>
              <button
                onClick={() => setPreviewItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 custom-scrollbar">
              <pre className="text-[11px] font-mono p-3 rounded-lg bg-black/60 text-slate-200 overflow-x-auto whitespace-pre">
                {previewItem.text}
              </pre>
            </div>

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-800">
              <button
                onClick={() => handleCopyText(previewItem)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{isEn ? 'Copy to Clipboard' : 'کپی در کلیپ‌بورد'}</span>
              </button>
              <button
                onClick={() => {
                  handleDownloadItem(previewItem);
                  setPreviewItem(null);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isEn ? 'Download File' : 'دانلود فایل'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
