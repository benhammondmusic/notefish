// Synthesized test signals: pure tones and piano-like tones.

export const SR = 48000;

export interface ToneOptions {
  sampleRate?: number;
  seconds?: number;
  /** Partial amplitudes, index 0 = fundamental. Default: a single sine. */
  partials?: number[];
  /** Piano string inharmonicity B: partial n sits at n·f·√(1 + B·n²). */
  inharmonicity?: number;
  /** Exponential decay time constant in seconds (Infinity = steady). */
  decay?: number;
  /** Silence before the tone starts, in seconds. */
  leadIn?: number;
  /** White-noise amplitude added everywhere. */
  noise?: number;
  amplitude?: number;
  /** Deterministic seed for noise and partial phases. */
  seed?: number;
}

/** Small deterministic PRNG so tests are repeatable. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function tone(hz: number, o: ToneOptions = {}): Float32Array {
  const sr = o.sampleRate ?? SR;
  const seconds = o.seconds ?? 0.5;
  const partials = o.partials ?? [1];
  const B = o.inharmonicity ?? 0;
  const decay = o.decay ?? Infinity;
  const leadIn = Math.round((o.leadIn ?? 0) * sr);
  const amp = o.amplitude ?? 0.3;
  const rand = mulberry32(o.seed ?? 1);
  const phases = partials.map(() => rand() * 2 * Math.PI);
  const freqs = partials.map((_, i) => (i + 1) * hz * Math.sqrt(1 + B * (i + 1) ** 2));
  const norm = partials.reduce((s, a) => s + Math.abs(a), 0) || 1;

  const out = new Float32Array(leadIn + Math.round(seconds * sr));
  for (let i = 0; i < out.length; i++) {
    let v = 0;
    if (i >= leadIn) {
      const t = (i - leadIn) / sr;
      for (let p = 0; p < partials.length; p++) {
        // Higher partials of a real string decay faster.
        const env = decay === Infinity ? 1 : Math.exp(-t * (1 + p * 0.3) / decay);
        v += partials[p] * env * Math.sin(2 * Math.PI * freqs[p] * t + phases[p]);
      }
      v = (v / norm) * amp;
    }
    if (o.noise) v += (rand() * 2 - 1) * o.noise;
    out[i] = v;
  }
  return out;
}

/** Rough piano spectrum: strong 2nd/3rd partials, fundamental a bit weaker. */
export const PIANO_PARTIALS = [0.6, 1, 0.7, 0.45, 0.3, 0.2, 0.15, 0.1];
/** Weak fundamental, as on small pianos in the low register. */
export const WEAK_FUNDAMENTAL_PARTIALS = [0.08, 1, 0.8, 0.5, 0.35, 0.2, 0.12, 0.08];

export function pianoTone(hz: number, o: ToneOptions = {}): Float32Array {
  return tone(hz, { partials: PIANO_PARTIALS, inharmonicity: 0.0004, decay: 1.2, ...o });
}

export function centsToRatio(cents: number): number {
  return 2 ** (cents / 1200);
}
