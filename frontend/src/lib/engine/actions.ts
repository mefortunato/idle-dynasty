import { CATALOG, CATALOG_BY_ID, instantiate } from './catalog';
import {
  CLUTCH_PER_GAME, COACHING, FACILITIES, FOCUS_PACK_COST, GRADE_DEFS, LEGACY, MEDALS, MUTATORS,
  PACK_COST, PITY, SPORT_DEFS, SPORT_ORDER, featuredSport, upgradeCost
} from './data';
import {
  athleteRating, baseWinProb, boostDurationMult, canAscend, clutchShift, earlyEntryCost, energyRegenMs,
  fansPerSec, gradeWeights, legacyFloorTier, legacyGain, levelCap, lineupAthletes, lineupSlots, maxEnergy,
  offlineCapMs, offlineEfficiency, opponentPower, readinessPerSec, starUpCost, teamPower, totalCps, venueStats, xpToNext
} from './formulas';
import { mulberry32, pick, randomSeed, shuffle } from './rng';
import { newGame } from './state';
import { checkUnlocks, type FeatureDef } from './progression';
import type { Athlete, BoostStat, Grade, GameState, Medal, MiniGameCard, Sport } from './types';
import { GRADES, SPORTS } from './types';
import { VARIANTS } from './variants';

export function log(s: GameState, msg: string, now = Date.now()) {
  s.log.unshift({ t: now, msg });
  if (s.log.length > 50) s.log.length = 50;
}

// ───────────────────────── Tick ─────────────────────────

/** Advance the simulation by dt seconds. All idle math is expected-value so it's deterministic. */
export function advance(s: GameState, dt: number, now: number) {
  if (dt <= 0) return;
  const cps = totalCps(s, now);
  const fps = fansPerSec(s, now);
  const cash = cps * dt;
  s.cash += cash;
  s.runCash += cash;
  s.fans += fps * dt;
  s.runFans += fps * dt;
  for (const sp of s.venuesUnlocked) s.stats.plays += venueStats(s, sp, now).pace * dt;

  if (!s.playoff?.active && s.unlocked.includes('playoffs')) s.readiness = Math.min(1, s.readiness + readinessPerSec(s) * dt);

  // XP for lineup athletes
  for (const a of lineupAthletes(s)) {
    const gain = dt * (1 + 0.1 * s.ascensions) * (a.traits.includes('workhorse') ? 1.75 : 1);
    a.xp += gain;
    while (a.level < levelCap(a) && a.xp >= xpToNext(a.level)) {
      a.xp -= xpToNext(a.level);
      a.level++;
    }
    if (a.level >= levelCap(a)) a.xp = Math.min(a.xp, xpToNext(a.level));
  }
}

export function regenEnergy(s: GameState, now: number) {
  const max = maxEnergy(s);
  const per = energyRegenMs(s);
  if (s.energy >= max) {
    s.energyAt = now;
    return;
  }
  const gained = Math.floor((now - s.energyAt) / per);
  if (gained > 0) {
    s.energy = Math.min(max, s.energy + gained);
    s.energyAt = s.energy >= max ? now : s.energyAt + gained * per;
  }
}

/** Main loop entry: call frequently with Date.now(). Returns any features unlocked this tick. */
export function tick(s: GameState, now: number): FeatureDef[] {
  const dt = Math.min(5, (now - s.lastTick) / 1000);
  advance(s, dt, now);
  s.lastTick = now;
  s.lastSeen = now;
  regenEnergy(s, now);
  s.boosts = s.boosts.filter((b) => b.expiresAt > now);
  if (s.legacyTree.autobuy) autoBuy(s);
  return checkUnlocks(s);
}

export interface OfflineReport {
  ms: number;
  cash: number;
  fans: number;
}

