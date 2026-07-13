/** Bucket label for aggregated tail rows in donuts. */
export const OTHER_REASON_LABEL = "Other";

interface CountRow {
  count: number;
}

export function topNWithOtherRows<T extends CountRow & Record<string, unknown>>(
  sorted: T[],
  n: number,
  mergeTail: (tail: T[]) => T
): { display: T[]; full: T[]; tailMerged: boolean } {
  const full = [...sorted];
  if (sorted.length <= n) {
    return { display: full, full, tailMerged: false };
  }
  const head = sorted.slice(0, n);
  const tail = sorted.slice(n);
  const sum = tail.reduce((s, r) => s + r.count, 0);
  if (sum <= 0) {
    return { display: head, full, tailMerged: false };
  }
  return { display: [...head, mergeTail(tail)], full, tailMerged: true };
}
