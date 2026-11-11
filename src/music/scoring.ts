import { centsBetween, hzToMidi, midiToHz, pitchClass } from './notes';

export type Verdict =
  | { kind: 'correct'; detectedMidi: number; cents: number }
  | { kind: 'octave'; detectedMidi: number; cents: number; direction: 'higher' | 'lower' }
  | { kind: 'wrong'; detectedMidi: number; cents: number };

/**
 * Judge a detected frequency against a target note.
 *
 * The detected pitch is rounded to the nearest semitone using the (possibly
 * calibrated) A4 reference, so anything within ±50 cents of the target counts.
 * `cents` is the deviation from the detected note's ideal pitch; kept for a
 * possible "a little flat/sharp" hint but not shown to kids.
 */
export function judge(hz: number, targetMidi: number, a4Hz: number): Verdict {
  const detectedMidi = Math.round(hzToMidi(hz, a4Hz));
  const cents = centsBetween(hz, midiToHz(detectedMidi, a4Hz));
  if (detectedMidi === targetMidi) return { kind: 'correct', detectedMidi, cents };
  if (pitchClass(detectedMidi) === pitchClass(targetMidi)) {
    // Played too low means the child needs to go higher.
    const direction = detectedMidi < targetMidi ? 'higher' : 'lower';
    return { kind: 'octave', detectedMidi, cents, direction };
  }
  return { kind: 'wrong', detectedMidi, cents };
}

export type CalibrationResult =
  | { ok: true; a4Hz: number; cents: number }
  | { ok: false; reason: 'not-an-a' };

/** How far a calibration A may be from concert pitch and still be accepted. */
export const MAX_CALIBRATION_CENTS = 100;

/**
 * Turn a measured "middle A" into a reference A4. Accepts A3, A4 or A5 (kids
 * and parents often grab the wrong octave) by folding to the nearest A, then
 * rejects anything more than MAX_CALIBRATION_CENTS from concert pitch, since
 * that is more likely a different key than a badly tuned piano.
 */
export function calibrateFromA(measuredHz: number): CalibrationResult {
  const raw = centsBetween(measuredHz, 440);
  const octaves = Math.round(raw / 1200);
  if (Math.abs(octaves) > 1) return { ok: false, reason: 'not-an-a' };
  const cents = raw - octaves * 1200;
  if (Math.abs(cents) > MAX_CALIBRATION_CENTS) return { ok: false, reason: 'not-an-a' };
  return { ok: true, a4Hz: 440 * 2 ** (cents / 1200), cents };
}
