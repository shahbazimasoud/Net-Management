import { RemoteServer, LinuxSystemUser, LinuxLoggedInUser, LinuxSystemGroup, LinuxUserSecurityInfo } from '../src/types';
import { runAdaptiveSshCommand } from './linuxServerMonitor';

/**
 * Shell script to fetch logged-in users, all system users, groups, and account shadow lock status
 */
const USERS_GROUPS_SCRIPT = `export LC_ALL=C
echo "---LOGGED_IN---"
w -h 2>/dev/null || who -u 2>/dev/null || who 2>/dev/null
echo "---USERS---"
getent passwd 2>/dev/null || cat /etc/passwd 2>/dev/null
echo "---GROUPS---"
getent group 2>/dev/null || cat /etc/group 2>/dev/null
echo "---SHADOW_STATUS---"
sudo -n cut -d: -f1,2,3,8 /etc/shadow 2>/dev/null || cut -d: -f1,2,3,8 /etc/shadow 2>/dev/null || true
echo "---END---"`;

/**
 * Fetch list of all system users, available groups, and currently logged-in interactive sessions
 */
export async function fetchLinuxUsersAndGroupsSSH(
  server: RemoteServer,
  ephemeralPassword?: string
): Promise<{
  loggedInUsers: LinuxLoggedInUser[];
  systemUsers: LinuxSystemUser[];
  systemGroups: LinuxSystemGroup[];
}> {
  const rawOutput = await runAdaptiveSshCommand(server, USERS_GROUPS_SCRIPT, ephemeralPassword, 9000);

  const sections: Record<string, string[]> = {};
  let currentSec = '';
  for (const line of rawOutput.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('---') && trimmed.endsWith('---')) {
      currentSec = trimmed.replace(/---/g, '').trim();
      sections[currentSec] = [];
    } else if (currentSec) {
      sections[currentSec].push(line);
    }
  }

  // 1. Parse logged in users
  const loggedInLines = sections['LOGGED_IN'] || [];
  const loggedInUsers: LinuxLoggedInUser[] = [];
  for (const rawLine of loggedInLines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('USER') || line.startsWith('---')) continue;
    const parts = line.split(/\s+/);
    if (parts.length >= 2) {
      const user = parts[0];
      const tty = parts[1];
      let from = '-';
      let loginTime = '-';
      let idleTime = '-';
      let what = '-';

      if (parts.length >= 5) {
        from = parts[2] || '-';
        loginTime = parts[3] || '-';
        idleTime = parts[4] || '-';
        what = parts.slice(7).join(' ') || parts.slice(5).join(' ') || '-';
      } else {
        from = parts[2] || '-';
        loginTime = parts.slice(3).join(' ') || '-';
      }

      loggedInUsers.push({
        user,
        tty,
        from: from.replace(/[()]/g, ''),
        loginTime,
        idleTime,
        what,
      });
    }
  }

  // 2. Parse groups from /etc/group
  const groupLines = sections['GROUPS'] || [];
  const systemGroups: LinuxSystemGroup[] = [];
  const gidToGroupName: Record<number, string> = {};
  const userToSupplementaryGroups: Record<string, string[]> = {};

  for (const rawLine of groupLines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(':');
    if (parts.length >= 3) {
      const gname = parts[0];
      const gid = parseInt(parts[2], 10);
      if (isNaN(gid)) continue;
      gidToGroupName[gid] = gname;

      const membersStr = parts[3] || '';
      const members = membersStr
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean);

      systemGroups.push({
        name: gname,
        gid,
        members,
      });

      for (const m of members) {
        if (!userToSupplementaryGroups[m]) {
          userToSupplementaryGroups[m] = [];
        }
        if (!userToSupplementaryGroups[m].includes(gname)) {
          userToSupplementaryGroups[m].push(gname);
        }
      }
    }
  }

  // Sort groups (priority common groups first: sudo, wheel, docker, adm, etc.)
  const priorityGroups = ['sudo', 'wheel', 'root', 'docker', 'adm', 'systemd-journal', 'lxd', 'kvm', 'www-data'];
  systemGroups.sort((a, b) => {
    const aPri = priorityGroups.indexOf(a.name);
    const bPri = priorityGroups.indexOf(b.name);
    if (aPri !== -1 && bPri === -1) return -1;
    if (aPri === -1 && bPri !== -1) return 1;
    if (aPri !== -1 && bPri !== -1) return aPri - bPri;
    return a.name.localeCompare(b.name);
  });

  // 3. Parse shadow statuses for locked accounts, password aging, and account expiration
  const shadowLines = sections['SHADOW_STATUS'] || [];
  const lockedUsers = new Set<string>();
  const shadowInfo = new Map<
    string,
    { isLocked: boolean; mustChangePass: boolean; expireDate?: string; isExpired?: boolean; daysUntilExpire?: number | null }
  >();
  const currentEpochDays = Math.floor(Date.now() / 86400000);

  for (const rawLine of shadowLines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(':');
    if (parts.length >= 2) {
      const uname = parts[0];
      const passField = parts[1];
      // In /etc/shadow, '!', '*', '!*', '!!' or starting with '!' means account is locked or disabled
      const isLocked = passField.startsWith('!') || passField.startsWith('*') || passField === '!' || passField === '*';
      if (isLocked) {
        lockedUsers.add(uname);
      }

      const lastChangeDays = parseInt(parts[2], 10);
      const mustChangePass = lastChangeDays === 0;

      let expireDate: string | undefined;
      let isExpired: boolean | undefined;
      let daysUntilExpire: number | null | undefined;
      const expireDays = parseInt(parts[3], 10);
      if (!isNaN(expireDays) && expireDays > 0) {
        daysUntilExpire = expireDays - currentEpochDays;
        isExpired = daysUntilExpire <= 0;
        try {
          expireDate = new Date(expireDays * 86400000).toISOString().slice(0, 10);
        } catch {
          // ignore date parse errors
        }
      }

      shadowInfo.set(uname, { isLocked, mustChangePass, expireDate, isExpired, daysUntilExpire });
    }
  }

  // 4. Parse system users from /etc/passwd
  const userLines = sections['USERS'] || [];
  const systemUsers: LinuxSystemUser[] = [];
  for (const rawLine of userLines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(':');
    if (parts.length >= 7) {
      const username = parts[0];
      const uid = parseInt(parts[2], 10) || 0;
      const gid = parseInt(parts[3], 10) || 0;
      const comment = parts[4] || '';
      const homeDir = parts[5] || '';
      const shell = parts[6] || '';
      const isSystem = (uid < 1000 && uid !== 0) || shell.includes('nologin') || shell.includes('false');

      const primaryGroup = gidToGroupName[gid] || String(gid);
      const userSupp = userToSupplementaryGroups[username] || [];
      const allUserGroups = Array.from(new Set([primaryGroup, ...userSupp])).filter(Boolean);

      const sInfo = shadowInfo.get(username);
      const isLocked = lockedUsers.has(username) || shell.includes('nologin') || shell.includes('false');

      systemUsers.push({
        username,
        uid,
        gid,
        comment,
        homeDir,
        shell,
        isSystem,
        primaryGroup,
        groups: allUserGroups,
        isLocked,
        expireDate: sInfo?.expireDate,
        isExpired: sInfo?.isExpired,
        daysUntilExpire: sInfo?.daysUntilExpire,
        mustChangePassword: sInfo?.mustChangePass,
      });
    }
  }

  // Sort system users: root first, then human users, then system accounts
  systemUsers.sort((a, b) => {
    if (a.uid === 0) return -1;
    if (b.uid === 0) return 1;
    if (!a.isSystem && b.isSystem) return -1;
    if (a.isSystem && !b.isSystem) return 1;
    return a.username.localeCompare(b.username);
  });

  return { loggedInUsers, systemUsers, systemGroups };
}

