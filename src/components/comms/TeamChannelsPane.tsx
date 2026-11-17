import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Hash,
  User,
  Users,
  MessageSquare,
  Plus,
  Send,
  Bell,
  BellOff,
  Search,
  RefreshCw,
  Reply,
  X,
  UserPlus,
  AlertTriangle,
  AlertCircle,
  CornerDownRight,
  Settings,
  MoreVertical,
  Eraser,
  LogOut,
  Trash2,
  AtSign,
  Terminal as TerminalIcon,
} from 'lucide-react';
import {
  CommsChannel,
  CommsMessage,
  CommsRecipientOption,
  CommsSeverity,
} from '../../types';
import { useLanguage } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { useModalDock } from '../../context/ModalDockContext';
import { ModalHeaderControls } from '../common/ModalHeaderControls';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import {
  addCommsChannelMembers,
  clearCommsChannelHistory,
  createGroupCommsChannel,
  deleteCommsChannel,
  executeChannelSlashCommand,
  fetchChannelMessages,
  fetchCommsChannels,
  fetchCommsRecipients,
  leaveCommsChannel,
  openDirectCommsChannel,
  postChannelMessage,
  toggleCommsChannelMute,
} from '../../services/commsApi';
import { appDataCache } from '../../services/dataCache';
import { EntityMentionCardList } from './EntityMentionCardList';
import {
  EntityMentionChips,
  EntityMentionPickerPopover,
  SelectedEntityMentionItem,
} from './EntityMentionPicker';
import { SlashCommandCard } from './SlashCommandCard';
import { SlashCommandPickerPopover } from './SlashCommandPicker';
import { SnippetDiffCard } from './SnippetDiffCard';

interface TeamChannelsPaneProps {
  isLightMode: boolean;
  canSend: boolean;
  isSuperAdmin: boolean;
  liveRevision: number;
  selectedChannelId: string | null;
  onSelectChannelId: (id: string | null) => void;
  onChannelsLoaded?: (channels: CommsChannel[]) => void;
  onOpenNotificationSettings?: () => void;
}

const DIRECT_MODAL_ID = 'comms-direct-chat-modal';
const GROUP_MODAL_ID = 'comms-group-channel-modal';
const MEMBERS_MODAL_ID = 'comms-channel-members-modal';
const ACTION_CONFIRM_MODAL_ID = 'comms-chat-action-confirm-modal';

function dedupeParenthesizedTitle(value?: string | null): string {
  const clean = (value || '').trim();
  if (!clean) return '';
  return clean.replace(/(\s*\([^)]+\))(\1)+$/gi, '$1').trim();
}

function formatSenderLabel(fullName?: string | null, username?: string | null): string {
  const cleanUser = (username || '').trim();
  let cleanFull = dedupeParenthesizedTitle(fullName);
  if (cleanFull && cleanUser) {
    const esc = cleanUser.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleanFull = cleanFull.replace(new RegExp(`(?:\\s*\\(${esc}\\))+$`, 'i'), '').trim();
  }
  if (!cleanUser) return cleanFull;
  if (!cleanFull || cleanFull.toLowerCase() === cleanUser.toLowerCase()) return cleanUser;
  return `${cleanFull} (${cleanUser})`;
}

