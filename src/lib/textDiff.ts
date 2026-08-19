/**
 * Minimal string diff: the smallest single replace turning `prev` into `next`.
 *
 * Common prefix and suffix are stripped, and whatever is left is one
 * delete+insert. Not a full LCS — for interactive edits (typing, pasting,
 * an adopted remote change) a single contiguous region is the actual shape of
 * the change, and this costs O(n) with no allocation beyond the slice.
 *
 * Used to turn "the content is now X" into operations: Y.Text updates that
 * merge, and Monaco edits that keep the caret where it was.
 */

export interface StringDiff {
  /** Offset the change starts at. */
  start: number;
  /** Characters removed from `prev` at `start`. */
  deleteLength: number;
  /** Text inserted at `start`. */
  insert: string;
}

/** Returns null when the strings are equal. */
export const diffStrings = (prev: string, next: string): StringDiff | null => {
  if (prev === next) return null;

  let start = 0;
  const shorter = Math.min(prev.length, next.length);
  while (start < shorter && prev.charCodeAt(start) === next.charCodeAt(start)) start++;

  let endPrev = prev.length;
  let endNext = next.length;
  while (
    endPrev > start &&
    endNext > start &&
    prev.charCodeAt(endPrev - 1) === next.charCodeAt(endNext - 1)
  ) {
    endPrev--;
    endNext--;
  }

  return {
    start,
    deleteLength: endPrev - start,
    insert: next.slice(start, endNext),
  };
};
