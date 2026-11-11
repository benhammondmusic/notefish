import { describe, expect, it } from 'vitest';
import { correctOctaveErrors, DEFAULT_MPM_OPTIONS, detectPitch, median } from './mpm';
import { midiToHz, naturalsBetween, midiName, hzToMidi } from '../music/notes';
import { pianoTone, SR, tone, WEAK_FUNDAMENTAL_PARTIALS } from '../../test/synth';

const FRAME = 4096;
const C3 = 48;
const C5 = 72;
const NOTES = naturalsBetween(C3, C5);

/** A frame starting `offsetMs` into the signal. */
function frameAt(signal: Float32Array, offsetMs = 100, size = FRAME): Float32Array {
  const start = Math.round((offsetMs / 1000) * SR);
  return signal.subarray(start, start + size);
}

function centsError(detected: number, expected: number): number {
  return 1200 * Math.log2(detected / expected);
}

describe('detectPitch', () => {
  it.each(NOTES.map((m) => [midiName(m), m]))('pure tone %s', (_name, midi) => {
    const hz = midiToHz(midi);
    const est = detectPitch(frameAt(tone(hz)), SR)!;
    expect(est.clarity).toBeGreaterThan(0.95);
    expect(Math.abs(centsError(est.hz, hz))).toBeLessThan(5);
  });

  it.each(NOTES.map((m) => [midiName(m), m]))('piano-like tone %s (harmonics, inharmonicity, decay)', (_name, midi) => {
    const hz = midiToHz(midi);
    const est = detectPitch(frameAt(pianoTone(hz)), SR)!;
    expect(est.clarity).toBeGreaterThan(0.8);
    expect(Math.abs(centsError(est.hz, hz))).toBeLessThan(15);
  });

  it.each(NOTES.map((m) => [midiName(m), m]))('weak fundamental %s still reports the fundamental', (_name, midi) => {
    const hz = midiToHz(midi);
    const signal = pianoTone(hz, { partials: WEAK_FUNDAMENTAL_PARTIALS });
    const est = detectPitch(frameAt(signal), SR)!;
    expect(Math.round(hzToMidi(est.hz))).toBe(midi);
  });

  it('works at 44.1 kHz too', () => {
    const hz = midiToHz(60);
    const signal = pianoTone(hz, { sampleRate: 44100 });
    const est = detectPitch(signal.subarray(4410, 4410 + FRAME), 44100)!;
    expect(Math.abs(centsError(est.hz, hz))).toBeLessThan(15);
  });

  it('survives background noise', () => {
    const hz = midiToHz(55);
    const est = detectPitch(frameAt(pianoTone(hz, { noise: 0.01 })), SR)!;
    expect(Math.round(hzToMidi(est.hz))).toBe(55);
  });

  it('gives low clarity (or nothing) for noise', () => {
    const noise = tone(440, { partials: [0], noise: 0.2 });
    const est = detectPitch(frameAt(noise), SR);
    expect(est === null || est.clarity < 0.8).toBe(true);
  });

  it('returns null for silence', () => {
    expect(detectPitch(new Float32Array(FRAME), SR)).toBeNull();
  });
});

describe('octave-error guard', () => {
  it.each(NOTES.map((m) => [midiName(m), m]))('steps %s down from a 2x mistake', (_name, midi) => {
    const hz = midiToHz(midi);
    const frame = frameAt(pianoTone(hz, { partials: WEAK_FUNDAMENTAL_PARTIALS }));
    expect(Math.round(hzToMidi(correctOctaveErrors(frame, hz * 2, SR)))).toBe(midi);
  });

  it.each(NOTES.map((m) => [midiName(m), m]))('steps %s down from a 3x mistake', (_name, midi) => {
    const hz = midiToHz(midi);
    const frame = frameAt(pianoTone(hz));
    expect(Math.round(hzToMidi(correctOctaveErrors(frame, hz * 3, SR)))).toBe(midi);
  });

  it.each(NOTES.map((m) => [midiName(m), m]))('steps %s down from a 1.5x mistake', (_name, midi) => {
    const hz = midiToHz(midi);
    const frame = frameAt(pianoTone(hz));
    expect(Math.round(hzToMidi(correctOctaveErrors(frame, hz * 1.5, SR)))).toBe(midi);
  });

  it.each(NOTES.map((m) => [midiName(m), m]))('leaves a correct %s alone', (_name, midi) => {
    const hz = midiToHz(midi);
    for (const signal of [tone(hz), pianoTone(hz), pianoTone(hz, { partials: WEAK_FUNDAMENTAL_PARTIALS })]) {
      expect(correctOctaveErrors(frameAt(signal), hz, SR)).toBe(hz);
    }
  });

  it('does not step below minHz', () => {
    const hz = midiToHz(C3);
    const frame = frameAt(pianoTone(hz / 2));
    const out = correctOctaveErrors(frame, hz, SR, { ...DEFAULT_MPM_OPTIONS, minHz: hz * 0.9 });
    expect(out).toBe(hz);
  });
});

describe('median', () => {
  it('handles odd and even lengths', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});
