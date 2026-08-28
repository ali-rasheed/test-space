/**
 * Halftone paper presets (cream vs clean white) shared by Mosaic and Weave halftone sidebars.
 */
import { HALFTONE_PAPER } from './urlDefaults';

/** Apply cream or white paper bundle to halftone ink state setters. */
export function applyHalftonePaperPreset(mode, setters) {
  const preset = HALFTONE_PAPER[mode];
  if (!preset) return;
  setters.setHalftoneColorBack?.(preset.colorBack);
  setters.setHalftoneFloodC?.(preset.floodC);
  setters.setHalftoneGridNoise?.(preset.gridNoise);
}

/** Derive paper mode from current back/flood/grid values. */
export function halftonePaperModeFromValues(colorBack, floodC, gridNoise) {
  const { cream, white } = HALFTONE_PAPER;
  if (
    colorBack === white.colorBack
    && floodC === white.floodC
    && gridNoise === white.gridNoise
  ) {
    return 'white';
  }
  if (
    colorBack === cream.colorBack
    && floodC === cream.floodC
    && gridNoise === cream.gridNoise
  ) {
    return 'cream';
  }
  return 'custom';
}

/** Parse URL hbp: 0 = cream, 1 = white. */
export function parseHalftonePaperModeParam(raw) {
  if (raw === '1' || raw === 1) return 'white';
  return 'cream';
}

/** Serialize for URL; omit when cream (default). */
export function serializeHalftonePaperMode(mode) {
  return mode === 'white' ? '1' : null;
}
