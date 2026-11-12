// Home, end-of-round and message screens. Kids see big pictures and buttons;
// parent-facing text is small and grouped under "Grown-ups".

import { useRef } from 'react';
import { LEVELS } from '../music/levels';
import type { StartResult } from '../audio/engine';
import { Icon, type IconName } from './Icon';

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
  onOptions: () => void;
  onSecretTap: () => void;
}

export function HomeScreen({ bestStars, onPlay, onOptions, onSecretTap }: HomeProps) {
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
      <button className="icon-button corner" onClick={onOptions} aria-label="Options">
        <Icon name="settings" size={26} />
      </button>
      <h1 className="title" onClick={tapTitle}>
        <span className="fish">🐟</span> notefish
      </h1>
      <div className="levels">
        {LEVELS.map((l) => (
          <button key={l.id} className="level-card" onClick={() => onPlay(l.id)}>
            <span className="level-fish">{l.fish}</span>
            <span className="level-num">{l.id}</span>
            <span className="level-name">{l.name}</span>
            <Stars count={bestStars[l.id] ?? 0} />
          </button>
        ))}
      </div>
      <Sea />
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
      <Stars count={stars} />
      {/* Every first-try note is a fish caught; the rest got away as bubbles. */}
      <div className="catch" aria-label={`${firstTry} fish caught`}>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i < firstTry ? 'caught' : 'bubble'} style={{ animationDelay: `${0.6 + i * 0.08}s` }}>
            {i < firstTry ? '🐟' : '🫧'}
          </span>
        ))}
      </div>
      <p className="parent-note">
        {firstTry} of {total} on the first try
      </p>
      <div className="row">
        <button className="big-button secondary" onClick={onHome} aria-label="Home">
          <Icon name="home" size={40} />
        </button>
        <button className="big-button" onClick={onAgain} aria-label="Play again">
          <Icon name="replay" size={40} />
        </button>
        {hasNext && (
          <button className="big-button" onClick={onNext} aria-label="Next level">
            <Icon name="next" size={40} />
          </button>
        )}
      </div>
    </main>
  );
}

/** Decorative fish swimming along the bottom of the screen, with rising bubbles. */
export function Sea() {
  return (
    <div className="sea" aria-hidden>
      <span className="swimmer s1">🐟</span>
      <span className="swimmer s2">🐠</span>
      <span className="swimmer s3">🐡</span>
      {[12, 30, 55, 72, 88].map((left, i) => (
        <span key={left} className="rising" style={{ left: `${left}%`, animationDelay: `${i * 1.3}s` }} />
      ))}
    </div>
  );
}

type Problem = Exclude<StartResult, { ok: true }>['reason'] | 'paused';

const MESSAGES: Record<Problem, { icon: IconName; kid: string; parent: string; button: string }> = {
  denied: {
    icon: 'mic',
    kid: 'notefish needs to hear your piano!',
    parent:
      'Grown-ups: microphone access is blocked. On iPhone or iPad, tap "aA" in the address bar, then Website Settings, and set Microphone to Allow (or Settings › Apps › Safari › Microphone). Then try again.',
    button: 'Try again',
  },
  'no-mic': {
    icon: 'mic',
    kid: "I can't find a microphone.",
    parent: 'Grown-ups: this device has no microphone available, or another app is using it.',
    button: 'Try again',
  },
  suspended: {
    icon: 'speaker',
    kid: 'Tap to wake up the sound!',
    parent: 'The browser paused audio. One more tap starts it.',
    button: 'Tap here',
  },
  paused: {
    icon: 'play',
    kid: 'Ready to keep playing?',
    parent: 'The microphone turns off while notefish is in the background.',
    button: 'Keep playing',
  },
  unsupported: {
    icon: 'alert',
    kid: "This browser can't listen.",
    parent: 'Grown-ups: please open notefish in Safari on iPhone/iPad, or in Chrome or Firefox, over https.',
    button: 'Try again',
  },
  error: {
    icon: 'alert',
    kid: 'Something went wrong.',
    parent: 'Grown-ups: the microphone could not start. Reloading the page usually fixes this.',
    button: 'Try again',
  },
};

export function MessageScreen({ problem, onRetry, onHome }: { problem: Problem; onRetry: () => void; onHome?: () => void }) {
  const m = MESSAGES[problem];
  return (
    <main className="screen message">
      <div className="message-icon">
        <Icon name={m.icon} size={64} />
      </div>
      <p className="kid-text">{m.kid}</p>
      <p className="parent-note">{m.parent}</p>
      <div className="row">
        {onHome && (
          <button className="big-button secondary" onClick={onHome} aria-label="Home">
            <Icon name="home" size={40} />
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

interface OptionsProps {
  a4Hz: number;
  onTune: () => void;
  onReset: () => void;
  onBack: () => void;
}

/** Parent settings. Tuning lives here on purpose: most pianos work fine without it. */
export function OptionsScreen({ a4Hz, onTune, onReset, onBack }: OptionsProps) {
  const cents = Math.round(1200 * Math.log2(a4Hz / 440));
  const custom = Math.abs(cents) >= 1;
  return (
    <main className="screen options">
      <button className="icon-button corner left" onClick={onBack} aria-label="Back">
        <Icon name="back" size={28} />
      </button>
      <h2>Options</h2>
      <section className="option-card">
        <h3>Piano tuning</h3>
        <p className="parent-note">
          notefish works with most pianos as they are. If a very out-of-tune piano gets correct notes marked wrong,
          tune notefish to it.
        </p>
        <p className="option-value">
          {custom
            ? `Tuned to your piano (${Math.abs(cents)} cents ${cents < 0 ? 'flat' : 'sharp'})`
            : 'Standard tuning (A = 440 Hz)'}
        </p>
        <div className="row">
          <button className="pill-button" onClick={onTune}>
            Tune to my piano
          </button>
          {custom && (
            <button className="pill-button secondary" onClick={onReset}>
              Reset to standard
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
