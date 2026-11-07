import type { MiniGameContext } from '$lib/engine/minigame-api';
import { runGame, clamp, lerp } from './runtime';

/**
 * Field Goal: tap 1 locks power (hit the sweet band for the distance), tap 2 locks accuracy
 * (aim at the tick, which is offset by the wind). Score = average kick quality * 1000.
 */
type Phase = 'power' | 'acc' | 'flight' | 'result';

const tri = (x: number) => {
  const m = ((x % 2) + 2) % 2;
  return m < 1 ? m : 2 - m;
};

export default (ctx: MiniGameContext) =>
  runGame(ctx, (api) => {
    const { w, h } = api;
    const kicks = ctx.clutch ? 1 : 5;
    const cx = w / 2;
    const postHalf = w * 0.17;
    const barY = h * 0.2;
    const postTop = h * 0.07;
    const baseY = h * 0.27;
    const ballStart = { x: cx, y: h * 0.6 };
    const mx = 26;
    const mw = w - mx * 2;
    const powY = h * 0.73;
    const accY = h * 0.86;
    const barH = 24;

    let phase: Phase = 'power';
    let kickNo = 0;
    let total = 0;
    let t = 0;
    let pt = 0;
    let need = 0.6;
    let wind = 0;
    let pPos = 0;
    let aPos = 0;
    let pLock = 0;
    let aLock = 0;
    let q = 0;
    let outcome = '';
    let kind: 'good' | 'short' | 'long' | 'wide' = 'good';
    let lat = 0;
    let phaseClock = 0;
    const FLIGHT = 1.3;
    const powerSpeed = 0.75 + 0.7 * api.diff; // half-cycles per second
    const accSpeed = 1.1 + 1.0 * api.diff;
    const powTol = api.widen(0.11 - 0.04 * api.diff);
    const latTol = api.widen(0.24 - 0.08 * api.diff);

    function newKick() {
      need = ctx.clutch ? 0.82 : 0.45 + ctx.rng() * 0.4;
      const windMax = ctx.clutch ? 0.5 : 0.15 + 0.3 * api.diff + 0.1;
      wind = (ctx.rng() * 2 - 1) * windMax;
      phase = 'power';
      phaseClock = 0;
      pt = 0;
    }
    newKick();

    function lockAcc() {
      aLock = aPos;
      const pe = pLock - need;
      lat = aLock + wind;
      if (Math.abs(pe) > powTol) {
        kind = pe < 0 ? 'short' : 'long';
        q = 0;
        outcome = pe < 0 ? 'NO DISTANCE!' : 'OVERCOOKED!';
      } else if (Math.abs(lat) > latTol) {
        kind = 'wide';
        q = 0.12 * (1 - clamp((Math.abs(lat) - latTol) / 0.4, 0, 1));
        outcome = lat < 0 ? 'WIDE LEFT!' : 'WIDE RIGHT!';
      } else {
        kind = 'good';
        q = 0.5 + 0.25 * (1 - Math.abs(pe) / powTol) + 0.25 * (1 - Math.abs(lat) / latTol);
        outcome = q > 0.9 ? 'PERFECT!' : 'IT\'S GOOD!';
      }
      phase = 'flight';
      pt = 0;
    }

    function endFlight() {
      phase = 'result';
      pt = 0;
      total += q;
      kickNo++;
      api.setScore((total / kicks) * 1000);
      api.popup(outcome, cx, h * 0.45, q >= 0.5 ? '#fde047' : '#f87171');
      if (q < 0.5) api.shake(9);
    }

    function drawBar(g: CanvasRenderingContext2D, y: number, active: boolean, label: string) {
      g.globalAlpha = active ? 1 : 0.55;
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(mx, y, mw, barH);
      g.strokeStyle = active ? '#fde047' : 'rgba(255,255,255,0.4)';
      g.lineWidth = 2;
      g.strokeRect(mx, y, mw, barH);
      g.fillStyle = '#fff';
      g.font = '11px system-ui, sans-serif';
      g.textAlign = 'left';
      g.fillText(label, mx, y - 5);
      g.globalAlpha = 1;
    }

    function marker(g: CanvasRenderingContext2D, x: number, y: number, color: string) {
      g.fillStyle = color;
      g.fillRect(x - 3, y - 5, 6, barH + 10);
    }

    return {
      update(dt, elapsed) {
        t = elapsed;
        pt += dt;
        phaseClock += dt;
        if (phase === 'power') pPos = tri(phaseClock * powerSpeed);
        else if (phase === 'acc') aPos = tri(phaseClock * accSpeed + 0.5) * 2 - 1;
        else if (phase === 'flight') {
          if (pt >= FLIGHT) endFlight();
        } else if (phase === 'result' && pt > 1.2) {
          if (kickNo >= kicks) api.finish();
          else newKick();
        }
      },
      draw(g) {
        // field / sky
        const sky = g.createLinearGradient(0, 0, 0, baseY);
        sky.addColorStop(0, '#0f172a');
        sky.addColorStop(1, '#475569');
        g.fillStyle = sky;
        g.fillRect(0, 0, w, baseY + 2);
        // stands
        for (let i = 0; i < 60; i++) {
          g.fillStyle = ['#fbbf24', '#f87171', '#e5e7eb', '#60a5fa'][i % 4];
          g.globalAlpha = 0.45;
          g.fillRect((i * 47) % w, baseY - 40 + ((i * 29) % 36), 4, 4);
        }
        g.globalAlpha = 1;
        for (let i = 0; i < 12; i++) {
          g.fillStyle = i % 2 ? '#15803d' : '#16a34a';
          const y0 = baseY + (i * (powY - 30 - baseY)) / 12;
          g.fillRect(0, y0, w, (powY - 30 - baseY) / 12 + 1);
        }
        g.fillStyle = '#1f2937';
        g.fillRect(0, powY - 34, w, h - powY + 34);
        g.strokeStyle = 'rgba(255,255,255,0.45)';
        g.lineWidth = 2;
        for (let i = 1; i < 6; i++) {
          const y = baseY + ((powY - 34 - baseY) * i) / 6;
          g.beginPath();
          g.moveTo(w * (0.25 - i * 0.04), y);
          g.lineTo(w * (0.75 + i * 0.04), y);
          g.stroke();
        }
        // uprights
        g.strokeStyle = '#facc15';
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(cx, baseY);
        g.lineTo(cx, barY + 8);
        g.moveTo(cx - postHalf, barY);
        g.lineTo(cx + postHalf, barY);
        g.moveTo(cx - postHalf, barY);
        g.lineTo(cx - postHalf, postTop);
        g.moveTo(cx + postHalf, barY);
        g.lineTo(cx + postHalf, postTop);
        g.stroke();
        // wind
        const wdir = Math.sign(wind) || 1;
        g.fillStyle = 'rgba(0,0,0,0.4)';
        g.fillRect(8, 36, 100, 26);
        g.fillStyle = '#fff';
        g.font = 'bold 12px system-ui, sans-serif';
        g.textAlign = 'left';
        g.fillText(`WIND ${Math.round(Math.abs(wind) * 40)} mph`, 14, 53);
        g.strokeStyle = '#7dd3fc';
        g.lineWidth = 3;
        const wl = 14 + Math.abs(wind) * 70;
        g.beginPath();
        g.moveTo(w - 70, 49);
        g.lineTo(w - 70 + wdir * wl, 49);
        g.lineTo(w - 70 + wdir * (wl - 7), 43);
        g.moveTo(w - 70 + wdir * wl, 49);
        g.lineTo(w - 70 + wdir * (wl - 7), 55);
        g.stroke();
        g.textAlign = 'center';
        g.fillStyle = '#fff';
        g.font = 'bold 13px system-ui, sans-serif';
        g.fillText(`${Math.round(25 + need * 35)} YD`, cx, 53);
        // kick pips
        for (let i = 0; i < kicks; i++) {
          g.fillStyle = i < kickNo ? '#fff' : 'rgba(255,255,255,0.3)';
          g.beginPath();
          g.arc(cx - (kicks - 1) * 9 + i * 18, 72, 4.5, 0, Math.PI * 2);
          g.fill();
        }
        // ball
        let bx = ballStart.x;
        let by = ballStart.y;
        let bs = 1;
        if (phase === 'flight' || phase === 'result') {
          const k = phase === 'flight' ? clamp(pt / FLIGHT, 0, 1) : 1;
          const ex = cx + (lat / latTol) * postHalf * 1.0;
          let endY = barY - 40;
          if (kind === 'short') endY = lerp(ballStart.y, barY, 0.55);
          if (kind === 'long') endY = postTop - 20;
          const endX = kind === 'short' ? lerp(ballStart.x, ex, 0.5) : kind === 'long' ? cx + (lat / latTol) * postHalf * 1.8 : ex;
          bx = lerp(ballStart.x, endX, k);
          by = lerp(ballStart.y, endY, k) - Math.sin(k * Math.PI) * h * 0.1;
          bs = lerp(1, 0.4, k);
        }
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.beginPath();
        g.ellipse(phase === 'flight' ? bx : ballStart.x, ballStart.y + 10, 12, 4, 0, 0, Math.PI * 2);
        g.fill();
        g.save();
        g.translate(bx, by);
        g.rotate(phase === 'flight' ? pt * 9 : 0.3);
        g.fillStyle = '#92400e';
        g.beginPath();
        g.ellipse(0, 0, 14 * bs, 8 * bs, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#fff';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(-4 * bs, 0);
        g.lineTo(4 * bs, 0);
        g.stroke();
        g.restore();
        // gauges
        const pActive = phase === 'power';
        const aActive = phase === 'acc';
        drawBar(g, powY, pActive, 'POWER - tap in the green band');
        const grad = g.createLinearGradient(mx, 0, mx + mw, 0);
        grad.addColorStop(0, '#facc15');
        grad.addColorStop(1, '#ef4444');
        g.globalAlpha = pActive ? 0.35 : 0.2;
        g.fillStyle = grad;
        g.fillRect(mx, powY, mw, barH);
        g.globalAlpha = pActive ? 1 : 0.55;
        g.fillStyle = '#22c55e';
        g.fillRect(mx + (need - powTol) * mw, powY, powTol * 2 * mw, barH);
        g.globalAlpha = 1;
        marker(g, mx + (pActive ? pPos : pLock) * mw, powY, '#fff');
        drawBar(g, accY, aActive, 'ACCURACY - aim at the tick (wind pushes the kick)');
        const tickX = mx + ((-wind + 1) / 2) * mw;
        g.globalAlpha = aActive ? 0.9 : 0.4;
        g.fillStyle = '#22c55e';
        g.fillRect(tickX - (latTol / 2) * mw, accY, latTol * mw, barH);
        g.globalAlpha = 1;
        g.fillStyle = 'rgba(255,255,255,0.8)';
        g.fillRect(cx - 1, accY, 2, barH);
        if (phase !== 'power') marker(g, mx + ((aActive ? aPos : aLock) + 1) / 2 * mw, accY, '#fff');
        g.textAlign = 'center';
        if (ctx.clutch && t < 1800) {
          g.globalAlpha = 0.6 + 0.4 * Math.sin(t / 90);
          g.fillStyle = '#fbbf24';
          g.font = 'bold 26px system-ui, sans-serif';
          g.fillText('CLUTCH', cx, h * 0.4);
          g.globalAlpha = 1;
        }
        if (t < 2000) {
          g.fillStyle = 'rgba(0,0,0,0.6)';
          g.fillRect(0, h - 30, w, 30);
          g.fillStyle = '#fff';
          g.font = '14px system-ui, sans-serif';
          g.fillText('Tap to lock power, tap again to lock accuracy', cx, h - 10);
        }
      },
      onPointerDown() {
        if (phase === 'power') {
          pLock = pPos;
          phase = 'acc';
          phaseClock = 0;
          aPos = tri(0.5) * 2 - 1;
        } else if (phase === 'acc') {
          lockAcc();
        }
      }
    };
  });
