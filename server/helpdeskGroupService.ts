import ldap from 'ldapjs';
import { getActiveDirectoryConfig, HelpdeskExceptionRecord, listHelpdeskExceptionsFromDb } from './db';
import {
  executeHelpdeskPowerShell,
  HelpdeskProtocol,
  matchAdGroupPatternList,
  matchUserPatternList,
} from './helpdeskService';
import {
  ActiveLdapSession,
  HelpdeskAdPolicyContext,
  LdapTransportProtocol,
  adGeneralizedTimeToIso,
  dedupeStrings,
  discoverDcHostsWithPdc,
  dnToDomainName,
  escapeLdapFilterValue,
  extractCnFromDn,
  extractOuBreadcrumb,
  getAllAttrs,
  getFirstAttr,
  ldapSearchEntries,
  openAuthenticatedLdapSession,
  parseBinaryGuid,
  parseBinarySid,
  splitUsernameParts,
  validateSafeHostOrIp,
} from './helpdeskUserService';

// ============================================================================
// 1. TYPES & INTERFACES
// ============================================================================

export interface HelpdeskGroupSearchInput {
  query?: string;
  adminUsername: string;
  adminPassword: string;
  domainController?: string;
  ldapProtocol?: LdapTransportProtocol;
  limit?: number;
}

export interface HelpdeskGroupInspectInput {
  targetGroup: string;
  adminUsername: string;
  adminPassword: string;
  domainController?: string;
  ldapProtocol?: LdapTransportProtocol;
  winrmProtocol?: HelpdeskProtocol;
}

export interface HelpdeskGroupMemberActionInput extends HelpdeskGroupInspectInput {
  action: 'add_member' | 'remove_member';
  memberIdentifier: string;
}

export type AdGroupScope = 'Global' | 'DomainLocal' | 'Universal' | 'BuiltinLocal' | 'Unknown';
export type AdGroupCategory = 'Security' | 'Distribution';

export interface HelpdeskGroupSearchHit {
  cn: string;
  samAccountName: string;
  displayName: string;
  distinguishedName: string;
  organizationalUnit: string;
  description: string;
  mail: string;
  groupScope: AdGroupScope;
  groupCategory: AdGroupCategory;
  isPrivileged: boolean;
  adminCount: boolean;
  memberCountEstimate: number;
  whenCreated: string | null;
}

export interface HelpdeskGroupMemberEntry {
  dn: string;
  cn: string;
  samAccountName: string;
  displayName: string;
  objectType: 'user' | 'group' | 'computer' | 'contact' | 'foreign_principal' | 'unknown';
  department: string;
  jobTitle: string;
  description: string;
  email: string;
  organizationalUnit: string;
  accountEnabled: boolean | null;
  accountLocked: boolean | null;
  isPrimaryGroupMember?: boolean;
  nestedScope?: AdGroupScope;
  nestedCategory?: AdGroupCategory;
  isInherited?: boolean;
  viaGroupCn?: string;
  viaGroupDn?: string;
}

export interface HelpdeskGroupParentEntry {
  cn: string;
  samAccountName: string;
  dn: string;
  ou: string;
  groupScope: AdGroupScope;
  groupCategory: AdGroupCategory;
  isPrivileged: boolean;
  isDirect: boolean;
  description: string;
}

export interface HelpdeskGroupPermissionInsight {
  id: string;
  category:
    | 'privileged_role'
    | 'inherited_role'
    | 'admin_sd_holder'
    | 'gpo_target'
    | 'password_policy'
    | 'mail_exchange'
    | 'delegation'
    | 'scope_rule';
  severity: 'critical' | 'high' | 'medium' | 'info';
  titleEn: string;
  titleFa: string;
  summaryEn: string;
  summaryFa: string;
  howItWorksEn: string;
  howItWorksFa: string;
  sourceLabel?: string;
}

export interface HelpdeskGroupAclEntry {
  trustee: string;
  trusteeSid: string;
  accessType: 'Allow' | 'Deny';
  rightsLabelEn: string;
  rightsLabelFa: string;
  scopeNoteEn: string;
  scopeNoteFa: string;
  isInherited: boolean;
  isPrivilegeWrite: boolean;
}

export interface HelpdeskGroupGpoLink {
  gpoName: string;
  gpoId: string;
  gpoStatus: string;
  permissionLevel: string;
  linkedOus: string[];
}

export interface HelpdeskGroupAuditEvent {
  eventId: number;
  eventType: 'created' | 'member_added' | 'member_removed' | 'group_changed' | 'deleted';
  timestamp: string;
  dcHost: string;
  actor: string;
  targetMember?: string;
  summaryEn: string;
  summaryFa: string;
}

export interface HelpdeskGroupInspectionResult {
  found: boolean;
  collectedAt: string;
  queryTarget: string;
  connectionInfo: {
    method: 'ldaps' | 'ldap' | 'winrm_adsi';
    domainController: string;
    port: number;
    domainName: string;
    baseDn: string;
    pdcEmulator?: string;
  };
  identity: {
    cn: string;
    samAccountName: string;
    displayName: string;
    description: string;
    notes: string;
    distinguishedName: string;
    organizationalUnit: string;
    ouSegments: string[];
    domainName: string;
    objectSid: string;
    objectGuid: string;
    groupTypeRaw: number;
    groupScope: AdGroupScope;
    groupCategory: AdGroupCategory;
    primaryGroupToken: number | null;
    adminCount: boolean;
    isBuiltinCritical: boolean;
    isPrivileged: boolean;
    privilegeLevel: 'critical' | 'elevated' | 'standard' | 'distribution';
  };
  lifecycleAndOwnership: {
    whenCreated: string | null;
    whenChanged: string | null;
    createdAgeDays: number | null;
    usnCreated: string;
    objectOwner: string;
    objectOwnerSid: string;
    creatorAccount: string;
    creatorTimestamp: string | null;
    creatorDc: string;
    creatorSource: 'security_event_log' | 'ad_owner_fallback' | 'unavailable';
    creatorNoteEn: string;
    creatorNoteFa: string;
    managedBy: {
      dn: string;
      cn: string;
      samAccountName: string;
      displayName: string;
      department: string;
      jobTitle: string;
      email: string;
      ou: string;
    } | null;
    managerCanUpdateMembershipList: boolean | null;
  };
  mailAndExchange: {
    isMailEnabled: boolean;
    primaryEmail: string;
    mailNickname: string;
    emailAliases: Array<{ address: string; protocol: string; isPrimary: boolean }>;
    requireSenderAuthentication: boolean | null;
    hideFromAddressLists: boolean | null;
    deliveryRestrictionNoteEn: string;
    deliveryRestrictionNoteFa: string;
  };
  membershipSummary: {
    totalDirectMembers: number;
    totalPrimaryGroupMembers: number;
    totalInheritedUsers: number;
    directUsersCount: number;
    directGroupsCount: number;
    directComputersCount: number;
    directContactsCount: number;
    disabledMembersCount: number;
    lockedMembersCount: number;
    membersTruncated: boolean;
    primaryMembersTruncated: boolean;
    inheritedTruncated: boolean;
  };
  directMembers: HelpdeskGroupMemberEntry[];
  primaryGroupMembers: HelpdeskGroupMemberEntry[];
  nestedChildGroups: HelpdeskGroupMemberEntry[];
  effectiveInheritedMembers: HelpdeskGroupMemberEntry[];
  parentGroups: HelpdeskGroupParentEntry[];
  permissions: {
    plainSummaryEn: string;
    plainSummaryFa: string;
    insights: HelpdeskGroupPermissionInsight[];
    linkedGpos: HelpdeskGroupGpoLink[];
    appliedPasswordPolicies: Array<{
      name: string;
      precedence: number | null;
      minLength: number | null;
      lockoutThreshold: number | null;
      maxPasswordAgeDays: number | null;
    }>;
    aclEntries: HelpdeskGroupAclEntry[];
    aclSource: 'ldap_sd' | 'winrm_acl' | 'unavailable';
  };
  auditEventsStatus: 'available' | 'empty' | 'unavailable';
  auditEventsNoteEn: string;
  auditEventsNoteFa: string;
  auditEvents: HelpdeskGroupAuditEvent[];
}

export interface HelpdeskGroupMemberActionResult {
  success: boolean;
  action: 'add_member' | 'remove_member';
  groupSamAccountName: string;
  groupCn: string;
  groupDn: string;
  memberSamAccountName: string;
  memberDisplayName: string;
  memberDn: string;
  domainController: string;
  methodUsed: 'ldaps_modify' | 'ldap_modify' | 'winrm_adsi';
  message: string;
  messageFa: string;
  executedAt: string;
}

// ============================================================================
// 2. VALIDATION, WELL-KNOWN RIDS & AD HELPERS
// ============================================================================

export function sanitizeAndValidateTargetGroup(raw: string): string {
  const clean = String(raw || '').trim();
  if (!clean) {
    throw new Error('Target group name or Distinguished Name is required.');
  }
  if (clean.length > 512 || /[\r\n\0]/.test(clean)) {
    throw new Error('Invalid target group name: forbidden control characters or exceeds 512 characters.');
  }
  return clean;
}

export function decodeGroupType(rawVal: string | number): {
  groupTypeRaw: number;
  groupScope: AdGroupScope;
  groupCategory: AdGroupCategory;
} {
  const rawNum = Number(rawVal || 0) | 0; // force signed 32-bit int
  const unsigned = rawNum >>> 0;
  const isSecurity = (unsigned & 0x80000000) !== 0;
  const groupCategory: AdGroupCategory = isSecurity ? 'Security' : 'Distribution';
  let groupScope: AdGroupScope = 'Unknown';
  if ((unsigned & 0x00000001) !== 0) {
    groupScope = 'BuiltinLocal';
  } else if ((unsigned & 0x00000002) !== 0) {
    groupScope = 'Global';
  } else if ((unsigned & 0x00000004) !== 0) {
    groupScope = 'DomainLocal';
  } else if ((unsigned & 0x00000008) !== 0) {
    groupScope = 'Universal';
  }
  return { groupTypeRaw: rawNum, groupScope, groupCategory };
}

function getSidRid(sid: string): string {
  const parts = String(sid || '').split('-');
  return parts.length >= 4 ? parts[parts.length - 1] : '';
}

function encodeSidHexFilter(sidStr: string): string | null {
  const m = String(sidStr || '').trim().match(/^S-(\d+)-(\d+)((?:-\d+)*)$/i);
  if (!m) return null;
  try {
    const rev = Number(m[1]);
    const auth = BigInt(m[2]);
    const subs = m[3]
      ? m[3]
          .split('-')
          .filter(Boolean)
          .map((s) => Number(s))
      : [];
    const buf = Buffer.alloc(8 + subs.length * 4);
    buf.writeUInt8(rev, 0);
    buf.writeUInt8(subs.length, 1);
    let tmp = auth;
    for (let i = 7; i >= 2; i--) {
      buf.writeUInt8(Number(tmp & 0xffn), i);
      tmp >>= 8n;
    }
    subs.forEach((sub, idx) => {
      buf.writeUInt32LE(sub >>> 0, 8 + idx * 4);
    });
    return Array.from(buf)
      .map((b) => `\\${b.toString(16).padStart(2, '0')}`)
      .join('');
  } catch {
    return null;
  }
}

const WELL_KNOWN_SIDS: Record<string, string> = {
  'S-1-1-0': 'Everyone',
  'S-1-5-7': 'Anonymous Logon',
  'S-1-5-10': 'NT AUTHORITY\\SELF',
  'S-1-5-11': 'NT AUTHORITY\\Authenticated Users',
  'S-1-5-18': 'NT AUTHORITY\\SYSTEM',
  'S-1-5-19': 'NT AUTHORITY\\LOCAL SERVICE',
  'S-1-5-20': 'NT AUTHORITY\\NETWORK SERVICE',
  'S-1-5-9': 'NT AUTHORITY\\ENTERPRISE DOMAIN CONTROLLERS',
  'S-1-5-32-544': 'BUILTIN\\Administrators',
  'S-1-5-32-545': 'BUILTIN\\Users',
  'S-1-5-32-546': 'BUILTIN\\Guests',
  'S-1-5-32-548': 'BUILTIN\\Account Operators',
  'S-1-5-32-549': 'BUILTIN\\Server Operators',
  'S-1-5-32-550': 'BUILTIN\\Print Operators',
  'S-1-5-32-551': 'BUILTIN\\Backup Operators',
  'S-1-5-32-552': 'BUILTIN\\Replicator',
  'S-1-5-32-554': 'BUILTIN\\Pre-Windows 2000 Compatible Access',
  'S-1-5-32-555': 'BUILTIN\\Remote Desktop Users',
  'S-1-5-32-556': 'BUILTIN\\Network Configuration Operators',
  'S-1-5-32-562': 'BUILTIN\\Distributed COM Users',
  'S-1-5-32-578': 'BUILTIN\\Hyper-V Administrators',
  'S-1-5-32-580': 'BUILTIN\\Remote Management Users',
};

interface KnownAdRoleProfile {
  severity: 'critical' | 'high' | 'medium';
  titleEn: string;
  titleFa: string;
  summaryEn: string;
  summaryFa: string;
  howEn: string;
  howFa: string;
}

