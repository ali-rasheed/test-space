/**
 * App.jsx keyframe snapshots per canvas mode: flat weave, weave+halftone, or print mosaic (combo+halftone).
 * Omits view, menu, copy/export/record, preset index, shadesLocked, shimmer play state, colorway anim toggles, image blobs.
 * Includes **shimmerPhase** (shimmer band position 0–1) so Set A/B matches the sidebar Position slider and A→B can lerp it.
 * Includes **weaveEnsMarkVisible** so keyframed A/B can turn the in-shader ENS mark on or off.
 */

import { PATTERNS } from '../patterns';

const WEAVE_CORE_KEYS = [
  'pattern', 'palette', 'bgShade', 'warpShade', 'weftShade', 'gridSize',
  'warpGradient', 'weftGradient', 'warpGradientEnabled', 'weftGradientEnabled', 'gradSteps',
  'rectAspect', 'cornerRadius', 'canvasAspect', 'patternFit',
  'shimmer', 'shimmerSpeed', 'shimmerWidth', 'shimmerIntensity', 'shimmerPosition', 'shimmerPhase', 'shimmerRotation',
  'shimmerNoise', 'shimmerNoiseSeed', 'shimmerNoiseMin', 'shimmerNoiseMax', 'shimmerBlendMode',
  'useAllColorways', 'colorwaySeed', 'colorwayNoiseScale', 'colorwayNoiseMode', 'colorwayNoiseOctaves',
  'colorwayNoisePersistence', 'colorwayNoiseLacunarity', 'colorwayNoiseBias', 'colorwayNoiseX',
  'colorwayBleedAnisotropy', 'colorwayBleedRotation', 'colorwayBleedCrossFiber', 'colorwayBleedDraftCoupled',
  'colorwayIncludeMask',
  'weaveStitchRevealMode', 'weaveStitchRevealDurationSec', 'weaveStitchRevealProgress', 'weaveStitchRevealSeed',
  'weaveStitchRevealScale', 'weaveStitchRevealNoiseScale', 'weaveStitchRevealSoftness', 'weaveStitchRevealBleedAnisotropy', 'weaveStitchRevealBleedRotation',
  'weaveStitchRevealBleedCrossFiber', 'weaveStitchRevealBleedDraftCoupled',
  'diagonalRevealProgress',
  'weaveEnsMarkVisible',
];

const HALFTONE_KEYS = [
  'halftonePresetIndex', 'halftoneSize', 'halftoneSoftness', 'halftoneGridNoise', 'halftoneContrast', 'halftoneType',
  'halftoneColorBack', 'halftoneColorC', 'halftoneColorM', 'halftoneColorY', 'halftoneColorK',
  'halftoneFloodC', 'halftoneGainC', 'halftoneGainY',
];

const COMBO_KEYS = [
  'comboGridSize', 'comboPalette', 'comboBgShade', 'comboRectColorSource', 'comboPatternWarpShade', 'comboPatternWeftShade',
  'comboLumaSizeMix', 'comboLumaSizeInvert', 'comboLumaSizeFloor', 'comboCellGeometryMode', 'comboStitchLumaMax',
  'comboQuantizeSteps', 'comboQuantizeMode', 'comboQuantizeGamma', 'comboQuantizeDither',
  'comboPatternIndex', 'comboRectRadius', 'comboRectAspect', 'comboRectRatio',
];

