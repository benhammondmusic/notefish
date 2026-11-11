import { describe, expect, it } from 'vitest';
import { calibrateFromA, judge } from './scoring';
import { hzToMidi, midiToHz, midiName, noteToMidi, diatonicStep, naturalsBetween } from './notes';
import { Analyzer } from '../audio/analyzer';
import { centsToRatio, pianoTone, SR } from '../../test/synth';

describe('notes', () => {
  it('maps Hz to MIDI', () => {
    expect(hzToMidi(440)).toBe(69);
    expect(hzToMidi(261.6256)).toBeCloseTo(60, 3);
    expect(hzToMidi(130.8128)).toBeCloseTo(48, 3);
    expect(hzToMidi(432, 432)).toBe(69);
  });

  it('round-trips names', () => {
    for (const m of naturalsBetween(48, 72)) expect(noteToMidi(midiName(m))).toBe(m);
    expect(noteToMidi('C4')).toBe(60);
    expect(midiName(61)).toBe('C♯4');
  });

  it('numbers staff steps so middle C is 28', () => {
    expect(diatonicStep(60)).toBe(28);
    expect(diatonicStep(noteToMidi('E4'))).toBe(30);
    expect(diatonicStep(noteToMidi('B3'))).toBe(27);
  });
});

describe('judge', () => {
  const C4 = 60;
  it('accepts anything within ±50 cents', () => {
    expect(judge(midiToHz(C4) * centsToRatio(49), C4, 440).kind).toBe('correct');
    expect(judge(midiToHz(C4) * centsToRatio(-49), C4, 440).kind).toBe('correct');
    expect(judge(midiToHz(C4) * centsToRatio(51), C4, 440).kind).toBe('wrong');
  });

  it('reports right letter, wrong octave with a direction', () => {
    expect(judge(midiToHz(48), C4, 440)).toMatchObject({ kind: 'octave', direction: 'higher' });
    expect(judge(midiToHz(72), C4, 440)).toMatchObject({ kind: 'octave', direction: 'lower' });
  });

  it('reports wrong notes with what was detected', () => {
    expect(judge(midiToHz(62), C4, 440)).toMatchObject({ kind: 'wrong', detectedMidi: 62 });
  });

  it('keeps cents deviation', () => {
    const v = judge(midiToHz(C4) * centsToRatio(-20), C4, 440);
    expect(v.cents).toBeCloseTo(-20, 5);
  });
});

describe('calibrateFromA', () => {
  it('measures how far off the piano is', () => {
    const r = calibrateFromA(440 * centsToRatio(-30));
    expect(r.ok && r.cents).toBeCloseTo(-30, 5);
  });

  it('accepts the A an octave off', () => {
    const r = calibrateFromA(220 * centsToRatio(-30));
    expect(r.ok && r.a4Hz).toBeCloseTo(440 * centsToRatio(-30), 5);
  });

  it('rejects a note that is not an A', () => {
    expect(calibrateFromA(midiToHz(67)).ok).toBe(false);
    expect(calibrateFromA(110).ok).toBe(false);
  });
});

/** Run a whole signal through the Analyzer in 128-sample blocks, like the worklet does. */
function listen(signal: Float32Array, sampleRate = SR) {
  const analyzer = new Analyzer(sampleRate);
  const events = [];
  for (let i = 0; i + 128 <= signal.length; i += 128) events.push(...analyzer.process(signal.subarray(i, i + 128)));
  return events;
}

describe('detuned pianos, end to end', () => {
  const NOTES = naturalsBetween(48, 72);
  const DETUNE = [-60, -30, 0, 30];

  for (const cents of DETUNE) {
    it(`${cents} cents: calibrated scoring gets every note C3–C5 right`, () => {
      // Calibrate from a detuned A4, as the parent would.
      const aEvents = listen(pianoTone(440 * centsToRatio(cents), { leadIn: 0.2, seconds: 0.6 }));
      const aNote = aEvents.find((e) => e.type === 'note');
      expect(aNote).toBeDefined();
      const cal = calibrateFromA(aNote!.type === 'note' ? aNote!.hz : 0);
      expect(cal.ok).toBe(true);
      const a4 = cal.ok ? cal.a4Hz : 440;
      // Stretched partials read a few cents sharp, as on a real piano; calibration absorbs that.
      expect(Math.abs((cal.ok ? cal.cents : NaN) - cents)).toBeLessThan(10);

      for (const midi of NOTES) {
        const signal = pianoTone(midiToHz(midi) * centsToRatio(cents), { leadIn: 0.2, seconds: 0.6, seed: midi });
        const note = listen(signal).find((e) => e.type === 'note');
        expect(note, `${midiName(midi)} should be heard`).toBeDefined();
        if (note?.type === 'note') expect(judge(note.hz, midi, a4).kind, midiName(midi)).toBe('correct');
      }
    });

    it(`${cents} cents: uncalibrated scoring`, () => {
      for (const midi of NOTES) {
        const signal = pianoTone(midiToHz(midi) * centsToRatio(cents), { leadIn: 0.2, seconds: 0.6, seed: midi });
        const note = listen(signal).find((e) => e.type === 'note');
        if (note?.type !== 'note') throw new Error(`${midiName(midi)} not heard`);
        // Within ±50 cents still passes without calibration; -60 rounds down a semitone.
        const expected = Math.abs(cents) < 50 ? 'correct' : 'wrong';
        expect(judge(note.hz, midi, 440).kind, midiName(midi)).toBe(expected);
      }
    });
  }
});