const WELL_KNOWN_PRIVILEGED_ROLES: Record<string, KnownAdRoleProfile> = {
  '512': {
    severity: 'critical',
    titleEn: 'Domain Admins (Full Control Over Entire AD Domain)',
    titleFa: 'ادمین‌های اصلی دامین (Domain Admins — دسترسی کامل به کل دامین)',
    summaryEn:
      'Members have full administrative control over all Domain Controllers, users, groups, GPOs, and domain-joined servers/workstations.',
    summaryFa:
      'اعضای این گروه کنترل کامل و بدون محدودیت بر تمام دامین کنترلرها، کاربران، گروه‌ها، GPOها و تمامی کامپیوترهای عضو دامین دارند.',
    howEn:
      'Automatically placed inside the Local Administrators group of every domain-joined PC and protected by AdminSDHolder every 60 minutes.',
    howFa:
      'به صورت خودکار در گروه Administrators محلی تمامی سیستم‌های عضو دامین قرار می‌گیرد و هر ۶۰ دقیقه توسط AdminSDHolder محافظت می‌شود.',
  },
  '519': {
    severity: 'critical',
    titleEn: 'Enterprise Admins (Forest-Wide Super Privileges)',
    titleFa: 'ادمین‌های فارست (Enterprise Admins — بالاترین سطح اختیارات کل ساختار)',
    summaryEn:
      'Grants complete administrative control across all domains in the entire Active Directory Forest, including domain trusts and forest configuration.',
    summaryFa:
      'دسترسی مدیریتی مطلق روی تمام دامین‌های یک Forest اکتیو دایرکتوری، شامل مدیریت Trustها، AD Sites و تنظیمات کل سازمان.',
    howEn: 'Exists in the forest root domain and automatically receives Administrators privileges in every child domain.',
    howFa: 'در دامین ریشه تعریف می‌شود و در تمامی دامین‌های زیرمجموعه (Child Domains) نیز اختیارات کامل دارد.',
  },
  '518': {
    severity: 'critical',
    titleEn: 'Schema Admins (Modify Active Directory Blueprint)',
    titleFa: 'ادمین‌های اسکیما (Schema Admins — تغییر ساختار پایگاه داده AD)',
    summaryEn:
      'Members can permanently extend or modify Active Directory object classes and attributes across the entire Forest (e.g., Exchange/SCCM schema prep).',
    summaryFa:
      'اعضا می‌توانند ساختار کلاس‌ها و فیلدهای پایگاه داده Active Directory را در کل فارست تغییر دهند (تغییرات غیرقابل حذف).',
    howEn: 'Best practice is keeping this group empty except temporarily during schema upgrades.',
    howFa: 'بر اساس استاندارد امنیتی، این گروه در شرایط عادی باید خالی بماند و فقط هنگام ارتقا عضو موقت بگیرد.',
  },
  '544': {
    severity: 'critical',
    titleEn: 'BUILTIN Administrators (Full Domain Controller & AD Authority)',
    titleFa: 'گروه Administrators داخلی (کنترل کامل روی دامین کنترلرها)',
    summaryEn:
      'Members have full local and Active Directory control on Domain Controllers and can delegate or seize almost any domain privilege.',
    summaryFa:
      'اعضای این گروه اختیار کامل مدیریتی بر روی دامین کنترلرها (DC) و تنظیمات امنیتی پایه دامین دارند.',
    howEn: 'Domain Admins and Enterprise Admins are default members of this group.',
    howFa: 'به طور پیش‌فرض گروه‌های Domain Admins و Enterprise Admins عضو این گروه هستند.',
  },
  '548': {
    severity: 'high',
    titleEn: 'Account Operators (Create, Edit & Unlock Non-Admin Users/Groups)',
    titleFa: 'اپراتورهای حساب کاربری (مدیریت کاربران و گروه‌های عادی)',
    summaryEn:
      'Can create, modify, rename, reset passwords, unlock, and delete non-privileged AD user accounts and groups, plus log on locally to Domain Controllers.',
    summaryFa:
      'توانایی ساخت، ویرایش، تغییر رمز، رفع قفل و حذف کاربران و گروه‌های غیرادمین دامین و لاگین روی دامین کنترلرها را دارد.',
    howEn: 'Cannot modify members of Domain Admins, Schema Admins, Enterprise Admins, or protected AdminSDHolder accounts.',
    howFa: 'به دلیل محدودیت AdminSDHolder، نمی‌تواند کاربران یا گروه‌های ادمین حساس را تغییر دهد.',
  },
  '549': {
    severity: 'high',
    titleEn: 'Server Operators (Manage Domain Controller Services, Shares & Backups)',
    titleFa: 'اپراتورهای سرور (مدیریت سرویس‌ها و اشتراک‌گذاری دامین کنترلرها)',
    summaryEn:
      'Permits logging on to Domain Controllers, starting/stopping Windows services, creating network shares, formatting disks, and backing up/restoring files.',
    summaryFa:
      'اجازه ورود به دامین کنترلرها، Start/Stop سرویس‌های ویندوزی، ایجاد Share و پشتیبان‌گیری/بازیابی فایل‌های DC را می‌دهد.',
    howEn: 'Provides significant control over DC availability without changing AD security memberships directly.',
    howFa: 'دسترسی عملیاتی گسترده روی سرورهای دامین کنترلر ایجاد می‌کند.',
  },
  '551': {
    severity: 'high',
    titleEn: 'Backup Operators (Bypass File & Registry Permissions for Backup/Restore)',
    titleFa: 'اپراتورهای بکاپ (خواندن و بازگردانی تمام فایل‌ها حتی بدون دسترسی NTFS)',
    summaryEn:
      'Members can read and restore any file on Domain Controllers regardless of NTFS permissions (including NTDS.dit AD database files).',
    summaryFa:
      'اعضا می‌توانند فارغ از دسترسی‌های NTFS، از تمام فایل‌ها و دیتابیس‌های سرور بکاپ بگیرند یا بازیابی کنند — تقریباً معادل ادمین روی DC است.',
    howEn: 'Grants SeBackupPrivilege and SeRestorePrivilege on Domain Controllers.',
    howFa: 'مجوزهای سیستم‌عاملی SeBackupPrivilege و SeRestorePrivilege را فعال می‌کند.',
  },
  '555': {
    severity: 'medium',
    titleEn: 'Remote Desktop Users (RDP Access Permission)',
    titleFa: 'کاربران ریموت دسکتاپ (مجوز اتصال RDP به سرور یا کلاینت‌ها)',
    summaryEn:
      'Allows members to sign in remotely via Windows Remote Desktop Protocol (RDP / port 3389) to target servers or Domain Controllers where applied.',
    summaryFa:
      'به اعضا اجازه می‌دهد از طریق ریموت دسکتاپ (RDP) به سرورها یا سیستم‌های دارای این پالیسی متصل شوند.',
    howEn: 'Does not grant Administrator rights unless the user is also in Administrators.',
    howFa: 'به تنهایی دسترسی ادمین نمی‌دهد و فقط مجوز برقراری جلسه RDP را صادر می‌کند.',
  },
  '580': {
    severity: 'medium',
    titleEn: 'Remote Management Users (WinRM & Remote PowerShell Access)',
    titleFa: 'کاربران مدیریت از راه دور (مجوز اتصال WinRM و PowerShell)',
    summaryEn:
      'Allows remote management connections over WinRM (HTTP 5985 / HTTPS 5986), WMI, and PowerShell Remoting without requiring full Local Admin.',
    summaryFa:
      'مجوز برقراری ارتباط از راه دور از طریق WinRM، PowerShell Remoting و برخی ابزارهای مدیریتی (مثل همین پنل هلپ‌دسک) را می‌دهد.',
    howEn: 'Often paired with JEA (Just Enough Administration) endpoints for secure HelpDesk delegation.',
    howFa: 'معمولاً برای کارشناسان پشتیبانی و اتصال‌های JEA استفاده می‌شود.',
  },
  '513': {
    severity: 'medium',
    titleEn: 'Domain Users (Standard Baseline Group for Every Domain Account)',
    titleFa: 'کاربران دامین (گروه پایه و استاندارد تمام اکانت‌های دامین)',
    summaryEn:
      'Contains all user accounts in the domain (usually as their Primary Group). Grants baseline workstation logon and authenticated network read access.',
    summaryFa:
      'به‌طور پیش‌فرض تمامی کاربران دامین (به عنوان Primary Group) عضو آن هستند و مجوز لاگین استاندارد به سیستم‌ها و شبکه را فراهم می‌کند.',
    howEn: 'Note: Primary group members are tracked via user attribute primaryGroupID=513 rather than the group member attribute.',
    howFa: 'نکته فنی: اعضای اصلی این گروه از طریق فیلد primaryGroupID=513 روی کاربران ثبت می‌شوند نه لیست member گروه.',
  },
  '515': {
    severity: 'medium',
    titleEn: 'Domain Computers (All Domain-Joined Workstations & Member Servers)',
    titleFa: 'کامپیوترهای دامین (تمامی کلاینت‌ها و سرورهای عضو دامین)',
    summaryEn:
      'Automatically holds every domain-joined Windows PC and member server computer account (except Domain Controllers).',
    summaryFa:
      'حساب ماشینی تمام سیستم‌های کارمندان و سرورهای عضو دامین (به‌جز دامین کنترلرها) به عنوان Primary Group اینجا قرار دارد.',
    howEn: 'Commonly used in GPO Security Filtering when a computer policy should apply to workstations.',
    howFa: 'در فیلترهای GPO برای اعمال تنظیمات روی کامپیوترهای سازمان کاربرد فراوان دارد.',
  },
  '516': {
    severity: 'high',
    titleEn: 'Domain Controllers (All Active Directory Domain Controller Servers)',
    titleFa: 'سرورهای دامین کنترلر (Domain Controllers)',
    summaryEn: 'Contains computer accounts of every Domain Controller serving this AD domain.',
    summaryFa: 'شامل حساب‌های سیستمی تمامی سرورهای Domain Controller فعال در این دامین است.',
    howEn: 'Target of the Default Domain Controllers Policy GPO.',
    howFa: 'هدف اصلی پالیسی پیش‌فرض دامین کنترلرها است.',
  },
};

const KNOWN_PRIV_GROUP_NAMES: Record<string, KnownAdRoleProfile> = {
  dnsadmins: {
    severity: 'critical',
    titleEn: 'DnsAdmins (Critical Privilege — DLL Loading on Domain Controllers)',
    titleFa: 'ادمین‌های DNS (DnsAdmins — دسترسی بسیار حساس روی سرویس DNS دامین)',
    summaryEn:
      'Can manage all Active Directory-integrated DNS zones and load custom server-level plugins on DNS servers (which usually run on Domain Controllers).',
    summaryFa:
      'امکان مدیریت کامل رکوردها و Zoneهای DNS و بارگذاری پلاگین روی سرورهای DNS (معمولاً هم‌جوار با Domain Controller) را دارد.',
    howEn: 'Security teams treat DnsAdmins near-equivalent to Domain Admins when DNS runs on DCs.',
    howFa: 'در ممیزی‌های امنیتی به اندازه Domain Admins حساس ارزیابی می‌شود.',
  },
  'group policy creator owners': {
    severity: 'high',
    titleEn: 'Group Policy Creator Owners (Create New Domain GPOs)',
    titleFa: 'سازندگان Group Policy (مجوز ساخت GPO جدید در دامین)',
    summaryEn:
      'Members can create new Group Policy Objects in Active Directory and manage/edit GPOs they own (linking to OUs still requires OU delegation).',
    summaryFa:
      'اعضا می‌توانند Group Policy Object جدید در دامین بسازند و پالیسی‌های ساخته‌شده توسط خودشان را ویرایش کنند.',
    howEn: 'Linking a GPO to an OU still requires Link GPO permissions on the target OU.',
    howFa: 'برای اتصال (Link) پالیسی به OUها به مجوز مجزا روی OU هدف نیاز است.',
  },
  'cert publishers': {
    severity: 'medium',
    titleEn: 'Cert Publishers (Publish Certificates to Active Directory)',
    titleFa: 'منتشرکنندگان گواهینامه (Cert Publishers)',
    summaryEn: 'Allows Enterprise CA servers or designated accounts to publish user/computer certificates in AD.',
    summaryFa: 'به سرورهای صادرکننده گواهینامه (CA) اجازه می‌دهد گواهینامه‌های دیجیتال را در AD منتشر کنند.',
    howEn: 'Typically contains Windows Active Directory Certificate Services (AD CS) servers.',
    howFa: 'معمولاً سرورهای Enterprise CA عضو آن هستند.',
  },
  'domain admins': WELL_KNOWN_PRIVILEGED_ROLES['512'],
  'enterprise admins': WELL_KNOWN_PRIVILEGED_ROLES['519'],
  'schema admins': WELL_KNOWN_PRIVILEGED_ROLES['518'],
  administrators: WELL_KNOWN_PRIVILEGED_ROLES['544'],
  'account operators': WELL_KNOWN_PRIVILEGED_ROLES['548'],
  'server operators': WELL_KNOWN_PRIVILEGED_ROLES['549'],
  'backup operators': WELL_KNOWN_PRIVILEGED_ROLES['551'],
  'remote desktop users': WELL_KNOWN_PRIVILEGED_ROLES['555'],
  'remote management users': WELL_KNOWN_PRIVILEGED_ROLES['580'],
  'domain users': WELL_KNOWN_PRIVILEGED_ROLES['513'],
  'domain computers': WELL_KNOWN_PRIVILEGED_ROLES['515'],
  'domain controllers': WELL_KNOWN_PRIVILEGED_ROLES['516'],
};

const OBJECT_TYPE_GUID_LABELS: Record<string, { en: string; fa: string }> = {
  'bf9679c0-0de6-11d0-a285-00aa003049e2': {
    en: 'Group Members List (`member`)',
    fa: 'لیست اعضای گروه (`member`)',
  },
  'bc0ac240-79a9-11d0-9020-00c04fc2d4cf': {
    en: 'Group Membership Property Set',
    fa: 'مجموعه ویژگی‌های عضویت گروه',
  },
  '4c164200-20c0-11d0-a768-00aa006e0529': {
    en: 'Self Membership (Join/Leave Self)',
    fa: 'عضویت شخصی (افزودن/حذف خود)',
  },
  'bf967a9c-0de6-11d0-a285-00aa003049e2': {
    en: 'Group Object',
    fa: 'کل آبجکت گروه',
  },
};

function describeAccessMask(
  mask: number,
  objGuid: string
): {
  rightsEn: string;
  rightsFa: string;
  scopeEn: string;
  scopeFa: string;
  isPrivilegeWrite: boolean;
} {
  const fullControl = (mask & 0xf01ff) === 0xf01ff || (mask & 0x10000000) !== 0;
  const writeDacl = (mask & 0x00040000) !== 0;
  const writeOwner = (mask & 0x00080000) !== 0;
  const deleteObj = (mask & 0x00010000) !== 0;
  const writeProp = (mask & 0x00000020) !== 0 || (mask & 0x40000000) !== 0;
  const readProp = (mask & 0x00000010) !== 0 || (mask & 0x80000000) !== 0;
  const selfWrite = (mask & 0x00000008) !== 0;

  const guidInfo = objGuid ? OBJECT_TYPE_GUID_LABELS[objGuid.toLowerCase()] : undefined;

  if (fullControl) {
    return {
      rightsEn: 'Full Control (Manage Members, Properties, Permissions & Delete)',
      rightsFa: 'کنترل کامل (افزودن/حذف اعضا، تغییر مشخصات، تغییر دسترسی و حذف گروه)',
      scopeEn: guidInfo ? guidInfo.en : 'Entire Group Object',
      scopeFa: guidInfo ? guidInfo.fa : 'کل آبجکت گروه',
      isPrivilegeWrite: true,
    };
  }

  const enParts: string[] = [];
  const faParts: string[] = [];
  if (writeDacl) {
    enParts.push('Modify Permissions');
    faParts.push('تغییر سطح دسترسی (Write DACL)');
  }
  if (writeOwner) {
    enParts.push('Change Owner');
    faParts.push('تغییر مالک گروه');
  }
  if (deleteObj) {
    enParts.push('Delete Group');
    faParts.push('حذف گروه');
  }
  if (writeProp) {
    if (
      objGuid &&
      (objGuid.toLowerCase() === 'bf9679c0-0de6-11d0-a285-00aa003049e2' ||
        objGuid.toLowerCase() === 'bc0ac240-79a9-11d0-9020-00c04fc2d4cf')
    ) {
      enParts.push('Add / Remove Group Members');
      faParts.push('افزودن و حذف اعضای گروه (Write Members)');
    } else {
      enParts.push('Modify Properties');
      faParts.push('ویرایش مشخصات گروه');
    }
  }
  if (selfWrite) {
    enParts.push('Self Add/Remove Membership');
    faParts.push('افزودن یا حذف خود در گروه');
  }
  if (enParts.length === 0 && readProp) {
    enParts.push('Read Group Info & Members');
    faParts.push('مشاهده اطلاعات و لیست اعضا (Read)');
  }
  if (enParts.length === 0) {
    enParts.push(`Access Mask 0x${(mask >>> 0).toString(16).toUpperCase()}`);
    faParts.push(`کد دسترسی 0x${(mask >>> 0).toString(16).toUpperCase()}`);
  }

  return {
    rightsEn: enParts.join(' + '),
    rightsFa: faParts.join(' + '),
    scopeEn: guidInfo ? guidInfo.en : 'All Group Attributes',
    scopeFa: guidInfo ? guidInfo.fa : 'همه فیلدهای گروه',
    isPrivilegeWrite: Boolean(writeDacl || writeOwner || deleteObj || writeProp || selfWrite),
  };
}

interface ParsedSdData {
  ownerSid: string;
  aces: Array<{
    accessType: 'Allow' | 'Deny';
    isInherited: boolean;
    mask: number;
    objectTypeGuid: string;
    trusteeSid: string;
  }>;
}

