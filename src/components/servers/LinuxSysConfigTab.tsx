import React, { useState } from 'react';
import {
  Server,
  Globe,
  Lock,
  Clock,
  Shield,
  FileText,
} from 'lucide-react';
import { RemoteServer } from '../../types';
import { LinuxHostnameSection } from './sysconfig/LinuxHostnameSection';
import { LinuxDnsSection } from './sysconfig/LinuxDnsSection';
import { LinuxFail2banSection } from './sysconfig/LinuxFail2banSection';
import { LinuxTimeSection } from './sysconfig/LinuxTimeSection';
import { LinuxSshSection } from './sysconfig/LinuxSshSection';
import { LinuxProxySection } from './sysconfig/LinuxProxySection';

interface LinuxSysConfigTabProps {
  server: RemoteServer;
  ephemeralPassword?: string;
  isLightMode?: boolean;
  isEn?: boolean;
  onSshPortChanged?: (newPort: number) => void;
}

export const LinuxSysConfigTab: React.FC<LinuxSysConfigTabProps> = ({
  server,
  ephemeralPassword,
  isLightMode = false,
  isEn = true,
  onSshPortChanged,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<
    'ssh' | 'hostname' | 'dns' | 'fail2ban' | 'time' | 'proxy'
  >('ssh');

  const subTabs = [
    {
      id: 'ssh',
      label: isEn ? 'SSH Security & Port' : 'امنیت و پورت SSH',
      icon: Lock,
    },
    {
      id: 'hostname',
      label: isEn ? 'Hostname & Hosts' : 'هاست‌نیم و /etc/hosts',
      icon: FileText,
    },
    {
      id: 'dns',
      label: isEn ? 'DNS & Resolv' : 'سرورهای DNS',
      icon: Globe,
    },
    {
      id: 'fail2ban',
      label: isEn ? 'Fail2ban IPS' : 'ضد نفوذ Fail2ban',
      icon: Shield,
    },
    {
      id: 'time',
      label: isEn ? 'Time & Timezone' : 'ساعت و منطقه زمانی',
      icon: Clock,
    },
    {
      id: 'proxy',
      label: isEn ? 'System Proxy' : 'پروکسی سیستم',
      icon: Server,
    },
  ] as const;

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Sub-tabs Navigation */}
      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/60 border border-inherit/30 overflow-x-auto">
        {subTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/20'
                  : isLightMode
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active Sub-Tab Content */}
      <div className="pt-1">
        {activeSubTab === 'ssh' && (
          <LinuxSshSection
            server={server}
            ephemeralPassword={ephemeralPassword}
            isLightMode={isLightMode}
            isEn={isEn}
            onSshPortChanged={onSshPortChanged}
          />
        )}

        {activeSubTab === 'hostname' && (
          <LinuxHostnameSection
            server={server}
            ephemeralPassword={ephemeralPassword}
            isLightMode={isLightMode}
            isEn={isEn}
          />
        )}

        {activeSubTab === 'dns' && (
          <LinuxDnsSection
            server={server}
            ephemeralPassword={ephemeralPassword}
            isLightMode={isLightMode}
            isEn={isEn}
          />
        )}

        {activeSubTab === 'fail2ban' && (
          <LinuxFail2banSection
            server={server}
            ephemeralPassword={ephemeralPassword}
            isLightMode={isLightMode}
            isEn={isEn}
          />
        )}

        {activeSubTab === 'time' && (
          <LinuxTimeSection
            server={server}
            ephemeralPassword={ephemeralPassword}
            isLightMode={isLightMode}
            isEn={isEn}
          />
        )}

        {activeSubTab === 'proxy' && (
          <LinuxProxySection
            server={server}
            ephemeralPassword={ephemeralPassword}
            isLightMode={isLightMode}
            isEn={isEn}
          />
        )}
      </div>
    </div>
  );
};
