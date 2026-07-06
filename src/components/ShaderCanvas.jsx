/**
 * ShaderCanvas — WebGL canvas that renders the shader.
 * Sources: src/shaders/vertex.glsl, src/shaders/fragment.glsl. Edit those files directly.
 * **warpGradientEnabled** / **weftGradientEnabled**: when false, the hook uses flat **warpShade** / **weftShade** for that axis (gradient objects are preserved for UI).
 * **weaveStitchReveal***: optional stitch-in (Mosaic-parity); drives `u_stitchReveal*` in fragment.glsl.
 * **diagonalRevealProgress**: optional 0–1 scrub for diagonal load-in (`u_revealProgress`); omit for internal auto-play.
 * **stageTranslateX**: horizontal pattern shift in pixels via `u_stageTranslateX` (fragment space), not CSS transform.
 * **weaveEnsMarkVisible**: composites ENS mark texture (unit 1) in fragment when true.
 * Styled with Tailwind; memoized to avoid re-renders when only fps changes.
 */
import { memo } from 'react';
import { useShaderSandbox } from '../hooks/useShaderSandbox';
import { useAspectViewportBox } from '../hooks/useAspectViewportBox';
import fragmentSource from '../shaders/fragment.glsl?raw';
import vertexSource from '../shaders/vertex.glsl?raw';
import { RECT_ASPECT_DEFAULT } from '../constants';
import { WEAVING_URL_DEFAULTS } from '../urlDefaults';
import { fpsPill } from '../uiConstants';

/**
 * patternFit (layout=stage): 'fill' = cover; 'fit' = contain.
 * layout=embedded: fixed parent box (e.g. offscreen capture) — fills width/height, no viewport math.
 */
