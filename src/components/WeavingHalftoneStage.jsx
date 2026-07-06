/**
 * WeavingHalftoneStage — Renders weaving as the image source for Halftone CMYK.
 * Renders a hidden ShaderCanvas, captures it to a data URL (on param change + throttled when
 * shimmer is on or **weave stitch-in** mode is active), and passes the URL to HalftoneCmyk.
 * **stageTranslateX** is passed through to **ShaderCanvas** so the weave source matches the main Weave tab.
 * **weaveEnsMarkVisible** matches flat Weave (ENS mark in fragment); halftone capture reflects the same toggle.
 * Main area shows only the halftone result.
 */
import { useRef, useState, useEffect, useCallback } from 'react';
import { HalftoneCmyk } from '@paper-design/shaders-react';
import { ShaderCanvas } from './ShaderCanvas';
import { RECT_ASPECT_DEFAULT } from '../constants';
import { WEAVING_URL_DEFAULTS } from '../urlDefaults';

const CAPTURE_THROTTLE_MS = 120; // ~8 fps when shimmer is animating
const WEB_GL_ATTRS = { preserveDrawingBuffer: true };
/** Must match useShaderSandbox DPR — offscreen weave canvas should be layout×DPR before capture. */
const CAPTURE_DPR = 2;

function isCaptureReady(canvas, layoutW, layoutH) {
  if (!canvas || layoutW < 1 || layoutH < 1) return false;
  const minW = Math.round(layoutW * CAPTURE_DPR * 0.5);
  const minH = Math.round(layoutH * CAPTURE_DPR * 0.5);
  return canvas.width >= minW && canvas.height >= minH;
}

/** Poll until offscreen weave canvas matches layout (WebGL resize is async). */
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