function parseBinarySecurityDescriptor(buf: Buffer | undefined): ParsedSdData {
  const empty: ParsedSdData = { ownerSid: '', aces: [] };
  if (!buf || !Buffer.isBuffer(buf) || buf.length < 20) return empty;
  try {
    const control = buf.readUInt16LE(2);
    const offsetOwner = buf.readUInt32LE(4);
    const offsetDacl = buf.readUInt32LE(16);

    const ownerSid =
      offsetOwner >= 20 && offsetOwner + 8 <= buf.length ? parseBinarySid(buf.subarray(offsetOwner)) : '';

    const aces: ParsedSdData['aces'] = [];
    const daclPresent = (control & 0x0004) !== 0;
    if (daclPresent && offsetDacl >= 20 && offsetDacl + 8 <= buf.length) {
      const aclSize = buf.readUInt16LE(offsetDacl + 2);
      const aceCount = Math.min(buf.readUInt16LE(offsetDacl + 4), 120);
      const aclEnd = Math.min(buf.length, offsetDacl + aclSize);
      let cursor = offsetDacl + 8;

      for (let i = 0; i < aceCount && cursor + 8 <= aclEnd; i++) {
        const aceType = buf.readUInt8(cursor);
        const aceFlags = buf.readUInt8(cursor + 1);
        const aceSize = buf.readUInt16LE(cursor + 2);
        if (aceSize < 8 || cursor + aceSize > aclEnd) break;

        const isInherited = (aceFlags & 0x10) !== 0;
        const accessMask = buf.readUInt32LE(cursor + 4);

        if (aceType === 0x00 || aceType === 0x01) {
          const sid = parseBinarySid(buf.subarray(cursor + 8, cursor + aceSize));
          if (sid) {
            aces.push({
              accessType: aceType === 0x01 ? 'Deny' : 'Allow',
              isInherited,
              mask: accessMask,
              objectTypeGuid: '',
              trusteeSid: sid,
            });
          }
        } else if ((aceType === 0x05 || aceType === 0x06) && cursor + 12 <= cursor + aceSize) {
          const objFlags = buf.readUInt32LE(cursor + 8);
          let sidOffset = cursor + 12;
          let objectTypeGuid = '';
          if ((objFlags & 0x01) !== 0 && sidOffset + 16 <= cursor + aceSize) {
            objectTypeGuid = parseBinaryGuid(buf.subarray(sidOffset, sidOffset + 16));
            sidOffset += 16;
          }
          if ((objFlags & 0x02) !== 0) {
            sidOffset += 16;
          }
          if (sidOffset + 8 <= cursor + aceSize) {
            const sid = parseBinarySid(buf.subarray(sidOffset, cursor + aceSize));
            if (sid) {
              aces.push({
                accessType: aceType === 0x06 ? 'Deny' : 'Allow',
                isInherited,
                mask: accessMask,
                objectTypeGuid,
                trusteeSid: sid,
              });
            }
          }
        }
        cursor += aceSize;
      }
    }

    return { ownerSid, aces };
  } catch {
    return empty;
  }
}

async function resolveSidsViaLdap(
  session: ActiveLdapSession,
  sids: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unresolved: string[] = [];
  for (const sid of dedupeStrings(sids)) {
    if (WELL_KNOWN_SIDS[sid]) {
      map.set(sid, WELL_KNOWN_SIDS[sid]);
    } else {
      unresolved.push(sid);
    }
  }
  if (unresolved.length === 0 || !session.defaultNamingContext) return map;

  const chunkSize = 25;
  for (let i = 0; i < unresolved.length; i += chunkSize) {
    const chunk = unresolved.slice(i, i + chunkSize);
    const clauses: string[] = [];
    for (const s of chunk) {
      const hex = encodeSidHexFilter(s);
      if (hex) clauses.push(`(objectSid=${hex})`);
    }
    if (clauses.length === 0) continue;
    try {
      const rows = await ldapSearchEntries(session.client, session.defaultNamingContext, {
        scope: 'sub',
        filter: clauses.length === 1 ? clauses[0] : `(|${clauses.join('')})`,
        attributes: ['objectSid', 'sAMAccountName', 'displayName', 'cn'],
        sizeLimit: 50,
      });
      for (const r of rows) {
        const sid = parseBinarySid(r.buffers.objectsid?.[0]);
        const name =
          getFirstAttr(r.attrs, 'sAMAccountName') ||
          getFirstAttr(r.attrs, 'displayName') ||
          getFirstAttr(r.attrs, 'cn');
        if (sid && name) {
          const domShort = session.domainName ? session.domainName.split('.')[0].toUpperCase() : '';
          map.set(sid, domShort ? `${domShort}\\${name}` : name);
        }
      }
    } catch {}
  }

  // Handle domain well-known RIDs whose domain SID wasn't matched as an object above
  for (const sid of unresolved) {
    if (map.has(sid)) continue;
    const rid = getSidRid(sid);
    const domShort = session.domainName ? session.domainName.split('.')[0].toUpperCase() : 'DOMAIN';
    if (rid === '512') map.set(sid, `${domShort}\\Domain Admins`);
    else if (rid === '519') map.set(sid, `${domShort}\\Enterprise Admins`);
    else if (rid === '518') map.set(sid, `${domShort}\\Schema Admins`);
    else if (rid === '516') map.set(sid, `${domShort}\\Domain Controllers`);
  }

  return map;
}

function normalizeDomainCmp(d?: string | null): string {
  const clean = String(d || '').trim().toLowerCase();
  if (!clean) return '';
  return clean.includes('.') ? clean.split('.')[0] : clean;
}

function classifyMemberObjectType(classes: string[]): HelpdeskGroupMemberEntry['objectType'] {
  const lower = classes.map((c) => c.toLowerCase());
  if (lower.includes('computer')) return 'computer';
  if (lower.includes('group')) return 'group';
  if (lower.includes('user') || lower.includes('inetorgperson')) return 'user';
  if (lower.includes('contact')) return 'contact';
  if (lower.includes('foreignsecurityprincipal')) return 'foreign_principal';
  return 'unknown';
}

function adDurationToDays(raw: string | number | bigint | undefined | null): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  try {
    let bi = BigInt(String(raw).trim());
    if (bi === 0n) return 0;
    if (bi <= -9223372036854775000n || bi >= 9223372036854775807n) return null;
    if (bi < 0n) bi = -bi;
    return Math.round(Number(bi / 864000000000n));
  } catch {
    return null;
  }
}

async function resolveDomainHintsForGroup(params: {
  targetGroup?: string;
  adminUsername: string;
  domainController?: string;
}): Promise<{ adConfig: any; dcCandidates: string[]; pdcHost: string; domainHints: string[] }> {
  const adConfig = await getActiveDirectoryConfig().catch(() => null);
  const adminParts = splitUsernameParts(params.adminUsername);
  const groupStr = String(params.targetGroup || '').trim();
  const groupDnDomain = /^CN=/i.test(groupStr) || /DC=/i.test(groupStr) ? dnToDomainName(groupStr) : '';

  const domainHints = dedupeStrings([
    groupDnDomain,
    adminParts.domain.includes('.') ? adminParts.domain : undefined,
    adConfig?.domain,
    adConfig?.baseDn ? dnToDomainName(adConfig.baseDn) : undefined,
    adminParts.domain,
  ]);

  const { candidates, pdcHost } = await discoverDcHostsWithPdc({
    explicitDc: params.domainController,
    adConfig,
    domainHints,
  });

  if (candidates.length === 0) {
    throw new Error(
      'Unable to locate any Domain Controller. Enter a Domain Controller IP/hostname or configure Active Directory settings.'
    );
  }

  return { adConfig, dcCandidates: candidates, pdcHost, domainHints };
}

// Fetch ALL direct member DNs (supporting LDAP Range Retrieval > 1500 members)
async function collectAllDirectMemberDns(
  session: ActiveLdapSession,
  groupDn: string,
  initialEntry: { attrs: Record<string, string[]> },
  maxCap = 1000
): Promise<{ dns: string[]; totalEstimate: number; truncated: boolean }> {
  const direct = getAllAttrs(initialEntry.attrs, 'member');
  if (direct.length > 0) {
    return {
      dns: direct.slice(0, maxCap),
      totalEstimate: direct.length,
      truncated: direct.length > maxCap,
    };
  }

  // Check for ranged attribute keys such as member;range=0-1499
  const rangeKey = Object.keys(initialEntry.attrs).find((k) => k.startsWith('member;range='));
  if (!rangeKey) {
    return { dns: [], totalEstimate: 0, truncated: false };
  }

  const collected: string[] = [...(initialEntry.attrs[rangeKey] || [])];
  let currentKey = rangeKey;
  let guard = 0;

  while (guard < 8) {
    guard++;
    const m = currentKey.match(/member;range=(\d+)-(\d+|\*)/i);
    if (!m || m[2] === '*') break;
    const nextStart = Number(m[2]) + 1;
    if (!Number.isFinite(nextStart) || collected.length >= maxCap) break;

    try {
      const rows = await ldapSearchEntries(session.client, groupDn, {
        scope: 'base',
        filter: '(objectClass=*)',
        attributes: [`member;range=${nextStart}-*`],
      });
      if (!rows[0]) break;
      const nextKey = Object.keys(rows[0].attrs).find((k) => k.startsWith('member;range='));
      if (!nextKey || nextKey === currentKey) break;
      const chunk = rows[0].attrs[nextKey] || [];
      collected.push(...chunk);
      currentKey = nextKey;
      if (chunk.length === 0) break;
    } catch {
      break;
    }
  }

  const isStarEnd = /member;range=\d+-\*/i.test(currentKey);
  return {
    dns: collected.slice(0, maxCap),
    totalEstimate: collected.length,
    truncated: !isStarEnd || collected.length > maxCap,
  };
}

async function batchHydrateDnsViaLdap(
  session: ActiveLdapSession,
  dns: string[]
): Promise<Map<string, HelpdeskGroupMemberEntry>> {
  const result = new Map<string, HelpdeskGroupMemberEntry>();
  const uniqueDns = dedupeStrings(dns);
  const chunkSize = 40;

  for (let i = 0; i < uniqueDns.length; i += chunkSize) {
    const chunk = uniqueDns.slice(i, i + chunkSize);
    const clauses = chunk.map((dn) => `(distinguishedName=${escapeLdapFilterValue(dn)})`);
    const filter = clauses.length === 1 ? clauses[0] : `(|${clauses.join('')})`;
    try {
      const rows = await ldapSearchEntries(session.client, session.defaultNamingContext, {
        scope: 'sub',
        filter,
        attributes: [
          'objectClass',
          'cn',
          'sAMAccountName',
          'displayName',
          'department',
          'title',
          'description',
          'mail',
          'userAccountControl',
          'lockoutTime',
          'groupType',
          'distinguishedName',
        ],
        sizeLimit: 100,
      });
      for (const r of rows) {
        const dn = r.dn || getFirstAttr(r.attrs, 'distinguishedName');
        if (!dn) continue;
        const classes = getAllAttrs(r.attrs, 'objectClass');
        const objectType = classifyMemberObjectType(classes);
        const uac = Number(getFirstAttr(r.attrs, 'userAccountControl') || 0);
        const lockRaw = getFirstAttr(r.attrs, 'lockoutTime');
        const gTypeRaw = getFirstAttr(r.attrs, 'groupType');
        const decoded = objectType === 'group' && gTypeRaw ? decodeGroupType(gTypeRaw) : null;

        result.set(dn.toLowerCase(), {
          dn,
          cn: getFirstAttr(r.attrs, 'cn') || extractCnFromDn(dn),
          samAccountName: getFirstAttr(r.attrs, 'sAMAccountName') || extractCnFromDn(dn),
          displayName: getFirstAttr(r.attrs, 'displayName') || getFirstAttr(r.attrs, 'cn') || extractCnFromDn(dn),
          objectType,
          department: getFirstAttr(r.attrs, 'department'),
          jobTitle: getFirstAttr(r.attrs, 'title'),
          description: getFirstAttr(r.attrs, 'description'),
          email: getFirstAttr(r.attrs, 'mail'),
          organizationalUnit: extractOuBreadcrumb(dn),
          accountEnabled:
            objectType === 'user' || objectType === 'computer' ? (uac & 0x0002) === 0 : null,
          accountLocked:
            objectType === 'user' ? Boolean(lockRaw && lockRaw !== '0') : null,
          nestedScope: decoded?.groupScope,
          nestedCategory: decoded?.groupCategory,
        });
      }
    } catch {}
  }

  // Fallback stub for Foreign Security Principals or cross-domain DNs not in current NC
  for (const dn of uniqueDns) {
    if (!result.has(dn.toLowerCase())) {
      const isFsp = /CN=ForeignSecurityPrincipals,/i.test(dn);
      result.set(dn.toLowerCase(), {
        dn,
        cn: extractCnFromDn(dn),
        samAccountName: extractCnFromDn(dn),
        displayName: extractCnFromDn(dn),
        objectType: isFsp ? 'foreign_principal' : 'unknown',
        department: '',
        jobTitle: '',
        description: '',
        email: '',
        organizationalUnit: extractOuBreadcrumb(dn),
        accountEnabled: null,
        accountLocked: null,
      });
    }
  }

  return result;
}

