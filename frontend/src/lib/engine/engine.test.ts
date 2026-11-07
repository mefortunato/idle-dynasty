import { describe, expect, it, vi } from 'vitest';
import { CATALOG, CATALOG_BY_ID, STARTERS } from './catalog';
import {
  advance, applyOffline, ascend, buyFacility, dealHand, facilityCost, finishMiniGame,
  pickDraft, resolvePlayoffGame, scout, setLineup, startPlayoffs, toggleLineup, unlockVenue
} from './actions';
import { GRADE_DEFS, MEDALS, PACK_COST, PITY, SPORT_DEFS } from './data';
import {
  legacyFloorTier, legacyGain, lineupAthletes, lineupSlots, offlineCapMs, totalCps
} from './formulas';
import { fmt } from './format';
import { mulberry32 } from './rng';
import { newGame, migrate, SAVE_VERSION } from './state';
import type { Athlete, GameState, MiniGameCard } from './types';
import { GRADES, SPORTS } from './types';

// ───────────────────────── helpers ─────────────────────────

const NOW = 1_700_000_000_000;

function lineupFull(s: GameState): boolean {
  return s.lineup.length >= lineupSlots(s);
}

/** Give every lineup athlete enormous ratings in every sport so the team dominates. */
function makeGiantTeam(s: GameState) {
  for (const a of lineupAthletes(s)) {
    a.ratings = Object.fromEntries(SPORTS.map((sp) => [sp, 1_000_000])) as Athlete['ratings'];
  }
}

/** Strip every rating from the lineup so the team has zero power. */
function makeZeroTeam(s: GameState) {
  for (const a of lineupAthletes(s)) a.ratings = {};
}

function bronzeCard(overrides: Partial<MiniGameCard> = {}): MiniGameCard {
  return { variant: 'qb-read', sport: 'gridiron', stat: 'value', modifier: 'none', ...overrides };
}

// ───────────────────────── newGame / migrate ─────────────────────────

describe('newGame', () => {
  it('starts with one rookie per sport as the starter roster', () => {
    const s = newGame(NOW);
    expect(s.athletes).toHaveLength(5);
    expect(s.athletes.every((a) => a.grade === 'rookie')).toBe(true);
    const primaries = s.athletes.map((a) => a.primary).sort();
    expect(primaries).toEqual([...SPORTS].sort());
  });

  it('fills the lineup with the 5 starters', () => {
    const s = newGame(NOW);
    expect(s.lineup).toHaveLength(5);
    expect(new Set(s.lineup)).toEqual(new Set(STARTERS));
    expect(lineupSlots(s)).toBe(5);
  });

  it('unlocks only the basketball venue and is version-stamped', () => {
    const s = newGame(NOW);
    expect(s.venuesUnlocked).toEqual(['basketball']);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.createdAt).toBe(NOW);
    expect(s.lastTick).toBe(NOW);
    expect(s.lineupLocked).toBe(false);
  });

  it('creates empty facility maps for every sport', () => {
    const s = newGame(NOW);
    for (const sp of SPORTS) expect(s.facilities[sp]).toEqual({});
    for (const sp of SPORTS) expect(s.titles[sp]).toBe(0);
  });
});

describe('migrate', () => {
  it('returns a fresh game for non-object input', () => {
    expect(migrate(null, NOW).athletes).toHaveLength(5);
    expect(migrate('garbage', NOW).venuesUnlocked).toEqual(['basketball']);
  });

  it('fills missing fields of a partial object', () => {
    const s = migrate({ cash: 123, version: 0 }, NOW);
    expect(s.cash).toBe(123);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.athletes).toHaveLength(5);
    expect(s.lineup).toHaveLength(5);
    expect(s.venuesUnlocked).toEqual(['basketball']);
    expect(s.presets).toEqual([[], [], []]);
    expect(s.log.length).toBeGreaterThan(0);
  });

  it('fills missing per-sport facility and title maps and stats keys', () => {
    const s = migrate({ facilities: { basketball: { seating: 3 } } as never, stats: { plays: 9 } as never }, NOW);
    for (const sp of SPORTS) expect(s.facilities[sp]).toBeDefined();
    expect(s.facilities.basketball).toEqual({ seating: 3 });
    for (const sp of SPORTS) expect(s.titles[sp]).toBe(0);
    expect(s.stats).toEqual({ plays: 9, minigames: 0, titles: 0, pulls: 0 });
  });
});

