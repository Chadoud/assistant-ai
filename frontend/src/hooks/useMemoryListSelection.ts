import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface UseMemoryListSelectionOptions {
  /** Ordered ids currently visible in the list (filter + search applied). */
  visibleIds: number[];
  /** Row ids that cannot be selected (system-managed facts). */
  disabledIds?: ReadonlySet<number>;
}

interface UseMemoryListSelectionReturn {
  selectedIds: ReadonlySet<number>;
  selectedCount: number;
  focusedId: number | null;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
  isSelected: (id: number) => boolean;
  isSelectable: (id: number) => boolean;
  setFocusedId: (id: number | null) => void;
  toggle: (id: number, opts?: { shift?: boolean; meta?: boolean }) => void;
  selectAllVisible: () => void;
  clearSelection: () => void;
  selectIds: (ids: number[]) => void;
  moveFocus: (delta: 1 | -1) => void;
}

/**
 * Checkbox selection state for the Memory facts list — scoped to visible rows only.
 */
export function useMemoryListSelection({
  visibleIds,
  disabledIds = new Set(),
}: UseMemoryListSelectionOptions): UseMemoryListSelectionReturn {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [focusedId, setFocusedIdState] = useState<number | null>(null);
  const anchorIdRef = useRef<number | null>(null);

  const visibleSet = useMemo(() => new Set(visibleIds), [visibleIds]);
  const selectableVisibleIds = useMemo(
    () => visibleIds.filter((id) => !disabledIds.has(id)),
    [visibleIds, disabledIds],
  );

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => visibleSet.has(id)));
      return next.size === prev.size ? prev : next;
    });
    setFocusedIdState((prev) => (prev != null && visibleSet.has(prev) ? prev : null));
  }, [visibleSet]);

  const isSelectable = useCallback((id: number) => !disabledIds.has(id), [disabledIds]);

  const isSelected = useCallback((id: number) => selectedIds.has(id), [selectedIds]);

  const setFocusedId = useCallback((id: number | null) => {
    setFocusedIdState(id);
    if (id != null) anchorIdRef.current = id;
  }, []);

  const selectIds = useCallback(
    (ids: number[]) => {
      setSelectedIds(new Set(ids.filter((id) => visibleSet.has(id) && !disabledIds.has(id))));
    },
    [visibleSet, disabledIds],
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    anchorIdRef.current = null;
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelectedIds(new Set(selectableVisibleIds));
    if (selectableVisibleIds.length > 0) {
      anchorIdRef.current = selectableVisibleIds[0];
    }
  }, [selectableVisibleIds]);

  const toggle = useCallback(
    (id: number, opts?: { shift?: boolean; meta?: boolean }) => {
      if (!visibleSet.has(id) || disabledIds.has(id)) return;

      if (opts?.shift && anchorIdRef.current != null) {
        const anchorIndex = visibleIds.indexOf(anchorIdRef.current);
        const targetIndex = visibleIds.indexOf(id);
        if (anchorIndex >= 0 && targetIndex >= 0) {
          const start = Math.min(anchorIndex, targetIndex);
          const end = Math.max(anchorIndex, targetIndex);
          const rangeIds = visibleIds
            .slice(start, end + 1)
            .filter((rowId) => !disabledIds.has(rowId));
          setSelectedIds((prev) => {
            const next = opts.meta ? new Set(prev) : new Set<number>();
            for (const rowId of rangeIds) next.add(rowId);
            return next;
          });
          setFocusedIdState(id);
          return;
        }
      }

      anchorIdRef.current = id;
      setFocusedIdState(id);
      setSelectedIds((prev) => {
        const next = opts?.meta ? new Set(prev) : new Set<number>();
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [visibleIds, visibleSet, disabledIds],
  );

  const moveFocus = useCallback(
    (delta: 1 | -1) => {
      if (visibleIds.length === 0) return;
      const currentIndex =
        focusedId != null ? visibleIds.indexOf(focusedId) : delta > 0 ? -1 : visibleIds.length;
      const nextIndex = Math.min(
        visibleIds.length - 1,
        Math.max(0, currentIndex + delta),
      );
      const nextId = visibleIds[nextIndex];
      setFocusedIdState(nextId);
      anchorIdRef.current = nextId;
    },
    [focusedId, visibleIds],
  );

  const selectedCount = selectedIds.size;
  const allVisibleSelected =
    selectableVisibleIds.length > 0 &&
    selectableVisibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = selectedCount > 0 && !allVisibleSelected;

  return {
    selectedIds,
    selectedCount,
    focusedId,
    allVisibleSelected,
    someVisibleSelected,
    isSelected,
    isSelectable,
    setFocusedId,
    toggle,
    selectAllVisible,
    clearSelection,
    selectIds,
    moveFocus,
  };
}
