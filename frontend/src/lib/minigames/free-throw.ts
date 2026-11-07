import type { MiniGameContext, MiniGameInstance } from '$lib/engine/minigame-api';
import { runGame, clamp, lerp } from './runtime';

type Phase = 'dribble' | 'release' | 'flight' | 'result';

const FLIGHT = 0.75;

export default (ctx: MiniGameContext): MiniGameInstance =>
  runGame(ctx, (api) => {
    const { w, h } = api;
    const t0 = performance.now();
    const now = () => (performance.now() - t0) / 1000;

    const shots = ctx.clutch ? 2 : 6;
    const drib = ctx.clutch ? 2 : 3;
    const bpm = lerp(86, 118, api.diff);
    const period = 60 / bpm;
    const dWin = api.widen(lerp(0.2, 0.135, api.diff));
    const rWin = api.widen(lerp(0.24, 0.15, api.diff));
    const relDur = Math.max(0.85, period * 1.4);

    const floorY = h * 0.84;
    const apexY = h * 0.6;
    const handX = w / 2 + 34;
    const relPt = { x: w / 2, y: h * 0.5 };
    const hoop = { x: w / 2, y: h * 0.28 };

    let shot = 0;
    let sum = 0;
    let phase: Phase = 'dribble';
    let s0 = now() + 0.5; // time of beat 0 (count-in)
    let beatQ: number[] = [];
    let beatDone: boolean[] = [];
    let relQ = 0;
    let tRel = 0;
    let tFlight = 0;
    let tResult = 0;
    let shotQ = 0;
    let lastBeatPulse = -1;
    let missSide = 1;
    const hist: number[] = []; // quality per finished shot

    function startShot(): void {
      phase = 'dribble';
      s0 = now() + period * 0.6;
      beatQ = new Array(drib + 1).fill(0);
      beatDone = new Array(drib + 1).fill(false);
      beatDone[0] = true;
      tRel = s0 + drib * period + relDur;
      lastBeatPulse = -1;
    }
    startShot();

    const qOf = (err: number, win: number) => {
      if (err > win) return 0;
      const flat = win * 0.12;
      return err <= flat ? 1 : 1 - (err - flat) / (win - flat);
    };

    function shoot(q: number): void {
      const avg = beatQ.slice(1).reduce((a, b) => a + b, 0) / drib;
      relQ = q;
      shotQ = 0.3 * avg + 0.7 * q;
      phase = 'flight';
      missSide = shot % 2 ? 1 : -1;
      tFlight = 0;
    }

    function resolve(): void {
      const pts = shotQ * 100;
      sum += pts;
      hist.push(shotQ);
      shot++;
      api.setScore((sum / (shots * 100)) * 1000);
      const label = shotQ >= 0.85 ? 'SWISH!' : shotQ >= 0.55 ? 'GOOD!' : shotQ >= 0.3 ? 'RIM IN' : 'MISS';
      api.popup(label, hoop.x, hoop.y + 50, shotQ >= 0.3 ? '#4ade80' : '#f87171');
      if (shotQ >= 0.3) api.popup(`+${Math.round(pts)}`, hoop.x, hoop.y + 80, '#facc15');
      else api.shake(8);
      phase = 'result';
      tResult = 0;
    }

    return {
      onPointerDown() {
        const t = now();
        if (phase === 'dribble') {
          let bi = -1, be = 9;
          for (let k = 1; k <= drib; k++) {
            if (beatDone[k]) continue;
            const e = Math.abs(t - (s0 + k * period));
            if (e < be) { be = e; bi = k; }
          }
          if (bi > 0 && be <= dWin * 1.2) {
            beatQ[bi] = qOf(be, dWin);
            beatDone[bi] = true;
            const early = t < s0 + bi * period;
            api.popup(beatQ[bi] > 0.8 ? 'PERFECT' : beatQ[bi] > 0.4 ? 'GOOD' : early ? 'EARLY' : 'LATE', w / 2, floorY - 70, beatQ[bi] > 0.4 ? '#4ade80' : '#fbbf24');
          } else {
            api.popup('OFF BEAT', w / 2, floorY - 70, '#f87171');
          }
        } else if (phase === 'release') {
          if (t < s0 + drib * period + 0.35) return;
          const e = Math.abs(t - tRel);
          const q = qOf(e, rWin);
          api.popup(q > 0.85 ? 'PERFECT RELEASE' : q > 0 ? (t < tRel ? 'EARLY' : 'LATE') : t < tRel ? 'TOO EARLY' : 'TOO LATE', relPt.x, relPt.y - 40, q > 0.5 ? '#4ade80' : '#fbbf24');
          shoot(q);
        }
      },
      update(dt) {
        const t = now();
        if (phase === 'dribble') {
          for (let k = 1; k <= drib; k++) {
            if (!beatDone[k] && t > s0 + k * period + dWin * 1.2) {
              beatDone[k] = true;
              beatQ[k] = 0;
              api.popup('MISSED BEAT', w / 2, floorY - 70, '#f87171');
            }
          }
          if (t > s0 + drib * period + 0.15) phase = 'release';
        } else if (phase === 'release') {
          if (t > tRel + rWin * 1.2) {
            api.popup('NO SHOT', relPt.x, relPt.y - 40, '#f87171');
            shoot(0);
          }
        } else if (phase === 'flight') {
          tFlight += dt;
          if (tFlight >= FLIGHT) resolve();
        } else {
          tResult += dt;
          if (tResult > 0.55) {
            if (shot >= shots) api.finish();
            else startShot();
          }
        }
      },
      draw(g) {
        const t = now();
        // wood floor
        const grad = g.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#c98a4b');
        grad.addColorStop(1, '#a8682e');
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(90,50,20,0.25)';
        g.lineWidth = 1;
        for (let x = 0; x < w; x += 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
        g.strokeStyle = 'rgba(255,255,255,0.7)';
        g.lineWidth = 3;
        // key
        g.strokeRect(w * 0.28, 0, w * 0.44, h * 0.62);
        g.beginPath(); g.arc(w / 2, h * 0.62, w * 0.16, 0, Math.PI * 2); g.stroke();
        // backboard + hoop
        g.fillStyle = 'rgba(255,255,255,0.9)';
        g.fillRect(hoop.x - 38, hoop.y - 32, 76, 6);
        g.strokeStyle = '#ef4444';
        g.lineWidth = 4;
        g.beginPath(); g.ellipse(hoop.x, hoop.y, 22, 7, 0, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.7)';
        g.lineWidth = 1.5;
        for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(hoop.x + i * 9, hoop.y + 3); g.lineTo(hoop.x + i * 5, hoop.y + 24); g.stroke(); }

        // player
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.beginPath(); g.ellipse(w / 2, floorY + 4, 34, 9, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#1d4ed8';
        g.beginPath(); g.roundRect(w / 2 - 20, floorY - 118, 40, 78, 10); g.fill();
        g.fillStyle = '#f3c9a0';
        g.beginPath(); g.arc(w / 2, floorY - 134, 14, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#1e3a8a';
        g.fillRect(w / 2 - 17, floorY - 42, 13, 40);
        g.fillRect(w / 2 + 4, floorY - 42, 13, 40);

        // ball
        let bx = handX, by = floorY - 10, bs = 1;
        const drawBeats = phase === 'dribble';
        if (phase === 'dribble') {
          const ph = (t - s0) / period;
          if (ph < 0) { by = floorY - 10; }
          else {
            const fr = ph - Math.floor(ph);
            by = floorY - 10 - (floorY - 10 - apexY) * 4 * fr * (1 - fr);
            const bi = Math.floor(ph);
            if (bi !== lastBeatPulse) lastBeatPulse = bi;
          }
        } else if (phase === 'release') {
          bx = relPt.x; by = relPt.y + Math.sin(t * 8) * 2;
        } else if (phase === 'flight') {
          const p = clamp(tFlight / FLIGHT, 0, 1);
          bx = lerp(relPt.x, hoop.x + (shotQ < 0.3 ? (missSide * 46) * p : 0), p);
          by = lerp(relPt.y, hoop.y, p) - Math.sin(p * Math.PI) * 55;
          if (shotQ >= 0.3 && p > 0.9) by += (p - 0.9) * 120;
          if (shotQ < 0.3 && p > 0.85) by += (p - 0.85) * 300;
          bs = 1 - p * 0.35;
        } else {
          bx = handX; by = floorY - 10;
          if (shotQ >= 0.3) { bx = hoop.x; by = hoop.y + 30 + tResult * 100; }
          else { bx = hoop.x + (missSide * 46); by = hoop.y + 60 + tResult * 200; }
        }
        // beat markers on floor
        if (drawBeats) {
          const ph = (t - s0) / period;
          const fr = ph - Math.floor(ph);
          const pulse = ph >= 0 ? 1 - fr : 0;
          g.strokeStyle = `rgba(255,255,255,${0.2 + pulse * 0.7})`;
          g.lineWidth = 3;
          g.beginPath(); g.ellipse(handX, floorY, 14 + (1 - pulse) * 30, 5 + (1 - pulse) * 10, 0, 0, Math.PI * 2); g.stroke();
          if (ph < 0) {
            g.fillStyle = '#fff';
            g.font = 'bold 20px system-ui, sans-serif';
            g.textAlign = 'center';
            g.fillText('Ready...', w / 2, h * 0.36);
          }
        }
        g.fillStyle = '#ea6a1f';
        g.strokeStyle = '#4a1d05';
        g.lineWidth = 1.5;
        g.beginPath(); g.arc(bx, by, 11 * bs, 0, Math.PI * 2); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(bx - 11 * bs, by); g.lineTo(bx + 11 * bs, by); g.moveTo(bx, by - 11 * bs); g.lineTo(bx, by + 11 * bs); g.stroke();

        // release ring
        if (phase === 'release' || (phase === 'dribble' && t > s0 + drib * period - 0.05)) {
          const startT = s0 + drib * period + 0.05;
          const prog = clamp((t - startT) / (tRel - startT), 0, 1.15);
          const r = lerp(80, 24, Math.min(prog, 1));
          g.strokeStyle = '#fde047';
          g.lineWidth = 4;
          g.beginPath(); g.arc(relPt.x, relPt.y, r, 0, Math.PI * 2); g.stroke();
          g.strokeStyle = 'rgba(255,255,255,0.9)';
          g.lineWidth = 2;
          g.beginPath(); g.arc(relPt.x, relPt.y, 24, 0, Math.PI * 2); g.stroke();
          g.fillStyle = 'rgba(255,255,255,0.9)';
          g.font = 'bold 12px system-ui, sans-serif';
          g.textAlign = 'center';
          g.fillText('RELEASE', relPt.x, relPt.y - 90);
        }

        // beat dots
        const dotY = 46;
        const n = drib + 1;
        for (let k = 0; k < n; k++) {
          const x = w / 2 + (k - (n - 1) / 2) * 26;
          const done = phase !== 'dribble' || beatDone[k];
          const q = k === 0 ? 1 : beatQ[k];
          g.fillStyle = k === 0 ? 'rgba(255,255,255,0.4)' : done ? (q > 0.4 ? '#4ade80' : '#f87171') : 'rgba(255,255,255,0.3)';
          g.beginPath(); g.arc(x, dotY, 7, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = '#fff';
        g.font = 'bold 12px system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText(`Shot ${Math.min(shot + 1, shots)}/${shots}`, w / 2, 70);

        if (ctx.clutch && t < 1.8) clutchBanner(g, w, t);
        hint(g, w, h, 'Tap on each dribble beat, then on the release ring.', t);
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
  g.translate(w / 2, 110);
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
