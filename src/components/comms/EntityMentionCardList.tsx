import React from 'react';
import {
  Lock,
  Router,
  Server,
  Cable,
  User,
  MessageSquare,
  Terminal,
  ExternalLink,
  Network,
  ShieldAlert,
  MapPin,
} from 'lucide-react';
import { CommsProjectedEntityCard } from '../../types';
import {
  getCommsUserPresenceMeta,
  resolvePresenceFromState,
  useCommsPresenceMap,
} from '../../services/commsPresence';

export type CommsEntityCardAction = 'ports' | 'terminal' | 'view';

export interface EntityMentionCardListProps {
  cards?: CommsProjectedEntityCard[];
  isEn: boolean;
  isLightMode: boolean;
  isSelf?: boolean;
  compact?: boolean;
  onOpenDirectUser?: (username: string) => void;
}

export function dispatchOpenMentionedEntity(
  card: CommsProjectedEntityCard,
  action: CommsEntityCardAction
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('nettop-comms-open-entity', {
      detail: {
        entityType: card.entityType,
        entityId: card.entityId,
        portId: card.portId || undefined,
        action,
        name: card.name || card.entityId,
      },
    })
  );
}

export const EntityMentionCardList: React.FC<EntityMentionCardListProps> = ({
  cards,
  isEn,
  isLightMode,
  isSelf = false,
  compact = false,
  onOpenDirectUser,
}) => {
  const presenceState = useCommsPresenceMap();
  if (!Array.isArray(cards) || cards.length === 0) return null;
  const selfDark = isSelf && !isLightMode;

  return (
    <div className={`mt-2 flex flex-col ${compact ? 'gap-1.5' : 'gap-2'}`}>
      {cards.map((card, idx) => {
        const key = `${card.entityType}:${card.entityId}:${card.portId || ''}:${idx}`;

        if (card.accessRestricted) {
          const msg = isEn
            ? card.restrictionMessageEn ||
              'Access Denied (RBAC): You do not have permission to view this network entity.'
            : card.restrictionMessageFa ||
              'عدم دسترسی RBAC: شما مجوز مشاهده اطلاعات این تجهیز یا سرور را ندارید.';

          return (
            <div
              key={key}
              className={`comms-chat-card rounded-xl border px-2.5 py-2 flex items-start gap-2 ${
                selfDark
                  ? 'bg-slate-950/35 border-amber-300/40 text-amber-100'
                  : isLightMode
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
              }`}
            >
              <div
                className={`p-1 rounded-lg shrink-0 mt-0.5 ${
                  selfDark
                    ? 'bg-amber-400/20 text-amber-200'
                    : isLightMode
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                <Lock className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-bold tracking-tight">
                    {isEn ? 'RBAC Restricted Reference' : 'محدودیت دسترسی (RBAC)'}
                  </span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[9.5px] font-semibold uppercase ${
                      selfDark
                        ? 'bg-amber-300/20 text-amber-100'
                        : isLightMode
                        ? 'bg-amber-200/70 text-amber-900'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {card.entityType === 'user'
                      ? isEn
                        ? 'User'
                        : 'کاربر'
                      : card.entityType === 'server'
                      ? isEn
                        ? 'Server'
                        : 'سرور'
                      : card.entityType === 'port'
                      ? isEn
                        ? 'Port'
                        : 'پورت'
                      : isEn
                      ? 'Device'
                      : 'تجهیز'}
                  </span>
                </div>
                <p className="text-[11px] leading-snug opacity-95 mt-0.5">{msg}</p>
              </div>
            </div>
          );
        }

        const isUser = card.entityType === 'user';
        const isServer = card.entityType === 'server';
        const isPort = card.entityType === 'port';
        const portStatusLower = (card.portStatus || '').toLowerCase();
        const isPortUp = portStatusLower === 'up' || portStatusLower === 'connected';
        const isPortDown = portStatusLower === 'down' || portStatusLower === 'notconnect' || portStatusLower === 'disabled';

        const cardContainerCls = selfDark
          ? 'bg-slate-950/35 border-white/20 text-white'
          : isLightMode
          ? 'bg-white border-slate-200 text-slate-900 shadow-xs'
          : 'bg-slate-950/75 border-white/15 text-slate-100';

        const subTextCls = selfDark
          ? 'text-indigo-100/85'
          : isLightMode
          ? 'text-slate-600'
          : 'text-slate-400';

        const actionBtnCls = selfDark
          ? 'bg-white/15 hover:bg-white/25 text-white border-white/25'
          : isLightMode
          ? 'bg-slate-100 hover:bg-indigo-50 text-slate-800 hover:text-indigo-700 border-slate-200 hover:border-indigo-300'
          : 'bg-white/5 hover:bg-indigo-500/20 text-slate-200 hover:text-indigo-200 border-white/15 hover:border-indigo-400/40';

        if (isUser) {
          const uname = card.username || card.entityId;
          const userPresence = resolvePresenceFromState(
            presenceState,
            [card.username, card.entityId],
            card.presenceStatus,
            card.isOnline
          );
          const presenceMeta = getCommsUserPresenceMeta(userPresence, isEn, {
            isLightMode,
            selfDark,
          });
          return (
            <div key={key} className={`comms-chat-card rounded-xl border px-2.5 py-2 transition ${cardContainerCls}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`p-1.5 rounded-lg shrink-0 ${
                      selfDark
                        ? 'bg-white/15 text-white'
                        : isLightMode
                        ? 'bg-sky-50 text-sky-700'
                        : 'bg-sky-500/15 text-sky-300'
                    }`}
                  >
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${presenceMeta.dotClass}`}
                        title={presenceMeta.label}
                      />
                      <span className="font-bold text-xs truncate">{card.name || uname}</span>
                      {card.isChannelMember && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                            selfDark
                              ? 'bg-white/15 text-white'
                              : isLightMode
                              ? 'bg-indigo-50 text-indigo-700'
                              : 'bg-indigo-500/20 text-indigo-200'
                          }`}
                        >
                          {isEn ? 'Member' : 'عضو کانال'}
                        </span>
                      )}
                    </div>
                    <div className={`flex items-center gap-1.5 flex-wrap text-[10.5px] mt-0.5 ${subTextCls}`}>
                      <span className="font-mono">@{uname}</span>
                      {card.role && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{card.role}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className={`font-semibold ${presenceMeta.textClass}`}>
                        {presenceMeta.label}
                      </span>
                    </div>
                  </div>
                </div>

                {card.canOpenDirectChat && onOpenDirectUser ? (
                  <button
                    type="button"
                    onClick={() => onOpenDirectUser(uname)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10.5px] font-semibold cursor-pointer transition shrink-0 ${actionBtnCls}`}
                    title={isEn ? 'Open Direct Chat' : 'شروع گفتگوی مستقیم'}
                  >
                    <MessageSquare className="w-3 h-3" />
                    {!compact && <span>{isEn ? 'Direct Chat' : 'گفتگوی مستقیم'}</span>}
                  </button>
                ) : (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9.5px] font-semibold shrink-0 ${presenceMeta.badgeClass}`}
                  >
                    {presenceMeta.label}
                  </span>
                )}
              </div>
            </div>
          );
        }

        return (
          <div key={key} className={`comms-chat-card rounded-xl border px-2.5 py-2 transition ${cardContainerCls}`}>
            {/* Header line: icon + live dot + name + IP */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className={`p-1.5 rounded-lg shrink-0 ${
                    selfDark
                      ? 'bg-white/15 text-white'
                      : isServer
                      ? isLightMode
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-emerald-500/15 text-emerald-300'
                      : isPort
                      ? isLightMode
                        ? 'bg-cyan-50 text-cyan-700'
                        : 'bg-cyan-500/15 text-cyan-300'
                      : isLightMode
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'bg-indigo-500/15 text-indigo-300'
                  }`}
                >
                  {isServer ? (
                    <Server className="w-3.5 h-3.5" />
                  ) : isPort ? (
                    <Cable className="w-3.5 h-3.5" />
                  ) : (
                    <Router className="w-3.5 h-3.5" />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        card.isOnline ? 'bg-emerald-400' : 'bg-rose-400'
                      }`}
                      title={
                        card.isOnline
                          ? isEn
                            ? 'Online'
                            : 'آنلاین'
                          : isEn
                          ? 'Offline'
                          : 'آفلاین'
                      }
                    />
                    <span className="font-bold text-xs truncate">{card.name || card.entityId}</span>
                    {isPort && card.portId && (
                      <span
                        className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${
                          selfDark
                            ? 'bg-white/20 text-white'
                            : isLightMode
                            ? 'bg-cyan-100 text-cyan-800'
                            : 'bg-cyan-500/20 text-cyan-200'
                        }`}
                      >
                        {card.portId}
                      </span>
                    )}
                  </div>

                  <div className={`flex items-center gap-2 flex-wrap text-[10.5px] mt-0.5 ${subTextCls}`}>
                    {card.ip && <span className="font-mono">{card.ip}</span>}
                    {card.platform && (
                      <span className="opacity-90 uppercase">{card.platform}</span>
                    )}
                    {!compact && card.location && (
                      <span className="inline-flex items-center gap-0.5 truncate max-w-[180px]">
                        <MapPin className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate">{card.location}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <span
                className={`px-1.5 py-0.5 rounded text-[9.5px] font-semibold shrink-0 ${
                  card.isOnline
                    ? selfDark
                      ? 'bg-emerald-400/25 text-emerald-100'
                      : isLightMode
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-emerald-500/20 text-emerald-300'
                    : selfDark
                    ? 'bg-rose-400/25 text-rose-100'
                    : isLightMode
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-rose-500/20 text-rose-300'
                }`}
              >
                {card.isOnline ? (isEn ? 'Online' : 'آنلاین') : isEn ? 'Offline' : 'آفلاین'}
              </span>
            </div>

            {/* Port telemetry or port-level RBAC notice */}
            {isPort && (
              <div className="mt-1.5">
                {card.portsRestricted ? (
                  <div
                    className={`rounded-lg px-2 py-1 text-[10.5px] flex items-center gap-1.5 border ${
                      selfDark
                        ? 'bg-amber-400/20 border-amber-300/40 text-amber-100'
                        : isLightMode
                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                    }`}
                  >
                    <ShieldAlert className="w-3 h-3 shrink-0" />
                    <span>
                      {isEn
                        ? card.portsRestrictionMessageEn ||
                          'Port details restricted by your RBAC policy.'
                        : card.portsRestrictionMessageFa ||
                          'دسترسی مشاهده جزئیات پورت در پالیسی شما محدود شده است.'}
                    </span>
                  </div>
                ) : (
                  <div className={`flex items-center flex-wrap gap-1.5 text-[10.5px] ${subTextCls}`}>
                    {card.portStatus && (
                      <span
                        className={`px-1.5 py-0.5 rounded font-semibold ${
                          isPortUp
                            ? selfDark
                              ? 'bg-emerald-400/25 text-emerald-100'
                              : isLightMode
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-emerald-500/20 text-emerald-300'
                            : isPortDown
                            ? selfDark
                              ? 'bg-rose-400/25 text-rose-100'
                              : isLightMode
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-rose-500/20 text-rose-300'
                            : selfDark
                            ? 'bg-white/15 text-white'
                            : isLightMode
                            ? 'bg-slate-200 text-slate-700'
                            : 'bg-white/10 text-slate-300'
                        }`}
                      >
                        {isEn ? 'Link' : 'لینک'}: {card.portStatus}
                      </span>
                    )}
                    {card.portMode && (
                      <span
                        className={`px-1.5 py-0.5 rounded border font-mono ${
                          isLightMode
                            ? 'bg-slate-100 border-slate-200 text-slate-700'
                            : 'bg-black/10 border-current/15'
                        }`}
                      >
                        {card.portMode}
                      </span>
                    )}
                    {card.portVlan !== undefined && card.portVlan !== null && (
                      <span
                        className={`px-1.5 py-0.5 rounded border font-mono ${
                          isLightMode
                            ? 'bg-slate-100 border-slate-200 text-slate-700'
                            : 'bg-black/10 border-current/15'
                        }`}
                      >
                        VLAN {String(card.portVlan)}
                      </span>
                    )}
                    {card.portSpeed && (
                      <span className="font-mono opacity-85">{card.portSpeed}</span>
                    )}
                    {card.portDescription && (
                      <span className="truncate max-w-[210px] opacity-90">
                        · {card.portDescription}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* RBAC-gated interactive action buttons */}
            {(card.canOpenPorts || card.canOpenTerminal || card.canOpenDeviceView) && (
              <div className="mt-2 pt-1.5 border-t border-current/10 flex items-center flex-wrap gap-1.5">
                {!isServer && card.canOpenPorts && (
                  <button
                    type="button"
                    onClick={() => dispatchOpenMentionedEntity(card, 'ports')}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10.5px] font-semibold cursor-pointer transition ${actionBtnCls}`}
                  >
                    <Network className="w-3 h-3" />
                    <span>{isEn ? 'Inspect Ports' : 'مدیریت پورت‌ها'}</span>
                  </button>
                )}
                {!isServer && card.canOpenTerminal && (
                  <button
                    type="button"
                    onClick={() => dispatchOpenMentionedEntity(card, 'terminal')}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10.5px] font-semibold cursor-pointer transition ${actionBtnCls}`}
                  >
                    <Terminal className="w-3 h-3" />
                    <span>{isEn ? 'Terminal' : 'ترمینال'}</span>
                  </button>
                )}
                {card.canOpenDeviceView && (
                  <button
                    type="button"
                    onClick={() => dispatchOpenMentionedEntity(card, 'view')}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10.5px] font-semibold cursor-pointer transition ${actionBtnCls}`}
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>
                      {isServer
                        ? isEn
                          ? 'Servers'
                          : 'سرورها'
                        : isEn
                        ? 'Devices'
                        : 'تجهیزات'}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
