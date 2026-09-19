import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Terminal,
  Server,
  Play,
  Copy,
  Check,
  RefreshCw,
  Power,
  Layers,
  Sparkles,
  Command,
  Trash2,
  Lock,
  Unlock,
  Shield,
  Settings2
} from 'lucide-react';
import { RemoteServer } from '../../types';
import { getRemoteServerWebSocketUrl } from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface LinuxTerminalModalProps {
  isOpen: boolean;
  server: RemoteServer | null;
  initialShell?: 'bash' | 'zsh';
  onClose: () => void;
  onMinimize: () => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

interface TerminalLogLine {
  id: string;
  type: 'input' | 'output' | 'error' | 'system';
  text: string;
  timestamp: string;
}

const QUICK_SNIPPETS = [
  { label: 'System Info', cmd: 'uname -a && cat /etc/os-release | grep PRETTY_NAME' },
  { label: 'Disk Space', cmd: 'df -h -x tmpfs -x devtmpfs' },
  { label: 'Memory & Swap', cmd: 'free -h' },
  { label: 'Top Processes', cmd: 'ps aux --sort=-%mem | head -n 10' },
  { label: 'Docker Containers', cmd: 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"' },
  { label: 'Open Ports', cmd: 'ss -tulpn' },
  { label: 'Uptime & Load', cmd: 'uptime' },
  { label: 'Active Shell', cmd: 'echo "Current Shell: $SHELL ($0)" && which zsh bash' },
];

export const LinuxTerminalModal: React.FC<LinuxTerminalModalProps> = ({
  isOpen,
  server,
  initialShell = 'bash',
  onClose,
  onMinimize,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [selectedShell, setSelectedShell] = useState<'bash' | 'zsh'>(initialShell);
  const [lines, setLines] = useState<TerminalLogLine[]>([]);
  const [inputVal, setInputVal] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState<'xs' | 'sm' | 'base'>('sm');
  const [autoScroll, setAutoScroll] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync initial shell when server changes
  useEffect(() => {
    if (server?.default_shell === 'zsh') {
      setSelectedShell('zsh');
    } else {
      setSelectedShell(initialShell);
    }
  }, [server, initialShell]);

  // Connect to WebSocket SSH session
  const connectSession = useCallback(() => {
    if (!server) return;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnecting(true);
    setIsConnected(false);

    const wsUrl = getRemoteServerWebSocketUrl(server.id, selectedShell, {
      ip: server.ip,
      ssh_port: server.ssh_port || 22,
      ssh_username: server.ssh_username || 'root',
      ssh_password: server.ssh_password,
    });

    setLines((prev) => [
      ...prev,
      {
        id: Math.random().toString(),
        type: 'system',
        text: `[Connecting] Initiating secure ${selectedShell.toUpperCase()} terminal session to ${server.name} (${server.ip}:${server.ssh_port || 22})...`,
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnecting(false);
        setIsConnected(true);
        setLines((prev) => [
          ...prev,
          {
            id: Math.random().toString(),
            type: 'system',
            text: `[Connected] SSH session active with ${server.ip} on /bin/${selectedShell}. Ready for interactive input.`,
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
        inputRef.current?.focus();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'data') {
            setLines((prev) => [
              ...prev,
              {
                id: Math.random().toString(),
                type: 'output',
                text: msg.data || '',
                timestamp: new Date().toLocaleTimeString(),
              },
            ]);
          } else if (msg.type === 'status') {
            if (msg.status === 'connected') {
              setIsConnected(true);
            } else if (msg.status === 'failed') {
              setIsConnected(false);
              setLines((prev) => [
                ...prev,
                {
                  id: Math.random().toString(),
                  type: 'error',
                  text: `[Connection Failed] ${msg.message || 'Unable to establish SSH session'}`,
                  timestamp: new Date().toLocaleTimeString(),
                },
              ]);
            }
          } else if (msg.type === 'error') {
            setLines((prev) => [
              ...prev,
              {
                id: Math.random().toString(),
                type: 'error',
                text: `[Error] ${msg.error || 'SSH stream error'}`,
                timestamp: new Date().toLocaleTimeString(),
              },
            ]);
          }
        } catch {
          // Plain text fallback
          setLines((prev) => [
            ...prev,
            {
              id: Math.random().toString(),
              type: 'output',
              text: String(event.data),
              timestamp: new Date().toLocaleTimeString(),
            },
          ]);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsConnecting(false);
        setLines((prev) => [
          ...prev,
          {
            id: Math.random().toString(),
            type: 'system',
            text: `[Session Closed] Terminal disconnected from ${server.ip}.`,
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
      };

      ws.onerror = () => {
        setIsConnected(false);
        setIsConnecting(false);
        setLines((prev) => [
          ...prev,
          {
            id: Math.random().toString(),
            type: 'error',
            text: `[Socket Error] Could not connect to WebSocket bridge on ${wsUrl}.`,
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
      };
    } catch (err: any) {
      setIsConnecting(false);
      setIsConnected(false);
      setLines((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          type: 'error',
          text: `[Exception] ${err.message}`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    }
  }, [server, selectedShell]);

  // Connect on modal open or shell switch
  useEffect(() => {
    if (isOpen && server) {
      connectSession();
    } else {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [isOpen, server, selectedShell, connectSession]);

  // Auto scroll to bottom
  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lines, autoScroll]);

  const sendCommand = (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    setLines((prev) => [
      ...prev,
      {
        id: Math.random().toString(),
        type: 'input',
        text: trimmed,
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);

    setHistory((prev) => [...prev, trimmed]);
    setHistoryIdx(-1);
    setInputVal('');

    if (wsRef.current && isConnected) {
      wsRef.current.send(
        JSON.stringify({
          type: 'input',
          data: `${trimmed}\n`,
        })
      );
    } else {
      // Local simulated response if offline
      setTimeout(() => {
        setLines((prev) => [
          ...prev,
          {
            id: Math.random().toString(),
            type: 'system',
            text: `[Echo Command] ${trimmed}\n(Server connection inactive - output pending reconnect)`,
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
      }, 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      sendCommand(inputVal);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIdx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(nextIdx);
      setInputVal(history[nextIdx] || '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx === -1) return;
      const nextIdx = historyIdx + 1;
      if (nextIdx >= history.length) {
        setHistoryIdx(-1);
        setInputVal('');
      } else {
        setHistoryIdx(nextIdx);
        setInputVal(history[nextIdx] || '');
      }
    }
  };

  const handleClearTerminal = () => {
    setLines([
      {
        id: Math.random().toString(),
        type: 'system',
        text: `[Terminal Cleared] Active shell: ${selectedShell}.`,
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
  };

  const handleCopySnippet = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 1500);
    setInputVal(cmd);
    inputRef.current?.focus();
  };

  if (!isOpen || !server) return null;

  return (
    <div
      className={`fixed z-50 flex items-center justify-center ${
        isMaximized
          ? 'top-0 left-0 right-0 bottom-8 p-0'
          : 'inset-0 p-4 md:p-6 bg-black/70 backdrop-blur-sm'
      }`}
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`flex flex-col overflow-hidden transition-all duration-200 shadow-2xl ${
          isMaximized
            ? 'w-full h-full rounded-none border-none'
            : 'w-full max-w-5xl h-[85vh] rounded-2xl border'
        } ${
          isLightMode
            ? 'bg-slate-900 border-slate-700 text-slate-100 shadow-2xl'
            : 'bg-black border-slate-800 text-slate-100 shadow-2xl'
        }`}
      >
        {/* Header with Universal 3-Button Controls and Shell Switcher */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950/90 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                  <span>{server.name}</span>
                  <span className="font-mono text-xs text-slate-400">({server.ip})</span>
                </h3>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                    isConnected
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : isConnecting
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isConnected ? 'bg-emerald-400' : isConnecting ? 'bg-amber-400' : 'bg-rose-400'
                    }`}
                  />
                  {isConnected ? 'LIVE' : isConnecting ? 'CONNECTING' : 'OFFLINE'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {server.os_distro || 'Linux'} • SSH Port: {server.ssh_port || 22} • User: {server.ssh_username || 'root'}
              </p>
            </div>
          </div>

          {/* Center Shell Switcher: BASH vs ZSHELL (As explicitly requested by user) */}
          <div className="flex items-center bg-slate-900/80 p-1 rounded-xl border border-slate-800 gap-1">
            <button
              type="button"
              onClick={() => setSelectedShell('bash')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                selectedShell === 'bash'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Bash Shell</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedShell('zsh')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                selectedShell === 'zsh'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Zshell (zsh)</span>
            </button>
          </div>

          {/* Triad Control Buttons (Close, Minimize, Fullscreen) */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={connectSession}
              title={isEn ? 'Reconnect SSH' : 'اتصال مجدد SSH'}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isConnecting ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              title={
                isMaximized
                  ? isEn
                    ? 'Exit Fullscreen'
                    : 'خروج از تمام‌صفحه'
                  : isEn
                  ? 'Fullscreen'
                  : 'تمام‌صفحه'
              }
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onMinimize}
              title={isEn ? 'Minimize to Dock' : 'مینیمایز به نوار ابزار'}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Close' : 'بستن'}
              className="p-2 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-950/50 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Command Snippets Ribbon */}
        <div className="flex items-center gap-2 px-4 py-2 bg-slate-950/60 border-b border-slate-900 overflow-x-auto text-xs shrink-0 no-scrollbar">
          <span className="text-[11px] font-mono text-slate-400 font-bold shrink-0 flex items-center gap-1">
            <Command className="w-3.5 h-3.5 text-emerald-400" />
            {isEn ? 'Snippets:' : 'دستورات سریع:'}
          </span>
          {QUICK_SNIPPETS.map((snip) => (
            <button
              key={snip.label}
              type="button"
              onClick={() => sendCommand(snip.cmd)}
              title={snip.cmd}
              className="shrink-0 px-2.5 py-1 rounded-md text-[11px] font-mono bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/40 text-slate-300 hover:text-emerald-300 transition-all flex items-center gap-1 cursor-pointer"
            >
              <span>{snip.label}</span>
            </button>
          ))}
          <div className="ms-auto flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleClearTerminal}
              title={isEn ? 'Clear screen' : 'پاکسازی صفحه'}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Main Terminal Screen */}
        <div
          className={`flex-1 overflow-y-auto p-4 font-mono select-text bg-[#0a0e14] ${
            fontSize === 'xs' ? 'text-xs' : fontSize === 'base' ? 'text-base' : 'text-sm'
          }`}
          onClick={() => inputRef.current?.focus()}
        >
          {/* Welcome Banner */}
          <div className="mb-4 text-emerald-400/90 text-xs border-b border-emerald-900/30 pb-3 select-none">
            <div className="font-bold">
              ★ Remote Server Terminal • {server.name} ({server.ip})
            </div>
            <div className="text-slate-400 text-[11px]">
              Active Shell: /bin/{selectedShell} • Protocol: SSH2 • Encryption: aes256-gcm
            </div>
            <div className="text-slate-500 text-[11px] mt-0.5">
              Tags: {(server.tags || []).join(', ') || 'none'} • Environment: {server.environment}
            </div>
          </div>

          {/* Logs */}
          <div className="space-y-1">
            {lines.map((l) => {
              if (l.type === 'system') {
                return (
                  <div key={l.id} className="text-cyan-400/90 text-xs py-0.5">
                    <span className="text-cyan-600 me-2">[{l.timestamp}]</span>
                    {l.text}
                  </div>
                );
              }
              if (l.type === 'error') {
                return (
                  <div key={l.id} className="text-rose-400 text-xs py-0.5">
                    <span className="text-rose-600 me-2">[{l.timestamp}]</span>
                    {l.text}
                  </div>
                );
              }
              if (l.type === 'input') {
                return (
                  <div key={l.id} className="text-emerald-300 font-bold flex items-center gap-1.5 py-0.5">
                    <span className="text-emerald-500 select-none">
                      {server.ssh_username || 'root'}@{server.hostname || server.name}:{selectedShell}#
                    </span>
                    <span>{l.text}</span>
                  </div>
                );
              }
              return (
                <pre
                  key={l.id}
                  className="text-slate-200 whitespace-pre-wrap font-mono leading-relaxed break-all"
                >
                  {l.text}
                </pre>
              );
            })}
            <div ref={terminalEndRef} />
          </div>
        </div>

        {/* Command Input Bar */}
        <div className="p-3 bg-slate-950 border-t border-slate-900 shrink-0">
          <div className="flex items-center gap-2 bg-[#0d1117] px-3 py-2 rounded-xl border border-slate-800 focus-within:border-emerald-500/60 transition-colors">
            <span className="font-mono text-xs font-bold text-emerald-400 select-none shrink-0">
              {server.ssh_username || 'root'}@{server.hostname || server.name}:{selectedShell}#
            </span>
            <input
              ref={inputRef}
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isEn ? `Type ${selectedShell} command and press Enter...` : `دستور ${selectedShell} را تایپ کرده و اینتر بزنید...`}
              className="flex-1 bg-transparent text-slate-100 text-sm font-mono outline-none placeholder:text-slate-600"
              autoFocus
            />
            <button
              type="button"
              onClick={() => sendCommand(inputVal)}
              className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 transition-all cursor-pointer"
              title={isEn ? 'Execute Command' : 'اجرای دستور'}
            >
              <Play className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center justify-between mt-2 px-1 text-[11px] text-slate-500 font-mono">
            <span>
              {isEn ? 'Use ↑/↓ for command history' : 'استفاده از کلیدهای بالا/پایین برای تاریخچه'}
            </span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                />
                <span>{isEn ? 'Auto-scroll' : 'اسکرول خودکار'}</span>
              </label>
              <span>Port: {server.ssh_port || 22}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
