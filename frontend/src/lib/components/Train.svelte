<script lang="ts">
  import { game } from '$lib/game.svelte';
  import { dealHand, finishMiniGame, type MiniGameReward } from '$lib/engine/actions';
  import { BOOST_LABEL, MEDALS, SPORT_DEFS } from '$lib/engine/data';
  import { energyRegenMs, maxEnergy, miniGameAssist, miniGameDifficulty } from '$lib/engine/formulas';
  import { VARIANTS_BY_ID } from '$lib/engine/variants';
  import { fmt, fmtTime } from '$lib/engine/format';
  import { submitScore, leaderboard, type LeaderRow } from '$lib/api';
  import type { MiniGameCard } from '$lib/engine/types';
  import MiniGamePlayer from './MiniGamePlayer.svelte';
  import Modal from './Modal.svelte';

  const s = $derived(game.s);
  const max = $derived(maxEnergy(s));
  const nextIn = $derived(s.energy >= max ? 0 : s.energyAt + energyRegenMs(s) - game.now);
  let playing = $state<MiniGameCard | null>(null);
  let result = $state<{ card: MiniGameCard; score: number; reward: MiniGameReward } | null>(null);
  let board = $state<{ variant: string; rows: LeaderRow[] } | null>(null);

  const MOD: Record<MiniGameCard['modifier'], { label: string; desc: string; cls: string } | null> = {
    none: null,
    hotstreak: { label: '🔥 Hot Streak', desc: 'Boost is 1.5× stronger', cls: 'hot' },
    rivalry: { label: '⚔️ Rivalry', desc: 'Earns bonus Scout Tokens', cls: 'riv' },
    fanday: { label: '📣 Fan Day', desc: 'Pays Fans instead of a boost', cls: 'fan' }
  };
  const MEDAL_ICON = { none: '—', bronze: '🥉', silver: '🥈', gold: '🥇', platinum: '💎' } as const;

  function done(score: number, ms: number) {
    const card = playing!;
    playing = null;
    const reward = game.act((st) => finishMiniGame(st, card, score));
    result = { card, score, reward };
    if (ms > 0) void submitScore(card.variant, score, ms, reward.medal);
  }

  async function showBoard(variant: string) {
    board = { variant, rows: [] };
    board = { variant, rows: await leaderboard(variant) };
  }
</script>

