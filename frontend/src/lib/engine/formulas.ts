import { ARCHETYPES, GRADE_DEFS, MUTATORS, ROUND_MULT, SPORT_DEFS, BASE_ENERGY, ENERGY_REGEN_MS } from './data';
import type { Athlete, BoostStat, GameState, Sport } from './types';
import { SPORTS } from './types';

// ───────────────────────── Athletes ─────────────────────────

export function levelCap(a: Athlete): number {
  return 20 + 10 * a.stars;
}

export function xpToNext(level: number): number {
  return Math.ceil(30 * Math.pow(level, 1.4));
}

/** Effective rating of an athlete in a sport, including stars, level and traits. */
export function athleteRating(a: Athlete, sport: Sport): number {
  const base = a.ratings[sport] ?? 0;
  if (base <= 0) return 0;
  let r = base * (1 + 0.1 * a.stars) * (1 + 0.02 * (a.level - 1));
  if (a.traits.includes('late_bloomer')) r *= 1 + Math.min(0.6, 0.06 * a.seasons);
  return r;
}

export function athleteSports(a: Athlete): Sport[] {
  return SPORTS.filter((s) => (a.ratings[s] ?? 0) > 0);
}

export function lineupAthletes(s: GameState): Athlete[] {
  const byId = new Map(s.athletes.map((a) => [a.id, a]));
  return s.lineup.map((id) => byId.get(id)).filter((a): a is Athlete => !!a);
}

export function lineupSlots(s: GameState): number {
  return 5 + (s.legacyTree.slots ?? 0);
}

function traitCount(list: Athlete[], trait: string): number {
  return list.filter((a) => a.traits.includes(trait)).length;
}

// ───────────────────────── Chemistry ─────────────────────────

export interface Chemistry {
  sportStacks: Partial<Record<Sport, number>>; // sports with 3+ athletes
  archetypeStacks: Partial<Record<string, number>>;
  dreamTeam: boolean;
}

export function chemistry(s: GameState): Chemistry {
  const lu = lineupAthletes(s);
  const sportCount: Partial<Record<Sport, number>> = {};
  const archCount: Record<string, number> = {};
  for (const a of lu) {
    const w = a.traits.includes('two_way') ? 2 : 1;
    for (const sp of athleteSports(a)) sportCount[sp] = (sportCount[sp] ?? 0) + w;
    archCount[a.archetype] = (archCount[a.archetype] ?? 0) + w;
  }
  const sportStacks: Partial<Record<Sport, number>> = {};
  for (const sp of SPORTS) if ((sportCount[sp] ?? 0) >= 3) sportStacks[sp] = sportCount[sp];
  const archetypeStacks: Record<string, number> = {};
  for (const [k, v] of Object.entries(archCount)) if (v >= 3) archetypeStacks[k] = v;
  const dreamTeam = SPORTS.every((sp) => lu.some((a) => athleteRating(a, sp) >= 60));
  return { sportStacks, archetypeStacks, dreamTeam };
}

// ───────────────────────── Boosts ─────────────────────────

export function boostMult(s: GameState, stat: BoostStat, now: number): number {
  let m = 1;
  for (const b of s.boosts) if (b.stat === stat && b.expiresAt > now) m *= b.mult;
  return m;
}

/** Archetype-derived bonus to an idle stat, per sport. */
function archetypeBonus(lu: Athlete[], stat: BoostStat, sport: Sport, chem: Chemistry): number {
  let bonus = 0;
  for (const a of lu) {
    if (ARCHETYPES[a.archetype].stat !== stat) continue;
    const r = athleteRating(a, sport);
    if (r > 0) bonus += r / 400; // a 40-rated playmaker gives +10% value in their sport
  }
  for (const [arch, n] of Object.entries(chem.archetypeStacks)) {
    if (ARCHETYPES[arch as keyof typeof ARCHETYPES].stat === stat) bonus += 0.05 * (n ?? 0);
  }
  return bonus;
}

// ───────────────────────── Venue income ─────────────────────────

export interface VenueStats {
  pace: number; // plays/sec
  value: number; // cash per play (non-crit)
  critChance: number;
  critMult: number;
  special: number; // multiplier from venue mechanic (expected)
  lineupMult: number;
  cps: number; // expected cash per second
}

