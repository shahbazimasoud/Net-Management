import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Crown,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  UserCheck,
  UserCog,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { CommsChannel, CommsChannelMember, CommsRecipientOption } from '../../types';
import {
  addCommsChannelMembers,
  fetchCommsChannels,
  fetchCommsRecipients,
  removeCommsChannelMember,
  updateCommsChannelMemberRole,
} from '../../services/commsApi';
import {
  getCommsUserPresenceMeta,
  presenceSortRank,
  resolvePresenceFromState,
  useCommsPresenceMap,
} from '../../services/commsPresence';
import { useAuth } from '../../context/AuthContext';
import { isUserSuperAdmin } from '../../utils/rbac';
import { useModalDock } from '../../context/ModalDockContext';
import { ModalHeaderControls } from '../common/ModalHeaderControls';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

const MANAGE_MEMBERS_MODAL_ID = 'comms-manage-channel-members-modal';

export interface ManageChannelMembersTriggerDetail {
  channel: CommsChannel;
  initialTab?: 'members' | 'add';
}

export function dispatchOpenManageChannelMembers(detail: ManageChannelMembersTriggerDetail): void {
  if (typeof window === 'undefined' || !detail?.channel?.id) return;
  window.dispatchEvent(
    new CustomEvent<ManageChannelMembersTriggerDetail>('nettop-open-manage-channel-members', {
      detail,
    })
  );
}

export function isUserChannelOwner(
  channel: CommsChannel | null | undefined,
  user: { id?: string | null; username?: string | null } | null | undefined,
  isSuperAdmin: boolean
): boolean {
  if (!channel || channel.channelType !== 'group') return false;
  if (isSuperAdmin) return true;
  const uid = String(user?.id || '').trim().toLowerCase();
  const uname = String(user?.username || '').trim().toLowerCase();
  const creatorId = String(channel.createdByUserId || '').trim().toLowerCase();
  if (creatorId && ((uid && creatorId === uid) || (uname && creatorId === uname))) {
    return true;
  }
  return Boolean(
    channel.members?.some((m) => {
      const mUid = String(m.userId || '').trim().toLowerCase();
      const mUname = String(m.username || '').trim().toLowerCase();
      const matched = (uid && mUid === uid) || (uname && mUname === uname);
      return matched && m.role === 'owner';
    })
  );
}

export function isUserChannelModerator(
  channel: CommsChannel | null | undefined,
  user: { id?: string | null; username?: string | null } | null | undefined,
  isSuperAdmin: boolean
): boolean {
  if (isUserChannelOwner(channel, user, isSuperAdmin)) return true;
  if (!channel || channel.channelType !== 'group') return false;
  const uid = String(user?.id || '').trim().toLowerCase();
  const uname = String(user?.username || '').trim().toLowerCase();
  return Boolean(
    channel.members?.some((m) => {
      const mUid = String(m.userId || '').trim().toLowerCase();
      const mUname = String(m.username || '').trim().toLowerCase();
      const matched = (uid && mUid === uid) || (uname && mUname === uname);
      return matched && m.role === 'admin';
    })
  );
}

export interface ManageChannelMembersModalProps {
  isEn: boolean;
  isLightMode: boolean;
  isRtl: boolean;
}

