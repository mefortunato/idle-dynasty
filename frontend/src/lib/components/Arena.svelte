<script lang="ts">
  import { game } from '$lib/game.svelte';
  import { SPORT_DEFS, SPORT_ORDER, featuredSport } from '$lib/engine/data';
  import { nextVenue, switchVenue, unlockVenue } from '$lib/engine/actions';
  import { venueStats } from '$lib/engine/formulas';
  import { fmt, pct } from '$lib/engine/format';
  import VenueCard from './VenueCard.svelte';
  import GoalBar from './GoalBar.svelte';
  import { has, type Tab } from '$lib/engine/progression';

  let { onNav }: { onNav: (t: Tab) => void } = $props();
  const s = $derived(game.s);
  const nv = $derived(nextVenue(s));
  const feat = $derived(featuredSport(s.champTier));
  const showPicker = $derived(has(s, 'venues') || s.venuesUnlocked.length > 1);
  let notice = $state('');

  function build() {
    if (!nv) return;
    const name = SPORT_DEFS[nv].name;
    if (game.act((state) => unlockVenue(state, nv!))) notice = `${name} unlocked! Select it above to make it active.`;
  }

  function activate(sport: typeof s.activeVenue) {
    if (game.act((state) => switchVenue(state, sport))) notice = `${SPORT_DEFS[sport].name} is now active. Your other arenas keep their upgrades.`;
  }
</script>

