import { Client, ConnectConfig, SFTPWrapper } from 'ssh2';
import { Response } from 'express';
import { ZipArchive } from 'archiver';
import { RemoteServer } from '../src/types';

export interface LinuxFsItem {
  name: string;
  path: string;
  type: 'directory' | 'file' | 'symlink' | 'other';
  size: number;
  sizeHuman: string;
  permissions: string;
  octalPermissions: string;
  owner: number | string;
  group: number | string;
  modifiedTime: string;
  extension: string;
  target?: string;
}

export interface LinuxFsListResult {
  currentPath: string;
  parentPath: string | null;
  items: LinuxFsItem[];
  totalFiles: number;
  totalDirectories: number;
  totalSize: number;
  totalSizeHuman: string;
  freeSpaceHuman?: string;
  totalSpaceHuman?: string;
  usedPercent?: number;
}

export interface LinuxQuickDir {
  path: string;
  name: string;
  name_fa: string;
  description: string;
  description_fa: string;
  icon: string;
  isImportant?: boolean;
}

export const LINUX_QUICK_DIRECTORIES: LinuxQuickDir[] = [
  {
    path: '/',
    name: 'Root (/)' ,
    name_fa: 'ریشه (/)',
    description: 'System root filesystem hierarchy',
    description_fa: 'دایرکتوری اصلی و پایه سیستم‌عامل',
    icon: 'hard-drive',
    isImportant: true,
  },
  {
    path: '/root',
    name: 'Root Home',
    name_fa: 'پوشه ریشه (Root Home)',
    description: 'Superuser administrative home folder',
    description_fa: 'پوشه خانگی اختصاصی کاربر مدیر سیستم',
    icon: 'shield',
    isImportant: true,
  },
  {
    path: '/home',
    name: 'User Homes (/home)',
    name_fa: 'پوشه کاربران (/home)',
    description: 'Standard interactive user workspaces',
    description_fa: 'دایرکتوری فضای کاری و پروفایل‌های کاربران عادی',
    icon: 'users',
    isImportant: true,
  },
  {
    path: '/etc',
    name: 'Configuration (/etc)',
    name_fa: 'تنظیمات (/etc)',
    description: 'System-wide configuration files and daemon services',
    description_fa: 'فایل‌های پیکربندی سیستم، وب‌سرورها، فایروال و سرویس‌ها',
    icon: 'settings',
    isImportant: true,
  },
  {
    path: '/var/log',
    name: 'System Logs (/var/log)',
    name_fa: 'لاگ‌های سیستم (/var/log)',
    description: 'System, kernel, auth, web server and daemon diagnostic logs',
    description_fa: 'لاگ‌های رویدادها، خطای هسته، امنیت، احراز هویت و سرویس‌ها',
    icon: 'file-text',
    isImportant: true,
  },
  {
    path: '/var',
    name: 'Variable Data (/var)',
    name_fa: 'داده‌های متغیر (/var)',
    description: 'Variable application state, mail, caches and databases',
    description_fa: 'پایگاه‌های داده، کش‌ها، اسپول‌ها و داده‌های متغیر برنامه‌ها',
    icon: 'database',
  },
  {
    path: '/opt',
    name: 'Optional Packages (/opt)',
    name_fa: 'برنامه‌های الحاقی (/opt)',
    description: 'Third-party add-on software and self-contained suites',
    description_fa: 'نرم‌افزارهای تجاری و الحاقی نصب‌شده جانبی',
    icon: 'package',
  },
  {
    path: '/usr',
    name: 'User Programs (/usr)',
    name_fa: 'برنامه‌های سیستمی (/usr)',
    description: 'System utilities, libraries, shared documentation and bin',
    description_fa: 'کتابخانه‌ها، ابزارهای اجرایی مشترک و مستندات سیستمی',
    icon: 'layers',
  },
  {
    path: '/tmp',
    name: 'Temporary (/tmp)',
    name_fa: 'فایل‌های موقت (/tmp)',
    description: 'Temporary volatile scratch storage for running processes',
    description_fa: 'حافظه موقت فایل‌های در گردش فرایندهای در حال اجرا',
    icon: 'trash',
  },
  {
    path: '/mnt',
    name: 'Mount Points (/mnt)',
    name_fa: 'نقاط اتصال (/mnt)',
    description: 'Mount targets for temporarily attached filesystems and disks',
    description_fa: 'محل اتصال موقت دیسک‌ها، پارتیشن‌ها و فایل‌سیستم‌های الحاقی',
    icon: 'folder-symlink',
  },
  {
    path: '/media',
    name: 'Removable Media (/media)',
    name_fa: 'رسانه‌ها (/media)',
    description: 'Removable media mounts (USB drives, CD-ROMs, flash)',
    description_fa: 'محل مانت دیسک‌های قابل حمل و رسانه‌های جداشدنی',
    icon: 'disc',
  },
  {
    path: '/srv',
    name: 'Service Data (/srv)',
    name_fa: 'داده‌های سرویس (/srv)',
    description: 'Site-specific operational data served by this system',
    description_fa: 'داده‌های اختصاصی سرویس‌های وب یا سرور فایل',
    icon: 'server',
  },
];

