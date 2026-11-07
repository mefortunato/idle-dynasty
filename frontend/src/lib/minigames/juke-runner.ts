import type { MiniGameContext } from '$lib/engine/minigame-api';
import { runGame, clamp } from './runtime';

/**
 * Juke Runner: swipe/tap to change lane, dodge defenders, rack up yards.
 * Close dodges ("JUKE!") pay bonus yards. Score = yards / target yards * 1000.
 */
interface Defender {
  lane: number;
  y: number;
  threat: boolean;
  passed: boolean;
  seed: number;
}

export default (ctx: MiniGameContext) =>
  runGame(ctx, (api) => {
    const { w, h } = api;
    const LANES = 4;
    const margin = w * 0.06;
    const laneW = (w - margin * 2) / LANES;
    const laneX = (l: number) => margin + laneW * (l + 0.5);
    const runnerY = h * 0.78;
    const pxPerYd = h / 30;
    const baseSpeed = 8.5 + 3.5 * api.diff; // yd/s
    const dur = ctx.durationMs / 1000;
    const speedAt = (s: number) => baseSpeed * (1 + 0.6 * clamp(s / dur, 0, 1));
    const cleanYards = baseSpeed * dur * 1.3;
    const target = cleanYards * 1.5;
    const JUKE_YD = 12;
    const maxHits = ctx.clutch ? 1 : 3;
    const rowGap = 12 - 3 * api.diff; // yards between rows
    const dodgeRange = api.widen(h * 0.2);

    let lane = 1;
    let rx = laneX(lane);
    let yards = 0;
    let bonus = 0;
    let hits = 0;
    let stun = 0;
    let slow = 0;
    let scroll = 0;
    let t = 0;
    let nextRowAt = 6; // yards
    let prevFree = [1, 2];
    let swiped = true;
    let down = false;
    let sx = 0;
    let over = false;
    let overT = 0;
    const defs: Defender[] = [];

    function spawnRow() {
      const count = 1 + (ctx.rng() < 0.5 + 0.3 * api.diff ? 1 : 0) + (ctx.rng() < 0.15 + 0.35 * api.diff ? 1 : 0);
      const lanes = [0, 1, 2, 3];
      for (let i = lanes.length - 1; i > 0; i--) {
        const j = Math.floor(ctx.rng() * (i + 1));
        [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
      }
      const blockedSet = new Set(lanes.slice(0, count));
      let free = [0, 1, 2, 3].filter((l) => !blockedSet.has(l));
      // keep it reachable: some free lane must be within 1 of a previous free lane
      if (!free.some((f) => prevFree.some((p) => Math.abs(p - f) <= 1))) {
        const anchor = prevFree[Math.floor(ctx.rng() * prevFree.length)];
        blockedSet.delete(anchor);
        free = [0, 1, 2, 3].filter((l) => !blockedSet.has(l));
      }
      prevFree = free;
      for (const l of blockedSet) defs.push({ lane: l, y: -40, threat: false, passed: false, seed: ctx.rng() * 6 });
    }

    function changeLane(dir: number) {
      if (over) return;
      const nl = clamp(lane + dir, 0, LANES - 1);
      if (nl !== lane) lane = nl;
    }

    function drawPlayer(g: CanvasRenderingContext2D, x: number, y: number, body: string, helmet: string, s: number, bob: number) {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath();
      g.ellipse(x, y + 20 * s, 15 * s, 6 * s, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = body;
      g.beginPath();
      g.ellipse(x, y + bob, 15 * s, 19 * s, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = helmet;
      g.beginPath();
      g.arc(x, y - 4 * s + bob, 9 * s, 0, Math.PI * 2);
      g.fill();
    }

    return {
      update(dt, elapsed) {
        t = elapsed;
        if (over) {
          overT += dt;
          if (overT > 0.8) api.finish();
          return;
        }
        stun = Math.max(0, stun - dt);
        slow = Math.max(0, slow - dt);
        const sp = speedAt(elapsed / 1000) * (slow > 0 ? 0.55 : 1);
        yards += sp * dt;
        scroll += sp * dt * pxPerYd;
        while (yards >= nextRowAt) {
          spawnRow();
          nextRowAt += rowGap;
        }
        rx += (laneX(lane) - rx) * Math.min(1, dt * 16);
        for (const d of defs) {
          d.y += sp * dt * pxPerYd * 1.12;
          const dyr = runnerY - d.y;
          if (!d.passed && d.lane === lane && dyr > 0 && dyr < dodgeRange) d.threat = true;
          if (!d.passed && Math.abs(dyr) < 26 && Math.abs(laneX(d.lane) - rx) < laneW * 0.42) {
            d.passed = true;
            d.threat = false;
            hits++;
            slow = 1.0;
            stun = 0.6;
            yards = Math.max(0, yards - 8);
            api.shake(12);
            api.popup('TACKLED!', rx, runnerY - 30, '#f87171');
            if (hits >= maxHits) {
              over = true;
              api.popup(ctx.clutch ? 'STOPPED!' : 'DOWN!', w / 2, h * 0.45, '#f87171');
            }
          }
          if (!d.passed && dyr < -26) {
            d.passed = true;
            if (d.threat) {
              bonus += JUKE_YD;
              api.popup(`JUKE! +${JUKE_YD}`, rx, runnerY - 40, '#fde047');
            }
          }
        }
        for (let i = defs.length - 1; i >= 0; i--) if (defs[i].y > h + 60) defs.splice(i, 1);
        api.setScore(((yards + bonus) / target) * 1000);
      },
      draw(g) {
        // field
        const stripe = 5 * pxPerYd;
        for (let i = -1; i < h / stripe + 2; i++) {
          const y = i * stripe + (scroll % (stripe * 2));
          g.fillStyle = Math.abs(i) % 2 ? '#15803d' : '#16a34a';
          g.fillRect(0, y, w, stripe + 1);
        }
        g.fillStyle = '#fff';
        g.fillRect(0, 0, margin * 0.5, h);
        g.fillRect(w - margin * 0.5, 0, margin * 0.5, h);
        g.strokeStyle = 'rgba(255,255,255,0.55)';
        g.lineWidth = 2;
        for (let i = 1; i < LANES; i++) {
          g.setLineDash([10, 14]);
          g.beginPath();
          g.moveTo(margin + laneW * i, 0);
          g.lineTo(margin + laneW * i, h);
          g.stroke();
        }
        g.setLineDash([]);
        for (let i = -1; i < h / (stripe * 2) + 2; i++) {
          const y = i * stripe * 2 + (scroll % (stripe * 2)) + stripe;
          g.strokeStyle = 'rgba(255,255,255,0.6)';
          g.beginPath();
          g.moveTo(0, y);
          g.lineTo(w, y);
          g.stroke();
        }
        // defenders
        for (const d of defs) {
          const x = laneX(d.lane) + Math.sin(t / 220 + d.seed) * 4;
          drawPlayer(g, x, d.y, '#dc2626', '#7f1d1d', 1, Math.sin(t / 90 + d.seed) * 1.5);
          g.fillStyle = '#fff';
          g.font = 'bold 10px system-ui, sans-serif';
          g.textAlign = 'center';
          g.fillText(`${Math.floor(d.seed * 16) + 20}`, x, d.y + 4);
        }
        // runner
        const flash = stun > 0 && Math.floor(t / 70) % 2 === 0;
        g.globalAlpha = flash ? 0.4 : 1;
        drawPlayer(g, rx, runnerY, '#2563eb', '#1e3a8a', 1.1, Math.sin(t / 70) * 2);
        g.fillStyle = '#92400e';
        g.beginPath();
        g.ellipse(rx + 11, runnerY + 4, 7, 4, 0.6, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
        // HUD extras
        g.textAlign = 'center';
        g.fillStyle = '#fff';
        g.font = 'bold 20px system-ui, sans-serif';
        g.fillText(`${Math.floor(yards + bonus)} YDS`, w / 2, 30);
        for (let i = 0; i < maxHits; i++) {
          g.fillStyle = i < maxHits - hits ? '#fff' : 'rgba(255,255,255,0.25)';
          g.beginPath();
          g.arc(w / 2 - (maxHits - 1) * 10 + i * 20, 46, 5.5, 0, Math.PI * 2);
          g.fill();
        }
        if (ctx.clutch && t < 1800) {
          g.globalAlpha = 0.6 + 0.4 * Math.sin(t / 90);
          g.fillStyle = '#fbbf24';
          g.font = 'bold 26px system-ui, sans-serif';
          g.fillText('CLUTCH', w / 2, h * 0.3);
          g.globalAlpha = 1;
        }
        if (t < 2000) {
          g.fillStyle = 'rgba(0,0,0,0.55)';
          g.fillRect(0, h - 40, w, 40);
          g.fillStyle = '#fff';
          g.font = '14px system-ui, sans-serif';
          g.fillText('Swipe or tap left/right to change lanes', w / 2, h - 16);
        }
      },
      onPointerDown(p) {
        sx = p.x;
        swiped = false;
        down = true;
      },
      onPointerMove(p) {
        if (!down || swiped) return;
        if (Math.abs(p.x - sx) > 24) {
          swiped = true;
          changeLane(p.x > sx ? 1 : -1);
        }
      },
      onPointerUp(p) {
        if (!down) return;
        down = false;
        if (swiped) return;
        swiped = true;
        if (Math.abs(p.x - sx) <= 24) changeLane(p.x < w / 2 ? -1 : 1);
      }
    };
  });