/**
 * Create a new user account on the Linux remote server
 */
export async function createLinuxUserSSH(
  server: RemoteServer,
  params: {
    username: string;
    password?: string;
    comment?: string;
    homeDir?: string;
    shell?: string;
    groups?: string[];
    createHome?: boolean;
    expireDate?: string;
    forcePasswordChange?: boolean;
  },
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const username = params.username.trim();
  if (!username || !/^[a-z_][a-z0-9_-]{0,31}$/i.test(username)) {
    throw new Error('Invalid username. Must start with a letter/underscore and contain only alphanumeric characters, dashes, or underscores (max 32 chars).');
  }

  const shell = params.shell?.trim() || '/bin/bash';
  const homeDir = params.homeDir?.trim() || `/home/${username}`;
  const comment = params.comment?.trim() || '';
  const createHome = params.createHome !== false; // default true
  const groupsList = (params.groups || []).map((g) => g.trim()).filter(Boolean).join(',');
  const expireDate = params.expireDate?.trim() || '';
  const forcePasswordChange = !!params.forcePasswordChange;

  // Base64 encode all strings to prevent quoting / special characters shell injection
  const b64User = Buffer.from(username).toString('base64');
  const b64Home = Buffer.from(homeDir).toString('base64');
  const b64Shell = Buffer.from(shell).toString('base64');
  const b64Comment = Buffer.from(comment).toString('base64');
  const b64Groups = Buffer.from(groupsList).toString('base64');
  const b64Expire = expireDate ? Buffer.from(expireDate).toString('base64') : '';
  const b64Pass = params.password ? Buffer.from(params.password).toString('base64') : '';

  const script = `export LC_ALL=C
U=$(echo "${b64User}" | base64 -d)
H=$(echo "${b64Home}" | base64 -d)
S=$(echo "${b64Shell}" | base64 -d)
C=$(echo "${b64Comment}" | base64 -d)
G=$(echo "${b64Groups}" | base64 -d)
${b64Expire ? `E=$(echo "${b64Expire}" | base64 -d)` : ''}

if id -u "$U" >/dev/null 2>&1; then
  echo "USER_ALREADY_EXISTS"
  exit 1
fi

CMD="sudo useradd"
if [ "${createHome ? '1' : '0'}" = "1" ]; then
  CMD="$CMD -m"
fi
if [ -n "$H" ]; then
  CMD="$CMD -d '$H'"
fi
if [ -n "$S" ]; then
  CMD="$CMD -s '$S'"
fi
if [ -n "$C" ]; then
  CMD="$CMD -c '$C'"
fi
if [ -n "$G" ]; then
  CMD="$CMD -G '$G'"
fi
${b64Expire ? `
if [ -n "$E" ]; then
  CMD="$CMD -e '$E'"
fi
` : ''}
CMD="$CMD '$U'"

eval "$CMD"
RES=$?
if [ $RES -ne 0 ]; then
  echo "USERADD_FAILED_CODE_$RES"
  exit 1
fi

${
  b64Pass
    ? `
P=$(echo "${b64Pass}" | base64 -d)
echo "$U:$P" | sudo chpasswd 2>/dev/null || (echo "$P"; echo "$P") | sudo passwd "$U" 2>/dev/null || true
`
    : ''
}

${
  forcePasswordChange
    ? `
sudo chage -d 0 "$U" 2>/dev/null || sudo passwd -e "$U" 2>/dev/null || true
`
    : ''
}

echo "USERADD_SUCCESS"
`;

  const output = await runAdaptiveSshCommand(server, script, ephemeralPassword, 12000);

  if (output.includes('USER_ALREADY_EXISTS')) {
    throw new Error(`User account "${username}" already exists on the server.`);
  }

  if (output.includes('USERADD_FAILED') || !output.includes('USERADD_SUCCESS')) {
    throw new Error(`Failed to create user account "${username}". Remote output: ${output.trim()}`);
  }

  return {
    success: true,
    message: `User account "${username}" created successfully on remote server.`,
  };
}