// ───────────────────────── catalog ─────────────────────────

describe('catalog', () => {
  it('has 100 templates', () => {
    expect(CATALOG).toHaveLength(100);
  });

  it('has unique ids and unique names', () => {
    expect(new Set(CATALOG.map((t) => t.id)).size).toBe(100);
    expect(new Set(CATALOG.map((t) => t.name)).size).toBe(100);
  });

  it('indexes every template by id', () => {
    for (const t of CATALOG) expect(CATALOG_BY_ID[t.id]).toBe(t);
  });

  it('is deterministic across module reloads', async () => {
    const first = JSON.stringify(CATALOG);
    vi.resetModules();
    const again = await import('./catalog');
    expect(JSON.stringify(again.CATALOG)).toBe(first);
  });

  it('gives MVP athletes 2 sports, Legend 3 and GOAT 5', () => {
    const sportsOf = (grade: string) =>
      CATALOG.filter((t) => t.grade === grade).map((t) => Object.keys(t.ratings).length);
    expect(new Set(sportsOf('mvp'))).toEqual(new Set([2]));
    expect(new Set(sportsOf('legend'))).toEqual(new Set([3]));
    expect(new Set(sportsOf('goat'))).toEqual(new Set([5]));
  });

  it('matches the per-grade counts in GRADE_DEFS', () => {
    for (const g of GRADES) {
      expect(CATALOG.filter((t) => t.grade === g)).toHaveLength(GRADE_DEFS[g].count);
    }
  });
});

// ───────────────────────── advance / idle economy ─────────────────────────

describe('advance', () => {
  it('increases cash by about totalCps * dt', () => {
    const s = newGame(NOW);
    const cps = totalCps(s, NOW);
    expect(cps).toBeGreaterThan(0);
    const before = s.cash;
    advance(s, 10, NOW);
    const gained = s.cash - before;
    expect(gained).toBeCloseTo(cps * 10, 6);
    expect(s.runCash).toBeCloseTo(gained, 6);
  });

  it('ignores non-positive dt', () => {
    const s = newGame(NOW);
    advance(s, 0, NOW);
    advance(s, -5, NOW);
    expect(s.cash).toBe(25);
  });

  it('grows readiness linearly and caps it at 1', () => {
    const s = newGame(NOW);
    advance(s, 900, NOW); // readiness is 1 per 30 minutes
    expect(s.readiness).toBeCloseTo(0.5, 9);
    advance(s, 1_000_000, NOW);
    expect(s.readiness).toBe(1);
  });

  it('does not grow readiness during an active playoff', () => {
    const s = newGame(NOW);
    s.readiness = 0.2;
    s.playoff = { tier: 1, sport: 'basketball', round: 0, seed: 1, results: [], active: true };
    advance(s, 900, NOW);
    expect(s.readiness).toBe(0.2);
  });
});

// ───────────────────────── facilities / venues ─────────────────────────

describe('buyFacility', () => {
  it('deducts cost and increases the facility level', () => {
    const s = newGame(NOW);
    const cost = facilityCost(s, 'basketball', 'seating');
    expect(cost).toBe(10);
    expect(buyFacility(s, 'basketball', 'seating')).toBe(true);
    expect(s.cash).toBe(25 - cost);
    expect(s.facilities.basketball.seating).toBe(1);
  });

  it('makes each next level more expensive', () => {
    const s = newGame(NOW);
    const c0 = facilityCost(s, 'basketball', 'seating');
    s.cash = 1e9;
    buyFacility(s, 'basketball', 'seating');
    const c1 = facilityCost(s, 'basketball', 'seating');
    buyFacility(s, 'basketball', 'seating');
    const c2 = facilityCost(s, 'basketball', 'seating');
    expect(c1).toBeGreaterThan(c0);
    expect(c2).toBeGreaterThan(c1);
  });

  it('fails when unaffordable and leaves state untouched', () => {
    const s = newGame(NOW);
    s.cash = 5;
    expect(buyFacility(s, 'basketball', 'seating')).toBe(false);
    expect(s.cash).toBe(5);
    expect(s.facilities.basketball.seating ?? 0).toBe(0);
  });

  it('fails for a venue that is not unlocked', () => {
    const s = newGame(NOW);
    s.cash = 1e9;
    expect(buyFacility(s, 'soccer', 'seating')).toBe(false);
  });

  it('stops at the facility max level', () => {
    const s = newGame(NOW);
    s.cash = 1e300;
    s.facilities.basketball.jumbotron = 60;
    expect(buyFacility(s, 'basketball', 'jumbotron')).toBe(false);
  });
});

