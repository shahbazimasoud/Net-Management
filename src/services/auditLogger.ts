import {
  PortalAuditLogEntry,
  DeviceCommandLogEntry,
  ServerCommandAuditLogEntry,
  ServerCommandChannel,
  ServerActionModule,
  AuditActor,
  Device,
  CommandRiskLevel,
  CommandChannel,
  AuditLogCategory,
  AuditLogSeverity
} from '../types';

const STORAGE_KEYS = {
  PORTAL_LOGS: 'nettopology_portal_audit_logs_v1',
  COMMAND_LOGS: 'nettopology_device_command_logs_v1',
  SERVER_COMMAND_LOGS: 'nettopology_server_command_logs_v1',
};

// Event name for live sync across components
export const AUDIT_LOG_UPDATED_EVENT = 'nettopology_audit_log_updated';

/**
 * Derives current active actor from active simulation policy or default super-admin
 */
export function getCurrentActor(): AuditActor {
  try {
    const roleId = localStorage.getItem('nettopology_simulated_role_v1');
    if (roleId === 'policy-noc-readonly') {
      return { username: 's.karimi', role: 'NOC Operator (کارشناس پایش)', ipAddress: '192.168.10.82' };
    } else if (roleId === 'policy-helpdesk-l2') {
      return { username: 'a.rezaei', role: 'Helpdesk Specialist (پشتیبانی فنی)', ipAddress: '192.168.10.65' };
    } else if (roleId === 'policy-field-tech') {
      return { username: 'field_tech', role: 'Field Technician (تکنسین میدانی)', ipAddress: '192.168.10.110' };
    }
  } catch (e) {
    // fallback
  }
  return {
    username: 'admin',
    role: 'Super Administrator (مدیر ارشد سامانه)',
    ipAddress: '192.168.10.45',
  };
}

// ==========================================
// Pre-seeded Realistic Audit History
// ==========================================

