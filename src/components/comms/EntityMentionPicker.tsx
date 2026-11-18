import React, { useEffect, useMemo, useState } from 'react';
import {
  Router,
  Server,
  Cable,
  User,
  X,
  Search,
  Loader2,
  AtSign,
} from 'lucide-react';
import { CommsEntityMentionRef, CommsMentionCandidate } from '../../types';
import { searchCommsMentionEntities } from '../../services/commsApi';
import {
  getCommsUserPresenceMeta,
  resolvePresenceFromState,
  useCommsPresenceMap,
} from '../../services/commsPresence';

export interface SelectedEntityMentionItem {
  ref: CommsEntityMentionRef;
  label: string;
  subtitle?: string;
  isOnline?: boolean;
}

export interface EntityMentionPickerProps {
  isEn: boolean;
  isLightMode: boolean;
  compact?: boolean;
  channelId?: string | null;
  draftBody: string;
  onDraftBodyChange: (nextBody: string) => void;
  selectedItems: SelectedEntityMentionItem[];
  onAddItem: (item: SelectedEntityMentionItem) => void;
  onRemoveItem: (index: number) => void;
  manualOpen: boolean;
  onManualOpenChange: (open: boolean) => void;
  disabled?: boolean;
}

export function extractTrailingAtQuery(text: string): {
  active: boolean;
  query: string;
  matchStart: number;
} {
  const match = text.match(/(?:^|\s)@([^\s@]{0,48})$/);
  if (!match || match.index === undefined) {
    return { active: false, query: '', matchStart: -1 };
  }
  const full = match[0];
  const atOffset = full.indexOf('@');
  return {
    active: true,
    query: match[1] || '',
    matchStart: match.index + atOffset,
  };
}

