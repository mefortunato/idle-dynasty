<script lang="ts">
  import { game } from '$lib/game.svelte';
  import {
    focusPackUnlocked, loadPreset, savePreset, scout, starUp, toggleLineup, tradeDeadline, tradeDeadlineCost, upcomingSports, type PullResult
  } from '$lib/engine/actions';
  import { ARCHETYPES, FOCUS_PACK_COST, GRADE_DEFS, PACK_COST, PITY, SPORT_DEFS, TRAITS } from '$lib/engine/data';
  import { athleteRating, chemistry, levelCap, lineupAthletes, lineupSlots, starUpCost, teamPower, xpToNext } from '$lib/engine/formulas';
  import { fmt } from '$lib/engine/format';
  import { GRADES, SPORTS, type Athlete, type Sport } from '$lib/engine/types';
  import AthleteCard from './AthleteCard.svelte';
  import Modal from './Modal.svelte';
  import { has } from '$lib/engine/progression';

  const s = $derived(game.s);
  const lu = $derived(lineupAthletes(s));
  const slots = $derived(lineupSlots(s));
  const chem = $derived(chemistry(s));
  const next = $derived(upcomingSports(s, 1)[0]);
  let filter = $state<Sport | null>(null);
  let sel = $state<string | null>(null);
  let pulls = $state<PullResult[] | null>(null);
  const selA = $derived(sel ? s.athletes.find((a) => a.id === sel) ?? null : null);

  const sorted = $derived(
    [...s.athletes]
      .filter((a) => !filter || (a.ratings[filter] ?? 0) > 0)
      .sort((a, b) => (filter ? athleteRating(b, filter) - athleteRating(a, filter) : GRADES.indexOf(b.grade) - GRADES.indexOf(a.grade) || athleteRating(b, b.primary) - athleteRating(a, a.primary)))
  );

  function doScout(focus: Sport | null, n: number) {
    const out: PullResult[] = [];
    game.act((st) => { for (let i = 0; i < n; i++) { const r = scout(st, focus); if (r) out.push(r); } });
    if (out.length) pulls = out;
  }
</script>

