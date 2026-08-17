/**
 * env.js — Environmental interference presets (v1 parity)
 *
 * Broadband noise floors and tonal interference (HVAC, mains hum, traffic, etc.)
 * add constant-frequency drivers and optionally raise the response floor everywhere.
 */

export const envPresets = {
  none: null,
  mains:    { f: 60,    label: 'MAINS · 60Hz',     color: '#9aa3b0', floor: 0.04 },
  hvac:     { f: 90,    label: 'HVAC · 90Hz',      color: '#8aa0b0', floor: 0.10, broadband: true },
  traffic:  { f: 38,    label: 'TRAFFIC · 38Hz',   color: '#a08070', floor: 0.12, broadband: true },
  neighbor: { f: 261.6, label: 'NEIGHBOR · 262Hz', color: '#c8a878', floor: 0.05 },
  street:   { f: 174,   label: 'STREET · 174Hz',   color: '#8898a8', floor: 0.07, broadband: true },
};

export const envOrder = ['none', 'mains', 'hvac', 'traffic', 'neighbor', 'street'];

export function envDriver(envType) {
  const env = envPresets[envType];
  if (!env) return null;
  return { f: env.f, amp: 0.35, phase: 0, origin: 'env' };
}

export function applyEnvFloor(amps, envType) {
  const env = envPresets[envType];
  if (!env || !env.floor) return amps;
  const lift = env.broadband ? env.floor : env.floor * 0.5;
  return amps.map(a => Math.min(1, a + lift));
}