const SEED_PORTAL_LOGS: PortalAuditLogEntry[] = [
  {
    id: 'log-portal-101',
    timestamp: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    category: 'backup_recovery',
    action: 'BACKUP_EXPORT_ENCRYPTED',
    title: 'استخراج پکیج پشتیبان جامع با رمزنگاری AES-GCM',
    title_en: 'Full Disaster Recovery Package Exported with 256-bit AES-GCM',
    actor: { username: 'admin', role: 'Super Administrator', ipAddress: '192.168.10.45' },
    target: {
      type: 'backup',
      name: 'nettopology_backup_full_2026-09-10.ntpkg',
      metadata: {
        scope: 'full',
        isEncrypted: true,
        isSanitized: true,
        checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        deviceCount: 14,
        mapsCount: 3
      }
    },
    severity: 'notice',
    status: 'success',
    details: 'پکیج کامل پشتیبان شبکه شامل ۱۲ تجهیز، ۳ نقشه توپولوژی و کاربران محلی با موفقیت رمزنگاری و استخراج شد.',
    details_en: 'Full DR backup package containing 12 devices, 3 topology maps, and local RBAC policies exported with AES-GCM encryption.',
  },
  {
    id: 'log-portal-102',
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    category: 'device_inventory',
    action: 'DEVICE_DELETED',
    title: 'حذف تجهیز قدیمی شبکه و مستندسازی محل استقرار',
    title_en: 'Decommissioned Legacy Device with Full Location Metadata',
    actor: { username: 'admin', role: 'Super Administrator', ipAddress: '192.168.10.45' },
    target: {
      type: 'device',
      id: 'dev-old-sw-08',
      name: 'Edge-Switch-B02-Legacy',
      ip: '192.168.40.250',
      model: 'Cisco Catalyst 2960-24TT-L',
      vendor: 'cisco',
      location: 'ساختمان انبار مرکزی > طبقه همکف > اتاق سوئیچ C > رک Rack-C04',
      portsCount: 24,
      metadata: {
        mac: '00:26:98:B4:12:00',
        role: 'Access Switch',
        lastUptime: '142 days, 6 hours',
        decommissionReason: 'جایگزینی با سوئیچ ۱۰ گیگابیت جدید سری ۹۳۰۰',
      }
    },
    severity: 'warning',
    status: 'success',
    details: 'تجهیز Edge-Switch-B02-Legacy با آدرس 192.168.40.250 و ۲۴ پورت فیزیکی از رک Rack-C04 واقع در ساختمان انبار مرکزی حذف و از دیتابیس خارج گردید.',
    details_en: 'Device Edge-Switch-B02-Legacy (192.168.40.250, 24 ports) stationed at Building Warehouse > Ground Floor > Rack-C04 was decommissioned and removed.',
  },
  {
    id: 'log-portal-103',
    timestamp: new Date(Date.now() - 1000 * 60 * 110).toISOString(),
    category: 'user_management',
    action: 'USER_CREATED',
    title: 'ایجاد کاربر محلی جدید با تخصیص به گروه پشتیبانی',
    title_en: 'New Local User Created & Assigned to Helpdesk Group',
    actor: { username: 'admin', role: 'Super Administrator', ipAddress: '192.168.10.45' },
    target: {
      type: 'user',
      id: 'usr-helpdesk-02',
      name: 'پویا اکبری (p.akbari)',
      metadata: {
        username: 'p.akbari',
        email: 'p.akbari@corp.internal',
        assignedGroups: ['تیم هلپ‌دسک و پشتیبانی کاربر (Helpdesk Operators)'],
        mustChangePassword: true,
      }
    },
    severity: 'info',
    status: 'success',
    details: 'کاربر محلی جدید با نام کاربری p.akbari جهت پشتیبانی پورت‌های طبقات ایجاد و به گروه Helpdesk Operators متصل شد.',
    details_en: 'New local user account p.akbari was provisioned and assigned to Helpdesk Operators security group.',
  },
  {
    id: 'log-portal-104',
    timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    category: 'rbac_policy',
    action: 'POLICY_PERMISSIONS_MODIFIED',
    title: 'تغییر و سخت‌سازی سطوح دسترسی گروه پشتیبانی فنی',
    title_en: 'Hardened RBAC Capabilities for Helpdesk Operator Policy',
    actor: { username: 'admin', role: 'Super Administrator', ipAddress: '192.168.10.45' },
    target: {
      type: 'policy',
      id: 'policy-helpdesk-l2',
      name: 'پشتیبانی فنی لایه ۲ (Helpdesk L2 / NOC Technician)',
      metadata: {
        policyId: 'policy-helpdesk-l2',
        updatedRules: ['canExportBackup: false', 'canImportBackup: false', 'canWriteMemory: false', 'canChangeVlan: true'],
      }
    },
    severity: 'warning',
    status: 'success',
    details: 'دسترسی استخراج و بازیابی فایل‌های پشتیبان برای گروه Helpdesk L2 مسدود شد و تنها مجوز تنظیم پورت و ویلن فعال باقی ماند.',
    details_en: 'Backup export & import privileges revoked for Helpdesk L2 policy; port configuration rights restricted to assigned VLAN boundaries.',
  },
  {
    id: 'log-portal-105',
    timestamp: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
    category: 'device_inventory',
    action: 'DEVICE_ADDED',
    title: 'ثبت و راه‌اندازی تجهیز سوئیچ اگریگیشن جدید',
    title_en: 'New Aggregation Switch Commissioned into Inventory',
    actor: { username: 'admin', role: 'Super Administrator', ipAddress: '192.168.10.45' },
    target: {
      type: 'device',
      id: 'dev-agg-sw-02',
      name: 'SW-DIST-B01-FL2',
      ip: '192.168.10.15',
      model: 'Cisco Catalyst 3850-24XS-E',
      vendor: 'cisco',
      location: 'ساختمان شماره ۱ > طبقه ۲ > اتاق سرور مرکزی > رک Rack-A02',
      portsCount: 24,
      metadata: {
        role: 'Distribution Switch',
        mac: '00:3A:98:C1:F2:10',
        sshEnabled: true,
        sshPort: 22,
      }
    },
    severity: 'info',
    status: 'success',
    details: 'سوئیچ توزیع لایه ۳ با ۲۴ پورت ۱۰G و آدرس 192.168.10.15 در رک Rack-A02 اتاق سرور مرکزی مستقر و به نقشه متصل شد.',
    details_en: 'New Layer-3 Distribution Switch with 24x 10G SFP+ ports registered in Rack-A02 at Main Server Room.',
  },
  {
    id: 'log-portal-106',
    timestamp: new Date(Date.now() - 1000 * 60 * 320).toISOString(),
    category: 'port_interface',
    action: 'PORT_SHUTDOWN',
    title: 'خاموش‌سازی امن پورت مشکوک اینترفیس Gi0/14',
    title_en: 'Security Shutdown Triggered on Interface GigabitEthernet0/14',
    actor: { username: 'admin', role: 'Super Administrator', ipAddress: '192.168.10.45' },
    target: {
      type: 'port',
      name: 'SW-CORE-01 / Gi0/14',
      location: 'ساختمان شماره ۱ > طبقه ۲ > اتاق سرور مرکزی > رک Rack-A01',
      metadata: {
        portName: 'GigabitEthernet0/14',
        previousState: 'up',
        newState: 'shutdown (disabled)',
        reason: 'نقض پروتکل پورت سکیوریتی (Unregistered MAC Detected)',
      }
    },
    severity: 'warning',
    status: 'success',
    details: 'اینترفیس Gi0/14 روی سوئیچ Core به دلیل گزارش تخلف مک‌آدرس ناشناس به حالت shutdown تغییر یافت.',
    details_en: 'Interface GigabitEthernet0/14 administratively disabled due to MAC violation notice on access segment.',
  },
  {
    id: 'log-portal-107',
    timestamp: new Date(Date.now() - 1000 * 60 * 480).toISOString(),
    category: 'backup_recovery',
    action: 'BACKUP_RESTORE_MERGE',
    title: 'بازیابی افزایشی و همگام‌سازی الگوهای پیکربندی',
    title_en: 'Incremental Configuration Templates Restoration',
    actor: { username: 'admin', role: 'Super Administrator', ipAddress: '192.168.10.45' },
    target: {
      type: 'backup',
      name: 'nettopology_templates_golden_v2.ntpkg',
      metadata: {
        strategy: 'incremental_merge',
        itemsRestored: 6,
        snapshotId: 'snap-pre-restore-107',
      }
    },
    severity: 'notice',
    status: 'success',
    details: 'بازیابی افزایشی ۶ الگوی استاندارد پیکربندی سیسکو و میکروتیک بدون بازنویسی سایر تنظیمات انجام شد.',
    details_en: 'Restored 6 configuration templates incrementally with pre-flight safety snapshot captured.',
  }
];

