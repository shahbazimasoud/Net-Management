import React, { useState, useEffect } from 'react';
import { Globe, RefreshCw, CheckCircle2, AlertTriangle, Check, Activity } from 'lucide-react';
import { RemoteServer, LinuxProxyConfig } from '../../../types';
import {
  configureLinuxServerProxy,
  testLinuxServerProxy,
} from '../../../services/api';
import { FieldInfoTooltip } from '../../common/FieldInfoTooltip';

interface LinuxProxySectionProps {
  server: RemoteServer;
  initialProxy?: LinuxProxyConfig;
  ephemeralPassword?: string;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const LinuxProxySection: React.FC<LinuxProxySectionProps> = ({
  server,
  initialProxy,
  ephemeralPassword,
  isLightMode = false,
  isEn = true,
}) => {
  const [proxyConfig, setProxyConfig] = useState<LinuxProxyConfig>(
    initialProxy || {
      enabled: false,
      httpProxy: '',
      httpsProxy: '',
      ftpProxy: '',
      noProxy: 'localhost,127.0.0.1,::1',
    }
  );

  const [savingProxy, setSavingProxy] = useState(false);
  const [testingProxy, setTestingProxy] = useState(false);
  const [proxyFeedback, setProxyFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    statusCode?: number;
    latencyMs?: number;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (initialProxy) {
      setProxyConfig(initialProxy);
    }
  }, [initialProxy]);

