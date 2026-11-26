/**
 * Runtime rendering fixes for Apache Guacamole `guacamole-common-js@1.5.0`.
 *
 * Root causes fixed:
 * 1. `Guacamole.Layer` maps channel mask `0xC` (`GUAC_COMP_SRC`) to HTML5 Canvas
 *    `globalCompositeOperation = "copy"`. Per the HTML5 Canvas 2D specification,
 *    an unclipped `"copy"` draw clears the ENTIRE canvas outside the drawn image
 *    or path to transparent `rgba(0,0,0,0)`, wiping large areas of the remote
 *    desktop whenever `guacd` sends `cfill`, `copy`, or `img` with mask `12`.
 *    We replace unclipped `"copy"` draws with bounded `clearRect` / clipped
 *    `destination-out` + `"source-over"`, and guard overlapping self-copies with
 *    a scratch canvas snapshot so window drags/scrolls never smear.
 * 2. `Guacamole.Display.drawStream` does not reserve a task slot in the frame
 *    queue until the stream's `"end"` instruction arrives, whereas `Guacamole.Client`
 *    calls `display.setChannelMask(layer, mask)` immediately upon `"img"`. When
 *    multiple streams or `copy`/`cfill` instructions interleave (e.g. switching
 *    windows), images draw out-of-order and inherit wrong channel masks (such as
 *    `0xC`), leaving stale window remnants behind.
 * 3. `Guacamole.Display.drawBlob` never attaches `.catch()` to
 *    `window.createImageBitmap(blob)` (causing permanent frame-queue deadlocks
 *    on decode errors) and never calls `ImageBitmap.close()` after painting
 *    (leaking Chromium GPU canvas textures until tiles black out or corrupt).
 */

const LAYER_PATCHED_FLAG = '__nettopoLayerPatched';
const DISPLAY_PATCHED_FLAG = '__nettopoDisplayPatched';
const GUAC_INSTALLED_FLAG = '__nettopoRenderFixesInstalled';

const IMAGE_DECODE_TIMEOUT_MS = 4000;
const STREAM_END_TIMEOUT_MS = 8000;
const RAF_STALL_WATCHDOG_MS = 150;

/**
 * Toggles synchronous background flush mode on a patched `Guacamole.Display`.
 * When enabled (e.g., modal minimized or browser tab hidden), frames flush
 * synchronously without waiting on `requestAnimationFrame` so `Guacamole.Client`
 * immediately sends `sync` acknowledgments back to `guacd` and prevents
 * `GUAC_USER_TIMEOUT` session disconnects.
 */
export function setGuacamoleDisplayBackgroundMode(display: any, enabled: boolean): void {
  if (display && typeof display.__nettopoSetBackgroundMode === 'function') {
    try {
      display.__nettopoSetBackgroundMode(Boolean(enabled));
    } catch {}
  }
}

type DrawableSource = ImageBitmap | HTMLImageElement;

interface DecodedAsset {
  image: DrawableSource | null;
  release: () => void;
}

interface QueuedOp {
  blocked: boolean;
  cancelled: boolean;
  replay: () => void;
  cleanup: (() => void) | null;
}

interface QueuedFrame {
  ops: QueuedOp[];
  callback?: () => void;
  timestamp?: number;
  logicalFrames?: number;
}

function getDrawableSize(image: any): { width: number; height: number } {
  if (!image) return { width: 0, height: 0 };
  const width = Number(image.width ?? image.naturalWidth ?? image.videoWidth ?? 0) || 0;
  const height = Number(image.height ?? image.naturalHeight ?? image.videoHeight ?? 0) || 0;
  return { width, height };
}

function rectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number
): boolean {
  return !(ax + aw <= bx || bx + bw <= ax || ay + ah <= by || by + bh <= ay);
}

