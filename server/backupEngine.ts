import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PoolClient } from 'pg';
import {
  getPgPool,
  isPostgresConnected,
  ensurePostgresConnection,
  loadFallbackStore,
  saveFallbackStore,
  FallbackStore,
  addAuditLog,
  getDbStatus,
} from './db';
import { APP_VERSION } from '../src/version';

export type ServerBackupScope =
  | 'full'
  | 'devices_topology'
  | 'security_rbac'
  | 'servers_only'
  | 'templates_only';

export type ServerRestoreMode = 'overwrite' | 'merge';

export interface BackupExportOptions {
  scope?: ServerBackupScope;
  sanitize?: boolean;
  encrypt?: boolean;
  passphrase?: string;
  format?: 'json' | 'sql';
  customNote?: string;
  requestedBy?: {
    username: string;
    role: string;
    ip?: string;
    userAgent?: string;
  };
}

export interface BackupRestoreOptions {
  package: any;
  passphrase?: string;
  mode?: ServerRestoreMode;
  selectedScopes?: string[];
  performedBy?: {
    username: string;
    role: string;
    ip?: string;
    userAgent?: string;
  };
}

export interface SafetySnapshot {
  id: string;
  timestamp: string;
  appVersion: string;
  store: FallbackStore;
  reason: string;
  counts: Record<string, number>;
}

// In-memory latest safety snapshot holder & persistent directory
let latestSafetySnapshot: SafetySnapshot | null = null;
const SNAPSHOT_DIR = path.join(process.cwd(), 'backend', 'snapshots');

function ensureSnapshotDir() {
  try {
    if (!fs.existsSync(SNAPSHOT_DIR)) {
      fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
    }
  } catch (e) {
    console.warn('[DR Engine] Could not create snapshot directory:', e);
  }
}

// ============================================================
// Cryptography & Integrity Utilities (AES-256-GCM + PBKDF2)
// WebCrypto / Browser Compatible
// ============================================================

export function calculateSha256(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

export function encryptPayload(
  plainText: string,
  passphrase: string
): { encryptedBase64: string; saltHex: string; ivHex: string } {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);

  // PBKDF2-SHA256, 100,000 iterations, 32 bytes (256-bit key)
  const key = crypto.pbkdf2Sync(passphrase, salt, 100000, 32, 'sha256');

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(), // WebCrypto appends 16-byte tag to the ciphertext
  ]);

  return {
    encryptedBase64: ciphertext.toString('base64'),
    saltHex: salt.toString('hex'),
    ivHex: iv.toString('hex'),
  };
}