export function globalCashMult(s: GameState): number {
  const lu = lineupAthletes(s);
  const mut = MUTATORS.find((m) => m.id === s.mutator) ?? MUTATORS[0];
  return (
    (1 + 0.15 * (s.coaching.offense ?? 0)) *
    Math.pow(1.3, s.legacyTree.cash ?? 0) *
    (1 + 0.12 * traitCount(lu, 'franchise')) *
    (1 + 0.02 * s.lifetimeTrophies ** 0.8) *
    mut.cash
  );
}

export function venueStats(s: GameState, sport: Sport, now: number): VenueStats {
  const def = SPORT_DEFS[sport];
  const f = s.facilities[sport] ?? {};
  const lu = lineupAthletes(s);
  const chem = chemistry(s);
  const seat = f.seating ?? 0;
  const fac = (id: string) => f[id] ?? 0;

  const pace =
    def.pace *
    (1 + 0.06 * fac('training')) *
    (1 + 0.04 * (s.coaching.tempo ?? 0)) *
    (1 + archetypeBonus(lu, 'pace', sport, chem)) *
    boostMult(s, 'pace', now);

  const value =
    def.value *
    (1 + 0.25 * seat) *
    Math.pow(2, Math.floor(seat / 25)) *
    (1 + archetypeBonus(lu, 'value', sport, chem)) *
    boostMult(s, 'value', now);

  const critChance = Math.min(
    0.75,
    (0.02 + 0.008 * fac('jumbotron') + archetypeBonus(lu, 'crit', sport, chem) * 0.25) * boostMult(s, 'crit', now)
  );
  const showtime = lu.filter((a) => a.primary === sport && a.traits.includes('showtime')).length;
  const critMult = 4 + 0.25 * (s.coaching.analytics ?? 0) + showtime;

  const special =
    1 + (0.08 * fac('special') + archetypeBonus(lu, 'special', sport, chem)) * boostMult(s, 'special', now) * 0.5;

  const ratingSum = lu.reduce((acc, a) => acc + athleteRating(a, sport), 0);
  const lineupMult =
    (1 + ratingSum / 50) *
    (chem.sportStacks[sport] ? 1.25 : 1) *
    (chem.dreamTeam ? 1.5 : 1) *
    Math.pow(1.05, s.titles[sport] ?? 0);

  const cps =
    pace * value * (1 + critChance * (critMult - 1)) * special * lineupMult * globalCashMult(s);
  return { pace, value, critChance, critMult, special, lineupMult, cps };
}

export function totalCps(s: GameState, now: number): number {
  return s.venuesUnlocked.reduce((acc, sp) => acc + venueStats(s, sp, now).cps, 0);
}

// ───────────────────────── Fans ─────────────────────────

export function fanMult(s: GameState, now: number): number {
  const lu = lineupAthletes(s);
  let ironman = 0;
  for (const a of lu) if (a.archetype === 'ironman') ironman += Math.max(...SPORTS.map((sp) => athleteRating(a, sp))) / 400;
  return (
    (1 + 0.1 * (s.coaching.marketing ?? 0)) *
    Math.pow(1.25, s.legacyTree.fans ?? 0) *
    (1 + 0.15 * traitCount(lu, 'hometown')) *
    (1 + ironman) *
    boostMult(s, 'fans', now)
  );
}

/** Fans earned per second from winning idle sim games. Grows with cash/sec^0.45. */
export function fansPerSec(s: GameState, now: number): number {
  const cps = totalCps(s, now);
  return 0.04 * Math.pow(Math.max(cps, 1), 0.45) * s.venuesUnlocked.length ** 0.5 * fanMult(s, now);
}

// ───────────────────────── Offline ─────────────────────────

export function offlineCapMs(s: GameState): number {
  return (2 * 3600 + (s.coaching.broadcast ?? 0) * 20 * 60 + (s.legacyTree.offline ?? 0) * 2 * 3600) * 1000;
}

export function offlineEfficiency(s: GameState): number {
  const lu = lineupAthletes(s);
  return Math.min(
    1,
    0.5 + 0.02 * (s.coaching.broadcast ?? 0) + 0.05 * (s.legacyTree.efficiency ?? 0) + 0.06 * traitCount(lu, 'iron_lungs')
  );
}

// ───────────────────────── Energy ─────────────────────────

export function maxEnergy(s: GameState): number {
  return BASE_ENERGY + (s.legacyTree.energy ?? 0);
}

export function energyRegenMs(s: GameState): number {
  return ENERGY_REGEN_MS * Math.pow(0.9, s.legacyTree.regen ?? 0);
}

