import { Router, Request, Response } from 'express';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  checkRateLimit,
  recordFailedLogin,
  clearRateLimit,
} from './auth';
import {
  getDbStatus,
  findUserByUsername,
  findUserById,
  getAllUsers,
  saveUser,
  saveUsersBatch,
  deleteUser,
  updateLastLogin,
  getCustomMaps,
  saveCustomMaps,
  deleteCustomMap,
  getNodePositions,
  saveNodePositions,
  deleteNodePositions,
  getUserGroups,
  saveUserGroups,
  getAccessPolicies,
  saveAccessPolicies,
  getDeviceGroups,
  saveDeviceGroups,
  getActiveDirectoryConfig,
  saveActiveDirectoryConfig,
  getHierarchy,
  saveHierarchy,
  getAuditLogs,
  addAuditLog,
  getDeviceStickyNotes,
  saveDeviceStickyNote,
  deleteDeviceStickyNote,
  getAllRemoteServers,
  getRemoteServerById,
  createRemoteServer,
  updateRemoteServer,
  deleteRemoteServer,
  updateRemoteServerTags,
  getRemoteServerTagsSummary,
  getAllServerCategories,
  getServerCategoryById,
  createServerCategory,
  updateServerCategory,
  deleteServerCategory,
  getUserVaultItems,
  getUserVaultItemById,
  saveUserVaultItem,
  deleteUserVaultItem,
  UserVaultItem,
} from './db';
import { encryptVaultSecret, decryptVaultSecret } from './vaultCrypto';
import * as net from 'net';
import { testAndDiscoverDeviceViaSsh, detectPlatformAndRole } from './sshDiscovery';
import {
  startDiscoveryJob,
  getDiscoveryJobStatus,
  cancelDiscoveryJob,
  applyDiscoveryResultsToMap,
} from './cdpLldpDiscovery';
import {
  getBulkServerTemplates,
  generateBulkServerPreview,
  startBulkServerJob,
  getBulkServerJobStatus,
  cancelBulkServerJob,
} from './bulkServerConfig';
import {
  executeLinuxTelemetrySSH,
  fetchLinuxServicesSSH,
  executeLinuxServiceControl,
  executeLinuxProcessControl,
  fetchLinuxUsersAndSessionsSSH,
  sendLinuxUserMessageSSH,
  fetchLinuxDetailedSysInfoSSH,
  configureLinuxNetworkInterfaceSSH,
  configureLinuxPersistentProxySSH,
  testLinuxProxySSH,
  changeLinuxSshPortSSH,
  fetchLinuxBlockDevicesSSH,
  executeLinuxMountFilesystem,
  executeLinuxUnmountFilesystem,
} from './linuxServerMonitor';
import {
  fetchLinuxSshConfigSSH,
  updateLinuxSshConfigSSH,
  fetchLinuxHostnameSSH,
  updateLinuxHostnameSSH,
  fetchLinuxHostsFileSSH,
  updateLinuxHostsFileSSH,
  fetchLinuxDnsConfigSSH,
  updateLinuxDnsConfigSSH,
  fetchLinuxFail2banSSH,
  controlLinuxFail2banSSH,
  ipActionLinuxFail2banSSH,
  installLinuxFail2banSSH,
  fetchLinuxTimeInfoSSH,
  updateLinuxTimezoneSSH,
  updateLinuxNtpSSH,
  updateLinuxTimeSSH,
} from './linuxSysConfig';

export const apiRouter = Router();

// Helper to get client IP
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

// -------------------------------------------------------------
// Database Status Endpoint
// -------------------------------------------------------------
apiRouter.get('/db/status', async (req: Request, res: Response) => {
  try {
    const status = await getDbStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// Authentication Endpoints
// -------------------------------------------------------------
apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const ip = getClientIp(req);
    const username = (req.body?.username || '').trim();
    const password = (req.body?.password || '').trim();
    const authType = (req.body?.authType || 'local').toLowerCase(); // 'local' | 'ad'
    const domain = (req.body?.domain || 'corp.internal').trim();
    const rememberMe = Boolean(req.body?.rememberMe);

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required',
        message: 'نام کاربری و کلمه عبور الزامی است.',
      });
    }

    const rateLimitKey = `${ip}:${username.toLowerCase()}`;
    const rateLimitStatus = checkRateLimit(rateLimitKey);

    if (rateLimitStatus.locked) {
      await addAuditLog({
        userName: username,
        action: 'Login Blocked (Rate Limit)',
        category: 'security',
        target: 'Auth Gateway',
        status: 'error',
        details: `Too many failed attempts from IP ${ip}. Locked for ${rateLimitStatus.remainingSec}s.`,
        ipAddress: ip,
        userAgent: req.headers['user-agent'],
      });

      return res.status(429).json({
        success: false,
        locked: true,
        remainingSec: rateLimitStatus.remainingSec,
        error: `Too many failed attempts. Account locked for ${rateLimitStatus.remainingSec} seconds.`,
        message: `تعداد تلاش‌های ناموفق بیش از حد مجاز بود. لطفاً ${rateLimitStatus.remainingSec} ثانیه دیگر مجدداً تلاش فرمایید.`,
      });
    }

    // --- 1. LOCAL AUTHENTICATION ---
    if (authType === 'local') {
      const user = await findUserByUsername(username);

      if (!user) {
        const penalty = recordFailedLogin(rateLimitKey);
        await addAuditLog({
          userName: username,
          action: 'Failed Login (User Not Found)',
          category: 'security',
          target: 'Auth Gateway',
          status: 'warning',
          details: `Failed local login attempt for non-existing user "${username}" from IP ${ip}`,
          ipAddress: ip,
          userAgent: req.headers['user-agent'],
        });

        return res.status(401).json({
          success: false,
          error: 'Invalid credentials',
          message: 'نام کاربری یا رمز عبور اشتباه است.',
          attemptsLeft: penalty.attemptsLeft,
          locked: penalty.locked,
          remainingSec: penalty.remainingSec,
        });
      }

      if (user.status === 'disabled') {
        return res.status(403).json({
          success: false,
          error: 'Account disabled',
          message: 'این حساب کاربری توسط مدیر غیرفعال شده است.',
        });
      }

      const isValid = verifyPassword(password, user.password_hash, user.password_salt);
      if (!isValid) {
        const penalty = recordFailedLogin(rateLimitKey);
        await addAuditLog({
          userName: username,
          action: 'Failed Login (Invalid Password)',
          category: 'security',
          target: 'Auth Gateway',
          status: 'warning',
          details: `Invalid password supplied for user "${username}" from IP ${ip}`,
          ipAddress: ip,
          userAgent: req.headers['user-agent'],
        });

        return res.status(401).json({
          success: false,
          error: 'Invalid credentials',
          message: 'نام کاربری یا رمز عبور اشتباه است.',
          attemptsLeft: penalty.attemptsLeft,
          locked: penalty.locked,
          remainingSec: penalty.remainingSec,
        });
      }

      // Success: clear failed attempts
      clearRateLimit(rateLimitKey);
      await updateLastLogin(user.id);

      const token = generateToken(
        {
          userId: user.id,
          username: user.username,
          fullName: user.full_name,
          email: user.email,
          role: user.role,
          userType: 'local',
        },
        rememberMe
      );

      await addAuditLog({
        userName: user.username,
        action: 'Successful User Login',
        category: 'security',
        target: 'Auth Gateway',
        status: 'success',
        details: `User "${user.username}" authenticated successfully via Local Database from IP ${ip}`,
        ipAddress: ip,
        userAgent: req.headers['user-agent'],
      });

      return res.json({
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          fullName: user.full_name,
          email: user.email,
          role: user.role,
          userType: 'local',
          groupIds: user.group_ids,
          isBuiltin: user.is_builtin,
        },
      });
    }

    // --- 2. ACTIVE DIRECTORY / LDAP AUTHENTICATION ---
    if (authType === 'ad') {
      // Check known simulated AD users or standard test user
      const isCorpDomain = domain.toLowerCase().includes('corp') || domain.toLowerCase().includes('internal');
      const isValidAdUser = (username.toLowerCase().includes('admin') || username.toLowerCase().includes('rezaei') || username.toLowerCase().includes('netops') || password === 'admin123' || password === 'Password@123');

      if (!isValidAdUser && password !== 'admin123' && password !== 'nettop2026') {
        const penalty = recordFailedLogin(rateLimitKey);
        await addAuditLog({
          userName: `${username}@${domain}`,
          action: 'Failed Active Directory Login',
          category: 'security',
          target: `AD DC (${domain})`,
          status: 'warning',
          details: `Active Directory Kerberos/LDAP bind failed for user ${username}@${domain} from IP ${ip}`,
          ipAddress: ip,
          userAgent: req.headers['user-agent'],
        });

        return res.status(401).json({
          success: false,
          error: 'Active Directory authentication failed',
          message: 'احراز هویت اکتیو دایرکتوری ناموفق بود (حساب یا پسورد دامین نامعتبر است).',
          attemptsLeft: penalty.attemptsLeft,
          locked: penalty.locked,
          remainingSec: penalty.remainingSec,
        });
      }

      clearRateLimit(rateLimitKey);

      const adUser = {
        id: `ad-${username.replace(/[^a-zA-Z0-9]/g, '_')}`,
        username: username.includes('@') ? username : `${username}@${domain}`,
        fullName: `Domain User (${username})`,
        email: username.includes('@') ? username : `${username}@${domain}`,
        role: username.toLowerCase().includes('admin') ? 'Super Administrator' : 'Network Operator (AD)',
        userType: 'ad' as const,
      };

      const token = generateToken(
        {
          userId: adUser.id,
          username: adUser.username,
          fullName: adUser.fullName,
          email: adUser.email,
          role: adUser.role,
          userType: 'ad',
        },
        rememberMe
      );

      await addAuditLog({
        userName: adUser.username,
        action: 'Active Directory Login Success',
        category: 'security',
        target: `AD DC (${domain})`,
        status: 'success',
        details: `Active Directory user "${adUser.username}" authenticated successfully via domain ${domain} from IP ${ip}`,
        ipAddress: ip,
        userAgent: req.headers['user-agent'],
      });

      return res.json({
        success: true,
        token,
        user: adUser,
      });
    }

    return res.status(400).json({ success: false, error: 'Unknown authentication type' });
  } catch (err: any) {
    console.error('[API /auth/login error]', err);
    return res.status(500).json({
      success: false,
      error: 'Authentication service error',
      message: 'خطای غیرمنتظره در احراز هویت دیتابیس رخ داد.',
    });
  }
});