function decodeBlobViaHtmlImage(blob: Blob): Promise<DecodedAsset> {
  return new Promise((resolve) => {
    if (
      typeof URL === 'undefined' ||
      typeof URL.createObjectURL !== 'function' ||
      typeof Image === 'undefined'
    ) {
      resolve({ image: null, release: () => {} });
      return;
    }

    let url: string | null = null;
    try {
      url = URL.createObjectURL(blob);
    } catch {
      resolve({ image: null, release: () => {} });
      return;
    }

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      if (url) {
        try {
          URL.revokeObjectURL(url);
        } catch {}
        url = null;
      }
    };

    let settled = false;
    const finish = (result: DecodedAsset) => {
      if (settled) {
        result.release();
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      resolve(result);
    };

    const img = new Image();
    const timeoutId = setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      release();
      finish({ image: null, release: () => {} });
    }, IMAGE_DECODE_TIMEOUT_MS);

    img.onload = () => {
      if (img.width > 0 && img.height > 0) {
        finish({ image: img, release });
      } else {
        release();
        finish({ image: null, release: () => {} });
      }
    };
    img.onerror = () => {
      release();
      finish({ image: null, release: () => {} });
    };
    img.src = url;
  });
}

async function decodeBlobSafely(blob: Blob): Promise<DecodedAsset> {
  if (!blob || blob.size === 0) {
    return { image: null, release: () => {} };
  }

  const createBitmapFn =
    typeof globalThis !== 'undefined' && typeof (globalThis as any).createImageBitmap === 'function'
      ? (globalThis as any).createImageBitmap.bind(globalThis)
      : null;

  if (createBitmapFn) {
    try {
      let timedOut = false;
      const bitmap: ImageBitmap | null = await new Promise<ImageBitmap | null>((resolve, reject) => {
        const timer = setTimeout(() => {
          timedOut = true;
          resolve(null);
        }, IMAGE_DECODE_TIMEOUT_MS);

        Promise.resolve(createBitmapFn(blob))
          .then((bm: ImageBitmap) => {
            clearTimeout(timer);
            if (timedOut) {
              try {
                bm?.close?.();
              } catch {}
              return;
            }
            resolve(bm);
          })
          .catch((err: unknown) => {
            clearTimeout(timer);
            if (!timedOut) {
              reject(err);
            }
          });
      });

      if (bitmap) {
        let closed = false;
        const release = () => {
          if (closed) return;
          closed = true;
          try {
            if (typeof bitmap.close === 'function') {
              bitmap.close();
            }
          } catch {}
        };
        return { image: bitmap, release };
      }
      return { image: null, release: () => {} };
    } catch {
      // Fallback to HTMLImageElement if createImageBitmap rejects a chunk/codec;
      // never leave the display frame queue permanently deadlocked.
      return decodeBlobViaHtmlImage(blob);
    }
  }

  return decodeBlobViaHtmlImage(blob);
}

/**
 * Patches a single `Guacamole.Layer` (or `VisibleLayer`) instance in-place so:
 * - `GUAC_COMP_SRC` (`0xC`, Canvas2D `"copy"`) NEVER wipes pixels outside the
 *   drawn rectangle/path.
 * - Overlapping self-copies (`srcLayer === dstLayer`) snapshot via a scratch
 *   canvas before blitting.
 */
