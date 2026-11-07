import type { MiniGameContext, MiniGameInstance } from '$lib/engine/minigame-api';
import { runGame, clamp, lerp } from './runtime';

interface Mate {
  x: number;
  y: number;
  base: number;
  peak: number;
  center: number;
  side: number; // defender offset angle
}
type State = 'live' | 'pass' | 'result';

const SHOT_CLOCK = 2.3;

export default (ctx: MiniGameContext): MiniGameInstance =>
  runGame(ctx, (api) => {
    const { w, h } = api;
    const rng = ctx.rng;
    const t0 = performance.now();
    const now = () => (performance.now() - t0) / 1000;

    const total = ctx.clutch ? 2 : 11;
    const spread = lerp(0.8, 0.5, api.diff) * (1 + ctx.assist);
    const threshold = lerp(0.15, 0.28, api.diff);
    const hoop = { x: w / 2, y: h * 0.13 };
    const handler = { x: w / 2, y: h * 0.88 };
    const lanes = [w * 0.16, w * 0.5, w * 0.84];

    let mates: Mate[] = [];
    let state: State = 'live';
    let poss = 0;
    let sum = 0;
    let tStart = now();
    let tState = 0;
    let target = 0;
    let passGap = 0;
    let stolen = false;
    let freezeT = 0;

    function newPossession(): void {
      const cutter = Math.floor(rng() * 3);
      mates = lanes.map((lx, i) => {
        const isCut = i === cutter;
        return {
          x: lx + (rng() - 0.5) * 20,
          y: (i === 1 ? h * 0.36 : h * 0.5) + (rng() - 0.5) * 30,
          base: 0.08,
          peak: isCut ? 0.92 : lerp(0.3, 0.58, rng()),
          center: isCut ? lerp(0.7, 1.3, rng()) : lerp(0.4, 1.7, rng()),
          side: (rng() < 0.5 ? -1 : 1) * lerp(0.4, 1.1, rng())
        };
      });
      state = 'live';
      tStart = now();
      tState = 0;
      stolen = false;
    }
    newPossession();

    const gapOf = (m: Mate, t: number) => clamp(m.base + m.peak * Math.max(0, 1 - Math.abs(t - m.center) / spread), 0, 1);
    const defPos = (m: Mate, gap: number) => {
      const d = 17 + gap * 52;
      // defender sits toward the basket-side of his man and swings out as the gap opens
      const a = -Math.PI / 2 + m.side * (0.5 + gap * 1.0);
      return { x: m.x + Math.cos(a) * d, y: m.y + Math.sin(a) * d };
    };

    function finishPossession(pts: number, text: string, good: boolean): void {
      sum += pts;
      poss++;
      api.setScore((sum / (total * 100)) * 1000);
      state = 'result';
      tState = 0;
      const m = mates[target];
      if (good) api.popup(`+${Math.round(pts)}`, m ? m.x : w / 2, (m ? m.y : h / 2) - 26, '#facc15');
      else api.shake(9);
      api.popup(text, w / 2, h * 0.58, good ? '#4ade80' : '#f87171');
    }

    return {
      onPointerDown(p) {
        if (state !== 'live') return;
        let best = -1, bd = 52;
        for (let i = 0; i < mates.length; i++) {
          const d = Math.hypot(mates[i].x - p.x, mates[i].y - p.y);
          if (d < bd) { bd = d; best = i; }
        }
        if (best < 0) return;
        target = best;
        freezeT = now() - tStart;
        passGap = gapOf(mates[best], freezeT);
        stolen = passGap < threshold;
        state = 'pass';
        tState = 0;
      },
      update(dt) {
        tState += dt;
        const t = now() - tStart;
        if (state === 'live') {
          if (t > SHOT_CLOCK) {
            target = -1;
            freezeT = SHOT_CLOCK;
            finishPossession(0, 'SHOT CLOCK!', false);
          }
        } else if (state === 'pass') {
          if (tState > 0.5) {
            if (stolen) finishPossession(0, 'STOLEN!', false);
            else {
              const q = (passGap - threshold) / (1 - threshold);
              const pts = 100 * Math.pow(clamp(q, 0, 1), 1.4);
              finishPossession(pts, q > 0.85 ? 'WIDE OPEN!' : q > 0.5 ? 'GOOD PASS' : 'CONTESTED', true);
            }
          }
        } else if (tState > 0.7) {
          if (poss >= total) api.finish();
          else newPossession();
        }
      },
      draw(g) {
        const t = now() - tStart;
        // court
        const grad = g.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#d39b57');
        grad.addColorStop(1, '#b3763a');
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(90,50,20,0.2)';
        g.lineWidth = 1;
        for (let x = 0; x < w; x += 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
        g.fillStyle = 'rgba(30,64,175,0.35)';
        g.fillRect(w * 0.3, 0, w * 0.4, h * 0.3);
        g.strokeStyle = 'rgba(255,255,255,0.8)';
        g.lineWidth = 3;
        g.strokeRect(w * 0.3, 0, w * 0.4, h * 0.3);
        g.beginPath(); g.arc(w / 2, h * 0.3, w * 0.13, 0, Math.PI); g.stroke();
        g.beginPath(); g.arc(w / 2, h * 0.115, w * 0.46, 0.18, Math.PI - 0.18); g.stroke();
        g.beginPath(); g.arc(w / 2, h * 0.98, 42, Math.PI, 0); g.stroke();
        // hoop
        g.fillStyle = '#fff';
        g.fillRect(hoop.x - 30, hoop.y - 22, 60, 5);
        g.strokeStyle = '#ef4444';
        g.lineWidth = 4;
        g.beginPath(); g.arc(hoop.x, hoop.y, 11, 0, Math.PI * 2); g.stroke();

        // players
        const person = (x: number, y: number, fill: string, ring: string, r = 13) => {
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.beginPath(); g.ellipse(x, y + r * 0.7, r, r * 0.45, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = fill;
          g.strokeStyle = ring;
          g.lineWidth = 2.5;
          g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
        };
        for (let i = 0; i < mates.length; i++) {
          const m = mates[i];
          const gap = gapOf(m, state === 'live' ? t : freezeT);
          const dp = defPos(m, gap);
          // lane line
          g.strokeStyle = 'rgba(255,255,255,0.18)';
          g.lineWidth = 1;
          g.setLineDash([4, 6]);
          g.beginPath(); g.moveTo(handler.x, handler.y); g.lineTo(m.x, m.y); g.stroke();
          g.setLineDash([]);
          // openness ring
          const col = gap >= 0.6 ? '#4ade80' : gap > threshold + 0.1 ? '#fbbf24' : '#ef4444';
          g.strokeStyle = col;
          g.lineWidth = 3;
          g.beginPath(); g.arc(m.x, m.y, 21 + gap * 4, 0, Math.PI * 2); g.stroke();
          if (gap >= 0.6 && state === 'live') {
            g.fillStyle = 'rgba(74,222,128,0.2)';
            g.beginPath(); g.arc(m.x, m.y, 25 + Math.sin(t * 14) * 2, 0, Math.PI * 2); g.fill();
          }
          person(dp.x, dp.y, '#dc2626', '#7f1d1d');
          person(m.x, m.y, '#2563eb', '#fff');
        }
        person(handler.x, handler.y, '#1d4ed8', '#facc15', 14);

        // ball
        let bx = handler.x + 10, by = handler.y - 8;
        if (state !== 'live' && target >= 0) {
          const m = mates[target];
          const p = clamp(tState / 0.22, 0, 1);
          if (state === 'pass' || (state === 'result' && !stolen)) {
            bx = lerp(handler.x, m.x, p);
            by = lerp(handler.y, m.y, p);
            if (state === 'result' || tState > 0.22) {
              const q = state === 'result' ? clamp(0.4 + tState / 0.5, 0, 1) : clamp((tState - 0.22) / 0.28, 0, 1);
              bx = lerp(m.x, hoop.x, q);
              by = lerp(m.y, hoop.y + 10, q);
            }
          } else {
            const dp = defPos(m, passGap);
            bx = lerp(handler.x, dp.x, p);
            by = lerp(handler.y, dp.y, p);
          }
        }
        g.fillStyle = '#ea6a1f';
        g.strokeStyle = '#4a1d05';
        g.lineWidth = 1.5;
        g.beginPath(); g.arc(bx, by, 8, 0, Math.PI * 2); g.fill(); g.stroke();

        // shot clock bar
        if (state === 'live') {
          const f = clamp(1 - t / SHOT_CLOCK, 0, 1);
          g.fillStyle = 'rgba(0,0,0,0.45)';
          g.fillRect(w * 0.2, h - 50, w * 0.6, 8);
          g.fillStyle = f > 0.35 ? '#fff' : '#f87171';
          g.fillRect(w * 0.2, h - 50, w * 0.6 * f, 8);
        }
        g.fillStyle = '#fff';
        g.font = 'bold 12px system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText(`Possession ${Math.min(poss + (state === 'result' ? 0 : 1), total)}/${total}`, w / 2, 24);
        const tt = now();
        if (ctx.clutch && tt < 1.8) clutchBanner(g, w, tt);
        hint(g, w, h, 'Tap the open teammate before the defender closes.', tt);
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
