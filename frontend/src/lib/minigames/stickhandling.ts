import type { MiniGameContext } from '$lib/engine/minigame-api';
import { runGame, clamp, lerp } from './runtime';

interface Gate {
  k: number;
  gapX: number;
  halfGap: number;
  hit: boolean;
  scored: boolean;
  y: number;
}

export default (ctx: MiniGameContext) =>
  runGame(ctx, (api) => {
    const { w, h } = api;
    const speed = lerp(150, 270, api.diff);
    const spacing = lerp(130, 120, api.diff);
    const puckY = h * 0.78;
    const pr = 8;
    const coneR = 11;
    const coneStep = 36;
    const halfGap = api.widen(lerp(52, 38, api.diff));
    const startY = -20;
    // gate k reaches puck row at time ((puckY - startY) + k*spacing) / speed
    const reachT = (k: number) => ((puckY - startY + k * spacing) / speed) * 1000 + 600;
    let total = 0;
    while (reachT(total) <= ctx.durationMs - 250) total++;
    if (ctx.clutch) total = Math.min(total, 5);
    total = Math.max(total, 3);

    const gates: Gate[] = [];
    let prevSide = ctx.rng() < 0.5 ? -1 : 1;
    for (let k = 0; k < total; k++) {
      // alternate sides with jitter so the straight line down the middle is never open
      prevSide = ctx.rng() < 0.82 ? -prevSide : prevSide;
      const off = (0.18 + ctx.rng() * 0.16) * w * prevSide;
      gates.push({ k, gapX: clamp(w / 2 + off, halfGap + 20, w - halfGap - 20), halfGap, hit: false, scored: false, y: startY - k * spacing });
    }

    let t = 0;
    let px = w / 2;
    let tx = w / 2;
    let sumQ = 0;
    let hits = 0;
    let resolved = 0;
    let endAt = -1;
    let dragging = false;
    let px0 = px;
    let streak = 0;

    function push() {
      api.setScore(((sumQ - 0.3 * hits) / total) * 1000);
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

    function coneXs(gt: Gate): number[] {
      const xs: number[] = [];
      for (let x = coneStep / 2; x < w; x += coneStep) {
        if (Math.abs(x - gt.gapX) > gt.halfGap) xs.push(x);
      }
      return xs;
    }

    return {
      update(dt, elapsed) {
        t = elapsed;
        px0 = px;
        // puck follows pointer with a speed cap and a little smoothing
        const dx = tx - px;
        const maxStep = 720 * dt;
        px += clamp(dx * Math.min(1, dt * 16), -maxStep, maxStep);
        const sec = Math.max(0, (t - 600) / 1000);
        for (const gt of gates) {
          gt.y = startY - gt.k * spacing + speed * sec;
          if (!gt.hit && gt.y > puckY - coneR - pr - 2 && gt.y < puckY + coneR + pr + 2) {
            for (const cx of coneXs(gt)) {
              if (Math.hypot(px - cx, puckY - gt.y) < coneR + pr - 1) {
                gt.hit = true;
                hits++;
                streak = 0;
                api.shake(10);
                api.popup('CONE! -', cx, puckY - 30, '#f87171');
                push();
                break;
              }
            }
          }
          if (!gt.scored && gt.y > puckY + coneR + pr + 2) {
            gt.scored = true;
            resolved++;
            if (!gt.hit) {
              const d = Math.abs(px0 - gt.gapX) / gt.halfGap;
              const q = 1 - 0.25 * clamp(d, 0, 1);
              sumQ += q;
              streak++;
              api.popup(d < 0.25 ? 'PERFECT!' : streak > 2 ? `x${streak} CLEAN` : 'CLEAN', px, puckY - 34, d < 0.25 ? '#fde047' : '#86efac');
            }
            push();
          }
        }
        if (resolved >= total && endAt < 0) endAt = t + 600;
        if (endAt > 0 && t >= endAt) { endAt = 1e12; api.finish(); }
      },
      onPointerDown(p) { dragging = true; tx = clamp(p.x, pr, w - pr); },
      onPointerMove(p) { if (dragging) tx = clamp(p.x, pr, w - pr); },
      onPointerUp() { dragging = false; },
      draw(g) {
        const ice = g.createLinearGradient(0, 0, 0, h);
        ice.addColorStop(0, '#bfdbfe'); ice.addColorStop(1, '#e0f2fe');
        g.fillStyle = ice; g.fillRect(0, 0, w, h);
        // scrolling ice lines
        const off = ((t / 1000) * speed) % 90;
        g.strokeStyle = 'rgba(147,197,253,0.55)'; g.lineWidth = 1;
        for (let y = -90 + off; y < h; y += 90) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
        g.fillStyle = 'rgba(15,23,42,0.75)'; g.fillRect(0, 0, w, 34);
        g.fillStyle = '#1e293b'; g.fillRect(0, 0, 6, h); g.fillRect(w - 6, 0, 6, h);
        // gates
        for (const gt of gates) {
          if (gt.y < -30 || gt.y > h + 30) continue;
          // gap guide
          g.fillStyle = gt.hit ? 'rgba(248,113,113,0.18)' : 'rgba(34,197,94,0.15)';
          g.fillRect(gt.gapX - gt.halfGap, gt.y - 5, gt.halfGap * 2, 10);
          for (const cx of coneXs(gt)) {
            g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(cx, gt.y + 9, coneR, 4, 0, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#f97316';
            g.beginPath(); g.moveTo(cx, gt.y - coneR); g.lineTo(cx + coneR, gt.y + 8); g.lineTo(cx - coneR, gt.y + 8); g.closePath(); g.fill();
            g.fillStyle = '#fff'; g.fillRect(cx - 6, gt.y - 1, 12, 3);
          }
        }
        // puck + player
        g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(px, puckY + 18, 20, 6, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#854d0e'; g.lineWidth = 4; g.beginPath(); g.moveTo(px + 14, puckY + 34); g.lineTo(px + 2, puckY + 2); g.stroke();
        g.fillStyle = '#1d4ed8'; g.fillRect(px - 12, puckY + 12, 24, 26);
        g.fillStyle = '#111827'; g.beginPath(); g.arc(px, puckY + 8, 9, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#111827'; g.beginPath(); g.arc(px, puckY, pr, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#475569'; g.beginPath(); g.arc(px, puckY - 1.5, pr, Math.PI, 2 * Math.PI); g.fill();
        g.fillStyle = '#fff'; g.font = '13px system-ui, sans-serif'; g.textAlign = 'center';
        g.fillText((ctx.clutch ? 'CLUTCH  ' : '') + `Gates ${resolved} / ${total}   Cones hit: ${hits}`, w / 2, 22);
        overlay(g, 'Drag to steer the puck through the gaps');
      }
    };
  });
