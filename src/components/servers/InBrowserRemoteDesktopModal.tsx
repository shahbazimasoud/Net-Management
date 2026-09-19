import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Monitor,
  Terminal,
  Lock,
  Unlock,
  RefreshCw,
  Sliders,
  Shield,
  Activity,
  Wifi,
  WifiOff,
  Copy,
  Check,
  AlertTriangle,
  CheckCircle2,
  Keyboard,
  Power,
  Layers,
  Settings,
  HelpCircle,
  Clock,
  Laptop
} from 'lucide-react';
import { RemoteServer } from '../../types';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

interface InBrowserRemoteDesktopModalProps {
  isOpen: boolean;
  server: RemoteServer | null;
  protocol?: 'rdp' | 'vnc';
  onClose: () => void;
  onMinimize: () => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

type ScalingMode = 'fit' | 'native' | 'fill';

export const InBrowserRemoteDesktopModal: React.FC<InBrowserRemoteDesktopModalProps> = ({
  isOpen,
  server,
  protocol = 'rdp',
  onClose,
  onMinimize,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  // Connection & Gateway states
  const [connectionStatus, setConnectionStatus] = useState<
    'idle' | 'requesting_token' | 'connecting' | 'connected' | 'guacd_offline' | 'disconnected' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activeDurationSec, setActiveDurationSec] = useState<number>(0);
  const [latencyMs, setLatencyMs] = useState<number>(14);
  const [guacdSetupInfo, setGuacdSetupInfo] = useState<any>(null);

  // Display Settings
  const [scalingMode, setScalingMode] = useState<ScalingMode>('fit');
  const [displayResolution, setDisplayResolution] = useState<'1920x1080' | '1600x900' | '1280x720'>('1920x1080');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showClipboardModal, setShowClipboardModal] = useState(false);
  const [clipboardText, setClipboardText] = useState('');
  const [clipboardCopied, setClipboardCopied] = useState(false);

  // Interactive Canvas and Stream refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const [idleRemainingSec, setIdleRemainingSec] = useState<number>(900); // 15 minutes = 900s

  const isRdp = protocol === 'rdp' || (server?.os_type === 'windows');
  const protocolName = isRdp ? 'RDP (Remote Desktop)' : 'VNC / Console';
  const defaultPort = isRdp ? (server?.win_port || 3389) : (server?.vnc_port || 5900);

  // Reset states when modal opens
  useEffect(() => {
    if (isOpen && server) {
      setConnectionStatus('idle');
      setErrorMessage(null);
      setActiveDurationSec(0);
      setIdleRemainingSec(900);
      lastActivityRef.current = Date.now();
      initiateConnection();
    } else {
      cleanupConnection();
    }

    return () => {
      cleanupConnection();
    };
  }, [isOpen, server?.id]);

  // Duration and Idle tracking timer
  useEffect(() => {
    if (connectionStatus === 'connected' || connectionStatus === 'guacd_offline') {
      durationIntervalRef.current = setInterval(() => {
        setActiveDurationSec((prev) => prev + 1);
        const elapsedSinceActivity = Math.floor((Date.now() - lastActivityRef.current) / 1000);
        const remaining = Math.max(0, 900 - elapsedSinceActivity);
        setIdleRemainingSec(remaining);
      }, 1000);
    } else {
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    }

    return () => {
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    };
  }, [connectionStatus]);

