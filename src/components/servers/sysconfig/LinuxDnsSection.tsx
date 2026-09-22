import React, { useState, useEffect } from 'react';
import { Network, Plus, Trash2, Save, RefreshCw, CheckCircle2, AlertTriangle, Zap, Check } from 'lucide-react';
import { RemoteServer, LinuxDnsConfig } from '../../../types';
import { fetchLinuxDnsConfig, updateLinuxDnsConfig } from '../../../services/api';
import { FieldInfoTooltip } from '../../common/FieldInfoTooltip';

interface LinuxDnsSectionProps {
  server: RemoteServer;
  ephemeralPassword?: string;
  isLightMode?: boolean;
  isEn?: boolean;
}

const DNS_PRESETS = [
  { name: 'Google DNS', servers: ['8.8.8.8', '8.8.4.4'] },
  { name: 'Cloudflare', servers: ['1.1.1.1', '1.0.0.1'] },
  { name: 'Quad9', servers: ['9.9.9.9', '149.112.112.112'] },
  { name: 'Shecan (Sanctions Bypass)', servers: ['178.22.122.100', '185.51.200.2'] },
  { name: 'Electro', servers: ['78.157.42.101', '78.157.42.100'] },
];

export const LinuxDnsSection: React.FC<LinuxDnsSectionProps> = ({
  server,
  ephemeralPassword,
  isLightMode = false,
  isEn = true,
}) => {
  const [dnsConfig, setDnsConfig] = useState<LinuxDnsConfig>({
    nameservers: [],
    searchDomains: [],
    source: '',
  });
  const [newServerIp, setNewServerIp] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadData = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetchLinuxDnsConfig(server.id, ephemeralPassword);
      if (res.success && res.config) {
        setDnsConfig(res.config);
      } else {
        setFeedback({
          message: res.error || (isEn ? 'Failed to fetch DNS configuration' : 'خطا در واکشی تنظیمات DNS'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setFeedback({
        message: err?.message || (isEn ? 'Network error fetching DNS' : 'خطای شبکه در دریافت DNS'),
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [server.id, ephemeralPassword]);

  const handleAddServer = () => {
    const ip = newServerIp.trim();
    if (!ip) return;
    if (dnsConfig.nameservers.includes(ip)) {
      setFeedback({
        message: isEn ? 'Nameserver already exists' : 'این سرور DNS قبلاً اضافه شده است',
        type: 'error',
      });
      return;
    }
    setDnsConfig({
      ...dnsConfig,
      nameservers: [...dnsConfig.nameservers, ip],
    });
    setNewServerIp('');
  };

  const handleRemoveServer = (ip: string) => {
    setDnsConfig({
      ...dnsConfig,
      nameservers: dnsConfig.nameservers.filter((s) => s !== ip),
    });
  };

  const handleAddDomain = () => {
    const d = newDomain.trim();
    if (!d) return;
    if (dnsConfig.searchDomains.includes(d)) return;
    setDnsConfig({
      ...dnsConfig,
      searchDomains: [...dnsConfig.searchDomains, d],
    });
    setNewDomain('');
  };

  const handleRemoveDomain = (d: string) => {
    setDnsConfig({
      ...dnsConfig,
      searchDomains: dnsConfig.searchDomains.filter((x) => x !== d),
    });
  };

  const applyPreset = (servers: string[]) => {
    setDnsConfig({
      ...dnsConfig,
      nameservers: [...servers],
    });
    setFeedback({
      message: isEn ? 'Preset loaded. Click Apply to save to server.' : 'پری‌ست اعمال شد. جهت ذخیره در سرور روی اعمال تنظیمات کلیک کنید.',
      type: 'success',
    });
  };

  const handleSave = async () => {
    if (dnsConfig.nameservers.length === 0) {
      setFeedback({
        message: isEn ? 'At least one DNS nameserver is required' : 'حداقل یک سرور DNS مورد نیاز است',
        type: 'error',
      });
      return;
    }

    setSaving(true);
    setFeedback(null);
    setTestResult(null);
    try {
      const res = await updateLinuxDnsConfig(
        server.id,
        {
          nameservers: dnsConfig.nameservers,
          searchDomains: dnsConfig.searchDomains,
        },
        ephemeralPassword
      );

      if (res.success) {
        setFeedback({
          message: res.message || (isEn ? 'DNS configuration saved' : 'تنظیمات DNS با موفقیت ثبت شد'),
          type: 'success',
        });
        if (res.testResult) {
          setTestResult(res.testResult);
        }
        loadData();
      } else {
        setFeedback({
          message: res.error || (isEn ? 'Failed to apply DNS' : 'خطا در ثبت تنظیمات DNS'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setFeedback({
        message: err?.message || (isEn ? 'Network error saving DNS' : 'خطای شبکه در ذخیره DNS'),
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      id="linux-dns-card"
      className={`p-5 rounded-2xl border space-y-5 ${
        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-400">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs sm:text-sm font-bold">
                {isEn ? 'DNS Configuration & Nameservers' : 'تنظیمات DNS و سرورهای نام'}
              </h4>
              <FieldInfoTooltip
                title={isEn ? 'Linux DNS Nameservers' : 'سرورهای DNS لینوکس'}
                infoWhatEn="Manages DNS resolvers in /etc/resolv.conf and systemd-resolved (resolvectl)."
                infoWhatFa="تنظیم سرورهای نام در فایل /etc/resolv.conf و سرویس systemd-resolved جهت تبدیل نام دامنه به IP."
                infoWhyEn="Vital for domain resolution, package repository access (apt-get), external API calls, and overcoming regional sanctions or restrictions."
                infoWhyFa="حیاتی برای دسترسی به اینترنت، مخازن پکیج اوبونتو و دبیان، و گذر از تحریم‌ها با DNSهای عبور تحریم مانند شکن و الکترو."
                infoExampleEn="8.8.8.8, 1.1.1.1, or Shecan 178.22.122.100"
                infoExampleFa="۸.۸.۸.۸ یا ۱.۱.۱.۱ یا شکن ۱۷۸.۲۲.۱۲۲.۱۰۰"
                isEn={isEn}
                isLightMode={isLightMode}
              />
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              {isEn ? 'Resolver Backend:' : 'سیستم نام‌گذاری فعال:'}{' '}
              <strong className="text-cyan-400">{dnsConfig.source || '/etc/resolv.conf'}</strong>
            </span>
          </div>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={loadData}
          id="btn-refresh-dns"
          title={isEn ? 'Reload DNS' : 'بارگذاری مجدد'}
          className={`p-2 rounded-lg border transition cursor-pointer disabled:opacity-50 ${
            isLightMode ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700' : 'bg-slate-800 border-slate-700 text-slate-300'
          }`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span className="font-mono">{feedback.message}</span>
        </div>
      )}

      {testResult && (
        <div className="p-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-xs flex items-center gap-2 text-cyan-300 font-mono">
          <Zap className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>
            {isEn ? 'Resolution verification:' : 'نتیجه تست تفکیک نام:'} {testResult}
          </span>
        </div>
      )}

      {/* Quick Presets */}
      <div>
        <span className="text-[11px] text-slate-400 block mb-1.5 font-medium">
          {isEn ? 'Quick DNS Presets' : 'پری‌ست‌های آماده DNS'}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {DNS_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => applyPreset(preset.servers)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono border transition cursor-pointer flex items-center gap-1 ${
                isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                  : 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-slate-300'
              }`}
            >
              <span>{preset.name}</span>
              <span className="text-[10px] text-slate-500">({preset.servers[0]})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Nameservers List & Add */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-slate-300 block">
          {isEn ? 'Active DNS Nameservers' : 'سرورهای DNS فعال'}
        </span>
        <div className="flex flex-wrap gap-2">
          {dnsConfig.nameservers.map((ip) => (
            <span
              key={ip}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono text-xs"
            >
              <span>{ip}</span>
              <button
                type="button"
                onClick={() => handleRemoveServer(ip)}
                className="hover:text-rose-400 transition cursor-pointer p-0.5"
                title={isEn ? 'Remove Server' : 'حذف سرور'}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </span>
          ))}
          {dnsConfig.nameservers.length === 0 && (
            <span className="text-xs text-slate-400 italic">
              {isEn ? 'No nameservers configured.' : 'هیچ سرور DNS مشخص نشده است.'}
            </span>
          )}
        </div>

        {/* Add Server Input */}
        <div className="flex items-center gap-2 pt-1 max-w-md">
          <input
            type="text"
            id="input-dns-ip"
            placeholder="e.g. 1.1.1.1"
            value={newServerIp}
            onChange={(e) => setNewServerIp(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddServer()}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
              isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
            }`}
          />
          <button
            type="button"
            id="btn-add-dns-ip"
            onClick={handleAddServer}
            disabled={!newServerIp.trim()}
            className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isEn ? 'Add' : 'افزودن'}</span>
          </button>
        </div>
      </div>

      {/* Search Domains */}
      <div className="space-y-2 pt-2 border-t border-white/5">
        <span className="text-xs font-semibold text-slate-300 block">
          {isEn ? 'Search Domains (Optional)' : 'دامنه‌های جستجوی محلی (اختیاری)'}
        </span>
        <div className="flex flex-wrap gap-2">
          {dnsConfig.searchDomains.map((d) => (
            <span
              key={d}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 font-mono text-xs"
            >
              <span>{d}</span>
              <button
                type="button"
                onClick={() => handleRemoveDomain(d)}
                className="hover:text-rose-400 transition cursor-pointer p-0.5"
                title={isEn ? 'Remove Domain' : 'حذف دامنه'}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-1 max-w-md">
          <input
            type="text"
            id="input-dns-domain"
            placeholder="e.g. corp.internal or local"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddDomain()}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
              isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
            }`}
          />
          <button
            type="button"
            id="btn-add-dns-domain"
            onClick={handleAddDomain}
            disabled={!newDomain.trim()}
            className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isEn ? 'Add' : 'افزودن'}</span>
          </button>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-3 border-t border-white/5">
        <button
          type="button"
          id="btn-apply-dns"
          disabled={saving || dnsConfig.nameservers.length === 0}
          onClick={handleSave}
          className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
        >
          <Save className={`w-3.5 h-3.5 ${saving ? 'animate-spin' : ''}`} />
          <span>{saving ? (isEn ? 'Applying DNS...' : 'در حال اعمال DNS...') : (isEn ? 'Apply DNS Configuration' : 'اعمال و ذخیره تنظیمات DNS')}</span>
        </button>
      </div>
    </div>
  );
};
