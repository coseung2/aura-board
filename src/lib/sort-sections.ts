/**
 * Shared sort comparator for board sections.
 *
 * Pinned sections float to the top (ordered by `.order` ascending);
 * unpinned sections sort below (ordered by `.order` descending, so new
 * sections added at the end appear first).
 */
export type SortableSection = {
  pinned: boolean;
  order: number;
};

export function sortSections(a: SortableSection, b: SortableSection): number {
  if (a.pinned && !b.pinned) return -1;
  if (!a.pinned && b.pinned) return 1;
  if (a.pinned && b.pinned) return a.order - b.order;
  return b.order - a.order;
}
