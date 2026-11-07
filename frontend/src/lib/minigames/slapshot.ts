import type { MiniGameContext } from '$lib/engine/minigame-api';
import { runGame, clamp, lerp } from './runtime';

type Phase = 'ready' | 'wind' | 'shot' | 'rest';

export default (ctx: MiniGameContext) =>
  runGame(ctx, (api) => {
    const { w, h } = api;
    const total = ctx.clutch ? 2 : Math.round(ctx.durationMs / 2000);
    const goalY = h * 0.12;
    const goalHalf = w * 0.2;
    const goalCx = w / 2;
    const start = { x: w / 2, y: h * 0.84 };
    const rows = [
      { y: h * 0.5, dir: 1, phase: 0 },
      { y: h * 0.33, dir: -1, phase: 50 }
    ];
    const bw = lerp(44, 64, api.diff);
    const nB = 3;
    const bSpeed = lerp(55, 130, api.diff);
    const L = w + bw;
    const thr = 0.9 - (api.widen(0.08) - 0.08);
    const windFreq = lerp(0.85, 1.4, api.diff);

    let t = 0;
    let phase: Phase = 'ready';
    let phaseT = 0;
    let windT = 0;
    let aimX = w / 2;
    let power = 0;
    let shots = 0;
    let sumQ = 0;
    let puck = { x: start.x, y: start.y };
    let vel = { x: 0, y: 0 };
    let powerQ = 0;
    let ending = false;
    let flash = 0;
    let flashCol = '#fff';
    let netShake = 0;
    let trail: { x: number; y: number }[] = [];

    const blockerX = (row: (typeof rows)[number], k: number) => {
      const v = (row.phase + row.dir * bSpeed * (t / 1000) + (k * L) / nB) % L;
      return (v < 0 ? v + L : v) - bw / 2;
    };
    const goalieX = () => goalCx + Math.sin(t / 1000 * lerp(1.6, 2.8, api.diff)) * goalHalf * 0.6;
    const tri = (x: number) => 1 - Math.abs(2 * (x - Math.floor(x)) - 1);

    function result(q: number, label: string, col: string, x: number, y: number) {
      sumQ += q;
      shots++;
      api.setScore((sumQ / total) * 1000);
      api.popup(label, x, y, col);
      if (q < 0.3) api.shake(9);
      phase = 'rest';
      phaseT = 0;
    }

    function release() {
      power = tri(windT * windFreq);
      powerQ = clamp((power - 0.4) / (thr - 0.4), 0, 1);
      const speed = lerp(240, 900, powerQ);
      const dx = aimX - start.x, dy = goalY - start.y;
      const d = Math.hypot(dx, dy);
      vel = { x: (dx / d) * speed, y: (dy / d) * speed };
      puck = { x: start.x, y: start.y };
      trail = [];
      phase = 'shot';
      phaseT = 0;
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

    return {
      update(dt, elapsed) {
        t = elapsed;
        if (ending) return;
        phaseT += dt;
        flash = Math.max(0, flash - dt * 2);
        netShake = Math.max(0, netShake - dt * 3);
        if (phase === 'wind') {
          windT += dt;
        } else if (phase === 'shot') {
          trail.push({ x: puck.x, y: puck.y });
          if (trail.length > 8) trail.shift();
          const prevY = puck.y;
          puck.x += vel.x * dt; puck.y += vel.y * dt;
          // blockers
          for (const row of rows) {
            if ((prevY - row.y) * (puck.y - row.y) <= 0 || Math.abs(puck.y - row.y) < 12) {
              for (let k = 0; k < nB; k++) {
                const bx = blockerX(row, k);
                if (Math.abs(puck.x - bx) < bw / 2 + 6 && Math.abs(puck.y - row.y) < 20) {
                  result(0, 'BLOCKED!', '#f87171', puck.x, puck.y - 10);
                  return;
                }
              }
            }
          }
          if (puck.y <= goalY) {
            puck.y = goalY;
            const off = Math.abs(puck.x - goalCx);
            const post = Math.abs(off - goalHalf);
            if (off > goalHalf + 6) {
              result(0, 'WIDE', '#f87171', puck.x, goalY + 30);
            } else if (post < 5) {
              netShake = 1;
              result(0.12, 'POST!', '#fdba74', puck.x, goalY + 30);
            } else if (off > goalHalf) {
              result(0, 'WIDE', '#f87171', puck.x, goalY + 30);
            } else if (Math.abs(puck.x - goalieX()) < 20) {
              result(0.2, 'SAVED', '#93c5fd', puck.x, goalY + 30);
            } else {
              const corner = clamp((off / goalHalf - 0.3) / 0.6, 0, 1);
              const q = 0.5 + 0.25 * powerQ + 0.25 * corner;
              flash = 1; flashCol = q > 0.85 ? '#fde047' : '#fff'; netShake = 1;
              result(q, q > 0.9 ? 'TOP CORNER!' : powerQ > 0.9 ? 'GOAL! +power' : 'GOAL!', q > 0.85 ? '#fde047' : '#86efac', puck.x, goalY + 30);
            }
          }
        } else if (phase === 'rest') {
          if (phaseT > (ctx.clutch ? 0.9 : 0.85)) {
            if (shots >= total) { ending = true; api.finish(); return; }
            phase = 'ready'; phaseT = 0;
            puck = { x: start.x, y: start.y };
          }
        }
      },
      onPointerDown(p) {
        if (phase === 'ready') {
          aimX = clamp(p.x, w * 0.08, w * 0.92);
          windT = 0; phase = 'wind'; phaseT = 0;
        }
      },
      onPointerMove(p) { if (phase === 'wind') aimX = clamp(p.x, w * 0.08, w * 0.92); },
      onPointerUp() { if (phase === 'wind') release(); },
      draw(g) {
        // ice
        const ice = g.createLinearGradient(0, 0, 0, h);
        ice.addColorStop(0, '#dbeafe'); ice.addColorStop(1, '#bfdbfe');
        g.fillStyle = ice; g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(147,197,253,0.6)'; g.lineWidth = 1;
        for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(0, (h * i) / 8); g.lineTo(w, (h * i) / 8); g.stroke(); }
        // lines
        g.fillStyle = 'rgba(37,99,235,0.45)'; g.fillRect(0, h * 0.62, w, 8);
        g.fillStyle = 'rgba(220,38,38,0.7)'; g.fillRect(0, goalY - 2, w, 3);
        g.strokeStyle = 'rgba(220,38,38,0.5)'; g.lineWidth = 2;
        g.beginPath(); g.arc(w / 2, h * 0.84, 46, 0, Math.PI * 2); g.stroke();
        // boards
        g.fillStyle = 'rgba(15,23,42,0.75)'; g.fillRect(0, 0, w, 34);
        g.fillStyle = '#1e293b'; g.fillRect(0, 0, w, 6); g.fillRect(0, 0, 6, h); g.fillRect(w - 6, 0, 6, h);
        // goal
        const sx = netShake > 0 ? (Math.random() - 0.5) * 4 : 0;
        g.fillStyle = 'rgba(15,23,42,0.75)';
        g.fillRect(goalCx - goalHalf + sx, goalY - 40, goalHalf * 2, 40);
        g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1;
        for (let i = -goalHalf; i <= goalHalf; i += 10) { g.beginPath(); g.moveTo(goalCx + i + sx, goalY - 40); g.lineTo(goalCx + i + sx, goalY); g.stroke(); }
        for (let j = 0; j <= 40; j += 10) { g.beginPath(); g.moveTo(goalCx - goalHalf + sx, goalY - j); g.lineTo(goalCx + goalHalf + sx, goalY - j); g.stroke(); }
        g.fillStyle = '#dc2626'; g.fillRect(goalCx - goalHalf - 4, goalY - 42, 5, 44); g.fillRect(goalCx + goalHalf - 1, goalY - 42, 5, 44); g.fillRect(goalCx - goalHalf - 4, goalY - 44, goalHalf * 2 + 8, 4);
        // goalie
        const gx = goalieX();
        g.fillStyle = '#0ea5e9'; g.fillRect(gx - 16, goalY - 30, 32, 26);
        g.fillStyle = '#f1f5f9'; g.beginPath(); g.arc(gx, goalY - 34, 8, 0, Math.PI * 2); g.fill();
        if (flash > 0) { g.fillStyle = flashCol; g.globalAlpha = flash * 0.5; g.fillRect(0, 0, w, h); g.globalAlpha = 1; }
        // blockers
        for (const row of rows) {
          for (let k = 0; k < nB; k++) {
            const bx = blockerX(row, k);
            g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(bx - 2, row.y - 8, bw + 4, 24);
            g.fillStyle = '#dc2626'; g.fillRect(bx, row.y - 14, bw, 22);
            g.fillStyle = '#fff'; g.fillRect(bx, row.y - 8, bw, 4);
            g.fillStyle = '#111827'; g.beginPath(); g.arc(bx + bw / 2, row.y - 20, 8, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#334155'; g.fillRect(bx + bw / 2 + row.dir * 14 - 2, row.y - 8, 4, 26);
          }
        }
        // aim line
        if (phase === 'wind') {
          g.setLineDash([6, 6]); g.strokeStyle = 'rgba(30,64,175,0.8)'; g.lineWidth = 2;
          g.beginPath(); g.moveTo(start.x, start.y); g.lineTo(aimX, goalY); g.stroke(); g.setLineDash([]);
          g.beginPath(); g.arc(aimX, goalY, 6, 0, Math.PI * 2); g.stroke();
        }
        // player
        g.fillStyle = '#1d4ed8'; g.fillRect(start.x - 12, start.y + 8, 24, 24);
        g.fillStyle = '#111827'; g.beginPath(); g.arc(start.x, start.y + 4, 9, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#854d0e'; g.lineWidth = 3; g.beginPath(); g.moveTo(start.x + 12, start.y + 24); g.lineTo(start.x + 2, start.y - 4); g.stroke();
        // puck trail + puck
        for (let i = 0; i < trail.length; i++) {
          g.fillStyle = `rgba(17,24,39,${(i / trail.length) * 0.35})`;
          g.beginPath(); g.arc(trail[i].x, trail[i].y, 6, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = '#111827'; g.beginPath(); g.arc(puck.x, puck.y, 7, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#475569'; g.beginPath(); g.arc(puck.x, puck.y - 1.5, 7, Math.PI, 2 * Math.PI); g.fill();
        // power meter
        const mx = 16, my = h * 0.52, mh = h * 0.3, mw = 18;
        g.fillStyle = 'rgba(15,23,42,0.6)'; g.fillRect(mx, my, mw, mh);
        g.fillStyle = 'rgba(74,222,128,0.8)'; g.fillRect(mx, my, mw, mh * (1 - thr));
        const pv = phase === 'wind' ? tri(windT * windFreq) : phase === 'shot' || phase === 'rest' ? power : 0;
        g.fillStyle = '#facc15'; g.fillRect(mx - 3, my + mh * (1 - pv) - 2, mw + 6, 4);
        g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.strokeRect(mx, my, mw, mh);
        g.fillStyle = '#fff'; g.font = '13px system-ui, sans-serif'; g.textAlign = 'center';
        g.fillText((ctx.clutch ? 'CLUTCH  ' : '') + `Shot ${Math.min(shots + (phase === 'rest' ? 0 : 1), total)} / ${total}`, w / 2, 22);
        overlay(g, 'Hold to wind up, drag to aim, release in the green');
      }
    };
  });
