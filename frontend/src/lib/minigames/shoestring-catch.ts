import type { MiniGameContext } from '$lib/engine/minigame-api';
import { runGame, clamp, lerp } from './runtime';

interface Fly {
  launch: { x: number; y: number };
  land: { x: number; y: number };
  t0: number; // ms launch time
  T: number; // seconds of flight
  done: boolean;
  caught: boolean;
}

export default (ctx: MiniGameContext) =>
  runGame(ctx, (api) => {
    const { w, h } = api;
    const dur = ctx.durationMs;
    const T0 = lerp(1.75, 1.15, api.diff);
    const T1 = lerp(1.5, 0.95, api.diff);
    const gap = 0.55;
    const total = ctx.clutch ? 3 : Math.max(3, Math.floor((dur - 1200) / ((((T0 + T1) / 2) + gap) * 1000)));
    const vmax = 330;
    const rc = api.widen(lerp(30, 22, api.diff));
    const yMin = h * 0.16, yMax = h * 0.74;

    let t = 0;
    let fx = w / 2, fy = h * 0.62;
    let tx = fx, ty = fy;
    let face = 1;
    let launched = 0;
    let resolvedCount = 0;
    let sumQ = 0;
    let nextLaunch = 800;
    let endAt = -1;
    let dive = 0;
    const flies: Fly[] = [];

    function launch() {
      const k = launched;
      const T = lerp(T0, T1, total > 1 ? k / (total - 1) : 0);
      const reach = vmax * T * 0.88;
      const dist = reach * lerp(0.4, 1, ctx.rng());
      let lx = fx, ly = fy;
      for (let tries = 0; tries < 12; tries++) {
        const a = ctx.rng() * Math.PI * 2;
        lx = fx + Math.cos(a) * dist;
        ly = fy + Math.sin(a) * dist * 0.8;
        if (lx > 34 && lx < w - 34 && ly > yMin && ly < yMax) break;
      }
      lx = clamp(lx, 34, w - 34);
      ly = clamp(ly, yMin, yMax);
      flies.push({ launch: { x: w / 2, y: h * 0.95 }, land: { x: lx, y: ly }, t0: t, T, done: false, caught: false });
      launched++;
      nextLaunch = t + (T + gap) * 1000;
    }

    function resolve(f: Fly) {
      f.done = true;
      const d = Math.hypot(fx - f.land.x, fy - f.land.y);
      let q = 0;
      let label = 'MISS';
      let col = '#f87171';
      if (d <= rc) { q = 1 - 0.4 * (d / rc); label = d < rc * 0.3 ? 'PERFECT!' : 'CAUGHT!'; col = d < rc * 0.3 ? '#fde047' : '#86efac'; f.caught = true; }
      else if (d <= rc * 1.6) { q = 0.3; label = 'DIVING CATCH'; col = '#fdba74'; dive = 0.3; f.caught = true; }
      else api.shake(9);
      sumQ += q;
      resolvedCount++;
      api.setScore((sumQ / total) * 1000);
      api.popup(label, f.land.x, f.land.y - 24, col);
    }

    function overlay(g: CanvasRenderingContext2D, text: string) {
      g.save();
      g.textAlign = 'center';
      if (ctx.clutch) {
        if (t < 1200) {
          g.globalAlpha = t < 900 ? 1 : (1200 - t) / 300;
          g.font = '900 44px system-ui, sans-serif';
          g.strokeStyle = '#000'; g.lineWidth = 5; g.fillStyle = '#ef4444';
          g.strokeText('CLUTCH', w / 2, h * 0.45);
          g.fillText('CLUTCH', w / 2, h * 0.45);
        }
      }
      g.restore();
      if (t < 2000) {
        g.save();
        g.globalAlpha = t > 1500 ? (2000 - t) / 500 : 1;
        g.font = '14px system-ui, sans-serif';
        const tw = g.measureText(text).width + 24;
        g.fillStyle = 'rgba(0,0,0,0.6)';
        g.fillRect(w / 2 - tw / 2, h - 44, tw, 28);
        g.fillStyle = '#fff'; g.textAlign = 'center';
        g.fillText(text, w / 2, h - 25);
        g.restore();
      }
    }

    const setTarget = (x: number, y: number) => { tx = clamp(x, 16, w - 16); ty = clamp(y, yMin - 20, h * 0.86); };
    let dragging = false;

    return {
      update(dt, elapsed) {
        t = elapsed;
        if (launched < total && t >= nextLaunch) launch();
        // move fielder toward target at limited speed
        const dx = tx - fx, dy = ty - fy;
        const d = Math.hypot(dx, dy);
        const step = vmax * dt;
        if (d > 0.5) {
          const m = Math.min(step, d);
          fx += (dx / d) * m; fy += (dy / d) * m;
          if (Math.abs(dx) > 2) face = dx > 0 ? 1 : -1;
        }
        dive = Math.max(0, dive - dt);
        for (const f of flies) {
          if (!f.done && t - f.t0 >= f.T * 1000) resolve(f);
        }
        if (resolvedCount >= total && endAt < 0) endAt = t + 700;
        if (endAt > 0 && t >= endAt) { endAt = 1e12; api.finish(); }
      },
      onPointerDown(p) { dragging = true; setTarget(p.x, p.y); },
      onPointerMove(p) { if (dragging) setTarget(p.x, p.y); },
      onPointerUp() { dragging = false; },
      draw(g) {
        const grad = g.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#14532d'); grad.addColorStop(1, '#22803a');
        g.fillStyle = grad; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 10; i++) {
          g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
          g.fillRect(0, i * (h / 10), w, h / 10);
        }
        // fence + warning track
        g.fillStyle = '#92400e'; g.fillRect(0, 0, w, h * 0.09);
        g.fillStyle = '#1e3a8a'; g.fillRect(0, 0, w, h * 0.05);
        g.fillStyle = '#fde047'; g.fillRect(0, h * 0.05, w, 3);
        // infield dirt arc
        g.fillStyle = '#b45309';
        g.beginPath(); g.arc(w / 2, h * 1.08, h * 0.2, Math.PI, 2 * Math.PI); g.fill();

        for (const f of flies) {
          if (f.done && t - f.t0 > (f.T + 0.4) * 1000) continue;
          const u = clamp((t - f.t0) / (f.T * 1000), 0, 1);
          const gx = lerp(f.launch.x, f.land.x, u), gy = lerp(f.launch.y, f.land.y, u);
          // landing marker
          if (!f.done) {
            const ringR = rc * (1 + 0.5 * (1 - u));
            g.strokeStyle = `rgba(253,224,71,${0.35 + 0.5 * u})`; g.lineWidth = 2;
            g.setLineDash([5, 4]);
            g.beginPath(); g.arc(f.land.x, f.land.y, ringR, 0, Math.PI * 2); g.stroke();
            g.setLineDash([]);
            g.fillStyle = `rgba(0,0,0,${0.15 + 0.25 * u})`;
            g.beginPath(); g.ellipse(f.land.x, f.land.y, rc * 0.5, rc * 0.28, 0, 0, Math.PI * 2); g.fill();
          }
          const air = f.done ? 0 : Math.sin(Math.PI * u) * 170 * (1 - u * 0.2);
          const by = gy - air;
          const sz = 5 + 4 * Math.sin(Math.PI * u);
          g.fillStyle = 'rgba(0,0,0,0.3)';
          g.beginPath(); g.ellipse(gx, gy, sz * 1.2, sz * 0.6, 0, 0, Math.PI * 2); g.fill();
          if (!f.done) {
            g.fillStyle = '#fff'; g.beginPath(); g.arc(gx, by, sz, 0, Math.PI * 2); g.fill();
            g.strokeStyle = '#dc2626'; g.lineWidth = 1;
            g.beginPath(); g.arc(gx, by, sz * 0.65, 0.4, 1.9); g.stroke();
          } else if (!f.caught) {
            g.fillStyle = '#fff'; g.beginPath(); g.arc(f.land.x, f.land.y, 5, 0, Math.PI * 2); g.fill();
          }
        }
        // fielder
        g.save();
        g.translate(fx, fy);
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(0, 22, 16, 6, 0, 0, Math.PI * 2); g.fill();
        if (dive > 0) g.rotate(face * 1.2);
        g.fillStyle = '#1d4ed8'; g.fillRect(-9, 0, 18, 22);
        g.fillStyle = '#fcd9b6'; g.beginPath(); g.arc(0, -8, 9, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#1e3a8a'; g.beginPath(); g.arc(0, -11, 9.5, Math.PI, 2 * Math.PI); g.fill();
        g.fillRect(face > 0 ? 0 : -14, -12, 14, 3);
        g.fillStyle = '#a16207'; g.beginPath(); g.arc(face * 14, 6, 8, 0, Math.PI * 2); g.fill();
        g.restore();
        // catch radius
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5;
        g.beginPath(); g.arc(fx, fy, rc, 0, Math.PI * 2); g.stroke();

        g.fillStyle = '#fff'; g.font = '13px system-ui, sans-serif'; g.textAlign = 'center';
        g.fillText((ctx.clutch ? 'CLUTCH  ' : '') + `Ball ${Math.min(launched, total)} / ${total}`, w / 2, 22);
        overlay(g, 'Drag your fielder under the ball shadow');
      }
    };
  });
