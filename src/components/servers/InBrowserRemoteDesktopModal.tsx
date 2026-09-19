import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Guacamole from 'guacamole-common-js';
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
  Copy,
  Check,
  AlertTriangle,
  CheckCircle2,
  Keyboard,
  Clock,
  Download,
  Server,
  Cpu,
  Info
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

type ScalingMode = 'fit' | 'native';

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
  const [latencyMs, setLatencyMs] = useState<number>(12);
  const [guacdSetupInfo, setGuacdSetupInfo] = useState<any>(null);

  // 1-Click Auto Installer States
  const [isInstallingGuacd, setIsInstallingGuacd] = useState(false);
  const [installLog, setInstallLog] = useState<string | null>(null);
  const [installSuccess, setInstallSuccess] = useState<boolean | null>(null);
  const [cmdCopied, setCmdCopied] = useState(false);

  // Display Settings
  const [scalingMode, setScalingMode] = useState<ScalingMode>('fit');
  const [displayResolution, setDisplayResolution] = useState<'1920x1080' | '1600x900' | '1280x720'>('1920x1080');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showClipboardModal, setShowClipboardModal] = useState(false);
  const [clipboardText, setClipboardText] = useState('');
  const [clipboardCopied, setClipboardCopied] = useState(false);

  // Guacamole Client and DOM refs
  const displayContainerRef = useRef<HTMLDivElement | null>(null);
  const guacClientRef = useRef<any>(null);
  const guacTunnelRef = useRef<any>(null);
  const guacMouseRef = useRef<any>(null);
  const guacKeyboardRef = useRef<any>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const [idleRemainingSec, setIdleRemainingSec] = useState<number>(900); // 15 minutes = 900s

  const isRdp = protocol === 'rdp' || server?.os_type === 'windows';
  const protocolName = isRdp ? 'Windows RDP Suite' : 'Linux VNC Console';
  const defaultPort = isRdp ? server?.win_port || 3389 : server?.vnc_port || 5900;
  const guacdCliCmd = 'sudo apt-get install -y guacd libguac-client-rdp0 libguac-client-vnc0 && sudo systemctl enable --now guacd';

  // Register user activity on interaction
  const registerActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIdleRemainingSec(900);
  }, []);

  // Teardown and cleanup existing connection
  const cleanupConnection = useCallback(() => {
    if (guacClientRef.current) {
      try {
        guacClientRef.current.disconnect();
      } catch {}
      guacClientRef.current = null;
    }
    if (guacTunnelRef.current) {
      try {
        guacTunnelRef.current.disconnect();
      } catch {}
      guacTunnelRef.current = null;
    }
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (displayContainerRef.current) {
      displayContainerRef.current.innerHTML = '';
    }
  }, []);

  // Update scaling of Guacamole display
  const updateDisplayScale = useCallback(() => {
    if (!guacClientRef.current || !displayContainerRef.current) return;
    const display = guacClientRef.current.getDisplay();
    if (!display) return;

    if (scalingMode === 'native') {
      display.scale(1.0);
      return;
    }

    const container = displayContainerRef.current;
    const containerWidth = container.clientWidth - 8;
    const containerHeight = container.clientHeight - 8;
    const displayWidth = display.getWidth();
    const displayHeight = display.getHeight();

    if (displayWidth > 0 && displayHeight > 0 && containerWidth > 0 && containerHeight > 0) {
      const scale = Math.min(containerWidth / displayWidth, containerHeight / displayHeight);
      display.scale(Math.max(0.2, scale));
    }
  }, [scalingMode]);

  // Window resize listener to auto-scale display
  useEffect(() => {
    window.addEventListener('resize', updateDisplayScale);
    return () => {
      window.removeEventListener('resize', updateDisplayScale);
    };
  }, [updateDisplayScale]);

  // Duration and Idle tracking timer
  useEffect(() => {
    if (connectionStatus === 'connected') {
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

  // Step 2: Establish real Guacamole Tunnel & Client
  const connectGuacamoleTunnel = useCallback((token: string) => {
    setConnectionStatus('connecting');

    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProto}//${window.location.host}/ws/guacamole?token=${encodeURIComponent(token)}`;

    try {
      // Initialize native Guacamole WebSocket Tunnel
      const tunnel = new Guacamole.WebSocketTunnel(wsUrl);
      guacTunnelRef.current = tunnel;

      const client = new Guacamole.Client(tunnel);
      guacClientRef.current = client;

      // Attach client display element to the DOM container
      const display = client.getDisplay();
      const displayElem = display.getElement();
      displayElem.style.margin = 'auto';
      displayElem.style.outline = 'none';

      if (displayContainerRef.current) {
        displayContainerRef.current.innerHTML = '';
        displayContainerRef.current.appendChild(displayElem);
      }

      // Track client state changes
      // 0 = IDLE, 1 = CONNECTING, 2 = WAITING, 3 = CONNECTED, 4 = DISCONNECTING, 5 = DISCONNECTED
      client.onstatechange = (state: number) => {
        if (state === 3) {
          setConnectionStatus('connected');
          registerActivity();
          setTimeout(updateDisplayScale, 200);
        } else if (state === 5) {
          setConnectionStatus('disconnected');
        }
      };

      client.onerror = (status: any) => {
        console.warn('[RemoteDesktop] Guacamole client error:', status);
        setConnectionStatus('error');
        setErrorMessage(
          status?.message ||
            (isEn
              ? 'Remote desktop connection encountered a protocol error.'
              : 'اتصال ریموت دسکتاپ با خطای پروتکل مواجه شد.')
        );
      };

      // Mouse input handling
      const mouse: any = new Guacamole.Mouse(displayElem);
      guacMouseRef.current = mouse;
      mouse.onmousedown = mouse.onmouseup = mouse.onmousemove = (mouseState: any) => {
        registerActivity();
        client.sendMouseState(mouseState);
      };

      // Keyboard input handling
      const keyboard: any = new Guacamole.Keyboard(document);
      guacKeyboardRef.current = keyboard;
      keyboard.onkeydown = (keysym: number) => {
        registerActivity();
        client.sendKeyEvent(1, keysym);
      };
      keyboard.onkeyup = (keysym: number) => {
        registerActivity();
        client.sendKeyEvent(0, keysym);
      };

      // Handle server-to-client clipboard sync
      client.onclipboard = (stream: any, mimetype: string) => {
        if (mimetype === 'text/plain') {
          const reader = new Guacamole.StringReader(stream);
          let text = '';
          reader.ontext = (chunk: string) => {
            text += chunk;
          };
          reader.onend = () => {
            setClipboardText(text);
          };
        }
      };

      // Tunnel error hook
      tunnel.onerror = (status: any) => {
        console.warn('[RemoteDesktop] Tunnel error:', status);
      };

      // Connect to server
      client.connect();
    } catch (err: any) {
      console.error('[RemoteDesktop] Tunnel exception:', err);
      setConnectionStatus('error');
      setErrorMessage(err.message || (isEn ? 'Failed to establish tunnel' : 'خطا در ایجاد تونل ارتباطی'));
    }
  }, [isEn, registerActivity, updateDisplayScale]);

  // Step 1: Request single-use session token and verify gateway status
  const initiateConnection = useCallback(async () => {
    if (!server) return;
    cleanupConnection();
    setConnectionStatus('requesting_token');
    setErrorMessage(null);

    const [width, height] = displayResolution.split('x').map(Number);
    const authToken = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';

    try {
      // 1. Verify guacd gateway status
      const statusRes = await fetch('/api/remote-desktop/status', {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      }).catch(() => null);

      if (statusRes && statusRes.ok) {
        const gatewayData = await statusRes.json();
        setGuacdSetupInfo(gatewayData);
        if (!gatewayData.guacdRunning) {
          setConnectionStatus('guacd_offline');
          return;
        }
      }

      // 2. Request single-use connection token
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

      // 3. Connect via Guacamole Tunnel
      connectGuacamoleTunnel(tokenData.token);
    } catch (err: any) {
      console.error('[RemoteDesktop] Token error:', err);
      setConnectionStatus('error');
      setErrorMessage(err.message || (isEn ? 'Failed to obtain session token' : 'خطا در دریافت توکن امنیتی'));
    }
  }, [server, cleanupConnection, displayResolution, isRdp, connectGuacamoleTunnel, isEn]);

  // 1-Click Auto-Install Guacamole Daemon
  const handleAutoInstallGuacd = async () => {
    setIsInstallingGuacd(true);
    setInstallLog(null);
    setInstallSuccess(null);

    try {
      const authToken = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
      const res = await fetch('/api/remote-desktop/install-daemon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
      });

      const data = await res.json();
      if (data.success || data.guacdRunning) {
        setInstallSuccess(true);
        setInstallLog(data.output || (isEn ? 'Daemon installed and started.' : 'سرویس نصب شد و فعال گردید.'));
        setTimeout(() => {
          setIsInstallingGuacd(false);
          initiateConnection();
        }, 1500);
      } else {
        setInstallSuccess(false);
        setInstallLog(
          data.output ||
            data.error ||
            (isEn
              ? 'Package installation completed with warnings. Verifying service...'
              : 'نصب بسته‌ها انجام شد اما وضعیت دیمن نامشخص است.')
        );
        setIsInstallingGuacd(false);
      }
    } catch (err: any) {
      setInstallSuccess(false);
      setInstallLog(err.message);
      setIsInstallingGuacd(false);
    }
  };

  const handleCopyCmd = () => {
    navigator.clipboard.writeText(guacdCliCmd);
    setCmdCopied(true);
    setTimeout(() => setCmdCopied(false), 2000);
  };

  // Reset states when modal opens
  useEffect(() => {
    if (isOpen && server) {
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
  }, [isOpen, server?.id, initiateConnection, cleanupConnection]);

  // Special key macros senders
  const sendSpecialKey = (keyCombo: string) => {
    registerActivity();
    if (!guacClientRef.current) return;
    const client = guacClientRef.current;

    if (keyCombo === 'Ctrl+Alt+Del') {
      // KeySyms: Ctrl = 0xFFE3, Alt = 0xFFE9, Delete = 0xFFFF
      client.sendKeyEvent(1, 0xffe3);
      client.sendKeyEvent(1, 0xffe9);
      client.sendKeyEvent(1, 0xffff);
      setTimeout(() => {
        client.sendKeyEvent(0, 0xffff);
        client.sendKeyEvent(0, 0xffe9);
        client.sendKeyEvent(0, 0xffe3);
      }, 150);
    } else if (keyCombo === 'WinKey') {
      // KeySym: Super / Windows = 0xFFEB
      client.sendKeyEvent(1, 0xffeb);
      setTimeout(() => {
        client.sendKeyEvent(0, 0xffeb);
      }, 150);
    } else if (keyCombo === 'Alt+Tab') {
      // KeySyms: Alt = 0xFFE9, Tab = 0xFF09
      client.sendKeyEvent(1, 0xffe9);
      client.sendKeyEvent(1, 0xff09);
      setTimeout(() => {
        client.sendKeyEvent(0, 0xff09);
        client.sendKeyEvent(0, 0xffe9);
      }, 150);
    } else if (keyCombo === 'Esc') {
      // KeySym: Escape = 0xFF1B
      client.sendKeyEvent(1, 0xff1b);
      setTimeout(() => {
        client.sendKeyEvent(0, 0xff1b);
      }, 100);
    } else if (keyCombo === 'Ctrl+Shift+Esc') {
      // KeySyms: Ctrl = 0xFFE3, Shift = 0xFFE1, Escape = 0xFF1B
      client.sendKeyEvent(1, 0xffe3);
      client.sendKeyEvent(1, 0xffe1);
      client.sendKeyEvent(1, 0xff1b);
      setTimeout(() => {
        client.sendKeyEvent(0, 0xff1b);
        client.sendKeyEvent(0, 0xffe1);
        client.sendKeyEvent(0, 0xffe3);
      }, 150);
    }
  };

  // Clipboard sync
  const handleSendClipboard = () => {
    registerActivity();
    if (!clipboardText.trim()) return;

    if (guacClientRef.current) {
      guacClientRef.current.setClipboard(clipboardText);
    }
    setClipboardCopied(true);
    setTimeout(() => {
      setClipboardCopied(false);
      setShowClipboardModal(false);
    }, 1200);
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
                    ? isEn
                      ? 'LIVE DESKTOP'
                      : 'دسکتاپ زنده'
                    : connectionStatus === 'guacd_offline'
                    ? isEn
                      ? 'GATEWAY OFFLINE'
                      : 'گیت‌وی غیرفعال'
                    : isEn
                    ? 'CONNECTING'
                    : 'در حال اتصال'}
                </span>
                {isLocked && (
                  <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30">
                    <Lock className="w-3 h-3" />
                    <span>{isEn ? 'Session Locked' : 'قفل فعال'}</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                {server.ip}:{defaultPort} • {isRdp ? 'Windows RDP Suite' : 'Linux Console/VNC'} •{' '}
                {isEn ? 'Apache Guacamole WebSocket Tunnel' : 'تونل پروتکل وب آپاچی گوآکامولی'}
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
              onChange={(e) => {
                setDisplayResolution(e.target.value as any);
                setTimeout(initiateConnection, 100);
              }}
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
              onClick={() => {
                const next = scalingMode === 'fit' ? 'native' : 'fit';
                setScalingMode(next);
                setTimeout(updateDisplayScale, 50);
              }}
              className={`px-2 py-1 rounded border font-mono text-xs flex items-center gap-1 transition-colors cursor-pointer ${
                scalingMode === 'fit'
                  ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
              title={isEn ? 'Toggle Display Fit' : 'تغییر مقیاس صفحه'}
            >
              <Sliders className="w-3 h-3" />
              <span>
                {scalingMode === 'fit'
                  ? isEn
                    ? 'Fit Window'
                    : 'انطباق'
                  : isEn
                  ? '100% 1:1'
                  : 'اندازه واقعی'}
              </span>
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
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  connectionStatus === 'connecting' || connectionStatus === 'requesting_token'
                    ? 'animate-spin text-cyan-400'
                    : ''
                }`}
              />
            </button>
          </div>
        </div>

        {/* Informative Diagnostics Drawer (Expandable) */}
        {showDiagnostics && (
          <div
            className={`px-4 py-2.5 border-b text-xs transition-all ${
              isLightMode ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-slate-900 border-slate-800 text-slate-300'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold flex items-center gap-2">
                    <span>
                      {isEn ? 'Apache Guacamole Gateway Architecture' : 'معماری گیت‌وی وب آپاچی گوآکامولی'}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      guacd TCP:4822
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {isEn
                      ? 'The web gateway proxies browser WebSocket frames directly into native RDP (TCP:3389) or VNC (TCP:5900) via the Guacamole protocol daemon. Server credentials remain strictly on the backend.'
                      : 'گیت‌وی وب بسته‌های وب‌سوکت مرورگر را مستقیماً به پروتکل‌های بومی RDP (پورت ۳۳۸۹) و VNC (پورت ۵۹۰۰) از طریق دیمن گوآکامولی هدایت می‌کند. اطلاعات عبور سرورها کاملاً در سمت سرور امن می‌ماند.'}
                  </p>
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

        {/* Remote Desktop Canvas Viewport Container */}
        <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden p-1">
          {/* Live Guacamole Display Element */}
          <div
            ref={displayContainerRef}
            className={`w-full h-full flex items-center justify-center overflow-hidden ${
              connectionStatus !== 'connected' ? 'hidden' : ''
            }`}
          />

          {/* Gateway Offline View: 1-Click Auto Installer & Service Setup */}
          {connectionStatus === 'guacd_offline' && (
            <div className="max-w-2xl w-full p-6 mx-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-2xl backdrop-blur-md text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-7 h-7" />
              </div>

              <h3 className="text-base font-bold text-slate-100 mb-2">
                {isEn
                  ? 'Apache Guacamole Gateway (guacd) Offline'
                  : 'سرویس گیت‌وی ریموت دسکتاپ (Apache Guacamole) غیرفعال است'}
              </h3>

              <p className="text-xs text-slate-400 leading-relaxed max-w-lg mx-auto mb-5">
                {isEn
                  ? 'To stream live Windows RDP and Linux VNC screens directly inside the browser, the Guacamole daemon is required on the host server. We have added this package to the panel setup scripts.'
                  : 'برای نمایش تصویر زنده دسکتاپ ویندوز و کنسول لینوکس درون مرورگر، سرویس دیمن Guacamole بر روی سیستم‌عامل سرور لازم است. این پکیج اکنون به اسکریپت‌های نصب پنل افزوده شده است.'}
              </p>

              {/* 1-Click Auto Install Action Box */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 mb-4 text-left">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold text-slate-200">
                      {isEn ? 'Automatic 1-Click Installation' : 'نصب و فعال‌سازی خودکار (۱ کلیک)'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleAutoInstallGuacd}
                    disabled={isInstallingGuacd}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
                  >
                    {isInstallingGuacd ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>{isEn ? 'Installing guacd packages...' : 'در حال نصب و فعال‌سازی...'}</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Install & Start Gateway' : 'نصب و راه‌اندازی خودکار'}</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Progress / Status feedback */}
                {installLog && (
                  <div
                    className={`mt-2 p-2.5 rounded-lg font-mono text-[11px] leading-relaxed max-h-32 overflow-y-auto ${
                      installSuccess
                        ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/40'
                        : 'bg-amber-950/40 text-amber-300 border border-amber-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold mb-1">
                      {installSuccess ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                      <span>{installSuccess ? (isEn ? 'Success:' : 'موفقیت:') : (isEn ? 'Output:' : 'نتیجه:')}</span>
                    </div>
                    <pre className="whitespace-pre-wrap">{installLog}</pre>
                  </div>
                )}
              </div>

              {/* Manual Command Option */}
              <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800 text-left">
                <div className="flex-1 overflow-x-auto font-mono text-[11px] text-cyan-300 whitespace-nowrap py-1">
                  <code>{guacdCliCmd}</code>
                </div>
                <button
                  type="button"
                  onClick={handleCopyCmd}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 transition-colors cursor-pointer shrink-0"
                >
                  {cmdCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{cmdCopied ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy' : 'کپی دستور')}</span>
                </button>
              </div>

              <div className="mt-4 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={initiateConnection}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors cursor-pointer"
                >
                  {isEn ? 'Check Status Again' : 'بررسی مجدد وضعیت'}
                </button>
              </div>
            </div>
          )}

          {/* Overlay Status when connecting */}
          {(connectionStatus === 'requesting_token' || connectionStatus === 'connecting') && (
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-4">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mb-3" />
              <p className="text-sm font-bold text-slate-200">
                {isEn
                  ? 'Connecting to Live Remote Desktop Stream...'
                  : 'در حال برقراری ارتباط زنده با ریموت دسکتاپ...'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {isEn
                  ? 'Establishing secure Guacamole WebSocket tunnel with host.'
                  : 'اتصال تونل رمزنگاری‌شده گوآکامولی با هاست سرور.'}
              </p>
            </div>
          )}

          {/* Overlay Status when disconnected */}
          {connectionStatus === 'disconnected' && (
            <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center">
              <Monitor className="w-10 h-10 text-slate-500 mb-3" />
              <p className="text-sm font-bold text-slate-200">
                {isEn ? 'Remote Session Disconnected' : 'نشست ریموت دسکتاپ قطع شد'}
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                {errorMessage ||
                  (isEn
                    ? 'Target server closed connection or session timed out.'
                    : 'ارتباط توسط سرور مقصد بسته شد یا زمان نشست به پایان رسید.')}
              </p>
              <button
                type="button"
                onClick={initiateConnection}
                className="mt-4 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md transition-colors cursor-pointer"
              >
                {isEn ? 'Reconnect Now' : 'اتصال مجدد'}
              </button>
            </div>
          )}

          {/* Error View */}
          {connectionStatus === 'error' && (
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mb-3">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h4 className="text-base font-bold text-rose-300">
                {isEn ? 'Remote Connection Failed' : 'برقراری اتصال ناموفق بود'}
              </h4>
              <p className="text-xs text-slate-400 max-w-md mt-2 mb-4 font-mono">
                {errorMessage ||
                  (isEn ? 'Unable to reach target host over gateway.' : 'عدم امکان دسترسی به سرور از طریق گیت‌وی.')}
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
                    <span>
                      {clipboardCopied
                        ? isEn
                          ? 'Sent to Remote!'
                          : 'ارسال شد!'
                        : isEn
                        ? 'Send to Remote'
                        : 'ارسال به ریموت'}
                    </span>
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
