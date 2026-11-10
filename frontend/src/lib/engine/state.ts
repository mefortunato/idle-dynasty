import { CATALOG_BY_ID, STARTERS, instantiate } from './catalog';
import { backfillUnlocks } from './progression';
import { SPORT_ORDER } from './data';
import type { GameState, Sport } from './types';
import { SPORTS } from './types';

export const SAVE_VERSION = 2;

function emptyFacilities(): Record<Sport, Record<string, number>> {
  return Object.fromEntries(SPORTS.map((s) => [s, {}])) as Record<Sport, Record<string, number>>;
}

export function newGame(now = Date.now()): GameState {
  const athletes = STARTERS.map((id) => instantiate(CATALOG_BY_ID[id]));
  return {
    version: SAVE_VERSION,
    createdAt: now,
    resetAt: 0,
    lastTick: now,
    lastSeen: now,
    cash: 25,
    fans: 0,
    trophies: 0,
    lifetimeTrophies: 0,
    legacy: 0,
    tokens: 20,
    shards: 0,
    runCash: 0,
    runFans: 0,
    runTrophies: 0,
    runBestTier: 0,
    champTier: 1,
    bestTier: 0,
    readiness: 0,
    venuesUnlocked: ['basketball'],
    activeVenue: 'basketball',
    arenaBonusReadyAt: 0,
    facilities: emptyFacilities(),
    coaching: {},
    mutator: 'none',
    legacyTree: {},
    titles: Object.fromEntries(SPORTS.map((s) => [s, 0])) as Record<Sport, number>,
    ascensions: 0,
    athletes,
    lineup: athletes.map((a) => a.id),
    lineupLocked: false,
    presets: [[], [], []],
    scoutPity: { mvp: 0, legend: 0 },
    pendingDraft: null,
    energy: 5,
    energyAt: now,
    boosts: [],
    hand: null,
    medalStreak: { day: '', count: 0 },
    minigameBest: {},
    playoff: null,
    stats: { plays: 0, minigames: 0, titles: 0, pulls: 0, playoffGames: 0 },
    unlocked: [],
    log: [{ t: now, msg: 'Welcome to Idle Dynasty! Your first franchise tips off in Basketball.' }]
  };
}

/** Fill in any fields missing from an older save. */
export function migrate(raw: unknown, now = Date.now()): GameState {
  const fresh = newGame(now);
  if (!raw || typeof raw !== 'object') return fresh;
  const s = { ...fresh, ...(raw as Partial<GameState>) } as GameState;
  s.facilities = { ...emptyFacilities(), ...s.facilities };
  s.titles = { ...fresh.titles, ...s.titles };
  s.stats = { ...fresh.stats, ...s.stats };
  // Old saves ran every unlocked venue. Keep progress and select the latest arena.
  const unlocked = Array.isArray(s.venuesUnlocked) ? s.venuesUnlocked : [];
  s.venuesUnlocked = SPORT_ORDER.filter((sport) => sport === 'basketball' || unlocked.includes(sport));
  const savedActive = (raw as Partial<GameState>).activeVenue;
  s.activeVenue = savedActive && s.venuesUnlocked.includes(savedActive)
    ? savedActive : s.venuesUnlocked[s.venuesUnlocked.length - 1];
  if (!Number.isFinite(s.arenaBonusReadyAt) || s.arenaBonusReadyAt < 0) s.arenaBonusReadyAt = 0;
  if (!Array.isArray((raw as Partial<GameState>).unlocked)) {
    s.unlocked = [];
    backfillUnlocks(s);
  }
  s.version = SAVE_VERSION;
  return s;
}
