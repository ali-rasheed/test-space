---
name: Mosaic stipple texture
overview: "Cancelled: per–mini-cell density masking removed from scope (user feedback: it messes up the look). No new shader work planned here; use existing Tile art controls for texture."
todos:
  - id: shader-density-mask
    content: "Add u_tileArtDensity (taf) + u_tileArtBands (tab): density mask per mini-cell; bands off → single patternIdx"
    status: cancelled
  - id: plumbing-url
    content: Wire uniforms through sandbox, canvas, urlDefaults (taf, tab), mosaicKeyframe
    status: cancelled
  - id: ui-appv2
    content: "Density + Luma bands toggles; bands off → single weave picker; bands on → levels + 8-slot ramp"
    status: cancelled
  - id: docs-verify
    content: Update docs/FEATURES.md; build + test + visual check with brand palette and ramp weaves
    status: cancelled
isProject: false
---

# Mosaic “data-deep” texture — cancelled (density removed)

## Decision

**Do not implement** `u_tileArtDensity` / URL `taf` or any per–mini-cell hash threshold that hides stitches by local luma. User feedback: density **messes up** the tile-art look when combined with weave + brand/image colors.

This plan is **closed** unless a different approach is specified later.

## What stays (no code changes from this plan)

Existing **Tile art** (`cm=3`) in [`fragmentImageRects.glsl`](src/shaders/fragmentImageRects.glsl):

- Luma bands + **pattern ramp** (macro weave per tone)
- Warp/weft drafts + **mono / brand / tint**
- **Flat | Rounded** mini stitches, uniform 8×8 grid
- **`tat`** threshold (bright macros → background)
- **`tad`** band dither (macro band pick only, not mini-cell density)
- Global **quantize** + dither on source image

## Tuning toward a grainy poster vibe (without density)

Use sidebar / URL only:

| Goal | Knobs |
|------|--------|
| One weave everywhere | Set all eight ramp slots to the same pattern; lower **`tal`** only if you still want coarse tone steps |
| More white field | Raise **`tat`** (threshold) |
| Softer tone steps | **`quantizeSteps`** 2–4 + **`quantizeDither`** |
| Square uniform tiles | **`tag=0`**, `rectAspect=1`, `rectRadius=0`, `rectRatio=1`, **`tug=1`** |
| Brand vs image color | **`tacm`** 1 or 2, warp/weft shades |

## Optional future work (not scheduled)

If tone→weave stair-steps are still annoying without density:

- **`tab` / luma bands off** — single `patternIdx` for all macros (small shader + UI change only; **no** density mask). Spec separately if requested.

## Out of scope (explicit)

- Per–mini-cell density / stipple visibility mask
- Pure B/W stipple without weave
- Print mosaic / Weave tab changes from this plan
