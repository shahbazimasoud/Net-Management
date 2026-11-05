import React from 'react';
import { ScrollText, ShieldCheck, Clock, FileCheck, Network, Sparkles, Plus } from 'lucide-react';
import { AccessPolicy, Device } from '../../types';

interface ContractsViewProps {
  devices: Device[];
  isLightMode?: boolean;
  isEn?: boolean;
  effectivePolicy?: AccessPolicy;
  onNavigateToLicenses?: () => void;
}

export const ContractsView: React.FC<ContractsViewProps> = ({
  devices,
  isLightMode = false,
  isEn = true,
  onNavigateToLicenses,
}) => {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6" dir={isEn ? 'ltr' : 'rtl'}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
          <ScrollText className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100 flex items-center gap-2">
            {isEn ? 'Contracts & SLA Agreements Management' : 'مدیریت قراردادها، گارانتی و توافق‌نامه‌های SLA'}
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
              Phase 4 Ready
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            {isEn
              ? 'Comprehensive vendor warranty, ISP bandwidth SLAs, support contracts, and multi-recipient renewal alerts'
              : 'سامانه ثبت و پایش قراردادهای گارانتی تجهیزات، پهنای باند اینترنت (ISP SLA)، پشتیبانی نرم‌افزاری و هشدارهای تمدید'}
          </p>
        </div>
      </div>

      {/* Feature Preview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          className={`p-5 rounded-2xl border space-y-3 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
          }`}
        >
          <div className="p-2.5 w-fit rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-100">
            {isEn ? 'Hardware Warranty & RMA' : 'گارانتی سخت‌افزار و RMA'}
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            {isEn
              ? 'Track Cisco SmartNet, FortiCare, HPE Pointnext, and server vendor warranty commitments with live response time SLAs.'
              : 'پایش گارانتی‌های رسمی سیسکو، فورتی‌نت، سرورهای HPE و ثبت زمان پاسخ‌گویی (SLA) تامین‌کنندگان مجاز.'}
          </p>
        </div>

        <div
          className={`p-5 rounded-2xl border space-y-3 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
          }`}
        >
          <div className="p-2.5 w-fit rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Network className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-100">
            {isEn ? 'ISP & Bandwidth Link SLAs' : 'قراردادهای پهنای باند و ISP'}
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            {isEn
              ? 'Track dedicated internet circuits, MPLS, point-to-point wireless links, committed bandwidth, and MTTR penalty clauses.'
              : 'مدیریت خطوط اینترنت اختصاصی، لینک‌های اینترانت، پهنای باند تضمین‌شده و جریمه‌های تاخیر در رفع قطعی.'}
          </p>
        </div>

        <div
          className={`p-5 rounded-2xl border space-y-3 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
          }`}
        >
          <div className="p-2.5 w-fit rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-100">
            {isEn ? 'Multi-Tier Renewal Daemon' : 'موتور پایش زمان‌بندی تمدید'}
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            {isEn
              ? 'Shared backend cron daemon dispatches automated email warnings across custom thresholds (e.g. 60, 30, 15, 0 days).'
              : 'موتور پس‌زمینه خودکار پنل جهت ارسال ایمیل هشدار به مدیران و کارشناسان در روزهای مشخص قبل از انقضای قرارداد.'}
          </p>
        </div>
      </div>

      {/* Quick Action Banner */}
      <div
        className={`p-6 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-4 ${
          isLightMode ? 'bg-indigo-50/50 border-indigo-200' : 'bg-indigo-950/20 border-indigo-500/30'
        }`}
      >
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-indigo-400 shrink-0" />
          <div>
            <h4 className="text-sm font-bold text-slate-200">
              {isEn ? 'Phase 3 Licenses Management is Live!' : 'بخش مدیریت لایسنس‌ها در فاز ۳ هم‌اکنون فعال و آماده بهره‌برداری است'}
            </h4>
            <p className="text-xs text-slate-400">
              {isEn
                ? 'You can register, edit, filter, upload certificates, and test alerts in the Licenses tab.'
                : 'می‌توانید لایسنس‌های نرم‌افزاری و تجهیزات را ثبت، ویرایش، پیوست‌گذاری و آزمایش فرمایید.'}
            </p>
          </div>
        </div>

        {onNavigateToLicenses && (
          <button
            type="button"
            onClick={onNavigateToLicenses}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all cursor-pointer shrink-0"
          >
            {isEn ? 'Open Licenses Management' : 'مشاهده مدیریت لایسنس‌ها'}
          </button>
        )}
      </div>
    </div>
  );
};