export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const safeI = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, safeI)).toFixed(dm))} ${sizes[safeI]}`;
}

export function parseOctalPermissions(mode: number): { octal: string; stringFormat: string } {
  const isDir = (mode & 0o040000) === 0o040000;
  const isSymlink = (mode & 0o120000) === 0o120000;

  const typeChar = isDir ? 'd' : isSymlink ? 'l' : '-';

  const userR = mode & 0o400 ? 'r' : '-';
  const userW = mode & 0o200 ? 'w' : '-';
  const userX = mode & 0o100 ? (mode & 0o4000 ? 's' : 'x') : mode & 0o4000 ? 'S' : '-';

  const groupR = mode & 0o040 ? 'r' : '-';
  const groupW = mode & 0o020 ? 'w' : '-';
  const groupX = mode & 0o010 ? (mode & 0o2000 ? 's' : 'x') : mode & 0o2000 ? 'S' : '-';

  const otherR = mode & 0o004 ? 'r' : '-';
  const otherW = mode & 0o002 ? 'w' : '-';
  const otherX = mode & 0o001 ? (mode & 0o1000 ? 't' : 'x') : mode & 0o1000 ? 'T' : '-';

  const octal = (mode & 0o777).toString(8).padStart(3, '0');
  const stringFormat = `${typeChar}${userR}${userW}${userX}${groupR}${groupW}${groupX}${otherR}${otherW}${otherX}`;

  return { octal, stringFormat };
}

export function getFileExtension(filename: string): string {
  if (filename.startsWith('.') && filename.indexOf('.', 1) === -1) {
    return filename.slice(1).toLowerCase();
  }
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1 || lastDot === 0) return '';
  return filename.slice(lastDot + 1).toLowerCase();
}

/**
 * Creates an authenticated SSH Client instance with automatic legacy cipher negotiation fallback (Rule 12 compliant).
 */
export async function getAdaptiveSshClient(
  server: RemoteServer,
  ephemeralPassword?: string,
  timeoutMs: number = 10000
): Promise<Client> {
  const host = (server.ip || server.hostname || '').trim();
  const port = server.ssh_port || 22;
  const username = server.ssh_username || 'root';
  const password = ephemeralPassword || server.ssh_password || '';

  if (!host) {
    throw new Error('Server IP or hostname is required for SSH connection.');
  }

  const connectAttempt = (useLegacyAlgorithms: boolean): Promise<Client> => {
    return new Promise((resolve, reject) => {
      const client = new Client();
      let timer: NodeJS.Timeout | null = null;
      let settled = false;

      const finish = (err?: Error, cl?: Client) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (err) {
          try {
            client.end();
          } catch {}
          reject(err);
        } else if (cl) {
          resolve(cl);
        }
      };

      timer = setTimeout(() => {
        finish(new Error(`SSH connection to ${host}:${port} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      client.on('error', (err) => {
        finish(err);
      });

      client.on('ready', () => {
        finish(undefined, client);
      });

      const config: ConnectConfig = {
        host,
        port,
        username,
        readyTimeout: Math.min(timeoutMs, 10000),
      };

      if (password) {
        config.password = password;
      }

      if (useLegacyAlgorithms) {
        config.algorithms = {
          kex: [
            'diffie-hellman-group1-sha1',
            'diffie-hellman-group14-sha1',
            'diffie-hellman-group-exchange-sha1',
            'diffie-hellman-group-exchange-sha256',
            'ecdh-sha2-nistp256',
            'ecdh-sha2-nistp384',
            'ecdh-sha2-nistp521',
          ],
          cipher: [
            'aes128-ctr',
            'aes192-ctr',
            'aes256-ctr',
            'aes128-gcm@openssh.com',
            'aes256-gcm@openssh.com',
            'aes128-cbc',
            '3des-cbc',
            'aes192-cbc',
            'aes256-cbc',
          ],
          serverHostKey: [
            'ssh-rsa',
            'rsa-sha2-512',
            'rsa-sha2-256',
            'ecdsa-sha2-nistp256',
            'ssh-ed25519',
          ],
        };
      }

      try {
        client.connect(config);
      } catch (err: any) {
        finish(err);
      }
    });
  };

  try {
    return await connectAttempt(false);
  } catch (err: any) {
    const msg = (err?.message || '').toLowerCase();
    if (
      msg.includes('algorithm') ||
      msg.includes('handshake') ||
      msg.includes('key exchange') ||
      msg.includes('cipher') ||
      msg.includes('no matching') ||
      msg.includes('negotiat')
    ) {
      return await connectAttempt(true);
    }
    throw err;
  }
}

