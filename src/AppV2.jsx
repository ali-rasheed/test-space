/**
 * AppV2 — Mosaic: image, video, or GIF → colored rects (one sample per cell). Weave orientation;
 * brand / image / pattern color; quantize, stitches, optional background gaps (legacy v5), Fit/Fill canvas.
 * Copy, WebM/MP4 record, URL state (?v=2, gap=, display=), shortcuts.
 */
import { useState, useCallback, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { halftoneCmykPresets } from '@paper-design/shaders-react';
import { motion } from 'motion/react';
import * as Label from '@radix-ui/react-label';
import { ImageRectsCanvas } from './components/ImageRectsCanvas';
import { SliderWithInput } from './components/SliderWithInput';
import { useCanvasRecorder } from './hooks/useCanvasRecorder';
import { useKeyframePlayback } from './hooks/useKeyframePlayback';
import { getMosaicKeyframeSnapshot, applyMosaicKeyframe } from './keyframe/mosaicKeyframe';
import { CaptureToolbar } from './components/CaptureToolbar';
import { ConfigExportModal } from './components/ConfigExportModal.jsx';
import { PATTERNS, buildPatternSelectOptions, randomEnabledPatternIndex } from './patterns';
import {
  DEFAULT_TILE_ART_RAMP,
  TILE_ART_SLOT_COUNT,
  TILE_ART_UNIFORM_TILE_H,
  TILE_ART_UNIFORM_TILE_W,
  buildDefaultTileArtRamp,
  moveRampSlot,
  parseTileArtRampParam,
  serializeTileArtRamp,
} from './patterns/tileArtRamp';
import { AppTooltip } from './components/ui/AppTooltip';
import { GRID_SNAPS, getGridSizeIndex, URL_STATE_MAX_LEN, WEAVE_ICONS } from './constants';
import { IMAGE_RECTS_URL_DEFAULTS, HALFTONE_DEFAULTS, HALFTONE_PAPER, KEYFRAME_ANIM_DEFAULT_SEC } from './urlDefaults';
import {
  applyHalftonePaperPreset,
  halftonePaperModeFromValues,
  parseHalftonePaperModeParam,
  serializeHalftonePaperMode,
} from './halftonePaper';
import {
  capToMaxDimension,
  pngBlobToFormat,
  scaleCanvasToBlob,
  downloadBlob,
  imageExportFilename,
} from './canvasImageExport';

const ImageRectsHalftoneStage = lazy(() =>
  import('./components/ImageRectsHalftoneStage.jsx').then((m) => ({ default: m.ImageRectsHalftoneStage }))
);

const HALFTONE_TYPE_MAP = ['dots', 'ink', 'sharp'];

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

function getInitialMosaicHalftoneOn() {
  const p = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const v = p.get('v');
  const mht = p.get('mht');
  return v === '4' || mht === '1';
}
import { decodeKeyframeSnapshot, encodeKeyframeSnapshot } from './keyframe/keyframeUrlCodec';
import {
  PALETTE_NAMES,
  PALETTE_SWATCH_COLORS,
  SHADE_NAMES,
  SHADE_TRANSPARENT_ICON,
  typeBase,
  typeLabel,
  controlLabel,
  iconSm,
  iconMd,
  iconXs,
  iconResetGlyph,
  iconResetGlyphMd,
  btnGhost,
  pill,
  sidebarGroup,
  sidebarGroupSticky,
  sidebarGroupTitle,
  paletteSwatch,
  paletteSwatchSelected,
  paletteSwatchUnselected,
  toggleBtn,
  toggleBtnActive,
} from './uiConstants';
import { Icon, GroupIcon, AppSelect, SegmentedControl, SegmentedControlButton, IconButton } from './components/ui';
import { RecordingDownloadBanner } from './components/RecordingDownloadBanner.jsx';
import { ThemeToggle } from './components/ThemeToggle.jsx';

/** Rect fill: brand = palette from cell image luma; image = sampled RGB; warp/weft = thread shades from draft; tile art = per-cell weave ramp. */
const RECT_COLOR_SOURCE_OPTIONS = [
  { value: 0, label: 'Brand' },
  { value: 1, label: 'Image' },
  { value: 2, label: 'Warp / weft' },
  { value: 3, label: 'Tile art' },
];

const TILE_ART_COLOR_MODE_OPTIONS = [
  { value: 0, label: 'Mono' },
  { value: 1, label: 'Brand' },
  { value: 2, label: 'Tint' },
];

/** How cell color is banded when quantize steps ≥ 2 (see fragmentImageRects.glsl). */
const QUANTIZE_MODE_OPTIONS = [
  { value: 0, label: 'RGB' },
  { value: 1, label: 'HSV' },
];

/** Animate colored stitches from background-only: isotropic FBM order vs dye-bleed streaks. */
const STITCH_REVEAL_MODE_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 1, label: 'Noise' },
  { value: 2, label: 'Bleed' },
];

/** BG color source for Mosaic: palette shade presets or a custom picked color. */
const BG_COLOR_MODE_OPTIONS = [
  { value: 0, label: 'Preset' },
  { value: 1, label: 'Color' },
];

function normalizeHexColor(hex, fallback = '#f2f2f2') {
  const value = typeof hex === 'string' ? hex.trim() : '';
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  return fallback;
}

/** Map picked file to WebGL upload strategy (V6 video/GIF). */
function inferMediaTextureKindFromFile(file) {
  if (!file) return 'staticImage';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type === 'image/gif') return 'gif';
  const n = file.name.toLowerCase();
  if (n.endsWith('.gif')) return 'gif';
  if (/\.(webm|mp4|mov|m4v|ogv|avi)$/i.test(n)) return 'video';
  return 'staticImage';
}

/** Parse URL search params into Mosaic state. imageSource is not in URL (blob). v=2|4|5|6; v=4 = halftone on (legacy Print mosaic). */
function parseUrlStateV2(search) {
  const params = new URLSearchParams(search);
  const out = {};
  const num = (paramKey, stateKey, min, max) => {
    const val = params.get(paramKey);
    if (val == null) return;
    const n = Number(val);
    if (!Number.isFinite(n)) return;
    out[stateKey] = min != null && max != null ? Math.max(min, Math.min(max, n)) : n;
  };
  const numLegacy = (primary, legacy, stateKey, min, max) => {
    const val = params.get(primary) ?? params.get(legacy);
    if (val == null) return;
    const n = Number(val);
    if (!Number.isFinite(n)) return;
    out[stateKey] = min != null && max != null ? Math.max(min, Math.min(max, n)) : n;
  };
  const vParam = params.get('v');
  const mosaicV = vParam == null || vParam === '2' || vParam === '4' || vParam === '5' || vParam === '6';
  if (!mosaicV) return out;
  if (vParam === '4') out.mosaicHalftoneOn = true;
  const mht = params.get('mht');
  if (mht === '1') out.mosaicHalftoneOn = true;
  if (mht === '0') out.mosaicHalftoneOn = false;
  const legacyCombo = vParam === '4';
  if (vParam === '5') {
    out.mosaicBgGaps = true;
    if (params.get('gm') == null && params.get('gap') == null) out.cellGeometryMode = 1;
  }
  const gap = params.get('gap');
  if (gap === '1') out.mosaicBgGaps = true;
  if (gap === '0') out.mosaicBgGaps = false;
  const display = params.get('display');
  if (display === 'fill' || display === 'fit') out.patternFit = display;
  if (legacyCombo) {
    numLegacy('grid', 'cg', 'gridSize', 8, 256);
    numLegacy('pal', 'cpal', 'palette', 0, 4);
    numLegacy('bg', 'cbg', 'bgShade', 0, 5);
    numLegacy('cm', 'ccm', 'rectColorSource', 0, 3);
    numLegacy('pws', 'cpws', 'patternWarpShade', 0, 4);
    numLegacy('pwf', 'cpwf', 'patternWeftShade', 0, 4);
    numLegacy('q', 'cq', 'quantizeSteps', 0, 32);
    numLegacy('qm', 'cqm', 'quantizeMode', 0, 1);
    numLegacy('p', 'cp', 'patternIndex', 0, PATTERNS.length - 1);
    numLegacy('rr', 'crr', 'rectRadius', 0, 0.5);
    numLegacy('ra', 'cra', 'rectAspect', 0.3, 1.5);
    numLegacy('rratio', 'cratio', 'rectRatio', 0.2, 1);
    numLegacy('gm', 'cgm', 'cellGeometryMode', 0, 1);
  }
  num('grid', 'gridSize', 8, 256);
  num('pal', 'palette', 0, 4);
  num('bg', 'bgShade', 0, 5);
  num('bgm', 'bgColorMode', 0, 1);
  const bgc = params.get('bgc');
  if (bgc != null) out.bgCustomColor = normalizeHexColor(`#${bgc}`, IMAGE_RECTS_URL_DEFAULTS.bgCustomColor);
  num('cm', 'rectColorSource', 0, 3);
  num('tal', 'tileArtLevels', 2, 8);
  const tat = params.get('tat');
  if (tat != null) {
    const n = Number(tat);
    if (Number.isFinite(n)) out.tileArtThreshold = Math.max(0, Math.min(1, n / 100));
  }
  const tad = params.get('tad');
  if (tad != null) {
    const n = Number(tad);
    if (Number.isFinite(n)) out.tileArtDither = Math.max(0, Math.min(1, n / 100));
  }
  num('tacm', 'tileArtColorMode', 0, 2);
  num('tag', 'tileArtGeom', 0, 1);
  num('tug', 'tileArtUniformGrid', 0, 1);
  num('taf', 'tileArtDensity', 0, 1);
  const tar = params.get('tar');
  const parsedRamp = parseTileArtRampParam(tar);
  if (parsedRamp) out.tileArtRamp = parsedRamp;
  num('pws', 'patternWarpShade', 0, 4);
  num('pwf', 'patternWeftShade', 0, 4);
  num('q', 'quantizeSteps', 0, 32);
  num('qm', 'quantizeMode', 0, 1);
  num('p', 'patternIndex', 0, PATTERNS.length - 1);
  num('rr', 'rectRadius', 0, 0.5);
  num('ra', 'rectAspect', 0.3, 1.5);
  num('rratio', 'rectRatio', 0.2, 1);
  const cf = params.get('cf');
  if (cf === 'webp' || cf === 'png') out.copyFormat = cf;
  const cs = params.get('cs');
  if (cs !== null && [1, 2, 4, 8, 12].includes(Number(cs))) out.copyScale = Number(cs);
  const qg = params.get('qg');
  if (qg != null) {
    const n = Number(qg);
    if (Number.isFinite(n)) out.quantizeGamma = Math.max(0.25, Math.min(4, n / 100));
  }
  const qd = params.get('qd');
  if (qd != null) {
    const n = Number(qd);
    if (Number.isFinite(n)) out.quantizeDither = Math.max(0, Math.min(1, n / 100));
  }
  const ls = params.get('ls');
  if (ls != null) {
    const n = Number(ls);
    if (Number.isFinite(n)) out.lumaSizeMix = Math.max(0, Math.min(1, n / 100));
  }
  const lsi = params.get('lsi');
  if (lsi != null) {
    const n = Number(lsi);
    if (n === 0 || n === 1) out.lumaSizeInvert = n;
  }
  const lsf = params.get('lsf');
  if (lsf != null) {
    const n = Number(lsf);
    if (Number.isFinite(n)) out.lumaSizeFloor = Math.max(0.05, Math.min(1, n / 100));
  }
  const cpad = params.get('cpad');
  if (cpad != null) {
    const n = Number(cpad);
    if (Number.isFinite(n)) out.contentPadding = Math.max(0, Math.min(0.45, n / 100));
  }
  num('gm', 'cellGeometryMode', 0, 1);
  const glt = params.get('glt');
  if (glt != null) {
    const n = Number(glt);
    if (Number.isFinite(n)) out.stitchLumaMax = Math.max(0, Math.min(1, n / 100));
  }
  num('srm', 'stitchRevealMode', 0, 2);
  const srd = params.get('srd');
  if (srd != null) {
    const n = Number(srd);
    if (Number.isFinite(n)) out.stitchRevealDurationSec = Math.max(0.25, Math.min(30, n / 100));
  }
  const srs = params.get('srs');
  if (srs != null) {
    const n = Number(srs);
    if (Number.isFinite(n)) out.stitchRevealSeed = Math.max(0, Math.min(999999, n));
  }
  const srsc = params.get('srsc');
  if (srsc != null) {
    const n = Number(srsc);
    if (Number.isFinite(n)) out.stitchRevealScale = Math.max(0.02, Math.min(0.8, n / 1000));
  }
  const srns = params.get('srns');
  if (srns != null) {
    const n = Number(srns);
    if (Number.isFinite(n)) out.stitchRevealNoiseScale = Math.max(0.25, Math.min(4, n / 100));
  }
  const srso = params.get('srso');
  if (srso != null) {
    const n = Number(srso);
    if (Number.isFinite(n)) out.stitchRevealSoftness = Math.max(0.01, Math.min(0.35, n / 1000));
  }
  num('srba', 'stitchRevealBleedAnisotropy', 0, 12);
  const srbr = params.get('srbr');
  if (srbr != null) {
    const n = Number(srbr);
    if (Number.isFinite(n)) out.stitchRevealBleedRotation = Math.max(0, Math.min(1, n / 1000));
  }
  const srbc = params.get('srbc');
  if (srbc != null) {
    const n = Number(srbc);
    if (Number.isFinite(n)) out.stitchRevealBleedCrossFiber = Math.max(0, Math.min(1, n / 1000));
  }
  const srbd = params.get('srbd');
  if (srbd === '1') out.stitchRevealBleedDraftCoupled = 1;
  if (srbd === '0') out.stitchRevealBleedDraftCoupled = 0;
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
  num('hp', 'halftonePresetIndex', 0, halftoneCmykPresets.length - 1);
  num('hs', 'halftoneSize', 0.01, 1);
  num('hsoft', 'halftoneSoftness', 0, 1);
  num('hgn', 'halftoneGridNoise', 0, 1);
  num('hc', 'halftoneContrast', 0, 2);
  num('hfc', 'halftoneFloodC', 0, 1);
  num('hgc', 'halftoneGainC', -1, 1);
  num('hgy', 'halftoneGainY', -1, 1);
  const ht = params.get('ht');
  if (ht != null && HALFTONE_TYPE_MAP[Number(ht)]) out.halftoneType = HALFTONE_TYPE_MAP[Number(ht)];
  const hcols = params.get('hcols');
  if (hcols) {
    const colors = unpackHexColors(hcols);
    if (colors) {
      [out.halftoneColorBack, out.halftoneColorC, out.halftoneColorM, out.halftoneColorY, out.halftoneColorK] = colors;
    }
  }
  const hbp = params.get('hbp');
  if (hbp != null) out.halftonePaperMode = parseHalftonePaperModeParam(hbp);
  return out;
}

