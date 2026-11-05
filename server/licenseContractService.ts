import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { verifyToken, UserSessionPayload } from './auth';
import { findUserById, findUserByUsername, getEffectivePolicyForUser, addPortalAuditLog } from './db';
import { LicenseItem, ContractItem, AttachmentFile, LicenseStatus, ContractStatus } from '../src/types';

const projectRoot = path.resolve(__dirname, '..');
const dbStorePath = path.join(projectRoot, 'backend', 'database_store.json');
const uploadDir = path.join(projectRoot, 'backend', 'uploads', 'contracts');

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
  } catch (e) {
    console.error('Failed to create contracts upload directory:', e);
  }
}

// Helper to read and write database_store.json atomically
function readStore(): any {
  try {
    if (fs.existsSync(dbStorePath)) {
      const raw = fs.readFileSync(dbStorePath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading database_store.json:', err);
  }
  return {};
}

function writeStore(store: any): void {
  try {
    const tempPath = `${dbStorePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), 'utf-8');
    fs.renameSync(tempPath, dbStorePath);
  } catch (err) {
    console.error('Error writing database_store.json:', err);
  }
}

// Compute dynamic status based on dates
export function computeLicenseStatus(startDate: string, endDate: string, currentStatus?: LicenseStatus): LicenseStatus {
  if (currentStatus === 'suspended') return 'suspended';
  if (currentStatus === 'renewed') return 'renewed';
  const now = new Date();
  const end = new Date(endDate);
  if (isNaN(end.getTime())) return currentStatus || 'active';

  const diffTime = end.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'expired';
  if (diffDays <= 30) return 'expiring_soon';
  return 'active';
}

export function computeContractStatus(startDate: string, endDate: string, currentStatus?: ContractStatus): ContractStatus {
  if (currentStatus === 'terminated') return 'terminated';
  if (currentStatus === 'in_renewal') return 'in_renewal';
  const now = new Date();
  const end = new Date(endDate);
  if (isNaN(end.getTime())) return currentStatus || 'active';

  const diffTime = end.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'expired';
  if (diffDays <= 45) return 'expiring_soon';
  return 'active';
}

// Helper to authenticate request and get effective RBAC policy
async function authenticateRequest(req: Request): Promise<{
  authenticated: boolean;
  user?: UserSessionPayload;
  policy?: any;
  error?: string;
  statusCode?: number;
}> {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return { authenticated: false, error: 'Authentication token required', statusCode: 401 };
  }

  const payload = verifyToken(token);
  if (!payload) {
    return { authenticated: false, error: 'Invalid or expired authentication token', statusCode: 401 };
  }

  const userRecord = (await findUserById(payload.userId)) || (await findUserByUsername(payload.username));
  if (userRecord && userRecord.status === 'disabled') {
    return { authenticated: false, error: 'Account disabled', statusCode: 403 };
  }

  const effectivePolicy = await getEffectivePolicyForUser(userRecord || payload);
  return { authenticated: true, user: payload, policy: effectivePolicy };
}

// Initialize seed sample data if empty
function ensureInitialSeedData(): void {
  try {
    const store = readStore();
    let modified = false;

    if (!Array.isArray(store.licenses) || store.licenses.length === 0) {
      store.licenses = [
        {
          id: 'lic-101-cisco-dna',
          title: 'Cisco DNA Advantage 3-Year Subscription',
          licenseKey: 'DNA-ADV-3Y-C9300-88A9F',
          deviceType: 'switch',
          vendor: 'Cisco Systems',
          connectedDeviceId: 'dev-1793169230513',
          connectedDeviceName: 'ASH-Sul-S-CAM-2',
          ownerName: 'مهندس فدایی',
          ownerEmail: 'd.fadaei@corp.internal',
          department: 'واحد زیرساخت شبکه و امنیت',
          startDate: '2024-01-15',
          endDate: '2027-01-15',
          status: 'active',
          cost: 185000000,
          currency: 'IRR',
          paymentMethod: 'سالانه (۳ ساله شرکتی)',
          notifyEmails: ['d.fadaei@corp.internal', 'netops@corp.internal'],
          alertDays: [60, 30, 15, 7, 0],
          attachments: [],
          notes: 'لایسنس فعال نرم‌افزاری سوئیچ سیسکو کاتالیست شامل مانیتورینگ تله‌متری و لایه ۳ کامل.',
          createdAt: '2024-01-15T08:00:00Z',
          updatedAt: '2026-11-05T08:00:00Z',
        },
        {
          id: 'lic-102-mikrotik-chr',
          title: 'MikroTik RouterOS CHR P10 Perpetual',
          licenseKey: 'MTIK-CHR-P10-99342-FF71',
          deviceType: 'router',
          vendor: 'MikroTik',
          ownerName: 'مهندس مسعود شهبازی',
          ownerEmail: 'shahbazimasoud@gmail.com',
          department: 'دیتاسنتر مرکزی',
          startDate: '2025-05-10',
          endDate: '2026-12-01',
          status: 'expiring_soon',
          cost: 45000000,
          currency: 'IRR',
          paymentMethod: 'یکبار خرید مادام‌العمر (تمدید پشتیبانی سالانه)',
          notifyEmails: ['shahbazimasoud@gmail.com', 'admin@corp.internal'],
          alertDays: [30, 20, 10, 5, 0],
          attachments: [],
          notes: 'لایسنس کلود هاستد روتر میکروتیک سرعت ۱۰ گیگابیت بر ثانیه.',
          createdAt: '2025-05-10T10:30:00Z',
          updatedAt: '2026-11-05T08:00:00Z',
        }
      ];
      modified = true;
    }

    if (!Array.isArray(store.contracts) || store.contracts.length === 0) {
      store.contracts = [
        {
          id: 'cnt-201-hardware-support',
          contractNumber: 'CTR-2025-NET-084',
          title: 'قرارداد پشتیبانی و گارانتی سخت‌افزاری سوئیچ‌ها و روترهای دیتاسنتر',
          vendorName: 'شرکت فناوری ارتباطات پیشرو داده',
          vendorContact: 'مهندس کریمی - ۰۲۱۸۸۹۹۰۰۱۱ / support@pishro-data.ir',
          contractType: 'sla_support',
          ownerName: 'مدیر فناوری اطلاعات',
          ownerEmail: 'it-director@corp.internal',
          department: 'مدیریت فناوری اطلاعات',
          startDate: '2025-01-01',
          endDate: '2026-01-01',
          status: 'expired',
          totalCost: 480000000,
          currency: 'IRR',
          paymentTerms: 'پرداخت فصلی (۴ قسط مساوی)',
          notifyEmails: ['it-director@corp.internal', 'shahbazimasoud@gmail.com'],
          alertDays: [45, 30, 15, 5, 0],
          attachments: [],
          notes: 'پوشش تعویض قطعه در کمتر از ۴ ساعت (SLA 4h On-site Spare Replacement).',
          createdAt: '2025-01-01T09:00:00Z',
          updatedAt: '2026-11-05T08:00:00Z',
        },
        {
          id: 'cnt-202-isp-bandwidth',
          contractNumber: 'ISP-FIBER-1404-92',
          title: 'قرارداد سرویس پهنای باند اختصاصی فیبر نوری ۱ گیگابیت متقارن',
          vendorName: 'شرکت ارتباطات زیرساخت و رسپینا',
          vendorContact: 'بخش امور مشترکین سازمانی - ۱۵۲۴',
          contractType: 'internet_isp',
          ownerName: 'تیم زیرساخت شبکه',
          ownerEmail: 'noc@corp.internal',
          department: 'عملیات شبکه NOC',
          startDate: '2026-03-01',
          endDate: '2027-03-01',
          status: 'active',
          totalCost: 1200000000,
          currency: 'IRR',
          paymentTerms: 'صورت‌حساب ماهانه',
          notifyEmails: ['noc@corp.internal', 'financial@corp.internal'],
          alertDays: [60, 30, 15, 0],
          attachments: [],
          notes: 'لینک فیبر نوری اختصاصی همراه با بلوک IP Valid /28 و توافق‌نامه سطح خدمات ۹۹.۹٪.',
          createdAt: '2026-03-01T12:00:00Z',
          updatedAt: '2026-11-05T08:00:00Z',
        }
      ];
      modified = true;
    }

    if (modified) {
      writeStore(store);
    }
  } catch (err) {
    console.error('Error ensuring initial seed data for licenses and contracts:', err);
  }
}

ensureInitialSeedData();

export const licenseContractRouter = Router();

// ==============================================================================
// 1. Licenses Endpoints
// ==============================================================================

// GET /api/licenses
licenseContractRouter.get('/licenses', async (req: Request, res: Response) => {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }

  // RBAC Permission Check
  const isSuperAdmin = auth.user?.role?.toLowerCase().includes('admin') || auth.policy?.id === 'policy-super-admin';
  if (!isSuperAdmin && auth.policy?.canViewLicenses === false) {
    return res.status(403).json({ success: false, error: 'Access denied: You do not have permission to view licenses (canViewLicenses).' });
  }

  const store = readStore();
  let licenses: LicenseItem[] = Array.isArray(store.licenses) ? store.licenses : [];

  // Recalculate dynamic statuses
  licenses = licenses.map((lic) => ({
    ...lic,
    status: computeLicenseStatus(lic.startDate, lic.endDate, lic.status),
  }));

  res.json({
    success: true,
    licenses,
    total: licenses.length,
    summary: {
      total: licenses.length,
      active: licenses.filter((l) => l.status === 'active').length,
      expiring_soon: licenses.filter((l) => l.status === 'expiring_soon').length,
      expired: licenses.filter((l) => l.status === 'expired').length,
      renewed: licenses.filter((l) => l.status === 'renewed').length,
    },
  });
});

// POST /api/licenses
licenseContractRouter.post('/licenses', async (req: Request, res: Response) => {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }

  const isSuperAdmin = auth.user?.role?.toLowerCase().includes('admin') || auth.policy?.id === 'policy-super-admin';
  if (!isSuperAdmin && auth.policy?.canManageLicenses === false) {
    return res.status(403).json({ success: false, error: 'Access denied: You do not have permission to create licenses (canManageLicenses).' });
  }

  const body = req.body;
  if (!body.title || !body.startDate || !body.endDate || !body.vendor) {
    return res.status(400).json({ success: false, error: 'Title, vendor, start date, and end date are required fields.' });
  }

  const store = readStore();
  if (!Array.isArray(store.licenses)) store.licenses = [];

  const newId = `lic-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  const status = computeLicenseStatus(body.startDate, body.endDate, body.status);

  const newLicense: LicenseItem = {
    id: newId,
    title: String(body.title).trim(),
    licenseKey: body.licenseKey ? String(body.licenseKey).trim() : '',
    deviceType: body.deviceType || 'switch',
    vendor: String(body.vendor).trim(),
    connectedDeviceId: body.connectedDeviceId || '',
    connectedDeviceName: body.connectedDeviceName || '',
    connectedServerId: body.connectedServerId || '',
    connectedServerName: body.connectedServerName || '',
    ownerName: String(body.ownerName || auth.user?.fullName || auth.user?.username || 'Admin').trim(),
    ownerEmail: body.ownerEmail ? String(body.ownerEmail).trim() : '',
    department: body.department ? String(body.department).trim() : 'IT Infrastructure',
    startDate: body.startDate,
    endDate: body.endDate,
    status,
    cost: typeof body.cost === 'number' ? body.cost : Number(body.cost) || 0,
    currency: body.currency || 'IRR',
    paymentMethod: body.paymentMethod || 'Annual',
    notifyEmails: Array.isArray(body.notifyEmails) ? body.notifyEmails : [],
    alertDays: Array.isArray(body.alertDays) && body.alertDays.length > 0 ? body.alertDays : [30, 15, 7, 0],
    attachments: Array.isArray(body.attachments) ? body.attachments : [],
    notes: body.notes ? String(body.notes).trim() : '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  store.licenses.unshift(newLicense);
  writeStore(store);

  // Mandatory Zero-Day Audit Logging (Rule 16)
  await addPortalAuditLog({
    category: 'licenses',
    action: 'LICENSE_CREATE',
    title: `ایجاد لایسنس جدید: ${newLicense.title}`,
    title_en: `Created new license: ${newLicense.title}`,
    user_name: auth.user?.username,
    user_role: auth.user?.role,
    client_ip: req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1',
    target_type: 'license',
    target_id: newLicense.id,
    target_name: newLicense.title,
    severity: 'info',
    status: 'success',
    details: `ثبت لایسنس تجهیز ${newLicense.vendor} با سررسید ${newLicense.endDate} و مالک ${newLicense.ownerName}`,
    details_en: `Registered ${newLicense.vendor} license expiring ${newLicense.endDate} assigned to ${newLicense.ownerName}`,
  });

  res.status(201).json({ success: true, license: newLicense });
});

// PUT /api/licenses/:id
licenseContractRouter.put('/licenses/:id', async (req: Request, res: Response) => {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }

  const isSuperAdmin = auth.user?.role?.toLowerCase().includes('admin') || auth.policy?.id === 'policy-super-admin';
  if (!isSuperAdmin && auth.policy?.canManageLicenses === false) {
    return res.status(403).json({ success: false, error: 'Access denied: You do not have permission to update licenses (canManageLicenses).' });
  }

  const { id } = req.params;
  const body = req.body;
  const store = readStore();
  const licenses: LicenseItem[] = Array.isArray(store.licenses) ? store.licenses : [];

  const index = licenses.findIndex((l) => l.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: `License with ID ${id} not found.` });
  }

  const existing = licenses[index];
  const startDate = body.startDate || existing.startDate;
  const endDate = body.endDate || existing.endDate;
  const status = body.status ? body.status : computeLicenseStatus(startDate, endDate, existing.status);

  const updated: LicenseItem = {
    ...existing,
    ...body,
    id: existing.id,
    startDate,
    endDate,
    status,
    updatedAt: new Date().toISOString(),
  };

  licenses[index] = updated;
  store.licenses = licenses;
  writeStore(store);

  // Mandatory Audit Logging (Rule 16)
  await addPortalAuditLog({
    category: 'licenses',
    action: 'LICENSE_UPDATE',
    title: `ویرایش لایسنس: ${updated.title}`,
    title_en: `Updated license: ${updated.title}`,
    user_name: auth.user?.username,
    user_role: auth.user?.role,
    client_ip: req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1',
    target_type: 'license',
    target_id: updated.id,
    target_name: updated.title,
    severity: 'info',
    status: 'success',
    details: `بروزرسانی مشخصات و تاریخ سررسید لایسنس ${updated.title}`,
    details_en: `Updated license parameters and expiry date for ${updated.title}`,
  });

  res.json({ success: true, license: updated });
});

