/**
 * Post-composites HalftoneCmyk output with a mosaic alpha mask so transparent
 * PNG cutouts and transparent BG/gaps survive halftone (Paper paints opaque paper
 * everywhere shape ≈ 0; destination-in keeps only pixels where mosaic a > 0).
 */

/** object-fit contain/cover draw rect (destW×destH viewport, srcW×srcH image). */
export function imageFitRect(destW, destH, srcW, srcH, fit = 'cover') {
  if (destW < 1 || destH < 1 || srcW < 1 || srcH < 1) {
    return { x: 0, y: 0, w: destW, h: destH };
  }
  const scale =
    fit === 'contain'
      ? Math.min(destW / srcW, destH / srcH)
      : Math.max(destW / srcW, destH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return {
    x: (destW - w) * 0.5,
    y: (destH - h) * 0.5,
    w,
    h,
  };
}

/**
 * Draw halftone then mask by mosaic capture alpha (destination-in).
 * @param {HTMLCanvasElement} outputCanvas
 * @param {HTMLCanvasElement} halftoneCanvas
 * @param {CanvasImageSource} maskSource mosaic capture (same aspect as halftone input)
 * @param {number} destW
 * @param {number} destH
 * @param {'cover'|'contain'} fit matches HalftoneCmyk fit prop
 */
export function compositeHalftoneWithAlphaMask(
  outputCanvas,
  halftoneCanvas,
  maskSource,
  destW,
  destH,
  fit = 'cover',
) {
  if (!outputCanvas || !halftoneCanvas || !maskSource) return false;
  const w = Math.max(1, Math.round(destW));
  const h = Math.max(1, Math.round(destH));
  if (outputCanvas.width !== w) outputCanvas.width = w;
  if (outputCanvas.height !== h) outputCanvas.height = h;

  const ctx = outputCanvas.getContext('2d');
  if (!ctx) return false;

  const maskW = maskSource.width ?? maskSource.naturalWidth ?? w;
  const maskH = maskSource.height ?? maskSource.naturalHeight ?? h;
  const rect = imageFitRect(w, h, maskW, maskH, fit);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(halftoneCanvas, 0, 0, w, h);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(maskSource, rect.x, rect.y, rect.w, rect.h);
  ctx.globalCompositeOperation = 'source-over';
  return true;
}
