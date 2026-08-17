/**
 * Retention policy (spec REQ-074–077).
 * Raw voice is high-sensitivity personal data. Nothing is uploaded by default.
 */

export const RETENTION_CLASSES = Object.freeze([
  'raw_audio',
  'deterministic_acoustic_features',
  'learned_embeddings',
  'human_labels',
  'session_history',
  'optional_video',
  'personal_prototypes',
  'model_checkpoints',
]);

export const DEFAULT_RETENTION_POLICY = Object.freeze({
  raw_audio: {
    defaultKeep: false,
    localOnly: true,
    remoteUpload: 'opt-in-only',
    notes: 'Do not retain raw audio unless the singer explicitly keeps a take.',
  },
  deterministic_acoustic_features: {
    defaultKeep: true,
    localOnly: true,
    remoteUpload: 'opt-in-only',
  },
  learned_embeddings: {
    defaultKeep: true,
    localOnly: true,
    remoteUpload: 'opt-in-only',
    notes: 'Embeddings stay on-device. They can carry speaker identity; do not transmit.',
  },
  human_labels: {
    defaultKeep: true,
    localOnly: true,
    remoteUpload: 'opt-in-only',
    editable: true,
  },
  session_history: {
    defaultKeep: true,
    localOnly: true,
    remoteUpload: 'opt-in-only',
  },
  optional_video: {
    defaultKeep: false,
    localOnly: true,
    remoteUpload: 'opt-in-only',
    cameraOptIn: true,
  },
  personal_prototypes: {
    defaultKeep: true,
    localOnly: true,
    deletable: true,
  },
  model_checkpoints: {
    defaultKeep: true,
    localOnly: true,
    notes: 'If weights were trained from deleted data, document residual influence before claiming deletion is complete.',
  },
});

export const DELETABLE_OBJECTS = Object.freeze([
  'recording',
  'session',
  'labels',
  'personal_prototypes',
  'long_term_personal_history',
]);

export const DEFAULT_CONSENT = Object.freeze({
  rawAudioRetention: false,
  remoteUpload: false,
  camera: false,
  personalTraining: false,
});