/** Apply offline progress on load. Returns a report for a "welcome back" modal. */
export function applyOffline(s: GameState, now: number): OfflineReport | null {
  const away = now - s.lastTick;
  if (away < 60_000) {
    s.lastTick = now;
    return null;
  }
  const ms = Math.min(away, offlineCapMs(s));
  const eff = offlineEfficiency(s);
  const cash0 = s.cash;
  const fans0 = s.fans;
  // Simulate at "lastTick" time so expired boosts don't apply offline.
  const dt = (ms / 1000) * eff;
  advance(s, dt, s.lastTick);
  s.lastTick = now;
  s.lastSeen = now;
  regenEnergy(s, now);
  s.boosts = s.boosts.filter((b) => b.expiresAt > now);
  return { ms, cash: s.cash - cash0, fans: s.fans - fans0 };
}

// ───────────────────────── Purchases ─────────────────────────

export function facilityCost(s: GameState, sport: Sport, id: string): number {
  const def = FACILITIES.find((f) => f.id === id)!;
  return upgradeCost(def, s.facilities[sport][id] ?? 0, SPORT_DEFS[sport].costMult);
}

export function buyFacility(s: GameState, sport: Sport, id: string): boolean {
  const def = FACILITIES.find((f) => f.id === id);
  if (!def || !s.venuesUnlocked.includes(sport)) return false;
  const lvl = s.facilities[sport][id] ?? 0;
  if (def.max !== undefined && lvl >= def.max) return false;
  const cost = facilityCost(s, sport, id);
  if (s.cash < cost) return false;
  s.cash -= cost;
  s.facilities[sport][id] = lvl + 1;
  return true;
}

/** Buy as many levels as affordable. Returns levels bought. */
export function buyFacilityMax(s: GameState, sport: Sport, id: string): number {
  let n = 0;
  while (n < 1000 && buyFacility(s, sport, id)) n++;
  return n;
}

export function autoBuy(s: GameState) {
  for (let i = 0; i < 20; i++) {
    let best: { sport: Sport; id: string; cost: number } | null = null;
    for (const sp of s.venuesUnlocked) {
      for (const f of FACILITIES) {
        if (f.max !== undefined && (s.facilities[sp][f.id] ?? 0) >= f.max) continue;
        const cost = facilityCost(s, sp, f.id);
        if (!best || cost < best.cost) best = { sport: sp, id: f.id, cost };
      }
    }
    if (!best || best.cost > s.cash * 0.5) return;
    buyFacility(s, best.sport, best.id);
  }
}

export function nextVenue(s: GameState): Sport | null {
  return SPORT_ORDER.find((sp) => !s.venuesUnlocked.includes(sp)) ?? null;
}

export function unlockVenue(s: GameState, sport: Sport): boolean {
  if (nextVenue(s) !== sport) return false;
  const cost = SPORT_DEFS[sport].unlockCost;
  if (s.cash < cost) return false;
  s.cash -= cost;
  s.venuesUnlocked.push(sport);
  log(s, `${SPORT_DEFS[sport].emoji} ${SPORT_DEFS[sport].name} venue opened!`);
  return true;
}

export function coachingCost(s: GameState, id: string): number {
  const def = COACHING.find((c) => c.id === id)!;
  return upgradeCost(def, s.coaching[id] ?? 0);
}

export function buyCoaching(s: GameState, id: string): boolean {
  const def = COACHING.find((c) => c.id === id);
  if (!def) return false;
  const lvl = s.coaching[id] ?? 0;
  if (def.max !== undefined && lvl >= def.max) return false;
  const cost = coachingCost(s, id);
  if (s.fans < cost) return false;
  s.fans -= cost;
  s.coaching[id] = lvl + 1;
  return true;
}

export function legacyCost(s: GameState, id: string): number {
  const def = LEGACY.find((c) => c.id === id)!;
  return upgradeCost(def, s.legacyTree[id] ?? 0);
}