export function patchGuacamoleLayer(layer: any): any {
  if (!layer || typeof layer !== 'object' || layer[LAYER_PATCHED_FLAG]) {
    return layer;
  }
  layer[LAYER_PATCHED_FLAG] = true;

  let scratchCanvas: HTMLCanvasElement | null = null;
  let scratchCtx: CanvasRenderingContext2D | null = null;

  const getScratchSurface = (w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null => {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
      return null;
    }
    if (!scratchCanvas) {
      scratchCanvas = document.createElement('canvas');
      scratchCtx = scratchCanvas.getContext('2d');
    }
    if (!scratchCanvas || !scratchCtx) return null;
    if (scratchCanvas.width < w || scratchCanvas.height < h) {
      scratchCanvas.width = Math.max(scratchCanvas.width, w);
      scratchCanvas.height = Math.max(scratchCanvas.height, h);
    }
    return { canvas: scratchCanvas, ctx: scratchCtx };
  };

  const getContext = (): CanvasRenderingContext2D | null => {
    try {
      const c = typeof layer.getCanvas === 'function' ? layer.getCanvas() : null;
      return c ? c.getContext('2d') : null;
    } catch {
      return null;
    }
  };

  const ensureAutosize = (x: number, y: number, w: number, h: number) => {
    if (!layer.autosize || typeof layer.resize !== 'function') return;
    const reqW = Math.max(Number(layer.width) || 0, x + w);
    const reqH = Math.max(Number(layer.height) || 0, y + h);
    if (reqW > (Number(layer.width) || 0) || reqH > (Number(layer.height) || 0)) {
      layer.resize(reqW, reqH);
    }
  };

  const origDrawImage = typeof layer.drawImage === 'function' ? layer.drawImage : null;
  if (origDrawImage) {
    layer.drawImage = function patchedDrawImage(x: number, y: number, image: any) {
      const ctx = getContext();
      if (ctx && ctx.globalCompositeOperation === 'copy') {
        const { width, height } = getDrawableSize(image);
        if (width <= 0 || height <= 0) return;
        // Grow layer BEFORE ctx.save() because canvas resize resets the context state stack
        ensureAutosize(x, y, width, height);
        ctx.save();
        ctx.clearRect(x, y, width, height);
        ctx.globalCompositeOperation = 'source-over';
        origDrawImage.call(layer, x, y, image);
        ctx.restore();
        return;
      }
      origDrawImage.call(layer, x, y, image);
    };
  }

  const origCopy = typeof layer.copy === 'function' ? layer.copy : null;
  if (origCopy) {
    layer.copy = function patchedCopy(
      srcLayer: any,
      srcx: number,
      srcy: number,
      srcw: number,
      srch: number,
      x: number,
      y: number
    ) {
      const srcCanvas = srcLayer && typeof srcLayer.getCanvas === 'function' ? srcLayer.getCanvas() : null;
      if (!srcCanvas) return;

      if (srcx >= srcCanvas.width || srcy >= srcCanvas.height) return;
      let effW = srcw;
      let effH = srch;
      if (srcx + effW > srcCanvas.width) effW = srcCanvas.width - srcx;
      if (srcy + effH > srcCanvas.height) effH = srcCanvas.height - srcy;
      if (effW <= 0 || effH <= 0) return;

      // Grow destination layer before saving context or taking snapshot
      ensureAutosize(x, y, effW, effH);

      const dstCanvas = typeof layer.getCanvas === 'function' ? layer.getCanvas() : null;
      const isSelfCopy = srcLayer === layer || (dstCanvas !== null && srcCanvas === dstCanvas);
      const needsSnapshot = isSelfCopy && rectsOverlap(srcx, srcy, effW, effH, x, y, effW, effH);

      let effectiveSrcLayer = srcLayer;
      let effSrcX = srcx;
      let effSrcY = srcy;

      if (needsSnapshot) {
        const scratch = getScratchSurface(effW, effH);
        if (scratch) {
          scratch.ctx.save();
          scratch.ctx.globalCompositeOperation = 'source-over';
          scratch.ctx.clearRect(0, 0, effW, effH);
          scratch.ctx.drawImage(srcCanvas, srcx, srcy, effW, effH, 0, 0, effW, effH);
          scratch.ctx.restore();
          effectiveSrcLayer = { getCanvas: () => scratch.canvas };
          effSrcX = 0;
          effSrcY = 0;
        }
      }

      const ctx = getContext();
      if (ctx && ctx.globalCompositeOperation === 'copy') {
        ctx.save();
        ctx.clearRect(x, y, effW, effH);
        ctx.globalCompositeOperation = 'source-over';
        origCopy.call(layer, effectiveSrcLayer, effSrcX, effSrcY, effW, effH, x, y);
        ctx.restore();
        return;
      }

      origCopy.call(layer, effectiveSrcLayer, effSrcX, effSrcY, effW, effH, x, y);
    };
  }

  const origFillColor = typeof layer.fillColor === 'function' ? layer.fillColor : null;
  if (origFillColor) {
    layer.fillColor = function patchedFillColor(r: number, g: number, b: number, a: number) {
      const ctx = getContext();
      if (ctx && ctx.globalCompositeOperation === 'copy') {
        if (a >= 255) {
          // Opaque source-over inside the current path is mathematically identical to
          // bounded GUAC_COMP_SRC and never clears pixels outside the path.
          ctx.save();
          ctx.globalCompositeOperation = 'source-over';
          origFillColor.call(layer, r, g, b, a);
          ctx.restore();
          return;
        }
        // Semi-transparent or alpha=0 GUAC_COMP_SRC: clip strictly to current path,
        // clear only inside the path with destination-out, then paint via source-over.
        ctx.save();
        ctx.clip();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0,0,0,1)';
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        origFillColor.call(layer, r, g, b, a);
        ctx.restore();
        return;
      }
      origFillColor.call(layer, r, g, b, a);
    };
  }

  const origFillLayer = typeof layer.fillLayer === 'function' ? layer.fillLayer : null;
  if (origFillLayer) {
    layer.fillLayer = function patchedFillLayer(srcLayer: any) {
      const ctx = getContext();
      if (ctx && ctx.globalCompositeOperation === 'copy') {
        ctx.save();
        ctx.clip();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0,0,0,1)';
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        origFillLayer.call(layer, srcLayer);
        ctx.restore();
        return;
      }
      origFillLayer.call(layer, srcLayer);
    };
  }

  const origStrokeColor = typeof layer.strokeColor === 'function' ? layer.strokeColor : null;
  if (origStrokeColor) {
    layer.strokeColor = function patchedStrokeColor(
      cap: string,
      join: string,
      thickness: number,
      r: number,
      g: number,
      b: number,
      a: number
    ) {
      const ctx = getContext();
      if (ctx && ctx.globalCompositeOperation === 'copy') {
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        origStrokeColor.call(layer, cap, join, thickness, r, g, b, a);
        ctx.restore();
        return;
      }
      origStrokeColor.call(layer, cap, join, thickness, r, g, b, a);
    };
  }

  const origStrokeLayer = typeof layer.strokeLayer === 'function' ? layer.strokeLayer : null;
  if (origStrokeLayer) {
    layer.strokeLayer = function patchedStrokeLayer(
      cap: string,
      join: string,
      thickness: number,
      srcLayer: any
    ) {
      const ctx = getContext();
      if (ctx && ctx.globalCompositeOperation === 'copy') {
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        origStrokeLayer.call(layer, cap, join, thickness, srcLayer);
        ctx.restore();
        return;
      }
      origStrokeLayer.call(layer, cap, join, thickness, srcLayer);
    };
  }

  return layer;
}

