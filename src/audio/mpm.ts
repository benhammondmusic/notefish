/**
 * McLeod Pitch Method (MPM) pitch detector.
 *
 * Reference: P. McLeod & G. Wyvill, "A Smarter Way to Find Pitch" (ICMC 2005).
 *
 * Steps:
 *   1. Normalized square difference function (NSDF), n(τ) = 2·r(τ) / m(τ), where
 *      r is the autocorrelation and m the summed energy of the overlapping parts.
 *      n is in [-1, 1]; 1 means "the signal repeats perfectly every τ samples".
 *      r is computed with an FFT so a 4096-sample frame is cheap enough for the
 *      audio thread.
 *   2. Key maxima: the highest NSDF value in each positive region between zero
 *      crossings (skipping the lobe around τ = 0).
 *   3. Pick the FIRST key maximum ≥ k × (highest key maximum). Choosing the first
 *      (shortest period) avoids the classic error of picking 2× the period.
 *   4. Parabolic interpolation around that peak gives a sub-sample period and the
 *      peak height, which is the "clarity" (confidence) score.
 *   5. Octave-error guard (see `correctOctaveErrors`): pianos can have a weak
 *      fundamental, so MPM may lock onto the 2nd (or 3rd) harmonic. We check for
 *      energy at sub-harmonic frequencies and step down when it is there.
 *
 * Everything here is pure and allocation-light so it can run inside an
 * AudioWorklet and be unit-tested in Node.
 */

export interface PitchEstimate {
  /** Fundamental frequency in Hz. */
  hz: number;
  /** NSDF peak height in [0, 1]. Above ~0.85 is a clean, periodic tone. */
  clarity: number;
}

export interface MpmOptions {
  /** Lowest frequency to search for (sets the longest lag). */
  minHz: number;
  /** Highest frequency to search for (sets the shortest lag). */
  maxHz: number;
  /** MPM "k" constant: how close to the best peak the first peak must be. */
  k: number;
  /** Run the sub-harmonic octave-error guard. */
  octaveGuard: boolean;
  /**
   * Sub-harmonic power (summed over the probe frequencies) relative to the
   * strongest of the detected pitch's first three harmonics, above which we
   * decide the true pitch is lower.
   * Real piano harmonics sit far above this; window leakage sits far below.
   */
  subharmonicRatio: number;
}

export const DEFAULT_MPM_OPTIONS: MpmOptions = {
  minHz: 70,
  maxHz: 1400,
  k: 0.9,
  octaveGuard: true,
  subharmonicRatio: 0.1,
};

/** Reusable scratch buffers, keyed by frame length, so the worklet doesn't allocate per frame. */
class Scratch {
  readonly re: Float64Array;
  readonly im: Float64Array;
  readonly nsdf: Float64Array;
  readonly windowed: Float64Array;
  constructor(readonly frameSize: number) {
    const fftSize = nextPow2(frameSize * 2); // zero-pad to avoid circular wrap-around
    this.re = new Float64Array(fftSize);
    this.im = new Float64Array(fftSize);
    this.nsdf = new Float64Array(frameSize);
    this.windowed = new Float64Array(frameSize);
  }
}
let scratch: Scratch | null = null;
function getScratch(n: number): Scratch {
  if (!scratch || scratch.frameSize !== n) scratch = new Scratch(n);
  return scratch;
}

export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** In-place iterative radix-2 complex FFT. `inverse` computes the unscaled inverse. */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  const sign = inverse ? 1 : -1;
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (sign * 2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cRe = 1;
      let cIm = 0;
      for (let j = 0; j < half; j++) {
        const a = i + j;
        const b = a + half;
        const tRe = re[b] * cRe - im[b] * cIm;
        const tIm = re[b] * cIm + im[b] * cRe;
        re[b] = re[a] - tRe; im[b] = im[a] - tIm;
        re[a] += tRe; im[a] += tIm;
        const nRe = cRe * wRe - cIm * wIm;
        cIm = cRe * wIm + cIm * wRe;
        cRe = nRe;
      }
    }
  }
}

/**
 * Fill `out[0..maxLag]` with the NSDF of `frame`.
 * r(τ) comes from |FFT|² → inverse FFT; m(τ) is updated incrementally.
 */
export function computeNsdf(frame: ArrayLike<number>, maxLag: number, out: Float64Array): void {
  const n = frame.length;
  const { re, im } = getScratch(n);
  re.fill(0);
  im.fill(0);
  for (let i = 0; i < n; i++) re[i] = frame[i];
  fft(re, im);
  for (let i = 0; i < re.length; i++) {
    re[i] = re[i] * re[i] + im[i] * im[i];
    im[i] = 0;
  }
  fft(re, im, true);
  const scale = 1 / re.length; // inverse FFT normalization

  // m(0) = 2·Σx², then drop one sample from each end per lag step.
  let m = 0;
  for (let i = 0; i < n; i++) m += frame[i] * frame[i];
  m *= 2;
  for (let tau = 0; tau <= maxLag; tau++) {
    if (tau > 0) {
      const a = frame[tau - 1];
      const b = frame[n - tau];
      m -= a * a + b * b;
    }
    out[tau] = m > 1e-12 ? (2 * re[tau] * scale) / m : 0;
  }
}

