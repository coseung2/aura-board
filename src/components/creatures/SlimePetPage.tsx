"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { SLIME_SHOP_CATALOG } from "@/lib/pets/catalog";
import { calculateCatalogSlimeEffects } from "@/lib/pets/math";
import {
  calculateSlimeGrowthSnapshot,
} from "@/lib/pets/growth";
import type {
  SlimeColor,
  SlimeDefinition,
  SlimeFloor,
  SlimeShopItem,
} from "@/lib/pets/types";

import styles from "./SlimePetPage.module.css";
import {
  SLIME_COOKIE_ITEM_KEY,
  shopFilterForItem,
  type Notice,
  type ShopFilter,
  type SlimeGrowthSnapshotPayload,
} from "./SlimePetModel";
import { SlimeCollectionSection, SlimeEffectsSection } from "./SlimePetSections";
import { SlimePetShopDrawer } from "./SlimePetShopDrawer";
import { StudentPetSectionHeader } from "./StudentPetSectionHeader";

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
  equippedFloorByColor?: Partial<Record<SlimeColor, SlimeFloor>>;
  shopCatalog?: SlimeShopItem[];
  growthSpeedBps?: number;
  growthByColor?: Partial<Record<SlimeColor, SlimeGrowthSnapshotPayload>>;
  growth?: Partial<Record<SlimeColor, SlimeGrowthSnapshotPayload>>;
};

const PURCHASE_ERROR: Record<string, string> = {
  insufficient_funds: "잔액이 부족해요.",
  already_owned: "이미 보유한 상품이에요.",
  unknown_item: "상품을 찾을 수 없어요.",
  idempotency_key_reused: "같은 구매 요청이 다른 상품에 사용됐어요. 다시 시도해 주세요.",
  account_not_found: "학생 지갑을 찾을 수 없어요.",
  unauthenticated: "로그인이 만료됐어요. 다시 로그인해 주세요.",
  not_owned: "이미 환불했거나 보유하지 않은 상품이에요.",
  not_refundable: "환불할 수 없는 상품이에요.",
};

