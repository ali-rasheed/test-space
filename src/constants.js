/**
 * App constants: presets, grid snaps, URL limits, rect aspect, and helpers.
 * Single source of truth for weaving presets and shared numeric constants.
 */

/** Image copy/download resolution options (scale × display size). Used for all views (v1–v4). */
export const COPY_SCALES = [1, 2, 4, 8, 12];

/** Device pixel ratio used for weaving canvas (useShaderSandbox). Export uses this to compute display size. */
export const WEAVING_DPR = 2;

/** Max pixels per side for export (toBlob can fail on very large canvases). Aspect ratio preserved when capping. */
export const EXPORT_MAX_DIMENSION = 8000;

/** Material Symbol icon per weave pattern id (used in weave dropdown). */
export const WEAVE_ICONS = {
  'plain': 'grid_on',
  'matt-rib-irregular': 'widgets',
  'weft-rib-regular': 'horizontal_rule',
  'satin': 'blur_linear',
  'sateen': 'gradient',
  'twill-2-2': 'trending_up',
  'twill-3-3': 'trending_up',
  'weft-rib-irregular': 'view_agenda',
  'warp-rib-regular': 'view_column',
  'warp-rib-irregular': 'view_column',
  'basket': 'apps',
  'point-twill': 'call_split',
  'royal-oxford': 'category',
  'houndstooth': 'pattern',
  'herringbone': 'compare_arrows',
  'pattern-738': 'dashboard',
  'ens-vertical-pairs': 'view_column',
  'curtain': 'vertical_split',
};

/** Flat gradient = same start/end shade (solid). */
function flatGrad(shade) {
  return { startShade: shade, endShade: shade, direction: 0, range: [0, 100] };
}
/** Two-stop gradient config for warp + weft. */
function grad(wStart, wEnd, wfStart, wfEnd, wDir = 0, wfDir = 0) {
  return {
    warpGradient: { startShade: wStart, endShade: wEnd, direction: wDir, range: [0, 100] },
    weftGradient: { startShade: wfStart, endShade: wfEnd, direction: wfDir, range: [0, 100] },
  };
}

/** Presets: weave + colorway + shades + grad. Selecting one applies all state. */
export const PRESETS = [
  { id: 'citrine-plain-flat', label: 'Citrine · Plain · Flat', pattern: 0, palette: 0, bgShade: 1, warpShade: 1, weftShade: 3, warpGradient: flatGrad(1), weftGradient: flatGrad(3) },
  { id: 'garnet-twill-flat', label: 'Garnet · 2/2 Twill · Flat', pattern: 6, palette: 1, bgShade: 3, warpShade: 0, weftShade: 3, warpGradient: flatGrad(0), weftGradient: flatGrad(3) },
  { id: 'lapis-satin-flat', label: 'Lapis · Satin · Flat', pattern: 4, palette: 2, bgShade: 1, warpShade: 1, weftShade: 3, warpGradient: flatGrad(1), weftGradient: flatGrad(3) },
  { id: 'peridot-houndstooth-flat', label: 'Peridot · Houndstooth · Flat', pattern: 11, palette: 3, bgShade: 0, warpShade: 0, weftShade: 2, warpGradient: flatGrad(0), weftGradient: flatGrad(2) },
  { id: 'quartz-plain-flat', label: 'Quartz · Plain · Flat', pattern: 0, palette: 4, bgShade: 2, warpShade: 1, weftShade: 3, warpGradient: flatGrad(1), weftGradient: flatGrad(3) },
  { id: 'citrine-plain-grad', label: 'Citrine · Plain · Grad', pattern: 0, palette: 0, bgShade: 3, warpShade: 1, weftShade: 3, ...grad(0, 3, 1, 2) },
  { id: 'garnet-twill-grad', label: 'Garnet · 2/2 Twill · Grad', pattern: 6, palette: 1, bgShade: 0, warpShade: 0, weftShade: 3, ...grad(0, 3, 1, 2) },
  { id: 'lapis-satin-grad', label: 'Lapis · Satin · Grad', pattern: 4, palette: 2, bgShade: 2, warpShade: 1, weftShade: 2, ...grad(0, 2, 2, 3, 1, 1) },
  { id: 'peridot-houndstooth-grad', label: 'Peridot · Houndstooth · Grad', pattern: 11, palette: 3, bgShade: 1, warpShade: 0, weftShade: 1, ...grad(0, 3, 1, 3, 0, 1) },
  // Extended preset from URL: Lapis · Houndstooth · grad + rect/shimmer/all colorways
  {
    id: 'lapis-houndstooth-shimmer',
    label: 'Lapis · Houndstooth · Shimmer',
    pattern: 11,
    palette: 2,
    bgShade: 2,
    warpShade: 3,
    weftShade: 1,
    warpGradient: { startShade: 3, endShade: 3, direction: 1, range: [11, 63] },
    weftGradient: { startShade: 2, endShade: 0, direction: 1, range: [19, 39] },
    gridSize: 48,
    gradSteps: 2,
    rectAspect: 0.68,
    cornerRadius: 0.33,
    canvasAspect: 1.5,
    useAllColorways: true,
    colorwaySeed: 19,
    shimmer: true,
    shimmerSpeed: 2,
    shimmerWidth: 14.97,
    shimmerIntensity: 0.64,
    shimmerPosition: 0.61,
    shimmerRotation: 0.422,
    shimmerNoise: 0.14,
    shimmerNoiseSeed: 0.6,
    shimmerNoiseMin: 0.5,
    shimmerNoiseMax: 1,
    shimmerBlendMode: 2,
  },
];

