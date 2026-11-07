import type { GameState } from './types';
import { SPORTS } from './types';

/**
 * Progressive onboarding. The game starts as "buy Seating, watch cash go up" and layers in one
 * mechanic at a time. Each feature unlocks once (stored in s.unlocked) and stays unlocked forever,
 * including across ascensions.
 */
export type Feature =
  | 'training' | 'maxbuy' | 'train' | 'jumbotron' | 'office' | 'venues' | 'special'
  | 'playoffs' | 'roster' | 'scouting' | 'modifiers' | 'tradeDeadline' | 'legacy' | 'presets' | 'mutators';

export type Tab = 'arena' | 'train' | 'playoffs' | 'roster' | 'office';

export interface FeatureDef {
  id: Feature;
  icon: string;
  title: string;
  /** Explanation shown once, when the feature unlocks. */
  intro: string[];
  /** Tab to jump to from the unlock popup. */
  tab?: Tab;
  /** Short goal text shown in the "Next unlock" bar before it unlocks. */
  goal: string;
  /** 0..1 progress toward unlocking. Unlocks at >= 1. */
  progress: (s: GameState) => number;
  /** Optional: don't show as the next goal until this feature is unlocked. */
  after?: Feature;
  /** If true, unlocks silently (no popup). */
  quiet?: boolean;
}

export function facilityLevels(s: GameState): number {
  return SPORTS.reduce((acc, sp) => acc + Object.values(s.facilities[sp] ?? {}).reduce((a, b) => a + b, 0), 0);
}

const lvl = (s: GameState, id: string) => s.facilities.basketball?.[id] ?? 0;
const frac = (x: number, of: number) => Math.min(1, x / of);

/** Ordered roughly by when a new player reaches them. */
export const FEATURES: FeatureDef[] = [
  {
    id: 'training', icon: '🏋️', title: 'Training Room', tab: 'arena',
    goal: 'Upgrade Seating to level 3', progress: (s) => frac(lvl(s, 'seating'), 3),
    intro: ['Your players now run more plays per second.', 'More plays means more cash. Seating makes each play worth more; the Training Room makes plays happen faster.']
  },
  {
    id: 'maxbuy', icon: '⏩', title: 'Buy Max', quiet: true,
    goal: 'Upgrade Seating to level 5', progress: (s) => frac(lvl(s, 'seating'), 5), intro: []
  },
  {
    id: 'train', icon: '⏱️', title: 'Practice Field', tab: 'train',
    goal: 'Buy 8 upgrades', progress: (s) => frac(facilityLevels(s), 8),
    intro: [
      'Play a quick 30-second drill to boost your income.',
      'Each drill costs ⚡ energy, which refills over time. Score higher to earn a better medal and a bigger, longer boost.'
    ]
  },
  {
    id: 'jumbotron', icon: '📺', title: 'Jumbotron', tab: 'arena', after: 'train',
    goal: 'Play your first drill', progress: (s) => frac(s.stats.minigames, 1),
    intro: ['Some plays are now highlight-reel crits that pay ×4.', 'The Jumbotron raises your crit chance.']
  },
  {
    id: 'modifiers', icon: '🔥', title: 'Drill Modifiers', tab: 'train', after: 'train',
    goal: 'Play 3 drills', progress: (s) => frac(s.stats.minigames, 3),
    intro: ['Some drill cards now come with a twist:', '🔥 Hot Streak gives a stronger boost. ⚔️ Rivalry is harder but pays Scout Tokens. 📣 Fan Day pays Fans instead of a boost.']
  },
  {
    id: 'office', icon: '📋', title: 'Coaching Staff', tab: 'office', after: 'jumbotron',
    goal: 'Collect 10 Fans', progress: (s) => frac(s.fans, 10),
    intro: [
      'Winning games earns 📣 Fans over time.',
      'Spend Fans in the Office to hire coaches who boost every venue at once.'
    ]
  },
  {
    id: 'venues', icon: '🏟️', title: 'New Venues', tab: 'arena', after: 'office',
    goal: 'Buy 12 upgrades', progress: (s) => frac(facilityLevels(s), 12),
    intro: ['You can build a second venue to earn from a new sport.', 'Each sport earns differently, and each venue has its own upgrades.']
  },
  {
    id: 'playoffs', icon: '🏆', title: 'The Playoffs', tab: 'playoffs', after: 'office',
    goal: 'Buy 20 upgrades', progress: (s) => frac(facilityLevels(s), 20),
    intro: [
      'Every so often your team can make a run at the championship.',
      'The Readiness bar fills over time. When it\'s full, enter a 4-round bracket. Your team power decides most of each game, and a few clutch moments let you swing the odds.',
      'Win titles to earn 🏆 Trophies and permanent bonuses.'
    ]
  },
  {
    id: 'roster', icon: '🃏', title: 'Your Roster', tab: 'roster', after: 'playoffs',
    goal: 'Unlock the Playoffs', progress: (s) => (s.unlocked.includes('playoffs') ? 1 : 0),
    intro: [
      'These athletes are your lineup. Each one is rated per sport.',
      'Team power in the playoffs comes from your lineup\'s ratings in that sport. Athletes in your lineup also boost income and level up over time.'
    ]
  },
  {
    id: 'special', icon: '✨', title: 'Signature Plays', tab: 'arena', after: 'venues',
    goal: 'Open a second venue', progress: (s) => frac(s.venuesUnlocked.length - 1, 1),
    intro: ['Each sport has a signature mechanic, such as Possession in Soccer or Power Plays in Hockey.', 'Signature Play upgrades make it stronger.']
  },
  {
    id: 'scouting', icon: '🎟️', title: 'Scouting', tab: 'roster', after: 'playoffs',
    goal: 'Play your first playoff game', progress: (s) => frac(s.stats.playoffGames ?? 0, 1),
    intro: [
      'Spend 🎟️ Scout Tokens to sign new athletes.',
      'Higher grades are rarer. MVPs play 2 sports, Legends 3, and GOATs all 5. Duplicates become 💠 Shards that star up the athlete you already have.',
      'Playoff wins and good drills earn more tokens.'
    ]
  },
  {
    id: 'tradeDeadline', icon: '🔒', title: 'Lineup Lock', tab: 'roster', after: 'scouting', quiet: true,
    goal: 'Play your first playoff game', progress: (s) => frac(s.stats.playoffGames ?? 0, 1), intro: []
  },
  {
    id: 'legacy', icon: '⭐', title: 'Ascension', tab: 'office', after: 'scouting',
    goal: 'Win your first championship', progress: (s) => frac(s.bestTier, 1),
    intro: [
      'Champions can be inducted into the Hall of Fame.',
      'Ascending resets your cash, venues and coaches but earns 🎖️ Legacy Points for permanent upgrades. You keep every athlete, and your lineup unlocks so you can rebuild it.',
      'The playoff sport rotates every tier. When your lineup stops winning, it\'s time to ascend.'
    ]
  },
  {
    id: 'presets', icon: '💾', title: 'Lineup Presets', after: 'legacy', quiet: true,
    goal: 'Ascend once', progress: (s) => frac(s.ascensions, 1), intro: []
  },
  {
    id: 'mutators', icon: '🎲', title: 'Season Mutators', after: 'legacy', quiet: true,
    goal: 'Ascend once', progress: (s) => frac(s.ascensions, 1), intro: []
  }
];

