import { useCallback, useEffect, useState } from "react";
import { POST_RUN_CARD_DISMISSED_KEY, POST_RUN_CARD_SESSION_HIDDEN_JOB_ID_KEY } from "../../constants";
import type { Job } from "../../api";

/**
 * Dismissal + session hide state for the post-run “next steps” card after a job finishes.
 */
export function usePostRunCardState(currentJob: Job | null, jobTotalCount: number) {
  const [postRunPermanentlyDismissed, setPostRunPermanentlyDismissed] = useState(() => {
    try {
      return localStorage.getItem(POST_RUN_CARD_DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [postRunSessionHiddenJobId, setPostRunSessionHiddenJobId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(POST_RUN_CARD_SESSION_HIDDEN_JOB_ID_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      setPostRunSessionHiddenJobId(sessionStorage.getItem(POST_RUN_CARD_SESSION_HIDDEN_JOB_ID_KEY));
    } catch {
      setPostRunSessionHiddenJobId(null);
    }
  }, [currentJob?.id]);

  const dismissPostRunPermanent = useCallback(() => {
    try {
      localStorage.setItem(POST_RUN_CARD_DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
    setPostRunPermanentlyDismissed(true);
  }, []);

  const hidePostRunForSessionAfterCta = useCallback(() => {
    const id = currentJob?.id;
    if (!id) return;
    try {
      sessionStorage.setItem(POST_RUN_CARD_SESSION_HIDDEN_JOB_ID_KEY, id);
    } catch {
      /* ignore */
    }
    setPostRunSessionHiddenJobId(id);
  }, [currentJob?.id]);

  const showPostRunCard =
    currentJob?.status === "done" &&
    jobTotalCount > 0 &&
    !!currentJob?.id &&
    !postRunPermanentlyDismissed &&
    postRunSessionHiddenJobId !== currentJob.id;

  return { showPostRunCard, dismissPostRunPermanent, hidePostRunForSessionAfterCta };
}
