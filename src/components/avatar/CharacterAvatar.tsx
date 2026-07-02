"use client";

import { useId, useMemo } from "react";
import type { AvatarItem } from "./types";

type Props = {
  items?: AvatarItem[];
  equipped?: Record<string, string | null>;
  size?: number;
  className?: string;
  ariaLabel?: string;
};

const DEFAULT_COLORS: Record<string, string> = {
  skin: "#f8d9c6",
  skinShadow: "#eac0a8",
  background: "#cfe6ff",
  hair: "#4a3426",
  eyes: "#18313f",
  top: "#1683c7",
  topShadow: "#0d679f",
  bottom: "#3b82f6",
  bottomShadow: "#2563eb",
  shoes: "#1f2937",
  shoesShadow: "#111827",
  accessory: "#f59e0b",
  pet: "#ffb37b",
};

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getColor(item: AvatarItem | undefined, key: string): string {
  if (!item?.metadata) return DEFAULT_COLORS[key] ?? DEFAULT_COLORS.accessory;
  const meta = item.metadata;
  const raw = meta[key] ?? meta.color ?? meta.primaryColor;
  return typeof raw === "string" ? raw : (DEFAULT_COLORS[key] ?? DEFAULT_COLORS.accessory);
}

function getGradientColors(item: AvatarItem | undefined): [string, string] {
  const fallback = DEFAULT_COLORS.background;
  const raw = item?.metadata?.colors;
  if (Array.isArray(raw)) {
    const first = typeof raw[0] === "string" ? raw[0] : fallback;
    const second = typeof raw[1] === "string" ? raw[1] : first;
    return [first, second];
  }
  const color = getColor(item, "background");
  return [color, hexToRgba(color, 0.72)];
}

export function CharacterAvatar({
  items = [],
  equipped = {},
  size = 96,
  className = "",
  ariaLabel = "캐릭터",
}: Props) {
  const backgroundId = `avatar-bg-${useId().replace(/:/g, "")}`;
  const bySlot = useMemo(() => {
    const map = new Map<string, AvatarItem>();
    for (const item of items) {
      if (item.slot && equipped[item.slot] === item.id) {
        map.set(item.slot, item);
      }
    }
    return map;
  }, [items, equipped]);

  const [backgroundTop, backgroundBottom] = getGradientColors(bySlot.get("background"));
  const skinColor = getColor(bySlot.get("skin"), "skin");
  const skinShadow = hexToRgba(skinColor, 0.78);
  const hairColor = getColor(bySlot.get("hair"), "hair");
  const topColor = getColor(bySlot.get("top"), "top");
  const topShadow = hexToRgba(getColor(bySlot.get("top"), "top"), 0.78);
  const bottomColor = getColor(bySlot.get("bottom"), "bottom");
  const bottomShadow = hexToRgba(getColor(bySlot.get("bottom"), "bottom"), 0.78);
  const shoesColor = getColor(bySlot.get("shoes"), "shoes");
  const accessory = bySlot.get("accessory");
  const accessoryColor = getColor(accessory, "accessory");
  const accessoryShape = typeof accessory?.metadata?.shape === "string" ? accessory.metadata.shape : "cap";
  const petColor = getColor(bySlot.get("pet"), "pet");

  const pixel = Math.max(2, Math.round(size / 32));

  return (
    <svg
      className={`character-avatar ${className}`}
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role="img"
      aria-label={ariaLabel}
      style={{ imageRendering: "pixelated" }}
    >
      <defs>
        <linearGradient id={backgroundId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={backgroundTop} />
          <stop offset="100%" stopColor={backgroundBottom} />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="90" height="90" rx="12" fill={`url(#${backgroundId})`} opacity="0.55" />
      <rect x="10" y="78" width="76" height="10" rx="3" fill="rgba(47, 111, 78, 0.22)" />

      {/* Shadow */}
      <ellipse cx="48" cy="88" rx="22" ry="5" fill="rgba(24, 74, 92, 0.12)" />

      {/* Legs / bottom */}
      <g>
        <rect x="34" y="56" width="12" height="24" rx="2" fill={bottomColor} />
        <rect x="50" y="56" width="12" height="24" rx="2" fill={bottomColor} />
        <rect x="34" y="76" width="12" height="4" rx="1" fill={bottomShadow} />
        <rect x="50" y="76" width="12" height="4" rx="1" fill={bottomShadow} />
      </g>

      {/* Shoes */}
      <g>
        <rect x="32" y="78" width="16" height="7" rx="2" fill={shoesColor} />
        <rect x="48" y="78" width="16" height="7" rx="2" fill={shoesColor} />
      </g>

      {/* Body / top */}
      <g>
        <rect x="30" y="36" width="36" height="28" rx="6" fill={topColor} />
        <rect x="30" y="58" width="36" height="6" rx="2" fill={topShadow} />
      </g>

      {/* Arms */}
      <g>
        <rect x="20" y="40" width="10" height="22" rx="4" fill={skinColor} />
        <rect x="66" y="40" width="10" height="22" rx="4" fill={skinColor} />
      </g>

      {/* Head */}
      <g>
        <rect x="34" y="16" width="28" height="26" rx="10" fill={skinColor} />
        <rect x="34" y="34" width="28" height="8" rx="3" fill={skinShadow} />
      </g>

      {/* Face */}
      <g>
        <rect x="40" y="26" width="4" height="5" rx="1.5" fill={DEFAULT_COLORS.eyes} />
        <rect x="52" y="26" width="4" height="5" rx="1.5" fill={DEFAULT_COLORS.eyes} />
        <rect x="45" y="34" width="6" height="3" rx="1.5" fill={skinShadow} />
      </g>

      {/* Hair */}
      <g>
        <rect x="32" y="12" width="32" height="10" rx="4" fill={hairColor} />
        <rect x="30" y="16" width="8" height="14" rx="3" fill={hairColor} />
        <rect x="58" y="16" width="8" height="14" rx="3" fill={hairColor} />
        <rect x="34" y="20" width="28" height="6" rx="2" fill={hairColor} />
      </g>

      {/* Accessory */}
      {accessory && accessoryShape === "round" && (
        <g>
          <rect x="38" y="27" width="8" height="5" rx="2" fill="none" stroke={accessoryColor} strokeWidth="2" />
          <rect x="50" y="27" width="8" height="5" rx="2" fill="none" stroke={accessoryColor} strokeWidth="2" />
          <rect x="46" y="29" width="4" height="1.5" fill={accessoryColor} />
        </g>
      )}
      {accessory && accessoryShape !== "round" && (
        <g>
          <rect x="35" y="11" width="26" height="7" rx="3" fill={accessoryColor} />
          <rect x="56" y="15" width="12" height="4" rx="2" fill={accessoryColor} />
        </g>
      )}

      {/* Pet */}
      {bySlot.has("pet") && (
        <g>
          <rect x="68" y="67" width="12" height="11" rx="4" fill={petColor} />
          <rect x="70" y="63" width="8" height="7" rx="3" fill={petColor} />
          <rect x="70" y="62" width="2" height="4" fill={petColor} />
          <rect x="76" y="62" width="2" height="4" fill={petColor} />
          <rect x="72" y="66" width="2" height="2" fill={DEFAULT_COLORS.eyes} />
          <rect x="76" y="66" width="2" height="2" fill={DEFAULT_COLORS.eyes} />
          <rect x="80" y="70" width="5" height="3" rx="1.5" fill={petColor} />
        </g>
      )}
    </svg>
  );
}
