<script lang="ts">
  import { game } from '$lib/game.svelte';
  import { SPORT_DEFS, featuredSport } from '$lib/engine/data';
  import { nextVenue, unlockVenue } from '$lib/engine/actions';
  import { fmt, pct } from '$lib/engine/format';
  import VenueCard from './VenueCard.svelte';
  import GoalBar from './GoalBar.svelte';
  import { has } from '$lib/engine/progression';

  let { onNav }: { onNav: (t: 'arena' | 'train' | 'playoffs' | 'roster' | 'office') => void } = $props();
  const s = $derived(game.s);
  const nv = $derived(nextVenue(s));
  const feat = $derived(featuredSport(s.champTier));
</script>

<div class="col">
  <GoalBar />
  {#if has(s, 'playoffs') || has(s, 'train')}
  <div class="callouts">
    {#if has(s, 'playoffs')}
    <button class="callout card" onclick={() => onNav('playoffs')}>
      <div class="row">
        <span class="big">{SPORT_DEFS[feat].emoji}</span>
        <div class="grow" style="text-align:left">
          <div class="display">Tier {s.champTier} {SPORT_DEFS[feat].name} Playoffs</div>
          <div class="bar" style="margin-top:4px"><i style="width:{s.readiness * 100}%"></i></div>
        </div>
        <span class="small {s.readiness >= 1 ? 'gold' : 'muted'}">{s.readiness >= 1 ? 'READY!' : pct(s.readiness)}</span>
      </div>
    </button>
    {/if}
    {#if has(s, 'train') && (s.energy > 0 || s.hand)}
      <button class="callout card train" onclick={() => onNav('train')}>
        <span class="big">⏱️</span>
        <span class="display">Train ({s.energy}⚡)</span>
      </button>
    {/if}
  </div>
  {/if}

  {#each s.venuesUnlocked as sport (sport)}
    <VenueCard {sport} />
  {/each}

  {#if nv && has(s, 'venues')}
    {@const def = SPORT_DEFS[nv]}
    <div class="card locked">
      <div class="row">
        <span class="big" style="filter:grayscale(1)">{def.emoji}</span>
        <div class="grow">
          <h3>{def.name} Venue</h3>
          <div class="small muted">{def.special.name}: {def.special.desc}</div>
        </div>
      </div>
      <button class="primary" style="width:100%;margin-top:10px" disabled={s.cash < def.unlockCost}
        onclick={() => game.act((st) => unlockVenue(st, nv))}>
        Build venue · 💵 {fmt(def.unlockCost)}
      </button>
    </div>
  {/if}
</div>

<style>
  .callouts { display: flex; gap: 8px; }
  .callout { flex: 1; text-align: left; padding: 10px 12px; }
  .callout.train { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: 2px; background: linear-gradient(160deg, #1d3b5e, var(--card)); }
  .big { font-size: 28px; }
  .locked { border-style: dashed; opacity: 0.95; }
</style>
