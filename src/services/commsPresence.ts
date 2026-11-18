import { useSyncExternalStore } from 'react';
import { CommsUserPresenceStatus } from '../types';

export interface CommsPresenceSnapshotState {
  version: number;
  hasLiveSnapshot: boolean;
  statuses: Record<string, CommsUserPresenceStatus>;
}

let state: CommsPresenceSnapshotState = {
  version: 0,
  hasLiveSnapshot: false,
  statuses: {},
};

const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {}
  }
}

export function normalizePresenceKeys(
  identifiers: Array<string | null | undefined>
): string[] {
  const keys = new Set<string>();
  for (const raw of identifiers) {
    if (!raw || typeof raw !== 'string') continue;
    const clean = raw.trim().toLowerCase();
    if (!clean) continue;
    keys.add(clean);
    if (clean.includes('@')) {
      keys.add(clean.split('@')[0]);
    }
    if (clean.includes('\\')) {
      const parts = clean.split('\\');
      if (parts[1]) keys.add(parts[1]);
    }
  }
  return Array.from(keys);
}

export function applyCommsPresenceSnapshot(
  statuses: Record<string, CommsUserPresenceStatus> | undefined | null
): void {
  const nextStatuses: Record<string, CommsUserPresenceStatus> = {};
  if (statuses && typeof statuses === 'object') {
    for (const [k, v] of Object.entries(statuses)) {
      if (v === 'online' || v === 'idle') {
        nextStatuses[k.trim().toLowerCase()] = v;
      }
    }
  }
  state = {
    version: state.version + 1,
    hasLiveSnapshot: true,
    statuses: nextStatuses,
  };
  emitChange();
}

export function applyCommsPresenceUpdate(evt: {
  userId?: string;
  username?: string;
  identifiers?: string[];
  status: CommsUserPresenceStatus;
}): void {
  const keys = normalizePresenceKeys([
    evt.userId,
    evt.username,
    ...(Array.isArray(evt.identifiers) ? evt.identifiers : []),
  ]);
  if (keys.length === 0) return;

  const nextStatuses = { ...state.statuses };
  if (evt.status === 'offline') {
    for (const k of keys) {
      delete nextStatuses[k];
    }
  } else {
    for (const k of keys) {
      nextStatuses[k] = evt.status;
    }
  }

  state = {
    version: state.version + 1,
    hasLiveSnapshot: true,
    statuses: nextStatuses,
  };
  emitChange();
}

export function resetCommsPresenceStore(): void {
  if (!state.hasLiveSnapshot && Object.keys(state.statuses).length === 0) return;
  state = {
    version: state.version + 1,
    hasLiveSnapshot: false,
    statuses: {},
  };
  emitChange();
}

export function resolvePresenceFromState(
  snapshot: CommsPresenceSnapshotState,
  identifiers: Array<string | null | undefined>,
  fallbackStatus?: CommsUserPresenceStatus,
  fallbackIsOnline?: boolean
): CommsUserPresenceStatus {
  const keys = normalizePresenceKeys(identifiers);

  if (snapshot.hasLiveSnapshot) {
    let foundIdle = false;
    for (const k of keys) {
      const s = snapshot.statuses[k];
      if (s === 'online') return 'online';
      if (s === 'idle') foundIdle = true;
    }
    return foundIdle ? 'idle' : 'offline';
  }

  if (fallbackStatus === 'online' || fallbackStatus === 'idle' || fallbackStatus === 'offline') {
    return fallbackStatus;
  }
  return fallbackIsOnline ? 'online' : 'offline';
}

export function resolveCommsUserPresence(
  identifiers: Array<string | null | undefined>,
  fallbackStatus?: CommsUserPresenceStatus,
  fallbackIsOnline?: boolean
): CommsUserPresenceStatus {
  return resolvePresenceFromState(state, identifiers, fallbackStatus, fallbackIsOnline);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): CommsPresenceSnapshotState {
  return state;
}

export function useCommsPresenceMap(): CommsPresenceSnapshotState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function presenceSortRank(status: CommsUserPresenceStatus): number {
  if (status === 'online') return 0;
  if (status === 'idle') return 1;
  return 2;
}

export function getCommsUserPresenceMeta(
  status: CommsUserPresenceStatus,
  isEn: boolean,
  options?: { isLightMode?: boolean; selfDark?: boolean }
): {
  label: string;
  dotClass: string;
  badgeClass: string;
  textClass: string;
} {
  const isLightMode = options?.isLightMode ?? false;
  const selfDark = options?.selfDark ?? false;

  if (status === 'online') {
    return {
      label: isEn ? 'Online' : 'آنلاین',
      dotClass: 'bg-emerald-400',
      badgeClass: selfDark
        ? 'bg-emerald-400/25 text-emerald-100'
        : isLightMode
        ? 'bg-emerald-100 text-emerald-800'
        : 'bg-emerald-500/20 text-emerald-300',
      textClass: selfDark
        ? 'text-emerald-200'
        : isLightMode
        ? 'text-emerald-700'
        : 'text-emerald-400',
    };
  }

  if (status === 'idle') {
    return {
      label: isEn ? 'Idle' : 'بدون فعالیت',
      dotClass: 'bg-amber-400',
      badgeClass: selfDark
        ? 'bg-amber-400/25 text-amber-100'
        : isLightMode
        ? 'bg-amber-100 text-amber-800'
        : 'bg-amber-500/20 text-amber-300',
      textClass: selfDark
        ? 'text-amber-200'
        : isLightMode
        ? 'text-amber-700'
        : 'text-amber-400',
    };
  }

  return {
    label: isEn ? 'Offline' : 'آفلاین',
    dotClass: 'bg-slate-400',
    badgeClass: selfDark
      ? 'bg-white/15 text-white'
      : isLightMode
      ? 'bg-slate-100 text-slate-600'
      : 'bg-white/10 text-slate-300',
    textClass: selfDark
      ? 'text-slate-200'
      : isLightMode
      ? 'text-slate-500'
      : 'text-slate-400',
  };
}
