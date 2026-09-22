import React, { useState, useEffect } from 'react';
import { ShieldAlert, RefreshCw, CheckCircle2, AlertTriangle, Play, Square, RotateCw, Plus, Unlock, Download } from 'lucide-react';
import { RemoteServer, LinuxFail2banStatus } from '../../../types';
import {
  fetchLinuxFail2ban,
  controlLinuxFail2ban,
  ipActionLinuxFail2ban,
  installLinuxFail2ban,
} from '../../../services/api';
import { FieldInfoTooltip } from '../../common/FieldInfoTooltip';

interface LinuxFail2banSectionProps {
  server: RemoteServer;
  ephemeralPassword?: string;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const LinuxFail2banSection: React.FC<LinuxFail2banSectionProps> = ({
  server,
  ephemeralPassword,
  isLightMode = false,
  isEn = true,
}) => {
  const [f2bStatus, setF2bStatus] = useState<LinuxFail2banStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [controlling, setControlling] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [ipActionLoading, setIpActionLoading] = useState<string | null>(null);
  const [manualBanIp, setManualBanIp] = useState('');
  const [selectedJail, setSelectedJail] = useState('sshd');
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadData = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetchLinuxFail2ban(server.id, ephemeralPassword);
      if (res.success && res.status) {
        setF2bStatus(res.status);
        if (res.status.jails.length > 0 && !res.status.jails.some((j) => j.name === selectedJail)) {
          setSelectedJail(res.status.jails[0].name);
        }
      } else {
        setFeedback({
          message: res.error || (isEn ? 'Failed to fetch Fail2ban status' : 'خطا در واکشی وضعیت Fail2ban'),
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

  const handleControl = async (action: 'start' | 'stop' | 'restart' | 'enable') => {
    setControlling(true);
    setFeedback(null);
    try {
      const res = await controlLinuxFail2ban(server.id, action, ephemeralPassword);
      if (res.success) {
        setFeedback({
          message: res.message || (isEn ? `Fail2ban ${action} succeeded` : `عملیات ${action} در Fail2ban با موفقیت انجام شد`),
          type: 'success',
        });
        loadData();
      } else {
        setFeedback({
          message: res.error || (isEn ? `Fail2ban ${action} failed` : `خطا در اجرای عملیات ${action}`),
          type: 'error',
        });
      }
    } catch (err: any) {
      setFeedback({
        message: err?.message || (isEn ? 'Network error' : 'خطای شبکه'),
        type: 'error',
      });
    } finally {
      setControlling(false);
    }
  };

  const handleInstall = async () => {
    setInstalling(true);
    setFeedback(null);
    try {
      const res = await installLinuxFail2ban(server.id, ephemeralPassword);
      if (res.success) {
        setFeedback({
          message: res.message || (isEn ? 'Fail2ban successfully installed and started' : 'بسته Fail2ban نصب و راه‌اندازی شد'),
          type: 'success',
        });
        loadData();
      } else {
        setFeedback({
          message: res.error || (isEn ? 'Installation failed' : 'خطا در نصب Fail2ban'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setFeedback({
        message: err?.message || (isEn ? 'Network error installing Fail2ban' : 'خطای شبکه در نصب Fail2ban'),
        type: 'error',
      });
    } finally {
      setInstalling(false);
    }
  };

  const handleIpAction = async (jail: string, ip: string, action: 'ban' | 'unban') => {
    const key = `${jail}-${ip}-${action}`;
    setIpActionLoading(key);
    setFeedback(null);
    try {
      const res = await ipActionLinuxFail2ban(server.id, jail, ip, action, ephemeralPassword);
      if (res.success) {
        setFeedback({
          message: res.message || (isEn ? `IP ${ip} ${action}ned successfully` : `آدرس ${ip} با موفقیت ${action === 'unban' ? 'رفع مسدودیت' : 'مسدود'} شد`),
          type: 'success',
        });
        if (action === 'ban') setManualBanIp('');
        loadData();
      } else {
        setFeedback({
          message: res.error || (isEn ? `Failed to ${action} IP` : 'خطا در عملیات IP'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setFeedback({
        message: err?.message || (isEn ? 'Network error' : 'خطای شبکه'),
        type: 'error',
      });
    } finally {
      setIpActionLoading(null);
    }
  };

  return (
    <div
      id="linux-fail2ban-card"
      className={`p-5 rounded-2xl border space-y-5 ${
        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-rose-500/15 text-rose-400">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs sm:text-sm font-bold">
                {isEn ? 'Fail2ban Intrusion Prevention System' : 'سیستم ضد نفوذ و مسدودساز بروت‌فورس Fail2ban'}
              </h4>
              <FieldInfoTooltip
                title={isEn ? 'Fail2ban IPS' : 'سیستم Fail2ban'}
                infoWhatEn="Monitors system logs (auth.log, secure) and dynamically blocks malicious IP addresses with firewall rules."
                infoWhatFa="نظارت خودکار بر لاگ‌های احراز هویت سرور و مسدودسازی آنی آی‌پی‌های مشکوک و حملات بروت‌فورس SSH در فایروال."
                infoWhyEn="Essential defense mechanism against dictionary attacks, SSH brute-forcing, and credential stuffing on exposed public ports."
                infoWhyFa="دفاع خودکار در برابر هزاران تلاش ناموفق ورود با رمز عبور و قطع دسترسی بات‌های مخرب اینترنتی."
                infoExampleEn="Jail: sshd (bans after 5 failed authentication attempts for 10 minutes)."
                infoExampleFa="جیل sshd: مسدودسازی خودکار آی‌پی مهاجم پس از ۵ بار ورود اشتباه به مدت ۱۰ دقیقه."
                isEn={isEn}
                isLightMode={isLightMode}
              />
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              {isEn ? 'Status:' : 'وضعیت:'}{' '}
              <strong className={f2bStatus?.active ? 'text-emerald-400' : f2bStatus?.installed ? 'text-amber-400' : 'text-slate-400'}>
                {!f2bStatus?.installed
                  ? isEn
                    ? 'Not Installed'
                    : 'نصب نشده'
                  : f2bStatus?.active
                  ? isEn
                    ? `Active (${f2bStatus.version || 'running'})`
                    : `فعال (${f2bStatus.version || 'در حال اجرا'})`
                  : isEn
                  ? 'Inactive (Service Stopped)'
                  : 'متوقف‌شده'}
              </strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={loadData}
            id="btn-refresh-fail2ban"
            title={isEn ? 'Reload Fail2ban' : 'بارگذاری مجدد'}
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

      {/* If Not Installed */}
      {f2bStatus && !f2bStatus.installed && (
        <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="text-xs font-bold text-rose-300 block">
              {isEn ? 'Fail2ban package is not installed on this server' : 'پکیج Fail2ban روی این سرور نصب نیست'}
            </span>
            <p className="text-[11px] text-rose-200/80">
              {isEn
                ? 'Install fail2ban to automatically block brute-force attacks and protect SSH and system daemons.'
                : 'نصب fail2ban سرور شما را در برابر حملات رمزگشایی و تلاش‌های مکرر نفوذ به SSH ایمن می‌سازد.'}
            </p>
          </div>

          <button
            type="button"
            id="btn-install-fail2ban"
            disabled={installing}
            onClick={handleInstall}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap self-start sm:self-auto disabled:opacity-50"
          >
            <Download className={`w-3.5 h-3.5 ${installing ? 'animate-spin' : ''}`} />
            <span>{installing ? (isEn ? 'Installing via apt/yum...' : 'در حال نصب...') : (isEn ? 'Install Fail2ban Now' : 'نصب خودکار Fail2ban')}</span>
          </button>
        </div>
      )}

      {/* If Installed: Service Controls & Jails */}
      {f2bStatus?.installed && (
        <>
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-950/40 border border-white/5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">
                {isEn ? 'Daemon Control:' : 'کنترل سرویس:'}
              </span>
              {!f2bStatus.active ? (
                <button
                  type="button"
                  id="btn-f2b-start"
                  disabled={controlling}
                  onClick={() => handleControl('start')}
                  className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1"
                >
                  <Play className="w-3 h-3" />
                  <span>{isEn ? 'Start Service' : 'شروع سرویس'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  id="btn-f2b-stop"
                  disabled={controlling}
                  onClick={() => handleControl('stop')}
                  className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1"
                >
                  <Square className="w-3 h-3" />
                  <span>{isEn ? 'Stop Service' : 'توقف سرویس'}</span>
                </button>
              )}

              <button
                type="button"
                id="btn-f2b-restart"
                disabled={controlling}
                onClick={() => handleControl('restart')}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs transition cursor-pointer flex items-center gap-1"
              >
                <RotateCw className={`w-3 h-3 ${controlling ? 'animate-spin' : ''}`} />
                <span>{isEn ? 'Restart' : 'ریستارت'}</span>
              </button>
            </div>

            {/* Quick Ban Manual Input */}
            <div className="flex items-center gap-2">
              <select
                value={selectedJail}
                onChange={(e) => setSelectedJail(e.target.value)}
                className={`px-2 py-1 rounded-lg text-xs font-mono border focus:outline-none ${
                  isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700 text-white'
                }`}
              >
                {f2bStatus.jails.map((j) => (
                  <option key={j.name} value={j.name}>
                    {j.name}
                  </option>
                ))}
              </select>

              <input
                type="text"
                id="input-manual-ban-ip"
                placeholder={isEn ? 'IP to ban (e.g. 198.51.100.4)' : 'آی‌پی جهت مسدودسازی'}
                value={manualBanIp}
                onChange={(e) => setManualBanIp(e.target.value)}
                className={`w-36 sm:w-44 px-2 py-1 rounded-lg text-xs font-mono border focus:outline-none ${
                  isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
                }`}
              />

              <button
                type="button"
                id="btn-manual-ban-ip"
                disabled={!manualBanIp.trim() || !selectedJail}
                onClick={() => handleIpAction(selectedJail, manualBanIp.trim(), 'ban')}
                className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
              >
                <Plus className="w-3 h-3" />
                <span>{isEn ? 'Ban IP' : 'مسدودسازی'}</span>
              </button>
            </div>
          </div>

          {/* Jails & Banned IPs */}
          <div className="space-y-4">
            <span className="text-xs font-bold text-slate-300 block">
              {isEn ? 'Active Jails & Real-time Ban List' : 'جیل‌های فعال و لیست آی‌پی‌های مسدودشده'}
            </span>

            {f2bStatus.jails.length === 0 ? (
              <div className="p-4 rounded-xl border border-slate-800 text-center text-xs text-slate-400">
                {isEn ? 'No active jails reported by fail2ban-client.' : 'هیچ جیلی در حال حاضر گزارش نشده است.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {f2bStatus.jails.map((jail) => (
                  <div
                    key={jail.name}
                    className={`p-4 rounded-xl border space-y-3 ${
                      isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/50 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-rose-400 font-mono">
                          [{jail.name}]
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {isEn ? 'Currently Banned:' : 'مسدود فعلی:'} <strong>{jail.currentlyBanned}</strong>
                        </span>
                      </div>

                      <span className="text-[10px] font-mono text-slate-500">
                        {isEn ? `Total: ${jail.totalBanned} | Failed: ${jail.currentlyFailed}` : `کل مسدودها: ${jail.totalBanned}`}
                      </span>
                    </div>

                    {/* Banned IPs list */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] uppercase font-mono text-slate-400 block">
                        {isEn ? 'Banned IP Addresses' : 'آدرس‌های IP مسدود شده'}
                      </span>
                      {jail.bannedIps.length === 0 ? (
                        <span className="text-xs text-slate-500 italic block py-1">
                          {isEn ? 'No IPs currently banned in this jail.' : 'در حال حاضر هیچ آی‌پی در این جیل مسدود نیست.'}
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                          {jail.bannedIps.map((ip) => {
                            const isUnbanning = ipActionLoading === `${jail.name}-${ip}-unban`;
                            return (
                              <span
                                key={ip}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 text-xs font-mono"
                              >
                                <span>{ip}</span>
                                <button
                                  type="button"
                                  disabled={isUnbanning}
                                  onClick={() => handleIpAction(jail.name, ip, 'unban')}
                                  className="hover:text-emerald-400 transition cursor-pointer p-0.5"
                                  title={isEn ? `Unban ${ip}` : `رفع مسدودیت ${ip}`}
                                >
                                  {isUnbanning ? (
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Unlock className="w-3 h-3" />
                                  )}
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
