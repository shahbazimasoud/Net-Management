import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../i18n';
import { GlobeThemeType } from './NetworkGlobe3D';
import { Sparkles, ZoomIn, ZoomOut, Compass, Sun, Orbit, RotateCcw } from 'lucide-react';

interface MilkyWayGalaxy3DProps {
  theme?: GlobeThemeType;
}

interface GalaxyStar {
  x: number;
  y: number;
  z: number;
  radius: number;
  angle: number;
  angularSpeed: number;
  size: number;
  color: string;
  alpha: number;
  twinkleOffset: number;
  isCore?: boolean;
}

interface DustCloud {
  x: number;
  y: number;
  z: number;
  dist: number;
  angle: number;
  angularSpeed: number;
  radius: number;
  colorInner: string;
  colorOuter: string;
  alpha: number;
}

interface BackgroundStar {
  u: number;
  v: number;
  size: number;
  alpha: number;
  twinkleSpeed: number;
  color: string;
}

interface PlanetDef {
  id: string;
  nameEn: string;
  nameFa: string;
  orbitRadius: number;
  size: number;
  speed: number;
  initialAngle: number;
  color: string;
  glowColor: string;
  hasRings?: boolean;
  ringColor?: string;
  hasMoon?: boolean;
  distanceAu: string;
}

const SOLAR_PLANETS: PlanetDef[] = [
  {
    id: 'mercury',
    nameEn: 'Mercury',
    nameFa: 'عطارد',
    orbitRadius: 34,
    size: 2.6,
    speed: 0.018,
    initialAngle: 0.8,
    color: '#cbd5e1',
    glowColor: 'rgba(203, 213, 225, 0.35)',
    distanceAu: '0.39 AU',
  },
  {
    id: 'venus',
    nameEn: 'Venus',
    nameFa: 'زهره',
    orbitRadius: 54,
    size: 4.0,
    speed: 0.013,
    initialAngle: 2.3,
    color: '#fde68a',
    glowColor: 'rgba(251, 191, 36, 0.45)',
    distanceAu: '0.72 AU',
  },
  {
    id: 'earth',
    nameEn: 'Earth',
    nameFa: 'زمین',
    orbitRadius: 80,
    size: 4.5,
    speed: 0.01,
    initialAngle: 4.1,
    color: '#38bdf8',
    glowColor: 'rgba(56, 189, 248, 0.55)',
    hasMoon: true,
    distanceAu: '1.00 AU',
  },
  {
    id: 'mars',
    nameEn: 'Mars',
    nameFa: 'مریخ',
    orbitRadius: 108,
    size: 3.4,
    speed: 0.0078,
    initialAngle: 1.2,
    color: '#fb7185',
    glowColor: 'rgba(244, 63, 94, 0.45)',
    distanceAu: '1.52 AU',
  },
  {
    id: 'jupiter',
    nameEn: 'Jupiter',
    nameFa: 'مشتری',
    orbitRadius: 158,
    size: 8.6,
    speed: 0.0046,
    initialAngle: 5.2,
    color: '#fdba74',
    glowColor: 'rgba(251, 146, 60, 0.5)',
    distanceAu: '5.20 AU',
  },
  {
    id: 'saturn',
    nameEn: 'Saturn',
    nameFa: 'زحل',
    orbitRadius: 206,
    size: 7.2,
    speed: 0.0033,
    initialAngle: 2.9,
    color: '#fcd34d',
    glowColor: 'rgba(250, 204, 21, 0.45)',
    hasRings: true,
    ringColor: 'rgba(253, 230, 138, 0.65)',
    distanceAu: '9.58 AU',
  },
  {
    id: 'uranus',
    nameEn: 'Uranus',
    nameFa: 'اورانوس',
    orbitRadius: 252,
    size: 5.4,
    speed: 0.0022,
    initialAngle: 0.4,
    color: '#67e8f9',
    glowColor: 'rgba(103, 232, 249, 0.45)',
    hasRings: true,
    ringColor: 'rgba(103, 232, 249, 0.3)',
    distanceAu: '19.2 AU',
  },
  {
    id: 'neptune',
    nameEn: 'Neptune',
    nameFa: 'نپتون',
    orbitRadius: 294,
    size: 5.2,
    speed: 0.0016,
    initialAngle: 3.7,
    color: '#60a5fa',
    glowColor: 'rgba(96, 165, 250, 0.5)',
    distanceAu: '30.1 AU',
  },
];