export const EntityMentionChips: React.FC<{
  items: SelectedEntityMentionItem[];
  onRemove: (idx: number) => void;
  isEn: boolean;
  isLightMode: boolean;
  compact?: boolean;
}> = ({ items, onRemove, isEn, isLightMode, compact = false }) => {
  if (!items || items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((item, idx) => {
        const key = `${item.ref.entityType}:${item.ref.entityId}:${item.ref.portId || ''}:${idx}`;
        const Icon =
          item.ref.entityType === 'user'
            ? User
            : item.ref.entityType === 'server'
            ? Server
            : item.ref.entityType === 'port'
            ? Cable
            : Router;

        return (
          <span
            key={key}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11px] font-medium max-w-full ${
              item.ref.entityType === 'user'
                ? isLightMode
                  ? 'bg-sky-50 border-sky-200 text-sky-800'
                  : 'bg-sky-500/15 border-sky-400/30 text-sky-200'
                : isLightMode
                ? 'bg-indigo-50 border-indigo-200 text-indigo-800'
                : 'bg-indigo-500/15 border-indigo-400/30 text-indigo-200'
            }`}
          >
            <Icon className="w-3 h-3 shrink-0" />
            <span className={`truncate ${compact ? 'max-w-[140px]' : 'max-w-[200px]'}`}>
              {item.ref.entityType === 'user' ? `@${item.ref.entityId}` : item.label}
            </span>
            <button
              type="button"
              onClick={() => onRemove(idx)}
              className="opacity-70 hover:opacity-100 hover:text-rose-500 cursor-pointer shrink-0"
              title={isEn ? 'Remove reference' : 'حذف ارجاع'}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        );
      })}
    </div>
  );
};

export const EntityMentionPickerPopover: React.FC<EntityMentionPickerProps> = ({
  isEn,
  isLightMode,
  compact = false,
  channelId,
  draftBody,
  onDraftBodyChange,
  selectedItems,
  onAddItem,
  manualOpen,
  onManualOpenChange,
  disabled = false,
}) => {
  const [manualSearch, setManualSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CommsMentionCandidate[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const presenceState = useCommsPresenceMap();

  const atTrigger = useMemo(() => extractTrailingAtQuery(draftBody), [draftBody]);
  const isOpen = !disabled && (manualOpen || atTrigger.active);
  const activeQuery = manualOpen && !atTrigger.active ? manualSearch : atTrigger.query;

  useEffect(() => {
    if (!isOpen) {
      setManualSearch('');
      setSearchError(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setSearchError(null);
      try {
        const list = await searchCommsMentionEntities(activeQuery, channelId);
        if (!cancelled) {
          setResults(Array.isArray(list) ? list : []);
        }
      } catch (err: any) {
        if (!cancelled) {
          setResults([]);
          setSearchError(
            err?.message || (isEn ? 'Search failed' : 'خطا در جستجو')
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 160);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, activeQuery, channelId, isEn]);

  if (!isOpen) return null;

  const selectedKeys = new Set(
    selectedItems.map(
      (item) =>
        `${item.ref.entityType}:${item.ref.entityId.toLowerCase()}:${(
          item.ref.portId || ''
        ).toLowerCase()}`
    )
  );

  const handleSelectCandidate = (candidate: CommsMentionCandidate) => {
    if (selectedItems.length >= 6) return;
    const ref: CommsEntityMentionRef = {
      entityType: candidate.entityType,
      entityId: candidate.entityId,
      portId: candidate.entityType === 'port' ? candidate.portId || null : null,
    };
    const dedupeKey = `${ref.entityType}:${ref.entityId.toLowerCase()}:${(
      ref.portId || ''
    ).toLowerCase()}`;

    if (!selectedKeys.has(dedupeKey)) {
      onAddItem({
        ref,
        label: candidate.name,
        subtitle: candidate.subtitle,
        isOnline: candidate.isOnline,
      });
    }

    if (atTrigger.active && atTrigger.matchStart >= 0) {
      const cleaned = draftBody.slice(0, atTrigger.matchStart).replace(/[ ]+$/, (s) => (s.length > 0 ? ' ' : ''));
      onDraftBodyChange(cleaned);
    }
    onManualOpenChange(false);
    setManualSearch('');
  };

  return (
    <div
      className={`absolute bottom-full left-0 right-0 mb-1.5 z-50 rounded-xl border shadow-2xl overflow-hidden ${
        isLightMode
          ? 'bg-white border-slate-200 text-slate-900'
          : 'bg-slate-900 border-slate-700 text-slate-100'
      }`}
    >
      <div
        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 border-b text-[11px] ${
          isLightMode
            ? 'bg-slate-50 border-slate-200 text-slate-700'
            : 'bg-slate-950/70 border-slate-800 text-slate-300'
        }`}
      >
        <div className="flex items-center gap-1.5 font-semibold min-w-0">
          <AtSign className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <span className="truncate">
            {isEn
              ? 'Mention Team Member, Device, Port, or Server'
              : 'منشن همکار، تجهیز، پورت یا سرور مجاز'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            onManualOpenChange(false);
            if (atTrigger.active && atTrigger.matchStart >= 0) {
              onDraftBodyChange(draftBody.slice(0, atTrigger.matchStart));
            }
          }}
          className="p-0.5 rounded hover:bg-black/10 cursor-pointer shrink-0"
          title={isEn ? 'Close' : 'بستن'}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {manualOpen && !atTrigger.active && (
        <div className={`p-2 border-b ${isLightMode ? 'border-slate-200' : 'border-slate-800'}`}>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-2.5 pointer-events-none" />
            <input
              type="text"
              autoFocus
              value={manualSearch}
              onChange={(e) => setManualSearch(e.target.value)}
              placeholder={
                isEn
                  ? 'Search user, device, IP, or port (e.g. Gi1/0/1)...'
                  : 'جستجوی کاربر، تجهیز، IP یا پورت (مثلاً Gi1/0/1)...'
              }
              className={`w-full ps-8 pe-2.5 py-1.5 rounded-lg border text-xs outline-none ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500'
                  : 'bg-slate-950 border-slate-700 text-slate-100 focus:border-indigo-400'
              }`}
            />
          </div>
        </div>
      )}

      <div className={`${compact ? 'max-h-44' : 'max-h-56'} overflow-y-auto p-1 space-y-0.5`}>
        {selectedItems.length >= 6 ? (
          <div className="px-3 py-3 text-center text-[11px] text-amber-500">
            {isEn
              ? 'Maximum of 6 references per message reached.'
              : 'حداکثر ۶ مورد در هر پیام قابل منشن و ارجاع است.'}
          </div>
        ) : loading ? (
          <div className="py-4 flex items-center justify-center gap-2 text-xs text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
            <span>
              {isEn
                ? 'Searching people & authorized entities...'
                : 'در حال جستجوی افراد و تجهیزات مجاز...'}
            </span>
          </div>
        ) : searchError ? (
          <div className="px-3 py-3 text-center text-[11px] text-rose-500">{searchError}</div>
        ) : results.length === 0 ? (
          <div className="px-3 py-4 text-center text-[11px] text-slate-400">
            {isEn
              ? 'No matching users, devices, servers, or ports found.'
              : 'کاربر، تجهیز، سرور یا پورتی با این عبارت یافت نشد.'}
          </div>
        ) : (
          results.map((cand, idx) => {
            const cKey = `${cand.entityType}:${cand.entityId}:${cand.portId || ''}:${idx}`;
            const dedupeKey = `${cand.entityType}:${cand.entityId.toLowerCase()}:${(
              cand.portId || ''
            ).toLowerCase()}`;
            const alreadyAdded = selectedKeys.has(dedupeKey);
            const isUser = cand.entityType === 'user';
            const userPresence = isUser
              ? resolvePresenceFromState(
                  presenceState,
                  [cand.username, cand.entityId],
                  cand.presenceStatus,
                  cand.isOnline
                )
              : null;
            const userPresenceMeta = userPresence
              ? getCommsUserPresenceMeta(userPresence, isEn, { isLightMode })
              : null;
            const Icon =
              isUser
                ? User
                : cand.entityType === 'server'
                ? Server
                : cand.entityType === 'port'
                ? Cable
                : Router;

            return (
              <button
                key={cKey}
                type="button"
                disabled={alreadyAdded}
                onClick={() => handleSelectCandidate(cand)}
                className={`w-full text-start px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2 text-xs transition cursor-pointer disabled:opacity-45 disabled:cursor-default ${
                  isLightMode
                    ? 'hover:bg-indigo-50 text-slate-800'
                    : 'hover:bg-white/10 text-slate-100'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isUser
                        ? 'text-sky-500'
                        : cand.entityType === 'server'
                        ? 'text-emerald-500'
                        : cand.entityType === 'port'
                        ? 'text-cyan-500'
                        : 'text-indigo-500'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          isUser && userPresenceMeta
                            ? userPresenceMeta.dotClass
                            : cand.isOnline
                            ? 'bg-emerald-400'
                            : 'bg-rose-400'
                        }`}
                        title={userPresenceMeta ? userPresenceMeta.label : undefined}
                      />
                      <span className="font-semibold truncate">{cand.name}</span>
                      {userPresenceMeta && (
                        <span className={`text-[10px] font-medium shrink-0 ${userPresenceMeta.textClass}`}>
                          · {userPresenceMeta.label}
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-[10.5px] truncate font-mono ${
                        isLightMode ? 'text-slate-500' : 'text-slate-400'
                      }`}
                    >
                      {cand.subtitle}
                    </p>
                  </div>
                </div>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9.5px] font-semibold uppercase shrink-0 ${
                    isUser
                      ? isLightMode
                        ? 'bg-sky-50 text-sky-700'
                        : 'bg-sky-500/15 text-sky-300'
                      : isLightMode
                      ? 'bg-slate-100 text-slate-600'
                      : 'bg-white/10 text-slate-300'
                  }`}
                >
                  {alreadyAdded
                    ? isEn
                      ? 'Added'
                      : 'افزوده شد'
                    : isUser
                    ? cand.isChannelMember
                      ? isEn
                        ? 'Member'
                        : 'عضو کانال'
                      : isEn
                      ? 'User'
                      : 'کاربر'
                    : cand.entityType === 'server'
                    ? isEn
                      ? 'Server'
                      : 'سرور'
                    : cand.entityType === 'port'
                    ? isEn
                      ? 'Port'
                      : 'پورت'
                    : isEn
                    ? 'Device'
                    : 'تجهیز'}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
