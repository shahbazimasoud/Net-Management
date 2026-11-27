import {
  AdGroupCategory,
  AdGroupScope,
  HelpdeskGroupInspectionData,
  HelpdeskGroupMemberActionResult,
  HelpdeskGroupSearchHit,
  inspectHelpdeskTargetGroup,
  manageHelpdeskGroupMember,
  searchHelpdeskDomainGroups,
} from './api';
import { revokeDelegatedUserCredential } from './helpdeskUserRamSession';

export type HelpdeskGroupSubTab =
  | 'overview'
  | 'members'
  | 'permissions'
  | 'reports'
  | 'history';

export interface HelpdeskGroupPrefetchProgress {
  active: boolean;
  step: number;
  total: number;
  currentTab: HelpdeskGroupSubTab | null;
  labelEn: string;
  labelFa: string;
}

export interface DelegatedAuthMetadata {
  active: boolean;
  source: 'helpdesk-users';
  adminUsername: string;
  grantedAt: number;
  expiresAt: number;
}

interface DelegatedCredentialVault {
  ownerUserId: string;
  adminUsername: string;
  adminPassword: string; // Sealed strictly inside module closure RAM; NEVER copied into React snapshot or DOM
  grantedAt: number;
  expiresAt: number;
}

const DELEGATED_CREDENTIAL_TTL_MS = 30 * 60 * 1000; // 30 minutes strict RAM TTL
let delegatedVault: DelegatedCredentialVault | null = null;

export interface HelpdeskGroupRamState {
  ownerUserId: string | null;
  targetGroup: string;
  adminUsername: string;
  adminPassword: string;
  delegatedAuth: DelegatedAuthMetadata | null;
  pendingCredentialPromptGroup: string | null;
  domainController: string;
  ldapProtocol: 'auto' | 'ldaps' | 'ldap';
  winrmProtocol: 'auto' | 'winrm_https' | 'winrm_http' | 'smb_rpc' | 'ssh';
  showAdvancedConn: boolean;
  activeSubTab: HelpdeskGroupSubTab;
  prefetchProgress: HelpdeskGroupPrefetchProgress | null;
  rateLimit: any | null;

  groupData: HelpdeskGroupInspectionData | null;
  loading: boolean;
  loadingOverview: boolean;
  loadingMembers: boolean;
  loadingPermissions: boolean;
  overviewLoaded: boolean;
  membersLoaded: boolean;
  permissionsLoaded: boolean;
  error: string | null;
  errorFa: string | null;
  blockedByException: boolean;
  lastHistoryId: string | null;

  searchingGroups: boolean;
  searchError: string | null;
  searchErrorFa: string | null;
  searchResults: HelpdeskGroupSearchHit[];
  searchMeta: { domainController: string; domainName: string } | null;

  memberActionLoading: boolean;
  memberActionError: string | null;
  memberActionResult: HelpdeskGroupMemberActionResult | null;

  recentGroups: Array<{
    cn: string;
    samAccountName: string;
    ou: string;
    groupScope: AdGroupScope;
    groupCategory: AdGroupCategory;
    isPrivileged: boolean;
    memberTotal: number;
  }>;
}

const createInitialState = (ownerUserId: string | null = null): HelpdeskGroupRamState => ({
  ownerUserId,
  targetGroup: '',
  adminUsername: '',
  adminPassword: '',
  delegatedAuth: null,
  pendingCredentialPromptGroup: null,
  domainController: '',
  ldapProtocol: 'auto',
  winrmProtocol: 'auto',
  showAdvancedConn: false,
  activeSubTab: 'overview',
  prefetchProgress: null,
  rateLimit: null,

  groupData: null,
  loading: false,
  loadingOverview: false,
  loadingMembers: false,
  loadingPermissions: false,
  overviewLoaded: false,
  membersLoaded: false,
  permissionsLoaded: false,
  error: null,
  errorFa: null,
  blockedByException: false,
  lastHistoryId: null,

  searchingGroups: false,
  searchError: null,
  searchErrorFa: null,
  searchResults: [],
  searchMeta: null,

  memberActionLoading: false,
  memberActionError: null,
  memberActionResult: null,

  recentGroups: [],
});

let ramState: HelpdeskGroupRamState = createInitialState(null);
let activeRunToken = 0;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {}
  });
}

