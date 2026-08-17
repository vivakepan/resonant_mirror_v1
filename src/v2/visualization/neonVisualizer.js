const TAU = Math.PI * 2;

function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v));
}

export class BeatPulseDetector {
  constructor() {
    this.averageEnergy = 0.04;
    this.lastBeatMs = -Infinity;
    this.lastUpdateMs = null;
    this.pulse = 0;
  }

  update(rmsAmplitude = 0, timeMs = 0) {
    const energy = clamp(Number.isFinite(rmsAmplitude) ? rmsAmplitude : 0);
    const dt = this.lastUpdateMs == null ? 16 : Math.max(1, timeMs - this.lastUpdateMs);
    this.lastUpdateMs = timeMs;
    const threshold = Math.max(0.025, this.averageEnergy * 1.42);
    const onset = energy > threshold && timeMs - this.lastBeatMs > 180;
    if (onset) {
      this.lastBeatMs = timeMs;
      this.pulse = 1;
    } else {
      this.pulse *= Math.exp(-dt / 260);
    }
    this.averageEnergy = this.averageEnergy * 0.965 + energy * 0.035;
    return { onset, pulse: this.pulse, energy, averageEnergy: this.averageEnergy };
  }
}

export function neonParameters(features = {}, pulse = 0, timeMs = 0) {
  const frequency = features.fundamentalFrequencyHertz;
  const pitchHue = frequency > 0
    ? 185 + clamp(Math.log2(frequency / 70) / Math.log2(1200 / 70)) * 150
    : 205;
  const centroidHue = Number.isFinite(features.spectralCentroidHertz)
    ? clamp(features.spectralCentroidHertz / 5000) * 90
    : 35;
  const energy = clamp((features.rmsAmplitude ?? 0) * 4.5);
  const periodicity = clamp(features.periodicity ?? 0.35);
  return {
    hue: (pitchHue + centroidHue + timeMs * 0.003) % 360,
    accentHue: (pitchHue + 115) % 360,
    energy,
    periodicity,
    pulse: clamp(pulse),
    glow: 10 + energy * 28 + pulse * 30,
  };
}

export class NeonVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext('2d') || null;
    this.beat = new BeatPulseDetector();
  }

  resize() {
    if (!this.canvas || !this.ctx) return { width: 0, height: 0 };
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (this.canvas.width !== width * dpr || this.canvas.height !== height * dpr) {
      this.canvas.width = width * dpr;
      this.canvas.height = height * dpr;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width, height };
  }

  render({ features = {}, samples = null, timeMs = 0, source = 'ambient' } = {}) {
    if (!this.ctx) return null;
    const { width: W, height: H } = this.resize();
    const beat = this.beat.update(features.rmsAmplitude, timeMs);
    const params = neonParameters(features, beat.pulse, timeMs);
    const ctx = this.ctx;
    const cx = W * 0.5;
    const cy = H * 0.5;

    ctx.globalCompositeOperation = 'source-over';
    const background = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(W, H) * 0.72);
    background.addColorStop(0, `hsl(${params.hue} 42% ${5 + params.energy * 4}%)`);
    background.addColorStop(0.48, 'rgb(3,5,13)');
    background.addColorStop(1, 'rgb(0,1,5)');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = 'lighter';
    drawOrbitalRings(ctx, W, H, params, timeMs);
    drawNeonWave(ctx, W, H, samples, params, timeMs);
    drawLightField(ctx, W, H, params, timeMs);

    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
    return { ...params, onset: beat.onset, source };
  }
}