/**
 * List files and directories using SFTP with an automatic SSH CLI fallback if SFTP subsystem is restricted.
 */
export async function listLinuxDirectory(
  server: RemoteServer,
  targetPath: string = '/',
  ephemeralPassword?: string
): Promise<LinuxFsListResult> {
  const normalizedPath = targetPath.trim() === '' ? '/' : targetPath.trim();
  const cleanPath = normalizedPath.replace(/\/+/g, '/');

  const client = await getAdaptiveSshClient(server, ephemeralPassword);

  try {
    // Attempt via SFTP first
    const sftpResult = await new Promise<LinuxFsListResult | null>((resolve) => {
      client.sftp((err, sftp) => {
        if (err || !sftp) {
          return resolve(null);
        }

        sftp.readdir(cleanPath, (readErr, list) => {
          if (readErr || !list) {
            return resolve(null);
          }

          const items: LinuxFsItem[] = [];
          let totalFiles = 0;
          let totalDirectories = 0;
          let totalSize = 0;

          for (const entry of list) {
            const name = entry.filename;
            if (name === '.' || name === '..') continue;

            const fullPath = cleanPath === '/' ? `/${name}` : `${cleanPath}/${name}`;
            const attrs = entry.attrs;
            const mode = attrs.mode || 0;
            const isDir = (mode & 0o040000) === 0o040000;
            const isSymlink = (mode & 0o120000) === 0o120000;
            const size = attrs.size || 0;

            const type = isDir ? 'directory' : isSymlink ? 'symlink' : 'file';
            if (isDir) totalDirectories++;
            else totalFiles++;
            totalSize += size;

            const { octal, stringFormat } = parseOctalPermissions(mode);
            const mtime = attrs.mtime ? new Date(attrs.mtime * 1000).toISOString() : new Date().toISOString();

            items.push({
              name,
              path: fullPath,
              type,
              size,
              sizeHuman: formatBytes(size),
              permissions: stringFormat,
              octalPermissions: octal,
              owner: attrs.uid ?? 0,
              group: attrs.gid ?? 0,
              modifiedTime: mtime,
              extension: isDir ? '' : getFileExtension(name),
            });
          }

          // Sort directories first, then alphabetically
          items.sort((a, b) => {
            if (a.type === 'directory' && b.type !== 'directory') return -1;
            if (a.type !== 'directory' && b.type === 'directory') return 1;
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
          });

          const parentPath = cleanPath === '/' ? null : cleanPath.substring(0, cleanPath.lastIndexOf('/')) || '/';

          resolve({
            currentPath: cleanPath,
            parentPath,
            items,
            totalFiles,
            totalDirectories,
            totalSize,
            totalSizeHuman: formatBytes(totalSize),
          });
        });
      });
    });

    if (sftpResult) {
      // Complement with disk usage info if available
      try {
        const dfOutput = await executeExecCommand(client, `df -k "${cleanPath}" | tail -n 1`);
        const parts = dfOutput.trim().split(/\s+/);
        if (parts.length >= 6) {
          const totalK = parseInt(parts[1], 10) * 1024;
          const usedK = parseInt(parts[2], 10) * 1024;
          const availK = parseInt(parts[3], 10) * 1024;
          const percent = parseInt(parts[4].replace('%', ''), 10);
          sftpResult.totalSpaceHuman = formatBytes(totalK);
          sftpResult.freeSpaceHuman = formatBytes(availK);
          sftpResult.usedPercent = isNaN(percent) ? undefined : percent;
        }
      } catch {}

      return sftpResult;
    }

    // Fallback via CLI python/stat/find
    return await listDirectoryViaCliFallback(client, cleanPath);
  } finally {
    try {
      client.end();
    } catch {}
  }
}