export function subscribeHelpdeskGroupRam(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getHelpdeskGroupRamSnapshot(): HelpdeskGroupRamState {
  return ramState;
}

export function revokeDelegatedGroupCredential(): void {
  const hadDelegated = delegatedVault !== null || ramState.delegatedAuth !== null;
  delegatedVault = null;
  if (hadDelegated) {
    ramState = { ...ramState, delegatedAuth: null };
    notify();
  }
}

export function hasActiveHelpdeskGroupAuth(state: HelpdeskGroupRamState = ramState): boolean {
  if (!state.adminUsername.trim()) return false;
  if (state.adminPassword) return true;
  if (
    state.delegatedAuth?.active &&
    delegatedVault &&
    delegatedVault.ownerUserId === (state.ownerUserId || '') &&
    delegatedVault.adminUsername.toLowerCase() === state.adminUsername.trim().toLowerCase() &&
    Date.now() <= delegatedVault.expiresAt
  ) {
    return true;
  }
  return false;
}

function resolveEffectiveGroupCredentials():
  | { ok: true; adminUsername: string; adminPassword: string }
  | { ok: false; expired: boolean } {
  const username = ramState.adminUsername.trim();
  if (!username) {
    return { ok: false, expired: false };
  }
  if (ramState.adminPassword) {
    return { ok: true, adminUsername: username, adminPassword: ramState.adminPassword };
  }
  if (delegatedVault) {
    if (Date.now() > delegatedVault.expiresAt) {
      delegatedVault = null;
      ramState = { ...ramState, delegatedAuth: null };
      notify();
      return { ok: false, expired: true };
    }
    if (
      delegatedVault.ownerUserId === (ramState.ownerUserId || '') &&
      delegatedVault.adminUsername.toLowerCase() === username.toLowerCase() &&
      delegatedVault.adminPassword
    ) {
      return {
        ok: true,
        adminUsername: delegatedVault.adminUsername,
        adminPassword: delegatedVault.adminPassword,
      };
    }
  }
  return { ok: false, expired: false };
}

export function exportGroupCredentialForUserHandoff(): {
  adminUsername: string;
  adminPassword: string;
} | null {
  const creds = resolveEffectiveGroupCredentials();
  if (!creds.ok) return null;
  return {
    adminUsername: creds.adminUsername,
    adminPassword: creds.adminPassword,
  };
}

export function patchHelpdeskGroupRamSnapshot(
  patch: Partial<HelpdeskGroupRamState> | ((prev: HelpdeskGroupRamState) => Partial<HelpdeskGroupRamState>)
) {
  const nextPatch = typeof patch === 'function' ? patch(ramState) : patch;
  let nextState = { ...ramState, ...nextPatch };

  // Any manual password entry or username change immediately revokes the sealed delegated session
  if ('adminPassword' in nextPatch && nextPatch.adminPassword) {
    delegatedVault = null;
    nextState = { ...nextState, delegatedAuth: null, pendingCredentialPromptGroup: null };
  } else if (
    'adminUsername' in nextPatch &&
    delegatedVault &&
    String(nextPatch.adminUsername || '').trim().toLowerCase() !== delegatedVault.adminUsername.toLowerCase()
  ) {
    delegatedVault = null;
    nextState = { ...nextState, delegatedAuth: null };
  }

  ramState = nextState;
  notify();
}

export function stopHelpdeskGroupPrefetch(): void {
  activeRunToken += 1;
  patchHelpdeskGroupRamSnapshot({
    loading: false,
    loadingOverview: false,
    loadingMembers: false,
    loadingPermissions: false,
    prefetchProgress: null,
  });
}

export function bindHelpdeskGroupRamOwner(userId: string | null) {
  if (ramState.ownerUserId !== null && ramState.ownerUserId !== userId) {
    activeRunToken += 1;
    delegatedVault = null;
    revokeDelegatedUserCredential();
    ramState = createInitialState(userId);
    notify();
  } else if (ramState.ownerUserId === null && userId !== null) {
    ramState = { ...ramState, ownerUserId: userId };
    notify();
  }
}

export function wipeHelpdeskGroupRamSession() {
  activeRunToken += 1;
  delegatedVault = null;
  revokeDelegatedUserCredential();
  const currentOwner = ramState.ownerUserId;
  ramState = createInitialState(currentOwner);
  notify();
}

export function wipeHelpdeskGroupRamOnLogout() {
  activeRunToken += 1;
  delegatedVault = null;
  revokeDelegatedUserCredential();
  ramState = createInitialState(null);
  notify();
}

export function handoffGroupInspectionFromUserSession(params: {
  ownerUserId: string | null;
  targetGroup: string;
  adminUsername: string;
  adminPassword: string;
  domainController?: string;
  ldapProtocol?: 'auto' | 'ldaps' | 'ldap';
  winrmProtocol?: 'auto' | 'winrm_https' | 'winrm_http' | 'smb_rpc' | 'ssh';
}): { canAutoInspect: boolean } {
  const cleanTarget = String(params.targetGroup || '').trim();
  const cleanUser = String(params.adminUsername || '').trim();
  const cleanOwner = params.ownerUserId ? String(params.ownerUserId) : '';
  const hasSecret = Boolean(cleanUser && params.adminPassword);

  if (params.ownerUserId !== undefined) {
    bindHelpdeskGroupRamOwner(params.ownerUserId);
  }

  activeRunToken += 1;

  if (hasSecret && cleanOwner) {
    const now = Date.now();
    const expiresAt = now + DELEGATED_CREDENTIAL_TTL_MS;
    delegatedVault = {
      ownerUserId: cleanOwner,
      adminUsername: cleanUser,
      adminPassword: params.adminPassword,
      grantedAt: now,
      expiresAt,
    };
    ramState = {
      ...ramState,
      targetGroup: cleanTarget,
      adminUsername: cleanUser,
      adminPassword: '', // Never mirror delegated password into React state or DOM input value
      delegatedAuth: {
        active: true,
        source: 'helpdesk-users',
        adminUsername: cleanUser,
        grantedAt: now,
        expiresAt,
      },
      pendingCredentialPromptGroup: null,
      domainController: String(params.domainController || '').trim(),
      ldapProtocol: params.ldapProtocol || 'auto',
      winrmProtocol: params.winrmProtocol || 'auto',
      activeSubTab: 'overview',
      groupData: null,
      loading: false,
      loadingOverview: false,
      loadingMembers: false,
      loadingPermissions: false,
      overviewLoaded: false,
      membersLoaded: false,
      permissionsLoaded: false,
      prefetchProgress: null,
      error: null,
      memberActionError: null,
      memberActionResult: null,
    };
    notify();
    return { canAutoInspect: true };
  }

  delegatedVault = null;
  ramState = {
    ...ramState,
    targetGroup: cleanTarget,
    adminUsername: cleanUser || ramState.adminUsername,
    adminPassword: '',
    delegatedAuth: null,
    pendingCredentialPromptGroup: cleanTarget || null,
    domainController: String(params.domainController || '').trim() || ramState.domainController,
    ldapProtocol: params.ldapProtocol || ramState.ldapProtocol,
    winrmProtocol: params.winrmProtocol || ramState.winrmProtocol,
    activeSubTab: 'overview',
    groupData: null,
    loading: false,
    loadingOverview: false,
    loadingMembers: false,
    loadingPermissions: false,
    overviewLoaded: false,
    membersLoaded: false,
    permissionsLoaded: false,
    prefetchProgress: null,
    error: null,
  };
  notify();
  return { canAutoInspect: false };
}

export async function runHelpdeskGroupSearch(queryOverride?: string): Promise<void> {
  const snap = ramState;
  const creds = resolveEffectiveGroupCredentials();
  if (!creds.ok) {
    const isExpired = 'expired' in creds && creds.expired;
    patchHelpdeskGroupRamSnapshot({
      searchError: isExpired
        ? 'Delegated RAM session expired after 30 minutes for security. Please re-enter domain password.'
        : 'Privileged domain username & password are required first.',
      searchErrorFa: isExpired
        ? 'نشست رمز تفویض‌شده در حافظه RAM پس از ۳۰ دقیقه منقضی شد. لطفاً رمز عبور دامین را دوباره وارد کنید.'
        : 'ابتدا نام کاربری و رمز عبور ادمین دامین را وارد کنید.',
    });
    return;
  }

  patchHelpdeskGroupRamSnapshot({
    searchingGroups: true,
    searchError: null,
    searchErrorFa: null,
  });

  try {
    const res = await searchHelpdeskDomainGroups({
      query: (queryOverride !== undefined ? queryOverride : snap.targetGroup).trim(),
      adminUsername: creds.adminUsername,
      adminPassword: creds.adminPassword,
      domainController: snap.domainController.trim() || undefined,
      ldapProtocol: snap.ldapProtocol,
      limit: 50,
    });
    patchHelpdeskGroupRamSnapshot({
      searchingGroups: false,
      searchResults: res.data.groups || [],
      searchMeta: {
        domainController: res.data.domainController,
        domainName: res.data.domainName,
      },
      rateLimit: res.rateLimit ?? ramState.rateLimit,
    });
  } catch (err: any) {
    patchHelpdeskGroupRamSnapshot({
      searchingGroups: false,
      searchError: err?.message || 'Failed to search Active Directory groups',
      searchErrorFa: err?.errorFa || err?.message || 'جستجوی گروه‌های اکتیو دایرکتوری ناموفق بود',
    });
  }
}

export async function runHelpdeskGroupInspect(overrideTargetGroup?: string): Promise<void> {
  const snap = ramState;
  const target = (overrideTargetGroup ?? snap.targetGroup).trim();
  const creds = resolveEffectiveGroupCredentials();
  if (!target || !creds.ok) {
    if (target && !creds.ok) {
      const isExpired = 'expired' in creds && creds.expired;
      patchHelpdeskGroupRamSnapshot({
        targetGroup: target,
        pendingCredentialPromptGroup: target,
        error: isExpired
          ? 'Delegated RAM credential expired after 30 minutes. Please enter your domain password above.'
          : snap.error,
        errorFa: isExpired
          ? 'نشست رمز تفویض‌شده در حافظه RAM پس از ۳۰ دقیقه منقضی شد. لطفاً رمز عبور دامین را دوباره وارد کنید.'
          : snap.errorFa,
      });
    }
    return;
  }

  activeRunToken += 1;
  const myToken = activeRunToken;
  const isCancelled = () => myToken !== activeRunToken;

  const dcOverride = snap.domainController.trim() || undefined;
  const ldapProtocol = snap.ldapProtocol;
  const winrmProtocol = snap.winrmProtocol;

  // Step 1/3: Tab 1 — Overview, Creator & OU Path
  patchHelpdeskGroupRamSnapshot({
    targetGroup: target,
    pendingCredentialPromptGroup: null,
    loading: true,
    loadingOverview: true,
    loadingMembers: false,
    loadingPermissions: false,
    overviewLoaded: false,
    membersLoaded: false,
    permissionsLoaded: false,
    error: null,
    errorFa: null,
    blockedByException: false,
    memberActionResult: null,
    memberActionError: null,
    prefetchProgress: {
      active: true,
      step: 1,
      total: 3,
      currentTab: 'overview',
      labelEn: 'Overview, Creator & OU Path',
      labelFa: 'هویت، سازنده و مسیر OU',
    },
  });

  let step1Data: HelpdeskGroupInspectionData;
  let inspectHistoryId: string | undefined;
  try {
    const res = await inspectHelpdeskTargetGroup({
      targetGroup: target,
      adminUsername: creds.adminUsername,
      adminPassword: creds.adminPassword,
      domainController: dcOverride,
      ldapProtocol,
      winrmProtocol,
      stage: 'overview',
    });
    if (isCancelled()) return;

    step1Data = res.data;
    inspectHistoryId = res.historyId;
    const totalMemEst =
      step1Data.membershipSummary.totalDirectMembers +
      step1Data.membershipSummary.totalPrimaryGroupMembers;

    patchHelpdeskGroupRamSnapshot((prev) => {
      const nextRecent = [
        {
          cn: step1Data.identity.cn,
          samAccountName: step1Data.identity.samAccountName,
          ou: step1Data.identity.organizationalUnit,
          groupScope: step1Data.identity.groupScope,
          groupCategory: step1Data.identity.groupCategory,
          isPrivileged: step1Data.identity.isPrivileged,
          memberTotal: totalMemEst,
        },
        ...prev.recentGroups.filter(
          (r) => r.samAccountName.toLowerCase() !== step1Data.identity.samAccountName.toLowerCase()
        ),
      ].slice(0, 8);

      return {
        loading: false,
        loadingOverview: false,
        overviewLoaded: true,
        groupData: step1Data,
        lastHistoryId: inspectHistoryId || null,
        rateLimit: res.rateLimit ?? prev.rateLimit,
        recentGroups: nextRecent,
      };
    });
  } catch (err: any) {
    if (isCancelled()) return;
    patchHelpdeskGroupRamSnapshot({
      loading: false,
      loadingOverview: false,
      prefetchProgress: null,
      error: err?.message || 'Active Directory group inspection failed',
      errorFa: err?.errorFa || err?.message || 'استعلام گروه اکتیو دایرکتوری ناموفق بود',
      blockedByException: Boolean(err?.blockedByException),
    });
    return;
  }

  const canonicalGroupTarget = step1Data.identity.distinguishedName || target;
  const pinnedDc = step1Data.connectionInfo.domainController || dcOverride;

  // Step 2/3: Tab 2 — Members, Primary RID & Nested Groups
  if (isCancelled()) return;
  patchHelpdeskGroupRamSnapshot({
    loadingMembers: true,
    prefetchProgress: {
      active: true,
      step: 2,
      total: 3,
      currentTab: 'members',
      labelEn: 'Members & Nested Groups',
      labelFa: 'اعضا و زیرگروه‌ها',
    },
  });

  try {
    const step2Creds = resolveEffectiveGroupCredentials();
    if (step2Creds.ok) {
      const memRes = await inspectHelpdeskTargetGroup({
        targetGroup: canonicalGroupTarget,
        adminUsername: step2Creds.adminUsername,
        adminPassword: step2Creds.adminPassword,
        domainController: pinnedDc,
        ldapProtocol,
        winrmProtocol,
        stage: 'members',
        skipHistory: true,
        ...(inspectHistoryId ? { historyId: inspectHistoryId } : {}),
      });
      if (isCancelled()) return;

      const memData = memRes.data;
      const resolvedTotalMem =
        memData.membershipSummary.totalDirectMembers +
        memData.membershipSummary.totalPrimaryGroupMembers;

      patchHelpdeskGroupRamSnapshot((prev) => ({
        loadingMembers: false,
        membersLoaded: true,
        rateLimit: memRes.rateLimit ?? prev.rateLimit,
        recentGroups: prev.recentGroups.map((rg) =>
          rg.samAccountName.toLowerCase() === memData.identity.samAccountName.toLowerCase()
            ? { ...rg, memberTotal: resolvedTotalMem }
            : rg
        ),
        groupData: prev.groupData
          ? {
              ...prev.groupData,
              membershipSummary: memData.membershipSummary,
              directMembers: memData.directMembers,
              primaryGroupMembers: memData.primaryGroupMembers,
              nestedChildGroups: memData.nestedChildGroups,
              effectiveInheritedMembers: memData.effectiveInheritedMembers,
              parentGroups: memData.parentGroups,
            }
          : memData,
      }));
    } else if (!isCancelled()) {
      patchHelpdeskGroupRamSnapshot({
        loadingMembers: false,
        membersLoaded: true,
      });
    }
  } catch {
    if (!isCancelled()) {
      patchHelpdeskGroupRamSnapshot({
        loadingMembers: false,
        membersLoaded: true,
      });
    }
  }

  // Step 3/3: Tab 3 — Plain-Language Permissions, ACLs, GPOs & DC Event Log
  if (isCancelled()) return;
  patchHelpdeskGroupRamSnapshot({
    loadingPermissions: true,
    prefetchProgress: {
      active: true,
      step: 3,
      total: 3,
      currentTab: 'permissions',
      labelEn: 'Permissions, ACLs & Security Audit Events',
      labelFa: 'پرمیژن‌ها، ACL و لاگ امنیتی',
    },
  });

  try {
    const step3Creds = resolveEffectiveGroupCredentials();
    if (step3Creds.ok) {
      const permRes = await inspectHelpdeskTargetGroup({
        targetGroup: canonicalGroupTarget,
        adminUsername: step3Creds.adminUsername,
        adminPassword: step3Creds.adminPassword,
        domainController: pinnedDc,
        ldapProtocol,
        winrmProtocol,
        stage: 'permissions',
        skipHistory: true,
        ...(inspectHistoryId ? { historyId: inspectHistoryId } : {}),
      });
      if (isCancelled()) return;

      const permData = permRes.data;
      patchHelpdeskGroupRamSnapshot((prev) => ({
        loadingPermissions: false,
        permissionsLoaded: true,
        prefetchProgress: null,
        rateLimit: permRes.rateLimit ?? prev.rateLimit,
        recentGroups: prev.recentGroups.map((rg) =>
          rg.samAccountName.toLowerCase() === permData.identity.samAccountName.toLowerCase()
            ? { ...rg, isPrivileged: permData.identity.isPrivileged }
            : rg
        ),
        groupData: prev.groupData
          ? {
              ...prev.groupData,
              identity: {
                ...prev.groupData.identity,
                isBuiltinCritical: permData.identity.isBuiltinCritical,
                isPrivileged: permData.identity.isPrivileged,
                privilegeLevel: permData.identity.privilegeLevel,
              },
              lifecycleAndOwnership: {
                ...prev.groupData.lifecycleAndOwnership,
                objectOwner:
                  permData.lifecycleAndOwnership.objectOwner ||
                  prev.groupData.lifecycleAndOwnership.objectOwner,
                objectOwnerSid:
                  permData.lifecycleAndOwnership.objectOwnerSid ||
                  prev.groupData.lifecycleAndOwnership.objectOwnerSid,
                creatorAccount:
                  permData.lifecycleAndOwnership.creatorAccount ||
                  prev.groupData.lifecycleAndOwnership.creatorAccount,
                creatorTimestamp:
                  permData.lifecycleAndOwnership.creatorTimestamp ??
                  prev.groupData.lifecycleAndOwnership.creatorTimestamp,
                creatorDc:
                  permData.lifecycleAndOwnership.creatorDc ||
                  prev.groupData.lifecycleAndOwnership.creatorDc,
                creatorSource:
                  permData.lifecycleAndOwnership.creatorSource !== 'unavailable'
                    ? permData.lifecycleAndOwnership.creatorSource
                    : prev.groupData.lifecycleAndOwnership.creatorSource,
                creatorNoteEn: permData.lifecycleAndOwnership.creatorNoteEn,
                creatorNoteFa: permData.lifecycleAndOwnership.creatorNoteFa,
                managedBy:
                  permData.lifecycleAndOwnership.managedBy ??
                  prev.groupData.lifecycleAndOwnership.managedBy,
                managerCanUpdateMembershipList:
                  permData.lifecycleAndOwnership.managerCanUpdateMembershipList,
              },
              parentGroups:
                prev.groupData.parentGroups.length > 0
                  ? prev.groupData.parentGroups
                  : permData.parentGroups,
              permissions: permData.permissions,
              auditEventsStatus: permData.auditEventsStatus,
              auditEventsNoteEn: permData.auditEventsNoteEn,
              auditEventsNoteFa: permData.auditEventsNoteFa,
              auditEvents: permData.auditEvents,
            }
          : permData,
      }));
    } else if (!isCancelled()) {
      patchHelpdeskGroupRamSnapshot({
        loadingPermissions: false,
        permissionsLoaded: true,
        prefetchProgress: null,
      });
    }
  } catch {
    if (!isCancelled()) {
      patchHelpdeskGroupRamSnapshot({
        loadingPermissions: false,
        permissionsLoaded: true,
        prefetchProgress: null,
      });
    }
  }
}

export async function runHelpdeskGroupMemberAction(params: {
  action: 'add_member';
  memberIdentifier: string;
}): Promise<boolean> {
  if (params.action !== 'add_member') {
    return false;
  }
  const snap = ramState;
  const target = (snap.groupData?.identity.distinguishedName || snap.targetGroup).trim();
  const creds = resolveEffectiveGroupCredentials();
  if (!target || !params.memberIdentifier.trim() || !creds.ok) {
    return false;
  }

  patchHelpdeskGroupRamSnapshot({
    memberActionLoading: true,
    memberActionError: null,
    memberActionResult: null,
  });

  try {
    const res = await manageHelpdeskGroupMember({
      targetGroup: target,
      action: params.action,
      memberIdentifier: params.memberIdentifier.trim(),
      adminUsername: creds.adminUsername,
      adminPassword: creds.adminPassword,
      domainController: snap.domainController.trim() || undefined,
      ldapProtocol: snap.ldapProtocol,
      winrmProtocol: snap.winrmProtocol,
    });

    patchHelpdeskGroupRamSnapshot({
      memberActionLoading: false,
      memberActionResult: res.data,
      rateLimit: res.rateLimit ?? ramState.rateLimit,
    });

    // Silently refresh group inspection without duplicate inspect history spam
    try {
      const refreshed = await inspectHelpdeskTargetGroup({
        targetGroup: target,
        adminUsername: creds.adminUsername,
        adminPassword: creds.adminPassword,
        domainController: snap.domainController.trim() || undefined,
        ldapProtocol: snap.ldapProtocol,
        winrmProtocol: snap.winrmProtocol,
        skipHistory: true,
      });
      patchHelpdeskGroupRamSnapshot({
        groupData: refreshed.data,
        rateLimit: refreshed.rateLimit ?? ramState.rateLimit,
      });
    } catch {}

    return true;
  } catch (err: any) {
    patchHelpdeskGroupRamSnapshot({
      memberActionLoading: false,
      memberActionError: err?.message || 'Failed to update AD group membership',
    });
    return false;
  }
}
