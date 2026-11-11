// Pitch math and note naming. MIDI numbers are the canonical note identity:
// C4 (middle C) = 60, A4 = 69.

export const DEFAULT_A4_HZ = 440;

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export type Letter = (typeof LETTERS)[number];

// Semitone offset of each natural letter within an octave.
const LETTER_SEMITONES: Record<Letter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const PITCH_CLASS_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/** Fractional MIDI note for a frequency, relative to the given A4 reference. */
export function hzToMidi(hz: number, a4Hz = DEFAULT_A4_HZ): number {
  return 69 + 12 * Math.log2(hz / a4Hz);
}

export function midiToHz(midi: number, a4Hz = DEFAULT_A4_HZ): number {
  return a4Hz * 2 ** ((midi - 69) / 12);
}

/** Cents between two frequencies (positive if `hz` is above `refHz`). */
export function centsBetween(hz: number, refHz: number): number {
  return 1200 * Math.log2(hz / refHz);
}

export function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

export function octaveOf(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

/** "C4", "F♯3", ... */
export function midiName(midi: number): string {
  return `${PITCH_CLASS_NAMES[pitchClass(midi)]}${octaveOf(midi)}`;
}

export function isNatural(midi: number): boolean {
  return !PITCH_CLASS_NAMES[pitchClass(midi)].includes('♯');
}

/** Letter name of a natural note. */
export function letterOf(midi: number): Letter {
  return PITCH_CLASS_NAMES[pitchClass(midi)][0] as Letter;
}

/** Parse "C4", "A3" etc. (naturals only). */
export function noteToMidi(name: string): number {
  const m = /^([A-G])(-?\d)$/.exec(name);
  if (!m) throw new Error(`Bad note name: ${name}`);
  return (Number(m[2]) + 1) * 12 + LETTER_SEMITONES[m[1] as Letter];
}

/**
 * Diatonic step number of a natural note: one step per staff position
 * (line or space). C4 = 28, D4 = 29, ... Used for staff layout.
 */
export function diatonicStep(midi: number): number {
  return octaveOf(midi) * 7 + LETTERS.indexOf(letterOf(midi));
}

/** All natural MIDI notes in [lo, hi] inclusive. */
export function naturalsBetween(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (isNatural(m)) out.push(m);
  return out;
}
