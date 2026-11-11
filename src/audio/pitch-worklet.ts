// AudioWorkletProcessor: runs the Analyzer on the audio thread and posts
// compact events to the main thread. Main thread → worklet messages:
//   { type: 'mute', value: boolean }   app is playing sound; ignore input
//   { type: 'live', everyMs: number }  debug: stream live pitch (0 = off)

import { Analyzer } from './analyzer';

// Minimal typings for the AudioWorkletGlobalScope (not in TS's DOM lib).
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

class PitchProcessor extends AudioWorkletProcessor {
  private analyzer = new Analyzer(sampleRate);

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === 'mute') this.analyzer.setMuted(msg.value);
      else if (msg.type === 'live') this.analyzer.setLive(msg.everyMs);
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    if (channel) {
      for (const event of this.analyzer.process(channel)) this.port.postMessage(event);
    }
    return true;
  }
}

registerProcessor('pitch-processor', PitchProcessor);
