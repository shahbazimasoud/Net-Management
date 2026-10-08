/**
 * Favicon & Logo Processing Utilities
 * Provides dynamic document favicon management, preset SVG generation,
 * and high-resolution canvas scaling/fitting for panel logos and favicons.
 */

export type LogoPresetType = 'network' | 'shield' | 'server' | 'router' | 'cpu' | 'globe';
export type FaviconType = 'default' | 'same_as_logo' | 'custom_url' | 'preset';

/**
 * Generate clean, modern SVG favicon data URLs for panel presets
 */
export function getPresetFaviconDataUrl(preset: LogoPresetType = 'network'): string {
  let innerGraphic = '';

  switch (preset) {
    case 'shield':
      innerGraphic = `
        <path d="M32 14 L48 20 V34 C48 44 41 51 32 54 C23 51 16 44 16 34 V20 Z" fill="url(#grad)" stroke="#C084FC" stroke-width="2"/>
        <path d="M26 33 L30 37 L38 29" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      `;
      break;

    case 'server':
      innerGraphic = `
        <rect x="16" y="16" width="32" height="10" rx="3" fill="#1E293B" stroke="#34D399" stroke-width="1.8"/>
        <circle cx="22" cy="21" r="1.8" fill="#10B981"/>
        <circle cx="28" cy="21" r="1.8" fill="#10B981"/>
        <line x1="36" y1="21" x2="42" y2="21" stroke="#64748B" stroke-width="2" stroke-linecap="round"/>

        <rect x="16" y="28" width="32" height="10" rx="3" fill="#1E293B" stroke="#34D399" stroke-width="1.8"/>
        <circle cx="22" cy="33" r="1.8" fill="#10B981"/>
        <circle cx="28" cy="33" r="1.8" fill="#38BDF8"/>
        <line x1="36" y1="33" x2="42" y2="33" stroke="#64748B" stroke-width="2" stroke-linecap="round"/>

        <rect x="16" y="40" width="32" height="10" rx="3" fill="#1E293B" stroke="#34D399" stroke-width="1.8"/>
        <circle cx="22" cy="45" r="1.8" fill="#10B981"/>
        <circle cx="28" cy="45" r="1.8" fill="#10B981"/>
        <line x1="36" y1="45" x2="42" y2="45" stroke="#64748B" stroke-width="2" stroke-linecap="round"/>
      `;
      break;

    case 'router':
      innerGraphic = `
        <rect x="15" y="24" width="34" height="16" rx="5" fill="#1E293B" stroke="#38BDF8" stroke-width="2"/>
        <circle cx="22" cy="32" r="2.2" fill="#38BDF8"/>
        <circle cx="28" cy="32" r="2.2" fill="#34D399"/>
        <circle cx="34" cy="32" r="2.2" fill="#F59E0B"/>
        <circle cx="42" cy="32" r="2.2" fill="#818CF8"/>
        <!-- Antennas -->
        <line x1="22" y1="24" x2="20" y2="15" stroke="#38BDF8" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="42" y1="24" x2="44" y2="15" stroke="#38BDF8" stroke-width="2.5" stroke-linecap="round"/>
      `;
      break;

    case 'cpu':
      innerGraphic = `
        <rect x="20" y="20" width="24" height="24" rx="4" fill="#1E293B" stroke="#F43F5E" stroke-width="2"/>
        <rect x="26" y="26" width="12" height="12" rx="2" fill="url(#grad)"/>
        <!-- Pins -->
        <path d="M26 15 V20 M32 15 V20 M38 15 V20" stroke="#FB7185" stroke-width="2" stroke-linecap="round"/>
        <path d="M26 44 V49 M32 44 V49 M38 44 V49" stroke="#FB7185" stroke-width="2" stroke-linecap="round"/>
        <path d="M15 26 H20 M15 32 H20 M15 38 H20" stroke="#FB7185" stroke-width="2" stroke-linecap="round"/>
        <path d="M44 26 H49 M44 32 H49 M44 38 H49" stroke="#FB7185" stroke-width="2" stroke-linecap="round"/>
      `;
      break;

    case 'globe':
      innerGraphic = `
        <circle cx="32" cy="32" r="18" fill="#1E293B" stroke="#F59E0B" stroke-width="2"/>
        <ellipse cx="32" cy="32" rx="9" ry="18" fill="none" stroke="#FBBF24" stroke-width="1.8"/>
        <line x1="14" y1="32" x2="50" y2="32" stroke="#FBBF24" stroke-width="1.8"/>
        <line x1="18" y1="23" x2="46" y2="23" stroke="#FBBF24" stroke-width="1.2" stroke-dasharray="2 2"/>
        <line x1="18" y1="41" x2="46" y2="41" stroke="#FBBF24" stroke-width="1.2" stroke-dasharray="2 2"/>
      `;
      break;

    case 'network':
    default:
      innerGraphic = `
        <path d="M32 18 L32 46" stroke="#38BDF8" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M18 32 L46 32" stroke="#38BDF8" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="32" cy="32" r="7" fill="url(#grad)"/>
        <circle cx="32" cy="32" r="3" fill="#FFFFFF"/>
        <circle cx="32" cy="18" r="4" fill="#38BDF8"/>
        <circle cx="32" cy="46" r="4" fill="#38BDF8"/>
        <circle cx="18" cy="32" r="4" fill="#818CF8"/>
        <circle cx="46" cy="32" r="4" fill="#818CF8"/>
      `;
      break;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#6366F1"/>
        <stop offset="50%" stop-color="#3B82F6"/>
        <stop offset="100%" stop-color="#06B6D4"/>
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="16" fill="#090D1A"/>
    <rect width="64" height="64" rx="16" fill="none" stroke="#6366F1" stroke-width="2" stroke-opacity="0.4"/>
    ${innerGraphic}
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Determine the active favicon URL and MIME type given panel general settings
 */
export function resolveFaviconUrl(settings: {
  faviconType?: FaviconType;
  faviconCustomUrl?: string;
  faviconPreset?: LogoPresetType;
  logoType?: 'default' | 'preset' | 'custom_url';
  logoPreset?: LogoPresetType;
  logoCustomUrl?: string;
}): { href: string; type: string } {
  const fType = settings.faviconType || 'default';

  if (fType === 'custom_url' && settings.faviconCustomUrl?.trim()) {
    const url = settings.faviconCustomUrl.trim();
    const isSvg = url.startsWith('data:image/svg') || url.toLowerCase().includes('.svg');
    return {
      href: url,
      type: isSvg ? 'image/svg+xml' : 'image/png',
    };
  }

  if (fType === 'same_as_logo') {
    if (settings.logoType === 'custom_url' && settings.logoCustomUrl?.trim()) {
      const url = settings.logoCustomUrl.trim();
      const isSvg = url.startsWith('data:image/svg') || url.toLowerCase().includes('.svg');
      return {
        href: url,
        type: isSvg ? 'image/svg+xml' : 'image/png',
      };
    }
    if (settings.logoType === 'preset' && settings.logoPreset) {
      return {
        href: getPresetFaviconDataUrl(settings.logoPreset),
        type: 'image/svg+xml',
      };
    }
    return {
      href: '/favicon.svg',
      type: 'image/svg+xml',
    };
  }

  if (fType === 'preset') {
    return {
      href: getPresetFaviconDataUrl(settings.faviconPreset || 'network'),
      type: 'image/svg+xml',
    };
  }

  // Default system favicon
  return {
    href: '/favicon.svg',
    type: 'image/svg+xml',
  };
}

/**
 * Dynamically updates document <link rel="icon"> and <link rel="shortcut icon">
 */
export function updateDocumentFavicon(settings: {
  faviconType?: FaviconType;
  faviconCustomUrl?: string;
  faviconPreset?: LogoPresetType;
  logoType?: 'default' | 'preset' | 'custom_url';
  logoPreset?: LogoPresetType;
  logoCustomUrl?: string;
}): void {
  if (typeof document === 'undefined') return;

  const { href, type } = resolveFaviconUrl(settings);

  // Update or insert primary rel="icon"
  let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = type;
  link.href = href;

  // Also update shortcut icon if exists or create to maximize browser compatibility
  let shortcut = document.querySelector<HTMLLinkElement>("link[rel='shortcut icon']");
  if (shortcut) {
    shortcut.type = type;
    shortcut.href = href;
  }
}

/**
 * Process any uploaded image (PNG, SVG, JPG, WebP, etc.) of any size or resolution
 * and scale/fit it into a clean, transparent, high-DPI square canvas (256x256)
 * matching the panel's logo dimensions with crisp centering and no distortion.
 */
export function scaleImageToPanelLogo(
  file: File,
  targetSize = 256
): Promise<{
  dataUrl: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  sizeBytes: number;
  format: 'png' | 'svg';
}> {
  return new Promise((resolve, reject) => {
    // If it's an SVG and user explicitly wants SVG vector, we can still provide a canvas-processed
    // crisp PNG or keep as SVG. Converting to PNG ensures universal browser and tab rendering.
    const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = (e) => {
      const initialDataUrl = e.target?.result as string;
      if (!initialDataUrl) {
        return reject(new Error('Empty file content'));
      }

      // If user uploaded an SVG, we can either keep pure SVG or rasterize to PNG.
      // But user requested: "هر سایزی که اپلود کرد به سایز خود لوگو پنل بشه و PNG هم قابل قبول باشه"
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const originalWidth = img.naturalWidth || targetSize;
          const originalHeight = img.naturalHeight || targetSize;

          const canvas = document.createElement('canvas');
          canvas.width = targetSize;
          canvas.height = targetSize;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            return resolve({
              dataUrl: initialDataUrl,
              width: targetSize,
              height: targetSize,
              originalWidth,
              originalHeight,
              sizeBytes: file.size,
              format: isSvg ? 'svg' : 'png',
            });
          }

          // Enable high-quality image smoothing
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // Clear with full transparency
          ctx.clearRect(0, 0, targetSize, targetSize);

          // Calculate aspect ratio contain fit with padding so it never touches edges harshly
          const padding = Math.round(targetSize * 0.06); // 6% inner padding for breathing room
          const availableSize = targetSize - padding * 2;
          const scale = Math.min(availableSize / originalWidth, availableSize / originalHeight);
          const drawW = Math.round(originalWidth * scale);
          const drawH = Math.round(originalHeight * scale);
          const posX = Math.round((targetSize - drawW) / 2);
          const posY = Math.round((targetSize - drawH) / 2);

          ctx.drawImage(img, posX, posY, drawW, drawH);

          // Output clean PNG with alpha channel
          const scaledPng = canvas.toDataURL('image/png', 0.95);
          resolve({
            dataUrl: scaledPng,
            width: targetSize,
            height: targetSize,
            originalWidth,
            originalHeight,
            sizeBytes: Math.round((scaledPng.length * 3) / 4),
            format: 'png',
          });
        } catch (canvasErr) {
          // If canvas fails (e.g. cross-origin taint on rare edge case), fallback to dataUrl
          resolve({
            dataUrl: initialDataUrl,
            width: targetSize,
            height: targetSize,
            originalWidth: img.naturalWidth || targetSize,
            originalHeight: img.naturalHeight || targetSize,
            sizeBytes: file.size,
            format: isSvg ? 'svg' : 'png',
          });
        }
      };

      img.onerror = () => {
        // Fallback directly to file reader data
        resolve({
          dataUrl: initialDataUrl,
          width: targetSize,
          height: targetSize,
          originalWidth: targetSize,
          originalHeight: targetSize,
          sizeBytes: file.size,
          format: isSvg ? 'svg' : 'png',
        });
      };

      img.src = initialDataUrl;
    };

    reader.readAsDataURL(file);
  });
}
