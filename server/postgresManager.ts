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
  const targetHost = (server.ip || server.hostname || '').trim();
  const targetPort = Number(options?.port || server.postgres_port) || 5432;
  const targetUser = (options?.user || server.postgres_user || 'postgres').trim();
  const targetDatabase = (options?.database || server.postgres_database || targetUser || 'postgres').trim();

  // Decrypt password server-side only
  let plainPassword = '';
  if (options?.password !== undefined && options.password.trim() !== '') {
    plainPassword = options.password.trim();
  } else if (server.postgres_password) {
    plainPassword = decryptServerSecret(server.postgres_password);
  }

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

  const client = new Client({
    host: targetHost,
    port: targetPort,
    user: targetUser,
    password: plainPassword,
    database: targetDatabase,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
    ssl: false,
  });

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
    if (code === '3D000' || errMessage.includes('database') && errMessage.includes('does not exist')) {
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
