import { applyOffline, tick, type OfflineReport } from './engine/actions';
import { migrate, newGame } from './engine/state';
import type { GameState } from './engine/types';
import { adoptRevision, fetchSave, pushSave } from './api';

const SAVE_KEY = 'idle-dynasty.save.v1';
const TICK_MS = 100;
const LOCAL_SAVE_MS = 5_000;
const CLOUD_SYNC_MS = 60_000;

function loadLocal(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? migrate(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Progress score used to decide between local and cloud saves on conflict. */
function progress(s: GameState): number {
  return s.ascensions * 1e6 + s.lifetimeTrophies * 10 + s.bestTier * 1000 + Math.log10(1 + s.runCash);
}

class Game {
  s = $state<GameState>(loadLocal() ?? newGame());
  now = $state(Date.now());
  offline = $state<OfflineReport | null>(null);
  synced = $state<'idle' | 'ok' | 'offline'>('idle');
  /** Pause the idle tick (e.g. while a mini game is fullscreen we still tick; used for debugging). */
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastLocal = 0;
  private lastCloud = 0;

  start() {
    if (this.timer) return;
    this.offline = applyOffline(this.s, Date.now());
    this.timer = setInterval(() => this.step(), TICK_MS);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.saveLocal);
    void this.cloudLoad();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.saveLocal);
  }

  private onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      this.saveLocal();
      void this.cloudPush();
    } else {
      const report = applyOffline(this.s, Date.now());
      if (report) this.offline = report;
    }
  };

  private step() {
    const now = Date.now();
    tick(this.s, now);
    this.now = now;
    if (now - this.lastLocal > LOCAL_SAVE_MS) this.saveLocal();
    if (now - this.lastCloud > CLOUD_SYNC_MS) void this.cloudPush();
  }

  saveLocal = () => {
    this.lastLocal = Date.now();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify($state.snapshot(this.s)));
    } catch {
      /* storage full / private mode */
    }
  };

  async cloudLoad() {
    const remote = await fetchSave();
    if (!remote) {
      this.synced = 'offline';
      return;
    }
    const r = migrate(remote.save);
    if (progress(r) > progress(this.s)) {
      this.s = r;
      const report = applyOffline(this.s, Date.now());
      if (report) this.offline = report;
    }
    this.synced = 'ok';
    void this.cloudPush();
  }

  async cloudPush() {
    this.lastCloud = Date.now();
    const res = await pushSave($state.snapshot(this.s));
    if (res.ok) {
      this.synced = 'ok';
      return;
    }
    if (res.conflict) {
      const r = migrate(res.conflict.save);
      adoptRevision(res.conflict.revision);
      if (progress(r) > progress(this.s)) this.s = r;
      await pushSave($state.snapshot(this.s));
      this.synced = 'ok';
    } else {
      this.synced = 'offline';
    }
  }

  /** Run an engine action and persist promptly. */
  act<T>(fn: (s: GameState) => T): T {
    const out = fn(this.s);
    this.saveLocal();
    return out;
  }

  reset() {
    this.s = newGame();
    this.saveLocal();
    void this.cloudPush();
  }

  exportSave(): string {
    return btoa(unescape(encodeURIComponent(JSON.stringify($state.snapshot(this.s)))));
  }

  importSave(code: string): boolean {
    try {
      this.s = migrate(JSON.parse(decodeURIComponent(escape(atob(code.trim())))));
      this.saveLocal();
      return true;
    } catch {
      return false;
    }
  }
}

export const game = new Game();
