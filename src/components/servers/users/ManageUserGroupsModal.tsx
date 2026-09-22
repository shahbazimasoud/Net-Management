import React, { useState, useMemo } from 'react';
import {
  Shield,
  X,
  Minus,
  Maximize2,
  Minimize2,
  Check,
  Search,
  Plus,
  AlertTriangle,
  Users,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { RemoteServer, LinuxSystemUser, LinuxSystemGroup } from '../../../types';
import { updateLinuxUserGroups, createLinuxGroup } from '../../../services/api';
import { FieldInfoTooltip } from '../../common/FieldInfoTooltip';

interface ManageUserGroupsModalProps {
  server: RemoteServer;
  user: LinuxSystemUser;
  systemGroups: LinuxSystemGroup[];
  ephemeralPassword?: string;
  isLightMode?: boolean;
  isEn?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ManageUserGroupsModal: React.FC<ManageUserGroupsModalProps> = ({
  server,
  user,
  systemGroups,
  ephemeralPassword,
  isLightMode = false,
  isEn = true,
  onClose,
  onSuccess,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Current supplementary groups (excluding primary group)
  const [selectedGroups, setSelectedGroups] = useState<string[]>(() => {
    const existing = user.groups || [];
    return existing.filter((g) => g !== user.primaryGroup);
  });

  const [filterQuery, setFilterQuery] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [availableGroups, setAvailableGroups] = useState<LinuxSystemGroup[]>(systemGroups);

  const toggleGroup = (groupName: string) => {
    if (groupName === user.primaryGroup) return; // primary group is governed by GID
    if (selectedGroups.includes(groupName)) {
      setSelectedGroups(selectedGroups.filter((g) => g !== groupName));
    } else {
      setSelectedGroups([...selectedGroups, groupName]);
    }
  };

  const handleQuickAddGroup = async () => {
    const clean = newGroupName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!clean) return;

    if (availableGroups.some((g) => g.name === clean)) {
      if (!selectedGroups.includes(clean)) {
        setSelectedGroups([...selectedGroups, clean]);
      }
      setNewGroupName('');
      return;
    }

    setCreatingGroup(true);
    try {
      const res = await createLinuxGroup(server.id, clean, ephemeralPassword);
      if (res.success) {
        const newGroupObj: LinuxSystemGroup = { name: clean, gid: 0, members: [] };
        setAvailableGroups([...availableGroups, newGroupObj]);
        setSelectedGroups([...selectedGroups, clean]);
        setNewGroupName('');
      } else {
        setError(res.error || (isEn ? 'Failed to create group' : 'خطا در ایجاد گروه'));
      }
    } catch (err: any) {
      setError(err?.message || (isEn ? 'Network error creating group' : 'خطای شبکه در ایجاد گروه'));
    } finally {
      setCreatingGroup(false);
    }
  };

  const filteredGroups = useMemo(() => {
    if (!filterQuery.trim()) return availableGroups;
    const q = filterQuery.toLowerCase();
    return availableGroups.filter(
      (g) => g.name.toLowerCase().includes(q) || String(g.gid).includes(q)
    );
  }, [availableGroups, filterQuery]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await updateLinuxUserGroups(server.id, user.username, selectedGroups, ephemeralPassword);
      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setError(res.error || (isEn ? 'Failed to update groups' : 'خطا در به‌روزرسانی گروه‌ها'));
      }
    } catch (err: any) {
      setError(err?.message || (isEn ? 'Network error updating groups' : 'خطای ارتباط در تغییر گروه‌ها'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div
        className={`flex flex-col border shadow-2xl transition-all duration-200 overflow-hidden ${
          isMaximized
            ? 'fixed top-0 left-0 right-0 bottom-8 z-50 p-0 w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-2xl max-h-[90vh] rounded-2xl'
        } ${isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'}`}
      >
        {/* Header with Mandatory 3 Controls */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0 ${
            isLightMode ? 'bg-slate-100/80 border-slate-200' : 'bg-slate-900/80 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold">
                  {isEn ? `Manage Group Permissions: ${user.username}` : `مدیریت و انتساب گروه‌ها: ${user.username}`}
                </h3>
                <FieldInfoTooltip
                  title={isEn ? 'Linux Group Access Control' : 'کنترل دسترسی از طریق گروه‌ها در لینوکس'}
                  infoWhatEn="Assigns supplementary groups to the specified user using usermod -G based on real system groups from /etc/group."
                  infoWhatFa="تخصیص گروه‌های تکمیلی به کاربر مورد نظر بر اساس گروه‌های زنده شناسایی‌شده در سرور لینوکس (/etc/group)."
                  infoWhyEn="Grants administrative rights (sudo/wheel), container execution (docker), storage access, or audio/video hardware privileges."
                  infoWhyFa="اعطای دسترسی‌های اجرایی خاص مانند سودو (sudo)، داکر (docker)، دسترسی به پورت‌های سریال یا دایرکتوری‌های مشترک وب."
                  infoExampleEn="sudo usermod -G sudo,docker,adm developer"
                  infoExampleFa="sudo usermod -G sudo,docker,adm developer"
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                UID: {user.uid} • {server.name || server.ip}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Minimize' : 'کوچک‌سازی'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition cursor-pointer"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isEn ? (isMaximized ? 'Exit Fullscreen' : 'Fullscreen') : isMaximized ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition cursor-pointer"
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Close' : 'بستن'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div
              className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-mono ${
                isLightMode ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
              }`}
            >
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* User Overview Box */}
          <div
            className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center gap-3">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-mono tracking-wider">
                  {isEn ? 'Target User' : 'کاربر هدف'}
                </span>
                <span className="font-bold font-mono text-cyan-400">{user.username}</span>
              </div>
              <div className="h-6 w-px bg-slate-700/50" />
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-mono tracking-wider">
                  {isEn ? 'Primary Group' : 'گروه اصلی (Primary GID)'}
                </span>
                <span className="font-mono text-amber-400 font-semibold">
                  {user.primaryGroup || user.gid} (GID: {user.gid})
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400 font-mono">
                {isEn ? 'Assigned Groups:' : 'گروه‌های تکمیلی:'}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-mono font-bold">
                {selectedGroups.length}
              </span>
            </div>
          </div>

          {/* Quick Privileged Roles Buttons */}
          <div>
            <span className="text-xs font-semibold block mb-2 text-slate-400">
              {isEn ? 'Common Administrative Groups' : 'گروه‌های مهم مدیریتی و دسترسی سریع'}
            </span>
            <div className="flex flex-wrap gap-2">
              {availableGroups
                .filter((g) => ['sudo', 'wheel', 'docker', 'adm', 'root', 'lxd', 'kvm', 'www-data'].includes(g.name))
                .map((g) => {
                  const isChecked = selectedGroups.includes(g.name);
                  const isPrimary = user.primaryGroup === g.name;
                  return (
                    <button
                      key={g.name}
                      type="button"
                      disabled={isPrimary}
                      onClick={() => toggleGroup(g.name)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                        isPrimary
                          ? 'opacity-60 bg-amber-500/10 text-amber-400 border-amber-500/30 cursor-not-allowed'
                          : isChecked
                          ? g.name === 'sudo' || g.name === 'wheel'
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-sm'
                            : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
                          : isLightMode
                          ? 'bg-white border-slate-300 text-slate-700 hover:border-cyan-400'
                          : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {g.name === 'sudo' || g.name === 'wheel' ? (
                        <Shield className="w-3.5 h-3.5 text-rose-400" />
                      ) : (
                        <Users className="w-3.5 h-3.5 text-cyan-400" />
                      )}
                      <span>{g.name}</span>
                      {isChecked && <Check className="w-3 h-3 text-cyan-400 ml-0.5" />}
                      {isPrimary && (
                        <span className="text-[10px] text-amber-400 font-mono">({isEn ? 'Primary' : 'اصلی'})</span>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Group Search & List */}
          <div
            className={`p-4 rounded-xl border space-y-3 ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/40 border-slate-800'
            }`}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <label className="text-xs font-semibold flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-cyan-400" />
                <span>{isEn ? 'All Available Groups on Remote Server' : 'تمامی گروه‌های موجود در سرور (/etc/group)'}</span>
              </label>

              <div className="relative w-full sm:w-56">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={isEn ? 'Search group name / GID...' : 'جستجوی نام گروه یا GID...'}
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  className={`w-full pl-8 pr-3 py-1 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
                    isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-slate-100'
                  }`}
                />
              </div>
            </div>

            {/* Groups Grid */}
            <div className="max-h-56 overflow-y-auto p-2 rounded-lg border border-white/5 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {filteredGroups.map((g) => {
                const isSelected = selectedGroups.includes(g.name);
                const isPrimary = user.primaryGroup === g.name;

                return (
                  <button
                    key={g.name}
                    type="button"
                    disabled={isPrimary}
                    onClick={() => toggleGroup(g.name)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-mono border transition text-left flex items-center justify-between cursor-pointer ${
                      isPrimary
                        ? 'opacity-60 bg-amber-500/10 text-amber-400 border-amber-500/30 cursor-not-allowed'
                        : isSelected
                        ? 'bg-cyan-500 text-slate-950 font-bold border-cyan-400 shadow-sm'
                        : isLightMode
                        ? 'bg-white text-slate-700 border-slate-300 hover:border-cyan-400'
                        : 'bg-slate-800/60 text-slate-300 border-slate-700 hover:border-slate-500'
                    }`}
                  >
                    <span className="truncate" title={g.name}>
                      {g.name}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {isPrimary ? (
                        <span className="text-[10px] font-sans">({isEn ? 'Primary' : 'اصلی'})</span>
                      ) : isSelected ? (
                        <Check className="w-3.5 h-3.5 text-slate-950" />
                      ) : (
                        <span className="text-[10px] text-slate-400">{g.gid > 0 ? g.gid : ''}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Create New Group Inline */}
            <div className="flex items-center gap-2 pt-2 border-t border-white/5">
              <input
                type="text"
                placeholder={isEn ? 'Create brand new group (groupadd)...' : 'نام گروه جدید برای ایجاد و انتساب...'}
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
                  isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-slate-100'
                }`}
              />
              <button
                type="button"
                disabled={creatingGroup || !newGroupName.trim()}
                onClick={handleQuickAddGroup}
                className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{creatingGroup ? (isEn ? 'Creating...' : 'در حال ایجاد...') : (isEn ? 'Create Group' : 'ایجاد گروه')}</span>
              </button>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                isLightMode ? 'border-slate-300 text-slate-700 hover:bg-slate-100' : 'border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {isEn ? 'Cancel' : 'انصراف'}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition cursor-pointer flex items-center gap-2 disabled:opacity-50 shadow-md"
            >
              <Shield className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? (isEn ? 'Saving Groups...' : 'در حال ثبت...') : (isEn ? 'Save Group Permissions' : 'ذخیره دسترسی گروه‌ها')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