  const handleSaveProxy = async (enable: boolean) => {
    setSavingProxy(true);
    setProxyFeedback(null);
    try {
      const payload: LinuxProxyConfig = {
        ...proxyConfig,
        enabled: enable,
      };

      const res = await configureLinuxServerProxy(server.id, payload, ephemeralPassword);
      if (res.success) {
        setProxyConfig(payload);
        setProxyFeedback({
          message: res.message || (isEn ? 'Persistent proxy configuration saved successfully' : 'تنظیمات پروکسی دائمی با موفقیت ذخیره شد'),
          type: 'success',
        });
      } else {
        setProxyFeedback({
          message: res.message || res.error || (isEn ? 'Failed to apply persistent proxy' : 'خطا در اعمال تنظیمات پروکسی دائمی'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setProxyFeedback({
        message: err?.message || (isEn ? 'Network error configuring proxy' : 'خطای شبکه در ذخیره تنظیمات پروکسی'),
        type: 'error',
      });
    } finally {
      setSavingProxy(false);
    }
  };

  const handleTestProxy = async () => {
    const activeUrl = proxyConfig.httpProxy || proxyConfig.httpsProxy;
    if (!activeUrl) {
      setProxyFeedback({
        message: isEn ? 'Please specify an HTTP or SOCKS proxy URL to test' : 'لطفاً آدرس پروکسی را برای تست وارد کنید',
        type: 'error',
      });
      return;
    }

    setTestingProxy(true);
    setTestResult(null);
    try {
      const res = await testLinuxServerProxy(server.id, activeUrl, 'https://www.google.com', ephemeralPassword);
      setTestResult({
        success: res.success,
        statusCode: res.statusCode,
        latencyMs: res.latencyMs,
        message: res.message || (res.success ? (isEn ? 'Proxy connection test succeeded' : 'ارتباط با پروکسی با موفقیت برقرار شد') : (isEn ? 'Proxy test failed' : 'تست اتصال با پروکسی با شکست مواجه شد')),
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || (isEn ? 'Failed to run proxy test' : 'خطا در اجرای تست پروکسی'),
      });
    } finally {
      setTestingProxy(false);
    }
  };

  return (
    <div
      id="linux-proxy-card"
      className={`p-5 rounded-2xl border space-y-4 ${
        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
      }`}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs sm:text-sm font-bold">
                {isEn ? 'Persistent System-Wide Proxy (Survives Reboot)' : 'ثبت پروکسی دائمی سیستمی (پایدار پس از ریستارت)'}
              </h4>
              <FieldInfoTooltip
                title={isEn ? 'Persistent Linux Proxy' : 'پروکسی دائمی لینوکس'}
                infoWhatEn="Persists HTTP/HTTPS/SOCKS5 proxy settings to /etc/environment, /etc/profile.d/proxy.sh, and /etc/apt/apt.conf.d/95proxies."
                infoWhatFa="تنظیمات پروکسی را در فایل‌های /etc/environment، /etc/profile.d/proxy.sh و کانفیگ APT می‌نویسد تا با ریستارت پاک نشود."
                infoWhyEn="Required for servers behind restricted networks, sanctions, or corporate firewalls to fetch updates and packages seamlessly."
                infoWhyFa="ضروری برای سرورهای درگیر تحریم یا فایروال سازمانی جهت دریافت بدون وقفه پکیج‌ها و اتصال به اینترنت بدون نیاز به تنظیم مجدد."
                infoExampleEn="http://192.168.1.50:8080 or socks5://127.0.0.1:1080 with bypass for 127.0.0.1,localhost,10.0.0.0/8."
                infoExampleFa="پروکسی http://192.168.1.50:8080 یا socks5://127.0.0.1:1080 به همراه مستثنی کردن آی‌پی‌های داخلی."
                isEn={isEn}
                isLightMode={isLightMode}
              />
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              {proxyConfig.enabled
                ? (isEn ? 'Persistent Proxy Status: ACTIVE' : 'وضعیت پروکسی دائمی: فعال')
                : (isEn ? 'Persistent Proxy Status: INACTIVE (Direct Connection)' : 'وضعیت پروکسی دائمی: غیرفعال (اتصال مستقیم)')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-mono px-2.5 py-1 rounded-lg border ${
              proxyConfig.enabled
                ? 'bg-purple-500/15 text-purple-400 border-purple-500/30'
                : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
            }`}
          >
            {proxyConfig.enabled ? (isEn ? 'Enabled in /etc' : 'فعال در سیستم') : (isEn ? 'Direct' : 'مستقیم')}
          </span>
        </div>
      </div>

      {proxyFeedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
            proxyFeedback.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
          }`}
        >
          {proxyFeedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span className="font-mono">{proxyFeedback.message}</span>
        </div>
      )}

      {testResult && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            testResult.success
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2 font-mono">
            {testResult.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{testResult.message}</span>
          </div>
          {testResult.latencyMs !== undefined && (
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-black/30">
              Latency: {testResult.latencyMs}ms (HTTP {testResult.statusCode || 200})
            </span>
          )}
        </div>
      )}

      {/* Proxy Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
        <div>
          <label className="text-xs font-semibold block mb-1">
            {isEn ? 'HTTP Proxy URL' : 'آدرس پروکسی HTTP'}
          </label>
          <input
            type="text"
            id="input-http-proxy"
            placeholder="http://proxy.corp.internal:8080"
            value={proxyConfig.httpProxy || ''}
            onChange={(e) => setProxyConfig({ ...proxyConfig, httpProxy: e.target.value })}
            className={`w-full px-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-purple-500 ${
              isLightMode ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-700 text-white'
            }`}
          />
        </div>

        <div>
          <label className="text-xs font-semibold block mb-1">
            {isEn ? 'HTTPS Proxy URL' : 'آدرس پروکسی HTTPS'}
          </label>
          <input
            type="text"
            id="input-https-proxy"
            placeholder="http://proxy.corp.internal:8080"
            value={proxyConfig.httpsProxy || ''}
            onChange={(e) => setProxyConfig({ ...proxyConfig, httpsProxy: e.target.value })}
            className={`w-full px-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-purple-500 ${
              isLightMode ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-700 text-white'
            }`}
          />
        </div>

        <div>
          <label className="text-xs font-semibold block mb-1">
            {isEn ? 'FTP Proxy (Optional)' : 'پروکسی FTP (اختیاری)'}
          </label>
          <input
            type="text"
            id="input-ftp-proxy"
            placeholder="http://proxy.corp.internal:8080"
            value={proxyConfig.ftpProxy || ''}
            onChange={(e) => setProxyConfig({ ...proxyConfig, ftpProxy: e.target.value })}
            className={`w-full px-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-purple-500 ${
              isLightMode ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-700 text-white'
            }`}
          />
        </div>

        <div>
          <label className="text-xs font-semibold block mb-1">
            {isEn ? 'No Proxy (Exceptions)' : 'مستثنی‌ها (بدون پروکسی)'}
          </label>
          <input
            type="text"
            id="input-no-proxy"
            placeholder="localhost,127.0.0.1,::1,10.0.0.0/8"
            value={proxyConfig.noProxy || ''}
            onChange={(e) => setProxyConfig({ ...proxyConfig, noProxy: e.target.value })}
            className={`w-full px-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-purple-500 ${
              isLightMode ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-700 text-white'
            }`}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            id="btn-test-proxy-connection"
            disabled={testingProxy}
            onClick={handleTestProxy}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              isLightMode
                ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                : 'border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Activity className={`w-3.5 h-3.5 ${testingProxy ? 'animate-spin' : ''}`} />
            <span>{testingProxy ? (isEn ? 'Testing via curl...' : 'در حال تست...') : (isEn ? 'Test Connectivity' : 'تست اتصال با پروکسی')}</span>
          </button>

          {proxyConfig.enabled && (
            <button
              type="button"
              id="btn-disable-proxy"
              disabled={savingProxy}
              onClick={() => handleSaveProxy(false)}
              className="px-3 py-1.5 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs font-semibold transition cursor-pointer"
            >
              {isEn ? 'Clear & Disable Proxy' : 'حذف و غیرفعال‌سازی پروکسی'}
            </button>
          )}
        </div>

        <button
          type="button"
          id="btn-save-persistent-proxy"
          disabled={savingProxy}
          onClick={() => handleSaveProxy(true)}
          className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
        >
          <Check className={`w-3.5 h-3.5 ${savingProxy ? 'animate-spin' : ''}`} />
          <span>
            {savingProxy
              ? (isEn ? 'Saving to /etc...' : 'در حال ثبت در سیستم...')
              : (isEn ? 'Save Persistent Proxy (Survives Reboot)' : 'ثبت پروکسی دائمی (ماندگار با ریستارت)')}
          </span>
        </button>
      </div>
    </div>
  );
};
