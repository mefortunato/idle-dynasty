<script lang="ts">
  import { ARCHETYPES, GRADE_DEFS, SPORT_DEFS } from '$lib/engine/data';
  import { athleteRating, athleteSports } from '$lib/engine/formulas';
  import type { Athlete, Sport } from '$lib/engine/types';

  let { a, focus = null, inLineup = false, onclick, compact = false }:
    { a: Athlete; focus?: Sport | null; inLineup?: boolean; onclick?: () => void; compact?: boolean } = $props();
  const g = $derived(GRADE_DEFS[a.grade]);
  const sports = $derived(athleteSports(a));
  const shown = $derived(focus ?? a.primary);
</script>

<button class="ath" class:compact class:on={inLineup} style="--g:{g.color}" {onclick}>
  <div class="top">
    <span class="grade tiny">{g.name}</span>
    {#if a.stars}<span class="tiny stars">{'★'.repeat(a.stars)}</span>{/if}
  </div>
  <div class="ovr display num">{Math.round(athleteRating(a, shown))}</div>
  <div class="sp">{#each sports as sp}<span class:dim={sp !== shown}>{SPORT_DEFS[sp].emoji}</span>{/each}</div>
  <div class="name small">{a.name}</div>
  {#if !compact}<div class="tiny muted">{ARCHETYPES[a.archetype].emoji} {ARCHETYPES[a.archetype].name} · Lv {a.level}</div>{/if}
  {#if inLineup}<span class="badge tiny">IN LINEUP</span>{/if}
</button>

<style>
  .ath {
    position: relative; display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 8px 6px;
    background: linear-gradient(170deg, color-mix(in srgb, var(--g) 22%, var(--card)), var(--card) 65%);
    border: 1px solid color-mix(in srgb, var(--g) 55%, transparent); border-radius: 12px; min-width: 0; width: 100%;
  }
  .ath.on { box-shadow: 0 0 0 2px var(--gold); }
  .top { display: flex; justify-content: space-between; width: 100%; }
  .grade { color: var(--g); font-weight: 700; text-transform: uppercase; }
  .stars { color: var(--gold); }
  .ovr { font-size: 26px; line-height: 1.1; }
  .compact .ovr { font-size: 20px; }
  .sp { font-size: 14px; letter-spacing: 1px; }
  .dim { opacity: 0.45; }
  .name { font-weight: 600; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
  .badge { position: absolute; bottom: -7px; background: var(--gold); color: #1a1205; padding: 0 6px; border-radius: 99px; font-weight: 700; }
</style>
