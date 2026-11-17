import React, { useEffect, useMemo, useState } from 'react';
import {
  Terminal as TerminalIcon,
  Router,
  Server,
  Cable,
  X,
  Loader2,
  Activity,
  Cpu,
  Globe,
  Gauge,
} from 'lucide-react';
import { CommsMentionCandidate } from '../../types';
import { searchCommsMentionEntities } from '../../services/commsApi';

export interface SlashCommandDescriptor {
  cmd: 'ping' | 'mac' | 'port' | 'status' | 'dns';
  syntax: string;
  example: string;
  descEn: string;
  descFa: string;
  needsEntityAutocomplete: boolean;
}

export const SLASH_COMMANDS_CATALOG: SlashCommandDescriptor[] = [
  {
    cmd: 'ping',
    syntax: '/ping <device | server | ip | host>',
    example: '/ping 192.168.10.1',
    descEn: 'Run a live ICMP probe to measure reachability, latency, and packet loss',
    descFa: 'تست زنده پینگ (ICMP) برای سنجش دسترس‌پذیری، تاخیر (ms) و افت بسته',
    needsEntityAutocomplete: true,
  },
  {
    cmd: 'mac',
    syntax: '/mac <MAC | IPv4> [--live]',
    example: '/mac aabb.ccdd.eeff --live',
    descEn: 'Trace MAC or IP in CAM/ARP tables strictly across your permitted switches',
    descFa: 'ردیابی MAC یا IP در جدول CAM/ARP منحصراً روی سوئیچ‌های مجاز RBAC شما',
    needsEntityAutocomplete: false,
  },
  {
    cmd: 'port',
    syntax: '/port <device> <port>',
    example: '/port 192.168.10.2 Gi1/0/1',
    descEn: 'Inspect live-synced port link status, VLAN, speed, and connected neighbor',
    descFa: 'مشاهده وضعیت لینک، VLAN، سرعت و دیسکریپشن پورت در تجهیز مجاز',
    needsEntityAutocomplete: true,
  },
  {
    cmd: 'status',
    syntax: '/status <device | server>',
    example: '/status Core-Switch-1',
    descEn: 'Check live operational reachability and platform telemetry summary',
    descFa: 'استعلام وضعیت آنلاین بودن و خلاصه مشخصات تجهیز یا سرور مجاز',
    needsEntityAutocomplete: true,
  },
  {
    cmd: 'dns',
    syntax: '/dns <hostname | ipv4>',
    example: '/dns 8.8.8.8',
    descEn: 'Resolve real forward (A/AAAA/MX/TXT) or reverse (PTR) DNS records',
    descFa: 'استعلام مستقیم رکوردهای واقعی DNS (A / AAAA / MX / PTR / TXT)',
    needsEntityAutocomplete: false,
  },
];

function getCmdIcon(cmd: SlashCommandDescriptor['cmd']) {
  switch (cmd) {
    case 'ping':
      return Activity;
    case 'mac':
      return Cpu;
    case 'port':
      return Cable;
    case 'status':
      return Gauge;
    case 'dns':
      return Globe;
  }
}

export interface SlashCommandPickerProps {
  isEn: boolean;
  isLightMode: boolean;
  compact?: boolean;
  draftBody: string;
  onDraftBodyChange: (nextBody: string) => void;
  manualOpen: boolean;
  onManualOpenChange: (open: boolean) => void;
  disabled?: boolean;
}