<div class="col">
  <div class="card row">
    <div class="grow">
      <h2>Practice Field</h2>
      <div class="small muted">Spend ⚡ to draw {3 + (s.legacyTree.cards ?? 0)} drills. Play one; your medal boosts your idle income.</div>
    </div>
    <div class="energy">
      <div class="display num">{s.energy}<span class="muted">/{max}</span> ⚡</div>
      {#if nextIn > 0}<div class="tiny muted num">+1 in {fmtTime(nextIn)}</div>{/if}
    </div>
  </div>

  {#if s.hand}
    <div class="section-title"><h3>Pick your drill</h3><span class="small muted">Difficulty {miniGameDifficulty(s)}</span></div>
    {#each s.hand as card}
      {@const v = VARIANTS_BY_ID[card.variant]}
      {@const sp = SPORT_DEFS[card.sport]}
      {@const mod = MOD[card.modifier]}
      {@const assist = miniGameAssist(s, card.sport)}
      <button class="drill card {mod?.cls ?? ''}" style="--c:{sp.color}" onclick={() => (playing = card)}>
        <span class="em">{sp.emoji}</span>
        <div class="grow" style="text-align:left">
          <div class="row"><h3>{v.name}</h3>{#if mod}<span class="pill tiny">{mod.label}</span>{/if}</div>
          <div class="small muted">{v.blurb}</div>
          <div class="row tiny" style="margin-top:4px;flex-wrap:wrap">
            <span class="pill">⚡ Boosts {BOOST_LABEL[card.stat]}</span>
            {#if assist > 0}<span class="pill green-t">Assist +{Math.round(assist * 100)}%</span>{/if}
            {#if s.minigameBest[card.variant]}<span class="pill">Best {s.minigameBest[card.variant]}</span>{/if}
          </div>
        </div>
        <span class="play display">PLAY ▶</span>
      </button>
    {/each}
  {:else}
    <button class="primary deal" disabled={s.energy <= 0} onclick={() => game.act((st) => dealHand(st))}>
      {s.energy > 0 ? 'Draw drills (1 ⚡)' : 'Out of energy'}
    </button>
  {/if}

  <div class="section-title"><h3>Medals</h3></div>
  <div class="card medals">
    {#each Object.entries(MEDALS) as [m, d]}
      <div><span class="mi">{MEDAL_ICON[m as keyof typeof MEDAL_ICON]}</span><b>{d.min}+</b><span class="tiny muted">×{d.mult} · {d.minutes}m</span></div>
    {/each}
  </div>
  <p class="tiny muted">Same-stat boosts extend duration; different stats multiply together. Daily Gold streaks of 3 days pay Scout Tokens.</p>

  {#if Object.keys(s.minigameBest).length}
    <div class="section-title"><h3>Personal bests</h3><span class="tiny muted">tap for today's leaderboard</span></div>
    <div class="card col">
      {#each Object.entries(s.minigameBest).sort((a, b) => b[1] - a[1]) as [id, best]}
        <button class="pb" onclick={() => showBoard(id)}>
          <span>{SPORT_DEFS[VARIANTS_BY_ID[id]?.sport]?.emoji} {VARIANTS_BY_ID[id]?.name ?? id}</span>
          <span class="num gold">{best}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

{#if playing}
  <MiniGamePlayer variant={playing.variant} difficulty={miniGameDifficulty(s) + (playing.modifier === 'rivalry' ? 2 : 0)}
    assist={miniGameAssist(s, playing.sport)} onDone={done} onCancel={() => (playing = null)} />
{/if}

{#if result}
  <Modal title={result.reward.medal === 'none' ? 'No medal' : `${result.reward.medal} medal!`} onClose={() => (result = null)}>
    <div class="res">
      <div class="medal">{MEDAL_ICON[result.reward.medal]}</div>
      <div class="display num score">{result.score}</div>
      {#if result.reward.medal === 'none'}
        <p class="muted">Score 250+ for a Bronze boost. Shake it off!</p>
      {:else if result.reward.fans > 0}
        <p>📣 +{fmt(result.reward.fans)} Fans</p>
      {:else}
        <p>⚡ <b>{BOOST_LABEL[result.reward.stat]} ×{result.reward.mult.toFixed(2)}</b> for {Math.round(result.reward.minutes)} min</p>
      {/if}
      {#if result.reward.tokens > 0}<p class="gold">🎟️ +{result.reward.tokens} Scout Tokens</p>{/if}
    </div>
    <button class="primary" style="width:100%" onclick={() => (result = null)}>Nice</button>
  </Modal>
{/if}

{#if board}
  <Modal title="Today's best · {VARIANTS_BY_ID[board.variant]?.name}" onClose={() => (board = null)}>
    {#if board.rows.length === 0}<p class="muted">No scores yet today (or you're offline).</p>{/if}
    {#each board.rows as r, i}
      <div class="row lb"><span class="muted num">{i + 1}.</span><span class="grow">{r.displayName}</span><b class="num">{r.score}</b></div>
    {/each}
  </Modal>
{/if}

<style>
  .energy { text-align: right; }
  .energy .display { font-size: 22px; }
  .deal { padding: 18px; font-size: 18px; }
  .drill { display: flex; align-items: center; gap: 10px; border-left: 4px solid var(--c); padding: 12px; }
  .drill.hot { box-shadow: inset 0 0 0 1px rgba(248, 113, 113, 0.5); }
  .drill.riv { box-shadow: inset 0 0 0 1px rgba(192, 132, 252, 0.5); }
  .drill.fan { box-shadow: inset 0 0 0 1px rgba(74, 222, 128, 0.5); }
  .em { font-size: 34px; }
  .play { color: var(--gold); font-size: 14px; }
  .medals { display: grid; grid-template-columns: repeat(4, 1fr); text-align: center; gap: 4px; }
  .medals > div { display: flex; flex-direction: column; align-items: center; }
  .mi { font-size: 22px; }
  .pb { display: flex; justify-content: space-between; background: var(--bg2); padding: 8px 10px; }
  .res { text-align: center; margin-bottom: 12px; }
  .medal { font-size: 64px; }
  .score { font-size: 40px; color: var(--gold); }
  .lb { padding: 4px 0; border-bottom: 1px solid var(--line); }
</style>
