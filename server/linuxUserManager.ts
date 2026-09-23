import { RemoteServer, LinuxSystemUser, LinuxLoggedInUser, LinuxSystemGroup } from '../src/types';
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
sudo -n cut -d: -f1,2 /etc/shadow 2>/dev/null || cut -d: -f1,2 /etc/shadow 2>/dev/null || true
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

  // 3. Parse shadow statuses for locked accounts
  const shadowLines = sections['SHADOW_STATUS'] || [];
  const lockedUsers = new Set<string>();
  for (const rawLine of shadowLines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(':');
    if (parts.length >= 2) {
      const uname = parts[0];
      const passField = parts[1];
      // In /etc/shadow, '!', '*', '!*', '!!' or starting with '!' means account is locked or disabled
      if (passField.startsWith('!') || passField.startsWith('*') || passField === '!' || passField === '*') {
        lockedUsers.add(uname);
      }
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

  // Base64 encode all strings to prevent quoting / special characters shell injection
  const b64User = Buffer.from(username).toString('base64');
  const b64Home = Buffer.from(homeDir).toString('base64');
  const b64Shell = Buffer.from(shell).toString('base64');
  const b64Comment = Buffer.from(comment).toString('base64');
  const b64Groups = Buffer.from(groupsList).toString('base64');
  const b64Pass = params.password ? Buffer.from(params.password).toString('base64') : '';

  const script = `export LC_ALL=C
U=$(echo "${b64User}" | base64 -d)
H=$(echo "${b64Home}" | base64 -d)
S=$(echo "${b64Shell}" | base64 -d)
C=$(echo "${b64Comment}" | base64 -d)
G=$(echo "${b64Groups}" | base64 -d)

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
  ephemeralPassword?: string
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

if echo "$U:$P" | sudo chpasswd 2>/dev/null; then
  echo "PASSWD_SUCCESS"
  exit 0
fi

if (echo "$P"; echo "$P") | sudo passwd "$U" >/dev/null 2>&1; then
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
    message: `Password for user "${cleanUser}" has been updated successfully.`,
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

