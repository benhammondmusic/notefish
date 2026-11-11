/**
 * Key-press onset detector, fed one block (typically 128 samples) at a time.
 *
 * An onset is a sudden jump in RMS energy that is also well above the room's
 * noise floor. A piano hammer strike rises within a few milliseconds, so we
 * compare the current block against the level ~20 ms earlier; a slowly
 * decaying note never jumps, so it can't re-trigger.
 */

export interface OnsetOptions {
  /** Current RMS must exceed the noise floor by this factor (4 ≈ +12 dB). */
  floorRatio: number;
  /** Current RMS must exceed the RMS from `lookbackMs` ago by this factor. */
  jumpRatio: number;
  lookbackMs: number;
  /** Absolute minimum RMS for an onset, so a silent room can't trigger on tiny clicks. */
  minRms: number;
  /** After an onset, ignore new ones for this long. */
  refractoryMs: number;
}

export const DEFAULT_ONSET_OPTIONS: OnsetOptions = {
  floorRatio: 4,
  jumpRatio: 2,
  lookbackMs: 20,
  minRms: 0.004,
  refractoryMs: 300,
};

export function rms(block: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < block.length; i++) sum += block[i] * block[i];
  return Math.sqrt(sum / Math.max(1, block.length));
}

export class OnsetDetector {
  readonly opts: OnsetOptions;
  /** Estimated background level (RMS). */
  floor = 0.001;
  private history: number[] = [];
  private historyLen = 1;
  private samplesSinceOnset = Infinity;
  /** While frozen, no onsets fire and the noise floor doesn't adapt (app is making sound). */
  frozen = false;

  constructor(
    private sampleRate: number,
    options: Partial<OnsetOptions> = {},
  ) {
    this.opts = { ...DEFAULT_ONSET_OPTIONS, ...options };
  }

  /** Process one block; returns its RMS and whether it starts a new note. */
  process(block: ArrayLike<number>): { rms: number; onset: boolean } {
    const level = rms(block);
    // Keep about `lookbackMs` worth of per-block levels.
    this.historyLen = Math.max(1, Math.round((this.opts.lookbackMs / 1000) * this.sampleRate / block.length));
    this.history.push(level);
    if (this.history.length > this.historyLen + 1) this.history.shift();
    this.samplesSinceOnset += block.length;

    if (this.frozen) return { rms: level, onset: false };

    const past = this.history[0];
    const refractory = (this.opts.refractoryMs / 1000) * this.sampleRate;
    const onset =
      this.samplesSinceOnset >= refractory &&
      level > this.opts.minRms &&
      level > this.floor * this.opts.floorRatio &&
      level > past * this.opts.jumpRatio;

    if (onset) {
      this.samplesSinceOnset = 0;
    } else if (this.samplesSinceOnset > refractory * 2) {
      // Adapt the floor only between notes: drop quickly when it gets quieter,
      // rise slowly so a ringing note doesn't become "background".
      const rate = level < this.floor ? 0.05 : 0.002;
      this.floor += (level - this.floor) * rate;
      this.floor = Math.max(this.floor, 1e-5);
    }
    return { rms: level, onset };
  }

  /** Forget recent history (e.g. after unmuting) so app sounds can't look like a jump. */
  resetHistory(): void {
    this.history = [];
    this.samplesSinceOnset = 0;
  }
}
