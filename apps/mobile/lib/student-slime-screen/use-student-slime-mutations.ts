import type { Dispatch, SetStateAction } from "react";
import type { Router } from "expo-router";
import type { MobileSlimeHome, SlimeShopItem } from "../slimes";
import type { Notice } from "./student-slime-domain";
import type { SlimeAction, SlimeColor } from "../slime-assets";
import type { SlimeCatalogItem } from "../slimes";
import type { SlimeCookieConsumeResponse } from "./student-slime-domain";
import type { SlimeEquipResponse } from "./student-slime-domain";
import type { SlimeVisibilityResponse } from "./student-slime-domain";
import { Alert } from "react-native";
import { ApiError } from "../api";
import { SLIME_COLOR_LABELS } from "../slimes";
import { SLIME_COOKIE_ITEM_KEY } from "../slimes";
import { apiErrorMessage } from "./student-slime-domain";
import { apiFetch } from "../api";
import { clearSessionToken } from "../session";
import { equipPetTitle } from "../titles";
import { getUnifiedLoginRoute } from "../session";
import { itemFloor } from "./student-slime-domain";
import { newSlimeIdempotencyKey } from "../slimes";
import { optimisticallyEquipSlimeItem } from "../slime-shop-presentation";
import { setSlimeItemHidden } from "../slime-item-visibility";
import { useCallback } from "react";
import { useEffect } from "react";
import { useRef } from "react";

type StudentSlimeMutationArgs = {
  home: MobileSlimeHome | null;
  setHome: Dispatch<SetStateAction<MobileSlimeHome | null>>;
  selectedColor: SlimeColor;
  wardrobeColor: SlimeColor | null;
  wardrobeTargetColor: SlimeColor;
  cookieQuantity: number;
  busyItemKey: string | null;
  busyColor: SlimeColor | null;
  busyRepresentative: SlimeColor | null;
  load: (isRefresh?: boolean) => Promise<void>;
  router: Pick<Router, "replace">;
  setBusyItemKey: Dispatch<SetStateAction<string | null>>;
  setBusyColor: Dispatch<SetStateAction<SlimeColor | null>>;
  setBusyRepresentative: Dispatch<SetStateAction<SlimeColor | null>>;
  setPendingPurchase: Dispatch<SetStateAction<SlimeShopItem | null>>;
  setNotice: Dispatch<SetStateAction<Notice | null>>;
  setManualActions: Dispatch<
    SetStateAction<Partial<Record<SlimeColor, SlimeAction>>>
  >;
};

