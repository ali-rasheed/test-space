/**
 * ImageRectsCanvas — Image / video / GIF → colored rects shader (V2 family).
 * Weave pattern sets rect orientation; quantize + optional stitch gating — fragmentImageRects.glsl.
 * Optional stitch-in (noise / bleed) animates stitch visibility from a blank frame — see AppV2 + u_stitchReveal*.
 * mediaTextureKind: staticImage | video | gif — passed through to the sandbox hook for upload cadence.
 */
import { memo } from 'react';
import { useImageRectsSandbox } from '../hooks/useImageRectsSandbox';
import { useAspectViewportBox } from '../hooks/useAspectViewportBox';
import fragmentSource from '../shaders/fragmentImageRects.glsl?raw';
import vertexSource from '../shaders/vertex.glsl?raw';
import { PATTERNS } from '../patterns';
import { WEAVING_URL_DEFAULTS } from '../urlDefaults';

/**
 * Canvas aspect matches loaded image (or 1:1 placeholder). Viewport uses ResizeObserver:
 * patternFit 'fit' = contain (full canvas visible); 'fill' = cover (shortest side of stage filled).
 */
function ImageRectsCanvasInner({ imageSource, mediaTextureKind = 'staticImage', gridSize, palette, bgShade, bgColorMode = 0, bgCustomColor = '#f2f2f2', rectColorSource, quantizeSteps, quantizeMode, quantizeGamma, quantizeDither, rectShade, shadeFrom, patternWarpShade, patternWeftShade, patternIndex, patterns, rectRadius, rectAspect, rectRatio, lumaSizeMix, lumaSizeInvert, lumaSizeFloor, cellGeometryMode, stitchLumaMax, nonStitchShowsBg = false, contentPadding = 0, stitchRevealMode = 0, stitchRevealProgress = 1, stitchRevealSeed = 0, stitchRevealScale = 0.12, stitchRevealNoiseScale = 1, stitchRevealSoftness = 0.06, stitchRevealBleedAnisotropy = 3, stitchRevealBleedRotation = 0, stitchRevealBleedCrossFiber = 0.2, stitchRevealBleedDraftCoupled = 0, tileArtLevels = 8, tileArtThreshold = 1, tileArtDither = 0, tileArtColorMode = 0, tileArtGeom = 1, tileArtUniformGrid = 1, tileArtDensity = 0, tileArtRamp, useAllColorways = WEAVING_URL_DEFAULTS.useAllColorways, colorwaySeed = WEAVING_URL_DEFAULTS.colorwaySeed, colorwayNoiseScale = WEAVING_URL_DEFAULTS.colorwayNoiseScale, colorwayNoiseMode = WEAVING_URL_DEFAULTS.colorwayNoiseMode, colorwayNoiseOctaves = WEAVING_URL_DEFAULTS.colorwayNoiseOctaves, colorwayNoisePersistence = WEAVING_URL_DEFAULTS.colorwayNoisePersistence, colorwayNoiseLacunarity = WEAVING_URL_DEFAULTS.colorwayNoiseLacunarity, colorwayNoiseBias = WEAVING_URL_DEFAULTS.colorwayNoiseBias, colorwayNoiseX = WEAVING_URL_DEFAULTS.colorwayNoiseX, colorwayBleedAnisotropy = WEAVING_URL_DEFAULTS.colorwayBleedAnisotropy, colorwayBleedRotation = WEAVING_URL_DEFAULTS.colorwayBleedRotation, colorwayBleedCrossFiber = WEAVING_URL_DEFAULTS.colorwayBleedCrossFiber, colorwayBleedDraftCoupled = WEAVING_URL_DEFAULTS.colorwayBleedDraftCoupled, colorwayIncludeMask = WEAVING_URL_DEFAULTS.colorwayIncludeMask, patternFit = 'fit', onFpsChange, onCanvasRef, onCaptureReady }) {
  const { canvasRef, containerRef, error, imageSize } = useImageRectsSandbox(
    vertexSource,
    fragmentSource,
    imageSource ?? '',
    gridSize ?? 32,
    palette ?? 0,
    bgShade ?? 2,
    bgColorMode ?? 0,
    bgCustomColor ?? '#f2f2f2',
    rectColorSource ?? 1,
    quantizeSteps ?? 0,
    quantizeMode ?? 0,
    quantizeGamma ?? 1,
    quantizeDither ?? 0,
    rectShade ?? 1,
    shadeFrom ?? 0,
    patternWarpShade ?? 1,
    patternWeftShade ?? 3,
    patternIndex ?? 0,
    patterns ?? PATTERNS,
    rectRadius ?? 0.18,
    rectAspect ?? 0.85,
    rectRatio ?? 1.0,
    lumaSizeMix ?? 0,
    lumaSizeInvert ?? 0,
    lumaSizeFloor ?? 0.2,
    cellGeometryMode ?? 0,
    stitchLumaMax ?? 0.42,
    nonStitchShowsBg ? 1 : 0,
    contentPadding ?? 0,
    stitchRevealMode ?? 0,
    stitchRevealProgress ?? 1,
    stitchRevealSeed ?? 0,
    stitchRevealScale ?? 0.12,
    stitchRevealNoiseScale ?? 1,
    stitchRevealSoftness ?? 0.06,
    stitchRevealBleedAnisotropy ?? 3,
    stitchRevealBleedRotation ?? 0,
    stitchRevealBleedCrossFiber ?? 0.2,
    stitchRevealBleedDraftCoupled ?? 0,
    tileArtLevels ?? 8,
    tileArtThreshold ?? 1,
    tileArtDither ?? 0,
    tileArtColorMode ?? 0,
    tileArtGeom ?? 1,
    tileArtUniformGrid ?? 1,
    tileArtDensity ?? 0,
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
    onFpsChange,
    undefined,
    undefined,
    onCaptureReady,
    mediaTextureKind
  );

  const viewportMode = patternFit === 'fill' ? 'cover' : 'contain';
  const ar =
    imageSize && imageSize.width > 0 && imageSize.height > 0
      ? imageSize.width / imageSize.height
      : 1;
  const { outerRef, width: boxW, height: boxH } = useAspectViewportBox(viewportMode, ar);

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
          <canvas ref={(el) => { canvasRef.current = el; onCanvasRef?.(el); }} className="block min-h-0 flex-1 bg-surface" />
          {error ? (
            <div className="absolute bottom-0 left-0 right-0 max-h-[120px] overflow-y-auto border-t border-border-subtle bg-surface-elevated p-3 font-mono text-xs leading-snug text-error">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const ImageRectsCanvas = memo(ImageRectsCanvasInner);