<div class="col">
  <div class="card">
    <div class="row">
      <h2 class="grow">Lineup <span class="muted num">{lu.length}/{slots}</span></h2>
      {#if s.lineupLocked}
        <span class="pill">🔒 Locked</span>
      {:else}
        <span class="pill green-t">✏️ Editable</span>
      {/if}
    </div>
    <div class="lineup">
      {#each Array(slots) as _, i}
        {#if lu[i]}
          <AthleteCard a={lu[i]} compact focus={filter ?? next.sport} onclick={() => (sel = lu[i].id)} />
        {:else}
          <div class="empty tiny muted">Empty</div>
        {/if}
      {/each}
    </div>
    <div class="row small" style="flex-wrap:wrap;margin-top:8px">
      {#each SPORTS as sp}
        <span class="pill num" class:gold={sp === next.sport}>{SPORT_DEFS[sp].emoji} {fmt(teamPower(s, sp))}</span>
      {/each}
    </div>
    {#if Object.keys(chem.sportStacks).length || Object.keys(chem.archetypeStacks).length || chem.dreamTeam}
      <div class="row tiny" style="flex-wrap:wrap;margin-top:6px">
        {#each Object.keys(chem.sportStacks) as sp}<span class="pill green-t">🧪 {SPORT_DEFS[sp as Sport].name} stack</span>{/each}
        {#each Object.keys(chem.archetypeStacks) as ar}<span class="pill green-t">🧪 {ARCHETYPES[ar as keyof typeof ARCHETYPES].name} trio</span>{/each}
        {#if chem.dreamTeam}<span class="pill gold">🌟 DREAM TEAM</span>{/if}
      </div>
    {/if}
    {#if s.lineupLocked}
      <p class="tiny muted">Your lineup is locked until you Ascend. Next playoffs: {SPORT_DEFS[next.sport].emoji} {SPORT_DEFS[next.sport].name} (Tier {next.tier}).</p>
      {#if has(s, 'tradeDeadline')}
        <button class="ghost" style="width:100%" disabled={s.trophies < tradeDeadlineCost(s)} onclick={() => game.act((st) => tradeDeadline(st))}>
          📝 Trade deadline: unlock lineup · 🏆 {tradeDeadlineCost(s)}
        </button>
      {/if}
    {:else}
      <p class="tiny muted">Tap athletes to add or remove them. The lineup locks when you enter the playoffs. Next playoffs: {SPORT_DEFS[next.sport].emoji} {SPORT_DEFS[next.sport].name}.</p>
    {/if}
    {#if has(s, 'presets')}
    <div class="row presets">
      {#each [0, 1, 2] as i}
        <div class="preset">
          <span class="tiny muted">Preset {i + 1} ({s.presets[i]?.length ?? 0})</span>
          <div class="row">
            <button class="tiny" onclick={() => game.act((st) => savePreset(st, i))}>Save</button>
            <button class="tiny" disabled={s.lineupLocked || !s.presets[i]?.length} onclick={() => game.act((st) => loadPreset(st, i))}>Load</button>
          </div>
        </div>
      {/each}
    </div>
    {/if}
  </div>

  {#if has(s, 'scouting')}
  <div class="card">
    <div class="row"><h2 class="grow">Scouting</h2><span class="pill num">🎟️ {fmt(s.tokens)}</span></div>
    <div class="tiny muted">MVP+ guaranteed in {PITY.mvp - s.scoutPity.mvp} · Legend+ in {PITY.legend - s.scoutPity.legend} · Duplicates become 💠 Training Shards ({fmt(s.shards)})</div>
    <div class="row" style="margin-top:8px">
      <button class="primary grow" disabled={s.tokens < PACK_COST} onclick={() => doScout(null, 1)}>Scout ×1 · 🎟️{PACK_COST}</button>
      <button class="primary grow" disabled={s.tokens < PACK_COST * 10} onclick={() => doScout(null, 10)}>×10 · 🎟️{PACK_COST * 10}</button>
    </div>
    {#if SPORTS.some((sp) => focusPackUnlocked(s, sp))}
    <div class="focus">
      {#each SPORTS as sp}
        <button class="tiny" disabled={!focusPackUnlocked(s, sp) || s.tokens < FOCUS_PACK_COST} onclick={() => doScout(sp, 1)}
          title={focusPackUnlocked(s, sp) ? '' : `Win a ${SPORT_DEFS[sp].name} title to unlock`}>
          {SPORT_DEFS[sp].emoji} {focusPackUnlocked(s, sp) ? `🎟️${FOCUS_PACK_COST}` : '🔒'}
        </button>
      {/each}
    </div>
    {/if}
    <div class="tiny muted">Sport-focused packs unlock after you win that sport's championship.</div>
  </div>

  {/if}

  <div class="section-title"><h3>Collection <span class="muted num">{s.athletes.length}/100</span></h3></div>
  <div class="filters">
    <button class:sel={!filter} onclick={() => (filter = null)}>All</button>
    {#each SPORTS as sp}<button class:sel={filter === sp} onclick={() => (filter = sp)}>{SPORT_DEFS[sp].emoji}</button>{/each}
  </div>
  <div class="coll">
    {#each sorted as a (a.id)}
      <AthleteCard {a} focus={filter} inLineup={s.lineup.includes(a.id)} onclick={() => (sel = a.id)} />
    {/each}
  </div>
</div>

{#if selA}
  {@const a = selA}
  {@const g = GRADE_DEFS[a.grade]}
  <Modal title={a.name} onClose={() => (sel = null)}>
    <div class="row small" style="margin-bottom:8px;flex-wrap:wrap">
      <span class="pill" style="color:{g.color}">{g.name}</span>
      <span class="pill">{ARCHETYPES[a.archetype].emoji} {ARCHETYPES[a.archetype].name}: {ARCHETYPES[a.archetype].desc}</span>
      <span class="pill gold">{'★'.repeat(a.stars) || '☆'} </span>
    </div>
    {#each SPORTS as sp}
      {@const r = athleteRating(a, sp)}
      <div class="rating row">
        <span style="width:22px">{SPORT_DEFS[sp].emoji}</span>
        <div class="bar grow"><i style="width:{Math.min(100, r / 1.6)}%; {r === 0 ? 'opacity:0' : ''}"></i></div>
        <span class="num small" style="width:36px;text-align:right">{r ? Math.round(r) : '—'}</span>
      </div>
    {/each}
    <div class="small" style="margin:8px 0">
      Level {a.level}/{levelCap(a)} {#if a.level < levelCap(a)}<span class="muted num">· {Math.floor(a.xp)}/{xpToNext(a.level)} XP (earned while in lineup)</span>{/if}
    </div>
    {#each a.traits as t}
      <div class="trait small"><b>{TRAITS[t]?.name}</b> <span class="muted">{TRAITS[t]?.desc}</span></div>
    {/each}
    <div class="row" style="margin-top:12px">
      <button class="grow" disabled={a.stars >= 5 || s.shards < starUpCost(a)} onclick={() => game.act((st) => starUp(st, a.id))}>
        {a.stars >= 5 ? '★ MAX' : `★ Star up · 💠${starUpCost(a)}`}
      </button>
      <button class="grow {s.lineup.includes(a.id) ? 'danger' : 'green'}"
        disabled={s.lineupLocked || (!s.lineup.includes(a.id) && s.lineup.length >= slots)}
        onclick={() => game.act((st) => toggleLineup(st, a.id))}>
        {s.lineup.includes(a.id) ? 'Bench' : 'Add to lineup'}
      </button>
    </div>
    {#if s.lineupLocked}<p class="tiny muted">Lineup locked: Ascend or use the trade deadline to change it.</p>{/if}
  </Modal>
{/if}

{#if pulls}
  <Modal title="Scouting report" onClose={() => (pulls = null)}>
    <div class="pulls">
      {#each pulls as r}
        <div class="pull" class:dupe={r.duplicate}>
          <AthleteCard a={r.athlete} compact />
          <span class="tiny {r.duplicate ? 'muted' : 'gold'}">{r.duplicate ? `Dupe +💠${r.shards}` : 'NEW!'}</span>
        </div>
      {/each}
    </div>
    <button class="primary" style="width:100%;margin-top:12px" onclick={() => (pulls = null)}>Done</button>
  </Modal>
{/if}

<style>
  .lineup { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-top: 8px; }
  .empty { border: 1px dashed var(--line); border-radius: 12px; display: grid; place-items: center; min-height: 92px; }
  .presets { margin-top: 8px; justify-content: space-between; }
  .preset { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .preset button { padding: 4px 8px; }
  .focus { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; margin: 8px 0 4px; }
  .focus button { padding: 6px 2px; }
  .filters { display: flex; gap: 6px; }
  .filters button { flex: 1; padding: 8px 4px; }
  .filters button.sel { background: var(--gold); color: #1a1205; font-weight: 700; }
  .coll { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .rating { margin: 4px 0; }
  .trait { background: var(--bg2); border-radius: 8px; padding: 6px 8px; margin-top: 4px; }
  .pulls { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 8px; }
  .pull { display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .pull.dupe { opacity: 0.7; }
</style>
