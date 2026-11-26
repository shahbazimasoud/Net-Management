import {
  HelpdeskUserInspectionData,
  HelpdeskUserMailboxInfo,
  HelpdeskTargetUserRequestPayload,
  inspectHelpdeskTargetUser,
  refreshHelpdeskTargetMailbox,
  unlockHelpdeskTargetUser,
} from './api';
import { loadActiveDirectoryConfig } from './settingsStorage';
import { revokeDelegatedGroupCredential } from './helpdeskGroupRamSession';

export type HelpdeskUserSubTab =
  | 'overview'
  | 'security'
  | 'groups'
  | 'mailbox'
  | 'reports'
  | 'history';

export interface HelpdeskUserPrefetchProgress {
  active: boolean;
  step: number;
  total: number;
  currentTab: HelpdeskUserSubTab | null;
  labelEn: string;
  labelFa: string;
}

export interface HelpdeskUserRamState {
  ownerUserId: string | null;
  targetUsername: string;
  adminUsername: string;
  adminPassword: string;
  domainController: string;
  ldapProtocol: 'auto' | 'ldaps' | 'ldap';
  exchangeServer: string;
  exchangeServerEditedManually: boolean;
  winrmProtocol: 'auto' | 'winrm_https' | 'winrm_http' | 'smb_rpc' | 'ssh';
  showAdvancedConn: boolean;
  activeSubTab: HelpdeskUserSubTab;
  prefetchProgress: HelpdeskUserPrefetchProgress | null;
  rateLimit: any | null;

  userData: HelpdeskUserInspectionData | null;
  loading: boolean;
  loadingOverview: boolean;
  loadingSecurity: boolean;
  loadingGroups: boolean;
  overviewLoaded: boolean;
  securityLoaded: boolean;
  groupsLoaded: boolean;
  mailboxLoaded: boolean;
  error: string | null;
  lastHistoryId: string | null;

  mailboxLoading: boolean;
  mailboxError: string | null;

  unlocking: boolean;
  unlockError: string | null;
  unlockResult: {
    unlocked: boolean;
    wasLocked: boolean;
    stillLockedAfter: boolean;
    samAccountName: string;
    displayName: string;
    domainController: string;
    methodUsed: string;
    message: string;
    messageFa: string;
    unlockedAt: string;
  } | null;

  recentUsers: Array<{
    samAccountName: string;
    displayName: string;
    department: string;
    accountLocked: boolean;
  }>;
}

const INTERNAL_AD_DOMAIN_TLDS = new Set([
  'local',
  'lan',
  'internal',
  'intranet',
  'corp',
  'home',
  'localdomain',
  'priv',
  'arpa',
  'workgroup',
  'ad',
  'ds',
  'test',
  'localhost',
]);

export function isPublicSuffixDomain(domainName?: string | null): boolean {
  const clean = String(domainName || '').trim().replace(/^\.+|\.+$/g, '').toLowerCase();
  if (!clean || !clean.includes('.')) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(clean) || clean.includes(':')) return false;
  const labels = clean.split('.').filter(Boolean);
  if (labels.length < 2) return false;
  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,24}$/.test(tld)) return false;
  return !INTERNAL_AD_DOMAIN_TLDS.has(tld);
}

export function deriveDefaultExchangeHostForDomain(domainName?: string | null): string {
  const clean = String(domainName || '').trim().replace(/^\.+|\.+$/g, '').toLowerCase();
  if (!clean || !clean.includes('.')) return '';
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(clean) || clean.includes(':')) return '';
  if (clean.startsWith('mail.')) return clean;
  return `mail.${clean}`;
}

export function resolveHintedExchangeHost(state?: Partial<HelpdeskUserRamState>): string {
  const s = state || ramState;
  const extractAtDomain = (val?: string | null) => {
    const str = String(val || '').trim();
    if (!str.includes('@')) return '';
    const dom = str.split('@').pop()?.trim().replace(/^\.+|\.+$/g, '').toLowerCase() || '';
    return dom.includes('.') ? dom : '';
  };

  const savedAdDomain = (() => {
    try {
      return loadActiveDirectoryConfig()?.domain || '';
    } catch {
      return '';
    }
  })();

  const userEmailDomains = [
    extractAtDomain(s.userData?.contact?.primaryEmail),
    ...(s.userData?.contact?.emailAliases || []).map((a) => extractAtDomain(a.address)),
  ].filter(Boolean);

  const otherDomains = [
    extractAtDomain(s.userData?.profile?.userPrincipalName),
    extractAtDomain(s.targetUsername),
    extractAtDomain(s.adminUsername),
    String(s.userData?.connectionInfo?.domainName || '').trim(),
    String(savedAdDomain || '').trim(),
  ].filter((d) => d.includes('.'));

  // 1) User's registered email domain with a public suffix (e.g. ali@company.com -> mail.company.com)
  const publicUserEmailDomain = userEmailDomains.find((d) => isPublicSuffixDomain(d));
  if (publicUserEmailDomain) {
    return deriveDefaultExchangeHostForDomain(publicUserEmailDomain);
  }

  // 2) Any public-suffix domain (e.g. UPN / AD public domain)
  const publicOtherDomain = otherDomains.find((d) => isPublicSuffixDomain(d));
  if (publicOtherDomain) {
    return deriveDefaultExchangeHostForDomain(publicOtherDomain);
  }

  // 3) User's registered email domain even if internal
  if (userEmailDomains[0]) {
    return deriveDefaultExchangeHostForDomain(userEmailDomains[0]);
  }

  // 4) Fallback AD / input domain
  return deriveDefaultExchangeHostForDomain(otherDomains[0] || '');
}

