import {
  HelpdeskUserInspectionData,
  HelpdeskUserMailboxInfo,
  HelpdeskTargetUserRequestPayload,
  inspectHelpdeskTargetUser,
  refreshHelpdeskTargetMailbox,
  unlockHelpdeskTargetUser,
} from './api';

export type HelpdeskUserSubTab =
  | 'overview'
  | 'security'
  | 'mailbox'
  | 'groups';

export interface HelpdeskUserRamState {
  ownerUserId: string | null;
  targetUsername: string;
  adminUsername: string;
  adminPassword: string;
  domainController: string;
  ldapProtocol: 'auto' | 'ldaps' | 'ldap';
  exchangeServer: string;
  winrmProtocol: 'auto' | 'winrm_https' | 'winrm_http' | 'smb_rpc' | 'ssh';
  showAdvancedConn: boolean;
  activeSubTab: HelpdeskUserSubTab;
  rateLimit: any | null;

  userData: HelpdeskUserInspectionData | null;
  loading: boolean;
  error: string | null;

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

function createInitialHelpdeskUserRamState(): HelpdeskUserRamState {
  return {
    ownerUserId: null,
    targetUsername: '',
    adminUsername: '',
    adminPassword: '',
    domainController: '',
    ldapProtocol: 'auto',
    exchangeServer: '',
    winrmProtocol: 'auto',
    showAdvancedConn: false,
    activeSubTab: 'overview',
    rateLimit: null,
    userData: null,
    loading: false,
    error: null,
    mailboxLoading: false,
    mailboxError: null,
    unlocking: false,
    unlockError: null,
    unlockResult: null,
    recentUsers: [],
  };
}

let ramState: HelpdeskUserRamState = createInitialHelpdeskUserRamState();
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
  ramState = { ...ramState, ...delta };
  notifyListeners();
}

export function bindHelpdeskUserRamOwner(userId: string | null | undefined): void {
  const normalized = userId ? String(userId) : null;
  if (ramState.ownerUserId && ramState.ownerUserId !== normalized) {
    ramState = createInitialHelpdeskUserRamState();
    ramState.ownerUserId = normalized;
    notifyListeners();
    return;
  }
  if (!ramState.ownerUserId && normalized) {
    ramState = { ...ramState, ownerUserId: normalized };
    notifyListeners();
  }
}

export function wipeHelpdeskUserRamSession(): void {
  const owner = ramState.ownerUserId;
  ramState = {
    ...createInitialHelpdeskUserRamState(),
    ownerUserId: owner,
  };
  notifyListeners();
}

export function wipeHelpdeskUserRamOnLogout(): void {
  ramState = createInitialHelpdeskUserRamState();
  notifyListeners();
}

function buildUserRequestPayload(overrideTarget?: string): HelpdeskTargetUserRequestPayload {
  const s = ramState;
  return {
    targetUsername: (overrideTarget ?? s.targetUsername).trim(),
    adminUsername: s.adminUsername.trim(),
    adminPassword: s.adminPassword,
    domainController: s.domainController.trim() || undefined,
    ldapProtocol: s.ldapProtocol,
    exchangeServer: s.exchangeServer.trim() || undefined,
    winrmProtocol: s.winrmProtocol,
    includeMailbox: true,
  };
}

export async function runHelpdeskUserInspect(overrideTarget?: string): Promise<HelpdeskUserInspectionData | null> {
  if (overrideTarget !== undefined) {
    patchHelpdeskUserRamSnapshot({ targetUsername: overrideTarget });
  }
  const payload = buildUserRequestPayload(overrideTarget);
  if (!payload.targetUsername || !payload.adminUsername || !payload.adminPassword) {
    return null;
  }

  patchHelpdeskUserRamSnapshot({
    loading: true,
    error: null,
    mailboxError: null,
    unlockError: null,
    unlockResult: null,
  });

  try {
    const res = await inspectHelpdeskTargetUser(payload);
    const data = res.data;
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

      return {
        loading: false,
        userData: data,
        rateLimit: res.rateLimit || prev.rateLimit,
        recentUsers: nextRecent,
      };
    });
    return data;
  } catch (err: any) {
    const msg = String(err?.message || 'Failed to inspect target domain user');
    patchHelpdeskUserRamSnapshot({
      loading: false,
      error: msg,
    });
    return null;
  }
}

export async function runHelpdeskUserMailboxRefresh(): Promise<HelpdeskUserMailboxInfo | null> {
  const payload = buildUserRequestPayload();
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
  const payload = buildUserRequestPayload();
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
                lockoutTimeRaw: '0',
                lockedAt: null,
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