/** Default rect aspect 36×40 (warp orientation). Shared by App, ShaderCanvas, useShaderSandbox. */
export const RECT_ASPECT_DEFAULT = 36 / 40;

/**
 * Canvas viewport aspect presets (width ÷ height) for the weave stage. Matches URL `canvas` two-decimal rounding (0.5–2).
 * Values from URLs, randomize, or presets that fall between these still render; the UI adds **Other (x.xx)** until you pick a listed ratio.
 */
export const CANVAS_ASPECT_PRESETS = [
  { value: 0.5, label: '1∶2 portrait' },
  { value: 0.56, label: '9∶16 portrait' },
  { value: 0.67, label: '2∶3 portrait' },
  { value: 0.75, label: '3∶4 portrait' },
  { value: 0.8, label: '4∶5 portrait' },
  { value: 0.9, label: '36∶40 weave cell' },
  { value: 1, label: '1∶1 square' },
  { value: 1.25, label: '5∶4 landscape' },
  { value: 1.33, label: '4∶3' },
  { value: 1.5, label: '3∶2' },
  { value: 1.78, label: '16∶9' },
  { value: 2, label: '2∶1 wide' },
];

/** Stable select / URL key for canvas aspect (two decimals). */
export function canvasAspectKey(n) {
  return Number(n).toFixed(2);
}

/** Designer-friendly grid sizes; slider snaps to these (max 256 cells on the short axis). */
export const GRID_SNAPS = [8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256];

/** Index into GRID_SNAPS closest to given size (for slider when size comes from URL). */
export function getGridSizeIndex(size) {
  return GRID_SNAPS.reduce((best, val, i) =>
    Math.abs(val - size) < Math.abs(GRID_SNAPS[best] - size) ? i : best, 0);
}

/** When gradSteps >= 2, snap a 0–100 value to the nearest band. */
export function snapGradRangeValue(value, gradSteps) {
  if (gradSteps < 2) return value;
  const step = 100 / gradSteps;
  const n = Math.round(value / step);
  return Math.max(0, Math.min(100, n * step));
}

/** Max URL search length; compact schema keeps under ~2k. */
export const URL_STATE_MAX_LEN = 2000;
