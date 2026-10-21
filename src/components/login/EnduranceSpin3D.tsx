import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../i18n';
import { GlobeThemeType } from './NetworkGlobe3D';
import { RotateCcw, ZoomIn, ZoomOut, Compass, Flame, Crosshair, Radio, Sparkles, Activity } from 'lucide-react';

interface EnduranceSpin3DProps {
  theme?: GlobeThemeType;
}

interface ThrusterParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

interface StarTrail {
  x: number;
  y: number;
  z: number;
  baseAlpha: number;
  length: number;
}

export const EnduranceSpin3D: React.FC<EnduranceSpin3DProps> = ({ theme = 'obsidian' }) => {
  const { isEn } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Flight dynamics & simulation state
  const [zoom, setZoom] = useState<number>(1.05);
  const [spinMode, setSpinMode] = useState<'emergency_68rpm' | 'cruise_orbit' | 'manual_rcs'>('emergency_68rpm');
  const [rpmDisplay, setRpmDisplay] = useState<number>(67.8);
  const [dockingStatus, setDockingStatus] = useState<'MATCHING' | 'LOCKED' | 'ALIGNING'>('MATCHING');
  const [thrusterActive, setThrusterActive] = useState<boolean>(true);

  const mouseRef = useRef<{
    isDragging: boolean;
    lastX: number;
    lastY: number;
    camRotX: number;
    camRotY: number;
  }>({
    isDragging: false,
    lastX: 0,
    lastY: 0,
    camRotX: 0.38,
    camRotY: -0.25,
  });

  const angleRef = useRef<number>(0);
  const angularVelRef = useRef<number>(0.075); // corresponds to 68 RPM visual pacing
  const thrusterParticlesRef = useRef<ThrusterParticle[]>([]);
  const starsRef = useRef<StarTrail[]>([]);

  // Theme palettes
  const getThemePalette = (t: GlobeThemeType) => {
    switch (t) {
      case 'emerald':
        return {
          spaceBg: '#021e14',
          planetIce: '#064e3b',
          planetAtmosphere: 'rgba(52, 211, 153, 0.25)',
          hullPrimary: '#e2e8f0',
          hullAccent: '#10b981',
          hullDark: '#0f172a',
          thrusterFlame: '#34d399',
          thrusterGlow: 'rgba(52, 211, 153, 0.65)',
          hudColor: '#10b981',
          hudBorder: 'rgba(16, 185, 129, 0.35)',
        };
      case 'cobalt':
        return {
          spaceBg: '#041629',
          planetIce: '#0c4a6e',
          planetAtmosphere: 'rgba(56, 189, 248, 0.25)',
          hullPrimary: '#f1f5f9',
          hullAccent: '#0284c7',
          hullDark: '#0f172a',
          thrusterFlame: '#38bdf8',
          thrusterGlow: 'rgba(56, 189, 248, 0.65)',
          hudColor: '#38bdf8',
          hudBorder: 'rgba(2, 132, 199, 0.35)',
        };
      case 'rose':
        return {
          spaceBg: '#23030b',
          planetIce: '#4c0519',
          planetAtmosphere: 'rgba(251, 113, 133, 0.25)',
          hullPrimary: '#fff1f2',
          hullAccent: '#f43f5e',
          hullDark: '#1e293b',
          thrusterFlame: '#fb7185',
          thrusterGlow: 'rgba(244, 63, 94, 0.65)',
          hudColor: '#f43f5e',
          hudBorder: 'rgba(244, 63, 94, 0.35)',
        };
      case 'amber':
        return {
          spaceBg: '#211202',
          planetIce: '#451a03',
          planetAtmosphere: 'rgba(251, 191, 36, 0.25)',
          hullPrimary: '#fef3c7',
          hullAccent: '#f59e0b',
          hullDark: '#1e293b',
          thrusterFlame: '#fbbf24',
          thrusterGlow: 'rgba(245, 158, 11, 0.65)',
          hudColor: '#f59e0b',
          hudBorder: 'rgba(245, 158, 11, 0.35)',
        };
      case 'light':
        return {
          spaceBg: '#080c18',
          planetIce: '#1e3a8a',
          planetAtmosphere: 'rgba(96, 165, 250, 0.25)',
          hullPrimary: '#ffffff',
          hullAccent: '#4f46e5',
          hullDark: '#0f172a',
          thrusterFlame: '#60a5fa',
          thrusterGlow: 'rgba(99, 102, 241, 0.65)',
          hudColor: '#60a5fa',
          hudBorder: 'rgba(79, 70, 229, 0.35)',
        };
      case 'google-dark':
        return {
          spaceBg: '#10141d',
          planetIce: '#1e293b',
          planetAtmosphere: 'rgba(138, 180, 248, 0.25)',
          hullPrimary: '#e8eaed',
          hullAccent: '#8ab4f8',
          hullDark: '#0f172a',
          thrusterFlame: '#fdd663',
          thrusterGlow: 'rgba(253, 214, 99, 0.65)',
          hudColor: '#8ab4f8',
          hudBorder: 'rgba(138, 180, 248, 0.35)',
        };
      case 'obsidian':
      default:
        return {
          spaceBg: '#020617',
          planetIce: '#0f172a',
          planetAtmosphere: 'rgba(56, 189, 248, 0.22)',
          hullPrimary: '#f8fafc',
          hullAccent: '#0284c7',
          hullDark: '#090d16',
          thrusterFlame: '#38bdf8',
          thrusterGlow: 'rgba(56, 189, 248, 0.7)',
          hudColor: '#38bdf8',
          hudBorder: 'rgba(56, 189, 248, 0.35)',
        };
    }
  };

  const palette = getThemePalette(theme);

  // Initialize starfield
  useEffect(() => {
    const stars: StarTrail[] = [];
    for (let i = 0; i < 160; i++) {
      stars.push({
        x: (Math.random() - 0.5) * 1600,
        y: (Math.random() - 0.5) * 1200,
        z: (Math.random() - 0.5) * 1400,
        baseAlpha: Math.random() * 0.7 + 0.3,
        length: Math.random() * 8 + 3,
      });
    }
    starsRef.current = stars;
  }, []);

  // Update target angular velocity based on spin mode
  useEffect(() => {
    if (spinMode === 'emergency_68rpm') {
      angularVelRef.current = 0.075;
      setRpmDisplay(67.8);
      setDockingStatus('MATCHING');
    } else if (spinMode === 'cruise_orbit') {
      angularVelRef.current = 0.012;
      setRpmDisplay(4.2);
      setDockingStatus('LOCKED');
    } else {
      angularVelRef.current = 0.035;
      setRpmDisplay(31.5);
      setDockingStatus('ALIGNING');
    }
  }, [spinMode]);

  // Main Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animId: number;
    let frame = 0;

    const handleResize = () => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // 3D Point projection helper
    const project3D = (
      x: number,
      y: number,
      z: number,
      cx: number,
      cy: number,
      rotX: number,
      rotY: number,
      curZoom: number
    ) => {
      // Rotate around Y
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const x1 = x * cosY + z * sinY;
      const z1 = -x * sinY + z * cosY;

      // Rotate around X
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const y2 = y * cosX - z1 * sinX;
      const z2 = y * sinX + z1 * cosX;

      const cameraDist = 850;
      const zEff = z2 + cameraDist;
      const scale = (cameraDist / Math.max(zEff, 10)) * curZoom;

      return {
        x: cx + x1 * scale,
        y: cy + y2 * scale,
        scale,
        depth: zEff,
      };
    };

    const render = () => {
      frame++;
      angleRef.current += angularVelRef.current;
      const angle = angleRef.current;

      const width = canvas.width;
      const height = canvas.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cx = width / 2;
      const cy = height / 2;

      ctx.clearRect(0, 0, width, height);

      const { camRotX, camRotY } = mouseRef.current;

      // 1. Deep Space Atmospheric Background with Solar Glare
      const spaceGrad = ctx.createRadialGradient(cx, cy, 100 * dpr, cx, cy, Math.max(width, height) * 0.85);
      spaceGrad.addColorStop(0, '#040b19');
      spaceGrad.addColorStop(0.6, palette.spaceBg);
      spaceGrad.addColorStop(1, '#000206');
      ctx.fillStyle = spaceGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Mann's Frozen Planet in Lower Background
      const planetY = height * 0.88;
      const planetRadius = width * 0.72;
      const planetGrad = ctx.createRadialGradient(cx, planetY, planetRadius * 0.4, cx, planetY, planetRadius);
      planetGrad.addColorStop(0, '#1e293b');
      planetGrad.addColorStop(0.7, palette.planetIce);
      planetGrad.addColorStop(0.95, '#020617');
      planetGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = planetGrad;
      ctx.beginPath();
      ctx.arc(cx, planetY, planetRadius, 0, Math.PI * 2);
      ctx.fill();

      // Atmospheric Glow on Horizon
      ctx.strokeStyle = palette.planetAtmosphere;
      ctx.lineWidth = 14 * dpr;
      ctx.beginPath();
      ctx.arc(cx, planetY, planetRadius, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();

      // 3. Dynamic Rotating Star Trails (Reflecting rotational velocity)
      ctx.save();
      const streakLength = angularVelRef.current * 180 * dpr;
      for (let i = 0; i < starsRef.current.length; i++) {
        const star = starsRef.current[i];
        const proj = project3D(star.x, star.y, star.z, cx, cy, camRotX, camRotY, zoom);
        if (proj.x >= 0 && proj.x <= width && proj.y >= 0 && proj.y <= height) {
          ctx.strokeStyle = '#ffffff';
          ctx.globalAlpha = star.baseAlpha * 0.8;
          ctx.lineWidth = 1.2 * dpr;
          ctx.beginPath();
          ctx.moveTo(proj.x, proj.y);
          ctx.lineTo(proj.x - Math.sin(angle) * streakLength, proj.y + Math.cos(angle) * streakLength);
          ctx.stroke();
        }
      }
      ctx.restore();

      // 4. Render Endurance Ring Spacecraft (12 Module Polygon)
      const ringRadius = 180 * dpr;
      const numModules = 12;

      // Project Central Hub
      const hubCenter = project3D(0, 0, 0, cx, cy, camRotX, camRotY, zoom);

      // Draw Central Hexagonal Truss & Docking Collar
      ctx.save();
      ctx.fillStyle = palette.hullDark;
      ctx.strokeStyle = palette.hullPrimary;
      ctx.lineWidth = 2.4 * dpr;

      const hubRadius = 32 * dpr * hubCenter.scale;
      ctx.beginPath();
      for (let h = 0; h < 6; h++) {
        const hAngle = angle + (h * Math.PI) / 3;
        const hx = hubCenter.x + Math.cos(hAngle) * hubRadius;
        const hy = hubCenter.y + Math.sin(hAngle) * hubRadius;
        if (h === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Docking Port Center Reticle
      ctx.strokeStyle = palette.hudColor;
      ctx.lineWidth = 1.6 * dpr;
      ctx.beginPath();
      ctx.arc(hubCenter.x, hubCenter.y, 14 * dpr * hubCenter.scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Store projected module positions for spokes and thrusters
      const projectedModules: {
        x: number;
        y: number;
        z: number;
        scale: number;
        depth: number;
        modAngle: number;
        index: number;
      }[] = [];

      for (let i = 0; i < numModules; i++) {
        const modAngle = angle + (i * 2 * Math.PI) / numModules;
        const mx = Math.cos(modAngle) * ringRadius;
        const my = Math.sin(modAngle) * ringRadius;
        const mz = 0;

        const proj = project3D(mx, my, mz, cx, cy, camRotX, camRotY, zoom);
        projectedModules.push({
          x: proj.x,
          y: proj.y,
          z: mz,
          scale: proj.scale,
          depth: proj.depth,
          modAngle,
          index: i,
        });
      }

      // Sort modules by depth to render back-to-front
      const sortedIndices = [...projectedModules.keys()].sort(
        (a, b) => projectedModules[b].depth - projectedModules[a].depth
      );

      // Draw Structural Tubular Ring Spokes
      ctx.save();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = 2.2 * dpr;
      for (let i = 0; i < numModules; i++) {
        const mod = projectedModules[i];
        ctx.beginPath();
        ctx.moveTo(hubCenter.x, hubCenter.y);
        ctx.lineTo(mod.x, mod.y);
        ctx.stroke();

        // Perimeter connect ring to next module
        const nextMod = projectedModules[(i + 1) % numModules];
        ctx.strokeStyle = palette.hullPrimary;
        ctx.lineWidth = 3.2 * dpr;
        ctx.beginPath();
        ctx.moveTo(mod.x, mod.y);
        ctx.lineTo(nextMod.x, nextMod.y);
        ctx.stroke();
      }
      ctx.restore();

      // Draw the 12 Habitat & Laboratory Modules
      sortedIndices.forEach((idx) => {
        const mod = projectedModules[idx];
        const modWidth = 36 * dpr * mod.scale;
        const modHeight = 22 * dpr * mod.scale;

        ctx.save();
        ctx.translate(mod.x, mod.y);
        ctx.rotate(mod.modAngle + Math.PI / 2);

        // Module Body with metallic bevel
        ctx.fillStyle = idx % 2 === 0 ? palette.hullPrimary : '#cbd5e1';
        ctx.strokeStyle = palette.hullDark;
        ctx.lineWidth = 1.8 * dpr;

        ctx.beginPath();
        ctx.roundRect(-modWidth / 2, -modHeight / 2, modWidth, modHeight, 4 * dpr);
        ctx.fill();
        ctx.stroke();

        // Solar Array / Heat Radiator strip on outer rim
        ctx.fillStyle = palette.hullAccent;
        ctx.fillRect(-modWidth * 0.38, -modHeight / 2 - 3 * dpr, modWidth * 0.76, 3 * dpr);

        // Habitat Observation Windows
        ctx.fillStyle = '#0284c7';
        for (let w = -2; w <= 2; w++) {
          ctx.fillRect(w * 4.5 * dpr - 1.2 * dpr, -modHeight * 0.15, 2.4 * dpr, 2.4 * dpr);
        }

        ctx.restore();

        // 5. Fire Reaction Control Thruster (RCS) Plasma Puffs on key modules
        if (thrusterActive && (idx === 0 || idx === 3 || idx === 6 || idx === 9)) {
          if (frame % 3 === 0 && thrusterParticlesRef.current.length < 120) {
            const tangentAngle = mod.modAngle + Math.PI / 2;
            thrusterParticlesRef.current.push({
              x: mod.x + Math.cos(mod.modAngle) * 16 * dpr,
              y: mod.y + Math.sin(mod.modAngle) * 16 * dpr,
              z: 0,
              vx: Math.cos(tangentAngle) * (4.5 + Math.random() * 2) * dpr,
              vy: Math.sin(tangentAngle) * (4.5 + Math.random() * 2) * dpr,
              vz: 0,
              size: Math.random() * 3.5 + 1.2,
              color: palette.thrusterFlame,
              alpha: 0.9,
              life: 0,
              maxLife: 22,
            });
          }
        }
      });

      // Render RCS Plasma Particles
      ctx.save();
      for (let p = thrusterParticlesRef.current.length - 1; p >= 0; p--) {
        const pt = thrusterParticlesRef.current[p];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.life++;
        pt.alpha = Math.max(0, 1 - pt.life / pt.maxLife);

        if (pt.life >= pt.maxLife) {
          thrusterParticlesRef.current.splice(p, 1);
          continue;
        }

        ctx.fillStyle = pt.color;
        ctx.shadowColor = palette.thrusterFlame;
        ctx.shadowBlur = 8 * dpr;
        ctx.globalAlpha = pt.alpha;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.restore();

      // 6. Tactical Flight HUD Overlay - Docking Alignment Crosshairs
      ctx.save();
      const crosshairRadius = 75 * dpr;
      ctx.strokeStyle = palette.hudBorder;
      ctx.lineWidth = 1.2 * dpr;
      ctx.setLineDash([6 * dpr, 6 * dpr]);
      ctx.beginPath();
      ctx.arc(hubCenter.x, hubCenter.y, crosshairRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Pitch / Yaw Reticle brackets
      const bracketLen = 16 * dpr;
      ctx.strokeStyle = palette.hudColor;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      // Top bracket
      ctx.moveTo(hubCenter.x - bracketLen, hubCenter.y - crosshairRadius);
      ctx.lineTo(hubCenter.x + bracketLen, hubCenter.y - crosshairRadius);
      // Bottom bracket
      ctx.moveTo(hubCenter.x - bracketLen, hubCenter.y + crosshairRadius);
      ctx.lineTo(hubCenter.x + bracketLen, hubCenter.y + crosshairRadius);
      // Left bracket
      ctx.moveTo(hubCenter.x - crosshairRadius, hubCenter.y - bracketLen);
      ctx.lineTo(hubCenter.x - crosshairRadius, hubCenter.y + bracketLen);
      // Right bracket
      ctx.moveTo(hubCenter.x + crosshairRadius, hubCenter.y - bracketLen);
      ctx.lineTo(hubCenter.x + crosshairRadius, hubCenter.y + bracketLen);
      ctx.stroke();
      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, [palette, zoom, thrusterActive]);

  // Pointer interactions for orbital camera rotation
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

    mouseRef.current.camRotY += dx * 0.005;
    mouseRef.current.camRotX = Math.max(-Math.PI / 2.3, Math.min(Math.PI / 2.3, mouseRef.current.camRotX + dy * 0.005));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    mouseRef.current.isDragging = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (err) {}
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => Math.max(0.6, Math.min(2.2, z + delta)));
  };

  const handleManualRcsBurst = () => {
    angularVelRef.current += 0.015;
    setRpmDisplay((r) => Number((r + 4.5).toFixed(1)));
    setThrusterActive(true);
  };

  const handleReset = () => {
    setZoom(1.05);
    setSpinMode('emergency_68rpm');
    mouseRef.current.camRotX = 0.38;
    mouseRef.current.camRotY = -0.25;
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

      {/* Top Left Flight Dynamics & Docking Telemetry HUD */}
      <div className="absolute top-4 left-4 z-20 pointer-events-none flex flex-col gap-1.5 font-mono text-[11px] backdrop-blur-md bg-slate-950/75 border border-sky-500/30 rounded-lg p-2.5 text-sky-300 shadow-xl max-w-xs">
        <div className="flex items-center justify-between border-b border-sky-500/20 pb-1">
          <div className="flex items-center gap-1.5 font-bold text-white tracking-wider text-xs">
            <Compass className="w-3.5 h-3.5 text-sky-400 animate-spin" />
            <span>{isEn ? 'ENDURANCE DOCKING MANEUVER' : 'مانور اتصال ایندورنس'}</span>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-semibold border border-sky-500/40">
            {spinMode === 'emergency_68rpm' ? '68 RPM' : spinMode === 'cruise_orbit' ? 'CRUISE' : 'RCS LOCK'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-slate-300 pt-0.5">
          <div>
            <span className="text-slate-400">{isEn ? 'Rotational Speed:' : 'سرعت زاویه‌ای:'}</span>
          </div>
          <div className="text-right rtl:text-left text-amber-300 font-bold">{rpmDisplay} RPM</div>

          <div>
            <span className="text-slate-400">{isEn ? 'Target Latch:' : 'قفل داکینگ:'}</span>
          </div>
          <div className="text-right rtl:text-left text-emerald-400 font-bold tracking-wider">
            {dockingStatus === 'MATCHING'
              ? (isEn ? 'MATCHING 99.4%' : 'انطباق ۹۹.۴٪')
              : dockingStatus === 'LOCKED'
              ? (isEn ? 'SECURED / LOCKED' : 'قفل تثبیت شد')
              : (isEn ? 'ALIGNING VECTOR' : 'تنظیم بردار')}
          </div>

          <div>
            <span className="text-slate-400">{isEn ? 'RCS Thrusters:' : 'رانشگرهای واکنشی:'}</span>
          </div>
          <div className="text-right rtl:text-left text-cyan-300 font-semibold">
            {thrusterActive ? (isEn ? 'ACTIVE BURST' : 'پالس فعال') : (isEn ? 'STANDBY' : 'آماده‌باش')}
          </div>
        </div>
      </div>

      {/* Bottom Interactive Control Dock */}
      <div className="absolute bottom-4 right-4 rtl:right-auto rtl:left-4 z-20 flex items-center gap-1.5 p-1.5 rounded-xl backdrop-blur-md bg-slate-950/75 border border-white/15 text-slate-300 shadow-2xl">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(2.2, z + 0.15))}
          title={isEn ? 'Zoom In' : 'بزرگنمایی'}
          className="p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition cursor-pointer"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.6, z - 0.15))}
          title={isEn ? 'Zoom Out' : 'کوچک‌نمایی'}
          className="p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition cursor-pointer"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <div className="h-4 w-[1px] bg-white/20 mx-0.5" />

        {/* Spin Mode Toggle */}
        <button
          type="button"
          onClick={() => {
            setSpinMode((m) =>
              m === 'emergency_68rpm' ? 'cruise_orbit' : m === 'cruise_orbit' ? 'manual_rcs' : 'emergency_68rpm'
            );
          }}
          title={isEn ? 'Switch Spin Mode' : 'تغییر سرعت چرخش ژیروسکوپی'}
          className="px-2 py-1 text-[11px] font-mono rounded-lg bg-sky-600/30 text-sky-300 border border-sky-500/40 hover:bg-sky-600/50 transition cursor-pointer font-bold uppercase"
        >
          {spinMode === 'emergency_68rpm' ? '68 RPM' : spinMode === 'cruise_orbit' ? '4 RPM' : 'MANUAL'}
        </button>

        {/* Manual Thruster Burst */}
        <button
          type="button"
          onClick={handleManualRcsBurst}
          title={isEn ? 'Fire RCS Thruster Burst' : 'شلیک پالس رانشگر واکنشی'}
          className="p-1.5 rounded-lg hover:bg-white/10 hover:text-amber-300 transition cursor-pointer text-amber-400"
        >
          <Flame className="w-4 h-4" />
        </button>

        <div className="h-4 w-[1px] bg-white/20 mx-0.5" />

        <button
          type="button"
          onClick={handleReset}
          title={isEn ? 'Reset Perspective' : 'بازنشانی زاویه دید'}
          className="p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Quote Banner from Film */}
      <div className="absolute bottom-4 left-4 rtl:left-auto rtl:right-4 z-10 pointer-events-none hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-950/65 border border-sky-500/30 text-sky-200/90 font-mono text-[11px] backdrop-blur-sm">
        <Sparkles className="w-3.5 h-3.5 text-sky-400" />
        <span>{isEn ? '"It\'s not possible." — "No, it\'s necessary."' : '«غیرممکنه!» — «نه، ضروریه!»'}</span>
      </div>
    </div>
  );
};