// Optional WinRM DC Enrichment: Group Creator Events (4727/4731/4754...), Membership Audit Events (4728/4729/4732/4733/4756/4757), GPO Security Filtering & WinRM ACL fallback
async function collectGroupAuditEventsAndGposViaWinrm(params: {
  dcHosts: string[];
  adminUsername: string;
  adminPassword: string;
  winrmProtocol?: HelpdeskProtocol;
  groupSam: string;
  groupCn: string;
  groupSid: string;
  groupDn: string;
}): Promise<{
  status: 'available' | 'empty' | 'unavailable';
  noteEn: string;
  noteFa: string;
  creatorAccount: string;
  creatorTimestamp: string | null;
  creatorDc: string;
  events: HelpdeskGroupAuditEvent[];
  gpos: HelpdeskGroupGpoLink[];
}> {
  const emptyUnavailable = (reasonEn: string, reasonFa: string) => ({
    status: 'unavailable' as const,
    noteEn: reasonEn,
    noteFa: reasonFa,
    creatorAccount: '',
    creatorTimestamp: null,
    creatorDc: '',
    events: [] as HelpdeskGroupAuditEvent[],
    gpos: [] as HelpdeskGroupGpoLink[],
  });

  if (!params.dcHosts.length || !params.adminUsername || !params.adminPassword) {
    return emptyUnavailable(
      'WinRM enrichment skipped because no reachable DC host was specified.',
      'استعلام رویدادهای Security Log و GPO از طریق WinRM انجام نشد (میزبان DC مشخص نیست).'
    );
  }

  const samB64 = Buffer.from(params.groupSam || params.groupCn, 'utf8').toString('base64');
  const sidB64 = Buffer.from(params.groupSid || '', 'utf8').toString('base64');
  const dnB64 = Buffer.from(params.groupDn || '', 'utf8').toString('base64');

  const psScript = `
$ErrorActionPreference = 'SilentlyContinue'
$targetSam = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${samB64}'))
$targetSid = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${sidB64}'))
$targetDn  = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${dnB64}'))

$eventsOut = @()
$creatorAcct = ''
$creatorTime = $null
$gposOut = @()
$evErr = ''

try {
  # 1) Search creation events across full available Security log (4727 Global, 4731 Local, 4754 Universal, 4744/4749/4759 Distribution)
  $createIds = @(4727,4731,4754,4744,4749,4759)
  $cEvs = Get-WinEvent -FilterHashtable @{ LogName='Security'; Id=$createIds } -MaxEvents 400 -ErrorAction SilentlyContinue
  foreach ($ev in $cEvs) {
    $xml = [xml]$ev.ToXml()
    $d = @{}
    foreach ($node in $xml.Event.EventData.Data) { $d[$node.Name] = [string]$node.'#text' }
    if (
      ($targetSid -and $d['TargetSid'] -eq $targetSid) -or
      ($d['TargetUserName'] -ieq $targetSam) -or
      ($targetDn -and $ev.Message -like "*$targetSam*")
    ) {
      $subj = if ($d['SubjectDomainName'] -and $d['SubjectUserName']) { "$($d['SubjectDomainName'])\\$($d['SubjectUserName'])" } else { $d['SubjectUserName'] }
      $creatorAcct = $subj
      $creatorTime = $ev.TimeCreated.ToUniversalTime().ToString('o')
      $eventsOut += [PSCustomObject]@{
        id = $ev.Id
        type = 'created'
        ts = $creatorTime
        actor = $subj
        member = ''
      }
      break
    }
  }

  # 2) Recent 14-day membership & group modification events
  $cutoff = (Get-Date).AddDays(-14)
  $chgIds = @(4728,4729,4732,4733,4756,4757,4735,4737,4755,4730,4734,4758)
  $mEvs = Get-WinEvent -FilterHashtable @{ LogName='Security'; Id=$chgIds; StartTime=$cutoff } -MaxEvents 600 -ErrorAction SilentlyContinue
  foreach ($ev in $mEvs) {
    $xml = [xml]$ev.ToXml()
    $d = @{}
    foreach ($node in $xml.Event.EventData.Data) { $d[$node.Name] = [string]$node.'#text' }
    if (($targetSid -and $d['TargetSid'] -eq $targetSid) -or ($d['TargetUserName'] -ieq $targetSam)) {
      $subj = if ($d['SubjectDomainName'] -and $d['SubjectUserName']) { "$($d['SubjectDomainName'])\\$($d['SubjectUserName'])" } else { $d['SubjectUserName'] }
      $mem = if ($d['MemberName']) { $d['MemberName'] } elseif ($d['MemberSid']) { $d['MemberSid'] } else { '' }
      $t = 'group_changed'
      if ($ev.Id -in @(4728,4732,4756)) { $t = 'member_added' }
      elseif ($ev.Id -in @(4729,4733,4757)) { $t = 'member_removed' }
      elseif ($ev.Id -in @(4730,4734,4758)) { $t = 'deleted' }
      $eventsOut += [PSCustomObject]@{
        id = $ev.Id
        type = $t
        ts = $ev.TimeCreated.ToUniversalTime().ToString('o')
        actor = $subj
        member = $mem
      }
      if ($eventsOut.Count -ge 40) { break }
    }
  }
} catch {
  $evErr = [string]$_.Exception.Message
}

# 3) GPO Security Filtering matching this group
try {
  if (Get-Module -ListAvailable -Name GroupPolicy) {
    Import-Module GroupPolicy -ErrorAction SilentlyContinue
    $allGpos = Get-GPO -All -ErrorAction SilentlyContinue
    foreach ($g in $allGpos) {
      $perms = Get-GPPermission -Guid $g.Id -All -ErrorAction SilentlyContinue
      $hit = $perms | Where-Object {
        ($targetSid -and $_.Trustee.Sid.Value -eq $targetSid) -or
        ($_.Trustee.Name -ieq $targetSam)
      } | Select-Object -First 1
      if ($hit) {
        $links = @()
        try {
          [xml]$rep = Get-GPOReport -Guid $g.Id -ReportType Xml -ErrorAction SilentlyContinue
          if ($rep.GPO.LinksTo) {
            foreach ($lnk in $rep.GPO.LinksTo) {
              if ($lnk.SOMPath) { $links += [string]$lnk.SOMPath }
            }
          }
        } catch {}
        $gposOut += [PSCustomObject]@{
          name = [string]$g.DisplayName
          id = [string]$g.Id
          status = [string]$g.GpoStatus
          perm = [string]$hit.Permission
          links = @($links)
        }
      }
    }
  }
} catch {}

[PSCustomObject]@{
  ok = [string]::IsNullOrEmpty($evErr)
  evErr = $evErr
  creator = $creatorAcct
  creatorTs = $creatorTime
  events = @($eventsOut)
  gpos = @($gposOut)
} | ConvertTo-Json -Depth 5 -Compress
`;

  let lastErr = '';
  for (const dcHost of params.dcHosts.slice(0, 2)) {
    try {
      const execRes = await executeHelpdeskPowerShell(
        {
          targetIp: dcHost,
          protocol: params.winrmProtocol || 'auto',
          username: params.adminUsername,
          password: params.adminPassword,
          timeoutMs: 22000,
        },
        psScript
      );
      const trimmed = execRes.stdout.trim();
      const sIdx = trimmed.indexOf('{');
      const eIdx = trimmed.lastIndexOf('}');
      if (sIdx === -1 || eIdx < sIdx) continue;
      const parsed = JSON.parse(trimmed.slice(sIdx, eIdx + 1));

      const rawEvents = Array.isArray(parsed.events) ? parsed.events : [];
      const mappedEvents: HelpdeskGroupAuditEvent[] = rawEvents.map((ev: any) => {
        const id = Number(ev.id || 0);
        const type =
          ev.type === 'created' ||
          ev.type === 'member_added' ||
          ev.type === 'member_removed' ||
          ev.type === 'deleted'
            ? ev.type
            : 'group_changed';
        const actor = String(ev.actor || '-').trim();
        const mem = String(ev.member || '').trim();
        const memShort = mem ? extractCnFromDn(mem) : '';
        const labels: Record<string, { en: string; fa: string }> = {
          created: {
            en: `Group created by ${actor} (Event ${id})`,
            fa: `ساخت گروه توسط ${actor} (رویداد ${id})`,
          },
          member_added: {
            en: `${actor} added ${memShort || 'a member'} to group (Event ${id})`,
            fa: `${actor} عضو ${memShort || 'جدیدی'} را به گروه اضافه کرد (رویداد ${id})`,
          },
          member_removed: {
            en: `${actor} removed ${memShort || 'a member'} from group (Event ${id})`,
            fa: `${actor} عضو ${memShort || 'قبلی'} را از گروه حذف کرد (رویداد ${id})`,
          },
          deleted: {
            en: `Group deleted by ${actor} (Event ${id})`,
            fa: `حذف گروه توسط ${actor} (رویداد ${id})`,
          },
          group_changed: {
            en: `Group properties or type updated by ${actor} (Event ${id})`,
            fa: `ویرایش مشخصات یا نوع گروه توسط ${actor} (رویداد ${id})`,
          },
        };
        return {
          eventId: id,
          eventType: type,
          timestamp: String(ev.ts || ''),
          dcHost,
          actor,
          targetMember: memShort || mem || undefined,
          summaryEn: labels[type].en,
          summaryFa: labels[type].fa,
        };
      });

      const rawGpos = Array.isArray(parsed.gpos) ? parsed.gpos : [];
      const mappedGpos: HelpdeskGroupGpoLink[] = rawGpos.map((g: any) => ({
        gpoName: String(g.name || ''),
        gpoId: String(g.id || ''),
        gpoStatus: String(g.status || ''),
        permissionLevel: String(g.perm || ''),
        linkedOus: Array.isArray(g.links) ? g.links.map((l: any) => String(l)) : [],
      }));

      if (!parsed.ok && parsed.evErr) {
        return {
          status: mappedEvents.length > 0 ? 'available' : 'unavailable',
          noteEn: `DC ${dcHost} Security Log query reported: ${parsed.evErr}`,
          noteFa: `گزارش لاگ امنیتی روی ${dcHost}: ${parsed.evErr}`,
          creatorAccount: String(parsed.creator || ''),
          creatorTimestamp: parsed.creatorTs ? String(parsed.creatorTs) : null,
          creatorDc: parsed.creator ? dcHost : '',
          events: mappedEvents,
          gpos: mappedGpos,
        };
      }

      return {
        status: mappedEvents.length > 0 ? 'available' : 'empty',
        noteEn:
          mappedEvents.length > 0
            ? `Retrieved ${mappedEvents.length} live Security Event Log entries from ${dcHost}.`
            : `No group creation/membership Security Events (last 14 days / log retention) remained on ${dcHost}. Note: Active Directory itself only stores creation date (whenCreated) and current Object Owner unless Security Log retention covers the creation time.`,
        noteFa:
          mappedEvents.length > 0
            ? `${mappedEvents.length} رویداد واقعی تغییرات گروه از Security Event Log دامین کنترلر ${dcHost} استخراج شد.`
            : `رویدادی برای ساخت یا تغییر اعضای این گروه در بازه نگهداری Security Log روی ${dcHost} باقی نمانده است (AD تاریخ ساخت و Owner فعلی را نگهداری می‌کند و نام سازنده فقط تا زمان نگهداری لاگ 4727/4731/4754 موجود است).`,
        creatorAccount: String(parsed.creator || ''),
        creatorTimestamp: parsed.creatorTs ? String(parsed.creatorTs) : null,
        creatorDc: parsed.creator ? dcHost : '',
        events: mappedEvents,
        gpos: mappedGpos,
      };
    } catch (err: any) {
      lastErr = err?.message || String(err);
    }
  }

  return emptyUnavailable(
    `DC WinRM / Event Log unreachable (${lastErr || 'connection refused/timeout'}). AD Object Owner & ACLs were still read directly via LDAP.`,
    `اتصال WinRM برای خواندن Security Event Log و GPO در دسترس نبود (${lastErr || 'Timeout'})؛ اما تاریخچه ساخت و سطح دسترسی‌های آبجکت مستقیماً از LDAP خوانده شد.`
  );
}

// ============================================================================
// 3. HUMAN-READABLE PERMISSION TRANSLATOR (EASY FOR EVERYONE)
// ============================================================================

