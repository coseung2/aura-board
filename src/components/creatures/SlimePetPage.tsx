"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { SLIME_SHOP_CATALOG } from "@/lib/pets/catalog";
import {
  calculateCatalogSlimeEffects,
  formatBpsPercent,
} from "@/lib/pets/math";
import {
  calculateSlimeGrowthSnapshot,
  formatSlimeGrowthRemaining,
  type SlimeGrowthSnapshot,
} from "@/lib/pets/growth";
import type {
  SlimeColor,
  SlimeDefinition,
  SlimeEffectKey,
  SlimeShopCategory,
  SlimeShopItem,
} from "@/lib/pets/types";

import styles from "./SlimePetPage.module.css";
import { SlimeCharacterSprite } from "./SlimeCharacterSprite";
import { StudentPetSectionHeader } from "./StudentPetSectionHeader";

const EFFECT_LABELS: Record<SlimeEffectKey, string> = {
  growth_speed: "성장 속도",
  reading_reward: "독서 보상",
  walking_reward: "걷기 보상",
  assignment_reward: "과제 제출 보상",
  comment_reward: "댓글 보상",
};

type ShopFilter = "slimes" | "all" | SlimeShopCategory;

const SHOP_CATEGORY_LABELS: Record<ShopFilter, string> = {
  slimes: "슬라임",
  all: "전체",
  background: "배경",
  ride: "탈 것",
  drink: "음료",
};

type SlimeHome = {
  balance: number;
  currency: { unitLabel: string };
  ownedColors: SlimeColor[];
  equippedColors?: SlimeColor[];
  representativeColor?: SlimeColor | null;
  catalog: SlimeDefinition[];
  ownedItemKeys?: string[];
  equippedItemKeys?: string[];
  equippedItemsByColor?: Partial<Record<SlimeColor, string[]>>;
  shopCatalog?: SlimeShopItem[];
  growthSpeedBps?: number;
  growthByColor?: Partial<Record<SlimeColor, SlimeGrowthSnapshotPayload>>;
  growth?: Partial<Record<SlimeColor, SlimeGrowthSnapshotPayload>>;
};

type SlimeGrowthSnapshotPayload = Pick<
  SlimeGrowthSnapshot,
  | "stage"
  | "growthSeconds"
  | "growthRemainderBps"
  | "growthAppliedSpeedBps"
  | "nextStage"
  | "remainingSeconds"
  | "remainingMinutes"
> & {
  growthLastSettledAt?: string | Date;
  lastSettledAt?: string | Date;
  appliedSpeedBps?: number;
};

type Notice = { kind: "success" | "error"; text: string };

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

