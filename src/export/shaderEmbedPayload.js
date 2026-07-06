/**
 * Build a normalized payload for embeddable Weaving shader snippets.
 * Snapshot source can be current live state, keyframe A, or keyframe B.
 */
import { PATTERNS, buildPatternTexture } from '../patterns';
import { WEAVING_URL_DEFAULTS } from '../urlDefaults';
import { encodeColorwayAnimPlaying } from '../colorwayAnimUrl';
import { inferShaderEmbedDrivers, getShaderEmbedDriverAuto, getShaderEmbedDriverAutoBits } from './shaderEmbedInferAnimation';
import { ENS_MARK_PNG_BASE64 } from '../assets/ensMarkEmbedBase64.js';
import { ENS_MARK_TEX_ASPECT } from '../assets/ensMarkMeta.js';
import vertexSource from '../shaders/vertex.glsl?raw';
import fragmentSource from '../shaders/fragment.glsl?raw';

const PALETTE_RGBA = [
  [[0.247, 0.114, 0.035, 1], [0.596, 0.302, 0.106, 1], [0.973, 0.969, 0.886, 1], [0.855, 0.725, 0.525, 1], [0, 0, 0, 0], [0.933, 0.933, 0.933, 1]],
  [[0.322, 0.024, 0.141, 1], [0.941, 0.216, 0.576, 1], [0.984, 0.922, 0.941, 1], [0.988, 0.706, 0.812, 1], [0, 0, 0, 0], [0.933, 0.933, 0.933, 1]],
  [[0.008, 0.161, 0.231, 1], [0.0, 0.502, 0.737, 1], [0.902, 0.953, 0.973, 1], [0.455, 0.725, 0.875, 1], [0, 0, 0, 0], [0.933, 0.933, 0.933, 1]],
  [[0.012, 0.188, 0.063, 1], [0.0, 0.486, 0.137, 1], [0.843, 0.914, 0.89, 1], [0.4549, 0.6745, 0.4902, 1], [0, 0, 0, 0], [0.933, 0.933, 0.933, 1]],
  [[0.098039, 0.098039, 0.098039, 1], [0.34902, 0.341176, 0.333333, 1], [0.933333, 0.929412, 0.929412, 1], [0.45098, 0.45098, 0.45098, 1], [0, 0, 0, 0], [0.933, 0.933, 0.933, 1]],
];

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function toPngBase64FromRgba(width, height, rgbaBytes) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const img = new ImageData(new Uint8ClampedArray(rgbaBytes), width, height);
  ctx.putImageData(img, 0, 0);
  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

function getPaletteColor(paletteIndex, shadeIndex) {
  const p = clamp(Math.floor(Number(paletteIndex) || 0), 0, 4);
  const s = clamp(Math.floor(Number(shadeIndex) || 0), 0, 5);
  return PALETTE_RGBA[p][s];
}

function getSnapshotSource(source, currentState, snapshotA, snapshotB) {
  if (source === 'setA' && snapshotA && typeof snapshotA === 'object') return snapshotA;
  if (source === 'setB' && snapshotB && typeof snapshotB === 'object') return snapshotB;
  return currentState || {};
}

/**
 * @param {{
 *   source?: 'current' | 'setA' | 'setB',
 *   currentState: Record<string, unknown>,
 *   snapshotA?: Record<string, unknown> | null,
 *   snapshotB?: Record<string, unknown> | null,
 *   smartAuto?: boolean,
 *   staticMode?: boolean,
 *   isKeyframePlaying?: boolean,
 *   shimmerPlaying?: boolean,
 *   stageTranslateX?: number,
 *   colorwayAnimPlaying?: Record<string, boolean>,
 *   hoverReactive?: boolean,
 *   hoverRevealOnly?: boolean,
 *   movementBoost?: boolean,
 * }} options
 */