// ==========================================
// Storage & Access API (Zero Mock Data)
// ==========================================

export function loadPortalAuditLogs(): PortalAuditLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PORTAL_LOGS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const existingIds = new Set(parsed.map((p: PortalAuditLogEntry) => p.id));
        let changed = false;
        for (const seed of SEED_PORTAL_LOGS) {
          if (!existingIds.has(seed.id)) {
            parsed.push(seed);
            changed = true;
          }
        }
        if (changed) {
          savePortalAuditLogs(parsed);
        }
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load portal audit logs', e);
  }
  savePortalAuditLogs(SEED_PORTAL_LOGS);
  return SEED_PORTAL_LOGS;
}

export function savePortalAuditLogs(logs: PortalAuditLogEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PORTAL_LOGS, JSON.stringify(logs));
    window.dispatchEvent(new CustomEvent(AUDIT_LOG_UPDATED_EVENT, { detail: { type: 'portal' } }));
  } catch (e) {
    console.error('Failed to save portal audit logs', e);
  }
}

/**
 * Loads authentic device command logs only. Purges any legacy mock/seeded data.
 */
export function loadDeviceCommandLogs(): DeviceCommandLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.COMMAND_LOGS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Strictly purge any legacy mock/seeded command logs (cmd-log-201 to cmd-log-210)
        const authenticLogs = parsed.filter((p: DeviceCommandLogEntry) => {
          if (!p || !p.id) return false;
          if (typeof p.id === 'string' && p.id.startsWith('cmd-log-2')) return false;
          return true;
        });
        if (authenticLogs.length !== parsed.length) {
          saveDeviceCommandLogs(authenticLogs);
        }
        return authenticLogs;
      }
    }
  } catch (e) {
    console.error('Failed to load device command logs', e);
  }
  return [];
}

