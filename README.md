# notefish

**Play it: https://benhammondmusic.github.io/notefish/**

A piano note-reading game for kids (roughly ages 5 to 10). The app shows one note on a grand staff, the child plays that key on a real acoustic piano, and the app listens through the device microphone to check the exact pitch: right letter **and** right octave.

Built for an iPad or iPhone propped on the piano's music stand. Runs entirely in the browser: no backend, no cloud audio, no native wrapper.

## Features

- Grand staff (treble + bass) with correct ledger lines, including middle C in either clef.
- Pitch detection with the McLeod Pitch Method (MPM), running in an `AudioWorklet`.
- Onset detection (RMS jump over an adaptive noise floor, with a refractory period) so each key press is judged once.
- Octave-error guard: sub-harmonic energy checks catch the "heard the 2nd or 3rd harmonic" mistakes pianos are prone to.
- Tolerant of out-of-tune pianos: a note is correct within ±50 cents, and an optional calibration ("play the A in the middle of the piano") shifts the reference so even a piano that sits flat overall scores correctly.
- Six levels by range, rounds of 10 notes, up to 3 tries per note, stars for first-try accuracy, best stars saved per level.
- On-screen mini keyboard (C3 to C5) that shows where the child landed and, after a miss, where the target is.
- Debug overlay for real-device testing: add `?debug=1` to the URL, or tap the title five times quickly.

### Levels

| Level | Range | Clef |
| --- | --- | --- |
| 1 | C4 to G4 | treble |
| 2 | F3 to C4 | bass |
| 3 | A3 to E4 | middle C area, both clefs |
| 4 | C4 to C5 | treble |
| 5 | C3 to C4 | bass |
| 6 | C3 to C5 | mixed grand staff |

Naturals only. Nothing below C3 (weak piano fundamentals make detection unreliable there).

## Setup

Requires Node 20+.

```sh
npm install
npm run dev        # local dev server at http://localhost:5173
npm test           # unit tests (Vitest)
npm run build      # static build in dist/
npm run preview    # serve the build locally
```

## Testing on an iPhone or iPad

Microphone access (`getUserMedia`) only works in a secure context, so the phone must load the app over HTTPS.

**Option A: Vite's HTTPS dev server on your local network**

```sh
npm run dev:https
```

This serves `https://<your-computer's-LAN-IP>:5173` with a self-signed certificate (via `@vitejs/plugin-basic-ssl`). Open that URL in Safari on the device, tap through the certificate warning ("Show Details", then "visit this website"), and allow the microphone when prompted. Both devices must be on the same Wi-Fi network.

**Option B: a tunnel**

Run `npm run dev` and expose port 5173 with any HTTPS tunnel, for example:

```sh
npx cloudflared tunnel --url http://localhost:5173
```

Open the printed `https://` URL on the device. No certificate warning.

**Debugging on device:** open `?debug=1` to see live Hz, nearest note, cents, clarity, RMS, noise floor, onset events, and the microphone track settings iOS actually applied. For console logs, connect the device to a Mac and use Safari's Develop menu.

## Deployment

Pushes to `main` deploy automatically to GitHub Pages via `.github/workflows/pages.yml` (tests must pass first).

`npm run build` produces a fully static site in `dist/`. Host it anywhere that serves HTTPS: GitHub Pages, Netlify, Cloudflare Pages, S3 + CloudFront, and so on. The build uses relative asset paths, so it works from a sub-path such as `https://user.github.io/notefish/`.

## How it works

```
mic ─▶ getUserMedia (EC/NS/AGC off) ─▶ AudioWorklet
                                          │  per 128-sample block: RMS, noise floor, onset
                                          │  50–300 ms after onset: MPM frames
                                          │  median Hz + clarity, octave-error guard
                                          ▼
                                   port.postMessage ─▶ main thread
                                                          │  Hz ─▶ fractional MIDI (vs. calibrated A4)
                                                          │  judge: correct / octave / wrong / unclear
                                                          ▼
                                                       React game UI
```

### Project layout

```
src/
  audio/
    mpm.ts             McLeod Pitch Method + octave-error guard (pure, unit-tested)
    onset.ts           RMS onset detector with adaptive noise floor (pure, unit-tested)
    analyzer.ts        onset + pitch-window state machine shared by the worklet and tests
    pitch-worklet.ts   AudioWorkletProcessor wrapping analyzer.ts
    engine.ts          AudioContext, mic, worklet wiring, visibility handling
    sfx.ts             synthesized feedback sounds (mic is muted while they play)
  music/
    notes.ts           MIDI / Hz / names / staff positions
    levels.ts          level definitions and note picking
    scoring.ts         judging a detected pitch against the target
  game/
    useGame.ts         round state machine
    storage.ts         localStorage wrappers (try/catch everywhere)
  components/          GrandStaff (hand-rolled SVG), Keyboard, DebugOverlay, screens
test/
  synth.ts             synthesized pure and piano-like test signals
```

### Design choices

- **Hand-rolled SVG staff instead of VexFlow.** We only ever draw one whole note on a grand staff. A ~150-line SVG component gives exact control over ledger lines and sizing, with no ~1 MB dependency and no font loading on iOS.
- **MPM instead of YIN or a library.** MPM's normalized square difference function gives a clarity score in [0, 1] for free (used to reject unclear input), and its "first peak above k × max" rule already resists picking a period that is too long. A Goertzel-based sub-harmonic check covers the opposite error (picking a harmonic).
- **All audio analysis in the worklet.** The main thread only receives compact events (`onset`, `note`, `unclear`, plus debug telemetry), so UI work never drops audio frames.

## Known limitations

- iOS may not honor every `getUserMedia` constraint. The applied track settings are logged to the console and shown in the debug overlay.
- On iPhone, while the microphone is active, iOS may route app sounds to the quieter earpiece speaker. The app sets `navigator.audioSession.type = "play-and-record"` where supported (Safari 16.4+), but volume can still be low.
- After the tab is hidden the mic is released. On return the child or parent taps once to resume (iOS requires a gesture to restart audio).
- Very loud rooms, other instruments, or held-down sustain pedal with overlapping notes can confuse onset detection.
- Clefs are drawn with Unicode music symbols; rendering depends on the device's fonts (fine on iOS/macOS, may vary elsewhere).
- Out of scope for v1: chords, sharps/flats, rhythm, accounts, backend, MIDI keyboard input.