describe('unlockVenue', () => {
  it('only unlocks the next venue in order', () => {
    const s = newGame(NOW);
    s.cash = 1e15;
    expect(unlockVenue(s, 'baseball')).toBe(false);
    expect(unlockVenue(s, 'gridiron')).toBe(false);
    expect(unlockVenue(s, 'soccer')).toBe(true);
    expect(s.venuesUnlocked).toEqual(['basketball', 'soccer']);
    expect(unlockVenue(s, 'soccer')).toBe(false); // already open
    expect(unlockVenue(s, 'gridiron')).toBe(true);
  });

  it('requires cash equal to the unlock cost', () => {
    const s = newGame(NOW);
    const cost = SPORT_DEFS.soccer.unlockCost;
    s.cash = cost - 1;
    expect(unlockVenue(s, 'soccer')).toBe(false);
    expect(s.venuesUnlocked).toEqual(['basketball']);
    s.cash = cost;
    expect(unlockVenue(s, 'soccer')).toBe(true);
    expect(s.cash).toBe(0);
  });
});

// ───────────────────────── lineup ─────────────────────────

describe('lineup editing', () => {
  it('setLineup caps the lineup at lineupSlots and drops unowned ids', () => {
    const s = newGame(NOW);
    const extra = CATALOG.find((t) => t.grade === 'pro')!.id; // not owned
    const ids = [...s.athletes.map((a) => a.id), extra];
    expect(setLineup(s, ids)).toBe(true);
    expect(s.lineup).toHaveLength(5);
    expect(s.lineup).not.toContain(extra);
    setLineup(s, [s.athletes[0].id, s.athletes[0].id, 'nope']);
    expect(s.lineup).toEqual([s.athletes[0].id]);
  });

  it('toggleLineup removes members and refuses to exceed lineupSlots', () => {
    const s = newGame(NOW);
    const first = s.lineup[0];
    expect(toggleLineup(s, first)).toBe(true);
    expect(s.lineup).toHaveLength(4);
    expect(lineupFull(s)).toBe(false);
    // Add an owned bench athlete while there is room
    const bench = { ...s.athletes[0], id: 'bench-extra' };
    s.athletes.push(bench);
    expect(toggleLineup(s, bench.id)).toBe(true);
    expect(s.lineup).toHaveLength(5);
    // Now the lineup is full; toggling in another owned athlete fails
    const another = { ...s.athletes[0], id: 'bench-extra-2' };
    s.athletes.push(another);
    expect(toggleLineup(s, another.id)).toBe(false);
    expect(s.lineup).toHaveLength(5);
    expect(s.lineup).not.toContain(another.id);
  });

  it('respects lineupLocked for setLineup and toggleLineup', () => {
    const s = newGame(NOW);
    const before = [...s.lineup];
    s.lineupLocked = true;
    expect(setLineup(s, [])).toBe(false);
    expect(s.lineup).toEqual(before);
    expect(toggleLineup(s, before[0])).toBe(false);
    expect(s.lineup).toEqual(before);
  });
});

// ───────────────────────── scouting ─────────────────────────

