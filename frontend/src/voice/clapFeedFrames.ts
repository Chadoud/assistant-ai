import { createInitialDoubleClapState, processDoubleClapSample } from "./doubleClapEngine";

/**
 * Test helper: feed synthetic RMS samples over time (same semantics as double-clap tests).
 */
export function feedDoubleClapFrames(
  spec: { durationMs: number; stepMs?: number; rms: number }[]
): { doubleClapCount: number; states: boolean[] } {
  let t = 0;
  let state = createInitialDoubleClapState();
  let doubleClapCount = 0;
  const states: boolean[] = [];

  for (const segment of spec) {
    const step = segment.stepMs ?? 10;
    const steps = Math.max(1, Math.ceil(segment.durationMs / step));
    for (let i = 0; i < steps; i++) {
      const r = processDoubleClapSample(state, t, segment.rms);
      state = r.state;
      states.push(r.doubleClap);
      if (r.doubleClap) doubleClapCount += 1;
      t += step;
    }
  }

  return { doubleClapCount, states };
}
