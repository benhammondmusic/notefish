// Pure round state machine: one round of ROUND_LENGTH notes.

import { MAX_TRIES, pickRound, type Level, type Prompt } from '../music/levels';
import type { Verdict } from '../music/scoring';

export type Feedback =
  | { kind: 'listening' }
  | { kind: 'correct' }
  | { kind: 'octave'; direction: 'higher' | 'lower' }
  | { kind: 'wrong' }
  | { kind: 'unclear' }
  | { kind: 'reveal' };

export interface RoundState {
  prompts: Prompt[];
  index: number;
  /** Attempts at the current note (any non-correct verdict). */
  attempts: number;
  /** Wrong-note attempts at the current note; octave slips don't count. */
  misses: number;
  /** Notes played right on the very first attempt. */
  firstTry: number;
  feedback: Feedback;
  detectedMidi: number | null;
  /** Show the answer on the keyboard (after MAX_TRIES misses). */
  revealed: boolean;
  /** Ignore input (success animation playing). */
  locked: boolean;
  done: boolean;
}

export type RoundAction =
  | { type: 'heard'; verdict: Verdict }
  | { type: 'unclear' }
  | { type: 'advance' };

export function newRound(level: Level, prompts = pickRound(level)): RoundState {
  return {
    prompts,
    index: 0,
    attempts: 0,
    misses: 0,
    firstTry: 0,
    feedback: { kind: 'listening' },
    detectedMidi: null,
    revealed: false,
    locked: false,
    done: false,
  };
}

export function roundReducer(s: RoundState, a: RoundAction): RoundState {
  if (s.done) return s;
  switch (a.type) {
    case 'heard': {
      if (s.locked) return s;
      const v = a.verdict;
      const base = { ...s, detectedMidi: v.detectedMidi };
      if (v.kind === 'correct') {
        return {
          ...base,
          firstTry: s.firstTry + (s.attempts === 0 ? 1 : 0),
          feedback: { kind: 'correct' },
          locked: true,
        };
      }
      if (v.kind === 'octave') {
        return { ...base, attempts: s.attempts + 1, feedback: { kind: 'octave', direction: v.direction } };
      }
      const misses = s.misses + 1;
      const revealed = s.revealed || misses >= MAX_TRIES;
      return {
        ...base,
        attempts: s.attempts + 1,
        misses,
        revealed,
        feedback: revealed ? { kind: 'reveal' } : { kind: 'wrong' },
      };
    }
    case 'unclear':
      if (s.locked) return s;
      // Doesn't count as an attempt: we just couldn't hear.
      return { ...s, feedback: s.revealed ? { kind: 'reveal' } : { kind: 'unclear' } };
    case 'advance': {
      const index = s.index + 1;
      return {
        ...s,
        index,
        attempts: 0,
        misses: 0,
        feedback: { kind: 'listening' },
        detectedMidi: null,
        revealed: false,
        locked: false,
        done: index >= s.prompts.length,
      };
    }
  }
}
