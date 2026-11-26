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

export type HelpdeskGroupSubTab =
  | 'overview'
  | 'members'
  | 'permissions'
  | 'reports'
  | 'history';

export interface HelpdeskGroupRamState {
  ownerUserId: string | null;
  targetGroup: string;
  adminUsername: string;
  adminPassword: string;
  domainController: string;
  ldapProtocol: 'auto' | 'ldaps' | 'ldap';
  winrmProtocol: 'auto' | 'winrm_https' | 'winrm_http' | 'smb_rpc' | 'ssh';
  showAdvancedConn: boolean;
  activeSubTab: HelpdeskGroupSubTab;
  rateLimit: any | null;

  groupData: HelpdeskGroupInspectionData | null;
  loading: boolean;
  error: string | null;
  lastHistoryId: string | null;

  searchingGroups: boolean;
  searchError: string | null;
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
  domainController: '',
  ldapProtocol: 'auto',
  winrmProtocol: 'auto',
  showAdvancedConn: false,
  activeSubTab: 'overview',
  rateLimit: null,

  groupData: null,
  loading: false,
  error: null,
  lastHistoryId: null,

  searchingGroups: false,
  searchError: null,
  searchResults: [],
  searchMeta: null,

  memberActionLoading: false,
  memberActionError: null,
  memberActionResult: null,

  recentGroups: [],
});

let ramState: HelpdeskGroupRamState = createInitialState(null);
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

export function patchHelpdeskGroupRamSnapshot(
  patch: Partial<HelpdeskGroupRamState> | ((prev: HelpdeskGroupRamState) => Partial<HelpdeskGroupRamState>)
) {
  const nextPatch = typeof patch === 'function' ? patch(ramState) : patch;
  ramState = { ...ramState, ...nextPatch };
  notify();
}

export function bindHelpdeskGroupRamOwner(userId: string | null) {
  if (ramState.ownerUserId !== null && ramState.ownerUserId !== userId) {
    ramState = createInitialState(userId);
    notify();
  } else if (ramState.ownerUserId === null && userId !== null) {
    ramState = { ...ramState, ownerUserId: userId };
    notify();
  }
}

export function wipeHelpdeskGroupRamSession() {
  const currentOwner = ramState.ownerUserId;
  ramState = createInitialState(currentOwner);
  notify();
}

export function wipeHelpdeskGroupRamOnLogout() {
  ramState = createInitialState(null);
  notify();
}

export async function runHelpdeskGroupSearch(queryOverride?: string): Promise<void> {
  const snap = ramState;
  if (!snap.adminUsername.trim() || !snap.adminPassword) {
    patchHelpdeskGroupRamSnapshot({
      searchError: 'Privileged domain username & password are required first.',
    });
    return;
  }

  patchHelpdeskGroupRamSnapshot({
    searchingGroups: true,
    searchError: null,
  });

  try {
    const res = await searchHelpdeskDomainGroups({
      query: (queryOverride !== undefined ? queryOverride : snap.targetGroup).trim(),
      adminUsername: snap.adminUsername.trim(),
      adminPassword: snap.adminPassword,
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
    });
  }
}

export async function runHelpdeskGroupInspect(overrideTargetGroup?: string): Promise<void> {
  const snap = ramState;
  const target = (overrideTargetGroup ?? snap.targetGroup).trim();
  if (!target || !snap.adminUsername.trim() || !snap.adminPassword) {
    return;
  }

  patchHelpdeskGroupRamSnapshot({
    targetGroup: target,
    loading: true,
    error: null,
    memberActionResult: null,
    memberActionError: null,
  });

  try {
    const res = await inspectHelpdeskTargetGroup({
      targetGroup: target,
      adminUsername: snap.adminUsername.trim(),
      adminPassword: snap.adminPassword,
      domainController: snap.domainController.trim() || undefined,
      ldapProtocol: snap.ldapProtocol,
      winrmProtocol: snap.winrmProtocol,
    });

    const data = res.data;
    const totalMem =
      data.membershipSummary.totalDirectMembers + data.membershipSummary.totalPrimaryGroupMembers;

    patchHelpdeskGroupRamSnapshot((prev) => {
      const nextRecent = [
        {
          cn: data.identity.cn,
          samAccountName: data.identity.samAccountName,
          ou: data.identity.organizationalUnit,
          groupScope: data.identity.groupScope,
          groupCategory: data.identity.groupCategory,
          isPrivileged: data.identity.isPrivileged,
          memberTotal: totalMem,
        },
        ...prev.recentGroups.filter(
          (r) => r.samAccountName.toLowerCase() !== data.identity.samAccountName.toLowerCase()
        ),
      ].slice(0, 8);

      return {
        loading: false,
        groupData: data,
        lastHistoryId: res.historyId || null,
        rateLimit: res.rateLimit ?? prev.rateLimit,
        recentGroups: nextRecent,
      };
    });
  } catch (err: any) {
    patchHelpdeskGroupRamSnapshot({
      loading: false,
      error: err?.message || 'Active Directory group inspection failed',
    });
  }
}

export async function runHelpdeskGroupMemberAction(params: {
  action: 'add_member' | 'remove_member';
  memberIdentifier: string;
}): Promise<boolean> {
  const snap = ramState;
  const target = (snap.groupData?.identity.distinguishedName || snap.targetGroup).trim();
  if (!target || !params.memberIdentifier.trim() || !snap.adminUsername.trim() || !snap.adminPassword) {
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
      adminUsername: snap.adminUsername.trim(),
      adminPassword: snap.adminPassword,
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
        adminUsername: snap.adminUsername.trim(),
        adminPassword: snap.adminPassword,
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
