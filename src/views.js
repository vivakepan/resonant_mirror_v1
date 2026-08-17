/**
 * views.js — Five recognition stances on the same physics (v1 parity)
 *
 * Same drive frequencies, different epistemic surface: per-zone scale,
 * bandwidth multiplier, and global damping. Does not change the underlying
 * resonance math — only how the body "reads" the stimulus.
 */

export const viewModifiers = {
  organs: {
    label: 'ORGANS',
    caption: 'acoustic resonance through tissue & cavity',
    zoneScale: {},
    bwMult: 1.0,
    globalScale: 1.0,
  },
  flow: {
    label: 'FLOW',
    caption: 'pressure-wave & circulation paths',
    zoneScale: {
      chest: 1.45, tracheal: 1.55, heart: 1.35, larynx: 1.2,
      pharynx: 1.1, mouth: 0.9, skull: 0.55, nasal: 0.7, eyes: 0.45, ears: 0.4,
    },
    bwMult: 1.1,
    globalScale: 1.0,
  },
  nerves: {
    label: 'NERVES',
    caption: 'vagal & neural recognition · wider bandwidth',
    zoneScale: { heart: 1.5, chest: 1.25, larynx: 1.3, pharynx: 1.15, ears: 1.2 },
    bwMult: 1.7,
    globalScale: 0.95,
  },
  solid: {
    label: 'SOLID',
    caption: 'external view — only what escapes the body',
    zoneScale: {},
    bwMult: 1.0,
    globalScale: 0.45,
  },
  em: {
    label: 'EM',
    caption: 'broadband emission spectrum',
    zoneScale: { skull: 1.3, eyes: 1.25, ears: 1.5, nasal: 1.1, heart: 1.15 },
    bwMult: 1.0,
    globalScale: 1.0,
  },
};

export function getViewModifier(viewId) {
  return viewModifiers[viewId] || viewModifiers.organs;
}

/** Apply view stance scaling to a zone's steady-state amplitude. */
export function applyViewScale(zone, amp, viewId) {
  const v = getViewModifier(viewId);
  const zScale = v.zoneScale[zone.id] ?? 1.0;
  return Math.min(1, amp * zScale * v.globalScale);
}