// DELETE /api/licenses/:id
licenseContractRouter.delete('/licenses/:id', async (req: Request, res: Response) => {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }

  const isSuperAdmin = auth.user?.role?.toLowerCase().includes('admin') || auth.policy?.id === 'policy-super-admin';
  if (!isSuperAdmin && auth.policy?.canDeleteLicenses === false && auth.policy?.canManageLicenses === false) {
    return res.status(403).json({ success: false, error: 'Access denied: You do not have permission to delete licenses.' });
  }

  const { id } = req.params;
  const store = readStore();
  const licenses: LicenseItem[] = Array.isArray(store.licenses) ? store.licenses : [];

  const target = licenses.find((l) => l.id === id);
  if (!target) {
    return res.status(404).json({ success: false, error: `License with ID ${id} not found.` });
  }

  store.licenses = licenses.filter((l) => l.id !== id);
  writeStore(store);

  // Mandatory Audit Logging (Rule 16)
  await addPortalAuditLog({
    category: 'licenses',
    action: 'LICENSE_DELETE',
    title: `حذف لایسنس: ${target.title}`,
    title_en: `Deleted license: ${target.title}`,
    user_name: auth.user?.username,
    user_role: auth.user?.role,
    client_ip: req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1',
    target_type: 'license',
    target_id: target.id,
    target_name: target.title,
    severity: 'warn',
    status: 'success',
    details: `حذف قطعی لایسنس ${target.title} متعلق به تجهیز ${target.vendor}`,
    details_en: `Permanently removed license ${target.title} for ${target.vendor}`,
  });

  res.json({ success: true, message: `License ${target.title} deleted successfully.` });
});