export function buyLegacy(s: GameState, id: string): boolean {
  const def = LEGACY.find((c) => c.id === id);
  if (!def) return false;
  const lvl = s.legacyTree[id] ?? 0;
  if (def.max !== undefined && lvl >= def.max) return false;
  const cost = legacyCost(s, id);
  if (s.legacy < cost) return false;
  s.legacy -= cost;
  s.legacyTree[id] = lvl + 1;
  return true;
}

// ───────────────────────── Lineup ─────────────────────────

export function canEditLineup(s: GameState): boolean {
  return !s.lineupLocked;
}

export function setLineup(s: GameState, ids: string[]): boolean {
  if (s.lineupLocked) return false;
  const owned = new Set(s.athletes.map((a) => a.id));
  const clean = [...new Set(ids)].filter((id) => owned.has(id)).slice(0, lineupSlots(s));
  s.lineup = clean;
  return true;
}

export function toggleLineup(s: GameState, id: string): boolean {
  if (s.lineupLocked) return false;
  if (s.lineup.includes(id)) s.lineup = s.lineup.filter((x) => x !== id);
  else if (s.lineup.length < lineupSlots(s)) s.lineup = [...s.lineup, id];
  else return false;
  return true;
}

/** Lock the lineup and start the run proper (called on first "Play Ball"). */
export function lockLineup(s: GameState) {
  s.lineupLocked = true;
  for (const a of lineupAthletes(s)) a.seasons++;
  log(s, '🔒 Lineup locked for this run. Ascend to reconfigure.');
}

/** Trade deadline: unlock lineup mid-run for trophies. */
export function tradeDeadlineCost(s: GameState): number {
  return 10 + 5 * s.champTier;
}

export function tradeDeadline(s: GameState): boolean {
  const cost = tradeDeadlineCost(s);
  if (!s.lineupLocked || s.trophies < cost) return false;
  s.trophies -= cost;
  s.lineupLocked = false;
  log(s, '📝 Trade deadline: lineup unlocked. Lock it again to continue earning XP bonuses.');
  return true;
}

export function starUp(s: GameState, id: string): boolean {
  const a = s.athletes.find((x) => x.id === id);
  if (!a || a.stars >= 5) return false;
  const cost = starUpCost(a);
  if (s.shards < cost) return false;
  s.shards -= cost;
  a.stars++;
  return true;
}

export function savePreset(s: GameState, slot: number) {
  s.presets[slot] = [...s.lineup];
}

export function loadPreset(s: GameState, slot: number): boolean {
  return setLineup(s, s.presets[slot] ?? []);
}

// ───────────────────────── Scouting ─────────────────────────

export interface PullResult {
  athlete: Athlete;
  duplicate: boolean;
  shards: number;
}

function rollGrade(s: GameState, rng: () => number): Grade {
  if (s.scoutPity.legend + 1 >= PITY.legend) return rng() < 0.9 ? 'legend' : 'goat';
  if (s.scoutPity.mvp + 1 >= PITY.mvp) return 'mvp';
  const w = gradeWeights(s);
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (const g of GRADES) {
    r -= w[g];
    if (r <= 0) return g;
  }
  return 'rookie';
}

export function focusPackUnlocked(s: GameState, sport: Sport): boolean {
  return (s.titles[sport] ?? 0) > 0;
}

