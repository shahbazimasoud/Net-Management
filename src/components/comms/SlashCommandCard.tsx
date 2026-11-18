import React from 'react';
import {
  Activity,
  Cable,
  Cpu,
  ExternalLink,
  Gauge,
  Globe,
  Lock,
  Network,
  Router,
  Server,
  ShieldAlert,
  Terminal,
  MapPin,
} from 'lucide-react';
import { CommsProjectedEntityCard, CommsProjectedSlashResult } from '../../types';
import { dispatchOpenMentionedEntity } from './EntityMentionCardList';

export interface SlashCommandCardProps {
  result?: CommsProjectedSlashResult;
  isEn: boolean;
  isLightMode: boolean;
  isSelf?: boolean;
  compact?: boolean;
}

export const SlashCommandCard: React.FC<SlashCommandCardProps> = ({
  result,
  isEn,
  isLightMode,
  isSelf = false,
  compact = false,
}) => {
  if (!result) return null;
  const selfDark = isSelf && !isLightMode;

  // Strict Zero-Leak RBAC Locked View
  if (result.accessRestricted) {
    const msg = isEn
      ? result.restrictionMessageEn ||
        'Access Denied (RBAC): This command output belongs to a restricted device or server.'
      : result.restrictionMessageFa ||
        'عدم دسترسی (RBAC): شما مجوز مشاهده خروجی این دستور برای تجهیز یا سرور مورد نظر را ندارید.';

    return (
      <div
        className={`comms-chat-card mt-2 rounded-xl border px-2.5 py-2 flex items-start gap-2 ${
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
              {isEn ? 'RBAC Restricted ChatOps Output' : 'محدودیت دسترسی دستور (RBAC)'}
            </span>
            <span
              className={`px-1.5 py-0.5 rounded font-mono text-[9.5px] font-bold ${
                selfDark
                  ? 'bg-amber-300/20 text-amber-100'
                  : isLightMode
                  ? 'bg-amber-200/70 text-amber-900'
                  : 'bg-amber-500/20 text-amber-300'
              }`}
            >
              /{result.command}
            </span>
          </div>
          <p className="text-[11px] leading-snug opacity-95 mt-0.5">{msg}</p>
        </div>
      </div>
    );
  }

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

  const pillCls = selfDark
    ? 'bg-white/15 border-white/20 text-white'
    : isLightMode
    ? 'bg-slate-100 border-slate-200 text-slate-700'
    : 'bg-white/5 border-white/15 text-slate-300';

  const cmdIcon = (() => {
    switch (result.command) {
      case 'ping':
        return <Activity className="w-3.5 h-3.5" />;
      case 'status':
        return result.linkedEntityType === 'server' ? (
          <Server className="w-3.5 h-3.5" />
        ) : (
          <Gauge className="w-3.5 h-3.5" />
        );
      case 'port':
        return <Cable className="w-3.5 h-3.5" />;
      case 'mac':
        return <Cpu className="w-3.5 h-3.5" />;
      case 'dns':
        return <Globe className="w-3.5 h-3.5" />;
    }
  })();

  const isServer = result.linkedEntityType === 'server';

  const buildOpenCardPayload = (): CommsProjectedEntityCard | null => {
    if (!result.linkedEntityId) return null;
    return {
      entityType: result.linkedEntityType || 'device',
      entityId: result.linkedEntityId,
      portId: result.portId || null,
      accessRestricted: false,
      name: result.entityName || result.finalEdgePort?.switchName || result.target,
      ip: result.entityIp || result.finalEdgePort?.switchIp || '',
      canOpenPorts: result.canOpenPorts,
      canOpenTerminal: result.canOpenTerminal,
      canOpenDeviceView: result.canOpenDeviceView,
    };
  };

  const openPayload = buildOpenCardPayload();
  const portStatusLower = (result.portStatus || '').toLowerCase();
  const isPortUp = portStatusLower === 'up' || portStatusLower === 'connected';
  const isPortDown =
    portStatusLower === 'down' ||
    portStatusLower === 'notconnect' ||
    portStatusLower === 'disabled';

  const camHits = Array.isArray(result.camHits) ? result.camHits : [];
  const arpHits = Array.isArray(result.arpHits) ? result.arpHits : [];
  const ipv4List = Array.isArray(result.ipv4Addresses) ? result.ipv4Addresses : [];
  const ipv6List = Array.isArray(result.ipv6Addresses) ? result.ipv6Addresses : [];
  const mxList = Array.isArray(result.mxRecords) ? result.mxRecords : [];
  const ptrList = Array.isArray(result.ptrHostnames) ? result.ptrHostnames : [];
  const txtList = Array.isArray(result.txtRecords) ? result.txtRecords : [];

  return (
    <div className={`comms-chat-card mt-2 rounded-xl border px-2.5 py-2 transition ${cardContainerCls}`}>
      {/* Header Row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`p-1.5 rounded-lg shrink-0 ${
              selfDark
                ? 'bg-white/15 text-white'
                : isLightMode
                ? 'bg-cyan-50 text-cyan-700'
                : 'bg-cyan-500/15 text-cyan-300'
            }`}
          >
            {cmdIcon}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${
                  selfDark
                    ? 'bg-white/20 text-white'
                    : isLightMode
                    ? 'bg-cyan-100 text-cyan-800'
                    : 'bg-cyan-500/20 text-cyan-200'
                }`}
              >
                /{result.command}
              </span>
              <span className="font-bold text-xs truncate">
                {result.entityName || result.target}
              </span>
              {result.portId && result.command === 'port' && (
                <span className={`px-1.5 py-0.5 rounded border font-mono text-[10px] font-bold ${pillCls}`}>
                  {result.portId}
                </span>
              )}
            </div>

            {(result.entityIp || result.platform || result.location) && (
              <div className={`flex items-center gap-2 flex-wrap text-[10.5px] mt-0.5 ${subTextCls}`}>
                {result.entityIp && <span className="font-mono">{result.entityIp}</span>}
                {result.platform && <span className="uppercase opacity-90">{result.platform}</span>}
                {!compact && result.location && (
                  <span className="inline-flex items-center gap-0.5 truncate max-w-[180px]">
                    <MapPin className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate">{result.location}</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {typeof result.durationMs === 'number' && (
            <span className={`px-1.5 py-0.5 rounded border font-mono text-[9.5px] ${pillCls}`}>
              {result.durationMs}ms
            </span>
          )}
          {(result.command === 'ping' || result.command === 'status') && (
            <span
              className={`px-1.5 py-0.5 rounded text-[9.5px] font-semibold ${
                result.isOnline
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
              {result.isOnline ? (isEn ? 'Online' : 'آنلاین') : isEn ? 'Offline' : 'آفلاین'}
            </span>
          )}
        </div>
      </div>

      {/* /ping & /status body */}
      {(result.command === 'ping' || result.command === 'status') && (
        <div className="mt-2 space-y-1.5">
          <div className={`flex items-center flex-wrap gap-1.5 text-[10.5px] ${subTextCls}`}>
            <span className={`px-1.5 py-0.5 rounded border font-mono ${pillCls}`}>
              {isEn ? 'RTT' : 'تاخیر'}:{' '}
              {result.latencyMs !== null && result.latencyMs !== undefined
                ? `${result.latencyMs}ms`
                : '—'}
            </span>
            <span className={`px-1.5 py-0.5 rounded border font-mono ${pillCls}`}>
              {isEn ? 'Loss' : 'افت بسته'}: {result.packetLoss ?? (result.isOnline ? 0 : 100)}%
            </span>
          </div>

          {result.rawOutput && (
            <details className="text-[10.5px]">
              <summary
                className={`cursor-pointer select-none font-medium opacity-85 hover:opacity-100 ${subTextCls}`}
              >
                {isEn ? 'Raw ICMP Probe Output' : 'نمایش خروجی خام ICMP'}
              </summary>
              <pre
                dir="ltr"
                className={`dark-terminal-box mt-1 p-2 rounded-lg border font-mono text-[10px] leading-relaxed overflow-x-auto max-h-32 ${
                  selfDark
                    ? 'bg-black/35 border-white/15 text-slate-100'
                    : isLightMode
                    ? 'bg-slate-900 border-slate-700 text-emerald-300'
                    : 'bg-black/60 border-white/10 text-emerald-300'
                }`}
              >
                {result.rawOutput}
              </pre>
            </details>
          )}
        </div>
      )}

      {/* /port body */}
      {result.command === 'port' && (
        <div className="mt-2">
          {result.portsRestricted ? (
            <div
              className={`rounded-lg px-2 py-1.5 text-[10.5px] flex items-center gap-1.5 border ${
                selfDark
                  ? 'bg-amber-400/20 border-amber-300/40 text-amber-100'
                  : isLightMode
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span>
                {isEn
                  ? result.portsRestrictionMessageEn ||
                    'Port details are restricted by your RBAC policy.'
                  : result.portsRestrictionMessageFa ||
                    'مشاهده جزئیات پورت در پالیسی دسترسی شما محدود شده است.'}
              </span>
            </div>
          ) : (
            <div className="space-y-1">
              <div className={`flex items-center flex-wrap gap-1.5 text-[10.5px] ${subTextCls}`}>
                {result.portStatus && (
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
                        : pillCls
                    }`}
                  >
                    {isEn ? 'Link' : 'لینک'}: {result.portStatus}
                  </span>
                )}
                {result.portAdminStatus && (
                  <span className={`px-1.5 py-0.5 rounded border font-mono ${pillCls}`}>
                    {isEn ? 'Admin' : 'ادمین'}: {result.portAdminStatus}
                  </span>
                )}
                {result.portMode && (
                  <span className={`px-1.5 py-0.5 rounded border font-mono ${pillCls}`}>
                    {result.portMode}
                  </span>
                )}
                {result.portVlan !== undefined && result.portVlan !== null && (
                  <span className={`px-1.5 py-0.5 rounded border font-mono ${pillCls}`}>
                    VLAN {String(result.portVlan)}
                  </span>
                )}
                {result.portSpeed && <span className="font-mono">{result.portSpeed}</span>}
              </div>
              {(result.portDescription || result.connectedDevice) && (
                <div className={`text-[10.5px] truncate ${subTextCls}`}>
                  {result.portDescription || result.connectedDevice}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* /mac body */}
      {result.command === 'mac' && (
        <div className="mt-2 space-y-1.5">
          {(result.resolvedMac || result.resolvedIp || result.vendorName) && (
            <div className={`flex items-center flex-wrap gap-1.5 text-[10.5px] ${subTextCls}`}>
              {result.resolvedMac && (
                <span className={`px-1.5 py-0.5 rounded border font-mono ${pillCls}`}>
                  MAC: {result.resolvedMac}
                </span>
              )}
              {result.resolvedIp && (
                <span className={`px-1.5 py-0.5 rounded border font-mono ${pillCls}`}>
                  IP: {result.resolvedIp}
                </span>
              )}
              {result.vendorName && (
                <span className={`px-1.5 py-0.5 rounded border ${pillCls}`}>
                  {result.vendorName}
                </span>
              )}
            </div>
          )}

          {result.finalEdgePort && (
            <div
              className={`rounded-lg border px-2 py-1.5 text-[11px] flex items-center justify-between gap-2 flex-wrap ${
                selfDark
                  ? 'bg-emerald-500/20 border-emerald-300/40 text-white'
                  : isLightMode
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-100'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Router className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                <span className="font-bold truncate">{result.finalEdgePort.switchName}</span>
                <span className="font-mono text-[10px] opacity-80">
                  ({result.finalEdgePort.switchIp})
                </span>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-[10.5px] font-bold shrink-0">
                <span className={`px-1.5 py-0.5 rounded ${isLightMode ? 'bg-emerald-100 text-emerald-900' : 'bg-black/15'}`}>
                  {result.finalEdgePort.port}
                </span>
                <span>VLAN {result.finalEdgePort.vlan}</span>
              </div>
            </div>
          )}

          {camHits.length > 0 && (
            <div className="space-y-1">
              {(compact ? camHits.slice(0, 3) : camHits.slice(0, 6)).map((hit, idx) => (
                <div
                  key={`${hit.switchId}:${hit.port}:${idx}`}
                  className={`flex items-center justify-between gap-2 px-2 py-1 rounded-lg border text-[10.5px] ${pillCls}`}
                >
                  <span className="truncate font-medium">
                    {hit.switchName}{' '}
                    <span className="font-mono opacity-75">({hit.switchIp})</span>
                  </span>
                  <span className="font-mono shrink-0">
                    {hit.port} · VLAN {hit.vlan}
                    {hit.isUplink ? (isEn ? ' · Uplink' : ' · آپلینک') : ''}
                  </span>
                </div>
              ))}
            </div>
          )}

          {camHits.length === 0 && arpHits.length > 0 && (
            <div className="space-y-1">
              {(compact ? arpHits.slice(0, 3) : arpHits.slice(0, 5)).map((hit, idx) => (
                <div
                  key={`${hit.switchId}:${hit.ip}:${idx}`}
                  className={`flex items-center justify-between gap-2 px-2 py-1 rounded-lg border text-[10.5px] ${pillCls}`}
                >
                  <span className="truncate font-medium">{hit.switchName}</span>
                  <span className="font-mono shrink-0">
                    {hit.ip} · {hit.mac} ({hit.interface})
                  </span>
                </div>
              ))}
            </div>
          )}

          {camHits.length === 0 && arpHits.length === 0 && !result.finalEdgePort && (
            <div className={`text-[10.5px] ${subTextCls}`}>
              {isEn
                ? 'No matching CAM or ARP record found across your authorized switches.'
                : 'موردی در جدول CAM/ARP سوئیچ‌های مجاز شما یافت نشد.'}
            </div>
          )}

          {result.portsRestricted && (
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
                  ? result.portsRestrictionMessageEn ||
                    'Port hits hidden per RBAC permission.'
                  : result.portsRestrictionMessageFa ||
                    'مشاهده پورت سوئیچ‌ها در پالیسی شما محدود شده است.'}
              </span>
            </div>
          )}

          {(result.restrictedSwitchCount || 0) > 0 && (
            <div
              className={`rounded-lg px-2 py-1 text-[10.5px] flex items-center gap-1.5 border ${
                selfDark
                  ? 'bg-amber-400/20 border-amber-300/40 text-amber-100'
                  : isLightMode
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
              }`}
            >
              <Lock className="w-3 h-3 shrink-0" />
              <span>
                {isEn
                  ? `${result.restrictedSwitchCount} matched switch(es) omitted due to your RBAC device scope.`
                  : `${result.restrictedSwitchCount} سوئیچ خارج از محدوده دسترسی RBAC شما پنهان شد.`}
              </span>
            </div>
          )}
        </div>
      )}

      {/* /dns body */}
      {result.command === 'dns' && (
        <div className="mt-2 space-y-1 text-[10.5px]">
          {ipv4List.length > 0 && (
            <div className="flex items-center flex-wrap gap-1">
              <span className={`font-mono font-bold ${subTextCls}`}>A:</span>
              {ipv4List.map((ip) => (
                <span key={ip} className={`px-1.5 py-0.5 rounded border font-mono ${pillCls}`}>
                  {ip}
                </span>
              ))}
            </div>
          )}
          {ipv6List.length > 0 && (
            <div className="flex items-center flex-wrap gap-1">
              <span className={`font-mono font-bold ${subTextCls}`}>AAAA:</span>
              {ipv6List.map((ip) => (
                <span key={ip} className={`px-1.5 py-0.5 rounded border font-mono ${pillCls}`}>
                  {ip}
                </span>
              ))}
            </div>
          )}
          {ptrList.length > 0 && (
            <div className="flex items-center flex-wrap gap-1">
              <span className={`font-mono font-bold ${subTextCls}`}>PTR:</span>
              {ptrList.map((host) => (
                <span key={host} className={`px-1.5 py-0.5 rounded border font-mono ${pillCls}`}>
                  {host}
                </span>
              ))}
            </div>
          )}
          {mxList.length > 0 && (
            <div className="flex items-center flex-wrap gap-1">
              <span className={`font-mono font-bold ${subTextCls}`}>MX:</span>
              {mxList.slice(0, 4).map((mx) => (
                <span
                  key={`${mx.priority}-${mx.exchange}`}
                  className={`px-1.5 py-0.5 rounded border font-mono ${pillCls}`}
                >
                  {mx.exchange} ({mx.priority})
                </span>
              ))}
            </div>
          )}
          {txtList.length > 0 && (
            <div className="flex items-start flex-wrap gap-1">
              <span className={`font-mono font-bold ${subTextCls}`}>TXT:</span>
              {txtList.slice(0, 2).map((txt, idx) => (
                <span
                  key={idx}
                  className={`px-1.5 py-0.5 rounded border font-mono break-all ${pillCls}`}
                >
                  {txt}
                </span>
              ))}
            </div>
          )}
          {ipv4List.length === 0 &&
            ipv6List.length === 0 &&
            ptrList.length === 0 &&
            mxList.length === 0 && (
              <div className={subTextCls}>
                {isEn ? 'No DNS records resolved for this query.' : 'هیچ رکوردی در DNS یافت نشد.'}
              </div>
            )}
        </div>
      )}

      {/* RBAC-gated interactive action buttons */}
      {openPayload &&
        (result.canOpenPorts || result.canOpenTerminal || result.canOpenDeviceView) && (
          <div className="mt-2 pt-1.5 border-t border-current/10 flex items-center flex-wrap gap-1.5">
            {!isServer && result.canOpenPorts && (
              <button
                type="button"
                onClick={() => dispatchOpenMentionedEntity(openPayload, 'ports')}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10.5px] font-semibold cursor-pointer transition ${actionBtnCls}`}
              >
                <Network className="w-3 h-3" />
                <span>{isEn ? 'Inspect Ports' : 'مدیریت پورت‌ها'}</span>
              </button>
            )}
            {!isServer && result.canOpenTerminal && (
              <button
                type="button"
                onClick={() => dispatchOpenMentionedEntity(openPayload, 'terminal')}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10.5px] font-semibold cursor-pointer transition ${actionBtnCls}`}
              >
                <Terminal className="w-3 h-3" />
                <span>{isEn ? 'Terminal' : 'ترمینال'}</span>
              </button>
            )}
            {result.canOpenDeviceView && (
              <button
                type="button"
                onClick={() => dispatchOpenMentionedEntity(openPayload, 'view')}
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
};
