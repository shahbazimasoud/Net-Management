import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import Guacamole from 'guacamole-common-js';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Play,
  Pause,
  RotateCcw,
  Download,
  Lock,
  ShieldAlert,
  Terminal,
  Monitor,
  Copy,
  Check,
  Search,
  FastForward,
  FileText,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { useModalDock } from '../../context/ModalDockContext';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import {
  fetchSessionRecordingDetail,
  fetchSessionRecordingCastText,
  buildRecordingStreamUrl,
  downloadSessionRecordingFile,
  formatBytes,
  formatDurationSeconds,
} from '../../services/sessionRecordingApi';
import type { SessionRecordingRecord, SessionRecordingMarker } from '../../types';

interface CastEvent {
  time: number; // seconds
  type: 'o' | 'r';
  data: string;
}

interface SessionRecordingPlayerModalProps {
  recording: SessionRecordingRecord;
  isLightMode?: boolean;
  canDownload?: boolean;
  onClose: () => void;
  onMinimize?: () => void;
}

const SPEED_OPTIONS = [0.5, 1, 2, 4, 8];

export const SessionRecordingPlayerModal: React.FC<SessionRecordingPlayerModalProps> = ({
  recording: initialRecording,
  isLightMode = false,
  canDownload = true,
  onClose,
  onMinimize,
}) => {
  const { isEn } = useLanguage();
  const { undockModal } = useModalDock();

  const [isMaximized, setIsMaximized] = useState(false);
  const [recording, setRecording] = useState<SessionRecordingRecord>(initialRecording);
  const [markers, setMarkers] = useState<SessionRecordingMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);

  // SSH Asciicast v2 state
  const [castEvents, setCastEvents] = useState<CastEvent[]>([]);
  const [castDuration, setCastDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [skipIdle, setSkipIdle] = useState(true);
  const [markerSearch, setMarkerSearch] = useState('');
  const [outputSearch, setOutputSearch] = useState('');
  const [outputSearchStatus, setOutputSearchStatus] = useState<string | null>(null);

  // RDP / VNC player mode ('video' | 'guac')
  const hasPlayableVideo = Boolean(recording.metadata?.playableVideo || recording.videoFilePath);
  const hasPlayableGuac = Boolean(recording.metadata?.playableNativeGuac || (recording.protocol !== 'ssh' && recording.rawFilePath?.endsWith('.guac')));
  const [rdpMode, setRdpMode] = useState<'video' | 'guac'>(hasPlayableVideo ? 'video' : 'guac');
  const [guacDurationMs, setGuacDurationMs] = useState(0);
  const [guacPositionMs, setGuacPositionMs] = useState(0);
  const [guacPlaying, setGuacPlaying] = useState(false);
  const [guacLoaded, setGuacLoaded] = useState(false);

  // Refs
  const xtermContainerRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastRenderedIdxRef = useRef<number>(-1);
  const currentTimeRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const guacContainerRef = useRef<HTMLDivElement | null>(null);
  const guacPlayerRef = useRef<any>(null);

  // Ensure undocked when mounted
  useEffect(() => {
    undockModal(`session-recording-player-${initialRecording.id}`);
  }, [initialRecording.id, undockModal]);

  // Load detail metadata + markers (+ SSH .cast payload if SSH)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const detail = await fetchSessionRecordingDetail(initialRecording.id);
        if (cancelled) return;
        setRecording(detail.recording);
        setMarkers(detail.markers || []);

        const detailHasVideo = Boolean(detail.recording.metadata?.playableVideo);
        const detailHasGuac = Boolean(detail.recording.metadata?.playableNativeGuac);
        if (detail.recording.protocol !== 'ssh') {
          setRdpMode(detailHasVideo ? 'video' : detailHasGuac ? 'guac' : 'video');
        }

        if (detail.recording.protocol === 'ssh') {
          const castText = await fetchSessionRecordingCastText(detail.recording.id);
          if (cancelled) return;
          const lines = castText.split('\n');
          const parsedEvents: CastEvent[] = [];
          let maxTime = Math.max(1, detail.recording.durationSeconds || 1);

          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            try {
              const row = JSON.parse(line);
              if (Array.isArray(row) && row.length >= 3) {
                const t = Number(row[0]);
                const evType = row[1] === 'r' ? 'r' : 'o';
                const payload = String(row[2] ?? '');
                if (Number.isFinite(t)) {
                  parsedEvents.push({ time: Math.max(0, t), type: evType, data: payload });
                  if (t > maxTime) maxTime = t;
                }
              }
            } catch {
              // Skip malformed line
            }
          }
          setCastEvents(parsedEvents);
          setCastDuration(maxTime);
          setCurrentTime(0);
          currentTimeRef.current = 0;
          lastRenderedIdxRef.current = -1;
        }
      } catch (err: any) {
        if (!cancelled) {
          setLoadError(
            err?.message ||
              (isEn ? 'Failed to load session recording media.' : 'بارگذاری رسانه ضبط جلسه با خطا مواجه شد.')
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [initialRecording.id, isEn]);

  // Initialize XTerm for SSH playback
  useEffect(() => {
    if (recording.protocol !== 'ssh' || loading || loadError || !xtermContainerRef.current) return;

    const term = new XTerm({
      cursorBlink: false,
      disableStdin: true,
      scrollback: 10000,
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Fira Code, Menlo, Monaco, Consolas, monospace',
      theme: {
        background: '#090d16',
        foreground: '#e2e8f0',
        cursor: '#22d3ee',
        selectionBackground: 'rgba(34, 211, 238, 0.25)',
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(xtermContainerRef.current);
    try {
      fitAddon.fit();
    } catch {}

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;
    lastRenderedIdxRef.current = -1;

    // Render initial snapshot up to t=0.5s so terminal isn't blank on open
    if (castEvents.length > 0) {
      const initialChunk: string[] = [];
      let idx = -1;
      for (let i = 0; i < castEvents.length; i++) {
        if (castEvents[i].time <= 0.25) {
          if (castEvents[i].type === 'o') initialChunk.push(castEvents[i].data);
          idx = i;
        } else {
          break;
        }
      }
      if (initialChunk.length > 0) {
        term.write(initialChunk.join(''));
        lastRenderedIdxRef.current = idx;
      }
    }

    const handleResize = () => {
      try {
        fitAddon.fit();
      } catch {}
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      try {
        term.dispose();
      } catch {}
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [recording.protocol, loading, loadError, castEvents]);

  // Refit XTerm when maximize toggles
  useEffect(() => {
    if (fitAddonRef.current) {
      const t = setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
        } catch {}
      }, 80);
      return () => clearTimeout(t);
    }
  }, [isMaximized]);

  // Seek SSH terminal cleanly to exact target second
  const seekCastTo = useCallback(
    (targetSec: number) => {
      const term = xtermRef.current;
      const clamped = Math.max(0, Math.min(castDuration || 0, targetSec));
      currentTimeRef.current = clamped;
      setCurrentTime(clamped);

      if (!term) return;

      // If seeking backwards, reset terminal and replay up to targetSec cleanly
      if (lastRenderedIdxRef.current >= 0 && (castEvents[lastRenderedIdxRef.current]?.time ?? 0) > clamped) {
        term.reset();
        lastRenderedIdxRef.current = -1;
      }

      const chunks: string[] = [];
      let idx = lastRenderedIdxRef.current;
      for (let i = idx + 1; i < castEvents.length; i++) {
        if (castEvents[i].time <= clamped) {
          if (castEvents[i].type === 'o') {
            chunks.push(castEvents[i].data);
          }
          idx = i;
        } else {
          break;
        }
      }
      if (chunks.length > 0) {
        term.write(chunks.join(''));
      }
      lastRenderedIdxRef.current = idx;
    },
    [castDuration, castEvents]
  );

  // SSH playback loop (RAF with idle compression)
  useEffect(() => {
    if (recording.protocol !== 'ssh' || !isPlaying) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    lastTickRef.current = performance.now();

    const step = (now: number) => {
      const dtSec = Math.min(0.25, (now - lastTickRef.current) / 1000) * playbackSpeed;
      lastTickRef.current = now;

      let nextTime = currentTimeRef.current + dtSec;

      // Skip long idle gaps (> 2s) cleanly when Skip Idle is enabled
      if (skipIdle) {
        const nextIdx = lastRenderedIdxRef.current + 1;
        if (nextIdx < castEvents.length) {
          const nextEvTime = castEvents[nextIdx].time;
          if (nextEvTime - nextTime > 2.0) {
            nextTime = nextEvTime - 0.15;
          }
        }
      }

      if (nextTime >= castDuration) {
        seekCastTo(castDuration);
        setIsPlaying(false);
        return;
      }

      seekCastTo(nextTime);
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [recording.protocol, isPlaying, playbackSpeed, skipIdle, castDuration, castEvents, seekCastTo]);

  // Update HTML5 video playbackRate
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = Math.min(4, playbackSpeed);
    }
  }, [playbackSpeed, rdpMode]);

  // Initialize Native Guacamole SessionRecording player for .guac mode
  useEffect(() => {
    if (recording.protocol === 'ssh' || rdpMode !== 'guac' || loading || loadError || !guacContainerRef.current) {
      return;
    }

    const container = guacContainerRef.current;
    container.innerHTML = '';
    setGuacLoaded(false);
    setGuacPlaying(false);
    setGuacPositionMs(0);
    setGuacDurationMs(0);

    try {
      const streamUrl = buildRecordingStreamUrl(recording.id, 'raw');
      const tunnel = new (Guacamole as any).StaticHTTPTunnel(streamUrl);
      const player = new (Guacamole as any).SessionRecording(tunnel);
      guacPlayerRef.current = player;

      const display = player.getDisplay();
      const el = display.getElement();
      el.style.margin = '0 auto';
      container.appendChild(el);

      const scaleDisplay = () => {
        try {
          const w = display.getWidth();
          const h = display.getHeight();
          if (w > 0 && h > 0 && container.clientWidth > 0 && container.clientHeight > 0) {
            const scale = Math.min(container.clientWidth / w, container.clientHeight / h, 1);
            display.scale(scale);
          }
        } catch {}
      };

      display.onresize = scaleDisplay;
      player.onprogress = (duration: number) => {
        setGuacDurationMs(duration);
        scaleDisplay();
      };
      player.onload = () => {
        setGuacLoaded(true);
        setGuacDurationMs(player.getDuration());
        scaleDisplay();
      };
      player.onplay = () => setGuacPlaying(true);
      player.onpause = () => setGuacPlaying(false);
      player.onseek = (millis: number) => setGuacPositionMs(millis);

      player.connect();
      window.addEventListener('resize', scaleDisplay);

      return () => {
        window.removeEventListener('resize', scaleDisplay);
        try {
          player.pause();
          player.disconnect();
        } catch {}
        guacPlayerRef.current = null;
        container.innerHTML = '';
      };
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to initialize native Guacamole playback');
    }
  }, [recording.id, recording.protocol, rdpMode, loading, loadError]);

  const handleOutputSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = outputSearch.trim().toLowerCase();
    if (!q || castEvents.length === 0) {
      setOutputSearchStatus(null);
      return;
    }
    const startIdx = Math.max(0, lastRenderedIdxRef.current + 1);
    let foundIdx = -1;
    for (let i = startIdx; i < castEvents.length; i++) {
      if (castEvents[i].type === 'o' && castEvents[i].data.toLowerCase().includes(q)) {
        foundIdx = i;
        break;
      }
    }
    if (foundIdx === -1) {
      for (let i = 0; i < startIdx && i < castEvents.length; i++) {
        if (castEvents[i].type === 'o' && castEvents[i].data.toLowerCase().includes(q)) {
          foundIdx = i;
          break;
        }
      }
    }
    if (foundIdx >= 0) {
      setIsPlaying(false);
      seekCastTo(castEvents[foundIdx].time + 0.05);
      setOutputSearchStatus(
        isEn
          ? `Match at ${formatDurationSeconds(castEvents[foundIdx].time)}`
          : `یافت شد در ${formatDurationSeconds(castEvents[foundIdx].time)}`
      );
    } else {
      setOutputSearchStatus(isEn ? 'No match in terminal output' : 'موردی در خروجی ترمینال یافت نشد');
    }
  };

  const handleCopyHash = () => {
    if (!recording.sha256Hash) return;
    navigator.clipboard?.writeText(recording.sha256Hash).catch(() => {});
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 1800);
  };

  const handleDownload = async (format: 'video' | 'raw' | 'cast' | 'txt') => {
    setDownloadingFormat(format);
    try {
      const ext = format === 'video' ? (recording.videoFormat === 'webm' ? 'webm' : 'mp4') : format === 'raw' ? 'guac' : format;
      await downloadSessionRecordingFile(
        recording.id,
        format,
        `${recording.protocol}_${recording.serverName || 'server'}.${ext}`
      );
    } catch (err: any) {
      setLoadError(err?.message || 'Download failed');
    } finally {
      setDownloadingFormat(null);
    }
  };

  const filteredMarkers = useMemo(() => {
    const q = markerSearch.trim().toLowerCase();
    if (!q) return markers;
    return markers.filter(
      (m) =>
        (m.commandText || '').toLowerCase().includes(q) ||
        (m.label || '').toLowerCase().includes(q) ||
        m.riskLevel.toLowerCase().includes(q) ||
        m.markerType.toLowerCase().includes(q)
    );
  }, [markers, markerSearch]);

  const modalShell = isLightMode
    ? 'bg-white border-slate-200 text-slate-900'
    : 'bg-slate-950 border-slate-800 text-slate-100';
  const headerBar = isLightMode
    ? 'bg-slate-50 border-slate-200'
    : 'bg-slate-900 border-slate-800';
  const mutedText = isLightMode ? 'text-slate-500' : 'text-slate-400';
  const divider = isLightMode ? 'border-slate-200' : 'border-slate-800';

  const modalNode = (
    <div
      className={`fixed top-0 left-0 right-0 bottom-8 z-[9999] flex items-center justify-center ${
        isMaximized ? 'p-0' : 'p-3 sm:p-5'
      } ${isLightMode ? 'bg-slate-900/45' : 'bg-black/75'} backdrop-blur-[2px]`}
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`flex flex-col border overflow-hidden shadow-2xl ${modalShell} ${
          isMaximized ? 'w-full h-full rounded-none' : 'w-full max-w-6xl h-[86vh] rounded-lg'
        }`}
      >
        {/* Top Window Header (Rule 7: Close + Minimize + Fullscreen) */}
        <div className={`px-4 py-2.5 border-b flex items-center justify-between gap-3 shrink-0 ${headerBar}`}>
          <div className="flex items-center gap-2.5 min-w-0">
            {recording.protocol === 'ssh' ? (
              <Terminal className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <Monitor className="w-4 h-4 text-sky-500 shrink-0" />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold truncate">{recording.serverName}</span>
                <span className={`text-xs font-mono ${mutedText}`}>{recording.serverIp}</span>
                <span
                  className={`px-1.5 py-0.5 text-[10px] font-mono uppercase rounded border ${
                    recording.protocol === 'ssh'
                      ? 'border-emerald-500/40 text-emerald-500'
                      : 'border-sky-500/40 text-sky-500'
                  }`}
                >
                  {recording.protocol}
                </span>
                {recording.legalHold && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded border border-amber-500/40 text-amber-500">
                    <Lock className="w-3 h-3" />
                    {isEn ? 'Legal Hold' : 'قفل ضدحذف'}
                  </span>
                )}
              </div>
              <div className={`text-[11px] flex items-center gap-1.5 flex-wrap font-mono tabular-nums ${mutedText}`}>
                <span>{recording.username}</span>
                <span>·</span>
                <span>{recording.clientIp || '—'}</span>
                <span>·</span>
                <span>{new Date(recording.startedAt).toLocaleString(isEn ? 'en-US' : 'fa-IR')}</span>
                <span>·</span>
                <span>{formatDurationSeconds(recording.durationSeconds)}</span>
                <span>·</span>
                <span>{formatBytes(recording.fileSizeBytes || (recording.rawSizeBytes || 0) + (recording.videoSizeBytes || 0))}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Downloads */}
            {canDownload && recording.protocol === 'ssh' && (
              <>
                <button
                  onClick={() => handleDownload('cast')}
                  disabled={downloadingFormat !== null}
                  className={`px-2.5 py-1.5 text-[11px] font-medium rounded border flex items-center gap-1 transition-colors ${
                    isLightMode
                      ? 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700'
                      : 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200'
                  }`}
                  title={isEn ? 'Download Asciicast (.cast)' : 'دانلود فایل ترمینال (.cast)'}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>.cast</span>
                </button>
                <button
                  onClick={() => handleDownload('txt')}
                  disabled={downloadingFormat !== null}
                  className={`px-2.5 py-1.5 text-[11px] font-medium rounded border flex items-center gap-1 transition-colors ${
                    isLightMode
                      ? 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700'
                      : 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200'
                  }`}
                  title={isEn ? 'Download Plain-Text Transcript (.txt)' : 'دانلود متن کامل دستورات (.txt)'}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>.txt</span>
                </button>
              </>
            )}

            {canDownload && recording.protocol !== 'ssh' && (
              <>
                {hasPlayableVideo && (
                  <button
                    onClick={() => handleDownload('video')}
                    disabled={downloadingFormat !== null}
                    className={`px-2.5 py-1.5 text-[11px] font-medium rounded border flex items-center gap-1 transition-colors ${
                      isLightMode
                        ? 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700'
                        : 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200'
                    }`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>.{recording.videoFormat === 'webm' ? 'webm' : 'mp4'}</span>
                  </button>
                )}
                {hasPlayableGuac && (
                  <button
                    onClick={() => handleDownload('raw')}
                    disabled={downloadingFormat !== null}
                    className={`px-2.5 py-1.5 text-[11px] font-medium rounded border flex items-center gap-1 transition-colors ${
                      isLightMode
                        ? 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700'
                        : 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200'
                    }`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>.guac</span>
                  </button>
                )}
              </>
            )}

            <div className={`w-px h-5 mx-1 ${isLightMode ? 'bg-slate-300' : 'bg-slate-700'}`} />

            {/* Minimize Button (Rule 5 & 7) */}
            {onMinimize && (
              <button
                onClick={onMinimize}
                className={`p-1.5 rounded transition-colors ${
                  isLightMode ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-slate-800 text-slate-300'
                }`}
                title={isEn ? 'Minimize to Dock' : 'کوچک کردن به نوار پایین'}
              >
                <Minus className="w-4 h-4" />
              </button>
            )}

            {/* Fullscreen Button (Rule 7) */}
            <button
              onClick={() => setIsMaximized((v) => !v)}
              className={`p-1.5 rounded transition-colors ${
                isLightMode ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-slate-800 text-slate-300'
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

            {/* Close Button (Rule 7) */}
            <button
              onClick={onClose}
              className={`p-1.5 rounded transition-colors ${
                isLightMode
                  ? 'hover:bg-rose-100 hover:text-rose-700 text-slate-600'
                  : 'hover:bg-rose-950/60 hover:text-rose-400 text-slate-300'
              }`}
              title={isEn ? 'Close Player' : 'بستن پخش‌کننده'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Forensic Metadata Sub-Bar (SHA-256 + Mode Switcher) */}
        <div
          className={`px-4 py-1.5 border-b flex flex-wrap items-center justify-between gap-2 text-[11px] shrink-0 ${
            isLightMode ? 'bg-slate-50/60 border-slate-200' : 'bg-slate-900/50 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className={mutedText}>{isEn ? 'Integrity SHA-256:' : 'امضای یکپارچگی SHA-256:'}</span>
            <code className="font-mono text-[11px] truncate max-w-[260px] sm:max-w-[380px]">
              {recording.sha256Hash || '—'}
            </code>
            {recording.sha256Hash && (
              <button
                onClick={handleCopyHash}
                className={`p-1 rounded hover:bg-slate-500/15 ${mutedText}`}
                title={isEn ? 'Copy SHA-256' : 'کپی امضای SHA-256'}
              >
                {copiedHash ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            )}
            <FieldInfoTooltip
              isEn={isEn}
              isLightMode={isLightMode}
              infoWhatEn="Cryptographic SHA-256 hash calculated immediately when this recording was finalized."
              infoWhatFa="هش رمزنگاری‌شده SHA-256 که بلافاصله هنگام پایان جلسه از فایل ضبط محاسبه شده است."
              infoWhyEn="Proves the recording file has not been altered or tampered with for legal/forensic compliance."
              infoWhyFa="اثبات می‌کند فایل ضبط‌شده از لحظه ثبت تا زمان بازبینی هیچ‌گونه دستکاری یا تغییری نداشته است."
              infoExampleEn="Verify offline with: sha256sum downloaded_recording.cast"
              infoExampleFa="بررسی صحت فایل دانلودی با دستور: sha256sum"
            />
          </div>

          {recording.protocol !== 'ssh' && hasPlayableVideo && hasPlayableGuac && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setRdpMode('video')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                  rdpMode === 'video'
                    ? 'bg-cyan-600 border-cyan-600 text-white'
                    : isLightMode
                    ? 'border-slate-300 text-slate-700'
                    : 'border-slate-700 text-slate-300'
                }`}
              >
                {isEn ? 'Video (MP4/WebM)' : 'ویدیو (MP4/WebM)'}
              </button>
              <button
                onClick={() => setRdpMode('guac')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                  rdpMode === 'guac'
                    ? 'bg-cyan-600 border-cyan-600 text-white'
                    : isLightMode
                    ? 'border-slate-300 text-slate-700'
                    : 'border-slate-700 text-slate-300'
                }`}
              >
                {isEn ? 'Native Stream (.guac)' : 'پخش بومی (.guac)'}
              </button>
            </div>
          )}
        </div>

        {/* Main Content Viewport */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <RefreshCw className="w-6 h-6 animate-spin text-cyan-500 mb-3" />
              <p className={`text-xs ${mutedText}`}>
                {isEn ? 'Loading session recording stream...' : 'در حال بارگذاری جریان ضبط جلسه...'}
              </p>
            </div>
          ) : loadError ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <AlertTriangle className="w-8 h-8 text-amber-500 mb-3" />
              <p className="text-sm font-medium mb-1">{isEn ? 'Playback Unavailable' : 'پخش ممکن نیست'}</p>
              <p className={`text-xs max-w-md ${mutedText}`}>{loadError}</p>
            </div>
          ) : recording.protocol === 'ssh' ? (
            <>
              {/* SSH XTerm Stage */}
              <div className="flex-1 min-w-0 flex flex-col bg-[#090d16]">
                <div ref={xtermContainerRef} className="flex-1 min-h-0 p-2 overflow-hidden" dir="ltr" />

                {/* SSH Transport Bar */}
                <div className={`px-4 py-2.5 border-t flex flex-wrap items-center gap-3 shrink-0 ${headerBar}`} dir="ltr">
                  <button
                    onClick={() => {
                      if (currentTime >= castDuration - 0.1) {
                        seekCastTo(0);
                      }
                      setIsPlaying((p) => !p);
                    }}
                    className="w-8 h-8 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white flex items-center justify-center shrink-0 transition-colors"
                    title={isPlaying ? (isEn ? 'Pause' : 'توقف') : isEn ? 'Play' : 'پخش'}
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={() => {
                      setIsPlaying(false);
                      seekCastTo(0);
                    }}
                    className={`p-1.5 rounded border transition-colors ${
                      isLightMode ? 'border-slate-300 hover:bg-slate-200' : 'border-slate-700 hover:bg-slate-800'
                    }`}
                    title={isEn ? 'Restart' : 'شروع مجدد'}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>

                  {/* Timeline Scrubber */}
                  <div className="flex-1 min-w-[140px] flex items-center gap-2.5">
                    <span className="text-[11px] font-mono tabular-nums w-12 text-right">
                      {formatDurationSeconds(currentTime)}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(1, castDuration)}
                      step={0.1}
                      value={currentTime}
                      onChange={(e) => {
                        setIsPlaying(false);
                        seekCastTo(Number(e.target.value));
                      }}
                      className="flex-1 accent-cyan-500 cursor-pointer"
                    />
                    <span className={`text-[11px] font-mono tabular-nums w-12 ${mutedText}`}>
                      {formatDurationSeconds(castDuration)}
                    </span>
                  </div>

                  {/* Speed selector */}
                  <div className="flex items-center gap-1">
                    {SPEED_OPTIONS.map((sp) => (
                      <button
                        key={sp}
                        onClick={() => setPlaybackSpeed(sp)}
                        className={`px-1.5 py-1 text-[11px] font-mono rounded border transition-colors ${
                          playbackSpeed === sp
                            ? 'bg-cyan-600 border-cyan-600 text-white'
                            : isLightMode
                            ? 'border-slate-300 text-slate-600 hover:bg-slate-200'
                            : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        {sp}x
                      </button>
                    ))}
                  </div>

                  {/* Skip Idle toggle */}
                  <button
                    onClick={() => setSkipIdle((v) => !v)}
                    className={`px-2 py-1 text-[11px] font-medium rounded border flex items-center gap-1 transition-colors ${
                      skipIdle
                        ? 'border-cyan-500/60 text-cyan-500 bg-cyan-500/10'
                        : isLightMode
                        ? 'border-slate-300 text-slate-600'
                        : 'border-slate-700 text-slate-400'
                    }`}
                    title={isEn ? 'Compress idle pauses longer than 2 seconds' : 'رد کردن مکث‌های طولانی‌تر از ۲ ثانیه'}
                  >
                    <FastForward className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Skip Idle' : 'حذف مکث'}</span>
                  </button>
                </div>
              </div>

              {/* Command & Risk Jump Timeline Sidebar */}
              <div
                className={`w-full lg:w-80 border-t lg:border-t-0 ${
                  isEn ? 'lg:border-l' : 'lg:border-r'
                } flex flex-col shrink-0 max-h-64 lg:max-h-none ${divider}`}
              >
                <div className={`p-3 border-b space-y-2 ${divider}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">
                      {isEn ? 'Command Timeline' : 'تایم‌لاین دستورات'} ({markers.length})
                    </span>
                    {(recording.maxRiskLevel === 'high' || recording.maxRiskLevel === 'critical') && (
                      <span className="text-[11px] font-mono text-rose-500 flex items-center gap-1 uppercase">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        {recording.maxRiskLevel}
                      </span>
                    )}
                  </div>

                  {/* Output text search */}
                  <form onSubmit={handleOutputSearch} className="flex gap-1.5">
                    <input
                      type="text"
                      value={outputSearch}
                      onChange={(e) => setOutputSearch(e.target.value)}
                      placeholder={isEn ? 'Search terminal output...' : 'جستجو در خروجی ترمینال...'}
                      className={`flex-1 px-2.5 py-1.5 text-[11px] rounded border outline-none ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-900'
                          : 'bg-slate-900 border-slate-700 text-slate-100'
                      }`}
                    />
                    <button
                      type="submit"
                      className="px-2 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white"
                      title={isEn ? 'Find Next' : 'یافتن بعدی'}
                    >
                      <Search className="w-3.5 h-3.5" />
                    </button>
                  </form>
                  {outputSearchStatus && <div className="text-[10px] text-cyan-500">{outputSearchStatus}</div>}

                  {/* Filter markers */}
                  {markers.length > 0 && (
                    <input
                      type="text"
                      value={markerSearch}
                      onChange={(e) => setMarkerSearch(e.target.value)}
                      placeholder={isEn ? 'Filter commands...' : 'فیلتر دستورات...'}
                      className={`w-full px-2.5 py-1 text-[11px] rounded border outline-none ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-900'
                          : 'bg-slate-900 border-slate-700 text-slate-100'
                      }`}
                    />
                  )}
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
                  {filteredMarkers.length === 0 ? (
                    <div className={`p-4 text-center text-xs ${mutedText}`}>
                      {isEn
                        ? 'No indexed command markers recorded for this session.'
                        : 'دستور شاخص‌گذاری‌شده‌ای برای این جلسه ثبت نشده است.'}
                    </div>
                  ) : (
                    filteredMarkers.map((m) => {
                      const sec = Math.max(0, m.offsetMs / 1000);
                      const isHigh = ['high', 'critical', 'danger'].includes((m.riskLevel || '').toLowerCase());
                      return (
                        <button
                          key={m.id}
                          onClick={() => {
                            setIsPlaying(false);
                            seekCastTo(sec);
                          }}
                          className={`w-full text-left px-3 py-2 flex items-start gap-2 transition-colors ${
                            isLightMode ? 'hover:bg-slate-100' : 'hover:bg-slate-900'
                          }`}
                          dir="ltr"
                        >
                          <span className="text-[10px] font-mono tabular-nums text-cyan-500 shrink-0 mt-0.5">
                            {formatDurationSeconds(sec)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-mono truncate">{m.commandText}</div>
                            {isHigh && (
                              <span className="text-[10px] font-medium text-rose-500 uppercase">
                                {m.riskLevel}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          ) : rdpMode === 'video' && hasPlayableVideo ? (
            /* RDP / VNC HTML5 MP4/WebM Range Video Player */
            <div className="flex-1 flex flex-col bg-black min-h-0">
              <div className="flex-1 min-h-0 flex items-center justify-center p-2">
                <video
                  ref={videoRef}
                  src={buildRecordingStreamUrl(recording.id, 'video')}
                  controls
                  playsInline
                  className="max-w-full max-h-full rounded"
                />
              </div>
              <div className={`px-4 py-2 border-t flex items-center justify-between gap-2 shrink-0 ${headerBar}`}>
                <span className={`text-xs ${mutedText}`}>
                  {isEn
                    ? `Streaming ${(recording.videoFormat || 'mp4').toUpperCase()} with HTTP Range seek`
                    : `پخش جریان ${(recording.videoFormat || 'mp4').toUpperCase()} با قابلیت جابه‌جایی سریع`}
                </span>
                <div className="flex items-center gap-1" dir="ltr">
                  {[0.5, 1, 1.5, 2, 4].map((sp) => (
                    <button
                      key={sp}
                      onClick={() => setPlaybackSpeed(sp)}
                      className={`px-2 py-0.5 text-[11px] font-mono rounded border ${
                        playbackSpeed === sp
                          ? 'bg-cyan-600 border-cyan-600 text-white'
                          : isLightMode
                          ? 'border-slate-300 text-slate-700'
                          : 'border-slate-700 text-slate-300'
                      }`}
                    >
                      {sp}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* RDP / VNC Native Guacamole Canvas Stream Player */
            <div className="flex-1 flex flex-col bg-[#070b14] min-h-0">
              <div
                ref={guacContainerRef}
                className="flex-1 min-h-0 flex items-center justify-center overflow-hidden p-2"
              />
              <div className={`px-4 py-2.5 border-t flex flex-wrap items-center gap-3 shrink-0 ${headerBar}`} dir="ltr">
                <button
                  onClick={() => {
                    const p = guacPlayerRef.current;
                    if (!p) return;
                    if (guacPlaying) p.pause();
                    else p.play();
                  }}
                  disabled={!guacLoaded && guacDurationMs === 0}
                  className="w-8 h-8 rounded-md bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white flex items-center justify-center shrink-0"
                >
                  {guacPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <div className="flex-1 min-w-[160px] flex items-center gap-2.5">
                  <span className="text-[11px] font-mono tabular-nums w-12 text-right">
                    {formatDurationSeconds(guacPositionMs / 1000)}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(1000, guacDurationMs)}
                    step={250}
                    value={guacPositionMs}
                    onChange={(e) => {
                      const p = guacPlayerRef.current;
                      if (p) p.seek(Number(e.target.value));
                    }}
                    className="flex-1 accent-cyan-500 cursor-pointer"
                  />
                  <span className={`text-[11px] font-mono tabular-nums w-12 ${mutedText}`}>
                    {formatDurationSeconds(guacDurationMs / 1000)}
                  </span>
                </div>
                <span className={`text-[11px] ${mutedText}`}>
                  {guacLoaded
                    ? isEn
                      ? 'Native .guac stream ready'
                      : 'جریان بومی .guac آماده پخش'
                    : isEn
                    ? 'Buffering native stream...'
                    : 'در حال بارگذاری جریان...'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalNode, document.body);
};
