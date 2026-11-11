// Mini piano keyboard, C3 to C5. Shows where the child landed and, after a
// miss, where the target is.

import { naturalsBetween, pitchClass } from '../music/notes';

const LO = 48; // C3
const HI = 72; // C5
const WHITE_W = 40;
const WHITE_H = 150;
const BLACK_W = 24;
const BLACK_H = 92;
const WHITES = naturalsBetween(LO, HI);
const HAS_SHARP = new Set([0, 2, 5, 7, 9]); // C D F G A

interface Props {
  target?: number | null;
  detected?: number | null;
}

export function Keyboard({ target = null, detected = null }: Props) {
  const fill = (m: number) => (m === target ? 'key-target' : m === detected ? 'key-detected' : '');
  return (
    <svg className="keyboard" viewBox={`0 0 ${WHITES.length * WHITE_W} ${WHITE_H + 2}`} role="img" aria-label="Piano keyboard">
      {WHITES.map((m, i) => (
        <g key={m}>
          <rect x={i * WHITE_W + 1} y={1} width={WHITE_W - 2} height={WHITE_H} rx={5} className={`white-key ${fill(m)}`} />
          {pitchClass(m) === 0 && (
            <text x={i * WHITE_W + WHITE_W / 2} y={WHITE_H - 12} className={`key-label ${m === 60 ? 'middle-c' : ''}`}>
              C
            </text>
          )}
          {m === target && (
            <text x={i * WHITE_W + WHITE_W / 2} y={WHITE_H - 40} className="key-star">
              ★
            </text>
          )}
        </g>
      ))}
      {WHITES.map((m, i) =>
        HAS_SHARP.has(pitchClass(m)) && m < HI ? (
          <rect
            key={`b${m}`}
            x={(i + 1) * WHITE_W - BLACK_W / 2}
            y={1}
            width={BLACK_W}
            height={BLACK_H}
            rx={3}
            className={`black-key ${fill(m + 1)}`}
          />
        ) : null,
      )}
    </svg>
  );
}
