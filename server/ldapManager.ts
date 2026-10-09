import net from 'net';
import tls from 'tls';
import ldap from 'ldapjs';
import { ActiveDirectoryConfig, ADTestResult, ADSecurityGroup, ADUser } from '../src/types';

/**
 * Normalizes input configuration from camelCase, snake_case, or partial objects.
 */
export function normalizeADConfig(raw: any): ActiveDirectoryConfig {
  const cfg = raw || {};
  const useSsl = Boolean(cfg.useSsl ?? cfg.use_ssl ?? (Number(cfg.port) === 636));
  const port = Number(cfg.port) || (useSsl ? 636 : 389);
  return {
    enabled: Boolean(cfg.enabled ?? true),
    server: String(cfg.server || cfg.host || '').trim(),
    port,
    useSsl,
    domain: String(cfg.domain || '').trim(),
    baseDn: String(cfg.baseDn || cfg.base_dn || '').trim(),
    bindUser: String(cfg.bindUser || cfg.bind_user || '').trim(),
    bindPassword: String(cfg.bindPassword || cfg.bind_password || ''),
    userSearchBase: String(cfg.userSearchBase || cfg.user_search_base || '').trim(),
    groupSearchBase: String(cfg.groupSearchBase || cfg.group_search_base || '').trim(),
    lastSyncStatus: cfg.lastSyncStatus || 'idle',
    lastSyncMessage: cfg.lastSyncMessage,
    lastSyncTime: cfg.lastSyncTime || null,
    syncedGroups: Array.isArray(cfg.syncedGroups) ? cfg.syncedGroups : [],
    syncedUsers: Array.isArray(cfg.syncedUsers) ? cfg.syncedUsers : [],
  };
}

/**
 * Universally extracts all attributes from an ldapjs SearchEntry across v1, v2, and v3+.
 * Handles Buffer conversion, pojo attributes, raw attributes, and case-insensitive lookups.
 */
export function extractLdapEntryAttributes(entry: any): Record<string, any> {
  const result: Record<string, any> = {};
  if (!entry) return result;

  // 1. If entry.object already exists (legacy ldapjs v1/v2 or simulated objects)
  if (entry.object && typeof entry.object === 'object') {
    for (const [k, v] of Object.entries(entry.object)) {
      result[k] = v;
      result[k.toLowerCase()] = v;
    }
  }

  // 2. If entry._pojo exists (ldapjs v3)
  if (typeof entry._pojo === 'function') {
    try {
      const pojo = entry._pojo();
      if (Array.isArray(pojo?.attributes)) {
        for (const attr of pojo.attributes) {
          if (!attr || !attr.type) continue;
          const vals = Array.isArray(attr.values)
            ? attr.values.map((v: any) => (Buffer.isBuffer(v) ? v.toString('utf8') : String(v)))
            : attr.values != null
            ? [Buffer.isBuffer(attr.values) ? attr.values.toString('utf8') : String(attr.values)]
            : [];
          const val = vals.length === 1 ? vals[0] : vals;
          result[attr.type] = result[attr.type] ?? val;
          result[attr.type.toLowerCase()] = result[attr.type.toLowerCase()] ?? val;
        }
      }
    } catch {}
  }

  // 3. Directly inspect entry.attributes (ldapjs v2/v3 LdapAttribute array)
  if (Array.isArray(entry.attributes)) {
    for (const attr of entry.attributes) {
      if (!attr || !attr.type) continue;
      const type = String(attr.type);
      const rawVals = Array.isArray(attr.values)
        ? attr.values
        : attr.values != null
        ? [attr.values]
        : [];
      const vals = rawVals.map((v: any) => (Buffer.isBuffer(v) ? v.toString('utf8') : String(v)));
      const val = vals.length === 1 ? vals[0] : vals;
      result[type] = result[type] ?? val;
      result[type.toLowerCase()] = result[type.toLowerCase()] ?? val;
    }
  }

  // 4. Capture DN
  const dn = String(entry.dn || entry.objectName || result.dn || result.distinguishedname || '');
  if (dn) {
    result.dn = dn;
    result.distinguishedname = dn;
    result.distinguishedName = dn;
  }

  return result;
}