// ==============================================================================
// 2. Contracts Endpoints
// ==============================================================================

// GET /api/contracts
licenseContractRouter.get('/contracts', async (req: Request, res: Response) => {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }

  const isSuperAdmin = auth.user?.role?.toLowerCase().includes('admin') || auth.policy?.id === 'policy-super-admin';
  if (!isSuperAdmin && auth.policy?.canViewContracts === false) {
    return res.status(403).json({ success: false, error: 'Access denied: You do not have permission to view contracts (canViewContracts).' });
  }

  const store = readStore();
  let contracts: ContractItem[] = Array.isArray(store.contracts) ? store.contracts : [];

  contracts = contracts.map((cnt) => ({
    ...cnt,
    status: computeContractStatus(cnt.startDate, cnt.endDate, cnt.status),
  }));

  res.json({
    success: true,
    contracts,
    total: contracts.length,
    summary: {
      total: contracts.length,
      active: contracts.filter((c) => c.status === 'active').length,
      expiring_soon: contracts.filter((c) => c.status === 'expiring_soon').length,
      expired: contracts.filter((c) => c.status === 'expired').length,
      in_renewal: contracts.filter((c) => c.status === 'in_renewal').length,
    },
  });
});

// POST /api/contracts
licenseContractRouter.post('/contracts', async (req: Request, res: Response) => {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }

  const isSuperAdmin = auth.user?.role?.toLowerCase().includes('admin') || auth.policy?.id === 'policy-super-admin';
  if (!isSuperAdmin && auth.policy?.canManageContracts === false) {
    return res.status(403).json({ success: false, error: 'Access denied: You do not have permission to create contracts (canManageContracts).' });
  }

  const body = req.body;
  if (!body.title || !body.contractNumber || !body.vendorName || !body.startDate || !body.endDate) {
    return res.status(400).json({ success: false, error: 'Title, contract number, vendor name, start date, and end date are required.' });
  }

  const store = readStore();
  if (!Array.isArray(store.contracts)) store.contracts = [];

  const newId = `cnt-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  const status = computeContractStatus(body.startDate, body.endDate, body.status);

  const newContract: ContractItem = {
    id: newId,
    contractNumber: String(body.contractNumber).trim(),
    title: String(body.title).trim(),
    vendorName: String(body.vendorName).trim(),
    vendorContact: body.vendorContact ? String(body.vendorContact).trim() : '',
    contractType: body.contractType || 'sla_support',
    ownerName: String(body.ownerName || auth.user?.fullName || auth.user?.username || 'Admin').trim(),
    ownerEmail: body.ownerEmail ? String(body.ownerEmail).trim() : '',
    department: body.department ? String(body.department).trim() : 'IT Management',
    startDate: body.startDate,
    endDate: body.endDate,
    status,
    totalCost: typeof body.totalCost === 'number' ? body.totalCost : Number(body.totalCost) || 0,
    currency: body.currency || 'IRR',
    paymentTerms: body.paymentTerms || 'Monthly',
    notifyEmails: Array.isArray(body.notifyEmails) ? body.notifyEmails : [],
    alertDays: Array.isArray(body.alertDays) && body.alertDays.length > 0 ? body.alertDays : [45, 30, 15, 0],
    attachments: Array.isArray(body.attachments) ? body.attachments : [],
    notes: body.notes ? String(body.notes).trim() : '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  store.contracts.unshift(newContract);
  writeStore(store);

  // Mandatory Audit Logging (Rule 16)
  await addPortalAuditLog({
    category: 'contracts',
    action: 'CONTRACT_CREATE',
    title: `ثبت قرارداد جدید: ${newContract.title}`,
    title_en: `Created new contract: ${newContract.title}`,
    user_name: auth.user?.username,
    user_role: auth.user?.role,
    client_ip: req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1',
    target_type: 'contract',
    target_id: newContract.id,
    target_name: newContract.title,
    severity: 'info',
    status: 'success',
    details: `ثبت قرارداد شماره ${newContract.contractNumber} با پیمانکار ${newContract.vendorName}`,
    details_en: `Registered contract #${newContract.contractNumber} with vendor ${newContract.vendorName}`,
  });

  res.status(201).json({ success: true, contract: newContract });
});

