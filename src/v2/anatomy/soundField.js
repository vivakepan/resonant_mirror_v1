/**
 * Pedagogical falloff for simulated voice/air visuals.
 * Breath is intense at the lips/naris, then diffuses into the room
 * (approximately 1/r^n) instead of staying full-bright to a hard wall.
 */

function clamp01(v) {
  return Math.max(0, Math.min(1, Number(v) || 0));
}

/**
 * @param {number} t distance along the field, 0 at the aperture and 1 far away
 * @param {{ near?: number, exponent?: number }} [opts]
 */
export function soundFieldAttenuation(t, { near = 0.12, exponent = 1.65 } = {}) {
  const u = clamp01(t);
  const r = near + u * (1 - near);
  return (near / r) ** exponent;
}

/** Radius/spread grows as the jet leaves the face (or shrinks as inhale arrives). */
export function breathPlumeScale(t) {
  return 1 + clamp01(t) * 3.2;
}