export function decryptPayload(
  encryptedBase64: string,
  saltHex: string,
  ivHex: string,
  passphrase: string
): string {
  const salt = Buffer.from(saltHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const rawCiphertext = Buffer.from(encryptedBase64, 'base64');

  if (rawCiphertext.length < 16) {
    throw new Error('Invalid encrypted package payload: payload length too short');
  }

  // The last 16 bytes is the GCM authentication tag
  const tag = rawCiphertext.subarray(rawCiphertext.length - 16);
  const ciphertext = rawCiphertext.subarray(0, rawCiphertext.length - 16);

  const key = crypto.pbkdf2Sync(passphrase, salt, 100000, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

// ============================================================
// Core Data Extraction (PostgreSQL First, Fallback Store Aware)
// ============================================================

export async function fetchFullDatabaseDataset(): Promise<FallbackStore> {
  const isPg = await ensurePostgresConnection();
  const pool = getPgPool();

  if (isPg && pool) {
    try {
      const client = await pool.connect();
      try {
        const [
          usersRes,
          groupsRes,
          policiesRes,
          devicesRes,
          devGroupsRes,
          customMapsRes,
          hierarchyRes,
          placementsRes,
          stickyNotesRes,
          serversRes,
          serverCatsRes,
          vaultRes,
          reportsRes,
          adConfigRes,
          generalSettingsRes,
        ] = await Promise.all([
          client.query('SELECT * FROM users ORDER BY created_at ASC').catch(() => ({ rows: [] })),
          client.query('SELECT * FROM user_groups ORDER BY created_at ASC').catch(() => ({ rows: [] })),
          client.query('SELECT * FROM access_policies ORDER BY priority ASC, created_at ASC').catch(() => ({ rows: [] })),
          client.query('SELECT * FROM devices ORDER BY name ASC').catch(() => ({ rows: [] })),
          client.query('SELECT * FROM device_groups ORDER BY created_at ASC').catch(() => ({ rows: [] })),
          client.query('SELECT * FROM custom_maps ORDER BY created_at ASC').catch(() => ({ rows: [] })),
          client.query('SELECT * FROM topology_hierarchy ORDER BY created_at ASC').catch(() => ({ rows: [] })),
          client.query('SELECT * FROM device_placements ORDER BY building ASC, floor ASC, rack ASC').catch(() => ({ rows: [] })),
          client.query('SELECT * FROM device_sticky_notes ORDER BY created_at ASC').catch(() => ({ rows: [] })),
          client.query('SELECT * FROM remote_servers ORDER BY created_at ASC').catch(() => ({ rows: [] })),
          client.query('SELECT * FROM server_categories ORDER BY created_at ASC').catch(() => ({ rows: [] })),
          client.query('SELECT * FROM user_password_vault ORDER BY created_at ASC').catch(() => ({ rows: [] })),
          client.query('SELECT * FROM bulk_server_reports ORDER BY created_at DESC LIMIT 500').catch(() => ({ rows: [] })),
          client.query("SELECT config_data FROM ad_config WHERE id = 'primary' LIMIT 1").catch(() => ({ rows: [] })),
          client.query("SELECT settings FROM panel_general_settings WHERE id = 'default' LIMIT 1").catch(() => ({ rows: [] })),
        ]);

        // Load node positions
        const nodePosRes = await client.query('SELECT map_id, node_id, x, y FROM node_positions').catch(() => ({ rows: [] }));
        const nodePositions: Record<string, Record<string, { x: number; y: number }>> = {};
        for (const row of nodePosRes.rows) {
          const mapId = row.map_id || 'default';
          if (!nodePositions[mapId]) nodePositions[mapId] = {};
          nodePositions[mapId][row.node_id] = { x: parseFloat(row.x), y: parseFloat(row.y) };
        }

        const adConfig = adConfigRes.rows[0]?.config_data || null;
        const generalSettings = generalSettingsRes.rows[0]?.settings || undefined;

        return {
          users: usersRes.rows,
          user_groups: groupsRes.rows,
          access_policies: policiesRes.rows,
          devices: devicesRes.rows,
          device_groups: devGroupsRes.rows,
          custom_maps: customMapsRes.rows,
          topology_hierarchy: hierarchyRes.rows,
          device_placements: placementsRes.rows,
          device_sticky_notes: stickyNotesRes.rows,
          remote_servers: serversRes.rows,
          server_categories: serverCatsRes.rows,
          user_password_vault: vaultRes.rows,
          bulk_server_reports: reportsRes.rows,
          ad_config: adConfig,
          general_settings: generalSettings,
          node_positions: nodePositions,
          audit_logs: [],
        };
      } finally {
        client.release();
      }
    } catch (pgErr) {
      console.warn('[DR Engine] Error fetching from PostgreSQL, using fallback store:', pgErr);
    }
  }

  // Fallback to local persistent JSON store
  return loadFallbackStore();
}

// ============================================================
// Sanitization Helper
// ============================================================

function sanitizeStoreDataset(data: FallbackStore): FallbackStore {
  const cloned: FallbackStore = JSON.parse(JSON.stringify(data));

  // Sanitize Users
  if (Array.isArray(cloned.users)) {
    cloned.users = cloned.users.map((u) => ({
      ...u,
      password_hash: '[MASKED_HASH_FOR_EXPORT]',
      password_salt: '[MASKED_SALT_FOR_EXPORT]',
    }));
  }

  // Sanitize Devices
  if (Array.isArray(cloned.devices)) {
    cloned.devices = cloned.devices.map((d) => ({
      ...d,
      ssh_password: d.ssh_password ? '••••••••' : undefined,
      enable_password: d.enable_password ? '••••••••' : undefined,
      snmp_community: d.snmp_community ? '••••' : undefined,
      connection_data: d.connection_data ? { ...d.connection_data, password: '••••' } : {},
    }));
  }

  // Sanitize Remote Servers
  if (Array.isArray(cloned.remote_servers)) {
    cloned.remote_servers = cloned.remote_servers.map((s) => ({
      ...s,
      ssh_password: s.ssh_password ? '••••••••' : undefined,
      win_password: s.win_password ? '••••••••' : undefined,
      postgres_password: s.postgres_password ? '••••••••' : undefined,
      mysql_password: s.mysql_password ? '••••••••' : undefined,
    }));
  }

  // Sanitize Active Directory
  if (cloned.ad_config) {
    cloned.ad_config = {
      ...cloned.ad_config,
      bindPassword: '••••••••••••',
    };
  }

  // Sanitize Password Vault
  if (Array.isArray(cloned.user_password_vault)) {
    cloned.user_password_vault = cloned.user_password_vault.map((v) => ({
      ...v,
      encrypted_password: '[REDACTED_PASSWORD]',
      iv: '[REDACTED]',
      tag: '[REDACTED]',
      password_hash: undefined,
      password_salt: undefined,
    }));
  }

  return cloned;
}

// ============================================================
// SQL Script Generator (format = 'sql')
// ============================================================

export function generatePostgreSqlScript(payload: Record<string, any>): string {
  const lines: string[] = [
    '-- ==============================================================================',
    `-- NetTopology Enterprise - Automated Disaster Recovery PostgreSQL Dump`,
    `-- Export Generated At: ${new Date().toISOString()}`,
    `-- App Version: ${APP_VERSION}`,
    '-- ==============================================================================',
    'BEGIN;',
    'SET client_encoding = \'UTF8\';',
    'SET standard_conforming_strings = on;',
    '',
  ];

  const escapeLiteral = (val: any): string => {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    if (typeof val === 'number') return String(val);
    if (typeof val === 'object') {
      const jsonStr = JSON.stringify(val).replace(/'/g, "''");
      return `'${jsonStr}'::jsonb`;
    }
    const str = String(val).replace(/'/g, "''");
    return `'${str}'`;
  };

  const dumpTable = (tableName: string, rows: any[]) => {
    if (!Array.isArray(rows) || rows.length === 0) return;
    lines.push(`-- Data for Name: ${tableName}; Type: TABLE DATA; Rows: ${rows.length}`);
    for (const row of rows) {
      const cols = Object.keys(row);
      const vals = cols.map((col) => escapeLiteral(row[col]));
      lines.push(
        `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${vals.join(', ')}) ON CONFLICT DO NOTHING;`
      );
    }
    lines.push('');
  };

  if (payload.server_categories) dumpTable('server_categories', payload.server_categories);
  if (payload.remote_servers) dumpTable('remote_servers', payload.remote_servers);
  if (payload.user_groups) dumpTable('user_groups', payload.user_groups);
  if (payload.access_policies) dumpTable('access_policies', payload.access_policies);
  if (payload.users) dumpTable('users', payload.users);
  if (payload.device_groups) dumpTable('device_groups', payload.device_groups);
  if (payload.devices) dumpTable('devices', payload.devices);
  if (payload.device_placements) dumpTable('device_placements', payload.device_placements);
  if (payload.device_sticky_notes) dumpTable('device_sticky_notes', payload.device_sticky_notes);
  if (payload.topology_hierarchy) dumpTable('topology_hierarchy', payload.topology_hierarchy);
  if (payload.custom_maps) dumpTable('custom_maps', payload.custom_maps);

  lines.push('COMMIT;');
  lines.push('-- End of Disaster Recovery PostgreSQL Dump');
  return lines.join('\n');
}

// ============================================================
// 1. Export Engine: GET /api/backup/export
// ============================================================

export async function exportDatabaseBackup(options: BackupExportOptions = {}): Promise<{
  package?: any;
  sqlContent?: string;
  filename: string;
  contentType: string;
  metadata: any;
}> {
  const scope: ServerBackupScope = options.scope || 'full';
  const sanitize = !!options.sanitize;
  const isEncrypt = !!options.encrypt && !!options.passphrase && options.passphrase.trim().length > 0;
  const format = options.format || 'json';

  // 1. Fetch live full dataset
  let fullData = await fetchFullDatabaseDataset();

  // 2. Sanitize if requested
  if (sanitize) {
    fullData = sanitizeStoreDataset(fullData);
  }

  // 3. Assemble target scoped payload
  const rawPayload: Record<string, any> = {};

  const isFull = scope === 'full';
  const isDevTopo = scope === 'devices_topology';
  const isSecRbac = scope === 'security_rbac';
  const isServersOnly = scope === 'servers_only';

  if (isFull || isDevTopo) {
    rawPayload.devices = fullData.devices || [];
    rawPayload.device_placements = fullData.device_placements || [];
    rawPayload.device_groups = fullData.device_groups || [];
    rawPayload.device_sticky_notes = fullData.device_sticky_notes || [];
    rawPayload.custom_maps = fullData.custom_maps || [];
    rawPayload.topology_hierarchy = fullData.topology_hierarchy || [];
    rawPayload.node_positions = fullData.node_positions || {};
  }

  if (isFull || isServersOnly) {
    rawPayload.remote_servers = fullData.remote_servers || [];
    rawPayload.server_categories = fullData.server_categories || [];
    rawPayload.bulk_server_reports = fullData.bulk_server_reports || [];
  }

  if (isFull || isSecRbac) {
    rawPayload.users = fullData.users || [];
    rawPayload.user_groups = fullData.user_groups || [];
    rawPayload.access_policies = fullData.access_policies || [];
    rawPayload.ad_config = fullData.ad_config || null;
    rawPayload.user_password_vault = fullData.user_password_vault || [];
  }

  if (isFull) {
    rawPayload.panel_general_settings = fullData.general_settings || null;
  }

  const payloadString = JSON.stringify(rawPayload);
  const checksum = calculateSha256(payloadString);
  const timestampIso = new Date().toISOString();
  const dateFormatted = new Date().toLocaleDateString('fa-IR');

  const scopeLabels: Record<ServerBackupScope, { fa: string; en: string }> = {
    full: {
      fa: 'جامع و کامل سازمانی (Full Enterprise Disaster Recovery Package)',
      en: 'Full Enterprise Disaster Recovery Package',
    },
    devices_topology: {
      fa: 'تجهیزات، نقشهها و جانمایی فیزیکی (Devices & Topology Maps)',
      en: 'Devices & Topology Maps',
    },
    security_rbac: {
      fa: 'کاربران، امنیت و سطوح دسترسی (Identity & Access Control)',
      en: 'Identity & Access Control',
    },
    servers_only: {
      fa: 'ناوگان سرورها و دستهبندیها (Server Fleet & Categories)',
      en: 'Server Fleet & Categories',
    },
    templates_only: {
      fa: 'الگوهای پیکربندی و تمپلتها (Configuration Templates)',
      en: 'Configuration Templates',
    },
  };

  const dbStatus = await getDbStatus();

  const metadata = {
    version: '2.0-dr',
    appVersion: APP_VERSION,
    timestamp: timestampIso,
    createdAt: dateFormatted,
    createdBy: options.requestedBy?.username || 'admin',
    createdRole: options.requestedBy?.role || 'Super Administrator',
    scope,
    scopeLabel: scopeLabels[scope]?.fa || scope,
    scopeLabel_en: scopeLabels[scope]?.en || scope,
    isEncrypted: isEncrypt,
    isSanitized: sanitize,
    checksumSha256: checksum,
    storageEngine: dbStatus.engine,
    customNote: options.customNote || '',
    counts: {
      servers: rawPayload.remote_servers?.length || 0,
      serverCategories: rawPayload.server_categories?.length || 0,
      devices: rawPayload.devices?.length || 0,
      devicePlacements: rawPayload.device_placements?.length || 0,
      deviceGroups: rawPayload.device_groups?.length || 0,
      stickyNotes: rawPayload.device_sticky_notes?.length || 0,
      customMaps: rawPayload.custom_maps?.length || 0,
      users: rawPayload.users?.length || 0,
      userGroups: rawPayload.user_groups?.length || 0,
      accessPolicies: rawPayload.access_policies?.length || 0,
      hasAdConfig: !!rawPayload.ad_config,
      hasGeneralSettings: !!rawPayload.panel_general_settings,
    },
  };

  // Record audit log
  await addAuditLog({
    user_name: options.requestedBy?.username || 'admin',
    action: 'BACKUP_EXPORT',
    category: 'disaster_recovery',
    target: `Scope: ${scope} (Engine: ${dbStatus.engine})`,
    status: 'success',
    details: `Exported ${scope} backup. Servers: ${metadata.counts.servers}, Devices: ${metadata.counts.devices}, Users: ${metadata.counts.users}. Encrypted: ${isEncrypt}, Sanitized: ${sanitize}`,
    ip_address: options.requestedBy?.ip || '127.0.0.1',
    user_agent: options.requestedBy?.userAgent || 'NetTopology-DR-Engine',
  }).catch(() => {});

  const filePrefix = `nettopology_backup_${scope}_${new Date().toISOString().replace(/[:.]/g, '-')}`;

  if (format === 'sql') {
    const sqlContent = generatePostgreSqlScript(rawPayload);
    return {
      sqlContent,
      filename: `${filePrefix}.sql`,
      contentType: 'application/sql',
      metadata,
    };
  }

  // Encrypted JSON
  if (isEncrypt && options.passphrase) {
    const { encryptedBase64, saltHex, ivHex } = encryptPayload(payloadString, options.passphrase.trim());
    const pkg = {
      format: 'nettopology-backup-v2',
      metadata,
      encryptedData: encryptedBase64,
      salt: saltHex,
      iv: ivHex,
    };
    return {
      package: pkg,
      filename: `${filePrefix}.enc.json`,
      contentType: 'application/json',
      metadata,
    };
  }

  // Plain JSON package
  const pkg = {
    format: 'nettopology-backup-v2',
    metadata,
    data: rawPayload,
  };

  return {
    package: pkg,
    filename: `${filePrefix}.json`,
    contentType: 'application/json',
    metadata,
  };
}

// ============================================================
// 2. Safety Snapshot & Rollback Engine
// ============================================================

export async function createPreRestoreSafetySnapshot(reason: string = 'Pre-Restore Auto Snapshot'): Promise<SafetySnapshot> {
  ensureSnapshotDir();
  const currentData = await fetchFullDatabaseDataset();
  const timestamp = new Date().toISOString();
  const snapshotId = `snap_${Date.now()}`;

  const counts = {
    servers: currentData.remote_servers?.length || 0,
    serverCategories: currentData.server_categories?.length || 0,
    devices: currentData.devices?.length || 0,
    devicePlacements: currentData.device_placements?.length || 0,
    deviceGroups: currentData.device_groups?.length || 0,
    customMaps: currentData.custom_maps?.length || 0,
    users: currentData.users?.length || 0,
    userGroups: currentData.user_groups?.length || 0,
    accessPolicies: currentData.access_policies?.length || 0,
  };

  const snapshot: SafetySnapshot = {
    id: snapshotId,
    timestamp,
    appVersion: APP_VERSION,
    store: currentData,
    reason,
    counts,
  };

  latestSafetySnapshot = snapshot;

  // Persist snapshot to file
  try {
    const snapshotFilePath = path.join(SNAPSHOT_DIR, `${snapshotId}.json`);
    fs.writeFileSync(snapshotFilePath, JSON.stringify(snapshot, null, 2), 'utf-8');

    // Also maintain a 'latest.json' pointer
    const latestPath = path.join(SNAPSHOT_DIR, 'safety_snapshot_latest.json');
    fs.writeFileSync(latestPath, JSON.stringify(snapshot, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[DR Engine] Warning saving safety snapshot to disk:', err);
  }

  return snapshot;
}

export function getLatestSafetySnapshot(): SafetySnapshot | null {
  if (latestSafetySnapshot) return latestSafetySnapshot;
  try {
    const latestPath = path.join(SNAPSHOT_DIR, 'safety_snapshot_latest.json');
    if (fs.existsSync(latestPath)) {
      const raw = fs.readFileSync(latestPath, 'utf-8');
      latestSafetySnapshot = JSON.parse(raw);
      return latestSafetySnapshot;
    }
  } catch {}
  return null;
}

// ============================================================
// 3. Restore Engine: POST /api/backup/restore
// ============================================================

export async function restoreDatabaseBackup(options: BackupRestoreOptions): Promise<{
  success: boolean;
  mode: ServerRestoreMode;
  snapshotId: string;
  restoredCounts: Record<string, number>;
  durationMs: number;
  message: string;
  message_en: string;
}> {
  const startTime = Date.now();
  const mode: ServerRestoreMode = options.mode || 'overwrite';
  const pkg = options.package;

  if (!pkg) {
    throw new Error('No backup package payload provided');
  }

  // 1. Unpack & Decrypt if needed
  let rawData: Record<string, any> = {};

  if (pkg.encryptedData) {
    if (!options.passphrase || options.passphrase.trim().length === 0) {
      throw new Error('This backup package is encrypted. A decryption passphrase is required.');
    }
    if (!pkg.salt || !pkg.iv) {
      throw new Error('Invalid encrypted package format: salt or iv missing');
    }

    const decryptedStr = decryptPayload(
      pkg.encryptedData,
      pkg.salt,
      pkg.iv,
      options.passphrase.trim()
    );

    // Verify SHA-256 integrity checksum if metadata present
    if (pkg.metadata?.checksumSha256) {
      const actualChecksum = calculateSha256(decryptedStr);
      if (actualChecksum !== pkg.metadata.checksumSha256) {
        throw new Error('Checksum verification failed: Corrupted backup package or incorrect passphrase.');
      }
    }

    rawData = JSON.parse(decryptedStr);
  } else if (pkg.data) {
    rawData = pkg.data;
  } else {
    // Legacy format or direct object
    rawData = pkg;
  }

  // Support both legacy snake_case and camelCase keys
  const normalizedData: {
    servers: any[];
    serverCategories: any[];
    devices: any[];
    devicePlacements: any[];
    deviceGroups: any[];
    stickyNotes: any[];
    customMaps: any[];
    topologyHierarchy: any[];
    nodePositions: Record<string, any>;
    users: any[];
    userGroups: any[];
    accessPolicies: any[];
    adConfig: any;
    generalSettings: any;
  } = {
    servers: rawData.remote_servers || rawData.servers || [],
    serverCategories: rawData.server_categories || rawData.serverCategories || [],
    devices: rawData.devices || [],
    devicePlacements: rawData.device_placements || rawData.devicePlacements || [],
    deviceGroups: rawData.device_groups || rawData.deviceGroups || [],
    stickyNotes: rawData.device_sticky_notes || rawData.deviceStickyNotes || [],
    customMaps: rawData.custom_maps || rawData.customMaps || [],
    topologyHierarchy: rawData.topology_hierarchy || rawData.topologyHierarchy || rawData.physicalHierarchy || [],
    nodePositions: rawData.node_positions || rawData.nodePositions || {},
    users: rawData.users || rawData.localUsers || [],
    userGroups: rawData.user_groups || rawData.localGroups || [],
    accessPolicies: rawData.access_policies || rawData.accessPolicies || [],
    adConfig: rawData.ad_config || rawData.activeDirectory || null,
    generalSettings: rawData.panel_general_settings || rawData.generalSettings || null,
  };

  // 2. Create Pre-Restore Safety Snapshot (Atomic Rollback Guarantee)
  const snapshot = await createPreRestoreSafetySnapshot(`Auto Snapshot prior to ${mode} restore`);

  const isPg = await ensurePostgresConnection();
  const pool = getPgPool();

  const restoredCounts = {
    servers: normalizedData.servers.length,
    serverCategories: normalizedData.serverCategories.length,
    devices: normalizedData.devices.length,
    devicePlacements: normalizedData.devicePlacements.length,
    deviceGroups: normalizedData.deviceGroups.length,
    stickyNotes: normalizedData.stickyNotes.length,
    customMaps: normalizedData.customMaps.length,
    users: normalizedData.users.length,
    userGroups: normalizedData.userGroups.length,
    accessPolicies: normalizedData.accessPolicies.length,
  };

  // 3. Atomic Execution in PostgreSQL (with Transaction BEGIN / COMMIT / ROLLBACK)
  if (isPg && pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (mode === 'overwrite') {
        // Safe foreign-key order deletion
        if (normalizedData.stickyNotes.length > 0) {
          await client.query('DELETE FROM device_sticky_notes');
        }
        if (normalizedData.devicePlacements.length > 0) {
          await client.query('DELETE FROM device_placements');
        }
        if (normalizedData.devices.length > 0) {
          await client.query('DELETE FROM devices');
        }
        if (normalizedData.servers.length > 0) {
          await client.query('DELETE FROM remote_servers');
        }
        if (normalizedData.serverCategories.length > 0) {
          await client.query('DELETE FROM server_categories');
        }
        if (normalizedData.deviceGroups.length > 0) {
          await client.query('DELETE FROM device_groups');
        }
        if (normalizedData.customMaps.length > 0) {
          await client.query('DELETE FROM custom_maps');
        }
        if (normalizedData.topologyHierarchy.length > 0 && Array.isArray(normalizedData.topologyHierarchy)) {
          await client.query('DELETE FROM topology_hierarchy');
        }
        if (Object.keys(normalizedData.nodePositions).length > 0) {
          await client.query('DELETE FROM node_positions');
        }
        if (normalizedData.accessPolicies.length > 0) {
          await client.query('DELETE FROM access_policies WHERE is_builtin = FALSE');
        }
        if (normalizedData.userGroups.length > 0) {
          await client.query('DELETE FROM user_groups WHERE is_builtin = FALSE');
        }
        if (normalizedData.users.length > 0) {
          // Keep root admin user to prevent lockout if not included in backup
          await client.query("DELETE FROM users WHERE LOWER(username) != 'admin'");
        }
      }

      // Helper for Upsert / Insert
      // Server Categories
      for (const cat of normalizedData.serverCategories) {
        if (!cat.id || !cat.name) continue;
        await client.query(
          `INSERT INTO server_categories (id, name, name_fa, description, color, is_default, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             name_fa = EXCLUDED.name_fa,
             description = EXCLUDED.description,
             color = EXCLUDED.color,
             is_default = EXCLUDED.is_default,
             updated_at = CURRENT_TIMESTAMP`,
          [
            cat.id,
            cat.name,
            cat.name_fa || null,
            cat.description || null,
            cat.color || 'indigo',
            !!cat.is_default,
            cat.created_at || null,
          ]
        );
      }

      // Remote Servers
      for (const s of normalizedData.servers) {
        if (!s.id || !s.name || !s.ip) continue;
        await client.query(
          `INSERT INTO remote_servers (
             id, name, hostname, ip, os_type, os_distro, environment, category, role, tags,
             ssh_port, ssh_username, ssh_password, ssh_key_path, default_shell,
             win_protocol, win_port, win_username, win_password, win_domain, rdp_security,
             status, cpu_cores, ram_gb, disk_gb, uptime_str, location, notes,
             prompt_password_on_connect, installed_web_servers, installed_databases,
             has_apache, has_nginx, has_postgresql, has_mysql,
             postgres_port, postgres_user, postgres_password, postgres_database,
             created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
             $11, $12, $13, $14, $15,
             $16, $17, $18, $19, $20, $21,
             $22, $23, $24, $25, $26, $27, $28,
             $29, $30, $31,
             $32, $33, $34, $35,
             $36, $37, $38, $39,
             COALESCE($40, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP
           ) ON CONFLICT (id) DO UPDATE SET
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
             ssh_password = COALESCE(EXCLUDED.ssh_password, remote_servers.ssh_password),
             ssh_key_path = EXCLUDED.ssh_key_path,
             default_shell = EXCLUDED.default_shell,
             win_protocol = EXCLUDED.win_protocol,
             win_port = EXCLUDED.win_port,
             win_username = EXCLUDED.win_username,
             win_password = COALESCE(EXCLUDED.win_password, remote_servers.win_password),
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
             postgres_password = COALESCE(EXCLUDED.postgres_password, remote_servers.postgres_password),
             postgres_database = EXCLUDED.postgres_database,
             updated_at = CURRENT_TIMESTAMP`,
          [
            s.id,
            s.name,
            s.hostname || '',
            s.ip,
            s.os_type || 'linux',
            s.os_distro || 'Ubuntu 24.04 LTS',
            s.environment || 'Production',
            s.category || 'Application Server',
            s.role || 'Web & API Backend',
            JSON.stringify(s.tags || []),
            s.ssh_port || 22,
            s.ssh_username || 'root',
            s.ssh_password || null,
            s.ssh_key_path || '',
            s.default_shell || 'bash',
            s.win_protocol || 'rdp',
            s.win_port || 3389,
            s.win_username || 'Administrator',
            s.win_password || '',
            s.win_domain || '',
            s.rdp_security || 'any',
            s.status || 'untested',
            s.cpu_cores || null,
            s.ram_gb || null,
            s.disk_gb || null,
            s.uptime_str || '',
            s.location || 'Datacenter A',
            s.notes || '',
            !!s.prompt_password_on_connect,
            JSON.stringify(s.installed_web_servers || []),
            JSON.stringify(s.installed_databases || []),
            !!s.has_apache,
            !!s.has_nginx,
            !!s.has_postgresql,
            !!s.has_mysql,
            s.postgres_port || 5432,
            s.postgres_user || 'postgres',
            s.postgres_password || '',
            s.postgres_database || 'postgres',
            s.created_at || null,
          ]
        );
      }

      // Network Devices
      for (const d of normalizedData.devices) {
        if (!d.id || !d.name || !d.ip) continue;
        await client.query(
          `INSERT INTO devices (
             id, name, ip, type, model, platform, role, connection_mode, connection_protocol,
             ssh_host, ssh_port, winbox_port, ssh_username, ssh_password, enable_password,
             connection_data, ports, building, floor, unit, rack, section, location, hierarchy_id,
             ssh_version, is_online, latency_ms, mac_address, serial_number, uptime_str,
             last_seen, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9,
             $10, $11, $12, $13, $14, $15,
             $16, $17, $18, $19, $20, $21, $22, $23, $24,
             $25, $26, $27, $28, $29, $30,
             CURRENT_TIMESTAMP, COALESCE($31, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP
           ) ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             ip = EXCLUDED.ip,
             type = EXCLUDED.type,
             model = EXCLUDED.model,
             platform = EXCLUDED.platform,
             role = EXCLUDED.role,
             connection_mode = EXCLUDED.connection_mode,
             connection_protocol = EXCLUDED.connection_protocol,
             ssh_host = EXCLUDED.ssh_host,
             ssh_port = EXCLUDED.ssh_port,
             winbox_port = EXCLUDED.winbox_port,
             ssh_username = EXCLUDED.ssh_username,
             ssh_password = COALESCE(EXCLUDED.ssh_password, devices.ssh_password),
             enable_password = COALESCE(EXCLUDED.enable_password, devices.enable_password),
             connection_data = EXCLUDED.connection_data,
             ports = EXCLUDED.ports,
             building = EXCLUDED.building,
             floor = EXCLUDED.floor,
             unit = EXCLUDED.unit,
             rack = EXCLUDED.rack,
             section = EXCLUDED.section,
             location = EXCLUDED.location,
             hierarchy_id = EXCLUDED.hierarchy_id,
             ssh_version = EXCLUDED.ssh_version,
             is_online = EXCLUDED.is_online,
             latency_ms = EXCLUDED.latency_ms,
             mac_address = EXCLUDED.mac_address,
             serial_number = EXCLUDED.serial_number,
             uptime_str = EXCLUDED.uptime_str,
             updated_at = CURRENT_TIMESTAMP`,
          [
            d.id,
            d.name,
            d.ip,
            d.type || 'switch',
            d.model || '',
            d.platform || 'cisco_ios_xe',
            d.role || 'Access Switch',
            d.connection_mode || 'ssh',
            d.connection_protocol || 'ssh',
            d.ssh_host || d.ip,
            d.ssh_port || 22,
            d.winbox_port || 8291,
            d.ssh_username || 'admin',
            d.ssh_password || null,
            d.enable_password || null,
            JSON.stringify(d.connection_data || {}),
            JSON.stringify(d.ports || []),
            d.building || '',
            d.floor || '',
            d.unit || '',
            d.rack || '',
            d.section || '',
            d.location || '',
            d.hierarchy_id || '',
            d.ssh_version || 'legacy',
            d.is_online !== undefined ? d.is_online : true,
            d.latency_ms || 1.5,
            d.mac_address || '',
            d.serial_number || '',
            d.uptime_str || '',
            d.created_at || null,
          ]
        );
      }

      // Device Groups
      for (const dg of normalizedData.deviceGroups) {
        if (!dg.id || !dg.name) continue;
        await client.query(
          `INSERT INTO device_groups (id, name, description, color, icon, device_ids, server_ids, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             color = EXCLUDED.color,
             icon = EXCLUDED.icon,
             device_ids = EXCLUDED.device_ids,
             server_ids = EXCLUDED.server_ids,
             updated_at = CURRENT_TIMESTAMP`,
          [
            dg.id,
            dg.name,
            dg.description || '',
            dg.color || 'indigo',
            dg.icon || 'Server',
            JSON.stringify(dg.device_ids || []),
            JSON.stringify(dg.server_ids || []),
            dg.created_at || null,
          ]
        );
      }

      // Device Placements
      for (const dp of normalizedData.devicePlacements) {
        if (!dp.id || !dp.device_id) continue;
        await client.query(
          `INSERT INTO device_placements (id, device_id, building, floor, unit, rack, section, hierarchy_id, position_u, notes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO UPDATE SET
             device_id = EXCLUDED.device_id,
             building = EXCLUDED.building,
             floor = EXCLUDED.floor,
             unit = EXCLUDED.unit,
             rack = EXCLUDED.rack,
             section = EXCLUDED.section,
             hierarchy_id = EXCLUDED.hierarchy_id,
             position_u = EXCLUDED.position_u,
             notes = EXCLUDED.notes,
             updated_at = CURRENT_TIMESTAMP`,
          [
            dp.id,
            dp.device_id,
            dp.building || '',
            dp.floor || '',
            dp.unit || '',
            dp.rack || '',
            dp.section || '',
            dp.hierarchy_id || '',
            dp.position_u || null,
            dp.notes || '',
            dp.created_at || null,
          ]
        );
      }

      // Device Sticky Notes
      for (const sn of normalizedData.stickyNotes) {
        if (!sn.id || !sn.device_id) continue;
        await client.query(
          `INSERT INTO device_sticky_notes (id, device_id, title, content, color, x, y, width, view_mode, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO UPDATE SET
             title = EXCLUDED.title,
             content = EXCLUDED.content,
             color = EXCLUDED.color,
             x = EXCLUDED.x,
             y = EXCLUDED.y,
             width = EXCLUDED.width,
             view_mode = EXCLUDED.view_mode,
             updated_at = CURRENT_TIMESTAMP`,
          [
            sn.id,
            sn.device_id,
            sn.title || '',
            sn.content || '',
            sn.color || 'yellow',
            sn.x || 100,
            sn.y || 100,
            sn.width || 230,
            sn.view_mode || 'card',
            sn.created_at || null,
          ]
        );
      }

      // Custom Maps
      for (const cm of normalizedData.customMaps) {
        if (!cm.id || !cm.name) continue;
        await client.query(
          `INSERT INTO custom_maps (
             id, name, description, map_type, building_id, floor_id, unit_id, rack_id,
             nodes, connections, viewport, metadata, visibility, owner_id, owner_name, allowed_users,
             created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8,
             $9, $10, $11, $12, $13, $14, $15, $16,
             COALESCE($17, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP
           ) ON CONFLICT (id) DO UPDATE SET
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
             updated_at = CURRENT_TIMESTAMP`,
          [
            cm.id,
            cm.name,
            cm.description || '',
            cm.map_type || 'schematic',
            cm.building_id || null,
            cm.floor_id || null,
            cm.unit_id || null,
            cm.rack_id || null,
            JSON.stringify(cm.nodes || []),
            JSON.stringify(cm.connections || []),
            JSON.stringify(cm.viewport || { zoom: 1, pan: { x: 0, y: 0 } }),
            JSON.stringify(cm.metadata || {}),
            cm.visibility || 'public',
            cm.owner_id || 'user-admin',
            cm.owner_name || 'admin',
            JSON.stringify(cm.allowed_users || []),
            cm.created_at || null,
          ]
        );
      }

      // Topology Hierarchy
      if (Array.isArray(normalizedData.topologyHierarchy)) {
        for (const th of normalizedData.topologyHierarchy) {
          if (!th.id || !th.name) continue;
          await client.query(
            `INSERT INTO topology_hierarchy (id, type, parent_id, name, description, metadata, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
             ON CONFLICT (id) DO UPDATE SET
               type = EXCLUDED.type,
               parent_id = EXCLUDED.parent_id,
               name = EXCLUDED.name,
               description = EXCLUDED.description,
               metadata = EXCLUDED.metadata,
               updated_at = CURRENT_TIMESTAMP`,
            [
              th.id,
              th.type || 'building',
              th.parent_id || null,
              th.name,
              th.description || '',
              JSON.stringify(th.metadata || {}),
              th.created_at || null,
            ]
          );
        }
      }

      // Node Positions
      for (const [mapId, positions] of Object.entries(normalizedData.nodePositions)) {
        if (typeof positions === 'object' && positions !== null) {
          for (const [nodeId, rawCoords] of Object.entries(positions as Record<string, any>)) {
            const coords = rawCoords as { x?: number; y?: number };
            if (!coords || typeof coords.x !== 'number' || typeof coords.y !== 'number') continue;
            await client.query(
              `INSERT INTO node_positions (map_id, node_id, x, y)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (map_id, node_id) DO UPDATE SET
                 x = EXCLUDED.x,
                 y = EXCLUDED.y`,
              [mapId, nodeId, coords.x, coords.y]
            );
          }
        }
      }

      // User Groups
      for (const ug of normalizedData.userGroups) {
        if (!ug.id || !ug.name) continue;
        await client.query(
          `INSERT INTO user_groups (id, name, description, color, member_user_ids, is_builtin, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             color = EXCLUDED.color,
             member_user_ids = EXCLUDED.member_user_ids,
             is_builtin = EXCLUDED.is_builtin,
             updated_at = CURRENT_TIMESTAMP`,
          [
            ug.id,
            ug.name,
            ug.description || '',
            ug.color || 'indigo',
            JSON.stringify(ug.member_user_ids || []),
            !!ug.is_builtin,
            ug.created_at || null,
          ]
        );
      }

      // Access Policies
      for (const pol of normalizedData.accessPolicies) {
        if (!pol.id || !pol.name) continue;
        const policyData = pol.policy_data || pol;
        await client.query(
          `INSERT INTO access_policies (id, name, description, priority, is_builtin, policy_data, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             priority = EXCLUDED.priority,
             is_builtin = EXCLUDED.is_builtin,
             policy_data = EXCLUDED.policy_data,
             updated_at = CURRENT_TIMESTAMP`,
          [
            pol.id,
            pol.name,
            pol.description || '',
            pol.priority || 100,
            !!pol.is_builtin,
            JSON.stringify(policyData),
            pol.created_at || null,
          ]
        );
      }

      // Users
      for (const u of normalizedData.users) {
        if (!u.id || !u.username) continue;
        await client.query(
          `INSERT INTO users (
             id, username, password_hash, password_salt, full_name, email, role,
             user_type, status, group_ids, is_builtin, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7,
             $8, $9, $10, $11, COALESCE($12, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP
           ) ON CONFLICT (id) DO UPDATE SET
             username = EXCLUDED.username,
             full_name = EXCLUDED.full_name,
             email = EXCLUDED.email,
             role = EXCLUDED.role,
             user_type = EXCLUDED.user_type,
             status = EXCLUDED.status,
             group_ids = EXCLUDED.group_ids,
             is_builtin = EXCLUDED.is_builtin,
             updated_at = CURRENT_TIMESTAMP`,
          [
            u.id,
            u.username,
            u.password_hash || '[MIGRATED_HASH]',
            u.password_salt || 'salt',
            u.full_name || u.name || '',
            u.email || '',
            u.role || 'Super Administrator',
            u.user_type || 'local',
            u.status || 'active',
            JSON.stringify(u.group_ids || []),
            !!u.is_builtin,
            u.created_at || null,
          ]
        );
      }

      // Active Directory Config
      if (normalizedData.adConfig) {
        await client.query(
          `INSERT INTO ad_config (id, config_data, updated_at)
           VALUES ('primary', $1, CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO UPDATE SET
             config_data = EXCLUDED.config_data,
             updated_at = CURRENT_TIMESTAMP`,
          [JSON.stringify(normalizedData.adConfig)]
        );
      }

      // General Settings
      if (normalizedData.generalSettings) {
        await client.query(
          `INSERT INTO panel_general_settings (id, settings, updated_at, updated_by)
           VALUES ('default', $1, CURRENT_TIMESTAMP, $2)
           ON CONFLICT (id) DO UPDATE SET
             settings = EXCLUDED.settings,
             updated_at = CURRENT_TIMESTAMP,
             updated_by = EXCLUDED.updated_by`,
          [JSON.stringify(normalizedData.generalSettings), options.performedBy?.username || 'admin']
        );
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      console.error('[DR Engine] Transaction failed in PostgreSQL, rolled back successfully:', txErr);
      throw txErr;
    } finally {
      client.release();
    }
  }

  // 4. Also synchronize / update local fallback store to keep 100% parity
  try {
    const currentStore = loadFallbackStore();
    const updatedStore: FallbackStore = {
      ...currentStore,
    };

    if (mode === 'overwrite') {
      if (normalizedData.servers.length > 0) updatedStore.remote_servers = normalizedData.servers;
      if (normalizedData.serverCategories.length > 0) updatedStore.server_categories = normalizedData.serverCategories;
      if (normalizedData.devices.length > 0) updatedStore.devices = normalizedData.devices;
      if (normalizedData.devicePlacements.length > 0) updatedStore.device_placements = normalizedData.devicePlacements;
      if (normalizedData.deviceGroups.length > 0) updatedStore.device_groups = normalizedData.deviceGroups;
      if (normalizedData.stickyNotes.length > 0) updatedStore.device_sticky_notes = normalizedData.stickyNotes;
      if (normalizedData.customMaps.length > 0) updatedStore.custom_maps = normalizedData.customMaps;
      if (normalizedData.users.length > 0) updatedStore.users = normalizedData.users;
      if (normalizedData.userGroups.length > 0) updatedStore.user_groups = normalizedData.userGroups;
      if (normalizedData.accessPolicies.length > 0) updatedStore.access_policies = normalizedData.accessPolicies;
      if (normalizedData.adConfig) updatedStore.ad_config = normalizedData.adConfig;
      if (normalizedData.generalSettings) updatedStore.general_settings = normalizedData.generalSettings;
      if (Object.keys(normalizedData.nodePositions).length > 0) updatedStore.node_positions = normalizedData.nodePositions;
    } else {
      // Smart Merge into Fallback Store
      const mergeArraysById = (orig: any[] = [], incoming: any[] = []) => {
        const map = new Map<string, any>();
        for (const item of orig) if (item?.id) map.set(item.id, item);
        for (const item of incoming) if (item?.id) map.set(item.id, { ...(map.get(item.id) || {}), ...item });
        return Array.from(map.values());
      };

      updatedStore.remote_servers = mergeArraysById(updatedStore.remote_servers, normalizedData.servers);
      updatedStore.server_categories = mergeArraysById(updatedStore.server_categories, normalizedData.serverCategories);
      updatedStore.devices = mergeArraysById(updatedStore.devices, normalizedData.devices);
      updatedStore.device_placements = mergeArraysById(updatedStore.device_placements, normalizedData.devicePlacements);
      updatedStore.device_groups = mergeArraysById(updatedStore.device_groups, normalizedData.deviceGroups);
      updatedStore.device_sticky_notes = mergeArraysById(updatedStore.device_sticky_notes, normalizedData.stickyNotes);
      updatedStore.custom_maps = mergeArraysById(updatedStore.custom_maps, normalizedData.customMaps);
      updatedStore.users = mergeArraysById(updatedStore.users, normalizedData.users);
      updatedStore.user_groups = mergeArraysById(updatedStore.user_groups, normalizedData.userGroups);
      updatedStore.access_policies = mergeArraysById(updatedStore.access_policies, normalizedData.accessPolicies);
      if (normalizedData.adConfig) updatedStore.ad_config = { ...(updatedStore.ad_config || {}), ...normalizedData.adConfig };
      if (normalizedData.generalSettings) updatedStore.general_settings = { ...(updatedStore.general_settings || {}), ...normalizedData.generalSettings };
    }

    saveFallbackStore(updatedStore);
  } catch (storeErr) {
    console.warn('[DR Engine] Warning updating fallback store:', storeErr);
  }

  const durationMs = Date.now() - startTime;

  // 5. Audit Logging
  await addAuditLog({
    user_name: options.performedBy?.username || 'admin',
    action: 'BACKUP_RESTORE',
    category: 'disaster_recovery',
    target: `Mode: ${mode} (Snapshot: ${snapshot.id})`,
    status: 'success',
    details: `Restored ${mode} DR package in ${durationMs}ms. Restored: ${restoredCounts.servers} servers, ${restoredCounts.devices} devices, ${restoredCounts.users} users.`,
    ip_address: options.performedBy?.ip || '127.0.0.1',
    user_agent: options.performedBy?.userAgent || 'NetTopology-DR-Engine',
  }).catch(() => {});

  const message = `عملیات بازگردانی بازیابی از فاجعه (${mode === 'overwrite' ? 'جایگزینی کامل' : 'ادغام هوشمند'}) با موفقیت انجام شد. اسنپ‌شات ایمنی پیش از بازگردانی: ${snapshot.id}`;
  const message_en = `Disaster recovery restore (${mode === 'overwrite' ? 'Full Overwrite' : 'Smart Merge'}) executed successfully. Pre-restore safety snapshot: ${snapshot.id}`;

  return {
    success: true,
    mode,
    snapshotId: snapshot.id,
    restoredCounts,
    durationMs,
    message,
    message_en,
  };
}

// ============================================================
// 4. Rollback to Safety Snapshot
// ============================================================

export async function rollbackSafetySnapshot(snapshotId?: string): Promise<{
  success: boolean;
  message: string;
  message_en: string;
}> {
  let targetSnapshot: SafetySnapshot | null = null;

  if (snapshotId) {
    const specificPath = path.join(SNAPSHOT_DIR, `${snapshotId}.json`);
    if (fs.existsSync(specificPath)) {
      targetSnapshot = JSON.parse(fs.readFileSync(specificPath, 'utf-8'));
    }
  }

  if (!targetSnapshot) {
    targetSnapshot = getLatestSafetySnapshot();
  }

  if (!targetSnapshot || !targetSnapshot.store) {
    throw new Error('No valid safety snapshot found for rollback.');
  }

  // Restore the snapshot store using overwrite mode
  await restoreDatabaseBackup({
    package: {
      format: 'nettopology-backup-v2',
      metadata: {
        scope: 'full',
      },
      data: targetSnapshot.store,
    },
    mode: 'overwrite',
    performedBy: {
      username: 'admin',
      role: 'Super Administrator',
    },
  });

  return {
    success: true,
    message: `سامانه با موفقیت به نقطه بازیابی ${targetSnapshot.id} (${new Date(targetSnapshot.timestamp).toLocaleString('fa-IR')}) بازگردانده شد.`,
    message_en: `System successfully rolled back to safety checkpoint ${targetSnapshot.id} (${targetSnapshot.timestamp}).`,
  };
}

// ============================================================
// 5. DR Status
// ============================================================

export async function getDisasterRecoveryStatus(): Promise<{
  engine: string;
  isPostgresReady: boolean;
  tablesCount: number;
  recordsCount: Record<string, number>;
  latestSnapshot: {
    id: string;
    timestamp: string;
    reason: string;
    counts: Record<string, number>;
  } | null;
}> {
  const isPg = isPostgresConnected();
  const fullData = await fetchFullDatabaseDataset();
  const snap = getLatestSafetySnapshot();

  const recordsCount = {
    servers: fullData.remote_servers?.length || 0,
    serverCategories: fullData.server_categories?.length || 0,
    devices: fullData.devices?.length || 0,
    devicePlacements: fullData.device_placements?.length || 0,
    deviceGroups: fullData.device_groups?.length || 0,
    customMaps: fullData.custom_maps?.length || 0,
    users: fullData.users?.length || 0,
    userGroups: fullData.user_groups?.length || 0,
    accessPolicies: fullData.access_policies?.length || 0,
    stickyNotes: fullData.device_sticky_notes?.length || 0,
  };

  return {
    engine: isPg ? 'postgresql' : 'fallback_json',
    isPostgresReady: isPg,
    tablesCount: Object.keys(recordsCount).length,
    recordsCount,
    latestSnapshot: snap
      ? {
          id: snap.id,
          timestamp: snap.timestamp,
          reason: snap.reason,
          counts: snap.counts,
        }
      : null,
  };
}
