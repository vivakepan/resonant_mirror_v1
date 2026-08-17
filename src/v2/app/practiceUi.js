/**
 * Playable piano keyboard and digital metronome UI.
 */

import {
  pianoKeyLayout,
  pianoRangeLabel,
  midiNoteName,
  computerKeyToMidi,
  clampBpm,
  tapTempoBpm,
} from '../audio/piano.js';
import { PianoEngine, MetronomeEngine } from '../audio/practiceInstruments.js';

const WHITE_KEYS = 15;
const MIN_START = 24;
const MAX_START = 72;

export function mountPracticeInstruments({ audio, getElementById = (id) => document.getElementById(id) } = {}) {
  const keyboardEl = getElementById('pianoKeyboard');
  const octaveLabel = getElementById('octaveLabel');
  const pianoNote = getElementById('pianoNote');
  const metroBpm = getElementById('metroBpm');
  const metroSlider = getElementById('metroSlider');
  const metroStart = getElementById('metroStart');
  const metroStatus = getElementById('metroStatus');
  const metroBeats = getElementById('metroBeats');
  const metroMeter = getElementById('metroMeter');

  let startMidi = 48;
  let piano = null;
  let metro = null;
  const held = new Set();
  const pointerNotes = new Map();
  const tapTimes = [];
  let bpm = 80;

  async function ensureEngines() {
    await audio._ensureContext();
    if (audio.ctx.state === 'suspended') await audio.ctx.resume();
    if (!piano) piano = new PianoEngine(audio.ctx);
    if (!metro) {
      metro = new MetronomeEngine(audio.ctx, { bpm, beatsPerMeasure: Number(metroMeter.value) });
      metro.onBeat = ({ beat, accent }) => {
        highlightBeat(beat, accent);
      };
    }
    return { piano, metro };
  }

  function renderKeyboard() {
    const keys = pianoKeyLayout({ startMidi, whiteKeys: WHITE_KEYS });
    const whites = keys.filter((k) => k.color === 'white');
    keyboardEl.replaceChildren();
    keyboardEl.style.setProperty('--white-count', String(whites.length));
    for (const key of keys.filter((k) => k.color === 'white')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'piano-key piano-white';
      btn.dataset.midi = String(key.midi);
      btn.dataset.color = 'white';
      btn.setAttribute('aria-label', midiNoteName(key.midi));
      if (key.midi % 12 === 0) btn.textContent = midiNoteName(key.midi);
      keyboardEl.appendChild(btn);
    }
    for (const key of keys.filter((k) => k.color === 'black')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'piano-key piano-black';
      btn.dataset.midi = String(key.midi);
      btn.dataset.color = 'black';
      btn.setAttribute('aria-label', midiNoteName(key.midi));
      const w = 100 / whites.length;
      btn.style.left = `${(key.whiteIndex + 1) * w - w * 0.32}%`;
      btn.style.width = `${w * 0.62}%`;
      keyboardEl.appendChild(btn);
    }
    octaveLabel.textContent = pianoRangeLabel(keys);
  }

  function midiFromPoint(x, y) {
    const stack = document.elementsFromPoint?.(x, y) || [];
    for (const el of stack) {
      if (el?.dataset?.midi) return Number(el.dataset.midi);
    }
    return null;
  }

  function paintKey(midi, on) {
    const el = keyboardEl.querySelector(`[data-midi="${midi}"]`);
    if (el) el.classList.toggle('on', on);
  }

  async function noteOn(midi) {
    if (midi == null || held.has(midi)) return;
    const { piano: engine } = await ensureEngines();
    held.add(midi);
    engine.noteOn(midi);
    paintKey(midi, true);
    pianoNote.textContent = `${midiNoteName(midi)} · ${Math.round(440 * 2 ** ((midi - 69) / 12))} Hz`;
  }

  function noteOff(midi) {
    if (midi == null || !held.has(midi)) return;
    held.delete(midi);
    piano?.noteOff(midi);
    paintKey(midi, false);
  }

  keyboardEl.addEventListener('pointerdown', async (e) => {
    const midi = Number(e.target?.dataset?.midi);
    if (!Number.isFinite(midi)) return;
    e.preventDefault();
    keyboardEl.setPointerCapture(e.pointerId);
    pointerNotes.set(e.pointerId, midi);
    await noteOn(midi);
  });
  keyboardEl.addEventListener('pointermove', async (e) => {
    if (!pointerNotes.has(e.pointerId)) return;
    const midi = midiFromPoint(e.clientX, e.clientY);
    const prev = pointerNotes.get(e.pointerId);
    if (midi == null || midi === prev) return;
    noteOff(prev);
    pointerNotes.set(e.pointerId, midi);
    await noteOn(midi);
  });
  function releasePointer(e) {
    const midi = pointerNotes.get(e.pointerId);
    pointerNotes.delete(e.pointerId);
    noteOff(midi);
  }
  keyboardEl.addEventListener('pointerup', releasePointer);
  keyboardEl.addEventListener('pointercancel', releasePointer);

  window.addEventListener('keydown', async (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'BracketLeft') {
      startMidi = Math.max(MIN_START, startMidi - 12);
      piano?.allOff();
      held.clear();
      renderKeyboard();
      return;
    }
    if (e.code === 'BracketRight') {
      startMidi = Math.min(MAX_START, startMidi + 12);
      piano?.allOff();
      held.clear();
      renderKeyboard();
      return;
    }
    const midi = computerKeyToMidi(e.code, startMidi);
    if (midi == null) return;
    e.preventDefault();
    await noteOn(midi);
  });
  window.addEventListener('keyup', (e) => {
    const midi = computerKeyToMidi(e.code, startMidi);
    if (midi == null) return;
    noteOff(midi);
  });

  getElementById('octaveDown').addEventListener('click', () => {
    startMidi = Math.max(MIN_START, startMidi - 12);
    piano?.allOff();
    held.clear();
    renderKeyboard();
  });
  getElementById('octaveUp').addEventListener('click', () => {
    startMidi = Math.min(MAX_START, startMidi + 12);
    piano?.allOff();
    held.clear();
    renderKeyboard();
  });

  function renderBeats() {
    const n = Number(metroMeter.value);
    metroBeats.replaceChildren();
    for (let i = 0; i < n; i++) {
      const dot = document.createElement('span');
      dot.className = 'metro-dot' + (i === 0 ? ' downbeat' : '');
      dot.dataset.beat = String(i);
      metroBeats.appendChild(dot);
    }
  }

  function highlightBeat(beat) {
    for (const dot of metroBeats.children) {
      dot.classList.toggle('on', Number(dot.dataset.beat) === beat);
    }
  }

  function showBpm() {
    metroBpm.textContent = String(bpm);
    metroSlider.value = String(bpm);
    if (metro) metro.setBpm(bpm);
  }

  async function applyBpm(next) {
    bpm = clampBpm(next);
    showBpm();
    if (metro?.running) {
      metro.stop();
      await ensureEngines();
      metro.setBpm(bpm);
      metro.start();
      metroStart.textContent = 'Stop';
    }
  }

  getElementById('metroDown').addEventListener('click', () => applyBpm(bpm - 1));
  getElementById('metroUp').addEventListener('click', () => applyBpm(bpm + 1));
  metroSlider.addEventListener('input', () => applyBpm(metroSlider.value));
  metroMeter.addEventListener('change', async () => {
    renderBeats();
    const { metro: engine } = await ensureEngines();
    engine.setMeter(Number(metroMeter.value));
  });
  metroStart.addEventListener('click', async () => {
    const { metro: engine } = await ensureEngines();
    engine.setBpm(bpm);
    engine.setMeter(Number(metroMeter.value));
    const running = engine.toggle();
    metroStart.textContent = running ? 'Stop' : 'Start';
    metroStatus.textContent = running ? `${bpm} BPM · running` : 'stopped';
    if (!running) highlightBeat(-1);
  });
  getElementById('metroTap').addEventListener('click', () => {
    tapTimes.push(performance.now());
    const tapped = tapTempoBpm(tapTimes);
    if (tapped) applyBpm(tapped);
  });

  renderKeyboard();
  renderBeats();
  showBpm();
  return { get startMidi() { return startMidi; } };
}
