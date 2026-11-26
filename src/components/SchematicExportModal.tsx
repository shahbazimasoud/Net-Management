import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Download,
  FileCode2,
  CreditCard,
  Server,
  Layers,
  Network,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import {
  CustomTopologyLink,
  CustomTopologyMap,
  CustomTopologyRack,
  CustomTopologyStickyNote,
  CustomTopologyTower,
  Device,
  TopologyLink,
} from '../types';
import { authorizeSchematicExport } from '../services/api';
import {
  buildSchematicHtmlExport,
  downloadSchematicHtmlFile,
  extractSchematicVlanSummary,
  SchematicExportMode,
} from '../utils/schematicHtmlExport';
import { FieldInfoTooltip } from './common/FieldInfoTooltip';
import { useModalDock } from '../context/ModalDockContext';

interface SchematicExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestore?: () => void;
  map: CustomTopologyMap | null;
  mapName: string;
  mapDescription?: string;
  activeViewMode: 'card' | 'physical';
  devices: Device[];
  customLinks: CustomTopologyLink[];
  topologyLinks?: TopologyLink[];
  racks: CustomTopologyRack[];
  towers: CustomTopologyTower[];
  stickyNotes: CustomTopologyStickyNote[];
  cardPositions: Map<string, { x: number; y: number }>;
  physicalPositions: Map<string, { x: number; y: number }>;
  isLightMode: boolean;
  isEn: boolean;
  onExportSuccess?: (message: string) => void;
}

