import React, { useState, useEffect } from 'react';
import { Lock, Shield, RefreshCw, CheckCircle2, AlertTriangle, AlertCircle, Plus, Trash2, Zap, Save } from 'lucide-react';
import { RemoteServer, LinuxSshConfig } from '../../../types';
import {
  fetchLinuxSshConfig,
  updateLinuxSshConfig,
  changeLinuxServerSshPort,
} from '../../../services/api';
import { FieldInfoTooltip } from '../../common/FieldInfoTooltip';

interface LinuxSshSectionProps {
  server: RemoteServer;
  ephemeralPassword?: string;
  isLightMode?: boolean;
  isEn?: boolean;
  onSshPortChanged?: (newPort: number) => void;
}

export const LinuxSshSection: React.FC<LinuxSshSectionProps> = ({
  server,
  ephemeralPassword,
  isLightMode = false,
  isEn = true,
  onSshPortChanged,
}) => {
  const [sshConfig, setSshConfig] = useState<LinuxSshConfig>({
    port: server.ssh_port || 22,
    permitRootLogin: 'prohibit-password',
    passwordAuthentication: 'yes',
    maxAuthTries: 5,
    clientAliveInterval: 300,
    clientAliveCountMax: 3,
    x11Forwarding: 'no',
    allowedIps: [],
  });

  const [newAllowedIp, setNewAllowedIp] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadData = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetchLinuxSshConfig(server.id, ephemeralPassword);
      if (res.success && res.config) {
        setSshConfig(res.config);
      } else {
        setFeedback({
          message: res.error || (isEn ? 'Failed to fetch SSH config' : 'خطا در واکشی تنظیمات SSH'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setFeedback({
        message: err?.message || (isEn ? 'Network error' : 'خطای ارتباط با سرور'),
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [server.id, ephemeralPassword]);

  const handleAddAllowedIp = () => {
    const ip = newAllowedIp.trim();
    if (!ip) return;
    if (sshConfig.allowedIps.includes(ip)) return;
    setSshConfig({
      ...sshConfig,
      allowedIps: [...sshConfig.allowedIps, ip],
    });
    setNewAllowedIp('');
  };

  const handleRemoveAllowedIp = (ip: string) => {
    setSshConfig({
      ...sshConfig,
      allowedIps: sshConfig.allowedIps.filter((item) => item !== ip),
    });
  };

  const handleSaveConfig = async () => {
    const portNum = Number(sshConfig.port);
    if (!portNum || isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setFeedback({
        message: isEn ? 'Port must be between 1 and 65535' : 'پورت باید بین ۱ تا ۶۵۵۳۵ باشد',
        type: 'error',
      });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const res = await updateLinuxSshConfig(server.id, sshConfig, ephemeralPassword);
      if (res.success) {
        setFeedback({
          message: res.message || (isEn ? 'SSH configuration and hardening applied successfully' : 'تنظیمات و امنیت SSH با موفقیت اعمال شد'),
          type: 'success',
        });
        setShowConfirm(false);
        if (onSshPortChanged && portNum !== server.ssh_port) {
          onSshPortChanged(portNum);
        }
        loadData();
      } else {
        setFeedback({
          message: res.error || (isEn ? 'Failed to apply SSH configuration' : 'خطا در اعمال تنظیمات SSH'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setFeedback({
        message: err?.message || (isEn ? 'Network error' : 'خطای شبکه'),
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      id="linux-ssh-security-card"
      className={`p-5 rounded-2xl border space-y-5 ${
        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs sm:text-sm font-bold">
                {isEn ? 'SSH Security, Port & Allowed Client IPs' : 'امنیت پیشرفته، تغییر پورت و IPهای مجاز اتصال SSH'}
              </h4>
              <FieldInfoTooltip
                title={isEn ? 'SSH Security Hardening' : 'امنیت سرویس SSH'}
                infoWhatEn="Configures sshd listening port, client IP whitelisting, authentication limits, and keepalive intervals."
                infoWhatFa="تنظیم پورت گوش‌دهنده sshd، محدودسازی دسترسی به آی‌پی‌های مجاز، غیرفعال‌سازی پسورد و زنده نگه‌داشتن نشست‌ها."
                infoWhyEn="Hardening SSH prevents 99% of automated brute-force attacks and prevents unauthorized remote access."
                infoWhyFa="تغییر پورت و محدود کردن دسترسی به IPهای مشخص مانع نفوذ هکرها و ربات‌های اسکنر اینترنتی می‌شود."
                infoExampleEn="Port: 2222, Allowed IPs: 192.168.1.0/24 or your static VPN IP, Root Login: prohibit-password."
                infoExampleFa="پورت: ۲۲۲۲، آی‌پی مجاز: آی‌پی استاتیک یا وی‌پی‌ان، ورود روت: کلید عمومی."
                isEn={isEn}
                isLightMode={isLightMode}
              />
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              {isEn ? 'Active Listening Port:' : 'پورت فعال فعلی:'}{' '}
              <strong className="text-amber-400">{server.ssh_port || sshConfig.port || 22}</strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
            <Shield className="w-3 h-3" />
            <span>{isEn ? 'Syntax Test (sshd -t) Enabled' : 'تست اعتبار sshd -t فعال'}</span>
          </span>

          <button
            type="button"
            disabled={loading}
            onClick={loadData}
            id="btn-refresh-ssh"
            title={isEn ? 'Reload SSH Config' : 'بارگذاری مجدد'}
            className={`p-2 rounded-lg border transition cursor-pointer disabled:opacity-50 ${
              isLightMode ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700' : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
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

      {/* Grid of Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Port */}
        <div
          className={`p-3.5 rounded-xl border space-y-1 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-white/5'
          }`}
        >
          <label className="text-xs font-semibold block text-slate-300">
            {isEn ? 'SSH Port (1 - 65535)' : 'پورت سرویس SSH (۱ تا ۶۵۵۳۵)'}
          </label>
          <span className="text-[10px] text-slate-400 block">
            {isEn ? 'Non-standard port defends against scans.' : 'پورت غیر پیش‌فرض جلوی اسکنرهای خودکار را می‌گیرد.'}
          </span>
          <input
            type="number"
            min={1}
            max={65535}
            id="input-ssh-port"
            value={sshConfig.port}
            onChange={(e) => setSshConfig({ ...sshConfig, port: Number(e.target.value) })}
            className={`w-full px-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
              isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
            }`}
          />
        </div>

        {/* PermitRootLogin */}
        <div
          className={`p-3.5 rounded-xl border space-y-1 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-white/5'
          }`}
        >
          <label className="text-xs font-semibold block text-slate-300">
            {isEn ? 'Permit Root Login' : 'ورود مستقیم کاربر Root'}
          </label>
          <span className="text-[10px] text-slate-400 block">
            {isEn ? 'prohibit-password allows SSH keys only.' : 'گزینه prohibit-password فقط کلید SSH را مجاز می‌کند.'}
          </span>
          <select
            id="select-permit-root-login"
            value={sshConfig.permitRootLogin}
            onChange={(e) => setSshConfig({ ...sshConfig, permitRootLogin: e.target.value as any })}
            className={`w-full px-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
              isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
            }`}
          >
            <option value="prohibit-password">{isEn ? 'Prohibit Password (Key Only - Recommended)' : 'فقط با کلید عمومی (پیشنهادی)'}</option>
            <option value="no">{isEn ? 'No (Root Login Completely Disabled)' : 'خیر (مسدودسازی کامل ورود روت)'}</option>
            <option value="yes">{isEn ? 'Yes (Allow Password & Key)' : 'بله (ورود با رمز و کلید)'}</option>
          </select>
        </div>

        {/* PasswordAuthentication */}
        <div
          className={`p-3.5 rounded-xl border space-y-1 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-white/5'
          }`}
        >
          <label className="text-xs font-semibold block text-slate-300">
            {isEn ? 'Password Authentication' : 'ورود با کلمه عبور (Password)'}
          </label>
          <span className="text-[10px] text-slate-400 block">
            {isEn ? 'Disabling forces SSH key authentication.' : 'غیرفعال‌سازی فقط ورود با کلید SSH را معتبر می‌داند.'}
          </span>
          <select
            id="select-password-auth"
            value={sshConfig.passwordAuthentication}
            onChange={(e) => setSshConfig({ ...sshConfig, passwordAuthentication: e.target.value as any })}
            className={`w-full px-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
              isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
            }`}
          >
            <option value="yes">{isEn ? 'Yes (Passwords Permitted)' : 'بله (ورود با کلمه عبور مجاز)'}</option>
            <option value="no">{isEn ? 'No (SSH Keys Only - Secure)' : 'خیر (فقط کلیدهای SSH - امن)'}</option>
          </select>
        </div>

        {/* MaxAuthTries */}
        <div
          className={`p-3.5 rounded-xl border space-y-1 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-white/5'
          }`}
        >
          <label className="text-xs font-semibold block text-slate-300">
            {isEn ? 'Max Authentication Tries' : 'حداکثر دفعات تلاش ناموفق'}
          </label>
          <span className="text-[10px] text-slate-400 block">
            {isEn ? 'Drop connection after N failed tries.' : 'قطع ارتباط پس از N بار تلاش اشتباه.'}
          </span>
          <input
            type="number"
            min={1}
            max={20}
            id="input-max-auth-tries"
            value={sshConfig.maxAuthTries}
            onChange={(e) => setSshConfig({ ...sshConfig, maxAuthTries: Number(e.target.value) })}
            className={`w-full px-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
              isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
            }`}
          />
        </div>

        {/* ClientAliveInterval (Keepalive) */}
        <div
          className={`p-3.5 rounded-xl border space-y-1 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-white/5'
          }`}
        >
          <label className="text-xs font-semibold block text-slate-300">
            {isEn ? 'Client Keepalive Interval (seconds)' : 'فاصله ارسال بسته زنده نگه‌دارنده (ثانیه)'}
          </label>
          <span className="text-[10px] text-slate-400 block">
            {isEn ? 'Prevents session timeout/disconnection.' : 'جلوگیری از قطع ناگهانی ارتباط در پشت فایروال.'}
          </span>
          <input
            type="number"
            min={0}
            max={3600}
            id="input-keepalive-interval"
            value={sshConfig.clientAliveInterval}
            onChange={(e) => setSshConfig({ ...sshConfig, clientAliveInterval: Number(e.target.value) })}
            className={`w-full px-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
              isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
            }`}
          />
        </div>

        {/* ClientAliveCountMax */}
        <div
          className={`p-3.5 rounded-xl border space-y-1 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-white/5'
          }`}
        >
          <label className="text-xs font-semibold block text-slate-300">
            {isEn ? 'Client Alive Count Max' : 'تعداد بسته‌های بی‌پاسخ قبل از خروج'}
          </label>
          <span className="text-[10px] text-slate-400 block">
            {isEn ? 'Threshold before declaring client dead.' : 'آستانه قطع جلسه در صورت عدم پاسخ کلاینت.'}
          </span>
          <input
            type="number"
            min={1}
            max={100}
            id="input-keepalive-count"
            value={sshConfig.clientAliveCountMax}
            onChange={(e) => setSshConfig({ ...sshConfig, clientAliveCountMax: Number(e.target.value) })}
            className={`w-full px-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
              isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
            }`}
          />
        </div>
      </div>

      {/* Allowed Client IPs Restriction (Crucial Feature Requested) */}
      <div
        className={`p-4 rounded-xl border space-y-3 ${
          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-white/5'
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-300">
                {isEn ? 'Allowed Client IPs / Subnets for SSH' : 'تعریف IPها یا ساب‌نت‌های مجاز جهت اتصال به SSH'}
              </span>
              <FieldInfoTooltip
                title={isEn ? 'SSH IP Whitelist' : 'لیست مجاز IP برای SSH'}
                infoWhatEn="Restricts SSH daemon access to only specific IP addresses or CIDR subnets."
                infoWhatFa="تنظیم دسترسی ورود به SSH فقط و فقط برای آی‌پی‌ها یا ساب‌نت‌های مشخص‌شده."
                infoWhyEn="If configured, unauthorized IP addresses will be immediately rejected at the TCP layer, eliminating attack surface."
                infoWhyFa="در صورت تعریف، سایر آی‌پی‌های ناشناس اینترنت بلافاصله در لایه شبکه ریجکت شده و امکان آزمون پسورد نخواهند داشت."
                infoExampleEn="192.168.1.100, 10.10.0.0/16, or corporate VPN static IP. Leave empty to allow connections from any IP."
                infoExampleFa="۱۹۲.۱۶۸.۱.۱۰۰ یا ۱۰.۰.۰.۰/۲۴ یا IP استاتیک ادمین. اگر خالی باشد، از هر IP می‌توان وصل شد."
                isEn={isEn}
                isLightMode={isLightMode}
              />
            </div>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              {sshConfig.allowedIps.length === 0
                ? isEn
                  ? 'All IP addresses are currently permitted to connect (No restriction active).'
                  : 'در حال حاضر اتصال از تمام IPها مجاز است (محدودیت آی‌پی غیرفعال است).'
                : isEn
                ? `Only ${sshConfig.allowedIps.length} allowed IP(s)/subnet(s) will be granted access.`
                : `فقط ${sshConfig.allowedIps.length} آدرس یا ساب‌نت مجاز دسترسی خواهند داشت.`}
            </span>
          </div>

          <span
            className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
              sshConfig.allowedIps.length > 0
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {sshConfig.allowedIps.length > 0
              ? isEn
                ? 'IP Restricted'
                : 'دسترسی محدودشده'
              : isEn
              ? 'Unrestricted'
              : 'نامحدود'}
          </span>
        </div>

        {/* Chips */}
        <div className="flex flex-wrap gap-2">
          {sshConfig.allowedIps.map((ip) => (
            <span
              key={ip}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono text-xs"
            >
              <span>{ip}</span>
              <button
                type="button"
                onClick={() => handleRemoveAllowedIp(ip)}
                className="hover:text-rose-400 transition cursor-pointer p-0.5"
                title={isEn ? `Remove ${ip}` : `حذف ${ip}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>

        {/* Input to add IP / CIDR */}
        <div className="flex items-center gap-2 max-w-md pt-1">
          <input
            type="text"
            id="input-allowed-ssh-ip"
            placeholder={isEn ? 'e.g. 192.168.1.50 or 10.0.0.0/24' : 'مثال: 192.168.1.50 یا 10.0.0.0/24'}
            value={newAllowedIp}
            onChange={(e) => setNewAllowedIp(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddAllowedIp()}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
              isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
            }`}
          />
          <button
            type="button"
            id="btn-add-allowed-ssh-ip"
            onClick={handleAddAllowedIp}
            disabled={!newAllowedIp.trim()}
            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isEn ? 'Allow IP' : 'افزودن IP'}</span>
          </button>
        </div>
      </div>

      {/* Save Action */}
      <div className="flex justify-end pt-2 border-t border-white/5">
        <button
          type="button"
          id="btn-open-confirm-ssh"
          disabled={saving}
          onClick={() => setShowConfirm(true)}
          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
        >
          <Save className={`w-3.5 h-3.5 ${saving ? 'animate-spin' : ''}`} />
          <span>{isEn ? 'Save SSH Security & Port Configuration' : 'ثبت تنظیمات امنیت و پورت SSH'}</span>
        </button>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h5 className="text-xs font-bold text-amber-300">
                {isEn ? 'Confirm SSH Configuration & Port Changes' : 'تایید اعمال تغییرات در سرویس SSH'}
              </h5>
              <p className="text-[11px] text-amber-200/80 mt-1">
                {isEn
                  ? `Target Port: ${sshConfig.port}. The server configuration will be tested with "sshd -t" prior to applying. If Allowed IPs are set (${sshConfig.allowedIps.length}), only those IPs will be able to connect.`
                  : `پورت هدف: ${sshConfig.port}. قبل از ریستارت سرویس، دستور sshd -t جهت اطمینان از سلامت کانفیگ اجرا می‌شود. در صورت تنظیم IPهای مجاز (${sshConfig.allowedIps.length} آدرس)، دسترسی مابقی قطع خواهد شد.`}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold border ${
                isLightMode ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'
              }`}
            >
              {isEn ? 'Cancel' : 'انصراف'}
            </button>
            <button
              type="button"
              id="btn-apply-ssh-confirmed"
              disabled={saving}
              onClick={handleSaveConfig}
              className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              <Zap className={`w-3 h-3 ${saving ? 'animate-spin' : ''}`} />
              <span>{saving ? (isEn ? 'Validating & Applying...' : 'در حال اعتبارسنجی و ثبت...') : (isEn ? 'Yes, Validate and Apply' : 'بله، تست و اعمال شود')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