export function scout(s: GameState, focus: Sport | null = null, rng = mulberry32(randomSeed())): PullResult | null {
  const cost = focus ? FOCUS_PACK_COST : PACK_COST;
  if (s.tokens < cost) return null;
  if (focus && !focusPackUnlocked(s, focus)) return null;
  s.tokens -= cost;
  const grade = rollGrade(s, rng);
  const rank = GRADES.indexOf(grade);
  s.scoutPity.mvp = rank >= GRADES.indexOf('mvp') ? 0 : s.scoutPity.mvp + 1;
  s.scoutPity.legend = rank >= GRADES.indexOf('legend') ? 0 : s.scoutPity.legend + 1;
  let pool = CATALOG.filter((t) => t.grade === grade);
  if (focus) {
    const f = pool.filter((t) => t.primary === focus);
    if (f.length) pool = f;
  }
  const t = pick(rng, pool);
  s.stats.pulls++;
  const existing = s.athletes.find((a) => a.id === t.id);
  if (existing) {
    const shards = GRADE_DEFS[grade].dupeShards;
    s.shards += shards;
    return { athlete: existing, duplicate: true, shards };
  }
  const a = instantiate(t);
  s.athletes.push(a);
  if (['legend', 'goat'].includes(grade)) log(s, `🌟 Signed ${GRADE_DEFS[grade].name} ${a.name}!`);
  return { athlete: a, duplicate: false, shards: 0 };
}

// ───────────────────────── Mini games ─────────────────────────

const BOOST_STATS: BoostStat[] = ['value', 'pace', 'crit', 'special'];

export function dealHand(s: GameState, rng = mulberry32(randomSeed()), now = Date.now()): MiniGameCard[] | null {
  if (s.hand) return s.hand;
  if (s.energy <= 0) return null;
  s.energy--;
  if (s.energy === maxEnergy(s) - 1) s.energyAt = now;
  const n = 3 + (s.legacyTree.cards ?? 0);
  // Prefer variety across sports: shuffle and prefer distinct sports.
  const shuffled = shuffle(rng, VARIANTS);
  const chosen: typeof VARIANTS = [];
  const sports = new Set<Sport>();
  for (const v of shuffled) if (chosen.length < n && !sports.has(v.sport)) { chosen.push(v); sports.add(v.sport); }
  for (const v of shuffled) if (chosen.length < n && !chosen.includes(v)) chosen.push(v);
  s.hand = chosen.map((v) => {
    const r = rng();
    const modifier: MiniGameCard['modifier'] = !s.unlocked.includes('modifiers') ? 'none' : r < 0.15 ? 'hotstreak' : r < 0.25 ? 'rivalry' : r < 0.35 ? 'fanday' : 'none';
    return { variant: v.id, sport: v.sport, stat: modifier === 'fanday' ? 'fans' : pick(rng, BOOST_STATS), modifier };
  });
  return s.hand;
}

export function medalFor(score: number): Medal {
  if (score >= MEDALS.platinum.min) return 'platinum';
  if (score >= MEDALS.gold.min) return 'gold';
  if (score >= MEDALS.silver.min) return 'silver';
  if (score >= MEDALS.bronze.min) return 'bronze';
  return 'none';
}

export interface MiniGameReward {
  medal: Medal;
  mult: number;
  minutes: number;
  tokens: number;
  fans: number;
  stat: BoostStat;
}

export function finishMiniGame(s: GameState, card: MiniGameCard, score: number, now = Date.now()): MiniGameReward {
  s.hand = null;
  s.stats.minigames++;
  s.minigameBest[card.variant] = Math.max(s.minigameBest[card.variant] ?? 0, score);
  const medal = medalFor(score);
  const reward: MiniGameReward = { medal, mult: 1, minutes: 0, tokens: 0, fans: 0, stat: card.stat };
  if (medal === 'none') return reward;
  const m = MEDALS[medal];
  reward.tokens = m.tokens;
  if (card.modifier === 'rivalry') reward.tokens += { bronze: 1, silver: 2, gold: 3, platinum: 5 }[medal];
  const minutes = m.minutes * boostDurationMult(s);
  if (card.modifier === 'fanday') {
    reward.fans = fansPerSec(s, now) * minutes * 60 * m.mult;
    s.fans += reward.fans;
    s.runFans += reward.fans;
  } else {
    const mult = card.modifier === 'hotstreak' ? 1 + (m.mult - 1) * 1.5 : m.mult;
    reward.mult = mult;
    reward.minutes = minutes;
    const existing = s.boosts.find((b) => b.stat === card.stat && b.expiresAt > now);
    if (existing) {
      existing.mult = Math.max(existing.mult, mult);
      existing.expiresAt = Math.max(existing.expiresAt, now) + minutes * 60_000;
    } else {
      s.boosts.push({ stat: card.stat, mult, expiresAt: now + minutes * 60_000 });
    }
  }
  // Daily gold+ streak
  if (medal === 'gold' || medal === 'platinum') {
    const day = new Date(now).toISOString().slice(0, 10);
    const yesterday = new Date(now - 86_400_000).toISOString().slice(0, 10);
    if (s.medalStreak.day !== day) {
      s.medalStreak = { day, count: s.medalStreak.day === yesterday ? s.medalStreak.count + 1 : 1 };
      if (s.medalStreak.count % 3 === 0) {
        reward.tokens += 5;
        log(s, `🔥 ${s.medalStreak.count}-day Gold streak! +5 Scout Tokens`);
      }
    }
  }
  s.tokens += reward.tokens;
  return reward;
}

