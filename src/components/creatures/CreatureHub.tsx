"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { CreatureSprite, type CreatureSpriteBehavior } from "./CreatureSprite";
import styles from "./CreatureHub.module.css";

type Stage = "egg" | "hatchling" | "juvenile" | "evolved";
type Behavior = CreatureSpriteBehavior;
type TabId = "exhibition" | "shop" | "fitting" | "collection";
type ProductKind =
  | "random-egg"
  | "affinity-egg"
  | "food"
  | "hatch-accelerator"
  | "background-effect";
type ShopFilter = "all" | "egg" | "food" | "accelerator" | "background";

type Creature = {
  id: string;
  lineKey: string;
  nameKo: string | null;
  affinity: string | null;
  stage: Stage;
  isActive: boolean;
  isFeatured: boolean;
  progressPoints: number;
  nextThreshold: number | null;
  behaviorSheetPath: string | null;
};

type Product = {
  key: string;
  kind: ProductKind;
  labelKo: string;
  descriptionKo: string;
  price: number;
  effect: unknown;
  visible: boolean;
};

type InventoryItem = {
  id: string;
  itemKey: string;
  itemKind: ProductKind | string;
  quantity: number;
  isEquipped: boolean;
  product: Product | null;
};

type HomeSnapshot = {
  active: Creature | null;
  featured: Creature | null;
  collection: Creature[];
  balance: number;
  currency: { unitLabel: string };
  items: InventoryItem[];
  equippedBackground: InventoryItem | null;
};

type BehaviorEntry = {
  kind: Behavior;
  actionId: string;
  labelKo: string;
  descriptionKo: string;
};

type CatalogStage = {
  stage: Stage;
  packageId: string;
  behaviorSheetId: string;
  behaviorSheetPath: string;
  behaviors: BehaviorEntry[];
};

type CatalogLine = {
  key: string;
  affinity: string;
  nameKo: string;
  visualConcept: string;
  stages: CatalogStage[];
};

type CatalogSnapshot = {
  lines: CatalogLine[];
  products: Product[];
};

type PendingPurchase = {
  product: Product;
  quantity: number;
  idempotencyKey: string;
};
type Notice = { kind: "success" | "error"; text: string };

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "exhibition", label: "내 펫", icon: "✦" },
  { id: "shop", label: "상점", icon: "🛍" },
  { id: "fitting", label: "피팅룸", icon: "✧" },
  { id: "collection", label: "도감", icon: "▦" },
];

const STAGES: Stage[] = ["egg", "hatchling", "juvenile", "evolved"];
const PET_STAGES: Stage[] = ["hatchling", "juvenile", "evolved"];
const STAGE_THRESHOLDS: Record<Stage, number> = {
  egg: 0,
  hatchling: 3,
  juvenile: 8,
  evolved: 15,
};
const STAGE_LABELS: Record<Stage, string> = {
  egg: "알",
  hatchling: "부화",
  juvenile: "성장",
  evolved: "진화",
};
const BEHAVIOR_LABELS: Record<Behavior, string> = {
  normal: "산책",
  lazy: "느긋",
  signature: "고유 행동",
};
const BEHAVIOR_DESCRIPTIONS: Record<Behavior, string> = {
  normal: "교실을 천천히 둘러봐요.",
  lazy: "포근한 자리에서 쉬어요.",
  signature: "자신만의 반짝임을 보여줘요.",
};
const AFFINITY_LABELS: Record<string, string> = {
  earth: "대지",
  river: "강",
  sea: "바다",
  volcano: "화산",
  sky: "하늘",
  darkness: "어둠",
  light: "빛",
};
const LINE_LABELS: Record<string, string> = {
  terramote: "테라모트",
  ripplekin: "리플킨",
  tidalume: "타이달룸",
  cinderhorn: "신더혼",
  cloudwhisp: "클라우드위스프",
  nocturnib: "녹터니브",
  dawnlet: "던릿",
};
const PRODUCT_LABELS: Record<string, string> = {
  "egg-random-01": "무작위 알",
  "egg-earth-01": "대지 알",
  "egg-river-01": "강 알",
  "egg-sea-01": "바다 알",
  "egg-volcano-01": "화산 알",
  "egg-sky-01": "하늘 알",
  "egg-darkness-01": "어둠 알",
  "egg-light-01": "빛 알",
  "food-dew-01": "이슬 간식",
  "food-sprout-01": "새싹 쿠키",
  "food-rainbow-01": "무지개 젤리",
  "accelerator-warmth-01": "따뜻한 부화 촉진제",
  "accelerator-spark-01": "성장 불씨",
  "background-earth-01": "대지 이끼 빛",
  "background-river-01": "강물 반짝임",
  "background-sea-01": "바다 거품",
  "background-volcano-01": "화산 불씨",
  "background-sky-01": "하늘 구름길",
  "background-darkness-01": "한밤중 별",
  "background-light-01": "새벽 오라",
};

export const CREATURE_BACKGROUND_EFFECT_KEYS = [
  "ground-moss-glow",
  "river-ripples",
  "sea-foam",
  "volcanic-embers",
  "sky-cloud-trail",
  "midnight-stars",
  "dawn-aura",
] as const;

export type CreatureBackgroundEffectKey =
  (typeof CREATURE_BACKGROUND_EFFECT_KEYS)[number];

const BACKGROUND_EFFECT_FALLBACKS: Record<string, CreatureBackgroundEffectKey> =
  {
    "background-earth-01": "ground-moss-glow",
    "background-river-01": "river-ripples",
    "background-sea-01": "sea-foam",
    "background-volcano-01": "volcanic-embers",
    "background-sky-01": "sky-cloud-trail",
    "background-darkness-01": "midnight-stars",
    "background-light-01": "dawn-aura",
  };

function isCreatureBackgroundEffectKey(
  value: unknown,
): value is CreatureBackgroundEffectKey {
  return (
    typeof value === "string" &&
    (CREATURE_BACKGROUND_EFFECT_KEYS as readonly string[]).includes(value)
  );
}

export function resolveBackgroundEffectKey(
  product: { effect?: unknown } | null | undefined,
  itemKey?: string,
): CreatureBackgroundEffectKey | null {
  const effectKey = record(product?.effect).effectKey;
  if (isCreatureBackgroundEffectKey(effectKey)) return effectKey;

  return BACKGROUND_EFFECT_FALLBACKS[itemKey ?? ""] ?? null;
}

