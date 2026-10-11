import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../i18n';
import { GlobeThemeType } from './NetworkGlobe3D';
import { Terminal, Binary, ZoomIn, ZoomOut, RotateCcw, Cpu, ShieldAlert, Sparkles } from 'lucide-react';

interface MatrixRain3DProps {
  theme?: GlobeThemeType;
}

// Typical Matrix characters: Half-width katakana, digits, Latin symbols, operators, hex
const MATRIX_CHARS =
  'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ1234567890ABCDEF<>[]{}/\\*+-=$#%@&;:_~!?';

interface RainDrop {
  x: number; // 3D world x
  y: number; // 3D world y
  z: number; // 3D world depth
  speed: number;
  length: number;
  fontSize: number;
  chars: string[];
  headGlow: number;
  highlightInterval: number;
  lastMutate: number;
}

export const MatrixRain3D: React.FC<MatrixRain3DProps> = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { isEn } = useLanguage();

  // Scroll Zoom Depth State (0 = Standard Matrix Digital Rain, 1 = Deep Inner Core Revelation)
  const [zoomPercent, setZoomPercent] = useState<number>(0);
  const targetZoomRef = useRef<number>(0);
  const currentZoomRef = useRef<number>(0);
  const resetMatrixRef = useRef<(() => void) | null>(null);

  const handleSetZoomTarget = (val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    targetZoomRef.current = clamped;
    setZoomPercent(Math.round(clamped * 100));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = container.clientWidth || 900);
    let height = (canvas.height = container.clientHeight || 700);

    const handleResize = () => {
      if (!container || !canvas) return;
      width = canvas.width = container.clientWidth || 900;
      height = canvas.height = container.clientHeight || 700;
    };

    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(container);

    // Camera and Interactive mouse drag / tilt state
    let camRotX = 0.08; // slight downward pitch
    let camRotY = 0.0;
    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;
    let mouseNormX = 0;
    let mouseNormY = 0;

    resetMatrixRef.current = () => {
      targetZoomRef.current = 0;
      setZoomPercent(0);
      camRotX = 0.08;
      camRotY = 0;
    };

    // -------------------------------------------------------------
    // Multi-Layered 3D Matrix Rain Streams
    // -------------------------------------------------------------
    const drops: RainDrop[] = [];
    const numColumns = 140;
    const worldWidth = 1400;
    const worldHeight = 1100;
    const worldDepth = 900;

    const createStreamChars = (len: number): string[] => {
      const arr: string[] = [];
      for (let i = 0; i < len; i++) {
        arr.push(MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)]);
      }
      return arr;
    };

    for (let i = 0; i < numColumns; i++) {
      const depth = (Math.random() - 0.5) * worldDepth; // z in [-450, 450]
      const streamLen = 14 + Math.floor(Math.random() * 26);
      drops.push({
        x: (Math.random() - 0.5) * worldWidth,
        y: (Math.random() - 0.5) * worldHeight * 2,
        z: depth,
        speed: 2.2 + Math.random() * 4.5,
        length: streamLen,
        fontSize: 13 + Math.random() * 7,
        chars: createStreamChars(streamLen),
        headGlow: 0.8 + Math.random() * 0.2,
        highlightInterval: 3 + Math.floor(Math.random() * 8),
        lastMutate: 0,
      });
    }

    // -------------------------------------------------------------
    // Inner Cyber Core / Sentinel Pods (Emerge when scrolling deep into the Matrix)
    // -------------------------------------------------------------
    // 1) Concentric Code Holo-Rings (The Matrix Architecture Core)
    const holoRings = [
      { radius: 140, speed: 0.007, axis: 0, glyphCount: 32 },
      { radius: 210, speed: -0.005, axis: 0.6, glyphCount: 48 },
      { radius: 290, speed: 0.0035, axis: -0.4, glyphCount: 64 },
      { radius: 380, speed: -0.002, axis: 0.9, glyphCount: 80 },
    ];

    // 2) 3D Construct Hexagon Nodes (representing connected network hosts/nodes within the matrix)
    const hexNodes: { x: number; y: number; z: number; label: string; ip: string; status: string }[] = [
      { x: -160, y: -70, z: 0, label: 'CORE_GATEWAY_01', ip: '10.0.0.1', status: 'SYN_ESTABLISHED' },
      { x: 170, y: -80, z: 20, label: 'SENTINEL_GRID_A', ip: '192.168.1.254', status: 'ENC_ACTIVE' },
      { x: -140, y: 110, z: -30, label: 'ZION_RELAY_NODE', ip: '172.16.0.4', status: 'QUANTUM_TUNNEL' },
      { x: 150, y: 120, z: -10, label: 'NEB_MAINFRAME_X', ip: '10.244.0.12', status: 'OVERRIDE_OK' },
      { x: 0, y: -180, z: 40, label: 'SRC_ARCHITECT_SYS', ip: '127.0.0.1', status: 'SYS_ISOLATED' },
      { x: 0, y: 190, z: -40, label: 'ORACLE_DATAPOOL', ip: '10.99.1.1', status: 'PREDICTIVE_SYNC' },
    ];

    // Event Handlers
    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      canvas.style.cursor = 'grabbing';
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseNormX = ((e.clientX - rect.left) / width) * 2 - 1;
      mouseNormY = ((e.clientY - rect.top) / height) * 2 - 1;

      if (!isDragging) return;
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      camRotY += dx * 0.004;
      camRotX = Math.max(-0.4, Math.min(0.6, camRotX + dy * 0.004));
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    };

    const onMouseUp = () => {
      isDragging = false;
      canvas.style.cursor = 'grab';
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Scroll up (deltaY < 0) zooms deep INTO the Matrix Core (0 -> 1)
      // Scroll down (deltaY > 0) zooms OUT to standard cascading rain (1 -> 0)
      const zoomStep = -e.deltaY * 0.0009;
      const nextTarget = Math.max(0, Math.min(1, targetZoomRef.current + zoomStep));
      targetZoomRef.current = nextTarget;
      setZoomPercent(Math.round(nextTarget * 100));
    };

    let lastTouchDist = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDragging = true;
        lastMouseX = e.touches[0].clientX;
        lastMouseY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        isDragging = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDist = Math.hypot(dx, dy);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && isDragging) {
        const dx = e.touches[0].clientX - lastMouseX;
        const dy = e.touches[0].clientY - lastMouseY;
        camRotY += dx * 0.005;
        camRotX = Math.max(-0.4, Math.min(0.6, camRotX + dy * 0.005));
        lastMouseX = e.touches[0].clientX;
        lastMouseY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        if (lastTouchDist > 0) {
          const delta = (dist - lastTouchDist) * 0.004;
          const nextTarget = Math.max(0, Math.min(1, targetZoomRef.current + delta));
          targetZoomRef.current = nextTarget;
          setZoomPercent(Math.round(nextTarget * 100));
        }
        lastTouchDist = dist;
      }
    };

    const onTouchEnd = () => {
      isDragging = false;
      lastTouchDist = 0;
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);

    // -------------------------------------------------------------
    // Main Render Loop
    // -------------------------------------------------------------
    let frame = 0;
    canvas.style.cursor = 'grab';

    const render = () => {
      animId = requestAnimationFrame(render);
      frame++;

      // Smooth zoom interpolation (spring-like damping)
      const zoomDiff = targetZoomRef.current - currentZoomRef.current;
      currentZoomRef.current += zoomDiff * 0.08;
      const zoom = currentZoomRef.current; // [0..1]

      // Clear with slight trailing persistence for authentic glowing phosphor persistence
      ctx.fillStyle = 'rgba(2, 6, 12, 0.42)';
      ctx.fillRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;

      // Camera view transformations
      // When zoomed in: camera pushes forward in z, focal distance increases, creating deep immersion
      const cameraZ = 650 - zoom * 380;
      const fov = 480 + zoom * 120;

      // Slight subtle automatic wobble / breathing tilt
      const autoWobbleX = Math.sin(frame * 0.004) * 0.02 + mouseNormY * 0.05;
      const autoWobbleY = Math.cos(frame * 0.003) * 0.03 + mouseNormX * 0.06;
      const totalRotX = camRotX + autoWobbleX;
      const totalRotY = camRotY + autoWobbleY;

      const cosX = Math.cos(totalRotX);
      const sinX = Math.sin(totalRotX);
      const cosY = Math.cos(totalRotY);
      const sinY = Math.sin(totalRotY);

      // 3D Projection Helper
      const project = (x: number, y: number, z: number) => {
        // Rotate around Y
        const x1 = x * cosY - z * sinY;
        const z1 = z * cosY + x * sinY;
        // Rotate around X
        const y2 = y * cosX - z1 * sinX;
        const z2 = z1 * cosX + y * sinX;

        const effectiveZ = z2 + cameraZ;
        if (effectiveZ <= 10) return null;

        const scale = fov / effectiveZ;
        return {
          sx: centerX + x1 * scale,
          sy: centerY + y2 * scale,
          scale,
          depth: effectiveZ,
        };
      };

      // -----------------------------------------------------------
      // LAYER 1: Deep Matrix Core & Hologram Architecture (Revealed on Scroll)
      // Subtle when zoom is low, fully unveiled & ethereal when zoom increases
      // -----------------------------------------------------------
      const coreRevealedAlpha = Math.min(1, Math.max(0, (zoom - 0.12) / 0.85));

      if (coreRevealedAlpha > 0.01) {
        ctx.save();

        // 1) Ethereal central emerald bloom
        const coreBloom = ctx.createRadialGradient(
          centerX,
          centerY,
          20,
          centerX,
          centerY,
          Math.min(width, height) * 0.45
        );
        coreBloom.addColorStop(0, `rgba(16, 185, 129, ${0.16 * coreRevealedAlpha})`);
        coreBloom.addColorStop(0.4, `rgba(5, 150, 105, ${0.08 * coreRevealedAlpha})`);
        coreBloom.addColorStop(0.8, `rgba(6, 78, 59, ${0.03 * coreRevealedAlpha})`);
        coreBloom.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = coreBloom;
        ctx.fillRect(0, 0, width, height);

        // 2) 3D Rotating Holographic Code Rings
        holoRings.forEach((ring, idx) => {
          const ringAngle = frame * ring.speed;
          const ringPoints: { sx: number; sy: number; scale: number; char: string; alpha: number }[] = [];

          for (let g = 0; g < ring.glyphCount; g++) {
            const a = ringAngle + (g / ring.glyphCount) * Math.PI * 2;
            const rx = Math.cos(a) * ring.radius;
            const rz = Math.sin(a) * ring.radius;
            const ry = Math.sin(a * 2 + ring.axis) * 35;

            const proj = project(rx, ry, rz);
            if (!proj) continue;

            const char = MATRIX_CHARS[(g * 7 + (frame >> 4)) % MATRIX_CHARS.length];
            const distAlpha = Math.min(1, Math.max(0.15, 1 - proj.depth / 1100));
            ringPoints.push({
              sx: proj.sx,
              sy: proj.sy,
              scale: proj.scale,
              char,
              alpha: distAlpha * coreRevealedAlpha,
            });
          }

          // Draw orbital ring wire trace
          if (ringPoints.length > 2) {
            ctx.beginPath();
            ringPoints.forEach((pt, i) => {
              if (i === 0) ctx.moveTo(pt.sx, pt.sy);
              else ctx.lineTo(pt.sx, pt.sy);
            });
            ctx.closePath();
            ctx.strokeStyle = `rgba(52, 211, 153, ${0.12 * coreRevealedAlpha * (idx % 2 === 0 ? 1 : 0.7)})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }

          // Render glyphs along the ring
          ctx.font = '10px monospace';
          ringPoints.forEach((pt) => {
            ctx.fillStyle = `rgba(167, 243, 208, ${pt.alpha * 0.9})`;
            ctx.fillText(pt.char, pt.sx - 4, pt.sy + 3);
          });
        });

        // 3) Holographic Connected System Nodes (Construct Hex Nodes)
        hexNodes.forEach((node, nIdx) => {
          // Floating subtle node oscillation
          const oscY = Math.sin(frame * 0.02 + nIdx) * 12;
          const proj = project(node.x, node.y + oscY, node.z);
          if (!proj) return;

          const nodeAlpha = coreRevealedAlpha * Math.min(1, Math.max(0.2, 1 - proj.depth / 1000));
          const hexR = 14 * proj.scale;

          // Connecting lines to center core
          const centerProj = project(0, 0, 0);
          if (centerProj) {
            ctx.beginPath();
            ctx.moveTo(proj.sx, proj.sy);
            ctx.lineTo(centerProj.sx, centerProj.sy);
            ctx.strokeStyle = `rgba(16, 185, 129, ${0.18 * nodeAlpha})`;
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          // Draw futuristic hexagon
          ctx.beginPath();
          for (let s = 0; s < 6; s++) {
            const hAngle = (s / 6) * Math.PI * 2 + frame * 0.01;
            const hx = proj.sx + Math.cos(hAngle) * hexR;
            const hy = proj.sy + Math.sin(hAngle) * hexR;
            if (s === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
          }
          ctx.closePath();
          ctx.fillStyle = `rgba(6, 78, 59, ${0.35 * nodeAlpha})`;
          ctx.fill();
          ctx.strokeStyle = `rgba(52, 211, 153, ${0.85 * nodeAlpha})`;
          ctx.lineWidth = 1.2;
          ctx.stroke();

          // Node center pulse dot
          ctx.beginPath();
          ctx.arc(proj.sx, proj.sy, 2.5 * proj.scale, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * nodeAlpha})`;
          ctx.fill();

          // Node technical label & IP
          if (zoom > 0.35) {
            const labelAlpha = Math.min(1, (zoom - 0.35) / 0.4) * nodeAlpha;
            ctx.font = `${Math.max(9, Math.round(10 * proj.scale))}px monospace`;
            ctx.fillStyle = `rgba(209, 250, 229, ${labelAlpha})`;
            ctx.fillText(node.label, proj.sx + hexR + 6, proj.sy - 2);

            ctx.font = `${Math.max(8, Math.round(8.5 * proj.scale))}px monospace`;
            ctx.fillStyle = `rgba(52, 211, 153, ${labelAlpha * 0.8})`;
            ctx.fillText(`${node.ip} [${node.status}]`, proj.sx + hexR + 6, proj.sy + 10);
          }
        });

        // 4) Center "THE MATRIX ARCHITECTURE" Master Core Beacon
        const centerProj = project(0, 0, 0);
        if (centerProj) {
          const coreRadius = (32 + Math.sin(frame * 0.04) * 4) * centerProj.scale;
          const coreGlow = ctx.createRadialGradient(
            centerProj.sx,
            centerProj.sy,
            2,
            centerProj.sx,
            centerProj.sy,
            coreRadius * 2.8
          );
          coreGlow.addColorStop(0, `rgba(255, 255, 255, ${0.9 * coreRevealedAlpha})`);
          coreGlow.addColorStop(0.3, `rgba(52, 211, 153, ${0.75 * coreRevealedAlpha})`);
          coreGlow.addColorStop(0.7, `rgba(5, 150, 105, ${0.3 * coreRevealedAlpha})`);
          coreGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');

          ctx.fillStyle = coreGlow;
          ctx.beginPath();
          ctx.arc(centerProj.sx, centerProj.sy, coreRadius * 2.8, 0, Math.PI * 2);
          ctx.fill();

          // Inner rotating brackets
          const bracketAngle = frame * 0.02;
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 * coreRevealedAlpha})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(centerProj.sx, centerProj.sy, coreRadius * 0.85, bracketAngle, bracketAngle + Math.PI * 0.6);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(centerProj.sx, centerProj.sy, coreRadius * 0.85, bracketAngle + Math.PI, bracketAngle + Math.PI * 1.6);
          ctx.stroke();

          if (zoom > 0.45) {
            const masterAlpha = Math.min(1, (zoom - 0.45) / 0.45);
            ctx.font = 'bold 11px monospace';
            ctx.fillStyle = `rgba(255, 255, 255, ${masterAlpha})`;
            ctx.textAlign = 'center';
            ctx.fillText('ROOT://SYSTEM_MATRIX', centerProj.sx, centerProj.sy - coreRadius - 16);
            ctx.font = '9px monospace';
            ctx.fillStyle = `rgba(167, 243, 208, ${masterAlpha * 0.9})`;
            ctx.fillText('QUANTUM NEURAL TOPOLOGY ACTIVE', centerProj.sx, centerProj.sy - coreRadius - 4);
            ctx.textAlign = 'start';
          }
        }

        ctx.restore();
      }

      // -----------------------------------------------------------
      // LAYER 2: Cascading 3D Matrix Digital Rain Drops
      // Continuous falling characters with depth, speed, glowing heads & shimmering
      // -----------------------------------------------------------
      ctx.textAlign = 'center';

      drops.forEach((drop) => {
        // Advance stream downward
        drop.y += drop.speed * (1 + zoom * 0.4);

        // Wrap around when exiting bottom world bounds
        if (drop.y - drop.length * drop.fontSize > worldHeight) {
          drop.y = -worldHeight - Math.random() * 200;
          drop.x = (Math.random() - 0.5) * worldWidth;
          drop.z = (Math.random() - 0.5) * worldDepth;
          drop.speed = 2.2 + Math.random() * 4.5;
          drop.chars = createStreamChars(drop.length);
        }

        // Random character mutation for active digital rain effect
        if (frame - drop.lastMutate > drop.highlightInterval) {
          const mutateIdx = Math.floor(Math.random() * drop.length);
          drop.chars[mutateIdx] = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
          drop.lastMutate = frame;
        }

        // Project the head of the stream
        const headProj = project(drop.x, drop.y, drop.z);
        if (!headProj) return;

        // Depth fog / transparency
        const depthAlpha = Math.min(1, Math.max(0.12, 1 - (headProj.depth - 200) / 950));
        const effectiveFontSize = Math.max(8, Math.round(drop.fontSize * headProj.scale));

        ctx.font = `${effectiveFontSize}px monospace`;

        // Render characters trailing above the head
        const charSpacing = drop.fontSize * 1.15;
        for (let c = 0; c < drop.length; c++) {
          const cy = drop.y - c * charSpacing;
          const charProj = project(drop.x, cy, drop.z);
          if (!charProj) continue;

          // Head character is glowing white/bright pale emerald
          if (c === 0) {
            ctx.fillStyle = `rgba(255, 255, 255, ${0.98 * depthAlpha})`;
            ctx.shadowColor = '#34d399';
            ctx.shadowBlur = 10;
            ctx.fillText(drop.chars[c] || '0', charProj.sx, charProj.sy);
            ctx.shadowBlur = 0;
          } else if (c === 1) {
            ctx.fillStyle = `rgba(167, 243, 208, ${0.92 * depthAlpha})`;
            ctx.shadowColor = '#10b981';
            ctx.shadowBlur = 6;
            ctx.fillText(drop.chars[c] || '1', charProj.sx, charProj.sy);
            ctx.shadowBlur = 0;
          } else {
            // Body characters: fade from bright green to deep emerald/forest at the tail
            const tailRatio = 1 - c / drop.length; // [1..0]
            const charAlpha = tailRatio * depthAlpha * 0.85;

            if (tailRatio > 0.65) {
              ctx.fillStyle = `rgba(52, 211, 153, ${charAlpha})`;
            } else if (tailRatio > 0.3) {
              ctx.fillStyle = `rgba(16, 185, 129, ${charAlpha})`;
            } else {
              ctx.fillStyle = `rgba(5, 150, 105, ${charAlpha * 0.75})`;
            }

            ctx.fillText(drop.chars[c] || '*', charProj.sx, charProj.sy);
          }
        }
      });

      // -----------------------------------------------------------
      // LAYER 3: Scanline & Cyber CRT Overlay
      // -----------------------------------------------------------
      ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
      for (let y = 0; y < height; y += 4) {
        ctx.fillRect(0, y, width, 1.2);
      }
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-slate-950 overflow-hidden select-none"
      style={{
        background: 'radial-gradient(ellipse at center, #02140e 0%, #010a07 65%, #000403 100%)',
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

      {/* Futuristic Ambient Vignette */}
      <div className="absolute inset-0 bg-radial-gradient from-transparent via-slate-950/20 to-slate-950/80 pointer-events-none" />

      {/* Top HUD: Matrix Status & Scroll Guidance */}
      <div className="absolute top-6 left-6 right-6 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-slate-950/80 border border-emerald-500/30 backdrop-blur-md shadow-[0_0_15px_rgba(16,185,129,0.2)]">
          <Binary className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
          <span className="text-[11px] font-mono font-semibold tracking-wider text-emerald-300">
            MATRIX DIGITAL RAIN // PROTOCOL V4
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono">
            {zoomPercent > 40 ? (isEn ? 'CORE UNVEILED' : 'هسته فعال') : isEn ? 'ACTIVE STREAM' : 'جریان زنده'}
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-950/70 border border-white/10 text-[10px] font-mono text-emerald-300/80 backdrop-blur-md">
          <Terminal className="w-3 h-3 text-emerald-400" />
          <span>
            {isEn
              ? 'Scroll Wheel: Dive into Matrix Core Architecture'
              : 'اسکرول ماوس: نفوذ به درون معماری و هسته ماتریس'}
          </span>
        </div>
      </div>

      {/* Bottom HUD: Quick Scale Switcher & Zoom Slider */}
      <div className="absolute bottom-6 left-6 right-6 flex flex-wrap items-center justify-between gap-3">
        {/* Quick Mode Buttons */}
        <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-950/85 border border-emerald-500/20 backdrop-blur-md shadow-xl">
          <button
            type="button"
            onClick={() => handleSetZoomTarget(0)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              zoomPercent < 35
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Binary className="w-3.5 h-3.5" />
            <span>{isEn ? 'Matrix Rain Stream' : 'باران کدهای ماتریس'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleSetZoomTarget(0.85)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              zoomPercent >= 35
                ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 text-slate-950 font-black shadow-[0_0_15px_rgba(52,211,153,0.5)]'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>{isEn ? 'Matrix Core Architecture' : 'هسته معماری ماتریس'}</span>
          </button>
        </div>

        {/* Zoom Slider and Reset Controls */}
        <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-slate-950/85 border border-emerald-500/20 backdrop-blur-md shadow-xl">
          <button
            type="button"
            onClick={() => handleSetZoomTarget(targetZoomRef.current - 0.2)}
            title={isEn ? 'Zoom Out to Rain' : 'زوم به بیرون (باران)'}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5 text-emerald-400" />
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-emerald-400/80">
              {isEn ? 'Depth:' : 'عمق:'}
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={zoomPercent}
              onChange={(e) => handleSetZoomTarget(Number(e.target.value) / 100)}
              className="w-24 sm:w-32 accent-emerald-400 cursor-pointer h-1.5 bg-slate-900 rounded-lg"
            />
            <span className="text-[11px] font-mono text-emerald-300 w-9 text-right font-bold">
              {zoomPercent}%
            </span>
          </div>

          <button
            type="button"
            onClick={() => handleSetZoomTarget(targetZoomRef.current + 0.2)}
            title={isEn ? 'Zoom In to Core' : 'زوم به داخل (هسته)'}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5 text-emerald-400" />
          </button>

          <button
            type="button"
            onClick={() => resetMatrixRef.current?.()}
            title={isEn ? 'Reset Matrix View' : 'بازنشانی نمای ماتریس'}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white transition cursor-pointer border-l border-white/10 pl-2"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
