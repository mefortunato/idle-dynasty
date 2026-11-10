import { describe, expect, it } from 'vitest';
import {
  advance, applyOffline, arenaQuickPlay, ARENA_BONUS_COOLDOWN_MS, ARENA_BONUS_SECONDS,
  ascend, autoBuy, buyFacility, switchVenue, unlockVenue
} from './actions';
import { SPORT_DEFS, SPORT_ORDER } from './data';
import { fansPerSec, offlineEfficiency, totalCps, venueStats } from './formulas';
import { migrate, newGame } from './state';

const NOW = 1_700_000_000_000;

function allArenas() {
  const s = newGame(NOW);
  s.venuesUnlocked = [...SPORT_ORDER];
  return s;
}

describe('one active arena', () => {
  it('starts basketball and unlocks another arena without activating it', () => {
    const s = newGame(NOW);
    expect(s.activeVenue).toBe('basketball');
    s.cash = SPORT_DEFS.soccer.unlockCost;
    expect(unlockVenue(s, 'soccer')).toBe(true);
    expect(s.activeVenue).toBe('basketball');
    expect(s.cash).toBe(0);
  });

  it.each(SPORT_ORDER)('only runs %s when it is active', (sport) => {
    const s = allArenas();
    s.activeVenue = sport;
    const stats = venueStats(s, sport, NOW);
    const fans = fansPerSec(s, NOW);
    expect(totalCps(s, NOW)).toBe(stats.cps);
    advance(s, 10, NOW);
    expect(s.cash - 25).toBeCloseTo(stats.cps * 10);
    expect(s.stats.plays).toBeCloseTo(stats.pace * 10);
    expect(s.fans).toBeCloseTo(fans * 10);
  });

  it('inactive arenas and their upgrades add no cash or fan income', () => {
    const s = newGame(NOW);
    const cash = totalCps(s, NOW);
    const fans = fansPerSec(s, NOW);
    s.venuesUnlocked = [...SPORT_ORDER];
    s.facilities.hockey = { seating: 100, training: 100, special: 100 };
    expect(totalCps(s, NOW)).toBe(cash);
    expect(fansPerSec(s, NOW)).toBe(fans);
  });

  it('rejects locked arenas and switching to the current arena', () => {
    const s = newGame(NOW);
    const before = structuredClone(s);
    expect(switchVenue(s, 'soccer', NOW)).toBe(false);
    expect(switchVenue(s, 'basketball', NOW)).toBe(false);
    expect(s).toEqual(before);
  });

  it('settles the old rate before switching and preserves arena upgrades', () => {
    const s = allArenas();
    s.cash = 10_000;
    buyFacility(s, 'basketball', 'seating');
    const cash = s.cash;
    const oldRate = totalCps(s, NOW);
    expect(switchVenue(s, 'soccer', NOW + 1000)).toBe(true);
    expect(s.cash - cash).toBeCloseTo(oldRate);
    expect(totalCps(s, NOW + 1000)).toBe(venueStats(s, 'soccer', NOW + 1000).cps);
    switchVenue(s, 'basketball', NOW + 1000);
    expect(s.facilities.basketball.seating).toBe(1);
    expect(s.activeVenue).toBe('basketball');
  });

  it('automatic purchases only upgrade the active arena', () => {
    const s = allArenas();
    s.activeVenue = 'soccer';
    s.cash = 10_000;
    autoBuy(s);
    expect(Object.keys(s.facilities.soccer).length).toBeGreaterThan(0);
    for (const sport of SPORT_ORDER.filter((sp) => sp !== 'soccer')) expect(s.facilities[sport]).toEqual({});
  });

  it('offline earnings use the saved active arena alone', () => {
    const s = allArenas();
    s.activeVenue = 'gridiron';
    const expected = venueStats(s, 'gridiron', NOW).cps * 600 * offlineEfficiency(s);
    const plays = venueStats(s, 'gridiron', NOW).pace * 600 * offlineEfficiency(s);
    const report = applyOffline(s, NOW + 600_000)!;
    expect(report.cash).toBeCloseTo(expected);
    expect(s.stats.plays).toBeCloseTo(plays);
  });
});