export const SlashCommandPickerPopover: React.FC<SlashCommandPickerProps> = ({
  isEn,
  isLightMode,
  compact = false,
  draftBody,
  onDraftBodyChange,
  manualOpen,
  onManualOpenChange,
  disabled = false,
}) => {
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<CommsMentionCandidate[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const parsed = useMemo(() => {
    const trimmedLeft = draftBody.replace(/^\s+/, '');
    if (!trimmedLeft.startsWith('/')) {
      return {
        startsWithSlash: false,
        mode: 'catalog' as const,
        cmdFilter: '',
        activeCmd: null as SlashCommandDescriptor['cmd'] | null,
        argQuery: '',
      };
    }

    const argMatch = trimmedLeft.match(/^\/([a-zA-Z]+)\s+(.*)$/);
    if (argMatch) {
      const cmdRaw = argMatch[1].toLowerCase();
      const cmdNorm: SlashCommandDescriptor['cmd'] | null =
        cmdRaw === 'ping'
          ? 'ping'
          : cmdRaw === 'mac'
          ? 'mac'
          : cmdRaw === 'port'
          ? 'port'
          : cmdRaw === 'status' || cmdRaw === 'uptime'
          ? 'status'
          : cmdRaw === 'dns'
          ? 'dns'
          : null;

      if (cmdNorm === 'ping' || cmdNorm === 'status' || cmdNorm === 'port') {
        return {
          startsWithSlash: true,
          mode: 'entity' as const,
          cmdFilter: cmdNorm,
          activeCmd: cmdNorm,
          argQuery: argMatch[2] || '',
        };
      }
      if (cmdNorm === 'mac' || cmdNorm === 'dns') {
        return {
          startsWithSlash: true,
          mode: 'hint' as const,
          cmdFilter: cmdNorm,
          activeCmd: cmdNorm,
          argQuery: argMatch[2] || '',
        };
      }
    }

    const cmdOnlyMatch = trimmedLeft.match(/^\/([a-zA-Z]*)$/);
    return {
      startsWithSlash: true,
      mode: 'catalog' as const,
      cmdFilter: (cmdOnlyMatch?.[1] || '').toLowerCase(),
      activeCmd: null,
      argQuery: '',
    };
  }, [draftBody]);

  const isOpen = !disabled && (manualOpen || parsed.startsWithSlash);

  useEffect(() => {
    if (!isOpen || parsed.mode !== 'entity' || !parsed.activeCmd) {
      setCandidates([]);
      setSearchError(null);
      setLoading(false);
      return;
    }

    const rawArg = parsed.argQuery.trim();
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setSearchError(null);
      try {
        const list = await searchCommsMentionEntities(rawArg);
        if (cancelled) return;
        const filtered = (Array.isArray(list) ? list : []).filter((item) => {
          if (parsed.activeCmd === 'port') {
            return item.entityType === 'device' || item.entityType === 'port';
          }
          return item.entityType === 'device' || item.entityType === 'server';
        });
        setCandidates(filtered);
      } catch (err: any) {
        if (!cancelled) {
          setCandidates([]);
          setSearchError(
            err?.message || (isEn ? 'Failed to load targets' : 'خطا در جستجوی تجهیزات مجاز')
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
  }, [isOpen, parsed.mode, parsed.activeCmd, parsed.argQuery, isEn]);

  if (!isOpen) return null;

  const matchingCommands = parsed.cmdFilter
    ? SLASH_COMMANDS_CATALOG.filter(
        (c) =>
          c.cmd.startsWith(parsed.cmdFilter) ||
          c.cmd.includes(parsed.cmdFilter) ||
          (parsed.cmdFilter.startsWith('up') && c.cmd === 'status')
      )
    : SLASH_COMMANDS_CATALOG;

  const activeDescriptor = parsed.activeCmd
    ? SLASH_COMMANDS_CATALOG.find((c) => c.cmd === parsed.activeCmd) || null
    : null;

  const handleSelectCommand = (desc: SlashCommandDescriptor) => {
    onDraftBodyChange(`/${desc.cmd} `);
    if (!desc.needsEntityAutocomplete) {
      onManualOpenChange(false);
    }
  };

  const handleSelectEntity = (cand: CommsMentionCandidate) => {
    const cmd = parsed.activeCmd || 'ping';
    if (cmd === 'port') {
      const safeTarget =
        cand.ip?.trim() ||
        (!/\s/.test(cand.name || '') && cand.name ? cand.name.trim() : cand.entityId);
      if (cand.entityType === 'port' && cand.portId) {
        onDraftBodyChange(`/port ${safeTarget} ${cand.portId}`);
      } else {
        onDraftBodyChange(`/port ${safeTarget} `);
      }
    } else {
      const targetToken = cand.ip?.trim() || cand.name?.trim() || cand.entityId;
      onDraftBodyChange(`/${cmd} ${targetToken}`);
    }
    onManualOpenChange(false);
  };

  return (
    <div
      className={`absolute bottom-full left-0 right-0 mb-1.5 z-50 rounded-xl border shadow-2xl overflow-hidden ${
        isLightMode
          ? 'bg-white border-slate-200 text-slate-900'
          : 'bg-slate-900 border-slate-700 text-slate-100'
      }`}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 border-b text-[11px] ${
          isLightMode
            ? 'bg-slate-50 border-slate-200 text-slate-700'
            : 'bg-slate-950/70 border-slate-800 text-slate-300'
        }`}
      >
        <div className="flex items-center gap-1.5 font-semibold min-w-0">
          <TerminalIcon className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
          <span className="truncate">
            {parsed.mode === 'entity' && parsed.activeCmd
              ? isEn
                ? `/${parsed.activeCmd} — Select Permitted Target (RBAC)`
                : `/${parsed.activeCmd} — انتخاب هدف مجاز (RBAC)`
              : parsed.mode === 'hint' && activeDescriptor
              ? isEn
                ? `/${activeDescriptor.cmd} — ChatOps Syntax`
                : `/${activeDescriptor.cmd} — راهنمای اجرای دستور`
              : isEn
              ? 'ChatOps Slash Commands (RBAC Enforced)'
              : 'دستورات زنده شبکه (ChatOps / RBAC)'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            onManualOpenChange(false);
            if (parsed.startsWithSlash) {
              onDraftBodyChange('');
            }
          }}
          className="p-0.5 rounded hover:bg-black/10 cursor-pointer shrink-0"
          title={isEn ? 'Close' : 'بستن'}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className={`${compact ? 'max-h-48' : 'max-h-60'} overflow-y-auto p-1 space-y-0.5`}>
        {parsed.mode === 'catalog' ? (
          matchingCommands.length === 0 ? (
            <div className="px-3 py-3 text-center text-[11px] text-slate-400">
              {isEn
                ? 'Unknown command. Supported: /ping, /mac, /port, /status, /dns'
                : 'دستور نامعتبر است. دستورات مجاز: /ping, /mac, /port, /status, /dns'}
            </div>
          ) : (
            matchingCommands.map((item) => {
              const Icon = getCmdIcon(item.cmd);
              return (
                <button
                  key={item.cmd}
                  type="button"
                  onClick={() => handleSelectCommand(item)}
                  className={`w-full text-start px-2.5 py-1.5 rounded-lg flex items-start gap-2 text-xs transition cursor-pointer ${
                    isLightMode
                      ? 'hover:bg-cyan-50 text-slate-800'
                      : 'hover:bg-white/10 text-slate-100'
                  }`}
                >
                  <div
                    className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                      isLightMode
                        ? 'bg-cyan-50 text-cyan-700'
                        : 'bg-cyan-500/15 text-cyan-300'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-cyan-500">/{item.cmd}</span>
                      <span
                        className={`font-mono text-[10px] truncate ${
                          isLightMode ? 'text-slate-500' : 'text-slate-400'
                        }`}
                      >
                        {item.syntax}
                      </span>
                    </div>
                    <p
                      className={`text-[10.5px] leading-snug mt-0.5 ${
                        isLightMode ? 'text-slate-600' : 'text-slate-400'
                      }`}
                    >
                      {isEn ? item.descEn : item.descFa}
                    </p>
                  </div>
                </button>
              );
            })
          )
        ) : parsed.mode === 'hint' && activeDescriptor ? (
          <div className="px-3 py-2.5 space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-mono font-bold text-cyan-500">{activeDescriptor.syntax}</span>
              <span
                className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${
                  isLightMode ? 'bg-slate-100 text-slate-700' : 'bg-white/10 text-slate-300'
                }`}
              >
                {activeDescriptor.example}
              </span>
            </div>
            <p className={isLightMode ? 'text-slate-600' : 'text-slate-400'}>
              {isEn ? activeDescriptor.descEn : activeDescriptor.descFa}
            </p>
            <div
              className={`text-[10px] font-medium ${
                isLightMode ? 'text-indigo-700' : 'text-indigo-300'
              }`}
            >
              {isEn
                ? 'Press Enter to execute and broadcast RBAC-filtered telemetry to this channel.'
                : 'برای اجرا و ارسال خروجی فیلترشده بر اساس RBAC در گفتگو، کلید Enter را بزنید.'}
            </div>
          </div>
        ) : loading ? (
          <div className="py-4 flex items-center justify-center gap-2 text-xs text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-500" />
            <span>
              {isEn ? 'Loading authorized network targets...' : 'در حال یافتن تجهیزات مجاز...'}
            </span>
          </div>
        ) : searchError ? (
          <div className="px-3 py-3 text-center text-[11px] text-rose-500">{searchError}</div>
        ) : candidates.length === 0 ? (
          <div className="px-3 py-3 text-center text-[11px] text-slate-400">
            {parsed.activeCmd === 'ping'
              ? isEn
                ? 'No matching permitted inventory found. You may still press Enter to ping an IP/host directly.'
                : 'تجهیز مجازی یافت نشد؛ همچنان می‌توانید با Enter یک IP یا دامنه را مستقیماً پینگ بگیرید.'
              : isEn
              ? 'No permitted devices, ports, or servers match this filter.'
              : 'تجهیز، سرور یا پورت مجازی مطابق با این عبارت یافت نشد.'}
          </div>
        ) : (
          <>
            {candidates.map((cand, idx) => {
              const cKey = `${cand.entityType}:${cand.entityId}:${cand.portId || ''}:${idx}`;
              const Icon =
                cand.entityType === 'server'
                  ? Server
                  : cand.entityType === 'port'
                  ? Cable
                  : Router;
              return (
                <button
                  key={cKey}
                  type="button"
                  onClick={() => handleSelectEntity(cand)}
                  className={`w-full text-start px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2 text-xs transition cursor-pointer ${
                    isLightMode
                      ? 'hover:bg-cyan-50 text-slate-800'
                      : 'hover:bg-white/10 text-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon
                      className={`w-3.5 h-3.5 shrink-0 ${
                        cand.entityType === 'server'
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
                            cand.isOnline ? 'bg-emerald-400' : 'bg-rose-400'
                          }`}
                        />
                        <span className="font-semibold truncate">{cand.name}</span>
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
                      isLightMode ? 'bg-slate-100 text-slate-600' : 'bg-white/10 text-slate-300'
                    }`}
                  >
                    {cand.entityType === 'server'
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
            })}
            <div
              className={`px-2.5 py-1 text-[10px] border-t ${
                isLightMode
                  ? 'border-slate-100 text-slate-500 bg-slate-50/70'
                  : 'border-white/10 text-slate-400 bg-slate-950/40'
              }`}
            >
              {isEn
                ? 'Click a target to autofill, or press Enter to execute.'
                : 'برای تکمیل خودکار روی هدف کلیک کنید یا Enter را برای اجرا بزنید.'}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
