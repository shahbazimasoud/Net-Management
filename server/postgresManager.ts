import { Client } from 'pg';
import { RemoteServer } from './db';
import { decryptServerSecret } from './vaultCrypto';

export type PostgresConnectionStatus =
  | 'connected'
  | 'connection_failed'
  | 'authentication_failed'
  | 'connection_refused'
  | 'timeout'
  | 'permission_denied'
  | 'database_unavailable'
  | 'unknown_error';

export interface PostgresConnectionTestResult {
  success: boolean;
  status: PostgresConnectionStatus;
  message: string;
  messageFa?: string;
  serverAddress: string;
  port: number;
  username: string;
  database?: string;
  version?: string;
  inRecovery?: boolean;
  latencyMs?: number;
  testedAt: string;
  errorDetail?: string;
}

export interface PostgresEngineOverview {
  serverAddress: string;
  port: number;
  connectedUser: string;
  connectedDatabase: string;
  version: string;
  versionShort: string;
  uptimeSeconds: number;
  uptimePretty: string;
  startTime: string;
  dataDirectory: string;
  walLevel: string;
  inRecovery: boolean;
  clusterRole: 'primary' | 'standby';
  maxConnections: number;
  sharedBuffers: string;
  workMem: string;
  connections: {
    total: number;
    active: number;
    idle: number;
    idleInTransaction: number;
    waiting: number;
    usedPercentage: number;
  };
  telemetry: {
    totalDatabases: number;
    totalCommits: number;
    totalRollbacks: number;
    totalBlocksRead: number;
    totalBlocksHit: number;
    cacheHitRatio: number;
  };
  fetchedAt: string;
}

export interface PostgresDatabaseItem {
  oid: string;
  name: string;
  owner: string;
  encoding: string;
  collation: string;
  ctype: string;
  isTemplate: boolean;
  allowConnections: boolean;
  connectionLimit: number;
  tablespace: string;
  sizeBytes: number | null;
  sizePretty: string;
  activeConnections: number;
}

function formatUptimePretty(seconds: number): string {
  if (seconds <= 0) return '0m';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(' ');
}

function createPostgresClient(
  server: RemoteServer,
  options?: {
    port?: number;
    user?: string;
    database?: string;
    password?: string;
  }
) {
  const targetHost = (server.ip || server.hostname || '').trim();
  const targetPort = Number(options?.port || server.postgres_port) || 5432;
  const targetUser = (options?.user || server.postgres_user || 'postgres').trim();
  const targetDatabase = (options?.database || server.postgres_database || targetUser || 'postgres').trim();

  let plainPassword = '';
  if (options?.password !== undefined && options.password.trim() !== '') {
    plainPassword = options.password.trim();
  } else if (server.postgres_password) {
    plainPassword = decryptServerSecret(server.postgres_password);
  }

  const client = new Client({
    host: targetHost,
    port: targetPort,
    user: targetUser,
    password: plainPassword,
    database: targetDatabase,
    connectionTimeoutMillis: 5000,
    statement_timeout: 7000,
    ssl: false,
  });

  return { client, targetHost, targetPort, targetUser, targetDatabase };
}

/**
 * Safely tests direct TCP/PostgreSQL connection to a remote Linux server host.
 * Uses authentic pg.Client without executing arbitrary remote shell or psql commands.
 * Never leaks raw passwords or credentials in responses or error logs.
 */