// ───────────────────────── Playoffs ─────────────────────────

export function canEnterPlayoffs(s: GameState): boolean {
  return !s.playoff?.active && (s.readiness >= 1 || s.trophies >= earlyEntryCost(s));
}

export function startPlayoffs(s: GameState, seed = randomSeed()): boolean {
  if (!canEnterPlayoffs(s)) return false;
  if (s.readiness < 1) s.trophies -= earlyEntryCost(s);
  if (!s.lineupLocked) lockLineup(s);
  s.playoff = { tier: s.champTier, sport: featuredSport(s.champTier), round: 0, seed, results: [], active: true };
  s.readiness = 0;
  return true;
}

export function timeoutsPerRun(s: GameState): number {
  return 1 + (s.legacyTree.timeouts ?? 0);
}

export interface GameOdds {
  team: number;
  opp: number;
  base: number;
}

export function currentOdds(s: GameState): GameOdds | null {
  const p = s.playoff;
  if (!p) return null;
  const team = teamPower(s, p.sport);
  const opp = opponentPower(p.tier, p.round);
  return { team, opp, base: baseWinProb(team, opp) };
}

export interface GameResult {
  win: boolean;
  prob: number;
  trophies: number;
  tokens: number;
  title: boolean;
  done: boolean;
}

/** Resolve the current playoff game given clutch scores (0..1000 each). */
export function resolvePlayoffGame(s: GameState, clutchScores: number[]): GameResult | null {
  const p = s.playoff;
  if (!p?.active) return null;
  const odds = currentOdds(s)!;
  const shift = clutchScores.slice(0, CLUTCH_PER_GAME).reduce((acc, sc) => acc + clutchShift(s, sc), 0);
  const prob = Math.max(0.02, Math.min(0.98, odds.base + shift));
  const rng = mulberry32(p.seed + p.round * 7919);
  const win = rng() < prob;
  p.results.push(win ? 'W' : 'L');
  s.stats.playoffGames = (s.stats.playoffGames ?? 0) + 1;
  const res: GameResult = { win, prob, trophies: 0, tokens: 0, title: false, done: false };
  const tokenMult = 1 + 0.1 * (s.coaching.scouting ?? 0);
  if (win) {
    res.trophies = Math.ceil(p.tier * (p.round + 1) * 0.5);
    res.tokens = Math.ceil((2 + p.round) * tokenMult);
    if (p.round === 3) {
      res.title = true;
      res.trophies += 5 * p.tier;
      res.tokens += Math.ceil(10 * tokenMult);
      s.titles[p.sport] = (s.titles[p.sport] ?? 0) + 1;
      s.stats.titles++;
      s.bestTier = Math.max(s.bestTier, p.tier);
      s.runBestTier = Math.max(s.runBestTier, p.tier);
      s.champTier = p.tier + 1;
      p.active = false;
      res.done = true;
      log(s, `🏆 ${SPORT_DEFS[p.sport].name} Champions! Tier ${p.tier} conquered.`);
    } else {
      p.round++;
    }
  } else {
    p.active = false;
    res.done = true;
    log(s, `❌ Eliminated in the ${['Quarterfinal', 'Semifinal', 'Conference Final', 'Championship'][p.round]} (Tier ${p.tier}).`);
  }
  s.trophies += res.trophies;
  s.lifetimeTrophies += res.trophies;
  s.runTrophies += res.trophies;
  s.tokens += res.tokens;
  return res;
}

