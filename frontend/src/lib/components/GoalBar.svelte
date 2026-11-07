<script lang="ts">
  import { game } from '$lib/game.svelte';
  import { nextGoal } from '$lib/engine/progression';

  const goal = $derived(nextGoal(game.s));
  const prog = $derived(goal ? goal.progress(game.s) : 0);
</script>

{#if goal}
  <div class="goal card">
    <div class="row">
      <span class="lock">🔒</span>
      <div class="grow">
        <div class="tiny muted">NEXT UNLOCK · {goal.title}</div>
        <div class="small"><b>{goal.goal}</b></div>
      </div>
      <span class="small num muted">{Math.floor(prog * 100)}%</span>
    </div>
    <div class="bar" style="margin-top:6px"><i style="width:{prog * 100}%"></i></div>
  </div>
{/if}

<style>
  .goal { padding: 8px 12px; border-color: rgba(245, 184, 61, 0.35); background: linear-gradient(170deg, #2a2412, var(--card)); }
  .lock { font-size: 20px; }
</style>