export async function testPostgresConnection(
  server: RemoteServer,
  options?: {
    port?: number;
    user?: string;
    database?: string;
    password?: string;
  }
): Promise<PostgresConnectionTestResult> {
  const { client, targetHost, targetPort, targetUser, targetDatabase } = createPostgresClient(server, options);
  const testedAt = new Date().toISOString();

  if (!targetHost) {
    return {
      success: false,
      status: 'connection_failed',
      message: 'Server host or IP address is missing.',
      messageFa: 'آدرس IP یا هاست سرور مشخص نشده است.',
      serverAddress: '',
      port: targetPort,
      username: targetUser,
      database: targetDatabase,
      testedAt,
    };
  }

  const startTime = Date.now();

  try {
    await client.connect();

    // Query core server metadata
    const queryRes = await client.query(`
      SELECT 
        version() as version, 
        current_database() as database, 
        current_user as user,
        pg_is_in_recovery() as in_recovery
    `);

    const latencyMs = Date.now() - startTime;
    const row = queryRes.rows?.[0] || {};

    await client.end();

    return {
      success: true,
      status: 'connected',
      message: `Successfully connected to PostgreSQL on ${targetHost}:${targetPort}`,
      messageFa: `ارتباط با موفقیت با پایگاه داده PostgreSQL در ${targetHost}:${targetPort} برقرار شد`,
      serverAddress: targetHost,
      port: targetPort,
      username: targetUser,
      database: row.database || targetDatabase,
      version: row.version || 'PostgreSQL',
      inRecovery: Boolean(row.in_recovery),
      latencyMs,
      testedAt,
    };
  } catch (err: any) {
    try {
      await client.end();
    } catch {}

    const latencyMs = Date.now() - startTime;
    const code = err.code || '';
    const errMessage = (err.message || '').toLowerCase();

    // 1. Authentication failure
    if (code === '28P01' || errMessage.includes('password authentication failed')) {
      return {
        success: false,
        status: 'authentication_failed',
        message: `Authentication failed for user "${targetUser}". Verify PostgreSQL username and password.`,
        messageFa: `احراز هویت ناموفق بود: رمز عبور یا نام کاربری "${targetUser}" در PostgreSQL اشتباه است.`,
        serverAddress: targetHost,
        port: targetPort,
        username: targetUser,
        database: targetDatabase,
        latencyMs,
        testedAt,
        errorDetail: 'Invalid password or user credentials',
      };
    }

    // 2. Connection refused (service not listening or firewall drop)
    if (code === 'ECONNREFUSED' || errMessage.includes('connection refused')) {
      return {
        success: false,
        status: 'connection_refused',
        message: `Connection refused on ${targetHost}:${targetPort}. PostgreSQL service may be stopped or not listening on this interface.`,
        messageFa: `ارتباط رد شد (${targetHost}:${targetPort}). سرویس PostgreSQL ممکن است متوقف باشد یا پورت برای اتصالات ریموت باز نباشد.`,
        serverAddress: targetHost,
        port: targetPort,
        username: targetUser,
        database: targetDatabase,
        latencyMs,
        testedAt,
        errorDetail: 'Connection refused by remote host (ECONNREFUSED)',
      };
    }

    // 3. Timeout
    if (code === 'ETIMEDOUT' || errMessage.includes('timeout') || latencyMs >= 5000) {
      return {
        success: false,
        status: 'timeout',
        message: `Connection timed out connecting to ${targetHost}:${targetPort}. Verify host firewall and security groups.`,
        messageFa: `مهلت زمان ارتباط با ${targetHost}:${targetPort} پایان یافت (Timeout). فایروال سرور و دسترسی به پورت ۵۴۳۲ را بررسی کنید.`,
        serverAddress: targetHost,
        port: targetPort,
        username: targetUser,
        database: targetDatabase,
        latencyMs,
        testedAt,
        errorDetail: 'Connection timeout after 5000ms',
      };
    }

    // 4. Database does not exist
    if (code === '3D000' || (errMessage.includes('database') && errMessage.includes('does not exist'))) {
      return {
        success: false,
        status: 'database_unavailable',
        message: `Database "${targetDatabase}" does not exist on remote PostgreSQL server.`,
        messageFa: `پایگاه داده "${targetDatabase}" روی سرور PostgreSQL مقصد یافت نشد.`,
        serverAddress: targetHost,
        port: targetPort,
        username: targetUser,
        database: targetDatabase,
        latencyMs,
        testedAt,
        errorDetail: `Database "${targetDatabase}" does not exist`,
      };
    }

    // 5. Permission denied
    if (code === '28000' || code === '42501' || errMessage.includes('permission denied')) {
      return {
        success: false,
        status: 'permission_denied',
        message: `Permission denied for user "${targetUser}" accessing database "${targetDatabase}".`,
        messageFa: `دسترسی مجاز نیست: کاربر "${targetUser}" اجازه دسترسی به دیتابیس "${targetDatabase}" را ندارد.`,
        serverAddress: targetHost,
        port: targetPort,
        username: targetUser,
        database: targetDatabase,
        latencyMs,
        testedAt,
        errorDetail: 'Permission denied (28000 / 42501)',
      };
    }

    // 6. Generic failure with sanitized message
    return {
      success: false,
      status: 'connection_failed',
      message: `Failed to connect to PostgreSQL: ${err.message || 'Network error'}`,
      messageFa: `خطا در اتصال به پایگاه داده: ${err.message || 'خطای شبکه'}`,
      serverAddress: targetHost,
      port: targetPort,
      username: targetUser,
      database: targetDatabase,
      latencyMs,
      testedAt,
      errorDetail: err.message,
    };
  }
}

/**
 * Phase 2: Discovers live PostgreSQL engine overview, uptime, settings,
 * connection pool load, and cache hit performance metrics.
 */
