// Hand-rolled SVG grand staff showing a single whole note.
//
// Vertical positions are in "steps" (one line or space each, see
// diatonicStep): treble lines are E4 G4 B4 D5 F5 (steps 30..38), bass lines
// G2 B2 D3 F3 A3 (steps 18..26). Middle C (28) sits on a ledger line below the
// treble staff or above the bass staff.

import { diatonicStep } from '../music/notes';
import type { Clef } from '../music/levels';

const HALF = 10; // half a staff space, in SVG units
const TREBLE_TOP = 40; // y of the F5 line
const BASS_TOP = 220; // y of the A3 line
const LEFT = 16;
const RIGHT = 250;
const NOTE_X = 175;

const TREBLE = { top: TREBLE_TOP, topStep: 38, bottomStep: 30 };
const BASS = { top: BASS_TOP, topStep: 26, bottomStep: 18 };

function yFor(step: number, clef: Clef): number {
  const s = clef === 'treble' ? TREBLE : BASS;
  return s.top + (s.topStep - step) * HALF;
}

/** Steps that need a ledger line for a note at `step` in `clef`. */
export function ledgerSteps(step: number, clef: Clef): number[] {
  const s = clef === 'treble' ? TREBLE : BASS;
  const out: number[] = [];
  for (let l = s.bottomStep - 2; l >= step; l -= 2) out.push(l);
  for (let l = s.topStep + 2; l <= step; l += 2) out.push(l);
  return out;
}

function StaffLines({ top }: { top: number }) {
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={i} x1={LEFT} x2={RIGHT} y1={top + i * 2 * HALF} y2={top + i * 2 * HALF} className="staff-line" />
      ))}
    </>
  );
}

interface Props {
  midi: number;
  clef: Clef;
  /** Colors the note after feedback. */
  tone?: 'correct' | 'wrong' | null;
}

export function GrandStaff({ midi, clef, tone = null }: Props) {
  const step = diatonicStep(midi);
  const y = yFor(step, clef);
  const bottom = BASS_TOP + 8 * HALF;
  return (
    <svg className="grand-staff" viewBox="0 0 266 340" role="img" aria-label="Music staff with one note">
      <StaffLines top={TREBLE_TOP} />
      <StaffLines top={BASS_TOP} />
      {/* System line and brace joining the two staves */}
      <line x1={LEFT} x2={LEFT} y1={TREBLE_TOP} y2={bottom} className="staff-line" />
      <line x1={RIGHT} x2={RIGHT} y1={TREBLE_TOP} y2={TREBLE_TOP + 8 * HALF} className="staff-line" />
      <line x1={RIGHT} x2={RIGHT} y1={BASS_TOP} y2={bottom} className="staff-line" />
      <path
        className="brace"
        d={`M ${LEFT - 4} ${TREBLE_TOP} C ${LEFT - 14} ${TREBLE_TOP + 40}, ${LEFT - 2} ${(TREBLE_TOP + bottom) / 2 - 30}, ${LEFT - 12} ${(TREBLE_TOP + bottom) / 2}
           C ${LEFT - 2} ${(TREBLE_TOP + bottom) / 2 + 30}, ${LEFT - 14} ${bottom - 40}, ${LEFT - 4} ${bottom}`}
      />
      {/* Clefs: Unicode music symbols (U+1D11E, U+1D122), positioned by their curl/dots. */}
      <text x={LEFT + 4} y={yFor(32, 'treble') + 17} className="clef treble-clef">
        𝄞
      </text>
      <text x={LEFT + 6} y={yFor(24, 'bass') + 21} className="clef bass-clef">
        𝄢
      </text>
      {ledgerSteps(step, clef).map((l) => (
        <line key={l} x1={NOTE_X - 22} x2={NOTE_X + 22} y1={yFor(l, clef)} y2={yFor(l, clef)} className="ledger" />
      ))}
      <g transform={`translate(${NOTE_X} ${y})`} className={`note ${tone ?? ''}`} key={`${midi}-${clef}`}>
        <ellipse rx={13.5} ry={9.5} className="note-head" />
        <ellipse rx={7} ry={4.4} transform="rotate(-40)" className="note-hole" />
      </g>
    </svg>
  );
}