/**
 * Change / Update user password securely on the Linux remote server
 */
export async function updateLinuxUserPasswordSSH(
  server: RemoteServer,
  username: string,
  newPassword: string,
  ephemeralPassword?: string,
  forcePasswordChange?: boolean
): Promise<{ success: boolean; message: string }> {
  const cleanUser = username.trim();
  if (!cleanUser || !/^[a-z_][a-z0-9_-]{0,31}$/i.test(cleanUser)) {
    throw new Error('Invalid username specified.');
  }

  if (!newPassword) {
    throw new Error('New password cannot be empty.');
  }

  const b64User = Buffer.from(cleanUser).toString('base64');
  const b64Pass = Buffer.from(newPassword).toString('base64');

  const script = `export LC_ALL=C
U=$(echo "${b64User}" | base64 -d)
P=$(echo "${b64Pass}" | base64 -d)

if ! id -u "$U" >/dev/null 2>&1; then
  echo "USER_NOT_FOUND"
  exit 1
fi

PASS_OK=0
if echo "$U:$P" | sudo chpasswd 2>/dev/null; then
  PASS_OK=1
elif (echo "$P"; echo "$P") | sudo passwd "$U" >/dev/null 2>&1; then
  PASS_OK=1
fi

if [ "$PASS_OK" = "1" ]; then
  ${forcePasswordChange ? 'sudo chage -d 0 "$U" 2>/dev/null || sudo passwd -e "$U" 2>/dev/null || true' : ''}
  echo "PASSWD_SUCCESS"
  exit 0
fi

echo "PASSWD_FAILED"
exit 1
`;

  const output = await runAdaptiveSshCommand(server, script, ephemeralPassword, 10000);

  if (output.includes('USER_NOT_FOUND')) {
    throw new Error(`User account "${cleanUser}" was not found on the server.`);
  }

  if (!output.includes('PASSWD_SUCCESS')) {
    throw new Error(`Failed to update password for "${cleanUser}". Remote error: ${output.trim()}`);
  }

  return {
    success: true,
    message: forcePasswordChange
      ? `Password for user "${cleanUser}" updated. User will be required to change it on next login.`
      : `Password for user "${cleanUser}" has been updated successfully.`,
  };
}

/**
 * Edit / Update an existing user account on the Linux remote server
 */
