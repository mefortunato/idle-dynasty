<script lang="ts">
  import { onDestroy } from 'svelte';
  import { loadMiniGame } from '$lib/minigames';
  import { VARIANTS_BY_ID } from '$lib/engine/variants';
  import { SPORT_DEFS, MINIGAME_MS, CLUTCH_MS } from '$lib/engine/data';
  import { mulberry32, randomSeed } from '$lib/engine/rng';
  import type { MiniGameInstance } from '$lib/engine/minigame-api';

  let {
    variant, clutch = false, difficulty = 1, assist = 0, title = '', subtitle = '',
    onDone, onCancel
  }: {
    variant: string; clutch?: boolean; difficulty?: number; assist?: number; title?: string; subtitle?: string;
    onDone: (score: number, durationMs: number) => void; onCancel?: () => void;
  } = $props();

  const meta = $derived(VARIANTS_BY_ID[variant]);
  const sport = $derived(SPORT_DEFS[meta.sport]);
  let phase = $state<'intro' | 'count' | 'play' | 'error'>('intro');
  let count = $state(3);
  let score = $state(0);
  let wrap: HTMLDivElement | undefined = $state();
  let canvas: HTMLCanvasElement | undefined = $state();
  let inst: MiniGameInstance | null = null;
  let started = 0;
  let timers: ReturnType<typeof setTimeout>[] = [];

  function begin() {
    phase = 'count';
    count = 3;
    const stepDown = () => {
      count--;
      if (count <= 0) void play();
      else timers.push(setTimeout(stepDown, clutch ? 450 : 600));
    };
    timers.push(setTimeout(stepDown, clutch ? 450 : 600));
  }

  async function play() {
    phase = 'play';
    let factory;
    try { factory = await loadMiniGame(variant); } catch (e) { console.error(e); phase = 'error'; return; }
    await new Promise((r) => requestAnimationFrame(r));
    if (!canvas || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    started = performance.now();
    const durationMs = clutch ? CLUTCH_MS : MINIGAME_MS;
    inst = factory({
      canvas, width: w, height: h, dpr, difficulty, assist, durationMs, clutch,
      rng: mulberry32(randomSeed()),
      onScore: (x) => (score = x),
      onFinish: (final) => {
        const elapsed = performance.now() - started;
        timers.push(setTimeout(() => { inst?.destroy(); inst = null; onDone(Math.max(0, Math.min(1000, Math.round(final))), elapsed); }, 600));
      }
    });
  }

  onDestroy(() => { inst?.destroy(); timers.forEach(clearTimeout); });
</script>

<div class="overlay" style="--c:{sport.color}">
  <div class="top">
    <div class="grow">
      <div class="display t">{title || `${sport.emoji} ${meta.name}`}</div>
      {#if subtitle}<div class="small muted">{subtitle}</div>{/if}
    </div>
    {#if phase === 'play'}<div class="display num gold sc">{score}</div>{/if}
    {#if onCancel && phase === 'intro'}<button class="ghost" onclick={onCancel}>✕</button>{/if}
  </div>
  <div class="stage" bind:this={wrap}>
    {#if phase === 'intro'}
      <div class="intro">
        {#if clutch}<div class="clutch display">⚡ CLUTCH MOMENT ⚡</div>{/if}
        <div class="emoji">{sport.emoji}</div>
        <h2>{meta.name}</h2>
        <p class="muted">{meta.howTo}</p>
        <p class="small muted">{clutch ? `${CLUTCH_MS / 1000}s` : `${MINIGAME_MS / 1000}s`} · Difficulty {difficulty}{assist > 0 ? ` · Lineup assist +${Math.round(assist * 100)}%` : ''}</p>
        <button class="primary go" onclick={begin}>{clutch ? 'Take the shot' : 'Start'}</button>
      </div>
    {:else if phase === 'count'}
      <div class="intro"><div class="count display">{count}</div></div>
    {:else if phase === 'error'}
      <div class="intro"><p>Couldn't load this mini game.</p><button onclick={() => onDone(0, 0)}>Continue</button></div>
    {/if}
    <canvas bind:this={canvas} class:hidden={phase !== 'play'}></canvas>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; z-index: 60; background: var(--bg); display: flex; flex-direction: column; padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom); }
  .top { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 2px solid var(--c); }
  .t { font-size: 18px; }
  .sc { font-size: 26px; }
  .stage { flex: 1; position: relative; max-width: 560px; width: 100%; margin: 0 auto; overflow: hidden; }
  canvas { display: block; position: absolute; inset: 0; touch-action: none; }
  canvas.hidden { visibility: hidden; }
  .intro { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 24px; gap: 10px; z-index: 2; }
  .intro p { max-width: 340px; margin: 0; }
  .emoji { font-size: 64px; }
  .go { padding: 14px 40px; font-size: 18px; margin-top: 8px; }
  .count { font-size: 120px; color: var(--gold); animation: pop 0.6s ease-out infinite; }
  .clutch { color: var(--gold); font-size: 22px; animation: pulse 0.8s ease-in-out infinite alternate; }
  @keyframes pop { from { transform: scale(1.4); opacity: 0.4; } }
  @keyframes pulse { to { transform: scale(1.08); text-shadow: 0 0 16px var(--gold); } }
</style>
