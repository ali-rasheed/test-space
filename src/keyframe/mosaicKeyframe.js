/**
 * Mosaic (AppV2) keyframe snapshot: all shader-visible props from the sidebar (excludes media blob, copy/record UI state).
 * applyMosaicKeyframe calls React setters; rounds integers where the UI uses whole numbers.
 */

export const MOSAIC_KEYFRAME_KEYS = [
  'gridSize',
  'palette',
  'bgShade',
  'bgColorMode',
  'bgCustomColor',
  'rectColorSource',
  'tileArtLevels',
  'tileArtThreshold',
  'tileArtDither',
  'tileArtColorMode',
  'tileArtGeom',
  'tileArtUniformGrid',
  'tileArtDensity',
  'tileArtRamp',
  'patternWarpShade',
  'patternWeftShade',
  'lumaSizeMix',
  'lumaSizeInvert',
  'lumaSizeFloor',
  'cellGeometryMode',
  'mosaicBgGaps',
  'stitchLumaMax',
  /** Include stitch-in mode so keyframe B can switch Off/Noise/Bleed. */
  'stitchRevealMode',
  /** Duration remains sidebar-driven; keyframes can animate mode and reveal progress. */
  'stitchRevealProgress',
  'stitchRevealSeed',
  'stitchRevealScale',
  'stitchRevealNoiseScale',
  'stitchRevealSoftness',
  'stitchRevealBleedAnisotropy',
  'stitchRevealBleedRotation',
  'stitchRevealBleedCrossFiber',
  'stitchRevealBleedDraftCoupled',
  'quantizeSteps',
  'quantizeMode',
  'quantizeGamma',
  'quantizeDither',
  'patternIndex',
  'rectRadius',
  'rectAspect',
  'rectRatio',
  'patternFit',
  'contentPadding',
];

export function getMosaicKeyframeSnapshot(state) {
  const out = {};
  for (const k of MOSAIC_KEYFRAME_KEYS) {
    if (k in state) out[k] = state[k];
  }
  return out;
}

/**
 * @param {Record<string, (v: unknown) => void>} setters
 * @param {Record<string, unknown>} snap
 */
