/**
 * ui.js — Interactive controls and sidebar
 *
 * Wires up the frequency slider, preset buttons, anti-resonance buttons,
 * sweep toggle, speed multiplier, and the sidebar zone bars.
 * Calls back into the state object in main.js via a setState callback.
 */

import { zones, freqToNote } from './physics.js';
import { viewModifiers } from './views.js';
import { envPresets, envOrder } from './env.js';
import { downloadSessionsJsonl } from './sessions.js';


// ─── Sidebar zone bars ─────────────────────────────────────────

export function createZoneBars() {
  const container = document.getElementById('zones');
  return zones.map(z => {
    const row = document.createElement('div');
    row.className = 'zone-row';
    // AIN-RS-012 / A-008: honest-disclosure notes (e.g. heart zone caveat)
    // and multi-modal mode summaries surface on hover.
    const modeNote = z.modes
      ? `Modes: ${z.modes.map(m => m.f + ' Hz (' + m.evidence.split('—')[0].trim() + ')').join('; ')}`
      : '';
    const tip = [z.note, modeNote].filter(Boolean).join('  •  ');
    if (tip) row.title = tip;
    row.innerHTML = `
      <span class="dot" style="background:${z.color};color:${z.color}"></span>
      <div>
        <div style="color:${z.color};font-size:10px;letter-spacing:0.05em;">${z.name}</div>
        <div class="bar-cell"><div class="bar-fill" style="color:${z.color};width:0%"></div></div>
      </div>
      <div class="pct">0%</div>`;
    container.appendChild(row);
    return {
      fill: row.querySelector('.bar-fill'),
      pct:  row.querySelector('.pct'),
    };
  });
}

export function updateZoneBars(rowEls, amps) {
  zones.forEach((z, i) => {
    rowEls[i].fill.style.width = (amps[i] * 100).toFixed(0) + '%';
    rowEls[i].pct.textContent  = (amps[i] * 100).toFixed(0) + '%';
  });
}


// ─── Control wiring ────────────────────────────────────────────
// Takes a `state` object with: drivers[], sweeping, sweepDir, timeScale.
// Mutates state.drivers[0] (the primary internal driver — the slider).
// External drivers (uploaded song peaks) get appended elsewhere.

