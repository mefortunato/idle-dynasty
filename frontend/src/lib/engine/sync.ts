import type { GameState } from './types';

/** Progress score used to decide between local and cloud saves on conflict. */
export function progressScore(s: GameState): number {
  return s.ascensions * 1e6 + s.lifetimeTrophies * 10 + s.bestTier * 1000 + Math.log10(1 + s.runCash);
}

/** Should `remote` replace `local`? A more recent deliberate reset always wins; otherwise more progress wins. */
export function preferRemote(remote: GameState, local: GameState): boolean {
  const ra = remote.resetAt ?? 0;
  const la = local.resetAt ?? 0;
  if (ra !== la) return ra > la;
  return progressScore(remote) > progressScore(local);
}
