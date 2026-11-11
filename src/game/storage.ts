// localStorage can be missing or throw (private mode, blocked storage), so
// every access is wrapped and the app works without it.

import { DEFAULT_A4_HZ } from '../music/notes';

const KEY = 'notefish:v1';

interface Saved {
  a4Hz?: number;
  calibrationOffered?: boolean;
  bestStars?: Record<number, number>;
}

function load(): Saved {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Saved;
  } catch {
    return {};
  }
}

function save(patch: Partial<Saved>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...load(), ...patch }));
  } catch {
    /* storage unavailable: settings just won't persist */
  }
}

export function getA4(): number {
  const v = load().a4Hz;
  return typeof v === 'number' && v > 400 && v < 480 ? v : DEFAULT_A4_HZ;
}

export function setA4(a4Hz: number): void {
  save({ a4Hz });
}

export function wasCalibrationOffered(): boolean {
  return load().calibrationOffered === true;
}

export function markCalibrationOffered(): void {
  save({ calibrationOffered: true });
}

export function getBestStars(): Record<number, number> {
  return load().bestStars ?? {};
}

/** Saves only if better than the previous best. */
export function recordStars(levelId: number, stars: number): void {
  const best = getBestStars();
  if (stars > (best[levelId] ?? 0)) save({ bestStars: { ...best, [levelId]: stars } });
}
