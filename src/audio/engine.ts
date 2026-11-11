/**
 * Owns the AudioContext, the microphone stream and the pitch worklet.
 *
 * iOS rules this works around:
 *   - An AudioContext only starts inside a user gesture, so `start()` must be
 *     called directly from a tap handler (it creates/resumes the context
 *     before its first `await`).
 *   - When the tab is hidden we release the mic (the orange dot goes away) and
 *     suspend the context. Coming back needs another tap, so we report
 *     'paused' and the UI shows a "tap to keep playing" screen.
 */

import workletUrl from './pitch-worklet.ts?worker&url';
import type { AnalyzerEvent } from './analyzer';
import { playSfx, type SfxName } from './sfx';

export type EngineStatus = 'off' | 'starting' | 'listening' | 'paused';

export type StartResult =
  | { ok: true }
  | { ok: false; reason: 'denied' | 'no-mic' | 'suspended' | 'unsupported' | 'error'; detail?: string };

type Listener = (event: AnalyzerEvent) => void;

class AudioEngine {
  ctx: AudioContext | null = null;
  status: EngineStatus = 'off';
  /** What the browser actually applied to the mic track (iOS may ignore some constraints). */
  trackSettings: MediaTrackSettings | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private workletLoaded: Promise<void> | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<(s: EngineStatus) => void>();
  private muteDepth = 0;
  private liveEveryMs = 0;

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.status === 'listening') this.pause();
      });
    }
  }

  /** Call from a tap/click handler. Safe to call again to resume after pause. */
  async start(): Promise<StartResult> {
    if (this.status === 'listening') return { ok: true };
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined') {
      return { ok: false, reason: 'unsupported' };
    }
    this.setStatus('starting');

    // Tell iOS we both play and record, so app sounds aren't silenced (Safari 16.4+).
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) {
      try {
        session.type = 'play-and-record';
      } catch {
        /* older Safari */
      }
    }

    // Synchronously inside the gesture: create and resume the context.
    this.ctx ??= new AudioContext();
    const ctx = this.ctx;
    const resumed = ctx.resume().catch(() => undefined);
    this.workletLoaded ??= ctx.audioWorklet.addModule(workletUrl);

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Processing meant for voice calls mangles piano tone and onsets.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      });
    } catch (err) {
      this.setStatus('off');
      const name = (err as DOMException)?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') return { ok: false, reason: 'denied' };
      if (name === 'NotFoundError' || name === 'OverconstrainedError') return { ok: false, reason: 'no-mic' };
      return { ok: false, reason: 'error', detail: String(err) };
    }

    const track = this.stream.getAudioTracks()[0];
    this.trackSettings = track?.getSettings?.() ?? null;
    console.info('[notefish] mic track settings', this.trackSettings, 'context sampleRate', ctx.sampleRate);

    try {
      await resumed;
      await this.workletLoaded;
    } catch (err) {
      this.workletLoaded = null; // let the next tap retry loading it
      this.releaseMic();
      this.setStatus('off');
      return { ok: false, reason: 'error', detail: String(err) };
    }
    if (ctx.state !== 'running') {
      this.releaseMic();
      this.setStatus('paused');
      return { ok: false, reason: 'suspended' };
    }

    if (!this.node) {
      this.node = new AudioWorkletNode(ctx, 'pitch-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      this.node.port.onmessage = (e: MessageEvent<AnalyzerEvent>) => this.dispatch(e.data);
      // Safari only pulls audio through nodes that reach the destination; keep it silent.
      const sink = ctx.createGain();
      sink.gain.value = 0;
      this.node.connect(sink).connect(ctx.destination);
      this.node.port.postMessage({ type: 'live', everyMs: this.liveEveryMs });
    }
    this.source = ctx.createMediaStreamSource(this.stream);
    this.source.connect(this.node);
    this.setStatus('listening');
    return { ok: true };
  }

  /** Release the mic and suspend audio (tab hidden). */
  pause(): void {
    this.releaseMic();
    void this.ctx?.suspend().catch(() => undefined);
    this.setStatus('paused');
  }

  private releaseMic(): void {
    this.source?.disconnect();
    this.source = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  get muted(): boolean {
    return this.muteDepth > 0;
  }

  /**
   * Play a feedback sound with the mic muted for its whole duration plus a
   * short tail for room reverb. Resolves when listening resumes.
   */
  async play(name: SfxName): Promise<void> {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.muteDepth++;
    this.node?.port.postMessage({ type: 'mute', value: true });
    const seconds = playSfx(this.ctx, name);
    await new Promise((r) => setTimeout(r, seconds * 1000 + 250));
    this.muteDepth--;
    if (this.muteDepth === 0) this.node?.port.postMessage({ type: 'mute', value: false });
  }

  /** Debug: stream live pitch estimates between notes. */
  setLive(everyMs: number): void {
    this.liveEveryMs = everyMs;
    this.node?.port.postMessage({ type: 'live', everyMs });
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onStatus(fn: (s: EngineStatus) => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  private dispatch(event: AnalyzerEvent): void {
    // Messages already in flight when a sound started are dropped too.
    if (this.muted && event.type !== 'level') return;
    for (const fn of this.listeners) fn(event);
  }

  private setStatus(s: EngineStatus): void {
    this.status = s;
    for (const fn of this.statusListeners) fn(s);
  }
}

export const engine = new AudioEngine();
