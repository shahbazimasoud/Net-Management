import { Pool, PoolConfig, PoolClient } from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { hashPassword } from './auth';
import { encryptServerSecret, decryptServerSecret, decryptServerSecretWithMeta, decryptVaultSecret, decryptVaultSecretWithMeta } from './vaultCrypto';

const currentDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

// Load environment variables from candidate paths
const candidateEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(currentDir, '.env'),
  path.resolve(currentDir, '..', '.env'),
  '/opt/nettopology/.env',
];

for (const envPath of candidateEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}
dotenv.config();

export interface DbStatus {
  connected: boolean;
  engine: 'postgresql' | 'fallback_json';
  host: string;
  port: number;
  database: string;
  user: string;
  tablesCount?: number;
  usersCount?: number;
  devicesCount?: number;
  customMapsCount?: number;
  error?: string | null;
  lastChecked: string;
}

export function getDbConfig(): PoolConfig {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      max: 20,
    };
  }

  const host = process.env.DB_HOST || '127.0.0.1';
  const port = parseInt(process.env.DB_PORT || '5432', 10);
  const database = process.env.DB_NAME || 'nettopology_db';
  const user = process.env.DB_USER || 'nettopology_user';
  const password = process.env.DB_PASSWORD || '';

  return {
    host,
    port,
    database,
    user,
    password,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    max: 20,
  };
}

let pool: Pool | null = null;
let isPostgresReady = false;
let lastError: string | null = null;

export function getPgPool(): Pool | null {
  return pool;
}

export function isPostgresConnected(): boolean {
  return isPostgresReady && pool !== null;
}

export async function ensurePostgresConnection(): Promise<boolean> {
  if (isPostgresReady && pool) {
    try {
      const pingClient = await pool.connect();
      pingClient.release();
      return true;
    } catch {
      isPostgresReady = false;
      try {
        await pool.end();
      } catch {}
      pool = null;
    }
  }

  try {
    const config = getDbConfig();
    if (!pool) {
      pool = new Pool(config);
      pool.on('error', (err) => {
        isPostgresReady = false;
      });
    }

    const client = await pool.connect();
    client.release();
    isPostgresReady = true;
    lastError = null;
    return true;
  } catch (err: any) {
    isPostgresReady = false;
    lastError = err.message || 'PostgreSQL not reachable';
    if (pool) {
      try {
        await pool.end();
      } catch {}
      pool = null;
    }
    return false;
  }
}

// Local persistent file fallback (used if PostgreSQL is offline or unprovisioned)
const FALLBACK_FILE = path.join(process.cwd(), 'backend', 'database_store.json');

export interface RemoteServer {
  id: string;
  name: string;
  hostname?: string;
  ip: string;
  os_type: 'linux' | 'windows';
  os_distro?: string;
  environment: 'Production' | 'Staging' | 'Development' | 'Testing' | 'DMZ' | 'DR';
  category: string;
  role: string;
  tags: string[];
  ssh_port?: number;
  ssh_username?: string;
  ssh_password?: string;
  ssh_password_set?: boolean;
  ssh_vault_item_id?: string;
  ssh_key_path?: string;
  ssh_key?: string;
  default_shell?: 'bash' | 'zsh' | 'sh';
  win_protocol?: 'rdp' | 'powershell' | 'winrm' | 'ssh';
  win_port?: number;
  win_username?: string;
  win_password?: string;
  win_password_set?: boolean;
  win_vault_item_id?: string;
  win_domain?: string;
  rdp_security?: 'any' | 'nla' | 'tls' | 'rdp';
  vnc_port?: number;
  vnc_username?: string;
  vnc_password?: string;
  prompt_password_on_connect?: boolean;
  server_type?: 'linux' | 'windows' | 'nginx' | 'apache' | 'postgresql' | 'mysql';
  installed_web_servers?: ('apache' | 'nginx' | string)[];
  installed_databases?: ('postgresql' | 'mysql' | string)[];
  has_apache?: boolean;
  has_nginx?: boolean;
  has_postgresql?: boolean;
  has_mysql?: boolean;
  web_http_port?: number;
  web_https_port?: number;
  postgres_port?: number;
  postgres_user?: string;
  postgres_password?: string;
  postgres_password_set?: boolean;
  postgres_database?: string;
  db_vault_item_id?: string;
  mysql_port?: number;
  mysql_user?: string;
  mysql_password?: string;
  mysql_password_set?: boolean;
  mysql_database?: string;
  status: 'online' | 'offline' | 'unreachable' | 'maintenance' | 'untested';
  cpu_cores?: number;
  ram_gb?: number;
  disk_gb?: number;
  uptime_str?: string;
  location?: string;
  notes?: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export interface FallbackStore {
  users: any[];
  user_groups: any[];
  access_policies: any[];
  devices: any[];
  device_groups: any[];
  custom_maps: any[];
  topology_hierarchy: any[];
  physical_hierarchy?: PhysicalHierarchyStructured;
  device_placements?: DevicePlacementRecord[];
  node_positions: Record<string, Record<string, { x: number; y: number }>>;
  audit_logs: any[];
  ad_config: any;
  device_sticky_notes?: any[];
  remote_servers?: RemoteServer[];
  server_categories?: ServerCategory[];
  user_password_vault?: UserVaultItem[];
  bulk_server_reports?: any[];
  general_settings?: PanelGeneralSettings;
  scheduled_backup_jobs?: ScheduledBackupJob[];
  email_config?: EmailConfig;
  audit_report_schedule?: any;
  audit_email_reports?: any[];
  config_templates?: any[];
  system_security_keys?: SystemSecurityKeysRecord[];
  server_command_audit_logs?: any[];
}

export interface SystemSecurityKeysRecord {
  key_name: string;
  master_key: string;
  legacy_keys: string[];
  created_at?: string;
  updated_at?: string;
}

export interface SecurityKeychain {
  masterKey: string;
  legacyKeys: string[];
}

export interface ScheduledBackupJob {
  id: string;
  name: string;
  enabled: boolean;
  schedule_type: 'hourly' | 'daily' | 'weekly' | 'custom_interval';
  run_time: string; // e.g. "02:00"
  days_of_week: number[]; // [0..6]
  interval_minutes: number;
  scope: 'full' | 'devices_topology' | 'security_rbac' | 'servers_only' | 'templates_only';
  encrypt: boolean;
  passphrase?: string;
  sanitize: boolean;
  retention_count: number;
  retention_days: number;
  last_run_at?: string | null;
  next_run_at?: string | null;
  last_status?: 'idle' | 'running' | 'success' | 'failed';
  last_result_details?: string | null;
  last_backup_file?: string | null;
  created_at?: string;
  updated_at?: string;
}

export const DEFAULT_SCHEDULED_BACKUP_JOBS: ScheduledBackupJob[] = [
  {
    id: 'job-daily-dr',
    name: 'Daily Disaster Recovery Snapshot (بکاپ جامع روزانه)',
    enabled: true,
    schedule_type: 'daily',
    run_time: '03:00',
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    interval_minutes: 1440,
    scope: 'full',
    encrypt: false,
    sanitize: false,
    retention_count: 10,
    retention_days: 30,
    last_status: 'idle',
    created_at: '2026-09-14T00:00:00.000Z',
    updated_at: '2026-09-14T00:00:00.000Z',
  },
  {
    id: 'job-servers-fleet',
    name: 'Server Fleet Configuration Backup (بکاپ ناوگان سرورها)',
    enabled: true,
    schedule_type: 'daily',
    run_time: '04:00',
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    interval_minutes: 1440,
    scope: 'servers_only',
    encrypt: false,
    sanitize: false,
    retention_count: 14,
    retention_days: 14,
    last_status: 'idle',
    created_at: '2026-09-14T00:00:00.000Z',
    updated_at: '2026-09-14T00:00:00.000Z',
  },
];

export interface DevicePlacementRecord {
  id: string;
  device_id: string;
  building: string;
  floor: string;
  unit: string;
  rack: string;
  section: string;
  location?: string;
  hierarchy_id?: string;
  position_u?: number;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PhysicalHierarchyStructured {
  buildings: string[];
  floors: Record<string, string[]>;
  units: Record<string, string[]>;
  racks: Record<string, string[]>;
  sections: Record<string, string[]>;
}

export interface UserVaultItem {
  id: string;
  user_id: string;
  name: string;
  username?: string;
  encrypted_password: string;
  iv: string;
  tag: string;
  password_hash?: string;
  password_salt?: string;
  category?: string;
  target_host?: string;
  notes?: string;
  tags?: string[];
  strength?: string;
  created_at: string;
  updated_at: string;
}

export interface ServerCategory {
  id: string;
  name: string;
  name_fa?: string;
  description?: string;
  color?: string;
  is_default?: boolean;
  serverCount?: number;
  created_at?: string;
  updated_at?: string;
}

function loadInitialDevices(): any[] {
  try {
    const netPath = path.join(process.cwd(), 'backend', 'network_data.json');
    if (fs.existsSync(netPath)) {
      const parsed = JSON.parse(fs.readFileSync(netPath, 'utf-8'));
      if (Array.isArray(parsed.devices) && parsed.devices.length > 0) {
        return parsed.devices.map((d: any) => ({
          ...d,
          building: (d.building && !d.building.includes('ساختمان مرکزی') && !d.building.includes('Central Bldg') && !d.building.includes('ساختمان مهندسی') && !d.building.includes('Engineering Bldg') && !d.building.includes('ساختمان اداری')) ? d.building : '',
          floor: (d.floor && !d.floor.includes('Floor') && !d.floor.includes('طبقه')) ? d.floor : '',
          unit: (d.unit && !d.unit.includes('اتاق سرور') && !d.unit.includes('Server Room') && !d.unit.includes('IDF')) ? d.unit : '',
          rack: (d.rack && !d.rack.includes('Rack-A') && !d.rack.includes('Rack-B')) ? d.rack : '',
          section: (d.section && !d.section.includes('بخش شبکه')) ? d.section : '',
          hierarchy_id: d.hierarchy_id || '',
        }));
      }
    }
  } catch (e) {
    console.error('[DB] Failed to load devices from network_data.json', e);
  }
  return [];
}

const DEFAULT_USER_GROUPS = [
  {
    id: 'group-admin',
    name: 'مدیران ارشد شبکه (Super Administrators)',
    description: 'دسترسی نامحدود به تمامی منابع، نقشه‌ها، پیکربندی تجهیزات و احراز هویت',
    color: 'indigo',
    member_user_ids: ['user-admin'],
    is_builtin: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'group-noc',
    name: 'تیم پایش و عملیات NOC (NOC Operations)',
    description: 'پایش برخط وضعیت لینک‌ها، اجرای ابزارهای عیب‌یابی و مشاهده نقشه‌ها',
    color: 'cyan',
    member_user_ids: [],
    is_builtin: false,
    created_at: new Date().toISOString()
  },
  {
    id: 'group-helpdesk-ops',
    name: 'کارشناسان پشتیبانی و هلپ‌دسک (Helpdesk Support)',
    description: 'پشتیبانی کاربران محلی، بررسی پورت‌ها و خطایابی کلاینت‌های شبکه',
    color: 'emerald',
    member_user_ids: [],
    is_builtin: false,
    created_at: new Date().toISOString()
  },
  {
    id: 'group-readonly',
    name: 'ناظران و مانیتورینگ فقط-خواندنی (Read-Only Auditors)',
    description: 'مشاهده گزارشات، نقشه‌های عمومی و ممیزی سیستم بدون امکان اعمال تغییرات',
    color: 'amber',
    member_user_ids: [],
    is_builtin: false,
    created_at: new Date().toISOString()
  }
];

export const DEFAULT_ACCESS_POLICIES = [
  {
    id: 'policy-helpdesk',
    name: 'سطح دسترسی تیم هلپ‌دسک (Helpdesk Operator Policy)',
    description: 'دسترسی محدود به سوئیچ‌های لایه دسترسی جهت تغییر ویلن، دیسکریپشن و بازنشانی پورت‌ها بدون دسترسی به کنسول CLI یا خاموش کردن پورت‌های حساس',
    is_builtin: true,
    isBuiltin: true,
    priority: 10,
    subjectType: 'local_group',
    subjectId: 'group-helpdesk-ops',
    subjectName: 'Helpdesk Operators (تیم هلپ‌دسک و پشتیبانی)',
    targetScope: 'groups',
    targetGroupIds: ['devgroup-access'],
    targetDeviceIds: [],
    // Page Access
    canViewDashboard: true,
    canViewTopology: true,
    canViewDevices: true,
    canViewPorts: true,
    canViewScanner: false,
    canViewTemplates: false,
    canViewSettings: false,
    canViewServers: false,
    canViewLogs: false,
    canCheckUpdate: false,
    canPerformUpdate: false,
    // Device & Port Actions
    terminalAccess: 'none',
    canToggleAdminStatus: false,
    canChangeVlan: true,
    canEditDescription: true,
    canTogglePortSecurity: true,
    canWriteMemory: false,
    canManageDevices: false,
    canApplyTemplates: false,
    canBatchOperate: false,
    canExportBackup: false,
    canImportBackup: false,
    defaultServerPermissions: {
      terminal: false,
      file_explorer: true,
      server_management: true,
      web_management: false,
      database_management: false,
      power_control: false,
      edit_properties: false,
      delete_server: false,
    },
    perServerPermissions: {},
    defaultDevicePermissions: {
      web_configs: true,
      terminal: false,
      apply_template: false,
      device_note: true,
      edit_properties: false,
      ping_keepalive: true,
      inspect_ports: true,
      write_memory: false,
      delete_device: false,
    },
    perDevicePermissions: {},
    created_at: new Date().toISOString(),
  },
  {
    id: 'policy-noc-observer',
    name: 'تیم پایش و مانیتورینگ NOC (Read-Only Observer)',
    description: 'دسترسی فقط خواندنی به تمام تجهیزات، توپولوژی، تلمتری پورت‌ها و اسکنر همسایگی همراه با دسترسی کنسول فقط خواندنی',
    is_builtin: true,
    isBuiltin: true,
    priority: 20,
    subjectType: 'local_group',
    subjectId: 'group-noc',
    subjectName: 'NOC Monitoring (مرکز عملیات شبکه)',
    targetScope: 'all',
    targetGroupIds: [],
    targetDeviceIds: [],
    // Page Access
    canViewDashboard: true,
    canViewTopology: true,
    canViewDevices: true,
    canViewPorts: true,
    canViewScanner: true,
    canViewTemplates: true,
    canViewSettings: false,
    canViewServers: true,
    canViewLogs: true,
    canCheckUpdate: false,
    canPerformUpdate: false,
    // Device & Port Actions
    terminalAccess: 'view_only',
    canToggleAdminStatus: false,
    canChangeVlan: false,
    canEditDescription: false,
    canTogglePortSecurity: false,
    canWriteMemory: false,
    canManageDevices: false,
    canApplyTemplates: false,
    canBatchOperate: false,
    canExportBackup: false,
    canImportBackup: false,
    defaultServerPermissions: {
      terminal: false,
      file_explorer: false,
      server_management: true,
      web_management: true,
      database_management: true,
      power_control: false,
      edit_properties: false,
      delete_server: false,
    },
    perServerPermissions: {},
    defaultDevicePermissions: {
      web_configs: true,
      terminal: false,
      apply_template: false,
      device_note: true,
      edit_properties: false,
      ping_keepalive: true,
      inspect_ports: true,
      write_memory: false,
      delete_device: false,
    },
    perDevicePermissions: {},
    created_at: new Date().toISOString(),
  },
  {
    id: 'policy-super-admin',
    name: 'مدیر ارشد زیرساخت شبکه (Super Administrator)',
    description: 'دسترسی نامحدود به تمامی تجهیزات، کنسول‌های تعاملی SSH، رایت مموری، اعمال تمپلیت و تنظیمات امنیتی',
    is_builtin: true,
    isBuiltin: true,
    priority: 100,
    subjectType: 'local_user',
    subjectId: 'admin',
    subjectName: 'مدیر اصلی سیستم (Local Admin / NetOps)',
    targetScope: 'all',
    targetGroupIds: [],
    targetDeviceIds: [],
    // Page Access
    canViewDashboard: true,
    canViewTopology: true,
    canViewDevices: true,
    canViewPorts: true,
    canViewScanner: true,
    canViewTemplates: true,
    canViewSettings: true,
    canViewServers: true,
    canViewLogs: true,
    canCheckUpdate: true,
    canPerformUpdate: true,
    // Device & Port Actions
    terminalAccess: 'full',
    canToggleAdminStatus: true,
    canChangeVlan: true,
    canEditDescription: true,
    canTogglePortSecurity: true,
    canWriteMemory: true,
    canManageDevices: true,
    canApplyTemplates: true,
    canBatchOperate: true,
    canExportBackup: true,
    canImportBackup: true,
    canExportDevices: true,
    canImportDevices: true,
    canExportServers: true,
    canImportServers: true,
    canExportTemplates: true,
    canImportTemplates: true,
    defaultServerPermissions: {
      terminal: true,
      file_explorer: true,
      server_management: true,
      web_management: true,
      database_management: true,
      power_control: true,
      edit_properties: true,
      delete_server: true,
      export_servers: true,
      import_servers: true,
    },
    perServerPermissions: {},
    defaultDevicePermissions: {
      web_configs: true,
      terminal: true,
      apply_template: true,
      device_note: true,
      edit_properties: true,
      ping_keepalive: true,
      inspect_ports: true,
      write_memory: true,
      delete_device: true,
      export_devices: true,
      import_devices: true,
    },
    perDevicePermissions: {},
    created_at: new Date().toISOString(),
  },
];

const DEFAULT_DEVICE_GROUPS = [
  {
    id: 'devgroup-core',
    name: 'سوییچ‌های لایه هسته و توزیع (Core & Distribution)',
    description: 'سوییچ‌های پرسرعت Catalyst و Nexus مسئول ترافیک اصلی ستون‌فقرات',
    color: 'indigo',
    icon: 'Layers',
    device_ids: ['dev-core-01', 'dev-dist-bldg-a', 'dev-dist-bldg-b', 'dev-mikrotik-ccr2004', 'dev-dist-01', 'dev-core-02'],
    created_at: new Date().toISOString()
  },
  {
    id: 'devgroup-access',
    name: 'سوییچ‌های لایه دسترسی (Access Layer Switches)',
    description: 'سوییچ‌های ارتباط دهنده کلاینت‌ها، ایستگاه‌های کاری و اکسس‌پوینت‌ها',
    color: 'emerald',
    icon: 'Server',
    device_ids: ['dev-acc-bldg-a-f3', 'dev-acc-bldg-b-f2', 'dev-ap-bldg-a-f1', 'dev-ap-bldg-a-f3', 'dev-ap-bldg-b-f1', 'dev-acc-01', 'dev-acc-02', 'dev-acc-03'],
    created_at: new Date().toISOString()
  },
  {
    id: 'devgroup-routers',
    name: 'روترها و لبه شبکه WAN (Edge & Gateways)',
    description: 'تجهیزات مرزی مسیریابی، گیت‌وی اینترنت و تانل‌های VPN',
    color: 'cyan',
    icon: 'Radio',
    device_ids: ['dev-router-gw', 'dev-mikrotik-ccr2004', 'dev-wan-gw'],
    created_at: new Date().toISOString()
  }
];

const DEFAULT_HIERARCHY: any[] = [];

export function convertHierarchyNodesToStructured(nodes: any[]): PhysicalHierarchyStructured {
  const buildingsSet = new Set<string>();
  const floors: Record<string, string[]> = {};
  const units: Record<string, string[]> = {};
  const racks: Record<string, string[]> = {};
  const sections: Record<string, string[]> = {};

  if (!Array.isArray(nodes)) {
    return { buildings: [], floors: {}, units: {}, racks: {}, sections: {} };
  }

  const bldgIdToName = new Map<string, string>();
  for (const n of nodes) {
    if (n.type === 'building' && n.name) {
      buildingsSet.add(n.name);
      if (n.id) bldgIdToName.set(n.id, n.name);
    }
  }

  const floorIdToInfo = new Map<string, { bldg: string; floor: string }>();
  for (const n of nodes) {
    if (n.type === 'floor' && n.name) {
      let bldgName = n.metadata?.building || '';
      if (!bldgName && n.parentId && bldgIdToName.has(n.parentId)) {
        bldgName = bldgIdToName.get(n.parentId)!;
      }
      if (!bldgName) {
        bldgName = Array.from(buildingsSet)[0] || 'Default Building';
        buildingsSet.add(bldgName);
      }
      if (!floors[bldgName]) floors[bldgName] = [];
      if (!floors[bldgName].includes(n.name)) floors[bldgName].push(n.name);
      if (n.id) floorIdToInfo.set(n.id, { bldg: bldgName, floor: n.name });
    }
  }

  for (const n of nodes) {
    if (!n.name) continue;
    let bldg = n.metadata?.building || '';
    let flr = n.metadata?.floor || '';
    if ((!bldg || !flr) && n.parentId && floorIdToInfo.has(n.parentId)) {
      const info = floorIdToInfo.get(n.parentId)!;
      bldg = info.bldg;
      flr = info.floor;
    }
    if (!bldg || !flr) {
      const parent = nodes.find((item) => item.id === n.parentId);
      if (parent && parent.parentId && floorIdToInfo.has(parent.parentId)) {
        const info = floorIdToInfo.get(parent.parentId)!;
        bldg = info.bldg;
        flr = info.floor;
      }
    }

    if (bldg && flr) {
      buildingsSet.add(bldg);
      if (!floors[bldg]) floors[bldg] = [];
      if (!floors[bldg].includes(flr)) floors[bldg].push(flr);

      const key = `${bldg}:::${flr}`;
      if (n.type === 'unit') {
        const parentUnit = n.metadata?.parentUnit;
        if (parentUnit) {
          const parentKey = `${bldg}:::${flr}:::${parentUnit}`;
          if (!units[parentKey]) units[parentKey] = [];
          if (!units[parentKey].includes(n.name)) units[parentKey].push(n.name);
        }
        if (!units[key]) units[key] = [];
        if (!units[key].includes(n.name)) units[key].push(n.name);
      } else if (n.type === 'rack') {
        const parentNode = nodes.find((item) => item.id === n.parentId);
        const unitName = n.metadata?.unit || (parentNode?.type === 'unit' ? parentNode.name : '');
        if (unitName) {
          if (!units[key]) units[key] = [];
          if (!units[key].includes(unitName)) units[key].push(unitName);
          const unitRackKey = `${bldg}:::${flr}:::${unitName}`;
          if (!racks[unitRackKey]) racks[unitRackKey] = [];
          if (!racks[unitRackKey].includes(n.name)) racks[unitRackKey].push(n.name);
        } else {
          if (!racks[key]) racks[key] = [];
          if (!racks[key].includes(n.name)) racks[key].push(n.name);
        }
      } else if (n.type === 'section') {
        if (!sections[key]) sections[key] = [];
        if (!sections[key].includes(n.name)) sections[key].push(n.name);
      }
    }
  }

  return {
    buildings: Array.from(buildingsSet),
    floors,
    units,
    racks,
    sections,
  };
}

export function convertStructuredToHierarchyNodes(
  structured: Partial<PhysicalHierarchyStructured>,
  existingNodes: any[] = []
): any[] {
  const result: any[] = [];
  const bList = Array.isArray(structured.buildings) ? [...structured.buildings] : [];
  const fMap = structured.floors && typeof structured.floors === 'object' ? { ...structured.floors } : {};
  const uMap = structured.units && typeof structured.units === 'object' ? { ...structured.units } : {};
  const rMap = structured.racks && typeof structured.racks === 'object' ? { ...structured.racks } : {};
  const sMap = structured.sections && typeof structured.sections === 'object' ? { ...structured.sections } : {};

  // Ensure all buildings and floors referenced in keys are present in bList and fMap
  for (const map of [uMap, rMap, sMap]) {
    for (const key of Object.keys(map)) {
      const [b, f] = key.split(':::');
      if (b && !bList.includes(b)) bList.push(b);
      if (b && f) {
        if (!fMap[b]) fMap[b] = [];
        if (!fMap[b].includes(f)) fMap[b].push(f);
      }
    }
  }

  const cleanSlug = (str: string) =>
    str
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF]+/g, '-')
      .replace(/^-|-$/g, '') || 'item';

  const bldgNameToId = new Map<string, string>();
  for (const b of bList) {
    const existing = existingNodes.find((n) => n.type === 'building' && n.name === b);
    const id = existing?.id || `bldg-${cleanSlug(b)}`;
    bldgNameToId.set(b, id);
    result.push({
      id,
      type: 'building',
      parentId: null,
      name: b,
      description: existing?.description || `Building: ${b}`,
      metadata: { ...(existing?.metadata || {}), address: existing?.metadata?.address || '' },
    });
  }

  const floorKeyToId = new Map<string, string>();
  for (const [bName, floors] of Object.entries(fMap)) {
    const bldgId = bldgNameToId.get(bName) || `bldg-${cleanSlug(bName)}`;
    if (!bldgNameToId.has(bName)) {
      result.push({
        id: bldgId,
        type: 'building',
        parentId: null,
        name: bName,
        description: `Building: ${bName}`,
        metadata: {},
      });
      bldgNameToId.set(bName, bldgId);
    }

    if (Array.isArray(floors)) {
      for (const flr of floors) {
        const existing = existingNodes.find(
          (n) => n.type === 'floor' && n.name === flr && (n.parentId === bldgId || n.metadata?.building === bName)
        );
        const id = existing?.id || `floor-${cleanSlug(bName)}-${cleanSlug(flr)}`;
        const key = `${bName}:::${flr}`;
        floorKeyToId.set(key, id);
        result.push({
          id,
          type: 'floor',
          parentId: bldgId,
          name: flr,
          description: existing?.description || `Floor ${flr} in ${bName}`,
          metadata: { ...(existing?.metadata || {}), building: bName },
        });
      }
    }
  }

  const unitKeyToId = new Map<string, string>();
  for (const [key, unitsList] of Object.entries(uMap)) {
    const parts = key.split(':::');
    const bName = parts[0];
    const flr = parts[1];
    const parentUnitName = parts[2];
    const floorKey = `${bName}:::${flr}`;
    const floorId = floorKeyToId.get(floorKey) || `floor-${cleanSlug(bName || 'bldg')}-${cleanSlug(flr || 'flr')}`;
    const parentUnitId = parentUnitName ? unitKeyToId.get(`${floorKey}:::${parentUnitName}`) : null;

    if (Array.isArray(unitsList)) {
      for (const unit of unitsList) {
        const existing = existingNodes.find(
          (n) => n.type === 'unit' && n.name === unit && (n.parentId === (parentUnitId || floorId) || n.metadata?.floor === flr)
        );
        const id = existing?.id || (parentUnitName
          ? `unit-${cleanSlug(bName || 'bldg')}-${cleanSlug(flr || 'flr')}-${cleanSlug(parentUnitName)}-${cleanSlug(unit)}`
          : `unit-${cleanSlug(bName || 'bldg')}-${cleanSlug(flr || 'flr')}-${cleanSlug(unit)}`);
        unitKeyToId.set(`${floorKey}:::${unit}`, id);
        result.push({
          id,
          type: 'unit',
          parentId: parentUnitId || floorId,
          name: unit,
          description: existing?.description || `Unit ${unit}`,
          metadata: {
            ...(existing?.metadata || {}),
            building: bName,
            floor: flr,
            ...(parentUnitName ? { parentUnit: parentUnitName } : {}),
          },
        });
      }
    }
  }

  for (const [key, racksList] of Object.entries(rMap)) {
    const parts = key.split(':::');
    const bName = parts[0] || 'Default Building';
    const flr = parts[1] || 'Floor 1';
    const unitName = parts[2] || '';
    const floorKey = `${bName}:::${flr}`;
    const floorId = floorKeyToId.get(floorKey) || `floor-${cleanSlug(bName || 'bldg')}-${cleanSlug(flr || 'flr')}`;
    const unitId = unitName ? unitKeyToId.get(`${floorKey}:::${unitName}`) || `unit-${cleanSlug(bName)}-${cleanSlug(flr)}-${cleanSlug(unitName)}` : null;

    if (Array.isArray(racksList)) {
      for (const rack of racksList) {
        const existing = existingNodes.find(
          (n) => n.type === 'rack' && n.name === rack && (n.parentId === (unitId || floorId) || (n.metadata?.floor === flr && (unitName ? n.metadata?.unit === unitName : !n.metadata?.unit)))
        );
        const id = existing?.id || (unitName
          ? `rack-${cleanSlug(bName)}-${cleanSlug(flr)}-${cleanSlug(unitName)}-${cleanSlug(rack)}`
          : `rack-${cleanSlug(bName)}-${cleanSlug(flr)}-${cleanSlug(rack)}`);
        result.push({
          id,
          type: 'rack',
          parentId: unitId || floorId,
          name: rack,
          description: existing?.description || `Rack ${rack}`,
          metadata: {
            ...(existing?.metadata || {}),
            building: bName,
            floor: flr,
            ...(unitName ? { unit: unitName } : {}),
          },
        });
      }
    }
  }

  for (const [key, sectionsList] of Object.entries(sMap)) {
    const [bName, flr] = key.split(':::');
    const floorId = floorKeyToId.get(key) || `floor-${cleanSlug(bName || 'bldg')}-${cleanSlug(flr || 'flr')}`;
    if (Array.isArray(sectionsList)) {
      for (const sec of sectionsList) {
        const existing = existingNodes.find(
          (n) => n.type === 'section' && n.name === sec && (n.parentId === floorId || n.metadata?.floor === flr)
        );
        const id = existing?.id || `sec-${cleanSlug(bName || 'bldg')}-${cleanSlug(flr || 'flr')}-${cleanSlug(sec)}`;
        result.push({
          id,
          type: 'section',
          parentId: floorId,
          name: sec,
          description: existing?.description || `Section ${sec}`,
          metadata: { ...(existing?.metadata || {}), building: bName, floor: flr },
        });
      }
    }
  }

  return result;
}

const DEFAULT_CUSTOM_MAPS: any[] = [];

const DEFAULT_NODE_POSITIONS: Record<string, Record<string, { x: number; y: number }>> = {};

const DEFAULT_AD_CONFIG = {
  domain: 'corp.internal',
  server: '192.168.1.10',
  port: 389,
  use_ssl: false,
  base_dn: 'DC=corp,DC=internal',
  bind_user: 'CN=ldap_service,OU=ServiceAccounts,DC=corp,DC=internal',
  bind_password: 'encrypted_service_pass_2026',
  sync_interval_min: 15,
  auto_sync: true,
  role_mappings: {
    'Domain Admins': 'Super Administrator',
    'Network Engineers': 'NOC Analyst',
    'Helpdesk Staff': 'Helpdesk Specialist'
  },
  last_sync: new Date().toISOString(),
  status: 'configured'
};

export const DEFAULT_SERVER_CATEGORIES: ServerCategory[] = [
  {
    id: 'cat-infrastructure',
    name: 'Infrastructure',
    name_fa: 'زیرساخت و شبکه',
    description: 'Core infrastructure, hypervisors, firewalls, and network appliances',
    color: 'blue',
    is_default: true,
  },
  {
    id: 'cat-database',
    name: 'Database',
    name_fa: 'پایگاه داده',
    description: 'Relational databases, SQL clusters, NoSQL datastores, and caching servers',
    color: 'emerald',
    is_default: true,
  },
  {
    id: 'cat-kubernetes',
    name: 'Kubernetes',
    name_fa: 'کوبرنتیز و کلاسترها',
    description: 'Kubernetes control plane, worker nodes, and containerized clusters',
    color: 'cyan',
    is_default: true,
  },
  {
    id: 'cat-web-app',
    name: 'Web / App',
    name_fa: 'وب و اپلیکیشن',
    description: 'Web applications, backend microservices, and reverse proxies',
    color: 'purple',
    is_default: true,
  },
  {
    id: 'cat-monitoring',
    name: 'Monitoring',
    name_fa: 'مانیتورینگ و لاگ',
    description: 'Observability, Prometheus, Grafana, logging, and APM systems',
    color: 'amber',
    is_default: true,
  },
  {
    id: 'cat-active-directory',
    name: 'Active Directory',
    name_fa: 'اکتیو دایرکتوری و هویت',
    description: 'Windows domain controllers, Kerberos, DNS, and identity servers',
    color: 'rose',
    is_default: true,
  },
  {
    id: 'cat-devops',
    name: 'DevOps & Automation',
    name_fa: 'دواپس و اتوماسیون',
    description: 'CI/CD runners, Ansible, Terraform, and automated deployment engines',
    color: 'indigo',
    is_default: true,
  },
  {
    id: 'cat-general',
    name: 'General',
    name_fa: 'عمومی',
    description: 'General purpose utility servers and multipurpose instances',
    color: 'teal',
    is_default: true,
  },
  {
    id: 'cat-uncategorized',
    name: 'Uncategorized',
    name_fa: 'دسته‌بندی‌نشده',
    description: 'System fallback category for newly added or unclassified servers',
    color: 'slate',
    is_default: true,
  },
];

export const DEFAULT_REMOTE_SERVERS: RemoteServer[] = [];

export function loadFallbackStore(): FallbackStore {
  let store: any = null;
  try {
    if (fs.existsSync(FALLBACK_FILE)) {
      const raw = fs.readFileSync(FALLBACK_FILE, 'utf-8');
      store = JSON.parse(raw);
    }
  } catch (err) {
    console.error('[DB Fallback] Error reading fallback store:', err);
  }

  // Initial admin credentials - reads password configured during panel installation in shell
  const initialAdminPassword =
    (process.env.ADMIN_INITIAL_PASSWORD && process.env.ADMIN_INITIAL_PASSWORD.trim()) || 'admin123';
  const defaultAdminHash = hashPassword(initialAdminPassword, 'seed_salt_admin_2026');

  const defaultUsers = [
    {
      id: 'user-admin',
      username: 'admin',
      password_hash: defaultAdminHash.hash,
      password_salt: defaultAdminHash.salt,
      full_name: 'مدیر ارشد شبکه (Network Administrator)',
      email: 'admin@nettopology.internal',
      role: 'Super Administrator',
      user_type: 'local',
      status: 'active',
      group_ids: ['group-admin'],
      is_builtin: true,
      created_at: '2026-09-14T00:00:00.000Z',
      last_login: new Date().toISOString()
    }
  ];

  if (!store || typeof store !== 'object') {
    store = {};
  }

  if (Array.isArray(store.users)) {
    // Sanitize: Purge all demo users (helpdesk_user, noc_operator, field_tech) and invalid/corrupted records
    store.users = store.users.filter(
      (u: any) =>
        u &&
        typeof u.username === 'string' &&
        u.username.trim().length > 0 &&
        !['helpdesk_user', 'noc_operator', 'field_tech'].includes(u.username.toLowerCase())
    );

    // Ensure an admin user exists (seed on initial creation only, do NOT overwrite existing user credentials)
    const adminIndex = store.users.findIndex(
      (u: any) => u && (u.username.toLowerCase() === 'admin' || u.id === 'user-admin')
    );
    if (adminIndex < 0) {
      store.users.unshift(defaultUsers[0]);
    }
  } else {
    store.users = defaultUsers;
  }

  if (Array.isArray(store.user_groups)) {
    // Clean demo user references from group memberships
    store.user_groups.forEach((g: any) => {
      if (Array.isArray(g.member_user_ids)) {
        g.member_user_ids = g.member_user_ids.filter(
          (m: string) => !['user-helpdesk', 'user-noc', 'helpdesk_local', 'noc_local', 'field_tech', 'helpdesk_user', 'noc_operator'].includes(m)
        );
      }
    });
  } else {
    store.user_groups = DEFAULT_USER_GROUPS;
  }
  if (!Array.isArray(store.access_policies) || store.access_policies.length === 0) {
    store.access_policies = DEFAULT_ACCESS_POLICIES;
  }
  if (!Array.isArray(store.devices) || store.devices.length === 0) {
    store.devices = loadInitialDevices();
  }
  if (!Array.isArray(store.device_groups) || store.device_groups.length === 0) {
    store.device_groups = DEFAULT_DEVICE_GROUPS;
  }
  if (!Array.isArray(store.custom_maps)) {
    store.custom_maps = [];
  } else {
    store.custom_maps = store.custom_maps.filter((m: any) => m && m.id !== 'map-enterprise-core' && !m.name?.includes('ستون‌فقرات') && !m.name?.includes('ستون فقرات'));
  }
  if (!Array.isArray(store.topology_hierarchy)) {
    store.topology_hierarchy = [];
  }
  if (!store.physical_hierarchy || !Array.isArray(store.physical_hierarchy.buildings)) {
    store.physical_hierarchy = convertHierarchyNodesToStructured(store.topology_hierarchy);
  }
  if (!Array.isArray(store.device_placements)) {
    store.device_placements = [];
  }
  if (!store.node_positions || Object.keys(store.node_positions).length === 0) {
    store.node_positions = DEFAULT_NODE_POSITIONS;
  }
  if (!store.ad_config) {
    store.ad_config = DEFAULT_AD_CONFIG;
  }
  if (!Array.isArray(store.device_sticky_notes)) {
    store.device_sticky_notes = [];
  }
  if (!Array.isArray(store.remote_servers)) {
    store.remote_servers = [];
  } else {
    // Filter out any mock servers
    store.remote_servers = store.remote_servers.filter(
      (s: any) => s && !['srv-web-prod01', 'srv-db-master', 'srv-ci-runner', 'srv-dc-corp01', 'srv-app-win01'].includes(s.id)
    );
  }
  if (!Array.isArray(store.server_categories) || store.server_categories.length === 0) {
    store.server_categories = [...DEFAULT_SERVER_CATEGORIES];
  }
  if (!Array.isArray(store.user_password_vault)) {
    store.user_password_vault = [];
  }
  if (!Array.isArray(store.bulk_server_reports)) {
    store.bulk_server_reports = [];
  }
  if (!Array.isArray(store.scheduled_backup_jobs) || store.scheduled_backup_jobs.length === 0) {
    store.scheduled_backup_jobs = [...DEFAULT_SCHEDULED_BACKUP_JOBS];
  }
  if (!Array.isArray(store.audit_logs)) {
    store.audit_logs = [
      {
        id: `audit-init-${Date.now()}`,
        timestamp: new Date().toISOString(),
        user_name: 'System',
        action: 'Database Initialization',
        category: 'system',
        target: 'PostgreSQL Core',
        status: 'success',
        details: 'Enterprise PostgreSQL schemas & fallback tables initialized successfully.',
        ip_address: '127.0.0.1',
        user_agent: 'NetTopology Backend Service'
      }
    ];
  }
  if (!Array.isArray(store.config_templates) || store.config_templates.length === 0) {
    try {
      const netPath = path.join(process.cwd(), 'backend', 'network_data.json');
      if (fs.existsSync(netPath)) {
        const raw = fs.readFileSync(netPath, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.templates) && data.templates.length > 0) {
          store.config_templates = data.templates;
        }
      }
    } catch {}
    if (!Array.isArray(store.config_templates)) {
      store.config_templates = [];
    }
  }

  if (!Array.isArray(store.system_security_keys)) {
    store.system_security_keys = [];
  }

  return store;
}

export function saveFallbackStore(data: FallbackStore): void {
  try {
    fs.mkdirSync(path.dirname(FALLBACK_FILE), { recursive: true });
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[DB Fallback] Error saving fallback store:', err);
  }
}

/**
 * Synchronize all entities from fallback store to PostgreSQL if PostgreSQL is missing records
 */
async function syncFallbackToPostgres(client: PoolClient, initialData: FallbackStore): Promise<void> {
  // 1. Sync Users
  try {
    // Purge demo users from PostgreSQL database to maintain clean credentials
    await client.query("DELETE FROM users WHERE LOWER(username) IN ('helpdesk_user', 'noc_operator', 'field_tech')");

    // Seed initial admin user in PostgreSQL ONLY if no admin user exists yet (never overwrite changed password)
    const adminCheckRes = await client.query(
      "SELECT id FROM users WHERE LOWER(username) = 'admin' OR id = 'user-admin' LIMIT 1"
    );
    if (adminCheckRes.rows.length === 0) {
      const initialAdminPassword =
        (process.env.ADMIN_INITIAL_PASSWORD && process.env.ADMIN_INITIAL_PASSWORD.trim()) || 'admin123';
      const adminHash = hashPassword(initialAdminPassword, 'seed_salt_admin_2026');
      await client.query(
        `INSERT INTO users (id, username, password_hash, password_salt, full_name, email, role, user_type, status, group_ids, is_builtin, created_at, last_login)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO NOTHING`,
        [
          'user-admin',
          'admin',
          adminHash.hash,
          adminHash.salt,
          'مدیر ارشد شبکه (Network Administrator)',
          'admin@nettopology.internal',
          'Super Administrator',
          'local',
          'active',
          JSON.stringify(['group-admin']),
          true,
          new Date().toISOString(),
          new Date().toISOString(),
        ]
      );
    }

    const existingUsersRes = await client.query('SELECT id, username FROM users');
    const existingUsernames = new Set(existingUsersRes.rows.map((r: any) => (r.username || '').toLowerCase()));
    const existingIds = new Set(existingUsersRes.rows.map((r: any) => r.id));

    for (const u of initialData.users) {
      if (!u || !u.username) continue;
      const cleanUser = u.username.toLowerCase();
      if (!existingUsernames.has(cleanUser) && !existingIds.has(u.id)) {
        await client.query(
          `INSERT INTO users (id, username, password_hash, password_salt, full_name, email, role, user_type, status, group_ids, is_builtin, created_at, last_login)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (id) DO UPDATE SET
             username = EXCLUDED.username,
             full_name = EXCLUDED.full_name,
             email = EXCLUDED.email,
             role = EXCLUDED.role,
             user_type = EXCLUDED.user_type,
             status = EXCLUDED.status,
             group_ids = EXCLUDED.group_ids,
             is_builtin = EXCLUDED.is_builtin`,
          [
            u.id || `user-sync-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            u.username,
            u.password_hash || '',
            u.password_salt || '',
            (u.full_name || u.fullName || u.username).trim(),
            (u.email || `${cleanUser}@nettopology.internal`).trim(),
            u.role || 'Super Administrator',
            u.user_type || u.userType || 'local',
            u.status || 'active',
            JSON.stringify(u.group_ids || u.groupIds || []),
            Boolean(u.is_builtin ?? u.isBuiltin),
            u.created_at || u.createdAt || new Date().toISOString(),
            u.last_login || u.lastLogin || null,
          ]
        );
      }
    }
  } catch (err: any) {
    console.warn('[Database Sync Notice] Users sync notice:', err.message);
  }

  // 2. Sync Custom Maps
  try {
    await client.query("DELETE FROM custom_maps WHERE id = 'map-enterprise-core' OR name LIKE '%ستون‌فقرات%' OR name LIKE '%ستون فقرات%'");
    const existingMapsRes = await client.query('SELECT id FROM custom_maps');
    const existingMapIds = new Set(existingMapsRes.rows.map((r: any) => r.id));
    const rawMapsToSync = (initialData.custom_maps && initialData.custom_maps.length > 0)
      ? initialData.custom_maps
      : DEFAULT_CUSTOM_MAPS;
    const mapsToSync = rawMapsToSync.filter((m: any) => m && m.id !== 'map-enterprise-core' && !m.name?.includes('ستون‌فقرات') && !m.name?.includes('ستون فقرات'));

    for (const m of mapsToSync) {
      if (!m || !m.id) continue;
      if (!existingMapIds.has(m.id)) {
        await client.query(
          `INSERT INTO custom_maps (
             id, name, description, map_type, nodes, connections, viewport, metadata, visibility, owner_id, owner_name, allowed_users, map_data, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             map_type = EXCLUDED.map_type,
             nodes = EXCLUDED.nodes,
             connections = EXCLUDED.connections,
             viewport = EXCLUDED.viewport,
             metadata = EXCLUDED.metadata,
             visibility = EXCLUDED.visibility,
             owner_id = EXCLUDED.owner_id,
             owner_name = EXCLUDED.owner_name,
             allowed_users = EXCLUDED.allowed_users,
             map_data = EXCLUDED.map_data,
             updated_at = EXCLUDED.updated_at`,
          [
            m.id,
            m.name || 'Untitled Map',
            m.description || '',
            m.type || m.map_type || 'schematic',
            JSON.stringify(m.devicePositions || m.nodes || {}),
            JSON.stringify(m.links || m.connections || []),
            JSON.stringify(m.viewport || { zoom: 1, pan: { x: 0, y: 0 } }),
            JSON.stringify(m.metadata || {}),
            m.visibility || 'public',
            m.ownerId || m.owner_id || 'user-admin',
            m.ownerName || m.owner_name || 'admin',
            JSON.stringify(m.allowedUsers || m.allowed_users || []),
            JSON.stringify(m),
            m.createdAt || m.created_at ? new Date(m.createdAt || m.created_at) : new Date(),
            new Date(),
          ]
        );
      }
    }
  } catch (err: any) {
    console.warn('[Database Sync Notice] Custom Maps sync notice:', err.message);
  }

  // 3. Sync User Groups
  try {
    const groupCountRes = await client.query('SELECT count(*) as count FROM user_groups');
    if (parseInt(groupCountRes.rows[0]?.count || '0', 10) === 0) {
      const groupsToSeed = (initialData.user_groups && initialData.user_groups.length > 0)
        ? initialData.user_groups
        : DEFAULT_USER_GROUPS;
      for (const g of groupsToSeed) {
        await client.query(
          `INSERT INTO user_groups (id, name, description, color, member_user_ids, is_builtin, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING`,
          [g.id, g.name, g.description, g.color, JSON.stringify(g.memberUserIds || g.member_user_ids || []), g.isBuiltin ?? g.is_builtin ?? false, g.created_at || new Date().toISOString()]
        );
      }
    }
  } catch (err: any) {
    console.warn('[Database Sync Notice] User Groups sync notice:', err.message);
  }

  // 4. Sync Access Policies
  try {
    const policyCountRes = await client.query('SELECT count(*) as count FROM access_policies');
    if (parseInt(policyCountRes.rows[0]?.count || '0', 10) === 0) {
      const policiesToSeed = (initialData.access_policies && initialData.access_policies.length > 0)
        ? initialData.access_policies
        : DEFAULT_ACCESS_POLICIES;
      for (const p of policiesToSeed) {
        const { id, name, description, priority, isBuiltin, is_builtin, created_at, policyData, policy_data, ...rest } = p;
        const pData = policyData || policy_data || rest;
        await client.query(
          `INSERT INTO access_policies (id, name, description, priority, is_builtin, policy_data, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING`,
          [p.id, p.name, p.description, p.priority || 100, p.isBuiltin ?? p.is_builtin ?? false, JSON.stringify(pData), created_at || p.created_at || new Date().toISOString()]
        );
      }
    }

    // Ensure all existing policies in PostgreSQL have defaultDevicePermissions and perDevicePermissions
    const existingPoliciesRes = await client.query('SELECT id, priority, policy_data FROM access_policies');
    for (const r of existingPoliciesRes.rows) {
      const pData = typeof r.policy_data === 'string' ? JSON.parse(r.policy_data) : (r.policy_data || {});
      let changed = false;
      if (!pData.defaultDevicePermissions) {
        const isSuper = r.id === 'policy-super-admin' || (r.priority || 0) >= 100;
        pData.defaultDevicePermissions = isSuper
          ? {
              web_configs: true,
              terminal: true,
              apply_template: true,
              device_note: true,
              edit_properties: true,
              ping_keepalive: true,
              inspect_ports: true,
              write_memory: true,
              delete_device: true,
              port_power: true,
              port_mode: true,
              port_vlan: true,
              port_security: true,
              port_description: true,
              port_bridge: true,
              port_speed: true,
              port_cable_test: true,
            }
          : r.id === 'policy-noc-observer'
          ? {
              web_configs: true,
              terminal: false,
              apply_template: false,
              device_note: true,
              edit_properties: false,
              ping_keepalive: true,
              inspect_ports: true,
              write_memory: false,
              delete_device: false,
              port_power: false,
              port_mode: false,
              port_vlan: false,
              port_security: false,
              port_description: false,
              port_bridge: false,
              port_speed: false,
              port_cable_test: true,
            }
          : {
              web_configs: true,
              terminal: false,
              apply_template: false,
              device_note: true,
              edit_properties: false,
              ping_keepalive: true,
              inspect_ports: true,
              write_memory: false,
              delete_device: false,
              port_power: false,
              port_mode: false,
              port_vlan: false,
              port_security: false,
              port_description: false,
              port_bridge: false,
              port_speed: false,
              port_cable_test: true,
            };
        changed = true;
      } else {
        const isSuper = r.id === 'policy-super-admin' || (r.priority || 0) >= 100;
        const portActionKeys = [
          'port_power',
          'port_mode',
          'port_vlan',
          'port_security',
          'port_description',
          'port_bridge',
          'port_speed',
          'port_cable_test',
        ];
        for (const pk of portActionKeys) {
          if (pData.defaultDevicePermissions[pk] === undefined) {
            if (isSuper) {
              pData.defaultDevicePermissions[pk] = true;
            } else if (pk === 'port_cable_test') {
              pData.defaultDevicePermissions[pk] = true;
            } else if (pk === 'port_power') {
              pData.defaultDevicePermissions[pk] = Boolean(pData.canToggleAdminStatus || pData.canMikrotikToggleInterface);
            } else if (pk === 'port_vlan') {
              pData.defaultDevicePermissions[pk] = Boolean(pData.canChangeVlan || pData.canMikrotikBridgeVlan);
            } else if (pk === 'port_description') {
              pData.defaultDevicePermissions[pk] = Boolean(pData.canEditDescription || pData.canMikrotikComment);
            } else if (pk === 'port_security') {
              pData.defaultDevicePermissions[pk] = Boolean(pData.canTogglePortSecurity);
            } else {
              pData.defaultDevicePermissions[pk] = false;
            }
            changed = true;
          }
        }
      }
      if (!pData.perDevicePermissions) {
        pData.perDevicePermissions = {};
        changed = true;
      }
      if (changed) {
        await client.query('UPDATE access_policies SET policy_data = $1 WHERE id = $2', [JSON.stringify(pData), r.id]);
      }
    }
  } catch (err: any) {
    console.warn('[Database Sync Notice] Access Policies sync notice:', err.message);
  }

  // 5. Sync Devices
  try {
    const devCountRes = await client.query('SELECT count(*) as count FROM devices');
    if (parseInt(devCountRes.rows[0]?.count || '0', 10) === 0) {
      const devicesToSeed = (initialData.devices && initialData.devices.length > 0)
        ? initialData.devices
        : loadInitialDevices();
      for (const d of devicesToSeed) {
        const seedSshPass = d.ssh_password
          ? (d.ssh_password.startsWith('enc:v1:') ? d.ssh_password : encryptServerSecret(d.ssh_password))
          : (d.connection && d.connection.password ? (d.connection.password.startsWith('enc:v1:') ? d.connection.password : encryptServerSecret(d.connection.password)) : null);
        const seedEnablePass = d.enable_password
          ? (d.enable_password.startsWith('enc:v1:') ? d.enable_password : encryptServerSecret(d.enable_password))
          : null;

        await client.query(
          `INSERT INTO devices (
            id, name, ip, type, model, platform, role, connection_mode, ssh_host, ssh_port, ssh_username,
            is_online, latency_ms, mac_address, uptime_str, ports, building, floor, unit, rack, section, location, hierarchy_id,
            ssh_password, enable_password
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
          ON CONFLICT (id) DO UPDATE SET
            building = EXCLUDED.building,
            floor = EXCLUDED.floor,
            unit = EXCLUDED.unit,
            rack = EXCLUDED.rack,
            section = EXCLUDED.section,
            location = EXCLUDED.location,
            hierarchy_id = EXCLUDED.hierarchy_id,
            ssh_password = CASE WHEN EXCLUDED.ssh_password IS NOT NULL AND EXCLUDED.ssh_password <> '' THEN EXCLUDED.ssh_password ELSE devices.ssh_password END,
            enable_password = CASE WHEN EXCLUDED.enable_password IS NOT NULL AND EXCLUDED.enable_password <> '' THEN EXCLUDED.enable_password ELSE devices.enable_password END`,
          [
            d.id,
            d.name,
            d.ip,
            d.type || 'switch',
            d.model || '',
            d.platform || 'cisco_ios_xe',
            d.role || '',
            d.connection_mode || 'simulator',
            d.ssh_host || d.ip,
            d.ssh_port || 22,
            d.ssh_username || 'admin',
            d.is_online !== undefined ? d.is_online : true,
            d.latency_ms || 1.5,
            d.mac || d.mac_address || '',
            d.uptime || '',
            JSON.stringify(d.ports || []),
            d.building || '',
            d.floor || '',
            d.unit || '',
            d.rack || '',
            d.section || '',
            d.location || '',
            d.hierarchy_id || '',
            seedSshPass,
            seedEnablePass,
          ]
        );

        await client.query(
          `INSERT INTO device_placements (id, device_id, building, floor, unit, rack, section, location, hierarchy_id, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO UPDATE SET
             building = EXCLUDED.building,
             floor = EXCLUDED.floor,
             unit = EXCLUDED.unit,
             rack = EXCLUDED.rack,
             section = EXCLUDED.section,
             location = EXCLUDED.location,
             hierarchy_id = EXCLUDED.hierarchy_id,
             updated_at = CURRENT_TIMESTAMP`,
          [
            `placement-${d.id}`,
            d.id,
            d.building || '',
            d.floor || '',
            d.unit || '',
            d.rack || '',
            d.section || '',
            d.location || '',
            d.hierarchy_id || '',
          ]
        );
      }
    }
  } catch (err: any) {
    console.warn('[Database Sync Notice] Devices sync notice:', err.message);
  }

  // 6. Sync Device Groups
  try {
    const devGroupCountRes = await client.query('SELECT count(*) as count FROM device_groups');
    if (parseInt(devGroupCountRes.rows[0]?.count || '0', 10) === 0) {
      const devGroupsToSeed = (initialData.device_groups && initialData.device_groups.length > 0)
        ? initialData.device_groups
        : DEFAULT_DEVICE_GROUPS;
      for (const dg of devGroupsToSeed) {
        await client.query(
          `INSERT INTO device_groups (id, name, description, color, icon, device_ids)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [dg.id, dg.name, dg.description, dg.color, dg.icon, JSON.stringify(dg.deviceIds || dg.device_ids || [])]
        );
      }
    }
  } catch (err: any) {
    console.warn('[Database Sync Notice] Device Groups sync notice:', err.message);
  }

  // 7. Sync Topology Hierarchy
  try {
    const hierCountRes = await client.query('SELECT count(*) as count FROM topology_hierarchy');
    if (parseInt(hierCountRes.rows[0]?.count || '0', 10) === 0) {
      const hierToSeed = (Array.isArray(initialData.topology_hierarchy) && initialData.topology_hierarchy.length > 0)
        ? initialData.topology_hierarchy
        : [];
      for (const h of hierToSeed) {
        await client.query(
          `INSERT INTO topology_hierarchy (id, type, parent_id, name, description, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [h.id, h.type, h.parentId || h.parent_id || null, h.name, h.description, JSON.stringify(h.metadata || {})]
        );
      }
    }
  } catch (err: any) {
    console.warn('[Database Sync Notice] Topology Hierarchy sync notice:', err.message);
  }

  // 8. Sync Node Positions
  try {
    const nodePosCountRes = await client.query('SELECT count(*) as count FROM node_positions');
    if (parseInt(nodePosCountRes.rows[0]?.count || '0', 10) === 0) {
      const defaultPositions = (initialData.node_positions && initialData.node_positions['default']) || DEFAULT_NODE_POSITIONS['default'];
      for (const [nodeId, coords] of Object.entries(defaultPositions)) {
        await client.query(
          `INSERT INTO node_positions (map_id, node_id, x, y)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (map_id, node_id) DO NOTHING`,
          ['default', nodeId, (coords as any).x, (coords as any).y]
        );
      }
    }
  } catch (err: any) {
    console.warn('[Database Sync Notice] Node Positions sync notice:', err.message);
  }

  // 9. Sync Active Directory Config
  try {
    const adRes = await client.query('SELECT count(*) as count FROM ad_config');
    if (parseInt(adRes.rows[0]?.count || '0', 10) === 0) {
      const adToSeed = initialData.ad_config || DEFAULT_AD_CONFIG;
      await client.query(
        `INSERT INTO ad_config (id, config_data) VALUES ('primary', $1) ON CONFLICT (id) DO NOTHING`,
        [JSON.stringify(adToSeed)]
      );
    }
  } catch (err: any) {
    console.warn('[Database Sync Notice] AD Config sync notice:', err.message);
  }

  // 10. Sync Device Sticky Notes
  try {
    if (Array.isArray(initialData.device_sticky_notes) && initialData.device_sticky_notes.length > 0) {
      for (const n of initialData.device_sticky_notes) {
        if (!n || !n.id || (!n.linkedDeviceId && !n.device_id)) continue;
        await client.query(
          `INSERT INTO device_sticky_notes (id, device_id, title, content, color, x, y, width, view_mode, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO NOTHING`,
          [
            n.id,
            n.linkedDeviceId || n.device_id,
            n.title || '',
            n.content || '',
            n.color || 'yellow',
            Number(n.x) || 100,
            Number(n.y) || 100,
            Number(n.width) || 230,
            n.viewMode || n.view_mode || 'card',
            n.createdAt || n.created_at || new Date().toISOString(),
            n.updatedAt || n.updated_at || new Date().toISOString(),
          ]
        );
      }
    }
  } catch (err: any) {
    console.warn('[Database Sync Notice] Device Sticky Notes sync notice:', err.message);
  }

  // 11. Sync Remote Servers Fleet
  try {
    // Purge any mock servers if present
    await client.query(
      "DELETE FROM remote_servers WHERE id IN ('srv-web-prod01', 'srv-db-master', 'srv-ci-runner', 'srv-dc-corp01', 'srv-app-win01')"
    );
    const srvCountRes = await client.query('SELECT count(*) as count FROM remote_servers');
    if (parseInt(srvCountRes.rows[0]?.count || '0', 10) === 0) {
      const serversToSeed = (Array.isArray(initialData.remote_servers) && initialData.remote_servers.length > 0)
        ? initialData.remote_servers.filter((s: any) => s && !['srv-web-prod01', 'srv-db-master', 'srv-ci-runner', 'srv-dc-corp01', 'srv-app-win01'].includes(s.id))
        : DEFAULT_REMOTE_SERVERS;
      for (const s of serversToSeed) {
        if (!s || !s.id || !s.ip) continue;
        await client.query(
          `INSERT INTO remote_servers (
            id, name, hostname, ip, os_type, os_distro, environment, category, role, tags,
            ssh_port, ssh_username, ssh_password, ssh_key_path, default_shell,
            win_protocol, win_port, win_username, win_password, win_domain, rdp_security,
            status, cpu_cores, ram_gb, disk_gb, uptime_str, location, notes,
            prompt_password_on_connect,
            installed_web_servers, installed_databases, has_apache, has_nginx, has_postgresql, has_mysql,
            created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37)
           ON CONFLICT (id) DO NOTHING`,
          [
            s.id,
            s.name || s.id,
            s.hostname || '',
            s.ip,
            s.os_type || 'linux',
            s.os_distro || (s.os_type === 'windows' ? 'Windows Server 2022' : 'Ubuntu 24.04 LTS'),
            s.environment || 'Production',
            s.category || 'Application Server',
            s.role || 'General Server',
            JSON.stringify(s.tags || []),
            s.ssh_port || 22,
            s.ssh_username || 'root',
            s.ssh_password || '',
            s.ssh_key_path || '',
            s.default_shell || 'bash',
            s.win_protocol || 'rdp',
            s.win_port || 3389,
            s.win_username || 'Administrator',
            s.win_password || '',
            s.win_domain && s.win_domain !== 'CORP.INTERNAL' ? s.win_domain : '',
            s.rdp_security || 'any',
            s.status || 'online',
            s.cpu_cores ?? null,
            s.ram_gb ?? null,
            s.disk_gb ?? null,
            s.uptime_str || '',
            s.location || 'Datacenter A',
            s.notes || '',
            Boolean(s.prompt_password_on_connect),
            JSON.stringify(s.installed_web_servers || []),
            JSON.stringify(s.installed_databases || []),
            Boolean(s.has_apache),
            Boolean(s.has_nginx),
            Boolean(s.has_postgresql),
            Boolean(s.has_mysql),
            s.created_at || new Date().toISOString(),
            s.updated_at || new Date().toISOString()
          ]
        );
      }
    }
  } catch (err: any) {
    console.warn('[Database Sync Notice] Remote Servers sync notice:', err.message);
  }

  // 12. Sync Server Categories
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS server_categories (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(150) NOT NULL UNIQUE,
        name_fa VARCHAR(150),
        description TEXT,
        color VARCHAR(50) DEFAULT 'indigo',
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const catCountRes = await client.query('SELECT count(*) as count FROM server_categories');
    if (parseInt(catCountRes.rows[0]?.count || '0', 10) === 0) {
      const catsToSeed = (Array.isArray(initialData.server_categories) && initialData.server_categories.length > 0)
        ? initialData.server_categories
        : DEFAULT_SERVER_CATEGORIES;
      for (const c of catsToSeed) {
        if (!c || !c.id || !c.name) continue;
        await client.query(
          `INSERT INTO server_categories (
            id, name, name_fa, description, color, is_default, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO NOTHING`,
          [
            c.id,
            c.name,
            c.name_fa || c.name,
            c.description || '',
            c.color || 'indigo',
            Boolean(c.is_default),
            c.created_at || new Date().toISOString(),
            c.updated_at || new Date().toISOString()
          ]
        );
      }
    }
  } catch (err: any) {
    console.warn('[Database Sync Notice] Server Categories sync notice:', err.message);
  }

  // 13. Sync User Password Vault
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_password_vault (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        name VARCHAR(150) NOT NULL,
        username VARCHAR(128),
        encrypted_password TEXT NOT NULL,
        iv VARCHAR(64) NOT NULL,
        tag VARCHAR(64) NOT NULL,
        password_hash VARCHAR(128),
        password_salt VARCHAR(64),
        category VARCHAR(64) DEFAULT 'general',
        target_host VARCHAR(150),
        notes TEXT,
        tags JSONB NOT NULL DEFAULT '[]'::jsonb,
        strength VARCHAR(32) DEFAULT 'strong',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure columns exist on existing table
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE user_password_vault ADD COLUMN IF NOT EXISTS password_hash VARCHAR(128);
        ALTER TABLE user_password_vault ADD COLUMN IF NOT EXISTS password_salt VARCHAR(64);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END $$;
    `);

    if (Array.isArray(initialData.user_password_vault) && initialData.user_password_vault.length > 0) {
      for (const v of initialData.user_password_vault) {
        if (!v || !v.id || !v.user_id) continue;
        await client.query(
          `INSERT INTO user_password_vault (
            id, user_id, name, username, encrypted_password, iv, tag, password_hash, password_salt, category, target_host, notes, tags, strength, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           ON CONFLICT (id) DO NOTHING`,
          [
            v.id,
            v.user_id,
            v.name,
            v.username || '',
            v.encrypted_password,
            v.iv,
            v.tag,
            v.password_hash || '',
            v.password_salt || '',
            v.category || 'general',
            v.target_host || '',
            v.notes || '',
            JSON.stringify(v.tags || []),
            v.strength || 'strong',
            v.created_at || new Date().toISOString(),
            v.updated_at || new Date().toISOString(),
          ]
        );
      }
    }
  } catch (err: any) {
    console.warn('[Database Sync Notice] User Password Vault sync notice:', err.message);
  }

  // 14. Sync Bulk Server Execution Reports & Fleet Audit History
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS bulk_server_reports (
        id VARCHAR(128) PRIMARY KEY,
        job_id VARCHAR(128) NOT NULL,
        template_id VARCHAR(128) NOT NULL,
        template_title VARCHAR(255) NOT NULL,
        template_title_en VARCHAR(255),
        category VARCHAR(100),
        icon VARCHAR(50),
        status VARCHAR(50) NOT NULL,
        operator_user VARCHAR(128) DEFAULT 'Administrator',
        duration_ms INTEGER DEFAULT 0,
        total_servers INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        skipped_count INTEGER DEFAULT 0,
        server_summaries JSONB NOT NULL DEFAULT '[]'::jsonb,
        impact_analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
        parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
        results JSONB NOT NULL DEFAULT '{}'::jsonb,
        logs JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at BIGINT NOT NULL,
        finished_at BIGINT NOT NULL,
        created_at_dt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at_dt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_bulk_server_reports_created ON bulk_server_reports(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_bulk_server_reports_template ON bulk_server_reports(template_id);
      CREATE INDEX IF NOT EXISTS idx_bulk_server_reports_status ON bulk_server_reports(status);
      CREATE INDEX IF NOT EXISTS idx_bulk_server_reports_job_id ON bulk_server_reports(job_id);
    `);

    const countRes = await client.query('SELECT count(*) as count FROM bulk_server_reports');
    if (parseInt(countRes.rows[0]?.count || '0', 10) === 0) {
      const reportsToSeed = (Array.isArray(initialData.bulk_server_reports) && initialData.bulk_server_reports.length > 0)
        ? initialData.bulk_server_reports
        : [];
      for (const r of reportsToSeed) {
        if (!r || !r.id) continue;
        await client.query(
          `INSERT INTO bulk_server_reports (
            id, job_id, template_id, template_title, template_title_en, category, icon,
            status, operator_user, duration_ms, total_servers, success_count, failed_count, skipped_count,
            server_summaries, impact_analysis, parameters, results, logs, created_at, finished_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
           ON CONFLICT (id) DO NOTHING`,
          [
            r.id,
            r.jobId || r.id,
            r.templateId || 'custom',
            r.templateTitle || 'Bulk Configuration',
            r.templateTitleEn || r.templateTitle || 'Bulk Configuration',
            r.category || 'general',
            r.icon || 'Server',
            r.status || 'completed',
            r.operatorUser || 'Administrator',
            r.durationMs || 0,
            r.totalServers || 0,
            r.successCount || 0,
            r.failedCount || 0,
            r.skippedCount || 0,
            JSON.stringify(r.serverSummaries || []),
            JSON.stringify(r.impactAnalysis || {}),
            JSON.stringify(r.parameters || {}),
            JSON.stringify(r.results || {}),
            JSON.stringify(r.logs || []),
            r.createdAt || Date.now(),
            r.finishedAt || Date.now()
          ]
        );
      }
    }
  } catch (err: any) {
    console.warn('[Database Sync Notice] Bulk Server Reports sync notice:', err.message);
  }

  // 16. Sync Config Templates (Network Equipment Configuration Templates & Patterns)
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS config_templates (
        id VARCHAR(128) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        vendor VARCHAR(64) NOT NULL DEFAULT 'cisco',
        target_type VARCHAR(64) NOT NULL DEFAULT 'switch',
        target_platform VARCHAR(64),
        category VARCHAR(64),
        role VARCHAR(128) DEFAULT 'Access Switch',
        description TEXT,
        default_cli_mode VARCHAR(64) DEFAULT 'GLOBAL_CONFIG',
        commands TEXT NOT NULL DEFAULT '',
        variables JSONB NOT NULL DEFAULT '[]'::jsonb,
        author VARCHAR(128) DEFAULT 'Network Administrator',
        is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const tmplCountRes = await client.query('SELECT count(*) as count FROM config_templates');
    if (parseInt(tmplCountRes.rows[0]?.count || '0', 10) === 0) {
      const tmplsToSeed = (Array.isArray(initialData.config_templates) && initialData.config_templates.length > 0)
        ? initialData.config_templates
        : [];
      for (const t of tmplsToSeed) {
        if (!t || !t.id || !t.name) continue;
        await client.query(
          `INSERT INTO config_templates (
            id, name, vendor, target_type, target_platform, category, role, description,
            default_cli_mode, commands, variables, author, is_builtin, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           ON CONFLICT (id) DO NOTHING`,
          [
            t.id,
            t.name,
            t.vendor || 'cisco',
            t.target_type || 'switch',
            t.target_platform || null,
            t.category || null,
            t.role || 'Access Switch',
            t.description || '',
            t.default_cli_mode || 'GLOBAL_CONFIG',
            t.commands || '',
            JSON.stringify(t.variables || []),
            t.author || 'Network Administrator',
            Boolean(t.is_builtin),
            t.created_at || new Date().toISOString(),
            t.updated_at || new Date().toISOString()
          ]
        );
      }
    }
  } catch (err: any) {
    console.warn('[Database Sync Notice] Config Templates sync notice:', err.message);
  }
}


/**
 * Initialize PostgreSQL connection pool and run migration if needed
 */
export async function initDatabase(): Promise<void> {
  // Ensure fallback store exists and is thoroughly populated first
  const initialData = loadFallbackStore();
  saveFallbackStore(initialData);

  // Attempt PostgreSQL initialization
  try {
    const config = getDbConfig();
    pool = new Pool(config);
    pool.on('error', (err) => {
      console.error('[PostgreSQL Pool Unexpected Error]', err);
      isPostgresReady = false;
    });

    const client = await pool.connect();
    console.log(`[Database] Successfully connected to PostgreSQL server on ${(config as any).host}:${(config as any).port}/${(config as any).database}`);

    // Read and run schema.sql statement by statement safely
    try {
      const schemaPath = path.join(process.cwd(), 'backend', 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const sql = fs.readFileSync(schemaPath, 'utf-8');
        const statements = sql
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && !s.startsWith('--'));

        for (const statement of statements) {
          try {
            await client.query(statement);
          } catch (stmtErr: any) {
            // Ignore benign notices (e.g. relation already exists, extension privileges)
            if (
              !stmtErr.message.includes('already exists') &&
              !stmtErr.message.includes('extension') &&
              !stmtErr.message.includes('duplicate')
            ) {
              console.warn('[Database Schema Notice]', stmtErr.message);
            }
          }
        }
        console.log('[Database] PostgreSQL schema verification and migration completed.');
      }
    } catch (schemaErr: any) {
      console.warn('[Database Schema Warning]', schemaErr.message);
    }

    try {
      await client.query('ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS prompt_password_on_connect BOOLEAN DEFAULT FALSE');
      await client.query("ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS win_password TEXT DEFAULT ''");
      await client.query("ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS rdp_security VARCHAR(16) DEFAULT 'any'");
      await client.query("ALTER TABLE remote_servers ALTER COLUMN win_domain SET DEFAULT ''");
      await client.query("UPDATE remote_servers SET win_domain = '' WHERE win_domain = 'CORP.INTERNAL'");
      await client.query("ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS installed_web_servers JSONB NOT NULL DEFAULT '[]'::jsonb");
      await client.query("ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS installed_databases JSONB NOT NULL DEFAULT '[]'::jsonb");
      await client.query('ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS has_apache BOOLEAN DEFAULT FALSE');
      await client.query('ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS has_nginx BOOLEAN DEFAULT FALSE');
      await client.query('ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS has_postgresql BOOLEAN DEFAULT FALSE');
      await client.query('ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS has_mysql BOOLEAN DEFAULT FALSE');
      await client.query('ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS postgres_port INT DEFAULT 5432');
      await client.query("ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS postgres_user VARCHAR(64) DEFAULT 'postgres'");
      await client.query("ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS postgres_password TEXT DEFAULT ''");
      await client.query("ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS postgres_database VARCHAR(64) DEFAULT 'postgres'");
      await client.query("ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS server_type VARCHAR(32) DEFAULT 'linux'");
      await client.query("ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS mysql_port INT DEFAULT 3306");
      await client.query("ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS mysql_user VARCHAR(64) DEFAULT 'root'");
      await client.query("ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS mysql_password TEXT DEFAULT ''");
      await client.query("ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS mysql_database VARCHAR(64) DEFAULT 'mysql'");
      await client.query("ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS web_http_port INT DEFAULT 80");
      await client.query("ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS web_https_port INT DEFAULT 443");
      await client.query("ALTER TABLE device_groups ADD COLUMN IF NOT EXISTS server_ids JSONB DEFAULT '[]'::jsonb");
      await client.query("ALTER TABLE device_groups ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP");
      await client.query("ALTER TABLE device_groups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP");
      await client.query("ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS ssh_vault_item_id VARCHAR(64)");
      await client.query("ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS win_vault_item_id VARCHAR(64)");
      await client.query("ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS db_vault_item_id VARCHAR(64)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_remote_servers_ssh_vault ON remote_servers(ssh_vault_item_id)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_remote_servers_win_vault ON remote_servers(win_vault_item_id)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_remote_servers_db_vault ON remote_servers(db_vault_item_id)");
      await client.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS ssh_version VARCHAR(32) DEFAULT 'legacy'");
      await client.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS building VARCHAR(128)");
      await client.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS floor VARCHAR(128)");
      await client.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS unit VARCHAR(128)");
      await client.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS rack VARCHAR(128)");
      await client.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS section VARCHAR(128)");
      await client.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS location VARCHAR(128)");
      await client.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS hierarchy_id VARCHAR(64)");
      await client.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS ssh_password TEXT");
      await client.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS enable_password TEXT");
      await client.query("ALTER TABLE devices ALTER COLUMN ssh_password TYPE TEXT");
      await client.query("ALTER TABLE devices ALTER COLUMN enable_password TYPE TEXT");
      await client.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS ssh_vault_item_id VARCHAR(64)");
      await client.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS enable_vault_item_id VARCHAR(64)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_devices_ssh_vault ON devices(ssh_vault_item_id)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_devices_enable_vault ON devices(enable_vault_item_id)");
      await client.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_enabled BOOLEAN DEFAULT FALSE");
      await client.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_version VARCHAR(16) DEFAULT 'v2c'");
      await client.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_port INT DEFAULT 161");
      await client.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_community VARCHAR(255)");
      await client.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_community_vault_item_id VARCHAR(64)");
      await client.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_v3_user VARCHAR(128)");
      await client.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_v3_security_level VARCHAR(32) DEFAULT 'authPriv'");
      await client.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_v3_auth_protocol VARCHAR(32) DEFAULT 'SHA-256'");
      await client.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_v3_auth_password VARCHAR(255)");
      await client.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_v3_auth_vault_item_id VARCHAR(64)");
      await client.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_v3_priv_protocol VARCHAR(32) DEFAULT 'AES-128'");
      await client.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_v3_priv_password VARCHAR(255)");
      await client.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_v3_priv_vault_item_id VARCHAR(64)");
      await client.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_v3_context VARCHAR(128)");
      await client.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_timeout INT DEFAULT 5000");
      await client.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS snmp_retries INT DEFAULT 1");
      await client.query("CREATE INDEX IF NOT EXISTS idx_devices_snmp_comm_vault ON devices(snmp_community_vault_item_id)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_devices_snmp_auth_vault ON devices(snmp_v3_auth_vault_item_id)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_devices_snmp_priv_vault ON devices(snmp_v3_priv_vault_item_id)");
      await client.query(`
        CREATE TABLE IF NOT EXISTS device_placements (
          id VARCHAR(64) PRIMARY KEY,
          device_id VARCHAR(64) NOT NULL,
          building VARCHAR(128),
          floor VARCHAR(128),
          unit VARCHAR(128),
          rack VARCHAR(128),
          section VARCHAR(128),
          hierarchy_id VARCHAR(64),
          position_u INT,
          notes TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query("CREATE INDEX IF NOT EXISTS idx_device_placements_device ON device_placements(device_id)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_device_placements_bldg ON device_placements(building)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_device_placements_floor ON device_placements(floor)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_device_placements_rack ON device_placements(rack)");

      // 14. Sync Panel General Settings
      await client.query(`
        CREATE TABLE IF NOT EXISTS panel_general_settings (
          id VARCHAR(64) PRIMARY KEY,
          settings JSONB NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_by VARCHAR(128)
        )
      `);

      // 15. Scheduled Backup Jobs
      await client.query(`
        CREATE TABLE IF NOT EXISTS scheduled_backup_jobs (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(128) NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          schedule_type VARCHAR(32) NOT NULL DEFAULT 'daily',
          run_time VARCHAR(16) DEFAULT '02:00',
          days_of_week JSONB DEFAULT '[0,1,2,3,4,5,6]'::jsonb,
          interval_minutes INT DEFAULT 1440,
          scope VARCHAR(64) NOT NULL DEFAULT 'full',
          encrypt BOOLEAN NOT NULL DEFAULT FALSE,
          passphrase TEXT DEFAULT '',
          sanitize BOOLEAN NOT NULL DEFAULT FALSE,
          retention_count INT NOT NULL DEFAULT 10,
          retention_days INT NOT NULL DEFAULT 30,
          last_run_at TIMESTAMP WITH TIME ZONE,
          next_run_at TIMESTAMP WITH TIME ZONE,
          last_status VARCHAR(32) DEFAULT 'idle',
          last_result_details TEXT,
          last_backup_file VARCHAR(255),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query("CREATE INDEX IF NOT EXISTS idx_backup_jobs_enabled ON scheduled_backup_jobs(enabled)");

      // 16. Outgoing Mail (SMTP) Config
      await client.query(`
        CREATE TABLE IF NOT EXISTS email_config (
          id VARCHAR(64) PRIMARY KEY,
          config_data JSONB NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_by VARCHAR(128)
        )
      `);

      // 17. Automated Audit & Command Logs Scheduled Reporting Config
      await client.query(`
        CREATE TABLE IF NOT EXISTS audit_report_schedule (
          id VARCHAR(64) PRIMARY KEY,
          config_data JSONB NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_by VARCHAR(128)
        )
      `);

      // 18. Two-Factor Authentication Challenges
      await client.query(`
        CREATE TABLE IF NOT EXISTS two_factor_challenges (
          token VARCHAR(128) PRIMARY KEY,
          user_id VARCHAR(64) NOT NULL,
          username VARCHAR(64) NOT NULL,
          user_email VARCHAR(128) NOT NULL,
          code_hash VARCHAR(128) NOT NULL,
          code_salt VARCHAR(64) NOT NULL,
          effective_policy JSONB,
          remember_me BOOLEAN DEFAULT FALSE,
          attempts INT DEFAULT 0,
          max_attempts INT DEFAULT 5,
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query("CREATE INDEX IF NOT EXISTS idx_two_factor_token ON two_factor_challenges(token)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_two_factor_expires ON two_factor_challenges(expires_at)");

      // 19. Persistent System Security Keychain & Master Encryption Keys
      await client.query(`
        CREATE TABLE IF NOT EXISTS system_security_keys (
          key_name VARCHAR(64) PRIMARY KEY,
          master_key TEXT NOT NULL,
          legacy_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } catch {}

    // Synchronize all fallback records into PostgreSQL
    await syncFallbackToPostgres(client, initialData);
    console.log('[Database] Fallback store synchronization to PostgreSQL completed successfully.');

    // Initialize or load authoritative security keychain from PostgreSQL
    await initOrLoadSystemSecurityKeys(client);

    // Auto-migrate legacy device credentials to PostgreSQL AES-256-GCM storage
    await migrateLegacyDeviceCredentialsToPostgres(client);

    client.release();
    isPostgresReady = true;
    lastError = null;
  } catch (err: any) {
    isPostgresReady = false;
    lastError = err.message || 'PostgreSQL not available';
    console.warn(`[Database Notice] PostgreSQL is not reachable (${lastError}). Using robust file-backed store for persistence.`);
    await initOrLoadSystemSecurityKeys();
    await migrateLegacyDeviceCredentialsToPostgres();
  }
}

/**
 * Decrypts legacy Fernet tokens (enc:fernet:...) using candidate keys
 */
export function decryptFernetToken(encrypted: string): string {
  if (!encrypted || typeof encrypted !== 'string' || !encrypted.startsWith('enc:fernet:')) {
    return encrypted;
  }
  const tokenStr = encrypted.replace(/^enc:fernet:/, '');
  try {
    const raw = Buffer.from(tokenStr.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (raw.length < 57) return encrypted;

    const candidateKeys: Buffer[] = [];

    const envKey = process.env.NETTOP_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
    if (envKey) {
      try {
        const b = Buffer.from(envKey.trim().replace(/-/g, '+').replace(/_/g, '/'), 'base64');
        if (b.length === 32) candidateKeys.push(b);
      } catch {}
    }

    const keyPath = path.resolve(process.cwd(), 'backend', 'security', '.secret.key');
    if (fs.existsSync(keyPath)) {
      try {
        const rawKey = fs.readFileSync(keyPath, 'utf-8').trim();
        const b = Buffer.from(rawKey.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
        if (b.length === 32) candidateKeys.push(b);
      } catch {}
    }

    const keychain = getCachedSecurityKeychain?.();
    const secrets = [
      keychain?.masterKey,
      process.env.VAULT_SECRET,
      process.env.JWT_SECRET,
      'nettopology_vault_master_key_2026_aes256gcm_safe',
    ];
    for (const s of secrets) {
      if (s && typeof s === 'string') {
        try {
          candidateKeys.push(crypto.createHash('sha256').update(s).digest());
        } catch {}
      }
    }

    const iv = raw.subarray(9, 25);
    const ciphertext = raw.subarray(25, raw.length - 32);

    for (const keyBuffer of candidateKeys) {
      try {
        const encKey = keyBuffer.subarray(16, 32);
        const decipher = crypto.createDecipheriv('aes-128-cbc', encKey, iv);
        decipher.setAutoPadding(true);
        let decrypted = decipher.update(ciphertext, undefined, 'utf-8');
        decrypted += decipher.final('utf-8');
        if (decrypted && decrypted.length > 0) {
          return decrypted;
        }
      } catch {}
    }
  } catch {}
  return encrypted;
}

/**
 * Automatically migrates and self-heals all legacy device credentials (from Fernet, cleartext,
 * network_data.json, and fallback stores) directly into PostgreSQL using AES-256-GCM.
 */
export async function migrateLegacyDeviceCredentialsToPostgres(client?: PoolClient): Promise<{ migrated: number; total: number }> {
  let migrated = 0;
  let total = 0;

  try {
    const jsonDeviceMap = new Map<string, { sshPass?: string; enablePass?: string }>();

    const checkFile = (filePath: string) => {
      try {
        if (fs.existsSync(filePath)) {
          const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          const list = Array.isArray(content.devices) ? content.devices : [];
          for (const d of list) {
            if (d && d.id) {
              const ssh = d.ssh_password || (d.connection && d.connection.password);
              const enable = d.enable_password;
              if (ssh || enable) {
                jsonDeviceMap.set(d.id, { sshPass: ssh, enablePass: enable });
              }
            }
          }
        }
      } catch {}
    };

    checkFile(path.join(process.cwd(), 'backend', 'network_data.json'));
    checkFile(path.join(process.cwd(), 'backend', 'database_store.json'));

    const helperResolvePlain = (pass: string): string => {
      if (!pass || typeof pass !== 'string') return '';
      if (pass.startsWith('enc:v1:')) {
        const meta = decryptServerSecretWithMeta(pass);
        return meta.plainText || '';
      }
      if (pass.startsWith('enc:fernet:')) {
        const dec = decryptFernetToken(pass);
        if (dec && !dec.startsWith('enc:fernet:')) return dec;
      }
      return pass; // cleartext
    };

    const processRecord = (rowId: string, currentSsh: string, currentEnable: string): { newSsh: string; newEnable: string; changed: boolean } => {
      let workingSsh = currentSsh || '';
      let workingEnable = currentEnable || '';
      let changed = false;

      if (!workingSsh && jsonDeviceMap.has(rowId)) {
        const jsonRec = jsonDeviceMap.get(rowId);
        if (jsonRec?.sshPass) workingSsh = jsonRec.sshPass;
      }
      if (!workingEnable && jsonDeviceMap.has(rowId)) {
        const jsonRec = jsonDeviceMap.get(rowId);
        if (jsonRec?.enablePass) workingEnable = jsonRec.enablePass;
      }

      let finalSsh = workingSsh;
      if (workingSsh) {
        if (!workingSsh.startsWith('enc:v1:')) {
          const plain = helperResolvePlain(workingSsh);
          if (plain) {
            finalSsh = encryptServerSecret(plain);
            changed = true;
          }
        } else {
          // Check if encrypted with legacy key, auto-heal to active key
          const meta = decryptServerSecretWithMeta(workingSsh);
          if (meta.isLegacyKey && meta.newEncryptedString) {
            finalSsh = meta.newEncryptedString;
            changed = true;
          }
        }
      }

      let finalEnable = workingEnable;
      if (workingEnable) {
        if (!workingEnable.startsWith('enc:v1:')) {
          const plain = helperResolvePlain(workingEnable);
          if (plain) {
            finalEnable = encryptServerSecret(plain);
            changed = true;
          }
        } else {
          const meta = decryptServerSecretWithMeta(workingEnable);
          if (meta.isLegacyKey && meta.newEncryptedString) {
            finalEnable = meta.newEncryptedString;
            changed = true;
          }
        }
      }

      return { newSsh: finalSsh, newEnable: finalEnable, changed };
    };

    // 1. Process PostgreSQL records if available
    const runPgMigration = async (c: PoolClient) => {
      const res = await c.query('SELECT id, name, ssh_password, enable_password FROM devices');
      total = res.rows.length;

      for (const row of res.rows) {
        const result = processRecord(row.id, row.ssh_password || '', row.enable_password || '');
        if (result.changed) {
          await c.query(
            'UPDATE devices SET ssh_password = $1, enable_password = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
            [result.newSsh || null, result.newEnable || null, row.id]
          );
          migrated++;
        }
      }
    };

    if (client) {
      await runPgMigration(client);
    } else {
      await ensurePostgresConnection();
      if (isPostgresReady && pool) {
        const c = await pool.connect();
        try {
          await runPgMigration(c);
        } finally {
          c.release();
        }
      }
    }

    // 2. Also migrate fallback store records for robust offline operation
    const store = loadFallbackStore();
    if (Array.isArray(store.devices)) {
      let fallbackChanged = false;
      for (const dev of store.devices) {
        const res = processRecord(dev.id, dev.ssh_password || (dev.connection && dev.connection.password) || '', dev.enable_password || '');
        if (res.changed) {
          dev.ssh_password = res.newSsh;
          dev.enable_password = res.newEnable;
          if (dev.connection) {
            dev.connection.password = res.newSsh;
          }
          fallbackChanged = true;
        }
      }
      if (fallbackChanged) {
        saveFallbackStore(store);
      }
    }

    if (migrated > 0) {
      console.log(`[Auto-Migration] Successfully migrated ${migrated}/${total} network devices to PostgreSQL-authoritative AES-256-GCM storage.`);
    }
  } catch (err: any) {
    console.warn('[Auto-Migration Notice] Device credential migration notice:', err.message);
  }

  return { migrated, total };
}

/**
 * Manually trigger bidirectional database sync
 */
export async function syncDatabase(): Promise<DbStatus> {
  const connected = await ensurePostgresConnection();
  if (connected && pool) {
    const client = await pool.connect();
    try {
      const store = loadFallbackStore();
      await syncFallbackToPostgres(client, store);
    } finally {
      client.release();
    }
  }
  return getDbStatus();
}

/**
 * Get current database status and metrics
 */
export async function getDbStatus(): Promise<DbStatus> {
  const cfg = getDbConfig();
  const status: DbStatus = {
    connected: isPostgresReady,
    engine: isPostgresReady ? 'postgresql' : 'fallback_json',
    host: (cfg as any).host || '127.0.0.1',
    port: (cfg as any).port || 5432,
    database: (cfg as any).database || 'nettopology_db',
    user: (cfg as any).user || 'nettopology_user',
    lastChecked: new Date().toISOString(),
    error: lastError,
  };

  if (isPostgresReady && pool) {
    try {
      const client = await pool.connect();
      const tablesRes = await client.query(`
        SELECT count(*) as count FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      const usersRes = await client.query('SELECT count(*) as count FROM users');
      const devicesRes = await client.query('SELECT count(*) as count FROM devices');
      const mapsRes = await client.query('SELECT count(*) as count FROM custom_maps');
      client.release();

      status.tablesCount = parseInt(tablesRes.rows[0]?.count || '0', 10);
      status.usersCount = parseInt(usersRes.rows[0]?.count || '0', 10);
      status.devicesCount = parseInt(devicesRes.rows[0]?.count || '0', 10);
      status.customMapsCount = parseInt(mapsRes.rows[0]?.count || '0', 10);
    } catch (e: any) {
      status.connected = false;
      status.error = e.message;
    }
  } else {
    const store = loadFallbackStore();
    status.tablesCount = 11;
    status.usersCount = store.users.length;
    status.devicesCount = (store.devices || []).length;
    status.customMapsCount = store.custom_maps.length;
  }

  return status;
}

// -------------------------------------------------------------
// Users CRUD
// -------------------------------------------------------------
export async function findUserByUsername(username: string): Promise<any | null> {
  const cleanUser = (username || '').trim().toLowerCase();
  if (!cleanUser) return null;

  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT * FROM users WHERE LOWER(username) = $1 LIMIT 1', [cleanUser]);
      if (res.rows.length > 0) return res.rows[0];
    } catch (e) {
      console.error('[DB Query Error in findUserByUsername]', e);
    }
  }

  const store = loadFallbackStore();
  return (
    store.users.find(
      (u) => u && typeof u.username === 'string' && u.username.toLowerCase() === cleanUser
    ) || null
  );
}

export async function findUserById(id: string): Promise<any | null> {
  const cleanId = (id || '').trim();
  if (!cleanId) return null;

  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [cleanId]);
      if (res.rows.length > 0) return res.rows[0];
    } catch (e) {
      console.error('[DB Query Error in findUserById]', e);
    }
  }

  const store = loadFallbackStore();
  return (
    store.users.find(
      (u) => u && typeof u.id === 'string' && u.id === cleanId
    ) || null
  );
}

export async function getAllUsers(): Promise<any[]> {
  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT id, username, full_name, email, role, user_type, status, group_ids, is_builtin, last_login, created_at FROM users ORDER BY created_at ASC');
      if (res.rows.length > 0) {
        return res.rows.map((r) => ({
          id: r.id,
          username: r.username,
          fullName: r.full_name,
          email: r.email,
          role: r.role,
          userType: r.user_type,
          status: r.status,
          groupIds: typeof r.group_ids === 'string' ? JSON.parse(r.group_ids) : r.group_ids,
          isBuiltin: r.is_builtin,
          lastLogin: r.last_login,
          createdAt: r.created_at,
        }));
      } else {
        // If PostgreSQL is connected but users table is empty, auto-sync from fallback store!
        const client = await pool.connect();
        try {
          const store = loadFallbackStore();
          await syncFallbackToPostgres(client, store);
          const secondRes = await client.query('SELECT id, username, full_name, email, role, user_type, status, group_ids, is_builtin, last_login, created_at FROM users ORDER BY created_at ASC');
          if (secondRes.rows.length > 0) {
            return secondRes.rows.map((r) => ({
              id: r.id,
              username: r.username,
              fullName: r.full_name,
              email: r.email,
              role: r.role,
              userType: r.user_type,
              status: r.status,
              groupIds: typeof r.group_ids === 'string' ? JSON.parse(r.group_ids) : r.group_ids,
              isBuiltin: r.is_builtin,
              lastLogin: r.last_login,
              createdAt: r.created_at,
            }));
          }
        } finally {
          client.release();
        }
      }
    } catch (e) {
      console.error('[DB Query Error in getAllUsers]', e);
    }
  }

  const store = loadFallbackStore();
  return store.users
    .filter((u) => u && typeof u.username === 'string' && u.username.trim().length > 0)
    .map((u) => ({
      id: u.id,
      username: u.username,
      fullName: u.full_name,
      email: u.email,
      role: u.role,
      userType: u.user_type,
      status: u.status,
      groupIds: u.group_ids || [],
      isBuiltin: u.is_builtin,
      lastLogin: u.last_login,
      createdAt: u.created_at,
    }));
}

export async function saveUser(userData: any): Promise<any> {
  if (!userData || typeof userData !== 'object') {
    throw new Error('Invalid user payload: Expected an object');
  }

  const rawUsername = (userData.username || '').trim();
  if (!rawUsername) {
    throw new Error('Username is required and cannot be empty');
  }

  const store = loadFallbackStore();
  const cleanUser = rawUsername.toLowerCase();
  const existingIndex = store.users.findIndex(
    (u) =>
      u &&
      typeof u.username === 'string' &&
      ((userData.id && u.id === userData.id) || u.username.toLowerCase() === cleanUser)
  );

  const hasNewPassword = Boolean(userData.password && String(userData.password).trim().length > 0);
  let newPasswordHash: string | undefined;
  let newPasswordSalt: string | undefined;
  if (hasNewPassword) {
    const p = hashPassword(String(userData.password).trim());
    newPasswordHash = p.hash;
    newPasswordSalt = p.salt;
  }

  let userRecord: any;
  if (existingIndex >= 0) {
    const prev = store.users[existingIndex];
    userRecord = {
      ...prev,
      username: rawUsername,
      password_hash: hasNewPassword ? newPasswordHash : prev.password_hash,
      password_salt: hasNewPassword ? newPasswordSalt : prev.password_salt,
      full_name: (userData.fullName || prev.full_name || rawUsername).trim(),
      email: (userData.email || prev.email || `${cleanUser}@nettopology.internal`).trim(),
      role: userData.role || prev.role || 'NOC Analyst',
      user_type: userData.userType || prev.user_type || 'local',
      status: userData.status || prev.status || 'active',
      group_ids: Array.isArray(userData.groupIds) ? userData.groupIds : (prev.group_ids || []),
      is_builtin: prev.is_builtin ?? Boolean(userData.isBuiltin),
      updated_at: new Date().toISOString(),
    };
  } else {
    // New user creation
    const plainPassword = hasNewPassword ? String(userData.password).trim() : 'welcome123';
    const p = hasNewPassword ? { hash: newPasswordHash!, salt: newPasswordSalt! } : hashPassword(plainPassword);
    userRecord = {
      id: userData.id || `user-${Date.now()}`,
      username: rawUsername,
      password_hash: p.hash,
      password_salt: p.salt,
      full_name: (userData.fullName || rawUsername).trim(),
      email: (userData.email || `${cleanUser}@nettopology.internal`).trim(),
      role: userData.role || 'NOC Analyst',
      user_type: userData.userType || 'local',
      status: userData.status || 'active',
      group_ids: Array.isArray(userData.groupIds) ? userData.groupIds : [],
      is_builtin: Boolean(userData.isBuiltin),
      last_login: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  // Update fallback store immediately
  if (existingIndex >= 0) {
    store.users[existingIndex] = { ...store.users[existingIndex], ...userRecord };
  } else {
    store.users.push(userRecord);
  }
  saveFallbackStore(store);

  // Persist to PostgreSQL with robust UPSERT
  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      const checkRes = await pool.query(
        'SELECT id, password_hash, password_salt FROM users WHERE LOWER(username) = LOWER($1) OR id = $2 LIMIT 1',
        [userRecord.username, userRecord.id]
      );

      if (checkRes.rows.length > 0) {
        const matchedId = checkRes.rows[0].id;
        const existingRow = checkRes.rows[0];
        userRecord.id = matchedId;

        if (!hasNewPassword && existingRow.password_hash) {
          // Keep database password hash authoritative when editing profile without new password
          userRecord.password_hash = existingRow.password_hash;
          userRecord.password_salt = existingRow.password_salt;
          if (existingIndex >= 0) {
            store.users[existingIndex].password_hash = existingRow.password_hash;
            store.users[existingIndex].password_salt = existingRow.password_salt;
            saveFallbackStore(store);
          }
        }

        if (hasNewPassword) {
          await pool.query(
            `UPDATE users SET
               username = $1,
               password_hash = $2,
               password_salt = $3,
               full_name = $4,
               email = $5,
               role = $6,
               user_type = $7,
               status = $8,
               group_ids = $9,
               is_builtin = $10,
               updated_at = CURRENT_TIMESTAMP
             WHERE id = $11`,
            [
              userRecord.username,
              userRecord.password_hash,
              userRecord.password_salt,
              userRecord.full_name,
              userRecord.email,
              userRecord.role,
              userRecord.user_type,
              userRecord.status,
              JSON.stringify(userRecord.group_ids),
              userRecord.is_builtin,
              matchedId,
            ]
          );
          console.log(`[Database] Successfully updated user credentials and profile for "${userRecord.username}" (ID: ${matchedId}) in PostgreSQL.`);
        } else {
          await pool.query(
            `UPDATE users SET
               username = $1,
               full_name = $2,
               email = $3,
               role = $4,
               user_type = $5,
               status = $6,
               group_ids = $7,
               is_builtin = $8,
               updated_at = CURRENT_TIMESTAMP
             WHERE id = $9`,
            [
              userRecord.username,
              userRecord.full_name,
              userRecord.email,
              userRecord.role,
              userRecord.user_type,
              userRecord.status,
              JSON.stringify(userRecord.group_ids),
              userRecord.is_builtin,
              matchedId,
            ]
          );
          console.log(`[Database] Successfully updated user profile "${userRecord.username}" (ID: ${matchedId}) in PostgreSQL.`);
        }
      } else {
        await pool.query(
          `INSERT INTO users (id, username, password_hash, password_salt, full_name, email, role, user_type, status, group_ids, is_builtin, last_login, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (id) DO UPDATE SET
             username = EXCLUDED.username,
             password_hash = EXCLUDED.password_hash,
             password_salt = EXCLUDED.password_salt,
             full_name = EXCLUDED.full_name,
             email = EXCLUDED.email,
             role = EXCLUDED.role,
             user_type = EXCLUDED.user_type,
             status = EXCLUDED.status,
             group_ids = EXCLUDED.group_ids,
             updated_at = EXCLUDED.updated_at`,
          [
            userRecord.id,
            userRecord.username,
            userRecord.password_hash,
            userRecord.password_salt,
            userRecord.full_name,
            userRecord.email,
            userRecord.role,
            userRecord.user_type,
            userRecord.status,
            JSON.stringify(userRecord.group_ids),
            userRecord.is_builtin,
            userRecord.last_login,
            userRecord.created_at,
            userRecord.updated_at,
          ]
        );
        console.log(`[Database] Successfully created new user "${userRecord.username}" in PostgreSQL users table.`);
      }
    } catch (e) {
      console.error('[DB Query Error in saveUser]', e);
    }
  }

  return {
    id: userRecord.id,
    username: userRecord.username,
    fullName: userRecord.full_name,
    email: userRecord.email,
    role: userRecord.role,
    userType: userRecord.user_type,
    status: userRecord.status,
    groupIds: userRecord.group_ids,
    isBuiltin: userRecord.is_builtin,
    lastLogin: userRecord.last_login,
    createdAt: userRecord.created_at,
    updatedAt: userRecord.updated_at,
  };
}

export async function saveUsersBatch(usersList: any[]): Promise<any[]> {
  if (!Array.isArray(usersList)) return [];
  const results: any[] = [];
  for (const item of usersList) {
    if (!item || typeof item !== 'object' || !item.username) continue;
    try {
      // Stripping password field to ensure batch updates never overwrite existing credentials
      const itemToSave = { ...item };
      delete itemToSave.password;
      const saved = await saveUser(itemToSave);
      results.push(saved);
    } catch (err) {
      console.error('[DB saveUsersBatch item error]', err);
    }
  }
  return results;
}

export async function deleteUser(userIdOrUsername: string): Promise<boolean> {
  const target = (userIdOrUsername || '').trim().toLowerCase();
  if (!target || target === 'user-admin' || target === 'admin') {
    return false; // Root administrator cannot be deleted
  }

  const store = loadFallbackStore();
  const index = store.users.findIndex(
    (u) =>
      u &&
      typeof u.username === 'string' &&
      (u.id.toLowerCase() === target || u.username.toLowerCase() === target)
  );

  let deleted = false;
  if (index >= 0) {
    const deletedUser = store.users[index];
    if (deletedUser.is_builtin || deletedUser.username.toLowerCase() === 'admin') {
      return false;
    }
    store.users.splice(index, 1);
    saveFallbackStore(store);
    deleted = true;
  }

  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      await pool.query('DELETE FROM users WHERE LOWER(id) = $1 OR LOWER(username) = $1', [target]);
      console.log(`[Database] Successfully deleted user "${target}" from PostgreSQL.`);
      deleted = true;
    } catch (e) {
      console.error('[DB Query Error in deleteUser]', e);
    }
  }

  return deleted;
}

export async function updateLastLogin(userId: string): Promise<void> {
  const now = new Date().toISOString();
  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      await pool.query('UPDATE users SET last_login = $1 WHERE id = $2', [now, userId]);
    } catch (e) {
      console.error('[DB Query Error in updateLastLogin]', e);
    }
  }
  const store = loadFallbackStore();
  const user = store.users.find((u) => u.id === userId);
  if (user) {
    user.last_login = now;
    saveFallbackStore(store);
  }
}

// -------------------------------------------------------------
// Custom Maps with Granular Access Control (Public, Private, Restricted)
// -------------------------------------------------------------
export interface MapUserFilter {
  userId?: string;
  username?: string;
  role?: string;
  groups?: string[];
}

export async function getCustomMaps(userFilter?: MapUserFilter): Promise<any[]> {
  let allMaps: any[] = [];
  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT * FROM custom_maps ORDER BY created_at ASC');
      if (res.rows.length === 0) {
        // If connected but table is empty, auto-sync from fallback store
        const client = await pool.connect();
        try {
          const store = loadFallbackStore();
          await syncFallbackToPostgres(client, store);
          const secondRes = await client.query('SELECT * FROM custom_maps ORDER BY created_at ASC');
          res.rows = secondRes.rows;
        } finally {
          client.release();
        }
      }

      allMaps = res.rows.map((r) => {
        const rawMapData = typeof r.map_data === 'string' ? JSON.parse(r.map_data) : (r.map_data || {});
        const allowedUsers = Array.isArray(r.allowed_users)
          ? r.allowed_users
          : (typeof r.allowed_users === 'string' ? JSON.parse(r.allowed_users) : (rawMapData.allowedUsers || []));

        return {
          devicePositions: rawMapData.devicePositions || (typeof r.nodes === 'string' ? JSON.parse(r.nodes) : r.nodes) || {},
          physicalPositions: rawMapData.physicalPositions || {},
          deviceIds: rawMapData.deviceIds || [],
          links: rawMapData.links || (typeof r.connections === 'string' ? JSON.parse(r.connections) : r.connections) || [],
          racks: rawMapData.racks || [],
          towers: rawMapData.towers || [],
          stickyNotes: rawMapData.stickyNotes || [],
          deviceDisplayModes: rawMapData.deviceDisplayModes || {},
          ...rawMapData,
          id: r.id,
          name: r.name,
          description: r.description,
          type: r.map_type || rawMapData.type || 'schematic',
          createdAt: r.created_at ? new Date(r.created_at).toISOString() : (rawMapData.createdAt || new Date().toISOString()),
          updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : (rawMapData.updatedAt || new Date().toISOString()),
          visibility: r.visibility || rawMapData.visibility || 'public',
          ownerId: r.owner_id || rawMapData.ownerId || 'user-admin',
          ownerName: r.owner_name || rawMapData.ownerName || 'admin',
          allowedUsers,
        };
      });
    } catch (e) {
      console.error('[DB Query Error in getCustomMaps]', e);
      allMaps = loadFallbackStore().custom_maps || [];
    }
  } else {
    allMaps = loadFallbackStore().custom_maps || [];
  }

  allMaps = (allMaps || []).filter(
    (m) =>
      m &&
      m.id !== 'map-enterprise-core' &&
      !m.name?.includes('ستون‌فقرات') &&
      !m.name?.includes('ستون فقرات')
  );

  // Synchronize sticky notes from device_sticky_notes table into custom maps
  try {
    const dbNotes = await getDeviceStickyNotes();
    if (Array.isArray(dbNotes) && dbNotes.length > 0) {
      const notesByDev = new Map<string, any>();
      for (const dn of dbNotes) {
        if (dn.linkedDeviceId) {
          notesByDev.set(dn.linkedDeviceId, dn);
          notesByDev.set(dn.linkedDeviceId.replace(/^hw-/, ''), dn);
          notesByDev.set('hw-' + dn.linkedDeviceId.replace(/^hw-/, ''), dn);
        }
        if (dn.id) notesByDev.set(dn.id, dn);
      }

      for (const m of allMaps) {
        const currentNotes = Array.isArray(m.stickyNotes) ? m.stickyNotes : [];
        const existingNoteIds = new Set<string>();

        const mergedNotes = currentNotes.map((sn: any) => {
          const match =
            (sn.linkedDeviceId && notesByDev.get(sn.linkedDeviceId)) ||
            notesByDev.get(sn.id);
          if (match) {
            existingNoteIds.add(match.id);
            if (match.linkedDeviceId) existingNoteIds.add(match.linkedDeviceId);
            return {
              ...sn,
              id: match.id || sn.id,
              title: match.title,
              content: match.content,
              color: match.color || sn.color,
              updatedAt: match.updatedAt || sn.updatedAt,
            };
          }
          return sn;
        });

        // If map contains a device that has a sticky note in DB, ensure it is attached
        const devIds: string[] = Array.isArray(m.deviceIds) ? m.deviceIds : Object.keys(m.devicePositions || {});
        for (const dId of devIds) {
          const match = notesByDev.get(dId);
          if (match && !existingNoteIds.has(match.id) && !existingNoteIds.has(dId)) {
            const devPos = m.devicePositions?.[dId] || { x: 200, y: 150 };
            mergedNotes.push({
              ...match,
              x: (devPos.x || 200) + 80,
              y: (devPos.y || 150) + 40,
            });
            existingNoteIds.add(match.id);
            existingNoteIds.add(dId);
          }
        }

        m.stickyNotes = mergedNotes;
      }
    }
  } catch (syncErr) {
    console.warn('[Custom Maps Note Sync Notice]', syncErr);
  }

  // If no user filter supplied, return all maps
  if (!userFilter || !userFilter.username) {
    return allMaps;
  }

  const currentRole = (userFilter.role || '').toLowerCase();
  const currentUsername = (userFilter.username || '').toLowerCase();
  const currentUserId = userFilter.userId || '';

  // Super Admin can view all maps
  if (currentRole.includes('super admin') || currentRole.includes('admin') || currentUsername === 'admin') {
    return allMaps;
  }

  // Filter based on map privacy
  return allMaps.filter((map) => {
    const visibility = map.visibility || 'public';
    // 1. Public map: visible to all authenticated users
    if (visibility === 'public') {
      return true;
    }

    // 2. Private map: visible only to creator/owner
    const isOwner =
      (currentUserId && map.ownerId === currentUserId) ||
      (currentUsername && (map.ownerName || '').toLowerCase() === currentUsername);
    if (visibility === 'private') {
      return isOwner;
    }

    // 3. Restricted map: visible to owner + specified users or groups
    if (visibility === 'restricted') {
      if (isOwner) return true;
      const allowed = Array.isArray(map.allowedUsers) ? map.allowedUsers : [];
      return allowed.some((target: string) => {
        if (!target) return false;
        const cleanTarget = target.trim().toLowerCase();
        // Direct match with username or user ID
        if (cleanTarget === currentUsername || (currentUserId && cleanTarget === currentUserId.toLowerCase())) {
          return true;
        }
        // Match user's assigned group memberships (Active Directory or local security groups)
        if (Array.isArray(userFilter.groups)) {
          return userFilter.groups.some((g: string) => {
            if (!g) return false;
            const cleanG = g.trim().toLowerCase();
            return (
              cleanG === cleanTarget ||
              cleanTarget.includes(cleanG) ||
              cleanG.includes(cleanTarget)
            );
          });
        }
        return false;
      });
    }

    return true;
  });
}

export async function saveCustomMaps(maps: any[], currentUser?: any): Promise<void> {
  // Normalize each map with required fields
  const normalizedMaps = maps.map((m) => {
    const ownerId = m.ownerId || (currentUser?.userId ? currentUser.userId : 'user-admin');
    const ownerName = m.ownerName || (currentUser?.username ? currentUser.username : 'admin');
    const visibility = m.visibility || 'public';
    const allowedUsers = Array.isArray(m.allowedUsers) ? m.allowedUsers : [];

    return {
      ...m,
      ownerId,
      ownerName,
      visibility,
      allowedUsers,
      updatedAt: new Date().toISOString(),
    };
  });

  const store = loadFallbackStore();
  store.custom_maps = normalizedMaps;
  saveFallbackStore(store);

  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const m of normalizedMaps) {
        await client.query(
          `INSERT INTO custom_maps (
             id, name, description, map_type, building_id, floor_id, unit_id, rack_id,
             nodes, connections, viewport, metadata, visibility, owner_id, owner_name, allowed_users, map_data, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             map_type = EXCLUDED.map_type,
             building_id = EXCLUDED.building_id,
             floor_id = EXCLUDED.floor_id,
             unit_id = EXCLUDED.unit_id,
             rack_id = EXCLUDED.rack_id,
             nodes = EXCLUDED.nodes,
             connections = EXCLUDED.connections,
             viewport = EXCLUDED.viewport,
             metadata = EXCLUDED.metadata,
             visibility = EXCLUDED.visibility,
             owner_id = EXCLUDED.owner_id,
             owner_name = EXCLUDED.owner_name,
             allowed_users = EXCLUDED.allowed_users,
             map_data = EXCLUDED.map_data,
             updated_at = EXCLUDED.updated_at`,
          [
            m.id,
            m.name || 'Untitled Map',
            m.description || '',
            m.type || m.map_type || 'schematic',
            m.buildingId || m.building_id || null,
            m.floorId || m.floor_id || null,
            m.unitId || m.unit_id || null,
            m.rackId || m.rack_id || null,
            JSON.stringify(m.devicePositions || m.nodes || {}),
            JSON.stringify(m.links || m.connections || []),
            JSON.stringify(m.viewport || { zoom: 1, pan: { x: 0, y: 0 } }),
            JSON.stringify(m.metadata || {}),
            m.visibility || 'public',
            m.ownerId || m.owner_id || 'user-admin',
            m.ownerName || m.owner_name || 'admin',
            JSON.stringify(m.allowedUsers || m.allowed_users || []),
            JSON.stringify(m),
            m.createdAt || m.created_at ? new Date(m.createdAt || m.created_at) : new Date(),
            new Date(),
          ]
        );
      }
      await client.query('COMMIT');
      console.log(`[Database] Successfully persisted ${normalizedMaps.length} custom maps to PostgreSQL.`);
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('[DB Query Error in saveCustomMaps]', e);
    } finally {
      client.release();
    }
  }
}

export async function deleteCustomMap(mapId: string): Promise<boolean> {
  if (!mapId) return false;
  const store = loadFallbackStore();
  let deleted = false;
  const idx = (store.custom_maps || []).findIndex((m) => m.id === mapId);
  if (idx >= 0) {
    store.custom_maps.splice(idx, 1);
    saveFallbackStore(store);
    deleted = true;
  }

  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      await pool.query('DELETE FROM custom_maps WHERE id = $1', [mapId]);
      console.log(`[Database] Successfully deleted custom map "${mapId}" from PostgreSQL.`);
      deleted = true;
    } catch (e) {
      console.error('[DB Query Error in deleteCustomMap]', e);
    }
  }
  return deleted;
}

// -------------------------------------------------------------
// Node Canvas Coordinates (Default & Custom Maps)
// -------------------------------------------------------------
export async function getNodePositions(mapId: string = 'default'): Promise<Record<string, { x: number; y: number }>> {
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT node_id, x, y FROM node_positions WHERE map_id = $1', [mapId]);
      const mapPos: Record<string, { x: number; y: number }> = {};
      for (const row of res.rows) {
        mapPos[row.node_id] = { x: parseFloat(row.x), y: parseFloat(row.y) };
      }
      if (Object.keys(mapPos).length > 0) {
        return mapPos;
      }
    } catch (e) {
      console.error('[DB Query Error]', e);
    }
  }

  const store = loadFallbackStore();
  return (store.node_positions && store.node_positions[mapId]) || {};
}

export async function saveNodePositions(
  mapId: string = 'default',
  positions: Record<string, { x: number; y: number }>
): Promise<void> {
  const store = loadFallbackStore();
  if (!store.node_positions) store.node_positions = {};
  store.node_positions[mapId] = { ...(store.node_positions[mapId] || {}), ...positions };
  saveFallbackStore(store);

  if (isPostgresReady && pool) {
    try {
      const client = await pool.connect();
      await client.query('BEGIN');
      for (const [nodeId, coords] of Object.entries(positions)) {
        await client.query(
          `INSERT INTO node_positions (map_id, node_id, x, y)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (map_id, node_id) DO UPDATE SET
             x = EXCLUDED.x,
             y = EXCLUDED.y`,
          [mapId, nodeId, coords.x, coords.y]
        );
      }
      await client.query('COMMIT');
      client.release();
    } catch (e) {
      console.error('[DB Query Error]', e);
    }
  }
}

export async function deleteNodePositions(mapId: string = 'default'): Promise<void> {
  const store = loadFallbackStore();
  if (store.node_positions && store.node_positions[mapId]) {
    delete store.node_positions[mapId];
    saveFallbackStore(store);
  }

  if (isPostgresReady && pool) {
    try {
      await pool.query('DELETE FROM node_positions WHERE map_id = $1', [mapId]);
    } catch (e) {
      console.error('[DB Query Error]', e);
    }
  }
}

// -------------------------------------------------------------
// Hierarchy Storage (Buildings, Floors, Units, Racks)
// -------------------------------------------------------------
export async function getHierarchy(): Promise<any[]> {
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT * FROM topology_hierarchy ORDER BY created_at ASC');
      if (res && Array.isArray(res.rows)) {
        return res.rows.map((r) => ({
          id: r.id,
          type: r.type,
          parentId: r.parent_id,
          name: r.name,
          description: r.description,
          metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {}),
        }));
      }
    } catch (e) {
      console.error('[DB Query Error in getHierarchy]', e);
    }
  }
  const store = loadFallbackStore();
  return Array.isArray(store.topology_hierarchy) ? store.topology_hierarchy : [];
}

export async function getCompleteHierarchy(): Promise<{
  nodes: any[];
  structured: PhysicalHierarchyStructured;
}> {
  const nodes = await getHierarchy();
  let structured: PhysicalHierarchyStructured;

  if (isPostgresReady && pool) {
    structured = convertHierarchyNodesToStructured(nodes);
  } else {
    const store = loadFallbackStore();
    if (store.physical_hierarchy && Array.isArray(store.physical_hierarchy.buildings)) {
      structured = {
        buildings: store.physical_hierarchy.buildings,
        floors: store.physical_hierarchy.floors || {},
        units: store.physical_hierarchy.units || {},
        racks: store.physical_hierarchy.racks || {},
        sections: store.physical_hierarchy.sections || {},
      };
    } else {
      structured = convertHierarchyNodesToStructured(nodes);
    }
  }

  return { nodes, structured };
}

export async function saveHierarchy(payload: any): Promise<{
  nodes: any[];
  structured: PhysicalHierarchyStructured;
}> {
  const store = loadFallbackStore();
  let nodes: any[] = [];
  let structured: PhysicalHierarchyStructured;

  if (Array.isArray(payload)) {
    nodes = payload;
    structured = convertHierarchyNodesToStructured(nodes);
  } else if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.hierarchy) && !payload.buildings) {
      nodes = payload.hierarchy;
      structured = convertHierarchyNodesToStructured(nodes);
    } else {
      const bSet = new Set<string>(Array.isArray(payload.buildings) ? payload.buildings : []);
      const fMap: Record<string, string[]> = payload.floors && typeof payload.floors === 'object' ? { ...payload.floors } : {};
      const uMap: Record<string, string[]> = payload.units && typeof payload.units === 'object' ? { ...payload.units } : {};
      const rMap: Record<string, string[]> = payload.racks && typeof payload.racks === 'object' ? { ...payload.racks } : {};
      const sMap: Record<string, string[]> = payload.sections && typeof payload.sections === 'object' ? { ...payload.sections } : {};

      // Auto-populate missing buildings and floors from unit and rack keys
      for (const map of [uMap, rMap, sMap]) {
        for (const key of Object.keys(map)) {
          const [b, f] = key.split(':::');
          if (b) bSet.add(b);
          if (b && f) {
            if (!fMap[b]) fMap[b] = [];
            if (!fMap[b].includes(f)) fMap[b].push(f);
          }
        }
      }

      structured = {
        buildings: Array.from(bSet),
        floors: fMap,
        units: uMap,
        racks: rMap,
        sections: sMap,
      };
      const currentNodes = Array.isArray(store.topology_hierarchy) ? store.topology_hierarchy : [];
      nodes = convertStructuredToHierarchyNodes(structured, currentNodes);
    }
  } else {
    nodes = [];
    structured = {
      buildings: [],
      floors: {},
      units: {},
      racks: {},
      sections: {},
    };
  }

  store.topology_hierarchy = nodes;
  store.physical_hierarchy = structured;
  saveFallbackStore(store);

  if (isPostgresReady && pool) {
    try {
      const client = await pool.connect();
      await client.query('BEGIN');
      await client.query('DELETE FROM topology_hierarchy');
      for (const item of nodes) {
        await client.query(
          `INSERT INTO topology_hierarchy (id, type, parent_id, name, description, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            item.id,
            item.type,
            item.parentId || item.parent_id || null,
            item.name,
            item.description || '',
            JSON.stringify(item.metadata || {}),
          ]
        );
      }
      await client.query('COMMIT');
      client.release();
    } catch (e) {
      console.error('[DB Query Error in saveHierarchy]', e);
    }
  }

  return { nodes, structured };
}

export async function getDevicePlacements(): Promise<DevicePlacementRecord[]> {
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT * FROM device_placements ORDER BY building ASC, floor ASC, rack ASC');
      if (res && Array.isArray(res.rows)) {
        return res.rows.map((r) => ({
          id: r.id,
          device_id: r.device_id,
          building: r.building || '',
          floor: r.floor || '',
          unit: r.unit || '',
          rack: r.rack || '',
          section: r.section || '',
          location: r.location || '',
          hierarchy_id: r.hierarchy_id || '',
          position_u: r.position_u ? Number(r.position_u) : undefined,
          notes: r.notes || '',
          created_at: r.created_at,
          updated_at: r.updated_at,
        }));
      }
    } catch (e) {
      console.warn('[DB Query Notice in getDevicePlacements]', e);
    }
  }

  const allDevices = await getAllDevices();
  return allDevices
    .filter((d) => d.building || d.floor || d.unit || d.rack)
    .map((d) => ({
      id: `placement-${d.id}`,
      device_id: d.id,
      building: d.building || '',
      floor: d.floor || '',
      unit: d.unit || '',
      rack: d.rack || '',
      section: d.section || '',
      location: d.location || '',
      hierarchy_id: d.hierarchy_id || '',
      position_u: d.position_u || undefined,
      notes: d.notes || '',
      updated_at: new Date().toISOString(),
    }));
}

export async function updateDevicePlacement(
  deviceId: string,
  placement: Partial<DevicePlacementRecord>
): Promise<any> {
  return await updateDevice(deviceId, placement);
}

// -------------------------------------------------------------
// User Groups
// -------------------------------------------------------------
export async function getUserGroups(): Promise<any[]> {
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT * FROM user_groups ORDER BY created_at ASC');
      return res.rows.map((r) => {
        const rawMembers = typeof r.member_user_ids === 'string'
          ? JSON.parse(r.member_user_ids || '[]')
          : (r.member_user_ids || []);
        return {
          id: r.id,
          name: r.name,
          description: r.description || '',
          color: r.color || 'indigo',
          memberUserIds: rawMembers,
          member_user_ids: rawMembers,
          isBuiltin: Boolean(r.is_builtin),
          createdAt: r.created_at,
          updatedAt: r.updated_at || r.created_at,
        };
      });
    } catch (e) {
      console.error('[DB Query Error]', e);
    }
  }
  const fallback = loadFallbackStore().user_groups || [];
  return fallback.map((r: any) => {
    const rawMembers = Array.isArray(r.memberUserIds)
      ? r.memberUserIds
      : (Array.isArray(r.member_user_ids) ? r.member_user_ids : []);
    return {
      id: r.id,
      name: r.name,
      description: r.description || '',
      color: r.color || 'indigo',
      memberUserIds: rawMembers,
      member_user_ids: rawMembers,
      isBuiltin: Boolean(r.is_builtin || r.isBuiltin),
      createdAt: r.created_at || r.createdAt,
      updatedAt: r.updated_at || r.updatedAt,
    };
  });
}

export async function saveUserGroups(groups: any[]): Promise<void> {
  const normalized = (groups || []).map((g: any) => {
    const rawMembers = Array.isArray(g.memberUserIds)
      ? g.memberUserIds
      : (Array.isArray(g.member_user_ids) ? g.member_user_ids : []);
    return {
      id: g.id,
      name: g.name,
      description: g.description || '',
      color: g.color || 'indigo',
      memberUserIds: rawMembers,
      member_user_ids: rawMembers,
      isBuiltin: Boolean(g.isBuiltin ?? g.is_builtin ?? false),
      createdAt: g.createdAt || g.created_at || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });

  const store = loadFallbackStore();
  store.user_groups = normalized;
  saveFallbackStore(store);

  if (isPostgresReady && pool) {
    try {
      const client = await pool.connect();
      await client.query('BEGIN');
      await client.query('DELETE FROM user_groups');
      for (const g of normalized) {
        await client.query(
          `INSERT INTO user_groups (id, name, description, color, member_user_ids, is_builtin, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            g.id,
            g.name,
            g.description,
            g.color,
            JSON.stringify(g.memberUserIds),
            g.isBuiltin,
            g.createdAt,
            g.updatedAt,
          ]
        );
      }
      await client.query('COMMIT');
      client.release();
    } catch (e) {
      console.error('[DB Query Error]', e);
    }
  }
}

// -------------------------------------------------------------
// Access Policies (RBAC)
// -------------------------------------------------------------
export async function getAccessPolicies(): Promise<any[]> {
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT * FROM access_policies ORDER BY priority ASC, created_at ASC');
      return res.rows.map((r) => {
        const pData = typeof r.policy_data === 'string' ? JSON.parse(r.policy_data) : (r.policy_data || {});
        const defaultPerms = pData.defaultServerPermissions || (
          r.id === 'policy-super-admin' || (r.priority || 0) >= 100
            ? { terminal: true, file_explorer: true, server_management: true, web_management: true, database_management: true, power_control: true, edit_properties: true, delete_server: true }
            : r.id === 'policy-noc-observer'
            ? { terminal: false, file_explorer: false, server_management: true, web_management: true, database_management: true, power_control: false, edit_properties: false, delete_server: false }
            : { terminal: false, file_explorer: true, server_management: true, web_management: false, database_management: false, power_control: false, edit_properties: false, delete_server: false }
        );
        const defaultDevicePerms = pData.defaultDevicePermissions || (
          r.id === 'policy-super-admin' || (r.priority || 0) >= 100
            ? { web_configs: true, terminal: true, apply_template: true, device_note: true, edit_properties: true, ping_keepalive: true, inspect_ports: true, write_memory: true, delete_device: true, port_power: true, port_mode: true, port_vlan: true, port_security: true, port_description: true, port_bridge: true, port_speed: true, port_cable_test: true }
            : r.id === 'policy-noc-observer'
            ? { web_configs: true, terminal: false, apply_template: false, device_note: true, edit_properties: false, ping_keepalive: true, inspect_ports: true, write_memory: false, delete_device: false, port_power: false, port_mode: false, port_vlan: false, port_security: false, port_description: false, port_bridge: false, port_speed: false, port_cable_test: true }
            : { web_configs: true, terminal: false, apply_template: false, device_note: true, edit_properties: false, ping_keepalive: true, inspect_ports: true, write_memory: false, delete_device: false, port_power: false, port_mode: false, port_vlan: false, port_security: false, port_description: false, port_bridge: false, port_speed: false, port_cable_test: true }
        );
        const isSuper = r.id === 'policy-super-admin' || (r.priority || 0) >= 100;
        const canCheck = pData.canCheckUpdate !== undefined ? Boolean(pData.canCheckUpdate) : isSuper;
        const canPerform = pData.canPerformUpdate !== undefined ? Boolean(pData.canPerformUpdate) : isSuper;
        return {
          id: r.id,
          name: r.name,
          description: r.description,
          priority: r.priority,
          isBuiltin: r.is_builtin,
          ...pData,
          canCheckUpdate: canCheck,
          canPerformUpdate: canPerform,
          defaultServerPermissions: defaultPerms,
          perServerPermissions: pData.perServerPermissions || {},
          defaultDevicePermissions: defaultDevicePerms,
          perDevicePermissions: pData.perDevicePermissions || {},
        };
      });
    } catch (e) {
      console.error('[DB Query Error in getAccessPolicies]', e);
    }
  }
  const fallback = loadFallbackStore().access_policies || [];
  return fallback.map((p: any) => {
    const pData = p.policy_data && typeof p.policy_data === 'object' ? p.policy_data : {};
    const defaultPerms = p.defaultServerPermissions || pData.defaultServerPermissions || (
      p.id === 'policy-super-admin' || (p.priority || 0) >= 100
        ? { terminal: true, file_explorer: true, server_management: true, web_management: true, database_management: true, power_control: true, edit_properties: true, delete_server: true }
        : p.id === 'policy-noc-observer'
        ? { terminal: false, file_explorer: false, server_management: true, web_management: true, database_management: true, power_control: false, edit_properties: false, delete_server: false }
        : { terminal: false, file_explorer: true, server_management: true, web_management: false, database_management: false, power_control: false, edit_properties: false, delete_server: false }
    );
    const defaultDevicePerms = p.defaultDevicePermissions || pData.defaultDevicePermissions || (
      p.id === 'policy-super-admin' || (p.priority || 0) >= 100
        ? { web_configs: true, terminal: true, apply_template: true, device_note: true, edit_properties: true, ping_keepalive: true, inspect_ports: true, write_memory: true, delete_device: true, port_power: true, port_mode: true, port_vlan: true, port_security: true, port_description: true, port_bridge: true, port_speed: true, port_cable_test: true }
        : p.id === 'policy-noc-observer'
        ? { web_configs: true, terminal: false, apply_template: false, device_note: true, edit_properties: false, ping_keepalive: true, inspect_ports: true, write_memory: false, delete_device: false, port_power: false, port_mode: false, port_vlan: false, port_security: false, port_description: false, port_bridge: false, port_speed: false, port_cable_test: true }
        : { web_configs: true, terminal: false, apply_template: false, device_note: true, edit_properties: false, ping_keepalive: true, inspect_ports: true, write_memory: false, delete_device: false, port_power: false, port_mode: false, port_vlan: false, port_security: false, port_description: false, port_bridge: false, port_speed: false, port_cable_test: true }
    );
    const isSuper = p.id === 'policy-super-admin' || (p.priority || 0) >= 100;
    const canCheck = p.canCheckUpdate !== undefined ? Boolean(p.canCheckUpdate) : (pData.canCheckUpdate !== undefined ? Boolean(pData.canCheckUpdate) : isSuper);
    const canPerform = p.canPerformUpdate !== undefined ? Boolean(p.canPerformUpdate) : (pData.canPerformUpdate !== undefined ? Boolean(pData.canPerformUpdate) : isSuper);
    return {
      ...p,
      ...pData,
      canCheckUpdate: canCheck,
      canPerformUpdate: canPerform,
      defaultServerPermissions: defaultPerms,
      perServerPermissions: p.perServerPermissions || pData.perServerPermissions || {},
      defaultDevicePermissions: defaultDevicePerms,
      perDevicePermissions: p.perDevicePermissions || pData.perDevicePermissions || {},
    };
  });
}

export async function saveAccessPolicies(policies: any[]): Promise<void> {
  const store = loadFallbackStore();
  store.access_policies = policies;
  saveFallbackStore(store);

  if (isPostgresReady && pool) {
    try {
      const client = await pool.connect();
      await client.query('BEGIN');
      await client.query('DELETE FROM access_policies');
      for (const p of policies) {
        const { id, name, description, priority, isBuiltin, is_builtin, ...rest } = p;
        await client.query(
          `INSERT INTO access_policies (id, name, description, priority, is_builtin, policy_data)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, name, description, priority || 100, isBuiltin ?? is_builtin ?? false, JSON.stringify(rest)]
        );
      }
      await client.query('COMMIT');
      client.release();
    } catch (e) {
      console.error('[DB Query Error in saveAccessPolicies]', e);
    }
  }
}

export async function deleteAccessPolicy(policyId: string): Promise<boolean> {
  const cleanId = (policyId || '').trim();
  if (!cleanId) return false;
  if (cleanId === 'policy-super-admin') return false; // Root superadmin policy is protected

  const store = loadFallbackStore();
  store.access_policies = (store.access_policies || []).filter((p: any) => p.id !== cleanId);
  saveFallbackStore(store);

  if (isPostgresReady && pool) {
    try {
      await pool.query('DELETE FROM access_policies WHERE id = $1', [cleanId]);
      return true;
    } catch (e) {
      console.error('[DB Query Error in deleteAccessPolicy]', e);
    }
  }
  return true;
}

export interface AuthorizedMapSubject {
  id: string;
  rawId: string;
  name: string;
  displayName: string;
  type: 'local_user' | 'ad_user' | 'ad_group' | 'local_group';
  role?: string;
  policyName?: string;
  policyId?: string;
  badge: string;
  badge_fa: string;
  secondaryText?: string;
  email?: string;
  department?: string;
  memberCount?: number;
}

export async function getAuthorizedMapSubjects(): Promise<{
  success: boolean;
  subjects: AuthorizedMapSubject[];
  categories: {
    localUsers: AuthorizedMapSubject[];
    adUsers: AuthorizedMapSubject[];
    adGroups: AuthorizedMapSubject[];
    localGroups: AuthorizedMapSubject[];
  };
  count: number;
}> {
  // 1. Local Users from PostgreSQL/Fallback
  const localUsersList = await getAllUsers();
  const activeLocalUsers = localUsersList.filter((u) => u && u.status !== 'disabled');
  const localUsers: AuthorizedMapSubject[] = activeLocalUsers.map((u) => ({
    id: (u.username || '').toLowerCase(),
    rawId: u.id,
    name: u.username,
    displayName: u.fullName ? `${u.fullName} (${u.username})` : u.username,
    type: 'local_user',
    role: u.role || 'Operator',
    badge: 'Local User',
    badge_fa: 'کاربر محلی',
    policyName: u.role || 'Local User',
    secondaryText: u.email || `${u.username}@nettopology.internal`,
    email: u.email,
  }));

  // 2. Active Directory Users and Groups with assigned policies in database
  const policies = await getAccessPolicies();
  const adConfig = await getActiveDirectoryConfig();
  const syncedUsers: any[] = Array.isArray(adConfig?.syncedUsers) ? adConfig.syncedUsers : [];
  const syncedGroups: any[] = Array.isArray(adConfig?.syncedGroups) ? adConfig.syncedGroups : [];

  // Filter AD users that have an assigned policy
  const adUserPolicies = policies.filter(
    (p: any) => p && p.subjectType === 'ad_user' && p.subjectId && p.id !== 'policy-guest'
  );
  const adUsers: AuthorizedMapSubject[] = adUserPolicies.map((p: any) => {
    const rawSubject = (p.subjectId || '').trim();
    const cleanSubject = rawSubject.toLowerCase();
    const foundSynced = syncedUsers.find(
      (u) =>
        u.samAccountName?.toLowerCase() === cleanSubject ||
        u.dn?.toLowerCase() === cleanSubject ||
        u.email?.toLowerCase() === cleanSubject
    );

    const displayName = foundSynced?.displayName
      ? `${foundSynced.displayName} (${foundSynced.samAccountName || rawSubject})`
      : p.subjectName || rawSubject;

    return {
      id: (foundSynced?.samAccountName || rawSubject).toLowerCase(),
      rawId: rawSubject,
      name: foundSynced?.samAccountName || rawSubject,
      displayName,
      type: 'ad_user',
      role: p.name,
      badge: 'AD User (Policy)',
      badge_fa: 'کاربر اکتیو دایرکتوری (دارای پالیسی)',
      policyName: p.name,
      policyId: p.id,
      secondaryText: foundSynced?.email || p.name,
      email: foundSynced?.email,
      department: foundSynced?.department,
    };
  });

  // Filter AD groups that have an assigned policy
  const adGroupPolicies = policies.filter(
    (p: any) => p && p.subjectType === 'ad_group' && p.subjectId && p.id !== 'policy-guest'
  );
  const adGroups: AuthorizedMapSubject[] = adGroupPolicies.map((p: any) => {
    const rawSubject = (p.subjectId || '').trim();
    const cleanSubject = rawSubject.toLowerCase();
    const foundSynced = syncedGroups.find(
      (g) => g.dn?.toLowerCase() === cleanSubject || g.cn?.toLowerCase() === cleanSubject
    );

    const groupCn = foundSynced?.cn || (p.subjectName
      ? p.subjectName.replace(/\s*\(Active Directory\)\s*$/, '').trim()
      : rawSubject.includes('CN=')
      ? rawSubject.match(/CN=([^,]+)/i)?.[1] || rawSubject
      : rawSubject);

    return {
      id: groupCn.toLowerCase(),
      rawId: rawSubject,
      name: groupCn,
      displayName: foundSynced?.cn ? `${foundSynced.cn} (Active Directory)` : p.subjectName || `${groupCn} (AD Group)`,
      type: 'ad_group',
      role: p.name,
      badge: 'AD Group (Policy)',
      badge_fa: 'گروه اکتیو دایرکتوری (دارای پالیسی)',
      policyName: p.name,
      policyId: p.id,
      secondaryText: p.name,
      memberCount: Array.isArray(foundSynced?.members) ? foundSynced.members.length : undefined,
    };
  });

  // 3. Local User Groups
  const rawLocalGroups = await getUserGroups();
  const localGroups: AuthorizedMapSubject[] = rawLocalGroups.map((g) => ({
    id: (g.name || g.id).toLowerCase(),
    rawId: g.id,
    name: g.name,
    displayName: `${g.name} (Local Group)`,
    type: 'local_group',
    role: g.name,
    badge: 'Local Group',
    badge_fa: 'گروه محلی',
    policyName: g.name,
    secondaryText: g.description || 'Local Group',
    memberCount: Array.isArray(g.memberUserIds || g.member_user_ids)
      ? (g.memberUserIds || g.member_user_ids).length
      : 0,
  }));

  // Combine and deduplicate
  const seenIds = new Set<string>();
  const subjects: AuthorizedMapSubject[] = [];

  for (const item of [...localUsers, ...adUsers, ...adGroups, ...localGroups]) {
    const key = `${item.type}:${item.id}`;
    if (!seenIds.has(key)) {
      seenIds.add(key);
      subjects.push(item);
    }
  }

  return {
    success: true,
    subjects,
    categories: {
      localUsers,
      adUsers,
      adGroups,
      localGroups,
    },
    count: subjects.length,
  };
}

/**
 * Compute the authentic, database-authoritative effective access policy for a user
 * based on PostgreSQL access_policies, user_groups, and role assignments.
 */
export async function getEffectivePolicyForUser(userOrId: any): Promise<any> {
  let user = userOrId;
  if (typeof userOrId === 'string') {
    user = (await findUserById(userOrId)) || (await findUserByUsername(userOrId));
  }

  if (!user) {
    return {
      id: 'policy-guest',
      name: 'Guest / Unauthenticated',
      description: 'Default guest permissions',
      priority: 0,
      subjectType: 'local_user',
      subjectId: 'guest',
      subjectName: 'Guest',
      targetScope: 'all',
      targetGroupIds: [],
      targetDeviceIds: [],
      targetServerIds: [],
      allowedDeviceIds: [],
      allowedServerIds: [],
      canViewDashboard: false,
      canViewTopology: false,
      canViewDevices: false,
      canViewPorts: false,
      canViewScanner: false,
      canViewTemplates: false,
      canViewSettings: false,
      canViewServers: false,
      canViewLogs: false,
      canCheckUpdate: false,
      canPerformUpdate: false,
      terminalAccess: 'none',
      canToggleAdminStatus: false,
      canChangeVlan: false,
      canEditDescription: false,
      canTogglePortSecurity: false,
      canWriteMemory: false,
      canManageDevices: false,
      canApplyTemplates: false,
      canBatchOperate: false,
      canExportBackup: false,
      canImportBackup: false,
    };
  }

  const cleanUsername = (user.username || '').trim().toLowerCase();
  const samAccount = cleanUsername.includes('@')
    ? cleanUsername.split('@')[0]
    : cleanUsername.includes('\\')
    ? cleanUsername.split('\\')[1]
    : cleanUsername;
  const userId = (user.id || '').trim();
  const roleName = (user.role || '').trim().toLowerCase();
  const isSuperAdmin = cleanUsername === 'admin' || samAccount === 'admin' || roleName.includes('super admin') || roleName.includes('administrator');

  // Load policies from PostgreSQL (or fallback store)
  const policies = await getAccessPolicies();
  // Load user groups from PostgreSQL (or fallback store)
  const userGroups = await getUserGroups();

  const matchingPolicies: any[] = [];
  const rawGroupIds: string[] = Array.isArray(user.groupIds)
    ? user.groupIds
    : Array.isArray(user.group_ids)
    ? user.group_ids
    : typeof user.group_ids === 'string'
    ? JSON.parse(user.group_ids || '[]')
    : [];

  const rawAdGroups: string[] = Array.isArray(user.groups)
    ? user.groups
    : [];

  const combinedGroupList = [...rawGroupIds, ...rawAdGroups];
  const userGroupSet = new Set(combinedGroupList.map((g) => (g || '').toLowerCase()));

  for (const p of policies) {
    // 1. Direct user match by subjectId (supports username, samAccountName, email, DN, or ID)
    if (
      (p.subjectType === 'local_user' || p.subjectType === 'ad_user') &&
      p.subjectId
    ) {
      const pSub = p.subjectId.toLowerCase();
      if (
        p.subjectId === userId ||
        pSub === cleanUsername ||
        pSub === samAccount ||
        cleanUsername === pSub ||
        (user.email && pSub === user.email.toLowerCase()) ||
        (user.dn && pSub === user.dn.toLowerCase())
      ) {
        matchingPolicies.push(p);
        continue;
      }
    }

    // 2. Direct user group match (supports local group IDs and AD group DN / CN)
    if (p.subjectType === 'local_group' || p.subjectType === 'ad_group') {
      const pSub = (p.subjectId || '').toLowerCase();
      const pSubName = (p.subjectName || '').toLowerCase();

      // Check if user has this group by ID, DN, or CN
      const matchesGroup =
        (pSub && userGroupSet.has(pSub)) ||
        (pSubName && userGroupSet.has(pSubName)) ||
        combinedGroupList.some((g) => {
          const gLower = (g || '').toLowerCase();
          return (
            (pSub && (pSub === gLower || pSub.includes(`cn=${gLower},`) || pSub.endsWith(`cn=${gLower}`))) ||
            (pSubName && (pSubName === gLower || pSubName.includes(gLower)))
          );
        });

      if (matchesGroup) {
        matchingPolicies.push(p);
        continue;
      }

      // Check membership in userGroups
      const matchingGroup = userGroups.find(
        (g: any) =>
          g.id === p.subjectId ||
          (g.name && g.name.toLowerCase() === (p.subjectName || '').toLowerCase())
      );
      if (matchingGroup) {
        const members: string[] = Array.isArray(matchingGroup.memberUserIds)
          ? matchingGroup.memberUserIds
          : Array.isArray(matchingGroup.member_user_ids)
          ? matchingGroup.member_user_ids
          : typeof matchingGroup.member_user_ids === 'string'
          ? JSON.parse(matchingGroup.member_user_ids || '[]')
          : [];
        const lowerMembers = members.map((m) => (m || '').toLowerCase());
        if (
          lowerMembers.includes(userId.toLowerCase()) ||
          lowerMembers.includes(cleanUsername) ||
          lowerMembers.includes(samAccount)
        ) {
          matchingPolicies.push(p);
          continue;
        }
      }
    }

    // 3. Match by user role name if policy subjectName or id matches role
    if (
      roleName &&
      (
        (p.name && p.name.toLowerCase().includes(roleName)) ||
        (p.subjectName && p.subjectName.toLowerCase().includes(roleName)) ||
        (p.id && p.id.toLowerCase().includes(roleName))
      )
    ) {
      matchingPolicies.push(p);
      continue;
    }
  }

  // Helper to calculate database-authoritative allowed device and server IDs
  const enrichWithScope = async (pol: any) => {
    if (!pol) return pol;
    let allowedDeviceIds: string[] | null = null;
    let allowedServerIds: string[] | null = null;

    if (isSuperAdmin || pol.id === 'policy-super-admin') {
      allowedDeviceIds = null;
      allowedServerIds = null;
    } else {
      // 1. Device Scope
      if (pol.targetScope === 'all') {
        allowedDeviceIds = null;
      } else if (pol.targetScope === 'groups') {
        const allDeviceGroups = await getDeviceGroups();
        const targetGroupSet = new Set(
          (pol.targetGroupIds || []).map((id: string) => (id || '').trim().toLowerCase())
        );
        const devSet = new Set<string>();
        for (const g of allDeviceGroups) {
          const gid = (g.id || '').trim().toLowerCase();
          const gname = (g.name || '').trim().toLowerCase();
          if (targetGroupSet.has(gid) || targetGroupSet.has(gname)) {
            const dIds: string[] = Array.isArray(g.deviceIds)
              ? g.deviceIds
              : Array.isArray(g.device_ids)
              ? g.device_ids
              : [];
            dIds.forEach((d) => devSet.add(d));
          }
        }
        allowedDeviceIds = Array.from(devSet);
      } else if (pol.targetScope === 'specific') {
        allowedDeviceIds = Array.isArray(pol.targetDeviceIds) && pol.targetDeviceIds.length > 0
          ? pol.targetDeviceIds
          : (Array.isArray(pol.allowedDeviceIds) ? pol.allowedDeviceIds : []);
      } else {
        allowedDeviceIds = [];
      }

      // 2. Server Fleet Scope
      if (
        pol.targetServerScope === 'specific' ||
        (Array.isArray(pol.targetServerIds) && pol.targetServerIds.length > 0 && pol.targetServerScope !== 'all')
      ) {
        allowedServerIds = Array.isArray(pol.targetServerIds) ? pol.targetServerIds : [];
      } else if (pol.targetServerScope === 'all') {
        allowedServerIds = null;
      } else if (pol.targetScope === 'all') {
        allowedServerIds = null;
      } else if (pol.targetScope === 'groups') {
        const allDeviceGroups = await getDeviceGroups();
        const targetGroupSet = new Set(
          (pol.targetGroupIds || []).map((id: string) => (id || '').trim().toLowerCase())
        );
        const srvSet = new Set<string>();
        for (const g of allDeviceGroups) {
          const gid = (g.id || '').trim().toLowerCase();
          const gname = (g.name || '').trim().toLowerCase();
          if (targetGroupSet.has(gid) || targetGroupSet.has(gname)) {
            const sIds: string[] = Array.isArray(g.serverIds)
              ? g.serverIds
              : Array.isArray(g.server_ids)
              ? g.server_ids
              : [];
            sIds.forEach((s) => srvSet.add(s));
          }
        }
        allowedServerIds = Array.from(srvSet);
      } else if (pol.targetScope === 'specific') {
        allowedServerIds = Array.isArray(pol.targetServerIds) && pol.targetServerIds.length > 0
          ? pol.targetServerIds
          : (Array.isArray(pol.allowedServerIds) ? pol.allowedServerIds : []);
      } else {
        allowedServerIds = [];
      }
    }

    return {
      ...pol,
      allowedDeviceIds,
      allowedServerIds,
    };
  };

  // If specific matching policies found, highest priority wins
  if (matchingPolicies.length > 0) {
    matchingPolicies.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    return await enrichWithScope(matchingPolicies[0]);
  }

  // Super Administrator fallback
  if (isSuperAdmin) {
    const adminPolicy = policies.find((p) => p.id === 'policy-super-admin' || p.id === 'policy-full');
    if (adminPolicy) return await enrichWithScope(adminPolicy);
    return await enrichWithScope({
      id: 'policy-super-admin',
      name: 'Super Administrator',
      description: 'Full unconstrained access',
      priority: 100,
      subjectType: 'local_user',
      subjectId: 'admin',
      subjectName: 'Super Admin',
      targetScope: 'all',
      targetServerScope: 'all',
      targetGroupIds: [],
      targetDeviceIds: [],
      targetServerIds: [],
      canViewDashboard: true,
      canViewTopology: true,
      canViewDevices: true,
      canViewPorts: true,
      canViewScanner: true,
      canViewTemplates: true,
      canViewSettings: true,
      canViewServers: true,
      canAddServer: true,
      canAddDevice: true,
      canViewLogs: true,
      canCheckUpdate: true,
      canPerformUpdate: true,
      terminalAccess: 'full',
      canToggleAdminStatus: true,
      canChangeVlan: true,
      canEditDescription: true,
      canTogglePortSecurity: true,
      canWriteMemory: true,
      canManageDevices: true,
      canApplyTemplates: true,
      canBatchOperate: true,
      canExportBackup: true,
      canImportBackup: true,
      defaultServerPermissions: {
        terminal: true,
        file_explorer: true,
        server_management: true,
        web_management: true,
        database_management: true,
        power_control: true,
        edit_properties: true,
        delete_server: true,
        export_servers: true,
        import_servers: true,
        add_server: true,
      },
      perServerPermissions: {},
      defaultDevicePermissions: {
        web_configs: true,
        terminal: true,
        apply_template: true,
        device_note: true,
        edit_properties: true,
        ping_keepalive: true,
        inspect_ports: true,
        write_memory: true,
        delete_device: true,
        add_device: true,
        port_power: true,
        port_mode: true,
        port_vlan: true,
        port_security: true,
        port_description: true,
        port_bridge: true,
        port_speed: true,
        port_cable_test: true,
      },
      perDevicePermissions: {},
    });
  }

  // Check if role is Helpdesk or Operator
  if (roleName.includes('helpdesk')) {
    const hdPolicy = policies.find((p) => p.id === 'policy-helpdesk');
    if (hdPolicy) return await enrichWithScope(hdPolicy);
  }
  if (roleName.includes('noc') || roleName.includes('operator') || roleName.includes('monitoring')) {
    const nocPolicy = policies.find((p) => p.id === 'policy-noc-observer');
    if (nocPolicy) return await enrichWithScope(nocPolicy);
  }

  // Default non-admin restricted fallback
  return await enrichWithScope({
    id: 'policy-default-restricted',
    name: 'Restricted User',
    description: 'Default safe view access',
    priority: 1,
    subjectType: 'local_user',
    subjectId: userId,
    subjectName: user.username || 'User',
    targetScope: 'all',
    targetGroupIds: [],
    targetDeviceIds: [],
    targetServerIds: [],
    canViewDashboard: true,
    canViewTopology: true,
    canViewDevices: true,
    canViewPorts: false,
    canViewScanner: false,
    canViewTemplates: false,
    canViewSettings: false,
    canViewServers: false,
    canViewLogs: false,
    canCheckUpdate: false,
    canPerformUpdate: false,
    terminalAccess: 'none',
    canToggleAdminStatus: false,
    canChangeVlan: false,
    canEditDescription: false,
    canTogglePortSecurity: false,
    canWriteMemory: false,
    canManageDevices: false,
    canApplyTemplates: false,
    canBatchOperate: false,
    canExportBackup: false,
    canImportBackup: false,
    defaultServerPermissions: {
      terminal: false,
      file_explorer: false,
      server_management: false,
      web_management: false,
      database_management: false,
      power_control: false,
      edit_properties: false,
      delete_server: false,
    },
    perServerPermissions: {},
    defaultDevicePermissions: {
      web_configs: false,
      terminal: false,
      apply_template: false,
      device_note: false,
      edit_properties: false,
      ping_keepalive: false,
      inspect_ports: false,
      write_memory: false,
      delete_device: false,
      port_power: false,
      port_mode: false,
      port_vlan: false,
      port_security: false,
      port_description: false,
      port_bridge: false,
      port_speed: false,
      port_cable_test: false,
    },
    perDevicePermissions: {},
  });
}

/**
 * Universally evaluates whether a specific server action is permitted
 * under a database-authoritative AccessPolicy for a given server.
 */
export function isServerActionPermitted(
  policy: any | null | undefined,
  serverId: string,
  action: string
): boolean {
  if (!policy) return true;

  // 1. If user has no permission to view/manage servers at all
  if (policy.canViewServers === false) {
    return false;
  }

  // 1.1 Fleet-level Add Remote Server action
  if (action === 'add_server') {
    if (policy.defaultServerPermissions?.add_server !== undefined) {
      return Boolean(policy.defaultServerPermissions.add_server);
    }
    if (policy.canAddServer !== undefined) {
      return Boolean(policy.canAddServer);
    }
    return policy.canManageDevices !== false;
  }

  // 2. If policy targets specific groups/servers, ensure target server is in allowed fleet scope
  if (Array.isArray(policy.allowedServerIds) && !policy.allowedServerIds.includes(serverId)) {
    return false;
  }

  // 3. Highest Priority: Granular Per-Server Override Matrix
  if (policy.perServerPermissions && typeof policy.perServerPermissions === 'object') {
    const serverOverrides = policy.perServerPermissions[serverId];
    if (serverOverrides && typeof serverOverrides === 'object') {
      if (typeof serverOverrides[action] === 'boolean') {
        return serverOverrides[action];
      }
    }
  }

  // 4. Default Server Permissions defined in the policy
  if (policy.defaultServerPermissions && typeof policy.defaultServerPermissions === 'object') {
    if (typeof policy.defaultServerPermissions[action] === 'boolean') {
      return policy.defaultServerPermissions[action];
    }
  }

  // 5. Global Policy Scope Fallback (Super Administrator unconstrained access)
  const isSuperAdmin =
    policy.id === 'policy-super-admin' ||
    (policy.targetScope === 'all' && (policy.priority || 0) >= 100);
  if (isSuperAdmin) {
    return true;
  }

  // 6. Safe backward-compatible fallback mapping from general policy flags:
  if (action === 'export_servers') {
    if (policy.canExportServers === false) return false;
    return Boolean(policy.canExportServers || policy.canManageDevices || isSuperAdmin);
  }
  if (action === 'import_servers') {
    if (policy.canImportServers === false) return false;
    return Boolean(policy.canImportServers || policy.canManageDevices || isSuperAdmin);
  }

  // Safe defaults for non-superadmin policies without explicit grants:
  // Dangerous / sensitive actions are blocked by default
  if (
    action === 'delete_server' ||
    action === 'power_control' ||
    action === 'terminal' ||
    action === 'edit_properties'
  ) {
    return false;
  }

  return true;
}

/**
 * Universally evaluates whether a specific network equipment action is permitted
 * under a database-authoritative AccessPolicy for a given network device.
 */
export function isDeviceActionPermitted(
  policy: any | null | undefined,
  deviceId: string,
  action: string
): boolean {
  if (!policy) return true;

  // 1. If user has no permission to view/manage devices at all
  if (policy.canViewDevices === false) {
    return false;
  }

  // 1.1 Inventory-level Add Network Device (Introduce New Device) action
  if (action === 'add_device') {
    if (policy.canAddDevice !== undefined) {
      return Boolean(policy.canAddDevice);
    }
    if (policy.defaultDevicePermissions?.add_device !== undefined) {
      return Boolean(policy.defaultDevicePermissions.add_device);
    }
    return policy.canManageDevices !== false && Boolean(policy.canManageDevices);
  }

  // 2. If policy targets specific groups or devices, ensure target device is in allowed scope
  if (Array.isArray(policy.allowedDeviceIds) && !policy.allowedDeviceIds.includes(deviceId)) {
    return false;
  }

  // 3. Highest Priority: Granular Per-Device Override Matrix
  if (policy.perDevicePermissions && typeof policy.perDevicePermissions === 'object') {
    const deviceOverrides = policy.perDevicePermissions[deviceId];
    if (deviceOverrides && typeof deviceOverrides === 'object') {
      if (typeof deviceOverrides[action] === 'boolean') {
        return deviceOverrides[action];
      }
    }
  }

  // 4. Default Device Permissions defined in the policy
  if (policy.defaultDevicePermissions && typeof policy.defaultDevicePermissions === 'object') {
    if (typeof policy.defaultDevicePermissions[action] === 'boolean') {
      return policy.defaultDevicePermissions[action];
    }
  }

  // 5. Global Policy Scope Fallback (Super Administrator unconstrained access)
  const isSuperAdmin =
    policy.id === 'policy-super-admin' ||
    (policy.targetScope === 'all' && (policy.priority || 0) >= 100);
  if (isSuperAdmin) {
    return true;
  }

  // 6. Safe backward-compatible fallback mapping from general policy flags:
  if (action === 'terminal') {
    return policy.terminalAccess === 'full' || policy.terminalAccess === 'view_only';
  }
  if (action === 'apply_template') {
    return Boolean(policy.canApplyTemplates);
  }
  if (action === 'write_memory') {
    return Boolean(policy.canWriteMemory);
  }
  if (action === 'delete_device' || action === 'edit_properties') {
    return Boolean(policy.canManageDevices);
  }
  if (action === 'export_devices') {
    if (policy.canExportDevices === false) return false;
    return Boolean(policy.canExportDevices || policy.canManageDevices || isSuperAdmin);
  }
  if (action === 'import_devices') {
    if (policy.canImportDevices === false) return false;
    return Boolean(policy.canImportDevices || policy.canManageDevices || isSuperAdmin);
  }

  // Fallback mappings for granular port & interface capabilities:
  if (action === 'port_power') {
    return policy.canToggleAdminStatus !== false && policy.canMikrotikToggleInterface !== false;
  }
  if (action === 'port_mode') {
    return policy.canToggleAdminStatus !== false && policy.canChangeVlan !== false;
  }
  if (action === 'port_vlan') {
    return policy.canChangeVlan !== false && policy.canMikrotikBridgeVlan !== false;
  }
  if (action === 'port_security') {
    return Boolean(policy.canTogglePortSecurity);
  }
  if (action === 'port_description') {
    return policy.canEditDescription !== false && policy.canMikrotikComment !== false;
  }
  if (action === 'port_bridge') {
    return policy.canMikrotikBridgeVlan !== false;
  }
  if (action === 'port_speed') {
    return policy.canMikrotikToggleInterface !== false;
  }
  if (action === 'port_cable_test') {
    return policy.canGenericDiagnostics !== false;
  }

  // Fallback mappings for MikroTik RouterOS capabilities & core services:
  if (action === 'mikrotik_safe_mode') {
    return policy.canMikrotikSafeMode !== false;
  }
  if (action === 'mikrotik_firewall') {
    return policy.canMikrotikFirewall !== false;
  }
  if (action === 'mikrotik_backup') {
    return policy.canMikrotikBackup !== false;
  }
  if (action === 'mikrotik_bridge_vlan') {
    return policy.canMikrotikBridgeVlan !== false;
  }
  if (action === 'mikrotik_toggle_interface') {
    return policy.canMikrotikToggleInterface !== false && policy.canToggleAdminStatus !== false;
  }
  if (action === 'mikrotik_vpn') {
    return policy.canManageDevices !== false;
  }
  if (action === 'mikrotik_comment') {
    return policy.canMikrotikComment !== false && policy.canEditDescription !== false;
  }
  if (action === 'mikrotik_ip_pool') {
    return policy.canMikrotikIpPool !== false;
  }

  // Non-destructive actions (web_configs, ping_keepalive, inspect_ports, device_note)
  return true;
}

// -------------------------------------------------------------
// Database Devices (PostgreSQL-Authoritative Equipment Catalog)
// -------------------------------------------------------------
export async function getAllDevices(): Promise<any[]> {
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT * FROM devices ORDER BY name ASC');
      if (res.rows && res.rows.length > 0) {
        return res.rows.map((r) => {
          let ports = [];
          try {
            ports = typeof r.ports === 'string' ? JSON.parse(r.ports) : (r.ports || []);
          } catch {}
          return {
            id: r.id,
            name: r.name,
            ip: r.ip,
            type: r.type || 'switch',
            model: r.model || '',
            platform: r.platform || 'cisco_ios_xe',
            role: r.role || '',
            connection_mode: r.connection_mode || 'simulator',
            ssh_host: r.ssh_host || r.ip,
            ssh_port: r.ssh_port || 22,
            ssh_username: r.ssh_username || 'admin',
            is_online: r.is_online !== undefined ? Boolean(r.is_online) : true,
            latency_ms: Number(r.latency_ms) || 1.5,
            mac: r.mac_address || '',
            mac_address: r.mac_address || '',
            uptime: r.uptime_str || '',
            uptime_str: r.uptime_str || '',
            ssh_version: r.ssh_version || (r.connection_data && r.connection_data.ssh_version) || 'legacy',
            sshVersion: r.ssh_version || (r.connection_data && r.connection_data.ssh_version) || 'legacy',
            building: r.building || (r.connection_data && r.connection_data.building) || '',
            floor: r.floor || (r.connection_data && r.connection_data.floor) || '',
            unit: r.unit || (r.connection_data && r.connection_data.unit) || '',
            rack: r.rack || (r.connection_data && r.connection_data.rack) || '',
            section: r.section || (r.connection_data && r.connection_data.section) || '',
            location: r.location || '',
            hierarchy_id: r.hierarchy_id || '',
            ssh_vault_item_id: r.ssh_vault_item_id || undefined,
            enable_vault_item_id: r.enable_vault_item_id || undefined,
            ssh_password: r.ssh_password || (r.connection_data && r.connection_data.password) || '',
            ssh_password_set: Boolean(
              (r.ssh_password && String(r.ssh_password).trim().length > 0) ||
              r.ssh_vault_item_id ||
              (r.connection_data && r.connection_data.password && String(r.connection_data.password).trim().length > 0)
            ),
            enable_password: r.enable_password || '',
            enable_password_set: Boolean(
              (r.enable_password && String(r.enable_password).trim().length > 0) ||
              r.enable_vault_item_id
            ),
            snmp_enabled: Boolean(r.snmp_enabled),
            snmp_version: r.snmp_version || 'v2c',
            snmp_port: Number(r.snmp_port) || 161,
            snmp_community: r.snmp_community ? decryptServerSecret(r.snmp_community) : undefined,
            snmp_community_vault_item_id: r.snmp_community_vault_item_id || undefined,
            snmp_v3_user: r.snmp_v3_user || '',
            snmp_v3_security_level: r.snmp_v3_security_level || 'authPriv',
            snmp_v3_auth_protocol: r.snmp_v3_auth_protocol || 'SHA-256',
            snmp_v3_auth_password: r.snmp_v3_auth_password ? decryptServerSecret(r.snmp_v3_auth_password) : undefined,
            snmp_v3_auth_vault_item_id: r.snmp_v3_auth_vault_item_id || undefined,
            snmp_v3_priv_protocol: r.snmp_v3_priv_protocol || 'AES-128',
            snmp_v3_priv_password: r.snmp_v3_priv_password ? decryptServerSecret(r.snmp_v3_priv_password) : undefined,
            snmp_v3_priv_vault_item_id: r.snmp_v3_priv_vault_item_id || undefined,
            snmp_v3_context: r.snmp_v3_context || '',
            snmp_timeout: Number(r.snmp_timeout) || 5000,
            snmp_retries: Number(r.snmp_retries) || 1,
            ports,
          };
        });
      }
    } catch (e) {
      console.error('[DB Query Error in getAllDevices]', e);
    }
  }

  const store = loadFallbackStore();
  if (Array.isArray(store.devices) && store.devices.length > 0) {
    return store.devices.map((d: any) => ({
      ...d,
      ssh_password: d.ssh_password || (d.connection && d.connection.password) || '',
      ssh_password_set: Boolean(
        (d.ssh_password && String(d.ssh_password).trim().length > 0) ||
        d.ssh_vault_item_id ||
        (d.connection && d.connection.password && String(d.connection.password).trim().length > 0)
      ),
      enable_password: d.enable_password || '',
      enable_password_set: Boolean(
        (d.enable_password && String(d.enable_password).trim().length > 0) ||
        d.enable_vault_item_id
      ),
      snmp_community: d.snmp_community ? decryptServerSecret(d.snmp_community) : undefined,
      snmp_v3_auth_password: d.snmp_v3_auth_password ? decryptServerSecret(d.snmp_v3_auth_password) : undefined,
      snmp_v3_priv_password: d.snmp_v3_priv_password ? decryptServerSecret(d.snmp_v3_priv_password) : undefined,
    }));
  }
  return loadInitialDevices().map((d: any) => ({
    ...d,
    ssh_password: d.ssh_password || (d.connection && d.connection.password) || '',
    ssh_password_set: Boolean(
      (d.ssh_password && String(d.ssh_password).trim().length > 0) ||
      d.ssh_vault_item_id ||
      (d.connection && d.connection.password && String(d.connection.password).trim().length > 0)
    ),
    enable_password: d.enable_password || '',
    enable_password_set: Boolean(
      (d.enable_password && String(d.enable_password).trim().length > 0) ||
      d.enable_vault_item_id
    ),
    snmp_community: d.snmp_community ? decryptServerSecret(d.snmp_community) : undefined,
    snmp_v3_auth_password: d.snmp_v3_auth_password ? decryptServerSecret(d.snmp_v3_auth_password) : undefined,
    snmp_v3_priv_password: d.snmp_v3_priv_password ? decryptServerSecret(d.snmp_v3_priv_password) : undefined,
  }));
}

export async function getDeviceById(id: string): Promise<any | null> {
  const all = await getAllDevices();
  return all.find((d) => d.id === id || d.name === id) || null;
}

export async function createDevice(deviceData: any): Promise<any> {
  const store = loadFallbackStore();
  if (!Array.isArray(store.devices)) {
    store.devices = loadInitialDevices();
  }
  const id = (deviceData.id || `dev-${Date.now()}`).trim();
  const rawSshPassword = (deviceData.ssh_password || deviceData.ssh_pass || deviceData.password || (deviceData.connection && deviceData.connection.password) || '').trim();
  const rawEnablePassword = (deviceData.enable_password || deviceData.enable_pass || '').trim();
  const encSshPassword = rawSshPassword ? encryptServerSecret(rawSshPassword) : '';
  const encEnablePassword = rawEnablePassword ? encryptServerSecret(rawEnablePassword) : '';

  const newDevice = {
    ...deviceData,
    id,
    name: (deviceData.name || id).trim(),
    ip: (deviceData.ip || '127.0.0.1').trim(),
    type: deviceData.type || 'switch',
    model: deviceData.model || '',
    platform: deviceData.platform || 'cisco_ios_xe',
    role: deviceData.role || '',
    connection_mode: deviceData.connection_mode || 'simulator',
    ssh_host: deviceData.ssh_host || deviceData.ip || '127.0.0.1',
    ssh_port: Number(deviceData.ssh_port) || 22,
    ssh_username: deviceData.ssh_username || 'admin',
    ssh_password: encSshPassword,
    ssh_password_set: Boolean(encSshPassword || deviceData.ssh_vault_item_id),
    enable_password: encEnablePassword,
    enable_password_set: Boolean(encEnablePassword || deviceData.enable_vault_item_id),
    is_online: deviceData.is_online !== undefined ? Boolean(deviceData.is_online) : true,
    latency_ms: Number(deviceData.latency_ms) || 1.5,
    mac_address: deviceData.mac_address || deviceData.mac || '',
    uptime_str: deviceData.uptime_str || deviceData.uptime || '0 days',
    ssh_version: deviceData.ssh_version || (deviceData.connection && deviceData.connection.ssh_version) || 'legacy',
    ports: Array.isArray(deviceData.ports) ? deviceData.ports : [],
    building: (deviceData.building || '').trim(),
    floor: (deviceData.floor || '').trim(),
    unit: (deviceData.unit || '').trim(),
    rack: (deviceData.rack || '').trim(),
    section: (deviceData.section || '').trim(),
    location: (deviceData.location || '').trim(),
    hierarchy_id: (deviceData.hierarchy_id || deviceData.hierarchyId || '').trim(),
    ssh_vault_item_id: (deviceData.ssh_vault_item_id || '').trim() || undefined,
    enable_vault_item_id: (deviceData.enable_vault_item_id || '').trim() || undefined,
    snmp_enabled: Boolean(deviceData.snmp_enabled),
    snmp_version: deviceData.snmp_version || 'v2c',
    snmp_port: Number(deviceData.snmp_port) || 161,
    snmp_community: deviceData.snmp_community ? encryptServerSecret(deviceData.snmp_community) : undefined,
    snmp_community_vault_item_id: (deviceData.snmp_community_vault_item_id || '').trim() || undefined,
    snmp_v3_user: (deviceData.snmp_v3_user || '').trim(),
    snmp_v3_security_level: deviceData.snmp_v3_security_level || 'authPriv',
    snmp_v3_auth_protocol: deviceData.snmp_v3_auth_protocol || 'SHA-256',
    snmp_v3_auth_password: deviceData.snmp_v3_auth_password ? encryptServerSecret(deviceData.snmp_v3_auth_password) : undefined,
    snmp_v3_auth_vault_item_id: (deviceData.snmp_v3_auth_vault_item_id || '').trim() || undefined,
    snmp_v3_priv_protocol: deviceData.snmp_v3_priv_protocol || 'AES-128',
    snmp_v3_priv_password: deviceData.snmp_v3_priv_password ? encryptServerSecret(deviceData.snmp_v3_priv_password) : undefined,
    snmp_v3_priv_vault_item_id: (deviceData.snmp_v3_priv_vault_item_id || '').trim() || undefined,
    snmp_v3_context: (deviceData.snmp_v3_context || '').trim(),
    snmp_timeout: Number(deviceData.snmp_timeout) || 5000,
    snmp_retries: Number(deviceData.snmp_retries) || 1,
  };

  const existingIdx = store.devices.findIndex((d: any) => d.id === id);
  if (existingIdx >= 0) {
    store.devices[existingIdx] = newDevice;
  } else {
    store.devices.push(newDevice);
  }

  if (!Array.isArray(store.device_placements)) {
    store.device_placements = [];
  }
  const placeIdx = store.device_placements.findIndex((p: any) => p.device_id === id);
  const placementRec: DevicePlacementRecord = {
    id: `placement-${id}`,
    device_id: id,
    building: newDevice.building,
    floor: newDevice.floor,
    unit: newDevice.unit,
    rack: newDevice.rack,
    section: newDevice.section,
    location: newDevice.location,
    hierarchy_id: newDevice.hierarchy_id,
    updated_at: new Date().toISOString(),
  };
  if (placeIdx >= 0) {
    store.device_placements[placeIdx] = placementRec;
  } else {
    store.device_placements.push(placementRec);
  }

  saveFallbackStore(store);

  // Sync to network_data.json
  try {
    const netPath = path.join(process.cwd(), 'backend', 'network_data.json');
    if (fs.existsSync(netPath)) {
      const netData = JSON.parse(fs.readFileSync(netPath, 'utf-8'));
      if (Array.isArray(netData.devices)) {
        const netIdx = netData.devices.findIndex((d: any) => d.id === id);
        if (netIdx >= 0) {
          netData.devices[netIdx] = newDevice;
        } else {
          netData.devices.push(newDevice);
        }
        fs.writeFileSync(netPath, JSON.stringify(netData, null, 2), 'utf-8');
      }
    }
  } catch (err) {
    console.warn('[DB createDevice network_data.json sync notice]', err);
  }

  // PostgreSQL write
  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      await pool.query(
        `INSERT INTO devices (
          id, name, ip, type, model, platform, role, connection_mode, ssh_host, ssh_port, ssh_username,
          is_online, latency_ms, mac_address, uptime_str, ports, ssh_version, building, floor, unit, rack, section, location, hierarchy_id,
          ssh_vault_item_id, enable_vault_item_id,
          snmp_enabled, snmp_version, snmp_port, snmp_community, snmp_community_vault_item_id,
          snmp_v3_user, snmp_v3_security_level, snmp_v3_auth_protocol, snmp_v3_auth_password, snmp_v3_auth_vault_item_id,
          snmp_v3_priv_protocol, snmp_v3_priv_password, snmp_v3_priv_vault_item_id, snmp_v3_context, snmp_timeout, snmp_retries,
          ssh_password, enable_password
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26,
          $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42,
          $43, $44
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          ip = EXCLUDED.ip,
          type = EXCLUDED.type,
          model = EXCLUDED.model,
          platform = EXCLUDED.platform,
          role = EXCLUDED.role,
          connection_mode = EXCLUDED.connection_mode,
          ssh_host = EXCLUDED.ssh_host,
          ssh_port = EXCLUDED.ssh_port,
          ssh_username = EXCLUDED.ssh_username,
          is_online = EXCLUDED.is_online,
          latency_ms = EXCLUDED.latency_ms,
          mac_address = EXCLUDED.mac_address,
          uptime_str = EXCLUDED.uptime_str,
          ports = EXCLUDED.ports,
          ssh_version = EXCLUDED.ssh_version,
          building = EXCLUDED.building,
          floor = EXCLUDED.floor,
          unit = EXCLUDED.unit,
          rack = EXCLUDED.rack,
          section = EXCLUDED.section,
          location = EXCLUDED.location,
          hierarchy_id = EXCLUDED.hierarchy_id,
          ssh_vault_item_id = EXCLUDED.ssh_vault_item_id,
          enable_vault_item_id = EXCLUDED.enable_vault_item_id,
          snmp_enabled = EXCLUDED.snmp_enabled,
          snmp_version = EXCLUDED.snmp_version,
          snmp_port = EXCLUDED.snmp_port,
          snmp_community = EXCLUDED.snmp_community,
          snmp_community_vault_item_id = EXCLUDED.snmp_community_vault_item_id,
          snmp_v3_user = EXCLUDED.snmp_v3_user,
          snmp_v3_security_level = EXCLUDED.snmp_v3_security_level,
          snmp_v3_auth_protocol = EXCLUDED.snmp_v3_auth_protocol,
          snmp_v3_auth_password = EXCLUDED.snmp_v3_auth_password,
          snmp_v3_auth_vault_item_id = EXCLUDED.snmp_v3_auth_vault_item_id,
          snmp_v3_priv_protocol = EXCLUDED.snmp_v3_priv_protocol,
          snmp_v3_priv_password = EXCLUDED.snmp_v3_priv_password,
          snmp_v3_priv_vault_item_id = EXCLUDED.snmp_v3_priv_vault_item_id,
          snmp_v3_context = EXCLUDED.snmp_v3_context,
          snmp_timeout = EXCLUDED.snmp_timeout,
          snmp_retries = EXCLUDED.snmp_retries,
          ssh_password = CASE WHEN EXCLUDED.ssh_password IS NOT NULL AND EXCLUDED.ssh_password <> '' THEN EXCLUDED.ssh_password ELSE devices.ssh_password END,
          enable_password = CASE WHEN EXCLUDED.enable_password IS NOT NULL AND EXCLUDED.enable_password <> '' THEN EXCLUDED.enable_password ELSE devices.enable_password END`,
        [
          newDevice.id,
          newDevice.name,
          newDevice.ip,
          newDevice.type,
          newDevice.model,
          newDevice.platform,
          newDevice.role,
          newDevice.connection_mode,
          newDevice.ssh_host,
          newDevice.ssh_port,
          newDevice.ssh_username,
          newDevice.is_online,
          newDevice.latency_ms,
          newDevice.mac_address,
          newDevice.uptime_str,
          JSON.stringify(newDevice.ports),
          newDevice.ssh_version || 'legacy',
          newDevice.building,
          newDevice.floor,
          newDevice.unit,
          newDevice.rack,
          newDevice.section,
          newDevice.location,
          newDevice.hierarchy_id,
          newDevice.ssh_vault_item_id || null,
          newDevice.enable_vault_item_id || null,
          newDevice.snmp_enabled,
          newDevice.snmp_version,
          newDevice.snmp_port,
          newDevice.snmp_community || null,
          newDevice.snmp_community_vault_item_id || null,
          newDevice.snmp_v3_user || '',
          newDevice.snmp_v3_security_level,
          newDevice.snmp_v3_auth_protocol,
          newDevice.snmp_v3_auth_password || null,
          newDevice.snmp_v3_auth_vault_item_id || null,
          newDevice.snmp_v3_priv_protocol,
          newDevice.snmp_v3_priv_password || null,
          newDevice.snmp_v3_priv_vault_item_id || null,
          newDevice.snmp_v3_context || '',
          newDevice.snmp_timeout,
          newDevice.snmp_retries,
          encSshPassword || null,
          encEnablePassword || null,
        ]
      );

      await pool.query(
        `INSERT INTO device_placements (id, device_id, building, floor, unit, rack, section, location, hierarchy_id, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO UPDATE SET
           building = EXCLUDED.building,
           floor = EXCLUDED.floor,
           unit = EXCLUDED.unit,
           rack = EXCLUDED.rack,
           section = EXCLUDED.section,
           location = EXCLUDED.location,
           hierarchy_id = EXCLUDED.hierarchy_id,
           updated_at = CURRENT_TIMESTAMP`,
        [
          `placement-${newDevice.id}`,
          newDevice.id,
          newDevice.building,
          newDevice.floor,
          newDevice.unit,
          newDevice.rack,
          newDevice.section,
          newDevice.location,
          newDevice.hierarchy_id,
        ]
      );
    } catch (e) {
      console.error('[DB createDevice in PostgreSQL error]', e);
    }
  }

  return newDevice;
}

export async function updateDevice(id: string, updates: any): Promise<any> {
  const cleanId = (id || updates.id || '').trim();
  const existing = await getDeviceById(cleanId);
  if (!existing) return null;

  const incomingSshPass = updates.ssh_password !== undefined
    ? updates.ssh_password
    : (updates.ssh_pass !== undefined
      ? updates.ssh_pass
      : (updates.password !== undefined
        ? updates.password
        : (updates.connection && updates.connection.password)));

  const incomingEnablePass = updates.enable_password !== undefined
    ? updates.enable_password
    : updates.enable_pass;

  let finalSshPassword = existing.ssh_password || '';
  if (incomingSshPass !== undefined && incomingSshPass !== null && String(incomingSshPass).trim().length > 0) {
    finalSshPassword = encryptServerSecret(String(incomingSshPass).trim());
  }

  let finalEnablePassword = existing.enable_password || '';
  if (incomingEnablePass !== undefined && incomingEnablePass !== null && String(incomingEnablePass).trim().length > 0) {
    finalEnablePassword = encryptServerSecret(String(incomingEnablePass).trim());
  }

  const updated = {
    ...existing,
    ...updates,
    id: existing.id,
    name: updates.name !== undefined ? updates.name.trim() : existing.name,
    ip: updates.ip !== undefined ? updates.ip.trim() : existing.ip,
    model: updates.model !== undefined ? updates.model.trim() : existing.model,
    type: updates.type !== undefined ? updates.type : existing.type,
    platform: updates.platform !== undefined ? updates.platform : existing.platform,
    role: updates.role !== undefined ? updates.role.trim() : existing.role,
    ssh_version: updates.ssh_version !== undefined ? updates.ssh_version : (existing.ssh_version || 'legacy'),
    ssh_password: finalSshPassword,
    ssh_password_set: Boolean(finalSshPassword || (updates.ssh_vault_item_id !== undefined ? updates.ssh_vault_item_id : existing.ssh_vault_item_id)),
    enable_password: finalEnablePassword,
    enable_password_set: Boolean(finalEnablePassword || (updates.enable_vault_item_id !== undefined ? updates.enable_vault_item_id : existing.enable_vault_item_id)),
    building: updates.building !== undefined ? updates.building.trim() : (existing.building || ''),
    floor: updates.floor !== undefined ? updates.floor.trim() : (existing.floor || ''),
    unit: updates.unit !== undefined ? updates.unit.trim() : (existing.unit || ''),
    rack: updates.rack !== undefined ? updates.rack.trim() : (existing.rack || ''),
    section: updates.section !== undefined ? updates.section.trim() : (existing.section || ''),
    location: updates.location !== undefined ? updates.location.trim() : (existing.location || ''),
    hierarchy_id: updates.hierarchy_id !== undefined ? updates.hierarchy_id : (existing.hierarchy_id || ''),
    ssh_vault_item_id: updates.ssh_vault_item_id !== undefined ? (updates.ssh_vault_item_id ? updates.ssh_vault_item_id.trim() : null) : existing.ssh_vault_item_id,
    enable_vault_item_id: updates.enable_vault_item_id !== undefined ? (updates.enable_vault_item_id ? updates.enable_vault_item_id.trim() : null) : existing.enable_vault_item_id,
    snmp_enabled: updates.snmp_enabled !== undefined ? Boolean(updates.snmp_enabled) : (existing.snmp_enabled !== undefined ? Boolean(existing.snmp_enabled) : false),
    snmp_version: updates.snmp_version !== undefined ? updates.snmp_version : (existing.snmp_version || 'v2c'),
    snmp_port: updates.snmp_port !== undefined ? Number(updates.snmp_port) : (Number(existing.snmp_port) || 161),
    snmp_community: updates.snmp_community !== undefined ? (updates.snmp_community ? encryptServerSecret(updates.snmp_community) : undefined) : existing.snmp_community,
    snmp_community_vault_item_id: updates.snmp_community_vault_item_id !== undefined ? (updates.snmp_community_vault_item_id ? updates.snmp_community_vault_item_id.trim() : null) : existing.snmp_community_vault_item_id,
    snmp_v3_user: updates.snmp_v3_user !== undefined ? updates.snmp_v3_user.trim() : (existing.snmp_v3_user || ''),
    snmp_v3_security_level: updates.snmp_v3_security_level !== undefined ? updates.snmp_v3_security_level : (existing.snmp_v3_security_level || 'authPriv'),
    snmp_v3_auth_protocol: updates.snmp_v3_auth_protocol !== undefined ? updates.snmp_v3_auth_protocol : (existing.snmp_v3_auth_protocol || 'SHA-256'),
    snmp_v3_auth_password: updates.snmp_v3_auth_password !== undefined ? (updates.snmp_v3_auth_password ? encryptServerSecret(updates.snmp_v3_auth_password) : undefined) : existing.snmp_v3_auth_password,
    snmp_v3_auth_vault_item_id: updates.snmp_v3_auth_vault_item_id !== undefined ? (updates.snmp_v3_auth_vault_item_id ? updates.snmp_v3_auth_vault_item_id.trim() : null) : existing.snmp_v3_auth_vault_item_id,
    snmp_v3_priv_protocol: updates.snmp_v3_priv_protocol !== undefined ? updates.snmp_v3_priv_protocol : (existing.snmp_v3_priv_protocol || 'AES-128'),
    snmp_v3_priv_password: updates.snmp_v3_priv_password !== undefined ? (updates.snmp_v3_priv_password ? encryptServerSecret(updates.snmp_v3_priv_password) : undefined) : existing.snmp_v3_priv_password,
    snmp_v3_priv_vault_item_id: updates.snmp_v3_priv_vault_item_id !== undefined ? (updates.snmp_v3_priv_vault_item_id ? updates.snmp_v3_priv_vault_item_id.trim() : null) : existing.snmp_v3_priv_vault_item_id,
    snmp_v3_context: updates.snmp_v3_context !== undefined ? updates.snmp_v3_context.trim() : (existing.snmp_v3_context || ''),
    snmp_timeout: updates.snmp_timeout !== undefined ? Number(updates.snmp_timeout) : (Number(existing.snmp_timeout) || 5000),
    snmp_retries: updates.snmp_retries !== undefined ? Number(updates.snmp_retries) : (Number(existing.snmp_retries) || 1),
  };

  const store = loadFallbackStore();
  if (!Array.isArray(store.devices)) {
    store.devices = loadInitialDevices();
  }
  const idx = store.devices.findIndex((d: any) => d.id === existing.id);
  if (idx >= 0) {
    store.devices[idx] = updated;
  } else {
    store.devices.push(updated);
  }

  if (!Array.isArray(store.device_placements)) {
    store.device_placements = [];
  }
  const placeIdx = store.device_placements.findIndex((p: any) => p.device_id === existing.id);
  const placementRec: DevicePlacementRecord = {
    id: `placement-${existing.id}`,
    device_id: existing.id,
    building: updated.building,
    floor: updated.floor,
    unit: updated.unit,
    rack: updated.rack,
    section: updated.section,
    location: updated.location,
    hierarchy_id: updated.hierarchy_id,
    updated_at: new Date().toISOString(),
  };
  if (placeIdx >= 0) {
    store.device_placements[placeIdx] = placementRec;
  } else {
    store.device_placements.push(placementRec);
  }

  saveFallbackStore(store);

  // Sync to network_data.json
  try {
    const netPath = path.join(process.cwd(), 'backend', 'network_data.json');
    if (fs.existsSync(netPath)) {
      const netData = JSON.parse(fs.readFileSync(netPath, 'utf-8'));
      if (Array.isArray(netData.devices)) {
        const netIdx = netData.devices.findIndex((d: any) => d.id === existing.id);
        if (netIdx >= 0) {
          netData.devices[netIdx] = updated;
        } else {
          netData.devices.push(updated);
        }
        fs.writeFileSync(netPath, JSON.stringify(netData, null, 2), 'utf-8');
      }
    }
  } catch (err) {
    console.warn('[DB updateDevice network_data.json sync notice]', err);
  }

  // PostgreSQL write
  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      await pool.query(
        `UPDATE devices SET
          name = $2, ip = $3, type = $4, model = $5, platform = $6, role = $7,
          ssh_host = $8, ssh_port = $9, ssh_username = $10, is_online = $11,
          latency_ms = $12, mac_address = $13, uptime_str = $14, ports = $15,
          ssh_version = $16, building = $17, floor = $18, unit = $19, rack = $20,
          section = $21, location = $22, hierarchy_id = $23,
          ssh_vault_item_id = $24, enable_vault_item_id = $25,
          snmp_enabled = $26, snmp_version = $27, snmp_port = $28, snmp_community = $29,
          snmp_community_vault_item_id = $30, snmp_v3_user = $31, snmp_v3_security_level = $32,
          snmp_v3_auth_protocol = $33, snmp_v3_auth_password = $34, snmp_v3_auth_vault_item_id = $35,
          snmp_v3_priv_protocol = $36, snmp_v3_priv_password = $37, snmp_v3_priv_vault_item_id = $38,
          snmp_v3_context = $39, snmp_timeout = $40, snmp_retries = $41,
          ssh_password = $42, enable_password = $43,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
        [
          updated.id,
          updated.name,
          updated.ip,
          updated.type,
          updated.model,
          updated.platform,
          updated.role,
          updated.ssh_host || updated.ip,
          updated.ssh_port || 22,
          updated.ssh_username || 'admin',
          Boolean(updated.is_online),
          Number(updated.latency_ms) || 1.5,
          updated.mac_address || updated.mac || '',
          updated.uptime_str || '',
          JSON.stringify(updated.ports || []),
          updated.ssh_version || 'legacy',
          updated.building || '',
          updated.floor || '',
          updated.unit || '',
          updated.rack || '',
          updated.section || '',
          updated.location || '',
          updated.hierarchy_id || '',
          updated.ssh_vault_item_id || null,
          updated.enable_vault_item_id || null,
          updated.snmp_enabled,
          updated.snmp_version,
          updated.snmp_port,
          updated.snmp_community || null,
          updated.snmp_community_vault_item_id || null,
          updated.snmp_v3_user || '',
          updated.snmp_v3_security_level,
          updated.snmp_v3_auth_protocol,
          updated.snmp_v3_auth_password || null,
          updated.snmp_v3_auth_vault_item_id || null,
          updated.snmp_v3_priv_protocol,
          updated.snmp_v3_priv_password || null,
          updated.snmp_v3_priv_vault_item_id || null,
          updated.snmp_v3_context || '',
          updated.snmp_timeout,
          updated.snmp_retries,
          finalSshPassword || null,
          finalEnablePassword || null,
        ]
      );

      await pool.query(
        `INSERT INTO device_placements (id, device_id, building, floor, unit, rack, section, location, hierarchy_id, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO UPDATE SET
           building = EXCLUDED.building,
           floor = EXCLUDED.floor,
           unit = EXCLUDED.unit,
           rack = EXCLUDED.rack,
           section = EXCLUDED.section,
           location = EXCLUDED.location,
           hierarchy_id = EXCLUDED.hierarchy_id,
           updated_at = CURRENT_TIMESTAMP`,
        [
          `placement-${updated.id}`,
          updated.id,
          updated.building || '',
          updated.floor || '',
          updated.unit || '',
          updated.rack || '',
          updated.section || '',
          updated.location || '',
          updated.hierarchy_id || '',
        ]
      );
    } catch (e) {
      console.error('[DB updateDevice in PostgreSQL error]', e);
    }
  }

  return updated;
}

export async function deleteDevice(id: string): Promise<boolean> {
  const cleanId = (id || '').trim();
  if (!cleanId) return false;

  const store = loadFallbackStore();
  if (Array.isArray(store.devices)) {
    store.devices = store.devices.filter((d: any) => d.id !== cleanId);
    saveFallbackStore(store);
  }

  // Remove from network_data.json
  try {
    const netPath = path.join(process.cwd(), 'backend', 'network_data.json');
    if (fs.existsSync(netPath)) {
      const netData = JSON.parse(fs.readFileSync(netPath, 'utf-8'));
      if (Array.isArray(netData.devices)) {
        netData.devices = netData.devices.filter((d: any) => d.id !== cleanId);
      }
      if (Array.isArray(netData.topology_links)) {
        netData.topology_links = netData.topology_links.filter(
          (l: any) => l.source !== cleanId && l.target !== cleanId
        );
      }
      if (netData.ports && netData.ports[cleanId]) {
        delete netData.ports[cleanId];
      }
      fs.writeFileSync(netPath, JSON.stringify(netData, null, 2), 'utf-8');
    }
  } catch (err) {
    console.warn('[DB deleteDevice network_data.json sync notice]', err);
  }

  // PostgreSQL delete
  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      await pool.query('DELETE FROM devices WHERE id = $1', [cleanId]);
      await pool.query('DELETE FROM device_sticky_notes WHERE device_id = $1', [cleanId]);
    } catch (e) {
      console.error('[DB deleteDevice in PostgreSQL error]', e);
    }
  }

  return true;
}

// -------------------------------------------------------------
// Device Groups
// -------------------------------------------------------------
export async function getDeviceGroups(): Promise<any[]> {
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT * FROM device_groups ORDER BY created_at ASC');
      return res.rows.map((r) => {
        const devIds = typeof r.device_ids === 'string' ? JSON.parse(r.device_ids) : (r.device_ids || []);
        const srvIds = typeof r.server_ids === 'string' ? JSON.parse(r.server_ids) : (r.server_ids || []);
        return {
          id: r.id,
          name: r.name,
          description: r.description,
          color: r.color,
          icon: r.icon,
          deviceIds: devIds,
          device_ids: devIds,
          serverIds: srvIds,
          server_ids: srvIds,
          tags: Array.isArray(r.tags) ? r.tags : (typeof r.tags === 'string' ? JSON.parse(r.tags || '[]') : []),
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        };
      });
    } catch (e) {
      console.error('[DB Query Error in getDeviceGroups]', e);
    }
  }
  return (loadFallbackStore().device_groups || []).map((g: any) => {
    const devIds = g.deviceIds || g.device_ids || [];
    const srvIds = g.serverIds || g.server_ids || [];
    return {
      ...g,
      deviceIds: devIds,
      device_ids: devIds,
      serverIds: srvIds,
      server_ids: srvIds,
      tags: Array.isArray(g.tags) ? g.tags : [],
    };
  });
}

export async function saveDeviceGroups(groups: any[]): Promise<void> {
  const normalized = (groups || []).map((g: any) => {
    const devIds = g.deviceIds || g.device_ids || [];
    const srvIds = g.serverIds || g.server_ids || [];
    return {
      id: g.id,
      name: g.name,
      description: g.description || '',
      color: g.color || 'indigo',
      icon: g.icon || 'FolderTree',
      deviceIds: devIds,
      device_ids: devIds,
      serverIds: srvIds,
      server_ids: srvIds,
      tags: Array.isArray(g.tags) ? g.tags : [],
      createdAt: g.createdAt || g.created_at || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });

  const store = loadFallbackStore();
  store.device_groups = normalized;
  saveFallbackStore(store);

  if (isPostgresReady && pool) {
    try {
      const client = await pool.connect();
      await client.query('BEGIN');
      await client.query('DELETE FROM device_groups');
      for (const g of normalized) {
        await client.query(
          `INSERT INTO device_groups (id, name, description, color, icon, device_ids, server_ids, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            g.id,
            g.name,
            g.description,
            g.color,
            g.icon,
            JSON.stringify(g.deviceIds),
            JSON.stringify(g.serverIds),
            g.createdAt,
            g.updatedAt,
          ]
        );
      }
      await client.query('COMMIT');
      client.release();
    } catch (e) {
      console.error('[DB Query Error in saveDeviceGroups]', e);
    }
  }
}

// -------------------------------------------------------------
// Active Directory Config
// -------------------------------------------------------------
export async function getActiveDirectoryConfig(): Promise<any> {
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query("SELECT config_data FROM ad_config WHERE id = 'primary' LIMIT 1");
      if (res.rows.length > 0) {
        const raw = res.rows[0].config_data;
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      }
    } catch (e) {
      console.error('[DB Query Error]', e);
    }
  }
  return loadFallbackStore().ad_config || DEFAULT_AD_CONFIG;
}

export async function saveActiveDirectoryConfig(config: any): Promise<void> {
  const store = loadFallbackStore();
  store.ad_config = config;
  saveFallbackStore(store);

  if (isPostgresReady && pool) {
    try {
      await pool.query(
        `INSERT INTO ad_config (id, config_data, updated_at)
         VALUES ('primary', $1, CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO UPDATE SET
           config_data = EXCLUDED.config_data,
           updated_at = CURRENT_TIMESTAMP`,
        [JSON.stringify(config)]
      );
    } catch (e) {
      console.error('[DB Query Error]', e);
    }
  }
}

// -------------------------------------------------------------
// General Panel Settings
// -------------------------------------------------------------
export interface LoginUploadedImage {
  id: string;
  name: string;
  dataUrl: string;
  uploadedAt: string;
  width?: number;
  height?: number;
}

export interface PanelGeneralSettings {
  panelPort: number;
  panelTitle: string;
  panelSubtitle: string;
  logoType: 'default' | 'preset' | 'custom_url';
  logoPreset: 'network' | 'shield' | 'server' | 'router' | 'cpu' | 'globe';
  logoCustomUrl?: string;
  faviconType?: 'default' | 'same_as_logo' | 'custom_url' | 'preset';
  faviconCustomUrl?: string;
  faviconPreset?: 'network' | 'shield' | 'server' | 'router' | 'cpu' | 'globe';
  defaultTheme: 'obsidian' | 'emerald' | 'cobalt' | 'rose' | 'amber' | 'light' | 'google-light' | 'google-dark';
  defaultLanguage: 'fa' | 'en';
  telemetryRefreshIntervalSec: number;
  sessionInactivityTimeoutMin: number;
  defaultDeviceProtocol: 'ssh' | 'telnet' | 'https';
  systemDebugLogging: boolean;
  twoFactorEnabled?: boolean;
  allowedAuthMethods?: 'both' | 'local_only' | 'ad_only';
  loginVisualMode?: 'animation' | 'image';
  loginAnimationType?: 'globe' | 'milky_way' | 'matrix';
  loginImageMode?: 'selected' | 'random';
  loginSelectedImageId?: string;
  loginUploadedImages?: LoginUploadedImage[];
  serverTimezone?: string;
  serverNtpServer?: string;
  serverNtpEnabled?: boolean;
  timeFormat?: '24h' | '12h';
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_GENERAL_SETTINGS: PanelGeneralSettings = {
  panelPort: 3000,
  panelTitle: 'NetTopology Pro',
  panelSubtitle: 'Enterprise Network Discovery & Infrastructure Management',
  logoType: 'default',
  logoPreset: 'network',
  logoCustomUrl: '',
  faviconType: 'default',
  faviconCustomUrl: '',
  faviconPreset: 'network',
  defaultTheme: 'obsidian',
  defaultLanguage: 'fa',
  telemetryRefreshIntervalSec: 10,
  sessionInactivityTimeoutMin: 60,
  defaultDeviceProtocol: 'ssh',
  systemDebugLogging: false,
  twoFactorEnabled: false,
  allowedAuthMethods: 'both',
  loginVisualMode: 'animation',
  loginAnimationType: 'globe',
  loginImageMode: 'selected',
  loginSelectedImageId: '',
  loginUploadedImages: [],
  serverTimezone: 'Asia/Tehran',
  serverNtpServer: 'ir.pool.ntp.org',
  serverNtpEnabled: true,
  timeFormat: '24h',
  updatedAt: '2026-10-06 00:00:00',
  updatedBy: 'admin',
};

export async function getGeneralSettings(): Promise<PanelGeneralSettings> {
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query(`SELECT settings FROM panel_general_settings WHERE id = 'default'`);
      if (res.rows.length > 0 && res.rows[0].settings) {
        return {
          ...DEFAULT_GENERAL_SETTINGS,
          ...res.rows[0].settings,
        };
      }
    } catch (e) {
      console.warn('[DB] Fallback to file store for general_settings:', e);
    }
  }
  const store = loadFallbackStore();
  return {
    ...DEFAULT_GENERAL_SETTINGS,
    ...(store.general_settings || {}),
  };
}

export async function saveGeneralSettings(settings: Partial<PanelGeneralSettings>, updatedBy: string = 'admin'): Promise<PanelGeneralSettings> {
  const current = await getGeneralSettings();
  const store = loadFallbackStore();
  const updated: PanelGeneralSettings = {
    ...current,
    ...settings,
    panelPort: Number(settings.panelPort) || current.panelPort || 3000,
    panelTitle: String(settings.panelTitle || current.panelTitle).trim() || 'NetTopology Pro',
    panelSubtitle: String(settings.panelSubtitle !== undefined ? settings.panelSubtitle : current.panelSubtitle).trim(),
    logoType: (settings.logoType as any) || current.logoType || 'default',
    logoPreset: (settings.logoPreset as any) || current.logoPreset || 'network',
    logoCustomUrl: settings.logoCustomUrl !== undefined ? settings.logoCustomUrl : current.logoCustomUrl,
    faviconType: (settings.faviconType as any) || current.faviconType || 'default',
    faviconCustomUrl: settings.faviconCustomUrl !== undefined ? settings.faviconCustomUrl : (current.faviconCustomUrl || ''),
    faviconPreset: (settings.faviconPreset as any) || current.faviconPreset || 'network',
    defaultTheme: (settings.defaultTheme as any) || current.defaultTheme || 'obsidian',
    defaultLanguage: (settings.defaultLanguage as any) || current.defaultLanguage || 'fa',
    telemetryRefreshIntervalSec: Number(settings.telemetryRefreshIntervalSec) || current.telemetryRefreshIntervalSec || 10,
    sessionInactivityTimeoutMin: Number(settings.sessionInactivityTimeoutMin) !== undefined ? Number(settings.sessionInactivityTimeoutMin) : current.sessionInactivityTimeoutMin,
    defaultDeviceProtocol: (settings.defaultDeviceProtocol as any) || current.defaultDeviceProtocol || 'ssh',
    systemDebugLogging: Boolean(settings.systemDebugLogging !== undefined ? settings.systemDebugLogging : current.systemDebugLogging),
    twoFactorEnabled: Boolean(settings.twoFactorEnabled !== undefined ? settings.twoFactorEnabled : (current.twoFactorEnabled || false)),
    allowedAuthMethods: (settings.allowedAuthMethods as any) || current.allowedAuthMethods || 'both',
    loginVisualMode: (settings.loginVisualMode === 'image' || settings.loginVisualMode === 'animation')
      ? settings.loginVisualMode
      : (current.loginVisualMode || 'animation'),
    loginAnimationType: (settings.loginAnimationType === 'milky_way' || settings.loginAnimationType === 'globe' || settings.loginAnimationType === 'matrix')
      ? settings.loginAnimationType
      : (current.loginAnimationType || 'globe'),
    loginImageMode: (settings.loginImageMode === 'random' || settings.loginImageMode === 'selected')
      ? settings.loginImageMode
      : (current.loginImageMode || 'selected'),
    loginSelectedImageId: settings.loginSelectedImageId !== undefined
      ? String(settings.loginSelectedImageId)
      : (current.loginSelectedImageId || ''),
    loginUploadedImages: Array.isArray(settings.loginUploadedImages)
      ? settings.loginUploadedImages
      : (Array.isArray(current.loginUploadedImages) ? current.loginUploadedImages : []),
    serverTimezone: settings.serverTimezone !== undefined ? String(settings.serverTimezone).trim() : (current.serverTimezone || 'Asia/Tehran'),
    serverNtpServer: settings.serverNtpServer !== undefined ? String(settings.serverNtpServer).trim() : (current.serverNtpServer || 'ir.pool.ntp.org'),
    serverNtpEnabled: settings.serverNtpEnabled !== undefined ? Boolean(settings.serverNtpEnabled) : (current.serverNtpEnabled !== false),
    timeFormat: (settings.timeFormat as any) || current.timeFormat || '24h',
    updatedAt: new Date().toISOString(),
    updatedBy,
  };
  store.general_settings = updated;
  saveFallbackStore(store);

  if (isPostgresReady && pool) {
    try {
      await pool.query(
        `INSERT INTO panel_general_settings (id, settings, updated_at, updated_by)
         VALUES ('default', $1, CURRENT_TIMESTAMP, $2)
         ON CONFLICT (id) DO UPDATE SET
           settings = EXCLUDED.settings,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = EXCLUDED.updated_by`,
        [JSON.stringify(updated), updatedBy]
      );
    } catch (e) {
      console.error('[DB] Error saving general_settings to PostgreSQL:', e);
    }
  }

  return updated;
}

// -------------------------------------------------------------
// Outgoing Email (SMTP) Configuration Storage
// -------------------------------------------------------------
export interface EmailConfig {
  smtp_host: string;
  smtp_port: number;
  smtp_secure: 'tls' | 'ssl' | 'none';
  smtp_user: string;
  smtp_pass?: string;
  has_password?: boolean;
  from_email: string;
  from_name: string;
  require_auth: boolean;
  reject_unauthorized: boolean;
  allow_self_signed?: boolean;
  auth_method?: 'auto' | 'plain' | 'login' | 'cram-md5';
  updated_at?: string;
  updated_by?: string;
}

export const DEFAULT_EMAIL_CONFIG: EmailConfig = {
  smtp_host: '',
  smtp_port: 587,
  smtp_secure: 'tls',
  smtp_user: '',
  smtp_pass: '',
  has_password: false,
  from_email: '',
  from_name: 'NetTopology Alerts',
  require_auth: true,
  reject_unauthorized: false,
  allow_self_signed: true,
  auth_method: 'auto',
};

export async function getEmailConfig(): Promise<EmailConfig> {
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query("SELECT config_data FROM email_config WHERE id = 'primary' LIMIT 1");
      if (res.rows.length > 0 && res.rows[0].config_data) {
        const raw = res.rows[0].config_data;
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const allowSelfSigned = parsed.allow_self_signed !== undefined
          ? Boolean(parsed.allow_self_signed)
          : (parsed.reject_unauthorized !== undefined ? !parsed.reject_unauthorized : true);
        return {
          ...DEFAULT_EMAIL_CONFIG,
          ...parsed,
          allow_self_signed: allowSelfSigned,
          reject_unauthorized: !allowSelfSigned,
          auth_method: parsed.auth_method || 'auto',
          has_password: Boolean(parsed.smtp_pass && parsed.smtp_pass.trim().length > 0),
        };
      }
    } catch (e) {
      console.warn('[DB] Fallback to file store for email_config:', e);
    }
  }

  const store = loadFallbackStore();
  const cfg = store.email_config || DEFAULT_EMAIL_CONFIG;
  const allowSelfSigned = cfg.allow_self_signed !== undefined
    ? Boolean(cfg.allow_self_signed)
    : (cfg.reject_unauthorized !== undefined ? !cfg.reject_unauthorized : true);
  return {
    ...DEFAULT_EMAIL_CONFIG,
    ...cfg,
    allow_self_signed: allowSelfSigned,
    reject_unauthorized: !allowSelfSigned,
    auth_method: cfg.auth_method || 'auto',
    has_password: Boolean(cfg.smtp_pass && cfg.smtp_pass.trim().length > 0),
  };
}

export async function saveEmailConfig(config: Partial<EmailConfig>, updatedBy: string = 'admin'): Promise<EmailConfig> {
  const current = await getEmailConfig();
  const store = loadFallbackStore();

  // If new password is not provided or empty string, preserve current password
  let resolvedPassword = current.smtp_pass || '';
  if (config.smtp_pass !== undefined && config.smtp_pass !== null && config.smtp_pass.trim().length > 0) {
    resolvedPassword = config.smtp_pass.trim();
  }

  const allowSelfSigned = config.allow_self_signed !== undefined
    ? !!config.allow_self_signed
    : (config.reject_unauthorized !== undefined ? !config.reject_unauthorized : (current.allow_self_signed !== undefined ? !!current.allow_self_signed : !current.reject_unauthorized));

  const updated: EmailConfig = {
    smtp_host: config.smtp_host !== undefined ? config.smtp_host.trim() : current.smtp_host,
    smtp_port: Number(config.smtp_port) || current.smtp_port || 587,
    smtp_secure: config.smtp_secure || current.smtp_secure || 'tls',
    smtp_user: config.smtp_user !== undefined ? config.smtp_user.trim() : current.smtp_user,
    smtp_pass: resolvedPassword,
    has_password: Boolean(resolvedPassword && resolvedPassword.length > 0),
    from_email: config.from_email !== undefined ? config.from_email.trim() : current.from_email,
    from_name: config.from_name !== undefined ? config.from_name.trim() : current.from_name,
    require_auth: config.require_auth !== undefined ? !!config.require_auth : current.require_auth,
    reject_unauthorized: !allowSelfSigned,
    allow_self_signed: allowSelfSigned,
    auth_method: config.auth_method || current.auth_method || 'auto',
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  };

  store.email_config = updated;
  saveFallbackStore(store);

  if (isPostgresReady && pool) {
    try {
      await pool.query(
        `INSERT INTO email_config (id, config_data, updated_at, updated_by)
         VALUES ('primary', $1, CURRENT_TIMESTAMP, $2)
         ON CONFLICT (id) DO UPDATE SET
           config_data = EXCLUDED.config_data,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = EXCLUDED.updated_by`,
        [JSON.stringify(updated), updatedBy]
      );
    } catch (e) {
      console.error('[DB] Error saving email_config to PostgreSQL:', e);
    }
  }

  return updated;
}

// -------------------------------------------------------------
// Automated Audit & Command Logs Scheduled Reporting Configuration
// -------------------------------------------------------------

export interface AuditReportScheduleConfig {
  id?: string;
  enabled: boolean;
  recipients: string[];
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  timeOfDay: string; // e.g. "08:00"
  dayOfWeek?: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  dayOfMonth?: number; // 1-31
  reportTitle?: string;
  selectedCategories: string[];
  includeCommands: boolean;
  minSeverity: 'all' | 'notice' | 'warning' | 'critical';
  statusFilter: 'all' | 'failed_only' | 'success_and_failed';
  timeframeHours: number;
  attachCsv: boolean;
  lastSentAt?: string;
  lastSendStatus?: 'success' | 'failed';
  lastSendError?: string;
  updated_at?: string;
  updated_by?: string;
}

export const DEFAULT_AUDIT_REPORT_SCHEDULE: AuditReportScheduleConfig = {
  enabled: false,
  recipients: [],
  frequency: 'daily',
  timeOfDay: '08:00',
  dayOfWeek: 1, // Monday
  dayOfMonth: 1,
  reportTitle: 'NetTopology Enterprise Audit & Activity Report',
  selectedCategories: [
    'user_management',
    'rbac_policy',
    'device_inventory',
    'backup_recovery',
    'topology_network',
    'port_interface',
    'system_auth',
  ],
  includeCommands: true,
  minSeverity: 'all',
  statusFilter: 'all',
  timeframeHours: 24,
  attachCsv: false,
};

export async function getAllAuditEmailReports(): Promise<AuditReportScheduleConfig[]> {
  const reportsMap = new Map<string, AuditReportScheduleConfig>();

  if (isPostgresReady && pool) {
    try {
      const res = await pool.query(
        "SELECT id, config_data, updated_at, updated_by FROM audit_report_schedule ORDER BY updated_at DESC"
      );
      for (const row of res.rows) {
        if (!row.config_data) continue;
        const raw = row.config_data;
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const reportId = row.id || parsed.id || 'primary';
        reportsMap.set(reportId, {
          ...DEFAULT_AUDIT_REPORT_SCHEDULE,
          ...parsed,
          id: reportId,
          recipients: Array.isArray(parsed.recipients) ? parsed.recipients : [],
          selectedCategories: Array.isArray(parsed.selectedCategories)
            ? parsed.selectedCategories
            : DEFAULT_AUDIT_REPORT_SCHEDULE.selectedCategories,
          updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : parsed.updated_at,
          updated_by: row.updated_by || parsed.updated_by || 'admin',
        });
      }
    } catch (e) {
      console.warn('[DB] Error querying audit_report_schedule from PostgreSQL:', e);
    }
  }

  // Load from fallback store
  const store = loadFallbackStore();
  const fallbackList: any[] = Array.isArray(store.audit_email_reports)
    ? store.audit_email_reports
    : store.audit_report_schedule
    ? [store.audit_report_schedule]
    : [];

  for (const item of fallbackList) {
    const reportId = item.id || 'primary';
    if (!reportsMap.has(reportId)) {
      reportsMap.set(reportId, {
        ...DEFAULT_AUDIT_REPORT_SCHEDULE,
        ...item,
        id: reportId,
        recipients: Array.isArray(item.recipients) ? item.recipients : [],
        selectedCategories: Array.isArray(item.selectedCategories)
          ? item.selectedCategories
          : DEFAULT_AUDIT_REPORT_SCHEDULE.selectedCategories,
      });
    }
  }

  if (reportsMap.size === 0) {
    reportsMap.set('primary', { ...DEFAULT_AUDIT_REPORT_SCHEDULE, id: 'primary' });
  }

  return Array.from(reportsMap.values());
}

export async function getAuditEmailReportById(id: string): Promise<AuditReportScheduleConfig | null> {
  const all = await getAllAuditEmailReports();
  return all.find((r) => r.id === id) || null;
}

export async function saveAuditEmailReport(
  config: Partial<AuditReportScheduleConfig>,
  updatedBy: string = 'admin'
): Promise<AuditReportScheduleConfig> {
  const store = loadFallbackStore();
  const id = (config.id && config.id.trim().length > 0)
    ? config.id.trim()
    : `report-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const existing = (await getAuditEmailReportById(id)) || DEFAULT_AUDIT_REPORT_SCHEDULE;

  const updated: AuditReportScheduleConfig = {
    ...existing,
    ...config,
    id,
    recipients: Array.isArray(config.recipients)
      ? config.recipients.map((r: any) => String(r).trim()).filter(Boolean)
      : existing.recipients,
    selectedCategories: Array.isArray(config.selectedCategories)
      ? config.selectedCategories
      : existing.selectedCategories,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  };

  if (!Array.isArray(store.audit_email_reports)) {
    store.audit_email_reports = [];
  }
  const idx = store.audit_email_reports.findIndex((r: any) => r.id === id);
  if (idx >= 0) {
    store.audit_email_reports[idx] = updated;
  } else {
    store.audit_email_reports.unshift(updated);
  }

  if (id === 'primary' || store.audit_email_reports.length === 1) {
    store.audit_report_schedule = updated;
  }

  saveFallbackStore(store);

  if (isPostgresReady && pool) {
    try {
      await pool.query(
        `INSERT INTO audit_report_schedule (id, config_data, updated_at, updated_by)
         VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
         ON CONFLICT (id) DO UPDATE SET
           config_data = EXCLUDED.config_data,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = EXCLUDED.updated_by`,
        [id, JSON.stringify(updated), updatedBy]
      );
    } catch (e) {
      console.error('[DB] Error saving audit email report to PostgreSQL:', e);
    }
  }

  return updated;
}

export async function deleteAuditEmailReport(id: string): Promise<boolean> {
  const store = loadFallbackStore();
  if (Array.isArray(store.audit_email_reports)) {
    store.audit_email_reports = store.audit_email_reports.filter((r: any) => r.id !== id);
  }
  if (store.audit_report_schedule && store.audit_report_schedule.id === id) {
    store.audit_report_schedule = store.audit_email_reports?.[0] || DEFAULT_AUDIT_REPORT_SCHEDULE;
  }
  saveFallbackStore(store);

  if (isPostgresReady && pool) {
    try {
      await pool.query('DELETE FROM audit_report_schedule WHERE id = $1', [id]);
    } catch (e) {
      console.error('[DB] Error deleting audit email report from PostgreSQL:', e);
    }
  }

  return true;
}

export async function getAuditReportSchedule(): Promise<AuditReportScheduleConfig> {
  const all = await getAllAuditEmailReports();
  return all[0] || DEFAULT_AUDIT_REPORT_SCHEDULE;
}

export async function saveAuditReportSchedule(
  config: Partial<AuditReportScheduleConfig>,
  updatedBy: string = 'admin'
): Promise<AuditReportScheduleConfig> {
  return saveAuditEmailReport({ ...config, id: config.id || 'primary' }, updatedBy);
}

// -------------------------------------------------------------
// Audit Logs Storage
// -------------------------------------------------------------
export async function getAuditLogs(limit: number = 100): Promise<any[]> {
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT $1', [limit]);
      return res.rows;
    } catch (e) {
      console.error('[DB Query Error]', e);
    }
  }
  const store = loadFallbackStore();
  return store.audit_logs.slice(-limit).reverse();
}

export async function addAuditLog(log: any): Promise<void> {
  const record = {
    id: log.id || `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: log.timestamp || new Date().toISOString(),
    user_name: log.userName || log.user_name || 'System',
    action: log.action || 'Event',
    category: log.category || 'general',
    target: log.target || '',
    status: log.status || 'info',
    details: typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details || ''),
    ip_address: log.ipAddress || log.ip_address || '127.0.0.1',
    user_agent: log.userAgent || log.user_agent || '',
  };

  const store = loadFallbackStore();
  store.audit_logs.push(record);
  if (store.audit_logs.length > 500) {
    store.audit_logs = store.audit_logs.slice(-500);
  }
  saveFallbackStore(store);

  if (isPostgresReady && pool) {
    try {
      await pool.query(
        `INSERT INTO audit_logs (id, timestamp, user_name, action, category, target, status, details, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          record.id,
          record.timestamp,
          record.user_name,
          record.action,
          record.category,
          record.target,
          record.status,
          record.details,
          record.ip_address,
          record.user_agent,
        ]
      );
    } catch (e) {
      console.error('[DB Query Error]', e);
    }
  }
}

// -------------------------------------------------------------
// 11.B. Remote Servers & Automation Fleet Command & Audit Logs
// -------------------------------------------------------------

export async function getServerCommandLogs(options: {
  limit?: number;
  offset?: number;
  serverId?: string;
  userName?: string;
  channel?: string;
  actionModule?: string;
  search?: string;
} = {}): Promise<any[]> {
  const { limit = 1000, offset = 0, serverId, userName, channel, actionModule, search } = options;
  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      const conditions: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (serverId) {
        conditions.push(`server_id = $${idx++}`);
        values.push(serverId);
      }
      if (userName) {
        conditions.push(`user_name = $${idx++}`);
        values.push(userName);
      }
      if (channel) {
        conditions.push(`channel = $${idx++}`);
        values.push(channel);
      }
      if (actionModule) {
        conditions.push(`action_module = $${idx++}`);
        values.push(actionModule);
      }
      if (search) {
        conditions.push(`(server_name ILIKE $${idx} OR server_ip ILIKE $${idx} OR action_name ILIKE $${idx} OR action_name_en ILIKE $${idx} OR command ILIKE $${idx} OR output_summary ILIKE $${idx})`);
        values.push(`%${search}%`);
        idx++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      values.push(limit);
      const limitParam = `$${idx++}`;
      values.push(offset);
      const offsetParam = `$${idx++}`;

      const res = await pool.query(
        `SELECT * FROM server_command_audit_logs ${whereClause} ORDER BY timestamp DESC LIMIT ${limitParam} OFFSET ${offsetParam}`,
        values
      );
      return res.rows.map((r: any) => ({
        id: r.id,
        timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : new Date().toISOString(),
        userId: r.user_id,
        actor: {
          username: r.user_name,
          role: r.user_role || 'Super Administrator',
          ipAddress: r.client_ip || '127.0.0.1',
        },
        serverId: r.server_id,
        serverName: r.server_name,
        serverIp: r.server_ip,
        osType: r.os_type,
        osDistro: r.os_distro,
        serverEnvironment: r.server_environment,
        channel: r.channel,
        actionModule: r.action_module,
        actionName: r.action_name,
        actionNameEn: r.action_name_en,
        command: r.command,
        parameters: r.parameters || {},
        riskLevel: r.risk_level,
        status: r.status,
        outputSummary: r.output_summary,
        outputSummaryEn: r.output_summary_en,
        durationMs: r.duration_ms,
        metadata: r.metadata || {},
      }));
    } catch (e) {
      console.error('[DB Query Error in getServerCommandLogs]', e);
    }
  }

  // Fallback store
  const store = loadFallbackStore();
  let logs = (store.server_command_audit_logs || []).map((r: any) => ({
    id: r.id,
    timestamp: r.timestamp || new Date().toISOString(),
    userId: r.user_id || r.userId,
    actor: r.actor || {
      username: r.user_name || 'admin',
      role: r.user_role || 'Super Administrator',
      ipAddress: r.client_ip || '127.0.0.1',
    },
    serverId: r.server_id || r.serverId,
    serverName: r.server_name || r.serverName,
    serverIp: r.server_ip || r.serverIp,
    osType: r.os_type || r.osType || 'linux',
    osDistro: r.os_distro || r.osDistro,
    serverEnvironment: r.server_environment || r.serverEnvironment,
    channel: r.channel,
    actionModule: r.action_module || r.actionModule,
    actionName: r.action_name || r.actionName,
    actionNameEn: r.action_name_en || r.actionNameEn,
    command: r.command,
    parameters: r.parameters || {},
    riskLevel: r.risk_level || r.riskLevel || 'low',
    status: r.status || 'SUCCESS',
    outputSummary: r.output_summary || r.outputSummary,
    outputSummaryEn: r.output_summary_en || r.outputSummaryEn,
    durationMs: r.duration_ms || r.durationMs || 0,
    metadata: r.metadata || {},
  }));

  if (serverId) logs = logs.filter((l: any) => l.serverId === serverId);
  if (userName) logs = logs.filter((l: any) => l.actor?.username === userName);
  if (channel) logs = logs.filter((l: any) => l.channel === channel);
  if (actionModule) logs = logs.filter((l: any) => l.actionModule === actionModule);
  if (search) {
    const q = search.toLowerCase();
    logs = logs.filter((l: any) =>
      (l.serverName || '').toLowerCase().includes(q) ||
      (l.serverIp || '').toLowerCase().includes(q) ||
      (l.actionName || '').toLowerCase().includes(q) ||
      (l.command || '').toLowerCase().includes(q)
    );
  }
  return logs.slice(-limit).reverse();
}

export async function addServerCommandLog(log: any): Promise<any> {
  const record = {
    id: log.id || `srv-cmd-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    user_id: log.userId || log.user_id || '',
    user_name: log.userName || log.user_name || log.actor?.username || 'admin',
    user_role: log.userRole || log.user_role || log.actor?.role || 'Super Administrator',
    client_ip: log.clientIp || log.client_ip || log.actor?.ipAddress || '127.0.0.1',
    server_id: log.serverId || log.server_id || '',
    server_name: log.serverName || log.server_name || '',
    server_ip: log.serverIp || log.server_ip || '',
    os_type: log.osType || log.os_type || 'linux',
    os_distro: log.osDistro || log.os_distro || '',
    server_environment: log.serverEnvironment || log.server_environment || '',
    channel: log.channel || '3DOTS_ACTION',
    action_module: log.actionModule || log.action_module || 'GENERAL_FLEET_ACTION',
    action_name: log.actionName || log.action_name || '',
    action_name_en: log.actionNameEn || log.action_name_en || '',
    command: log.command || '',
    parameters: typeof log.parameters === 'object' ? log.parameters : {},
    risk_level: log.riskLevel || log.risk_level || 'low',
    status: log.status || 'SUCCESS',
    output_summary: log.outputSummary || log.output_summary || '',
    output_summary_en: log.outputSummaryEn || log.output_summary_en || '',
    duration_ms: Number(log.durationMs || log.duration_ms) || 0,
    metadata: typeof log.metadata === 'object' ? log.metadata : {},
    timestamp: log.timestamp || new Date().toISOString(),
  };

  const store = loadFallbackStore();
  if (!Array.isArray(store.server_command_audit_logs)) {
    store.server_command_audit_logs = [];
  }
  store.server_command_audit_logs.push(record);
  if (store.server_command_audit_logs.length > 2000) {
    store.server_command_audit_logs = store.server_command_audit_logs.slice(-2000);
  }
  saveFallbackStore(store);

  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      await pool.query(
        `INSERT INTO server_command_audit_logs (
          id, user_id, user_name, user_role, client_ip, server_id, server_name, server_ip,
          os_type, os_distro, server_environment, channel, action_module, action_name,
          action_name_en, command, parameters, risk_level, status, output_summary,
          output_summary_en, duration_ms, metadata, timestamp
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
        )`,
        [
          record.id,
          record.user_id,
          record.user_name,
          record.user_role,
          record.client_ip,
          record.server_id,
          record.server_name,
          record.server_ip,
          record.os_type,
          record.os_distro,
          record.server_environment,
          record.channel,
          record.action_module,
          record.action_name,
          record.action_name_en,
          record.command,
          JSON.stringify(record.parameters),
          record.risk_level,
          record.status,
          record.output_summary,
          record.output_summary_en,
          record.duration_ms,
          JSON.stringify(record.metadata),
          record.timestamp,
        ]
      );
    } catch (e) {
      console.error('[DB Insert Error in addServerCommandLog]', e);
    }
  }

  return {
    id: record.id,
    timestamp: record.timestamp,
    userId: record.user_id,
    actor: {
      username: record.user_name,
      role: record.user_role,
      ipAddress: record.client_ip,
    },
    serverId: record.server_id,
    serverName: record.server_name,
    serverIp: record.server_ip,
    osType: record.os_type,
    osDistro: record.os_distro,
    serverEnvironment: record.server_environment,
    channel: record.channel,
    actionModule: record.action_module,
    actionName: record.action_name,
    actionNameEn: record.action_name_en,
    command: record.command,
    parameters: record.parameters,
    riskLevel: record.risk_level,
    status: record.status,
    outputSummary: record.output_summary,
    outputSummaryEn: record.output_summary_en,
    durationMs: record.duration_ms,
    metadata: record.metadata,
  };
}

// -------------------------------------------------------------
// 12. Device Sticky Notes & Canvas Map Linking
// -------------------------------------------------------------
export async function getDeviceStickyNotes(): Promise<any[]> {
  let pgNotes: any[] = [];
  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT * FROM device_sticky_notes ORDER BY updated_at DESC');
      pgNotes = res.rows.map((r: any) => ({
        id: r.id,
        linkedDeviceId: r.device_id,
        title: r.title || '',
        content: r.content || '',
        color: r.color || 'yellow',
        x: Number(r.x) || 100,
        y: Number(r.y) || 100,
        width: Number(r.width) || 230,
        viewMode: r.view_mode || 'card',
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
      }));
    } catch (e) {
      console.error('[DB Query Error in getDeviceStickyNotes]', e);
    }
  }

  const store = loadFallbackStore();
  const fallbackNotes = Array.isArray(store.device_sticky_notes) ? store.device_sticky_notes : [];

  // Also collect any sticky notes in custom maps that have a linkedDeviceId
  const maps = Array.isArray(store.custom_maps) ? store.custom_maps : [];
  const mapNotes: any[] = [];
  for (const m of maps) {
    if (Array.isArray(m.stickyNotes)) {
      for (const sn of m.stickyNotes) {
        if (sn && sn.linkedDeviceId) {
          mapNotes.push({
            id: sn.id,
            linkedDeviceId: sn.linkedDeviceId,
            title: sn.title || '',
            content: sn.content || '',
            color: sn.color || 'yellow',
            x: Number(sn.x) || 100,
            y: Number(sn.y) || 100,
            width: Number(sn.width) || 230,
            viewMode: sn.viewMode || 'card',
            createdAt: sn.createdAt || new Date().toISOString(),
            updatedAt: sn.updatedAt || new Date().toISOString(),
          });
        }
      }
    }
  }

  // Deduplicate and prioritize most recent
  const noteMap = new Map<string, any>();
  for (const n of mapNotes) {
    if (n && (n.linkedDeviceId || n.id)) {
      noteMap.set(n.linkedDeviceId || n.id, n);
    }
  }
  for (const n of fallbackNotes) {
    if (n && (n.linkedDeviceId || n.id)) {
      noteMap.set(n.linkedDeviceId || n.id, n);
    }
  }
  for (const n of pgNotes) {
    if (n && (n.linkedDeviceId || n.id)) {
      noteMap.set(n.linkedDeviceId || n.id, n);
    }
  }

  return Array.from(noteMap.values());
}

export async function saveDeviceStickyNote(note: any, previousDeviceId?: string): Promise<any> {
  if (!note) throw new Error('Invalid note data');
  const id = note.id || `note-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const deviceId = note.linkedDeviceId || note.deviceId;
  if (!deviceId) throw new Error('Device ID is required for device sticky note');

  const cleanDeviceId = deviceId.replace(/^hw-/, '');
  const hwDeviceId = 'hw-' + cleanDeviceId;

  const cleanPrev = previousDeviceId ? previousDeviceId.replace(/^hw-/, '') : undefined;
  const hwPrev = cleanPrev ? 'hw-' + cleanPrev : undefined;

  const normalizedNote = {
    id,
    linkedDeviceId: deviceId,
    title: note.title || '',
    content: note.content || '',
    color: note.color || 'yellow',
    x: Number(note.x) || 100,
    y: Number(note.y) || 100,
    width: Number(note.width) || 230,
    viewMode: note.viewMode || 'card',
    createdAt: note.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const store = loadFallbackStore();
  if (!Array.isArray(store.device_sticky_notes)) {
    store.device_sticky_notes = [];
  }

  // If reassigning from another device, clean up old device record in fallback store
  if (previousDeviceId && previousDeviceId !== deviceId) {
    store.device_sticky_notes = store.device_sticky_notes.filter(
      (n: any) =>
        n &&
        n.linkedDeviceId !== previousDeviceId &&
        n.linkedDeviceId !== cleanPrev &&
        n.linkedDeviceId !== hwPrev
    );
  }

  const existingIdx = store.device_sticky_notes.findIndex(
    (n: any) =>
      n.id === id ||
      n.linkedDeviceId === deviceId ||
      n.linkedDeviceId === cleanDeviceId ||
      n.linkedDeviceId === hwDeviceId
  );
  if (existingIdx >= 0) {
    normalizedNote.id = store.device_sticky_notes[existingIdx].id || normalizedNote.id;
    store.device_sticky_notes[existingIdx] = normalizedNote;
  } else {
    store.device_sticky_notes.push(normalizedNote);
  }

  // Update or attach in custom maps in fallback store
  if (Array.isArray(store.custom_maps)) {
    for (const m of store.custom_maps) {
      if (!Array.isArray(m.stickyNotes)) m.stickyNotes = [];
      const snIdx = m.stickyNotes.findIndex(
        (sn: any) =>
          sn.id === normalizedNote.id ||
          sn.linkedDeviceId === deviceId ||
          sn.linkedDeviceId === cleanDeviceId ||
          sn.linkedDeviceId === hwDeviceId
      );
      if (snIdx >= 0) {
        m.stickyNotes[snIdx] = {
          ...m.stickyNotes[snIdx],
          id: normalizedNote.id,
          title: normalizedNote.title,
          content: normalizedNote.content,
          color: normalizedNote.color,
          linkedDeviceId: normalizedNote.linkedDeviceId,
          updatedAt: normalizedNote.updatedAt,
        };
      } else {
        const hasDevice =
          (Array.isArray(m.deviceIds) &&
            (m.deviceIds.includes(deviceId) || m.deviceIds.includes(cleanDeviceId) || m.deviceIds.includes(hwDeviceId))) ||
          (m.devicePositions &&
            (m.devicePositions[deviceId] || m.devicePositions[cleanDeviceId] || m.devicePositions[hwDeviceId]));

        if (hasDevice) {
          const devPos =
            (m.devicePositions &&
              (m.devicePositions[deviceId] || m.devicePositions[cleanDeviceId] || m.devicePositions[hwDeviceId])) ||
            { x: 200, y: 150 };
          m.stickyNotes.push({
            ...normalizedNote,
            x: (devPos.x || 200) + 80,
            y: (devPos.y || 150) + 40,
          });
        }
      }
    }
  }

  saveFallbackStore(store);

  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      // If reassigning from another device, clean up old device record in PostgreSQL
      if (previousDeviceId && previousDeviceId !== deviceId) {
        await pool.query(
          'DELETE FROM device_sticky_notes WHERE device_id = $1 OR device_id = $2',
          [previousDeviceId, cleanPrev]
        );
      }

      // Find if this device or id already has a record in device_sticky_notes table
      const existingRes = await pool.query(
        'SELECT id FROM device_sticky_notes WHERE id = $1 OR device_id = $2 OR device_id = $3 LIMIT 1',
        [id, deviceId, cleanDeviceId]
      );
      const targetId = existingRes.rows.length > 0 ? existingRes.rows[0].id : normalizedNote.id;
      normalizedNote.id = targetId;

      await pool.query(
        `INSERT INTO device_sticky_notes (id, device_id, title, content, color, x, y, width, view_mode, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET
           device_id = EXCLUDED.device_id,
           title = EXCLUDED.title,
           content = EXCLUDED.content,
           color = EXCLUDED.color,
           x = EXCLUDED.x,
           y = EXCLUDED.y,
           width = EXCLUDED.width,
           view_mode = EXCLUDED.view_mode,
           updated_at = EXCLUDED.updated_at`,
        [
          targetId,
          normalizedNote.linkedDeviceId,
          normalizedNote.title,
          normalizedNote.content,
          normalizedNote.color,
          normalizedNote.x,
          normalizedNote.y,
          normalizedNote.width,
          normalizedNote.viewMode,
          normalizedNote.createdAt,
          normalizedNote.updatedAt,
        ]
      );

      // Also synchronize PostgreSQL custom_maps table
      try {
        const mapsRes = await pool.query('SELECT id, map_data FROM custom_maps');
        for (const row of mapsRes.rows) {
          const mapData = typeof row.map_data === 'string' ? JSON.parse(row.map_data) : (row.map_data || {});
          let stickyNotes = Array.isArray(mapData.stickyNotes) ? mapData.stickyNotes : [];
          const snIdx = stickyNotes.findIndex(
            (sn: any) =>
              sn.id === normalizedNote.id ||
              sn.linkedDeviceId === deviceId ||
              sn.linkedDeviceId === cleanDeviceId ||
              sn.linkedDeviceId === hwDeviceId
          );

          let updated = false;
          if (snIdx >= 0) {
            stickyNotes[snIdx] = {
              ...stickyNotes[snIdx],
              id: normalizedNote.id,
              title: normalizedNote.title,
              content: normalizedNote.content,
              color: normalizedNote.color,
              linkedDeviceId: normalizedNote.linkedDeviceId,
              updatedAt: normalizedNote.updatedAt,
            };
            updated = true;
          } else {
            const hasDev =
              (Array.isArray(mapData.deviceIds) &&
                (mapData.deviceIds.includes(deviceId) || mapData.deviceIds.includes(cleanDeviceId) || mapData.deviceIds.includes(hwDeviceId))) ||
              (mapData.devicePositions &&
                (mapData.devicePositions[deviceId] || mapData.devicePositions[cleanDeviceId] || mapData.devicePositions[hwDeviceId]));
            if (hasDev) {
              const devPos =
                (mapData.devicePositions &&
                  (mapData.devicePositions[deviceId] || mapData.devicePositions[cleanDeviceId] || mapData.devicePositions[hwDeviceId])) ||
                { x: 200, y: 150 };
              stickyNotes.push({
                ...normalizedNote,
                x: (devPos.x || 200) + 80,
                y: (devPos.y || 150) + 40,
              });
              updated = true;
            }
          }

          if (updated) {
            mapData.stickyNotes = stickyNotes;
            mapData.updatedAt = new Date().toISOString();
            await pool.query(
              'UPDATE custom_maps SET map_data = $1, updated_at = NOW() WHERE id = $2',
              [JSON.stringify(mapData), row.id]
            );
          }
        }
      } catch (mapSyncErr) {
        console.warn('[PostgreSQL custom_maps sync warning in saveDeviceStickyNote]', mapSyncErr);
      }
    } catch (e) {
      console.error('[DB Save Error in saveDeviceStickyNote]', e);
    }
  }

  return normalizedNote;
}

export async function deleteDeviceStickyNote(noteId: string, deviceId?: string, keepInMap: boolean = false): Promise<void> {
  const store = loadFallbackStore();
  let effectiveDeviceId = deviceId;

  // If effectiveDeviceId not provided, check fallbackStore and DB for matching note
  if (!effectiveDeviceId && Array.isArray(store.device_sticky_notes)) {
    const found = store.device_sticky_notes.find((n: any) => n.id === noteId);
    if (found?.linkedDeviceId) {
      effectiveDeviceId = found.linkedDeviceId;
    }
  }

  const cleanDeviceId = effectiveDeviceId ? effectiveDeviceId.replace(/^hw-/, '') : undefined;
  const hwDeviceId = cleanDeviceId ? 'hw-' + cleanDeviceId : undefined;

  const matchesTarget = (sn: any) => {
    if (!sn) return false;
    if (noteId && sn.id === noteId) return true;
    if (effectiveDeviceId && (sn.linkedDeviceId === effectiveDeviceId || sn.linkedDeviceId === cleanDeviceId || sn.linkedDeviceId === hwDeviceId)) return true;
    if (noteId && sn.linkedDeviceId === noteId) return true;
    return false;
  };

  if (Array.isArray(store.device_sticky_notes)) {
    store.device_sticky_notes = store.device_sticky_notes.filter((n: any) => !matchesTarget(n));
  }

  if (Array.isArray(store.custom_maps)) {
    for (const m of store.custom_maps) {
      if (Array.isArray(m.stickyNotes)) {
        if (keepInMap) {
          // Only unlink the note from device, retain the sticky note on the canvas
          m.stickyNotes = m.stickyNotes.map((sn: any) => {
            if (matchesTarget(sn)) {
              const updated = { ...sn };
              delete updated.linkedDeviceId;
              delete updated.device_id;
              return updated;
            }
            return sn;
          });
        } else {
          // Permanently remove the sticky note from the map
          m.stickyNotes = m.stickyNotes.filter((sn: any) => !matchesTarget(sn));
        }
      }
    }
  }
  saveFallbackStore(store);

  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      if (!effectiveDeviceId) {
        try {
          const lookup = await pool.query('SELECT device_id FROM device_sticky_notes WHERE id = $1 LIMIT 1', [noteId]);
          if (lookup.rows.length > 0 && lookup.rows[0].device_id) {
            effectiveDeviceId = lookup.rows[0].device_id;
          }
        } catch {}
      }

      const cleanDev = effectiveDeviceId ? effectiveDeviceId.replace(/^hw-/, '') : null;
      const hwDev = cleanDev ? 'hw-' + cleanDev : null;

      await pool.query(
        `DELETE FROM device_sticky_notes 
         WHERE id = $1 
            OR device_id = $1 
            OR ($2::text IS NOT NULL AND (device_id = $2 OR device_id = $3 OR device_id = $4))`,
        [noteId, effectiveDeviceId || null, cleanDev || null, hwDev || null]
      );

      // Also synchronize PostgreSQL custom_maps table
      try {
        const mapsRes = await pool.query('SELECT id, map_data FROM custom_maps');
        for (const row of mapsRes.rows) {
          const mapData = typeof row.map_data === 'string' ? JSON.parse(row.map_data) : (row.map_data || {});
          if (Array.isArray(mapData.stickyNotes)) {
            let changed = false;
            if (keepInMap) {
              mapData.stickyNotes = mapData.stickyNotes.map((sn: any) => {
                if (matchesTarget(sn)) {
                  changed = true;
                  const updated = { ...sn };
                  delete updated.linkedDeviceId;
                  delete updated.device_id;
                  return updated;
                }
                return sn;
              });
            } else {
              const origLen = mapData.stickyNotes.length;
              mapData.stickyNotes = mapData.stickyNotes.filter((sn: any) => !matchesTarget(sn));
              if (mapData.stickyNotes.length !== origLen) changed = true;
            }

            if (changed) {
              mapData.updatedAt = new Date().toISOString();
              await pool.query(
                'UPDATE custom_maps SET map_data = $1, updated_at = NOW() WHERE id = $2',
                [JSON.stringify(mapData), row.id]
              );
            }
          }
        }
      } catch (mapErr) {
        console.warn('[PostgreSQL custom_maps cleanup warning in deleteDeviceStickyNote]', mapErr);
      }
    } catch (e) {
      console.error('[DB Delete Error in deleteDeviceStickyNote]', e);
    }
  }
}

// ==========================================
// REMOTE SERVERS FLEET CRUD & TAG OPERATIONS
// ==========================================

function rowToRemoteServer(r: any): RemoteServer {
  return {
    id: r.id,
    name: r.name || r.id,
    hostname: r.hostname || '',
    ip: r.ip || '',
    os_type: (r.os_type || 'linux').toLowerCase() as 'linux' | 'windows',
    os_distro: r.os_distro || (r.os_type === 'windows' ? 'Windows Server 2022' : 'Ubuntu 24.04 LTS'),
    environment: r.environment || 'Production',
    category: r.category || 'Application Server',
    role: r.role || 'General Server',
    tags: Array.isArray(r.tags) ? r.tags : (typeof r.tags === 'string' ? JSON.parse(r.tags || '[]') : []),
    ssh_port: Number(r.ssh_port) || 22,
    ssh_username: r.ssh_username || 'root',
    ssh_password: r.ssh_password || '',
    ssh_password_set: Boolean(r.ssh_password && String(r.ssh_password).trim().length > 0),
    ssh_vault_item_id: r.ssh_vault_item_id || undefined,
    ssh_key_path: r.ssh_key_path || '',
    default_shell: (r.default_shell || 'bash') as 'bash' | 'zsh' | 'sh',
    win_protocol: (r.win_protocol || 'rdp') as 'rdp' | 'powershell' | 'winrm',
    win_port: Number(r.win_port) || 3389,
    win_username: r.win_username || 'Administrator',
    win_password: r.win_password || '',
    win_password_set: Boolean(r.win_password && String(r.win_password).trim().length > 0),
    win_vault_item_id: r.win_vault_item_id || undefined,
    win_domain: r.win_domain && r.win_domain !== 'CORP.INTERNAL' ? r.win_domain : '',
    rdp_security: (['any', 'nla', 'tls', 'rdp'].includes(String(r.rdp_security || '').toLowerCase())
      ? String(r.rdp_security).toLowerCase()
      : 'any') as 'any' | 'nla' | 'tls' | 'rdp',
    prompt_password_on_connect: Boolean(r.prompt_password_on_connect),
    installed_web_servers: Array.isArray(r.installed_web_servers)
      ? r.installed_web_servers
      : (typeof r.installed_web_servers === 'string' ? JSON.parse(r.installed_web_servers || '[]') : []),
    installed_databases: Array.isArray(r.installed_databases)
      ? r.installed_databases
      : (typeof r.installed_databases === 'string' ? JSON.parse(r.installed_databases || '[]') : []),
    has_apache: Boolean(r.has_apache ?? (Array.isArray(r.installed_web_servers) ? r.installed_web_servers.includes('apache') : false)),
    has_nginx: Boolean(r.has_nginx ?? (Array.isArray(r.installed_web_servers) ? r.installed_web_servers.includes('nginx') : false)),
    has_postgresql: Boolean(r.has_postgresql ?? (Array.isArray(r.installed_databases) ? r.installed_databases.includes('postgresql') : false)),
    has_mysql: Boolean(r.has_mysql ?? (Array.isArray(r.installed_databases) ? r.installed_databases.includes('mysql') : false)),
    server_type: r.server_type || (r.has_postgresql && !r.has_nginx && !r.has_apache ? 'postgresql' : r.has_mysql && !r.has_nginx && !r.has_apache ? 'mysql' : r.has_nginx && !r.has_apache ? 'nginx' : r.has_apache && !r.has_nginx ? 'apache' : r.os_type || 'linux'),
    web_http_port: r.web_http_port ? Number(r.web_http_port) : 80,
    web_https_port: r.web_https_port ? Number(r.web_https_port) : 443,
    postgres_port: r.postgres_port ? Number(r.postgres_port) : 5432,
    postgres_user: r.postgres_user || 'postgres',
    postgres_password: r.postgres_password || '',
    postgres_password_set: Boolean(r.postgres_password && String(r.postgres_password).trim().length > 0),
    postgres_database: r.postgres_database || 'postgres',
    db_vault_item_id: r.db_vault_item_id || undefined,
    mysql_port: r.mysql_port ? Number(r.mysql_port) : 3306,
    mysql_user: r.mysql_user || 'root',
    mysql_password: r.mysql_password || '',
    mysql_password_set: Boolean(r.mysql_password && String(r.mysql_password).trim().length > 0),
    mysql_database: r.mysql_database || 'mysql',
    status: (r.status || 'untested') as 'online' | 'offline' | 'unreachable' | 'untested',
    cpu_cores: r.cpu_cores !== undefined && r.cpu_cores !== null && Number(r.cpu_cores) > 0 ? Number(r.cpu_cores) : undefined,
    ram_gb: r.ram_gb !== undefined && r.ram_gb !== null && Number(r.ram_gb) > 0 ? Number(r.ram_gb) : undefined,
    disk_gb: r.disk_gb !== undefined && r.disk_gb !== null && Number(r.disk_gb) > 0 ? Number(r.disk_gb) : undefined,
    uptime_str: r.uptime_str || '',
    location: r.location || 'Datacenter A',
    notes: r.notes || '',
    created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
  };
}

/**
 * Scrubs sensitive PostgreSQL passwords and credentials before sending server objects to frontend API consumers.
 * Indicates `postgres_password_set: true` so UI knows a password is saved on server.
 */
export function sanitizeRemoteServerForClient(s: RemoteServer): RemoteServer {
  return {
    ...s,
    win_password_set: Boolean(
      s.win_password_set || s.win_vault_item_id || (s.win_password && String(s.win_password).trim().length > 0)
    ),
    win_password: '', // Stripped to ensure zero-leak credential confidentiality
    ssh_password_set: Boolean(
      s.ssh_password_set || s.ssh_vault_item_id || (s.ssh_password && String(s.ssh_password).trim().length > 0)
    ),
    ssh_password: '', // Stripped to ensure zero-leak credential confidentiality
    postgres_password_set: Boolean(
      s.postgres_password_set || s.db_vault_item_id || (s.postgres_password && String(s.postgres_password).trim().length > 0)
    ),
    postgres_password: '', // Stripped to ensure zero-leak credential confidentiality
    mysql_password_set: Boolean(
      s.mysql_password_set || s.db_vault_item_id || (s.mysql_password && String(s.mysql_password).trim().length > 0)
    ),
    mysql_password: '', // Stripped to ensure zero-leak credential confidentiality
  };
}

export async function getAllRemoteServers(): Promise<RemoteServer[]> {
  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT * FROM remote_servers ORDER BY created_at DESC');
      if (res.rows && res.rows.length > 0) {
        const store = loadFallbackStore();
        const existingById = new Map<string, any>();
        if (Array.isArray(store.remote_servers)) {
          for (const existing of store.remote_servers) {
            if (existing?.id) existingById.set(existing.id, existing);
          }
        }
        const list = res.rows.map((r: any) => {
          const mapped = rowToRemoteServer(r);
          const local = existingById.get(mapped.id);
          if (local) {
            if (!mapped.win_password && local.win_password) {
              mapped.win_password = local.win_password;
              pool?.query('UPDATE remote_servers SET win_password = $1 WHERE id = $2', [local.win_password, mapped.id]).catch(() => {});
            }
            if ((!mapped.rdp_security || mapped.rdp_security === 'any') && local.rdp_security) {
              mapped.rdp_security = local.rdp_security;
            }
          }
          return mapped;
        });
        // Keep fallback store synchronized with PostgreSQL
        try {
          store.remote_servers = list;
          saveFallbackStore(store);
        } catch {
          // ignore fallback sync error
        }
        return list;
      }
    } catch (e) {
      console.warn('[DB Error getAllRemoteServers, falling back to local store]', e);
    }
  }

  const store = loadFallbackStore();
  if (!Array.isArray(store.remote_servers)) {
    store.remote_servers = [];
    saveFallbackStore(store);
  }
  return store.remote_servers;
}

export async function getRemoteServerById(id: string): Promise<RemoteServer | null> {
  const cleanId = (id || '').trim();
  if (!cleanId) return null;

  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query(
        'SELECT * FROM remote_servers WHERE id = $1 OR LOWER(id) = LOWER($1) OR ip = $1 LIMIT 1',
        [cleanId]
      );
      if (res.rows && res.rows.length > 0) {
        const srv = rowToRemoteServer(res.rows[0]);
        // Also ensure fallback store is populated with this server
        try {
          const store = loadFallbackStore();
          if (!Array.isArray(store.remote_servers)) {
            store.remote_servers = [];
          }
          const fIdx = store.remote_servers.findIndex(
            (s) => s.id === srv.id || s.id.toLowerCase() === srv.id.toLowerCase()
          );
          if (fIdx >= 0) {
            const local = store.remote_servers[fIdx];
            if (!srv.win_password && local.win_password) {
              srv.win_password = local.win_password;
              pool?.query('UPDATE remote_servers SET win_password = $1 WHERE id = $2', [local.win_password, srv.id]).catch(() => {});
            }
            if ((!srv.rdp_security || srv.rdp_security === 'any') && local.rdp_security) {
              srv.rdp_security = local.rdp_security;
            }
            store.remote_servers[fIdx] = srv;
          } else {
            store.remote_servers.push(srv);
          }
          saveFallbackStore(store);
        } catch {
          // ignore
        }
        return srv;
      }
    } catch (e) {
      console.warn('[DB Error getRemoteServerById, falling back to local store]', e);
    }
  }

  const store = loadFallbackStore();
  const found = (store.remote_servers || []).find(
    (s) => s.id === cleanId || s.id.toLowerCase() === cleanId.toLowerCase() || s.ip === cleanId
  );
  if (found) return found;

  const defaultFound = DEFAULT_REMOTE_SERVERS.find(
    (s) => s.id === cleanId || s.id.toLowerCase() === cleanId.toLowerCase() || s.ip === cleanId
  );
  return defaultFound ? { ...defaultFound } : null;
}

export const getServerById = getRemoteServerById;
export const getAllServers = getAllRemoteServers;

export async function createRemoteServer(data: Partial<RemoteServer>): Promise<RemoteServer> {
  const newServer: RemoteServer = {
    id: data.id || `srv-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    name: data.name?.trim() || 'New Server',
    hostname: data.hostname?.trim() || '',
    ip: data.ip?.trim() || '127.0.0.1',
    os_type: data.os_type || 'linux',
    os_distro: data.os_distro || (data.os_type === 'windows' ? 'Windows Server 2022' : 'Ubuntu 24.04 LTS'),
    environment: data.environment || 'Production',
    category: data.category || 'Application Server',
    role: data.role || 'General Server',
    tags: Array.isArray(data.tags) ? data.tags.map((t) => t.trim()).filter(Boolean) : [],
    ssh_port: Number(data.ssh_port) || 22,
    ssh_username: (data.ssh_username || (data as any).ssh_user)?.trim() || (data.os_type === 'windows' ? 'Administrator' : 'root'),
    ssh_password: data.prompt_password_on_connect ? '' : (data.ssh_password || (data as any).ssh_pass || ''),
    ssh_password_set: Boolean(!data.prompt_password_on_connect && (data.ssh_password || (data as any).ssh_pass) && String(data.ssh_password || (data as any).ssh_pass).trim().length > 0),
    ssh_key_path: data.ssh_key_path || '',
    default_shell: data.default_shell || 'bash',
    win_protocol: data.win_protocol || 'rdp',
    win_port: Number(data.win_port) || 3389,
    win_username: (data.win_username || (data as any).win_user)?.trim() || 'Administrator',
    win_password: data.prompt_password_on_connect ? '' : (data.win_password || (data as any).win_pass || ''),
    win_password_set: Boolean(!data.prompt_password_on_connect && (data.win_password || (data as any).win_pass) && String(data.win_password || (data as any).win_pass).trim().length > 0),
    win_domain: data.win_domain?.trim() && data.win_domain.trim() !== 'CORP.INTERNAL' ? data.win_domain.trim() : '',
    rdp_security: (['any', 'nla', 'tls', 'rdp'].includes(String(data.rdp_security || '').toLowerCase())
      ? String(data.rdp_security).toLowerCase()
      : 'any') as 'any' | 'nla' | 'tls' | 'rdp',
    vnc_port: Number(data.vnc_port) || 5900,
    vnc_username: data.vnc_username?.trim() || '',
    vnc_password: data.prompt_password_on_connect ? '' : (data.vnc_password || ''),
    prompt_password_on_connect: Boolean(data.prompt_password_on_connect),
    installed_web_servers: Array.isArray(data.installed_web_servers) ? data.installed_web_servers : (
      [
        ...(data.has_apache ? ['apache'] : []),
        ...(data.has_nginx ? ['nginx'] : [])
      ]
    ),
    installed_databases: Array.isArray(data.installed_databases) ? data.installed_databases : (
      [
        ...(data.has_postgresql ? ['postgresql'] : []),
        ...(data.has_mysql ? ['mysql'] : [])
      ]
    ),
    has_apache: Boolean(data.has_apache ?? (Array.isArray(data.installed_web_servers) ? data.installed_web_servers.includes('apache') : false)),
    has_nginx: Boolean(data.has_nginx ?? (Array.isArray(data.installed_web_servers) ? data.installed_web_servers.includes('nginx') : false)),
    has_postgresql: Boolean(data.has_postgresql ?? (Array.isArray(data.installed_databases) ? data.installed_databases.includes('postgresql') : false)),
    has_mysql: Boolean(data.has_mysql ?? (Array.isArray(data.installed_databases) ? data.installed_databases.includes('mysql') : false)),
    server_type: data.server_type || (data.has_postgresql && !data.has_nginx && !data.has_apache ? 'postgresql' : data.has_mysql && !data.has_nginx && !data.has_apache ? 'mysql' : data.has_nginx && !data.has_apache ? 'nginx' : data.has_apache && !data.has_nginx ? 'apache' : data.os_type || 'linux'),
    web_http_port: data.web_http_port ? Number(data.web_http_port) : 80,
    web_https_port: data.web_https_port ? Number(data.web_https_port) : 443,
    postgres_port: data.postgres_port ? Number(data.postgres_port) : 5432,
    postgres_user: data.postgres_user?.trim() || 'postgres',
    postgres_password: data.postgres_password ? encryptServerSecret(data.postgres_password.trim()) : '',
    postgres_password_set: Boolean(data.postgres_password && data.postgres_password.trim().length > 0),
    postgres_database: data.postgres_database?.trim() || 'postgres',
    mysql_port: data.mysql_port ? Number(data.mysql_port) : 3306,
    mysql_user: data.mysql_user?.trim() || 'root',
    mysql_password: data.mysql_password ? encryptServerSecret(data.mysql_password.trim()) : '',
    mysql_password_set: Boolean(data.mysql_password && data.mysql_password.trim().length > 0),
    mysql_database: data.mysql_database?.trim() || 'mysql',
    status: data.status || 'untested',
    cpu_cores: data.cpu_cores !== undefined && data.cpu_cores !== null && Number(data.cpu_cores) > 0 ? Number(data.cpu_cores) : undefined,
    ram_gb: data.ram_gb !== undefined && data.ram_gb !== null && Number(data.ram_gb) > 0 ? Number(data.ram_gb) : undefined,
    disk_gb: data.disk_gb !== undefined && data.disk_gb !== null && Number(data.disk_gb) > 0 ? Number(data.disk_gb) : undefined,
    uptime_str: data.uptime_str || '',
    location: data.location?.trim() || 'Datacenter A',
    notes: data.notes?.trim() || '',
    ssh_vault_item_id: data.ssh_vault_item_id?.trim() || undefined,
    win_vault_item_id: data.win_vault_item_id?.trim() || undefined,
    db_vault_item_id: data.db_vault_item_id?.trim() || undefined,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Always update JSON fallback store
  const store = loadFallbackStore();
  if (!Array.isArray(store.remote_servers)) {
    store.remote_servers = [];
  }
  store.remote_servers.push(newServer);
  saveFallbackStore(store);

  // PostgreSQL write
  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      await pool.query(
        `INSERT INTO remote_servers (
          id, name, hostname, ip, os_type, os_distro, environment, category, role, tags,
          ssh_port, ssh_username, ssh_password, ssh_key_path, default_shell,
          win_protocol, win_port, win_username, win_password, win_domain, rdp_security,
          status, cpu_cores, ram_gb, disk_gb, uptime_str, location, notes,
          prompt_password_on_connect,
          installed_web_servers, installed_databases, has_apache, has_nginx, has_postgresql, has_mysql,
          postgres_port, postgres_user, postgres_password, postgres_database,
          server_type, mysql_port, mysql_user, mysql_password, mysql_database, web_http_port, web_https_port,
          ssh_vault_item_id, win_vault_item_id, db_vault_item_id,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          hostname = EXCLUDED.hostname,
          ip = EXCLUDED.ip,
          os_type = EXCLUDED.os_type,
          os_distro = EXCLUDED.os_distro,
          environment = EXCLUDED.environment,
          category = EXCLUDED.category,
          role = EXCLUDED.role,
          tags = EXCLUDED.tags,
          ssh_port = EXCLUDED.ssh_port,
          ssh_username = EXCLUDED.ssh_username,
          ssh_password = EXCLUDED.ssh_password,
          ssh_key_path = EXCLUDED.ssh_key_path,
          default_shell = EXCLUDED.default_shell,
          win_protocol = EXCLUDED.win_protocol,
          win_port = EXCLUDED.win_port,
          win_username = EXCLUDED.win_username,
          win_password = EXCLUDED.win_password,
          win_domain = EXCLUDED.win_domain,
          rdp_security = EXCLUDED.rdp_security,
          status = EXCLUDED.status,
          cpu_cores = EXCLUDED.cpu_cores,
          ram_gb = EXCLUDED.ram_gb,
          disk_gb = EXCLUDED.disk_gb,
          uptime_str = EXCLUDED.uptime_str,
          location = EXCLUDED.location,
          notes = EXCLUDED.notes,
          prompt_password_on_connect = EXCLUDED.prompt_password_on_connect,
          installed_web_servers = EXCLUDED.installed_web_servers,
          installed_databases = EXCLUDED.installed_databases,
          has_apache = EXCLUDED.has_apache,
          has_nginx = EXCLUDED.has_nginx,
          has_postgresql = EXCLUDED.has_postgresql,
          has_mysql = EXCLUDED.has_mysql,
          postgres_port = EXCLUDED.postgres_port,
          postgres_user = EXCLUDED.postgres_user,
          postgres_password = EXCLUDED.postgres_password,
          postgres_database = EXCLUDED.postgres_database,
          server_type = EXCLUDED.server_type,
          mysql_port = EXCLUDED.mysql_port,
          mysql_user = EXCLUDED.mysql_user,
          mysql_password = EXCLUDED.mysql_password,
          mysql_database = EXCLUDED.mysql_database,
          web_http_port = EXCLUDED.web_http_port,
          web_https_port = EXCLUDED.web_https_port,
          ssh_vault_item_id = EXCLUDED.ssh_vault_item_id,
          win_vault_item_id = EXCLUDED.win_vault_item_id,
          db_vault_item_id = EXCLUDED.db_vault_item_id,
          updated_at = NOW()`,
        [
          newServer.id,
          newServer.name,
          newServer.hostname || '',
          newServer.ip,
          newServer.os_type,
          newServer.os_distro || '',
          newServer.environment,
          newServer.category,
          newServer.role,
          JSON.stringify(newServer.tags),
          newServer.ssh_port || 22,
          newServer.ssh_username || 'root',
          newServer.ssh_password || '',
          newServer.ssh_key_path || '',
          newServer.default_shell || 'bash',
          newServer.win_protocol || 'rdp',
          newServer.win_port || 3389,
          newServer.win_username || 'Administrator',
          newServer.win_password || '',
          newServer.win_domain || '',
          newServer.rdp_security || 'any',
          newServer.status,
          newServer.cpu_cores ?? null,
          newServer.ram_gb ?? null,
          newServer.disk_gb ?? null,
          newServer.uptime_str || null,
          newServer.location || '',
          newServer.notes || '',
          Boolean(newServer.prompt_password_on_connect),
          JSON.stringify(newServer.installed_web_servers || []),
          JSON.stringify(newServer.installed_databases || []),
          Boolean(newServer.has_apache),
          Boolean(newServer.has_nginx),
          Boolean(newServer.has_postgresql),
          Boolean(newServer.has_mysql),
          newServer.postgres_port || 5432,
          newServer.postgres_user || 'postgres',
          newServer.postgres_password || '',
          newServer.postgres_database || 'postgres',
          newServer.server_type || 'linux',
          newServer.mysql_port || 3306,
          newServer.mysql_user || 'root',
          newServer.mysql_password || '',
          newServer.mysql_database || 'mysql',
          newServer.web_http_port || 80,
          newServer.web_https_port || 443,
          newServer.ssh_vault_item_id || null,
          newServer.win_vault_item_id || null,
          newServer.db_vault_item_id || null,
          newServer.created_at,
          newServer.updated_at,
        ]
      );
    } catch (e) {
      console.error('[DB Error createRemoteServer in PostgreSQL]', e);
    }
  }

  return newServer;
}

export async function updateRemoteServer(id: string, updates: Partial<RemoteServer>): Promise<RemoteServer | null> {
  const cleanId = (id || updates.id || '').trim();
  if (!cleanId) return null;

  // 1. Fetch current existing server from PostgreSQL, fallback store, or defaults
  let current = await getRemoteServerById(cleanId);
  const store = loadFallbackStore();
  if (!Array.isArray(store.remote_servers)) {
    store.remote_servers = [];
  }
  let storeIdx = store.remote_servers.findIndex(
    (s) => s.id === cleanId || s.id.toLowerCase() === cleanId.toLowerCase() || (updates.ip && s.ip === updates.ip)
  );
  if (!current && storeIdx >= 0) {
    current = store.remote_servers[storeIdx];
  }
  if (!current) {
    const defaultFound = DEFAULT_REMOTE_SERVERS.find(
      (s) => s.id === cleanId || s.id.toLowerCase() === cleanId.toLowerCase() || (updates.ip && s.ip === updates.ip)
    );
    if (defaultFound) {
      current = { ...defaultFound };
    }
  }

  if (!current) {
    console.warn(`[updateRemoteServer] Server not found for ID "${cleanId}"`);
    return null;
  }

  const targetId = current.id || cleanId;
  const updated: RemoteServer = {
    ...current,
    ...updates,
    id: targetId,
    name: updates.name !== undefined ? updates.name.trim() : current.name,
    hostname: updates.hostname !== undefined ? updates.hostname.trim() : (current.hostname || ''),
    ip: updates.ip !== undefined ? updates.ip.trim() : current.ip,
    os_type: updates.os_type !== undefined ? updates.os_type : current.os_type,
    os_distro: updates.os_distro !== undefined ? updates.os_distro.trim() : current.os_distro,
    environment: updates.environment !== undefined ? updates.environment : current.environment,
    category: updates.category !== undefined ? updates.category : current.category,
    role: updates.role !== undefined ? updates.role : current.role,
    tags: Array.isArray(updates.tags) ? updates.tags : (current.tags || []),
    ssh_port: updates.ssh_port !== undefined ? Number(updates.ssh_port) : current.ssh_port,
    ssh_username: updates.ssh_username !== undefined
      ? updates.ssh_username.trim()
      : (updates as any).ssh_user !== undefined
      ? (updates as any).ssh_user.trim()
      : current.ssh_username,
    ssh_password: updates.prompt_password_on_connect
      ? ''
      : (updates.ssh_password !== undefined && updates.ssh_password.trim() !== ''
          ? updates.ssh_password.trim()
          : (current.ssh_password || '')),
    ssh_password_set: Boolean(
      (updates.ssh_password !== undefined && updates.ssh_password.trim().length > 0) ||
      (!updates.prompt_password_on_connect && (current.ssh_password && String(current.ssh_password).trim().length > 0))
    ),
    ssh_key_path: updates.ssh_key_path !== undefined ? updates.ssh_key_path : current.ssh_key_path,
    default_shell: updates.default_shell !== undefined ? updates.default_shell : current.default_shell,
    win_protocol: updates.win_protocol !== undefined ? updates.win_protocol : current.win_protocol,
    win_port: updates.win_port !== undefined ? Number(updates.win_port) : current.win_port,
    win_username: updates.win_username !== undefined
      ? updates.win_username.trim()
      : (updates as any).win_user !== undefined
      ? (updates as any).win_user.trim()
      : current.win_username,
    win_password: updates.prompt_password_on_connect
      ? ''
      : (updates.win_password !== undefined && updates.win_password.trim() !== ''
          ? updates.win_password.trim()
          : ((current as any).win_password || '')),
    win_password_set: Boolean(
      (updates.win_password !== undefined && updates.win_password.trim().length > 0) ||
      (!updates.prompt_password_on_connect && ((current as any).win_password && String((current as any).win_password).trim().length > 0))
    ),
    win_domain: updates.win_domain !== undefined ? updates.win_domain.trim() : (current.win_domain && current.win_domain !== 'CORP.INTERNAL' ? current.win_domain : ''),
    rdp_security: (updates.rdp_security !== undefined
      ? (['any', 'nla', 'tls', 'rdp'].includes(String(updates.rdp_security).toLowerCase()) ? String(updates.rdp_security).toLowerCase() : 'any')
      : (current.rdp_security || 'any')) as 'any' | 'nla' | 'tls' | 'rdp',
    vnc_port: updates.vnc_port !== undefined ? Number(updates.vnc_port) : (current as any).vnc_port,
    vnc_username: updates.vnc_username !== undefined ? updates.vnc_username.trim() : (current as any).vnc_username,
    vnc_password: updates.prompt_password_on_connect
      ? ''
      : (updates.vnc_password !== undefined ? updates.vnc_password : (current as any).vnc_password || ''),
    prompt_password_on_connect: updates.prompt_password_on_connect !== undefined
      ? Boolean(updates.prompt_password_on_connect)
      : (current.prompt_password_on_connect ?? false),
    installed_web_servers: updates.installed_web_servers !== undefined
      ? updates.installed_web_servers
      : (updates.has_apache !== undefined || updates.has_nginx !== undefined
          ? [
              ...((updates.has_apache ?? current.has_apache) ? ['apache'] : []),
              ...((updates.has_nginx ?? current.has_nginx) ? ['nginx'] : [])
            ]
          : (current.installed_web_servers || [])),
    installed_databases: updates.installed_databases !== undefined
      ? updates.installed_databases
      : (updates.has_postgresql !== undefined || updates.has_mysql !== undefined
          ? [
              ...((updates.has_postgresql ?? current.has_postgresql) ? ['postgresql'] : []),
              ...((updates.has_mysql ?? current.has_mysql) ? ['mysql'] : [])
            ]
          : (current.installed_databases || [])),
    has_apache: updates.has_apache !== undefined
      ? Boolean(updates.has_apache)
      : (Array.isArray(updates.installed_web_servers) ? updates.installed_web_servers.includes('apache') : (current.has_apache ?? false)),
    has_nginx: updates.has_nginx !== undefined
      ? Boolean(updates.has_nginx)
      : (Array.isArray(updates.installed_web_servers) ? updates.installed_web_servers.includes('nginx') : (current.has_nginx ?? false)),
    has_postgresql: updates.has_postgresql !== undefined
      ? Boolean(updates.has_postgresql)
      : (Array.isArray(updates.installed_databases) ? updates.installed_databases.includes('postgresql') : (current.has_postgresql ?? false)),
    has_mysql: updates.has_mysql !== undefined
      ? Boolean(updates.has_mysql)
      : (Array.isArray(updates.installed_databases) ? updates.installed_databases.includes('mysql') : (current.has_mysql ?? false)),
    postgres_port: updates.postgres_port !== undefined ? (Number(updates.postgres_port) || 5432) : (current.postgres_port || 5432),
    postgres_user: updates.postgres_user !== undefined ? updates.postgres_user.trim() : (current.postgres_user || 'postgres'),
    postgres_password: updates.postgres_password !== undefined && updates.postgres_password.trim() !== ''
      ? encryptServerSecret(updates.postgres_password.trim())
      : (current.postgres_password || ''),
    postgres_password_set: Boolean(
      (updates.postgres_password !== undefined && updates.postgres_password.trim().length > 0) ||
      (current.postgres_password && current.postgres_password.length > 0)
    ),
    postgres_database: updates.postgres_database !== undefined ? updates.postgres_database.trim() : (current.postgres_database || 'postgres'),
    server_type: updates.server_type !== undefined
      ? updates.server_type
      : current.server_type,
    web_http_port: updates.web_http_port !== undefined ? Number(updates.web_http_port) : current.web_http_port,
    web_https_port: updates.web_https_port !== undefined ? Number(updates.web_https_port) : current.web_https_port,
    mysql_port: updates.mysql_port !== undefined ? (Number(updates.mysql_port) || 3306) : (current.mysql_port || 3306),
    mysql_user: updates.mysql_user !== undefined ? updates.mysql_user.trim() : (current.mysql_user || 'root'),
    mysql_password: updates.mysql_password !== undefined && updates.mysql_password.trim() !== ''
      ? encryptServerSecret(updates.mysql_password.trim())
      : (current.mysql_password || ''),
    mysql_password_set: Boolean(
      (updates.mysql_password !== undefined && updates.mysql_password.trim().length > 0) ||
      (current.mysql_password && current.mysql_password.length > 0)
    ),
    mysql_database: updates.mysql_database !== undefined ? updates.mysql_database.trim() : (current.mysql_database || 'mysql'),
    status: updates.status !== undefined ? updates.status : (current.status || 'untested'),
    cpu_cores: updates.cpu_cores !== undefined ? (updates.cpu_cores !== null && Number(updates.cpu_cores) > 0 ? Number(updates.cpu_cores) : undefined) : current.cpu_cores,
    ram_gb: updates.ram_gb !== undefined ? (updates.ram_gb !== null && Number(updates.ram_gb) > 0 ? Number(updates.ram_gb) : undefined) : current.ram_gb,
    disk_gb: updates.disk_gb !== undefined ? (updates.disk_gb !== null && Number(updates.disk_gb) > 0 ? Number(updates.disk_gb) : undefined) : current.disk_gb,
    uptime_str: updates.uptime_str !== undefined ? updates.uptime_str : current.uptime_str,
    location: updates.location !== undefined ? updates.location.trim() : current.location,
    notes: updates.notes !== undefined ? updates.notes.trim() : (updates.description !== undefined ? updates.description.trim() : (current.notes || current.description || '')),
    description: updates.description !== undefined ? updates.description.trim() : (updates.notes !== undefined ? updates.notes.trim() : (current.description || current.notes || '')),
    ssh_vault_item_id: updates.ssh_vault_item_id !== undefined ? (updates.ssh_vault_item_id ? updates.ssh_vault_item_id.trim() : undefined) : current.ssh_vault_item_id,
    win_vault_item_id: updates.win_vault_item_id !== undefined ? (updates.win_vault_item_id ? updates.win_vault_item_id.trim() : undefined) : current.win_vault_item_id,
    db_vault_item_id: updates.db_vault_item_id !== undefined ? (updates.db_vault_item_id ? updates.db_vault_item_id.trim() : undefined) : current.db_vault_item_id,
    updated_at: new Date().toISOString(),
  };

  // 2. Persist in fallback store
  if (storeIdx >= 0) {
    store.remote_servers[storeIdx] = updated;
  } else {
    const existingIdx = store.remote_servers.findIndex((s) => s.id === targetId);
    if (existingIdx >= 0) {
      store.remote_servers[existingIdx] = updated;
    } else {
      store.remote_servers.push(updated);
    }
  }
  saveFallbackStore(store);

  // 3. Upsert / Update in PostgreSQL
  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      await pool.query(
        `INSERT INTO remote_servers (
          id, name, hostname, ip, os_type, os_distro, environment, category, role, tags,
          ssh_port, ssh_username, ssh_password, ssh_key_path, default_shell,
          win_protocol, win_port, win_username, win_password, win_domain, rdp_security,
          status, cpu_cores, ram_gb, disk_gb, uptime_str, location, notes,
          prompt_password_on_connect,
          installed_web_servers, installed_databases, has_apache, has_nginx, has_postgresql, has_mysql,
          postgres_port, postgres_user, postgres_password, postgres_database,
          server_type, mysql_port, mysql_user, mysql_password, mysql_database, web_http_port, web_https_port,
          ssh_vault_item_id, win_vault_item_id, db_vault_item_id,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          hostname = EXCLUDED.hostname,
          ip = EXCLUDED.ip,
          os_type = EXCLUDED.os_type,
          os_distro = EXCLUDED.os_distro,
          environment = EXCLUDED.environment,
          category = EXCLUDED.category,
          role = EXCLUDED.role,
          tags = EXCLUDED.tags,
          ssh_port = EXCLUDED.ssh_port,
          ssh_username = EXCLUDED.ssh_username,
          ssh_password = EXCLUDED.ssh_password,
          ssh_key_path = EXCLUDED.ssh_key_path,
          default_shell = EXCLUDED.default_shell,
          win_protocol = EXCLUDED.win_protocol,
          win_port = EXCLUDED.win_port,
          win_username = EXCLUDED.win_username,
          win_password = EXCLUDED.win_password,
          win_domain = EXCLUDED.win_domain,
          rdp_security = EXCLUDED.rdp_security,
          status = EXCLUDED.status,
          cpu_cores = EXCLUDED.cpu_cores,
          ram_gb = EXCLUDED.ram_gb,
          disk_gb = EXCLUDED.disk_gb,
          uptime_str = EXCLUDED.uptime_str,
          location = EXCLUDED.location,
          notes = EXCLUDED.notes,
          prompt_password_on_connect = EXCLUDED.prompt_password_on_connect,
          installed_web_servers = EXCLUDED.installed_web_servers,
          installed_databases = EXCLUDED.installed_databases,
          has_apache = EXCLUDED.has_apache,
          has_nginx = EXCLUDED.has_nginx,
          has_postgresql = EXCLUDED.has_postgresql,
          has_mysql = EXCLUDED.has_mysql,
          postgres_port = EXCLUDED.postgres_port,
          postgres_user = EXCLUDED.postgres_user,
          postgres_password = EXCLUDED.postgres_password,
          postgres_database = EXCLUDED.postgres_database,
          server_type = EXCLUDED.server_type,
          mysql_port = EXCLUDED.mysql_port,
          mysql_user = EXCLUDED.mysql_user,
          mysql_password = EXCLUDED.mysql_password,
          mysql_database = EXCLUDED.mysql_database,
          web_http_port = EXCLUDED.web_http_port,
          web_https_port = EXCLUDED.web_https_port,
          ssh_vault_item_id = EXCLUDED.ssh_vault_item_id,
          win_vault_item_id = EXCLUDED.win_vault_item_id,
          db_vault_item_id = EXCLUDED.db_vault_item_id,
          updated_at = NOW()`,
        [
          updated.id,
          updated.name,
          updated.hostname || '',
          updated.ip,
          updated.os_type,
          updated.os_distro || '',
          updated.environment,
          updated.category,
          updated.role || 'General Server',
          JSON.stringify(updated.tags || []),
          updated.ssh_port,
          updated.ssh_username,
          updated.ssh_password,
          updated.ssh_key_path,
          updated.default_shell,
          updated.win_protocol,
          updated.win_port,
          updated.win_username,
          updated.win_password || '',
          updated.win_domain || '',
          updated.rdp_security || 'any',
          updated.status,
          updated.cpu_cores,
          updated.ram_gb,
          updated.disk_gb,
          updated.uptime_str,
          updated.location,
          updated.notes,
          Boolean(updated.prompt_password_on_connect),
          JSON.stringify(updated.installed_web_servers || []),
          JSON.stringify(updated.installed_databases || []),
          Boolean(updated.has_apache),
          Boolean(updated.has_nginx),
          Boolean(updated.has_postgresql),
          Boolean(updated.has_mysql),
          updated.postgres_port || 5432,
          updated.postgres_user || 'postgres',
          updated.postgres_password || '',
          updated.postgres_database || 'postgres',
          updated.server_type || 'linux',
          updated.mysql_port || 3306,
          updated.mysql_user || 'root',
          updated.mysql_password || '',
          updated.mysql_database || 'mysql',
          updated.web_http_port || 80,
          updated.web_https_port || 443,
          updated.ssh_vault_item_id || null,
          updated.win_vault_item_id || null,
          updated.db_vault_item_id || null,
          updated.created_at || new Date().toISOString(),
          updated.updated_at,
        ]
      );
    } catch (e) {
      console.error('[DB Error updateRemoteServer in PostgreSQL]', e);
    }
  }

  return updated;
}

export async function deleteRemoteServer(id: string): Promise<boolean> {
  const cleanId = (id || '').trim();
  if (!cleanId) return false;

  const store = loadFallbackStore();
  if (!Array.isArray(store.remote_servers)) {
    store.remote_servers = [];
  }
  const prevLen = store.remote_servers.length;
  store.remote_servers = store.remote_servers.filter(
    (s) => s.id !== cleanId && s.id.toLowerCase() !== cleanId.toLowerCase()
  );
  if (store.remote_servers.length !== prevLen) {
    saveFallbackStore(store);
  }

  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      await pool.query('DELETE FROM remote_servers WHERE id = $1 OR LOWER(id) = LOWER($1)', [cleanId]);
    } catch (e) {
      console.error('[DB Error deleteRemoteServer in PostgreSQL]', e);
    }
  }
  return true;
}

export async function updateRemoteServerTags(id: string, tags: string[]): Promise<RemoteServer | null> {
  const cleanTags = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)));
  return updateRemoteServer(id, { tags: cleanTags });
}

export async function getRemoteServerTagsSummary(): Promise<{ tag: string; count: number }[]> {
  const servers = await getAllRemoteServers();
  const counts: Record<string, number> = {};
  for (const s of servers) {
    if (Array.isArray(s.tags)) {
      for (const t of s.tags) {
        if (t) {
          counts[t] = (counts[t] || 0) + 1;
        }
      }
    }
  }
  return Object.entries(counts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

// ==========================================
// SERVER CATEGORIES CRUD & REASSIGN OPERATIONS
// ==========================================

export async function getAllServerCategories(): Promise<ServerCategory[]> {
  const store = loadFallbackStore();
  if (!Array.isArray(store.server_categories) || store.server_categories.length === 0) {
    store.server_categories = [...DEFAULT_SERVER_CATEGORIES];
    saveFallbackStore(store);
  }

  // Live count calculation
  const allServers = await getAllRemoteServers();
  const countsByName: Record<string, number> = {};
  for (const s of allServers) {
    const cat = (s.category || 'Uncategorized').trim().toLowerCase();
    countsByName[cat] = (countsByName[cat] || 0) + 1;
  }

  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT * FROM server_categories ORDER BY is_default DESC, name ASC');
      if (res.rows && res.rows.length > 0) {
        return res.rows.map((r: any) => ({
          id: r.id,
          name: r.name,
          name_fa: r.name_fa || r.name,
          description: r.description || '',
          color: r.color || 'indigo',
          is_default: Boolean(r.is_default),
          serverCount: countsByName[r.name.trim().toLowerCase()] || 0,
          created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
        }));
      }
    } catch (e) {
      console.warn('[DB Error getAllServerCategories, falling back to local store]', e);
    }
  }

  return store.server_categories.map((c) => ({
    ...c,
    serverCount: countsByName[c.name.trim().toLowerCase()] || 0,
  }));
}

export async function getServerCategoryById(id: string): Promise<ServerCategory | null> {
  const cleanId = (id || '').trim();
  if (!cleanId) return null;

  const cats = await getAllServerCategories();
  return cats.find((c) => c.id === cleanId || c.name.toLowerCase() === cleanId.toLowerCase()) || null;
}

export async function createServerCategory(data: Partial<ServerCategory>): Promise<ServerCategory> {
  const rawName = (data.name || '').trim();
  if (!rawName) {
    throw new Error('Category name is required');
  }

  const existing = await getAllServerCategories();
  const duplicate = existing.find((c) => c.name.toLowerCase() === rawName.toLowerCase());
  if (duplicate) {
    throw new Error(`Category "${rawName}" already exists`);
  }

  const slug = rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || Date.now().toString(36);
  const id = `cat-${slug}-${Date.now().toString(36).slice(-4)}`;
  const now = new Date().toISOString();

  const newCat: ServerCategory = {
    id,
    name: rawName,
    name_fa: data.name_fa?.trim() || rawName,
    description: data.description?.trim() || '',
    color: data.color?.trim() || 'indigo',
    is_default: false,
    serverCount: 0,
    created_at: now,
    updated_at: now,
  };

  const store = loadFallbackStore();
  if (!Array.isArray(store.server_categories)) {
    store.server_categories = [...DEFAULT_SERVER_CATEGORIES];
  }
  store.server_categories.push(newCat);
  saveFallbackStore(store);

  // PostgreSQL write
  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      await pool.query(
        `INSERT INTO server_categories (id, name, name_fa, description, color, is_default, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           name_fa = EXCLUDED.name_fa,
           description = EXCLUDED.description,
           color = EXCLUDED.color,
           updated_at = EXCLUDED.updated_at`,
        [newCat.id, newCat.name, newCat.name_fa, newCat.description, newCat.color, newCat.is_default, newCat.created_at, newCat.updated_at]
      );
    } catch (e) {
      console.error('[DB Error createServerCategory in PostgreSQL]', e);
    }
  }

  return newCat;
}

export async function updateServerCategory(id: string, updates: Partial<ServerCategory>): Promise<ServerCategory | null> {
  const cleanId = (id || '').trim();
  const store = loadFallbackStore();
  if (!Array.isArray(store.server_categories)) {
    store.server_categories = [...DEFAULT_SERVER_CATEGORIES];
  }

  const idx = store.server_categories.findIndex((c) => c.id === cleanId || c.name.toLowerCase() === cleanId.toLowerCase());
  if (idx < 0) {
    return null;
  }

  const current = store.server_categories[idx];
  const oldName = current.name;
  const newName = updates.name !== undefined ? updates.name.trim() : current.name;

  if (!newName) {
    throw new Error('Category name cannot be empty');
  }

  // If renaming, check for name collision
  if (newName.toLowerCase() !== oldName.toLowerCase()) {
    const duplicate = store.server_categories.find(
      (c) => c.id !== current.id && c.name.toLowerCase() === newName.toLowerCase()
    );
    if (duplicate) {
      throw new Error(`Category name "${newName}" is already in use`);
    }
  }

  const now = new Date().toISOString();
  const updated: ServerCategory = {
    ...current,
    name: newName,
    name_fa: updates.name_fa !== undefined ? updates.name_fa.trim() : current.name_fa,
    description: updates.description !== undefined ? updates.description.trim() : current.description,
    color: updates.color !== undefined ? updates.color.trim() : current.color,
    updated_at: now,
  };

  store.server_categories[idx] = updated;

  // CASCADE: If the category was renamed, update all servers using the old name!
  let serversUpdated = 0;
  if (newName !== oldName && Array.isArray(store.remote_servers)) {
    for (const s of store.remote_servers) {
      if (s.category && s.category.toLowerCase() === oldName.toLowerCase()) {
        s.category = newName;
        s.updated_at = now;
        serversUpdated++;
      }
    }
  }

  saveFallbackStore(store);

  // PostgreSQL update
  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      await pool.query(
        `UPDATE server_categories SET
           name = $1, name_fa = $2, description = $3, color = $4, updated_at = $5
         WHERE id = $6`,
        [updated.name, updated.name_fa, updated.description, updated.color, updated.updated_at, updated.id]
      );
      if (newName !== oldName && serversUpdated > 0) {
        await pool.query('UPDATE remote_servers SET category = $1 WHERE LOWER(category) = LOWER($2)', [newName, oldName]);
      }
    } catch (e) {
      console.error('[DB Error updateServerCategory in PostgreSQL]', e);
    }
  }

  const count = (await getAllRemoteServers()).filter((s) => s.category?.toLowerCase() === updated.name.toLowerCase()).length;
  return { ...updated, serverCount: count };
}

export async function deleteServerCategory(
  id: string,
  reassignTo?: string
): Promise<{ success: boolean; reassignedCount: number; targetCategory: string }> {
  const cleanId = (id || '').trim();
  const store = loadFallbackStore();
  if (!Array.isArray(store.server_categories)) {
    store.server_categories = [...DEFAULT_SERVER_CATEGORIES];
  }

  const catToDelete = store.server_categories.find(
    (c) => c.id === cleanId || c.name.toLowerCase() === cleanId.toLowerCase()
  );
  if (!catToDelete) {
    throw new Error('Category not found');
  }

  // Protection: Do not allow deleting "Uncategorized" as it's the core system fallback!
  if (catToDelete.name.toLowerCase() === 'uncategorized') {
    throw new Error('The default "Uncategorized" system category cannot be deleted.');
  }

  // Determine target category for reassigning any assigned servers
  let targetCatName = (reassignTo || '').trim();
  if (!targetCatName) {
    targetCatName = 'Uncategorized';
  }

  // Check if target category exists, if not ensure Uncategorized is available
  let targetCat = store.server_categories.find(
    (c) => c.name.toLowerCase() === targetCatName.toLowerCase()
  );
  if (!targetCat) {
    targetCat = store.server_categories.find((c) => c.name.toLowerCase() === 'uncategorized');
    if (!targetCat) {
      targetCat = {
        id: 'cat-uncategorized',
        name: 'Uncategorized',
        name_fa: 'دسته‌بندی‌نشده',
        description: 'Default fallback category',
        color: 'slate',
        is_default: true,
      };
      store.server_categories.push(targetCat);
    }
    targetCatName = targetCat.name;
  }

  // Reassign all servers that belonged to the deleted category
  const now = new Date().toISOString();
  let reassignedCount = 0;
  if (Array.isArray(store.remote_servers)) {
    for (const s of store.remote_servers) {
      if (s.category && s.category.toLowerCase() === catToDelete.name.toLowerCase()) {
        s.category = targetCatName;
        s.updated_at = now;
        reassignedCount++;
      }
    }
  }

  // Remove category from store
  store.server_categories = store.server_categories.filter((c) => c.id !== catToDelete.id);
  saveFallbackStore(store);

  // PostgreSQL operations
  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      if (reassignedCount > 0) {
        await pool.query(
          'UPDATE remote_servers SET category = $1 WHERE LOWER(category) = LOWER($2)',
          [targetCatName, catToDelete.name]
        );
      }
      await pool.query('DELETE FROM server_categories WHERE id = $1', [catToDelete.id]);
    } catch (e) {
      console.error('[DB Error deleteServerCategory in PostgreSQL]', e);
    }
  }

  return { success: true, reassignedCount, targetCategory: targetCatName };
}

// =============================================================================
// SYSTEM SECURITY KEYCHAIN DATABASE MANAGEMENT (PERSISTENT CIPHER MASTER KEYS)
// =============================================================================

// In-memory cache for ultra-fast crypto resolution across high-throughput connections
let cachedSecurityKeychain: SecurityKeychain | null = null;

export function getCachedSecurityKeychain(): SecurityKeychain | null {
  return cachedSecurityKeychain;
}

export async function getDatabaseSecurityKeys(keyName: string = 'vault_master'): Promise<SecurityKeychain> {
  // If cached and valid, return cache
  if (cachedSecurityKeychain && cachedSecurityKeychain.masterKey) {
    return cachedSecurityKeychain;
  }

  await ensurePostgresConnection();

  if (isPostgresReady && pool) {
    try {
      const res = await pool.query(
        'SELECT key_name, master_key, legacy_keys, created_at, updated_at FROM system_security_keys WHERE key_name = $1 LIMIT 1',
        [keyName]
      );
      if (res && res.rows.length > 0) {
        const row = res.rows[0];
        let legacy: string[] = [];
        if (Array.isArray(row.legacy_keys)) {
          legacy = row.legacy_keys;
        } else if (typeof row.legacy_keys === 'string') {
          try { legacy = JSON.parse(row.legacy_keys); } catch {}
        }
        cachedSecurityKeychain = {
          masterKey: row.master_key,
          legacyKeys: Array.isArray(legacy) ? legacy : [],
        };
        return cachedSecurityKeychain;
      }
    } catch (err: any) {
      console.warn('[Security Keychain DB Warning]', err.message);
    }
  }

  // Fallback file-backed store
  const store = loadFallbackStore();
  const list = Array.isArray(store.system_security_keys) ? store.system_security_keys : [];
  const found = list.find((k) => k.key_name === keyName);
  if (found) {
    cachedSecurityKeychain = {
      masterKey: found.master_key,
      legacyKeys: Array.isArray(found.legacy_keys) ? found.legacy_keys : [],
    };
    return cachedSecurityKeychain;
  }

  return {
    masterKey: '',
    legacyKeys: [],
  };
}

export async function saveDatabaseSecurityKeys(
  keyName: string = 'vault_master',
  masterKey: string,
  legacyKeys: string[] = []
): Promise<SecurityKeychain> {
  const cleanLegacies = Array.from(new Set(legacyKeys.filter(Boolean)));
  cachedSecurityKeychain = {
    masterKey,
    legacyKeys: cleanLegacies,
  };

  await ensurePostgresConnection();

  if (isPostgresReady && pool) {
    try {
      await pool.query(
        `INSERT INTO system_security_keys (key_name, master_key, legacy_keys, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (key_name) DO UPDATE SET
           master_key = EXCLUDED.master_key,
           legacy_keys = EXCLUDED.legacy_keys,
           updated_at = CURRENT_TIMESTAMP`,
        [keyName, masterKey, JSON.stringify(cleanLegacies)]
      );
    } catch (err: any) {
      console.warn('[Save Security Keychain DB Warning]', err.message);
    }
  }

  // Persist to fallback store as well
  const store = loadFallbackStore();
  if (!Array.isArray(store.system_security_keys)) {
    store.system_security_keys = [];
  }
  const idx = store.system_security_keys.findIndex((k) => k.key_name === keyName);
  const nowIso = new Date().toISOString();
  if (idx >= 0) {
    store.system_security_keys[idx].master_key = masterKey;
    store.system_security_keys[idx].legacy_keys = cleanLegacies;
    store.system_security_keys[idx].updated_at = nowIso;
  } else {
    store.system_security_keys.push({
      key_name: keyName,
      master_key: masterKey,
      legacy_keys: cleanLegacies,
      created_at: nowIso,
      updated_at: nowIso,
    });
  }
  saveFallbackStore(store);

  return cachedSecurityKeychain;
}

/**
 * Initializes and synchronizes the authoritative security keychain in the database.
 * If no master key exists in PostgreSQL, it creates one seeded from .env (or random bytes),
 * and permanently anchors it in the database so that future panel updates never lose credentials.
 * Also captures any environment secrets into the database legacy keychain.
 */
export async function initOrLoadSystemSecurityKeys(client?: PoolClient): Promise<SecurityKeychain> {
  const keyName = 'vault_master';
  let existingMaster = '';
  let existingLegacies: string[] = [];

  // Check PostgreSQL first
  if (client) {
    try {
      const res = await client.query(
        'SELECT key_name, master_key, legacy_keys FROM system_security_keys WHERE key_name = $1 LIMIT 1',
        [keyName]
      );
      if (res && res.rows.length > 0) {
        existingMaster = res.rows[0].master_key;
        const rawLeg = res.rows[0].legacy_keys;
        existingLegacies = Array.isArray(rawLeg) ? rawLeg : typeof rawLeg === 'string' ? JSON.parse(rawLeg) : [];
      }
    } catch (err: any) {
      console.warn('[initOrLoadSystemSecurityKeys DB Error]', err.message);
    }
  }

  // If not found in PG, check fallback store
  if (!existingMaster) {
    const store = loadFallbackStore();
    const list = Array.isArray(store.system_security_keys) ? store.system_security_keys : [];
    const found = list.find((k) => k.key_name === keyName);
    if (found) {
      existingMaster = found.master_key;
      existingLegacies = Array.isArray(found.legacy_keys) ? found.legacy_keys : [];
    }
  }

  // Candidate legacy keys from known hardcoded defaults and environment
  const envCandidates = [
    process.env.VAULT_SECRET,
    process.env.JWT_SECRET,
    process.env.SESSION_SECRET,
    'nettopology_vault_master_key_2026_aes256gcm_safe',
    'nettopology_super_secret_jwt_key_2026_cisco_ops',
  ].filter((k): k is string => Boolean(k && typeof k === 'string' && k.trim().length > 0));

  let finalMaster = existingMaster;
  if (!finalMaster) {
    // First-time initialization: Pick best candidate from env, or generate a cryptographically secure 32-byte master key
    finalMaster =
      process.env.VAULT_SECRET ||
      process.env.JWT_SECRET ||
      crypto.randomBytes(32).toString('hex');
  }

  // Merge all candidates into legacy_keys list (excluding finalMaster)
  const mergedLegacies = Array.from(
    new Set([
      ...existingLegacies,
      ...envCandidates,
    ].filter((k) => Boolean(k) && k !== finalMaster))
  );

  // Anchor authoritatively in PostgreSQL
  if (client) {
    try {
      await client.query(
        `INSERT INTO system_security_keys (key_name, master_key, legacy_keys, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (key_name) DO UPDATE SET
           master_key = EXCLUDED.master_key,
           legacy_keys = EXCLUDED.legacy_keys,
           updated_at = CURRENT_TIMESTAMP`,
        [keyName, finalMaster, JSON.stringify(mergedLegacies)]
      );
    } catch (err: any) {
      console.warn('[initOrLoadSystemSecurityKeys Anchor Error]', err.message);
    }
  }

  // Also persist to fallback store
  const store = loadFallbackStore();
  if (!Array.isArray(store.system_security_keys)) {
    store.system_security_keys = [];
  }
  const idx = store.system_security_keys.findIndex((k) => k.key_name === keyName);
  const nowIso = new Date().toISOString();
  if (idx >= 0) {
    store.system_security_keys[idx].master_key = finalMaster;
    store.system_security_keys[idx].legacy_keys = mergedLegacies;
    store.system_security_keys[idx].updated_at = nowIso;
  } else {
    store.system_security_keys.push({
      key_name: keyName,
      master_key: finalMaster,
      legacy_keys: mergedLegacies,
      created_at: nowIso,
      updated_at: nowIso,
    });
  }
  saveFallbackStore(store);

  cachedSecurityKeychain = {
    masterKey: finalMaster,
    legacyKeys: mergedLegacies,
  };

  console.log(`[Security Keychain] Authoritative database keychain initialized (Master Key anchored, ${mergedLegacies.length} legacy keys retained).`);
  return cachedSecurityKeychain;
}

/**
 * Authoritative alias functions matching the Database Keychain specification
 */
export const loadSecurityKeysFromDb = getDatabaseSecurityKeys;
export const syncSecurityKeyToDb = initOrLoadSystemSecurityKeys;

// =============================================================================
// USER PASSWORD VAULT CRUD (PER-USER ISOLATED)
// =============================================================================

export async function getUserVaultItems(userId: string): Promise<UserVaultItem[]> {
  if (!userId) return [];
  await ensurePostgresConnection();

  if (isPostgresReady && pool) {
    try {
      const res = await pool.query(
        'SELECT * FROM user_password_vault WHERE user_id = $1 ORDER BY updated_at DESC',
        [userId]
      );
      if (res && Array.isArray(res.rows)) {
        return res.rows.map((r: any) => ({
          id: r.id,
          user_id: r.user_id,
          name: r.name,
          username: r.username || '',
          encrypted_password: r.encrypted_password,
          iv: r.iv,
          tag: r.tag,
          password_hash: r.password_hash || undefined,
          password_salt: r.password_salt || undefined,
          category: r.category || 'general',
          target_host: r.target_host || '',
          notes: r.notes || '',
          tags: Array.isArray(r.tags) ? r.tags : typeof r.tags === 'string' ? JSON.parse(r.tags || '[]') : [],
          strength: r.strength || 'strong',
          created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
        }));
      }
    } catch (e: any) {
      console.warn('[DB Error getUserVaultItems from PostgreSQL, fallback used]:', e.message);
    }
  }

  const store = loadFallbackStore();
  const list = Array.isArray(store.user_password_vault) ? store.user_password_vault : [];
  return list.filter((item) => item.user_id === userId);
}

export async function getUserVaultItemById(id: string, userId: string): Promise<UserVaultItem | null> {
  if (!id || !userId) return null;
  await ensurePostgresConnection();

  if (isPostgresReady && pool) {
    try {
      const res = await pool.query(
        'SELECT * FROM user_password_vault WHERE id = $1 AND user_id = $2 LIMIT 1',
        [id, userId]
      );
      if (res && res.rows.length > 0) {
        const r = res.rows[0];
        return {
          id: r.id,
          user_id: r.user_id,
          name: r.name,
          username: r.username || '',
          encrypted_password: r.encrypted_password,
          iv: r.iv,
          tag: r.tag,
          password_hash: r.password_hash || undefined,
          password_salt: r.password_salt || undefined,
          category: r.category || 'general',
          target_host: r.target_host || '',
          notes: r.notes || '',
          tags: Array.isArray(r.tags) ? r.tags : typeof r.tags === 'string' ? JSON.parse(r.tags || '[]') : [],
          strength: r.strength || 'strong',
          created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
        };
      }
      return null;
    } catch (e: any) {
      console.warn('[DB Error getUserVaultItemById from PostgreSQL, fallback used]:', e.message);
    }
  }

  const store = loadFallbackStore();
  const list = Array.isArray(store.user_password_vault) ? store.user_password_vault : [];
  const found = list.find((item) => item.id === id && item.user_id === userId);
  return found || null;
}

export async function saveUserVaultItem(item: UserVaultItem): Promise<UserVaultItem> {
  const store = loadFallbackStore();
  if (!Array.isArray(store.user_password_vault)) {
    store.user_password_vault = [];
  }

  const now = new Date().toISOString();
  const normalized: UserVaultItem = {
    id: item.id || `vault_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    user_id: item.user_id,
    name: item.name.trim(),
    username: (item.username || '').trim(),
    encrypted_password: item.encrypted_password,
    iv: item.iv,
    tag: item.tag,
    password_hash: item.password_hash || undefined,
    password_salt: item.password_salt || undefined,
    category: item.category || 'general',
    target_host: (item.target_host || '').trim(),
    notes: (item.notes || '').trim(),
    tags: Array.isArray(item.tags) ? item.tags : [],
    strength: item.strength || 'strong',
    created_at: item.created_at || now,
    updated_at: now,
  };

  const existingIdx = store.user_password_vault.findIndex(
    (x) => x.id === normalized.id && x.user_id === normalized.user_id
  );

  if (existingIdx >= 0) {
    store.user_password_vault[existingIdx] = normalized;
  } else {
    store.user_password_vault.unshift(normalized);
  }

  saveFallbackStore(store);

  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      await pool.query(
        `INSERT INTO user_password_vault (
          id, user_id, name, username, encrypted_password, iv, tag, password_hash, password_salt, category, target_host, notes, tags, strength, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          username = EXCLUDED.username,
          encrypted_password = EXCLUDED.encrypted_password,
          iv = EXCLUDED.iv,
          tag = EXCLUDED.tag,
          password_hash = EXCLUDED.password_hash,
          password_salt = EXCLUDED.password_salt,
          category = EXCLUDED.category,
          target_host = EXCLUDED.target_host,
          notes = EXCLUDED.notes,
          tags = EXCLUDED.tags,
          strength = EXCLUDED.strength,
          updated_at = EXCLUDED.updated_at`,
        [
          normalized.id,
          normalized.user_id,
          normalized.name,
          normalized.username,
          normalized.encrypted_password,
          normalized.iv,
          normalized.tag,
          normalized.password_hash || '',
          normalized.password_salt || '',
          normalized.category,
          normalized.target_host,
          normalized.notes,
          JSON.stringify(normalized.tags),
          normalized.strength,
          normalized.created_at,
          normalized.updated_at,
        ]
      );
    } catch (e: any) {
      console.error('[DB Error saveUserVaultItem in PostgreSQL]', e.message);
    }
  }

  return normalized;
}

export async function deleteUserVaultItem(id: string, userId: string): Promise<boolean> {
  const store = loadFallbackStore();
  if (!Array.isArray(store.user_password_vault)) {
    store.user_password_vault = [];
  }

  const initialLen = store.user_password_vault.length;
  store.user_password_vault = store.user_password_vault.filter(
    (x) => !(x.id === id && x.user_id === userId)
  );

  const deletedInFallback = store.user_password_vault.length < initialLen;

  // Safely nullify references in fallback store devices
  if (Array.isArray(store.devices)) {
    for (const d of store.devices) {
      if (d.ssh_vault_item_id === id) d.ssh_vault_item_id = undefined;
      if (d.enable_vault_item_id === id) d.enable_vault_item_id = undefined;
      if (d.snmp_community_vault_item_id === id) d.snmp_community_vault_item_id = undefined;
      if (d.snmp_v3_auth_vault_item_id === id) d.snmp_v3_auth_vault_item_id = undefined;
      if (d.snmp_v3_priv_vault_item_id === id) d.snmp_v3_priv_vault_item_id = undefined;
    }
  }

  // Safely nullify references in fallback store remote_servers
  if (Array.isArray(store.remote_servers)) {
    for (const s of store.remote_servers) {
      if (s.ssh_vault_item_id === id) s.ssh_vault_item_id = undefined;
      if (s.win_vault_item_id === id) s.win_vault_item_id = undefined;
      if (s.db_vault_item_id === id) s.db_vault_item_id = undefined;
    }
  }

  if (deletedInFallback) {
    saveFallbackStore(store);
  }

  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      await pool.query(
        `UPDATE devices SET
          ssh_vault_item_id = CASE WHEN ssh_vault_item_id = $1 THEN NULL ELSE ssh_vault_item_id END,
          enable_vault_item_id = CASE WHEN enable_vault_item_id = $1 THEN NULL ELSE enable_vault_item_id END,
          snmp_community_vault_item_id = CASE WHEN snmp_community_vault_item_id = $1 THEN NULL ELSE snmp_community_vault_item_id END,
          snmp_v3_auth_vault_item_id = CASE WHEN snmp_v3_auth_vault_item_id = $1 THEN NULL ELSE snmp_v3_auth_vault_item_id END,
          snmp_v3_priv_vault_item_id = CASE WHEN snmp_v3_priv_vault_item_id = $1 THEN NULL ELSE snmp_v3_priv_vault_item_id END
        WHERE ssh_vault_item_id = $1 OR enable_vault_item_id = $1 OR snmp_community_vault_item_id = $1 OR snmp_v3_auth_vault_item_id = $1 OR snmp_v3_priv_vault_item_id = $1`,
        [id]
      );
      await pool.query(
        `UPDATE remote_servers SET
          ssh_vault_item_id = CASE WHEN ssh_vault_item_id = $1 THEN NULL ELSE ssh_vault_item_id END,
          win_vault_item_id = CASE WHEN win_vault_item_id = $1 THEN NULL ELSE win_vault_item_id END,
          db_vault_item_id = CASE WHEN db_vault_item_id = $1 THEN NULL ELSE db_vault_item_id END
        WHERE ssh_vault_item_id = $1 OR win_vault_item_id = $1 OR db_vault_item_id = $1`,
        [id]
      );

      const res = await pool.query(
        'DELETE FROM user_password_vault WHERE id = $1 AND user_id = $2',
        [id, userId]
      );
      return (res && (res.rowCount || 0) > 0) || deletedInFallback;
    } catch (e: any) {
      console.error('[DB Error deleteUserVaultItem in PostgreSQL]', e.message);
    }
  }

  return deletedInFallback;
}

export interface CascadeSyncTargetItem {
  id: string;
  name: string;
  ip?: string;
  type: 'ssh' | 'enable' | 'both' | 'win' | 'db';
}

export interface CascadeSyncResult {
  vaultItemId: string;
  vaultItemName: string;
  affectedDevices: CascadeSyncTargetItem[];
  affectedServers: CascadeSyncTargetItem[];
  totalDevicesCount: number;
  totalServersCount: number;
}

/**
 * Retrieves a vault item authoritatively by its unique identifier across users.
 * Checks PostgreSQL first, with seamless fallback to database_store.
 */
export async function getVaultItemById(id: string): Promise<UserVaultItem | null> {
  if (!id || typeof id !== 'string') return null;
  const cleanId = id.trim();
  if (!cleanId) return null;

  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query(
        'SELECT * FROM user_password_vault WHERE id = $1 LIMIT 1',
        [cleanId]
      );
      if (res && res.rows.length > 0) {
        const r = res.rows[0];
        return {
          id: r.id,
          user_id: r.user_id,
          name: r.name,
          username: r.username || '',
          encrypted_password: r.encrypted_password,
          iv: r.iv,
          tag: r.tag,
          password_hash: r.password_hash || undefined,
          password_salt: r.password_salt || undefined,
          category: r.category || 'general',
          target_host: r.target_host || '',
          notes: r.notes || '',
          tags: Array.isArray(r.tags) ? r.tags : typeof r.tags === 'string' ? JSON.parse(r.tags || '[]') : [],
          strength: r.strength || 'strong',
          created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
        };
      }
    } catch (e: any) {
      console.warn('[DB Error getVaultItemById from PostgreSQL, fallback used]:', e.message);
    }
  }

  const store = loadFallbackStore();
  const list = Array.isArray(store.user_password_vault) ? store.user_password_vault : [];
  const found = list.find((item: any) => item.id === cleanId);
  return found || null;
}

/**
 * Real-time Dynamic Credential Resolver:
 * Directly fetches the authentic, live encrypted secret from the vault record and
 * decrypts it in-flight using AES-256-GCM. Ensures zero staleness and zero plain-text storage.
 */
export async function resolveDynamicVaultPassword(
  vaultItemId: string | undefined | null
): Promise<string | null> {
  if (!vaultItemId || typeof vaultItemId !== 'string') return null;
  const cleanId = vaultItemId.trim();
  if (!cleanId) return null;

  try {
    const item = await getVaultItemById(cleanId);
    if (!item || !item.encrypted_password || !item.iv || !item.tag) {
      return null;
    }
    const decryptResult = decryptVaultSecretWithMeta(item.encrypted_password, item.iv, item.tag, item.user_id);
    if (decryptResult.isLegacyKey && decryptResult.newPayload) {
      saveUserVaultItem({
        ...item,
        encrypted_password: decryptResult.newPayload.ciphertext,
        iv: decryptResult.newPayload.iv,
        tag: decryptResult.newPayload.tag,
        password_hash: decryptResult.newPayload.hash,
        password_salt: decryptResult.newPayload.salt,
        updated_at: new Date().toISOString(),
      }).catch(() => {});
    }
    return decryptResult.plainText || null;
  } catch (err: any) {
    console.warn(`[resolveDynamicVaultPassword] Decryption failure for vault item "${cleanId}":`, err.message);
    return null;
  }
}

/**
 * Resolves authentic credentials for a network device (Cisco, MikroTik, switch, router).
 * Inspects dynamic vault binding for SSH/Telnet and enable modes first.
 */
export async function resolveDeviceCredentials(device: any): Promise<{
  username: string;
  password: string;
  enablePassword: string;
  isPasswordFromVault: boolean;
  isEnableFromVault: boolean;
  vaultItemName?: string;
  enableVaultItemName?: string;
}> {
  let username = device?.ssh_username || device?.connection?.username || 'admin';
  let password = '';
  let enablePassword = '';
  let isPasswordFromVault = false;
  let isEnableFromVault = false;
  let vaultItemName: string | undefined;
  let enableVaultItemName: string | undefined;

  // 1. Resolve SSH Password: Dynamic Vault First
  if (device?.ssh_vault_item_id) {
    const vaultItem = await getVaultItemById(device.ssh_vault_item_id);
    if (vaultItem) {
      vaultItemName = vaultItem.name;
      if (vaultItem.username && (!device.ssh_username || device.ssh_username === 'admin')) {
        username = vaultItem.username;
      }
      try {
        const decResult = decryptVaultSecretWithMeta(
          vaultItem.encrypted_password,
          vaultItem.iv,
          vaultItem.tag,
          vaultItem.user_id
        );
        if (decResult.plainText) {
          password = decResult.plainText;
          isPasswordFromVault = true;
          if (decResult.isLegacyKey && decResult.newPayload) {
            console.log(`[Device Vault Auto-Heal] Upgrading legacy SSH vault credential for "${vaultItem.name}" to active database master key.`);
            saveUserVaultItem({
              ...vaultItem,
              encrypted_password: decResult.newPayload.ciphertext,
              iv: decResult.newPayload.iv,
              tag: decResult.newPayload.tag,
              password_hash: decResult.newPayload.hash,
              password_salt: decResult.newPayload.salt,
              updated_at: new Date().toISOString(),
            }).catch((healErr: any) => console.warn(`[Vault Auto-Heal Notice] Could not persist re-encrypted vault item:`, healErr.message));
          }
        }
      } catch (err: any) {
        console.warn(`[resolveDeviceCredentials] Error resolving vault secret for device ${device?.id}:`, err.message);
      }
    }
  }

  // Fallback to stored device password if not resolved from vault
  if (!password) {
    const raw = device?.ssh_password || device?.connection?.password || '';
    if (raw) {
      const res = decryptServerSecretWithMeta(raw);
      password = res.plainText;
      if (res.isLegacyKey && res.newEncryptedString && device?.id) {
        console.log(`[Device Auto-Heal] Upgrading legacy SSH credential for device "${device.name || device.id}" to active database master key.`);
        updateDevice(device.id, {
          ssh_password: res.newEncryptedString,
          connection: {
            ...(device.connection || {}),
            password: res.newEncryptedString,
          },
        }).catch((err: any) => console.warn(`[Device Auto-Heal Notice] Device SSH re-encryption notice:`, err.message));
      }
    }
  }

  // 2. Resolve Enable Password: Dynamic Vault First
  if (device?.enable_vault_item_id) {
    const enableItem = await getVaultItemById(device.enable_vault_item_id);
    if (enableItem) {
      enableVaultItemName = enableItem.name;
      try {
        const decResult = decryptVaultSecretWithMeta(
          enableItem.encrypted_password,
          enableItem.iv,
          enableItem.tag,
          enableItem.user_id
        );
        if (decResult.plainText) {
          enablePassword = decResult.plainText;
          isEnableFromVault = true;
          if (decResult.isLegacyKey && decResult.newPayload) {
            console.log(`[Device Vault Auto-Heal] Upgrading legacy enable vault credential for "${enableItem.name}" to active database master key.`);
            saveUserVaultItem({
              ...enableItem,
              encrypted_password: decResult.newPayload.ciphertext,
              iv: decResult.newPayload.iv,
              tag: decResult.newPayload.tag,
              password_hash: decResult.newPayload.hash,
              password_salt: decResult.newPayload.salt,
              updated_at: new Date().toISOString(),
            }).catch((healErr: any) => console.warn(`[Vault Auto-Heal Notice] Could not persist re-encrypted vault item:`, healErr.message));
          }
        }
      } catch (err: any) {
        console.warn(`[resolveDeviceCredentials] Error resolving enable vault secret for device ${device?.id}:`, err.message);
      }
    }
  }

  // Fallback to stored enable password if not resolved from vault
  if (!enablePassword) {
    const raw = device?.enable_password || '';
    if (raw) {
      const res = decryptServerSecretWithMeta(raw);
      enablePassword = res.plainText;
      if (res.isLegacyKey && res.newEncryptedString && device?.id) {
        console.log(`[Device Auto-Heal] Upgrading legacy enable credential for device "${device.name || device.id}" to active database master key.`);
        updateDevice(device.id, {
          enable_password: res.newEncryptedString,
        }).catch((err: any) => console.warn(`[Device Auto-Heal Notice] Device enable re-encryption notice:`, err.message));
      }
    }
  }

  return {
    username,
    password,
    enablePassword,
    isPasswordFromVault,
    isEnableFromVault,
    vaultItemName,
    enableVaultItemName,
  };
}

/**
 * Resolves authentic credentials for a remote server (Linux, Windows, Database).
 * Dynamically decodes live secrets from linked vault records.
 */
export async function resolveServerCredentials(
  server: any,
  authType: 'ssh' | 'win' | 'db' = 'ssh'
): Promise<{
  username: string;
  password: string;
  isFromVault: boolean;
  vaultItemName?: string;
}> {
  let username = '';
  let password = '';
  let isFromVault = false;
  let vaultItemName: string | undefined;

  if (authType === 'ssh') {
    username = server?.ssh_username || 'root';
    if (server?.ssh_vault_item_id) {
      const vaultItem = await getVaultItemById(server.ssh_vault_item_id);
      if (vaultItem) {
        vaultItemName = vaultItem.name;
        if (vaultItem.username && (!server.ssh_username || server.ssh_username === 'root')) {
          username = vaultItem.username;
        }
        try {
          const decResult = decryptVaultSecretWithMeta(
            vaultItem.encrypted_password,
            vaultItem.iv,
            vaultItem.tag,
            vaultItem.user_id
          );
          if (decResult.plainText) {
            password = decResult.plainText;
            isFromVault = true;
            if (decResult.isLegacyKey && decResult.newPayload) {
              console.log(`[Server Vault Auto-Heal] Upgrading legacy server SSH vault credential for "${vaultItem.name}" to active database master key.`);
              saveUserVaultItem({
                ...vaultItem,
                encrypted_password: decResult.newPayload.ciphertext,
                iv: decResult.newPayload.iv,
                tag: decResult.newPayload.tag,
                password_hash: decResult.newPayload.hash,
                password_salt: decResult.newPayload.salt,
                updated_at: new Date().toISOString(),
              }).catch((healErr: any) => console.warn(`[Vault Auto-Heal Notice] Could not persist re-encrypted vault item:`, healErr.message));
            }
          }
        } catch (err: any) {
          console.warn(`[resolveServerCredentials:ssh] Vault decryption error for server ${server?.id}:`, err.message);
        }
      }
    }
    if (!password && server?.ssh_password) {
      const res = decryptServerSecretWithMeta(server.ssh_password);
      password = res.plainText;
      if (res.isLegacyKey && res.newEncryptedString && server?.id) {
        console.log(`[Server Auto-Heal] Upgrading legacy SSH credential for server "${server.name || server.id}" to active database master key.`);
        updateRemoteServer(server.id, {
          ssh_password: res.newEncryptedString,
        }).catch((err: any) => console.warn(`[Server Auto-Heal Notice] Server SSH re-encryption notice:`, err.message));
      }
    }
  } else if (authType === 'win') {
    username = server?.win_username || 'Administrator';
    if (server?.win_vault_item_id) {
      const vaultItem = await getVaultItemById(server.win_vault_item_id);
      if (vaultItem) {
        vaultItemName = vaultItem.name;
        if (vaultItem.username && (!server.win_username || server.win_username === 'Administrator')) {
          username = vaultItem.username;
        }
        try {
          const decResult = decryptVaultSecretWithMeta(
            vaultItem.encrypted_password,
            vaultItem.iv,
            vaultItem.tag,
            vaultItem.user_id
          );
          if (decResult.plainText) {
            password = decResult.plainText;
            isFromVault = true;
            if (decResult.isLegacyKey && decResult.newPayload) {
              console.log(`[Server Vault Auto-Heal] Upgrading legacy server Windows vault credential for "${vaultItem.name}" to active database master key.`);
              saveUserVaultItem({
                ...vaultItem,
                encrypted_password: decResult.newPayload.ciphertext,
                iv: decResult.newPayload.iv,
                tag: decResult.newPayload.tag,
                password_hash: decResult.newPayload.hash,
                password_salt: decResult.newPayload.salt,
                updated_at: new Date().toISOString(),
              }).catch((healErr: any) => console.warn(`[Vault Auto-Heal Notice] Could not persist re-encrypted vault item:`, healErr.message));
            }
          }
        } catch (err: any) {
          console.warn(`[resolveServerCredentials:win] Vault decryption error for server ${server?.id}:`, err.message);
        }
      }
    }
    if (!password && server?.win_password) {
      const res = decryptServerSecretWithMeta(server.win_password);
      password = res.plainText;
      if (res.isLegacyKey && res.newEncryptedString && server?.id) {
        console.log(`[Server Auto-Heal] Upgrading legacy Windows credential for server "${server.name || server.id}" to active database master key.`);
        updateRemoteServer(server.id, {
          win_password: res.newEncryptedString,
        }).catch((err: any) => console.warn(`[Server Auto-Heal Notice] Server Windows re-encryption notice:`, err.message));
      }
    }
  } else if (authType === 'db') {
    username = server?.postgres_user || server?.mysql_user || 'postgres';
    if (server?.db_vault_item_id) {
      const vaultItem = await getVaultItemById(server.db_vault_item_id);
      if (vaultItem) {
        vaultItemName = vaultItem.name;
        try {
          const decResult = decryptVaultSecretWithMeta(
            vaultItem.encrypted_password,
            vaultItem.iv,
            vaultItem.tag,
            vaultItem.user_id
          );
          if (decResult.plainText) {
            password = decResult.plainText;
            isFromVault = true;
            if (decResult.isLegacyKey && decResult.newPayload) {
              console.log(`[Server Vault Auto-Heal] Upgrading legacy server DB vault credential for "${vaultItem.name}" to active database master key.`);
              saveUserVaultItem({
                ...vaultItem,
                encrypted_password: decResult.newPayload.ciphertext,
                iv: decResult.newPayload.iv,
                tag: decResult.newPayload.tag,
                password_hash: decResult.newPayload.hash,
                password_salt: decResult.newPayload.salt,
                updated_at: new Date().toISOString(),
              }).catch((healErr: any) => console.warn(`[Vault Auto-Heal Notice] Could not persist re-encrypted vault item:`, healErr.message));
            }
          }
        } catch (err: any) {
          console.warn(`[resolveServerCredentials:db] Vault decryption error for server ${server?.id}:`, err.message);
        }
      }
    }
    if (!password) {
      const raw = server?.postgres_password || server?.mysql_password || '';
      if (raw) {
        const res = decryptServerSecretWithMeta(raw);
        password = res.plainText;
        if (res.isLegacyKey && res.newEncryptedString && server?.id) {
          console.log(`[Server Auto-Heal] Upgrading legacy database credential for server "${server.name || server.id}" to active database master key.`);
          const updates: any = {};
          if (server.postgres_password) updates.postgres_password = res.newEncryptedString;
          if (server.mysql_password) updates.mysql_password = res.newEncryptedString;
          updateRemoteServer(server.id, updates).catch((err: any) =>
            console.warn(`[Server Auto-Heal Notice] Server DB re-encryption notice:`, err.message)
          );
        }
      }
    }
  }

  return { username, password, isFromVault, vaultItemName };
}

/**
 * Returns all network devices and remote servers actively bound to a given vault item.
 * Used for Vault Insights in UI and Cascade Synchronization safety audits.
 */
export async function getVaultLinkedTargets(vaultItemId: string): Promise<{
  devices: Array<{ id: string; name: string; ip?: string; role?: string; type: 'ssh' | 'enable' | 'both' }>;
  servers: Array<{ id: string; name: string; ip?: string; os_type: string; type: 'ssh' | 'win' | 'db' }>;
}> {
  if (!vaultItemId || typeof vaultItemId !== 'string') {
    return { devices: [], servers: [] };
  }
  const cleanId = vaultItemId.trim();

  const linkedDevices: Array<{ id: string; name: string; ip?: string; role?: string; type: 'ssh' | 'enable' | 'both' }> = [];
  const linkedServers: Array<{ id: string; name: string; ip?: string; os_type: string; type: 'ssh' | 'win' | 'db' }> = [];

  // 1. Check devices in PostgreSQL
  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      const devRes = await pool.query(
        'SELECT id, name, ip, role, ssh_vault_item_id, enable_vault_item_id FROM devices WHERE ssh_vault_item_id = $1 OR enable_vault_item_id = $1',
        [cleanId]
      );
      if (devRes && Array.isArray(devRes.rows)) {
        for (const row of devRes.rows) {
          const isSsh = row.ssh_vault_item_id === cleanId;
          const isEnable = row.enable_vault_item_id === cleanId;
          linkedDevices.push({
            id: row.id,
            name: row.name || row.id,
            ip: row.ip,
            role: row.role,
            type: isSsh && isEnable ? 'both' : isSsh ? 'ssh' : 'enable',
          });
        }
      }

      const srvRes = await pool.query(
        'SELECT id, name, ip, os_type, ssh_vault_item_id, win_vault_item_id, db_vault_item_id FROM remote_servers WHERE ssh_vault_item_id = $1 OR win_vault_item_id = $1 OR db_vault_item_id = $1',
        [cleanId]
      );
      if (srvRes && Array.isArray(srvRes.rows)) {
        for (const row of srvRes.rows) {
          const isSsh = row.ssh_vault_item_id === cleanId;
          const isWin = row.win_vault_item_id === cleanId;
          const isDb = row.db_vault_item_id === cleanId;
          const t: 'ssh' | 'win' | 'db' = isWin ? 'win' : isDb ? 'db' : 'ssh';
          linkedServers.push({
            id: row.id,
            name: row.name || row.id,
            ip: row.ip,
            os_type: row.os_type || 'linux',
            type: t,
          });
        }
      }
    } catch (e: any) {
      console.warn('[getVaultLinkedTargets PostgreSQL query notice]:', e.message);
    }
  }

  // 2. If PostgreSQL returned empty, check fallback store
  if (linkedDevices.length === 0 && linkedServers.length === 0) {
    const store = loadFallbackStore();
    const allDevices = Array.isArray(store.devices) ? store.devices : [];
    for (const d of allDevices) {
      const isSsh = d.ssh_vault_item_id === cleanId;
      const isEnable = d.enable_vault_item_id === cleanId;
      if (isSsh || isEnable) {
        linkedDevices.push({
          id: d.id,
          name: d.name || d.id,
          ip: d.ip,
          role: d.role,
          type: isSsh && isEnable ? 'both' : isSsh ? 'ssh' : 'enable',
        });
      }
    }

    const allServers = Array.isArray(store.remote_servers) ? store.remote_servers : [];
    for (const s of allServers) {
      const isSsh = s.ssh_vault_item_id === cleanId;
      const isWin = s.win_vault_item_id === cleanId;
      const isDb = s.db_vault_item_id === cleanId;
      if (isSsh || isWin || isDb) {
        linkedServers.push({
          id: s.id,
          name: s.name || s.id,
          ip: s.ip,
          os_type: s.os_type || 'linux',
          type: isWin ? 'win' : isDb ? 'db' : 'ssh',
        });
      }
    }
  }

  return { devices: linkedDevices, servers: linkedServers };
}

/**
 * Returns a complete map of all vault item IDs and their actively bound network devices and servers.
 * Used for instant Vault Insights across all cards in the password vault UI without N+1 HTTP calls.
 */
export async function getAllVaultLinkedTargetsSummary(): Promise<Record<string, {
  devices: Array<{ id: string; name: string; ip?: string; role?: string; type: 'ssh' | 'enable' | 'both' }>;
  servers: Array<{ id: string; name: string; ip?: string; os_type: string; type: 'ssh' | 'win' | 'db' }>;
  totalCount: number;
}>> {
  const result: Record<string, {
    devices: Array<{ id: string; name: string; ip?: string; role?: string; type: 'ssh' | 'enable' | 'both' }>;
    servers: Array<{ id: string; name: string; ip?: string; os_type: string; type: 'ssh' | 'win' | 'db' }>;
    totalCount: number;
  }> = {};

  const ensureEntry = (id: string) => {
    if (!result[id]) {
      result[id] = { devices: [], servers: [], totalCount: 0 };
    }
    return result[id];
  };

  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      const devRes = await pool.query(
        'SELECT id, name, ip, role, ssh_vault_item_id, enable_vault_item_id FROM devices WHERE ssh_vault_item_id IS NOT NULL OR enable_vault_item_id IS NOT NULL'
      );
      if (devRes && Array.isArray(devRes.rows)) {
        for (const row of devRes.rows) {
          const sshId = row.ssh_vault_item_id ? String(row.ssh_vault_item_id).trim() : '';
          const enableId = row.enable_vault_item_id ? String(row.enable_vault_item_id).trim() : '';
          
          if (sshId && enableId && sshId === enableId) {
            const entry = ensureEntry(sshId);
            if (!entry.devices.some((d) => d.id === row.id)) {
              entry.devices.push({ id: row.id, name: row.name || row.id, ip: row.ip, role: row.role, type: 'both' });
              entry.totalCount++;
            }
          } else {
            if (sshId) {
              const entry = ensureEntry(sshId);
              if (!entry.devices.some((d) => d.id === row.id)) {
                entry.devices.push({ id: row.id, name: row.name || row.id, ip: row.ip, role: row.role, type: 'ssh' });
                entry.totalCount++;
              }
            }
            if (enableId) {
              const entry = ensureEntry(enableId);
              if (!entry.devices.some((d) => d.id === row.id)) {
                entry.devices.push({ id: row.id, name: row.name || row.id, ip: row.ip, role: row.role, type: 'enable' });
                entry.totalCount++;
              }
            }
          }
        }
      }

      const srvRes = await pool.query(
        'SELECT id, name, ip, os_type, ssh_vault_item_id, win_vault_item_id, db_vault_item_id FROM remote_servers WHERE ssh_vault_item_id IS NOT NULL OR win_vault_item_id IS NOT NULL OR db_vault_item_id IS NOT NULL'
      );
      if (srvRes && Array.isArray(srvRes.rows)) {
        for (const row of srvRes.rows) {
          const sshId = row.ssh_vault_item_id ? String(row.ssh_vault_item_id).trim() : '';
          const winId = row.win_vault_item_id ? String(row.win_vault_item_id).trim() : '';
          const dbId = row.db_vault_item_id ? String(row.db_vault_item_id).trim() : '';

          if (sshId) {
            const entry = ensureEntry(sshId);
            if (!entry.servers.some((s) => s.id === row.id && s.type === 'ssh')) {
              entry.servers.push({ id: row.id, name: row.name || row.id, ip: row.ip, os_type: row.os_type || 'linux', type: 'ssh' });
              entry.totalCount++;
            }
          }
          if (winId) {
            const entry = ensureEntry(winId);
            if (!entry.servers.some((s) => s.id === row.id && s.type === 'win')) {
              entry.servers.push({ id: row.id, name: row.name || row.id, ip: row.ip, os_type: row.os_type || 'windows', type: 'win' });
              entry.totalCount++;
            }
          }
          if (dbId) {
            const entry = ensureEntry(dbId);
            if (!entry.servers.some((s) => s.id === row.id && s.type === 'db')) {
              entry.servers.push({ id: row.id, name: row.name || row.id, ip: row.ip, os_type: row.os_type || 'linux', type: 'db' });
              entry.totalCount++;
            }
          }
        }
      }
    } catch (e: any) {
      console.warn('[getAllVaultLinkedTargetsSummary PostgreSQL query notice]:', e.message);
    }
  }

  // Also verify fallback store
  try {
    const store = loadFallbackStore();
    const allDevices = Array.isArray(store.devices) ? store.devices : [];
    for (const d of allDevices) {
      const sshId = d.ssh_vault_item_id ? String(d.ssh_vault_item_id).trim() : '';
      const enableId = d.enable_vault_item_id ? String(d.enable_vault_item_id).trim() : '';
      if (sshId && !result[sshId]?.devices.some((x) => x.id === d.id)) {
        const entry = ensureEntry(sshId);
        entry.devices.push({ id: d.id, name: d.name || d.id, ip: d.ip, role: d.role, type: sshId === enableId ? 'both' : 'ssh' });
        entry.totalCount++;
      }
      if (enableId && enableId !== sshId && !result[enableId]?.devices.some((x) => x.id === d.id)) {
        const entry = ensureEntry(enableId);
        entry.devices.push({ id: d.id, name: d.name || d.id, ip: d.ip, role: d.role, type: 'enable' });
        entry.totalCount++;
      }
    }

    const allServers = Array.isArray(store.remote_servers) ? store.remote_servers : [];
    for (const s of allServers) {
      const sshId = s.ssh_vault_item_id ? String(s.ssh_vault_item_id).trim() : '';
      const winId = s.win_vault_item_id ? String(s.win_vault_item_id).trim() : '';
      const dbId = s.db_vault_item_id ? String(s.db_vault_item_id).trim() : '';
      if (sshId && !result[sshId]?.servers.some((x) => x.id === s.id && x.type === 'ssh')) {
        const entry = ensureEntry(sshId);
        entry.servers.push({ id: s.id, name: s.name || s.id, ip: s.ip, os_type: s.os_type || 'linux', type: 'ssh' });
        entry.totalCount++;
      }
      if (winId && !result[winId]?.servers.some((x) => x.id === s.id && x.type === 'win')) {
        const entry = ensureEntry(winId);
        entry.servers.push({ id: s.id, name: s.name || s.id, ip: s.ip, os_type: s.os_type || 'windows', type: 'win' });
        entry.totalCount++;
      }
      if (dbId && !result[dbId]?.servers.some((x) => x.id === s.id && x.type === 'db')) {
        const entry = ensureEntry(dbId);
        entry.servers.push({ id: s.id, name: s.name || s.id, ip: s.ip, os_type: s.os_type || 'linux', type: 'db' });
        entry.totalCount++;
      }
    }
  } catch (err: any) {
    console.warn('[getAllVaultLinkedTargetsSummary fallback store notice]:', err.message);
  }

  return result;
}

/**
 * Automatic Cascade Synchronization Engine:
 * When a user updates or changes a password in the vault, this engine automatically
 * finds all connected network devices (switches, routers) and remote servers (Linux, Windows, DB)
 * bound to this vault item ID, updates their encrypted credentials at rest with AES-256-GCM,
 * and maintains 100% database synchronization.
 */
export async function cascadeSyncVaultItem(
  vaultItemId: string,
  newPlainTextPassword: string,
  vaultItemName?: string
): Promise<CascadeSyncResult> {
  const cleanId = (vaultItemId || '').trim();
  const cleanPass = (newPlainTextPassword || '').trim();
  const name = vaultItemName || cleanId;

  const result: CascadeSyncResult = {
    vaultItemId: cleanId,
    vaultItemName: name,
    affectedDevices: [],
    affectedServers: [],
    totalDevicesCount: 0,
    totalServersCount: 0,
  };

  if (!cleanId || !cleanPass) return result;

  // 1. Generate new AES-256-GCM encrypted server secret for storage at rest
  const encryptedServerSecret = encryptServerSecret(cleanPass);

  // 2. Discover linked targets
  const linked = await getVaultLinkedTargets(cleanId);
  result.affectedDevices = linked.devices;
  result.affectedServers = linked.servers;
  result.totalDevicesCount = linked.devices.length;
  result.totalServersCount = linked.servers.length;

  // 3. PostgreSQL Database Synchronization
  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      // Cascade to devices
      for (const dev of linked.devices) {
        if (dev.type === 'both') {
          await pool.query(
            'UPDATE devices SET ssh_password = $1, enable_password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [encryptedServerSecret, dev.id]
          );
        } else if (dev.type === 'ssh') {
          await pool.query(
            'UPDATE devices SET ssh_password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [encryptedServerSecret, dev.id]
          );
        } else if (dev.type === 'enable') {
          await pool.query(
            'UPDATE devices SET enable_password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [encryptedServerSecret, dev.id]
          );
        }
      }

      // Cascade to remote servers
      for (const srv of linked.servers) {
        if (srv.type === 'ssh') {
          await pool.query(
            'UPDATE remote_servers SET ssh_password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [encryptedServerSecret, srv.id]
          );
        } else if (srv.type === 'win') {
          await pool.query(
            'UPDATE remote_servers SET win_password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [encryptedServerSecret, srv.id]
          );
        } else if (srv.type === 'db') {
          await pool.query(
            'UPDATE remote_servers SET postgres_password = $1, mysql_password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [encryptedServerSecret, srv.id]
          );
        }
      }
    } catch (pgErr: any) {
      console.error('[cascadeSyncVaultItem PostgreSQL sync error]:', pgErr.message);
    }
  }

  // 4. Memory & Fallback Store Synchronization
  const store = loadFallbackStore();
  let storeDirty = false;

  if (Array.isArray(store.devices)) {
    for (const d of store.devices) {
      if (d.ssh_vault_item_id === cleanId) {
        d.ssh_password = encryptedServerSecret;
        storeDirty = true;
      }
      if (d.enable_vault_item_id === cleanId) {
        d.enable_password = encryptedServerSecret;
        storeDirty = true;
      }
    }
  }

  if (Array.isArray(store.remote_servers)) {
    for (const s of store.remote_servers) {
      if (s.ssh_vault_item_id === cleanId) {
        s.ssh_password = encryptedServerSecret;
        s.ssh_password_set = true;
        storeDirty = true;
      }
      if (s.win_vault_item_id === cleanId) {
        s.win_password = encryptedServerSecret;
        s.win_password_set = true;
        storeDirty = true;
      }
      if (s.db_vault_item_id === cleanId) {
        s.postgres_password = encryptedServerSecret;
        s.postgres_password_set = true;
        s.mysql_password = encryptedServerSecret;
        s.mysql_password_set = true;
        storeDirty = true;
      }
    }
  }

  if (storeDirty) {
    saveFallbackStore(store);
  }

  // 5. Sync to backend/network_data.json
  try {
    const netPath = path.join(process.cwd(), 'backend', 'network_data.json');
    if (fs.existsSync(netPath)) {
      const netData = JSON.parse(fs.readFileSync(netPath, 'utf-8'));
      let netDirty = false;
      if (Array.isArray(netData.devices)) {
        for (const d of netData.devices) {
          if (d.ssh_vault_item_id === cleanId) {
            d.ssh_password = encryptedServerSecret;
            netDirty = true;
          }
          if (d.enable_vault_item_id === cleanId) {
            d.enable_password = encryptedServerSecret;
            netDirty = true;
          }
        }
      }
      if (netDirty) {
        fs.writeFileSync(netPath, JSON.stringify(netData, null, 2), 'utf-8');
      }
    }
  } catch (netErr: any) {
    console.warn('[cascadeSyncVaultItem network_data.json sync notice]:', netErr.message);
  }

  return result;
}

export async function getBulkServerReports(): Promise<any[]> {
  const store = loadFallbackStore();
  const fallbackReports = Array.isArray(store.bulk_server_reports) ? store.bulk_server_reports : [];

  if (isPostgresConnected() && pool) {
    try {
      const res = await pool.query(`
        SELECT 
          id,
          job_id as "jobId",
          template_id as "templateId",
          template_title as "templateTitle",
          template_title_en as "templateTitleEn",
          category,
          icon,
          status,
          operator_user as "operatorUser",
          duration_ms as "durationMs",
          total_servers as "totalServers",
          success_count as "successCount",
          failed_count as "failedCount",
          skipped_count as "skippedCount",
          server_summaries as "serverSummaries",
          impact_analysis as "impactAnalysis",
          parameters,
          results,
          logs,
          created_at as "createdAt",
          finished_at as "finishedAt"
        FROM bulk_server_reports
        ORDER BY created_at DESC
        LIMIT 300
      `);

      if (res && res.rows && res.rows.length > 0) {
        return res.rows;
      }
    } catch (e: any) {
      console.error('[DB Error getBulkServerReports in PostgreSQL]', e.message);
    }
  }

  return [...fallbackReports].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function getBulkServerReportById(id: string): Promise<any | null> {
  if (isPostgresConnected() && pool) {
    try {
      const res = await pool.query(`
        SELECT 
          id,
          job_id as "jobId",
          template_id as "templateId",
          template_title as "templateTitle",
          template_title_en as "templateTitleEn",
          category,
          icon,
          status,
          operator_user as "operatorUser",
          duration_ms as "durationMs",
          total_servers as "totalServers",
          success_count as "successCount",
          failed_count as "failedCount",
          skipped_count as "skippedCount",
          server_summaries as "serverSummaries",
          impact_analysis as "impactAnalysis",
          parameters,
          results,
          logs,
          created_at as "createdAt",
          finished_at as "finishedAt"
        FROM bulk_server_reports
        WHERE id = $1 OR job_id = $1
        LIMIT 1
      `, [id]);

      if (res && res.rows && res.rows.length > 0) {
        return res.rows[0];
      }
    } catch (e: any) {
      console.error('[DB Error getBulkServerReportById in PostgreSQL]', e.message);
    }
  }

  const store = loadFallbackStore();
  const reports = Array.isArray(store.bulk_server_reports) ? store.bulk_server_reports : [];
  return reports.find((r: any) => r.id === id || r.jobId === id) || null;
}

export async function saveBulkServerReport(report: any): Promise<void> {
  if (!report || (!report.id && !report.jobId)) return;
  const reportId = report.id || `report-${report.jobId || Date.now()}`;
  const normalizedReport = {
    ...report,
    id: reportId,
    jobId: report.jobId || reportId,
    createdAt: report.createdAt || Date.now(),
    finishedAt: report.finishedAt || Date.now(),
  };

  // 1. Persist to Fallback JSON store (backend/database_store.json)
  const store = loadFallbackStore();
  if (!Array.isArray(store.bulk_server_reports)) {
    store.bulk_server_reports = [];
  }
  const idx = store.bulk_server_reports.findIndex((r: any) => r.id === reportId || r.jobId === normalizedReport.jobId);
  if (idx >= 0) {
    store.bulk_server_reports[idx] = normalizedReport;
  } else {
    store.bulk_server_reports.unshift(normalizedReport);
  }
  if (store.bulk_server_reports.length > 300) {
    store.bulk_server_reports = store.bulk_server_reports.slice(0, 300);
  }
  saveFallbackStore(store);

  // 2. Persist to relational PostgreSQL table if available
  if (isPostgresConnected() && pool) {
    try {
      await pool.query(
        `INSERT INTO bulk_server_reports (
          id, job_id, template_id, template_title, template_title_en, category, icon,
          status, operator_user, duration_ms, total_servers, success_count, failed_count, skipped_count,
          server_summaries, impact_analysis, parameters, results, logs, created_at, finished_at, updated_at_dt
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          job_id = EXCLUDED.job_id,
          template_id = EXCLUDED.template_id,
          template_title = EXCLUDED.template_title,
          template_title_en = EXCLUDED.template_title_en,
          category = EXCLUDED.category,
          icon = EXCLUDED.icon,
          status = EXCLUDED.status,
          operator_user = EXCLUDED.operator_user,
          duration_ms = EXCLUDED.duration_ms,
          total_servers = EXCLUDED.total_servers,
          success_count = EXCLUDED.success_count,
          failed_count = EXCLUDED.failed_count,
          skipped_count = EXCLUDED.skipped_count,
          server_summaries = EXCLUDED.server_summaries,
          impact_analysis = EXCLUDED.impact_analysis,
          parameters = EXCLUDED.parameters,
          results = EXCLUDED.results,
          logs = EXCLUDED.logs,
          created_at = EXCLUDED.created_at,
          finished_at = EXCLUDED.finished_at,
          updated_at_dt = CURRENT_TIMESTAMP`,
        [
          reportId,
          normalizedReport.jobId,
          normalizedReport.templateId || 'custom',
          normalizedReport.templateTitle || 'Bulk Configuration',
          normalizedReport.templateTitleEn || normalizedReport.templateTitle || 'Bulk Configuration',
          normalizedReport.category || 'general',
          normalizedReport.icon || 'Server',
          normalizedReport.status || 'completed',
          normalizedReport.operatorUser || 'Administrator',
          normalizedReport.durationMs || 0,
          normalizedReport.totalServers || 0,
          normalizedReport.successCount || 0,
          normalizedReport.failedCount || 0,
          normalizedReport.skippedCount || 0,
          JSON.stringify(normalizedReport.serverSummaries || []),
          JSON.stringify(normalizedReport.impactAnalysis || {}),
          JSON.stringify(normalizedReport.parameters || {}),
          JSON.stringify(normalizedReport.results || {}),
          JSON.stringify(normalizedReport.logs || []),
          normalizedReport.createdAt,
          normalizedReport.finishedAt
        ]
      );
    } catch (e: any) {
      console.error('[DB Error saveBulkServerReport in PostgreSQL]', e.message);
    }
  }
}

export async function deleteBulkServerReport(id: string): Promise<boolean> {
  const store = loadFallbackStore();
  let deletedInFallback = false;
  if (Array.isArray(store.bulk_server_reports)) {
    const initialLen = store.bulk_server_reports.length;
    store.bulk_server_reports = store.bulk_server_reports.filter((r: any) => r.id !== id && r.jobId !== id);
    if (store.bulk_server_reports.length < initialLen) {
      saveFallbackStore(store);
      deletedInFallback = true;
    }
  }

  if (isPostgresConnected() && pool) {
    try {
      const res = await pool.query(
        'DELETE FROM bulk_server_reports WHERE id = $1 OR job_id = $1',
        [id]
      );
      return (res && (res.rowCount || 0) > 0) || deletedInFallback;
    } catch (e: any) {
      console.error('[DB Error deleteBulkServerReport in PostgreSQL]', e.message);
    }
  }

  return deletedInFallback;
}

export async function clearAllBulkServerReports(): Promise<boolean> {
  const store = loadFallbackStore();
  store.bulk_server_reports = [];
  saveFallbackStore(store);

  if (isPostgresConnected() && pool) {
    try {
      await pool.query('DELETE FROM bulk_server_reports');
      return true;
    } catch (e: any) {
      console.error('[DB Error clearAllBulkServerReports in PostgreSQL]', e.message);
    }
  }

  return true;
}

export async function getBulkServerReportsStorageStats(): Promise<{
  storageType: 'postgresql' | 'json_store';
  totalReports: number;
  isPostgresReady: boolean;
}> {
  if (isPostgresConnected() && pool) {
    try {
      const res = await pool.query('SELECT count(*) as count FROM bulk_server_reports');
      const count = parseInt(res.rows[0]?.count || '0', 10);
      return {
        storageType: 'postgresql',
        totalReports: count,
        isPostgresReady: true,
      };
    } catch (e: any) {
      console.error('[DB Error getBulkServerReportsStorageStats]', e.message);
    }
  }

  const store = loadFallbackStore();
  const reports = Array.isArray(store.bulk_server_reports) ? store.bulk_server_reports : [];
  return {
    storageType: 'json_store',
    totalReports: reports.length,
    isPostgresReady: false,
  };
}

// ==============================================================================
// Scheduled Backup Jobs (PostgreSQL & Fallback Store)
// ==============================================================================

export async function getAllScheduledBackupJobs(): Promise<ScheduledBackupJob[]> {
  if (isPostgresConnected() && pool) {
    try {
      const res = await pool.query('SELECT * FROM scheduled_backup_jobs ORDER BY created_at ASC');
      if (res.rows.length > 0) {
        return res.rows.map((row: any) => ({
          ...row,
          days_of_week: typeof row.days_of_week === 'string' ? JSON.parse(row.days_of_week) : (row.days_of_week || [0, 1, 2, 3, 4, 5, 6]),
        }));
      }
    } catch (e: any) {
      console.warn('[DB Error getAllScheduledBackupJobs, falling back to local store]', e.message);
    }
  }

  const store = loadFallbackStore();
  return Array.isArray(store.scheduled_backup_jobs) ? store.scheduled_backup_jobs : [...DEFAULT_SCHEDULED_BACKUP_JOBS];
}

export async function getScheduledBackupJobById(id: string): Promise<ScheduledBackupJob | null> {
  const all = await getAllScheduledBackupJobs();
  return all.find((j) => j.id === id) || null;
}

export async function saveScheduledBackupJob(job: ScheduledBackupJob): Promise<ScheduledBackupJob> {
  if (!job.id) {
    job.id = `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  }
  const now = new Date().toISOString();
  if (!job.created_at) job.created_at = now;
  job.updated_at = now;

  if (isPostgresConnected() && pool) {
    try {
      await pool.query(
        `INSERT INTO scheduled_backup_jobs (
           id, name, enabled, schedule_type, run_time, days_of_week, interval_minutes,
           scope, encrypt, passphrase, sanitize, retention_count, retention_days,
           last_run_at, next_run_at, last_status, last_result_details, last_backup_file,
           created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10, $11, $12, $13,
           $14, $15, $16, $17, $18,
           COALESCE($19, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP
         ) ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           enabled = EXCLUDED.enabled,
           schedule_type = EXCLUDED.schedule_type,
           run_time = EXCLUDED.run_time,
           days_of_week = EXCLUDED.days_of_week,
           interval_minutes = EXCLUDED.interval_minutes,
           scope = EXCLUDED.scope,
           encrypt = EXCLUDED.encrypt,
           passphrase = EXCLUDED.passphrase,
           sanitize = EXCLUDED.sanitize,
           retention_count = EXCLUDED.retention_count,
           retention_days = EXCLUDED.retention_days,
           last_run_at = EXCLUDED.last_run_at,
           next_run_at = EXCLUDED.next_run_at,
           last_status = EXCLUDED.last_status,
           last_result_details = EXCLUDED.last_result_details,
           last_backup_file = EXCLUDED.last_backup_file,
           updated_at = CURRENT_TIMESTAMP`,
        [
          job.id,
          job.name,
          job.enabled,
          job.schedule_type || 'daily',
          job.run_time || '02:00',
          JSON.stringify(job.days_of_week || [0, 1, 2, 3, 4, 5, 6]),
          job.interval_minutes || 1440,
          job.scope || 'full',
          !!job.encrypt,
          job.passphrase || '',
          !!job.sanitize,
          job.retention_count || 10,
          job.retention_days || 30,
          job.last_run_at || null,
          job.next_run_at || null,
          job.last_status || 'idle',
          job.last_result_details || null,
          job.last_backup_file || null,
          job.created_at || null,
        ]
      );
    } catch (e: any) {
      console.error('[DB Error saveScheduledBackupJob in PostgreSQL]', e.message);
    }
  }

  const store = loadFallbackStore();
  if (!Array.isArray(store.scheduled_backup_jobs)) {
    store.scheduled_backup_jobs = [];
  }
  const idx = store.scheduled_backup_jobs.findIndex((j) => j.id === job.id);
  if (idx !== -1) {
    store.scheduled_backup_jobs[idx] = job;
  } else {
    store.scheduled_backup_jobs.push(job);
  }
  saveFallbackStore(store);

  return job;
}

export async function deleteScheduledBackupJob(id: string): Promise<boolean> {
  if (isPostgresConnected() && pool) {
    try {
      await pool.query('DELETE FROM scheduled_backup_jobs WHERE id = $1', [id]);
    } catch (e: any) {
      console.error('[DB Error deleteScheduledBackupJob in PostgreSQL]', e.message);
    }
  }

  const store = loadFallbackStore();
  if (Array.isArray(store.scheduled_backup_jobs)) {
    store.scheduled_backup_jobs = store.scheduled_backup_jobs.filter((j) => j.id !== id);
    saveFallbackStore(store);
  }
  return true;
}

// ============================================================================
// 18. Network Equipment Configuration Templates & Patterns (PostgreSQL & Database Store)
// ============================================================================

export interface ConfigTemplateRecord {
  id: string;
  name: string;
  vendor: 'cisco' | 'mikrotik' | 'juniper' | 'huawei' | string;
  target_type: 'switch' | 'router' | 'firewall' | 'all' | string;
  target_platform?: string;
  category?: string;
  role: string;
  description: string;
  default_cli_mode?: string;
  commands: string;
  variables: any[];
  author?: string;
  created_at?: string;
  updated_at?: string;
  is_builtin?: boolean;
}

export function syncTemplatesToNetworkDataJson(templates: any[]): void {
  try {
    const netPath = path.join(process.cwd(), 'backend', 'network_data.json');
    let data: any = {};
    if (fs.existsSync(netPath)) {
      const raw = fs.readFileSync(netPath, 'utf-8');
      data = JSON.parse(raw);
    }
    data.templates = templates;
    fs.writeFileSync(netPath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[syncTemplatesToNetworkDataJson error]', err);
  }
}

export async function getConfigTemplates(): Promise<ConfigTemplateRecord[]> {
  if (isPostgresConnected() && pool) {
    try {
      const res = await pool.query('SELECT * FROM config_templates ORDER BY created_at ASC');
      if (res.rows.length > 0) {
        return res.rows.map((r: any) => ({
          ...r,
          variables: typeof r.variables === 'string' ? JSON.parse(r.variables) : (r.variables || []),
          is_builtin: Boolean(r.is_builtin),
        }));
      }
    } catch (err: any) {
      console.warn('[DB getConfigTemplates PG warning, falling back to local store]', err.message);
    }
  }

  const store = loadFallbackStore();
  if (Array.isArray(store.config_templates) && store.config_templates.length > 0) {
    try {
      if (fs.existsSync(FALLBACK_FILE)) {
        const raw = fs.readFileSync(FALLBACK_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.config_templates) || parsed.config_templates.length === 0) {
          parsed.config_templates = store.config_templates;
          saveFallbackStore(parsed);
        }
      } else {
        saveFallbackStore(store);
      }
    } catch {}
    return store.config_templates;
  }

  // Fallback to network_data.json if store empty
  try {
    const netPath = path.join(process.cwd(), 'backend', 'network_data.json');
    if (fs.existsSync(netPath)) {
      const raw = fs.readFileSync(netPath, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.templates) && data.templates.length > 0) {
        store.config_templates = data.templates;
        saveFallbackStore(store);
        return data.templates;
      }
    }
  } catch {}

  return [];
}

export async function getConfigTemplateById(id: string): Promise<ConfigTemplateRecord | null> {
  if (isPostgresConnected() && pool) {
    try {
      const res = await pool.query('SELECT * FROM config_templates WHERE id = $1', [id]);
      if (res.rows.length > 0) {
        const r = res.rows[0];
        return {
          ...r,
          variables: typeof r.variables === 'string' ? JSON.parse(r.variables) : (r.variables || []),
          is_builtin: Boolean(r.is_builtin),
        };
      }
    } catch (err: any) {
      console.warn('[DB getConfigTemplateById PG warning]', err.message);
    }
  }

  const store = loadFallbackStore();
  const list = store.config_templates || [];
  return list.find((t: any) => t && t.id === id) || null;
}

export async function createConfigTemplate(templateData: Partial<ConfigTemplateRecord>): Promise<ConfigTemplateRecord> {
  const newId = templateData.id || `tmpl-${templateData.vendor || 'custom'}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();
  const tmpl: ConfigTemplateRecord = {
    id: newId,
    name: templateData.name || 'New Template',
    vendor: templateData.vendor || 'cisco',
    target_type: templateData.target_type || 'switch',
    target_platform: templateData.target_platform || undefined,
    category: templateData.category || undefined,
    role: templateData.role || 'Access Switch',
    description: templateData.description || '',
    default_cli_mode: templateData.default_cli_mode || 'GLOBAL_CONFIG',
    commands: templateData.commands || '',
    variables: Array.isArray(templateData.variables) ? templateData.variables : [],
    author: templateData.author || 'Network Administrator',
    is_builtin: Boolean(templateData.is_builtin),
    created_at: templateData.created_at || now,
    updated_at: now,
  };

  if (isPostgresConnected() && pool) {
    try {
      await pool.query(
        `INSERT INTO config_templates (
          id, name, vendor, target_type, target_platform, category, role, description,
          default_cli_mode, commands, variables, author, is_builtin, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          vendor = EXCLUDED.vendor,
          target_type = EXCLUDED.target_type,
          target_platform = EXCLUDED.target_platform,
          category = EXCLUDED.category,
          role = EXCLUDED.role,
          description = EXCLUDED.description,
          default_cli_mode = EXCLUDED.default_cli_mode,
          commands = EXCLUDED.commands,
          variables = EXCLUDED.variables,
          author = EXCLUDED.author,
          updated_at = EXCLUDED.updated_at`,
        [
          tmpl.id,
          tmpl.name,
          tmpl.vendor,
          tmpl.target_type,
          tmpl.target_platform || null,
          tmpl.category || null,
          tmpl.role,
          tmpl.description,
          tmpl.default_cli_mode,
          tmpl.commands,
          JSON.stringify(tmpl.variables),
          tmpl.author,
          tmpl.is_builtin,
          tmpl.created_at,
          tmpl.updated_at,
        ]
      );
    } catch (err: any) {
      console.error('[DB createConfigTemplate PG error]', err.message);
    }
  }

  // Update fallback store
  const store = loadFallbackStore();
  if (!Array.isArray(store.config_templates)) {
    store.config_templates = [];
  }
  const existingIdx = store.config_templates.findIndex((t: any) => t && t.id === tmpl.id);
  if (existingIdx !== -1) {
    store.config_templates[existingIdx] = tmpl;
  } else {
    store.config_templates.push(tmpl);
  }
  saveFallbackStore(store);

  // Sync to network_data.json
  syncTemplatesToNetworkDataJson(store.config_templates);

  return tmpl;
}

export async function updateConfigTemplate(id: string, updates: Partial<ConfigTemplateRecord>): Promise<ConfigTemplateRecord | null> {
  const existing = await getConfigTemplateById(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated: ConfigTemplateRecord = {
    ...existing,
    ...updates,
    id: existing.id,
    variables: Array.isArray(updates.variables) ? updates.variables : existing.variables,
    updated_at: now,
  };

  if (isPostgresConnected() && pool) {
    try {
      await pool.query(
        `UPDATE config_templates SET
          name = $1,
          vendor = $2,
          target_type = $3,
          target_platform = $4,
          category = $5,
          role = $6,
          description = $7,
          default_cli_mode = $8,
          commands = $9,
          variables = $10,
          author = $11,
          updated_at = $12
        WHERE id = $13`,
        [
          updated.name,
          updated.vendor,
          updated.target_type,
          updated.target_platform || null,
          updated.category || null,
          updated.role,
          updated.description,
          updated.default_cli_mode,
          updated.commands,
          JSON.stringify(updated.variables),
          updated.author,
          updated.updated_at,
          id,
        ]
      );
    } catch (err: any) {
      console.error('[DB updateConfigTemplate PG error]', err.message);
    }
  }

  // Update fallback store
  const store = loadFallbackStore();
  if (!Array.isArray(store.config_templates)) {
    store.config_templates = [];
  }
  const idx = store.config_templates.findIndex((t: any) => t && t.id === id);
  if (idx !== -1) {
    store.config_templates[idx] = updated;
  } else {
    store.config_templates.push(updated);
  }
  saveFallbackStore(store);

  // Sync to network_data.json
  syncTemplatesToNetworkDataJson(store.config_templates);

  return updated;
}

export async function deleteConfigTemplate(id: string): Promise<boolean> {
  if (isPostgresConnected() && pool) {
    try {
      await pool.query('DELETE FROM config_templates WHERE id = $1', [id]);
    } catch (err: any) {
      console.error('[DB deleteConfigTemplate PG error]', err.message);
    }
  }

  const store = loadFallbackStore();
  if (Array.isArray(store.config_templates)) {
    store.config_templates = store.config_templates.filter((t: any) => t && t.id !== id);
    saveFallbackStore(store);
    syncTemplatesToNetworkDataJson(store.config_templates);
  }
  return true;
}

export async function saveConfigTemplatesBulk(templates: ConfigTemplateRecord[]): Promise<number> {
  let count = 0;
  for (const tmpl of templates) {
    if (!tmpl || !tmpl.name) continue;
    await createConfigTemplate(tmpl);
    count++;
  }
  return count;
}



