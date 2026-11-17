import { Router, Request, Response } from 'express';
import { verifyToken } from './auth';
import {
  addPortalAuditLog,
  findUserById,
  findUserByUsername,
} from './db';
import {
  beginTotpEnrollment,
  changeOwnLocalPassword,
  getUserSecurityProfile,
  ProfileActor,
  regenerateTotpBackupCodes,
  updateUserProfileAndPrefs,
  updateUserTwoFactorMethod,
  verifyAndEnableTotp,
} from './profileService';
import {
  listTrustedDevicesForUser,
  revokeTrustedDeviceById,
  revokeTrustedDevicesForUser,
} from './twoFactorService';
import { TwoFactorMethod } from '../src/types';

export const profileRouter = Router();

interface ProfileAuthContext {
  authenticated: boolean;
  statusCode?: number;
  error?: string;
  actor?: ProfileActor;
  clientIp: string;
}

async function authenticateProfileRequest(req: Request): Promise<ProfileAuthContext> {
  const rawIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    '127.0.0.1';
  const clientIp = rawIp.replace(/^::ffff:/, '') || '127.0.0.1';

  const authHeader = (req.headers.authorization as string) || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return { authenticated: false, statusCode: 401, error: 'Authentication required', clientIp };
  }

  const payload = verifyToken(token);
  if (!payload) {
    return { authenticated: false, statusCode: 401, error: 'Invalid or expired session token', clientIp };
  }

  const userRecord =
    (await findUserById(payload.userId)) || (await findUserByUsername(payload.username));
  if (userRecord && userRecord.status === 'disabled') {
    return { authenticated: false, statusCode: 403, error: 'Account disabled', clientIp };
  }

  return {
    authenticated: true,
    actor: {
      userId: userRecord?.id || payload.userId,
      username: userRecord?.username || payload.username,
      fullName: userRecord?.full_name || payload.fullName || payload.username,
      email: userRecord?.email || payload.email || `${payload.username}@nettopology.internal`,
      role: userRecord?.role || payload.role || 'Operator',
      userType: userRecord?.user_type || payload.userType || 'local',
    },
    clientIp,
  };
}

// GET /api/profile/security
profileRouter.get('/profile/security', async (req: Request, res: Response) => {
  const auth = await authenticateProfileRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }

  try {
    const currentTrustedToken = (req.headers['x-trusted-device-token'] as string) || '';
    const [profile, trustedDevices] = await Promise.all([
      getUserSecurityProfile(auth.actor),
      listTrustedDevicesForUser(auth.actor, currentTrustedToken),
    ]);
    return res.json({ success: true, profile, trustedDevices });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to load user security profile',
    });
  }
});

// PUT /api/profile/security
profileRouter.put('/profile/security', async (req: Request, res: Response) => {
  const auth = await authenticateProfileRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }

  try {
    const { displayTitle, phoneExt, notifyChannels, emailChannels, quietHours } = req.body || {};
    const profile = await updateUserProfileAndPrefs(auth.actor, auth.clientIp, {
      displayTitle,
      phoneExt,
      notifyChannels,
      emailChannels,
      quietHours,
    });
    return res.json({ success: true, profile });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: err?.message || 'Failed to update profile preferences',
    });
  }
});

// POST /api/profile/change-password
profileRouter.post('/profile/change-password', async (req: Request, res: Response) => {
  const auth = await authenticateProfileRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }

  try {
    const { currentPassword, newPassword } = req.body || {};
    await changeOwnLocalPassword(auth.actor, auth.clientIp, currentPassword, newPassword);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: err?.message || 'Failed to change password',
    });
  }
});

// POST /api/profile/2fa/totp/begin
profileRouter.post('/profile/2fa/totp/begin', async (req: Request, res: Response) => {
  const auth = await authenticateProfileRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }

  try {
    const enrollment = await beginTotpEnrollment(auth.actor, auth.clientIp);
    const profile = await getUserSecurityProfile(auth.actor);
    return res.json({ success: true, enrollment, profile });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to initiate TOTP enrollment',
    });
  }
});

