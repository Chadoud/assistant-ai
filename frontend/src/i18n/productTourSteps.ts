import type { MainNavTab } from "../hooks/useMainNavItems";

/** Metadata for one guided-tour step (copy lives in `tourStepBundles`). */
export type ProductTourStepMeta = {
  id: string;
  /** `[data-tour="…"]` selector; omit for full-screen intro (no hole). */
  targetSelector?: string;
  tab?: MainNavTab;
};

/** Default cloud-sort tour — sort happy path, no Ollama deep dive. */
const CORE_PRODUCT_TOUR_STEPS: ProductTourStepMeta[] = [
  { id: "intro" },
  {
    id: "sort-flow-strip",
    targetSelector: '[data-tour="sort-flow-strip"]',
    tab: "queue",
  },
  {
    id: "sort-tab",
    targetSelector: '[data-tour="nav-queue"]',
    tab: "queue",
  },
  {
    id: "workspace-local",
    targetSelector: '[data-tour="workspace-sort-sources"]',
    tab: "queue",
  },
  {
    id: "external-sources",
    targetSelector: '[data-tour="workspace-external-sources"]',
    tab: "queue",
  },
  {
    id: "run-sort",
    targetSelector: '[data-tour="run-sort"]',
    tab: "queue",
  },
  {
    id: "results-tab",
    targetSelector: '[data-tour="nav-overview"]',
    tab: "overview",
  },
  {
    id: "assistant-chat",
    targetSelector: '[data-tour="nav-assistant"]',
    tab: "assistant",
  },
  {
    id: "sources-tab",
    targetSelector: '[data-tour="nav-sources"]',
    tab: "sources",
  },
  {
    id: "settings-output-folder",
    targetSelector: '[data-tour="settings-output-folder"]',
    tab: "settings",
  },
  {
    id: "help-shortcuts",
    targetSelector: '[data-tour="header-help"]',
    tab: "queue",
  },
];

/** Appended when sorting runs locally (not cloud classification). */
const LOCAL_SORT_TOUR_APPEND: ProductTourStepMeta[] = [
  {
    id: "settings-models-overview",
    targetSelector: '[data-tour="settings-models-active"]',
    tab: "settings",
  },
  {
    id: "settings-system",
    targetSelector: '[data-tour="settings-system"]',
    tab: "settings",
  },
];

/**
 * Ordered tour steps for the current product mode.
 * @param cloudSortActive When true, omits local-model settings steps.
 */
export function buildProductTourStepMeta(cloudSortActive: boolean): ProductTourStepMeta[] {
  if (cloudSortActive) return [...CORE_PRODUCT_TOUR_STEPS];
  return [...CORE_PRODUCT_TOUR_STEPS, ...LOCAL_SORT_TOUR_APPEND];
}

/** Tour highlight id at `stepIndex`, or null when tour is closed / index out of range. */
export function productTourHighlightId(
  stepMeta: ProductTourStepMeta[],
  stepIndex: number,
  tourOpen: boolean,
): string | null {
  if (!tourOpen) return null;
  return stepMeta[stepIndex]?.id ?? null;
}