function buildPlainLanguagePermissions(params: {
  cn: string;
  sam: string;
  sid: string;
  ou: string;
  scope: AdGroupScope;
  category: AdGroupCategory;
  adminCount: boolean;
  isMailEnabled: boolean;
  primaryEmail: string;
  requireSenderAuth: boolean | null;
  parentGroups: HelpdeskGroupParentEntry[];
  linkedGpos: HelpdeskGroupGpoLink[];
  appliedPsos: HelpdeskGroupInspectionResult['permissions']['appliedPasswordPolicies'];
  aclEntries: HelpdeskGroupAclEntry[];
}): {
  isPrivileged: boolean;
  isBuiltinCritical: boolean;
  privilegeLevel: 'critical' | 'elevated' | 'standard' | 'distribution';
  plainSummaryEn: string;
  plainSummaryFa: string;
  insights: HelpdeskGroupPermissionInsight[];
} {
  const insights: HelpdeskGroupPermissionInsight[] = [];
  const rid = getSidRid(params.sid);
  const nameKey = params.sam.toLowerCase();
  const cnKey = params.cn.toLowerCase();
  const knownDirect =
    WELL_KNOWN_PRIVILEGED_ROLES[rid] ||
    KNOWN_PRIV_GROUP_NAMES[nameKey] ||
    KNOWN_PRIV_GROUP_NAMES[cnKey];

  let isBuiltinCritical = false;
  let isPrivileged = false;
  let maxSeverity: 'critical' | 'high' | 'medium' | 'info' = 'info';

  const upgradeSeverity = (s: 'critical' | 'high' | 'medium' | 'info') => {
    const rank = { critical: 4, high: 3, medium: 2, info: 1 };
    if (rank[s] > rank[maxSeverity]) maxSeverity = s;
  };

  if (knownDirect) {
    if (knownDirect.severity === 'critical') {
      isBuiltinCritical = true;
      isPrivileged = true;
    } else if (knownDirect.severity === 'high') {
      isPrivileged = true;
    }
    upgradeSeverity(knownDirect.severity);
    insights.push({
      id: `builtin_${rid || nameKey}`,
      category: 'privileged_role',
      severity: knownDirect.severity,
      titleEn: knownDirect.titleEn,
      titleFa: knownDirect.titleFa,
      summaryEn: knownDirect.summaryEn,
      summaryFa: knownDirect.summaryFa,
      howItWorksEn: knownDirect.howEn,
      howItWorksFa: knownDirect.howFa,
      sourceLabel: rid ? `RID ${rid}` : 'Built-in AD Group',
    });
  }

  // Inherited privileges from parent groups
  const privilegedParents = params.parentGroups.filter((p) => p.isPrivileged);
  for (const parent of privilegedParents) {
    isPrivileged = true;
    upgradeSeverity('high');
    insights.push({
      id: `inherited_${parent.samAccountName.toLowerCase()}`,
      category: 'inherited_role',
      severity: 'high',
      titleEn: `Inherits Elevated Rights from Parent Group "${parent.cn}"`,
      titleFa: `ارث‌بری سطح دسترسی بالا از گروه والد «${parent.cn}»`,
      summaryEn: `Because this group is a member of "${parent.cn}", every user inside this group automatically receives "${parent.cn}" permissions across the domain.`,
      summaryFa: `از آنجا که این گروه عضو گروه والد «${parent.cn}» است، هر کاربری که به این گروه اضافه شود به‌صورت خودکار تمام اختیارات «${parent.cn}» را دریافت می‌کند.`,
      howItWorksEn: parent.isDirect
        ? `Direct nested membership inside ${parent.dn}.`
        : `Transitive nested membership chain ending at ${parent.cn}.`,
      howItWorksFa: parent.isDirect
        ? `عضویت مستقیم در گروه والد ${parent.cn}`
        : `عضویت غیرمستقیم (زنجیره‌ای) در گروه والد ${parent.cn}`,
      sourceLabel: `memberOf -> ${parent.cn}`,
    });
  }

  // Non-privileged parent groups explanation
  const standardParents = params.parentGroups.filter((p) => !p.isPrivileged);
  if (standardParents.length > 0) {
    insights.push({
      id: 'parent_nesting_summary',
      category: 'inherited_role',
      severity: 'info',
      titleEn: `Nested Inside ${standardParents.length} Parent Group(s)`,
      titleFa: `زیرمجموعه ${standardParents.length} گروه والد دیگر در AD`,
      summaryEn: `Members inherit any folder shares, VPN access, or application roles granted to: ${standardParents
        .slice(0, 8)
        .map((p) => p.cn)
        .join(', ')}.`,
      summaryFa: `اعضای این گروه تمام دسترسی‌های فایل‌شیر، VPN یا نرم‌افزاری متعلق به گروه‌های والد زیر را به ارث می‌برند: ${standardParents
        .slice(0, 8)
        .map((p) => p.cn)
        .join('، ')}.`,
      howItWorksEn: 'AD builds a user security token on logon combining all parent Security Groups.',
      howItWorksFa: 'هنگام لاگین کاربر، توکن امنیتی ویندوز تمام گروه‌های والد را با هم جمع می‌زند.',
    });
  }

  // AdminSDHolder protection flag
  if (params.adminCount) {
    isPrivileged = true;
    upgradeSeverity('high');
    insights.push({
      id: 'admin_sd_holder',
      category: 'admin_sd_holder',
      severity: 'high',
      titleEn: 'AdminSDHolder Protected Group (adminCount = 1)',
      titleFa: 'گروه محافظت‌شده امنیتی (AdminSDHolder / adminCount = 1)',
      summaryEn:
        'Active Directory flags this group as high-privilege and locks its permissions against accidental delegation changes by standard HelpDesk accounts.',
      summaryFa:
        'اکتیو دایرکتوری این گروه را به عنوان گروه حساس علامت‌گذاری کرده و سطح دسترسی آن را قفل کرده تا کارشناسان غیرارشد نتوانند اعضای آن را تغییر دهند.',
      howItWorksEn:
        'Only Domain Admins / Enterprise Admins can normally modify members; regular Account Operators are blocked.',
      howItWorksFa: 'معمولاً فقط Domain Adminها مجاز به تغییر اعضای این گروه هستند.',
      sourceLabel: 'adminCount=1',
    });
  }

  // Fine-Grained Password Policies
  if (params.appliedPsos.length > 0) {
    upgradeSeverity('medium');
    for (const pso of params.appliedPsos) {
      insights.push({
        id: `pso_${pso.name}`,
        category: 'password_policy',
        severity: 'medium',
        titleEn: `Enforces Custom Password Policy "${pso.name}"`,
        titleFa: `اعمال قوانین ویژه رمز عبور (${pso.name}) روی اعضا`,
        summaryEn: `Members receive specialized security rules overriding the default domain password policy (Min Length: ${
          pso.minLength ?? 'Default'
        }, Lockout Threshold: ${pso.lockoutThreshold ?? 'Default'}).`,
        summaryFa: `قوانین رمز عبور و قفل اکانت برای اعضای این گروه با پیش‌فرض کل شرکت متفاوت است (حداقل طول رمز: ${
          pso.minLength ?? 'پیش‌فرض'
        }، آستانه قفل: ${pso.lockoutThreshold ?? 'پیش‌فرض'}).`,
        howItWorksEn: `AD Fine-Grained Password Policy linked via msDS-PSOAppliesTo (Precedence ${pso.precedence ?? '-'}).`,
        howItWorksFa: `سیاست رمزگذاری اختصاصی FGPP متصل به این گروه (اولویت ${pso.precedence ?? '-'}).`,
        sourceLabel: 'FGPP / PSO',
      });
    }
  }

  // Linked GPO Security Filtering
  if (params.linkedGpos.length > 0) {
    upgradeSeverity('medium');
    insights.push({
      id: 'gpo_targets',
      category: 'gpo_target',
      severity: 'medium',
      titleEn: `Controls Targeting of ${params.linkedGpos.length} Group Policy Object(s)`,
      titleFa: `تعیین‌کننده هدف اعمال ${params.linkedGpos.length} پالیسی GPO`,
      summaryEn: `This group appears in Security Filtering / Delegation of: ${params.linkedGpos
        .slice(0, 6)
        .map((g) => `${g.gpoName} (${g.permissionLevel})`)
        .join(', ')}.`,
      summaryFa: `این گروه مشخص می‌کند کدام کاربران یا سیستم‌ها این Group Policyها را دریافت یا مدیریت کنند: ${params.linkedGpos
        .slice(0, 6)
        .map((g) => g.gpoName)
        .join('، ')}.`,
      howItWorksEn: 'Adding or removing a user here will apply or remove these Windows GPO rules on next GPUpdate/logon.',
      howItWorksFa: 'اضافه یا حذف کردن کاربر از این گروه باعث اعمال یا برداشته شدن تنظیمات این GPOها روی سیستم او می‌شود.',
      sourceLabel: `${params.linkedGpos.length} GPOs`,
    });
  }

  // Exchange / Mail Group capabilities
  if (params.category === 'Distribution' || params.isMailEnabled) {
    insights.push({
      id: 'mail_capability',
      category: 'mail_exchange',
      severity: 'info',
      titleEn:
        params.category === 'Distribution'
          ? 'Email Distribution List Only (Does NOT Grant NTFS / Server Login Access)'
          : 'Mail-Enabled Security Group (Both Email List & Access Permissions)',
      titleFa:
        params.category === 'Distribution'
          ? 'گروه توزیع ایمیل (Distribution List — بدون مجوز دسترسی به فایل یا سیستم)'
          : 'گروه امنیتی ایمیل‌دار (هم دسترسی به منابع شبکه و هم ارسال ایمیل گروهی)',
      summaryEn:
        params.category === 'Distribution'
          ? `Primarily used in Exchange / Outlook for sending group emails${
              params.primaryEmail ? ` (${params.primaryEmail})` : ''
            }. Cannot be used on Windows file shares or login ACLs.`
          : `Works both as a Windows security permission group AND as a shared Exchange email address${
              params.primaryEmail ? ` (${params.primaryEmail})` : ''
            }.`,
      summaryFa:
        params.category === 'Distribution'
          ? `فقط برای ارسال ایمیل گروهی در Exchange / Outlook کاربرد دارد${
              params.primaryEmail ? ` (${params.primaryEmail})` : ''
            } و در دسترسی پوشه‌ها یا لاگین ویندوز تأثیری ندارد.`
          : `هم برای دادن مجوز به پوشه‌ها/سرویس‌ها استفاده می‌شود و هم برای دریافت ایمیل گروهی${
              params.primaryEmail ? ` (${params.primaryEmail})` : ''
            }.`,
      howItWorksEn:
        params.requireSenderAuth === false
          ? 'External internet senders are allowed to email this group.'
          : 'Internal authenticated senders / Exchange delivery rules apply.',
      howItWorksFa:
        params.requireSenderAuth === false
          ? 'دریافت ایمیل از بیرون سازمان (اینترنت) برای این گروه باز است.'
          : 'ارسال ایمیل به این گروه مطابق قوانین Exchange محدود به فرستندگان مجاز است.',
    });
  }

  // Explicit Write Membership delegation (HelpDesk-friendly summary of who can manage this group)
  const memberWriters = dedupeStrings(
    params.aclEntries
      .filter((a) => a.accessType === 'Allow' && a.isPrivilegeWrite)
      .map((a) => a.trustee)
  );
  if (memberWriters.length > 0) {
    insights.push({
      id: 'delegation_writers',
      category: 'delegation',
      severity: 'info',
      titleEn: `Who Can Add/Remove Members or Control This Group (${memberWriters.length} Trustees)`,
      titleFa: `چه کسانی مجاز به تغییر اعضا و مدیریت این گروه هستند؟ (${memberWriters.length} مورد)`,
      summaryEn: `Non-inherited or explicit directory permissions allow: ${memberWriters.slice(0, 8).join(', ')}.`,
      summaryFa: `افراد یا گروه‌هایی که روی این گروه مجوز نوشتن/مدیریت دارند: ${memberWriters.slice(0, 8).join('، ')}.`,
      howItWorksEn: 'Derived directly from the AD Object nTSecurityDescriptor Access Control List (DACL).',
      howItWorksFa: 'این اطلاعات مستقیماً از جدول دسترسی‌های آبجکت (DACL) در اکتیو دایرکتوری استخراج شده است.',
    });
  }

  // Scope & Category baseline human explanation (always present so every group is clear!)
  const scopeExplain: Record<AdGroupScope, { titleEn: string; titleFa: string; descEn: string; descFa: string }> = {
    Global: {
      titleEn: 'Global Security Scope (Standard Departmental / Role Group)',
      titleFa: 'محدوده Global (گروه استاندارد کارمندان، واحدها و نقش‌های سازمانی)',
      descEn:
        'Can contain user accounts and other Global groups from this domain, and can be assigned permissions on servers/shares across any trusted domain.',
      descFa:
        'برای گروه‌بندی کاربران یک دامین (مثل پرسنل مالی یا IT) استفاده می‌شود و می‌تواند روی منابع همه دامین‌های دارای Trust مجوز بگیرد.',
    },
    DomainLocal: {
      titleEn: 'Domain Local Scope (Resource / Folder / Printer Permission Group)',
      titleFa: 'محدوده Domain Local (گروه مجوز مستقیم روی پوشه اشتراکی، پرینتر یا سرور)',
      descEn:
        'Designed to grant permissions directly to a specific file share, folder ACL, printer, or local server resource inside this domain.',
      descFa:
        'معمولاً مستقیم در لیست Security یک پوشه اشتراکی (Share)، پرینتر یا دسترسی یک سرور محلی در همین دامین قرار می‌گیرد.',
    },
    Universal: {
      titleEn: 'Universal Scope (Cross-Domain & Exchange Enterprise Group)',
      titleFa: 'محدوده Universal (گروه سراسری در کل Forest و Exchange)',
      descEn:
        'Replicated to Global Catalog servers across the entire Forest; commonly used for multi-domain access and Exchange distribution groups.',
      descFa:
        'در کل Global Catalog تکرار می‌شود و برای دسترسی‌های بین چند دامین یا لیست‌های ایمیل سازمانی استفاده می‌گردد.',
    },
    BuiltinLocal: {
      titleEn: 'Built-in Local Domain Controller Scope (System Security Group)',
      titleFa: 'محدوده Builtin Local (گروه سیستمی داخلی دامین کنترلر)',
      descEn:
        'Default Windows system security group residing in CN=Builtin governing core Domain Controller and server OS privileges.',
      descFa: 'گروه پیش‌فرض سیستم‌عامل ویندوز سرور در مسیر Builtin که اختیارات پایه دامین کنترلرها را تعیین می‌کند.',
    },
    Unknown: {
      titleEn: 'Active Directory Group Scope',
      titleFa: 'محدوده گروه اکتیو دایرکتوری',
      descEn: 'Controls how members and resource permissions replicate within Active Directory.',
      descFa: 'نحوه عضوگیری و اعمال مجوزهای این گروه در ساختار اکتیو دایرکتوری را مشخص می‌کند.',
    },
  };

  const sc = scopeExplain[params.scope];
  insights.push({
    id: 'scope_rule',
    category: 'scope_rule',
    severity: 'info',
    titleEn: `${sc.titleEn} · ${params.category}`,
    titleFa: `${sc.titleFa} · نوع: ${params.category === 'Security' ? 'امنیتی (Security)' : 'توزیع ایمیل (Distribution)'}`,
    summaryEn: sc.descEn,
    summaryFa: sc.descFa,
    howItWorksEn: `Located in OU "${params.ou || '-'}". Resource-level NTFS file share permissions reside on target file servers unless linked via AD GPO/ACL.`,
    howItWorksFa: `محل نگهداری در AD: مسیر «${params.ou || '-'}». مجوزهای دقیق پوشه‌های شبکه (NTFS) روی خود فایل‌سرورها ذخیره می‌شوند و عضویت در این گروه کلید ورود به آن‌هاست.`,
  });

  const privilegeLevel: 'critical' | 'elevated' | 'standard' | 'distribution' = isBuiltinCritical
    ? 'critical'
    : isPrivileged
    ? 'elevated'
    : params.category === 'Distribution'
    ? 'distribution'
    : 'standard';

  let plainSummaryEn = '';
  let plainSummaryFa = '';
  if (privilegeLevel === 'critical') {
    plainSummaryEn = `CRITICAL PRIVILEGED GROUP: Adding a user to "${params.cn}" grants high-impact Domain Controller or full infrastructure administrative control. Verify strict management approval before adding anyone.`;
    plainSummaryFa = `گروه فوق‌العاده حساس (Critical Admin): عضویت در «${params.cn}» اختیارات گسترده مدیریتی روی کل دامین یا دامین کنترلرها می‌دهد. پیش از افزودن هر کاربر، تاییدیه کتبی مدیر شبکه ضروری است.`;
  } else if (privilegeLevel === 'elevated') {
    plainSummaryEn = `ELEVATED PERMISSION GROUP: "${params.cn}" either carries built-in server privileges, AdminSDHolder protection, or inherits elevated access from parent AD groups.`;
    plainSummaryFa = `گروه با سطح دسترسی ویژه (Elevated): گروه «${params.cn}» دارای مجوزهای سیستمی، محافظت AdminSDHolder یا ارث‌بری از گروه‌های مدیریتی بالاتر است.`;
  } else if (privilegeLevel === 'distribution') {
    plainSummaryEn = `EMAIL DISTRIBUTION GROUP: "${params.cn}" is used purely for sending group emails${
      params.primaryEmail ? ` (${params.primaryEmail})` : ''
    } and grants no Windows folder or login permissions.`;
    plainSummaryFa = `گروه توزیع ایمیل (Distribution): گروه «${params.cn}» فقط جهت دریافت/ارسال ایمیل گروهی استفاده می‌شود و دسترسی فایل‌شیر یا لاگین سیستم اعطا نمی‌کند.`;
  } else {
    plainSummaryEn = `STANDARD SECURITY GROUP: "${params.cn}" is a ${params.scope} Security group used to organize departmental users or grant access to specific shared folders, apps, VPN profiles, or GPOs.`;
    plainSummaryFa = `گروه امنیتی استاندارد (Standard Security): گروه «${params.cn}» برای تخصیص دسترسی‌های کاری (پوشه‌های مشترک شبکه، نرم‌افزارها، VPN یا پالیسی‌های GPO) به کارمندان بخش مربوطه کاربرد دارد.`;
  }

  return {
    isPrivileged,
    isBuiltinCritical,
    privilegeLevel,
    plainSummaryEn,
    plainSummaryFa,
    insights,
  };
}

// ============================================================================
// 4. PUBLIC API: SEARCH GROUPS, INSPECT GROUP, MANAGE MEMBERS
// ============================================================================

export async function searchDomainGroups(
  input: HelpdeskGroupSearchInput,
  policyContext?: HelpdeskAdPolicyContext
): Promise<{
  domainController: string;
  domainName: string;
  method: 'ldaps' | 'ldap';
  port: number;
  groups: HelpdeskGroupSearchHit[];
}> {
  const adminUsername = String(input.adminUsername || '').trim();
  const adminPassword = String(input.adminPassword || '');
  if (!adminUsername || !adminPassword) {
    throw new Error('Privileged domain username and password are required.');
  }

  // Fast exit if RBAC HelpDesk Policy restricts AD scope to Selected Only with no allowed groups
  if (
    policyContext &&
    !policyContext.hasFullAccess &&
    policyContext.policy?.targetHelpdeskAdScope === 'selected' &&
    (policyContext.policy.allowedHelpdeskAdGroups || []).length === 0
  ) {
    return {
      domainController: String(input.domainController || ''),
      domainName: '',
      method: 'ldaps',
      port: 636,
      groups: [],
    };
  }

  const safeDc = validateSafeHostOrIp(input.domainController, 'Domain Controller');
  const query = String(input.query || '').trim();
  const limit = Math.max(5, Math.min(100, Number(input.limit) || 40));

  const { adConfig, dcCandidates, domainHints } = await resolveDomainHintsForGroup({
    adminUsername,
    domainController: safeDc,
  });

  const { session, errors } = await openAuthenticatedLdapSession({
    input: {
      targetUsername: adminUsername,
      adminUsername,
      adminPassword,
      domainController: safeDc,
      ldapProtocol: input.ldapProtocol || 'auto',
    },
    adConfig,
    dcCandidates,
    domainHints,
  });

  if (!session) {
    throw new Error(
      `Failed to bind to Active Directory via LDAPS/LDAP: ${errors.slice(0, 4).join(' ; ')}`
    );
  }

  try {
    const escapedQ = escapeLdapFilterValue(query);
    const filter = query
      ? `(&(objectCategory=group)(|(cn=*${escapedQ}*)(sAMAccountName=*${escapedQ}*)(displayName=*${escapedQ}*)(mail=*${escapedQ}*)(description=*${escapedQ}*)))`
      : '(objectCategory=group)';

    const rows = await ldapSearchEntries(session.client, session.defaultNamingContext, {
      scope: 'sub',
      filter,
      attributes: [
        'cn',
        'sAMAccountName',
        'displayName',
        'description',
        'mail',
        'groupType',
        'adminCount',
        'member',
        'whenCreated',
        'distinguishedName',
        'objectSid',
      ],
      sizeLimit: Math.min(250, limit * 2),
      paged: { pageSize: Math.min(250, limit * 2) },
    });

    const mappedGroups: HelpdeskGroupSearchHit[] = rows.map((r) => {
      const cn = getFirstAttr(r.attrs, 'cn');
      const sam = getFirstAttr(r.attrs, 'sAMAccountName') || cn;
      const decoded = decodeGroupType(getFirstAttr(r.attrs, 'groupType'));
      const sid = parseBinarySid(r.buffers.objectsid?.[0]);
      const rid = getSidRid(sid);
      const adminCount = Number(getFirstAttr(r.attrs, 'adminCount') || 0) === 1;
      const isPriv =
        adminCount ||
        Boolean(WELL_KNOWN_PRIVILEGED_ROLES[rid]) && rid !== '513' && rid !== '515' ||
        Boolean(KNOWN_PRIV_GROUP_NAMES[sam.toLowerCase()]);

      return {
        cn: cn || sam,
        samAccountName: sam,
        displayName: getFirstAttr(r.attrs, 'displayName') || cn || sam,
        distinguishedName: r.dn || getFirstAttr(r.attrs, 'distinguishedName'),
        organizationalUnit: extractOuBreadcrumb(r.dn || getFirstAttr(r.attrs, 'distinguishedName')),
        description: getFirstAttr(r.attrs, 'description'),
        mail: getFirstAttr(r.attrs, 'mail'),
        groupScope: decoded.groupScope,
        groupCategory: decoded.groupCategory,
        isPrivileged: isPriv,
        adminCount,
        memberCountEstimate: getAllAttrs(r.attrs, 'member').length,
        whenCreated: adGeneralizedTimeToIso(getFirstAttr(r.attrs, 'whenCreated')),
      };
    });

    const allRules = await listHelpdeskExceptionsFromDb().catch(() => [] as HelpdeskExceptionRecord[]);
    const enabledGroupRules = allRules.filter((r) => r && r.enabled && r.ruleType === 'ad_group');
    const domShort = normalizeDomainCmp(session.domainName);
    const pol = policyContext && !policyContext.hasFullAccess ? policyContext.policy : null;
    const blockedGroups = pol?.blockedHelpdeskAdGroups || [];
    const adSelectedOnly = pol?.targetHelpdeskAdScope === 'selected';
    const allowedGroups = pol?.allowedHelpdeskAdGroups || [];

    const groups = mappedGroups.filter((g) => {
      const gCnL = g.cn.toLowerCase();
      const gSamL = g.samAccountName.toLowerCase();
      const gDnL = g.distinguishedName.toLowerCase();
      const hitGlobal = enabledGroupRules.some((rule) => {
        const rv = String(rule.targetValue || '').trim().toLowerCase();
        const rCn = rv.includes('cn=') ? extractCnFromDn(rv).toLowerCase() : rv.includes('\\') ? rv.split('\\').pop()! : rv;
        const rDom = normalizeDomainCmp(rule.domainName);
        if (rDom && domShort && rDom !== domShort) return false;
        return gCnL === rCn || gSamL === rCn || gDnL === rv;
      });
      if (hitGlobal) return false;

      const entryObj = [{ cn: g.cn, sam: g.samAccountName, dn: g.distinguishedName }];
      if (blockedGroups.length > 0 && matchAdGroupPatternList(blockedGroups, entryObj, session.domainName)) {
        return false;
      }
      if (adSelectedOnly) {
        if (allowedGroups.length === 0 || !matchAdGroupPatternList(allowedGroups, entryObj, session.domainName)) {
          return false;
        }
      }
      return true;
    });

    groups.sort((a, b) => {
      if (a.isPrivileged !== b.isPrivileged) return a.isPrivileged ? -1 : 1;
      return a.cn.localeCompare(b.cn);
    });

    return {
      domainController: session.host,
      domainName: session.domainName,
      method: session.useSsl ? 'ldaps' : 'ldap',
      port: session.port,
      groups: groups.slice(0, limit),
    };
  } finally {
    session.close();
  }
}

