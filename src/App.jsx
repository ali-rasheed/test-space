/**
 * ENS Warp&Weft — root shell: Weave, Mosaic; URL sync; shared sidebars / lazy stages.
 */
import { useState, useCallback, useRef, useEffect, useMemo, useId, lazy, Suspense } from 'react';
import { motion } from 'motion/react';
import * as Select from '@radix-ui/react-select';
import * as Label from '@radix-ui/react-label';
import { ShaderCanvas } from './components/ShaderCanvas';
import { SliderWithInput } from './components/SliderWithInput';
import { useCanvasRecorder } from './hooks/useCanvasRecorder';
import { useKeyframePlayback } from './hooks/useKeyframePlayback';
import { getWeaveAppKeyframeSnapshot, applyWeaveAppKeyframe } from './keyframe/weaveAppKeyframe';
import { CaptureToolbar } from './components/CaptureToolbar';
import { ShaderEmbedExportModal } from './components/ShaderEmbedExportModal.jsx';
import { ConfigExportModal } from './components/ConfigExportModal.jsx';
import { halftoneCmykPresets } from '@paper-design/shaders-react';
import { PATTERNS, buildPatternSelectOptions, randomEnabledPatternIndex } from './patterns';
import { getCopyCanvas } from './copyHelpers';
import {
  capToMaxDimension,
  pngBlobToFormat,
  scaleCanvasToBlob,
  downloadBlob,
  imageExportFilename,
} from './canvasImageExport';
import { diagonalRevealDurationSec } from './weaveDiagonalReveal';

/** Copy/export/record: weaving + halftone uses halftone canvas (legacy view name `weavingHalftone`). */
function copyExportView(view, weaveHalftoneOn) {
  if (view === 'weaving' && weaveHalftoneOn) return 'weavingHalftone';
  return view;
}
import {
  GRID_SNAPS,
  getGridSizeIndex,
  CANVAS_ASPECT_PRESETS,
  canvasAspectKey,
  PRESETS,
  RECT_ASPECT_DEFAULT,
  snapGradRangeValue,
  URL_STATE_MAX_LEN,
  WEAVE_ICONS,
  WEAVING_DPR,
} from './constants';
import {
  WEAVING_URL_DEFAULTS,
  HALFTONE_DEFAULTS,
  COMBO_DEFAULTS,
  KEYFRAME_ANIM_DEFAULT_SEC,
} from './urlDefaults';
import { encodeKeyframeSnapshot, decodeKeyframeSnapshot } from './keyframe/keyframeUrlCodec';
import {
  encodeColorwayAnimPlaying,
  clampColorwayAnimBits,
} from './colorwayAnimUrl';
import { getShaderEmbedDriverAutoBits } from './export/shaderEmbedInferAnimation';
import { useColorwayState } from './hooks/useColorwayState';
import ColorwaysControls from './components/ColorwaysControls';
import { ColorwayPaletteSwatches } from './components/ColorwayPaletteSwatches';
import { COLORWAY_ANIM_INITIAL } from './colorwayUtils';
import {
  PALETTE_NAMES,
  SHADE_NAMES,
  typeBase,
  typeLabel,
  typeCaption,
  iconSm,
  iconMd,
  iconLg,
  iconXs,
  iconPlayGlyph,
  iconResetGlyph,
  SHADE_TRANSPARENT_ICON,
  btnGhost,
  selectTrigger,
  selectContent,
  selectItem,
  pill,
  inputNumber,
  sidebarGroup,
  sidebarGroupSticky,
  sidebarGroupTitle,
  controlLabel,
  navBtnActive,
  navBtnInactive,
  menuToggle,
  menuToggleActive,
  menuToggleInactive,
  toggleBtn,
  toggleBtnActive,
  toggleBtnIcon,
} from './uiConstants';
import { Icon, GroupIcon, AppSelect, DirectionSwitch, SegmentedControl, SegmentedControlButton, IconButton } from './components/ui';
import { RecordingDownloadBanner } from './components/RecordingDownloadBanner.jsx';
import { ThemeToggle } from './components/ThemeToggle.jsx';

/** Lazy load to avoid circular/order-dependent init in production bundle (TDZ). */
const AppV2 = lazy(() => import('./AppV2.jsx'));
const WeavingHalftoneStage = lazy(() => import('./components/WeavingHalftoneStage.jsx').then((m) => ({ default: m.WeavingHalftoneStage })));
const HALFTONE_TYPE_MAP = ['dots', 'ink', 'sharp'];

/** Weave stitch-in: same modes as Mosaic (fragmentImageRects). */
const STITCH_REVEAL_MODE_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 1, label: 'Noise' },
  { value: 2, label: 'Bleed' },
];

function packHexColors(values) {
  return values.map((v) => String(v).replace('#', '')).join(',');
}

function unpackHexColors(raw) {
  const parts = String(raw).split(',');
  if (parts.length !== 5) return null;
  const valid = parts.every((p) => /^[0-9a-fA-F]{6}$/.test(p));
  if (!valid) return null;
  return parts.map((p) => `#${p.toLowerCase()}`);
}

/** Parse search params into state-like object. Only includes keys that were present. */
function parseUrlState(search) {
  const params = new URLSearchParams(search);
  const out = {};
  const num = (paramKey, stateKey, min, max) => {
    const v = params.get(paramKey);
    if (v == null) return;
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    out[stateKey] = (min != null && max != null) ? Math.max(min, Math.min(max, n)) : n;
  };
  const grad = (prefix) => {
    const raw = params.get(prefix === 'warp' ? 'warpG' : 'weftG');
    if (!raw) return;
    const parts = raw.split(',').map(Number);
    if (parts.length !== 5 || parts.some((x) => !Number.isFinite(x))) return;
    const [startShade, endShade, direction, r0, r1] = parts;
    out[prefix === 'warp' ? 'warpGradient' : 'weftGradient'] = {
      startShade: Math.max(0, Math.min(4, startShade)),
      endShade: Math.max(0, Math.min(4, endShade)),
      direction: direction === 1 ? 1 : 0,
      range: [Math.max(0, Math.min(100, r0)), Math.max(0, Math.min(100, r1))],
    };
  };
  num('p', 'pattern', 0, PATTERNS.length - 1);
  num('pal', 'palette', 0, 4);
  num('bg', 'bgShade', 0, 5);
  num('warp', 'warpShade', 0, 5);
  num('weft', 'weftShade', 0, 5);
  num('grid', 'gridSize', 8, 256);
  num('ensm', 'weaveEnsMarkVisible', 0, 1);
  num('preset', 'presetIndex', 0, PRESETS.length - 1);
  grad('warp');
  grad('weft');
  num('wgg', 'warpGradientEnabled', 0, 1);
  num('wfg', 'weftGradientEnabled', 0, 1);
  num('steps', 'gradSteps', 0, 16);
  num('rect', 'rectAspect', 0.5, 1);
  num('corner', 'cornerRadius', 0, 0.5);
  num('canvas', 'canvasAspect', 0.5, 2);
  num('all', 'useAllColorways', 0, 1);
  num('seed', 'colorwaySeed', 0, 999);
  num('cns', 'colorwayNoiseScale', 0.005, 0.25);
  num('cnm', 'colorwayNoiseMode', 0, 2);
  num('cno', 'colorwayNoiseOctaves', 1, 4);
  num('cnp', 'colorwayNoisePersistence', 0.15, 0.95);
  num('cnl', 'colorwayNoiseLacunarity', 1.05, 4);
  num('cnbb', 'colorwayNoiseBias', 0.25, 4);
  num('cnx', 'colorwayNoiseX', -500, 500);
  {
    const legacy = params.get('cnz');
    if (legacy != null && out.colorwayNoiseX === undefined) {
      const n = Number(legacy);
      if (Number.isFinite(n)) out.colorwayNoiseX = Math.max(-500, Math.min(500, n));
    }
  }
  num('cba', 'colorwayBleedAnisotropy', 0.35, 12);
  num('cbr', 'colorwayBleedRotation', 0, 1);
  num('cbx', 'colorwayBleedCrossFiber', 0, 1);
  num('cbd', 'colorwayBleedDraftCoupled', 0, 1);
  num('cpm', 'colorwayIncludeMask', 0, 31);
  num('shimmer', 'shimmer', 0, 1);
  num('shimmerSp', 'shimmerSpeed', 1, 16);
  num('shimmerW', 'shimmerWidth', 0.25, 24);
  num('shimmerInt', 'shimmerIntensity', 0, 1);
  num('shimmerPos', 'shimmerPosition', 0, 1);
  num('shimmerRot', 'shimmerRotation', 0, 1);
  num('shimmerN', 'shimmerNoise', 0, 1);
  num('shimmerNS', 'shimmerNoiseSeed', 0, 1);
  num('shimmerNMin', 'shimmerNoiseMin', 0, 2);
  num('shimmerNMax', 'shimmerNoiseMax', 0, 2);
  num('shimmerBlend', 'shimmerBlendMode', 0, 10);
  const cwp = params.get('cwp');
  if (cwp != null) {
    const n = Number(cwp);
    if (Number.isFinite(n)) out.colorwayPlayBits = clampColorwayAnimBits(n);
  }
  const shp = params.get('shp');
  if (shp === '0') out.shimmerPlaying = false;
  else if (shp === '1') out.shimmerPlaying = true;
  num('srm', 'weaveStitchRevealMode', 0, 2);
  const wsrd = params.get('srd');
  if (wsrd != null) {
    const n = Number(wsrd);
    if (Number.isFinite(n)) out.weaveStitchRevealDurationSec = Math.max(0.25, Math.min(30, n / 100));
  }
  const wsrs = params.get('srs');
  if (wsrs != null) {
    const n = Number(wsrs);
    if (Number.isFinite(n)) out.weaveStitchRevealSeed = Math.max(0, Math.min(999999, n));
  }
  const wsrsc = params.get('srsc');
  if (wsrsc != null) {
    const n = Number(wsrsc);
    if (Number.isFinite(n)) out.weaveStitchRevealScale = Math.max(0.02, Math.min(0.8, n / 1000));
  }
  const wsrns = params.get('srns');
  if (wsrns != null) {
    const n = Number(wsrns);
    if (Number.isFinite(n)) out.weaveStitchRevealNoiseScale = Math.max(0.25, Math.min(4, n / 100));
  }
  const wsrso = params.get('srso');
  if (wsrso != null) {
    const n = Number(wsrso);
    if (Number.isFinite(n)) out.weaveStitchRevealSoftness = Math.max(0.01, Math.min(0.35, n / 1000));
  }
  num('srba', 'weaveStitchRevealBleedAnisotropy', 0, 12);
  const wsrbr = params.get('srbr');
  if (wsrbr != null) {
    const n = Number(wsrbr);
    if (Number.isFinite(n)) out.weaveStitchRevealBleedRotation = Math.max(0, Math.min(1, n / 1000));
  }
  const wsrbc = params.get('srbc');
  if (wsrbc != null) {
    const n = Number(wsrbc);
    if (Number.isFinite(n)) out.weaveStitchRevealBleedCrossFiber = Math.max(0, Math.min(1, n / 1000));
  }
  const wsrbd = params.get('srbd');
  if (wsrbd === '1') out.weaveStitchRevealBleedDraftCoupled = 1;
  if (wsrbd === '0') out.weaveStitchRevealBleedDraftCoupled = 0;
  const srkm = params.get('srkm');
  if (srkm === '1') out.weaveStitchRevealKeyframeDrive = true;
  else if (srkm === '0') out.weaveStitchRevealKeyframeDrive = false;
  num('hp', 'halftonePresetIndex', 0, halftoneCmykPresets.length - 1);
  num('hs', 'halftoneSize', 0.01, 1);
  num('hsoft', 'halftoneSoftness', 0, 1);
  num('hgn', 'halftoneGridNoise', 0, 1);
  num('hc', 'halftoneContrast', 0, 2);
  num('hfc', 'halftoneFloodC', 0, 1);
  num('hgc', 'halftoneGainC', -1, 1);
  num('hgy', 'halftoneGainY', -1, 1);
  num('cg', 'comboGridSize', 8, 96);
  num('cpal', 'comboPalette', 0, 4);
  num('cbg', 'comboBgShade', 0, 5);
  num('ccm', 'comboRectColorSource', 0, 2);
  num('cpws', 'comboPatternWarpShade', 0, 4);
  num('cpwf', 'comboPatternWeftShade', 0, 4);
  num('cq', 'comboQuantizeSteps', 0, 32);
  num('cqm', 'comboQuantizeMode', 0, 1);
  num('cp', 'comboPatternIndex', 0, PATTERNS.length - 1);
  num('crr', 'comboRectRadius', 0, 0.5);
  num('cra', 'comboRectAspect', 0.3, 1.5);
  num('cratio', 'comboRectRatio', 0.2, 1);
  const cqg = params.get('cqg');
  if (cqg != null) {
    const n = Number(cqg);
    if (Number.isFinite(n)) out.comboQuantizeGamma = Math.max(0.25, Math.min(4, n / 100));
  }
  const cqd = params.get('cqd');
  if (cqd != null) {
    const n = Number(cqd);
    if (Number.isFinite(n)) out.comboQuantizeDither = Math.max(0, Math.min(1, n / 100));
  }
  const cls = params.get('cls');
  if (cls != null) {
    const n = Number(cls);
    if (Number.isFinite(n)) out.comboLumaSizeMix = Math.max(0, Math.min(1, n / 100));
  }
  const clsi = params.get('clsi');
  if (clsi != null) {
    const n = Number(clsi);
    if (n === 0 || n === 1) out.comboLumaSizeInvert = n;
  }
  const clsf = params.get('clsf');
  if (clsf != null) {
    const n = Number(clsf);
    if (Number.isFinite(n)) out.comboLumaSizeFloor = Math.max(0.05, Math.min(1, n / 100));
  }
  num('cgm', 'comboCellGeometryMode', 0, 1);
  const cglt = params.get('cglt');
  if (cglt != null) {
    const n = Number(cglt);
    if (Number.isFinite(n)) out.comboStitchLumaMax = Math.max(0, Math.min(1, n / 100));
  }
  const ht = params.get('ht');
  if (ht != null && HALFTONE_TYPE_MAP[Number(ht)]) out.halftoneType = HALFTONE_TYPE_MAP[Number(ht)];
  const hcols = params.get('hcols');
  if (hcols) {
    const colors = unpackHexColors(hcols);
    if (colors) {
      [out.halftoneColorBack, out.halftoneColorC, out.halftoneColorM, out.halftoneColorY, out.halftoneColorK] = colors;
    }
  }
  const cf = params.get('cf');
  if (cf === 'webp' || cf === 'png') out.copyFormat = cf;
  const cs = params.get('cs');
  if (cs !== null && [1, 2, 4, 8, 12].includes(Number(cs))) out.copyScale = Number(cs);
  const v = params.get('v');
  if (v === '1') out.view = 'weaving';
  else if (v === '2' || v === '5' || v === '6') out.view = 'imageRects';
  else if (v === '3') out.view = 'weaving';
  else if (v === '4') out.view = 'imageRects';
  const wht = params.get('wht');
  if (wht === '1') out.weaveHalftoneOn = true;
  if (wht === '0') out.weaveHalftoneOn = false;
  if (v === '3') out.weaveHalftoneOn = true;
  const display = params.get('display');
  if (display === 'fill' || display === 'fit') out.patternFit = display;
  const menu = params.get('menu');
  if (menu === '1') out.menuHidden = false; // menu=1 → sidebar always visible
  const kad = params.get('kad');
  if (kad != null) {
    const n = Number(kad);
    if (Number.isFinite(n)) out.keyframeAnimDurationSec = Math.max(0.5, Math.min(30, n / 100));
  }
  const kfe = params.get('kfe');
  if (kfe === '1') out.keyframeEditingAfter = true;
  else if (kfe === '0') out.keyframeEditingAfter = false;
  const kfa = params.get('kfa');
  if (kfa) {
    const o = decodeKeyframeSnapshot(kfa);
    if (o) out.keyframeSnapshotA = o;
  }
  const kfb = params.get('kfb');
  if (kfb) {
    const o = decodeKeyframeSnapshot(kfb);
    if (o) out.keyframeSnapshotB = o;
  }
  return out;
}
function getInitialView() {
  const v = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('v');
  if (v === '2' || v === '5' || v === '6') return 'imageRects';
  if (v === '4') return 'imageRects';
  return 'weaving';
}

