<script lang="ts">
  import { onMount } from 'svelte';
  import { game } from '$lib/game.svelte';
  import TopBar from '$lib/components/TopBar.svelte';
  import Arena from '$lib/components/Arena.svelte';
  import Train from '$lib/components/Train.svelte';
  import Playoffs from '$lib/components/Playoffs.svelte';
  import Roster from '$lib/components/Roster.svelte';
  import Office from '$lib/components/Office.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import DraftModal from '$lib/components/DraftModal.svelte';
  import Settings from '$lib/components/Settings.svelte';
  import { fmt, fmtTime } from '$lib/engine/format';
  import { tabUnlocked, type Tab } from '$lib/engine/progression';

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'arena', label: 'Arena', icon: '🏟️' },
    { id: 'train', label: 'Train', icon: '⏱️' },
    { id: 'playoffs', label: 'Playoffs', icon: '🏆' },
    { id: 'roster', label: 'Roster', icon: '🃏' },
    { id: 'office', label: 'Office', icon: '🏛️' }
  ];
  let tab = $state<Tab>('arena');
  let settingsOpen = $state(false);

  onMount(() => {
    try { const t = localStorage.getItem('idle-dynasty.tab') as Tab | null; if (t && TABS.some((x) => x.id === t) && tabUnlocked(game.s, t)) tab = t; } catch { /* ignore */ }
    game.start();
    if ('serviceWorker' in navigator && !import.meta.env.DEV) navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => game.stop();
  });

  function go(t: Tab) {
    tab = t;
    game.visitTab(t);
    try { localStorage.setItem('idle-dynasty.tab', t); } catch { /* ignore */ }
    window.scrollTo({ top: 0 });
  }

  const s = $derived(game.s);
  const tabs = $derived(TABS.filter((t) => tabUnlocked(s, t.id)));
  const ann = $derived(game.announce[0] ?? null);
  const welcome = $derived(!s.unlocked.includes('welcome') && !game.offline);
  // If the current tab somehow isn't available (e.g. after a reset), fall back to the Arena.
  $effect(() => { if (!tabUnlocked(s, tab)) tab = 'arena'; });
  const badge = $derived({
    train: s.energy > 0 || !!s.hand,
    playoffs: s.readiness >= 1 && !s.playoff?.active,
    roster: s.unlocked.includes('scouting') && s.tokens >= 10,
    office: false,
    arena: false
  } as Record<Tab, boolean>);
</script>

<div class="app">
  <TopBar onSettings={() => (settingsOpen = true)} />
  <main>
    {#if tab === 'arena'}<Arena onNav={go} />
    {:else if tab === 'train'}<Train />
    {:else if tab === 'playoffs'}<Playoffs />
    {:else if tab === 'roster'}<Roster />
    {:else}<Office />{/if}
  </main>
  {#if tabs.length > 1}
    <nav class="tabbar">
      {#each tabs as t (t.id)}
        <button class:active={tab === t.id} onclick={() => go(t.id)}>
          <span class="ic">{t.icon}</span>
          <span class="lb">{t.label}</span>
          {#if game.newTabs.includes(t.id) && tab !== t.id}<span class="new tiny">NEW</span>
          {:else if badge[t.id] && tab !== t.id}<span class="dot"></span>{/if}
        </button>
      {/each}
    </nav>
  {/if}
</div>

{#if game.offline}
  <Modal title="Welcome back, Coach!" onClose={() => (game.offline = null)}>
    <p class="muted">Your active arena kept playing for <b>{fmtTime(game.offline.ms)}</b>.</p>
    <div class="earn">
      <div><span class="display gold">💵 {fmt(game.offline.cash)}</span><span class="small muted">Cash</span></div>
      <div><span class="display">📣 {fmt(game.offline.fans)}</span><span class="small muted">Fans</span></div>
    </div>
    <button class="primary" style="width:100%" onclick={() => (game.offline = null)}>Let's go</button>
  </Modal>
{/if}

{#if welcome}
  <Modal title="Welcome, Coach!">
    <div class="intro">
      <div class="big">🏀</div>
      <p>You've just taken over a basketball franchise. Your team plays <b>automatically</b>, and every play earns 💵 cash, even while you're away.</p>
      <p>Spend cash on upgrades to earn faster. New features unlock as your franchise grows.</p>
      <p class="muted small">Start by tapping <b>Seating</b>.</p>
    </div>
    <button class="primary" style="width:100%" onclick={() => game.act((st) => { st.unlocked.push('welcome'); })}>Tip off!</button>
  </Modal>
{:else if ann && !game.offline}
  <Modal title="Unlocked: {ann.title}" onClose={() => game.dismissAnnouncement()}>
    <div class="intro">
      <div class="big">{ann.icon}</div>
      {#each ann.intro as line}<p>{line}</p>{/each}
    </div>
    <div class="row">
      <button class="ghost grow" onclick={() => game.dismissAnnouncement()}>Got it</button>
      {#if ann.tab && ann.tab !== tab}
        <button class="primary grow" onclick={() => { const t = ann.tab!; game.dismissAnnouncement(); go(t); }}>Show me</button>
      {/if}
    </div>
  </Modal>
{/if}

{#if settingsOpen}
  <Settings onClose={() => (settingsOpen = false)} />
{/if}

{#if s.pendingDraft}
  <DraftModal />
{/if}

<style>
  .app { max-width: 560px; margin: 0 auto; min-height: 100dvh; }
  main { padding: 8px 12px calc(var(--tabbar) + 24px + env(safe-area-inset-bottom)); }
  .tabbar {
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 20;
    display: flex; justify-content: center;
    background: rgba(11, 18, 32, 0.96); backdrop-filter: blur(8px);
    border-top: 1px solid var(--line);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .tabbar button {
    flex: 1; max-width: 112px; height: var(--tabbar); background: transparent; border-radius: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; position: relative;
    color: var(--muted);
  }
  .tabbar button.active { color: var(--gold); }
  .tabbar button.active .ic { transform: translateY(-2px) scale(1.12); }
  .ic { font-size: 22px; transition: transform 0.15s; }
  .lb { font-size: 11px; font-weight: 600; }
  .dot { position: absolute; top: 10px; right: calc(50% - 18px); width: 9px; height: 9px; border-radius: 50%; background: var(--red); }
  .new { position: absolute; top: 6px; right: calc(50% - 30px); background: var(--red); color: #fff; font-weight: 700; padding: 0 5px; border-radius: 99px; font-size: 9px; }
  .intro { text-align: center; margin-bottom: 14px; }
  .intro p { margin: 8px 0; }
  .big { font-size: 56px; }
  .earn { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0 16px; }
  .earn > div { background: var(--card2); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .earn .display { font-size: 22px; }
</style>
