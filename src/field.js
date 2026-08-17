/**
 * field.js — Two-source interference field (§5a)
 *
 * Computes A_total = Σ A_k · sin(k_k · r_k − ω_k · t) over a coarse 48×60
 * grid, where each source contributes a radial wave from its position.
 * Honest as a *visualization* of constructive/destructive geometry; not
 * a measurement of acoustic pressure in the body.
 *
 * Honesty notes preserved:
 *   - AIN-RS-011: 1/r amplitude falloff omitted (plane-wave-ish). Acceptable
 *     for visualization; flagged in tooltip.
 *   - AIN-RS-013: "external source enters at skull-top" is artistic, not
 *     anatomy. A song reaches the body via air pressure at both ears in
 *     reality. The skull-top position is chosen so the wave-meeting region
 *     lands inside the zone array — purely for legibility.
 *
 * Render policy (per §5a step 4):
 *   - globalCompositeOperation = 'lighter' (additive, never darkens)
 *   - Antinode-line threshold emphasis (|A| > 0.6·maxA cells only)
 *   - Body-mask clipping via a soft body region (head + chest)
 *   - Drawn between aura and zones; vagus + zones land ON TOP of the field
 */

const GRID_W = 48;
const GRID_H = 60;

// Pre-baked sin lookup. K=1 default × 2880 cells × 1 ns avg ≈ 0.15ms/frame.
const SIN_N    = 4096;
const SIN_MASK = SIN_N - 1;
const SIN_LUT  = new Float32Array(SIN_N);
const TWO_PI   = 2 * Math.PI;
for (let i = 0; i < SIN_N; i++) SIN_LUT[i] = Math.sin(i * TWO_PI / SIN_N);
const SIN_SCALE = SIN_N / TWO_PI;
function fastSin(x) {
  return SIN_LUT[((x * SIN_SCALE) | 0) & SIN_MASK];
}

// Visualization-scale wave parameters.
// k is the spatial wavenumber per normalized canvas unit. At 440 Hz this
// gives ~3 visible wavelengths along the canvas diagonal — legible without
// becoming a fine-grain texture.
// ω scales similarly so the field oscillates at ~1 visual cycle per second
// at 440 Hz. These values are NOT acoustic; they're visualization-tuned.
const K_AT_440  = 18.0;
const W_AT_440  = 0.012;       // rad per ms
function waveK(f)  { return K_AT_440 * (f / 440); }
function waveW(f)  { return W_AT_440 * (f / 440); }

// Source positions (normalized canvas coords). Internal at larynx, external
// at top of skull. Both are visualization geometry, not anatomy.
export const INTERNAL_SRC_POS = { nx: 0.50, ny: 0.52 };
export const EXTERNAL_SRC_POS = { nx: 0.50, ny: 0.08 };

const fieldBuf = new Float32Array(GRID_W * GRID_H);

/**
 * Compute the interference field for the current driver set.
 * - internalDrv: the primary (internal-origin) driver, positioned at the larynx.
 *                Pass null/undefined to omit the internal source.
 * - externalDrvs: the array of external-origin drivers (from song peaks),
 *                 all positioned at the skull-top source.
 * - t: visual time (ms).
 */