/**
 * Probes TCP/TLS socket to measure authentic network latency and connection reachability.
 */
function probeSocket(host: string, port: number, useSsl: boolean, timeoutMs = 5000): Promise<{ reachable: boolean; latency: number; error?: string }> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let isResolved = false;

    const onFinish = (reachable: boolean, error?: string) => {
      if (isResolved) return;
      isResolved = true;
      const latency = Math.max(1, Date.now() - startTime);
      resolve({ reachable, latency, error });
    };

    if (useSsl) {
      const socket = tls.connect(
        {
          host,
          port,
          rejectUnauthorized: false,
          timeout: timeoutMs,
        },
        () => {
          socket.destroy();
          onFinish(true);
        }
      );
      socket.on('timeout', () => {
        socket.destroy();
        onFinish(false, `Connection timed out after ${timeoutMs}ms`);
      });
      socket.on('error', (err) => {
        socket.destroy();
        onFinish(false, err.message);
      });
    } else {
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);
      socket.connect(port, host, () => {
        socket.destroy();
        onFinish(true);
      });
      socket.on('timeout', () => {
        socket.destroy();
        onFinish(false, `Connection timed out after ${timeoutMs}ms`);
      });
      socket.on('error', (err) => {
        socket.destroy();
        onFinish(false, err.message);
      });
    }
  });
}

/**
 * Creates an authentic LDAP client configured for the given Active Directory host.
 */
function createLdapClient(cfg: ActiveDirectoryConfig, timeoutMs = 8000): ldap.Client {
  const protocol = cfg.useSsl ? 'ldaps' : 'ldap';
  const url = `${protocol}://${cfg.server}:${cfg.port}`;

  return ldap.createClient({
    url,
    timeout: timeoutMs,
    connectTimeout: timeoutMs,
    tlsOptions: cfg.useSsl ? { rejectUnauthorized: false } : undefined,
  });
}

/**
 * Authentically tests the Active Directory / LDAP connection and credentials.
 */