function getInitialWeaveHalftone() {
  const p = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const v = p.get('v');
  const wht = p.get('wht');
  return v === '3' || wht === '1';
}
/** Build compact search string from state; omit defaults to keep URL short. */
function buildUrlState(state) {
  const def = WEAVING_URL_DEFAULTS;
  const p = new URLSearchParams();
  let urlV = 1;
  if (state.view === 'imageRects') urlV = 2;
  else if (state.view === 'weaving' && state.weaveHalftoneOn) urlV = 3;
  if (urlV !== 1) p.set('v', String(urlV));
  if (state.presetIndex != null && state.presetIndex >= 0 && state.presetIndex < PRESETS.length) p.set('preset', String(state.presetIndex));
  if (state.pattern !== def.pattern) p.set('p', String(state.pattern));
  if (state.palette !== def.palette) p.set('pal', String(state.palette));
  if (state.bgShade !== def.bgShade) p.set('bg', String(state.bgShade));
  if (state.warpShade !== def.warpShade) p.set('warp', String(state.warpShade));
  if (state.weftShade !== def.weftShade) p.set('weft', String(state.weftShade));
  if (state.gridSize !== def.gridSize) p.set('grid', String(state.gridSize));
  if (!!state.weaveEnsMarkVisible !== !!def.weaveEnsMarkVisible) p.set('ensm', state.weaveEnsMarkVisible ? '1' : '0');
  const wg = state.warpGradient;
  if (wg && (wg.startShade !== def.warpGradient.startShade || wg.endShade !== def.warpGradient.endShade || wg.direction !== def.warpGradient.direction || wg.range[0] !== def.warpGradient.range[0] || wg.range[1] !== def.warpGradient.range[1])) {
    p.set('warpG', [wg.startShade, wg.endShade, wg.direction, wg.range[0], wg.range[1]].join(','));
  }
  const wft = state.weftGradient;
  if (wft && (wft.startShade !== def.weftGradient.startShade || wft.endShade !== def.weftGradient.endShade || wft.direction !== def.weftGradient.direction || wft.range[0] !== def.weftGradient.range[0] || wft.range[1] !== def.weftGradient.range[1])) {
    p.set('weftG', [wft.startShade, wft.endShade, wft.direction, wft.range[0], wft.range[1]].join(','));
  }
  if (state.gradSteps !== def.gradSteps) p.set('steps', String(state.gradSteps));
  if (!!state.warpGradientEnabled !== !!def.warpGradientEnabled) p.set('wgg', state.warpGradientEnabled ? '1' : '0');
  if (!!state.weftGradientEnabled !== !!def.weftGradientEnabled) p.set('wfg', state.weftGradientEnabled ? '1' : '0');
  if (state.rectAspect !== def.rectAspect) p.set('rect', String(Number(state.rectAspect.toFixed(2))));
  if (state.cornerRadius !== def.cornerRadius) p.set('corner', String(Number(state.cornerRadius.toFixed(2))));
  if (state.canvasAspect !== def.canvasAspect) p.set('canvas', String(Number(state.canvasAspect.toFixed(2))));
  if (state.copyFormat !== def.copyFormat) p.set('cf', state.copyFormat);
  if (state.copyScale !== def.copyScale) p.set('cs', String(state.copyScale));
  if (state.useAllColorways !== def.useAllColorways) p.set('all', state.useAllColorways ? '1' : '0');
  if (state.colorwaySeed !== def.colorwaySeed) p.set('seed', String(state.colorwaySeed));
  if (state.colorwayNoiseScale !== def.colorwayNoiseScale) p.set('cns', String(Number(state.colorwayNoiseScale.toFixed(3))));
  if (state.colorwayNoiseMode !== def.colorwayNoiseMode) p.set('cnm', String(Math.round(state.colorwayNoiseMode)));
  if (state.colorwayNoiseOctaves !== def.colorwayNoiseOctaves) p.set('cno', String(Math.round(state.colorwayNoiseOctaves)));
  if (state.colorwayNoisePersistence !== def.colorwayNoisePersistence) p.set('cnp', String(Number(state.colorwayNoisePersistence.toFixed(2))));
  if (state.colorwayNoiseLacunarity !== def.colorwayNoiseLacunarity) p.set('cnl', String(Number(state.colorwayNoiseLacunarity.toFixed(2))));
  if (state.colorwayNoiseBias !== def.colorwayNoiseBias) p.set('cnbb', String(Number(state.colorwayNoiseBias.toFixed(2))));
  if (state.colorwayNoiseX !== def.colorwayNoiseX) p.set('cnx', String(Number(state.colorwayNoiseX.toFixed(2))));
  if (state.colorwayBleedAnisotropy !== def.colorwayBleedAnisotropy) p.set('cba', String(Number(state.colorwayBleedAnisotropy.toFixed(2))));
  if (state.colorwayBleedRotation !== def.colorwayBleedRotation) p.set('cbr', String(Number(state.colorwayBleedRotation.toFixed(3))));
  if (state.colorwayBleedCrossFiber !== def.colorwayBleedCrossFiber) p.set('cbx', String(Number(state.colorwayBleedCrossFiber.toFixed(2))));
  if (!!state.colorwayBleedDraftCoupled !== !!def.colorwayBleedDraftCoupled) p.set('cbd', state.colorwayBleedDraftCoupled ? '1' : '0');
  if (state.colorwayIncludeMask !== def.colorwayIncludeMask) p.set('cpm', String(Math.round(state.colorwayIncludeMask)));
  if (state.weaveStitchRevealMode !== def.weaveStitchRevealMode) p.set('srm', String(state.weaveStitchRevealMode));
  if (state.weaveStitchRevealDurationSec !== def.weaveStitchRevealDurationSec) p.set('srd', String(Math.round(state.weaveStitchRevealDurationSec * 100)));
  if (state.weaveStitchRevealSeed !== def.weaveStitchRevealSeed) p.set('srs', String(Math.round(state.weaveStitchRevealSeed)));
  if (state.weaveStitchRevealScale !== def.weaveStitchRevealScale) p.set('srsc', String(Math.round(state.weaveStitchRevealScale * 1000)));
  if (state.weaveStitchRevealNoiseScale !== def.weaveStitchRevealNoiseScale) p.set('srns', String(Math.round(state.weaveStitchRevealNoiseScale * 100)));
  if (state.weaveStitchRevealSoftness !== def.weaveStitchRevealSoftness) p.set('srso', String(Math.round(state.weaveStitchRevealSoftness * 1000)));
  if (state.weaveStitchRevealBleedAnisotropy !== def.weaveStitchRevealBleedAnisotropy) p.set('srba', String(Math.round(state.weaveStitchRevealBleedAnisotropy)));
  if (state.weaveStitchRevealBleedRotation !== def.weaveStitchRevealBleedRotation) p.set('srbr', String(Math.round(state.weaveStitchRevealBleedRotation * 1000)));
  if (state.weaveStitchRevealBleedCrossFiber !== def.weaveStitchRevealBleedCrossFiber) p.set('srbc', String(Math.round(state.weaveStitchRevealBleedCrossFiber * 1000)));
  if (state.weaveStitchRevealBleedDraftCoupled !== def.weaveStitchRevealBleedDraftCoupled) p.set('srbd', state.weaveStitchRevealBleedDraftCoupled ? '1' : '0');
  if (!!state.weaveStitchRevealKeyframeDrive !== !!def.weaveStitchRevealKeyframeDrive) p.set('srkm', state.weaveStitchRevealKeyframeDrive ? '1' : '0');
  if (state.shimmer !== def.shimmer) p.set('shimmer', state.shimmer ? '1' : '0');
  if (state.shimmerSpeed !== def.shimmerSpeed) p.set('shimmerSp', String(Math.round(state.shimmerSpeed)));
  if (state.shimmerWidth !== def.shimmerWidth) p.set('shimmerW', String(Number(state.shimmerWidth.toFixed(2))));
  if (state.shimmerIntensity !== def.shimmerIntensity) p.set('shimmerInt', String(Number(state.shimmerIntensity.toFixed(2))));
  if (state.shimmerPosition !== def.shimmerPosition) p.set('shimmerPos', String(Number(state.shimmerPosition.toFixed(2))));
  if (state.shimmerRotation !== def.shimmerRotation) p.set('shimmerRot', String(Number(state.shimmerRotation.toFixed(3))));
  if (state.shimmerNoise !== def.shimmerNoise) p.set('shimmerN', String(Number(state.shimmerNoise.toFixed(2))));
  if (state.shimmerNoiseSeed !== def.shimmerNoiseSeed) p.set('shimmerNS', String(Number(state.shimmerNoiseSeed.toFixed(3))));
  if (state.shimmerNoiseMin !== def.shimmerNoiseMin) p.set('shimmerNMin', String(Number(state.shimmerNoiseMin.toFixed(2))));
  if (state.shimmerNoiseMax !== def.shimmerNoiseMax) p.set('shimmerNMax', String(Number(state.shimmerNoiseMax.toFixed(2))));
  if (state.shimmerBlendMode !== def.shimmerBlendMode) p.set('shimmerBlend', String(state.shimmerBlendMode));
  const cwBits = encodeColorwayAnimPlaying(state.colorwayAnimPlaying || COLORWAY_ANIM_INITIAL);
  if (cwBits !== 0) p.set('cwp', String(cwBits));
  if (state.shimmerPlaying === false) p.set('shp', '0');
  /** Weave: bitmask of embed driver auto/controlled state (bit index = DRIVER_ORDER in shaderEmbedInferAnimation); omit when same as fresh defaults. */
  if (state.view === 'weaving') {
    const inferState = { ...def, ...state };
    const inferOpts = {
      smartAuto: true,
      isKeyframePlaying: !!state.weaveKeyframePlaying,
      shimmerPlaying: state.shimmerPlaying !== false,
      staticMode: false,
      colorwayAnimPlaying: state.colorwayAnimPlaying || COLORWAY_ANIM_INITIAL,
    };
    const embedBits = getShaderEmbedDriverAutoBits(inferState, inferOpts);
    const defaultEmbedBits = getShaderEmbedDriverAutoBits(
      { ...def },
      { smartAuto: true, isKeyframePlaying: false, shimmerPlaying: true, staticMode: false },
    );
    if (embedBits !== defaultEmbedBits) p.set('epl', String(embedBits));
    if (state.weaveKeyframePlaying) p.set('wkp', '1');
  }
  if (state.patternFit !== def.patternFit) p.set('display', state.patternFit);
  if (state.halftonePresetIndex !== HALFTONE_DEFAULTS.presetIndex) p.set('hp', String(state.halftonePresetIndex));
  if (state.halftoneSize !== HALFTONE_DEFAULTS.size) p.set('hs', String(Number(state.halftoneSize.toFixed(2))));
  if (state.halftoneSoftness !== HALFTONE_DEFAULTS.softness) p.set('hsoft', String(Number(state.halftoneSoftness.toFixed(2))));
  if (state.halftoneGridNoise !== HALFTONE_DEFAULTS.gridNoise) p.set('hgn', String(Number(state.halftoneGridNoise.toFixed(2))));
  if (state.halftoneContrast !== HALFTONE_DEFAULTS.contrast) p.set('hc', String(Number(state.halftoneContrast.toFixed(2))));
  if (state.halftoneType !== HALFTONE_DEFAULTS.type) p.set('ht', String(Math.max(0, HALFTONE_TYPE_MAP.indexOf(state.halftoneType))));
  if (state.halftoneFloodC !== HALFTONE_DEFAULTS.floodC) p.set('hfc', String(Number(state.halftoneFloodC.toFixed(2))));
  if (state.halftoneGainC !== HALFTONE_DEFAULTS.gainC) p.set('hgc', String(Number(state.halftoneGainC.toFixed(2))));
  if (state.halftoneGainY !== HALFTONE_DEFAULTS.gainY) p.set('hgy', String(Number(state.halftoneGainY.toFixed(2))));
  if (
    state.halftoneColorBack !== HALFTONE_DEFAULTS.colorBack
    || state.halftoneColorC !== HALFTONE_DEFAULTS.colorC
    || state.halftoneColorM !== HALFTONE_DEFAULTS.colorM
    || state.halftoneColorY !== HALFTONE_DEFAULTS.colorY
    || state.halftoneColorK !== HALFTONE_DEFAULTS.colorK
  ) {
    p.set('hcols', packHexColors([state.halftoneColorBack, state.halftoneColorC, state.halftoneColorM, state.halftoneColorY, state.halftoneColorK]));
  }
  if (state.comboGridSize !== COMBO_DEFAULTS.gridSize) p.set('cg', String(state.comboGridSize));
  if (state.comboPalette !== COMBO_DEFAULTS.palette) p.set('cpal', String(state.comboPalette));
  if (state.comboBgShade !== COMBO_DEFAULTS.bgShade) p.set('cbg', String(state.comboBgShade));
  if (state.comboRectColorSource !== COMBO_DEFAULTS.rectColorSource) p.set('ccm', String(state.comboRectColorSource));
  if (state.comboPatternWarpShade !== COMBO_DEFAULTS.patternWarpShade) p.set('cpws', String(state.comboPatternWarpShade));
  if (state.comboPatternWeftShade !== COMBO_DEFAULTS.patternWeftShade) p.set('cpwf', String(state.comboPatternWeftShade));
  if (state.comboLumaSizeMix !== COMBO_DEFAULTS.lumaSizeMix) p.set('cls', String(Math.round(state.comboLumaSizeMix * 100)));
  if (state.comboLumaSizeInvert !== COMBO_DEFAULTS.lumaSizeInvert) p.set('clsi', String(state.comboLumaSizeInvert));
  if (state.comboLumaSizeFloor !== COMBO_DEFAULTS.lumaSizeFloor) p.set('clsf', String(Math.round(state.comboLumaSizeFloor * 100)));
  if (state.comboCellGeometryMode !== COMBO_DEFAULTS.cellGeometryMode) p.set('cgm', String(state.comboCellGeometryMode));
  if (state.comboStitchLumaMax !== COMBO_DEFAULTS.stitchLumaMax) p.set('cglt', String(Math.round(state.comboStitchLumaMax * 100)));
  if (state.comboQuantizeSteps !== COMBO_DEFAULTS.quantizeSteps) p.set('cq', String(state.comboQuantizeSteps));
  if (state.comboQuantizeMode !== COMBO_DEFAULTS.quantizeMode) p.set('cqm', String(state.comboQuantizeMode));
  if (state.comboQuantizeGamma !== COMBO_DEFAULTS.quantizeGamma) p.set('cqg', String(Math.round(state.comboQuantizeGamma * 100)));
  if (state.comboQuantizeDither !== COMBO_DEFAULTS.quantizeDither) p.set('cqd', String(Math.round(state.comboQuantizeDither * 100)));
  if (state.comboPatternIndex !== COMBO_DEFAULTS.patternIndex) p.set('cp', String(state.comboPatternIndex));
  if (state.comboRectRadius !== COMBO_DEFAULTS.rectRadius) p.set('crr', String(Number(state.comboRectRadius.toFixed(2))));
  if (state.comboRectAspect !== COMBO_DEFAULTS.rectAspect) p.set('cra', String(Number(state.comboRectAspect.toFixed(2))));
  if (state.comboRectRatio !== COMBO_DEFAULTS.rectRatio) p.set('cratio', String(Number(state.comboRectRatio.toFixed(2))));
  if (state.menuHidden === false) p.set('menu', '1');
  const kd =
    state.keyframeAnimDurationSec != null && Number.isFinite(state.keyframeAnimDurationSec)
      ? state.keyframeAnimDurationSec
      : KEYFRAME_ANIM_DEFAULT_SEC;
  if (Math.abs(kd - KEYFRAME_ANIM_DEFAULT_SEC) > 1e-6) {
    p.set('kad', String(Math.round(kd * 100)));
  }
  if (state.keyframeEditingAfter) p.set('kfe', '1');
  const encA = encodeKeyframeSnapshot(state.keyframeSnapshotA);
  const encB = encodeKeyframeSnapshot(state.keyframeSnapshotB);
  if (encA) p.set('kfa', encA);
  if (encB) p.set('kfb', encB);
  let s = p.toString();
  if (s.length > URL_STATE_MAX_LEN) {
    p.delete('kfa');
    p.delete('kfb');
    s = p.toString();
  }
  if (s.length > URL_STATE_MAX_LEN) {
    p.delete('kad');
    s = p.toString();
  }
  return s.length <= URL_STATE_MAX_LEN ? s : '';
}

/**
 * Canvas aspect preset dropdown footer: enter width and height (W÷H) and Apply (clamped 0.5–2 like URL `canvas`).
 * Syncs fields from `canvasAspect` when the value changes (e.g. picking a preset).
 */