export function wireControls(state, audio, breath) {
  const freqInput = document.getElementById('freq');
  const freqVal   = document.getElementById('freqVal');
  const noteName  = document.getElementById('noteName');

  function clearAllActive() {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.anti-btn').forEach(b => b.classList.remove('active'));
  }

  function setDrive(f, activeBtn, asPin = false) {
    if (asPin && state.multiMode) {
      const exists = state.pinnedDrivers.some(d => Math.abs(d.f - f) < 0.5);
      if (exists) {
        state.pinnedDrivers = state.pinnedDrivers.filter(d => Math.abs(d.f - f) >= 0.5);
        if (activeBtn) activeBtn.classList.remove('active');
      } else {
        state.pinnedDrivers.push({ f, amp: 0.85, phase: 0, origin: 'preset' });
        if (activeBtn) activeBtn.classList.add('active');
      }
      renderDriveChips();
      return;
    }
    state.drivers[0].f = f;
    freqInput.value = f;
    freqVal.textContent = f.toFixed ? f.toFixed(1) : f;
    noteName.textContent = freqToNote(f);
    if (!state.multiMode) clearAllActive();
    if (activeBtn && !state.multiMode) activeBtn.classList.add('active');
    if (activeBtn && state.multiMode && !asPin) activeBtn.classList.add('active');
  }

  function renderDriveChips() {
    const el = document.getElementById('driveChips');
    if (!el) return;
    el.innerHTML = '';
    const list = [state.drivers[0], ...state.pinnedDrivers];
    list.forEach((d, i) => {
      const chip = document.createElement('span');
      chip.className = 'drive-chip' + (i === 0 ? ' primary' : '');
      chip.textContent = `${d.f.toFixed(0)} Hz`;
      el.appendChild(chip);
    });
  }

  // Slider
  freqInput.addEventListener('input', e => {
    setDrive(parseFloat(e.target.value), null);
  });

  // Preset buttons (resonance peaks)
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setDrive(parseFloat(btn.dataset.f), btn, state.multiMode);
    });
  });

  document.querySelectorAll('.anti-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setDrive(parseFloat(btn.dataset.f), btn, state.multiMode);
    });
  });

  const multiBtn = document.getElementById('multi');
  if (multiBtn) {
    multiBtn.addEventListener('click', () => {
      state.multiMode = !state.multiMode;
      multiBtn.classList.toggle('on', state.multiMode);
      if (!state.multiMode) {
        state.pinnedDrivers = [];
        clearAllActive();
      }
      renderDriveChips();
    });
  }

  const clearBtn = document.getElementById('clearPins');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.pinnedDrivers = [];
      clearAllActive();
      renderDriveChips();
    });
  }

  const envBtn = document.getElementById('env');
  if (envBtn) {
    let envIdx = 0;
    envBtn.addEventListener('click', () => {
      envIdx = (envIdx + 1) % envOrder.length;
      state.envType = envOrder[envIdx];
      const env = envPresets[state.envType];
      envBtn.innerHTML = env
        ? `<span class="lbl">ENV</span>${env.label.split(' · ')[0]}`
        : '<span class="lbl">ENV</span>NONE';
      envBtn.classList.toggle('on', state.envType !== 'none');
    });
  }

  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.viewMode = btn.dataset.view;
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const cap = document.getElementById('viewCaption');
      if (cap) cap.textContent = viewModifiers[state.viewMode]?.caption || '';
    });
  });

  const listenBtn = document.getElementById('listen');
  const audioMeta = document.getElementById('audioMeta');
  if (listenBtn && audio) {
    listenBtn.addEventListener('click', async () => {
      if (audio.isMicActive()) {
        audio.stopMic();
        listenBtn.classList.remove('on');
        if (audioMeta) audioMeta.textContent = 'no mic · slider controls drive';
        return;
      }
      listenBtn.classList.remove('denied');
      const ok = await audio.startMic();
      if (!ok) {
        listenBtn.classList.add('denied');
        if (audioMeta) audioMeta.textContent = 'mic denied or unavailable';
        return;
      }
      listenBtn.classList.add('on');
      if (audioMeta) audioMeta.textContent = 'mic live · pitch drives internal source';
    });
  }

  const exportBtn = document.getElementById('exportSession');
  if (exportBtn && state.sessionRecorder) {
    exportBtn.addEventListener('click', async () => {
      const line = await state.sessionRecorder.toJsonlLine(audio.lastFile);
      downloadSessionsJsonl([line]);
    });
  }

  renderDriveChips();

  // Sweep toggle
  const sweepBtn = document.getElementById('sweep');
  sweepBtn.addEventListener('click', () => {
    state.sweeping = !state.sweeping;
    sweepBtn.classList.toggle('on', state.sweeping);
    sweepBtn.textContent = state.sweeping ? 'STOP SWEEP' : 'SWEEP';
  });

  // Speed multiplier (visualization timing only)
  const speedStops = [0.25, 0.5, 1, 2, 4];
  let speedIdx = 2;
  const speedBtn = document.getElementById('speed');
  speedBtn.addEventListener('click', () => {
    speedIdx = (speedIdx + 1) % speedStops.length;
    state.timeScale = speedStops[speedIdx];
    speedBtn.innerHTML = `<span class="lbl">RATE</span>${state.timeScale}×`;
  });

  // Initialize note display from the primary driver
  noteName.textContent = freqToNote(state.drivers[0].f);

  // ── §5a song / external-source controls ──
  // The audio engine pulls peaks each frame; this UI just chooses the file,
  // gates play/pause, and exposes the externalBalance + K parameters.
  if (audio) wireSongControls(state, audio);

  // ── §5b breath controls ──
  const breathUpdate = breath ? wireBreathControls(breath, state) : null;

  // Return a handle for per-frame updates
  return {
    renderDriveChips,
    updateSweepDisplay() {
      const f = state.drivers[0].f;
      freqInput.value = f;
      freqVal.textContent = f.toFixed(1);
      noteName.textContent = freqToNote(f);
    },
    updateBreathDisplay(vt) {
      if (breathUpdate) breathUpdate(vt);
    },
  };
}


// ─── Song / external source wiring (§5a) ───────────────────────

