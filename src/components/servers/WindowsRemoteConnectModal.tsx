import React, { useState, useEffect } from 'react';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Monitor,
  Download,
  Copy,
  Check,
  ExternalLink,
  Terminal,
  Shield,
  Activity,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Server,
  Zap
} from 'lucide-react';
import { RemoteServer } from '../../types';
import { testRemoteServerConnection } from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface WindowsRemoteConnectModalProps {
  isOpen: boolean;
  server: RemoteServer | null;
  onClose: () => void;
  onMinimize: () => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const WindowsRemoteConnectModal: React.FC<WindowsRemoteConnectModalProps> = ({
  isOpen,
  server,
  onClose,
  onMinimize,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [testingPort, setTestingPort] = useState(false);
  const [testResult, setTestResult] = useState<{ reachable: boolean; latency_ms: number; message: string } | null>(null);

  useEffect(() => {
    setTestResult(null);
  }, [server, isOpen]);

  if (!isOpen || !server) return null;

  const targetIp = server.ip;
  const targetPort = server.win_port || 3389;
  const username = server.win_username || 'Administrator';
  const domain = server.win_domain || '';
  const fullUser = domain ? `${domain}\\${username}` : username;

  // Generate .rdp file content
  const generateRdpContent = () => {
    return [
      `full address:s:${targetIp}:${targetPort}`,
      `username:s:${fullUser}`,
      'screen mode id:i:2',
      'use multimon:i:0',
      'desktopwidth:i:1920',
      'desktopheight:i:1080',
      'session bpp:i:32',
      'compression:i:1',
      'keyboardhook:i:2',
      'audiocapturemode:i:0',
      'videoplaybackmode:i:1',
      'connection type:i:7',
      'networkautodetect:i:1',
      'bandwidthautodetect:i:1',
      'displayconnectionbar:i:1',
      'enableworkspacereconnect:i:0',
      'disable wallpaper:i:0',
      'allow font smoothing:i:1',
      'allow desktop composition:i:1',
      'disable full window drag:i:1',
      'disable menu anims:i:1',
      'disable themes:i:0',
      'disable cursor setting:i:0',
      'bitmapcachepersistenable:i:1',
      'authentication level:i:2',
      'prompt for credentials:i:0',
      'negotiate security layer:i:1',
      'remoteapplicationmode:i:0',
      `alternate shell:s:`,
      `shell working directory:s:`,
      `gatewayhostname:s:`,
      `gatewayusagemethod:i:4`,
      `gatewaycredentialssource:i:4`,
      `gatewayprofileusagemethod:i:0`,
      `promptcredentialonce:i:0`,
      `drivestoredirect:s:`,
    ].join('\r\n');
  };

  const handleDownloadRdp = () => {
    const content = generateRdpContent();
    const blob = new Blob([content], { type: 'application/x-rdp' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${server.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_${targetIp}.rdp`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleTestReachability = async () => {
    setTestingPort(true);
    setTestResult(null);
    try {
      const res = await testRemoteServerConnection(server.id);
      setTestResult({
        reachable: res.reachable,
        latency_ms: res.latency_ms,
        message: res.message,
      });
    } catch (err: any) {
      setTestResult({
        reachable: false,
        latency_ms: 0,
        message: err.message || 'Connection check failed',
      });
    } finally {
      setTestingPort(false);
    }
  };

  const mstscCmd = `mstsc /v:${targetIp}:${targetPort}`;
  const psRemoteCmd = `Enter-PSSession -ComputerName ${targetIp} -Credential (Get-Credential)`;
  const winrmTestCmd = `Test-NetConnection -ComputerName ${targetIp} -Port ${targetPort}`;

  return (
    <div
      className={`fixed z-50 flex items-center justify-center ${
        isMaximized
          ? 'top-0 left-0 right-0 bottom-8 p-0'
          : 'inset-0 p-4 md:p-6 bg-black/60 backdrop-blur-sm'
      }`}
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`flex flex-col overflow-hidden transition-all duration-200 shadow-2xl ${
          isMaximized
            ? 'w-full h-full rounded-none border-none'
            : 'w-full max-w-3xl max-h-[90vh] rounded-2xl border'
        } ${
          isLightMode
            ? 'bg-white border-slate-200 text-slate-900 shadow-slate-900/20'
            : 'bg-slate-950 border-slate-800 text-slate-100 shadow-cyan-950/40'
        }`}
      >
        {/* Header with Universal 3-Button Controls */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${
            isLightMode ? 'bg-slate-50/80 border-slate-200' : 'bg-slate-900/60 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight">
                  {isEn ? 'Windows Remote Access Suite' : 'مرکز اتصال ریموت ویندوز'}
                </h3>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
                  {server.win_protocol?.toUpperCase() || 'RDP'}
                </span>
              </div>
              <p className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {server.name} ({targetIp}:{targetPort}) • {server.os_distro || 'Windows Server'}
              </p>
            </div>
          </div>

          {/* Triad Control Buttons (Close, Minimize, Fullscreen) */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              title={
                isMaximized
                  ? isEn
                    ? 'Exit Fullscreen'
                    : 'خروج از تمام‌صفحه'
                  : isEn
                  ? 'Fullscreen'
                  : 'تمام‌صفحه'
              }
              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                isLightMode
                  ? 'hover:bg-slate-200 text-slate-600'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onMinimize}
              title={isEn ? 'Minimize to Dock' : 'مینیمایز به نوار ابزار'}
              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                isLightMode
                  ? 'hover:bg-slate-200 text-slate-600'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Close' : 'بستن'}
              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                isLightMode
                  ? 'hover:bg-rose-100 text-rose-600'
                  : 'hover:bg-rose-950/50 text-rose-400 hover:text-rose-300'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Quick Port Ping / Reachability Probe */}
          <div
            className={`flex items-center justify-between p-4 rounded-xl border ${
              testResult?.reachable
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : testResult
                ? 'bg-rose-500/10 border-rose-500/30'
                : isLightMode
                ? 'bg-slate-50 border-slate-200'
                : 'bg-slate-900/40 border-slate-800'
            }`}
          >
            <div className="flex items-center gap-3">
              <Activity className={`w-5 h-5 ${testResult?.reachable ? 'text-emerald-400' : 'text-blue-400'}`} />
              <div>
                <div className="text-xs font-bold">
                  {isEn ? 'RDP / Remote Port Reachability Probe' : 'تست وضعیت پورت ریموت دسکتاپ'}
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  {testResult
                    ? testResult.message
                    : isEn
                    ? `Check if port ${targetPort} is listening on ${targetIp}`
                    : `بررسی باز بودن پورت ${targetPort} روی ${targetIp}`}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleTestReachability}
              disabled={testingPort}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500 hover:bg-blue-600 text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              <Zap className={`w-3.5 h-3.5 ${testingPort ? 'animate-bounce' : ''}`} />
              <span>{testingPort ? (isEn ? 'Testing...' : 'در حال تست...') : isEn ? 'Test Port Reachability' : 'تست برقراری ارتباط'}</span>
            </button>
          </div>

          {/* Option 1: 1-Click RDP File Generator & Download */}
          <div
            className={`p-5 rounded-xl border space-y-3 ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Monitor className="w-4 h-4 text-blue-400" />
                <h4 className="text-sm font-bold">
                  {isEn ? '1. One-Click Remote Desktop (.RDP) Launcher' : '۱. فایل آماده اتصال ریموت دسکتاپ (.RDP)'}
                </h4>
              </div>
              <FieldInfoTooltip
                title={isEn ? 'RDP Profile' : 'فایل RDP'}
                whatIsIt={isEn ? 'Pre-configured Windows Remote Desktop file with display, port, and security settings.' : 'فایل آماده کانفیگ ریموت دسکتاپ شامل پورت، کاربر و رزولوشن.'}
                whyNeeded={isEn ? 'Double click to open direct native MSTSC session without typing IP or port.' : 'باز کردن مستقیم نشست ریموت با دبل‌کلیک بدون نیاز به تایپ آی‌پی.'}
                example="server_192.168.10.50.rdp"
                isEn={isEn}
                isLightMode={isLightMode}
              />
            </div>

            <p className="text-xs text-slate-400">
              {isEn
                ? 'Download an encrypted .rdp shortcut file with pre-configured display resolution, audio pass-through, and target host parameters.'
                : 'دانلود فایل میانبر اتصال ریموت دسکتاپ ویندوز با تنظیمات آماده پورت، نام کاربری و کیفیت تصویر.'}
            </p>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleDownloadRdp}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md shadow-blue-500/20 transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>{isEn ? 'Download .RDP Shortcut File' : 'دانلود فایل میانبر (.rdp)'}</span>
              </button>

              <button
                type="button"
                onClick={() => copyToClipboard(mstscCmd, 'mstsc')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono border border-slate-700 hover:border-slate-600 bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                {copiedKey === 'mstsc' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{mstscCmd}</span>
              </button>
            </div>
          </div>

          {/* Option 2: PowerShell Remoting (WinRM / SSH) */}
          <div
            className={`p-5 rounded-xl border space-y-3 ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <h4 className="text-sm font-bold">
                  {isEn ? '2. PowerShell Remoting CLI Command' : '۲. اتصال خط فرمان پاورشل (PowerShell Remoting)'}
                </h4>
              </div>
              <FieldInfoTooltip
                title={isEn ? 'PowerShell Remoting' : 'پاورشل ریموتینگ'}
                whatIsIt={isEn ? 'Enter-PSSession interactive Windows CLI environment over WinRM.' : 'محیط تعاملی خط فرمان پاورشل ویندوز از طریق سرویس WinRM.'}
                whyNeeded={isEn ? 'Execute Windows management tasks, service restarts, and automation scripts.' : 'مدیریت سرورهای ویندوزی، سرویس‌ها و ری‌استارت‌ها بدون نیاز به رابط گرافیکی.'}
                example="Enter-PSSession -ComputerName 192.168.10.50"
                isEn={isEn}
                isLightMode={isLightMode}
              />
            </div>

            <p className="text-xs text-slate-400">
              {isEn
                ? 'Copy and paste into your local Windows PowerShell terminal for headless CLI administration:'
                : 'دستور زیر را کپی کرده و در پاورشل ویندوز خود اجرا کنید:'}
            </p>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800 font-mono text-xs">
              <span className="text-emerald-400 overflow-x-auto select-all">{psRemoteCmd}</span>
              <button
                type="button"
                onClick={() => copyToClipboard(psRemoteCmd, 'ps')}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer ms-2 shrink-0"
                title={isEn ? 'Copy Command' : 'کپی دستور'}
              >
                {copiedKey === 'ps' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Credentials Reference Summary */}
          <div
            className={`p-4 rounded-xl border text-xs space-y-2 ${
              isLightMode ? 'bg-slate-100/60 border-slate-200' : 'bg-slate-900/30 border-slate-800/80'
            }`}
          >
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-blue-400" />
              <span>{isEn ? 'Server Credentials Reference' : 'اطلاعات احراز هویت ثبت‌شده سرور'}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
              <div>
                <span className="text-slate-500 block">IP:</span>
                <span className="font-bold text-slate-200">{targetIp}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Port:</span>
                <span className="font-bold text-slate-200">{targetPort}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Username:</span>
                <span className="font-bold text-slate-200">{fullUser}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Environment:</span>
                <span className="font-bold text-slate-200">{server.environment}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className={`flex items-center justify-end px-6 py-3 border-t shrink-0 ${
            isLightMode ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-900/60'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
              isLightMode
                ? 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
            }`}
          >
            {isEn ? 'Close' : 'بستن'}
          </button>
        </div>
      </div>
    </div>
  );
};
