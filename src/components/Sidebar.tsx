import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  LayoutDashboard,
  Network,
  Map,
  Cable,
  Radar,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  FileCode2,
  Layers,
  Activity,
  Settings,
  ShieldCheck,
  FolderTree,
  Users,
  Server,
  Archive,
  ScrollText,
  Terminal,
  Monitor,
  Tags,
  Sliders,
  KeyRound,
  ArrowUpCircle,
  Mail,
  BellRing,
  Database,
  FileCheck,
  X
} from 'lucide-react';
import { useLanguage } from '../i18n';
import { AccessPolicy } from '../types';
import { isTabAllowed } from '../services/settingsStorage';
import { useUpdate } from '../context/UpdateContext';
import { useAuth, AuthUser } from '../context/AuthContext';
import { isUserSuperAdmin } from '../utils/rbac';

export type ActiveTab =
  | 'dashboard'
  | 'devices'
  | 'schematic'
  | 'templates'
  | 'remote-servers'
  | 'remote-linux'
  | 'remote-windows'
  | 'remote-tags'
  | 'ports'
  | 'scanner'
  | 'logs'
  | 'licenses'
  | 'contracts'
  | 'settings'
  | 'settings-groups'
  | 'settings-users'
  | 'settings-ad'
  | 'settings-rbac'
  | 'settings-backup'
  | 'settings-log-retention'
  | 'general-settings'
  | 'settings-services'
  | 'settings-ldap'
  | 'settings-update'
  | 'settings-email'
  | 'settings-alerts';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  devicesCount: number;
  offlineCount: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  onOpenReleaseNotes?: () => void;
  effectivePolicy?: AccessPolicy;
  user?: AuthUser | null;
  isLightMode?: boolean;
}

interface NavItem {
  id: ActiveTab;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | null;
}

