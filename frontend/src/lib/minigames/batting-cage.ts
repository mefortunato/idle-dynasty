import type { MiniGameContext, MiniGameInstance } from '$lib/engine/minigame-api';
import { runGame, clamp, lerp } from './runtime';

type State = 'wind' | 'pitch' | 'result';
interface PitchType { name: string; time: number; curve: number }

const TYPES: PitchType[] = [
  { name: 'FASTBALL', time: 0.85, curve: 0 },
  { name: 'CURVEBALL', time: 1.15, curve: 55 },
  { name: 'CHANGE-UP', time: 1.4, curve: 0 }
];

export default (ctx: MiniGameContext): MiniGameInstance =>
  runGame(ctx, (api) => {
    const { w, h } = api;
    const rng = ctx.rng;
    const t0 = performance.now();
    const now = () => (performance.now() - t0) / 1000;

    const total = ctx.clutch ? 3 : 11;
    const win = api.widen(lerp(0.15, 0.1, api.diff));
    const sweetR = api.widen(9);
    const sweetRange = api.widen(46);
    const speedMul = lerp(1, 0.78, api.diff);
    const startPt = { x: w / 2, y: h * 0.23 };
    const plateY = h * 0.7;

    let state: State = 'wind';
    let tState = 0;
    let n = 0;
    let sum = 0;
    let type = TYPES[0];
    let T = 1;
    let tPitch = 0; // absolute clock at release
    let endPt = { x: w / 2, y: plateY };
    let swung = false;
    let swingAt = { x: 0, y: 0 };
    let swingT = -9;
    let hitT = -1;
    let hitVel = { x: 0, y: 0 };
    let hitFrom = { x: 0, y: 0 };
    let hitQ = 0;

    function nextPitch(): void {
      type = TYPES[Math.floor(rng() * (api.diff > 0.2 ? 3 : 2))] ?? TYPES[0];
      T = type.time * speedMul;
      endPt = { x: w / 2 + (rng() - 0.5) * 70, y: plateY + (rng() - 0.5) * 36 };
      state = 'wind';
      tState = 0;
      swung = false;
      hitT = -1;
      swingT = -9;
    }
    nextPitch();

    const progress = (clockT: number) => (clockT - tPitch) / T;
    function ballAt(p: number): { x: number; y: number; r: number } {
      const pc = clamp(p, 0, 1.25);
      const e = Math.pow(Math.max(0, pc), 1.4);
      const x = lerp(startPt.x, endPt.x, pc) + (type.curve ? type.curve * (Math.sin(Math.min(pc, 1) * Math.PI) * 0.9 + Math.pow(pc, 3) * 0.1) * (endPt.x > w / 2 ? -1 : 1) : 0);
      const y = lerp(startPt.y, endPt.y, e) + (pc > 1 ? (pc - 1) * 90 : 0);
      return { x, y, r: 3.5 + 12 * e };
    }

    function settle(pts: number, text: string, good: boolean): void {
      sum += pts;
      n++;
      api.setScore((sum / (total * 100)) * 1000);
      state = 'result';
      tState = 0;
      api.popup(text, w / 2, h * 0.5, good ? '#facc15' : '#f87171');
      if (pts > 0) api.popup(`+${Math.round(pts)}`, w / 2, h * 0.5 + 28, '#fff');
      else api.shake(8);
    }

    return {
      onPointerDown(p) {
        if (state !== 'pitch' || swung) return;
        swung = true;
        const t = now();
        swingT = t;
        swingAt = { x: p.x, y: p.y };
        const err = Math.abs(t - (tPitch + T));
        if (err > win) {
          settle(0, t < tPitch + T ? 'TOO EARLY' : 'TOO LATE', false);
          return;
        }
        const flat = win * 0.1;
        const tq = err <= flat ? 1 : 1 - (err - flat) / (win - flat);
        const b = ballAt(progress(t));
        const d = Math.hypot(b.x - p.x, b.y - p.y);
        const lq = 1 - clamp((d - sweetR) / sweetRange, 0, 1);
        hitQ = 0.6 * tq + 0.4 * lq;
        hitFrom = { x: b.x, y: b.y };
        hitVel = { x: (rng() - 0.5) * 160 + (p.x - b.x) * 2, y: -(220 + 260 * hitQ) };
        hitT = 0;
        const label = hitQ >= 0.85 ? 'HOME RUN!' : hitQ >= 0.65 ? 'DOUBLE!' : hitQ >= 0.4 ? 'SINGLE' : 'FOUL TIP';
        settle(hitQ * 100, label, hitQ >= 0.4);
      },
      update(dt) {
        tState += dt;
        if (hitT >= 0) hitT += dt;
        if (state === 'wind') {
          if (tState > 0.5) {
            state = 'pitch';
            tState = 0;
            tPitch = now();
          }
        } else if (state === 'pitch') {
          if (now() > tPitch + T + win) settle(0, 'STRIKE!', false);
        } else if (tState > 0.65) {
          if (n >= total) api.finish();
          else nextPitch();
        }
      },
      draw(g) {
        const t = now();
        // sky + outfield
        const sky = g.createLinearGradient(0, 0, 0, h * 0.22);
        sky.addColorStop(0, '#60a5fa');
        sky.addColorStop(1, '#bfdbfe');
        g.fillStyle = sky;
        g.fillRect(0, 0, w, h * 0.22);
        const grass = g.createLinearGradient(0, h * 0.2, 0, h);
        grass.addColorStop(0, '#2f8a3f');
        grass.addColorStop(1, '#3fa352');
        g.fillStyle = grass;
        g.fillRect(0, h * 0.2, w, h * 0.8);
        // wall
        g.fillStyle = '#14532d';
        g.fillRect(0, h * 0.18, w, h * 0.05);
        g.fillStyle = '#facc15';
        g.fillRect(0, h * 0.18, w, 3);
        // mow stripes
        for (let i = 0; i < 8; i++) {
          g.fillStyle = i % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
          g.fillRect(0, h * 0.23 + i * h * 0.1, w, h * 0.1);
        }
        // dirt + mound
        g.fillStyle = '#b4875a';
        g.beginPath(); g.ellipse(w / 2, h * 0.78, w * 0.46, h * 0.17, 0, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(startPt.x, startPt.y + 14, 34, 11, 0, 0, Math.PI * 2); g.fill();
        // plate
        g.fillStyle = '#f8fafc';
        g.beginPath();
        const py = h * 0.86;
        g.moveTo(w / 2 - 20, py - 12); g.lineTo(w / 2 + 20, py - 12); g.lineTo(w / 2 + 20, py + 2); g.lineTo(w / 2, py + 16); g.lineTo(w / 2 - 20, py + 2);
        g.closePath(); g.fill();
        // strike zone
        const zx = w / 2 - 44, zy = plateY - 52;
        g.strokeStyle = 'rgba(255,255,255,0.65)';
        g.lineWidth = 2;
        g.setLineDash([6, 5]);
        g.strokeRect(zx, zy, 88, 104);
        g.setLineDash([]);

        // pitcher
        const wind = state === 'wind' ? clamp(tState / 0.5, 0, 1) : 1;
        g.fillStyle = '#1e3a8a';
        g.beginPath(); g.arc(startPt.x, startPt.y - 4, 8, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#e5e7eb';
        g.fillRect(startPt.x - 6, startPt.y - 4, 12, 18);
        g.strokeStyle = '#1e3a8a';
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(startPt.x + 6, startPt.y);
        const arm = state === 'wind' ? -wind * 2.4 : 0.8;
        g.lineTo(startPt.x + 6 + Math.cos(arm) * 14, startPt.y + Math.sin(arm) * 14);
        g.stroke();
        if (state === 'wind') {
          g.fillStyle = 'rgba(0,0,0,0.5)';
          g.font = 'bold 12px system-ui, sans-serif';
          g.textAlign = 'center';
          g.fillText(type.name, startPt.x, startPt.y - 22);
        }

        // batter
        const bxp = w * 0.22;
        const swingP = clamp((t - swingT) / 0.18, 0, 1);
        g.fillStyle = 'rgba(0,0,0,0.2)';
        g.beginPath(); g.ellipse(bxp, h * 0.9, 24, 8, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#1d4ed8';
        g.beginPath(); g.roundRect(bxp - 14, h * 0.74, 28, 60, 9); g.fill();
        g.fillStyle = '#f3c9a0';
        g.beginPath(); g.arc(bxp, h * 0.725, 11, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#1e3a8a';
        g.beginPath(); g.arc(bxp, h * 0.716, 11.5, Math.PI, 0); g.fill();
        // bat
        const hand = { x: bxp + 12, y: h * 0.775 };
        const a0 = -2.2, a1 = 0.1;
        const ang = swingT > 0 ? lerp(a0, a1, swingP) : a0;
        g.strokeStyle = '#d6a560';
        g.lineWidth = 6;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(hand.x, hand.y);
        g.lineTo(hand.x + Math.cos(ang) * 60, hand.y + Math.sin(ang) * 60);
        g.stroke();
        g.lineCap = 'butt';

        // ball
        if (state === 'pitch' || (state === 'result' && hitT < 0)) {
          const clk = state === 'pitch' ? t : Math.min(t, tPitch + T + 0.4);
          const p = progress(clk);
          if (state === 'result' && p > 1.0) { /* ball in the catcher's mitt */ }
          const b = ballAt(p);
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.beginPath(); g.ellipse(b.x, b.y + b.r + 4, b.r, b.r * 0.35, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#fff';
          g.strokeStyle = '#b91c1c';
          g.lineWidth = 1.2;
          g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.fill(); g.stroke();
          // sweet spot hint
          if (state === 'pitch' && p > 0.7 && p < 1.05) {
            g.strokeStyle = 'rgba(250,204,21,0.7)';
            g.lineWidth = 1.5;
            g.beginPath(); g.arc(b.x, b.y, sweetR + b.r * 0.4, 0, Math.PI * 2); g.stroke();
          }
        }
        if (hitT >= 0) {
          const hx = hitFrom.x + hitVel.x * hitT;
          const hy = hitFrom.y + hitVel.y * hitT + 120 * hitT * hitT;
          const r = Math.max(2, 10 - hitT * 9);
          g.globalAlpha = clamp(1.2 - hitT, 0, 1);
          g.fillStyle = '#fff';
          g.beginPath(); g.arc(hx, hy, r, 0, Math.PI * 2); g.fill();
          g.globalAlpha = 1;
          if (hitT < 0.15) {
            g.strokeStyle = '#fde047';
            g.lineWidth = 3;
            g.beginPath(); g.arc(hitFrom.x, hitFrom.y, 14 + hitT * 120, 0, Math.PI * 2); g.stroke();
          }
        }
        // tap marker
        if (swingT > 0 && t - swingT < 0.35) {
          g.strokeStyle = `rgba(255,255,255,${1 - (t - swingT) / 0.35})`;
          g.lineWidth = 2;
          g.beginPath(); g.arc(swingAt.x, swingAt.y, 10 + (t - swingT) * 40, 0, Math.PI * 2); g.stroke();
        }

        g.fillStyle = '#fff';
        g.font = 'bold 12px system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText(`Pitch ${Math.min(n + (state === 'result' ? 0 : 1), total)}/${total}`, w / 2, 46);
        if (ctx.clutch && t < 1.8) clutchBanner(g, w, t);
        hint(g, w, h, 'Tap when the pitch reaches the plate - aim at the ball!', t);
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
  g.translate(w / 2, 90);
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
