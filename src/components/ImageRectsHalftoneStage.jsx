/**
 * ImageRectsHalftoneStage — Mosaic/Image rects → CMYK halftone (Print mode).
 * Offscreen capture at image resolution; HalftoneCmyk is sized to the same image-aspect
 * viewport box as ImageRectsCanvas (Fit/Fill + rect inset padding baked into capture).
 * Output is alpha-composited with the mosaic capture so PNG/transparent BG survive halftone.
 */
import { useRef, useState, useEffect, useCallback } from 'react';
import { HalftoneCmyk } from '@paper-design/shaders-react';
import { ImageRectsCapture } from './ImageRectsCapture';
import { useAspectViewportBox } from '../hooks/useAspectViewportBox';
import { compositeHalftoneWithAlphaMask } from '../halftoneAlphaComposite';
import { WEAVING_URL_DEFAULTS } from '../urlDefaults';

const CAPTURE_AFTER_MEDIA_MS = 80;
const CAPTURE_MAX_ATTEMPTS = 180;
const WEB_GL_ATTRS = { preserveDrawingBuffer: true, alpha: true };
const CAPTURE_DPR = 2;

function isCaptureReady(canvas, layoutW, layoutH) {
  if (!canvas || layoutW < 1 || layoutH < 1) return false;
  const minW = Math.round(layoutW * CAPTURE_DPR * 0.5);
  const minH = Math.round(layoutH * CAPTURE_DPR * 0.5);
  return canvas.width >= minW && canvas.height >= minH;
}

