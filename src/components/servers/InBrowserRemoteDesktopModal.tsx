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
  Info,
  Eye,
  EyeOff,
  Key
} from 'lucide-react';
import { RemoteServer } from '../../types';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

interface InBrowserRemoteDesktopModalProps {
  isOpen: boolean;
  server: RemoteServer | null;
  protocol?: 'rdp' | 'vnc';
  sessionPassword?: string;
  onClose: () => void;
  onMinimize: () => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

type ScalingMode = 'fit' | 'fill' | 'native';

interface StructuredGuacErrorPayload {
  category?: string;
  message_en?: string;
  message_fa?: string;
  code?: string;
}

function parseGuacErrorMessage(rawMsg: any, isEn: boolean): string | null {
  if (!rawMsg) return null;
  if (typeof rawMsg === 'object' && (rawMsg.message_en || rawMsg.message_fa)) {
    return isEn ? (rawMsg.message_en || rawMsg.message_fa) : (rawMsg.message_fa || rawMsg.message_en);
  }
  if (typeof rawMsg === 'string') {
    const trimmed = rawMsg.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed: StructuredGuacErrorPayload = JSON.parse(trimmed);
        if (parsed && (parsed.message_en || parsed.message_fa)) {
          return isEn ? (parsed.message_en || parsed.message_fa) : (parsed.message_fa || parsed.message_en);
        }
      } catch {
        // Fall back to raw string
      }
    }
    if (trimmed.toLowerCase().includes('incomplete instruction')) {
      return isEn
        ? 'Remote desktop authentication or protocol handshake was rejected by the Windows server. Ensure username, password, and domain are valid, and that Network Level Authentication (NLA) is satisfied.'
        : 'احراز هویت یا هندشیک پروتکل ریموت دسکتاپ توسط سرور ویندوز رد شد. صحت نام کاربری، رمز عبور، دامین و مجوزهای NLA را بررسی فرمایید.';
    }
    return trimmed;
  }
  return null;
}