export const SchematicExportModal: React.FC<SchematicExportModalProps> = ({
  isOpen,
  onClose,
  onRestore,
  map,
  mapName,
  mapDescription,
  activeViewMode,
  devices,
  customLinks,
  topologyLinks = [],
  racks,
  towers,
  stickyNotes,
  cardPositions,
  physicalPositions,
  isLightMode,
  isEn,
  onExportSuccess,
}) => {
  const { dockModal, undockModal } = useModalDock();
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [exportMode, setExportMode] = useState<SchematicExportMode>(activeViewMode);
  const [includeVlanTable, setIncludeVlanTable] = useState(true);
  const [includePortVlanDirectory, setIncludePortVlanDirectory] = useState(true);
  const [includeStickyNotes, setIncludeStickyNotes] = useState(true);
  const [exportLightTheme, setExportLightTheme] = useState(isLightMode);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setExportMode(activeViewMode);
      setExportLightTheme(isLightMode);
      setErrorMsg(null);
      setSuccessMsg(null);
      setIsMinimized(false);
      undockModal('modal-schematic-export');
    } else {
      setIsMinimized(false);
      undockModal('modal-schematic-export');
    }
  }, [isOpen, activeViewMode, isLightMode, undockModal]);

  const vlanSummary = useMemo(
    () => extractSchematicVlanSummary(devices, customLinks, topologyLinks),
    [devices, customLinks, topologyLinks]
  );

  const handleMinimize = () => {
    setIsMinimized(true);
    dockModal({
      id: 'modal-schematic-export',
      labelEn: `Export Schematic: ${mapName}`,
      labelFa: `خروجی شماتیک: ${mapName}`,
      badge: 'HTML',
      category: 'tools',
      onRestore: () => {
        setIsMinimized(false);
        undockModal('modal-schematic-export');
        if (onRestore) onRestore();
      },
      onClose: () => {
        setIsMinimized(false);
        undockModal('modal-schematic-export');
        onClose();
      },
    });
  };

  const handleExport = async () => {
    setIsExporting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const authRes = await authorizeSchematicExport({
        mapId: map?.id,
        mapName,
        exportMode,
        deviceCount: devices.length,
        linkCount: vlanSummary.linkRows.length,
        vlanCount: vlanSummary.uniqueVlans.length,
        rackCount: racks.length,
        towerCount: towers.length,
      });

      const { html, filename, stats } = buildSchematicHtmlExport({
        map,
        mapName,
        mapDescription,
        devices,
        customLinks,
        topologyLinks,
        racks,
        towers,
        stickyNotes,
        cardPositions,
        physicalPositions,
        exportMode,
        includeVlanTable,
        includePortVlanDirectory,
        includeStickyNotes,
        isLightMode: exportLightTheme,
        isEn,
        exportedBy: authRes.exportedBy,
        exportedAt: authRes.exportedAt,
      });

      downloadSchematicHtmlFile(html, filename);

      const doneMsg = isEn
        ? `Exported "${filename}" (${stats.deviceCount} devices, ${stats.linkCount} links, ${stats.vlanCount} VLANs).`
        : `فایل «${filename}» با موفقیت دانلود شد (${stats.deviceCount} تجهیز، ${stats.linkCount} لینک، ${stats.vlanCount} VLAN).`;
      setSuccessMsg(doneMsg);
      if (onExportSuccess) onExportSuccess(doneMsg);
    } catch (err: any) {
      setErrorMsg(
        err?.message ||
          (isEn
            ? 'You do not have permission to export this schematic map.'
            : 'شما مجوز دریافت خروجی از این نقشه شماتیک را ندارید.')
      );
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen || isMinimized) return null;

  const isRtl = !isEn;

  const modalContent = (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="fixed top-0 left-0 right-0 bottom-8 z-[9999] flex items-center justify-center bg-black/65 backdrop-blur-xs p-3 sm:p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`flex flex-col overflow-hidden border shadow-2xl transition-all ${
          isMaximized
            ? 'w-full h-full rounded-xl'
            : 'w-full max-w-2xl max-h-[88vh] rounded-2xl'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-200 text-slate-900'
            : 'bg-slate-950 border-cyan-500/30 text-slate-100'
        }`}
      >
        {/* Header with Mandatory 3 Controls (Close, Minimize, Fullscreen) */}
        <div
          className={`flex items-center justify-between gap-3 px-5 py-3.5 border-b shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`p-2 rounded-xl border ${
                isLightMode
                  ? 'bg-cyan-50 border-cyan-200 text-cyan-700'
                  : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
              }`}
            >
              <FileCode2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold truncate">
                {isEn
                  ? 'Export Visual Schematic Topology (HTML)'
                  : 'خروجی ویژوال نقشه شماتیک (HTML)'}
              </h3>
              <p className={`text-[11px] truncate ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {mapName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleMinimize}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title={isEn ? 'Minimize to Dock' : 'مینیمایز در نوار ابزار'}
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setIsMaximized((prev) => !prev)}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title={
                isMaximized
                  ? isEn
                    ? 'Exit Fullscreen'
                    : 'خروج از تمام‌صفحه'
                  : isEn
                  ? 'Fullscreen'
                  : 'تمام‌صفحه'
              }
            >
              {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                  : 'bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border-rose-500/30'
              }`}
              title={isEn ? 'Close' : 'بستن'}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* RBAC Verified Banner */}
          <div
            className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs ${
              isLightMode
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-bold">
                {isEn
                  ? 'RBAC Authorized & Audit-Logged Visual HTML Export'
                  : 'خروجی HTML ویژوال با تایید کنترل دسترسی RBAC و ثبت در لاگ ممیزی'}
              </div>
              <div className={`text-[11px] ${isLightMode ? 'text-emerald-700' : 'text-emerald-300/80'}`}>
                {isEn
                  ? 'Generates a self-contained offline interactive HTML file with zero credentials or secrets included.'
                  : 'یک فایل HTML مستقل، آفلاین و تعاملی تولید می‌کند و هیچ‌گونه رمز عبور یا کلید محرمانه‌ای در آن قرار نمی‌گیرد.'}
              </div>
            </div>
          </div>

          {/* Live Map Summary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              {
                label: isEn ? 'Devices' : 'تجهیزات',
                val: devices.length,
                color: isLightMode ? 'text-cyan-700' : 'text-cyan-300',
              },
              {
                label: isEn ? 'Cable Links' : 'لینک‌های ارتباطی',
                val: vlanSummary.linkRows.length,
                color: isLightMode ? 'text-indigo-700' : 'text-indigo-300',
              },
              {
                label: isEn ? 'Unique VLANs' : 'VLANهای نقشه',
                val: vlanSummary.uniqueVlans.length,
                color: isLightMode ? 'text-purple-700' : 'text-purple-300',
              },
              {
                label: isEn ? 'Racks & Towers' : 'رک و دکل',
                val: racks.length + towers.length,
                color: isLightMode ? 'text-emerald-700' : 'text-emerald-300',
              },
            ].map((item) => (
              <div
                key={item.label}
                className={`p-3 rounded-xl border ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/70 border-slate-800'
                }`}
              >
                <div className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  {item.label}
                </div>
                <div className={`text-lg font-extrabold font-mono mt-0.5 ${item.color}`}>
                  {item.val}
                </div>
              </div>
            ))}
          </div>

          {/* Export Scope Selection */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold">
              <span>{isEn ? 'Visual View Mode to Export' : 'انتخاب نمای ویژوال جهت خروجی'}</span>
              <FieldInfoTooltip
                isEn={isEn}
                isLightMode={isLightMode}
                fieldName={isEn ? 'Visual Export Mode' : 'حالت نمای خروجی ویژوال'}
                whatIsIt={
                  isEn
                    ? 'Select whether to export the Card cabling topology, the Physical racks & chassis elevation, or an interactive HTML containing both views.'
                    : 'تعیین می‌کند خروجی HTML شامل نمای کارت‌ها (کابل‌کشی)، نمای فیزیکی (رک‌ها، دکل‌ها و شاسی) یا هر دو نمای تعاملی همزمان باشد.'
                }
                whyNeeded={
                  isEn
                    ? 'Allows sharing tailored visual documentation for logical L2/VLAN cabling reviews or physical datacenter rack audits.'
                    : 'امکان ارائه مستند بصری دقیق برای بررسی اتصالات منطقی/VLAN یا ممیزی چیدمان فیزیکی رک‌های دیتاسنتر را فراهم می‌کند.'
                }
                example={
                  isEn
                    ? 'Choose "Cards + Physical" for full documentation with a built-in view switcher.'
                    : 'برای مستند کامل با دکمه جابه‌جایی بین کارت و فیزیکی، گزینه «هر دو نما (کامل)» را انتخاب کنید.'
                }
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {[
                {
                  id: 'card' as SchematicExportMode,
                  icon: CreditCard,
                  title: isEn ? 'Cards View' : 'نمای کارت‌ها',
                  sub: isEn
                    ? 'Interactive canvas, cables & VLAN tags'
                    : 'بوم تعاملی کارت‌ها، کابل‌ها و VLAN',
                },
                {
                  id: 'physical' as SchematicExportMode,
                  icon: Server,
                  title: isEn ? 'Physical View' : 'نمای فیزیکی',
                  sub: isEn
                    ? 'Racks, telecom towers & hardware chassis'
                    : 'رک‌ها، دکل‌ها و نمای سخت‌افزاری شاسی',
                },
                {
                  id: 'both' as SchematicExportMode,
                  icon: Layers,
                  title: isEn ? 'Cards + Physical' : 'کارت + فیزیکی (کامل)',
                  sub: isEn
                    ? 'Both views with switcher inside HTML'
                    : 'هر دو نما با سوییچر داخلی در HTML',
                },
              ].map((opt) => {
                const Icon = opt.icon;
                const active = exportMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setExportMode(opt.id)}
                    className={`p-3 rounded-xl border text-start transition cursor-pointer ${
                      active
                        ? isLightMode
                          ? 'bg-cyan-50 border-cyan-500 text-cyan-950 ring-1 ring-cyan-500'
                          : 'bg-cyan-500/15 border-cyan-400 text-white ring-1 ring-cyan-400/50'
                        : isLightMode
                        ? 'bg-white border-slate-200 hover:border-slate-300 text-slate-800'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <Icon className={`w-4 h-4 ${active ? 'text-cyan-500' : 'opacity-70'}`} />
                      <span>{opt.title}</span>
                    </div>
                    <div className={`text-[11px] mt-1 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {opt.sub}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Options Checkboxes */}
          <div
            className={`p-3.5 rounded-xl border space-y-2.5 ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs font-bold mb-1">
              <Network className="w-3.5 h-3.5 text-purple-400" />
              <span>{isEn ? 'Included Tables & Visual Options' : 'جداول VLAN و تنظیمات خروجی'}</span>
              <FieldInfoTooltip
                isEn={isEn}
                isLightMode={isLightMode}
                fieldName={isEn ? 'VLAN Connections Matrix' : 'جدول کامل ارتباطات VLAN'}
                whatIsIt={
                  isEn
                    ? 'Embeds a searchable, filterable VLAN summary and full port-to-port interconnection table directly inside the exported HTML.'
                    : 'جدول خلاصه VLANها و جدول کامل اتصالات پورت‌به‌پورت با قابلیت جستجو و فیلتر را در فایل HTML خروجی ثبت می‌کند.'
                }
                whyNeeded={
                  isEn
                    ? 'Documents exact Trunk/Access modes, source/target VLAN IDs, speeds, and port allocations for every link on the map.'
                    : 'حالت دقیق Trunk/Access، شماره VLAN مبدا و مقصد، سرعت و تخصیص پورت‌ها را برای تمام لینک‌های نقشه مستندسازی می‌کند.'
                }
                example={
                  isEn
                    ? 'Click "VLAN 10" in the exported HTML to filter the table and highlight all VLAN 10 links on the diagram.'
                    : 'با کلیک روی VLAN 10 در فایل HTML، تمام لینک‌های آن VLAN هم در جدول فیلتر و هم روی نقشه هایلایت می‌شوند.'
                }
              />
            </div>

            <label className="flex items-center gap-2.5 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeVlanTable}
                onChange={(e) => setIncludeVlanTable(e.target.checked)}
                className="w-4 h-4 rounded accent-cyan-500 cursor-pointer"
              />
              <span>
                {isEn
                  ? `Include Complete VLAN Summary & Port-to-Port Connections Table (${vlanSummary.uniqueVlans.length} VLANs, ${vlanSummary.linkRows.length} links)`
                  : `درج جدول خلاصه VLANها و جدول کامل ارتباطات پورت‌به‌پورت (${vlanSummary.uniqueVlans.length} VLAN و ${vlanSummary.linkRows.length} لینک)`}
              </span>
            </label>

            <label className="flex items-center gap-2.5 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includePortVlanDirectory}
                onChange={(e) => setIncludePortVlanDirectory(e.target.checked)}
                className="w-4 h-4 rounded accent-cyan-500 cursor-pointer"
              />
              <span>
                {isEn
                  ? `Include Device Switch-Port VLAN Allocation Directory (${vlanSummary.portVlanRows.length} VLAN ports)`
                  : `درج جدول تفصیلی تخصیص VLAN روی پورت‌های تجهیزات (${vlanSummary.portVlanRows.length} پورت)`}
              </span>
            </label>

            <label className="flex items-center gap-2.5 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeStickyNotes}
                onChange={(e) => setIncludeStickyNotes(e.target.checked)}
                className="w-4 h-4 rounded accent-cyan-500 cursor-pointer"
              />
              <span>
                {isEn
                  ? `Include Canvas Sticky Notes (${stickyNotes.length})`
                  : `درج یادداشت‌های استیکی ثبت‌شده روی نقشه (${stickyNotes.length})`}
              </span>
            </label>

            <label className="flex items-center gap-2.5 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={exportLightTheme}
                onChange={(e) => setExportLightTheme(e.target.checked)}
                className="w-4 h-4 rounded accent-cyan-500 cursor-pointer"
              />
              <span>
                {isEn
                  ? 'Open exported HTML in Light Theme by default (switchable inside file)'
                  : 'باز شدن پیش‌فرض فایل HTML در تم روشن (قابل تغییر درون فایل)'}
              </span>
            </label>
          </div>

          {errorMsg && (
            <div className="flex items-start gap-2 p-3 rounded-xl border bg-rose-500/15 border-rose-500/40 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-start gap-2 p-3 rounded-xl border bg-emerald-500/15 border-emerald-500/40 text-emerald-300 text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`flex items-center justify-end gap-2.5 px-5 py-3.5 border-t shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
              isLightMode
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            {isEn ? 'Close' : 'بستن'}
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white shadow-md transition active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>
              {isExporting
                ? isEn
                  ? 'Authorizing & Exporting...'
                  : 'در حال تایید مجوز و تولید HTML...'
                : isEn
                ? 'Download Visual HTML'
                : 'دانلود خروجی ویژوال HTML'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
