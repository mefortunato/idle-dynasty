import type { Sport } from './types';

/** Metadata for every mini game variant. Implementations live in $lib/minigames/<id>.ts. */
export interface VariantMeta {
  id: string;
  sport: Sport;
  name: string;
  blurb: string;
  /** Short how-to shown before the round starts. */
  howTo: string;
}

export const VARIANTS: VariantMeta[] = [
  { id: 'qb-read', sport: 'gridiron', name: 'QB Read', blurb: 'Hit the open receiver before the rush gets home.', howTo: 'Receivers flash open one at a time. Tap the open (green) receiver before the pocket collapses. Wrong taps are interceptions.' },
  { id: 'field-goal', sport: 'gridiron', name: 'Field Goal', blurb: 'Two-tap power & accuracy with wind drift.', howTo: 'Tap once to lock power, tap again to lock accuracy. Watch the wind!' },
  { id: 'juke-runner', sport: 'gridiron', name: 'Juke Runner', blurb: 'Swipe between lanes to dodge defenders.', howTo: 'Swipe or tap left/right to change lanes. Avoid defenders, grab yards.' },
  { id: 'penalty-shootout', sport: 'soccer', name: 'Penalty Shootout', blurb: 'Aim, power, and outguess the keeper.', howTo: 'Drag from the ball toward the goal and release. Longer drag = more power. The keeper learns your favorite corner.' },
  { id: 'keepy-uppy', sport: 'soccer', name: 'Keepy-Uppy', blurb: 'Keep the ball in the air.', howTo: 'Tap the ball as it falls to juggle it. Don\'t let it touch the ground.' },
  { id: 'through-ball', sport: 'soccer', name: 'Through Ball', blurb: 'Thread a pass between defenders.', howTo: 'Tap where you want to play the ball so your runner reaches it before any defender.' },
  { id: 'free-throw', sport: 'basketball', name: 'Free Throw Rhythm', blurb: 'Stay on the beat, then release.', howTo: 'Tap in time with the dribble beats, then tap on the release marker to shoot.' },
  { id: 'three-point', sport: 'basketball', name: '3-Point Contest', blurb: 'Five racks, a speeding arc meter.', howTo: 'Hold to raise the arc meter and release in the green zone. The meter speeds up each rack.' },
  { id: 'fast-break', sport: 'basketball', name: 'Fast Break', blurb: 'Swipe passes to open cutters.', howTo: 'Tap the open teammate before the defender closes the lane.' },
  { id: 'batting-cage', sport: 'baseball', name: 'Batting Cage', blurb: 'Time the swing, find the pitch.', howTo: 'Tap when the pitch reaches the plate. Tap on the ball\'s location for a sweet-spot bonus.' },
  { id: 'paint-corner', sport: 'baseball', name: 'Paint the Corner', blurb: 'Locate pitches in a moving zone.', howTo: 'Tap to throw when the crosshair is inside the moving target corner.' },
  { id: 'shoestring-catch', sport: 'baseball', name: 'Shoestring Catch', blurb: 'Run down fly balls.', howTo: 'Drag your fielder under the shadow of each fly ball before it lands.' },
  { id: 'slapshot', sport: 'hockey', name: 'Slapshot', blurb: 'Wind up and fire through the gaps.', howTo: 'Hold to wind up, release to shoot through a gap between the moving blockers.' },
  { id: 'goalie-reflex', sport: 'hockey', name: 'Goalie Reflex', blurb: 'Read the shooter, make the save.', howTo: 'Tap the quadrant of the net where the puck is headed.' },
  { id: 'stickhandling', sport: 'hockey', name: 'Stickhandling', blurb: 'Weave the puck through the cones.', howTo: 'Drag to steer the puck through the gates. Hitting a cone costs points.' }
];

export const VARIANTS_BY_ID: Record<string, VariantMeta> = Object.fromEntries(VARIANTS.map((v) => [v.id, v]));