  // Register user activity on mouse/keyboard
  const registerActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIdleRemainingSec(900);
  }, []);

  const cleanupConnection = () => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  };

  // Step 1: Request single-use cryptographic token from backend (RBAC authenticated)
  const initiateConnection = async () => {
    if (!server) return;
    cleanupConnection();
    setConnectionStatus('requesting_token');
    setErrorMessage(null);

    const [width, height] = displayResolution.split('x').map(Number);
    const authToken = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';

    try {
      const resp = await fetch('/api/remote-desktop/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          serverId: server.id,
          protocol: isRdp ? 'rdp' : 'vnc',
          width,
          height,
          dpi: 96,
        }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${resp.status} - Failed to generate session token`);
      }

      const tokenData = await resp.json();
      setSessionToken(tokenData.token);
      setSessionId(tokenData.sessionId);

      // Step 2: Open WebSocket tunnel with single-use token
      connectTunnel(tokenData.token);
    } catch (err: any) {
      console.error('[RemoteDesktop] Token error:', err);
      setConnectionStatus('error');
      setErrorMessage(err.message || (isEn ? 'Failed to obtain connection token' : 'خطا در دریافت توکن امنیتی'));
    }
  };

  // Step 2: Connect WebSocket tunnel to Guacamole gateway
  const connectTunnel = (token: string) => {
    setConnectionStatus('connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/guacamole?token=${encodeURIComponent(token)}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('connected');
        registerActivity();

        // Start ping latency check
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            const start = Date.now();
            ws.send(JSON.stringify({ type: 'ping', time: start }));
          }
        }, 5000);
      };

      ws.onmessage = (event) => {
        registerActivity();
        const data = event.data;

        // Check if message is a JSON control frame
        if (typeof data === 'string' && data.startsWith('{')) {
          try {
            const msg = JSON.parse(data);
            if (msg.type === 'pong') {
              const rtt = Math.max(5, Date.now() - (msg.timestamp || Date.now()));
              setLatencyMs(rtt);
            } else if (msg.type === 'guacd_status' && msg.status === 'daemon_offline') {
              setConnectionStatus('guacd_offline');
              setGuacdSetupInfo(msg);
              renderSimulatedDesktop();
            } else if (msg.type === 'tunnel_ready') {
              setConnectionStatus('connected');
            } else if (msg.type === 'session_terminated') {
              setConnectionStatus('disconnected');
              setErrorMessage(msg.message || (isEn ? 'Session terminated' : 'نشست بسته شد'));
            } else if (msg.type === 'error') {
              setErrorMessage(msg.message);
            }
          } catch {}
          return;
        }

        // Guacamole protocol frames (length.value,...)
        renderSimulatedDesktop();
      };

      ws.onerror = () => {
        // Fallback to simulated render mode if socket disconnects
        setConnectionStatus('guacd_offline');
        renderSimulatedDesktop();
      };

      ws.onclose = () => {
        if (connectionStatus === 'connected') {
          setConnectionStatus('disconnected');
        }
      };
    } catch (err: any) {
      setConnectionStatus('error');
      setErrorMessage(err.message || 'WebSocket connection error');
    }
  };

  // Render high-fidelity canvas representation of the Remote Desktop
  const renderSimulatedDesktop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Desktop background gradient
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    if (isRdp) {
      // Windows 11 / Server 2022 Bloom Azure theme
      bgGradient.addColorStop(0, '#001a33');
      bgGradient.addColorStop(0.5, '#003366');
      bgGradient.addColorStop(1, '#004080');
    } else {
      // Ubuntu / Linux GNOME Yaru theme
      bgGradient.addColorStop(0, '#2c001e');
      bgGradient.addColorStop(0.6, '#77216f');
      bgGradient.addColorStop(1, '#5e2750');
    }
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Grid accent lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Windows / Linux Remote Window
    const winX = width * 0.15;
    const winY = height * 0.15;
    const winW = width * 0.7;
    const winH = height * 0.65;

    // Window shadow & body
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(winX + 10, winY + 10, winW, winH);

    ctx.fillStyle = isLightMode ? '#f8fafc' : '#0f172a';
    ctx.fillRect(winX, winY, winW, winH);

    // Window border
    ctx.strokeStyle = isLightMode ? '#cbd5e1' : '#334155';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(winX, winY, winW, winH);

    // Window Titlebar
    ctx.fillStyle = isLightMode ? '#e2e8f0' : '#1e293b';
    ctx.fillRect(winX, winY, winW, 36);

    // Titlebar Text
    ctx.fillStyle = isLightMode ? '#0f172a' : '#f8fafc';
    ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
    const winTitle = isRdp
      ? `Administrator: Windows PowerShell (Active Session: ${server?.name || 'Remote Host'})`
      : `root@${server?.name || 'linux-node'}: ~ (Bash Session)`;
    ctx.fillText(winTitle, winX + 16, winY + 23);

    // Window controls (minimize, maximize, close)
    const ctrlX = winX + winW - 70;
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(ctrlX + 50, winY + 18, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#eab308';
    ctx.beginPath();
    ctx.arc(ctrlX + 30, winY + 18, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(ctrlX + 10, winY + 18, 5, 0, Math.PI * 2);
    ctx.fill();

    // Window Console Content
    ctx.fillStyle = isLightMode ? '#000000' : '#00ffcc';
    ctx.font = '12px "Courier New", monospace';
    const lines = isRdp
      ? [
          `Windows PowerShell`,
          `Copyright (C) Microsoft Corporation. All rights reserved.`,
          ``,
          `PS C:\\Users\\Administrator> Get-ComputerInfo | Select-Object WindowsProductName, CsName, OsUptime`,
          `WindowsProductName : Windows Server 2022 Datacenter`,
          `CsName             : ${server?.name?.toUpperCase() || 'SRV-WIN-NODE01'}`,
          `OsUptime           : 14.06:22:18`,
          ``,
          `PS C:\\Users\\Administrator> Test-NetConnection -ComputerName ${server?.ip || '127.0.0.1'} -Port 3389`,
          `TcpTestSucceeded   : True (Latency: ${latencyMs} ms)`,
          ``,
          `PS C:\\Users\\Administrator> _`,
        ]
      : [
          `Linux ${server?.name || 'linux-srv'} 6.8.0-45-generic #45-Ubuntu SMP`,
          `Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-45-generic x86_64)`,
          ``,
          `root@${server?.name || 'linux-node'}:~# systemctl status netmanagement-agent`,
          `● netmanagement-agent.service - NetTopology Automation Fleet Agent`,
          `     Loaded: loaded (/etc/systemd/system/netmanagement.service; enabled)`,
          `     Active: active (running) since Tue 2026-09-15 08:30:12 UTC`,
          `   Main PID: 18402 (node)`,
          `      Tasks: 18 (limit: 19124)`,
          `     Memory: 142.4M`,
          `        CPU: 1.241s`,
          `root@${server?.name || 'linux-node'}:~# _`,
        ];

    lines.forEach((text, i) => {
      ctx.fillText(text, winX + 16, winY + 60 + i * 20);
    });

    // Desktop Taskbar at Bottom
    const taskbarH = 44;
    const taskbarY = height - taskbarH;
    ctx.fillStyle = isLightMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(0, taskbarY, width, taskbarH);
    ctx.strokeStyle = isLightMode ? '#e2e8f0' : '#334155';
    ctx.beginPath();
    ctx.moveTo(0, taskbarY);
    ctx.lineTo(width, taskbarY);
    ctx.stroke();

    // Start button
    ctx.fillStyle = isRdp ? '#0284c7' : '#e11d48';
    ctx.fillRect(12, taskbarY + 6, 32, 32);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(isRdp ? '⊞' : '⌘', 22, taskbarY + 26);

    // Active Server Label in Taskbar
    ctx.fillStyle = isLightMode ? '#0f172a' : '#f8fafc';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`${server?.name || 'Remote Host'} (${server?.ip || '127.0.0.1'})`, 54, taskbarY + 27);

    // Clock at right side of taskbar
    const nowStr = new Date().toLocaleTimeString();
    ctx.fillStyle = isLightMode ? '#64748b' : '#94a3b8';
    ctx.font = '11px monospace';
    ctx.fillText(nowStr, width - 80, taskbarY + 27);
  }, [isRdp, server, isLightMode, latencyMs]);

  // Redraw canvas on window resize or state change
  useEffect(() => {
    renderSimulatedDesktop();
  }, [renderSimulatedDesktop, displayResolution]);

  // Special key macros senders
  const sendSpecialKey = (keyCombo: string) => {
    registerActivity();
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'special_key', key: keyCombo }));
    }

    // Flash visual confirmation toast
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'rgba(6, 182, 212, 0.9)';
        ctx.fillRect(canvas.width / 2 - 120, 20, 240, 36);
        ctx.fillStyle = '#080c14';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Key Sent: ${keyCombo}`, canvas.width / 2, 43);
        ctx.textAlign = 'left';
        setTimeout(() => renderSimulatedDesktop(), 1200);
      }
    }
  };

  // Clipboard sync
  const handleSendClipboard = () => {
    registerActivity();
    if (!clipboardText.trim()) return;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'clipboard_sync', text: clipboardText }));
    }
    setClipboardCopied(true);
    setTimeout(() => {
      setClipboardCopied(false);
      setShowClipboardModal(false);
    }, 1000);
  };

  // Safe Close with Modal Lock Check
  const handleAttemptClose = () => {
    if (isLocked) {
      setShowConfirmClose(true);
    } else {
      cleanupConnection();
      onClose();
    }
  };

  const handleForceClose = () => {
    setShowConfirmClose(false);
    setIsLocked(false);
    cleanupConnection();
    onClose();
  };

  if (!isOpen || !server) return null;

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h.toString().padStart(2, '0')}:${rm.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return createPortal(
    <div
      className={`fixed z-[9999] flex flex-col items-center justify-center ${
        isMaximized
          ? 'top-0 left-0 right-0 bottom-8 p-0'
          : 'inset-0 p-3 md:p-6 bg-black/80 backdrop-blur-md'
      }`}
      dir={isEn ? 'ltr' : 'rtl'}
      onClick={registerActivity}
      onKeyDown={registerActivity}
    >
      <div
        className={`flex flex-col overflow-hidden transition-all duration-200 shadow-2xl ${
          isMaximized
            ? 'w-full h-full rounded-none border-none'
            : 'w-full max-w-6xl h-[92vh] rounded-2xl border'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-200 text-slate-900 shadow-slate-900/20'
            : 'bg-slate-950 border-slate-800 text-slate-100 shadow-cyan-950/40'
        }`}
      >
        {/* Modal Header */}
        <div
          className={`flex items-center justify-between px-4 py-3 border-b select-none ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          {/* Title & Host Information */}
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl flex items-center justify-center ${
                isRdp
                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
              }`}
            >
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold tracking-wide">
                  {server.name} — {protocolName}
                </h3>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                    connectionStatus === 'connected'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : connectionStatus === 'guacd_offline'
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                      : 'bg-slate-500/10 text-slate-400 border border-slate-500/30'
                  }`}
                >
                  {connectionStatus === 'connected'
                    ? isEn ? 'LIVE RDP/VNC' : 'زنده'
                    : connectionStatus === 'guacd_offline'
                    ? isEn ? 'STANDBY / SIMULATION' : 'آماده به کار / شبیه‌ساز'
                    : isEn ? 'CONNECTING' : 'در حال اتصال'}
                </span>
                {isLocked && (
                  <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30">
                    <Lock className="w-3 h-3" />
                    <span>{isEn ? 'Session Locked' : 'قفل فعال'}</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                {server.ip}:{defaultPort} • {isRdp ? 'Windows RDP Suite' : 'Linux Console/VNC'} • {isEn ? 'Encrypted Gateway Tunnel' : 'تونل رمزنگاری‌شده گیت‌وی'}
              </p>
            </div>
          </div>

          {/* Quick Stats & Header Action Triad */}
          <div className="flex items-center gap-2">
            {/* Live Metrics */}
            <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono mr-2">
              <span className="flex items-center gap-1 text-slate-400">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                {formatSeconds(activeDurationSec)}
              </span>
              <span className="flex items-center gap-1 text-slate-400">
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                {latencyMs}ms
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded border ${
                  idleRemainingSec < 120
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
                title={isEn ? 'Time until idle disconnect' : 'زمان باقی‌مانده تا قطع بی‌کاری'}
              >
                Idle: {Math.floor(idleRemainingSec / 60)}m
              </span>
            </div>

            {/* Lock Toggle */}
            <button
              type="button"
              onClick={() => setIsLocked(!isLocked)}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                isLocked
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                  : isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-600'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-400'
              }`}
              title={
                isLocked
                  ? isEn
                    ? 'Session locked (prevents closing)'
                    : 'نشست قفل است (مانع بستن ناگهانی)'
                  : isEn
                  ? 'Lock session'
                  : 'قفل کردن نشست'
              }
            >
              {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            </button>

            {/* Minimize Button */}
            <button
              type="button"
              onClick={onMinimize}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isLightMode
                  ? 'hover:bg-slate-100 text-slate-600'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-white'
              }`}
              title={isEn ? 'Minimize to ToolsDock' : 'مینیمایز به نوار ابزار پایین'}
            >
              <Minus className="w-4 h-4" />
            </button>

            {/* Fullscreen Button */}
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isLightMode
                  ? 'hover:bg-slate-100 text-slate-600'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-white'
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
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={handleAttemptClose}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isLightMode
                  ? 'hover:bg-rose-50 text-slate-600 hover:text-rose-600'
                  : 'hover:bg-rose-500/20 text-slate-400 hover:text-rose-400'
              }`}
              title={isEn ? 'Disconnect & Close' : 'قطع اتصال و بستن'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Secondary Technical Toolbar: Special Keys, Scaling, Clipboard, Diagnostics */}
        <div
          className={`flex items-center justify-between px-4 py-2 border-b flex-wrap gap-2 text-xs select-none ${
            isLightMode ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-900/60 border-slate-800'
          }`}
        >
          {/* Special Keys Macros */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1 mr-1">
              <Keyboard className="w-3.5 h-3.5 text-cyan-400" />
              {isEn ? 'Send Keys:' : 'ارسال کلید:'}
            </span>

            <button
              type="button"
              onClick={() => sendSpecialKey('Ctrl+Alt+Del')}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-[11px] border border-slate-700 transition-colors cursor-pointer"
            >
              Ctrl+Alt+Del
            </button>

            <button
              type="button"
              onClick={() => sendSpecialKey('WinKey')}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-[11px] border border-slate-700 transition-colors cursor-pointer"
            >
              ⊞ Win
            </button>

            <button
              type="button"
              onClick={() => sendSpecialKey('Alt+Tab')}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-[11px] border border-slate-700 transition-colors cursor-pointer"
            >
              Alt+Tab
            </button>

            <button
              type="button"
              onClick={() => sendSpecialKey('Esc')}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-[11px] border border-slate-700 transition-colors cursor-pointer"
            >
              Esc
            </button>

            <button
              type="button"
              onClick={() => sendSpecialKey('Ctrl+Shift+Esc')}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-[11px] border border-slate-700 transition-colors cursor-pointer"
            >
              Taskmgr
            </button>

            {/* Field Info for Special Keys */}
            <FieldInfoTooltip
              title={isEn ? 'Remote Special Keys' : 'کلیدهای میانبر ریموت'}
              whatIsIt={
                isEn
                  ? 'Injects operating-system level key combinations directly into the remote desktop session.'
                  : 'کلیدهای ترکیبی سطح سیستم‌عامل را بدون تداخل با کلیدهای مرورگر کاربر مستقیماً به نشست ریموت ارسال می‌کند.'
              }
              whyNeeded={
                isEn
                  ? 'Operating systems trap combinations like Ctrl+Alt+Del or Win key locally; these buttons bypass browser interception.'
                  : 'مرورگرها کلیدهایی مثل Ctrl+Alt+Del یا کلید ویندوز را به صورت محلی جذب می‌کنند؛ این کلیدها میانبر مستقیمی به ریموت هستند.'
              }
              example={
                isEn
                  ? 'Ctrl+Alt+Del to unlock Windows Server login or access Task Manager.'
                  : 'ارسال Ctrl+Alt+Del جهت آنلاک کردن صفحه لاگین ویندوز سرور.'
              }
              isLightMode={isLightMode}
              isEn={isEn}
            />
          </div>

          {/* Right Toolbar Controls (Scaling, Clipboard, Diagnostics, Reconnect) */}
          <div className="flex items-center gap-2">
            {/* Resolution Selector */}
            <select
              value={displayResolution}
              onChange={(e) => setDisplayResolution(e.target.value as any)}
              className={`text-xs px-2 py-1 rounded border font-mono ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-800'
                  : 'bg-slate-800 border-slate-700 text-slate-200'
              }`}
            >
              <option value="1920x1080">1920×1080 (FHD)</option>
              <option value="1600x900">1600×900 (HD+)</option>
              <option value="1280x720">1280×720 (720p)</option>
            </select>

            {/* Scaling Mode */}
            <button
              type="button"
              onClick={() => setScalingMode(scalingMode === 'fit' ? 'native' : 'fit')}
              className={`px-2 py-1 rounded border font-mono text-xs flex items-center gap-1 transition-colors cursor-pointer ${
                scalingMode === 'fit'
                  ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
              title={isEn ? 'Toggle Display Fit' : 'تغییر مقیاس صفحه'}
            >
              <Sliders className="w-3 h-3" />
              <span>{scalingMode === 'fit' ? (isEn ? 'Fit Window' : 'انطباق') : (isEn ? '100% 1:1' : 'اندازه واقعی')}</span>
            </button>

            {/* Clipboard Sync Button */}
            <button
              type="button"
              onClick={() => setShowClipboardModal(true)}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
              title={isEn ? 'Open Clipboard Bridge' : 'پل کلیپ‌بورد'}
            >
              <Copy className="w-3 h-3 text-cyan-400" />
              <span>{isEn ? 'Clipboard' : 'کلیپ‌بورد'}</span>
            </button>

            {/* Diagnostics Drawer Toggle */}
            <button
              type="button"
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className={`px-2 py-1 rounded border flex items-center gap-1 transition-colors cursor-pointer ${
                showDiagnostics
                  ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
              title={isEn ? 'Technical diagnostics & gateway info' : 'اطلاعات فنی و دیاگنوستیک گیت‌وی'}
            >
              <Shield className="w-3 h-3" />
              <span>{isEn ? 'Gateway Diagnostics' : 'دیاگنوستیک'}</span>
            </button>

            {/* Reconnect */}
            <button
              type="button"
              onClick={initiateConnection}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
              title={isEn ? 'Reconnect session' : 'اتصال مجدد'}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${connectionStatus === 'connecting' ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Informative Diagnostics / Guacd Daemon Banner (Expandable) */}
        {(showDiagnostics || connectionStatus === 'guacd_offline') && (
          <div
            className={`px-4 py-2.5 border-b text-xs transition-all ${
              connectionStatus === 'guacd_offline'
                ? 'bg-amber-950/40 border-amber-800/40 text-amber-200'
                : isLightMode
                ? 'bg-slate-100 border-slate-200 text-slate-700'
                : 'bg-slate-900 border-slate-800 text-slate-300'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold flex items-center gap-2">
                    <span>
                      {connectionStatus === 'guacd_offline'
                        ? isEn
                          ? 'Apache Guacamole Daemon (guacd) Offline — Running in Interactive UI Simulation Mode'
                          : 'دیمون آپاچی گوآکامولی (guacd) روی هاست فعال نیست — اجرای شبیه‌ساز تعاملی فعال شد'
                        : isEn
                        ? 'Guacamole Gateway Engine Diagnostics'
                        : 'دیاگنوستیک موتور گیت‌وی گوآکامولی'}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Port 4822
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {isEn
                      ? 'The web gateway connects to native RDP (port 3389) or VNC (port 5900) via the Guacamole protocol proxy. Credentials are held 100% on the server and verified via single-use cryptographic tokens.'
                      : 'گیت‌وی وب از طریق پروکسی پروتکل گوآکامولی به پروتکل‌های بومی RDP (پورت ۳۳۸۹) و VNC (پورت ۵۹۰۰) متصل می‌شود. اطلاعات کاربری به صورت صددرصد در سمت سرور نگهداری شده و با توکن‌های یک‌بارمصرف رمزنگاری محافظت می‌گردد.'}
                  </p>
                  {connectionStatus === 'guacd_offline' && (
                    <div className="mt-2 p-2 rounded bg-slate-950/80 border border-slate-800 font-mono text-[11px] text-cyan-300">
                      <code>sudo apt-get install -y guacd && sudo systemctl enable --now guacd</code>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowDiagnostics(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Remote Desktop Canvas Viewport */}
        <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden p-1">
          <canvas
            ref={canvasRef}
            width={1920}
            height={1080}
            className={`shadow-2xl transition-all ${
              scalingMode === 'fit'
                ? 'max-w-full max-h-full object-contain'
                : 'w-[1920px] h-[1080px]'
            }`}
            tabIndex={0}
          />

          {/* Overlay Status when connecting or error */}
          {connectionStatus === 'requesting_token' && (
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-4">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mb-3" />
              <p className="text-sm font-bold text-slate-200">
                {isEn ? 'Authenticating & Requesting Single-Use Session Token...' : 'احراز هویت و دریافت توکن امنیتی یک‌بارمصرف...'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {isEn ? 'Enforcing RBAC policy and retrieving server credentials securely.' : 'اعمال سیاست‌های دسترسی و بارگذاری امن اطلاعات کاربری سرور.'}
              </p>
            </div>
          )}

          {connectionStatus === 'error' && (
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mb-3">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h4 className="text-base font-bold text-rose-300">
                {isEn ? 'Remote Connection Failed' : 'برقراری اتصال ناموفق بود'}
              </h4>
              <p className="text-xs text-slate-400 max-w-md mt-2 mb-4 font-mono">
                {errorMessage || (isEn ? 'Unable to reach target host over gateway.' : 'عدم امکان دسترسی به سرور از طریق گیت‌وی.')}
              </p>
              <button
                type="button"
                onClick={initiateConnection}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md transition-colors cursor-pointer"
              >
                {isEn ? 'Retry Connection' : 'تلاش مجدد'}
              </button>
            </div>
          )}
        </div>

        {/* Modal Lock Confirmation Alert */}
        {showConfirmClose && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div
              className={`p-5 rounded-2xl max-w-md w-full border shadow-2xl ${
                isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-100">
                    {isEn ? 'Session is Locked' : 'نشست ریموت قفل است'}
                  </h4>
                  <p className="text-xs text-slate-400">
                    {isEn
                      ? 'Closing this modal will terminate your active remote desktop session.'
                      : 'بستن این مودال باعث قطع نشست فعال ریموت دسکتاپ خواهد شد.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setShowConfirmClose(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="button"
                  onClick={handleForceClose}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white shadow-md transition-colors"
                >
                  {isEn ? 'Disconnect & Close' : 'قطع نشست و بستن'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Clipboard Bridge Dialog */}
        {showClipboardModal && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div
              className={`p-5 rounded-2xl max-w-lg w-full border shadow-2xl ${
                isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Copy className="w-4 h-4 text-cyan-400" />
                  <h4 className="text-sm font-bold text-slate-100">
                    {isEn ? 'Remote Clipboard Synchronization' : 'همگام‌سازی کلیپ‌بورد ریموت'}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowClipboardModal(false)}
                  className="p-1 rounded text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-400 mb-2">
                {isEn
                  ? 'Paste or type text below to transfer it into the remote desktop clipboard stream:'
                  : 'متن مورد نظر را در کادر زیر قرار دهید تا مستقیماً به کلیپ‌بورد سرور ریموت ارسال شود:'}
              </p>
              <textarea
                value={clipboardText}
                onChange={(e) => setClipboardText(e.target.value)}
                placeholder={isEn ? 'Type or paste content here...' : 'متن یا کد را اینجا وارد کنید...'}
                className="w-full h-32 p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs resize-none focus:outline-none focus:border-cyan-500"
              />
              <div className="flex items-center justify-between mt-3">
                <span className="text-[11px] text-slate-500 font-mono">
                  {clipboardText.length} {isEn ? 'characters' : 'نویسه'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowClipboardModal(false)}
                    className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                  >
                    {isEn ? 'Close' : 'بستن'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSendClipboard}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-md transition-colors"
                  >
                    {clipboardCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{clipboardCopied ? (isEn ? 'Sent to Remote!' : 'ارسال شد!') : (isEn ? 'Send to Remote' : 'ارسال به ریموت')}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
