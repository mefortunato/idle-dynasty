import type { MiniGameContext } from '$lib/engine/minigame-api';
import { runGame, clamp, lerp } from './runtime';

/**
 * QB Read: receivers flash open one at a time; tap the green one before the pocket collapses.
 * Wrong tap = interception, no tap = sack. Per play quality = reaction speed * depth factor.
 * Score = sum(play quality) / plays * 1000.
 */
type Phase = 'snap' | 'live' | 'result';

const SLOTS: ReadonlyArray<readonly [number, number]> = [
  [0.13, 0.4],
  [0.32, 0.22],
  [0.5, 0.31],
  [0.68, 0.22],
  [0.87, 0.4]
];

export default (ctx: MiniGameContext) =>
  runGame(ctx, (api) => {
    const { w, h } = api;
    const plays = Math.max(1, Math.floor(ctx.durationMs / 3700));
    const qb = { x: w / 2, y: h * 0.78 };
    const pocketT = 2.6 - 0.6 * api.diff;
    const windowT = 0.95 - 0.4 * api.diff;
    const tapR = api.widen(44);

    let phase: Phase = 'snap';
    let pt = 0;
    let t = 0;
    let playNo = 0;
    let total = 0;
    let live = 0;
    let open = -1;
    let openStart = 0;
    let nextOpenAt = 0;
    let lastOpen = -1;
    let target = -1;
    let resultKind: 'catch' | 'int' | 'sack' = 'catch';
    const rush = [0, 1, 2, 3].map((i) => ({ x: w * (0.2 + i * 0.2), sx: w * (0.2 + i * 0.2) }));

    function startPlay() {
      phase = 'snap';
      pt = 0;
      live = 0;
      open = -1;
      lastOpen = -1;
      target = -1;
      nextOpenAt = 0.25 + ctx.rng() * 0.45;
    }
    startPlay();

    function endPlay(kind: 'catch' | 'int' | 'sack', q: number, label: string, color: string) {
      phase = 'result';
      pt = 0;
      resultKind = kind;
      total += q;
      playNo++;
      api.setScore((total / plays) * 1000);
      api.popup(label, w / 2, h * 0.55, color);
      if (kind !== 'catch') api.shake(12);
    }

    return {
      update(dt, elapsed) {
        t = elapsed;
        pt += dt;
        if (phase === 'snap') {
          if (pt > 0.5) { phase = 'live'; pt = 0; }
        } else if (phase === 'live') {
          live += dt;
          if (open >= 0 && live - openStart > windowT) { open = -1; nextOpenAt = live + 0.2 + ctx.rng() * 0.2; }
          if (open < 0 && live >= nextOpenAt) {
            let i = Math.floor(ctx.rng() * SLOTS.length);
            if (i === lastOpen) i = (i + 1 + Math.floor(ctx.rng() * (SLOTS.length - 1))) % SLOTS.length;
            open = i;
            lastOpen = i;
            openStart = live;
          }
          if (live >= pocketT) endPlay('sack', 0, 'SACKED!', '#f87171');
        } else if (pt > 1.0) {
          if (playNo >= plays) api.finish();
          else startPlay();
        }
      },
      draw(g) {
        // field
        for (let i = 0; i < 12; i++) {
          g.fillStyle = i % 2 ? '#15803d' : '#16a34a';
          g.fillRect(0, (i * h) / 12, w, h / 12 + 1);
        }
        g.strokeStyle = 'rgba(255,255,255,0.45)';
        g.lineWidth = 2;
        for (let i = 1; i < 6; i++) {
          g.beginPath();
          g.moveTo(0, (i * h) / 6);
          g.lineTo(w, (i * h) / 6);
          g.stroke();
        }
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(0, h * 0.62, w, 3);
        // pocket collapse bar
        const prog = phase === 'live' ? clamp(live / pocketT, 0, 1) : phase === 'snap' ? 0 : resultKind === 'sack' ? 1 : clamp(live / pocketT, 0, 1);
        // rushers
        for (let i = 0; i < rush.length; i++) {
          const r = rush[i];
          const tx = lerp(r.sx, qb.x + (i - 1.5) * 18, prog);
          const ty = lerp(h * 0.5, qb.y - 26, prog);
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.beginPath();
          g.ellipse(tx, ty + 14, 13, 5, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#dc2626';
          g.beginPath();
          g.arc(tx, ty, 14, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#7f1d1d';
          g.beginPath();
          g.arc(tx, ty - 4, 8, 0, Math.PI * 2);
          g.fill();
        }
        // receivers
        for (let i = 0; i < SLOTS.length; i++) {
          const rx = SLOTS[i][0] * w;
          const ry = SLOTS[i][1] * h;
          const isOpen = phase === 'live' && open === i;
          if (isOpen) {
            const f = 1 - clamp((live - openStart) / windowT, 0, 1);
            g.strokeStyle = '#4ade80';
            g.lineWidth = 4;
            g.beginPath();
            g.arc(rx, ry, 26 + Math.sin(t / 60) * 2, 0, Math.PI * 2 * f);
            g.stroke();
          }
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.beginPath();
          g.ellipse(rx, ry + 16, 14, 5, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = isOpen ? '#22c55e' : '#e5e7eb';
          if (!isOpen && phase === 'live') g.fillStyle = '#9ca3af';
          g.beginPath();
          g.arc(rx, ry, 16, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = isOpen ? '#14532d' : '#4b5563';
          g.beginPath();
          g.arc(rx, ry - 4, 8, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#fff';
          g.font = 'bold 11px system-ui, sans-serif';
          g.textAlign = 'center';
          g.fillText(isOpen ? 'OPEN' : '', rx, ry - 30);
        }
        // QB
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.beginPath();
        g.ellipse(qb.x, qb.y + 18, 15, 6, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#2563eb';
        g.beginPath();
        g.arc(qb.x, qb.y, 17, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#1e3a8a';
        g.beginPath();
        g.arc(qb.x, qb.y - 5, 9, 0, Math.PI * 2);
        g.fill();
        // ball in flight
        if (phase === 'result' && target >= 0) {
          const k = clamp(pt / 0.35, 0, 1);
          const bx = lerp(qb.x, SLOTS[target][0] * w, k);
          const by = lerp(qb.y, SLOTS[target][1] * h, k) - Math.sin(k * Math.PI) * 30;
          g.fillStyle = resultKind === 'int' ? '#fca5a5' : '#92400e';
          g.beginPath();
          g.ellipse(bx, by, 9, 5, k * 6, 0, Math.PI * 2);
          g.fill();
        } else if (phase !== 'result') {
          g.fillStyle = '#92400e';
          g.beginPath();
          g.ellipse(qb.x + 14, qb.y - 2, 8, 4.5, 0.5, 0, Math.PI * 2);
          g.fill();
        }
        // pocket bar
        const bw = w * 0.5;
        g.fillStyle = 'rgba(0,0,0,0.45)';
        g.fillRect(w / 2 - bw / 2, h * 0.9, bw, 10);
        g.fillStyle = prog > 0.7 ? '#ef4444' : prog > 0.4 ? '#facc15' : '#4ade80';
        g.fillRect(w / 2 - bw / 2, h * 0.9, bw * (1 - prog), 10);
        g.fillStyle = '#fff';
        g.font = '11px system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText('POCKET', w / 2, h * 0.9 - 4);
        g.font = 'bold 13px system-ui, sans-serif';
        g.fillText(`PLAY ${Math.min(playNo + 1, plays)}/${plays}`, w / 2, 26);
        if (ctx.clutch && t < 1800) {
          g.globalAlpha = 0.6 + 0.4 * Math.sin(t / 90);
          g.fillStyle = '#fbbf24';
          g.font = 'bold 26px system-ui, sans-serif';
          g.fillText('CLUTCH', w / 2, h * 0.12);
          g.globalAlpha = 1;
        }
        if (t < 2000) {
          g.fillStyle = 'rgba(0,0,0,0.55)';
          g.fillRect(0, h - 30, w, 30);
          g.fillStyle = '#fff';
          g.font = '14px system-ui, sans-serif';
          g.fillText('Tap the OPEN (green) receiver - faster pays more', w / 2, h - 10);
        }
      },
      onPointerDown(p) {
        if (phase !== 'live') return;
        let best = -1;
        let bd = tapR;
        for (let i = 0; i < SLOTS.length; i++) {
          const d = Math.hypot(p.x - SLOTS[i][0] * w, p.y - SLOTS[i][1] * h);
          if (d < bd) { bd = d; best = i; }
        }
        if (best < 0) return;
        target = best;
        if (best === open) {
          const speed = 1 - clamp((live - openStart) / windowT, 0, 1);
          const depth = 1 - (SLOTS[best][1] - 0.22) / 0.18;
          const q = (0.55 + 0.45 * speed) * (0.85 + 0.15 * clamp(depth, 0, 1));
          endPlay('catch', q, speed > 0.7 ? 'PERFECT!' : 'COMPLETE!', '#fde047');
        } else {
          endPlay('int', 0, 'INTERCEPTED!', '#f87171');
        }
      }
    };
  });
