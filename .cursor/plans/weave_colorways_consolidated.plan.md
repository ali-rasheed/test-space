# Weave Option 2 — Consolidated Colorways sidebar

Handoff plan for implementing a single **Colorways** group in the Weave sidebar on `main`. Mosaic is out of scope unless shared components need a small fix.

---

## Goal

Merge **Preset & colorway** and **Colorways** into one sidebar group so palette pick, all-colorways toggle, thread shades, and distribution live together. When **Use all 5 colorways** is on, hide the standalone **Shades** group (thread shades only appear inside Colorways).

**Do not change Mosaic** in this pass unless needed for shared components.

---

## Current state (`main`)

| Area | Location in `App.jsx` | Notes |
|------|---------------------|--------|
| Preset dropdown + single-select swatches | ~2151–2200, **Preset & colorway** | Inline `PALETTE_SWATCH_COLORS` map |
| BG / Warp / Weft shades | ~2208–2252, **Shades** | Always visible |
| All-colorways UI | ~2935–3350, **Colorways** | ~400 lines **inline** (toggle, thread shades, include palettes, distribution, bleed, play buttons) |
| Extracted components | `ColorwayPaletteSwatches.jsx`, `ColorwaysControls.jsx` | Exist but **not wired** in `App.jsx` |
| Colorway state | Inline `useState` in `App.jsx` | Not using `useColorwayState` yet |

**Pain today:** swatches at top; toggle + pool + distribution below Shimmer (~700 lines apart).

---

## Target sidebar order (Weave only)

```
Actions          (unchanged, sticky)
Colorways        ← NEW consolidated group
  1. Preset dropdown
  2. ColorwayPaletteSwatches (single ↔ multi on toggle)
  3. ColorwaysControls (variant="weave")
Weave            (pattern — unchanged)
Shades           ← only when !useAllColorways
Warp gradient    (unchanged)
Weft gradient    (unchanged)
ENS mark         (unchanged)
Grid & layout    (unchanged)
Stitch-in        (unchanged)
Shimmer          (unchanged)
Halftone…        (unchanged, when weaveHalftoneOn)
```

Remove:

- **Preset & colorway** group (merged up)
- **Colorways** group at bottom (merged up)
- Inline duplicate thread-shade / include-palette JSX (~2935–3350)

---

## Behavior rules (unchanged semantics)

1. **Swatches (`ColorwayPaletteSwatches`)**
   - Off → single-select `palette`
   - On → multi-select `colorwayIncludeMask` (same row, dim unselected)
   - Toggle on → seed mask from current `palette` (`includeMaskForPalette`)
   - Toggle off → `palette` = first bit in mask (`firstPaletteInIncludeMask`)
   - Helpers live in `src/colorwayUtils.js`

2. **Shades visibility**
   - `useAllColorways === false` → show **Shades** group (BG / Warp / Weft + lock)
   - `useAllColorways === true` → hide **Shades**; thread shades only in `ColorwaysControls`

3. **Preset dropdown**
   - Stays first control in **Colorways**; still calls `applyPreset` and clears custom preset on manual edits

4. **URL / shader**
   - No new URL keys; same `all`, `cpm`, `pal`, etc.
   - Footer pill `{PALETTE_NAMES[palette]}` unchanged

---

## Implementation steps

### Phase A — Extract & wire shared pieces (prerequisite)

1. **`useColorwayState` in `App.jsx`**
   - Replace inline colorway `useState` + rAF animation `useEffect` (~696–1087 area) with `useColorwayState()`
   - URL mount: `applyColorwayFromUrl(q)` instead of per-field setters
   - `handleReset` / `handleRandomize`: use `resetColorwayToDefaults()` from hook
   - Keep destructuring for `ShaderCanvas` props and URL sync deps

2. **Delete inline Colorways block** (~2935–3350)
   - Replace with one `<ColorwaysControls variant="weave" … />` inside the new consolidated group

3. **Wire `ColorwayPaletteSwatches`** in the consolidated group (not in a separate Preset section)

Reference: a prior branch had this partially done; grep `ColorwaysControls`, `useColorwayState`, `ColorwayPaletteSwatches` in git history if useful.

### Phase B — Consolidate layout (Option 2)

4. **Rename / merge group**
   - Remove `<div className={sidebarGroup}>` titled **Preset & colorway**
   - Expand the **Colorways** group (move it up to sit right after **Actions**, before **Weave**)