export async function getPostgresOverview(
  server: RemoteServer,
  options?: {
    port?: number;
    user?: string;
    database?: string;
    password?: string;
  }
): Promise<{ success: boolean; data?: PostgresEngineOverview; error?: string; errorFa?: string }> {
  const { client, targetHost, targetPort, targetUser, targetDatabase } = createPostgresClient(server, options);

  if (!targetHost) {
    return {
      success: false,
      error: 'Server host or IP address is missing.',
      errorFa: 'آدرس هاست یا IP سرور مشخص نشده است.',
    };
  }

  try {
    await client.connect();

    // 1. Basic server information and role
    const basicRes = await client.query(`
      SELECT 
        version() as version, 
        current_setting('server_version') as server_version,
        pg_is_in_recovery() as in_recovery,
        current_database() as database,
        current_user as user
    `);
    const basicRow = basicRes.rows?.[0] || {};

    // 2. Critical cluster configurations & directories
    const settingsRes = await client.query(`
      SELECT 
        current_setting('data_directory') as data_directory,
        current_setting('wal_level') as wal_level,
        current_setting('max_connections')::integer as max_connections,
        current_setting('shared_buffers') as shared_buffers,
        current_setting('work_mem') as work_mem
    `);
    const settingsRow = settingsRes.rows?.[0] || {};

    // 3. Engine uptime and postmaster start time
    const uptimeRes = await client.query(`
      SELECT 
        pg_postmaster_start_time() as start_time,
        COALESCE(extract(epoch from (now() - pg_postmaster_start_time()))::integer, 0) as uptime_seconds
    `);
    const uptimeRow = uptimeRes.rows?.[0] || {};

    // 4. Connection pool state and activities
    const activityRes = await client.query(`
      SELECT 
        count(*)::integer as total,
        count(CASE WHEN state = 'active' THEN 1 END)::integer as active,
        count(CASE WHEN state = 'idle' THEN 1 END)::integer as idle,
        count(CASE WHEN state = 'idle in transaction' THEN 1 END)::integer as idle_in_transaction,
        count(CASE WHEN wait_event_type IS NOT NULL AND state = 'active' THEN 1 END)::integer as waiting
      FROM pg_stat_activity
    `);
    const activityRow = activityRes.rows?.[0] || {};

    // 5. Cluster telemetry (commits, rollbacks, cache hit ratio)
    const telemetryRes = await client.query(`
      SELECT 
        COALESCE(sum(xact_commit), 0)::bigint as total_commits,
        COALESCE(sum(xact_rollback), 0)::bigint as total_rollbacks,
        COALESCE(sum(blks_read), 0)::bigint as total_blocks_read,
        COALESCE(sum(blks_hit), 0)::bigint as total_blocks_hit,
        round(
          CASE 
            WHEN (COALESCE(sum(blks_hit), 0) + COALESCE(sum(blks_read), 0)) = 0 THEN 100.0
            ELSE (sum(blks_hit)::numeric / (sum(blks_hit) + sum(blks_read)) * 100.0)
          END, 2
        )::float as cache_hit_ratio
      FROM pg_stat_database
    `);
    const telemetryRow = telemetryRes.rows?.[0] || {};

    // 6. Non-template database count
    const dbCountRes = await client.query(`
      SELECT count(*)::integer as total_databases FROM pg_database WHERE datistemplate = false
    `);
    const totalDatabases = Number(dbCountRes.rows?.[0]?.total_databases) || 0;

    await client.end();

    const maxConn = Number(settingsRow.max_connections) || 100;
    const totalConn = Number(activityRow.total) || 0;
    const usedPercentage = maxConn > 0 ? Number(((totalConn / maxConn) * 100).toFixed(1)) : 0;
    const inRecovery = Boolean(basicRow.in_recovery);
    const uptimeSeconds = Number(uptimeRow.uptime_seconds) || 0;

    const overview: PostgresEngineOverview = {
      serverAddress: targetHost,
      port: targetPort,
      connectedUser: basicRow.user || targetUser,
      connectedDatabase: basicRow.database || targetDatabase,
      version: basicRow.version || 'PostgreSQL',
      versionShort: basicRow.server_version || 'PostgreSQL',
      uptimeSeconds,
      uptimePretty: formatUptimePretty(uptimeSeconds),
      startTime: uptimeRow.start_time ? new Date(uptimeRow.start_time).toISOString() : new Date().toISOString(),
      dataDirectory: settingsRow.data_directory || '/var/lib/postgresql',
      walLevel: settingsRow.wal_level || 'replica',
      inRecovery,
      clusterRole: inRecovery ? 'standby' : 'primary',
      maxConnections: maxConn,
      sharedBuffers: settingsRow.shared_buffers || '128MB',
      workMem: settingsRow.work_mem || '4MB',
      connections: {
        total: totalConn,
        active: Number(activityRow.active) || 0,
        idle: Number(activityRow.idle) || 0,
        idleInTransaction: Number(activityRow.idle_in_transaction) || 0,
        waiting: Number(activityRow.waiting) || 0,
        usedPercentage,
      },
      telemetry: {
        totalDatabases,
        totalCommits: Number(telemetryRow.total_commits) || 0,
        totalRollbacks: Number(telemetryRow.total_rollbacks) || 0,
        totalBlocksRead: Number(telemetryRow.total_blocks_read) || 0,
        totalBlocksHit: Number(telemetryRow.total_blocks_hit) || 0,
        cacheHitRatio: Number(telemetryRow.cache_hit_ratio) || 100,
      },
      fetchedAt: new Date().toISOString(),
    };

    return { success: true, data: overview };
  } catch (err: any) {
    try {
      await client.end();
    } catch {}

    return {
      success: false,
      error: err.message || 'Failed to retrieve PostgreSQL engine telemetry',
      errorFa: `خطا در دریافت تله‌متری موتور PostgreSQL: ${err.message || 'خطای شبکه'}`,
    };
  }
}

