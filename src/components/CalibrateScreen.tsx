// Parent-facing tune-up: measure the piano's A4 and use it as the reference.

import { useEffect, useState } from 'react';
import { engine } from '../audio/engine';
import { calibrateFromA } from '../music/scoring';
import { GrandStaff } from './GrandStaff';
import { Keyboard } from './Keyboard';

const A4 = 69;

type Phase =
  | { kind: 'listening' }
  | { kind: 'unclear' }
  | { kind: 'not-an-a' }
  | { kind: 'done'; a4Hz: number; cents: number };

interface Props {
  onSave: (a4Hz: number) => void;
  onCancel: () => void;
}

function describeCents(cents: number): string {
  const c = Math.round(Math.abs(cents) / 5) * 5;
  if (c < 5) return 'Your piano is right in tune!';
  return `Your piano is about ${c} cents ${cents < 0 ? 'flat' : 'sharp'}; that's fine, we adjusted.`;
}

export function CalibrateScreen({ onSave, onCancel }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'listening' });

  useEffect(() => {
    if (phase.kind === 'done') return;
    return engine.subscribe((e) => {
      if (e.type === 'unclear') setPhase({ kind: 'unclear' });
      else if (e.type === 'note') {
        const r = calibrateFromA(e.hz);
        setPhase(r.ok ? { kind: 'done', a4Hz: r.a4Hz, cents: r.cents } : { kind: 'not-an-a' });
      }
    });
  }, [phase.kind]);

  return (
    <main className="screen calibrate">
      <h2>Tune-up</h2>
      <div className="calibrate-main">
        <div className="staff-wrap small">
          <GrandStaff midi={A4} clef="treble" tone={phase.kind === 'done' ? 'correct' : null} />
        </div>
        <div className="calibrate-text">
          {phase.kind === 'done' ? (
            <p className="kid-text">{describeCents(phase.cents)}</p>
          ) : (
            <>
              <p className="kid-text">Play the A in the middle of the piano.</p>
              <p className="parent-note">
                That's the A just above middle C (marked with a star). notefish measures it so a very
                out-of-tune piano still scores correctly.
              </p>
              {phase.kind === 'unclear' && <p className="hint">I couldn't hear that clearly. Play the A again, firmly.</p>}
              {phase.kind === 'not-an-a' && <p className="hint">That didn't sound like an A. Try the starred key.</p>}
            </>
          )}
        </div>
      </div>
      <Keyboard target={A4} />
      <div className="row">
        {phase.kind === 'done' ? (
          <>
            <button className="big-button secondary wide" onClick={() => setPhase({ kind: 'listening' })}>
              Measure again
            </button>
            <button className="big-button wide" onClick={() => onSave(phase.a4Hz)}>
              Done
            </button>
          </>
        ) : (
          <button className="big-button secondary wide" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </main>
  );
}