// POST /api/profile/2fa/totp/verify
profileRouter.post('/profile/2fa/totp/verify', async (req: Request, res: Response) => {
  const auth = await authenticateProfileRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }

  try {
    const code = String(req.body?.code || '').trim();
    const result = await verifyAndEnableTotp(auth.actor, auth.clientIp, code);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: err?.message || 'TOTP verification failed',
    });
  }
});

// POST /api/profile/2fa/backup-codes/regenerate
profileRouter.post('/profile/2fa/backup-codes/regenerate', async (req: Request, res: Response) => {
  const auth = await authenticateProfileRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }

  try {
    const verificationInput = String(req.body?.verificationInput || '').trim();
    const result = await regenerateTotpBackupCodes(auth.actor, auth.clientIp, verificationInput);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: err?.message || 'Failed to regenerate backup codes',
    });
  }
});

// POST /api/profile/2fa/method
profileRouter.post('/profile/2fa/method', async (req: Request, res: Response) => {
  const auth = await authenticateProfileRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }

  try {
    const method = String(req.body?.method || 'none') as TwoFactorMethod;
    const verificationInput = req.body?.verificationInput
      ? String(req.body.verificationInput)
      : undefined;
    const resetTotpSecret = Boolean(req.body?.resetTotpSecret);
    const profile = await updateUserTwoFactorMethod(auth.actor, auth.clientIp, method, {
      verificationInput,
      resetTotpSecret,
    });
    return res.json({ success: true, profile });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: err?.message || 'Failed to update 2FA preference',
    });
  }
});

// DELETE /api/profile/trusted-devices/:id
profileRouter.delete('/profile/trusted-devices/:id', async (req: Request, res: Response) => {
  const auth = await authenticateProfileRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }

  try {
    const removed = await revokeTrustedDeviceById(auth.actor, req.params.id);
    if (!removed) {
      return res.status(404).json({ success: false, error: 'Trusted device not found' });
    }

    await addPortalAuditLog({
      category: 'system_auth',
      action: 'TRUSTED_DEVICE_REVOKED',
      title: `لغو دستگاه مورد اعتماد برای ${auth.actor.username}`,
      title_en: `Trusted Device Revoked for ${auth.actor.username}`,
      actor: {
        username: auth.actor.username,
        role: auth.actor.role || 'Operator',
        ipAddress: auth.clientIp,
      },
      target: {
        type: 'user',
        id: req.params.id,
        name: auth.actor.username,
      },
      severity: 'warning',
      status: 'success',
      details: `توکن دستگاه مورد اعتماد با شناسه ${req.params.id} توسط کاربر ${auth.actor.username} لغو گردید.`,
      details_en: `Trusted device token (${req.params.id}) revoked by user ${auth.actor.username}.`,
    }).catch(() => {});

    const currentTrustedToken = (req.headers['x-trusted-device-token'] as string) || '';
    const trustedDevices = await listTrustedDevicesForUser(auth.actor, currentTrustedToken);
    return res.json({ success: true, trustedDevices });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to revoke trusted device',
    });
  }
});

// DELETE /api/profile/trusted-devices
profileRouter.delete('/profile/trusted-devices', async (req: Request, res: Response) => {
  const auth = await authenticateProfileRequest(req);
  if (!auth.authenticated || !auth.actor) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }

  try {
    await revokeTrustedDevicesForUser(auth.actor);

    await addPortalAuditLog({
      category: 'system_auth',
      action: 'ALL_TRUSTED_DEVICES_REVOKED',
      title: `لغو تمام دستگاه‌های مورد اعتماد برای ${auth.actor.username}`,
      title_en: `All Trusted Devices Revoked for ${auth.actor.username}`,
      actor: {
        username: auth.actor.username,
        role: auth.actor.role || 'Operator',
        ipAddress: auth.clientIp,
      },
      target: {
        type: 'user',
        id: auth.actor.userId,
        name: auth.actor.username,
      },
      severity: 'warning',
      status: 'success',
      details: `تمام دستگاه‌های مورد اعتماد ۳۰ روزه کاربر ${auth.actor.username} به صورت یکجا لغو شدند.`,
      details_en: `All 30-day trusted devices for ${auth.actor.username} were revoked.`,
    }).catch(() => {});

    return res.json({ success: true, trustedDevices: [] });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to revoke all trusted devices',
    });
  }
});
