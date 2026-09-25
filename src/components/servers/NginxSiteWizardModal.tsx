import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Layers,
  Network,
  Globe,
  FileCode,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  Check,
  Copy,
  Terminal,
  Server,
  Lock,
  ExternalLink,
  Code,
  Sliders,
  CheckSquare,
} from 'lucide-react';
import {
  RemoteServer,
  NginxNewSiteConfig,
  NginxSiteTestResult,
  NginxSiteDeployResult,
} from '../../types';
import { testNginxSite, deployNginxSite } from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface NginxSiteWizardModalProps {
  isOpen: boolean;
  server: RemoteServer | null;
  sessionPassword?: string;
  onClose: () => void;
  onMinimize: () => void;
  onSuccess: (deployedPath: string) => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const NginxSiteWizardModal: React.FC<NginxSiteWizardModalProps> = ({
  isOpen,
  server,
  sessionPassword,
  onClose,
  onMinimize,
  onSuccess,
  isLightMode = false,
  isEn = false,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // Form State
  const [domain, setDomain] = useState('');
  const [aliases, setAliases] = useState('');
  const [port, setPort] = useState<number>(80);
  const [isDefaultServer, setIsDefaultServer] = useState(false);
  const [enableSsl, setEnableSsl] = useState(false);
  const [forceHttpsRedirect, setForceHttpsRedirect] = useState(false);
  const [sslCertPath, setSslCertPath] = useState('');
  const [sslKeyPath, setSslKeyPath] = useState('');

  // Step 2: Hosting Type
  const [siteType, setSiteType] = useState<'proxy' | 'static' | 'custom'>('proxy');
  const [proxyPassUrl, setProxyPassUrl] = useState('http://127.0.0.1:3000');
  const [enableWebSocket, setEnableWebSocket] = useState(true);
  const [standardHeaders, setStandardHeaders] = useState(true);
  const [proxyTimeoutSec, setProxyTimeoutSec] = useState(60);
  const [proxyBuffering, setProxyBuffering] = useState(true);

  // Static options
  const [documentRoot, setDocumentRoot] = useState('');
  const [indexFiles, setIndexFiles] = useState('index.html index.htm');
  const [enableSpaFallback, setEnableSpaFallback] = useState(false);
  const [enableAutoindex, setEnableAutoindex] = useState(false);

  // Step 3: Security & Limits
  const [clientMaxBodySize, setClientMaxBodySize] = useState('64M');
  const [enableGzip, setEnableGzip] = useState(true);
  const [enableSecurityHeaders, setEnableSecurityHeaders] = useState(true);
  const [autoReloadService, setAutoReloadService] = useState(true);

  // Step 4: Preview, Testing & Deployment
  const [customSnippet, setCustomSnippet] = useState('');
  const [isCustomEditing, setIsCustomEditing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<NginxSiteTestResult | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<NginxSiteDeployResult | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Update default paths when domain changes
  useEffect(() => {
    if (domain) {
      const clean = domain.trim().toLowerCase().replace(/[^a-z0-9_\-\.]/g, '');
      if (!sslCertPath || sslCertPath.includes('/etc/letsencrypt/live/')) {
        setSslCertPath(`/etc/letsencrypt/live/${clean}/fullchain.pem`);
      }
      if (!sslKeyPath || sslKeyPath.includes('/etc/letsencrypt/live/')) {
        setSslKeyPath(`/etc/letsencrypt/live/${clean}/privkey.pem`);
      }
      if (!documentRoot || documentRoot.startsWith('/var/www/')) {
        setDocumentRoot(`/var/www/${clean}`);
      }
    }
  }, [domain]);

  // Adjust port when SSL is toggled
  const handleToggleSsl = (enabled: boolean) => {
    setEnableSsl(enabled);
    if (enabled && port === 80) {
      setPort(443);
      setForceHttpsRedirect(true);
    } else if (!enabled && port === 443) {
      setPort(80);
      setForceHttpsRedirect(false);
    }
  };

  // Compile full config object
  const currentConfig: NginxNewSiteConfig = useMemo(() => {
    const aliasArr = aliases
      .split(/[\s,]+/)
      .map((a) => a.trim())
      .filter(Boolean);

    return {
      domain: domain.trim(),
      serverNames: aliasArr,
      port,
      isDefaultServer,
      enableSsl,
      sslCertPath: enableSsl ? sslCertPath.trim() : undefined,
      sslKeyPath: enableSsl ? sslKeyPath.trim() : undefined,
      forceHttpsRedirect: enableSsl ? forceHttpsRedirect : false,
      siteType,
      proxyPassUrl: siteType === 'proxy' ? proxyPassUrl.trim() : undefined,
      enableWebSocket: siteType === 'proxy' ? enableWebSocket : undefined,
      standardHeaders: siteType === 'proxy' ? standardHeaders : undefined,
      proxyTimeoutSec: siteType === 'proxy' ? proxyTimeoutSec : undefined,
      proxyBuffering: siteType === 'proxy' ? proxyBuffering : undefined,
      documentRoot: siteType === 'static' ? documentRoot.trim() : undefined,
      indexFiles: siteType === 'static' ? indexFiles.trim() : undefined,
      enableSpaFallback: siteType === 'static' ? enableSpaFallback : undefined,
      enableAutoindex: siteType === 'static' ? enableAutoindex : undefined,
      clientMaxBodySize,
      enableGzip,
      enableSecurityHeaders,
      customConfigSnippet: isCustomEditing ? customSnippet : undefined,
      autoReloadService,
    };
  }, [
    domain,
    aliases,
    port,
    isDefaultServer,
    enableSsl,
    sslCertPath,
    sslKeyPath,
    forceHttpsRedirect,
    siteType,
    proxyPassUrl,
    enableWebSocket,
    standardHeaders,
    proxyTimeoutSec,
    proxyBuffering,
    documentRoot,
    indexFiles,
    enableSpaFallback,
    enableAutoindex,
    clientMaxBodySize,
    enableGzip,
    enableSecurityHeaders,
    customSnippet,
    isCustomEditing,
    autoReloadService,
  ]);

  // Generate code on the fly for preview
  const generatedCode = useMemo(() => {
    const primaryDomain = domain.trim().toLowerCase().replace(/[^a-z0-9_\-\.]/g, '') || 'example.com';
    const aliasArr = aliases
      .split(/[\s,]+/)
      .map((a) => a.trim().toLowerCase().replace(/[^a-z0-9_\-\.]/g, ''))
      .filter((a) => a && a !== primaryDomain);
    const allDomains = [primaryDomain, ...aliasArr].join(' ');

    const lines: string[] = [];
    lines.push('# ==============================================================================');
    lines.push(`# Nginx Virtual Host Configuration`);
    lines.push(`# Domain: ${primaryDomain}`);
    lines.push(`# Type: ${siteType.toUpperCase()}`);
    lines.push(`# Generated by NetTopology Site Wizard on ${new Date().toISOString()}`);
    lines.push('# ==============================================================================');
    lines.push('');

    if (enableSsl && forceHttpsRedirect) {
      lines.push('server {');
      lines.push('    listen 80;');
      lines.push(`    server_name ${allDomains};`);
      lines.push('    return 301 https://$host$request_uri;');
      lines.push('}');
      lines.push('');
    }

    lines.push('server {');
    let listenPart = `    listen ${port}`;
    if (enableSsl) listenPart += ' ssl';
    if (isDefaultServer) listenPart += ' default_server';
    listenPart += ';';
    lines.push(listenPart);

    let listenIpv6 = `    listen [::]:${port}`;
    if (enableSsl) listenIpv6 += ' ssl';
    if (isDefaultServer) listenIpv6 += ' default_server';
    listenIpv6 += ';';
    lines.push(listenIpv6);

    lines.push(`    server_name ${allDomains};`);
    lines.push('');

    if (enableSsl) {
      lines.push('    # SSL / TLS Certificates');
      lines.push(`    ssl_certificate ${sslCertPath || `/etc/letsencrypt/live/${primaryDomain}/fullchain.pem`};`);
      lines.push(`    ssl_certificate_key ${sslKeyPath || `/etc/letsencrypt/live/${primaryDomain}/privkey.pem`};`);
      lines.push('    ssl_protocols TLSv1.2 TLSv1.3;');
      lines.push('    ssl_ciphers HIGH:!aNULL:!MD5;');
      lines.push('    ssl_prefer_server_ciphers on;');
      lines.push('    ssl_session_cache shared:SSL:10m;');
      lines.push('    ssl_session_timeout 1d;');
      lines.push('');
    }

    if (enableSecurityHeaders) {
      lines.push('    # Hardened Security Headers');
      lines.push('    add_header X-Frame-Options "SAMEORIGIN" always;');
      lines.push('    add_header X-Content-Type-Options "nosniff" always;');
      lines.push('    add_header X-XSS-Protection "1; mode=block" always;');
      lines.push('    add_header Referrer-Policy "strict-origin-when-cross-origin" always;');
      lines.push('');
    }

    lines.push(`    # Limits & Buffering`);
    lines.push(`    client_max_body_size ${clientMaxBodySize};`);
    if (enableGzip) {
      lines.push('    gzip on;');
      lines.push('    gzip_vary on;');
      lines.push('    gzip_proxied any;');
      lines.push('    gzip_comp_level 6;');
      lines.push('    gzip_types text/plain text/css application/json application/javascript text/xml application/xml+rss text/javascript image/svg+xml;');
    }
    lines.push('');

    lines.push('    # Logging');
    lines.push(`    access_log /var/log/nginx/${primaryDomain}.access.log;`);
    lines.push(`    error_log /var/log/nginx/${primaryDomain}.error.log warn;`);
    lines.push('');

    if (siteType === 'proxy') {
      lines.push('    # Reverse Proxy Gateway');
      lines.push('    location / {');
      lines.push(`        proxy_pass ${proxyPassUrl};`);
      if (standardHeaders) {
        lines.push('        proxy_set_header Host $host;');
        lines.push('        proxy_set_header X-Real-IP $remote_addr;');
        lines.push('        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;');
        lines.push('        proxy_set_header X-Forwarded-Proto $scheme;');
        lines.push('        proxy_set_header X-Forwarded-Host $host;');
        lines.push('        proxy_set_header X-Forwarded-Port $server_port;');
      }
      if (enableWebSocket) {
        lines.push('        # WebSocket Upgrades Support');
        lines.push('        proxy_http_version 1.1;');
        lines.push('        proxy_set_header Upgrade $http_upgrade;');
        lines.push('        proxy_set_header Connection "upgrade";');
      }
      lines.push(`        proxy_connect_timeout ${proxyTimeoutSec}s;`);
      lines.push(`        proxy_send_timeout ${proxyTimeoutSec}s;`);
      lines.push(`        proxy_read_timeout ${proxyTimeoutSec}s;`);
      if (!proxyBuffering) {
        lines.push('        proxy_buffering off;');
      }
      lines.push('    }');
    } else if (siteType === 'static') {
      lines.push('    # Static Files Hosting');
      lines.push(`    root ${documentRoot || `/var/www/${primaryDomain}`};`);
      lines.push(`    index ${indexFiles};`);
      lines.push('');
      lines.push('    location / {');
      if (enableSpaFallback) {
        lines.push('        # SPA Fallback Routing');
        lines.push('        try_files $uri $uri/ /index.html;');
      } else {
        lines.push('        try_files $uri $uri/ =404;');
      }
      if (enableAutoindex) {
        lines.push('        autoindex on;');
      }
      lines.push('    }');
      lines.push('');
      lines.push('    # Cache static assets');
      lines.push('    location ~* \\.(?:css|js|jpg|jpeg|gif|png|ico|cur|gz|svg|svgz|mp4|ogg|ogv|webm|htc|woff|woff2|ttf)$ {');
      lines.push('        expires 1M;');
      lines.push('        access_log off;');
      lines.push('        add_header Cache-Control "public";');
      lines.push('    }');
    }

    lines.push('}');
    return lines.join('\n');
  }, [
    domain,
    aliases,
    port,
    isDefaultServer,
    enableSsl,
    forceHttpsRedirect,
    sslCertPath,
    sslKeyPath,
    siteType,
    proxyPassUrl,
    enableWebSocket,
    standardHeaders,
    proxyTimeoutSec,
    proxyBuffering,
    documentRoot,
    indexFiles,
    enableSpaFallback,
    enableAutoindex,
    clientMaxBodySize,
    enableGzip,
    enableSecurityHeaders,
  ]);

  // Sync customSnippet when entering custom editing mode
  useEffect(() => {
    if (!isCustomEditing) {
      setCustomSnippet(generatedCode);
    }
  }, [generatedCode, isCustomEditing]);

  if (!isOpen || !server) return null;

  // Handle dry-run syntax test
  const handleRunSyntaxTest = async () => {
    if (!domain.trim()) {
      alert(isEn ? 'Please specify a domain name first.' : 'لطفاً ابتدا نام دامنه را وارد کنید.');
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testNginxSite(server.id, currentConfig, sessionPassword || server.ssh_password);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        isValid: false,
        testOutput: err?.message || 'Syntax test failed',
        generatedConfig: isCustomEditing ? customSnippet : generatedCode,
        targetFilePath: '',
        error: err?.message || 'Syntax test failed',
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Handle safe deployment
  const handleDeploySite = async () => {
    if (!domain.trim()) {
      alert(isEn ? 'Please specify a domain name first.' : 'لطفاً ابتدا نام دامنه را وارد کنید.');
      return;
    }
    setIsDeploying(true);
    setDeployResult(null);
    try {
      const res = await deployNginxSite(server.id, currentConfig, sessionPassword || server.ssh_password);
      setDeployResult(res);
      if (res.success) {
        onSuccess(res.deployedFilePath);
      }
    } catch (err: any) {
      setDeployResult({
        success: false,
        deployedFilePath: '',
        syntaxTestPassed: false,
        syntaxOutput: err?.message || 'Deployment failed',
        serviceReloaded: false,
        error: err?.message || 'Deployment execution failed',
      });
    } finally {
      setIsDeploying(false);
    }
  };

  const handleCopyCode = () => {
    const textToCopy = isCustomEditing ? customSnippet : generatedCode;
    navigator.clipboard.writeText(textToCopy);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div
      className={`fixed top-0 left-0 right-0 bottom-8 z-[999995] flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs transition-all`}
    >
      <div
        className={`w-full flex flex-col rounded-2xl border shadow-2xl transition-all overflow-hidden ${
          isMaximized
            ? 'h-full max-w-full rounded-none border-none'
            : 'max-w-4xl max-h-[92vh] h-auto'
        } ${
          isLightMode
            ? 'bg-white border-slate-300 text-slate-800'
            : 'bg-slate-950 border-slate-800 text-slate-100'
        }`}
      >
        {/* ======================================================== */}
        {/* MODAL HEADER: Title + Control Trio (Close, Min, Max)     */}
        {/* ======================================================== */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b select-none ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Network className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold flex items-center gap-2">
                <span>{isEn ? 'Create Nginx Virtual Host / Reverse Proxy' : 'ویزارد ایجاد سایت و پروکسی معکوس Nginx'}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  v1.167.0
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                {server.name} ({server.ip}) • {server.os_type || 'Linux'}
              </p>
            </div>
          </div>

          {/* Control Trio */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onMinimize}
              title={isEn ? 'Minimize' : 'کوچک‌سازی'}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-300 hover:bg-slate-200 text-slate-600'
                  : 'border-slate-700 hover:bg-slate-800 text-slate-300'
              }`}
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isEn ? 'Fullscreen' : 'تمام‌صفحه'}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-300 hover:bg-slate-200 text-slate-600'
                  : 'border-slate-700 hover:bg-slate-800 text-slate-300'
              }`}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Close' : 'بستن'}
              className="p-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* STEP PROGRESS BAR                                        */}
        {/* ======================================================== */}
        <div
          className={`flex items-center border-b px-5 py-2.5 gap-2 text-xs overflow-x-auto ${
            isLightMode ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-900/60 border-slate-800'
          }`}
        >
          {[
            { step: 1, titleEn: '1. Domain & Network', titleFa: '۱. دامنه و شبکه' },
            { step: 2, titleEn: '2. Hosting & Backend', titleFa: '۲. هاستینگ و بک‌اند' },
            { step: 3, titleEn: '3. Security & Limits', titleFa: '۳. امنیت و محدودیت‌ها' },
            { step: 4, titleEn: '4. Preview & Deploy', titleFa: '۴. پیش‌نمایش و اعمال' },
          ].map((item) => (
            <button
              key={item.step}
              type="button"
              onClick={() => setCurrentStep(item.step as any)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition cursor-pointer shrink-0 ${
                currentStep === item.step
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-xs'
                  : currentStep > item.step
                  ? 'text-emerald-400 bg-emerald-500/10'
                  : isLightMode
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  currentStep === item.step
                    ? 'bg-slate-950 text-emerald-400'
                    : currentStep > item.step
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {currentStep > item.step ? '✓' : item.step}
              </span>
              <span>{isEn ? item.titleEn : item.titleFa}</span>
            </button>
          ))}
        </div>

        {/* ======================================================== */}
        {/* STEP CONTENT BODY                                        */}
        {/* ======================================================== */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* STEP 1: DOMAIN & NETWORK */}
          {currentStep === 1 && (
            <div className="space-y-4 max-w-2xl mx-auto">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  <span>{isEn ? 'Primary Domain & Networking' : 'تنظیمات دامنه و شبکه'}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isEn
                    ? 'Specify the FQDN domain, server aliases, listening port, and SSL encryption options.'
                    : 'نام دامنه اصلی، نام‌های مستعار، پورت شنود و تنظیمات پروتکل امن SSL/TLS را مشخص کنید.'}
                </p>
              </div>

              {/* Primary Domain Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <span>{isEn ? 'Primary Domain Name (FQDN)' : 'نام دامنه اصلی (FQDN)'}</span>
                    <span className="text-rose-400">*</span>
                  </label>
                  <FieldInfoTooltip
                    fieldName="Primary Domain Name"
                    infoWhatEn="The primary Fully Qualified Domain Name (FQDN) that will be mapped to this virtual host."
                    infoWhatFa="نام دامنه کاملی که به این هاست مجازی Nginx اختصاص خواهد یافت."
                    infoWhyEn="Required by the server_name directive to route HTTP Host header traffic properly."
                    infoWhyFa="توسط دایرکتیو server_name برای روتینگ صحیح درخواست‌های ورودی کلاینت‌ها الزامی است."
                    infoExampleEn="app.mycompany.com or panel.internal.lan"
                    infoExampleFa="app.mycompany.com یا panel.internal.lan"
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="e.g. app.example.com"
                  className={`w-full px-3.5 py-2 rounded-xl border text-xs font-mono transition focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-300 text-slate-900'
                      : 'bg-slate-900 border-slate-700 text-slate-100'
                  }`}
                />
              </div>

              {/* Domain Aliases */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">
                    {isEn ? 'Additional Server Names / Aliases' : 'نام‌های مستعار دیگر (Aliases)'}
                  </label>
                  <FieldInfoTooltip
                    fieldName="Server Aliases"
                    infoWhatEn="Secondary domains or subdomains routed to the same virtual host block."
                    infoWhatFa="دامنه‌ها یا ساب‌دامنه‌های اضافی که دقیقاً به همین هاست مجازی متصل می‌شوند."
                    infoWhyEn="Useful for capturing both apex and www domains under a single site configuration."
                    infoWhyFa="برای هدایت همزمان دامنه اصلی و ساب‌دامنه www تحت یک فایل کانفیگ واحد."
                    infoExampleEn="www.example.com, api.example.com"
                    infoExampleFa="www.example.com, api.example.com"
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>
                <input
                  type="text"
                  value={aliases}
                  onChange={(e) => setAliases(e.target.value)}
                  placeholder="e.g. www.example.com, web.example.com (separated by space or comma)"
                  className={`w-full px-3.5 py-2 rounded-xl border text-xs font-mono transition focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-300 text-slate-900'
                      : 'bg-slate-900 border-slate-700 text-slate-100'
                  }`}
                />
              </div>

              {/* Port & Default Server */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300">
                      {isEn ? 'Listening Port' : 'پورت شنود (Listen Port)'}
                    </label>
                    <FieldInfoTooltip
                      fieldName="Listen Port"
                      infoWhatEn="The TCP port Nginx will bind to for incoming traffic on this virtual host."
                      infoWhatFa="پورت TCP که Nginx برای پذیرش ترافیک این سایت روی آن گوش می‌دهد."
                      infoWhyEn="Standard HTTP uses 80, while encrypted HTTPS uses port 443."
                      infoWhyFa="ترافیک عادی وب از پورت ۸۰ و ترافیک رمزنگاری‌شده SSL از پورت ۴۴۳ استفاده می‌کند."
                      infoExampleEn="80, 443, 8080"
                      infoExampleFa="80, 443, 8080"
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={port}
                      onChange={(e) => setPort(Number(e.target.value))}
                      className={`w-full px-3.5 py-2 rounded-xl border text-xs font-mono transition focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-900'
                          : 'bg-slate-900 border-slate-700 text-slate-100'
                      }`}
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setPort(80)}
                        className={`px-2 py-1.5 rounded-lg border text-xs font-mono cursor-pointer ${
                          port === 80
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500'
                            : 'border-slate-700 hover:bg-slate-800 text-slate-400'
                        }`}
                      >
                        80
                      </button>
                      <button
                        type="button"
                        onClick={() => setPort(443)}
                        className={`px-2 py-1.5 rounded-lg border text-xs font-mono cursor-pointer ${
                          port === 443
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500'
                            : 'border-slate-700 hover:bg-slate-800 text-slate-400'
                        }`}
                      >
                        443
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-800 bg-slate-900/50 cursor-pointer hover:bg-slate-800/50 transition">
                    <input
                      type="checkbox"
                      checked={isDefaultServer}
                      onChange={(e) => setIsDefaultServer(e.target.checked)}
                      className="rounded accent-emerald-500 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-semibold text-slate-200 block">
                        {isEn ? 'Catch-all Default Server' : 'پاسخ‌دهنده پیش‌فرض (Default Server)'}
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        {isEn ? 'Answers unmatched IP or domain queries' : 'پاسخ به درخواست‌های مستقیم IP یا نام‌های ثبت‌نشده'}
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* SSL Encryption Toggle & Paths */}
              <div
                className={`p-4 rounded-xl border space-y-3.5 ${
                  enableSsl
                    ? 'border-emerald-500/40 bg-emerald-500/5'
                    : isLightMode
                    ? 'border-slate-200 bg-slate-50'
                    : 'border-slate-800 bg-slate-900/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock className={`w-4 h-4 ${enableSsl ? 'text-emerald-400' : 'text-slate-400'}`} />
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">
                        {isEn ? 'Enable SSL / TLS HTTPS Encryption' : 'فعال‌سازی پروتکل امن SSL / TLS (HTTPS)'}
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        {isEn ? 'Enables HTTP/2, secure ciphers, and certificate directives' : 'فعال‌سازی رمزنگاری گواهینامه، HTTP/2 و سایفرهای امن'}
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={enableSsl}
                    onChange={(e) => handleToggleSsl(e.target.checked)}
                    className="w-5 h-5 rounded accent-emerald-500 cursor-pointer"
                  />
                </div>

                {enableSsl && (
                  <div className="space-y-3 pt-2 border-t border-slate-700/40">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={forceHttpsRedirect}
                        onChange={(e) => setForceHttpsRedirect(e.target.checked)}
                        className="rounded accent-emerald-500 w-4 h-4 cursor-pointer"
                      />
                      <span className="text-xs text-slate-300">
                        {isEn
                          ? 'Automatic HTTP Port 80 to HTTPS 443 Permanent Redirect (301)'
                          : 'هدایت خودکار ترافیک پورت ۸۰ به HTTPS با کد ۳۰۱ (HTTP to HTTPS Redirect)'}
                      </span>
                    </label>

                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-400 font-mono">
                        {isEn ? 'ssl_certificate (Fullchain / CRT Path)' : 'مسیر فایل سرتیفیکیت (ssl_certificate)'}
                      </label>
                      <input
                        type="text"
                        value={sslCertPath}
                        onChange={(e) => setSslCertPath(e.target.value)}
                        placeholder="/etc/letsencrypt/live/domain/fullchain.pem"
                        className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono ${
                          isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-200'
                        }`}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-400 font-mono">
                        {isEn ? 'ssl_certificate_key (Private Key Path)' : 'مسیر کلید خصوصی (ssl_certificate_key)'}
                      </label>
                      <input
                        type="text"
                        value={sslKeyPath}
                        onChange={(e) => setSslKeyPath(e.target.value)}
                        placeholder="/etc/letsencrypt/live/domain/privkey.pem"
                        className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono ${
                          isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-200'
                        }`}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: HOSTING & BACKEND */}
          {currentStep === 2 && (
            <div className="space-y-4 max-w-2xl mx-auto">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Network className="w-4 h-4 text-emerald-400" />
                  <span>{isEn ? 'Hosting Model & Backend Routing' : 'مدل میزبانی و هدایت ترافیک (Routing)'}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isEn
                    ? 'Choose whether Nginx operates as a Reverse Proxy Gateway or hosts static web assets directly.'
                    : 'مشخص کنید Nginx به عنوان دروازه پروکسی معکوس عمل کند یا فایل‌های وب استاتیک را مستقیماً سرو نماید.'}
                </p>
              </div>

              {/* Site Type Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <button
                  type="button"
                  onClick={() => setSiteType('proxy')}
                  className={`p-4 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                    siteType === 'proxy'
                      ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500'
                      : isLightMode
                      ? 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                      : 'border-slate-800 bg-slate-900/50 hover:bg-slate-800/50'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Network className="w-5 h-5 text-emerald-400" />
                      {siteType === 'proxy' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    </div>
                    <h4 className="text-xs font-bold text-slate-200">
                      {isEn ? 'Reverse Proxy Gateway' : 'پروکسی معکوس (Reverse Proxy)'}
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {isEn
                        ? 'Forwards requests to backend apps (Node.js, Python, Docker, Go, microservices).'
                        : 'هدایت درخواست‌ها به وب‌اپلیکیشن‌های داخلی مانند Node.js، داکر، پایتون یا میکرو‌سرویس‌ها.'}
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 mt-3 block">
                    proxy_pass http://...
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSiteType('static')}
                  className={`p-4 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                    siteType === 'static'
                      ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500'
                      : isLightMode
                      ? 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                      : 'border-slate-800 bg-slate-900/50 hover:bg-slate-800/50'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Globe className="w-5 h-5 text-cyan-400" />
                      {siteType === 'static' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    </div>
                    <h4 className="text-xs font-bold text-slate-200">
                      {isEn ? 'Static Web Files Hosting' : 'میزبانی فایل‌های استاتیک وب'}
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {isEn
                        ? 'Serves HTML, React, Vue, CSS, images directly from local document root directory.'
                        : 'سرو مستقیم فایل‌های HTML، ری‌اکت، ویو، تصاویر و استایل‌ها از مسیر فیزیکی روی دیسک.'}
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-cyan-400 mt-3 block">
                    root /var/www/...
                  </span>
                </button>
              </div>

              {/* Dynamic Sub-form based on type */}
              {siteType === 'proxy' && (
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-300">
                        {isEn ? 'Target Backend URL (proxy_pass)' : 'آدرس وب‌اپلیکیشن یا پورت بالادستی (proxy_pass)'}
                      </label>
                      <FieldInfoTooltip
                        fieldName="Proxy Pass URL"
                        infoWhatEn="The destination internal URL and port where Nginx will forward requests."
                        infoWhatFa="آدرس داخلی مقصد و شماره پورتی که Nginx درخواست‌ها را به آن ارسال می‌کند."
                        infoWhyEn="Decouples public web traffic from internal application processes."
                        infoWhyFa="جداسازی ترافیک اینترنت از سرویس‌ها و پورت‌های محلی سرور."
                        infoExampleEn="http://127.0.0.1:3000, http://192.168.1.10:8080"
                        infoExampleFa="http://127.0.0.1:3000, http://192.168.1.10:8080"
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </div>
                    <input
                      type="text"
                      value={proxyPassUrl}
                      onChange={(e) => setProxyPassUrl(e.target.value)}
                      placeholder="http://127.0.0.1:3000"
                      className={`w-full px-3.5 py-2 rounded-xl border text-xs font-mono transition focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                        isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'
                      }`}
                    />
                    {/* Quick Presets */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      <span className="text-[10px] text-slate-400">{isEn ? 'Presets:' : 'پیش‌فرض‌ها:'}</span>
                      {[
                        { label: ':3000 (Node/Next)', url: 'http://127.0.0.1:3000' },
                        { label: ':8080 (Docker/Java)', url: 'http://127.0.0.1:8080' },
                        { label: ':5000 (Flask/FastAPI)', url: 'http://127.0.0.1:5000' },
                        { label: ':8000 (Django)', url: 'http://127.0.0.1:8000' },
                      ].map((p) => (
                        <button
                          key={p.url}
                          type="button"
                          onClick={() => setProxyPassUrl(p.url)}
                          className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* WebSocket & Header Flags */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enableWebSocket}
                        onChange={(e) => setEnableWebSocket(e.target.checked)}
                        className="rounded accent-emerald-500 w-4 h-4 cursor-pointer"
                      />
                      <div>
                        <span className="text-xs text-slate-200 block">
                          {isEn ? 'WebSocket Support (Upgrade / Connection)' : 'پشتیبانی از وب‌سوکت (WebSocket)'}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          {isEn ? 'Required for real-time apps & socket.io' : 'الزامی برای سوکت‌ها و چت‌های بلادرنگ'}
                        </span>
                      </div>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={standardHeaders}
                        onChange={(e) => setStandardHeaders(e.target.checked)}
                        className="rounded accent-emerald-500 w-4 h-4 cursor-pointer"
                      />
                      <div>
                        <span className="text-xs text-slate-200 block">
                          {isEn ? 'Forward Real Client IP (X-Real-IP)' : 'ارسال IP واقعی کلاینت (X-Real-IP)'}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          {isEn ? 'Passes Host, X-Forwarded-For & Proto' : 'هدرهای استاندارد X-Forwarded-For و Host'}
                        </span>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {siteType === 'static' && (
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">
                      {isEn ? 'Document Root Directory (root)' : 'دایرکتوری ریشه اسناد (root)'}
                    </label>
                    <input
                      type="text"
                      value={documentRoot}
                      onChange={(e) => setDocumentRoot(e.target.value)}
                      placeholder="/var/www/domain"
                      className={`w-full px-3.5 py-2 rounded-xl border text-xs font-mono transition focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                        isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'
                      }`}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300">
                        {isEn ? 'Index Files' : 'فایل‌های ایندکس (index)'}
                      </label>
                      <input
                        type="text"
                        value={indexFiles}
                        onChange={(e) => setIndexFiles(e.target.value)}
                        placeholder="index.html index.htm"
                        className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono ${
                          isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-200'
                        }`}
                      />
                    </div>

                    <div className="flex flex-col justify-end">
                      <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-slate-800">
                        <input
                          type="checkbox"
                          checked={enableSpaFallback}
                          onChange={(e) => setEnableSpaFallback(e.target.checked)}
                          className="rounded accent-emerald-500 w-4 h-4 cursor-pointer"
                        />
                        <div>
                          <span className="text-xs text-slate-200 block">
                            {isEn ? 'SPA Fallback Routing' : 'هدایت تک‌صفحه‌ای (SPA Fallback)'}
                          </span>
                          <span className="text-[10px] text-slate-400 block font-mono">
                            try_files $uri $uri/ /index.html
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: SECURITY & LIMITS */}
          {currentStep === 3 && (
            <div className="space-y-4 max-w-2xl mx-auto">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>{isEn ? 'Security Hardening, Compression & Limits' : 'امنیت پیشرفته، فشرده‌سازی و محدودیت‌ها'}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isEn
                    ? 'Configure upload sizes, Gzip compression, and HTTP security headers.'
                    : 'تنظیم سقف حجم آپلود فایل، الگوریتم فشرده‌سازی Gzip و هدرهای محافظتی.'}
                </p>
              </div>

              {/* Client Max Body Size */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-200">
                    {isEn ? 'Max Request / Upload Size (client_max_body_size)' : 'حداکثر حجم آپلود و بادی درخواست (client_max_body_size)'}
                  </label>
                  <FieldInfoTooltip
                    fieldName="Client Max Body Size"
                    infoWhatEn="Maximum allowed size of the client request body specified in the Content-Length header."
                    infoWhatFa="سقف مجاز حجم بادی درخواست کاربر (مانند آپلود فایل‌ها در فرم‌ها)."
                    infoWhyEn="Prevents 413 Request Entity Too Large errors when users upload large documents."
                    infoWhyFa="جلوگیری از خطای ۴۱۳ هنگام آپلود تصاویر یا فایل‌های پرحجم."
                    infoExampleEn="10M, 64M, 500M"
                    infoExampleFa="10M, 64M, 500M"
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={clientMaxBodySize}
                    onChange={(e) => setClientMaxBodySize(e.target.value)}
                    placeholder="64M"
                    className={`w-32 px-3 py-1.5 rounded-lg border text-xs font-mono ${
                      isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'
                    }`}
                  />
                  <div className="flex items-center gap-1.5">
                    {['10M', '64M', '128M', '500M'].map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setClientMaxBodySize(sz)}
                        className={`px-2 py-1 rounded text-xs font-mono cursor-pointer ${
                          clientMaxBodySize === sz
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Security Headers Toggle */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableSecurityHeaders}
                    onChange={(e) => setEnableSecurityHeaders(e.target.checked)}
                    className="rounded accent-emerald-500 w-4 h-4 mt-0.5 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-semibold text-slate-200 block">
                      {isEn ? 'Add Hardened Security Headers' : 'افزودن هدرهای محافظتی امنیتی (Hardened Security Headers)'}
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      X-Frame-Options SAMEORIGIN, X-Content-Type-Options nosniff, X-XSS-Protection, Referrer-Policy
                    </span>
                  </div>
                </label>
              </div>

              {/* Gzip Compression Toggle */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableGzip}
                    onChange={(e) => setEnableGzip(e.target.checked)}
                    className="rounded accent-emerald-500 w-4 h-4 mt-0.5 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-semibold text-slate-200 block">
                      {isEn ? 'Enable Gzip Compression' : 'فعال‌سازی فشرده‌سازی ترافیک Gzip'}
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      {isEn
                        ? 'Reduces bandwidth by compressing CSS, JS, JSON, and SVG assets on the fly.'
                        : 'کاهش چشمگیر پهنای‌باند با فشرده‌سازی در لحظه فایل‌های متنی، اسکریپت‌ها و JSON.'}
                    </span>
                  </div>
                </label>
              </div>

              {/* Auto Reload Option */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoReloadService}
                    onChange={(e) => setAutoReloadService(e.target.checked)}
                    className="rounded accent-emerald-500 w-4 h-4 mt-0.5 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-semibold text-slate-200 block">
                      {isEn ? 'Auto-Reload Nginx Service on Successful Deploy' : 'ریلود خودکار سرویس Nginx پس از استقرار موفق'}
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      {isEn
                        ? 'Applies new virtual host immediately without server downtime.'
                        : 'فعال‌سازی فوری هاست بدون قطعی یا داون‌تایم وب‌سرور.'}
                    </span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* STEP 4: PREVIEW & REMOTE TEST & DEPLOY */}
          {currentStep === 4 && (
            <div className="space-y-4 max-w-3xl mx-auto">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-emerald-400" />
                    <span>{isEn ? 'Configuration Preview & Remote Syntax Test' : 'پیش‌نمایش پیکربندی و تست سلامت سینتکس'}</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isEn
                      ? 'Review generated Nginx configuration, run remote dry-run validation, and safely deploy.'
                      : 'کد پیکربندی را بررسی کنید، تست درای‌ران از راه دور انجام دهید و با اطمینان فعال نمایید.'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCustomEditing(!isCustomEditing)}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
                      isCustomEditing
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <Code className="w-3.5 h-3.5" />
                    <span>{isCustomEditing ? (isEn ? 'Lock Code' : 'قفل کردن کد') : (isEn ? 'Edit Code Manually' : 'ویرایش دستی کد')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 transition cursor-pointer"
                    title={isEn ? 'Copy Configuration' : 'کپی متن پیکربندی'}
                  >
                    {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Code Box */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden font-mono text-xs">
                <div className="bg-slate-900/80 px-4 py-2 border-b border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                  <span>/etc/nginx/sites-available/{domain ? `${domain}.conf` : 'example.conf'}</span>
                  <span>{isCustomEditing ? (isEn ? 'Custom Mode' : 'حالت سفارشی') : (isEn ? 'Auto Generated' : 'تولید خودکار')}</span>
                </div>
                {isCustomEditing ? (
                  <textarea
                    value={customSnippet}
                    onChange={(e) => setCustomSnippet(e.target.value)}
                    rows={16}
                    className="w-full p-4 bg-transparent text-emerald-300 font-mono text-xs focus:outline-none resize-none leading-relaxed"
                  />
                ) : (
                  <pre className="p-4 text-emerald-300 font-mono text-xs overflow-x-auto max-h-[350px] leading-relaxed">
                    {generatedCode}
                  </pre>
                )}
              </div>

              {/* Remote Test Status Banner */}
              {testResult && (
                <div
                  className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                    testResult.isValid
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                      : 'border-rose-500/50 bg-rose-500/10 text-rose-300'
                  }`}
                >
                  {testResult.isValid ? (
                    <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
                  )}
                  <div className="space-y-1 text-xs">
                    <strong className="block font-bold">
                      {testResult.isValid
                        ? isEn
                          ? 'Syntax Test Passed! (nginx -t verification successful)'
                          : 'صحت سینتکس تأیید شد! (تست nginx -t با موفقیت پاس شد)'
                        : isEn
                        ? 'Syntax Verification Rejected'
                        : 'خطای سینتکس در پیکربندی'}
                    </strong>
                    <pre className="text-[11px] font-mono whitespace-pre-wrap opacity-90">
                      {testResult.testOutput}
                    </pre>
                  </div>
                </div>
              )}

              {/* Deployment Result Banner */}
              {deployResult && (
                <div
                  className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                    deployResult.success
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-200'
                      : 'border-rose-500 bg-rose-500/15 text-rose-200'
                  }`}
                >
                  {deployResult.success ? (
                    <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
                  )}
                  <div className="space-y-1 text-xs">
                    <strong className="block font-bold">
                      {deployResult.success
                        ? isEn
                          ? 'Site Successfully Deployed & Active!'
                          : 'سایت با موفقیت مستقر و فعال شد!'
                        : isEn
                        ? 'Deployment Failed (Rollback Executed)'
                        : 'خطا در استقرار (رول‌بک خودکار انجام شد)'}
                    </strong>
                    {deployResult.deployedFilePath && (
                      <p className="font-mono text-[11px]">
                        {isEn ? 'File:' : 'مسیر فایل:'} {deployResult.deployedFilePath}
                      </p>
                    )}
                    {deployResult.serviceReloaded && (
                      <p className="text-emerald-400 font-medium">
                        ✓ {isEn ? 'Nginx service reloaded with zero downtime.' : 'سرویس Nginx بدون داون‌تایم ریلود شد.'}
                      </p>
                    )}
                    {deployResult.error && (
                      <p className="text-rose-400 font-mono text-[11px]">{deployResult.error}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* MODAL FOOTER: Prev, Next, Test & Deploy Buttons          */}
        {/* ======================================================== */}
        <div
          className={`flex items-center justify-between px-5 py-3 border-t select-none ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          {/* Back Button */}
          {currentStep > 1 ? (
            <button
              type="button"
              onClick={() => setCurrentStep((currentStep - 1) as any)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                  : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{isEn ? 'Previous' : 'مرحله قبل'}</span>
            </button>
          ) : (
            <div />
          )}

          {/* Right Action Group */}
          <div className="flex items-center gap-2">
            {currentStep < 4 ? (
              <button
                type="button"
                onClick={() => {
                  if (currentStep === 1 && !domain.trim()) {
                    alert(isEn ? 'Please specify a domain name.' : 'لطفاً نام دامنه را وارد کنید.');
                    return;
                  }
                  setCurrentStep((currentStep + 1) as any);
                }}
                className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer"
              >
                <span>{isEn ? 'Next Step' : 'مرحله بعد'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <>
                {/* Syntax Dry-Run Test Button */}
                <button
                  type="button"
                  onClick={handleRunSyntaxTest}
                  disabled={isTesting || isDeploying}
                  className={`px-3.5 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                    isLightMode
                      ? 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
                      : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-emerald-400' : ''}`} />
                  <span>{isTesting ? (isEn ? 'Testing Syntax...' : 'در حال تست...') : (isEn ? 'Test Syntax Remotely' : 'تست سلامت سینتکس')}</span>
                </button>

                {/* Deploy Button */}
                <button
                  type="button"
                  onClick={handleDeploySite}
                  disabled={isDeploying || isTesting}
                  className="px-5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition shadow-md shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
                >
                  {isDeploying ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{isEn ? 'Deploying...' : 'در حال استقرار...'}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{isEn ? 'Save & Deploy Site' : 'ذخیره و فعال‌سازی سایت'}</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
