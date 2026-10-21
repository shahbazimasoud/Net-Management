import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../i18n';
import { GlobeThemeType } from './NetworkGlobe3D';
import { Layers, ZoomIn, ZoomOut, RotateCcw, Compass, Radio, Activity, Sparkles } from 'lucide-react';

interface Tesseract5DProps {
  theme?: GlobeThemeType;
}

interface Point4D {
  x: number;
  y: number;
  z: number;
  w: number;
}

interface Point3D {
  x: number;
  y: number;
  z: number;
}

interface MorseParticle {
  wireIndex: number;
  progress: number;
  speed: number;
  length: number;
  color: string;
  isDash: boolean;
}

interface DustMote {
  x: number;
  y: number;
  z: number;
  size: number;
  alpha: number;
  twinkleSpeed: number;
  driftX: number;
  driftY: number;
  driftZ: number;
}

// 16 vertices of a canonical 4D hypercube
const TESSERACT_BASE_VERTICES: Point4D[] = [];
for (let i = 0; i < 16; i++) {
  TESSERACT_BASE_VERTICES.push({
    x: (i & 1 ? 1 : -1),
    y: (i & 2 ? 1 : -1),
    z: (i & 4 ? 1 : -1),
    w: (i & 8 ? 1 : -1),
  });
}

// 32 edges connecting vertices that differ by exactly 1 bit
const TESSERACT_EDGES: [number, number][] = [];
for (let i = 0; i < 16; i++) {
  for (let bit = 1; bit <= 8; bit <<= 1) {
    const j = i ^ bit;
    if (j > i) {
      TESSERACT_EDGES.push([i, j]);
    }
  }
}

