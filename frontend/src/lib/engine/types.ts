export type Sport = 'gridiron' | 'soccer' | 'basketball' | 'baseball' | 'hockey';
export const SPORTS: Sport[] = ['gridiron', 'soccer', 'basketball', 'baseball', 'hockey'];

export type Grade = 'rookie' | 'pro' | 'allstar' | 'mvp' | 'legend' | 'goat';
export const GRADES: Grade[] = ['rookie', 'pro', 'allstar', 'mvp', 'legend', 'goat'];

export type Archetype = 'speedster' | 'enforcer' | 'playmaker' | 'sniper' | 'ironman';

/** Idle stat a boost / archetype can amplify. */
export type BoostStat = 'value' | 'pace' | 'crit' | 'special' | 'fans';

export type Medal = 'none' | 'bronze' | 'silver' | 'gold' | 'platinum';

export type Currency = 'cash' | 'fans' | 'trophies' | 'legacy' | 'tokens' | 'shards';

export interface Athlete {
  id: string;
  name: string;
  grade: Grade;
  archetype: Archetype;
  /** Rating per sport at ★0, level 1. Missing sport = 0. */
  ratings: Partial<Record<Sport, number>>;
  primary: Sport;
  traits: string[];
  stars: number; // 0..5
  level: number; // 1..cap
  xp: number;
  /** Runs (ascensions) this athlete has been in the lineup — fuels "late bloomer". */
  seasons: number;
}

export interface Boost {
  stat: BoostStat;
  mult: number; // e.g. 1.5 = +50%
  expiresAt: number; // epoch ms
}

export interface MiniGameCard {
  variant: string; // minigame id
  sport: Sport;
  stat: BoostStat;
  modifier: 'none' | 'hotstreak' | 'rivalry' | 'fanday';
}

export interface PlayoffRun {
  tier: number;
  sport: Sport;
  round: number; // 0..3
  seed: number;
  results: ('W' | 'L')[];
  active: boolean;
}

export interface GameState {
  version: number;
  createdAt: number;
  lastTick: number;
  lastSeen: number;

  cash: number;
  fans: number;
  trophies: number; // spendable trophies (lifetime count tracked separately)
  lifetimeTrophies: number;
  legacy: number; // unspent LP
  tokens: number;
  shards: number;

  /** Per run */
  runCash: number; // cash earned this run
  runFans: number;
  runTrophies: number;
  runBestTier: number; // highest tier won this run
  champTier: number; // next championship tier to attempt (1-based)
  bestTier: number; // highest tier ever won
  readiness: number; // 0..1 playoff readiness
  venuesUnlocked: Sport[];
  facilities: Record<Sport, Record<string, number>>;
  coaching: Record<string, number>;
  mutator: string | null;

  /** Permanent */
  legacyTree: Record<string, number>;
  titles: Record<Sport, number>; // championships won per sport (perm multiplier)
  ascensions: number;
  athletes: Athlete[];
  lineup: string[]; // athlete ids
  lineupLocked: boolean;
  presets: string[][];
  scoutPity: { mvp: number; legend: number };
  pendingDraft: Athlete[] | null; // pick-1-of-3 after ascension

  energy: number;
  energyAt: number; // epoch ms of last energy regen accounting
  boosts: Boost[];
  hand: MiniGameCard[] | null;
  medalStreak: { day: string; count: number };
  minigameBest: Record<string, number>;

  playoff: PlayoffRun | null;

  stats: { plays: number; minigames: number; titles: number; pulls: number };
  log: { t: number; msg: string }[];
}