const PRODUCT_DESCRIPTIONS: Record<string, string> = {
  "egg-random-01": "아직 만나지 못한 펫을 무작위로 만나요.",
  "egg-earth-01": "대지의 기운을 품은 알이에요.",
  "egg-river-01": "맑은 강의 기운을 품은 알이에요.",
  "egg-sea-01": "반짝이는 바다의 기운을 품은 알이에요.",
  "egg-volcano-01": "따뜻한 화산의 기운을 품은 알이에요.",
  "egg-sky-01": "가벼운 하늘의 기운을 품은 알이에요.",
  "egg-darkness-01": "고요한 어둠의 기운을 품은 알이에요.",
  "egg-light-01": "따뜻한 빛의 기운을 품은 알이에요.",
  "food-dew-01": "성장 포인트 1을 채워요.",
  "food-sprout-01": "성장 포인트 2를 채워요.",
  "food-rainbow-01": "성장 포인트 4를 채워요.",
  "accelerator-warmth-01": "알의 성장 포인트 2를 채워요.",
  "accelerator-spark-01": "알의 성장 포인트 3을 채워요.",
};
const PRODUCT_ICONS: Record<ProductKind, string> = {
  "random-egg": "🥚",
  "affinity-egg": "🥚",
  food: "🍪",
  "hatch-accelerator": "⚡",
  "background-effect": "🌈",
};
const FILTERS: { id: ShopFilter; label: string; kinds?: ProductKind[] }[] = [
  { id: "all", label: "전체" },
  { id: "egg", label: "알", kinds: ["random-egg", "affinity-egg"] },
  { id: "food", label: "먹이", kinds: ["food"] },
  { id: "accelerator", label: "부화 촉진", kinds: ["hatch-accelerator"] },
  { id: "background", label: "배경 효과", kinds: ["background-effect"] },
];
const ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: "로그인이 만료됐어요. 다시 로그인해 주세요.",
  insufficient_funds: "잔액이 부족해요.",
  active_creature_exists: "이미 성장 중인 펫이 있어요. 먼저 함께 키워 주세요.",
  no_active_creature: "성장 중인 펫이 없어요.",
  item_not_applicable: "지금 단계에서는 사용할 수 없는 아이템이에요.",
  item_unavailable: "보유 수량이 없어요. 상점에서 먼저 구매해 주세요.",
  creature_not_hatched: "알은 부화한 뒤 대표 펫으로 선택할 수 있어요.",
  featured_conflict: "대표 펫 선택이 겹쳤어요. 다시 선택해 주세요.",
  not_found: "선택한 펫을 찾을 수 없어요.",
  not_owned: "아직 보유하지 않은 아이템이에요.",
  invalid_body: "요청을 다시 확인해 주세요.",
  unknown_product: "상품을 찾을 수 없어요.",
};

class CreatureRequestError extends Error {
  code: string;
  status: number;

  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stageValue(value: unknown): Stage {
  return STAGES.includes(value as Stage) ? (value as Stage) : "egg";
}

function behaviorValue(value: unknown): Behavior {
  return value === "lazy" || value === "signature" ? value : "normal";
}

function normalizeProduct(value: unknown): Product | null {
  const item = record(value);
  const kind = item.kind;
  if (
    kind !== "random-egg" &&
    kind !== "affinity-egg" &&
    kind !== "food" &&
    kind !== "hatch-accelerator" &&
    kind !== "background-effect"
  ) {
    return null;
  }
  const key = stringValue(item.key);
  if (!key) return null;
  return {
    key,
    kind,
    labelKo: stringValue(item.labelKo, key),
    descriptionKo: stringValue(item.descriptionKo),
    price: numberValue(item.price),
    effect: item.effect,
    visible: item.visible !== false,
  };
}

function normalizeCreature(value: unknown): Creature | null {
  if (!value || typeof value !== "object") return null;
  const item = record(value);
  const lineKey = stringValue(item.lineKey);
  if (!lineKey) return null;
  return {
    id: stringValue(item.id, lineKey),
    lineKey,
    nameKo: typeof item.nameKo === "string" ? item.nameKo : null,
    affinity: typeof item.affinity === "string" ? item.affinity : null,
    stage: stageValue(item.stage),
    isActive: item.isActive === true,
    isFeatured: item.isFeatured === true,
    progressPoints: numberValue(item.progressPoints),
    nextThreshold:
      typeof item.nextThreshold === "number" ? item.nextThreshold : null,
    behaviorSheetPath:
      typeof item.behaviorSheetPath === "string"
        ? item.behaviorSheetPath
        : null,
  };
}

function normalizeInventory(value: unknown): InventoryItem | null {
  const item = record(value);
  const itemKey = stringValue(item.itemKey);
  if (!itemKey) return null;
  const product = normalizeProduct(item.product);
  return {
    id: stringValue(item.id, itemKey),
    itemKey,
    itemKind: stringValue(item.itemKind),
    quantity: Math.max(0, Math.floor(numberValue(item.quantity))),
    isEquipped: item.isEquipped === true,
    product,
  };
}

function normalizeHome(value: unknown): HomeSnapshot {
  const item = record(value);
  const active = normalizeCreature(item.active);
  const featured = normalizeCreature(item.featured);
  const collection = Array.isArray(item.collection)
    ? item.collection
        .map(normalizeCreature)
        .filter((entry): entry is Creature => entry !== null)
    : [];
  const items = Array.isArray(item.items)
    ? item.items
        .map(normalizeInventory)
        .filter((entry): entry is InventoryItem => entry !== null)
    : [];
  const equippedBackground = normalizeInventory(item.equippedBackground);
  const currency = record(item.currency);
  return {
    active,
    featured,
    collection,
    balance: Math.max(0, Math.floor(numberValue(item.balance))),
    currency: { unitLabel: stringValue(currency.unitLabel, "원") },
    items,
    equippedBackground,
  };
}

function normalizeCatalog(value: unknown): CatalogSnapshot {
  const source = record(value);
  const lines = Array.isArray(source.lines)
    ? source.lines
        .map((raw) => {
          const line = record(raw);
          const stages = Array.isArray(line.stages)
            ? line.stages.map((rawStage) => {
                const stage = record(rawStage);
                const behaviors = Array.isArray(stage.behaviors)
                  ? stage.behaviors.map((rawBehavior) => {
                      const behavior = record(rawBehavior);
                      const kind = behaviorValue(behavior.kind);
                      return {
                        kind,
                        actionId: stringValue(behavior.actionId, kind),
                        labelKo: stringValue(
                          behavior.labelKo,
                          BEHAVIOR_LABELS[kind],
                        ),
                        descriptionKo: stringValue(
                          behavior.descriptionKo,
                          BEHAVIOR_DESCRIPTIONS[kind],
                        ),
                      };
                    })
                  : [];
                return {
                  stage: stageValue(stage.stage),
                  packageId: stringValue(stage.packageId),
                  behaviorSheetId: stringValue(stage.behaviorSheetId),
                  behaviorSheetPath: stringValue(stage.behaviorSheetPath),
                  behaviors,
                };
              })
            : [];
          const key = stringValue(line.key);
          if (!key) return null;
          return {
            key,
            affinity: stringValue(line.affinity),
            nameKo: stringValue(line.nameKo, key),
            visualConcept: stringValue(line.visualConcept),
            stages,
          };
        })
        .filter((line): line is CatalogLine => line !== null)
    : [];
  const products = Array.isArray(source.products)
    ? source.products
        .map(normalizeProduct)
        .filter((product): product is Product => product !== null)
    : [];
  return { lines, products };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code =
      typeof body?.error === "string" ? body.error : `http_${response.status}`;
    if (response.status === 401) {
      window.setTimeout(
        () => window.location.assign("/login?from=/student/aura-pet"),
        250,
      );
    }
    throw new CreatureRequestError(code, response.status);
  }
  return body as T;
}

