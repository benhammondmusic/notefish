import { describe, expect, it } from 'vitest';
import { newRound, roundReducer, type RoundAction, type RoundState } from './round';
import { LEVELS, pickRound, starsFor } from '../music/levels';
import { judge } from '../music/scoring';
import { midiToHz } from '../music/notes';

const level = LEVELS[0];
const play = (s: RoundState, midi: number): RoundState =>
  roundReducer(s, { type: 'heard', verdict: judge(midiToHz(midi), s.prompts[s.index].midi, 440) });
const act = (s: RoundState, a: RoundAction) => roundReducer(s, a);

describe('round', () => {
  const prompts = [{ midi: 60, clef: 'treble' as const }, { midi: 62, clef: 'treble' as const }];

  it('scores first-try correct and locks until advance', () => {
    let s = play(newRound(level, prompts), 60);
    expect(s.feedback.kind).toBe('correct');
    expect(s.firstTry).toBe(1);
    expect(play(s, 64)).toBe(s); // locked
    s = act(s, { type: 'advance' });
    expect(s.index).toBe(1);
    expect(s.locked).toBe(false);
  });

  it('octave slip is a retry, not a miss', () => {
    let s = play(newRound(level, prompts), 72);
    expect(s.feedback).toEqual({ kind: 'octave', direction: 'lower' });
    expect(s.misses).toBe(0);
    s = play(s, 60);
    expect(s.feedback.kind).toBe('correct');
    expect(s.firstTry).toBe(0);
  });

  it('reveals the answer after three wrong notes', () => {
    let s = newRound(level, prompts);
    s = play(s, 62);
    s = play(s, 64);
    expect(s.revealed).toBe(false);
    s = play(s, 65);
    expect(s.revealed).toBe(true);
    expect(s.feedback.kind).toBe('reveal');
  });

  it('unclear does not count as an attempt', () => {
    const s = act(newRound(level, prompts), { type: 'unclear' });
    expect(s.attempts).toBe(0);
    expect(play(s, 60).firstTry).toBe(1);
  });

  it('finishes after the last note', () => {
    let s = newRound(level, prompts);
    s = act(play(s, 60), { type: 'advance' });
    s = act(play(s, 62), { type: 'advance' });
    expect(s.done).toBe(true);
    expect(s.firstTry).toBe(2);
  });
});

describe('levels', () => {
  it('never repeats a note back to back', () => {
    for (const l of LEVELS) {
      const r = pickRound(l, 200);
      for (let i = 1; i < r.length; i++) expect(r[i].midi).not.toBe(r[i - 1].midi);
      for (const p of r) expect(l.notes).toContain(p.midi);
    }
  });

  it('uses only naturals from C3 to C5', () => {
    for (const l of LEVELS) for (const m of l.notes) expect(m >= 48 && m <= 72).toBe(true);
  });

  it('awards stars', () => {
    expect([10, 9, 6, 3, 2].map((n) => starsFor(n))).toEqual([3, 3, 2, 1, 0]);
  });
});