export async function inspectTargetDomainGroup(
  input: HelpdeskGroupInspectInput,
  policyContext?: HelpdeskAdPolicyContext
): Promise<HelpdeskGroupInspectionResult> {
  const cleanTarget = sanitizeAndValidateTargetGroup(input.targetGroup);
  const adminUsername = String(input.adminUsername || '').trim();
  const adminPassword = String(input.adminPassword || '');
  if (!adminUsername || !adminPassword) {
    throw new Error('Privileged domain username and password are required.');
  }

  // Pre-connect policy guard (blocks empty allowlist or explicit group block before binding)
  const preGroupCheck = await enforceDomainGroupPolicyAndExceptions({
    groupCn: cleanTarget.includes('=') ? extractCnFromDn(cleanTarget) : cleanTarget,
    groupSam: cleanTarget.includes('\\') ? cleanTarget.split('\\').pop()! : cleanTarget,
    groupDn: /^(?:CN|OU)=/i.test(cleanTarget) ? cleanTarget : '',
    domainName: '',
    policyContext,
    actionLabel: 'Group Inspection',
    actionLabelFa: 'بررسی گروه',
  });
  if (preGroupCheck.blocked) {
    const err: any = new Error(preGroupCheck.reasonEn);
    err.reasonFa = preGroupCheck.reasonFa;
    err.blockedByException = true;
    throw err;
  }

  const safeDc = validateSafeHostOrIp(input.domainController, 'Domain Controller');

  const { adConfig, dcCandidates, pdcHost, domainHints } = await resolveDomainHintsForGroup({
    targetGroup: cleanTarget,
    adminUsername,
    domainController: safeDc,
  });

  const { session, errors } = await openAuthenticatedLdapSession({
    input: {
      targetUsername: adminUsername,
      adminUsername,
      adminPassword,
      domainController: safeDc,
      ldapProtocol: input.ldapProtocol || 'auto',
    },
    adConfig,
    dcCandidates,
    domainHints,
  });

  if (!session) {
    throw new Error(
      `Failed to connect to Active Directory via LDAPS/LDAP: ${errors.slice(0, 4).join(' ; ')}`
    );
  }

  try {
    const groupAttrs = [
      'cn',
      'name',
      'sAMAccountName',
      'displayName',
      'description',
      'info',
      'mail',
      'mailNickname',
      'proxyAddresses',
      'whenCreated',
      'whenChanged',
      'distinguishedName',
      'objectSid',
      'objectGUID',
      'groupType',
      'primaryGroupToken',
      'adminCount',
      'managedBy',
      'member',
      'memberOf',
      'msDS-PSOAppliesTo',
      'nTSecurityDescriptor',
      'msExchRequireAuthToSendTo',
      'msExchHideFromAddressLists',
      'authOrig',
      'dlMemSubmitPerms',
      'uSNCreated',
    ];

    // Optional LDAP_SERVER_SD_FLAGS_OID (1.2.840.113556.1.4.801) control requesting Owner (1) + Group (2) + DACL (4) = 7
    const ControlsCtor: any = (ldap as any).Control;
    const sdControl =
      typeof ControlsCtor === 'function'
        ? new ControlsCtor({
            type: '1.2.840.113556.1.4.801',
            criticality: false,
            value: Buffer.from([0x30, 0x03, 0x02, 0x01, 0x07]),
          })
        : undefined;

    const isDnInput = /^(?:CN|OU)=/i.test(cleanTarget) && /DC=/i.test(cleanTarget);
    const shortName = cleanTarget.includes('\\') ? cleanTarget.split('\\').pop()! : cleanTarget;
    const escapedTarget = escapeLdapFilterValue(shortName);

    const searchFilter = isDnInput
      ? '(objectCategory=group)'
      : `(&(objectCategory=group)(|(sAMAccountName=${escapedTarget})(cn=${escapedTarget})(name=${escapedTarget})(displayName=${escapedTarget})(mail=${escapedTarget})))`;

    const searchBase = isDnInput ? cleanTarget : session.defaultNamingContext;
    const searchScope = isDnInput ? 'base' : 'sub';

    let entries: Array<{ attrs: Record<string, string[]>; buffers: Record<string, Buffer[]>; dn: string }> = [];
    try {
      entries = await ldapSearchEntries(
        session.client,
        searchBase,
        {
          scope: searchScope,
          filter: searchFilter,
          attributes: groupAttrs,
          sizeLimit: 5,
        },
        sdControl ? [sdControl] : undefined
      );
    } catch {
      // Retry without SD control if DC policy rejects the extended control
      entries = await ldapSearchEntries(session.client, searchBase, {
        scope: searchScope,
        filter: searchFilter,
        attributes: groupAttrs,
        sizeLimit: 5,
      });
    }

    // Fallback: partial prefix/contains match if exact name wasn't matched (e.g. "Domain Admin" -> "Domain Admins" if unique)
    if (entries.length === 0 && !isDnInput) {
      try {
        entries = await ldapSearchEntries(session.client, session.defaultNamingContext, {
          scope: 'sub',
          filter: `(&(objectCategory=group)(|(cn=${escapedTarget})(sAMAccountName=${escapedTarget})))`,
          attributes: groupAttrs,
          sizeLimit: 5,
        });
      } catch {}
    }

    if (entries.length === 0) {
      throw new Error(
        `Active Directory group "${cleanTarget}" was not found in domain "${session.domainName || session.defaultNamingContext}".`
      );
    }

    const entry =
      entries.find((e) => getFirstAttr(e.attrs, 'sAMAccountName').toLowerCase() === shortName.toLowerCase()) ||
      entries.find((e) => getFirstAttr(e.attrs, 'cn').toLowerCase() === shortName.toLowerCase()) ||
      entries[0];

    const groupDn = entry.dn || getFirstAttr(entry.attrs, 'distinguishedName');
    const cn = getFirstAttr(entry.attrs, 'cn') || extractCnFromDn(groupDn);
    const sam = getFirstAttr(entry.attrs, 'sAMAccountName') || cn;
    const displayName = getFirstAttr(entry.attrs, 'displayName') || cn;
    const description = getFirstAttr(entry.attrs, 'description');
    const notes = getFirstAttr(entry.attrs, 'info');
    const objectSid = parseBinarySid(entry.buffers.objectsid?.[0]);
    const objectGuid = parseBinaryGuid(entry.buffers.objectguid?.[0]);
    const whenCreated = adGeneralizedTimeToIso(getFirstAttr(entry.attrs, 'whenCreated'));
    const whenChanged = adGeneralizedTimeToIso(getFirstAttr(entry.attrs, 'whenChanged'));
    const createdAgeDays = whenCreated
      ? Math.max(0, Math.floor((Date.now() - new Date(whenCreated).getTime()) / 86400000))
      : null;
    const usnCreated = getFirstAttr(entry.attrs, 'uSNCreated');
    const decodedType = decodeGroupType(getFirstAttr(entry.attrs, 'groupType'));
    const adminCount = Number(getFirstAttr(entry.attrs, 'adminCount') || 0) === 1;
    const primaryTokenStr = getFirstAttr(entry.attrs, 'primaryGroupToken');
    const primaryGroupToken =
      primaryTokenStr && Number.isFinite(Number(primaryTokenStr)) ? Number(primaryTokenStr) : null;

    const organizationalUnit = extractOuBreadcrumb(groupDn);
    const ouSegments = organizationalUnit && organizationalUnit !== '-'
      ? organizationalUnit.split(' / ').filter(Boolean)
      : [];

    // Enforce Global HelpDesk Exceptions & Access Policy AD Group Scope immediately upon resolution
    const resolvedGroupCheck = await enforceDomainGroupPolicyAndExceptions({
      groupCn: cn,
      groupSam: sam,
      groupDn,
      domainName: session.domainName,
      policyContext,
      actionLabel: 'Group Inspection',
      actionLabelFa: 'بررسی گروه',
    });
    if (resolvedGroupCheck.blocked) {
      const err: any = new Error(resolvedGroupCheck.reasonEn);
      err.reasonFa = resolvedGroupCheck.reasonFa;
      err.blockedByException = true;
      throw err;
    }

    // 1) Collect all Direct Member DNs (including range retrieval if >1500)
    const directRes = await collectAllDirectMemberDns(session, groupDn, entry, 1000);
    const directMemberMap = await batchHydrateDnsViaLdap(session, directRes.dns);
    const directMembers: HelpdeskGroupMemberEntry[] = directRes.dns
      .map((dn) => directMemberMap.get(dn.toLowerCase())!)
      .filter(Boolean);

    // 2) Primary Group Members (crucial for Domain Users 513, Domain Computers 515, Domain Controllers 516, etc.)
    const groupRid = primaryGroupToken || Number(getSidRid(objectSid) || 0) || null;
    const primaryGroupMembers: HelpdeskGroupMemberEntry[] = [];
    let primaryMembersTruncated = false;
    if (groupRid && (groupRid >= 512 || directRes.totalEstimate === 0)) {
      try {
        const primaryRows = await ldapSearchEntries(session.client, session.defaultNamingContext, {
          scope: 'sub',
          filter: `(primaryGroupID=${groupRid})`,
          attributes: [
            'objectClass',
            'cn',
            'sAMAccountName',
            'displayName',
            'department',
            'title',
            'description',
            'mail',
            'userAccountControl',
            'lockoutTime',
            'distinguishedName',
          ],
          sizeLimit: 251,
        });
        if (primaryRows.length > 250) primaryMembersTruncated = true;
        for (const r of primaryRows.slice(0, 250)) {
          const dn = r.dn || getFirstAttr(r.attrs, 'distinguishedName');
          const classes = getAllAttrs(r.attrs, 'objectClass');
          const objectType = classifyMemberObjectType(classes);
          const uac = Number(getFirstAttr(r.attrs, 'userAccountControl') || 0);
          const lockRaw = getFirstAttr(r.attrs, 'lockoutTime');
          primaryGroupMembers.push({
            dn,
            cn: getFirstAttr(r.attrs, 'cn') || extractCnFromDn(dn),
            samAccountName: getFirstAttr(r.attrs, 'sAMAccountName') || extractCnFromDn(dn),
            displayName: getFirstAttr(r.attrs, 'displayName') || getFirstAttr(r.attrs, 'cn') || extractCnFromDn(dn),
            objectType,
            department: getFirstAttr(r.attrs, 'department'),
            jobTitle: getFirstAttr(r.attrs, 'title'),
            description: getFirstAttr(r.attrs, 'description'),
            email: getFirstAttr(r.attrs, 'mail'),
            organizationalUnit: extractOuBreadcrumb(dn),
            accountEnabled:
              objectType === 'user' || objectType === 'computer' ? (uac & 0x0002) === 0 : null,
            accountLocked: objectType === 'user' ? Boolean(lockRaw && lockRaw !== '0') : null,
            isPrimaryGroupMember: true,
          });
        }
      } catch {}
    }

    // 3) Transitive Inherited Members via child nested groups (LDAP_MATCHING_RULE_IN_CHAIN 1.2.840.113556.1.4.1941)
    const directChildGroups = directMembers.filter((m) => m.objectType === 'group');
    const directDnSet = new Set(directMembers.map((m) => m.dn.toLowerCase()));
    const effectiveInheritedMembers: HelpdeskGroupMemberEntry[] = [];
    let inheritedTruncated = false;
    if (directChildGroups.length > 0) {
      try {
        const transRows = await ldapSearchEntries(session.client, session.defaultNamingContext, {
          scope: 'sub',
          filter: `(memberOf:1.2.840.113556.1.4.1941:=${escapeLdapFilterValue(groupDn)})`,
          attributes: [
            'objectClass',
            'cn',
            'sAMAccountName',
            'displayName',
            'department',
            'title',
            'description',
            'mail',
            'userAccountControl',
            'lockoutTime',
            'memberOf',
            'distinguishedName',
          ],
          sizeLimit: 351,
        });
        if (transRows.length > 350) inheritedTruncated = true;
        const childGroupMap = new Map(directChildGroups.map((g) => [g.dn.toLowerCase(), g]));
        for (const r of transRows.slice(0, 350)) {
          const dn = r.dn || getFirstAttr(r.attrs, 'distinguishedName');
          if (!dn || directDnSet.has(dn.toLowerCase())) continue;
          const classes = getAllAttrs(r.attrs, 'objectClass');
          const objectType = classifyMemberObjectType(classes);
          const uac = Number(getFirstAttr(r.attrs, 'userAccountControl') || 0);
          const lockRaw = getFirstAttr(r.attrs, 'lockoutTime');
          const memOf = getAllAttrs(r.attrs, 'memberOf');
          const via = memOf.map((m) => childGroupMap.get(m.toLowerCase())).find(Boolean);
          effectiveInheritedMembers.push({
            dn,
            cn: getFirstAttr(r.attrs, 'cn') || extractCnFromDn(dn),
            samAccountName: getFirstAttr(r.attrs, 'sAMAccountName') || extractCnFromDn(dn),
            displayName: getFirstAttr(r.attrs, 'displayName') || getFirstAttr(r.attrs, 'cn') || extractCnFromDn(dn),
            objectType,
            department: getFirstAttr(r.attrs, 'department'),
            jobTitle: getFirstAttr(r.attrs, 'title'),
            description: getFirstAttr(r.attrs, 'description'),
            email: getFirstAttr(r.attrs, 'mail'),
            organizationalUnit: extractOuBreadcrumb(dn),
            accountEnabled:
              objectType === 'user' || objectType === 'computer' ? (uac & 0x0002) === 0 : null,
            accountLocked: objectType === 'user' ? Boolean(lockRaw && lockRaw !== '0') : null,
            isInherited: true,
            viaGroupCn: via?.cn || (memOf[0] ? extractCnFromDn(memOf[0]) : undefined),
            viaGroupDn: via?.dn || memOf[0],
          });
        }
      } catch {}
    }

    // 4) Direct & Transitive Parent Groups (this group is a memberOf -> inherits their domain rights)
    const directParentDns = getAllAttrs(entry.attrs, 'memberOf');
    const directParentSet = new Set(directParentDns.map((d) => d.toLowerCase()));
    const parentGroups: HelpdeskGroupParentEntry[] = [];
    try {
      const parentRows = await ldapSearchEntries(session.client, session.defaultNamingContext, {
        scope: 'sub',
        filter: `(member:1.2.840.113556.1.4.1941:=${escapeLdapFilterValue(groupDn)})`,
        attributes: ['cn', 'sAMAccountName', 'groupType', 'description', 'adminCount', 'objectSid', 'distinguishedName'],
        sizeLimit: 100,
      });
      for (const r of parentRows) {
        const pDn = r.dn || getFirstAttr(r.attrs, 'distinguishedName');
        const pCn = getFirstAttr(r.attrs, 'cn') || extractCnFromDn(pDn);
        const pSam = getFirstAttr(r.attrs, 'sAMAccountName') || pCn;
        const dec = decodeGroupType(getFirstAttr(r.attrs, 'groupType'));
        const pSid = parseBinarySid(r.buffers.objectsid?.[0]);
        const pRid = getSidRid(pSid);
        const pAdmin = Number(getFirstAttr(r.attrs, 'adminCount') || 0) === 1;
        const pPriv =
          pAdmin ||
          (Boolean(WELL_KNOWN_PRIVILEGED_ROLES[pRid]) && pRid !== '513' && pRid !== '515') ||
          Boolean(KNOWN_PRIV_GROUP_NAMES[pSam.toLowerCase()]);
        parentGroups.push({
          cn: pCn,
          samAccountName: pSam,
          dn: pDn,
          ou: extractOuBreadcrumb(pDn),
          groupScope: dec.groupScope,
          groupCategory: dec.groupCategory,
          isPrivileged: pPriv,
          isDirect: directParentSet.has(pDn.toLowerCase()),
          description: getFirstAttr(r.attrs, 'description'),
        });
      }
    } catch {
      // Fallback to direct parent DNs if matching rule chain fails on legacy LDAP
      const pMap = await batchHydrateDnsViaLdap(session, directParentDns);
      for (const pDn of directParentDns) {
        const hit = pMap.get(pDn.toLowerCase());
        const pCn = hit?.cn || extractCnFromDn(pDn);
        const pSam = hit?.samAccountName || pCn;
        parentGroups.push({
          cn: pCn,
          samAccountName: pSam,
          dn: pDn,
          ou: extractOuBreadcrumb(pDn),
          groupScope: hit?.nestedScope || 'Unknown',
          groupCategory: hit?.nestedCategory || 'Security',
          isPrivileged: Boolean(KNOWN_PRIV_GROUP_NAMES[pSam.toLowerCase()]),
          isDirect: true,
          description: '',
        });
      }
    }

    // 5) ManagedBy Manager lookup
    const managedByDn = getFirstAttr(entry.attrs, 'managedBy');
    let managedBy: HelpdeskGroupInspectionResult['lifecycleAndOwnership']['managedBy'] = null;
    if (managedByDn) {
      const mMap = await batchHydrateDnsViaLdap(session, [managedByDn]);
      const mgr = mMap.get(managedByDn.toLowerCase());
      managedBy = {
        dn: managedByDn,
        cn: mgr?.cn || extractCnFromDn(managedByDn),
        samAccountName: mgr?.samAccountName || extractCnFromDn(managedByDn),
        displayName: mgr?.displayName || extractCnFromDn(managedByDn),
        department: mgr?.department || '',
        jobTitle: mgr?.jobTitle || '',
        email: mgr?.email || '',
        ou: mgr?.organizationalUnit || extractOuBreadcrumb(managedByDn),
      };
    }

    // 6) Parse nTSecurityDescriptor Owner & DACL Permissions directly from LDAP
    const sdBuf = entry.buffers.ntsecuritydescriptor?.[0];
    const parsedSd = parseBinarySecurityDescriptor(sdBuf);
    const allSidsToResolve = [
      ...(parsedSd.ownerSid ? [parsedSd.ownerSid] : []),
      ...parsedSd.aces.map((a) => a.trusteeSid),
    ];
    const sidMap = await resolveSidsViaLdap(session, allSidsToResolve);
    const objectOwnerSid = parsedSd.ownerSid;
    const objectOwner =
      (objectOwnerSid && (sidMap.get(objectOwnerSid) || objectOwnerSid)) || '';

    const aclEntries: HelpdeskGroupAclEntry[] = [];
    const seenAclKey = new Set<string>();
    for (const ace of parsedSd.aces) {
      const trustee = sidMap.get(ace.trusteeSid) || ace.trusteeSid;
      const desc = describeAccessMask(ace.mask, ace.objectTypeGuid);
      const dedupeKey = `${ace.trusteeSid}|${ace.accessType}|${desc.rightsEn}|${ace.isInherited}`;
      if (seenAclKey.has(dedupeKey)) continue;
      seenAclKey.add(dedupeKey);
      aclEntries.push({
        trustee,
        trusteeSid: ace.trusteeSid,
        accessType: ace.accessType,
        rightsLabelEn: desc.rightsEn,
        rightsLabelFa: desc.rightsFa,
        scopeNoteEn: desc.scopeEn,
        scopeNoteFa: desc.scopeFa,
        isInherited: ace.isInherited,
        isPrivilegeWrite: desc.isPrivilegeWrite,
      });
    }

    // Determine whether managedBy manager explicitly holds Write Members on DACL
    let managerCanUpdateMembershipList: boolean | null = null;
    if (managedBy) {
      const mgrLower = managedBy.samAccountName.toLowerCase();
      managerCanUpdateMembershipList = aclEntries.some(
        (a) =>
          a.accessType === 'Allow' &&
          a.isPrivilegeWrite &&
          a.trustee.toLowerCase().includes(mgrLower)
      );
    }

    // 7) Linked Fine-Grained Password Policies (msDS-PSOAppliesTo)
    const psoDns = getAllAttrs(entry.attrs, 'msDS-PSOAppliesTo');
    const appliedPasswordPolicies: HelpdeskGroupInspectionResult['permissions']['appliedPasswordPolicies'] = [];
    for (const psoDn of psoDns.slice(0, 10)) {
      try {
        const pRows = await ldapSearchEntries(session.client, psoDn, {
          scope: 'base',
          filter: '(objectClass=*)',
          attributes: [
            'cn',
            'msDS-PasswordSettingsPrecedence',
            'msDS-MinimumPasswordLength',
            'msDS-LockoutThreshold',
            'msDS-MaximumPasswordAge',
          ],
        });
        if (pRows[0]) {
          appliedPasswordPolicies.push({
            name: getFirstAttr(pRows[0].attrs, 'cn') || extractCnFromDn(psoDn),
            precedence: Number(getFirstAttr(pRows[0].attrs, 'msDS-PasswordSettingsPrecedence') || 0) || null,
            minLength: Number(getFirstAttr(pRows[0].attrs, 'msDS-MinimumPasswordLength') || 0) || null,
            lockoutThreshold: Number(getFirstAttr(pRows[0].attrs, 'msDS-LockoutThreshold') || 0) || null,
            maxPasswordAgeDays: adDurationToDays(getFirstAttr(pRows[0].attrs, 'msDS-MaximumPasswordAge')),
          });
        }
      } catch {}
    }

    // 8) Mail & Exchange distribution info
    const primaryEmail = getFirstAttr(entry.attrs, 'mail');
    const mailNickname = getFirstAttr(entry.attrs, 'mailNickname');
    const proxyRaw = getAllAttrs(entry.attrs, 'proxyAddresses');
    const emailAliases: Array<{ address: string; protocol: string; isPrimary: boolean }> = [];
    const seenMail = new Set<string>();
    for (const p of proxyRaw) {
      const colonIdx = p.indexOf(':');
      if (colonIdx <= 0) continue;
      const proto = p.slice(0, colonIdx);
      const addr = p.slice(colonIdx + 1).trim();
      if (!addr || seenMail.has(addr.toLowerCase())) continue;
      seenMail.add(addr.toLowerCase());
      emailAliases.push({
        address: addr,
        protocol: proto.toUpperCase(),
        isPrimary: proto === 'SMTP',
      });
    }
    if (primaryEmail && !seenMail.has(primaryEmail.toLowerCase())) {
      emailAliases.unshift({ address: primaryEmail, protocol: 'SMTP', isPrimary: true });
    }
    const isMailEnabled = Boolean(primaryEmail || mailNickname || emailAliases.length > 0);
    const reqAuthRaw = getFirstAttr(entry.attrs, 'msExchRequireAuthToSendTo');
    const requireSenderAuthentication = reqAuthRaw
      ? reqAuthRaw.toLowerCase() === 'true'
      : null;
    const hideRaw = getFirstAttr(entry.attrs, 'msExchHideFromAddressLists');
    const hideFromAddressLists = hideRaw ? hideRaw.toLowerCase() === 'true' : null;
    const authOrigCount = getAllAttrs(entry.attrs, 'authOrig').length + getAllAttrs(entry.attrs, 'dlMemSubmitPerms').length;

    const deliveryRestrictionNoteEn = !isMailEnabled
      ? 'This group has no Exchange email address.'
      : authOrigCount > 0
      ? `Delivery restricted to ${authOrigCount} authorized sender(s)/group(s).`
      : requireSenderAuthentication === false
      ? 'Allows external (Internet) and internal senders to email this group.'
      : 'Authenticated internal domain senders can email this group.';
    const deliveryRestrictionNoteFa = !isMailEnabled
      ? 'این گروه فاقد آدرس ایمیل در Exchange است.'
      : authOrigCount > 0
      ? `ارسال ایمیل به این گروه محدود به ${authOrigCount} فرستنده/گروه مجاز است.`
      : requireSenderAuthentication === false
      ? 'دریافت ایمیل از اینترنت (خارج سازمان) و کاربران داخلی باز است.'
      : 'فقط کاربران احراز هویت‌شده داخل سازمان مجاز به ارسال ایمیل به این گروه هستند.';

    // 9) Optional WinRM DC query for Event Log Creator, recent Membership Events & GPO Security Filtering
    const winrmHosts = dedupeStrings([pdcHost, session.host]);
    const winrmEnrich = await collectGroupAuditEventsAndGposViaWinrm({
      dcHosts: winrmHosts,
      adminUsername,
      adminPassword,
      winrmProtocol: input.winrmProtocol || 'auto',
      groupSam: sam,
      groupCn: cn,
      groupSid: objectSid,
      groupDn,
    });

    const creatorSource: HelpdeskGroupInspectionResult['lifecycleAndOwnership']['creatorSource'] =
      winrmEnrich.creatorAccount
        ? 'security_event_log'
        : objectOwner
        ? 'ad_owner_fallback'
        : 'unavailable';

    const creatorAccount = winrmEnrich.creatorAccount || objectOwner || '';
    const creatorNoteEn = winrmEnrich.creatorAccount
      ? `Verified from DC Security Event Log creation event on ${winrmEnrich.creatorDc}.`
      : objectOwner
      ? `AD does not store a separate "CreatedBy" attribute once Security Logs (4727/4731/4754) rotate; current AD Object Owner is "${objectOwner}" (Active Directory automatically sets the creator as Owner when a group is created).`
      : 'Creator event was not found within DC Security Log retention and nTSecurityDescriptor Owner could not be read.';
    const creatorNoteFa = winrmEnrich.creatorAccount
      ? `سازنده دقیق گروه از رویداد Security Event Log در دامین کنترلر ${winrmEnrich.creatorDc} استخراج شد.`
      : objectOwner
      ? `اکتیو دایرکتوری به صورت پیش‌فرض نام سازنده را فقط در لاگ‌های رویداد (4727/4731/4754) نگه می‌دارد؛ مالک فعلی آبجکت (Object Owner) در AD مقدار «${objectOwner}» است (در زمان ساخت گروه، خود سازنده به صورت خودکار به عنوان Owner ثبت می‌شود).`
      : 'رویداد ساخت در بازه نگهداری لاگ امنیتی دامین کنترلر یافت نشد و خواندن Owner از AD نیز میسر نبود.';

    // 10) Build plain-language human-readable permissions insights
    const translatedPerms = buildPlainLanguagePermissions({
      cn,
      sam,
      sid: objectSid,
      ou: organizationalUnit,
      scope: decodedType.groupScope,
      category: decodedType.groupCategory,
      adminCount,
      isMailEnabled,
      primaryEmail,
      requireSenderAuth: requireSenderAuthentication,
      parentGroups,
      linkedGpos: winrmEnrich.gpos,
      appliedPsos: appliedPasswordPolicies,
      aclEntries,
    });

    const directUsersCount = directMembers.filter((m) => m.objectType === 'user').length;
    const directGroupsCount = directMembers.filter((m) => m.objectType === 'group').length;
    const directComputersCount = directMembers.filter((m) => m.objectType === 'computer').length;
    const directContactsCount = directMembers.filter((m) => m.objectType === 'contact').length;
    const disabledMembersCount = [...directMembers, ...primaryGroupMembers].filter(
      (m) => m.accountEnabled === false
    ).length;
    const lockedMembersCount = [...directMembers, ...primaryGroupMembers].filter(
      (m) => m.accountLocked === true
    ).length;

    return {
      found: true,
      collectedAt: new Date().toISOString(),
      queryTarget: cleanTarget,
      connectionInfo: {
        method: session.useSsl ? 'ldaps' : 'ldap',
        domainController: session.host,
        port: session.port,
        domainName: session.domainName,
        baseDn: session.defaultNamingContext,
        pdcEmulator: pdcHost || undefined,
      },
      identity: {
        cn,
        samAccountName: sam,
        displayName,
        description,
        notes,
        distinguishedName: groupDn,
        organizationalUnit,
        ouSegments,
        domainName: session.domainName,
        objectSid,
        objectGuid,
        groupTypeRaw: decodedType.groupTypeRaw,
        groupScope: decodedType.groupScope,
        groupCategory: decodedType.groupCategory,
        primaryGroupToken,
        adminCount,
        isBuiltinCritical: translatedPerms.isBuiltinCritical,
        isPrivileged: translatedPerms.isPrivileged,
        privilegeLevel: translatedPerms.privilegeLevel,
      },
      lifecycleAndOwnership: {
        whenCreated,
        whenChanged,
        createdAgeDays,
        usnCreated,
        objectOwner,
        objectOwnerSid,
        creatorAccount,
        creatorTimestamp: winrmEnrich.creatorTimestamp,
        creatorDc: winrmEnrich.creatorDc,
        creatorSource,
        creatorNoteEn,
        creatorNoteFa,
        managedBy,
        managerCanUpdateMembershipList,
      },
      mailAndExchange: {
        isMailEnabled,
        primaryEmail,
        mailNickname,
        emailAliases,
        requireSenderAuthentication,
        hideFromAddressLists,
        deliveryRestrictionNoteEn,
        deliveryRestrictionNoteFa,
      },
      membershipSummary: {
        totalDirectMembers: directRes.totalEstimate,
        totalPrimaryGroupMembers: primaryGroupMembers.length,
        totalInheritedUsers: effectiveInheritedMembers.length,
        directUsersCount,
        directGroupsCount,
        directComputersCount,
        directContactsCount,
        disabledMembersCount,
        lockedMembersCount,
        membersTruncated: directRes.truncated,
        primaryMembersTruncated,
        inheritedTruncated,
      },
      directMembers,
      primaryGroupMembers,
      nestedChildGroups: directChildGroups,
      effectiveInheritedMembers,
      parentGroups,
      permissions: {
        plainSummaryEn: translatedPerms.plainSummaryEn,
        plainSummaryFa: translatedPerms.plainSummaryFa,
        insights: translatedPerms.insights,
        linkedGpos: winrmEnrich.gpos,
        appliedPasswordPolicies,
        aclEntries,
        aclSource: aclEntries.length > 0 ? 'ldap_sd' : 'unavailable',
      },
      auditEventsStatus: winrmEnrich.status,
      auditEventsNoteEn: winrmEnrich.noteEn,
      auditEventsNoteFa: winrmEnrich.noteFa,
      auditEvents: winrmEnrich.events,
    };
  } finally {
    session.close();
  }
}

