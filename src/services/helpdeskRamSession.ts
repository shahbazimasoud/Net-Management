import {
  fetchHelpdeskEndpointHealth,
  fetchHelpdeskEndpointShares,
  fetchHelpdeskNetworkSnapshot,
  fetchHelpdeskPrinterStatus,
  fetchHelpdeskEventLogs,
  fetchHelpdeskEndpointLogons,
  fetchHelpdeskSystemInfo,
  fetchHelpdeskUpdateStatus,
  scanHelpdeskTemp,
  fetchHelpdeskGpoStatus,
  fetchHelpdeskDiskHealth,
  fetchHelpdeskBatteryReport,
  fetchHelpdeskPrograms,
  fetchHelpdeskHardwareInventory,
  HelpdeskConnectionPayload,
} from './api';

export type HelpdeskSubTab =
  | 'health'
  | 'hardware'
  | 'network'
  | 'printers'
  | 'events'
  | 'logins'
  | 'updates'
  | 'programs'
  | 'maintenance'
  | 'hardware_domain'
  | 'history';

export interface HelpdeskRateLimitState {
  windowMinutes: number;
  maxWriteActions: number;
  maxDistinctHosts: number;
  usedWriteActions: number;
  remainingWriteActions: number;
  distinctHostsUsed: number;
  isFrozen: boolean;
  freezeUntilIso: string | null;
}

export interface HelpdeskJeaTemplatesState {
  jeaConfigName: string;
  roleCapabilityScript: string;
  registerSessionScript: string;
}

export interface HelpdeskPrefetchProgress {
  active: boolean;
  step: number;
  total: number;
  currentTab: HelpdeskSubTab | null;
  labelEn: string;
  labelFa: string;
}

export interface HelpdeskRamState {
  ownerUserId: string | null;
  targetIp: string;
  protocol: 'auto' | 'winrm_https' | 'winrm_http' | 'smb_rpc' | 'ssh';
  customPort: string;
  username: string;
  password: string;
  jeaConfigName: string;
  showAdvancedConn: boolean;
  activeSubTab: HelpdeskSubTab;
  prefetchProgress: HelpdeskPrefetchProgress | null;
  rateLimit: HelpdeskRateLimitState | null;
  jeaTemplates: HelpdeskJeaTemplatesState | null;

  // Tab 1: Health, Processes & Shares
  healthData: any | null;
  loadingHealth: boolean;
  healthError: string | null;
  processSearch: string;
  processSort: 'cpu' | 'memory' | 'name' | 'pid';
  processSortDir: 'desc' | 'asc';
  processPage: number;
  donutMetric: 'cpu' | 'memory';
  selectedProcessPid: number | null;
  processActionNotice: { ok: boolean; text: string } | null;

  sharesData: any | null;
  loadingShares: boolean;
  sharesError: string | null;
  shareActionResult: any | null;

  // Tab 1B: Full Hardware Inventory
  hardwareData: any | null;
  loadingHardware: boolean;
  hardwareError: string | null;

  // Tab 2: Network & VPN
  networkData: any | null;
  loadingNetwork: boolean;
  networkError: string | null;
  probeResult: any | null;
  probeError: string | null;
  netActionResult: any | null;

  // Tab 3: Printers & Spooler
  printerData: any | null;
  loadingPrinters: boolean;
  printerError: string | null;
  spoolerActionResult: any | null;

  // Tab 4: Event Viewer
  eventData: any | null;
  loadingEvents: boolean;
  eventError: string | null;

  // Tab 5: User Logins, Sessions & Power
  logonsData: any | null;
  loadingLogons: boolean;
  logonsError: string | null;
  powerResult: any | null;
  powerError: string | null;
  sessionActionResult: any | null;
  sessionActionError: string | null;

  // Tab 6: Updates, WSUS & System Info
  sysInfoData: any | null;
  loadingSysInfo: boolean;
  sysInfoError: string | null;
  updateStatusData: any | null;
  loadingUpdateStatus: boolean;
  updateStatusError: string | null;
  updateActionResult: any | null;
  updateActionError: string | null;

  // Tab 6B: Add / Remove Programs
  programsData: any | null;
  loadingPrograms: boolean;
  programsError: string | null;
  programActionResult: any | null;
  programActionError: string | null;