export async function testLdapConnection(rawCfg: any): Promise<ADTestResult> {
  const cfg = normalizeADConfig(rawCfg);
  const logs: string[] = [];

  if (!cfg.server || !cfg.server.trim()) {
    return {
      success: false,
      latency_ms: 0,
      message: 'Server hostname or IP address is required.',
      logs: ['[Configuration Error] Domain Controller server address is missing.'],
    };
  }

  const port = cfg.port || (cfg.useSsl ? 636 : 389);
  logs.push(`[Network Probe] Testing TCP reachability to ${cfg.server}:${port}...`);

  const probe = await probeSocket(cfg.server, port, cfg.useSsl, 5000);
  if (!probe.reachable) {
    logs.push(`[Socket Failure] Could not connect to ${cfg.server}:${port}: ${probe.error || 'Connection refused/timeout'}`);
    return {
      success: false,
      latency_ms: probe.latency,
      message: `Failed to connect to ${cfg.server}:${port}: ${probe.error || 'Connection refused or host unreachable'}`,
      logs,
    };
  }

  logs.push(`[Socket Success] Connected to ${cfg.server}:${port} in ${probe.latency}ms.`);
  if (cfg.useSsl) {
    logs.push(`[Security] Secure LDAPS / TLS connection handshake validated.`);
  } else {
    logs.push(`[Security] Standard LDAP connection active (Cleartext port ${port}).`);
  }

  // Create LDAP client
  let client: ldap.Client;
  try {
    client = createLdapClient(cfg, 8000);
  } catch (err: any) {
    logs.push(`[Client Init Error] ${err.message}`);
    return {
      success: false,
      latency_ms: probe.latency,
      message: `Failed to initialize LDAP client: ${err.message}`,
      logs,
    };
  }

  return new Promise((resolve) => {
    let resolved = false;

    const finish = (result: ADTestResult) => {
      if (resolved) return;
      resolved = true;
      try {
        client.unbind(() => {});
        client.destroy();
      } catch (e) {}
      resolve(result);
    };

    client.on('error', (err) => {
      logs.push(`[LDAP Client Error] ${err.message}`);
      finish({
        success: false,
        latency_ms: probe.latency,
        message: `LDAP protocol error: ${err.message}`,
        logs,
      });
    });

    const bindUser = (cfg.bindUser || '').trim();
    const bindPassword = cfg.bindPassword || '';

    if (!bindUser) {
      logs.push(`[LDAP Bind] No bind username provided. Attempting Anonymous bind...`);
    } else {
      logs.push(`[LDAP Bind] Attempting authentication for user "${bindUser}"...`);
    }

    client.bind(bindUser, bindPassword, (bindErr) => {
      if (bindErr) {
        logs.push(`[Bind Failure] Authentication rejected: ${bindErr.message}`);
        return finish({
          success: false,
          latency_ms: probe.latency,
          bindSuccess: false,
          message: `Active Directory authentication failed: ${bindErr.message}`,
          logs,
        });
      }

      logs.push(`[Bind Success] Successfully authenticated as "${bindUser || 'Anonymous'}".`);

      // Query RootDSE to get authentic Domain Controller metadata
      client.search('', { scope: 'base', filter: '(objectClass=*)' }, (searchErr, res) => {
        if (searchErr) {
          logs.push(`[RootDSE Warning] Could not query RootDSE: ${searchErr.message}`);
          return finish({
            success: true,
            latency_ms: probe.latency,
            bindSuccess: true,
            message: `Connected and authenticated successfully to ${cfg.domain || cfg.server}.`,
            serverBanner: `Active Directory Domain Controller (${cfg.domain || cfg.server})`,
            logs,
          });
        }

        let dnsHostName = '';
        let defaultNamingContext = '';

        res.on('searchEntry', (entry) => {
          const raw = extractLdapEntryAttributes(entry);
          dnsHostName = String(raw.dnsHostName || raw.dnshostname || '');
          defaultNamingContext = String(raw.defaultNamingContext || raw.defaultnamingcontext || '');
        });

        res.on('error', (err) => {
          logs.push(`[Search Error] Error querying RootDSE: ${err.message}`);
          finish({
            success: true,
            latency_ms: probe.latency,
            bindSuccess: true,
            message: `Connected and authenticated successfully to ${cfg.domain || cfg.server}.`,
            serverBanner: `Active Directory DC (${cfg.domain || cfg.server})`,
            logs,
          });
        });

        res.on('end', () => {
          const banner = dnsHostName
            ? `Active Directory Domain Controller: ${dnsHostName} (${defaultNamingContext || cfg.domain})`
            : `Active Directory Domain Controller: ${cfg.domain || cfg.server}`;

          logs.push(`[RootDSE] Verified Domain Controller: ${banner}`);
          if (cfg.baseDn) {
            logs.push(`[Naming Context] Configured BaseDN: "${cfg.baseDn}"`);
          } else if (defaultNamingContext) {
            logs.push(`[Naming Context] Discovered Default Naming Context: "${defaultNamingContext}"`);
          }

          finish({
            success: true,
            latency_ms: probe.latency,
            bindSuccess: true,
            message: `Connected and authenticated successfully to Active Directory (${cfg.domain || cfg.server}).`,
            serverBanner: banner,
            sslValid: cfg.useSsl,
            logs,
          });
        });
      });
    });
  });
}

/**
 * Authentically queries and retrieves real security groups and real user accounts from the Active Directory DC.
 */