async function enforceDomainGroupPolicyAndExceptions(params: {
  groupCn: string;
  groupSam: string;
  groupDn: string;
  domainName: string;
  policyContext?: HelpdeskAdPolicyContext;
  actionLabel?: string;
  actionLabelFa?: string;
}): Promise<{ blocked: boolean; reasonEn?: string; reasonFa?: string }> {
  const pol = params.policyContext && !params.policyContext.hasFullAccess ? params.policyContext.policy : null;
  const actEn = params.actionLabel || 'Group Inspection';
  const actFa = params.actionLabelFa || 'عملیات گروه';

  if (
    pol &&
    pol.targetHelpdeskAdScope === 'selected' &&
    (pol.allowedHelpdeskAdGroups || []).length === 0
  ) {
    return {
      blocked: true,
      reasonEn: `${actEn} blocked by RBAC HelpDesk Policy: AD scope is set to Selected Only, but no AD groups are permitted.`,
      reasonFa: `${actFa} توسط پالیسی هلپ‌دسک مسدود شد: محدوده اکتیو دایرکتوری روی «فقط موارد مجاز» است اما هیچ گروهی مجاز تعریف نشده است.`,
    };
  }

  const allRules = await listHelpdeskExceptionsFromDb().catch(() => [] as HelpdeskExceptionRecord[]);
  const enabled = allRules.filter((r) => r && r.enabled && r.ruleType === 'ad_group');
  const domShort = normalizeDomainCmp(params.domainName);
  const gCnL = params.groupCn.toLowerCase();
  const gSamL = params.groupSam.toLowerCase();
  const gDnL = params.groupDn.toLowerCase();

  for (const rule of enabled) {
    const rv = String(rule.targetValue || '').trim().toLowerCase();
    const rCn = rv.includes('cn=') ? extractCnFromDn(rv).toLowerCase() : rv.includes('\\') ? rv.split('\\').pop()! : rv;
    const rDom = normalizeDomainCmp(rule.domainName);
    if (rDom && domShort && rDom !== domShort) continue;
    if (gCnL === rCn || gSamL === rCn || (gDnL && gDnL === rv)) {
      return {
        blocked: true,
        reasonEn: `${actEn} blocked by HelpDesk exception policy: target group "${params.groupCn}" matches excluded AD group rule "${rule.targetValue}".`,
        reasonFa: `${actFa} توسط قانون استثنائات هلپ‌دسک مسدود شد: گروه «${params.groupCn}» در لیست مسدودشده «${rule.targetValue}» قرار دارد.`,
      };
    }
  }

  if (pol) {
    const entryObj = [{ cn: params.groupCn, sam: params.groupSam, dn: params.groupDn }];
    if ((pol.blockedHelpdeskAdGroups || []).length > 0) {
      const m = matchAdGroupPatternList(pol.blockedHelpdeskAdGroups || [], entryObj, params.domainName);
      if (m) {
        return {
          blocked: true,
          reasonEn: `${actEn} blocked by RBAC HelpDesk Policy: group "${params.groupCn}" matches restricted AD group rule "${m.pattern}".`,
          reasonFa: `${actFa} توسط پالیسی هلپ‌دسک مسدود شد: گروه «${params.groupCn}» مشمول قانون مسدودسازی «${m.pattern}» است.`,
        };
      }
    }

    if (pol.targetHelpdeskAdScope === 'selected') {
      const allowed = pol.allowedHelpdeskAdGroups || [];
      if (!matchAdGroupPatternList(allowed, entryObj, params.domainName)) {
        return {
          blocked: true,
          reasonEn: `${actEn} blocked by RBAC HelpDesk Policy: group "${params.groupCn}" is outside your policy's permitted AD groups scope.`,
          reasonFa: `${actFa} توسط پالیسی هلپ‌دسک مسدود شد: گروه «${params.groupCn}» در محدوده گروه‌های مجاز پالیسی شما قرار ندارد.`,
        };
      }
    }
  }

  return { blocked: false };
}

