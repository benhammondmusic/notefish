// Live audio telemetry for real-device testing. Shown with ?debug=1 or by
// tapping the home-screen title five times.

import { useEffect, useState } from 'react';
import { engine } from '../audio/engine';
import type { AnalyzerEvent } from '../audio/analyzer';
import { centsBetween, hzToMidi, midiName, midiToHz } from '../music/notes';

interface Props {
  a4Hz: number;
  onClose: () => void;
}

const db = (x: number) => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : '-∞');
/** Meter position: -50 dBFS → 0%, 0 dBFS → 100%. */
const meter = (x: number) => (x > 0 ? Math.min(100, Math.max(0, 100 + 40 * Math.log10(x))) : 0);

function describe(hz: number, a4Hz: number) {
  const midi = Math.round(hzToMidi(hz, a4Hz));
  const cents = centsBetween(hz, midiToHz(midi, a4Hz));
  return `${hz.toFixed(1)} Hz  ${midiName(midi)}  ${cents >= 0 ? '+' : ''}${cents.toFixed(0)}¢`;
}

export function DebugOverlay({ a4Hz, onClose }: Props) {
  const [level, setLevel] = useState({ rms: 0, floor: 0 });
  const [live, setLive] = useState<{ hz: number; clarity: number } | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [status, setStatus] = useState(engine.status);

  useEffect(() => {
    engine.setLive(100);
    const t0 = performance.now();
    const stamp = () => ((performance.now() - t0) / 1000).toFixed(2).padStart(6);
    const push = (line: string) => setLog((l) => [`${stamp()} ${line}`, ...l].slice(0, 12));
    const off = engine.subscribe((e: AnalyzerEvent) => {
      if (e.type === 'level') setLevel(e);
      else if (e.type === 'live' || e.type === 'frame') setLive(e);
      if (e.type === 'onset') push('onset');
      else if (e.type === 'note') push(`note ${describe(e.hz, a4Hz)} clarity ${e.clarity.toFixed(2)} (${e.frames}f)`);
      else if (e.type === 'unclear') push(`unclear best clarity ${e.clarity.toFixed(2)} (${e.frames}f)`);
    });
    const offStatus = engine.onStatus(setStatus);
    return () => {
      engine.setLive(0);
      off();
      offStatus();
    };
  }, [a4Hz]);

  const s = engine.trackSettings;
  return (
    <div className="debug" onClick={(e) => e.stopPropagation()}>
      <button className="debug-close" onClick={onClose} aria-label="Close debug">
        ×
      </button>
      <div>
        status {status} · ctx {engine.ctx?.sampleRate ?? '-'} Hz · {engine.ctx?.state ?? '-'} · A4 {a4Hz.toFixed(1)}
      </div>
      <div>
        track: EC {String(s?.echoCancellation)} NS {String(s?.noiseSuppression)} AGC {String(s?.autoGainControl)} ·{' '}
        {s?.sampleRate ?? '?'} Hz · ch {s?.channelCount ?? '?'}
      </div>
      <div>
        RMS {db(level.rms)} dB · floor {db(level.floor)} dB · muted {String(engine.muted)}
      </div>
      <div className="debug-meter">
        <span style={{ width: `${meter(level.rms)}%` }} />
        <i style={{ left: `${meter(level.floor)}%` }} />
      </div>
      <div className="debug-live">
        {live ? `${describe(live.hz, a4Hz)}  clarity ${live.clarity.toFixed(2)}` : 'no pitch'}
      </div>
      <pre>{log.join('\n')}</pre>
    </div>
  );
}