function createInitialHelpdeskUserRamState(): HelpdeskUserRamState {
  const defaultExch = resolveHintedExchangeHost({
    adminUsername: '',
    targetUsername: '',
  });
  return {
    ownerUserId: null,
    targetUsername: '',
    adminUsername: '',
    adminPassword: '',
    domainController: '',
    ldapProtocol: 'auto',
    exchangeServer: defaultExch,
    exchangeServerEditedManually: false,
    winrmProtocol: 'auto',
    showAdvancedConn: false,
    activeSubTab: 'overview',
    prefetchProgress: null,
    rateLimit: null,
    userData: null,
    loading: false,
    loadingOverview: false,
    loadingSecurity: false,
    loadingGroups: false,
    overviewLoaded: false,
    securityLoaded: false,
    groupsLoaded: false,
    mailboxLoaded: false,
    error: null,
    lastHistoryId: null,
    mailboxLoading: false,
    mailboxError: null,
    unlocking: false,
    unlockError: null,
    unlockResult: null,
    recentUsers: [],
  };
}

let ramState: HelpdeskUserRamState = createInitialHelpdeskUserRamState();
let activeRunToken = 0;
const listeners = new Set<() => void>();

function notifyListeners(): void {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {}
  });
}

export function getHelpdeskUserRamSnapshot(): HelpdeskUserRamState {
  return ramState;
}