export function drawSongEmission(ctx, W, H, {
  features = {},
  samples = null,
  timeMs = 0,
  pulse = 0,
} = {}) {
  const params = neonParameters(features, pulse, timeMs);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const cx = W * 0.5;
  const cy = H * 0.48;
  const wash = ctx.createRadialGradient(cx, cy, 20, cx, cy, Math.max(W, H) * 0.62);
  wash.addColorStop(0, `hsla(${params.hue} 90% 58% / ${0.08 + params.energy * 0.18 + params.pulse * 0.1})`);
  wash.addColorStop(0.45, `hsla(${params.accentHue} 90% 52% / ${0.05 + params.energy * 0.1})`);
  wash.addColorStop(1, 'hsla(210 40% 10% / 0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);
  drawOrbitalRings(ctx, W, H, params, timeMs);
  drawNeonWave(ctx, W, H, samples, params, timeMs);
  drawLightField(ctx, W, H, params, timeMs);
  ctx.restore();
  ctx.shadowBlur = 0;
  return params;
}

function drawOrbitalRings(ctx, W, H, params, timeMs) {
  const cx = W / 2;
  const cy = H / 2;
  const base = Math.min(W, H) * (0.12 + params.energy * 0.05 + params.pulse * 0.025);
  for (let i = 0; i < 7; i++) {
    const phase = timeMs * (0.00016 + i * 0.000018);
    const radius = base * (1 + i * 0.48) + Math.sin(phase * TAU + i) * base * 0.12;
    ctx.strokeStyle = `hsla(${(params.hue + i * 24) % 360} 100% 64% / ${0.12 + params.energy * 0.2 + params.pulse * 0.12})`;
    ctx.lineWidth = 1 + params.pulse * 2.4 + (i % 2) * 0.6;
    ctx.shadowColor = `hsl(${(params.hue + i * 24) % 360} 100% 58%)`;
    ctx.shadowBlur = params.glow;
    ctx.beginPath();
    ctx.ellipse(
      cx,
      cy,
      radius * (1.35 + Math.sin(phase + i) * 0.12),
      radius * (0.58 + Math.cos(phase * 0.7 + i) * 0.08),
      phase + i * 0.38,
      0,
      TAU,
    );
    ctx.stroke();
  }
}

function drawNeonWave(ctx, W, H, samples, params, timeMs) {
  const usable = samples?.length ? samples : null;
  const points = Math.min(260, usable?.length || 180);
  const amplitude = H * (0.08 + params.energy * 0.2 + params.pulse * 0.04);
  for (const mirror of [-1, 1]) {
    ctx.strokeStyle = `hsla(${mirror < 0 ? params.hue : params.accentHue} 100% 68% / 0.72)`;
    ctx.lineWidth = 1.4 + params.energy * 2.4;
    ctx.shadowColor = `hsl(${mirror < 0 ? params.hue : params.accentHue} 100% 60%)`;
    ctx.shadowBlur = params.glow * 0.82;
    ctx.beginPath();
    for (let i = 0; i < points; i++) {
      const t = i / Math.max(1, points - 1);
      const sampleIndex = usable ? Math.floor(t * (usable.length - 1)) : 0;
      const wave = usable
        ? usable[sampleIndex]
        : Math.sin(t * TAU * (3 + params.periodicity * 5) + timeMs * 0.004);
      const x = t * W;
      const y = H / 2 + mirror * (
        wave * amplitude
        + Math.sin(t * TAU * 2 + timeMs * 0.0018) * H * 0.035
      );
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function drawLightField(ctx, W, H, params, timeMs) {
  const count = 42;
  for (let i = 0; i < count; i++) {
    const seed = (i * 0.61803398875) % 1;
    const angle = seed * TAU + timeMs * (0.00008 + (i % 5) * 0.000015);
    const orbit = Math.min(W, H) * (0.16 + ((i * 17) % 23) / 34);
    const x = W / 2 + Math.cos(angle * (1 + (i % 3) * 0.13)) * orbit * (W / H);
    const y = H / 2 + Math.sin(angle) * orbit;
    const radius = 1.2 + (i % 4) * 0.65 + params.pulse * 2.8;
    ctx.fillStyle = `hsla(${(params.hue + i * 11) % 360} 100% 70% / ${0.24 + params.energy * 0.52})`;
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = params.glow * 0.65;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();
  }
}
