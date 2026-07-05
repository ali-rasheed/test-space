/**
 * useImageRectsSandbox — Image Rects WebGL. Samples a texture (static image, animated GIF, or video)
 * per grid cell and draws rounded rects; weave pattern sets orientation (warp/weft).
 * staticImage: upload once on load. video / gif: re-upload each frame so motion shows in the shader.
 * Exposes captureAtResolution(w, h) for sharp copy/export.
 */
const DPR = 2;
import { useRef, useEffect, useCallback, useState } from 'react';
import { buildPatternTexture, PATTERNS } from '../patterns';
import { buildPatternMetaTexture, normalizeTileArtRamp } from '../patterns/tileArtRamp';
import { EXPORT_MAX_DIMENSION } from '../constants';
import { IMAGE_RECTS_URL_DEFAULTS, WEAVING_URL_DEFAULTS } from '../urlDefaults';

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

function createPlaceholderTexture(gl) {
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const pixel = new Uint8Array([60, 60, 70, 255]);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/** Upload HTMLImageElement, HTMLVideoElement, or ImageBitmap to the 2D texture (sRGB). */
/** blob:/data: must not use crossOrigin or decode can fail in WebGL. */
function applyMediaCors(el, src) {
  if (typeof src === 'string' && (src.startsWith('blob:') || src.startsWith('data:'))) return;
  el.crossOrigin = 'anonymous';
}

function uploadSourceToTexture(gl, texture, source) {
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

function hexToRgb01(hex, fallback = [0.95, 0.95, 0.95]) {
  if (typeof hex !== 'string') return fallback;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return fallback;
  const raw = m[1];
  return [
    parseInt(raw.slice(0, 2), 16) / 255,
    parseInt(raw.slice(2, 4), 16) / 255,
    parseInt(raw.slice(4, 6), 16) / 255,
  ];
}

/**
 * When image loads, the hook reports its size via onImageSize(w, h) and imageSize state
 * so the UI can match aspect ratio and resolution (e.g. canvas/capture dimensions).
 * Image is cached by source so changing grid/palette etc. does not reload it.
 * Quantize extras (mode/gamma/dither) map to u_quantize* in fragmentImageRects.glsl.
 * Stitch-in: u_stitchReveal* — animate mosaic visibility from blank (see fragment header).
 */
/**
 * mediaTextureKind: staticImage = one upload after load; video = HTMLVideoElement, upload while playing;
 * gif = HTMLImageElement (animated GIF), upload every frame so frames advance.
 */
export function useImageRectsSandbox(vertexSource, fragmentSource, imageSource, gridSize, palette, bgShade, bgColorMode, bgCustomColor, rectColorSource, quantizeSteps, quantizeMode, quantizeGamma, quantizeDither, rectShade, shadeFrom, patternWarpShade, patternWeftShade, patternIndex, patterns, rectRadius, rectAspect, rectRatio, lumaSizeMix, lumaSizeInvert, lumaSizeFloor, cellGeometryMode, stitchLumaMax, nonStitchShowsBg, contentPadding, stitchRevealMode, stitchRevealProgress, stitchRevealSeed, stitchRevealScale, stitchRevealNoiseScale, stitchRevealSoftness, stitchRevealBleedAnisotropy, stitchRevealBleedRotation, stitchRevealBleedCrossFiber, stitchRevealBleedDraftCoupled, tileArtLevels, tileArtThreshold, tileArtDither, tileArtColorMode, tileArtGeom, tileArtUniformGrid, tileArtDensity, tileArtRamp, useAllColorways, colorwaySeed, colorwayNoiseScale, colorwayNoiseMode, colorwayNoiseOctaves, colorwayNoisePersistence, colorwayNoiseLacunarity, colorwayNoiseBias, colorwayNoiseX, colorwayBleedAnisotropy, colorwayBleedRotation, colorwayBleedCrossFiber, colorwayBleedDraftCoupled, colorwayIncludeMask, onFpsChange, onImageSize, onMediaReady, onCaptureReady, mediaTextureKind = 'staticImage') {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const onFpsChangeRef = useRef(onFpsChange);
  const onImageSizeRef = useRef(onImageSize);
  const onMediaReadyRef = useRef(onMediaReady);
  const onCaptureReadyRef = useRef(onCaptureReady);
  /** Cached decoded media: static img, video element, or gif img — keyed by blob/object URL. */
  const mediaCacheRef = useRef({ source: null, pendingUrl: null, kind: 'staticImage', img: null, video: null });
  const [error, setError] = useState('');
  const [fps, setFps] = useState(0);
  const [imageSize, setImageSize] = useState(null);

  onFpsChangeRef.current = onFpsChange;
  onImageSizeRef.current = onImageSize;
  onMediaReadyRef.current = onMediaReady;
  onCaptureReadyRef.current = onCaptureReady;

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
    let imageTexture = null;
    let patternTexture = null;
    let patternMetaTexture = null;
    let patternTexHeight = 0;
    let patternMetaWidth = 0;
    let animationId = null;
    let resizeObserver = null;
    let lastFrameTime = Date.now();
    let frameCount = 0;
    let uniformLocs = null;

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

    const list = Array.isArray(patterns) ? patterns : PATTERNS;

    const render = () => {
      if (!program || !uniformLocs || !imageTexture || !patternTexture || !patternMetaTexture) return;
      const cache = mediaCacheRef.current;
      if (imageSource && cache.kind === 'video' && cache.video && (cache.source === imageSource || cache.pendingUrl === imageSource)) {
        if (cache.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          try {
            uploadSourceToTexture(gl, imageTexture, cache.video);
          } catch {
            /* ignore transient video frame errors */
          }
        }
      } else if (imageSource && cache.kind === 'gif' && cache.img && cache.source === imageSource && cache.img.complete) {
        try {
          uploadSourceToTexture(gl, imageTexture, cache.img);
        } catch {
          /* ignore */
        }
      }
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, imageTexture);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, patternTexture);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, patternMetaTexture);
      gl.uniform1i(uniformLocs.imageSampler, 0);
      gl.uniform1i(uniformLocs.patternSampler, 1);
      if (uniformLocs.patternMeta != null) gl.uniform1i(uniformLocs.patternMeta, 2);
      gl.uniform2f(uniformLocs.resolution, canvas.width, canvas.height);
      gl.uniform1f(uniformLocs.gridSize, gridSize);
      gl.uniform1f(uniformLocs.palette, palette);
      gl.uniform1f(uniformLocs.bgShade, bgShade);
      gl.uniform1f(uniformLocs.bgUseCustom, bgColorMode ?? 0);
      const [bgR, bgG, bgB] = hexToRgb01(bgCustomColor);
      gl.uniform3f(uniformLocs.bgCustomColor, bgR, bgG, bgB);
      gl.uniform1f(uniformLocs.rectColorSource, rectColorSource);
      gl.uniform1f(uniformLocs.quantizeSteps, quantizeSteps);
      gl.uniform1f(uniformLocs.quantizeMode, quantizeMode);
      gl.uniform1f(uniformLocs.quantizeGamma, quantizeGamma);
      gl.uniform1f(uniformLocs.quantizeDither, quantizeDither);
      gl.uniform1f(uniformLocs.rectShade, rectShade);
      gl.uniform1f(uniformLocs.shadeFrom, shadeFrom);
      gl.uniform1f(uniformLocs.patternWarpShade, patternWarpShade ?? 1);
      gl.uniform1f(uniformLocs.patternWeftShade, patternWeftShade ?? 3);
      gl.uniform1f(uniformLocs.rectRadius, rectRadius ?? 0.18);
      gl.uniform1f(uniformLocs.rectAspect, rectAspect ?? 0.85);
      gl.uniform1f(uniformLocs.rectRatio, rectRatio ?? 1.0);
      gl.uniform1f(uniformLocs.lumaSizeMix, lumaSizeMix ?? 0);
      gl.uniform1f(uniformLocs.lumaSizeInvert, lumaSizeInvert ?? 0);
      gl.uniform1f(uniformLocs.lumaSizeFloor, lumaSizeFloor ?? 0.2);
      gl.uniform1f(uniformLocs.cellGeometryMode, cellGeometryMode ?? 0);
      gl.uniform1f(uniformLocs.stitchLumaMax, stitchLumaMax ?? 0.42);
      gl.uniform1f(uniformLocs.nonStitchShowsBg, nonStitchShowsBg ?? 0);
      gl.uniform1f(uniformLocs.contentPadding, contentPadding ?? 0);
      gl.uniform1f(uniformLocs.stitchRevealMode, stitchRevealMode ?? 0);
      gl.uniform1f(uniformLocs.stitchRevealProgress, stitchRevealProgress ?? 1);
      gl.uniform1f(uniformLocs.stitchRevealSeed, stitchRevealSeed ?? 0);
      gl.uniform1f(uniformLocs.stitchRevealScale, stitchRevealScale ?? 0.12);
      gl.uniform1f(uniformLocs.stitchRevealNoiseScale, stitchRevealNoiseScale ?? IMAGE_RECTS_URL_DEFAULTS.stitchRevealNoiseScale);
      gl.uniform1f(uniformLocs.stitchRevealSoftness, stitchRevealSoftness ?? 0.06);
      gl.uniform1f(uniformLocs.stitchRevealBleedAnisotropy, stitchRevealBleedAnisotropy ?? 3);
      gl.uniform1f(uniformLocs.stitchRevealBleedRotation, stitchRevealBleedRotation ?? 0);
      gl.uniform1f(uniformLocs.stitchRevealBleedCrossFiber, stitchRevealBleedCrossFiber ?? 0.2);
      gl.uniform1f(uniformLocs.stitchRevealBleedDraftCoupled, stitchRevealBleedDraftCoupled ?? 0);
      const pat = list[Math.min(Math.max(0, Math.floor(patternIndex)), list.length - 1)] ?? list[0];
      gl.uniform1f(uniformLocs.patternIndex, Math.floor(patternIndex));
      gl.uniform1f(uniformLocs.tileW, pat?.tileW ?? 8);
      gl.uniform1f(uniformLocs.tileH, pat?.tileH ?? 8);
      gl.uniform1f(uniformLocs.patternTexHeight, patternTexHeight);
      const ramp = normalizeTileArtRamp(tileArtRamp, list);
      if (uniformLocs.tileArtLevels != null) gl.uniform1f(uniformLocs.tileArtLevels, tileArtLevels ?? 8);
      if (uniformLocs.tileArtThreshold != null) gl.uniform1f(uniformLocs.tileArtThreshold, tileArtThreshold ?? 1);
      if (uniformLocs.tileArtDither != null) gl.uniform1f(uniformLocs.tileArtDither, tileArtDither ?? 0);
      if (uniformLocs.tileArtColorMode != null) gl.uniform1f(uniformLocs.tileArtColorMode, tileArtColorMode ?? 0);
      if (uniformLocs.tileArtGeom != null) gl.uniform1f(uniformLocs.tileArtGeom, tileArtGeom ?? 1);
      if (uniformLocs.tileArtUniformGrid != null) gl.uniform1f(uniformLocs.tileArtUniformGrid, tileArtUniformGrid ?? 1);
      if (uniformLocs.tileArtDensity != null) gl.uniform1f(uniformLocs.tileArtDensity, tileArtDensity ?? 0);
      const rampLocs = uniformLocs.tileArtRamp;
      if (rampLocs) {
        for (let i = 0; i < 8; i++) {
          if (rampLocs[i] != null) gl.uniform1f(rampLocs[i], ramp[i]);
        }
      }
      if (uniformLocs.patternMetaWidth != null) gl.uniform1f(uniformLocs.patternMetaWidth, patternMetaWidth);
      const cwDef = WEAVING_URL_DEFAULTS;
      const uac = useAllColorways ?? cwDef.useAllColorways;
      const cwm = colorwayIncludeMask ?? cwDef.colorwayIncludeMask;
      if (uniformLocs.useAllColorways != null) gl.uniform1f(uniformLocs.useAllColorways, uac ? 1 : 0);
      if (uniformLocs.colorwaySeed != null) gl.uniform1f(uniformLocs.colorwaySeed, colorwaySeed ?? cwDef.colorwaySeed);
      if (uniformLocs.colorwayNoiseScale != null) gl.uniform1f(uniformLocs.colorwayNoiseScale, colorwayNoiseScale ?? cwDef.colorwayNoiseScale);
      if (uniformLocs.colorwayNoiseMode != null) gl.uniform1f(uniformLocs.colorwayNoiseMode, colorwayNoiseMode ?? cwDef.colorwayNoiseMode);
      if (uniformLocs.colorwayNoiseOctaves != null) gl.uniform1f(uniformLocs.colorwayNoiseOctaves, colorwayNoiseOctaves ?? cwDef.colorwayNoiseOctaves);
      if (uniformLocs.colorwayNoisePersistence != null) gl.uniform1f(uniformLocs.colorwayNoisePersistence, colorwayNoisePersistence ?? cwDef.colorwayNoisePersistence);
      if (uniformLocs.colorwayNoiseLacunarity != null) gl.uniform1f(uniformLocs.colorwayNoiseLacunarity, colorwayNoiseLacunarity ?? cwDef.colorwayNoiseLacunarity);
      if (uniformLocs.colorwayNoiseBias != null) gl.uniform1f(uniformLocs.colorwayNoiseBias, colorwayNoiseBias ?? cwDef.colorwayNoiseBias);
      if (uniformLocs.colorwayNoiseX != null) gl.uniform1f(uniformLocs.colorwayNoiseX, colorwayNoiseX ?? cwDef.colorwayNoiseX);
      if (uniformLocs.colorwayBleedAnisotropy != null) gl.uniform1f(uniformLocs.colorwayBleedAnisotropy, colorwayBleedAnisotropy ?? cwDef.colorwayBleedAnisotropy);
      if (uniformLocs.colorwayBleedRotation != null) gl.uniform1f(uniformLocs.colorwayBleedRotation, colorwayBleedRotation ?? cwDef.colorwayBleedRotation);
      if (uniformLocs.colorwayBleedCrossFiber != null) gl.uniform1f(uniformLocs.colorwayBleedCrossFiber, colorwayBleedCrossFiber ?? cwDef.colorwayBleedCrossFiber);
      if (uniformLocs.colorwayBleedDraftCoupled != null) gl.uniform1f(uniformLocs.colorwayBleedDraftCoupled, (colorwayBleedDraftCoupled ?? cwDef.colorwayBleedDraftCoupled) ? 1 : 0);
      if (uniformLocs.colorwayInclude0123 != null) {
        gl.uniform4f(
          uniformLocs.colorwayInclude0123,
          cwm & 1 ? 1 : 0,
          cwm & 2 ? 1 : 0,
          cwm & 4 ? 1 : 0,
          cwm & 8 ? 1 : 0,
        );
      }
      if (uniformLocs.colorwayInclude4 != null) gl.uniform1f(uniformLocs.colorwayInclude4, cwm & 16 ? 1 : 0);
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

    try {
      program = createProgram(gl, vertexSource, fragmentSource);
      uniformLocs = {
        resolution: gl.getUniformLocation(program, 'u_resolution'),
        gridSize: gl.getUniformLocation(program, 'u_gridSize'),
        imageSampler: gl.getUniformLocation(program, 'u_imageSampler'),
        patternSampler: gl.getUniformLocation(program, 'u_patternSampler'),
        patternIndex: gl.getUniformLocation(program, 'u_patternIndex'),
        tileW: gl.getUniformLocation(program, 'u_tileW'),
        tileH: gl.getUniformLocation(program, 'u_tileH'),
        patternTexHeight: gl.getUniformLocation(program, 'u_patternTexHeight'),
        palette: gl.getUniformLocation(program, 'u_palette'),
        bgShade: gl.getUniformLocation(program, 'u_bgShade'),
        bgUseCustom: gl.getUniformLocation(program, 'u_bgUseCustom'),
        bgCustomColor: gl.getUniformLocation(program, 'u_bgCustomColor'),
        rectColorSource: gl.getUniformLocation(program, 'u_rectColorSource'),
        quantizeSteps: gl.getUniformLocation(program, 'u_quantizeSteps'),
        quantizeMode: gl.getUniformLocation(program, 'u_quantizeMode'),
        quantizeGamma: gl.getUniformLocation(program, 'u_quantizeGamma'),
        quantizeDither: gl.getUniformLocation(program, 'u_quantizeDither'),
        rectShade: gl.getUniformLocation(program, 'u_rectShade'),
        shadeFrom: gl.getUniformLocation(program, 'u_shadeFrom'),
        patternWarpShade: gl.getUniformLocation(program, 'u_patternWarpShade'),
        patternWeftShade: gl.getUniformLocation(program, 'u_patternWeftShade'),
        rectRadius: gl.getUniformLocation(program, 'u_rectRadius'),
        rectAspect: gl.getUniformLocation(program, 'u_rectAspect'),
        rectRatio: gl.getUniformLocation(program, 'u_rectRatio'),
        lumaSizeMix: gl.getUniformLocation(program, 'u_lumaSizeMix'),
        lumaSizeInvert: gl.getUniformLocation(program, 'u_lumaSizeInvert'),
        lumaSizeFloor: gl.getUniformLocation(program, 'u_lumaSizeFloor'),
        cellGeometryMode: gl.getUniformLocation(program, 'u_cellGeometryMode'),
        stitchLumaMax: gl.getUniformLocation(program, 'u_stitchLumaMax'),
        nonStitchShowsBg: gl.getUniformLocation(program, 'u_nonStitchShowsBg'),
        contentPadding: gl.getUniformLocation(program, 'u_contentPadding'),
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
        tileArtLevels: gl.getUniformLocation(program, 'u_tileArtLevels'),
        tileArtThreshold: gl.getUniformLocation(program, 'u_tileArtThreshold'),
        tileArtDither: gl.getUniformLocation(program, 'u_tileArtDither'),
        tileArtColorMode: gl.getUniformLocation(program, 'u_tileArtColorMode'),
        tileArtGeom: gl.getUniformLocation(program, 'u_tileArtGeom'),
        tileArtUniformGrid: gl.getUniformLocation(program, 'u_tileArtUniformGrid'),
        tileArtDensity: gl.getUniformLocation(program, 'u_tileArtDensity'),
        patternMeta: gl.getUniformLocation(program, 'u_patternMeta'),
        patternMetaWidth: gl.getUniformLocation(program, 'u_patternMetaWidth'),
        tileArtRamp: [
          gl.getUniformLocation(program, 'u_tileArtRamp0'),
          gl.getUniformLocation(program, 'u_tileArtRamp1'),
          gl.getUniformLocation(program, 'u_tileArtRamp2'),
          gl.getUniformLocation(program, 'u_tileArtRamp3'),
          gl.getUniformLocation(program, 'u_tileArtRamp4'),
          gl.getUniformLocation(program, 'u_tileArtRamp5'),
          gl.getUniformLocation(program, 'u_tileArtRamp6'),
          gl.getUniformLocation(program, 'u_tileArtRamp7'),
        ],
      };

      imageTexture = createPlaceholderTexture(gl);

      const { data: texData, width: texW, height: texH } = buildPatternTexture(list);
      patternTexHeight = texH;
      patternTexture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, patternTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, texW, texH, 0, gl.RGBA, gl.UNSIGNED_BYTE, texData);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      const { data: metaData, width: metaW } = buildPatternMetaTexture(list);
      patternMetaWidth = metaW;
      patternMetaTexture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, patternMetaTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, metaW, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, metaData);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      const cache = mediaCacheRef.current;
      const kind = mediaTextureKind === 'video' ? 'video' : mediaTextureKind === 'gif' ? 'gif' : 'staticImage';

      /** True when the active imageSource is decoded and uploaded (not the 1×1 placeholder). */
      const isSourceReady = () => {
        if (!imageSource) return false;
        const c = mediaCacheRef.current;
        if (c.source !== imageSource && c.pendingUrl !== imageSource) return false;
        if (c.kind === 'video') {
          return !!(
            c.video
            && c.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
            && c.video.videoWidth > 0
            && c.video.videoHeight > 0
          );
        }
        return !!(c.img?.complete && c.img.naturalWidth > 0 && c.img.naturalHeight > 0);
      };

      const notifyMediaReady = () => {
        if (isSourceReady()) onMediaReadyRef.current?.();
      };

      const waitForSourceReady = (maxAttempts = 120) =>
        new Promise((resolve) => {
          let attempts = 0;
          const tick = () => {
            if (!imageSource) {
              resolve(false);
              return;
            }
            if (isSourceReady()) {
              resolve(true);
              return;
            }
            if (++attempts >= maxAttempts) {
              resolve(false);
              return;
            }
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });

      const stopVideo = () => {
        if (cache.video) {
          try {
            cache.video.pause();
            cache.video.removeAttribute('src');
            cache.video.load();
          } catch {
            /* ignore */
          }
          cache.video = null;
        }
        cache.pendingUrl = null;
      };

      if (imageSource) {
        const videoStillLoading = kind === 'video' && cache.video && cache.pendingUrl === imageSource;
        const cacheHit = imageSource && (
          (cache.source === imageSource && (
            (kind === 'video' && cache.video)
            || (kind !== 'video' && cache.img?.complete)
          ))
          || videoStillLoading
        );
        if (cacheHit) {
          if (kind === 'video' && cache.video) {
            const w = cache.video.videoWidth;
            const h = cache.video.videoHeight;
            if (w > 0 && h > 0) {
              if (cache.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                uploadSourceToTexture(gl, imageTexture, cache.video);
              }
              setImageSize({ width: w, height: h });
              onImageSizeRef.current?.(w, h);
              notifyMediaReady();
            }
          } else if (cache.img?.complete) {
            uploadSourceToTexture(gl, imageTexture, cache.img);
            setImageSize({ width: cache.img.naturalWidth, height: cache.img.naturalHeight });
            onImageSizeRef.current?.(cache.img.naturalWidth, cache.img.naturalHeight);
            notifyMediaReady();
          }
        } else {
          cache.source = null;
          cache.img = null;
          stopVideo();
          cache.kind = kind;

          if (kind === 'video') {
            const video = document.createElement('video');
            video.muted = true;
            video.loop = true;
            video.playsInline = true;
            video.setAttribute('playsinline', '');
            video.setAttribute('webkit-playsinline', '');
            applyMediaCors(video, imageSource);
            video.preload = 'auto';
            cache.video = video;
            cache.pendingUrl = imageSource;
            video.onloadedmetadata = () => {
              const w = video.videoWidth;
              const h = video.videoHeight;
              if (w > 0 && h > 0) {
                setImageSize({ width: w, height: h });
                onImageSizeRef.current?.(w, h);
              }
            };
            video.onerror = () => {
              setError('Failed to load video');
              setImageSize(null);
              stopVideo();
              cache.source = null;
            };
            video.oncanplay = () => {
              cache.source = imageSource;
              cache.pendingUrl = null;
              if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                uploadSourceToTexture(gl, imageTexture, video);
              }
              notifyMediaReady();
            };
            video.src = imageSource;
            video.play().catch(() => {
              setError('Video play blocked — try picking the file again');
            });
          } else {
            const img = new Image();
            applyMediaCors(img, imageSource);
            img.onload = () => {
              cache.source = imageSource;
              cache.img = img;
              uploadSourceToTexture(gl, imageTexture, img);
              const w = img.naturalWidth;
              const h = img.naturalHeight;
              setImageSize({ width: w, height: h });
              onImageSizeRef.current?.(w, h);
              notifyMediaReady();
            };
            img.onerror = () => {
              setError(kind === 'gif' ? 'Failed to load GIF' : 'Failed to load image');
              setImageSize(null);
            };
            img.src = imageSource;
          }
        }
      } else {
        cache.source = null;
        cache.img = null;
        stopVideo();
        cache.kind = 'staticImage';
        setImageSize(null);
      }

      setupGeometry();
      const posLoc = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(posLoc);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      /** Renders one frame at (w, h), returns PNG blob. Waits for decoded media; returns null if none/timeout. */
      const captureAtResolution = async (w, h) => {
        if (!imageSource) return null;
        const ready = await waitForSourceReady();
        if (!ready) return null;
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
        const snap = mediaCacheRef.current;
        if (snap.kind === 'video' && snap.video?.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          uploadSourceToTexture(gl, imageTexture, snap.video);
        } else if (snap.img?.complete) {
          uploadSourceToTexture(gl, imageTexture, snap.img);
        }
        render();
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        canvas.width = prevW;
        canvas.height = prevH;
        gl.viewport(0, 0, prevW, prevH);
        resize();
        animate();
        if (!blob) throw new Error('Capture failed (try lower scale)');
        return blob;
      };

      resize();
      window.addEventListener('resize', resize);
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => resize());
        resizeObserver.observe(container);
      }
      animate();
      onCaptureReadyRef.current?.({ captureAtResolution, isMediaReady: isSourceReady });
    } catch (err) {
      setError(err.message);
    }

    return () => {
      onCaptureReadyRef.current?.(null);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resize);
      if (animationId) cancelAnimationFrame(animationId);
      if (imageTexture) gl.deleteTexture(imageTexture);
      if (patternTexture) gl.deleteTexture(patternTexture);
      if (patternMetaTexture) gl.deleteTexture(patternMetaTexture);
      if (program) gl.deleteProgram(program);
    };
  }, [vertexSource, fragmentSource, imageSource, gridSize, palette, bgShade, bgColorMode, bgCustomColor, rectColorSource, quantizeSteps, quantizeMode, quantizeGamma, quantizeDither, rectShade, shadeFrom, patternWarpShade, patternWeftShade, patternIndex, patterns, rectRadius, rectAspect, rectRatio, lumaSizeMix, lumaSizeInvert, lumaSizeFloor, cellGeometryMode, stitchLumaMax, nonStitchShowsBg, contentPadding, stitchRevealMode, stitchRevealProgress, stitchRevealSeed, stitchRevealScale, stitchRevealNoiseScale, stitchRevealSoftness, stitchRevealBleedAnisotropy, stitchRevealBleedRotation, stitchRevealBleedCrossFiber, stitchRevealBleedDraftCoupled, tileArtLevels, tileArtThreshold, tileArtDither, tileArtColorMode, tileArtGeom, tileArtUniformGrid, tileArtDensity, tileArtRamp, useAllColorways, colorwaySeed, colorwayNoiseScale, colorwayNoiseMode, colorwayNoiseOctaves, colorwayNoisePersistence, colorwayNoiseLacunarity, colorwayNoiseBias, colorwayNoiseX, colorwayBleedAnisotropy, colorwayBleedRotation, colorwayBleedCrossFiber, colorwayBleedDraftCoupled, colorwayIncludeMask, mediaTextureKind]);

  useEffect(() => {
    const cleanup = run();
    return () => cleanup?.();
  }, [run]);

  return { canvasRef, containerRef, error, fps, imageSize };
}
