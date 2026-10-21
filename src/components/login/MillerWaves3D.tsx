import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../i18n';
import { GlobeThemeType } from './NetworkGlobe3D';
import { Waves, ZoomIn, ZoomOut, RotateCcw, Clock, Compass, Eye, ShieldAlert, Sparkles } from 'lucide-react';

interface MillerWaves3DProps {
  theme?: GlobeThemeType;
}

interface SprayParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
}

interface DistantStar {
  x: number;
  y: number;
  size: number;
  alpha: number;
  twinkleSpeed: number;
}

export const MillerWaves3D: React.FC<MillerWaves3DProps> = ({ theme = 'obsidian' }) => {
  const { isEn } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // User interactive state
  const [zoom, setZoom] = useState<number>(1.0);
  const [waveScale, setWaveScale] = useState<'normal' | 'titan' | 'cataclysmic'>('titan');
  const [timeDilationSpeed, setTimeDilationSpeed] = useState<number>(1.0);
  const [earthDaysPassed, setEarthDaysPassed] = useState<number>(0);
  const [localSecondsPassed, setLocalSecondsPassed] = useState<number>(0);
  const [cameraPanY, setCameraPanY] = useState<number>(0);

  const mouseRef = useRef<{
    isDragging: boolean;
    lastX: number;
    lastY: number;
    panX: number;
    panY: number;
  }>({
    isDragging: false,
    lastX: 0,
    lastY: 0,
    panX: 0,
    panY: 0,
  });

  const sprayParticlesRef = useRef<SprayParticle[]>([]);
  const distantStarsRef = useRef<DistantStar[]>([]);

  // Theme palettes
  const getThemePalette = (t: GlobeThemeType) => {
    switch (t) {
      case 'emerald':
        return {
          skyDeep: '#021e14',
          waterBase: '#064e3b',
          waterCrest: '#34d399',
          waterFoam: '#a7f3d0',
          mist: 'rgba(16, 185, 129, 0.15)',
          gargantuaDisk: '#10b981',
          gargantuaGlow: 'rgba(16, 185, 129, 0.65)',
          horizonGlow: '#047857',
          sunlight: '#6ee7b7',
        };
      case 'cobalt':
        return {
          skyDeep: '#041629',
          waterBase: '#0c4a6e',
          waterCrest: '#38bdf8',
          waterFoam: '#bae6fd',
          mist: 'rgba(56, 189, 248, 0.18)',
          gargantuaDisk: '#0284c7',
          gargantuaGlow: 'rgba(56, 189, 248, 0.65)',
          horizonGlow: '#0369a1',
          sunlight: '#7dd3fc',
        };
      case 'rose':
        return {
          skyDeep: '#23030b',
          waterBase: '#881337',
          waterCrest: '#fb7185',
          waterFoam: '#fecdd3',
          mist: 'rgba(244, 63, 94, 0.18)',
          gargantuaDisk: '#f43f5e',
          gargantuaGlow: 'rgba(251, 113, 133, 0.65)',
          horizonGlow: '#be123c',
          sunlight: '#fda4af',
        };
      case 'amber':
        return {
          skyDeep: '#211202',
          waterBase: '#78350f',
          waterCrest: '#fbbf24',
          waterFoam: '#fef3c7',
          mist: 'rgba(245, 158, 11, 0.18)',
          gargantuaDisk: '#f59e0b',
          gargantuaGlow: 'rgba(251, 191, 36, 0.65)',
          horizonGlow: '#b45309',
          sunlight: '#fde68a',
        };
      case 'light':
        return {
          skyDeep: '#090d16',
          waterBase: '#1e3a8a',
          waterCrest: '#60a5fa',
          waterFoam: '#dbeafe',
          mist: 'rgba(96, 165, 250, 0.2)',
          gargantuaDisk: '#818cf8',
          gargantuaGlow: 'rgba(129, 140, 248, 0.6)',
          horizonGlow: '#3b82f6',
          sunlight: '#bfdbfe',
        };
      case 'google-dark':
        return {
          skyDeep: '#10141d',
          waterBase: '#172554',
          waterCrest: '#8ab4f8',
          waterFoam: '#e8eaed',
          mist: 'rgba(138, 180, 248, 0.18)',
          gargantuaDisk: '#fdd663',
          gargantuaGlow: 'rgba(253, 214, 99, 0.6)',
          horizonGlow: '#4285f4',
          sunlight: '#cbf0f8',
        };
      case 'obsidian':
      default:
        return {
          skyDeep: '#020617',
          waterBase: '#0f172a',
          waterCrest: '#38bdf8',
          waterFoam: '#e0f2fe',
          mist: 'rgba(56, 189, 248, 0.15)',
          gargantuaDisk: '#f59e0b',
          gargantuaGlow: 'rgba(251, 191, 36, 0.7)',
          horizonGlow: '#1e293b',
          sunlight: '#38bdf8',
        };
    }
  };

  const palette = getThemePalette(theme);

  // Initialize background stars
  useEffect(() => {
    const stars: DistantStar[] = [];
    for (let i = 0; i < 140; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random() * 0.55, // in sky hemisphere
        size: Math.random() * 1.8 + 0.5,
        alpha: Math.random() * 0.7 + 0.3,
        twinkleSpeed: Math.random() * 0.04 + 0.01,
      });
    }
    distantStarsRef.current = stars;
  }, []);

  // Relativistic ticker: 1.25 seconds local = 1 full Earth day (7 years per hour)
  useEffect(() => {
    const interval = setInterval(() => {
      setLocalSecondsPassed((sec) => sec + 1);
      // 1 hour on Miller = 7 years on Earth = 2556.75 days
      // 1 second on Miller = 0.7102 days on Earth (~17 hours)
      setEarthDaysPassed((days) => Number((days + 0.7102 * timeDilationSpeed).toFixed(1)));
    }, 1000 / timeDilationSpeed);

    return () => clearInterval(interval);
  }, [timeDilationSpeed]);

  // Main Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animId: number;
    let time = 0;

    const handleResize = () => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    const waveHeightMultiplier =
      waveScale === 'cataclysmic' ? 1.6 : waveScale === 'titan' ? 1.15 : 0.75;

    const render = () => {
      time += 0.018 * timeDilationSpeed;
      const width = canvas.width;
      const height = canvas.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      const cx = width / 2;
      const cy = height / 2;

      const panOffsetX = mouseRef.current.panX * dpr;
      const panOffsetY = mouseRef.current.panY * dpr;

      ctx.clearRect(0, 0, width, height);

      // 1. Sky & Atmospheric Gradient with Gargantua Glow
      const skyGrad = ctx.createLinearGradient(0, 0, 0, height * 0.65);
      skyGrad.addColorStop(0, palette.skyDeep);
      skyGrad.addColorStop(0.55, '#020617');
      skyGrad.addColorStop(0.85, palette.horizonGlow);
      skyGrad.addColorStop(1, palette.waterBase);
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Distant Stars in Sky (Gravitationally warped near horizon)
      ctx.save();
      for (let i = 0; i < distantStarsRef.current.length; i++) {
        const star = distantStarsRef.current[i];
        const sx = (star.x * width + panOffsetX * 0.2) % width;
        const sy = star.y * height + panOffsetY * 0.2;
        if (sy < height * 0.55) {
          const tw = star.alpha * (0.6 + 0.4 * Math.sin(time * 3 + star.twinkleSpeed * 100));
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = Math.max(0, Math.min(1, tw));
          ctx.beginPath();
          ctx.arc(sx, sy, star.size * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // 3. Gargantua Black Hole in the Upper Atmosphere
      const gargX = cx + width * 0.18 + panOffsetX * 0.35;
      const gargY = height * 0.26 + panOffsetY * 0.35;
      const gargRadius = 55 * dpr * zoom;

      ctx.save();
      // Outer Gravitational Lensing Halo (Relativistic Light Ring)
      const haloGrad = ctx.createRadialGradient(gargX, gargY, gargRadius * 0.8, gargX, gargY, gargRadius * 3.8);
      haloGrad.addColorStop(0, palette.gargantuaGlow);
      haloGrad.addColorStop(0.35, palette.gargantuaDisk);
      haloGrad.addColorStop(0.65, 'rgba(245, 158, 11, 0.12)');
      haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(gargX, gargY, gargRadius * 3.8, 0, Math.PI * 2);
      ctx.fill();

      // Curved Lensing Arch over the top
      ctx.save();
      ctx.translate(gargX, gargY);
      ctx.rotate(-0.18);
      ctx.strokeStyle = palette.gargantuaDisk;
      ctx.lineWidth = 9 * dpr * zoom;
      ctx.shadowColor = palette.gargantuaDisk;
      ctx.shadowBlur = 18 * dpr;
      ctx.beginPath();
      ctx.ellipse(0, -gargRadius * 0.45, gargRadius * 2.2, gargRadius * 1.05, 0, Math.PI * 0.95, Math.PI * 2.05);
      ctx.stroke();

      // Accretion Disk Band cutting through the middle
      const diskGrad = ctx.createLinearGradient(-gargRadius * 2.8, 0, gargRadius * 2.8, 0);
      diskGrad.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
      diskGrad.addColorStop(0.3, palette.gargantuaGlow);
      diskGrad.addColorStop(0.5, '#ffffff'); // Doppler bright spot
      diskGrad.addColorStop(0.85, palette.gargantuaDisk);
      diskGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = diskGrad;
      ctx.beginPath();
      ctx.ellipse(0, 0, gargRadius * 2.9, gargRadius * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();

      // Lower Lensing Arch behind bottom
      ctx.strokeStyle = palette.gargantuaGlow;
      ctx.lineWidth = 5 * dpr * zoom;
      ctx.beginPath();
      ctx.ellipse(0, gargRadius * 0.38, gargRadius * 1.9, gargRadius * 0.8, 0, 0.05, Math.PI * 0.95);
      ctx.stroke();
      ctx.restore();

      // Black Hole Event Horizon (Pure Black Sphere)
      ctx.fillStyle = '#000000';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(gargX, gargY, gargRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Razor-thin photon sphere ring
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.4 * dpr;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(gargX, gargY, gargRadius * 1.02, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // 4. Procedural Ocean Waves Simulation (Layered Gerstner Waves)
      const baseHorizon = height * 0.52 + panOffsetY * 0.5;

      // Wave Layer Parameters (Back to Front)
      const layers = [
        {
          yBase: baseHorizon,
          amp: 16 * dpr * waveHeightMultiplier,
          freq: 0.0035 / dpr,
          speed: 0.8,
          color: 'rgba(15, 23, 42, 0.95)',
          crestColor: 'rgba(56, 189, 248, 0.35)',
          isTitanCrest: false,
        },
        {
          yBase: baseHorizon + 40 * dpr,
          amp: 38 * dpr * waveHeightMultiplier,
          freq: 0.0028 / dpr,
          speed: 1.1,
          color: palette.waterBase,
          crestColor: palette.waterCrest,
          isTitanCrest: false,
        },
        // The Colossal Titan Mountain Wave ("Those aren't mountains... they're waves!")
        {
          yBase: baseHorizon + 95 * dpr,
          amp: 135 * dpr * waveHeightMultiplier * zoom,
          freq: 0.0016 / dpr,
          speed: 0.65,
          color: 'rgba(8, 20, 40, 0.98)',
          crestColor: palette.waterCrest,
          isTitanCrest: true,
        },
        // Foreground Shallow Mirror Swell
        {
          yBase: baseHorizon + 190 * dpr,
          amp: 32 * dpr * waveHeightMultiplier,
          freq: 0.0042 / dpr,
          speed: 1.4,
          color: 'rgba(3, 10, 24, 0.98)',
          crestColor: palette.waterFoam,
          isTitanCrest: false,
        },
      ];

      layers.forEach((layer, idx) => {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, height);

        const stepX = 8 * dpr;
        for (let x = 0; x <= width + stepX; x += stepX) {
          // Trochoidal / Gerstner Wave Superposition
          const xScaled = x + panOffsetX * (0.3 + idx * 0.2);
          const w1 = Math.sin(xScaled * layer.freq + time * layer.speed);
          const w2 = Math.cos(xScaled * layer.freq * 1.8 - time * layer.speed * 0.7) * 0.45;
          const w3 = Math.sin(xScaled * layer.freq * 3.2 + time * layer.speed * 1.2) * 0.2;

          // Asymmetrical wave sharpening (sharp crest, wide trough)
          const rawWave = w1 + w2 + w3;
          const steepness = layer.isTitanCrest ? 1.7 : 1.2;
          const shapedWave = Math.pow(Math.abs((rawWave + 1) / 2), steepness) * 2 - 1;

          const y = layer.yBase - shapedWave * layer.amp;

          if (x === 0) {
            ctx.lineTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }

          // Generate sea spray particles at the Titan Wave Crest
          if (layer.isTitanCrest && Math.random() < 0.35 && shapedWave > 0.6) {
            if (sprayParticlesRef.current.length < 180) {
              sprayParticlesRef.current.push({
                x,
                y: y - Math.random() * 8 * dpr,
                vx: (Math.random() - 0.4) * 2.5 * dpr,
                vy: -(Math.random() * 3.5 + 1.5) * dpr,
                size: Math.random() * 2.2 + 0.8,
                alpha: 0.8,
                life: 0,
                maxLife: Math.random() * 35 + 20,
              });
            }
          }
        }

        ctx.lineTo(width, height);
        ctx.closePath();

        // Water depth gradient
        const waterGrad = ctx.createLinearGradient(0, layer.yBase - layer.amp, 0, height);
        waterGrad.addColorStop(0, layer.color);
        waterGrad.addColorStop(1, '#01040a');
        ctx.fillStyle = waterGrad;
        ctx.fill();

        // Foam / Crest Highlight Line
        ctx.strokeStyle = layer.crestColor;
        ctx.lineWidth = (layer.isTitanCrest ? 4.5 : 2.2) * dpr;
        ctx.stroke();

        ctx.restore();
      });

      // 5. Render Sea Spray & Atmospheric Ocean Mist
      ctx.save();
      for (let i = sprayParticlesRef.current.length - 1; i >= 0; i--) {
        const p = sprayParticlesRef.current[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08 * dpr; // gravity
        p.life++;
        p.alpha = Math.max(0, 1 - p.life / p.maxLife);

        if (p.life >= p.maxLife || p.y > height) {
          sprayParticlesRef.current.splice(i, 1);
          continue;
        }

        ctx.fillStyle = palette.waterFoam;
        ctx.globalAlpha = p.alpha * 0.75;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Atmospheric Ground Mist Layer
      const mistGrad = ctx.createLinearGradient(0, height * 0.7, 0, height);
      mistGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      mistGrad.addColorStop(0.5, palette.mist);
      mistGrad.addColorStop(1, 'rgba(2, 6, 23, 0.65)');
      ctx.fillStyle = mistGrad;
      ctx.fillRect(0, height * 0.7, width, height * 0.3);

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, [palette, zoom, waveScale, timeDilationSpeed]);

  // Pointer interactions for panning
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

    mouseRef.current.panX += dx * 0.5;
    mouseRef.current.panY = Math.max(-120, Math.min(120, mouseRef.current.panY + dy * 0.5));
    setCameraPanY(mouseRef.current.panY);
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
    setZoom((z) => Math.max(0.65, Math.min(1.85, z + delta)));
  };

  const handleReset = () => {
    setZoom(1.0);
    setWaveScale('titan');
    setTimeDilationSpeed(1.0);
    mouseRef.current.panX = 0;
    mouseRef.current.panY = 0;
    setCameraPanY(0);
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

      {/* Top Left Relativistic Time Dial - Interstellar 7 Years / Hour Dial */}
      <div className="absolute top-4 left-4 z-20 pointer-events-none flex flex-col gap-1.5 font-mono text-[11px] backdrop-blur-md bg-slate-950/75 border border-amber-500/30 rounded-lg p-2.5 text-amber-300 shadow-xl max-w-xs">
        <div className="flex items-center justify-between border-b border-amber-500/20 pb-1">
          <div className="flex items-center gap-1.5 font-bold text-white tracking-wider text-xs">
            <Waves className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span>{isEn ? "MILLER'S WATER PLANET" : 'سیاره اقیانوسی میلر'}</span>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40 flex items-center gap-1">
            <Clock className="w-2.5 h-2.5 animate-spin" />
            <span>1H = 7 YRS</span>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-slate-300 pt-0.5">
          <div>
            <span className="text-slate-400">{isEn ? 'Local Time:' : 'زمان محلی میلر:'}</span>
          </div>
          <div className="text-right rtl:text-left text-cyan-300 font-semibold">{localSecondsPassed}s</div>

          <div>
            <span className="text-slate-400">{isEn ? 'Earth Elapsed:' : 'زمان سپری‌شده زمین:'}</span>
          </div>
          <div className="text-right rtl:text-left text-amber-300 font-semibold">
            {earthDaysPassed} {isEn ? 'days' : 'روز'}
          </div>

          <div>
            <span className="text-slate-400">{isEn ? 'Tidal Warning:' : 'هشدار سونامی:'}</span>
          </div>
          <div className="text-right rtl:text-left text-rose-400 font-bold uppercase tracking-wider">
            {waveScale === 'cataclysmic'
              ? (isEn ? 'CATACLYSMIC 1200m' : 'فاجعه‌بار ۱۲۰۰ متر')
              : waveScale === 'titan'
              ? (isEn ? 'TITAN WAVE 500m' : 'موج تایتان ۵۰۰ متر')
              : (isEn ? 'SWELL 200m' : 'موج متعارف ۲۰۰ متر')}
          </div>
        </div>
      </div>

      {/* Bottom Interactive Control Dock */}
      <div className="absolute bottom-4 right-4 rtl:right-auto rtl:left-4 z-20 flex items-center gap-1.5 p-1.5 rounded-xl backdrop-blur-md bg-slate-950/75 border border-white/15 text-slate-300 shadow-2xl">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(1.85, z + 0.15))}
          title={isEn ? 'Zoom In' : 'بزرگنمایی'}
          className="p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition cursor-pointer"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.65, z - 0.15))}
          title={isEn ? 'Zoom Out' : 'کوچک‌نمایی'}
          className="p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition cursor-pointer"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <div className="h-4 w-[1px] bg-white/20 mx-0.5" />

        {/* Wave Height Cycle Toggle */}
        <button
          type="button"
          onClick={() => {
            setWaveScale((prev) => (prev === 'normal' ? 'titan' : prev === 'titan' ? 'cataclysmic' : 'normal'));
          }}
          title={isEn ? 'Change Tidal Wave Scale' : 'تغییر ارتفاع موج عظیم'}
          className="px-2 py-1 text-[11px] font-mono rounded-lg bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-600/50 transition cursor-pointer font-bold uppercase"
        >
          {waveScale}
        </button>

        {/* Speed / Dilation Rate */}
        <button
          type="button"
          onClick={() => setTimeDilationSpeed((s) => (s >= 2.0 ? 0.5 : s + 0.5))}
          title={isEn ? `Time Flow: ${timeDilationSpeed}x` : `جریان زمان نسبیتی: ${timeDilationSpeed}x`}
          className="px-2 py-1 text-[11px] font-mono rounded-lg hover:bg-white/10 hover:text-white transition cursor-pointer font-bold"
        >
          {timeDilationSpeed}x
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
      <div className="absolute bottom-4 left-4 rtl:left-auto rtl:right-4 z-10 pointer-events-none hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-950/65 border border-cyan-500/30 text-cyan-200/90 font-mono text-[11px] backdrop-blur-sm">
        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
        <span>{isEn ? '"Those aren\'t mountains... they\'re waves."' : '«اونا کوه نیستن... موجن!»'}</span>
      </div>
    </div>
  );
};