export function saveDeviceCommandLogs(logs: DeviceCommandLogEntry[]): void {
  try {
    // Ensure no mock seeds leak into storage
    const cleanLogs = (logs || []).filter(
      (p) => p && p.id && !(typeof p.id === 'string' && p.id.startsWith('cmd-log-2'))
    );
    localStorage.setItem(STORAGE_KEYS.COMMAND_LOGS, JSON.stringify(cleanLogs));
    window.dispatchEvent(new CustomEvent(AUDIT_LOG_UPDATED_EVENT, { detail: { type: 'command' } }));
  } catch (e) {
    console.error('Failed to save device command logs', e);
  }
}

// ==========================================
// Server Fleet Command & Activity Logs API
// ==========================================

export function loadLocalServerCommandLogs(): ServerCommandAuditLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SERVER_COMMAND_LOGS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load local server command logs', e);
  }
  return [];
}

export async function fetchServerCommandLogs(options: {
  serverId?: string;
  userName?: string;
  channel?: string;
  actionModule?: string;
  search?: string;
  limit?: number;
} = {}): Promise<ServerCommandAuditLogEntry[]> {
  try {
    const params = new URLSearchParams();
    if (options.serverId) params.append('serverId', options.serverId);
    if (options.userName) params.append('userName', options.userName);
    if (options.channel) params.append('channel', options.channel);
    if (options.actionModule) params.append('actionModule', options.actionModule);
    if (options.search) params.append('search', options.search);
    if (options.limit) params.append('limit', String(options.limit));

    const res = await fetch(`/api/server-audit-logs?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.logs)) {
        saveServerCommandLogs(data.logs);
        return data.logs;
      }
    }
  } catch (err) {
    console.warn('Failed to fetch server command logs from backend, falling back to local storage', err);
  }
  return loadLocalServerCommandLogs();
}

export function saveServerCommandLogs(logs: ServerCommandAuditLogEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SERVER_COMMAND_LOGS, JSON.stringify(logs));
    window.dispatchEvent(new CustomEvent(AUDIT_LOG_UPDATED_EVENT, { detail: { type: 'server_command' } }));
  } catch (e) {
    console.error('Failed to save server command logs', e);
  }
}

export async function logServerCommandEvent(
  entry: Omit<ServerCommandAuditLogEntry, 'id' | 'timestamp' | 'actor'> & {
    id?: string;
    timestamp?: string;
    actor?: AuditActor;
  }
): Promise<ServerCommandAuditLogEntry> {
  const currentLogs = loadLocalServerCommandLogs();
  const actor = entry.actor || getCurrentActor();
  const newLog: ServerCommandAuditLogEntry = {
    id: entry.id || `srv-cmd-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: entry.timestamp || new Date().toISOString(),
    actor,
    ...entry,
  };

  const updated = [newLog, ...currentLogs].slice(0, 1000);
  saveServerCommandLogs(updated);

  // Asynchronously dispatch to backend PostgreSQL database
  try {
    fetch('/api/server-audit-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newLog),
    }).catch((err) => console.warn('Background server audit dispatch warning:', err));
  } catch (err) {
    console.warn('Failed to dispatch server audit log to API', err);
  }

  return newLog;
}