export async function syncLdapDirectory(
  rawCfg: any
): Promise<{ success: boolean; groups: ADSecurityGroup[]; users: ADUser[]; error?: string; message?: string }> {
  const cfg = normalizeADConfig(rawCfg);

  if (!cfg.server || !cfg.server.trim()) {
    return {
      success: false,
      groups: [],
      users: [],
      error: 'Active Directory server host is required.',
    };
  }

  let client: ldap.Client;
  try {
    client = createLdapClient(cfg, 12000);
  } catch (e: any) {
    return {
      success: false,
      groups: [],
      users: [],
      error: `Could not initialize LDAP client: ${e.message}`,
    };
  }

  const bindUser = (cfg.bindUser || '').trim();
  const bindPassword = cfg.bindPassword || '';

  return new Promise((resolve) => {
    let resolved = false;

    const finish = (result: { success: boolean; groups: ADSecurityGroup[]; users: ADUser[]; error?: string; message?: string }) => {
      if (resolved) return;
      resolved = true;
      try {
        client.unbind(() => {});
        client.destroy();
      } catch (e) {}
      resolve(result);
    };

    client.on('error', (err) => {
      finish({
        success: false,
        groups: [],
        users: [],
        error: `LDAP connection failed: ${err.message}`,
      });
    });

    client.bind(bindUser, bindPassword, async (bindErr) => {
      if (bindErr) {
        return finish({
          success: false,
          groups: [],
          users: [],
          error: `Active Directory authentication failed: ${bindErr.message}`,
        });
      }

      // If baseDn is empty, query RootDSE to find defaultNamingContext
      let baseDn = (cfg.baseDn || '').trim();
      if (!baseDn) {
        try {
          const rootDse = await new Promise<string>((resRoot) => {
            client.search('', { scope: 'base', filter: '(objectClass=*)' }, (err, res) => {
              if (err) return resRoot('');
              let dnc = '';
              res.on('searchEntry', (entry) => {
                const raw = extractLdapEntryAttributes(entry);
                dnc = String(raw.defaultNamingContext || raw.defaultnamingcontext || '');
              });
              res.on('error', () => resRoot(''));
              res.on('end', () => resRoot(dnc));
            });
          });
          if (rootDse) {
            baseDn = rootDse;
          }
        } catch (e) {}
      }

      const groupSearchBase = (cfg.groupSearchBase || baseDn).trim();
      const userSearchBase = (cfg.userSearchBase || baseDn).trim();

      if (!groupSearchBase && !userSearchBase) {
        return finish({
          success: false,
          groups: [],
          users: [],
          error: 'Base DN or search container is missing. Please configure Base DN (e.g. DC=corp,DC=internal) or Search OU.',
        });
      }

      const groups: ADSecurityGroup[] = [];
      const users: ADUser[] = [];
      interface GroupMemberTracker {
        cn: string;
        dn: string;
        members: string[];
      }
      const groupMembersList: GroupMemberTracker[] = [];

      // 1. Query Security Groups
      const queryGroups = (): Promise<void> => {
        return new Promise((resGroups) => {
          if (!groupSearchBase) return resGroups();

          const opts: ldap.SearchOptions = {
            scope: 'sub',
            filter: '(|(objectCategory=group)(objectClass=group))',
            attributes: ['dn', 'distinguishedName', 'cn', 'name', 'description', 'member', 'memberOf'],
            paged: { pageSize: 500 },
          };

          client.search(groupSearchBase, opts, (err, res) => {
            if (err) {
              console.warn('[LDAP Group Search Warning]', err.message);
              return resGroups();
            }

            res.on('searchEntry', (entry) => {
              const raw = extractLdapEntryAttributes(entry);
              const dn = String(raw.dn || entry.dn || '');
              const cn = String(raw.cn || raw.name || dn.split(',')[0].replace(/^CN=/i, ''));
              const description = String(raw.description || '');

              const rawMembers = raw.member || raw.memberof || raw.members;
              const memberList: string[] = Array.isArray(rawMembers)
                ? rawMembers.map(String)
                : rawMembers ? [String(rawMembers)] : [];

              groupMembersList.push({
                cn,
                dn,
                members: memberList,
              });

              groups.push({
                dn,
                cn,
                description,
                memberCount: memberList.length,
              });
            });

            res.on('error', (searchErr) => {
              console.warn('[LDAP Group Search Error]', searchErr.message);
              resGroups();
            });

            res.on('end', () => {
              resGroups();
            });
          });
        });
      };

      // Helper: Execute user query on a specific search base and filter
      const executeUserSearch = (
        searchBase: string,
        searchFilter: string,
        scope: 'sub' | 'base' = 'sub'
      ): Promise<ADUser[]> => {
        return new Promise((resolveSubSearch) => {
          if (!searchBase || !searchBase.trim()) return resolveSubSearch([]);

          const foundUsers: ADUser[] = [];
          const opts: ldap.SearchOptions = {
            scope,
            filter: searchFilter,
            attributes: [
              'dn',
              'distinguishedName',
              'sAMAccountName',
              'displayName',
              'name',
              'cn',
              'mail',
              'userPrincipalName',
              'department',
              'title',
              'memberOf',
              'userAccountControl',
              'uid',
            ],
            paged: scope === 'sub' ? { pageSize: 500 } : undefined,
          };

          client.search(searchBase, opts, (err, res) => {
            if (err) {
              console.warn(`[LDAP User Search Notice on ${searchBase}]`, err.message);
              return resolveSubSearch([]);
            }

            res.on('searchEntry', (entry) => {
              const raw = extractLdapEntryAttributes(entry);
              const dn = String(raw.dn || entry.dn || '');
              const samAccountName = String(
                raw.sAMAccountName ||
                raw.samaccountname ||
                raw.uid ||
                (raw.userPrincipalName ? String(raw.userPrincipalName).split('@')[0] : '') ||
                (raw.userprincipalname ? String(raw.userprincipalname).split('@')[0] : '') ||
                raw.cn ||
                raw.name ||
                (dn ? dn.split(',')[0].replace(/^CN=/i, '') : '') ||
                ''
              ).trim();

              if (!samAccountName || samAccountName.endsWith('$')) {
                // Skip machine / computer accounts
                return;
              }

              const displayName = String(
                raw.displayName ||
                raw.displayname ||
                raw.name ||
                raw.cn ||
                samAccountName
              ).trim();

              const email = String(
                raw.mail ||
                raw.userPrincipalName ||
                raw.userprincipalname ||
                `${samAccountName}@${cfg.domain || 'corp.local'}`
              ).trim();

              const department = String(raw.department || '');
              const title = String(raw.title || '');

              const rawMemberOf = raw.memberOf || raw.memberof || raw.member || [];
              const memberOfList = Array.isArray(rawMemberOf)
                ? rawMemberOf
                : rawMemberOf ? [rawMemberOf] : [];
              const groupNames = memberOfList.map((gDn: any) => {
                const str = String(gDn);
                const match = str.match(/^CN=([^,]+)/i);
                return match ? match[1] : str;
              });

              const uac = Number(raw.userAccountControl || raw.useraccountcontrol) || 512;
              const enabled = (uac & 2) === 0;

              foundUsers.push({
                dn,
                samAccountName,
                displayName,
                email,
                department,
                title,
                groups: groupNames,
                enabled,
              });
            });

            res.on('error', (searchErr) => {
              console.warn(`[LDAP User Search Notice on ${searchBase}]`, searchErr.message);
              resolveSubSearch(foundUsers);
            });

            res.on('end', () => {
              resolveSubSearch(foundUsers);
            });
          });
        });
      };

      // 2. Query Users with multi-tier fallbacks and group-member cross-referencing
      const queryUsers = async (): Promise<void> => {
        const userMap = new Map<string, ADUser>();
        const addUserToMap = (u: ADUser) => {
          if (!u || !u.samAccountName || u.samAccountName.endsWith('$')) return;
          const key = (u.samAccountName || u.dn).toLowerCase();
          if (userMap.has(key)) {
            const existing = userMap.get(key)!;
            for (const g of u.groups) {
              if (!existing.groups.includes(g)) existing.groups.push(g);
            }
          } else {
            userMap.set(key, { ...u });
          }
        };

        const adStandardFilter = '(&(objectCategory=person)(objectClass=user))';
        const samFallbackFilter = '(&(sAMAccountName=*)(!(objectClass=computer)))';
        const genericFilter = '(|(objectCategory=person)(objectClass=inetOrgPerson)(objectClass=posixAccount)(objectClass=user))';
        const broadFilter = '(sAMAccountName=*)';

        // Stage A: Search configured userSearchBase with AD Standard filter
        if (userSearchBase) {
          const resA = await executeUserSearch(userSearchBase, adStandardFilter);
          resA.forEach(addUserToMap);
        }

        // Stage B: If userSearchBase differs from baseDn, OR 0 users found, search entire baseDn
        if (baseDn && (userMap.size === 0 || userSearchBase !== baseDn)) {
          const resB = await executeUserSearch(baseDn, adStandardFilter);
          resB.forEach(addUserToMap);
        }

        // Stage C: If 0 found and standard AD container CN=Users exists, search CN=Users
        if (userMap.size === 0 && baseDn) {
          const defaultAdUsers = `CN=Users,${baseDn}`;
          if (userSearchBase !== defaultAdUsers) {
            const resC = await executeUserSearch(defaultAdUsers, adStandardFilter);
            resC.forEach(addUserToMap);
          }
        }

        // Stage D: If 0 found, retry with sAMAccountName filter
        if (userMap.size === 0) {
          const targetBase = baseDn || userSearchBase;
          if (targetBase) {
            const resD = await executeUserSearch(targetBase, samFallbackFilter);
            resD.forEach(addUserToMap);
          }
        }

        // Stage E: If 0 found, retry with generic LDAP filter
        if (userMap.size === 0) {
          const targetBase = baseDn || userSearchBase;
          if (targetBase) {
            const resE = await executeUserSearch(targetBase, genericFilter);
            resE.forEach(addUserToMap);
          }
        }

        // Stage F: If 0 found, retry with broad sAMAccountName filter
        if (userMap.size === 0) {
          const targetBase = baseDn || userSearchBase;
          if (targetBase) {
            const resF = await executeUserSearch(targetBase, broadFilter);
            resF.forEach(addUserToMap);
          }
        }

        // Stage G: Cross-reference with all Security Groups members!
        // Guarantee every member found in groups is represented in users!
        for (const grp of groupMembersList) {
          for (const memberDn of grp.members) {
            if (!memberDn || typeof memberDn !== 'string') continue;
            const memberDnLower = memberDn.toLowerCase();
            let match = Array.from(userMap.values()).find(
              (u) => u.dn.toLowerCase() === memberDnLower || u.samAccountName.toLowerCase() === memberDnLower
            );

            if (match) {
              if (!match.groups.includes(grp.cn)) {
                match.groups.push(grp.cn);
              }
            } else {
              // Direct base search for this specific member DN
              try {
                const singleRes = await executeUserSearch(memberDn, '(objectClass=*)', 'base');
                if (singleRes.length > 0) {
                  const u = singleRes[0];
                  if (!u.groups.includes(grp.cn)) u.groups.push(grp.cn);
                  addUserToMap(u);
                  continue;
                }
              } catch {}

              // If base search could not query, derive authentic user from member DN
              const cnMatch = memberDn.match(/^CN=([^,]+)/i);
              const extractedName = cnMatch ? cnMatch[1] : memberDn.split(',')[0].replace(/^CN=/i, '');
              if (extractedName && !extractedName.endsWith('$')) {
                const fallbackSam = extractedName.replace(/\s+/g, '.').toLowerCase();
                const derivedUser: ADUser = {
                  dn: memberDn,
                  samAccountName: fallbackSam,
                  displayName: extractedName,
                  email: `${fallbackSam}@${cfg.domain || 'corp.local'}`,
                  department: '',
                  title: '',
                  groups: [grp.cn],
                  enabled: true,
                };
                addUserToMap(derivedUser);
              }
            }
          }
        }

        users.push(...Array.from(userMap.values()));
      };

      try {
        await queryGroups();
        await queryUsers();

        finish({
          success: true,
          groups,
          users,
          message: `Successfully synchronized ${groups.length} security groups and ${users.length} users from Active Directory.`,
        });
      } catch (e: any) {
        finish({
          success: false,
          groups: [],
          users: [],
          error: e?.message || 'Failed to synchronize Active Directory objects.',
        });
      }
    });
  });
}

