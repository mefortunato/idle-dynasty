import { applyOffline, tick, type OfflineReport } from './engine/actions';
import { checkUnlocks, type FeatureDef, type Tab } from './engine/progression';
import { migrate, newGame } from './engine/state';
import { preferRemote } from './engine/sync';
import type { GameState } from './engine/types';
import { adoptRevision, clearRevision, fetchSave, getMe, googleSignIn, logout, pushSave, type Account } from './api';

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

class Game {
  s = $state<GameState>(loadLocal() ?? newGame());
  now = $state(Date.now());
  offline = $state<OfflineReport | null>(null);
  synced = $state<'idle' | 'ok' | 'offline'>('idle');
  /** Newly unlocked features waiting to be announced (one popup at a time). */
  announce = $state<FeatureDef[]>([]);
  /** Tabs unlocked this session that haven't been visited yet. */
  newTabs = $state<Tab[]>([]);
  /** Server account info (null while offline / before the first sync). */
  account = $state<Account | null>(null);
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
    void this.cloudLoad().then(() => this.refreshAccount());
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
    this.onUnlocked(tick(this.s, now));
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
    if (preferRemote(r, this.s)) {
      this.s = r;
      const report = applyOffline(this.s, Date.now());
      if (report) this.offline = report;
    }
    this.synced = 'ok';
    void this.cloudPush();
  }

  async refreshAccount() {
    this.account = await getMe();
  }

  /** Called with the ID token from the Google button. */
  async signInWithGoogle(credential: string): Promise<string | null> {
    this.saveLocal();
    const res = await googleSignIn(credential);
    if ('error' in res) return res.error;
    this.account = res;
    if (!res.linked) {
      // Signed into an existing account: reconcile this device's save with the account's.
      clearRevision();
      await this.cloudLoad();
    } else {
      void this.cloudPush();
    }
    return null;
  }

  /** Sign out: progress stays on the account; this device starts over as a new guest. */
  async signOut() {
    await this.cloudPush();
    await logout();
    this.account = null;
    this.startFresh(0);
  }

  private startFresh(resetAt: number) {
    const fresh = newGame();
    fresh.resetAt = resetAt;
    this.s = fresh;
    this.announce = [];
    this.newTabs = [];
    this.offline = null;
    this.saveLocal();
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
      if (preferRemote(r, this.s)) this.s = r;
      await pushSave($state.snapshot(this.s));
      this.synced = 'ok';
    } else {
      this.synced = 'offline';
    }
  }

  private onUnlocked(list: FeatureDef[]) {
    for (const f of list) {
      if (!f.quiet) this.announce = [...this.announce, f];
      if (f.tab && f.tab !== 'arena' && (f.id === f.tab || (f.id === 'office' && f.tab === 'office')) && !this.newTabs.includes(f.tab)) {
        this.newTabs = [...this.newTabs, f.tab];
      }
    }
  }

  dismissAnnouncement() {
    this.announce = this.announce.slice(1);
  }

  visitTab(t: Tab) {
    if (this.newTabs.includes(t)) this.newTabs = this.newTabs.filter((x) => x !== t);
  }

  /** Run an engine action and persist promptly. */
  act<T>(fn: (s: GameState) => T): T {
    const out = fn(this.s);
    this.onUnlocked(checkUnlocks(this.s));
    this.saveLocal();
    return out;
  }

  /** Wipe all progress (locally and on the account) and start over. */
  async reset() {
    this.startFresh(Date.now());
    await this.cloudPush();
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
