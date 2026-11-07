// Bot playthrough to sanity-check pacing. Run: npx tsx scripts/pacing-sim.ts
import * as A from '../src/lib/engine/actions';
import * as F from '../src/lib/engine/formulas';
import { COACHING, FACILITIES, LEGACY, SPORT_DEFS } from '../src/lib/engine/data';
import { newGame } from '../src/lib/engine/state';
import { mulberry32 } from '../src/lib/engine/rng';
import { checkUnlocks } from '../src/lib/engine/progression';

const rng = mulberry32(42);
let t = 0;
const s = newGame(0);
const H = (x: number) => (x / 3600).toFixed(2) + 'h';
const events: string[] = [];
let lastProgress = 0;
const END = 24 * 3600 * Number(process.argv[2] ?? 3);
while (t < END) {
  t += 1;
  const now = t * 1000;
  A.advance(s, 1, now); s.lastTick = now; A.regenEnergy(s, now);
  s.boosts = s.boosts.filter(b => b.expiresAt > now);
  for (const f of checkUnlocks(s)) events.push(`${H(t)} unlock feature ${f.id}`);
  // venue
  const nv = A.nextVenue(s); if (nv && s.cash > SPORT_DEFS[nv].unlockCost) { A.unlockVenue(s, nv); events.push(`${H(t)} unlock ${nv}`); }
  // greedy: cheapest facility
  for (let i = 0; i < 50; i++) {
    let best: any = null;
    for (const sp of s.venuesUnlocked) for (const f of FACILITIES) { if (f.max && (s.facilities[sp][f.id]??0) >= f.max) continue; const c = A.facilityCost(s, sp, f.id); if (!best || c < best.c) best = { sp, id: f.id, c }; }
    if (!best || best.c > s.cash) break; A.buyFacility(s, best.sp, best.id);
  }
  for (const c of COACHING) A.buyCoaching(s, c.id);
  // minigame every 20 min (when energy), silver
  if (t % 1200 === 0 && s.energy > 0) { const h = A.dealHand(s, rng)!; A.finishMiniGame(s, h[0], 600, now); }
  if (s.tokens >= 10) A.scout(s, null, rng);
  // playoffs
  if (A.canEnterPlayoffs(s) && s.readiness >= 1) {
    A.startPlayoffs(s, Math.floor(rng()*1e9));
    while (s.playoff?.active) { const r = A.resolvePlayoffGame(s, [600, 600, 600])!; if (r.title) { events.push(`${H(t)} TITLE tier ${s.playoff.tier} (${s.playoff.sport}) power=${F.teamPower(s, s.playoff.sport).toFixed(0)}`); lastProgress = t; } }
    A.endPlayoffs(s);
  }
  // ascend if stuck 2h since last progress
  if (t - lastProgress > 2 * 3600 && F.canAscend(s)) {
    const g = A.ascend(s, 'none', rng); A.pickDraft(s, s.pendingDraft?.[0]?.id ?? null);
    // best lineup for next sport
    const sp = A.upcomingSports(s, 1)[0].sport;
    A.setLineup(s, A.bestInSport(s, sp).map(a => a.id));
    for (let k = 0; k < 30; k++) for (const l of LEGACY) A.buyLegacy(s, l.id);
    events.push(`${H(t)} ASCEND #${s.ascensions} +${g} LP -> tier ${s.champTier}`); lastProgress = t;
  }
  if (t % (6*3600) === 0) events.push(`${H(t)} cps=${F.totalCps(s, now).toExponential(2)} fans=${s.fans.toExponential(2)} runFans=${s.runFans.toExponential(2)} LPgain=${F.legacyGain(s)} tier=${s.champTier} athletes=${s.athletes.length}`);
}
console.log(events.join('\n'));