export function boostDurationMult(s: GameState): number {
  const lu = lineupAthletes(s);
  return (1 + 0.15 * (s.legacyTree.duration ?? 0)) * (1 + 0.2 * traitCount(lu, 'quick_study'));
}

/** Assist 0..0.5 widens timing windows in a sport's mini games. */
export function miniGameAssist(s: GameState, sport: Sport): number {
  const lu = lineupAthletes(s);
  const rating = lu.reduce((acc, a) => acc + athleteRating(a, sport), 0);
  const ice = lu.filter((a) => a.traits.includes('ice_veins') && athleteRating(a, sport) > 0).length;
  return Math.min(0.5, rating / 500 + 0.1 * ice);
}

export function miniGameDifficulty(s: GameState): number {
  return Math.min(10, 1 + Math.floor(s.bestTier / 3));
}

// ───────────────────────── Playoffs ─────────────────────────

export function teamPower(s: GameState, sport: Sport): number {
  const lu = lineupAthletes(s);
  const chem = chemistry(s);
  const mut = MUTATORS.find((m) => m.id === s.mutator) ?? MUTATORS[0];
  const ratingSum = lu.reduce(
    (acc, a) => acc + athleteRating(a, sport) * (a.traits.includes('big_stage') ? 1.12 : 1),
    0
  );
  const venueLevels = s.venuesUnlocked.includes(sport)
    ? Object.values(s.facilities[sport] ?? {}).reduce((x, y) => x + y, 0)
    : 0;
  return (
    ratingSum *
    economyPower(s) *
    (1 + 0.002 * venueLevels) *
    (1 + 0.05 * (s.coaching.strength ?? 0)) *
    Math.pow(1.15, s.legacyTree.power ?? 0) *
    Math.pow(1.05, s.titles[sport] ?? 0) *
    (chem.sportStacks[sport] ? 1.1 : 1) *
    (chem.dreamTeam ? 1.25 : 1) *
    mut.power
  );
}

/** Economy contributes logarithmically to playoff power. */
export function economyPower(s: GameState): number {
  return 1 + 0.12 * Math.log10(1 + s.runCash);
}

export function opponentPower(tier: number, round: number): number {
  return 30 * Math.pow(1.3, tier - 1) * ROUND_MULT[round];
}

export function baseWinProb(team: number, opp: number): number {
  if (team <= 0) return 0.01;
  const x = Math.log(team / opp) * 4;
  return 1 / (1 + Math.exp(-x));
}

/** Momentum shift from a clutch moment score (0..1000). */
export function clutchShift(s: GameState, score: number): number {
  const q = Math.max(0, Math.min(1, score / 1000));
  return -0.06 + 0.14 * q + (q >= 0.5 ? 0.01 * (s.legacyTree.clutch ?? 0) : 0);
}

export function readinessPerSec(s: GameState): number {
  return (1 / (30 * 60)) * (1 + 0.25 * (s.legacyTree.readiness ?? 0));
}

export function earlyEntryCost(s: GameState): number {
  return Math.ceil(3 * s.champTier * (1 - s.readiness));
}

// ───────────────────────── Ascension ─────────────────────────

export function legacyGain(s: GameState): number {
  const mut = MUTATORS.find((m) => m.id === s.mutator) ?? MUTATORS[0];
  if (s.runBestTier <= 0) return 0;
  const base = 2 * Math.pow(1.22, s.runBestTier) * (1 + Math.log10(1 + s.runFans) / 20);
  return Math.floor(base * mut.lp);
}

export function legacyFloorTier(s: GameState): number {
  const frac = 0.5 + 0.1 * (s.legacyTree.floor ?? 0);
  return Math.max(1, Math.floor(s.bestTier * frac) + 1);
}

export function canAscend(s: GameState): boolean {
  return legacyGain(s) >= 1 && !s.playoff?.active;
}

// ───────────────────────── Scouting ─────────────────────────

export function gradeWeights(s: GameState): Record<string, number> {
  const luck = 1 + 0.12 * (s.legacyTree.luck ?? 0);
  const w: Record<string, number> = {};
  for (const [g, def] of Object.entries(GRADE_DEFS)) {
    w[g] = ['mvp', 'legend', 'goat'].includes(g) ? def.odds * luck : def.odds;
  }
  return w;
}

export function starUpCost(a: Athlete): number {
  return GRADE_DEFS[a.grade].starCost * (a.stars + 1);
}