describe('scout', () => {
  it('costs scout tokens', () => {
    const s = newGame(NOW);
    expect(scout(s, null, mulberry32(1))).not.toBeNull();
    expect(s.tokens).toBe(20 - PACK_COST);
  });

  it('returns null without enough tokens', () => {
    const s = newGame(NOW);
    s.tokens = PACK_COST - 1;
    expect(scout(s, null, mulberry32(1))).toBeNull();
    expect(s.tokens).toBe(PACK_COST - 1);
  });

  it('adds a new athlete or awards shards on duplicates', () => {
    const s = newGame(NOW);
    s.tokens = 100_000;
    const rng = mulberry32(7);
    let sawNew = false;
    let sawDupe = false;
    for (let i = 0; i < 300; i++) {
      const before = s.athletes.length;
      const shardsBefore = s.shards;
      const r = scout(s, null, rng)!;
      expect(r).not.toBeNull();
      if (r.duplicate) {
        sawDupe = true;
        expect(s.athletes.length).toBe(before);
        expect(r.shards).toBe(GRADE_DEFS[r.athlete.grade].dupeShards);
        expect(s.shards).toBe(shardsBefore + r.shards);
      } else {
        sawNew = true;
        expect(s.athletes.length).toBe(before + 1);
        expect(s.athletes[s.athletes.length - 1].id).toBe(r.athlete.id);
        expect(s.shards).toBe(shardsBefore);
      }
    }
    expect(sawNew).toBe(true);
    expect(sawDupe).toBe(true);
    expect(s.stats.pulls).toBe(300);
  });

  it('a focus pack is refused until that sport has a title', () => {
    const s = newGame(NOW);
    s.tokens = 100;
    expect(scout(s, 'hockey', mulberry32(3))).toBeNull();
    s.titles.hockey = 1;
    const r = scout(s, 'hockey', mulberry32(3));
    expect(r).not.toBeNull();
  });

  it('guarantees MVP or better once the MVP pity counter reaches its limit', () => {
    const s = newGame(NOW);
    s.tokens = 100;
    s.scoutPity.mvp = PITY.mvp - 1; // 39: the next pull is the 40th
    const r = scout(s, null, mulberry32(42))!;
    expect(r).not.toBeNull();
    expect(GRADES.indexOf(r.athlete.grade)).toBeGreaterThanOrEqual(GRADES.indexOf('mvp'));
    expect(s.scoutPity.mvp).toBe(0);
  });
});

// ───────────────────────── mini games ─────────────────────────

describe('dealHand', () => {
  it('consumes one energy and deals 3 cards with distinct sports', () => {
    const s = newGame(NOW);
    expect(s.energy).toBe(5);
    const hand = dealHand(s, mulberry32(11))!;
    expect(hand).toHaveLength(3);
    expect(s.energy).toBe(4);
    expect(new Set(hand.map((c) => c.sport)).size).toBe(3);
    expect(s.hand).toBe(hand);
  });

  it('returns the existing hand without spending energy again', () => {
    const s = newGame(NOW);
    const hand = dealHand(s, mulberry32(11));
    const again = dealHand(s, mulberry32(99));
    expect(again).toBe(hand);
    expect(s.energy).toBe(4);
  });

  it('returns null with 0 energy', () => {
    const s = newGame(NOW);
    s.energy = 0;
    expect(dealHand(s, mulberry32(1))).toBeNull();
    expect(s.hand).toBeNull();
    expect(s.energy).toBe(0);
  });
});

describe('finishMiniGame', () => {
  it('maps scores to medal thresholds', () => {
    const cases: [number, string][] = [
      [249, 'none'],
      [250, 'bronze'],
      [499, 'bronze'],
      [500, 'silver'],
      [750, 'gold'],
      [920, 'platinum']
    ];
    for (const [score, medal] of cases) {
      const s = newGame(NOW);
      const r = finishMiniGame(s, bronzeCard(), score, NOW);
      expect(r.medal).toBe(medal);
    }
  });

  it('awards no boost for a score below bronze', () => {
    const s = newGame(NOW);
    const r = finishMiniGame(s, bronzeCard(), 249, NOW);
    expect(r.medal).toBe('none');
    expect(s.boosts).toEqual([]);
    expect(s.tokens).toBe(20);
  });

  it('adds a boost with the medal multiplier and duration', () => {
    const s = newGame(NOW);
    const r = finishMiniGame(s, bronzeCard({ stat: 'value' }), 750, NOW);
    expect(r.medal).toBe('gold');
    expect(s.boosts).toHaveLength(1);
    const b = s.boosts[0];
    expect(b.stat).toBe('value');
    expect(b.mult).toBeCloseTo(MEDALS.gold.mult, 9);
    expect(b.expiresAt).toBe(NOW + MEDALS.gold.minutes * 60_000);
  });

  it('uses a boosted multiplier for a hotstreak card', () => {
    const s = newGame(NOW);
    finishMiniGame(s, bronzeCard({ stat: 'pace', modifier: 'hotstreak' }), 250, NOW);
    const expected = 1 + (MEDALS.bronze.mult - 1) * 1.5;
    expect(s.boosts[0].mult).toBeCloseTo(expected, 9);
    expect(s.boosts[0].stat).toBe('pace');
  });

  it('extends the duration of an active boost on the same stat', () => {
    const s = newGame(NOW);
    const minutes = MEDALS.bronze.minutes;
    finishMiniGame(s, bronzeCard({ stat: 'crit' }), 250, NOW);
    finishMiniGame(s, bronzeCard({ stat: 'crit' }), 250, NOW);
    expect(s.boosts).toHaveLength(1);
    expect(s.boosts[0].expiresAt).toBe(NOW + 2 * minutes * 60_000);
  });

  it('counts the minigame and records the best score', () => {
    const s = newGame(NOW);
    finishMiniGame(s, bronzeCard(), 300, NOW);
    finishMiniGame(s, bronzeCard(), 200, NOW);
    expect(s.stats.minigames).toBe(2);
    expect(s.minigameBest['qb-read']).toBe(300);
  });
});