  // Tab 7: Temp, GPO & Disk Repair
  tempScanData: any | null;
  loadingTempScan: boolean;
  tempError: string | null;
  tempCleanResult: any | null;
  gpoData: any | null;
  loadingGpo: boolean;
  gpoError: string | null;
  gpupdateResult: any | null;
  diskHealthData: any | null;
  loadingDiskHealth: boolean;
  diskHealthError: string | null;
  repairResult: any | null;
  repairError: string | null;

  // Tab 8: Battery & Domain Account
  batteryData: any | null;
  loadingBattery: boolean;
  batteryError: string | null;
  domainQueryUser: string;
  domainUserData: any | null;
  loadingDomainUser: boolean;
  domainUserError: string | null;
}

function createInitialHelpdeskRamState(ownerUserId: string | null = null): HelpdeskRamState {
  return {
    ownerUserId,
    targetIp: '',
    protocol: 'auto',
    customPort: '',
    username: '',
    password: '',
    jeaConfigName: '',
    showAdvancedConn: false,
    activeSubTab: 'health',
    prefetchProgress: null,
    rateLimit: null,
    jeaTemplates: null,

    healthData: null,
    loadingHealth: false,
    healthError: null,
    processSearch: '',
    processSort: 'cpu',
    processSortDir: 'desc',
    processPage: 1,
    donutMetric: 'cpu',
    selectedProcessPid: null,
    processActionNotice: null,

    sharesData: null,
    loadingShares: false,
    sharesError: null,
    shareActionResult: null,

    hardwareData: null,
    loadingHardware: false,
    hardwareError: null,

    networkData: null,
    loadingNetwork: false,
    networkError: null,
    probeResult: null,
    probeError: null,
    netActionResult: null,

    printerData: null,
    loadingPrinters: false,
    printerError: null,
    spoolerActionResult: null,

    eventData: null,
    loadingEvents: false,
    eventError: null,

    logonsData: null,
    loadingLogons: false,
    logonsError: null,
    powerResult: null,
    powerError: null,
    sessionActionResult: null,
    sessionActionError: null,

    sysInfoData: null,
    loadingSysInfo: false,
    sysInfoError: null,
    updateStatusData: null,
    loadingUpdateStatus: false,
    updateStatusError: null,
    updateActionResult: null,
    updateActionError: null,

    programsData: null,
    loadingPrograms: false,
    programsError: null,
    programActionResult: null,
    programActionError: null,

    tempScanData: null,
    loadingTempScan: false,
    tempError: null,
    tempCleanResult: null,
    gpoData: null,
    loadingGpo: false,
    gpoError: null,
    gpupdateResult: null,
    diskHealthData: null,
    loadingDiskHealth: false,
    diskHealthError: null,
    repairResult: null,
    repairError: null,

    batteryData: null,
    loadingBattery: false,
    batteryError: null,
    domainQueryUser: '',
    domainUserData: null,
    loadingDomainUser: false,
    domainUserError: null,
  };
}

// Volatile JS RAM state only — NEVER persisted to localStorage, sessionStorage, cookies, or DB.
let ramState: HelpdeskRamState = createInitialHelpdeskRamState(null);
let activeRunId = 0;
const listeners = new Set<() => void>();

function emitChange(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {}
  });
}

export function getHelpdeskRamSnapshot(): HelpdeskRamState {
  return ramState;
}

