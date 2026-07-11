import { sortSections } from "@/lib/sort-sections";

export type SectionPosition = {
  id: string;
  order: number;
  pinned: boolean;
};

const UNPINNED_ORDER_BASE = -1_000_000;
const ORDER_STEP = 1_000;

/**
 * Normalizes section order values from their current visual order.
 *
 * Pinned sections use compact ascending values. Unpinned sections use sparse
 * negative values in descending order so a newly-created section (order >= 0)
 * still appears first, matching the existing topic-board behavior.
 */
export function normalizeSectionOrders<T extends SectionPosition>(
  sections: readonly T[],
): T[] {
  const visualSections = [...sections];
  const pinnedCount = visualSections.filter((section) => section.pinned).length;
  const unpinnedCount = visualSections.length - pinnedCount;
  let pinnedIndex = 0;
  let unpinnedIndex = 0;

  return visualSections
    .map((section): T => {
      if (section.pinned) {
        return { ...section, order: pinnedIndex++ };
      }

      const order =
        UNPINNED_ORDER_BASE +
        (pinnedCount + (unpinnedCount - 1 - unpinnedIndex++)) * ORDER_STEP;
      return { ...section, order };
    })
    .sort(sortSections);
}

/**
 * Moves a section to the same drop target used by the board UI. Pin groups are
 * retained, so dropping across the boundary moves the section to the nearest
 * valid edge of its current group.
 */
export function moveSectionToTarget<T extends SectionPosition>(
  sections: readonly T[],
  sectionId: string,
  targetSectionId: string,
): T[] | null {
  if (sectionId === targetSectionId) return null;

  const visualSections = [...sections].sort(sortSections);
  const fromIndex = visualSections.findIndex(
    (section) => section.id === sectionId,
  );
  const toIndex = visualSections.findIndex(
    (section) => section.id === targetSectionId,
  );
  if (fromIndex === -1 || toIndex === -1) return null;

  const next = [...visualSections];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return null;
  next.splice(toIndex, 0, moved);

  return normalizeSectionOrders(next);
}

/**
 * Pins to the end of the pinned group, or unpins to the start of the unpinned
 * group. This matches the existing board interaction while keeping one order
 * normalization rule for both the board and settings panel.
 */
export function setSectionPinned<T extends SectionPosition>(
  sections: readonly T[],
  sectionId: string,
  pinned: boolean,
): T[] | null {
  const visualSections = [...sections].sort(sortSections);
  const currentIndex = visualSections.findIndex(
    (section) => section.id === sectionId,
  );
  const current = visualSections[currentIndex];
  if (!current || current.pinned === pinned) return null;

  const next = [...visualSections];
  next.splice(currentIndex, 1);
  const updated: T = { ...current, pinned };
  const firstUnpinnedIndex = next.findIndex((section) => !section.pinned);
  const groupBoundary =
    firstUnpinnedIndex === -1 ? next.length : firstUnpinnedIndex;
  next.splice(groupBoundary, 0, updated);

  return normalizeSectionOrders(next);
}

/** Builds the bulk reorder payload in the exact visual order the API validates. */
export function toSectionReorderPayload(
  sections: readonly SectionPosition[],
): SectionPosition[] {
  return normalizeSectionOrders([...sections].sort(sortSections)).map(
    (section) => ({
      id: section.id,
      order: section.order,
      pinned: section.pinned,
    }),
  );
}

/**
 * Applies server-confirmed positions while preserving metadata that may have
 * changed locally or through realtime updates during the request.
 */
export function mergeSectionPositions<T extends SectionPosition>(
  sections: readonly T[],
  positions: readonly SectionPosition[],
): T[] {
  const positionById = new Map(
    positions.map((position) => [position.id, position] as const),
  );

  return sections
    .map((section): T => {
      const position = positionById.get(section.id);
      return position
        ? {
            ...section,
            order: position.order,
            pinned: position.pinned,
          }
        : section;
    })
    .sort(sortSections);
}
