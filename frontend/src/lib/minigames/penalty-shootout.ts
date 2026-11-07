import type { MiniGameContext } from '$lib/engine/minigame-api';
import { runGame, clamp, lerp } from './runtime';

/**
 * Penalty Shootout: drag from the ball toward the goal; direction = aim, length = power.
 * Keeper learns your favourite zone. Score = average shot quality * 1000
 * (corner goal ~1.0, central goal ~0.55, saved on target 0.15, miss 0).
 */
type Phase = 'aim' | 'flight' | 'result';

export default (ctx: MiniGameContext) =>
  runGame(ctx, (api) => {
    const { w, h } = api;
    const shots = ctx.clutch ? 2 : 5;
    const gw = w * 0.78;
    const gx = (w - gw) / 2;
    const gy = h * 0.2;
    const gh = h * 0.17;
    const gcx = w / 2;
    const ballX = w / 2;
    const ballY = h * 0.84;
    const maxDrag = h * 0.3;
    const hist = [0, 0, 0]; // left, centre, right
    const zoneX = [gcx - gw * 0.3, gcx, gcx + gw * 0.3];

    let phase: Phase = 'aim';
    let shotNo = 0;
    let total = 0;
    let t = 0;
    let pt = 0; // time in phase
    let dragging = false;
    let dx = 0;
    let dy = 0;
    let startX = 0;
    let startY = 0;
    // shot data
    let tx = 0;
    let ty = 0;
    let hv = 0;
    let outcome = '';
    let kz = 1; // keeper zone chosen
    let keeperX = gcx;
    let keeperDiveT = 0;
    let saved = false;
    let resultQ = 0;
    const FLIGHT = 0.55;

    function aimFromDrag() {
      const len = Math.hypot(dx, dy);
      const power = clamp(len / maxDrag, 0, 1);
      const ang = Math.atan2(dx, -dy);
      const dist = ballY - (gy + gh);
      const x = ballX + Math.tan(clamp(ang, -1.2, 1.2)) * dist;
      return { power, x, valid: dy < -12 && len > 24 };
    }

    function pickZone(): number {
      const wts = hist.map((c) => 1 + c * (0.6 + 2.2 * api.diff));
      const sum = wts[0] + wts[1] + wts[2];
      let r = ctx.rng() * sum;
      for (let i = 0; i < 3; i++) {
        r -= wts[i];
        if (r <= 0) return i;
      }
      return 1;
    }

    function shoot() {
      const a = aimFromDrag();
      tx = a.x;
      hv = (a.power - 0.3) / 0.6; // 0 = ground, 1 = under the bar
      ty = gy + gh - hv * gh;
      const zone = tx < gcx - gw * 0.17 ? 0 : tx > gcx + gw * 0.17 ? 2 : 1;
      kz = pickZone();
      hist[zone]++;
      keeperDiveT = 0;
      phase = 'flight';
      pt = 0;
      dragging = false;
      const wide = tx < gx || tx > gx + gw;
      const over = hv > 1.05;
      const weak = hv < -0.05;
      // keeper reach
      const reach = (gw * 0.19 * (1 - 0.45 * clamp(hv, 0, 1)) * (1 - 0.35 * api.diff)) / (1 + ctx.assist);
      const kEnd = zoneX[kz];
      saved = !wide && !over && (weak || Math.abs(tx - kEnd) < reach);
      if (wide || over) {
        outcome = over ? 'OVER THE BAR' : 'WIDE';
        resultQ = 0;
      } else if (saved) {
        outcome = 'SAVED!';
        resultQ = weak ? 0.05 : 0.15;
      } else {
        const side = Math.abs(tx - gcx) / (gw / 2);
        const corner = clamp(0.55 * side + 0.45 * clamp(hv, 0, 1), 0, 1);
        resultQ = 0.5 + 0.5 * Math.pow(corner, 1.3);
        outcome = corner > 0.8 ? 'TOP BINS!' : 'GOAL!';
      }
    }

    function finishShot() {
      phase = 'result';
      pt = 0;
      total += resultQ;
      api.setScore((total / shots) * 1000);
      const good = resultQ >= 0.5;
      api.popup(outcome, w / 2, h * 0.5, good ? '#fde047' : '#f87171');
      if (!good) api.shake(9);
      shotNo++;
    }

    function drawPlayer(g: CanvasRenderingContext2D, x: number, y: number, s: number, shirt: string) {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath();
      g.ellipse(x, y + 22 * s, 14 * s, 5 * s, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = shirt;
      g.fillRect(x - 9 * s, y - 14 * s, 18 * s, 26 * s);
      g.fillStyle = '#fcd34d';
      g.beginPath();
      g.arc(x, y - 22 * s, 8 * s, 0, Math.PI * 2);
      g.fill();
    }

    return {
      update(dt, elapsed) {
        t = elapsed;
        pt += dt;
        if (phase === 'flight') {
          keeperDiveT = clamp(pt / 0.4, 0, 1);
          keeperX = lerp(gcx, zoneX[kz], keeperDiveT * keeperDiveT * (3 - 2 * keeperDiveT));
          if (pt >= FLIGHT) finishShot();
        } else if (phase === 'result') {
          if (pt > 1.2) {
            if (shotNo >= shots) api.finish();
            else {
              phase = 'aim';
              pt = 0;
              keeperX = gcx;
              keeperDiveT = 0;
            }
          }
        }
      },
      draw(g) {
        // pitch
        for (let i = 0; i < 10; i++) {
          g.fillStyle = i % 2 ? '#16a34a' : '#15803d';
          g.fillRect(0, (i * h) / 10, w, h / 10 + 1);
        }
        g.strokeStyle = 'rgba(255,255,255,0.7)';
        g.lineWidth = 3;
        g.strokeRect(w * 0.1, gy + gh, w * 0.8, h * 0.28);
        g.beginPath();
        g.arc(w / 2, ballY, 4, 0, Math.PI * 2);
        g.stroke();
        // goal net
        g.fillStyle = 'rgba(15,23,42,0.55)';
        g.fillRect(gx, gy, gw, gh);
        g.strokeStyle = 'rgba(255,255,255,0.25)';
        g.lineWidth = 1;
        for (let x = gx; x <= gx + gw; x += 12) { g.beginPath(); g.moveTo(x, gy); g.lineTo(x, gy + gh); g.stroke(); }
        for (let y = gy; y <= gy + gh; y += 12) { g.beginPath(); g.moveTo(gx, y); g.lineTo(gx + gw, y); g.stroke(); }
        // keeper
        drawPlayer(g, keeperX, gy + gh - 22 + (keeperDiveT > 0 ? -keeperDiveT * 6 : 0), 1.1, '#f59e0b');
        g.strokeStyle = '#f59e0b';
        g.lineWidth = 5;
        g.beginPath();
        const arm = 10 + keeperDiveT * 14;
        g.moveTo(keeperX - 9, gy + gh - 32);
        g.lineTo(keeperX - 9 - arm, gy + gh - 40 - keeperDiveT * 10);
        g.moveTo(keeperX + 9, gy + gh - 32);
        g.lineTo(keeperX + 9 + arm, gy + gh - 40 - keeperDiveT * 10);
        g.stroke();
        // posts
        g.strokeStyle = '#fff';
        g.lineWidth = 6;
        g.beginPath();
        g.moveTo(gx, gy + gh);
        g.lineTo(gx, gy);
        g.lineTo(gx + gw, gy);
        g.lineTo(gx + gw, gy + gh);
        g.stroke();
        // kicker
        drawPlayer(g, ballX - 38, ballY + 6, 1, '#3b82f6');
        // aim guide
        if (phase === 'aim' && dragging) {
          const a = aimFromDrag();
          if (a.valid) {
            const tyAim = gy + gh - ((a.power - 0.3) / 0.6) * gh;
            g.setLineDash([6, 6]);
            g.strokeStyle = 'rgba(255,255,255,0.8)';
            g.lineWidth = 2;
            g.beginPath();
            g.moveTo(ballX, ballY);
            g.lineTo(a.x, tyAim);
            g.stroke();
            g.setLineDash([]);
            g.fillStyle = '#fde047';
            g.beginPath();
            g.arc(a.x, clamp(tyAim, gy - 20, gy + gh + 30), 5, 0, Math.PI * 2);
            g.fill();
          }
          // power bar
          g.fillStyle = 'rgba(0,0,0,0.4)';
          g.fillRect(w - 26, h * 0.5, 14, h * 0.3);
          const pw = a.power;
          g.fillStyle = pw > 0.92 ? '#f87171' : pw > 0.55 ? '#4ade80' : '#facc15';
          g.fillRect(w - 26, h * 0.8 - pw * h * 0.3, 14, pw * h * 0.3);
        }
        // ball
        let bx = ballX;
        let by = ballY;
        let bs = 1;
        if (phase === 'flight' || phase === 'result') {
          const k = phase === 'flight' ? clamp(pt / FLIGHT, 0, 1) : 1;
          bx = lerp(ballX, tx, k);
          by = lerp(ballY, ty, k) - Math.sin(k * Math.PI) * 18;
          bs = lerp(1, 0.6, k);
        }
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.beginPath();
        g.ellipse(bx, by + 12 * bs, 10 * bs, 4 * bs, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(bx, by, 11 * bs, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#111827';
        g.beginPath();
        g.arc(bx, by, 4 * bs, 0, Math.PI * 2);
        g.fill();
        // shot pips
        for (let i = 0; i < shots; i++) {
          g.fillStyle = i < shotNo ? '#fff' : 'rgba(255,255,255,0.3)';
          g.beginPath();
          g.arc(w / 2 - ((shots - 1) * 10) + i * 20, 44, 5, 0, Math.PI * 2);
          g.fill();
        }
        g.textAlign = 'center';
        if (ctx.clutch && t < 1800) {
          g.globalAlpha = 0.6 + 0.4 * Math.sin(t / 90);
          g.fillStyle = '#fbbf24';
          g.font = 'bold 26px system-ui, sans-serif';
          g.fillText('CLUTCH', w / 2, h * 0.5);
          g.globalAlpha = 1;
        }
        if (t < 2000) {
          g.fillStyle = 'rgba(0,0,0,0.5)';
          g.fillRect(0, h - 40, w, 40);
          g.fillStyle = '#fff';
          g.font = '14px system-ui, sans-serif';
          g.fillText('Drag from the ball toward a corner, release to shoot', w / 2, h - 16);
        }
      },
      onPointerDown(p) {
        if (phase !== 'aim') return;
        dragging = true;
        dx = 0;
        dy = 0;
        startX = p.x;
        startY = p.y;
      },
      onPointerMove(p) {
        if (!dragging) return;
        dx = p.x - startX;
        dy = p.y - startY;
      },
      onPointerUp(p) {
        if (!dragging || phase !== 'aim') return;
        dx = p.x - startX;
        dy = p.y - startY;
        if (aimFromDrag().valid) shoot();
        else dragging = false;
      }
    };
  });
