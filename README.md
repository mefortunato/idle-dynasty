# Idle Dynasty 🏆

A mobile-first idle sports game. Your franchise unlocks five venues and runs simulated games in one active arena at a time (🏀 Basketball, ⚽ Soccer, 🏈 Gridiron, ⚾ Baseball, 🏒 Hockey) and earns cash around the clock. Timed mini games boost your income, and the championship sport rotates every tier. Collectible athletes make up your lineup, which stays locked for the whole run, so eventually you Ascend into the Hall of Fame and rebuild.

## Core loop

| System | What it does |
|---|---|
| **Arena (idle)** | Only the selected active venue earns cash/sec from pace × play value × crits × venue special × lineup. Switch freely between unlocked arenas; each keeps its upgrades. Optional quick plays grant 2 seconds of active-arena income every 30 seconds. Facilities are bought with cash. Offline earnings pay 50% for up to 2h, and upgrades raise both. |
| **Train (mini games)** | Spend ⚡ energy to draw 3 random drills from a pool of 15 (3 per sport) and play one for 30s. Medals (🥉 250 / 🥈 500 / 🥇 750 / 💎 920) grant timed boosts to Play Value, Pace, Crit or Venue Special. Card modifiers: Hot Streak, Rivalry, Fan Day. Lineup athletes in that sport widen timing windows. |
| **Playoffs (boss)** | Readiness fills over 30 min. A 4-round bracket at Championship Tier N; the featured sport rotates Basketball → Soccer → Gridiron → Baseball → Hockey. Win odds come mostly from team power; 3 clutch moments per game (8s mini games) add −6% to +8% each. A title gives a permanent ×1.05 to that sport. |
| **Roster (athletes)** | 100 fictional athletes in six grades: Rookie → Pro → All-Star (1 sport), MVP (2), Legend (3), GOAT (all 5). Each has an archetype, traits, ★ stars from duplicate shards, and levels from XP. Chemistry bonuses for sport stacks, archetype trios and a Dream Team. **The lineup locks when you enter the playoffs.** |
| **Office** | Coaching costs 📣 Fans and resets on Ascension. The Legacy tree costs 🎖️ LP and is permanent. **Ascend**: LP ≈ 2·1.22^(best tier won this run). Pick a run mutator, then get a free draft pick weighted toward the next 3 playoff sports. |

## Repo layout

```
frontend/   SvelteKit (Svelte 5) SPA, mobile-first PWA
  src/lib/engine/     pure-TS game engine (state, formulas, actions, balance data) + vitest tests
  src/lib/minigames/  15 canvas mini games + shared runtime
  src/lib/components/ UI screens
  scripts/pacing-sim.ts  bot playthrough for balance tuning (npx tsx scripts/pacing-sim.ts 3)
backend/    FastAPI (uv project: pyproject.toml + uv.lock): guest + Google sign-in, cloud saves (optimistic concurrency + plausibility checks), leaderboards
Dockerfile  one image: builds the SPA, serves it + /api from uvicorn
.github/workflows/  ci.yml (tests/build) and deploy.yml (Cloud Run via Workload Identity Federation)
docs/DEPLOY.md      one-time GCP setup
```

## Local development

Backend (in-memory store when `MONGODB_URI` is unset):

```bash
cd backend && uv sync
uv run uvicorn app.main:app --reload --port 8080
```

Frontend (proxies `/api` to :8080):

```bash
cd frontend && npm install && npm run dev
```

Tests: `cd frontend && npm run check && npm test` and `cd backend && uv run pytest`.

## Architecture notes

- The **client is authoritative**: the engine runs in the browser at 10 Hz, saves to localStorage every 5s, and syncs to `/api/save` every 60s and whenever the tab is hidden. The idle math uses expected values, so it's deterministic and easy to replicate on the server later if stronger anti-cheat is needed.
- The **server** stores saves with revision-based conflict detection (the client keeps whichever side has more progress), flags implausible jumps (flagged players are hidden from leaderboards), and keeps daily mini game leaderboards.
- Numbers are plain doubles, good up to ~1e308.

## Deploy

Pushes to `main` run CI and then deploy to Cloud Run. See [docs/DEPLOY.md](docs/DEPLOY.md) for the one-time GCP and GitHub setup, including the optional Google OAuth client for Sign in with Google. The deploy job is skipped until the `GCP_PROJECT_ID` repo variable exists.