export async function updateLinuxUserSSH(
  server: RemoteServer,
  params: {
    username: string;
    comment?: string;
    shell?: string;
    homeDir?: string;
    groups?: string[];
    newPassword?: string;
    forcePasswordChange?: boolean;
    expireDate?: string;
    isLocked?: boolean;
  },
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const username = params.username.trim();
  if (!username || !/^[a-z_][a-z0-9_-]{0,31}$/i.test(username)) {
    throw new Error('Invalid username specified.');
  }

  const b64User = Buffer.from(username).toString('base64');
  const hasComment = params.comment !== undefined;
  const b64Comment = hasComment ? Buffer.from(params.comment || '').toString('base64') : '';
  const hasShell = !!params.shell?.trim();
  const b64Shell = hasShell ? Buffer.from(params.shell!.trim()).toString('base64') : '';
  const hasHome = !!params.homeDir?.trim();
  const b64Home = hasHome ? Buffer.from(params.homeDir!.trim()).toString('base64') : '';
  const hasGroups = params.groups !== undefined;
  const groupsList = (params.groups || []).map((g) => g.trim()).filter(Boolean).join(',');
  const b64Groups = hasGroups ? Buffer.from(groupsList).toString('base64') : '';
  const hasPassword = !!params.newPassword;
  const b64Pass = hasPassword ? Buffer.from(params.newPassword!).toString('base64') : '';
  const forcePasswordChange = !!params.forcePasswordChange;
  const hasExpire = params.expireDate !== undefined;
  const b64Expire = hasExpire ? Buffer.from(params.expireDate || '').toString('base64') : '';
  const hasLock = params.isLocked !== undefined;
  const isLocked = !!params.isLocked;

  const script = `export LC_ALL=C
U=$(echo "${b64User}" | base64 -d)

if ! id -u "$U" >/dev/null 2>&1; then
  echo "USER_NOT_FOUND"
  exit 1
fi

# 1. Update Comment
if [ "${hasComment ? '1' : '0'}" = "1" ]; then
  C=$(echo "${b64Comment}" | base64 -d)
  sudo usermod -c "$C" "$U" 2>/dev/null || true
fi

# 2. Update Shell
if [ "${hasShell ? '1' : '0'}" = "1" ]; then
  S=$(echo "${b64Shell}" | base64 -d)
  sudo usermod -s "$S" "$U" 2>/dev/null || true
fi

# 3. Update Home Directory
if [ "${hasHome ? '1' : '0'}" = "1" ]; then
  H=$(echo "${b64Home}" | base64 -d)
  sudo usermod -d "$H" "$U" 2>/dev/null || true
fi

# 4. Update Groups
if [ "${hasGroups ? '1' : '0'}" = "1" ]; then
  G=$(echo "${b64Groups}" | base64 -d)
  sudo usermod -G "$G" "$U" 2>/dev/null || true
fi

# 5. Update Expiration Date
if [ "${hasExpire ? '1' : '0'}" = "1" ]; then
  E=$(echo "${b64Expire}" | base64 -d)
  if [ -z "$E" ] || [ "$E" = "never" ] || [ "$E" = "-1" ]; then
    sudo chage -E -1 "$U" 2>/dev/null || sudo usermod -e "" "$U" 2>/dev/null || true
  else
    sudo chage -E "$E" "$U" 2>/dev/null || sudo usermod -e "$E" "$U" 2>/dev/null || true
  fi
fi

# 6. Update Password (if provided)
if [ "${hasPassword ? '1' : '0'}" = "1" ]; then
  P=$(echo "${b64Pass}" | base64 -d)
  echo "$U:$P" | sudo chpasswd 2>/dev/null || (echo "$P"; echo "$P") | sudo passwd "$U" 2>/dev/null || true
fi

# 7. Force Password Change on Next Login
if [ "${forcePasswordChange ? '1' : '0'}" = "1" ]; then
  sudo chage -d 0 "$U" 2>/dev/null || sudo passwd -e "$U" 2>/dev/null || true
fi

# 8. Lock or Unlock
if [ "${hasLock ? '1' : '0'}" = "1" ]; then
  if [ "${isLocked ? '1' : '0'}" = "1" ]; then
    if [ "$U" != "root" ]; then
      sudo usermod -L "$U" 2>/dev/null || sudo passwd -l "$U" 2>/dev/null || true
    fi
  else
    sudo usermod -U "$U" 2>/dev/null || sudo passwd -u "$U" 2>/dev/null || true
  fi
fi

echo "USER_UPDATE_SUCCESS"
`;

  const output = await runAdaptiveSshCommand(server, script, ephemeralPassword, 12000);

  if (output.includes('USER_NOT_FOUND')) {
    throw new Error(`User account "${username}" was not found on the server.`);
  }

  if (!output.includes('USER_UPDATE_SUCCESS')) {
    throw new Error(`Failed to update user "${username}". Remote output: ${output.trim()}`);
  }

  return {
    success: true,
    message: `User account "${username}" updated successfully.`,
  };
}

/**
 * Toggle lock / disable status for a user account (usermod -L / usermod -U)
 */
export async function toggleLinuxUserLockSSH(
  server: RemoteServer,
  username: string,
  lock: boolean,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const cleanUser = username.trim();
  if (!cleanUser || !/^[a-z_][a-z0-9_-]{0,31}$/i.test(cleanUser)) {
    throw new Error('Invalid username.');
  }

  if (cleanUser === 'root' && lock) {
    throw new Error('Refusing to lock the root account to prevent system lockout.');
  }

  const b64User = Buffer.from(cleanUser).toString('base64');

  const script = `export LC_ALL=C
U=$(echo "${b64User}" | base64 -d)

if ! id -u "$U" >/dev/null 2>&1; then
  echo "USER_NOT_FOUND"
  exit 1
fi

if [ "${lock ? '1' : '0'}" = "1" ]; then
  sudo usermod -L "$U" 2>/dev/null || sudo passwd -l "$U" 2>/dev/null
  echo "LOCK_SUCCESS"
else
  sudo usermod -U "$U" 2>/dev/null || sudo passwd -u "$U" 2>/dev/null
  echo "UNLOCK_SUCCESS"
fi
`;

  const output = await runAdaptiveSshCommand(server, script, ephemeralPassword, 10000);

  if (output.includes('USER_NOT_FOUND')) {
    throw new Error(`User account "${cleanUser}" was not found.`);
  }

  if (lock && !output.includes('LOCK_SUCCESS')) {
    throw new Error(`Failed to lock account "${cleanUser}": ${output.trim()}`);
  }

  if (!lock && !output.includes('UNLOCK_SUCCESS')) {
    throw new Error(`Failed to unlock account "${cleanUser}": ${output.trim()}`);
  }

  return {
    success: true,
    message: lock
      ? `User account "${cleanUser}" has been disabled (locked).`
      : `User account "${cleanUser}" has been re-enabled (unlocked).`,
  };
}

/**
 * Assign / Update supplementary groups for a user (usermod -G)
 */
