/**
 * Build shareable configuration payloads for handoff (URL + structured JSON).
 * Media blobs are not included — recipients reopen the share link and load their own image/video.
 */
import { encodeColorwayAnimPlaying, COLORWAY_ANIM_INITIAL } from '../colorwayAnimUrl';
import { inferShaderEmbedDrivers } from './shaderEmbedInferAnimation';

const HANDOFF_VERSION = 2;

const STITCH_IN_MODES = ['off', 'noise', 'bleed'];

/**
 * @param {'weave' | 'mosaic'} tab
 * @param {{
 *   keyframeTransportPlaying?: boolean,
 *   shimmerEnabled?: boolean,
 *   shimmerPlaying?: boolean,
 *   useAllColorways?: boolean,
 *   colorwayAnimPlaying?: Record<string, boolean>,
 *   stitchRevealMode?: number,
 *   stitchRevealOnRedraw?: boolean,
 *   stitchRevealKeyframeDrive?: boolean,
 *   stitchRevealProgress?: number,
 *   diagonalRevealProgress?: number,
 *   inferState?: Record<string, unknown>,
 * }} animation
 */
export function buildAnimationHandoff(tab, animation = {}) {
  const {
    keyframeTransportPlaying = false,
    shimmerEnabled = false,
    shimmerPlaying = true,
    useAllColorways = false,
    colorwayAnimPlaying = COLORWAY_ANIM_INITIAL,
    stitchRevealMode = 0,
    stitchRevealOnRedraw = true,
    stitchRevealKeyframeDrive = false,
    stitchRevealProgress = 1,
    diagonalRevealProgress = 1,
    inferState = {},
  } = animation;

  const colorwayFields = { ...COLORWAY_ANIM_INITIAL, ...colorwayAnimPlaying };
  const anyColorwayFieldPlaying = Object.values(colorwayFields).some(Boolean);
  const colorwayLoopsActive = !!useAllColorways && anyColorwayFieldPlaying;
  const stitchMode = STITCH_IN_MODES[Math.max(0, Math.min(2, Math.round(Number(stitchRevealMode) || 0)))] ?? 'off';

  const playing = {
    keyframeAtoB: {
      playing: !!keyframeTransportPlaying,
    },
    colorways: {
      useAllColorways: !!useAllColorways,
      anyFieldAnimating: anyColorwayFieldPlaying,
      loopsActive: colorwayLoopsActive,
      fields: colorwayFields,
      urlBits: encodeColorwayAnimPlaying(colorwayFields),
    },
    stitchIn: {
      mode: stitchMode,
      replayOnRedraw: !!stitchRevealOnRedraw,
      keyframeDrive: !!stitchRevealKeyframeDrive,
      progress: Math.max(0, Math.min(1, Number(stitchRevealProgress) || 0)),
      configured: stitchMode !== 'off',
    },
    diagonalReveal: {
      progress: Math.max(0, Math.min(1, Number(diagonalRevealProgress) || 0)),
    },
  };

  if (tab === 'weave') {
    playing.shimmer = {
      enabled: !!shimmerEnabled,
      playing: !!shimmerEnabled && shimmerPlaying !== false,
      frozen: !!shimmerEnabled && shimmerPlaying === false,
    };

    const driverList = inferShaderEmbedDrivers(inferState, {
      smartAuto: true,
      isKeyframePlaying: keyframeTransportPlaying,
      shimmerPlaying: shimmerPlaying !== false,
      staticMode: false,
      colorwayAnimPlaying: colorwayFields,
    });
    playing.embedDrivers = Object.fromEntries(
      driverList.map((d) => [d.driver, d.mode]),
    );
    playing.embedDriverSummary = {
      auto: driverList.filter((d) => d.mode === 'auto').map((d) => d.driver),
      controlled: driverList.filter((d) => d.mode === 'controlled').map((d) => d.driver),
    };
  }

  return playing;
}

/**
 * @param {{
 *   tab: 'weave' | 'mosaic',
 *   state: Record<string, unknown>,
 *   meta?: Record<string, unknown>,
 *   animation?: Parameters<typeof buildAnimationHandoff>[1],
 *   keyframes?: {
 *     durationSec?: number,
 *     editingAfter?: boolean,
 *     setA?: Record<string, unknown> | null,
 *     setB?: Record<string, unknown> | null,
 *   },
 *   includeKeyframes?: boolean,
 *   shareUrl?: string,
 *   query?: string,
 * }} options
 */
export function buildConfigHandoffPayload(options) {
  const {
    tab,
    state,
    meta = {},
    animation,
    keyframes,
    includeKeyframes = true,
    shareUrl = typeof window !== 'undefined' ? window.location.href : '',
    query = typeof window !== 'undefined' ? window.location.search.replace(/^\?/, '') : '',
  } = options;

  const payload = {
    shaderbox: HANDOFF_VERSION,
    exportedAt: new Date().toISOString(),
    tab,
    shareUrl,
    query: query || null,
    meta,
    playing: buildAnimationHandoff(tab, animation),
    state,
  };

  if (includeKeyframes && keyframes) {
    const hasA = keyframes.setA != null && Object.keys(keyframes.setA).length > 0;
    const hasB = keyframes.setB != null && Object.keys(keyframes.setB).length > 0;
    if (hasA || hasB || keyframes.durationSec != null) {
      payload.keyframes = {
        durationSec: keyframes.durationSec ?? null,
        editingAfter: !!keyframes.editingAfter,
        setA: hasA ? keyframes.setA : null,
        setB: hasB ? keyframes.setB : null,
      };
    }
  }

  return payload;
}

/** @param {ReturnType<typeof buildConfigHandoffPayload>} payload */
export function formatConfigHandoffJson(payload) {
  return JSON.stringify(payload, null, 2);
}
