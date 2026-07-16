import rawManifest from "@/data/pet-ecosystem.json";

export const PET_ELEMENTS = ["earth", "river", "sea", "volcano", "sky", "dark", "light"] as const;
export type PetElement = (typeof PET_ELEMENTS)[number];
export type PetAcquisitionTier = "standard" | "uncommon" | "premium";

export type PetBehaviorFrame = { id: string; label: string; description: string };
export type PetBehaviorRow = {
  id: string;
  label: string;
  frames: [PetBehaviorFrame, PetBehaviorFrame, PetBehaviorFrame];
};
export type PetStageDefinition = {
  id: string;
  name: string;
  stage: 1 | 2 | 3;
  evolveAtXp: number;
  palette: [string, string, string];
  silhouette: string;
  prompt: string;
  atlasRowStart: 1 | 4 | 7;
};
export type PetLineageDefinition = {
  id: string;
  element: PetElement;
  elementLabel: string;
  acquisitionTier: PetAcquisitionTier;
  randomWeight: number;
  egg: { name: string; hatchPoints: number; palette: [string, string, string]; motif: string };
  signature: { id: string; label: string };
  behaviorRows: [PetBehaviorRow, PetBehaviorRow, PetBehaviorRow];
  atlas: {
    path: string;
    width: 768;
    height: 2560;
    columns: 3;
    rows: 10;
    frameWidth: 256;
    frameHeight: 256;
    eggRow: 0;
    stageRowStarts: [1, 4, 7];
  };
  stages: [PetStageDefinition, PetStageDefinition, PetStageDefinition];
};
export type PetCatalog = {
  format: "aura.pet-catalog.v1";
  schemaVersion: 1;
  catalogId: string;
  displayName: string;
  revision: string;
  generatedAt: string;
  elements: PetElement[];
  lineages: PetLineageDefinition[];
};

