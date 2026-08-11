"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import { SLIME_SHOP_CATALOG } from "@/lib/pets/catalog";
import { calculateSlimeGrowthSnapshot } from "@/lib/pets/growth";
import { calculateCatalogSlimeEffects } from "@/lib/pets/math";
import type {
  SlimeColor,
  SlimeDefinition,
  SlimeFloor,
  SlimeShopItem,
} from "@/lib/pets/types";

import {
  SLIME_COOKIE_ITEM_KEY,
  shopFilterForItem,
  type ClaimedTitle,
  type Notice,
  type ShopFilter,
  type SlimeGrowthSnapshotPayload,
  type WardrobeFilter,
} from "./SlimePetModel";
import type { SlimeCartLine } from "./SlimeShopCartDrawer";
import { useSlimeWardrobeDialog } from "./useSlimeWardrobeDialog";

type SlimeHome = {
  balance: number;
  currency: { unitLabel: string };
  ownedColors: SlimeColor[];
  equippedColors?: SlimeColor[];
  representativeColor?: SlimeColor | null;
  catalog: SlimeDefinition[];
  ownedItemKeys?: string[];
  ownedItemQuantities?: Record<string, number>;
  equippedItemKeys?: string[];
  equippedItemsByColor?: Partial<Record<SlimeColor, string[]>>;
  hiddenItemKeys?: string[];
  hiddenItemsByColor?: Partial<Record<SlimeColor, string[]>>;
  equippedFloorByColor?: Partial<Record<SlimeColor, SlimeFloor>>;
  shopCatalog?: SlimeShopItem[];
  growthSpeedBps?: number;
  growthByColor?: Partial<Record<SlimeColor, SlimeGrowthSnapshotPayload>>;
  growth?: Partial<Record<SlimeColor, SlimeGrowthSnapshotPayload>>;
  claimedTitles?: ClaimedTitle[];
  equippedTitleByColor?: Partial<Record<SlimeColor, string>>;
};

export const PURCHASE_ERROR: Record<string, string> = {
  insufficient_funds: "잔액이 부족해요.",
  already_owned: "이미 보유한 상품이에요.",
  unknown_item: "상품을 찾을 수 없어요.",
  idempotency_key_reused:
    "같은 구매 요청이 다른 상품에 사용됐어요. 다시 시도해 주세요.",
  account_not_found: "학생 지갑을 찾을 수 없어요.",
  unauthenticated: "로그인이 만료됐어요. 다시 로그인해 주세요.",
  not_owned: "이미 환불했거나 보유하지 않은 상품이에요.",
  not_refundable: "환불할 수 없는 상품이에요.",
};

