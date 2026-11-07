import type { MiniGameContext, MiniGameInstance } from '$lib/engine/minigame-api';
import { runGame, clamp, lerp } from './runtime';

interface Vec { x: number; y: number }
interface Defender { x: number; y: number; baseX: number; baseY: number; phase: number; freq: number; amp: number }
type State = 'ready' | 'live' | 'result';

const BALL_SPEED = 400;

export default (ctx: MiniGameContext): MiniGameInstance =>
  runGame(ctx, (api) => {
    const { w, h } = api;
    const rng = ctx.rng;
    const t0 = performance.now();
    const clock = () => (performance.now() - t0) / 1000;

    const totalPlays = ctx.clutch ? 2 : 10;
    const runnerSpeed = 235;
    const defSpeed = lerp(105, 185, api.diff);
    const defDelay = lerp(0.32, 0.14, api.diff);
    const defCount = api.diff > 0.45 ? 4 : 3;
    const pickR = 17 * (1 + ctx.assist);
    const hitR = 15;
    const goalY = h * 0.1;
    const passer: Vec = { x: w / 2, y: h * 0.9 };

    let state: State = 'ready';
    let play = 0;
    let sum = 0;
    let tLive = 0;
    let resultT = 0;
    let resultMsg = '';
    let resultOk = false;
    let ball: Vec = { x: passer.x, y: passer.y - 14 };
    let ballFlying = false;
    let target: Vec = { x: 0, y: 0 };
    let runner: Vec = { x: w / 2, y: h * 0.72 };
    let runnerStartY = runner.y;
    let runnerBob = 0;
    let hover: Vec | null = null;
    let defenders: Defender[] = [];
    let trail: Vec[] = [];
    let tw = 0;

    function setupPlay(): void {
      runner = { x: lerp(w * 0.18, w * 0.82, rng()), y: lerp(h * 0.66, h * 0.76, rng()) };
      runnerStartY = runner.y;
      ball = { x: passer.x, y: passer.y - 14 };
      ballFlying = false;
      trail = [];
      defenders = [];
      for (let i = 0; i < defCount; i++) {
        const bx = lerp(w * 0.14, w * 0.86, (i + 0.5) / defCount) + (rng() - 0.5) * 24;
        const by = lerp(h * 0.34, h * 0.56, rng());
        defenders.push({ x: bx, y: by, baseX: bx, baseY: by, phase: rng() * 6.28, freq: 0.7 + rng() * 0.8, amp: 14 + rng() * 22 });
      }
      state = 'ready';
      tLive = 0;
    }
    setupPlay();

    function nearestOnSeg(p: Vec, a: Vec, b: Vec): Vec {
      const dx = b.x - a.x, dy = b.y - a.y;
      const l2 = dx * dx + dy * dy || 1;
      const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1);
      return { x: a.x + dx * t, y: a.y + dy * t };
    }
    const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

    function end(ok: boolean, msg: string, pts: number): void {
      state = 'result';
      resultT = 0;
      resultOk = ok;
      resultMsg = msg;
      sum += pts;
      play++;
      api.setScore((sum / (totalPlays * 100)) * 1000);
      if (ok) api.popup(`+${Math.round(pts)}`, runner.x, runner.y - 24, '#facc15');
      else api.shake(9);
      api.popup(msg, w / 2, h * 0.5, ok ? '#4ade80' : '#f87171');
    }

    return {
      onPointerMove(p) { hover = { x: p.x, y: p.y }; },
      onPointerDown(p) {
        hover = { x: p.x, y: p.y };
        if (state !== 'ready' || p.y > passer.y - 40) return;
        target = { x: clamp(p.x, 14, w - 14), y: clamp(p.y, goalY, passer.y - 40) };
        state = 'live';
        tLive = 0;
        ballFlying = true;
        // each defender anticipates a point on the passing lane
        const lane = { a: passer, b: target };
        for (const d of defenders) {
          const n = nearestOnSeg(d, lane.a, lane.b);
          d.baseX = lerp(n.x, target.x, 0.4);
          d.baseY = lerp(n.y, target.y, 0.4);
        }
      },
      update(dt) {
        tw += dt;
        runnerBob += dt * 6;
        if (state === 'ready') {
          const tt = clock();
          for (const d of defenders) {
            d.x = d.baseX + Math.sin(tt * d.freq + d.phase) * d.amp;
          }
          return;
        }
        if (state === 'result') {
          resultT += dt;
          if (resultOk && ballFlying === false) { /* ball stays with runner */ }
          if (resultT > 0.9) {
            if (play >= totalPlays) api.finish();
            else setupPlay();
          }
          return;
        }
        // live
        tLive += dt;
        trail.push({ x: ball.x, y: ball.y });
        if (trail.length > 10) trail.shift();
        // ball
        const bd = dist(ball, target);
        if (bd > 1) {
          const s = Math.min(bd, BALL_SPEED * dt);
          ball.x += ((target.x - ball.x) / bd) * s;
          ball.y += ((target.y - ball.y) / bd) * s;
        } else ballFlying = false;
        // runner
        if (tLive > 0.06) {
          const rd = dist(runner, target);
          if (rd > 1) {
            const s = Math.min(rd, runnerSpeed * dt);
            runner.x += ((target.x - runner.x) / rd) * s;
            runner.y += ((target.y - runner.y) / rd) * s;
          }
        }
        // defenders
        if (tLive > defDelay) {
          for (const d of defenders) {
            const aim = ballFlying ? { x: d.baseX, y: d.baseY } : target;
            const dd = dist(d, aim);
            if (dd > 1) {
              const s = Math.min(dd, defSpeed * dt);
              d.x += ((aim.x - d.x) / dd) * s;
              d.y += ((aim.y - d.y) / dd) * s;
            }
          }
        }
        // outcomes
        for (const d of defenders) {
          if (dist(d, ball) < hitR) { end(false, 'INTERCEPTED!', 0); return; }
        }
        if (dist(runner, ball) < pickR) {
          let minD = 999;
          for (const d of defenders) minD = Math.min(minD, dist(d, runner));
          const depth = clamp((runnerStartY - target.y) / (runnerStartY - goalY), 0, 1);
          const sep = clamp(minD / 70, 0, 1);
          const pts = 100 * (0.12 + 0.62 * depth + 0.26 * sep);
          const msg = depth > 0.8 ? 'THROUGH ON GOAL!' : sep > 0.7 ? 'THREADED!' : 'COMPLETE';
          end(true, msg, pts);
          return;
        }
        if (tLive > 3.4) end(false, 'TOO SLOW', 0);
      },
      draw(g) {
        // pitch
        for (let i = 0; i < 10; i++) {
          g.fillStyle = i % 2 ? '#2f8f46' : '#359a4d';
          g.fillRect(0, (h / 10) * i, w, h / 10 + 1);
        }
        g.strokeStyle = 'rgba(255,255,255,0.65)';
        g.lineWidth = 2;
        g.strokeRect(8, goalY - 12, w - 16, h - goalY - 4);
        g.strokeRect(w * 0.2, goalY - 12, w * 0.6, h * 0.17);
        g.strokeRect(w * 0.34, goalY - 12, w * 0.32, h * 0.07);
        g.beginPath();
        g.arc(w / 2, h * 0.5, 44, 0, Math.PI * 2);
        g.moveTo(8, h * 0.5);
        g.lineTo(w - 8, h * 0.5);
        g.stroke();
        // goal
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.fillRect(w * 0.38, goalY - 22, w * 0.24, 10);
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fillRect(w * 0.38 + 3, goalY - 30, w * 0.24 - 6, 10);

        // hover guide
        if (state === 'ready' && hover && hover.y < passer.y - 40) {
          g.setLineDash([6, 6]);
          g.strokeStyle = 'rgba(255,255,255,0.45)';
          g.beginPath();
          g.moveTo(passer.x, passer.y);
          g.lineTo(hover.x, hover.y);
          g.stroke();
          g.setLineDash([]);
        }
        if (state !== 'ready') {
          g.strokeStyle = 'rgba(255,255,255,0.5)';
          g.lineWidth = 2;
          g.beginPath();
          g.arc(target.x, target.y, 10 + Math.sin(tw * 10) * 2, 0, Math.PI * 2);
          g.stroke();
          g.beginPath();
          g.moveTo(target.x - 6, target.y - 6); g.lineTo(target.x + 6, target.y + 6);
          g.moveTo(target.x + 6, target.y - 6); g.lineTo(target.x - 6, target.y + 6);
          g.stroke();
        }
        const player = (p: Vec, fill: string, ring: string, r = 12, bob = 0) => {
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.beginPath(); g.ellipse(p.x, p.y + r * 0.7, r, r * 0.45, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = fill;
          g.strokeStyle = ring;
          g.lineWidth = 2.5;
          g.beginPath(); g.arc(p.x, p.y + bob, r, 0, Math.PI * 2); g.fill(); g.stroke();
        };
        // defender threat zones
        for (const d of defenders) {
          g.fillStyle = 'rgba(239,68,68,0.12)';
          g.beginPath(); g.arc(d.x, d.y, 30, 0, Math.PI * 2); g.fill();
        }
        for (const d of defenders) player(d, '#dc2626', '#7f1d1d');
        player(passer, '#2563eb', '#fff');
        player(runner, '#38bdf8', '#facc15', 12, state === 'ready' ? Math.sin(runnerBob) * 1.5 : 0);
        if (state === 'ready') {
          g.strokeStyle = 'rgba(250,204,21,0.8)';
          g.lineWidth = 2;
          g.beginPath(); g.arc(runner.x, runner.y, 20 + Math.sin(tw * 5) * 2, 0, Math.PI * 2); g.stroke();
        }
        // ball trail + ball
        for (let i = 0; i < trail.length; i++) {
          g.fillStyle = `rgba(255,255,255,${(i / trail.length) * 0.4})`;
          g.beginPath(); g.arc(trail[i].x, trail[i].y, 4, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = '#fff';
        g.strokeStyle = '#111';
        g.lineWidth = 1.5;
        g.beginPath(); g.arc(ball.x, ball.y, 6.5, 0, Math.PI * 2); g.fill(); g.stroke();
        // plays counter
        g.fillStyle = 'rgba(0,0,0,0.4)';
        g.font = 'bold 12px system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText(`Play ${Math.min(play + (state === 'result' ? 0 : 1), totalPlays)}/${totalPlays}`, w / 2, 24);
        if (state === 'result' && !resultOk) {
          g.fillStyle = 'rgba(239,68,68,0.15)';
          g.fillRect(0, 0, w, h);
        }
        const t = clock();
        if (ctx.clutch && t < 1.8) clutchBanner(g, w, t);
        hint(g, w, h, 'Tap where the ball should go. Beat the defenders!', t);
      }
    };
  });

function hint(g: CanvasRenderingContext2D, w: number, h: number, text: string, t: number): void {
  if (t > 2.2) return;
  g.save();
  g.globalAlpha = Math.min(1, 2.2 - t);
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fillRect(0, h - 34, w, 34);
  g.fillStyle = '#fff';
  g.font = '13px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText(text, w / 2, h - 12);
  g.restore();
}

function clutchBanner(g: CanvasRenderingContext2D, w: number, t: number): void {
  g.save();
  g.globalAlpha = Math.min(1, (1.8 - t) * 2);
  const s = 1 + Math.sin(t * 14) * 0.04;
  g.translate(w / 2, 70);
  g.scale(s, s);
  g.font = '900 34px system-ui, sans-serif';
  g.textAlign = 'center';
  g.lineWidth = 5;
  g.strokeStyle = '#000';
  g.strokeText('CLUTCH', 0, 0);
  g.fillStyle = '#f43f5e';
  g.fillText('CLUTCH', 0, 0);
  g.restore();
}
