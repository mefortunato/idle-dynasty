import type { MiniGameContext } from '$lib/engine/minigame-api';
import { runGame, clamp, lerp } from './runtime';

type Phase = 'aim' | 'flight' | 'result';

export default (ctx: MiniGameContext) =>
  runGame(ctx, (api) => {
    const { w, h } = api;
    const total = ctx.clutch ? 3 : 10;
    const aimTimeout = ctx.clutch ? 1.3 : 1.6;
    const box = { x: w * 0.18, y: h * 0.2, w: w * 0.64, h: h * 0.42 };
    const cx0 = box.x + box.w / 2;
    const cy0 = box.y + box.h / 2;
    const R = api.widen(lerp(40, 27, api.diff));
    const f1 = lerp(2.0, 3.6, api.diff);
    const fz = lerp(0.9, 1.8, api.diff);
    const origin = { x: w / 2, y: h * 0.88 };

    let t = 0;
    let phase: Phase = 'aim';
    let phaseT = 0;
    let aimClock = 0;
    let pitchNo = 0;
    let sumQ = 0;
    let lock = { x: cx0, y: cy0 };
    let lastQ = 0;
    let lastLabel = '';
    let ending = false;

    const zonePos = () => ({
      x: cx0 + box.w * 0.3 * Math.sin(aimClock * fz + 0.6),
      y: cy0 + box.h * 0.3 * Math.sin(aimClock * fz * 1.31 + 2.1)
    });
    const crossPos = () => ({
      x: cx0 + box.w * 0.46 * Math.sin(aimClock * f1 + 0.5),
      y: cy0 + box.h * 0.46 * Math.sin(aimClock * f1 * 1.37 + 1.2)
    });

    function throwPitch(auto: boolean) {
      const c = crossPos();
      const z = zonePos();
      const d = Math.hypot(c.x - z.x, c.y - z.y) / R;
      lock = c;
      if (auto) { lastQ = 0; lastLabel = 'TOO SLOW'; }
      else if (d <= 1) { lastQ = 1 - 0.5 * Math.pow(d, 1.2); lastLabel = d < 0.22 ? 'PERFECT!' : 'STRIKE!'; }
      else if (d < 1.4) { lastQ = 0.12; lastLabel = 'CLOSE'; }
      else { lastQ = 0; lastLabel = 'BALL'; }
      phase = 'flight';
      phaseT = 0;
    }

    function resolve() {
      sumQ += lastQ;
      pitchNo++;
      api.setScore((sumQ / total) * 1000);
      const col = lastQ >= 0.85 ? '#fde047' : lastQ > 0 ? '#86efac' : '#f87171';
      api.popup(lastLabel, lock.x, lock.y - 20, col);
      if (lastQ <= 0.12) api.shake(8);
      phase = 'result';
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
        if (phase === 'aim') {
          aimClock += dt;
          if (phaseT > aimTimeout) throwPitch(true);
        } else if (phase === 'flight') {
          if (phaseT >= 0.4) resolve();
        } else if (phaseT >= 0.7) {
          if (pitchNo >= total) { ending = true; api.finish(); return; }
          phase = 'aim';
          phaseT = 0;
        }
      },
      onPointerDown() {
        if (phase === 'aim' && phaseT > 0.08) throwPitch(false);
      },
      draw(g) {
        const sky = g.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, '#0f2a4a'); sky.addColorStop(0.35, '#1e4d3a'); sky.addColorStop(1, '#2f7d32');
        g.fillStyle = sky; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 8; i++) {
          g.fillStyle = i % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
          g.fillRect(0, h * 0.35 + i * (h * 0.08), w, h * 0.08);
        }
        // backstop
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(box.x - 22, box.y - 22, box.w + 44, box.h + 44);
        // strike box
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(box.x, box.y, box.w, box.h);
        g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2;
        g.strokeRect(box.x, box.y, box.w, box.h);
        g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,0.2)';
        for (let i = 1; i < 3; i++) {
          g.beginPath();
          g.moveTo(box.x + (box.w * i) / 3, box.y); g.lineTo(box.x + (box.w * i) / 3, box.y + box.h);
          g.moveTo(box.x, box.y + (box.h * i) / 3); g.lineTo(box.x + box.w, box.y + (box.h * i) / 3);
          g.stroke();
        }
        // plate
        g.fillStyle = '#f5f5f4';
        g.beginPath();
        const py = box.y + box.h + 30;
        g.moveTo(w / 2 - 20, py); g.lineTo(w / 2 + 20, py); g.lineTo(w / 2 + 20, py + 10);
        g.lineTo(w / 2, py + 22); g.lineTo(w / 2 - 20, py + 10); g.closePath(); g.fill();
        // target zone
        const z = zonePos();
        const pulse = 1 + 0.05 * Math.sin(t / 120);
        g.beginPath(); g.arc(z.x, z.y, R * pulse, 0, Math.PI * 2);
        g.fillStyle = 'rgba(250,204,21,0.22)'; g.fill();
        g.lineWidth = 3; g.strokeStyle = '#facc15'; g.stroke();
        g.beginPath(); g.arc(z.x, z.y, R * 0.22, 0, Math.PI * 2);
        g.strokeStyle = 'rgba(250,204,21,0.7)'; g.lineWidth = 1.5; g.stroke();
        // crosshair
        const c = phase === 'aim' ? crossPos() : lock;
        g.strokeStyle = '#ef4444'; g.lineWidth = 2.5;
        g.beginPath(); g.arc(c.x, c.y, 14, 0, Math.PI * 2); g.stroke();
        g.beginPath();
        g.moveTo(c.x - 22, c.y); g.lineTo(c.x - 6, c.y); g.moveTo(c.x + 6, c.y); g.lineTo(c.x + 22, c.y);
        g.moveTo(c.x, c.y - 22); g.lineTo(c.x, c.y - 6); g.moveTo(c.x, c.y + 6); g.lineTo(c.x, c.y + 22);
        g.stroke();
        // pitcher
        g.fillStyle = '#e2e8f0'; g.beginPath(); g.arc(origin.x, origin.y + 6, 15, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#1d4ed8'; g.fillRect(origin.x - 12, origin.y + 14, 24, 22);
        g.fillStyle = '#b91c1c'; g.fillRect(origin.x - 12, origin.y - 8, 24, 6);
        // ball
        if (phase === 'flight') {
          const p = clamp(phaseT / 0.4, 0, 1);
          const bx = lerp(origin.x, lock.x, p);
          const by = lerp(origin.y, lock.y, p);
          const r = lerp(11, 6, p);
          g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(bx, by + 4, r, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#fff'; g.beginPath(); g.arc(bx, by, r, 0, Math.PI * 2); g.fill();
          g.strokeStyle = '#dc2626'; g.lineWidth = 1.2;
          g.beginPath(); g.arc(bx, by, r * 0.7, 0.5, 1.8); g.stroke();
        } else if (phase === 'result') {
          g.fillStyle = '#fff'; g.beginPath(); g.arc(lock.x, lock.y, 6, 0, Math.PI * 2); g.fill();
        }
        // pitch counter
        g.fillStyle = '#fff'; g.font = '13px system-ui, sans-serif'; g.textAlign = 'center';
        g.fillText((ctx.clutch ? 'CLUTCH  ' : '') + `Pitch ${Math.min(pitchNo + (phase === 'result' ? 0 : 1), total)} / ${total}`, w / 2, 22);
        overlay(g, 'Tap when the crosshair is inside the gold zone');
      }
    };
  });