export async function updateLinuxUserGroupsSSH(
  server: RemoteServer,
  username: string,
  groups: string[],
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const cleanUser = username.trim();
  if (!cleanUser || !/^[a-z_][a-z0-9_-]{0,31}$/i.test(cleanUser)) {
    throw new Error('Invalid username.');
  }

  const cleanGroups = groups
    .map((g) => g.trim())
    .filter((g) => /^[a-z_][a-z0-9_-]{0,31}$/i.test(g));

  const groupsList = cleanGroups.join(',');
  const b64User = Buffer.from(cleanUser).toString('base64');
  const b64Groups = Buffer.from(groupsList).toString('base64');

  const script = `export LC_ALL=C
U=$(echo "${b64User}" | base64 -d)
G=$(echo "${b64Groups}" | base64 -d)

if ! id -u "$U" >/dev/null 2>&1; then
  echo "USER_NOT_FOUND"
  exit 1
fi

sudo usermod -G "$G" "$U"
RES=$?
if [ $RES -eq 0 ]; then
  echo "GROUPS_UPDATE_SUCCESS"
else
  echo "GROUPS_UPDATE_FAILED_$RES"
fi
`;

  const output = await runAdaptiveSshCommand(server, script, ephemeralPassword, 10000);

  if (output.includes('USER_NOT_FOUND')) {
    throw new Error(`User account "${cleanUser}" was not found on the server.`);
  }

  if (!output.includes('GROUPS_UPDATE_SUCCESS')) {
    throw new Error(`Failed to update groups for "${cleanUser}": ${output.trim()}`);
  }

  return {
    success: true,
    message: `Groups for user "${cleanUser}" have been updated to: ${cleanGroups.length > 0 ? cleanGroups.join(', ') : '(none)'}`,
  };
}

/**
 * Create a new group on the Linux remote server (groupadd)
 */
export async function createLinuxGroupSSH(
  server: RemoteServer,
  groupName: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const cleanGroup = groupName.trim();
  if (!cleanGroup || !/^[a-z_][a-z0-9_-]{0,31}$/i.test(cleanGroup)) {
    throw new Error('Invalid group name. Must start with a letter/underscore and contain only alphanumeric characters, dashes, or underscores.');
  }

  const b64Group = Buffer.from(cleanGroup).toString('base64');

  const script = `export LC_ALL=C
G=$(echo "${b64Group}" | base64 -d)

if getent group "$G" >/dev/null 2>&1; then
  echo "GROUP_ALREADY_EXISTS"
  exit 1
fi

sudo groupadd "$G"
RES=$?
if [ $RES -eq 0 ]; then
  echo "GROUPADD_SUCCESS"
else
  echo "GROUPADD_FAILED_$RES"
fi
`;

  const output = await runAdaptiveSshCommand(server, script, ephemeralPassword, 10000);

  if (output.includes('GROUP_ALREADY_EXISTS')) {
    throw new Error(`Group "${cleanGroup}" already exists on the server.`);
  }

  if (!output.includes('GROUPADD_SUCCESS')) {
    throw new Error(`Failed to create group "${cleanGroup}": ${output.trim()}`);
  }

  return {
    success: true,
    message: `Group "${cleanGroup}" created successfully.`,
  };
}

/**
 * Delete a user account from the Linux remote server (userdel)
 */
export async function deleteLinuxUserSSH(
  server: RemoteServer,
  username: string,
  removeHome: boolean,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const cleanUser = username.trim();
  if (!cleanUser || !/^[a-z_][a-z0-9_-]{0,31}$/i.test(cleanUser)) {
    throw new Error('Invalid username.');
  }

  if (cleanUser === 'root') {
    throw new Error('Deleting root user is strictly prohibited.');
  }

  if (server.ssh_username && cleanUser.toLowerCase() === server.ssh_username.toLowerCase()) {
    throw new Error(`Cannot delete active SSH login user "${cleanUser}" used to connect to this server.`);
  }

  const b64User = Buffer.from(cleanUser).toString('base64');

  const script = `export LC_ALL=C
U=$(echo "${b64User}" | base64 -d)

if ! id -u "$U" >/dev/null 2>&1; then
  echo "USER_NOT_FOUND"
  exit 1
fi

CMD="sudo userdel"
if [ "${removeHome ? '1' : '0'}" = "1" ]; then
  CMD="$CMD -r"
fi
CMD="$CMD '$U'"

eval "$CMD"
RES=$?
if [ $RES -eq 0 ]; then
  echo "USERDEL_SUCCESS"
else
  echo "USERDEL_FAILED_$RES"
fi
`;

  const output = await runAdaptiveSshCommand(server, script, ephemeralPassword, 12000);

  if (output.includes('USER_NOT_FOUND')) {
    throw new Error(`User account "${cleanUser}" was not found.`);
  }

  if (!output.includes('USERDEL_SUCCESS')) {
    throw new Error(`Failed to delete user "${cleanUser}": ${output.trim()}`);
  }

  return {
    success: true,
    message: `User account "${cleanUser}" was removed from the server.`,
  };
}

/**
 * Log out / Terminate an active user session or all sessions of a user on the Linux remote server.
 * Supports sending pre-logout alert messages and delayed/scheduled execution.
 */
