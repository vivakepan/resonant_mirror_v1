/**
 * Resonant Mirror v2 observation UI.
 * Renderer consumes provenance-tagged visual states only.
 */

import { DualAudioPipeline } from '../audio/dualPipeline.js';
import { ObservationEngine } from '../session/engine.js';
import {
  anatomyDrawPlan,
  drawAnatomyV2,
  nextAnatomyYaw,
  nextFigureZoom,
  pointHitsLarynx,
  pointHitsSkull,
} from '../anatomy/anatomyRenderer.js?v=mouth-wide-1';
import { BreathKinematics, defaultBreathDemo, REST_POSE, VoiceSyncedBreath } from '../anatomy/breathKinematics.js';
import {
  drawVocalFoldCloseup,
  estimateVocalFoldState,
  foldHudSummary,
  idleVocalFoldState,
  overlayTechniqueOnLive,
} from '../anatomy/vocalFoldState.js?v=mouth-wide-1';
import { renderInspectorHtml } from '../visualization/inspector.js';
import { defaultFeatureFlags } from '../contracts/featureFlags.js';
import { EVIDENCE_LABELS } from '../contracts/evidence.js';
import { HEADPHONE_GUIDANCE } from '../audio/leakage.js';
import { PersonalMemory } from '../memory/personalMemory.js';
import { SELF_TENSION_LABELS } from '../tension/estimator.js';
import { comparePitchToReference, PitchAccuracyTracker } from '../acoustic/pitchAccuracy.js';
import {
  drawSkullCloseup,
  nextSkullYaw,
  nextSkullZoom,
  skullCloseupState,
} from '../anatomy/skullCloseup.js?v=mouth-wide-1';
import { mountPracticeInstruments } from './practiceUi.js';
import { parseSongFilename } from '../lyrics/parseFilename.js';
import { formatVowelSensationLine } from '../resonance/vowelMap.js';

const flags = defaultFeatureFlags();
const engine = new ObservationEngine({ flags });
const audio = new DualAudioPipeline();
const memory = new PersonalMemory();
const pitchAccuracy = new PitchAccuracyTracker();

