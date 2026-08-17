/**
 * Active unknowns from spec §34.
 * Do not silently remove an item. Resolve it with evidence or retain it.
 */

export const OPEN_ASSUMPTIONS = Object.freeze([
  {
    id: 'A-01',
    text: 'Which local audio-window duration best supports the shared representation?',
    status: 'open',
  },
  {
    id: 'A-02',
    text: 'Is 64 embedding dimensions enough, too small, or unnecessarily large?',
    status: 'open',
  },
  {
    id: 'A-03',
    text: 'Can expressive intensity generalize across singers and genres?',
    status: 'open',
  },
  {
    id: 'A-04',
    text: 'How much annotator agreement exists for pairwise intensity judgments?',
    status: 'open',
  },
  {
    id: 'A-05',
    text: 'Can reliable formant tracking be maintained at high pitches?',
    status: 'open',
  },
  {
    id: 'A-06',
    text: 'Can inhale and exhale subclasses be reliably separated from audio alone?',
    status: 'open',
  },
  {
    id: 'A-07',
    text: 'Which acoustic patterns correlate with singer-reported “supported” production?',
    status: 'open',
  },
  {
    id: 'A-08',
    text: 'Which tension cues can be inferred from audio without video?',
    status: 'open',
  },
  {
    id: 'A-09',
    text: 'Does optional video materially improve jaw/face/neck tension evidence?',
    status: 'open',
  },
  {
    id: 'A-10',
    text: 'Does the learned representation encode singer identity more strongly than vocal behavior?',
    status: 'open',
  },
  {
    id: 'A-11',
    text: 'How should general and personal inference be combined?',
    status: 'open',
  },
  {
    id: 'A-12',
    text: 'When does personal fine-tuning outperform prototype memory?',
    status: 'open',
  },
  {
    id: 'A-13',
    text: 'How should historical embeddings be migrated between model versions?',
    status: 'open',
  },
  {
    id: 'A-14',
    text: 'What reference-song features remain trustworthy without isolated vocals?',
    status: 'open',
  },
  {
    id: 'A-15',
    text: 'What acoustic and personal features justify an integrated “whole-system coordination” state?',
    status: 'open',
  },
  {
    id: 'A-16',
    text: 'Which anatomy visualization best communicates uncertainty without being mistaken for measurement?',
    status: 'open',
  },
  {
    id: 'A-17',
    text: 'What level of playback leakage invalidates microphone comparison?',
    status: 'open',
  },
  {
    id: 'A-18',
    text: 'What calibration process is needed before any physical sound-pressure level is displayed?',
    status: 'open',
  },
]);

export function listOpenAssumptions() {
  return OPEN_ASSUMPTIONS.filter((item) => item.status === 'open');
}

export function getAssumption(id) {
  return OPEN_ASSUMPTIONS.find((item) => item.id === id) || null;
}
