/**
 * Shared canvas → blob (PNG/WebP) helpers for clipboard copy and file download.
 */
import { EXPORT_MAX_DIMENSION } from './constants';

export const WEBP_QUALITY = 0.92;

/** Cap width/height while preserving aspect ratio (toBlob fails on very large canvases). */
export function capToMaxDimension(width, height, maxDim = EXPORT_MAX_DIMENSION) {
  if (width <= maxDim && height <= maxDim) return [width, height];
  const r = Math.min(maxDim / width, maxDim / height);
  return [Math.round(width * r), Math.round(height * r)];
}

/** Encode a canvas element as PNG or WebP. */
export function canvasToBlob(canvas, format = 'png') {
  const mime = format === 'webp' ? 'image/webp' : 'image/png';
  const quality = format === 'webp' ? WEBP_QUALITY : undefined;
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      mime,
      quality,
    );
  });
}

/** Draw source canvas into an offscreen buffer at target size, then encode. */
export async function scaleCanvasToBlob(sourceCanvas, width, height, format = 'png') {
  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  const ctx = off.getContext('2d');
  if (!ctx) throw new Error('2D context failed');
  ctx.drawImage(sourceCanvas, 0, 0, width, height);
  return canvasToBlob(off, format);
}

/** Convert a PNG blob to WebP (or pass through PNG). */
export async function pngBlobToFormat(pngBlob, format) {
  if (format === 'png') return pngBlob;
  const pngUrl = URL.createObjectURL(pngBlob);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const off = document.createElement('canvas');
        off.width = img.naturalWidth;
        off.height = img.naturalHeight;
        const ctx = off.getContext('2d');
        if (!ctx) {
          reject(new Error('2D context failed'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        off.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('toBlob WebP failed'))),
          'image/webp',
          WEBP_QUALITY,
        );
      };
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = pngUrl;
    });
  } finally {
    URL.revokeObjectURL(pngUrl);
  }
}

/** Trigger a browser download for a blob. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function imageExportFilename(prefix, w, h, format) {
  return `${prefix}-${w}x${h}.${format}`;
}