// PUT /api/contracts/:id
licenseContractRouter.put('/contracts/:id', async (req: Request, res: Response) => {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }

  const isSuperAdmin = auth.user?.role?.toLowerCase().includes('admin') || auth.policy?.id === 'policy-super-admin';
  if (!isSuperAdmin && auth.policy?.canManageContracts === false) {
    return res.status(403).json({ success: false, error: 'Access denied: You do not have permission to update contracts.' });
  }

  const { id } = req.params;
  const body = req.body;
  const store = readStore();
  const contracts: ContractItem[] = Array.isArray(store.contracts) ? store.contracts : [];

  const index = contracts.findIndex((c) => c.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: `Contract with ID ${id} not found.` });
  }

  const existing = contracts[index];
  const startDate = body.startDate || existing.startDate;
  const endDate = body.endDate || existing.endDate;
  const status = body.status ? body.status : computeContractStatus(startDate, endDate, existing.status);

  const updated: ContractItem = {
    ...existing,
    ...body,
    id: existing.id,
    startDate,
    endDate,
    status,
    updatedAt: new Date().toISOString(),
  };

  contracts[index] = updated;
  store.contracts = contracts;
  writeStore(store);

  // Mandatory Audit Logging (Rule 16)
  await addPortalAuditLog({
    category: 'contracts',
    action: 'CONTRACT_UPDATE',
    title: `ویرایش قرارداد: ${updated.title}`,
    title_en: `Updated contract: ${updated.title}`,
    user_name: auth.user?.username,
    user_role: auth.user?.role,
    client_ip: req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1',
    target_type: 'contract',
    target_id: updated.id,
    target_name: updated.title,
    severity: 'info',
    status: 'success',
    details: `بروزرسانی مشخصات قرارداد شماره ${updated.contractNumber}`,
    details_en: `Updated terms and parameters for contract #${updated.contractNumber}`,
  });

  res.json({ success: true, contract: updated });
});

