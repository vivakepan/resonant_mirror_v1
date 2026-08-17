/**
 * Anatomical structures for the v2 observation view (REQ-039).
 * Motion without a body sensor is simulated (REQ-042).
 */

export const ANATOMY_STRUCTURES = Object.freeze([
  { id: 'skull', label: 'skull', region: 'head' },
  { id: 'jaw', label: 'jaw', region: 'head' },
  { id: 'oralCavity', label: 'oral cavity', region: 'head' },
  { id: 'nasalCavity', label: 'nasal cavity', region: 'head' },
  { id: 'pharyngealRegion', label: 'pharyngeal region', region: 'neck' },
  { id: 'laryngealRegion', label: 'laryngeal region', region: 'neck' },
  { id: 'neck', label: 'neck', region: 'neck' },
  { id: 'ribCage', label: 'rib cage', region: 'torso' },
  { id: 'lungs', label: 'lungs', region: 'torso' },
  { id: 'diaphragm', label: 'diaphragm', region: 'torso' },
  { id: 'sternum', label: 'sternum', region: 'torso' },
  { id: 'xiphoidProcess', label: 'xiphoid process', region: 'torso' },
  { id: 'upperTorso', label: 'upper torso', region: 'torso' },
]);

export const REQUIRED_STRUCTURE_IDS = ANATOMY_STRUCTURES.map((s) => s.id);

export const ANATOMY_LAYERS = Object.freeze({
  realisticAnatomy: true,
  transparentAnatomy: true,
  actualPitch: true,
  resonance: true,
  respiratory: true,
  registration: true,
  supportEvidence: true,
  tensionEvidence: true,
  aura: true,
  referenceLane: true,
  userLane: true,
  piano: true,
  metronome: true,
});
