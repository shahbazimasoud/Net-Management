import {
  HelpdeskProtocol,
  HelpdeskSwitchLocatorResult,
  locateHelpdeskSwitchPort,
} from './api';

export type HelpdeskSwitchLocatorSubTab = 'overview' | 'path' | 'cam_arp' | 'history';

export type ClientQueryKind = 'ipv4' | 'mac' | 'invalid' | 'empty';

export function detectClientQueryKind(raw: string): ClientQueryKind {
  const s = String(raw || '').trim();
  if (!s) return 'empty';
  const ipv4Regex =
    /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
  if (ipv4Regex.test(s)) return 'ipv4';
  const hexOnly = s.replace(/[:.\-\s]/g, '');
  if (/^[0-9a-fA-F]{12}$/.test(hexOnly)) return 'mac';
  return 'invalid';
}

export interface HelpdeskSwitchLocatorRamState {
  ownerUserId: string | null;
  targetInput: string;
  username: string;
  password: string;
  protocol: HelpdeskProtocol;
  port: string;
  jeaConfigName: string;
  traceMode: 'fast_hop' | 'full_parallel';
  forceRefresh: boolean;
  selectedMacOverride: string;
  showAdvancedConn: boolean;
  activeSubTab: HelpdeskSwitchLocatorSubTab;
  loading: boolean;
  error: string | null;
  errorFa: string | null;
  blockedByException: boolean;
  data: HelpdeskSwitchLocatorResult | null;
  lastHistoryId: string | null;
  rateLimit: any | null;
  recentLookups: Array<{
    targetQuery: string;
    queryType: 'ipv4' | 'mac';
    resolvedMac: string | null;
    resolvedIp: string | null;
    endpointHostname: string | null;
    matchedSwitchName: string | null;
    matchedPort: string | null;
    vlan: string | null;
    found: boolean;
  }>;
}

function createInitialHelpdeskSwitchLocatorRamState(): HelpdeskSwitchLocatorRamState {
  return {
    ownerUserId: null,
    targetInput: '',
    username: '',
    password: '',
    protocol: 'auto',
    port: '',
    jeaConfigName: '',
    traceMode: 'fast_hop',
    forceRefresh: false,
    selectedMacOverride: 'auto',
    showAdvancedConn: false,
    activeSubTab: 'overview',
    loading: false,
    error: null,
    errorFa: null,
    blockedByException: false,
    data: null,
    lastHistoryId: null,
    rateLimit: null,
    recentLookups: [],
  };
}

let ramState: HelpdeskSwitchLocatorRamState = createInitialHelpdeskSwitchLocatorRamState();
let activeRunToken = 0;
const listeners = new Set<() => void>();

function notifyListeners(): void {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {}
  });
}

export function getHelpdeskSwitchLocatorRamSnapshot(): HelpdeskSwitchLocatorRamState {
  return ramState;
}

