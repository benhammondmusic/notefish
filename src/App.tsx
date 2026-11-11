import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { engine } from './audio/engine';
import { LEVELS, ROUND_LENGTH, starsFor } from './music/levels';
import * as storage from './game/storage';
import { PlayScreen } from './components/PlayScreen';
import { CalibrateScreen } from './components/CalibrateScreen';
import { DebugOverlay } from './components/DebugOverlay';
import { EndScreen, HomeScreen, MessageScreen, type Problem } from './components/screens';

type Screen =
  | { name: 'home' }
  | { name: 'calibrate'; thenLevel: number | null }
  | { name: 'play'; levelId: number; key: number }
  | { name: 'end'; levelId: number; firstTry: number; stars: number }
  | { name: 'message'; problem: Problem; retry: Screen };

const debugFromUrl = new URLSearchParams(location.search).has('debug');

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [a4Hz, setA4Hz] = useState(storage.getA4);
  const [bestStars, setBestStars] = useState(storage.getBestStars);
  const [debug, setDebug] = useState(debugFromUrl);
  const [paused, setPaused] = useState(false);

  // When the tab comes back after the mic was released, ask for a tap.
  useEffect(() => engine.onStatus((s) => setPaused(s === 'paused')), []);

  /**
   * Start audio (must run inside the tap handler) and then go to `next`.
   * Offers the tune-up once, the first time a game is started.
   */
  const startThen = (next: Screen) => {
    void engine.start().then((r) => {
      if (!r.ok) {
        setScreen({ name: 'message', problem: r.reason, retry: next });
        return;
      }
      if (next.name === 'play' && !storage.wasCalibrationOffered()) {
        storage.markCalibrationOffered();
        setScreen({ name: 'calibrate', thenLevel: next.levelId });
        return;
      }
      setScreen(next);
    });
  };

  const play = (levelId: number) => startThen({ name: 'play', levelId, key: Date.now() });

  const onRoundDone = useCallback(
    (levelId: number, firstTry: number) => {
      const stars = starsFor(firstTry, ROUND_LENGTH);
      storage.recordStars(levelId, stars);
      setBestStars(storage.getBestStars());
      void engine.play('fanfare');
      setScreen({ name: 'end', levelId, firstTry, stars });
    },
    [],
  );

  const afterCalibration = (thenLevel: number | null) =>
    setScreen(thenLevel ? { name: 'play', levelId: thenLevel, key: Date.now() } : { name: 'home' });

  let content: ReactNode;
  switch (screen.name) {
    case 'home':
      content = (
        <HomeScreen
          bestStars={bestStars}
          onPlay={play}
          onTune={() => startThen({ name: 'calibrate', thenLevel: null })}
          onSecretTap={() => setDebug((d) => !d)}
        />
      );
      break;
    case 'calibrate':
      content = (
        <CalibrateScreen
          onSave={(hz) => {
            storage.setA4(hz);
            setA4Hz(hz);
            afterCalibration(screen.thenLevel);
          }}
          onSkip={() => afterCalibration(screen.thenLevel)}
        />
      );
      break;
    case 'play':
      content = (
        <PlayScreen
          key={screen.key}
          levelId={screen.levelId}
          a4Hz={a4Hz}
          onDone={(firstTry) => onRoundDone(screen.levelId, firstTry)}
          onHome={() => setScreen({ name: 'home' })}
        />
      );
      break;
    case 'end': {
      const next = LEVELS.find((l) => l.id === screen.levelId + 1);
      content = (
        <EndScreen
          stars={screen.stars}
          firstTry={screen.firstTry}
          total={ROUND_LENGTH}
          hasNext={!!next}
          onAgain={() => play(screen.levelId)}
          onNext={() => next && play(next.id)}
          onHome={() => setScreen({ name: 'home' })}
        />
      );
      break;
    }
    case 'message':
      content = (
        <MessageScreen
          problem={screen.problem}
          onRetry={() => startThen(screen.retry)}
          onHome={() => setScreen({ name: 'home' })}
        />
      );
      break;
  }

  const needsResume = paused && (screen.name === 'play' || screen.name === 'calibrate');
  return (
    <>
      {content}
      {/* An overlay, not a replacement, so the round in progress survives. */}
      {needsResume && (
        <div className="overlay">
          <MessageScreen
            problem="paused"
            onRetry={() =>
              void engine.start().then((r) => {
                if (!r.ok) setScreen({ name: 'message', problem: r.reason, retry: { name: 'home' } });
              })
            }
            onHome={() => {
              setPaused(false);
              setScreen({ name: 'home' });
            }}
          />
        </div>
      )}
      {debug && <DebugOverlay a4Hz={a4Hz} onClose={() => setDebug(false)} />}
    </>
  );
}