export function computeField(internalDrv, externalDrvs, t) {
  let maxA = 0;
  const iX = INTERNAL_SRC_POS.nx, iY = INTERNAL_SRC_POS.ny;
  const eX = EXTERNAL_SRC_POS.nx, eY = EXTERNAL_SRC_POS.ny;
  const hasInt = internalDrv && internalDrv.amp > 0.01;
  const exts   = externalDrvs ? externalDrvs.filter(d => d.amp > 0.01) : [];
  if (!hasInt && exts.length === 0) {
    fieldBuf.fill(0);
    return { buf: fieldBuf, w: GRID_W, h: GRID_H, maxA: 0 };
  }

  // Precompute per-source k and ω·t terms.
  const intK = hasInt ? waveK(internalDrv.f) : 0;
  const intP = hasInt ? waveW(internalDrv.f) * t : 0;
  const intA = hasInt ? internalDrv.amp : 0;
  const extPrep = exts.map(d => ({ A: d.amp, k: waveK(d.f), phaseT: waveW(d.f) * t }));

  for (let gy = 0; gy < GRID_H; gy++) {
    const y = gy / (GRID_H - 1);
    for (let gx = 0; gx < GRID_W; gx++) {
      const x = gx / (GRID_W - 1);
      let A = 0;
      if (hasInt) {
        const dx = x - iX, dy = y - iY;
        const r = Math.sqrt(dx * dx + dy * dy);
        A += intA * fastSin(intK * r - intP);
      }
      for (let s = 0; s < extPrep.length; s++) {
        const d  = extPrep[s];
        const dx = x - eX, dy = y - eY;
        const r  = Math.sqrt(dx * dx + dy * dy);
        A += d.A * fastSin(d.k * r - d.phaseT);
      }
      fieldBuf[gy * GRID_W + gx] = A;
      const absA = A < 0 ? -A : A;
      if (absA > maxA) maxA = absA;
    }
  }
  return { buf: fieldBuf, w: GRID_W, h: GRID_H, maxA };
}

/**
 * Bilinear sample of the field at normalized canvas coords (nx, ny).
 * Returns signed amplitude. Zones call this to fold the field's local
 * intensity into their own response — i.e., zones become reporters of
 * the field where their amplitude already wants to fire.
 */
export function sampleField(field, nx, ny) {
  if (!field || field.maxA < 0.001) return 0;
  const fx = Math.max(0, Math.min(GRID_W - 1.001, nx * (GRID_W - 1)));
  const fy = Math.max(0, Math.min(GRID_H - 1.001, ny * (GRID_H - 1)));
  const x0 = fx | 0, y0 = fy | 0;
  const tx = fx - x0, ty = fy - y0;
  const a = field.buf[y0 * GRID_W + x0];
  const b = field.buf[y0 * GRID_W + (x0 + 1)];
  const c = field.buf[(y0 + 1) * GRID_W + x0];
  const d = field.buf[(y0 + 1) * GRID_W + (x0 + 1)];
  const ab = a + (b - a) * tx;
  const cd = c + (d - c) * tx;
  return ab + (cd - ab) * ty;
}

/**
 * Render the field. Threshold-emphasized: only cells whose |A| exceeds
 * 0.6·maxA are filled. Composite is 'lighter' (additive), alpha capped
 * at ~0.22. Body-mask clipping path is built from the silhouette region.
 */
export function drawField(ctx, W, H, field) {
  if (!field || field.maxA < 0.04) return;
  const cellW = W / GRID_W;
  const cellH = H / GRID_H;
  const threshold = 0.55 * field.maxA;

  ctx.save();
  // Body-region clip — head ellipse matches anatomy.js skull stroke exactly
  // (rx W*0.085, ry H*0.115); chest ellipse tightened to the bezier boundary
  // (widest ~0.14W each side of centre, half-height ~0.21H, centred ~y 0.71).
  // Previous oversized values (W*0.10/H*0.15 head, W*0.17/H*0.27 chest) let
  // the field bleed ~18-30% outside the visible silhouette.
  ctx.beginPath();
  ctx.ellipse(W * 0.50, H * 0.205, W * 0.085, H * 0.115, 0, 0, TWO_PI);
  ctx.ellipse(W * 0.50, H * 0.710, W * 0.140, H * 0.210, 0, 0, TWO_PI);
  ctx.clip();

  ctx.globalCompositeOperation = 'lighter';
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const A    = field.buf[gy * GRID_W + gx];
      const absA = A < 0 ? -A : A;
      if (absA < threshold) continue;
      const alpha = Math.min(0.22, (absA / field.maxA) * 0.22);
      // Bipolar tint: cyan-blue for compression (A>0), warm peach for rarefaction.
      ctx.fillStyle = A > 0
        ? `rgba(140, 200, 255, ${alpha})`
        : `rgba(255, 180, 140, ${alpha})`;
      ctx.fillRect(gx * cellW - 0.5, gy * cellH - 0.5, cellW + 1, cellH + 1);
    }
  }
  ctx.restore();
}

export const FIELD_GRID = { w: GRID_W, h: GRID_H };
