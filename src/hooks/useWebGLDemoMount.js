/**
 * Limits concurrent WebGL contexts on gallery pages (browser cap ~8–16).
 * Visible cells compete by intersection ratio; budget = 4 (halftone costs 2, flat costs 1).
 */
import { useEffect, useRef, useState, useCallback, useId } from 'react';

const MAX_BUDGET = 4;

function contextCost(halftone) {
  return halftone ? 2 : 1;
}

/** @type {Map<string, { cost: number, ratio: number, visible: boolean, setMounted: (v: boolean) => void, setWaiting: (v: boolean) => void }>} */
const registry = new Map();

function reconcile() {
  const ranked = [...registry.entries()]
    .filter(([, cell]) => cell.visible)
    .sort((a, b) => b[1].ratio - a[1].ratio);

  let budget = MAX_BUDGET;
  /** @type {Set<string>} */
  const granted = new Set();
  for (const [id, cell] of ranked) {
    if (cell.cost <= budget) {
      granted.add(id);
      budget -= cell.cost;
    }
  }

  for (const [id, cell] of registry) {
    const mount = granted.has(id);
    cell.setMounted(mount);
    cell.setWaiting(cell.visible && !mount);
  }
}

/**
 * @param {boolean} halftone
 * @param {string} [cellId] stable id for prioritization (defaults to React useId)
 */
export function useWebGLDemoMount(halftone, cellId) {
  const autoId = useId();
  const id = cellId ?? autoId;
  const cost = contextCost(halftone);
  const rootRef = useRef(null);
  const [mounted, setMounted] = useState(false);
  const [waiting, setWaiting] = useState(false);

  const register = useCallback(() => {
    registry.set(id, {
      cost,
      ratio: 0,
      visible: false,
      setMounted,
      setWaiting,
    });
    return () => {
      registry.delete(id);
      reconcile();
    };
  }, [id, cost]);

  useEffect(() => register(), [register]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        const cell = registry.get(id);
        if (!cell) return;
        cell.visible = entry.isIntersecting;
        cell.ratio = entry.isIntersecting ? entry.intersectionRatio : 0;
        reconcile();
      },
      { root: null, rootMargin: '0px', threshold: [0, 0.15, 0.35, 0.55, 0.75, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [id]);

  return { rootRef, mounted, waiting };
}