export function subscribeHelpdeskRam(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function patchHelpdeskRamSnapshot(
  patch: Partial<HelpdeskRamState> | ((prev: HelpdeskRamState) => Partial<HelpdeskRamState>)
): void {
  const partial = typeof patch === 'function' ? patch(ramState) : patch;
  ramState = { ...ramState, ...partial };
  emitChange();
}

export function bindHelpdeskRamOwner(userId: string | null | undefined): void {
  const nextOwner = userId ? String(userId) : null;
  if (!nextOwner) return;
  if (ramState.ownerUserId && ramState.ownerUserId !== nextOwner) {
    activeRunId += 1;
    ramState = createInitialHelpdeskRamState(nextOwner);
    emitChange();
    return;
  }
  if (ramState.ownerUserId !== nextOwner) {
    ramState = { ...ramState, ownerUserId: nextOwner };
    emitChange();
  }
}

export function stopHelpdeskPrefetch(): void {
  activeRunId += 1;
  if (ramState.prefetchProgress) {
    ramState = { ...ramState, prefetchProgress: null };
    emitChange();
  }
}

export function wipeHelpdeskRamSession(): void {
  activeRunId += 1;
  const keepOwner = ramState.ownerUserId;
  const keepRateLimit = ramState.rateLimit;
  const keepJeaTemplates = ramState.jeaTemplates;
  ramState = {
    ...createInitialHelpdeskRamState(keepOwner),
    rateLimit: keepRateLimit,
    jeaTemplates: keepJeaTemplates,
  };
  emitChange();
}

export function wipeHelpdeskRamOnLogout(): void {
  activeRunId += 1;
  ramState = createInitialHelpdeskRamState(null);
  emitChange();
}

function notifyAuditUpdated(): void {
  try {
    window.dispatchEvent(new CustomEvent('nettopology_audit_log_updated'));
  } catch {}
}

export async function runHelpdeskSequentialConnect(options: {
  payload: HelpdeskConnectionPayload;
  isEn: boolean;
  canViewEventViewer: boolean;
  eventChannel: 'All' | 'System' | 'Application';
  eventHoursBack: number;
  eventSeverityMode: 'all' | 'critical_error';
  logonsHoursBack: number;
  onNetworkLoaded?: (data: any) => void;
}): Promise<boolean> {
  const { payload, isEn, canViewEventViewer, eventChannel, eventHoursBack, eventSeverityMode, logonsHoursBack, onNetworkLoaded } =
    options;
  const runId = ++activeRunId;
  const isCancelled = () => activeRunId !== runId;

  // Clear previous host snapshots before sequentially loading from Tab 1
  patchHelpdeskRamSnapshot({
    healthData: null,
    healthError: null,
    loadingHealth: false,
    processPage: 1,
    selectedProcessPid: null,
    processActionNotice: null,
    sharesData: null,
    sharesError: null,
    loadingShares: false,
    shareActionResult: null,
    hardwareData: null,
    loadingHardware: false,
    hardwareError: null,
    networkData: null,
    networkError: null,
    loadingNetwork: false,
    probeResult: null,
    probeError: null,
    netActionResult: null,
    printerData: null,
    printerError: null,
    loadingPrinters: false,
    spoolerActionResult: null,
    eventData: null,
    eventError: null,
    loadingEvents: false,
    logonsData: null,
    logonsError: null,
    loadingLogons: false,
    powerResult: null,
    powerError: null,
    sessionActionResult: null,
    sessionActionError: null,
    sysInfoData: null,
    sysInfoError: null,
    loadingSysInfo: false,
    updateStatusData: null,
    updateStatusError: null,
    loadingUpdateStatus: false,
    updateActionResult: null,
    updateActionError: null,
    programsData: null,
    loadingPrograms: false,
    programsError: null,
    programActionResult: null,
    programActionError: null,
    tempScanData: null,
    tempError: null,
    loadingTempScan: false,
    tempCleanResult: null,
    gpoData: null,
    gpoError: null,
    loadingGpo: false,
    gpupdateResult: null,
    diskHealthData: null,
    diskHealthError: null,
    loadingDiskHealth: false,
    repairResult: null,
    repairError: null,
    batteryData: null,
    batteryError: null,
    loadingBattery: false,
    domainUserData: null,
    domainUserError: null,
  });

  const steps: Array<{
    id: HelpdeskSubTab;
    labelEn: string;
    labelFa: string;
    run: () => Promise<boolean>;
  }> = [
    {
      id: 'health',
      labelEn: 'Health, Processes & Shares',
      labelFa: 'سلامت سیستم، پروسس‌ها و شیر فولدرها',
      run: async () => {
        patchHelpdeskRamSnapshot({ loadingHealth: true, healthError: null });
        try {
          const res = await fetchHelpdeskEndpointHealth(payload);
          if (isCancelled()) return false;
          patchHelpdeskRamSnapshot({
            healthData: res.data,
            loadingHealth: false,
            ...(res.rateLimit ? { rateLimit: res.rateLimit } : {}),
          });
        } catch (err: any) {
          if (!isCancelled()) {
            patchHelpdeskRamSnapshot({
              healthData: null,
              loadingHealth: false,
              healthError:
                err?.message || (isEn ? 'Failed to inspect endpoint.' : 'خطا در اتصال و دریافت وضعیت سیستم.'),
            });
          }
          return false;
        }
        if (isCancelled()) return false;
        patchHelpdeskRamSnapshot({ loadingShares: true, sharesError: null });
        try {
          const sharesRes = await fetchHelpdeskEndpointShares(payload);
          if (!isCancelled()) {
            patchHelpdeskRamSnapshot({
              sharesData: sharesRes.data,
              loadingShares: false,
              ...(sharesRes.rateLimit ? { rateLimit: sharesRes.rateLimit } : {}),
            });
          }
        } catch (err: any) {
          if (!isCancelled()) {
            patchHelpdeskRamSnapshot({
              sharesData: null,
              loadingShares: false,
              sharesError:
                err?.message ||
                (isEn
                  ? 'Failed to inspect mapped network shares.'
                  : 'خطا در دریافت لیست پوشه‌های اشتراکی مپ‌شده کاربر.'),
            });
          }
        }
        return true;
      },
    },
    {
      id: 'hardware',
      labelEn: 'Hardware & Peripherals',
      labelFa: 'سخت‌افزار و تجهیزات متصل',
      run: async () => {
        patchHelpdeskRamSnapshot({ loadingHardware: true, hardwareError: null });
        try {
          const hwRes = await fetchHelpdeskHardwareInventory(payload);
          if (!isCancelled()) {
            patchHelpdeskRamSnapshot({
              hardwareData: hwRes.data,
              loadingHardware: false,
              ...(hwRes.rateLimit ? { rateLimit: hwRes.rateLimit } : {}),
            });
          }
        } catch (err: any) {
          if (!isCancelled()) {
            patchHelpdeskRamSnapshot({
              hardwareData: null,
              loadingHardware: false,
              hardwareError:
                err?.message ||
                (isEn
                  ? 'Failed to inspect hardware inventory.'
                  : 'خطا در دریافت مشخصات کامل سخت‌افزاری سیستم کاربر.'),
            });
          }
        }
        return true;
      },
    },
    {
      id: 'network',
      labelEn: 'Network, VPN, Hosts & Routing',
      labelFa: 'شبکه، VPN، Hosts و روتینگ',
      run: async () => {
        patchHelpdeskRamSnapshot({ loadingNetwork: true, networkError: null });
        try {
          const res = await fetchHelpdeskNetworkSnapshot(payload);
          if (!isCancelled()) {
            patchHelpdeskRamSnapshot({
              networkData: res.data,
              loadingNetwork: false,
              ...(res.rateLimit ? { rateLimit: res.rateLimit } : {}),
            });
            onNetworkLoaded?.(res.data);
          }
        } catch (err: any) {
          if (!isCancelled()) {
            patchHelpdeskRamSnapshot({
              networkData: null,
              loadingNetwork: false,
              networkError:
                err?.message ||
                (isEn ? 'Failed to inspect endpoint network.' : 'خطا در دریافت اطلاعات شبکه سیستم کاربر.'),
            });
          }
        }
        return true;
      },
    },
    {
      id: 'printers',
      labelEn: 'Printers & Print Spooler',
      labelFa: 'پرینترها و Spooler',
      run: async () => {
        patchHelpdeskRamSnapshot({ loadingPrinters: true, printerError: null });
        try {
          const res = await fetchHelpdeskPrinterStatus(payload);
          if (!isCancelled()) {
            patchHelpdeskRamSnapshot({
              printerData: res.data,
              loadingPrinters: false,
              ...(res.rateLimit ? { rateLimit: res.rateLimit } : {}),
            });
          }
        } catch (err: any) {
          if (!isCancelled()) {
            patchHelpdeskRamSnapshot({
              printerData: null,
              loadingPrinters: false,
              printerError:
                err?.message ||
                (isEn ? 'Failed to inspect printers.' : 'خطا در دریافت وضعیت پرینترها و Spooler.'),
            });
          }
        }
        return true;
      },
    },
    ...(canViewEventViewer
      ? [
          {
            id: 'events' as HelpdeskSubTab,
            labelEn: 'Event Viewer Diagnostics',
            labelFa: 'تحلیل خطاهای Event Viewer',
            run: async () => {
              patchHelpdeskRamSnapshot({ loadingEvents: true, eventError: null });
              try {
                const res = await fetchHelpdeskEventLogs({
                  ...payload,
                  channel: eventChannel,
                  hoursBack: eventHoursBack,
                  maxEvents: 50,
                  severity: eventSeverityMode,
                });
                if (!isCancelled()) {
                  patchHelpdeskRamSnapshot({
                    eventData: res.data,
                    loadingEvents: false,
                    ...(res.rateLimit ? { rateLimit: res.rateLimit } : {}),
                  });
                }
              } catch (err: any) {
                if (!isCancelled()) {
                  patchHelpdeskRamSnapshot({
                    eventData: null,
                    loadingEvents: false,
                    eventError:
                      err?.message ||
                      (isEn
                        ? 'Failed to read endpoint Event Viewer logs.'
                        : 'خطا در خواندن لاگ‌های Event Viewer سیستم کاربر.'),
                  });
                }
              }
              return true;
            },
          },
        ]
      : []),
    {
      id: 'logins',
      labelEn: 'User Logins, Sessions & Power',
      labelFa: 'ورود کاربران، نشست و پاور',
      run: async () => {
        patchHelpdeskRamSnapshot({ loadingLogons: true, logonsError: null });
        try {
          const res = await fetchHelpdeskEndpointLogons({
            ...payload,
            hoursBack: logonsHoursBack,
            maxEvents: 120,
          });
          if (!isCancelled()) {
            patchHelpdeskRamSnapshot({
              logonsData: res.data,
              loadingLogons: false,
              ...(res.rateLimit ? { rateLimit: res.rateLimit } : {}),
            });
          }
        } catch (err: any) {
          if (!isCancelled()) {
            patchHelpdeskRamSnapshot({
              logonsData: null,
              loadingLogons: false,
              logonsError:
                err?.message ||
                (isEn
                  ? 'Failed to inspect workstation user logins & active sessions.'
                  : 'خطا در دریافت گزارش ورود کاربران و نشست‌های فعال سیستم.'),
            });
          }
        }
        return true;
      },
    },
    {
      id: 'updates',
      labelEn: 'Updates, WSUS & System Info',
      labelFa: 'آپدیت ویندوز، WSUS و مشخصات سیستم',
      run: async () => {
        patchHelpdeskRamSnapshot({ loadingSysInfo: true, sysInfoError: null });
        try {
          const sysRes = await fetchHelpdeskSystemInfo(payload);
          if (!isCancelled()) {
            patchHelpdeskRamSnapshot({
              sysInfoData: sysRes.data,
              loadingSysInfo: false,
              ...(sysRes.rateLimit ? { rateLimit: sysRes.rateLimit } : {}),
            });
          }
        } catch (err: any) {
          if (!isCancelled()) {
            patchHelpdeskRamSnapshot({
              sysInfoData: null,
              loadingSysInfo: false,
              sysInfoError:
                err?.message ||
                (isEn
                  ? 'Failed to collect detailed system info and updates.'
                  : 'خطا در دریافت مشخصات سیستم و لیست آپدیت‌ها.'),
            });
          }
        }
        if (isCancelled()) return true;
        patchHelpdeskRamSnapshot({ loadingUpdateStatus: true, updateStatusError: null });
        try {
          const updRes = await fetchHelpdeskUpdateStatus({
            ...payload,
            sourceMode: 'auto',
            withOnlineScan: true,
          });
          if (!isCancelled()) {
            patchHelpdeskRamSnapshot({
              updateStatusData: updRes.data,
              loadingUpdateStatus: false,
              ...(updRes.rateLimit ? { rateLimit: updRes.rateLimit } : {}),
            });
          }
        } catch (err: any) {
          if (!isCancelled()) {
            patchHelpdeskRamSnapshot({
              updateStatusData: null,
              loadingUpdateStatus: false,
              updateStatusError:
                err?.message ||
                (isEn
                  ? 'Failed to inspect Windows Update & WSUS policy.'
                  : 'خطا در بررسی وضعیت Windows Update و پالیسی WSUS.'),
            });
          }
        }
        return true;
      },
    },
    {
      id: 'programs',
      labelEn: 'Add / Remove Programs',
      labelFa: 'برنامه‌های نصب‌شده (Add / Remove)',
      run: async () => {
        patchHelpdeskRamSnapshot({ loadingPrograms: true, programsError: null });
        try {
          const progRes = await fetchHelpdeskPrograms(payload);
          if (!isCancelled()) {
            patchHelpdeskRamSnapshot({
              programsData: progRes.data,
              loadingPrograms: false,
              ...(progRes.rateLimit ? { rateLimit: progRes.rateLimit } : {}),
            });
          }
        } catch (err: any) {
          if (!isCancelled()) {
            patchHelpdeskRamSnapshot({
              programsData: null,
              loadingPrograms: false,
              programsError:
                err?.message ||
                (isEn
                  ? 'Failed to inspect installed applications.'
                  : 'خطا در دریافت لیست برنامه‌های نصب‌شده سیستم کاربر.'),
            });
          }
        }
        return true;
      },
    },
    {
      id: 'maintenance',
      labelEn: 'Temp, GPO & Disk Health',
      labelFa: 'پاک‌سازی Temp، GPO و دیسک‌ها',
      run: async () => {
        patchHelpdeskRamSnapshot({ loadingTempScan: true, tempError: null });
        try {
          const tempRes = await scanHelpdeskTemp(payload);
          if (!isCancelled()) {
            patchHelpdeskRamSnapshot({
              tempScanData: tempRes.data,
              loadingTempScan: false,
              ...(tempRes.rateLimit ? { rateLimit: tempRes.rateLimit } : {}),
            });
          }
        } catch (err: any) {
          if (!isCancelled()) {
            patchHelpdeskRamSnapshot({
              tempScanData: null,
              loadingTempScan: false,
              tempError:
                err?.message ||
                (isEn
                  ? 'Failed to scan endpoint Temp folders.'
                  : 'خطا در اسکن پوشه‌های Temp سیستم کاربر.'),
            });
          }
        }
        if (isCancelled()) return true;
        patchHelpdeskRamSnapshot({ loadingGpo: true, gpoError: null });
        try {
          const gpoRes = await fetchHelpdeskGpoStatus(payload);
          if (!isCancelled()) {
            patchHelpdeskRamSnapshot({
              gpoData: gpoRes.data,
              loadingGpo: false,
              ...(gpoRes.rateLimit ? { rateLimit: gpoRes.rateLimit } : {}),
            });
          }
        } catch (err: any) {
          if (!isCancelled()) {
            patchHelpdeskRamSnapshot({
              gpoData: null,
              loadingGpo: false,
              gpoError:
                err?.message ||
                (isEn
                  ? 'Failed to inspect Group Policy status.'
                  : 'خطا در دریافت وضعیت Group Policy سیستم کاربر.'),
            });
          }
        }
        if (isCancelled()) return true;
        patchHelpdeskRamSnapshot({ loadingDiskHealth: true, diskHealthError: null });
        try {
          const diskRes = await fetchHelpdeskDiskHealth(payload);
          if (!isCancelled()) {
            patchHelpdeskRamSnapshot({
              diskHealthData: diskRes.data,
              loadingDiskHealth: false,
              ...(diskRes.rateLimit ? { rateLimit: diskRes.rateLimit } : {}),
            });
          }
        } catch (err: any) {
          if (!isCancelled()) {
            patchHelpdeskRamSnapshot({
              diskHealthData: null,
              loadingDiskHealth: false,
              diskHealthError:
                err?.message ||
                (isEn ? 'Failed to inspect disk media types.' : 'خطا در شناسایی نوع دیسک‌ها (HDD/SSD).'),
            });
          }
        }
        return true;
      },
    },
    {
      id: 'hardware_domain',
      labelEn: 'Battery Health Report',
      labelFa: 'گزارش سلامت باتری',
      run: async () => {
        patchHelpdeskRamSnapshot({ loadingBattery: true, batteryError: null });
        try {
          const batRes = await fetchHelpdeskBatteryReport(payload);
          if (!isCancelled()) {
            patchHelpdeskRamSnapshot({
              batteryData: batRes.data,
              loadingBattery: false,
              ...(batRes.rateLimit ? { rateLimit: batRes.rateLimit } : {}),
            });
          }
        } catch (err: any) {
          if (!isCancelled()) {
            patchHelpdeskRamSnapshot({
              batteryData: null,
              loadingBattery: false,
              batteryError:
                err?.message ||
                (isEn ? 'Failed to generate battery health report.' : 'خطا در دریافت گزارش سلامت باتری.'),
            });
          }
        }
        return true;
      },
    },
  ];

  for (let i = 0; i < steps.length; i++) {
    if (isCancelled()) return false;
    const st = steps[i];
    patchHelpdeskRamSnapshot({
      prefetchProgress: {
        active: true,
        step: i + 1,
        total: steps.length,
        currentTab: st.id,
        labelEn: st.labelEn,
        labelFa: st.labelFa,
      },
    });
    const ok = await st.run();
    if (isCancelled()) return false;
    // If Tab 1 initial auth/connectivity failed, stop so we do not trigger AD account lockout retries
    if (i === 0 && !ok) {
      patchHelpdeskRamSnapshot({ prefetchProgress: null });
      notifyAuditUpdated();
      return false;
    }
  }

  if (!isCancelled()) {
    patchHelpdeskRamSnapshot({ prefetchProgress: null });
    notifyAuditUpdated();
    return true;
  }
  return false;
}
