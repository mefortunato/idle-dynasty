import type { Archetype, BoostStat, Grade, Sport } from './types';

// ───────────────────────── Sports / venues ─────────────────────────

export interface SportDef {
  id: Sport;
  name: string;
  emoji: string;
  color: string;
  /** Base plays per second of the idle sim. */
  pace: number;
  /** Base cash per play. */
  value: number;
  /** Name + description of the venue-specific mechanic (the `special` stat). */
  special: { name: string; desc: string };
  /** Cash cost to unlock the venue (0 = starter). */
  unlockCost: number;
  /** Facility cost multiplier for this venue. */
  costMult: number;
  /** Words used by the idle play-by-play ticker. */
  plays: string[];
  bigPlay: string;
}

export const SPORT_DEFS: Record<Sport, SportDef> = {
  basketball: {
    id: 'basketball', name: 'Basketball', emoji: '🏀', color: '#f08a24',
    pace: 1.2, value: 1, unlockCost: 0, costMult: 1,
    special: { name: 'Pace', desc: 'Highest plays per second. Special boosts add even more tempo.' },
    plays: ['Layup', 'Jumper', 'Free throw', 'Floater', 'Putback'], bigPlay: 'DUNK!'
  },
  soccer: {
    id: 'soccer', name: 'Soccer', emoji: '⚽', color: '#2fb55d',
    pace: 0.8, value: 8, unlockCost: 5_000, costMult: 10,
    special: { name: 'Possession', desc: 'Long possessions build into goal bursts worth extra.' },
    plays: ['Short pass', 'Overlap', 'Switch of play', 'Cross', 'Corner'], bigPlay: 'GOAL!'
  },
  gridiron: {
    id: 'gridiron', name: 'Gridiron', emoji: '🏈', color: '#a0522d',
    pace: 0.5, value: 250, unlockCost: 2_000_000, costMult: 300,
    special: { name: 'Drive Length', desc: 'Fewer, bigger payouts. Touchdowns pay out the whole drive.' },
    plays: ['Run up the middle', 'Slant', 'Screen pass', 'Play action', 'Option'], bigPlay: 'TOUCHDOWN!'
  },
  baseball: {
    id: 'baseball', name: 'Baseball', emoji: '⚾', color: '#d64545',
    pace: 0.7, value: 40_000, unlockCost: 1_000_000_000, costMult: 50_000,
    special: { name: 'Rally Chain', desc: 'Crits can chain into multi-run rallies.' },
    plays: ['Single', 'Walk', 'Double', 'Sac fly', 'Stolen base'], bigPlay: 'HOME RUN!'
  },
  hockey: {
    id: 'hockey', name: 'Hockey', emoji: '🏒', color: '#3b82f6',
    pace: 1.0, value: 15_000_000, unlockCost: 1_000_000_000_000, costMult: 20_000_000,
    special: { name: 'Power Play', desc: 'Periodic power plays multiply output.' },
    plays: ['Zone entry', 'Cycle', 'One-timer', 'Wrist shot', 'Deflection'], bigPlay: 'GOAL! 🚨'
  }
};

/** Venue unlock order == championship rotation order. */
export const SPORT_ORDER: Sport[] = ['basketball', 'soccer', 'gridiron', 'baseball', 'hockey'];

export function featuredSport(tier: number): Sport {
  return SPORT_ORDER[(tier - 1) % SPORT_ORDER.length];
}

// ───────────────────────── Facilities (cash, per venue) ─────────────────────────

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  base: number;
  growth: number;
  max?: number;
}

export const FACILITIES: UpgradeDef[] = [
  { id: 'seating', name: 'Seating', desc: '+25% play value. ×2 every 25 levels.', base: 10, growth: 1.15 },
  { id: 'training', name: 'Training Room', desc: '+6% plays/sec.', base: 40, growth: 1.18 },
  { id: 'jumbotron', name: 'Jumbotron', desc: '+0.8% crit chance (crits pay ×4).', base: 150, growth: 1.22, max: 60 },
  { id: 'special', name: 'Signature Play', desc: '+8% venue special mechanic strength.', base: 500, growth: 1.2 }
];

// ───────────────────────── Coaching (fans, global) ─────────────────────────

export const COACHING: UpgradeDef[] = [
  { id: 'offense', name: 'Offensive Coordinator', desc: '+15% cash in all venues.', base: 5, growth: 1.22 },
  { id: 'tempo', name: 'Tempo Coach', desc: '+4% plays/sec in all venues.', base: 10, growth: 1.25 },
  { id: 'analytics', name: 'Analytics Dept', desc: '+0.25 crit multiplier.', base: 25, growth: 1.3, max: 40 },
  { id: 'strength', name: 'Strength & Conditioning', desc: '+5% team power in the playoffs.', base: 15, growth: 1.45, max: 20 },
  { id: 'broadcast', name: 'Broadcast Deal', desc: '+20 min offline cap, +2% offline efficiency.', base: 20, growth: 1.35, max: 25 },
  { id: 'marketing', name: 'Marketing', desc: '+10% fan gain.', base: 30, growth: 1.28 },
  { id: 'scouting', name: 'Scouting Network', desc: '+10% Scout Tokens from playoffs.', base: 50, growth: 1.4, max: 20 }
];