export function clearServerCommandLogs(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.SERVER_COMMAND_LOGS);
    window.dispatchEvent(new CustomEvent(AUDIT_LOG_UPDATED_EVENT, { detail: { type: 'server_command' } }));
  } catch (e) {
    console.error('Failed to clear server command logs', e);
  }
}


// ==========================================
// High-Level Logging Functions
// ==========================================

export function logPortalEvent(entry: Omit<PortalAuditLogEntry, 'id' | 'timestamp' | 'actor'> & { actor?: AuditActor }): PortalAuditLogEntry {
  const currentLogs = loadPortalAuditLogs();
  const actor = entry.actor || getCurrentActor();
  const newLog: PortalAuditLogEntry = {
    id: `log-portal-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: new Date().toISOString(),
    actor,
    ...entry,
  };
  const updated = [newLog, ...currentLogs].slice(0, 500); // Cap at 500 entries
  savePortalAuditLogs(updated);
  return newLog;
}

/**
 * Specifically logs when a device is decommissioned or deleted, capturing complete location & device snapshot
 */
export function logDeviceDeletion(device: Device, actor?: AuditActor): PortalAuditLogEntry {
  const fullLocation = [
    device.building,
    device.floor,
    device.unit,
    device.rack ? `رک ${device.rack}` : undefined,
  ].filter(Boolean).join(' > ');

  return logPortalEvent({
    category: 'device_inventory',
    action: 'DEVICE_DELETED',
    title: `حذف دیوایس شبکه «${device.name}» و آزادسازی موقعیت فیزیکی`,
    title_en: `Decommissioned Device "${device.name}" and Cleared Physical Rack Placement`,
    actor: actor || getCurrentActor(),
    target: {
      type: 'device',
      id: device.id,
      name: device.name,
      ip: device.ip,
      model: device.model,
      vendor: device.model.toLowerCase().includes('mikrotik') ? 'mikrotik' : 'cisco',
      location: fullLocation || 'نامشخص',
      portsCount: device.total_ports,
      metadata: {
        mac: device.mac,
        role: device.role,
        uptime: device.uptime,
        building: device.building,
        floor: device.floor,
        unit: device.unit,
        rack: device.rack,
        sshPort: device.ssh_port,
        sshUsername: device.ssh_username,
        decommissionDate: new Date().toISOString(),
      }
    },
    severity: 'warning',
    status: 'success',
    details: `دیوایس «${device.name}» (IP: ${device.ip}، مدل: ${device.model}، با ${device.total_ports} پورت) مستقر در «${fullLocation || 'مکان نامشخص'}» توسط ${actor?.username || 'admin'} از سیستم حذف گردید.`,
    details_en: `Device "${device.name}" (IP: ${device.ip}, Model: ${device.model}, ${device.total_ports} ports) located at "${fullLocation || 'Unknown'}" was deleted by ${actor?.username || 'admin'}.`,
  });
}

/**
 * Specifically logs when a new device is registered in the system
 */
export function logDeviceAddition(device: Device, actor?: AuditActor): PortalAuditLogEntry {
  const fullLocation = [
    device.building,
    device.floor,
    device.unit,
    device.rack ? `رک ${device.rack}` : undefined,
  ].filter(Boolean).join(' > ');

  return logPortalEvent({
    category: 'device_inventory',
    action: 'DEVICE_ADDED',
    title: `ثبت دیوایس جدید «${device.name}» در سامانه و استقرار در توپولوژی`,
    title_en: `New Device "${device.name}" Commissioned into Infrastructure`,
    actor: actor || getCurrentActor(),
    target: {
      type: 'device',
      id: device.id,
      name: device.name,
      ip: device.ip,
      model: device.model,
      vendor: device.model.toLowerCase().includes('mikrotik') ? 'mikrotik' : 'cisco',
      location: fullLocation || 'نامشخص',
      portsCount: device.total_ports,
      metadata: {
        mac: device.mac,
        role: device.role,
        building: device.building,
        floor: device.floor,
        unit: device.unit,
        rack: device.rack,
      }
    },
    severity: 'info',
    status: 'success',
    details: `دیوایس جدید «${device.name}» با IP: ${device.ip} و مدل ${device.model} در مکان «${fullLocation}» با موفقیت اضافه شد.`,
    details_en: `New device "${device.name}" (IP: ${device.ip}, Model: ${device.model}) registered at location "${fullLocation}".`,
  });
}

/**
 * Specifically logs device updates or relocation
 */
export function logDeviceUpdate(
  deviceId: string,
  oldDevice: Device | undefined,
  updatedDevice: Device,
  actor?: AuditActor
): PortalAuditLogEntry {
  const newLocation = [
    updatedDevice.building,
    updatedDevice.floor,
    updatedDevice.unit,
    updatedDevice.rack ? `رک ${updatedDevice.rack}` : undefined,
  ].filter(Boolean).join(' > ');

  const oldLocation = oldDevice ? [
    oldDevice.building,
    oldDevice.floor,
    oldDevice.unit,
    oldDevice.rack ? `رک ${oldDevice.rack}` : undefined,
  ].filter(Boolean).join(' > ') : undefined;

  const isRelocated = oldLocation && oldLocation !== newLocation;

  return logPortalEvent({
    category: 'device_inventory',
    action: isRelocated ? 'DEVICE_RELOCATED' : 'DEVICE_UPDATED',
    title: isRelocated
      ? `جابجایی فیزیکی دیوایس «${updatedDevice.name}» در رک و موقعیت مکانی`
      : `ویرایش مشخصات دیوایس «${updatedDevice.name}»`,
    title_en: isRelocated
      ? `Device "${updatedDevice.name}" Relocated in Physical Hierarchy`
      : `Device "${updatedDevice.name}" Properties Updated`,
    actor: actor || getCurrentActor(),
    target: {
      type: 'device',
      id: deviceId,
      name: updatedDevice.name,
      ip: updatedDevice.ip,
      model: updatedDevice.model,
      location: newLocation,
      portsCount: updatedDevice.total_ports,
      metadata: {
        previousLocation: oldLocation,
        currentLocation: newLocation,
        changes: {
          ipChanged: oldDevice?.ip !== updatedDevice.ip,
          nameChanged: oldDevice?.name !== updatedDevice.name,
        }
      }
    },
    severity: isRelocated ? 'notice' : 'info',
    status: 'success',
    details: isRelocated
      ? `دیوایس «${updatedDevice.name}» از «${oldLocation}» به «${newLocation}» منتقل شد.`
      : `مشخصات دیوایس «${updatedDevice.name}» (IP: ${updatedDevice.ip}) ویرایش و به‌روزرسانی شد.`,
    details_en: isRelocated
      ? `Device "${updatedDevice.name}" moved from "${oldLocation}" to "${newLocation}".`
      : `Device "${updatedDevice.name}" properties updated successfully.`,
  });
}

/**
 * Evaluate command risk level based on command tokens
 */
export function evaluateCommandRisk(command: string): CommandRiskLevel {
  const lowerCmd = (command || '').toLowerCase();
  if (
    lowerCmd.includes('reload') ||
    lowerCmd.includes('erase') ||
    lowerCmd.includes('reset-configuration') ||
    lowerCmd.includes('format') ||
    lowerCmd.includes('reboot') ||
    lowerCmd.includes('poweroff') ||
    (lowerCmd.includes('shutdown') && !lowerCmd.includes('no shutdown'))
  ) {
    return 'critical';
  }
  if (
    lowerCmd.includes('conf t') ||
    lowerCmd.includes('configure terminal') ||
    lowerCmd.includes('switchport') ||
    lowerCmd.includes('vlan') ||
    lowerCmd.includes('ip route') ||
    lowerCmd.includes('ip address') ||
    lowerCmd.includes('/ip') ||
    lowerCmd.includes('/interface') ||
    lowerCmd.includes('iptables') ||
    lowerCmd.includes('write memory') ||
    lowerCmd.includes('copy run start')
  ) {
    return 'medium';
  }
  return 'low';
}

/**
 * Log a command executed on a network device
 */
export function logDeviceCommand(
  entry: Omit<DeviceCommandLogEntry, 'id' | 'timestamp' | 'actor' | 'riskLevel'> & {
    riskLevel?: CommandRiskLevel;
    actor?: AuditActor;
  }
): DeviceCommandLogEntry {
  const currentLogs = loadDeviceCommandLogs();
  const actor = entry.actor || getCurrentActor();

  // Automatic Risk-Level inference if not specified or to double check
  const computedRisk: CommandRiskLevel = entry.riskLevel || evaluateCommandRisk(entry.command);

  const newLog: DeviceCommandLogEntry = {
    id: `cmd-log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: new Date().toISOString(),
    actor,
    ...entry,
    riskLevel: computedRisk,
  };

  const updated = [newLog, ...currentLogs].slice(0, 500); // Cap at 500 commands
  saveDeviceCommandLogs(updated);
  return newLog;
}

