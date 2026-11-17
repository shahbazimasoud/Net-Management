import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  MessageSquare,
  Hash,
  User,
  Users,
  Search,
  Send,
  Plus,
  X,
  Minus,
  ChevronDown,
  ChevronUp,
  Bell,
  BellOff,
  RefreshCw,
  Reply,
  ArrowUpRight,
  CornerDownRight,
  AlertCircle,
  AlertTriangle,
  Maximize2,
  Minimize2,
  ArrowLeft,
} from 'lucide-react';
import {
  CommsChannel,
  CommsMessage,
  CommsRecipientOption,
  CommsSeverity,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { isUserSuperAdmin } from '../../utils/rbac';
import {
  fetchChannelMessages,
  fetchCommsChannels,
  fetchCommsRecipients,
  openDirectCommsChannel,
  postChannelMessage,
  toggleCommsChannelMute,
} from '../../services/commsApi';
import { appDataCache } from '../../services/dataCache';

export interface FooterTeamChatDockProps {
  isEn: boolean;
  isLightMode: boolean;
  isRtl: boolean;
  liveRevision: number;
  onOpenInCenter: (channelId?: string) => void;
  onUnreadChanged?: () => void;
}

interface OpenChatTabState {
  channelId: string;
  isCollapsed: boolean;
  isExpandedSize: boolean;
}

interface FloatingChatBoxProps {
  channel: CommsChannel;
  isCollapsed: boolean;
  isExpandedSize: boolean;
  isEn: boolean;
  isLightMode: boolean;
  isRtl: boolean;
  canSend: boolean;
  liveRevision: number;
  currentUsername: string;
  onToggleCollapse: () => void;
  onToggleSize: () => void;
  onClose: () => void;
  onOpenInCenter: (channelId: string) => void;
  onChannelRead: (channelId: string) => void;
  onChannelUpdated: () => void;
}

const MAX_EXPANDED_WINDOWS_WIDE = 2;
const MAX_EXPANDED_WINDOWS_NARROW = 1;
const MAX_OPEN_TABS = 4;

function dedupeParenthesizedTitle(value?: string | null): string {
  const clean = (value || '').trim();
  if (!clean) return '';
  return clean.replace(/(\s*\([^)]+\))(\1)+$/gi, '$1').trim();
}

