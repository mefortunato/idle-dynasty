<script lang="ts">
  import { game } from '$lib/game.svelte';
  import { fmt } from '$lib/engine/format';
  import { totalCps, fansPerSec } from '$lib/engine/formulas';
  import { BOOST_LABEL } from '$lib/engine/data';
  import { fmtTime } from '$lib/engine/format';
  import { has } from '$lib/engine/progression';

  let { onSettings }: { onSettings: () => void } = $props();
  const s = $derived(game.s);
  const cps = $derived(totalCps(s, game.now));
  const fps = $derived(fansPerSec(s, game.now));
  const boosts = $derived(s.boosts.filter((b) => b.expiresAt > game.now));
</script>

<header>
  <div class="money">
    <div class="cash display num">💵 {fmt(s.cash)}</div>
    <div class="rate small muted num grow">+{fmt(cps)}/s</div>
    <button class="gear" aria-label="Settings" onclick={onSettings}>⚙️</button>
  </div>
  {#if has(s, 'office')}
    <div class="cur">
      <span class="pill num" title="Fans">📣 {fmt(s.fans)} <span class="muted">+{fmt(fps)}/s</span></span>
      {#if has(s, 'playoffs')}<span class="pill num" title="Trophies">🏆 {fmt(s.trophies)}</span>{/if}
      {#if has(s, 'scouting')}<span class="pill num" title="Scout Tokens">🎟️ {fmt(s.tokens)}</span>{/if}
      {#if has(s, 'legacy') && (s.legacy > 0 || s.ascensions > 0)}<span class="pill num" title="Legacy Points">🎖️ {fmt(s.legacy)}</span>{/if}
    </div>
  {/if}
  {#if boosts.length}
    <div class="boosts">
      {#each boosts as b}
        <span class="boost tiny num">⚡ {BOOST_LABEL[b.stat]} ×{b.mult.toFixed(2)} · {fmtTime(b.expiresAt - game.now)}</span>
      {/each}
    </div>
  {/if}
</header>

<style>
  header {
    position: sticky; top: 0; z-index: 10; padding: calc(8px + env(safe-area-inset-top)) 12px 8px;
    background: linear-gradient(180deg, var(--bg) 70%, rgba(11, 18, 32, 0.85));
    border-bottom: 1px solid var(--line);
  }
  .money { display: flex; align-items: baseline; gap: 10px; }
  .gear { background: transparent; font-size: 20px; padding: 4px 6px; align-self: center; }
  .cash { font-size: 28px; color: var(--gold); line-height: 1.1; }
  .cur { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
  .boosts { display: flex; gap: 6px; margin-top: 6px; overflow-x: auto; scrollbar-width: none; }
  .boost { background: rgba(96, 165, 250, 0.15); color: #bcd7ff; border: 1px solid rgba(96, 165, 250, 0.35); padding: 2px 8px; border-radius: 99px; white-space: nowrap; }
</style>
