<script lang="ts">
  import type { Snippet } from 'svelte';
  let { title, onClose, children, wide = false }: { title: string; onClose?: () => void; children: Snippet; wide?: boolean } = $props();
</script>

<div class="backdrop" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
  <div class="modal card" class:wide role="dialog" aria-modal="true" aria-label={title}>
    <div class="head">
      <h2>{title}</h2>
      {#if onClose}<button class="x ghost" aria-label="Close" onclick={onClose}>✕</button>{/if}
    </div>
    {@render children()}
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(3, 6, 14, 0.72); z-index: 50; display: flex; align-items: flex-end; justify-content: center; padding: 12px; animation: fade 0.15s; }
  .modal { width: 100%; max-width: 440px; max-height: 88dvh; overflow-y: auto; animation: up 0.2s ease-out; margin-bottom: env(safe-area-inset-bottom); }
  .modal.wide { max-width: 540px; }
  .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 8px; }
  .x { padding: 4px 10px; }
  @media (min-height: 700px) { .backdrop { align-items: center; } }
  @keyframes fade { from { opacity: 0; } }
  @keyframes up { from { transform: translateY(30px); opacity: 0; } }
</style>