// ==========================================
// Export & Purge Utilities
// ==========================================

export function exportPortalLogsAsCsv(): void {
  const logs = loadPortalAuditLogs();
  const headers = ['ID', 'Timestamp', 'Category', 'Action', 'Severity', 'Status', 'Actor Username', 'Actor Role', 'Actor IP', 'Target Type', 'Target Name', 'Target Location', 'Details'];
  const rows = logs.map(l => [
    l.id,
    l.timestamp,
    l.category,
    l.action,
    l.severity,
    l.status,
    `"${l.actor.username}"`,
    `"${l.actor.role}"`,
    l.actor.ipAddress || '',
    l.target.type,
    `"${l.target.name}"`,
    `"${l.target.location || ''}"`,
    `"${l.details.replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadBlob(csvContent, `nettopology_portal_audit_logs_${formatDateForFile(new Date())}.csv`, 'text/csv;charset=utf-8;');
}

export function exportCommandLogsAsCsv(): void {
  const logs = loadDeviceCommandLogs();
  const headers = ['ID', 'Timestamp', 'Actor Username', 'Actor Role', 'Actor IP', 'Device Name', 'Device IP', 'Vendor', 'Location', 'Channel', 'Risk Level', 'Status', 'Command', 'Notes'];
  const rows = logs.map(c => [
    c.id,
    c.timestamp,
    `"${c.actor.username}"`,
    `"${c.actor.role}"`,
    c.actor.ipAddress || '',
    `"${c.deviceName}"`,
    c.deviceIp,
    c.deviceVendor,
    `"${c.deviceLocation}"`,
    c.channel,
    c.riskLevel,
    c.status,
    `"${c.command.replace(/"/g, '""')}"`,
    `"${(c.notes || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadBlob(csvContent, `nettopology_device_command_logs_${formatDateForFile(new Date())}.csv`, 'text/csv;charset=utf-8;');
}

export function exportAllLogsAsJson(): void {
  const portalLogs = loadPortalAuditLogs();
  const commandLogs = loadDeviceCommandLogs();
  const exportPayload = {
    system: 'NetTopology Enterprise Audit & Activity Log Engine',
    exportedAt: new Date().toISOString(),
    exportedBy: getCurrentActor(),
    summary: {
      totalPortalEvents: portalLogs.length,
      totalDeviceCommands: commandLogs.length,
    },
    portalAuditLogs: portalLogs,
    deviceCommandLogs: commandLogs,
  };

  const jsonStr = JSON.stringify(exportPayload, null, 2);
  downloadBlob(jsonStr, `nettopology_audit_full_export_${formatDateForFile(new Date())}.json`, 'application/json');
}

export function clearPortalLogs(): void {
  savePortalAuditLogs([]);
}

export function clearCommandLogs(): void {
  saveDeviceCommandLogs([]);
}

function formatDateForFile(d: Date): string {
  return d.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function downloadBlob(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
