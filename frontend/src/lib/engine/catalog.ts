import { GRADE_DEFS, TRAITS } from './data';
import { mulberry32, pick, shuffle } from './rng';
import type { Archetype, Athlete, Grade, Sport } from './types';
import { GRADES, SPORTS } from './types';

/**
 * The athlete catalog is generated deterministically from a fixed seed so that every
 * client (and the server) agree on the same 100 fictional athletes. Pulling an athlete
 * you already own yields Training Shards instead.
 */
const FIRST = ['Ace', 'Bo', 'Cal', 'Dante', 'Eli', 'Finn', 'Gus', 'Hank', 'Iggy', 'Jax', 'Kai', 'Leo', 'Milo', 'Nico', 'Otis', 'Pax', 'Quinn', 'Rex', 'Sol', 'Theo', 'Uri', 'Vic', 'Wes', 'Xavi', 'Yuri', 'Zeke', 'Ava', 'Bree', 'Cleo', 'Dee', 'Eve', 'Faye', 'Gia', 'Ivy', 'Jo', 'Kit', 'Lux', 'Mae', 'Nova', 'Remy', 'Sky', 'Tess', 'Wren', 'Zara', 'Ronan', 'Mateo', 'Tariq', 'Desmond', 'Kenji', 'Amara'];
const LAST = ['Blaze', 'Stone', 'Rivers', 'Cross', 'Hart', 'Knox', 'Vance', 'Steele', 'Frost', 'Ward', 'Locke', 'Banks', 'Cole', 'Drake', 'Fox', 'Gale', 'Hale', 'Irons', 'Jett', 'Kane', 'Lyle', 'Marsh', 'North', 'Oakes', 'Price', 'Reyes', 'Sato', 'Thorne', 'Vega', 'West', 'Young', 'Zane', 'Okafor', 'Kowalski', 'Lindqvist', 'Moreau', 'Nakamura', 'Ferreira', 'Mbeki', 'Castillo'];
const NICK = ['"The Wall"', '"Showtime"', '"Ice"', '"Rocket"', '"Ghost"', '"Thunder"', '"Prime"', '"Maestro"', '"Tank"', '"Flash"'];
const ARCHES: Archetype[] = ['speedster', 'enforcer', 'playmaker', 'sniper', 'ironman'];

export interface AthleteTemplate {
  id: string;
  name: string;
  grade: Grade;
  archetype: Archetype;
  primary: Sport;
  ratings: Partial<Record<Sport, number>>;
  traits: string[];
}

function build(): AthleteTemplate[] {
  const rng = mulberry32(0xd1a5);
  const used = new Set<string>();
  const out: AthleteTemplate[] = [];
  const traitIds = Object.keys(TRAITS);
  for (const grade of GRADES) {
    const g = GRADE_DEFS[grade];
    for (let i = 0; i < g.count; i++) {
      const primary = SPORTS[i % SPORTS.length];
      let name = '';
      do {
        name = `${pick(rng, FIRST)} ${pick(rng, LAST)}`;
        if ((grade === 'legend' || grade === 'goat') && rng() < 0.6) {
          const parts = name.split(' ');
          name = `${parts[0]} ${pick(rng, NICK)} ${parts[1]}`;
        }
      } while (used.has(name));
      used.add(name);
      const base = Math.round(g.ratingMin + rng() * (g.ratingMax - g.ratingMin));
      const ratings: Partial<Record<Sport, number>> = { [primary]: base };
      const others = shuffle(rng, SPORTS.filter((s) => s !== primary));
      g.secondary.forEach((frac, k) => {
        ratings[others[k]] = Math.round(base * frac * (0.9 + rng() * 0.2));
      });
      const traits = shuffle(rng, traitIds).slice(0, g.traits);
      out.push({
        id: `${grade}-${i}`,
        name,
        grade,
        archetype: ARCHES[Math.floor(rng() * ARCHES.length)],
        primary,
        ratings,
        traits
      });
    }
  }
  return out;
}

export const CATALOG: AthleteTemplate[] = build();
export const CATALOG_BY_ID: Record<string, AthleteTemplate> = Object.fromEntries(CATALOG.map((t) => [t.id, t]));

export function instantiate(t: AthleteTemplate): Athlete {
  return {
    id: t.id,
    name: t.name,
    grade: t.grade,
    archetype: t.archetype,
    ratings: { ...t.ratings },
    primary: t.primary,
    traits: [...t.traits],
    stars: 0,
    level: 1,
    xp: 0,
    seasons: 0
  };
}

/** Starter roster: one rookie per sport. */
export const STARTERS = SPORTS.map((s) => CATALOG.find((t) => t.grade === 'rookie' && t.primary === s)!.id);
