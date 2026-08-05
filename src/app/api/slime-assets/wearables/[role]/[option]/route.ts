import { NextResponse } from "next/server";
import {
  SLIME_EQUIPPABLE_ROLES,
  slimeWearableEntry,
  type SlimeEquippableRole,
} from "@/lib/pets/slime-wearables";
import { SLIME_WEARABLE_CATALOG } from "@/lib/pets/wearable-catalog";
import type { SlimeRemoteWearableAsset } from "@/lib/pets/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PUBLIC_ASSET_HEADERS = {
  "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
} as const;

function isEquippableRole(value: string): value is SlimeEquippableRole {
  return (SLIME_EQUIPPABLE_ROLES as readonly string[]).includes(value);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ role: string; option: string }> },
) {
  const { role, option } = await params;
  if (!isEquippableRole(role) || !/^[a-z0-9-]+$/.test(option)) {
    return NextResponse.json({ error: "invalid_wearable" }, { status: 400 });
  }

  const approved = SLIME_WEARABLE_CATALOG.some(
    (item) => item.role === role && item.option === option,
  );
  const entry = approved ? slimeWearableEntry(role, option) : null;
  if (!entry) {
    return NextResponse.json({ error: "wearable_not_found" }, { status: 404 });
  }

  const asset: SlimeRemoteWearableAsset = {
    version: 1,
    key: entry.key,
    role,
    option,
    zIndex: entry.zIndex,
    colorSensitive: entry.colorSensitive,
    imageScale: 4,
    sheets: entry.sheets,
    timelines: entry.timelines,
  };

  return NextResponse.json(
    { asset },
    { headers: PUBLIC_ASSET_HEADERS },
  );
}
