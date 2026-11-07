<script lang="ts">
  import { game } from '$lib/game.svelte';
  import { ascend, buyCoaching, buyLegacy, coachingCost, legacyCost } from '$lib/engine/actions';
  import { COACHING, LEGACY, MUTATORS, SPORT_DEFS } from '$lib/engine/data';
  import { canAscend, legacyFloorTier, legacyGain } from '$lib/engine/formulas';
  import { fmt } from '$lib/engine/format';
  import { leaderboard, setDisplayName, type LeaderRow } from '$lib/api';
  import { SPORTS } from '$lib/engine/types';
  import Modal from './Modal.svelte';
  import { has } from '$lib/engine/progression';

  type Sub = 'coaching' | 'legacy' | 'ascend' | 'records';
  let sub = $state<Sub>('coaching');
  const s = $derived(game.s);
  const gain = $derived(legacyGain(s));
  let confirming = $state(false);
  let mutator = $state('none');
  let dynasty = $state<LeaderRow[] | null>(null);
  let name = $state('');
  let importCode = $state('');
  let msg = $state('');

  const branches = [...new Set(LEGACY.map((l) => l.branch))];

  async function loadBoard() { dynasty = await leaderboard('dynasty'); }
  $effect(() => { if (sub === 'records' && dynasty === null) void loadBoard(); });

  function doAscend() {
    game.act((st) => ascend(st, mutator));
    confirming = false;
    sub = 'legacy';
  }
</script>

