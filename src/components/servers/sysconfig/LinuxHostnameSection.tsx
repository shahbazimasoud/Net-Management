import React, { useState, useEffect } from 'react';
import {
  Globe,
  Plus,
  Trash2,
  Edit2,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Check,
  FileText,
  ShieldCheck,
  ShieldAlert,
  Code2,
  Table as TableIcon,
  X,
  Info,
} from 'lucide-react';
import {
  RemoteServer,
  LinuxHostEntry,
  LinuxHostnameInfo,
  LinuxTcpWrapperRule,
  LinuxTcpWrappersData,
} from '../../../types';
import {
  fetchLinuxHostname,
  updateLinuxHostname,
  fetchLinuxHostsFile,
  updateLinuxHostsFile,
  fetchLinuxTcpWrappers,
  updateLinuxTcpWrappers,
} from '../../../services/api';
import { FieldInfoTooltip } from '../../common/FieldInfoTooltip';

interface LinuxHostnameSectionProps {
  server: RemoteServer;
  ephemeralPassword?: string;
  isLightMode?: boolean;
  isEn?: boolean;
}

type ActiveTab = 'hosts' | 'hosts-allow' | 'hosts-deny';

export const LinuxHostnameSection: React.FC<LinuxHostnameSectionProps> = ({
  server,
  ephemeralPassword,
  isLightMode = false,
  isEn = true,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('hosts');

  // Hostname states
  const [hostnameInfo, setHostnameInfo] = useState<LinuxHostnameInfo | null>(null);
  const [newHostname, setNewHostname] = useState('');
  const [updateHostsOnRename, setUpdateHostsOnRename] = useState(true);
  const [savingHostname, setSavingHostname] = useState(false);

  // /etc/hosts states
  const [hostsEntries, setHostsEntries] = useState<LinuxHostEntry[]>([]);
  const [rawHosts, setRawHosts] = useState('');
  const [hostsViewMode, setHostsViewMode] = useState<'table' | 'raw'>('table');
  const [savingHosts, setSavingHosts] = useState(false);

  // /etc/hosts Add/Edit Form
  const [newIp, setNewIp] = useState('');
  const [newHostnames, setNewHostnames] = useState('');
  const [newComment, setNewComment] = useState('');
  const [editingOldIp, setEditingOldIp] = useState<string | null>(null);

  // TCP Wrappers (hosts.allow & hosts.deny) states
  const [tcpData, setTcpData] = useState<LinuxTcpWrappersData>({
    allowRules: [],
    denyRules: [],
    rawAllow: '',
    rawDeny: '',
  });
  const [allowViewMode, setAllowViewMode] = useState<'table' | 'raw'>('table');
  const [denyViewMode, setDenyViewMode] = useState<'table' | 'raw'>('table');
  const [savingTcp, setSavingTcp] = useState(false);

  // TCP Add/Edit Form for hosts.allow
  const [allowDaemon, setAllowDaemon] = useState('sshd');
  const [allowClients, setAllowClients] = useState('');
  const [allowOptions, setAllowOptions] = useState(': ALLOW');
  const [allowComment, setAllowComment] = useState('');
  const [editingAllowIndex, setEditingAllowIndex] = useState<number | null>(null);
  const [editingAllowId, setEditingAllowId] = useState<string | null>(null);

  // TCP Add/Edit Form for hosts.deny
  const [denyDaemon, setDenyDaemon] = useState('ALL');
  const [denyClients, setDenyClients] = useState('ALL');
  const [denyOptions, setDenyOptions] = useState(': DENY');
  const [denyComment, setDenyComment] = useState('');
  const [editingDenyIndex, setEditingDenyIndex] = useState<number | null>(null);
  const [editingDenyId, setEditingDenyId] = useState<string | null>(null);

  // General loading & feedback
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadData = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const [hRes, fRes, tcpRes] = await Promise.all([
        fetchLinuxHostname(server.id, ephemeralPassword),
        fetchLinuxHostsFile(server.id, ephemeralPassword),
        fetchLinuxTcpWrappers(server.id, ephemeralPassword),
      ]);

      if (hRes.success && hRes.info) {
        setHostnameInfo(hRes.info);
        const liveName = hRes.info.currentHostname || hRes.info.staticHostname || server.hostname || server.name || '';
        setNewHostname(liveName);
      }
      if (fRes.success && fRes.entries) {
        setHostsEntries(fRes.entries);
        if (fRes.rawContent) setRawHosts(fRes.rawContent);
      }
      if (tcpRes.success) {
        setTcpData({
          allowRules: tcpRes.allowRules || [],
          denyRules: tcpRes.denyRules || [],
          rawAllow: tcpRes.rawAllow || '',
          rawDeny: tcpRes.rawDeny || '',
        });
      }
    } catch (err: any) {
      setFeedback({
        message: err?.message || (isEn ? 'Failed to fetch host configuration' : 'خطا در دریافت اطلاعات هاست و امنیت شبکه'),
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [server.id, ephemeralPassword]);

  // ==========================================
  // HOSTNAME ACTIONS
  // ==========================================
  const handleUpdateHostname = async () => {
    if (!newHostname.trim()) return;
    setSavingHostname(true);
    setFeedback(null);
    try {
      const res = await updateLinuxHostname(server.id, newHostname.trim(), updateHostsOnRename, ephemeralPassword);
      if (res.success) {
        setFeedback({
          message: res.message || (isEn ? 'Hostname updated successfully' : 'نام هاست با موفقیت تغییر یافت'),
          type: 'success',
        });
        loadData();
      } else {
        setFeedback({
          message: res.error || (isEn ? 'Failed to update hostname' : 'خطا در تغییر نام هاست'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setFeedback({
        message: err?.message || (isEn ? 'Network error updating hostname' : 'خطای ارتباط در تغییر نام هاست'),
        type: 'error',
      });
    } finally {
      setSavingHostname(false);
    }
  };

  // ==========================================
  // /ETC/HOSTS ACTIONS
  // ==========================================
  const handleSaveHostEntry = async () => {
    if (!newIp.trim() || !newHostnames.trim()) {
      setFeedback({
        message: isEn ? 'IP and hostnames are required' : 'آدرس IP و نام‌های هاست الزامی هستند',
        type: 'error',
      });
      return;
    }

    const hostnamesArray = newHostnames
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (hostnamesArray.length === 0) return;

    setSavingHosts(true);
    setFeedback(null);
    try {
      const res = await updateLinuxHostsFile(
        server.id,
        {
          action: editingOldIp ? 'edit' : 'add',
          oldIp: editingOldIp || undefined,
          entry: {
            ip: newIp.trim(),
            hostnames: hostnamesArray,
            comment: newComment.trim() || undefined,
            oldIp: editingOldIp || undefined,
          },
        },
        ephemeralPassword
      );

      if (res.success) {
        setFeedback({
          message: res.message || (isEn ? 'Hosts entry saved' : 'رکورد در /etc/hosts ثبت شد'),
          type: 'success',
        });
        setNewIp('');
        setNewHostnames('');
        setNewComment('');
        setEditingOldIp(null);
        if (res.entries) setHostsEntries(res.entries);
        if (res.rawContent) setRawHosts(res.rawContent);
        loadData();
      } else {
        setFeedback({
          message: res.error || (isEn ? 'Failed to save hosts entry' : 'خطا در ثبت رکورد hosts'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setFeedback({
        message: err?.message || (isEn ? 'Network error' : 'خطای شبکه'),
        type: 'error',
      });
    } finally {
      setSavingHosts(false);
    }
  };

  const handleDeleteHostEntry = async (ip: string) => {
    setSavingHosts(true);
    setFeedback(null);
    try {
      const res = await updateLinuxHostsFile(
        server.id,
        {
          action: 'delete',
          deleteIp: ip,
        },
        ephemeralPassword
      );

      if (res.success) {
        setFeedback({
          message: res.message || (isEn ? 'Entry removed from /etc/hosts' : 'رکورد از فایل /etc/hosts حذف شد'),
          type: 'success',
        });
        if (res.entries) setHostsEntries(res.entries);
        if (res.rawContent) setRawHosts(res.rawContent);
        loadData();
      } else {
        setFeedback({
          message: res.error || (isEn ? 'Failed to delete entry' : 'خطا در حذف رکورد'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setFeedback({
        message: err?.message || (isEn ? 'Network error' : 'خطای شبکه'),
        type: 'error',
      });
    } finally {
      setSavingHosts(false);
    }
  };

  const handleSaveRawHosts = async () => {
    setSavingHosts(true);
    setFeedback(null);
    try {
      const res = await updateLinuxHostsFile(
        server.id,
        {
          action: 'save-raw',
          rawContent: rawHosts,
        },
        ephemeralPassword
      );

      if (res.success) {
        setFeedback({
          message: res.message || (isEn ? '/etc/hosts raw content saved' : 'محتوای فایل /etc/hosts با موفقیت ذخیره شد'),
          type: 'success',
        });
        if (res.entries) setHostsEntries(res.entries);
        loadData();
      } else {
        setFeedback({
          message: res.error || (isEn ? 'Failed to save raw /etc/hosts' : 'خطا در ذخیره فایل /etc/hosts'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setFeedback({
        message: err?.message || (isEn ? 'Network error' : 'خطای شبکه'),
        type: 'error',
      });
    } finally {
      setSavingHosts(false);
    }
  };

  const startEditHostEntry = (entry: LinuxHostEntry) => {
    setNewIp(entry.ip);
    setNewHostnames(entry.hostnames ? entry.hostnames.join(' ') : entry.hostname || '');
    setNewComment(entry.comment || '');
    setEditingOldIp(entry.ip);
    setHostsViewMode('table');
  };

  const cancelEditHostEntry = () => {
    setNewIp('');
    setNewHostnames('');
    setNewComment('');
    setEditingOldIp(null);
  };

  // ==========================================
  // TCP WRAPPERS ACTIONS (/ETC/HOSTS.ALLOW)
  // ==========================================
  const handleSaveAllowRule = async () => {
    if (!allowDaemon.trim() || !allowClients.trim()) {
      setFeedback({
        message: isEn ? 'Daemon and client IP/pattern are required' : 'نام سرویس و آدرس/الگوی کلاینت الزامی است',
        type: 'error',
      });
      return;
    }

    const clientList = allowClients
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    setSavingTcp(true);
    setFeedback(null);
    try {
      const res = await updateLinuxTcpWrappers(
        server.id,
        {
          target: 'allow',
          action: editingAllowIndex !== null ? 'edit' : 'add',
          ruleIndex: editingAllowIndex !== null ? editingAllowIndex : undefined,
          oldRuleId: editingAllowId || undefined,
          rule: {
            daemon: allowDaemon.trim(),
            clients: clientList,
            options: allowOptions.trim() || undefined,
            comment: allowComment.trim() || undefined,
          },
        },
        ephemeralPassword
      );

      if (res.success) {
        setFeedback({
          message: res.message || (isEn ? 'Rule saved to /etc/hosts.allow' : 'قانون در /etc/hosts.allow ذخیره شد'),
          type: 'success',
        });
        setAllowDaemon('sshd');
        setAllowClients('');
        setAllowOptions(': ALLOW');
        setAllowComment('');
        setEditingAllowIndex(null);
        setEditingAllowId(null);
        if (res.allowRules) {
          setTcpData((prev) => ({
            ...prev,
            allowRules: res.allowRules || [],
            rawAllow: res.rawAllow ?? prev.rawAllow,
          }));
        }
        loadData();
      } else {
        setFeedback({
          message: res.error || (isEn ? 'Failed to save allow rule' : 'خطا در ذخیره قانون allow'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setFeedback({
        message: err?.message || (isEn ? 'Network error' : 'خطای شبکه'),
        type: 'error',
      });
    } finally {
      setSavingTcp(false);
    }
  };

  const handleDeleteAllowRule = async (rule: LinuxTcpWrapperRule) => {
    setSavingTcp(true);
    setFeedback(null);
    try {
      const res = await updateLinuxTcpWrappers(
        server.id,
        {
          target: 'allow',
          action: 'delete',
          ruleId: rule.id,
          ruleIndex: rule.lineIndex,
          raw: rule.raw,
        },
        ephemeralPassword
      );

      if (res.success) {
        setFeedback({
          message: res.message || (isEn ? 'Rule removed from /etc/hosts.allow' : 'قانون از /etc/hosts.allow حذف شد'),
          type: 'success',
        });
        loadData();
      } else {
        setFeedback({
          message: res.error || (isEn ? 'Failed to delete rule' : 'خطا در حذف قانون'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setFeedback({
        message: err?.message || (isEn ? 'Network error' : 'خطای شبکه'),
        type: 'error',
      });
    } finally {
      setSavingTcp(false);
    }
  };

  const handleSaveRawAllow = async () => {
    setSavingTcp(true);
    setFeedback(null);
    try {
      const res = await updateLinuxTcpWrappers(
        server.id,
        {
          target: 'allow',
          action: 'save-raw',
          rawContent: tcpData.rawAllow,
        },
        ephemeralPassword
      );

      if (res.success) {
        setFeedback({
          message: res.message || (isEn ? '/etc/hosts.allow saved' : 'فایل /etc/hosts.allow با موفقیت ذخیره شد'),
          type: 'success',
        });
        loadData();
      } else {
        setFeedback({
          message: res.error || (isEn ? 'Failed to save /etc/hosts.allow' : 'خطا در ذخیره /etc/hosts.allow'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setFeedback({
        message: err?.message || (isEn ? 'Network error' : 'خطای شبکه'),
        type: 'error',
      });
    } finally {
      setSavingTcp(false);
    }
  };

  // ==========================================
  // TCP WRAPPERS ACTIONS (/ETC/HOSTS.DENY)
  // ==========================================
  const handleSaveDenyRule = async () => {
    if (!denyDaemon.trim() || !denyClients.trim()) {
      setFeedback({
        message: isEn ? 'Daemon and client IP/pattern are required' : 'نام سرویس و آدرس/الگوی کلاینت الزامی است',
        type: 'error',
      });
      return;
    }

    const clientList = denyClients
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    setSavingTcp(true);
    setFeedback(null);
    try {
      const res = await updateLinuxTcpWrappers(
        server.id,
        {
          target: 'deny',
          action: editingDenyIndex !== null ? 'edit' : 'add',
          ruleIndex: editingDenyIndex !== null ? editingDenyIndex : undefined,
          oldRuleId: editingDenyId || undefined,
          rule: {
            daemon: denyDaemon.trim(),
            clients: clientList,
            options: denyOptions.trim() || undefined,
            comment: denyComment.trim() || undefined,
          },
        },
        ephemeralPassword
      );

      if (res.success) {
        setFeedback({
          message: res.message || (isEn ? 'Rule saved to /etc/hosts.deny' : 'قانون در /etc/hosts.deny ذخیره شد'),
          type: 'success',
        });
        setDenyDaemon('ALL');
        setDenyClients('ALL');
        setDenyOptions(': DENY');
        setDenyComment('');
        setEditingDenyIndex(null);
        setEditingDenyId(null);
        if (res.denyRules) {
          setTcpData((prev) => ({
            ...prev,
            denyRules: res.denyRules || [],
            rawDeny: res.rawDeny ?? prev.rawDeny,
          }));
        }
        loadData();
      } else {
        setFeedback({
          message: res.error || (isEn ? 'Failed to save deny rule' : 'خطا در ذخیره قانون deny'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setFeedback({
        message: err?.message || (isEn ? 'Network error' : 'خطای شبکه'),
        type: 'error',
      });
    } finally {
      setSavingTcp(false);
    }
  };

  const handleDeleteDenyRule = async (rule: LinuxTcpWrapperRule) => {
    setSavingTcp(true);
    setFeedback(null);
    try {
      const res = await updateLinuxTcpWrappers(
        server.id,
        {
          target: 'deny',
          action: 'delete',
          ruleId: rule.id,
          ruleIndex: rule.lineIndex,
          raw: rule.raw,
        },
        ephemeralPassword
      );

      if (res.success) {
        setFeedback({
          message: res.message || (isEn ? 'Rule removed from /etc/hosts.deny' : 'قانون از /etc/hosts.deny حذف شد'),
          type: 'success',
        });
        loadData();
      } else {
        setFeedback({
          message: res.error || (isEn ? 'Failed to delete rule' : 'خطا در حذف قانون'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setFeedback({
        message: err?.message || (isEn ? 'Network error' : 'خطای شبکه'),
        type: 'error',
      });
    } finally {
      setSavingTcp(false);
    }
  };

  const handleSaveRawDeny = async () => {
    setSavingTcp(true);
    setFeedback(null);
    try {
      const res = await updateLinuxTcpWrappers(
        server.id,
        {
          target: 'deny',
          action: 'save-raw',
          rawContent: tcpData.rawDeny,
        },
        ephemeralPassword
      );

      if (res.success) {
        setFeedback({
          message: res.message || (isEn ? '/etc/hosts.deny saved' : 'فایل /etc/hosts.deny با موفقیت ذخیره شد'),
          type: 'success',
        });
        loadData();
      } else {
        setFeedback({
          message: res.error || (isEn ? 'Failed to save /etc/hosts.deny' : 'خطا در ذخیره /etc/hosts.deny'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setFeedback({
        message: err?.message || (isEn ? 'Network error' : 'خطای شبکه'),
        type: 'error',
      });
    } finally {
      setSavingTcp(false);
    }
  };

  return (
    <div
      id="linux-hostname-hosts-card"
      className={`p-5 rounded-2xl border space-y-5 ${
        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-blue-500/15 text-blue-400">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs sm:text-sm font-bold">
                {isEn
                  ? 'Hostname & Host Security (/etc/hosts, hosts.allow, hosts.deny)'
                  : 'نام سرور و امنیت هاست (/etc/hosts، hosts.allow، hosts.deny)'}
              </h4>
              <FieldInfoTooltip
                title={isEn ? 'Linux Host & TCP Wrappers' : 'مدیریت هاست و امنیت TCP Wrappers'}
                infoWhatEn="Manages server system identity (hostname), local static name resolution (/etc/hosts), and service-level TCP Wrappers access control lists (/etc/hosts.allow and /etc/hosts.deny)."
                infoWhatFa="مدیریت هویت رسمی سرور (Hostname)، جدول نگاشت محلی نام‌ها (/etc/hosts) و لیست‌های کنترل دسترسی سرویس‌ها در لایه TCP Wrappers (/etc/hosts.allow و /etc/hosts.deny)."
                infoWhyEn="Critical for cluster node addressing, mail FQDN, blocking unauthorized SSH/daemon connections before authentication, and enforcing zero-trust network boundaries."
                infoWhyFa="حیاتی برای نام‌گذاری در کلاستر، ایمیل سرورها (FQDN)، مسدودسازی اتصالات غیرمجاز SSH و سرویس‌ها پیش از احراز هویت و اعمال امنیت شبکه‌ای زیرو تراست."
                infoExampleEn="sshd : 192.168.1.0/24 : ALLOW in hosts.allow | ALL : ALL : DENY in hosts.deny"
                infoExampleFa="تنظیم sshd : 192.168.1.0/24 : ALLOW در hosts.allow و ALL : ALL : DENY در hosts.deny"
                isEn={isEn}
                isLightMode={isLightMode}
              />
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              {isEn ? 'Current Hostname:' : 'نام هاست فعال:'}{' '}
              <strong className="text-blue-400">
                {hostnameInfo?.currentHostname || hostnameInfo?.staticHostname || server.hostname || server.name || '-'}
              </strong>
              {hostnameInfo?.fqdn &&
                hostnameInfo.fqdn !== (hostnameInfo.currentHostname || hostnameInfo.staticHostname) && (
                  <span className="ml-2 text-slate-500">({hostnameInfo.fqdn})</span>
                )}
            </span>
          </div>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={loadData}
          id="btn-refresh-hostname-hosts"
          title={isEn ? 'Reload All Host Files' : 'بارگذاری مجدد اطلاعات'}
          className={`p-2 rounded-lg border transition cursor-pointer disabled:opacity-50 ${
            isLightMode
              ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
              : 'bg-slate-800 border-slate-700 text-slate-300'
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

      {/* Part 1: Change Hostname */}
      <div
        className={`p-4 rounded-xl border space-y-3 ${
          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-white/5'
        }`}
      >
        <span className="text-xs font-bold block text-slate-300">
          {isEn ? 'Change System Hostname' : 'تغییر نام سرور (Hostname)'}
        </span>
        <div className="flex flex-col sm:flex-row items-end gap-3">
          <div className="w-full sm:flex-1">
            <label className="text-[11px] text-slate-400 block mb-1">
              {isEn ? 'New Hostname (RFC 1123 compliant)' : 'نام جدید هاست (مطابق استاندارد RFC 1123)'}
            </label>
            <input
              type="text"
              id="input-new-hostname"
              value={newHostname}
              onChange={(e) => setNewHostname(e.target.value)}
              placeholder="e.g. srv-app-01 or web.example.local"
              className={`w-full px-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-700 text-white'
              }`}
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={updateHostsOnRename}
                onChange={(e) => setUpdateHostsOnRename(e.target.checked)}
                className="rounded border-slate-600 text-blue-500 focus:ring-blue-500"
              />
              <span>{isEn ? 'Update /etc/hosts' : 'به‌روزرسانی در /etc/hosts'}</span>
            </label>

            <button
              type="button"
              id="btn-apply-hostname"
              disabled={savingHostname || !newHostname.trim() || newHostname === hostnameInfo?.staticHostname}
              onClick={handleUpdateHostname}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save className={`w-3.5 h-3.5 ${savingHostname ? 'animate-spin' : ''}`} />
              <span>
                {savingHostname
                  ? isEn
                    ? 'Saving...'
                    : 'در حال ثبت...'
                  : isEn
                  ? 'Apply Hostname'
                  : 'اعمال نام'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Part 2: Segmented Navigation for Host Files */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 flex-wrap gap-2">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/60 border border-slate-800">
            <button
              type="button"
              id="tab-btn-hosts"
              onClick={() => setActiveTab('hosts')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'hosts'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>/etc/hosts</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-900/60 text-blue-200">
                {hostsEntries.length}
              </span>
            </button>

            <button
              type="button"
              id="tab-btn-hosts-allow"
              onClick={() => setActiveTab('hosts-allow')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'hosts-allow'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>/etc/hosts.allow</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-900/60 text-emerald-200">
                {tcpData.allowRules.length}
              </span>
            </button>

            <button
              type="button"
              id="tab-btn-hosts-deny"
              onClick={() => setActiveTab('hosts-deny')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'hosts-deny'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>/etc/hosts.deny</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-900/60 text-rose-200">
                {tcpData.denyRules.length}
              </span>
            </button>
          </div>

          <div className="text-[11px] text-slate-400">
            {activeTab === 'hosts' && (
              <span className="font-mono">{isEn ? 'Static Host Resolution' : 'جدول نگاشت محلی نام‌ها'}</span>
            )}
            {activeTab === 'hosts-allow' && (
              <span className="text-emerald-400 font-mono">
                {isEn ? 'TCP Wrappers (Allow Priority #1)' : 'اولویت اول بررسی TCP Wrappers (مجازها)'}
              </span>
            )}
            {activeTab === 'hosts-deny' && (
              <span className="text-rose-400 font-mono">
                {isEn ? 'TCP Wrappers (Deny Priority #2)' : 'اولویت دوم بررسی TCP Wrappers (مسدودها)'}
              </span>
            )}
          </div>
        </div>

        {/* ========================================================= */}
        {/* TAB 1: /etc/hosts */}
        {/* ========================================================= */}
        {activeTab === 'hosts' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold block text-slate-300">
                {isEn ? '/etc/hosts Static Lookup Table' : 'جدول نگاشت فایل /etc/hosts'}
              </span>
              <div className="flex items-center gap-2">
                <div className="flex items-center p-0.5 rounded-lg bg-slate-800/80 border border-slate-700 text-xs">
                  <button
                    type="button"
                    onClick={() => setHostsViewMode('table')}
                    className={`px-2 py-1 rounded flex items-center gap-1 transition cursor-pointer ${
                      hostsViewMode === 'table' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <TableIcon className="w-3 h-3" />
                    <span>{isEn ? 'Table' : 'جدول'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setHostsViewMode('raw')}
                    className={`px-2 py-1 rounded flex items-center gap-1 transition cursor-pointer ${
                      hostsViewMode === 'raw' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Code2 className="w-3 h-3" />
                    <span>{isEn ? 'Raw File' : 'فایل خام'}</span>
                  </button>
                </div>
              </div>
            </div>

            {hostsViewMode === 'table' ? (
              <>
                {/* Table of Entries */}
                <div
                  className={`rounded-xl border overflow-hidden ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950/60 border-slate-800'
                  }`}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono text-left">
                      <thead
                        className={`border-b text-[10px] uppercase tracking-wider ${
                          isLightMode ? 'bg-slate-100 text-slate-600' : 'bg-slate-900 text-slate-400'
                        }`}
                      >
                        <tr>
                          <th className="p-2.5 w-44">IP Address</th>
                          <th className="p-2.5">{isEn ? 'Hostnames / Aliases' : 'نام‌های هاست و مستعار'}</th>
                          <th className="p-2.5">{isEn ? 'Comment' : 'توضیحات'}</th>
                          <th className="p-2.5 w-24 text-center">{isEn ? 'Actions' : 'عملیات'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {hostsEntries.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="p-4 text-center text-slate-400 text-xs">
                              {isEn ? 'No hosts entries found.' : 'رکوردی در /etc/hosts یافت نشد.'}
                            </td>
                          </tr>
                        ) : (
                          hostsEntries.map((entry, idx) => {
                            const isLocalhost = entry.ip === '127.0.0.1' || entry.ip === '::1';
                            return (
                              <tr
                                key={`${entry.ip}-${idx}`}
                                className={`transition-colors ${isLightMode ? 'hover:bg-slate-50' : 'hover:bg-white/5'}`}
                              >
                                <td className="p-2.5 font-bold text-blue-400">
                                  <div className="flex items-center gap-1.5">
                                    <span>{entry.ip}</span>
                                    {isLocalhost && (
                                      <span className="px-1 py-0.2 rounded text-[9px] bg-slate-800 text-slate-400 border border-slate-700">
                                        loopback
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="p-2.5">
                                  <div className="flex flex-wrap gap-1">
                                    {(entry.hostnames || [entry.hostname || '']).map((h, i) => (
                                      <span
                                        key={i}
                                        className="px-1.5 py-0.5 rounded text-[11px] bg-slate-800 text-slate-200 border border-slate-700"
                                      >
                                        {h}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                                <td className="p-2.5 text-slate-400 text-[11px] truncate max-w-xs">
                                  {entry.comment || '-'}
                                </td>
                                <td className="p-2.5 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => startEditHostEntry(entry)}
                                      title={isEn ? 'Edit Entry' : 'ویرایش رکورد'}
                                      className="p-1 rounded hover:bg-blue-500/20 text-slate-400 hover:text-blue-400 transition cursor-pointer"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    {!isLocalhost && (
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteHostEntry(entry.ip)}
                                        title={isEn ? 'Delete Entry' : 'حذف رکورد'}
                                        className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Add/Edit Host Entry Form */}
                <div
                  className={`p-3.5 rounded-xl border space-y-3 ${
                    isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">
                      {editingOldIp
                        ? isEn
                          ? `Editing Entry (${editingOldIp})`
                          : `ویرایش رکورد (${editingOldIp})`
                        : isEn
                        ? 'Add New /etc/hosts Entry'
                        : 'افزودن رکورد جدید به /etc/hosts'}
                    </span>
                    {editingOldIp && (
                      <button
                        type="button"
                        onClick={cancelEditHostEntry}
                        className="text-[11px] text-slate-400 hover:text-slate-200 underline cursor-pointer"
                      >
                        {isEn ? 'Cancel Edit' : 'انصراف از ویرایش'}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">IP Address</label>
                      <input
                        type="text"
                        id="input-host-ip"
                        placeholder="e.g. 192.168.1.100 or ::1"
                        value={newIp}
                        onChange={(e) => setNewIp(e.target.value)}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-800'
                            : 'bg-slate-900 border-slate-700 text-white'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">
                        {isEn ? 'Hostnames (space separated)' : 'نام‌های هاست (با فاصله)'}
                      </label>
                      <input
                        type="text"
                        id="input-host-names"
                        placeholder="db1.local database.prod"
                        value={newHostnames}
                        onChange={(e) => setNewHostnames(e.target.value)}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-800'
                            : 'bg-slate-900 border-slate-700 text-white'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">
                        {isEn ? 'Comment (Optional)' : 'توضیحات (اختیاری)'}
                      </label>
                      <input
                        type="text"
                        id="input-host-comment"
                        placeholder="# internal cluster"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-800'
                            : 'bg-slate-900 border-slate-700 text-white'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      id="btn-save-host-entry"
                      disabled={savingHosts || !newIp.trim() || !newHostnames.trim()}
                      onClick={handleSaveHostEntry}
                      className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {editingOldIp ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      <span>
                        {savingHosts
                          ? isEn
                            ? 'Saving...'
                            : 'در حال ذخیره...'
                          : editingOldIp
                          ? isEn
                            ? 'Update Entry'
                            : 'بروزرسانی رکورد'
                          : isEn
                          ? 'Add to /etc/hosts'
                          : 'افزودن به /etc/hosts'}
                      </span>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              /* Raw File Editor Mode for /etc/hosts */
              <div className="space-y-2">
                <textarea
                  id="textarea-raw-hosts"
                  rows={12}
                  value={rawHosts}
                  onChange={(e) => setRawHosts(e.target.value)}
                  className={`w-full p-3 rounded-xl font-mono text-xs border focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed ${
                    isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-100'
                  }`}
                  placeholder="# /etc/hosts raw content"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    {isEn ? 'Automatic backup will be created prior to overwrite.' : 'پیش از اعمال تغییرات، نسخه پشتیبان به صورت خودکار ایجاد می‌شود.'}
                  </span>
                  <button
                    type="button"
                    id="btn-save-raw-hosts"
                    disabled={savingHosts || !rawHosts.trim()}
                    onClick={handleSaveRawHosts}
                    className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Save className={`w-3.5 h-3.5 ${savingHosts ? 'animate-spin' : ''}`} />
                    <span>{savingHosts ? (isEn ? 'Saving...' : 'در حال ذخیره...') : (isEn ? 'Save /etc/hosts' : 'ذخیره فایل /etc/hosts')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: /etc/hosts.allow */}
        {/* ========================================================= */}
        {activeTab === 'hosts-allow' && (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              <div>
                <strong>{isEn ? 'TCP Wrappers Evaluation Rule #1:' : 'قانون ارزیابی اول در TCP Wrappers:'}</strong>{' '}
                {isEn
                  ? 'Incoming connections to daemons (such as sshd, vsftpd, in.tftpd) are checked against /etc/hosts.allow FIRST. If a match is found here, access is immediately GRANTED.'
                  : 'اتصالات ورودی به سرویس‌ها (نظیر sshd، vsftpd و غیره) ابتدا با این فایل مقایسه می‌شوند. در صورت تطابق، دسترسی بلافاصله مجاز دانسته شده و وارد مرحله بعدی نمی‌شود.'}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-bold block text-slate-300">
                {isEn ? '/etc/hosts.allow Rules (Allowed Clients)' : 'قوانین فایل /etc/hosts.allow (کلاینت‌های مجاز)'}
              </span>
              <div className="flex items-center gap-2">
                <div className="flex items-center p-0.5 rounded-lg bg-slate-800/80 border border-slate-700 text-xs">
                  <button
                    type="button"
                    onClick={() => setAllowViewMode('table')}
                    className={`px-2 py-1 rounded flex items-center gap-1 transition cursor-pointer ${
                      allowViewMode === 'table' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <TableIcon className="w-3 h-3" />
                    <span>{isEn ? 'Table' : 'جدول'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllowViewMode('raw')}
                    className={`px-2 py-1 rounded flex items-center gap-1 transition cursor-pointer ${
                      allowViewMode === 'raw' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Code2 className="w-3 h-3" />
                    <span>{isEn ? 'Raw File' : 'فایل خام'}</span>
                  </button>
                </div>
              </div>
            </div>

            {allowViewMode === 'table' ? (
              <>
                {/* Table of Allow Rules */}
                <div
                  className={`rounded-xl border overflow-hidden ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950/60 border-slate-800'
                  }`}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono text-left">
                      <thead
                        className={`border-b text-[10px] uppercase tracking-wider ${
                          isLightMode ? 'bg-slate-100 text-slate-600' : 'bg-slate-900 text-slate-400'
                        }`}
                      >
                        <tr>
                          <th className="p-2.5 w-32">Daemon / Service</th>
                          <th className="p-2.5">{isEn ? 'Clients (IP / Subnet / Host)' : 'کلاینت‌ها (IP / ساب‌نت / نام)'}</th>
                          <th className="p-2.5 w-32">{isEn ? 'Options' : 'گزینه‌ها'}</th>
                          <th className="p-2.5">{isEn ? 'Comment' : 'توضیحات'}</th>
                          <th className="p-2.5 w-24 text-center">{isEn ? 'Actions' : 'عملیات'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {tcpData.allowRules.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-4 text-center text-slate-400 text-xs">
                              {isEn ? 'No rules configured in /etc/hosts.allow.' : 'هیچ قانونی در فایل /etc/hosts.allow ثبت نشده است.'}
                            </td>
                          </tr>
                        ) : (
                          tcpData.allowRules.map((rule, idx) => (
                            <tr
                              key={`${rule.id}-${idx}`}
                              className={`transition-colors ${isLightMode ? 'hover:bg-slate-50' : 'hover:bg-white/5'}`}
                            >
                              <td className="p-2.5 font-bold text-emerald-400">{rule.daemon}</td>
                              <td className="p-2.5">
                                <div className="flex flex-wrap gap-1">
                                  {rule.clients.map((c, i) => (
                                    <span
                                      key={i}
                                      className="px-1.5 py-0.5 rounded text-[11px] bg-slate-800 text-emerald-200 border border-emerald-900/50"
                                    >
                                      {c}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="p-2.5 text-slate-300 font-mono text-[11px]">{rule.options || ': ALLOW'}</td>
                              <td className="p-2.5 text-slate-400 text-[11px] truncate max-w-xs">{rule.comment || '-'}</td>
                              <td className="p-2.5 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAllowDaemon(rule.daemon);
                                      setAllowClients(rule.clients.join(', '));
                                      setAllowOptions(rule.options || ': ALLOW');
                                      setAllowComment(rule.comment || '');
                                      setEditingAllowIndex(rule.lineIndex ?? idx);
                                      setEditingAllowId(rule.id);
                                    }}
                                    title={isEn ? 'Edit Rule' : 'ویرایش قانون'}
                                    className="p-1 rounded hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-400 transition cursor-pointer"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteAllowRule(rule)}
                                    title={isEn ? 'Delete Rule' : 'حذف قانون'}
                                    className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Add/Edit Allow Rule Form */}
                <div
                  className={`p-3.5 rounded-xl border space-y-3 ${
                    isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-400">
                      {editingAllowIndex !== null
                        ? isEn
                          ? 'Edit Allow Rule'
                          : 'ویرایش قانون در /etc/hosts.allow'
                        : isEn
                        ? 'Add Rule to /etc/hosts.allow'
                        : 'افزودن قانون به /etc/hosts.allow'}
                    </span>
                    {editingAllowIndex !== null && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAllowIndex(null);
                          setEditingAllowId(null);
                          setAllowClients('');
                        }}
                        className="text-[11px] text-slate-400 hover:text-slate-200 underline cursor-pointer"
                      >
                        {isEn ? 'Cancel Edit' : 'انصراف'}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">Daemon (Service)</label>
                      <input
                        type="text"
                        id="input-allow-daemon"
                        placeholder="sshd, ALL, vsftpd"
                        value={allowDaemon}
                        onChange={(e) => setAllowDaemon(e.target.value)}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                          isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">
                        {isEn ? 'Clients (IP / CIDR)' : 'کلاینت‌ها (IP / CIDR)'}
                      </label>
                      <input
                        type="text"
                        id="input-allow-clients"
                        placeholder="192.168.1.0/24, 10.0.0.1"
                        value={allowClients}
                        onChange={(e) => setAllowClients(e.target.value)}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                          isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">
                        {isEn ? 'Options (Action)' : 'گزینه‌ها'}
                      </label>
                      <input
                        type="text"
                        id="input-allow-options"
                        placeholder=": ALLOW"
                        value={allowOptions}
                        onChange={(e) => setAllowOptions(e.target.value)}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                          isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">
                        {isEn ? 'Comment' : 'توضیحات'}
                      </label>
                      <input
                        type="text"
                        id="input-allow-comment"
                        placeholder="# internal office VPN"
                        value={allowComment}
                        onChange={(e) => setAllowComment(e.target.value)}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                          isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      id="btn-save-allow-rule"
                      disabled={savingTcp || !allowDaemon.trim() || !allowClients.trim()}
                      onClick={handleSaveAllowRule}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {editingAllowIndex !== null ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      <span>
                        {savingTcp
                          ? isEn
                            ? 'Saving...'
                            : 'در حال ذخیره...'
                          : editingAllowIndex !== null
                          ? isEn
                            ? 'Update Allow Rule'
                            : 'بروزرسانی قانون'
                          : isEn
                          ? 'Add to hosts.allow'
                          : 'افزودن به hosts.allow'}
                      </span>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              /* Raw File Editor Mode for /etc/hosts.allow */
              <div className="space-y-2">
                <textarea
                  id="textarea-raw-hosts-allow"
                  rows={12}
                  value={tcpData.rawAllow}
                  onChange={(e) => setTcpData((prev) => ({ ...prev, rawAllow: e.target.value }))}
                  className={`w-full p-3 rounded-xl font-mono text-xs border focus:outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed ${
                    isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-100'
                  }`}
                  placeholder="# /etc/hosts.allow raw content"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    {isEn ? 'Automatic backup will be created prior to overwrite.' : 'نسخه پشتیبان به صورت خودکار پیش از ذخیره ایجاد می‌شود.'}
                  </span>
                  <button
                    type="button"
                    id="btn-save-raw-allow"
                    disabled={savingTcp}
                    onClick={handleSaveRawAllow}
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Save className={`w-3.5 h-3.5 ${savingTcp ? 'animate-spin' : ''}`} />
                    <span>{savingTcp ? (isEn ? 'Saving...' : 'در حال ذخیره...') : (isEn ? 'Save /etc/hosts.allow' : 'ذخیره /etc/hosts.allow')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: /etc/hosts.deny */}
        {/* ========================================================= */}
        {activeTab === 'hosts-deny' && (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <div>
                <strong>{isEn ? 'TCP Wrappers Evaluation Rule #2:' : 'قانون ارزیابی دوم در TCP Wrappers:'}</strong>{' '}
                {isEn
                  ? 'If a connection did not match /etc/hosts.allow, it is checked against /etc/hosts.deny. If a match is found here, access is BLOCKED. (Standard practice: set ALL : ALL in hosts.deny, then explicitly whitelist in hosts.allow).'
                  : 'اگر اتصالی در hosts.allow مجاز نشده باشد، با این فایل مقایسه می‌شود. در صورت تطابق، اتصال فوراً مسدود می‌گردد. (بهترین الگو: قرار دادن ALL : ALL در hosts.deny و تعریف استثناهای مجاز در hosts.allow).'}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-bold block text-slate-300">
                {isEn ? '/etc/hosts.deny Rules (Blocked Clients)' : 'قوانین فایل /etc/hosts.deny (کلاینت‌های مسدود)'}
              </span>
              <div className="flex items-center gap-2">
                <div className="flex items-center p-0.5 rounded-lg bg-slate-800/80 border border-slate-700 text-xs">
                  <button
                    type="button"
                    onClick={() => setDenyViewMode('table')}
                    className={`px-2 py-1 rounded flex items-center gap-1 transition cursor-pointer ${
                      denyViewMode === 'table' ? 'bg-rose-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <TableIcon className="w-3 h-3" />
                    <span>{isEn ? 'Table' : 'جدول'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDenyViewMode('raw')}
                    className={`px-2 py-1 rounded flex items-center gap-1 transition cursor-pointer ${
                      denyViewMode === 'raw' ? 'bg-rose-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Code2 className="w-3 h-3" />
                    <span>{isEn ? 'Raw File' : 'فایل خام'}</span>
                  </button>
                </div>
              </div>
            </div>

            {denyViewMode === 'table' ? (
              <>
                {/* Table of Deny Rules */}
                <div
                  className={`rounded-xl border overflow-hidden ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950/60 border-slate-800'
                  }`}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono text-left">
                      <thead
                        className={`border-b text-[10px] uppercase tracking-wider ${
                          isLightMode ? 'bg-slate-100 text-slate-600' : 'bg-slate-900 text-slate-400'
                        }`}
                      >
                        <tr>
                          <th className="p-2.5 w-32">Daemon / Service</th>
                          <th className="p-2.5">{isEn ? 'Clients (IP / Subnet / Pattern)' : 'کلاینت‌ها (IP / الگو)'}</th>
                          <th className="p-2.5 w-32">{isEn ? 'Options' : 'گزینه‌ها'}</th>
                          <th className="p-2.5">{isEn ? 'Comment' : 'توضیحات'}</th>
                          <th className="p-2.5 w-24 text-center">{isEn ? 'Actions' : 'عملیات'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {tcpData.denyRules.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-4 text-center text-slate-400 text-xs">
                              {isEn ? 'No rules configured in /etc/hosts.deny.' : 'هیچ قانونی در فایل /etc/hosts.deny ثبت نشده است.'}
                            </td>
                          </tr>
                        ) : (
                          tcpData.denyRules.map((rule, idx) => (
                            <tr
                              key={`${rule.id}-${idx}`}
                              className={`transition-colors ${isLightMode ? 'hover:bg-slate-50' : 'hover:bg-white/5'}`}
                            >
                              <td className="p-2.5 font-bold text-rose-400">{rule.daemon}</td>
                              <td className="p-2.5">
                                <div className="flex flex-wrap gap-1">
                                  {rule.clients.map((c, i) => (
                                    <span
                                      key={i}
                                      className="px-1.5 py-0.5 rounded text-[11px] bg-slate-800 text-rose-200 border border-rose-900/50"
                                    >
                                      {c}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="p-2.5 text-slate-300 font-mono text-[11px]">{rule.options || ': DENY'}</td>
                              <td className="p-2.5 text-slate-400 text-[11px] truncate max-w-xs">{rule.comment || '-'}</td>
                              <td className="p-2.5 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDenyDaemon(rule.daemon);
                                      setDenyClients(rule.clients.join(', '));
                                      setDenyOptions(rule.options || ': DENY');
                                      setDenyComment(rule.comment || '');
                                      setEditingDenyIndex(rule.lineIndex ?? idx);
                                      setEditingDenyId(rule.id);
                                    }}
                                    title={isEn ? 'Edit Rule' : 'ویرایش قانون'}
                                    className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteDenyRule(rule)}
                                    title={isEn ? 'Delete Rule' : 'حذف قانون'}
                                    className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Add/Edit Deny Rule Form */}
                <div
                  className={`p-3.5 rounded-xl border space-y-3 ${
                    isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-rose-400">
                      {editingDenyIndex !== null
                        ? isEn
                          ? 'Edit Deny Rule'
                          : 'ویرایش قانون در /etc/hosts.deny'
                        : isEn
                        ? 'Add Rule to /etc/hosts.deny'
                        : 'افزودن قانون به /etc/hosts.deny'}
                    </span>
                    {editingDenyIndex !== null && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDenyIndex(null);
                          setEditingDenyId(null);
                          setDenyClients('ALL');
                        }}
                        className="text-[11px] text-slate-400 hover:text-slate-200 underline cursor-pointer"
                      >
                        {isEn ? 'Cancel Edit' : 'انصراف'}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">Daemon (Service)</label>
                      <input
                        type="text"
                        id="input-deny-daemon"
                        placeholder="ALL, sshd"
                        value={denyDaemon}
                        onChange={(e) => setDenyDaemon(e.target.value)}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-rose-500 ${
                          isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">
                        {isEn ? 'Clients (IP / Pattern)' : 'کلاینت‌ها (IP / الگو)'}
                      </label>
                      <input
                        type="text"
                        id="input-deny-clients"
                        placeholder="ALL or 198.51.100.0/24"
                        value={denyClients}
                        onChange={(e) => setDenyClients(e.target.value)}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-rose-500 ${
                          isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">
                        {isEn ? 'Options (Action)' : 'گزینه‌ها'}
                      </label>
                      <input
                        type="text"
                        id="input-deny-options"
                        placeholder=": DENY"
                        value={denyOptions}
                        onChange={(e) => setDenyOptions(e.target.value)}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-rose-500 ${
                          isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">
                        {isEn ? 'Comment' : 'توضیحات'}
                      </label>
                      <input
                        type="text"
                        id="input-deny-comment"
                        placeholder="# block all by default"
                        value={denyComment}
                        onChange={(e) => setDenyComment(e.target.value)}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-rose-500 ${
                          isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      id="btn-save-deny-rule"
                      disabled={savingTcp || !denyDaemon.trim() || !denyClients.trim()}
                      onClick={handleSaveDenyRule}
                      className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {editingDenyIndex !== null ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      <span>
                        {savingTcp
                          ? isEn
                            ? 'Saving...'
                            : 'در حال ذخیره...'
                          : editingDenyIndex !== null
                          ? isEn
                            ? 'Update Deny Rule'
                            : 'بروزرسانی قانون'
                          : isEn
                          ? 'Add to hosts.deny'
                          : 'افزودن به hosts.deny'}
                      </span>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              /* Raw File Editor Mode for /etc/hosts.deny */
              <div className="space-y-2">
                <textarea
                  id="textarea-raw-hosts-deny"
                  rows={12}
                  value={tcpData.rawDeny}
                  onChange={(e) => setTcpData((prev) => ({ ...prev, rawDeny: e.target.value }))}
                  className={`w-full p-3 rounded-xl font-mono text-xs border focus:outline-none focus:ring-2 focus:ring-rose-500 leading-relaxed ${
                    isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-100'
                  }`}
                  placeholder="# /etc/hosts.deny raw content"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    {isEn ? 'Automatic backup will be created prior to overwrite.' : 'نسخه پشتیبان به صورت خودکار پیش از ذخیره ایجاد می‌شود.'}
                  </span>
                  <button
                    type="button"
                    id="btn-save-raw-deny"
                    disabled={savingTcp}
                    onClick={handleSaveRawDeny}
                    className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Save className={`w-3.5 h-3.5 ${savingTcp ? 'animate-spin' : ''}`} />
                    <span>{savingTcp ? (isEn ? 'Saving...' : 'در حال ذخیره...') : (isEn ? 'Save /etc/hosts.deny' : 'ذخیره /etc/hosts.deny')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
