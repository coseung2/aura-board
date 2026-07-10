import { sortSections, type SortableSection } from "./sort-sections";

export type ReorderableSection = SortableSection & {
  id: string;
};

export type SectionOrderUpdate = {
  id: string;
  order: number;
  pinned: boolean;
};

const UNPINNED_ORDER_BASE = -1_000_000;
const ORDER_STEP = 1_000;

/**
 * Convert the current visual order into the persisted Section.order convention.
 *
 * Pinned sections use ascending non-negative values. Unpinned sections use a
 * negative, descending range so a normally-created section (order >= 0) still
 * appears before the manually arranged group, matching the existing board UX.
 */
export function buildSectionReorderPayload(
  visualSections: readonly ReorderableSection[],
): SectionOrderUpdate[] {
  const pinned = visualSections.filter((section) => section.pinned);
  const unpinned = visualSections.filter((section) => !section.pinned);

  return [
    ...pinned.map((section, index) => ({
      id: section.id,
      order: index,
      pinned: true,
    })),
    ...unpinned.map((section, index) => ({
      id: section.id,
      order:
        UNPINNED_ORDER_BASE + (unpinned.length - 1 - index) * ORDER_STEP,
      pinned: false,
    })),
  ];
}

/**
 * Preserve the existing drag/drop behavior while making the pinned boundary
 * explicit: dropping across the boundary moves the section to the nearest edge
 * of its own group; pin state itself only changes through the pin control.
 */
export function reorderSectionForDrop<T extends ReorderableSection>(
  visualSections: readonly T[],
  sectionId: string,
  targetSectionId: string,
): T[] {
  if (sectionId === targetSectionId) return [...visualSections];

  const fromIndex = visualSections.findIndex((section) => section.id === sectionId);
  const toIndex = visualSections.findIndex(
    (section) => section.id === targetSectionId,
  );
  if (fromIndex < 0 || toIndex < 0) return [...visualSections];

  const next = [...visualSections];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return [...visualSections];
  next.splice(toIndex, 0, moved);

  return [
    ...next.filter((section) => section.pinned),
    ...next.filter((section) => !section.pinned),
  ];
}

export function applySectionReorder<T extends ReorderableSection>(
  sections: readonly T[],
  updates: readonly SectionOrderUpdate[],
): T[] {
  const updateById = new Map(updates.map((update) => [update.id, update]));

  return sections
    .map((section) => {
      const update = updateById.get(section.id);
      return update
        ? {
            ...section,
            order: update.order,
            pinned: update.pinned,
          }
        : section;
    })
    .sort(sortSections);
}
