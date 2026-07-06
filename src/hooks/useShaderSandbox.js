/**
 * useShaderSandbox — WebGL shader compilation and render loop.
 * When warp/weft gradient flags are off, both gradient stops use the corresponding **warp** / **weft** shade (flat thread color).
 * Compiles vertex + fragment shaders, uploads fullscreen quad, runs animation loop.
 * Pattern data is uploaded as a texture; uniforms include u_tileW, u_tileH for the selected pattern.
 * Stitch-in: u_stitchReveal* — optional per-cell reveal order + progress (see fragment.glsl).
 * **stageTranslateX** (pixels): **u_stageTranslateX** — horizontal shift of the weave sample in fragment space (see fragment.glsl).
 * **ENS mark:** `u_ensMarkSampler` on texture **unit 1** (`ens-mark.png?url`); `u_ensMarkAspect` = texel width÷height; **`u_ensMarkVisible`** toggles compositing (Weave sidebar / URL **`ensm`**).
 *
 * Shader source is read from refs so that code changes (e.g. HMR on .glsl save) only trigger
 * a program recompile, not a full canvas teardown and re-run.
 *
 * Optimizations (Vercel React): cache uniform locations (js-cache-property-access),
 * ref for onFpsChange to avoid effect churn (advanced-use-latest).
 */
import { useRef, useEffect, useCallback, useState } from 'react';
import { EXPORT_MAX_DIMENSION, RECT_ASPECT_DEFAULT } from '../constants';
import { buildPatternTexture, PATTERNS } from '../patterns';
import { WEAVING_URL_DEFAULTS } from '../urlDefaults';
import { diagonalRevealDurationSec } from '../weaveDiagonalReveal';
import ensMarkUrl from '../assets/ens-mark.png?url';
import { ENS_MARK_TEX_ASPECT } from '../assets/ensMarkMeta.js';

const DPR = 2;