function ShaderCanvasInner({ patternIndex, palette, bgShade, warpShade, weftShade, gridSize, warpGradient, weftGradient, warpGradientEnabled = WEAVING_URL_DEFAULTS.warpGradientEnabled, weftGradientEnabled = WEAVING_URL_DEFAULTS.weftGradientEnabled, gradSteps, rectAspect, cornerRadius = 0.18, canvasAspect = 1, patternFit = 'fit', layout = 'stage', shimmer = false, shimmerSpeed = 2, shimmerWidth = 2, shimmerIntensity = 0.25, shimmerPosition = 0, shimmerRotation = 0.125, shimmerNoise = 0.3, shimmerNoiseSeed = 0, shimmerNoiseMin = 0.5, shimmerNoiseMax = 1.5, shimmerBlendMode = 0, useAllColorways = WEAVING_URL_DEFAULTS.useAllColorways, colorwaySeed = WEAVING_URL_DEFAULTS.colorwaySeed, colorwayNoiseScale = WEAVING_URL_DEFAULTS.colorwayNoiseScale, colorwayNoiseMode = WEAVING_URL_DEFAULTS.colorwayNoiseMode, colorwayNoiseOctaves = WEAVING_URL_DEFAULTS.colorwayNoiseOctaves, colorwayNoisePersistence = WEAVING_URL_DEFAULTS.colorwayNoisePersistence, colorwayNoiseLacunarity = WEAVING_URL_DEFAULTS.colorwayNoiseLacunarity, colorwayNoiseBias = WEAVING_URL_DEFAULTS.colorwayNoiseBias, colorwayNoiseX = WEAVING_URL_DEFAULTS.colorwayNoiseX, colorwayBleedAnisotropy = WEAVING_URL_DEFAULTS.colorwayBleedAnisotropy, colorwayBleedRotation = WEAVING_URL_DEFAULTS.colorwayBleedRotation, colorwayBleedCrossFiber = WEAVING_URL_DEFAULTS.colorwayBleedCrossFiber, colorwayBleedDraftCoupled = WEAVING_URL_DEFAULTS.colorwayBleedDraftCoupled, colorwayIncludeMask = WEAVING_URL_DEFAULTS.colorwayIncludeMask, weaveStitchRevealMode = WEAVING_URL_DEFAULTS.weaveStitchRevealMode, weaveStitchRevealProgress = WEAVING_URL_DEFAULTS.weaveStitchRevealProgress, weaveStitchRevealSeed = WEAVING_URL_DEFAULTS.weaveStitchRevealSeed, weaveStitchRevealScale = WEAVING_URL_DEFAULTS.weaveStitchRevealScale, weaveStitchRevealNoiseScale = WEAVING_URL_DEFAULTS.weaveStitchRevealNoiseScale, weaveStitchRevealSoftness = WEAVING_URL_DEFAULTS.weaveStitchRevealSoftness, weaveStitchRevealBleedAnisotropy = WEAVING_URL_DEFAULTS.weaveStitchRevealBleedAnisotropy, weaveStitchRevealBleedRotation = WEAVING_URL_DEFAULTS.weaveStitchRevealBleedRotation, weaveStitchRevealBleedCrossFiber = WEAVING_URL_DEFAULTS.weaveStitchRevealBleedCrossFiber, weaveStitchRevealBleedDraftCoupled = WEAVING_URL_DEFAULTS.weaveStitchRevealBleedDraftCoupled, diagonalRevealProgress, stageTranslateX = 0, weaveEnsMarkVisible = WEAVING_URL_DEFAULTS.weaveEnsMarkVisible, shimmerPlaying = true, shimmerPausedAtTime = 0, shimmerPhase = 0, onShimmerTime, patterns, onFpsChange, onCanvasRef, onCaptureReady }) {
  const viewportMode = patternFit === 'fill' ? 'cover' : 'contain';
  const ar = canvasAspect > 0 && Number.isFinite(canvasAspect) ? canvasAspect : 1;
  const stageLayout = layout === 'stage';
  const { outerRef, width: boxW, height: boxH } = useAspectViewportBox(viewportMode, ar, stageLayout);

  const { canvasRef, containerRef, error, fps } = useShaderSandbox(
    vertexSource,
    fragmentSource,
    patternIndex ?? 0,
    palette ?? 0,
    bgShade ?? 2,
    warpShade ?? 1,
    weftShade ?? 3,
    gridSize ?? 32,
    warpGradient ?? null,
    weftGradient ?? null,
    warpGradientEnabled !== false,
    weftGradientEnabled !== false,
    gradSteps ?? 0,
    rectAspect ?? RECT_ASPECT_DEFAULT,
    cornerRadius ?? 0.18,
    shimmer ? 1 : 0,
    shimmerSpeed ?? 2,
    shimmerWidth ?? 2,
    shimmerIntensity ?? 0.25,
    shimmerPosition ?? 0,
    shimmerRotation ?? 0.125,
    shimmerNoise ?? 0.3,
    shimmerNoiseSeed ?? 0,
    shimmerNoiseMin ?? 0.5,
    shimmerNoiseMax ?? 1.5,
    shimmerBlendMode ?? 0,
    useAllColorways ? 1 : 0,
    colorwaySeed ?? WEAVING_URL_DEFAULTS.colorwaySeed,
    colorwayNoiseScale ?? WEAVING_URL_DEFAULTS.colorwayNoiseScale,
    colorwayNoiseMode ?? WEAVING_URL_DEFAULTS.colorwayNoiseMode,
    colorwayNoiseOctaves ?? WEAVING_URL_DEFAULTS.colorwayNoiseOctaves,
    colorwayNoisePersistence ?? WEAVING_URL_DEFAULTS.colorwayNoisePersistence,
    colorwayNoiseLacunarity ?? WEAVING_URL_DEFAULTS.colorwayNoiseLacunarity,
    colorwayNoiseBias ?? WEAVING_URL_DEFAULTS.colorwayNoiseBias,
    colorwayNoiseX ?? WEAVING_URL_DEFAULTS.colorwayNoiseX,
    colorwayBleedAnisotropy ?? WEAVING_URL_DEFAULTS.colorwayBleedAnisotropy,
    colorwayBleedRotation ?? WEAVING_URL_DEFAULTS.colorwayBleedRotation,
    colorwayBleedCrossFiber ?? WEAVING_URL_DEFAULTS.colorwayBleedCrossFiber,
    colorwayBleedDraftCoupled ? 1 : 0,
    colorwayIncludeMask ?? WEAVING_URL_DEFAULTS.colorwayIncludeMask,
    weaveStitchRevealMode ?? 0,
    weaveStitchRevealProgress ?? 1,
    weaveStitchRevealSeed ?? 0,
    weaveStitchRevealScale ?? WEAVING_URL_DEFAULTS.weaveStitchRevealScale,
    weaveStitchRevealNoiseScale ?? WEAVING_URL_DEFAULTS.weaveStitchRevealNoiseScale,
    weaveStitchRevealSoftness ?? WEAVING_URL_DEFAULTS.weaveStitchRevealSoftness,
    weaveStitchRevealBleedAnisotropy ?? WEAVING_URL_DEFAULTS.weaveStitchRevealBleedAnisotropy,
    weaveStitchRevealBleedRotation ?? WEAVING_URL_DEFAULTS.weaveStitchRevealBleedRotation,
    weaveStitchRevealBleedCrossFiber ?? WEAVING_URL_DEFAULTS.weaveStitchRevealBleedCrossFiber,
    weaveStitchRevealBleedDraftCoupled ? 1 : 0,
    stageTranslateX ?? 0,
    weaveEnsMarkVisible !== false,
    diagonalRevealProgress ?? null,
    shimmerPlaying ?? true,
    shimmerPausedAtTime ?? 0,
    shimmerPhase ?? 0,
    onShimmerTime ?? undefined,
    patterns ?? [],
    onFpsChange,
    onCaptureReady
  );

  const canvasBlock = (
    <>
      <canvas ref={(el) => { canvasRef.current = el; onCanvasRef?.(el); }} className="block min-h-0 flex-1 bg-surface" />
      <div className={fpsPill}>
        {fps || '--'} fps
      </div>
      {error ? (
        <div className="absolute bottom-0 left-0 right-0 max-h-[120px] overflow-y-auto border-t border-border-subtle bg-surface-elevated p-3 font-mono text-xs leading-snug text-error">
          {error}
        </div>
      ) : null}
    </>
  );

  if (!stageLayout) {
    return (
      <div
        ref={containerRef}
        className="relative flex h-full w-full min-h-0 flex-col overflow-hidden rounded-md border border-border-subtle bg-surface-secondary"
      >
        {canvasBlock}
      </div>
    );
  }

  return (
    <div
      ref={outerRef}
      className="relative flex h-full min-h-0 min-w-0 w-full flex-1 self-stretch items-center justify-center overflow-hidden"
    >
      <div
        className="relative flex shrink-0 flex-col overflow-hidden rounded-md border border-border-subtle bg-surface-secondary"
        style={{ width: boxW, height: boxH }}
      >
        <div ref={containerRef} className="relative flex h-full min-h-0 w-full flex-1 flex-col">
          {canvasBlock}
        </div>
      </div>
    </div>
  );
}

export const ShaderCanvas = memo(ShaderCanvasInner);
