// Feedback sounds, synthesized with oscillators so there are no audio files to
// load. Each function schedules its notes and returns the total duration in
// seconds so the engine can keep the mic muted until the sound is over.

export type SfxName = 'success' | 'oops' | 'fanfare';

interface Blip {
  hz: number;
  at: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
}

const SOUNDS: Record<SfxName, Blip[]> = {
  // Rising major arpeggio.
  success: [
    { hz: 523.25, at: 0, dur: 0.18 },
    { hz: 659.25, at: 0.1, dur: 0.18 },
    { hz: 783.99, at: 0.2, dur: 0.18 },
    { hz: 1046.5, at: 0.3, dur: 0.4 },
  ],
  // Soft two-note "hmm", deliberately not harsh.
  oops: [
    { hz: 392, at: 0, dur: 0.16, type: 'sine', gain: 0.12 },
    { hz: 349.23, at: 0.15, dur: 0.25, type: 'sine', gain: 0.12 },
  ],
  fanfare: [
    { hz: 523.25, at: 0, dur: 0.15 },
    { hz: 523.25, at: 0.15, dur: 0.15 },
    { hz: 523.25, at: 0.3, dur: 0.15 },
    { hz: 659.25, at: 0.45, dur: 0.3 },
    { hz: 783.99, at: 0.75, dur: 0.15 },
    { hz: 1046.5, at: 0.9, dur: 0.6 },
  ],
};

export function playSfx(ctx: AudioContext, name: SfxName): number {
  const t0 = ctx.currentTime + 0.02;
  let end = 0;
  for (const b of SOUNDS[name]) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = b.type ?? 'triangle';
    osc.frequency.value = b.hz;
    const peak = b.gain ?? 0.2;
    const start = t0 + b.at;
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(peak, start + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, start + b.dur);
    osc.connect(env).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + b.dur + 0.02);
    end = Math.max(end, b.at + b.dur);
  }
  return end + 0.02;
}