export const Tesseract5D: React.FC<Tesseract5DProps> = ({ theme = 'obsidian' }) => {
  const { isEn } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Camera & view controls
  const [zoom, setZoom] = useState<number>(1.1);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [hyperSpeed, setHyperSpeed] = useState<number>(1.0);
  const [morseActive, setMorseActive] = useState<boolean>(true);
  const [quantumTelemetry, setQuantumTelemetry] = useState<{
    dimCoords: string;
    gravStress: string;
    timelineFreq: string;
  }>({
    dimCoords: 't-4.188 / w+0.729',
    gravStress: '0.841 G-sec',
    timelineFreq: '432.06 THz',
  });

  const mouseRef = useRef<{
    isDragging: boolean;
    lastX: number;
    lastY: number;
    rotX: number;
    rotY: number;
  }>({
    isDragging: false,
    lastX: 0,
    lastY: 0,
    rotX: 0.28,
    rotY: -0.42,
  });

  // 4D rotation angles state
  const anglesRef = useRef<{
    angleXW: number;
    angleYW: number;
    angleZW: number;
    angleXY: number;
  }>({
    angleXW: 0,
    angleYW: 0,
    angleZW: 0,
    angleXY: 0,
  });

  // Dust motes and Morse signal particles
  const dustMotesRef = useRef<DustMote[]>([]);
  const morseParticlesRef = useRef<MorseParticle[]>([]);

  // Theme color palette selection
  const getThemePalette = (t: GlobeThemeType) => {
    switch (t) {
      case 'emerald':
        return {
          primary: '#10b981',
          primaryGlow: 'rgba(16, 185, 129, 0.45)',
          secondary: '#34d399',
          accent: '#6ee7b7',
          bgDeep: '#021e14',
          dustColor: '#a7f3d0',
          stringGlow: 'rgba(52, 211, 153, 0.25)',
          gridBg: 'rgba(16, 185, 129, 0.04)',
        };
      case 'cobalt':
        return {
          primary: '#0284c7',
          primaryGlow: 'rgba(2, 132, 199, 0.45)',
          secondary: '#38bdf8',
          accent: '#7dd3fc',
          bgDeep: '#041629',
          dustColor: '#bae6fd',
          stringGlow: 'rgba(56, 189, 248, 0.25)',
          gridBg: 'rgba(2, 132, 199, 0.04)',
        };
      case 'rose':
        return {
          primary: '#f43f5e',
          primaryGlow: 'rgba(244, 63, 94, 0.45)',
          secondary: '#fb7185',
          accent: '#fda4af',
          bgDeep: '#23030b',
          dustColor: '#fecdd3',
          stringGlow: 'rgba(251, 113, 133, 0.25)',
          gridBg: 'rgba(244, 63, 94, 0.04)',
        };
      case 'amber':
        return {
          primary: '#f59e0b',
          primaryGlow: 'rgba(245, 158, 11, 0.45)',
          secondary: '#fbbf24',
          accent: '#fde68a',
          bgDeep: '#211202',
          dustColor: '#fef3c7',
          stringGlow: 'rgba(251, 191, 36, 0.25)',
          gridBg: 'rgba(245, 158, 11, 0.04)',
        };
      case 'light':
        return {
          primary: '#4f46e5',
          primaryGlow: 'rgba(79, 70, 229, 0.35)',
          secondary: '#06b6d4',
          accent: '#0284c7',
          bgDeep: '#080c16',
          dustColor: '#c7d2fe',
          stringGlow: 'rgba(99, 102, 241, 0.25)',
          gridBg: 'rgba(79, 70, 229, 0.03)',
        };
      case 'google-dark':
        return {
          primary: '#8ab4f8',
          primaryGlow: 'rgba(138, 180, 248, 0.45)',
          secondary: '#81c995',
          accent: '#fdd663',
          bgDeep: '#10141d',
          dustColor: '#e8eaed',
          stringGlow: 'rgba(138, 180, 248, 0.25)',
          gridBg: 'rgba(138, 180, 248, 0.04)',
        };
      case 'obsidian':
      default:
        return {
          primary: '#6366f1',
          primaryGlow: 'rgba(99, 102, 241, 0.45)',
          secondary: '#38bdf8',
          accent: '#f59e0b',
          bgDeep: '#030712',
          dustColor: '#e0e7ff',
          stringGlow: 'rgba(56, 189, 248, 0.25)',
          gridBg: 'rgba(99, 102, 241, 0.04)',
        };
    }
  };

  const palette = getThemePalette(theme);

  // Initialize dust motes and Morse particles once
  useEffect(() => {
    const motes: DustMote[] = [];
    for (let i = 0; i < 160; i++) {
      motes.push({
        x: (Math.random() - 0.5) * 1400,
        y: (Math.random() - 0.5) * 1000,
        z: (Math.random() - 0.5) * 1200,
        size: Math.random() * 2.2 + 0.6,
        alpha: Math.random() * 0.6 + 0.2,
        twinkleSpeed: Math.random() * 0.03 + 0.01,
        driftX: (Math.random() - 0.5) * 0.35,
        driftY: (Math.random() - 0.5) * 0.35,
        driftZ: (Math.random() - 0.5) * 0.35,
      });
    }
    dustMotesRef.current = motes;

    // Morse signal particles for 4D edge transmissions
    const signals: MorseParticle[] = [];
    for (let i = 0; i < 28; i++) {
      signals.push({
        wireIndex: Math.floor(Math.random() * TESSERACT_EDGES.length),
        progress: Math.random(),
        speed: Math.random() * 0.008 + 0.004,
        length: Math.random() > 0.4 ? 0.22 : 0.08,
        color: Math.random() > 0.3 ? palette.secondary : palette.accent,
        isDash: Math.random() > 0.5,
      });
    }
    morseParticlesRef.current = signals;
  }, [theme]);

  // Main Canvas Render & Animation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animId: number;
    let frameCount = 0;

    const handleResize = () => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // 4D to 3D rotation matrix calculations
    const rotate4D = (v: Point4D, axw: number, ayw: number, azw: number, axy: number): Point4D => {
      // Rotation in XW plane
      let cos = Math.cos(axw);
      let sin = Math.sin(axw);
      let x1 = v.x * cos - v.w * sin;
      let w1 = v.x * sin + v.w * cos;

      // Rotation in YW plane
      cos = Math.cos(ayw);
      sin = Math.sin(ayw);
      let y1 = v.y * cos - w1 * sin;
      let w2 = v.y * sin + w1 * cos;

      // Rotation in ZW plane
      cos = Math.cos(azw);
      sin = Math.sin(azw);
      let z1 = v.z * cos - w2 * sin;
      let w3 = v.z * sin + w2 * cos;

      // Rotation in XY plane
      cos = Math.cos(axy);
      sin = Math.sin(axy);
      let x2 = x1 * cos - y1 * sin;
      let y2 = x1 * sin + y1 * cos;

      return { x: x2, y: y2, z: z1, w: w3 };
    };

    // 4D to 3D stereographic perspective projection
    const project4DTo3D = (v: Point4D, distance4D: number): Point3D => {
      const factor = distance4D / (distance4D - v.w);
      return {
        x: v.x * factor,
        y: v.y * factor,
        z: v.z * factor,
      };
    };

    // 3D camera rotation and 2D viewport projection
    const project3DTo2D = (
      p: Point3D,
      cx: number,
      cy: number,
      rotX: number,
      rotY: number,
      currentZoom: number,
      distCamera: number
    ): { x: number; y: number; scale: number; depth: number } => {
      // Rotate around Y
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const x1 = p.x * cosY + p.z * sinY;
      const z1 = -p.x * sinY + p.z * cosY;

      // Rotate around X
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const y2 = p.y * cosX - z1 * sinX;
      const z2 = p.y * sinX + z1 * cosX;

      // Perspective divide
      const zEff = z2 + distCamera;
      const scale = (distCamera / Math.max(zEff, 10)) * currentZoom;
      return {
        x: cx + x1 * scale,
        y: cy + y2 * scale,
        scale,
        depth: zEff,
      };
    };

    const render = () => {
      frameCount++;
      const width = canvas.width;
      const height = canvas.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cx = width / 2;
      const cy = height / 2;

      // Clear Canvas with rich interstellar cosmic gradient
      ctx.clearRect(0, 0, width, height);

      // Deep space atmospheric background
      const grad = ctx.createRadialGradient(cx, cy, 80 * dpr, cx, cy, Math.max(width, height) * 0.75);
      grad.addColorStop(0, palette.gridBg);
      grad.addColorStop(0.5, 'rgba(2, 6, 23, 0.4)');
      grad.addColorStop(1, 'rgba(1, 2, 8, 0.95)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Update 4D rotation angles
      if (autoRotate) {
        anglesRef.current.angleXW += 0.007 * hyperSpeed;
        anglesRef.current.angleYW += 0.005 * hyperSpeed;
        anglesRef.current.angleZW += 0.004 * hyperSpeed;
        anglesRef.current.angleXY += 0.002 * hyperSpeed;
        mouseRef.current.rotY += 0.0015;
      }

      const { angleXW, angleYW, angleZW, angleXY } = anglesRef.current;
      const { rotX, rotY } = mouseRef.current;

      // Update quantum telemetry every 60 frames
      if (frameCount % 60 === 0) {
        setQuantumTelemetry({
          dimCoords: `t-${(4.18 + Math.sin(frameCount * 0.02) * 0.35).toFixed(3)} / w+${(Math.cos(angleXW) * 0.92).toFixed(3)}`,
          gravStress: `${(0.82 + Math.abs(Math.sin(angleYW)) * 0.45).toFixed(3)} G-sec`,
          timelineFreq: `${(432.0 + Math.sin(angleZW) * 1.8).toFixed(2)} THz`,
        });
      }

      // Draw Infinite Bookshelf Matrix (Horizontal and Vertical Timelines)
      ctx.save();
      const numLines = 14;
      const gridSpacing = 75 * dpr * zoom;
      ctx.lineWidth = 1;

      for (let i = -numLines; i <= numLines; i++) {
        const offset = i * gridSpacing + ((frameCount * 0.4 * hyperSpeed) % gridSpacing);
        const alpha = Math.max(0, 0.22 - Math.abs(i) * 0.015);
        if (alpha <= 0) continue;

        // Vertical timeline light filaments
        ctx.strokeStyle = `rgba(56, 189, 248, ${alpha * 0.5})`;
        ctx.beginPath();
        ctx.moveTo(cx + offset, 0);
        ctx.lineTo(cx + offset, height);
        ctx.stroke();

        // Horizontal gravitational cross-beams
        ctx.strokeStyle = `rgba(245, 158, 11, ${alpha * 0.3})`;
        ctx.beginPath();
        ctx.moveTo(0, cy + offset);
        ctx.lineTo(width, cy + offset);
        ctx.stroke();
      }
      ctx.restore();

      // Render Floating Dust Motes (Quantum Information Particles)
      ctx.save();
      for (let i = 0; i < dustMotesRef.current.length; i++) {
        const mote = dustMotesRef.current[i];
        mote.x += mote.driftX * hyperSpeed;
        mote.y += mote.driftY * hyperSpeed;
        mote.z += mote.driftZ * hyperSpeed;

        if (mote.x > 700) mote.x = -700;
        if (mote.x < -700) mote.x = 700;
        if (mote.y > 500) mote.y = -500;
        if (mote.y < -500) mote.y = 500;
        if (mote.z > 600) mote.z = -600;
        if (mote.z < -600) mote.z = 600;

        const proj = project3DTo2D(mote, cx, cy, rotX, rotY, zoom, 900);
        if (proj.x >= 0 && proj.x <= width && proj.y >= 0 && proj.y <= height) {
          const currentAlpha = mote.alpha * (0.6 + 0.4 * Math.sin(frameCount * mote.twinkleSpeed));
          ctx.fillStyle = palette.dustColor;
          ctx.globalAlpha = Math.min(1, Math.max(0, currentAlpha));
          ctx.beginPath();
          ctx.arc(proj.x, proj.y, mote.size * proj.scale * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // Calculate 3D and 2D coordinates for Tesseract vertices
      // Multiple nested hypercubes to simulate depth in the 5th dimension
      const tesseractScales = [160 * dpr, 90 * dpr, 240 * dpr];

      tesseractScales.forEach((tScale, layerIdx) => {
        const layerAlpha = layerIdx === 0 ? 1 : layerIdx === 1 ? 0.65 : 0.28;
        const projected2DVertices: { x: number; y: number; scale: number; depth: number }[] = [];

        // Project 16 vertices of hypercube
        for (let i = 0; i < TESSERACT_BASE_VERTICES.length; i++) {
          const base = TESSERACT_BASE_VERTICES[i];
          const rotated4D = rotate4D(
            { x: base.x * tScale, y: base.y * tScale, z: base.z * tScale, w: base.w * tScale },
            angleXW + layerIdx * 0.35,
            angleYW + layerIdx * 0.25,
            angleZW,
            angleXY
          );
          const p3D = project4DTo3D(rotated4D, 3.8);
          const p2D = project3DTo2D(p3D, cx, cy, rotX, rotY, zoom, 850);
          projected2DVertices.push(p2D);
        }

        // Render 32 Tesseract Edges (Gravitational Filaments)
        ctx.save();
        for (let e = 0; e < TESSERACT_EDGES.length; e++) {
          const [u, v] = TESSERACT_EDGES[e];
          const p1 = projected2DVertices[u];
          const p2 = projected2DVertices[v];

          if (!p1 || !p2) continue;

          // Depth-based intensity
          const avgDepth = (p1.depth + p2.depth) / 2;
          const depthAlpha = Math.max(0.12, Math.min(0.95, 1200 / avgDepth)) * layerAlpha;

          // Outer glow for primary filaments
          ctx.strokeStyle = palette.primaryGlow;
          ctx.lineWidth = (layerIdx === 0 ? 3.5 : 2.0) * dpr;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();

          // Core crisp light filament
          ctx.strokeStyle = layerIdx === 0 ? palette.accent : palette.secondary;
          ctx.globalAlpha = depthAlpha;
          ctx.lineWidth = (layerIdx === 0 ? 1.6 : 1.0) * dpr;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
        ctx.restore();

        // Render Vertices (Quantum Coordinate Nodes)
        if (layerIdx === 0) {
          ctx.save();
          for (let v = 0; v < projected2DVertices.length; v++) {
            const p = projected2DVertices[v];
            const radius = Math.max(2.5, 4.5 * p.scale) * dpr;

            // Node halo glow
            const nodeGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 3.5);
            nodeGrad.addColorStop(0, palette.accent);
            nodeGrad.addColorStop(0.4, palette.primaryGlow);
            nodeGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = nodeGrad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, radius * 3.5, 0, Math.PI * 2);
            ctx.fill();

            // Node center core
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(p.x, p.y, radius * 0.9, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        // Render Gravitational Morse Code Pulses (Data Packets across Time)
        if (layerIdx === 0 && morseActive) {
          ctx.save();
          for (let s = 0; s < morseParticlesRef.current.length; s++) {
            const sig = morseParticlesRef.current[s];
            sig.progress += sig.speed * hyperSpeed;
            if (sig.progress > 1) {
              sig.progress = 0;
              sig.wireIndex = Math.floor(Math.random() * TESSERACT_EDGES.length);
            }

            const [u, v] = TESSERACT_EDGES[sig.wireIndex];
            const p1 = projected2DVertices[u];
            const p2 = projected2DVertices[v];
            if (!p1 || !p2) continue;

            const t = sig.progress;
            const px = p1.x + (p2.x - p1.x) * t;
            const py = p1.y + (p2.y - p1.y) * t;

            const packetLen = sig.isDash ? 18 * dpr : 7 * dpr;
            const dx = (p2.x - p1.x);
            const dy = (p2.y - p1.y);
            const dist = Math.hypot(dx, dy) || 1;
            const nx = dx / dist;
            const ny = dy / dist;

            // Glowing pulse beam
            ctx.strokeStyle = sig.color;
            ctx.lineWidth = 3.2 * dpr;
            ctx.lineCap = 'round';
            ctx.shadowColor = sig.color;
            ctx.shadowBlur = 12 * dpr;
            ctx.beginPath();
            ctx.moveTo(px - nx * packetLen, py - ny * packetLen);
            ctx.lineTo(px, py);
            ctx.stroke();
            ctx.shadowBlur = 0;
          }
          ctx.restore();
        }
      });

      // Render Central Gravitational Singularity Core
      ctx.save();
      const coreRadius = (32 + 6 * Math.sin(frameCount * 0.05)) * dpr * zoom;
      const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius * 3);
      coreGlow.addColorStop(0, '#ffffff');
      coreGlow.addColorStop(0.2, palette.accent);
      coreGlow.addColorStop(0.5, palette.primaryGlow);
      coreGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = coreGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, [palette, zoom, autoRotate, hyperSpeed, morseActive]);

  // Pointer interactions for 3D rotation
  const handlePointerDown = (e: React.PointerEvent) => {
    mouseRef.current.isDragging = true;
    mouseRef.current.lastX = e.clientX;
    mouseRef.current.lastY = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!mouseRef.current.isDragging) return;
    const dx = e.clientX - mouseRef.current.lastX;
    const dy = e.clientY - mouseRef.current.lastY;
    mouseRef.current.lastX = e.clientX;
    mouseRef.current.lastY = e.clientY;

    mouseRef.current.rotY += dx * 0.005;
    mouseRef.current.rotX = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, mouseRef.current.rotX + dy * 0.005));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    mouseRef.current.isDragging = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (err) {}
  };

  // Zoom with scroll wheel
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((prev) => Math.max(0.5, Math.min(2.4, prev + delta)));
  };

  const handleResetCamera = () => {
    setZoom(1.1);
    setHyperSpeed(1.0);
    mouseRef.current.rotX = 0.28;
    mouseRef.current.rotY = -0.42;
  };

  return (
    <div className="relative w-full h-full overflow-hidden select-none bg-slate-950">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        className="w-full h-full block cursor-grab active:cursor-grabbing"
      />

      {/* Top Cybernetic HUD - Interstellar 5D Quantum Coordinates */}
      <div className="absolute top-4 left-4 z-20 pointer-events-none flex flex-col gap-1.5 font-mono text-[11px] backdrop-blur-md bg-slate-950/70 border border-cyan-500/30 rounded-lg p-2.5 text-cyan-300 shadow-xl max-w-xs">
        <div className="flex items-center justify-between border-b border-cyan-500/20 pb-1">
          <div className="flex items-center gap-1.5 font-bold text-white tracking-wider text-xs">
            <Layers className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span>{isEn ? '5D TESSERACT MATRIX' : 'ماتریس ۵ بعدی تسراکت'}</span>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/40">
            {isEn ? 'KIP THORNE' : 'کیپ تورن'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-slate-300 pt-0.5">
          <div>
            <span className="text-slate-400">{isEn ? 'Coordinates:' : 'مختصات بعد:'}</span>
          </div>
          <div className="text-right rtl:text-left text-amber-300 font-semibold">{quantumTelemetry.dimCoords}</div>

          <div>
            <span className="text-slate-400">{isEn ? 'Grav Stress:' : 'تنش گرانشی:'}</span>
          </div>
          <div className="text-right rtl:text-left text-emerald-400 font-semibold">{quantumTelemetry.gravStress}</div>

          <div>
            <span className="text-slate-400">{isEn ? 'Timeline Freq:' : 'فرکانس زمان:'}</span>
          </div>
          <div className="text-right rtl:text-left text-cyan-300 font-semibold">{quantumTelemetry.timelineFreq}</div>
        </div>
      </div>

      {/* Bottom Interactive Control Dock */}
      <div className="absolute bottom-4 right-4 rtl:right-auto rtl:left-4 z-20 flex items-center gap-1.5 p-1.5 rounded-xl backdrop-blur-md bg-slate-950/75 border border-white/15 text-slate-300 shadow-2xl">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(2.4, z + 0.15))}
          title={isEn ? 'Zoom In (or use mouse scroll)' : 'بزرگنمایی (یا اسکرول ماوس)'}
          className="p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition cursor-pointer"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))}
          title={isEn ? 'Zoom Out (or use mouse scroll)' : 'کوچک‌نمایی (یا اسکرول ماوس)'}
          className="p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition cursor-pointer"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <div className="h-4 w-[1px] bg-white/20 mx-0.5" />

        <button
          type="button"
          onClick={() => setAutoRotate((r) => !r)}
          title={isEn ? (autoRotate ? 'Pause 4D Spin' : 'Resume 4D Spin') : (autoRotate ? 'توقف چرخش ۴ بعدی' : 'ادامه چرخش ۴ بعدی')}
          className={`p-1.5 rounded-lg transition cursor-pointer ${
            autoRotate ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40' : 'hover:bg-white/10 hover:text-white'
          }`}
        >
          <Compass className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => setMorseActive((m) => !m)}
          title={isEn ? (morseActive ? 'Disable Morse Pulses' : 'Enable Morse Pulses') : (morseActive ? 'غیرفعال‌سازی امواج مورس' : 'فعال‌سازی امواج مورس')}
          className={`p-1.5 rounded-lg transition cursor-pointer ${
            morseActive ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40' : 'hover:bg-white/10 hover:text-white'
          }`}
        >
          <Radio className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => setHyperSpeed((s) => (s >= 2.0 ? 0.5 : s + 0.5))}
          title={isEn ? `Time Warp Speed: ${hyperSpeed}x` : `سرعت جریان زمان: ${hyperSpeed}x`}
          className="px-2 py-1 text-[11px] font-mono rounded-lg hover:bg-white/10 hover:text-white transition cursor-pointer font-bold"
        >
          {hyperSpeed}x
        </button>

        <div className="h-4 w-[1px] bg-white/20 mx-0.5" />

        <button
          type="button"
          onClick={handleResetCamera}
          title={isEn ? 'Reset Perspective' : 'بازنشانی زاویه دید'}
          className="p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Floating Morse Code Hint (Murph / STAY) */}
      <div className="absolute bottom-4 left-4 rtl:left-auto rtl:right-4 z-10 pointer-events-none hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-950/60 border border-amber-500/30 text-amber-300/90 font-mono text-[11px] backdrop-blur-sm">
        <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin" />
        <span>{isEn ? 'MORSE SIGNAL: ••• — ••— ••— (STAY)' : 'سیگنال مورس: ••• — ••— ••— (STAY)'}</span>
      </div>
    </div>
  );
};