function getUniformLocs(gl, program) {
  return {
    time: gl.getUniformLocation(program, 'u_time'),
    resolution: gl.getUniformLocation(program, 'u_resolution'),
    patternSampler: gl.getUniformLocation(program, 'u_patternSampler'),
    ensMarkSampler: gl.getUniformLocation(program, 'u_ensMarkSampler'),
    ensMarkAspect: gl.getUniformLocation(program, 'u_ensMarkAspect'),
    ensMarkVisible: gl.getUniformLocation(program, 'u_ensMarkVisible'),
    patternIndex: gl.getUniformLocation(program, 'u_patternIndex'),
    tileW: gl.getUniformLocation(program, 'u_tileW'),
    tileH: gl.getUniformLocation(program, 'u_tileH'),
    patternTexHeight: gl.getUniformLocation(program, 'u_patternTexHeight'),
    palette: gl.getUniformLocation(program, 'u_palette'),
    bgShade: gl.getUniformLocation(program, 'u_bgShade'),
    warpShade: gl.getUniformLocation(program, 'u_warpShade'),
    weftShade: gl.getUniformLocation(program, 'u_weftShade'),
    gridSize: gl.getUniformLocation(program, 'u_gridSize'),
    warpStart: gl.getUniformLocation(program, 'u_warpStart'),
    warpEnd: gl.getUniformLocation(program, 'u_warpEnd'),
    weftStart: gl.getUniformLocation(program, 'u_weftStart'),
    weftEnd: gl.getUniformLocation(program, 'u_weftEnd'),
    warpDir: gl.getUniformLocation(program, 'u_warpDir'),
    weftDir: gl.getUniformLocation(program, 'u_weftDir'),
    warpStartPos: gl.getUniformLocation(program, 'u_warpStartPos'),
    warpEndPos: gl.getUniformLocation(program, 'u_warpEndPos'),
    weftStartPos: gl.getUniformLocation(program, 'u_weftStartPos'),
    weftEndPos: gl.getUniformLocation(program, 'u_weftEndPos'),
    gradSteps: gl.getUniformLocation(program, 'u_gradSteps'),
    revealProgress: gl.getUniformLocation(program, 'u_revealProgress'),
    rectAspect: gl.getUniformLocation(program, 'u_rectAspect'),
    cornerRadius: gl.getUniformLocation(program, 'u_cornerRadius'),
    shimmer: gl.getUniformLocation(program, 'u_shimmer'),
    shimmerSpeed: gl.getUniformLocation(program, 'u_shimmerSpeed'),
    shimmerTime: gl.getUniformLocation(program, 'u_shimmerTime'),
    shimmerPhase: gl.getUniformLocation(program, 'u_shimmerPhase'),
    shimmerWidth: gl.getUniformLocation(program, 'u_shimmerWidth'),
    shimmerIntensity: gl.getUniformLocation(program, 'u_shimmerIntensity'),
    shimmerPosition: gl.getUniformLocation(program, 'u_shimmerPosition'),
    shimmerRotation: gl.getUniformLocation(program, 'u_shimmerRotation'),
    shimmerNoise: gl.getUniformLocation(program, 'u_shimmerNoise'),
    shimmerNoiseSeed: gl.getUniformLocation(program, 'u_shimmerNoiseSeed'),
    shimmerNoiseMin: gl.getUniformLocation(program, 'u_shimmerNoiseMin'),
    shimmerNoiseMax: gl.getUniformLocation(program, 'u_shimmerNoiseMax'),
    shimmerBlendMode: gl.getUniformLocation(program, 'u_shimmerBlendMode'),
    useAllColorways: gl.getUniformLocation(program, 'u_useAllColorways'),
    colorwaySeed: gl.getUniformLocation(program, 'u_colorwaySeed'),
    colorwayNoiseScale: gl.getUniformLocation(program, 'u_colorwayNoiseScale'),
    colorwayNoiseMode: gl.getUniformLocation(program, 'u_colorwayNoiseMode'),
    colorwayNoiseOctaves: gl.getUniformLocation(program, 'u_colorwayNoiseOctaves'),
    colorwayNoisePersistence: gl.getUniformLocation(program, 'u_colorwayNoisePersistence'),
    colorwayNoiseLacunarity: gl.getUniformLocation(program, 'u_colorwayNoiseLacunarity'),
    colorwayNoiseBias: gl.getUniformLocation(program, 'u_colorwayNoiseBias'),
    colorwayNoiseX: gl.getUniformLocation(program, 'u_colorwayNoiseX'),
    colorwayBleedAnisotropy: gl.getUniformLocation(program, 'u_colorwayBleedAnisotropy'),
    colorwayBleedRotation: gl.getUniformLocation(program, 'u_colorwayBleedRotation'),
    colorwayBleedCrossFiber: gl.getUniformLocation(program, 'u_colorwayBleedCrossFiber'),
    colorwayBleedDraftCoupled: gl.getUniformLocation(program, 'u_colorwayBleedDraftCoupled'),
    colorwayInclude0123: gl.getUniformLocation(program, 'u_colorwayInclude0123'),
    colorwayInclude4: gl.getUniformLocation(program, 'u_colorwayInclude4'),
    stitchRevealMode: gl.getUniformLocation(program, 'u_stitchRevealMode'),
    stitchRevealProgress: gl.getUniformLocation(program, 'u_stitchRevealProgress'),
    stitchRevealSeed: gl.getUniformLocation(program, 'u_stitchRevealSeed'),
    stitchRevealScale: gl.getUniformLocation(program, 'u_stitchRevealScale'),
    stitchRevealNoiseScale: gl.getUniformLocation(program, 'u_stitchRevealNoiseScale'),
    stitchRevealSoftness: gl.getUniformLocation(program, 'u_stitchRevealSoftness'),
    stitchRevealBleedAnisotropy: gl.getUniformLocation(program, 'u_stitchRevealBleedAnisotropy'),
    stitchRevealBleedRotation: gl.getUniformLocation(program, 'u_stitchRevealBleedRotation'),
    stitchRevealBleedCrossFiber: gl.getUniformLocation(program, 'u_stitchRevealBleedCrossFiber'),
    stitchRevealBleedDraftCoupled: gl.getUniformLocation(program, 'u_stitchRevealBleedDraftCoupled'),
    stageTranslateX: gl.getUniformLocation(program, 'u_stageTranslateX'),
    hoverReactive: gl.getUniformLocation(program, 'u_hoverReactive'),
    hoverRevealOnly: gl.getUniformLocation(program, 'u_hoverRevealOnly'),
    hoverMovementBoost: gl.getUniformLocation(program, 'u_hoverMovementBoost'),
    pointerUv: gl.getUniformLocation(program, 'u_pointerUv'),
    hoverStrength: gl.getUniformLocation(program, 'u_hoverStrength'),
    hoverVelocity: gl.getUniformLocation(program, 'u_hoverVelocity'),
    ripplePhase: gl.getUniformLocation(program, 'u_ripplePhase'),
    rippleWidth: gl.getUniformLocation(program, 'u_rippleWidth'),
  };
}

const QUAD_POSITIONS = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);

function compileShader(gl, source, type) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error:\n${log}`);
  }
  return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vs = compileShader(gl, vertexSource, gl.VERTEX_SHADER);
  const fs = compileShader(gl, fragmentSource, gl.FRAGMENT_SHADER);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error:\n${log}`);
  }
  return program;
}

// ENS palette RGBA (0–1), matches shader getPaletteColor. [palette][shade] = [r,g,b,a]; shade 0–4 = 950,500,100,400,Transparent.
// Palette 4 = Quartz neutrals from ENS Core variables (quartz/900,500,100,400 — 300 sits between 100–400 in Figma).
const PALETTE_RGBA = [
  [[0.247, 0.114, 0.035, 1], [0.596, 0.302, 0.106, 1], [0.973, 0.969, 0.886, 1], [0.855, 0.725, 0.525, 1], [0, 0, 0, 0]],
  [[0.322, 0.024, 0.141, 1], [0.941, 0.216, 0.576, 1], [0.984, 0.922, 0.941, 1], [0.988, 0.706, 0.812, 1], [0, 0, 0, 0]],
  [[0.008, 0.161, 0.231, 1], [0.0, 0.502, 0.737, 1], [0.902, 0.953, 0.973, 1], [0.455, 0.725, 0.875, 1], [0, 0, 0, 0]],
  [[0.012, 0.188, 0.063, 1], [0.0, 0.486, 0.137, 1], [0.843, 0.914, 0.89, 1], [0.4549, 0.6745, 0.4902, 1], [0, 0, 0, 0]],
  [[0.098039, 0.098039, 0.098039, 1], [0.34902, 0.341176, 0.333333, 1], [0.933333, 0.929412, 0.929412, 1], [0.45098, 0.45098, 0.45098, 1], [0, 0, 0, 0]],
];