export function subscribeHelpdeskUserRam(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function patchHelpdeskUserRamSnapshot(
  patch:
    | Partial<HelpdeskUserRamState>
    | ((prev: HelpdeskUserRamState) => Partial<HelpdeskUserRamState>)
): void {
  const delta = typeof patch === 'function' ? patch(ramState) : patch;
  let next = { ...ramState, ...delta };

  // Keep exchangeServer auto-synced to mail.<domain> unless user edited it manually
  if (!next.exchangeServerEditedManually && !('exchangeServer' in delta)) {
    const hinted = resolveHintedExchangeHost(next);
    if (hinted) {
      next = { ...next, exchangeServer: hinted };
    }
  }

  ramState = next;
  notifyListeners();
}

export function bindHelpdeskUserRamOwner(userId: string | null | undefined): void {
  const normalized = userId ? String(userId) : null;
  if (ramState.ownerUserId && ramState.ownerUserId !== normalized) {
    activeRunToken += 1;
    revokeDelegatedGroupCredential();
    ramState = createInitialHelpdeskUserRamState();
    ramState.ownerUserId = normalized;
    notifyListeners();
    return;
  }
  if (!ramState.ownerUserId && normalized) {
    const hinted = resolveHintedExchangeHost(ramState);
    ramState = {
      ...ramState,
      ownerUserId: normalized,
      ...(!ramState.exchangeServerEditedManually && !ramState.exchangeServer && hinted
        ? { exchangeServer: hinted }
        : {}),
    };
    notifyListeners();
  }
}

export function stopHelpdeskUserPrefetch(): void {
  activeRunToken += 1;
  patchHelpdeskUserRamSnapshot({
    loading: false,
    loadingOverview: false,
    loadingSecurity: false,
    loadingGroups: false,
    mailboxLoading: false,
    prefetchProgress: null,
  });
}

export function wipeHelpdeskUserRamSession(): void {
  activeRunToken += 1;
  revokeDelegatedGroupCredential();
  const owner = ramState.ownerUserId;
  ramState = {
    ...createInitialHelpdeskUserRamState(),
    ownerUserId: owner,
  };
  notifyListeners();
}

export function wipeHelpdeskUserRamOnLogout(): void {
  activeRunToken += 1;
  revokeDelegatedGroupCredential();
  ramState = createInitialHelpdeskUserRamState();
  notifyListeners();
}

function buildUserRequestPayload(
  overrideTarget?: string,
  includeMailbox = false,
  extra?: Partial<HelpdeskTargetUserRequestPayload>
): HelpdeskTargetUserRequestPayload {
  const s = ramState;
  const effectiveExchange =
    s.exchangeServer.trim() || resolveHintedExchangeHost(s) || undefined;
  return {
    targetUsername: (overrideTarget ?? s.targetUsername).trim(),
    adminUsername: s.adminUsername.trim(),
    adminPassword: s.adminPassword,
    domainController: s.domainController.trim() || undefined,
    ldapProtocol: s.ldapProtocol,
    exchangeServer: effectiveExchange,
    winrmProtocol: s.winrmProtocol,
    includeMailbox,
    ...extra,
  };
}

const sleepMs = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runHelpdeskUserInspect(
  overrideTarget?: string
): Promise<HelpdeskUserInspectionData | null> {
  if (overrideTarget !== undefined) {
    patchHelpdeskUserRamSnapshot({ targetUsername: overrideTarget });
  }
  const initialPayload = buildUserRequestPayload(overrideTarget, false);
  if (
    !initialPayload.targetUsername ||
    !initialPayload.adminUsername ||
    !initialPayload.adminPassword
  ) {
    return null;
  }

  activeRunToken += 1;
  const myToken = activeRunToken;
  const isCancelled = () => myToken !== activeRunToken;

  // Step 1/4: Tab 1 — Profile, Role & Contact Info (plus fast AD lookup)
  patchHelpdeskUserRamSnapshot({
    loading: true,
    loadingOverview: true,
    loadingSecurity: false,
    loadingGroups: false,
    mailboxLoading: false,
    overviewLoaded: false,
    securityLoaded: false,
    groupsLoaded: false,
    mailboxLoaded: false,
    error: null,
    mailboxError: null,
    unlockError: null,
    unlockResult: null,
    prefetchProgress: {
      active: true,
      step: 1,
      total: 4,
      currentTab: 'overview',
      labelEn: 'Profile, Role & Contact Info',
      labelFa: 'پروفایل سازمانی و راه‌های ارتباطی',
    },
  });

  let data: HelpdeskUserInspectionData;
  let inspectHistoryId: string | undefined;
  try {
    const res = await inspectHelpdeskTargetUser(initialPayload);
    if (isCancelled()) return null;
    data = res.data;
    inspectHistoryId = res.historyId;

    const autoMailHost = resolveHintedExchangeHost({
      ...ramState,
      userData: data,
    });

    patchHelpdeskUserRamSnapshot((prev) => {
      const nextRecent = [
        {
          samAccountName: data.profile.samAccountName,
          displayName: data.profile.displayName || data.profile.samAccountName,
          department: data.profile.department || '',
          accountLocked: Boolean(data.security.accountLocked),
        },
        ...prev.recentUsers.filter(
          (u) => u.samAccountName.toLowerCase() !== data.profile.samAccountName.toLowerCase()
        ),
      ].slice(0, 8);

      const nextExchangeServer =
        prev.exchangeServerEditedManually && prev.exchangeServer.trim()
          ? prev.exchangeServer.trim()
          : autoMailHost || prev.exchangeServer.trim();

      return {
        loading: false,
        loadingOverview: false,
        overviewLoaded: true,
        userData: data,
        lastHistoryId: inspectHistoryId || null,
        exchangeServer: nextExchangeServer,
        rateLimit: res.rateLimit || prev.rateLimit,
        recentUsers: nextRecent,
      };
    });
  } catch (err: any) {
    if (isCancelled()) return null;
    const msg = String(err?.message || 'Failed to inspect target domain user');
    patchHelpdeskUserRamSnapshot({
      loading: false,
      loadingOverview: false,
      prefetchProgress: null,
      error: msg,
    });
    return null;
  }

  // Step 2/4: Tab 2 — Password, Lockout & Security
  if (isCancelled()) return data;
  patchHelpdeskUserRamSnapshot({
    loadingSecurity: true,
    prefetchProgress: {
      active: true,
      step: 2,
      total: 4,
      currentTab: 'security',
      labelEn: 'Password, Lockout & Security',
      labelFa: 'رمز عبور، قفل اکانت و امنیت',
    },
  });
  await sleepMs(160);
  if (isCancelled()) return data;
  patchHelpdeskUserRamSnapshot({
    loadingSecurity: false,
    securityLoaded: true,
  });

  // Step 3/4: Tab 3 — AD Groups & OU Directory
  if (isCancelled()) return data;
  patchHelpdeskUserRamSnapshot({
    loadingGroups: true,
    prefetchProgress: {
      active: true,
      step: 3,
      total: 4,
      currentTab: 'groups',
      labelEn: 'AD Groups & OU Directory',
      labelFa: 'گروه‌های اکتیو دایرکتوری و ساختار OU',
    },
  });
  await sleepMs(140);
  if (isCancelled()) return data;
  patchHelpdeskUserRamSnapshot({
    loadingGroups: false,
    groupsLoaded: true,
  });

  // Step 4/4: Tab 4 — Live Exchange Mailbox Size & Quota (using mail.<domain> by default)
  if (isCancelled()) return data;
  patchHelpdeskUserRamSnapshot({
    mailboxLoading: true,
    mailboxError: null,
    prefetchProgress: {
      active: true,
      step: 4,
      total: 4,
      currentTab: 'mailbox',
      labelEn: 'Mailbox Size & Exchange Quota',
      labelFa: 'حجم میل‌باکس و سهمیه Exchange',
    },
  });

  try {
    const mbxPayload = buildUserRequestPayload(
      data.profile.samAccountName,
      true,
      inspectHistoryId ? { historyId: inspectHistoryId } : undefined
    );
    const mbxRes = await refreshHelpdeskTargetMailbox(mbxPayload);
    if (!isCancelled()) {
      patchHelpdeskUserRamSnapshot((prev) => ({
        mailboxLoading: false,
        mailboxLoaded: true,
        prefetchProgress: null,
        rateLimit: mbxRes.rateLimit || prev.rateLimit,
        userData: prev.userData ? { ...prev.userData, mailbox: mbxRes.data } : prev.userData,
      }));
    }
  } catch (err: any) {
    if (!isCancelled()) {
      patchHelpdeskUserRamSnapshot({
        mailboxLoading: false,
        mailboxLoaded: true,
        prefetchProgress: null,
        mailboxError: String(err?.message || 'Exchange mailbox query failed'),
      });
    }
  }

  return data;
}

export async function runHelpdeskUserMailboxRefresh(): Promise<HelpdeskUserMailboxInfo | null> {
  const payload = buildUserRequestPayload(
    undefined,
    true,
    ramState.lastHistoryId ? { historyId: ramState.lastHistoryId } : undefined
  );
  if (!payload.targetUsername || !payload.adminUsername || !payload.adminPassword) {
    return null;
  }

  patchHelpdeskUserRamSnapshot({
    mailboxLoading: true,
    mailboxError: null,
  });

  try {
    const res = await refreshHelpdeskTargetMailbox(payload);
    patchHelpdeskUserRamSnapshot((prev) => ({
      mailboxLoading: false,
      mailboxLoaded: true,
      rateLimit: res.rateLimit || prev.rateLimit,
      userData: prev.userData ? { ...prev.userData, mailbox: res.data } : prev.userData,
    }));
    return res.data;
  } catch (err: any) {
    patchHelpdeskUserRamSnapshot({
      mailboxLoading: false,
      mailboxError: String(err?.message || 'Exchange mailbox query failed'),
    });
    return null;
  }
}

export async function runHelpdeskUserUnlock(): Promise<void> {
  const payload = buildUserRequestPayload(undefined, false);
  if (!payload.targetUsername || !payload.adminUsername || !payload.adminPassword) {
    return;
  }

  patchHelpdeskUserRamSnapshot({
    unlocking: true,
    unlockError: null,
    unlockResult: null,
  });

  try {
    const res = await unlockHelpdeskTargetUser(payload);
    patchHelpdeskUserRamSnapshot((prev) => {
      const updatedUserData =
        prev.userData && res.data.unlocked
          ? {
              ...prev.userData,
              security: {
                ...prev.userData.security,
                accountLocked: false,
                lockoutState: 'unlocked' as const,
                lockoutTimeRaw: '0',
                lockedAt: null,
                lockoutExpiresAt: null,
                lockoutRemainingMinutes: null,
              },
            }
          : prev.userData;

      return {
        unlocking: false,
        unlockResult: res.data,
        rateLimit: res.rateLimit || prev.rateLimit,
        userData: updatedUserData,
        recentUsers: prev.recentUsers.map((u) =>
          u.samAccountName.toLowerCase() === res.data.samAccountName.toLowerCase()
            ? { ...u, accountLocked: res.data.stillLockedAfter }
            : u
        ),
      };
    });
  } catch (err: any) {
    patchHelpdeskUserRamSnapshot({
      unlocking: false,
      unlockError: String(err?.message || 'Failed to unlock user account'),
    });
  }
}
