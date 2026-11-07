import type { MiniGameContext } from '$lib/engine/minigame-api';
import { runGame, clamp } from './runtime';

/**
 * Keepy-Uppy: tap the ball as it falls to juggle it. Ground touch ends the round.
 * Score = sum(touch quality) / expected touches for the duration * 1000.
 */
export default (ctx: MiniGameContext) =>
  runGame(ctx, (api) => {
    const { w, h } = api;
    const R = w * 0.085;
    const groundY = h * 0.9;
    const H = h * 0.34; // kick apex height
    const grav = (H * 2) / Math.pow(0.34, 2) * (1 + 0.55 * api.diff);
    const kickV = Math.sqrt(2 * grav * H);
    const cycle = 2 * Math.sqrt((2 * H) / grav);
    const target = Math.max(3, (ctx.durationMs / 1000 / cycle) * 0.8);
    const hitR = api.widen(R * 2.1);

    let bx = w / 2;
    let by = h * 0.28;
    let vx = 0;
    let vy = 0;
    let rot = 0;
    let spin = 0;
    let touches = 0;
    let points = 0;
    let over = false;
    let overT = 0;
    let t = 0;
    let squash = 0;

    function drawBall(g: CanvasRenderingContext2D) {
      g.save();
      g.translate(bx, by);
      g.scale(1 + squash * 0.15, 1 - squash * 0.15);
      g.rotate(rot);
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(0, 0, R, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1f2937';
      const pent = (x: number, y: number, r: number) => {
        g.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        g.closePath();
        g.fill();
      };
      pent(0, 0, R * 0.38);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        pent(Math.cos(a) * R * 0.88, Math.sin(a) * R * 0.88, R * 0.22);
      }
      g.strokeStyle = '#9ca3af';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(0, 0, R, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }

    return {
      update(dt, elapsed) {
        t = elapsed;
        squash = Math.max(0, squash - dt * 6);
        if (over) {
          overT += dt;
          if (overT > 0.7) api.finish();
          return;
        }
        vy += grav * dt;
        bx += vx * dt;
        by += vy * dt;
        rot += spin * dt;
        if (bx < R) { bx = R; vx = Math.abs(vx) * 0.8; }
        if (bx > w - R) { bx = w - R; vx = -Math.abs(vx) * 0.8; }
        if (by < R + 30) { by = R + 30; vy = Math.abs(vy) * 0.3; }
        if (by + R >= groundY) {
          by = groundY - R;
          over = true;
          api.shake(10);
          api.popup(touches > 0 ? 'DROPPED!' : 'MISS!', w / 2, h * 0.5, '#f87171');
        }
      },
      draw(g) {
        const sky = g.createLinearGradient(0, 0, 0, groundY);
        sky.addColorStop(0, '#1e3a8a');
        sky.addColorStop(1, '#60a5fa');
        g.fillStyle = sky;
        g.fillRect(0, 0, w, groundY);
        // stands
        g.fillStyle = 'rgba(15,23,42,0.45)';
        g.fillRect(0, groundY - h * 0.16, w, h * 0.16);
        for (let i = 0; i < 40; i++) {
          g.fillStyle = ['#fbbf24', '#f87171', '#e5e7eb', '#34d399'][i % 4];
          g.globalAlpha = 0.5;
          g.fillRect((i * 37) % w, groundY - h * 0.15 + ((i * 53) % 30), 4, 4);
        }
        g.globalAlpha = 1;
        // grass
        g.fillStyle = '#15803d';
        g.fillRect(0, groundY, w, h - groundY);
        for (let i = 0; i < 8; i++) {
          g.fillStyle = i % 2 ? '#16a34a' : '#15803d';
          g.fillRect((i * w) / 8, groundY, w / 8, h - groundY);
        }
        g.fillStyle = 'rgba(255,255,255,0.7)';
        g.fillRect(0, groundY, w, 3);
        // shadow
        const sh = clamp(1 - (groundY - by) / (h * 0.8), 0.2, 1);
        g.fillStyle = `rgba(0,0,0,${0.35 * sh})`;
        g.beginPath();
        g.ellipse(bx, groundY + 8, R * sh, R * 0.28 * sh, 0, 0, Math.PI * 2);
        g.fill();
        drawBall(g);
        // touch counter
        g.textAlign = 'center';
        g.fillStyle = 'rgba(255,255,255,0.9)';
        g.font = 'bold 44px system-ui, sans-serif';
        g.fillText(`${touches}`, w / 2, h * 0.1 + 20);
        g.font = '12px system-ui, sans-serif';
        g.fillText('TOUCHES', w / 2, h * 0.1 + 38);
        if (ctx.clutch && t < 1800) {
          g.globalAlpha = 0.6 + 0.4 * Math.sin(t / 90);
          g.fillStyle = '#fbbf24';
          g.font = 'bold 26px system-ui, sans-serif';
          g.fillText('CLUTCH', w / 2, h * 0.22);
          g.globalAlpha = 1;
        }
        if (t < 2000) {
          g.fillStyle = 'rgba(0,0,0,0.5)';
          g.fillRect(0, h - 40, w, 40);
          g.fillStyle = '#fff';
          g.font = '14px system-ui, sans-serif';
          g.fillText('Tap the ball to keep it up - center taps score more', w / 2, h - 16);
        }
      },
      onPointerDown(p) {
        if (over) return;
        const d = Math.hypot(p.x - bx, p.y - by);
        if (d > hitR) return;
        const q = 1 - clamp(d / hitR, 0, 1);
        touches++;
        points += 0.7 + 0.3 * q;
        vy = -kickV;
        vx = clamp(((bx - p.x) / R) * 170, -230, 230) + (ctx.rng() - 0.5) * 50;
        spin = vx / 40;
        squash = 1;
        api.setScore((points / target) * 1000);
        api.popup(q > 0.75 ? 'PERFECT' : '+1', bx, by - R, q > 0.75 ? '#fde047' : '#fff');
        if (touches % 10 === 0) api.popup(`${touches}!`, w / 2, h * 0.3, '#fbbf24');
      }
    };
  });
