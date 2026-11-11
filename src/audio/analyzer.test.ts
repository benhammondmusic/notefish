import { describe, expect, it } from 'vitest';
import { Analyzer, type AnalyzerEvent } from './analyzer';
import { midiToHz } from '../music/notes';
import { pianoTone, SR, tone, WEAK_FUNDAMENTAL_PARTIALS } from '../../test/synth';

function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function run(analyzer: Analyzer, signal: Float32Array): AnalyzerEvent[] {
  const events: AnalyzerEvent[] = [];
  for (let i = 0; i + 128 <= signal.length; i += 128) events.push(...analyzer.process(signal.subarray(i, i + 128)));
  return events;
}

const ofType = <T extends AnalyzerEvent['type']>(events: AnalyzerEvent[], type: T) =>
  events.filter((e): e is Extract<AnalyzerEvent, { type: T }> => e.type === type);

describe('Analyzer', () => {
  it('hears one note per key press', () => {
    const events = run(new Analyzer(SR), pianoTone(midiToHz(60), { leadIn: 0.3, seconds: 1.5, noise: 0.0005 }));
    expect(ofType(events, 'onset')).toHaveLength(1);
    const notes = ofType(events, 'note');
    expect(notes).toHaveLength(1);
    expect(notes[0].hz).toBeCloseTo(midiToHz(60), -1);
  });

  it('hears two separate presses', () => {
    const a = pianoTone(midiToHz(60), { leadIn: 0.3, seconds: 0.8 });
    const b = pianoTone(midiToHz(64), { seconds: 0.8, amplitude: 0.4 });
    const notes = ofType(run(new Analyzer(SR), concat(a, b)), 'note');
    expect(notes.map((n) => Math.round(12 * Math.log2(n.hz / 440) + 69))).toEqual([60, 64]);
  });

  it('handles a weak fundamental end to end', () => {
    const signal = pianoTone(midiToHz(48), { leadIn: 0.3, partials: WEAK_FUNDAMENTAL_PARTIALS });
    const [note] = ofType(run(new Analyzer(SR), signal), 'note');
    expect(Math.round(12 * Math.log2(note.hz / 440) + 69)).toBe(48);
  });

  it('reports unclear for a noise burst', () => {
    const burst = tone(1, { partials: [0], noise: 0.3, leadIn: 0, seconds: 0.4 });
    const events = run(new Analyzer(SR), concat(new Float32Array(SR * 0.3), burst));
    expect(ofType(events, 'onset')).toHaveLength(1);
    expect(ofType(events, 'note')).toHaveLength(0);
    expect(ofType(events, 'unclear')).toHaveLength(1);
  });

  it('ignores everything while muted', () => {
    const analyzer = new Analyzer(SR);
    analyzer.setMuted(true);
    const events = run(analyzer, pianoTone(midiToHz(60), { leadIn: 0.3 }));
    expect(ofType(events, 'onset')).toHaveLength(0);
  });

  it('does not trigger on a steady tone', () => {
    const analyzer = new Analyzer(SR);
    const steady = tone(midiToHz(60), { seconds: 2, amplitude: 0.05 });
    // Fade in slowly so there is no "jump".
    for (let i = 0; i < SR; i++) steady[i] *= i / SR;
    expect(ofType(run(analyzer, steady), 'onset')).toHaveLength(0);
  });
});
