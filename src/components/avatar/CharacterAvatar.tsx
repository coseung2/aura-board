"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { AvatarItem } from "./types";

type AvatarStyle = CSSProperties & Record<string, string | number>;

type Props = {
  items?: AvatarItem[];
  equipped?: Record<string, string | null>;
  size?: number;
  className?: string;
  ariaLabel?: string;
  gender?: string | null;
  spriteFrame?: number;
};

const SPRITE_COLUMNS = 8;
const SPRITE_ROWS = 2;
const SPRITE_FRAME_WIDTH = 222;
const SPRITE_FRAME_HEIGHT = 444;
const DEFAULT_SPRITE_URL = "/avatar/base-body-sprite.png";
const LAYER_SLOTS = ["bottom", "shoes", "top", "hair", "accessory", "pet"];
const MOTION_SLOT = "motion";
const SKIN_SLOT = "skin";
const DEFAULT_FRAME_SEQUENCE = [0, 1, 2, 3, 4, 5, 6, 7];

const SLOT_Z_FALLBACK: Record<string, number> = {
  shoes: 45,
  bottom: 50,
  top: 65,
  accessory: 70,
  hair: 75,
  pet: 90,
};

const SLOT_LAYER_FALLBACK: Record<string, string> = {
  shoes: "shoes",
  bottom: "bottom_front",
  top: "top_front",
  accessory: "accessory_face",
  hair: "hair_front",
  pet: "pet_front",
};

type NormalizedRenderLayer = {
  imageUrl: string;
  z: number;
  slot: string;
  layer: string;
  itemId: string;
};
function spriteRowFor(gender: string | null | undefined): number {
  return gender === "female" ? 1 : 0;
}

function spriteUrlFor(item: AvatarItem): string | null {
  if (!isCompatibleSpriteItem(item)) return null;
  const raw = item.metadata?.spriteUrl ?? item.metadata?.spriteSheetUrl;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return item.imageUrl;
}

function baseSpriteUrlFor(item: AvatarItem | undefined): string | null {
  if (!item || isPlaceholderItem(item) || item.slot !== SKIN_SLOT) return null;
  const baseSpriteUrl = item.metadata?.baseSpriteUrl;
  if (typeof baseSpriteUrl === "string" && baseSpriteUrl.trim()) {
    return baseSpriteUrl.trim();
  }
  // Compatible full-sheet skin sprite: layer/slot/grid all match the base body.
  if (isCompatibleSpriteItem(item)) {
    return spriteUrlFor(item);
  }
  return null;
}

function isPlaceholderItem(item: AvatarItem | undefined): boolean {
  return item?.metadata?.placeholder === true;
}

function isCompatibleSpriteItem(item: AvatarItem | undefined): boolean {
  if (!item || !item.metadata || item.metadata.placeholder === true) return false;
  const sprite = item.metadata.sprite;
  if (!sprite || typeof sprite !== "object" || Array.isArray(sprite)) return false;
  const record = sprite as Record<string, unknown>;
  return (
    record.layer === item.slot &&
    record.frameWidth === SPRITE_FRAME_WIDTH &&
    record.frameHeight === SPRITE_FRAME_HEIGHT &&
    record.columns === SPRITE_COLUMNS &&
    record.rows === SPRITE_ROWS
  );
}

function extractRawRenderLayers(item: AvatarItem): unknown[] | null {
  if (!item.metadata) return null;
  const meta = item.metadata;
  if (meta.sprite && typeof meta.sprite === "object" && !Array.isArray(meta.sprite)) {
    const sprite = meta.sprite as Record<string, unknown>;
    if (Array.isArray(sprite.renderLayers)) return sprite.renderLayers;
  }
  if (Array.isArray(meta.renderLayers)) return meta.renderLayers;
  return null;
}

function normalizeRenderLayers(item: AvatarItem): NormalizedRenderLayer[] {
  const rawLayers = extractRawRenderLayers(item);
  const fallbackZ = SLOT_Z_FALLBACK[item.slot] ?? 100;
  const fallbackLayer = SLOT_LAYER_FALLBACK[item.slot] ?? item.slot;

  if (rawLayers) {
    const layers: NormalizedRenderLayer[] = [];
    rawLayers.forEach((raw, index) => {
      if (!raw || typeof raw !== "object") return;
      const record = raw as Record<string, unknown>;
      const imageUrl =
        (typeof record.spriteUrl === "string" ? record.spriteUrl.trim() : "") ||
        (typeof record.spriteSheetUrl === "string" ? record.spriteSheetUrl.trim() : "") ||
        spriteUrlFor(item) ||
        item.imageUrl;
      if (!imageUrl) return;
      const z =
        typeof record.z === "number" && Number.isFinite(record.z)
          ? record.z
          : fallbackZ + index;
      const layer =
        typeof record.key === "string" && record.key.trim()
          ? record.key.trim()
          : typeof record.layer === "string" && record.layer.trim()
            ? record.layer.trim()
            : fallbackLayer;
      layers.push({ imageUrl, z, slot: item.slot, layer, itemId: item.id });
    });
    if (layers.length > 0) return layers;
  }

  // Legacy single-sprite fallback: one layer keyed by slot with the canonical sprite URL.
  const imageUrl = spriteUrlFor(item);
  if (!imageUrl) return [];
  return [{ imageUrl, z: fallbackZ, slot: item.slot, layer: fallbackLayer, itemId: item.id }];
}