export async function logoutLinuxUserSessionSSH(
  server: RemoteServer,
  params: {
    username: string;
    tty?: string;
    delaySeconds?: number;
    message?: string;
    force?: boolean;
    allSessions?: boolean;
  },
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const username = (params.username || '').trim();
  const rawTty = (params.tty || '').trim();
  const cleanTty = rawTty.replace(/^\/dev\//, '').replace(/[^a-zA-Z0-9/_.-]/g, '');
  const delay = Math.max(0, Math.floor(Number(params.delaySeconds) || 0));
  const rawMessage = (params.message || '').trim();
  const isForce = Boolean(params.force);
  const allSessions = Boolean(params.allSessions);

  if (!username && !cleanTty) {
    throw new Error('Either username or tty must be specified to log out session.');
  }

  // Base64 encoding to prevent quoting/injection issues
  const b64User = Buffer.from(username).toString('base64');
  const b64Tty = Buffer.from(cleanTty).toString('base64');
  const b64Msg = Buffer.from(rawMessage).toString('base64');

  const script = `export LC_ALL=C
U=$(echo "${b64User}" | base64 -d)
T=$(echo "${b64Tty}" | base64 -d)
M=$(echo "${b64Msg}" | base64 -d)
D=${delay}
F=${isForce ? '1' : '0'}
ALL=${allSessions ? '1' : '0'}

# 1. Send warning message before terminating if provided
if [ -n "$M" ]; then
  if [ -n "$T" ] && ( [ -w "/dev/$T" ] || sudo test -e "/dev/$T" ); then
    printf '\\n\\n*** [ALERT FROM ADMINISTRATOR] ***\\n%s\\n\\n' "$M" | sudo tee "/dev/$T" >/dev/null 2>&1 || true
  elif [ -n "$U" ]; then
    printf '\\n*** [ALERT FROM ADMINISTRATOR to %s] ***\\n%s\\n\\n' "$U" "$M" | sudo wall 2>&1 || printf '%s\\n' "$M" | sudo write "$U" 2>&1 || true
  else
    printf '\\n*** [ALERT FROM ADMINISTRATOR] ***\\n%s\\n\\n' "$M" | sudo wall 2>&1 || true
  fi
fi

# 2. Execution: Immediate vs Delayed
if [ "$D" -le 0 ]; then
  # Immediate termination
  if [ "$ALL" = "1" ] && [ -n "$U" ]; then
    if [ "$F" = "1" ]; then
      sudo pkill -KILL -u "$U" 2>/dev/null || true
    else
      sudo pkill -HUP -u "$U" 2>/dev/null || true
      sleep 0.3
      sudo pkill -KILL -u "$U" 2>/dev/null || true
    fi
    if command -v loginctl >/dev/null 2>&1; then
      sudo loginctl terminate-user "$U" 2>/dev/null || true
    fi
  else
    if [ -n "$T" ]; then
      CLEAN_DEV="/dev/$T"
      if [ "$F" = "1" ]; then
        sudo pkill -KILL -t "$T" 2>/dev/null || true
      else
        sudo pkill -HUP -t "$T" 2>/dev/null || true
        sleep 0.3
        sudo pkill -KILL -t "$T" 2>/dev/null || true
      fi
      if [ -e "$CLEAN_DEV" ]; then
        sudo fuser -k -9 "$CLEAN_DEV" 2>/dev/null || true
      fi
      if command -v loginctl >/dev/null 2>&1; then
        S_ID=$(loginctl list-sessions --no-legend 2>/dev/null | grep "$T" | awk '{print $1}' | head -n 1)
        if [ -n "$S_ID" ]; then
          sudo loginctl terminate-session "$S_ID" 2>/dev/null || true
        fi
      fi
    elif [ -n "$U" ]; then
      sudo pkill -KILL -u "$U" 2>/dev/null || true
    fi
  fi
  echo "LOGOUT_EXEC_IMMEDIATE_DONE"
else
  # Background delayed termination
  nohup bash -c '
    U="'"$U"'"
    T="'"$T"'"
    M="'"$M"'"
    D="'"$D"'"
    F="'"$F"'"
    ALL="'"$ALL"'"
    sleep "$D"
    if [ -n "$M" ] && [ -n "$T" ]; then
      if [ -w "/dev/$T" ] || sudo test -e "/dev/$T"; then
        printf "\\n\\n*** [SESSION TERMINATED] Time expired. Closing session now. ***\\n\\n" | sudo tee "/dev/$T" >/dev/null 2>&1 || true
      fi
    fi
    sleep 0.5
    if [ "$ALL" = "1" ] && [ -n "$U" ]; then
      if [ "$F" = "1" ]; then
        sudo pkill -KILL -u "$U" 2>/dev/null || true
      else
        sudo pkill -HUP -u "$U" 2>/dev/null || true
        sleep 0.3
        sudo pkill -KILL -u "$U" 2>/dev/null || true
      fi
      if command -v loginctl >/dev/null 2>&1; then
        sudo loginctl terminate-user "$U" 2>/dev/null || true
      fi
    else
      if [ -n "$T" ]; then
        if [ "$F" = "1" ]; then
          sudo pkill -KILL -t "$T" 2>/dev/null || true
        else
          sudo pkill -HUP -t "$T" 2>/dev/null || true
          sleep 0.3
          sudo pkill -KILL -t "$T" 2>/dev/null || true
        fi
        if [ -e "/dev/$T" ]; then
          sudo fuser -k -9 "/dev/$T" 2>/dev/null || true
        fi
        if command -v loginctl >/dev/null 2>&1; then
          S_ID=$(loginctl list-sessions --no-legend 2>/dev/null | grep "$T" | awk "{print \\$1}" | head -n 1)
          if [ -n "$S_ID" ]; then
            sudo loginctl terminate-session "$S_ID" 2>/dev/null || true
          fi
        fi
      fi
    fi
  ' >/dev/null 2>&1 &
  echo "LOGOUT_EXEC_SCHEDULED_DELAY_${delay}_DONE"
fi
`;

  await runAdaptiveSshCommand(server, script, ephemeralPassword, 12000);

  if (delay > 0) {
    return {
      success: true,
      message: `Session termination scheduled in ${delay} second(s) for ${username || cleanTty}${rawMessage ? ' with alert message delivered' : ''}.`,
    };
  }

  return {
    success: true,
    message: `Session for ${username || cleanTty} has been terminated successfully.`,
  };
}

/**
 * Fetch comprehensive security audit, password aging, login history, and connected IPs for a user
 */
export async function fetchLinuxUserSecurityDetailsSSH(
  server: RemoteServer,
  username: string,
  ephemeralPassword?: string
): Promise<LinuxUserSecurityInfo> {
  const cleanUser = username.trim();
  if (!cleanUser || !/^[a-z_][a-z0-9_-]{0,31}$/i.test(cleanUser)) {
    throw new Error('Invalid username');
  }

  const b64User = Buffer.from(cleanUser).toString('base64');
  const script = `export LC_ALL=C
U=$(echo "${b64User}" | base64 -d)

if ! id "$U" >/dev/null 2>&1; then
  echo "USER_NOT_FOUND"
  exit 1
fi

echo "---ID---"
id "$U" 2>/dev/null
echo "---PASSWD_S---"
sudo passwd -S "$U" 2>/dev/null || passwd -S "$U" 2>/dev/null || passwd --status "$U" 2>/dev/null || true
echo "---CHAGE---"
sudo chage -l "$U" 2>/dev/null || chage -l "$U" 2>/dev/null || true
echo "---LASTLOG---"
lastlog -u "$U" 2>/dev/null || true
echo "---LAST---"
last -n 35 -a -F "$U" 2>/dev/null || last -n 35 -i "$U" 2>/dev/null || last -n 35 "$U" 2>/dev/null || true
echo "---ACTIVE---"
w -h "$U" 2>/dev/null || who | grep "^$U " 2>/dev/null || true
echo "---END---"
`;

  const rawOutput = await runAdaptiveSshCommand(server, script, ephemeralPassword, 12000);

  if (rawOutput.includes('USER_NOT_FOUND')) {
    throw new Error(`User account "${cleanUser}" was not found on remote server.`);
  }

  const sections: Record<string, string[]> = {};
  let curSec = '';
  for (const line of rawOutput.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('---') && trimmed.endsWith('---')) {
      curSec = trimmed.replace(/---/g, '').trim();
      sections[curSec] = [];
    } else if (curSec) {
      sections[curSec].push(line);
    }
  }

  // Parse ID
  const idLine = (sections['ID'] || [])[0] || '';
  let uid: number | undefined;
  let gid: number | undefined;
  const groups: string[] = [];
  const uidMatch = idLine.match(/uid=(\d+)/);
  if (uidMatch) uid = parseInt(uidMatch[1], 10);
  const gidMatch = idLine.match(/gid=(\d+)/);
  if (gidMatch) gid = parseInt(gidMatch[1], 10);
  const grpsMatch = idLine.match(/groups=([^\s]+)/);
  if (grpsMatch) {
    const parts = grpsMatch[1].split(',');
    for (const p of parts) {
      const gNameMatch = p.match(/\((\w+)\)/);
      if (gNameMatch) groups.push(gNameMatch[1]);
      else groups.push(p);
    }
  }

  // Parse PASSWD_S
  const passwdLine = (sections['PASSWD_S'] || [])[0] || '';
  let isLocked = false;
  let status: 'active' | 'locked' | 'password_expired' | 'no_password' = 'active';
  if (passwdLine) {
    const pParts = passwdLine.trim().split(/\s+/);
    if (pParts.length >= 2) {
      const code = pParts[1].toUpperCase();
      if (code.includes('L')) {
        isLocked = true;
        status = 'locked';
      } else if (code.includes('NP')) {
        status = 'no_password';
      } else if (code.includes('P')) {
        status = 'active';
      }
    }
  }

  // Parse CHAGE
  const chageLines = sections['CHAGE'] || [];
  let lastPasswordChange = 'Unknown';
  let mustChangePassword = false;
  let passwordExpires = 'Never';
  let passwordInactive = 'Never';
  let accountExpires = 'Never';
  let isExpired = false;
  let daysUntilExpire: number | null = null;
  let expiryStatusText = 'Never expires';
  let minDays = 0;
  let maxDays = 99999;
  let warnDays = 7;

  for (const l of chageLines) {
    const idx = l.indexOf(':');
    if (idx < 0) continue;
    const key = l.slice(0, idx).trim().toLowerCase();
    const val = l.slice(idx + 1).trim();

    if (key.includes('last password change')) {
      lastPasswordChange = val;
      if (val.toLowerCase().includes('password must be changed') || val.toLowerCase().includes('0')) {
        mustChangePassword = true;
      }
    } else if (key.includes('password expires')) {
      passwordExpires = val;
      if (val.toLowerCase().includes('password must be changed') || val.toLowerCase().includes('expired')) {
        mustChangePassword = true;
      }
    } else if (key.includes('password inactive')) {
      passwordInactive = val;
    } else if (key.includes('account expires')) {
      accountExpires = val;
      if (val.toLowerCase() !== 'never' && val.toLowerCase() !== 'none') {
        const parsedTime = Date.parse(val);
        if (!isNaN(parsedTime)) {
          const nowTime = Date.now();
          const diffMs = parsedTime - nowTime;
          const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          daysUntilExpire = diffDays;
          if (diffDays <= 0) {
            isExpired = true;
            expiryStatusText = `Expired (${Math.abs(diffDays)} days ago)`;
          } else {
            isExpired = false;
            expiryStatusText = `${diffDays} days remaining`;
          }
        } else {
          expiryStatusText = val;
        }
      }
    } else if (key.includes('minimum number of days')) {
      minDays = parseInt(val, 10) || 0;
    } else if (key.includes('maximum number of days')) {
      maxDays = parseInt(val, 10) || 99999;
    } else if (key.includes('warning before password expires')) {
      warnDays = parseInt(val, 10) || 7;
    }
  }

  // Parse LASTLOG
  const lastlogLines = sections['LASTLOG'] || [];
  let lastLogin: { ip: string; port?: string; time: string; tty: string } | null = null;
  const uniqueIpSet = new Set<string>();

  for (const l of lastlogLines) {
    const trimmed = l.trim();
    if (!trimmed || trimmed.toLowerCase().startsWith('username')) continue;
    if (trimmed.includes('**Never logged in**')) {
      lastLogin = null;
      break;
    }
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 4) {
      const port = parts[1] || '';
      const fromIp = parts[2] || '';
      const timeStr = parts.slice(3).join(' ');
      lastLogin = {
        port,
        tty: port,
        ip: fromIp,
        time: timeStr,
      };
      if (fromIp && fromIp !== '**' && !fromIp.includes(':') && fromIp !== '-' && /^[0-9a-fA-F:.]+$/.test(fromIp)) {
        uniqueIpSet.add(fromIp);
      }
    }
  }

  // Parse LAST (login history)
  const lastLines = sections['LAST'] || [];
  const loginHistory: Array<{
    tty: string;
    ip: string;
    loginTime: string;
    logoutTime: string;
    duration: string;
    stillLoggedIn: boolean;
  }> = [];

  for (const l of lastLines) {
    const trimmed = l.trim();
    if (!trimmed || trimmed.startsWith('wtmp begins') || trimmed.startsWith('btmp begins')) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 3) continue;

    const tty = parts[1];
    const stillLoggedIn = trimmed.includes('still logged in');

    // Extract IP address from end of line (with last -a)
    let ip = parts[parts.length - 1] || '-';
    if (!/^[0-9a-fA-F:.]+|\[.*\]$/.test(ip) && parts.length >= 3) {
      if (/^[0-9a-fA-F:.]+$/.test(parts[2])) {
        ip = parts[2];
      }
    }

    ip = ip.replace(/[()]/g, '');
    if (ip && ip !== '-' && ip !== ':0' && ip !== ':0.0' && !ip.startsWith('tmux') && !ip.startsWith('screen')) {
      uniqueIpSet.add(ip);
    }

    let duration = '-';
    const durMatch = trimmed.match(/\(([^)]+)\)/);
    if (durMatch) {
      duration = durMatch[1];
    } else if (stillLoggedIn) {
      duration = 'Still logged in';
    }

    let loginTime = parts.slice(2, 6).join(' ');
    loginHistory.push({
      tty,
      ip,
      loginTime,
      logoutTime: stillLoggedIn ? 'Active' : '-',
      duration,
      stillLoggedIn,
    });
  }

  // Parse ACTIVE sessions (w -h)
  const activeLines = sections['ACTIVE'] || [];
  const activeSessions: Array<{
    tty: string;
    from: string;
    loginTime: string;
    idleTime: string;
    what: string;
  }> = [];

  for (const l of activeLines) {
    const trimmed = l.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      const tty = parts[1];
      const from = parts[2] || '-';
      const loginTime = parts[3] || '-';
      const idleTime = parts[4] || '-';
      const what = parts.slice(5).join(' ') || '-';
      activeSessions.push({
        tty,
        from: from.replace(/[()]/g, ''),
        loginTime,
        idleTime,
        what,
      });
      if (from && from !== '-' && from !== ':0') {
        uniqueIpSet.add(from.replace(/[()]/g, ''));
      }
    }
  }

  return {
    username: cleanUser,
    uid,
    gid,
    groups,
    isLocked,
    status,
    lastPasswordChange,
    mustChangePassword,
    passwordExpires,
    passwordInactive,
    accountExpires,
    isExpired,
    daysUntilExpire,
    expiryStatusText,
    minDaysBetweenChange: minDays,
    maxDaysBetweenChange: maxDays,
    warnDaysBeforeExpire: warnDays,
    lastLogin,
    loginHistory: loginHistory.slice(0, 15),
    uniqueIps: Array.from(uniqueIpSet),
    activeSessions,
  };
}

