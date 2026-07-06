/**
 * Persist canvas-demo.html session (specimen + play hints) in localStorage.
 * URL params still win on first paint; a load prompt offers the saved snapshot when it differs.
 */
import {
  clampColorwayAnimBits,
  encodeColorwayAnimPlaying,
} from './colorwayAnimUrl';
import {
  findDemoSection,
  findDemoSpec,
  CANVAS_DEMO_DEFAULT_SECTION,
  CANVAS_DEMO_DEFAULT_SPEC,
} from './canvasDemoUrl';

export const CANVAS_DEMO_STORAGE_KEY = 'shaderbox-canvas-demo-v1';

/**
 * @typedef {{
 *   sectionId: string,
 *   specId: string,
 *   shimmerPlaying: boolean,
 *   colorwayPlayBits: number | null,
 * }} CanvasDemoStoredState
 */

/** @param {unknown} raw @param {{ id: string, specs: { id: string }[] }[]} sections */
export function normalizeStoredCanvasDemoState(raw, sections) {
  if (!raw || typeof raw !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const sectionId = findDemoSection(
    typeof o.sectionId === 'string' ? o.sectionId : null,
    sections,
  );
  const section = sections.find((s) => s.id === sectionId) ?? sections[0];
  if (!section) return null;
  const specId = findDemoSpec(typeof o.specId === 'string' ? o.specId : null, section);
  let colorwayPlayBits = null;
  if (o.colorwayPlayBits != null) {
    const n = Number(o.colorwayPlayBits);
    if (Number.isFinite(n)) colorwayPlayBits = clampColorwayAnimBits(n);
  }
  return {
    sectionId,
    specId,
    shimmerPlaying: o.shimmerPlaying !== false,
    colorwayPlayBits,
  };
}

/** @param {{ id: string, specs: { id: string }[] }[]} sections */
export function readStoredCanvasDemoState(sections) {
  try {
    const raw = localStorage.getItem(CANVAS_DEMO_STORAGE_KEY);
    if (!raw) return null;
    return normalizeStoredCanvasDemoState(JSON.parse(raw), sections);
  } catch {
    return null;
  }
}

/** @param {CanvasDemoStoredState} state */
export function writeStoredCanvasDemoState(state) {
  try {
    localStorage.setItem(CANVAS_DEMO_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode / quota */
  }
}

/**
 * @param {{
 *   sectionId: string,
 *   specId: string,
 *   shimmerPlaying: boolean,
 *   colorwayAnimPlaying: Record<string, boolean>,
 * }} live
 */
export function snapshotCanvasDemoState(live) {
  const cwp = encodeColorwayAnimPlaying(live.colorwayAnimPlaying || {});
  return {
    sectionId: live.sectionId || CANVAS_DEMO_DEFAULT_SECTION,
    specId: live.specId || CANVAS_DEMO_DEFAULT_SPEC,
    shimmerPlaying: live.shimmerPlaying !== false,
    colorwayPlayBits: cwp === 0 ? null : cwp,
  };
}

/** @param {CanvasDemoStoredState | null} a @param {CanvasDemoStoredState | null} b */
export function canvasDemoStoredStatesEqual(a, b) {
  if (!a || !b) return false;
  return (
    a.sectionId === b.sectionId
    && a.specId === b.specId
    && a.shimmerPlaying === b.shimmerPlaying
    && (a.colorwayPlayBits ?? null) === (b.colorwayPlayBits ?? null)
  );
}