export function WeavingHalftoneStage({
  patterns,
  patternIndex,
  palette,
  bgShade,
  warpShade,
  weftShade,
  gridSize,
  warpGradient,
  weftGradient,
  warpGradientEnabled = WEAVING_URL_DEFAULTS.warpGradientEnabled,
  weftGradientEnabled = WEAVING_URL_DEFAULTS.weftGradientEnabled,
  gradSteps,
  rectAspect,
  cornerRadius,
  canvasAspect,
  patternFit = 'fit',
  shimmer,
  shimmerSpeed,
  shimmerPlaying,
  shimmerPausedAtTime,
  shimmerPhase,
  onShimmerTime,
  shimmerWidth,
  shimmerIntensity,
  shimmerPosition,
  shimmerRotation,
  shimmerNoise,
  shimmerNoiseSeed,
  shimmerNoiseMin,
  shimmerNoiseMax,
  shimmerBlendMode,
  useAllColorways,
  colorwaySeed,
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
  weaveStitchRevealMode = WEAVING_URL_DEFAULTS.weaveStitchRevealMode,
  weaveStitchRevealProgress = WEAVING_URL_DEFAULTS.weaveStitchRevealProgress,
  weaveStitchRevealSeed = WEAVING_URL_DEFAULTS.weaveStitchRevealSeed,
  weaveStitchRevealScale = WEAVING_URL_DEFAULTS.weaveStitchRevealScale,
  weaveStitchRevealNoiseScale = WEAVING_URL_DEFAULTS.weaveStitchRevealNoiseScale,
  weaveStitchRevealSoftness = WEAVING_URL_DEFAULTS.weaveStitchRevealSoftness,
  weaveStitchRevealBleedAnisotropy = WEAVING_URL_DEFAULTS.weaveStitchRevealBleedAnisotropy,
  weaveStitchRevealBleedRotation = WEAVING_URL_DEFAULTS.weaveStitchRevealBleedRotation,
  weaveStitchRevealBleedCrossFiber = WEAVING_URL_DEFAULTS.weaveStitchRevealBleedCrossFiber,
  weaveStitchRevealBleedDraftCoupled = WEAVING_URL_DEFAULTS.weaveStitchRevealBleedDraftCoupled,
  diagonalRevealProgress,
  stageTranslateX = 0,
  weaveEnsMarkVisible = WEAVING_URL_DEFAULTS.weaveEnsMarkVisible,
  // Halftone params
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
  /** When set, use this as halftone source instead of captured weaving (e.g. image from desktop). */
  customImageUrl,
}) {
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 1280, height: 720 });
  const { width, height } = dimensions;
  const weavingCanvasRef = useRef(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState('');
  const rafRef = useRef(null);

  const capture = useCallback(() => {
    const canvas = weavingCanvasRef.current;
    if (!isCaptureReady(canvas, width, height)) return null;
    try {
      const dataUrl = canvas.toDataURL('image/png');
      setCapturedDataUrl(dataUrl);
      return dataUrl;
    } catch {
      return null;
    }
  }, [width, height]);

  // Capture once when canvas is ready or weaving params change (non-shimmer).
  useEffect(() => {
    return scheduleCaptureWhenReady(weavingCanvasRef, width, height, capture);
  }, [
    patternIndex,
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
    shimmer,
    shimmerSpeed,
    shimmerWidth,
    shimmerIntensity,
    shimmerPosition,
    shimmerRotation,
    shimmerNoise,
    shimmerNoiseSeed,
    shimmerNoiseMin,
    shimmerNoiseMax,
    shimmerBlendMode,
    weaveStitchRevealMode,
    weaveStitchRevealProgress,
    weaveStitchRevealSeed,
    weaveStitchRevealScale,
    weaveStitchRevealNoiseScale,
    weaveStitchRevealSoftness,
    weaveStitchRevealBleedAnisotropy,
    weaveStitchRevealBleedRotation,
    weaveStitchRevealBleedCrossFiber,
    weaveStitchRevealBleedDraftCoupled,
    capture,
    weaveEnsMarkVisible,
    width,
    height,
  ]);

  // Throttled capture loop when shimmer is on or stitch-in mode is on (progress animates every frame).
  useEffect(() => {
    if (!shimmer && !(weaveStitchRevealMode > 0)) return;
    let last = 0;
    const tick = (now) => {
      rafRef.current = requestAnimationFrame(tick);
      if (now - last < CAPTURE_THROTTLE_MS) return;
      last = now;
      if (isCaptureReady(weavingCanvasRef.current, width, height)) capture();
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [shimmer, weaveStitchRevealMode, capture, width, height]);

  const handleCanvasRef = useCallback((el) => {
    weavingCanvasRef.current = el;
    if (el) scheduleCaptureWhenReady(weavingCanvasRef, width, height, capture);
  }, [capture, width, height]);

  // Paper mounts the halftone canvas asynchronously; keep halftoneCanvasRef in sync for copy.
  useEffect(() => {
    if ((!customImageUrl && !capturedDataUrl) || !halftoneContainerRef?.current || !halftoneCanvasRef) return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 120; // ~2s at 60fps
    const findCanvas = () => {
      if (cancelled || attempts++ >= maxAttempts) return;
      const el = halftoneContainerRef.current;
      const canvas = el?.querySelector?.('canvas');
      if (canvas && canvas.width > 0 && canvas.height > 0) {
        halftoneCanvasRef.current = canvas;
        return;
      }
      requestAnimationFrame(findCanvas);
    };
    findCanvas();
    return () => {
      cancelled = true;
      halftoneCanvasRef.current = null;
    };
  }, [customImageUrl, capturedDataUrl, halftoneCanvasRef, halftoneContainerRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w && h) setDimensions({ width: w, height: h });
    });
    ro.observe(el);
    const w = el.clientWidth || 1280;
    const h = el.clientHeight || 720;
    if (w && h) setDimensions({ width: w, height: h });
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="flex h-full min-h-0 flex-1 w-full">
      {/* Offscreen weaving canvas; same props as main Weaving view. */}
      <div
        aria-hidden
        className="absolute overflow-hidden"
        style={{
          left: '-9999px',
          top: 0,
          width,
          height,
        }}
      >
        <ShaderCanvas
          layout="embedded"
          patternIndex={patternIndex}
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
          rectAspect={rectAspect ?? RECT_ASPECT_DEFAULT}
          cornerRadius={cornerRadius ?? 0.18}
          canvasAspect={canvasAspect ?? 1}
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
          stageTranslateX={stageTranslateX}
          weaveEnsMarkVisible={weaveEnsMarkVisible}
          patterns={patterns ?? []}
          onCanvasRef={handleCanvasRef}
        />
      </div>

      {/* Main: HalftoneCmyk using custom image or captured weaving. Fallback placeholder if no source yet. */}
      <div ref={halftoneContainerRef} className="relative min-h-0 flex-1 bg-surface-secondary size-full">
        {(customImageUrl || capturedDataUrl) ? (
          <HalftoneCmyk
            width={width}
            height={height}
            image={customImageUrl || capturedDataUrl}
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
            fit={patternFit === 'fill' ? 'cover' : 'contain'}
            webGlContextAttributes={WEB_GL_ATTRS}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-text-muted">
            Preparing…
          </div>
        )}
      </div>
    </div>
  );
}
