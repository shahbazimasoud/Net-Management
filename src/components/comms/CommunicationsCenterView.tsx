import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  Inbox,
  MailOpen,
  MessageSquare,
  Megaphone,
  ShieldAlert,
  ShieldCheck,
  Archive,
  ArchiveRestore,
  Search,
  RefreshCw,
  CheckCheck,
  Check,
  AlertTriangle,
  AlertCircle,
  Info,
  Send,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  User,
  Users,
  X,
  Filter,
  Reply,
  Hash,
  BarChart3,
  XCircle,
} from 'lucide-react';
import {
  ActionApprovalRequest,
  ApprovalQueueSummary,
  CommsCategory,
  CommsChannel,
  CommsCountsByFolder,
  CommsDispatchPayload,
  CommsFolder,
  CommsNotificationItem,
  CommsRecipientOption,
  CommsSeverity,
} from '../../types';
import { useLanguage } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { useModalDock } from '../../context/ModalDockContext';
import { isUserSuperAdmin } from '../../utils/rbac';
import { ModalHeaderControls } from '../common/ModalHeaderControls';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import {
  acknowledgeCommsNotification,
  archiveCommsNotification,
  dispatchCommsMessage,
  fetchCommsChannels,
  fetchCommsNotifications,
  fetchCommsRecipients,
  markAllCommsNotificationsRead,
  markCommsNotificationRead,
  replyToInboxNotificationApi,
} from '../../services/commsApi';
import {
  decideApprovalRequestApi,
  fetchApprovalById,
  fetchApprovalRequests,
} from '../../services/approvalApi';
import { appDataCache } from '../../services/dataCache';
import { ActiveTab } from '../Sidebar';
import { TeamChannelsPane } from './TeamChannelsPane';
import { AnnouncementTrackerPane } from './AnnouncementTrackerPane';
import { ApprovalsQueuePane } from './ApprovalsQueuePane';

interface CommunicationsCenterViewProps {
  isLightMode?: boolean;
  onNavigateToTab?: (tab: ActiveTab) => void;
  onUnreadCountSync?: (unreadCount: number, countsByFolder?: CommsCountsByFolder) => void;
  liveRevision?: number;
  initialSelectedId?: string | null;
  onConsumeInitialSelectedId?: () => void;
}

const DEFAULT_COUNTS: CommsCountsByFolder = {
  all: 0,
  unread: 0,
  messages: 0,
  announcements: 0,
  system: 0,
  approvals: 0,
  archived: 0,
};

const COMPOSE_MODAL_ID = 'comms-compose-modal';

