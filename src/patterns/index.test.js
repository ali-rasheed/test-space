import { describe, expect, it } from 'vitest';
import {
  PATTERNS,
  buildPatternSelectOptions,
  getEnabledPatternIndices,
  isPatternEnabled,
  randomEnabledPatternIndex,
  resolvePatternIndex,
} from './index.js';
import { buildComplexityOrderedPatternIndices, normalizeTileArtRamp } from './tileArtRamp.js';

describe('stair-step-2-2', () => {
  const idx = PATTERNS.findIndex((p) => p.id === 'stair-step-2-2');

  it('is registered as elongated 2/2 (4×8)', () => {
    expect(idx).toBeGreaterThanOrEqual(0);
    const pat = PATTERNS[idx];
    expect(pat.name).toBe('Stair-Step 2/2 Twill');
    expect(pat.tileW).toBe(4);
    expect(pat.tileH).toBe(8);
    expect(isPatternEnabled(pat)).toBe(true);
    // Doubled classic 2/2 polarity: 3,6,12,9 each twice
    expect(pat.rows.map((r) => r.slice(0, 4).reduce((a, b, i) => a + (b << i), 0))).toEqual([
      3, 3, 6, 6, 12, 12, 9, 9,
    ]);
  });

  it('appears in pattern select options', () => {
    expect(buildPatternSelectOptions(PATTERNS).some((o) => o.value === idx)).toBe(true);
  });
});

describe('disabled patterns', () => {
  const irregularIdx = PATTERNS.findIndex((p) => p.id === 'weft-rib-irregular');

  it('weft-rib-irregular is disabled', () => {
    expect(irregularIdx).toBeGreaterThanOrEqual(0);
    expect(isPatternEnabled(PATTERNS[irregularIdx])).toBe(false);
  });

  it('resolvePatternIndex maps disabled to plain', () => {
    expect(resolvePatternIndex(irregularIdx)).toBe(0);
  });

  it('buildPatternSelectOptions omits disabled unless selected', () => {
    const enabledOnly = buildPatternSelectOptions(PATTERNS).map((o) => o.value);
    expect(enabledOnly).not.toContain(irregularIdx);
    const withLegacy = buildPatternSelectOptions(PATTERNS, irregularIdx).map((o) => o.value);
    expect(withLegacy).toContain(irregularIdx);
  });

  it('randomEnabledPatternIndex never returns disabled', () => {
    for (let i = 0; i < 40; i++) {
      expect(getEnabledPatternIndices()).toContain(randomEnabledPatternIndex());
      expect(randomEnabledPatternIndex()).not.toBe(irregularIdx);
    }
  });

  it('tile art ramp normalizes disabled slots away', () => {
    const ramp = Array(8).fill(irregularIdx);
    const out = normalizeTileArtRamp(ramp);
    expect(out.every((v) => v !== irregularIdx)).toBe(true);
  });

  it('complexity order excludes disabled', () => {
    expect(buildComplexityOrderedPatternIndices()).not.toContain(irregularIdx);
  });
});
