/**
 * Tunable thresholds — shared by the hook, dev mic test, and unit tests.
 * Tuned for laptop mics: claps are short transients; speech is steadier and lower rise ratio.
 */
const DOUBLE_CLAP_RMS_THRESHOLD = 0.068;
const DOUBLE_CLAP_RISE_RATIO = 2.45;
const DOUBLE_CLAP_MIN_MS_BETWEEN_PEAKS = 115;
const DOUBLE_CLAP_MAX_MS_DOUBLE = 980;
export const DOUBLE_CLAP_MIN_MS_DOUBLE = 230;
export const DOUBLE_CLAP_COOLDOWN_MS = 2200;

interface DoubleClapEngineState {
  prevRms: number;
  lastPeakAt: number;
  firstClapAt: number;
  lastDoubleClapAt: number;
}

export function createInitialDoubleClapState(): DoubleClapEngineState {
  return {
    prevRms: 0,
    /** Sentinel so the first transient is not rejected by `now - lastPeakAt >= MIN_MS_BETWEEN_PEAKS`. */
    lastPeakAt: -Infinity,
    firstClapAt: 0,
    lastDoubleClapAt: 0,
  };
}

/**
 * Processes one audio analysis frame. Call once per RMS sample with monotonic `now` (e.g. performance.now()).
 * Matches the logic in `useDoubleClapWake`.
 */
export function processDoubleClapSample(
  state: DoubleClapEngineState,
  now: number,
  rms: number
): { state: DoubleClapEngineState; doubleClap: boolean } {
  const prevRmsIn = state.prevRms;
  const isTransient =
    rms >= DOUBLE_CLAP_RMS_THRESHOLD &&
    prevRmsIn > 1e-6 &&
    rms >= prevRmsIn * DOUBLE_CLAP_RISE_RATIO;

  let { lastPeakAt, firstClapAt, lastDoubleClapAt } = state;
  let doubleClap = false;

  if (isTransient && now - lastPeakAt >= DOUBLE_CLAP_MIN_MS_BETWEEN_PEAKS) {
    lastPeakAt = now;

    if (firstClapAt > 0 && now - firstClapAt > DOUBLE_CLAP_MAX_MS_DOUBLE) {
      firstClapAt = 0;
    }

    if (firstClapAt === 0) {
      firstClapAt = now;
    } else {
      const gap = now - firstClapAt;
      const cooldownOk =
        lastDoubleClapAt === 0 || now - lastDoubleClapAt >= DOUBLE_CLAP_COOLDOWN_MS;
      if (gap >= DOUBLE_CLAP_MIN_MS_DOUBLE && gap <= DOUBLE_CLAP_MAX_MS_DOUBLE && cooldownOk) {
        lastDoubleClapAt = now;
        firstClapAt = 0;
        doubleClap = true;
      } else if (gap < DOUBLE_CLAP_MIN_MS_DOUBLE) {
        /* Same burst / echo — ignore second peak until spacing is plausible. */
      } else {
        firstClapAt = now;
      }
    }
  }

  /** Slightly faster decay so a second clap can spike above the smoothed floor. */
  const nextPrevRms = rms * 0.76 + prevRmsIn * 0.24;

  return {
    state: {
      prevRms: nextPrevRms,
      lastPeakAt,
      firstClapAt,
      lastDoubleClapAt,
    },
    doubleClap,
  };
}