export const CommunicationsCenterView: React.FC<CommunicationsCenterViewProps> = ({
  isLightMode: isLightModeProp,
  onNavigateToTab,
  onUnreadCountSync,
  liveRevision = 0,
  initialSelectedId = null,
  onConsumeInitialSelectedId,
}) => {
  const { isEn, isRtl } = useLanguage();
  const { user, effectivePolicy } = useAuth();
  const { dockModal, undockModal } = useModalDock();

  const isLightMode =
    typeof isLightModeProp === 'boolean'
      ? isLightModeProp
      : typeof document !== 'undefined' && document.body.classList.contains('theme-light');

  const isSuperAdmin = isUserSuperAdmin(user, effectivePolicy);
  const canSend =
    isSuperAdmin ||
    Boolean(effectivePolicy?.canSendCommunications) ||
    Boolean(effectivePolicy?.canSendAnnouncements);
  const canBroadcast = isSuperAdmin || Boolean(effectivePolicy?.canSendAnnouncements);
  const canApprove = isSuperAdmin || Boolean(effectivePolicy?.canApproveActions);

  // Phase 2 & Phase 4 Sub-View & Queue states
  const [viewMode, setViewMode] = useState<'inbox' | 'channels' | 'tracker' | 'approvals'>('inbox');
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [channelUnreadCount, setChannelUnreadCount] = useState<number>(0);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number>(0);
  const [focusApprovalId, setFocusApprovalId] = useState<string | null>(null);

  // Inline Approval Request Inspection in Inbox Detail Pane
  const [linkedApproval, setLinkedApproval] = useState<ActionApprovalRequest | null>(null);
  const [linkedApprovalLoading, setLinkedApprovalLoading] = useState(false);
  const [inlineDecisionNote, setInlineDecisionNote] = useState('');
  const [inlineApprovalBusy, setInlineApprovalBusy] = useState(false);
  const [inlineApprovalFeedback, setInlineApprovalFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Inline Quick Reply in Inbox Detail Pane
  const [quickReplyBody, setQuickReplyBody] = useState('');
  const [quickReplySending, setQuickReplySending] = useState(false);
  const [quickReplyFeedback, setQuickReplyFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Filter & feed states
  const [activeFolder, setActiveFolder] = useState<CommsFolder>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | CommsSeverity>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const cacheKey = `comms:notifications:${activeFolder}:${severityFilter}:${debouncedQuery.trim()}:60:0`;
  const optimistic = appDataCache.getOptimistic<{
    items: CommsNotificationItem[];
    total: number;
    unreadCount: number;
    countsByFolder: CommsCountsByFolder;
  }>(cacheKey);

  const [items, setItems] = useState<CommsNotificationItem[]>(optimistic?.items || []);
  const [countsByFolder, setCountsByFolder] = useState<CommsCountsByFolder>(
    optimistic?.countsByFolder || DEFAULT_COUNTS
  );
  const [loading, setLoading] = useState<boolean>(!optimistic);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId || optimistic?.items?.[0]?.id || null
  );
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  // Track IDs explicitly marked unread by the user so auto-read doesn't override manual toggles
  const manualUnreadIdsRef = useRef<Set<string>>(new Set());
  const autoReadInFlightRef = useRef<Set<string>>(new Set());

  // Compose Modal States (RBAC gated)
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMaximized, setComposeMaximized] = useState(false);
  const [recipients, setRecipients] = useState<CommsRecipientOption[]>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [composeCategory, setComposeCategory] = useState<'direct_message' | 'announcement'>(
    'direct_message'
  );
  const [composeTargetType, setComposeTargetType] = useState<'users' | 'group' | 'all'>('users');
  const [composeTargetIds, setComposeTargetIds] = useState<string[]>([]);
  const [composeRecipientQuery, setComposeRecipientQuery] = useState('');
  const [composeSeverity, setComposeSeverity] = useState<CommsSeverity>('info');
  const [composeTitle, setComposeTitle] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeRequiresAck, setComposeRequiresAck] = useState(false);
  const [composeSending, setComposeSending] = useState(false);
  const [composeFeedback, setComposeFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 220);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadNotifications = useCallback(
    async (forceRefresh = false) => {
      const currentCache = appDataCache.getOptimistic<any>(
        `comms:notifications:${activeFolder}:${severityFilter}:${debouncedQuery.trim()}:60:0`
      );
      if (!currentCache && items.length === 0) {
        setLoading(true);
      } else if (forceRefresh) {
        setRefreshing(true);
      }
      setErrorMsg(null);

      try {
        const res = await fetchCommsNotifications({
          folder: activeFolder,
          severity: severityFilter,
          q: debouncedQuery,
          limit: 60,
          offset: 0,
          forceRefresh,
        });
        setItems(res.items || []);
        const nextCounts = res.countsByFolder || DEFAULT_COUNTS;
        setCountsByFolder(nextCounts);
        onUnreadCountSync?.(res.unreadCount ?? nextCounts.unread ?? 0, nextCounts);
        setSelectedId((prev) => {
          if (initialSelectedId && (res.items || []).some((i) => i.id === initialSelectedId)) {
            return initialSelectedId;
          }
          if (prev && (res.items || []).some((i) => i.id === prev)) return prev;
          return res.items?.[0]?.id || null;
        });
        if (initialSelectedId) {
          onConsumeInitialSelectedId?.();
        }
      } catch (err: any) {
        setErrorMsg(
          err?.message ||
            (isEn ? 'Failed to load communications feed' : 'خطا در دریافت فهرست پیام‌ها و اعلانات')
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeFolder, severityFilter, debouncedQuery, isEn, onUnreadCountSync]
  );

  useEffect(() => {
    if (initialSelectedId) {
      manualUnreadIdsRef.current.delete(initialSelectedId);
      setViewMode('inbox');
      setSelectedId(initialSelectedId);
      onConsumeInitialSelectedId?.();
    }
  }, [initialSelectedId, onConsumeInitialSelectedId]);

  useEffect(() => {
    loadNotifications(liveRevision > 0);
  }, [activeFolder, severityFilter, debouncedQuery, liveRevision]);

  const syncChannelUnreadFromList = useCallback((list: CommsChannel[]) => {
    const sum = list.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
    setChannelUnreadCount(sum);
  }, []);

  useEffect(() => {
    fetchCommsChannels(liveRevision > 0)
      .then(syncChannelUnreadFromList)
      .catch(() => {});
  }, [liveRevision, syncChannelUnreadFromList]);

  useEffect(() => {
    fetchApprovalRequests({ status: 'pending', limit: 1, forceRefresh: liveRevision > 0 })
      .then((res) => {
        setPendingApprovalsCount(res.summary?.pending ?? 0);
      })
      .catch(() => {});
  }, [liveRevision]);

  const handleApprovalsSummarySync = useCallback((summary: ApprovalQueueSummary) => {
    setPendingApprovalsCount(summary.pending ?? 0);
  }, []);

  useEffect(() => {
    setQuickReplyBody('');
    setQuickReplyFeedback(null);
    setInlineDecisionNote('');
    setInlineApprovalFeedback(null);
  }, [selectedId]);

  const handleQuickReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !quickReplyBody.trim() || quickReplySending) return;
    setQuickReplySending(true);
    setQuickReplyFeedback(null);
    try {
      const res = await replyToInboxNotificationApi(selectedItem.id, {
        body: quickReplyBody.trim(),
      });
      setQuickReplyBody('');
      setActiveChannelId(res.channel.id);
      setQuickReplyFeedback({
        type: 'success',
        text: isEn ? 'Reply delivered to thread.' : 'پاسخ با موفقیت در گفتگو ثبت و ارسال شد.',
      });
    } catch (err: any) {
      setQuickReplyFeedback({
        type: 'error',
        text: err?.message || (isEn ? 'Failed to send reply' : 'خطا در ارسال پاسخ'),
      });
    } finally {
      setQuickReplySending(false);
    }
  };

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) || null,
    [items, selectedId]
  );

  const selectedApprovalId = useMemo(() => {
    if (!selectedItem || selectedItem.category !== 'approval_request') return null;
    const rawId = selectedItem.metadata?.approvalRequestId;
    return typeof rawId === 'string' && rawId.trim() ? rawId.trim() : null;
  }, [selectedItem]);

  useEffect(() => {
    if (!selectedApprovalId) {
      setLinkedApproval(null);
      setLinkedApprovalLoading(false);
      return;
    }
    let cancelled = false;
    setLinkedApprovalLoading(true);
    fetchApprovalById(selectedApprovalId)
      .then((req) => {
        if (!cancelled) setLinkedApproval(req);
      })
      .catch(() => {
        if (!cancelled) setLinkedApproval(null);
      })
      .finally(() => {
        if (!cancelled) setLinkedApprovalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedApprovalId, liveRevision]);

  const handleInlineApprovalDecision = async (decision: 'approved' | 'rejected') => {
    if (!linkedApproval || inlineApprovalBusy) return;
    setInlineApprovalBusy(true);
    setInlineApprovalFeedback(null);
    try {
      const updated = await decideApprovalRequestApi(
        linkedApproval.id,
        decision,
        inlineDecisionNote.trim() || undefined
      );
      setLinkedApproval(updated);
      setInlineDecisionNote('');
      setInlineApprovalFeedback({
        type: 'success',
        text:
          decision === 'approved'
            ? isEn
              ? 'Request approved and requester notified.'
              : 'درخواست با موفقیت تایید شد و به متقاضی اطلاع‌رسانی گردید.'
            : isEn
            ? 'Request rejected and requester notified.'
            : 'درخواست رد شد و نتیجه به متقاضی اطلاع‌رسانی گردید.',
      });
      fetchApprovalRequests({ status: 'pending', limit: 1, forceRefresh: true })
        .then((res) => setPendingApprovalsCount(res.summary?.pending ?? 0))
        .catch(() => {});
      loadNotifications(true);
    } catch (err: any) {
      setInlineApprovalFeedback({
        type: 'error',
        text:
          err?.message ||
          (isEn ? 'Failed to submit approval decision' : 'خطا در ثبت تصمیم تاییدیه'),
      });
    } finally {
      setInlineApprovalBusy(false);
    }
  };

  const markItemViewedAsRead = useCallback(
    async (item: CommsNotificationItem) => {
      if (item.isRead || autoReadInFlightRef.current.has(item.id)) return;
      autoReadInFlightRef.current.add(item.id);
      manualUnreadIdsRef.current.delete(item.id);

      const nowIso = new Date().toISOString();
      setItems((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, isRead: true, readAt: nowIso } : row))
      );
      setCountsByFolder((prev) => {
        const nextUnread = Math.max(0, prev.unread - 1);
        const next = { ...prev, unread: nextUnread };
        onUnreadCountSync?.(nextUnread, next);
        return next;
      });
      try {
        const res = await markCommsNotificationRead(item.id, true);
        if (res.countsByFolder) {
          setCountsByFolder(res.countsByFolder);
          onUnreadCountSync?.(res.unreadCount, res.countsByFolder);
        }
      } catch {
        loadNotifications(true);
      } finally {
        autoReadInFlightRef.current.delete(item.id);
      }
    },
    [loadNotifications, onUnreadCountSync]
  );

  // Automatically mark the currently opened / displayed notification as seen/read in Inbox view
  useEffect(() => {
    if (viewMode !== 'inbox' || !selectedItem || selectedItem.isRead) return;
    if (manualUnreadIdsRef.current.has(selectedItem.id)) return;
    void markItemViewedAsRead(selectedItem);
  }, [viewMode, selectedItem, markItemViewedAsRead]);

  const handleSelectItem = async (item: CommsNotificationItem) => {
    manualUnreadIdsRef.current.delete(item.id);
    setSelectedId(item.id);
    if (!item.isRead) {
      await markItemViewedAsRead(item);
    }
  };

  const handleToggleRead = async (item: CommsNotificationItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActionBusyId(item.id);
    const nextRead = !item.isRead;
    if (!nextRead) {
      manualUnreadIdsRef.current.add(item.id);
    } else {
      manualUnreadIdsRef.current.delete(item.id);
    }
    try {
      const res = await markCommsNotificationRead(item.id, nextRead);
      setItems((prev) => prev.map((r) => (r.id === item.id ? res.notification : r)));
      if (res.countsByFolder) {
        setCountsByFolder(res.countsByFolder);
        onUnreadCountSync?.(res.unreadCount, res.countsByFolder);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || (isEn ? 'Update failed' : 'خطا در تغییر وضعیت'));
    } finally {
      setActionBusyId(null);
    }
  };

  const handleArchiveToggle = async (item: CommsNotificationItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActionBusyId(item.id);
    const targetArchived = !item.isArchived;
    try {
      const res = await archiveCommsNotification(item.id, targetArchived);
      setItems((prev) => prev.filter((r) => r.id !== item.id));
      setCheckedIds((prev) => {
        const copy = new Set(prev);
        copy.delete(item.id);
        return copy;
      });
      if (res.countsByFolder) {
        setCountsByFolder(res.countsByFolder);
        onUnreadCountSync?.(res.unreadCount, res.countsByFolder);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || (isEn ? 'Archive action failed' : 'خطا در آرشیو پیام'));
    } finally {
      setActionBusyId(null);
    }
  };

  const handleAcknowledge = async (item: CommsNotificationItem) => {
    setActionBusyId(item.id);
    try {
      if (!item.isRead) {
        await markItemViewedAsRead(item);
      }
      const res = await acknowledgeCommsNotification(item.id);
      setItems((prev) => prev.map((r) => (r.id === item.id ? res.notification : r)));
      if (res.countsByFolder) {
        setCountsByFolder(res.countsByFolder);
        onUnreadCountSync?.(res.unreadCount, res.countsByFolder);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || (isEn ? 'Failed to record receipt' : 'خطا در ثبت تاییدیه'));
    } finally {
      setActionBusyId(null);
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      const res = await markAllCommsNotificationsRead(activeFolder);
      setItems((prev) =>
        activeFolder === 'unread'
          ? []
          : prev.map((r) => ({ ...r, isRead: true, readAt: r.readAt || new Date().toISOString() }))
      );
      if (res.countsByFolder) {
        setCountsByFolder(res.countsByFolder);
        onUnreadCountSync?.(res.unreadCount, res.countsByFolder);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || (isEn ? 'Failed to mark all read' : 'خطا در علامت‌گذاری گروهی'));
    } finally {
      setMarkingAll(false);
    }
  };

  const handleBatchRead = async () => {
    const ids = Array.from(checkedIds);
    if (ids.length === 0) return;
    await Promise.allSettled(ids.map((id) => markCommsNotificationRead(id, true)));
    setCheckedIds(new Set());
    loadNotifications(true);
  };

  const handleBatchArchive = async () => {
    const ids = Array.from(checkedIds);
    if (ids.length === 0) return;
    const targetArchived = activeFolder !== 'archived';
    await Promise.allSettled(ids.map((id) => archiveCommsNotification(id, targetArchived)));
    setCheckedIds(new Set());
    loadNotifications(true);
  };

  const openComposeModal = async () => {
    undockModal(COMPOSE_MODAL_ID);
    setComposeFeedback(null);
    setComposeRecipientQuery('');
    setComposeOpen(true);
    if (recipients.length === 0) {
      setRecipientsLoading(true);
      try {
        const list = await fetchCommsRecipients();
        setRecipients(list);
      } catch {}
      setRecipientsLoading(false);
    }
  };

  const handleMinimizeCompose = () => {
    setComposeOpen(false);
    dockModal({
      id: COMPOSE_MODAL_ID,
      labelEn: 'Compose Message',
      labelFa: 'ارسال پیام / اطلاعیه',
      category: 'system',
      onRestore: () => setComposeOpen(true),
      onClose: () => setComposeOpen(false),
    });
  };

  const handleCloseCompose = () => {
    setComposeOpen(false);
    setComposeRecipientQuery('');
    undockModal(COMPOSE_MODAL_ID);
  };

  const handleSubmitCompose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composeTitle.trim() || !composeBody.trim()) {
      setComposeFeedback({
        type: 'error',
        text: isEn ? 'Subject and message body are required.' : 'عنوان و متن پیام الزامی است.',
      });
      return;
    }
    if (composeTargetType !== 'all' && composeTargetIds.length === 0) {
      setComposeFeedback({
        type: 'error',
        text: isEn ? 'Select at least one recipient or group.' : 'حداقل یک گیرنده یا گروه انتخاب کنید.',
      });
      return;
    }

    setComposeSending(true);
    setComposeFeedback(null);
    try {
      const payload: CommsDispatchPayload = {
        targetType: composeTargetType,
        targetIds: composeTargetType === 'all' ? [] : composeTargetIds,
        category: composeCategory,
        severity: composeSeverity,
        title: composeTitle.trim(),
        titleEn: composeTitle.trim(),
        body: composeBody.trim(),
        bodyEn: composeBody.trim(),
        requiresAcknowledgment: composeRequiresAck,
      };
      const result = await dispatchCommsMessage(payload);
      setComposeTitle('');
      setComposeBody('');
      setComposeTargetIds([]);
      setComposeRecipientQuery('');
      setComposeRequiresAck(false);
      setComposeFeedback({
        type: 'success',
        text: isEn
          ? `Delivered to ${result.deliveredCount} recipient(s).`
          : `پیام با موفقیت برای ${result.deliveredCount} گیرنده ارسال شد.`,
      });
      setTimeout(() => {
        setComposeOpen(false);
        undockModal(COMPOSE_MODAL_ID);
        loadNotifications(true);
      }, 650);
    } catch (err: any) {
      setComposeFeedback({
        type: 'error',
        text: err?.message || (isEn ? 'Failed to dispatch message' : 'خطا در ارسال پیام'),
      });
    } finally {
      setComposeSending(false);
    }
  };

  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString(isEn ? 'en-US' : 'fa-IR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const folderItems: Array<{
    id: CommsFolder;
    labelEn: string;
    labelFa: string;
    icon: React.ComponentType<{ className?: string }>;
    count: number;
  }> = [
    { id: 'all', labelEn: 'All Inbox', labelFa: 'همه موارد', icon: Inbox, count: countsByFolder.all },
    { id: 'unread', labelEn: 'Unread', labelFa: 'خوانده‌نشده', icon: MailOpen, count: countsByFolder.unread },
    { id: 'messages', labelEn: 'Messages', labelFa: 'پیام‌های تیمی', icon: MessageSquare, count: countsByFolder.messages },
    { id: 'announcements', labelEn: 'Announcements', labelFa: 'اطلاعیه‌های مدیر', icon: Megaphone, count: countsByFolder.announcements },
    { id: 'system', labelEn: 'System & Security', labelFa: 'هشدار سیستم و امنیت', icon: ShieldAlert, count: countsByFolder.system },
    { id: 'approvals', labelEn: 'Approvals Queue', labelFa: 'صف تاییدیه‌ها', icon: ShieldCheck, count: countsByFolder.approvals },
    { id: 'archived', labelEn: 'Archived', labelFa: 'آرشیو شده', icon: Archive, count: countsByFolder.archived },
  ];

  const getCategoryMeta = (cat: CommsCategory) => {
    switch (cat) {
      case 'announcement':
        return {
          icon: Megaphone,
          labelEn: 'Announcement',
          labelFa: 'اطلاعیه رسمی',
          color: isLightMode ? 'text-indigo-700' : 'text-indigo-400',
        };
      case 'direct_message':
      case 'channel_message':
        return {
          icon: MessageSquare,
          labelEn: cat === 'direct_message' ? 'Direct Message' : 'Group Channel',
          labelFa: cat === 'direct_message' ? 'پیام مستقیم' : 'کانال گروهی',
          color: isLightMode ? 'text-sky-700' : 'text-sky-400',
        };
      case 'security_2fa':
        return {
          icon: ShieldAlert,
          labelEn: 'Security Event',
          labelFa: 'رویداد امنیتی',
          color: isLightMode ? 'text-rose-700' : 'text-rose-400',
        };
      case 'approval_request':
        return {
          icon: ShieldCheck,
          labelEn: 'Approval Request',
          labelFa: 'درخواست تایید',
          color: isLightMode ? 'text-amber-700' : 'text-amber-400',
        };
      case 'system_alert':
      default:
        return {
          icon: Bell,
          labelEn: 'System Alert',
          labelFa: 'اعلان سیستم',
          color: isLightMode ? 'text-cyan-700' : 'text-cyan-400',
        };
    }
  };

  const getSeverityMeta = (sev: CommsSeverity) => {
    switch (sev) {
      case 'critical':
        return {
          icon: AlertCircle,
          labelEn: 'Critical',
          labelFa: 'بحرانی',
          className: isLightMode
            ? 'text-rose-700 bg-rose-50 border-rose-200'
            : 'text-rose-300 bg-rose-500/15 border-rose-500/30',
        };
      case 'warning':
        return {
          icon: AlertTriangle,
          labelEn: 'Warning',
          labelFa: 'هشدار',
          className: isLightMode
            ? 'text-amber-800 bg-amber-50 border-amber-200'
            : 'text-amber-300 bg-amber-500/15 border-amber-500/30',
        };
      case 'info':
      default:
        return {
          icon: Info,
          labelEn: 'Info',
          labelFa: 'اطلاع‌رسانی',
          className: isLightMode
            ? 'text-slate-700 bg-slate-100 border-slate-200'
            : 'text-slate-300 bg-white/5 border-white/10',
        };
    }
  };

  const getItemTitle = (item: CommsNotificationItem) =>
    isEn ? item.titleEn || item.title : item.title || item.titleEn || '';

  const getItemSummary = (item: CommsNotificationItem) =>
    isEn ? item.summaryEn || item.summary : item.summary || item.summaryEn || '';

  const getItemBody = (item: CommsNotificationItem) =>
    isEn ? item.bodyEn || item.body : item.body || item.bodyEn || '';

  const selectableOptions = useMemo(
    () =>
      recipients.filter((opt) =>
        composeTargetType === 'group' ? opt.type === 'group' : opt.type === 'user'
      ),
    [recipients, composeTargetType]
  );

  const filteredSelectableOptions = useMemo(() => {
    const q = composeRecipientQuery.trim().toLowerCase();
    if (!q) return selectableOptions;
    return selectableOptions.filter((opt) => {
      const fields = [opt.label, opt.labelEn, opt.username, opt.roleOrType, opt.id, opt.source];
      return fields.some((f) => (f || '').toLowerCase().includes(q));
    });
  }, [selectableOptions, composeRecipientQuery]);

  const selectedRecipientOptions = useMemo(() => {
    if (composeTargetIds.length === 0) return [];
    const selectedSet = new Set(composeTargetIds);
    return selectableOptions.filter((opt) => selectedSet.has(opt.username || opt.id));
  }, [selectableOptions, composeTargetIds]);

  return (
    <div
      className="flex flex-col gap-4 h-full min-h-[calc(100vh-11rem)]"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Top Action & Filter Header */}
      <div
        className={`flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 py-3.5 rounded-2xl border ${
          isLightMode
            ? 'bg-white border-slate-200 shadow-xs'
            : 'bg-slate-900/75 border-white/10'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              isLightMode
                ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
            }`}
          >
            <Bell className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2
                className={`text-base sm:text-lg font-bold tracking-tight ${
                  isLightMode ? 'text-slate-900' : 'text-white'
                }`}
              >
                {isEn ? 'Inbox & Notifications Center' : 'مرکز پیام‌ها و اعلانات'}
              </h2>
              <span
                className={`text-xs font-medium tabular-nums ${
                  isLightMode ? 'text-slate-600' : 'text-slate-400'
                }`}
              >
                {countsByFolder.unread > 0
                  ? isEn
                    ? `${countsByFolder.unread} unread`
                    : `${countsByFolder.unread} مورد خوانده‌نشده`
                  : isEn
                  ? 'All caught up'
                  : 'همه موارد مطالعه شده'}
              </span>
            </div>
            <p className={`text-xs truncate ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn
                ? 'Unified real-time feed for system alerts, security events, team messages, and announcements'
                : 'صندوق متمرکز و زنده هشدارهای سیستم، رویدادهای امنیتی، مکاتبات تیمی و اطلاعیه‌های مدیر'}
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2 shrink-0">
          {/* Sub-View Segmented Switcher */}
          <div
            className={`flex items-center gap-1 p-1 rounded-xl border ${
              isLightMode
                ? 'bg-slate-100 border-slate-200'
                : 'bg-slate-950/70 border-white/10'
            }`}
          >
            <button
              type="button"
              onClick={() => setViewMode('inbox')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer transition ${
                viewMode === 'inbox'
                  ? isLightMode
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'bg-indigo-600 text-white'
                  : isLightMode
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Inbox className="w-3.5 h-3.5" />
              <span>{isEn ? 'Inbox Feed' : 'صندوق اعلانات'}</span>
              {countsByFolder.unread > 0 && (
                <span className="font-mono tabular-nums text-[10px] opacity-85">
                  ({countsByFolder.unread})
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setViewMode('channels')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer transition ${
                viewMode === 'channels'
                  ? isLightMode
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'bg-indigo-600 text-white'
                  : isLightMode
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Hash className="w-3.5 h-3.5" />
              <span>{isEn ? 'Team Chat & Channels' : 'گفتگوی تیمی و کانال‌ها'}</span>
              {channelUnreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-indigo-500 text-white font-mono tabular-nums text-[10px]">
                  {channelUnreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setViewMode('approvals')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer transition ${
                viewMode === 'approvals'
                  ? isLightMode
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'bg-indigo-600 text-white'
                  : isLightMode
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{isEn ? 'Approvals Queue' : 'صف تاییدیه‌ها'}</span>
              {pendingApprovalsCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white font-mono tabular-nums text-[10px]">
                  {pendingApprovalsCount}
                </span>
              )}
            </button>

            {canBroadcast && (
              <button
                type="button"
                onClick={() => setViewMode('tracker')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer transition ${
                  viewMode === 'tracker'
                    ? isLightMode
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'bg-indigo-600 text-white'
                    : isLightMode
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>{isEn ? 'Read Tracker' : 'رهگیری اطلاعیه‌ها'}</span>
              </button>
            )}
          </div>

          {/* Live Search (Inbox view) */}
          {viewMode === 'inbox' && (
            <>
              <div className="relative min-w-[180px] sm:w-48">
                <Search
                  className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 ${
                    isRtl ? 'right-3' : 'left-3'
                  } ${isLightMode ? 'text-slate-400' : 'text-slate-500'}`}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={isEn ? 'Search inbox...' : 'جستجو در عنوان، متن یا فرستنده...'}
                  className={`w-full py-1.5 rounded-lg border text-xs outline-none transition ${
                    isRtl ? 'pr-8 pl-7' : 'pl-8 pr-7'
                  } ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white'
                      : 'bg-slate-950/60 border-white/15 text-slate-100 placeholder:text-slate-500 focus:border-indigo-500'
                  }`}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className={`absolute top-1/2 -translate-y-1/2 ${
                      isRtl ? 'left-2' : 'right-2'
                    } text-slate-400 hover:text-slate-600 cursor-pointer`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Mark All Read */}
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={markingAll || countsByFolder.unread === 0}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap transition cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                  isLightMode
                    ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                    : 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-200'
                }`}
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>{isEn ? 'Mark All Read' : 'خوانده‌شدن همه'}</span>
              </button>

              {/* Refresh */}
              <button
                type="button"
                onClick={() => loadNotifications(true)}
                disabled={refreshing}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${
                  isLightMode
                    ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                    : 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-200'
                }`}
                title={isEn ? 'Refresh' : 'تازه‌سازی'}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </>
          )}

          {/* RBAC-Gated Compose Button */}
          {canSend && (
            <button
              type="button"
              onClick={openComposeModal}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white text-xs font-semibold shadow-sm whitespace-nowrap transition cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isEn ? 'New Message' : 'ارسال پیام / اطلاعیه'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Error State Banner */}
      {errorMsg && (
        <div
          className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border text-xs ${
            isLightMode
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => loadNotifications(true)}
            className={`px-2.5 py-1 rounded-md border font-medium cursor-pointer ${
              isLightMode
                ? 'bg-white border-rose-300 text-rose-800 hover:bg-rose-100'
                : 'bg-rose-500/20 border-rose-500/40 text-rose-200 hover:bg-rose-500/30'
            }`}
          >
            {isEn ? 'Retry' : 'تلاش مجدد'}
          </button>
        </div>
      )}

      {/* Conditional View Body */}
      {viewMode === 'channels' ? (
        <TeamChannelsPane
          isLightMode={isLightMode}
          canSend={canSend}
          isSuperAdmin={isSuperAdmin}
          liveRevision={liveRevision}
          selectedChannelId={activeChannelId}
          onSelectChannelId={setActiveChannelId}
          onChannelsLoaded={syncChannelUnreadFromList}
        />
      ) : viewMode === 'approvals' ? (
        <ApprovalsQueuePane
          isLightMode={isLightMode}
          liveRevision={liveRevision}
          initialFocusApprovalId={focusApprovalId}
          onNavigateToTab={onNavigateToTab}
          onSummaryChange={handleApprovalsSummarySync}
        />
      ) : viewMode === 'tracker' && canBroadcast ? (
        <AnnouncementTrackerPane
          isLightMode={isLightMode}
          liveRevision={liveRevision}
          onOpenComposeAnnouncement={() => {
            setComposeCategory('announcement');
            setComposeTargetType('all');
            openComposeModal();
          }}
        />
      ) : (
      <>

      {/* Main 3-Column Single-Elevation Workspace */}
      <div
        className={`flex-1 grid grid-cols-1 lg:grid-cols-12 rounded-2xl border overflow-hidden min-h-[520px] ${
          isLightMode
            ? 'bg-white border-slate-200 shadow-xs'
            : 'bg-slate-900/70 border-white/10'
        }`}
      >
        {/* Column 1: Folders & Severity Rail */}
        <aside
          className={`lg:col-span-3 xl:col-span-2 border-b lg:border-b-0 ${
            isRtl ? 'lg:border-l' : 'lg:border-r'
          } ${
            isLightMode ? 'border-slate-200 bg-slate-50/70' : 'border-white/10 bg-slate-950/35'
          } p-3 flex flex-col gap-4`}
        >
          <div className="flex flex-col gap-1">
            <div
              className={`px-2 pb-1 text-[10px] font-bold uppercase tracking-wider ${
                isLightMode ? 'text-slate-500' : 'text-slate-400'
              }`}
            >
              {isEn ? 'Folders' : 'پوشه‌های صندوق'}
            </div>
            {folderItems.map((folder) => {
              const IconComp = folder.icon;
              const isActive = activeFolder === folder.id;
              return (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => {
                    setActiveFolder(folder.id);
                    setCheckedIds(new Set());
                  }}
                  className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition cursor-pointer ${
                    isActive
                      ? isLightMode
                        ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold'
                        : 'bg-indigo-500/15 text-indigo-200 border border-indigo-500/30 font-semibold'
                      : isLightMode
                      ? 'text-slate-700 hover:bg-slate-200/70 border border-transparent'
                      : 'text-slate-300 hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0 truncate">
                    <IconComp
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isActive
                          ? isLightMode
                            ? 'text-indigo-600'
                            : 'text-indigo-300'
                          : isLightMode
                          ? 'text-slate-500'
                          : 'text-slate-400'
                      }`}
                    />
                    <span className="truncate">{isEn ? folder.labelEn : folder.labelFa}</span>
                  </span>
                  <span
                    className={`text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded ${
                      isActive
                        ? isLightMode
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-indigo-500/25 text-indigo-200'
                        : isLightMode
                        ? 'text-slate-500'
                        : 'text-slate-400'
                    }`}
                  >
                    {folder.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className={`border-t pt-3 flex flex-col gap-1.5 ${
              isLightMode ? 'border-slate-200' : 'border-white/10'
            }`}
          >
            <div
              className={`px-2 pb-0.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                isLightMode ? 'text-slate-500' : 'text-slate-400'
              }`}
            >
              <Filter className="w-3 h-3" />
              <span>{isEn ? 'Severity' : 'فیلتر اولویت'}</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-1">
              {(
                [
                  { id: 'all', labelEn: 'All Levels', labelFa: 'همه سطوح' },
                  { id: 'critical', labelEn: 'Critical', labelFa: 'بحرانی' },
                  { id: 'warning', labelEn: 'Warning', labelFa: 'هشدار' },
                  { id: 'info', labelEn: 'Info', labelFa: 'اطلاع‌رسانی' },
                ] as const
              ).map((sev) => {
                const isActive = severityFilter === sev.id;
                return (
                  <button
                    key={sev.id}
                    type="button"
                    onClick={() => setSeverityFilter(sev.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium text-start transition cursor-pointer ${
                      isActive
                        ? isLightMode
                          ? 'bg-slate-800 text-white'
                          : 'bg-white/15 text-white border border-white/20'
                        : isLightMode
                        ? 'bg-white border border-slate-200 text-slate-800 hover:bg-slate-100'
                        : 'bg-white/5 border border-transparent text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {isEn ? sev.labelEn : sev.labelFa}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Column 2: High-Density Notification Feed */}
        <section
          className={`lg:col-span-4 xl:col-span-5 border-b lg:border-b-0 ${
            isRtl ? 'lg:border-l' : 'lg:border-r'
          } ${isLightMode ? 'border-slate-200' : 'border-white/10'} flex flex-col min-h-[340px]`}
        >
          {/* Batch Selection Bar (only shown when items are checked) */}
          {checkedIds.size > 0 && (
            <div
              className={`flex items-center justify-between px-3.5 py-2 border-b text-xs ${
                isLightMode
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                  : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-200'
              }`}
            >
              <span className="font-semibold tabular-nums">
                {isEn ? `${checkedIds.size} selected` : `${checkedIds.size} مورد انتخاب شده`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleBatchRead}
                  className={`px-2 py-1 rounded border text-[11px] font-medium cursor-pointer ${
                    isLightMode
                      ? 'bg-white border-indigo-300 text-indigo-800 hover:bg-indigo-100'
                      : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                  }`}
                >
                  {isEn ? 'Mark Read' : 'خوانده شد'}
                </button>
                <button
                  type="button"
                  onClick={handleBatchArchive}
                  className={`px-2 py-1 rounded border text-[11px] font-medium cursor-pointer ${
                    isLightMode
                      ? 'bg-white border-indigo-300 text-indigo-800 hover:bg-indigo-100'
                      : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                  }`}
                >
                  {activeFolder === 'archived'
                    ? isEn
                      ? 'Restore'
                      : 'بازگردانی'
                    : isEn
                    ? 'Archive'
                    : 'آرشیو'}
                </button>
              </div>
            </div>
          )}

          {/* Loading Skeleton */}
          {loading ? (
            <div className="divide-y divide-slate-200/60 dark:divide-white/5">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="p-3.5 flex items-start gap-3 animate-pulse">
                  <div
                    className={`w-8 h-8 rounded-lg shrink-0 ${
                      isLightMode ? 'bg-slate-200' : 'bg-white/10'
                    }`}
                  />
                  <div className="flex-1 space-y-2">
                    <div
                      className={`h-3.5 w-3/4 rounded ${
                        isLightMode ? 'bg-slate-200' : 'bg-white/10'
                      }`}
                    />
                    <div
                      className={`h-3 w-full rounded ${
                        isLightMode ? 'bg-slate-100' : 'bg-white/5'
                      }`}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            /* Authentic Empty State */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div
                className={`w-12 h-12 rounded-2xl border flex items-center justify-center mb-3 ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-200 text-slate-400'
                    : 'bg-white/5 border-white/10 text-slate-500'
                }`}
              >
                <Inbox className="w-6 h-6" />
              </div>
              <h3
                className={`text-sm font-bold mb-1 ${
                  isLightMode ? 'text-slate-900' : 'text-white'
                }`}
              >
                {searchQuery || severityFilter !== 'all'
                  ? isEn
                    ? 'No matching notifications'
                    : 'موردی با فیلترهای فعلی یافت نشد'
                  : activeFolder === 'unread'
                  ? isEn
                    ? 'All caught up'
                    : 'پیام خوانده‌نشده‌ای ندارید'
                  : activeFolder === 'approvals'
                  ? isEn
                    ? 'No pending approval requests'
                    : 'درخواست تاییدیه‌ای در صف نیست'
                  : isEn
                  ? 'Your inbox is empty'
                  : 'صندوق پیام‌ها و اعلانات خالی است'}
              </h3>
              <p
                className={`text-xs max-w-xs mb-4 ${
                  isLightMode ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                {isEn
                  ? 'Real-time system alerts, security events, and team messages will appear here automatically.'
                  : 'اعلانات واقعی سامانه، هشدارهای امنیتی و پیام‌های همکاران به محض ثبت به‌صورت زنده در اینجا نمایش داده می‌شوند.'}
              </p>
              {(searchQuery || severityFilter !== 'all' || activeFolder !== 'all') && (
                <div className="flex items-center flex-wrap justify-center gap-2">
                  {activeFolder === 'approvals' && (
                    <button
                      type="button"
                      onClick={() => setViewMode('approvals')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer transition"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>
                        {isEn ? 'Open Approvals Queue' : 'ورود به صف تاییدیه‌ها'}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSeverityFilter('all');
                      setActiveFolder('all');
                    }}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer ${
                      isLightMode
                        ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                        : 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-200'
                    }`}
                  >
                    {isEn ? 'Reset Filters' : 'پاک کردن فیلترها'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div
              className={`flex-1 overflow-y-auto custom-scrollbar divide-y ${
                isLightMode ? 'divide-slate-100' : 'divide-white/5'
              }`}
            >
              {items.map((item) => {
                const isSelected = selectedId === item.id;
                const isChecked = checkedIds.has(item.id);
                const cat = getCategoryMeta(item.category);
                const CatIcon = cat.icon;

                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelectItem(item)}
                    className={`group flex items-start gap-2.5 px-3.5 py-3 cursor-pointer transition ${
                      isSelected
                        ? isLightMode
                          ? 'bg-indigo-50/90'
                          : 'bg-indigo-500/15'
                        : !item.isRead
                        ? isLightMode
                          ? 'bg-white hover:bg-slate-50'
                          : 'bg-white/[0.03] hover:bg-white/[0.06]'
                        : isLightMode
                        ? 'bg-slate-50/40 hover:bg-slate-50'
                        : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    {/* Multi-select Checkbox */}
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        setCheckedIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(item.id);
                          else next.delete(item.id);
                          return next;
                        });
                      }}
                      className="mt-1.5 rounded accent-indigo-600 cursor-pointer shrink-0"
                    />

                    {/* Category Icon */}
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border mt-0.5 ${
                        isLightMode
                          ? 'bg-slate-100 border-slate-200'
                          : 'bg-white/5 border-white/10'
                      }`}
                    >
                      <CatIcon className={`w-3.5 h-3.5 ${cat.color}`} />
                    </div>

                    {/* Feed Body */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {!item.isRead && (
                            <span
                              className="w-2 h-2 rounded-full bg-indigo-500 shrink-0"
                              title={isEn ? 'Unread' : 'خوانده‌نشده'}
                            />
                          )}
                          <span
                            className={`text-xs truncate ${
                              !item.isRead
                                ? isLightMode
                                  ? 'font-bold text-slate-900'
                                  : 'font-bold text-white'
                                : isLightMode
                                ? 'font-medium text-slate-700'
                                : 'font-medium text-slate-300'
                            }`}
                          >
                            {getItemTitle(item)}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] font-mono tabular-nums shrink-0 ${
                            isLightMode ? 'text-slate-500' : 'text-slate-400'
                          }`}
                        >
                          {formatTimestamp(item.createdAt)}
                        </span>
                      </div>

                      <p
                        className={`text-[11px] line-clamp-1 mt-0.5 ${
                          isLightMode ? 'text-slate-600' : 'text-slate-400'
                        }`}
                      >
                        {getItemSummary(item)}
                      </p>

                      <div
                        className={`flex items-center justify-between gap-2 mt-1 text-[10px] ${
                          isLightMode ? 'text-slate-500' : 'text-slate-400'
                        }`}
                      >
                        <span className="truncate">
                          {item.senderName}
                          {' · '}
                          {isEn ? cat.labelEn : cat.labelFa}
                          {item.severity !== 'info' && (
                            <>
                              {' · '}
                              <span
                                className={
                                  item.severity === 'critical'
                                    ? isLightMode
                                      ? 'text-rose-700 font-semibold'
                                      : 'text-rose-400 font-semibold'
                                    : isLightMode
                                    ? 'text-amber-700 font-semibold'
                                    : 'text-amber-400 font-semibold'
                                }
                              >
                                {isEn
                                  ? getSeverityMeta(item.severity).labelEn
                                  : getSeverityMeta(item.severity).labelFa}
                              </span>
                            </>
                          )}
                        </span>

                        <div
                          className={`flex items-center gap-1 transition-opacity shrink-0 ${
                            !item.isRead
                              ? 'opacity-80 group-hover:opacity-100'
                              : 'opacity-0 group-hover:opacity-100'
                          }`}
                        >
                          <button
                            type="button"
                            disabled={actionBusyId === item.id}
                            onClick={(e) => handleToggleRead(item, e)}
                            className={`p-1 rounded hover:bg-slate-200/70 dark:hover:bg-white/10 cursor-pointer`}
                            title={
                              item.isRead
                                ? isEn
                                  ? 'Mark as unread'
                                  : 'علامت به‌عنوان خوانده‌نشده'
                                : isEn
                                ? 'Mark as read'
                                : 'علامت به‌عنوان خوانده‌شده'
                            }
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={actionBusyId === item.id}
                            onClick={(e) => handleArchiveToggle(item, e)}
                            className={`p-1 rounded hover:bg-slate-200/70 dark:hover:bg-white/10 cursor-pointer`}
                            title={
                              item.isArchived
                                ? isEn
                                  ? 'Restore'
                                  : 'خروج از آرشیو'
                                : isEn
                                ? 'Archive'
                                : 'آرشیو'
                            }
                          >
                            {item.isArchived ? (
                              <ArchiveRestore className="w-3 h-3" />
                            ) : (
                              <Archive className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Column 3: Detail Reading & Action Pane */}
        <section className="lg:col-span-5 xl:col-span-5 flex flex-col min-h-[340px]">
          {!selectedItem ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <MailOpen
                className={`w-10 h-10 mb-3 ${
                  isLightMode ? 'text-slate-300' : 'text-slate-600'
                }`}
              />
              <p className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'Select a message or notification from the list to inspect its full details.'
                  : 'یک پیام یا اعلان را از فهرست انتخاب کنید تا متن کامل و جزئیات آن نمایش داده شود.'}
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col p-5 gap-4 overflow-y-auto custom-scrollbar">
              {/* Detail Header */}
              <div
                className={`pb-4 border-b flex flex-col gap-3 ${
                  isLightMode ? 'border-slate-200' : 'border-white/10'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {(() => {
                      const sevMeta = getSeverityMeta(selectedItem.severity);
                      const SevIcon = sevMeta.icon;
                      return (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-semibold ${sevMeta.className}`}
                        >
                          <SevIcon className="w-3 h-3" />
                          <span>{isEn ? sevMeta.labelEn : sevMeta.labelFa}</span>
                        </span>
                      );
                    })()}
                    <span
                      className={`text-xs font-medium ${
                        isLightMode ? 'text-slate-600' : 'text-slate-400'
                      }`}
                    >
                      {isEn
                        ? getCategoryMeta(selectedItem.category).labelEn
                        : getCategoryMeta(selectedItem.category).labelFa}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={actionBusyId === selectedItem.id}
                      onClick={() => handleToggleRead(selectedItem)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer transition ${
                        isLightMode
                          ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                          : 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-200'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>
                        {selectedItem.isRead
                          ? isEn
                            ? 'Mark Unread'
                            : 'خوانده‌نشده'
                          : isEn
                          ? 'Mark Read'
                          : 'خوانده‌شده'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={actionBusyId === selectedItem.id}
                      onClick={() => handleArchiveToggle(selectedItem)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer transition ${
                        isLightMode
                          ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                          : 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-200'
                      }`}
                    >
                      {selectedItem.isArchived ? (
                        <ArchiveRestore className="w-3.5 h-3.5" />
                      ) : (
                        <Archive className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {selectedItem.isArchived
                          ? isEn
                            ? 'Unarchive'
                            : 'بازگردانی'
                          : isEn
                          ? 'Archive'
                          : 'آرشیو'}
                      </span>
                    </button>
                  </div>
                </div>

                <h3
                  className={`text-base sm:text-lg font-bold leading-snug ${
                    isLightMode ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  {getItemTitle(selectedItem)}
                </h3>

                <div
                  className={`flex items-center flex-wrap gap-x-4 gap-y-1 text-xs ${
                    isLightMode ? 'text-slate-600' : 'text-slate-400'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    <strong className={isLightMode ? 'text-slate-800' : 'text-slate-200'}>
                      {selectedItem.senderName}
                    </strong>
                    {selectedItem.senderRole && <span>({selectedItem.senderRole})</span>}
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatTimestamp(selectedItem.createdAt)}</span>
                  </span>
                </div>
              </div>

              {/* Message Body */}
              <div
                className={`p-4 rounded-xl border text-xs sm:text-sm leading-relaxed whitespace-pre-wrap ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-200 text-slate-800'
                    : 'bg-slate-950/50 border-white/10 text-slate-200'
                }`}
              >
                {getItemBody(selectedItem)}
              </div>

              {/* Linked Entity Context & Direct Jump */}
              {(selectedItem.linkedEntityName || selectedItem.actionTab) && (
                <div
                  className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-xs ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-700'
                      : 'bg-white/5 border-white/10 text-slate-300'
                  }`}
                >
                  <div className="min-w-0">
                    <span className={isLightMode ? 'text-slate-500' : 'text-slate-400'}>
                      {isEn ? 'Related Resource: ' : 'موجودیت مرتبط: '}
                    </span>
                    <strong className={isLightMode ? 'text-slate-900' : 'text-white'}>
                      {selectedItem.linkedEntityName ||
                        selectedItem.linkedEntityType ||
                        selectedItem.actionTab}
                    </strong>
                  </div>
                  {selectedItem.actionTab && onNavigateToTab && (
                    <button
                      type="button"
                      onClick={() => onNavigateToTab(selectedItem.actionTab as ActiveTab)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shrink-0 cursor-pointer transition"
                    >
                      <span>{isEn ? 'Open Section' : 'مشاهده بخش مرتبط'}</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              {/* Linked Two-Step Approval Request Control Block */}
              {selectedItem.category === 'approval_request' && selectedApprovalId && (
                <div
                  className={`p-4 rounded-xl border flex flex-col gap-3 text-xs ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-800'
                      : 'bg-slate-950/50 border-white/10 text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 font-bold">
                      <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>
                        {isEn ? 'Two-Step Approval Control' : 'کنترل و تصمیم‌گیری درخواست تایید'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusApprovalId(selectedApprovalId);
                        setViewMode('approvals');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs cursor-pointer transition"
                    >
                      <span>{isEn ? 'Inspect in Queue' : 'مشاهده کامل در صف تاییدیه‌ها'}</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {linkedApprovalLoading ? (
                    <p className={isLightMode ? 'text-slate-500' : 'text-slate-400'}>
                      {isEn ? 'Loading live request status...' : 'در حال دریافت وضعیت لحظه‌ای درخواست...'}
                    </p>
                  ) : linkedApproval ? (
                    <>
                      <div className="flex items-center flex-wrap gap-2 text-[11px]">
                        <span
                          className={`font-semibold ${
                            linkedApproval.status === 'approved'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : linkedApproval.status === 'rejected'
                              ? 'text-rose-600 dark:text-rose-400'
                              : linkedApproval.status === 'executed'
                              ? 'text-indigo-600 dark:text-indigo-400'
                              : linkedApproval.status === 'expired' ||
                                linkedApproval.status === 'cancelled'
                              ? 'text-slate-500'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {isEn ? 'Status:' : 'وضعیت:'}{' '}
                          {linkedApproval.status.toUpperCase()}
                        </span>
                        <span className="opacity-40">·</span>
                        <span>
                          {isEn ? 'Target:' : 'هدف:'}{' '}
                          <strong>{linkedApproval.targetEntityName}</strong>
                        </span>
                        <span className="opacity-40">·</span>
                        <span>
                          {isEn ? 'Risk:' : 'ریسک:'}{' '}
                          <strong className="uppercase">{linkedApproval.riskLevel}</strong>
                        </span>
                      </div>

                      {linkedApproval.commandPreview && (
                        <pre
                          dir="ltr"
                          className={`p-3 rounded-lg border font-mono text-[11px] leading-relaxed overflow-x-auto max-h-40 ${
                            isLightMode
                              ? 'bg-slate-900 border-slate-700 text-slate-100'
                              : 'bg-slate-950 border-white/10 text-slate-200'
                          }`}
                        >
                          {linkedApproval.commandPreview}
                        </pre>
                      )}

                      {inlineApprovalFeedback && (
                        <div
                          className={`px-3 py-2 rounded-lg border font-medium ${
                            inlineApprovalFeedback.type === 'success'
                              ? isLightMode
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                              : isLightMode
                              ? 'bg-rose-50 border-rose-200 text-rose-800'
                              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                          }`}
                        >
                          {inlineApprovalFeedback.text}
                        </div>
                      )}

                      {linkedApproval.status === 'pending' && canApprove && (
                        <div className="flex flex-col gap-2 pt-1">
                          <input
                            type="text"
                            value={inlineDecisionNote}
                            onChange={(e) => setInlineDecisionNote(e.target.value)}
                            placeholder={
                              isEn
                                ? 'Optional decision note for audit log...'
                                : 'یادداشت اختیاری مدیر برای ثبت در لاگ ممیزی...'
                            }
                            className={`w-full px-3 py-1.5 rounded-lg border text-xs outline-none ${
                              isLightMode
                                ? 'bg-white border-slate-300 text-slate-900 focus:border-indigo-500'
                                : 'bg-slate-900 border-white/15 text-white focus:border-indigo-500'
                            }`}
                          />
                          <div className="flex items-center flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={inlineApprovalBusy}
                              onClick={() => handleInlineApprovalDecision('approved')}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs cursor-pointer disabled:opacity-50 transition"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>{isEn ? 'Approve Request' : 'تایید درخواست'}</span>
                            </button>
                            <button
                              type="button"
                              disabled={inlineApprovalBusy}
                              onClick={() => handleInlineApprovalDecision('rejected')}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs cursor-pointer disabled:opacity-50 transition"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>{isEn ? 'Reject Request' : 'رد درخواست'}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
              )}

              {/* Read Receipt / Acknowledgment Action */}
              {(selectedItem.requiresAcknowledgment ||
                selectedItem.category === 'announcement' ||
                selectedItem.acknowledgedAt) && (
                <div
                  className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-xs ${
                    selectedItem.acknowledgedAt
                      ? isLightMode
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : isLightMode
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>
                      {selectedItem.acknowledgedAt
                        ? isEn
                          ? `Read receipt confirmed on ${formatTimestamp(selectedItem.acknowledgedAt)}`
                          : `تاییدیه مطالعه و دریافت در تاریخ ${formatTimestamp(selectedItem.acknowledgedAt)} ثبت شد.`
                        : isEn
                        ? 'This message requests explicit confirmation of receipt.'
                        : 'این اطلاعیه نیازمند ثبت تاییدیه خوانده‌شدن (Read Receipt) است.'}
                    </span>
                  </div>
                  {!selectedItem.acknowledgedAt && (
                    <button
                      type="button"
                      disabled={actionBusyId === selectedItem.id}
                      onClick={() => handleAcknowledge(selectedItem)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shrink-0 cursor-pointer transition"
                    >
                      {isEn ? 'Acknowledge Receipt' : 'تایید مطالعه و دریافت'}
                    </button>
                  )}
                </div>
              )}

              {/* Inline Two-Way Quick Reply for Direct & Group Messages */}
              {canSend &&
                (selectedItem.category === 'direct_message' ||
                  selectedItem.category === 'channel_message') && (
                  <div
                    className={`p-4 rounded-xl border flex flex-col gap-3 ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-200'
                        : 'bg-slate-950/40 border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-xs font-bold flex items-center gap-1.5 ${
                          isLightMode ? 'text-slate-800' : 'text-slate-100'
                        }`}
                      >
                        <Reply className="w-3.5 h-3.5 text-indigo-500" />
                        <span>{isEn ? 'Quick Thread Reply' : 'پاسخ سریع در گفتگو'}</span>
                      </span>

                      {selectedItem.channelId && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveChannelId(selectedItem.channelId || null);
                            setViewMode('channels');
                          }}
                          className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>{isEn ? 'Open in Team Chat' : 'باز کردن کامل در چت تیمی'}</span>
                        </button>
                      )}
                    </div>

                    {quickReplyFeedback && (
                      <div
                        className={`px-3 py-2 rounded-lg border text-xs font-medium flex items-center justify-between gap-2 ${
                          quickReplyFeedback.type === 'success'
                            ? isLightMode
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                              : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                            : isLightMode
                            ? 'bg-rose-50 border-rose-200 text-rose-800'
                            : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                        }`}
                      >
                        <span>{quickReplyFeedback.text}</span>
                        {quickReplyFeedback.type === 'success' && activeChannelId && (
                          <button
                            type="button"
                            onClick={() => setViewMode('channels')}
                            className="underline font-semibold cursor-pointer"
                          >
                            {isEn ? 'View Thread' : 'مشاهده گفتگو'}
                          </button>
                        )}
                      </div>
                    )}

                    <form onSubmit={handleQuickReplySubmit} className="flex items-end gap-2">
                      <textarea
                        rows={2}
                        value={quickReplyBody}
                        onChange={(e) => setQuickReplyBody(e.target.value)}
                        placeholder={
                          isEn
                            ? `Reply directly to ${selectedItem.senderName}...`
                            : `نوشتن پاسخ مستقیم برای ${selectedItem.senderName}...`
                        }
                        className={`flex-1 px-3 py-2 rounded-lg border text-xs outline-none resize-none ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-900 focus:border-indigo-500'
                            : 'bg-slate-900 border-white/15 text-white focus:border-indigo-500'
                        }`}
                      />
                      <button
                        type="submit"
                        disabled={quickReplySending || !quickReplyBody.trim()}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 transition"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>
                          {quickReplySending
                            ? isEn
                              ? 'Sending...'
                              : 'ارسال...'
                            : isEn
                            ? 'Reply'
                            : 'ارسال پاسخ'}
                        </span>
                      </button>
                    </form>
                  </div>
                )}
            </div>
          )}
        </section>
      </div>
      </>
      )}

      {/* Compose Message / Official Announcement Modal (Compliant with ALL 5 MODAL_GUIDELINES rules) */}
      {composeOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed top-0 left-0 right-0 bottom-8 z-[9999] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm"
            dir={isRtl ? 'rtl' : 'ltr'}
          >
            <div
              className={`flex flex-col border shadow-2xl overflow-hidden transition-all ${
                composeMaximized
                  ? 'w-full h-full rounded-xl'
                  : 'w-full max-w-2xl max-h-full rounded-2xl'
              } ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-900'
                  : 'bg-slate-900 border-slate-700/80 text-slate-100'
              }`}
            >
              {/* Modal Header */}
              <div
                className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-200'
                    : 'bg-slate-950/70 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      isLightMode
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-indigo-500/20 text-indigo-300'
                    }`}
                  >
                    <Send className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold">
                      {isEn
                        ? 'Send Team Message or Official Announcement'
                        : 'ارسال پیام تیمی یا اطلاعیه رسمی'}
                    </h3>
                    <p
                      className={`text-[11px] ${
                        isLightMode ? 'text-slate-500' : 'text-slate-400'
                      }`}
                    >
                      {isEn
                        ? 'Stored in PostgreSQL and delivered live via WebSocket'
                        : 'ذخیره‌سازی قطعی در PostgreSQL و تحویل فوری بلادرنگ'}
                    </p>
                  </div>
                </div>

                <ModalHeaderControls
                  onMaximizeToggle={() => setComposeMaximized((v) => !v)}
                  isMaximized={composeMaximized}
                  onMinimize={handleMinimizeCompose}
                  onClose={handleCloseCompose}
                  isLightMode={isLightMode}
                  isEn={isEn}
                />
              </div>

              {/* Modal Body */}
              <form
                onSubmit={handleSubmitCompose}
                className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5 flex flex-col gap-4"
              >
                {composeFeedback && (
                  <div
                    className={`px-3 py-2 rounded-lg border text-xs font-medium ${
                      composeFeedback.type === 'success'
                        ? isLightMode
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                        : isLightMode
                        ? 'bg-rose-50 border-rose-200 text-rose-800'
                        : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                    }`}
                  >
                    {composeFeedback.text}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Category */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold">
                        {isEn ? 'Message Type' : 'نوع ارسال'}
                      </label>
                      <FieldInfoTooltip
                        title={isEn ? 'Message Type' : 'نوع پیام یا اطلاعیه'}
                        whatIsIt={
                          isEn
                            ? 'Distinguishes regular team messages from official manager announcements.'
                            : 'تعیین می‌کند پیام به‌عنوان مکاتبه تیمی ارسال شود یا اطلاعیه رسمی مدیریتی.'
                        }
                        whyNeeded={
                          isEn
                            ? 'Helps recipients filter announcements into their dedicated folder.'
                            : 'باعث دسته‌بندی دقیق اطلاعیه‌ها در پوشه اختصاصی مدیر و اولویت‌بندی نمایش می‌شود.'
                        }
                        practicalExample={
                          isEn
                            ? 'Use Announcement for planned switch maintenance windows'
                            : 'برای زمان‌بندی خاموشی یا ارتقای سیستم از «اطلاعیه رسمی» استفاده کنید'
                        }
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </div>
                    <select
                      value={composeCategory}
                      onChange={(e) => {
                        const val = e.target.value as 'direct_message' | 'announcement';
                        setComposeCategory(val);
                        if (val === 'announcement' && canBroadcast) {
                          setComposeTargetType('all');
                        }
                      }}
                      className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-900'
                          : 'bg-slate-950 border-slate-700 text-white'
                      }`}
                    >
                      <option value="direct_message">
                        {isEn ? 'Direct / Team Message' : 'پیام مستقیم / تیمی'}
                      </option>
                      {canBroadcast && (
                        <option value="announcement">
                          {isEn ? 'Official Announcement' : 'اطلاعیه رسمی مدیر'}
                        </option>
                      )}
                    </select>
                  </div>

                  {/* Severity */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold">
                        {isEn ? 'Priority Level' : 'سطح اهمیت'}
                      </label>
                      <FieldInfoTooltip
                        title={isEn ? 'Priority Level' : 'سطح اهمیت و اولویت'}
                        whatIsIt={
                          isEn
                            ? 'Sets visual severity indicator and notification sorting priority.'
                            : 'درجه اهمیت و حساسیت پیام در صندوق گیرندگان را مشخص می‌کند.'
                        }
                        whyNeeded={
                          isEn
                            ? 'Critical notices stand out immediately for NOC & emergency operators.'
                            : 'در شرایط بحرانی یا قطعی شبکه، اپراتورها بلافاصله متوجه پیام می‌شوند.'
                        }
                        practicalExample={
                          isEn ? 'Warning for scheduled reboot; Critical for urgent security incident' : 'هشدار برای ریستارت زمان‌بندی‌شده، بحرانی برای رخداد امنیتی فوری'
                        }
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </div>
                    <select
                      value={composeSeverity}
                      onChange={(e) => setComposeSeverity(e.target.value as CommsSeverity)}
                      className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-900'
                          : 'bg-slate-950 border-slate-700 text-white'
                      }`}
                    >
                      <option value="info">{isEn ? 'Info (Standard)' : 'اطلاع‌رسانی (عادی)'}</option>
                      <option value="warning">{isEn ? 'Warning (Important)' : 'هشدار (مهم)'}</option>
                      <option value="critical">{isEn ? 'Critical (Urgent)' : 'بحرانی (فوری)'}</option>
                    </select>
                  </div>
                </div>

                {/* Target Audience */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold">
                      {isEn ? 'Target Audience' : 'گیرندگان'}
                    </label>
                    <FieldInfoTooltip
                      title={isEn ? 'Target Recipients' : 'انتخاب گیرندگان'}
                      whatIsIt={
                        isEn
                          ? 'Select individual users, an entire IT group, or broadcast to all panel users.'
                          : 'ارسال به کاربران مشخص، اعضای یک گروه کاربری یا کل کاربران فعال سامانه.'
                      }
                      whyNeeded={
                        isEn
                          ? 'Ensures sensitive operational directives reach only authorized personnel.'
                          : 'از شلوغی صندوق سایر واحدها جلوگیری کرده و پیام را دقیق به افراد مسئول می‌رساند.'
                      }
                      practicalExample={
                        isEn ? 'Select NOC Team group or specific System Admin' : 'انتخاب گروه کارشناسان شبکه یا شخص ادمین لینوکس'
                      }
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {(
                      [
                        { id: 'users' as const, labelEn: 'Specific Users', labelFa: 'کاربران مشخص', icon: User },
                        { id: 'group' as const, labelEn: 'User Group', labelFa: 'گروه کاربری', icon: Users },
                        ...(canBroadcast
                          ? [
                              {
                                id: 'all' as const,
                                labelEn: 'All Users',
                                labelFa: 'همه کاربران',
                                icon: Megaphone,
                              },
                            ]
                          : []),
                      ]
                    ).map((mode) => {
                      const IconComp = mode.icon;
                      const active = composeTargetType === mode.id;
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => {
                            setComposeTargetType(mode.id);
                            setComposeTargetIds([]);
                            setComposeRecipientQuery('');
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition ${
                            active
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : isLightMode
                              ? 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
                              : 'bg-white/5 border-white/15 text-slate-200 hover:bg-white/10'
                          }`}
                        >
                          <IconComp className="w-3.5 h-3.5" />
                          <span>{isEn ? mode.labelEn : mode.labelFa}</span>
                        </button>
                      );
                    })}
                  </div>

                  {composeTargetType !== 'all' && (
                    <div
                      className={`rounded-xl border overflow-hidden ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-200'
                          : 'bg-slate-950/70 border-slate-800'
                      }`}
                    >
                      {/* Live Search + Multi-Select Controls Bar */}
                      <div
                        className={`flex flex-wrap items-center gap-2 px-2.5 py-2 border-b ${
                          isLightMode
                            ? 'bg-white border-slate-200'
                            : 'bg-slate-900/70 border-slate-800'
                        }`}
                      >
                        <div className="relative flex-1 min-w-[180px]">
                          <Search
                            className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 ${
                              isRtl ? 'right-2.5' : 'left-2.5'
                            } ${isLightMode ? 'text-slate-400' : 'text-slate-500'}`}
                          />
                          <input
                            type="text"
                            value={composeRecipientQuery}
                            onChange={(e) => setComposeRecipientQuery(e.target.value)}
                            placeholder={
                              composeTargetType === 'users'
                                ? isEn
                                  ? 'Search users by name, username, or role...'
                                  : 'جستجوی کاربر با نام، نام کاربری یا نقش...'
                                : isEn
                                ? 'Search user groups...'
                                : 'جستجوی گروه کاربری...'
                            }
                            className={`w-full py-1.5 rounded-lg border text-xs outline-none transition ${
                              isRtl ? 'pr-8 pl-7' : 'pl-8 pr-7'
                            } ${
                              isLightMode
                                ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white'
                                : 'bg-slate-950 border-white/15 text-white placeholder:text-slate-500 focus:border-indigo-500'
                            }`}
                          />
                          {composeRecipientQuery && (
                            <button
                              type="button"
                              onClick={() => setComposeRecipientQuery('')}
                              className={`absolute top-1/2 -translate-y-1/2 ${
                                isRtl ? 'left-2' : 'right-2'
                              } text-slate-400 hover:text-slate-600 cursor-pointer`}
                              title={isEn ? 'Clear search' : 'پاک کردن جستجو'}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-[11px] shrink-0">
                          <span
                            className={`font-mono tabular-nums font-semibold px-2 py-1 rounded-md ${
                              composeTargetIds.length > 0
                                ? isLightMode
                                  ? 'bg-indigo-50 text-indigo-700'
                                  : 'bg-indigo-500/20 text-indigo-300'
                                : isLightMode
                                ? 'text-slate-500'
                                : 'text-slate-400'
                            }`}
                          >
                            {isEn
                              ? `${composeTargetIds.length} selected`
                              : `${composeTargetIds.length} انتخاب شده`}
                          </span>

                          {filteredSelectableOptions.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const visibleValues = filteredSelectableOptions.map(
                                  (o) => o.username || o.id
                                );
                                setComposeTargetIds((prev) =>
                                  Array.from(new Set([...prev, ...visibleValues]))
                                );
                              }}
                              className={`px-2 py-1 rounded-md border font-medium cursor-pointer transition ${
                                isLightMode
                                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                                  : 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-200'
                              }`}
                            >
                              {composeRecipientQuery.trim()
                                ? isEn
                                  ? 'Select Filtered'
                                  : 'انتخاب فیلترشده‌ها'
                                : isEn
                                ? 'Select All'
                                : 'انتخاب همه'}
                            </button>
                          )}

                          {composeTargetIds.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setComposeTargetIds([])}
                              className={`px-2 py-1 rounded-md border font-medium cursor-pointer transition ${
                                isLightMode
                                  ? 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700'
                                  : 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/30 text-rose-300'
                              }`}
                            >
                              {isEn ? 'Clear' : 'پاک کردن'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Selected Recipients Review Bar (Preserved Across Searches) */}
                      {selectedRecipientOptions.length > 0 && (
                        <div
                          className={`flex flex-wrap items-center gap-1.5 px-2.5 py-2 border-b max-h-20 overflow-y-auto custom-scrollbar ${
                            isLightMode
                              ? 'bg-indigo-50/40 border-slate-200'
                              : 'bg-indigo-500/5 border-slate-800'
                          }`}
                        >
                          {selectedRecipientOptions.map((opt) => {
                            const targetVal = opt.username || opt.id;
                            return (
                              <button
                                key={`sel:${opt.type}:${opt.id}`}
                                type="button"
                                onClick={() =>
                                  setComposeTargetIds((prev) =>
                                    prev.filter((x) => x !== targetVal)
                                  )
                                }
                                title={isEn ? 'Remove recipient' : 'حذف از گیرندگان'}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium cursor-pointer transition ${
                                  isLightMode
                                    ? 'bg-white border-indigo-200 text-indigo-800 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700'
                                    : 'bg-indigo-500/20 border-indigo-500/40 text-indigo-200 hover:bg-rose-500/20 hover:border-rose-500/40 hover:text-rose-200'
                                }`}
                              >
                                <span className="truncate max-w-[180px]">
                                  {isEn ? opt.labelEn || opt.label : opt.label}
                                </span>
                                <X className="w-3 h-3 shrink-0" />
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Directory Multi-Select Grid */}
                      <div className="max-h-40 overflow-y-auto custom-scrollbar p-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {recipientsLoading ? (
                          <p className="text-xs text-slate-400 p-2">
                            {isEn ? 'Loading directory...' : 'در حال دریافت فهرست...'}
                          </p>
                        ) : selectableOptions.length === 0 ? (
                          <p className="text-xs text-slate-400 p-2">
                            {isEn ? 'No entries available' : 'موردی یافت نشد'}
                          </p>
                        ) : filteredSelectableOptions.length === 0 ? (
                          <p className="text-xs text-slate-400 p-2 sm:col-span-2">
                            {isEn
                              ? `No matches found for "${composeRecipientQuery.trim()}"`
                              : `موردی مطابق با «${composeRecipientQuery.trim()}» یافت نشد.`}
                          </p>
                        ) : (
                          filteredSelectableOptions.map((opt) => {
                            const targetVal = opt.username || opt.id;
                            const checked = composeTargetIds.includes(targetVal);
                            return (
                              <label
                                key={`${opt.type}:${opt.id}`}
                                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition ${
                                  checked
                                    ? isLightMode
                                      ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                                      : 'bg-indigo-500/20 border-indigo-500/40 text-white'
                                    : isLightMode
                                    ? 'bg-white border-slate-200 text-slate-800 hover:bg-slate-100'
                                    : 'bg-white/5 border-transparent text-slate-300 hover:bg-white/10'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    setComposeTargetIds((prev) =>
                                      e.target.checked
                                        ? Array.from(new Set([...prev, targetVal]))
                                        : prev.filter((x) => x !== targetVal)
                                    );
                                  }}
                                  className="rounded accent-indigo-600 shrink-0"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="truncate font-medium">
                                    {isEn ? opt.labelEn || opt.label : opt.label}
                                  </div>
                                  {(opt.roleOrType || opt.username) && (
                                    <div
                                      className={`truncate text-[10px] ${
                                        isLightMode ? 'text-slate-500' : 'text-slate-400'
                                      }`}
                                    >
                                      {[opt.roleOrType, opt.username].filter(Boolean).join(' · ')}
                                    </div>
                                  )}
                                </div>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Title */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5">
                    {isEn ? 'Subject Title' : 'عنوان پیام'}
                  </label>
                  <input
                    type="text"
                    value={composeTitle}
                    onChange={(e) => setComposeTitle(e.target.value)}
                    placeholder={
                      isEn
                        ? 'Enter clear subject...'
                        : 'مثال: اطلاعیه زمان‌بندی ارتقای سوئیچ هسته...'
                    }
                    className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-900 focus:border-indigo-500'
                        : 'bg-slate-950 border-slate-700 text-white focus:border-indigo-500'
                    }`}
                  />
                </div>

                {/* Body */}
                <div>
                  <label className="block text-xs font-semibold mb-1.5">
                    {isEn ? 'Message Body' : 'متن کامل پیام'}
                  </label>
                  <textarea
                    rows={5}
                    value={composeBody}
                    onChange={(e) => setComposeBody(e.target.value)}
                    placeholder={
                      isEn ? 'Write message details...' : 'توضیحات کامل و جزئیات اجرایی...'
                    }
                    className={`w-full px-3 py-2 rounded-lg border text-xs outline-none resize-y ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-900 focus:border-indigo-500'
                        : 'bg-slate-950 border-slate-700 text-white focus:border-indigo-500'
                    }`}
                  />
                </div>

                {/* Requires Read Receipt */}
                <label
                  className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border text-xs cursor-pointer ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-800'
                      : 'bg-slate-950/60 border-slate-800 text-slate-200'
                  }`}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <input
                      type="checkbox"
                      checked={composeRequiresAck}
                      onChange={(e) => setComposeRequiresAck(e.target.checked)}
                      className="rounded accent-indigo-600"
                    />
                    <span>
                      {isEn
                        ? 'Require explicit read confirmation (Acknowledge Receipt)'
                        : 'الزام به ثبت تاییدیه مطالعه (Read Receipt) توسط گیرندگان'}
                    </span>
                  </span>
                  <FieldInfoTooltip
                    title={isEn ? 'Read Receipt Confirmation' : 'تاییدیه مطالعه پیام'}
                    whatIsIt={
                      isEn
                        ? 'Adds an explicit Acknowledge Receipt button and logs user confirmation in Audit Logs.'
                        : 'دکمه «تایید مطالعه و دریافت» را نمایش می‌دهد و زمان دقیق تایید هر کاربر را در لاگ ممیزی ثبت می‌کند.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Provides verifiable compliance proof that operators read critical SOPs or security warnings.'
                        : 'سند قطعی برای مدیر IT جهت اطمینان از رویت دستورالعمل‌های حیاتی توسط تیم.'
                    }
                    practicalExample={
                      isEn
                        ? 'Enable for emergency security patches or shift-handover instructions'
                        : 'برای اطلاعیه‌های پچ امنیتی یا تحویل شیفت بحرانی فعال شود'
                    }
                    isEn={isEn}
                    isLightMode={isLightMode}
                  />
                </label>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={handleCloseCompose}
                    className={`px-4 py-2 rounded-lg border text-xs font-medium cursor-pointer ${
                      isLightMode
                        ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                        : 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-200'
                    }`}
                  >
                    {isEn ? 'Cancel' : 'انصراف'}
                  </button>
                  <button
                    type="submit"
                    disabled={composeSending}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      {composeSending
                        ? isEn
                          ? 'Sending...'
                          : 'در حال ارسال...'
                        : isEn
                        ? 'Send Now'
                        : 'ارسال پیام'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