function getPaletteColor(paletteIndex, shadeIndex) {
  const p = Math.max(0, Math.min(4, Math.floor(paletteIndex)));
  const s = Math.max(0, Math.min(4, Math.floor(shadeIndex)));
  return PALETTE_RGBA[p][s];
}

export function useShaderSandbox(vertexSource, fragmentSource, patternIndex, palette, bgShade, warpShade, weftShade, gridSize, warpGradient, weftGradient, warpGradientEnabled, weftGradientEnabled, gradSteps, rectAspect, cornerRadius, shimmer, shimmerSpeed, shimmerWidth, shimmerIntensity, shimmerPosition, shimmerRotation, shimmerNoise, shimmerNoiseSeed, shimmerNoiseMin, shimmerNoiseMax, shimmerBlendMode, useAllColorways, colorwaySeed, colorwayNoiseScale, colorwayNoiseMode, colorwayNoiseOctaves, colorwayNoisePersistence, colorwayNoiseLacunarity, colorwayNoiseBias, colorwayNoiseX, colorwayBleedAnisotropy, colorwayBleedRotation, colorwayBleedCrossFiber, colorwayBleedDraftCoupled, colorwayIncludeMask, stitchRevealMode, stitchRevealProgress, stitchRevealSeed, stitchRevealScale, stitchRevealNoiseScale, stitchRevealSoftness, stitchRevealBleedAnisotropy, stitchRevealBleedRotation, stitchRevealBleedCrossFiber, stitchRevealBleedDraftCoupled, stageTranslateX, weaveEnsMarkVisible, diagonalRevealProgress, shimmerPlaying, shimmerPausedAtTime, shimmerPhase, onShimmerTime, patterns, onFpsChange, onCaptureReady) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const vertexSourceRef = useRef(vertexSource);
  const fragmentSourceRef = useRef(fragmentSource);
  const recompileRef = useRef(null);
  const prevShaderRef = useRef({ vertex: null, fragment: null });
  const warpGradientRef = useRef(warpGradient);
  const weftGradientRef = useRef(weftGradient);
  const warpGradientEnabledRef = useRef(warpGradientEnabled);
  const weftGradientEnabledRef = useRef(weftGradientEnabled);
  const onCaptureReadyRef = useRef(onCaptureReady);
  // When patterns is omitted, callers pass (..., onFpsChange) so the 7th arg is the callback
  const callback = typeof patterns === 'function' ? patterns : onFpsChange;
  const onFpsChangeRef = useRef(callback);
  onCaptureReadyRef.current = onCaptureReady;
  const shimmerPlayingRef = useRef(shimmerPlaying ?? true);
  const shimmerPausedAtTimeRef = useRef(shimmerPausedAtTime ?? 0);
  const shimmerPhaseRef = useRef(shimmerPhase ?? 0);
  const onShimmerTimeRef = useRef(onShimmerTime);
  const [error, setError] = useState('');
  const [fps, setFps] = useState(0);

  vertexSourceRef.current = vertexSource;
  fragmentSourceRef.current = fragmentSource;
  onFpsChangeRef.current = callback;
  warpGradientRef.current = warpGradient;
  weftGradientRef.current = weftGradient;
  warpGradientEnabledRef.current = warpGradientEnabled !== false;
  weftGradientEnabledRef.current = weftGradientEnabled !== false;

  const patternIndexRef = useRef(patternIndex);
  const paletteRef = useRef(palette);
  const bgShadeRef = useRef(bgShade);
  const warpShadeRef = useRef(warpShade);
  const weftShadeRef = useRef(weftShade);
  const gridSizeRef = useRef(gridSize);
  const gradStepsRef = useRef(gradSteps);
  const rectAspectRef = useRef(rectAspect);
  const cornerRadiusRef = useRef(cornerRadius);
  const shimmerRef = useRef(shimmer);
  const shimmerSpeedRef = useRef(shimmerSpeed);
  const shimmerWidthRef = useRef(shimmerWidth);
  const shimmerIntensityRef = useRef(shimmerIntensity);
  const shimmerPositionRef = useRef(shimmerPosition);
  const shimmerRotationRef = useRef(shimmerRotation);
  const shimmerNoiseRef = useRef(shimmerNoise);
  const shimmerNoiseSeedRef = useRef(shimmerNoiseSeed);
  const shimmerNoiseMinRef = useRef(shimmerNoiseMin);
  const shimmerNoiseMaxRef = useRef(shimmerNoiseMax);
  const shimmerBlendModeRef = useRef(shimmerBlendMode);
  const useAllColorwaysRef = useRef(useAllColorways);
  const colorwaySeedRef = useRef(colorwaySeed);
  const colorwayNoiseScaleRef = useRef(colorwayNoiseScale);
  const colorwayNoiseModeRef = useRef(colorwayNoiseMode);
  const colorwayNoiseOctavesRef = useRef(colorwayNoiseOctaves);
  const colorwayNoisePersistenceRef = useRef(colorwayNoisePersistence);
  const colorwayNoiseLacunarityRef = useRef(colorwayNoiseLacunarity);
  const colorwayNoiseBiasRef = useRef(colorwayNoiseBias);
  const colorwayNoiseXRef = useRef(colorwayNoiseX);
  const colorwayBleedAnisotropyRef = useRef(colorwayBleedAnisotropy);
  const colorwayBleedRotationRef = useRef(colorwayBleedRotation);
  const colorwayBleedCrossFiberRef = useRef(colorwayBleedCrossFiber);
  const colorwayBleedDraftCoupledRef = useRef(colorwayBleedDraftCoupled);
  const colorwayIncludeMaskRef = useRef(colorwayIncludeMask);
  const stitchRevealModeRef = useRef(stitchRevealMode);
  const stitchRevealProgressRef = useRef(stitchRevealProgress);
  const stitchRevealSeedRef = useRef(stitchRevealSeed);
  const stitchRevealScaleRef = useRef(stitchRevealScale);
  const stitchRevealNoiseScaleRef = useRef(stitchRevealNoiseScale);
  const stitchRevealSoftnessRef = useRef(stitchRevealSoftness);
  const stitchRevealBleedAnisotropyRef = useRef(stitchRevealBleedAnisotropy);
  const stitchRevealBleedRotationRef = useRef(stitchRevealBleedRotation);
  const stitchRevealBleedCrossFiberRef = useRef(stitchRevealBleedCrossFiber);
  const stitchRevealBleedDraftCoupledRef = useRef(stitchRevealBleedDraftCoupled);
  patternIndexRef.current = patternIndex;
  paletteRef.current = palette;
  bgShadeRef.current = bgShade;
  warpShadeRef.current = warpShade;
  weftShadeRef.current = weftShade;
  gridSizeRef.current = gridSize;
  gradStepsRef.current = gradSteps ?? 0;
  rectAspectRef.current = rectAspect ?? RECT_ASPECT_DEFAULT;
  cornerRadiusRef.current = cornerRadius ?? 0.18;
  shimmerRef.current = shimmer ?? 0;
  shimmerSpeedRef.current = shimmerSpeed ?? 2.0;
  shimmerWidthRef.current = shimmerWidth ?? 2.0;
  shimmerIntensityRef.current = shimmerIntensity ?? 0.25;
  shimmerPositionRef.current = shimmerPosition ?? 0.0;
  shimmerRotationRef.current = shimmerRotation ?? 0.125; // 0.125 ≈ 45° (diagonal)
  shimmerNoiseRef.current = shimmerNoise ?? 0.3;
  shimmerNoiseSeedRef.current = shimmerNoiseSeed ?? 0;
  shimmerNoiseMinRef.current = shimmerNoiseMin ?? 0.5;
  shimmerNoiseMaxRef.current = shimmerNoiseMax ?? 1.5;
  shimmerBlendModeRef.current = shimmerBlendMode ?? 0;
  useAllColorwaysRef.current = useAllColorways ?? WEAVING_URL_DEFAULTS.useAllColorways;
  colorwaySeedRef.current = colorwaySeed ?? WEAVING_URL_DEFAULTS.colorwaySeed;
  colorwayNoiseScaleRef.current = colorwayNoiseScale ?? WEAVING_URL_DEFAULTS.colorwayNoiseScale;
  colorwayNoiseModeRef.current = colorwayNoiseMode ?? WEAVING_URL_DEFAULTS.colorwayNoiseMode;
  colorwayNoiseOctavesRef.current = colorwayNoiseOctaves ?? WEAVING_URL_DEFAULTS.colorwayNoiseOctaves;
  colorwayNoisePersistenceRef.current = colorwayNoisePersistence ?? WEAVING_URL_DEFAULTS.colorwayNoisePersistence;
  colorwayNoiseLacunarityRef.current = colorwayNoiseLacunarity ?? WEAVING_URL_DEFAULTS.colorwayNoiseLacunarity;
  colorwayNoiseBiasRef.current = colorwayNoiseBias ?? WEAVING_URL_DEFAULTS.colorwayNoiseBias;
  colorwayNoiseXRef.current = colorwayNoiseX ?? WEAVING_URL_DEFAULTS.colorwayNoiseX;
  colorwayBleedAnisotropyRef.current = colorwayBleedAnisotropy ?? WEAVING_URL_DEFAULTS.colorwayBleedAnisotropy;
  colorwayBleedRotationRef.current = colorwayBleedRotation ?? WEAVING_URL_DEFAULTS.colorwayBleedRotation;
  colorwayBleedCrossFiberRef.current = colorwayBleedCrossFiber ?? WEAVING_URL_DEFAULTS.colorwayBleedCrossFiber;
  colorwayBleedDraftCoupledRef.current = Number(colorwayBleedDraftCoupled) > 0 ? 1 : 0;
  const vMask = Number(colorwayIncludeMask);
  colorwayIncludeMaskRef.current = Number.isFinite(vMask)
    ? Math.max(0, Math.min(31, Math.floor(vMask)))
    : WEAVING_URL_DEFAULTS.colorwayIncludeMask;
  stitchRevealModeRef.current = stitchRevealMode ?? WEAVING_URL_DEFAULTS.weaveStitchRevealMode;
  stitchRevealProgressRef.current = stitchRevealProgress ?? WEAVING_URL_DEFAULTS.weaveStitchRevealProgress;
  stitchRevealSeedRef.current = stitchRevealSeed ?? WEAVING_URL_DEFAULTS.weaveStitchRevealSeed;
  stitchRevealScaleRef.current = stitchRevealScale ?? WEAVING_URL_DEFAULTS.weaveStitchRevealScale;
  stitchRevealNoiseScaleRef.current = stitchRevealNoiseScale ?? WEAVING_URL_DEFAULTS.weaveStitchRevealNoiseScale;
  stitchRevealSoftnessRef.current = stitchRevealSoftness ?? WEAVING_URL_DEFAULTS.weaveStitchRevealSoftness;
  stitchRevealBleedAnisotropyRef.current = stitchRevealBleedAnisotropy ?? WEAVING_URL_DEFAULTS.weaveStitchRevealBleedAnisotropy;
  stitchRevealBleedRotationRef.current = stitchRevealBleedRotation ?? WEAVING_URL_DEFAULTS.weaveStitchRevealBleedRotation;
  stitchRevealBleedCrossFiberRef.current = stitchRevealBleedCrossFiber ?? WEAVING_URL_DEFAULTS.weaveStitchRevealBleedCrossFiber;
  stitchRevealBleedDraftCoupledRef.current =
    stitchRevealBleedDraftCoupled != null
      ? (Number(stitchRevealBleedDraftCoupled) !== 0 ? 1 : 0)
      : (WEAVING_URL_DEFAULTS.weaveStitchRevealBleedDraftCoupled ? 1 : 0);
  const stageTranslateXRef = useRef(stageTranslateX ?? 0);
  stageTranslateXRef.current = Number(stageTranslateX) || 0;
  const weaveEnsMarkVisibleRef = useRef(weaveEnsMarkVisible !== false);
  weaveEnsMarkVisibleRef.current = weaveEnsMarkVisible !== false;
  const diagonalRevealProgressRef = useRef(diagonalRevealProgress);
  const diagonalRevealExternalRef = useRef(diagonalRevealProgress != null);
  diagonalRevealProgressRef.current = diagonalRevealProgress ?? diagonalRevealProgressRef.current;
  diagonalRevealExternalRef.current = diagonalRevealProgress != null;
  shimmerPlayingRef.current = shimmerPlaying ?? true;
  shimmerPausedAtTimeRef.current = shimmerPausedAtTime ?? 0;
  shimmerPhaseRef.current = shimmerPhase ?? 0;
  onShimmerTimeRef.current = onShimmerTime;

  useEffect(() => {
    onFpsChangeRef.current?.(fps);
  }, [fps]);

  const run = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const gl = canvas.getContext('webgl', { alpha: true, preserveDrawingBuffer: true }) || canvas.getContext('experimental-webgl', { alpha: true, preserveDrawingBuffer: true });
    if (!gl) {
      setError('WebGL is not supported');
      return;
    }

    setError('');

    let program = null;
    let positionBuffer = null;
    let patternTexture = null;
    let ensMarkTexture = null;
    let animationId = null;
    let resizeObserver = null;
    let startTime = Date.now();
    let lastFrameTime = Date.now();
    let frameCount = 0;
    let uniformLocs = null;
    let patternTexHeight = 0;
    let revealStartTime = 0;
    let lastPatternIndex = -1;
    let ensMarkAspect = ENS_MARK_TEX_ASPECT;
    const list = Array.isArray(patterns) ? patterns : PATTERNS;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const w = rect.width * DPR;
      const h = rect.height * DPR;
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      gl.viewport(0, 0, w, h);
    };

    const setupGeometry = () => {
      positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, QUAD_POSITIONS, gl.STATIC_DRAW);
    };

    const render = () => {
      if (!program || !uniformLocs) return;

      gl.useProgram(program);
      const time = (Date.now() - startTime) / 1000;

      const pIndex = patternIndexRef.current;
      const pi = Math.floor(pIndex);
      if (lastPatternIndex !== -1 && pi !== lastPatternIndex) {
        revealStartTime = (Date.now() - startTime) / 1000;
      }
      lastPatternIndex = pi;

      const pat = list[Math.min(Math.max(0, pi), list.length - 1)] ?? list[0];
      const tileW = pat?.tileW ?? 8;
      const tileH = pat?.tileH ?? 8;

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, patternTexture);
      gl.uniform1i(uniformLocs.patternSampler, 0);
      if (uniformLocs.ensMarkSampler != null && ensMarkTexture) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, ensMarkTexture);
        gl.uniform1i(uniformLocs.ensMarkSampler, 1);
      }
      if (uniformLocs.ensMarkAspect != null) {
        gl.uniform1f(uniformLocs.ensMarkAspect, ensMarkAspect);
      }
      if (uniformLocs.ensMarkVisible != null) {
        gl.uniform1f(uniformLocs.ensMarkVisible, weaveEnsMarkVisibleRef.current ? 1.0 : 0.0);
      }
      gl.uniform1f(uniformLocs.time, time);
      const effectiveShimmerTime = shimmerPlayingRef.current ? time : shimmerPausedAtTimeRef.current;
      if (uniformLocs.shimmerTime != null) gl.uniform1f(uniformLocs.shimmerTime, effectiveShimmerTime);
      if (uniformLocs.shimmerPhase != null) gl.uniform1f(uniformLocs.shimmerPhase, shimmerPhaseRef.current);
      onShimmerTimeRef.current?.(time);
      gl.uniform2f(uniformLocs.resolution, canvas.width, canvas.height);
      if (uniformLocs.stageTranslateX != null) gl.uniform1f(uniformLocs.stageTranslateX, stageTranslateXRef.current);
      gl.uniform1f(uniformLocs.patternIndex, Math.floor(pIndex));
      gl.uniform1f(uniformLocs.tileW, tileW);
      gl.uniform1f(uniformLocs.tileH, tileH);
      gl.uniform1f(uniformLocs.patternTexHeight, patternTexHeight);
      gl.uniform1f(uniformLocs.palette, paletteRef.current);
      gl.uniform1f(uniformLocs.bgShade, bgShadeRef.current);
      gl.uniform1f(uniformLocs.warpShade, warpShadeRef.current);
      gl.uniform1f(uniformLocs.weftShade, weftShadeRef.current);
      gl.uniform1f(uniformLocs.gridSize, gridSizeRef.current);

      const ws = warpShadeRef.current;
      const wes = weftShadeRef.current;
      let wg = warpGradientRef.current || { startShade: ws, endShade: ws, direction: 0, range: [0, 100] };
      let wf = weftGradientRef.current || { startShade: wes, endShade: wes, direction: 0, range: [0, 100] };
      if (!warpGradientEnabledRef.current) wg = { ...wg, startShade: ws, endShade: ws };
      if (!weftGradientEnabledRef.current) wf = { ...wf, startShade: wes, endShade: wes };
      const warpStart = getPaletteColor(palette, wg.startShade);
      const warpEnd = getPaletteColor(palette, wg.endShade);
      const weftStart = getPaletteColor(palette, wf.startShade);
      const weftEnd = getPaletteColor(palette, wf.endShade);
      gl.uniform4f(uniformLocs.warpStart, warpStart[0], warpStart[1], warpStart[2], warpStart[3]);
      gl.uniform4f(uniformLocs.warpEnd, warpEnd[0], warpEnd[1], warpEnd[2], warpEnd[3]);
      gl.uniform4f(uniformLocs.weftStart, weftStart[0], weftStart[1], weftStart[2], weftStart[3]);
      gl.uniform4f(uniformLocs.weftEnd, weftEnd[0], weftEnd[1], weftEnd[2], weftEnd[3]);
      gl.uniform1f(uniformLocs.warpDir, wg.direction || 0);
      gl.uniform1f(uniformLocs.weftDir, wf.direction || 0);
      const wr = wg.range && wg.range.length === 2 ? wg.range : [0, 100];
      const wfr = wf.range && wf.range.length === 2 ? wf.range : [0, 100];
      gl.uniform1f(uniformLocs.warpStartPos, Math.min(wr[0], wr[1]) / 100);
      gl.uniform1f(uniformLocs.warpEndPos, Math.max(wr[0], wr[1]) / 100);
      gl.uniform1f(uniformLocs.weftStartPos, Math.min(wfr[0], wfr[1]) / 100);
      gl.uniform1f(uniformLocs.weftEndPos, Math.max(wfr[0], wfr[1]) / 100);
      gl.uniform1f(uniformLocs.gradSteps, gradStepsRef.current);
      let revealProgress;
      if (diagonalRevealExternalRef.current) {
        revealProgress = Math.max(0, Math.min(1, Number(diagonalRevealProgressRef.current) || 0));
      } else {
        const gs = Math.max(2, gridSizeRef.current ?? 32);
        const ar = canvas.width / Math.max(canvas.height, 1);
        const dur = diagonalRevealDurationSec(gs, ar);
        const elapsed = time - revealStartTime;
        revealProgress = dur > 0 ? Math.min(1, elapsed / dur) : 1;
      }
      gl.uniform1f(uniformLocs.revealProgress, revealProgress);
      gl.uniform1f(uniformLocs.rectAspect, rectAspectRef.current);
      gl.uniform1f(uniformLocs.cornerRadius, cornerRadiusRef.current);
      if (uniformLocs.shimmer != null) gl.uniform1f(uniformLocs.shimmer, shimmerRef.current);
      if (uniformLocs.shimmerSpeed != null) gl.uniform1f(uniformLocs.shimmerSpeed, shimmerSpeedRef.current);
      if (uniformLocs.shimmerWidth != null) gl.uniform1f(uniformLocs.shimmerWidth, shimmerWidthRef.current);
      if (uniformLocs.shimmerIntensity != null) gl.uniform1f(uniformLocs.shimmerIntensity, shimmerIntensityRef.current);
      if (uniformLocs.shimmerPosition != null) gl.uniform1f(uniformLocs.shimmerPosition, shimmerPositionRef.current);
      if (uniformLocs.shimmerRotation != null) gl.uniform1f(uniformLocs.shimmerRotation, shimmerRotationRef.current);
      if (uniformLocs.shimmerNoise != null) gl.uniform1f(uniformLocs.shimmerNoise, shimmerNoiseRef.current);
      if (uniformLocs.shimmerNoiseSeed != null) gl.uniform1f(uniformLocs.shimmerNoiseSeed, shimmerNoiseSeedRef.current);
      if (uniformLocs.shimmerNoiseMin != null) gl.uniform1f(uniformLocs.shimmerNoiseMin, shimmerNoiseMinRef.current);
      if (uniformLocs.shimmerNoiseMax != null) gl.uniform1f(uniformLocs.shimmerNoiseMax, shimmerNoiseMaxRef.current);
      if (uniformLocs.shimmerBlendMode != null) gl.uniform1f(uniformLocs.shimmerBlendMode, shimmerBlendModeRef.current);
      if (uniformLocs.useAllColorways != null) gl.uniform1f(uniformLocs.useAllColorways, useAllColorwaysRef.current);
      if (uniformLocs.colorwaySeed != null) gl.uniform1f(uniformLocs.colorwaySeed, colorwaySeedRef.current);
      if (uniformLocs.colorwayNoiseScale != null) gl.uniform1f(uniformLocs.colorwayNoiseScale, colorwayNoiseScaleRef.current);
      if (uniformLocs.colorwayNoiseMode != null) gl.uniform1f(uniformLocs.colorwayNoiseMode, colorwayNoiseModeRef.current);
      if (uniformLocs.colorwayNoiseOctaves != null) gl.uniform1f(uniformLocs.colorwayNoiseOctaves, colorwayNoiseOctavesRef.current);
      if (uniformLocs.colorwayNoisePersistence != null) gl.uniform1f(uniformLocs.colorwayNoisePersistence, colorwayNoisePersistenceRef.current);
      if (uniformLocs.colorwayNoiseLacunarity != null) gl.uniform1f(uniformLocs.colorwayNoiseLacunarity, colorwayNoiseLacunarityRef.current);
      if (uniformLocs.colorwayNoiseBias != null) gl.uniform1f(uniformLocs.colorwayNoiseBias, colorwayNoiseBiasRef.current);
      if (uniformLocs.colorwayNoiseX != null) gl.uniform1f(uniformLocs.colorwayNoiseX, colorwayNoiseXRef.current);
      if (uniformLocs.colorwayBleedAnisotropy != null) gl.uniform1f(uniformLocs.colorwayBleedAnisotropy, colorwayBleedAnisotropyRef.current);
      if (uniformLocs.colorwayBleedRotation != null) gl.uniform1f(uniformLocs.colorwayBleedRotation, colorwayBleedRotationRef.current);
      if (uniformLocs.colorwayBleedCrossFiber != null) gl.uniform1f(uniformLocs.colorwayBleedCrossFiber, colorwayBleedCrossFiberRef.current);
      if (uniformLocs.colorwayBleedDraftCoupled != null) gl.uniform1f(uniformLocs.colorwayBleedDraftCoupled, colorwayBleedDraftCoupledRef.current);
      const cm = colorwayIncludeMaskRef.current;
      if (uniformLocs.colorwayInclude0123 != null) {
        gl.uniform4f(
          uniformLocs.colorwayInclude0123,
          cm & 1 ? 1 : 0,
          cm & 2 ? 1 : 0,
          cm & 4 ? 1 : 0,
          cm & 8 ? 1 : 0
        );
      }
      if (uniformLocs.colorwayInclude4 != null) gl.uniform1f(uniformLocs.colorwayInclude4, cm & 16 ? 1 : 0);

      if (uniformLocs.stitchRevealMode != null) gl.uniform1f(uniformLocs.stitchRevealMode, stitchRevealModeRef.current);
      if (uniformLocs.stitchRevealProgress != null) gl.uniform1f(uniformLocs.stitchRevealProgress, stitchRevealProgressRef.current);
      if (uniformLocs.stitchRevealSeed != null) gl.uniform1f(uniformLocs.stitchRevealSeed, stitchRevealSeedRef.current);
      if (uniformLocs.stitchRevealScale != null) gl.uniform1f(uniformLocs.stitchRevealScale, stitchRevealScaleRef.current);
      if (uniformLocs.stitchRevealNoiseScale != null) gl.uniform1f(uniformLocs.stitchRevealNoiseScale, stitchRevealNoiseScaleRef.current);
      if (uniformLocs.stitchRevealSoftness != null) gl.uniform1f(uniformLocs.stitchRevealSoftness, stitchRevealSoftnessRef.current);
      if (uniformLocs.stitchRevealBleedAnisotropy != null) gl.uniform1f(uniformLocs.stitchRevealBleedAnisotropy, stitchRevealBleedAnisotropyRef.current);
      if (uniformLocs.stitchRevealBleedRotation != null) gl.uniform1f(uniformLocs.stitchRevealBleedRotation, stitchRevealBleedRotationRef.current);
      if (uniformLocs.stitchRevealBleedCrossFiber != null) gl.uniform1f(uniformLocs.stitchRevealBleedCrossFiber, stitchRevealBleedCrossFiberRef.current);
      if (uniformLocs.stitchRevealBleedDraftCoupled != null) gl.uniform1f(uniformLocs.stitchRevealBleedDraftCoupled, stitchRevealBleedDraftCoupledRef.current);

      // Embed-only hover uniforms: editor leaves them disabled so weave preview matches pre-hover behavior.
      if (uniformLocs.hoverReactive != null) gl.uniform1f(uniformLocs.hoverReactive, 0);
      if (uniformLocs.hoverRevealOnly != null) gl.uniform1f(uniformLocs.hoverRevealOnly, 0);
      if (uniformLocs.hoverMovementBoost != null) gl.uniform1f(uniformLocs.hoverMovementBoost, 0);
      if (uniformLocs.pointerUv != null) gl.uniform2f(uniformLocs.pointerUv, 0.5, 0.5);
      if (uniformLocs.hoverStrength != null) gl.uniform1f(uniformLocs.hoverStrength, 0);
      if (uniformLocs.hoverVelocity != null) gl.uniform1f(uniformLocs.hoverVelocity, 0);
      if (uniformLocs.ripplePhase != null) gl.uniform1f(uniformLocs.ripplePhase, 0);
      if (uniformLocs.rippleWidth != null) gl.uniform1f(uniformLocs.rippleWidth, 0.22);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      /* Ensure GPU work completes before VideoFrame / MediaRecorder samples the canvas (avoids garbage frames). */
      gl.finish();

      frameCount++;
      const now = Date.now();
      const elapsed = now - lastFrameTime;
      if (elapsed >= 1000) {
        setFps(Math.round((frameCount * 1000) / elapsed));
        frameCount = 0;
        lastFrameTime = now;
      }
    };

    const animate = () => {
      render();
      animationId = requestAnimationFrame(animate);
    };

    const compileAndAssign = (vs, fs) => {
      const p = createProgram(gl, vs, fs);
      const locs = getUniformLocs(gl, p);
      if (program) gl.deleteProgram(program);
      program = p;
      uniformLocs = locs;
      setError('');
    };

    try {
      compileAndAssign(vertexSourceRef.current, fragmentSourceRef.current);
      recompileRef.current = (newVertex, newFragment) => {
        try {
          compileAndAssign(newVertex, newFragment);
        } catch (err) { 
          setError(err.message);
        }
      };

      const { data: texData, width: texW, height: texH } = buildPatternTexture(list);
      patternTexHeight = texH;
      patternTexture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, patternTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, texW, texH, 0, gl.RGBA, gl.UNSIGNED_BYTE, texData);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      ensMarkTexture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, ensMarkTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const ensImg = new Image();
      ensImg.onload = () => {
        ensMarkAspect = ensImg.naturalWidth / Math.max(1, ensImg.naturalHeight);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, ensMarkTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, ensImg);
      };
      ensImg.src = ensMarkUrl;

      setupGeometry();

      const posLoc = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(posLoc);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      /** Renders one frame at (w, h), returns PNG blob. Pauses/resumes animation. Capped to EXPORT_MAX_DIMENSION so toBlob won't fail. */
      const captureAtResolution = async (w, h) => {
        let tw = Math.max(1, Math.round(w));
        let th = Math.max(1, Math.round(h));
        if (tw > EXPORT_MAX_DIMENSION || th > EXPORT_MAX_DIMENSION) {
          const r = Math.min(EXPORT_MAX_DIMENSION / tw, EXPORT_MAX_DIMENSION / th);
          tw = Math.round(tw * r);
          th = Math.round(th * r);
        }
        if (animationId) cancelAnimationFrame(animationId);
        animationId = null;
        const prevW = canvas.width;
        const prevH = canvas.height;
        canvas.width = tw;
        canvas.height = th;
        gl.viewport(0, 0, tw, th);
        render();
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        canvas.width = prevW;
        canvas.height = prevH;
        gl.viewport(0, 0, prevW, prevH);
        resize();
        animate();
        if (!blob) throw new Error('Export failed (try lower scale)');
        return blob;
      };

      resize();
      window.addEventListener('resize', resize);
      resizeObserver = new ResizeObserver(() => resize());
      resizeObserver.observe(container);
      animate();
      onCaptureReadyRef.current?.({ captureAtResolution });
    } catch (err) {
      setError(err.message);
    }

    return () => {
      onCaptureReadyRef.current?.(null);
      recompileRef.current = null;
      if (resizeObserver && container) {
        try {
          resizeObserver.disconnect();
        } catch { /* noop */ }
      }
      window.removeEventListener('resize', resize);
      if (animationId) cancelAnimationFrame(animationId);
      if (patternTexture) gl.deleteTexture(patternTexture);
      if (ensMarkTexture) gl.deleteTexture(ensMarkTexture);
      if (program) gl.deleteProgram(program);
    };
  }, [palette, patterns]);

  useEffect(() => {
    const cleanup = run();
    return () => cleanup?.();
  }, [run]);

  // When only shader source changes (e.g. HMR on save), recompile program in place instead of full teardown.
  useEffect(() => {
    const prev = prevShaderRef.current;
    if (prev.vertex !== null && (prev.vertex !== vertexSource || prev.fragment !== fragmentSource)) {
      recompileRef.current?.(vertexSource, fragmentSource);
    }
    prevShaderRef.current = { vertex: vertexSource, fragment: fragmentSource };
  }, [vertexSource, fragmentSource]);

  return { canvasRef, containerRef, error, fps };
}
