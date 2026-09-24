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

export function parseOctalPermissions(mode: number): { octal: string; stringFormat: string; suid: boolean; sgid: boolean; sticky: boolean } {
  const isDir = (mode & 0o040000) === 0o040000;
  const isSymlink = (mode & 0o120000) === 0o120000;

  const typeChar = isDir ? 'd' : isSymlink ? 'l' : '-';

  const isSuid = Boolean(mode & 0o4000);
  const isSgid = Boolean(mode & 0o2000);
  const isSticky = Boolean(mode & 0o1000);

  const userR = mode & 0o400 ? 'r' : '-';
  const userW = mode & 0o200 ? 'w' : '-';
  const userX = mode & 0o100 ? (isSuid ? 's' : 'x') : isSuid ? 'S' : '-';

  const groupR = mode & 0o040 ? 'r' : '-';
  const groupW = mode & 0o020 ? 'w' : '-';
  const groupX = mode & 0o010 ? (isSgid ? 's' : 'x') : isSgid ? 'S' : '-';

  const otherR = mode & 0o004 ? 'r' : '-';
  const otherW = mode & 0o002 ? 'w' : '-';
  const otherX = mode & 0o001 ? (isSticky ? 't' : 'x') : isSticky ? 'T' : '-';

  const specialBits = ((mode >> 9) & 0o7);
  const octalStandard = (mode & 0o777).toString(8).padStart(3, '0');
  const octal = `${specialBits}${octalStandard}`;
  const stringFormat = `${typeChar}${userR}${userW}${userX}${groupR}${groupW}${groupX}${otherR}${otherW}${otherX}`;

  return { octal, stringFormat, suid: isSuid, sgid: isSgid, sticky: isSticky };
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

export interface LinuxPasteOptions {
  sourcePaths: string[];
  targetDirectory: string;
  operation: 'copy' | 'cut';
}

/**
 * Copy or cut (move) one or more files/directories into a target directory.
 */
export async function pasteLinuxItems(
  server: RemoteServer,
  options: LinuxPasteOptions,
  ephemeralPassword?: string
): Promise<{ success: boolean; processedCount: number; message: string; failures?: string[] }> {
  const cleanTarget = options.targetDirectory.trim().replace(/\/+$/, '') || '/';
  const cleanSources = (options.sourcePaths || []).map((p) => p.trim()).filter(Boolean);

  if (cleanSources.length === 0) {
    throw new Error('At least one source item is required to paste.');
  }

  const client = await getAdaptiveSshClient(server, ephemeralPassword);
  const isCut = options.operation === 'cut';
  const failures: string[] = [];
  let processedCount = 0;

  try {
    // Ensure destination directory exists
    try {
      await executeExecCommand(client, `mkdir -p "${cleanTarget}"`, 10000);
    } catch (mkdirErr: any) {
      if ((server.ssh_username || 'root') !== 'root') {
        await executeExecCommand(client, `sudo -n mkdir -p "${cleanTarget}"`, 10000).catch(() => {});
      }
    }

    for (const src of cleanSources) {
      try {
        const parts = src.split('/').filter(Boolean);
        const baseName = parts.pop() || '';
        if (!baseName) continue;
        const parentDir = src.substring(0, src.lastIndexOf('/')) || '/';

        if (isCut) {
          // If moving into identical directory, no-op
          if (parentDir === cleanTarget) {
            continue;
          }
          const moveCmd = `mv "${src}" "${cleanTarget}/"`;
          try {
            await executeExecCommand(client, moveCmd, 30000);
          } catch (err: any) {
            if ((server.ssh_username || 'root') !== 'root') {
              const sudoMoveCmd = `sudo -n mv "${src}" "${cleanTarget}/"`;
              await executeExecCommand(client, sudoMoveCmd, 30000);
            } else {
              throw err;
            }
          }
          processedCount++;
        } else {
          // COPY operation
          if (parentDir === cleanTarget) {
            // Copying into same folder: auto-generate unique copy name
            const extDot = baseName.lastIndexOf('.');
            const hasExt = extDot > 0;
            const nameWithoutExt = hasExt ? baseName.substring(0, extDot) : baseName;
            const ext = hasExt ? baseName.substring(extDot) : '';

            const copyScript = `
TARGET_DIR="${cleanTarget}"
SRC="${src}"
BASE="${nameWithoutExt}"
EXT="${ext}"
COPY_NAME="\${BASE} - Copy\${EXT}"
if [ -e "\${TARGET_DIR}/\${COPY_NAME}" ]; then
  I=2
  while [ -e "\${TARGET_DIR}/\${BASE} - Copy (\${I})\${EXT}" ]; do
    I=$((I+1))
  done
  DEST="\${TARGET_DIR}/\${BASE} - Copy (\${I})\${EXT}"
else
  DEST="\${TARGET_DIR}/\${COPY_NAME}"
fi
cp -r -p "\${SRC}" "\${DEST}"
`;
            try {
              await executeExecCommand(client, copyScript, 60000);
            } catch (err: any) {
              if ((server.ssh_username || 'root') !== 'root') {
                const sudoCopyScript = `sudo -n bash -c '${copyScript.replace(/'/g, "'\\''")}'`;
                await executeExecCommand(client, sudoCopyScript, 60000);
              } else {
                throw err;
              }
            }
            processedCount++;
          } else {
            // Copying into different directory
            const copyCmd = `cp -r -p "${src}" "${cleanTarget}/"`;
            try {
              await executeExecCommand(client, copyCmd, 60000);
            } catch (err: any) {
              if ((server.ssh_username || 'root') !== 'root') {
                const sudoCopyCmd = `sudo -n cp -r -p "${src}" "${cleanTarget}/"`;
                await executeExecCommand(client, sudoCopyCmd, 60000);
              } else {
                throw err;
              }
            }
            processedCount++;
          }
        }
      } catch (itemErr: any) {
        failures.push(`${src}: ${itemErr?.message || 'Failed'}`);
      }
    }

    if (processedCount === 0 && failures.length > 0) {
      throw new Error(`Failed to ${isCut ? 'move' : 'copy'} items: ${failures.join('; ')}`);
    }

    const actionWord = isCut ? 'moved' : 'copied';
    const message = failures.length > 0
      ? `Partially ${actionWord}: ${processedCount} succeeded, ${failures.length} failed (${failures.join(', ')})`
      : `Successfully ${actionWord} ${processedCount} item(s) to ${cleanTarget}`;

    return {
      success: true,
      processedCount,
      message,
      failures: failures.length > 0 ? failures : undefined,
    };
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

/**
 * Upload a file to a remote Linux directory via SFTP with fallback.
 */
export async function uploadLinuxFile(
  server: RemoteServer,
  targetDirectory: string,
  fileName: string,
  fileBuffer: Buffer,
  ephemeralPassword?: string
): Promise<{ success: boolean; path: string; bytesUploaded: number }> {
  const cleanDir = targetDirectory.trim().replace(/\/+$/, '') || '/';
  const cleanName = fileName.replace(/[\/\\]/g, '_').trim();
  const destPath = cleanDir === '/' ? `/${cleanName}` : `${cleanDir}/${cleanName}`;
  const client = await getAdaptiveSshClient(server, ephemeralPassword);

  try {
    return await new Promise((resolve, reject) => {
      client.sftp((err, sftp) => {
        if (err || !sftp) {
          // Fallback via base64 pipe if SFTP is restricted
          const b64 = fileBuffer.toString('base64');
          return executeExecCommand(client, `echo "${b64}" | base64 -d > "${destPath}"`)
            .then(() => resolve({ success: true, path: destPath, bytesUploaded: fileBuffer.length }))
            .catch(reject);
        }

        const writeStream = sftp.createWriteStream(destPath);
        writeStream.on('close', () => {
          resolve({ success: true, path: destPath, bytesUploaded: fileBuffer.length });
        });
        writeStream.on('error', (streamErr) => {
          reject(streamErr);
        });
        writeStream.end(fileBuffer);
      });
    });
  } finally {
    try {
      client.end();
    } catch {}
  }
}

export interface LinuxItemProperties {
  name: string;
  path: string;
  parentPath: string;
  type: 'directory' | 'file' | 'symlink' | 'other';
  typeHuman: string;
  size: number;
  sizeHuman: string;
  permissions: string;
  octalPermissions: string;
  ownerUser: string;
  ownerUid: number;
  groupName: string;
  groupGid: number;
  modifiedTime: string;
  accessTime: string;
  createdTime?: string;
  statusChangeTime?: string;
  symlinkTarget?: string;
  itemCount?: number;
  suid?: boolean;
  sgid?: boolean;
  sticky?: boolean;
}

/**
 * Fetch detailed file or directory properties and metadata via SSH stat with SFTP fallback.
 */
export async function getLinuxItemProperties(
  server: RemoteServer,
  targetPath: string,
  ephemeralPassword?: string
): Promise<LinuxItemProperties> {
  const cleanPath = targetPath.trim() === '' ? '/' : targetPath.trim().replace(/\/+/g, '/');
  const client = await getAdaptiveSshClient(server, ephemeralPassword);

  try {
    // 1. Try comprehensive stat command
    try {
      const statCmd = `stat -c '%n|%s|%F|%U|%u|%G|%g|%a|%A|%y|%x|%w|%z' "${cleanPath}"`;
      const statOut = await executeExecCommand(client, statCmd, 5000);
      const parts = statOut.trim().split('|');
      if (parts.length >= 11) {
        const size = parseInt(parts[1], 10) || 0;
        const rawType = (parts[2] || '').toLowerCase();
        const ownerUser = parts[3] || 'unknown';
        const ownerUid = parseInt(parts[4], 10) || 0;
        const groupName = parts[5] || 'unknown';
        const groupGid = parseInt(parts[6], 10) || 0;
        const rawOctal = (parts[7] || '').trim();
        const permString = parts[8] || '-';
        const mtime = parts[9] || new Date().toISOString();
        const atime = parts[10] || new Date().toISOString();
        const wtime = parts[11] && parts[11] !== '-' ? parts[11] : undefined;
        const ztime = parts[12] && parts[12] !== '-' ? parts[12] : undefined;

        const formattedOctal = rawOctal.length <= 3 ? rawOctal.padStart(4, '0') : rawOctal;
        const specialDigit = parseInt(formattedOctal[0], 10) || 0;
        const suid = Boolean(specialDigit & 4) || permString[3] === 's' || permString[3] === 'S';
        const sgid = Boolean(specialDigit & 2) || permString[6] === 's' || permString[6] === 'S';
        const sticky = Boolean(specialDigit & 1) || permString[9] === 't' || permString[9] === 'T';

        let type: 'directory' | 'file' | 'symlink' | 'other' = 'file';
        if (rawType.includes('directory')) type = 'directory';
        else if (rawType.includes('symbolic')) type = 'symlink';
        else if (rawType.includes('socket') || rawType.includes('fifo') || rawType.includes('device')) type = 'other';

        let symlinkTarget: string | undefined;
        if (type === 'symlink') {
          try {
            symlinkTarget = (await executeExecCommand(client, `readlink "${cleanPath}"`, 2000)).trim();
          } catch {}
        }

        let itemCount: number | undefined;
        if (type === 'directory') {
          try {
            const countOut = await executeExecCommand(
              client,
              `find "${cleanPath}" -maxdepth 1 ! -path "${cleanPath}" | wc -l`,
              2500
            );
            const count = parseInt(countOut.trim(), 10);
            if (!isNaN(count)) itemCount = count;
          } catch {}
        }

        const name = cleanPath === '/' ? '/' : cleanPath.substring(cleanPath.lastIndexOf('/') + 1);
        const parentPath = cleanPath === '/' ? '/' : cleanPath.substring(0, cleanPath.lastIndexOf('/')) || '/';

        return {
          name,
          path: cleanPath,
          parentPath,
          type,
          typeHuman: parts[2] || type,
          size,
          sizeHuman: formatBytes(size),
          permissions: permString,
          octalPermissions: formattedOctal,
          ownerUser,
          ownerUid,
          groupName,
          groupGid,
          modifiedTime: mtime,
          accessTime: atime,
          createdTime: wtime || ztime,
          statusChangeTime: ztime,
          symlinkTarget,
          itemCount,
          suid,
          sgid,
          sticky,
        };
      }
    } catch {}

    // 2. Fallback via SFTP
    return await new Promise<LinuxItemProperties>((resolve, reject) => {
      client.sftp((err, sftp) => {
        if (err || !sftp) {
          return reject(new Error(`Failed to inspect file: ${err?.message || 'SFTP unavailable'}`));
        }
        sftp.lstat(cleanPath, (statErr, stats) => {
          if (statErr || !stats) {
            return reject(statErr || new Error(`Cannot stat item ${cleanPath}`));
          }

          const mode = stats.mode || 0;
          const isDir = (mode & 0o040000) === 0o040000;
          const isSymlink = (mode & 0o120000) === 0o120000;
          const type = isDir ? 'directory' : isSymlink ? 'symlink' : 'file';
          const size = stats.size || 0;
          const { octal, stringFormat, suid, sgid, sticky } = parseOctalPermissions(mode);
          const mtime = stats.mtime ? new Date(stats.mtime * 1000).toISOString() : new Date().toISOString();
          const atime = stats.atime ? new Date(stats.atime * 1000).toISOString() : new Date().toISOString();
          const name = cleanPath === '/' ? '/' : cleanPath.substring(cleanPath.lastIndexOf('/') + 1);
          const parentPath = cleanPath === '/' ? '/' : cleanPath.substring(0, cleanPath.lastIndexOf('/')) || '/';

          resolve({
            name,
            path: cleanPath,
            parentPath,
            type,
            typeHuman: isDir ? 'directory' : isSymlink ? 'symbolic link' : 'regular file',
            size,
            sizeHuman: formatBytes(size),
            permissions: stringFormat,
            octalPermissions: octal,
            ownerUser: String(stats.uid ?? 0),
            ownerUid: stats.uid ?? 0,
            groupName: String(stats.gid ?? 0),
            groupGid: stats.gid ?? 0,
            modifiedTime: mtime,
            accessTime: atime,
            suid,
            sgid,
            sticky,
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
 * Fetch real system users and groups from remote Linux server.
 */
export async function getLinuxSystemUsersAndGroups(
  server: RemoteServer,
  ephemeralPassword?: string
): Promise<{ users: string[]; groups: string[] }> {
  const client = await getAdaptiveSshClient(server, ephemeralPassword);
  try {
    const usersCmd = `getent passwd 2>/dev/null | cut -d: -f1 || cut -d: -f1 /etc/passwd`;
    const groupsCmd = `getent group 2>/dev/null | cut -d: -f1 || cut -d: -f1 /etc/group`;
    const [rawUsers, rawGroups] = await Promise.all([
      executeExecCommand(client, usersCmd, 5000).catch(() => ''),
      executeExecCommand(client, groupsCmd, 5000).catch(() => ''),
    ]);
    const users = Array.from(new Set(rawUsers.split('\n').map((s) => s.trim()).filter(Boolean))).sort();
    const groups = Array.from(new Set(rawGroups.split('\n').map((s) => s.trim()).filter(Boolean))).sort();
    return { users, groups };
  } finally {
    try {
      client.end();
    } catch {}
  }
}

export interface UpdateLinuxAttributesOptions {
  path: string;
  mode?: string;
  owner?: string;
  group?: string;
  recursive?: boolean;
}

/**
 * Update file/directory permissions (chmod) and ownership (chown) on remote Linux server.
 */
export async function updateLinuxItemAttributes(
  server: RemoteServer,
  options: UpdateLinuxAttributesOptions,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string; properties?: LinuxItemProperties }> {
  const cleanPath = (options.path || '').trim();
  if (!cleanPath || cleanPath === '') {
    throw new Error('Target path is required.');
  }
  if (cleanPath === '/' && options.recursive) {
    throw new Error('Recursive attribute modification on root "/" is strictly prohibited.');
  }

  const client = await getAdaptiveSshClient(server, ephemeralPassword);
  const recursiveFlag = options.recursive ? '-R ' : '';

  try {
    const executedCommands: string[] = [];

    // 1. Chmod if mode is provided
    if (options.mode) {
      const trimmedMode = options.mode.trim();
      if (!/^[0-7]{3,4}$/.test(trimmedMode)) {
        throw new Error(
          `Invalid octal permissions format: "${trimmedMode}". Must be 3 or 4 octal digits (e.g. 0755, 644, 4755).`
        );
      }
      const chmodCmd = `chmod ${recursiveFlag}${trimmedMode} "${cleanPath}"`;
      try {
        await executeExecCommand(client, chmodCmd, 10000);
        executedCommands.push(chmodCmd);
      } catch (err: any) {
        if ((server.ssh_username || 'root') !== 'root') {
          const sudoCmd = `sudo -n chmod ${recursiveFlag}${trimmedMode} "${cleanPath}"`;
          await executeExecCommand(client, sudoCmd, 10000);
          executedCommands.push(sudoCmd);
        } else {
          throw err;
        }
      }
    }

    // 2. Chown if owner or group is provided
    if (options.owner !== undefined || options.group !== undefined) {
      const sanitizedOwner = (options.owner || '').trim().replace(/[^a-zA-Z0-9_\-\.]/g, '');
      const sanitizedGroup = (options.group || '').trim().replace(/[^a-zA-Z0-9_\-\.]/g, '');

      let chownTarget = '';
      if (sanitizedOwner && sanitizedGroup) {
        chownTarget = `${sanitizedOwner}:${sanitizedGroup}`;
      } else if (sanitizedOwner) {
        chownTarget = `${sanitizedOwner}`;
      } else if (sanitizedGroup) {
        chownTarget = `:${sanitizedGroup}`;
      }

      if (chownTarget) {
        const chownCmd = `chown ${recursiveFlag}${chownTarget} "${cleanPath}"`;
        try {
          await executeExecCommand(client, chownCmd, 10000);
          executedCommands.push(chownCmd);
        } catch (err: any) {
          if ((server.ssh_username || 'root') !== 'root') {
            const sudoCmd = `sudo -n chown ${recursiveFlag}${chownTarget} "${cleanPath}"`;
            await executeExecCommand(client, sudoCmd, 10000);
            executedCommands.push(sudoCmd);
          } else {
            throw err;
          }
        }
      }
    }

    // 3. Fetch updated properties directly
    let updatedProperties: LinuxItemProperties | undefined;
    try {
      updatedProperties = await getLinuxItemProperties(server, cleanPath, ephemeralPassword);
    } catch {}

    return {
      success: true,
      message: `Attributes updated successfully (${executedCommands.join('; ') || 'no changes'})`,
      properties: updatedProperties,
    };
  } finally {
    try {
      client.end();
    } catch {}
  }
}