/** Indices of key maxima: the peak of each positive NSDF region after the first negative dip. */
function keyMaxima(nsdf: Float64Array, minLag: number, maxLag: number): number[] {
  const peaks: number[] = [];
  let tau = 1;
  // Skip the positive lobe around τ = 0.
  while (tau <= maxLag && nsdf[tau] > 0) tau++;
  let best = -1;
  for (; tau < maxLag; tau++) {
    const v = nsdf[tau];
    if (v > 0) {
      if (best < 0 || v > nsdf[best]) best = tau;
    } else if (best >= 0) {
      if (best >= minLag) peaks.push(best);
      best = -1;
    }
  }
  // A region still open at maxLag only counts if its peak isn't the boundary.
  if (best >= minLag && best < maxLag - 1) peaks.push(best);
  return peaks;
}

/** Vertex of the parabola through (τ-1, τ, τ+1): returns [interpolated lag, peak value]. */
function parabolicPeak(nsdf: Float64Array, tau: number): [number, number] {
  const a = nsdf[tau - 1];
  const b = nsdf[tau];
  const c = nsdf[tau + 1];
  const denom = a - 2 * b + c;
  if (denom === 0) return [tau, b];
  const delta = (0.5 * (a - c)) / denom;
  return [tau + delta, b - 0.25 * (a - c) * delta];
}

/**
 * Detect the pitch of one frame. Returns null when there is no periodic
 * structure at all (silence, pure noise). Callers should also gate on clarity.
 */
export function detectPitch(
  frame: ArrayLike<number>,
  sampleRate: number,
  options: Partial<MpmOptions> = {},
): PitchEstimate | null {
  const opts = { ...DEFAULT_MPM_OPTIONS, ...options };
  const n = frame.length;
  const minLag = Math.max(2, Math.floor(sampleRate / opts.maxHz));
  const maxLag = Math.min(Math.ceil(sampleRate / opts.minHz), (n >> 1) - 1);
  const { nsdf } = getScratch(n);
  computeNsdf(frame, maxLag + 1, nsdf);

  const peaks = keyMaxima(nsdf, minLag, maxLag);
  if (peaks.length === 0) return null;
  let highest = 0;
  for (const p of peaks) highest = Math.max(highest, nsdf[p]);
  const threshold = opts.k * highest;
  const chosen = peaks.find((p) => nsdf[p] >= threshold)!;
  const [period, clarity] = parabolicPeak(nsdf, chosen);
  let hz = sampleRate / period;
  if (opts.octaveGuard) hz = correctOctaveErrors(frame, hz, sampleRate, opts);
  return { hz, clarity: Math.min(1, clarity) };
}

/**
 * Power of `x` at frequency `hz` via the Goertzel algorithm (any real frequency,
 * not just FFT bins). `x` should already be windowed.
 */
export function goertzelPower(x: ArrayLike<number>, hz: number, sampleRate: number): number {
  const w = (2 * Math.PI * hz) / sampleRate;
  const coeff = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < x.length; i++) {
    const s0 = x[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

/**
 * Octave-error guard. If the detected pitch f is really a harmonic of a lower
 * fundamental f0, the spectrum has energy at frequencies that are NOT harmonics
 * of f:
 *   - f = 2·f0  →  energy at f/2 (= f0) and 3f/2 (= 3·f0)
 *   - f = 1.5·f0 (f is the 3rd harmonic, 2nd was picked as "fundamental"…)
 *     or f = 3·f0 → energy at 2f/3 and 4f/3
 * A true fundamental f has (almost) nothing at those probe frequencies.
 * We repeatedly step down while the evidence is there, so a 3·f0 error goes
 * 3f0 → 2f0 → f0.
 */
export function correctOctaveErrors(
  frame: ArrayLike<number>,
  hz: number,
  sampleRate: number,
  opts: MpmOptions = DEFAULT_MPM_OPTIONS,
): number {
  const n = frame.length;
  const { windowed } = getScratch(n);
  for (let i = 0; i < n; i++) {
    windowed[i] = frame[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))); // Hann
  }
  // Probes closer than this to a real harmonic would just measure leakage.
  const minSeparation = (3 * sampleRate) / n; // ~3 FFT bins (Hann main lobe is ±2)

  for (let iter = 0; iter < 3; iter++) {
    // Reference level: the strongest of f's first three harmonics. (A bogus f,
    // e.g. 1.5·f0, may have no energy of its own, but 2f = 3·f0 will.)
    let pf = 0;
    for (let h = 1; h <= 3 && h * hz < sampleRate / 2; h++) {
      pf = Math.max(pf, goertzelPower(windowed, h * hz, sampleRate));
    }
    if (pf <= 0) break;
    // [lower pitch ratio, probe frequencies as multiples of f, probe distance from f's harmonics]
    const candidates: Array<[ratio: number, probes: number[], gap: number]> = [
      [1 / 2, [1 / 2, 3 / 2], 1 / 2],
      [2 / 3, [2 / 3, 4 / 3], 1 / 3],
    ];
    let stepped = false;
    for (const [ratio, probes, gap] of candidates) {
      const lower = hz * ratio;
      if (lower < opts.minHz) continue;
      if (hz * gap < minSeparation) continue;
      let sub = 0;
      for (const p of probes) sub += goertzelPower(windowed, hz * p, sampleRate);
      if (sub / pf > opts.subharmonicRatio) {
        hz = lower;
        stepped = true;
        break;
      }
    }
    if (!stepped) break;
  }
  return hz;
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