export function useStudentSlimeMutations({
  home,
  setHome,
  selectedColor,
  wardrobeColor,
  wardrobeTargetColor,
  cookieQuantity,
  busyItemKey,
  busyColor,
  busyRepresentative,
  load,
  router,
  setBusyItemKey,
  setBusyColor,
  setBusyRepresentative,
  setPendingPurchase,
  setNotice,
  setManualActions,
}: StudentSlimeMutationArgs) {
  const retryKeysRef = useRef(new Map<string, string>());

  const homeRef = useRef<MobileSlimeHome | null>(null);

  const equipQueueRef = useRef<Promise<void>>(Promise.resolve());

  const latestEquipRequestRef = useRef(0);

  useEffect(() => {
    homeRef.current = home;
  }, [home]);

  const retryKey = useCallback((scope: string, identity: string) => {
    const mapKey = `${scope}:${identity}`;
    const current = retryKeysRef.current.get(mapKey);
    if (current) return current;
    const created = newSlimeIdempotencyKey(scope, identity);
    retryKeysRef.current.set(mapKey, created);
    return created;
  }, []);

  const clearRetryKey = useCallback((scope: string, identity: string) => {
    retryKeysRef.current.delete(`${scope}:${identity}`);
  }, []);

  const mutateFloor = useCallback(
    async (item: SlimeShopItem) => {
      const floor = itemFloor(item);
      if (!floor || !home || !home.ownedColors.includes(selectedColor)) return;
      const currentFloor = home.equippedFloorByColor[selectedColor] ?? "none";
      if (currentFloor === floor) {
        if (floor === "water-puddle" || floor === "trampoline") {
          setManualActions((current) => ({
            ...current,
            [selectedColor]: "floor-interaction",
          }));
        }
        return;
      }

      const owned = home.ownedItemKeys.includes(item.key);
      const scope = owned ? "slime-floor-equip" : "slime-floor-purchase";
      const keyIdentity = owned ? `${selectedColor}:${item.key}` : item.key;
      setBusyItemKey(item.key);
      setNotice(null);
      try {
        if (!owned) {
          await apiFetch("/api/student/slimes/items/purchase", {
            method: "POST",
            json: { itemKey: item.key },
            headers: { "Idempotency-Key": retryKey(scope, keyIdentity) },
          });
          await apiFetch("/api/student/slimes/items/equip", {
            method: "POST",
            json: {
              itemKey: item.key,
              slimeColor: selectedColor,
              isEquipped: true,
            },
            headers: {
              "Idempotency-Key": retryKey(
                "slime-floor-equip",
                `${selectedColor}:${item.key}`,
              ),
            },
          });
          setNotice({
            kind: "success",
            text: `${item.labelKo}를 구매하고 장착했어요.`,
          });
          clearRetryKey(scope, keyIdentity);
          clearRetryKey("slime-floor-equip", `${selectedColor}:${item.key}`);
        } else {
          await apiFetch("/api/student/slimes/items/equip", {
            method: "POST",
            json: {
              itemKey: item.key,
              slimeColor: selectedColor,
              isEquipped: true,
            },
            headers: { "Idempotency-Key": retryKey(scope, keyIdentity) },
          });
          setNotice({ kind: "success", text: `${item.labelKo}를 장착했어요.` });
          clearRetryKey(scope, keyIdentity);
        }
        await load(true);
      } catch (mutationError) {
        if (mutationError instanceof ApiError && mutationError.status === 401) {
          await clearSessionToken();
          router.replace(getUnifiedLoginRoute("student"));
          return;
        }
        setNotice({ kind: "error", text: apiErrorMessage(mutationError) });
      } finally {
        setBusyItemKey(null);
      }
    },
    [clearRetryKey, home, load, retryKey, router, selectedColor],
  );

  const purchaseSlime = useCallback(
    async (color: SlimeColor) => {
      if (!home || busyColor || home.ownedColors.includes(color)) return;
      setBusyColor(color);
      setNotice(null);
      try {
        await apiFetch("/api/student/slimes/purchase", {
          method: "POST",
          json: { color },
          headers: { "Idempotency-Key": retryKey("slime-purchase", color) },
        });
        clearRetryKey("slime-purchase", color);
        setNotice({
          kind: "success",
          text: `${SLIME_COLOR_LABELS[color]} 슬라임을 구매했어요.`,
        });
        await load(true);
      } catch (mutationError) {
        setNotice({ kind: "error", text: apiErrorMessage(mutationError) });
      } finally {
        setBusyColor(null);
      }
    },
    [busyColor, clearRetryKey, home, load, retryKey],
  );

  const setRepresentative = useCallback(
    async (color: SlimeColor) => {
      if (!home || !home.ownedColors.includes(color) || busyRepresentative)
        return;
      setBusyRepresentative(color);
      setNotice(null);
      try {
        await apiFetch("/api/student/slimes/representative", {
          method: "POST",
          json: { color },
        });
        setNotice({
          kind: "success",
          text: `${SLIME_COLOR_LABELS[color]} 슬라임을 대표로 지정했어요.`,
        });
        await load(true);
      } catch (mutationError) {
        setNotice({ kind: "error", text: apiErrorMessage(mutationError) });
      } finally {
        setBusyRepresentative(null);
      }
    },
    [busyRepresentative, home, load],
  );

  const purchaseItem = useCallback(
    async (item: SlimeShopItem, quantity = 1) => {
      if (!home || busyItemKey) return;
      setBusyItemKey(item.key);
      setNotice(null);
      // The server compares the charged amount on replay, so a retry with a
      // different quantity must not reuse the previous request's key.
      const retryIdentity = `${item.key}:${quantity}`;
      try {
        await apiFetch("/api/student/slimes/items/purchase", {
          method: "POST",
          json:
            quantity > 1
              ? { itemKey: item.key, quantity }
              : { itemKey: item.key },
          headers: {
            "Idempotency-Key": retryKey("slime-item-purchase", retryIdentity),
          },
        });
        clearRetryKey("slime-item-purchase", retryIdentity);
        setNotice({
          kind: "success",
          text: `${item.labelKo}${quantity > 1 ? ` ${quantity}개` : ""}를 구매했어요.`,
        });
        await load(true);
      } catch (mutationError) {
        setNotice({ kind: "error", text: apiErrorMessage(mutationError) });
      } finally {
        setBusyItemKey(null);
      }
    },
    [busyItemKey, clearRetryKey, home, load, retryKey],
  );

  const confirmSlimePurchase = useCallback(
    (slime: SlimeCatalogItem) => {
      Alert.alert(
        "구매 확인",
        `${slime.nameKo}을(를) ${slime.price.toLocaleString()}${home?.unitLabel ?? "원"}에 구매할까요?`,
        [
          { text: "취소", style: "cancel" },
          { text: "구매", onPress: () => void purchaseSlime(slime.color) },
        ],
      );
    },
    [home?.unitLabel, purchaseSlime],
  );

  const confirmItemPurchase = useCallback((item: SlimeShopItem) => {
    setPendingPurchase(item);
  }, []);

  const toggleItem = useCallback(
    (item: SlimeShopItem) => {
      const currentHome = homeRef.current;
      if (
        !currentHome ||
        !currentHome.ownedColors.includes(wardrobeTargetColor) ||
        item.category === "food"
      )
        return;
      const targetItems =
        currentHome.equippedItemsByColor[wardrobeTargetColor] ?? [];
      const isEquipped = !targetItems.includes(item.key);
      const requestVersion = latestEquipRequestRef.current + 1;
      latestEquipRequestRef.current = requestVersion;
      const optimisticHome = optimisticallyEquipSlimeItem(
        currentHome,
        wardrobeTargetColor,
        item,
        isEquipped,
      );
      homeRef.current = optimisticHome;
      setHome(optimisticHome);
      setBusyItemKey(item.key);
      setNotice(null);
      const retryIdentity = `${wardrobeTargetColor}:${item.key}:${isEquipped}`;

      const queuedRequest = equipQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          setBusyItemKey(item.key);
          try {
            const result = await apiFetch<SlimeEquipResponse>(
              "/api/student/slimes/items/equip",
              {
                method: "POST",
                json: {
                  itemKey: item.key,
                  slimeColor: wardrobeTargetColor,
                  isEquipped,
                },
                timeoutMs: 15_000,
                headers: {
                  "Idempotency-Key": retryKey(
                    "slime-item-equip",
                    retryIdentity,
                  ),
                },
              },
            );
            clearRetryKey("slime-item-equip", retryIdentity);
            if (latestEquipRequestRef.current === requestVersion) {
              const reconciledHome = homeRef.current
                ? {
                    ...homeRef.current,
                    equippedItemKeys: result.equippedItemKeys,
                    equippedItemsByColor: result.equippedItemsByColor,
                    hiddenItemKeys: result.hiddenItemKeys,
                    hiddenItemsByColor: result.hiddenItemsByColor,
                    equippedFloorByColor: result.equippedFloorByColor,
                    equippedFloor: result.equippedFloor,
                  }
                : null;
              homeRef.current = reconciledHome;
              setHome(reconciledHome);
              setNotice({
                kind: "success",
                text: `${item.labelKo}를 ${isEquipped ? "적용" : "해제"}했어요.`,
              });
            }
          } catch (mutationError) {
            if (latestEquipRequestRef.current === requestVersion) {
              setNotice({
                kind: "error",
                text: apiErrorMessage(mutationError),
              });
              await load(true);
            }
          } finally {
            if (latestEquipRequestRef.current === requestVersion) {
              setBusyItemKey(null);
            }
          }
        });
      equipQueueRef.current = queuedRequest;
    },
    [clearRetryKey, load, retryKey, wardrobeTargetColor],
  );

  const toggleItemVisibility = useCallback(
    (item: SlimeShopItem, isCurrentlyHidden: boolean) => {
      const currentHome = homeRef.current;
      const equipped =
        currentHome?.equippedItemsByColor[wardrobeTargetColor] ?? [];
      if (!currentHome || !equipped.includes(item.key)) return;

      const isHidden = !isCurrentlyHidden;
      const requestVersion = latestEquipRequestRef.current + 1;
      latestEquipRequestRef.current = requestVersion;
      const hiddenItemsByColor = setSlimeItemHidden(
        currentHome.hiddenItemsByColor,
        wardrobeTargetColor,
        item.key,
        isHidden,
      );
      const optimisticHome: MobileSlimeHome = {
        ...currentHome,
        hiddenItemsByColor: Object.fromEntries(
          Object.entries(hiddenItemsByColor).map(([color, keys]) => [
            color,
            [...(keys ?? [])],
          ]),
        ),
        hiddenItemKeys: Array.from(
          new Set(
            Object.values(hiddenItemsByColor).flatMap((keys) => [
              ...(keys ?? []),
            ]),
          ),
        ),
      };
      homeRef.current = optimisticHome;
      setHome(optimisticHome);
      setBusyItemKey(item.key);
      setNotice(null);
      const retryIdentity = `${wardrobeTargetColor}:${item.key}:${isHidden}`;

      const queuedRequest = equipQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          setBusyItemKey(item.key);
          try {
            const result = await apiFetch<SlimeVisibilityResponse>(
              "/api/student/slimes/items/visibility",
              {
                method: "POST",
                json: {
                  itemKey: item.key,
                  slimeColor: wardrobeTargetColor,
                  isHidden,
                },
                timeoutMs: 15_000,
                headers: {
                  "Idempotency-Key": retryKey(
                    "slime-item-visibility",
                    retryIdentity,
                  ),
                },
              },
            );
            clearRetryKey("slime-item-visibility", retryIdentity);
            if (latestEquipRequestRef.current === requestVersion) {
              const reconciledHome = homeRef.current
                ? {
                    ...homeRef.current,
                    hiddenItemKeys: result.hiddenItemKeys,
                    hiddenItemsByColor: result.hiddenItemsByColor,
                  }
                : null;
              homeRef.current = reconciledHome;
              setHome(reconciledHome);
              setNotice({
                kind: "success",
                text: `${item.labelKo} 외형을 ${isHidden ? "숨겼어요. 외형만 숨겨지고, 버프는 유지됩니다." : "다시 표시했어요."}`,
              });
            }
          } catch (mutationError) {
            if (latestEquipRequestRef.current === requestVersion) {
              setNotice({
                kind: "error",
                text: apiErrorMessage(mutationError),
              });
              await load(true);
            }
          } finally {
            if (latestEquipRequestRef.current === requestVersion)
              setBusyItemKey(null);
          }
        });
      equipQueueRef.current = queuedRequest;
    },
    [clearRetryKey, load, retryKey, wardrobeTargetColor],
  );

  const toggleTitle = useCallback(
    async (titleKey: string, equipped: boolean) => {
      const targetColor = wardrobeColor ?? selectedColor;
      if (!home || !targetColor || busyItemKey) return;
      setBusyItemKey(titleKey);
      setNotice(null);
      try {
        await equipPetTitle(targetColor, equipped ? null : titleKey);
        setNotice({
          kind: "success",
          text: `칭호를 ${equipped ? "해제" : "적용"}했어요.`,
        });
        await load(true);
      } catch (mutationError) {
        setNotice({ kind: "error", text: apiErrorMessage(mutationError) });
      } finally {
        setBusyItemKey(null);
      }
    },
    [busyItemKey, home, load, selectedColor, wardrobeColor],
  );

  const feedCookie = useCallback(
    async (color: SlimeColor) => {
      if (
        !home ||
        !home.ownedColors.includes(color) ||
        cookieQuantity <= 0 ||
        busyItemKey
      )
        return;
      setBusyItemKey(SLIME_COOKIE_ITEM_KEY);
      setNotice(null);
      try {
        const result = await apiFetch<SlimeCookieConsumeResponse>(
          "/api/student/slimes/items/consume",
          {
            method: "POST",
            json: { itemKey: SLIME_COOKIE_ITEM_KEY, color },
            timeoutMs: 15_000,
            headers: {
              "Idempotency-Key": retryKey("slime-cookie-use", color),
            },
          },
        );
        clearRetryKey("slime-cookie-use", color);
        setHome((current) =>
          current
            ? {
                ...current,
                ownedItemQuantities: {
                  ...current.ownedItemQuantities,
                  [SLIME_COOKIE_ITEM_KEY]: result.remainingQuantity,
                },
                growthByColor: {
                  ...current.growthByColor,
                  [color]: result.growth,
                },
              }
            : current,
        );
        setManualActions((current) => ({ ...current, [color]: "happy" }));
        setNotice({
          kind: "success",
          text: `${SLIME_COLOR_LABELS[color]} 슬라임에게 쿠키를 먹였어요.`,
        });
      } catch (mutationError) {
        setNotice({ kind: "error", text: apiErrorMessage(mutationError) });
      } finally {
        setBusyItemKey(null);
      }
    },
    [busyItemKey, clearRetryKey, cookieQuantity, home, retryKey],
  );
  return {
    purchaseSlime,
    setRepresentative,
    purchaseItem,
    confirmSlimePurchase,
    confirmItemPurchase,
    toggleItem,
    toggleItemVisibility,
    toggleTitle,
    feedCookie,
  } as const;
}
