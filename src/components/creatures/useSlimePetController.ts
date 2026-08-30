"use client";

import { useCallback, useMemo } from "react";

import type {
  SlimeColor,
  SlimeDefinition,
  SlimeFloor,
  SlimeShopItem,
} from "@/lib/pets/types";

import {
  SLIME_COOKIE_ITEM_KEY,
  shopFilterForItem,
  type Notice,
  type SlimeGrowthSnapshotPayload,
} from "./SlimePetModel";
import type { SlimeCartLine } from "./SlimeShopCartDrawer";
import { PURCHASE_ERROR, floorForItemKeys, newIdempotencyKey, useSlimePetHomeState } from "./useSlimePetHomeState";

/** Owns the pet page mutations and composes them with the query state. */
export function useSlimePetController() {
  const {
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
  } = useSlimePetHomeState();
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
        `${slime.nameKo}을(를) 환불할까요? 장착 중인 꾸미기 아이템은 환불되지 않아요.`,
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
        `${item.labelKo}을(를) 환불할까요? 장착 중인 모든 슬라임에서 자동으로 해제돼요.`,
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
        text: `${item.labelKo} 외형을 ${isHidden ? "숨겼어요. 외형만 숨겨지고, 버프는 유지됩니다." : "다시 표시했어요."}`,
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
      setWardrobeSearchQuery("");
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
      searchQuery: wardrobeSearchQuery,
      setSearchQuery: setWardrobeSearchQuery,
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

export type SlimePetController = ReturnType<typeof useSlimePetController>;