const canvas = document.getElementById('anatomy');
const ctx = canvas.getContext('2d');
const foldDialog = document.getElementById('foldDialog');
const foldCanvas = document.getElementById('vocalFoldCanvas');
const foldCtx = foldCanvas.getContext('2d');
const skullDialog = document.getElementById('skullDialog');
const skullCanvas = document.getElementById('skullCanvas');
const skullCtx = skullCanvas.getContext('2d');
let skull2dZoom = 0.78;
let skullYaw = 0;
const THREE_QUARTER_YAW = 0.62;
let viewYaw = THREE_QUARTER_YAW;
let figureZoom = 0.88;
const layers = {
  transparentAnatomy: false,
  actualPitch: true,
  resonance: true,
  respiratory: true,
  vagus: false,
  vagusFocus: false,
  circulatory: true,
  registration: true,
  tension: true,
  aura: true,
  support: false,
  lanes: false,
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

function bindToggle(id, key) {
  const el = document.getElementById(id);
  if (!el) return;
  layers[key] = el.checked;
  el.addEventListener('change', (e) => { layers[key] = e.target.checked; });
}

document.getElementById('micBtn').addEventListener('click', async () => {
  try {
    await audio.startMicrophone();
    document.getElementById('foldTechniqueSelect').value = 'live';
    setText('micStatus', 'microphone on · local only');
  } catch {
    setText('micStatus', 'microphone unavailable');
  }
});

document.getElementById('songFile').addEventListener('change', async (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  await audio.loadReference(file);
  pitchAccuracy.reset();
  const guessed = parseSongFilename(file.name);
  setText(
    'songStatus',
    guessed.artist
      ? `reference: ${guessed.artist} — ${guessed.title}`
      : `reference loaded: ${file.name}`,
  );
  setText('pitchAccuracyReadout', '—');
  setText('pitchAccuracyDetail', 'play the reference and sing');
  document.getElementById('leakWarn').textContent = HEADPHONE_GUIDANCE;
});

document.getElementById('playBtn').addEventListener('click', async () => {
  try {
    if (audio.ctx?.state === 'suspended') await audio.ctx.resume();
  } catch { /* ignore */ }
  document.getElementById('foldTechniqueSelect').value = 'live';
  audio.playReference();
});
document.getElementById('stopBtn').addEventListener('click', () => {
  audio.pauseReference();
});

bindToggle('transparent', 'transparentAnatomy');
bindToggle('pitchLayer', 'actualPitch');
bindToggle('resonanceLayer', 'resonance');
bindToggle('breathLayer', 'respiratory');
bindToggle('circulatoryLayer', 'circulatory');
bindToggle('registrationLayer', 'registration');
bindToggle('tensionLayer', 'tension');
bindToggle('auraLayer', 'aura');
bindToggle('supportLayer', 'support');
bindToggle('lanesLayer', 'lanes');

const breathVagusBtn = document.getElementById('breathVagusBtn');
breathVagusBtn.addEventListener('click', () => {
  layers.vagus = !layers.vagus;
  layers.vagusFocus = layers.vagus;
  if (layers.vagus) {
    layers.respiratory = true;
    document.getElementById('breathLayer').checked = true;
  }
  breathVagusBtn.setAttribute('aria-pressed', String(layers.vagus));
  breathVagusBtn.textContent = layers.vagus ? 'Breath + vagus · on' : 'Breath + vagus';
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
let lastUser = null;
let lastReference = null;
const breathMotion = new BreathKinematics();
const voiceBreath = new VoiceSyncedBreath();
let lastPlan = null;
let lastPose = null;

function frame(now) {
  const W = canvas.getBoundingClientRect().width;
  const H = canvas.getBoundingClientRect().height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#07090c';
  ctx.fillRect(0, 0, W, H);

  if (audio.ctx) {
    const pair = audio.readWindows();
    const extras = { selfLabels: activeLabels(), memory };
    const user = engine.processPacket(pair.user, extras);
    const reference = engine.processPacket(pair.reference, extras);
    if (user) lastUser = user;
    if (reference) lastReference = reference;
    if (reference && audio.pipeline.referencePlaying) {
      if (!user) lastVisuals = reference.visuals;
    }
    if (audio.pipeline.referencePlaying) {
      renderPitchAccuracy(comparePitchToReference(user?.frame, reference?.frame, {
        alignment: pair.alignment,
        leakage: pair.leakage,
      }));
    }
    if (user) {
      lastVisuals = user.visuals;
      setText('pitchReadout', user.display.pitch);
      setText('levelReadout', user.display.level);
      setText('levelHint', user.display.levelUnitLabel);
      const leak = pair.leakage;
      setText('latency', JSON.stringify(pair.latency, null, 2));
      if (leak.warning) setText('leakWarn', leak.warning);
      const lanes = document.getElementById('lanes');
      lanes.textContent = `singer @ ${pair.user?.timestampSeconds ?? '—'}s · reference @ ${pair.reference?.timestampSeconds ?? '—'}s`;
      const reg = user.frame.inferences.registration;
      setText('registrationReadout', reg?.class === 'unknown' || !reg
        ? 'unknown'
        : `${reg.class.replaceAll('_', ' ')} (${Math.round((reg.confidence || 0) * 100)}% confidence, experimental)`);
      const resp = user.frame.inferences.respiration;
      setText('breathReadout', !resp || resp.class === 'unknown'
        ? 'unknown'
        : `${resp.class.replaceAll('_', ' ')} · anatomy simulated`);
      const ten = user.frame.inferences.tensionEvidence;
      setText('tensionReadout', ten?.accessibilityCue || 'tension evidence: none');
    }
  }

  const voiceFrame = audio.pipeline.microphoneActive
    ? lastUser?.frame
    : audio.pipeline.referencePlaying
      ? lastReference?.frame
      : null;
  const idleDemo = layers.respiratory
    && !voiceFrame
    && !audio.pipeline.microphoneActive
    && !audio.pipeline.referencePlaying
    ? defaultBreathDemo(now)
    : null;
  let pose;
  let referenceBreath = null;
  if (!layers.respiratory) {
    pose = { ...REST_POSE };
  } else if (voiceFrame) {
    pose = voiceBreath.step(voiceFrame.features, now, {
      respirationClass: voiceFrame.inferences?.respiration?.class,
    });
    if (audio.pipeline.referencePlaying && !audio.pipeline.microphoneActive) {
      referenceBreath = {
        className: voiceBreath.className,
        pose,
        label: 'reference audio → simulated breath · not a vocalist sensor',
      };
    }
  } else if (idleDemo) {
    pose = idleDemo.pose;
  } else {
    pose = breathMotion.step(
      lastUser?.frame?.inferences?.respiration?.class || 'unknown',
      now,
    );
  }
  lastPose = pose;
  setText(
    'breathMode',
    !layers.respiratory
      ? 'breath layer off'
      : idleDemo
        ? 'idle breath · simulated'
        : referenceBreath
          ? 'reference breath · not a vocalist'
          : 'microphone breath · voice-synced',
  );
  if (idleDemo) setText('breathReadout', idleDemo.className.replaceAll('_', ' '));
  if (referenceBreath) setText('breathReadout', `${voiceBreath.className.replaceAll('_', ' ')} · voice-synced`);
  const plan = anatomyDrawPlan(mergeLaneVisuals(lastVisuals, lastReference), {
    transparent: layers.transparentAnatomy,
    showPitch: layers.actualPitch,
    showResonance: layers.resonance,
    showRespiratory: layers.respiratory,
    showVagus: layers.vagus,
    vagusFocus: layers.vagusFocus,
    showCirculatory: layers.circulatory,
    showRegistration: layers.registration,
    showTension: layers.tension,
    showAura: layers.aura,
    showSupport: layers.support,
    showLanes: layers.lanes,
    timeMs: now,
    pose,
    demoBreath: idleDemo || referenceBreath,
    viewYawRadians: viewYaw,
    figureZoom,
  });
  lastPlan = plan;
  drawAnatomyV2(ctx, W, H, plan);
  const yawDeg = plan.view?.yawDegrees ?? Math.round(viewYaw * 180 / Math.PI);
  setText('yawReadout', `head ${yawDeg}° · drag to turn`);
  const vowel = plan.vowelMap;
  const vowelLine = formatVowelSensationLine(vowel);
  setText('vowelReadout', vowelLine.title);
  setText('vowelDetail', vowelLine.detail);

  if (layers.inspector) {
    document.getElementById('inspector').innerHTML = renderInspectorHtml(lastVisuals);
  }
  if (foldDialog.open) renderFoldZoom(now);
  if (skullDialog.open) renderSkullZoom(now);
  requestAnimationFrame(frame);
}

function renderPitchAccuracy(comparison) {
  const summary = pitchAccuracy.add(comparison);
  if (!comparison.available) {
    setText(
      'pitchAccuracyReadout',
      summary.inTunePercent == null ? '—' : `${summary.inTunePercent}% in tune`,
    );
    setText('pitchAccuracyDetail', comparison.detail);
    return;
  }
  setText('pitchAccuracyReadout', `${summary.inTunePercent}% in tune`);
  setText(
    'pitchAccuracyDetail',
    `${comparison.display} now · mean ${Math.round(summary.meanAbsoluteCents)}¢`,
  );
}

function openFoldZoom() {
  if (!foldDialog.open) foldDialog.showModal();
}

function renderFoldZoom(now) {
  const rect = foldCanvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  if (foldCanvas.width !== width * dpr || foldCanvas.height !== height * dpr) {
    foldCanvas.width = width * dpr;
    foldCanvas.height = height * dpr;
  }
  foldCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const voiceFoldFrame = audio.pipeline.referencePlaying
    ? lastReference?.frame
    : (audio.pipeline.microphoneActive ? lastUser?.frame : null);
  const evidenceState = voiceFoldFrame
    ? estimateVocalFoldState(voiceFoldFrame, lastPose || {})
    : idleVocalFoldState(lastPose || {});
  const picker = document.getElementById('foldTechniqueSelect');
  const requested = picker.value;
  const followLive = requested === 'live' || !requested;
  const state = followLive
    ? evidenceState
    : overlayTechniqueOnLive(evidenceState, requested, now);
  if (lastPlan?.airflow) {
    state.airflow = {
      flowRate: lastPlan.airflow.flowRate,
      direction: lastPlan.airflow.direction,
      phonated: lastPlan.airflow.phonated || evidenceState.airflow?.phonated,
    };
  }
  if (!(state.frequencyHertz > 60) && lastPlan?.actualPitch?.frequencyHertz > 60) {
    state.frequencyHertz = lastPlan.actualPitch.frequencyHertz;
  }
  const dynamics = drawVocalFoldCloseup(foldCtx, width, height, state, now);
  const hud = foldHudSummary(state, dynamics);
  document.getElementById('foldOpeningMarker').style.left = `${hud.openingMarkerPercent}%`;
  const tensionMarker = document.getElementById('foldTensionMarker');
  tensionMarker.style.left = `${state.tensionPercent ?? 50}%`;
  tensionMarker.style.opacity = state.tensionPercent == null ? '0.2' : '1';
  setText('foldPosture', hud.openingLabel);
  setText('foldPostureDetail', hud.openingDetail);
  setText('foldTension', hud.tensionLabel);
  setText('foldTensionDetail', hud.tensionDetail);
  setText('foldVibration', hud.vibrationLabel);
  setText('foldVibrationDetail', hud.vibrationDetail);
  setText('foldTechnique', hud.techniqueLabel);
  setText('foldTechniqueDetail', hud.techniqueDetail);
  setText('foldEvidence', hud.evidenceLabel);
  setText('foldEvidenceDetail', hud.evidenceDetail);
  setText('foldCycle', hud.cycleLabel);
  setText('foldContact', hud.contactLabel);
  setText('foldWave', hud.waveLabel);
}

function openSkullZoom() {
  if (!skullDialog.open) skullDialog.showModal();
}

function renderSkullZoom(now) {
  const observedFrame = audio.pipeline.microphoneActive
    ? lastUser?.frame
    : audio.pipeline.referencePlaying
      ? lastReference?.frame
      : lastUser?.frame || lastReference?.frame || null;
  const state = skullCloseupState(observedFrame, lastPlan);

  const rect = skullCanvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  if (skullCanvas.width !== width * dpr || skullCanvas.height !== height * dpr) {
    skullCanvas.width = width * dpr;
    skullCanvas.height = height * dpr;
  }
  skullCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawSkullCloseup(skullCtx, width, height, state, now, {
    zoom: skull2dZoom,
    yaw: skullYaw,
  });

  setText('skullHeadPattern', state.headPattern);
  setText('skullHeadEvidence', state.surfaceLabel);
  setText('skullChambers', state.chamberLabel);
  setText(
    'skullChamberEvidence',
    state.formantsHertz.length
      ? state.formantsHertz.slice(0, 3).map((hz, i) => `F${i + 1} ${Math.round(hz)} Hz`).join(' · ')
      : 'no reliable formant candidates',
  );
  setText('skullLimitation', state.limitation);
  const vowel = state.vowelMap;
  const vowelLine = formatVowelSensationLine(vowel);
  setText('skullVowel', vowelLine.title);
  setText('skullVowelDetail', vowelLine.detail);
}

skullCanvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  skull2dZoom = nextSkullZoom(skull2dZoom, event.deltaY);
}, { passive: false });

let skullDrag = null;
skullCanvas.addEventListener('pointerdown', (event) => {
  skullDrag = { id: event.pointerId, x: event.clientX, yaw: skullYaw };
  skullCanvas.setPointerCapture(event.pointerId);
  skullCanvas.style.cursor = 'grabbing';
});
skullCanvas.addEventListener('pointermove', (event) => {
  if (!skullDrag || event.pointerId !== skullDrag.id) return;
  skullYaw = nextSkullYaw(skullDrag.yaw, event.clientX - skullDrag.x);
});
function endSkullDrag(event) {
  if (!skullDrag || event.pointerId !== skullDrag.id) return;
  skullDrag = null;
  skullCanvas.style.cursor = 'grab';
}
skullCanvas.addEventListener('pointerup', endSkullDrag);
skullCanvas.addEventListener('pointercancel', endSkullDrag);

let suppressCanvasClick = false;
let anatomyDrag = null;
const viewYawHint = document.getElementById('viewYawHint');

function yawIsThreeQuarter(yaw) {
  const wrapped = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const dist = Math.min(
    Math.abs(wrapped - THREE_QUARTER_YAW),
    Math.abs(wrapped - (Math.PI * 2 - THREE_QUARTER_YAW)),
  );
  return dist < 0.12;
}

function syncYawHint() {
  if (!viewYawHint) return;
  const threeQuarter = yawIsThreeQuarter(viewYaw);
  viewYawHint.setAttribute('aria-pressed', String(threeQuarter));
  viewYawHint.textContent = threeQuarter ? '¾ view' : 'front';
}

viewYawHint?.addEventListener('click', () => {
  viewYaw = yawIsThreeQuarter(viewYaw) ? 0 : THREE_QUARTER_YAW;
  syncYawHint();
});
syncYawHint();

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  figureZoom = nextFigureZoom(figureZoom, event.deltaY);
}, { passive: false });