// Check HelpDesk Exceptions against both the target group and the target member
async function checkGroupActionExceptionPolicy(params: {
  groupCn: string;
  groupSam: string;
  groupDn: string;
  memberSam: string;
  memberUpn: string;
  memberDn: string;
  memberGroupDns: string[];
  domainName: string;
  policyContext?: HelpdeskAdPolicyContext;
}): Promise<{ blocked: boolean; reasonEn?: string; reasonFa?: string }> {
  const grpCheck = await enforceDomainGroupPolicyAndExceptions({
    groupCn: params.groupCn,
    groupSam: params.groupSam,
    groupDn: params.groupDn,
    domainName: params.domainName,
    policyContext: params.policyContext,
    actionLabel: 'Action',
    actionLabelFa: 'عملیات',
  });
  if (grpCheck.blocked) return grpCheck;

  const allRules = await listHelpdeskExceptionsFromDb().catch(() => [] as HelpdeskExceptionRecord[]);
  const enabled = allRules.filter((r) => r && r.enabled);
  const domShort = normalizeDomainCmp(params.domainName);
  const mSamL = params.memberSam.toLowerCase();
  const mUpnL = params.memberUpn.toLowerCase();

  for (const rule of enabled) {
    if (rule.ruleType === 'ad_group') {
      const rv = String(rule.targetValue || '').trim().toLowerCase();
      const rCn = rv.includes('cn=') ? extractCnFromDn(rv).toLowerCase() : rv.includes('\\') ? rv.split('\\').pop()! : rv;
      const rDom = normalizeDomainCmp(rule.domainName);
      if (rDom && domShort && rDom !== domShort) continue;

      if (
        params.memberGroupDns.some(
          (mg) => extractCnFromDn(mg).toLowerCase() === rCn || mg.toLowerCase() === rv
        )
      ) {
        return {
          blocked: true,
          reasonEn: `Action blocked by HelpDesk exception policy: member "${params.memberSam}" belongs to excluded AD group "${rule.targetValue}".`,
          reasonFa: `عملیات توسط قانون استثنائات هلپ‌دسک مسدود شد: عضو «${params.memberSam}» عضو گروه مسدودشده «${rule.targetValue}» است.`,
        };
      }
    } else if (rule.ruleType === 'ad_user') {
      const rv = String(rule.targetValue || '').trim().toLowerCase();
      const rvParts = splitUsernameParts(rv);
      const rDom = normalizeDomainCmp(rule.domainName || rvParts.domain);
      if (rDom && domShort && rDom !== domShort) continue;
      if (rvParts.sam === mSamL || (mUpnL && rv === mUpnL) || rv === mSamL) {
        return {
          blocked: true,
          reasonEn: `Action blocked by HelpDesk exception policy: member "${params.memberSam}" matches excluded AD user rule "${rule.targetValue}".`,
          reasonFa: `عملیات توسط قانون استثنائات هلپ‌دسک مسدود شد: کاربر «${params.memberSam}» در لیست استثنائات مسدودشده است.`,
        };
      }
    }
  }

  const pol = params.policyContext && !params.policyContext.hasFullAccess ? params.policyContext.policy : null;
  if (pol) {
    const memberCands = dedupeStrings([params.memberSam, params.memberUpn, params.memberDn]);
    if ((pol.blockedHelpdeskAdUsers || []).length > 0) {
      const m = matchUserPatternList(pol.blockedHelpdeskAdUsers || [], memberCands, params.domainName, false);
      if (m) {
        return {
          blocked: true,
          reasonEn: `Action blocked by RBAC HelpDesk Policy: member "${params.memberSam}" matches restricted AD user rule "${m.pattern}".`,
          reasonFa: `عملیات توسط پالیسی هلپ‌دسک مسدود شد: کاربر «${params.memberSam}» مشمول قانون مسدودسازی «${m.pattern}» است.`,
        };
      }
    }
    const mgObjs = params.memberGroupDns.map((dn) => ({ cn: extractCnFromDn(dn), dn }));
    if ((pol.blockedHelpdeskAdGroups || []).length > 0 && mgObjs.length > 0) {
      const mgHit = matchAdGroupPatternList(pol.blockedHelpdeskAdGroups || [], mgObjs, params.domainName);
      if (mgHit) {
        return {
          blocked: true,
          reasonEn: `Action blocked by RBAC HelpDesk Policy: member "${params.memberSam}" belongs to restricted AD group "${mgHit.matchedGroup}".`,
          reasonFa: `عملیات توسط پالیسی هلپ‌دسک مسدود شد: عضو «${params.memberSam}» عضو گروه مسدودشده «${mgHit.matchedGroup}» است.`,
        };
      }
    }
  }

  return { blocked: false };
}

export async function manageDomainGroupMember(
  input: HelpdeskGroupMemberActionInput,
  policyContext?: HelpdeskAdPolicyContext
): Promise<HelpdeskGroupMemberActionResult> {
  const cleanGroup = sanitizeAndValidateTargetGroup(input.targetGroup);
  const cleanMember = String(input.memberIdentifier || '').trim();
  if (!cleanMember || cleanMember.length > 512 || /[\r\n\0]/.test(cleanMember)) {
    throw new Error('A valid member username, CN, or Distinguished Name is required.');
  }
  const action: 'add_member' | 'remove_member' =
    input.action === 'remove_member' ? 'remove_member' : 'add_member';

  const adminUsername = String(input.adminUsername || '').trim();
  const adminPassword = String(input.adminPassword || '');
  if (!adminUsername || !adminPassword) {
    throw new Error('Privileged domain username and password are required.');
  }
  const safeDc = validateSafeHostOrIp(input.domainController, 'Domain Controller');

  const { adConfig, dcCandidates, pdcHost, domainHints } = await resolveDomainHintsForGroup({
    targetGroup: cleanGroup,
    adminUsername,
    domainController: safeDc,
  });

  // Prefer PDC for membership writes when auto-selecting DCs
  const writeDcs = dedupeStrings([safeDc, pdcHost, ...dcCandidates]);

  const { session, errors } = await openAuthenticatedLdapSession({
    input: {
      targetUsername: adminUsername,
      adminUsername,
      adminPassword,
      domainController: safeDc,
      ldapProtocol: input.ldapProtocol || 'auto',
    },
    adConfig,
    dcCandidates: writeDcs,
    domainHints,
  });

  if (!session) {
    throw new Error(`Unable to connect to Domain Controller: ${errors.slice(0, 4).join(' ; ')}`);
  }

  let groupDn = '';
  let groupCn = '';
  let groupSam = '';
  let memberDn = '';
  let memberSam = '';
  let memberDisplay = '';
  const dcHost = session.host;
  const domName = session.domainName;
  const usedSsl = session.useSsl;

  try {
    // Resolve Group
    const isGroupDn = /^(?:CN|OU)=/i.test(cleanGroup) && /DC=/i.test(cleanGroup);
    const gEsc = escapeLdapFilterValue(cleanGroup);
    const gRows = await ldapSearchEntries(
      session.client,
      isGroupDn ? cleanGroup : session.defaultNamingContext,
      {
        scope: isGroupDn ? 'base' : 'sub',
        filter: isGroupDn
          ? '(objectCategory=group)'
          : `(&(objectCategory=group)(|(sAMAccountName=${gEsc})(cn=${gEsc})))`,
        attributes: ['cn', 'sAMAccountName', 'distinguishedName'],
        sizeLimit: 3,
      }
    );
    if (!gRows[0]) {
      throw new Error(`Target AD group "${cleanGroup}" was not found.`);
    }
    groupDn = gRows[0].dn || getFirstAttr(gRows[0].attrs, 'distinguishedName');
    groupCn = getFirstAttr(gRows[0].attrs, 'cn') || extractCnFromDn(groupDn);
    groupSam = getFirstAttr(gRows[0].attrs, 'sAMAccountName') || groupCn;

    // Resolve Member (User, Group, or Computer)
    const isMemberDn = /^(?:CN|OU)=/i.test(cleanMember) && /DC=/i.test(cleanMember);
    const memberParts = splitUsernameParts(cleanMember);
    const mEsc = escapeLdapFilterValue(memberParts.sam);
    const mFullEsc = escapeLdapFilterValue(cleanMember);
    const mRows = await ldapSearchEntries(
      session.client,
      isMemberDn ? cleanMember : session.defaultNamingContext,
      {
        scope: isMemberDn ? 'base' : 'sub',
        filter: isMemberDn
          ? '(objectClass=*)'
          : `(&(|(objectCategory=person)(objectCategory=group)(objectCategory=computer))(|(sAMAccountName=${mEsc})(userPrincipalName=${mFullEsc})(mail=${mFullEsc})(cn=${mEsc})))`,
        attributes: ['cn', 'sAMAccountName', 'displayName', 'userPrincipalName', 'memberOf', 'distinguishedName'],
        sizeLimit: 3,
      }
    );
    if (!mRows[0]) {
      throw new Error(`Target member "${cleanMember}" was not found in Active Directory.`);
    }
    memberDn = mRows[0].dn || getFirstAttr(mRows[0].attrs, 'distinguishedName');
    memberSam = getFirstAttr(mRows[0].attrs, 'sAMAccountName') || extractCnFromDn(memberDn);
    memberDisplay = getFirstAttr(mRows[0].attrs, 'displayName') || getFirstAttr(mRows[0].attrs, 'cn') || memberSam;
    const memberUpn = getFirstAttr(mRows[0].attrs, 'userPrincipalName');
    const memberGroupDns = getAllAttrs(mRows[0].attrs, 'memberOf');

    if (memberDn.toLowerCase() === groupDn.toLowerCase()) {
      throw new Error('A group cannot be added as a direct member of itself.');
    }

    const exc = await checkGroupActionExceptionPolicy({
      groupCn,
      groupSam,
      groupDn,
      memberSam,
      memberUpn,
      memberDn,
      memberGroupDns,
      domainName: domName,
      policyContext,
    });
    if (exc.blocked) {
      const err: any = new Error(exc.reasonEn);
      err.reasonFa = exc.reasonFa;
      err.blockedByException = true;
      throw err;
    }

    // Attempt LDAP modify first
    let ldapModifyErr = '';
    try {
      await new Promise<void>((resolve, reject) => {
        const ChangeCtor: any = (ldap as any).Change;
        const change = new ChangeCtor({
          operation: action === 'add_member' ? 'add' : 'delete',
          modification: { member: memberDn },
        });
        session.client.modify(groupDn, change, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      return {
        success: true,
        action,
        groupSamAccountName: groupSam,
        groupCn,
        groupDn,
        memberSamAccountName: memberSam,
        memberDisplayName: memberDisplay,
        memberDn,
        domainController: dcHost,
        methodUsed: usedSsl ? 'ldaps_modify' : 'ldap_modify',
        message:
          action === 'add_member'
            ? `Added "${memberSam}" to group "${groupCn}" via ${dcHost}.`
            : `Removed "${memberSam}" from group "${groupCn}" via ${dcHost}.`,
        messageFa:
          action === 'add_member'
            ? `عضو «${memberSam}» با موفقیت به گروه «${groupCn}» در دامین کنترلر ${dcHost} اضافه شد.`
            : `عضو «${memberSam}» با موفقیت از گروه «${groupCn}» در دامین کنترلر ${dcHost} حذف شد.`,
        executedAt: new Date().toISOString(),
      };
    } catch (modErr: any) {
      ldapModifyErr = modErr?.message || String(modErr);
    }

    // Fallback to WinRM ADSI
    const gDnB64 = Buffer.from(groupDn, 'utf8').toString('base64');
    const mDnB64 = Buffer.from(memberDn, 'utf8').toString('base64');
    const opStr = action === 'add_member' ? 'add' : 'remove';
    const psAction = `
$ErrorActionPreference = 'Stop'
$gDn = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${gDnB64}'))
$mDn = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${mDnB64}'))
$grp = [ADSI]"LDAP://$gDn"
if ('${opStr}' -eq 'add') {
  $grp.Add("LDAP://$mDn")
} else {
  $grp.Remove("LDAP://$mDn")
}
[PSCustomObject]@{ ok = $true } | ConvertTo-Json -Compress
`;

    try {
      await executeHelpdeskPowerShell(
        {
          targetIp: dcHost,
          protocol: input.winrmProtocol || 'auto',
          username: adminUsername,
          password: adminPassword,
          timeoutMs: 22000,
        },
        psAction
      );

      return {
        success: true,
        action,
        groupSamAccountName: groupSam,
        groupCn,
        groupDn,
        memberSamAccountName: memberSam,
        memberDisplayName: memberDisplay,
        memberDn,
        domainController: dcHost,
        methodUsed: 'winrm_adsi',
        message:
          action === 'add_member'
            ? `Added "${memberSam}" to group "${groupCn}" via WinRM ADSI (${dcHost}).`
            : `Removed "${memberSam}" from group "${groupCn}" via WinRM ADSI (${dcHost}).`,
        messageFa:
          action === 'add_member'
            ? `عضو «${memberSam}» با موفقیت به گروه «${groupCn}» از طریق WinRM ADSI (${dcHost}) اضافه شد.`
            : `عضو «${memberSam}» با موفقیت از گروه «${groupCn}» از طریق WinRM ADSI (${dcHost}) حذف شد.`,
        executedAt: new Date().toISOString(),
      };
    } catch (winrmErr: any) {
      throw new Error(
        `Failed to ${action === 'add_member' ? 'add' : 'remove'} member "${memberSam}" on "${groupCn}": ${[
          ldapModifyErr ? `LDAP: ${ldapModifyErr}` : '',
          `WinRM/ADSI: ${winrmErr?.message || winrmErr}`,
        ]
          .filter(Boolean)
          .join(' | ')}`
      );
    }
  } finally {
    session.close();
  }
}