function idempotencyKey(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${uuid ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function displayLineName(lineKey: string, sourceName?: string | null): string {
  return LINE_LABELS[lineKey] ?? sourceName ?? lineKey;
}

function displayAffinity(affinity?: string | null): string {
  return affinity ? (AFFINITY_LABELS[affinity] ?? affinity) : "미정";
}

function displayProductName(
  product: Product | null | undefined,
  itemKey?: string,
): string {
  if (itemKey && PRODUCT_LABELS[itemKey]) return PRODUCT_LABELS[itemKey];
  if (product?.key && PRODUCT_LABELS[product.key])
    return PRODUCT_LABELS[product.key];
  return product?.labelKo || itemKey || "아이템";
}

function displayProductDescription(product: Product): string {
  return (
    PRODUCT_DESCRIPTIONS[product.key] ??
    (product.descriptionKo || "펫과 함께 사용할 수 있는 아이템이에요.")
  );
}

function currentStageIndex(stage: Stage): number {
  return STAGES.indexOf(stage);
}

function progressPercent(creature: Creature): number {
  if (creature.stage === "evolved") return 100;
  const current = STAGE_THRESHOLDS[creature.stage];
  const next =
    creature.nextThreshold ??
    STAGE_THRESHOLDS[STAGES[currentStageIndex(creature.stage) + 1]];
  if (!Number.isFinite(next) || next <= current) return 0;
  return Math.min(
    100,
    Math.max(0, ((creature.progressPoints - current) / (next - current)) * 100),
  );
}

function actionError(error: unknown): string {
  if (error instanceof CreatureRequestError)
    return ERROR_MESSAGES[error.code] ?? "잠시 후 다시 시도해 주세요.";
  return "네트워크가 잠시 불안정해요. 다시 시도해 주세요.";
}

function isRetryableMutationError(error: unknown): boolean {
  return !(error instanceof CreatureRequestError) || error.status >= 500;
}

function behaviorCopy(
  stageDefinition: CatalogStage | undefined,
  kind: Behavior,
): BehaviorEntry {
  const entry = stageDefinition?.behaviors.find(
    (candidate) => candidate.kind === kind,
  );
  return {
    kind,
    actionId: entry?.actionId ?? kind,
    labelKo: entry?.labelKo ?? BEHAVIOR_LABELS[kind],
    descriptionKo: entry?.descriptionKo ?? BEHAVIOR_DESCRIPTIONS[kind],
  };
}

export function CreatureHub() {
  const [tab, setTab] = useState<TabId>("exhibition");
  const [home, setHome] = useState<HomeSnapshot | null>(null);
  const [catalog, setCatalog] = useState<CatalogSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [behavior, setBehavior] = useState<Behavior>("normal");
  const [shopFilter, setShopFilter] = useState<ShopFilter>("all");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [pendingPurchase, setPendingPurchase] =
    useState<PendingPurchase | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement>>>({});
  const noticeTimerRef = useRef<number | null>(null);
  const useIdempotencyKeysRef = useRef(new Map<string, string>());
  const purchaseRetryKeysRef = useRef(new Map<string, string>());
  const purchaseTriggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const wasPurchaseDialogOpenRef = useRef(false);

  const loadHome = useCallback(async () => {
    const response = await requestJson<unknown>("/api/student/creatures");
    setHome(normalizeHome(response));
  }, []);

  const loadData = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setLoadError(null);
    try {
      const [homeResponse, catalogResponse] = await Promise.all([
        requestJson<unknown>("/api/student/creatures"),
        requestJson<unknown>("/api/student/creatures/catalog"),
      ]);
      setHome(normalizeHome(homeResponse));
      setCatalog(normalizeCatalog(catalogResponse));
    } catch (error) {
      setLoadError(actionError(error));
    } finally {
      if (initial) setLoading(false);
      else setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData(true);
  }, [loadData]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!pendingPurchase) {
      if (wasPurchaseDialogOpenRef.current) {
        wasPurchaseDialogOpenRef.current = false;
        purchaseTriggerRef.current?.focus();
      }
      return;
    }

    wasPurchaseDialogOpenRef.current = true;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
    const firstFocusable = focusable()[0];
    if (firstFocusable) firstFocusable.focus();
    else if (!dialog.contains(document.activeElement)) dialog.focus();

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        if (busyKey === null) {
          event.preventDefault();
          setPendingPurchase(null);
        }
        return;
      }
      if (event.key !== "Tab") return;

      const elements = focusable();
      if (elements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busyKey, pendingPurchase]);

  const refreshHome = useCallback(async () => {
    await loadHome();
  }, [loadHome]);

  const onTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    current: TabId,
  ) => {
    const index = TABS.findIndex((entry) => entry.id === current);
    let nextIndex = -1;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % TABS.length;
    if (event.key === "ArrowLeft")
      nextIndex = (index - 1 + TABS.length) % TABS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = TABS.length - 1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const next = TABS[nextIndex].id;
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const setAction = (nextNotice: Notice) => {
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
    }
    setNotice(nextNotice);
    noticeTimerRef.current = window.setTimeout(() => {
      noticeTimerRef.current = null;
      setNotice(null);
    }, 5000);
  };

  const refreshAfterMutation = async (
    refreshNotice: string,
  ): Promise<boolean> => {
    try {
      await refreshHome();
      return true;
    } catch {
      setAction({ kind: "success", text: refreshNotice });
      return false;
    }
  };

  const askPurchase = (
    product: Product,
    quantity: number,
    trigger?: HTMLButtonElement,
  ) => {
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
    setNotice(null);
    purchaseTriggerRef.current = trigger ?? null;
    const purchaseIntentKey = `${product.key}:${quantity}`;
    setPendingPurchase({
      product,
      quantity,
      idempotencyKey:
        purchaseRetryKeysRef.current.get(purchaseIntentKey) ??
        idempotencyKey(`purchase-${product.key}`),
    });
  };

  const confirmPurchase = async () => {
    if (!pendingPurchase || !home) return;
    const { product, quantity, idempotencyKey: purchaseKey } = pendingPurchase;
    const purchaseIntentKey = `${product.key}:${quantity}`;
    setBusyKey(product.key);
    let keepPurchaseOpen = false;
    try {
      if (product.kind === "random-egg" || product.kind === "affinity-egg") {
        await requestJson("/api/student/creatures/purchase", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "egg",
            productKey: product.key,
            idempotencyKey: purchaseKey,
          }),
        });
      } else {
        await requestJson("/api/student/creatures/items/purchase", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            productKey: product.key,
            quantity,
            idempotencyKey: purchaseKey,
          }),
        });
      }
      purchaseRetryKeysRef.current.delete(purchaseIntentKey);
      const refreshed = await refreshAfterMutation(
        `${displayProductName(product)}${quantity > 1 ? ` ${quantity}개` : ""} 구매가 완료됐어요. 화면을 새로고침해 잔액과 보유 수량을 확인해 주세요.`,
      );
      if (!refreshed) return;
      setAction({
        kind: "success",
        text: `${displayProductName(product)}${quantity > 1 ? ` ${quantity}개` : ""} 구매가 완료됐어요.`,
      });
    } catch (error) {
      keepPurchaseOpen = isRetryableMutationError(error);
      if (keepPurchaseOpen) {
        purchaseRetryKeysRef.current.set(purchaseIntentKey, purchaseKey);
      } else {
        purchaseRetryKeysRef.current.delete(purchaseIntentKey);
      }
      setAction({ kind: "error", text: actionError(error) });
    } finally {
      setBusyKey(null);
      if (!keepPurchaseOpen) setPendingPurchase(null);
    }
  };

  const useItem = async (item: InventoryItem) => {
    if (busyKey || !home?.active) return;
    const useKey =
      useIdempotencyKeysRef.current.get(item.itemKey) ??
      idempotencyKey(`use-${item.itemKey}`);
    useIdempotencyKeysRef.current.set(item.itemKey, useKey);
    setBusyKey(item.itemKey);
    try {
      await requestJson("/api/student/creatures/use", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemKey: item.itemKey, idempotencyKey: useKey }),
      });
      useIdempotencyKeysRef.current.delete(item.itemKey);
      const refreshed = await refreshAfterMutation(
        `${displayProductName(item.product, item.itemKey)}을 사용했어요. 화면을 새로고침해 보유 수량과 성장 상태를 확인해 주세요.`,
      );
      if (!refreshed) return;
      setAction({
        kind: "success",
        text: `${displayProductName(item.product, item.itemKey)}을(를) 사용했어요.`,
      });
    } catch (error) {
      if (!isRetryableMutationError(error))
        useIdempotencyKeysRef.current.delete(item.itemKey);
      setAction({ kind: "error", text: actionError(error) });
    } finally {
      setBusyKey(null);
    }
  };

  const equipBackground = async (itemKey: string | null) => {
    if (busyKey) return;
    setBusyKey(itemKey ?? "background-none");
    try {
      await requestJson("/api/student/creatures/equip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemKey }),
      });
      const refreshed = await refreshAfterMutation(
        itemKey
          ? "전시 배경을 장착했어요. 화면을 새로고침해 적용 상태를 확인해 주세요."
          : "전시 배경을 해제했어요. 화면을 새로고침해 적용 상태를 확인해 주세요.",
      );
      if (!refreshed) return;
      setAction({
        kind: "success",
        text: itemKey ? "전시 배경을 장착했어요." : "전시 배경을 해제했어요.",
      });
    } catch (error) {
      setAction({ kind: "error", text: actionError(error) });
    } finally {
      setBusyKey(null);
    }
  };

  const featureCreature = async (creatureId: string) => {
    if (busyKey || !creatureId || home?.featured?.id === creatureId) return;
    setBusyKey("feature-creature");
    try {
      await requestJson("/api/student/creatures/feature", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ creatureId }),
      });
      const refreshed = await refreshAfterMutation(
        "대표 펫을 바꿨어요. 화면을 새로고침해 선택 상태를 확인해 주세요.",
      );
      if (!refreshed) return;
      setAction({ kind: "success", text: "대표 펫을 바꿨어요." });
    } catch (error) {
      setAction({ kind: "error", text: actionError(error) });
    } finally {
      setBusyKey(null);
    }
  };

  const visibleProducts = useMemo(() => {
    if (!catalog) return [];
    const filter = FILTERS.find((entry) => entry.id === shopFilter);
    return catalog.products.filter(
      (product) =>
        product.visible &&
        (!filter?.kinds || filter.kinds.includes(product.kind)),
    );
  }, [catalog, shopFilter]);

  const updateQuantity = (key: string, delta: number) => {
    setQuantities((current) => ({
      ...current,
      [key]: Math.min(9, Math.max(1, (current[key] ?? 1) + delta)),
    }));
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.inner}>
          <div className={styles.intro}>
            <div>
              <p className={styles.eyebrow}>CREATURE HUB</p>
              <h1 className={styles.title}>나의 펫</h1>
              <p className={styles.subtitle}>
                펫과 성장 기록을 준비하고 있어요.
              </p>
            </div>
          </div>
          <div className={styles.loadingCard} aria-live="polite">
            <div className={styles.emptyIcon} aria-hidden="true">
              ✦
            </div>
            <h3>펫 공간을 여는 중…</h3>
            <div className={`${styles.skeleton} ${styles.skeletonShort}`} />
          </div>
        </div>
      </div>
    );
  }

  if (loadError || !home || !catalog) {
    return (
      <div className={styles.page}>
        <div className={styles.inner}>
          <div className={styles.errorCard} role="alert">
            <div className={styles.emptyIcon} aria-hidden="true">
              !
            </div>
            <h3>펫 정보를 불러오지 못했어요</h3>
            <p>{loadError ?? "잠시 후 다시 시도해 주세요."}</p>
            <button
              type="button"
              className={`${styles.button} ${styles.primaryButton}`}
              onClick={() => void loadData(true)}
            >
              다시 불러오기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.intro}>
          <div>
            <p className={styles.eyebrow}>CREATURE HUB</p>
            <h1 className={styles.title}>나의 펫</h1>
            <p className={styles.subtitle}>
              하나의 알을 키우고, 행동을 고르고, 나만의 전시를 완성해 보세요.
            </p>
          </div>
          <div
            className={styles.wallet}
            aria-label={`보유 잔액 ${home.balance}${home.currency.unitLabel}`}
          >
            <span className={styles.walletIcon} aria-hidden="true">
              ◈
            </span>
            <span>
              <span className={styles.walletLabel}>내 지갑</span>
              <span className={styles.walletValue}>
                {home.balance.toLocaleString("ko-KR")}
              </span>
              <span className={styles.walletUnit}>
                {home.currency.unitLabel}
              </span>
            </span>
          </div>
        </header>

        {notice ? (
          <p
            className={`${styles.notice} ${notice.kind === "error" ? styles.noticeError : ""}`}
            role={notice.kind === "error" ? "alert" : "status"}
          >
            {notice.text}
          </p>
        ) : null}

        <nav
          className={styles.tabs}
          role="tablist"
          aria-label="펫 메뉴"
        >
          {TABS.map((entry) => (
            <button
              key={entry.id}
              ref={(element) => {
                tabRefs.current[entry.id] = element ?? undefined;
              }}
              type="button"
              role="tab"
              aria-selected={tab === entry.id}
              aria-controls={
                tab === entry.id ? `creature-panel-${entry.id}` : undefined
              }
              tabIndex={tab === entry.id ? 0 : -1}
              className={`${styles.tab} ${tab === entry.id ? styles.tabActive : ""}`}
              onClick={() => setTab(entry.id)}
              onKeyDown={(event) => onTabKeyDown(event, entry.id)}
            >
              <span className={styles.tabIcon} aria-hidden="true">
                {entry.icon}
              </span>
              {entry.label}
            </button>
          ))}
        </nav>

        <main
          id={`creature-panel-${tab}`}
          className={styles.tabPanel}
          role="tabpanel"
          tabIndex={0}
          aria-label={TABS.find((entry) => entry.id === tab)?.label}
        >
          {tab === "exhibition" ? (
            <ExhibitionView
              home={home}
              catalog={catalog}
              behavior={behavior}
              onBehaviorChange={setBehavior}
              busy={busyKey !== null}
              onFeature={featureCreature}
              onShop={() => setTab("shop")}
              onFitting={() => setTab("fitting")}
            />
          ) : null}
          {tab === "shop" ? (
            <ShopView
              home={home}
              products={visibleProducts}
              filter={shopFilter}
              busyKey={busyKey}
              quantities={quantities}
              refreshing={refreshing}
              onFilterChange={setShopFilter}
              onQuantityChange={updateQuantity}
              onPurchase={askPurchase}
            />
          ) : null}
          {tab === "fitting" ? (
            <FittingView
              home={home}
              catalog={catalog}
              behavior={behavior}
              busyKey={busyKey}
              onBehaviorChange={setBehavior}
              onUse={useItem}
              onEquip={equipBackground}
              onShop={() => setTab("shop")}
            />
          ) : null}
          {tab === "collection" ? (
            <CollectionView home={home} catalog={catalog} />
          ) : null}
        </main>

        {pendingPurchase ? (
          <div className={styles.dialogScrim} role="presentation">
            <section
              ref={dialogRef}
              className={styles.dialog}
              role="dialog"
              tabIndex={-1}
              aria-modal="true"
              aria-labelledby="purchase-dialog-title"
            >
              <h2 id="purchase-dialog-title">구매할까요?</h2>
              <p>
                {displayProductName(pendingPurchase.product)}을(를){" "}
                {pendingPurchase.quantity > 1
                  ? `${pendingPurchase.quantity}개 `
                  : ""}
                구매해요.
              </p>
              <div className={styles.dialogPrice}>
                <span>결제 금액</span>
                <span>
                  {(
                    pendingPurchase.product.price * pendingPurchase.quantity
                  ).toLocaleString("ko-KR")}{" "}
                  {home.currency.unitLabel}
                </span>
              </div>
              <div className={styles.dialogActions}>
                <button
                  type="button"
                  className={`${styles.button} ${styles.secondaryButton}`}
                  onClick={() => setPendingPurchase(null)}
                  disabled={busyKey !== null}
                >
                  취소
                </button>
                <button
                  type="button"
                  className={`${styles.button} ${styles.primaryButton}`}
                  onClick={() => void confirmPurchase()}
                  disabled={busyKey !== null}
                >
                  {busyKey ? "구매 중…" : "구매 확정"}
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type ExhibitionProps = {
  home: HomeSnapshot;
  catalog: CatalogSnapshot;
  behavior: Behavior;
  onBehaviorChange: (behavior: Behavior) => void;
  busy: boolean;
  onFeature: (creatureId: string) => void;
  onShop: () => void;
  onFitting: () => void;
};

function ExhibitionView({
  home,
  catalog,
  behavior,
  onBehaviorChange,
  busy,
  onFeature,
  onShop,
  onFitting,
}: ExhibitionProps) {
  const featured = home.featured;
  const active = home.active;
  const pets = [active, ...home.collection].filter(
    (creature, index, source): creature is Creature =>
      Boolean(creature) &&
      creature?.stage !== "egg" &&
      source.findIndex((candidate) => candidate?.id === creature?.id) === index,
  );
  const line = featured
    ? catalog.lines.find((entry) => entry.key === featured.lineKey)
    : null;
  const lineName = featured
    ? displayLineName(featured.lineKey, line?.nameKo)
    : "선택된 대표 펫 없음";
  const stageDefinition = featured
    ? line?.stages.find((entry) => entry.stage === featured.stage)
    : undefined;
  const affinity = featured?.affinity ?? line?.affinity;
  const backgroundEffectKey = resolveBackgroundEffectKey(
    home.equippedBackground?.product,
    home.equippedBackground?.itemKey,
  );

  if (!featured) {
    return (
      <>
        <div className={styles.panelHeader}>
          <div>
            <h2 className={styles.panelTitle}>내 펫</h2>
            <p className={styles.panelCopy}>
              부화한 펫을 대표로 선택해 함께 놀 수 있어요.
            </p>
          </div>
          <span className={styles.stageBadge}>대표 펫 선택</span>
        </div>
        <section
          className={styles.emptyState}
          aria-labelledby="creature-empty-title"
        >
          <div className={styles.emptyIcon} aria-hidden="true">✦</div>
          <h3 id="creature-empty-title">
            {pets.length > 0 ? "함께할 대표 펫을 골라 주세요" : "아직 부화한 펫이 없어요"}
          </h3>
          {pets.length > 0 ? (
            <label className={styles.petSelectField}>
              <span>대표 펫</span>
              <select
                value=""
                onChange={(event) => onFeature(event.currentTarget.value)}
                disabled={busy}
              >
                <option value="">펫 선택</option>
                {pets.map((pet) => (
                  <option key={pet.id} value={pet.id}>
                    {displayLineName(pet.lineKey, pet.nameKo)} · {STAGE_LABELS[pet.stage]}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <button type="button" className={`${styles.button} ${styles.primaryButton}`} onClick={onShop}>
              상점에서 알 만나기
            </button>
          )}
        </section>
        {active?.stage === "egg" ? (
          <section className={styles.asideCard} style={{ marginTop: 16 }}>
            <h3 className={styles.sectionHeading}>부화 중인 알</h3>
            <p className={styles.asideCopy}>{active.progressPoints} 포인트를 모았어요. 부화하면 대표 펫으로 선택할 수 있어요.</p>
          </section>
        ) : null}
        <section className={styles.asideCard} style={{ marginTop: 16 }}>
          <h3 className={styles.sectionHeading}>보유 아이템</h3>
          <p className={styles.asideCopy}>
            성장 아이템은 대표 펫이 아니라 현재 성장 중인 펫에게 사용돼요.
          </p>
          <button
            type="button"
            className={`${styles.button} ${styles.secondaryButton} ${styles.fullButton}`}
            onClick={onFitting}
          >
            보유 아이템 확인
          </button>
        </section>
      </>
    );
  }

  const progress = progressPercent(featured);
  const currentIndex = currentStageIndex(featured.stage);
  const selectedBehavior = behaviorCopy(stageDefinition, behavior);

  return (
    <>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>내 펫</h2>
          <p className={styles.panelCopy}>
            대표 펫을 고르고 오늘 함께할 행동을 선택해요.
          </p>
        </div>
        <span className={styles.stageBadge}>
          {STAGE_LABELS[featured.stage]} 단계
        </span>
      </div>
      <div className={styles.showcaseGrid}>
        <label className={styles.petSelectField} htmlFor="featured-pet-select">
          <span>대표 펫</span>
          <select
            id="featured-pet-select"
            value={featured.id}
            onChange={(event) => onFeature(event.currentTarget.value)}
            disabled={busy}
          >
            {pets.map((pet) => (
              <option key={pet.id} value={pet.id}>
                {displayLineName(pet.lineKey, pet.nameKo)} · {STAGE_LABELS[pet.stage]}
              </option>
            ))}
          </select>
        </label>
        <section
          className={styles.stageCard}
          data-background-effect={backgroundEffectKey ?? undefined}
          aria-labelledby="active-creature-title"
        >
          {backgroundEffectKey ? (
            <span className={styles.backgroundEffectLayer} aria-hidden="true" />
          ) : null}
          <div className={styles.stageTopline}>
            <span className={styles.stageStatus}>전시 중 · 배회 중</span>
            <span className={styles.affinityBadge}>
              {displayAffinity(affinity)}
            </span>
          </div>
          <div className={styles.stageIdentity}>
            <h3 id="active-creature-title" className={styles.creatureName}>
              {lineName}
            </h3>
          </div>
          <div className={styles.spriteStage}>
            <CreatureSprite
              lineKey={featured.lineKey}
              stage={featured.stage}
              behavior={behavior}
              affinity={affinity}
              name={lineName}
              roaming
            />
          </div>
          <div className={styles.showcaseBody}>
            <div>
              <div className={styles.progressHeader}>
                <span>성장 진행도</span>
                <span className={styles.progressValue}>
                  {featured.progressPoints} 포인트
                  {featured.stage === "evolved" ? " · 완성" : ""}
                </span>
              </div>
              <div
                className={styles.progressTrack}
                aria-label={`성장 진행도 ${Math.round(progress)}%`}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress)}
              >
                <div
                  className={styles.progressFill}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className={styles.stageRail} aria-label="성장 단계">
                {STAGES.map((stage, index) => (
                  <div
                    key={stage}
                    className={`${styles.stageStep} ${index < currentIndex ? styles.stageStepDone : ""} ${index === currentIndex ? styles.stageStepActive : ""}`}
                  >
                    <span className={styles.stageDot} aria-hidden="true" />
                    <span>{STAGE_LABELS[stage]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.behaviorPanel}>
              <div className={styles.behaviorHeading}>
                <span>오늘의 행동</span>
                <span className={styles.behaviorHint}>
                  {selectedBehavior?.descriptionKo ||
                    BEHAVIOR_DESCRIPTIONS[behavior]}
                </span>
              </div>
              <div className={styles.behaviorGrid}>
                {(["normal", "lazy", "signature"] as Behavior[]).map((kind) => {
                  const behaviorEntry = behaviorCopy(stageDefinition, kind);
                  return (
                    <button
                      key={kind}
                      type="button"
                      className={`${styles.behaviorButton} ${behavior === kind ? styles.behaviorButtonActive : ""}`}
                      aria-pressed={behavior === kind}
                      aria-label={`${lineName} ${STAGE_LABELS[featured.stage]} ${behaviorEntry.labelKo}`}
                      onClick={() => onBehaviorChange(kind)}
                    >
                      <span className={styles.behaviorLabel}>
                        {behaviorEntry.labelKo}
                      </span>
                      <span className={styles.behaviorDescription}>
                        {behaviorEntry.descriptionKo}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
        <aside className={styles.asideStack} aria-label="전시 보조 정보">
          {active?.stage === "egg" ? (
            <section className={styles.asideCard}>
              <h3 className={styles.sectionHeading}>부화 중인 알</h3>
              <p className={styles.asideCopy}>
                {active.progressPoints} 포인트를 모았어요. 이 알은 대표 펫이나 도감 보유 종족으로 계산되지 않아요.
              </p>
            </section>
          ) : null}
          <section className={styles.asideCard}>
            <h3 className={styles.sectionHeading}>성장 아이템 대상</h3>
            <p className={styles.asideCopy}>
              {active
                ? `${displayLineName(active.lineKey, active.nameKo)}에게 먹이와 촉진제가 적용돼요.`
                : "현재 성장 중인 펫이 없어 성장 아이템을 사용할 수 없어요."}
            </p>
            <button
              type="button"
              className={`${styles.button} ${styles.secondaryButton} ${styles.fullButton}`}
              onClick={onFitting}
            >
              {active && active.id !== featured.id
                ? `${displayLineName(active.lineKey, active.nameKo)} 성장 돕기`
                : "아이템으로 성장 돕기"}
            </button>
          </section>
          <section className={styles.asideCard}>
            <h3 className={styles.sectionHeading}>전시 배경</h3>
            <p className={styles.asideCopy}>
              {home.equippedBackground
                ? displayProductName(
                    home.equippedBackground.product,
                    home.equippedBackground.itemKey,
                  )
                : "기본 오로라 배경"}
            </p>
            <button
              type="button"
              className={`${styles.button} ${styles.secondaryButton} ${styles.fullButton}`}
              onClick={onFitting}
            >
              피팅룸 열기
            </button>
          </section>
        </aside>
      </div>
    </>
  );
}

type ShopProps = {
  home: HomeSnapshot;
  products: Product[];
  filter: ShopFilter;
  busyKey: string | null;
  quantities: Record<string, number>;
  refreshing: boolean;
  onFilterChange: (filter: ShopFilter) => void;
  onQuantityChange: (key: string, delta: number) => void;
  onPurchase: (
    product: Product,
    quantity: number,
    trigger?: HTMLButtonElement,
  ) => void;
};

function ShopView({
  home,
  products,
  filter,
  busyKey,
  quantities,
  refreshing,
  onFilterChange,
  onQuantityChange,
  onPurchase,
}: ShopProps) {
  return (
    <>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>상점</h2>
          <p className={styles.panelCopy}>
            알부터 배경 효과까지, 교실 화폐로 필요한 것을 준비해요.
          </p>
        </div>
        {refreshing ? (
          <span className={styles.stageBadge}>잔액 동기화 중…</span>
        ) : null}
      </div>
      <div
        className={styles.filterTabs}
        role="group"
        aria-label="상점 상품 종류"
      >
        {FILTERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={filter === entry.id}
            className={`${styles.filterButton} ${filter === entry.id ? styles.filterButtonActive : ""}`}
            onClick={() => onFilterChange(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {products.length === 0 ? (
        <section className={styles.emptyState}>
          <div className={styles.emptyIcon} aria-hidden="true">
            🛍
          </div>
          <h3>이 종류의 상품이 아직 없어요</h3>
          <p>다른 카테고리에서 펫에게 필요한 것을 찾아보세요.</p>
        </section>
      ) : (
        <div className={styles.productGrid}>
          {products.map((product) => {
            const quantity = quantities[product.key] ?? 1;
            const totalPrice = product.price * quantity;
            const isEgg =
              product.kind === "random-egg" || product.kind === "affinity-egg";
            const blockedByActive = isEgg && Boolean(home.active);
            const disabled =
              Boolean(busyKey) || home.balance < totalPrice || blockedByActive;
            return (
              <article key={product.key} className={styles.productCard}>
                <div className={styles.productCardTop}>
                  <span className={styles.productIcon} aria-hidden="true">
                    {PRODUCT_ICONS[product.kind]}
                  </span>
                  <span className={styles.kindBadge}>
                    {isEgg
                      ? "알"
                      : product.kind === "food"
                        ? "먹이"
                        : product.kind === "hatch-accelerator"
                          ? "촉진"
                          : "배경"}
                  </span>
                </div>
                <div>
                  <h3 className={styles.productTitle}>
                    {displayProductName(product)}
                  </h3>
                  <p className={styles.productDescription}>
                    {displayProductDescription(product)}
                  </p>
                  <div className={styles.productPrice}>
                    {product.price.toLocaleString("ko-KR")}{" "}
                    <span>{home.currency.unitLabel} / 개</span>
                  </div>
                </div>
                <div className={styles.productBottom}>
                  {isEgg ? (
                    <span className={styles.productDescription}>
                      {blockedByActive
                        ? "성장 중인 펫을 먼저 키워 주세요"
                        : home.balance < product.price
                          ? "잔액이 부족해요"
                          : "새 알을 전시에 추가"}
                    </span>
                  ) : (
                    <div
                      className={styles.quantity}
                      aria-label={`${displayProductName(product)} 수량`}
                    >
                      <button
                        type="button"
                        className={styles.quantityButton}
                        onClick={() => onQuantityChange(product.key, -1)}
                        disabled={Boolean(busyKey) || quantity <= 1}
                        aria-label={`${displayProductName(product)} 수량 줄이기`}
                      >
                        −
                      </button>
                      <span className={styles.quantityValue}>{quantity}</span>
                      <button
                        type="button"
                        className={styles.quantityButton}
                        onClick={() => onQuantityChange(product.key, 1)}
                        disabled={Boolean(busyKey) || quantity >= 9}
                        aria-label={`${displayProductName(product)} 수량 늘리기`}
                      >
                        +
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    className={styles.productAction}
                    disabled={disabled}
                    onClick={(event) =>
                      onPurchase(product, quantity, event.currentTarget)
                    }
                    aria-label={`${displayProductName(product)} ${isEgg ? "구매" : "담기"}`}
                  >
                    {busyKey === product.key
                      ? "처리 중…"
                      : isEgg
                        ? "구매"
                        : "담기"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

type FittingProps = {
  home: HomeSnapshot;
  catalog: CatalogSnapshot;
  behavior: Behavior;
  busyKey: string | null;
  onBehaviorChange: (behavior: Behavior) => void;
  onUse: (item: InventoryItem) => void;
  onEquip: (itemKey: string | null) => void;
  onShop: () => void;
};

function FittingView({
  home,
  catalog,
  behavior,
  busyKey,
  onBehaviorChange,
  onUse,
  onEquip,
  onShop,
}: FittingProps) {
  const active = home.active;
  const featured = home.featured;
  const line = featured
    ? catalog.lines.find((entry) => entry.key === featured.lineKey)
    : null;
  const lineName = featured
    ? displayLineName(featured.lineKey, line?.nameKo)
    : "선택된 대표 펫 없음";
  const stageDefinition = featured
    ? line?.stages.find((entry) => entry.stage === featured.stage)
    : undefined;
  const backgroundEffectKey = resolveBackgroundEffectKey(
    home.equippedBackground?.product,
    home.equippedBackground?.itemKey,
  );
  const foodItems = home.items.filter(
    (item) => item.itemKind === "food" || item.itemKind === "hatch-accelerator",
  );
  const backgroundItems = home.items.filter(
    (item) => item.itemKind === "background-effect",
  );

  return (
    <>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>피팅룸</h2>
          <p className={styles.panelCopy}>
            보유 아이템을 사용하고 전시 배경을 장착해요.
          </p>
        </div>
        <span className={styles.stageBadge}>{home.items.length}종 보유</span>
      </div>
      <div className={styles.fittingGrid}>
        <section
          className={styles.fittingCard}
          aria-labelledby="fitting-preview-title"
        >
          <h3 id="fitting-preview-title" className={styles.sectionHeading}>
            현재 전시
          </h3>
          <div
            className={styles.fittingPreview}
            data-background-effect={backgroundEffectKey ?? undefined}
          >
            {backgroundEffectKey ? (
              <span
                className={styles.backgroundEffectLayer}
                aria-hidden="true"
              />
            ) : null}
            {featured ? (
              <CreatureSprite
                lineKey={featured.lineKey}
                stage={featured.stage}
                behavior={behavior}
                affinity={featured.affinity ?? line?.affinity}
                name={lineName}
              />
            ) : (
              <div className={styles.emptyIcon} aria-hidden="true">
                ✦
              </div>
            )}
          </div>
          {featured ? (
            <>
              <h3
                className={styles.sectionHeading}
                style={{ marginTop: 14, marginBottom: 2 }}
              >
                {lineName}
              </h3>
              <p className={styles.asideCopy}>
                {STAGE_LABELS[featured.stage]} ·{" "}
                {displayAffinity(featured.affinity ?? line?.affinity)}
              </p>
              <div className={styles.behaviorGrid} style={{ marginTop: 13 }}>
                {(["normal", "lazy", "signature"] as Behavior[]).map((kind) => {
                  const behaviorEntry = behaviorCopy(stageDefinition, kind);
                  return (
                    <button
                      key={kind}
                      type="button"
                      className={`${styles.behaviorButton} ${behavior === kind ? styles.behaviorButtonActive : ""}`}
                      aria-pressed={behavior === kind}
                      aria-label={`${lineName} ${STAGE_LABELS[featured.stage]} ${behaviorEntry.labelKo}`}
                      onClick={() => onBehaviorChange(kind)}
                    >
                      <span className={styles.behaviorLabel}>
                        {behaviorEntry.labelKo}
                      </span>
                      <span className={styles.behaviorDescription}>
                        {behaviorEntry.descriptionKo}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <button
              type="button"
              className={`${styles.button} ${styles.primaryButton} ${styles.fullButton}`}
              onClick={onShop}
            >
              상점에서 알 만나기
            </button>
          )}
        </section>
        <div className={styles.asideStack}>
          <section className={styles.fittingCard}>
            <h3 className={styles.sectionHeading}>먹이와 촉진제</h3>
            {active ? (
              <p className={styles.growthTarget}>
                성장 대상 · {active.stage === "egg" ? "부화 중인 알" : displayLineName(active.lineKey, active.nameKo)}
              </p>
            ) : null}
            {!active ? (
              <p className={styles.asideCopy}>
                성장 중인 펫이 생기면 아이템을 사용할 수 있어요.
              </p>
            ) : null}
            <div className={styles.inventoryList}>
              {foodItems.length === 0 ? (
                <p className={styles.asideCopy}>
                  보유한 먹이와 촉진제가 없어요.
                </p>
              ) : (
                foodItems.map((item) => {
                  const acceleratorLocked =
                    item.itemKind === "hatch-accelerator" &&
                    active?.stage !== "egg";
                  const disabled =
                    !active ||
                    item.quantity < 1 ||
                    Boolean(busyKey) ||
                    acceleratorLocked;
                  return (
                    <div className={styles.inventoryRow} key={item.itemKey}>
                      <div>
                        <div className={styles.inventoryName}>
                          <span className={styles.quantityBadge}>
                            {item.quantity}
                          </span>
                          <span className={styles.inventoryNameText}>
                            {displayProductName(item.product, item.itemKey)}
                          </span>
                        </div>
                        <p className={styles.inventoryMeta}>
                          {acceleratorLocked
                            ? "알 단계에서 사용할 수 있어요"
                            : item.itemKind === "food"
                              ? "성장 포인트를 채워요"
                              : "부화를 앞당겨요"}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={styles.equipButton}
                        disabled={disabled}
                        onClick={() => onUse(item)}
                        aria-label={`${displayProductName(item.product, item.itemKey)} ${busyKey === item.itemKey ? "사용 중" : "사용"}`}
                      >
                        {busyKey === item.itemKey ? "사용 중…" : "사용"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </section>
          <section className={styles.fittingCard}>
            <h3 className={styles.sectionHeading}>전시 배경</h3>
            <div className={styles.inventoryList}>
              {backgroundItems.length === 0 ? (
                <p className={styles.asideCopy}>보유한 배경 효과가 없어요.</p>
              ) : (
                backgroundItems.map((item) => (
                  <div className={styles.inventoryRow} key={item.itemKey}>
                    <div>
                      <div className={styles.inventoryName}>
                        <span className={styles.quantityBadge}>
                          {item.quantity}
                        </span>
                        <span className={styles.inventoryNameText}>
                          {displayProductName(item.product, item.itemKey)}
                        </span>
                      </div>
                      <p className={styles.inventoryMeta}>
                        {item.isEquipped
                          ? "현재 전시에 적용 중"
                          : "전시 분위기를 바꿔요"}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={styles.equipButton}
                      disabled={Boolean(busyKey) || item.isEquipped}
                      onClick={() => onEquip(item.itemKey)}
                      aria-label={`${displayProductName(item.product, item.itemKey)} ${item.isEquipped ? "장착됨" : busyKey === item.itemKey ? "적용 중" : "장착"}`}
                    >
                      {item.isEquipped
                        ? "장착됨"
                        : busyKey === item.itemKey
                          ? "적용 중…"
                          : "장착"}
                    </button>
                  </div>
                ))
              )}
            </div>
            {home.equippedBackground ? (
              <button
                type="button"
                className={`${styles.button} ${styles.secondaryButton} ${styles.fullButton}`}
                disabled={Boolean(busyKey)}
                onClick={() => onEquip(null)}
              >
                배경 해제
              </button>
            ) : null}
          </section>
        </div>
      </div>
    </>
  );
}

type CollectionProps = { home: HomeSnapshot; catalog: CatalogSnapshot };
type CollectionRow = { line: CatalogLine; creature: Creature | null };

function CollectionView({ home, catalog }: CollectionProps) {
  const ownedPets = [home.active, ...home.collection]
    .filter((creature): creature is Creature => Boolean(creature) && creature?.stage !== "egg")
    .filter((creature, index, source) => source.findIndex((candidate) => candidate.id === creature.id) === index);
  const highestOwnedForLine = (lineKey: string) =>
    ownedPets
      .filter((creature) => creature.lineKey === lineKey)
      .sort((left, right) => currentStageIndex(right.stage) - currentStageIndex(left.stage))[0] ?? null;
  const rows: CollectionRow[] = catalog.lines.map((line) => ({
    line,
    creature: highestOwnedForLine(line.key),
  }));
  const catalogLineKeys = new Set(catalog.lines.map((line) => line.key));
  const orphanLineKeys = [...new Set(ownedPets
    .filter((creature) => !catalogLineKeys.has(creature.lineKey))
    .map((creature) => creature.lineKey))];
  const orphanRows: CollectionRow[] = orphanLineKeys.map((lineKey) => {
    const creature = highestOwnedForLine(lineKey);
    return {
      line: {
        key: lineKey,
        affinity: creature?.affinity ?? "",
        nameKo: creature?.nameKo ?? lineKey,
        visualConcept: "",
        stages: [],
      } satisfies CatalogLine,
      creature,
    };
  });
  const collectionRows: CollectionRow[] = [...rows, ...orphanRows];
  const ownedCount = new Set(ownedPets.map((creature) => creature.lineKey)).size;

  return (
    <>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>도감</h2>
          <p className={styles.panelCopy}>
            부화한 펫 종족과 지금까지 만난 가장 높은 성장 모습을 확인해요.
          </p>
        </div>
        <span className={styles.stageBadge}>
          {ownedCount} / {catalog.lines.length || 7} 수집
        </span>
      </div>
      <div className={styles.collectionSummary} role="status">
        <span aria-hidden="true">▦</span>
        <span>
          {ownedCount}종의 펫을 만났어요. 빈칸도 다음 모험의 목표가 될 수
          있어요.
        </span>
      </div>
      <div className={styles.collectionGrid} style={{ marginTop: 14 }}>
        {collectionRows.map(({ line, creature }) => {
          const ownedIndex = creature ? PET_STAGES.indexOf(creature.stage) : -1;
          const lineName = displayLineName(line.key, line.nameKo);
          return (
            <article
              key={`${line.key}:${creature?.id ?? "undiscovered"}`}
              className={styles.collectionCard}
              aria-label={`${lineName} 도감 카드`}
            >
              <div className={styles.collectionSprite}>
                {creature ? (
                  <CreatureSprite
                    lineKey={line.key}
                    stage={creature.stage}
                    behavior="normal"
                    affinity={line.affinity}
                    name={lineName}
                  />
                ) : (
                  <div
                    className={styles.collectionSilhouette}
                    role="img"
                    aria-label={`${lineName} 미발견 실루엣`}
                  >
                    <span aria-hidden="true">?</span>
                  </div>
                )}
              </div>
              <div className={styles.collectionInfo}>
                <div
                  className={styles.stageTopline}
                  style={{ marginBottom: 0 }}
                >
                  <h3 className={styles.collectionName}>{lineName}</h3>
                  {creature ? (
                    <span className={styles.ownedBadge}>보유</span>
                  ) : null}
                </div>
                <p className={styles.collectionAffinity}>
                  {displayAffinity(line.affinity)}의 기운
                </p>
                <div
                  className={styles.stageDots}
                  aria-label={
                    creature
                      ? `${STAGE_LABELS[creature.stage]} 단계까지 기록`
                      : "아직 만나지 못함"
                  }
                >
                  {PET_STAGES.map((stage, index) => (
                    <span
                      key={stage}
                      className={`${styles.stageDotSmall} ${index < ownedIndex ? styles.stageDotSmallOwned : ""} ${index === ownedIndex ? styles.stageDotSmallCurrent : ""}`}
                      role="img"
                      aria-label={`${lineName} ${STAGE_LABELS[stage]} 단계${index <= ownedIndex ? " 기록 있음" : " 미기록"}`}
                    />
                  ))}
                  <span className={styles.stageDotsLabel}>
                    {creature
                      ? `${STAGE_LABELS[creature.stage]}까지`
                      : "미발견"}
                  </span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