export function newIdempotencyKey(prefix: string, key: string): string {
  const uuid =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}-${key}-${uuid}`;
}

export function floorForItemKeys(
  itemKeys: readonly string[],
  shopCatalog: readonly SlimeShopItem[],
): SlimeFloor {
  let floor: SlimeFloor = "none";
  for (const itemKey of itemKeys) {
    const candidate = shopCatalog.find((item) => item.key === itemKey)?.floor;
    if (candidate) floor = candidate;
  }
  return floor;
}

function floorsFromItemsByColor(
  itemsByColor: Partial<Record<SlimeColor, string[]>>,
  shopCatalog: readonly SlimeShopItem[],
): Partial<Record<SlimeColor, SlimeFloor>> {
  const floors: Partial<Record<SlimeColor, SlimeFloor>> = {};
  for (const [color, itemKeys] of Object.entries(itemsByColor) as [
    SlimeColor,
    string[] | undefined,
  ][]) {
    floors[color] = floorForItemKeys(itemKeys ?? [], shopCatalog);
  }
  return floors;
}

function useAutoDismissNotice(
  notice: Notice | null,
  setNotice: Dispatch<SetStateAction<Notice | null>>,
) {
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2500);
    return () => window.clearTimeout(timer);
  }, [notice, setNotice]);
}

/** Owns the pet page's server snapshot, mutations, modal state, and cart state. */
export function useSlimePetHomeState() {
  const [catalog, setCatalog] = useState<SlimeDefinition[]>([]);
  const [ownedKeys, setOwnedKeys] = useState<SlimeColor[]>([]);
  const [, setEquippedKeys] = useState<SlimeColor[]>([]);
  const [representativeColor, setRepresentativeColor] =
    useState<SlimeColor | null>(null);
  const [shopCatalog, setShopCatalog] = useState<SlimeShopItem[]>([]);
  const [ownedItemKeys, setOwnedItemKeys] = useState<string[]>([]);
  const [ownedItemQuantities, setOwnedItemQuantities] = useState<
    Record<string, number>
  >({});
  const [equippedItemKeys, setEquippedItemKeys] = useState<string[]>([]);
  const [equippedItemsByColor, setEquippedItemsByColor] = useState<
    Partial<Record<SlimeColor, string[]>>
  >({});
  const [hiddenItemsByColor, setHiddenItemsByColor] = useState<
    Partial<Record<SlimeColor, string[]>>
  >({});
  const [equippedFloorByColor, setEquippedFloorByColor] = useState<
    Partial<Record<SlimeColor, SlimeFloor>>
  >({});
  const [growthByColor, setGrowthByColor] = useState<
    Partial<Record<SlimeColor, SlimeGrowthSnapshotPayload>>
  >({});
  const [claimedTitles, setClaimedTitles] = useState<ClaimedTitle[]>([]);
  const [equippedTitleByColor, setEquippedTitleByColor] = useState<
    Partial<Record<SlimeColor, string>>
  >({});
  const [balance, setBalance] = useState(0);
  const [unitLabel, setUnitLabel] = useState("원");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [busyColor, setBusyColor] = useState<SlimeColor | null>(null);
  const [busyRepresentative, setBusyRepresentative] =
    useState<SlimeColor | null>(null);
  const [busyItemKey, setBusyItemKey] = useState<string | null>(null);
  const [pendingPurchase, setPendingPurchase] =
    useState<SlimeShopItem | null>(null);
  const [cartLines, setCartLines] = useState<SlimeCartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartBusy, setCartBusy] = useState(false);
  const [busyCookieColor, setBusyCookieColor] =
    useState<SlimeColor | null>(null);
  const [busyTitleColor, setBusyTitleColor] =
    useState<SlimeColor | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [shopNotice, setShopNotice] = useState<Notice | null>(null);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [wardrobeColor, setWardrobeColor] =
    useState<SlimeColor | null>(null);
  const [shopFilter, setShopFilter] = useState<ShopFilter>("all");
  const [shopSearchQuery, setShopSearchQuery] = useState("");
  const [wardrobeFilter, setWardrobeFilter] =
    useState<WardrobeFilter>("floor");
  const [wardrobeSearchQuery, setWardrobeSearchQuery] = useState("");

  const slimeRetryKeys = useRef(new Map<SlimeColor, string>());
  const itemRetryKeys = useRef(new Map<string, string>());
  const itemEquipRetryKeys = useRef(new Map<string, string>());
  const cookieRetryKeys = useRef(new Map<SlimeColor, string>());

  useAutoDismissNotice(notice, setNotice);
  useAutoDismissNotice(shopNotice, setShopNotice);

  const closeWardrobe = useCallback(() => {
    setWardrobeOpen(false);
    setWardrobeColor(null);
  }, []);
  const { triggerRef: wardrobeTriggerRef, closeButtonRef: wardrobeCloseRef } =
    useSlimeWardrobeDialog({
      open: wardrobeOpen,
      onRequestClose: closeWardrobe,
    });

  const effects = useMemo(
    () =>
      calculateCatalogSlimeEffects(
        ownedKeys,
        equippedItemKeys,
        undefined,
        Object.fromEntries(
          Object.entries(growthByColor).map(([color, growth]) => [
            color,
            growth?.stage ?? 1,
          ]),
        ),
      ),
    [equippedItemKeys, growthByColor, ownedKeys],
  );

  const visibleShopItems = useMemo(() => {
    const normalizedQuery = shopSearchQuery.trim().toLocaleLowerCase();
    if (shopFilter === "character") return shopCatalog;
    if (shopFilter === "all") {
      return shopCatalog.filter(
        (item) =>
          !normalizedQuery ||
          item.labelKo.toLocaleLowerCase().includes(normalizedQuery),
      );
    }
    return shopCatalog.filter(
      (item) =>
        shopFilterForItem(item) === shopFilter &&
        (!normalizedQuery ||
          item.labelKo.toLocaleLowerCase().includes(normalizedQuery)),
    );
  }, [shopCatalog, shopFilter, shopSearchQuery]);

  const wardrobeItems = useMemo(
    () =>
      shopCatalog.filter(
        (item) =>
          ownedItemKeys.includes(item.key) &&
          (item.category as string) !== "food" &&
          (item.category as string) !== "level-up",
      ),
    [ownedItemKeys, shopCatalog],
  );

  const applyHome = useCallback((home: SlimeHome) => {
    setCatalog(home.catalog);
    setOwnedKeys(home.ownedColors);
    setEquippedKeys(home.equippedColors ?? home.ownedColors);
    setRepresentativeColor(
      home.representativeColor ??
        home.equippedColors?.[0] ??
        home.ownedColors[0] ??
        null,
    );
    const resolvedShopCatalog =
      home.shopCatalog ?? SLIME_SHOP_CATALOG.slice();
    const resolvedItemsByColor = home.equippedItemsByColor ?? {};
    const resolvedItemQuantities = { ...(home.ownedItemQuantities ?? {}) };
    if (
      (home.ownedItemKeys ?? []).includes(SLIME_COOKIE_ITEM_KEY) &&
      typeof resolvedItemQuantities[SLIME_COOKIE_ITEM_KEY] !== "number"
    ) {
      resolvedItemQuantities[SLIME_COOKIE_ITEM_KEY] = 1;
    }
    setShopCatalog(resolvedShopCatalog);
    setOwnedItemKeys(home.ownedItemKeys ?? []);
    setOwnedItemQuantities(resolvedItemQuantities);
    setEquippedItemKeys(home.equippedItemKeys ?? []);
    setEquippedItemsByColor(resolvedItemsByColor);
    setHiddenItemsByColor(home.hiddenItemsByColor ?? {});
    setEquippedFloorByColor({
      ...floorsFromItemsByColor(resolvedItemsByColor, resolvedShopCatalog),
      ...(home.equippedFloorByColor ?? {}),
    });
    setGrowthByColor(home.growthByColor ?? home.growth ?? {});
    setClaimedTitles(home.claimedTitles ?? []);
    setEquippedTitleByColor(home.equippedTitleByColor ?? {});
    setBalance(home.balance);
    setUnitLabel(home.currency.unitLabel || "원");
  }, []);

  const fetchHome = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/student/slimes", {
      cache: "no-store",
      signal,
    });
    if (!response.ok) throw new Error("load_failed");
    return (await response.json()) as SlimeHome;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(false);
    void fetchHome(controller.signal)
      .then(applyHome)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [applyHome, fetchHome, loadAttempt]);

  useEffect(() => {
    const tick = () => {
      setGrowthByColor((current) => {
        let changed = false;
        const next = { ...current };
        const now = new Date();
        for (const [color, growth] of Object.entries(current) as [
          SlimeColor,
          SlimeGrowthSnapshotPayload | undefined,
        ][]) {
          if (!growth) continue;
          const lastSettledAt =
            growth.growthLastSettledAt ?? growth.lastSettledAt;
          if (!lastSettledAt) continue;
          const projected = calculateSlimeGrowthSnapshot(
            {
              stage: growth.stage,
              growthSeconds: growth.growthSeconds,
              growthRemainderBps: growth.growthRemainderBps ?? 0,
              growthLastSettledAt: new Date(lastSettledAt),
              growthAppliedSpeedBps:
                growth.growthAppliedSpeedBps ?? growth.appliedSpeedBps ?? 0,
            },
            now,
          );
          next[color] = {
            ...growth,
            ...projected,
            growthLastSettledAt: projected.growthLastSettledAt.toISOString(),
          };
          changed = true;
        }
        return changed ? next : current;
      });
    };
    const interval = window.setInterval(tick, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return {
    catalog, ownedKeys, setOwnedKeys, setEquippedKeys, representativeColor, setRepresentativeColor,
    shopCatalog, ownedItemKeys, setOwnedItemKeys, ownedItemQuantities, setOwnedItemQuantities,
    equippedItemKeys, setEquippedItemKeys, equippedItemsByColor, setEquippedItemsByColor,
    hiddenItemsByColor, setHiddenItemsByColor, equippedFloorByColor, setEquippedFloorByColor,
    growthByColor, setGrowthByColor, claimedTitles, setClaimedTitles,
    equippedTitleByColor, setEquippedTitleByColor, balance, setBalance, unitLabel,
    loading, loadError, setLoadAttempt, busyColor, setBusyColor,
    busyRepresentative, setBusyRepresentative, busyItemKey, setBusyItemKey,
    pendingPurchase, setPendingPurchase, cartLines, setCartLines, cartOpen, setCartOpen,
    cartBusy, setCartBusy, busyCookieColor, setBusyCookieColor, busyTitleColor, setBusyTitleColor,
    notice, setNotice, shopNotice, setShopNotice, wardrobeOpen, setWardrobeOpen,
    wardrobeColor, setWardrobeColor, shopFilter, setShopFilter, shopSearchQuery, setShopSearchQuery,
    wardrobeFilter, setWardrobeFilter, wardrobeSearchQuery, setWardrobeSearchQuery,
    slimeRetryKeys, itemRetryKeys, itemEquipRetryKeys, cookieRetryKeys,
    closeWardrobe, wardrobeTriggerRef, wardrobeCloseRef, effects, visibleShopItems, wardrobeItems,
    applyHome, fetchHome,
  };
}