/** Build URL search string from Mosaic state; omit defaults to keep URL short. */
function buildUrlStateV2(state) {
  const def = IMAGE_RECTS_URL_DEFAULTS;
  const p = new URLSearchParams();
  p.set('v', state.mosaicHalftoneOn ? '4' : '2');
  if (state.gridSize !== def.gridSize) p.set('grid', String(state.gridSize));
  if (state.palette !== def.palette) p.set('pal', String(state.palette));
  if (state.bgShade !== def.bgShade) p.set('bg', String(state.bgShade));
  if (state.bgColorMode !== def.bgColorMode) p.set('bgm', String(state.bgColorMode));
  const bgCustomColor = normalizeHexColor(state.bgCustomColor, def.bgCustomColor);
  if (bgCustomColor !== def.bgCustomColor) p.set('bgc', bgCustomColor.slice(1));
  if (state.rectColorSource !== def.rectColorSource) p.set('cm', String(state.rectColorSource));
  if (state.tileArtLevels !== def.tileArtLevels) p.set('tal', String(state.tileArtLevels));
  if (state.tileArtThreshold !== def.tileArtThreshold) p.set('tat', String(Math.round(state.tileArtThreshold * 100)));
  if (state.tileArtDither !== def.tileArtDither) p.set('tad', String(Math.round(state.tileArtDither * 100)));
  if (state.tileArtColorMode !== def.tileArtColorMode) p.set('tacm', String(state.tileArtColorMode));
  if (state.tileArtGeom !== def.tileArtGeom) p.set('tag', String(state.tileArtGeom));
  if (state.tileArtUniformGrid !== def.tileArtUniformGrid) p.set('tug', String(state.tileArtUniformGrid));
  if (state.tileArtDensity !== def.tileArtDensity) p.set('taf', String(state.tileArtDensity));
  const tar = serializeTileArtRamp(state.tileArtRamp);
  if (tar) p.set('tar', tar);
  if (state.patternWarpShade !== def.patternWarpShade) p.set('pws', String(state.patternWarpShade));
  if (state.patternWeftShade !== def.patternWeftShade) p.set('pwf', String(state.patternWeftShade));
  if (state.lumaSizeMix !== def.lumaSizeMix) p.set('ls', String(Math.round(state.lumaSizeMix * 100)));
  if (state.lumaSizeInvert !== def.lumaSizeInvert) p.set('lsi', String(state.lumaSizeInvert));
  if (state.lumaSizeFloor !== def.lumaSizeFloor) p.set('lsf', String(Math.round(state.lumaSizeFloor * 100)));
  if (state.cellGeometryMode !== def.cellGeometryMode) p.set('gm', String(state.cellGeometryMode));
  if (state.stitchLumaMax !== def.stitchLumaMax) p.set('glt', String(Math.round(state.stitchLumaMax * 100)));
  if (state.quantizeSteps !== def.quantizeSteps) p.set('q', String(state.quantizeSteps));
  if (state.quantizeMode !== def.quantizeMode) p.set('qm', String(state.quantizeMode));
  if (state.quantizeGamma !== def.quantizeGamma) p.set('qg', String(Math.round(state.quantizeGamma * 100)));
  if (state.quantizeDither !== def.quantizeDither) p.set('qd', String(Math.round(state.quantizeDither * 100)));
  if (state.patternIndex !== def.patternIndex) p.set('p', String(state.patternIndex));
  if (state.rectRadius !== def.rectRadius) p.set('rr', String(Number(state.rectRadius.toFixed(2))));
  if (state.rectAspect !== def.rectAspect) p.set('ra', String(Number(state.rectAspect.toFixed(2))));
  if (state.rectRatio !== def.rectRatio) p.set('rratio', String(Number(state.rectRatio.toFixed(2))));
  if (state.copyFormat !== def.copyFormat) p.set('cf', state.copyFormat);
  if (state.copyScale !== def.copyScale) p.set('cs', String(state.copyScale));
  if (state.menuHidden !== def.menuHidden) p.set('menu', state.menuHidden ? '0' : '1');
  if (state.mosaicBgGaps === true) p.set('gap', '1');
  if (state.patternFit != null && state.patternFit !== def.patternFit) p.set('display', state.patternFit);
  if (state.contentPadding !== def.contentPadding) p.set('cpad', String(Math.round(state.contentPadding * 100)));
  if (state.stitchRevealMode !== def.stitchRevealMode) p.set('srm', String(state.stitchRevealMode));
  if (state.stitchRevealDurationSec !== def.stitchRevealDurationSec) p.set('srd', String(Math.round(state.stitchRevealDurationSec * 100)));
  if (state.stitchRevealSeed !== def.stitchRevealSeed) p.set('srs', String(Math.round(state.stitchRevealSeed)));
  if (state.stitchRevealScale !== def.stitchRevealScale) p.set('srsc', String(Math.round(state.stitchRevealScale * 1000)));
  if (state.stitchRevealNoiseScale !== def.stitchRevealNoiseScale) p.set('srns', String(Math.round(state.stitchRevealNoiseScale * 100)));
  if (state.stitchRevealSoftness !== def.stitchRevealSoftness) p.set('srso', String(Math.round(state.stitchRevealSoftness * 1000)));
  if (state.stitchRevealBleedAnisotropy !== def.stitchRevealBleedAnisotropy) p.set('srba', String(Math.round(state.stitchRevealBleedAnisotropy)));
  if (state.stitchRevealBleedRotation !== def.stitchRevealBleedRotation) p.set('srbr', String(Math.round(state.stitchRevealBleedRotation * 1000)));
  if (state.stitchRevealBleedCrossFiber !== def.stitchRevealBleedCrossFiber) p.set('srbc', String(Math.round(state.stitchRevealBleedCrossFiber * 1000)));
  if (state.stitchRevealBleedDraftCoupled !== def.stitchRevealBleedDraftCoupled) p.set('srbd', state.stitchRevealBleedDraftCoupled ? '1' : '0');
  const kd =
    state.keyframeAnimDurationSec != null && Number.isFinite(state.keyframeAnimDurationSec)
      ? state.keyframeAnimDurationSec
      : KEYFRAME_ANIM_DEFAULT_SEC;
  if (Math.abs(kd - KEYFRAME_ANIM_DEFAULT_SEC) > 1e-6) {
    p.set('kad', String(Math.round(kd * 100)));
  }
  if (state.keyframeEditingAfter) p.set('kfe', '1');
  const encMA = encodeKeyframeSnapshot(state.keyframeSnapshotA);
  const encMB = encodeKeyframeSnapshot(state.keyframeSnapshotB);
  if (encMA) p.set('kfa', encMA);
  if (encMB) p.set('kfb', encMB);
  const hdef = HALFTONE_DEFAULTS;
  if (state.halftonePresetIndex !== hdef.presetIndex) p.set('hp', String(state.halftonePresetIndex));
  if (state.halftoneSize !== hdef.size) p.set('hs', String(Number(state.halftoneSize.toFixed(2))));
  if (state.halftoneSoftness !== hdef.softness) p.set('hsoft', String(Number(state.halftoneSoftness.toFixed(2))));
  if (state.halftoneGridNoise !== hdef.gridNoise) p.set('hgn', String(Number(state.halftoneGridNoise.toFixed(2))));
  if (state.halftoneContrast !== hdef.contrast) p.set('hc', String(Number(state.halftoneContrast.toFixed(2))));
  if (state.halftoneType !== hdef.type) p.set('ht', String(Math.max(0, HALFTONE_TYPE_MAP.indexOf(state.halftoneType))));
  if (state.halftoneFloodC !== hdef.floodC) p.set('hfc', String(Number(state.halftoneFloodC.toFixed(2))));
  if (state.halftoneGainC !== hdef.gainC) p.set('hgc', String(Number(state.halftoneGainC.toFixed(2))));
  if (state.halftoneGainY !== hdef.gainY) p.set('hgy', String(Number(state.halftoneGainY.toFixed(2))));
  const hbpSer = serializeHalftonePaperMode(state.halftonePaperMode);
  if (hbpSer) p.set('hbp', hbpSer);
  if (
    state.halftoneColorBack !== hdef.colorBack
    || state.halftoneColorC !== hdef.colorC
    || state.halftoneColorM !== hdef.colorM
    || state.halftoneColorY !== hdef.colorY
    || state.halftoneColorK !== hdef.colorK
  ) {
    p.set('hcols', packHexColors([
      state.halftoneColorBack,
      state.halftoneColorC,
      state.halftoneColorM,
      state.halftoneColorY,
      state.halftoneColorK,
    ]));
  }
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
 * menuHidden: hover-reveal sidebar vs always visible (from App.jsx).
 * patternFit + onPatternFitChange: optional controlled viewport (e.g. Fit/Fill in App.jsx nav); when set, sidebar Viewport block is omitted.
 */
export default function AppV2({
  menuHidden = false,
  viewTitle = 'Mosaic',
  patternFit: patternFitProp = IMAGE_RECTS_URL_DEFAULTS.patternFit,
  onPatternFitChange,
}) {
  const patternFitExternal = typeof onPatternFitChange === 'function';
  const [imageSource, setImageSource] = useState('');
  const [mediaTextureKind, setMediaTextureKind] = useState('staticImage');
  const [gridSize, setGridSize] = useState(IMAGE_RECTS_URL_DEFAULTS.gridSize);
  const [palette, setPalette] = useState(IMAGE_RECTS_URL_DEFAULTS.palette);
  const [bgShade, setBgShade] = useState(IMAGE_RECTS_URL_DEFAULTS.bgShade);
  const [bgColorMode, setBgColorMode] = useState(IMAGE_RECTS_URL_DEFAULTS.bgColorMode);
  const [bgCustomColor, setBgCustomColor] = useState(IMAGE_RECTS_URL_DEFAULTS.bgCustomColor);
  const [rectColorSource, setRectColorSource] = useState(IMAGE_RECTS_URL_DEFAULTS.rectColorSource);
  const [tileArtLevels, setTileArtLevels] = useState(IMAGE_RECTS_URL_DEFAULTS.tileArtLevels);
  const [tileArtThreshold, setTileArtThreshold] = useState(IMAGE_RECTS_URL_DEFAULTS.tileArtThreshold);
  const [tileArtDither, setTileArtDither] = useState(IMAGE_RECTS_URL_DEFAULTS.tileArtDither);
  const [tileArtColorMode, setTileArtColorMode] = useState(IMAGE_RECTS_URL_DEFAULTS.tileArtColorMode);
  const [tileArtGeom, setTileArtGeom] = useState(IMAGE_RECTS_URL_DEFAULTS.tileArtGeom);
  const [tileArtUniformGrid, setTileArtUniformGrid] = useState(IMAGE_RECTS_URL_DEFAULTS.tileArtUniformGrid);
  const [tileArtDensity, setTileArtDensity] = useState(IMAGE_RECTS_URL_DEFAULTS.tileArtDensity);
  const [tileArtRamp, setTileArtRamp] = useState(() => [...DEFAULT_TILE_ART_RAMP]);
  const [patternWarpShade, setPatternWarpShade] = useState(IMAGE_RECTS_URL_DEFAULTS.patternWarpShade);
  const [patternWeftShade, setPatternWeftShade] = useState(IMAGE_RECTS_URL_DEFAULTS.patternWeftShade);
  const [lumaSizeMix, setLumaSizeMix] = useState(IMAGE_RECTS_URL_DEFAULTS.lumaSizeMix);
  const [lumaSizeInvert, setLumaSizeInvert] = useState(IMAGE_RECTS_URL_DEFAULTS.lumaSizeInvert);
  const [lumaSizeFloor, setLumaSizeFloor] = useState(IMAGE_RECTS_URL_DEFAULTS.lumaSizeFloor);
  const [cellGeometryMode, setCellGeometryMode] = useState(IMAGE_RECTS_URL_DEFAULTS.cellGeometryMode);
  const [mosaicBgGaps, setMosaicBgGaps] = useState(IMAGE_RECTS_URL_DEFAULTS.mosaicBgGaps);
  const [patternFitInternal, setPatternFitInternal] = useState(IMAGE_RECTS_URL_DEFAULTS.patternFit);
  const [contentPadding, setContentPadding] = useState(IMAGE_RECTS_URL_DEFAULTS.contentPadding);
  const patternFit = patternFitExternal ? patternFitProp : patternFitInternal;
  const setPatternFit = patternFitExternal ? onPatternFitChange : setPatternFitInternal;
  const [stitchLumaMax, setStitchLumaMax] = useState(IMAGE_RECTS_URL_DEFAULTS.stitchLumaMax);
  const [stitchRevealMode, setStitchRevealMode] = useState(IMAGE_RECTS_URL_DEFAULTS.stitchRevealMode);
  const [stitchRevealDurationSec, setStitchRevealDurationSec] = useState(IMAGE_RECTS_URL_DEFAULTS.stitchRevealDurationSec);
  const [stitchRevealSeed, setStitchRevealSeed] = useState(IMAGE_RECTS_URL_DEFAULTS.stitchRevealSeed);
  const [stitchRevealScale, setStitchRevealScale] = useState(IMAGE_RECTS_URL_DEFAULTS.stitchRevealScale);
  const [stitchRevealNoiseScale, setStitchRevealNoiseScale] = useState(IMAGE_RECTS_URL_DEFAULTS.stitchRevealNoiseScale);
  const [stitchRevealSoftness, setStitchRevealSoftness] = useState(IMAGE_RECTS_URL_DEFAULTS.stitchRevealSoftness);
  const [stitchRevealBleedAnisotropy, setStitchRevealBleedAnisotropy] = useState(IMAGE_RECTS_URL_DEFAULTS.stitchRevealBleedAnisotropy);
  const [stitchRevealBleedRotation, setStitchRevealBleedRotation] = useState(IMAGE_RECTS_URL_DEFAULTS.stitchRevealBleedRotation);
  const [stitchRevealBleedCrossFiber, setStitchRevealBleedCrossFiber] = useState(IMAGE_RECTS_URL_DEFAULTS.stitchRevealBleedCrossFiber);
  const [stitchRevealBleedDraftCoupled, setStitchRevealBleedDraftCoupled] = useState(IMAGE_RECTS_URL_DEFAULTS.stitchRevealBleedDraftCoupled);
  const [stitchRevealProgress, setStitchRevealProgress] = useState(1);
  const [stitchRevealPlayToken, setStitchRevealPlayToken] = useState(0);
  const [quantizeSteps, setQuantizeSteps] = useState(IMAGE_RECTS_URL_DEFAULTS.quantizeSteps); // 0 = off, 2–32 = steps
  const [quantizeMode, setQuantizeMode] = useState(IMAGE_RECTS_URL_DEFAULTS.quantizeMode);
  const [quantizeGamma, setQuantizeGamma] = useState(IMAGE_RECTS_URL_DEFAULTS.quantizeGamma);
  const [quantizeDither, setQuantizeDither] = useState(IMAGE_RECTS_URL_DEFAULTS.quantizeDither);
  const rectShade = 1; // fixed
  /** Brand-mode palette shading: locked to image luma (Color). Warp/Weft/Warp+Weft UI disabled — see docs/FEATURES.md */
  const shadeFromLocked = 0;
  const [patternIndex, setPatternIndex] = useState(IMAGE_RECTS_URL_DEFAULTS.patternIndex); // weave pattern (same list as v1)
  const [rectRadius, setRectRadius] = useState(IMAGE_RECTS_URL_DEFAULTS.rectRadius); // corner radius in cell space (0 = sharp)
  const [rectAspect, setRectAspect] = useState(IMAGE_RECTS_URL_DEFAULTS.rectAspect); // rect width/height (e.g. 34/40)
  const [rectRatio, setRectRatio] = useState(IMAGE_RECTS_URL_DEFAULTS.rectRatio); // rect scale within cell (1 = full)
  /** Randomize: corner radius + stitch scale locked by default (same as Weave tab). */
  const [randomizeCornerRadius, setRandomizeCornerRadius] = useState(false);
  const [randomizeRectRatio, setRandomizeRectRatio] = useState(false);
  const [copyFormat, setCopyFormat] = useState(IMAGE_RECTS_URL_DEFAULTS.copyFormat); // 'png' | 'webp'
  const [copyScale, setCopyScale] = useState(IMAGE_RECTS_URL_DEFAULTS.copyScale); // 1 | 2 | 4 | 8 | 12
  const [mosaicHalftoneOn, setMosaicHalftoneOn] = useState(getInitialMosaicHalftoneOn);
  const [halftonePresetIndex, setHalftonePresetIndex] = useState(HALFTONE_DEFAULTS.presetIndex);
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
  const [halftonePaperMode, setHalftonePaperMode] = useState('cream');
  const [copyFeedback, setCopyFeedback] = useState(null);
  const [exportFeedback, setExportFeedback] = useState(null);
  const [configExportOpen, setConfigExportOpen] = useState(false);
  const copyFeedbackTimeoutRef = useRef(null);
  const exportFeedbackTimeoutRef = useRef(null);
  const stitchPlayRecordTimeoutRef = useRef(null);
  const canvasRef = useRef(null);
  const halftoneContainerRef = useRef(null);
  const halftoneCanvasRef = useRef(null);
  const imageRectsCaptureRef = useRef(null);            // { captureAtResolution(w, h) } when canvas ready
  const appliedUrlRef = useRef(false);
  /** Stash kad/kfe/kfa/kfb until `useKeyframePlayback` setters exist. */
  const keyframeUrlHydrateRef = useRef(null);
  const mosaicKeyframeSkipAfterSyncRef = useRef(false);
  const mosaicKeyframeStitchOverrideRef = useRef(false);

  const IMAGE_RECTS_DPR = 2; // matches useImageRectsSandbox DPR

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
    setHalftonePaperMode(
      halftonePaperModeFromValues(
        p.colorBack ?? HALFTONE_DEFAULTS.colorBack,
        p.floodC ?? HALFTONE_DEFAULTS.floodC,
        p.gridNoise ?? HALFTONE_DEFAULTS.gridNoise,
      ),
    );
  }, []);

  const selectHalftonePaper = useCallback((mode) => {
    if (mode !== 'cream' && mode !== 'white') return;
    applyHalftonePaperPreset(mode, {
      setHalftoneColorBack,
      setHalftoneFloodC,
      setHalftoneGridNoise,
    });
    setHalftonePaperMode(mode);
  }, []);

  const onHalftoneColorBackChange = useCallback((value) => {
    setHalftoneColorBack(value);
    setHalftonePaperMode('custom');
  }, []);

  const onHalftoneGridNoiseChange = useCallback((value) => {
    setHalftoneGridNoise(value);
    setHalftonePaperMode('custom');
  }, []);

  const onHalftoneFloodCChange = useCallback((value) => {
    setHalftoneFloodC(value);
    setHalftonePaperMode('custom');
  }, []);

  /** Visible capture target only — no fallback to an unmounted/offscreen canvas when halftone is on. */
  const activeCopyCanvas = useCallback(() => {
    if (mosaicHalftoneOn) return halftoneCanvasRef.current ?? null;
    return canvasRef.current;
  }, [mosaicHalftoneOn]);

  /** Capture mosaic canvas at scale× as PNG or WebP. Flat mosaic: re-renders at target res; halftone: 2D upscale. */
  const captureImageBlob = useCallback(async (scale, format) => {
    if (!imageSource) throw new Error('Pick media first');
    const canvas = activeCopyCanvas();
    if (!canvas?.width || !canvas?.height) {
      throw new Error(mosaicHalftoneOn ? 'Halftone still preparing…' : 'Image still loading…');
    }
    if (!mosaicHalftoneOn && imageRectsCaptureRef.current?.captureAtResolution) {
      const displayW = canvas.width / IMAGE_RECTS_DPR;
      const displayH = canvas.height / IMAGE_RECTS_DPR;
      const [w, h] = capToMaxDimension(Math.round(displayW * scale), Math.round(displayH * scale));
      const pngBlob = await imageRectsCaptureRef.current.captureAtResolution(w, h);
      if (!pngBlob) throw new Error('Image still loading…');
      const blob = await pngBlobToFormat(pngBlob, format);
      return { blob, w, h, prefix: 'mosaic' };
    }
    const [w, h] = capToMaxDimension(Math.round(canvas.width * scale), Math.round(canvas.height * scale));
    const blob = await scaleCanvasToBlob(canvas, w, h, format);
    return { blob, w, h, prefix: 'mosaic' };
  }, [mosaicHalftoneOn, activeCopyCanvas, imageSource]);

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

  /** Video recording (WebM or MP4). Mosaic: auto-starts when media becomes video (per tab — own hook instance). */
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
    recordingReason,
  } = useCanvasRecorder('shaderbox-image-rects');

  const startRecording = useCallback(() => {
    if (!imageSource) return;
    const canvas = activeCopyCanvas();
    if (!canvas?.width || !canvas?.height) return;
    if (!mosaicHalftoneOn && imageRectsCaptureRef.current?.isMediaReady && !imageRectsCaptureRef.current.isMediaReady()) {
      return;
    }
    recStart(canvas);
  }, [recStart, activeCopyCanvas, imageSource, mosaicHalftoneOn]);

  /** Shared stop helper: clear any stitch replay auto-stop timer before stopping recorder. */
  const stopRecordingWithCleanup = useCallback(async () => {
    if (stitchPlayRecordTimeoutRef.current != null) {
      clearTimeout(stitchPlayRecordTimeoutRef.current);
      stitchPlayRecordTimeoutRef.current = null;
    }
    await stopRecording();
  }, [stopRecording]);

  const mosaicSnapRef = useRef({});
  mosaicSnapRef.current = getMosaicKeyframeSnapshot({
    gridSize,
    palette,
    bgShade,
    bgColorMode,
    bgCustomColor,
    rectColorSource,
    tileArtLevels,
    tileArtThreshold,
    tileArtDither,
    tileArtColorMode,
    tileArtGeom,
    tileArtUniformGrid,
    tileArtDensity,
    tileArtRamp,
    patternWarpShade,
    patternWeftShade,
    lumaSizeMix,
    lumaSizeInvert,
    lumaSizeFloor,
    cellGeometryMode,
    mosaicBgGaps,
    stitchLumaMax,
    stitchRevealMode,
    stitchRevealProgress,
    stitchRevealSeed,
    stitchRevealScale,
    stitchRevealNoiseScale,
    stitchRevealSoftness,
    stitchRevealBleedAnisotropy,
    stitchRevealBleedRotation,
    stitchRevealBleedCrossFiber,
    stitchRevealBleedDraftCoupled,
    quantizeSteps,
    quantizeMode,
    quantizeGamma,
    quantizeDither,
    patternIndex,
    rectRadius,
    rectAspect,
    rectRatio,
    patternFit,
    contentPadding,
  });

  const configHandoffState = useMemo(() => ({
    ...getMosaicKeyframeSnapshot({
      gridSize,
      palette,
      bgShade,
      bgColorMode,
      bgCustomColor,
      rectColorSource,
      tileArtLevels,
      tileArtThreshold,
      tileArtDither,
      tileArtColorMode,
      tileArtGeom,
      tileArtUniformGrid,
      tileArtDensity,
      tileArtRamp,
      patternWarpShade,
      patternWeftShade,
      lumaSizeMix,
      lumaSizeInvert,
      lumaSizeFloor,
      cellGeometryMode,
      mosaicBgGaps,
      stitchLumaMax,
      stitchRevealMode,
      stitchRevealProgress,
      stitchRevealSeed,
      stitchRevealScale,
      stitchRevealNoiseScale,
      stitchRevealSoftness,
      stitchRevealBleedAnisotropy,
      stitchRevealBleedRotation,
      stitchRevealBleedCrossFiber,
      stitchRevealBleedDraftCoupled,
      quantizeSteps,
      quantizeMode,
      quantizeGamma,
      quantizeDither,
      patternIndex,
      rectRadius,
      rectAspect,
      rectRatio,
      patternFit,
      contentPadding,
    }),
    mosaicHalftoneOn,
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
    halftonePaperMode,
    copyFormat,
    copyScale,
    stitchRevealDurationSec,
    mediaTextureKind,
  }), [
    gridSize, palette, bgShade, bgColorMode, bgCustomColor, rectColorSource, tileArtLevels, tileArtThreshold,
    tileArtDither, tileArtColorMode, tileArtGeom, tileArtUniformGrid, tileArtDensity, tileArtRamp,
    patternWarpShade, patternWeftShade, lumaSizeMix, lumaSizeInvert, lumaSizeFloor, cellGeometryMode,
    mosaicBgGaps, stitchLumaMax, stitchRevealMode, stitchRevealProgress, stitchRevealSeed, stitchRevealScale,
    stitchRevealNoiseScale, stitchRevealSoftness, stitchRevealBleedAnisotropy, stitchRevealBleedRotation,
    stitchRevealBleedCrossFiber, stitchRevealBleedDraftCoupled, quantizeSteps, quantizeMode, quantizeGamma,
    quantizeDither, patternIndex, rectRadius, rectAspect, rectRatio, patternFit, contentPadding, mosaicHalftoneOn,
    halftonePresetIndex, halftoneSize, halftoneSoftness, halftoneGridNoise, halftoneContrast, halftoneType,
    halftoneColorBack, halftoneColorC, halftoneColorM, halftoneColorY, halftoneColorK, halftoneFloodC,
    halftoneGainC, halftoneGainY, halftonePaperMode, copyFormat, copyScale, stitchRevealDurationSec, mediaTextureKind,
  ]);

  const mosaicSettersRef = useRef({});
  mosaicSettersRef.current = {
    setGridSize,
    setPalette,
    setBgShade,
    setBgColorMode,
    setBgCustomColor,
    setRectColorSource,
    setTileArtLevels,
    setTileArtThreshold,
    setTileArtDither,
    setTileArtColorMode,
    setTileArtGeom,
    setTileArtUniformGrid,
    setTileArtDensity,
    setTileArtRamp,
    setPatternWarpShade,
    setPatternWeftShade,
    setLumaSizeMix,
    setLumaSizeInvert,
    setLumaSizeFloor,
    setCellGeometryMode,
    setMosaicBgGaps,
    setStitchLumaMax,
    setStitchRevealMode,
    setStitchRevealProgress,
    setStitchRevealSeed,
    setStitchRevealScale,
    setStitchRevealNoiseScale,
    setStitchRevealSoftness,
    setStitchRevealBleedAnisotropy,
    setStitchRevealBleedRotation,
    setStitchRevealBleedCrossFiber,
    setStitchRevealBleedDraftCoupled,
    setQuantizeSteps,
    setQuantizeMode,
    setQuantizeGamma,
    setQuantizeDither,
    setPatternIndex,
    setRectRadius,
    setRectAspect,
    setRectRatio,
    setPatternFit,
    setContentPadding,
  };

  const applyMosaicSnapshot = useCallback((snap) => {
    applyMosaicKeyframe(mosaicSettersRef.current, snap);
  }, []);

  const {
    editingAfter,
    setEditingAfter,
    before: mosaicBefore,
    after: mosaicAfter,
    setBefore: setMosaicBefore,
    setAfter: setMosaicAfter,
    durationSec: keyframeDurationSec,
    setDurationSec: setKeyframeDurationSec,
    isPlaying: keyframePlaying,
    syncBeforeFromLive: syncMosaicBeforeFromLive,
    syncAfterFromLive: syncMosaicAfterFromLive,
    play: playMosaicKeyframe,
    playAndRecord: playAndRecordMosaicKeyframe,
    stop: stopMosaicKeyframe,
  } = useKeyframePlayback({
    getBefore: () => ({ ...mosaicSnapRef.current }),
    getAfter: () => ({ ...mosaicSnapRef.current }),
    applySnapshot: applyMosaicSnapshot,
    defaultDurationSec: KEYFRAME_ANIM_DEFAULT_SEC,
  });

  const configHandoffAnimation = useMemo(
    () => ({
      keyframeTransportPlaying: keyframePlaying,
      stitchRevealMode,
      stitchRevealProgress,
    }),
    [keyframePlaying, stitchRevealMode, stitchRevealProgress],
  );

  useEffect(() => {
    const h = keyframeUrlHydrateRef.current;
    if (!h) return;
    keyframeUrlHydrateRef.current = null;
    if (h.duration != null && Number.isFinite(h.duration)) setKeyframeDurationSec(h.duration);
    if (typeof h.editingAfter === 'boolean') setEditingAfter(h.editingAfter);
    if (h.before != null) setMosaicBefore(h.before);
    if (h.after != null) {
      setMosaicAfter(h.after);
      mosaicKeyframeSkipAfterSyncRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount hydration only
  }, []);

  useEffect(() => {
    if (!editingAfter) return;
    if (mosaicKeyframeSkipAfterSyncRef.current) {
      mosaicKeyframeSkipAfterSyncRef.current = false;
      return;
    }
    setMosaicAfter({ ...mosaicSnapRef.current });
  }, [
    editingAfter,
    gridSize,
    palette,
    bgShade,
    bgColorMode,
    bgCustomColor,
    rectColorSource,
    tileArtLevels,
    tileArtThreshold,
    tileArtDither,
    tileArtColorMode,
    tileArtGeom,
    tileArtUniformGrid,
    tileArtDensity,
    tileArtRamp,
    patternWarpShade,
    patternWeftShade,
    lumaSizeMix,
    lumaSizeInvert,
    lumaSizeFloor,
    cellGeometryMode,
    mosaicBgGaps,
    stitchLumaMax,
    stitchRevealMode,
    stitchRevealProgress,
    stitchRevealSeed,
    stitchRevealScale,
    stitchRevealNoiseScale,
    stitchRevealSoftness,
    stitchRevealBleedAnisotropy,
    stitchRevealBleedRotation,
    stitchRevealBleedCrossFiber,
    stitchRevealBleedDraftCoupled,
    quantizeSteps,
    quantizeMode,
    quantizeGamma,
    quantizeDither,
    patternIndex,
    rectRadius,
    rectAspect,
    rectRatio,
    patternFit,
    contentPadding,
    setMosaicAfter,
  ]);

  useEffect(() => {
    if (!mosaicKeyframeStitchOverrideRef.current) return;
    if (!keyframePlaying) mosaicKeyframeStitchOverrideRef.current = false;
  }, [keyframePlaying]);

  const startMosaicKeyframePlay = useCallback(() => {
    mosaicKeyframeStitchOverrideRef.current = true;
    applyMosaicSnapshot(mosaicBefore);
    playMosaicKeyframe();
  }, [applyMosaicSnapshot, mosaicBefore, playMosaicKeyframe]);

  const startMosaicPlayAndRecord = useCallback(() => {
    if (stitchRevealMode > 0) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (stitchPlayRecordTimeoutRef.current != null) {
        clearTimeout(stitchPlayRecordTimeoutRef.current);
        stitchPlayRecordTimeoutRef.current = null;
      }
      mosaicKeyframeStitchOverrideRef.current = false;
      // Start from blank so the recorded clip visibly includes the stitch-in ramp.
      setStitchRevealProgress(0);
      recStart(canvas, { reason: 'manual' });
      requestAnimationFrame(() => {
        setStitchRevealPlayToken((t) => t + 1);
      });
      const durationMs = Math.max(0.25, stitchRevealDurationSec) * 1000;
      stitchPlayRecordTimeoutRef.current = setTimeout(() => {
        stitchPlayRecordTimeoutRef.current = null;
        void stopRecordingWithCleanup();
      }, durationMs + 250);
      return;
    }
    mosaicKeyframeStitchOverrideRef.current = true;
    applyMosaicSnapshot(mosaicBefore);
    playAndRecordMosaicKeyframe(recStart, stopRecordingWithCleanup, () => canvasRef.current);
  }, [
    applyMosaicSnapshot,
    mosaicBefore,
    playAndRecordMosaicKeyframe,
    recStart,
    stitchRevealMode,
    stitchRevealDurationSec,
    stopRecordingWithCleanup,
  ]);

  const replayStitchReveal = useCallback(() => {
    setStitchRevealPlayToken((t) => t + 1);
  }, []);

  /** Ramp stitch-in progress 0→1 when Noise/Bleed is on (replay, new media, or mode change). */
  useEffect(() => {
    if (mosaicKeyframeStitchOverrideRef.current) return undefined;
    if (stitchRevealMode === 0) {
      setStitchRevealProgress(1);
      return;
    }
    setStitchRevealProgress(0);
    const durationMs = Math.max(0.05, stitchRevealDurationSec) * 1000;
    const start = performance.now();
    let rafId = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      setStitchRevealProgress(t);
      if (t < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [stitchRevealMode, stitchRevealPlayToken, imageSource, stitchRevealDurationSec]);

  const prevMediaKindRef = useRef(mediaTextureKind);
  /** When switching from image/GIF to video (new file or inferred kind), start recording; stop when leaving video mode. */
  useEffect(() => {
    const prev = prevMediaKindRef.current;
    prevMediaKindRef.current = mediaTextureKind;
    if (mediaTextureKind !== 'video' || !imageSource) return;
    if (prev === 'video') return;
    let cancelled = false;
    let attempts = 0;
    const tryStart = () => {
      if (cancelled || attempts++ > 180) return;
      const c = mosaicHalftoneOn ? halftoneCanvasRef.current : canvasRef.current;
      if (!c?.width || !c?.height) {
        requestAnimationFrame(tryStart);
        return;
      }
      if (!mosaicHalftoneOn && imageRectsCaptureRef.current?.isMediaReady && !imageRectsCaptureRef.current.isMediaReady()) {
        requestAnimationFrame(tryStart);
        return;
      }
      recStart(c, { reason: 'auto' });
    };
    requestAnimationFrame(tryStart);
    return () => {
      cancelled = true;
    };
  }, [mediaTextureKind, imageSource, recStart, mosaicHalftoneOn]);

  useEffect(() => {
    if (mediaTextureKind === 'video') return;
    if (!isRecording) return;
    if (recordingReason !== 'auto') return;
    void stopRecordingWithCleanup();
  }, [mediaTextureKind, isRecording, recordingReason, stopRecordingWithCleanup]);

  useEffect(() => () => {
    if (stitchPlayRecordTimeoutRef.current != null) {
      clearTimeout(stitchPlayRecordTimeoutRef.current);
      stitchPlayRecordTimeoutRef.current = null;
    }
  }, []);

  const handleReload = useCallback(() => {
    window.location.reload();
  }, []);

  /** Randomize Image Rects params only (grid, palette, shades, pattern, quantize, rect shape). */
  const handleRandomize = useCallback(() => {
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
    const rand = (lo, hi) => lo + Math.random() * (hi - lo);
    setGridSize(pick(GRID_SNAPS));
    setPalette(randInt(0, 4));
    setBgShade(randInt(0, 4));
    setBgColorMode(0);
    setBgCustomColor(IMAGE_RECTS_URL_DEFAULTS.bgCustomColor);
    setRectColorSource(randInt(0, 3));
    setTileArtLevels(randInt(2, 8));
    setTileArtThreshold(Number(rand(0.35, 1).toFixed(2)));
    setTileArtDither(Number(rand(0, 0.4).toFixed(2)));
    setTileArtColorMode(randInt(0, 2));
    setTileArtGeom(randInt(0, 1));
    setTileArtUniformGrid(randInt(0, 1));
    setTileArtDensity(randInt(0, 1));
    setTileArtRamp(buildDefaultTileArtRamp());
    setPatternWarpShade(randInt(0, 4));
    setPatternWeftShade(randInt(0, 4));
    setLumaSizeMix(Number(rand(0, 1).toFixed(2)));
    setLumaSizeInvert(randInt(0, 1));
    setLumaSizeFloor(Number(rand(0.1, 0.95).toFixed(2)));
    setQuantizeSteps(randInt(0, 32));
    setQuantizeMode(randInt(0, 1));
    setQuantizeGamma(Number(rand(0.55, 1.65).toFixed(2)));
    setQuantizeDither(Number(rand(0, 0.85).toFixed(2)));
    setPatternIndex(randomEnabledPatternIndex());
    if (randomizeCornerRadius) setRectRadius(Number(rand(0.05, 0.45).toFixed(2)));
    setRectAspect(Number(rand(0.3, 1.5).toFixed(2)));
    if (randomizeRectRatio) setRectRatio(Number(rand(0.3, 1).toFixed(2)));
    setCellGeometryMode(randInt(0, 1));
    setStitchLumaMax(Number(rand(0.15, 0.75).toFixed(2)));
    setStitchRevealMode(randInt(0, 2));
    setStitchRevealDurationSec(Number(rand(1, 5).toFixed(1)));
    setStitchRevealSeed(Math.floor(Math.random() * 999999));
    setStitchRevealScale(Number(rand(0.05, 0.35).toFixed(2)));
    setStitchRevealNoiseScale(Number(rand(0.35, 2.5).toFixed(2)));
    setStitchRevealSoftness(Number(rand(0.03, 0.14).toFixed(2)));
    setStitchRevealBleedAnisotropy(Number(rand(1.5, 8).toFixed(1)));
    setStitchRevealBleedRotation(Number(rand(0, 1).toFixed(2)));
    setStitchRevealBleedCrossFiber(Number(rand(0, 0.6).toFixed(2)));
    setStitchRevealBleedDraftCoupled(randInt(0, 1));
  }, [randomizeCornerRadius, randomizeRectRatio]);

  /** Reset all Image Rects controls to defaults. */
  const handleReset = useCallback(() => {
    setGridSize(IMAGE_RECTS_URL_DEFAULTS.gridSize);
    setPalette(IMAGE_RECTS_URL_DEFAULTS.palette);
    setBgShade(IMAGE_RECTS_URL_DEFAULTS.bgShade);
    setBgColorMode(IMAGE_RECTS_URL_DEFAULTS.bgColorMode);
    setBgCustomColor(IMAGE_RECTS_URL_DEFAULTS.bgCustomColor);
    setRectColorSource(IMAGE_RECTS_URL_DEFAULTS.rectColorSource);
    setTileArtLevels(IMAGE_RECTS_URL_DEFAULTS.tileArtLevels);
    setTileArtThreshold(IMAGE_RECTS_URL_DEFAULTS.tileArtThreshold);
    setTileArtDither(IMAGE_RECTS_URL_DEFAULTS.tileArtDither);
    setTileArtColorMode(IMAGE_RECTS_URL_DEFAULTS.tileArtColorMode);
    setTileArtGeom(IMAGE_RECTS_URL_DEFAULTS.tileArtGeom);
    setTileArtUniformGrid(IMAGE_RECTS_URL_DEFAULTS.tileArtUniformGrid);
    setTileArtDensity(IMAGE_RECTS_URL_DEFAULTS.tileArtDensity);
    setTileArtRamp([...DEFAULT_TILE_ART_RAMP]);
    setPatternWarpShade(IMAGE_RECTS_URL_DEFAULTS.patternWarpShade);
    setPatternWeftShade(IMAGE_RECTS_URL_DEFAULTS.patternWeftShade);
    setLumaSizeMix(IMAGE_RECTS_URL_DEFAULTS.lumaSizeMix);
    setLumaSizeInvert(IMAGE_RECTS_URL_DEFAULTS.lumaSizeInvert);
    setLumaSizeFloor(IMAGE_RECTS_URL_DEFAULTS.lumaSizeFloor);
    setCellGeometryMode(IMAGE_RECTS_URL_DEFAULTS.cellGeometryMode);
    setMosaicBgGaps(IMAGE_RECTS_URL_DEFAULTS.mosaicBgGaps);
    setPatternFit(IMAGE_RECTS_URL_DEFAULTS.patternFit);
    setContentPadding(IMAGE_RECTS_URL_DEFAULTS.contentPadding);
    setStitchLumaMax(IMAGE_RECTS_URL_DEFAULTS.stitchLumaMax);
    setQuantizeSteps(IMAGE_RECTS_URL_DEFAULTS.quantizeSteps);
    setQuantizeMode(IMAGE_RECTS_URL_DEFAULTS.quantizeMode);
    setQuantizeGamma(IMAGE_RECTS_URL_DEFAULTS.quantizeGamma);
    setQuantizeDither(IMAGE_RECTS_URL_DEFAULTS.quantizeDither);
    setPatternIndex(IMAGE_RECTS_URL_DEFAULTS.patternIndex);
    setRectRadius(IMAGE_RECTS_URL_DEFAULTS.rectRadius);
    setRectAspect(IMAGE_RECTS_URL_DEFAULTS.rectAspect);
    setRectRatio(IMAGE_RECTS_URL_DEFAULTS.rectRatio);
    setCopyFormat(IMAGE_RECTS_URL_DEFAULTS.copyFormat);
    setCopyScale(IMAGE_RECTS_URL_DEFAULTS.copyScale);
    setStitchRevealMode(IMAGE_RECTS_URL_DEFAULTS.stitchRevealMode);
    setStitchRevealDurationSec(IMAGE_RECTS_URL_DEFAULTS.stitchRevealDurationSec);
    setStitchRevealSeed(IMAGE_RECTS_URL_DEFAULTS.stitchRevealSeed);
    setStitchRevealScale(IMAGE_RECTS_URL_DEFAULTS.stitchRevealScale);
    setStitchRevealNoiseScale(IMAGE_RECTS_URL_DEFAULTS.stitchRevealNoiseScale);
    setStitchRevealSoftness(IMAGE_RECTS_URL_DEFAULTS.stitchRevealSoftness);
    setStitchRevealBleedAnisotropy(IMAGE_RECTS_URL_DEFAULTS.stitchRevealBleedAnisotropy);
    setStitchRevealBleedRotation(IMAGE_RECTS_URL_DEFAULTS.stitchRevealBleedRotation);
    setStitchRevealBleedCrossFiber(IMAGE_RECTS_URL_DEFAULTS.stitchRevealBleedCrossFiber);
    setStitchRevealBleedDraftCoupled(IMAGE_RECTS_URL_DEFAULTS.stitchRevealBleedDraftCoupled);
    setMediaTextureKind('staticImage');
    setMosaicHalftoneOn(false);
    setHalftonePresetIndex(HALFTONE_DEFAULTS.presetIndex);
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
    setHalftonePaperMode('cream');
    setImageSource((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
  }, [setPatternFit]);

  /** On mount: parse URL and apply to state (once). */
  useEffect(() => {
    if (appliedUrlRef.current) return;
    appliedUrlRef.current = true;
    const q = parseUrlStateV2(window.location.search);
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
    if (q.gridSize != null) setGridSize(GRID_SNAPS.includes(q.gridSize) ? q.gridSize : GRID_SNAPS[getGridSizeIndex(q.gridSize)]);
    if (q.palette != null) setPalette(q.palette);
    if (q.bgShade != null) setBgShade(q.bgShade);
    if (q.bgColorMode != null) setBgColorMode(q.bgColorMode);
    if (q.bgCustomColor != null) setBgCustomColor(normalizeHexColor(q.bgCustomColor, IMAGE_RECTS_URL_DEFAULTS.bgCustomColor));
    if (q.rectColorSource != null) setRectColorSource(q.rectColorSource);
    if (q.tileArtLevels != null) setTileArtLevels(q.tileArtLevels);
    if (q.tileArtThreshold != null) setTileArtThreshold(q.tileArtThreshold);
    if (q.tileArtDither != null) setTileArtDither(q.tileArtDither);
    if (q.tileArtColorMode != null) setTileArtColorMode(q.tileArtColorMode);
    if (q.tileArtGeom != null) setTileArtGeom(q.tileArtGeom);
    if (q.tileArtUniformGrid != null) setTileArtUniformGrid(q.tileArtUniformGrid);
    if (q.tileArtDensity != null) setTileArtDensity(q.tileArtDensity);
    if (q.tileArtRamp != null) setTileArtRamp([...q.tileArtRamp]);
    if (q.patternWarpShade != null) setPatternWarpShade(q.patternWarpShade);
    if (q.patternWeftShade != null) setPatternWeftShade(q.patternWeftShade);
    if (q.lumaSizeMix != null) setLumaSizeMix(q.lumaSizeMix);
    if (q.lumaSizeInvert != null) setLumaSizeInvert(q.lumaSizeInvert);
    if (q.lumaSizeFloor != null) setLumaSizeFloor(q.lumaSizeFloor);
    if (q.cellGeometryMode != null) setCellGeometryMode(q.cellGeometryMode);
    if (q.stitchLumaMax != null) setStitchLumaMax(q.stitchLumaMax);
    if (q.quantizeSteps != null) setQuantizeSteps(q.quantizeSteps);
    if (q.quantizeMode != null) setQuantizeMode(q.quantizeMode);
    if (q.quantizeGamma != null) setQuantizeGamma(q.quantizeGamma);
    if (q.quantizeDither != null) setQuantizeDither(q.quantizeDither);
    if (q.patternIndex != null) setPatternIndex(q.patternIndex);
    if (q.rectRadius != null) setRectRadius(q.rectRadius);
    if (q.rectAspect != null) setRectAspect(q.rectAspect);
    if (q.rectRatio != null) setRectRatio(q.rectRatio);
    if (q.copyFormat != null) setCopyFormat(q.copyFormat);
    if (q.copyScale != null) setCopyScale(q.copyScale);
    if (q.mosaicBgGaps != null) setMosaicBgGaps(!!q.mosaicBgGaps);
    if (q.stitchRevealMode != null) setStitchRevealMode(q.stitchRevealMode);
    if (q.stitchRevealDurationSec != null) setStitchRevealDurationSec(q.stitchRevealDurationSec);
    if (q.stitchRevealSeed != null) setStitchRevealSeed(q.stitchRevealSeed);
    if (q.stitchRevealScale != null) setStitchRevealScale(q.stitchRevealScale);
    if (q.stitchRevealNoiseScale != null) setStitchRevealNoiseScale(q.stitchRevealNoiseScale);
    if (q.stitchRevealSoftness != null) setStitchRevealSoftness(q.stitchRevealSoftness);
    if (q.stitchRevealBleedAnisotropy != null) setStitchRevealBleedAnisotropy(q.stitchRevealBleedAnisotropy);
    if (q.stitchRevealBleedRotation != null) setStitchRevealBleedRotation(q.stitchRevealBleedRotation);
    if (q.stitchRevealBleedCrossFiber != null) setStitchRevealBleedCrossFiber(q.stitchRevealBleedCrossFiber);
    if (q.stitchRevealBleedDraftCoupled != null) setStitchRevealBleedDraftCoupled(q.stitchRevealBleedDraftCoupled);
    if (q.patternFit != null) {
      if (typeof onPatternFitChange === 'function') onPatternFitChange(q.patternFit);
      else setPatternFitInternal(q.patternFit);
    }
    if (q.contentPadding != null) setContentPadding(q.contentPadding);
    if (q.mosaicHalftoneOn != null) setMosaicHalftoneOn(!!q.mosaicHalftoneOn);
    if (q.halftonePaperMode === 'white') {
      selectHalftonePaper('white');
    }
    if (q.halftonePresetIndex != null) setHalftonePresetIndex(q.halftonePresetIndex);
    if (q.halftoneSize != null) setHalftoneSize(q.halftoneSize);
    if (q.halftoneSoftness != null) setHalftoneSoftness(q.halftoneSoftness);
    if (q.halftoneGridNoise != null) {
      setHalftoneGridNoise(q.halftoneGridNoise);
      setHalftonePaperMode('custom');
    }
    if (q.halftoneContrast != null) setHalftoneContrast(q.halftoneContrast);
    if (q.halftoneType != null) setHalftoneType(q.halftoneType);
    if (q.halftoneFloodC != null) {
      setHalftoneFloodC(q.halftoneFloodC);
      setHalftonePaperMode('custom');
    }
    if (q.halftoneGainC != null) setHalftoneGainC(q.halftoneGainC);
    if (q.halftoneGainY != null) setHalftoneGainY(q.halftoneGainY);
    if (q.halftoneColorBack != null) {
      setHalftoneColorBack(q.halftoneColorBack);
      setHalftonePaperMode('custom');
    }
    if (q.halftoneColorC != null) setHalftoneColorC(q.halftoneColorC);
    if (q.halftoneColorM != null) setHalftoneColorM(q.halftoneColorM);
    if (q.halftoneColorY != null) setHalftoneColorY(q.halftoneColorY);
    if (q.halftoneColorK != null) setHalftoneColorK(q.halftoneColorK);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on mount; onPatternFitChange is stable (setState)
  }, []);

  /** Sync state to URL (debounced). */
  const urlSyncTimeoutRef = useRef(null);
  useEffect(() => {
    urlSyncTimeoutRef.current = setTimeout(() => {
      const search = buildUrlStateV2({
        mosaicHalftoneOn,
        halftonePresetIndex, halftoneSize, halftoneSoftness, halftoneGridNoise, halftoneContrast, halftoneType,
        halftoneColorBack, halftoneColorC, halftoneColorM, halftoneColorY, halftoneColorK, halftoneFloodC, halftoneGainC, halftoneGainY,
        halftonePaperMode,
        gridSize, palette, bgShade, bgColorMode, bgCustomColor, rectColorSource, tileArtLevels, tileArtThreshold, tileArtDither, tileArtColorMode, tileArtGeom, tileArtUniformGrid, tileArtDensity, tileArtRamp,
        quantizeSteps, quantizeMode, quantizeGamma, quantizeDither, patternIndex,
        patternWarpShade, patternWeftShade, lumaSizeMix, lumaSizeInvert, lumaSizeFloor, cellGeometryMode, stitchLumaMax,
        rectRadius, rectAspect, rectRatio, copyFormat, copyScale, menuHidden, mosaicBgGaps, patternFit, contentPadding,
        stitchRevealMode, stitchRevealDurationSec, stitchRevealSeed, stitchRevealScale, stitchRevealNoiseScale, stitchRevealSoftness,
        stitchRevealBleedAnisotropy, stitchRevealBleedRotation, stitchRevealBleedCrossFiber, stitchRevealBleedDraftCoupled,
        keyframeAnimDurationSec: keyframeDurationSec,
        keyframeEditingAfter: editingAfter,
        keyframeSnapshotA: mosaicBefore,
        keyframeSnapshotB: mosaicAfter,
      });
      const url = search ? `${window.location.pathname}?${search}` : window.location.pathname;
      if (window.location.pathname + (window.location.search || '') !== url) {
        window.history.replaceState(null, '', url);
      }
    }, 400);
    return () => { clearTimeout(urlSyncTimeoutRef.current); };
  }, [mosaicHalftoneOn, halftonePresetIndex, halftoneSize, halftoneSoftness, halftoneGridNoise, halftoneContrast, halftoneType, halftoneColorBack, halftoneColorC, halftoneColorM, halftoneColorY, halftoneColorK, halftoneFloodC, halftoneGainC, halftoneGainY, halftonePaperMode, gridSize, palette, bgShade, bgColorMode, bgCustomColor, rectColorSource, tileArtLevels, tileArtThreshold, tileArtDither, tileArtColorMode, tileArtGeom, tileArtUniformGrid, tileArtDensity, tileArtRamp, quantizeSteps, quantizeMode, quantizeGamma, quantizeDither, patternIndex, patternWarpShade, patternWeftShade, lumaSizeMix, lumaSizeInvert, lumaSizeFloor, cellGeometryMode, stitchLumaMax, rectRadius, rectAspect, rectRatio, copyFormat, copyScale, menuHidden, mosaicBgGaps, patternFit, contentPadding, stitchRevealMode, stitchRevealDurationSec, stitchRevealSeed, stitchRevealScale, stitchRevealNoiseScale, stitchRevealSoftness, stitchRevealBleedAnisotropy, stitchRevealBleedRotation, stitchRevealBleedCrossFiber, stitchRevealBleedDraftCoupled, keyframeDurationSec, editingAfter, mosaicBefore, mosaicAfter]);

  /** Keyboard shortcuts: Mod+C copy, Mod+Shift+R / F5 reload (no presets in v2). */
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.target.closest('input, select, textarea')) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'c') {
        e.preventDefault();
        handleCopy();
        return;
      }
      if ((mod && e.shiftKey && e.key === 'R') || e.key === 'F5') {
        e.preventDefault();
        handleReload();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleCopy, handleReload]);

  const patternOptions = buildPatternSelectOptions(PATTERNS, patternIndex).map((o) => ({
    ...o,
    icon: WEAVE_ICONS[PATTERNS[o.value]?.id] ?? 'texture',
  }));
  const shadeOptions = (prefix) => SHADE_NAMES.map((name, i) => ({ value: i, label: prefix ? `${prefix}: ${name}` : name }));

  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMediaTextureKind(inferMediaTextureKindFromFile(file));
    setImageSource((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (imageSource) URL.revokeObjectURL(imageSource);
    };
  }, [imageSource]);

  /** In-flow: min-h-0 + h-full bounds the column so tall control stacks scroll inside the sidebar (flex default min-height:auto would grow past the shell). */
  /** Fixed overlay: `top-9` matches App shell nav (`min-h-9`); do not use `top-0` or the menu draws over the nav. */
  const sidebarClass = menuHidden
    ? 'fixed left-0 top-9 z-10 flex h-[calc(100dvh-2.25rem)] w-72 flex-col gap-3 overflow-y-auto overflow-x-auto border-r border-border-subtle bg-surface px-3 py-3'
    : 'flex h-full min-h-0 w-72 shrink-0 flex-col gap-3 overflow-y-auto overflow-x-auto overscroll-y-contain border-r border-border-subtle bg-surface px-3 py-3';

  return (
    <div className="flex h-full min-h-0 flex-row overflow-hidden bg-surface">
      <motion.aside
        className={sidebarClass}
        initial={false}
        animate={{ opacity: menuHidden ? 0 : 1 }}
        whileHover={menuHidden ? { opacity: 1 } : undefined}
        transition={{ duration: 0.2 }}
        aria-label="Mosaic menu"
      >
        <h1 className={`shrink-0 text-left ${typeBase} font-semibold tracking-[-0.01em] text-text`}>
          {viewTitle}
        </h1>
        <div className="flex flex-col gap-3">
          <div className={`${sidebarGroup} ${sidebarGroupSticky}`}>
            <div className={sidebarGroupTitle}>Resolution</div>
            <div className="flex flex-wrap items-center gap-2">
              <GroupIcon name="grid_on" title="Tile size (grid cells)" />
              <Label.Root className="sr-only" htmlFor="grid-slider-v2">Resolution</Label.Root>
              <SliderWithInput
                id="grid-slider-v2"
                value={gridSize}
                onValueChange={setGridSize}
                defaultValue={IMAGE_RECTS_URL_DEFAULTS.gridSize}
                onReset={() => setGridSize(IMAGE_RECTS_URL_DEFAULTS.gridSize)}
                min={8}
                max={256}
                step={1}
                snapValues={GRID_SNAPS}
                snapPointCount={GRID_SNAPS.length}
                aria-label="Tile size (grid cells)"
              />
            </div>
          </div>
          {!patternFitExternal && (
            <div className={`${sidebarGroup} ${sidebarGroupSticky}`}>
              <div className={sidebarGroupTitle}>Viewport</div>
              <div className="flex flex-wrap items-center gap-2">
                <GroupIcon name="fit_screen" title="Canvas size in stage" />
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
            </div>
          )}
          <div className={`${sidebarGroup} ${sidebarGroupSticky}`}>
            <div className={sidebarGroupTitle}>Canvas</div>
            <div className="flex flex-wrap items-center gap-2">
              <GroupIcon name="crop" title="Inset mosaic from canvas edges" />
              <Label.Root className="sr-only" htmlFor="content-padding-v2">Canvas padding</Label.Root>
              <SliderWithInput
                id="content-padding-v2"
                value={contentPadding}
                onValueChange={setContentPadding}
                defaultValue={IMAGE_RECTS_URL_DEFAULTS.contentPadding}
                onReset={() => setContentPadding(IMAGE_RECTS_URL_DEFAULTS.contentPadding)}
                min={0}
                max={0.45}
                step={0.01}
                format={(n) => `${Math.round(n * 100)}%`}
                parse={(s) => {
                  const t = String(s).trim().replace(/%$/, '');
                  if (t === '') return 0;
                  const n = Number(t);
                  if (!Number.isFinite(n)) return null;
                  return n > 1 ? n / 100 : n;
                }}
                aria-label="Background inset on each canvas edge (mosaic draws in the inner area)"
              />
            </div>
          </div>
          <div className={`${sidebarGroup} ${sidebarGroupSticky}`}>
            <div className={sidebarGroupTitle}>Actions</div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={btnGhost} onClick={handleReload} aria-label="Reload">
                <Icon name="refresh" className={iconMd} />
                <span>Reload</span>
              </button>
              <button type="button" className={btnGhost} onClick={handleRandomize} aria-label="Randomize parameters" title="Randomize grid, palette, shades, pattern, quantize, rect shape">
                <Icon name="shuffle" className={iconMd} />
                <span>Randomize</span>
              </button>
              <button type="button" className={btnGhost} onClick={handleReset} aria-label="Reset parameters to defaults" title="Reset Mosaic parameters to defaults">
                <Icon name="restart_alt" className={iconResetGlyphMd} />
                <span>Reset</span>
              </button>
              {!patternFitExternal ? <ThemeToggle /> : null}
              <label className={btnGhost + ' cursor-pointer'}>
                <Icon name="upload_file" className={iconMd} />
                <span>Pick media</span>
                <input
                  type="file"
                  accept="image/*,video/*,image/gif"
                  className="sr-only"
                  onChange={handleFileChange}
                  aria-label="Pick image, video, or GIF from desktop"
                />
              </label>
            </div>
          </div>
          <div className={sidebarGroup}>
            <div className="flex flex-wrap items-center gap-2">
              <GroupIcon name="lens_blur" title="Halftone output" />
              <span className={`${controlLabel} ${typeLabel}`}>Halftone</span>
              <SegmentedControl>
                <div className="flex h-full">
                  <SegmentedControlButton
                    active={!mosaicHalftoneOn}
                    aria-pressed={!mosaicHalftoneOn}
                    aria-label="Flat mosaic output"
                    onClick={() => setMosaicHalftoneOn(false)}
                  >
                    Off
                  </SegmentedControlButton>
                  <SegmentedControlButton
                    active={mosaicHalftoneOn}
                    aria-pressed={mosaicHalftoneOn}
                    aria-label="CMYK halftone over mosaic"
                    onClick={() => setMosaicHalftoneOn(true)}
                  >
                    On
                  </SegmentedControlButton>
                </div>
              </SegmentedControl>
            </div>
          </div>
          {mosaicHalftoneOn && (
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
                  <Label.Root className={typeLabel} htmlFor="mosaic-halftone-size">Size</Label.Root>
                  <SliderWithInput id="mosaic-halftone-size" aria-label="Grid size" value={halftoneSize} onValueChange={setHalftoneSize} defaultValue={HALFTONE_DEFAULTS.size} onReset={() => setHalftoneSize(HALFTONE_DEFAULTS.size)} min={0.01} max={1} step={0.01} format={(n) => n.toFixed(2)} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label.Root className={typeLabel} htmlFor="mosaic-halftone-softness">Softness</Label.Root>
                  <SliderWithInput id="mosaic-halftone-softness" aria-label="Dot softness" value={halftoneSoftness} onValueChange={setHalftoneSoftness} defaultValue={HALFTONE_DEFAULTS.softness} onReset={() => setHalftoneSoftness(HALFTONE_DEFAULTS.softness)} min={0} max={1} step={0.05} format={(n) => n.toFixed(2)} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label.Root className={typeLabel} htmlFor="mosaic-halftone-gridnoise">Grid noise</Label.Root>
                  <SliderWithInput id="mosaic-halftone-gridnoise" aria-label="Grid noise" value={halftoneGridNoise} onValueChange={onHalftoneGridNoiseChange} defaultValue={HALFTONE_DEFAULTS.gridNoise} onReset={() => { setHalftoneGridNoise(HALFTONE_DEFAULTS.gridNoise); setHalftonePaperMode('custom'); }} min={0} max={1} step={0.05} format={(n) => n.toFixed(2)} />
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
                  <Label.Root className={typeLabel} htmlFor="mosaic-halftone-contrast">Contrast</Label.Root>
                  <SliderWithInput id="mosaic-halftone-contrast" aria-label="Contrast" value={halftoneContrast} onValueChange={setHalftoneContrast} defaultValue={HALFTONE_DEFAULTS.contrast} onReset={() => setHalftoneContrast(HALFTONE_DEFAULTS.contrast)} min={0} max={2} step={0.05} format={(n) => n.toFixed(2)} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label.Root className={typeLabel} htmlFor="mosaic-halftone-floodc">Flood C</Label.Root>
                  <SliderWithInput id="mosaic-halftone-floodc" aria-label="Cyan flood" value={halftoneFloodC} onValueChange={onHalftoneFloodCChange} defaultValue={HALFTONE_DEFAULTS.floodC} onReset={() => { setHalftoneFloodC(HALFTONE_DEFAULTS.floodC); setHalftonePaperMode('custom'); }} min={0} max={1} step={0.05} format={(n) => n.toFixed(2)} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label.Root className={typeLabel} htmlFor="mosaic-halftone-gainc">Gain C</Label.Root>
                  <SliderWithInput id="mosaic-halftone-gainc" aria-label="Cyan gain" value={halftoneGainC} onValueChange={setHalftoneGainC} defaultValue={HALFTONE_DEFAULTS.gainC} onReset={() => setHalftoneGainC(HALFTONE_DEFAULTS.gainC)} min={-1} max={1} step={0.05} format={(n) => n.toFixed(2)} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label.Root className={typeLabel} htmlFor="mosaic-halftone-gainy">Gain Y</Label.Root>
                  <SliderWithInput id="mosaic-halftone-gainy" aria-label="Yellow gain" value={halftoneGainY} onValueChange={setHalftoneGainY} defaultValue={HALFTONE_DEFAULTS.gainY} onReset={() => setHalftoneGainY(HALFTONE_DEFAULTS.gainY)} min={-1} max={1} step={0.05} format={(n) => n.toFixed(2)} />
                </div>
              </div>
              <div className={sidebarGroup}>
                <div className={`${sidebarGroupTitle} inline-flex w-full items-center gap-1`}>
                  <Icon name="lens_blur" className={iconXs} />
                  <span className="flex-1">ink colors</span>
                  <IconButton
                    size="resetSm"
                    onClick={() => {
                      selectHalftonePaper('cream');
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
                <div className="mb-2 flex flex-col gap-1">
                  <Label.Root className={typeLabel}>Paper</Label.Root>
                  <SegmentedControl>
                    <div className="flex h-full">
                      <SegmentedControlButton
                        active={halftonePaperMode === 'cream'}
                        aria-pressed={halftonePaperMode === 'cream'}
                        aria-label="Cream paper"
                        onClick={() => selectHalftonePaper('cream')}
                      >
                        Cream
                      </SegmentedControlButton>
                      <SegmentedControlButton
                        active={halftonePaperMode === 'white'}
                        aria-pressed={halftonePaperMode === 'white'}
                        aria-label="White paper without specks"
                        onClick={() => selectHalftonePaper('white')}
                      >
                        White
                      </SegmentedControlButton>
                    </div>
                  </SegmentedControl>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: 'Back', value: halftoneColorBack, set: onHalftoneColorBackChange, default: HALFTONE_DEFAULTS.colorBack },
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
          <div className={sidebarGroup}>
            <div className={sidebarGroupTitle}>Weave & colorway</div>
            <div className="flex flex-wrap items-center gap-2">
              <GroupIcon name="tune" title="Mode" />
              <AppSelect
                id="rect-color-source-v2"
                labelText="Stitch color from"
                value={rectColorSource}
                onValueChange={(v) => setRectColorSource(Number(v))}
                defaultValue={IMAGE_RECTS_URL_DEFAULTS.rectColorSource}
                onReset={() => setRectColorSource(IMAGE_RECTS_URL_DEFAULTS.rectColorSource)}
                options={RECT_COLOR_SOURCE_OPTIONS}
                title="Brand palette, image RGB, warp/weft thread shades from the draft below, or tile-art weave ramp"
                placeholder="Color source"
              />
              {rectColorSource !== 3 && (
                <AppSelect
                  id="weave-pattern-v2"
                  labelText="Weave draft"
                  value={patternIndex}
                  onValueChange={(v) => setPatternIndex(Number(v))}
                  defaultValue={IMAGE_RECTS_URL_DEFAULTS.patternIndex}
                  onReset={() => setPatternIndex(IMAGE_RECTS_URL_DEFAULTS.patternIndex)}
                  options={patternOptions}
                  title="Weave draft: sets stitch orientation (and warp/weft thread colors when color source is Warp / weft)"
                  placeholder="Draft"
                />
              )}
              <div className="flex items-center gap-1" role="group" aria-label="Colorway palette">
                {PALETTE_SWATCH_COLORS.map((color, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`${paletteSwatch} ${palette === i ? paletteSwatchSelected : paletteSwatchUnselected}`}
                    style={{
                      backgroundColor: color,
                      borderColor: palette === i ? 'var(--color-accent)' : 'var(--color-border-subtle)',
                    }}
                    title={PALETTE_NAMES[i]}
                    aria-label={`Colorway: ${PALETTE_NAMES[i]}`}
                    aria-pressed={palette === i}
                    onClick={() => setPalette(i)}
                  />
                ))}
                {palette !== IMAGE_RECTS_URL_DEFAULTS.palette && (
                  <IconButton size="resetSm" onClick={() => setPalette(IMAGE_RECTS_URL_DEFAULTS.palette)} title="Reset palette" aria-label="Reset palette to default">
                    <Icon name="restart_alt" className={iconResetGlyph} />
                  </IconButton>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <AppSelect
                  id="bg-color-mode-v2"
                  labelText="Background source"
                  value={bgColorMode}
                  onValueChange={(v) => setBgColorMode(Number(v))}
                  defaultValue={IMAGE_RECTS_URL_DEFAULTS.bgColorMode}
                  onReset={() => setBgColorMode(IMAGE_RECTS_URL_DEFAULTS.bgColorMode)}
                  options={BG_COLOR_MODE_OPTIONS}
                  title="Use palette shade presets or a custom picked color"
                  placeholder="BG source"
                />
                {bgColorMode === 0 ? (
                  <AppSelect
                    id="bg-shade-v2"
                    labelText="Background shade"
                    value={bgShade}
                    onValueChange={(v) => setBgShade(Number(v))}
                    defaultValue={IMAGE_RECTS_URL_DEFAULTS.bgShade}
                    onReset={() => setBgShade(IMAGE_RECTS_URL_DEFAULTS.bgShade)}
                    options={shadeOptions('BG')}
                    title="Background shade preset from current palette"
                    placeholder="BG"
                  />
                ) : (
                  <label className={`inline-flex items-center gap-2 rounded border border-border-subtle bg-surface-input px-2 py-1 ${typeLabel}`}>
                    <span className="text-text-muted">BG color</span>
                    <input
                      type="color"
                      value={bgCustomColor}
                      onChange={(e) => setBgCustomColor(normalizeHexColor(e.target.value, IMAGE_RECTS_URL_DEFAULTS.bgCustomColor))}
                      className="h-7 w-10 cursor-pointer rounded border border-border-subtle bg-surface-input"
                      aria-label="Custom mosaic background color"
                    />
                  </label>
                )}
              </div>
              {(rectColorSource === 2 || rectColorSource === 3) && (
                <>
                  <AppSelect
                    id="pattern-warp-shade-v2"
                    labelText="Warp thread shade"
                    value={patternWarpShade}
                    onValueChange={(v) => setPatternWarpShade(Number(v))}
                    defaultValue={IMAGE_RECTS_URL_DEFAULTS.patternWarpShade}
                    onReset={() => setPatternWarpShade(IMAGE_RECTS_URL_DEFAULTS.patternWarpShade)}
                    options={shadeOptions('Warp')}
                    title="Palette shade for warp-oriented rects"
                    placeholder="Warp"
                  />
                  <AppSelect
                    id="pattern-weft-shade-v2"
                    labelText="Weft thread shade"
                    value={patternWeftShade}
                    onValueChange={(v) => setPatternWeftShade(Number(v))}
                    defaultValue={IMAGE_RECTS_URL_DEFAULTS.patternWeftShade}
                    onReset={() => setPatternWeftShade(IMAGE_RECTS_URL_DEFAULTS.patternWeftShade)}
                    options={shadeOptions('Weft')}
                    title="Palette shade for weft-oriented rects"
                    placeholder="Weft"
                  />
                </>
              )}
            </div>
          </div>
          {rectColorSource === 3 && (
            <div className={sidebarGroup}>
              <div className={sidebarGroupTitle}>Pattern ramp</div>
              <div className="flex flex-col gap-2">
                <AppTooltip content="Map each cell to a weave draft from your ramp — like tiled ASCII using warp/weft patterns.">
                  <div className="flex flex-wrap items-center gap-2">
                    <GroupIcon name="stairs" title="Tile art" />
                    <AppSelect
                      id="tile-art-color-mode-v2"
                      labelText="Tile color"
                      value={tileArtColorMode}
                      onValueChange={(v) => setTileArtColorMode(Number(v))}
                      defaultValue={IMAGE_RECTS_URL_DEFAULTS.tileArtColorMode}
                      onReset={() => setTileArtColorMode(IMAGE_RECTS_URL_DEFAULTS.tileArtColorMode)}
                      options={TILE_ART_COLOR_MODE_OPTIONS}
                      title="Mono/brand: warp vs weft shades; Tint: image color through weave"
                      placeholder="Color"
                    />
                  </div>
                </AppTooltip>
                <AppTooltip content="Flat fills each mini cell; Rounded draws warp/weft stitches like Weave.">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`${controlLabel} ${typeLabel}`} title="Tile geometry">Geometry</span>
                    <SegmentedControl>
                      <div className="flex h-full">
                        <SegmentedControlButton
                          active={tileArtGeom === 0}
                          aria-pressed={tileArtGeom === 0}
                          aria-label="Flat mini cells"
                          onClick={() => setTileArtGeom(0)}
                        >
                          Flat
                        </SegmentedControlButton>
                        <SegmentedControlButton
                          active={tileArtGeom === 1}
                          aria-pressed={tileArtGeom === 1}
                          aria-label="Rounded mini stitches"
                          onClick={() => setTileArtGeom(1)}
                        >
                          Rounded
                        </SegmentedControlButton>
                      </div>
                    </SegmentedControl>
                    {tileArtGeom !== IMAGE_RECTS_URL_DEFAULTS.tileArtGeom && (
                      <IconButton size="resetSm" onClick={() => setTileArtGeom(IMAGE_RECTS_URL_DEFAULTS.tileArtGeom)} title="Reset geometry to Rounded" aria-label="Reset tile geometry">
                        <Icon name="restart_alt" className={iconResetGlyph} />
                      </IconButton>
                    )}
                  </div>
                </AppTooltip>
                <AppTooltip content={`Uniform keeps every ramp band on a ${TILE_ART_UNIFORM_TILE_W}×${TILE_ART_UNIFORM_TILE_H} mini-cell grid; Pattern uses each weave's native repeat size (stitches shrink on busier drafts).`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`${controlLabel} ${typeLabel}`} title="Mini-cell grid">Mini cells</span>
                    <SegmentedControl>
                      <div className="flex h-full">
                        <SegmentedControlButton
                          active={tileArtUniformGrid === 1}
                          aria-pressed={tileArtUniformGrid === 1}
                          aria-label={`Uniform ${TILE_ART_UNIFORM_TILE_W} by ${TILE_ART_UNIFORM_TILE_H} mini cells`}
                          onClick={() => setTileArtUniformGrid(1)}
                        >
                          Uniform
                        </SegmentedControlButton>
                        <SegmentedControlButton
                          active={tileArtUniformGrid === 0}
                          aria-pressed={tileArtUniformGrid === 0}
                          aria-label="Pattern native repeat size"
                          onClick={() => setTileArtUniformGrid(0)}
                        >
                          Pattern
                        </SegmentedControlButton>
                      </div>
                    </SegmentedControl>
                    {tileArtUniformGrid !== IMAGE_RECTS_URL_DEFAULTS.tileArtUniformGrid && (
                      <IconButton size="resetSm" onClick={() => setTileArtUniformGrid(IMAGE_RECTS_URL_DEFAULTS.tileArtUniformGrid)} title="Reset mini cells to Uniform" aria-label="Reset tile uniform grid">
                        <Icon name="restart_alt" className={iconResetGlyph} />
                      </IconButton>
                    )}
                  </div>
                </AppTooltip>
                <AppTooltip content="Off = full weave in each macro cell. On = mini-stitches appear from local image brightness + dither (sparse→dense edges); warp/weft draft and colors unchanged.">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`${controlLabel} ${typeLabel}`} title="Per mini-cell visibility">Density</span>
                    <SegmentedControl>
                      <div className="flex h-full">
                        <SegmentedControlButton
                          active={tileArtDensity === 0}
                          aria-pressed={tileArtDensity === 0}
                          aria-label="Density off"
                          onClick={() => setTileArtDensity(0)}
                        >
                          Off
                        </SegmentedControlButton>
                        <SegmentedControlButton
                          active={tileArtDensity === 1}
                          aria-pressed={tileArtDensity === 1}
                          aria-label="Density on"
                          onClick={() => setTileArtDensity(1)}
                        >
                          On
                        </SegmentedControlButton>
                      </div>
                    </SegmentedControl>
                    {tileArtDensity !== IMAGE_RECTS_URL_DEFAULTS.tileArtDensity && (
                      <IconButton size="resetSm" onClick={() => setTileArtDensity(IMAGE_RECTS_URL_DEFAULTS.tileArtDensity)} title="Reset density to Off" aria-label="Reset tile density">
                        <Icon name="restart_alt" className={iconResetGlyph} />
                      </IconButton>
                    )}
                  </div>
                </AppTooltip>
                <div className="flex flex-col gap-1.5">
                  <span className={`${typeLabel} text-text-muted`}>Mini stitch shape</span>
                  <AppTooltip content="Corner radius of each mini stitch in sub-cell space (0 = sharp).">
                    <div className="flex flex-wrap items-center gap-2">
                      <GroupIcon
                        name="rounded_corner"
                        title="Corner radius"
                        locked={!randomizeCornerRadius}
                        onLockChange={() => setRandomizeCornerRadius((v) => !v)}
                      />
                      <Label.Root className="sr-only" htmlFor="tile-art-rect-radius-v2">Corner radius</Label.Root>
                      <SliderWithInput
                        id="tile-art-rect-radius-v2"
                        value={rectRadius}
                        onValueChange={setRectRadius}
                        defaultValue={IMAGE_RECTS_URL_DEFAULTS.rectRadius}
                        onReset={() => setRectRadius(IMAGE_RECTS_URL_DEFAULTS.rectRadius)}
                        min={0}
                        max={0.5}
                        step={0.01}
                        format={(n) => n.toFixed(2)}
                        aria-label="Tile art corner radius"
                      />
                    </div>
                  </AppTooltip>
                  <AppTooltip content="Width/height of mini stitches; warp = portrait, weft = landscape orientation.">
                    <div className="flex flex-wrap items-center gap-2">
                      <GroupIcon name="aspect_ratio" title="Stitch aspect" />
                      <Label.Root className="sr-only" htmlFor="tile-art-rect-aspect-v2">Stitch aspect</Label.Root>
                      <SliderWithInput
                        id="tile-art-rect-aspect-v2"
                        value={rectAspect}
                        onValueChange={setRectAspect}
                        defaultValue={IMAGE_RECTS_URL_DEFAULTS.rectAspect}
                        onReset={() => setRectAspect(IMAGE_RECTS_URL_DEFAULTS.rectAspect)}
                        min={0.2}
                        max={2}
                        step={0.05}
                        format={(n) => n.toFixed(2)}
                        aria-label="Tile art stitch aspect"
                      />
                    </div>
                  </AppTooltip>
                  <AppTooltip content="Scale of each mini stitch inside its sub-cell (1 = full cell).">
                    <div className="flex flex-wrap items-center gap-2">
                      <GroupIcon
                        name="unfold_more"
                        title="Stitch scale"
                        locked={!randomizeRectRatio}
                        onLockChange={() => setRandomizeRectRatio((v) => !v)}
                      />
                      <Label.Root className="sr-only" htmlFor="tile-art-rect-ratio-v2">Stitch scale</Label.Root>
                      <SliderWithInput
                        id="tile-art-rect-ratio-v2"
                        value={rectRatio}
                        onValueChange={setRectRatio}
                        defaultValue={IMAGE_RECTS_URL_DEFAULTS.rectRatio}
                        onReset={() => setRectRatio(IMAGE_RECTS_URL_DEFAULTS.rectRatio)}
                        min={0.2}
                        max={1}
                        step={0.05}
                        format={(n) => n.toFixed(2)}
                        aria-label="Tile art stitch scale"
                      />
                    </div>
                  </AppTooltip>
                </div>
                <AppTooltip content="How many luma bands (max 8). More bands = finer steps between ramp patterns.">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label.Root className="sr-only" htmlFor="tile-art-levels-v2">Levels</Label.Root>
                    <SliderWithInput
                      id="tile-art-levels-v2"
                      value={tileArtLevels}
                      onValueChange={setTileArtLevels}
                      defaultValue={IMAGE_RECTS_URL_DEFAULTS.tileArtLevels}
                      onReset={() => setTileArtLevels(IMAGE_RECTS_URL_DEFAULTS.tileArtLevels)}
                      min={2}
                      max={8}
                      step={1}
                      aria-label="Tile art luma bands"
                    />
                  </div>
                </AppTooltip>
                <AppTooltip content="Bright cells stay empty background. Lower = more weave cells (full carpet at 100%).">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label.Root className="sr-only" htmlFor="tile-art-threshold-v2">Threshold</Label.Root>
                    <SliderWithInput
                      id="tile-art-threshold-v2"
                      value={tileArtThreshold}
                      onValueChange={setTileArtThreshold}
                      defaultValue={IMAGE_RECTS_URL_DEFAULTS.tileArtThreshold}
                      onReset={() => setTileArtThreshold(IMAGE_RECTS_URL_DEFAULTS.tileArtThreshold)}
                      min={0}
                      max={1}
                      step={0.01}
                      format={(n) => n.toFixed(2)}
                      aria-label="Tile art brightness threshold"
                    />
                  </div>
                </AppTooltip>
                <AppTooltip content={tileArtDensity === 1 ? 'Jitter mini-cell density edges (grainy dissolve). With Density off, jitters macro luma bands instead.' : 'Jitter macro luma band edges. Turn Density on to use dither on mini-cell visibility instead.'}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Label.Root className="sr-only" htmlFor="tile-art-dither-v2">Dither</Label.Root>
                    <SliderWithInput
                      id="tile-art-dither-v2"
                      value={tileArtDither}
                      onValueChange={setTileArtDither}
                      defaultValue={IMAGE_RECTS_URL_DEFAULTS.tileArtDither}
                      onReset={() => setTileArtDither(IMAGE_RECTS_URL_DEFAULTS.tileArtDither)}
                      min={0}
                      max={1}
                      step={0.01}
                      format={(n) => n.toFixed(2)}
                      aria-label="Tile art band dither"
                    />
                  </div>
                </AppTooltip>
                <AppTooltip content="Restore complexity-based pattern order (simple → busy) and default weave picks.">
                  <button
                    type="button"
                    className={btnGhost}
                    onClick={() => setTileArtRamp([...buildDefaultTileArtRamp()])}
                  >
                    <Icon name="restart_alt" className={iconSm} />
                    <span className={typeLabel}>Reset ramp</span>
                  </button>
                </AppTooltip>
                <div className="flex flex-col gap-1.5">
                  {Array.from({ length: TILE_ART_SLOT_COUNT }, (_, slot) => (
                    <AppTooltip
                      key={slot}
                      content={`Weave for luma band ${slot + 1} (${slot === 0 ? 'darkest' : slot === TILE_ART_SLOT_COUNT - 1 ? 'lightest' : 'mid'}). Reorder to change shadow vs highlight patterns.`}
                    >
                      <div className="flex flex-nowrap items-center gap-1">
                        <span className={`${controlLabel} ${typeLabel} w-6 shrink-0 tabular-nums`}>{slot + 1}</span>
                        <IconButton
                          size="resetSm"
                          onClick={() => setTileArtRamp(moveRampSlot(tileArtRamp, slot, -1))}
                          disabled={slot === 0}
                          title="Move band earlier (darker)"
                          aria-label={`Move band ${slot + 1} toward darker`}
                        >
                          <Icon name="arrow_upward" className={iconXs} />
                        </IconButton>
                        <IconButton
                          size="resetSm"
                          onClick={() => setTileArtRamp(moveRampSlot(tileArtRamp, slot, 1))}
                          disabled={slot === TILE_ART_SLOT_COUNT - 1}
                          title="Move band later (lighter)"
                          aria-label={`Move band ${slot + 1} toward lighter`}
                        >
                          <Icon name="arrow_downward" className={iconXs} />
                        </IconButton>
                        <div className="min-w-0 flex-1">
                          <AppSelect
                            id={`tile-art-ramp-slot-${slot}`}
                            labelText={`Band ${slot + 1}`}
                            value={tileArtRamp[slot] ?? 0}
                            onValueChange={(v) => {
                              const next = [...tileArtRamp];
                              next[slot] = Number(v);
                              setTileArtRamp(next);
                            }}
                            options={patternOptions}
                            title={`Pattern for band ${slot + 1}`}
                            placeholder="Weave"
                          />
                        </div>
                      </div>
                    </AppTooltip>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className={sidebarGroup}>
            <div className={sidebarGroupTitle}>Quantize</div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <GroupIcon name="gradient" title="Quantize" />
                <Label.Root className="sr-only" htmlFor="quantize-slider-v2">Quantize steps</Label.Root>
                <SliderWithInput
                  id="quantize-slider-v2"
                  value={quantizeSteps}
                  onValueChange={setQuantizeSteps}
                  defaultValue={IMAGE_RECTS_URL_DEFAULTS.quantizeSteps}
                  onReset={() => setQuantizeSteps(IMAGE_RECTS_URL_DEFAULTS.quantizeSteps)}
                  min={0}
                  max={32}
                  step={1}
                  format={(n) => (n === 0 ? 'off' : String(n))}
                  parse={(s) => { if (s === 'off' || s === '') return 0; const n = Number(s); return Number.isFinite(n) ? n : null; }}
                  aria-label="Quantize steps (0 = off)"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <AppSelect
                  id="quantize-mode-v2"
                  labelText="Quantize in color space"
                  value={quantizeMode}
                  onValueChange={(v) => setQuantizeMode(Number(v))}
                  defaultValue={IMAGE_RECTS_URL_DEFAULTS.quantizeMode}
                  onReset={() => setQuantizeMode(IMAGE_RECTS_URL_DEFAULTS.quantizeMode)}
                  options={QUANTIZE_MODE_OPTIONS}
                  title="Band colors in RGB (per channel) or HSV (posterize hue/sat/value)"
                  placeholder="Space"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <GroupIcon name="contrast" title="Gamma before banding" />
                <Label.Root className="sr-only" htmlFor="quantize-gamma-v2">Quantize gamma</Label.Root>
                <SliderWithInput
                  id="quantize-gamma-v2"
                  value={quantizeGamma}
                  onValueChange={setQuantizeGamma}
                  defaultValue={IMAGE_RECTS_URL_DEFAULTS.quantizeGamma}
                  onReset={() => setQuantizeGamma(IMAGE_RECTS_URL_DEFAULTS.quantizeGamma)}
                  min={0.25}
                  max={4}
                  step={0.05}
                  format={(n) => n.toFixed(2)}
                  aria-label="Gamma curve before quantize (1 = neutral)"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <GroupIcon name="blur_linear" title="Dither" />
                <Label.Root className="sr-only" htmlFor="quantize-dither-v2">Quantize dither</Label.Root>
                <SliderWithInput
                  id="quantize-dither-v2"
                  value={quantizeDither}
                  onValueChange={setQuantizeDither}
                  defaultValue={IMAGE_RECTS_URL_DEFAULTS.quantizeDither}
                  onReset={() => setQuantizeDither(IMAGE_RECTS_URL_DEFAULTS.quantizeDither)}
                  min={0}
                  max={1}
                  step={0.05}
                  format={(n) => n.toFixed(2)}
                  aria-label="Per-cell dither before rounding (0 = off)"
                />
              </div>
            </div>
          </div>
          <div className={sidebarGroup}>
            <div className={sidebarGroupTitle}>Brightness & stitches</div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1.5">
                <span className={`${typeLabel} text-text-muted`}>Size from brightness (per cell)</span>
                <div className="flex flex-wrap items-center gap-2">
                  <GroupIcon name="brightness_6" title="Luma drives size" />
                  <Label.Root className="sr-only" htmlFor="luma-size-mix-v2">Brightness size mix</Label.Root>
                  <SliderWithInput
                    id="luma-size-mix-v2"
                    value={lumaSizeMix}
                    onValueChange={setLumaSizeMix}
                    defaultValue={IMAGE_RECTS_URL_DEFAULTS.lumaSizeMix}
                    onReset={() => setLumaSizeMix(IMAGE_RECTS_URL_DEFAULTS.lumaSizeMix)}
                    min={0}
                    max={1}
                    step={0.05}
                    format={(n) => n.toFixed(2)}
                    aria-label="How much image brightness scales each rect (0 = off)"
                  />
                </div>
                <AppSelect
                  id="luma-size-invert-v2"
                  labelText="Bright vs dark smaller"
                  value={lumaSizeInvert}
                  onValueChange={(v) => setLumaSizeInvert(Number(v))}
                  defaultValue={IMAGE_RECTS_URL_DEFAULTS.lumaSizeInvert}
                  onReset={() => setLumaSizeInvert(IMAGE_RECTS_URL_DEFAULTS.lumaSizeInvert)}
                  options={[
                    { value: 0, label: 'Dark smaller' },
                    { value: 1, label: 'Bright smaller' },
                  ]}
                  title="Which end of brightness maps to smaller rects"
                  placeholder="Polarity"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Label.Root className="sr-only" htmlFor="luma-size-floor-v2">Min rect scale</Label.Root>
                  <SliderWithInput
                    id="luma-size-floor-v2"
                    value={lumaSizeFloor}
                    onValueChange={setLumaSizeFloor}
                    defaultValue={IMAGE_RECTS_URL_DEFAULTS.lumaSizeFloor}
                    onReset={() => setLumaSizeFloor(IMAGE_RECTS_URL_DEFAULTS.lumaSizeFloor)}
                    min={0.05}
                    max={1}
                    step={0.05}
                    format={(n) => n.toFixed(2)}
                    aria-label="Smallest rect scale vs base (at dark or bright end)"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5 border-t border-border-subtle pt-2">
                <span className={`${typeLabel} text-text-muted`}>Stitch vs plain (by image darkness)</span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={`${toggleBtn} ${mosaicBgGaps ? toggleBtnActive : ''}`}
                    aria-pressed={mosaicBgGaps}
                    aria-label="Background gaps: show canvas between dark stitch cells"
                    title="Non-stitch cells show background (legacy v5)"
                    onClick={() => {
                      setMosaicBgGaps((g) => {
                        const next = !g;
                        if (next) setCellGeometryMode(1);
                        else setCellGeometryMode(IMAGE_RECTS_URL_DEFAULTS.cellGeometryMode);
                        return next;
                      });
                    }}
                  >
                    <Icon name="grid_4x4" className={iconSm} />
                    <span className={typeLabel}>Background gaps</span>
                  </button>
                </div>
                {cellGeometryMode === 1 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <GroupIcon name="texture" title="Stitch darkness cutoff" />
                    <Label.Root className="sr-only" htmlFor="stitch-luma-max-v2">Max brightness for stitches</Label.Root>
                    <SliderWithInput
                      id="stitch-luma-max-v2"
                      value={stitchLumaMax}
                      onValueChange={setStitchLumaMax}
                      defaultValue={IMAGE_RECTS_URL_DEFAULTS.stitchLumaMax}
                      onReset={() => setStitchLumaMax(IMAGE_RECTS_URL_DEFAULTS.stitchLumaMax)}
                      min={0}
                      max={1}
                      step={0.02}
                      format={(n) => n.toFixed(2)}
                      aria-label="Weave stitch only if cell luma is at or below this (plain tile if brighter)"
                    />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1.5 border-t border-border-subtle pt-2">
                <span className={`${typeLabel} text-text-muted`}>Stitch-in (from blank)</span>
                <AppSelect
                  id="stitch-reveal-mode-v2"
                  labelText="Reveal order"
                  value={stitchRevealMode}
                  onValueChange={(v) => setStitchRevealMode(Number(v))}
                  defaultValue={IMAGE_RECTS_URL_DEFAULTS.stitchRevealMode}
                  onReset={() => setStitchRevealMode(IMAGE_RECTS_URL_DEFAULTS.stitchRevealMode)}
                  options={STITCH_REVEAL_MODE_OPTIONS}
                  title="Off: full mosaic immediately. Noise: FBM order. Bleed: streaks along fibers (like weave dye bleed)."
                  placeholder="Stitch-in"
                />
                {stitchRevealMode > 0 && (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Label.Root className="sr-only" htmlFor="stitch-reveal-dur-v2">Reveal duration</Label.Root>
                      <SliderWithInput
                        id="stitch-reveal-dur-v2"
                        value={stitchRevealDurationSec}
                        onValueChange={setStitchRevealDurationSec}
                        defaultValue={IMAGE_RECTS_URL_DEFAULTS.stitchRevealDurationSec}
                        onReset={() => setStitchRevealDurationSec(IMAGE_RECTS_URL_DEFAULTS.stitchRevealDurationSec)}
                        min={0.25}
                        max={12}
                        step={0.25}
                        format={(n) => `${n.toFixed(2)}s`}
                        aria-label="Stitch-in duration in seconds"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" className={btnGhost} onClick={replayStitchReveal} aria-label="Replay stitch-in animation" title="Replay from blank">
                        <Icon name="replay" className={iconMd} />
                        <span>Replay</span>
                      </button>
                      <button
                        type="button"
                        className={btnGhost}
                        onClick={() => {
                          setStitchRevealSeed(Math.floor(Math.random() * 999999));
                          replayStitchReveal();
                        }}
                        aria-label="New random seed and replay"
                        title="New seed"
                      >
                        <Icon name="shuffle" className={iconMd} />
                        <span>New seed</span>
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <GroupIcon name="blur_on" title="Spatial scale for reveal pattern" />
                      <Label.Root className="sr-only" htmlFor="stitch-reveal-scale-v2">Reveal pattern scale</Label.Root>
                      <SliderWithInput
                        id="stitch-reveal-scale-v2"
                        value={stitchRevealScale}
                        onValueChange={setStitchRevealScale}
                        defaultValue={IMAGE_RECTS_URL_DEFAULTS.stitchRevealScale}
                        onReset={() => setStitchRevealScale(IMAGE_RECTS_URL_DEFAULTS.stitchRevealScale)}
                        min={0.02}
                        max={0.5}
                        step={0.01}
                        format={(n) => n.toFixed(2)}
                        aria-label="Noise / bleed pattern scale on the grid"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <GroupIcon name="tune" title="FBM detail / frequency for stitch-in noise and bleed" />
                      <Label.Root className="sr-only" htmlFor="stitch-reveal-noise-scale-v2">Reveal noise scale</Label.Root>
                      <SliderWithInput
                        id="stitch-reveal-noise-scale-v2"
                        value={stitchRevealNoiseScale}
                        onValueChange={setStitchRevealNoiseScale}
                        defaultValue={IMAGE_RECTS_URL_DEFAULTS.stitchRevealNoiseScale}
                        onReset={() => setStitchRevealNoiseScale(IMAGE_RECTS_URL_DEFAULTS.stitchRevealNoiseScale)}
                        min={0.25}
                        max={4}
                        step={0.05}
                        format={(n) => n.toFixed(2)}
                        aria-label="Stitch-in FBM frequency multiplier"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <GroupIcon name="gradient" title="Edge softness between revealed and not yet" />
                      <Label.Root className="sr-only" htmlFor="stitch-reveal-soft-v2">Reveal softness</Label.Root>
                      <SliderWithInput
                        id="stitch-reveal-soft-v2"
                        value={stitchRevealSoftness}
                        onValueChange={setStitchRevealSoftness}
                        defaultValue={IMAGE_RECTS_URL_DEFAULTS.stitchRevealSoftness}
                        onReset={() => setStitchRevealSoftness(IMAGE_RECTS_URL_DEFAULTS.stitchRevealSoftness)}
                        min={0.01}
                        max={0.25}
                        step={0.005}
                        format={(n) => n.toFixed(3)}
                        aria-label="Softness of the stitch-in ramp per cell"
                      />
                    </div>
                    {stitchRevealMode === 2 && (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <GroupIcon name="texture" title="Bleed streak length" />
                          <Label.Root className="sr-only" htmlFor="stitch-reveal-bleed-ani-v2">Bleed anisotropy</Label.Root>
                          <SliderWithInput
                            id="stitch-reveal-bleed-ani-v2"
                            value={stitchRevealBleedAnisotropy}
                            onValueChange={setStitchRevealBleedAnisotropy}
                            defaultValue={IMAGE_RECTS_URL_DEFAULTS.stitchRevealBleedAnisotropy}
                            onReset={() => setStitchRevealBleedAnisotropy(IMAGE_RECTS_URL_DEFAULTS.stitchRevealBleedAnisotropy)}
                            min={0.5}
                            max={12}
                            step={0.25}
                            format={(n) => n.toFixed(2)}
                            aria-label="Bleed streak anisotropy"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <GroupIcon name="rotate_right" title="Bleed direction" />
                          <Label.Root className="sr-only" htmlFor="stitch-reveal-bleed-rot-v2">Bleed rotation</Label.Root>
                          <SliderWithInput
                            id="stitch-reveal-bleed-rot-v2"
                            value={stitchRevealBleedRotation}
                            onValueChange={setStitchRevealBleedRotation}
                            defaultValue={IMAGE_RECTS_URL_DEFAULTS.stitchRevealBleedRotation}
                            onReset={() => setStitchRevealBleedRotation(IMAGE_RECTS_URL_DEFAULTS.stitchRevealBleedRotation)}
                            min={0}
                            max={1}
                            step={0.005}
                            format={(n) => n.toFixed(2)}
                            aria-label="Rotation of bleed streaks (turns)"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <GroupIcon name="blur_linear" title="Mix isotropic noise into bleed" />
                          <Label.Root className="sr-only" htmlFor="stitch-reveal-bleed-xf-v2">Cross-fiber mix</Label.Root>
                          <SliderWithInput
                            id="stitch-reveal-bleed-xf-v2"
                            value={stitchRevealBleedCrossFiber}
                            onValueChange={setStitchRevealBleedCrossFiber}
                            defaultValue={IMAGE_RECTS_URL_DEFAULTS.stitchRevealBleedCrossFiber}
                            onReset={() => setStitchRevealBleedCrossFiber(IMAGE_RECTS_URL_DEFAULTS.stitchRevealBleedCrossFiber)}
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
                            className={`${toggleBtn} ${stitchRevealBleedDraftCoupled ? toggleBtnActive : ''}`}
                            aria-pressed={!!stitchRevealBleedDraftCoupled}
                            aria-label="Draft-coupled bleed: streaks follow warp vs weft"
                            title="When on, horizontal vs vertical streak blend follows the weave draft"
                            onClick={() => setStitchRevealBleedDraftCoupled((v) => (v ? 0 : 1))}
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
          </div>
        </div>
      </motion.aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <main className={`flex min-h-0 flex-1 flex-col overflow-hidden p-4${mosaicHalftoneOn ? ' items-stretch' : ''}`}>
          {mosaicHalftoneOn ? (
            <Suspense fallback={<div className="flex flex-1 items-center justify-center text-text-secondary">Loading…</div>}>
              <div className="flex min-h-0 flex-1 w-full flex-col">
                <ImageRectsHalftoneStage
                  imageSource={imageSource}
                  mediaTextureKind={mediaTextureKind}
                  gridSize={gridSize}
                  palette={palette}
                  bgShade={bgShade}
                  bgColorMode={bgColorMode}
                  bgCustomColor={bgCustomColor}
                  rectColorSource={rectColorSource}
                  quantizeSteps={quantizeSteps}
                  quantizeMode={quantizeMode}
                  quantizeGamma={quantizeGamma}
                  quantizeDither={quantizeDither}
                  rectShade={rectShade}
                  shadeFrom={shadeFromLocked}
                  patternWarpShade={patternWarpShade}
                  patternWeftShade={patternWeftShade}
                  patternIndex={patternIndex}
                  patterns={PATTERNS}
                  rectRadius={rectRadius}
                  rectAspect={rectAspect}
                  rectRatio={rectRatio}
                  lumaSizeMix={lumaSizeMix}
                  lumaSizeInvert={lumaSizeInvert}
                  lumaSizeFloor={lumaSizeFloor}
                  cellGeometryMode={cellGeometryMode}
                  stitchLumaMax={stitchLumaMax}
                  nonStitchShowsBg={mosaicBgGaps}
                  contentPadding={contentPadding}
                  stitchRevealMode={stitchRevealMode}
                  stitchRevealProgress={stitchRevealProgress}
                  stitchRevealSeed={stitchRevealSeed}
                  stitchRevealScale={stitchRevealScale}
                  stitchRevealNoiseScale={stitchRevealNoiseScale}
                  stitchRevealSoftness={stitchRevealSoftness}
                  stitchRevealBleedAnisotropy={stitchRevealBleedAnisotropy}
                  stitchRevealBleedRotation={stitchRevealBleedRotation}
                  stitchRevealBleedCrossFiber={stitchRevealBleedCrossFiber}
                  stitchRevealBleedDraftCoupled={stitchRevealBleedDraftCoupled}
                  tileArtLevels={tileArtLevels}
                  tileArtThreshold={tileArtThreshold}
                  tileArtDither={tileArtDither}
                  tileArtColorMode={tileArtColorMode}
                  tileArtGeom={tileArtGeom}
                  tileArtUniformGrid={tileArtUniformGrid}
                  tileArtDensity={tileArtDensity}
                  tileArtRamp={tileArtRamp}
                  patternFit={patternFit}
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
                />
              </div>
            </Suspense>
          ) : (
            <ImageRectsCanvas
              imageSource={imageSource}
              mediaTextureKind={mediaTextureKind}
              gridSize={gridSize}
              palette={palette}
              bgShade={bgShade}
              bgColorMode={bgColorMode}
              bgCustomColor={bgCustomColor}
              rectColorSource={rectColorSource}
              quantizeSteps={quantizeSteps}
              quantizeMode={quantizeMode}
              quantizeGamma={quantizeGamma}
              quantizeDither={quantizeDither}
              rectShade={rectShade}
              shadeFrom={shadeFromLocked}
              patternWarpShade={patternWarpShade}
              patternWeftShade={patternWeftShade}
              patternIndex={patternIndex}
              patterns={PATTERNS}
              rectRadius={rectRadius}
              rectAspect={rectAspect}
              rectRatio={rectRatio}
              lumaSizeMix={lumaSizeMix}
              lumaSizeInvert={lumaSizeInvert}
              lumaSizeFloor={lumaSizeFloor}
              cellGeometryMode={cellGeometryMode}
              stitchLumaMax={stitchLumaMax}
              nonStitchShowsBg={mosaicBgGaps}
              contentPadding={contentPadding}
              stitchRevealMode={stitchRevealMode}
              stitchRevealProgress={stitchRevealProgress}
              stitchRevealSeed={stitchRevealSeed}
              stitchRevealScale={stitchRevealScale}
              stitchRevealNoiseScale={stitchRevealNoiseScale}
              stitchRevealSoftness={stitchRevealSoftness}
              stitchRevealBleedAnisotropy={stitchRevealBleedAnisotropy}
              stitchRevealBleedRotation={stitchRevealBleedRotation}
              stitchRevealBleedCrossFiber={stitchRevealBleedCrossFiber}
              stitchRevealBleedDraftCoupled={stitchRevealBleedDraftCoupled}
              tileArtLevels={tileArtLevels}
              tileArtThreshold={tileArtThreshold}
              tileArtDither={tileArtDither}
              tileArtColorMode={tileArtColorMode}
              tileArtGeom={tileArtGeom}
              tileArtUniformGrid={tileArtUniformGrid}
              tileArtDensity={tileArtDensity}
              tileArtRamp={tileArtRamp}
              patternFit={patternFit}
              onCanvasRef={(el) => { canvasRef.current = el; }}
              onCaptureReady={(api) => { imageRectsCaptureRef.current = api; }}
            />
          )}
        </main>

        <CaptureToolbar
          copyFormat={copyFormat}
          setCopyFormat={setCopyFormat}
          copyScale={copyScale}
          setCopyScale={setCopyScale}
          copyDefaults={{ copyScale: IMAGE_RECTS_URL_DEFAULTS.copyScale, copyFormat: IMAGE_RECTS_URL_DEFAULTS.copyFormat }}
          onCopy={handleCopy}
          copyFeedback={copyFeedback}
          onDownload={handleExport}
          downloadFeedback={exportFeedback}
          onOpenConfigExport={() => setConfigExportOpen(true)}
          recordFormat={recordFormat}
          setRecordFormat={setRecordFormat}
          isRecording={isRecording}
          isProcessing={isProcessing}
          recordingReason={recordingReason}
          onRecordClick={isRecording ? stopRecordingWithCleanup : startRecording}
          onPlayRecord={startMosaicPlayAndRecord}
          keyframe={{
            editingAfter,
            setEditingAfter,
            durationSec: keyframeDurationSec,
            setDurationSec: setKeyframeDurationSec,
            isPlaying: keyframePlaying,
            onSetBefore: () => { syncMosaicBeforeFromLive(); setEditingAfter(false); },
            onSetAfter: () => { syncMosaicAfterFromLive(); setEditingAfter(true); },
            onPlay: startMosaicKeyframePlay,
            onStop: stopMosaicKeyframe,
          }}
        />

        <ConfigExportModal
          open={configExportOpen}
          onClose={() => setConfigExportOpen(false)}
          tab="mosaic"
          state={configHandoffState}
          meta={{ mediaLoaded: !!imageSource }}
          animation={configHandoffAnimation}
          keyframes={{
            durationSec: keyframeDurationSec,
            editingAfter,
            setA: mosaicBefore,
            setB: mosaicAfter,
          }}
          hasKeyframeA={!!mosaicBefore && Object.keys(mosaicBefore).length > 0}
          hasKeyframeB={!!mosaicAfter && Object.keys(mosaicAfter).length > 0}
        />

        <footer className="relative h-[100px] shrink-0 overflow-hidden border-t border-border-subtle bg-surface-elevated">
          <div className="flex h-full min-h-9 flex-wrap items-center gap-2 overflow-y-auto px-3 py-2">
            <span className={pill}>
              {imageSource
                ? (mediaTextureKind === 'video' ? 'Video playing' : mediaTextureKind === 'gif' ? 'GIF playing' : 'Image loaded')
                : 'Pick image, video, or GIF'}
            </span>
            {rectColorSource !== 3 ? (
              <span className={pill}>Weave: {PATTERNS[patternIndex]?.name ?? '—'}</span>
            ) : (
              <>
                <span className={pill}>Ramp: {tileArtLevels} bands</span>
                <span className={pill}>{tileArtGeom === 1 ? 'Rounded' : 'Flat'} stitches</span>
                <span className={pill}>{tileArtUniformGrid === 1 ? `Uniform ${TILE_ART_UNIFORM_TILE_W}×${TILE_ART_UNIFORM_TILE_H}` : 'Pattern cells'}</span>
                {tileArtDensity === 1 ? <span className={pill}>Density on</span> : null}
              </>
            )}
            <span className={pill}>Color: {RECT_COLOR_SOURCE_OPTIONS.find((o) => o.value === rectColorSource)?.label ?? '—'}</span>
            {(rectColorSource === 2 || rectColorSource === 3) && (
              <span className={pill}>W/W: {SHADE_NAMES[patternWarpShade]} / {SHADE_NAMES[patternWeftShade]}</span>
            )}
            {lumaSizeMix > 0.01 ? (
              <span className={pill}>Luma size {lumaSizeMix.toFixed(2)}{lumaSizeInvert ? ' (bright−)' : ' (dark−)'}</span>
            ) : null}
            {cellGeometryMode === 1 ? (
              <span className={pill}>Stitches ≤ {stitchLumaMax.toFixed(2)}</span>
            ) : null}
            {stitchRevealMode > 0 ? (
              <span className={pill}>
                Stitch-in: {STITCH_REVEAL_MODE_OPTIONS.find((o) => o.value === stitchRevealMode)?.label ?? '—'} · {stitchRevealProgress >= 0.999 ? 'done' : `${Math.round(stitchRevealProgress * 100)}%`}
              </span>
            ) : null}
            <span className={pill}>Quantize: {quantizeSteps === 0 ? 'off' : `${quantizeSteps} · ${QUANTIZE_MODE_OPTIONS[quantizeMode]?.label ?? 'RGB'}`}</span>
            {quantizeSteps >= 2 ? (
              <>
                <span className={pill}>γ {quantizeGamma.toFixed(2)}</span>
                <span className={pill}>Dither {quantizeDither.toFixed(2)}</span>
              </>
            ) : null}
            <span className={pill}>{PALETTE_NAMES[palette]}</span>
            <span className={pill}>
              BG: {bgColorMode === 1
                ? bgCustomColor.toUpperCase()
                : (bgShade === 4 ? <><Icon name={SHADE_TRANSPARENT_ICON} className={iconXs} /></> : SHADE_NAMES[bgShade])}
            </span>
            <span className={pill}>Grid: {gridSize}</span>
            <div className="ml-auto flex items-center gap-2">
              {mosaicHalftoneOn ? <span className={pill}>Halftone on</span> : null}
              <span className={pill}>WebGL 1</span>
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-linear-to-t from-surface-elevated to-transparent" aria-hidden />
        </footer>
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