// ───────────────────────── Legacy tree (LP, permanent) ─────────────────────────

export interface LegacyDef extends UpgradeDef {
  branch: 'Front Office' | 'Scouting Dept' | 'Training Staff' | 'Playoff Experience' | 'Media Empire';
}

export const LEGACY: LegacyDef[] = [
  { branch: 'Front Office', id: 'cash', name: 'Deep Pockets', desc: '×1.3 cash (compounding).', base: 1, growth: 1.45 },
  { branch: 'Front Office', id: 'start', name: 'Signing Bonus', desc: 'Start each run with 10× more cash (100 → …).', base: 2, growth: 2.2, max: 10 },
  { branch: 'Front Office', id: 'autobuy', name: 'General Manager', desc: 'Automatically buys the cheapest facility upgrade.', base: 15, growth: 1, max: 1 },
  { branch: 'Scouting Dept', id: 'slots', name: 'Expanded Roster', desc: '+1 lineup slot.', base: 3, growth: 3, max: 5 },
  { branch: 'Scouting Dept', id: 'luck', name: 'Eye for Talent', desc: '+12% odds of MVP grade or better.', base: 4, growth: 1.8, max: 10 },
  { branch: 'Scouting Dept', id: 'draft', name: 'Draft War Room', desc: '+1 draft pick option after ascending.', base: 8, growth: 3, max: 2 },
  { branch: 'Training Staff', id: 'energy', name: 'Deep Bench', desc: '+1 max energy.', base: 2, growth: 2, max: 5 },
  { branch: 'Training Staff', id: 'regen', name: 'Recovery Lab', desc: '−10% energy regen time.', base: 3, growth: 1.9, max: 5 },
  { branch: 'Training Staff', id: 'duration', name: 'Film Study', desc: '+15% mini game boost duration.', base: 2, growth: 1.6, max: 10 },
  { branch: 'Training Staff', id: 'cards', name: 'Extra Drill', desc: 'Draw a 4th mini game card.', base: 20, growth: 1, max: 1 },
  { branch: 'Playoff Experience', id: 'timeouts', name: 'Timeouts', desc: '+1 timeout per playoff run (retry a clutch moment).', base: 3, growth: 3, max: 3 },
  { branch: 'Playoff Experience', id: 'floor', name: 'Veteran Core', desc: '+10% Legacy Floor (restart closer to your best tier).', base: 5, growth: 2.2, max: 4 },
  { branch: 'Playoff Experience', id: 'clutch', name: 'Clutch Gene', desc: '+1% win prob per clutch moment.', base: 4, growth: 2, max: 5 },
  { branch: 'Playoff Experience', id: 'readiness', name: 'Hungry', desc: '+25% playoff readiness speed.', base: 2, growth: 1.8, max: 6 },
  { branch: 'Playoff Experience', id: 'power', name: 'Dynasty DNA', desc: '×1.15 team power (compounding).', base: 2, growth: 1.6 },
  { branch: 'Media Empire', id: 'offline', name: 'Streaming Rights', desc: '+2h offline cap.', base: 2, growth: 1.7, max: 11 },
  { branch: 'Media Empire', id: 'efficiency', name: 'Highlight Reels', desc: '+5% offline efficiency.', base: 2, growth: 1.7, max: 10 },
  { branch: 'Media Empire', id: 'fans', name: 'Global Brand', desc: '×1.25 fan gain (compounding).', base: 1, growth: 1.5 }
];

export function upgradeCost(def: UpgradeDef, level: number, mult = 1): number {
  return Math.ceil(def.base * mult * Math.pow(def.growth, level));
}

// ───────────────────────── Run mutators ─────────────────────────

export interface MutatorDef {
  id: string;
  name: string;
  desc: string;
  cash: number;
  lp: number;
  power: number;
}

export const MUTATORS: MutatorDef[] = [
  { id: 'none', name: 'Standard Season', desc: 'No modifiers.', cash: 1, lp: 1, power: 1 },
  { id: 'smallmarket', name: 'Small Market', desc: '−30% cash, +50% Legacy Points.', cash: 0.7, lp: 1.5, power: 1 },
  { id: 'rebuild', name: 'Rebuilding Year', desc: '−20% team power, +35% Legacy Points.', cash: 1, lp: 1.35, power: 0.8 },
  { id: 'bigspender', name: 'Big Spender', desc: '+50% cash, −25% Legacy Points.', cash: 1.5, lp: 0.75, power: 1 },
  { id: 'underdog', name: 'Underdog Story', desc: '−40% cash, +20% team power, +20% LP.', cash: 0.6, lp: 1.2, power: 1.2 }
];

// ───────────────────────── Athletes ─────────────────────────

export interface GradeDef {
  id: Grade;
  name: string;
  color: string;
  ratingMin: number;
  ratingMax: number;
  /** Secondary sport rating as fraction of primary. */
  secondary: number[];
  traits: number;
  odds: number; // relative weight
  starCost: number; // shards per star step (× next star)
  dupeShards: number;
  count: number; // templates in catalog
}

