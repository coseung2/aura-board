"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { SLIME_SHOP_CATALOG } from "@/lib/pets/catalog";
import { calculateSlimeEffects, formatBpsPercent } from "@/lib/pets/math";
import type {
  SlimeColor,
  SlimeDefinition,
  SlimeEffectKey,
  SlimeShopCategory,
  SlimeShopItem,
} from "@/lib/pets/types";

import styles from "./SlimePetPage.module.css";

const EFFECT_LABELS: Record<SlimeEffectKey, string> = {
  growth_speed: "성장 속도",
  reading_reward: "독서 보상",
  walking_reward: "걷기 보상",
  assignment_reward: "과제 제출 보상",
  comment_reward: "댓글 보상",
};

const SHOP_CATEGORY_LABELS: Record<"all" | SlimeShopCategory, string> = {
  all: "전체",
  background: "배경",
  ride: "탈 것",
  drink: "음료",
};

type SlimeHome = {
  balance: number;
  currency: { unitLabel: string };
  ownedColors: SlimeColor[];
  catalog: SlimeDefinition[];
  ownedItemKeys?: string[];
  shopCatalog?: SlimeShopItem[];
};

type Notice = { kind: "success" | "error"; text: string };

const PURCHASE_ERROR: Record<string, string> = {
  insufficient_funds: "잔액이 부족해요.",
  already_owned: "이미 보유한 상품이에요.",
  unknown_item: "상품을 찾을 수 없어요.",
  idempotency_key_reused: "같은 구매 요청이 다른 상품에 사용됐어요. 다시 시도해 주세요.",
  account_not_found: "학생 지갑을 찾을 수 없어요.",
  unauthenticated: "로그인이 만료됐어요. 다시 로그인해 주세요.",
};