// DELETE /api/contracts/:id
licenseContractRouter.delete('/contracts/:id', async (req: Request, res: Response) => {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }

  const isSuperAdmin = auth.user?.role?.toLowerCase().includes('admin') || auth.policy?.id === 'policy-super-admin';
  if (!isSuperAdmin && auth.policy?.canDeleteContracts === false && auth.policy?.canManageContracts === false) {
    return res.status(403).json({ success: false, error: 'Access denied: You do not have permission to delete contracts.' });
  }

  const { id } = req.params;
  const store = readStore();
  const contracts: ContractItem[] = Array.isArray(store.contracts) ? store.contracts : [];

  const target = contracts.find((c) => c.id === id);
  if (!target) {
    return res.status(404).json({ success: false, error: `Contract with ID ${id} not found.` });
  }

  store.contracts = contracts.filter((c) => c.id !== id);
  writeStore(store);

  // Mandatory Audit Logging (Rule 16)
  await addPortalAuditLog({
    category: 'contracts',
    action: 'CONTRACT_DELETE',
    title: `حذف قرارداد: ${target.title}`,
    title_en: `Deleted contract: ${target.title}`,
    user_name: auth.user?.username,
    user_role: auth.user?.role,
    client_ip: req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1',
    target_type: 'contract',
    target_id: target.id,
    target_name: target.title,
    severity: 'warn',
    status: 'success',
    details: `حذف قطعی قرارداد ${target.title} (شماره: ${target.contractNumber})`,
    details_en: `Permanently removed contract ${target.title} (#${target.contractNumber})`,
  });

  res.json({ success: true, message: `Contract ${target.title} deleted successfully.` });
});

