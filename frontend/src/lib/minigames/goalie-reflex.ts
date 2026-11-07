import type { MiniGameContext } from '$lib/engine/minigame-api';
import { runGame, clamp, lerp } from './runtime';

type Phase = 'wind' | 'flight' | 'rest';

export default (ctx: MiniGameContext) =>
  runGame(ctx, (api) => {
    const { w, h } = api;
    const windDur = ctx.clutch ? 0.7 : 0.55;
    const restDur = 0.55;
    const TA = api.widen(lerp(0.85, 0.5, api.diff));
    const TB = api.widen(lerp(0.7, 0.36, api.diff));
    const fakeP = lerp(0.05, 0.3, api.diff);
    const total = ctx.clutch ? 3 : Math.max(3, Math.floor((ctx.durationMs - 800) / ((windDur + (TA + TB) / 2 + restDur) * 1000)));
    const net = { x: w * 0.1, y: h * 0.4, w: w * 0.8, h: h * 0.36 };
    const shooter = { x: w / 2, y: h * 0.2 };
    const quadCenter = (q: number) => ({
      x: net.x + net.w * (q % 2 === 0 ? 0.25 : 0.75),
      y: net.y + net.h * (q < 2 ? 0.25 : 0.75)
    });

    let t = 0;
    let phase: Phase = 'wind';
    let phaseT = -0.6; // short intro delay
    let shots = 0;
    let sumQ = 0;
    let target = 0;
    let tell = 0;
    let sel = -1;
    let selT = 0;
    let T = TA;
    let aimPt = quadCenter(0);
    let glove = { x: w / 2, y: net.y + net.h / 2 };
    let flash = 0;
    let flashCol = '#fff';
    let ending = false;
    let lastQuad = -1;

    function newShot() {
      target = Math.floor(ctx.rng() * 4);
      tell = ctx.rng() < fakeP ? (target + 1 + Math.floor(ctx.rng() * 3)) % 4 : target;
      T = lerp(TA, TB, total > 1 ? shots / (total - 1) : 0);
      const c = quadCenter(target);
      aimPt = { x: c.x + (ctx.rng() - 0.5) * net.w * 0.28, y: c.y + (ctx.rng() - 0.5) * net.h * 0.28 };
      sel = -1;
      selT = 0;
    }
    newShot();

    function arrive() {
      let q = 0, label = 'GOAL!', col = '#f87171';
      if (sel === target) {
        const f = selT <= 0.05 ? 1 : clamp(1 - selT / T, 0, 1);
        q = 0.5 + 0.5 * f;
        label = f > 0.8 ? 'GREAT SAVE!' : 'SAVE!';
        col = f > 0.8 ? '#fde047' : '#86efac';
        flashCol = '#86efac';
      } else {
        api.shake(12);
        flashCol = '#ef4444';
        if (sel < 0) label = 'TOO SLOW';
      }
      flash = 1;
      sumQ += q;
      shots++;
      api.setScore((sumQ / total) * 1000);
      api.popup(label, aimPt.x, aimPt.y - 20, col);
      lastQuad = target;
      phase = 'rest';
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
        flash = Math.max(0, flash - dt * 2.5);
        // glove eases toward selection
        const gc = sel >= 0 ? quadCenter(sel) : { x: w / 2, y: net.y + net.h / 2 };
        glove.x += (gc.x - glove.x) * Math.min(1, dt * 14);
        glove.y += (gc.y - glove.y) * Math.min(1, dt * 14);
        if (phase === 'wind' && phaseT >= windDur) { phase = 'flight'; phaseT = 0; }
        else if (phase === 'flight' && phaseT >= T) arrive();
        else if (phase === 'rest' && phaseT >= restDur) {
          if (shots >= total) { ending = true; api.finish(); return; }
          newShot(); phase = 'wind'; phaseT = 0;
        }
      },
      onPointerDown(p) {
        if (phase === 'rest') return;
        if (phase === 'wind' && phaseT < 0) return;
        const q = (p.x < w / 2 ? 0 : 1) + (p.y < net.y + net.h / 2 ? 0 : 2);
        sel = q;
        selT = phase === 'wind' ? 0 : phaseT;
      },
      draw(g) {
        // rink backdrop
        const bg = g.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, '#0f172a'); bg.addColorStop(0.25, '#cbd5e1'); bg.addColorStop(1, '#e2e8f0');
        g.fillStyle = bg; g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(220,38,38,0.5)'; g.fillRect(0, net.y + net.h + 14, w, 3);
        // shooter
        const lean = phase === 'wind' || phase === 'flight' ? (quadCenter(tell).x - w / 2) / (net.w / 4) : 0;
        const wp = phase === 'wind' ? clamp(phaseT / windDur, 0, 1) : 1;
        g.save();
        g.translate(shooter.x, shooter.y);
        g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(0, 40, 24, 7, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#dc2626'; g.fillRect(-14, 0, 28, 36);
        g.fillStyle = '#fff'; g.fillRect(-14, 12, 28, 5);
        g.fillStyle = '#111827'; g.beginPath(); g.arc(0, -8, 11, 0, Math.PI * 2); g.fill();
        // stick telegraph: blade sweeps toward tell side/height
        const tellRow = tell < 2 ? -1 : 1;
        const bx = lean * 22 * wp, by = 28 + tellRow * 6 * wp;
        g.strokeStyle = '#854d0e'; g.lineWidth = 4;
        g.beginPath(); g.moveTo(10, 8); g.lineTo(bx + (lean >= 0 ? 24 : -24) * 0.2 + 10, by + 6); g.stroke();
        g.fillStyle = '#111827'; g.fillRect(bx + 4, by + 4, 14, 5);
        // eyes glance
        g.fillStyle = '#fde047';
        g.fillRect(-6 + lean * 2.5 * wp, -10 + tellRow * 2 * wp, 4, 3);
        g.fillRect(2 + lean * 2.5 * wp, -10 + tellRow * 2 * wp, 4, 3);
        g.restore();
        // net
        g.fillStyle = 'rgba(15,23,42,0.85)'; g.fillRect(net.x, net.y, net.w, net.h);
        for (let q = 0; q < 4; q++) {
          const c = quadCenter(q);
          const qx = c.x - net.w / 4, qy = c.y - net.h / 4;
          g.fillStyle = sel === q ? 'rgba(74,222,128,0.28)' : 'rgba(255,255,255,0.04)';
          g.fillRect(qx + 2, qy + 2, net.w / 2 - 4, net.h / 2 - 4);
          g.fillStyle = 'rgba(255,255,255,0.35)'; g.font = 'bold 12px system-ui, sans-serif'; g.textAlign = 'center';
        }
        g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1;
        for (let x = net.x; x <= net.x + net.w; x += 14) { g.beginPath(); g.moveTo(x, net.y); g.lineTo(x, net.y + net.h); g.stroke(); }
        for (let y = net.y; y <= net.y + net.h; y += 14) { g.beginPath(); g.moveTo(net.x, y); g.lineTo(net.x + net.w, y); g.stroke(); }
        g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(w / 2, net.y); g.lineTo(w / 2, net.y + net.h); g.moveTo(net.x, net.y + net.h / 2); g.lineTo(net.x + net.w, net.y + net.h / 2); g.stroke();
        g.fillStyle = '#dc2626';
        g.fillRect(net.x - 6, net.y - 6, net.w + 12, 6); g.fillRect(net.x - 6, net.y - 6, 6, net.h + 6); g.fillRect(net.x + net.w, net.y - 6, 6, net.h + 6);
        // glove
        g.fillStyle = '#facc15'; g.strokeStyle = '#a16207'; g.lineWidth = 2;
        g.beginPath(); g.arc(glove.x, glove.y, 20, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = '#a16207'; g.fillRect(glove.x - 14, glove.y - 2, 28, 3);
        // puck
        if (phase === 'flight') {
          const p = clamp(phaseT / T, 0, 1);
          const e = p * p * 0.5 + p * 0.5;
          const px = lerp(shooter.x, aimPt.x, e), py = lerp(shooter.y + 40, aimPt.y, e);
          const r = lerp(5, 14, e);
          g.strokeStyle = 'rgba(17,24,39,0.25)'; g.lineWidth = r;
          g.beginPath(); g.moveTo(lerp(shooter.x, aimPt.x, Math.max(0, e - 0.18)), lerp(shooter.y + 40, aimPt.y, Math.max(0, e - 0.18))); g.lineTo(px, py); g.stroke();
          g.fillStyle = '#111827'; g.beginPath(); g.ellipse(px, py, r, r * 0.7, 0, 0, Math.PI * 2); g.fill();
        } else if (phase === 'rest' && lastQuad >= 0) {
          g.fillStyle = '#111827'; g.beginPath(); g.ellipse(aimPt.x, aimPt.y, 14, 10, 0, 0, Math.PI * 2); g.fill();
        }
        if (flash > 0) { g.globalAlpha = flash * 0.35; g.fillStyle = flashCol; g.fillRect(0, 0, w, h); g.globalAlpha = 1; }
        g.fillStyle = '#fff'; g.font = '13px system-ui, sans-serif'; g.textAlign = 'center';
        g.fillText((ctx.clutch ? 'CLUTCH  ' : '') + `Shot ${Math.min(shots + (phase === 'rest' ? 0 : 1), total)} / ${total}`, w / 2, 22);
        overlay(g, 'Tap the net quadrant where the puck is headed');
      }
    };
  });
