import { useCallback, useEffect, useRef, useState } from "react";

export type SortWizardStep = 1 | 2 | 3;

const TOUR_HIGHLIGHT_WIZARD_STEP: Partial<Record<string, SortWizardStep>> = {
  "workspace-local": 1,
  "external-sources": 1,
  "run-sort": 3,
};

type UseSortWizardParams = {
  currentJob: unknown;
  hasSourceSelected: boolean;
  tourHighlightId?: string | null;
};

/** Pre-sort wizard step state — Sources → Structure → Review. */
export function useSortWizard({
  currentJob,
  hasSourceSelected,
  tourHighlightId,
}: UseSortWizardParams) {
  const [wizardStep, setWizardStep] = useState<SortWizardStep>(1);
  const hadJobRef = useRef(false);

  useEffect(() => {
    if (currentJob) {
      hadJobRef.current = true;
      return;
    }
    if (hadJobRef.current) {
      hadJobRef.current = false;
      setWizardStep(1);
    }
  }, [currentJob]);

  useEffect(() => {
    if (!hasSourceSelected && wizardStep > 1) {
      setWizardStep(1);
    }
  }, [hasSourceSelected, wizardStep]);

  useEffect(() => {
    if (!tourHighlightId) return;
    const step = TOUR_HIGHLIGHT_WIZARD_STEP[tourHighlightId];
    if (step) setWizardStep(step);
  }, [tourHighlightId]);

  const goNext = useCallback(() => {
    setWizardStep((step) => {
      if (step === 1 && !hasSourceSelected) return 1;
      if (step >= 3) return 3;
      return (step + 1) as SortWizardStep;
    });
  }, [hasSourceSelected]);

  const goBack = useCallback(() => {
    setWizardStep((step) => (step > 1 ? ((step - 1) as SortWizardStep) : 1));
  }, []);

  const goToStep = useCallback(
    (target: SortWizardStep) => {
      if (target > 1 && !hasSourceSelected) return;
      setWizardStep(target);
    },
    [hasSourceSelected],
  );

  const canGoToStep = useCallback(
    (target: SortWizardStep) => {
      if (target === 1) return true;
      return hasSourceSelected;
    },
    [hasSourceSelected],
  );

  const canGoNext = wizardStep === 1 ? hasSourceSelected : wizardStep < 3;

  return {
    wizardStep,
    setWizardStep,
    goNext,
    goBack,
    goToStep,
    canGoToStep,
    canGoNext,
  };
}
