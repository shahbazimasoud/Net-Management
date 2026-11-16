import {
  TotpEnrollmentPayload,
  TrustedDeviceEntry,
  TwoFactorMethod,
  UserNotifyChannelPrefs,
  UserQuietHours,
  UserSecurityProfile,
} from '../types';

function resolveAuthToken(): string {
  if (typeof window === 'undefined') return '';
  return (
    localStorage.getItem('nettopology_auth_token_v1') ||
    sessionStorage.getItem('nettopology_auth_token_v1') ||
    localStorage.getItem('nettopology_auth_token') ||
    sessionStorage.getItem('nettopology_auth_token') ||
    localStorage.getItem('auth_token') ||
    sessionStorage.getItem('auth_token') ||
    localStorage.getItem('token') ||
    ''
  );
}

function buildHeaders(usernameHint?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = resolveAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (typeof window !== 'undefined') {
    const cleanU = (usernameHint || '').trim().toLowerCase();
    const userToken = cleanU ? localStorage.getItem(`nettopology_trusted_device_${cleanU}`) : null;
    const globalToken = localStorage.getItem('nettopology_trusted_device_token');
    const trusted = userToken || globalToken || '';
    if (trusted && /^[A-Za-z0-9_\-.:+=]+$/.test(trusted)) {
      headers['X-Trusted-Device-Token'] = trusted;
    }
  }
  return headers;
}

async function handleJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
  }
  return data as T;
}

export async function fetchUserSecurityProfile(usernameHint?: string): Promise<{
  profile: UserSecurityProfile;
  trustedDevices: TrustedDeviceEntry[];
}> {
  const res = await fetch('/api/profile/security', {
    method: 'GET',
    headers: buildHeaders(usernameHint),
  });
  return handleJson<{
    success: boolean;
    profile: UserSecurityProfile;
    trustedDevices: TrustedDeviceEntry[];
  }>(res);
}

export async function updateUserSecurityProfile(payload: {
  displayTitle?: string;
  phoneExt?: string;
  notifyChannels?: Partial<UserNotifyChannelPrefs>;
  quietHours?: Partial<UserQuietHours>;
}): Promise<{ profile: UserSecurityProfile }> {
  const res = await fetch('/api/profile/security', {
    method: 'PUT',
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });
  return handleJson<{ success: boolean; profile: UserSecurityProfile }>(res);
}

export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean }> {
  const res = await fetch('/api/profile/change-password', {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  return handleJson<{ success: boolean }>(res);
}

export async function beginTotpSetup(): Promise<{
  enrollment: TotpEnrollmentPayload;
  profile: UserSecurityProfile;
}> {
  const res = await fetch('/api/profile/2fa/totp/begin', {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({}),
  });
  return handleJson<{
    success: boolean;
    enrollment: TotpEnrollmentPayload;
    profile: UserSecurityProfile;
  }>(res);
}

export async function verifyTotpSetup(code: string): Promise<{
  profile: UserSecurityProfile;
  backupCodes: string[];
}> {
  const res = await fetch('/api/profile/2fa/totp/verify', {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ code }),
  });
  return handleJson<{
    success: boolean;
    profile: UserSecurityProfile;
    backupCodes: string[];
  }>(res);
}

export async function regenerateBackupCodes(verificationInput: string): Promise<{
  profile: UserSecurityProfile;
  backupCodes: string[];
}> {
  const res = await fetch('/api/profile/2fa/backup-codes/regenerate', {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ verificationInput }),
  });
  return handleJson<{
    success: boolean;
    profile: UserSecurityProfile;
    backupCodes: string[];
  }>(res);
}

export async function updateTwoFactorPreference(payload: {
  method: TwoFactorMethod;
  verificationInput?: string;
  resetTotpSecret?: boolean;
}): Promise<{ profile: UserSecurityProfile }> {
  const res = await fetch('/api/profile/2fa/method', {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });
  return handleJson<{ success: boolean; profile: UserSecurityProfile }>(res);
}

export async function revokeSingleTrustedDevice(
  deviceId: string,
  usernameHint?: string
): Promise<{ trustedDevices: TrustedDeviceEntry[] }> {
  const res = await fetch(`/api/profile/trusted-devices/${encodeURIComponent(deviceId)}`, {
    method: 'DELETE',
    headers: buildHeaders(usernameHint),
  });
  return handleJson<{ success: boolean; trustedDevices: TrustedDeviceEntry[] }>(res);
}

export async function revokeAllTrustedDevices(): Promise<{
  trustedDevices: TrustedDeviceEntry[];
}> {
  const res = await fetch('/api/profile/trusted-devices', {
    method: 'DELETE',
    headers: buildHeaders(),
  });
  return handleJson<{ success: boolean; trustedDevices: TrustedDeviceEntry[] }>(res);
}