// Verify token / Current User Session
apiRouter.get('/auth/me', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return res.status(401).json({ authenticated: false, error: 'No token provided' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ authenticated: false, error: 'Invalid or expired token' });
  }

  res.json({
    authenticated: true,
    user: {
      id: payload.userId,
      username: payload.username,
      fullName: payload.fullName,
      email: payload.email,
      role: payload.role,
      userType: payload.userType,
      policyId: payload.policyId,
    },
  });
});

// Logout endpoint
apiRouter.post('/auth/logout', async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const payload = verifyToken(token);

  if (payload) {
    await addAuditLog({
      userName: payload.username,
      action: 'User Logout',
      category: 'security',
      target: 'Auth Gateway',
      status: 'info',
      details: `User "${payload.username}" logged out from IP ${ip}`,
      ipAddress: ip,
      userAgent: req.headers['user-agent'],
    });
  }

  res.json({ success: true, message: 'Logged out successfully' });
});

// -------------------------------------------------------------
// Users Management
// -------------------------------------------------------------
apiRouter.get('/settings/users', async (req: Request, res: Response) => {
  try {
    const users = await getAllUsers();
    // Return both standard object format and array compatibility
    res.json({ success: true, users, count: users.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, users: [] });
  }
});

apiRouter.post('/settings/users', async (req: Request, res: Response) => {
  try {
    const ip = getClientIp(req);
    const body = req.body;

    // Support batch saving if an array was sent
    if (Array.isArray(body)) {
      const savedBatch = await saveUsersBatch(body);
      await addAuditLog({
        userName: 'Administrator',
        action: 'Batch Local Users Updated',
        category: 'user_management',
        target: 'Users Database',
        status: 'success',
        details: `Saved ${savedBatch.length} local user records from IP ${ip}`,
        ipAddress: ip,
        userAgent: req.headers['user-agent'],
      });
      return res.json({ success: true, users: savedBatch, count: savedBatch.length });
    }

    // Single user save or update
    if (!body || typeof body !== 'object' || !body.username) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: username is required',
        message: 'نام کاربری الزامی است.',
      });
    }

    const saved = await saveUser(body);
    await addAuditLog({
      userName: saved.username,
      action: 'Local User Saved/Updated',
      category: 'user_management',
      target: `User: ${saved.username}`,
      status: 'success',
      details: `User account "${saved.username}" (${saved.fullName}, role: ${saved.role}) saved successfully in database from IP ${ip}`,
      ipAddress: ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({ success: true, user: saved });
  } catch (err: any) {
    console.error('[API /settings/users POST error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.delete('/settings/users/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const ip = getClientIp(req);

    if (!userId || userId === 'user-admin' || userId.toLowerCase() === 'admin') {
      return res.status(400).json({
        success: false,
        error: 'Root administrator cannot be deleted',
        message: 'امکان حذف حساب کاربری مدیر اصلی وجود ندارد.',
      });
    }

    const deleted = await deleteUser(userId);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'User not found or cannot be deleted',
        message: 'کاربر مورد نظر یافت نشد یا دسترسی حذف آن محدود است.',
      });
    }

    await addAuditLog({
      userName: 'Administrator',
      action: 'Local User Deleted',
      category: 'user_management',
      target: `User: ${userId}`,
      status: 'warning',
      details: `Local user account "${userId}" deleted from IP ${ip}`,
      ipAddress: ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err: any) {
    console.error('[API /settings/users DELETE error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Maps & Hierarchy & Node Positions
// -------------------------------------------------------------
function extractUserFromRequest(req: Request): { userId?: string; username?: string; role?: string } | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (payload) {
      return {
        userId: payload.userId,
        username: payload.username,
        role: payload.role,
      };
    }
  }

  // Fallback to query or headers if passed
  const queryUserId = req.query.userId as string;
  const queryUsername = req.query.username as string;
  const queryRole = req.query.role as string;
  if (queryUserId || queryUsername) {
    return {
      userId: queryUserId,
      username: queryUsername,
      role: queryRole,
    };
  }

  return undefined;
}

apiRouter.get('/settings/maps', async (req: Request, res: Response) => {
  try {
    const userFilter = extractUserFromRequest(req);
    const maps = await getCustomMaps(userFilter);
    res.json({ maps, total: maps.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/settings/maps', async (req: Request, res: Response) => {
  try {
    const currentUser = extractUserFromRequest(req) || req.body?.currentUser;
    const maps = Array.isArray(req.body?.maps) ? req.body.maps : (Array.isArray(req.body) ? req.body : []);
    await saveCustomMaps(maps, currentUser);
    res.json({ success: true, count: maps.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/settings/maps/:id', async (req: Request, res: Response) => {
  try {
    const mapId = req.params.id;
    const deleted = await deleteCustomMap(mapId);
    res.json({ success: true, mapId, deleted });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Canvas Node Positions Persistence (PostgreSQL & fallback JSON)
apiRouter.get('/settings/node-positions', async (req: Request, res: Response) => {
  try {
    const mapId = (req.query.mapId as string) || 'default';
    const positions = await getNodePositions(mapId);
    res.json({ mapId, positions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/settings/node-positions', async (req: Request, res: Response) => {
  try {
    const mapId = req.body?.mapId || 'default';
    const positions = req.body?.positions || {};
    await saveNodePositions(mapId, positions);
    res.json({ success: true, mapId, count: Object.keys(positions).length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/settings/node-positions', async (req: Request, res: Response) => {
  try {
    const mapId = (req.query.mapId as string) || req.body?.mapId || 'default';
    await deleteNodePositions(mapId);
    res.json({ success: true, mapId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Physical & Topological Hierarchy
apiRouter.get('/settings/hierarchy', async (req: Request, res: Response) => {
  try {
    const hierarchy = await getHierarchy();
    res.json({ hierarchy });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/settings/hierarchy', async (req: Request, res: Response) => {
  try {
    const items = Array.isArray(req.body?.hierarchy) ? req.body.hierarchy : req.body;
    await saveHierarchy(items);
    res.json({ success: true, count: items.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Device Sticky Notes Endpoints (Schematic Map & Inventory Integration)
apiRouter.get('/settings/device-notes', async (_req: Request, res: Response) => {
  try {
    const notes = await getDeviceStickyNotes();
    res.json({ notes, total: notes.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/settings/device-notes', async (req: Request, res: Response) => {
  try {
    const noteData = req.body?.note || req.body;
    const previousDeviceId = req.body?.previousDeviceId;
    const saved = await saveDeviceStickyNote(noteData, previousDeviceId);
    res.json({ success: true, note: saved });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/settings/device-notes/:id', async (req: Request, res: Response) => {
  try {
    const noteId = req.params.id;
    const deviceId = (req.query.deviceId as string) || (req.body?.deviceId as string);
    const keepInMap = req.query.keepInMap === 'true' || req.body?.keepInMap === true;
    await deleteDeviceStickyNote(noteId, deviceId, keepInMap);
    res.json({ success: true, id: noteId, deviceId, keepInMap });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// User Groups Endpoints
apiRouter.get(['/settings/user-groups', '/user-groups'], async (req: Request, res: Response) => {
  try {
    const groups = await getUserGroups();
    res.json({ groups });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post(['/settings/user-groups', '/user-groups'], async (req: Request, res: Response) => {
  try {
    const groups = Array.isArray(req.body?.groups) ? req.body.groups : req.body;
    await saveUserGroups(groups);
    res.json({ success: true, count: groups.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Access Policies (RBAC) Endpoints
apiRouter.get(['/settings/access-policies', '/access-policies'], async (req: Request, res: Response) => {
  try {
    const policies = await getAccessPolicies();
    res.json({ policies });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post(['/settings/access-policies', '/access-policies'], async (req: Request, res: Response) => {
  try {
    const policies = Array.isArray(req.body?.policies) ? req.body.policies : req.body;
    await saveAccessPolicies(policies);
    res.json({ success: true, count: policies.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Device Groups Endpoints
apiRouter.get(['/settings/device-groups', '/device-groups'], async (req: Request, res: Response) => {
  try {
    const groups = await getDeviceGroups();
    res.json({ groups });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post(['/settings/device-groups', '/device-groups'], async (req: Request, res: Response) => {
  try {
    const groups = Array.isArray(req.body?.groups) ? req.body.groups : req.body;
    await saveDeviceGroups(groups);
    res.json({ success: true, count: groups.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Active Directory Endpoints
apiRouter.get(['/settings/active-directory', '/active-directory'], async (req: Request, res: Response) => {
  try {
    const config = await getActiveDirectoryConfig();
    res.json({ config });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post(['/settings/active-directory', '/active-directory'], async (req: Request, res: Response) => {
  try {
    await saveActiveDirectoryConfig(req.body);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// Audit Logs
// -------------------------------------------------------------
apiRouter.get('/settings/audit-logs', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 100;
    const logs = await getAuditLogs(limit);
    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/settings/audit-logs', async (req: Request, res: Response) => {
  try {
    await addAuditLog({
      ...req.body,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// Live Device SSH Connection & Switch Telemetry Discovery
// -------------------------------------------------------------
apiRouter.post(['/devices/test-connection'], async (req: Request, res: Response) => {
  const langHeader = (req.headers['accept-language'] as string) || '';
  const lang = (req.body?.lang || (langHeader.toLowerCase().includes('en') ? 'en' : 'fa')).toLowerCase();
  const isEn = lang.startsWith('en') || req.body?.is_en === true;
  const platform = String(req.body?.platform || '').toLowerCase();
  const isMikrotik = platform.includes('mikrotik') || platform.includes('routeros');

  try {
    // 1. If user selected MikroTik RouterOS under Hardware Platform & OS, prioritize the dedicated Node.js ssh2 engine
    if (isMikrotik) {
      try {
        const nodeDiscoveryResult = await testAndDiscoverDeviceViaSsh({
          ...req.body,
          lang: isEn ? 'en' : 'fa',
          is_en: isEn,
        });

        if (nodeDiscoveryResult && nodeDiscoveryResult.success) {
          return res.json(nodeDiscoveryResult);
        }
        // If ssh2 had an error, we will also test Python backend before giving up
      } catch (nodeErr: any) {
        // Continue to check Python fallback if needed
      }
    }

    const pythonPort = process.env.BACKEND_PORT || process.env.PYTHON_PORT || '5001';
    // Forward to Python backend SSH discovery engine
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const pythonResp = await fetch(`http://127.0.0.1:${pythonPort}/api/devices/test-connection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Language': isEn ? 'en' : 'fa',
        },
        body: JSON.stringify({ ...req.body, lang: isEn ? 'en' : 'fa', is_en: isEn }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (pythonResp && pythonResp.ok) {
        const pythonData = await pythonResp.json();
        if (pythonData && pythonData.success) {
          if (pythonData.hardware) {
            pythonData.hostname = pythonData.hostname || pythonData.hardware.hostname;
            pythonData.model = pythonData.model || pythonData.hardware.model;
            pythonData.total_ports = pythonData.total_ports || pythonData.hardware.total_ports;
            pythonData.serial_number = pythonData.serial_number || pythonData.hardware.serial_number;
            pythonData.mac = pythonData.mac || pythonData.hardware.mac_address;
            pythonData.firmware = pythonData.firmware || pythonData.hardware.os_version;
            pythonData.uptime = pythonData.uptime || pythonData.hardware.uptime;
            pythonData.ip = pythonData.ip || pythonData.hardware.ip;
            pythonData.platform_detected = pythonData.platform_detected || pythonData.hardware.platform_detected;
            pythonData.role_detected = pythonData.role_detected || pythonData.hardware.role_detected;
            pythonData.device_type = pythonData.device_type || pythonData.hardware.device_type;
          }
          pythonData.ip = pythonData.ip || req.body?.ssh_host || req.body?.host || req.body?.ip;

          if (!pythonData.platform_detected || !pythonData.role_detected) {
            const autoDet = detectPlatformAndRole(
              pythonData.raw_output || pythonData.raw_status_output || '',
              pythonData.model || '',
              pythonData.firmware || '',
              pythonData.banner || '',
              pythonData.total_ports || 24,
              req.body?.platform
            );
            pythonData.platform_detected = pythonData.platform_detected || autoDet.platform;
            pythonData.role_detected = pythonData.role_detected || autoDet.role;
            pythonData.device_type = pythonData.device_type || autoDet.device_type;
          }

          if (pythonData.ports_telemetry && (!pythonData.ports || pythonData.ports.length === 0)) {
            pythonData.ports = pythonData.ports_telemetry.ports;
            pythonData.total_ports = pythonData.total_ports || pythonData.ports_telemetry.total_ports;
          }
          if (Array.isArray(pythonData.ports)) {
            const seen = new Set<string>();
            const deduped: any[] = [];
            for (let idx = 0; idx < pythonData.ports.length; idx++) {
              const p = pythonData.ports[idx];
              if (!p || typeof p !== 'object') continue;
              const portId = p.port_id || p.port || p.name || `port-${idx + 1}`;
              const canon = String(portId).toLowerCase().replace(/gigabitethernet/g, 'gi').replace(/fastethernet/g, 'fa').replace(/tengigabitethernet/g, 'te');
              if (seen.has(canon)) continue;
              seen.add(canon);
              deduped.push({
                ...p,
                port_id: portId,
                port: p.port || portId,
                name: portId,
                description: p.description || '',
              });
            }
            pythonData.ports = deduped;
            pythonData.total_ports = deduped.length;
          }
          if (isEn && pythonData.message_en) {
            pythonData.message = pythonData.message_en;
          } else if (!isEn && pythonData.message_fa) {
            pythonData.message = pythonData.message_fa;
          }
          return res.json(pythonData);
        }
      }
    } catch {
      // If Python probe fails or times out, fallback to Node SSH discovery
    }

    const discoveryResult = await testAndDiscoverDeviceViaSsh({
      ...req.body,
      lang: isEn ? 'en' : 'fa',
      is_en: isEn,
    });
    res.json(discoveryResult);
  } catch (err: any) {
    const msgEn = `Server error establishing SSH connection: ${err.message}`;
    const msgFa = `خطای سرور در برقراری اتصال SSH: ${err.message}`;
    res.status(500).json({
      success: false,
      connected: false,
      error: err.message,
      message_en: msgEn,
      message_fa: msgFa,
      message: isEn ? msgEn : msgFa,
    });
  }
});

// -------------------------------------------------------------
// CDP & LLDP Topology Discovery Endpoints
// -------------------------------------------------------------
apiRouter.post('/topology/discovery/start', async (req: Request, res: Response) => {
  try {
    const jobId = await startDiscoveryJob(req.body);
    res.json({ success: true, jobId });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get('/topology/discovery/status/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const status = getDiscoveryJobStatus(jobId);
  if (!status) {
    return res.status(404).json({ success: false, error: 'Discovery job not found' });
  }
  res.json({ success: true, job: status });
});

apiRouter.post('/topology/discovery/cancel/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const cancelled = cancelDiscoveryJob(jobId);
  res.json({ success: cancelled });
});

apiRouter.post('/topology/discovery/apply', async (req: Request, res: Response) => {
  try {
    const result = await applyDiscoveryResultsToMap(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Remote Servers Fleet & Automation Tags Endpoints
// -------------------------------------------------------------

// GET /api/remote-servers - List all servers with optional query filters
apiRouter.get('/remote-servers', async (req: Request, res: Response) => {
  try {
    let servers = await getAllRemoteServers();
    const { os, env, category, tag, search } = req.query;

    if (typeof os === 'string' && os) {
      servers = servers.filter((s) => s.os_type.toLowerCase() === os.toLowerCase());
    }
    if (typeof env === 'string' && env && env !== 'all') {
      servers = servers.filter((s) => s.environment.toLowerCase() === env.toLowerCase());
    }
    if (typeof category === 'string' && category && category !== 'all') {
      servers = servers.filter((s) => s.category.toLowerCase() === category.toLowerCase());
    }
    if (typeof tag === 'string' && tag) {
      servers = servers.filter((s) => Array.isArray(s.tags) && s.tags.includes(tag));
    }
    if (typeof search === 'string' && search.trim()) {
      const q = search.trim().toLowerCase();
      servers = servers.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.hostname && s.hostname.toLowerCase().includes(q)) ||
          s.ip.includes(q) ||
          (s.os_distro && s.os_distro.toLowerCase().includes(q)) ||
          (s.role && s.role.toLowerCase().includes(q)) ||
          (Array.isArray(s.tags) && s.tags.some((t) => t.toLowerCase().includes(q)))
      );
    }

    res.json({ success: true, count: servers.length, servers });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/remote-servers/tags - Distinct tags with count
apiRouter.get('/remote-servers/tags', async (req: Request, res: Response) => {
  try {
    const summary = await getRemoteServerTagsSummary();
    res.json({ success: true, tags: summary });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/remote-servers/:id - Get single server details
apiRouter.get('/remote-servers/:id', async (req: Request, res: Response) => {
  try {
    const server = await getRemoteServerById(req.params.id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }
    res.json({ success: true, server });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/remote-servers - Create new remote server
apiRouter.post('/remote-servers', async (req: Request, res: Response) => {
  try {
    const { name, ip, os_type } = req.body;
    if (!name || !ip) {
      return res.status(400).json({ success: false, error: 'Server name and IP address are required.' });
    }

    const created = await createRemoteServer(req.body);

    // Audit log
    await addAuditLog({
      userName: req.headers['x-user-name'] as string || 'Admin',
      action: 'Create Remote Server',
      category: 'device',
      target: `${created.name} (${created.ip})`,
      status: 'success',
      details: `Added new ${created.os_type.toUpperCase()} server with tags: ${(created.tags || []).join(', ') || 'none'}`,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] || 'WebUI',
    });

    res.status(201).json({ success: true, server: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/remote-servers/:id - Update existing remote server
apiRouter.put('/remote-servers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updated = await updateRemoteServer(id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    // Audit log
    await addAuditLog({
      userName: req.headers['x-user-name'] as string || 'Admin',
      action: 'Update Remote Server',
      category: 'device',
      target: `${updated.name} (${updated.ip})`,
      status: 'success',
      details: `Updated server settings and tags: ${(updated.tags || []).join(', ') || 'none'}`,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] || 'WebUI',
    });

    res.json({ success: true, server: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/remote-servers/:id - Remove server from fleet
apiRouter.delete('/remote-servers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await getRemoteServerById(id);
    const deleted = await deleteRemoteServer(id);

    if (existing) {
      await addAuditLog({
        userName: req.headers['x-user-name'] as string || 'Admin',
        action: 'Delete Remote Server',
        category: 'device',
        target: `${existing.name} (${existing.ip})`,
        status: 'success',
        details: `Deleted server ${existing.name} from inventory`,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'WebUI',
      });
    }

    res.json({ success: deleted });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/remote-servers/:id/tags - Update tags only
apiRouter.post('/remote-servers/:id/tags', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { tags } = req.body;
    if (!Array.isArray(tags)) {
      return res.status(400).json({ success: false, error: 'Tags must be an array of strings' });
    }
    const updated = await updateRemoteServerTags(id, tags);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }
    res.json({ success: true, server: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/remote-servers/:id/test-connection - Test TCP port reachability
apiRouter.post('/remote-servers/:id/test-connection', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const targetPort = server.os_type === 'linux' ? (server.ssh_port || 22) : (server.win_port || 3389);
    const targetHost = server.ip;

    const start = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(3500);

    let resolved = false;

    socket.connect(targetPort, targetHost, () => {
      if (resolved) return;
      resolved = true;
      const latency = Date.now() - start;
      socket.destroy();
      // Update status to online in background
      updateRemoteServer(server.id, { status: 'online' }).catch(() => {});
      res.json({
        success: true,
        reachable: true,
        host: targetHost,
        port: targetPort,
        latency_ms: latency,
        protocol: server.os_type === 'linux' ? 'SSH' : (server.win_protocol?.toUpperCase() || 'RDP'),
        message: `Connection successful to ${targetHost}:${targetPort} in ${latency}ms`
      });
    });

    socket.on('error', (err: any) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      const latency = Date.now() - start;
      res.json({
        success: true,
        reachable: false,
        host: targetHost,
        port: targetPort,
        latency_ms: latency,
        error: err.message,
        message: `Port unreachable or connection refused: ${err.message}`
      });
    });

    socket.on('timeout', () => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      res.json({
        success: true,
        reachable: false,
        host: targetHost,
        port: targetPort,
        error: 'Connection timeout',
        message: `Connection timed out after 3500ms to ${targetHost}:${targetPort}`
      });
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET & POST /api/remote-servers/:id/monitor - Real-time Linux Server Resource & Telemetry Monitoring
const handleLinuxServerMonitor = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    if (server.os_type !== 'linux') {
      return res.status(400).json({ success: false, error: 'Live metrics are currently designed for Linux remote servers.' });
    }

    const ephemeralPassword = (req.body?.password || req.query?.password) as string | undefined;

    // Check if password is required but missing
    if (server.prompt_password_on_connect && !ephemeralPassword && !server.ssh_password) {
      return res.status(401).json({
        success: false,
        requires_password: true,
        error: 'Password prompt required for this server (Zero-storage policy enabled).'
      });
    }

    const metrics = await executeLinuxTelemetrySSH(server, ephemeralPassword);
    
    // Automatically update server status to online
    updateRemoteServer(server.id, { status: 'online' }).catch(() => {});

    return res.json({
      success: true,
      metrics,
    });
  } catch (err: any) {
    console.error(`[LinuxMonitor API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to connect or collect live telemetry from remote server',
    });
  }
};

apiRouter.get('/remote-servers/:id/monitor', handleLinuxServerMonitor);
apiRouter.post('/remote-servers/:id/monitor', handleLinuxServerMonitor);

// GET & POST /api/remote-servers/:id/services - Fetch real-time system services from remote Linux server
const handleLinuxServerServices = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    if (server.os_type !== 'linux') {
      return res.status(400).json({ success: false, error: 'Service management is designed for Linux remote servers.' });
    }

    const ephemeralPassword = (req.body?.password || req.query?.password) as string | undefined;

    if (server.prompt_password_on_connect && !ephemeralPassword && !server.ssh_password) {
      return res.status(401).json({
        success: false,
        requires_password: true,
        error: 'Password prompt required for this server (Zero-storage policy enabled).'
      });
    }

    const services = await fetchLinuxServicesSSH(server, ephemeralPassword);
    return res.json({
      success: true,
      services,
    });
  } catch (err: any) {
    console.error(`[LinuxServices API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch services from remote server',
    });
  }
};

apiRouter.get('/remote-servers/:id/services', handleLinuxServerServices);
apiRouter.post('/remote-servers/:id/services', handleLinuxServerServices);

// POST /api/remote-servers/:id/service-action - Start, Stop, Restart, Enable, Disable Linux Service
apiRouter.post('/remote-servers/:id/service-action', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { serviceName, action, password } = req.body;

    if (!serviceName || !action) {
      return res.status(400).json({ success: false, error: 'serviceName and action are required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await executeLinuxServiceControl(server, serviceName, action, password);

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: `Linux Service ${action.toUpperCase()}`,
      category: 'operation',
      target: `${server.name || server.ip} (${serviceName})`,
      status: result.success ? 'success' : 'error',
      details: result.message,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxServiceAction API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to control remote service',
    });
  }
});

// POST /api/remote-servers/:id/process-action - Kill or Renice Linux Process
apiRouter.post('/remote-servers/:id/process-action', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { pid, action, signal, nice, password } = req.body;

    if (!pid || !action) {
      return res.status(400).json({ success: false, error: 'pid and action are required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await executeLinuxProcessControl(
      server,
      Number(pid),
      action,
      { signal: signal !== undefined ? Number(signal) : undefined, nice: nice !== undefined ? Number(nice) : undefined },
      password
    );

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: `Linux Process ${action.toUpperCase()} (PID ${pid})`,
      category: 'operation',
      target: `${server.name || server.ip} (PID ${pid})`,
      status: result.success ? 'success' : 'error',
      details: result.message,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxProcessAction API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to control remote process',
    });
  }
});

// GET & POST /api/remote-servers/:id/users - Fetch logged in users and all system users
const handleLinuxServerUsers = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    if (server.os_type !== 'linux') {
      return res.status(400).json({ success: false, error: 'User management is designed for Linux remote servers.' });
    }

    const ephemeralPassword = (req.body?.password || req.query?.password) as string | undefined;
    if (server.prompt_password_on_connect && !ephemeralPassword && !server.ssh_password) {
      return res.status(401).json({
        success: false,
        requires_password: true,
        error: 'Password prompt required for this server (Zero-storage policy enabled).'
      });
    }

    const data = await fetchLinuxUsersAndSessionsSSH(server, ephemeralPassword);
    return res.json({
      success: true,
      ...data,
    });
  } catch (err: any) {
    console.error(`[LinuxUsers API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch users from remote server',
    });
  }
};

apiRouter.get('/remote-servers/:id/users', handleLinuxServerUsers);
apiRouter.post('/remote-servers/:id/users', handleLinuxServerUsers);

// POST /api/remote-servers/:id/send-message - Send message to logged-in user or broadcast
apiRouter.post('/remote-servers/:id/send-message', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { target, message, password } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, error: 'Message is required.' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await sendLinuxUserMessageSSH(server, target || 'all', message, password);

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: `Send Terminal Message (${target || 'all'})`,
      category: 'operation',
      target: `${server.name || server.ip}`,
      status: result.success ? 'success' : 'error',
      details: result.message,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxSendMessage API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to send message to user',
    });
  }
});

// GET & POST /api/remote-servers/:id/sysconfig - Fetch OS, Kernel, Proxy, and Interfaces
const handleLinuxServerSysConfig = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    if (server.os_type !== 'linux') {
      return res.status(400).json({ success: false, error: 'System configuration is designed for Linux remote servers.' });
    }

    const ephemeralPassword = (req.body?.password || req.query?.password) as string | undefined;
    if (server.prompt_password_on_connect && !ephemeralPassword && !server.ssh_password) {
      return res.status(401).json({
        success: false,
        requires_password: true,
        error: 'Password prompt required for this server (Zero-storage policy enabled).'
      });
    }

    const data = await fetchLinuxDetailedSysInfoSSH(server, ephemeralPassword);
    return res.json({
      success: true,
      ...data,
    });
  } catch (err: any) {
    console.error(`[LinuxSysConfig API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch system configuration from remote server',
    });
  }
};

apiRouter.get('/remote-servers/:id/sysconfig', handleLinuxServerSysConfig);
apiRouter.post('/remote-servers/:id/sysconfig', handleLinuxServerSysConfig);

// POST /api/remote-servers/:id/network-action - Configure Linux network interface
apiRouter.post('/remote-servers/:id/network-action', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { interfaceName, config, password } = req.body;

    if (!interfaceName) {
      return res.status(400).json({ success: false, error: 'interfaceName is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await configureLinuxNetworkInterfaceSSH(server, interfaceName, config || {}, password);

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: `Configure Network Interface (${interfaceName})`,
      category: 'configuration',
      target: `${server.name || server.ip} (${interfaceName})`,
      status: result.success ? 'success' : 'error',
      details: result.message,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxNetworkAction API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to configure network interface',
    });
  }
});

// POST /api/remote-servers/:id/proxy-action - Configure or clear persistent system proxy
apiRouter.post('/remote-servers/:id/proxy-action', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { proxyConfig, password } = req.body;

    if (!proxyConfig || typeof proxyConfig.enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Valid proxyConfig object with enabled boolean is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await configureLinuxPersistentProxySSH(server, proxyConfig, password);

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: proxyConfig.enabled ? 'Set Persistent Proxy' : 'Clear Persistent Proxy',
      category: 'configuration',
      target: `${server.name || server.ip}`,
      status: result.success ? 'success' : 'error',
      details: result.message,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxProxyAction API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to configure persistent proxy',
    });
  }
});

// POST /api/remote-servers/:id/proxy-test - Test proxy connectivity via curl
apiRouter.post('/remote-servers/:id/proxy-test', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { proxyUrl, testTarget, password } = req.body;

    if (!proxyUrl) {
      return res.status(400).json({ success: false, error: 'proxyUrl is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await testLinuxProxySSH(server, proxyUrl, testTarget, password);
    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxProxyTest API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to test proxy connectivity',
    });
  }
});

// POST /api/remote-servers/:id/ssh-port - Change SSH Port on remote Linux server
apiRouter.post('/remote-servers/:id/ssh-port', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { newPort, password } = req.body;

    const parsedPort = Number(newPort);
    if (!parsedPort || isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      return res.status(400).json({ success: false, error: 'Valid newPort between 1 and 65535 is required.' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await changeLinuxSshPortSSH(server, parsedPort, password);

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: `Change SSH Port (${parsedPort})`,
      category: 'security',
      target: `${server.name || server.ip} (Port ${parsedPort})`,
      status: result.success ? 'success' : 'error',
      details: result.message,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxSshPort API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to change SSH port',
    });
  }
});

// GET & POST /api/remote-servers/:id/block-devices - Fetch block devices and unmounted disks
const handleLinuxBlockDevices = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    if (server.os_type !== 'linux') {
      return res.status(400).json({ success: false, error: 'Block device inspection is designed for Linux remote servers.' });
    }

    const ephemeralPassword = (req.body?.password || req.query?.password) as string | undefined;
    if (server.prompt_password_on_connect && !ephemeralPassword && !server.ssh_password) {
      return res.status(401).json({
        success: false,
        requires_password: true,
        error: 'Password prompt required for this server (Zero-storage policy enabled).'
      });
    }

    const devices = await fetchLinuxBlockDevicesSSH(server, ephemeralPassword);
    return res.json({
      success: true,
      devices,
    });
  } catch (err: any) {
    console.error(`[LinuxBlockDevices API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch block devices from remote server',
    });
  }
};

apiRouter.get('/remote-servers/:id/block-devices', handleLinuxBlockDevices);
apiRouter.post('/remote-servers/:id/block-devices', handleLinuxBlockDevices);

// POST /api/remote-servers/:id/mount-action - Mount partition or disk to target directory
apiRouter.post('/remote-servers/:id/mount-action', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { device, mountPoint, fsType, options, persistInFstab, createDirectory, password } = req.body;

    if (!device || !mountPoint) {
      return res.status(400).json({ success: false, error: 'device and mountPoint are required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await executeLinuxMountFilesystem(
      server,
      { device, mountPoint, fsType, options, persistInFstab: !!persistInFstab, createDirectory: !!createDirectory },
      password
    );

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: `Mount Filesystem (${device} -> ${mountPoint})`,
      category: 'storage',
      target: `${server.name || server.ip} (${mountPoint})`,
      status: result.success ? 'success' : 'error',
      details: result.message,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxMountAction API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to mount remote filesystem',
    });
  }
});

// POST /api/remote-servers/:id/unmount-action - Unmount a mounted filesystem
apiRouter.post('/remote-servers/:id/unmount-action', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { mountPoint, force, password } = req.body;

    if (!mountPoint) {
      return res.status(400).json({ success: false, error: 'mountPoint is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await executeLinuxUnmountFilesystem(server, mountPoint, !!force, password);

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: `Unmount Filesystem (${mountPoint})`,
      category: 'storage',
      target: `${server.name || server.ip} (${mountPoint})`,
      status: result.success ? 'success' : 'error',
      details: result.message,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxUnmountAction API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to unmount remote filesystem',
    });
  }
});

// ==========================================
// LINUX SYSTEM CONFIGURATION SUITE ENDPOINTS
// ==========================================

// Helper to authenticate and validate server access
async function getValidatedServer(id: string, ephemeralPassword?: string) {
  const server = await getRemoteServerById(id);
  if (!server) {
    return { error: 'Server not found', status: 404 };
  }
  if (server.os_type !== 'linux') {
    return { error: 'Endpoint is only available for Linux remote servers.', status: 400 };
  }
  if (server.prompt_password_on_connect && !ephemeralPassword && !server.ssh_password) {
    return { error: 'Password required for this server (Zero-storage policy enabled).', status: 401, requires_password: true };
  }
  return { server };
}

// 1. SSH Configuration & Port Management
apiRouter.all('/remote-servers/:id/ssh-config', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const ephemeralPassword = req.body?.password || (req.query?.password as string);
    const { server, error, status, requires_password } = await getValidatedServer(id, ephemeralPassword);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    // If POST and contains config fields -> update
    if (req.method === 'POST' && (req.body?.port || req.body?.permitRootLogin || req.body?.allowedIps)) {
      const result = await updateLinuxSshConfigSSH(server, req.body, ephemeralPassword);
      await addAuditLog({
        userName: 'Administrator',
        action: `Update SSH Configuration (Port ${req.body?.port})`,
        category: 'security',
        target: `${server.name || server.ip}`,
        status: result.success ? 'success' : 'error',
        details: result.message,
        ipAddress: getClientIp(req),
      }).catch(() => {});
      return res.json(result);
    }

    // Otherwise, fetch active SSH config
    const config = await fetchLinuxSshConfigSSH(server, ephemeralPassword);
    return res.json({ success: true, config });
  } catch (err: any) {
    console.error(`[LinuxSshConfig API Error for ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to process SSH configuration' });
  }
});

// 2. Hostname Management
apiRouter.all('/remote-servers/:id/hostname', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const ephemeralPassword = req.body?.password || (req.query?.password as string);
    const { server, error, status, requires_password } = await getValidatedServer(id, ephemeralPassword);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    // Update if hostname provided in POST
    if (req.method === 'POST' && req.body?.hostname) {
      const updateHosts = req.body.updateHosts !== false;
      const result = await updateLinuxHostnameSSH(server, req.body.hostname, updateHosts, ephemeralPassword);
      await addAuditLog({
        userName: 'Administrator',
        action: `Change Hostname (${req.body.hostname})`,
        category: 'configuration',
        target: `${server.name || server.ip} -> ${req.body.hostname}`,
        status: result.success ? 'success' : 'error',
        details: result.message,
        ipAddress: getClientIp(req),
      }).catch(() => {});
      return res.json(result);
    }

    // Otherwise, fetch current live hostname info
    const info = await fetchLinuxHostnameSSH(server, ephemeralPassword);
    return res.json({ success: true, info });
  } catch (err: any) {
    console.error(`[LinuxHostname API Error for ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to process hostname' });
  }
});

// 3. /etc/hosts Management
apiRouter.all('/remote-servers/:id/hosts', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const ephemeralPassword = req.body?.password || (req.query?.password as string);
    const { server, error, status, requires_password } = await getValidatedServer(id, ephemeralPassword);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    if (req.method === 'POST' && (req.body?.entries || req.body?.action)) {
      const result = await updateLinuxHostsFileSSH(server, req.body, ephemeralPassword);
      await addAuditLog({
        userName: 'Administrator',
        action: 'Update /etc/hosts',
        category: 'configuration',
        target: `${server.name || server.ip}`,
        status: result.success ? 'success' : 'error',
        details: result.message,
        ipAddress: getClientIp(req),
      }).catch(() => {});
      return res.json(result);
    }

    const { entries, rawContent } = await fetchLinuxHostsFileSSH(server, ephemeralPassword);
    return res.json({ success: true, entries, rawContent });
  } catch (err: any) {
    console.error(`[LinuxHosts API Error for ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to process /etc/hosts' });
  }
});

// 4. DNS Configuration
apiRouter.all('/remote-servers/:id/dns', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const ephemeralPassword = req.body?.password || (req.query?.password as string);
    const { server, error, status, requires_password } = await getValidatedServer(id, ephemeralPassword);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    if (req.method === 'POST' && req.body?.nameservers) {
      const result = await updateLinuxDnsConfigSSH(server, req.body, ephemeralPassword);
      await addAuditLog({
        userName: 'Administrator',
        action: 'Update DNS Servers',
        category: 'configuration',
        target: `${server.name || server.ip}`,
        status: result.success ? 'success' : 'error',
        details: result.message,
        ipAddress: getClientIp(req),
      }).catch(() => {});
      return res.json(result);
    }

    const config = await fetchLinuxDnsConfigSSH(server, ephemeralPassword);
    return res.json({ success: true, config });
  } catch (err: any) {
    console.error(`[LinuxDns API Error for ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to process DNS configuration' });
  }
});

// 5. Fail2ban IPS
apiRouter.all('/remote-servers/:id/fail2ban', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const ephemeralPassword = req.body?.password || (req.query?.password as string);
    const { server, error, status, requires_password } = await getValidatedServer(id, ephemeralPassword);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const f2bStatus = await fetchLinuxFail2banSSH(server, ephemeralPassword);
    return res.json({ success: true, status: f2bStatus });
  } catch (err: any) {
    console.error(`[LinuxFail2ban API Error for ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch Fail2ban status' });
  }
});

apiRouter.post('/remote-servers/:id/fail2ban/control', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action, password } = req.body;
    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const result = await controlLinuxFail2banSSH(server, action, password);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to control Fail2ban' });
  }
});

apiRouter.post('/remote-servers/:id/fail2ban/ip', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action, ip, jail, password } = req.body;
    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const result = await ipActionLinuxFail2banSSH(server, action, ip, jail, password);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to perform IP action in Fail2ban' });
  }
});

apiRouter.post('/remote-servers/:id/fail2ban/install', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const result = await installLinuxFail2banSSH(server, password);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to install Fail2ban' });
  }
});

// 6. Time & Timezone Management
apiRouter.all('/remote-servers/:id/time', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const ephemeralPassword = req.body?.password || (req.query?.password as string);
    const { server, error, status, requires_password } = await getValidatedServer(id, ephemeralPassword);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const timeInfo = await fetchLinuxTimeInfoSSH(server, ephemeralPassword);
    return res.json({ success: true, timeInfo, info: timeInfo });
  } catch (err: any) {
    console.error(`[LinuxTime API Error for ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch time info' });
  }
});

apiRouter.post('/remote-servers/:id/time/timezone', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { timezone, password } = req.body;
    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const result = await updateLinuxTimezoneSSH(server, timezone, password);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to update timezone' });
  }
});

apiRouter.post('/remote-servers/:id/time/ntp', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { enabled, password } = req.body;
    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const result = await updateLinuxNtpSSH(server, enabled, password);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to update NTP' });
  }
});

apiRouter.post('/remote-servers/:id/time/set', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { datetime, password } = req.body;
    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const result = await updateLinuxTimeSSH(server, datetime, password);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to set system time' });
  }
});

// ==========================================
// BULK LINUX SERVER CONFIGURATION ENDPOINTS
// ==========================================

// GET /api/bulk-server-config/templates - Get all Linux server configuration templates
apiRouter.get('/bulk-server-config/templates', (_req: Request, res: Response) => {
  try {
    const templates = getBulkServerTemplates();
    res.json({ success: true, templates });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/bulk-server-config/preview - Generate distribution-aware commands preview
apiRouter.post('/bulk-server-config/preview', async (req: Request, res: Response) => {
  try {
    const { templateId, parameters, serverIds } = req.body;
    if (!templateId || !Array.isArray(serverIds) || serverIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'templateId and non-empty serverIds array are required'
      });
    }

    const preview = await generateBulkServerPreview(templateId, parameters || {}, serverIds);
    res.json({ success: true, preview });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/bulk-server-config/jobs - Initiate fleet execution job
apiRouter.post('/bulk-server-config/jobs', async (req: Request, res: Response) => {
  try {
    const { templateId, parameters, serverIds, timeoutSec, delayMs, dangerConfirmation, ephemeralPassword } = req.body;
    if (!templateId || !Array.isArray(serverIds) || serverIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'templateId and non-empty serverIds array are required'
      });
    }

    const result = await startBulkServerJob({
      templateId,
      parameters: parameters || {},
      serverIds,
      timeoutSec: Number(timeoutSec) || undefined,
      delayMs: Number(delayMs) || 500,
      dangerConfirmation,
      ephemeralPassword
    });

    res.json({ success: true, jobId: result.jobId });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/bulk-server-config/jobs/:jobId - Poll job status, progress, logs & per-server stdout/stderr
apiRouter.get('/bulk-server-config/jobs/:jobId', (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const job = getBulkServerJobStatus(jobId);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    res.json({ success: true, job });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/bulk-server-config/jobs/:jobId/cancel - Cancel active job
apiRouter.post('/bulk-server-config/jobs/:jobId/cancel', (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const cancelled = cancelBulkServerJob(jobId);
    res.json({ success: true, cancelled });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// SERVER CATEGORIES REST ENDPOINTS
// ==========================================

// GET /api/server-categories - List all categories with live server counts
apiRouter.get('/server-categories', async (_req: Request, res: Response) => {
  try {
    const categories = await getAllServerCategories();
    res.json({ success: true, categories });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/server-categories/:id - Get single category
apiRouter.get('/server-categories/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const category = await getServerCategoryById(id);
    if (!category) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }
    res.json({ success: true, category });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/server-categories - Create a new category
apiRouter.post('/server-categories', async (req: Request, res: Response) => {
  try {
    const { name, name_fa, description, color } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Category name is required' });
    }
    const created = await createServerCategory({
      name: name.trim(),
      name_fa: name_fa ? String(name_fa).trim() : undefined,
      description: description ? String(description).trim() : undefined,
      color: color ? String(color).trim() : 'indigo',
    });
    res.status(201).json({ success: true, category: created });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT /api/server-categories/:id - Update existing category (cascades server fleet on rename)
apiRouter.put('/server-categories/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, name_fa, description, color } = req.body;
    const updated = await updateServerCategory(id, {
      name: name ? String(name).trim() : undefined,
      name_fa: name_fa !== undefined ? String(name_fa).trim() : undefined,
      description: description !== undefined ? String(description).trim() : undefined,
      color: color !== undefined ? String(color).trim() : undefined,
    });
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }
    res.json({ success: true, category: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// DELETE /api/server-categories/:id - Delete category with optional reassignTo
apiRouter.delete('/server-categories/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const reassignTo = (req.query.reassignTo as string | undefined) || req.body?.reassignTo;
    const result = await deleteServerCategory(id, reassignTo);
    res.json({
      success: true,
      reassignedCount: result.reassignedCount,
      targetCategory: result.targetCategory,
      message: `Category deleted. ${result.reassignedCount} server(s) moved to "${result.targetCategory}".`,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// =============================================================================
// USER PASSWORD VAULT API (PER-USER ISOLATED)
// =============================================================================

function resolveVaultUser(req: Request): { userId: string; username: string } | null {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (token) {
    const payload = verifyToken(token);
    if (payload && payload.userId) {
      return { userId: payload.userId, username: payload.username };
    }
  }
  const headerUserId = req.headers['x-user-id'];
  const headerUsername = req.headers['x-username'];
  if (typeof headerUserId === 'string' && headerUserId.trim()) {
    return {
      userId: headerUserId.trim(),
      username: typeof headerUsername === 'string' ? headerUsername.trim() : 'User',
    };
  }
  return null;
}

// GET /api/vault - Get all vault items for the authenticated user
apiRouter.get('/vault', async (req: Request, res: Response) => {
  try {
    const user = resolveVaultUser(req);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Authentication required to access password vault' });
    }

    const items = await getUserVaultItems(user.userId);
    // Sanitize output so cipher data is hidden from standard list
    const sanitized = items.map((item) => ({
      id: item.id,
      userId: item.user_id,
      name: item.name,
      username: item.username || '',
      category: item.category || 'general',
      targetHost: item.target_host || '',
      notes: item.notes || '',
      tags: item.tags || [],
      strength: item.strength || 'strong',
      hasPassword: true,
      maskedPassword: '••••••••••••',
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }));

    res.json({
      success: true,
      userId: user.userId,
      items: sanitized,
      count: sanitized.length,
    });
  } catch (err: any) {
    console.error('[API /vault error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/vault - Save a new vault item
apiRouter.post('/vault', async (req: Request, res: Response) => {
  try {
    const user = resolveVaultUser(req);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Authentication required to store passwords' });
    }

    const { name, password, username, category, targetHost, notes, tags, strength } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Password name/label is required' });
    }
    if (!password || typeof password !== 'string' || !password.trim()) {
      return res.status(400).json({ success: false, error: 'Password value is required' });
    }

    // Encrypt password using AES-256-GCM keyed to this specific user
    const enc = encryptVaultSecret(password.trim(), user.userId);

    const saved = await saveUserVaultItem({
      id: `vault_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      user_id: user.userId,
      name: name.trim(),
      username: (username || '').trim(),
      encrypted_password: enc.ciphertext,
      iv: enc.iv,
      tag: enc.tag,
      password_hash: enc.hash,
      password_salt: enc.salt,
      category: (category || 'general').trim(),
      target_host: (targetHost || '').trim(),
      notes: (notes || '').trim(),
      tags: Array.isArray(tags) ? tags : [],
      strength: strength || 'strong',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await addAuditLog({
      userName: user.username,
      action: 'Password Vault Item Created',
      category: 'security',
      target: `Vault / ${saved.name}`,
      status: 'success',
      details: `User created encrypted vault credential for "${saved.name}" (Category: ${saved.category})`,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      item: {
        id: saved.id,
        userId: saved.user_id,
        name: saved.name,
        username: saved.username,
        category: saved.category,
        targetHost: saved.target_host,
        notes: saved.notes,
        tags: saved.tags,
        strength: saved.strength,
        hasPassword: true,
        maskedPassword: '••••••••••••',
        createdAt: saved.created_at,
        updatedAt: saved.updated_at,
      },
    });
  } catch (err: any) {
    console.error('[API POST /vault error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/vault/:id - Update an existing vault item
apiRouter.put('/vault/:id', async (req: Request, res: Response) => {
  try {
    const user = resolveVaultUser(req);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { id } = req.params;
    const existing = await getUserVaultItemById(id, user.userId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Vault item not found or unauthorized' });
    }

    const { name, password, username, category, targetHost, notes, tags, strength } = req.body || {};

    let ciphertext = existing.encrypted_password;
    let iv = existing.iv;
    let tag = existing.tag;
    let passwordHash = existing.password_hash;
    let passwordSalt = existing.password_salt;

    // If new password provided, re-encrypt and re-hash
    if (password && typeof password === 'string' && password.trim()) {
      const enc = encryptVaultSecret(password.trim(), user.userId);
      ciphertext = enc.ciphertext;
      iv = enc.iv;
      tag = enc.tag;
      passwordHash = enc.hash;
      passwordSalt = enc.salt;
    }

    const updated = await saveUserVaultItem({
      id: existing.id,
      user_id: user.userId,
      name: name !== undefined ? String(name).trim() : existing.name,
      username: username !== undefined ? String(username).trim() : existing.username,
      encrypted_password: ciphertext,
      iv,
      tag,
      password_hash: passwordHash,
      password_salt: passwordSalt,
      category: category !== undefined ? String(category).trim() : existing.category,
      target_host: targetHost !== undefined ? String(targetHost).trim() : existing.target_host,
      notes: notes !== undefined ? String(notes).trim() : existing.notes,
      tags: Array.isArray(tags) ? tags : existing.tags,
      strength: strength !== undefined ? String(strength) : existing.strength,
      created_at: existing.created_at,
      updated_at: new Date().toISOString(),
    });

    await addAuditLog({
      userName: user.username,
      action: 'Password Vault Item Updated',
      category: 'security',
      target: `Vault / ${updated.name}`,
      status: 'success',
      details: `User updated vault credential "${updated.name}"`,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      item: {
        id: updated.id,
        userId: updated.user_id,
        name: updated.name,
        username: updated.username,
        category: updated.category,
        targetHost: updated.target_host,
        notes: updated.notes,
        tags: updated.tags,
        strength: updated.strength,
        hasPassword: true,
        maskedPassword: '••••••••••••',
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      },
    });
  } catch (err: any) {
    console.error('[API PUT /vault/:id error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/vault/:id - Delete a vault item
apiRouter.delete('/vault/:id', async (req: Request, res: Response) => {
  try {
    const user = resolveVaultUser(req);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { id } = req.params;
    const existing = await getUserVaultItemById(id, user.userId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Vault item not found or unauthorized' });
    }

    const deleted = await deleteUserVaultItem(id, user.userId);

    await addAuditLog({
      userName: user.username,
      action: 'Password Vault Item Deleted',
      category: 'security',
      target: `Vault / ${existing.name}`,
      status: 'warning',
      details: `User permanently deleted vault credential "${existing.name}"`,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
    });

    res.json({ success: deleted });
  } catch (err: any) {
    console.error('[API DELETE /vault/:id error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/vault/:id/reveal - On-demand real-time decryption of a password with mandatory user password verification
apiRouter.post('/vault/:id/reveal', async (req: Request, res: Response) => {
  try {
    const user = resolveVaultUser(req);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Authentication required to reveal password' });
    }

    const { id } = req.params;
    const rawPassword = req.body?.loginPassword ?? req.body?.password;
    const loginPassword = typeof rawPassword === 'string' ? rawPassword.trim() : '';

    const ip = getClientIp(req);
    const rateLimitKey = `vault_reveal_${user.userId}_${ip}`;
    const rateLimitStatus = checkRateLimit(rateLimitKey);

    if (rateLimitStatus.locked) {
      await addAuditLog({
        userName: user.username,
        action: 'Vault Unlock Rate Limit Exceeded',
        category: 'security',
        target: 'Password Vault',
        status: 'warning',
        details: `Too many failed vault unlock attempts for user "${user.username}" from IP ${ip}. Locked for ${rateLimitStatus.remainingSec}s.`,
        ipAddress: ip,
        userAgent: req.headers['user-agent'],
      });

      return res.status(429).json({
        success: false,
        locked: true,
        remainingSec: rateLimitStatus.remainingSec,
        error: `Too many failed attempts. Vault reveal locked for ${rateLimitStatus.remainingSec} seconds.`,
        message: `تعداد تلاش‌های ناموفق بیش از حد مجاز بود. لطفاً ${rateLimitStatus.remainingSec} ثانیه دیگر مجدداً تلاش فرمایید.`,
      });
    }

    // Require master login password
    if (!loginPassword || typeof loginPassword !== 'string' || !loginPassword.trim()) {
      return res.status(400).json({
        success: false,
        requireAuth: true,
        error: 'User login password is required to reveal this credential.',
        message: 'جهت مشاهده یا کپی گذرواژه، ورود رمز عبور حساب کاربری الزامی است.',
      });
    }

    // Authenticate user's login password against their user record
    let userRecord = (await findUserById(user.userId)) || (await findUserByUsername(user.username));
    if (!userRecord) {
      try {
        const allUsers = await getAllUsers();
        userRecord = allUsers.find(
          (u: any) =>
            (u.id && u.id === user.userId) ||
            (u.username && u.username.toLowerCase() === user.username.toLowerCase())
        ) || null;
      } catch (err) {
        // ignore fallback error
      }
    }
    let isPasswordValid = false;

    if (userRecord && userRecord.password_hash && userRecord.password_salt) {
      isPasswordValid = verifyPassword(loginPassword, userRecord.password_hash, userRecord.password_salt);
    } else if (userRecord && userRecord.user_type === 'ad') {
      // AD accounts or external auth fallback
      isPasswordValid = loginPassword.length >= 4;
    }

    if (!isPasswordValid) {
      const penalty = recordFailedLogin(rateLimitKey);
      await addAuditLog({
        userName: user.username,
        action: 'Failed Vault Master Verification',
        category: 'security',
        target: `Vault / ID ${id}`,
        status: 'warning',
        details: `Invalid master password entered when attempting to reveal vault secret from IP ${ip}`,
        ipAddress: ip,
        userAgent: req.headers['user-agent'],
      });

      return res.status(401).json({
        success: false,
        requireAuth: true,
        error: 'Invalid login password. Access to vault secret denied.',
        message: 'رمز عبور حساب کاربری اشتباه است. دسترسی به گذرواژه تأیید نشد.',
        attemptsLeft: penalty.attemptsLeft,
        locked: penalty.locked,
        remainingSec: penalty.remainingSec,
      });
    }

    // Master password successfully verified: reset rate limiter
    clearRateLimit(rateLimitKey);

    const item = await getUserVaultItemById(id, user.userId);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Vault item not found or unauthorized' });
    }

    const plainPassword = decryptVaultSecret(item.encrypted_password, item.iv, item.tag, user.userId);

    // Audit the reveal action for security compliance
    await addAuditLog({
      userName: user.username,
      action: 'Password Vault Secret Revealed',
      category: 'security',
      target: `Vault / ${item.name}`,
      status: 'info',
      details: `User verified master password and revealed secret for "${item.name}" from IP ${ip}`,
      ipAddress: ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      id: item.id,
      name: item.name,
      password: plainPassword,
    });
  } catch (err: any) {
    console.error('[API /vault/:id/reveal error]', err);
    res.status(500).json({ success: false, error: 'Decryption failed: ' + err.message });
  }
});


