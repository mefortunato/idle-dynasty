/** Thin client for the FastAPI backend. Everything degrades gracefully when offline. */
const TOKEN_KEY = 'idle-dynasty.token';
const REV_KEY = 'idle-dynasty.revision';

function token(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T | null }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let data: T | null = null;
  try { data = (await res.json()) as T; } catch { /* empty */ }
  return { status: res.status, data };
}

export async function ensureAuth(): Promise<boolean> {
  if (token()) return true;
  try {
    const r = await req<{ userId: string; token: string }>('POST', '/auth/guest', {});
    if (r.status === 200 && r.data?.token) {
      localStorage.setItem(TOKEN_KEY, r.data.token);
      return true;
    }
  } catch { /* offline */ }
  return false;
}

function getRev(): number | null {
  try { const v = localStorage.getItem(REV_KEY); return v ? Number(v) : null; } catch { return null; }
}
function setRev(r: number) {
  try { localStorage.setItem(REV_KEY, String(r)); } catch { /* ignore */ }
}

export async function fetchSave(): Promise<{ save: unknown; revision: number } | null> {
  if (!(await ensureAuth())) return null;
  try {
    const r = await req<{ save: unknown; revision: number }>('GET', '/save');
    if (r.status === 401) { localStorage.removeItem(TOKEN_KEY); return null; }
    if (r.status === 200 && r.data) { setRev(r.data.revision); return r.data; }
  } catch { /* offline */ }
  return null;
}

export type PushResult = { ok: true } | { ok: false; conflict?: { save: unknown; revision: number } };

export async function pushSave(save: unknown): Promise<PushResult> {
  if (!(await ensureAuth())) return { ok: false };
  try {
    const r = await req<{ revision: number; server?: { save: unknown; revision: number } | null }>('PUT', '/save', { save, revision: getRev() });
    if (r.status === 200 && r.data) { setRev(r.data.revision); return { ok: true }; }
    if (r.status === 409 && r.data) {
      if (r.data.server) return { ok: false, conflict: r.data.server };
      try { localStorage.removeItem(REV_KEY); } catch { /* ignore */ }
      return { ok: false };
    }
    if (r.status === 401) localStorage.removeItem(TOKEN_KEY);
  } catch { /* offline */ }
  return { ok: false };
}

export function adoptRevision(r: number) { setRev(r); }

export async function submitScore(variant: string, score: number, durationMs: number, medal: string) {
  if (!(await ensureAuth())) return;
  try { await req('POST', '/scores', { variant, score: Math.round(score), durationMs: Math.round(durationMs), medal }); } catch { /* ignore */ }
}

export interface LeaderRow { displayName: string; score?: number; bestTier?: number; lifetimeTrophies?: number }

export async function leaderboard(kind: 'dynasty' | string): Promise<LeaderRow[]> {
  try {
    const path = kind === 'dynasty' ? '/leaderboard/dynasty' : `/leaderboard/scores/${kind}`;
    const r = await req<LeaderRow[] | { entries: LeaderRow[] }>('GET', path);
    if (r.status !== 200 || !r.data) return [];
    return Array.isArray(r.data) ? r.data : r.data.entries ?? [];
  } catch { return []; }
}

export interface Account {
  userId: string;
  displayName: string;
  google: { email: string | null } | null;
}

export function hasToken(): boolean {
  return !!token();
}

/** Forget the local token and revision (next sync creates a fresh guest). */
export function clearIdentity() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REV_KEY);
  } catch { /* ignore */ }
}

export function clearRevision() {
  try { localStorage.removeItem(REV_KEY); } catch { /* ignore */ }
}

let configCache: Promise<{ googleClientId: string | null }> | null = null;
export function getConfig(): Promise<{ googleClientId: string | null }> {
  configCache ??= req<{ googleClientId: string | null }>('GET', '/config')
    .then((r) => r.data ?? { googleClientId: null })
    .catch(() => ({ googleClientId: null }));
  return configCache;
}

export async function getMe(): Promise<Account | null> {
  if (!token()) return null;
  try {
    const r = await req<Account>('GET', '/me');
    return r.status === 200 ? r.data : null;
  } catch { return null; }
}

export type GoogleResult = (Account & { linked: boolean }) | { error: string };

/** Exchange a Google ID token; sends the current guest token so progress can be linked. */
export async function googleSignIn(credential: string): Promise<GoogleResult> {
  try {
    const r = await req<Account & { linked: boolean; token: string; detail?: string }>('POST', '/auth/google', { credential });
    if (r.status !== 200 || !r.data?.token) return { error: r.data?.detail ?? `Sign-in failed (${r.status})` };
    localStorage.setItem(TOKEN_KEY, r.data.token);
    const { token: _t, ...account } = r.data;
    return account;
  } catch {
    return { error: 'Could not reach the server.' };
  }
}

export async function logout() {
  try { await req('POST', '/auth/logout'); } catch { /* offline: still clear locally */ }
  clearIdentity();
}

export async function setDisplayName(displayName: string): Promise<boolean> {
  if (!(await ensureAuth())) return false;
  try { return (await req('PATCH', '/me', { displayName })).status === 200; } catch { return false; }
}
