/**
 * Copy-to-clipboard helpers for Shader Sandbox (v1–v4).
 *
 * Copy resolution (1×, 2×, 4×, 8×, 12× from COPY_SCALES) applies to all views: v1 (weaving), v2 (imageRects),
 * v3 (weavingHalftone), v4 (imageRectsHalftone). v1/v3/v4 use App.jsx handleCopy + getCopyCanvas(view, …);
 * v2 uses AppV2’s own copy toolbar and copyScale when embedded or standalone.
 *
 * Audit (v3/v4): Copy uses the same path as export/record — for weavingHalftone (v3) and
 * imageRectsHalftone (v4) the canvas is the halftone output (HalftoneCmyk), not the source.
 * WeavingHalftoneStage and ImageRectsHalftoneStage sync that canvas into halftoneCanvasRef
 * (and fallback: halftoneContainerRef.current.querySelector('canvas')). getCopyCanvas()
 * centralizes which canvas is used; the chosen scale is applied in the caller (App or AppV2).
 *
 * v1 = weaving, v2 = imageRects (main canvas). v3 = weavingHalftone, v4 = imageRectsHalftone (halftone canvas).
 */

/** View values used in App.jsx; v3 and v4 use the halftone canvas. */
export const HALFTONE_VIEWS = ['weavingHalftone', 'imageRectsHalftone'];

/**
 * Resolve the canvas to use for copy/export for the current view.
 * v3/v4: halftone canvas (from ref or container's first canvas). v1/v2: main WebGL canvas.
 * @param {string} view - 'weaving' | 'imageRects' | 'weavingHalftone' | 'imageRectsHalftone'
 * @param {{ current: HTMLCanvasElement | null }} canvasRef - main canvas ref (v1/v2)
 * @param {{ current: HTMLCanvasElement | null }} halftoneCanvasRef - halftone canvas ref (v3/v4)
 * @param {{ current: HTMLElement | null }} halftoneContainerRef - container that holds halftone canvas (fallback for v3/v4)
 * @returns {HTMLCanvasElement | null}
 */
export function getCopyCanvas(view, canvasRef, halftoneCanvasRef, halftoneContainerRef) {
  if (HALFTONE_VIEWS.includes(view)) {
    const fromRef = halftoneCanvasRef?.current ?? null;
    if (fromRef) return fromRef;
    const container = halftoneContainerRef?.current ?? null;
    const fromContainer = container?.querySelector?.('canvas') ?? null;
    return fromContainer;
  }
  return canvasRef?.current ?? null;
}
