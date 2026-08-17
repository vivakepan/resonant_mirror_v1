/**
 * Resonant Mirror v2 observation UI.
 * Renderer consumes provenance-tagged visual states only.
 */

import { DualAudioPipeline } from '../audio/dualPipeline.js';
import { ObservationEngine } from '../session/engine.js';
import { anatomyDrawPlan, drawAnatomyV2 } from '../anatomy/anatomyRenderer.js';
import { inspectActiveVisuals, renderInspectorHtml } from '../visualization/inspector.js';
import { defaultFeatureFlags } from '../contracts/featureFlags.js';
import { EVIDENCE_LABELS } from '../contracts/evidence.js';
import { HEADPHONE_GUIDANCE } from '../audio/leakage.js';
import { pianoTone, metronomeClick, metronomeTimes } from '../audio/piano.js';
import { PersonalMemory } from '../memory/personalMemory.js';
import { SELF_TENSION_LABELS } from '../tension/estimator.js';

const flags = defaultFeatureFlags();
const engine = new ObservationEngine({ flags });
const audio = new DualAudioPipeline();
const memory = new PersonalMemory();

const canvas = document.getElementById('anatomy');
const ctx = canvas.getContext('2d');
const layers = {
  transparentAnatomy: false,
  actualPitch: true,
  inspector: true,
};

function resize() {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = r.width * dpr;
  canvas.height = r.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

document.getElementById('micBtn').addEventListener('click', async () => {
  try {
    await audio.startMicrophone();
    setText('micStatus', 'microphone on · local only');
  } catch (err) {
    setText('micStatus', 'microphone unavailable');
  }
});

document.getElementById('songFile').addEventListener('change', async (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  await audio.loadReference(file);
  setText('songStatus', `reference loaded: ${file.name} (analyzed separately)`);
  document.getElementById('leakWarn').textContent = HEADPHONE_GUIDANCE;
});

document.getElementById('playBtn').addEventListener('click', () => audio.playReference());
document.getElementById('stopBtn').addEventListener('click', () => audio.pauseReference());

document.getElementById('transparent').addEventListener('change', (e) => {
  layers.transparentAnatomy = e.target.checked;
});
document.getElementById('pitchLayer').addEventListener('change', (e) => {
  layers.actualPitch = e.target.checked;
});

const labelBox = document.getElementById('selfLabels');
for (const label of SELF_TENSION_LABELS) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.className = 'chip';
  btn.addEventListener('click', () => btn.classList.toggle('on'));
  labelBox.appendChild(btn);
}

function activeLabels() {
  return [...labelBox.querySelectorAll('.chip.on')].map((b) => b.textContent);
}

let lastVisuals = [];

function frame() {
  const W = canvas.getBoundingClientRect().width;
  const H = canvas.getBoundingClientRect().height;
  ctx.fillStyle = '#07090c';
  ctx.fillRect(0, 0, W, H);

  if (audio.ctx) {
    const pair = audio.readWindows();
    const extras = { selfLabels: activeLabels(), memory };
    const user = engine.processPacket(pair.user, extras);
    engine.processPacket(pair.reference, extras);
    if (user) {
      lastVisuals = user.visuals;
      setText('pitchReadout', user.display.pitch);
      setText('levelReadout', user.display.level);
      setText('levelHint', user.display.levelUnitLabel);
      const leak = pair.leakage;
      setText('latency', JSON.stringify(pair.latency));
      if (leak.warning) setText('leakWarn', leak.warning);
      const lanes = document.getElementById('lanes');
      lanes.textContent = `user @ ${pair.user?.timestampSeconds ?? '—'}s · reference @ ${pair.reference?.timestampSeconds ?? '—'}s`;
    }
    const plan = anatomyDrawPlan(lastVisuals, {
      transparent: layers.transparentAnatomy,
      showPitch: layers.actualPitch,
    });
    drawAnatomyV2(ctx, W, H, plan);
  }

  if (layers.inspector) {
    document.getElementById('inspector').innerHTML = renderInspectorHtml(lastVisuals);
  }
  requestAnimationFrame(frame);
}

document.getElementById('legend').innerHTML = Object.entries(EVIDENCE_LABELS)
  .map(([k, v]) => `<li><code>${k}</code> — ${v}</li>`)
  .join('');

document.getElementById('pianoBtn').addEventListener('click', async () => {
  if (!audio.ctx) await audio._ensureContext();
  const buf = pianoTone(440, audio.ctx.sampleRate, 0.8);
  playBuffer(buf);
});

document.getElementById('metroBtn').addEventListener('click', async () => {
  if (!audio.ctx) await audio._ensureContext();
  const click = metronomeClick(audio.ctx.sampleRate);
  const times = metronomeTimes(80, 4);
  times.forEach((t) => setTimeout(() => playBuffer(click), t * 1000));
});

function playBuffer(samples) {
  const buf = audio.ctx.createBuffer(1, samples.length, audio.ctx.sampleRate);
  buf.getChannelData(0).set(samples);
  const src = audio.ctx.createBufferSource();
  src.buffer = buf;
  src.connect(audio.ctx.destination);
  src.start();
}

resize();
requestAnimationFrame(frame);

window.__rmv2 = { engine, audio, memory, flags };