export function getWeaveAppKeyframeSnapshot(view, weaveHalftoneOn, state) {
  const keys = new Set();
  if (view === 'weaving' && !weaveHalftoneOn) {
    WEAVE_CORE_KEYS.forEach((k) => keys.add(k));
  } else if (view === 'weaving' && weaveHalftoneOn) {
    WEAVE_CORE_KEYS.forEach((k) => keys.add(k));
    HALFTONE_KEYS.forEach((k) => keys.add(k));
  } else if (view === 'imageRectsHalftone') {
    COMBO_KEYS.forEach((k) => keys.add(k));
    HALFTONE_KEYS.forEach((k) => keys.add(k));
    keys.add('patternFit');
  }
  const out = {};
  for (const k of keys) {
    if (k in state) out[k] = state[k];
  }
  return out;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * @param {string} view
 * @param {boolean} weaveHalftoneOn
 * @param {Record<string, (v: unknown) => void>} setters
 * @param {Record<string, unknown>} snap
 */
export function applyWeaveAppKeyframe(view, weaveHalftoneOn, setters, snap) {
  const applyWeave = () => {
    if (snap.pattern != null) setters.setPattern?.(Math.round(clamp(Number(snap.pattern), 0, PATTERNS.length - 1)));
    if (snap.palette != null) setters.setPalette?.(Math.round(clamp(Number(snap.palette), 0, 4)));
    if (snap.bgShade != null) setters.setBgShade?.(Math.round(clamp(Number(snap.bgShade), 0, 5)));
    if (snap.warpShade != null) setters.setWarpShade?.(Math.round(clamp(Number(snap.warpShade), 0, 5)));
    if (snap.weftShade != null) setters.setWeftShade?.(Math.round(clamp(Number(snap.weftShade), 0, 5)));
    if (snap.gridSize != null) setters.setGridSize?.(Math.round(clamp(Number(snap.gridSize), 8, 256)));
    if (snap.warpGradient != null && typeof snap.warpGradient === 'object') setters.setWarpGradient?.(snap.warpGradient);
    if (snap.weftGradient != null && typeof snap.weftGradient === 'object') setters.setWeftGradient?.(snap.weftGradient);
    if (snap.warpGradientEnabled != null) setters.setWarpGradientEnabled?.(!!snap.warpGradientEnabled);
    if (snap.weftGradientEnabled != null) setters.setWeftGradientEnabled?.(!!snap.weftGradientEnabled);
    if (snap.gradSteps != null) setters.setGradSteps?.(Math.round(clamp(Number(snap.gradSteps), 0, 16)));
    if (snap.rectAspect != null) setters.setRectAspect?.(clamp(Number(snap.rectAspect), 0.5, 1));
    if (snap.cornerRadius != null) setters.setCornerRadius?.(clamp(Number(snap.cornerRadius), 0, 0.5));
    if (snap.canvasAspect != null) setters.setCanvasAspect?.(clamp(Number(snap.canvasAspect), 0.5, 2));
    if (snap.patternFit === 'fit' || snap.patternFit === 'fill') setters.setPatternFit?.(snap.patternFit);
    if (snap.weaveEnsMarkVisible != null) setters.setWeaveEnsMarkVisible?.(!!snap.weaveEnsMarkVisible);
    if (snap.shimmer != null) setters.setShimmer?.(!!snap.shimmer);
    if (snap.shimmerSpeed != null) setters.setShimmerSpeed?.(clamp(Number(snap.shimmerSpeed), 1, 16));
    if (snap.shimmerWidth != null) setters.setShimmerWidth?.(Number(snap.shimmerWidth));
    if (snap.shimmerIntensity != null) setters.setShimmerIntensity?.(Number(snap.shimmerIntensity));
    if (snap.shimmerPosition != null) setters.setShimmerPosition?.(Number(snap.shimmerPosition));
    if (snap.shimmerPhase != null) setters.setShimmerPhase?.(clamp(Number(snap.shimmerPhase), 0, 1));
    if (snap.shimmerRotation != null) setters.setShimmerRotation?.(clamp(Number(snap.shimmerRotation), 0, 1));
    if (snap.shimmerNoise != null) setters.setShimmerNoise?.(clamp(Number(snap.shimmerNoise), 0, 1));
    if (snap.shimmerNoiseSeed != null) setters.setShimmerNoiseSeed?.(clamp(Number(snap.shimmerNoiseSeed), 0, 1));
    if (snap.shimmerNoiseMin != null) setters.setShimmerNoiseMin?.(clamp(Number(snap.shimmerNoiseMin), 0, 2));
    if (snap.shimmerNoiseMax != null) setters.setShimmerNoiseMax?.(clamp(Number(snap.shimmerNoiseMax), 0, 2));
    if (snap.shimmerBlendMode != null) setters.setShimmerBlendMode?.(Math.round(clamp(Number(snap.shimmerBlendMode), 0, 10)));
    if (snap.useAllColorways != null) setters.setUseAllColorways?.(!!snap.useAllColorways);
    if (snap.colorwaySeed != null) setters.setColorwaySeed?.(clamp(Number(snap.colorwaySeed), 0, 999));
    if (snap.colorwayNoiseScale != null) setters.setColorwayNoiseScale?.(clamp(Number(snap.colorwayNoiseScale), 0.005, 0.25));
    if (snap.colorwayNoiseMode != null) setters.setColorwayNoiseMode?.(Math.round(clamp(Number(snap.colorwayNoiseMode), 0, 2)));
    if (snap.colorwayNoiseOctaves != null) setters.setColorwayNoiseOctaves?.(Math.round(clamp(Number(snap.colorwayNoiseOctaves), 1, 4)));
    if (snap.colorwayNoisePersistence != null) setters.setColorwayNoisePersistence?.(clamp(Number(snap.colorwayNoisePersistence), 0.15, 0.95));
    if (snap.colorwayNoiseLacunarity != null) setters.setColorwayNoiseLacunarity?.(clamp(Number(snap.colorwayNoiseLacunarity), 1.05, 4));
    if (snap.colorwayNoiseBias != null) setters.setColorwayNoiseBias?.(clamp(Number(snap.colorwayNoiseBias), 0.25, 4));
    if (snap.colorwayNoiseX != null) setters.setColorwayNoiseX?.(clamp(Number(snap.colorwayNoiseX), -500, 500));
    if (snap.colorwayBleedAnisotropy != null) setters.setColorwayBleedAnisotropy?.(clamp(Number(snap.colorwayBleedAnisotropy), 0.35, 12));
    if (snap.colorwayBleedRotation != null) setters.setColorwayBleedRotation?.(clamp(Number(snap.colorwayBleedRotation), 0, 1));
    if (snap.colorwayBleedCrossFiber != null) setters.setColorwayBleedCrossFiber?.(clamp(Number(snap.colorwayBleedCrossFiber), 0, 1));
    if (snap.colorwayBleedDraftCoupled != null) setters.setColorwayBleedDraftCoupled?.(!!snap.colorwayBleedDraftCoupled);
    if (snap.colorwayIncludeMask != null) setters.setColorwayIncludeMask?.(Math.round(clamp(Number(snap.colorwayIncludeMask), 0, 31)));
    if (snap.weaveStitchRevealMode != null) setters.setWeaveStitchRevealMode?.(Math.round(clamp(Number(snap.weaveStitchRevealMode), 0, 2)));
    if (snap.weaveStitchRevealDurationSec != null) setters.setWeaveStitchRevealDurationSec?.(Math.max(0.25, Math.min(30, Number(snap.weaveStitchRevealDurationSec))));
    if (snap.weaveStitchRevealProgress != null) setters.setWeaveStitchRevealProgress?.(clamp(Number(snap.weaveStitchRevealProgress), 0, 1));
    if (snap.weaveStitchRevealSeed != null) setters.setWeaveStitchRevealSeed?.(Math.round(clamp(Number(snap.weaveStitchRevealSeed), 0, 999999)));
    if (snap.weaveStitchRevealScale != null) setters.setWeaveStitchRevealScale?.(clamp(Number(snap.weaveStitchRevealScale), 0.02, 0.8));
    if (snap.weaveStitchRevealNoiseScale != null) setters.setWeaveStitchRevealNoiseScale?.(clamp(Number(snap.weaveStitchRevealNoiseScale), 0.25, 4));
    if (snap.weaveStitchRevealSoftness != null) setters.setWeaveStitchRevealSoftness?.(clamp(Number(snap.weaveStitchRevealSoftness), 0.01, 0.35));
    if (snap.weaveStitchRevealBleedAnisotropy != null) setters.setWeaveStitchRevealBleedAnisotropy?.(clamp(Number(snap.weaveStitchRevealBleedAnisotropy), 0, 12));
    if (snap.weaveStitchRevealBleedRotation != null) setters.setWeaveStitchRevealBleedRotation?.(clamp(Number(snap.weaveStitchRevealBleedRotation), 0, 1));
    if (snap.weaveStitchRevealBleedCrossFiber != null) setters.setWeaveStitchRevealBleedCrossFiber?.(clamp(Number(snap.weaveStitchRevealBleedCrossFiber), 0, 1));
    if (snap.weaveStitchRevealBleedDraftCoupled != null) {
      setters.setWeaveStitchRevealBleedDraftCoupled?.(snap.weaveStitchRevealBleedDraftCoupled ? 1 : 0);
    }
    if (snap.diagonalRevealProgress != null) {
      setters.setDiagonalRevealProgress?.(clamp(Number(snap.diagonalRevealProgress), 0, 1));
    }
  };

  const applyHalftone = () => {
    if (snap.halftonePresetIndex != null) setters.setHalftonePresetIndex?.(Math.round(clamp(Number(snap.halftonePresetIndex), 0, 99)));
    if (snap.halftoneSize != null) setters.setHalftoneSize?.(clamp(Number(snap.halftoneSize), 0.01, 1));
    if (snap.halftoneSoftness != null) setters.setHalftoneSoftness?.(clamp(Number(snap.halftoneSoftness), 0, 1));
    if (snap.halftoneGridNoise != null) setters.setHalftoneGridNoise?.(clamp(Number(snap.halftoneGridNoise), 0, 1));
    if (snap.halftoneContrast != null) setters.setHalftoneContrast?.(clamp(Number(snap.halftoneContrast), 0, 2));
    if (snap.halftoneType != null) setters.setHalftoneType?.(snap.halftoneType);
    if (snap.halftoneColorBack != null) setters.setHalftoneColorBack?.(snap.halftoneColorBack);
    if (snap.halftoneColorC != null) setters.setHalftoneColorC?.(snap.halftoneColorC);
    if (snap.halftoneColorM != null) setters.setHalftoneColorM?.(snap.halftoneColorM);
    if (snap.halftoneColorY != null) setters.setHalftoneColorY?.(snap.halftoneColorY);
    if (snap.halftoneColorK != null) setters.setHalftoneColorK?.(snap.halftoneColorK);
    if (snap.halftoneFloodC != null) setters.setHalftoneFloodC?.(clamp(Number(snap.halftoneFloodC), 0, 1));
    if (snap.halftoneGainC != null) setters.setHalftoneGainC?.(clamp(Number(snap.halftoneGainC), -1, 1));
    if (snap.halftoneGainY != null) setters.setHalftoneGainY?.(clamp(Number(snap.halftoneGainY), -1, 1));
  };

  const applyCombo = () => {
    if (snap.comboGridSize != null) setters.setComboGridSize?.(Math.round(clamp(Number(snap.comboGridSize), 8, 256)));
    if (snap.comboPalette != null) setters.setComboPalette?.(Math.round(clamp(Number(snap.comboPalette), 0, 4)));
    if (snap.comboBgShade != null) setters.setComboBgShade?.(Math.round(clamp(Number(snap.comboBgShade), 0, 5)));
    if (snap.comboRectColorSource != null) setters.setComboRectColorSource?.(Math.round(clamp(Number(snap.comboRectColorSource), 0, 2)));
    if (snap.comboPatternWarpShade != null) setters.setComboPatternWarpShade?.(Math.round(clamp(Number(snap.comboPatternWarpShade), 0, 4)));
    if (snap.comboPatternWeftShade != null) setters.setComboPatternWeftShade?.(Math.round(clamp(Number(snap.comboPatternWeftShade), 0, 4)));
    if (snap.comboLumaSizeMix != null) setters.setComboLumaSizeMix?.(clamp(Number(snap.comboLumaSizeMix), 0, 1));
    if (snap.comboLumaSizeInvert != null) setters.setComboLumaSizeInvert?.(Math.round(clamp(Number(snap.comboLumaSizeInvert), 0, 1)));
    if (snap.comboLumaSizeFloor != null) setters.setComboLumaSizeFloor?.(clamp(Number(snap.comboLumaSizeFloor), 0.05, 1));
    if (snap.comboCellGeometryMode != null) setters.setComboCellGeometryMode?.(Math.round(clamp(Number(snap.comboCellGeometryMode), 0, 1)));
    if (snap.comboStitchLumaMax != null) setters.setComboStitchLumaMax?.(clamp(Number(snap.comboStitchLumaMax), 0, 1));
    if (snap.comboQuantizeSteps != null) setters.setComboQuantizeSteps?.(Math.round(clamp(Number(snap.comboQuantizeSteps), 0, 32)));
    if (snap.comboQuantizeMode != null) setters.setComboQuantizeMode?.(Math.round(clamp(Number(snap.comboQuantizeMode), 0, 1)));
    if (snap.comboQuantizeGamma != null) setters.setComboQuantizeGamma?.(clamp(Number(snap.comboQuantizeGamma), 0.25, 4));
    if (snap.comboQuantizeDither != null) setters.setComboQuantizeDither?.(clamp(Number(snap.comboQuantizeDither), 0, 1));
    if (snap.comboPatternIndex != null) setters.setComboPatternIndex?.(Math.round(clamp(Number(snap.comboPatternIndex), 0, PATTERNS.length - 1)));
    if (snap.comboRectRadius != null) setters.setComboRectRadius?.(clamp(Number(snap.comboRectRadius), 0, 0.5));
    if (snap.comboRectAspect != null) setters.setComboRectAspect?.(clamp(Number(snap.comboRectAspect), 0.3, 1.5));
    if (snap.comboRectRatio != null) setters.setComboRectRatio?.(clamp(Number(snap.comboRectRatio), 0.2, 1));
  };

  if (view === 'weaving' && !weaveHalftoneOn) {
    applyWeave();
  } else if (view === 'weaving' && weaveHalftoneOn) {
    applyWeave();
    applyHalftone();
  } else if (view === 'imageRectsHalftone') {
    applyCombo();
    applyHalftone();
    if (snap.patternFit === 'fit' || snap.patternFit === 'fill') setters.setPatternFit?.(snap.patternFit);
  }
}
