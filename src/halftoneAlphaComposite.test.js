import { describe, it, expect } from 'vitest';
import { imageFitRect } from './halftoneAlphaComposite';

describe('imageFitRect', () => {
  it('contain letterboxes wide image in tall viewport', () => {
    const r = imageFitRect(100, 200, 200, 100, 'contain');
    expect(r.w).toBe(100);
    expect(r.h).toBe(50);
    expect(r.x).toBe(0);
    expect(r.y).toBe(75);
  });

  it('cover fills viewport and crops', () => {
    const r = imageFitRect(100, 200, 200, 100, 'cover');
    expect(r.w).toBe(400);
    expect(r.h).toBe(200);
    expect(r.x).toBe(-150);
    expect(r.y).toBe(0);
  });

  it('contain centers square in wide viewport', () => {
    const r = imageFitRect(200, 100, 100, 100, 'contain');
    expect(r.w).toBe(100);
    expect(r.h).toBe(100);
    expect(r.x).toBe(50);
    expect(r.y).toBe(0);
  });
});