/**
 * Phase 2: Enumerates the database catalog from pg_catalog.pg_database,
 * calculating accurate disk sizes, collations, and active connection distribution.
 */
export async function getPostgresDatabases(
  server: RemoteServer,
  options?: {
    port?: number;
    user?: string;
    database?: string;
    password?: string;
    includeTemplates?: boolean;
  }
): Promise<{ success: boolean; databases?: PostgresDatabaseItem[]; error?: string; errorFa?: string }> {
  const { client, targetHost } = createPostgresClient(server, options);

  if (!targetHost) {
    return {
      success: false,
      error: 'Server host or IP address is missing.',
      errorFa: 'آدرس هاست یا IP سرور مشخص نشده است.',
    };
  }

  const includeTemplates = Boolean(options?.includeTemplates);

  try {
    await client.connect();

    const query = `
      SELECT 
        d.oid::text as oid,
        d.datname as name,
        pg_catalog.pg_get_userbyid(d.datdba) as owner,
        pg_catalog.pg_encoding_to_char(d.encoding) as encoding,
        d.datcollate as collation,
        d.datctype as ctype,
        d.datistemplate as is_template,
        d.datallowconn as allow_connections,
        d.datconnlimit as connection_limit,
        COALESCE(t.spcname, 'pg_default') as tablespace,
        CASE 
          WHEN has_database_privilege(d.datname, 'CONNECT') THEN pg_catalog.pg_database_size(d.datname)
          ELSE NULL
        END::bigint as size_bytes,
        CASE 
          WHEN has_database_privilege(d.datname, 'CONNECT') THEN pg_catalog.pg_size_pretty(pg_catalog.pg_database_size(d.datname))
          ELSE 'N/A'
        END as size_pretty,
        COALESCE(act.active_connections, 0)::integer as active_connections
      FROM pg_catalog.pg_database d
      LEFT JOIN pg_catalog.pg_tablespace t ON d.dattablespace = t.oid
      LEFT JOIN (
        SELECT datname, count(*)::integer as active_connections 
        FROM pg_stat_activity 
        GROUP BY datname
      ) act ON d.datname = act.datname
      WHERE ($1::boolean = true OR d.datistemplate = false)
      ORDER BY d.datname ASC;
    `;

    const res = await client.query(query, [includeTemplates]);
    await client.end();

    const databases: PostgresDatabaseItem[] = (res.rows || []).map((row: any) => ({
      oid: String(row.oid),
      name: String(row.name),
      owner: String(row.owner || 'postgres'),
      encoding: String(row.encoding || 'UTF8'),
      collation: String(row.collation || ''),
      ctype: String(row.ctype || ''),
      isTemplate: Boolean(row.is_template),
      allowConnections: Boolean(row.allow_connections),
      connectionLimit: Number(row.connection_limit),
      tablespace: String(row.tablespace || 'pg_default'),
      sizeBytes: row.size_bytes !== null && row.size_bytes !== undefined ? Number(row.size_bytes) : null,
      sizePretty: String(row.size_pretty || '0 bytes'),
      activeConnections: Number(row.active_connections) || 0,
    }));

    return { success: true, databases };
  } catch (err: any) {
    try {
      await client.end();
    } catch {}

    return {
      success: false,
      error: err.message || 'Failed to enumerate database catalog',
      errorFa: `خطا در دریافت فهرست پایگاه‌های داده: ${err.message || 'خطای شبکه'}`,
    };
  }
}