document.getElementById('figureZoomOut')?.addEventListener('click', () => {
  figureZoom = nextFigureZoom(figureZoom, 160);
});
document.getElementById('figureZoomIn')?.addEventListener('click', () => {
  figureZoom = nextFigureZoom(figureZoom, -160);
});
document.getElementById('skullZoomOut')?.addEventListener('click', () => {
  skull2dZoom = nextSkullZoom(skull2dZoom, 160);
});
document.getElementById('skullZoomIn')?.addEventListener('click', () => {
  skull2dZoom = nextSkullZoom(skull2dZoom, -160);
});

canvas.addEventListener('pointerdown', (event) => {
  anatomyDrag = { id: event.pointerId, x: event.clientX, yaw: viewYaw, moved: false };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (anatomyDrag && event.pointerId === anatomyDrag.id) {
    const dx = event.clientX - anatomyDrag.x;
    if (Math.abs(dx) > 8) anatomyDrag.moved = true;
    if (anatomyDrag.moved) {
      viewYaw = nextAnatomyYaw(anatomyDrag.yaw, dx);
      suppressCanvasClick = true;
      canvas.style.cursor = 'grabbing';
      syncYawHint();
      return;
    }
  }
  if (!lastPlan) return;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  canvas.style.cursor = (
    pointHitsSkull(x, y, rect.width, rect.height, lastPlan)
    || pointHitsLarynx(x, y, rect.width, rect.height, lastPlan)
  ) ? 'zoom-in' : 'grab';
});
function endAnatomyDrag(event) {
  if (!anatomyDrag || event.pointerId !== anatomyDrag.id) return;
  anatomyDrag = null;
  canvas.style.cursor = 'grab';
}
canvas.addEventListener('pointerup', endAnatomyDrag);
canvas.addEventListener('pointercancel', endAnatomyDrag);

