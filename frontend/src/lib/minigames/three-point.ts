import type { MiniGameContext, MiniGameInstance } from '$lib/engine/minigame-api';
import { runGame, clamp, lerp } from './runtime';

type Phase = 'ready' | 'charging' | 'flight' | 'between';
type Outcome = 'swish' | 'make' | 'rim' | 'miss' | 'air';

const FLIGHT = 0.55;

export default (ctx: MiniGameContext): MiniGameInstance =>
  runGame(ctx, (api) => {
    const { w, h } = api;
    const t0 = performance.now();
    const now = () => (performance.now() - t0) / 1000;

    const racks = ctx.clutch ? 1 : 5;
    const perRack = 3;
    const hoop = { x: w / 2, y: h * 0.16 };
    const rx = w * 0.42;
    const ry = h * 0.58;
    const meterX = w / 2;
    const meterTop = h * 0.33;
    const meterBot = h * 0.66;

    let rack = ctx.clutch ? 4 : 0; // clutch uses the fastest meter
    let rackIdx = 0; // which position on the arc
    let ballNo = 0;
    let phase: Phase = 'ready';
    let sum = 0;
    let tPress = 0;
    let riseT = 1;
    let meter = 0;
    let zoneC = 0.7;
    let zoneHW = 0.08;
    let tFlight = 0;
    let tBetween = 0;
    let outcome: Outcome = 'miss';
    let from = { x: w / 2, y: h * 0.8 };
    let finished = false;
    let rackBanner = 0;
    const made: Array<Outcome | null> = [];

    const posOf = (i: number) => {
      const a = lerp(-1.25, 1.25, (ctx.clutch ? 2 : i) / 4);
      return { x: hoop.x + rx * Math.sin(a), y: hoop.y + ry * Math.cos(a) * 1.05 + 10 };
    };
    const maxRackW = perRack + 1;
    const totalW = racks * maxRackW;

    function newBall(): void {
      const rp = ctx.clutch ? 4 : rack;
      riseT = lerp(1.15, 0.72, rp / 4) * lerp(1, 0.85, api.diff);
      zoneC = lerp(0.52, 0.84, ctx.rng());
      zoneHW = lerp(0.1, 0.062, rp / 4) * lerp(1, 0.78, api.diff);
      zoneHW = api.widen(zoneHW);
      from = posOf(rackIdx);
      meter = 0;
      phase = 'ready';
    }
    newBall();

    function release(): void {
      const d = Math.abs(meter - zoneC);
      if (meter >= 1) outcome = 'air';
      else if (d <= zoneHW * 0.45) outcome = 'swish';
      else if (d <= zoneHW) outcome = 'make';
      else if (d <= zoneHW * 1.7 && ctx.rng() < 0.4) outcome = 'rim';
      else outcome = 'miss';
      phase = 'flight';
      tFlight = 0;
    }

    function settle(): void {
      const money = ballNo === perRack - 1;
      const wgt = money ? 2 : 1;
      const base = outcome === 'swish' ? 100 : outcome === 'make' ? 75 : outcome === 'rim' ? 35 : 0;
      const pts = base * wgt;
      sum += pts;
      made.push(outcome);
      api.setScore((sum / (totalW * 100)) * 1000);
      const bx = hoop.x, by = hoop.y + 60;
      if (outcome === 'swish') api.popup(money ? 'SWISH! x2' : 'SWISH!', bx, by, '#facc15');
      else if (outcome === 'make') api.popup(money ? 'GOOD x2' : 'GOOD', bx, by, '#4ade80');
      else if (outcome === 'rim') api.popup('RIM IN', bx, by, '#a3e635');
      else { api.popup(outcome === 'air' ? 'AIRBALL' : 'MISS', bx, by, '#f87171'); api.shake(8); }
      if (base > 0) api.popup(`+${Math.round(pts)}`, bx, by + 28, '#fff');
      phase = 'between';
      tBetween = 0;
    }

    function advance(): void {
      ballNo++;
      if (ballNo >= perRack) {
        ballNo = 0;
        rack++;
        rackIdx++;
        rackBanner = 1.1;
        if (ctx.clutch || rackIdx >= racks) {
          finished = true;
          api.finish();
          return;
        }
      }
      newBall();
    }

    return {
      onPointerDown() {
        if (phase !== 'ready') return;
        phase = 'charging';
        tPress = now();
      },
      onPointerUp() {
        if (phase === 'charging') release();
      },
      update(dt) {
        if (finished) return;
        if (rackBanner > 0) rackBanner -= dt;
        if (phase === 'charging') {
          meter = (now() - tPress) / riseT;
          if (meter >= 1) { meter = 1; release(); }
        } else if (phase === 'flight') {
          tFlight += dt;
          if (tFlight >= FLIGHT) settle();
        } else if (phase === 'between') {
          tBetween += dt;
          if (tBetween > (ballNo === perRack - 1 ? 0.8 : 0.35)) advance();
        }
      },
      draw(g) {
        const t = now();
        // court
        const grad = g.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#d8a15f');
        grad.addColorStop(1, '#b57a3a');
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(90,50,20,0.22)';
        g.lineWidth = 1;
        for (let x = 0; x < w; x += 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
        g.fillStyle = 'rgba(30,64,175,0.35)';
        g.fillRect(w * 0.3, 0, w * 0.4, h * 0.36);
        g.strokeStyle = 'rgba(255,255,255,0.8)';
        g.lineWidth = 3;
        g.strokeRect(w * 0.3, 0, w * 0.4, h * 0.36);
        g.beginPath(); g.arc(w / 2, h * 0.36, w * 0.13, 0, Math.PI); g.stroke();
        // three point line
        g.beginPath();
        for (let i = 0; i <= 40; i++) {
          const a = lerp(-1.4, 1.4, i / 40);
          const x = hoop.x + rx * 1.02 * Math.sin(a), y = hoop.y + ry * 1.0 * Math.cos(a) * 1.05 + 10;
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
        // rack spots
        if (!ctx.clutch) {
          for (let i = 0; i < racks; i++) {
            const p = posOf(i);
            g.fillStyle = i === rackIdx ? '#facc15' : i < rackIdx ? '#4ade80' : 'rgba(255,255,255,0.5)';
            g.beginPath(); g.arc(p.x, p.y, i === rackIdx ? 8 : 5, 0, Math.PI * 2); g.fill();
          }
        }
        // hoop
        g.fillStyle = 'rgba(255,255,255,0.95)';
        g.fillRect(hoop.x - 34, hoop.y - 24, 68, 6);
        g.strokeStyle = '#ef4444';
        g.lineWidth = 4;
        g.beginPath(); g.arc(hoop.x, hoop.y, 13, 0, Math.PI * 2); g.stroke();

        // shooter
        const sp = from;
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.beginPath(); g.ellipse(sp.x, sp.y + 12, 16, 7, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#1d4ed8';
        g.beginPath(); g.arc(sp.x, sp.y, 15, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#f3c9a0';
        g.beginPath(); g.arc(sp.x, sp.y - 2, 7, 0, Math.PI * 2); g.fill();

        // meter
        if (phase === 'ready' || phase === 'charging') {
          const mh = meterBot - meterTop;
          g.fillStyle = 'rgba(0,0,0,0.55)';
          g.beginPath(); g.roundRect(meterX - 14, meterTop - 6, 28, mh + 12, 8); g.fill();
          g.fillStyle = '#16a34a';
          const zTop = meterBot - (zoneC + zoneHW) * mh;
          const zH = zoneHW * 2 * mh;
          g.fillRect(meterX - 12, zTop, 24, zH);
          g.fillStyle = '#bbf7d0';
          g.fillRect(meterX - 12, meterBot - (zoneC + zoneHW * 0.45) * mh, 24, zoneHW * 0.9 * mh);
          const my = meterBot - meter * mh;
          g.fillStyle = '#fff';
          g.beginPath();
          g.moveTo(meterX - 20, my - 6); g.lineTo(meterX - 12, my); g.lineTo(meterX - 20, my + 6);
          g.moveTo(meterX + 20, my - 6); g.lineTo(meterX + 12, my); g.lineTo(meterX + 20, my + 6);
          g.fill();
          g.fillRect(meterX - 12, my - 1.5, 24, 3);
          if (phase === 'ready') {
            g.fillStyle = '#fff';
            g.font = 'bold 13px system-ui, sans-serif';
            g.textAlign = 'center';
            g.fillText('HOLD', meterX, meterBot + 28);
          }
        }

        // ball
        let bx = sp.x, by = sp.y - 20, bs = 1;
        if (phase === 'flight') {
          const p = clamp(tFlight / FLIGHT, 0, 1);
          let ex = hoop.x, ey = hoop.y;
          if (outcome === 'miss' || outcome === 'air') {
            ex = hoop.x + (outcome === 'air' ? 0 : (sp.x < hoop.x ? -1 : 1) * 30);
            ey = outcome === 'air' ? hoop.y + 70 : hoop.y + 10;
          }
          bx = lerp(sp.x, ex, p);
          by = lerp(sp.y - 20, ey, p) - Math.sin(p * Math.PI) * 70;
          bs = 1 + Math.sin(p * Math.PI) * 0.35 - p * 0.25;
        } else if (phase === 'between') {
          bx = hoop.x + (outcome === 'swish' || outcome === 'make' || outcome === 'rim' ? 0 : (sp.x < hoop.x ? -34 : 34));
          by = hoop.y + 8 + tBetween * 160;
          bs = 0.75;
        }
        g.fillStyle = '#ea6a1f';
        g.strokeStyle = '#4a1d05';
        g.lineWidth = 1.5;
        g.beginPath(); g.arc(bx, by, 9 * bs, 0, Math.PI * 2); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(bx - 9 * bs, by); g.lineTo(bx + 9 * bs, by); g.stroke();

        // ball tracker
        const tx = 16;
        for (let i = 0; i < perRack; i++) {
          g.fillStyle = i < ballNo ? 'rgba(255,255,255,0.25)' : i === perRack - 1 ? '#facc15' : '#ea6a1f';
          g.beginPath(); g.arc(tx + i * 18, 46, 6, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = '#fff';
        g.font = 'bold 12px system-ui, sans-serif';
        g.textAlign = 'right';
        g.fillText(ctx.clutch ? 'LAST SHOTS' : `Rack ${Math.min(rackIdx + 1, racks)}/${racks}`, w - 10, 46);
        if (rackBanner > 0 && !ctx.clutch) {
          g.globalAlpha = Math.min(1, rackBanner);
          g.font = '900 26px system-ui, sans-serif';
          g.textAlign = 'center';
          g.fillStyle = '#fff';
          g.fillText(`RACK ${rackIdx + 1} - FASTER!`, w / 2, h * 0.5);
          g.globalAlpha = 1;
        }
        if (ctx.clutch && t < 1.8) clutchBanner(g, w, t);
        hint(g, w, h, 'Hold to raise the meter, release in the green.', t);
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
