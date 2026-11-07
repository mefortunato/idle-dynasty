<script lang="ts">
  import { game } from '$lib/game.svelte';
  import { pickDraft, upcomingSports } from '$lib/engine/actions';
  import { SPORT_DEFS } from '$lib/engine/data';
  import AthleteCard from './AthleteCard.svelte';
  import Modal from './Modal.svelte';

  const s = $derived(game.s);
  const up = $derived(upcomingSports(s, 3));
</script>

<Modal title="Draft Day">
  <p class="small muted">Pick one athlete to sign for free. Upcoming playoffs:
    {#each up as u}<b> {SPORT_DEFS[u.sport].emoji} T{u.tier}</b>{/each}
  </p>
  <div class="opts">
    {#each s.pendingDraft ?? [] as a (a.id)}
      <AthleteCard {a} onclick={() => game.act((st) => pickDraft(st, a.id))} />
    {/each}
  </div>
  <p class="tiny muted">Then head to the Roster tab to rebuild your lineup before the playoffs lock it.</p>
</Modal>

<style>
  .opts { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px; margin: 10px 0; }
</style>
