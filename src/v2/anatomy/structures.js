/**
 * Anatomical structures for the v2 observation view (REQ-039).
 * Motion without a body sensor is simulated (REQ-042).
 */

export const ANATOMY_STRUCTURES = Object.freeze([
  { id: 'skull', label: 'skull', region: 'head' },
  { id: 'brain', label: 'brain', region: 'head' },
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
  { id: 'trachea', label: 'trachea', region: 'neck' },
  { id: 'hyoid', label: 'hyoid', region: 'neck' },
  { id: 'thyroidCartilage', label: 'thyroid cartilage', region: 'neck' },
  { id: 'clavicles', label: 'clavicles', region: 'torso' },
  { id: 'abdomen', label: 'abdomen', region: 'torso' },
  { id: 'spine', label: 'spine', region: 'torso' },
  { id: 'heart', label: 'heart', region: 'torso' },
  { id: 'aorta', label: 'aorta', region: 'torso' },
  { id: 'venaeCavae', label: 'venae cavae', region: 'torso' },
  { id: 'pulmonaryArteries', label: 'pulmonary arteries', region: 'torso' },
  { id: 'pulmonaryVeins', label: 'pulmonary veins', region: 'torso' },
  { id: 'carotidArteries', label: 'carotid arteries', region: 'neck' },
  { id: 'jugularVeins', label: 'jugular veins', region: 'neck' },
  { id: 'coronaryVessels', label: 'coronary vessels', region: 'torso' },
  { id: 'vagusNerve', label: 'vagus nerve (cranial nerve X)', region: 'neurovisceral' },
  { id: 'superiorLaryngealNerve', label: 'superior laryngeal nerve', region: 'neck' },
  { id: 'recurrentLaryngealNerve', label: 'recurrent laryngeal nerve', region: 'neck' },
  { id: 'cardiacVagalBranches', label: 'cardiac vagal branches', region: 'torso' },
  { id: 'pulmonaryVagalPlexus', label: 'pulmonary vagal plexus', region: 'torso' },
  { id: 'esophagealVagalPlexus', label: 'esophageal vagal plexus', region: 'torso' },
  { id: 'phrenicNerves', label: 'phrenic nerves', region: 'respiratory' },
]);

export const REQUIRED_STRUCTURE_IDS = ANATOMY_STRUCTURES
  .filter((s) => [
    'skull', 'jaw', 'oralCavity', 'nasalCavity', 'pharyngealRegion',
    'laryngealRegion', 'neck', 'ribCage', 'lungs', 'diaphragm',
    'sternum', 'xiphoidProcess', 'upperTorso',
  ].includes(s.id))
  .map((s) => s.id);

export const OPTIONAL_STRUCTURE_IDS = ANATOMY_STRUCTURES
  .map((s) => s.id)
  .filter((id) => !REQUIRED_STRUCTURE_IDS.includes(id));

export const ANATOMY_LAYERS = Object.freeze({
  realisticAnatomy: true,
  transparentAnatomy: true,
  actualPitch: true,
  resonance: true,
  respiratory: true,
  breathVagusFilter: true,
  circulatory: true,
  registration: true,
  supportEvidence: true,
  tensionEvidence: true,
  aura: true,
  referenceLane: true,
  userLane: true,
  piano: true,
  metronome: true,
});
