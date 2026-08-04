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

const PURCHASE_ERROR: Record<string, string> = {
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

function newIdempotencyKey(prefix: string, key: string): string {
  const uuid =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}-${key}-${uuid}`;
}

function floorForItemKeys(
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
export function useSlimePetController() {
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
          (item.category as string) !== "food",
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

  const purchaseSlime = async (color: SlimeColor) => {
    if (busyColor || ownedKeys.includes(color)) return;
    const idempotencyKey =
      slimeRetryKeys.current.get(color) ?? newIdempotencyKey("slime", color);
    slimeRetryKeys.current.set(color, idempotencyKey);
    setBusyColor(color);
    setShopNotice(null);
    try {
      const response = await fetch("/api/student/slimes/purchase", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ color }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        ownedColor?: SlimeColor;
        balance?: number;
      };
      if (
        !response.ok ||
        !payload.ownedColor ||
        typeof payload.balance !== "number"
      ) {
        if (response.status < 500) slimeRetryKeys.current.delete(color);
        setShopNotice({
          kind: "error",
          text:
            PURCHASE_ERROR[payload.error ?? ""] ??
            "구매하지 못했어요. 다시 시도해 주세요.",
        });
        return;
      }
      slimeRetryKeys.current.delete(color);
      setOwnedKeys((current) =>
        current.includes(payload.ownedColor!)
          ? current
          : [...current, payload.ownedColor!],
      );
      setEquippedKeys((current) =>
        current.includes(payload.ownedColor!)
          ? current
          : [...current, payload.ownedColor!],
      );
      setRepresentativeColor((current) => current ?? payload.ownedColor!);
      setBalance(payload.balance);
      const name =
        catalog.find((slime) => slime.color === payload.ownedColor)?.nameKo ??
        "슬라임";
      setShopNotice({
        kind: "success",
        text: `${name} 구매를 완료했어요.`,
      });
    } catch {
      setShopNotice({
        kind: "error",
        text: "네트워크 오류가 발생했어요. 다시 시도해 주세요.",
      });
    } finally {
      setBusyColor(null);
    }
  };

  const setRepresentative = async (color: SlimeColor) => {
    if (busyRepresentative || representativeColor === color) return;
    setBusyRepresentative(color);
    setNotice(null);
    try {
      const response = await fetch("/api/student/slimes/representative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        representativeColor?: SlimeColor;
      };
      if (!response.ok || payload.representativeColor !== color) {
        setNotice({
          kind: "error",
          text: "대표 슬라임을 지정하지 못했어요.",
        });
        return;
      }
      setRepresentativeColor(color);
      setNotice({
        kind: "success",
        text: `${catalog.find((entry) => entry.color === color)?.nameKo ?? "슬라임"}을(를) 대표로 지정했어요.`,
      });
    } catch {
      setNotice({
        kind: "error",
        text: "네트워크 오류가 발생했어요. 다시 시도해 주세요.",
      });
    } finally {
      setBusyRepresentative(null);
    }
  };

  const purchaseShopItem = async (item: SlimeShopItem, quantity = 1) => {
    const repeatable = item.key === SLIME_COOKIE_ITEM_KEY;
    if (busyItemKey || (!repeatable && ownedItemKeys.includes(item.key))) return;
    const idempotencyKey =
      itemRetryKeys.current.get(item.key) ??
      newIdempotencyKey("slime-item", item.key);
    itemRetryKeys.current.set(item.key, idempotencyKey);
    setBusyItemKey(item.key);
    setShopNotice(null);
    try {
      const response = await fetch("/api/student/slimes/items/purchase", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(
          repeatable ? { itemKey: item.key, quantity } : { itemKey: item.key },
        ),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        ownedItemKey?: string;
        ownedItemQuantity?: number;
        quantity?: number;
        balance?: number;
      };
      if (
        !response.ok ||
        payload.ownedItemKey !== item.key ||
        typeof payload.balance !== "number"
      ) {
        if (response.status < 500) itemRetryKeys.current.delete(item.key);
        setShopNotice({
          kind: "error",
          text:
            PURCHASE_ERROR[payload.error ?? ""] ??
            "구매하지 못했어요. 다시 시도해 주세요.",
        });
        return;
      }
      itemRetryKeys.current.delete(item.key);
      setOwnedItemKeys((current) =>
        current.includes(item.key) ? current : [...current, item.key],
      );
      if (repeatable) {
        const returnedQuantity =
          typeof payload.ownedItemQuantity === "number"
            ? payload.ownedItemQuantity
            : typeof payload.quantity === "number"
              ? payload.quantity
              : null;
        setOwnedItemQuantities((current) => ({
          ...current,
          [item.key]: Math.max(
            0,
            Math.floor(returnedQuantity ?? (current[item.key] ?? 0) + quantity),
          ),
        }));
      }
      setBalance(payload.balance);
      setShopNotice({
        kind: "success",
        text: repeatable
          ? `${item.labelKo} ${quantity}개 구매를 완료했어요.`
          : `${item.labelKo} 구매를 완료했어요.`,
      });
    } catch {
      setShopNotice({
        kind: "error",
        text: "네트워크 오류가 발생했어요. 다시 시도해 주세요.",
      });
    } finally {
      setBusyItemKey(null);
    }
  };

  const consumeCookie = async (color: SlimeColor): Promise<boolean> => {
    const quantity = ownedItemQuantities[SLIME_COOKIE_ITEM_KEY] ?? 0;
    if (busyCookieColor || quantity <= 0) return false;

    const idempotencyKey =
      cookieRetryKeys.current.get(color) ??
      newIdempotencyKey("slime-cookie-consume", color);
    cookieRetryKeys.current.set(color, idempotencyKey);
    setBusyCookieColor(color);
    setNotice(null);
    try {
      const response = await fetch("/api/student/slimes/items/consume", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ itemKey: SLIME_COOKIE_ITEM_KEY, color }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        itemKey?: string;
        remainingQuantity?: number;
        growth?: SlimeGrowthSnapshotPayload;
      };
      if (
        !response.ok ||
        payload.itemKey !== SLIME_COOKIE_ITEM_KEY ||
        typeof payload.remainingQuantity !== "number" ||
        !payload.growth
      ) {
        if (response.status < 500) cookieRetryKeys.current.delete(color);
        setNotice({
          kind: "error",
          text:
            PURCHASE_ERROR[payload.error ?? ""] ??
            "쿠키를 먹이지 못했어요. 다시 시도해 주세요.",
        });
        return false;
      }

      cookieRetryKeys.current.delete(color);
      const remainingQuantity = Math.max(
        0,
        Math.floor(payload.remainingQuantity),
      );
      setOwnedItemQuantities((current) => ({
        ...current,
        [SLIME_COOKIE_ITEM_KEY]: remainingQuantity,
      }));
      setOwnedItemKeys((current) =>
        current.includes(SLIME_COOKIE_ITEM_KEY)
          ? current
          : [...current, SLIME_COOKIE_ITEM_KEY],
      );
      setGrowthByColor((current) => ({
        ...current,
        [color]: payload.growth!,
      }));
      setNotice({
        kind: "success",
        text: `${catalog.find((entry) => entry.color === color)?.nameKo ?? "슬라임"}에게 쿠키를 먹였어요.`,
      });
      return true;
    } catch {
      setNotice({
        kind: "error",
        text: "네트워크 오류가 발생했어요. 다시 시도해 주세요.",
      });
      return false;
    } finally {
      setBusyCookieColor(null);
    }
  };

  const refundSlimePurchase = async (slime: SlimeDefinition) => {
    if (busyColor || !ownedKeys.includes(slime.color)) return;
    if (
      !window.confirm(
        `${slime.nameKo}을(를) 환불할까요? 장착한 꾸미기는 보유 목록에 남아요.`,
      )
    ) {
      return;
    }

    setBusyColor(slime.color);
    setShopNotice(null);
    try {
      const response = await fetch("/api/student/slimes/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color: slime.color }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        refundedColor?: SlimeColor;
        balance?: number;
        representativeColor?: SlimeColor | null;
      };
      if (
        !response.ok ||
        payload.refundedColor !== slime.color ||
        typeof payload.balance !== "number"
      ) {
        setShopNotice({
          kind: "error",
          text:
            PURCHASE_ERROR[payload.error ?? ""] ??
            "환불하지 못했어요. 다시 시도해 주세요.",
        });
        return;
      }

      setOwnedKeys((current) =>
        current.filter((color) => color !== slime.color),
      );
      setEquippedKeys((current) =>
        current.filter((color) => color !== slime.color),
      );
      setEquippedItemsByColor((current) => {
        const next = { ...current };
        delete next[slime.color];
        return next;
      });
      setEquippedFloorByColor((current) => {
        const next = { ...current };
        delete next[slime.color];
        return next;
      });
      setRepresentativeColor(payload.representativeColor ?? null);
      setBalance(payload.balance);
      setShopNotice({
        kind: "success",
        text: `${slime.nameKo}을(를) 환불했어요.`,
      });
    } catch {
      setShopNotice({
        kind: "error",
        text: "네트워크 오류가 발생했어요. 다시 시도해 주세요.",
      });
    } finally {
      setBusyColor(null);
    }
  };

  const refundShopItem = async (item: SlimeShopItem) => {
    if (busyItemKey || !ownedItemKeys.includes(item.key)) return;
    if (
      !window.confirm(
        `${item.labelKo}을(를) 환불할까요? 모든 펫에서 자동으로 해제돼요.`,
      )
    ) {
      return;
    }

    setBusyItemKey(item.key);
    setShopNotice(null);
    try {
      const response = await fetch("/api/student/slimes/items/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemKey: item.key }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        refundedItemKey?: string;
        balance?: number;
      };
      if (
        !response.ok ||
        payload.refundedItemKey !== item.key ||
        typeof payload.balance !== "number"
      ) {
        setShopNotice({
          kind: "error",
          text:
            PURCHASE_ERROR[payload.error ?? ""] ??
            "환불하지 못했어요. 다시 시도해 주세요.",
        });
        return;
      }

      setOwnedItemKeys((current) =>
        current.filter((key) => key !== item.key),
      );
      setEquippedItemKeys((current) =>
        current.filter((key) => key !== item.key),
      );
      setEquippedItemsByColor(
        (current) =>
          Object.fromEntries(
            Object.entries(current).map(([color, keys]) => [
              color,
              (keys ?? []).filter((key) => key !== item.key),
            ]),
          ) as Partial<Record<SlimeColor, string[]>>,
      );
      setEquippedFloorByColor((current) => {
        const next: Partial<Record<SlimeColor, SlimeFloor>> = { ...current };
        for (const color of Object.keys(next) as SlimeColor[]) {
          const keys = (equippedItemsByColor[color] ?? []).filter(
            (key) => key !== item.key,
          );
          next[color] = floorForItemKeys(keys, shopCatalog);
        }
        return next;
      });
      setBalance(payload.balance);
      setShopNotice({
        kind: "success",
        text: `${item.labelKo}을(를) 환불했어요.`,
      });
    } catch {
      setShopNotice({
        kind: "error",
        text: "네트워크 오류가 발생했어요. 다시 시도해 주세요.",
      });
    } finally {
      setBusyItemKey(null);
    }
  };

  const equipShopItem = async (
    color: SlimeColor,
    item: SlimeShopItem,
    nextEquipped: boolean,
  ) => {
    if (busyItemKey || !ownedItemKeys.includes(item.key)) return;
    const idempotencyKey =
      itemEquipRetryKeys.current.get(item.key) ??
      newIdempotencyKey(
        "slime-item-equip",
        `${item.key}-${nextEquipped ? "on" : "off"}`,
      );
    itemEquipRetryKeys.current.set(item.key, idempotencyKey);
    setBusyItemKey(item.key);
    setShopNotice(null);
    try {
      const response = await fetch("/api/student/slimes/items/equip", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          slimeColor: color,
          itemKey: item.key,
          isEquipped: nextEquipped,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        itemKey?: string;
        isEquipped?: boolean;
        equippedItemKeys?: string[];
        equippedItemsByColor?: Partial<Record<SlimeColor, string[]>>;
        equippedFloorByColor?: Partial<Record<SlimeColor, SlimeFloor>>;
      };
      if (
        !response.ok ||
        payload.itemKey !== item.key ||
        payload.isEquipped !== nextEquipped ||
        !Array.isArray(payload.equippedItemKeys) ||
        !payload.equippedItemsByColor
      ) {
        if (response.status < 500) itemEquipRetryKeys.current.delete(item.key);
        setShopNotice({
          kind: "error",
          text:
            PURCHASE_ERROR[payload.error ?? ""] ??
            "아이템 적용에 실패했어요. 다시 시도해 주세요.",
        });
        return;
      }
      itemEquipRetryKeys.current.delete(item.key);
      setEquippedItemKeys(payload.equippedItemKeys);
      setEquippedItemsByColor(payload.equippedItemsByColor);
      setEquippedFloorByColor((current) => ({
        ...current,
        ...(payload.equippedFloorByColor ?? {
          [color]: floorForItemKeys(
            payload.equippedItemsByColor?.[color] ?? [],
            shopCatalog,
          ),
        }),
      }));
      setShopNotice({
        kind: "success",
        text: `${item.labelKo}을(를) ${catalog.find((entry) => entry.color === color)?.nameKo ?? "슬라임"}에 ${nextEquipped ? "적용" : "해제"}했어요.`,
      });
    } catch {
      setShopNotice({
        kind: "error",
        text: "네트워크 오류가 발생했어요. 다시 시도해 주세요.",
      });
    } finally {
      setBusyItemKey(null);
    }
  };

  const equipPetTitle = async (
    color: SlimeColor,
    titleKey: string | null,
  ) => {
    if (busyTitleColor) return;
    setBusyTitleColor(color);
    setNotice(null);
    try {
      const response = await fetch("/api/student/titles/equip", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color, titleKey }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        color?: string;
        equippedTitleKey?: string | null;
      };
      if (
        !response.ok ||
        payload.color !== color ||
        payload.equippedTitleKey !== titleKey
      ) {
        const message =
          payload.error === "title_not_claimed"
            ? "아직 받지 않은 칭호예요."
            : payload.error === "slime_not_found"
              ? "보유한 펫을 찾지 못했어요."
              : "칭호를 적용하지 못했어요. 다시 시도해 주세요.";
        setNotice({ kind: "error", text: message });
        return;
      }

      const refreshedHome = await fetchHome();
      applyHome(refreshedHome);
      const refreshedTitleKey =
        refreshedHome.equippedTitleByColor?.[color] ?? null;
      if (refreshedTitleKey !== titleKey) {
        setNotice({
          kind: "error",
          text: "칭호 저장 상태를 확인하지 못했어요. 다시 시도해 주세요.",
        });
        return;
      }
      const slimeName =
        catalog.find((entry) => entry.color === color)?.nameKo ?? "펫";
      const titleLabel = claimedTitles.find(
        (title) => title.key === titleKey,
      )?.label;
      setNotice({
        kind: "success",
        text: titleKey
          ? `${slimeName}에게 칭호를 붙였어요: ${titleLabel ?? "칭호"}`
          : `${slimeName}의 칭호를 해제했어요.`,
      });
    } catch {
      setNotice({
        kind: "error",
        text: "칭호 저장 상태를 확인하지 못했어요. 다시 시도해 주세요.",
      });
    } finally {
      setBusyTitleColor(null);
    }
  };

  const setItemHidden = async (
    color: SlimeColor,
    item: SlimeShopItem,
    isHidden: boolean,
  ) => {
    if (busyItemKey || !ownedItemKeys.includes(item.key)) return;
    setBusyItemKey(item.key);
    setShopNotice(null);
    try {
      const response = await fetch("/api/student/slimes/items/visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slimeColor: color,
          itemKey: item.key,
          isHidden,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        itemKey?: string;
        isHidden?: boolean;
        hiddenItemKeys?: string[];
        hiddenItemsByColor?: Partial<Record<SlimeColor, string[]>>;
      };
      if (
        !response.ok ||
        payload.itemKey !== item.key ||
        payload.isHidden !== isHidden ||
        !payload.hiddenItemsByColor
      ) {
        setShopNotice({
          kind: "error",
          text:
            PURCHASE_ERROR[payload.error ?? ""] ??
            "외형 표시 설정을 바꾸지 못했어요. 다시 시도해 주세요.",
        });
        return;
      }
      setHiddenItemsByColor(payload.hiddenItemsByColor);
      setShopNotice({
        kind: "success",
        text: `${item.labelKo} 외형을 ${isHidden ? "숨겼어요. 버프는 계속 적용돼요." : "다시 표시했어요."}`,
      });
    } catch {
      setShopNotice({
        kind: "error",
        text: "네트워크 오류가 발생했어요. 다시 시도해 주세요.",
      });
    } finally {
      setBusyItemKey(null);
    }
  };

  const openWardrobeFor = useCallback(
    (color: SlimeColor, trigger: HTMLButtonElement) => {
      wardrobeTriggerRef.current = trigger;
      setShopNotice(null);
      setWardrobeFilter("floor");
      setWardrobeColor(color);
      setWardrobeOpen(true);
    },
    [wardrobeTriggerRef],
  );

  const cartCount = useMemo(
    () => cartLines.reduce((sum, line) => sum + line.quantity, 0),
    [cartLines],
  );

  const addItemToCart = (item: SlimeShopItem, quantity: number) => {
    setCartLines((current) => {
      const existing = current.find((line) => line.item.key === item.key);
      if (!existing) {
        return [...current, { item, quantity: Math.max(1, quantity) }];
      }
      return current.map((line) =>
        line.item.key === item.key
          ? { ...line, quantity: line.quantity + Math.max(1, quantity) }
          : line,
      );
    });
    setPendingPurchase(null);
    setCartOpen(true);
    setShopNotice({
      kind: "success",
      text: `${item.labelKo}을(를) 장바구니에 담았어요.`,
    });
  };

  const changeCartQuantity = (itemKey: string, quantity: number) => {
    setCartLines((current) =>
      current
        .map((line) =>
          line.item.key === itemKey
            ? { ...line, quantity: Math.max(1, quantity) }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  };

  const removeCartLine = (itemKey: string) => {
    setCartLines((current) =>
      current.filter((line) => line.item.key !== itemKey),
    );
  };

  const checkoutCart = async () => {
    if (cartLines.length === 0 || cartBusy) return;
    setCartBusy(true);
    try {
      for (const line of [...cartLines]) {
        await purchaseShopItem(line.item, line.quantity);
      }
      setCartLines([]);
      setCartOpen(false);
    } finally {
      setCartBusy(false);
    }
  };

  const notices = useMemo(
    () => [notice, shopNotice].filter((item): item is Notice => item !== null),
    [notice, shopNotice],
  );
  const dismissNotice = useCallback(
    (target: Notice) => {
      if (notice === target) setNotice(null);
      if (shopNotice === target) setShopNotice(null);
    },
    [notice, shopNotice],
  );

  return {
    data: {
      catalog,
      ownedKeys,
      representativeColor,
      shopCatalog,
      ownedItemKeys,
      ownedItemQuantities,
      equippedItemKeys,
      equippedItemsByColor,
      hiddenItemsByColor,
      equippedFloorByColor,
      growthByColor,
      claimedTitles,
      equippedTitleByColor,
      balance,
      unitLabel,
      effects,
    },
    status: {
      loading,
      loadError,
      retryLoad: () => setLoadAttempt((attempt) => attempt + 1),
      busyColor,
      busyRepresentative,
      busyItemKey,
      busyTitleColor,
    },
    shop: {
      filter: shopFilter,
      setFilter: setShopFilter,
      searchQuery: shopSearchQuery,
      setSearchQuery: setShopSearchQuery,
      visibleItems: visibleShopItems,
      notice: shopNotice,
      pendingPurchase,
      setPendingPurchase,
    },
    wardrobe: {
      open: wardrobeOpen,
      color: wardrobeColor,
      items: wardrobeItems,
      filter: wardrobeFilter,
      setFilter: setWardrobeFilter,
      closeButtonRef: wardrobeCloseRef,
      openFor: openWardrobeFor,
      close: closeWardrobe,
    },
    cart: {
      open: cartOpen,
      setOpen: setCartOpen,
      lines: cartLines,
      count: cartCount,
      busy: cartBusy || busyItemKey !== null,
      addItem: addItemToCart,
      changeQuantity: changeCartQuantity,
      removeLine: removeCartLine,
      checkout: checkoutCart,
    },
    feedback: {
      notices,
      dismiss: dismissNotice,
    },
    actions: {
      purchaseSlime,
      setRepresentative,
      purchaseShopItem,
      consumeCookie,
      refundSlimePurchase,
      refundShopItem,
      equipShopItem,
      equipPetTitle,
      setItemHidden,
    },
  };
}