/**
 * Patches a `Guacamole.Display` instance so:
 * - `drawStream` reserves its exact FIFO task slot synchronously when `"img"`
 *   arrives (preventing out-of-order drawing & channelMask clobbering across
 *   interleaved streams and `copy`/`cfill` instructions).
 * - `drawStream` and `drawBlob` safely handle `createImageBitmap` rejections
 *   (no permanent frame-queue deadlock) and immediately call `ImageBitmap.close()`
 *   once the frame has painted (no Chromium GPU texture leak).
 * - Consecutive ready frames coalesce cleanly instead of stalling at 1 frame/rAF.
 */
export function patchGuacamoleDisplay(display: any, GuacamoleRef: any): any {
  if (!display || typeof display !== 'object' || display[DISPLAY_PATCHED_FLAG]) {
    return display;
  }
  display[DISPLAY_PATCHED_FLAG] = true;

  // Ensure all layers owned or created by this display are patched
  try {
    if (typeof display.getDefaultLayer === 'function') {
      patchGuacamoleLayer(display.getDefaultLayer());
    }
    if (typeof display.getCursorLayer === 'function') {
      patchGuacamoleLayer(display.getCursorLayer());
    }
  } catch {}

  if (typeof display.createLayer === 'function') {
    const origCreateLayer = display.createLayer.bind(display);
    display.createLayer = function patchedCreateLayer() {
      return patchGuacamoleLayer(origCreateLayer());
    };
  }
  if (typeof display.createBuffer === 'function') {
    const origCreateBuffer = display.createBuffer.bind(display);
    display.createBuffer = function patchedCreateBuffer() {
      return patchGuacamoleLayer(origCreateBuffer());
    };
  }

  const orig = {
    setCursor: display.setCursor.bind(display),
    resize: display.resize.bind(display),
    drawImage: display.drawImage.bind(display),
    drawBlob: display.drawBlob.bind(display),
    drawStream: display.drawStream.bind(display),
    draw: display.draw.bind(display),
    play: display.play.bind(display),
    transfer: display.transfer.bind(display),
    put: display.put.bind(display),
    copy: display.copy.bind(display),
    moveTo: display.moveTo.bind(display),
    lineTo: display.lineTo.bind(display),
    arc: display.arc.bind(display),
    curveTo: display.curveTo.bind(display),
    close: display.close.bind(display),
    rect: display.rect.bind(display),
    clip: display.clip.bind(display),
    strokeColor: display.strokeColor.bind(display),
    fillColor: display.fillColor.bind(display),
    strokeLayer: display.strokeLayer.bind(display),
    fillLayer: display.fillLayer.bind(display),
    push: display.push.bind(display),
    pop: display.pop.bind(display),
    reset: display.reset.bind(display),
    setTransform: display.setTransform.bind(display),
    transform: display.transform.bind(display),
    setChannelMask: display.setChannelMask.bind(display),
    setMiterLimit: display.setMiterLimit.bind(display),
    dispose: display.dispose.bind(display),
    distort: display.distort.bind(display),
    move: display.move.bind(display),
    shade: display.shade.bind(display),
    flush: display.flush.bind(display),
    cancel: display.cancel.bind(display),
  };

  let pendingOps: QueuedOp[] = [];
  let pendingFrames: QueuedFrame[] = [];
  const inFlightCleanups = new Set<() => void>();
  let backgroundMode = false;
  let inFlightOrigFlushes = 0;
  let rafWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const clearRafWatchdog = () => {
    if (rafWatchdogTimer !== null) {
      clearTimeout(rafWatchdogTimer);
      rafWatchdogTimer = null;
    }
  };

  /**
   * Executes `orig.flush(...)` synchronously without waiting on `requestAnimationFrame`.
   * Guacamole.Display.__flush_frames() chooses `syncFlush()` whenever `document.hasFocus()`
   * is false; temporarily shadowing `document.hasFocus` strictly across the synchronous
   * `orig.flush` call forces Guacamole.Display to drain ALL queued frames and run every
   * `displaySyncComplete` callback immediately so `4.sync,<timestamp>;` is sent to `guacd`.
   */
  const flushOrigSynchronously = (
    callback?: () => void,
    timestamp?: number,
    logicalFrames?: number
  ) => {
    if (typeof document !== 'undefined' && typeof document.hasFocus === 'function') {
      const hadOwn = Object.prototype.hasOwnProperty.call(document, 'hasFocus');
      const prevDescriptor = hadOwn ? Object.getOwnPropertyDescriptor(document, 'hasFocus') : undefined;
      let overridden = false;
      try {
        Object.defineProperty(document, 'hasFocus', {
          configurable: true,
          writable: true,
          value: () => false,
        });
        overridden = true;
      } catch {
        overridden = false;
      }
      try {
        orig.flush(callback, timestamp, logicalFrames);
      } finally {
        if (overridden) {
          try {
            if (hadOwn && prevDescriptor) {
              Object.defineProperty(document, 'hasFocus', prevDescriptor);
            } else {
              delete (document as any).hasFocus;
            }
          } catch {}
        }
      }
      return;
    }
    orig.flush(callback, timestamp, logicalFrames);
  };

  const drainStalledOrigFlushes = () => {
    clearRafWatchdog();
    if (disposed || inFlightOrigFlushes <= 0) return;
    // Pushing an empty synchronous flush drains every previously queued frame inside
    // Guacamole.Display's internal `frames[]` array immediately (including stalled rAF frames).
    flushOrigSynchronously(undefined);
  };

  const scheduleRafWatchdog = () => {
    if (rafWatchdogTimer !== null || inFlightOrigFlushes <= 0 || disposed) return;
    rafWatchdogTimer = setTimeout(() => {
      rafWatchdogTimer = null;
      if (!disposed && inFlightOrigFlushes > 0) {
        drainStalledOrigFlushes();
      }
    }, RAF_STALL_WATCHDOG_MS);
  };

  const handleVisibilityChange = () => {
    if (disposed) return;
    if (typeof document !== 'undefined' && document.hidden && inFlightOrigFlushes > 0) {
      drainStalledOrigFlushes();
    }
  };

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  display.__nettopoSetBackgroundMode = (enabled: boolean) => {
    backgroundMode = Boolean(enabled);
    if (backgroundMode && inFlightOrigFlushes > 0) {
      drainStalledOrigFlushes();
    }
  };

  display.__nettopoDispose = () => {
    disposed = true;
    clearRafWatchdog();
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  };

  const isFrameReady = (frame: QueuedFrame): boolean => {
    for (let i = 0; i < frame.ops.length; i++) {
      if (frame.ops[i].blocked) return false;
    }
    return true;
  };

  const tryDrainFrames = () => {
    if (pendingFrames.length === 0 || !isFrameReady(pendingFrames[0])) {
      return;
    }

    const readyFrames: QueuedFrame[] = [];
    while (pendingFrames.length > 0 && isFrameReady(pendingFrames[0])) {
      readyFrames.push(pendingFrames.shift()!);
    }

    const frameCleanups: Array<() => void> = [];
    const frameCallbacks: Array<() => void> = [];
    let totalLogicalFrames = 0;
    let lastTimestamp: number | undefined = undefined;

    for (let f = 0; f < readyFrames.length; f++) {
      const frame = readyFrames[f];
      if (frame.timestamp !== undefined) lastTimestamp = frame.timestamp;
      totalLogicalFrames += frame.logicalFrames || 0;

      for (let i = 0; i < frame.ops.length; i++) {
        const op = frame.ops[i];
        if (!op.cancelled) {
          op.replay();
        }
        if (op.cleanup) {
          frameCleanups.push(op.cleanup);
          inFlightCleanups.add(op.cleanup);
        }
      }

      if (typeof frame.callback === 'function') {
        frameCallbacks.push(frame.callback);
      }
    }

    let flushed = false;
    inFlightOrigFlushes++;

    const onOrigFlushed = () => {
      if (flushed) return;
      flushed = true;
      inFlightOrigFlushes = Math.max(0, inFlightOrigFlushes - 1);
      if (inFlightOrigFlushes === 0) {
        clearRafWatchdog();
      }
      for (let i = 0; i < frameCleanups.length; i++) {
        const fn = frameCleanups[i];
        inFlightCleanups.delete(fn);
        try {
          fn();
        } catch {}
      }
      for (let i = 0; i < frameCallbacks.length; i++) {
        try {
          frameCallbacks[i]();
        } catch {}
      }
    };

    const shouldFlushSync =
      backgroundMode || (typeof document !== 'undefined' && Boolean(document.hidden));

    if (shouldFlushSync) {
      flushOrigSynchronously(onOrigFlushed, lastTimestamp, totalLogicalFrames);
    } else {
      orig.flush(onOrigFlushed, lastTimestamp, totalLogicalFrames);
      if (!flushed) {
        scheduleRafWatchdog();
      }
    }
  };

  const enqueueSync = (replay: () => void) => {
    pendingOps.push({
      blocked: false,
      cancelled: false,
      replay,
      cleanup: null,
    });
  };

  const enqueueDecodedBlob = (layer: any, x: number, y: number, blobPromise: Promise<Blob | null>) => {
    patchGuacamoleLayer(layer);
    let asset: DecodedAsset | null = null;

    const op: QueuedOp = {
      blocked: true,
      cancelled: false,
      replay: () => {
        if (asset?.image) {
          orig.drawImage(layer, x, y, asset.image);
        }
      },
      cleanup: () => {
        if (asset) {
          const toRelease = asset;
          asset = null;
          toRelease.release();
        }
      },
    };
    pendingOps.push(op);

    blobPromise
      .then((blob) => {
        if (op.cancelled || !blob || blob.size === 0) {
          return null;
        }
        return decodeBlobSafely(blob);
      })
      .then((decoded) => {
        if (op.cancelled) {
          decoded?.release();
          return;
        }
        asset = decoded;
        op.blocked = false;
        tryDrainFrames();
      })
      .catch(() => {
        if (op.cancelled) return;
        asset = null;
        op.blocked = false;
        tryDrainFrames();
      });
  };

  // Ordered sync operations
  display.setCursor = (hotspotX: number, hotspotY: number, layer: any, srcx: number, srcy: number, srcw: number, srch: number) => {
    enqueueSync(() => orig.setCursor(hotspotX, hotspotY, layer, srcx, srcy, srcw, srch));
  };
  display.resize = (layer: any, width: number, height: number) => {
    patchGuacamoleLayer(layer);
    enqueueSync(() => orig.resize(layer, width, height));
  };
  display.drawImage = (layer: any, x: number, y: number, image: any) => {
    patchGuacamoleLayer(layer);
    enqueueSync(() => orig.drawImage(layer, x, y, image));
  };
  display.play = (layer: any, mimetype: string, duration: number, url: string) => {
    patchGuacamoleLayer(layer);
    enqueueSync(() => orig.play(layer, mimetype, duration, url));
  };
  display.transfer = (srcLayer: any, srcx: number, srcy: number, srcw: number, srch: number, dstLayer: any, x: number, y: number, transferFunction: any) => {
    patchGuacamoleLayer(dstLayer);
    enqueueSync(() => orig.transfer(srcLayer, srcx, srcy, srcw, srch, dstLayer, x, y, transferFunction));
  };
  display.put = (srcLayer: any, srcx: number, srcy: number, srcw: number, srch: number, dstLayer: any, x: number, y: number) => {
    patchGuacamoleLayer(dstLayer);
    enqueueSync(() => orig.put(srcLayer, srcx, srcy, srcw, srch, dstLayer, x, y));
  };
  display.copy = (srcLayer: any, srcx: number, srcy: number, srcw: number, srch: number, dstLayer: any, x: number, y: number) => {
    patchGuacamoleLayer(dstLayer);
    enqueueSync(() => orig.copy(srcLayer, srcx, srcy, srcw, srch, dstLayer, x, y));
  };
  display.moveTo = (layer: any, x: number, y: number) => {
    enqueueSync(() => orig.moveTo(layer, x, y));
  };
  display.lineTo = (layer: any, x: number, y: number) => {
    enqueueSync(() => orig.lineTo(layer, x, y));
  };
  display.arc = (layer: any, x: number, y: number, radius: number, startAngle: number, endAngle: number, negative: boolean) => {
    enqueueSync(() => orig.arc(layer, x, y, radius, startAngle, endAngle, negative));
  };
  display.curveTo = (layer: any, cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) => {
    enqueueSync(() => orig.curveTo(layer, cp1x, cp1y, cp2x, cp2y, x, y));
  };
  display.close = (layer: any) => {
    enqueueSync(() => orig.close(layer));
  };
  display.rect = (layer: any, x: number, y: number, w: number, h: number) => {
    enqueueSync(() => orig.rect(layer, x, y, w, h));
  };
  display.clip = (layer: any) => {
    enqueueSync(() => orig.clip(layer));
  };
  display.strokeColor = (layer: any, cap: string, join: string, thickness: number, r: number, g: number, b: number, a: number) => {
    patchGuacamoleLayer(layer);
    enqueueSync(() => orig.strokeColor(layer, cap, join, thickness, r, g, b, a));
  };
  display.fillColor = (layer: any, r: number, g: number, b: number, a: number) => {
    patchGuacamoleLayer(layer);
    enqueueSync(() => orig.fillColor(layer, r, g, b, a));
  };
  display.strokeLayer = (layer: any, cap: string, join: string, thickness: number, srcLayer: any) => {
    patchGuacamoleLayer(layer);
    enqueueSync(() => orig.strokeLayer(layer, cap, join, thickness, srcLayer));
  };
  display.fillLayer = (layer: any, srcLayer: any) => {
    patchGuacamoleLayer(layer);
    enqueueSync(() => orig.fillLayer(layer, srcLayer));
  };
  display.push = (layer: any) => {
    enqueueSync(() => orig.push(layer));
  };
  display.pop = (layer: any) => {
    enqueueSync(() => orig.pop(layer));
  };
  display.reset = (layer: any) => {
    enqueueSync(() => orig.reset(layer));
  };
  display.setTransform = (layer: any, a: number, b: number, c: number, d: number, e: number, f: number) => {
    enqueueSync(() => orig.setTransform(layer, a, b, c, d, e, f));
  };
  display.transform = (layer: any, a: number, b: number, c: number, d: number, e: number, f: number) => {
    enqueueSync(() => orig.transform(layer, a, b, c, d, e, f));
  };
  display.setChannelMask = (layer: any, mask: number) => {
    patchGuacamoleLayer(layer);
    enqueueSync(() => orig.setChannelMask(layer, mask));
  };
  display.setMiterLimit = (layer: any, limit: number) => {
    enqueueSync(() => orig.setMiterLimit(layer, limit));
  };
  display.dispose = (layer: any) => {
    enqueueSync(() => orig.dispose(layer));
  };
  display.distort = (layer: any, a: number, b: number, c: number, d: number, e: number, f: number) => {
    enqueueSync(() => orig.distort(layer, a, b, c, d, e, f));
  };
  display.move = (layer: any, parent: any, x: number, y: number, z: number) => {
    enqueueSync(() => orig.move(layer, parent, x, y, z));
  };
  display.shade = (layer: any, alpha: number) => {
    enqueueSync(() => orig.shade(layer, alpha));
  };

  // Async image operations — reserve their exact FIFO slot synchronously!
  display.drawBlob = (layer: any, x: number, y: number, blob: Blob) => {
    enqueueDecodedBlob(layer, x, y, Promise.resolve(blob));
  };

  display.drawStream = (layer: any, x: number, y: number, stream: any, mimetype: string) => {
    const blobPromise = new Promise<Blob | null>((resolve) => {
      let settled = false;
      const finish = (val: Blob | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(streamTimer);
        resolve(val);
      };

      const streamTimer = setTimeout(() => {
        finish(null);
      }, STREAM_END_TIMEOUT_MS);

      try {
        const reader = new GuacamoleRef.BlobReader(stream, mimetype);
        reader.onend = () => {
          try {
            finish(reader.getBlob());
          } catch {
            finish(null);
          }
        };
      } catch {
        finish(null);
      }
    });
    enqueueDecodedBlob(layer, x, y, blobPromise);
  };

  display.draw = (layer: any, x: number, y: number, url: string) => {
    patchGuacamoleLayer(layer);
    let loadedImg: HTMLImageElement | null = null;
    const op: QueuedOp = {
      blocked: true,
      cancelled: false,
      replay: () => {
        if (loadedImg && loadedImg.width > 0 && loadedImg.height > 0) {
          orig.drawImage(layer, x, y, loadedImg);
        }
      },
      cleanup: null,
    };
    pendingOps.push(op);

    if (typeof Image === 'undefined') {
      op.blocked = false;
      tryDrainFrames();
      return;
    }

    let settled = false;
    const settleDraw = (img: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(drawTimer);
      if (op.cancelled) return;
      loadedImg = img;
      op.blocked = false;
      tryDrainFrames();
    };

    const image = new Image();
    const drawTimer = setTimeout(() => {
      image.onload = null;
      image.onerror = null;
      settleDraw(null);
    }, IMAGE_DECODE_TIMEOUT_MS);

    image.onload = () => settleDraw(image);
    image.onerror = () => settleDraw(null);
    image.src = url;
  };

  display.flush = (callback?: () => void, timestamp?: number, logicalFrames?: number) => {
    const frameOps = pendingOps;
    pendingOps = [];
    pendingFrames.push({
      ops: frameOps,
      callback,
      timestamp,
      logicalFrames,
    });
    tryDrainFrames();
  };

  display.cancel = () => {
    for (let i = 0; i < pendingOps.length; i++) {
      const op = pendingOps[i];
      op.cancelled = true;
      op.blocked = false;
      try {
        op.cleanup?.();
      } catch {}
    }
    pendingOps = [];

    for (let f = 0; f < pendingFrames.length; f++) {
      const frame = pendingFrames[f];
      for (let i = 0; i < frame.ops.length; i++) {
        const op = frame.ops[i];
        op.cancelled = true;
        op.blocked = false;
        try {
          op.cleanup?.();
        } catch {}
      }
    }
    pendingFrames = [];

    inFlightCleanups.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
    inFlightCleanups.clear();
    inFlightOrigFlushes = 0;
    clearRafWatchdog();

    orig.cancel();
  };

  return display;
}