<div class="arena-page">
  <div class="page-heading">
    <div><span class="eyebrow">YOUR FRANCHISE. YOUR HOME COURT.</span><h1>The Arena</h1></div>
    <span class="active-count"><span></span> 1 ACTIVE</span>
  </div>

  {#if showPicker}
    <section class="arena-picker" aria-label="Choose your active arena">
      <div class="picker-heading"><span>Choose your arena</span><span class="muted">{s.venuesUnlocked.length} / 5 unlocked</span></div>
      <div class="arena-options">
        {#each SPORT_ORDER as sport}
          {@const def = SPORT_DEFS[sport]}
          {@const unlocked = s.venuesUnlocked.includes(sport)}
          {@const active = s.activeVenue === sport}
          <button class="arena-option" class:active class:locked={!unlocked} disabled={!unlocked} aria-pressed={active}
            aria-label="{def.name}{active ? ', active arena' : unlocked ? ', switch arena' : ', locked'}"
            onclick={() => activate(sport)}>
            <span class="sport-icon" aria-hidden="true">{def.emoji}</span>
            <span class="sport-name">{def.name}</span>
            <span class="option-status">{active ? '● ACTIVE' : unlocked ? 'SWITCH' : 'LOCKED'}</span>
          </button>
        {/each}
      </div>
      <p class="picker-note">Only your active arena earns. Switch freely; upgrades stay with each arena.</p>
    </section>
  {:else}
    <p class="starter-note">Your team is playing. Let’s build something great.</p>
  {/if}
  <div class="notice" role="status">{notice}</div>

  {#key s.activeVenue}<VenueCard sport={s.activeVenue} />{/key}

  {#if nv && has(s, 'venues')}
    {@const def = SPORT_DEFS[nv]}
    <section class="next-arena">
      <div class="next-icon" aria-hidden="true">{def.emoji}</div>
      <div class="grow"><span class="eyebrow">YOUR NEXT CHAPTER</span><h3>{def.name} Arena</h3><div class="small muted">Starts at +{fmt(venueStats(s, nv, game.now).cps)}/s when active</div></div>
      <button class="unlock-button" disabled={s.cash < def.unlockCost} onclick={build} aria-label="Unlock {def.name} arena for {fmt(def.unlockCost)} cash">Unlock<span class="num">${fmt(def.unlockCost)}</span></button>
      <p class="small muted">Unlock now, switch when you’re ready. Your current arena stays active.</p>
    </section>
  {/if}

  <div class="progress"><GoalBar /></div>
  {#if has(s, 'playoffs') || has(s, 'train')}
    <div class="callouts">
      {#if has(s, 'playoffs')}
        <button class="callout card" onclick={() => onNav('playoffs')}>
          <div class="row">
            <span class="big">{SPORT_DEFS[feat].emoji}</span>
            <div class="grow" style="text-align:left"><div class="display small">Tier {s.champTier} Playoffs</div><div class="bar" style="margin-top:6px"><i style="width:{s.readiness * 100}%"></i></div></div>
            <span class="small {s.readiness >= 1 ? 'gold' : 'muted'}">{s.readiness >= 1 ? 'READY!' : pct(s.readiness)}</span>
          </div>
        </button>
      {/if}
      {#if has(s, 'train') && (s.energy > 0 || s.hand)}
        <button class="callout card train" onclick={() => onNav('train')}><span class="big">⏱️</span><span class="display small">Train · {s.energy}⚡</span></button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .arena-page { padding-top: 16px; }
  .page-heading { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .eyebrow { display: block; color: #92a4c0; font-size: 8px; font-weight: 700; letter-spacing: 1.6px; }
  h1 { margin-top: 6px; font-size: 31px; text-transform: none; letter-spacing: -1px; }
  .active-count { display: flex; align-items: center; gap: 6px; padding: 7px 9px; background: #76d9aa0b; border: 1px solid #76d9aa33; border-radius: 6px; color: #9cdebb; font-size: 8px; font-weight: 700; letter-spacing: 1px; white-space: nowrap; }
  .active-count > span { width: 5px; height: 5px; border-radius: 50%; background: #76d9aa; }
  .starter-note { color: #93a4bf; font-size: 12px; margin: 8px 0 16px; }
  .arena-picker { margin-top: 20px; }
  .picker-heading { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 9px; }
  .picker-heading > span:first-child { font-weight: 600; }
  .picker-heading .muted { font-size: 10px; }
  .arena-options { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
  .arena-option { display: flex; flex-direction: column; align-items: center; gap: 5px; background: #152137; border: 1px solid #2e3b52; padding: 12px 2px 10px; border-radius: 10px; }
  .arena-option.active { background: linear-gradient(155deg, #3b342c, #262a30); border-color: #e6bd7a; box-shadow: inset 0 0 0 1px #e6bd7a15; }
  .arena-option.locked { opacity: .55; }
  .arena-option.locked .sport-icon { filter: grayscale(1); }
  .sport-icon { font-size: 24px; }
  .sport-name { font-size: 9px; font-weight: 600; }
  .option-status { color: #8ca0bf; font-size: 7px; font-weight: 700; letter-spacing: .7px; }
  .active .option-status { color: #e6bd7a; }
  .picker-note { color: #889bb8; margin: 9px 0 0; font-size: 10px; }
  .notice { color: #a1d9ba; font-size: 10px; margin: 10px 0; }
  .notice:empty { margin: 14px 0 0; }
  .next-arena { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 16px; border: 1px dashed #4a5362; border-radius: 14px; background: linear-gradient(120deg, #1c2637, #131e30); margin-top: 16px; }
  .next-icon { font-size: 30px; width: 45px; height: 48px; display: grid; place-items: center; background: #273348; border-radius: 12px; }
  .next-arena h3 { text-transform: none; margin: 4px 0 3px; font-size: 15px; }
  .next-arena .small { font-size: 10px; }
  .next-arena > p { width: 100%; margin: 0; border-top: 1px solid #303b4d; padding-top: 10px; font-size: 9px; }
  .unlock-button { display: flex; flex-direction: column; gap: 3px; align-items: center; padding: 9px 14px; border: 1px solid #b29a6b88; color: #f3d295; background: #d6b37611; font-size: 11px; font-weight: 700; }
  .unlock-button .num { font-size: 10px; font-weight: 400; }
  .progress { margin-top: 16px; }
  .callouts { display: flex; gap: 8px; margin-top: 12px; }
  .callout { flex: 1; text-align: left; padding: 12px; background: #152137; }
  .callout.train { flex: 0 0 auto; display: flex; align-items: center; gap: 7px; }
  .big { font-size: 24px; }
  @media (max-width: 380px) { .sport-name { font-size: 8px; } .arena-options { gap: 4px; } .next-arena { padding: 12px; gap: 8px; } .next-icon { width: 34px; font-size: 24px; } }
</style>