// ───────────────────────── playoffs ─────────────────────────

describe('playoffs', () => {
  it('startPlayoffs requires full readiness or enough trophies', () => {
    const s = newGame(NOW);
    expect(startPlayoffs(s, 1)).toBe(false);
    expect(s.playoff).toBeNull();

    s.readiness = 1;
    expect(startPlayoffs(s, 1)).toBe(true);
    expect(s.playoff?.active).toBe(true);
    expect(s.playoff?.tier).toBe(1);
    expect(s.playoff?.sport).toBe('basketball');
    expect(s.readiness).toBe(0);
  });

  it('startPlayoffs can be entered early by paying trophies', () => {
    const s = newGame(NOW);
    s.trophies = 3; // earlyEntryCost at tier 1, readiness 0 is 3
    expect(startPlayoffs(s, 1)).toBe(true);
    expect(s.trophies).toBe(0);
  });

  it('startPlayoffs locks the lineup and bumps athlete seasons', () => {
    const s = newGame(NOW);
    s.readiness = 1;
    const seasonsBefore = lineupAthletes(s).map((a) => a.seasons);
    startPlayoffs(s, 1);
    expect(s.lineupLocked).toBe(true);
    expect(setLineup(s, [])).toBe(false);
    expect(lineupAthletes(s).map((a) => a.seasons)).toEqual(seasonsBefore.map((x) => x + 1));
  });

  it('a giant team wins four rounds, takes the title and advances the tier', () => {
    const s = newGame(NOW);
    makeGiantTeam(s);
    s.readiness = 1;
    startPlayoffs(s, 1);

    let last = null as ReturnType<typeof resolvePlayoffGame>;
    for (let i = 0; i < 4; i++) {
      last = resolvePlayoffGame(s, [1000, 1000, 1000]);
      expect(last?.win).toBe(true);
    }
    expect(last!.title).toBe(true);
    expect(last!.done).toBe(true);
    expect(s.titles.basketball).toBe(1);
    expect(s.champTier).toBe(2);
    expect(s.bestTier).toBe(1);
    expect(s.runBestTier).toBe(1);
    expect(s.stats.titles).toBe(1);
    expect(s.playoff?.active).toBe(false);
    expect(s.playoff?.results).toEqual(['W', 'W', 'W', 'W']);
    expect(resolvePlayoffGame(s, [])).toBeNull();
  });

  it('a zero-rated team loses', () => {
    const s = newGame(NOW);
    makeZeroTeam(s);
    s.readiness = 1;
    startPlayoffs(s, 1);
    const r = resolvePlayoffGame(s, [0, 0, 0]);
    expect(r).not.toBeNull();
    expect(r!.win).toBe(false);
    expect(r!.done).toBe(true);
    expect(r!.title).toBe(false);
    expect(s.playoff?.active).toBe(false);
    expect(s.titles.basketball).toBe(0);
    expect(s.champTier).toBe(1);
  });

  it('resolvePlayoffGame returns null outside a playoff', () => {
    const s = newGame(NOW);
    expect(resolvePlayoffGame(s, [])).toBeNull();
  });
});

// ───────────────────────── ascension ─────────────────────────