export const FEATURES_BY_ID = Object.fromEntries(FEATURES.map((f) => [f.id, f])) as Record<Feature, FeatureDef>;

export const ALL_FEATURES = FEATURES.map((f) => f.id);

export function has(s: GameState, f: Feature): boolean {
  return s.unlocked.includes(f);
}

export function tabUnlocked(s: GameState, tab: Tab): boolean {
  if (tab === 'arena') return true;
  if (tab === 'office') return has(s, 'office');
  return has(s, tab as Feature);
}

/** Unlock any features whose conditions are met. Returns the newly unlocked ones (in order). */
export function checkUnlocks(s: GameState): FeatureDef[] {
  const out: FeatureDef[] = [];
  for (const f of FEATURES) {
    if (s.unlocked.includes(f.id)) continue;
    if (f.after && !s.unlocked.includes(f.after)) continue;
    if (f.progress(s) >= 1) {
      s.unlocked.push(f.id);
      out.push(f);
    }
  }
  return out;
}

/** The next feature to show in the "Next unlock" bar (skips quiet ones). */
export function nextGoal(s: GameState): FeatureDef | null {
  for (const f of FEATURES) {
    if (f.quiet || s.unlocked.includes(f.id)) continue;
    if (f.after && !s.unlocked.includes(f.after)) continue;
    return f;
  }
  return null;
}

/** Saves from before onboarding existed: unlock what a player at that point has already seen. */
export function backfillUnlocks(s: GameState) {
  const veteran = s.ascensions > 0 || s.bestTier > 0 || s.stats.titles > 0;
  if (veteran) {
    s.unlocked = [...ALL_FEATURES];
    return;
  }
  checkUnlocks(s);
}
