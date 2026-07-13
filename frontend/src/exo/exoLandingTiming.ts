/**
 * Single source of truth for all Exo launch-sequence timing constants.
 *
 * ## Why these numbers exist
 *
 * When the Exo tab is first visited the layout follows this sequence:
 *
 *   1. `TesseractVisual` fades in (`tv-intro-fade`, 1.8 s).
 *   2. Cubes stagger in: each cube's `tv-float` animation is delayed by
 *      `i * 0.05 s` (see `TesseractVisual.tsx`).  The *last* cube (index 26)
 *      starts at 1 300 ms and completes one full `tv-float` cycle at 3 100 ms.
 *      This is `TESSERACT_LAUNCH_COMPLETE_MS` — the natural "launch done" moment.
 *   3. At `TESSERACT_LAUNCH_COMPLETE_MS` the speed blend from fast-spin to
 *      normal rotation must already be complete.  To achieve this, the blend
 *      starts `PRE_BLEND_DELAY_MS` ms *before* launch-complete, so it finishes
 *      exactly when launch fires (see `ExoPanelChrome.tsx`).
 *   4. `EXO_INTRO_HOLD_MS` (in `constants.ts`) is a *fallback* timer that
 *      force-reveals the chrome if `TesseractVisual.onIntroComplete` never
 *      fires (component unmounted, animation disabled).  It must be greater
 *      than `TESSERACT_LAUNCH_COMPLETE_MS`.
 *
 * ## Sync requirements
 *
 * - `CUBE_COUNT` and the per-cube `delay={i * 0.05}` in `TesseractVisual.tsx`
 *   must stay consistent with `TESSERACT_LAUNCH_COMPLETE_MS`.
 * - The `tv-float 1.8s` duration in `TesseractVisual.css` is the 1800 ms term.
 * - `CHROME_TRANSITION_MS` mirrors `EXO_CHROME_TRANSITION_MS` from
 *   `constants.ts` — both must equal the CSS `--exo-intro-ms` /
 *   `--app-shell-intro-ms` variable.  Do not drift them independently.
 */

/** Number of tesseract cubes; drives the stagger delay formula. */
const CUBE_COUNT = 27;

/**
 * Duration of the `tv-float` CSS animation (ms).
 * Must match the `tv-float 1.8s` declaration in `TesseractVisual.css`.
 */
const TV_FLOAT_DURATION_MS = 1800;

/**
 * Milliseconds after `introActive` becomes `true` when all cubes have
 * completed their first breathing cycle — the natural "launch complete" moment.
 *
 * Formula: last cube delay = (CUBE_COUNT − 1) × 50 ms = 1 300 ms
 *          + one tv-float period                       = 1 800 ms
 *          ─────────────────────────────────────────────────────
 *          Total                                        = 3 100 ms
 */
export const TESSERACT_LAUNCH_COMPLETE_MS = (CUBE_COUNT - 1) * 50 + TV_FLOAT_DURATION_MS; // 3 100 ms

/**
 * Returns the number of milliseconds to wait before starting the Tesseract
 * speed blend (fast-spin → normal) so that the blend finishes exactly when
 * `TESSERACT_LAUNCH_COMPLETE_MS` fires and the surrounding panels begin
 * sliding in.
 *
 * @param chromeTransitionMs - Duration of the chrome slide-in animation (ms).
 *   Should equal `EXO_CHROME_TRANSITION_MS` from `constants.ts`.
 */
export function computePreBlendDelayMs(chromeTransitionMs: number): number {
  return Math.max(0, TESSERACT_LAUNCH_COMPLETE_MS - chromeTransitionMs);
}
