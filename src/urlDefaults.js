/**
 * URL/default state constants used by parse/build/reset across modes.
 * Keeping these centralized prevents drift between URL omission and reset behavior.
 */
import { RECT_ASPECT_DEFAULT } from './constants';

export const WEAVING_URL_DEFAULTS = {
  view: 'weaving',
  menuHidden: false,
  pattern: 0,
  palette: 0,
  bgShade: 2,
  warpShade: 1,
  weftShade: 3,
  gridSize: 32,
  presetIndex: null,
  gradSteps: 0,
  rectAspect: RECT_ASPECT_DEFAULT,
  cornerRadius: 0.18,
  canvasAspect: 1,
  patternFit: 'fit',
  stageTranslateX: 0,
  /** In-shader ENS corner mark; URL `ensm` 0|1 (omitted when matches default). */
  weaveEnsMarkVisible: true,
  copyFormat: 'png',
  copyScale: 2,
  useAllColorways: true,
  colorwaySeed: 78.2,
  colorwayNoiseScale: 0.005,
  /** 0 = hash, 1 = smooth Perlin+FBM, 2 = dye bleed. */
  colorwayNoiseMode: 2,
  colorwayNoiseOctaves: 3,
  colorwayNoisePersistence: 0.6,
  colorwayNoiseLacunarity: 2.1,
  colorwayNoiseBias: 0.67,
  /** Cell-space X offset for colorway noise (hash / FBM / bleed). Animate for drift. */
  colorwayNoiseX: 0,
  colorwayBleedAnisotropy: 0.6,
  colorwayBleedRotation: 0.5,
  colorwayBleedCrossFiber: 0,
  colorwayBleedDraftCoupled: true,
  /** Bitmask 0–31: bit i = include palette i in all-colorways pool (default all five). */
  colorwayIncludeMask: 31,
  shimmer: false,
  shimmerSpeed: 2,
  shimmerWidth: 2,
  shimmerIntensity: 0.25,
  shimmerPosition: 0,
  shimmerRotation: 0.125,
  shimmerNoise: 0.3,
  shimmerNoiseSeed: 0,
  shimmerNoiseMin: 0.5,
  shimmerNoiseMax: 1.5,
  shimmerBlendMode: 0,
  warpGradient: { startShade: 0, endShade: 3, direction: 0, range: [0, 100] },
  weftGradient: { startShade: 0, endShade: 3, direction: 0, range: [0, 100] },
  /** When false, warp threads use flat **warp** shade only (gradient fields kept for when toggled back on). */
  warpGradientEnabled: true,
  weftGradientEnabled: true,
  /** 0 = off, 1 = noise (FBM), 2 = dye-bleed stitch-in from blank (URL srm; same semantics as Mosaic). */
  weaveStitchRevealMode: 0,
  weaveStitchRevealDurationSec: 2.5,
  weaveStitchRevealProgress: 1,
  weaveStitchRevealSeed: 0,
  weaveStitchRevealScale: 0.12,
  /** FBM frequency multiplier for stitch-in noise/bleed (1 = default). */
  weaveStitchRevealNoiseScale: 1,
  weaveStitchRevealSoftness: 0.06,
  weaveStitchRevealBleedAnisotropy: 3,
  weaveStitchRevealBleedRotation: 0,
  weaveStitchRevealBleedCrossFiber: 0.2,
  weaveStitchRevealBleedDraftCoupled: 0,
  /** When true, stitch-in progress is manual / keyframe A↔B; when false, timed duration ramp (default). URL `srkm`. */
  weaveStitchRevealKeyframeDrive: false,
  /** Diagonal load-in scrub 0–1; cancels auto-play RAF when dragged. URL `drp` (0–1000). */
  diagonalRevealProgress: 1,
};