function scheduleCaptureWhenReady(canvasRef, layoutW, layoutH, capture, maxAttempts = 90) {
  let attempts = 0;
  let cancelled = false;
  const tick = () => {
    if (cancelled || attempts++ >= maxAttempts) return;
    if (isCaptureReady(canvasRef.current, layoutW, layoutH)) {
      capture();
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return () => {
    cancelled = true;
  };
}

export function ImageRectsHalftoneStage({
  imageSource,
  mediaTextureKind = 'staticImage',
  gridSize,
  palette,
  bgShade,
  bgColorMode = 0,
  bgCustomColor = '#f2f2f2',
  rectColorSource,
  quantizeSteps,
  quantizeMode,
  quantizeGamma,
  quantizeDither,
  rectShade,
  shadeFrom,
  patternWarpShade,
  patternWeftShade,
  patternIndex,
  patterns,
  rectRadius,
  rectAspect,
  rectRatio,
  lumaSizeMix,
  lumaSizeInvert,
  lumaSizeFloor,
  cellGeometryMode,
  stitchLumaMax,
  nonStitchShowsBg = false,
  contentPadding = 0,
  stitchRevealMode = 0,
  stitchRevealProgress = 1,
  stitchRevealSeed = 0,
  stitchRevealScale = 0.12,
  stitchRevealNoiseScale = 1,
  stitchRevealSoftness = 0.06,
  stitchRevealBleedAnisotropy = 3,
  stitchRevealBleedRotation = 0,
  stitchRevealBleedCrossFiber = 0.2,
  stitchRevealBleedDraftCoupled = 0,
  tileArtLevels = 8,
  tileArtThreshold = 1,
  tileArtDither = 0,
  tileArtColorMode = 0,
  tileArtGeom = 1,
  tileArtUniformGrid = 1,
  tileArtDensity = 0,
  tileArtRamp,
  useAllColorways = WEAVING_URL_DEFAULTS.useAllColorways,
  colorwaySeed = WEAVING_URL_DEFAULTS.colorwaySeed,
  colorwayNoiseScale = WEAVING_URL_DEFAULTS.colorwayNoiseScale,
  colorwayNoiseMode = WEAVING_URL_DEFAULTS.colorwayNoiseMode,
  colorwayNoiseOctaves = WEAVING_URL_DEFAULTS.colorwayNoiseOctaves,
  colorwayNoisePersistence = WEAVING_URL_DEFAULTS.colorwayNoisePersistence,
  colorwayNoiseLacunarity = WEAVING_URL_DEFAULTS.colorwayNoiseLacunarity,
  colorwayNoiseBias = WEAVING_URL_DEFAULTS.colorwayNoiseBias,
  colorwayNoiseX = WEAVING_URL_DEFAULTS.colorwayNoiseX,
  colorwayBleedAnisotropy = WEAVING_URL_DEFAULTS.colorwayBleedAnisotropy,
  colorwayBleedRotation = WEAVING_URL_DEFAULTS.colorwayBleedRotation,
  colorwayBleedCrossFiber = WEAVING_URL_DEFAULTS.colorwayBleedCrossFiber,
  colorwayBleedDraftCoupled = WEAVING_URL_DEFAULTS.colorwayBleedDraftCoupled,
  colorwayIncludeMask = WEAVING_URL_DEFAULTS.colorwayIncludeMask,
  patternFit = 'fit',
  size,
  softness,
  gridNoise,
  contrast,
  type,
  colorBack,
  colorC,
  colorM,
  colorY,
  colorK,
  floodC,
  gainC,
  gainY,
  halftoneContainerRef,
  halftoneCanvasRef,
}) {
  const canvasRef = useRef(null);
  const halftoneSourceCanvasRef = useRef(null);
  const outputCanvasRef = useRef(null);
  const pendingCaptureSizeRef = useRef({ w: 1280, h: 720 });
  const captureSizeRef = useRef({ w: 1280, h: 720 });
  const mediaReadyRef = useRef(false);
  const [captureError, setCaptureError] = useState('');
  const [imageSize, setImageSize] = useState(null);
  const [captureDimensions, setCaptureDimensions] = useState({ width: 1280, height: 720 });
  const { width: captureW, height: captureH } = captureDimensions;
  const [capturedDataUrl, setCapturedDataUrl] = useState('');

  const viewportMode = patternFit === 'fill' ? 'cover' : 'contain';
  const halftoneFit = viewportMode;
  const aspectRatio =
    imageSize && imageSize.width > 0 && imageSize.height > 0
      ? imageSize.width / imageSize.height
      : 1;
  const { outerRef, width: boxW, height: boxH } = useAspectViewportBox(viewportMode, aspectRatio);
  const halftoneW = Math.max(1, Math.round(boxW));
  const halftoneH = Math.max(1, Math.round(boxH));

  const MAX_CAPTURE = 2048;
  captureSizeRef.current = { w: captureW, h: captureH };

  const capture = useCallback(() => {
    if (!imageSource || !mediaReadyRef.current) return null;
    const canvas = canvasRef.current;
    const { w, h } = captureSizeRef.current;
    if (!isCaptureReady(canvas, w, h)) return null;
    try {
      const dataUrl = canvas.toDataURL('image/png');
      setCapturedDataUrl(dataUrl);
      setCaptureError('');
      return dataUrl;
    } catch (err) {
      setCaptureError(err?.message || 'Capture failed');
      return null;
    }
  }, [imageSource]);

  const scheduleCapture = useCallback(() => {
    if (!imageSource || !mediaReadyRef.current) return undefined;
    const { w, h } = captureSizeRef.current;
    return scheduleCaptureWhenReady(canvasRef, w, h, capture, CAPTURE_MAX_ATTEMPTS);
  }, [imageSource, capture]);

  const handleImageSize = useCallback((w, h) => {
    if (!w || !h) return;
    setImageSize({ width: w, height: h });
    const scale = Math.min(1, MAX_CAPTURE / Math.max(w, h));
    const cw = Math.round(w * scale);
    const ch = Math.round(h * scale);
    pendingCaptureSizeRef.current = { w: cw, h: ch };
    captureSizeRef.current = { w: cw, h: ch };
    setCaptureDimensions({ width: cw, height: ch });
  }, []);

  const handleMediaReady = useCallback(() => {
    mediaReadyRef.current = true;
    const { w, h } = pendingCaptureSizeRef.current;
    captureSizeRef.current = { w, h };
    setTimeout(() => {
      scheduleCaptureWhenReady(canvasRef, w, h, capture, CAPTURE_MAX_ATTEMPTS);
    }, CAPTURE_AFTER_MEDIA_MS);
  }, [capture]);

  const handleCaptureError = useCallback((msg) => {
    setCaptureError(msg || '');
    setCapturedDataUrl('');
  }, []);

  const handleCanvasRef = useCallback((el) => {
    canvasRef.current = el;
    if (el && imageSource && mediaReadyRef.current) scheduleCapture();
  }, [imageSource, scheduleCapture]);

  const handleOutputCanvasRef = useCallback((el) => {
    outputCanvasRef.current = el;
    if (halftoneCanvasRef) halftoneCanvasRef.current = el;
  }, [halftoneCanvasRef]);

  useEffect(() => {
    mediaReadyRef.current = false;
    setCapturedDataUrl('');
    setCaptureError('');
    setImageSize(null);
  }, [imageSource]);

  useEffect(() => scheduleCapture(), [
    imageSource,
    mediaTextureKind,
    gridSize,
    palette,
    bgShade,
    bgColorMode,
    bgCustomColor,
    rectColorSource,
    quantizeSteps,
    quantizeMode,
    quantizeGamma,
    quantizeDither,
    shadeFrom,
    patternWarpShade,
    patternWeftShade,
    patternIndex,
    rectRadius,
    rectAspect,
    rectRatio,
    lumaSizeMix,
    lumaSizeInvert,
    lumaSizeFloor,
    cellGeometryMode,
    stitchLumaMax,
    nonStitchShowsBg,
    contentPadding,
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
    tileArtLevels,
    tileArtThreshold,
    tileArtDither,
    tileArtColorMode,
    tileArtGeom,
    tileArtUniformGrid,
    tileArtDensity,
    tileArtRamp,
    capture,
    captureW,
    captureH,
    scheduleCapture,
  ]);

  // Locate Paper halftone source canvas (hidden layer).
  useEffect(() => {
    if (!capturedDataUrl || !halftoneContainerRef?.current) return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 120;
    const findCanvas = () => {
      if (cancelled || attempts++ >= maxAttempts) return;
      const el = halftoneContainerRef.current;
      const canvas = el?.querySelector?.('[data-halftone-source] canvas');
      if (canvas && canvas.width > 0 && canvas.height > 0) {
        halftoneSourceCanvasRef.current = canvas;
        return;
      }
      requestAnimationFrame(findCanvas);
    };
    findCanvas();
    return () => {
      cancelled = true;
      halftoneSourceCanvasRef.current = null;
    };
  }, [capturedDataUrl, halftoneContainerRef, halftoneW, halftoneH]);

  // rAF: composite halftone + mosaic alpha mask → visible output canvas.
  useEffect(() => {
    if (!capturedDataUrl || halftoneW < 1 || halftoneH < 1) return undefined;
    let rafId = 0;
    const tick = () => {
      const halftoneCanvas = halftoneSourceCanvasRef.current;
      const maskCanvas = canvasRef.current;
      const outputCanvas = outputCanvasRef.current;
      if (halftoneCanvas && maskCanvas && outputCanvas) {
        compositeHalftoneWithAlphaMask(
          outputCanvas,
          halftoneCanvas,
          maskCanvas,
          halftoneW,
          halftoneH,
          halftoneFit,
        );
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [capturedDataUrl, halftoneW, halftoneH, halftoneFit]);

  useEffect(() => {
    return () => {
      if (halftoneCanvasRef) halftoneCanvasRef.current = null;
    };
  }, [halftoneCanvasRef]);

  const captureProps = {
    imageSource,
    mediaTextureKind,
    gridSize,
    palette,
    bgShade,
    bgColorMode,
    bgCustomColor,
    rectColorSource,
    quantizeSteps,
    quantizeMode,
    quantizeGamma,
    quantizeDither,
    rectShade,
    shadeFrom,
    patternWarpShade,
    patternWeftShade,
    patternIndex,
    patterns,
    rectRadius,
    rectAspect,
    rectRatio,
    lumaSizeMix,
    lumaSizeInvert,
    lumaSizeFloor,
    cellGeometryMode,
    stitchLumaMax,
    nonStitchShowsBg,
    contentPadding,
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
    tileArtLevels,
    tileArtThreshold,
    tileArtDither,
    tileArtColorMode,
    tileArtGeom,
    tileArtUniformGrid,
    tileArtDensity,
    tileArtRamp,
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
  };

  return (
    <div
      ref={outerRef}
      className="relative flex h-full min-h-0 min-w-0 w-full flex-1 self-stretch items-center justify-center overflow-hidden"
    >
      <div
        aria-hidden
        className="absolute overflow-hidden"
        style={{ left: '-9999px', top: 0, width: captureW, height: captureH }}
      >
        <ImageRectsCapture
          key={imageSource || 'no-image'}
          width={captureW}
          height={captureH}
          {...captureProps}
          onCanvasRef={handleCanvasRef}
          onImageSize={handleImageSize}
          onMediaReady={handleMediaReady}
          onCaptureError={handleCaptureError}
        />
      </div>

      <div
        ref={halftoneContainerRef}
        className="relative flex shrink-0 flex-col overflow-hidden rounded-md border border-border-subtle bg-transparent"
        style={{ width: boxW, height: boxH }}
      >
        {capturedDataUrl && boxW > 0 && boxH > 0 ? (
          <>
            <canvas
              ref={handleOutputCanvasRef}
              className="relative z-10 block size-full"
              width={halftoneW}
              height={halftoneH}
              style={{ width: boxW, height: boxH }}
            />
            <div
              data-halftone-source
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-0"
            >
              <HalftoneCmyk
                width={halftoneW}
                height={halftoneH}
                image={capturedDataUrl}
                colorBack={colorBack}
                colorC={colorC}
                colorM={colorM}
                colorY={colorY}
                colorK={colorK}
                size={size}
                gridNoise={gridNoise}
                type={type}
                softness={softness}
                contrast={contrast}
                floodC={floodC}
                floodM={0}
                floodY={0}
                floodK={0}
                gainC={gainC}
                gainM={0}
                gainY={gainY}
                gainK={0}
                grainMixer={0}
                grainOverlay={0}
                grainSize={0.5}
                fit={halftoneFit}
                webGlContextAttributes={WEB_GL_ATTRS}
              />
            </div>
          </>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-4 text-center text-text-muted">
            {captureError ? (
              <span className="text-error text-sm">{captureError}</span>
            ) : (
              <span>{imageSource ? 'Preparing…' : 'Pick media above'}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
