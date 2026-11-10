<script lang="ts">
  import { game } from '$lib/game.svelte';
  import { FACILITIES, SPORT_DEFS } from '$lib/engine/data';
  import { arenaQuickPlay, ARENA_BONUS_SECONDS, buyFacility, buyFacilityMax, facilityCost } from '$lib/engine/actions';
  import { venueStats } from '$lib/engine/formulas';
  import { fmt, pct } from '$lib/engine/format';
  import type { Sport } from '$lib/engine/types';
  import { has, type Feature } from '$lib/engine/progression';
  import ArenaScene from './ArenaScene.svelte';

  let { sport }: { sport: Sport } = $props();
  const def = $derived(SPORT_DEFS[sport]);
  const s = $derived(game.s);
  const st = $derived(venueStats(s, sport, game.now));
  const FAC_FEATURE: Record<string, Feature | null> = { seating: null, training: 'training', jumbotron: 'jumbotron', special: 'special' };
  const FAC_ICON: Record<string, string> = { seating: '▤', training: '↗', jumbotron: '▣', special: '✦' };
  const facs = $derived(FACILITIES.filter((f) => { const need = FAC_FEATURE[f.id]; return !need || has(s, need); }));
  const hintId = $derived(s.stats.minigames === 0 && !has(s, 'train') ? 'seating' : null);
  const quickAction = $derived({ basketball: 'Take a shot', soccer: 'Shoot at goal', gridiron: 'Throw a pass', baseball: 'Swing the bat', hockey: 'Take a slapshot' }[sport]);
  const remaining = $derived(Math.max(0, Math.ceil((s.arenaBonusReadyAt - game.now) / 1000)));
  let reward = $state(0);
  let celebrationUntil = $state(0);
  const celebrating = $derived(celebrationUntil > game.now);
  let open = $state(true);
  let feed = $state<{ id: number; text: string; big: boolean }[]>([]);
  let nid = 0;

  function quickPlay() {
    const now = Date.now();
    const earned = game.act((state) => arenaQuickPlay(state, sport, now));
    if (!earned) return;
    reward = earned;
    celebrationUntil = now + 1600;
    feed = [{ id: nid++, text: `Your play! +${fmt(earned)} cash`, big: true }, ...feed].slice(0, 2);
  }

  $effect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      const stats = venueStats(game.s, sport, Date.now());
      const crit = Math.random() < stats.critChance;
      feed = [{ id: nid++, text: crit ? def.bigPlay : def.plays[Math.floor(Math.random() * def.plays.length)], big: crit }, ...feed].slice(0, 2);
      timer = setTimeout(loop, Math.max(1500, 2000 / stats.pace));
    };
    timer = setTimeout(loop, 1500);
    return () => clearTimeout(timer);
  });
</script>

<section class="arena-live" style="--sport:{def.color}" aria-label="Active {def.name} arena">
  <div class="arena-heading">
    <div>
      <div class="eyebrow"><span class="live-dot"></span> LIVE ARENA</div>
      <h2>{def.name} <span>Arena</span></h2>
    </div>
    <div class="income"><strong class="num">+{fmt(st.cps)}</strong><span>cash / second</span></div>
  </div>
  <ArenaScene {sport} {celebrating} />
  <div class="match-strip">
    <span class="match-tag">ON THE FLOOR</span>
    <span class="play" class:big={feed[0]?.big}>{feed[0]?.text ?? 'Your next dynasty starts here.'}</span>
    <span class="small num muted">{st.pace.toFixed(2)} plays/s</span>
  </div>
  <div class="quick-play">
    <div class="quick-copy">
      <span class="eyebrow">A LITTLE EXTRA, IF YOU FEEL LIKE IT</span>
      <strong>Get in on the action</strong>
      <span class="small muted">Bonus: {ARENA_BONUS_SECONDS}s of income · once every 30s</span>
    </div>
    <button class="quick-button" disabled={remaining > 0} onclick={quickPlay}>
      <span>{remaining > 0 ? `Ready in ${remaining}s` : quickAction}</span>
      <span class="bonus num">{remaining > 0 ? 'Warming up' : `+${fmt(st.cps * ARENA_BONUS_SECONDS)} cash`}</span>
    </button>
  </div>
  <div class="reward-status" role="status">{celebrating ? `Nice play! +${fmt(reward)} cash earned.` : 'Your arena keeps earning automatically.'}</div>
</section>