/**
 * Installs rendering fixes globally onto the imported `Guacamole` module object
 * (idempotent). Covers both live `Guacamole.Client` sessions and recorded
 * `Guacamole.SessionRecording` playback.
 */
export function installGuacamoleRenderFixes(GuacamoleRef: any): void {
  if (!GuacamoleRef || GuacamoleRef[GUAC_INSTALLED_FLAG]) {
    return;
  }
  GuacamoleRef[GUAC_INSTALLED_FLAG] = true;

  if (typeof GuacamoleRef.Layer === 'function') {
    const OrigLayer = GuacamoleRef.Layer;
    const WrappedLayer = function (this: any, width: number, height: number) {
      OrigLayer.call(this, width, height);
      patchGuacamoleLayer(this);
    } as any;
    WrappedLayer.prototype = OrigLayer.prototype;
    Object.assign(WrappedLayer, OrigLayer);
    GuacamoleRef.Layer = WrappedLayer;
  }

  if (typeof GuacamoleRef.Display === 'function') {
    const OrigDisplay = GuacamoleRef.Display;
    const WrappedDisplay = function (this: any) {
      OrigDisplay.call(this);
      patchGuacamoleDisplay(this, GuacamoleRef);
    } as any;
    WrappedDisplay.prototype = OrigDisplay.prototype;
    Object.assign(WrappedDisplay, OrigDisplay);
    GuacamoleRef.Display = WrappedDisplay;
  }
}
