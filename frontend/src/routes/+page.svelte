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
  import { fmt, fmtTime } from '$lib/engine/format';

  type Tab = 'arena' | 'train' | 'playoffs' | 'roster' | 'office';
  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'arena', label: 'Arena', icon: '🏟️' },
    { id: 'train', label: 'Train', icon: '⏱️' },
    { id: 'playoffs', label: 'Playoffs', icon: '🏆' },
    { id: 'roster', label: 'Roster', icon: '🃏' },
    { id: 'office', label: 'Office', icon: '🏛️' }
  ];
  let tab = $state<Tab>('arena');

  onMount(() => {
    try { const t = localStorage.getItem('idle-dynasty.tab') as Tab | null; if (t && TABS.some((x) => x.id === t)) tab = t; } catch { /* ignore */ }
    game.start();
    if ('serviceWorker' in navigator && !import.meta.env.DEV) navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => game.stop();
  });

  function go(t: Tab) {
    tab = t;
    try { localStorage.setItem('idle-dynasty.tab', t); } catch { /* ignore */ }
    window.scrollTo({ top: 0 });
  }

  const s = $derived(game.s);
  const badge = $derived({
    train: s.energy > 0 || !!s.hand,
    playoffs: s.readiness >= 1 && !s.playoff?.active,
    roster: s.tokens >= 10 || !s.lineupLocked,
    office: false,
    arena: false
  } as Record<Tab, boolean>);
</script>

<div class="app">
  <TopBar />
  <main>
    {#if tab === 'arena'}<Arena onNav={go} />
    {:else if tab === 'train'}<Train />
    {:else if tab === 'playoffs'}<Playoffs />
    {:else if tab === 'roster'}<Roster />
    {:else}<Office />{/if}
  </main>
  <nav class="tabbar">
    {#each TABS as t}
      <button class:active={tab === t.id} onclick={() => go(t.id)}>
        <span class="ic">{t.icon}</span>
        <span class="lb">{t.label}</span>
        {#if badge[t.id] && tab !== t.id}<span class="dot"></span>{/if}
      </button>
    {/each}
  </nav>
</div>

{#if game.offline}
  <Modal title="Welcome back, Coach!" onClose={() => (game.offline = null)}>
    <p class="muted">Your teams kept playing for <b>{fmtTime(game.offline.ms)}</b>.</p>
    <div class="earn">
      <div><span class="display gold">💵 {fmt(game.offline.cash)}</span><span class="small muted">Cash</span></div>
      <div><span class="display">📣 {fmt(game.offline.fans)}</span><span class="small muted">Fans</span></div>
    </div>
    <button class="primary" style="width:100%" onclick={() => (game.offline = null)}>Let's go</button>
  </Modal>
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
  .earn { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0 16px; }
  .earn > div { background: var(--card2); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .earn .display { font-size: 22px; }
</style>