export const ManageChannelMembersModal: React.FC<ManageChannelMembersModalProps> = ({
  isEn,
  isLightMode,
  isRtl,
}) => {
  const { user, effectivePolicy } = useAuth();
  const isSuperAdmin = isUserSuperAdmin(user, effectivePolicy);
  const { dockModal, undockModal } = useModalDock();
  const presenceState = useCommsPresenceMap();

  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [activeTab, setActiveTab] = useState<'members' | 'add'>('members');
  const [channel, setChannel] = useState<CommsChannel | null>(null);
  const [recipients, setRecipients] = useState<CommsRecipientOption[]>([]);
  const [loadingChannel, setLoadingChannel] = useState(false);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  const [memberSearch, setMemberSearch] = useState('');
  const [addSearch, setAddSearch] = useState('');
  const [selectedAddIds, setSelectedAddIds] = useState<string[]>([]);

  const [busyMemberKey, setBusyMemberKey] = useState<string | null>(null);
  const [addingBusy, setAddingBusy] = useState(false);
  const [confirmRemoveKey, setConfirmRemoveKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const notifyOverlayState = useCallback((open: boolean) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('nettop-comms-overlay-state', {
        detail: { source: MANAGE_MEMBERS_MODAL_ID, open },
      })
    );
  }, []);

  const refreshChannelData = useCallback(async (channelId: string) => {
    setLoadingChannel(true);
    try {
      const list = await fetchCommsChannels(true);
      const found = list.find((c) => c.id === channelId) || null;
      if (found) {
        setChannel(found);
      }
    } catch {
      // Keep current hydrated channel snapshot on transient fetch errors
    } finally {
      setLoadingChannel(false);
    }
  }, []);

  const loadRecipients = useCallback(async () => {
    setLoadingRecipients(true);
    try {
      const opts = await fetchCommsRecipients(true);
      setRecipients(opts);
    } catch {
      setRecipients([]);
    } finally {
      setLoadingRecipients(false);
    }
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ManageChannelMembersTriggerDetail>)?.detail;
      if (!detail?.channel?.id) return;
      setChannel(detail.channel);
      setActiveTab(detail.initialTab || 'members');
      setMemberSearch('');
      setAddSearch('');
      setSelectedAddIds([]);
      setConfirmRemoveKey(null);
      setErrorMsg(null);
      setStatusMsg(null);
      setIsOpen(true);
      undockModal(MANAGE_MEMBERS_MODAL_ID);
      notifyOverlayState(true);
      void refreshChannelData(detail.channel.id);
      void loadRecipients();
    };
    window.addEventListener('nettop-open-manage-channel-members', handler as EventListener);
    return () =>
      window.removeEventListener('nettop-open-manage-channel-members', handler as EventListener);
  }, [loadRecipients, notifyOverlayState, refreshChannelData, undockModal]);

  useEffect(() => {
    if (!isOpen || !channel?.id) return;
    const onWsEvent = (e: Event) => {
      const evt = (e as CustomEvent<any>)?.detail;
      if (!evt) return;
      if (evt.type === 'channel:updated' && evt.channel?.id === channel.id) {
        setChannel(evt.channel);
      } else if (evt.type === 'channel:removed' && evt.channelId === channel.id) {
        setIsOpen(false);
        setChannel(null);
        undockModal(MANAGE_MEMBERS_MODAL_ID);
        notifyOverlayState(false);
      }
    };
    window.addEventListener('nettop-comms-ws-event', onWsEvent as EventListener);
    return () => window.removeEventListener('nettop-comms-ws-event', onWsEvent as EventListener);
  }, [channel?.id, isOpen, notifyOverlayState, undockModal]);

  useEffect(() => {
    return () => {
      notifyOverlayState(false);
    };
  }, [notifyOverlayState]);

  const handleClose = () => {
    setIsOpen(false);
    setConfirmRemoveKey(null);
    setSelectedAddIds([]);
    setErrorMsg(null);
    setStatusMsg(null);
    undockModal(MANAGE_MEMBERS_MODAL_ID);
    notifyOverlayState(false);
  };

  const handleMinimize = () => {
    setIsOpen(false);
    notifyOverlayState(false);
    const chLabel = channel ? (isEn ? channel.nameEn || channel.name : channel.name) : '';
    dockModal({
      id: MANAGE_MEMBERS_MODAL_ID,
      labelEn: chLabel ? `Manage Members (${chLabel})` : 'Manage Channel Members',
      labelFa: chLabel ? `مدیریت اعضا (${chLabel})` : 'مدیریت اعضای کانال',
      category: 'tools',
      onRestore: () => {
        setIsOpen(true);
        notifyOverlayState(true);
      },
      onClose: () => {
        setIsOpen(false);
        setChannel(null);
        notifyOverlayState(false);
      },
    });
  };

  const actorIsOwner = useMemo(
    () => isUserChannelOwner(channel, user, Boolean(isSuperAdmin)),
    [channel, isSuperAdmin, user]
  );

  const actorIsModerator = useMemo(
    () => isUserChannelModerator(channel, user, Boolean(isSuperAdmin)),
    [channel, isSuperAdmin, user]
  );

  const ownerCount = useMemo(
    () => (channel?.members || []).filter((m) => m.role === 'owner').length,
    [channel?.members]
  );

  const currentUserIds = useMemo(() => {
    const s = new Set<string>();
    if (user?.id) s.add(String(user.id).trim().toLowerCase());
    if (user?.username) s.add(String(user.username).trim().toLowerCase());
    return s;
  }, [user?.id, user?.username]);

  const creatorIdLower = useMemo(
    () => String(channel?.createdByUserId || '').trim().toLowerCase(),
    [channel?.createdByUserId]
  );

  const isMemberSelf = useCallback(
    (m: CommsChannelMember) => {
      const uid = String(m.userId || '').trim().toLowerCase();
      const uname = String(m.username || '').trim().toLowerCase();
      return (uid && currentUserIds.has(uid)) || (uname && currentUserIds.has(uname));
    },
    [currentUserIds]
  );

  const isMemberCreator = useCallback(
    (m: CommsChannelMember) => {
      if (!creatorIdLower) return false;
      const uid = String(m.userId || '').trim().toLowerCase();
      const uname = String(m.username || '').trim().toLowerCase();
      return uid === creatorIdLower || uname === creatorIdLower;
    },
    [creatorIdLower]
  );

  const sortedFilteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    const list = (channel?.members || []).filter((m) => {
      if (!q) return true;
      return (
        (m.username || '').toLowerCase().includes(q) ||
        (m.fullName || '').toLowerCase().includes(q) ||
        (m.role || '').toLowerCase().includes(q)
      );
    });
    const roleRank = (role?: string) => (role === 'owner' ? 0 : role === 'admin' ? 1 : 2);
    return [...list].sort((a, b) => {
      const rDiff = roleRank(a.role) - roleRank(b.role);
      if (rDiff !== 0) return rDiff;
      const pA = resolvePresenceFromState(presenceState, [a.username, a.userId]);
      const pB = resolvePresenceFromState(presenceState, [b.username, b.userId]);
      const pDiff = presenceSortRank(pA) - presenceSortRank(pB);
      if (pDiff !== 0) return pDiff;
      return (a.fullName || a.username || '').localeCompare(b.fullName || b.username || '');
    });
  }, [channel?.members, memberSearch, presenceState]);

  const existingMemberKeys = useMemo(() => {
    const s = new Set<string>();
    for (const m of channel?.members || []) {
      if (m.username) s.add(m.username.trim().toLowerCase());
      if (m.userId) s.add(m.userId.trim().toLowerCase());
    }
    return s;
  }, [channel?.members]);

  const availableRecipients = useMemo(() => {
    const q = addSearch.trim().toLowerCase();
    const list = recipients.filter((r) => {
      if (r.type !== 'user') return false;
      const uname = String(r.username || '').trim().toLowerCase();
      const rid = String(r.id || '').trim().toLowerCase();
      if ((uname && existingMemberKeys.has(uname)) || (rid && existingMemberKeys.has(rid))) {
        return false;
      }
      if (!q) return true;
      return (
        (r.label || '').toLowerCase().includes(q) ||
        (r.labelEn || '').toLowerCase().includes(q) ||
        uname.includes(q) ||
        (r.roleOrType || '').toLowerCase().includes(q)
      );
    });
    return [...list].sort((a, b) => {
      const pa = resolvePresenceFromState(
        presenceState,
        [a.username, a.id],
        a.presenceStatus,
        a.isOnline
      );
      const pb = resolvePresenceFromState(
        presenceState,
        [b.username, b.id],
        b.presenceStatus,
        b.isOnline
      );
      const diff = presenceSortRank(pa) - presenceSortRank(pb);
      if (diff !== 0) return diff;
      return (a.labelEn || a.label || a.username || '').localeCompare(
        b.labelEn || b.label || b.username || ''
      );
    });
  }, [addSearch, existingMemberKeys, presenceState, recipients]);

  const emitLocalChannelUpdate = (updatedChannel: CommsChannel) => {
    setChannel(updatedChannel);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('nettop-comms-ws-event', {
          detail: { type: 'channel:updated', channel: updatedChannel },
        })
      );
    }
  };

  const handleRoleChange = async (
    member: CommsChannelMember,
    nextRole: 'owner' | 'admin' | 'member'
  ) => {
    if (!channel || !actorIsOwner) return;
    const key = member.userId || member.username;
    setBusyMemberKey(key);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await updateCommsChannelMemberRole(channel.id, key, nextRole);
      if (res.channel) {
        emitLocalChannelUpdate(res.channel);
      }
      const roleLabel =
        nextRole === 'owner'
          ? isEn
            ? 'Owner'
            : 'مالک'
          : nextRole === 'admin'
          ? isEn
            ? 'Admin'
            : 'مدیر'
          : isEn
          ? 'Member'
          : 'عضو';
      setStatusMsg(
        isEn
          ? `Updated @${member.username} role to ${roleLabel}.`
          : `نقش کاربر @${member.username} به «${roleLabel}» تغییر یافت.`
      );
    } catch (err: any) {
      setErrorMsg(
        err?.message ||
          (isEn ? 'Failed to update member role.' : 'خطا در تغییر نقش عضو کانال.')
      );
    } finally {
      setBusyMemberKey(null);
    }
  };

  const handleConfirmRemove = async (member: CommsChannelMember) => {
    if (!channel || !actorIsModerator) return;
    const key = member.userId || member.username;
    setBusyMemberKey(key);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await removeCommsChannelMember(channel.id, key);
      setConfirmRemoveKey(null);
      if (res.channel) {
        emitLocalChannelUpdate(res.channel);
      }
      setStatusMsg(
        isEn
          ? `Removed @${member.username} from the channel.`
          : `کاربر @${member.username} از کانال حذف شد.`
      );
    } catch (err: any) {
      setErrorMsg(
        err?.message ||
          (isEn ? 'Failed to remove channel member.' : 'خطا در حذف کاربر از کانال.')
      );
    } finally {
      setBusyMemberKey(null);
    }
  };

  const handleAddSelectedMembers = async () => {
    if (!channel || selectedAddIds.length === 0 || addingBusy) return;
    setAddingBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await addCommsChannelMembers(channel.id, selectedAddIds);
      const addedCount = selectedAddIds.length;
      setSelectedAddIds([]);
      if (res.channel) {
        emitLocalChannelUpdate(res.channel);
      }
      setStatusMsg(
        isEn
          ? `Added ${addedCount} member(s) to the channel.`
          : `${addedCount} عضو جدید به کانال اضافه شد.`
      );
      setActiveTab('members');
    } catch (err: any) {
      setErrorMsg(
        err?.message ||
          (isEn ? 'Failed to add selected members.' : 'خطا در افزودن اعضای انتخاب‌شده.')
      );
    } finally {
      setAddingBusy(false);
    }
  };

  if (!isOpen || !channel || typeof document === 'undefined') return null;

  const channelDisplayName = isEn ? channel.nameEn || channel.name : channel.name;

  const roleBadgeStyle = (role: string) => {
    if (role === 'owner') {
      return isLightMode
        ? 'bg-amber-50 border-amber-300 text-amber-800'
        : 'bg-amber-500/15 border-amber-500/40 text-amber-300';
    }
    if (role === 'admin') {
      return isLightMode
        ? 'bg-indigo-50 border-indigo-300 text-indigo-800'
        : 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300';
    }
    return isLightMode
      ? 'bg-slate-100 border-slate-300 text-slate-700'
      : 'bg-slate-800 border-slate-700 text-slate-300';
  };

  const getRoleLabel = (role: string) => {
    if (role === 'owner') return isEn ? 'Owner' : 'مالک';
    if (role === 'admin') return isEn ? 'Admin' : 'مدیر';
    return isEn ? 'Member' : 'عضو';
  };

  return createPortal(
    <div
      className="fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs"
      dir={isRtl ? 'rtl' : 'ltr'}
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`flex flex-col border shadow-2xl overflow-hidden transition-all ${
          isMaximized ? 'w-full h-full rounded-xl' : 'w-full max-w-3xl max-h-full rounded-2xl'
        } ${
          isLightMode
            ? 'bg-white border-slate-200 text-slate-900'
            : 'bg-slate-900 border-slate-700/80 text-slate-100'
        }`}
      >
        {/* Header with Mandatory 3 Controls */}
        <div
          className={`flex items-center justify-between gap-3 px-4 py-3 border-b shrink-0 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/80 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`p-2 rounded-xl border shrink-0 ${
                isLightMode
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                  : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
              }`}
            >
              <UserCog className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="text-sm font-bold truncate">
                  {isEn ? 'Manage Channel Users & Roles' : 'مدیریت کاربران و نقش‌های کانال'}
                </h3>
                <FieldInfoTooltip
                  title={isEn ? 'Channel User Management' : 'مدیریت کاربران کانال'}
                  infoWhatEn="Allows the channel owner, channel admins, or Super Admin to view members, add new users, remove users, and assign channel roles (Owner, Admin, Member)."
                  infoWhatFa="امکان مشاهده لیست اعضا، افزودن کاربر جدید، حذف اعضا و تعیین نقش‌های داخل کانال (مالک، مدیر، عضو) را برای سازنده/مالک کانال و مدیر ارشد فراهم می‌کند."
                  infoWhyEn="Ensures strict PostgreSQL-authoritative governance over who participates in operational team channels and prevents unauthorized membership changes."
                  infoWhyFa="حاکمیت امنیتی سمت سرور (PostgreSQL) را برای کنترل دقیق اعضای کانال‌های عملیاتی و جلوگیری از دسترسی غیرمجاز تضمین می‌کند."
                  infoExampleEn="Promote a shift lead to Admin to let them add/remove regular members, or remove an operator who moved to another team."
                  infoExampleFa="ارتقای سرشیفت به نقش «مدیر» برای افزودن/حذف اعضای عادی، یا حذف کاربری که به تیم دیگری منتقل شده است."
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
              <p
                className={`text-[11px] truncate ${
                  isLightMode ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                {channelDisplayName} •{' '}
                {isEn
                  ? `${channel.members?.length || channel.memberCount || 0} member(s)`
                  : `${channel.members?.length || channel.memberCount || 0} عضو`}
              </p>
            </div>
          </div>

          <ModalHeaderControls
            onMinimize={handleMinimize}
            onMaximizeToggle={() => setIsMaximized((prev) => !prev)}
            onClose={handleClose}
            isMaximized={isMaximized}
            isLightMode={isLightMode}
            isEn={isEn}
            extraActions={
              <button
                type="button"
                onClick={() => {
                  void refreshChannelData(channel.id);
                  void loadRecipients();
                }}
                disabled={loadingChannel}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50 ${
                  isLightMode
                    ? 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'
                    : 'hover:bg-slate-800 text-slate-400 hover:text-cyan-300'
                }`}
                title={isEn ? 'Refresh member list' : 'بروزرسانی لیست اعضا'}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingChannel ? 'animate-spin' : ''}`} />
              </button>
            }
          />
        </div>

        {/* Role Capability Banner + Tabs */}
        <div
          className={`px-4 py-2.5 border-b flex flex-wrap items-center justify-between gap-2 shrink-0 ${
            isLightMode ? 'bg-slate-50/70 border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setActiveTab('members');
                setErrorMsg(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'members'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : isLightMode
                  ? 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>{isEn ? 'Current Members' : 'اعضای فعلی'}</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums ${
                  activeTab === 'members'
                    ? 'bg-white/20 text-white'
                    : isLightMode
                    ? 'bg-slate-100 text-slate-700'
                    : 'bg-white/10 text-slate-300'
                }`}
              >
                {channel.members?.length || 0}
              </span>
            </button>

            {actorIsModerator && (
              <button
                type="button"
                onClick={() => {
                  setActiveTab('add');
                  setErrorMsg(null);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'add'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : isLightMode
                    ? 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                    : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>{isEn ? 'Add Users' : 'افزودن کاربر'}</span>
                {selectedAddIds.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums bg-emerald-500 text-white">
                    {selectedAddIds.length}
                  </span>
                )}
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[11px]">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-medium ${
                actorIsOwner
                  ? isLightMode
                    ? 'bg-amber-50 border-amber-300 text-amber-800'
                    : 'bg-amber-500/15 border-amber-500/35 text-amber-300'
                  : actorIsModerator
                  ? isLightMode
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-800'
                    : 'bg-indigo-500/15 border-indigo-500/35 text-indigo-300'
                  : isLightMode
                  ? 'bg-slate-100 border-slate-300 text-slate-700'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              {actorIsOwner ? (
                <Crown className="w-3 h-3" />
              ) : (
                <Shield className="w-3 h-3" />
              )}
              <span>
                {actorIsOwner
                  ? isEn
                    ? 'Owner Access (Full Control)'
                    : 'دسترسی مالک (کنترل کامل)'
                  : actorIsModerator
                  ? isEn
                    ? 'Admin Access (Add / Remove Members)'
                    : 'دسترسی مدیر (افزودن / حذف عضو)'
                  : isEn
                  ? 'View Only'
                  : 'فقط مشاهده'}
              </span>
            </span>
          </div>
        </div>

        {/* Feedback Banners */}
        {(errorMsg || statusMsg) && (
          <div className="px-4 pt-3 shrink-0 space-y-2">
            {errorMsg && (
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs ${
                  isLightMode
                    ? 'bg-rose-50 border-rose-200 text-rose-700'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="flex-1">{errorMsg}</span>
              </div>
            )}
            {statusMsg && (
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs ${
                  isLightMode
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="flex-1">{statusMsg}</span>
              </div>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          {activeTab === 'members' ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder={
                      isEn
                        ? 'Search members by name, username, or role...'
                        : 'جستجو بر اساس نام، نام کاربری یا نقش...'
                    }
                    className={`w-full ps-9 pe-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'
                        : 'bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-500'
                    }`}
                  />
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className={isLightMode ? 'text-slate-600' : 'text-slate-400'}>
                    {isEn ? 'Role Permissions' : 'سطوح نقش کانال'}
                  </span>
                  <FieldInfoTooltip
                    title={isEn ? 'Channel Member Roles' : 'نقش‌های اعضای کانال'}
                    infoWhatEn="Owner has full control over members, roles, and channel deletion. Admin can add or remove regular members. Member participates in channel conversations."
                    infoWhatFa="مالک (Owner) کنترل کامل روی اعضا، تغییر نقش‌ها و حذف کانال دارد. مدیر (Admin) می‌تواند اعضای عادی را اضافه یا حذف کند. عضو (Member) در گفتگوها مشارکت دارد."
                    infoWhyEn="Prevents accidental lockout by always requiring at least one Owner and protecting the original channel creator from unauthorized demotion or removal."
                    infoWhyFa="از قفل شدن کانال جلوگیری می‌کند؛ همیشه حداقل یک مالک در کانال باقی می‌ماند و سازنده اصلی تنها توسط سوپرادمین قابل تنزل یا حذف است."
                    infoExampleEn="Owner: channel creator | Admin: NOC shift supervisor | Member: network engineer."
                    infoExampleFa="مالک: سازنده کانال | مدیر: سرپرست شیفت NOC | عضو: کارشناس شبکه."
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>
              </div>

              {sortedFilteredMembers.length === 0 ? (
                <div
                  className={`py-10 text-center rounded-xl border text-xs ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-500'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400'
                  }`}
                >
                  {isEn ? 'No matching members found.' : 'عضو منطبقی یافت نشد.'}
                </div>
              ) : (
                <div className="space-y-2">
                  {sortedFilteredMembers.map((member) => {
                    const key = member.userId || member.username;
                    const self = isMemberSelf(member);
                    const creator = isMemberCreator(member);
                    const isBusy = busyMemberKey === key;
                    const isConfirming = confirmRemoveKey === key;

                    const presence = resolvePresenceFromState(presenceState, [
                      member.username,
                      member.userId,
                    ]);
                    const presenceMeta = getCommsUserPresenceMeta(presence, isEn);

                    const canRemoveThisMember =
                      !self &&
                      actorIsModerator &&
                      (!creator || Boolean(isSuperAdmin)) &&
                      (actorIsOwner ||
                        (member.role !== 'owner' && member.role !== 'admin'));

                    const canChangeRole =
                      actorIsOwner &&
                      (!creator || Boolean(isSuperAdmin)) &&
                      !(member.role === 'owner' && ownerCount <= 1);

                    return (
                      <div
                        key={key}
                        className={`p-3 rounded-xl border transition ${
                          isLightMode
                            ? 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          {/* User Identity & Presence */}
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="relative shrink-0">
                              <div
                                className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border ${
                                  member.role === 'owner'
                                    ? isLightMode
                                      ? 'bg-amber-100 border-amber-300 text-amber-800'
                                      : 'bg-amber-500/20 border-amber-500/40 text-amber-200'
                                    : isLightMode
                                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                    : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-200'
                                }`}
                              >
                                {(member.fullName || member.username || '?')
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </div>
                              <span
                                className={`absolute -bottom-0.5 -end-0.5 w-3 h-3 rounded-full ring-2 ${
                                  isLightMode ? 'ring-white' : 'ring-slate-950'
                                } ${presenceMeta.dotClass}`}
                                title={presenceMeta.label}
                              />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-bold truncate">
                                  {member.fullName || member.username}
                                </span>
                                <span
                                  className={`text-[11px] font-mono ${
                                    isLightMode ? 'text-slate-500' : 'text-slate-400'
                                  }`}
                                >
                                  @{member.username}
                                </span>
                                {self && (
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                      isLightMode
                                        ? 'bg-cyan-50 border-cyan-200 text-cyan-700'
                                        : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
                                    }`}
                                  >
                                    {isEn ? 'You' : 'شما'}
                                  </span>
                                )}
                                {creator && (
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                      isLightMode
                                        ? 'bg-amber-50 border-amber-200 text-amber-700'
                                        : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                                    }`}
                                  >
                                    {isEn ? 'Creator' : 'سازنده'}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                                <span
                                  className={`inline-flex items-center gap-1 ${presenceMeta.textClass}`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${presenceMeta.dotClass}`} />
                                  {presenceMeta.label}
                                </span>
                                {member.joinedAt && (
                                  <span
                                    className={`text-[10px] ${
                                      isLightMode ? 'text-slate-400' : 'text-slate-500'
                                    }`}
                                  >
                                    •{' '}
                                    {isEn ? 'Joined' : 'عضویت'}:{' '}
                                    {new Date(member.joinedAt).toLocaleDateString(
                                      isEn ? 'en-US' : 'fa-IR'
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Role Control & Remove Action */}
                          <div className="flex items-center gap-2 shrink-0">
                            {canChangeRole ? (
                              <select
                                value={
                                  member.role === 'owner' || member.role === 'admin'
                                    ? member.role
                                    : 'member'
                                }
                                disabled={isBusy}
                                onChange={(e) =>
                                  handleRoleChange(
                                    member,
                                    e.target.value as 'owner' | 'admin' | 'member'
                                  )
                                }
                                className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-50 ${
                                  isLightMode
                                    ? 'bg-white border-slate-300 text-slate-800'
                                    : 'bg-slate-900 border-slate-700 text-slate-100'
                                }`}
                                aria-label={isEn ? 'Member role' : 'نقش عضو'}
                              >
                                <option value="owner">{isEn ? 'Owner' : 'مالک'}</option>
                                <option value="admin">{isEn ? 'Admin' : 'مدیر'}</option>
                                <option value="member">{isEn ? 'Member' : 'عضو'}</option>
                              </select>
                            ) : (
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${roleBadgeStyle(
                                  member.role
                                )}`}
                              >
                                {member.role === 'owner' ? (
                                  <Crown className="w-3 h-3" />
                                ) : member.role === 'admin' ? (
                                  <Shield className="w-3 h-3" />
                                ) : (
                                  <UserCheck className="w-3 h-3" />
                                )}
                                <span>{getRoleLabel(member.role)}</span>
                              </span>
                            )}

                            {canRemoveThisMember && !isConfirming && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => setConfirmRemoveKey(key)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${
                                  isLightMode
                                    ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20'
                                }`}
                                title={isEn ? 'Remove user from channel' : 'حذف کاربر از کانال'}
                              >
                                {isBusy ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <UserMinus className="w-3.5 h-3.5" />
                                )}
                                <span>{isEn ? 'Remove' : 'حذف'}</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Inline 2-Step Removal Confirmation */}
                        {isConfirming && (
                          <div
                            className={`mt-2.5 pt-2.5 border-t flex flex-wrap items-center justify-between gap-2 text-xs ${
                              isLightMode ? 'border-rose-200' : 'border-rose-500/25'
                            }`}
                          >
                            <span
                              className={`font-medium ${
                                isLightMode ? 'text-rose-700' : 'text-rose-300'
                              }`}
                            >
                              {isEn
                                ? `Remove @${member.username} from "${channelDisplayName}"?`
                                : `آیا کاربر @${member.username} از کانال «${channelDisplayName}» حذف شود؟`}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => setConfirmRemoveKey(null)}
                                className={`px-2.5 py-1 rounded-lg border text-xs cursor-pointer transition ${
                                  isLightMode
                                    ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                                }`}
                              >
                                {isEn ? 'Cancel' : 'انصراف'}
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleConfirmRemove(member)}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer transition disabled:opacity-50"
                              >
                                {isBusy && <Loader2 className="w-3 h-3 animate-spin" />}
                                <span>{isEn ? 'Confirm Remove' : 'تایید حذف'}</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            /* Add Members Tab */
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
                  <input
                    type="text"
                    value={addSearch}
                    onChange={(e) => setAddSearch(e.target.value)}
                    placeholder={
                      isEn
                        ? 'Search portal users to add...'
                        : 'جستجوی کاربران پنل برای افزودن...'
                    }
                    className={`w-full ps-9 pe-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'
                        : 'bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-500'
                    }`}
                  />
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className={isLightMode ? 'text-slate-600' : 'text-slate-400'}>
                    {isEn ? 'Invite Guidance' : 'راهنمای افزودن عضو'}
                  </span>
                  <FieldInfoTooltip
                    title={isEn ? 'Add Channel Users' : 'افزودن کاربر به کانال'}
                    infoWhatEn="Select one or more active portal users not already in this channel to grant them immediate membership."
                    infoWhatFa="یک یا چند کاربر فعال پنل را که هنوز عضو این کانال نیستند انتخاب کنید تا فوراً به کانال افزوده شوند."
                    infoWhyEn="Newly added users receive live WebSocket synchronization so the channel appears in their sidebar and chat dock instantly, while still adhering to RBAC redaction for scoped assets."
                    infoWhyFa="کاربران جدید به‌صورت لحظه‌ای از طریق WebSocket کانال را دریافت می‌کنند و همزمان فیلتر RBAC برای کارت‌های تجهیزات همچنان برقرار می‌ماند."
                    infoExampleEn="Select two NOC engineers and click 'Add Selected Users'."
                    infoExampleFa="دو کارشناس NOC را تیک بزنید و دکمه «افزودن کاربران انتخاب‌شده» را بزنید."
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>
              </div>

              {loadingRecipients ? (
                <div className="py-10 flex items-center justify-center gap-2 text-xs text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  <span>{isEn ? 'Loading portal users...' : 'در حال بارگذاری کاربران پنل...'}</span>
                </div>
              ) : availableRecipients.length === 0 ? (
                <div
                  className={`py-10 text-center rounded-xl border text-xs ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-500'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400'
                  }`}
                >
                  {isEn
                    ? 'All eligible users are already members of this channel.'
                    : 'تمامی کاربران مجاز هم‌اکنون عضو این کانال هستند.'}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {availableRecipients.map((u) => {
                    const idVal = u.username || u.id;
                    const checked = selectedAddIds.includes(idVal);
                    const presence = resolvePresenceFromState(
                      presenceState,
                      [u.username, u.id],
                      u.presenceStatus,
                      u.isOnline
                    );
                    const presenceMeta = getCommsUserPresenceMeta(presence, isEn);

                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() =>
                          setSelectedAddIds((prev) =>
                            prev.includes(idVal)
                              ? prev.filter((item) => item !== idVal)
                              : [...prev, idVal]
                          )
                        }
                        className={`w-full flex items-center justify-between gap-3 p-2.5 rounded-xl border text-start cursor-pointer transition ${
                          checked
                            ? isLightMode
                              ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                              : 'bg-indigo-500/15 border-indigo-500/40 text-white'
                            : isLightMode
                            ? 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
                            : 'bg-slate-950/60 border-slate-800 hover:bg-slate-800/70 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                              checked
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : isLightMode
                                ? 'bg-white border-slate-300'
                                : 'bg-slate-900 border-slate-600'
                            }`}
                          >
                            {checked && <Check className="w-3 h-3" />}
                          </div>
                          <div className="relative shrink-0">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold border ${
                                isLightMode
                                  ? 'bg-slate-100 border-slate-200 text-slate-700'
                                  : 'bg-slate-800 border-slate-700 text-slate-200'
                              }`}
                            >
                              {(u.labelEn || u.label || u.username || '?')
                                .slice(0, 2)
                                .toUpperCase()}
                            </div>
                            <span
                              className={`absolute -bottom-0.5 -end-0.5 w-2.5 h-2.5 rounded-full ring-2 ${
                                isLightMode ? 'ring-white' : 'ring-slate-950'
                              } ${presenceMeta.dotClass}`}
                              title={presenceMeta.label}
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold truncate">
                              {isEn ? u.labelEn || u.label : u.label}
                            </p>
                            <p
                              className={`text-[11px] truncate ${
                                isLightMode ? 'text-slate-500' : 'text-slate-400'
                              }`}
                            >
                              @{u.username}
                              {u.roleOrType ? ` • ${u.roleOrType}` : ''}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-medium shrink-0 inline-flex items-center gap-1 ${presenceMeta.textClass}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${presenceMeta.dotClass}`} />
                          {presenceMeta.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`px-4 py-3 border-t flex items-center justify-between gap-2 shrink-0 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/80 border-slate-800'
          }`}
        >
          <span
            className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}
          >
            {activeTab === 'add'
              ? isEn
                ? `${selectedAddIds.length} user(s) selected`
                : `${selectedAddIds.length} کاربر انتخاب شده`
              : isEn
              ? `Showing ${sortedFilteredMembers.length} of ${channel.members?.length || 0} member(s)`
              : `نمایش ${sortedFilteredMembers.length} از ${channel.members?.length || 0} عضو`}
          </span>

          <div className="flex items-center gap-2">
            {activeTab === 'add' && actorIsModerator && (
              <button
                type="button"
                disabled={selectedAddIds.length === 0 || addingBusy}
                onClick={handleAddSelectedMembers}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer transition disabled:opacity-50"
              >
                {addingBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <UserPlus className="w-3.5 h-3.5" />
                )}
                <span>
                  {isEn
                    ? `Add Selected (${selectedAddIds.length})`
                    : `افزودن انتخاب‌شده‌ها (${selectedAddIds.length})`}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className={`px-3.5 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer transition ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                  : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
              }`}
            >
              {isEn ? 'Close' : 'بستن'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