function newIdempotencyKey(prefix: string, key: string): string {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}-${key}-${uuid}`;
}

function floorForItemKeys(
  itemKeys: readonly string[],
  shopCatalog: readonly SlimeShopItem[],
): SlimeFloor {
  let floor: SlimeFloor = "none";
  for (const itemKey of itemKeys) {
    const candidate = shopCatalog.find((item) => item.key === itemKey)?.floor;
    if (
      candidate === "grass-floor" ||
      candidate === "water-puddle" ||
      candidate === "trampoline"
    ) {
      floor = candidate;
    }
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

export function SlimePetPage() {
  const [catalog, setCatalog] = useState<SlimeDefinition[]>([]);
  const [ownedKeys, setOwnedKeys] = useState<SlimeColor[]>([]);
  const [equippedKeys, setEquippedKeys] = useState<SlimeColor[]>([]);
  const [representativeColor, setRepresentativeColor] = useState<SlimeColor | null>(null);
  const [shopCatalog, setShopCatalog] = useState<SlimeShopItem[]>([]);
  const [ownedItemKeys, setOwnedItemKeys] = useState<string[]>([]);
  const [ownedItemQuantities, setOwnedItemQuantities] = useState<Record<string, number>>({});
  const [equippedItemKeys, setEquippedItemKeys] = useState<string[]>([]);
  const [equippedItemsByColor, setEquippedItemsByColor] = useState<Partial<Record<SlimeColor, string[]>>>({});
  const [equippedFloorByColor, setEquippedFloorByColor] = useState<Partial<Record<SlimeColor, SlimeFloor>>>({});
  const [growthByColor, setGrowthByColor] = useState<Partial<Record<SlimeColor, SlimeGrowthSnapshotPayload>>>({});
  const [balance, setBalance] = useState(0);
  const [unitLabel, setUnitLabel] = useState("원");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [busyColor, setBusyColor] = useState<SlimeColor | null>(null);
  const [busyRepresentative, setBusyRepresentative] = useState<SlimeColor | null>(null);
  const [busyItemKey, setBusyItemKey] = useState<string | null>(null);
  const [busyCookieColor, setBusyCookieColor] = useState<SlimeColor | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [shopNotice, setShopNotice] = useState<Notice | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [wardrobeColor, setWardrobeColor] = useState<SlimeColor | null>(null);
  const [shopFilter, setShopFilter] = useState<ShopFilter>("character");
  const drawerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const shopCloseRef = useRef<HTMLButtonElement>(null);
  const hadOpenDrawer = useRef(false);
  const slimeRetryKeys = useRef(new Map<SlimeColor, string>());
  const itemRetryKeys = useRef(new Map<string, string>());
  const itemEquipRetryKeys = useRef(new Map<string, string>());
  const cookieRetryKeys = useRef(new Map<SlimeColor, string>());

  const effects = useMemo(
    () => calculateCatalogSlimeEffects(
      ownedKeys,
      equippedItemKeys,
      undefined,
      Object.fromEntries(
        Object.entries(growthByColor).map(([color, growth]) => [color, growth?.stage ?? 1]),
      ),
    ),
    [equippedItemKeys, growthByColor, ownedKeys],
  );
  const visibleShopItems = useMemo(
    () =>
      shopFilter === "all"
        ? shopCatalog
        : shopCatalog.filter((item) => shopFilterForItem(item) === shopFilter),
    [shopCatalog, shopFilter],
  );
  const drawerItems = wardrobeColor
    ? visibleShopItems.filter(
        (item) =>
          ownedItemKeys.includes(item.key) &&
          (item.category as string) !== "food",
      )
    : visibleShopItems;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(false);
    void fetch("/api/student/slimes", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("load_failed");
        return (await response.json()) as SlimeHome;
      })
      .then((home) => {
        setCatalog(home.catalog);
        setOwnedKeys(home.ownedColors);
        setEquippedKeys(home.equippedColors ?? home.ownedColors);
        setRepresentativeColor(
          home.representativeColor ?? home.equippedColors?.[0] ?? home.ownedColors[0] ?? null,
        );
        const resolvedShopCatalog = home.shopCatalog ?? SLIME_SHOP_CATALOG.slice();
        const resolvedItemsByColor = home.equippedItemsByColor ?? {};
        const resolvedItemQuantities = { ...(home.ownedItemQuantities ?? {}) };
        // Older snapshots only exposed ownedItemKeys. Treat a legacy cookie
        // row as one item until the quantity payload is available.
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
        setEquippedFloorByColor({
          ...floorsFromItemsByColor(resolvedItemsByColor, resolvedShopCatalog),
          ...(home.equippedFloorByColor ?? {}),
        });
        setGrowthByColor(home.growthByColor ?? home.growth ?? {});
        setBalance(home.balance);
        setUnitLabel(home.currency.unitLabel || "원");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [loadAttempt]);

  // Keep the wall-clock projection fresh while the page is open.  The server
  // remains authoritative; this only advances the last persisted snapshot and
  // deliberately refreshes at minute cadence so the UI never shows seconds.
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
          const lastSettledAt = growth.growthLastSettledAt ?? growth.lastSettledAt;
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

  useEffect(() => {
    if (!shopOpen) {
      if (hadOpenDrawer.current) {
        hadOpenDrawer.current = false;
        drawerTriggerRef.current?.focus();
      }
      return;
    }

    hadOpenDrawer.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => shopCloseRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShopOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const drawer = shopCloseRef.current?.closest<HTMLElement>("[role='dialog']");
      if (!drawer) return;
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [shopOpen]);

  const purchase = async (color: SlimeColor) => {
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
      if (!response.ok || !payload.ownedColor || typeof payload.balance !== "number") {
        if (response.status < 500) slimeRetryKeys.current.delete(color);
        setShopNotice({
          kind: "error",
          text: PURCHASE_ERROR[payload.error ?? ""] ?? "구매하지 못했어요. 다시 시도해 주세요.",
        });
        return;
      }
      slimeRetryKeys.current.delete(color);
      setOwnedKeys((current) =>
        current.includes(payload.ownedColor!) ? current : [...current, payload.ownedColor!],
      );
      // Newly purchased slimes follow the server's default equipped state.
      setEquippedKeys((current) =>
        current.includes(payload.ownedColor!) ? current : [...current, payload.ownedColor!],
      );
      setRepresentativeColor((current) => current ?? payload.ownedColor!);
      setBalance(payload.balance);
      const name = catalog.find((slime) => slime.color === payload.ownedColor)?.nameKo ?? "슬라임";
      setShopNotice({ kind: "success", text: `${name} 구매를 완료했어요.` });
    } catch {
      setShopNotice({ kind: "error", text: "네트워크 오류가 발생했어요. 다시 시도해 주세요." });
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
        setNotice({ kind: "error", text: "대표 슬라임을 지정하지 못했어요." });
        return;
      }
      setRepresentativeColor(color);
      setNotice({
        kind: "success",
        text: `${catalog.find((entry) => entry.color === color)?.nameKo ?? "슬라임"}을(를) 대표로 지정했어요.`,
      });
    } catch {
      setNotice({ kind: "error", text: "네트워크 오류가 발생했어요. 다시 시도해 주세요." });
    } finally {
      setBusyRepresentative(null);
    }
  };

  const purchaseShopItem = async (item: SlimeShopItem) => {
    const repeatable = item.key === SLIME_COOKIE_ITEM_KEY;
    if (busyItemKey || (!repeatable && ownedItemKeys.includes(item.key))) return;
    const idempotencyKey =
      itemRetryKeys.current.get(item.key) ?? newIdempotencyKey("slime-item", item.key);
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
        body: JSON.stringify({ itemKey: item.key }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        ownedItemKey?: string;
        ownedItemQuantity?: number;
        quantity?: number;
        balance?: number;
      };
      if (!response.ok || payload.ownedItemKey !== item.key || typeof payload.balance !== "number") {
        if (response.status < 500) itemRetryKeys.current.delete(item.key);
        setShopNotice({
          kind: "error",
          text: PURCHASE_ERROR[payload.error ?? ""] ?? "구매하지 못했어요. 다시 시도해 주세요.",
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
            Math.floor(
              returnedQuantity ?? ((current[item.key] ?? 0) + 1),
            ),
          ),
        }));
      }
      setBalance(payload.balance);
      setShopNotice({
        kind: "success",
        text: repeatable
          ? `${item.labelKo} 구매를 완료했어요. 보유 수량이 늘었어요.`
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

  /** Consume one repeatable cookie and trust the returned growth snapshot. */
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
          text: PURCHASE_ERROR[payload.error ?? ""] ??
            "쿠키를 먹이지 못했어요. 다시 시도해 주세요.",
        });
        return false;
      }

      cookieRetryKeys.current.delete(color);
      const remainingQuantity = Math.max(0, Math.floor(payload.remainingQuantity));
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
      setNotice({ kind: "error", text: "네트워크 오류가 발생했어요. 다시 시도해 주세요." });
      return false;
    } finally {
      setBusyCookieColor(null);
    }
  };

  const refundSlimePurchase = async (slime: SlimeDefinition) => {
    if (busyColor || !ownedKeys.includes(slime.color)) return;
    if (!window.confirm(`${slime.nameKo}을(를) 환불할까요? 장착한 꾸미기는 보유 목록에 남아요.`)) return;

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
      if (!response.ok || payload.refundedColor !== slime.color || typeof payload.balance !== "number") {
        setShopNotice({
          kind: "error",
          text: PURCHASE_ERROR[payload.error ?? ""] ?? "환불하지 못했어요. 다시 시도해 주세요.",
        });
        return;
      }

      setOwnedKeys((current) => current.filter((color) => color !== slime.color));
      setEquippedKeys((current) => current.filter((color) => color !== slime.color));
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
      setShopNotice({ kind: "success", text: `${slime.nameKo}을(를) 환불했어요.` });
    } catch {
      setShopNotice({ kind: "error", text: "네트워크 오류가 발생했어요. 다시 시도해 주세요." });
    } finally {
      setBusyColor(null);
    }
  };

  const refundShopItem = async (item: SlimeShopItem) => {
    if (busyItemKey || !ownedItemKeys.includes(item.key)) return;
    if (!window.confirm(`${item.labelKo}을(를) 환불할까요? 모든 펫에서 자동으로 해제돼요.`)) return;

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
      if (!response.ok || payload.refundedItemKey !== item.key || typeof payload.balance !== "number") {
        setShopNotice({
          kind: "error",
          text: PURCHASE_ERROR[payload.error ?? ""] ?? "환불하지 못했어요. 다시 시도해 주세요.",
        });
        return;
      }

      setOwnedItemKeys((current) => current.filter((key) => key !== item.key));
      setEquippedItemKeys((current) => current.filter((key) => key !== item.key));
      setEquippedItemsByColor((current) =>
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
          const keys = (equippedItemsByColor[color] ?? []).filter((key) => key !== item.key);
          next[color] = floorForItemKeys(keys, shopCatalog);
        }
        return next;
      });
      setBalance(payload.balance);
      setShopNotice({ kind: "success", text: `${item.labelKo}을(를) 환불했어요.` });
    } catch {
      setShopNotice({ kind: "error", text: "네트워크 오류가 발생했어요. 다시 시도해 주세요." });
    } finally {
      setBusyItemKey(null);
    }
  };

  const equipShopItem = async (color: SlimeColor, item: SlimeShopItem, nextEquipped: boolean) => {
    if (busyItemKey || !ownedItemKeys.includes(item.key)) return;
    const idempotencyKey =
      itemEquipRetryKeys.current.get(item.key) ??
      newIdempotencyKey("slime-item-equip", `${item.key}-${nextEquipped ? "on" : "off"}`);
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
        body: JSON.stringify({ slimeColor: color, itemKey: item.key, isEquipped: nextEquipped }),
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
        !Array.isArray(payload.equippedItemKeys) || !payload.equippedItemsByColor
      ) {
        if (response.status < 500) itemEquipRetryKeys.current.delete(item.key);
        setShopNotice({
          kind: "error",
          text: PURCHASE_ERROR[payload.error ?? ""] ?? "아이템 적용에 실패했어요. 다시 시도해 주세요.",
        });
        return;
      }
      itemEquipRetryKeys.current.delete(item.key);
      setEquippedItemKeys(payload.equippedItemKeys);
      setEquippedItemsByColor(payload.equippedItemsByColor);
      setEquippedFloorByColor((current) => ({
        ...current,
        ...(payload.equippedFloorByColor ?? {
          [color]: floorForItemKeys(payload.equippedItemsByColor?.[color] ?? [], shopCatalog),
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

  const closeDrawer = () => {
    setShopOpen(false);
    setWardrobeColor(null);
  };

  return (
    <main className={styles.page} data-testid="slime-pet-page">
      <StudentPetSectionHeader
        active="mine"
        actions={
          <div className={styles.walletActions}>
            <div className={styles.walletSummary} aria-live="polite">
              <span className={styles.walletLabel}>내 지갑</span>
              <strong data-testid="slime-wallet-balance">
                {balance.toLocaleString("ko-KR")} {unitLabel}
              </strong>
            </div>
            <button
              type="button"
              className={styles.shopTrigger}
              onClick={(event) => {
                drawerTriggerRef.current = event.currentTarget;
                setShopNotice(null);
                setWardrobeColor(null);
                setShopFilter("character");
                setShopOpen(true);
              }}
              aria-haspopup="dialog"
              aria-expanded={shopOpen}
            >
              <span className={styles.spriteSlot} aria-hidden="true">🛍</span>
              <span className={styles.buttonLabel}>상점</span>
            </button>
          </div>
        }
      />

      {loading && <p className={styles.status} role="status">슬라임 정보를 불러오는 중…</p>}
      {loadError && (
        <div className={styles.status} role="alert">
          <span>슬라임 정보를 불러오지 못했어요.</span>
          <button
            type="button"
            className={styles.retryButton}
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
          >
            다시 시도
          </button>
        </div>
      )}
      {notice && (
        <p
          className={`${styles.status} ${notice.kind === "error" ? styles.statusError : ""}`}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      )}

      <SlimeCollectionSection
        catalog={catalog}
        ownedKeys={ownedKeys}
        representativeColor={representativeColor}
        shopCatalog={shopCatalog}
        ownedItemQuantities={ownedItemQuantities}
        equippedItemsByColor={equippedItemsByColor}
        equippedFloorByColor={equippedFloorByColor}
        growthByColor={growthByColor}
        effects={effects}
        loading={loading}
        loadFailed={loadError}
        busyRepresentative={busyRepresentative}
        onSetRepresentative={(color) => void setRepresentative(color)}
        onFeedCookie={consumeCookie}
        onOpenWardrobe={(color, trigger) => {
          drawerTriggerRef.current = trigger;
          setShopNotice(null);
          setShopFilter("all");
          setWardrobeColor(color);
          setShopOpen(true);
        }}
      />

      <SlimeEffectsSection effects={effects} />

      {shopOpen && (
        <SlimePetShopDrawer
          catalog={catalog}
          drawerItems={drawerItems}
          ownedKeys={ownedKeys}
          ownedItemKeys={ownedItemKeys}
          ownedItemQuantities={ownedItemQuantities}
          equippedItemKeys={equippedItemKeys}
          equippedItemsByColor={equippedItemsByColor}
          wardrobeColor={wardrobeColor}
          shopFilter={shopFilter}
          unitLabel={unitLabel}
          busyColor={busyColor}
          busyItemKey={busyItemKey}
          notice={shopNotice}
          closeButtonRef={shopCloseRef}
          onClose={closeDrawer}
          onFilterChange={setShopFilter}
          onPurchaseSlime={(color) => void purchase(color)}
          onRefundSlime={(slime) => void refundSlimePurchase(slime)}
          onPurchaseItem={(item) => void purchaseShopItem(item)}
          onRefundItem={(item) => void refundShopItem(item)}
          onEquipItem={(color, item, nextEquipped) => void equipShopItem(color, item, nextEquipped)}
        />
      )}
    </main>
  );
}