function motionClassFor(item: AvatarItem | undefined): string {
  const raw = item?.metadata?.motionClass;
  if (typeof raw !== "string") return "";
  const className = raw.trim();
  return className.startsWith("character-motion-") ? className : "";
}

function motionFramesFor(item: AvatarItem | undefined): number[] {
  const raw = item?.metadata?.frameSequence;
  if (!Array.isArray(raw)) return item ? DEFAULT_FRAME_SEQUENCE : [];
  const frames = raw
    .map((value) => (typeof value === "number" ? Math.trunc(value) : NaN))
    .filter((value) => value >= 0 && value < SPRITE_COLUMNS);
  return frames.length > 0 ? frames : [];
}

function motionFpsFor(item: AvatarItem | undefined): number {
  const raw = item?.metadata?.fps;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.min(Math.max(Math.trunc(raw), 1), 24);
}

function useMotionFrame(
  motionItem: AvatarItem | undefined,
  fallbackFrame: number,
): number {
  const [index, setIndex] = useState(0);
  const frames = useMemo(() => motionFramesFor(motionItem), [motionItem]);
  const fps = motionFpsFor(motionItem);

  useEffect(() => {
    setIndex(0);
  }, [motionItem?.id]);

  useEffect(() => {
    if (!motionItem || frames.length < 2 || fps <= 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const interval = window.setInterval(() => {
      setIndex((current) => (current + 1) % frames.length);
    }, 1000 / fps);
    return () => window.clearInterval(interval);
  }, [fps, frames, motionItem]);

  if (!motionItem || frames.length === 0) return fallbackFrame;
  return frames[index % frames.length] ?? fallbackFrame;
}

function spriteStyle({
  imageUrl,
  row,
  frame,
}: {
  imageUrl: string;
  row: number;
  frame: number;
}): AvatarStyle {
  return {
    backgroundImage: `url("${imageUrl}")`,
    backgroundPosition: `${(frame / (SPRITE_COLUMNS - 1)) * 100}% ${
      (row / (SPRITE_ROWS - 1)) * 100
    }%`,
  };
}

export function CharacterAvatar({
  items = [],
  equipped = {},
  size = 96,
  className = "",
  ariaLabel = "캐릭터",
  gender = null,
  spriteFrame = 0,
}: Props) {
  const bySlot = useMemo(() => {
    const map = new Map<string, AvatarItem>();
    for (const item of items) {
      if (item.slot && equipped[item.slot] === item.id) {
        map.set(item.slot, item);
      }
    }
    return map;
  }, [items, equipped]);

  const row = spriteRowFor(gender);
  const frame = Math.min(Math.max(spriteFrame, 0), SPRITE_COLUMNS - 1);
  const baseScale = size / 125;
  const spriteWidth = Math.round(84 * baseScale);
  const spriteHeight = Math.round(168 * baseScale);
  const motionItem = bySlot.get(MOTION_SLOT);
  const activeFrame = useMotionFrame(motionItem, frame);
  const skinItem = bySlot.get(SKIN_SLOT);
  const baseImageUrl = baseSpriteUrlFor(skinItem) ?? DEFAULT_SPRITE_URL;
  const renderLayers = useMemo(() => {
    const layers: NormalizedRenderLayer[] = [];
    for (const slot of LAYER_SLOTS) {
      const item = bySlot.get(slot);
      if (!item || isPlaceholderItem(item)) continue;
      layers.push(...normalizeRenderLayers(item));
    }
    layers.sort((a, b) => a.z - b.z || a.layer.localeCompare(b.layer));
    return layers;
  }, [bySlot]);
  const motionClass = motionClassFor(motionItem);

  return (
    <span
      className={`character-avatar character-avatar-sprite-composer ${motionClass} ${className}`}
      role="img"
      aria-label={ariaLabel}
      style={{
        width: size,
        height: size,
      }}
    >
      <span
        className="character-avatar-motion-rig"
        style={{
          width: spriteWidth,
          height: spriteHeight,
        }}
        aria-hidden="true"
      >
        <span
          className="character-avatar-sprite-layer character-avatar-base"
          data-avatar-layer="base"
          data-slot="base"
          data-render-layer="base"
          data-frame={activeFrame}
          data-row={row}
          style={{
            ...spriteStyle({ imageUrl: baseImageUrl, row, frame: activeFrame }),
            zIndex: 0,
          }}
        />
        {renderLayers.map((layer) => (
          <span
            key={`${layer.slot}-${layer.itemId}-${layer.layer}`}
            className={`character-avatar-sprite-layer character-avatar-part character-avatar-part-${layer.slot}`}
            data-avatar-layer={layer.slot}
            data-slot={layer.slot}
            data-render-layer={layer.layer}
            data-frame={activeFrame}
            data-row={row}
            style={{
              ...spriteStyle({ imageUrl: layer.imageUrl, row, frame: activeFrame }),
              zIndex: layer.z,
            }}
          />
        ))}
      </span>
    </span>
  );
}
