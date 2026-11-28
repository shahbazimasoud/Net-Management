import {
  HelpdeskSwitchLocatorResult,
  locateHelpdeskSwitchPort,
} from './api';

export type HelpdeskSwitchLocatorSubTab = 'overview' | 'path' | 'cam_arp' | 'history';

export type ClientQueryKind = 'mac' | 'ipv4_disallowed' | 'invalid' | 'empty';

export function detectClientQueryKind(raw: string): ClientQueryKind {
  const s = String(raw || '').trim();
  if (!s) return 'empty';
  const hexOnly = s.replace(/[:.\-\s]/g, '');
  if (/^[0-9a-fA-F]{12}$/.test(hexOnly)) return 'mac';
  const ipv4Regex =
    /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
  if (ipv4Regex.test(s)) return 'ipv4_disallowed';
  return 'invalid';
}

export interface HelpdeskSwitchLocatorRamState {
  ownerUserId: string | null;
  targetInput: string;
  traceMode: 'fast_hop' | 'full_parallel';
  forceRefresh: boolean;
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
    traceMode: 'fast_hop',
    forceRefresh: false,
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
  ramState = { ...ramState, ...delta };
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
  traceModeOverride?: 'fast_hop' | 'full_parallel';
}): Promise<HelpdeskSwitchLocatorResult | null> {
  const cleanTarget = String(opts?.targetQuery ?? ramState.targetInput).trim();
  const kind = detectClientQueryKind(cleanTarget);
  if (kind !== 'mac') {
    patchHelpdeskSwitchLocatorRamSnapshot({
      error:
        kind === 'empty'
          ? 'Please enter a target MAC address first.'
          : kind === 'ipv4_disallowed'
          ? 'IPv4 lookup is disabled here because cross-subnet L2 traces require a MAC address. Please enter the MAC address directly.'
          : 'Invalid MAC address format. Supported formats: AA:BB:CC:DD:EE:FF, AA-BB-CC-DD-EE-FF, or aabb.ccdd.eeff.',
      errorFa:
        kind === 'empty'
          ? 'لطفاً ابتدا مک آدرس (MAC) هدف را وارد کنید.'
          : kind === 'ipv4_disallowed'
          ? 'ورود IP در این بخش حذف شده است (زیرا در سابنت‌های مختلف جستجو انجام نمی‌شود). لطفاً فقط مک آدرس (MAC) را وارد کنید.'
          : 'فرمت مک آدرس نامعتبر است. فرمت‌های مجاز: AA:BB:CC:DD:EE:FF یا AA-BB-CC-DD-EE-FF یا aabb.ccdd.eeff',
    });
    return null;
  }

  const effectiveTraceMode = opts?.traceModeOverride ?? ramState.traceMode;
  const effectiveForceRefresh = opts?.forceRefresh ?? ramState.forceRefresh;

  if (opts?.targetQuery !== undefined) {
    patchHelpdeskSwitchLocatorRamSnapshot({
      targetInput: cleanTarget,
    });
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
    const res = await locateHelpdeskSwitchPort({
      targetQuery: cleanTarget,
      forceRefresh: effectiveForceRefresh,
      traceMode: effectiveTraceMode,
    });

    if (isCancelled()) return null;

    const payload = res.data;
    patchHelpdeskSwitchLocatorRamSnapshot((prev) => {
      const nextRecent = [
        {
          targetQuery: payload.targetQuery,
          queryType: 'mac' as const,
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