// ==============================================================================
// 3. File Attachments: Secure Upload & Download
// ==============================================================================

// POST /api/licenses-contracts/upload
licenseContractRouter.post('/licenses-contracts/upload', async (req: Request, res: Response) => {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return res.status(auth.statusCode || 401).json({ success: false, error: auth.error });
  }

  try {
    const { fileName, fileType, dataBase64 } = req.body;
    if (!fileName || !dataBase64) {
      return res.status(400).json({ success: false, error: 'File name and base64 file data are required.' });
    }

    const fileId = `att-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const safeName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const diskFileName = `${fileId}_${safeName}`;
    const targetFilePath = path.join(uploadDir, diskFileName);

    // Strip base64 data URL prefix if present
    const base64Data = dataBase64.replace(/^data:([A-Za-z-+/]+);base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    fs.writeFileSync(targetFilePath, buffer);

    const attachment: AttachmentFile = {
      id: fileId,
      fileName,
      fileSize: buffer.length,
      fileType: fileType || 'application/octet-stream',
      uploadDate: new Date().toISOString(),
      storagePath: diskFileName,
      downloadUrl: `/api/licenses-contracts/download/${fileId}`,
    };

    // Mandatory Audit Logging (Rule 16)
    await addPortalAuditLog({
      category: 'attachments',
      action: 'ATTACHMENT_UPLOAD',
      title: `آپلود پیوست: ${fileName}`,
      title_en: `Uploaded attachment: ${fileName}`,
      user_name: auth.user?.username,
      user_role: auth.user?.role,
      client_ip: req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1',
      target_type: 'attachment',
      target_id: fileId,
      target_name: fileName,
      severity: 'info',
      status: 'success',
      details: `آپلود موفق فایل پیوست ${fileName} با حجم ${(buffer.length / 1024).toFixed(1)} کیلوبایت`,
      details_en: `Successfully uploaded attachment ${fileName} (${(buffer.length / 1024).toFixed(1)} KB)`,
    });

    res.status(201).json({ success: true, attachment });
  } catch (err: any) {
    console.error('Error uploading contract/license attachment:', err);
    res.status(500).json({ success: false, error: err.message || 'File upload failed.' });
  }
});

// GET /api/licenses-contracts/download/:id
licenseContractRouter.get('/licenses-contracts/download/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    // Find matching file in uploadDir starting with `${id}_`
    if (!fs.existsSync(uploadDir)) {
      return res.status(404).json({ success: false, error: 'Upload directory not found.' });
    }

    const files = fs.readdirSync(uploadDir);
    const matched = files.find((f) => f.startsWith(`${id}_`));

    if (!matched) {
      return res.status(404).json({ success: false, error: 'Attachment file not found on server.' });
    }

    const filePath = path.join(uploadDir, matched);
    const originalName = matched.substring(`${id}_`.length);

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(originalName)}"`);
    res.setHeader('Content-Type', 'application/octet-stream');

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err: any) {
    console.error('Error downloading attachment:', err);
    res.status(500).json({ success: false, error: 'Failed to download attachment file.' });
  }
});
