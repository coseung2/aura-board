/**
 * Plant catalog — 10 species × up to 10 stages each.
 * Seed source for PJ-1. Idempotent upsert by species.key + (speciesId, order).
 *
 * Shape:
 *   { key, nameKo, emoji, difficulty, season, notes, stages: Stage[] }
 */

export type CatalogStage = {
  order: number;
  key: string;
  nameKo: string;
  icon: string;
  description: string;
  observationPoints: string[];
};

export type CatalogSpecies = {
  key: string;
  nameKo: string;
  emoji: string;
  difficulty: "easy" | "medium" | "hard";
  season: "spring" | "summer" | "fall" | "winter" | "all";
  notes: string;
  stages: CatalogStage[];
};

// 10 stages shared schema: seed → sprout → cotyledon → true-leaves → growth
//                          → bud → flower → pollination → fruit → mature
const SHARED_STAGES: CatalogStage[] = [
  { order: 1, key: "seed",        nameKo: "씨앗",   icon: "🌰", description: "씨앗을 심어요",
    observationPoints: ["씨앗의 크기와 색깔은?", "몇 개 심었나요?", "심은 날짜를 적어요."] },
  { order: 2, key: "sprout",      nameKo: "싹트기", icon: "🌱", description: "싹이 땅 위로 올라와요",
    observationPoints: ["싹의 색깔은?", "싹이 언제 나왔나요?", "흙은 촉촉한가요?"] },
  { order: 3, key: "cotyledon",   nameKo: "떡잎",   icon: "🌿", description: "떡잎이 펼쳐져요",
    observationPoints: ["떡잎의 모양은?", "떡잎은 몇 장인가요?", "만져본 느낌을 적어요."] },
  { order: 4, key: "true-leaves", nameKo: "본잎",   icon: "🍃", description: "진짜 잎이 나요",
    observationPoints: ["본잎과 떡잎은 어떻게 다른가요?", "잎의 가장자리는?", "잎맥이 보이나요?"] },
  { order: 5, key: "growth",      nameKo: "자람",   icon: "🌾", description: "키가 자라요",
    observationPoints: ["얼마나 자랐나요? (자로 재어봐요)", "줄기의 모양은?", "잎은 몇 장이 되었나요?"] },
  { order: 6, key: "bud",         nameKo: "꽃봉오리", icon: "🌵", description: "꽃봉오리가 맺혀요",
    observationPoints: ["봉오리의 색깔은?", "위치는 어디인가요? (줄기 끝/잎 겨드랑이)", "만져본 느낌은?"] },
  { order: 7, key: "flower",      nameKo: "꽃",     icon: "🌸", description: "꽃이 활짝 피어요",
    observationPoints: ["꽃잎의 색과 수는?", "꽃받침/수술/암술을 찾아봐요.", "향기가 나나요?"] },
  { order: 8, key: "pollination", nameKo: "수정/열매 맺힘", icon: "🐝", description: "꽃이 지고 열매가 맺혀요",
    observationPoints: ["벌·나비를 보았나요?", "꽃잎이 어떻게 변했나요?", "작은 열매가 보이나요?"] },
  { order: 9, key: "fruit",       nameKo: "열매 익음", icon: "🍅", description: "열매가 커지고 익어요",
    observationPoints: ["열매 색의 변화는?", "크기는 얼마?", "냄새는 어떤가요?"] },
  { order: 10, key: "mature",     nameKo: "수확",   icon: "🏁", description: "드디어 수확!",
    observationPoints: ["수확 날짜와 개수는?", "맛은 어떤가요?", "관찰일지를 마무리하며 느낀 점을 적어요."] },
];

// Species-specific overrides — icon/description for later stages.
function customize(overrides: Partial<Record<string, Partial<CatalogStage>>>): CatalogStage[] {
  return SHARED_STAGES.map((s) => {
    const o = overrides[s.key];
    if (!o) return s;
    return { ...s, ...o, observationPoints: o.observationPoints ?? s.observationPoints };
  });
}