function wireSongControls(state, audio) {
  const fileInput   = document.getElementById('songFile');
  const fileLabel   = document.querySelector('label[for="songFile"]');
  const playBtn     = document.getElementById('songPlay');
  const stopBtn     = document.getElementById('songStop');
  const fieldBtn    = document.getElementById('fieldToggle');
  const balInput    = document.getElementById('songBalance');
  const balVal      = document.getElementById('songBalanceVal');
  const kInput      = document.getElementById('songK');
  const kVal        = document.getElementById('songKVal');
  const status      = document.getElementById('songStatus');

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const el = await audio.load(file);
      fileLabel.textContent = file.name.length > 28 ? file.name.slice(0, 25) + '…' : file.name;
      fileLabel.classList.add('loaded');
      status.textContent = `Loaded · ${file.name}`;
      status.classList.add('loaded');
      playBtn.disabled = false;
      stopBtn.disabled = false;
      el.addEventListener('ended', () => {
        audio.pause();
        playBtn.textContent = '▶ PLAY';
        playBtn.classList.remove('on');
      });
    } catch (err) {
      status.textContent = `Failed to load: ${err.message}`;
    }
  });

  playBtn.addEventListener('click', () => {
    if (audio.isPlaying()) {
      audio.pause();
      playBtn.textContent = '▶ PLAY';
      playBtn.classList.remove('on');
    } else {
      audio.play();
      playBtn.textContent = '❚❚ PAUSE';
      playBtn.classList.add('on');
    }
  });

  stopBtn.addEventListener('click', () => {
    audio.stop();
    playBtn.textContent = '▶ PLAY';
    playBtn.classList.remove('on');
    state.externalDrivers = [];
  });

  fieldBtn.addEventListener('click', () => {
    state.fieldEnabled = !state.fieldEnabled;
    fieldBtn.classList.toggle('on', state.fieldEnabled);
  });

  balInput.addEventListener('input', e => {
    state.externalBalance = parseFloat(e.target.value);
    balVal.textContent = Math.round(state.externalBalance * 100) + '%';
  });

  kInput.addEventListener('input', e => {
    const k = parseInt(e.target.value, 10);
    audio.setK(k);
    kVal.textContent = String(k);
  });
}


// ─── Breath wiring (§5b) ───────────────────────────────────────

function wireBreathControls(breath, state) {
  const toggleBtn  = document.getElementById('breathToggle');
  const modeBtn    = document.getElementById('breathMode');
  const periodIn   = document.getElementById('breathPeriod');
  const periodVal  = document.getElementById('breathPeriodVal');
  const bar        = document.getElementById('breathBar');

  const modes = ['sine', 'tap', 'mic'];
  const modeLabels = { sine: 'MODE · SYNTH', tap: 'MODE · TAP', mic: 'MODE · MIC' };
  let modeIdx = 0;

  toggleBtn.addEventListener('click', () => {
    const next = !breath.enabled;
    breath.setEnabled(next);
    state.breathEnabled = next;
    toggleBtn.classList.toggle('on', next);
  });

  modeBtn.addEventListener('click', () => {
    modeIdx = (modeIdx + 1) % modes.length;
    const m = modes[modeIdx];
    breath.setMode(m);
    modeBtn.textContent = modeLabels[m];
  });

  periodIn.addEventListener('input', e => {
    const s = parseFloat(e.target.value);
    breath.setPeriodSeconds(s);
    periodVal.textContent = s.toFixed(1) + 's';
  });

  // Tap-to-breathe: spacebar held = inhale, released = exhale. Only active
  // when mode === 'tap'; otherwise spacebar is left alone for the browser.
  window.addEventListener('keydown', (e) => {
    if (breath.mode !== 'tap' || e.code !== 'Space' || e.repeat) return;
    e.preventDefault();
    breath.onTapDown(state.vt);
  });
  window.addEventListener('keyup', (e) => {
    if (breath.mode !== 'tap' || e.code !== 'Space') return;
    e.preventDefault();
    breath.onTapUp(state.vt);
  });

  // Per-frame display updater
  return function update(vt) {
    const env = breath.envelope(vt);
    bar.style.width = (env * 100).toFixed(1) + '%';
  };
}
