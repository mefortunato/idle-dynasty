import type { MiniGameContext, MiniGameInstance } from '$lib/engine/minigame-api';

/**
 * Shared scaffolding for canvas mini games: fixed-timestep-ish rAF loop, round timer,
 * score clamping, pointer events in CSS-pixel coordinates, HUD + floating text.
 *
 * Usage:
 *   export default (ctx) => runGame(ctx, (api) => ({ update(dt) {...}, draw(g) {...}, onPointerDown(p) {...} }));
 */
export interface Pointer {
  x: number;
  y: number;
  id: number;
}

export interface GameHooks {
  update(dt: number, elapsedMs: number): void;
  draw(g: CanvasRenderingContext2D): void;
  onPointerDown?(p: Pointer): void;
  onPointerMove?(p: Pointer): void;
  onPointerUp?(p: Pointer): void;
  /** Return false to hide the default HUD. */
  hud?: boolean;
}

export interface GameApi {
  ctx: MiniGameContext;
  w: number;
  h: number;
  /** Score in 0..1000 (clamped). */
  score: number;
  addScore(points: number): void;
  setScore(points: number): void;
  /** End the round early (e.g. out of attempts). */
  finish(): void;
  timeLeftMs(): number;
  /** Floating feedback text ("PERFECT!", "+120"). */
  popup(text: string, x: number, y: number, color?: string): void;
  /** Screen shake intensity (px), decays automatically. */
  shake(px: number): void;
  /** Scale a timing window by assist: widen(0.1) → 0.1 * (1 + assist). */
  widen(window: number): number;
  /** Difficulty ramp 0..1 from ctx.difficulty (1..10). */
  diff: number;
}

interface Popup { text: string; x: number; y: number; color: string; t: number }

export function runGame(ctx: MiniGameContext, setup: (api: GameApi) => GameHooks): MiniGameInstance {
  const g = ctx.canvas.getContext('2d')!;
  let raf = 0;
  let done = false;
  let start = performance.now();
  let last = start;
  let shakeAmt = 0;
  const popups: Popup[] = [];

  const api: GameApi = {
    ctx,
    w: ctx.width,
    h: ctx.height,
    score: 0,
    addScore(p) { api.setScore(api.score + p); },
    setScore(p) {
      api.score = Math.max(0, Math.min(1000, Math.round(p)));
      ctx.onScore?.(api.score);
    },
    finish,
    timeLeftMs: () => Math.max(0, ctx.durationMs - (performance.now() - start)),
    popup(text, x, y, color = '#fff') { popups.push({ text, x, y, color, t: 0 }); },
    shake(px) { shakeAmt = Math.max(shakeAmt, px); },
    widen: (w) => w * (1 + ctx.assist),
    diff: Math.max(0, Math.min(1, (ctx.difficulty - 1) / 9))
  };

  const hooks = setup(api);

  function toPointer(e: PointerEvent): Pointer {
    const r = ctx.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * ctx.width, y: ((e.clientY - r.top) / r.height) * ctx.height, id: e.pointerId };
  }
  const down = (e: PointerEvent) => { e.preventDefault(); if (!done) hooks.onPointerDown?.(toPointer(e)); };
  const move = (e: PointerEvent) => { e.preventDefault(); if (!done) hooks.onPointerMove?.(toPointer(e)); };
  const up = (e: PointerEvent) => { e.preventDefault(); if (!done) hooks.onPointerUp?.(toPointer(e)); };
  ctx.canvas.addEventListener('pointerdown', down);
  ctx.canvas.addEventListener('pointermove', move);
  ctx.canvas.addEventListener('pointerup', up);
  ctx.canvas.addEventListener('pointercancel', up);
  ctx.canvas.style.touchAction = 'none';

  function frame(now: number) {
    if (done) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const elapsed = now - start;
    hooks.update(dt, elapsed);
    g.setTransform(ctx.dpr, 0, 0, ctx.dpr, 0, 0);
    g.save();
    if (shakeAmt > 0.2) {
      g.translate((Math.random() - 0.5) * shakeAmt, (Math.random() - 0.5) * shakeAmt);
      shakeAmt *= 0.88;
    }
    hooks.draw(g);
    g.restore();
    // popups
    for (const p of popups) {
      p.t += dt;
      g.globalAlpha = Math.max(0, 1 - p.t / 0.9);
      g.fillStyle = p.color;
      g.font = 'bold 22px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(p.text, p.x, p.y - p.t * 40);
      g.globalAlpha = 1;
    }
    for (let i = popups.length - 1; i >= 0; i--) if (popups[i].t > 0.9) popups.splice(i, 1);
    if (hooks.hud !== false) drawHud(g, api);
    if (elapsed >= ctx.durationMs) finish();
    else raf = requestAnimationFrame(frame);
  }

  function finish() {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    ctx.onFinish(api.score);
  }

  function destroy() {
    done = true;
    cancelAnimationFrame(raf);
    ctx.canvas.removeEventListener('pointerdown', down);
    ctx.canvas.removeEventListener('pointermove', move);
    ctx.canvas.removeEventListener('pointerup', up);
    ctx.canvas.removeEventListener('pointercancel', up);
  }

  start = performance.now();
  last = start;
  raf = requestAnimationFrame(frame);
  return { destroy };
}

export function drawHud(g: CanvasRenderingContext2D, api: GameApi) {
  const t = api.timeLeftMs() / 1000;
  const frac = api.timeLeftMs() / api.ctx.durationMs;
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, 0, api.w, 6);
  g.fillStyle = frac > 0.3 ? '#4ade80' : frac > 0.12 ? '#facc15' : '#f87171';
  g.fillRect(0, 0, api.w * frac, 6);
  g.font = 'bold 16px system-ui, sans-serif';
  g.textAlign = 'left';
  g.fillStyle = '#fff';
  g.fillText(`${t.toFixed(1)}s`, 10, 26);
  g.textAlign = 'right';
  g.fillText(`${api.score}`, api.w - 10, 26);
}

export function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}
export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
