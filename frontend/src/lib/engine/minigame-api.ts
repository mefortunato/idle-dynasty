/**
 * Contract every mini game implements. Mini games are plain TypeScript modules that draw
 * into a <canvas> and report a normalized score of 0..1000.
 */
export interface MiniGameContext {
  canvas: HTMLCanvasElement;
  /** CSS pixel size of the canvas. The canvas backing store is already sized width*dpr × height*dpr. */
  width: number;
  height: number;
  dpr: number;
  /** 1..10 — scales speed / window tightness. */
  difficulty: number;
  /** 0..0.5 — fraction by which timing/hit windows should be widened (lineup athletes help). */
  assist: number;
  /** Total time for the round. 30 000 for a normal round, 8 000 for a playoff clutch moment. */
  durationMs: number;
  /** True in a playoff clutch moment: one short high-stakes attempt sequence. */
  clutch: boolean;
  /** Seeded RNG for reproducibility. */
  rng: () => number;
  /** Optional: call whenever the running score changes (0..1000). */
  onScore?: (score: number) => void;
  /** Must be called exactly once when the round ends (time up or game over). */
  onFinish: (score: number) => void;
}

export interface MiniGameInstance {
  /** Stop loops, remove listeners. Safe to call multiple times / after finish. */
  destroy(): void;
}

export type MiniGameFactory = (ctx: MiniGameContext) => MiniGameInstance;
