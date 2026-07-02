"use client";

import type { AvatarItem } from "./types";

type Props = {
  rarity: AvatarItem["rarity"];
};

const LABEL: Record<string, string> = {
  common: "일반",
  rare: "레어",
  epic: "에픽",
  legendary: "전설",
};

export function RarityBadge({ rarity }: Props) {
  return <span className={`avatar-rarity avatar-rarity-${String(rarity)}`}>{LABEL[String(rarity)] ?? rarity}</span>;
}
