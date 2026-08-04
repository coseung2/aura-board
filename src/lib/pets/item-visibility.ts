import type { SlimeColor } from "./types";

export type HiddenSlimeItemsByColor = Partial<Record<SlimeColor, readonly string[]>>;

/** Stable list ordering that brings the current selection to the first slots. */
export function prioritizeEquippedSlimeItems<T extends Readonly<{ key: string }>>(
  items: readonly T[],
  equippedItemKeys: readonly string[],
): T[] {
  if (!equippedItemKeys.length) return [...items];
  const equipped = new Set(equippedItemKeys);
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (left, right) =>
        Number(equipped.has(right.item.key)) - Number(equipped.has(left.item.key))
        || left.index - right.index,
    )
    .map(({ item }) => item);
}

/**
 * Visual-only projection of equipped items.
 *
 * Buff and set calculations must continue to consume the unfiltered equipped
 * keys. Only sprite composition is allowed to use this filtered list.
 */
export function visibleEquippedSlimeItemKeys(
  equippedItemKeys: readonly string[],
  hiddenItemKeys: readonly string[] | null | undefined,
): string[] {
  if (!hiddenItemKeys?.length) return [...equippedItemKeys];
  const hidden = new Set(hiddenItemKeys);
  return equippedItemKeys.filter((itemKey) => !hidden.has(itemKey));
}

export function setSlimeItemHidden(
  current: HiddenSlimeItemsByColor,
  color: SlimeColor,
  itemKey: string,
  isHidden: boolean,
): HiddenSlimeItemsByColor {
  const nextForColor = new Set(current[color] ?? []);
  if (isHidden) nextForColor.add(itemKey);
  else nextForColor.delete(itemKey);
  return {
    ...current,
    [color]: [...nextForColor],
  };
}