export function endPlayoffs(s: GameState) {
  s.playoff = null;
}

// ───────────────────────── Ascension ─────────────────────────

export function ascend(s: GameState, mutatorId = 'none', rng = mulberry32(randomSeed())): number {
  if (!canAscend(s)) return 0;
  const gain = legacyGain(s);
  const floor = legacyFloorTier(s);
  const fresh = newGame(Date.now());
  s.legacy += gain;
  s.ascensions++;
  s.cash = 25 * Math.pow(10, s.legacyTree.start ?? 0);
  s.fans = 0;
  s.runCash = 0;
  s.runFans = 0;
  s.runTrophies = 0;
  s.runBestTier = 0;
  s.champTier = Math.max(floor, 1);
  s.readiness = 0;
  s.venuesUnlocked = ['basketball'];
  s.facilities = fresh.facilities;
  s.coaching = {};
  s.boosts = [];
  s.hand = null;
  s.playoff = null;
  s.lineupLocked = false;
  s.mutator = MUTATORS.some((m) => m.id === mutatorId) ? mutatorId : 'none';
  s.pendingDraft = draftOptions(s, rng);
  log(s, `🎖️ Hall of Fame induction #${s.ascensions}: +${gain} Legacy Points. Rebuild your lineup!`);
  return gain;
}

/** Draft: pick-1-of-N unowned athletes, weighted to the upcoming 3 featured sports. */
export function draftOptions(s: GameState, rng: () => number): Athlete[] {
  const n = 3 + (s.legacyTree.draft ?? 0);
  const upcoming = [0, 1, 2].map((i) => featuredSport(s.champTier + i));
  const owned = new Set(s.athletes.map((a) => a.id));
  const maxGrade = Math.min(GRADES.length - 1, 2 + Math.floor(s.ascensions / 3));
  const out: Athlete[] = [];
  for (let i = 0; i < n; i++) {
    const sport = upcoming[i % upcoming.length];
    const gradeIdx = Math.min(maxGrade, Math.floor(rng() * (maxGrade + 1)));
    let pool = CATALOG.filter((t) => !owned.has(t.id) && t.grade === GRADES[gradeIdx] && (t.ratings[sport] ?? 0) > 0);
    if (!pool.length) pool = CATALOG.filter((t) => !owned.has(t.id) && (t.ratings[sport] ?? 0) > 0);
    if (!pool.length) break;
    const t = pick(rng, pool);
    owned.add(t.id);
    out.push(instantiate(t));
  }
  return out;
}

export function pickDraft(s: GameState, id: string | null): boolean {
  if (!s.pendingDraft) return false;
  const a = s.pendingDraft.find((x) => x.id === id);
  if (a && !s.athletes.some((x) => x.id === a.id)) s.athletes.push(a);
  s.pendingDraft = null;
  return true;
}

// ───────────────────────── Helpers for UI ─────────────────────────

export function upcomingSports(s: GameState, n = 3): { tier: number; sport: Sport }[] {
  return Array.from({ length: n }, (_, i) => ({ tier: s.champTier + i, sport: featuredSport(s.champTier + i) }));
}

export function bestInSport(s: GameState, sport: Sport): Athlete[] {
  return [...s.athletes].sort((a, b) => athleteRating(b, sport) - athleteRating(a, sport));
}

export { SPORTS, CATALOG_BY_ID };