export const TeamChannelsPane: React.FC<TeamChannelsPaneProps> = ({
  isLightMode,
  canSend,
  isSuperAdmin,
  liveRevision,
  selectedChannelId,
  onSelectChannelId,
  onChannelsLoaded,
  onOpenNotificationSettings,
}) => {
  const { isEn, isRtl } = useLanguage();
  const { user } = useAuth();
  const { dockModal, undockModal } = useModalDock();

  const optimisticChannels = appDataCache.getOptimistic<CommsChannel[]>('comms:channels');
  const [channels, setChannels] = useState<CommsChannel[]>(optimisticChannels || []);
  const [channelsLoading, setChannelsLoading] = useState<boolean>(!optimisticChannels);
  const [channelSearch, setChannelSearch] = useState('');

  const [messages, setMessages] = useState<CommsMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Composer state
  const [draftBody, setDraftBody] = useState('');
  const [draftPriority, setDraftPriority] = useState<CommsSeverity>('info');
  const [replyTarget, setReplyTarget] = useState<CommsMessage | null>(null);
  const [selectedEntityMentions, setSelectedEntityMentions] = useState<SelectedEntityMentionItem[]>([]);
  const [mentionPickerOpen, setMentionPickerOpen] = useState(false);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [sending, setSending] = useState(false);

  // Members popover strip toggle
  const [showMembersStrip, setShowMembersStrip] = useState(false);

  // Directory options
  const [directoryOptions, setDirectoryOptions] = useState<CommsRecipientOption[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);

  // Direct Chat Modal
  const [directModalOpen, setDirectModalOpen] = useState(false);
  const [directMaximized, setDirectMaximized] = useState(false);
  const [directSearch, setDirectSearch] = useState('');
  const [selectedDirectUser, setSelectedDirectUser] = useState('');
  const [directBusy, setDirectBusy] = useState(false);

  // Group Channel Modal
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupMaximized, setGroupMaximized] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [groupLinkedId, setGroupLinkedId] = useState('');
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [groupBusy, setGroupBusy] = useState(false);

  // Add Members Modal
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [addMembersMaximized, setAddMembersMaximized] = useState(false);
  const [membersTargetChannelId, setMembersTargetChannelId] = useState<string | null>(null);
  const [extraMemberIds, setExtraMemberIds] = useState<string[]>([]);
  const [addMembersBusy, setAddMembersBusy] = useState(false);

  // Per-Chat Actions Menu & Rule-7 Confirmation Modal
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const [actionConfirm, setActionConfirm] = useState<{
    kind: 'clear' | 'leave' | 'delete';
    channel: CommsChannel;
  } | null>(null);
  const [actionConfirmMaximized, setActionConfirmMaximized] = useState(false);
  const [actionConfirmBusy, setActionConfirmBusy] = useState(false);

  const threadEndRef = useRef<HTMLDivElement>(null);
  const selectedChannelIdRef = useRef<string | null>(selectedChannelId);
  const channelsRef = useRef<CommsChannel[]>(channels);
  const onChannelsLoadedRef = useRef(onChannelsLoaded);
  const onSelectChannelIdRef = useRef(onSelectChannelId);
  selectedChannelIdRef.current = selectedChannelId;
  channelsRef.current = channels;
  onChannelsLoadedRef.current = onChannelsLoaded;
  onSelectChannelIdRef.current = onSelectChannelId;

  useEffect(() => {
    onChannelsLoadedRef.current?.(channels);
  }, [channels]);

  const ensureDirectory = useCallback(async () => {
    if (directoryOptions.length > 0) return;
    setDirectoryLoading(true);
    try {
      const opts = await fetchCommsRecipients();
      setDirectoryOptions(opts);
    } catch {}
    setDirectoryLoading(false);
  }, [directoryOptions.length]);

  const loadChannels = useCallback(
    async (forceRefresh = false) => {
      if (channelsRef.current.length === 0) setChannelsLoading(true);
      try {
        const list = await fetchCommsChannels(forceRefresh);
        setChannels(list);
        if (!selectedChannelIdRef.current && list.length > 0) {
          onSelectChannelIdRef.current(list[0].id);
        }
      } catch (err: any) {
        setErrorMsg(
          err?.message || (isEn ? 'Failed to load team channels' : 'خطا در دریافت کانال‌های تیمی')
        );
      } finally {
        setChannelsLoading(false);
      }
    },
    [isEn]
  );

  const loadThread = useCallback(
    async (channelId: string, forceRefresh = false) => {
      const cached = appDataCache.getOptimistic<{
        channel: CommsChannel;
        messages: CommsMessage[];
        total: number;
      }>(`comms:channel:${channelId}:100:0`);

      if (cached && Array.isArray(cached.messages)) {
        setMessages(cached.messages);
        setMessagesLoading(false);
      } else {
        setMessages([]);
        setMessagesLoading(true);
      }
      setErrorMsg(null);

      try {
        const res = await fetchChannelMessages(channelId, { limit: 100, forceRefresh });
        if (selectedChannelIdRef.current === channelId) {
          setMessages(res.messages || []);
        }
        setChannels((prev) =>
          prev.map((c) => (c.id === channelId ? { ...c, unreadCount: 0 } : c))
        );
      } catch (err: any) {
        if (selectedChannelIdRef.current === channelId) {
          setErrorMsg(
            err?.message || (isEn ? 'Failed to load thread messages' : 'خطا در دریافت پیام‌های گفتگو')
          );
        }
      } finally {
        if (selectedChannelIdRef.current === channelId) {
          setMessagesLoading(false);
        }
      }
    },
    [isEn]
  );

  useEffect(() => {
    loadChannels(false);
  }, [loadChannels]);

  useEffect(() => {
    if (selectedChannelId) {
      loadThread(selectedChannelId, false);
      setReplyTarget(null);
      setSelectedEntityMentions([]);
      setMentionPickerOpen(false);
      setSlashMenuOpen(false);
    } else {
      setMessages([]);
    }
  }, [selectedChannelId, loadThread]);

  // Direct zero-latency WS listener for incoming messages & channel updates (avoids HTTP refetch bursts)
  useEffect(() => {
    const handler = (e: Event) => {
      const evt = (e as CustomEvent<any>).detail;
      if (!evt) return;

      if (evt.type === 'channel:message' && evt.channelId && evt.message) {
        const incoming: CommsMessage = evt.message;
        const preview =
          incoming.body.length > 90 ? `${incoming.body.slice(0, 87)}...` : incoming.body;
        const isCurrent = evt.channelId === selectedChannelIdRef.current;
        const fromSelf =
          Boolean(user?.username) &&
          (incoming.senderUsername || '').toLowerCase() === (user?.username || '').toLowerCase();

        if (isCurrent) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev;
            const optIdx = prev.findIndex(
              (m) =>
                m.id.startsWith('__opt__') &&
                m.body === incoming.body &&
                (m.senderUsername || '').toLowerCase() === (incoming.senderUsername || '').toLowerCase()
            );
            const next =
              optIdx !== -1
                ? prev.map((m, idx) => (idx === optIdx ? incoming : m))
                : [...prev, incoming];
            const cached = appDataCache.getOptimistic<any>(`comms:channel:${evt.channelId}:100:0`);
            if (cached) {
              appDataCache.set(`comms:channel:${evt.channelId}:100:0`, {
                ...cached,
                messages: next,
              });
            }
            return next;
          });
        }

        setChannels((prev) => {
          const exists = prev.some((c) => c.id === evt.channelId);
          if (!exists) {
            void loadChannels(true);
            return prev;
          }
          const updated = prev.map((c) =>
            c.id === evt.channelId
              ? {
                  ...c,
                  lastMessagePreview: preview,
                  lastMessageAt: incoming.createdAt,
                  updatedAt: incoming.createdAt,
                  unreadCount: isCurrent || fromSelf ? 0 : (c.unreadCount || 0) + 1,
                }
              : c
          );
          updated.sort((a, b) => {
            const tA = new Date(a.lastMessageAt || a.updatedAt || a.createdAt).getTime();
            const tB = new Date(b.lastMessageAt || b.updatedAt || b.createdAt).getTime();
            return tB - tA;
          });
          return updated;
        });
      } else if (evt.type === 'channel:created' && evt.channel) {
        setChannels((prev) => {
          if (prev.some((c) => c.id === evt.channel.id)) return prev;
          return [evt.channel, ...prev];
        });
      } else if (evt.type === 'channel:updated' && evt.channel) {
        setChannels((prev) =>
          prev.map((c) => (c.id === evt.channel.id ? evt.channel : c))
        );
        if (
          evt.channel.id === selectedChannelIdRef.current &&
          evt.channel.lastMessagePreview === null &&
          evt.channel.lastMessageAt === null
        ) {
          setMessages([]);
          appDataCache.invalidate(`comms:channel:${evt.channel.id}`);
        }
      } else if (evt.type === 'channel:removed' && evt.channelId) {
        setChannels((prev) => {
          const next = prev.filter((c) => c.id !== evt.channelId);
          if (selectedChannelIdRef.current === evt.channelId) {
            setMessages([]);
            onSelectChannelIdRef.current(next[0]?.id || null);
          }
          return next;
        });
      }
    };
    window.addEventListener('nettop-comms-ws-event', handler as EventListener);
    return () => window.removeEventListener('nettop-comms-ws-event', handler as EventListener);
  }, [loadChannels, user?.username]);

  useEffect(() => {
    if (!openMenuKey) return;
    const handleOutside = () => setOpenMenuKey(null);
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenuKey(null);
    };
    window.addEventListener('click', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('click', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [openMenuKey]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, selectedChannelId]);

  const activeChannel = useMemo(
    () => channels.find((c) => c.id === selectedChannelId) || null,
    [channels, selectedChannelId]
  );

  const filteredChannels = useMemo(() => {
    const q = channelSearch.trim().toLowerCase();
    if (!q) return channels;
    return channels.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.nameEn || '').toLowerCase().includes(q) ||
        (c.lastMessagePreview || '').toLowerCase().includes(q)
    );
  }, [channels, channelSearch]);

  const directChannels = useMemo(
    () => filteredChannels.filter((c) => c.channelType === 'direct'),
    [filteredChannels]
  );
  const groupChannels = useMemo(
    () => filteredChannels.filter((c) => c.channelType !== 'direct'),
    [filteredChannels]
  );

  const userOptions = useMemo(
    () =>
      directoryOptions.filter(
        (o) =>
          o.type === 'user' &&
          (o.username || '').toLowerCase() !== (user?.username || '').toLowerCase()
      ),
    [directoryOptions, user?.username]
  );

  const dirGroupOptions = useMemo(
    () => directoryOptions.filter((o) => o.type === 'group'),
    [directoryOptions]
  );

  const formatShortTime = (iso?: string | null) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString(isEn ? 'en-US' : 'fa-IR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const handleSendThreadMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const rawText = draftBody.trim();
    const refsSnapshot = selectedEntityMentions;
    if (!activeChannel || (!rawText && refsSnapshot.length === 0) || sending) return;

    const targetChannelId = activeChannel.id;
    const priorityToSend = draftPriority;
    const replySnapshot = replyTarget;

    // Route ChatOps slash commands (/ping, /mac, /port, /status, /dns) directly to server
    if (rawText.startsWith('/')) {
      setSlashMenuOpen(false);
      setMentionPickerOpen(false);
      setErrorMsg(null);
      setSending(true);
      try {
        const res = await executeChannelSlashCommand(targetChannelId, {
          commandText: rawText,
          priority: priorityToSend,
          replyToMessageId: replySnapshot?.id || null,
        });
        setDraftBody('');
        setDraftPriority('info');
        setReplyTarget(null);
        setSelectedEntityMentions([]);
        setMessages((prev) => {
          const next = prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message];
          const cached = appDataCache.getOptimistic<any>(`comms:channel:${targetChannelId}:100:0`);
          appDataCache.set(`comms:channel:${targetChannelId}:100:0`, {
            success: true,
            channel: cached?.channel || activeChannel,
            messages: next,
            total: next.length,
          });
          return next;
        });
        window.dispatchEvent(
          new CustomEvent('nettop-comms-ws-event', {
            detail: {
              type: 'channel:message',
              channelId: targetChannelId,
              message: res.message,
            },
          })
        );
      } catch (err: any) {
        const localized = !isEn && err?.errorFa ? err.errorFa : err?.message;
        setErrorMsg(
          localized || (isEn ? 'Failed to run slash command' : 'خطا در اجرای دستور شبکه')
        );
      } finally {
        setSending(false);
      }
      return;
    }

    const textToSend = rawText || '📌 ارجاع به تجهیز / سرور / پورت شبکه';
    const textToSendEn = rawText || '📌 Referenced Network Entity';
    const entityRefsToSend = refsSnapshot.map((item) => item.ref);
    const nowIso = new Date().toISOString();
    const tempId = `__opt__${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const optimisticMsg: CommsMessage = {
      id: tempId,
      channelId: targetChannelId,
      senderUserId: user?.id || '',
      senderUsername: user?.username || '',
      senderFullName: user?.fullName || user?.username || '',
      senderRole: user?.role || 'Operator',
      messageType: activeChannel.channelType === 'direct' ? 'direct_message' : 'channel_message',
      priority: priorityToSend,
      title: '',
      body: textToSend,
      bodyEn: textToSendEn,
      replyToMessageId: replySnapshot?.id || null,
      replyToPreview: replySnapshot
        ? {
            id: replySnapshot.id,
            senderName: replySnapshot.senderFullName || replySnapshot.senderUsername,
            body:
              replySnapshot.body.length > 100
                ? `${replySnapshot.body.slice(0, 97)}...`
                : replySnapshot.body,
          }
        : null,
      createdAt: nowIso,
    };

    const previewSource = rawText || (isEn ? textToSendEn : textToSend);
    const preview = previewSource.length > 90 ? `${previewSource.slice(0, 87)}...` : previewSource;

    // Immediate 0ms UI feedback
    setMessages((prev) => [...prev, optimisticMsg]);
    setDraftBody('');
    setDraftPriority('info');
    setReplyTarget(null);
    setSelectedEntityMentions([]);
    setMentionPickerOpen(false);
    setErrorMsg(null);
    setChannels((prev) => {
      const updated = prev.map((c) =>
        c.id === targetChannelId
          ? {
              ...c,
              lastMessagePreview: preview,
              lastMessageAt: nowIso,
              updatedAt: nowIso,
              unreadCount: 0,
            }
          : c
      );
      updated.sort((a, b) => {
        const tA = new Date(a.lastMessageAt || a.updatedAt || a.createdAt).getTime();
        const tB = new Date(b.lastMessageAt || b.updatedAt || b.createdAt).getTime();
        return tB - tA;
      });
      onChannelsLoaded?.(updated);
      return updated;
    });

    setSending(true);
    try {
      const res = await postChannelMessage(targetChannelId, {
        body: rawText,
        priority: priorityToSend,
        replyToMessageId: replySnapshot?.id || null,
        entityRefs: entityRefsToSend.length > 0 ? entityRefsToSend : undefined,
      });
      setMessages((prev) => {
        const alreadyHasReal = prev.some((m) => m.id === res.message.id);
        const next = alreadyHasReal
          ? prev.filter((m) => m.id !== tempId)
          : prev.map((m) => (m.id === tempId ? res.message : m));
        const cached = appDataCache.getOptimistic<any>(`comms:channel:${targetChannelId}:100:0`);
        appDataCache.set(`comms:channel:${targetChannelId}:100:0`, {
          success: true,
          channel: cached?.channel || activeChannel,
          messages: next,
          total: next.length,
        });
        return next;
      });
      window.dispatchEvent(
        new CustomEvent('nettop-comms-ws-event', {
          detail: {
            type: 'channel:message',
            channelId: targetChannelId,
            message: res.message,
          },
        })
      );
    } catch (err: any) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      if (rawText) setDraftBody((curr) => curr || rawText);
      if (refsSnapshot.length > 0) {
        setSelectedEntityMentions((curr) => (curr.length > 0 ? curr : refsSnapshot));
      }
      setErrorMsg(
        err?.message || (isEn ? 'Failed to send message' : 'خطا در ارسال پیام')
      );
    } finally {
      setSending(false);
    }
  };

  const handleToggleMuteForChannel = async (ch: CommsChannel) => {
    const nextMuted = !ch.isMuted;
    setOpenMenuKey(null);
    try {
      await toggleCommsChannelMute(ch.id, nextMuted);
      setChannels((prev) =>
        prev.map((c) => (c.id === ch.id ? { ...c, isMuted: nextMuted } : c))
      );
    } catch (err: any) {
      setErrorMsg(err?.message || (isEn ? 'Mute update failed' : 'خطا در تغییر وضعیت سکوت'));
    }
  };

  const handleToggleMute = async () => {
    if (!activeChannel) return;
    await handleToggleMuteForChannel(activeChannel);
  };

  // Direct Chat Modal handlers
  const openDirectModal = () => {
    undockModal(DIRECT_MODAL_ID);
    setSelectedDirectUser('');
    setDirectSearch('');
    setDirectModalOpen(true);
    ensureDirectory();
  };

  const handleStartDirectChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDirectUser) return;
    setDirectBusy(true);
    try {
      const res = await openDirectCommsChannel(selectedDirectUser);
      setDirectModalOpen(false);
      undockModal(DIRECT_MODAL_ID);
      await loadChannels(true);
      onSelectChannelId(res.channel.id);
    } catch (err: any) {
      setErrorMsg(err?.message || (isEn ? 'Could not start direct chat' : 'خطا در ایجاد گفتگو'));
    } finally {
      setDirectBusy(false);
    }
  };

  // Group Channel Modal handlers
  const openGroupModal = (initialMemberUsernames: string[] = [], suggestedName = '') => {
    undockModal(GROUP_MODAL_ID);
    setGroupName(suggestedName);
    setGroupDescription('');
    setGroupLinkedId('');
    setGroupMemberIds(initialMemberUsernames);
    setGroupModalOpen(true);
    ensureDirectory();
  };

  const handleCreateGroupChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    setGroupBusy(true);
    try {
      const res = await createGroupCommsChannel({
        name: groupName.trim(),
        nameEn: groupName.trim(),
        description: groupDescription.trim() || undefined,
        linkedGroupId: groupLinkedId || undefined,
        memberIds: groupMemberIds,
      });
      setGroupModalOpen(false);
      undockModal(GROUP_MODAL_ID);
      await loadChannels(true);
      onSelectChannelId(res.channel.id);
    } catch (err: any) {
      setErrorMsg(
        err?.message || (isEn ? 'Failed to create group channel' : 'خطا در ساخت کانال گروهی')
      );
    } finally {
      setGroupBusy(false);
    }
  };

  const membersTargetChannel = useMemo(
    () => channels.find((c) => c.id === membersTargetChannelId) || activeChannel || null,
    [channels, membersTargetChannelId, activeChannel]
  );

  // Add Members Modal handlers
  const openAddMembersForChannel = (ch: CommsChannel | null) => {
    if (!ch) return;
    setOpenMenuKey(null);
    if (ch.channelType === 'direct') {
      const me = (user?.username || '').toLowerCase();
      const peers = (ch.members || [])
        .map((m) => m.username)
        .filter((u) => u && u.toLowerCase() !== me);
      openGroupModal(peers, '');
      return;
    }
    undockModal(MEMBERS_MODAL_ID);
    setMembersTargetChannelId(ch.id);
    setExtraMemberIds([]);
    setAddMembersOpen(true);
    ensureDirectory();
  };

  const openAddMembersModal = () => {
    openAddMembersForChannel(activeChannel || null);
  };

  const handleAddMembersSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetCh = membersTargetChannel;
    if (!targetCh || extraMemberIds.length === 0) return;
    setAddMembersBusy(true);
    try {
      await addCommsChannelMembers(targetCh.id, extraMemberIds);
      setAddMembersOpen(false);
      setMembersTargetChannelId(null);
      undockModal(MEMBERS_MODAL_ID);
      await loadChannels(true);
    } catch (err: any) {
      setErrorMsg(err?.message || (isEn ? 'Failed to add members' : 'خطا در افزودن اعضا'));
    } finally {
      setAddMembersBusy(false);
    }
  };

  const canManageChannelByRule = useCallback(
    (ch: CommsChannel | null | undefined) => {
      if (!ch || ch.channelType !== 'group') return false;
      if (isSuperAdmin) return true;
      const uname = (user?.username || '').toLowerCase();
      return Boolean(
        ch.members?.some((m) => m.username.toLowerCase() === uname && m.role === 'owner')
      );
    },
    [isSuperAdmin, user?.username]
  );

  const canAddMembersToChannel = useCallback(
    (ch: CommsChannel | null | undefined) => {
      if (!ch) return false;
      if (ch.channelType === 'direct') return canSend;
      return canManageChannelByRule(ch) || canSend;
    },
    [canManageChannelByRule, canSend]
  );

  const canManageChannelMembers = useMemo(
    () => canAddMembersToChannel(activeChannel),
    [activeChannel, canAddMembersToChannel]
  );

  const handleConfirmChatAction = async () => {
    if (!actionConfirm || actionConfirmBusy) return;
    const { kind, channel } = actionConfirm;
    setActionConfirmBusy(true);
    setErrorMsg(null);
    try {
      if (kind === 'clear') {
        await clearCommsChannelHistory(channel.id);
        if (selectedChannelIdRef.current === channel.id) {
          setMessages([]);
        }
        setChannels((prev) => {
          const next = prev.map((c) =>
            c.id === channel.id
              ? { ...c, lastMessagePreview: null, lastMessageAt: null, unreadCount: 0 }
              : c
          );
          onChannelsLoaded?.(next);
          return next;
        });
        const clearedChannel = {
          ...channel,
          lastMessagePreview: null,
          lastMessageAt: null,
          unreadCount: 0,
        };
        window.dispatchEvent(
          new CustomEvent('nettop-comms-ws-event', {
            detail: { type: 'channel:updated', channel: clearedChannel },
          })
        );
      } else if (kind === 'leave') {
        await leaveCommsChannel(channel.id);
        setChannels((prev) => {
          const next = prev.filter((c) => c.id !== channel.id);
          onChannelsLoaded?.(next);
          if (selectedChannelIdRef.current === channel.id) {
            setMessages([]);
            onSelectChannelId(next[0]?.id || null);
          }
          return next;
        });
        window.dispatchEvent(
          new CustomEvent('nettop-comms-ws-event', {
            detail: { type: 'channel:removed', channelId: channel.id },
          })
        );
      } else if (kind === 'delete') {
        await deleteCommsChannel(channel.id);
        setChannels((prev) => {
          const next = prev.filter((c) => c.id !== channel.id);
          onChannelsLoaded?.(next);
          if (selectedChannelIdRef.current === channel.id) {
            setMessages([]);
            onSelectChannelId(next[0]?.id || null);
          }
          return next;
        });
        window.dispatchEvent(
          new CustomEvent('nettop-comms-ws-event', {
            detail: { type: 'channel:removed', channelId: channel.id },
          })
        );
      }
      setActionConfirm(null);
      undockModal(ACTION_CONFIRM_MODAL_ID);
    } catch (err: any) {
      setErrorMsg(
        err?.message || (isEn ? 'Failed to perform chat action' : 'خطا در اجرای عملیات روی گفتگو')
      );
    } finally {
      setActionConfirmBusy(false);
    }
  };

  const existingMemberUsernames = useMemo(
    () =>
      new Set(
        (membersTargetChannel?.members || []).map((m) => m.username.toLowerCase())
      ),
    [membersTargetChannel]
  );

  const isMessageSelf = (msg: CommsMessage) => {
    const me = (user?.username || '').toLowerCase();
    return me !== '' && (msg.senderUsername || '').toLowerCase() === me;
  };

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      {errorMsg && (
        <div
          className={`flex items-center justify-between gap-3 px-4 py-2 rounded-xl border text-xs ${
            isLightMode
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-xs underline cursor-pointer"
          >
            {isEn ? 'Dismiss' : 'بستن'}
          </button>
        </div>
      )}

      {/* 2-Column Single-Elevation Chat Workspace */}
      <div
        className={`flex-1 grid grid-cols-1 lg:grid-cols-12 rounded-2xl border overflow-hidden min-h-[540px] ${
          isLightMode
            ? 'bg-white border-slate-200 shadow-xs'
            : 'bg-slate-900/70 border-white/10'
        }`}
      >
        {/* Left Rail: Direct Chats + Team Group Channels */}
        <aside
          className={`lg:col-span-4 xl:col-span-3 border-b lg:border-b-0 ${
            isRtl ? 'lg:border-l' : 'lg:border-r'
          } ${
            isLightMode ? 'border-slate-200 bg-slate-50/60' : 'border-white/10 bg-slate-950/35'
          } flex flex-col`}
        >
          {/* Rail Header & Creation Actions */}
          <div
            className={`p-3 border-b flex flex-col gap-2.5 ${
              isLightMode ? 'border-slate-200' : 'border-white/10'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={`text-xs font-bold tracking-tight ${
                  isLightMode ? 'text-slate-800' : 'text-slate-100'
                }`}
              >
                {isEn ? 'Conversations' : 'فهرست گفتگوها'}
              </span>
              {onOpenNotificationSettings && (
                <button
                  type="button"
                  onClick={onOpenNotificationSettings}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium transition cursor-pointer ${
                    isLightMode
                      ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                      : 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-300 hover:text-white'
                  }`}
                  title={
                    isEn
                      ? 'Notifications & Quiet Hours Settings'
                      : 'تنظیمات اعلانات و ساعات سکوت'
                  }
                >
                  <Settings className="w-3 h-3 text-indigo-400 shrink-0" />
                  <span>{isEn ? 'Settings' : 'تنظیمات'}</span>
                </button>
              )}
            </div>
            {canSend && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={openDirectModal}
                  className={`flex-1 min-w-[105px] flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-medium whitespace-nowrap cursor-pointer transition ${
                    isLightMode
                      ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-800'
                      : 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-100'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span>{isEn ? 'Direct Chat' : 'گفتگوی مستقیم'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => openGroupModal()}
                  className="flex-1 min-w-[105px] flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold whitespace-nowrap cursor-pointer transition"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span>{isEn ? 'New Channel' : 'کانال گروهی'}</span>
                </button>
              </div>
            )}

            <div className="relative">
              <Search
                className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 ${
                  isRtl ? 'right-2.5' : 'left-2.5'
                } ${isLightMode ? 'text-slate-400' : 'text-slate-500'}`}
              />
              <input
                type="text"
                value={channelSearch}
                onChange={(e) => setChannelSearch(e.target.value)}
                placeholder={isEn ? 'Filter conversations...' : 'جستجو در گفتگوها و کانال‌ها...'}
                className={`w-full py-1.5 rounded-lg border text-xs outline-none ${
                  isRtl ? 'pr-8 pl-2.5' : 'pl-8 pr-2.5'
                } ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'
                    : 'bg-slate-950/70 border-white/10 text-slate-100 placeholder:text-slate-500'
                }`}
              />
            </div>
          </div>

          {/* Rail Channel Lists */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5 space-y-4">
            {channelsLoading ? (
              <div className="space-y-2 p-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-12 rounded-xl animate-pulse ${
                      isLightMode ? 'bg-slate-200/70' : 'bg-white/5'
                    }`}
                  />
                ))}
              </div>
            ) : filteredChannels.length === 0 ? (
              <div className="p-4 text-center">
                <MessageSquare
                  className={`w-8 h-8 mx-auto mb-2 ${
                    isLightMode ? 'text-slate-300' : 'text-slate-600'
                  }`}
                />
                <p className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  {isEn
                    ? 'No conversations yet. Start a direct chat or create a team channel.'
                    : 'هنوز گفتگویی ثبت نشده است. یک گفتگوی مستقیم یا کانال گروهی بسازید.'}
                </p>
              </div>
            ) : (
              <>
                {/* Group Channels Section */}
                {groupChannels.length > 0 && (
                  <div className="space-y-1">
                    <div
                      className={`px-2 text-[11px] font-semibold ${
                        isLightMode ? 'text-slate-500' : 'text-slate-400'
                      }`}
                    >
                      {isEn ? 'Team Channels' : 'کانال‌های گروهی'}
                    </div>
                    {groupChannels.map((ch) => {
                      const active = ch.id === selectedChannelId;
                      const menuKey = `row:${ch.id}`;
                      const menuOpen = openMenuKey === menuKey;
                      const isOwnerOrAdmin = canManageChannelByRule(ch);
                      return (
                        <div
                          key={ch.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => onSelectChannelId(ch.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSelectChannelId(ch.id);
                            }
                          }}
                          className={`group relative w-full flex items-start gap-2.5 px-2.5 py-2 rounded-xl text-start transition cursor-pointer ${
                            active
                              ? isLightMode
                                ? 'bg-indigo-50 border border-indigo-200 text-indigo-900'
                                : 'bg-indigo-500/15 border border-indigo-500/30 text-white'
                              : isLightMode
                              ? 'border border-transparent hover:bg-slate-200/60 text-slate-800'
                              : 'border border-transparent hover:bg-white/5 text-slate-200'
                          }`}
                        >
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border ${
                              isLightMode
                                ? 'bg-white border-slate-200 text-indigo-600'
                                : 'bg-white/5 border-white/10 text-indigo-300'
                            }`}
                          >
                            <Hash className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="text-xs font-semibold truncate">
                                {dedupeParenthesizedTitle(isEn ? ch.nameEn || ch.name : ch.name)}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                {ch.isMuted && <BellOff className="w-3 h-3 text-slate-400" />}
                                {ch.unreadCount > 0 && (
                                  <span
                                    className={`inline-flex items-center justify-center rounded-full bg-indigo-600 text-white font-mono tabular-nums font-bold leading-none shrink-0 ${
                                      ch.unreadCount > 99
                                        ? 'min-w-[18px] h-[16px] px-1 text-[8px]'
                                        : ch.unreadCount >= 10
                                        ? 'w-[17px] h-[17px] text-[8.5px]'
                                        : 'w-4 h-4 text-[9px]'
                                    }`}
                                  >
                                    {ch.unreadCount > 99 ? '99+' : ch.unreadCount}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuKey((prev) => (prev === menuKey ? null : menuKey));
                                  }}
                                  className={`p-0.5 rounded-md transition cursor-pointer ${
                                    menuOpen
                                      ? isLightMode
                                        ? 'bg-indigo-100 text-indigo-700'
                                        : 'bg-white/15 text-white'
                                      : isLightMode
                                      ? 'text-slate-400 hover:bg-slate-200 hover:text-slate-800'
                                      : 'text-slate-400 hover:bg-white/10 hover:text-white'
                                  }`}
                                  title={isEn ? 'Conversation actions' : 'عملیات گفتگو'}
                                >
                                  <MoreVertical className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                            <p
                              className={`text-[11px] truncate mt-0.5 ${
                                isLightMode ? 'text-slate-500' : 'text-slate-400'
                              }`}
                            >
                              {ch.lastMessagePreview ||
                                (isEn
                                  ? `${ch.memberCount} members`
                                  : `${ch.memberCount} عضو`)}
                            </p>
                          </div>

                          {menuOpen && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className={`absolute top-9 ${
                                isRtl ? 'left-2' : 'right-2'
                              } z-40 w-48 rounded-xl border shadow-xl py-1 text-xs ${
                                isLightMode
                                  ? 'bg-white border-slate-200 text-slate-800'
                                  : 'bg-slate-900 border-slate-700 text-slate-100'
                              }`}
                            >
                              {canAddMembersToChannel(ch) && (
                                <button
                                  type="button"
                                  onClick={() => openAddMembersForChannel(ch)}
                                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-start cursor-pointer transition ${
                                    isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/10'
                                  }`}
                                >
                                  <UserPlus className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                  <span>{isEn ? 'Add Member' : 'افزودن عضو جدید'}</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleToggleMuteForChannel(ch)}
                                className={`w-full flex items-center gap-2 px-3 py-1.5 text-start cursor-pointer transition ${
                                  isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/10'
                                }`}
                              >
                                {ch.isMuted ? (
                                  <Bell className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                ) : (
                                  <BellOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                )}
                                <span>
                                  {ch.isMuted
                                    ? isEn
                                      ? 'Unmute Channel'
                                      : 'لغو بی‌صدا'
                                    : isEn
                                    ? 'Mute Notifications'
                                    : 'بی‌صدا کردن'}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuKey(null);
                                  setActionConfirm({ kind: 'clear', channel: ch });
                                }}
                                className={`w-full flex items-center gap-2 px-3 py-1.5 text-start cursor-pointer transition ${
                                  isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/10'
                                }`}
                              >
                                <Eraser className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                <span>{isEn ? 'Clear Chat History' : 'پاک کردن تاریخچه پیام‌ها'}</span>
                              </button>
                              <div className={`my-1 border-t ${isLightMode ? 'border-slate-200' : 'border-white/10'}`} />
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuKey(null);
                                  setActionConfirm({ kind: 'leave', channel: ch });
                                }}
                                className={`w-full flex items-center gap-2 px-3 py-1.5 text-start cursor-pointer transition text-amber-500 ${
                                  isLightMode ? 'hover:bg-amber-50' : 'hover:bg-amber-500/10'
                                }`}
                              >
                                <LogOut className="w-3.5 h-3.5 shrink-0" />
                                <span>{isEn ? 'Leave Channel' : 'خروج از کانال'}</span>
                              </button>
                              {isOwnerOrAdmin && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuKey(null);
                                    setActionConfirm({ kind: 'delete', channel: ch });
                                  }}
                                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-start cursor-pointer transition text-rose-500 ${
                                    isLightMode ? 'hover:bg-rose-50' : 'hover:bg-rose-500/10'
                                  }`}
                                >
                                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                  <span>{isEn ? 'Delete Channel' : 'حذف کامل کانال'}</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Direct Chats Section */}
                {directChannels.length > 0 && (
                  <div className="space-y-1">
                    <div
                      className={`px-2 text-[11px] font-semibold ${
                        isLightMode ? 'text-slate-500' : 'text-slate-400'
                      }`}
                    >
                      {isEn ? 'Direct Messages' : 'گفتگوهای مستقیم'}
                    </div>
                    {directChannels.map((ch) => {
                      const active = ch.id === selectedChannelId;
                      const menuKey = `row:${ch.id}`;
                      const menuOpen = openMenuKey === menuKey;
                      return (
                        <div
                          key={ch.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => onSelectChannelId(ch.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSelectChannelId(ch.id);
                            }
                          }}
                          className={`group relative w-full flex items-start gap-2.5 px-2.5 py-2 rounded-xl text-start transition cursor-pointer ${
                            active
                              ? isLightMode
                                ? 'bg-indigo-50 border border-indigo-200 text-indigo-900'
                                : 'bg-indigo-500/15 border border-indigo-500/30 text-white'
                              : isLightMode
                              ? 'border border-transparent hover:bg-slate-200/60 text-slate-800'
                              : 'border border-transparent hover:bg-white/5 text-slate-200'
                          }`}
                        >
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border ${
                              isLightMode
                                ? 'bg-white border-slate-200 text-sky-600'
                                : 'bg-white/5 border-white/10 text-sky-300'
                            }`}
                          >
                            <User className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="text-xs font-semibold truncate">
                                {dedupeParenthesizedTitle(isEn ? ch.nameEn || ch.name : ch.name)}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                {ch.isMuted && <BellOff className="w-3 h-3 text-slate-400" />}
                                {ch.unreadCount > 0 && (
                                  <span
                                    className={`inline-flex items-center justify-center rounded-full bg-indigo-600 text-white font-mono tabular-nums font-bold leading-none shrink-0 ${
                                      ch.unreadCount > 99
                                        ? 'min-w-[18px] h-[16px] px-1 text-[8px]'
                                        : ch.unreadCount >= 10
                                        ? 'w-[17px] h-[17px] text-[8.5px]'
                                        : 'w-4 h-4 text-[9px]'
                                    }`}
                                  >
                                    {ch.unreadCount > 99 ? '99+' : ch.unreadCount}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuKey((prev) => (prev === menuKey ? null : menuKey));
                                  }}
                                  className={`p-0.5 rounded-md transition cursor-pointer ${
                                    menuOpen
                                      ? isLightMode
                                        ? 'bg-indigo-100 text-indigo-700'
                                        : 'bg-white/15 text-white'
                                      : isLightMode
                                      ? 'text-slate-400 hover:bg-slate-200 hover:text-slate-800'
                                      : 'text-slate-400 hover:bg-white/10 hover:text-white'
                                  }`}
                                  title={isEn ? 'Conversation actions' : 'عملیات گفتگو'}
                                >
                                  <MoreVertical className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                            <p
                              className={`text-[11px] truncate mt-0.5 ${
                                isLightMode ? 'text-slate-500' : 'text-slate-400'
                              }`}
                            >
                              {ch.lastMessagePreview ||
                                (isEn ? 'No messages yet' : 'بدون پیام')}
                            </p>
                          </div>

                          {menuOpen && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className={`absolute top-9 ${
                                isRtl ? 'left-2' : 'right-2'
                              } z-40 w-48 rounded-xl border shadow-xl py-1 text-xs ${
                                isLightMode
                                  ? 'bg-white border-slate-200 text-slate-800'
                                  : 'bg-slate-900 border-slate-700 text-slate-100'
                              }`}
                            >
                              {canSend && (
                                <button
                                  type="button"
                                  onClick={() => openAddMembersForChannel(ch)}
                                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-start cursor-pointer transition ${
                                    isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/10'
                                  }`}
                                >
                                  <UserPlus className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                  <span>{isEn ? 'Add Member (New Group)' : 'افزودن عضو (ساخت گروه)'}</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleToggleMuteForChannel(ch)}
                                className={`w-full flex items-center gap-2 px-3 py-1.5 text-start cursor-pointer transition ${
                                  isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/10'
                                }`}
                              >
                                {ch.isMuted ? (
                                  <Bell className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                ) : (
                                  <BellOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                )}
                                <span>
                                  {ch.isMuted
                                    ? isEn
                                      ? 'Unmute Chat'
                                      : 'لغو بی‌صدا'
                                    : isEn
                                    ? 'Mute Notifications'
                                    : 'بی‌صدا کردن'}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuKey(null);
                                  setActionConfirm({ kind: 'clear', channel: ch });
                                }}
                                className={`w-full flex items-center gap-2 px-3 py-1.5 text-start cursor-pointer transition ${
                                  isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/10'
                                }`}
                              >
                                <Eraser className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                <span>{isEn ? 'Clear Chat History' : 'پاک کردن پیام‌ها'}</span>
                              </button>
                              <div className={`my-1 border-t ${isLightMode ? 'border-slate-200' : 'border-white/10'}`} />
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuKey(null);
                                  setActionConfirm({ kind: 'leave', channel: ch });
                                }}
                                className={`w-full flex items-center gap-2 px-3 py-1.5 text-start cursor-pointer transition text-rose-500 ${
                                  isLightMode ? 'hover:bg-rose-50' : 'hover:bg-rose-500/10'
                                }`}
                              >
                                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                <span>{isEn ? 'Delete Chat (My Side)' : 'حذف گفتگو برای من'}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </aside>

        {/* Right Conversation Thread Pane */}
        <section className="lg:col-span-8 xl:col-span-9 flex flex-col min-h-[460px]">
          {!activeChannel ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <MessageSquare
                className={`w-10 h-10 mb-3 ${
                  isLightMode ? 'text-slate-300' : 'text-slate-600'
                }`}
              />
              <h3
                className={`text-sm font-bold mb-1 ${
                  isLightMode ? 'text-slate-900' : 'text-white'
                }`}
              >
                {isEn ? 'Select a Conversation' : 'یک گفتگو یا کانال را انتخاب کنید'}
              </h3>
              <p
                className={`text-xs max-w-sm ${
                  isLightMode ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                {isEn
                  ? 'Collaborate directly with team operators or switch between incident response group channels.'
                  : 'با کارشناسان IT به‌صورت دوجانبه گفتگو کنید یا پیام‌های کانال‌های گروهی را به‌صورت زنده دنبال نمایید.'}
              </p>
            </div>
          ) : (
            <>
              {/* Thread Header */}
              <div
                className={`px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2.5 ${
                  isLightMode ? 'border-slate-200 bg-slate-50/40' : 'border-white/10 bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 ${
                      isLightMode
                        ? 'bg-white border-slate-200 text-indigo-600'
                        : 'bg-white/5 border-white/10 text-indigo-300'
                    }`}
                  >
                    {activeChannel.channelType === 'direct' ? (
                      <User className="w-4 h-4" />
                    ) : (
                      <Hash className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3
                      className={`text-sm font-bold truncate ${
                        isLightMode ? 'text-slate-900' : 'text-white'
                      }`}
                    >
                      {dedupeParenthesizedTitle(
                        isEn ? activeChannel.nameEn || activeChannel.name : activeChannel.name
                      )}
                    </h3>
                    <div
                      className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] ${
                        isLightMode ? 'text-slate-500' : 'text-slate-400'
                      }`}
                    >
                      <span>
                        {activeChannel.channelType === 'direct'
                          ? isEn
                            ? 'Direct 1:1 Thread'
                            : 'گفتگوی مستقیم دوطرفه'
                          : isEn
                          ? 'Team Group Channel'
                          : 'کانال گروهی تیم'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {isEn
                          ? `${activeChannel.memberCount} members`
                          : `${activeChannel.memberCount} عضو`}
                      </span>
                      {activeChannel.description && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="truncate max-w-xs">{activeChannel.description}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowMembersStrip((v) => !v)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap cursor-pointer transition ${
                      showMembersStrip
                        ? isLightMode
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                          : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-200'
                        : isLightMode
                        ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                        : 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-200'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Members' : 'اعضا'}</span>
                  </button>

                  {canManageChannelMembers && canSend && (
                    <button
                      type="button"
                      onClick={openAddMembersModal}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap cursor-pointer transition ${
                        isLightMode
                          ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                          : 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-200'
                      }`}
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Add Member' : 'افزودن عضو'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleToggleMute}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap cursor-pointer transition ${
                      isLightMode
                        ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                        : 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-200'
                    }`}
                    title={
                      activeChannel.isMuted
                        ? isEn
                          ? 'Unmute notifications'
                          : 'لغو بی‌صدا کردن'
                        : isEn
                        ? 'Mute notifications'
                        : 'بی‌صدا کردن اعلان کانال'
                    }
                  >
                    {activeChannel.isMuted ? (
                      <BellOff className="w-3.5 h-3.5 text-amber-500" />
                    ) : (
                      <Bell className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {activeChannel.isMuted
                        ? isEn
                          ? 'Muted'
                          : 'بی‌صدا'
                        : isEn
                        ? 'Mute'
                        : 'سکوت'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => loadThread(activeChannel.id, true)}
                    className={`p-1.5 rounded-lg border cursor-pointer transition ${
                      isLightMode
                        ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                        : 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-200'
                    }`}
                    title={isEn ? 'Refresh thread' : 'تازه‌سازی گفتگو'}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>

                  {/* Thread Header Actions Dropdown */}
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenMenuKey((prev) => (prev === 'header' ? null : 'header'))
                      }
                      className={`p-1.5 rounded-lg border cursor-pointer transition ${
                        openMenuKey === 'header'
                          ? isLightMode
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                            : 'bg-indigo-500/20 border-indigo-500/40 text-indigo-200'
                          : isLightMode
                          ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                          : 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-200'
                      }`}
                      title={isEn ? 'Conversation actions' : 'عملیات گفتگو'}
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>

                    {openMenuKey === 'header' && (
                      <div
                        className={`absolute top-9 ${
                          isRtl ? 'left-0' : 'right-0'
                        } z-40 w-52 rounded-xl border shadow-2xl py-1 text-xs ${
                          isLightMode
                            ? 'bg-white border-slate-200 text-slate-800'
                            : 'bg-slate-900 border-slate-700 text-slate-100'
                        }`}
                      >
                        {canAddMembersToChannel(activeChannel) && (
                          <button
                            type="button"
                            onClick={() => openAddMembersForChannel(activeChannel)}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-start cursor-pointer transition ${
                              isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/10'
                            }`}
                          >
                            <UserPlus className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            <span>
                              {activeChannel.channelType === 'direct'
                                ? isEn
                                  ? 'Add Member (New Group)'
                                  : 'افزودن عضو (ساخت گروه)'
                                : isEn
                                ? 'Add Channel Members'
                                : 'افزودن عضو جدید'}
                            </span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleToggleMute}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-start cursor-pointer transition ${
                            isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/10'
                          }`}
                        >
                          {activeChannel.isMuted ? (
                            <Bell className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          ) : (
                            <BellOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          )}
                          <span>
                            {activeChannel.isMuted
                              ? isEn
                                ? 'Unmute Notifications'
                                : 'لغو بی‌صدا کردن'
                              : isEn
                              ? 'Mute Notifications'
                              : 'بی‌صدا کردن اعلان‌ها'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuKey(null);
                            setActionConfirm({ kind: 'clear', channel: activeChannel });
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-start cursor-pointer transition ${
                            isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/10'
                          }`}
                        >
                          <Eraser className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                          <span>
                            {isEn ? 'Clear Chat History (My Side)' : 'پاک کردن تاریخچه پیام‌ها'}
                          </span>
                        </button>
                        <div className={`my-1 border-t ${isLightMode ? 'border-slate-200' : 'border-white/10'}`} />
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuKey(null);
                            setActionConfirm({ kind: 'leave', channel: activeChannel });
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-start cursor-pointer transition text-amber-500 ${
                            isLightMode ? 'hover:bg-amber-50' : 'hover:bg-amber-500/10'
                          }`}
                        >
                          <LogOut className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {activeChannel.channelType === 'direct'
                              ? isEn
                                ? 'Delete Chat (My Side)'
                                : 'حذف چت برای من'
                              : isEn
                              ? 'Leave Group Channel'
                              : 'خروج از کانال گروهی'}
                          </span>
                        </button>
                        {canManageChannelByRule(activeChannel) && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuKey(null);
                              setActionConfirm({ kind: 'delete', channel: activeChannel });
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-start cursor-pointer transition text-rose-500 ${
                              isLightMode ? 'hover:bg-rose-50' : 'hover:bg-rose-500/10'
                            }`}
                          >
                            <Trash2 className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              {isEn ? 'Delete Channel Permanently' : 'حذف کامل کانال برای همه'}
                            </span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Optional Collapsible Members Bar */}
              {showMembersStrip && (
                <div
                  className={`px-4 py-2.5 border-b flex flex-wrap items-center gap-2 text-xs ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-700'
                      : 'bg-slate-950/40 border-white/10 text-slate-300'
                  }`}
                >
                  <span className="font-semibold">
                    {isEn ? 'Channel Participants:' : 'اعضای کانال:'}
                  </span>
                  {(activeChannel.members || []).map((m, idx) => (
                    <span key={m.userId || m.username} className="inline-flex items-center gap-1">
                      {idx > 0 && <span aria-hidden="true">·</span>}
                      <span>{m.fullName || m.username}</span>
                      {m.role === 'owner' && (
                        <span
                          className={isLightMode ? 'text-indigo-700 font-semibold' : 'text-indigo-300 font-semibold'}
                        >
                          ({isEn ? 'Owner' : 'مدیر'})
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              )}

              {/* Message Stream */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 max-h-[440px]">
                {messagesLoading && messages.length === 0 ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, idx) => (
                      <div
                        key={idx}
                        className={`h-14 w-2/3 rounded-xl animate-pulse ${
                          isLightMode ? 'bg-slate-100' : 'bg-white/5'
                        }`}
                      />
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center py-12 text-center">
                    <p
                      className={`text-xs ${
                        isLightMode ? 'text-slate-500' : 'text-slate-400'
                      }`}
                    >
                      {isEn
                        ? 'No messages in this conversation yet. Send the first message below.'
                        : 'هنوز پیامی در این گفتگو ارسال نشده است. اولین پیام را ارسال کنید.'}
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const self = isMessageSelf(msg);
                    const senderLabel = formatSenderLabel(msg.senderFullName, msg.senderUsername);

                    return (
                      <div
                        key={msg.id}
                        className={`group flex flex-col ${self ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-[82%] sm:max-w-[70%] rounded-2xl border px-3.5 py-2.5 text-xs ${
                            self
                              ? isLightMode
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'bg-indigo-600/90 border-indigo-500 text-white'
                              : isLightMode
                              ? 'bg-slate-50 border-slate-200 text-slate-900'
                              : 'bg-slate-800/75 border-white/10 text-slate-100'
                          }`}
                        >
                          {/* Sender & Timestamp line */}
                          <div
                            className={`flex items-center justify-between gap-3 mb-1 text-[11px] ${
                              self
                                ? 'text-indigo-100'
                                : isLightMode
                                ? 'text-slate-500'
                                : 'text-slate-400'
                            }`}
                          >
                            <span className="font-semibold truncate">
                              {self ? (isEn ? 'You' : 'شما') : senderLabel}
                              {msg.priority !== 'info' && (
                                <span className="inline-flex items-center gap-1 mx-1.5">
                                  {msg.priority === 'critical' ? (
                                    <AlertCircle className="w-3 h-3 inline text-rose-400" />
                                  ) : (
                                    <AlertTriangle className="w-3 h-3 inline text-amber-400" />
                                  )}
                                  <span>
                                    {msg.priority === 'critical'
                                      ? isEn
                                        ? 'Critical'
                                        : 'بحرانی'
                                      : isEn
                                      ? 'Warning'
                                      : 'هشدار'}
                                  </span>
                                </span>
                              )}
                            </span>
                            <span className="font-mono tabular-nums shrink-0">
                              {formatShortTime(msg.createdAt)}
                            </span>
                          </div>

                          {/* Optional Reply Quote */}
                          {msg.replyToPreview && (
                            <div
                              className={`mb-2 px-2.5 py-1.5 rounded-lg border text-[11px] ${
                                self
                                  ? 'bg-indigo-700/60 border-indigo-400/40 text-indigo-100'
                                  : isLightMode
                                  ? 'bg-white border-slate-200 text-slate-600'
                                  : 'bg-slate-950/60 border-white/10 text-slate-300'
                              }`}
                            >
                              <div className="font-semibold flex items-center gap-1">
                                <CornerDownRight className="w-3 h-3" />
                                <span>{msg.replyToPreview.senderName}</span>
                              </div>
                              <p className="truncate opacity-90">{msg.replyToPreview.body}</p>
                            </div>
                          )}

                          {/* Body */}
                          <div className="whitespace-pre-wrap leading-relaxed break-words text-xs sm:text-[13px]">
                            {isEn ? msg.bodyEn || msg.body : msg.body}
                          </div>

                          {/* RBAC-projected live entity cards (Device / Port / Server) */}
                          <EntityMentionCardList
                            cards={msg.entityCards}
                            isEn={isEn}
                            isLightMode={isLightMode}
                            isSelf={self}
                          />

                          {/* RBAC-projected ChatOps slash command telemetry card */}
                          <SlashCommandCard
                            result={msg.slashResult}
                            isEn={isEn}
                            isLightMode={isLightMode}
                            isSelf={self}
                          />

                          {/* RBAC-projected & secret-scrubbed Snippet / Config Diff card */}
                          <SnippetDiffCard
                            result={msg.snippetResult}
                            isEn={isEn}
                            isLightMode={isLightMode}
                            isSelf={self}
                          />
                        </div>

                        {canSend && (
                          <button
                            type="button"
                            onClick={() => setReplyTarget(msg)}
                            className={`mt-1 px-2 py-0.5 rounded text-[11px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 cursor-pointer ${
                              isLightMode
                                ? 'text-slate-500 hover:text-indigo-700'
                                : 'text-slate-400 hover:text-indigo-300'
                            }`}
                          >
                            <Reply className="w-3 h-3" />
                            <span>{isEn ? 'Reply' : 'پاسخ'}</span>
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
                <div ref={threadEndRef} />
              </div>

              {/* Bottom Composer */}
              {canSend ? (
                <form
                  onSubmit={handleSendThreadMessage}
                  className={`relative p-3 border-t flex flex-col gap-2 ${
                    isLightMode ? 'border-slate-200 bg-slate-50/50' : 'border-white/10 bg-slate-950/40'
                  }`}
                >
                  <EntityMentionPickerPopover
                    isEn={isEn}
                    isLightMode={isLightMode}
                    draftBody={draftBody}
                    onDraftBodyChange={(next) => {
                      setDraftBody(next);
                      if (next.trimStart().startsWith('/')) setMentionPickerOpen(false);
                    }}
                    selectedItems={selectedEntityMentions}
                    onAddItem={(item) =>
                      setSelectedEntityMentions((prev) => [...prev, item])
                    }
                    onRemoveItem={(idx) =>
                      setSelectedEntityMentions((prev) => prev.filter((_, i) => i !== idx))
                    }
                    manualOpen={mentionPickerOpen}
                    onManualOpenChange={setMentionPickerOpen}
                    disabled={sending}
                  />

                  <SlashCommandPickerPopover
                    isEn={isEn}
                    isLightMode={isLightMode}
                    draftBody={draftBody}
                    onDraftBodyChange={(next) => {
                      setDraftBody(next);
                      setMentionPickerOpen(false);
                    }}
                    manualOpen={slashMenuOpen}
                    onManualOpenChange={setSlashMenuOpen}
                    disabled={sending}
                  />

                  {replyTarget && (
                    <div
                      className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border text-xs ${
                        isLightMode
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                          : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-200'
                      }`}
                    >
                      <span className="truncate">
                        {isEn ? 'Replying to ' : 'در حال پاسخ به '}
                        <strong>
                          {replyTarget.senderFullName || replyTarget.senderUsername}
                        </strong>
                        : {replyTarget.body.slice(0, 75)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setReplyTarget(null)}
                        className="p-0.5 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <EntityMentionChips
                    items={selectedEntityMentions}
                    onRemove={(idx) =>
                      setSelectedEntityMentions((prev) => prev.filter((_, i) => i !== idx))
                    }
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />

                  <div className="flex items-end gap-2">
                    <select
                      value={draftPriority}
                      onChange={(e) => setDraftPriority(e.target.value as CommsSeverity)}
                      className={`px-2.5 py-2 rounded-lg border text-xs outline-none shrink-0 ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-900'
                          : 'bg-slate-950 border-white/15 text-slate-100'
                      }`}
                      title={isEn ? 'Message Priority' : 'اولویت پیام'}
                    >
                      <option value="info">{isEn ? 'Normal' : 'عادی'}</option>
                      <option value="warning">{isEn ? 'Warning' : 'هشدار'}</option>
                      <option value="critical">{isEn ? 'Critical' : 'بحرانی'}</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => {
                        setSlashMenuOpen(false);
                        setMentionPickerOpen((v) => !v);
                      }}
                      className={`px-2.5 py-2 rounded-lg border text-xs flex items-center gap-1 shrink-0 cursor-pointer transition ${
                        mentionPickerOpen
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : isLightMode
                          ? 'bg-white border-slate-300 text-slate-700 hover:border-indigo-400 hover:text-indigo-700'
                          : 'bg-slate-950 border-white/15 text-slate-300 hover:border-indigo-400/50 hover:text-indigo-300'
                      }`}
                      title={
                        isEn
                          ? 'Mention a permitted device, port, or server (@)'
                          : 'ارجاع به تجهیز، پورت یا سرور مجاز (@)'
                      }
                    >
                      <AtSign className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMentionPickerOpen(false);
                        setSlashMenuOpen((v) => !v);
                      }}
                      className={`px-2.5 py-2 rounded-lg border text-xs flex items-center gap-1 shrink-0 cursor-pointer transition ${
                        slashMenuOpen
                          ? 'bg-cyan-600 border-cyan-500 text-white'
                          : isLightMode
                          ? 'bg-white border-slate-300 text-slate-700 hover:border-cyan-500 hover:text-cyan-700'
                          : 'bg-slate-950 border-white/15 text-slate-300 hover:border-cyan-400/50 hover:text-cyan-300'
                      }`}
                      title={
                        isEn
                          ? 'ChatOps slash commands (/ping, /mac, /port, /status, /dns)'
                          : 'دستورات زنده شبکه (/ping, /mac, /port, /status, /dns)'
                      }
                    >
                      <TerminalIcon className="w-3.5 h-3.5" />
                    </button>

                    <textarea
                      rows={2}
                      value={draftBody}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraftBody(v);
                        if (v.trimStart().startsWith('/')) {
                          setMentionPickerOpen(false);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendThreadMessage();
                        }
                      }}
                      placeholder={
                        isEn
                          ? 'Message, @mention, or /ping /mac /port /status /dns (Enter to send)...'
                          : 'پیام، @ارجاع یا دستور /ping /mac /port /status /dns (Enter برای ارسال)...'
                      }
                      className={`flex-1 px-3 py-2 rounded-xl border text-xs outline-none resize-none ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-900 focus:border-indigo-500'
                          : 'bg-slate-950 border-white/15 text-slate-100 focus:border-indigo-500'
                      }`}
                    />

                    <button
                      type="submit"
                      disabled={sending || (!draftBody.trim() && selectedEntityMentions.length === 0)}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 transition"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{sending ? (isEn ? 'Sending...' : 'ارسال...') : isEn ? 'Send' : 'ارسال'}</span>
                    </button>
                  </div>
                </form>
              ) : (
                <div
                  className={`px-4 py-3 border-t text-xs text-center ${
                    isLightMode
                      ? 'border-slate-200 bg-slate-50 text-slate-500'
                      : 'border-white/10 bg-slate-950/30 text-slate-400'
                  }`}
                >
                  {isEn
                    ? 'Your role policy grants read-only access to team conversations.'
                    : 'سطح دسترسی فعلی شما برای ارسال پیام در کانال‌ها به‌صورت فقط-خواندنی است.'}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* Modal 1: Start Direct Chat (5 MODAL_GUIDELINES rules) */}
      {directModalOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed top-0 left-0 right-0 bottom-8 z-[9999] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm"
            dir={isRtl ? 'rtl' : 'ltr'}
          >
            <div
              className={`flex flex-col border shadow-2xl overflow-hidden transition-all ${
                directMaximized
                  ? 'w-full h-full rounded-xl'
                  : 'w-full max-w-lg max-h-full rounded-2xl'
              } ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-900'
                  : 'bg-slate-900 border-slate-700/80 text-slate-100'
              }`}
            >
              <div
                className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-indigo-500" />
                  <h3 className="text-sm font-bold">
                    {isEn ? 'Start Direct 1:1 Conversation' : 'شروع گفتگوی مستقیم دوطرفه'}
                  </h3>
                </div>
                <ModalHeaderControls
                  isMaximized={directMaximized}
                  onMaximizeToggle={() => setDirectMaximized((v) => !v)}
                  onMinimize={() => {
                    setDirectModalOpen(false);
                    dockModal({
                      id: DIRECT_MODAL_ID,
                      labelEn: 'Start Direct Chat',
                      labelFa: 'گفتگوی مستقیم جدید',
                      category: 'system',
                      onRestore: () => setDirectModalOpen(true),
                      onClose: () => setDirectModalOpen(false),
                    });
                  }}
                  onClose={() => {
                    setDirectModalOpen(false);
                    undockModal(DIRECT_MODAL_ID);
                  }}
                  isLightMode={isLightMode}
                  isEn={isEn}
                />
              </div>

              <form onSubmit={handleStartDirectChat} className="p-4 flex flex-col gap-3 flex-1 overflow-y-auto">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold">
                    {isEn ? 'Select Team Member' : 'انتخاب کارشناس / کاربر'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Direct 1:1 Conversation' : 'گفتگوی مستقیم'}
                    whatIsIt={
                      isEn
                        ? 'Creates or reuses an isolated private thread between you and the selected operator.'
                        : 'یک کانال گفتگوی خصوصی و دوطرفه بین شما و همکار انتخابی ایجاد یا بازگشایی می‌کند.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Replaces external chat apps for incident coordination with full auditability inside NetTopology.'
                        : 'مکاتبات عملیاتی را به‌صورت امن و قابل ممیزی درون خود پنل متمرکز می‌سازد.'
                    }
                    practicalExample={
                      isEn ? 'Select NOC Shift Engineer' : 'انتخاب کارشناس شیفت یا مدیر شبکه'
                    }
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>

                <input
                  type="text"
                  value={directSearch}
                  onChange={(e) => setDirectSearch(e.target.value)}
                  placeholder={isEn ? 'Search user...' : 'جستجوی نام یا نام کاربری...'}
                  className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-900'
                      : 'bg-slate-950 border-slate-700 text-white'
                  }`}
                />

                <div
                  className={`max-h-60 overflow-y-auto custom-scrollbar rounded-xl border p-2 space-y-1 ${
                    isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                  }`}
                >
                  {directoryLoading ? (
                    <p className="text-xs text-slate-400 p-2">
                      {isEn ? 'Loading directory...' : 'در حال بارگذاری کاربران...'}
                    </p>
                  ) : (
                    userOptions
                      .filter((u) => {
                        const q = directSearch.trim().toLowerCase();
                        return (
                          !q ||
                          (u.label || '').toLowerCase().includes(q) ||
                          (u.username || '').toLowerCase().includes(q)
                        );
                      })
                      .map((u) => {
                        const val = u.username || u.id;
                        const active = selectedDirectUser === val;
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => setSelectedDirectUser(val)}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs text-start cursor-pointer transition ${
                              active
                                ? 'bg-indigo-600 border-indigo-600 text-white font-semibold'
                                : isLightMode
                                ? 'bg-white border-slate-200 text-slate-800 hover:bg-slate-100'
                                : 'bg-white/5 border-transparent text-slate-200 hover:bg-white/10'
                            }`}
                          >
                            <span>{isEn ? u.labelEn || u.label : u.label}</span>
                            <span className="text-[11px] opacity-80">{u.roleOrType}</span>
                          </button>
                        );
                      })
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setDirectModalOpen(false);
                      undockModal(DIRECT_MODAL_ID);
                    }}
                    className={`px-4 py-2 rounded-lg border text-xs font-medium cursor-pointer ${
                      isLightMode
                        ? 'bg-slate-100 border-slate-300 text-slate-800'
                        : 'bg-white/5 border-white/15 text-slate-200'
                    }`}
                  >
                    {isEn ? 'Cancel' : 'انصراف'}
                  </button>
                  <button
                    type="submit"
                    disabled={!selectedDirectUser || directBusy}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-45"
                  >
                    {directBusy
                      ? isEn
                        ? 'Opening...'
                        : 'در حال باز کردن...'
                      : isEn
                      ? 'Open Chat'
                      : 'شروع گفتگو'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Modal 2: Create Team Group Channel (5 MODAL_GUIDELINES rules) */}
      {groupModalOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed top-0 left-0 right-0 bottom-8 z-[9999] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm"
            dir={isRtl ? 'rtl' : 'ltr'}
          >
            <div
              className={`flex flex-col border shadow-2xl overflow-hidden transition-all ${
                groupMaximized
                  ? 'w-full h-full rounded-xl'
                  : 'w-full max-w-xl max-h-full rounded-2xl'
              } ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-900'
                  : 'bg-slate-900 border-slate-700/80 text-slate-100'
              }`}
            >
              <div
                className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-indigo-500" />
                  <h3 className="text-sm font-bold">
                    {isEn ? 'Create Team Group Channel' : 'ایجاد کانال گروهی جدید'}
                  </h3>
                </div>
                <ModalHeaderControls
                  isMaximized={groupMaximized}
                  onMaximizeToggle={() => setGroupMaximized((v) => !v)}
                  onMinimize={() => {
                    setGroupModalOpen(false);
                    dockModal({
                      id: GROUP_MODAL_ID,
                      labelEn: 'Create Channel',
                      labelFa: 'ایجاد کانال گروهی',
                      category: 'system',
                      onRestore: () => setGroupModalOpen(true),
                      onClose: () => setGroupModalOpen(false),
                    });
                  }}
                  onClose={() => {
                    setGroupModalOpen(false);
                    undockModal(GROUP_MODAL_ID);
                  }}
                  isLightMode={isLightMode}
                  isEn={isEn}
                />
              </div>

              <form onSubmit={handleCreateGroupChannel} className="p-4 flex flex-col gap-3.5 flex-1 overflow-y-auto">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold">
                      {isEn ? 'Channel Name' : 'نام کانال گروهی'}
                    </label>
                    <FieldInfoTooltip
                      title={isEn ? 'Channel Name' : 'نام کانال گروهی'}
                      whatIsIt={
                        isEn
                          ? 'Display title of the shared workspace channel visible to all channel members.'
                          : 'عنوان مشترک کانال که برای تمامی اعضای این کانال نمایش داده می‌شود.'
                      }
                      whyNeeded={
                        isEn
                          ? 'Organizes incidents, maintenance shifts, or departmental discussions by topic.'
                          : 'مباحث رخدادها، تحویل شیفت یا هماهنگی بخش‌های مختلف را به تفکیک موضوع دسته‌بندی می‌کند.'
                      }
                      practicalExample={
                        isEn ? 'NOC Incident Bridge / Core Network Ops' : 'اتاق عملیات NOC / پشتیبانی شبانه'
                      }
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>
                  <input
                    type="text"
                    required
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder={isEn ? 'e.g. Core Infrastructure Ops' : 'مثال: تیم عملیات شبکه و امنیت'}
                    className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-900'
                        : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">
                    {isEn ? 'Topic / Description (Optional)' : 'توضیحات / موضوع کانال (اختیاری)'}
                  </label>
                  <input
                    type="text"
                    value={groupDescription}
                    onChange={(e) => setGroupDescription(e.target.value)}
                    placeholder={
                      isEn ? 'Purpose of this channel...' : 'توضیح کوتاه درباره هدف این کانال...'
                    }
                    className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-900'
                        : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                {dirGroupOptions.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold">
                        {isEn ? 'Auto-Include User Group (Optional)' : 'افزودن خودکار اعضای یک گروه (اختیاری)'}
                      </label>
                      <FieldInfoTooltip
                        title={isEn ? 'Linked Directory Group' : 'اتصال به گروه کاربری'}
                        whatIsIt={
                          isEn
                            ? 'Automatically enrolls all members of a Local or Active Directory group into this channel.'
                            : 'تمام اعضای یک گروه محلی یا اکتیو دایرکتوری را به‌صورت خودکار به عضویت کانال درمی‌آورد.'
                        }
                        whyNeeded={
                          isEn
                            ? 'Saves time when onboarding entire engineering squads or shifts.'
                            : 'نیاز به انتخاب تک‌تک اعضای گروه‌های پرجمعیت را برطرف می‌کند.'
                        }
                        practicalExample={
                          isEn ? 'Select NOC Operators group' : 'انتخاب گروه کارشناسان شبکه'
                        }
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </div>
                    <select
                      value={groupLinkedId}
                      onChange={(e) => setGroupLinkedId(e.target.value)}
                      className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-900'
                          : 'bg-slate-950 border-slate-700 text-white'
                      }`}
                    >
                      <option value="">{isEn ? '— None —' : '— انتخاب نشده —'}</option>
                      {dirGroupOptions.map((g) => (
                        <option key={g.id} value={g.id}>
                          {isEn ? g.labelEn || g.label : g.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold mb-1.5">
                    {isEn ? 'Select Additional Members' : 'انتخاب اعضای کانال'}
                  </label>
                  <div
                    className={`max-h-40 overflow-y-auto custom-scrollbar rounded-xl border p-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5 ${
                      isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                    }`}
                  >
                    {userOptions.map((u) => {
                      const val = u.username || u.id;
                      const checked = groupMemberIds.includes(val);
                      return (
                        <label
                          key={u.id}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer ${
                            checked
                              ? isLightMode
                                ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                                : 'bg-indigo-500/20 border-indigo-500/40 text-white'
                              : isLightMode
                              ? 'bg-white border-slate-200 text-slate-800'
                              : 'bg-white/5 border-transparent text-slate-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setGroupMemberIds((prev) =>
                                e.target.checked ? [...prev, val] : prev.filter((x) => x !== val)
                              )
                            }
                            className="rounded accent-indigo-600"
                          />
                          <span className="truncate">{isEn ? u.labelEn || u.label : u.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setGroupModalOpen(false);
                      undockModal(GROUP_MODAL_ID);
                    }}
                    className={`px-4 py-2 rounded-lg border text-xs font-medium cursor-pointer ${
                      isLightMode
                        ? 'bg-slate-100 border-slate-300 text-slate-800'
                        : 'bg-white/5 border-white/15 text-slate-200'
                    }`}
                  >
                    {isEn ? 'Cancel' : 'انصراف'}
                  </button>
                  <button
                    type="submit"
                    disabled={!groupName.trim() || groupBusy}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-45"
                  >
                    {groupBusy
                      ? isEn
                        ? 'Creating...'
                        : 'در حال ساخت...'
                      : isEn
                      ? 'Create Channel'
                      : 'ساخت کانال'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Modal 3: Add Members to Group Channel (5 MODAL_GUIDELINES rules) */}
      {addMembersOpen &&
        membersTargetChannel &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed top-0 left-0 right-0 bottom-8 z-[9999] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm"
            dir={isRtl ? 'rtl' : 'ltr'}
          >
            <div
              className={`flex flex-col border shadow-2xl overflow-hidden transition-all ${
                addMembersMaximized
                  ? 'w-full h-full rounded-xl'
                  : 'w-full max-w-md max-h-full rounded-2xl'
              } ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-900'
                  : 'bg-slate-900 border-slate-700/80 text-slate-100'
              }`}
            >
              <div
                className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-indigo-500" />
                  <h3 className="text-sm font-bold">
                    {isEn ? 'Add Channel Members' : 'افزودن عضو به کانال'}
                  </h3>
                </div>
                <ModalHeaderControls
                  isMaximized={addMembersMaximized}
                  onMaximizeToggle={() => setAddMembersMaximized((v) => !v)}
                  onMinimize={() => {
                    setAddMembersOpen(false);
                    dockModal({
                      id: MEMBERS_MODAL_ID,
                      labelEn: 'Add Members',
                      labelFa: 'افزودن اعضای کانال',
                      category: 'system',
                      onRestore: () => setAddMembersOpen(true),
                      onClose: () => setAddMembersOpen(false),
                    });
                  }}
                  onClose={() => {
                    setAddMembersOpen(false);
                    undockModal(MEMBERS_MODAL_ID);
                  }}
                  isLightMode={isLightMode}
                  isEn={isEn}
                />
              </div>

              <form onSubmit={handleAddMembersSubmit} className="p-4 flex flex-col gap-3 flex-1 overflow-y-auto">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold">
                    {isEn ? 'Select Users to Add' : 'انتخاب کاربران جدید'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Add Channel Members' : 'افزودن عضو جدید'}
                    whatIsIt={
                      isEn
                        ? 'Enrolls additional users into the active team channel.'
                        : 'کاربران انتخاب‌شده را به عضویت کانال گروهی فعلی درمی‌آورد.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Allows onboarding new team operators into ongoing discussions without recreating the channel.'
                        : 'بدون نیاز به ساخت کانال جدید، همکاران تازه را به گفتگو اضافه می‌کند.'
                    }
                    practicalExample={
                      isEn ? 'Add backup engineer during escalation' : 'افزودن کارشناس امنیت هنگام بررسی رخداد'
                    }
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>

                <div
                  className={`max-h-56 overflow-y-auto custom-scrollbar rounded-xl border p-2 space-y-1.5 ${
                    isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                  }`}
                >
                  {userOptions
                    .filter((u) => !existingMemberUsernames.has((u.username || '').toLowerCase()))
                    .map((u) => {
                      const val = u.username || u.id;
                      const checked = extraMemberIds.includes(val);
                      return (
                        <label
                          key={u.id}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer ${
                            checked
                              ? isLightMode
                                ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                                : 'bg-indigo-500/20 border-indigo-500/40 text-white'
                              : isLightMode
                              ? 'bg-white border-slate-200 text-slate-800'
                              : 'bg-white/5 border-transparent text-slate-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setExtraMemberIds((prev) =>
                                e.target.checked ? [...prev, val] : prev.filter((x) => x !== val)
                              )
                            }
                            className="rounded accent-indigo-600"
                          />
                          <span className="truncate">{isEn ? u.labelEn || u.label : u.label}</span>
                        </label>
                      );
                    })}
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setAddMembersOpen(false);
                      setMembersTargetChannelId(null);
                      undockModal(MEMBERS_MODAL_ID);
                    }}
                    className={`px-4 py-2 rounded-lg border text-xs font-medium cursor-pointer ${
                      isLightMode
                        ? 'bg-slate-100 border-slate-300 text-slate-800'
                        : 'bg-white/5 border-white/15 text-slate-200'
                    }`}
                  >
                    {isEn ? 'Cancel' : 'انصراف'}
                  </button>
                  <button
                    type="submit"
                    disabled={extraMemberIds.length === 0 || addMembersBusy}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-45"
                  >
                    {addMembersBusy
                      ? isEn
                        ? 'Adding...'
                        : 'در حال افزودن...'
                      : isEn
                      ? 'Add Selected'
                      : 'افزودن اعضا'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Modal 4: Confirm Chat Action (Rule 7 Compliant: bottom-8 clearance, 3 header controls, theme contrast, bilingual, FieldInfoTooltip) */}
      {actionConfirm &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed top-0 left-0 right-0 bottom-8 z-[9999] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm"
            dir={isRtl ? 'rtl' : 'ltr'}
          >
            <div
              className={`flex flex-col border shadow-2xl overflow-hidden transition-all ${
                actionConfirmMaximized
                  ? 'w-full h-full rounded-xl'
                  : 'w-full max-w-md max-h-full rounded-2xl'
              } ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-900'
                  : 'bg-slate-900 border-slate-700/80 text-slate-100'
              }`}
            >
              <div
                className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {actionConfirm.kind === 'clear' ? (
                    <Eraser className="w-4 h-4 text-sky-500 shrink-0" />
                  ) : actionConfirm.kind === 'leave' ? (
                    <LogOut className="w-4 h-4 text-amber-500 shrink-0" />
                  ) : (
                    <Trash2 className="w-4 h-4 text-rose-500 shrink-0" />
                  )}
                  <h3 className="text-sm font-bold truncate">
                    {actionConfirm.kind === 'clear'
                      ? isEn
                        ? 'Clear Chat History'
                        : 'پاک کردن تاریخچه پیام‌ها'
                      : actionConfirm.kind === 'leave'
                      ? actionConfirm.channel.channelType === 'direct'
                        ? isEn
                          ? 'Delete Direct Chat'
                          : 'حذف گفتگوی مستقیم'
                        : isEn
                        ? 'Leave Group Channel'
                        : 'خروج از کانال گروهی'
                      : isEn
                      ? 'Delete Channel Permanently'
                      : 'حذف کامل کانال گروهی'}
                  </h3>
                </div>
                <ModalHeaderControls
                  isMaximized={actionConfirmMaximized}
                  onMaximizeToggle={() => setActionConfirmMaximized((v) => !v)}
                  onMinimize={() => {
                    const snapshot = actionConfirm;
                    setActionConfirm(null);
                    dockModal({
                      id: ACTION_CONFIRM_MODAL_ID,
                      labelEn: 'Confirm Chat Action',
                      labelFa: 'تایید عملیات گفتگو',
                      category: 'system',
                      onRestore: () => setActionConfirm(snapshot),
                      onClose: () => setActionConfirm(null),
                    });
                  }}
                  onClose={() => {
                    setActionConfirm(null);
                    undockModal(ACTION_CONFIRM_MODAL_ID);
                  }}
                  isLightMode={isLightMode}
                  isEn={isEn}
                />
              </div>

              <div className="p-4 space-y-4 overflow-y-auto">
                <div className="flex items-start justify-between gap-2">
                  <p
                    className={`text-xs leading-relaxed ${
                      isLightMode ? 'text-slate-700' : 'text-slate-300'
                    }`}
                  >
                    {actionConfirm.kind === 'clear'
                      ? isEn
                        ? `Clear all existing messages in "${dedupeParenthesizedTitle(
                            actionConfirm.channel.nameEn || actionConfirm.channel.name
                          )}" for your account only? Other participants will keep their message history.`
                        : `آیا مطمئن هستید می‌خواهید تمام پیام‌های فعلی در گفتگوی «${dedupeParenthesizedTitle(
                            actionConfirm.channel.name
                          )}» را فقط برای حساب خودتان پاک کنید؟ تاریخچه سایر اعضا دست‌نخورده باقی می‌ماند.`
                      : actionConfirm.kind === 'leave'
                      ? actionConfirm.channel.channelType === 'direct'
                        ? isEn
                          ? `Remove "${dedupeParenthesizedTitle(
                              actionConfirm.channel.nameEn || actionConfirm.channel.name
                            )}" from your conversation list and clear its messages on your side? It will reappear automatically if they message you later.`
                          : `آیا می‌خواهید گفتگوی «${dedupeParenthesizedTitle(
                              actionConfirm.channel.name
                            )}» از فهرست شما حذف شده و پیام‌های قبلی برایتان پاک شود؟ در صورت ارسال پیام جدید توسط طرف مقابل، دوباره نمایان خواهد شد.`
                        : isEn
                        ? `Leave group channel "${dedupeParenthesizedTitle(
                            actionConfirm.channel.nameEn || actionConfirm.channel.name
                          )}"? You will stop receiving messages from this channel unless invited again.`
                        : `آیا می‌خواهید از کانال گروهی «${dedupeParenthesizedTitle(
                            actionConfirm.channel.name
                          )}» خارج شوید؟ پس از خروج، پیام‌های این کانال برایتان ارسال نخواهد شد.`
                      : isEn
                      ? `Permanently delete channel "${dedupeParenthesizedTitle(
                          actionConfirm.channel.nameEn || actionConfirm.channel.name
                        )}" and all its messages for ALL members? This action cannot be undone.`
                      : `آیا مطمئن هستید که می‌خواهید کانال «${dedupeParenthesizedTitle(
                          actionConfirm.channel.name
                        )}» و تمام پیام‌های آن را برای همه اعضا به‌صورت کامل حذف کنید؟ این عمل غیرقابل بازگشت است.`}
                  </p>
                  <FieldInfoTooltip
                    title={isEn ? 'Personal vs Global Scope' : 'محدوده اثر عملیات'}
                    whatIsIt={
                      isEn
                        ? 'Controls whether conversation cleanup affects only your view or all participants.'
                        : 'تعیین می‌کند عملیات حذف یا پاک‌سازی فقط در حساب شما اعمال شود یا برای کل اعضا.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Prevents accidental deletion of shared operational audit threads while keeping individual inboxes tidy.'
                        : 'از حذف ناخواسته تاریخچه تیمی جلوگیری کرده و در عین حال امکان خلوت کردن گفتگوهای شخصی را می‌دهد.'
                    }
                    practicalExample={
                      isEn
                        ? 'Use Clear History to reset your view without affecting teammates.'
                        : 'برای خلوت کردن چت خودتان بدون اثر روی همکاران از پاک کردن تاریخچه استفاده کنید.'
                    }
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </div>

                <div
                  className={`flex justify-end gap-2 pt-3 border-t ${
                    isLightMode ? 'border-slate-200' : 'border-slate-800'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActionConfirm(null);
                      undockModal(ACTION_CONFIRM_MODAL_ID);
                    }}
                    className={`px-4 py-2 rounded-lg border text-xs font-medium cursor-pointer ${
                      isLightMode
                        ? 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
                        : 'bg-white/5 border-white/15 text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    {isEn ? 'Cancel' : 'انصراف'}
                  </button>
                  <button
                    type="button"
                    disabled={actionConfirmBusy}
                    onClick={handleConfirmChatAction}
                    className={`px-4 py-2 rounded-lg text-white text-xs font-semibold cursor-pointer disabled:opacity-50 ${
                      actionConfirm.kind === 'delete'
                        ? 'bg-rose-600 hover:bg-rose-500'
                        : actionConfirm.kind === 'leave'
                        ? 'bg-amber-600 hover:bg-amber-500'
                        : 'bg-sky-600 hover:bg-sky-500'
                    }`}
                  >
                    {actionConfirmBusy
                      ? isEn
                        ? 'Applying...'
                        : 'در حال اجرا...'
                      : actionConfirm.kind === 'clear'
                      ? isEn
                        ? 'Clear My History'
                        : 'پاک کردن تاریخچه'
                      : actionConfirm.kind === 'leave'
                      ? actionConfirm.channel.channelType === 'direct'
                        ? isEn
                          ? 'Delete Chat'
                          : 'حذف گفتگو'
                        : isEn
                        ? 'Leave Channel'
                        : 'خروج از کانال'
                      : isEn
                      ? 'Delete Permanently'
                      : 'حذف کامل کانال'}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