describe('ascend', () => {
  function readyToAscend(): GameState {
    const s = newGame(NOW);
    s.cash = 1e6;
    s.bestTier = 4;
    s.runBestTier = 2;
    s.facilities.basketball.seating = 5;
    s.venuesUnlocked.push('soccer');
    s.lineupLocked = true;
    return s;
  }

  it('refuses when legacy gain is below 1', () => {
    const s = newGame(NOW);
    expect(legacyGain(s)).toBe(0);
    expect(ascend(s, 'none', mulberry32(1))).toBe(0);
    expect(s.ascensions).toBe(0);
    expect(s.pendingDraft).toBeNull();
  });

  it('resets run resources, keeps athletes, and grants legacy points', () => {
    const s = readyToAscend();
    const gain = legacyGain(s);
    expect(gain).toBeGreaterThanOrEqual(1);
    const athleteIds = s.athletes.map((a) => a.id);

    const got = ascend(s, 'none', mulberry32(1));
    expect(got).toBe(gain);
    expect(s.legacy).toBe(gain);
    expect(s.ascensions).toBe(1);
    expect(s.cash).toBe(25);
    expect(s.venuesUnlocked).toEqual(['basketball']);
    expect(s.facilities.basketball).toEqual({});
    expect(s.athletes.map((a) => a.id)).toEqual(athleteIds);
    expect(s.lineupLocked).toBe(false);
  });

  it('sets champTier to the legacy floor tier', () => {
    const s = readyToAscend();
    const floor = legacyFloorTier(s);
    expect(floor).toBe(3); // floor(4 * 0.5) + 1
    ascend(s, 'none', mulberry32(1));
    expect(s.champTier).toBe(floor);
  });

  it('creates a pending draft of 3 unowned athletes', () => {
    const s = readyToAscend();
    const owned = new Set(s.athletes.map((a) => a.id));
    ascend(s, 'none', mulberry32(1));
    expect(s.pendingDraft).toHaveLength(3);
    for (const a of s.pendingDraft!) expect(owned.has(a.id)).toBe(false);
  });

  it('pickDraft adds the chosen athlete and clears the draft', () => {
    const s = readyToAscend();
    ascend(s, 'none', mulberry32(1));
    const pick = s.pendingDraft![1];
    const before = s.athletes.length;
    expect(pickDraft(s, pick.id)).toBe(true);
    expect(s.athletes).toHaveLength(before + 1);
    expect(s.athletes.some((a) => a.id === pick.id)).toBe(true);
    expect(s.pendingDraft).toBeNull();
  });
});

// ───────────────────────── offline ─────────────────────────

describe('applyOffline', () => {
  it('returns null for short absences and just advances lastTick', () => {
    const s = newGame(0);
    s.lastTick = 0;
    expect(applyOffline(s, 30_000)).toBeNull();
    expect(s.lastTick).toBe(30_000);
    expect(s.cash).toBe(25);
  });

  it('caps the simulated time at offlineCapMs and applies offline efficiency', () => {
    const s = newGame(0);
    s.lastTick = 0;
    const cap = offlineCapMs(s);
    expect(cap).toBe(2 * 3600 * 1000);
    const cps = totalCps(s, 0);
    const eff = 0.5; // base efficiency with no broadcast/legacy/iron_lungs bonuses

    const report = applyOffline(s, 10 * 3600 * 1000)!;
    expect(report.ms).toBe(cap);
    const expectedCash = cps * (cap / 1000) * eff;
    expect(report.cash).toBeCloseTo(expectedCash, 6);
    expect(s.cash).toBeCloseTo(25 + expectedCash, 6);
    expect(s.lastTick).toBe(10 * 3600 * 1000);
  });

  it('uses the full elapsed time when below the cap', () => {
    const s = newGame(0);
    s.lastTick = 0;
    const report = applyOffline(s, 600_000)!; // 10 minutes
    expect(report.ms).toBe(600_000);
    expect(report.cash).toBeGreaterThan(0);
  });
});

// ───────────────────────── format ─────────────────────────

describe('fmt', () => {
  it('formats small numbers as integers', () => {
    expect(fmt(999)).toBe('999');
  });

  it('formats thousands with K', () => {
    expect(fmt(1500)).toBe('1.50K');
  });

  it('formats millions with M', () => {
    expect(fmt(2.5e6)).toBe('2.50M');
  });
});

// ───────────────────────── sanity ─────────────────────────

describe('misc', () => {
  it('PITY thresholds and sport list are as documented', () => {
    expect(PITY.mvp).toBe(40);
    expect(SPORTS).toHaveLength(5);
  });

  it('mulberry32 is seedable', () => {
    const a = mulberry32(5);
    const b = mulberry32(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