<div class="subtabs">
  {#each [['coaching', '📋 Coaching'], ...(has(s, 'legacy') ? [['legacy', '🎖️ Legacy'], ['ascend', '⭐ Ascend']] : []), ['records', '📊 Records']] as [id, label]}
    <button class:sel={sub === id} onclick={() => (sub = id as Sub)}>{label}</button>
  {/each}
</div>

{#if sub === 'coaching'}
  <p class="small muted">Spend 📣 Fans on staff. Coaching resets when you Ascend.</p>
  <div class="col">
    {#each COACHING as c}
      {@const lvl = s.coaching[c.id] ?? 0}
      {@const cost = coachingCost(s, c.id)}
      {@const maxed = c.max !== undefined && lvl >= c.max}
      <div class="up card">
        <div class="grow"><div class="row"><b>{c.name}</b><span class="pill tiny">Lv {lvl}{c.max ? `/${c.max}` : ''}</span></div><div class="tiny muted">{c.desc}</div></div>
        <button class="buy" disabled={maxed || s.fans < cost} onclick={() => game.act((st) => buyCoaching(st, c.id))}>{maxed ? 'MAX' : `📣 ${fmt(cost)}`}</button>
      </div>
    {/each}
  </div>
{:else if sub === 'legacy'}
  <div class="row"><p class="small muted grow">Permanent upgrades bought with Legacy Points.</p><span class="pill num gold">🎖️ {fmt(s.legacy)}</span></div>
  {#each branches as b}
    <div class="section-title"><h3>{b}</h3></div>
    <div class="col">
      {#each LEGACY.filter((l) => l.branch === b) as l}
        {@const lvl = s.legacyTree[l.id] ?? 0}
        {@const cost = legacyCost(s, l.id)}
        {@const maxed = l.max !== undefined && lvl >= l.max}
        <div class="up card">
          <div class="grow"><div class="row"><b>{l.name}</b><span class="pill tiny">Lv {lvl}{l.max ? `/${l.max}` : ''}</span></div><div class="tiny muted">{l.desc}</div></div>
          <button class="buy legacy" disabled={maxed || s.legacy < cost} onclick={() => game.act((st) => buyLegacy(st, l.id))}>{maxed ? 'MAX' : `🎖️ ${fmt(cost)}`}</button>
        </div>
      {/each}
    </div>
  {/each}
{:else if sub === 'ascend'}
  <div class="card asc">
    <h2>Hall of Fame Induction</h2>
    <p class="small muted">Retire this run's front office for permanent Legacy Points. You keep athletes, stars, levels, Legacy upgrades, titles and trophies. Your lineup unlocks so you can rebuild for the upcoming sports.</p>
    <div class="grid2" style="margin:10px 0">
      <div class="stat"><span class="tiny muted">Legacy Points gained</span><span class="display gold num">+{fmt(gain)}</span></div>
      <div class="stat"><span class="tiny muted">Restart at tier</span><span class="display num">{legacyFloorTier(s)}</span></div>
      <div class="stat"><span class="tiny muted">Best tier this run</span><span class="display num">{s.runBestTier}</span></div>
      <div class="stat"><span class="tiny muted">Fans this run</span><span class="display num">{fmt(s.runFans)}</span></div>
    </div>
    <p class="tiny muted">LP grows exponentially with the best tier you win in a run. Reaching just one more tier is worth ~22% more.</p>
    <button class="primary" style="width:100%;padding:14px" disabled={!canAscend(s)} onclick={() => (confirming = true)}>
      {canAscend(s) ? 'Ascend…' : s.playoff?.active ? 'Finish the playoffs first' : 'Win a championship to earn Legacy'}
    </button>
  </div>
  <div class="section-title"><h3>Hall of Fame</h3></div>
  <div class="card small">
    <div>Inductions: <b>{s.ascensions}</b> · Best tier ever: <b>{s.bestTier}</b> · Lifetime 🏆 <b>{fmt(s.lifetimeTrophies)}</b></div>
    <div class="row" style="flex-wrap:wrap;margin-top:6px">
      {#each SPORTS as sp}<span class="pill">{SPORT_DEFS[sp].emoji} {s.titles[sp]} titles</span>{/each}
    </div>
  </div>
{:else}
  <div class="col">
    <div class="card small">
      <h3>Career stats</h3>
      <div>Plays simulated: {fmt(s.stats.plays)}</div>
      <div>Mini games: {s.stats.minigames} · Titles: {s.stats.titles} · Scout pulls: {s.stats.pulls}</div>
      <div class="muted tiny">Cloud sync: {game.synced === 'ok' ? '✅ synced' : game.synced === 'offline' ? '⚠️ offline (saved on this device)' : '…'}</div>
    </div>
    <div class="card">
      <h3>Dynasty leaderboard</h3>
      {#if !dynasty || dynasty.length === 0}<p class="small muted">{dynasty === null ? 'Loading…' : 'No entries yet (or offline).'}</p>{/if}
      {#each dynasty ?? [] as r, i}
        <div class="row lb small"><span class="muted num">{i + 1}.</span><span class="grow">{r.displayName}</span><span class="num">Tier {r.bestTier} · 🏆{fmt(r.lifetimeTrophies ?? 0)}</span></div>
      {/each}
      <div class="row" style="margin-top:8px">
        <input class="grow" placeholder="Coach name" maxlength="20" bind:value={name} />
        <button onclick={async () => { msg = (await setDisplayName(name)) ? 'Name saved!' : 'Name must be 3-20 letters/numbers.'; void loadBoard(); }}>Set</button>
      </div>
    </div>
    <div class="card">
      <h3>Recent events</h3>
      {#each s.log.slice(0, 12) as l}<div class="tiny logl"><span class="muted">{new Date(l.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> {l.msg}</div>{/each}
    </div>
    <div class="card col">
      <h3>Save data</h3>
      <div class="row">
        <button class="grow" onclick={async () => { await navigator.clipboard?.writeText(game.exportSave()); msg = 'Save code copied to clipboard.'; }}>Export</button>
        <button class="grow" onclick={() => { msg = game.importSave(importCode) ? 'Save imported!' : 'Invalid save code.'; }}>Import</button>
      </div>
      <input placeholder="Paste save code to import" bind:value={importCode} />
      <button class="danger" onclick={() => { if (window.confirm('Reset ALL progress? This cannot be undone.')) game.reset(); }}>Hard reset</button>
      {#if msg}<div class="small gold">{msg}</div>{/if}
    </div>
  </div>
{/if}

{#if confirming}
  <Modal title={has(s, 'mutators') ? "Choose next season's mutator" : 'Ascend?'} onClose={() => (confirming = false)}>
    {#if !has(s, 'mutators')}
      <p class="small">Your cash, venues and coaches reset. You keep all athletes and earn <b class="gold">+{fmt(gain)} 🎖️ Legacy Points</b> for permanent upgrades. Afterwards you'll draft a free athlete and rebuild your lineup.</p>
    {:else}
    <div class="col">
      {#each MUTATORS as m}
        <button class="mut" class:sel={mutator === m.id} onclick={() => (mutator = m.id)}>
          <b>{m.name}</b><span class="tiny muted">{m.desc}</span>
        </button>
      {/each}
    </div>
    {/if}
    <button class="primary" style="width:100%;margin-top:12px;padding:14px" onclick={doAscend}>Ascend for +{fmt(gain)} 🎖️</button>
  </Modal>
{/if}

<style>
  .subtabs { display: flex; gap: 6px; margin-bottom: 10px; padding: 4px 0; }
  .subtabs button { flex: 1; padding: 8px 2px; font-size: 12px; }
  .subtabs button.sel { background: var(--gold); color: #1a1205; font-weight: 700; }
  .up { display: flex; align-items: center; gap: 8px; padding: 10px; }
  .buy { min-width: 96px; background: linear-gradient(180deg, #7dd3fc, #3b82f6); color: #04121f; font-weight: 700; font-size: 13px; }
  .buy.legacy { background: linear-gradient(180deg, #e9d5ff, #a855f7); color: #1b0631; }
  .asc { background: linear-gradient(170deg, #2b1f4a, var(--card)); }
  .stat { background: var(--bg2); border-radius: 10px; padding: 8px; display: flex; flex-direction: column; }
  .stat .display { font-size: 22px; }
  .lb { border-bottom: 1px solid var(--line); padding: 4px 0; }
  .logl { padding: 2px 0; }
  input { background: var(--bg2); border: 1px solid var(--line); color: var(--text); padding: 10px; border-radius: 10px; font: inherit; min-width: 0; }
  .mut { display: flex; flex-direction: column; align-items: flex-start; text-align: left; gap: 2px; }
  .mut.sel { box-shadow: 0 0 0 2px var(--gold); }
</style>