function newIdempotencyKey(prefix: string, key: string): string {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}-${key}-${uuid}`;
}

export function SlimePetPage() {
  const [catalog, setCatalog] = useState<SlimeDefinition[]>([]);
  const [ownedKeys, setOwnedKeys] = useState<SlimeColor[]>([]);
  const [shopCatalog, setShopCatalog] = useState<SlimeShopItem[]>([]);
  const [ownedItemKeys, setOwnedItemKeys] = useState<string[]>([]);
  const [balance, setBalance] = useState(0);
  const [unitLabel, setUnitLabel] = useState("원");
  const [loading, setLoading] = useState(true);
  const [busyColor, setBusyColor] = useState<SlimeColor | null>(null);
  const [busyItemKey, setBusyItemKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [shopNotice, setShopNotice] = useState<Notice | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [shopFilter, setShopFilter] = useState<"all" | SlimeShopCategory>("all");
  const shopTriggerRef = useRef<HTMLButtonElement>(null);
  const shopCloseRef = useRef<HTMLButtonElement>(null);
  const hadOpenDrawer = useRef(false);
  const slimeRetryKeys = useRef(new Map<SlimeColor, string>());
  const itemRetryKeys = useRef(new Map<string, string>());

  const effects = useMemo(
    () => calculateSlimeEffects(catalog.filter((slime) => ownedKeys.includes(slime.color))),
    [catalog, ownedKeys],
  );
  const visibleShopItems = useMemo(
    () =>
      shopFilter === "all"
        ? shopCatalog
        : shopCatalog.filter((item) => item.category === shopFilter),
    [shopCatalog, shopFilter],
  );

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
        setShopCatalog(home.shopCatalog ?? SLIME_SHOP_CATALOG.slice());
        setOwnedItemKeys(home.ownedItemKeys ?? []);
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

  useEffect(() => {
    if (!shopOpen) {
      if (hadOpenDrawer.current) {
        hadOpenDrawer.current = false;
        shopTriggerRef.current?.focus();
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
    setNotice(null);
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
        setNotice({
          kind: "error",
          text: PURCHASE_ERROR[payload.error ?? ""] ?? "구매하지 못했어요. 다시 시도해 주세요.",
        });
        return;
      }
      slimeRetryKeys.current.delete(color);
      setOwnedKeys((current) =>
        current.includes(payload.ownedColor!) ? current : [...current, payload.ownedColor!],
      );
      setBalance(payload.balance);
      const name = catalog.find((slime) => slime.color === payload.ownedColor)?.nameKo ?? "슬라임";
      setNotice({ kind: "success", text: `${name} 구매를 완료했어요.` });
    } catch {
      setNotice({ kind: "error", text: "네트워크 오류가 발생했어요. 다시 시도해 주세요." });
    } finally {
      setBusyColor(null);
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

  return (
    <main className={styles.page} data-testid="slime-pet-page">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>SLIME PET</p>
          <h1 className={styles.title}>나의 슬라임</h1>
          <p className={styles.subtitle}>
            슬라임을 모으고 각 슬라임의 개별 버프를 확인해 보세요.
          </p>
        </div>
        <div className={styles.walletActions}>
          <div className={styles.walletSummary} aria-live="polite">
            <span className={styles.walletLabel}>내 지갑</span>
            <strong data-testid="slime-wallet-balance">
              {balance.toLocaleString("ko-KR")} {unitLabel}
            </strong>
          </div>
          <button
            ref={shopTriggerRef}
            type="button"
            className={styles.shopTrigger}
            onClick={() => {
              setShopNotice(null);
              setShopOpen(true);
            }}
            aria-haspopup="dialog"
            aria-expanded={shopOpen}
          >
            <span className={styles.spriteSlot} aria-hidden="true">🛍</span>
            <span className={styles.buttonLabel}>상점</span>
          </button>
        </div>
      </header>

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
            <h2 id="slime-selection-title">슬라임 선택</h2>
            <p>보유한 슬라임의 버프가 해당 활동에 적용돼요.</p>
          </div>
          <span className={styles.count}>
            {ownedKeys.length} / {catalog.length} 보유
          </span>
        </div>

        <ul className={styles.slimeGrid} aria-label="슬라임 목록">
          {catalog.map((slime) => {
            const owned = ownedKeys.includes(slime.key);
            const busy = busyColor === slime.key;
            return (
              <li
                key={slime.key}
                className={`${styles.slimeItem} ${owned ? styles.slimeItemSelected : ""}`}
              >
                <div className={styles.spriteFrame}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={slime.spritePath}
                    alt={`${slime.nameKo} 미리보기`}
                    loading="lazy"
                    width={88}
                    height={88}
                  />
                </div>
                <div className={styles.itemCopy}>
                  <h3>{slime.nameKo}</h3>
                  <p>
                    {EFFECT_LABELS[slime.effectKey]} +{formatBpsPercent(slime.baseBuffBps)}
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.actionButton}
                  aria-pressed={owned}
                  disabled={owned || busyColor !== null}
                  onClick={() => void purchase(slime.key)}
                >
                  <span className={styles.spriteSlot} aria-hidden="true">
                    {owned ? "✓" : busy ? "…" : "+"}
                  </span>
                  <span className={styles.buttonLabel}>
                    {owned
                      ? "보유 중"
                      : busy
                        ? "구매 중…"
                        : `${slime.price.toLocaleString("ko-KR")}${unitLabel} 구매`}
                  </span>
                </button>
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
            <li>슬라임을 보유하면 개별 버프가 표시돼요.</li>
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
              if (event.target === event.currentTarget) setShopOpen(false);
            }}
          />
          <aside
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-labelledby="slime-shop-title"
          >
            <div className={styles.drawerHeader}>
              <div>
                <p className={styles.eyebrow}>SLIME SHOP</p>
                <h2 id="slime-shop-title">슬라임 상점</h2>
              </div>
              <button
                ref={shopCloseRef}
                type="button"
                className={styles.closeButton}
                onClick={() => setShopOpen(false)}
                aria-label="상점 닫기"
              >
                ×
              </button>
            </div>

            <div className={styles.shopFilters} role="group" aria-label="상점 분류">
              {(Object.keys(SHOP_CATEGORY_LABELS) as Array<"all" | SlimeShopCategory>).map(
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

            <ul className={styles.shopList} aria-label="상점 상품 목록">
              {visibleShopItems.map((item) => {
                const owned = ownedItemKeys.includes(item.key);
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
                      <strong>{item.price.toLocaleString("ko-KR")}원</strong>
                    </div>
                    <button
                      type="button"
                      className={styles.shopBuyButton}
                      disabled={owned || busyItemKey !== null}
                      onClick={() => void purchaseShopItem(item)}
                      aria-label={`${item.labelKo} ${owned ? "보유 중" : "구매"}`}
                    >
                      <span className={styles.spriteSlot} aria-hidden="true">
                        {owned ? "✓" : busy ? "…" : "+"}
                      </span>
                      <span className={styles.buttonLabel}>
                        {owned ? "보유 중" : busy ? "구매 중…" : "구매"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>
      )}
    </main>
  );
}