function CanvasAspectCustomFooter({ canvasAspect, onApply }) {
  const id = useId();
  const wId = `${id}-w`;
  const hId = `${id}-h`;
  const [w, setW] = useState('');
  const [h, setH] = useState('');
  useEffect(() => {
    setW(String(Number(canvasAspect.toFixed(4))));
    setH('1');
  }, [canvasAspect]);
  const apply = useCallback(() => {
    const wf = parseFloat(String(w).replace(',', '.'));
    const hf = parseFloat(String(h).replace(',', '.'));
    if (!Number.isFinite(wf) || !Number.isFinite(hf) || hf === 0) return;
    const r = wf / hf;
    onApply(Math.max(0.5, Math.min(2, r)));
  }, [w, h, onApply]);
  return (
    <div className="px-2.5 py-2">
      <div className={`${typeLabel} mb-1.5 text-text-muted`}>Custom W∶H</div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Label.Root className="sr-only" htmlFor={wId}>Custom aspect width</Label.Root>
        <input
          id={wId}
          type="text"
          inputMode="decimal"
          value={w}
          onChange={(e) => setW(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') apply();
          }}
          className={inputNumber}
          size={6}
        />
        <span className={`${typeCaption} text-text-muted`} aria-hidden>∶</span>
        <Label.Root className="sr-only" htmlFor={hId}>Custom aspect height</Label.Root>
        <input
          id={hId}
          type="text"
          inputMode="decimal"
          value={h}
          onChange={(e) => setH(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') apply();
          }}
          className={inputNumber}
          size={6}
        />
        <button type="button" className={btnGhost} onClick={apply}>
          Apply
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState(getInitialView); // 'weaving' | 'imageRects' | 'imageRectsHalftone' — URL ?v=1–4 (+ legacy 5/6 → mosaic)
  const [weaveHalftoneOn, setWeaveHalftoneOn] = useState(getInitialWeaveHalftone);
  /** When true, sidebar is hidden until hover (v1–v5); when false, sidebar is always visible. Toggle in nav; persisted in URL ?menu=1. */
  const [menuHidden, setMenuHidden] = useState(true);
  const [presetIndex, setPresetIndex] = useState(null); // null = custom
  const [pattern, setPattern] = useState(WEAVING_URL_DEFAULTS.pattern);
  const [palette, setPalette] = useState(WEAVING_URL_DEFAULTS.palette);
  const [shadesLocked, setShadesLocked] = useState(false);
  const [bgShade, setBgShade] = useState(WEAVING_URL_DEFAULTS.bgShade);
  const [warpShade, setWarpShade] = useState(WEAVING_URL_DEFAULTS.warpShade);
  const [weftShade, setWeftShade] = useState(WEAVING_URL_DEFAULTS.weftShade);
  const [gridSize, setGridSize] = useState(WEAVING_URL_DEFAULTS.gridSize);
  const [warpGradient, setWarpGradient] = useState(WEAVING_URL_DEFAULTS.warpGradient);
  const [weftGradient, setWeftGradient] = useState(WEAVING_URL_DEFAULTS.weftGradient);
  const [warpGradientEnabled, setWarpGradientEnabled] = useState(WEAVING_URL_DEFAULTS.warpGradientEnabled);
  const [weftGradientEnabled, setWeftGradientEnabled] = useState(WEAVING_URL_DEFAULTS.weftGradientEnabled);
  const [gradSteps, setGradSteps] = useState(WEAVING_URL_DEFAULTS.gradSteps); // 0 = smooth; 2–16 = discrete bands
  const [rectAspect, setRectAspect] = useState(WEAVING_URL_DEFAULTS.rectAspect);
  const [cornerRadius, setCornerRadius] = useState(WEAVING_URL_DEFAULTS.cornerRadius);
  const [canvasAspect, setCanvasAspect] = useState(WEAVING_URL_DEFAULTS.canvasAspect);
  const [patternFit, setPatternFit] = useState(WEAVING_URL_DEFAULTS.patternFit); // 'fill' = cover view, 'fit' = contain
  /** In-shader ENS corner mark (`u_ensMarkVisible`); URL `ensm` 0|1. */
  const [weaveEnsMarkVisible, setWeaveEnsMarkVisible] = useState(WEAVING_URL_DEFAULTS.weaveEnsMarkVisible);
  const [embedExportOpen, setEmbedExportOpen] = useState(false);
  const [configExportOpen, setConfigExportOpen] = useState(false);
  const [fps, setFps] = useState(0);

  useEffect(() => {
    if (view !== 'weaving' && embedExportOpen) setEmbedExportOpen(false);
  }, [view, embedExportOpen]);
  useEffect(() => {
    if (view !== 'weaving' && configExportOpen) setConfigExportOpen(false);
  }, [view, configExportOpen]);
  /** Shimmer: looping highlight band; speed, width, intensity, position. */
  const [shimmer, setShimmer] = useState(WEAVING_URL_DEFAULTS.shimmer);
  /** When false, shimmer band is frozen at current position (u_shimmerTime paused). */
  const [shimmerPlaying, setShimmerPlaying] = useState(true);
  const [shimmerPausedAtTime, setShimmerPausedAtTime] = useState(0);
  const shimmerTimeRef = useRef(0);
  const [shimmerSpeed, setShimmerSpeed] = useState(WEAVING_URL_DEFAULTS.shimmerSpeed);
  const [shimmerWidth, setShimmerWidth] = useState(WEAVING_URL_DEFAULTS.shimmerWidth);
  const [shimmerIntensity, setShimmerIntensity] = useState(WEAVING_URL_DEFAULTS.shimmerIntensity);
  const [shimmerPosition, setShimmerPosition] = useState(WEAVING_URL_DEFAULTS.shimmerPosition);
  /** Band position 0–1; driven by time when playing, frozen when paused; Position slider shows this. */
  const [shimmerPhase, setShimmerPhase] = useState(0);
  const [shimmerRotation, setShimmerRotation] = useState(WEAVING_URL_DEFAULTS.shimmerRotation); // 0–1 = 0–360°; 0.125 ≈ 45° (diagonal)
  const [shimmerNoise, setShimmerNoise] = useState(WEAVING_URL_DEFAULTS.shimmerNoise); // 0 = none, 1 = ±50% per-shot intensity variation
  const [shimmerNoiseSeed, setShimmerNoiseSeed] = useState(WEAVING_URL_DEFAULTS.shimmerNoiseSeed); // 0–1 pattern variation
  const [shimmerNoiseMin, setShimmerNoiseMin] = useState(WEAVING_URL_DEFAULTS.shimmerNoiseMin); // clamp min for noise factor (0–2)
  const [shimmerNoiseMax, setShimmerNoiseMax] = useState(WEAVING_URL_DEFAULTS.shimmerNoiseMax); // clamp max for noise factor (0–2)
  const [shimmerBlendMode, setShimmerBlendMode] = useState(WEAVING_URL_DEFAULTS.shimmerBlendMode); // 0–10: Add, Multiply, Screen, Overlay, Soft Light, Hard Light, Color Dodge, Color Burn, Linear Burn, Difference, Exclusion
  const {
    useAllColorways,
    setUseAllColorways,
    colorwaySeed,
    setColorwaySeed,
    colorwayNoiseScale,
    setColorwayNoiseScale,
    colorwayNoiseMode,
    setColorwayNoiseMode,
    colorwayNoiseOctaves,
    setColorwayNoiseOctaves,
    colorwayNoisePersistence,
    setColorwayNoisePersistence,
    colorwayNoiseLacunarity,
    setColorwayNoiseLacunarity,
    colorwayNoiseBias,
    setColorwayNoiseBias,
    colorwayNoiseX,
    setColorwayNoiseX,
    colorwayBleedAnisotropy,
    setColorwayBleedAnisotropy,
    colorwayBleedRotation,
    setColorwayBleedRotation,
    colorwayBleedCrossFiber,
    setColorwayBleedCrossFiber,
    colorwayBleedDraftCoupled,
    setColorwayBleedDraftCoupled,
    colorwayIncludeMask,
    setColorwayIncludeMask,
    colorwayAnimPlaying,
    setColorwayAnimPlaying,
    resetColorwayToDefaults,
    applyColorwayFromUrl,
  } = useColorwayState();
  /** Weave stitch-in (Mosaic-parity); URL srm/srd/… */
  const [weaveStitchRevealMode, setWeaveStitchRevealMode] = useState(WEAVING_URL_DEFAULTS.weaveStitchRevealMode);
  const [weaveStitchRevealDurationSec, setWeaveStitchRevealDurationSec] = useState(WEAVING_URL_DEFAULTS.weaveStitchRevealDurationSec);
  const [weaveStitchRevealProgress, setWeaveStitchRevealProgress] = useState(WEAVING_URL_DEFAULTS.weaveStitchRevealProgress);
  const [weaveStitchRevealSeed, setWeaveStitchRevealSeed] = useState(WEAVING_URL_DEFAULTS.weaveStitchRevealSeed);
  const [weaveStitchRevealScale, setWeaveStitchRevealScale] = useState(WEAVING_URL_DEFAULTS.weaveStitchRevealScale);
  const [weaveStitchRevealNoiseScale, setWeaveStitchRevealNoiseScale] = useState(WEAVING_URL_DEFAULTS.weaveStitchRevealNoiseScale);
  const [weaveStitchRevealSoftness, setWeaveStitchRevealSoftness] = useState(WEAVING_URL_DEFAULTS.weaveStitchRevealSoftness);
  const [weaveStitchRevealBleedAnisotropy, setWeaveStitchRevealBleedAnisotropy] = useState(WEAVING_URL_DEFAULTS.weaveStitchRevealBleedAnisotropy);
  const [weaveStitchRevealBleedRotation, setWeaveStitchRevealBleedRotation] = useState(WEAVING_URL_DEFAULTS.weaveStitchRevealBleedRotation);
  const [weaveStitchRevealBleedCrossFiber, setWeaveStitchRevealBleedCrossFiber] = useState(WEAVING_URL_DEFAULTS.weaveStitchRevealBleedCrossFiber);
  const [weaveStitchRevealBleedDraftCoupled, setWeaveStitchRevealBleedDraftCoupled] = useState(WEAVING_URL_DEFAULTS.weaveStitchRevealBleedDraftCoupled);
  /** False = timed ramp (`srd`); true = slider + keyframe A/B (`srkm`). */
  const [weaveStitchRevealKeyframeDrive, setWeaveStitchRevealKeyframeDrive] = useState(WEAVING_URL_DEFAULTS.weaveStitchRevealKeyframeDrive);
  const [weaveStitchRevealPlayToken, setWeaveStitchRevealPlayToken] = useState(0);
  /** Diagonal load-in wave (0 = start, 1 = fully woven); auto-plays on load / pattern change. */
  const [diagonalRevealProgress, setDiagonalRevealProgress] = useState(0);
  const diagonalRevealAnimRafRef = useRef(0);
  /** Copy format: 'png' or 'webp'; copyScale: 1, 2, 4, 8, or 12× display size (copy + download). */
  const [copyFormat, setCopyFormat] = useState(WEAVING_URL_DEFAULTS.copyFormat);
  const [copyScale, setCopyScale] = useState(WEAVING_URL_DEFAULTS.copyScale);
  /** Include in Randomize: rect aspect and corner radius (off = keep current when randomizing). */
  const [randomizeRectAspect, setRandomizeRectAspect] = useState(true);
  const [randomizeCornerRadius, setRandomizeCornerRadius] = useState(true);
  const canvasRef = useRef(null);
  const weaveKeyframeStitchOverrideRef = useRef(false);
  /** True while Weave keyframe A→B transport is playing; pauses clock-driven shimmer phase updates. */
  const weaveKeyframePlayingRef = useRef(false);
  const weaveStitchPlayRecordTimeoutRef = useRef(null);
  const halftoneContainerRef = useRef(null);
  const halftoneCanvasRef = useRef(null);
  /** Set by ShaderCanvas when view is weaving: { captureAtResolution(w,h) }. Used for high-res export. */
  const weavingCaptureRef = useRef(null);
  const [copyFeedback, setCopyFeedback] = useState(null); // 'Copied!' | error string | null
  const [exportFeedback, setExportFeedback] = useState(null);
  const copyFeedbackTimeoutRef = useRef(null);
  const exportFeedbackTimeoutRef = useRef(null);

  /** Halftone params for v3 (Weaving  Halftone) view. */
  const [halftoneSize, setHalftoneSize] = useState(HALFTONE_DEFAULTS.size);
  const [halftoneSoftness, setHalftoneSoftness] = useState(HALFTONE_DEFAULTS.softness);
  const [halftoneGridNoise, setHalftoneGridNoise] = useState(HALFTONE_DEFAULTS.gridNoise);
  const [halftoneContrast, setHalftoneContrast] = useState(HALFTONE_DEFAULTS.contrast);
  const [halftoneType, setHalftoneType] = useState(HALFTONE_DEFAULTS.type);
  const [halftoneColorBack, setHalftoneColorBack] = useState(HALFTONE_DEFAULTS.colorBack);
  const [halftoneColorC, setHalftoneColorC] = useState(HALFTONE_DEFAULTS.colorC);
  const [halftoneColorM, setHalftoneColorM] = useState(HALFTONE_DEFAULTS.colorM);
  const [halftoneColorY, setHalftoneColorY] = useState(HALFTONE_DEFAULTS.colorY);
  const [halftoneColorK, setHalftoneColorK] = useState(HALFTONE_DEFAULTS.colorK);
  const [halftoneFloodC, setHalftoneFloodC] = useState(HALFTONE_DEFAULTS.floodC);
  const [halftoneGainC, setHalftoneGainC] = useState(HALFTONE_DEFAULTS.gainC);
  const [halftoneGainY, setHalftoneGainY] = useState(HALFTONE_DEFAULTS.gainY);
  const [halftonePresetIndex, setHalftonePresetIndex] = useState(HALFTONE_DEFAULTS.presetIndex);
  /** Weaving  Halftone: optional image from desktop (object URL). When set, halftone uses this instead of weaving. */
  const [halftoneCustomImageUrl, setHalftoneCustomImageUrl] = useState('');

  /** Print mosaic (combo): image from file only (no web URL). */
  const [comboImageSource, setComboImageSource] = useState('');
  const [comboGridSize, setComboGridSize] = useState(COMBO_DEFAULTS.gridSize);
  const [comboPalette, setComboPalette] = useState(COMBO_DEFAULTS.palette);
  const [comboBgShade, setComboBgShade] = useState(COMBO_DEFAULTS.bgShade);
  const [comboRectColorSource, setComboRectColorSource] = useState(COMBO_DEFAULTS.rectColorSource);
  const [comboPatternWarpShade, setComboPatternWarpShade] = useState(COMBO_DEFAULTS.patternWarpShade);
  const [comboPatternWeftShade, setComboPatternWeftShade] = useState(COMBO_DEFAULTS.patternWeftShade);
  const [comboLumaSizeMix, setComboLumaSizeMix] = useState(COMBO_DEFAULTS.lumaSizeMix);
  const [comboLumaSizeInvert, setComboLumaSizeInvert] = useState(COMBO_DEFAULTS.lumaSizeInvert);
  const [comboLumaSizeFloor, setComboLumaSizeFloor] = useState(COMBO_DEFAULTS.lumaSizeFloor);
  const [comboCellGeometryMode, setComboCellGeometryMode] = useState(COMBO_DEFAULTS.cellGeometryMode);
  const [comboStitchLumaMax, setComboStitchLumaMax] = useState(COMBO_DEFAULTS.stitchLumaMax);
  const [comboQuantizeSteps, setComboQuantizeSteps] = useState(COMBO_DEFAULTS.quantizeSteps);
  const [comboQuantizeMode, setComboQuantizeMode] = useState(COMBO_DEFAULTS.quantizeMode);
  const [comboQuantizeGamma, setComboQuantizeGamma] = useState(COMBO_DEFAULTS.quantizeGamma);
  const [comboQuantizeDither, setComboQuantizeDither] = useState(COMBO_DEFAULTS.quantizeDither);
  const [comboPatternIndex, setComboPatternIndex] = useState(COMBO_DEFAULTS.patternIndex);
  const [comboRectRadius, setComboRectRadius] = useState(COMBO_DEFAULTS.rectRadius);
  const [comboRectAspect, setComboRectAspect] = useState(COMBO_DEFAULTS.rectAspect);
  const [comboRectRatio, setComboRectRatio] = useState(COMBO_DEFAULTS.rectRatio);

  const applyHalftonePreset = useCallback((index) => {
    const preset = halftoneCmykPresets[index];
    if (!preset?.params) return;
    const p = preset.params;
    setHalftoneSize(p.size ?? HALFTONE_DEFAULTS.size);
    setHalftoneSoftness(p.softness ?? HALFTONE_DEFAULTS.softness);
    setHalftoneGridNoise(p.gridNoise ?? HALFTONE_DEFAULTS.gridNoise);
    setHalftoneContrast(p.contrast ?? HALFTONE_DEFAULTS.contrast);
    setHalftoneType(p.type ?? HALFTONE_DEFAULTS.type);
    setHalftoneColorBack(p.colorBack ?? HALFTONE_DEFAULTS.colorBack);
    setHalftoneColorC(p.colorC ?? HALFTONE_DEFAULTS.colorC);
    setHalftoneColorM(p.colorM ?? HALFTONE_DEFAULTS.colorM);
    setHalftoneColorY(p.colorY ?? HALFTONE_DEFAULTS.colorY);
    setHalftoneColorK(p.colorK ?? HALFTONE_DEFAULTS.colorK);
    setHalftoneFloodC(p.floodC ?? HALFTONE_DEFAULTS.floodC);
    setHalftoneGainC(p.gainC ?? HALFTONE_DEFAULTS.gainC);
    setHalftoneGainY(p.gainY ?? HALFTONE_DEFAULTS.gainY);
    setHalftonePresetIndex(index);
  }, []);

  const handleHalftoneCustomImageFile = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setHalftoneCustomImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    e.target.value = '';
  }, []);

  useEffect(() => {
    return () => {
      if (halftoneCustomImageUrl) URL.revokeObjectURL(halftoneCustomImageUrl);
    };
  }, [halftoneCustomImageUrl]);

  const comboImageSourceRef = useRef(comboImageSource);
  comboImageSourceRef.current = comboImageSource;
  useEffect(() => {
    return () => {
      if (comboImageSourceRef.current?.startsWith('blob:')) URL.revokeObjectURL(comboImageSourceRef.current);
    };
  }, []);

  /** On load: parse URL and set state. If preset is set, apply preset then overlay other params. Grid snapped to GRID_SNAPS. */
  const appliedUrlRef = useRef(false);
  /** Stash keyframe URL fields until `useKeyframePlayback` mounts setters (kad/kfe/kfa/kfb). */
  const keyframeUrlHydrateRef = useRef(null);
  const weaveKeyframeSkipAfterSyncRef = useRef(false);
  useEffect(() => {
    if (appliedUrlRef.current) return;
    appliedUrlRef.current = true;
    const q = parseUrlState(window.location.search);
    keyframeUrlHydrateRef.current =
      q.keyframeAnimDurationSec != null ||
      typeof q.keyframeEditingAfter === 'boolean' ||
      q.keyframeSnapshotA != null ||
      q.keyframeSnapshotB != null
        ? {
            duration: q.keyframeAnimDurationSec,
            editingAfter: q.keyframeEditingAfter,
            before: q.keyframeSnapshotA,
            after: q.keyframeSnapshotB,
          }
        : null;
    if (Object.keys(q).length === 0) return;
    if (q.presetIndex != null && q.presetIndex >= 0 && q.presetIndex < PRESETS.length) {
      applyPreset(q.presetIndex);
    }
    if (q.pattern != null) setPattern(q.pattern);
    if (q.palette != null) setPalette(q.palette);
    if (q.bgShade != null) setBgShade(q.bgShade);
    if (q.warpShade != null) setWarpShade(q.warpShade);
    if (q.weftShade != null) setWeftShade(q.weftShade);
    if (q.gridSize != null) setGridSize(GRID_SNAPS.includes(q.gridSize) ? q.gridSize : GRID_SNAPS[getGridSizeIndex(q.gridSize)]);
    if (q.warpGradient) setWarpGradient(q.warpGradient);
    if (q.weftGradient) setWeftGradient(q.weftGradient);
    if (q.warpGradientEnabled != null) setWarpGradientEnabled(!!q.warpGradientEnabled);
    if (q.weftGradientEnabled != null) setWeftGradientEnabled(!!q.weftGradientEnabled);
    if (q.gradSteps != null) setGradSteps(q.gradSteps);
    if (q.rectAspect != null) setRectAspect(Math.min(1, Math.max(0.5, Number(q.rectAspect))));
    if (q.cornerRadius != null) setCornerRadius(q.cornerRadius);
    if (q.canvasAspect != null) setCanvasAspect(q.canvasAspect);
    if (q.patternFit != null) setPatternFit(q.patternFit);
    if (q.weaveEnsMarkVisible != null) setWeaveEnsMarkVisible(!!q.weaveEnsMarkVisible);
    if (q.copyFormat != null) setCopyFormat(q.copyFormat);
    if (q.copyScale != null) setCopyScale(q.copyScale);
    applyColorwayFromUrl(q);
    if (q.weaveStitchRevealMode != null) setWeaveStitchRevealMode(q.weaveStitchRevealMode);
    if (q.weaveStitchRevealDurationSec != null) setWeaveStitchRevealDurationSec(q.weaveStitchRevealDurationSec);
    if (q.weaveStitchRevealSeed != null) setWeaveStitchRevealSeed(q.weaveStitchRevealSeed);
    if (q.weaveStitchRevealScale != null) setWeaveStitchRevealScale(q.weaveStitchRevealScale);
    if (q.weaveStitchRevealNoiseScale != null) setWeaveStitchRevealNoiseScale(q.weaveStitchRevealNoiseScale);
    if (q.weaveStitchRevealSoftness != null) setWeaveStitchRevealSoftness(q.weaveStitchRevealSoftness);
    if (q.weaveStitchRevealBleedAnisotropy != null) setWeaveStitchRevealBleedAnisotropy(q.weaveStitchRevealBleedAnisotropy);
    if (q.weaveStitchRevealBleedRotation != null) setWeaveStitchRevealBleedRotation(q.weaveStitchRevealBleedRotation);
    if (q.weaveStitchRevealBleedCrossFiber != null) setWeaveStitchRevealBleedCrossFiber(q.weaveStitchRevealBleedCrossFiber);
    if (q.weaveStitchRevealBleedDraftCoupled != null) setWeaveStitchRevealBleedDraftCoupled(q.weaveStitchRevealBleedDraftCoupled);
    if (q.weaveStitchRevealKeyframeDrive != null) setWeaveStitchRevealKeyframeDrive(!!q.weaveStitchRevealKeyframeDrive);
    if (q.shimmer != null) setShimmer(!!q.shimmer);
    if (q.shimmerSpeed != null) setShimmerSpeed(Math.min(16, Math.max(1, Number(q.shimmerSpeed))));
    if (q.shimmerWidth != null) setShimmerWidth(q.shimmerWidth);
    if (q.shimmerIntensity != null) setShimmerIntensity(q.shimmerIntensity);
    if (q.shimmerPosition != null) setShimmerPosition(q.shimmerPosition);
    if (q.shimmerRotation != null) setShimmerRotation(Math.min(1, Math.max(0, Number(q.shimmerRotation))));
    if (q.shimmerNoise != null) setShimmerNoise(Math.min(1, Math.max(0, Number(q.shimmerNoise))));
    if (q.shimmerNoiseSeed != null) setShimmerNoiseSeed(Math.min(1, Math.max(0, Number(q.shimmerNoiseSeed))));
    if (q.shimmerNoiseMin != null) setShimmerNoiseMin(Math.min(2, Math.max(0, Number(q.shimmerNoiseMin))));
    if (q.shimmerNoiseMax != null) setShimmerNoiseMax(Math.min(2, Math.max(0, Number(q.shimmerNoiseMax))));
    if (q.shimmerBlendMode != null) setShimmerBlendMode(Math.min(10, Math.max(0, Math.floor(Number(q.shimmerBlendMode)))));
    if (typeof q.shimmerPlaying === 'boolean') setShimmerPlaying(q.shimmerPlaying);
    if (q.halftonePresetIndex != null) setHalftonePresetIndex(q.halftonePresetIndex);
    if (q.halftoneSize != null) setHalftoneSize(q.halftoneSize);
    if (q.halftoneSoftness != null) setHalftoneSoftness(q.halftoneSoftness);
    if (q.halftoneGridNoise != null) setHalftoneGridNoise(q.halftoneGridNoise);
    if (q.halftoneContrast != null) setHalftoneContrast(q.halftoneContrast);
    if (q.halftoneType != null) setHalftoneType(q.halftoneType);
    if (q.halftoneFloodC != null) setHalftoneFloodC(q.halftoneFloodC);
    if (q.halftoneGainC != null) setHalftoneGainC(q.halftoneGainC);
    if (q.halftoneGainY != null) setHalftoneGainY(q.halftoneGainY);
    if (q.halftoneColorBack != null) setHalftoneColorBack(q.halftoneColorBack);
    if (q.halftoneColorC != null) setHalftoneColorC(q.halftoneColorC);
    if (q.halftoneColorM != null) setHalftoneColorM(q.halftoneColorM);
    if (q.halftoneColorY != null) setHalftoneColorY(q.halftoneColorY);
    if (q.halftoneColorK != null) setHalftoneColorK(q.halftoneColorK);
    if (q.comboGridSize != null) setComboGridSize(GRID_SNAPS.includes(q.comboGridSize) ? q.comboGridSize : GRID_SNAPS[getGridSizeIndex(q.comboGridSize)]);
    if (q.comboPalette != null) setComboPalette(q.comboPalette);
    if (q.comboBgShade != null) setComboBgShade(q.comboBgShade);
    if (q.comboRectColorSource != null) setComboRectColorSource(q.comboRectColorSource);
    if (q.comboPatternWarpShade != null) setComboPatternWarpShade(q.comboPatternWarpShade);
    if (q.comboPatternWeftShade != null) setComboPatternWeftShade(q.comboPatternWeftShade);
    if (q.comboLumaSizeMix != null) setComboLumaSizeMix(q.comboLumaSizeMix);
    if (q.comboLumaSizeInvert != null) setComboLumaSizeInvert(q.comboLumaSizeInvert);
    if (q.comboLumaSizeFloor != null) setComboLumaSizeFloor(q.comboLumaSizeFloor);
    if (q.comboCellGeometryMode != null) setComboCellGeometryMode(q.comboCellGeometryMode);
    if (q.comboStitchLumaMax != null) setComboStitchLumaMax(q.comboStitchLumaMax);
    if (q.comboQuantizeSteps != null) setComboQuantizeSteps(q.comboQuantizeSteps);
    if (q.comboQuantizeMode != null) setComboQuantizeMode(q.comboQuantizeMode);
    if (q.comboQuantizeGamma != null) setComboQuantizeGamma(q.comboQuantizeGamma);
    if (q.comboQuantizeDither != null) setComboQuantizeDither(q.comboQuantizeDither);
    if (q.comboPatternIndex != null) setComboPatternIndex(q.comboPatternIndex);
    if (q.comboRectRadius != null) setComboRectRadius(q.comboRectRadius);
    if (q.comboRectAspect != null) setComboRectAspect(q.comboRectAspect);
    if (q.comboRectRatio != null) setComboRectRatio(q.comboRectRatio);
    if (q.view != null) setView(q.view);
    if (q.weaveHalftoneOn != null) setWeaveHalftoneOn(!!q.weaveHalftoneOn);
    if (q.menuHidden === false) setMenuHidden(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount; applyPreset is stable
  }, []);

  /** Shimmer phase 0–1 from time; matches shader period (gridSize * (aspect*|cos| + |sin|)). */
  const computeShimmerPhase = useCallback((time) => {
    const speed = Math.max(0.001, shimmerSpeed);
    const angle = shimmerRotation * Math.PI * 2;
    const period = Math.max(1, gridSize * (canvasAspect * Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle))));
    const timeStep = Math.floor(time * speed);
    return (timeStep % period) / period;
  }, [shimmerSpeed, shimmerRotation, gridSize, canvasAspect]);

  const onShimmerTime = useCallback((time) => {
    shimmerTimeRef.current = time;
    if (shimmer && shimmerPlaying && !weaveKeyframePlayingRef.current) setShimmerPhase(computeShimmerPhase(time));
  }, [shimmer, shimmerPlaying, computeShimmerPhase]);

  /** Capture canvas at scale× as PNG or WebP blob. Weaving flat: re-renders at target res; others: 2D upscale. */
  const captureImageBlob = useCallback(async (scale, format) => {
    await new Promise((r) => requestAnimationFrame(r));
    if (view === 'weaving' && !weaveHalftoneOn && weavingCaptureRef.current?.captureAtResolution) {
      const canvas = canvasRef.current;
      if (!canvas?.width || !canvas?.height) throw new Error('Canvas not ready');
      const displayW = canvas.width / WEAVING_DPR;
      const displayH = canvas.height / WEAVING_DPR;
      const [w, h] = capToMaxDimension(Math.round(displayW * scale), Math.round(displayH * scale));
      const pngBlob = await weavingCaptureRef.current.captureAtResolution(w, h);
      if (!pngBlob) throw new Error('Capture failed');
      const blob = await pngBlobToFormat(pngBlob, format);
      return { blob, w, h, prefix: 'weaving' };
    }
    const canvas = getCopyCanvas(copyExportView(view, weaveHalftoneOn), canvasRef, halftoneCanvasRef, halftoneContainerRef);
    if (!canvas?.width || !canvas?.height) throw new Error('Canvas not ready');
    const [w, h] = capToMaxDimension(Math.round(canvas.width * scale), Math.round(canvas.height * scale));
    const blob = await scaleCanvasToBlob(canvas, w, h, format);
    return { blob, w, h, prefix: 'weaving' };
  }, [view, weaveHalftoneOn]);

  const handleCopy = useCallback(async () => {
    if (copyFeedbackTimeoutRef.current) clearTimeout(copyFeedbackTimeoutRef.current);
    setCopyFeedback(null);
    try {
      const { blob } = await captureImageBlob(copyScale, copyFormat);
      const mime = copyFormat === 'webp' ? 'image/webp' : 'image/png';
      await navigator.clipboard.write([new ClipboardItem({ [mime]: blob })]);
      setCopyFeedback('Copied!');
      copyFeedbackTimeoutRef.current = setTimeout(() => setCopyFeedback(null), 2000);
    } catch (err) {
      setCopyFeedback(err?.message ?? 'Copy failed');
      copyFeedbackTimeoutRef.current = setTimeout(() => setCopyFeedback(null), 3000);
    }
  }, [copyFormat, copyScale, captureImageBlob]);

  const handleExport = useCallback(async () => {
    if (exportFeedbackTimeoutRef.current) clearTimeout(exportFeedbackTimeoutRef.current);
    setExportFeedback(null);
    try {
      const { blob, w, h, prefix } = await captureImageBlob(copyScale, copyFormat);
      downloadBlob(blob, imageExportFilename(prefix, w, h, copyFormat));
      setExportFeedback('Exported!');
      exportFeedbackTimeoutRef.current = setTimeout(() => setExportFeedback(null), 2000);
    } catch (err) {
      setExportFeedback(err?.message ?? 'Export failed');
      exportFeedbackTimeoutRef.current = setTimeout(() => setExportFeedback(null), 3000);
    }
  }, [copyFormat, copyScale, captureImageBlob]);

  useEffect(() => () => {
    if (copyFeedbackTimeoutRef.current) clearTimeout(copyFeedbackTimeoutRef.current);
    if (exportFeedbackTimeoutRef.current) clearTimeout(exportFeedbackTimeoutRef.current);
  }, []);

  /** Video recording (WebM or MP4). Canvas resolved per current view. */
  const {
    isRecording,
    isProcessing,
    recordFormat,
    setRecordFormat,
    startRecording: recStart,
    stopRecording,
    pendingDownload,
    clearPendingDownload,
    recordError,
    clearRecordError,
  } = useCanvasRecorder('shaderbox');

  const startRecording = useCallback(() => {
    const canvas = getCopyCanvas(copyExportView(view, weaveHalftoneOn), canvasRef, halftoneCanvasRef, halftoneContainerRef);
    recStart(canvas);
  }, [view, weaveHalftoneOn, recStart]);

  const weaveKeyframeState = useMemo(
    () => ({
      pattern,
      palette,
      bgShade,
      warpShade,
      weftShade,
      gridSize,
      warpGradient,
      weftGradient,
      warpGradientEnabled,
      weftGradientEnabled,
      gradSteps,
      rectAspect,
      cornerRadius,
      canvasAspect,
      patternFit,
      shimmer,
      shimmerSpeed,
      shimmerWidth,
      shimmerIntensity,
      shimmerPosition,
      shimmerPhase,
      shimmerRotation,
      shimmerNoise,
      shimmerNoiseSeed,
      shimmerNoiseMin,
      shimmerNoiseMax,
      shimmerBlendMode,
      useAllColorways,
      colorwaySeed,
      colorwayNoiseScale,
      colorwayNoiseMode,
      colorwayNoiseOctaves,
      colorwayNoisePersistence,
      colorwayNoiseLacunarity,
      colorwayNoiseBias,
      colorwayNoiseX,
      colorwayBleedAnisotropy,
      colorwayBleedRotation,
      colorwayBleedCrossFiber,
      colorwayBleedDraftCoupled,
      colorwayIncludeMask,
      weaveStitchRevealMode,
      weaveStitchRevealDurationSec,
      weaveStitchRevealProgress,
      weaveStitchRevealSeed,
      weaveStitchRevealScale,
      weaveStitchRevealNoiseScale,
      weaveStitchRevealSoftness,
      weaveStitchRevealBleedAnisotropy,
      weaveStitchRevealBleedRotation,
      weaveStitchRevealBleedCrossFiber,
      weaveStitchRevealBleedDraftCoupled,
      halftonePresetIndex,
      halftoneSize,
      halftoneSoftness,
      halftoneGridNoise,
      halftoneContrast,
      halftoneType,
      halftoneColorBack,
      halftoneColorC,
      halftoneColorM,
      halftoneColorY,
      halftoneColorK,
      halftoneFloodC,
      halftoneGainC,
      halftoneGainY,
      comboGridSize,
      comboPalette,
      comboBgShade,
      comboRectColorSource,
      comboPatternWarpShade,
      comboPatternWeftShade,
      comboLumaSizeMix,
      comboLumaSizeInvert,
      comboLumaSizeFloor,
      comboCellGeometryMode,
      comboStitchLumaMax,
      comboQuantizeSteps,
      comboQuantizeMode,
      comboQuantizeGamma,
      comboQuantizeDither,
      comboPatternIndex,
      comboRectRadius,
      comboRectAspect,
      comboRectRatio,
      weaveEnsMarkVisible,
    }),
    [
      pattern,
      palette,
      bgShade,
      warpShade,
      weftShade,
      gridSize,
      warpGradient,
      weftGradient,
      warpGradientEnabled,
      weftGradientEnabled,
      gradSteps,
      rectAspect,
      cornerRadius,
      canvasAspect,
      patternFit,
      shimmer,
      shimmerSpeed,
      shimmerWidth,
      shimmerIntensity,
      shimmerPosition,
      shimmerPhase,
      shimmerRotation,
      shimmerNoise,
      shimmerNoiseSeed,
      shimmerNoiseMin,
      shimmerNoiseMax,
      shimmerBlendMode,
      useAllColorways,
      colorwaySeed,
      colorwayNoiseScale,
      colorwayNoiseMode,
      colorwayNoiseOctaves,
      colorwayNoisePersistence,
      colorwayNoiseLacunarity,
      colorwayNoiseBias,
      colorwayNoiseX,
      colorwayBleedAnisotropy,
      colorwayBleedRotation,
      colorwayBleedCrossFiber,
      colorwayBleedDraftCoupled,
      colorwayIncludeMask,
      weaveStitchRevealMode,
      weaveStitchRevealDurationSec,
      weaveStitchRevealProgress,
      weaveStitchRevealSeed,
      weaveStitchRevealScale,
      weaveStitchRevealNoiseScale,
      weaveStitchRevealSoftness,
      weaveStitchRevealBleedAnisotropy,
      weaveStitchRevealBleedRotation,
      weaveStitchRevealBleedCrossFiber,
      weaveStitchRevealBleedDraftCoupled,
      halftonePresetIndex,
      halftoneSize,
      halftoneSoftness,
      halftoneGridNoise,
      halftoneContrast,
      halftoneType,
      halftoneColorBack,
      halftoneColorC,
      halftoneColorM,
      halftoneColorY,
      halftoneColorK,
      halftoneFloodC,
      halftoneGainC,
      halftoneGainY,
      comboGridSize,
      comboPalette,
      comboBgShade,
      comboRectColorSource,
      comboPatternWarpShade,
      comboPatternWeftShade,
      comboLumaSizeMix,
      comboLumaSizeInvert,
      comboLumaSizeFloor,
      comboCellGeometryMode,
      comboStitchLumaMax,
      comboQuantizeSteps,
      comboQuantizeMode,
      comboQuantizeGamma,
      comboQuantizeDither,
      comboPatternIndex,
      comboRectRadius,
      comboRectAspect,
      comboRectRatio,
      weaveEnsMarkVisible,
    ],
  );

  const configHandoffState = useMemo(
    () => ({
      ...weaveKeyframeState,
      presetIndex,
      weaveHalftoneOn,
      copyFormat,
      copyScale,
      shimmerPlaying,
      colorwayAnimPlaying,
    }),
    [weaveKeyframeState, presetIndex, weaveHalftoneOn, copyFormat, copyScale, shimmerPlaying, colorwayAnimPlaying],
  );

  const weaveKeyframeSettersRef = useRef({});
  weaveKeyframeSettersRef.current = {
    setPattern,
    setPalette,
    setBgShade,
    setWarpShade,
    setWeftShade,
    setGridSize,
    setWarpGradient,
    setWeftGradient,
    setWarpGradientEnabled,
    setWeftGradientEnabled,
    setGradSteps,
    setRectAspect,
    setCornerRadius,
    setCanvasAspect,
    setPatternFit,
    setWeaveEnsMarkVisible,
    setShimmer,
    setShimmerSpeed,
    setShimmerWidth,
    setShimmerIntensity,
    setShimmerPosition,
    setShimmerPhase,
    setShimmerRotation,
    setShimmerNoise,
    setShimmerNoiseSeed,
    setShimmerNoiseMin,
    setShimmerNoiseMax,
    setShimmerBlendMode,
    setUseAllColorways,
    setColorwaySeed,
    setColorwayNoiseScale,
    setColorwayNoiseMode,
    setColorwayNoiseOctaves,
    setColorwayNoisePersistence,
    setColorwayNoiseLacunarity,
    setColorwayNoiseBias,
    setColorwayNoiseX,
    setColorwayBleedAnisotropy,
    setColorwayBleedRotation,
    setColorwayBleedCrossFiber,
    setColorwayBleedDraftCoupled,
    setColorwayIncludeMask,
    setWeaveStitchRevealMode,
    setWeaveStitchRevealDurationSec,
    setWeaveStitchRevealProgress,
    setWeaveStitchRevealSeed,
    setWeaveStitchRevealScale,
    setWeaveStitchRevealNoiseScale,
    setWeaveStitchRevealSoftness,
    setWeaveStitchRevealBleedAnisotropy,
    setWeaveStitchRevealBleedRotation,
    setWeaveStitchRevealBleedCrossFiber,
    setWeaveStitchRevealBleedDraftCoupled,
    setHalftonePresetIndex,
    setHalftoneSize,
    setHalftoneSoftness,
    setHalftoneGridNoise,
    setHalftoneContrast,
    setHalftoneType,
    setHalftoneColorBack,
    setHalftoneColorC,
    setHalftoneColorM,
    setHalftoneColorY,
    setHalftoneColorK,
    setHalftoneFloodC,
    setHalftoneGainC,
    setHalftoneGainY,
    setComboGridSize,
    setComboPalette,
    setComboBgShade,
    setComboRectColorSource,
    setComboPatternWarpShade,
    setComboPatternWeftShade,
    setComboLumaSizeMix,
    setComboLumaSizeInvert,
    setComboLumaSizeFloor,
    setComboCellGeometryMode,
    setComboStitchLumaMax,
    setComboQuantizeSteps,
    setComboQuantizeMode,
    setComboQuantizeGamma,
    setComboQuantizeDither,
    setComboPatternIndex,
    setComboRectRadius,
    setComboRectAspect,
    setComboRectRatio,
  };

  const applyWeaveKeyframeSnapshot = useCallback(
    (snap) => {
      applyWeaveAppKeyframe(view, weaveHalftoneOn, weaveKeyframeSettersRef.current, snap);
    },
    [view, weaveHalftoneOn],
  );

  const {
    editingAfter: weaveEditingAfter,
    setEditingAfter: setWeaveEditingAfter,
    before: weaveBefore,
    after: weaveAfter,
    setBefore: setWeaveBefore,
    setAfter: setWeaveAfter,
    durationSec: weaveKeyframeDurationSec,
    setDurationSec: setWeaveKeyframeDurationSec,
    isPlaying: weaveKeyframePlaying,
    syncBeforeFromLive: syncWeaveBeforeFromLive,
    syncAfterFromLive: syncWeaveAfterFromLive,
    play: playWeaveKeyframe,
    playAndRecord: playAndRecordWeaveKeyframe,
    stop: stopWeaveKeyframe,
  } = useKeyframePlayback({
    getBefore: () => getWeaveAppKeyframeSnapshot(view, weaveHalftoneOn, weaveKeyframeState),
    getAfter: () => getWeaveAppKeyframeSnapshot(view, weaveHalftoneOn, weaveKeyframeState),
    applySnapshot: applyWeaveKeyframeSnapshot,
    defaultDurationSec: KEYFRAME_ANIM_DEFAULT_SEC,
  });
  weaveKeyframePlayingRef.current = weaveKeyframePlaying;

  const configHandoffAnimation = useMemo(
    () => ({
      keyframeTransportPlaying: weaveKeyframePlaying,
      shimmerEnabled: shimmer,
      shimmerPlaying,
      useAllColorways,
      colorwayAnimPlaying,
      stitchRevealMode: weaveStitchRevealMode,
      stitchRevealKeyframeDrive: weaveStitchRevealKeyframeDrive,
      stitchRevealProgress: weaveStitchRevealProgress,
      inferState: weaveKeyframeState,
    }),
    [
      weaveKeyframePlaying, shimmer, shimmerPlaying, useAllColorways, colorwayAnimPlaying,
      weaveStitchRevealMode, weaveStitchRevealKeyframeDrive,
      weaveStitchRevealProgress, weaveKeyframeState,
    ],
  );

  /** One-shot: apply `kad` / `kfe` / `kfa` / `kfb` after keyframe hook exists. */
  useEffect(() => {
    const h = keyframeUrlHydrateRef.current;
    if (!h) return;
    keyframeUrlHydrateRef.current = null;
    if (h.duration != null && Number.isFinite(h.duration)) setWeaveKeyframeDurationSec(h.duration);
    if (typeof h.editingAfter === 'boolean') setWeaveEditingAfter(h.editingAfter);
    if (h.before != null) setWeaveBefore(h.before);
    if (h.after != null) {
      setWeaveAfter(h.after);
      weaveKeyframeSkipAfterSyncRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount hydration only
  }, []);

  useEffect(() => {
    if (!weaveEditingAfter) return;
    if (weaveKeyframeSkipAfterSyncRef.current) {
      weaveKeyframeSkipAfterSyncRef.current = false;
      return;
    }
    setWeaveAfter(getWeaveAppKeyframeSnapshot(view, weaveHalftoneOn, weaveKeyframeState));
  }, [weaveEditingAfter, view, weaveHalftoneOn, weaveKeyframeState, setWeaveAfter]);

  /** Sync state to URL (debounced). Only writes params that differ from defaults; keeps URL under ~2k chars. */
  const urlSyncTimeoutRef = useRef(null);
  useEffect(() => {
    if (view === 'imageRects') return undefined;
    urlSyncTimeoutRef.current = setTimeout(() => {
      const search = buildUrlState({
        view, weaveHalftoneOn, menuHidden, presetIndex, pattern, palette, bgShade, warpShade, weftShade, gridSize,
        weaveEnsMarkVisible,
        weaveKeyframePlaying,
        warpGradient, weftGradient, warpGradientEnabled, weftGradientEnabled, gradSteps, rectAspect, cornerRadius, canvasAspect, patternFit, copyFormat, copyScale,
        useAllColorways, colorwaySeed, colorwayNoiseScale, colorwayNoiseMode, colorwayNoiseOctaves, colorwayNoisePersistence, colorwayNoiseLacunarity, colorwayNoiseBias, colorwayNoiseX, colorwayBleedAnisotropy, colorwayBleedRotation, colorwayBleedCrossFiber, colorwayBleedDraftCoupled, colorwayIncludeMask,
        weaveStitchRevealMode, weaveStitchRevealDurationSec, weaveStitchRevealKeyframeDrive, weaveStitchRevealSeed, weaveStitchRevealScale, weaveStitchRevealNoiseScale, weaveStitchRevealSoftness, weaveStitchRevealBleedAnisotropy, weaveStitchRevealBleedRotation, weaveStitchRevealBleedCrossFiber, weaveStitchRevealBleedDraftCoupled,
        colorwayAnimPlaying,
        shimmer, shimmerPlaying, shimmerSpeed, shimmerWidth, shimmerIntensity, shimmerPosition, shimmerRotation, shimmerNoise, shimmerNoiseSeed, shimmerNoiseMin, shimmerNoiseMax, shimmerBlendMode,
        halftonePresetIndex, halftoneSize, halftoneSoftness, halftoneGridNoise, halftoneContrast, halftoneType,
        halftoneColorBack, halftoneColorC, halftoneColorM, halftoneColorY, halftoneColorK, halftoneFloodC, halftoneGainC, halftoneGainY,
        comboGridSize, comboPalette, comboBgShade, comboRectColorSource, comboQuantizeSteps, comboQuantizeMode, comboQuantizeGamma, comboQuantizeDither, comboPatternIndex, comboPatternWarpShade, comboPatternWeftShade, comboLumaSizeMix, comboLumaSizeInvert, comboLumaSizeFloor, comboCellGeometryMode, comboStitchLumaMax, comboRectRadius, comboRectAspect, comboRectRatio,
        keyframeAnimDurationSec: weaveKeyframeDurationSec,
        keyframeEditingAfter: weaveEditingAfter,
        keyframeSnapshotA: weaveBefore,
        keyframeSnapshotB: weaveAfter,
      });
      const url = search ? `${window.location.pathname}?${search}` : window.location.pathname;
      if (window.location.pathname + (window.location.search || '') !== url) {
        window.history.replaceState(null, '', url);
      }
    }, 400);
    return () => { clearTimeout(urlSyncTimeoutRef.current); };
  }, [view, weaveHalftoneOn, menuHidden, presetIndex, pattern, palette, bgShade, warpShade, weftShade, gridSize, weaveEnsMarkVisible, weaveKeyframePlaying, warpGradient, weftGradient, warpGradientEnabled, weftGradientEnabled, gradSteps, rectAspect, cornerRadius, canvasAspect, patternFit, copyFormat, copyScale, useAllColorways, colorwaySeed, colorwayNoiseScale, colorwayNoiseMode, colorwayNoiseOctaves, colorwayNoisePersistence, colorwayNoiseLacunarity, colorwayNoiseBias, colorwayNoiseX, colorwayBleedAnisotropy, colorwayBleedRotation, colorwayBleedCrossFiber, colorwayBleedDraftCoupled, colorwayIncludeMask, colorwayAnimPlaying, weaveStitchRevealMode, weaveStitchRevealDurationSec, weaveStitchRevealKeyframeDrive, weaveStitchRevealSeed, weaveStitchRevealScale, weaveStitchRevealNoiseScale, weaveStitchRevealSoftness, weaveStitchRevealBleedAnisotropy, weaveStitchRevealBleedRotation, weaveStitchRevealBleedCrossFiber, weaveStitchRevealBleedDraftCoupled, shimmer, shimmerPlaying, shimmerSpeed, shimmerWidth, shimmerIntensity, shimmerPosition, shimmerRotation, shimmerNoise, shimmerNoiseSeed, shimmerNoiseMin, shimmerNoiseMax, shimmerBlendMode, halftonePresetIndex, halftoneSize, halftoneSoftness, halftoneGridNoise, halftoneContrast, halftoneType, halftoneColorBack, halftoneColorC, halftoneColorM, halftoneColorY, halftoneColorK, halftoneFloodC, halftoneGainC, halftoneGainY, comboGridSize, comboPalette, comboBgShade, comboRectColorSource, comboQuantizeSteps, comboQuantizeMode, comboQuantizeGamma, comboQuantizeDither, comboPatternIndex, comboPatternWarpShade, comboPatternWeftShade, comboLumaSizeMix, comboLumaSizeInvert, comboLumaSizeFloor, comboCellGeometryMode, comboStitchLumaMax, comboRectRadius, comboRectAspect, comboRectRatio, weaveKeyframeDurationSec, weaveEditingAfter, weaveBefore, weaveAfter]);

  /** Ramp weave stitch-in 0→1 when Noise/Bleed is on; skipped while keyframe playback drives progress. */
  useEffect(() => {
    if (weaveKeyframeStitchOverrideRef.current) return undefined;
    if (weaveStitchRevealMode === 0) {
      setWeaveStitchRevealProgress(1);
      return undefined;
    }
    if (weaveStitchRevealKeyframeDrive) return undefined;
    setWeaveStitchRevealProgress(0);
    const durationMs = Math.max(0.05, weaveStitchRevealDurationSec) * 1000;
    const start = performance.now();
    let rafId = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      setWeaveStitchRevealProgress(t);
      if (t < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [weaveStitchRevealMode, weaveStitchRevealPlayToken, pattern, weaveStitchRevealDurationSec, weaveStitchRevealKeyframeDrive]);

  /** Diagonal weave load-in: same timing as before, now scrubbable via sidebar slider. */
  useEffect(() => {
    if (view !== 'weaving') return undefined;
    if (diagonalRevealAnimRafRef.current) {
      cancelAnimationFrame(diagonalRevealAnimRafRef.current);
      diagonalRevealAnimRafRef.current = 0;
    }
    setDiagonalRevealProgress(0);
    const durationMs = diagonalRevealDurationSec(gridSize, canvasAspect) * 1000;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      setDiagonalRevealProgress(t);
      if (t < 1) {
        diagonalRevealAnimRafRef.current = requestAnimationFrame(tick);
      } else {
        diagonalRevealAnimRafRef.current = 0;
      }
    };
    diagonalRevealAnimRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (diagonalRevealAnimRafRef.current) {
        cancelAnimationFrame(diagonalRevealAnimRafRef.current);
        diagonalRevealAnimRafRef.current = 0;
      }
    };
  }, [view, pattern, gridSize, canvasAspect]);

  const handleDiagonalRevealChange = useCallback((v) => {
    if (diagonalRevealAnimRafRef.current) {
      cancelAnimationFrame(diagonalRevealAnimRafRef.current);
      diagonalRevealAnimRafRef.current = 0;
    }
    setDiagonalRevealProgress(v);
  }, []);

  useEffect(() => {
    if (!weaveKeyframePlaying) weaveKeyframeStitchOverrideRef.current = false;
  }, [weaveKeyframePlaying]);

  useEffect(() => {
    if (isRecording) return;
    if (weaveStitchPlayRecordTimeoutRef.current != null) {
      clearTimeout(weaveStitchPlayRecordTimeoutRef.current);
      weaveStitchPlayRecordTimeoutRef.current = null;
    }
  }, [isRecording]);

  const replayWeaveStitchReveal = useCallback(() => {
    if (weaveStitchRevealKeyframeDrive) {
      setWeaveStitchRevealProgress(0);
      return;
    }
    setWeaveStitchRevealPlayToken((t) => t + 1);
  }, [weaveStitchRevealKeyframeDrive]);

  const startWeaveKeyframePlay = useCallback(() => {
    weaveKeyframeStitchOverrideRef.current = true;
    applyWeaveKeyframeSnapshot(weaveBefore);
    playWeaveKeyframe();
  }, [applyWeaveKeyframeSnapshot, weaveBefore, playWeaveKeyframe]);

  const startWeavePlayAndRecord = useCallback(() => {
    if (view === 'weaving' && weaveStitchRevealMode > 0 && !weaveStitchRevealKeyframeDrive) {
      const canvas = getCopyCanvas(copyExportView(view, weaveHalftoneOn), canvasRef, halftoneCanvasRef, halftoneContainerRef);
      if (!canvas) return;
      if (weaveStitchPlayRecordTimeoutRef.current != null) {
        clearTimeout(weaveStitchPlayRecordTimeoutRef.current);
        weaveStitchPlayRecordTimeoutRef.current = null;
      }
      weaveKeyframeStitchOverrideRef.current = false;
      setWeaveStitchRevealProgress(0);
      recStart(canvas, { reason: 'manual' });
      requestAnimationFrame(() => {
        setWeaveStitchRevealPlayToken((t) => t + 1);
      });
      const durationMs = Math.max(0.25, weaveStitchRevealDurationSec) * 1000;
      weaveStitchPlayRecordTimeoutRef.current = setTimeout(() => {
        weaveStitchPlayRecordTimeoutRef.current = null;
        void stopRecording();
      }, durationMs + 250);
      return;
    }
    weaveKeyframeStitchOverrideRef.current = true;
    applyWeaveKeyframeSnapshot(weaveBefore);
    playAndRecordWeaveKeyframe(recStart, stopRecording, () =>
      getCopyCanvas(copyExportView(view, weaveHalftoneOn), canvasRef, halftoneCanvasRef, halftoneContainerRef),
    );
  }, [applyWeaveKeyframeSnapshot, weaveBefore, playAndRecordWeaveKeyframe, recStart, stopRecording, view, weaveHalftoneOn, weaveStitchRevealMode, weaveStitchRevealDurationSec, weaveStitchRevealKeyframeDrive]);

  const applyPreset = useCallback((index) => {
    if (index == null || index < 0 || index >= PRESETS.length) return;
    const p = PRESETS[index];
    setPresetIndex(index);
    setPattern(p.pattern);
    setPalette(p.palette);
    setBgShade(p.bgShade);
    setWarpShade(p.warpShade);
    setWeftShade(p.weftShade);
    setWarpGradient(p.warpGradient);
    setWeftGradient(p.weftGradient);
    setWarpGradientEnabled(p.warpGradient.startShade !== p.warpGradient.endShade);
    setWeftGradientEnabled(p.weftGradient.startShade !== p.weftGradient.endShade);
    if (p.gridSize != null) setGridSize(GRID_SNAPS.includes(p.gridSize) ? p.gridSize : GRID_SNAPS[getGridSizeIndex(p.gridSize)]);
    if (p.gradSteps != null) setGradSteps(p.gradSteps);
    if (p.rectAspect != null) setRectAspect(Math.min(1, Math.max(0.5, p.rectAspect)));
    if (p.cornerRadius != null) setCornerRadius(p.cornerRadius);
    if (p.canvasAspect != null) setCanvasAspect(p.canvasAspect);
    if (p.useAllColorways != null) setUseAllColorways(!!p.useAllColorways);
    if (p.colorwaySeed != null) setColorwaySeed(p.colorwaySeed);
    if (p.shimmer != null) setShimmer(!!p.shimmer);
    if (p.shimmerSpeed != null) setShimmerSpeed(Math.min(16, Math.max(1, p.shimmerSpeed)));
    if (p.shimmerWidth != null) setShimmerWidth(p.shimmerWidth);
    if (p.shimmerIntensity != null) setShimmerIntensity(p.shimmerIntensity);
    if (p.shimmerPosition != null) setShimmerPosition(p.shimmerPosition);
    if (p.shimmerRotation != null) setShimmerRotation(Math.min(1, Math.max(0, p.shimmerRotation)));
    if (p.shimmerNoise != null) setShimmerNoise(Math.min(1, Math.max(0, p.shimmerNoise)));
    if (p.shimmerNoiseSeed != null) setShimmerNoiseSeed(Math.min(1, Math.max(0, p.shimmerNoiseSeed)));
    if (p.shimmerNoiseMin != null) setShimmerNoiseMin(Math.min(2, Math.max(0, p.shimmerNoiseMin)));
    if (p.shimmerNoiseMax != null) setShimmerNoiseMax(Math.min(2, Math.max(0, p.shimmerNoiseMax)));
    if (p.shimmerBlendMode != null) setShimmerBlendMode(Math.min(10, Math.max(0, Math.floor(p.shimmerBlendMode))));
  }, [setColorwaySeed, setUseAllColorways]);

  const handleReload = useCallback(() => {
    window.location.reload();
  }, []);

  /** Reset all params to defaults (same as URL defaults). Keeps current view; F5 / Mod+Shift+R still reloads page. */
  const handleReset = useCallback(() => {
    setPresetIndex(null);
    setPattern(WEAVING_URL_DEFAULTS.pattern);
    setPalette(WEAVING_URL_DEFAULTS.palette);
    setShadesLocked(false);
    setBgShade(WEAVING_URL_DEFAULTS.bgShade);
    setWarpShade(WEAVING_URL_DEFAULTS.warpShade);
    setWeftShade(WEAVING_URL_DEFAULTS.weftShade);
    setGridSize(WEAVING_URL_DEFAULTS.gridSize);
    setWarpGradient(WEAVING_URL_DEFAULTS.warpGradient);
    setWeftGradient(WEAVING_URL_DEFAULTS.weftGradient);
    setWarpGradientEnabled(WEAVING_URL_DEFAULTS.warpGradientEnabled);
    setWeftGradientEnabled(WEAVING_URL_DEFAULTS.weftGradientEnabled);
    setGradSteps(WEAVING_URL_DEFAULTS.gradSteps);
    setRectAspect(WEAVING_URL_DEFAULTS.rectAspect);
    setCornerRadius(WEAVING_URL_DEFAULTS.cornerRadius);
    setCanvasAspect(WEAVING_URL_DEFAULTS.canvasAspect);
    setPatternFit(WEAVING_URL_DEFAULTS.patternFit);
    setWeaveEnsMarkVisible(WEAVING_URL_DEFAULTS.weaveEnsMarkVisible);
    setWeaveHalftoneOn(false);
    setShimmer(WEAVING_URL_DEFAULTS.shimmer);
    setShimmerPlaying(true);
    setShimmerPausedAtTime(0);
    setShimmerSpeed(WEAVING_URL_DEFAULTS.shimmerSpeed);
    setShimmerWidth(WEAVING_URL_DEFAULTS.shimmerWidth);
    setShimmerIntensity(WEAVING_URL_DEFAULTS.shimmerIntensity);
    setShimmerPosition(WEAVING_URL_DEFAULTS.shimmerPosition);
    setShimmerPhase(0);
    setShimmerRotation(WEAVING_URL_DEFAULTS.shimmerRotation);
    setShimmerNoise(WEAVING_URL_DEFAULTS.shimmerNoise);
    setShimmerNoiseSeed(WEAVING_URL_DEFAULTS.shimmerNoiseSeed);
    setShimmerNoiseMin(WEAVING_URL_DEFAULTS.shimmerNoiseMin);
    setShimmerNoiseMax(WEAVING_URL_DEFAULTS.shimmerNoiseMax);
    setShimmerBlendMode(WEAVING_URL_DEFAULTS.shimmerBlendMode);
    resetColorwayToDefaults();
    setWeaveStitchRevealMode(WEAVING_URL_DEFAULTS.weaveStitchRevealMode);
    setWeaveStitchRevealDurationSec(WEAVING_URL_DEFAULTS.weaveStitchRevealDurationSec);
    setWeaveStitchRevealProgress(WEAVING_URL_DEFAULTS.weaveStitchRevealProgress);
    setWeaveStitchRevealSeed(WEAVING_URL_DEFAULTS.weaveStitchRevealSeed);
    setWeaveStitchRevealScale(WEAVING_URL_DEFAULTS.weaveStitchRevealScale);
    setWeaveStitchRevealNoiseScale(WEAVING_URL_DEFAULTS.weaveStitchRevealNoiseScale);
    setWeaveStitchRevealSoftness(WEAVING_URL_DEFAULTS.weaveStitchRevealSoftness);
    setWeaveStitchRevealBleedAnisotropy(WEAVING_URL_DEFAULTS.weaveStitchRevealBleedAnisotropy);
    setWeaveStitchRevealBleedRotation(WEAVING_URL_DEFAULTS.weaveStitchRevealBleedRotation);
    setWeaveStitchRevealBleedCrossFiber(WEAVING_URL_DEFAULTS.weaveStitchRevealBleedCrossFiber);
    setWeaveStitchRevealBleedDraftCoupled(WEAVING_URL_DEFAULTS.weaveStitchRevealBleedDraftCoupled);
    setWeaveStitchRevealKeyframeDrive(WEAVING_URL_DEFAULTS.weaveStitchRevealKeyframeDrive);
    setCopyFormat(WEAVING_URL_DEFAULTS.copyFormat);
    setCopyScale(WEAVING_URL_DEFAULTS.copyScale);
    setRandomizeRectAspect(true);
    setRandomizeCornerRadius(true);
    setHalftoneSize(HALFTONE_DEFAULTS.size);
    setHalftoneSoftness(HALFTONE_DEFAULTS.softness);
    setHalftoneGridNoise(HALFTONE_DEFAULTS.gridNoise);
    setHalftoneContrast(HALFTONE_DEFAULTS.contrast);
    setHalftoneType(HALFTONE_DEFAULTS.type);
    setHalftoneColorBack(HALFTONE_DEFAULTS.colorBack);
    setHalftoneColorC(HALFTONE_DEFAULTS.colorC);
    setHalftoneColorM(HALFTONE_DEFAULTS.colorM);
    setHalftoneColorY(HALFTONE_DEFAULTS.colorY);
    setHalftoneColorK(HALFTONE_DEFAULTS.colorK);
    setHalftoneFloodC(HALFTONE_DEFAULTS.floodC);
    setHalftoneGainC(HALFTONE_DEFAULTS.gainC);
    setHalftoneGainY(HALFTONE_DEFAULTS.gainY);
    setHalftonePresetIndex(HALFTONE_DEFAULTS.presetIndex);
    setHalftoneCustomImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
    setComboImageSource((prev) => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return '';
    });
    setComboGridSize(COMBO_DEFAULTS.gridSize);
    setComboPalette(COMBO_DEFAULTS.palette);
    setComboBgShade(COMBO_DEFAULTS.bgShade);
    setComboRectColorSource(COMBO_DEFAULTS.rectColorSource);
    setComboPatternWarpShade(COMBO_DEFAULTS.patternWarpShade);
    setComboPatternWeftShade(COMBO_DEFAULTS.patternWeftShade);
    setComboLumaSizeMix(COMBO_DEFAULTS.lumaSizeMix);
    setComboLumaSizeInvert(COMBO_DEFAULTS.lumaSizeInvert);
    setComboLumaSizeFloor(COMBO_DEFAULTS.lumaSizeFloor);
    setComboCellGeometryMode(COMBO_DEFAULTS.cellGeometryMode);
    setComboStitchLumaMax(COMBO_DEFAULTS.stitchLumaMax);
    setComboQuantizeSteps(COMBO_DEFAULTS.quantizeSteps);
    setComboQuantizeMode(COMBO_DEFAULTS.quantizeMode);
    setComboQuantizeGamma(COMBO_DEFAULTS.quantizeGamma);
    setComboQuantizeDither(COMBO_DEFAULTS.quantizeDither);
    setComboPatternIndex(COMBO_DEFAULTS.patternIndex);
    setComboRectRadius(COMBO_DEFAULTS.rectRadius);
    setComboRectAspect(COMBO_DEFAULTS.rectAspect);
    setComboRectRatio(COMBO_DEFAULTS.rectRatio);
  }, [resetColorwayToDefaults]);

  /** Randomize all generator params (pattern, palette, shades, grid, gradients, shimmer, etc.). */
  const handleRandomize = useCallback(() => {
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
    const rand = (lo, hi) => lo + Math.random() * (hi - lo);
    setPresetIndex(null);
    setPattern(randomEnabledPatternIndex());
    setPalette(randInt(0, 4));
    if (!shadesLocked) {
      setBgShade(randInt(0, 4));
      setWarpShade(randInt(0, 4));
      setWeftShade(randInt(0, 4));
    }
    setGridSize(pick(GRID_SNAPS));
    setWarpGradient({
      startShade: randInt(0, 3),
      endShade: randInt(0, 3),
      direction: randInt(0, 1),
      range: [randInt(0, 100), randInt(0, 100)],
    });
    setWeftGradient({
      startShade: randInt(0, 3),
      endShade: randInt(0, 3),
      direction: randInt(0, 1),
      range: [randInt(0, 100), randInt(0, 100)],
    });
    setWarpGradientEnabled(true);
    setWeftGradientEnabled(true);
    setGradSteps(Math.random() < 0.5 ? 0 : randInt(2, 16));
    if (randomizeRectAspect) setRectAspect(Number(rand(0.5, 1).toFixed(2)));
    if (randomizeCornerRadius) setCornerRadius(Number(rand(0.05, 0.4).toFixed(2)));
    setCanvasAspect(Number(rand(0.6, 1.5).toFixed(2)));
    setShimmer(Math.random() < 0.5);
    setShimmerSpeed(randInt(1, 16));
    setShimmerWidth(Number(rand(0.25, 24).toFixed(2)));
    setShimmerIntensity(Number(rand(0.1, 0.8).toFixed(2)));
    setShimmerPosition(Number(rand(0, 1).toFixed(2)));
    setShimmerRotation(Number(rand(0, 1).toFixed(3)));
    setShimmerNoise(Number(rand(0, 1).toFixed(2)));
    setShimmerNoiseSeed(Number(rand(0, 1).toFixed(3)));
    setShimmerNoiseMin(Number(rand(0.3, 1).toFixed(1)));
    setShimmerNoiseMax(Number(rand(1, 1.8).toFixed(1)));
    setUseAllColorways(Math.random() < 0.5);
    setColorwaySeed(randInt(0, 100));
    setColorwayNoiseScale(Number((0.025 + Math.random() * 0.225).toFixed(3)));
    setColorwayAnimPlaying({ ...COLORWAY_ANIM_INITIAL });
  }, [randomizeRectAspect, randomizeCornerRadius, shadesLocked, setColorwayAnimPlaying, setColorwayNoiseScale, setColorwaySeed, setUseAllColorways]);

  /** Keyboard shortcuts when focus is not in input/select/textarea. Mod+C = copy; Mod+1..9 = preset 0–(n−1); Mod+Shift+R or F5 = reload. */
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.target.closest('input, select, textarea')) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'c') {
        e.preventDefault();
        handleCopy();
        return;
      }
      if (mod && e.key >= '1' && e.key <= '9' && Number(e.key) <= PRESETS.length) {
        e.preventDefault();
        applyPreset(Number(e.key) - 1);
        return;
      }
      if ((mod && e.shiftKey && e.key === 'R') || e.key === 'F5') {
        e.preventDefault();
        handleReload();
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleCopy, applyPreset, handleReload]);

  const patternOptions = buildPatternSelectOptions(PATTERNS, pattern).map((o) => ({
    ...o,
    icon: WEAVE_ICONS[PATTERNS[o.value]?.id] ?? 'texture',
  }));
  const shadeOptions = (prefix) => SHADE_NAMES.map((name, i) => ({ value: i, label: prefix ? `${prefix}: ${name}` : name }));
  const presetOptions = [
    { value: 'custom', label: 'Preset…' },
    ...PRESETS.map((p, i) => ({ value: String(i), label: p.label })),
  ];

  const directionOptions = [
    { value: 0, label: 'Down', icon: 'arrow_downward' },
    { value: 1, label: 'Up', icon: 'arrow_upward' },
  ];
  const directionOptionsWeft = [
    { value: 0, label: 'Right', icon: 'arrow_forward' },
    { value: 1, label: 'Left', icon: 'arrow_back' },
  ];

  const canvasAspectSelectOptions = useMemo(() => {
    const key = canvasAspectKey(canvasAspect);
    const presetKeys = new Set(CANVAS_ASPECT_PRESETS.map((p) => canvasAspectKey(p.value)));
    const base = CANVAS_ASPECT_PRESETS.map((p) => ({
      value: canvasAspectKey(p.value),
      label: p.label,
    }));
    if (!presetKeys.has(key)) {
      return [{ value: key, label: `Other (${key})` }, ...base];
    }
    return base;
  }, [canvasAspect]);

  const applyCanvasAspectCustom = useCallback((r) => {
    setPresetIndex(null);
    setCanvasAspect(r);
  }, []);

  const canvasAspectSelectFooter = useMemo(
    () => <CanvasAspectCustomFooter canvasAspect={canvasAspect} onApply={applyCanvasAspectCustom} />,
    [canvasAspect, applyCanvasAspectCustom],
  );

  /** Main bar: Fit|Fill in one segment control, right-aligned (`flex-1` spacer before it; same `?display=` everywhere). */
  const navViewportFitFill = (
    <>
      <div className="min-w-0 flex-1 basis-0" aria-hidden />
      <ThemeToggle />
      <div className="flex shrink-0 items-center" title="Canvas in stage">
        <SegmentedControl>
          <div className="flex h-full">
            <SegmentedControlButton
              active={patternFit === 'fit'}
              aria-pressed={patternFit === 'fit'}
              aria-label="Fit canvas in view"
              onClick={() => setPatternFit('fit')}
            >
              Fit
            </SegmentedControlButton>
            <SegmentedControlButton
              active={patternFit === 'fill'}
              aria-pressed={patternFit === 'fill'}
              aria-label="Fill canvas to available space"
              onClick={() => setPatternFit('fill')}
            >
              Fill
            </SegmentedControlButton>
          </div>
        </SegmentedControl>
      </div>
    </>
  );

  if (view === 'imageRects') {
    return (
      <div className="flex min-h-0 flex-col bg-surface" style={{ height: '100dvh' }}>
        <nav className="relative z-20 flex w-full min-h-9 shrink-0 flex-nowrap items-center gap-3 overflow-x-auto border-b border-border-subtle bg-surface-elevated px-3 py-2" aria-label="App mode">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className={`shrink-0 text-left ${typeBase} font-semibold tracking-[-0.01em] text-text`}>ENS Warp&Weft</h1>
            <button
              type="button"
              className={`${menuToggle} ${menuHidden ? menuToggleInactive : menuToggleActive}`}
              onClick={() => setMenuHidden((h) => !h)}
              aria-pressed={!menuHidden}
              aria-label={menuHidden ? 'Show menu' : 'Hide menu'}
              title={menuHidden ? 'Show menu (always visible)' : 'Hide menu (show on hover)'}
            >
              <Icon name={menuHidden ? 'dock_to_right' : 'close'} className={iconMd} />
            </button>
            <button type="button" className={navBtnInactive} onClick={() => setView('weaving')} aria-pressed={false} aria-label="Weave draft — pattern and colors">Weave</button>
            <button type="button" className={navBtnActive} onClick={() => setView('imageRects')} aria-pressed aria-label="Mosaic — image or video to colored rects">Mosaic</button>
          </div>
          {navViewportFitFill}
        </nav>
        <div className="min-h-0 flex-1 overflow-hidden">
          <Suspense fallback={<div className="flex h-full items-center justify-center text-text-secondary">Loading…</div>}>
            <AppV2
              menuHidden={menuHidden}
              patternFit={patternFit}
              onPatternFitChange={setPatternFit}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col bg-surface" style={{ height: '100dvh' }}>
      <nav className="relative z-20 flex w-full min-h-9 shrink-0 flex-nowrap items-center gap-3 overflow-x-auto border-b border-border-subtle bg-surface-elevated px-3 py-2" aria-label="App mode">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className={`shrink-0 text-left ${typeBase} font-semibold tracking-[-0.01em] text-text`}>ENS Warp&Weft</h1>
          <button
            type="button"
            className={`${menuToggle} ${menuHidden ? menuToggleInactive : menuToggleActive}`}
            onClick={() => setMenuHidden((h) => !h)}
            aria-pressed={!menuHidden}
            aria-label={menuHidden ? 'Show menu' : 'Hide menu'}
            title={menuHidden ? 'Show menu (always visible)' : 'Hide menu (show on hover)'}
          >
            <Icon name={menuHidden ? 'dock_to_right' : 'close'} className={iconMd} />
          </button>
          <div className="flex flex-wrap items-center gap-1">
            <button type="button" className={view === 'weaving' ? navBtnActive : navBtnInactive} onClick={() => setView('weaving')} aria-pressed={view === 'weaving'} aria-label="Weave draft — pattern and colors">Weave</button>
            <button type="button" className={navBtnInactive} onClick={() => setView('imageRects')} aria-pressed={false} aria-label="Mosaic — image or video to colored rects">Mosaic</button>
          </div>
        </div>
        {navViewportFitFill}
      </nav>
      <div className="relative flex min-h-0 flex-1 flex-row overflow-hidden bg-surface">
        {/* In-flow sidebar: min-h-0 + h-full so flex items can shrink below content height; overflow-y-auto then scrolls extra controls instead of clipping. */}
        {/* When menuHidden: fixed overlay (show on hover). When menu open: in-flow, no absolute positioning. */}
        <motion.aside
          className={menuHidden
            ? 'fixed left-0 top-9 z-10 flex h-[calc(100dvh-2.25rem)] w-[288px] flex-col gap-1.5 overflow-y-auto overflow-x-auto border-r border-border-subtle bg-surface px-3 py-3'
            : 'flex h-full min-h-0 w-[288px] shrink-0 flex-col gap-1.5 overflow-y-auto overflow-x-auto overscroll-y-contain border-r border-border-subtle bg-surface px-3 py-3'}
          initial={false}
          animate={{ opacity: menuHidden ? 0 : 1 }}
          whileHover={menuHidden ? { opacity: 1 } : undefined}
          transition={{ duration: 0.2 }}
          aria-label="Weaving controls"
        >
          <div className="flex flex-col gap-1.5">
            <div className={`${sidebarGroup} ${sidebarGroupSticky}`}>
              <div className={sidebarGroupTitle}>Actions</div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" className={btnGhost} onClick={handleReset} aria-label="Reset to defaults" title="Reset all parameters to defaults">
                  <Icon name="refresh" className={iconMd} />
                  <span>Reset</span>
                </button>
                <button type="button" className={btnGhost} onClick={handleRandomize} aria-label="Randomize all parameters" title="Randomize pattern, palette, shades, grid, gradients, shimmer, and more">
                  <Icon name="shuffle" className={iconMd} />
                  <span>Randomize</span>
                </button>
              </div>
              {view === 'weaving' && weaveHalftoneOn ? (
                <div className="flex flex-col gap-1 border-t border-border-subtle pt-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {view === 'weaving' && weaveHalftoneOn && (
                      <>
                        <label className={`${btnGhost} cursor-pointer`}>
                          <Icon name="upload_file" className={iconMd} />
                          <span>Image from desktop</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={handleHalftoneCustomImageFile}
                            aria-label="Pick an image from your computer"
                          />
                        </label>
                        {halftoneCustomImageUrl && (
                          <button
                            type="button"
                            className={btnGhost}
                            onClick={() => {
                              if (halftoneCustomImageUrl) URL.revokeObjectURL(halftoneCustomImageUrl);
                              setHalftoneCustomImageUrl('');
                            }}
                            aria-label="Use weaving as source"
                          >
                            <Icon name="refresh" className={iconMd} />
                            <span>Use weaving</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
            <>
                <div className={sidebarGroup}>
                  <div className={sidebarGroupTitle}>Colorways</div>
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <GroupIcon name="tune" title="Preset" />
                      <Label.Root className="sr-only" htmlFor="preset-select">Preset (weave, colorway, shades, gradient)</Label.Root>
                      <Select.Root
                        value={presetIndex != null ? String(presetIndex) : 'custom'}
                        onValueChange={(v) => (v === 'custom' ? setPresetIndex(null) : applyPreset(Number(v)))}
                      >
                        <Select.Trigger id="preset-select" className={selectTrigger} title="Preset (weave + colorway + shades + grad)" aria-label="Preset (weave, colorway, shades, gradient)">
                          <Select.Value placeholder="Preset…" />
                          <Icon name="expand_more" className={`${iconLg} opacity-60`} />
                        </Select.Trigger>
                        <Select.Portal>
                          <Select.Content className={selectContent} position="popper" sideOffset={4}>
                            <Select.Viewport>
                              {presetOptions.map((opt) => (
                                <Select.Item key={opt.value} className={selectItem} value={opt.value}>
                                  <Select.ItemText>{opt.label}</Select.ItemText>
                                  <Select.ItemIndicator className="absolute right-2 inline-flex items-center" />
                                </Select.Item>
                              ))}
                            </Select.Viewport>
                          </Select.Content>
                        </Select.Portal>
                      </Select.Root>
                    </div>
                    <ColorwayPaletteSwatches
                      palette={palette}
                      setPalette={setPalette}
                      useAllColorways={useAllColorways}
                      colorwayIncludeMask={colorwayIncludeMask}
                      setColorwayIncludeMask={setColorwayIncludeMask}
                      onSingleSelect={() => setPresetIndex(null)}
                      includeMaskAnimPlaying={colorwayAnimPlaying.includeMask}
                      onIncludeMaskAnimToggle={() => setColorwayAnimPlaying((x) => ({ ...x, includeMask: !x.includeMask }))}
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ColorwaysControls
                        variant="weave"
                        palette={palette}
                        setPalette={setPalette}
                        useAllColorways={useAllColorways}
                        setUseAllColorways={setUseAllColorways}
                        colorwaySeed={colorwaySeed}
                        setColorwaySeed={setColorwaySeed}
                        colorwayNoiseScale={colorwayNoiseScale}
                        setColorwayNoiseScale={setColorwayNoiseScale}
                        colorwayNoiseMode={colorwayNoiseMode}
                        setColorwayNoiseMode={setColorwayNoiseMode}
                        colorwayNoiseOctaves={colorwayNoiseOctaves}
                        setColorwayNoiseOctaves={setColorwayNoiseOctaves}
                        colorwayNoisePersistence={colorwayNoisePersistence}
                        setColorwayNoisePersistence={setColorwayNoisePersistence}
                        colorwayNoiseLacunarity={colorwayNoiseLacunarity}
                        setColorwayNoiseLacunarity={setColorwayNoiseLacunarity}
                        colorwayNoiseBias={colorwayNoiseBias}
                        setColorwayNoiseBias={setColorwayNoiseBias}
                        colorwayNoiseX={colorwayNoiseX}
                        setColorwayNoiseX={setColorwayNoiseX}
                        colorwayBleedAnisotropy={colorwayBleedAnisotropy}
                        setColorwayBleedAnisotropy={setColorwayBleedAnisotropy}
                        colorwayBleedRotation={colorwayBleedRotation}
                        setColorwayBleedRotation={setColorwayBleedRotation}
                        colorwayBleedCrossFiber={colorwayBleedCrossFiber}
                        setColorwayBleedCrossFiber={setColorwayBleedCrossFiber}
                        colorwayBleedDraftCoupled={colorwayBleedDraftCoupled}
                        setColorwayBleedDraftCoupled={setColorwayBleedDraftCoupled}
                        colorwayIncludeMask={colorwayIncludeMask}
                        setColorwayIncludeMask={setColorwayIncludeMask}
                        colorwayAnimPlaying={colorwayAnimPlaying}
                        setColorwayAnimPlaying={setColorwayAnimPlaying}
                        bgShade={bgShade}
                        setBgShade={setBgShade}
                        warpShade={warpShade}
                        setWarpShade={setWarpShade}
                        weftShade={weftShade}
                        setWeftShade={setWeftShade}
                        shadesLocked={shadesLocked}
                        setShadesLocked={setShadesLocked}
                        onBgShadeChange={() => setPresetIndex(null)}
                        onWarpShadeChange={(shade) => {
                          setPresetIndex(null);
                          if (shade != null) setWarpGradient((g) => ({ ...g, startShade: shade, endShade: shade }));
                        }}
                        onWeftShadeChange={(shade) => {
                          setPresetIndex(null);
                          if (shade != null) setWeftGradient((g) => ({ ...g, startShade: shade, endShade: shade }));
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className={sidebarGroup}>
                  <div className={sidebarGroupTitle}>Weave</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`${controlLabel} ${typeLabel}`} title="Weave pattern">Weave</span>
                    <AppSelect id="weave-pattern" labelText="Weave pattern" value={pattern} onValueChange={(v) => { setPattern(Number(v)); setPresetIndex(null); }} defaultValue={WEAVING_URL_DEFAULTS.pattern} onReset={() => { setPattern(WEAVING_URL_DEFAULTS.pattern); setPresetIndex(null); }} options={patternOptions} title="Weave pattern" placeholder="Weave" />
                  </div>
                </div>
                {!useAllColorways && (
                <div className={sidebarGroup}>
                  <div className={sidebarGroupTitle}>Shades</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <GroupIcon name="palette" title="Shades" locked={shadesLocked} onLockChange={setShadesLocked} />
                    <AppSelect id="bg-shade" labelText="Background shade" value={bgShade} onValueChange={(v) => { setBgShade(Number(v)); setPresetIndex(null); }} defaultValue={WEAVING_URL_DEFAULTS.bgShade} onReset={() => { setBgShade(WEAVING_URL_DEFAULTS.bgShade); setPresetIndex(null); }} options={shadeOptions('BG')} title="Background shade" placeholder="BG" />
                    <AppSelect
                      id="warp-shade"
                      labelText="Warp shade"
                      value={warpShade}
                      onValueChange={(v) => {
                        const shade = Number(v);
                        setWarpShade(shade);
                        setPresetIndex(null);
                        setWarpGradient((g) => ({ ...g, startShade: shade, endShade: shade }));
                      }}
                      options={shadeOptions('Warp')}
                      title="Warp shade"
                      placeholder="Warp"
                      defaultValue={WEAVING_URL_DEFAULTS.warpShade}
                      onReset={() => {
                        setWarpShade(WEAVING_URL_DEFAULTS.warpShade);
                        setPresetIndex(null);
                      }}
                    />
                    <AppSelect
                      id="weft-shade"
                      labelText="Weft shade"
                      value={weftShade}
                      onValueChange={(v) => {
                        const shade = Number(v);
                        setWeftShade(shade);
                        setPresetIndex(null);
                        setWeftGradient((g) => ({ ...g, startShade: shade, endShade: shade }));
                      }}
                      options={shadeOptions('Weft')}
                      title="Weft shade"
                      placeholder="Weft"
                      defaultValue={WEAVING_URL_DEFAULTS.weftShade}
                      onReset={() => {
                        setWeftShade(WEAVING_URL_DEFAULTS.weftShade);
                        setPresetIndex(null);
                      }}
                    />
                  </div>
                </div>
                )}
                <div className={sidebarGroup}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className={sidebarGroupTitle}>Warp gradient</div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className={`${controlLabel} ${typeLabel}`}>Gradient</span>
                      <SegmentedControl>
                        <div className="flex h-full">
                          <SegmentedControlButton
                            active={!warpGradientEnabled}
                            aria-pressed={!warpGradientEnabled}
                            aria-label="Warp: flat shade only (no gradient)"
                            onClick={() => { setPresetIndex(null); setWarpGradientEnabled(false); }}
                          >
                            Off
                          </SegmentedControlButton>
                          <SegmentedControlButton
                            active={warpGradientEnabled}
                            aria-pressed={warpGradientEnabled}
                            aria-label="Warp: use gradient stops and range"
                            onClick={() => { setPresetIndex(null); setWarpGradientEnabled(true); }}
                          >
                            On
                          </SegmentedControlButton>
                        </div>
                      </SegmentedControl>
                    </div>
                  </div>
                  <div className={!warpGradientEnabled ? 'pointer-events-none opacity-45' : ''}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <GroupIcon name="gradient" title="Warp gradient range" />
                      <Label.Root className="sr-only" htmlFor="warp-range">Warp gradient range</Label.Root>
                      <SliderWithInput
                        id="warp-range"
                        value={warpGradient.range}
                        onValueChange={([a, b]) => {
                          setPresetIndex(null);
                          const snap = gradSteps >= 2;
                          setWarpGradient((g) => ({
                            ...g,
                            range: snap ? [snapGradRangeValue(a, gradSteps), snapGradRangeValue(b, gradSteps)] : [a, b],
                          }));
                        }}
                        min={0}
                        max={100}
                        step={gradSteps >= 2 ? 100 / gradSteps : 5}
                        snapPointCount={gradSteps >= 2 ? gradSteps + 1 : 5}
                        aria-label="Warp gradient range"
                        defaultValue={WEAVING_URL_DEFAULTS.warpGradient.range}
                        onReset={() => {
                          setPresetIndex(null);
                          setWarpGradient((g) => ({ ...g, range: [...WEAVING_URL_DEFAULTS.warpGradient.range] }));
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <GroupIcon name="gradient" title="Warp gradient" />
                      <AppSelect id="warp-start-shade" labelText="Warp gradient start shade" value={warpGradient.startShade} onValueChange={(s) => { setPresetIndex(null); setWarpGradient((g) => ({ ...g, startShade: Number(s) })); }} defaultValue={WEAVING_URL_DEFAULTS.warpGradient.startShade} onReset={() => { setPresetIndex(null); setWarpGradient((g) => ({ ...g, startShade: WEAVING_URL_DEFAULTS.warpGradient.startShade })); }} options={shadeOptions()} title="Warp start" placeholder="Start" />
                      <AppSelect id="warp-end-shade" labelText="Warp gradient end shade" value={warpGradient.endShade} onValueChange={(s) => { setPresetIndex(null); setWarpGradient((g) => ({ ...g, endShade: Number(s) })); }} defaultValue={WEAVING_URL_DEFAULTS.warpGradient.endShade} onReset={() => { setPresetIndex(null); setWarpGradient((g) => ({ ...g, endShade: WEAVING_URL_DEFAULTS.warpGradient.endShade })); }} options={shadeOptions()} title="Warp end" placeholder="End" />
                      <DirectionSwitch value={warpGradient.direction} onValueChange={(d) => { setPresetIndex(null); setWarpGradient((g) => ({ ...g, direction: d })); }} defaultValue={WEAVING_URL_DEFAULTS.warpGradient.direction} onReset={() => { setPresetIndex(null); setWarpGradient((g) => ({ ...g, direction: WEAVING_URL_DEFAULTS.warpGradient.direction })); }} options={directionOptions} title="Warp direction" ariaLabel="Warp gradient direction" />
                    </div>
                  </div>
                </div>
                <div className={sidebarGroup}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className={sidebarGroupTitle}>Weft gradient</div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className={`${controlLabel} ${typeLabel}`}>Gradient</span>
                      <SegmentedControl>
                        <div className="flex h-full">
                          <SegmentedControlButton
                            active={!weftGradientEnabled}
                            aria-pressed={!weftGradientEnabled}
                            aria-label="Weft: flat shade only (no gradient)"
                            onClick={() => { setPresetIndex(null); setWeftGradientEnabled(false); }}
                          >
                            Off
                          </SegmentedControlButton>
                          <SegmentedControlButton
                            active={weftGradientEnabled}
                            aria-pressed={weftGradientEnabled}
                            aria-label="Weft: use gradient stops and range"
                            onClick={() => { setPresetIndex(null); setWeftGradientEnabled(true); }}
                          >
                            On
                          </SegmentedControlButton>
                        </div>
                      </SegmentedControl>
                    </div>
                  </div>
                  <div className={!weftGradientEnabled ? 'pointer-events-none opacity-45' : ''}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <GroupIcon name="gradient" title="Weft gradient range" />
                      <Label.Root className="sr-only" htmlFor="weft-range">Weft gradient range</Label.Root>
                      <SliderWithInput
                        id="weft-range"
                        value={weftGradient.range}
                        onValueChange={([a, b]) => {
                          setPresetIndex(null);
                          const snap = gradSteps >= 2;
                          setWeftGradient((g) => ({
                            ...g,
                            range: snap ? [snapGradRangeValue(a, gradSteps), snapGradRangeValue(b, gradSteps)] : [a, b],
                          }));
                        }}
                        min={0}
                        max={100}
                        step={gradSteps >= 2 ? 100 / gradSteps : 5}
                        snapPointCount={gradSteps >= 2 ? gradSteps + 1 : 5}
                        aria-label="Weft gradient range"
                        defaultValue={WEAVING_URL_DEFAULTS.weftGradient.range}
                        onReset={() => {
                          setPresetIndex(null);
                          setWeftGradient((g) => ({ ...g, range: [...WEAVING_URL_DEFAULTS.weftGradient.range] }));
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <GroupIcon name="gradient" title="Weft gradient" />
                      <AppSelect id="weft-start-shade" labelText="Weft gradient start shade" value={weftGradient.startShade} onValueChange={(s) => { setPresetIndex(null); setWeftGradient((g) => ({ ...g, startShade: Number(s) })); }} defaultValue={WEAVING_URL_DEFAULTS.weftGradient.startShade} onReset={() => { setPresetIndex(null); setWeftGradient((g) => ({ ...g, startShade: WEAVING_URL_DEFAULTS.weftGradient.startShade })); }} options={shadeOptions()} title="Weft start" placeholder="Start" />
                      <AppSelect id="weft-end-shade" labelText="Weft gradient end shade" value={weftGradient.endShade} onValueChange={(s) => { setPresetIndex(null); setWeftGradient((g) => ({ ...g, endShade: Number(s) })); }} defaultValue={WEAVING_URL_DEFAULTS.weftGradient.endShade} onReset={() => { setPresetIndex(null); setWeftGradient((g) => ({ ...g, endShade: WEAVING_URL_DEFAULTS.weftGradient.endShade })); }} options={shadeOptions()} title="Weft end" placeholder="End" />
                      <DirectionSwitch value={weftGradient.direction} onValueChange={(d) => { setPresetIndex(null); setWeftGradient((g) => ({ ...g, direction: d })); }} defaultValue={WEAVING_URL_DEFAULTS.weftGradient.direction} onReset={() => { setPresetIndex(null); setWeftGradient((g) => ({ ...g, direction: WEAVING_URL_DEFAULTS.weftGradient.direction })); }} options={directionOptionsWeft} title="Weft direction" ariaLabel="Weft gradient direction" />
                    </div>
                  </div>
                </div>
                <div className={sidebarGroup}>
                  <div className={sidebarGroupTitle}>ENS mark</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <GroupIcon name="loyalty" title="ENS mark on weave canvas (fragment shader)" />
                    <button
                      type="button"
                      className={`${toggleBtn} ${weaveEnsMarkVisible ? toggleBtnActive : ''}`}
                      aria-pressed={weaveEnsMarkVisible}
                      aria-label="Toggle ENS mark on weave canvas"
                      onClick={() => { setPresetIndex(null); setWeaveEnsMarkVisible((v) => !v); }}
                    >
                      {weaveEnsMarkVisible ? 'On' : 'Off'}
                    </button>
                    {weaveEnsMarkVisible !== WEAVING_URL_DEFAULTS.weaveEnsMarkVisible && (
                      <IconButton
                        size="resetSm"
                        onClick={() => setWeaveEnsMarkVisible(WEAVING_URL_DEFAULTS.weaveEnsMarkVisible)}
                        title="Reset ENS mark visibility to default"
                        aria-label="Reset ENS mark visibility to default"
                      />
                    )}
                  </div>
                </div>
                <div className={sidebarGroup}>
                  <div className={sidebarGroupTitle}>Grid & layout</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <GroupIcon name="grid_on" title="Resolution" />
                    <Label.Root className="sr-only" htmlFor="grid-slider">Tile size</Label.Root>
                    <SliderWithInput
                      id="grid-slider"
                      value={gridSize}
                      onValueChange={setGridSize}
                      min={8}
                      max={256}
                      step={1}
                      snapValues={GRID_SNAPS}
                      snapPointCount={GRID_SNAPS.length}
                      aria-label="Tile size (grid cells)"
                      defaultValue={WEAVING_URL_DEFAULTS.gridSize}
                      onReset={() => setGridSize(WEAVING_URL_DEFAULTS.gridSize)}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <GroupIcon name="timeline" title="Quantization" />
                    <Label.Root className="sr-only" htmlFor="grad-steps-slider">Gradation steps</Label.Root>
                    <SliderWithInput
                      id="grad-steps-slider"
                      value={gradSteps}
                      onValueChange={setGradSteps}
                      min={0}
                      max={16}
                      step={1}
                      snapPointCount={17}
                      format={(n) => (n === 0 ? 'Smooth' : String(n))}
                      parse={(s) => { if (s === 'Smooth' || s === '') return 0; const n = Number(s); return Number.isFinite(n) ? n : null; }}
                      aria-label="Gradation steps (0 = smooth)"
                      defaultValue={WEAVING_URL_DEFAULTS.gradSteps}
                      onReset={() => setGradSteps(WEAVING_URL_DEFAULTS.gradSteps)}
                    />
                  </div>
                  {view === 'weaving' && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <GroupIcon name="aspect_ratio" title="Rect ratio (36×40 = 0.9)" locked={!randomizeRectAspect} onLockChange={() => setRandomizeRectAspect((v) => !v)} />
                    <Label.Root className="sr-only" htmlFor="rect-aspect-slider">Rect aspect ratio (36×40 spec = 0.9)</Label.Root>
                    <SliderWithInput
                      id="rect-aspect-slider"
                      value={rectAspect ?? RECT_ASPECT_DEFAULT}
                      onValueChange={setRectAspect}
                      min={0.5}
                      max={1}
                      step={0.05}
                      snapPointCount={11}
                      format={(n) => n.toFixed(2)}
                      aria-label="Rect aspect (36×40 = 0.9)"
                      defaultValue={WEAVING_URL_DEFAULTS.rectAspect}
                      onReset={() => setRectAspect(WEAVING_URL_DEFAULTS.rectAspect)}
                    />
                  </div>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <GroupIcon name="crop" title="Canvas aspect presets" />
                    <AppSelect
                      id="canvas-aspect-preset"
                      labelText="Canvas aspect ratio"
                      value={canvasAspectKey(canvasAspect)}
                      onValueChange={(v) => {
                        setPresetIndex(null);
                        setCanvasAspect(Number(v));
                      }}
                      options={canvasAspectSelectOptions}
                      contentFooter={canvasAspectSelectFooter}
                      title="Canvas aspect"
                      placeholder="Aspect"
                      defaultValue={canvasAspectKey(WEAVING_URL_DEFAULTS.canvasAspect)}
                      onReset={() => {
                        setPresetIndex(null);
                        setCanvasAspect(WEAVING_URL_DEFAULTS.canvasAspect);
                      }}
                    />
                  </div>
                  {view === 'weaving' && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <GroupIcon name="lens_blur" title="Halftone output" />
                    <span className={`${controlLabel} ${typeLabel}`}>Halftone</span>
                    <SegmentedControl>
                      <div className="flex h-full">
                        <SegmentedControlButton
                          active={!weaveHalftoneOn}
                          aria-pressed={!weaveHalftoneOn}
                          aria-label="Flat weave output"
                          onClick={() => setWeaveHalftoneOn(false)}
                        >
                          Off
                        </SegmentedControlButton>
                        <SegmentedControlButton
                          active={weaveHalftoneOn}
                          aria-pressed={weaveHalftoneOn}
                          aria-label="CMYK halftone over weave"
                          onClick={() => setWeaveHalftoneOn(true)}
                        >
                          On
                        </SegmentedControlButton>
                      </div>
                    </SegmentedControl>
                  </div>
                  )}
                  {view === 'weaving' && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <GroupIcon name="rounded_corner" title="Radius" locked={!randomizeCornerRadius} onLockChange={() => setRandomizeCornerRadius((v) => !v)} />
                    <Label.Root className="sr-only" htmlFor="radius-slider">Corner radius</Label.Root>
                    <SliderWithInput
                      id="radius-slider"
                      value={cornerRadius}
                      onValueChange={setCornerRadius}
                      min={0}
                      max={0.5}
                      step={0.01}
                      snapPointCount={11}
                      format={(n) => n.toFixed(2)}
                      aria-label="Corner radius"
                      defaultValue={WEAVING_URL_DEFAULTS.cornerRadius}
                      onReset={() => setCornerRadius(WEAVING_URL_DEFAULTS.cornerRadius)}
                    />
                  </div>
                  )}
                </div>
                {view === 'weaving' && (
                <div className={sidebarGroup}>
                  <div className={sidebarGroupTitle}>Load-in</div>
                  <div className="flex flex-col gap-1.5">
                    <span className={`${typeLabel} text-text-muted`}>Diagonal wave on load</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <GroupIcon name="linear_scale" title="Diagonal load-in progress (0 = blank, 1 = full weave)" />
                      <Label.Root className="sr-only" htmlFor="diagonal-reveal-progress">Diagonal load-in</Label.Root>
                      <SliderWithInput
                        id="diagonal-reveal-progress"
                        value={diagonalRevealProgress}
                        onValueChange={handleDiagonalRevealChange}
                        defaultValue={WEAVING_URL_DEFAULTS.diagonalRevealProgress}
                        onReset={() => handleDiagonalRevealChange(WEAVING_URL_DEFAULTS.diagonalRevealProgress)}
                        min={0}
                        max={1}
                        step={0.01}
                        snapPointCount={11}
                        format={(n) => n.toFixed(2)}
                        aria-label="Diagonal load-in progress"
                      />
                    </div>
                    <span className={`${typeCaption} text-text-muted`}>Auto-plays on load and pattern change. Drag to scrub back.</span>
                  </div>
                </div>
                )}
                {view === 'weaving' && (
                <div className={sidebarGroup}>
                  <div className={sidebarGroupTitle}>Stitch-in</div>
                  <div className="flex flex-col gap-1.5">
                    <span className={`${typeLabel} text-text-muted`}>From blank (Mosaic-parity)</span>
                    <AppSelect
                      id="weave-stitch-reveal-mode"
                      labelText="Reveal order"
                      value={weaveStitchRevealMode}
                      onValueChange={(v) => setWeaveStitchRevealMode(Number(v))}
                      defaultValue={WEAVING_URL_DEFAULTS.weaveStitchRevealMode}
                      onReset={() => setWeaveStitchRevealMode(WEAVING_URL_DEFAULTS.weaveStitchRevealMode)}
                      options={STITCH_REVEAL_MODE_OPTIONS}
                      title="Off: full weave immediately. Noise: FBM order. Bleed: streaks along fibers."
                      placeholder="Stitch-in"
                    />
                    {weaveStitchRevealMode > 0 && (
                      <>
                        {/**
                         * Drive: timed ramp vs manual 0–1 progress (stored in keyframe A/B). `srkm` when not default.
                         */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`${controlLabel} ${typeLabel}`}>Drive</span>
                          <SegmentedControl>
                            <div className="flex h-full">
                              <SegmentedControlButton
                                active={!weaveStitchRevealKeyframeDrive}
                                aria-pressed={!weaveStitchRevealKeyframeDrive}
                                aria-label="Stitch-in driven by duration"
                                title="Animate from blank over Reveal duration"
                                onClick={() => {
                                  setWeaveStitchRevealKeyframeDrive(false);
                                  setWeaveStitchRevealPlayToken((t) => t + 1);
                                }}
                              >
                                Duration
                              </SegmentedControlButton>
                              <SegmentedControlButton
                                active={weaveStitchRevealKeyframeDrive}
                                aria-pressed={weaveStitchRevealKeyframeDrive}
                                aria-label="Stitch-in progress from slider and keyframes A and B"
                                title="Scrub progress; use Set A / Set B in the capture bar, then Play"
                                onClick={() => setWeaveStitchRevealKeyframeDrive(true)}
                              >
                                A↔B
                              </SegmentedControlButton>
                            </div>
                          </SegmentedControl>
                        </div>
                        {weaveStitchRevealKeyframeDrive ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <GroupIcon name="linear_scale" title="How much of the weave is revealed (0 = blank, 1 = full)" />
                              <Label.Root className="sr-only" htmlFor="weave-stitch-reveal-progress">Reveal progress</Label.Root>
                              <SliderWithInput
                                id="weave-stitch-reveal-progress"
                                value={weaveStitchRevealProgress}
                                onValueChange={setWeaveStitchRevealProgress}
                                defaultValue={WEAVING_URL_DEFAULTS.weaveStitchRevealProgress}
                                onReset={() => setWeaveStitchRevealProgress(WEAVING_URL_DEFAULTS.weaveStitchRevealProgress)}
                                min={0}
                                max={1}
                                step={0.01}
                                snapPointCount={11}
                                format={(n) => n.toFixed(2)}
                                aria-label="Stitch-in reveal progress"
                              />
                            </div>
                            <span className={`${typeCaption} text-text-muted`}>Set A / Set B capture this value; Play blends like other params. Replay jumps to 0.</span>
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-wrap items-center gap-2">
                              <Label.Root className="sr-only" htmlFor="weave-stitch-reveal-dur">Reveal duration</Label.Root>
                              <SliderWithInput
                                id="weave-stitch-reveal-dur"
                                value={weaveStitchRevealDurationSec}
                                onValueChange={setWeaveStitchRevealDurationSec}
                                defaultValue={WEAVING_URL_DEFAULTS.weaveStitchRevealDurationSec}
                                onReset={() => setWeaveStitchRevealDurationSec(WEAVING_URL_DEFAULTS.weaveStitchRevealDurationSec)}
                                min={0.25}
                                max={12}
                                step={0.25}
                                format={(n) => `${n.toFixed(2)}s`}
                                aria-label="Stitch-in duration in seconds"
                              />
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <button type="button" className={btnGhost} onClick={replayWeaveStitchReveal} aria-label="Replay stitch-in animation" title="Replay from blank">
                                <Icon name="replay" className={iconMd} />
                                <span>Replay</span>
                              </button>
                              <button
                                type="button"
                                className={btnGhost}
                                onClick={() => {
                                  setWeaveStitchRevealSeed(Math.floor(Math.random() * 999999));
                                  replayWeaveStitchReveal();
                                }}
                                aria-label="New random seed and replay"
                                title="New seed"
                              >
                                <Icon name="shuffle" className={iconMd} />
                                <span>New seed</span>
                              </button>
                            </div>
                          </>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <GroupIcon name="blur_on" title="Spatial scale for reveal pattern" />
                          <Label.Root className="sr-only" htmlFor="weave-stitch-reveal-scale">Reveal pattern scale</Label.Root>
                          <SliderWithInput
                            id="weave-stitch-reveal-scale"
                            value={weaveStitchRevealScale}
                            onValueChange={setWeaveStitchRevealScale}
                            defaultValue={WEAVING_URL_DEFAULTS.weaveStitchRevealScale}
                            onReset={() => setWeaveStitchRevealScale(WEAVING_URL_DEFAULTS.weaveStitchRevealScale)}
                            min={0.02}
                            max={0.5}
                            step={0.01}
                            format={(n) => n.toFixed(2)}
                            aria-label="Noise / bleed pattern scale on the grid"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <GroupIcon name="tune" title="FBM detail / frequency for stitch-in noise and bleed" />
                          <Label.Root className="sr-only" htmlFor="weave-stitch-reveal-noise-scale">Reveal noise scale</Label.Root>
                          <SliderWithInput
                            id="weave-stitch-reveal-noise-scale"
                            value={weaveStitchRevealNoiseScale}
                            onValueChange={setWeaveStitchRevealNoiseScale}
                            defaultValue={WEAVING_URL_DEFAULTS.weaveStitchRevealNoiseScale}
                            onReset={() => setWeaveStitchRevealNoiseScale(WEAVING_URL_DEFAULTS.weaveStitchRevealNoiseScale)}
                            min={0.25}
                            max={4}
                            step={0.05}
                            format={(n) => n.toFixed(2)}
                            aria-label="Stitch-in FBM frequency multiplier"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <GroupIcon name="gradient" title="Edge softness between revealed and not yet" />
                          <Label.Root className="sr-only" htmlFor="weave-stitch-reveal-soft">Reveal softness</Label.Root>
                          <SliderWithInput
                            id="weave-stitch-reveal-soft"
                            value={weaveStitchRevealSoftness}
                            onValueChange={setWeaveStitchRevealSoftness}
                            defaultValue={WEAVING_URL_DEFAULTS.weaveStitchRevealSoftness}
                            onReset={() => setWeaveStitchRevealSoftness(WEAVING_URL_DEFAULTS.weaveStitchRevealSoftness)}
                            min={0.01}
                            max={0.25}
                            step={0.005}
                            format={(n) => n.toFixed(3)}
                            aria-label="Softness of the stitch-in ramp per cell"
                          />
                        </div>
                        {weaveStitchRevealMode === 2 && (
                          <>
                            <div className="flex flex-wrap items-center gap-2">
                              <GroupIcon name="texture" title="Bleed streak length" />
                              <Label.Root className="sr-only" htmlFor="weave-stitch-reveal-bleed-ani">Bleed anisotropy</Label.Root>
                              <SliderWithInput
                                id="weave-stitch-reveal-bleed-ani"
                                value={weaveStitchRevealBleedAnisotropy}
                                onValueChange={setWeaveStitchRevealBleedAnisotropy}
                                defaultValue={WEAVING_URL_DEFAULTS.weaveStitchRevealBleedAnisotropy}
                                onReset={() => setWeaveStitchRevealBleedAnisotropy(WEAVING_URL_DEFAULTS.weaveStitchRevealBleedAnisotropy)}
                                min={0.5}
                                max={12}
                                step={0.25}
                                format={(n) => n.toFixed(2)}
                                aria-label="Bleed streak anisotropy"
                              />
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <GroupIcon name="rotate_right" title="Bleed direction" />
                              <Label.Root className="sr-only" htmlFor="weave-stitch-reveal-bleed-rot">Bleed rotation</Label.Root>
                              <SliderWithInput
                                id="weave-stitch-reveal-bleed-rot"
                                value={weaveStitchRevealBleedRotation}
                                onValueChange={setWeaveStitchRevealBleedRotation}
                                defaultValue={WEAVING_URL_DEFAULTS.weaveStitchRevealBleedRotation}
                                onReset={() => setWeaveStitchRevealBleedRotation(WEAVING_URL_DEFAULTS.weaveStitchRevealBleedRotation)}
                                min={0}
                                max={1}
                                step={0.005}
                                format={(n) => n.toFixed(2)}
                                aria-label="Rotation of bleed streaks (turns)"
                              />
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <GroupIcon name="blur_linear" title="Mix isotropic noise into bleed" />
                              <Label.Root className="sr-only" htmlFor="weave-stitch-reveal-bleed-xf">Cross-fiber mix</Label.Root>
                              <SliderWithInput
                                id="weave-stitch-reveal-bleed-xf"
                                value={weaveStitchRevealBleedCrossFiber}
                                onValueChange={setWeaveStitchRevealBleedCrossFiber}
                                defaultValue={WEAVING_URL_DEFAULTS.weaveStitchRevealBleedCrossFiber}
                                onReset={() => setWeaveStitchRevealBleedCrossFiber(WEAVING_URL_DEFAULTS.weaveStitchRevealBleedCrossFiber)}
                                min={0}
                                max={1}
                                step={0.02}
                                format={(n) => n.toFixed(2)}
                                aria-label="Cross-fiber noise mix for bleed"
                              />
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                className={`${toggleBtn} ${weaveStitchRevealBleedDraftCoupled ? toggleBtnActive : ''}`}
                                aria-pressed={!!weaveStitchRevealBleedDraftCoupled}
                                aria-label="Draft-coupled bleed: streaks follow warp vs weft"
                                title="When on, horizontal vs vertical streak blend follows the weave draft"
                                onClick={() => setWeaveStitchRevealBleedDraftCoupled((v) => (v ? 0 : 1))}
                              >
                                <Icon name="view_quilt" className={iconSm} />
                                <span className={typeLabel}>Draft-coupled bleed</span>
                              </button>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
                )}
                <div className={sidebarGroup}>
                  <div className={sidebarGroupTitle}>Shimmer</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <GroupIcon name="auto_awesome" title="Shimmer" />
                    <button
                      type="button"
                      className={`${toggleBtn} ${shimmer ? toggleBtnActive : ''}`}
                      aria-pressed={shimmer}
                      aria-label="Toggle shimmer effect"
                      onClick={() => setShimmer((s) => !s)}
                    >
                      Shimmer
                    </button>
                    {shimmer !== WEAVING_URL_DEFAULTS.shimmer && (
                      <IconButton size="resetSm" onClick={() => setShimmer(WEAVING_URL_DEFAULTS.shimmer)} title="Reset shimmer toggle" aria-label="Reset shimmer toggle to default">
                        <Icon name="restart_alt" className={iconResetGlyph} />
                      </IconButton>
                    )}
                    {shimmer && (
                      <>
                        <button
                          type="button"
                          className={`${toggleBtnIcon} ${shimmerPlaying ? toggleBtnActive : ''}`}
                          aria-label={shimmerPlaying ? 'Pause shimmer animation' : 'Play shimmer animation'}
                          aria-pressed={shimmerPlaying}
                          onClick={() => {
                            if (shimmerPlaying) setShimmerPausedAtTime(shimmerTimeRef.current);
                            setShimmerPlaying((p) => !p);
                          }}
                        >
                          <Icon name={shimmerPlaying ? 'pause' : 'play_arrow'} className={iconPlayGlyph} />
                        </button>
                        <AppSelect
                          id="shimmer-blend"
                          labelText="Shimmer blend mode"
                          value={shimmerBlendMode}
                          onValueChange={(v) => setShimmerBlendMode(Number(v))}
                          defaultValue={WEAVING_URL_DEFAULTS.shimmerBlendMode}
                          onReset={() => setShimmerBlendMode(WEAVING_URL_DEFAULTS.shimmerBlendMode)}
                          options={[
                            { value: 0, label: 'Add' },
                            { value: 1, label: 'Multiply' },
                            { value: 2, label: 'Screen' },
                            { value: 3, label: 'Overlay' },
                            { value: 4, label: 'Soft Light' },
                            { value: 5, label: 'Hard Light' },
                            { value: 6, label: 'Color Dodge' },
                            { value: 7, label: 'Color Burn' },
                            { value: 8, label: 'Linear Burn' },
                            { value: 9, label: 'Difference' },
                            { value: 10, label: 'Exclusion' },
                          ]}
                          title="Shimmer blend mode"
                          placeholder="Blend"
                        />
                        <Label.Root className="sr-only" htmlFor="shimmer-speed">Shimmer speed (cells/s)</Label.Root>
                        <SliderWithInput
                          id="shimmer-speed"
                          value={shimmerSpeed}
                          onValueChange={setShimmerSpeed}
                          min={1}
                          max={16}
                          step={1}
                          snapPointCount={16}
                          aria-label="Shimmer speed (cells/s)"
                          defaultValue={WEAVING_URL_DEFAULTS.shimmerSpeed}
                          onReset={() => setShimmerSpeed(WEAVING_URL_DEFAULTS.shimmerSpeed)}
                        />
                        <span className={`${controlLabel} ${typeCaption} tabular-nums`} title="Cells per second">Cells/s</span>
                        <Label.Root className="sr-only" htmlFor="shimmer-width">Shimmer width</Label.Root>
                        <SliderWithInput
                          id="shimmer-width"
                          value={shimmerWidth}
                          onValueChange={setShimmerWidth}
                          min={0.25}
                          max={24}
                          step={0.25}
                          format={(n) => n.toFixed(2)}
                          aria-label="Shimmer width"
                          defaultValue={WEAVING_URL_DEFAULTS.shimmerWidth}
                          onReset={() => setShimmerWidth(WEAVING_URL_DEFAULTS.shimmerWidth)}
                        />
                        <Label.Root className="sr-only" htmlFor="shimmer-intensity">Shimmer intensity</Label.Root>
                        <SliderWithInput
                          id="shimmer-intensity"
                          value={shimmerIntensity}
                          onValueChange={setShimmerIntensity}
                          min={0}
                          max={1}
                          step={0.05}
                          snapPointCount={11}
                          format={(n) => n.toFixed(2)}
                          aria-label="Shimmer intensity"
                          defaultValue={WEAVING_URL_DEFAULTS.shimmerIntensity}
                          onReset={() => setShimmerIntensity(WEAVING_URL_DEFAULTS.shimmerIntensity)}
                        />
                        <span className={`${controlLabel} ${typeCaption}`}>Intensity</span>
                        <Label.Root className="sr-only" htmlFor="shimmer-position">Shimmer position (band phase 0–1)</Label.Root>
                        <SliderWithInput
                          id="shimmer-position"
                          value={shimmerPhase}
                          onValueChange={setShimmerPhase}
                          min={0}
                          max={1}
                          step={0.01}
                          format={(n) => n.toFixed(2)}
                          aria-label="Shimmer position (updates as animates)"
                          defaultValue={WEAVING_URL_DEFAULTS.shimmerPosition}
                          onReset={() => setShimmerPosition(WEAVING_URL_DEFAULTS.shimmerPosition)}
                        />
                        <span className={`${controlLabel} ${typeCaption}`}>Position</span>
                        <Label.Root className="sr-only" htmlFor="shimmer-rotation">Shimmer rotation</Label.Root>
                        <SliderWithInput
                          id="shimmer-rotation"
                          value={shimmerRotation}
                          onValueChange={setShimmerRotation}
                          min={0}
                          max={1}
                          step={0.01}
                          format={(n) => n.toFixed(2)}
                          aria-label="Shimmer rotation"
                          defaultValue={WEAVING_URL_DEFAULTS.shimmerRotation}
                          onReset={() => setShimmerRotation(WEAVING_URL_DEFAULTS.shimmerRotation)}
                        />
                        <span className={`${controlLabel} ${typeCaption}`}>Rotation</span>
                        <Label.Root className="sr-only" htmlFor="shimmer-noise">Shimmer noise amount</Label.Root>
                        <SliderWithInput
                          id="shimmer-noise"
                          value={shimmerNoise}
                          onValueChange={setShimmerNoise}
                          min={0}
                          max={1}
                          step={0.05}
                          snapPointCount={11}
                          format={(n) => n.toFixed(2)}
                          aria-label="Shimmer noise amount"
                          defaultValue={WEAVING_URL_DEFAULTS.shimmerNoise}
                          onReset={() => setShimmerNoise(WEAVING_URL_DEFAULTS.shimmerNoise)}
                        />
                        <span className={`${controlLabel} ${typeCaption}`}>Noise</span>
                        <Label.Root className="sr-only" htmlFor="shimmer-noise-seed">Shimmer noise seed</Label.Root>
                        <SliderWithInput
                          id="shimmer-noise-seed"
                          value={shimmerNoiseSeed}
                          onValueChange={setShimmerNoiseSeed}
                          min={0}
                          max={1}
                          step={0.01}
                          format={(n) => n.toFixed(2)}
                          aria-label="Shimmer noise seed (pattern variation)"
                          defaultValue={WEAVING_URL_DEFAULTS.shimmerNoiseSeed}
                          onReset={() => setShimmerNoiseSeed(WEAVING_URL_DEFAULTS.shimmerNoiseSeed)}
                        />
                        <span className={`${controlLabel} ${typeCaption}`}>Noise seed</span>
                        <Label.Root className="sr-only" htmlFor="shimmer-noise-min">Shimmer noise min</Label.Root>
                        <SliderWithInput
                          id="shimmer-noise-min"
                          value={shimmerNoiseMin}
                          onValueChange={setShimmerNoiseMin}
                          min={0}
                          max={2}
                          step={0.1}
                          format={(n) => n.toFixed(1)}
                          aria-label="Shimmer noise factor min (0–2)"
                          defaultValue={WEAVING_URL_DEFAULTS.shimmerNoiseMin}
                          onReset={() => setShimmerNoiseMin(WEAVING_URL_DEFAULTS.shimmerNoiseMin)}
                        />
                        <span className={`${controlLabel} ${typeCaption}`}>Noise min</span>
                        <Label.Root className="sr-only" htmlFor="shimmer-noise-max">Shimmer noise max</Label.Root>
                        <SliderWithInput
                          id="shimmer-noise-max"
                          value={shimmerNoiseMax}
                          onValueChange={setShimmerNoiseMax}
                          min={0}
                          max={2}
                          step={0.1}
                          format={(n) => n.toFixed(1)}
                          aria-label="Shimmer noise factor max (0–2)"
                          defaultValue={WEAVING_URL_DEFAULTS.shimmerNoiseMax}
                          onReset={() => setShimmerNoiseMax(WEAVING_URL_DEFAULTS.shimmerNoiseMax)}
                        />
                        <span className={`${controlLabel} ${typeCaption}`}>Noise max</span>
                      </>
                    )}
                  </div>
                </div>
              </>
            {view === 'weaving' && weaveHalftoneOn && (
              <>
                <div className={sidebarGroup}>
                  <div className={`${sidebarGroupTitle} inline-flex items-center gap-1`}><Icon name="lens_blur" className={iconXs} /> preset</div>
                  <AppSelect
                    value={halftonePresetIndex}
                    onValueChange={(v) => applyHalftonePreset(Number(v))}
                    defaultValue={HALFTONE_DEFAULTS.presetIndex}
                    onReset={() => applyHalftonePreset(HALFTONE_DEFAULTS.presetIndex)}
                    options={halftoneCmykPresets.map((p, i) => ({ value: i, label: p.name }))}
                    title="Halftone preset"
                    placeholder="Preset"
                  />
                </div>
                <div className={sidebarGroup}>
                  <div className={`${sidebarGroupTitle} inline-flex items-center gap-1`}><Icon name="lens_blur" className={iconXs} /> dot & grid</div>
                  <div className="flex flex-col gap-1">
                    <Label.Root className={typeLabel} htmlFor="v3-halftone-size">Size</Label.Root>
                    <SliderWithInput id="v3-halftone-size" aria-label="Grid size" value={halftoneSize} onValueChange={setHalftoneSize} defaultValue={HALFTONE_DEFAULTS.size} onReset={() => setHalftoneSize(HALFTONE_DEFAULTS.size)} min={0.01} max={1} step={0.01} format={(n) => n.toFixed(2)} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label.Root className={typeLabel} htmlFor="v3-halftone-softness">Softness</Label.Root>
                    <SliderWithInput id="v3-halftone-softness" aria-label="Dot softness" value={halftoneSoftness} onValueChange={setHalftoneSoftness} defaultValue={HALFTONE_DEFAULTS.softness} onReset={() => setHalftoneSoftness(HALFTONE_DEFAULTS.softness)} min={0} max={1} step={0.05} format={(n) => n.toFixed(2)} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label.Root className={typeLabel} htmlFor="v3-halftone-gridnoise">Grid noise</Label.Root>
                    <SliderWithInput id="v3-halftone-gridnoise" aria-label="Grid noise" value={halftoneGridNoise} onValueChange={setHalftoneGridNoise} defaultValue={HALFTONE_DEFAULTS.gridNoise} onReset={() => setHalftoneGridNoise(HALFTONE_DEFAULTS.gridNoise)} min={0} max={1} step={0.05} format={(n) => n.toFixed(2)} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label.Root className={typeLabel}>Type</Label.Root>
                    <AppSelect
                      value={halftoneType}
                      onValueChange={setHalftoneType}
                      defaultValue={HALFTONE_DEFAULTS.type}
                      onReset={() => setHalftoneType(HALFTONE_DEFAULTS.type)}
                      options={[{ value: 'dots', label: 'Dots' }, { value: 'ink', label: 'Ink' }, { value: 'sharp', label: 'Sharp' }]}
                      title="Dot type"
                      placeholder="Type"
                    />
                  </div>
                </div>
                <div className={sidebarGroup}>
                  <div className={`${sidebarGroupTitle} inline-flex items-center gap-1`}><Icon name="lens_blur" className={iconXs} /> tone</div>
                  <div className="flex flex-col gap-1">
                    <Label.Root className={typeLabel} htmlFor="v3-halftone-contrast">Contrast</Label.Root>
                    <SliderWithInput id="v3-halftone-contrast" aria-label="Contrast" value={halftoneContrast} onValueChange={setHalftoneContrast} defaultValue={HALFTONE_DEFAULTS.contrast} onReset={() => setHalftoneContrast(HALFTONE_DEFAULTS.contrast)} min={0} max={2} step={0.05} format={(n) => n.toFixed(2)} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label.Root className={typeLabel} htmlFor="v3-halftone-floodc">Flood C</Label.Root>
                    <SliderWithInput id="v3-halftone-floodc" aria-label="Cyan flood" value={halftoneFloodC} onValueChange={setHalftoneFloodC} defaultValue={HALFTONE_DEFAULTS.floodC} onReset={() => setHalftoneFloodC(HALFTONE_DEFAULTS.floodC)} min={0} max={1} step={0.05} format={(n) => n.toFixed(2)} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label.Root className={typeLabel} htmlFor="v3-halftone-gainc">Gain C</Label.Root>
                    <SliderWithInput id="v3-halftone-gainc" aria-label="Cyan gain" value={halftoneGainC} onValueChange={setHalftoneGainC} defaultValue={HALFTONE_DEFAULTS.gainC} onReset={() => setHalftoneGainC(HALFTONE_DEFAULTS.gainC)} min={-1} max={1} step={0.05} format={(n) => n.toFixed(2)} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label.Root className={typeLabel} htmlFor="v3-halftone-gainy">Gain Y</Label.Root>
                    <SliderWithInput id="v3-halftone-gainy" aria-label="Yellow gain" value={halftoneGainY} onValueChange={setHalftoneGainY} defaultValue={HALFTONE_DEFAULTS.gainY} onReset={() => setHalftoneGainY(HALFTONE_DEFAULTS.gainY)} min={-1} max={1} step={0.05} format={(n) => n.toFixed(2)} />
                  </div>
                </div>
                <div className={sidebarGroup}>
                  <div className={`${sidebarGroupTitle} inline-flex w-full items-center gap-1`}>
                    <Icon name="lens_blur" className={iconXs} />
                    <span className="flex-1">ink colors</span>
                    <IconButton
                      size="resetSm"
                      onClick={() => {
                        setHalftoneColorBack(HALFTONE_DEFAULTS.colorBack);
                        setHalftoneColorC(HALFTONE_DEFAULTS.colorC);
                        setHalftoneColorM(HALFTONE_DEFAULTS.colorM);
                        setHalftoneColorY(HALFTONE_DEFAULTS.colorY);
                        setHalftoneColorK(HALFTONE_DEFAULTS.colorK);
                      }}
                      title="Reset all ink colors to default"
                      aria-label="Reset all ink colors to default"
                    >
                      <Icon name="restart_alt" className={iconResetGlyph} />
                    </IconButton>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { label: 'Back', value: halftoneColorBack, set: setHalftoneColorBack, default: HALFTONE_DEFAULTS.colorBack },
                      { label: 'C', value: halftoneColorC, set: setHalftoneColorC, default: HALFTONE_DEFAULTS.colorC },
                      { label: 'M', value: halftoneColorM, set: setHalftoneColorM, default: HALFTONE_DEFAULTS.colorM },
                      { label: 'Y', value: halftoneColorY, set: setHalftoneColorY, default: HALFTONE_DEFAULTS.colorY },
                      { label: 'K', value: halftoneColorK, set: setHalftoneColorK, default: HALFTONE_DEFAULTS.colorK },
                    ].map(({ label, value, set, default: inkDefault }) => (
                      <div key={label} className="flex items-center gap-1">
                        <span className={`${typeLabel} w-6 shrink-0`}>{label}</span>
                        <input
                          type="color"
                          value={value}
                          onChange={(e) => set(e.target.value)}
                          className="h-7 w-10 shrink-0 cursor-pointer rounded border border-border-subtle bg-surface-input"
                          aria-label={`${label} ink color`}
                        />
                        <IconButton
                          size="resetSm"
                          onClick={() => set(inkDefault)}
                          title={`Reset ${label} ink to default`}
                          aria-label={`Reset ${label} ink color to default`}
                        >
                          <Icon name="restart_alt" className={iconResetGlyph} />
                        </IconButton>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </motion.aside>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <main
            className={
              view === 'weaving' && weaveHalftoneOn
                ? 'flex min-h-0 flex-1 flex-col items-stretch overflow-hidden p-4'
                : 'flex min-h-0 flex-1 flex-col overflow-hidden p-4'
            }
          >
            {view === 'weaving' && !weaveHalftoneOn && (
              <ShaderCanvas
                patternFit={patternFit}
                patternIndex={pattern}
                palette={palette}
                bgShade={bgShade}
                warpShade={warpShade}
                weftShade={weftShade}
                gridSize={gridSize}
                warpGradient={warpGradient}
                weftGradient={weftGradient}
                warpGradientEnabled={warpGradientEnabled}
                weftGradientEnabled={weftGradientEnabled}
                gradSteps={gradSteps}
                rectAspect={rectAspect}
                cornerRadius={cornerRadius}
                canvasAspect={canvasAspect}
                shimmer={shimmer}
                shimmerSpeed={shimmerSpeed}
                shimmerWidth={shimmerWidth}
                shimmerIntensity={shimmerIntensity}
                shimmerPosition={shimmerPosition}
                shimmerRotation={shimmerRotation}
                shimmerNoise={shimmerNoise}
                shimmerNoiseSeed={shimmerNoiseSeed}
                shimmerNoiseMin={shimmerNoiseMin}
                shimmerNoiseMax={shimmerNoiseMax}
                shimmerBlendMode={shimmerBlendMode}
                useAllColorways={useAllColorways}
                colorwaySeed={colorwaySeed}
                colorwayNoiseScale={colorwayNoiseScale}
                colorwayNoiseMode={colorwayNoiseMode}
                colorwayNoiseOctaves={colorwayNoiseOctaves}
                colorwayNoisePersistence={colorwayNoisePersistence}
                colorwayNoiseLacunarity={colorwayNoiseLacunarity}
                colorwayNoiseBias={colorwayNoiseBias}
                colorwayNoiseX={colorwayNoiseX}
                colorwayBleedAnisotropy={colorwayBleedAnisotropy}
                colorwayBleedRotation={colorwayBleedRotation}
                colorwayBleedCrossFiber={colorwayBleedCrossFiber}
                colorwayBleedDraftCoupled={colorwayBleedDraftCoupled}
                colorwayIncludeMask={colorwayIncludeMask}
                weaveStitchRevealMode={weaveStitchRevealMode}
                weaveStitchRevealProgress={weaveStitchRevealProgress}
                weaveStitchRevealSeed={weaveStitchRevealSeed}
                weaveStitchRevealScale={weaveStitchRevealScale}
                weaveStitchRevealNoiseScale={weaveStitchRevealNoiseScale}
                weaveStitchRevealSoftness={weaveStitchRevealSoftness}
                weaveStitchRevealBleedAnisotropy={weaveStitchRevealBleedAnisotropy}
                weaveStitchRevealBleedRotation={weaveStitchRevealBleedRotation}
                weaveStitchRevealBleedCrossFiber={weaveStitchRevealBleedCrossFiber}
                weaveStitchRevealBleedDraftCoupled={!!weaveStitchRevealBleedDraftCoupled}
                diagonalRevealProgress={diagonalRevealProgress}
                weaveEnsMarkVisible={weaveEnsMarkVisible}
                shimmerPlaying={shimmerPlaying}
                shimmerPausedAtTime={shimmerPausedAtTime}
                shimmerPhase={shimmerPhase}
                onShimmerTime={onShimmerTime}
                patterns={PATTERNS}
                onFpsChange={setFps}
                onCanvasRef={(el) => { canvasRef.current = el; }}
                onCaptureReady={(api) => { weavingCaptureRef.current = api; }}
              />
            )}
            {view === 'weaving' && weaveHalftoneOn && (
              <Suspense fallback={<div className="flex flex-1 items-center justify-center text-text-secondary">Loading…</div>}>
                <div className="flex min-h-0 flex-1 w-full flex-col">
                  <WeavingHalftoneStage
                    patterns={PATTERNS}
                    patternIndex={pattern}
                    palette={palette}
                    bgShade={bgShade}
                    warpShade={warpShade}
                    weftShade={weftShade}
                    gridSize={gridSize}
                    warpGradient={warpGradient}
                    weftGradient={weftGradient}
                    warpGradientEnabled={warpGradientEnabled}
                    weftGradientEnabled={weftGradientEnabled}
                    gradSteps={gradSteps}
                    rectAspect={rectAspect}
                    cornerRadius={cornerRadius}
                    canvasAspect={canvasAspect}
                    patternFit={patternFit}
                    shimmer={shimmer}
                    shimmerSpeed={shimmerSpeed}
                    shimmerPlaying={shimmerPlaying}
                    shimmerPausedAtTime={shimmerPausedAtTime}
                    shimmerPhase={shimmerPhase}
                    onShimmerTime={onShimmerTime}
                    shimmerWidth={shimmerWidth}
                    shimmerIntensity={shimmerIntensity}
                    shimmerPosition={shimmerPosition}
                    shimmerRotation={shimmerRotation}
                    shimmerNoise={shimmerNoise}
                    shimmerNoiseSeed={shimmerNoiseSeed}
                    shimmerNoiseMin={shimmerNoiseMin}
                    shimmerNoiseMax={shimmerNoiseMax}
                    shimmerBlendMode={shimmerBlendMode}
                    useAllColorways={useAllColorways}
                    colorwaySeed={colorwaySeed}
                    colorwayNoiseScale={colorwayNoiseScale}
                    colorwayNoiseMode={colorwayNoiseMode}
                    colorwayNoiseOctaves={colorwayNoiseOctaves}
                    colorwayNoisePersistence={colorwayNoisePersistence}
                    colorwayNoiseLacunarity={colorwayNoiseLacunarity}
                    colorwayNoiseBias={colorwayNoiseBias}
                    colorwayNoiseX={colorwayNoiseX}
                    colorwayBleedAnisotropy={colorwayBleedAnisotropy}
                    colorwayBleedRotation={colorwayBleedRotation}
                    colorwayBleedCrossFiber={colorwayBleedCrossFiber}
                    colorwayBleedDraftCoupled={colorwayBleedDraftCoupled}
                    colorwayIncludeMask={colorwayIncludeMask}
                    weaveStitchRevealMode={weaveStitchRevealMode}
                    weaveStitchRevealProgress={weaveStitchRevealProgress}
                    weaveStitchRevealSeed={weaveStitchRevealSeed}
                    weaveStitchRevealScale={weaveStitchRevealScale}
                    weaveStitchRevealNoiseScale={weaveStitchRevealNoiseScale}
                    weaveStitchRevealSoftness={weaveStitchRevealSoftness}
                    weaveStitchRevealBleedAnisotropy={weaveStitchRevealBleedAnisotropy}
                    weaveStitchRevealBleedRotation={weaveStitchRevealBleedRotation}
                    weaveStitchRevealBleedCrossFiber={weaveStitchRevealBleedCrossFiber}
                    weaveStitchRevealBleedDraftCoupled={!!weaveStitchRevealBleedDraftCoupled}
                    diagonalRevealProgress={diagonalRevealProgress}
                    weaveEnsMarkVisible={weaveEnsMarkVisible}
                    size={halftoneSize}
                    softness={halftoneSoftness}
                    gridNoise={halftoneGridNoise}
                    contrast={halftoneContrast}
                    type={halftoneType}
                    colorBack={halftoneColorBack}
                    colorC={halftoneColorC}
                    colorM={halftoneColorM}
                    colorY={halftoneColorY}
                    colorK={halftoneColorK}
                    floodC={halftoneFloodC}
                    gainC={halftoneGainC}
                    gainY={halftoneGainY}
                    halftoneContainerRef={halftoneContainerRef}
                    halftoneCanvasRef={halftoneCanvasRef}
                    customImageUrl={halftoneCustomImageUrl || undefined}
                  />
                </div>
              </Suspense>
            )}
          </main>

          <CaptureToolbar
            copyFormat={copyFormat}
            setCopyFormat={setCopyFormat}
            copyScale={copyScale}
            setCopyScale={setCopyScale}
            copyDefaults={{ copyScale: WEAVING_URL_DEFAULTS.copyScale, copyFormat: WEAVING_URL_DEFAULTS.copyFormat }}
            onCopy={handleCopy}
            copyFeedback={copyFeedback}
            onDownload={handleExport}
            downloadFeedback={exportFeedback}
            showEmbedExport={view === 'weaving'}
            onOpenEmbedExport={() => setEmbedExportOpen(true)}
            onOpenConfigExport={() => setConfigExportOpen(true)}
            recordFormat={recordFormat}
            setRecordFormat={setRecordFormat}
            isRecording={isRecording}
            isProcessing={isProcessing}
            recordingReason={null}
            onRecordClick={isRecording ? stopRecording : startRecording}
            onPlayRecord={startWeavePlayAndRecord}
            keyframe={{
              editingAfter: weaveEditingAfter,
              setEditingAfter: setWeaveEditingAfter,
              durationSec: weaveKeyframeDurationSec,
              setDurationSec: setWeaveKeyframeDurationSec,
              isPlaying: weaveKeyframePlaying,
              onSetBefore: () => { syncWeaveBeforeFromLive(); setWeaveEditingAfter(false); },
              onSetAfter: () => { syncWeaveAfterFromLive(); setWeaveEditingAfter(true); },
              onPlay: startWeaveKeyframePlay,
              onStop: stopWeaveKeyframe,
            }}
          />
          <ShaderEmbedExportModal
            open={embedExportOpen}
            onClose={() => setEmbedExportOpen(false)}
            currentState={weaveKeyframeState}
            snapshotA={weaveBefore}
            snapshotB={weaveAfter}
            isKeyframePlaying={weaveKeyframePlaying}
            shimmerPlaying={shimmerPlaying}
            colorwayAnimPlaying={colorwayAnimPlaying}
          />
          <ConfigExportModal
            open={configExportOpen}
            onClose={() => setConfigExportOpen(false)}
            tab="weave"
            state={configHandoffState}
            meta={{ view, presetIndex: presetIndex ?? null }}
            animation={configHandoffAnimation}
            keyframes={{
              durationSec: weaveKeyframeDurationSec,
              editingAfter: weaveEditingAfter,
              setA: weaveBefore,
              setB: weaveAfter,
            }}
            hasKeyframeA={!!weaveBefore && Object.keys(weaveBefore).length > 0}
            hasKeyframeB={!!weaveAfter && Object.keys(weaveAfter).length > 0}
          />

          <footer className="relative h-[100px] shrink-0 overflow-hidden border-t border-border-subtle bg-surface-elevated">
            <div className="flex h-full min-h-9 flex-wrap items-center gap-1.5 overflow-y-auto px-3 py-2">
              <span className={pill}>{PATTERNS[pattern]?.name ?? '—'}</span>
              <span className={pill}>{PALETTE_NAMES[palette]}</span>
              <span className={pill}>BG: {bgShade === 4 ? <><Icon name={SHADE_TRANSPARENT_ICON} className={iconXs} /></> : SHADE_NAMES[bgShade]}</span>
              <span className={pill}>Warp: {SHADE_NAMES[warpShade]}</span>
              <span className={pill}>Weft: {SHADE_NAMES[weftShade]}</span>
              <span className={pill}>
                Warp grad: {warpGradientEnabled ? `${SHADE_NAMES[warpGradient.startShade]}→${SHADE_NAMES[warpGradient.endShade]}` : 'off'}
              </span>
              <span className={pill}>
                Weft grad: {weftGradientEnabled ? `${SHADE_NAMES[weftGradient.startShade]}→${SHADE_NAMES[weftGradient.endShade]}` : 'off'}
              </span>
              <span className={pill}>Grid: {gridSize}</span>
              <span className={pill}>Steps: {gradSteps === 0 ? 'Smooth' : gradSteps}</span>
              <span className={pill}>ENS mark: {weaveEnsMarkVisible ? 'on' : 'off'}</span>
              <span className={pill}>Canvas: {canvasAspect.toFixed(2)}</span>
              <div className="ml-auto flex items-center gap-2">
                <span className={pill}>{fps || '--'} fps</span>
                <span className={pill}>WebGL 1</span>
              </div>
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-linear-to-t from-surface-elevated to-transparent" aria-hidden />
          </footer>
        </div>
      </div>
      <RecordingDownloadBanner
        pending={pendingDownload}
        onDismiss={clearPendingDownload}
        recordError={recordError}
        onClearError={clearRecordError}
      />
    </div>
  );
}
