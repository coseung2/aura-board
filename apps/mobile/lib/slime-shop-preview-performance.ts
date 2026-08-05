import type { SlimeShopItem } from "./slimes";

const BALL_ITEM_PREFIX = "slime-ball-";

/**
 * Pick the lightweight native-image preview used by ball cards in the shop.
 *
 * Equipped balls still use the split local action/overlay sheets so their prop
 * can layer correctly with wearables. A catalog grid does not need that split:
 * its official flattened high-density GIF is visually equivalent, is decoded
 * by Expo Image, and avoids one React frame update plus two moving sheet views
 * per ball card.
 */
export function slimeShopBallPreviewImagePath(
  item: Pick<
    SlimeShopItem,
    "key" | "spritePath" | "mobileSpritePath" | "previewColor"
  >,
): string | undefined {
  if (!item.key.startsWith(BALL_ITEM_PREFIX)) return undefined;

  const mobilePath = item.mobileSpritePath?.trim();
  if (mobilePath) return mobilePath;

  const fallbackPath = item.spritePath;
  const slug = item.key.slice(BALL_ITEM_PREFIX.length);
  const previewColor = item.previewColor;
  if (!slug || !previewColor) return fallbackPath;

  const marker = `/ball/${slug}/`;
  const markerIndex = item.spritePath.indexOf(marker);
  if (markerIndex < 0) return fallbackPath;

  const queryIndex = item.spritePath.indexOf("?", markerIndex + marker.length);
  const query = queryIndex >= 0 ? item.spritePath.slice(queryIndex) : "";
  const root = item.spritePath.slice(0, markerIndex + marker.length);
  return `${root}${previewColor}/slime-${previewColor}-${slug}-hit-4x.gif${query}`;
}