export function buildShaderEmbedPayload(options) {
  const {
    source = 'current',
    currentState,
    snapshotA = null,
    snapshotB = null,
    smartAuto = true,
    staticMode = false,
    isKeyframePlaying = false,
    shimmerPlaying = true,
    stageTranslateX = 0,
    colorwayAnimPlaying,
    hoverReactive = false,
    hoverRevealOnly = false,
    movementBoost = true,
  } = options;

  const src = getSnapshotSource(source, currentState, snapshotA, snapshotB);
  const state = { ...WEAVING_URL_DEFAULTS, ...currentState, ...src };

  const patternIndex = clamp(Math.floor(Number(state.pattern) || 0), 0, PATTERNS.length - 1);
  const pattern = PATTERNS[patternIndex];
  const patternTexture = buildPatternTexture(PATTERNS);
  const patternTextureB64 = toPngBase64FromRgba(patternTexture.width, patternTexture.height, patternTexture.data);

  const palette = clamp(Math.floor(Number(state.palette) || 0), 0, 4);
  const bgShade = clamp(Math.floor(Number(state.bgShade) || 0), 0, 5);
  const warpShade = clamp(Math.floor(Number(state.warpShade) || 0), 0, 5);
  const weftShade = clamp(Math.floor(Number(state.weftShade) || 0), 0, 5);
  const warpGradient = state.warpGradient || WEAVING_URL_DEFAULTS.warpGradient;
  const weftGradient = state.weftGradient || WEAVING_URL_DEFAULTS.weftGradient;
  const warpGradientEnabled = state.warpGradientEnabled !== false;
  const weftGradientEnabled = state.weftGradientEnabled !== false;
  const warpStartShade = warpGradientEnabled ? warpGradient.startShade : warpShade;
  const warpEndShade = warpGradientEnabled ? warpGradient.endShade : warpShade;
  const weftStartShade = weftGradientEnabled ? weftGradient.startShade : weftShade;
  const weftEndShade = weftGradientEnabled ? weftGradient.endShade : weftShade;
  const warpRange = Array.isArray(warpGradient.range) ? warpGradient.range : [0, 100];
  const weftRange = Array.isArray(weftGradient.range) ? weftGradient.range : [0, 100];
  const includeMask = clamp(Math.floor(Number(state.colorwayIncludeMask) || 31), 0, 31);

  const fixedUniforms = {
    u_patternIndex: patternIndex,
    u_tileW: pattern.tileW,
    u_tileH: pattern.tileH,
    u_patternTexHeight: patternTexture.height,
    u_palette: palette,
    u_bgShade: bgShade,
    u_warpShade: warpShade,
    u_weftShade: weftShade,
    u_gridSize: Number(state.gridSize),
    u_warpStart: getPaletteColor(palette, warpStartShade),
    u_warpEnd: getPaletteColor(palette, warpEndShade),
    u_weftStart: getPaletteColor(palette, weftStartShade),
    u_weftEnd: getPaletteColor(palette, weftEndShade),
    u_warpDir: Number(warpGradient.direction) || 0,
    u_weftDir: Number(weftGradient.direction) || 0,
    u_warpStartPos: clamp(Math.min(Number(warpRange[0]) || 0, Number(warpRange[1]) || 100) / 100, 0, 1),
    u_warpEndPos: clamp(Math.max(Number(warpRange[0]) || 0, Number(warpRange[1]) || 100) / 100, 0, 1),
    u_weftStartPos: clamp(Math.min(Number(weftRange[0]) || 0, Number(weftRange[1]) || 100) / 100, 0, 1),
    u_weftEndPos: clamp(Math.max(Number(weftRange[0]) || 0, Number(weftRange[1]) || 100) / 100, 0, 1),
    u_gradSteps: Number(state.gradSteps) || 0,
    u_revealProgress: 1,
    u_rectAspect: Number(state.rectAspect),
    u_cornerRadius: Number(state.cornerRadius),
    u_stageTranslateX: Math.round(Number(stageTranslateX) || 0),
    u_shimmer: Number(state.shimmer) ? 1 : 0,
    u_shimmerSpeed: Number(state.shimmerSpeed),
    u_shimmerWidth: Number(state.shimmerWidth),
    u_shimmerIntensity: Number(state.shimmerIntensity),
    u_shimmerPosition: Number(state.shimmerPosition),
    u_shimmerRotation: Number(state.shimmerRotation),
    u_shimmerNoise: Number(state.shimmerNoise),
    u_shimmerNoiseSeed: Number(state.shimmerNoiseSeed),
    u_shimmerNoiseMin: Number(state.shimmerNoiseMin),
    u_shimmerNoiseMax: Number(state.shimmerNoiseMax),
    u_shimmerBlendMode: Number(state.shimmerBlendMode),
    u_useAllColorways: Number(state.useAllColorways) ? 1 : 0,
    u_colorwaySeed: Number(state.colorwaySeed),
    u_colorwayNoiseScale: Number(state.colorwayNoiseScale),
    u_colorwayNoiseMode: Number(state.colorwayNoiseMode),
    u_colorwayNoiseOctaves: Number(state.colorwayNoiseOctaves),
    u_colorwayNoisePersistence: Number(state.colorwayNoisePersistence),
    u_colorwayNoiseLacunarity: Number(state.colorwayNoiseLacunarity),
    u_colorwayNoiseBias: Number(state.colorwayNoiseBias),
    u_colorwayNoiseX: Number(state.colorwayNoiseX),
    u_colorwayBleedAnisotropy: Number(state.colorwayBleedAnisotropy),
    u_colorwayBleedRotation: Number(state.colorwayBleedRotation),
    u_colorwayBleedCrossFiber: Number(state.colorwayBleedCrossFiber),
    u_colorwayBleedDraftCoupled: Number(state.colorwayBleedDraftCoupled) ? 1 : 0,
    u_colorwayInclude0123: [includeMask & 1 ? 1 : 0, includeMask & 2 ? 1 : 0, includeMask & 4 ? 1 : 0, includeMask & 8 ? 1 : 0],
    u_colorwayInclude4: includeMask & 16 ? 1 : 0,
    u_stitchRevealMode: Number(state.weaveStitchRevealMode),
    u_stitchRevealProgress: Number(state.weaveStitchRevealProgress),
    u_stitchRevealSeed: Number(state.weaveStitchRevealSeed),
    u_stitchRevealScale: Number(state.weaveStitchRevealScale),
    u_stitchRevealNoiseScale: Number(state.weaveStitchRevealNoiseScale),
    u_stitchRevealSoftness: Number(state.weaveStitchRevealSoftness),
    u_stitchRevealBleedAnisotropy: Number(state.weaveStitchRevealBleedAnisotropy),
    u_stitchRevealBleedRotation: Number(state.weaveStitchRevealBleedRotation),
    u_stitchRevealBleedCrossFiber: Number(state.weaveStitchRevealBleedCrossFiber),
    u_stitchRevealBleedDraftCoupled: Number(state.weaveStitchRevealBleedDraftCoupled) ? 1 : 0,
    u_hoverReactive: hoverReactive ? 1 : 0,
    u_hoverRevealOnly: hoverRevealOnly ? 1 : 0,
    u_hoverMovementBoost: movementBoost ? 1 : 0,
    u_pointerUv: [0.5, 0.5],
    u_hoverStrength: 0,
    u_hoverVelocity: 0,
    u_ripplePhase: 0,
    u_rippleWidth: 0.22,
    u_ensMarkAspect: ENS_MARK_TEX_ASPECT,
    u_ensMarkVisible: state.weaveEnsMarkVisible !== false ? 1 : 0,
  };

  const inferOpts = {
    smartAuto,
    isKeyframePlaying,
    shimmerPlaying,
    staticMode,
    colorwayAnimPlaying,
  };
  const drivers = inferShaderEmbedDrivers(state, inferOpts);

  const driverModes = Object.fromEntries(drivers.map((d) => [d.driver, d.mode]));
  const driverValues = {
    time: 0,
    shimmerTime: 0,
    stitchProgress: clamp(Number(state.weaveStitchRevealProgress), 0, 1),
    colorwayNoiseScale: Number(state.colorwayNoiseScale),
    colorwayNoiseOctaves: Math.round(Number(state.colorwayNoiseOctaves) || 1),
    colorwayNoisePersistence: Number(state.colorwayNoisePersistence),
    colorwayNoiseLacunarity: Number(state.colorwayNoiseLacunarity),
    colorwayNoiseBias: Number(state.colorwayNoiseBias),
    colorwayNoiseX: Number(state.colorwayNoiseX),
    colorwayBleedAnisotropy: Number(state.colorwayBleedAnisotropy),
    colorwayBleedRotation: Number(state.colorwayBleedRotation),
    colorwayBleedCrossFiber: Number(state.colorwayBleedCrossFiber),
    colorwayBleedDraftCoupled: Number(state.colorwayBleedDraftCoupled) ? 1 : 0,
  };

  const embedShaderDriversAuto = getShaderEmbedDriverAuto(state, inferOpts);
  const playing = {
    embedShaderDriversAuto,
    embedShaderDriversAutoBits: getShaderEmbedDriverAutoBits(state, inferOpts),
    shimmerUiPlaying: shimmerPlaying !== false,
    weaveKeyframeTransportPlaying: !!isKeyframePlaying,
    staticExport: staticMode,
    colorwayAnimBits: encodeColorwayAnimPlaying(
      colorwayAnimPlaying && typeof colorwayAnimPlaying === 'object' ? colorwayAnimPlaying : {},
    ),
  };

  return {
    shaderType: 'weaving',
    source,
    playing,
    vertexSource,
    fragmentSource,
    fixedUniforms,
    animatedUniforms: drivers,
    textures: {
      u_patternSampler: {
        base64: patternTextureB64,
        width: patternTexture.width,
        height: patternTexture.height,
      },
      u_ensMarkSampler: {
        base64: ENS_MARK_PNG_BASE64,
      },
    },
    canvas: {
      aspect: Number(state.canvasAspect) || 1,
      defaultWidth: 720,
    },
    handoffDefaults: {
      translateX: Math.round(Number(stageTranslateX) || 0),
      animationStartSec: 0,
      animationEndSec: null,
      progressStart: 0,
      progressEnd: 1,
      driverModes,
      driverValues,
      stitchDurationSec: Math.max(0.25, Number(state.weaveStitchRevealDurationSec) || 2.5),
      playing,
      hover: {
        enabled: hoverReactive,
        revealOnly: hoverRevealOnly,
        movementBoost,
      },
    },
  };
}

