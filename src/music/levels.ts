import { naturalsBetween, noteToMidi } from './notes';

export type Clef = 'treble' | 'bass';

export interface Level {
  id: number;
  name: string;
  /** Sea creature for the level card; they get bigger as the levels get harder. */
  fish: string;
  notes: number[];
  /** Which clef to draw a given note in. */
  clefFor: (midi: number) => Clef;
}

const C4 = 60;

// Below middle C goes in the bass clef, above in the treble; middle C itself
// alternates so kids learn it from both sides.
const byRange = (midi: number): Clef =>
  midi < C4 ? 'bass' : midi > C4 ? 'treble' : Math.random() < 0.5 ? 'treble' : 'bass';

const range = (lo: string, hi: string) => naturalsBetween(noteToMidi(lo), noteToMidi(hi));

export const LEVELS: Level[] = [
  { id: 1, name: 'Treble C to G', fish: '🐟', notes: range('C4', 'G4'), clefFor: () => 'treble' },
  { id: 2, name: 'Bass F to C', fish: '🐠', notes: range('F3', 'C4'), clefFor: () => 'bass' },
  { id: 3, name: 'Middle C', fish: '🐡', notes: range('A3', 'E4'), clefFor: byRange },
  { id: 4, name: 'Treble C to C', fish: '🦈', notes: range('C4', 'C5'), clefFor: () => 'treble' },
  { id: 5, name: 'Bass C to C', fish: '🐬', notes: range('C3', 'C4'), clefFor: () => 'bass' },
  { id: 6, name: 'Grand staff', fish: '🐋', notes: range('C3', 'C5'), clefFor: byRange },
];

export const ROUND_LENGTH = 10;
export const MAX_TRIES = 3;

export interface Prompt {
  midi: number;
  clef: Clef;
}

/** Pick `count` notes, never the same note twice in a row. */
export function pickRound(level: Level, count = ROUND_LENGTH, rand = Math.random): Prompt[] {
  const out: Prompt[] = [];
  let prev = -1;
  for (let i = 0; i < count; i++) {
    const choices = level.notes.filter((m) => m !== prev);
    const midi = choices[Math.floor(rand() * choices.length)];
    out.push({ midi, clef: level.clefFor(midi) });
    prev = midi;
  }
  return out;
}

/** 0 to 3 stars from the number of notes played right on the first try. */
export function starsFor(firstTryCorrect: number, total = ROUND_LENGTH): number {
  const frac = firstTryCorrect / total;
  if (frac >= 0.9) return 3;
  if (frac >= 0.6) return 2;
  if (frac >= 0.3) return 1;
  return 0;
}
