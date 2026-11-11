/**
 * The listening state machine shared by the AudioWorklet and the tests:
 *
 *   idle ──onset──▶ capturing ──(window over)──▶ idle, emits `note` or `unclear`
 *
 * After an onset we analyze several overlapping frames between ~50 ms (past the
 * hammer transient) and ~300 ms (before much decay), keep the frames whose
 * clarity is high enough, and report the median pitch.
 */

import { DEFAULT_MPM_OPTIONS, detectPitch, median, type MpmOptions } from './mpm';
import { OnsetDetector, type OnsetOptions } from './onset';

export type AnalyzerEvent =
  | { type: 'level'; rms: number; floor: number }
  | { type: 'onset'; time: number }
  | { type: 'frame'; hz: number; clarity: number }
  | { type: 'note'; hz: number; clarity: number; frames: number }
  | { type: 'unclear'; clarity: number; frames: number }
  | { type: 'live'; hz: number; clarity: number };

export interface AnalyzerOptions {
  /** Samples per analysis frame. 4096 ≈ 85 ms at 48 kHz: ~11 periods of C3. */
  frameSize: number;
  windowStartMs: number;
  windowEndMs: number;
  /** Spacing between frame start times inside the window. */
  hopMs: number;
  /** Frames below this clarity are ignored. */
  minClarity: number;
  /** How many clear frames we need to trust a result. */
  minFrames: number;
  /** Emit `level` events this often (for the listening indicator / debug). */
  levelEveryMs: number;
  /** Emit `live` pitch this often when debug is on; 0 disables. */
  liveEveryMs: number;
  mpm: Partial<MpmOptions>;
  onset: Partial<OnsetOptions>;
}

export const DEFAULT_ANALYZER_OPTIONS: AnalyzerOptions = {
  frameSize: 4096,
  windowStartMs: 50,
  windowEndMs: 300,
  hopMs: 25,
  minClarity: 0.8,
  minFrames: 3,
  levelEveryMs: 50,
  liveEveryMs: 0,
  mpm: DEFAULT_MPM_OPTIONS,
  onset: {},
};

export class Analyzer {
  readonly opts: AnalyzerOptions;
  readonly onsets: OnsetDetector;
  private ring: Float32Array;
  private ringPos = 0;
  private frame: Float32Array;
  /** Total samples seen. */
  private clock = 0;
  /** Sample clock at which each pending frame is complete (end of frame). */
  private pendingFrameEnds: number[] = [];
  private captureEnd = 0;
  private capturing = false;
  private hz: number[] = [];
  private clarity: number[] = [];
  private bestRejectedClarity = 0;
  private nextLevelAt = 0;
  private nextLiveAt = 0;

  constructor(
    private sampleRate: number,
    options: Partial<AnalyzerOptions> = {},
  ) {
    this.opts = { ...DEFAULT_ANALYZER_OPTIONS, ...options };
    this.ring = new Float32Array(this.opts.frameSize);
    this.frame = new Float32Array(this.opts.frameSize);
    this.onsets = new OnsetDetector(sampleRate, this.opts.onset);
  }

  private ms(ms: number): number {
    return Math.round((ms / 1000) * this.sampleRate);
  }

  /** Mute while the app plays sound. Cancels any capture in progress. */
  setMuted(muted: boolean): void {
    this.onsets.frozen = muted;
    if (muted) this.capturing = false;
    else this.onsets.resetHistory();
  }

  setLive(everyMs: number): void {
    this.opts.liveEveryMs = everyMs;
  }

  process(block: Float32Array): AnalyzerEvent[] {
    const events: AnalyzerEvent[] = [];
    for (let i = 0; i < block.length; i++) {
      this.ring[this.ringPos] = block[i];
      this.ringPos = (this.ringPos + 1) % this.ring.length;
    }
    this.clock += block.length;

    const { rms, onset } = this.onsets.process(block);
    if (this.clock >= this.nextLevelAt) {
      events.push({ type: 'level', rms, floor: this.onsets.floor });
      this.nextLevelAt = this.clock + this.ms(this.opts.levelEveryMs);
    }

    if (onset && !this.capturing) this.startCapture(events);

    if (this.capturing) {
      while (this.pendingFrameEnds.length && this.clock >= this.pendingFrameEnds[0]) {
        this.pendingFrameEnds.shift();
        const est = detectPitch(this.readFrame(), this.sampleRate, this.opts.mpm);
        if (!est) continue;
        events.push({ type: 'frame', hz: est.hz, clarity: est.clarity });
        if (est.clarity >= this.opts.minClarity) {
          this.hz.push(est.hz);
          this.clarity.push(est.clarity);
        } else {
          this.bestRejectedClarity = Math.max(this.bestRejectedClarity, est.clarity);
        }
      }
      if (this.clock >= this.captureEnd) this.finishCapture(events);
    } else if (this.opts.liveEveryMs > 0 && this.clock >= this.nextLiveAt) {
      this.nextLiveAt = this.clock + this.ms(this.opts.liveEveryMs);
      const est = detectPitch(this.readFrame(), this.sampleRate, this.opts.mpm);
      if (est) events.push({ type: 'live', hz: est.hz, clarity: est.clarity });
    }
    return events;
  }

  private startCapture(events: AnalyzerEvent[]): void {
    const start = this.clock;
    events.push({ type: 'onset', time: start / this.sampleRate });
    this.capturing = true;
    this.hz = [];
    this.clarity = [];
    this.bestRejectedClarity = 0;
    const { frameSize, windowStartMs, windowEndMs, hopMs } = this.opts;
    const windowEnd = start + this.ms(windowEndMs);
    this.pendingFrameEnds = [];
    for (let t = start + this.ms(windowStartMs); t + frameSize <= windowEnd; t += this.ms(hopMs)) {
      this.pendingFrameEnds.push(t + frameSize);
    }
    // Short windows (or huge frames): still analyze at least one frame.
    if (this.pendingFrameEnds.length === 0) this.pendingFrameEnds.push(start + this.ms(windowStartMs) + frameSize);
    this.captureEnd = this.pendingFrameEnds[this.pendingFrameEnds.length - 1];
  }

  private finishCapture(events: AnalyzerEvent[]): void {
    this.capturing = false;
    if (this.hz.length >= this.opts.minFrames) {
      events.push({ type: 'note', hz: median(this.hz), clarity: median(this.clarity), frames: this.hz.length });
    } else {
      const best = Math.max(this.bestRejectedClarity, ...this.clarity, 0);
      events.push({ type: 'unclear', clarity: best, frames: this.hz.length });
    }
  }

  /** Copy the most recent `frameSize` samples out of the ring, oldest first. */
  private readFrame(): Float32Array {
    const n = this.ring.length;
    const head = n - this.ringPos;
    this.frame.set(this.ring.subarray(this.ringPos), 0);
    this.frame.set(this.ring.subarray(0, this.ringPos), head);
    return this.frame;
  }
}
