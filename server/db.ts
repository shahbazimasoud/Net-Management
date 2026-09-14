import { Pool, PoolConfig } from 'pg';
import fs from 'fs';
import path from 'path';
import { hashPassword } from './auth';

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

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
const DB_NAME = process.env.DB_NAME || 'nettopology_db';
const DB_USER = process.env.DB_USER || 'nettopology_user';
const DB_PASSWORD = process.env.DB_PASSWORD || '';

let pool: Pool | null = null;
let isPostgresReady = false;
let lastError: string | null = null;

// Local persistent file fallback (used if PostgreSQL is offline or unprovisioned)
const FALLBACK_FILE = path.join(process.cwd(), 'backend', 'database_store.json');

interface FallbackStore {
  users: any[];
  user_groups: any[];
  access_policies: any[];
  devices: any[];
  device_groups: any[];
  custom_maps: any[];
  topology_hierarchy: any[];
  node_positions: Record<string, Record<string, { x: number; y: number }>>;
  audit_logs: any[];
  ad_config: any;
}

function loadInitialDevices(): any[] {
  try {
    const netPath = path.join(process.cwd(), 'backend', 'network_data.json');
    if (fs.existsSync(netPath)) {
      const parsed = JSON.parse(fs.readFileSync(netPath, 'utf-8'));
      if (Array.isArray(parsed.devices) && parsed.devices.length > 0) {
        return parsed.devices;
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
    member_user_ids: ['user-noc'],
    is_builtin: false,
    created_at: new Date().toISOString()
  },
  {
    id: 'group-helpdesk-ops',
    name: 'کارشناسان پشتیبانی و هلپ‌دسک (Helpdesk Support)',
    description: 'پشتیبانی کاربران محلی، بررسی پورت‌ها و خطایابی کلاینت‌های شبکه',
    color: 'emerald',
    member_user_ids: ['user-helpdesk'],
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

const DEFAULT_ACCESS_POLICIES = [
  {
    id: 'policy-full',
    name: 'دسترسی کامل مدیریتی (Full Admin Policy)',
    description: 'دسترسی بی‌قید و شرط به تمام ماژول‌ها، تجهیزات، نقشه‌ها و تنظیمات',
    priority: 1,
    is_builtin: true,
    policy_data: {
      devices: ['*'],
      maps: ['*'],
      actions: ['create', 'read', 'update', 'delete', 'execute', 'manage'],
      modules: ['all']
    },
    created_at: new Date().toISOString()
  },
  {
    id: 'policy-operator',
    name: 'عملیات استاندارد شبکه (Network Operator Policy)',
    description: 'امکان اجرای دستورات عیب‌یابی، مشاهده توپولوژی و ایجاد نقشه‌های اختصاصی',
    priority: 10,
    is_builtin: false,
    policy_data: {
      devices: ['*'],
      maps: ['read', 'create_own'],
      actions: ['read', 'ping', 'traceroute', 'check_port'],
      modules: ['topology', 'tools', 'devices']
    },
    created_at: new Date().toISOString()
  },
  {
    id: 'policy-helpdesk',
    name: 'خطایابی هلپ‌دسک (Helpdesk Diagnostics Policy)',
    description: 'مشاهده وضعیت تجهیزات لایه دسترسی و اجرای ابزارهای پایه مانیتورینگ',
    priority: 20,
    is_builtin: false,
    policy_data: {
      devices: ['type:switch', 'role:Access Switch'],
      maps: ['read_public'],
      actions: ['read', 'ping', 'port_status'],
      modules: ['topology', 'tools']
    },
    created_at: new Date().toISOString()
  },
  {
    id: 'policy-readonly',
    name: 'سیاست فقط-خواندنی (Read-Only Observer Policy)',
    description: 'صرفاً مشاهده وضعیت کلی شبکه و نقشه‌های پابلیک',
    priority: 30,
    is_builtin: false,
    policy_data: {
      devices: ['*'],
      maps: ['read_public'],
      actions: ['read'],
      modules: ['topology']
    },
    created_at: new Date().toISOString()
  }
];

const DEFAULT_DEVICE_GROUPS = [
  {
    id: 'devgroup-core',
    name: 'سوییچ‌های لایه هسته و توزیع (Core & Distribution)',
    description: 'سوییچ‌های پرسرعت Catalyst و Nexus مسئول ترافیک اصلی ستون‌فقرات',
    color: 'indigo',
    icon: 'Layers',
    device_ids: ['dev-core-01', 'dev-dist-01', 'dev-core-02'],
    created_at: new Date().toISOString()
  },
  {
    id: 'devgroup-access',
    name: 'سوییچ‌های لایه دسترسی (Access Layer Switches)',
    description: 'سوییچ‌های ارتباط دهنده کلاینت‌ها، ایستگاه‌های کاری و اکسس‌پوینت‌ها',
    color: 'emerald',
    icon: 'Server',
    device_ids: ['dev-acc-01', 'dev-acc-02', 'dev-acc-03'],
    created_at: new Date().toISOString()
  },
  {
    id: 'devgroup-routers',
    name: 'روترها و لبه شبکه WAN (Edge & Gateways)',
    description: 'تجهیزات مرزی مسیریابی، گیت‌وی اینترنت و تانل‌های VPN',
    color: 'cyan',
    icon: 'Radio',
    device_ids: ['dev-router-gw', 'dev-wan-gw'],
    created_at: new Date().toISOString()
  }
];

const DEFAULT_HIERARCHY = [
  {
    id: 'bldg-central',
    type: 'building',
    name: 'ساختمان مرکزی (Central Bldg)',
    description: 'ساختمان اداری مرکزی و دیتاسنتر اصلی سازمان',
    parentId: null,
    metadata: { address: 'تهران، خیابان ولیعصر', floorsCount: 4 }
  },
  {
    id: 'bldg-west',
    type: 'building',
    name: 'شعبه غرب (West Branch)',
    description: 'ساختمان پشتیبان و شعبه توسعه نرم‌افزار',
    parentId: null,
    metadata: { address: 'شعبه غرب، پارک فناوری', floorsCount: 2 }
  },
  {
    id: 'floor-dc',
    type: 'floor',
    name: 'مرکز داده (DC Floor)',
    description: 'طبقه زیرهمکف اختصاصی مرکز داده و رک‌های سرور',
    parentId: 'bldg-central',
    metadata: { securityLevel: 'High', cooling: 'Precision AC' }
  },
  {
    id: 'floor-1',
    type: 'floor',
    name: 'طبقه ۱ (Floor 1)',
    description: 'طبقه اداری و اتاق کارشناسان شبکه',
    parentId: 'bldg-central',
    metadata: { usersCount: 45 }
  },
  {
    id: 'unit-server-room',
    type: 'unit',
    name: 'اتاق سرور اصلی (Main Server Room)',
    description: 'اتاق سرور مرکزی مجهز به سیستم اطفا حریق و کنترل تردد',
    parentId: 'floor-dc',
    metadata: { doorAccess: 'Biometric' }
  },
  {
    id: 'unit-idf-1',
    type: 'unit',
    name: 'اتاق رک طبقه ۱ (IDF-1)',
    description: 'رک‌های توزیع طبقه اول برای کلاینت‌ها',
    parentId: 'floor-1',
    metadata: {}
  },
  {
    id: 'rack-a01',
    type: 'rack',
    name: 'Rack-A01 (Core & WAN)',
    description: 'رک اختصاصی تجهیزات Core و Edge سازمان',
    parentId: 'unit-server-room',
    metadata: { totalU: 42, usedU: 14 }
  },
  {
    id: 'rack-a02',
    type: 'rack',
    name: 'Rack-A02 (Distribution)',
    description: 'رک سوییچ‌های لایه توزیع و ارتباطی شعب',
    parentId: 'unit-server-room',
    metadata: { totalU: 42, usedU: 10 }
  },
  {
    id: 'rack-b01',
    type: 'rack',
    name: 'Rack-B01 (Access Floor 1)',
    description: 'رک توزیع کابلی طبقه ۱',
    parentId: 'unit-idf-1',
    metadata: { totalU: 24, usedU: 8 }
  }
];

const DEFAULT_CUSTOM_MAPS = [
  {
    id: 'map-enterprise-core',
    name: 'شبکه ستون‌فقرات و دیتاسنتر (Backbone & Datacenter)',
    description: 'نقشه توپولوژی ارتباطی سوییچ‌های Core، روتر مرزی و سوییچ‌های توزیع',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deviceIds: ['dev-router-gw', 'dev-core-01', 'dev-dist-01', 'dev-acc-01', 'dev-acc-02'],
    devicePositions: {
      'dev-router-gw': { x: 480, y: 80 },
      'dev-core-01': { x: 480, y: 240 },
      'dev-dist-01': { x: 240, y: 420 },
      'dev-acc-01': { x: 120, y: 620 },
      'dev-acc-02': { x: 360, y: 620 }
    },
    links: [
      {
        id: 'link-gw-core',
        sourceDeviceId: 'dev-router-gw',
        targetDeviceId: 'dev-core-01',
        sourceInterface: 'GigabitEthernet0/0/0',
        targetInterface: 'FortyGigE1/0/1',
        color: '#3b82f6',
        type: 'fiber',
        speed: '40Gbps',
        status: 'connected'
      },
      {
        id: 'link-core-dist',
        sourceDeviceId: 'dev-core-01',
        targetDeviceId: 'dev-dist-01',
        sourceInterface: 'TenGigE1/0/1',
        targetInterface: 'TenGigE1/1/1',
        color: '#10b981',
        type: 'fiber',
        speed: '10Gbps',
        status: 'connected'
      },
      {
        id: 'link-dist-acc1',
        sourceDeviceId: 'dev-dist-01',
        targetDeviceId: 'dev-acc-01',
        sourceInterface: 'GigabitEthernet1/0/1',
        targetInterface: 'GigabitEthernet0/1',
        color: '#6366f1',
        type: 'copper',
        speed: '1Gbps',
        status: 'connected'
      },
      {
        id: 'link-dist-acc2',
        sourceDeviceId: 'dev-dist-01',
        targetDeviceId: 'dev-acc-02',
        sourceInterface: 'GigabitEthernet1/0/2',
        targetInterface: 'GigabitEthernet0/1',
        color: '#6366f1',
        type: 'copper',
        speed: '1Gbps',
        status: 'connected'
      }
    ],
    visibility: 'public',
    ownerId: 'user-admin',
    ownerName: 'admin',
    allowedUsers: []
  }
];

const DEFAULT_NODE_POSITIONS: Record<string, Record<string, { x: number; y: number }>> = {
  default: {
    'dev-router-gw': { x: 480, y: 80 },
    'dev-core-01': { x: 480, y: 240 },
    'dev-dist-01': { x: 240, y: 420 },
    'dev-core-02': { x: 720, y: 420 },
    'dev-acc-01': { x: 120, y: 620 },
    'dev-acc-02': { x: 360, y: 620 },
    'dev-acc-03': { x: 600, y: 620 },
    'dev-wan-gw': { x: 840, y: 620 }
  }
};

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

function loadFallbackStore(): FallbackStore {
  let store: any = null;
  try {
    if (fs.existsSync(FALLBACK_FILE)) {
      const raw = fs.readFileSync(FALLBACK_FILE, 'utf-8');
      store = JSON.parse(raw);
    }
  } catch (err) {
    console.error('[DB Fallback] Error reading fallback store:', err);
  }

  const defaultAdminHash = hashPassword('admin123', 'seed_salt_admin_2026');
  const defaultHelpdeskHash = hashPassword('helpdesk123', 'seed_salt_helpdesk_2026');
  const defaultNocHash = hashPassword('noc123', 'seed_salt_noc_2026');

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
    },
    {
      id: 'user-helpdesk',
      username: 'helpdesk_user',
      password_hash: defaultHelpdeskHash.hash,
      password_salt: defaultHelpdeskHash.salt,
      full_name: 'کاربر هلپ‌دسک محلی (Helpdesk Local)',
      email: 'helpdesk@nettopology.internal',
      role: 'Helpdesk Specialist',
      user_type: 'local',
      status: 'active',
      group_ids: ['group-helpdesk-ops'],
      is_builtin: false,
      created_at: '2026-09-14T00:00:00.000Z',
      last_login: null
    },
    {
      id: 'user-noc',
      username: 'noc_operator',
      password_hash: defaultNocHash.hash,
      password_salt: defaultNocHash.salt,
      full_name: 'اپراتور محلی NOC (Local NOC)',
      email: 'noc@nettopology.internal',
      role: 'NOC Analyst',
      user_type: 'local',
      status: 'active',
      group_ids: ['group-noc'],
      is_builtin: false,
      created_at: '2026-09-14T00:00:00.000Z',
      last_login: null
    }
  ];

  if (!store || typeof store !== 'object') {
    store = {};
  }

  if (!Array.isArray(store.users) || store.users.length === 0) {
    store.users = defaultUsers;
  }
  if (!Array.isArray(store.user_groups) || store.user_groups.length === 0) {
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
  if (!Array.isArray(store.custom_maps) || store.custom_maps.length === 0) {
    store.custom_maps = DEFAULT_CUSTOM_MAPS;
  }
  if (!Array.isArray(store.topology_hierarchy) || store.topology_hierarchy.length === 0) {
    store.topology_hierarchy = DEFAULT_HIERARCHY;
  }
  if (!store.node_positions || Object.keys(store.node_positions).length === 0) {
    store.node_positions = DEFAULT_NODE_POSITIONS;
  }
  if (!store.ad_config) {
    store.ad_config = DEFAULT_AD_CONFIG;
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

  return store;
}

function saveFallbackStore(data: FallbackStore): void {
  try {
    fs.mkdirSync(path.dirname(FALLBACK_FILE), { recursive: true });
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[DB Fallback] Error saving fallback store:', err);
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
    const config: PoolConfig = {
      host: DB_HOST,
      port: DB_PORT,
      database: DB_NAME,
      user: DB_USER,
      password: DB_PASSWORD,
      connectionTimeoutMillis: 2500,
      idleTimeoutMillis: 10000,
      max: 10,
    };

    pool = new Pool(config);

    // Test connection with a simple query
    const client = await pool.connect();
    console.log(`[Database] Successfully connected to PostgreSQL server on ${DB_HOST}:${DB_PORT}/${DB_NAME}`);
    
    // Read and run schema.sql
    const schemaPath = path.join(process.cwd(), 'backend', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf-8');
      await client.query(sql);
      console.log('[Database] PostgreSQL schema verification and migration completed.');
    }

    // 1. Seed Users if empty
    const usersCountRes = await client.query('SELECT count(*) as count FROM users');
    if (parseInt(usersCountRes.rows[0]?.count || '0', 10) === 0) {
      for (const u of initialData.users) {
        await client.query(
          `INSERT INTO users (id, username, password_hash, password_salt, full_name, email, role, user_type, status, group_ids, is_builtin, created_at, last_login)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (id) DO NOTHING`,
          [
            u.id,
            u.username,
            u.password_hash,
            u.password_salt,
            u.full_name,
            u.email,
            u.role,
            u.user_type,
            u.status,
            JSON.stringify(u.group_ids || []),
            u.is_builtin || false,
            u.created_at || new Date().toISOString(),
            u.last_login || null,
          ]
        );
      }
      console.log('[Database] Seeded initial users into PostgreSQL users table.');
    }

    // 2. Seed User Groups if empty
    const groupCountRes = await client.query('SELECT count(*) as count FROM user_groups');
    if (parseInt(groupCountRes.rows[0]?.count || '0', 10) === 0) {
      for (const g of DEFAULT_USER_GROUPS) {
        await client.query(
          `INSERT INTO user_groups (id, name, description, color, member_user_ids, is_builtin, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING`,
          [g.id, g.name, g.description, g.color, JSON.stringify(g.member_user_ids), g.is_builtin, g.created_at]
        );
      }
      console.log('[Database] Seeded initial user groups into PostgreSQL.');
    }

    // 3. Seed Access Policies if empty
    const policyCountRes = await client.query('SELECT count(*) as count FROM access_policies');
    if (parseInt(policyCountRes.rows[0]?.count || '0', 10) === 0) {
      for (const p of DEFAULT_ACCESS_POLICIES) {
        await client.query(
          `INSERT INTO access_policies (id, name, description, priority, is_builtin, policy_data, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING`,
          [p.id, p.name, p.description, p.priority, p.is_builtin, JSON.stringify(p.policy_data), p.created_at]
        );
      }
      console.log('[Database] Seeded initial access policies into PostgreSQL.');
    }

    // 4. Seed Devices if empty
    const devCountRes = await client.query('SELECT count(*) as count FROM devices');
    if (parseInt(devCountRes.rows[0]?.count || '0', 10) === 0) {
      const devicesToSeed = loadInitialDevices();
      for (const d of devicesToSeed) {
        await client.query(
          `INSERT INTO devices (id, name, ip, type, model, platform, role, connection_mode, ssh_host, ssh_port, ssh_username, is_online, latency_ms, mac_address, uptime_str, ports)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           ON CONFLICT (id) DO NOTHING`,
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
          ]
        );
      }
      console.log(`[Database] Seeded ${devicesToSeed.length} devices into PostgreSQL devices table.`);
    }

    // 5. Seed Device Groups if empty
    const devGroupCountRes = await client.query('SELECT count(*) as count FROM device_groups');
    if (parseInt(devGroupCountRes.rows[0]?.count || '0', 10) === 0) {
      for (const dg of DEFAULT_DEVICE_GROUPS) {
        await client.query(
          `INSERT INTO device_groups (id, name, description, color, icon, device_ids)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [dg.id, dg.name, dg.description, dg.color, dg.icon, JSON.stringify(dg.device_ids)]
        );
      }
      console.log('[Database] Seeded initial device groups into PostgreSQL.');
    }

    // 6. Seed Topology Hierarchy if empty
    const hierCountRes = await client.query('SELECT count(*) as count FROM topology_hierarchy');
    if (parseInt(hierCountRes.rows[0]?.count || '0', 10) === 0) {
      for (const h of DEFAULT_HIERARCHY) {
        await client.query(
          `INSERT INTO topology_hierarchy (id, type, parent_id, name, description, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [h.id, h.type, h.parentId, h.name, h.description, JSON.stringify(h.metadata)]
        );
      }
      console.log('[Database] Seeded topology physical hierarchy into PostgreSQL.');
    }

    // 7. Seed Custom Maps if empty
    const mapsCountRes = await client.query('SELECT count(*) as count FROM custom_maps');
    if (parseInt(mapsCountRes.rows[0]?.count || '0', 10) === 0) {
      for (const m of DEFAULT_CUSTOM_MAPS) {
        await client.query(
          `INSERT INTO custom_maps (id, name, description, map_type, nodes, connections, viewport, metadata, visibility, owner_id, owner_name, allowed_users, map_data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (id) DO NOTHING`,
          [
            m.id,
            m.name,
            m.description,
            'schematic',
            JSON.stringify(m.devicePositions),
            JSON.stringify(m.links),
            JSON.stringify({ zoom: 1, pan: { x: 0, y: 0 } }),
            JSON.stringify({}),
            m.visibility,
            m.ownerId,
            m.ownerName,
            JSON.stringify(m.allowedUsers),
            JSON.stringify(m)
          ]
        );
      }
      console.log('[Database] Seeded enterprise custom maps into PostgreSQL.');
    }

    // 8. Seed Node Positions if empty
    const nodePosCountRes = await client.query('SELECT count(*) as count FROM node_positions');
    if (parseInt(nodePosCountRes.rows[0]?.count || '0', 10) === 0) {
      const defaultPositions = DEFAULT_NODE_POSITIONS['default'];
      for (const [nodeId, coords] of Object.entries(defaultPositions)) {
        await client.query(
          `INSERT INTO node_positions (map_id, node_id, x, y)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (map_id, node_id) DO NOTHING`,
          ['default', nodeId, coords.x, coords.y]
        );
      }
      console.log('[Database] Seeded default node canvas positions into PostgreSQL.');
    }

    // 9. Seed Active Directory Config if empty
    const adRes = await client.query('SELECT count(*) as count FROM ad_config');
    if (parseInt(adRes.rows[0]?.count || '0', 10) === 0) {
      await client.query(
        `INSERT INTO ad_config (id, config_data) VALUES ('primary', $1) ON CONFLICT (id) DO NOTHING`,
        [JSON.stringify(DEFAULT_AD_CONFIG)]
      );
      console.log('[Database] Seeded default AD configuration into PostgreSQL.');
    }

    client.release();
    isPostgresReady = true;
    lastError = null;
  } catch (err: any) {
    isPostgresReady = false;
    lastError = err.message || 'PostgreSQL not available';
    console.warn(`[Database Notice] PostgreSQL is not reachable (${lastError}). Using robust file-backed store for persistence.`);
  }
}

/**
 * Get current database status and metrics
 */
export async function getDbStatus(): Promise<DbStatus> {
  const status: DbStatus = {
    connected: isPostgresReady,
    engine: isPostgresReady ? 'postgresql' : 'fallback_json',
    host: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    user: DB_USER,
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
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT * FROM users WHERE LOWER(username) = $1 LIMIT 1', [cleanUser]);
      if (res.rows.length > 0) return res.rows[0];
    } catch (e) {
      console.error('[DB Query Error]', e);
    }
  }

  const store = loadFallbackStore();
  return store.users.find((u) => u.username.toLowerCase() === cleanUser) || null;
}

export async function getAllUsers(): Promise<any[]> {
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT id, username, full_name, email, role, user_type, status, group_ids, is_builtin, last_login, created_at FROM users ORDER BY created_at ASC');
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
    } catch (e) {
      console.error('[DB Query Error]', e);
    }
  }

  const store = loadFallbackStore();
  return store.users.map((u) => ({
    id: u.id,
    username: u.username,
    fullName: u.full_name,
    email: u.email,
    role: u.role,
    userType: u.user_type,
    status: u.status,
    groupIds: u.group_ids,
    isBuiltin: u.is_builtin,
    lastLogin: u.last_login,
    createdAt: u.created_at,
  }));
}

export async function saveUser(userData: any): Promise<any> {
  const store = loadFallbackStore();
  const existingIndex = store.users.findIndex((u) => u.id === userData.id || u.username.toLowerCase() === userData.username?.toLowerCase());
  
  let userRecord: any;
  if (existingIndex >= 0) {
    const prev = store.users[existingIndex];
    let pwdHash = prev.password_hash;
    let pwdSalt = prev.password_salt;
    if (userData.password) {
      const p = hashPassword(userData.password);
      pwdHash = p.hash;
      pwdSalt = p.salt;
    }
    userRecord = {
      ...prev,
      username: userData.username || prev.username,
      password_hash: pwdHash,
      password_salt: pwdSalt,
      full_name: userData.fullName || prev.full_name,
      email: userData.email || prev.email,
      role: userData.role || prev.role,
      user_type: userData.userType || prev.user_type,
      status: userData.status || prev.status,
      group_ids: userData.groupIds || prev.group_ids,
      updated_at: new Date().toISOString(),
    };
  } else {
    const p = hashPassword(userData.password || 'welcome123');
    userRecord = {
      id: userData.id || `user-${Date.now()}`,
      username: userData.username,
      password_hash: p.hash,
      password_salt: p.salt,
      full_name: userData.fullName || userData.username,
      email: userData.email || `${userData.username}@nettopology.internal`,
      role: userData.role || 'NOC Analyst',
      user_type: userData.userType || 'local',
      status: userData.status || 'active',
      group_ids: userData.groupIds || [],
      is_builtin: false,
      last_login: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  if (isPostgresReady && pool) {
    try {
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
    } catch (e) {
      console.error('[DB Query Error]', e);
    }
  }

  // Always update fallback store
  if (existingIndex >= 0) {
    store.users[existingIndex] = { ...store.users[existingIndex], ...userRecord };
  } else {
    store.users.push(userRecord);
  }
  saveFallbackStore(store);

  return userRecord;
}

export async function updateLastLogin(userId: string): Promise<void> {
  const now = new Date().toISOString();
  if (isPostgresReady && pool) {
    try {
      await pool.query('UPDATE users SET last_login = $1 WHERE id = $2', [now, userId]);
    } catch (e) {
      console.error('[DB Query Error]', e);
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
}

export async function getCustomMaps(userFilter?: MapUserFilter): Promise<any[]> {
  let allMaps: any[] = [];
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT * FROM custom_maps ORDER BY created_at ASC');
      allMaps = res.rows.map((r) => {
        const rawMapData = typeof r.map_data === 'string' ? JSON.parse(r.map_data) : (r.map_data || {});
        const allowedUsers = Array.isArray(r.allowed_users)
          ? r.allowed_users
          : (typeof r.allowed_users === 'string' ? JSON.parse(r.allowed_users) : (rawMapData.allowedUsers || []));

        return {
          devicePositions: rawMapData.devicePositions || (typeof r.nodes === 'string' ? JSON.parse(r.nodes) : r.nodes) || {},
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
          createdAt: r.created_at ? new Date(r.created_at).toISOString() : (rawMapData.createdAt || new Date().toISOString()),
          updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : (rawMapData.updatedAt || new Date().toISOString()),
          visibility: r.visibility || rawMapData.visibility || 'public',
          ownerId: r.owner_id || rawMapData.ownerId || 'user-admin',
          ownerName: r.owner_name || rawMapData.ownerName || 'admin',
          allowedUsers,
        };
      });
    } catch (e) {
      console.error('[DB Query Error]', e);
      allMaps = loadFallbackStore().custom_maps || [];
    }
  } else {
    allMaps = loadFallbackStore().custom_maps || [];
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

    // 3. Restricted map: visible to owner + specified users
    if (visibility === 'restricted') {
      if (isOwner) return true;
      const allowed = Array.isArray(map.allowedUsers) ? map.allowedUsers : [];
      return allowed.some(
        (u: string) =>
          u.toLowerCase() === currentUsername || (currentUserId && u === currentUserId)
      );
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

  if (isPostgresReady && pool) {
    try {
      const client = await pool.connect();
      await client.query('BEGIN');
      await client.query('DELETE FROM custom_maps');
      for (const m of normalizedMaps) {
        await client.query(
          `INSERT INTO custom_maps (
             id, name, description, map_type, building_id, floor_id, unit_id, rack_id,
             nodes, connections, viewport, metadata, visibility, owner_id, owner_name, allowed_users, map_data, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
          [
            m.id,
            m.name || 'Untitled Map',
            m.description || '',
            m.type || 'schematic',
            m.buildingId || null,
            m.floorId || null,
            m.unitId || null,
            m.rackId || null,
            JSON.stringify(m.devicePositions || m.nodes || {}),
            JSON.stringify(m.links || m.connections || []),
            JSON.stringify(m.viewport || { zoom: 1, pan: { x: 0, y: 0 } }),
            JSON.stringify(m.metadata || {}),
            m.visibility || 'public',
            m.ownerId || 'user-admin',
            m.ownerName || 'admin',
            JSON.stringify(m.allowedUsers || []),
            JSON.stringify(m),
            m.createdAt ? new Date(m.createdAt) : new Date(),
            new Date(),
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
      return res.rows.map((r) => ({
        id: r.id,
        type: r.type,
        parentId: r.parent_id,
        name: r.name,
        description: r.description,
        metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata,
      }));
    } catch (e) {
      console.error('[DB Query Error]', e);
    }
  }
  return loadFallbackStore().topology_hierarchy;
}

export async function saveHierarchy(items: any[]): Promise<void> {
  const store = loadFallbackStore();
  store.topology_hierarchy = items;
  saveFallbackStore(store);

  if (isPostgresReady && pool) {
    try {
      const client = await pool.connect();
      await client.query('BEGIN');
      await client.query('DELETE FROM topology_hierarchy');
      for (const item of items) {
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
      console.error('[DB Query Error]', e);
    }
  }
}

// -------------------------------------------------------------
// User Groups
// -------------------------------------------------------------
export async function getUserGroups(): Promise<any[]> {
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT * FROM user_groups ORDER BY created_at ASC');
      return res.rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        color: r.color,
        memberUserIds: typeof r.member_user_ids === 'string' ? JSON.parse(r.member_user_ids) : r.member_user_ids,
        isBuiltin: r.is_builtin,
      }));
    } catch (e) {
      console.error('[DB Query Error]', e);
    }
  }
  return loadFallbackStore().user_groups;
}

export async function saveUserGroups(groups: any[]): Promise<void> {
  const store = loadFallbackStore();
  store.user_groups = groups;
  saveFallbackStore(store);

  if (isPostgresReady && pool) {
    try {
      const client = await pool.connect();
      await client.query('BEGIN');
      await client.query('DELETE FROM user_groups');
      for (const g of groups) {
        await client.query(
          `INSERT INTO user_groups (id, name, description, color, member_user_ids, is_builtin)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [g.id, g.name, g.description, g.color, JSON.stringify(g.memberUserIds || g.member_user_ids || []), g.isBuiltin || false]
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
      return res.rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        priority: r.priority,
        isBuiltin: r.is_builtin,
        policyData: typeof r.policy_data === 'string' ? JSON.parse(r.policy_data) : r.policy_data,
      }));
    } catch (e) {
      console.error('[DB Query Error]', e);
    }
  }
  return loadFallbackStore().access_policies;
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
        await client.query(
          `INSERT INTO access_policies (id, name, description, priority, is_builtin, policy_data)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [p.id, p.name, p.description, p.priority || 100, p.isBuiltin || false, JSON.stringify(p.policyData || p.policy_data || {})]
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
// Device Groups
// -------------------------------------------------------------
export async function getDeviceGroups(): Promise<any[]> {
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT * FROM device_groups ORDER BY created_at ASC');
      return res.rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        color: r.color,
        icon: r.icon,
        deviceIds: typeof r.device_ids === 'string' ? JSON.parse(r.device_ids) : r.device_ids,
      }));
    } catch (e) {
      console.error('[DB Query Error]', e);
    }
  }
  return loadFallbackStore().device_groups;
}

export async function saveDeviceGroups(groups: any[]): Promise<void> {
  const store = loadFallbackStore();
  store.device_groups = groups;
  saveFallbackStore(store);

  if (isPostgresReady && pool) {
    try {
      const client = await pool.connect();
      await client.query('BEGIN');
      await client.query('DELETE FROM device_groups');
      for (const g of groups) {
        await client.query(
          `INSERT INTO device_groups (id, name, description, color, icon, device_ids)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [g.id, g.name, g.description, g.color, g.icon, JSON.stringify(g.deviceIds || g.device_ids || [])]
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
