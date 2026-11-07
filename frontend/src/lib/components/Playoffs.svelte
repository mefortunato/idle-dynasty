<script lang="ts">
  import { game } from '$lib/game.svelte';
  import {
    canEnterPlayoffs, currentOdds, endPlayoffs, resolvePlayoffGame, startPlayoffs, timeoutsPerRun, upcomingSports, type GameResult
  } from '$lib/engine/actions';
  import { CLUTCH_PER_GAME, ROUND_NAMES, SPORT_DEFS, featuredSport } from '$lib/engine/data';
  import { baseWinProb, clutchShift, earlyEntryCost, miniGameAssist, miniGameDifficulty, opponentPower, teamPower } from '$lib/engine/formulas';
  import { VARIANTS } from '$lib/engine/variants';
  import { fmt, pct } from '$lib/engine/format';
  import { mulberry32 } from '$lib/engine/rng';
  import MiniGamePlayer from './MiniGamePlayer.svelte';
  import Modal from './Modal.svelte';

  const s = $derived(game.s);
  const p = $derived(s.playoff);
  const odds = $derived(p?.active ? currentOdds(s) : null);

  // In-game (non-persisted) flow.
  let phase = $state<'idle' | 'game' | 'clutch' | 'review' | 'result'>('idle');
  let scores = $state<number[]>([]);
  let clutchVariant = $state('');
  let lastScore = $state<number | null>(null);
  let result = $state<GameResult | null>(null);
  let simHome = $state(0);
  let simAway = $state(0);
  let simClock = $state(0);
  let simTimer: ReturnType<typeof setInterval> | null = null;

  const prob = $derived(odds ? Math.max(0.02, Math.min(0.98, odds.base + scores.reduce((a, x) => a + clutchShift(s, x), 0))) : 0);
  const timeoutsLeft = $derived(p ? timeoutsPerRun(s) - (p.timeoutsUsed ?? 0) : 0);

  function pickVariant(i: number) {
    const pool = VARIANTS.filter((v) => v.sport === p!.sport);
    const rng = mulberry32(p!.seed + p!.round * 31 + i * 7);
    return pool[Math.floor(rng() * pool.length)].id;
  }

  function playGame() {
    scores = [];
    simHome = 0; simAway = 0; simClock = 0;
    phase = 'game';
    runSimUntilClutch();
  }

  function runSimUntilClutch() {
    if (simTimer) clearInterval(simTimer);
    const target = ((scores.length + 1) / (CLUTCH_PER_GAME + 1)) * 100;
    simTimer = setInterval(() => {
      simClock = Math.min(100, simClock + 4);
      const edge = odds ? odds.base : 0.5;
      if (Math.random() < 0.35) { if (Math.random() < 0.3 + edge * 0.4) simHome++; else simAway++; }
      if (scores.length < CLUTCH_PER_GAME && simClock >= target) {
        clearInterval(simTimer!); simTimer = null;
        clutchVariant = pickVariant(scores.length);
        phase = 'clutch';
      } else if (scores.length >= CLUTCH_PER_GAME && simClock >= 100) {
        clearInterval(simTimer!); simTimer = null;
        finishGame();
      }
    }, 120);
  }

  function clutchDone(score: number) {
    lastScore = score;
    phase = 'review';
  }

  function acceptClutch() {
    scores = [...scores, lastScore ?? 0];
    if (lastScore !== null && lastScore >= 500) simHome++; else simAway++;
    lastScore = null;
    phase = 'game';
    runSimUntilClutch();
  }

  function useTimeout() {
    if (!s.playoff || timeoutsLeft <= 0) return;
    s.playoff.timeoutsUsed = (s.playoff.timeoutsUsed ?? 0) + 1;
    lastScore = null;
    phase = 'clutch';
  }

  function finishGame() {
    result = game.act((st) => resolvePlayoffGame(st, scores));
    if (result) {
      // Make the displayed final score agree with the outcome.
      if (result.win && simHome <= simAway) simHome = simAway + 1;
      if (!result.win && simAway <= simHome) simAway = simHome + 1;
    }
    phase = 'result';
  }

  function closeResult() {
    if (result?.done) game.act((st) => endPlayoffs(st));
    result = null;
    phase = 'idle';
  }

  $effect(() => () => { if (simTimer) clearInterval(simTimer); });
