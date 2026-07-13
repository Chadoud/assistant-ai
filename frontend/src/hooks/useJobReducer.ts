import { useReducer, useCallback } from "react";
import type { Job, FileEntry } from "../api";

type JobAction =
  | { type: "SET_JOB"; job: Job | null }
  | { type: "PATCH_FILE_BY_PATH"; path: string; patch: Partial<FileEntry> }
  | { type: "PATCH_FILE_BY_ENTRY_ID"; entryId: string; patch: Partial<FileEntry> }
  | { type: "SET_ALL_APPROVED"; approved: boolean };

function jobReducer(state: Job | null, action: JobAction): Job | null {
  switch (action.type) {
    case "SET_JOB":
      return action.job;
    case "PATCH_FILE_BY_PATH":
      if (!state) return state;
      return {
        ...state,
        files: state.files.map((f) =>
          f.path === action.path ? { ...f, ...action.patch } : f
        ),
      };
    case "PATCH_FILE_BY_ENTRY_ID":
      if (!state) return state;
      return {
        ...state,
        files: state.files.map((f) =>
          f.entry_id === action.entryId ? { ...f, ...action.patch } : f
        ),
      };
    case "SET_ALL_APPROVED":
      if (!state) return state;
      return {
        ...state,
        files: state.files.map((f) => ({ ...f, approved: action.approved })),
      };
    default:
      ((_exhaustive: never) => _exhaustive)(action);
      return state;
  }
}

export function useJobReducer() {
  const [currentJob, dispatch] = useReducer(jobReducer, null);

  const setJob = useCallback(
    (job: Job | null) => dispatch({ type: "SET_JOB", job }),
    []
  );
  const patchFileByPath = useCallback(
    (path: string, patch: Partial<FileEntry>) =>
      dispatch({ type: "PATCH_FILE_BY_PATH", path, patch }),
    []
  );
  const patchFileByEntryId = useCallback(
    (entryId: string, patch: Partial<FileEntry>) =>
      dispatch({ type: "PATCH_FILE_BY_ENTRY_ID", entryId, patch }),
    []
  );
  const setAllApproved = useCallback(
    (approved: boolean) => dispatch({ type: "SET_ALL_APPROVED", approved }),
    []
  );

  return {
    currentJob,
    setJob,
    patchFileByPath,
    patchFileByEntryId,
    setAllApproved,
  };
}