const FloatingChatBox: React.FC<FloatingChatBoxProps> = ({
  channel,
  isCollapsed,
  isExpandedSize,
  isEn,
  isLightMode,
  isRtl,
  canSend,
  liveRevision,
  currentUsername,
  onToggleCollapse,
  onToggleSize,
  onClose,
  onOpenInCenter,
  onChannelRead,
  onChannelUpdated,
}) => {
  const [messages, setMessages] = useState<CommsMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [draftBody, setDraftBody] = useState('');
  const [draftPriority, setDraftPriority] = useState<CommsSeverity>('info');
  const [replyTarget, setReplyTarget] = useState<CommsMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const channelTitle = dedupeParenthesizedTitle(
    isEn ? channel.nameEn || channel.name : channel.name
  );

  const loadMessages = useCallback(
    async (forceRefresh = false) => {
      if (isCollapsed) return;
      if (messages.length === 0) setLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetchChannelMessages(channel.id, { limit: 80, forceRefresh });
        setMessages(res.messages || []);
        if (channel.unreadCount > 0) {
          onChannelRead(channel.id);
        }
      } catch (err: any) {
        setErrorMsg(
          err?.message || (isEn ? 'Failed to load messages' : 'خطا در بارگذاری پیام‌ها')
        );
      } finally {
        setLoading(false);
      }
    },
    [channel.id, channel.unreadCount, isCollapsed, isEn, messages.length, onChannelRead]
  );

  useEffect(() => {
    if (!isCollapsed) {
      loadMessages(liveRevision > 0);
    }
  }, [channel.id, isCollapsed, liveRevision]);

  useEffect(() => {
    if (!isCollapsed) {
      threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isCollapsed, channel.id]);

  const formatTime = (iso?: string | null) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString(isEn ? 'en-US' : 'fa-IR', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!draftBody.trim() || sending || !canSend) return;
    setSending(true);
    setErrorMsg(null);
    try {
      const res = await postChannelMessage(channel.id, {
        body: draftBody.trim(),
        priority: draftPriority,
        replyToMessageId: replyTarget?.id || null,
      });
      setMessages((prev) =>
        prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]
      );
      setDraftBody('');
      setDraftPriority('info');
      setReplyTarget(null);
      onChannelUpdated();
    } catch (err: any) {
      setErrorMsg(err?.message || (isEn ? 'Failed to send message' : 'خطا در ارسال پیام'));
    } finally {
      setSending(false);
    }
  };

  const handleToggleMute = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await toggleCommsChannelMute(channel.id, !channel.isMuted);
      onChannelUpdated();
    } catch {}
  };

  const isSelf = (msg: CommsMessage) => {
    const me = currentUsername.trim().toLowerCase();
    return me !== '' && (msg.senderUsername || '').toLowerCase() === me;
  };

  // Collapsed LinkedIn-style docked tab sitting right on top of the footer bar
  if (isCollapsed) {
    return (
      <div
        className={`pointer-events-auto w-52 sm:w-56 h-9 rounded-t-xl border border-b-0 shadow-xl flex items-center justify-between gap-2 px-2.5 cursor-pointer transition-colors backdrop-blur-xl ${
          isLightMode
            ? 'bg-white/95 hover:bg-slate-50 border-slate-300 text-slate-900 shadow-slate-300/60'
            : 'bg-slate-900/95 hover:bg-slate-800/95 border-white/15 text-slate-100 shadow-black/70'
        }`}
        onClick={onToggleCollapse}
        title={isEn ? `Expand chat: ${channelTitle}` : `باز کردن گفتگو: ${channelTitle}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div
            className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
              channel.channelType === 'direct'
                ? isLightMode
                  ? 'bg-sky-50 text-sky-600'
                  : 'bg-sky-500/15 text-sky-300'
                : isLightMode
                ? 'bg-indigo-50 text-indigo-600'
                : 'bg-indigo-500/15 text-indigo-300'
            }`}
          >
            {channel.channelType === 'direct' ? (
              <User className="w-3 h-3" />
            ) : (
              <Hash className="w-3 h-3" />
            )}
          </div>
          <span className="text-xs font-semibold truncate">{channelTitle}</span>
          {channel.unreadCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-indigo-600 text-white text-[10px] font-mono tabular-nums font-bold shrink-0">
              {channel.unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse();
            }}
            className={`p-1 rounded transition cursor-pointer ${
              isLightMode
                ? 'text-slate-500 hover:bg-slate-200 hover:text-slate-900'
                : 'text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
            title={isEn ? 'Expand' : 'باز کردن'}
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className={`p-1 rounded transition cursor-pointer ${
              isLightMode
                ? 'text-slate-500 hover:bg-rose-50 hover:text-rose-600'
                : 'text-slate-400 hover:bg-rose-500/15 hover:text-rose-400'
            }`}
            title={isEn ? 'Close chat' : 'بستن گفتگو'}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // Expanded LinkedIn-style floating chat box anchored on top of the footer bar
  return (
    <div
      className={`pointer-events-auto flex flex-col rounded-t-2xl border border-b-0 shadow-2xl overflow-hidden backdrop-blur-2xl transition-all duration-150 ${
        isExpandedSize
          ? 'w-[360px] sm:w-[410px] h-[480px] max-h-[calc(100dvh-64px)]'
          : 'w-80 sm:w-[336px] h-[400px] max-h-[calc(100dvh-64px)]'
      } ${
        isLightMode
          ? 'bg-white/95 border-slate-300 text-slate-900 shadow-slate-400/50'
          : 'bg-slate-900/95 border-white/15 text-slate-100 shadow-[0_-8px_36px_rgba(0,0,0,0.7)]'
      }`}
    >
      {/* LinkedIn-style Chat Header */}
      <div
        onClick={onToggleCollapse}
        className={`px-3 py-2.5 border-b flex items-center justify-between gap-2 cursor-pointer shrink-0 ${
          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/75 border-white/10'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center border shrink-0 ${
              channel.channelType === 'direct'
                ? isLightMode
                  ? 'bg-sky-50 border-sky-200 text-sky-600'
                  : 'bg-sky-500/15 border-sky-500/30 text-sky-300'
                : isLightMode
                ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
            }`}
          >
            {channel.channelType === 'direct' ? (
              <User className="w-3.5 h-3.5" />
            ) : (
              <Hash className="w-3.5 h-3.5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold truncate">{channelTitle}</div>
            <div
              className={`text-[10.5px] flex items-center gap-1.5 truncate ${
                isLightMode ? 'text-slate-500' : 'text-slate-400'
              }`}
            >
              <span>
                {channel.channelType === 'direct'
                  ? isEn
                    ? 'Direct Chat'
                    : 'گفتگوی مستقیم'
                  : isEn
                  ? 'Team Channel'
                  : 'کانال گروهی'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {isEn ? `${channel.memberCount} members` : `${channel.memberCount} عضو`}
              </span>
            </div>
          </div>
        </div>

        <div
          className="flex items-center gap-0.5 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setShowMembers((v) => !v)}
            className={`p-1 rounded-md transition cursor-pointer ${
              showMembers
                ? isLightMode
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-indigo-500/20 text-indigo-300'
                : isLightMode
                ? 'text-slate-500 hover:bg-slate-200 hover:text-slate-900'
                : 'text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
            title={isEn ? 'Members' : 'اعضا'}
          >
            <Users className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleToggleMute}
            className={`p-1 rounded-md transition cursor-pointer ${
              isLightMode
                ? 'text-slate-500 hover:bg-slate-200 hover:text-slate-900'
                : 'text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
            title={
              channel.isMuted
                ? isEn
                  ? 'Unmute'
                  : 'لغو سکوت'
                : isEn
                ? 'Mute'
                : 'بی‌صدا'
            }
          >
            {channel.isMuted ? (
              <BellOff className="w-3.5 h-3.5 text-amber-500" />
            ) : (
              <Bell className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => onOpenInCenter(channel.id)}
            className={`p-1 rounded-md transition cursor-pointer ${
              isLightMode
                ? 'text-slate-500 hover:bg-slate-200 hover:text-indigo-700'
                : 'text-slate-400 hover:bg-white/10 hover:text-cyan-300'
            }`}
            title={isEn ? 'Open in Team Chat Center' : 'باز کردن در صفحه کامل چت تیمی'}
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggleSize}
            className={`p-1 rounded-md transition cursor-pointer ${
              isLightMode
                ? 'text-slate-500 hover:bg-slate-200 hover:text-slate-900'
                : 'text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
            title={
              isExpandedSize
                ? isEn
                  ? 'Compact size'
                  : 'اندازه کوچک‌تر'
                : isEn
                ? 'Larger size'
                : 'بزرگ‌تر کردن کادر'
            }
          >
            {isExpandedSize ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={onToggleCollapse}
            className={`p-1 rounded-md transition cursor-pointer ${
              isLightMode
                ? 'text-slate-500 hover:bg-slate-200 hover:text-slate-900'
                : 'text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
            title={isEn ? 'Minimize to footer bar' : 'جمع کردن روی نوار فوتر'}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className={`p-1 rounded-md transition cursor-pointer ${
              isLightMode
                ? 'text-slate-500 hover:bg-rose-50 hover:text-rose-600'
                : 'text-slate-400 hover:bg-rose-500/15 hover:text-rose-400'
            }`}
            title={isEn ? 'Close' : 'بستن'}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Optional Members Bar */}
      {showMembers && (
        <div
          className={`px-3 py-1.5 border-b text-[11px] flex flex-wrap items-center gap-1.5 shrink-0 max-h-20 overflow-y-auto ${
            isLightMode
              ? 'bg-slate-50 border-slate-200 text-slate-600'
              : 'bg-slate-950/50 border-white/10 text-slate-300'
          }`}
        >
          <span className="font-semibold">{isEn ? 'Members:' : 'اعضا:'}</span>
          {(channel.members || []).map((m, idx) => (
            <span key={m.userId || m.username} className="inline-flex items-center gap-1">
              {idx > 0 && <span aria-hidden="true">·</span>}
              <span>{m.fullName || m.username}</span>
            </span>
          ))}
        </div>
      )}

      {/* Error Strip */}
      {errorMsg && (
        <div
          className={`px-3 py-1.5 text-[11px] border-b flex items-center justify-between gap-2 shrink-0 ${
            isLightMode
              ? 'bg-rose-50 border-rose-200 text-rose-700'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
          }`}
        >
          <span className="truncate">{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-[10px] underline shrink-0 cursor-pointer"
          >
            {isEn ? 'Dismiss' : 'بستن'}
          </button>
        </div>
      )}

      {/* Message Stream */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-2.5">
        {loading && messages.length === 0 ? (
          <div className="space-y-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className={`h-11 w-3/4 rounded-xl animate-pulse ${
                  isLightMode ? 'bg-slate-100' : 'bg-white/5'
                }`}
              />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center py-8 text-center px-3">
            <MessageSquare
              className={`w-7 h-7 mb-2 ${isLightMode ? 'text-slate-300' : 'text-slate-600'}`}
            />
            <p className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn
                ? 'No messages yet. Say hello below.'
                : 'هنوز پیامی ثبت نشده است. اولین پیام را بنویسید.'}
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const self = isSelf(msg);
            const senderDisplay = dedupeParenthesizedTitle(
              msg.senderFullName || msg.senderUsername
            );
            return (
              <div
                key={msg.id}
                className={`group flex flex-col ${self ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl border px-3 py-2 text-xs ${
                    self
                      ? isLightMode
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-indigo-600/90 border-indigo-500 text-white'
                      : isLightMode
                      ? 'bg-slate-100 border-slate-200 text-slate-900'
                      : 'bg-slate-800/80 border-white/10 text-slate-100'
                  }`}
                >
                  <div
                    className={`flex items-center justify-between gap-2.5 mb-0.5 text-[10.5px] ${
                      self
                        ? 'text-indigo-100'
                        : isLightMode
                        ? 'text-slate-500'
                        : 'text-slate-400'
                    }`}
                  >
                    <span className="font-semibold truncate flex items-center gap-1">
                      <span>{self ? (isEn ? 'You' : 'شما') : senderDisplay}</span>
                      {msg.priority === 'critical' && (
                        <AlertCircle className="w-3 h-3 text-rose-400 inline" />
                      )}
                      {msg.priority === 'warning' && (
                        <AlertTriangle className="w-3 h-3 text-amber-400 inline" />
                      )}
                    </span>
                    <span className="font-mono tabular-nums shrink-0">
                      {formatTime(msg.createdAt)}
                    </span>
                  </div>

                  {msg.replyToPreview && (
                    <div
                      className={`mb-1.5 px-2 py-1 rounded-lg border text-[10.5px] ${
                        self
                          ? 'bg-indigo-700/60 border-indigo-400/40 text-indigo-100'
                          : isLightMode
                          ? 'bg-white border-slate-200 text-slate-600'
                          : 'bg-slate-950/60 border-white/10 text-slate-300'
                      }`}
                    >
                      <div className="font-semibold flex items-center gap-1">
                        <CornerDownRight className="w-2.5 h-2.5" />
                        <span>{msg.replyToPreview.senderName}</span>
                      </div>
                      <p className="truncate opacity-90">{msg.replyToPreview.body}</p>
                    </div>
                  )}

                  <div className="whitespace-pre-wrap break-words leading-relaxed">
                    {isEn ? msg.bodyEn || msg.body : msg.body}
                  </div>
                </div>

                {canSend && (
                  <button
                    type="button"
                    onClick={() => setReplyTarget(msg)}
                    className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 cursor-pointer ${
                      isLightMode
                        ? 'text-slate-500 hover:text-indigo-700'
                        : 'text-slate-400 hover:text-indigo-300'
                    }`}
                  >
                    <Reply className="w-2.5 h-2.5" />
                    <span>{isEn ? 'Reply' : 'پاسخ'}</span>
                  </button>
                )}
              </div>
            );
          })
        )}
        <div ref={threadEndRef} />
      </div>

      {/* Composer */}
      {canSend ? (
        <form
          onSubmit={handleSend}
          className={`p-2.5 border-t flex flex-col gap-1.5 shrink-0 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-white/10'
          }`}
        >
          {replyTarget && (
            <div
              className={`flex items-center justify-between gap-2 px-2 py-1 rounded-lg border text-[10.5px] ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-600'
                  : 'bg-slate-900 border-white/10 text-slate-300'
              }`}
            >
              <span className="truncate">
                {isEn ? 'Replying to' : 'پاسخ به'}{' '}
                <b>{replyTarget.senderFullName || replyTarget.senderUsername}</b>:{' '}
                {replyTarget.body}
              </span>
              <button
                type="button"
                onClick={() => setReplyTarget(null)}
                className="text-slate-400 hover:text-rose-400 cursor-pointer shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          <div className="flex items-end gap-1.5">
            <select
              value={draftPriority}
              onChange={(e) => setDraftPriority(e.target.value as CommsSeverity)}
              className={`h-8 px-1.5 rounded-lg border text-[11px] outline-none cursor-pointer shrink-0 ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-700'
                  : 'bg-slate-900 border-white/15 text-slate-200'
              }`}
              title={isEn ? 'Priority' : 'اولویت'}
            >
              <option value="info">{isEn ? 'Info' : 'عادی'}</option>
              <option value="warning">{isEn ? 'Warn' : 'هشدار'}</option>
              <option value="critical">{isEn ? 'Crit' : 'بحرانی'}</option>
            </select>

            <textarea
              rows={1}
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={
                isEn ? 'Write a message... (Enter to send)' : 'پیام خود را بنویسید... (Enter برای ارسال)'
              }
              className={`flex-1 min-w-0 py-1.5 px-2.5 rounded-lg border text-xs outline-none resize-none max-h-20 ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500'
                  : 'bg-slate-900 border-white/15 text-slate-100 placeholder:text-slate-500 focus:border-indigo-400'
              }`}
            />

            <button
              type="submit"
              disabled={!draftBody.trim() || sending}
              className="h-8 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white flex items-center justify-center cursor-pointer transition shrink-0"
              title={isEn ? 'Send' : 'ارسال'}
            >
              <Send className={`w-3.5 h-3.5 ${isRtl ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </form>
      ) : (
        <div
          className={`px-3 py-2 border-t text-[11px] text-center shrink-0 ${
            isLightMode
              ? 'bg-slate-50 border-slate-200 text-slate-500'
              : 'bg-slate-950/50 border-white/10 text-slate-400'
          }`}
        >
          {isEn
            ? 'Read-only access (sending requires RBAC communications permission).'
            : 'دسترسی فقط خواندنی (ارسال پیام نیازمند مجوز ارتباطات است).'}
        </div>
      )}
    </div>
  );
};

export const FooterTeamChatDock: React.FC<FooterTeamChatDockProps> = ({
  isEn,
  isLightMode,
  isRtl,
  liveRevision,
  onOpenInCenter,
  onUnreadChanged,
}) => {
  const { user, effectivePolicy } = useAuth();
  const isSuperAdmin = isUserSuperAdmin(user, effectivePolicy);
  const canSend =
    isSuperAdmin ||
    Boolean(effectivePolicy?.canSendCommunications) ||
    Boolean(effectivePolicy?.canSendAnnouncements);

  const optimisticChannels = appDataCache.getOptimistic<CommsChannel[]>('comms:channels');
  const [channels, setChannels] = useState<CommsChannel[]>(optimisticChannels || []);
  const [channelsLoading, setChannelsLoading] = useState<boolean>(false);
  const [listError, setListError] = useState<string | null>(null);

  const [isListOpen, setIsListOpen] = useState(false);
  const [listFilter, setListFilter] = useState<'all' | 'direct' | 'group'>('all');
  const [listSearch, setListSearch] = useState('');

  // Inline Quick New Direct Chat Picker inside drawer
  const [isNewChatMode, setIsNewChatMode] = useState(false);
  const [recipients, setRecipients] = useState<CommsRecipientOption[]>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [startingChatUserId, setStartingChatUserId] = useState<string | null>(null);

  // LinkedIn-style open conversation tabs & floating boxes
  const [openTabs, setOpenTabs] = useState<OpenChatTabState[]>([]);

  const loadChannels = useCallback(async (forceRefresh = false) => {
    if (channels.length === 0) setChannelsLoading(true);
    setListError(null);
    try {
      const list = await fetchCommsChannels(forceRefresh);
      setChannels(list);
    } catch (err: any) {
      setListError(
        err?.message || (isEn ? 'Failed to load team chats' : 'خطا در دریافت لیست چت‌ها')
      );
    } finally {
      setChannelsLoading(false);
    }
  }, [channels.length, isEn]);

  // Initial load + live WebSocket sync
  useEffect(() => {
    loadChannels(liveRevision > 0);
  }, [liveRevision]);

  useEffect(() => {
    if (!isListOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsListOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isListOpen]);

  const totalChannelUnread = useMemo(
    () => channels.reduce((sum, ch) => sum + (Number(ch.unreadCount) || 0), 0),
    [channels]
  );

  const filteredChannels = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    return channels.filter((ch) => {
      if (listFilter === 'direct' && ch.channelType !== 'direct') return false;
      if (listFilter === 'group' && ch.channelType === 'direct') return false;
      if (!q) return true;
      const nameFa = (ch.name || '').toLowerCase();
      const nameEn = (ch.nameEn || '').toLowerCase();
      const preview = (ch.lastMessagePreview || '').toLowerCase();
      return nameFa.includes(q) || nameEn.includes(q) || preview.includes(q);
    });
  }, [channels, listFilter, listSearch]);

  const openChatWindow = useCallback((channelId: string) => {
    setOpenTabs((prev) => {
      const maxExpanded =
        typeof window !== 'undefined' && window.innerWidth >= 1200
          ? MAX_EXPANDED_WINDOWS_WIDE
          : MAX_EXPANDED_WINDOWS_NARROW;

      const existing = prev.find((t) => t.channelId === channelId);
      let nextList: OpenChatTabState[];

      if (existing) {
        nextList = prev.map((t) =>
          t.channelId === channelId ? { ...t, isCollapsed: false } : t
        );
      } else {
        const added: OpenChatTabState = {
          channelId,
          isCollapsed: false,
          isExpandedSize: false,
        };
        nextList = [added, ...prev].slice(0, MAX_OPEN_TABS);
      }

      // Enforce maxExpanded open popovers simultaneously (keeping clicked chat expanded)
      let expandedCount = 0;
      return nextList.map((t) => {
        if (t.channelId === channelId) {
          expandedCount += 1;
          return { ...t, isCollapsed: false };
        }
        if (!t.isCollapsed) {
          if (expandedCount < maxExpanded) {
            expandedCount += 1;
            return t;
          }
          return { ...t, isCollapsed: true };
        }
        return t;
      });
    });
  }, []);

  const toggleTabCollapse = useCallback((channelId: string) => {
    setOpenTabs((prev) => {
      const target = prev.find((t) => t.channelId === channelId);
      if (!target) return prev;
      const willExpand = target.isCollapsed;
      if (!willExpand) {
        return prev.map((t) =>
          t.channelId === channelId ? { ...t, isCollapsed: true } : t
        );
      }
      const maxExpanded =
        typeof window !== 'undefined' && window.innerWidth >= 1200
          ? MAX_EXPANDED_WINDOWS_WIDE
          : MAX_EXPANDED_WINDOWS_NARROW;
      let expandedCount = 1;
      return prev.map((t) => {
        if (t.channelId === channelId) return { ...t, isCollapsed: false };
        if (!t.isCollapsed) {
          if (expandedCount < maxExpanded) {
            expandedCount += 1;
            return t;
          }
          return { ...t, isCollapsed: true };
        }
        return t;
      });
    });
  }, []);

  const toggleTabSize = useCallback((channelId: string) => {
    setOpenTabs((prev) =>
      prev.map((t) =>
        t.channelId === channelId ? { ...t, isExpandedSize: !t.isExpandedSize } : t
      )
    );
  }, []);

  const closeTab = useCallback((channelId: string) => {
    setOpenTabs((prev) => prev.filter((t) => t.channelId !== channelId));
  }, []);

  const handleChannelRead = useCallback(
    (channelId: string) => {
      setChannels((prev) =>
        prev.map((c) => (c.id === channelId ? { ...c, unreadCount: 0 } : c))
      );
      onUnreadChanged?.();
    },
    [onUnreadChanged]
  );

  const handleOpenNewChatPicker = async () => {
    setIsNewChatMode(true);
    setRecipientSearch('');
    if (recipients.length === 0) {
      setRecipientsLoading(true);
      try {
        const opts = await fetchCommsRecipients();
        setRecipients(opts);
      } catch {}
      setRecipientsLoading(false);
    }
  };

  const userRecipients = useMemo(() => {
    const me = (user?.username || '').toLowerCase();
    const q = recipientSearch.trim().toLowerCase();
    return recipients.filter((r) => {
      if (r.type !== 'user') return false;
      if ((r.username || '').toLowerCase() === me) return false;
      if (!q) return true;
      return (
        (r.label || '').toLowerCase().includes(q) ||
        (r.labelEn || '').toLowerCase().includes(q) ||
        (r.username || '').toLowerCase().includes(q)
      );
    });
  }, [recipients, recipientSearch, user?.username]);

  const handleStartDirectChat = async (targetUserId: string) => {
    setStartingChatUserId(targetUserId);
    setListError(null);
    try {
      const res = await openDirectCommsChannel(targetUserId);
      setIsNewChatMode(false);
      await loadChannels(true);
      openChatWindow(res.channel.id);
    } catch (err: any) {
      setListError(
        err?.message || (isEn ? 'Failed to start direct chat' : 'خطا در شروع گفتگوی مستقیم')
      );
    } finally {
      setStartingChatUserId(null);
    }
  };

  const formatListTime = (iso?: string | null) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString(isEn ? 'en-US' : 'fa-IR', {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  };

  return (
    <>
      {/* 1. Footer Trigger Button (Sits directly inside <footer> right beside Tools) */}
      <button
        id="footer-team-chat-button"
        type="button"
        onClick={() => {
          const next = !isListOpen;
          setIsListOpen(next);
          if (next) loadChannels(true);
        }}
        className={`px-2 py-0.5 rounded flex items-center gap-1.5 font-mono text-[11px] transition cursor-pointer border shrink-0 ${
          isListOpen || openTabs.length > 0
            ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow-[0_0_10px_rgba(99,102,241,0.3)]'
            : 'bg-white/5 hover:bg-white/10 text-slate-300 hover:text-indigo-300 border-white/10'
        }`}
        title={isEn ? 'Quick Team Chat & Channels' : 'دسترسی سریع چت و کانال‌های تیمی'}
      >
        <MessageSquare className="w-3 h-3 text-indigo-400" />
        <span className="font-bold tracking-wide">
          {isEn ? 'chat' : 'چت تیمی'}
        </span>
        {totalChannelUnread > 0 && (
          <span className="px-1 py-0.2 rounded-full bg-indigo-600 text-white text-[9.5px] font-bold tabular-nums leading-none">
            {totalChannelUnread > 99 ? '99+' : totalChannelUnread}
          </span>
        )}
        <ChevronUp
          className={`w-3 h-3 transition-transform duration-200 ${
            isListOpen ? 'rotate-180 text-indigo-300' : 'text-slate-400'
          }`}
        />
      </button>

      {/* 2. LinkedIn-style Docked Conversation Tabs, Floating Windows & Conversations List Drawer */}
      {(isListOpen || openTabs.length > 0) &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            id="linkedin-footer-chat-dock"
            dir={isRtl ? 'rtl' : 'ltr'}
            className={`fixed bottom-8 ${
              isRtl ? 'left-3 sm:left-4' : 'right-3 sm:right-4'
            } flex-row z-[999992] flex items-end gap-2.5 max-w-[calc(100vw-24px)] pointer-events-none select-none`}
          >
            {/* Open Conversation Tabs & Popover Windows (ordered inward from the drawer) */}
            {openTabs.map((tab) => {
              const ch = channels.find((c) => c.id === tab.channelId);
              if (!ch) return null;
              return (
                <FloatingChatBox
                  key={tab.channelId}
                  channel={ch}
                  isCollapsed={tab.isCollapsed}
                  isExpandedSize={tab.isExpandedSize}
                  isEn={isEn}
                  isLightMode={isLightMode}
                  isRtl={isRtl}
                  canSend={canSend}
                  liveRevision={liveRevision}
                  currentUsername={user?.username || ''}
                  onToggleCollapse={() => toggleTabCollapse(tab.channelId)}
                  onToggleSize={() => toggleTabSize(tab.channelId)}
                  onClose={() => closeTab(tab.channelId)}
                  onOpenInCenter={(id) => {
                    onOpenInCenter(id);
                  }}
                  onChannelRead={handleChannelRead}
                  onChannelUpdated={() => {
                    loadChannels(true);
                    onUnreadChanged?.();
                  }}
                />
              );
            })}

            {/* LinkedIn-style Main Messaging List Drawer */}
            {isListOpen && (
              <div
                className={`pointer-events-auto w-80 sm:w-[330px] h-[440px] max-h-[calc(100dvh-64px)] rounded-t-2xl border border-b-0 shadow-2xl flex flex-col overflow-hidden backdrop-blur-2xl animate-in fade-in slide-in-from-bottom-2 duration-150 ${
                  isLightMode
                    ? 'bg-white/95 border-slate-300 text-slate-900 shadow-slate-400/50'
                    : 'bg-slate-950/95 border-white/15 text-slate-100 shadow-[0_-10px_40px_rgba(0,0,0,0.8)]'
                }`}
              >
                {/* Drawer Header */}
                <div
                  className={`px-3.5 py-2.5 border-b flex items-center justify-between gap-2 shrink-0 ${
                    isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/80 border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isNewChatMode ? (
                      <button
                        type="button"
                        onClick={() => setIsNewChatMode(false)}
                        className={`p-1 rounded-lg transition cursor-pointer ${
                          isLightMode
                            ? 'hover:bg-slate-200 text-slate-600'
                            : 'hover:bg-white/10 text-slate-300'
                        }`}
                        title={isEn ? 'Back' : 'بازگشت'}
                      >
                        <ArrowLeft className={`w-4 h-4 ${isRtl ? 'rotate-180' : ''}`} />
                      </button>
                    ) : (
                      <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-600 flex items-center justify-center text-white shadow-xs shrink-0">
                        <MessageSquare className="w-3.5 h-3.5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold truncate">
                        {isNewChatMode
                          ? isEn
                            ? 'Start Direct Chat'
                            : 'شروع گفتگوی مستقیم'
                          : isEn
                          ? 'Team Chat & Channels'
                          : 'چت و کانال‌های تیمی'}
                      </h4>
                      <p
                        className={`text-[10.5px] truncate ${
                          isLightMode ? 'text-slate-500' : 'text-slate-400'
                        }`}
                      >
                        {isNewChatMode
                          ? isEn
                            ? 'Select an operator or admin'
                            : 'انتخاب همکار برای گفتگو'
                          : isEn
                          ? `${channels.length} conversations · ${totalChannelUnread} unread`
                          : `${channels.length} گفتگو · ${totalChannelUnread} خوانده‌نشده`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    {!isNewChatMode && canSend && (
                      <button
                        type="button"
                        onClick={handleOpenNewChatPicker}
                        className={`p-1.5 rounded-lg transition cursor-pointer ${
                          isLightMode
                            ? 'text-indigo-600 hover:bg-indigo-50'
                            : 'text-indigo-300 hover:bg-indigo-500/15'
                        }`}
                        title={isEn ? 'New direct chat' : 'گفتگوی مستقیم جدید'}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {!isNewChatMode && (
                      <button
                        type="button"
                        onClick={() => loadChannels(true)}
                        className={`p-1.5 rounded-lg transition cursor-pointer ${
                          isLightMode
                            ? 'text-slate-500 hover:bg-slate-200 hover:text-slate-900'
                            : 'text-slate-400 hover:bg-white/10 hover:text-white'
                        }`}
                        title={isEn ? 'Refresh' : 'تازه‌سازی'}
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${channelsLoading ? 'animate-spin' : ''}`}
                        />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setIsListOpen(false);
                        onOpenInCenter();
                      }}
                      className={`p-1.5 rounded-lg transition cursor-pointer ${
                        isLightMode
                          ? 'text-slate-500 hover:bg-slate-200 hover:text-indigo-700'
                          : 'text-slate-400 hover:bg-white/10 hover:text-cyan-300'
                      }`}
                      title={isEn ? 'Open full Team Chat & Channels' : 'باز کردن صفحه کامل چت و کانال‌ها'}
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsListOpen(false)}
                      className={`p-1.5 rounded-lg transition cursor-pointer ${
                        isLightMode
                          ? 'text-slate-500 hover:bg-slate-200 hover:text-slate-900'
                          : 'text-slate-400 hover:bg-white/10 hover:text-white'
                      }`}
                      title={isEn ? 'Close list' : 'بستن لیست'}
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {isNewChatMode ? (
                  /* Quick New Direct Chat Picker */
                  <div className="flex-1 min-h-0 flex flex-col">
                    <div
                      className={`p-2.5 border-b shrink-0 ${
                        isLightMode ? 'border-slate-200' : 'border-white/10'
                      }`}
                    >
                      <div className="relative">
                        <Search
                          className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 ${
                            isRtl ? 'right-2.5' : 'left-2.5'
                          } ${isLightMode ? 'text-slate-400' : 'text-slate-500'}`}
                        />
                        <input
                          type="text"
                          value={recipientSearch}
                          onChange={(e) => setRecipientSearch(e.target.value)}
                          placeholder={isEn ? 'Find user by name...' : 'جستجوی نام کاربر...'}
                          className={`w-full py-1.5 rounded-lg border text-xs outline-none ${
                            isRtl ? 'pr-8 pl-2.5' : 'pl-8 pr-2.5'
                          } ${
                            isLightMode
                              ? 'bg-slate-50 border-slate-300 text-slate-900'
                              : 'bg-slate-900 border-white/15 text-slate-100'
                          }`}
                          autoFocus
                        />
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                      {recipientsLoading ? (
                        <div className="space-y-2 p-1">
                          {Array.from({ length: 4 }).map((_, i) => (
                            <div
                              key={i}
                              className={`h-10 rounded-xl animate-pulse ${
                                isLightMode ? 'bg-slate-100' : 'bg-white/5'
                              }`}
                            />
                          ))}
                        </div>
                      ) : userRecipients.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-400">
                          {isEn ? 'No matching users found.' : 'کاربری یافت نشد.'}
                        </div>
                      ) : (
                        userRecipients.map((u) => {
                          const targetVal = u.username || u.id;
                          const displayLabel = dedupeParenthesizedTitle(
                            isEn ? u.labelEn || u.label : u.label
                          );
                          const sub = [u.roleOrType, u.username].filter(Boolean).join(' · ');
                          return (
                            <button
                              key={u.id}
                              type="button"
                              disabled={startingChatUserId === targetVal}
                              onClick={() => handleStartDirectChat(targetVal)}
                              className={`w-full flex items-center gap-2.5 p-2 rounded-xl text-start transition cursor-pointer disabled:opacity-50 ${
                                isLightMode
                                  ? 'hover:bg-indigo-50 text-slate-800'
                                  : 'hover:bg-white/[0.06] text-slate-100'
                              }`}
                            >
                              <div
                                className={`w-7 h-7 rounded-lg flex items-center justify-center border shrink-0 ${
                                  isLightMode
                                    ? 'bg-sky-50 border-sky-200 text-sky-600'
                                    : 'bg-sky-500/15 border-sky-500/30 text-sky-300'
                                }`}
                              >
                                <User className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-semibold truncate">{displayLabel}</div>
                                {sub && (
                                  <div
                                    className={`text-[10.5px] truncate ${
                                      isLightMode ? 'text-slate-500' : 'text-slate-400'
                                    }`}
                                  >
                                    {sub}
                                  </div>
                                )}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : (
                  /* Conversations List */
                  <>
                    {/* Search + Segmented Filter */}
                    <div
                      className={`p-2.5 border-b space-y-2 shrink-0 ${
                        isLightMode ? 'border-slate-200' : 'border-white/10'
                      }`}
                    >
                      <div className="relative">
                        <Search
                          className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 ${
                            isRtl ? 'right-2.5' : 'left-2.5'
                          } ${isLightMode ? 'text-slate-400' : 'text-slate-500'}`}
                        />
                        <input
                          type="text"
                          value={listSearch}
                          onChange={(e) => setListSearch(e.target.value)}
                          placeholder={
                            isEn
                              ? 'Search messages or channels...'
                              : 'جستجو در چت‌ها و کانال‌ها...'
                          }
                          className={`w-full py-1.5 rounded-lg border text-xs outline-none ${
                            isRtl ? 'pr-8 pl-2.5' : 'pl-8 pr-2.5'
                          } ${
                            isLightMode
                              ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400'
                              : 'bg-slate-900 border-white/15 text-slate-100 placeholder:text-slate-500'
                          }`}
                        />
                      </div>

                      <div
                        className={`flex items-center gap-1 p-0.5 rounded-lg ${
                          isLightMode ? 'bg-slate-100' : 'bg-white/5'
                        }`}
                      >
                        {(
                          [
                            { id: 'all', en: 'All', fa: 'همه' },
                            { id: 'direct', en: 'Direct', fa: 'مستقیم' },
                            { id: 'group', en: 'Channels', fa: 'کانال‌ها' },
                          ] as const
                        ).map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setListFilter(tab.id)}
                            className={`flex-1 py-1 px-2 rounded-md text-[11px] font-semibold transition cursor-pointer whitespace-nowrap ${
                              listFilter === tab.id
                                ? isLightMode
                                  ? 'bg-white text-indigo-700 shadow-xs'
                                  : 'bg-indigo-600/80 text-white'
                                : isLightMode
                                ? 'text-slate-600 hover:text-slate-900'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {isEn ? tab.en : tab.fa}
                          </button>
                        ))}
                      </div>
                    </div>

                    {listError && (
                      <div
                        className={`px-3 py-1.5 text-[11px] border-b shrink-0 ${
                          isLightMode
                            ? 'bg-rose-50 border-rose-200 text-rose-700'
                            : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                        }`}
                      >
                        {listError}
                      </div>
                    )}

                    {/* Channels & Direct Chats Scroll List */}
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2 space-y-1">
                      {channelsLoading && channels.length === 0 ? (
                        <div className="space-y-2 p-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div
                              key={i}
                              className={`h-12 rounded-xl animate-pulse ${
                                isLightMode ? 'bg-slate-100' : 'bg-white/5'
                              }`}
                            />
                          ))}
                        </div>
                      ) : filteredChannels.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                          <MessageSquare
                            className={`w-8 h-8 mb-2 ${
                              isLightMode ? 'text-slate-300' : 'text-slate-600'
                            }`}
                          />
                          <p
                            className={`text-xs mb-3 ${
                              isLightMode ? 'text-slate-500' : 'text-slate-400'
                            }`}
                          >
                            {isEn
                              ? 'No conversations match your filter.'
                              : 'گفتگو یا کانالی یافت نشد.'}
                          </p>
                          {canSend && (
                            <button
                              type="button"
                              onClick={handleOpenNewChatPicker}
                              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer transition"
                            >
                              {isEn ? 'Start Direct Chat' : 'شروع گفتگوی جدید'}
                            </button>
                          )}
                        </div>
                      ) : (
                        filteredChannels.map((ch) => {
                          const isOpened = openTabs.some((t) => t.channelId === ch.id);
                          const title = dedupeParenthesizedTitle(
                            isEn ? ch.nameEn || ch.name : ch.name
                          );
                          return (
                            <button
                              key={ch.id}
                              type="button"
                              onClick={() => openChatWindow(ch.id)}
                              className={`w-full flex items-start gap-2.5 p-2 rounded-xl text-start transition cursor-pointer border ${
                                isOpened
                                  ? isLightMode
                                    ? 'bg-indigo-50/80 border-indigo-200 text-indigo-950'
                                    : 'bg-indigo-500/15 border-indigo-500/30 text-white'
                                  : isLightMode
                                  ? 'border-transparent hover:bg-slate-100 text-slate-800'
                                  : 'border-transparent hover:bg-white/[0.06] text-slate-200'
                              }`}
                            >
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 mt-0.5 ${
                                  ch.channelType === 'direct'
                                    ? isLightMode
                                      ? 'bg-sky-50 border-sky-200 text-sky-600'
                                      : 'bg-sky-500/15 border-sky-500/30 text-sky-300'
                                    : isLightMode
                                    ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                                    : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                                }`}
                              >
                                {ch.channelType === 'direct' ? (
                                  <User className="w-4 h-4" />
                                ) : (
                                  <Hash className="w-4 h-4" />
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1.5">
                                  <span className="text-xs font-semibold truncate">{title}</span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {ch.isMuted && (
                                      <BellOff className="w-3 h-3 text-slate-400" />
                                    )}
                                    {ch.unreadCount > 0 && (
                                      <span className="px-1.5 py-0.2 rounded-full bg-indigo-600 text-white text-[10px] font-mono tabular-nums font-bold">
                                        {ch.unreadCount}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div
                                  className={`flex items-center justify-between gap-2 text-[11px] mt-0.5 ${
                                    isLightMode ? 'text-slate-500' : 'text-slate-400'
                                  }`}
                                >
                                  <span className="truncate">
                                    {ch.lastMessagePreview ||
                                      (ch.channelType === 'direct'
                                        ? isEn
                                          ? 'Direct 1:1 thread'
                                          : 'گفتگوی مستقیم'
                                        : isEn
                                        ? `${ch.memberCount} members`
                                        : `${ch.memberCount} عضو`)}
                                  </span>
                                  {ch.lastMessageAt && (
                                    <span className="text-[10px] font-mono tabular-nums shrink-0 opacity-80">
                                      {formatListTime(ch.lastMessageAt)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
};