export function SlimePetPage() {
  const [catalog, setCatalog] = useState<SlimeDefinition[]>([]);
  const [ownedKeys, setOwnedKeys] = useState<SlimeColor[]>([]);
  const [equippedKeys, setEquippedKeys] = useState<SlimeColor[]>([]);
  const [representativeColor, setRepresentativeColor] = useState<SlimeColor | null>(null);
  const [shopCatalog, setShopCatalog] = useState<SlimeShopItem[]>([]);
  const [ownedItemKeys, setOwnedItemKeys] = useState<string[]>([]);
  const [equippedItemKeys, setEquippedItemKeys] = useState<string[]>([]);
  const [equippedItemsByColor, setEquippedItemsByColor] = useState<Partial<Record<SlimeColor, string[]>>>({});
  const [growthByColor, setGrowthByColor] = useState<Partial<Record<SlimeColor, SlimeGrowthSnapshotPayload>>>({});
  const [balance, setBalance] = useState(0);
  const [unitLabel, setUnitLabel] = useState("원");
  const [loading, setLoading] = useState(true);
  const [busyColor, setBusyColor] = useState<SlimeColor | null>(null);
  const [busyEquipColor, setBusyEquipColor] = useState<SlimeColor | null>(null);
  const [busyRepresentative, setBusyRepresentative] = useState<SlimeColor | null>(null);
  const [busyItemKey, setBusyItemKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [shopNotice, setShopNotice] = useState<Notice | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [wardrobeColor, setWardrobeColor] = useState<SlimeColor | null>(null);
  const [shopFilter, setShopFilter] = useState<ShopFilter>("slimes");
  const drawerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const shopCloseRef = useRef<HTMLButtonElement>(null);
  const hadOpenDrawer = useRef(false);
  const slimeRetryKeys = useRef(new Map<SlimeColor, string>());
  const itemRetryKeys = useRef(new Map<string, string>());
  const itemEquipRetryKeys = useRef(new Map<string, string>());

  const effects = useMemo(
    () => calculateCatalogSlimeEffects(equippedKeys, equippedItemKeys),
    [equippedItemKeys, equippedKeys],
  );
  const visibleShopItems = useMemo(
    () =>
      shopFilter === "slimes"
        ? []
        : shopFilter === "all"
        ? shopCatalog
        : shopCatalog.filter((item) => item.category === shopFilter),
    [shopCatalog, shopFilter],
  );
  const drawerItems = wardrobeColor
    ? visibleShopItems.filter((item) => ownedItemKeys.includes(item.key))
    : visibleShopItems;

  useEffect(() => {
    const controller = new AbortController();
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
        setShopCatalog(home.shopCatalog ?? SLIME_SHOP_CATALOG.slice());
        setOwnedItemKeys(home.ownedItemKeys ?? []);
        setEquippedItemKeys(home.equippedItemKeys ?? []);
        setEquippedItemsByColor(home.equippedItemsByColor ?? {});
        setGrowthByColor(home.growthByColor ?? home.growth ?? {});
        setBalance(home.balance);
        setUnitLabel(home.currency.unitLabel || "원");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setNotice({ kind: "error", text: "슬라임 정보를 불러오지 못했어요." });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

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
      if (event.key === "Escape") setShopOpen(false);
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

  const toggleSlime = async (color: SlimeColor, nextEquipped: boolean) => {
    if (busyEquipColor) return;
    setBusyEquipColor(color);
    setNotice(null);
    try {
      const response = await fetch("/api/student/slimes/equip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color, isEquipped: nextEquipped }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        slimeColor?: SlimeColor;
        isEquipped?: boolean;
        equippedColors?: SlimeColor[];
        growthByColor?: Partial<Record<SlimeColor, SlimeGrowthSnapshotPayload>>;
        growth?: Partial<Record<SlimeColor, SlimeGrowthSnapshotPayload>>;
      };
      if (
        !response.ok ||
        payload.slimeColor !== color ||
        payload.isEquipped !== nextEquipped ||
        !Array.isArray(payload.equippedColors)
      ) {
        setNotice({ kind: "error", text: "슬라임 장착 상태를 바꾸지 못했어요." });
        return;
      }
      setEquippedKeys(payload.equippedColors);
      setGrowthByColor(payload.growthByColor ?? payload.growth ?? {});
      setNotice({
        kind: "success",
        text: `${catalog.find((entry) => entry.color === color)?.nameKo ?? "슬라임"}을(를) ${nextEquipped ? "장착" : "해제"}했어요.`,
      });
    } catch {
      setNotice({ kind: "error", text: "네트워크 오류가 발생했어요. 다시 시도해 주세요." });
    } finally {
      setBusyEquipColor(null);
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
    if (busyItemKey || ownedItemKeys.includes(item.key)) return;
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
      setBalance(payload.balance);
      setShopNotice({ kind: "success", text: `${item.labelKo} 구매를 완료했어요.` });
    } catch {
      setShopNotice({
        kind: "error",
        text: "네트워크 오류가 발생했어요. 다시 시도해 주세요.",
      });
    } finally {
      setBusyItemKey(null);
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
                setShopFilter("slimes");
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
      {notice && (
        <p
          className={`${styles.status} ${notice.kind === "error" ? styles.statusError : ""}`}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      )}

      <section className={styles.section} aria-labelledby="slime-selection-title">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="slime-selection-title">펫 선택</h2>
            <p>장착한 펫의 버프가 해당 활동에 적용돼요.</p>
          </div>
          <span className={styles.count}>
            {ownedKeys.length} / {catalog.length} 보유
          </span>
        </div>

        <ul className={styles.slimeGrid} aria-label="슬라임 목록">
          {catalog.length === 0 ? (
            <li className={styles.emptyState}>표시할 슬라임이 없어요.</li>
          ) : catalog.map((slime) => {
            const owned = ownedKeys.includes(slime.key);
            if (!owned) {
              return (
                <li
                  key={slime.key}
                  className={`${styles.slimeItem} ${styles.slimePlaceholder}`}
                  aria-label="빈 슬라임 자리"
                >
                  <div className={styles.placeholderSprite} aria-hidden="true" />
                  <span className={styles.placeholderLabel}>비어 있음</span>
                </li>
              );
            }
            const assignedItems = (equippedItemsByColor[slime.color] ?? [])
              .map((itemKey) => shopCatalog.find((item) => item.key === itemKey))
              .filter((item): item is SlimeShopItem => Boolean(item));
            const growth = growthByColor[slime.color];
            const isEquipped = equippedKeys.includes(slime.color);
            return (
              <li
                key={slime.key}
                className={`${styles.slimeItem} ${owned ? styles.slimeItemSelected : ""}`}
              >
                <span className={styles.ownedChip}>
                  {representativeColor === slime.color ? "대표" : "보유 중"}
                </span>
                <div className={styles.spriteFrame}>
                  <SlimeCharacterSprite
                    slime={slime}
                    items={assignedItems}
                    growthStage={growth?.stage ?? 1}
                  />
                </div>
                <div className={styles.itemCopy}>
                  <h3>{slime.nameKo}</h3>
                  <p>
                    {EFFECT_LABELS[slime.effectKey]} +{formatBpsPercent(slime.baseBuffBps)}
                  </p>
                  {growth ? (
                    <p className={styles.growthSummary} data-testid={`slime-growth-${slime.color}`}>
                      성장 {growth.stage}단계 · {formatSlimeGrowthRemaining(growth.remainingSeconds)}
                    </p>
                  ) : null}
                  <p className={styles.equipmentSummary} aria-live="polite">
                    {assignedItems.length > 0
                      ? `장착: ${assignedItems.map((item) => item.labelKo).join(", ")}`
                      : "장착한 아이템 없음"}
                  </p>
                </div>
                <div className={styles.slimeActions}>
                  <button
                    type="button"
                    className={styles.equipButton}
                    disabled={busyEquipColor !== null}
                    onClick={() => void toggleSlime(slime.color, !isEquipped)}
                    aria-pressed={isEquipped}
                    data-testid={`slime-equip-${slime.color}`}
                  >
                    {busyEquipColor === slime.color ? "처리 중…" : isEquipped ? "장착 해제" : "장착"}
                  </button>
                  {representativeColor !== slime.color ? (
                    <button
                      type="button"
                      className={styles.representativeButton}
                      disabled={busyRepresentative !== null}
                      onClick={() => void setRepresentative(slime.color)}
                    >
                      {busyRepresentative === slime.color ? "지정 중…" : "대표로 지정"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={styles.wardrobeButton}
                    onClick={(event) => {
                      drawerTriggerRef.current = event.currentTarget;
                      setShopNotice(null);
                      setShopFilter("all");
                      setWardrobeColor(slime.color);
                      setShopOpen(true);
                    }}
                    aria-label={`${slime.nameKo} 꾸미기`}
                  >
                    꾸미기
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="slime-breakdown-title">
        <div className={styles.breakdownHeading}>
          <h2 id="slime-breakdown-title">효과 내역</h2>
        </div>
        <ul className={styles.breakdown} aria-live="polite">
          {effects.breakdown.length === 0 ? (
            <li>슬라임을 장착하면 개별 버프가 표시돼요.</li>
          ) : (
            effects.breakdown.map((entry) => (
              <li key={`${entry.source}:${entry.key}`}>
                <span>{entry.label}</span>
                <span>
                  {EFFECT_LABELS[entry.effectKey]} +{formatBpsPercent(entry.bps)}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>

      {shopOpen && (
        <div className={styles.drawerLayer}>
          <div
            className={styles.drawerBackdrop}
            role="presentation"
            aria-hidden="true"
            onClick={(event) => {
              if (event.target === event.currentTarget) closeDrawer();
            }}
          />
          <aside
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-labelledby="slime-drawer-title"
          >
            <div className={styles.drawerHeader}>
              <div>
                <p className={styles.eyebrow}>{wardrobeColor ? "SLIME DRESS UP" : "SLIME SHOP"}</p>
                <h2 id="slime-drawer-title">
                  {wardrobeColor
                    ? `${catalog.find((slime) => slime.color === wardrobeColor)?.nameKo ?? "슬라임"} 꾸미기`
                    : "슬라임 상점"}
                </h2>
                {wardrobeColor ? <p className={styles.drawerSubtitle}>보유한 아이템을 골라 이 슬라임에 적용하세요.</p> : null}
              </div>
              <button
                ref={shopCloseRef}
                type="button"
                className={styles.closeButton}
                onClick={closeDrawer}
                aria-label={wardrobeColor ? "꾸미기 닫기" : "상점 닫기"}
              >
                ×
              </button>
            </div>

            <div className={styles.shopFilters} role="group" aria-label="상점 분류">
              {(Object.keys(SHOP_CATEGORY_LABELS) as ShopFilter[])
                .filter((category) => !wardrobeColor || category !== "slimes")
                .map(
                (category) => (
                  <button
                    key={category}
                    type="button"
                    className={styles.filterButton}
                    aria-pressed={shopFilter === category}
                    onClick={() => setShopFilter(category)}
                  >
                    {SHOP_CATEGORY_LABELS[category]}
                  </button>
                ),
              )}
            </div>

            {shopNotice && (
              <p
                className={`${styles.drawerNotice} ${shopNotice.kind === "error" ? styles.statusError : ""}`}
                role={shopNotice.kind === "error" ? "alert" : "status"}
                aria-live="polite"
              >
                {shopNotice.text}
              </p>
            )}

            {shopFilter === "slimes" && !wardrobeColor ? (
              <ul className={styles.shopList} aria-label="슬라임 상품 목록">
                {catalog.map((slime) => {
                  const owned = ownedKeys.includes(slime.color);
                  const busy = busyColor === slime.color;
                  return (
                    <li key={slime.key} className={styles.shopItem}>
                      <div className={styles.shopImageFrame}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={slime.spritePath} alt={`${slime.nameKo} 미리보기`} width={72} height={72} />
                      </div>
                      <div className={styles.shopItemCopy}>
                        <h3>{slime.nameKo}</h3>
                        <p>{EFFECT_LABELS[slime.effectKey]} +{formatBpsPercent(slime.baseBuffBps)}</p>
                        <strong>{slime.price.toLocaleString("ko-KR")}{unitLabel}</strong>
                      </div>
                      {owned ? (
                        <div className={styles.shopItemActions}>
                          <span className={styles.shopOwnedChip}>보유 중</span>
                          <button
                            type="button"
                            className={styles.refundButton}
                            disabled={busyColor !== null}
                            onClick={() => void refundSlimePurchase(slime)}
                            aria-label={`${slime.nameKo} 환불`}
                          >
                            {busy ? "환불 중…" : "환불"}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className={styles.shopBuyButton}
                          disabled={busyColor !== null}
                          onClick={() => void purchase(slime.color)}
                          aria-label={`${slime.nameKo} 구매`}
                        >
                          {busy ? "구매 중…" : "구매"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className={styles.shopList} aria-label="상점 상품 목록">
              {drawerItems.length === 0 ? (
                <li className={styles.emptyState}>{wardrobeColor ? "이 분류에 보유한 아이템이 없어요. 상점에서 먼저 구매해 주세요." : "이 분류에는 상품이 없어요."}</li>
              ) : drawerItems.map((item) => {
                const owned = ownedItemKeys.includes(item.key);
                const equipped = wardrobeColor
                  ? (equippedItemsByColor[wardrobeColor] ?? []).includes(item.key)
                  : equippedItemKeys.includes(item.key);
                const busy = busyItemKey === item.key;
                return (
                  <li key={item.key} className={styles.shopItem}>
                    <div className={styles.shopImageFrame}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.spritePath} alt={`${item.labelKo} 미리보기`} width={72} height={72} />
                    </div>
                    <div className={styles.shopItemCopy}>
                      <h3>{item.labelKo}</h3>
                      <p>{SHOP_CATEGORY_LABELS[item.category]}</p>
                      <strong>{item.price.toLocaleString("ko-KR")}{unitLabel}</strong>
                    </div>
                    {!wardrobeColor && owned ? (
                      <div className={styles.shopItemActions}>
                        <span className={styles.shopOwnedChip}>보유 중</span>
                        <button
                          type="button"
                          className={styles.refundButton}
                          disabled={busyItemKey !== null}
                          onClick={() => void refundShopItem(item)}
                          aria-label={`${item.labelKo} 환불`}
                        >
                          {busy ? "환불 중…" : "환불"}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={`${styles.shopBuyButton} ${equipped ? styles.shopBuyButtonRemove : ""}`}
                        disabled={busyItemKey !== null}
                        onClick={() => wardrobeColor
                          ? void equipShopItem(wardrobeColor, item, !equipped)
                          : void purchaseShopItem(item)}
                        aria-pressed={wardrobeColor ? equipped : undefined}
                        aria-label={`${item.labelKo} ${wardrobeColor ? (equipped ? "해제" : "적용") : "구매"}`}
                      >
                        <span className={styles.spriteSlot} aria-hidden="true">
                          {busy ? "…" : wardrobeColor && equipped ? "✓" : "+"}
                        </span>
                        <span className={styles.buttonLabel}>
                          {busy
                            ? wardrobeColor ? "적용 중…" : "구매 중…"
                            : wardrobeColor
                              ? equipped ? "해제" : "적용"
                              : "구매"}
                        </span>
                      </button>
                    )}
                  </li>
                );
              })}
              </ul>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