export function applyMosaicKeyframe(setters, snap) {
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const r = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(n(v))));
  const f = (v, lo, hi) => Math.max(lo, Math.min(hi, n(v)));

  if (snap.gridSize != null) setters.setGridSize?.(r(snap.gridSize, 8, 256));
  if (snap.palette != null) setters.setPalette?.(r(snap.palette, 0, 4));
  if (snap.bgShade != null) setters.setBgShade?.(r(snap.bgShade, 0, 5));
  if (snap.bgColorMode != null) setters.setBgColorMode?.(r(snap.bgColorMode, 0, 1));
  if (typeof snap.bgCustomColor === 'string') setters.setBgCustomColor?.(snap.bgCustomColor);
  if (snap.rectColorSource != null) setters.setRectColorSource?.(r(snap.rectColorSource, 0, 3));
  if (snap.tileArtLevels != null) setters.setTileArtLevels?.(r(snap.tileArtLevels, 2, 8));
  if (snap.tileArtThreshold != null) setters.setTileArtThreshold?.(f(snap.tileArtThreshold, 0, 1));
  if (snap.tileArtDither != null) setters.setTileArtDither?.(f(snap.tileArtDither, 0, 1));
  if (snap.tileArtColorMode != null) setters.setTileArtColorMode?.(r(snap.tileArtColorMode, 0, 2));
  if (snap.tileArtGeom != null) setters.setTileArtGeom?.(r(snap.tileArtGeom, 0, 1));
  if (snap.tileArtUniformGrid != null) setters.setTileArtUniformGrid?.(r(snap.tileArtUniformGrid, 0, 1));
  if (snap.tileArtDensity != null) setters.setTileArtDensity?.(r(snap.tileArtDensity, 0, 1));
  if (Array.isArray(snap.tileArtRamp)) setters.setTileArtRamp?.(snap.tileArtRamp.map((v) => r(v, 0, 999)));
  if (snap.patternWarpShade != null) setters.setPatternWarpShade?.(r(snap.patternWarpShade, 0, 4));
  if (snap.patternWeftShade != null) setters.setPatternWeftShade?.(r(snap.patternWeftShade, 0, 4));
  if (snap.lumaSizeMix != null) setters.setLumaSizeMix?.(f(snap.lumaSizeMix, 0, 1));
  if (snap.lumaSizeInvert != null) setters.setLumaSizeInvert?.(r(snap.lumaSizeInvert, 0, 1));
  if (snap.lumaSizeFloor != null) setters.setLumaSizeFloor?.(f(snap.lumaSizeFloor, 0.05, 1));
  if (snap.cellGeometryMode != null) setters.setCellGeometryMode?.(r(snap.cellGeometryMode, 0, 1));
  if (snap.mosaicBgGaps != null) setters.setMosaicBgGaps?.(!!snap.mosaicBgGaps);
  if (snap.stitchLumaMax != null) setters.setStitchLumaMax?.(f(snap.stitchLumaMax, 0, 1));
  if (snap.stitchRevealMode != null) setters.setStitchRevealMode?.(r(snap.stitchRevealMode, 0, 2));
  if (snap.stitchRevealProgress != null) setters.setStitchRevealProgress?.(f(snap.stitchRevealProgress, 0, 1));
  if (snap.stitchRevealSeed != null) setters.setStitchRevealSeed?.(r(snap.stitchRevealSeed, 0, 999999));
  if (snap.stitchRevealScale != null) setters.setStitchRevealScale?.(f(snap.stitchRevealScale, 0.02, 0.8));
  if (snap.stitchRevealNoiseScale != null) setters.setStitchRevealNoiseScale?.(f(snap.stitchRevealNoiseScale, 0.25, 4));
  if (snap.stitchRevealSoftness != null) setters.setStitchRevealSoftness?.(f(snap.stitchRevealSoftness, 0.01, 0.35));
  if (snap.stitchRevealBleedAnisotropy != null) setters.setStitchRevealBleedAnisotropy?.(f(snap.stitchRevealBleedAnisotropy, 0, 12));
  if (snap.stitchRevealBleedRotation != null) setters.setStitchRevealBleedRotation?.(f(snap.stitchRevealBleedRotation, 0, 1));
  if (snap.stitchRevealBleedCrossFiber != null) setters.setStitchRevealBleedCrossFiber?.(f(snap.stitchRevealBleedCrossFiber, 0, 1));
  if (snap.stitchRevealBleedDraftCoupled != null) setters.setStitchRevealBleedDraftCoupled?.(snap.stitchRevealBleedDraftCoupled ? 1 : 0);
  if (snap.quantizeSteps != null) setters.setQuantizeSteps?.(r(snap.quantizeSteps, 0, 32));
  if (snap.quantizeMode != null) setters.setQuantizeMode?.(r(snap.quantizeMode, 0, 1));
  if (snap.quantizeGamma != null) setters.setQuantizeGamma?.(f(snap.quantizeGamma, 0.25, 4));
  if (snap.quantizeDither != null) setters.setQuantizeDither?.(f(snap.quantizeDither, 0, 1));
  if (snap.patternIndex != null) setters.setPatternIndex?.(r(snap.patternIndex, 0, 999));
  if (snap.rectRadius != null) setters.setRectRadius?.(f(snap.rectRadius, 0, 0.5));
  if (snap.rectAspect != null) setters.setRectAspect?.(f(snap.rectAspect, 0.3, 1.5));
  if (snap.rectRatio != null) setters.setRectRatio?.(f(snap.rectRatio, 0.2, 1));
  if (snap.patternFit === 'fit' || snap.patternFit === 'fill') setters.setPatternFit?.(snap.patternFit);
  if (snap.contentPadding != null) setters.setContentPadding?.(f(snap.contentPadding, 0, 0.45));
}