describe('arena save compatibility', () => {
  it('selects the latest unlocked venue for old saves without losing upgrades', () => {
    const s = migrate({ version: 1, venuesUnlocked: ['basketball', 'soccer', 'gridiron'], facilities: { soccer: { seating: 12 } }, cash: 1234 }, NOW);
    expect(s.activeVenue).toBe('gridiron');
    expect(s.cash).toBe(1234);
    expect(s.facilities.soccer.seating).toBe(12);
    expect(s.arenaBonusReadyAt).toBe(0);
  });

  it('preserves the chosen arena and cooldown after saving and reloading', () => {
    const s = allArenas();
    switchVenue(s, 'soccer', NOW);
    arenaQuickPlay(s, 'soccer', NOW);
    const loaded = migrate(JSON.parse(JSON.stringify(s)), NOW + 1000);
    expect(loaded.activeVenue).toBe('soccer');
    expect(loaded.arenaBonusReadyAt).toBe(NOW + ARENA_BONUS_COOLDOWN_MS);
    expect(arenaQuickPlay(loaded, 'soccer', NOW + 1000)).toBe(0);
  });

  it('repairs locked or invalid selections and malformed venue lists', () => {
    expect(migrate({ venuesUnlocked: ['basketball', 'soccer'], activeVenue: 'hockey' }, NOW).activeVenue).toBe('soccer');
    for (const venuesUnlocked of [[], null, ['bogus'], 'hockey']) {
      const s = migrate({ venuesUnlocked, activeVenue: 'bogus', arenaBonusReadyAt: -1 }, NOW);
      expect(s.venuesUnlocked).toEqual(['basketball']);
      expect(s.activeVenue).toBe('basketball');
      expect(s.arenaBonusReadyAt).toBe(0);
    }
  });

  it('returns to basketball with a fresh bonus on ascension', () => {
    const s = allArenas();
    s.activeVenue = 'hockey';
    s.runBestTier = 2;
    s.arenaBonusReadyAt = NOW + ARENA_BONUS_COOLDOWN_MS;
    expect(ascend(s)).toBeGreaterThan(0);
    expect(s.activeVenue).toBe('basketball');
    expect(s.venuesUnlocked).toEqual(['basketball']);
    expect(s.arenaBonusReadyAt).toBe(0);
  });
});

describe('optional arena quick play', () => {
  it('grants two seconds of active income without spending energy', () => {
    const s = newGame(NOW);
    const energy = s.energy;
    const expected = totalCps(s, NOW) * ARENA_BONUS_SECONDS;
    expect(arenaQuickPlay(s, 'basketball', NOW)).toBe(expected);
    expect(s.cash).toBe(25 + expected);
    expect(s.runCash).toBe(expected);
    expect(s.energy).toBe(energy);
    expect(s.stats.minigames).toBe(0);
  });

  it('shares the cooldown across switching and allows another play at expiry', () => {
    const s = allArenas();
    arenaQuickPlay(s, 'basketball', NOW);
    expect(arenaQuickPlay(s, 'basketball', NOW)).toBe(0);
    switchVenue(s, 'soccer', NOW);
    expect(arenaQuickPlay(s, 'soccer', NOW + ARENA_BONUS_COOLDOWN_MS - 1)).toBe(0);
    expect(arenaQuickPlay(s, 'soccer', NOW + ARENA_BONUS_COOLDOWN_MS)).toBeGreaterThan(0);
  });

  it('rejects inactive arenas without changing the state', () => {
    const s = allArenas();
    const before = structuredClone(s);
    expect(arenaQuickPlay(s, 'soccer', NOW)).toBe(0);
    expect(s).toEqual(before);
  });
});