export function subscribeHelpdeskSwitchLocatorRam(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function patchHelpdeskSwitchLocatorRamSnapshot(
  patch:
    | Partial<HelpdeskSwitchLocatorRamState>
    | ((prev: HelpdeskSwitchLocatorRamState) => Partial<HelpdeskSwitchLocatorRamState>)
): void {
  const delta = typeof patch === 'function' ? patch(ramState) : patch;
  let next = { ...ramState, ...delta };
  if ('targetInput' in delta && delta.targetInput !== ramState.targetInput && !('selectedMacOverride' in delta)) {
    next = { ...next, selectedMacOverride: 'auto' };
  }
  ramState = next;
  notifyListeners();
}

export function bindHelpdeskSwitchLocatorRamOwner(userId: string | null | undefined): void {
  const normalized = userId ? String(userId) : null;
  if (ramState.ownerUserId && ramState.ownerUserId !== normalized) {
    activeRunToken += 1;
    ramState = createInitialHelpdeskSwitchLocatorRamState();
    ramState.ownerUserId = normalized;
    notifyListeners();
    return;
  }
  if (!ramState.ownerUserId && normalized) {
    ramState = { ...ramState, ownerUserId: normalized };
    notifyListeners();
  }
}

export function wipeHelpdeskSwitchLocatorRamSession(): void {
  activeRunToken += 1;
  const owner = ramState.ownerUserId;
  ramState = {
    ...createInitialHelpdeskSwitchLocatorRamState(),
    ownerUserId: owner,
  };
  notifyListeners();
}

export function wipeHelpdeskSwitchLocatorRamOnLogout(): void {
  activeRunToken += 1;
  ramState = createInitialHelpdeskSwitchLocatorRamState();
  notifyListeners();
}

export async function runHelpdeskSwitchLocate(opts?: {
  targetQuery?: string;
  forceRefresh?: boolean;
  macOverride?: string;
  traceModeOverride?: 'fast_hop' | 'full_parallel';
}): Promise<HelpdeskSwitchLocatorResult | null> {
  const cleanTarget = String(opts?.targetQuery ?? ramState.targetInput).trim();
  const kind = detectClientQueryKind(cleanTarget);
  if (kind === 'empty' || kind === 'invalid') {
    patchHelpdeskSwitchLocatorRamSnapshot({
      error:
        kind === 'empty'
          ? 'Please enter an IPv4 address or MAC address first.'
          : 'Invalid IPv4 or MAC format. Example: 192.168.10.45 or 00:50:56:A1:22:34.',
      errorFa:
        kind === 'empty'
          ? 'لطفاً ابتدا آدرس IP یا مک آدرس هدف را وارد کنید.'
          : 'فرمت آدرس IP یا MAC نامعتبر است. مثال: 192.168.10.45 یا 00:50:56:A1:22:34',
    });
    return null;
  }

  const effectiveTraceMode = opts?.traceModeOverride ?? ramState.traceMode;
  const effectiveMacOverride = opts?.macOverride ?? ramState.selectedMacOverride;
  const effectiveForceRefresh = opts?.forceRefresh ?? ramState.forceRefresh;

  if (opts?.targetQuery !== undefined) {
    patchHelpdeskSwitchLocatorRamSnapshot({
      targetInput: cleanTarget,
      selectedMacOverride: opts.macOverride ?? 'auto',
    });
  } else if (opts?.macOverride !== undefined) {
    patchHelpdeskSwitchLocatorRamSnapshot({ selectedMacOverride: opts.macOverride });
  }

  activeRunToken += 1;
  const myToken = activeRunToken;
  const isCancelled = () => myToken !== activeRunToken;

  patchHelpdeskSwitchLocatorRamSnapshot({
    loading: true,
    error: null,
    errorFa: null,
    blockedByException: false,
  });

  try {
    const portNum = ramState.port.trim() ? Number(ramState.port.trim()) : undefined;
    const res = await locateHelpdeskSwitchPort({
      targetQuery: cleanTarget,
      ...(kind === 'ipv4' ? { targetIp: cleanTarget } : {}),
      username: ramState.username.trim() || undefined,
      password: ramState.password || undefined,
      protocol: ramState.protocol,
      port: portNum && Number.isInteger(portNum) ? portNum : undefined,
      jeaConfigName: ramState.jeaConfigName.trim() || undefined,
      endpointMac:
        kind === 'ipv4' && effectiveMacOverride && effectiveMacOverride !== 'auto'
          ? effectiveMacOverride
          : undefined,
      forceRefresh: effectiveForceRefresh,
      traceMode: effectiveTraceMode,
    });

    if (isCancelled()) return null;

    const payload = res.data;
    patchHelpdeskSwitchLocatorRamSnapshot((prev) => {
      const nextRecent = [
        {
          targetQuery: payload.targetQuery,
          queryType: payload.queryType,
          resolvedMac: payload.tracker.resolvedMac,
          resolvedIp: payload.tracker.resolvedIp || payload.targetIp || null,
          endpointHostname: payload.endpointHostname,
          matchedSwitchName: payload.tracker.finalEdgePort?.switchName || null,
          matchedPort: payload.tracker.finalEdgePort?.port || null,
          vlan: payload.tracker.finalEdgePort?.vlan || null,
          found: Boolean(payload.tracker.finalEdgePort),
        },
        ...prev.recentLookups.filter(
          (r) => r.targetQuery.toLowerCase() !== payload.targetQuery.toLowerCase()
        ),
      ].slice(0, 8);

      return {
        loading: false,
        data: payload,
        lastHistoryId: res.historyId ?? prev.lastHistoryId,
        rateLimit: res.rateLimit ?? prev.rateLimit,
        recentLookups: nextRecent,
        selectedMacOverride:
          payload.queryType === 'ipv4' && payload.tracker.resolvedMac && effectiveMacOverride === 'auto'
            ? prev.selectedMacOverride
            : effectiveMacOverride,
      };
    });

    return payload;
  } catch (err: any) {
    if (isCancelled()) return null;
    const msg = String(err?.message || 'Failed to locate switch port');
    const msgFa = String(err?.errorFa || msg);
    patchHelpdeskSwitchLocatorRamSnapshot({
      loading: false,
      error: msg,
      errorFa: msgFa,
      blockedByException: Boolean(err?.blockedByException),
    });
    return null;
  }
}