export const IMAGE_RECTS_URL_DEFAULTS = {
  menuHidden: false,
  gridSize: 32,
  palette: 0,
  bgShade: 2,
  /** 0 = palette BG shade, 1 = custom picked color (bgc). */
  bgColorMode: 0,
  /** Custom background color when bgColorMode = 1. */
  bgCustomColor: '#f2f2f2',
  /** 0 = brand palette, 1 = image RGB, 2 = warp/weft pattern colors, 3 = tile art (URL cm). */
  rectColorSource: 1,
  /** Tile art: luma bands (2–8). */
  tileArtLevels: 8,
  /** Tile art: cells with lum above this show background only (1 = all weave). */
  tileArtThreshold: 1,
  tileArtDither: 0.12,
  /** 0 mono, 1 brand, 2 tint. */
  tileArtColorMode: 0,
  /** 0 flat sub-cells, 1 rounded mini stitches (URL tag). */
  tileArtGeom: 1,
  /** 1 = fixed 8×8 mini-cell grid; 0 = each pattern's native tileW×tileH (URL tug). */
  tileArtUniformGrid: 1,
  /** 0 = full weave carpet in occupied macros; 1 = per mini-cell luma+hash visibility (URL taf). */
  tileArtDensity: 0,
  quantizeSteps: 0,
  /** 0 = band RGB channels, 1 = band HSV (posterize hue/sat/value). */
  quantizeMode: 0,
  /** Curve before banding: 1 = linear, <1 lifts shadows, >1 darkens midtones. */
  quantizeGamma: 1,
  /** 0–1: stable per-cell noise before rounding (reduces flat bands). */
  quantizeDither: 0,
  shadeFrom: 0,
  patternIndex: 0,
  rectRadius: 0.18,
  rectAspect: 0.85,
  rectRatio: 1,
  patternWarpShade: 1,
  patternWeftShade: 3,
  lumaSizeMix: 0,
  lumaSizeInvert: 0,
  lumaSizeFloor: 0.2,
  /** 0 = always weave rects; 1 = plain cell unless image luma ≤ stitchLumaMax. */
  cellGeometryMode: 0,
  /** Max luminance (0–1) that still shows weave; above → plain full cell. */
  stitchLumaMax: 0.42,
  copyFormat: 'png',
  copyScale: 2,
  /** Dark-stitches + non-stitch cells show BG (legacy v5). */
  mosaicBgGaps: false,
  /** Mosaic canvas: 'fit' = contain in stage, 'fill' = grow to fill main area. */
  patternFit: 'fit',
  /** Outer inset per edge (0–0.45): background band; mosaic samples inner rect only (URL cpad). */
  contentPadding: 0,
  stageTranslateX: 0,
  /** 0 = off, 1 = noise (FBM), 2 = dye-bleed stitch-in from blank. */
  stitchRevealMode: 0,
  /** Seconds for one full 0→1 reveal when mode is noise or bleed. */
  stitchRevealDurationSec: 2.5,
  stitchRevealSeed: 0,
  stitchRevealScale: 0.12,
  stitchRevealNoiseScale: 1,
  stitchRevealSoftness: 0.06,
  stitchRevealBleedAnisotropy: 3,
  stitchRevealBleedRotation: 0,
  stitchRevealBleedCrossFiber: 0.2,
  stitchRevealBleedDraftCoupled: 0,
};

export const HALFTONE_DEFAULTS = {
  presetIndex: 0,
  size: 0.2,
  softness: 1,
  gridNoise: 0.2,
  contrast: 1,
  type: 'ink',
  colorBack: '#fbfaf4',
  colorC: '#00b3ff',
  colorM: '#fc4f9d',
  colorY: '#ffd900',
  colorK: '#231f20',
  floodC: 0.15,
  gainC: 0.3,
  gainY: 0.2,
};

/** Default A→B animation length (seconds); matches `useKeyframePlayback` default. */
export const KEYFRAME_ANIM_DEFAULT_SEC = 2;

export const COMBO_DEFAULTS = {
  gridSize: 32,
  palette: 0,
  bgShade: 2,
  rectColorSource: 1,
  quantizeSteps: 0,
  quantizeMode: 0,
  quantizeGamma: 1,
  quantizeDither: 0,
  shadeFrom: 0,
  patternIndex: 0,
  rectRadius: 0.18,
  rectAspect: 0.85,
  rectRatio: 1,
  patternWarpShade: 1,
  patternWeftShade: 3,
  lumaSizeMix: 0,
  lumaSizeInvert: 0,
  lumaSizeFloor: 0.2,
  cellGeometryMode: 0,
  stitchLumaMax: 0.42,
};