5. **Structure of consolidated group**

```jsx
<div className={sidebarGroup}>
  <div className={sidebarGroupTitle}>Colorways</div>
  <div className="flex flex-col gap-2">
    {/* Preset row */}
    <div className="flex flex-wrap items-center gap-1.5">…Select.Root preset…</div>
    {/* Swatches */}
    <ColorwayPaletteSwatches … onSingleSelect={() => setPresetIndex(null)} />
    {/* Toggle + distribution + thread shades when on */}
    <ColorwaysControls variant="weave" palette={palette} setPalette={setPalette} … />
  </div>
</div>
```

6. **Conditional Shades**

```jsx
{!useAllColorways && (
  <div className={sidebarGroup}>
    <div className={sidebarGroupTitle}>Shades</div>
    …existing BG/Warp/Weft…
  </div>
)}
```

7. **Remove dead imports** from `App.jsx`: inline `PALETTE_SWATCH_COLORS` map, duplicate `ColorwayAnimPlayBtn` if any, unused `paletteSwatch*` if swatches only go through component.

### Phase C — Docs & validation

8. **`docs/FEATURES.md`** — Weave section:
   - **What:** Colorways is one sidebar group (preset, swatches, all-colorways, shades-when-on, distribution).
   - **Why:** palette and pool controls were split across the sidebar; consolidating reduces scroll and duplicate shade UIs.

9. **Build + smoke**
   - `npm run build`
   - Weave: toggle all-colorways → swatches multi-select; Shades group hides; thread shades appear under Colorways
   - Toggle off → Shades returns; single swatch select
   - Preset apply still sets palette + colorway fields
   - URL `?all=1&cpm=…` round-trip
   - Randomize / Reset colorway fields

---

## Files to touch

| File | Change |
|------|--------|
| `src/App.jsx` | Main work: reorder sidebar, consolidate groups, `useColorwayState`, `ColorwaysControls`, `ColorwayPaletteSwatches`, conditional Shades, delete ~400 lines inline Colorways |
| `src/components/ColorwaysControls.jsx` | Already has weave variant; ensure `palette`/`setPalette` on toggle; no separate Include palettes row (verify on `main`) |
| `src/components/ColorwayPaletteSwatches.jsx` | Use as-is; weave passes `includeMaskAnimPlaying` / `onIncludeMaskAnimToggle` |
| `src/hooks/useColorwayState.js` | Use as-is |
| `src/colorwayUtils.js` | `toggleColorwayIncludeMask`, `includeMaskForPalette`, `firstPaletteInIncludeMask` |
| `docs/FEATURES.md` | Weave Colorways consolidation note |

**Out of scope:** `AppV2.jsx` / Mosaic layout (can adopt same swatch component later separately).

---

## Risks / edge cases

- **Gradients + thread shades:** When all-colorways on, warp/weft shade changes in `ColorwaysControls` still flatten gradients (existing behavior) — don't regress.
- **`shadesLocked`:** Lock icon lives in Colorways thread-shades when on; Shades group when off — both should respect the same `shadesLocked` state.
- **Preset index:** Any manual colorway edit should still `setPresetIndex(null)` (wire via `onSingleSelect` / existing callbacks in `ColorwaysControls`).
- **Group size:** Colorways block gets tall; acceptable tradeoff for Option 2. Optional follow-up: collapsible subsections — not in this pass.

---

## Acceptance checklist

- [ ] One **Colorways** group immediately after Actions contains: preset, swatches, toggle, (when on) thread shades + distribution
- [ ] No **Preset & colorway** group; no second **Colorways** group below Shimmer
- [ ] **Shades** hidden when `useAllColorways`; visible when off
- [ ] Swatches multi-select when on; single when off
- [ ] No duplicate Include palettes row
- [ ] `npm run build` passes
- [ ] `docs/FEATURES.md` updated with what + why

---

## Suggested first message for the next chat

> Implement **Weave Option 2: consolidated Colorways sidebar** on `main`. Merge Preset & colorway + Colorways into one **Colorways** group right after Actions (preset → `ColorwayPaletteSwatches` → `ColorwaysControls variant="weave"`). Hide **Shades** when `useAllColorways`. Wire `useColorwayState`, delete the inline ~400-line Colorways block in `App.jsx`. Update `docs/FEATURES.md`. Mosaic unchanged. Plan: `.cursor/plans/weave_colorways_consolidated.plan.md`.