function executeExecCommand(client: Client, cmd: string, timeoutMs: number = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    let timer: NodeJS.Timeout | null = null;
    let settled = false;

    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`Command '${cmd}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    client.exec(cmd, (err, stream) => {
      if (err) {
        if (timer) clearTimeout(timer);
        return reject(err);
      }

      let stdout = '';
      let stderr = '';

      stream.on('data', (d: Buffer) => {
        stdout += d.toString('utf-8');
      });
      stream.stderr.on('data', (d: Buffer) => {
        stderr += d.toString('utf-8');
      });
      stream.on('close', (code: number) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (code !== 0 && !stdout.trim()) {
          reject(new Error(`Command failed with code ${code}: ${stderr.trim()}`));
        } else {
          resolve(stdout);
        }
      });
    });
  });
}

async function listDirectoryViaCliFallback(client: Client, cleanPath: string): Promise<LinuxFsListResult> {
  // Python 3 or bash ls fallback
  const pyScript = `
import os, sys, json, stat

p = sys.argv[1]
try:
    entries = os.listdir(p)
except Exception as e:
    sys.exit(str(e))

items = []
total_files = 0
total_dirs = 0
total_size = 0

for name in entries:
    fp = os.path.join(p, name)
    try:
        st = os.lstat(fp)
        mode = st.st_mode
        is_dir = stat.S_ISDIR(mode)
        is_symlink = stat.S_ISLNK(mode)
        size = st.st_size
        
        t = "directory" if is_dir else ("symlink" if is_symlink else "file")
        if is_dir:
            total_dirs += 1
        else:
            total_files += 1
        total_size += size
        
        target = os.readlink(fp) if is_symlink else None
        
        items.append({
            "name": name,
            "path": fp,
            "type": t,
            "size": size,
            "mode": mode,
            "uid": st.st_uid,
            "gid": st.st_gid,
            "mtime": st.st_mtime,
            "target": target
        })
    except Exception:
        continue

print(json.dumps({
    "currentPath": p,
    "items": items,
    "totalFiles": total_files,
    "totalDirectories": total_dirs,
    "totalSize": total_size
}))
`.trim();

  try {
    const rawJson = await executeExecCommand(client, `python3 -c '${pyScript}' "${cleanPath}" 2>/dev/null || python -c '${pyScript}' "${cleanPath}"`);
    const parsed = JSON.parse(rawJson.trim());

    const items: LinuxFsItem[] = (parsed.items || []).map((entry: any) => {
      const mode = entry.mode || 0;
      const { octal, stringFormat } = parseOctalPermissions(mode);
      const isDir = entry.type === 'directory';

      return {
        name: entry.name,
        path: entry.path,
        type: entry.type,
        size: entry.size || 0,
        sizeHuman: formatBytes(entry.size || 0),
        permissions: stringFormat,
        octalPermissions: octal,
        owner: entry.uid,
        group: entry.gid,
        modifiedTime: entry.mtime ? new Date(entry.mtime * 1000).toISOString() : new Date().toISOString(),
        extension: isDir ? '' : getFileExtension(entry.name),
        target: entry.target,
      };
    });

    items.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    const parentPath = cleanPath === '/' ? null : cleanPath.substring(0, cleanPath.lastIndexOf('/')) || '/';

    return {
      currentPath: cleanPath,
      parentPath,
      items,
      totalFiles: parsed.totalFiles || 0,
      totalDirectories: parsed.totalDirectories || 0,
      totalSize: parsed.totalSize || 0,
      totalSizeHuman: formatBytes(parsed.totalSize || 0),
    };
  } catch (err: any) {
    throw new Error(`Failed to list directory contents of ${cleanPath}: ${err.message}`);
  }
}

/**
 * Read text or config file content with max length protection.
 */
export async function readLinuxFile(
  server: RemoteServer,
  filePath: string,
  ephemeralPassword?: string,
  maxBytes: number = 2 * 1024 * 1024 // 2MB
): Promise<{ content: string; size: number; isTruncated: boolean; path: string }> {
  const cleanPath = filePath.trim();
  const client = await getAdaptiveSshClient(server, ephemeralPassword);

  try {
    return await new Promise((resolve, reject) => {
      client.sftp((err, sftp) => {
        if (err || !sftp) {
          // Fallback to cat / head
          return executeExecCommand(client, `head -c ${maxBytes + 1} "${cleanPath}"`)
            .then((output) => {
              const buf = Buffer.from(output, 'utf-8');
              const isTruncated = buf.length > maxBytes;
              const content = isTruncated ? buf.subarray(0, maxBytes).toString('utf-8') : output;
              resolve({
                content,
                size: buf.length,
                isTruncated,
                path: cleanPath,
              });
            })
            .catch(reject);
        }

        sftp.stat(cleanPath, (statErr, stats) => {
          if (statErr) {
            return reject(new Error(`File not found or cannot stat: ${cleanPath}`));
          }

          const size = stats.size || 0;
          const readSize = Math.min(size, maxBytes);
          const isTruncated = size > maxBytes;

          sftp.open(cleanPath, 'r', (openErr, handle) => {
            if (openErr) {
              return reject(openErr);
            }

            const buffer = Buffer.alloc(readSize);
            sftp.read(handle, buffer, 0, readSize, 0, (readErr, bytesRead) => {
              sftp.close(handle, () => {});
              if (readErr) {
                return reject(readErr);
              }

              const content = buffer.subarray(0, bytesRead).toString('utf-8');
              resolve({
                content,
                size,
                isTruncated,
                path: cleanPath,
              });
            });
          });
        });
      });
    });
  } finally {
    try {
      client.end();
    } catch {}
  }
}

/**
 * Save / write text file content to remote server.
 */
export async function writeLinuxFile(
  server: RemoteServer,
  filePath: string,
  content: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; bytesWritten: number; path: string }> {
  const cleanPath = filePath.trim();
  const client = await getAdaptiveSshClient(server, ephemeralPassword);

  try {
    const buffer = Buffer.from(content, 'utf-8');

    return await new Promise((resolve, reject) => {
      client.sftp((err, sftp) => {
        if (err || !sftp) {
          // Fallback via base64 pipe
          const b64 = buffer.toString('base64');
          return executeExecCommand(client, `echo "${b64}" | base64 -d > "${cleanPath}"`)
            .then(() => {
              resolve({
                success: true,
                bytesWritten: buffer.length,
                path: cleanPath,
              });
            })
            .catch(reject);
        }

        sftp.open(cleanPath, 'w', (openErr, handle) => {
          if (openErr) {
            return reject(openErr);
          }

          sftp.write(handle, buffer, 0, buffer.length, 0, (writeErr) => {
            sftp.close(handle, () => {});
            if (writeErr) {
              return reject(writeErr);
            }

            resolve({
              success: true,
              bytesWritten: buffer.length,
              path: cleanPath,
            });
          });
        });
      });
    });
  } finally {
    try {
      client.end();
    } catch {}
  }
}

/**
 * Create directory on remote server.
 */
export async function createLinuxDirectory(
  server: RemoteServer,
  dirPath: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; path: string }> {
  const cleanPath = dirPath.trim();
  const client = await getAdaptiveSshClient(server, ephemeralPassword);

  try {
    await executeExecCommand(client, `mkdir -p "${cleanPath}"`);
    return { success: true, path: cleanPath };
  } finally {
    try {
      client.end();
    } catch {}
  }
}

/**
 * Touch / create empty file on remote server.
 */
export async function createLinuxEmptyFile(
  server: RemoteServer,
  filePath: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; path: string }> {
  const cleanPath = filePath.trim();
  const client = await getAdaptiveSshClient(server, ephemeralPassword);

  try {
    await executeExecCommand(client, `touch "${cleanPath}"`);
    return { success: true, path: cleanPath };
  } finally {
    try {
      client.end();
    } catch {}
  }
}

/**
 * Rename or move a file / directory on remote server.
 */
export async function renameLinuxItem(
  server: RemoteServer,
  oldPath: string,
  newPath: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; oldPath: string; newPath: string }> {
  const src = oldPath.trim();
  const dst = newPath.trim();
  const client = await getAdaptiveSshClient(server, ephemeralPassword);

  try {
    await executeExecCommand(client, `mv "${src}" "${dst}"`);
    return { success: true, oldPath: src, newPath: dst };
  } finally {
    try {
      client.end();
    } catch {}
  }
}

/**
 * Delete a file or directory on remote server.
 */
export async function deleteLinuxItem(
  server: RemoteServer,
  targetPath: string,
  isRecursive: boolean = false,
  ephemeralPassword?: string
): Promise<{ success: boolean; path: string }> {
  const cleanPath = targetPath.trim();
  if (cleanPath === '/' || cleanPath === '/root' || cleanPath === '/home' || cleanPath === '/etc') {
    throw new Error('Deletion of critical root directories is strictly prohibited.');
  }

  const client = await getAdaptiveSshClient(server, ephemeralPassword);

  try {
    const cmd = isRecursive ? `rm -rf "${cleanPath}"` : `rm -f "${cleanPath}"`;
    await executeExecCommand(client, cmd);
    return { success: true, path: cleanPath };
  } finally {
    try {
      client.end();
    } catch {}
  }
}

/**
 * Stream a single remote file directly to the HTTP response.
 */
export async function downloadLinuxSingleFile(
  server: RemoteServer,
  filePath: string,
  res: Response,
  ephemeralPassword?: string
): Promise<void> {
  const cleanPath = filePath.trim();
  const filename = cleanPath.split('/').filter(Boolean).pop() || 'downloaded-file';
  const client = await getAdaptiveSshClient(server, ephemeralPassword);

  return new Promise((resolve, reject) => {
    client.sftp((err, sftp) => {
      if (err || !sftp) {
        // Fallback to cat stream
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

        client.exec(`cat "${cleanPath}"`, (execErr, stream) => {
          if (execErr) {
            try { client.end(); } catch {}
            if (!res.headersSent) {
              res.status(500).json({ success: false, error: execErr.message });
            }
            return reject(execErr);
          }

          stream.pipe(res);
          stream.on('close', () => {
            try { client.end(); } catch {}
            resolve();
          });
          stream.stderr?.on('data', (data) => {
            console.warn(`[cat download stderr]: ${data}`);
          });
        });
        return;
      }

      sftp.stat(cleanPath, (statErr, stats) => {
        if (statErr) {
          try { client.end(); } catch {}
          if (!res.headersSent) {
            res.status(404).json({ success: false, error: `File not found: ${cleanPath}` });
          }
          return reject(statErr);
        }

        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        if (stats.size) {
          res.setHeader('Content-Length', stats.size.toString());
        }

        const readStream = sftp.createReadStream(cleanPath);
        readStream.pipe(res);

        readStream.on('close', () => {
          try { client.end(); } catch {}
          resolve();
        });

        readStream.on('error', (streamErr) => {
          try { client.end(); } catch {}
          if (!res.headersSent) {
            res.status(500).json({ success: false, error: streamErr.message });
          }
          reject(streamErr);
        });
      });
    });
  });
}

/**
 * Stream multiple files and/or directories as a compressed ZIP archive.
 */
export async function downloadLinuxArchive(
  server: RemoteServer,
  paths: string[],
  archiveName: string,
  res: Response,
  ephemeralPassword?: string
): Promise<void> {
  const cleanPaths = paths.map((p) => p.trim()).filter(Boolean);
  if (cleanPaths.length === 0) {
    throw new Error('At least one path is required for archive creation.');
  }

  const client = await getAdaptiveSshClient(server, ephemeralPassword);
  const zip = new ZipArchive({ zlib: { level: 6 } });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(archiveName || 'archive.zip')}"`);

  zip.pipe(res);

  return new Promise((resolve, reject) => {
    client.sftp(async (err, sftp) => {
      if (err || !sftp) {
        // Fallback: use Python on remote server to create stream
        const escapedPaths = cleanPaths.map((p) => `"${p}"`).join(' ');
        const pyScript = `import sys, zipfile, os; zf = zipfile.ZipFile(sys.stdout.buffer, 'w', zipfile.ZIP_DEFLATED);
for arg in sys.argv[1:]:
    p = os.path.abspath(arg)
    if os.path.isfile(p):
        zf.write(p, arcname=os.path.basename(p))
    elif os.path.isdir(p):
        parent = os.path.dirname(p)
        for root, dirs, files in os.walk(p):
            for f in files:
                fp = os.path.join(root, f)
                zf.write(fp, arcname=os.path.relpath(fp, parent))
zf.close()`;

        client.exec(`python3 -c '${pyScript}' ${escapedPaths} 2>/dev/null`, (pyErr, stream) => {
          if (pyErr) {
            try { client.end(); } catch {}
            return reject(pyErr);
          }
          stream.pipe(res);
          stream.on('close', () => {
            try { client.end(); } catch {}
            resolve();
          });
        });
        return;
      }

      // Helper to add file or directory recursively to zip
      const addPath = async (remotePath: string, zipPrefix: string): Promise<void> => {
        return new Promise((resPath) => {
          sftp.stat(remotePath, async (statErr, stats) => {
            if (statErr) {
              console.warn(`[Archive skip missing]: ${remotePath}`);
              return resPath();
            }

            const isDir = (stats.mode & 0o040000) === 0o040000;
            if (isDir) {
              sftp.readdir(remotePath, async (readErr, entries) => {
                if (readErr || !entries) {
                  return resPath();
                }
                for (const entry of entries) {
                  if (entry.filename === '.' || entry.filename === '..') continue;
                  const childRemote = `${remotePath.replace(/\/+$/, '')}/${entry.filename}`;
                  const childZip = zipPrefix ? `${zipPrefix}/${entry.filename}` : entry.filename;
                  await addPath(childRemote, childZip);
                }
                resPath();
              });
            } else {
              const fileStream = sftp.createReadStream(remotePath);
              zip.append(fileStream, { name: zipPrefix });
              fileStream.on('end', () => resPath());
              fileStream.on('error', (e) => {
                console.warn(`[Archive stream error on ${remotePath}]: ${e.message}`);
                resPath();
              });
            }
          });
        });
      };

      try {
        for (const itemPath of cleanPaths) {
          const baseName = itemPath.split('/').filter(Boolean).pop() || 'item';
          await addPath(itemPath, baseName);
        }

        zip.on('end', () => {
          try { client.end(); } catch {}
          resolve();
        });

        zip.on('error', (zErr) => {
          try { client.end(); } catch {}
          reject(zErr);
        });

        zip.finalize();
      } catch (loopErr) {
        try { client.end(); } catch {}
        reject(loopErr);
      }
    });
  });
}
