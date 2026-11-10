<script lang="ts">
  import { onMount } from 'svelte';

  /** Renders Google's official "Sign in with Google" button (Google Identity Services). */
  let { clientId, onCredential }: { clientId: string; onCredential: (credential: string) => void } = $props();
  let el: HTMLDivElement | undefined = $state();
  let failed = $state(false);

  interface Gsi {
    accounts: {
      id: {
        initialize(opts: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }): void;
        renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
      };
    };
  }

  let loader: Promise<Gsi> | null = null;
  function loadGsi(): Promise<Gsi> {
    const w = window as unknown as { google?: Gsi };
    if (w.google?.accounts?.id) return Promise.resolve(w.google);
    loader ??= new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => (w.google ? resolve(w.google) : reject(new Error('GSI missing')));
      s.onerror = () => reject(new Error('GSI failed to load'));
      document.head.appendChild(s);
    });
    return loader;
  }

  onMount(() => {
    loadGsi()
      .then((g) => {
        g.accounts.id.initialize({ client_id: clientId, callback: (r) => onCredential(r.credential), ux_mode: 'popup' });
        if (el) g.accounts.id.renderButton(el, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', width: 260 });
      })
      .catch(() => (failed = true));
  });
</script>

{#if failed}
  <p class="small muted">Couldn't load Google sign-in. Check your connection and try again.</p>
{:else}
  <div class="gbtn" bind:this={el}></div>
{/if}

<style>
  .gbtn { display: flex; justify-content: center; min-height: 44px; }
</style>
