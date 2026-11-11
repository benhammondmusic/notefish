import { useEffect, useReducer, useRef, useState } from 'react';
import { engine } from '../audio/engine';
import { LEVELS, ROUND_LENGTH } from '../music/levels';
import { judge } from '../music/scoring';
import { newRound, roundReducer, type Feedback } from '../game/round';
import { GrandStaff } from './GrandStaff';
import { Keyboard } from './Keyboard';

interface Props {
  levelId: number;
  a4Hz: number;
  onDone: (firstTry: number) => void;
  onHome: () => void;
}

const SUCCESS_PAUSE_MS = 400;

function FeedbackView({ feedback, hearing }: { feedback: Feedback; hearing: boolean }) {
  switch (feedback.kind) {
    case 'listening':
      return (
        <div className={`feedback listening ${hearing ? 'hearing' : ''}`}>
          <span className="feedback-icon">👂</span>
        </div>
      );
    case 'correct':
      return (
        <div className="feedback correct">
          <span className="feedback-icon jump">🐟</span>
          <span className="feedback-text">Yes!</span>
          <span className="confetti" aria-hidden>
            {['✨', '🎉', '✨', '🎉', '✨'].map((c, i) => (
              <span key={i} style={{ animationDelay: `${i * 0.06}s`, left: `${10 + i * 20}%` }}>
                {c}
              </span>
            ))}
          </span>
        </div>
      );
    case 'octave':
      return (
        <div className="feedback octave">
          <span className="feedback-icon arrow">{feedback.direction === 'higher' ? '➡️' : '⬅️'}</span>
          <span className="feedback-text">
            Right note name! Try the one {feedback.direction}.
          </span>
        </div>
      );
    case 'wrong':
      return (
        <div className="feedback wrong">
          <span className="feedback-icon">🤔</span>
          <span className="feedback-text">Not quite, try again.</span>
        </div>
      );
    case 'unclear':
      return (
        <div className="feedback unclear">
          <span className="feedback-icon">👂</span>
          <span className="feedback-text">I couldn't hear that, try again.</span>
        </div>
      );
    case 'reveal':
      return (
        <div className="feedback reveal">
          <span className="feedback-icon">⭐</span>
          <span className="feedback-text">Here it is! Play the star key.</span>
        </div>
      );
  }
}

export function PlayScreen({ levelId, a4Hz, onDone, onHome }: Props) {
  const level = LEVELS.find((l) => l.id === levelId)!;
  const [round, dispatch] = useReducer(roundReducer, level, (l) => newRound(l));
  const [hearing, setHearing] = useState(false);
  const roundRef = useRef(round);
  roundRef.current = round;

  // Listen for notes from the worklet.
  useEffect(() => {
    return engine.subscribe((e) => {
      const r = roundRef.current;
      if (r.locked || r.done) return;
      if (e.type === 'level') setHearing(e.rms > e.floor * 3 && e.rms > 0.004);
      else if (e.type === 'unclear') dispatch({ type: 'unclear' });
      else if (e.type === 'note') {
        const verdict = judge(e.hz, r.prompts[r.index].midi, a4Hz);
        dispatch({ type: 'heard', verdict });
        if (verdict.kind === 'correct') {
          void engine.play('success').then(() => setTimeout(() => dispatch({ type: 'advance' }), SUCCESS_PAUSE_MS));
        } else if (verdict.kind === 'wrong') {
          void engine.play('oops');
        }
      }
    });
  }, [a4Hz]);

  useEffect(() => {
    if (round.done) onDone(round.firstTry);
  }, [round.done, round.firstTry, onDone]);

  if (round.done) return null;
  const prompt = round.prompts[round.index];
  const tone = round.feedback.kind === 'correct' ? 'correct' : round.feedback.kind === 'wrong' ? 'wrong' : null;

  return (
    <main className="screen play">
      <header className="play-bar">
        <button className="icon-button" onClick={onHome} aria-label="Home">
          🏠
        </button>
        <div className="progress" aria-label={`Note ${round.index + 1} of ${ROUND_LENGTH}`}>
          {round.prompts.map((_, i) => (
            <span key={i} className={i < round.index ? 'dot done' : i === round.index ? 'dot now' : 'dot'} />
          ))}
        </div>
        {round.revealed ? (
          <button className="icon-button" onClick={() => dispatch({ type: 'advance' })} aria-label="Skip">
            ⏭
          </button>
        ) : (
          <span className="icon-button placeholder" />
        )}
      </header>
      <div className="play-main">
        <div className="staff-wrap">
          <GrandStaff midi={prompt.midi} clef={prompt.clef} tone={tone} />
        </div>
        <FeedbackView feedback={round.feedback} hearing={hearing} />
      </div>
      <Keyboard target={round.revealed || round.feedback.kind === 'correct' ? prompt.midi : null} detected={round.detectedMidi} />
    </main>
  );
}