interface NavParentGroup {
  id: 'infra' | 'servers' | 'monitor' | 'contracts_licenses' | 'system' | 'settings';
  titleKey: string;
  tagKey: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  devicesCount,
  offlineCount,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen = false,
  onCloseMobile,
  onOpenReleaseNotes,
  effectivePolicy,
  user,
  isLightMode: isLightModeProp,
}) => {
  const { t, isRtl, isEn } = useLanguage();
  const { updateInfo } = useUpdate();
  const { user: authUser } = useAuth();
  const currentUser = user || authUser;
  const isSuper = isUserSuperAdmin(currentUser, effectivePolicy);
  const hasUpdate = Boolean(updateInfo?.hasUpdate);
  const isLightMode =
    typeof isLightModeProp === 'boolean'
      ? isLightModeProp
      : typeof document !== 'undefined' && document.body.classList.contains('theme-light');

  // On mobile/tablet drawer, always render expanded navigation labels even if desktop rail was collapsed
  const effectiveCollapsed = isMobileOpen ? false : isCollapsed;

  // Close mobile/tablet drawer on Escape
  useEffect(() => {
    if (!isMobileOpen || !onCloseMobile) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseMobile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOpen, onCloseMobile]);

  const navGroups: NavParentGroup[] = useMemo(() => [
    {
      id: 'infra',
      titleKey: 'parent_infra_title',
      tagKey: 'parent_infra_tag',
      icon: Layers,
      colorClass: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10',
      items: [
        {
          id: 'dashboard',
          labelKey: 'tab_dashboard',
          icon: LayoutDashboard,
          badge: null,
        },
        {
          id: 'schematic',
          labelKey: 'tab_schematic',
          icon: Map,
          badge: null,
        },
        {
          id: 'devices',
          labelKey: 'tab_devices',
          icon: Network,
          badge: devicesCount > 0 ? `${devicesCount}` : null,
        },
        {
          id: 'templates',
          labelKey: 'tab_templates',
          icon: FileCode2,
          badge: null,
        },
      ],
    },
    {
      id: 'contracts_licenses',
      titleKey: 'parent_contracts_licenses_title',
      tagKey: 'parent_contracts_licenses_tag',
      icon: FileCheck,
      colorClass: 'text-violet-400 border-violet-500/30 bg-violet-500/10',
      items: [
        {
          id: 'licenses',
          labelKey: 'tab_licenses',
          icon: KeyRound,
          badge: 'Lic',
        },
        {
          id: 'contracts',
          labelKey: 'tab_contracts',
          icon: ScrollText,
          badge: 'SLA',
        },
      ],
    },
    {
      id: 'servers',
      titleKey: 'parent_servers_title',
      tagKey: 'parent_servers_tag',
      icon: Server,
      colorClass: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
      items: [
        {
          id: 'remote-servers',
          labelKey: 'tab_remote_servers',
          icon: Server,
          badge: null,
        },
        {
          id: 'remote-linux',
          labelKey: 'tab_remote_linux',
          icon: Terminal,
          badge: 'SSH',
        },
        {
          id: 'remote-windows',
          labelKey: 'tab_remote_windows',
          icon: Monitor,
          badge: 'RDP',
        },
        {
          id: 'remote-tags',
          labelKey: 'tab_remote_tags',
          icon: Tags,
          badge: 'Auto',
        },
      ],
    },
    {
      id: 'monitor',
      titleKey: 'parent_monitor_title',
      tagKey: 'parent_monitor_tag',
      icon: Activity,
      colorClass: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
      items: [
        {
          id: 'ports',
          labelKey: 'tab_ports',
          icon: Cable,
          badge: null,
        },
        {
          id: 'scanner',
          labelKey: 'tab_scanner',
          icon: Radar,
          badge: null,
        },
        {
          id: 'logs',
          labelKey: 'tab_logs',
          icon: ScrollText,
          badge: 'Live',
        },
      ],
    },
    {
      id: 'system',
      titleKey: 'parent_system_title',
      tagKey: 'parent_system_tag',
      icon: Settings,
      colorClass: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
      items: [
        {
          id: 'settings-groups',
          labelKey: 'tab_settings_groups',
          icon: FolderTree,
          badge: null,
        },
        {
          id: 'settings-users',
          labelKey: 'tab_settings_users',
          icon: Users,
          badge: null,
        },
        {
          id: 'settings-ad',
          labelKey: 'tab_settings_ad',
          icon: Server,
          badge: null,
        },
        {
          id: 'settings-rbac',
          labelKey: 'tab_settings_rbac',
          icon: ShieldCheck,
          badge: null,
        },
      ],
    },
    {
      id: 'settings',
      titleKey: 'parent_settings_title',
      tagKey: 'parent_settings_tag',
      icon: Settings,
      colorClass: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
      items: [
        {
          id: 'general-settings',
          labelKey: 'tab_settings_general',
          icon: Sliders,
          badge: 'Ready',
        },
        {
          id: 'settings-backup',
          labelKey: 'tab_settings_backup',
          icon: Archive,
          badge: 'DR',
        },
        {
          id: 'settings-log-retention',
          labelKey: 'tab_settings_log_retention',
          icon: Database,
          badge: 'DB',
        },
        {
          id: 'settings-services',
          labelKey: 'tab_settings_services',
          icon: Activity,
          badge: 'Host',
        },
        {
          id: 'settings-ldap',
          labelKey: 'tab_settings_ldap',
          icon: KeyRound,
          badge: 'LDAP',
        },
        {
          id: 'settings-update',
          labelKey: 'tab_settings_update',
          icon: ArrowUpCircle,
          badge: hasUpdate ? 'Update' : null,
        },
        {
          id: 'settings-email',
          labelKey: 'tab_settings_email',
          icon: Mail,
          badge: 'SMTP',
        },
        {
          id: 'settings-alerts',
          labelKey: 'tab_settings_alerts',
          icon: BellRing,
          badge: 'Telegram',
        },
      ],
    },
  ], [devicesCount, hasUpdate]);

  // Filter modules and parent accordions based on user's effective RBAC policy
  const visibleNavGroups = useMemo(() => {
    return navGroups
      .filter((group) => {
        // STRICT RBAC RULE: Settings menu and System administration are exclusively visible to Super Admin!
        if (group.id === 'settings' || group.id === 'system') {
          return isSuper;
        }
        return true;
      })
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => isTabAllowed(item.id, effectivePolicy, currentUser)),
      }))
      .filter((group) => group.items.length > 0);
  }, [navGroups, effectivePolicy, currentUser, isSuper]);

  // Which parent accordions are currently expanded (Default: both 'infra' and 'contracts_licenses' are expanded and immediately visible!)
  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>(['infra', 'contracts_licenses']);

  // Desktop collapsed rail floating flyout state (keeps sidebar collapsed when navigating)
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
  const [pinnedGroupId, setPinnedGroupId] = useState<string | null>(null);
  const [flyoutCoords, setFlyoutCoords] = useState<{ top: number; left?: number; right?: number } | null>(null);
  const railButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const flyoutRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const activeFlyoutGroupId = effectiveCollapsed ? hoveredGroupId || pinnedGroupId : null;
  const activeFlyoutGroup = useMemo(
    () => visibleNavGroups.find((g) => g.id === activeFlyoutGroupId) || null,
    [visibleNavGroups, activeFlyoutGroupId]
  );

  const cancelCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const closeFlyout = useCallback(() => {
    cancelCloseTimer();
    setHoveredGroupId(null);
    setPinnedGroupId(null);
    setFlyoutCoords(null);
  }, [cancelCloseTimer]);

  const scheduleHoverClose = useCallback(() => {
    cancelCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setHoveredGroupId(null);
    }, 140);
  }, [cancelCloseTimer]);

  useEffect(() => {
    return () => cancelCloseTimer();
  }, [cancelCloseTimer]);

  // Reset floating flyout whenever sidebar expands or mobile drawer opens
  useEffect(() => {
    if (!effectiveCollapsed) {
      closeFlyout();
    }
  }, [effectiveCollapsed, closeFlyout]);

  // Compute viewport-safe floating flyout position beside collapsed rail
  useLayoutEffect(() => {
    if (!activeFlyoutGroupId || !effectiveCollapsed) {
      setFlyoutCoords(null);
      return;
    }
    const anchorEl = railButtonRefs.current[activeFlyoutGroupId];
    if (!anchorEl) return;

    const anchorRect = anchorEl.getBoundingClientRect();
    const flyoutHeight = flyoutRef.current?.offsetHeight || 260;
    const minTop = 62; // Below sticky h-14 navbar
    const maxTop = Math.max(minTop, window.innerHeight - 40 - flyoutHeight); // Above h-8 footer
    const clampedTop = Math.min(Math.max(anchorRect.top - 4, minTop), maxTop);

    if (isRtl) {
      setFlyoutCoords({
        top: clampedTop,
        right: Math.max(82, window.innerWidth - anchorRect.left + 10),
      });
    } else {
      setFlyoutCoords({
        top: clampedTop,
        left: Math.max(82, anchorRect.right + 10),
      });
    }
  }, [activeFlyoutGroupId, effectiveCollapsed, isRtl, activeFlyoutGroup?.items.length]);

  // Dismiss flyout on outside click, Escape, or window resize
  useEffect(() => {
    if (!activeFlyoutGroupId) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (flyoutRef.current?.contains(target)) return;
      if (target.closest('[data-collapsed-rail-btn="true"]')) return;
      closeFlyout();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeFlyout();
      }
    };

    const handleResize = () => {
      closeFlyout();
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [activeFlyoutGroupId, closeFlyout]);

  // Keep expanded parent synced with activeTab so active item is always visible
  useEffect(() => {
    const parentForActive = visibleNavGroups.find((g) =>
      g.items.some((i) => i.id === activeTab || (activeTab === 'settings' && g.id === 'settings'))
    );
    if (parentForActive) {
      setExpandedGroupIds((prev) =>
        prev.includes(parentForActive.id) ? prev : [...prev, parentForActive.id]
      );
    }
  }, [activeTab, visibleNavGroups]);

  // Accordion toggle in expanded mode; never forces sidebar expansion when collapsed
  const handleParentClick = (groupId: string) => {
    if ((groupId === 'settings' || groupId === 'system') && !isSuper) {
      return; // Denied to non-superadmin
    }

    if (effectiveCollapsed) {
      cancelCloseTimer();
      setPinnedGroupId((prev) => {
        if (prev === groupId) {
          setHoveredGroupId(null);
          return null;
        }
        setHoveredGroupId(groupId);
        return groupId;
      });
      return;
    }

    const isCurrentlyOpen = expandedGroupIds.includes(groupId);

    setExpandedGroupIds((prev) =>
      isCurrentlyOpen
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    );

    // Auto-navigate to first child item in this group if not already inside this group
    const group = visibleNavGroups.find((g) => g.id === groupId);
    if (group && group.items.length > 0) {
      const hasActiveChild = group.items.some((i) => i.id === activeTab);
      if (!hasActiveChild) {
        setActiveTab(group.items[0].id);
      }
    }
  };

  const renderChildItem = (item: NavItem) => {
    const Icon = item.icon;
    const isActive =
      activeTab === item.id ||
      (activeTab === 'settings' && item.id === 'general-settings');
    const label = t(item.labelKey as any);

    return (
      <button
        key={item.id}
        onClick={() => {
          setActiveTab(item.id);
          if (isMobileOpen && onCloseMobile) {
            onCloseMobile();
          }
        }}
        title={effectiveCollapsed ? label : undefined}
        className={`sidebar-nav-item w-full flex items-center ${
          effectiveCollapsed ? 'justify-center px-2' : isRtl ? 'justify-between pr-3 pl-2.5 text-right' : 'justify-between pl-3 pr-2.5 text-left'
        } py-2 rounded-xl text-xs transition-all duration-200 group relative shrink-0 cursor-pointer ${
          isActive
            ? isLightMode
              ? 'active bg-indigo-50 text-indigo-800 font-semibold border border-indigo-300'
              : 'active bg-indigo-600/25 text-white font-semibold border border-indigo-500/40'
            : isLightMode
            ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
            : 'text-slate-300 hover:bg-white/5 hover:text-white border border-transparent'
        }`}
      >
        <div className={`flex items-center gap-2.5 min-w-0 ${effectiveCollapsed ? 'justify-center' : ''}`}>
          <Icon
            className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
              isActive
                ? isLightMode
                  ? 'text-indigo-600 scale-110'
                  : 'text-cyan-400 scale-110'
                : isLightMode
                ? 'text-slate-500 group-hover:text-slate-800'
                : 'text-slate-400 group-hover:text-slate-200'
            }`}
          />
          {!effectiveCollapsed && (
            <span className="truncate font-medium text-[12px] leading-none select-none">
              {label}
            </span>
          )}
        </div>

        {!effectiveCollapsed && item.badge && (
          <span
            className={`shrink-0 text-[10px] font-mono px-2 py-0.5 rounded-full border transition-colors ${
              isActive
                ? isLightMode
                  ? 'bg-indigo-100 text-indigo-800 border-indigo-300 font-bold'
                  : 'bg-indigo-500/25 text-indigo-200 border-indigo-500/50 font-bold'
                : isLightMode
                ? 'bg-slate-100 text-slate-600 border-slate-200'
                : 'bg-slate-900/60 text-slate-400 border-white/10'
            }`}
          >
            {item.badge}
          </span>
        )}

        {/* Collapsed Tooltip on Hover */}
        {effectiveCollapsed && (
          <div
            className={`hidden group-hover:flex absolute ${
              isRtl ? 'right-full mr-2' : 'left-full ml-2'
            } px-2.5 py-1.5 rounded-lg bg-slate-900/95 border border-white/20 text-white text-xs whitespace-nowrap shadow-xl z-50 pointer-events-none items-center gap-2`}
          >
            <span>{label}</span>
            {item.badge && (
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/30 text-indigo-300">
                {item.badge}
              </span>
            )}
          </div>
        )}
      </button>
    );
  };

  return (
    <>
      {/* Mobile & Tablet Backdrop Overlay (< lg) */}
      {isMobileOpen && (
        <div
          className="fixed inset-x-0 top-14 bottom-8 bg-slate-950/65 backdrop-blur-xs z-[150] lg:hidden animate-fadeIn"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`spatial-glass text-slate-300 flex-col p-2.5 shrink-0 border-white/10 backdrop-blur-2xl transition-all duration-300 overflow-hidden ${
          isMobileOpen
            ? `flex fixed top-14 bottom-8 ${
                isRtl ? 'right-0 border-l' : 'left-0 border-r'
              } z-[160] w-[272px] max-w-[82vw] sm:w-72 shadow-2xl`
            : 'hidden'
        } lg:flex lg:static lg:top-auto lg:bottom-auto lg:left-auto lg:right-auto lg:z-20 lg:self-stretch lg:h-full lg:max-h-full lg:shadow-none ${
          isRtl ? 'lg:border-l' : 'lg:border-r'
        } ${effectiveCollapsed ? 'lg:w-[74px]' : 'lg:w-64'}`}
        aria-label={t('sidebar_menu_title')}
      >
        {/* Collapse Toggle / Mobile Close Header */}
        <div
          className={`flex items-center ${
            effectiveCollapsed ? 'justify-center' : 'justify-between'
          } pb-2 mb-2 border-b ${isLightMode ? 'border-slate-200' : 'border-white/10'} shrink-0`}
        >
          {!effectiveCollapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <span className={`text-[11px] font-bold tracking-wider truncate ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                {t('sidebar_menu_title')}
              </span>
            </div>
          )}

          {/* Mobile & Tablet Drawer Close Button */}
          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className={`lg:hidden p-1.5 rounded-lg transition cursor-pointer shrink-0 ${
                isLightMode
                  ? 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'
                  : 'hover:bg-white/10 text-slate-400 hover:text-white'
              }`}
              title={isEn ? 'Close menu' : 'بستن منو'}
              aria-label={isEn ? 'Close menu' : 'بستن منو'}
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Desktop Collapse Toggle Button */}
          <button
            type="button"
            onClick={onToggleCollapse}
            className={`hidden lg:inline-flex p-1.5 rounded-lg transition cursor-pointer shrink-0 ${
              isLightMode
                ? 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'
                : 'hover:bg-white/10 text-slate-400 hover:text-white'
            }`}
            title={effectiveCollapsed ? t('sidebar_expand_tooltip') : t('sidebar_collapse_tooltip')}
          >
            {effectiveCollapsed ? (
              isRtl ? <ChevronLeft className={`w-4 h-4 ${isLightMode ? 'text-indigo-600' : 'text-cyan-400'}`} /> : <ChevronRight className={`w-4 h-4 ${isLightMode ? 'text-indigo-600' : 'text-cyan-400'}`} />
            ) : (
              isRtl ? <ChevronRight className={`w-4 h-4 ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`} /> : <ChevronLeft className={`w-4 h-4 ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`} />
            )}
          </button>
        </div>

        {/* Scrollable Navigation Area */}
        <div
          className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-1 custom-scrollbar ${
            effectiveCollapsed ? 'flex flex-col items-center gap-2.5 pt-2' : 'space-y-2'
          }`}
        >
          {visibleNavGroups.map((group) => {
            const isExpanded = expandedGroupIds.includes(group.id);
            const GroupIcon = group.icon;
            const hasActiveChild = group.items.some(
              (i) => i.id === activeTab || (activeTab === 'settings' && i.id === 'general-settings')
            );
            const isFlyoutOpen = effectiveCollapsed && activeFlyoutGroupId === group.id;

            if (effectiveCollapsed) {
              return (
                <button
                  key={group.id}
                  ref={(el) => {
                    railButtonRefs.current[group.id] = el;
                  }}
                  type="button"
                  data-collapsed-rail-btn="true"
                  aria-label={t(group.titleKey as any)}
                  aria-haspopup="menu"
                  aria-expanded={isFlyoutOpen}
                  onMouseEnter={() => {
                    cancelCloseTimer();
                    if (pinnedGroupId && pinnedGroupId !== group.id) {
                      setPinnedGroupId(null);
                    }
                    setHoveredGroupId(group.id);
                  }}
                  onMouseLeave={scheduleHoverClose}
                  onClick={() => handleParentClick(group.id)}
                  className={`relative w-11 h-11 rounded-2xl flex items-center justify-center border transition-all duration-200 cursor-pointer shrink-0 group ${
                    hasActiveChild
                      ? isLightMode
                        ? 'bg-indigo-50 border-indigo-300 shadow-xs'
                        : 'bg-indigo-600/20 border-indigo-400/50 shadow-[0_0_16px_rgba(99,102,241,0.2)]'
                      : isFlyoutOpen
                      ? isLightMode
                        ? 'bg-slate-100 border-slate-300 shadow-xs'
                        : 'bg-white/10 border-white/25'
                      : isLightMode
                      ? 'bg-slate-50/80 border-slate-200/80 hover:bg-slate-100 hover:border-slate-300'
                      : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.09] hover:border-white/20'
                  }`}
                >
                  {/* Active Group Side Indicator */}
                  {hasActiveChild && (
                    <span
                      className={`absolute top-2.5 bottom-2.5 w-[3px] rounded-full ${
                        isRtl ? '-right-1.5' : '-left-1.5'
                      } ${
                        isLightMode
                          ? 'bg-indigo-600'
                          : 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.85)]'
                      }`}
                    />
                  )}

                  <div
                    className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-transform duration-200 group-hover:scale-105 ${group.colorClass}`}
                  >
                    <GroupIcon className="w-4 h-4" />
                  </div>

                  {/* Update notification dot for Settings category */}
                  {group.id === 'settings' && hasUpdate && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-90" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500 border border-slate-900" />
                    </span>
                  )}

                  {/* Offline device alert dot for Infrastructure category */}
                  {group.id === 'infra' && offlineCount > 0 && (
                    <span
                      className="absolute -bottom-0.5 -left-0.5 w-2 h-2 rounded-full bg-amber-400 border border-slate-900"
                      title={t('sidebar_offline_alert_title', { count: offlineCount })}
                    />
                  )}
                </button>
              );
            }

            return (
              <div
                key={group.id}
                className={`rounded-2xl transition-all duration-200 border p-1 ${
                  isLightMode
                    ? 'border-slate-200 bg-slate-50/70'
                    : 'border-white/10 bg-white/[0.02]'
                }`}
              >
                {/* Accordion Parent Header Button */}
                <button
                  onClick={() => handleParentClick(group.id)}
                  className={`w-full flex items-center justify-between p-2 rounded-xl text-xs font-semibold transition-all cursor-pointer select-none ${
                    isExpanded
                      ? isLightMode
                        ? 'bg-white text-slate-900 border border-slate-200 shadow-xs'
                        : 'bg-white/10 text-white border border-white/10'
                      : hasActiveChild
                      ? isLightMode
                        ? 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100/80 border border-indigo-200'
                        : 'bg-indigo-600/15 text-slate-200 hover:bg-white/10'
                      : isLightMode
                      ? 'text-slate-700 hover:text-slate-900 hover:bg-white border border-transparent'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`p-1.5 rounded-lg border ${group.colorClass}`}>
                      <GroupIcon className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-bold text-[12px] truncate">
                      {t(group.titleKey as any)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded border ${
                      isLightMode
                        ? 'bg-slate-100 text-slate-600 border-slate-200'
                        : 'bg-white/5 text-slate-400 border-white/10'
                    }`}>
                      {t(group.tagKey as any)}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform duration-200 ${
                        isExpanded
                          ? `rotate-180 ${isLightMode ? 'text-indigo-600' : 'text-cyan-400'}`
                          : isRtl
                          ? '-rotate-90 text-slate-500'
                          : 'rotate-0 text-slate-500'
                      }`}
                    />
                  </div>
                </button>

                {/* Children Items Container (Accordion Collapsible) */}
                {isExpanded && (
                  <div
                    className={`${isRtl ? 'pr-2 mr-1 border-r' : 'pl-2 ml-1 border-l'} ${
                      isLightMode ? 'border-slate-200' : 'border-white/10'
                    } mt-1 space-y-1 animate-fadeIn`}
                  >
                    {group.items.map(renderChildItem)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* System Status / Telemetry in Footer */}
        <div className={`shrink-0 mt-auto pt-2 border-t ${isLightMode ? 'border-slate-200' : 'border-white/5'}`}>
          {!effectiveCollapsed ? (
            <div className={`p-2.5 rounded-xl border space-y-1.5 backdrop-blur-md shadow-xs ${
              isLightMode
                ? 'bg-slate-50 border-slate-200'
                : 'bg-white/5 border-white/10'
            }`}>
              <div className={`flex items-center justify-between text-[10px] font-mono ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                <span>{t('sidebar_backend_version')}</span>
                <span className={`font-bold ${isLightMode ? 'text-indigo-700' : 'text-cyan-400'}`}>FastAPI</span>
              </div>
              <p className={`text-[10px] leading-tight flex items-center gap-1.5 font-medium ${isLightMode ? 'text-emerald-700' : 'text-emerald-400'}`}>
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse"></span>
                <span>{t('sidebar_telemetry_live')}</span>
              </p>
              <div className={`text-[9px] font-mono pt-1 border-t flex items-center justify-between ${
                isLightMode ? 'text-slate-600 border-slate-200' : 'text-slate-500 border-white/5'
              }`}>
                <button
                  onClick={() => {
                    onOpenReleaseNotes?.();
                    if (isMobileOpen && onCloseMobile) onCloseMobile();
                  }}
                  className={`hover:underline flex items-center gap-1 cursor-pointer ${
                    isLightMode ? 'text-indigo-600 hover:text-indigo-800' : 'text-indigo-400 hover:text-indigo-300'
                  }`}
                >
                  <span>{t('sidebar_release_notes')}</span>
                </button>
                <span className={isLightMode ? 'text-emerald-700 font-semibold' : 'text-emerald-400'}>{t('sidebar_system_nominal')}</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-1">
              <button
                type="button"
                onClick={() => {
                  closeFlyout();
                  onOpenReleaseNotes?.();
                }}
                className={`w-9 h-9 rounded-xl flex items-center justify-center border transition cursor-pointer ${
                  isLightMode
                    ? 'bg-slate-100 hover:bg-slate-200 text-indigo-600 border-slate-200'
                    : 'bg-white/5 hover:bg-white/10 text-cyan-400 border-white/10'
                }`}
                title={t('sidebar_release_notes')}
                aria-label={t('sidebar_release_notes')}
              >
                <Activity className="w-4 h-4" />
              </button>
              <div
                className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse"
                title={t('sidebar_telemetry_live')}
              />
            </div>
          )}
        </div>
      </aside>

      {/* Desktop Collapsed Rail Floating Flyout Menu (Portal to avoid overflow clipping & keep rail collapsed) */}
      {effectiveCollapsed &&
        activeFlyoutGroup &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={flyoutRef}
            role="menu"
            aria-label={t(activeFlyoutGroup.titleKey as any)}
            dir={isRtl ? 'rtl' : 'ltr'}
            onMouseEnter={cancelCloseTimer}
            onMouseLeave={() => {
              if (!pinnedGroupId) {
                scheduleHoverClose();
              } else {
                setHoveredGroupId(null);
              }
            }}
            style={{
              top: flyoutCoords ? `${flyoutCoords.top}px` : '-9999px',
              ...(isRtl
                ? { right: flyoutCoords?.right ? `${flyoutCoords.right}px` : '84px' }
                : { left: flyoutCoords?.left ? `${flyoutCoords.left}px` : '84px' }),
              visibility: flyoutCoords ? 'visible' : 'hidden',
            }}
            className={`fixed z-[220] w-64 max-w-[calc(100vw-98px)] rounded-2xl border backdrop-blur-2xl shadow-2xl animate-fadeIn ${
              isLightMode
                ? 'bg-white/95 border-slate-200 text-slate-800 shadow-[0_20px_45px_rgba(15,23,42,0.16)]'
                : 'bg-slate-900/95 border-white/15 text-slate-200 shadow-[0_20px_50px_rgba(0,0,0,0.65)] ring-1 ring-white/10'
            }`}
          >
            {/* Invisible pointer bridge across the gap between rail button and flyout card */}
            <div
              className={`absolute inset-y-0 w-3.5 ${isRtl ? '-right-3.5' : '-left-3.5'}`}
              aria-hidden="true"
            />

            {/* Flyout Category Header */}
            <div
              className={`flex items-center justify-between gap-2 px-3 py-2.5 border-b ${
                isLightMode ? 'border-slate-200/80 bg-slate-50/80' : 'border-white/10 bg-white/[0.03]'
              } rounded-t-2xl`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className={`p-1.5 rounded-lg border shrink-0 ${activeFlyoutGroup.colorClass}`}>
                  <activeFlyoutGroup.icon className="w-3.5 h-3.5" />
                </div>
                <span
                  className={`font-bold text-xs truncate ${
                    isLightMode ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  {t(activeFlyoutGroup.titleKey as any)}
                </span>
              </div>
              <span
                className={`font-mono text-[9px] px-1.5 py-0.5 rounded border shrink-0 ${
                  isLightMode
                    ? 'bg-slate-100 text-slate-600 border-slate-200'
                    : 'bg-white/5 text-slate-400 border-white/10'
                }`}
              >
                {t(activeFlyoutGroup.tagKey as any)}
              </span>
            </div>

            {/* Flyout Sub-items List */}
            <div className="p-1.5 space-y-1 max-h-[calc(100dvh-160px)] overflow-y-auto custom-scrollbar">
              {activeFlyoutGroup.items.map((item) => {
                const ItemIcon = item.icon;
                const isActive =
                  activeTab === item.id ||
                  (activeTab === 'settings' && item.id === 'general-settings');
                const label = t(item.labelKey as any);

                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActiveTab(item.id);
                      closeFlyout();
                    }}
                    className={`sidebar-nav-item w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs transition-all duration-150 cursor-pointer ${
                      isRtl ? 'text-right' : 'text-left'
                    } ${
                      isActive
                        ? isLightMode
                          ? 'active bg-indigo-50 text-indigo-700 font-bold border border-indigo-200'
                          : 'active bg-indigo-600/25 text-white font-semibold border border-indigo-500/40'
                        : isLightMode
                        ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-950 border border-transparent'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ItemIcon
                        className={`w-4 h-4 shrink-0 ${
                          isActive
                            ? isLightMode
                              ? 'text-indigo-600'
                              : 'text-cyan-400'
                            : isLightMode
                            ? 'text-slate-500'
                            : 'text-slate-400'
                        }`}
                      />
                      <span className="truncate font-medium text-[12px] leading-tight">
                        {label}
                      </span>
                    </div>

                    {item.badge && (
                      <span
                        className={`sidebar-badge shrink-0 text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                          isActive
                            ? isLightMode
                              ? 'active bg-indigo-100 text-indigo-800 border-indigo-300 font-bold'
                              : 'active bg-indigo-500/25 text-indigo-200 border-indigo-500/50 font-bold'
                            : isLightMode
                            ? 'bg-slate-100 text-slate-600 border-slate-200'
                            : 'bg-slate-950/60 text-slate-400 border-white/10'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
