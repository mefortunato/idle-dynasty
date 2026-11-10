<script lang="ts">
  import { onMount } from 'svelte';
  import { game } from '$lib/game.svelte';
  import { getConfig, setDisplayName } from '$lib/api';
  import Modal from './Modal.svelte';
  import GoogleButton from './GoogleButton.svelte';

  let { onClose }: { onClose: () => void } = $props();

  let clientId = $state<string | null | undefined>(undefined);
  let busy = $state(false);
  let error = $state('');
  let msg = $state('');
  let name = $state(game.account?.displayName ?? '');
  let importCode = $state('');
  let confirmReset = $state(false);
  let confirmSignOut = $state(false);

  onMount(async () => {
    clientId = (await getConfig()).googleClientId;
    await game.refreshAccount();
    if (!name) name = game.account?.displayName ?? '';
  });

  async function onCredential(credential: string) {
    busy = true;
    error = '';
    const err = await game.signInWithGoogle(credential);
    busy = false;
    if (err) error = err;
    else msg = 'Signed in! Your dynasty is now backed up to your Google account.';
  }

  async function saveName() {
    msg = (await setDisplayName(name.trim())) ? 'Coach name saved.' : 'Name must be 3-20 letters, numbers, spaces, - or _.';
    await game.refreshAccount();
  }

  async function doReset() {
    confirmReset = false;
    await game.reset();
    onClose();
  }

  async function doSignOut() {
    confirmSignOut = false;
    await game.signOut();
    onClose();
  }
</script>

<Modal title="Settings" {onClose}>
  <section>
    <h3>Account</h3>
    {#if game.account?.google}
      <div class="acct row">
        <span class="g">G</span>
        <div class="grow">
          <div class="small"><b>Signed in with Google</b></div>
          <div class="tiny muted">{game.account.google.email ?? 'Google account'}</div>
        </div>
        <button class="ghost small" onclick={() => (confirmSignOut = true)}>Sign out</button>
      </div>
      <p class="tiny muted">Your progress syncs to this account automatically. Sign in on another device to keep playing there.</p>
    {:else}
      <p class="small muted">You're playing as a guest. Your progress is saved on this device only. Sign in to back it up and play on any device; your current progress comes with you.</p>
      {#if busy}
        <p class="small">Signing in…</p>
      {:else if clientId}
        <GoogleButton {clientId} {onCredential} />
      {:else if clientId === null}
        <p class="tiny muted">Google sign-in isn't set up on this server yet.</p>
      {/if}
    {/if}
    {#if error}<p class="small red-t">{error}</p>{/if}
  </section>

  {#if game.account}
    <section>
      <h3>Coach name</h3>
      <p class="tiny muted">Shown on leaderboards.</p>
      <div class="row">
        <input class="grow" maxlength="20" bind:value={name} placeholder="Coach name" />
        <button onclick={saveName}>Save</button>
      </div>
    </section>
  {/if}

  <section>
    <h3>Save data</h3>
    <div class="row">
      <button class="grow" onclick={async () => { await navigator.clipboard?.writeText(game.exportSave()); msg = 'Save code copied to clipboard.'; }}>Export</button>
      <button class="grow" disabled={!importCode.trim()} onclick={() => { msg = game.importSave(importCode) ? 'Save imported!' : 'Invalid save code.'; }}>Import</button>
    </div>
    <input style="width:100%;margin-top:6px" placeholder="Paste a save code to import" bind:value={importCode} />
  </section>

  <section class="danger-zone">
    <h3>Start over</h3>
    <p class="tiny muted">Erase everything (cash, athletes, titles, Legacy) and begin a brand-new franchise{game.account?.google ? ', on this device and your Google account' : ''}.</p>
    <button class="danger" style="width:100%" onclick={() => (confirmReset = true)}>Reset progress</button>
  </section>

  {#if msg}<p class="small gold" style="margin:10px 0 0">{msg}</p>{/if}
</Modal>

{#if confirmReset}
  <Modal title="Reset all progress?" onClose={() => (confirmReset = false)}>
    <p>This permanently erases your franchise: all cash, venues, athletes, titles and Legacy Points. <b>This can't be undone.</b></p>
    {#if game.account?.google}<p class="small muted">Your Google account's cloud save will be reset too.</p>{/if}
    <div class="row">
      <button class="ghost grow" onclick={() => (confirmReset = false)}>Cancel</button>
      <button class="danger grow" onclick={doReset}>Yes, start over</button>
    </div>
  </Modal>
{/if}

{#if confirmSignOut}
  <Modal title="Sign out?" onClose={() => (confirmSignOut = false)}>
    <p class="small">Your progress stays safe in your Google account. This device will start a new guest game until you sign in again.</p>
    <div class="row">
      <button class="ghost grow" onclick={() => (confirmSignOut = false)}>Cancel</button>
      <button class="primary grow" onclick={doSignOut}>Sign out</button>
    </div>
  </Modal>
{/if}

<style>
  section { padding: 12px 0; border-top: 1px solid var(--line); }
  section:first-child { border-top: 0; padding-top: 0; }
  h3 { margin-bottom: 6px; }
  p { margin: 4px 0 8px; }
  .acct { background: var(--bg2); border-radius: 10px; padding: 8px 10px; }
  .g { width: 28px; height: 28px; border-radius: 50%; background: #fff; color: #4285f4; font-weight: 700; display: grid; place-items: center; }
  input { background: var(--bg2); border: 1px solid var(--line); color: var(--text); padding: 10px; border-radius: 10px; font: inherit; min-width: 0; }
  .danger-zone h3 { color: var(--red); }
</style>
