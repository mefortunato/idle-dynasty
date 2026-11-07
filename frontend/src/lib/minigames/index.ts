import type { MiniGameFactory } from '$lib/engine/minigame-api';

/** Lazy loaders for each mini game variant (ids match $lib/engine/variants.ts). */
export const LOADERS: Record<string, () => Promise<{ default: MiniGameFactory }>> = {
  'qb-read': () => import('./qb-read'),
  'field-goal': () => import('./field-goal'),
  'juke-runner': () => import('./juke-runner'),
  'penalty-shootout': () => import('./penalty-shootout'),
  'keepy-uppy': () => import('./keepy-uppy'),
  'through-ball': () => import('./through-ball'),
  'free-throw': () => import('./free-throw'),
  'three-point': () => import('./three-point'),
  'fast-break': () => import('./fast-break'),
  'batting-cage': () => import('./batting-cage'),
  'paint-corner': () => import('./paint-corner'),
  'shoestring-catch': () => import('./shoestring-catch'),
  'slapshot': () => import('./slapshot'),
  'goalie-reflex': () => import('./goalie-reflex'),
  'stickhandling': () => import('./stickhandling')
};

export async function loadMiniGame(id: string): Promise<MiniGameFactory> {
  const l = LOADERS[id];
  if (!l) throw new Error(`Unknown mini game ${id}`);
  return (await l()).default;
}