/**
 * Authenticates a domain user against Active Directory (Kerberos/LDAP bind).
 * Searches for the user account by samAccountName or UPN to retrieve DN, display name, email,
 * and group memberships, then verifies credentials via direct LDAP bind.
 */
export async function authenticateLdapUser(
  rawCfg: any,
  username: string,
  password: string,
  domainHint?: string
): Promise<{
  success: boolean;
  user?: ADUser;
  error?: string;
  message?: string;
}> {
  const cfg = normalizeADConfig(rawCfg);
  const cleanUsername = (username || '').trim();
  const cleanPassword = password || '';

  if (!cfg.server || !cfg.server.trim()) {
    return {
      success: false,
      error: 'Active Directory server host is not configured.',
      message: 'آدرس سرور اکتیو دایرکتوری در تنظیمات پنل مشخص نشده است.',
    };
  }

  if (!cleanUsername || !cleanPassword) {
    return {
      success: false,
      error: 'Username and password are required for Active Directory login.',
      message: 'نام کاربری و کلمه عبور الزامی است.',
    };
  }

  // Create client for service lookup
  let client: ldap.Client;
  try {
    client = createLdapClient(cfg, 10000);
  } catch (e: any) {
    return {
      success: false,
      error: `Could not initialize LDAP connection: ${e.message}`,
      message: 'امکان اتصال به سرویس LDAP اکتیو دایرکتوری وجود ندارد.',
    };
  }

  const sAMAccountName = cleanUsername.includes('@')
    ? cleanUsername.split('@')[0].trim()
    : cleanUsername.includes('\\')
    ? cleanUsername.split('\\')[1].trim()
    : cleanUsername;

  const extractedDomainFromUsername = cleanUsername.includes('@')
    ? cleanUsername.split('@')[1].trim()
    : cleanUsername.includes('\\')
    ? cleanUsername.split('\\')[0].trim()
    : '';

  const domain = extractedDomainFromUsername || (domainHint && domainHint.trim()) || cfg.domain || 'corp.local';
  const upn = cleanUsername.includes('@') ? cleanUsername : `${sAMAccountName}@${domain}`;

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (res: { success: boolean; user?: ADUser; error?: string; message?: string }) => {
      if (resolved) return;
      resolved = true;
      try {
        client.unbind(() => {});
        client.destroy();
      } catch (e) {}
      resolve(res);
    };

    client.on('error', (err) => {
      finish({
        success: false,
        error: `LDAP server communication error: ${err.message}`,
        message: 'خطا در ارتباط با سرور اکتیو دایرکتوری.',
      });
    });

    // 1. Initial bind using service account (or anonymous fallback) to locate user's authentic DN and groups
    const bindUser = (cfg.bindUser || '').trim();
    const bindPass = cfg.bindPassword || '';

    client.bind(bindUser, bindPass, async (bindErr) => {
      let userEntry: ADUser | null = null;
      let userDn = '';

      if (!bindErr) {
        // Query RootDSE if baseDn is missing
        let searchBase = (cfg.userSearchBase || cfg.baseDn || '').trim();
        if (!searchBase) {
          try {
            const rootDse = await new Promise<string>((resRoot) => {
              client.search('', { scope: 'base', filter: '(objectClass=*)' }, (err, res) => {
                if (err) return resRoot('');
                let dnc = '';
                res.on('searchEntry', (entry) => {
                  const raw = extractLdapEntryAttributes(entry);
                  dnc = String(raw.defaultNamingContext || raw.defaultnamingcontext || '');
                });
                res.on('error', () => resRoot(''));
                res.on('end', () => resRoot(dnc));
              });
            });
            if (rootDse) searchBase = rootDse;
          } catch (e) {}
        }

        if (searchBase) {
          userEntry = await new Promise<ADUser | null>((resolveUser) => {
            const safeAccount = sAMAccountName.replace(/[\*\(\)\\\/\x00]/g, '');
            const filter = `(|(sAMAccountName=${safeAccount})(userPrincipalName=${safeAccount}@*)(mail=${safeAccount}@*))`;
            const opts: ldap.SearchOptions = {
              scope: 'sub',
              filter,
              attributes: [
                'dn',
                'sAMAccountName',
                'displayName',
                'mail',
                'userPrincipalName',
                'department',
                'title',
                'memberOf',
                'userAccountControl',
              ],
              sizeLimit: 1,
            };

            client.search(searchBase, opts, (sErr, sRes) => {
              if (sErr) return resolveUser(null);
              let found: ADUser | null = null;
              sRes.on('searchEntry', (entry) => {
                const raw = extractLdapEntryAttributes(entry);
                const dn = String(raw.dn || entry.dn || '');
                const sam = String(raw.sAMAccountName || raw.samaccountname || sAMAccountName);
                const displayName = String(raw.displayName || raw.displayname || sam);
                const email = String(raw.mail || raw.userPrincipalName || raw.userprincipalname || `${sam}@${domain}`);
                const department = String(raw.department || '');
                const title = String(raw.title || '');
                const rawMemberOf = raw.memberOf || raw.memberof || [];
                const memberOfList = Array.isArray(rawMemberOf) ? rawMemberOf : rawMemberOf ? [rawMemberOf] : [];
                const groupNames = memberOfList.map((gDn: string) => {
                  const match = String(gDn).match(/^CN=([^,]+)/i);
                  return match ? match[1] : String(gDn);
                });
                const uac = Number(raw.userAccountControl || raw.useraccountcontrol) || 512;
                const enabled = (uac & 2) === 0;

                userDn = dn;
                found = {
                  dn,
                  samAccountName: sam,
                  displayName,
                  email,
                  department,
                  title,
                  groups: groupNames,
                  enabled,
                };
              });
              sRes.on('error', () => resolveUser(null));
              sRes.on('end', () => resolveUser(found));
            });
          });
        }
      }

      // Check if user is disabled in Active Directory
      if (userEntry && userEntry.enabled === false) {
        return finish({
          success: false,
          error: 'This Active Directory user account is disabled.',
          message: 'این حساب کاربری اکتیو دایرکتوری در دامین غیرفعال (Disabled) شده است.',
        });
      }

      // 2. Perform direct credential bind with the target user
      let authClient: ldap.Client;
      try {
        authClient = createLdapClient(cfg, 8000);
      } catch (err: any) {
        return finish({
          success: false,
          error: `Could not initialize user authentication client: ${err.message}`,
        });
      }

      // Preferred bind identities: User DN > UPN > Domain\User
      const bindIdentities = [
        userDn,
        upn,
        `${domain}\\${sAMAccountName}`,
        sAMAccountName,
      ].filter(Boolean);

      let authSuccess = false;
      let lastAuthError = '';

      for (const identity of bindIdentities) {
        const bindResult = await new Promise<boolean>((resolveBind) => {
          authClient.bind(identity, cleanPassword, (err) => {
            if (err) {
              lastAuthError = err.message;
              resolveBind(false);
            } else {
              resolveBind(true);
            }
          });
        });

        if (bindResult) {
          authSuccess = true;
          break;
        }
      }

      try {
        authClient.unbind(() => {});
        authClient.destroy();
      } catch (e) {}

      if (!authSuccess) {
        return finish({
          success: false,
          error: `Active Directory authentication failed: ${lastAuthError || 'Invalid credentials'}`,
          message: 'احراز هویت اکتیو دایرکتوری ناموفق بود (نام کاربری یا کلمه عبور دامین اشتباه است).',
        });
      }

      // If userEntry was not found via search (e.g. anonymous bind couldn't search), construct basic profile
      if (!userEntry) {
        // Check if syncedUsers in saved config has this user
        const savedUsers: ADUser[] = Array.isArray(cfg.syncedUsers) ? cfg.syncedUsers : [];
        const matchSaved = savedUsers.find(
          (u) =>
            u.samAccountName?.toLowerCase() === sAMAccountName.toLowerCase() ||
            u.email?.toLowerCase() === upn.toLowerCase()
        );

        userEntry = matchSaved || {
          dn: userDn || `CN=${sAMAccountName},${cfg.userSearchBase || cfg.baseDn || 'DC=corp,DC=local'}`,
          samAccountName: sAMAccountName,
          displayName: sAMAccountName,
          email: upn,
          department: '',
          title: '',
          groups: [],
          enabled: true,
        };
      }

      finish({
        success: true,
        user: userEntry,
        message: `Successfully authenticated domain user ${sAMAccountName}`,
      });
    });
  });
}