export const InBrowserRemoteDesktopModal: React.FC<InBrowserRemoteDesktopModalProps> = ({
  isOpen,
  server,
  protocol = 'rdp',
  sessionPassword,
  onClose,
  onMinimize,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMonitorFullscreen, setIsMonitorFullscreen] = useState(false);
  const [floatingToolbarExpanded, setFloatingToolbarExpanded] = useState(false);
  const [isFloatingHovered, setIsFloatingHovered] = useState(false);
  const [isFloatingActive, setIsFloatingActive] = useState(false);
  const [floatingPos, setFloatingPos] = useState<{ x: number; y: number }>({
    x: typeof window !== 'undefined' ? Math.round(window.innerWidth / 2) : 600,
    y: 32,
  });
  const [isLocked, setIsLocked] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  // Authentication & Password States
  const [customPassword, setCustomPassword] = useState<string>('');
  const [showCustomPassword, setShowCustomPassword] = useState<boolean>(false);

  // Connection & Gateway states
  type RdpConnectionStage =
    | 'idle'
    | 'validating_target'
    | 'requesting_token'
    | 'connecting_tunnel'
    | 'negotiating_rdp'
    | 'connecting'
    | 'connected'
    | 'guacd_offline'
    | 'disconnected'
    | 'error';

  const [connectionStatus, setConnectionStatus] = useState<RdpConnectionStage>('idle');
  const [connectionStageText, setConnectionStageText] = useState<string>('');
  const [targetValidationInfo, setTargetValidationInfo] = useState<{
    targetHost?: string;
    targetPort?: number;
    reachable?: boolean;
    latencyMs?: number;
    error?: string | null;
    guacdRunning?: boolean;
    normalizedUser?: string;
    normalizedDomain?: string;
    hasPasswordConfigured?: boolean;
  } | null>(null);
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
  const modalRootRef = useRef<HTMLDivElement | null>(null);
  const displayContainerRef = useRef<HTMLDivElement | null>(null);
  const guacClientRef = useRef<any>(null);
  const guacTunnelRef = useRef<any>(null);
  const guacMouseRef = useRef<any>(null);
  const guacKeyboardRef = useRef<any>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const connectTimeoutRef = useRef<any>(null);
  const prevScalingModeRef = useRef<ScalingMode>('fit');
  const floatingFadeTimerRef = useRef<any>(null);
  const isDraggingFloatingRef = useRef<boolean>(false);
  const updateDisplayScaleRef = useRef<() => void>(() => {});
  const activeSessionKeyRef = useRef<string | null>(null);
  const isOpenRef = useRef<boolean>(isOpen);
  const [idleRemainingSec, setIdleRemainingSec] = useState<number>(900); // 15 minutes = 900s

  const isRdp = protocol === 'rdp' || server?.os_type === 'windows';
  const protocolName = isRdp ? 'Windows RDP Suite' : 'Linux VNC Console';
  const defaultPort = isRdp ? server?.win_port || 3389 : server?.vnc_port || 5900;
  const guacdCliCmd = 'sudo bash scripts/install-guacd.sh';

  // Keep latest prop/state values in refs so connection callbacks never recreate or reset active sessions on re-render
  const serverRef = useRef<RemoteServer | null>(server);
  const isEnRef = useRef<boolean>(isEn);
  const isRdpRef = useRef<boolean>(isRdp);
  const defaultPortRef = useRef<number>(defaultPort);
  const displayResolutionRef = useRef(displayResolution);
  const customPasswordRef = useRef(customPassword);
  const sessionPasswordRef = useRef(sessionPassword);

  isOpenRef.current = isOpen;
  serverRef.current = server;
  isEnRef.current = isEn;
  isRdpRef.current = isRdp;
  defaultPortRef.current = defaultPort;
  displayResolutionRef.current = displayResolution;
  customPasswordRef.current = customPassword;
  sessionPasswordRef.current = sessionPassword;

  // Trigger temporary visibility for the fading floating circle
  const triggerFloatingActivity = useCallback(() => {
    setIsFloatingActive(true);
    if (floatingFadeTimerRef.current) {
      clearTimeout(floatingFadeTimerRef.current);
    }
    floatingFadeTimerRef.current = setTimeout(() => {
      setIsFloatingActive(false);
    }, 2600);
  }, []);

  // Enter full-monitor mode (100% screen + native browser fullscreen + floating circle toolbar)
  const enterMonitorFullscreen = useCallback(() => {
    prevScalingModeRef.current = scalingMode;
    setScalingMode('fill');
    setIsMonitorFullscreen(true);
    setFloatingToolbarExpanded(false);
    setFloatingPos((prev) => {
      const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const h = typeof window !== 'undefined' ? window.innerHeight : 720;
      const clampedX = prev.x > 40 && prev.x < w - 40 ? prev.x : Math.round(w / 2);
      const clampedY = prev.y >= 24 && prev.y < h - 40 ? prev.y : 32;
      return { x: clampedX, y: clampedY };
    });
    triggerFloatingActivity();

    const el = modalRootRef.current as any;
    if (el) {
      try {
        if (el.requestFullscreen) {
          el.requestFullscreen().catch(() => {});
        } else if (el.webkitRequestFullscreen) {
          el.webkitRequestFullscreen();
        }
      } catch {}
    }
  }, [scalingMode, triggerFloatingActivity]);

  // Exit full-monitor mode and restore modal view
  const exitMonitorFullscreen = useCallback(() => {
    setIsMonitorFullscreen(false);
    setFloatingToolbarExpanded(false);
    setScalingMode(prevScalingModeRef.current === 'fill' ? 'fit' : prevScalingModeRef.current);

    const doc = document as any;
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      try {
        if (doc.exitFullscreen) {
          doc.exitFullscreen().catch(() => {});
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen();
        }
      } catch {}
    }
  }, []);

  // Sync state if user exits native browser fullscreen via Esc key
  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as any;
      const fsElem = doc.fullscreenElement || doc.webkitFullscreenElement;
      if (!fsElem && isMonitorFullscreen) {
        setIsMonitorFullscreen(false);
        setFloatingToolbarExpanded(false);
        setScalingMode(prevScalingModeRef.current === 'fill' ? 'fit' : prevScalingModeRef.current);
      }
      setTimeout(() => updateDisplayScaleRef.current(), 50);
      setTimeout(() => updateDisplayScaleRef.current(), 200);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, [isMonitorFullscreen]);

  // Draggable handler for the floating circle toolbar
  const handleFloatingMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    triggerFloatingActivity();

    const startX = e.clientX;
    const startY = e.clientY;
    const initialX = floatingPos.x;
    const initialY = floatingPos.y;
    let moved = false;
    isDraggingFloatingRef.current = false;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (Math.hypot(dx, dy) > 4) {
        moved = true;
        isDraggingFloatingRef.current = true;
      }
      if (moved) {
        const maxW = window.innerWidth || 1280;
        const maxH = window.innerHeight || 720;
        const nextX = Math.max(28, Math.min(maxW - 28, initialX + dx));
        const nextY = Math.max(28, Math.min(maxH - 28, initialY + dy));
        setFloatingPos({ x: nextX, y: nextY });
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      triggerFloatingActivity();
      if (!moved) {
        setFloatingToolbarExpanded((prev) => !prev);
      }
      setTimeout(() => {
        isDraggingFloatingRef.current = false;
      }, 50);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleFloatingTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    e.stopPropagation();
    triggerFloatingActivity();

    const startX = e.touches[0].clientX;
    const startY = e.touches[0].clientY;
    const initialX = floatingPos.x;
    const initialY = floatingPos.y;
    let moved = false;
    isDraggingFloatingRef.current = false;

    const onTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches.length !== 1) return;
      const dx = moveEvent.touches[0].clientX - startX;
      const dy = moveEvent.touches[0].clientY - startY;
      if (Math.hypot(dx, dy) > 5) {
        moved = true;
        isDraggingFloatingRef.current = true;
      }
      if (moved) {
        const maxW = window.innerWidth || 1280;
        const maxH = window.innerHeight || 720;
        const nextX = Math.max(28, Math.min(maxW - 28, initialX + dx));
        const nextY = Math.max(28, Math.min(maxH - 28, initialY + dy));
        setFloatingPos({ x: nextX, y: nextY });
      }
    };

    const onTouchEnd = () => {
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      triggerFloatingActivity();
      if (!moved) {
        setFloatingToolbarExpanded((prev) => !prev);
      }
      setTimeout(() => {
        isDraggingFloatingRef.current = false;
      }, 50);
    };

    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
  };

  // Register user activity on interaction
  const registerActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIdleRemainingSec(900);
  }, []);

  // Teardown and cleanup existing connection
  const cleanupConnection = useCallback(() => {
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
    if (guacKeyboardRef.current) {
      try {
        guacKeyboardRef.current.onkeydown = null;
        guacKeyboardRef.current.onkeyup = null;
        guacKeyboardRef.current.reset();
      } catch {}
      guacKeyboardRef.current = null;
    }
    if (guacMouseRef.current) {
      try {
        guacMouseRef.current.onmousedown = null;
        guacMouseRef.current.onmouseup = null;
        guacMouseRef.current.onmousemove = null;
      } catch {}
      guacMouseRef.current = null;
    }
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
      try {
        displayContainerRef.current.blur();
        displayContainerRef.current.innerHTML = '';
      } catch {}
    }
  }, []);

  // Update scaling of Guacamole display
  const updateDisplayScale = useCallback(() => {
    if (!guacClientRef.current || !displayContainerRef.current) return;
    const display = guacClientRef.current.getDisplay();
    if (!display) return;

    const displayElem = display.getElement() as HTMLElement | null;
    if (!displayElem) return;
    const innerDisplay = displayElem.firstElementChild as HTMLElement | null;

    // Enforce LTR top-left origin so RTL panel mode never shifts the canvas or cursor
    displayElem.dir = 'ltr';
    displayElem.style.direction = 'ltr';
    displayElem.style.position = 'relative';
    displayElem.style.margin = '0';
    displayElem.style.padding = '0';
    displayElem.style.overflow = 'hidden';
    if (innerDisplay) {
      innerDisplay.dir = 'ltr';
      innerDisplay.style.direction = 'ltr';
      innerDisplay.style.left = '0px';
      innerDisplay.style.top = '0px';
      innerDisplay.style.margin = '0';
      innerDisplay.style.transformOrigin = '0 0';
      (innerDisplay.style as any).webkitTransformOrigin = '0 0';
    }

    const displayWidth = display.getWidth();
    const displayHeight = display.getHeight();
    if (displayWidth <= 0 || displayHeight <= 0) return;

    if (scalingMode === 'native') {
      display.scale(1.0);
      if (innerDisplay) {
        innerDisplay.style.transform = 'scale(1, 1)';
      }
      displayElem.style.width = `${displayWidth}px`;
      displayElem.style.height = `${displayHeight}px`;
      return;
    }

    const container = displayContainerRef.current;
    const pad = isMonitorFullscreen ? 0 : 4;
    const containerWidth = Math.max(64, container.clientWidth - pad);
    const containerHeight = Math.max(64, container.clientHeight - pad);

    if (scalingMode === 'fill') {
      const scaleX = Math.max(0.1, containerWidth / displayWidth);
      const scaleY = Math.max(0.1, containerHeight / displayHeight);
      display.scale(scaleX);
      if (innerDisplay) {
        innerDisplay.style.transform = `scale(${scaleX}, ${scaleY})`;
        (innerDisplay.style as any).webkitTransform = `scale(${scaleX}, ${scaleY})`;
      }
      displayElem.style.width = `${Math.round(displayWidth * scaleX)}px`;
      displayElem.style.height = `${Math.round(displayHeight * scaleY)}px`;
    } else {
      const scale = Math.max(0.1, Math.min(containerWidth / displayWidth, containerHeight / displayHeight));
      display.scale(scale);
      if (innerDisplay) {
        innerDisplay.style.transform = `scale(${scale}, ${scale})`;
        (innerDisplay.style as any).webkitTransform = `scale(${scale}, ${scale})`;
      }
      displayElem.style.width = `${Math.round(displayWidth * scale)}px`;
      displayElem.style.height = `${Math.round(displayHeight * scale)}px`;
    }
  }, [scalingMode, isMonitorFullscreen]);

  useEffect(() => {
    updateDisplayScaleRef.current = updateDisplayScale;
    updateDisplayScale();
    const t = setTimeout(updateDisplayScale, 60);
    return () => clearTimeout(t);
  }, [updateDisplayScale, isMaximized, isMonitorFullscreen, showDiagnostics]);

  // Window resize & ResizeObserver listener to auto-scale display
  useEffect(() => {
    window.addEventListener('resize', updateDisplayScale);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && displayContainerRef.current) {
      observer = new ResizeObserver(() => {
        updateDisplayScale();
      });
      observer.observe(displayContainerRef.current);
    }
    return () => {
      window.removeEventListener('resize', updateDisplayScale);
      if (observer) observer.disconnect();
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
    const wsUrl = `${wsProto}//${window.location.host}/ws/guacamole`;

    try {
      // Clear any prior timeout
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }

      // Initialize native Guacamole WebSocket Tunnel
      const tunnel = new Guacamole.WebSocketTunnel(wsUrl);
      guacTunnelRef.current = tunnel;

      const client = new Guacamole.Client(tunnel);
      guacClientRef.current = client;

      // Attach client display element to the DOM container
      const display = client.getDisplay();
      const displayElem = display.getElement() as HTMLElement;
      displayElem.dir = 'ltr';
      displayElem.style.direction = 'ltr';
      displayElem.style.position = 'relative';
      displayElem.style.margin = '0';
      displayElem.style.padding = '0';
      displayElem.style.outline = 'none';
      displayElem.style.overflow = 'hidden';
      displayElem.tabIndex = 0;

      const innerDisplay = displayElem.firstElementChild as HTMLElement | null;
      if (innerDisplay) {
        innerDisplay.dir = 'ltr';
        innerDisplay.style.direction = 'ltr';
        innerDisplay.style.left = '0px';
        innerDisplay.style.top = '0px';
        innerDisplay.style.margin = '0';
        innerDisplay.style.transformOrigin = '0 0';
        (innerDisplay.style as any).webkitTransformOrigin = '0 0';
      }

      // Immediately re-scale whenever guacd resizes the remote desktop layer
      display.onresize = () => {
        updateDisplayScaleRef.current();
      };

      if (displayContainerRef.current) {
        displayContainerRef.current.innerHTML = '';
        displayContainerRef.current.appendChild(displayElem);
      }

      const translateGuacError = (status: any) => {
        const curIsEn = isEnRef.current;
        const curServer = serverRef.current;
        const curPort = defaultPortRef.current;
        const rawMsg = status?.message;
        const parsedMsg = parseGuacErrorMessage(rawMsg, curIsEn);
        if (parsedMsg && parsedMsg.length > 3) return parsedMsg;

        const rawCode = status?.code;
        const code = typeof rawCode === 'string'
          ? (rawCode.startsWith('0x') ? parseInt(rawCode, 16) : parseInt(rawCode, 10))
          : rawCode;

        switch (code) {
          case 0x0200:
            return curIsEn ? 'Connection completed.' : 'ارتباط برقرار شد.';
          case 0x0201:
            return curIsEn ? 'Protocol or operation unsupported by target host or gateway.' : 'پروتکل یا عملیات توسط هاست یا گیت‌وی پشتیبانی نمی‌شود.';
          case 0x0202:
            return curIsEn ? 'Internal server error occurred on remote desktop gateway.' : 'خطای داخلی در سرور گیت‌وی رخ داد.';
          case 0x0203:
            return curIsEn ? 'Remote server is busy. Try again shortly.' : 'سرور مقصد مشغول است. لطفاً کمی بعد مجدداً تلاش کنید.';
          case 0x0204:
            return curIsEn ? `Connection timed out. Target host ${curServer?.ip || ''}:${curPort} took too long to respond.` : `زمان انتظار به پایان رسید. هاست ${curServer?.ip || ''}:${curPort} پاسخ نداد.`;
          case 0x0205:
            return curIsEn ? `Remote host ${curServer?.ip || ''} encountered an upstream error or closed connection.` : `هاست ${curServer?.ip || ''} با خطای داخلی مواجه شد یا ارتباط را قطع کرد.`;
          case 0x0206:
            return curIsEn ? 'Target remote session resource not found.' : 'منبع نشست ریموت دسکتاپ یافت نشد.';
          case 0x0207:
            return curIsEn ? 'Session conflict on target host.' : 'تداخل نشست در هاست مقصد.';
          case 0x0208:
            return curIsEn ? 'Remote desktop session was closed by the host.' : 'نشست ریموت دسکتاپ توسط هاست بسته شد.';
          case 0x0209:
            return curIsEn ? `Upstream host not found. Target ${curServer?.ip || ''} is unreachable or DNS lookup failed.` : `سرور مقصد یافت نشد. هاست ${curServer?.ip || ''} در دسترس نیست یا تحلیل نام DNS ناموفق بود.`;
          case 0x020a:
            return curIsEn ? `Upstream host unavailable. Target ${curServer?.ip || ''}:${curPort} refused connection or is offline.` : `سرور مقصد در دسترس نیست. هاست ${curServer?.ip || ''}:${curPort} اتصال را رد کرد یا خاموش است.`;
          case 0x020b:
            return curIsEn ? 'Disconnected due to upstream session inactivity.' : 'قطع ارتباط به دلیل عدم فعالیت در نشست سرور مقصد.';
          case 0x020c:
            return curIsEn ? 'Upstream remote desktop session closed.' : 'نشست ریموت در سرور مقصد بسته شد.';
          case 0x020d:
          case 0x0300:
            return curIsEn ? 'Invalid client parameters sent to gateway.' : 'پارامترهای ارسالی به گیت‌وی نامعتبر است.';
          case 0x0301:
            return curIsEn ? 'Authentication failed. Check username, password, or NLA security settings.' : 'احراز هویت ناموفق بود. نام کاربری، رمز عبور یا تنظیمات NLA را بررسی کنید.';
          case 0x0303:
            return curIsEn ? 'Remote desktop access forbidden for this account.' : 'دسترسی ریموت دسکتاپ برای این حساب کاربری مجاز نیست.';
          case 0x0308:
            return curIsEn ? 'Client connection timeout.' : 'زمان اتصال کلاینت منقضی شد.';
          default:
            return curIsEn
              ? `Remote desktop error: unable to establish connection with ${curServer?.ip || 'host'}:${curPort}`
              : `خطا در ریموت دسکتاپ: عدم امکان برقراری ارتباط با ${curServer?.ip || 'سرور'}:${curPort}`;
        }
      };

      // Track client state changes
      // 0 = IDLE, 1 = CONNECTING, 2 = WAITING, 3 = CONNECTED, 4 = DISCONNECTING, 5 = DISCONNECTED
      client.onstatechange = (state: number) => {
        if (state === 3) {
          if (connectTimeoutRef.current) {
            clearTimeout(connectTimeoutRef.current);
            connectTimeoutRef.current = null;
          }
          setConnectionStatus('connected');
          registerActivity();
          setTimeout(() => {
            updateDisplayScaleRef.current();
            if (isOpenRef.current) {
              displayContainerRef.current?.focus();
            }
          }, 200);
        } else if (state === 5) {
          if (connectTimeoutRef.current) {
            clearTimeout(connectTimeoutRef.current);
            connectTimeoutRef.current = null;
          }
          setConnectionStatus((prev) => {
            if (prev === 'connected') return 'disconnected';
            return 'error';
          });
          setErrorMessage((prev) => {
            if (prev) return prev;
            const curIsEn = isEnRef.current;
            const curServer = serverRef.current;
            const curPort = defaultPortRef.current;
            return curIsEn
              ? `Remote desktop connection closed. Verify host ${curServer?.ip || ''} is online, RDP port ${curPort} is accessible, and credentials/NLA security are configured.`
              : `ارتباط ریموت دسکتاپ قطع شد. بررسی نمایید که سرور ${curServer?.ip || ''} روشن باشد، پورت ${curPort} در دسترس باشد و اطلاعات کاربری/NLA صحیح باشند.`;
          });
        }
      };

      client.onerror = (status: any) => {
        console.warn('[RemoteDesktop] Guacamole client error:', status);
        if (connectTimeoutRef.current) {
          clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }
        setConnectionStatus('error');
        setErrorMessage(translateGuacError(status));
      };

      tunnel.onerror = (status: any) => {
        console.warn('[RemoteDesktop] Tunnel error:', status);
        if (connectTimeoutRef.current) {
          clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }
        setConnectionStatus('error');
        setErrorMessage((prev) => prev || translateGuacError(status));
      };

      tunnel.onstatechange = (state: number) => {
        // Guacamole.Tunnel.State: 0=CONNECTING, 1=OPEN, 2=UNSTABLE, 3=CLOSED
        if (state === 3) {
          if (connectTimeoutRef.current) {
            clearTimeout(connectTimeoutRef.current);
            connectTimeoutRef.current = null;
          }
          setConnectionStatus((prev) => {
            if (prev === 'connecting' || prev === 'requesting_token') {
              return 'error';
            }
            if (prev === 'connected') {
              return 'disconnected';
            }
            return prev;
          });
          setErrorMessage((prev) => {
            if (prev) return prev;
            const curIsEn = isEnRef.current;
            const curServer = serverRef.current;
            const curPort = defaultPortRef.current;
            return curIsEn
              ? `Guacamole tunnel closed. Host ${curServer?.ip || ''}:${curPort} did not respond or rejected handshake.`
              : `تونل ارتباطی گوآکامولی بسته شد. هاست ${curServer?.ip || ''}:${curPort} پاسخ نداد یا اتصال را رد کرد.`;
          });
        }
      };

      // Mouse input handling with exact 1:1 viewport-to-remote coordinate mapping
      if (Guacamole.Position && Guacamole.Position.prototype) {
        Guacamole.Position.prototype.fromClientPosition = function (
          element: HTMLElement,
          clientX: number,
          clientY: number
        ) {
          const rect = element.getBoundingClientRect();
          this.x = clientX - rect.left;
          this.y = clientY - rect.top;
        };
      }

      const mouse: any = new Guacamole.Mouse(displayElem);
      guacMouseRef.current = mouse;

      const syncMousePosFromEvent = (e: MouseEvent) => {
        const rect = displayElem.getBoundingClientRect();
        if (mouse && mouse.currentState) {
          mouse.currentState.x = e.clientX - rect.left;
          mouse.currentState.y = e.clientY - rect.top;
        }
      };
      displayElem.addEventListener('mousedown', syncMousePosFromEvent, true);
      displayElem.addEventListener('mouseup', syncMousePosFromEvent, true);

      const sendScaledMouseState = (mouseState: any) => {
        if (!isOpenRef.current) return;
        const rect = displayElem.getBoundingClientRect();
        const dw = display.getWidth();
        const dh = display.getHeight();
        if (rect.width <= 0 || rect.height <= 0 || dw <= 0 || dh <= 0) {
          client.sendMouseState(mouseState, true);
          return;
        }
        const scaleX = dw / rect.width;
        const scaleY = dh / rect.height;
        const clampedX = Math.max(0, Math.min(dw - 1, mouseState.x * scaleX));
        const clampedY = Math.max(0, Math.min(dh - 1, mouseState.y * scaleY));
        const scaledState = new Guacamole.Mouse.State({
          x: clampedX,
          y: clampedY,
          left: mouseState.left,
          middle: mouseState.middle,
          right: mouseState.right,
          up: mouseState.up,
          down: mouseState.down,
        });
        client.sendMouseState(scaledState, false);
      };

      mouse.onmousedown = (mouseState: any) => {
        if (!isOpenRef.current) return;
        registerActivity();
        if (displayContainerRef.current && document.activeElement !== displayContainerRef.current) {
          displayContainerRef.current.focus();
        }
        sendScaledMouseState(mouseState);
      };
      mouse.onmouseup = mouse.onmousemove = (mouseState: any) => {
        if (!isOpenRef.current) return;
        registerActivity();
        sendScaledMouseState(mouseState);
      };

      // Keyboard input handling:
      // Bind keyboard events EXCLUSIVELY to the display container element, NEVER to the global `document`.
      const keyTarget = displayContainerRef.current || displayElem;
      const keyboard: any = new Guacamole.Keyboard(keyTarget);
      guacKeyboardRef.current = keyboard;

      keyboard.onkeydown = (keysym: number) => {
        if (!isOpenRef.current) return true;
        registerActivity();
        // Guard: If the user is typing in an input, textarea, select, or editable element anywhere, yield to browser
        const active = document.activeElement;
        if (active) {
          const tag = active.tagName ? active.tagName.toLowerCase() : '';
          if (tag === 'input' || tag === 'textarea' || tag === 'select' || (active as HTMLElement).isContentEditable) {
            return true; // Allow browser to type into the input
          }
        }
        client.sendKeyEvent(1, keysym);
        return false;
      };

      keyboard.onkeyup = (keysym: number) => {
        if (!isOpenRef.current) return;
        registerActivity();
        const active = document.activeElement;
        if (active) {
          const tag = active.tagName ? active.tagName.toLowerCase() : '';
          if (tag === 'input' || tag === 'textarea' || tag === 'select' || (active as HTMLElement).isContentEditable) {
            return;
          }
        }
        client.sendKeyEvent(0, keysym);
      };

      // Handle server-to-client clipboard sync
      client.onclipboard = (stream: any, mimetype: string) => {
        if (mimetype && mimetype.toLowerCase().startsWith('text/plain')) {
          const reader = new Guacamole.StringReader(stream);
          let text = '';
          reader.ontext = (chunk: string) => {
            text += chunk;
          };
          reader.onend = () => {
            setClipboardText(text);
            if (text && navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(text).catch(() => {});
            }
          };
        } else {
          try {
            client.sendAck(stream.index, 'Unsupported clipboard mimetype', 0x0100);
          } catch {}
        }
      };

      // Update status to negotiating RDP when tunnel connects
      setConnectionStatus('negotiating_rdp');
      setConnectionStageText(
        isEnRef.current
          ? 'Negotiating NLA/TLS encryption and authenticating with Windows Server...'
          : 'در حال مذاکره پروتکل امنیتی NLA/TLS و احراز هویت با ویندوز سرور...'
      );

      // 25-second smart timeout for full Active Directory / NLA authentication exchange
      connectTimeoutRef.current = setTimeout(() => {
        setConnectionStatus((curr) => {
          if (curr === 'negotiating_rdp' || curr === 'connecting_tunnel' || curr === 'requesting_token') {
            try { client.disconnect(); } catch {}
            const curIsEn = isEnRef.current;
            const curServer = serverRef.current;
            const curPort = defaultPortRef.current;
            setErrorMessage(
              curIsEn
                ? `RDP connection timed out (25s). Target host ${curServer?.ip}:${curPort} did not complete authentication. Verify Windows credentials, Active Directory domain (${curServer?.win_domain || 'local'}), and NLA requirements.`
                : `زمان اتصال RDP به پایان رسید (۲۵ ثانیه). هاست ${curServer?.ip}:${curPort} احراز هویت را کامل نکرد. رمز عبور، دامین اکتیو دایرکتوری (${curServer?.win_domain || 'local'}) و تنظیمات NLA را بررسی نمایید.`
            );
            return 'error';
          }
          return curr;
        });
      }, 25000);

      // Connect to server with token query parameter
      client.connect('token=' + encodeURIComponent(token));
    } catch (err: any) {
      console.error('[RemoteDesktop] Tunnel exception:', err);
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
      setConnectionStatus('error');
      setErrorMessage(err.message || (isEnRef.current ? 'Failed to establish tunnel' : 'خطا در ایجاد تونل ارتباطی'));
    }
  }, [registerActivity]);

  // Step 1: Request single-use session token and verify gateway status
  const initiateConnection = useCallback(async () => {
    const curServer = serverRef.current;
    const curIsEn = isEnRef.current;
    const curIsRdp = isRdpRef.current;
    if (!curServer) return;

    cleanupConnection();
    activeSessionKeyRef.current = `${curServer.id}:${curIsRdp ? 'rdp' : 'vnc'}`;
    setConnectionStatus('validating_target');
    setErrorMessage(null);

    const [width, height] = displayResolutionRef.current.split('x').map(Number);
    const authToken = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';

    try {
      // 1. Pre-flight reachability & environment validation
      const valRes = await fetch('/api/remote-desktop/validate-target', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ serverId: curServer.id }),
      }).catch(() => null);

      if (valRes && valRes.ok) {
        const valData = await valRes.json();
        setTargetValidationInfo(valData);
        if (valData.reachable === false) {
          setConnectionStatus('error');
          const errMsg = curIsEn
            ? `Target Windows Server ${curServer.name} (${valData.targetHost}:${valData.targetPort}) is completely unreachable (${valData.error || 'Connection timed out'}). Verify the server is powered on, IP routing and VPN tunnel are operational, and port ${valData.targetPort} is open in the firewall.`
            : `سرور ویندوزی مقصد ${curServer.name} (${valData.targetHost}:${valData.targetPort}) به هیچ وجه در دسترس نیست (${valData.error || 'پایان مهلت انتظار / تایم‌اوت'}). وضعیت روشن بودن سرور، روتینگ شبکه یا تونل VPN و باز بودن پورت ${valData.targetPort} در فایروال را بررسی نمایید.`;
          setErrorMessage(errMsg);
          return;
        }
      }

      setConnectionStatus('requesting_token');

      // 2. Verify guacd gateway status
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

      // 3. Request single-use connection token
      const effectivePassword = customPasswordRef.current || sessionPasswordRef.current;
      const resp = await fetch('/api/remote-desktop/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          serverId: curServer.id,
          protocol: curIsRdp ? 'rdp' : 'vnc',
          width,
          height,
          dpi: 96,
          ...(effectivePassword ? { sessionPassword: effectivePassword } : {}),
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
      setErrorMessage(err.message || (curIsEn ? 'Failed to obtain session token' : 'خطا در دریافت توکن امنیتی'));
    }
  }, [cleanupConnection, connectGuacamoleTunnel]);

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

  // Establish session when modal opens for a server; preserve session across minimize, page switches, and overlapping modals
  useEffect(() => {
    if (!server) {
      activeSessionKeyRef.current = null;
      cleanupConnection();
      return;
    }

    if (isOpen) {
      const sessionKey = `${server.id}:${isRdp ? 'rdp' : 'vnc'}`;
      if (activeSessionKeyRef.current !== sessionKey) {
        activeSessionKeyRef.current = sessionKey;
        setActiveDurationSec(0);
        setIdleRemainingSec(900);
        lastActivityRef.current = Date.now();
        initiateConnection();
      } else {
        // Restoring an already active session from minimize: keep tunnel alive and refresh display scale
        setTimeout(() => {
          updateDisplayScaleRef.current();
          displayContainerRef.current?.focus();
        }, 50);
      }
    }
  }, [isOpen, server?.id, isRdp, initiateConnection, cleanupConnection]);

  // Teardown connection ONLY when component truly unmounts
  useEffect(() => {
    return () => {
      activeSessionKeyRef.current = null;
      cleanupConnection();
    };
  }, [cleanupConnection]);

  // Dynamically request remote display resize if user changes resolution while connected
  useEffect(() => {
    if (guacClientRef.current && connectionStatus === 'connected') {
      const [w, h] = displayResolution.split('x').map(Number);
      if (w > 0 && h > 0) {
        try {
          guacClientRef.current.sendSize(w, h);
          setTimeout(() => updateDisplayScaleRef.current(), 120);
        } catch {}
      }
    }
  }, [displayResolution, connectionStatus]);

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

  // Helper: Write UTF-8 text to remote server clipboard via Guacamole output stream (CLIPRDR)
  const pushTextToRemoteClipboard = useCallback((rawText: string): boolean => {
    if (!guacClientRef.current || !rawText) return false;
    try {
      const client = guacClientRef.current;
      // Windows RDP CLIPRDR expects CRLF line breaks for multi-line text
      const normalizedText = isRdpRef.current ? rawText.replace(/\r?\n/g, '\r\n') : rawText;
      const stream = client.createClipboardStream('text/plain');
      if (typeof TextEncoder !== 'undefined' && Guacamole.ArrayBufferWriter) {
        const writer = new Guacamole.ArrayBufferWriter(stream);
        const utf8Bytes = new TextEncoder().encode(normalizedText);
        writer.sendData(utf8Bytes);
        writer.sendEnd();
      } else {
        const writer = new Guacamole.StringWriter(stream);
        writer.sendText(normalizedText);
        writer.sendEnd();
      }
      return true;
    } catch (err) {
      console.error('[RemoteDesktop] Failed to push text to remote clipboard stream:', err);
      return false;
    }
  }, []);

  // Open Clipboard Modal safely (release Guacamole keyboard focus so textarea receives all keys)
  const handleOpenClipboardModal = useCallback(() => {
    if (displayContainerRef.current) {
      try {
        displayContainerRef.current.blur();
      } catch {}
    }
    if (guacKeyboardRef.current) {
      try {
        guacKeyboardRef.current.reset();
      } catch {}
    }
    setShowClipboardModal(true);
  }, []);

  // Clipboard sync: Send text to remote server clipboard stream
  const handleSendClipboard = () => {
    registerActivity();
    if (!clipboardText) return;

    pushTextToRemoteClipboard(clipboardText);
    setClipboardCopied(true);
    setTimeout(() => {
      setClipboardCopied(false);
      setShowClipboardModal(false);
      setTimeout(() => {
        displayContainerRef.current?.focus();
      }, 60);
    }, 600);
  };

  // Clipboard sync + Auto-Paste / Type directly into active remote window (works on login screen & desktop)
  const handleSendAndPasteClipboard = () => {
    registerActivity();
    if (!clipboardText) return;

    const textToPaste = clipboardText;
    pushTextToRemoteClipboard(textToPaste);
    setClipboardCopied(true);
    setShowClipboardModal(false);

    setTimeout(() => {
      setClipboardCopied(false);
      if (displayContainerRef.current) {
        displayContainerRef.current.focus();
      }
      if (guacKeyboardRef.current && typeof guacKeyboardRef.current.type === 'function') {
        try {
          guacKeyboardRef.current.type(textToPaste);
          return;
        } catch {}
      }
      if (guacClientRef.current) {
        const client = guacClientRef.current;
        // Fallback: send Ctrl+V (Ctrl = 0xFFE3, v = 0x0076)
        client.sendKeyEvent(1, 0xffe3);
        client.sendKeyEvent(1, 0x0076);
        setTimeout(() => {
          client.sendKeyEvent(0, 0x0076);
          client.sendKeyEvent(0, 0xffe3);
        }, 100);
      }
    }, 180);
  };

  // Safe Close with Modal Lock Check — ONLY explicit Close terminates the session
  const handleAttemptClose = () => {
    if (isLocked) {
      setShowConfirmClose(true);
    } else {
      if (isMonitorFullscreen) {
        exitMonitorFullscreen();
      }
      activeSessionKeyRef.current = null;
      cleanupConnection();
      onClose();
    }
  };

  // Safe Minimize with blur and keyboard reset (keeps session & DOM canvas alive in background)
  const handleMinimize = () => {
    if (isMonitorFullscreen) {
      exitMonitorFullscreen();
    }
    if (displayContainerRef.current) {
      try {
        displayContainerRef.current.blur();
      } catch {}
    }
    if (guacKeyboardRef.current) {
      try {
        guacKeyboardRef.current.reset();
      } catch {}
    }
    onMinimize();
  };

  const handleForceClose = () => {
    if (isMonitorFullscreen) {
      exitMonitorFullscreen();
    }
    setShowConfirmClose(false);
    setIsLocked(false);
    activeSessionKeyRef.current = null;
    cleanupConnection();
    onClose();
  };

  if (!server) return null;

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h.toString().padStart(2, '0')}:${rm.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const floatingMenuOpensUp =
    typeof window !== 'undefined' ? floatingPos.y > window.innerHeight * 0.55 : false;
  const floatingMenuClampedLeft =
    typeof window !== 'undefined'
      ? Math.max(210, Math.min(window.innerWidth - 210, floatingPos.x)) - floatingPos.x
      : 0;

  return createPortal(
    <div
      ref={modalRootRef}
      aria-hidden={!isOpen}
      className={`fixed flex flex-col items-center justify-center ${
        !isOpen
          ? '-top-[20000px] -left-[20000px] w-[1024px] h-[768px] opacity-0 pointer-events-none invisible -z-50 overflow-hidden'
          : isMonitorFullscreen
          ? 'inset-0 z-[999998] p-0 m-0 bg-black'
          : isMaximized
          ? 'z-[9999] top-0 left-0 right-0 bottom-8 p-0'
          : 'z-[9999] top-0 left-0 right-0 bottom-8 p-3 md:p-6 bg-black/80 backdrop-blur-md'
      }`}
      dir={isEn ? 'ltr' : 'rtl'}
      onClick={registerActivity}
      onKeyDown={registerActivity}
    >
      <div
        className={`flex flex-col overflow-hidden transition-all duration-200 shadow-2xl ${
          isMonitorFullscreen || isMaximized
            ? 'w-full h-full rounded-none border-none'
            : 'w-full max-w-6xl h-[92vh] rounded-2xl border'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-200 text-slate-900 shadow-slate-900/20'
            : 'bg-slate-950 border-slate-800 text-slate-100 shadow-cyan-950/40'
        }`}
      >
        {/* Modal Header (Hidden in Full-Monitor Mode) */}
        {!isMonitorFullscreen && (
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

            {/* Full Monitor Screen Button */}
            <button
              type="button"
              onClick={enterMonitorFullscreen}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-400 text-xs font-bold transition-colors cursor-pointer"
              title={
                isEn
                  ? 'Full Monitor Screen (Fills entire monitor with floating toolbar)'
                  : 'فول‌سایز کل مانیتور (نمایش در کل صفحه مانیتور به همراه ابزار شناور)'
              }
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{isEn ? 'Full Monitor' : 'فول‌سایز مانیتور'}</span>
            </button>

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
              onClick={handleMinimize}
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
        )}

        {/* Secondary Technical Toolbar: Special Keys, Scaling, Clipboard, Diagnostics */}
        {!isMonitorFullscreen && (
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
                const next: ScalingMode =
                  scalingMode === 'fit' ? 'fill' : scalingMode === 'fill' ? 'native' : 'fit';
                setScalingMode(next);
                setTimeout(updateDisplayScale, 50);
              }}
              className={`px-2 py-1 rounded border font-mono text-xs flex items-center gap-1 transition-colors cursor-pointer ${
                scalingMode === 'fit' || scalingMode === 'fill'
                  ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
              title={isEn ? 'Toggle Display Scaling (Fit / Fill / 1:1)' : 'تغییر مقیاس صفحه (انطباق / پر کردن کامل / ۱:۱)'}
            >
              <Sliders className="w-3 h-3" />
              <span>
                {scalingMode === 'fit'
                  ? isEn
                    ? 'Fit Window'
                    : 'انطباق'
                  : scalingMode === 'fill'
                  ? isEn
                    ? 'Full Stretch'
                    : 'پر کردن صفحه'
                  : isEn
                  ? '100% 1:1'
                  : 'اندازه واقعی'}
              </span>
            </button>

            {/* Full Monitor Size Button */}
            <button
              type="button"
              onClick={enterMonitorFullscreen}
              className="px-2.5 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title={isEn ? 'Expand remote desktop to full monitor size' : 'فول‌سایز کردن تصویر ریموت در کل صفحه مانیتور'}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>{isEn ? 'Full Screen Size' : 'فول‌سایز کل صفحه'}</span>
            </button>

            {/* Clipboard Sync Button */}
            <button
              type="button"
              onClick={handleOpenClipboardModal}
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
        )}

        {/* Informative Diagnostics Drawer (Expandable) */}
        {!isMonitorFullscreen && showDiagnostics && (
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
        <div
          dir="ltr"
          className={`flex-1 relative bg-black flex items-center justify-center overflow-hidden cursor-default ${
            isMonitorFullscreen ? 'p-0' : 'p-1'
          }`}
          onClick={() => {
            if (!showClipboardModal && !showConfirmClose) {
              displayContainerRef.current?.focus();
            }
          }}
        >
          {/* Floating Draggable & Fading Circular Toolbar in Full-Monitor Mode */}
          {isMonitorFullscreen && (
            <div
              dir={isEn ? 'ltr' : 'rtl'}
              style={{
                left: `${floatingPos.x}px`,
                top: `${floatingPos.y}px`,
                transform: 'translate(-50%, -50%)',
              }}
              onMouseEnter={() => {
                setIsFloatingHovered(true);
                triggerFloatingActivity();
              }}
              onMouseLeave={() => setIsFloatingHovered(false)}
              onClick={(e) => e.stopPropagation()}
              className={`fixed z-[999999] select-none transition-opacity duration-300 ${
                isFloatingHovered || floatingToolbarExpanded || isFloatingActive
                  ? 'opacity-100'
                  : 'opacity-25 hover:opacity-100'
              }`}
            >
              {/* Draggable Circular Orb Button */}
              <div className="relative flex items-center justify-center">
                <button
                  type="button"
                  onMouseDown={handleFloatingMouseDown}
                  onTouchStart={handleFloatingTouchStart}
                  title={
                    isEn
                      ? 'Drag to move • Click for tools & exit fullscreen'
                      : 'برای جابجایی بکشید • برای ابزارها و کوچک کردن کلیک کنید'
                  }
                  className={`w-12 h-12 rounded-full flex flex-col items-center justify-center cursor-move shadow-2xl border-2 transition-transform duration-200 ${
                    floatingToolbarExpanded
                      ? 'bg-cyan-500 text-slate-950 border-white scale-105 shadow-cyan-500/50'
                      : 'bg-slate-900/90 hover:bg-slate-800 text-cyan-400 border-cyan-400/60 hover:scale-105 shadow-black/80 backdrop-blur-md'
                  }`}
                >
                  <Sliders className="w-4 h-4" />
                  <span className="text-[8px] font-bold tracking-tighter leading-none mt-0.5">
                    {isEn ? 'TOOLS' : 'ابزار'}
                  </span>
                </button>

                {/* Quick 1-Click Shrink Badge on the Circle */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    exitMonitorFullscreen();
                  }}
                  title={isEn ? 'Exit Full Size (Shrink)' : 'کوچیک کردن (خروج از حالت فول‌سایز)'}
                  className="absolute -right-2 -top-2 w-6 h-6 rounded-full bg-rose-500 hover:bg-rose-400 text-white border border-white/80 shadow-lg flex items-center justify-center cursor-pointer transition-transform hover:scale-110"
                >
                  <Minimize2 className="w-3 h-3" />
                </button>
              </div>

              {/* Expanded Floating Tools Pod */}
              {floatingToolbarExpanded && (
                <div
                  style={{
                    marginLeft: `${floatingMenuClampedLeft}px`,
                  }}
                  className={`absolute left-1/2 -translate-x-1/2 ${
                    floatingMenuOpensUp ? 'bottom-14' : 'top-14'
                  } w-[390px] max-w-[94vw] rounded-2xl bg-slate-900/95 border border-cyan-500/40 shadow-2xl backdrop-blur-xl p-3 text-slate-100 space-y-2.5`}
                >
                  {/* Top Row: Server Title + Shrink Button */}
                  <div
                    onMouseDown={handleFloatingMouseDown}
                    onTouchStart={handleFloatingTouchStart}
                    className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800 cursor-move"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Monitor className="w-4 h-4 text-cyan-400 shrink-0" />
                      <div className="truncate">
                        <div className="text-xs font-bold text-white truncate">{server.name}</div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {server.ip}:{defaultPort} • {formatSeconds(activeDurationSec)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          exitMonitorFullscreen();
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md cursor-pointer transition-colors"
                      >
                        <Minimize2 className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Shrink / Restore' : 'کوچیک کردن'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFloatingToolbarExpanded(false);
                        }}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
                        title={isEn ? 'Collapse menu' : 'بستن منوی شناور'}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Scaling & Resolution Controls */}
                  <div className="flex items-center justify-between gap-1.5 flex-wrap">
                    <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          setScalingMode('fill');
                          setTimeout(updateDisplayScale, 40);
                        }}
                        className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                          scalingMode === 'fill'
                            ? 'bg-cyan-500 text-slate-950'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {isEn ? 'Full Stretch' : 'کل صفحه'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setScalingMode('fit');
                          setTimeout(updateDisplayScale, 40);
                        }}
                        className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                          scalingMode === 'fit'
                            ? 'bg-cyan-500 text-slate-950'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {isEn ? 'Fit Aspect' : 'انطباق'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setScalingMode('native');
                          setTimeout(updateDisplayScale, 40);
                        }}
                        className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                          scalingMode === 'native'
                            ? 'bg-cyan-500 text-slate-950'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        1:1
                      </button>
                    </div>

                    <select
                      value={displayResolution}
                      onChange={(e) => {
                        setDisplayResolution(e.target.value as any);
                        setTimeout(initiateConnection, 100);
                      }}
                      className="text-[11px] px-2 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 font-mono"
                    >
                      <option value="1920x1080">1920×1080</option>
                      <option value="1600x900">1600×900</option>
                      <option value="1280x720">1280×720</option>
                    </select>
                  </div>

                  {/* Special Keys Row */}
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                      <Keyboard className="w-3 h-3 text-cyan-400" />
                      <span>{isEn ? 'Send Special Keys:' : 'ارسال کلیدهای ویژه:'}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      <button
                        type="button"
                        onClick={() => sendSpecialKey('Ctrl+Alt+Del')}
                        className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-[11px] border border-slate-700 cursor-pointer"
                      >
                        Ctrl+Alt+Del
                      </button>
                      <button
                        type="button"
                        onClick={() => sendSpecialKey('WinKey')}
                        className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-[11px] border border-slate-700 cursor-pointer"
                      >
                        ⊞ Win
                      </button>
                      <button
                        type="button"
                        onClick={() => sendSpecialKey('Alt+Tab')}
                        className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-[11px] border border-slate-700 cursor-pointer"
                      >
                        Alt+Tab
                      </button>
                      <button
                        type="button"
                        onClick={() => sendSpecialKey('Esc')}
                        className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-[11px] border border-slate-700 cursor-pointer"
                      >
                        Esc
                      </button>
                      <button
                        type="button"
                        onClick={() => sendSpecialKey('Ctrl+Shift+Esc')}
                        className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-[11px] border border-slate-700 cursor-pointer"
                      >
                        Taskmgr
                      </button>
                    </div>
                  </div>

                  {/* Bottom Action Tools */}
                  <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-slate-800">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setFloatingToolbarExpanded(false);
                          handleOpenClipboardModal();
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{isEn ? 'Clipboard' : 'کلیپ‌بورد'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={initiateConnection}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{isEn ? 'Reconnect' : 'اتصال مجدد'}</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setIsLocked(!isLocked)}
                        className={`p-1.5 rounded-xl border cursor-pointer ${
                          isLocked
                            ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                        }`}
                        title={isEn ? 'Lock Session' : 'قفل نشست'}
                      >
                        {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          exitMonitorFullscreen();
                          handleMinimize();
                        }}
                        className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white cursor-pointer"
                        title={isEn ? 'Minimize to Dock' : 'مینیمایز به نوار پایین'}
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          exitMonitorFullscreen();
                          handleAttemptClose();
                        }}
                        className="p-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-400 cursor-pointer"
                        title={isEn ? 'Disconnect & Close' : 'قطع اتصال و بستن'}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Live Guacamole Display Element */}
          <div
            ref={displayContainerRef}
            dir="ltr"
            tabIndex={0}
            onClick={() => {
              if (!showClipboardModal && !showConfirmClose) {
                displayContainerRef.current?.focus();
              }
            }}
            onPaste={(e) => {
              const pasted = e.clipboardData?.getData('text/plain');
              if (pasted) {
                setClipboardText(pasted);
                pushTextToRemoteClipboard(pasted);
              }
            }}
            className={`w-full h-full flex items-center justify-center overflow-hidden focus:outline-none ${
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

          {/* Overlay Status when connecting / validating */}
          {(connectionStatus === 'validating_target' || connectionStatus === 'requesting_token' || connectionStatus === 'connecting_tunnel' || connectionStatus === 'negotiating_rdp') && (
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-4">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mb-3" />
              <p className="text-sm font-bold text-slate-200">
                {connectionStageText || (isEn ? 'Connecting to Live Remote Desktop...' : 'در حال اتصال به ریموت دسکتاپ...')}
              </p>
              <div className="mt-3 flex items-center gap-2 text-[11px] font-mono text-slate-400 bg-slate-900/70 px-3 py-1.5 rounded-lg border border-slate-800">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
                <span>{server?.ip}:{defaultPort}</span>
                <span>•</span>
                <span>User: {targetValidationInfo?.normalizedUser || server?.win_username || 'Administrator'}</span>
                {(targetValidationInfo?.normalizedDomain || server?.win_domain) && (
                  <>
                    <span>•</span>
                    <span className="text-cyan-300">Domain: {targetValidationInfo?.normalizedDomain || server?.win_domain}</span>
                  </>
                )}
              </div>
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
            <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20 overflow-y-auto">
              <div className="w-14 h-14 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mb-4 border border-rose-500/30 shadow-lg shadow-rose-500/10">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <h4 className="text-lg font-bold text-rose-200">
                {isEn ? 'Remote Desktop Connection Failed' : 'برقراری اتصال ریموت دسکتاپ ناموفق بود'}
              </h4>
              <p className="text-xs text-rose-300/90 max-w-lg mt-2 mb-4 bg-rose-950/40 p-3 rounded-xl border border-rose-900/50 font-mono leading-relaxed">
                {errorMessage ||
                  (isEn
                    ? 'Target server rejected handshake or did not respond in time.'
                    : 'سرور مقصد درخواست اتصال را رد کرد یا در زمان مقرر پاسخ نداد.')}
              </p>

              {/* Troubleshooting and Diagnostic Tips */}
              <div className="max-w-md w-full bg-slate-900/80 border border-slate-800 rounded-xl p-3 mb-5 text-left text-xs text-slate-300 space-y-2">
                <div className="font-semibold text-slate-200 flex items-center gap-1.5 pb-1 border-b border-slate-800">
                  <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                  {isEn ? 'Diagnostics & Suggested Checks:' : 'اطلاعات تشخیصی و راهنمای رفع مشکل:'}
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-slate-950/60 p-2 rounded-lg border border-slate-800/60">
                  <div>
                    <span className="text-slate-400">{isEn ? 'Target Host:' : 'آدرس مقصد:'}</span>{' '}
                    <span className="text-slate-200 font-bold">{server?.ip || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">{isEn ? 'Port:' : 'پورت:'}</span>{' '}
                    <span className="text-slate-200 font-bold">{defaultPort} ({isRdp ? 'RDP' : 'VNC'})</span>
                  </div>
                  <div>
                    <span className="text-slate-400">{isEn ? 'Username:' : 'نام کاربری:'}</span>{' '}
                    <span className="text-slate-200">{server?.win_username || 'Administrator'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">{isEn ? 'Reachability:' : 'وضعیت ارتباط:'}</span>{' '}
                    <span className={targetValidationInfo?.reachable ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                      {targetValidationInfo?.reachable === true
                        ? (isEn ? `Online (${targetValidationInfo.latencyMs}ms)` : `در دسترس (${targetValidationInfo.latencyMs}ms)`)
                        : targetValidationInfo?.reachable === false
                        ? (isEn ? `Unreachable (${targetValidationInfo.error || 'Timeout'})` : `عدم دسترسی (${targetValidationInfo.error || 'تایم‌اوت'})`)
                        : (isEn ? 'Untested' : 'نامشخص')}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">{isEn ? 'Gateway Daemon:' : 'وضعیت guacd:'}</span>{' '}
                    <span className={targetValidationInfo?.guacdRunning || guacdSetupInfo?.guacdRunning ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                      {targetValidationInfo?.guacdRunning || guacdSetupInfo?.guacdRunning
                        ? (isEn ? 'Active (4822)' : 'فعال (۴۸۲۲)')
                        : (isEn ? 'Offline' : 'غیرفعال')}
                    </span>
                  </div>
                </div>
                {targetValidationInfo?.reachable === false ? (
                  <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/50 text-[11px] text-rose-200 space-y-1">
                    <div className="font-bold flex items-center gap-1 text-rose-300">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                      {isEn ? 'Network Route / Firewall Failure' : 'خطای مسیر شبکه یا فایروال'}
                    </div>
                    <p className="text-[10px] text-rose-300/80 leading-relaxed">
                      {isEn
                        ? `Target host ${server?.ip || ''}:${defaultPort} did not respond to TCP probe (${targetValidationInfo?.error || 'ETIMEDOUT'}). This indicates network isolation, absent VPN tunnel, or Windows Firewall blocking port ${defaultPort}.`
                        : `میزبان مقصد ${server?.ip || ''}:${defaultPort} به کاوشگر TCP پاسخ نداد (${targetValidationInfo?.error || 'ETIMEDOUT'}). این نشان‌دهنده عدم دسترسی شبکه، نبود تونل VPN یا مسدود بودن پورت ${defaultPort} در فایروال است.`}
                    </p>
                  </div>
                ) : (
                  <ul className="list-disc list-inside text-[11px] text-slate-400 space-y-1 pt-1">
                    <li>
                      {isEn
                        ? 'Ensure target Windows Server has Remote Desktop enabled in System Properties.'
                        : 'از فعال بودن Remote Desktop در تنظیمات سیستم ویندوز سرور اطمینان حاصل نمایید.'}
                    </li>
                    <li>
                      {isEn
                        ? 'Verify Windows Firewall permits inbound connections on TCP port 3389.'
                        : 'بررسی کنید پورت TCP ۳۳۸۹ در فایروال ویندوز سرور باز باشد.'}
                    </li>
                    <li>
                      {isEn
                        ? 'For Active Directory domains, ensure the account is in Remote Desktop Users and domain is correct.'
                        : 'در شبکه‌های اکتیو دایرکتوری، مطمئن شوید کاربر عضو Remote Desktop Users بوده و نام دامین صحیح است.'}
                    </li>
                  </ul>
                )}
              </div>

              {/* Inline Windows / Active Directory Password Input */}
              <div className="w-full p-3 rounded-xl bg-slate-900/90 border border-slate-700/80 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
                  <span className="flex items-center gap-1.5 text-cyan-400">
                    <Key className="w-3.5 h-3.5" />
                    {isEn ? 'Windows / Active Directory Password' : 'رمز عبور ویندوز / اکتیو دایرکتوری'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal font-mono">
                    {targetValidationInfo?.hasPasswordConfigured
                      ? (isEn ? 'Stored in vault' : 'در والت ذخیره شده')
                      : (isEn ? 'Required for NLA' : 'الزامی برای NLA')}
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showCustomPassword ? 'text' : 'password'}
                    value={customPassword}
                    onChange={(e) => setCustomPassword(e.target.value)}
                    placeholder={
                      isEn
                        ? `Enter password for ${server?.win_username || 'Administrator'}`
                        : `رمز عبور برای ${server?.win_username || 'Administrator'} را وارد کنید`
                    }
                    className="w-full px-3 py-2 pr-10 rounded-lg text-xs bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none font-mono"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        initiateConnection();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCustomPassword(!showCustomPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                    title={showCustomPassword ? (isEn ? 'Hide password' : 'مخفی‌سازی رمز') : (isEn ? 'Show password' : 'نمایش رمز')}
                  >
                    {showCustomPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={initiateConnection}
                  className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all cursor-pointer flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  {isEn ? 'Retry Connection' : 'تلاش مجدد'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors cursor-pointer"
                >
                  {isEn ? 'Close Window' : 'بستن پنجره'}
                </button>
              </div>
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
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[999999]"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`p-5 rounded-2xl max-w-lg w-full border shadow-2xl ${
                isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Copy className="w-4 h-4 text-cyan-400" />
                  <h4 className={`text-sm font-bold ${isLightMode ? 'text-slate-900' : 'text-slate-100'}`}>
                    {isEn ? 'Remote Clipboard Synchronization' : 'همگام‌سازی کلیپ‌بورد ریموت'}
                  </h4>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        if (navigator.clipboard && navigator.clipboard.readText) {
                          const localText = await navigator.clipboard.readText();
                          if (localText) setClipboardText(localText);
                        }
                      } catch {}
                    }}
                    className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                      isLightMode
                        ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                        : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                    }`}
                    title={isEn ? 'Read from your local system clipboard' : 'خواندن متن از کلیپ‌بورد سیستم شما'}
                  >
                    {isEn ? 'Paste Local' : 'درج از کلیپ‌بورد من'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowClipboardModal(false);
                      setTimeout(() => displayContainerRef.current?.focus(), 50);
                    }}
                    className="p-1 rounded text-slate-400 hover:text-rose-400 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className={`text-xs mb-2 ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                {isEn
                  ? 'Paste or type text below to transfer it into the remote desktop clipboard (Ctrl+V in remote) or auto-type it into the active remote field:'
                  : 'متن مورد نظر را در کادر زیر وارد کنید تا به کلیپ‌بورد سرور ریموت منتقل شود (قابل Paste با Ctrl+V در سرور) یا مستقیماً در کادر فعال سرور تایپ گردد:'}
              </p>
              <textarea
                autoFocus
                dir="ltr"
                value={clipboardText}
                onChange={(e) => setClipboardText(e.target.value)}
                placeholder={isEn ? 'Type or paste content here...' : 'متن، دستور یا رمز عبور را اینجا وارد کنید...'}
                className={`w-full h-32 p-2.5 rounded-xl border font-mono text-xs resize-none focus:outline-none focus:border-cyan-500 ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                    : 'bg-slate-950 border-slate-800 text-slate-200 placeholder-slate-500'
                }`}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
                <span className="text-[11px] text-slate-500 font-mono">
                  {clipboardText.length} {isEn ? 'characters' : 'نویسه'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowClipboardModal(false);
                      setTimeout(() => displayContainerRef.current?.focus(), 50);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs cursor-pointer ${
                      isLightMode ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {isEn ? 'Close' : 'بستن'}
                  </button>
                  <button
                    type="button"
                    disabled={!clipboardText}
                    onClick={handleSendAndPasteClipboard}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-400 transition-colors cursor-pointer disabled:opacity-40"
                    title={
                      isEn
                        ? 'Send to remote clipboard AND type directly at cursor position (works on Windows login screen too)'
                        : 'ارسال به کلیپ‌بورد و تایپ خودکار در محل نشانگر سرور (مناسب صفحه لاگین ویندوز، CMD و غیره)'
                    }
                  >
                    <Keyboard className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Send & Type in Remote' : 'ارسال و تایپ در سرور'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={!clipboardText}
                    onClick={handleSendClipboard}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-md transition-colors cursor-pointer disabled:opacity-40"
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
