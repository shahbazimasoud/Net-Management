import React, { useState, useEffect } from 'react';
import { Globe, Plus, Trash2, Edit2, Save, RefreshCw, CheckCircle2, AlertTriangle, Check } from 'lucide-react';
import { RemoteServer, LinuxHostEntry, LinuxHostnameInfo } from '../../../types';
import {
  fetchLinuxHostname,
  updateLinuxHostname,
  fetchLinuxHostsFile,
  updateLinuxHostsFile,
} from '../../../services/api';
import { FieldInfoTooltip } from '../../common/FieldInfoTooltip';

interface LinuxHostnameSectionProps {
  server: RemoteServer;
  ephemeralPassword?: string;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const LinuxHostnameSection: React.FC<LinuxHostnameSectionProps> = ({
  server,
  ephemeralPassword,
  isLightMode = false,
  isEn = true,
}) => {
  const [hostnameInfo, setHostnameInfo] = useState<LinuxHostnameInfo | null>(null);
  const [newHostname, setNewHostname] = useState('');
  const [updateHostsOnRename, setUpdateHostsOnRename] = useState(true);
  const [hostsEntries, setHostsEntries] = useState<LinuxHostEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingHostname, setSavingHostname] = useState(false);
  const [savingHosts, setSavingHosts] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // New host entry form
  const [newIp, setNewIp] = useState('');
  const [newHostnames, setNewHostnames] = useState('');
  const [newComment, setNewComment] = useState('');
  const [editingOldIp, setEditingOldIp] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const [hRes, fRes] = await Promise.all([
        fetchLinuxHostname(server.id, ephemeralPassword),
        fetchLinuxHostsFile(server.id, ephemeralPassword),
      ]);

      if (hRes.success && hRes.info) {
        setHostnameInfo(hRes.info);
        setNewHostname(hRes.info.staticHostname || '');
      }
      if (fRes.success && fRes.entries) {
        setHostsEntries(fRes.entries);
      }
    } catch (err: any) {
      setFeedback({
        message: err?.message || (isEn ? 'Failed to fetch hostname or hosts file' : 'خطا در دریافت اطلاعات هاست یا فایل hosts'),
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [server.id, ephemeralPassword]);

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
          action: 'add',
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

  const startEditEntry = (entry: LinuxHostEntry) => {
    setNewIp(entry.ip);
    setNewHostnames(entry.hostnames.join(' '));
    setNewComment(entry.comment || '');
    setEditingOldIp(entry.ip);
  };

  const cancelEdit = () => {
    setNewIp('');
    setNewHostnames('');
    setNewComment('');
    setEditingOldIp(null);
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
                {isEn ? 'Hostname & /etc/hosts Configuration' : 'نام سرور و تنظیمات فایل /etc/hosts'}
              </h4>
              <FieldInfoTooltip
                title={isEn ? 'Linux Hostname & /etc/hosts' : 'نام هاست و فایل /etc/hosts'}
                infoWhatEn="Controls system hostname via hostnamectl and local IP-to-hostname name resolution in /etc/hosts."
                infoWhatFa="تنظیم نام رسمی سرور با hostnamectl و مدیریت جدول نگاشت محلی IP به نام در فایل /etc/hosts."
                infoWhyEn="Required for network discovery, cluster node recognition, mail servers (FQDN), and local service resolution without public DNS."
                infoWhyFa="ضروری جهت شناسایی نود در شبکه و کلاستر، جلوگیری از خطای سرویس‌ها و مسیریابی نام‌های محلی بدون نیاز به DNS خارجی."
                infoExampleEn="srv-core-01 or 127.0.0.1 db-node.local"
                infoExampleFa="srv-core-01 یا تنظیم ۱۲۷.۰.۰.۱ db-node.local"
                isEn={isEn}
                isLightMode={isLightMode}
              />
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              {isEn ? 'Current Static Hostname:' : 'نام هاست فعال فعلی:'}{' '}
              <strong className="text-blue-400">{hostnameInfo?.staticHostname || server.name || '-'}</strong>
            </span>
          </div>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={loadData}
          id="btn-refresh-hostname-hosts"
          title={isEn ? 'Reload Hostname & Hosts' : 'بارگذاری مجدد'}
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
              <span>{savingHostname ? (isEn ? 'Saving...' : 'در حال ثبت...') : (isEn ? 'Apply Hostname' : 'اعمال نام')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Part 2: /etc/hosts File Table & Management */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold block text-slate-300">
            {isEn ? '/etc/hosts Static Lookup Table' : 'جدول نگاشت فایل /etc/hosts'}
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            {hostsEntries.length} {isEn ? 'Entries' : 'رکورد'}
          </span>
        </div>

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
                  <th className="p-2.5 w-40">IP Address</th>
                  <th className="p-2.5">{isEn ? 'Hostnames / Aliases' : 'نام‌های هاست و مستعار'}</th>
                  <th className="p-2.5">{isEn ? 'Comment' : 'توضیحات'}</th>
                  <th className="p-2.5 w-24 text-center">{isEn ? 'Actions' : 'عملیات'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {hostsEntries.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-slate-400 text-xs">
                      {isEn ? 'No hosts entries loaded.' : 'رکوردی یافت نشد.'}
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
                        <td className="p-2.5 font-bold text-blue-400">{entry.ip}</td>
                        <td className="p-2.5">
                          <div className="flex flex-wrap gap-1">
                            {entry.hostnames.map((h, i) => (
                              <span
                                key={i}
                                className="px-1.5 py-0.5 rounded text-[11px] bg-slate-800 text-slate-200 border border-slate-700"
                              >
                                {h}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-2.5 text-slate-400 text-[11px] truncate max-w-xs">{entry.comment || '-'}</td>
                        <td className="p-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => startEditEntry(entry)}
                              title={isEn ? 'Edit Entry' : 'ویرایش رکورد'}
                              className="p-1 rounded hover:bg-blue-500/20 text-slate-400 hover:text-blue-400 transition"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            {!isLocalhost && (
                              <button
                                type="button"
                                onClick={() => handleDeleteHostEntry(entry.ip)}
                                title={isEn ? 'Delete Entry' : 'حذف رکورد'}
                                className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition"
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
                onClick={cancelEdit}
                className="text-[11px] text-slate-400 hover:text-slate-200 underline"
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
                placeholder="e.g. 192.168.1.100"
                value={newIp}
                onChange={(e) => setNewIp(e.target.value)}
                className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                  isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
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
                  isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
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
                  isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
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
      </div>
    </div>
  );
};
