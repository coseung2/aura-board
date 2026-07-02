"use client";

export type Rarity = "common" | "rare" | "epic" | "legendary";

export type AvatarItem = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
  slot: string;
  rarity: Rarity | string;
  price: number;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  metadata: Record<string, unknown> | null;
  archived?: boolean;
};

export type AvatarStudent = {
  id: string;
  name: string;
  number: number | null;
  classroomId: string;
};

export type AvatarCurrency = {
  unitLabel: string;
};

export type AvatarMeResponse = {
  student: AvatarStudent;
  currency: AvatarCurrency;
  balance: number;
  items: AvatarItem[];
  inventoryItemIds: string[];
  equipped: Record<string, string | null>;
  galleryVisible: boolean;
};

export type AvatarShopResponse = {
  currency: AvatarCurrency;
  balance: number;
  items: AvatarItem[];
  inventoryItemIds: string[];
};

export type AvatarGalleryStudent = {
  id: string;
  name: string;
  number: number | null;
  equipped: Record<string, string | null>;
  galleryVisible: boolean;
};

export type AvatarGalleryResponse = {
  classroomId: string;
  students: AvatarGalleryStudent[];
};

export const AVATAR_CATEGORIES = [
  { key: "all", label: "전체" },
  { key: "skin", label: "스킨" },
  { key: "background", label: "배경" },
  { key: "hair", label: "헤어" },
  { key: "top", label: "상의" },
  { key: "bottom", label: "하의" },
  { key: "shoes", label: "신발" },
  { key: "accessory", label: "액세서리" },
  { key: "pet", label: "펫" },
] as const;

export const AVATAR_SLOTS = [
  "skin",
  "background",
  "hair",
  "top",
  "bottom",
  "shoes",
  "accessory",
  "pet",
] as const;
