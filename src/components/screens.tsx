// Home, end-of-round and message screens. Kids see big pictures and buttons;
// parent-facing text is small and grouped under "Grown-ups".

import { useRef } from 'react';
import { LEVELS } from '../music/levels';
import type { StartResult } from '../audio/engine';

export function Stars({ count, max = 3 }: { count: number; max?: number }) {
  return (
    <span className="stars" aria-label={`${count} of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < count ? 'star on' : 'star'} style={{ animationDelay: `${i * 0.25}s` }}>
          ★
        </span>
      ))}
    </span>
  );
}

interface HomeProps {
  bestStars: Record<number, number>;
  onPlay: (levelId: number) => void;
  onTune: () => void;
  onSecretTap: () => void;
}

export function HomeScreen({ bestStars, onPlay, onTune, onSecretTap }: HomeProps) {
  // Five quick taps on the title toggle the debug overlay.
  const taps = useRef<number[]>([]);
  const tapTitle = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 2000), now];
    if (taps.current.length >= 5) {
      taps.current = [];
      onSecretTap();
    }
  };
  return (
    <main className="screen home">
      <h1 className="title" onClick={tapTitle}>
        <span className="fish">🐟</span> notefish
      </h1>
      <div className="levels">
        {LEVELS.map((l) => (
          <button key={l.id} className="level-card" onClick={() => onPlay(l.id)}>
            <span className="level-num">{l.id}</span>
            <span className="level-name">{l.name}</span>
            <Stars count={bestStars[l.id] ?? 0} />
          </button>
        ))}
      </div>
      <button className="link-button" onClick={onTune}>
        🎛️ Grown-ups: tune-up
      </button>
    </main>
  );
}

interface EndProps {
  stars: number;
  firstTry: number;
  total: number;
  hasNext: boolean;
  onAgain: () => void;
  onNext: () => void;
  onHome: () => void;
}

export function EndScreen({ stars, firstTry, total, hasNext, onAgain, onNext, onHome }: EndProps) {
  return (
    <main className="screen end">
      <div className="end-fish">🐟</div>
      <Stars count={stars} />
      <p className="parent-note">
        {firstTry} of {total} on the first try
      </p>
      <div className="row">
        <button className="big-button secondary" onClick={onHome} aria-label="Home">
          🏠
        </button>
        <button className="big-button" onClick={onAgain} aria-label="Play again">
          ↻
        </button>
        {hasNext && (
          <button className="big-button" onClick={onNext} aria-label="Next level">
            ▶
          </button>
        )}
      </div>
    </main>
  );
}

type Problem = Exclude<StartResult, { ok: true }>['reason'] | 'paused';

const MESSAGES: Record<Problem, { icon: string; kid: string; parent: string; button: string }> = {
  denied: {
    icon: '🎤',
    kid: 'notefish needs to hear your piano!',
    parent:
      'Grown-ups: microphone access is blocked. On iPhone or iPad, tap "aA" in the address bar, then Website Settings, and set Microphone to Allow (or Settings › Apps › Safari › Microphone). Then try again.',
    button: 'Try again',
  },
  'no-mic': {
    icon: '🎤',
    kid: "I can't find a microphone.",
    parent: 'Grown-ups: this device has no microphone available, or another app is using it.',
    button: 'Try again',
  },
  suspended: {
    icon: '🔈',
    kid: 'Tap to wake up the sound!',
    parent: 'The browser paused audio. One more tap starts it.',
    button: 'Tap here',
  },
  paused: {
    icon: '⏸️',
    kid: 'Ready to keep playing?',
    parent: 'The microphone turns off while notefish is in the background.',
    button: '▶ Keep playing',
  },
  unsupported: {
    icon: '😕',
    kid: "This browser can't listen.",
    parent: 'Grown-ups: please open notefish in Safari on iPhone/iPad, or in Chrome or Firefox, over https.',
    button: 'Try again',
  },
  error: {
    icon: '😕',
    kid: 'Something went wrong.',
    parent: 'Grown-ups: the microphone could not start. Reloading the page usually fixes this.',
    button: 'Try again',
  },
};

export function MessageScreen({ problem, onRetry, onHome }: { problem: Problem; onRetry: () => void; onHome?: () => void }) {
  const m = MESSAGES[problem];
  return (
    <main className="screen message">
      <div className="message-icon">{m.icon}</div>
      <p className="kid-text">{m.kid}</p>
      <p className="parent-note">{m.parent}</p>
      <div className="row">
        {onHome && (
          <button className="big-button secondary" onClick={onHome} aria-label="Home">
            🏠
          </button>
        )}
        <button className="big-button wide" onClick={onRetry}>
          {m.button}
        </button>
      </div>
    </main>
  );
}

export type { Problem };