</script>

{#if !p?.active}
  {@const feat = featuredSport(s.champTier)}
  {@const team = teamPower(s, feat)}
  {@const opp = opponentPower(s.champTier, 3)}
  <div class="col">
    <div class="hero card" style="--c:{SPORT_DEFS[feat].color}">
      <div class="tiny muted">CHAMPIONSHIP TIER {s.champTier}</div>
      <h1>{SPORT_DEFS[feat].emoji} {SPORT_DEFS[feat].name} Playoffs</h1>
      <div class="row" style="margin-top:8px">
        <div class="grow">
          <div class="small muted">Your power vs. Finals opponent</div>
          <div class="display num" style="font-size:22px"><span class="gold">{fmt(team)}</span> <span class="muted">vs</span> {fmt(opp)}</div>
        </div>
        <div class="odd">
          <div class="tiny muted">Base title-game odds</div>
          <div class="display num {baseWinProb(team, opp) >= 0.5 ? 'green-t' : 'red-t'}" style="font-size:22px">{pct(baseWinProb(team, opp))}</div>
        </div>
      </div>
      <div class="bar" style="margin:10px 0 4px"><i style="width:{s.readiness * 100}%"></i></div>
      <div class="tiny muted">Playoff readiness {pct(s.readiness)}</div>
      {#if !s.lineupLocked}<p class="small gold">⚠️ Entering the playoffs locks your lineup for the rest of this run.</p>{/if}
      <button class="primary enter" disabled={!canEnterPlayoffs(s)} onclick={() => game.act((st) => startPlayoffs(st))}>
        {#if s.readiness >= 1}Enter the Playoffs{:else}Enter early · 🏆 {earlyEntryCost(s)}{/if}
      </button>
    </div>

    <div class="section-title"><h3>Upcoming rotation</h3><span class="tiny muted">plan your lineup!</span></div>
    {#each upcomingSports(s, 5) as u, i}
      {@const tp = teamPower(s, u.sport)}
      {@const op = opponentPower(u.tier, 3)}
      <div class="card row up" class:now={i === 0}>
        <span style="font-size:24px">{SPORT_DEFS[u.sport].emoji}</span>
        <div class="grow"><b>Tier {u.tier}</b> · {SPORT_DEFS[u.sport].name}</div>
        <span class="num small">{fmt(tp)} / {fmt(op)}</span>
        <span class="pill num {tp >= op ? 'green-t' : 'red-t'}">{pct(baseWinProb(tp, op))}</span>
      </div>
    {/each}
    <p class="tiny muted">Success is mostly team power: athlete ratings in that sport × economy × coaching × Legacy. Clutch moments can swing each game by about −6% to +8%.</p>
  </div>
{:else}
  <div class="col">
    <div class="card" style="--c:{SPORT_DEFS[p.sport].color}; border-top: 3px solid var(--c)">
      <div class="tiny muted">TIER {p.tier} · {SPORT_DEFS[p.sport].name.toUpperCase()} PLAYOFFS</div>
      <div class="bracket">
        {#each ROUND_NAMES as name, i}
          <div class="rd" class:cur={i === p.round && p.active} class:w={p.results[i] === 'W'} class:l={p.results[i] === 'L'}>
            <div class="tiny">{name}</div>
            <div class="display">{p.results[i] ?? (i === p.round ? '▶' : '·')}</div>
          </div>
        {/each}
      </div>
    </div>

    {#if odds}
      <div class="card">
        <h2>{ROUND_NAMES[p.round]}</h2>
        <div class="row" style="margin:8px 0">
          <div class="grow"><div class="tiny muted">Your power</div><div class="display gold num">{fmt(odds.team)}</div></div>
          <div class="grow" style="text-align:right"><div class="tiny muted">Opponent</div><div class="display num">{fmt(odds.opp)}</div></div>
        </div>
        <div class="probbar"><i style="width:{prob * 100}%"></i><span class="display num">{pct(prob)} win</span></div>

        {#if phase === 'idle'}
          <button class="green enter" onclick={playGame}>Tip off ▶</button>
          <p class="tiny muted">{CLUTCH_PER_GAME} clutch moments per game · {timeoutsLeft} timeout{timeoutsLeft === 1 ? '' : 's'} left this run</p>
        {:else}
          <div class="sim">
            <div class="display num scoreline">{simHome} – {simAway}</div>
            <div class="bar"><i style="width:{simClock}%"></i></div>
            <div class="row clutches">
              {#each Array(CLUTCH_PER_GAME) as _, i}
                <span class="pill num {scores[i] === undefined ? '' : scores[i] >= 500 ? 'green-t' : 'red-t'}">
                  ⚡ {scores[i] === undefined ? '—' : `${clutchShift(s, scores[i]) >= 0 ? '+' : ''}${(clutchShift(s, scores[i]) * 100).toFixed(1)}%`}
                </span>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

{#if phase === 'clutch' && p}
  <MiniGamePlayer variant={clutchVariant} clutch difficulty={miniGameDifficulty(s)} assist={miniGameAssist(s, p.sport)}
    title="⚡ Clutch moment {scores.length + 1}/{CLUTCH_PER_GAME}" subtitle="{ROUND_NAMES[p.round]} · {SPORT_DEFS[p.sport].name}"
    onDone={(sc) => clutchDone(sc)} />
{/if}

{#if phase === 'review' && lastScore !== null}
  <Modal title="Clutch result">
    <div style="text-align:center">
      <div class="display num" style="font-size:44px" class:green-t={lastScore >= 500} class:red-t={lastScore < 500}>{lastScore}</div>
      <p>Momentum {clutchShift(s, lastScore) >= 0 ? '+' : ''}{(clutchShift(s, lastScore) * 100).toFixed(1)}% win probability</p>
    </div>
    <div class="row">
      {#if timeoutsLeft > 0 && lastScore < 750}<button class="ghost grow" onclick={useTimeout}>⏸ Timeout & retry ({timeoutsLeft})</button>{/if}
      <button class="primary grow" onclick={acceptClutch}>Continue</button>
    </div>
  </Modal>
{/if}

{#if phase === 'result' && result}
  <Modal title={result.title ? '🏆 CHAMPIONS!' : result.win ? 'Victory!' : 'Eliminated'}>
    <div style="text-align:center">
      <div class="display num" style="font-size:40px">{simHome} – {simAway}</div>
      <p class="muted small">Final win probability: {pct(result.prob)}</p>
      {#if result.trophies}<p>🏆 +{result.trophies} Trophies · 🎟️ +{result.tokens} Scout Tokens</p>{/if}
      {#if result.title}<p class="gold">Permanent ×1.05 to this sport's venue and team power. Next: Tier {s.champTier}.</p>{/if}
      {#if !result.win}<p class="muted">Rounds you won still pay out. Build power, or Ascend to rebuild your lineup for this sport.</p>{/if}
    </div>
    <button class="primary" style="width:100%" onclick={closeResult}>{result.done ? 'Back to the Arena' : 'Next round'}</button>
  </Modal>
{/if}

<style>
  .hero { border-top: 3px solid var(--c); background: linear-gradient(170deg, color-mix(in srgb, var(--c) 18%, var(--card)), var(--card)); }
  .hero h1 { font-size: 26px; margin-top: 2px; }
  .odd { text-align: right; }
  .enter { width: 100%; padding: 14px; font-size: 17px; margin-top: 10px; }
  .up { padding: 8px 12px; }
  .up.now { border-color: var(--gold); }
  .bracket { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 8px; }
  .rd { background: var(--bg2); border-radius: 8px; padding: 6px; text-align: center; border: 1px solid transparent; }
  .rd.cur { border-color: var(--gold); }
  .rd.w { background: rgba(74, 222, 128, 0.15); color: var(--green); }
  .rd.l { background: rgba(248, 113, 113, 0.15); color: var(--red); }
  .rd .display { font-size: 20px; }
  .probbar { position: relative; height: 28px; background: rgba(248, 113, 113, 0.25); border-radius: 8px; overflow: hidden; }
  .probbar i { position: absolute; inset: 0 auto 0 0; background: linear-gradient(90deg, #22b45f, #4ade80); transition: width 0.4s; }
  .probbar span { position: relative; display: block; text-align: center; line-height: 28px; text-shadow: 0 1px 2px #000; }
  .sim { margin-top: 12px; text-align: center; }
  .scoreline { font-size: 40px; color: #ffd27a; }
  .clutches { justify-content: center; margin-top: 8px; }
</style>
