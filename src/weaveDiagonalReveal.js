/**
 * Diagonal weave load-in timing — matches fragment.glsl wave math
 * (`speed = 2 * gridSize / 1.8`, full sweep when progress reaches 1).
 */

/** Seconds for one full diagonal reveal at the given grid density and canvas aspect. */
export function diagonalRevealDurationSec(gridSize, aspect) {
  const gs = Math.max(2, Number(gridSize) || 32);
  const ar = Math.max(0.001, Number(aspect) || 1);
  const speed = (2 * gs) / 1.8;
  const maxDiag = gs * ar + gs;
  return (maxDiag + 1) / speed;
}
