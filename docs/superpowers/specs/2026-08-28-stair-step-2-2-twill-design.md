# Stair-Step 2/2 Twill — design

## Goal

Add the reference drawdown (weftwise-elongated 2/2 twill / stair-step motif) as a selectable weave draft in the shared `PATTERNS` atlas.

## Name & id

- **id:** `stair-step-2-2`
- **UI name:** Stair-Step 2/2 Twill
- **Terminology:** Weftwise elongated 2/2 twill (each classic 2/2 pick repeated twice vertically)

## Data

- `tileW: 4`, `tileH: 8`
- Rows (0 = warp on top, 1 = weft on top), same polarity as existing `twill-2-2`, with each pick doubled:

| rows | cols 0–3 |
|------|----------|
| 0–1  | 1 1 0 0  |
| 2–3  | 0 1 1 0  |
| 4–5  | 0 0 1 1  |
| 6–7  | 1 0 0 1  |

- Encoded via existing `row8`: `[3, 3, 6, 6, 12, 12, 9, 9]`

## Scope

- **In:** Append `PATTERNS` entry (end only — stable URL indices); `WEAVE_ICONS`; `docs/FEATURES.md` note
- **Out:** New preset, GLSL/UI changes, mid-list insert

## Why append

Numeric atlas indices are stored in URLs (`p`), presets, keyframes, and tile-art ramps. Inserting mid-list would remapped existing shares.