// Gaussian random helper for realistic galactic star & dust distribution
function randomGaussian(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export const MilkyWayGalaxy3D: React.FC<MilkyWayGalaxy3DProps> = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { isEn } = useLanguage();

  // Zoom state for UI HUD (0 = Full Milky Way Galaxy, 100 = Inside Solar System)
  const [zoomPercent, setZoomPercent] = useState<number>(0);
  const targetZoomRef = useRef<number>(0);
  const currentZoomRef = useRef<number>(0);
  const resetRotationRef = useRef<(() => void) | null>(null);

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

    // -----------------------------------------------------------------
    // 1. Pre-compute Deep Space Background Stars
    // -----------------------------------------------------------------
    const bgStars: BackgroundStar[] = [];
    const bgColors = ['#ffffff', '#e0f2fe', '#fef3c7', '#ddd6fe', '#bae6fd'];
    for (let i = 0; i < 260; i++) {
      bgStars.push({
        u: Math.random(),
        v: Math.random(),
        size: 0.6 + Math.random() * 1.4,
        alpha: 0.2 + Math.random() * 0.7,
        twinkleSpeed: 0.015 + Math.random() * 0.035,
        color: bgColors[Math.floor(Math.random() * bgColors.length)],
      });
    }

    // -----------------------------------------------------------------
    // 2. Pre-compute Milky Way Spiral Galaxy Stars (Core + 4 Spiral Arms)
    // -----------------------------------------------------------------
    const galaxyStars: GalaxyStar[] = [];
    const maxGalaxyRadius = 340;
    const numArms = 4;
    const armWind = 3.6; // Spiral tightness

    // A) Galactic Core & Central Bar Stars (warm golden-amber-white)
    const corePalette = ['#fffbeb', '#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#fed7aa'];
    for (let i = 0; i < 750; i++) {
      const r = Math.abs(randomGaussian()) * (maxGalaxyRadius * 0.17);
      const angle = Math.random() * Math.PI * 2;
      // Slight bar elongation along angle 0.4 rad
      const barFactor = i < 350 ? 1.45 : 1.0;
      const bx = Math.cos(angle) * r * barFactor;
      const bz = Math.sin(angle) * r;
      const dist = Math.max(1, Math.hypot(bx, bz));
      const trueAngle = Math.atan2(bz, bx);
      const thickness = (1 - Math.min(1, dist / (maxGalaxyRadius * 0.45))) * 26;
      const y = randomGaussian() * thickness;

      galaxyStars.push({
        x: bx,
        y,
        z: bz,
        radius: dist,
        angle: trueAngle,
        // Very slow rotation, slightly faster near the center
        angularSpeed: 0.00045 + (1 / (1 + dist * 0.018)) * 0.00055,
        size: 0.9 + Math.random() * 2.1,
        color: corePalette[Math.floor(Math.random() * corePalette.length)],
        alpha: 0.55 + Math.random() * 0.45,
        twinkleOffset: Math.random() * Math.PI * 2,
        isCore: true,
      });
    }

    // B) Spiral Arm Stars (Blue-white O/B giants, cyan/violet young clusters, warm disk stars)
    const armPalette = ['#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#c4b5fd', '#f9a8d4', '#fef3c7', '#ffffff'];
    for (let i = 0; i < 1650; i++) {
      const armIndex = i % numArms;
      const distNorm = Math.pow(Math.random(), 0.78); // 0..1
      const dist = 24 + distNorm * (maxGalaxyRadius - 24);
      const baseArmAngle = (armIndex * Math.PI * 2) / numArms;
      const spiralOffset = distNorm * armWind;
      const scatterAngle = randomGaussian() * (0.22 + distNorm * 0.25);
      const angle = baseArmAngle + spiralOffset + scatterAngle;

      const diskThickness = Math.max(3.5, (1 - distNorm * 0.75) * 14);
      const y = randomGaussian() * diskThickness;

      galaxyStars.push({
        x: Math.cos(angle) * dist,
        y,
        z: Math.sin(angle) * dist,
        radius: dist,
        angle,
        angularSpeed: 0.00038 + (1 - distNorm * 0.45) * 0.00035,
        size: 0.7 + Math.random() * 1.9,
        color: armPalette[Math.floor(Math.random() * armPalette.length)],
        alpha: (1 - distNorm * 0.5) * (0.4 + Math.random() * 0.6),
        twinkleOffset: Math.random() * Math.PI * 2,
      });
    }

    // -----------------------------------------------------------------
    // 3. Pre-compute Volumetric Cosmic Dust & Nebula Clouds (غبارهای کیهانی)
    // -----------------------------------------------------------------
    const dustClouds: DustCloud[] = [];
    const nebulaColors = [
      { inner: 'rgba(251, 191, 36, 0.16)', outer: 'rgba(217, 119, 6, 0)' },    // Golden core dust
      { inner: 'rgba(56, 189, 248, 0.12)', outer: 'rgba(2, 132, 199, 0)' },    // Cyan spiral nebula
      { inner: 'rgba(139, 92, 246, 0.13)', outer: 'rgba(109, 40, 217, 0)' },   // Cosmic violet dust
      { inner: 'rgba(236, 72, 153, 0.11)', outer: 'rgba(190, 24, 93, 0)' },    // H-II Pink star-forming region
      { inner: 'rgba(99, 102, 241, 0.12)', outer: 'rgba(67, 56, 202, 0)' },    // Deep indigo galactic haze
    ];

    // Core dust clouds
    for (let i = 0; i < 28; i++) {
      const dist = Math.random() * 68;
      const angle = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 14;
      dustClouds.push({
        x: Math.cos(angle) * dist,
        y,
        z: Math.sin(angle) * dist,
        dist,
        angle,
        angularSpeed: 0.00055,
        radius: 36 + Math.random() * 55,
        colorInner: 'rgba(253, 224, 71, 0.14)',
        colorOuter: 'rgba(234, 88, 12, 0)',
        alpha: 0.85,
      });
    }

    // Spiral arm dust & nebula pockets
    for (let i = 0; i < 95; i++) {
      const armIndex = i % numArms;
      const distNorm = 0.12 + Math.random() * 0.82;
      const dist = distNorm * maxGalaxyRadius;
      const baseArmAngle = (armIndex * Math.PI * 2) / numArms;
      const angle = baseArmAngle + distNorm * armWind + (Math.random() - 0.5) * 0.45;
      const y = (Math.random() - 0.5) * 12;
      const pal = nebulaColors[(i % (nebulaColors.length - 1)) + 1];

      dustClouds.push({
        x: Math.cos(angle) * dist,
        y,
        z: Math.sin(angle) * dist,
        dist,
        angle,
        angularSpeed: 0.00038 + (1 - distNorm * 0.45) * 0.00035,
        radius: 32 + Math.random() * 54,
        colorInner: pal.inner,
        colorOuter: pal.outer,
        alpha: 1 - distNorm * 0.35,
      });
    }

    // -----------------------------------------------------------------
    // 4. Solar System Locus in the Orion Spur & Asteroid Belt
    // -----------------------------------------------------------------
    const solarSystemGalacticRadius = 148;
    let solarSystemGalacticAngle = 1.15;
    const solarSystemAngularSpeed = 0.00048;

    // Main Asteroid Belt between Mars (108) and Jupiter (158)
    const asteroids = Array.from({ length: 240 }, () => ({
      radius: 126 + (Math.random() - 0.5) * 16,
      angle: Math.random() * Math.PI * 2,
      speed: 0.0055 + Math.random() * 0.002,
      y: (Math.random() - 0.5) * 3.5,
      size: 0.7 + Math.random() * 1.1,
      alpha: 0.35 + Math.random() * 0.45,
    }));

    // Track planet orbital angles
    const planetAngles = SOLAR_PLANETS.map((p) => p.initialAngle);
    let earthMoonAngle = 0;

    // -----------------------------------------------------------------
    // 5. Camera Rotation & Interactive Drag + Wheel Zoom
    // -----------------------------------------------------------------
    let camRotX = 0.62; // Tilted 3D view of the Milky Way disk
    let camRotY = -0.35;
    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;

    resetRotationRef.current = () => {
      camRotX = 0.62;
      camRotY = -0.35;
      targetZoomRef.current = 0;
      setZoomPercent(0);
    };

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      canvas.style.cursor = 'grabbing';
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      camRotY += dx * 0.0055;
      camRotX = Math.max(0.12, Math.min(1.42, camRotX + dy * 0.0055));
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    };

    const onMouseUp = () => {
      isDragging = false;
      canvas.style.cursor = 'grab';
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Scroll up (deltaY < 0) zooms IN toward the Solar System (0 -> 1)
      // Scroll down (deltaY > 0) zooms OUT toward the Milky Way Galaxy (1 -> 0)
      const zoomStep = -e.deltaY * 0.00085;
      const nextTarget = Math.max(0, Math.min(1, targetZoomRef.current + zoomStep));
      targetZoomRef.current = nextTarget;
      setZoomPercent(Math.round(nextTarget * 100));
    };

    // Touch pinch & drag support
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
        camRotY += dx * 0.006;
        camRotX = Math.max(0.12, Math.min(1.42, camRotX + dy * 0.006));
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

    // 3D Projection Helper around target focal point
    const project3D = (
      wx: number,
      wy: number,
      wz: number,
      focusX: number,
      focusY: number,
      focusZ: number,
      cosX: number,
      sinX: number,
      cosY: number,
      sinY: number,
      cameraDist: number,
      fov: number,
      cx: number,
      cy: number
    ) => {
      const rx = wx - focusX;
      const ry = wy - focusY;
      const rz = wz - focusZ;

      // Rotate around Y
      const x1 = rx * cosY - rz * sinY;
      const z1 = rx * sinY + rz * cosY;

      // Rotate around X (tilt)
      const y2 = ry * cosX - z1 * sinX;
      const z2 = ry * sinX + z1 * cosX;

      const depth = cameraDist + z2;
      if (depth <= 15) return null;

      const scale = fov / depth;
      return {
        sx: cx + x1 * scale,
        sy: cy + y2 * scale,
        scale,
        depth,
      };
    };

    let frame = 0;

    const render = () => {
      frame++;

      // Smoothly interpolate currentZoom toward targetZoom
      currentZoomRef.current += (targetZoomRef.current - currentZoomRef.current) * 0.075;
      const zoom = currentZoomRef.current; // 0.0 (Galaxy) -> 1.0 (Solar System)

      // Smooth transition weights
      // galaxyFade: 1.0 at zoom=0, fades smoothly to 0.18 at zoom=1 so background Milky Way band remains visible
      const galaxyAlpha = Math.max(0.14, 1 - Math.pow(zoom, 1.35) * 0.85);
      // solarAlpha: starts appearing around zoom=0.25, reaches 1.0 by zoom=0.65
      const solarAlpha = Math.max(0, Math.min(1, (zoom - 0.22) / 0.48));

      ctx.clearRect(0, 0, width, height);

      // Deep space background gradient
      const bgGrad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.5,
        10,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.75
      );
      bgGrad.addColorStop(0, '#090d1f');
      bgGrad.addColorStop(0.55, '#050814');
      bgGrad.addColorStop(1, '#02040a');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Render distant background stars
      for (let i = 0; i < bgStars.length; i++) {
        const st = bgStars[i];
        const twinkle = 0.65 + 0.35 * Math.sin(frame * st.twinkleSpeed + i);
        ctx.fillStyle = st.color;
        ctx.globalAlpha = st.alpha * twinkle;
        ctx.beginPath();
        ctx.arc(st.u * width, st.v * height, st.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const cx = width * 0.5;
      const cy = height * 0.5;

      // Update slow majestic rotation of the Milky Way & Solar System locus
      solarSystemGalacticAngle += solarSystemAngularSpeed;
      const solGalX = Math.cos(solarSystemGalacticAngle) * solarSystemGalacticRadius;
      const solGalY = 0;
      const solGalZ = Math.sin(solarSystemGalacticAngle) * solarSystemGalacticRadius;

      // Interpolate camera focal point from Galactic Center (0,0,0) to Solar System Locus (solGalX, solGalY, solGalZ)
      // Smoothstep easing for focus interpolation
      const focusT = Math.min(1, zoom / 0.55);
      const smoothFocus = focusT * focusT * (3 - 2 * focusT);
      const focusX = solGalX * smoothFocus;
      const focusY = solGalY * smoothFocus;
      const focusZ = solGalZ * smoothFocus;

      // Camera distance for Galaxy layer shrinks as we zoom into the Orion Spur
      const galaxyCamDist = 680 - zoom * 560; // 680 -> 120
      const fov = Math.min(width, height) * 0.85;

      const cosX = Math.cos(camRotX);
      const sinX = Math.sin(camRotX);
      const cosY = Math.cos(camRotY);
      const sinY = Math.sin(camRotY);

      // -----------------------------------------------------------------
      // LAYER A: MILKY WAY GALACTIC CORE, NEBULA DUST & SPIRAL ARMS
      // -----------------------------------------------------------------
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // 1. Central Supermassive Core Glow (Sagittarius A* & Galactic Bulge)
      const coreProj = project3D(
        0,
        0,
        0,
        focusX,
        focusY,
        focusZ,
        cosX,
        sinX,
        cosY,
        sinY,
        galaxyCamDist,
        fov,
        cx,
        cy
      );
      if (coreProj) {
        const coreRad = Math.max(12, 135 * coreProj.scale);
        const coreGrad = ctx.createRadialGradient(
          coreProj.sx,
          coreProj.sy,
          coreRad * 0.04,
          coreProj.sx,
          coreProj.sy,
          coreRad
        );
        coreGrad.addColorStop(0, `rgba(255, 251, 235, ${0.92 * galaxyAlpha})`);
        coreGrad.addColorStop(0.18, `rgba(253, 224, 71, ${0.55 * galaxyAlpha})`);
        coreGrad.addColorStop(0.45, `rgba(245, 158, 11, ${0.24 * galaxyAlpha})`);
        coreGrad.addColorStop(0.75, `rgba(147, 51, 234, ${0.09 * galaxyAlpha})`);
        coreGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(coreProj.sx, coreProj.sy, coreRad, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2. Volumetric Cosmic Dust & Nebula Clouds (غبارهای کیهانی)
      for (let i = 0; i < dustClouds.length; i++) {
        const dc = dustClouds[i];
        dc.angle += dc.angularSpeed;
        dc.x = Math.cos(dc.angle) * dc.dist;
        dc.z = Math.sin(dc.angle) * dc.dist;

        const p = project3D(
          dc.x,
          dc.y,
          dc.z,
          focusX,
          focusY,
          focusZ,
          cosX,
          sinX,
          cosY,
          sinY,
          galaxyCamDist,
          fov,
          cx,
          cy
        );
        if (!p) continue;

        const r = dc.radius * p.scale;
        if (r < 2 || p.sx < -r || p.sx > width + r || p.sy < -r || p.sy > height + r) continue;

        ctx.globalAlpha = dc.alpha * galaxyAlpha;
        const grad = ctx.createRadialGradient(p.sx, p.sy, r * 0.05, p.sx, p.sy, r);
        grad.addColorStop(0, dc.colorInner);
        grad.addColorStop(1, dc.colorOuter);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // 3. Spiral Arm & Bulge Stars
      for (let i = 0; i < galaxyStars.length; i++) {
        const st = galaxyStars[i];
        st.angle += st.angularSpeed;
        if (st.isCore && i < 350) {
          st.x = Math.cos(st.angle) * st.radius * 1.35;
          st.z = Math.sin(st.angle) * st.radius;
        } else {
          st.x = Math.cos(st.angle) * st.radius;
          st.z = Math.sin(st.angle) * st.radius;
        }

        const p = project3D(
          st.x,
          st.y,
          st.z,
          focusX,
          focusY,
          focusZ,
          cosX,
          sinX,
          cosY,
          sinY,
          galaxyCamDist,
          fov,
          cx,
          cy
        );
        if (!p) continue;
        if (p.sx < -10 || p.sx > width + 10 || p.sy < -10 || p.sy > height + 10) continue;

        const twinkle = 0.72 + 0.28 * Math.sin(frame * 0.03 + st.twinkleOffset);
        const starRadius = Math.max(0.55, Math.min(4.2, st.size * p.scale * 1.15));

        ctx.globalAlpha = st.alpha * twinkle * galaxyAlpha;
        ctx.fillStyle = st.color;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, starRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      // 4. Solar System Beacon Marker in the Orion Arm (Visible when zoomed out in Galaxy view)
      if (zoom < 0.52) {
        const solBeaconProj = project3D(
          solGalX,
          solGalY,
          solGalZ,
          focusX,
          focusY,
          focusZ,
          cosX,
          sinX,
          cosY,
          sinY,
          galaxyCamDist,
          fov,
          cx,
          cy
        );
        if (solBeaconProj) {
          const beaconAlpha = Math.max(0, 1 - zoom / 0.48);
          const pulse = 1 + 0.25 * Math.sin(frame * 0.06);
          ctx.save();
          ctx.globalAlpha = beaconAlpha;

          // Outer target ring
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(solBeaconProj.sx, solBeaconProj.sy, 11 * pulse, 0, Math.PI * 2);
          ctx.stroke();

          // Inner sun dot
          ctx.fillStyle = '#fde047';
          ctx.beginPath();
          ctx.arc(solBeaconProj.sx, solBeaconProj.sy, 3.5, 0, Math.PI * 2);
          ctx.fill();

          // Label
          ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.fillStyle = '#e0f2fe';
          ctx.fillText(
            isEn ? '⦿ Solar System (Scroll to Zoom)' : '⦿ منظومه شمسی (اسکرول جهت زوم)',
            solBeaconProj.sx + 15,
            solBeaconProj.sy + 4
          );
          ctx.restore();
        }
      }

      // -----------------------------------------------------------------
      // LAYER B: THE SOLAR SYSTEM (Revealed as you scroll/zoom in)
      // -----------------------------------------------------------------
      if (solarAlpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = solarAlpha;

        // Camera distance in Solar System local space: starts far (1350) and zooms close (390)
        const localZoomNorm = Math.max(0, Math.min(1, (zoom - 0.22) / 0.78));
        const solarCamDist = 1150 - localZoomNorm * 770; // 1150 -> 380

        // 1. Draw 3D Planetary Orbit Rings
        for (let i = 0; i < SOLAR_PLANETS.length; i++) {
          const planet = SOLAR_PLANETS[i];
          ctx.beginPath();
          const steps = 90;
          let started = false;
          for (let s = 0; s <= steps; s++) {
            const ang = (s / steps) * Math.PI * 2;
            const ox = Math.cos(ang) * planet.orbitRadius;
            const oz = Math.sin(ang) * planet.orbitRadius;
            const op = project3D(ox, 0, oz, 0, 0, 0, cosX, sinX, cosY, sinY, solarCamDist, fov, cx, cy);
            if (op) {
              if (!started) {
                ctx.moveTo(op.sx, op.sy);
                started = true;
              } else {
                ctx.lineTo(op.sx, op.sy);
              }
            }
          }
          ctx.strokeStyle = planet.id === 'earth'
            ? `rgba(56, 189, 248, ${0.32 * solarAlpha})`
            : `rgba(148, 163, 184, ${0.18 * solarAlpha})`;
          ctx.lineWidth = planet.id === 'earth' ? 1.3 : 1;
          ctx.stroke();
        }

        // 2. Draw Main Asteroid Belt (between Mars & Jupiter)
        for (let i = 0; i < asteroids.length; i++) {
          const ast = asteroids[i];
          ast.angle += ast.speed * 0.25;
          const ax = Math.cos(ast.angle) * ast.radius;
          const az = Math.sin(ast.angle) * ast.radius;
          const ap = project3D(ax, ast.y, az, 0, 0, 0, cosX, sinX, cosY, sinY, solarCamDist, fov, cx, cy);
          if (!ap) continue;
          ctx.fillStyle = `rgba(203, 213, 225, ${ast.alpha * solarAlpha})`;
          ctx.beginPath();
          ctx.arc(ap.sx, ap.sy, Math.max(0.6, ast.size * ap.scale), 0, Math.PI * 2);
          ctx.fill();
        }

        // 3. Collect Sun & 8 Planets with depth sorting so planets behind the Sun render accurately
        interface RenderBody {
          type: 'sun' | 'planet';
          planet?: PlanetDef;
          planetIdx?: number;
          wx: number;
          wy: number;
          wz: number;
          sx: number;
          sy: number;
          scale: number;
          depth: number;
        }

        const bodies: RenderBody[] = [];

        const sunProj = project3D(0, 0, 0, 0, 0, 0, cosX, sinX, cosY, sinY, solarCamDist, fov, cx, cy);
        if (sunProj) {
          bodies.push({
            type: 'sun',
            wx: 0,
            wy: 0,
            wz: 0,
            sx: sunProj.sx,
            sy: sunProj.sy,
            scale: sunProj.scale,
            depth: sunProj.depth,
          });
        }

        for (let i = 0; i < SOLAR_PLANETS.length; i++) {
          const pl = SOLAR_PLANETS[i];
          planetAngles[i] += pl.speed * 0.45;
          const px = Math.cos(planetAngles[i]) * pl.orbitRadius;
          const pz = Math.sin(planetAngles[i]) * pl.orbitRadius;
          const pp = project3D(px, 0, pz, 0, 0, 0, cosX, sinX, cosY, sinY, solarCamDist, fov, cx, cy);
          if (pp) {
            bodies.push({
              type: 'planet',
              planet: pl,
              planetIdx: i,
              wx: px,
              wy: 0,
              wz: pz,
              sx: pp.sx,
              sy: pp.sy,
              scale: pp.scale,
              depth: pp.depth,
            });
          }
        }

        // Sort far-to-near (largest depth first)
        bodies.sort((a, b) => b.depth - a.depth);

        earthMoonAngle += 0.04;

        for (const body of bodies) {
          if (body.type === 'sun') {
            const sunR = Math.max(8, 22 * body.scale);
            // Solar corona glow
            const corona = ctx.createRadialGradient(
              body.sx,
              body.sy,
              sunR * 0.2,
              body.sx,
              body.sy,
              sunR * 3.6
            );
            corona.addColorStop(0, `rgba(255, 251, 235, ${solarAlpha})`);
            corona.addColorStop(0.25, `rgba(253, 224, 71, ${0.85 * solarAlpha})`);
            corona.addColorStop(0.55, `rgba(249, 115, 22, ${0.35 * solarAlpha})`);
            corona.addColorStop(1, 'rgba(234, 88, 12, 0)');
            ctx.fillStyle = corona;
            ctx.beginPath();
            ctx.arc(body.sx, body.sy, sunR * 3.6, 0, Math.PI * 2);
            ctx.fill();

            // Sun photosphere core
            ctx.fillStyle = '#fef08a';
            ctx.beginPath();
            ctx.arc(body.sx, body.sy, sunR, 0, Math.PI * 2);
            ctx.fill();

            if (localZoomNorm > 0.25) {
              ctx.font = 'bold 11px ui-sans-serif, system-ui, sans-serif';
              ctx.fillStyle = `rgba(254, 240, 138, ${solarAlpha})`;
              ctx.fillText(isEn ? '☀ Sun (Sol)' : '☀ خورشید', body.sx + sunR + 6, body.sy + 4);
            }
          } else if (body.planet) {
            const pl = body.planet;
            const pr = Math.max(2.2, pl.size * body.scale * 1.35);

            // Planet atmospheric halo
            const halo = ctx.createRadialGradient(body.sx, body.sy, pr * 0.2, body.sx, body.sy, pr * 2.6);
            halo.addColorStop(0, pl.glowColor);
            halo.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(body.sx, body.sy, pr * 2.6, 0, Math.PI * 2);
            ctx.fill();

            // Saturn / Uranus 3D Rings
            if (pl.hasRings && pl.ringColor) {
              ctx.beginPath();
              const ringSteps = 48;
              const innerRing = pl.size * 1.7;
              const outerRing = pl.size * 2.75;
              const avgRing = (innerRing + outerRing) * 0.5;
              let rStarted = false;
              for (let s = 0; s <= ringSteps; s++) {
                const a = (s / ringSteps) * Math.PI * 2;
                const rx = body.wx + Math.cos(a) * avgRing;
                const ry = body.wy + Math.sin(a) * avgRing * 0.22;
                const rz = body.wz + Math.sin(a) * avgRing;
                const rp = project3D(rx, ry, rz, 0, 0, 0, cosX, sinX, cosY, sinY, solarCamDist, fov, cx, cy);
                if (rp) {
                  if (!rStarted) {
                    ctx.moveTo(rp.sx, rp.sy);
                    rStarted = true;
                  } else {
                    ctx.lineTo(rp.sx, rp.sy);
                  }
                }
              }
              ctx.strokeStyle = pl.ringColor;
              ctx.lineWidth = Math.max(1.5, 3.2 * body.scale);
              ctx.stroke();
            }

            // Planet sphere
            ctx.fillStyle = pl.color;
            ctx.beginPath();
            ctx.arc(body.sx, body.sy, pr, 0, Math.PI * 2);
            ctx.fill();

            // Earth's orbiting Moon
            if (pl.hasMoon) {
              const moonDist = 11;
              const mx = body.wx + Math.cos(earthMoonAngle) * moonDist;
              const mz = body.wz + Math.sin(earthMoonAngle) * moonDist;
              const mp = project3D(mx, 0, mz, 0, 0, 0, cosX, sinX, cosY, sinY, solarCamDist, fov, cx, cy);
              if (mp) {
                ctx.fillStyle = '#e2e8f0';
                ctx.beginPath();
                ctx.arc(mp.sx, mp.sy, Math.max(1.2, 1.6 * mp.scale), 0, Math.PI * 2);
                ctx.fill();
              }
            }

            // Planet Name Label
            if (localZoomNorm > 0.18) {
              ctx.font = '600 10.5px ui-sans-serif, system-ui, sans-serif';
              ctx.fillStyle = `rgba(241, 245, 249, ${Math.min(1, solarAlpha * 1.15)})`;
              const label = isEn ? pl.nameEn : pl.nameFa;
              ctx.fillText(label, body.sx + pr + 5, body.sy + 3.5);
            }
          }
        }

        ctx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

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
  }, [isEn]);

  const isSolarSystemView = zoomPercent >= 45;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-slate-950 overflow-hidden select-none"
    >
      {/* Interactive 3D Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block cursor-grab active:cursor-grabbing"
      />

      {/* Top Overlay: Cosmic Telemetry Header */}
      <div className="absolute top-6 left-6 right-6 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-slate-950/75 border border-white/10 backdrop-blur-md shadow-xl">
          <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300">
            {isSolarSystemView ? <Sun className="w-4 h-4 animate-spin" style={{ animationDuration: '18s' }} /> : <Sparkles className="w-4 h-4" />}
          </div>
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-2">
              <span>
                {isSolarSystemView
                  ? (isEn ? 'Solar System — Orion Arm Sector' : 'منظومه شمسی — بازوی شکارچی کهکشان راه شیری')
                  : (isEn ? 'Milky Way Galaxy — Deep Space Simulation' : 'کهکشان راه شیری — شبیه‌ساز سه‌بعدی و غبارهای کیهانی')}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              {isSolarSystemView
                ? (isEn
                    ? 'Sol + 8 Planetary Orbits + Main Asteroid Belt'
                    : 'خورشید + ۸ مدار سیاره‌ای + کمربند سیارک‌ها (اسکرول به پایین جهت بازگشت به کهکشان)')
                : (isEn
                    ? 'Scroll mouse wheel to zoom from Milky Way into the Solar System'
                    : 'با اسکرول ماوس زوم کنید تا از کهکشان راه شیری وارد منظومه شمسی شوید')}
            </div>
          </div>
        </div>

        {/* Scale Indicator */}
        <div className="px-3.5 py-2 rounded-xl bg-slate-950/75 border border-white/10 backdrop-blur-md text-xs font-mono text-cyan-300 flex items-center gap-2">
          <Compass className="w-4 h-4 text-cyan-400" />
          <span>
            {zoomPercent < 25
              ? (isEn ? 'Scale: 100,000 Light-Years' : 'مقیاس: ۱۰۰,۰۰۰ سال نوری')
              : zoomPercent < 55
              ? (isEn ? 'Scale: Orion-Cygnus Spur (26,000 LY)' : 'مقیاس: بازوی شکارچی (۲۶,۰۰۰ سال نوری)')
              : (isEn ? 'Scale: Inner & Outer Solar System (30 AU)' : 'مقیاس: منظومه شمسی (۳۰ واحد نجومی)')}
          </span>
        </div>
      </div>

      {/* Bottom Interactive Zoom & Navigation Bar */}
      <div className="absolute bottom-6 left-6 right-6 flex flex-wrap items-center justify-between gap-3">
        {/* Quick Scale Switcher Buttons */}
        <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-950/80 border border-white/10 backdrop-blur-md shadow-xl">
          <button
            type="button"
            onClick={() => handleSetZoomTarget(0)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              !isSolarSystemView
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Orbit className="w-3.5 h-3.5" />
            <span>{isEn ? 'Milky Way Galaxy' : 'نمای کل کهکشان راه شیری'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleSetZoomTarget(0.88)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              isSolarSystemView
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Sun className="w-3.5 h-3.5" />
            <span>{isEn ? 'Zoom to Solar System' : 'ورود به منظومه شمسی'}</span>
          </button>
        </div>

        {/* Interactive Scroll Zoom Slider & Controls */}
        <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-slate-950/80 border border-white/10 backdrop-blur-md shadow-xl">
          <button
            type="button"
            onClick={() => handleSetZoomTarget(targetZoomRef.current - 0.18)}
            title={isEn ? 'Zoom Out to Galaxy' : 'زوم به بیرون (کهکشان)'}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-slate-400">
              {isEn ? 'Zoom:' : 'زوم:'}
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={zoomPercent}
              onChange={(e) => handleSetZoomTarget(Number(e.target.value) / 100)}
              className="w-28 sm:w-36 accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />
            <span className="text-[11px] font-mono text-cyan-300 w-9 text-right">
              {zoomPercent}%
            </span>
          </div>

          <button
            type="button"
            onClick={() => handleSetZoomTarget(targetZoomRef.current + 0.18)}
            title={isEn ? 'Zoom In to Solar System' : 'زوم به داخل (منظومه شمسی)'}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => resetRotationRef.current?.()}
            title={isEn ? 'Reset View' : 'بازنشانی نما'}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white transition cursor-pointer border-l border-white/10 pl-2"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