export const GRADE_DEFS: Record<Grade, GradeDef> = {
  rookie: { id: 'rookie', name: 'Rookie', color: '#9ca3af', ratingMin: 10, ratingMax: 25, secondary: [], traits: 0, odds: 500, starCost: 5, dupeShards: 4, count: 25 },
  pro: { id: 'pro', name: 'Pro', color: '#34d399', ratingMin: 20, ratingMax: 40, secondary: [], traits: 1, odds: 300, starCost: 10, dupeShards: 8, count: 25 },
  allstar: { id: 'allstar', name: 'All-Star', color: '#60a5fa', ratingMin: 35, ratingMax: 60, secondary: [], traits: 1, odds: 140, starCost: 20, dupeShards: 16, count: 20 },
  mvp: { id: 'mvp', name: 'MVP', color: '#c084fc', ratingMin: 55, ratingMax: 80, secondary: [0.6], traits: 2, odds: 50, starCost: 40, dupeShards: 32, count: 15 },
  legend: { id: 'legend', name: 'Legend', color: '#fbbf24', ratingMin: 75, ratingMax: 95, secondary: [0.7, 0.5], traits: 2, odds: 9, starCost: 80, dupeShards: 64, count: 10 },
  goat: { id: 'goat', name: 'GOAT', color: '#f43f5e', ratingMin: 90, ratingMax: 120, secondary: [0.75, 0.7, 0.6, 0.55], traits: 3, odds: 1, starCost: 160, dupeShards: 128, count: 5 }
};

export const ARCHETYPES: Record<Archetype, { name: string; stat: BoostStat; emoji: string; desc: string }> = {
  speedster: { name: 'Speedster', stat: 'pace', emoji: '💨', desc: 'Boosts plays/sec' },
  sniper: { name: 'Sniper', stat: 'crit', emoji: '🎯', desc: 'Boosts crit chance' },
  enforcer: { name: 'Enforcer', stat: 'special', emoji: '🛡️', desc: 'Boosts venue specials' },
  playmaker: { name: 'Playmaker', stat: 'value', emoji: '🧠', desc: 'Boosts play value' },
  ironman: { name: 'Iron Man', stat: 'fans', emoji: '🔋', desc: 'Boosts fans and offline gains' }
};

export interface TraitDef {
  id: string;
  name: string;
  desc: string;
}

export const TRAITS: Record<string, TraitDef> = {
  ice_veins: { id: 'ice_veins', name: 'Ice Veins', desc: 'Wider timing windows in this sport\'s mini games and clutch moments.' },
  showtime: { id: 'showtime', name: 'Showtime', desc: '+1 crit multiplier in primary sport venue.' },
  hometown: { id: 'hometown', name: 'Hometown Hero', desc: '+15% fan gain.' },
  late_bloomer: { id: 'late_bloomer', name: 'Late Bloomer', desc: '+6% rating per season in your lineup (max +60%).' },
  two_way: { id: 'two_way', name: 'Two-Way', desc: 'Counts twice for chemistry.' },
  workhorse: { id: 'workhorse', name: 'Workhorse', desc: '+75% XP gain.' },
  big_stage: { id: 'big_stage', name: 'Big Stage', desc: '+12% playoff power.' },
  franchise: { id: 'franchise', name: 'Franchise Player', desc: '+12% cash in all venues.' },
  quick_study: { id: 'quick_study', name: 'Quick Study', desc: '+20% mini game boost duration.' },
  iron_lungs: { id: 'iron_lungs', name: 'Iron Lungs', desc: '+6% offline efficiency.' }
};

// ───────────────────────── Scouting ─────────────────────────

export const PACK_COST = 10;
export const FOCUS_PACK_COST = 15;
export const PITY = { mvp: 40, legend: 150 };

// ───────────────────────── Mini games ─────────────────────────

export const MEDALS = {
  bronze: { min: 250, mult: 1.25, minutes: 10, tokens: 0 },
  silver: { min: 500, mult: 1.5, minutes: 15, tokens: 0 },
  gold: { min: 750, mult: 2, minutes: 20, tokens: 0 },
  platinum: { min: 920, mult: 3, minutes: 30, tokens: 1 }
} as const;

export const BOOST_LABEL: Record<BoostStat, string> = {
  value: 'Play Value',
  pace: 'Pace',
  crit: 'Crit Chance',
  special: 'Venue Special',
  fans: 'Fan Gain'
};

export const BASE_ENERGY = 5;
export const ENERGY_REGEN_MS = 20 * 60 * 1000;
export const MINIGAME_MS = 30_000;
export const CLUTCH_MS = 8_000;

// ───────────────────────── Playoffs ─────────────────────────

export const READINESS_SECONDS = 30 * 60;
export const ROUND_NAMES = ['Quarterfinal', 'Semifinal', 'Conference Final', 'Championship'];
export const ROUND_MULT = [1, 1.1, 1.2, 1.35];
export const CLUTCH_PER_GAME = 3;