export const PLANT_CATALOG: CatalogSpecies[] = [
  {
    key: "tomato", nameKo: "토마토", emoji: "🍅",
    difficulty: "easy", season: "spring",
    notes: "햇볕을 좋아해요. 물은 흙 위가 마르면 듬뿍.",
    stages: customize({
      flower: { icon: "💛" },
      fruit:  { icon: "🍅", description: "초록→빨강으로 익어요" },
    }),
  },
  {
    key: "strawberry", nameKo: "딸기", emoji: "🍓",
    difficulty: "medium", season: "spring",
    notes: "시원한 곳을 좋아해요. 꽃이 지면 열매가 맺혀요.",
    stages: customize({
      flower: { icon: "🌼" },
      fruit:  { icon: "🍓" },
    }),
  },
  {
    key: "sunflower", nameKo: "해바라기", emoji: "🌻",
    difficulty: "easy", season: "summer",
    notes: "해를 따라 고개를 돌려요. 키가 아주 크게 자라요.",
    stages: customize({
      flower: { icon: "🌻", description: "노란 해바라기가 피었어요" },
      fruit:  { icon: "🌻", description: "가운데에 씨가 가득해요" },
      mature: { icon: "🌻", description: "씨를 받아요" },
    }),
  },
  {
    key: "marigold", nameKo: "메리골드(금잔화)", emoji: "🌼",
    difficulty: "easy", season: "spring",
    notes: "병충해에 강해요. 꽃이 오래 피어요.",
    stages: customize({
      flower: { icon: "🌼" },
      fruit:  { icon: "🌼", description: "꽃이 지고 씨가 맺혀요" },
    }),
  },
  {
    key: "radish", nameKo: "무", emoji: "🥬",
    difficulty: "easy", season: "fall",
    notes: "뿌리 채소라 땅 속이 중요해요. 흙을 부드럽게.",
    stages: customize({
      flower: { icon: "🌼", description: "작은 흰 꽃이 피어요" },
      fruit:  { icon: "🥬", description: "땅 속 뿌리가 굵어져요" },
      mature: { icon: "🥕", description: "뽑아 보아요!" },
    }),
  },
  {
    key: "lettuce", nameKo: "상추", emoji: "🥬",
    difficulty: "easy", season: "spring",
    notes: "서늘한 날씨를 좋아해요. 잎을 계속 뜯어 먹을 수 있어요.",
    stages: customize({
      bud:    { icon: "🥬", description: "꽃대가 올라와요" },
      flower: { icon: "🌼" },
      fruit:  { icon: "🌾", description: "씨가 맺혀요" },
      mature: { icon: "🥗", description: "잎을 수확해요" },
    }),
  },
  {
    key: "bean", nameKo: "강낭콩", emoji: "🫘",
    difficulty: "easy", season: "spring",
    notes: "발아가 빨라 관찰하기 좋아요. 줄기가 길게 뻗어요.",
    stages: customize({
      flower: { icon: "🌼" },
      fruit:  { icon: "🫛", description: "콩깍지가 맺혀요" },
      mature: { icon: "🫘", description: "콩을 꺼내 봐요" },
    }),
  },
  {
    key: "cucumber", nameKo: "오이", emoji: "🥒",
    difficulty: "medium", season: "summer",
    notes: "덩굴이 뻗어요. 받침대가 필요해요.",
    stages: customize({
      flower: { icon: "💛" },
      fruit:  { icon: "🥒" },
    }),
  },
  {
    key: "pepper", nameKo: "고추", emoji: "🌶️",
    difficulty: "medium", season: "summer",
    notes: "여름을 좋아해요. 꽃은 하얀색.",
    stages: customize({
      flower: { icon: "🤍" },
      fruit:  { icon: "🌶️", description: "초록→빨강으로 익어요" },
    }),
  },
  {
    key: "pansy", nameKo: "팬지", emoji: "💜",
    difficulty: "easy", season: "spring",
    notes: "시원한 계절을 좋아해요. 색이 다양해요.",
    stages: customize({
      flower: { icon: "💜" },
      fruit:  { icon: "🌼", description: "꽃이 지고 씨가 맺혀요" },
    }),
  },
];