canvas.addEventListener('click', (event) => {
  if (suppressCanvasClick) {
    suppressCanvasClick = false;
    return;
  }
  if (!lastPlan) return;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  if (pointHitsSkull(x, y, rect.width, rect.height, lastPlan)) {
    openSkullZoom();
  } else if (pointHitsLarynx(x, y, rect.width, rect.height, lastPlan)) {
    openFoldZoom();
  }
});
canvas.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (event.shiftKey) openSkullZoom();
    else openFoldZoom();
  }
});
document.getElementById('foldZoomHint').addEventListener('click', openFoldZoom);
document.getElementById('foldClose').addEventListener('click', () => foldDialog.close());
document.getElementById('skullZoomHint').addEventListener('click', openSkullZoom);
document.getElementById('skullClose').addEventListener('click', () => skullDialog.close());

function mergeLaneVisuals(userVisuals, referenceResult) {
  const merged = [...userVisuals];
  const refBreath = referenceResult?.visuals?.find((v) => v.visualName === 'breathLaneReference');
  if (refBreath) {
    const idx = merged.findIndex((v) => v.visualName === 'breathLaneReference');
    if (idx >= 0) merged[idx] = refBreath;
    else merged.push(refBreath);
  }
  return merged;
}

document.getElementById('legend').innerHTML = Object.entries(EVIDENCE_LABELS)
  .map(([k, v]) => `<li><code>${k}</code> — ${v}</li>`)
  .join('');

mountPracticeInstruments({ audio });

resize();
requestAnimationFrame(frame);

window.__rmv2 = { engine, audio, memory, flags };
