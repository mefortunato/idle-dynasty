<script lang="ts">
  import type { Sport } from '$lib/engine/types';
  import { SPORT_DEFS } from '$lib/engine/data';

  let { sport, celebrating = false }: { sport: Sport; celebrating?: boolean } = $props();
  const def = $derived(SPORT_DEFS[sport]);
  const activity = $derived({ basketball: 'Dribbling and shooting hoops', soccer: 'Dribbling and shooting at goal', gridiron: 'Running routes and throwing passes', baseball: 'Batting and running the bases', hockey: 'Skating and taking a slapshot' }[sport]);
</script>

<div class="scene {sport}" class:celebrating style="--sport:{def.color}">
  <svg viewBox="0 0 560 340" role="img" aria-label="{def.name} arena: {activity}">
    <defs>
      <linearGradient id="arena-night" x2="0" y2="1"><stop stop-color="#121d34" /><stop offset="1" stop-color="#26324a" /></linearGradient>
      <linearGradient id="arena-wood" x2="0" y2="1"><stop stop-color="#dca66d" /><stop offset="1" stop-color="#ba7748" /></linearGradient>
      <linearGradient id="arena-grass" x2="0" y2="1"><stop stop-color="#388b67" /><stop offset="1" stop-color="#20664b" /></linearGradient>
      <linearGradient id="arena-ice" x2="0" y2="1"><stop stop-color="#dceff3" /><stop offset="1" stop-color="#a7cddc" /></linearGradient>
      <radialGradient id="arena-glow"><stop stop-color="#e4f8ff" stop-opacity=".16" /><stop offset="1" stop-color="#e4f8ff" stop-opacity="0" /></radialGradient>
      <pattern id="arena-planks" width="56" height="18" patternUnits="userSpaceOnUse"><path d="M0 0H56M28 0V18" fill="none" stroke="#6e4028" stroke-opacity=".14" /></pattern>
      <pattern id="arena-net" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 0H7V7" fill="none" stroke="#fff" stroke-opacity=".5" /></pattern>
    </defs>

    <rect width="560" height="340" fill="url(#arena-night)" />
    <path d="M0 24Q280 91 560 24M0 45Q280 112 560 45M0 66Q280 133 560 66" fill="none" stroke="#34435c" stroke-width="13" />
    {#each [0, 1, 2] as row}
      {#each Array.from({ length: 31 }, (_, i) => i) as seat}
        <circle cx={10 + seat * 18} cy={27 + row * 19 + Math.sin(seat / 30 * Math.PI) * 32} r="2.7" fill={(seat + row) % 4 === 0 ? '#e7b56a' : (seat + row) % 3 === 0 ? '#79a6ae' : '#70809b'} opacity=".6" />
      {/each}
    {/each}
    <ellipse cx="120" cy="180" rx="180" ry="180" fill="url(#arena-glow)" />
    <ellipse cx="440" cy="180" rx="180" ry="180" fill="url(#arena-glow)" />
    <g fill="#d6e6ef">
      <rect x="23" y="26" width="49" height="5" rx="2" /><rect x="488" y="26" width="49" height="5" rx="2" />
    </g>
    <g fill="#f6dcac" font-family="system-ui, sans-serif" font-size="9" font-weight="700" letter-spacing="3" text-anchor="middle">
      <text x="280" y="24">D Y N A S T Y</text>
    </g>
    <path d="M15 109H545" stroke="#91a0b8" stroke-width="2" opacity=".4" />
    <rect x="24" y="123" width="512" height="194" rx="26" fill="#050c17" opacity=".5" />

    {#if sport === 'basketball'}
      <rect x="25" y="114" width="510" height="190" rx="10" fill="url(#arena-wood)" stroke="#f3d1a1" stroke-width="3" />
      <rect x="25" y="114" width="510" height="190" rx="10" fill="url(#arena-planks)" />
      <g fill="none" stroke="#fff0d7" stroke-width="2" opacity=".8">
        <rect x="40" y="126" width="480" height="166" rx="2" /><path d="M280 126V292" /><circle cx="280" cy="209" r="30" />
        <path d="M40 163H120V255H40M520 163H440V255H520" /><circle cx="120" cy="209" r="25" /><circle cx="440" cy="209" r="25" />
        <path d="M40 135C220 125 220 293 40 283M520 135C340 125 340 293 520 283" />
      </g>
      <path d="M40 163H96V255H40M520 163H464V255H520" fill="#943e39" opacity=".7" />
      <g stroke="#f1f5f9" stroke-width="4"><path d="M57 190V228M503 190V228" /></g>
      <g fill="none" stroke="#df6334" stroke-width="3"><ellipse cx="68" cy="209" rx="9" ry="6" /><ellipse cx="492" cy="209" rx="9" ry="6" /></g>
    {:else if sport === 'soccer' || sport === 'gridiron'}
      <rect x="25" y="114" width="510" height="190" rx="10" fill="url(#arena-grass)" stroke="#659783" stroke-width="3" />
      {#each [0, 1, 2, 3, 4] as stripe}<rect x={42 + stripe * 96} y="124" width="48" height="170" fill="#92d7a4" opacity=".08" />{/each}
      <rect x="42" y="125" width="476" height="168" fill="none" stroke="#e6eee2" stroke-width="2" />
      {#if sport === 'soccer'}
        <g fill="none" stroke="#e6eee2" stroke-width="2" opacity=".9">
          <path d="M280 125V293M42 157H112V261H42M518 157H448V261H518M42 182H72V236H42M518 182H488V236H518" />
          <circle cx="280" cy="209" r="32" /><circle cx="280" cy="209" r="2" fill="#fff" />
        </g>
        <g fill="url(#arena-net)" stroke="#eaf2ed" stroke-width="3"><rect x="23" y="182" width="18" height="54" /><rect x="519" y="182" width="18" height="54" /></g>
      {:else}
        <rect x="42" y="125" width="36" height="168" fill="#1c4b62" /><rect x="482" y="125" width="36" height="168" fill="#1c4b62" />
        {#each [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as yard}
          <path d="M{78 + yard * 40.4} 125V293" stroke="#e5ece2" stroke-width="1.5" opacity=".7" />
          <path d="M{82 + yard * 40.4} 178H{87 + yard * 40.4}M{82 + yard * 40.4} 240H{87 + yard * 40.4}" stroke="#e5ece2" stroke-width="2" />
        {/each}
        <g fill="#e5ece2" font-family="system-ui" font-size="13" font-weight="700" text-anchor="middle" opacity=".8"><text x="158" y="150">20</text><text x="239" y="150">40</text><text x="320" y="150">40</text><text x="401" y="150">20</text></g>
        <path d="M30 180V217H52V180M41 217V242M508 180V217H530V180M519 217V242" stroke="#f1c755" stroke-width="3" fill="none" />
      {/if}
    {:else if sport === 'baseball'}
      <rect x="25" y="114" width="510" height="190" rx="25" fill="url(#arena-grass)" stroke="#659783" stroke-width="3" />
      <path d="M116 157Q280 85 444 157L280 291Z" fill="#79ba83" opacity=".14" />
      <path d="M180 215L280 152L380 215L280 285Z" fill="#b88660" />
      <path d="M212 215L280 173L348 215L280 258Z" fill="#3d895c" />
      <path d="M105 154L280 285L455 154M180 215L280 152L380 215" fill="none" stroke="#f2e9d8" stroke-width="2" opacity=".8" />
      <ellipse cx="280" cy="219" rx="17" ry="10" fill="#b88660" /><rect x="274" y="216" width="12" height="3" fill="#fff0df" />
      <g fill="#fff2de"><path d="M274 280H286V286L280 290L274 286Z" /><path d="M174 215L180 209L186 215L180 221ZM274 152L280 146L286 152L280 158ZM374 215L380 209L386 215L380 221Z" /></g>
    {:else}
      <rect x="25" y="114" width="510" height="190" rx="58" fill="url(#arena-ice)" stroke="#eef8fc" stroke-width="5" />
      <rect x="35" y="123" width="490" height="172" rx="52" fill="none" stroke="#dd7c84" stroke-width="2" />
      <path d="M280 118V300" stroke="#cf6c79" stroke-width="3" /><path d="M195 116V302M365 116V302" stroke="#6098ca" stroke-width="4" />
      <g fill="none" stroke="#c97480" stroke-width="2"><circle cx="280" cy="209" r="28" /><circle cx="119" cy="162" r="23" /><circle cx="119" cy="256" r="23" /><circle cx="441" cy="162" r="23" /><circle cx="441" cy="256" r="23" /></g>
      <g fill="url(#arena-net)" stroke="#c95064" stroke-width="3"><path d="M58 187H77V231H58Z" /><path d="M483 187H502V231H483Z" /></g>
      <path d="M77 184Q114 209 77 234M483 184Q446 209 483 234" fill="#9fc6de" stroke="#7ba8cb" stroke-width="2" />
    {/if}

    <text x="280" y="328" fill="#8a9aae" font-family="system-ui" font-size="8" text-anchor="middle" letter-spacing="4">HOME OF YOUR NEXT GREAT MOMENT</text>

    <g class="athlete {sport}">
      <ellipse cy="5" rx="16" ry="5" fill="#091426" opacity=".25" />
      <g class="leg leg-back"><path d="M-5 -13L-9 -3L-6 3" stroke="#e2a578" stroke-width="6" fill="none" stroke-linecap="round" /><path d="M-8 3H-1" stroke="#e9f0fb" stroke-width="5" stroke-linecap="round" /></g>
      <g class="leg leg-front"><path d="M5 -13L9 -4L7 3" stroke="#f3bd91" stroke-width="6" fill="none" stroke-linecap="round" /><path d="M5 3H12" stroke="#e9f0fb" stroke-width="5" stroke-linecap="round" /></g>
      <path d="M-9 -26L-8 -12H8L9 -26Z" fill="#f3bd58" /><path d="M-8 -14H8V-8H1V-11H-1V-8H-8Z" fill="#263e70" />
      <path d="M-3 -26L0 -23L3 -26" fill="none" stroke="#fff0c7" stroke-width="2" />
      <text x="0" y="-15" text-anchor="middle" font-family="system-ui" font-size="8" font-weight="800" fill="#4d3826">7</text>
      <g class="arm"><path d="M-8 -24L-14 -17L-10 -12M8 -24L15 -18L20 -21" stroke="#f3bd91" stroke-width="5" fill="none" stroke-linecap="round" /></g>
      <circle cy="-35" r="9" fill="#efb387" /><path d="M-9 -35Q-10 -47 1 -45Q12 -44 9 -34L5 -39L-3 -38L-7 -32Z" fill="#302a2b" />
      <circle cx="4" cy="-34" r="1.1" fill="#382a2a" />
      {#if sport === 'gridiron' || sport === 'hockey'}<path d="M-10 -35Q-9 -48 2 -46Q12 -45 10 -33L4 -34V-38H-8Z" fill={sport === 'hockey' ? '#254b7c' : '#f3bd58'} />{/if}
      {#if sport === 'hockey'}<path d="M17 -19L30 4L42 4" fill="none" stroke="#4c4040" stroke-width="3" stroke-linecap="round" />{/if}
      {#if sport === 'baseball'}<path class="bat" d="M17 -18L31 -40" stroke="#f8d49d" stroke-width="5" stroke-linecap="round" />{/if}
    </g>
    <g class="ball {sport}">
      {#if sport === 'basketball'}
        <circle r="7" fill="#f88f38" stroke="#743923" stroke-width="1.2" /><path d="M-7 0H7M0 -7V7M-5 -5Q3 0 -5 5M5 -5Q-3 0 5 5" fill="none" stroke="#743923" stroke-width=".9" />
      {:else if sport === 'soccer'}
        <circle r="6" fill="#f2f4ef" stroke="#243d3b" /><path d="M0 -4L4 -1L2 3H-2L-4 -1Z" fill="#243d3b" />
      {:else if sport === 'gridiron'}
        <ellipse rx="9" ry="5" transform="rotate(-25)" fill="#994b2f" stroke="#ebc99b" /><path d="M-3 1L3 -2M-2 -1L-1 2M1 -3L2 0" stroke="#fff3df" />
      {:else if sport === 'baseball'}
        <circle r="4" fill="#fff5e6" /><path d="M-2 -3Q1 0 -2 3M2 -3Q-1 0 2 3" fill="none" stroke="#cf6b66" stroke-width=".8" />
      {:else}<ellipse rx="6" ry="3" fill="#1c2738" />{/if}
    </g>
    {#if celebrating}
      <g class="celebration" fill="#ffe09b" text-anchor="middle" font-family="system-ui" font-weight="800">
        <rect x="174" y="65" width="212" height="36" rx="18" fill="#132139" stroke="#e9b85b" />
        <text x="280" y="89" font-size="16">{def.bigPlay}</text>
      </g>
    {/if}
  </svg>
  <div class="scene-caption"><span class="live-dot"></span>{activity}<span class="auto">AUTO PLAY</span></div>
</div>

<style>
  .scene { background: #121d34; overflow: hidden; }
  svg { display: block; width: 100%; height: auto; }
  .scene-caption { display: flex; align-items: center; gap: 6px; padding: 10px 14px; color: #a2b4cd; background: #111d30; border-top: 1px solid #2c3b50; font-size: 10px; }
  .auto { margin-left: auto; font-size: 8px; font-weight: 700; letter-spacing: 1.2px; color: #7188a8; white-space: nowrap; }
  .live-dot { width: 5px; height: 5px; flex-shrink: 0; border-radius: 50%; background: #7adaac; box-shadow: 0 0 8px #7adaac66; }
  .athlete { animation: run-court 6s linear infinite; }
  .athlete.soccer { animation-name: run-pitch; }
  .athlete.gridiron { animation-name: run-route; }
  .athlete.baseball { animation-name: run-bases; }
  .athlete.hockey { animation-name: skate; }
  .leg { transform-origin: 0 -13px; animation: stride .4s ease-in-out infinite alternate; }
  .leg-back { animation-delay: -.4s; }
  .arm { transform-origin: 0 -25px; animation: arms .8s ease-in-out infinite alternate; }
  .bat { transform-origin: 17px -18px; animation: swing 6s ease-in-out infinite; }
  .ball { animation: basketball 6s linear infinite; }
  .ball.soccer { animation-name: soccer; }
  .ball.gridiron { animation-name: pass; }
  .ball.baseball { animation-name: hit; }
  .ball.hockey { animation-name: puck; }
  .celebrating .athlete, .celebrating .ball { filter: drop-shadow(0 0 5px #ffe09b); }
  .celebrating .athlete { --x: 410px; --y: 240px; animation: quick-move 1.6s ease-out both; }
  .celebrating .athlete.soccer { --y: 230px; }
  .celebrating .athlete.gridiron { --x: 300px; --y: 235px; }
  .celebrating .athlete.baseball { --x: 262px; --y: 280px; }
  .celebrating .athlete.hockey { --x: 404px; --y: 240px; }
  .celebrating .arm { animation: quick-arm 1.6s ease-out both; }
  .celebrating .bat { animation: swing .5s ease-out both; }
  .celebrating .ball { animation: quick-shot 1.6s ease-out both; }
  .celebrating .ball.soccer { animation-name: quick-kick; }
  .celebrating .ball.gridiron { animation-name: quick-pass; }
  .celebrating .ball.baseball { animation-name: quick-hit; }
  .celebrating .ball.hockey { animation-name: quick-puck; }
  .celebration { animation: cheer .35s ease-out both; }
  @keyframes stride { to { transform: rotate(28deg); } from { transform: rotate(-24deg); } }
  @keyframes arms { to { transform: rotate(-12deg); } }
  @keyframes swing { 0%, 8%, 100% { transform: rotate(0); } 14%, 23% { transform: rotate(100deg); } }
  @keyframes cheer { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes quick-move { 0%, 100% { transform: translate(var(--x), var(--y)); } 30% { transform: translate(var(--x), calc(var(--y) - 10px)); } }
  @keyframes quick-arm { 0%, 100% { transform: rotate(0); } 30%, 55% { transform: rotate(-65deg); } }
  @keyframes quick-shot { 0% { transform: translate(430px, 217px); } 35% { transform: translate(462px, 150px); } 70%, 100% { transform: translate(492px, 209px); } }
  @keyframes quick-kick { 0% { transform: translate(433px, 231px); } 65%, 100% { transform: translate(528px, 209px); } }
  @keyframes quick-pass { 0% { transform: translate(320px, 214px); } 35% { transform: translate(400px, 150px); } 85%, 100% { transform: translate(487px, 228px); } }
  @keyframes quick-hit { 0% { transform: translate(280px, 260px); } 70%, 100% { transform: translate(465px, 138px); } }
  @keyframes quick-puck { 0% { transform: translate(446px, 244px); } 65%, 100% { transform: translate(493px, 209px); } }
  @keyframes run-court { 0%, 100% { transform: translate(210px, 240px); } 25% { transform: translate(280px, 215px); } 50%, 65% { transform: translate(403px, 239px); } 85% { transform: translate(310px, 257px); } }
  @keyframes basketball { 0%, 100% { transform: translate(230px, 227px); } 12% { transform: translate(266px, 237px); } 25% { transform: translate(300px, 202px); } 37% { transform: translate(360px, 240px); } 50% { transform: translate(423px, 213px); } 58% { transform: translate(457px, 150px); } 65% { transform: translate(492px, 209px); } 75% { transform: translate(400px, 251px); } 85% { transform: translate(330px, 244px); } }
  @keyframes run-pitch { 0%, 100% { transform: translate(190px, 250px); } 30% { transform: translate(300px, 200px); } 55%, 65% { transform: translate(413px, 227px); } 80% { transform: translate(310px, 260px); } }
  @keyframes soccer { 0%, 100% { transform: translate(212px, 250px); } 30% { transform: translate(322px, 200px); } 55% { transform: translate(436px, 225px); } 65% { transform: translate(524px, 209px); } 80% { transform: translate(334px, 260px); } }
  @keyframes run-route { 0%, 100% { transform: translate(180px, 248px); } 30%, 45% { transform: translate(265px, 210px); } 70% { transform: translate(433px, 240px); } 85% { transform: translate(330px, 261px); } }
  @keyframes pass { 0%, 100% { transform: translate(200px, 227px); } 30% { transform: translate(285px, 189px); } 45% { transform: translate(370px, 135px); } 70% { transform: translate(453px, 219px); } 85% { transform: translate(350px, 240px); } }
  @keyframes run-bases { 0%, 25%, 100% { transform: translate(262px, 280px); } 46% { transform: translate(379px, 215px); } 65% { transform: translate(280px, 153px); } 83% { transform: translate(180px, 215px); } }
  @keyframes hit { 0% { transform: translate(280px, 215px); } 13% { transform: translate(280px, 264px); } 30%, 65% { transform: translate(450px, 146px); } 100% { transform: translate(280px, 215px); } }
  @keyframes skate { 0%, 100% { transform: translate(180px, 240px) rotate(-8deg); } 30% { transform: translate(305px, 192px) rotate(8deg); } 55%, 65% { transform: translate(404px, 240px) rotate(-10deg); } 85% { transform: translate(280px, 267px) rotate(8deg); } }
  @keyframes puck { 0%, 100% { transform: translate(221px, 244px); } 30% { transform: translate(346px, 196px); } 55% { transform: translate(446px, 244px); } 65% { transform: translate(493px, 209px); } 85% { transform: translate(321px, 271px); } }
  @media (prefers-reduced-motion: reduce) {
    .scene .athlete, .scene .ball { animation-play-state: paused; }
    .scene .leg, .scene .arm, .scene .bat, .scene .celebration { animation: none; }
  }
  @media (max-width: 380px) { .auto { display: none; } }
</style>
