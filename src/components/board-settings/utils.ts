import type { ThumbnailMode } from "../BoardThumbnailPicker";

export function normalizeThumbnailMode(value: string | null | undefined): ThumbnailMode {
  if (value === "custom") return value;
  return "default";
}
