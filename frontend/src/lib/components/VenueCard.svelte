<script lang="ts">
  import { game } from '$lib/game.svelte';
  import { FACILITIES, SPORT_DEFS } from '$lib/engine/data';
  import { buyFacility, buyFacilityMax, facilityCost } from '$lib/engine/actions';
  import { venueStats } from '$lib/engine/formulas';
  import { fmt, pct } from '$lib/engine/format';
  import type { Sport } from '$lib/engine/types';
  import { has, type Feature } from '$lib/engine/progression';

  let { sport }: { sport: Sport } = $props();
  const def = $derived(SPORT_DEFS[sport]);
  const s = $derived(game.s);
  const st = $derived(venueStats(s, sport, game.now));
  let open = $state(true);
  const FAC_FEATURE: Record<string, Feature | null> = { seating: null, training: 'training', jumbotron: 'jumbotron', special: 'special' };
  const facs = $derived(FACILITIES.filter((f) => { const need = FAC_FEATURE[f.id]; return !need || has(s, need); }));
  /** Pulse the cheapest affordable upgrade for brand-new players. */
  const hintId = $derived(s.stats.minigames === 0 && !has(s, 'train') ? 'seating' : null);

  // Cosmetic play-by-play feed.
  let feed = $state<{ id: number; text: string; amt: number; big: boolean }[]>([]);
  let home = $state(0);
  let away = $state(0);
  let flash = $state(false);
  let nid = 0;

  $effect(() => {
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      const stats = venueStats(game.s, sport, Date.now());
      const crit = Math.random() < stats.critChance;
      const amt = stats.value * stats.lineupMult * (crit ? stats.critMult : 1);
      const text = crit ? def.bigPlay : def.plays[Math.floor(Math.random() * def.plays.length)];
      feed = [{ id: nid++, text, amt, big: crit }, ...feed].slice(0, 3);
      if (crit || Math.random() < 0.25) home += sport === 'basketball' ? 2 : 1;
      if (Math.random() < 0.12) away += sport === 'basketball' ? 2 : 1;
      if (crit) { flash = true; setTimeout(() => (flash = false), 350); }
      if (home + away > (sport === 'basketball' ? 200 : 12)) { home = 0; away = 0; }
      // Throttle visuals to at most ~2 plays/sec.
      t = setTimeout(loop, Math.max(500, 1000 / stats.pace));
    };
    t = setTimeout(loop, 400);
    return () => clearTimeout(t);
  });
</script>

<div class="card venue" style="--c:{def.color}">
  <button class="head" onclick={() => (open = !open)}>
    <span class="emoji">{def.emoji}</span>
    <div class="grow" style="text-align:left">
      <h3>{def.name}</h3>
      <div class="small muted num">{st.pace.toFixed(2)} plays/s{#if has(s, 'jumbotron')} · crit {pct(st.critChance)} ×{st.critMult.toFixed(1)}{/if}</div>
    </div>
    <div class="cps">
      <div class="display gold num">{fmt(st.cps)}/s</div>
      <div class="tiny muted">{open ? '▲' : '▼'}</div>
    </div>
  </button>

  <div class="board" class:flash>
    <div class="score display num"><span>HOME {home}</span><span class="muted">–</span><span class="muted">{away} AWAY</span></div>
    <div class="feed">
      {#each feed as f (f.id)}
        <div class="play" class:big={f.big}><span>{f.text}</span><span class="num">+{fmt(f.amt)}</span></div>
      {/each}
    </div>
  </div>

  {#if open}
    <div class="facs">
      {#each facs as f (f.id)}
        {@const lvl = s.facilities[sport][f.id] ?? 0}
        {@const cost = facilityCost(s, sport, f.id)}
        {@const maxed = f.max !== undefined && lvl >= f.max}
        <div class="fac">
          <div class="grow">
            <div class="row"><b>{f.name}</b><span class="pill tiny">Lv {lvl}{f.max ? `/${f.max}` : ''}</span></div>
            <div class="tiny muted">{f.desc}</div>
          </div>
          <button class="buy" class:hint={hintId === f.id && s.cash >= cost} disabled={maxed || s.cash < cost} onclick={() => game.act((x) => buyFacility(x, sport, f.id))}>
            {maxed ? 'MAX' : `💵 ${fmt(cost)}`}
          </button>
          {#if has(s, 'maxbuy')}
            <button class="ghost maxbtn" disabled={maxed || s.cash < cost} onclick={() => game.act((x) => buyFacilityMax(x, sport, f.id))}>×Max</button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .venue { border-left: 4px solid var(--c); padding: 10px; }
  .head { display: flex; align-items: center; gap: 10px; width: 100%; background: transparent; padding: 0; }
  .emoji { font-size: 30px; }
  .cps { text-align: right; }
  .cps .display { font-size: 18px; }
  .board { margin: 10px 0 4px; background: #070c17; border-radius: 10px; padding: 8px 10px; border: 1px solid #1a2744; transition: box-shadow 0.2s; }
  .board.flash { box-shadow: 0 0 0 2px var(--gold), 0 0 24px rgba(245, 184, 61, 0.35); }
  .score { display: flex; justify-content: center; gap: 10px; font-size: 15px; color: #ffd27a; }
  .feed { height: 54px; overflow: hidden; }
  .play { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); animation: slide 0.25s ease-out; }
  .play:first-child { color: var(--text); }
  .play.big { color: var(--gold); font-weight: 700; }
  @keyframes slide { from { transform: translateY(-8px); opacity: 0; } }
  .facs { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
  .fac { display: flex; align-items: center; gap: 6px; background: var(--bg2); border-radius: 10px; padding: 8px; }
  .buy { min-width: 92px; background: linear-gradient(180deg, #ffcd5e, #e8a224); color: #1a1205; font-weight: 700; padding: 8px; font-size: 13px; }
  .fac { animation: appear 0.4s ease-out; }
  @keyframes appear { from { opacity: 0; transform: translateY(-6px); } }
  .buy.hint { animation: pulse 1s ease-in-out infinite; }
  @keyframes pulse { 50% { box-shadow: 0 0 0 4px rgba(245, 184, 61, 0.45); transform: scale(1.04); } }
  .maxbtn { padding: 8px 6px; font-size: 12px; }
</style>