type RecordValue = Record<string, unknown>;
const isRecord = (value: unknown): value is RecordValue => typeof value === "object" && value !== null && !Array.isArray(value);
const readText = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} is invalid.`);
  return value.trim();
};
const readInteger = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${field} is invalid.`);
  return value as number;
};
const readPalette = (value: unknown, field: string): [string, string, string] => {
  if (!Array.isArray(value) || value.length !== 3 || value.some((entry) => typeof entry !== "string" || !/^#[0-9a-f]{6}$/i.test(entry))) {
    throw new Error(`${field} must contain three colors.`);
  }
  return [value[0], value[1], value[2]];
};
const readFrame = (value: unknown, field: string): PetBehaviorFrame => {
  if (!isRecord(value)) throw new Error(`${field} is invalid.`);
  return { id: readText(value.id, `${field}.id`), label: readText(value.label, `${field}.label`), description: readText(value.description, `${field}.description`) };
};
const idleRow = (): PetBehaviorRow => ({
  id: "idle",
  label: "평소",
  frames: [
    { id: "idle-breathe", label: "숨 고르기", description: "제자리에서 편안하게 숨을 쉬며 몸이 아주 조금 위아래로 움직인다" },
    { id: "idle-blink", label: "눈 깜빡이기", description: "같은 자세를 유지하며 한 번 눈을 깜빡인다" },
    { id: "idle-look", label: "둘러보기", description: "고개를 살짝 기울여 주변을 호기심 있게 둘러본다" },
  ],
});
const lazyRow = (): PetBehaviorRow => ({
  id: "lazy",
  label: "게으름",
  frames: [
    { id: "lazy-droop", label: "축 늘어지기", description: "어깨와 귀가 축 처지고 몸을 낮춰 느긋하게 앉는다" },
    { id: "lazy-yawn", label: "하품하기", description: "눈을 감고 크게 하품하며 앞발을 느슨하게 편다" },
    { id: "lazy-nap", label: "꾸벅 졸기", description: "고개를 꾸벅이며 작은 Z 표시 하나와 함께 잠깐 존다" },
  ],
});

export function parsePetCatalog(value: unknown): PetCatalog {
  if (!isRecord(value) || value.format !== "aura-pet-ecosystem-authoring" || value.schemaVersion !== 1) {
    throw new Error("Unsupported pet ecosystem format.");
  }
  if (!Array.isArray(value.lineages) || value.lineages.length !== PET_ELEMENTS.length) {
    throw new Error("Pet ecosystem must contain seven elemental lineages.");
  }
  const lineages = value.lineages.map((candidate, index): PetLineageDefinition => {
    if (!isRecord(candidate) || !PET_ELEMENTS.includes(candidate.element as PetElement)) throw new Error(`Pet lineage ${index} is invalid.`);
    if (!isRecord(candidate.egg) || !isRecord(candidate.signature) || !Array.isArray(candidate.stages) || candidate.stages.length !== 3) {
      throw new Error(`Pet lineage ${index} is incomplete.`);
    }
    if (!Array.isArray(candidate.signature.frames) || candidate.signature.frames.length !== 3) throw new Error(`Pet lineage ${index} signature is invalid.`);
    const element = candidate.element as PetElement;
    const tier = candidate.acquisitionTier;
    if (tier !== "standard" && tier !== "uncommon" && tier !== "premium") throw new Error(`Pet lineage ${index} tier is invalid.`);
    const signatureFrames = candidate.signature.frames.map((frame, frameIndex) => readFrame(frame, `lineages[${index}].signature.frames[${frameIndex}]`)) as [PetBehaviorFrame, PetBehaviorFrame, PetBehaviorFrame];
    const stages = candidate.stages.map((stageValue, stageIndex): PetStageDefinition => {
      if (!isRecord(stageValue) || stageValue.stage !== stageIndex + 1) throw new Error(`Pet lineage ${index} stage ${stageIndex + 1} is invalid.`);
      return {
        id: readText(stageValue.id, `lineages[${index}].stages[${stageIndex}].id`),
        name: readText(stageValue.name, `lineages[${index}].stages[${stageIndex}].name`),
        stage: (stageIndex + 1) as 1 | 2 | 3,
        evolveAtXp: readInteger(stageValue.evolveAtXp, `lineages[${index}].stages[${stageIndex}].evolveAtXp`),
        palette: readPalette(stageValue.palette, `lineages[${index}].stages[${stageIndex}].palette`),
        silhouette: readText(stageValue.silhouette, `lineages[${index}].stages[${stageIndex}].silhouette`),
        prompt: readText(stageValue.prompt, `lineages[${index}].stages[${stageIndex}].prompt`),
        atlasRowStart: [1, 4, 7][stageIndex] as 1 | 4 | 7,
      };
    }) as [PetStageDefinition, PetStageDefinition, PetStageDefinition];
    return {
      id: readText(candidate.id, `lineages[${index}].id`),
      element,
      elementLabel: readText(candidate.elementLabel, `lineages[${index}].elementLabel`),
      acquisitionTier: tier,
      randomWeight: readInteger(candidate.weight, `lineages[${index}].weight`),
      egg: {
        name: readText(candidate.egg.name, `lineages[${index}].egg.name`),
        hatchPoints: readInteger(candidate.egg.hatchPoints, `lineages[${index}].egg.hatchPoints`),
        palette: readPalette(candidate.egg.palette, `lineages[${index}].egg.palette`),
        motif: readText(candidate.egg.motif, `lineages[${index}].egg.motif`),
      },
      signature: { id: readText(candidate.signature.id, `lineages[${index}].signature.id`), label: readText(candidate.signature.label, `lineages[${index}].signature.label`) },
      behaviorRows: [idleRow(), lazyRow(), { id: readText(candidate.signature.id, "signature.id"), label: readText(candidate.signature.label, "signature.label"), frames: signatureFrames }],
      atlas: { path: `atlases/${readText(candidate.id, "lineage.id")}.svg`, width: 768, height: 2560, columns: 3, rows: 10, frameWidth: 256, frameHeight: 256, eggRow: 0, stageRowStarts: [1, 4, 7] },
      stages,
    };
  });
  if (new Set(lineages.map((lineage) => lineage.id)).size !== lineages.length) throw new Error("Pet lineage IDs must be unique.");
  if (new Set(lineages.map((lineage) => lineage.element)).size !== PET_ELEMENTS.length) throw new Error("Every pet element must appear once.");
  return {
    format: "aura.pet-catalog.v1",
    schemaVersion: 1,
    catalogId: readText(value.catalogId, "catalogId"),
    displayName: readText(value.displayName, "displayName"),
    revision: readText(value.revision, "revision"),
    generatedAt: "",
    elements: [...PET_ELEMENTS],
    lineages,
  };
}

export const PET_CATALOG = parsePetCatalog(rawManifest);
export const PET_LINEAGES = PET_CATALOG.lineages;

const LINEAGE_BY_ID = new Map(PET_LINEAGES.map((lineage) => [lineage.id, lineage]));

export function getPetLineage(lineageId: string): PetLineageDefinition | null {
  return LINEAGE_BY_ID.get(lineageId) ?? null;
}

export function getPetStage(lineageId: string, stage: number): PetStageDefinition | null {
  if (stage < 1 || stage > 3) return null;
  return getPetLineage(lineageId)?.stages[stage - 1] ?? null;
}

export type PetProductKind = "egg" | "food" | "accelerator" | "background";

export type PetProduct = {
  key: string;
  kind: PetProductKind;
  name: string;
  description: string;
  price: number;
  rarity: "common" | "rare" | "epic" | "legendary";
  icon: string;
  lineageId?: string;
  random?: boolean;
  itemKey?: string;
  hatchPoints?: number;
  experience?: number;
  durable?: boolean;
  backgroundClass?: string;
};

const targetedEggPrice = (lineage: PetLineageDefinition): number => {
  if (lineage.acquisitionTier === "premium") return 280;
  if (lineage.acquisitionTier === "uncommon") return 190;
  return 150;
};

export const PET_PRODUCTS: PetProduct[] = [
  {
    key: "egg-random",
    kind: "egg",
    name: "운명의 알",
    description: "어떤 원소가 나올지 모르는 대신 가장 저렴한 랜덤 알이에요.",
    price: 90,
    rarity: "common",
    icon: "🎲",
    random: true,
  },
  ...PET_LINEAGES.map((lineage): PetProduct => ({
    key: `egg-${lineage.element}`,
    kind: "egg",
    name: lineage.egg.name,
    description: `${lineage.elementLabel} 계보가 확정된 알 · 부화 ${lineage.egg.hatchPoints} 포인트`,
    price: targetedEggPrice(lineage),
    rarity: lineage.acquisitionTier === "premium" ? "legendary" : lineage.acquisitionTier === "uncommon" ? "epic" : "rare",
    icon: lineage.element === "earth" ? "🌱" : lineage.element === "river" ? "💧" : lineage.element === "sea" ? "🪸" : lineage.element === "volcano" ? "🌋" : lineage.element === "sky" ? "☁️" : lineage.element === "dark" ? "🌙" : "✨",
    lineageId: lineage.id,
  })),
  {
    key: "food-sunberry",
    kind: "food",
    name: "햇살열매",
    description: "알에는 부화 12포인트, 부화한 펫에는 경험치 30을 줘요.",
    price: 30,
    rarity: "common",
    icon: "🍓",
    itemKey: "food-sunberry",
    hatchPoints: 12,
    experience: 30,
  },
  {
    key: "hatch-hourglass",
    kind: "accelerator",
    name: "부화 모래시계",
    description: "알의 부화 진행도를 한 번에 55포인트 올려요.",
    price: 75,
    rarity: "rare",
    icon: "⏳",
    itemKey: "hatch-hourglass",
    hatchPoints: 55,
  },
  {
    key: "background-meadow",
    kind: "background",
    name: "바람 초원",
    description: "피팅룸과 수집 공간에 풀잎이 흐르는 배경 효과를 적용해요.",
    price: 100,
    rarity: "common",
    icon: "🌿",
    itemKey: "background-meadow",
    durable: true,
    backgroundClass: "meadow",
  },
  {
    key: "background-riverlight",
    kind: "background",
    name: "여울빛",
    description: "잔잔한 물결과 빛 점이 움직이는 배경 효과예요.",
    price: 120,
    rarity: "rare",
    icon: "🌊",
    itemKey: "background-riverlight",
    durable: true,
    backgroundClass: "riverlight",
  },
  {
    key: "background-ember",
    kind: "background",
    name: "따뜻한 불씨",
    description: "작은 불씨가 천천히 떠오르는 화산 배경 효과예요.",
    price: 150,
    rarity: "epic",
    icon: "🔥",
    itemKey: "background-ember",
    durable: true,
    backgroundClass: "ember",
  },
  {
    key: "background-aurora",
    kind: "background",
    name: "오로라 프리즘",
    description: "하늘·어둠·빛 계보와 어울리는 프리미엄 오로라 효과예요.",
    price: 220,
    rarity: "legendary",
    icon: "🌌",
    itemKey: "background-aurora",
    durable: true,
    backgroundClass: "aurora",
  },
];

const PRODUCT_BY_KEY = new Map(PET_PRODUCTS.map((product) => [product.key, product]));

export function getPetProduct(productKey: string): PetProduct | null {
  return PRODUCT_BY_KEY.get(productKey) ?? null;
}

export const PET_BACKGROUND_PRODUCTS = PET_PRODUCTS.filter(
  (product): product is PetProduct & { itemKey: string; backgroundClass: string } =>
    product.kind === "background" && typeof product.itemKey === "string" && typeof product.backgroundClass === "string",
);