<section class="upgrades" aria-label="{def.name} upgrades">
  <button class="upgrade-heading" onclick={() => (open = !open)} aria-expanded={open} aria-controls="arena-facilities">
    <div><span class="eyebrow">BUILD YOUR HOME ADVANTAGE</span><h3>Arena upgrades</h3></div>
    <span class="muted small">{has(s, 'jumbotron') ? `${pct(st.critChance)} crit · ` : ''}{open ? '−' : '+'}</span>
  </button>
  {#if open}
    <div class="facs" id="arena-facilities">
      {#each facs as f (f.id)}
        {@const lvl = s.facilities[sport][f.id] ?? 0}
        {@const cost = facilityCost(s, sport, f.id)}
        {@const maxed = f.max !== undefined && lvl >= f.max}
        <div class="fac">
          <div class="facility-icon" aria-hidden="true">{FAC_ICON[f.id]}</div>
          <div class="grow">
            <div class="row"><b>{f.name}</b><span class="level num">LV {lvl}{f.max ? `/${f.max}` : ''}</span></div>
            <div class="tiny muted">{f.desc}</div>
          </div>
          <button class="buy" class:hint={hintId === f.id && s.cash >= cost} disabled={maxed || s.cash < cost} onclick={() => game.act((x) => buyFacility(x, sport, f.id))} aria-label="Upgrade {f.name}{maxed ? ', maximum level' : ` for ${fmt(cost)} cash`}">
            {maxed ? 'MAX' : `$${fmt(cost)}`}
          </button>
          {#if has(s, 'maxbuy')}
            <button class="ghost maxbtn" disabled={maxed || s.cash < cost} onclick={() => game.act((x) => buyFacilityMax(x, sport, f.id))} aria-label="Buy maximum {f.name} levels">×Max</button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .arena-live { border: 1px solid #34435c; border-radius: 18px; overflow: hidden; background: #152137; box-shadow: 0 16px 40px #02071133; }
  .arena-heading { display: flex; align-items: center; justify-content: space-between; padding: 18px; background: linear-gradient(120deg, #24314b, #162239); }
  .eyebrow { display: block; color: #96a7c2; font-size: 9px; font-weight: 700; letter-spacing: 1.6px; }
  .arena-heading .eyebrow { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
  .live-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #7adaac; box-shadow: 0 0 9px #7adaac55; }
  h2 { font-size: 24px; text-transform: none; letter-spacing: -.8px; }
  h2 span { font-weight: 400; color: #a9b6cc; }
  .income { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .income strong { color: #f7d490; font-size: 23px; letter-spacing: -1px; }
  .income > span { font-size: 9px; color: #a9b6cc; }
  .match-strip { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: #101c2e; border-top: 1px solid #2a3850; }
  .match-tag { font-size: 8px; font-weight: 800; letter-spacing: 1px; color: #7e92b2; flex-shrink: 0; }
  .play { flex: 1; font-size: 11px; }
  .play.big { color: #f7d490; }
  .match-strip .small { font-size: 10px; white-space: nowrap; }
  .quick-play { display: flex; align-items: center; gap: 12px; padding: 18px 14px 10px; }
  .quick-copy { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 4px; }
  .quick-copy .eyebrow { font-size: 7px; letter-spacing: 1.1px; }
  .quick-copy strong { font-size: 15px; }
  .quick-copy .small { font-size: 10px; }
  .quick-button { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-width: 136px; min-height: 52px; background: linear-gradient(145deg, #ffe0a0, #e9b45c); color: #2b2114; font-size: 12px; font-weight: 800; border: 1px solid #ffe1a8; box-shadow: 0 3px 0 #7c572d; }
  .quick-button:disabled { opacity: .65; background: #27364d; color: #aebfd6; border-color: #3e4b60; box-shadow: none; }
  .bonus { font-size: 10px; font-weight: 500; }
  .reward-status { min-height: 27px; text-align: center; font-size: 10px; color: #b6c3d8; padding: 0 12px 13px; }
  .upgrades { margin-top: 10px; border: 1px solid #2b3b54; border-radius: 16px; background: #152137; overflow: hidden; }
  .upgrade-heading { width: 100%; display: flex; align-items: center; justify-content: space-between; text-align: left; background: transparent; padding: 16px; border-radius: 0; }
  .upgrade-heading h3 { font-size: 17px; text-transform: none; margin-top: 4px; }
  .upgrade-heading .eyebrow { font-size: 8px; }
  .facs { padding: 0 12px 12px; display: flex; flex-direction: column; gap: 7px; }
  .fac { display: flex; align-items: center; gap: 10px; background: #101b2d; border: 1px solid #26364e; border-radius: 11px; padding: 12px 10px; }
  .fac b { font-size: 12px; }
  .facility-icon { color: #d8b77e; background: #d8b77e0d; border: 1px solid #d8b77e22; font-size: 22px; display: grid; place-items: center; width: 34px; height: 36px; flex-shrink: 0; border-radius: 8px; }
  .level { color: #9cabc4; font-size: 8px; white-space: nowrap; }
  .fac .tiny { font-size: 9px; margin-top: 3px; }
  .buy { min-width: 72px; background: #eac17b; color: #2e2313; font-weight: 800; padding: 10px 8px; font-size: 12px; }
  .buy.hint { box-shadow: 0 0 0 2px #eac17b44; }
  .maxbtn { padding: 10px 6px; font-size: 10px; }
  @media (max-width: 400px) {
    .arena-heading { padding: 14px; } h2 { font-size: 21px; } .income strong { font-size: 21px; }
    .quick-play { gap: 8px; padding: 14px 10px 10px; } .quick-button { min-width: 113px; font-size: 11px; padding: 8px; }
    .quick-copy strong { font-size: 13px; } .quick-copy .eyebrow { font-size: 6px; } .quick-copy .small { font-size: 9px; }
    .fac { gap: 7px; padding: 10px 7px; } .facility-icon { display: none; } .buy { min-width: 65px; }
  }
</style>
