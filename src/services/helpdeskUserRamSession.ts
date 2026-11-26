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

export interface DelegatedUserAuthMetadata {
  active: boolean;
  source: 'helpdesk-groups';
  adminUsername: string;
  grantedAt: number;
  expiresAt: number;
}

interface DelegatedUserCredentialVault {
  ownerUserId: string;
  adminUsername: string;
  adminPassword: string; // Sealed strictly inside module closure RAM; NEVER copied into React snapshot or DOM
  grantedAt: number;
  expiresAt: number;
}

const DELEGATED_USER_CREDENTIAL_TTL_MS = 30 * 60 * 1000; // 30 minutes strict RAM TTL
let delegatedUserVault: DelegatedUserCredentialVault | null = null;

export interface HelpdeskUserRamState {
  ownerUserId: string | null;
  targetUsername: string;
  adminUsername: string;
  adminPassword: string;
  delegatedAuth: DelegatedUserAuthMetadata | null;
  pendingCredentialPromptUser: string | null;
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
    delegatedAuth: null,
    pendingCredentialPromptUser: null,
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

export function revokeDelegatedUserCredential(): void {
  const hadDelegated = delegatedUserVault !== null || ramState.delegatedAuth !== null;
  delegatedUserVault = null;
  if (hadDelegated) {
    ramState = { ...ramState, delegatedAuth: null };
    notifyListeners();
  }
}

export function hasActiveHelpdeskUserAuth(state: HelpdeskUserRamState = ramState): boolean {
  if (!state.adminUsername.trim()) return false;
  if (state.adminPassword) return true;
  if (
    state.delegatedAuth?.active &&
    delegatedUserVault &&
    delegatedUserVault.ownerUserId === (state.ownerUserId || '') &&
    delegatedUserVault.adminUsername.toLowerCase() === state.adminUsername.trim().toLowerCase() &&
    Date.now() <= delegatedUserVault.expiresAt
  ) {
    return true;
  }
  return false;
}

function resolveEffectiveUserCredentials():
  | { ok: true; adminUsername: string; adminPassword: string }
  | { ok: false; expired: boolean } {
  const username = ramState.adminUsername.trim();
  if (!username) {
    return { ok: false, expired: false };
  }
  if (ramState.adminPassword) {
    return { ok: true, adminUsername: username, adminPassword: ramState.adminPassword };
  }
  if (delegatedUserVault) {
    if (Date.now() > delegatedUserVault.expiresAt) {
      delegatedUserVault = null;
      ramState = { ...ramState, delegatedAuth: null };
      notifyListeners();
      return { ok: false, expired: true };
    }
    if (
      delegatedUserVault.ownerUserId === (ramState.ownerUserId || '') &&
      delegatedUserVault.adminUsername.toLowerCase() === username.toLowerCase() &&
      delegatedUserVault.adminPassword
    ) {
      return {
        ok: true,
        adminUsername: delegatedUserVault.adminUsername,
        adminPassword: delegatedUserVault.adminPassword,
      };
    }
  }
  return { ok: false, expired: false };
}

export function exportUserCredentialForGroupHandoff(): {
  adminUsername: string;
  adminPassword: string;
} | null {
  const creds = resolveEffectiveUserCredentials();
  if (!creds.ok) return null;
  return {
    adminUsername: creds.adminUsername,
    adminPassword: creds.adminPassword,
  };
}

export function patchHelpdeskUserRamSnapshot(
  patch:
    | Partial<HelpdeskUserRamState>
    | ((prev: HelpdeskUserRamState) => Partial<HelpdeskUserRamState>)
): void {
  const delta = typeof patch === 'function' ? patch(ramState) : patch;
  let next = { ...ramState, ...delta };

  // Manual password entry or changing admin username immediately revokes sealed delegated session
  if ('adminPassword' in delta && delta.adminPassword) {
    delegatedUserVault = null;
    next = { ...next, delegatedAuth: null, pendingCredentialPromptUser: null };
  } else if (
    'adminUsername' in delta &&
    delegatedUserVault &&
    String(delta.adminUsername || '').trim().toLowerCase() !==
      delegatedUserVault.adminUsername.toLowerCase()
  ) {
    delegatedUserVault = null;
    next = { ...next, delegatedAuth: null };
  }

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
    delegatedUserVault = null;
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
  delegatedUserVault = null;
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
  delegatedUserVault = null;
  revokeDelegatedGroupCredential();
  ramState = createInitialHelpdeskUserRamState();
  notifyListeners();
}

export function handoffUserInspectionFromGroupSession(params: {
  ownerUserId: string | null;
  targetUsername: string;
  adminUsername: string;
  adminPassword: string;
  domainController?: string;
  ldapProtocol?: 'auto' | 'ldaps' | 'ldap';
  winrmProtocol?: 'auto' | 'winrm_https' | 'winrm_http' | 'smb_rpc' | 'ssh';
}): { canAutoInspect: boolean } {
  const cleanTarget = String(params.targetUsername || '').trim();
  const cleanUser = String(params.adminUsername || '').trim();
  const cleanOwner = params.ownerUserId ? String(params.ownerUserId) : '';
  const hasSecret = Boolean(cleanUser && params.adminPassword);

  if (params.ownerUserId !== undefined) {
    bindHelpdeskUserRamOwner(params.ownerUserId);
  }

  activeRunToken += 1;

  if (hasSecret && cleanOwner) {
    const now = Date.now();
    const expiresAt = now + DELEGATED_USER_CREDENTIAL_TTL_MS;
    delegatedUserVault = {
      ownerUserId: cleanOwner,
      adminUsername: cleanUser,
      adminPassword: params.adminPassword,
      grantedAt: now,
      expiresAt,
    };

    const nextBase: HelpdeskUserRamState = {
      ...ramState,
      targetUsername: cleanTarget,
      adminUsername: cleanUser,
      adminPassword: '', // Never mirror delegated password into React state or DOM input value
      delegatedAuth: {
        active: true,
        source: 'helpdesk-groups',
        adminUsername: cleanUser,
        grantedAt: now,
        expiresAt,
      },
      pendingCredentialPromptUser: null,
      domainController: String(params.domainController || '').trim() || ramState.domainController,
      ldapProtocol: params.ldapProtocol || 'auto',
      winrmProtocol: params.winrmProtocol || 'auto',
      activeSubTab: 'overview',
      userData: null,
      overviewLoaded: false,
      securityLoaded: false,
      groupsLoaded: false,
      mailboxLoaded: false,
      loading: false,
      loadingOverview: false,
      loadingSecurity: false,
      loadingGroups: false,
      mailboxLoading: false,
      prefetchProgress: null,
      error: null,
      mailboxError: null,
      unlockError: null,
      unlockResult: null,
    };
    const hinted = resolveHintedExchangeHost(nextBase);
    ramState = {
      ...nextBase,
      exchangeServer:
        nextBase.exchangeServerEditedManually && nextBase.exchangeServer.trim()
          ? nextBase.exchangeServer.trim()
          : hinted || nextBase.exchangeServer,
    };
    notifyListeners();
    return { canAutoInspect: true };
  }

  delegatedUserVault = null;
  const fallbackBase: HelpdeskUserRamState = {
    ...ramState,
    targetUsername: cleanTarget,
    adminUsername: cleanUser || ramState.adminUsername,
    adminPassword: '',
    delegatedAuth: null,
    pendingCredentialPromptUser: cleanTarget || null,
    domainController: String(params.domainController || '').trim() || ramState.domainController,
    ldapProtocol: params.ldapProtocol || ramState.ldapProtocol,
    winrmProtocol: params.winrmProtocol || ramState.winrmProtocol,
    activeSubTab: 'overview',
    userData: null,
    overviewLoaded: false,
    securityLoaded: false,
    groupsLoaded: false,
    mailboxLoaded: false,
    error: null,
    mailboxError: null,
    unlockError: null,
    unlockResult: null,
  };
  const hinted = resolveHintedExchangeHost(fallbackBase);
  ramState = {
    ...fallbackBase,
    exchangeServer:
      fallbackBase.exchangeServerEditedManually && fallbackBase.exchangeServer.trim()
        ? fallbackBase.exchangeServer.trim()
        : hinted || fallbackBase.exchangeServer,
  };
  notifyListeners();
  return { canAutoInspect: false };
}

function buildUserRequestPayload(
  overrideTarget?: string,
  includeMailbox = false,
  extra?: Partial<HelpdeskTargetUserRequestPayload>
): { payload: HelpdeskTargetUserRequestPayload; hasAuth: boolean; expired: boolean } {
  const s = ramState;
  const creds = resolveEffectiveUserCredentials();
  const effectiveExchange =
    s.exchangeServer.trim() || resolveHintedExchangeHost(s) || undefined;
  return {
    hasAuth: creds.ok,
    expired: !creds.ok && 'expired' in creds && creds.expired,
    payload: {
      targetUsername: (overrideTarget ?? s.targetUsername).trim(),
      adminUsername: creds.ok ? creds.adminUsername : s.adminUsername.trim(),
      adminPassword: creds.ok ? creds.adminPassword : '',
      domainController: s.domainController.trim() || undefined,
      ldapProtocol: s.ldapProtocol,
      exchangeServer: effectiveExchange,
      winrmProtocol: s.winrmProtocol,
      includeMailbox,
      ...extra,
    },
  };
}

const sleepMs = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runHelpdeskUserInspect(
  overrideTarget?: string
): Promise<HelpdeskUserInspectionData | null> {
  if (overrideTarget !== undefined) {
    patchHelpdeskUserRamSnapshot({ targetUsername: overrideTarget });
  }
  const built = buildUserRequestPayload(overrideTarget, false);
  const initialPayload = built.payload;
  if (!initialPayload.targetUsername || !built.hasAuth) {
    if (initialPayload.targetUsername && !built.hasAuth) {
      patchHelpdeskUserRamSnapshot({
        pendingCredentialPromptUser: initialPayload.targetUsername,
        ...(built.expired
          ? {
              error:
                'Delegated RAM credential expired after 30 minutes. Please enter your domain password above.',
            }
          : {}),
      });
    }
    return null;
  }

  activeRunToken += 1;
  const myToken = activeRunToken;
  const isCancelled = () => myToken !== activeRunToken;

  // Step 1/4: Tab 1 — Profile, Role & Contact Info (plus fast AD lookup)
  patchHelpdeskUserRamSnapshot({
    pendingCredentialPromptUser: null,
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
    const mbxBuilt = buildUserRequestPayload(
      data.profile.samAccountName,
      true,
      inspectHistoryId ? { historyId: inspectHistoryId } : undefined
    );
    const mbxRes = await refreshHelpdeskTargetMailbox(mbxBuilt.payload);
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
  const built = buildUserRequestPayload(
    undefined,
    true,
    ramState.lastHistoryId ? { historyId: ramState.lastHistoryId } : undefined
  );
  if (!built.payload.targetUsername || !built.hasAuth) {
    return null;
  }

  patchHelpdeskUserRamSnapshot({
    mailboxLoading: true,
    mailboxError: null,
  });

  try {
    const res = await refreshHelpdeskTargetMailbox(built.payload);
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
  const built = buildUserRequestPayload(undefined, false);
  if (!built.payload.targetUsername || !built.hasAuth) {
    return;
  }

  patchHelpdeskUserRamSnapshot({
    unlocking: true,
    unlockError: null,
    unlockResult: null,
  });

  try {
    const res = await unlockHelpdeskTargetUser(built.payload);
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
