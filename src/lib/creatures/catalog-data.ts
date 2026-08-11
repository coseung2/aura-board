/**
 * The v2 Aura creature catalog.
 *
 * This file intentionally contains only immutable data and pure lookups. The
 * data is the small contract shared by the classroom shop, creature growth
 * code, and Character Asset Studio. It does not import the database or an
 * asset loader.
 */

export const CREATURE_CATALOG_REVISION = "creature-catalog-v2";
export const CREATURE_RULES_VERSION = "creature-rules-v1";

export const CREATURE_AFFINITIES = [
  "earth",
  "river",
  "sea",
  "volcano",
  "sky",
  "darkness",
  "light",
] as const;

export type CreatureAffinity = (typeof CREATURE_AFFINITIES)[number];

export const CREATURE_STAGES = ["egg", "hatchling", "juvenile", "evolved"] as const;

export type CreatureStage = (typeof CREATURE_STAGES)[number];

export const CREATURE_BEHAVIOR_KINDS = ["normal", "lazy", "signature"] as const;

export type CreatureBehaviorKind = (typeof CREATURE_BEHAVIOR_KINDS)[number];

export const CREATURE_RARITIES = ["common", "rare", "epic"] as const;

export type CreatureRarity = (typeof CREATURE_RARITIES)[number];

export const CREATURE_PRICE_TIERS = ["medium", "medium-high", "premium"] as const;

export type CreaturePriceTier = (typeof CREATURE_PRICE_TIERS)[number];

export const CREATURE_SHOP_PRODUCT_KINDS = [
  "random-egg",
  "affinity-egg",
  "food",
  "hatch-accelerator",
  "background-effect",
] as const;

export type CreatureShopProductKind = (typeof CREATURE_SHOP_PRODUCT_KINDS)[number];

/** A single named action in a Character Asset Studio behavior sheet. */
export type CreatureBehaviorSequence = {
  readonly kind: CreatureBehaviorKind;
  readonly actionId: string;
  readonly labelKo: string;
  readonly descriptionKo: string;
};

/** The asset references and behavior actions for one growth stage. */
export type CreatureStageDefinition = {
  readonly stage: CreatureStage;
  readonly packageId: string;
  readonly behaviorSheetId: string;
  readonly behaviorSheetPath: string;
  /** Canonical semantic order is normal, lazy, signature. */
  readonly behaviors: readonly CreatureBehaviorSequence[];
};

/** One original creature line, with a straight four-stage growth path. */
export type CreatureLineDefinition = {
  readonly key: string;
  readonly affinity: CreatureAffinity;
  readonly nameKo: string;
  readonly visualConcept: string;
  readonly visualConceptKo: string;
  readonly rarity: CreatureRarity;
  readonly priceTier: CreaturePriceTier;
  /** Integer weight used by the global random egg. */
  readonly randomEggWeight: number;
  /** Integer weight used when drawing within an affinity egg pool. */
  readonly affinityEggWeight: number;
  readonly stages: readonly CreatureStageDefinition[];
};

export type CreatureRandomEggEffect = {
  readonly type: "random-egg";
  readonly weights: readonly CreatureWeightedLine[];
};

export type CreatureAffinityEggEffect = {
  readonly type: "affinity-egg";
  readonly affinity: CreatureAffinity;
};

export type CreatureFoodEffect = {
  readonly type: "food";
  /** Progress points applied to the selected creature. */
  readonly progressPoints: number;
  /** Bounded nourishment units shown by the classroom UI. */
  readonly nourishment: number;
};

export type CreatureHatchAcceleratorEffect = {
  readonly type: "hatch-accelerator";
  /** Incubation-only progress. It cannot advance a hatched creature. */
  readonly hatchProgressPoints: number;
  readonly uses: number;
};

export type CreatureBackgroundEffect = {
  readonly type: "background-effect";
  readonly affinity: CreatureAffinity;
  readonly effectKey: string;
  readonly intensity: number;
};

export type CreatureShopProductEffect =
  | CreatureRandomEggEffect
  | CreatureAffinityEggEffect
  | CreatureFoodEffect
  | CreatureHatchAcceleratorEffect
  | CreatureBackgroundEffect;

/** An item sold for the existing classroom currency (no second currency). */
export type CreatureShopProduct = {
  readonly key: string;
  readonly kind: CreatureShopProductKind;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly price: number;
  readonly effect: CreatureShopProductEffect;
  readonly visible: boolean;
};

export type CreatureWeightedLine = {
  readonly lineKey: string;
  readonly weight: number;
};

export type CreatureCatalogValidationIssue = {
  readonly path: string;
  readonly message: string;
};

/** Cumulative points at which each stage is considered reached. */
export const CREATURE_STAGE_PROGRESS_THRESHOLDS: Readonly<Record<CreatureStage, number>> = {
  egg: 0,
  hatchling: 3,
  juvenile: 8,
  evolved: 15,
};

/** Short alias kept next to the canonical threshold map for callers. */
export const CREATURE_STAGE_THRESHOLDS = CREATURE_STAGE_PROGRESS_THRESHOLDS;

const makeBehavior = (
  kind: CreatureBehaviorKind,
  actionId: string,
  labelKo: string,
  descriptionKo: string,
): CreatureBehaviorSequence => ({ kind, actionId, labelKo, descriptionKo });

const makeBehaviors = (
  normal: readonly [string, string, string],
  lazy: readonly [string, string, string],
  signature: readonly [string, string, string],
): readonly CreatureBehaviorSequence[] => [
  makeBehavior("normal", normal[0], normal[1], normal[2]),
  makeBehavior("lazy", lazy[0], lazy[1], lazy[2]),
  makeBehavior("signature", signature[0], signature[1], signature[2]),
];

const makeStage = (
  lineKey: string,
  stage: CreatureStage,
  behaviors: readonly CreatureBehaviorSequence[],
): CreatureStageDefinition => ({
  stage,
  packageId: `character.aura.${lineKey}.${stage}`,
  behaviorSheetId: `behavior.aura.${lineKey}.${stage}.v1`,
  behaviorSheetPath: `/creatures/${lineKey}/${stage}/sheet.json`,
  behaviors,
});

/** Original lines for the canonical affinities; future lines may share an affinity. */
export const CREATURE_LINES = [
  {
    key: "terramote",
    affinity: "earth",
    nameKo: "테라모트",
    visualConcept: "A round moss-backed burrower with pebble feet and a seed-shaped crest.",
    visualConceptKo: "둥근 이끼 등과 자갈 발, 씨앗 모양 볏이 있는 땅굴 생물.",
    rarity: "common",
    priceTier: "medium",
    randomEggWeight: 24,
    affinityEggWeight: 1,
    stages: [
      makeStage("terramote", "egg", makeBehaviors(
        ["egg-still", "고요한 숨", "껍질 안에서 아주 작게 숨을 쉰다."],
        ["egg-sleepy-sway", "졸린 흔들", "따뜻한 흙 위에서 느리게 좌우로 흔들린다."],
        ["egg-soil-pulse", "흙맥박", "씨앗 무늬가 은은하게 빛나며 부화 금을 만든다."],
      )),
      makeStage("terramote", "hatchling", makeBehaviors(
        ["hatchling-moss-step", "이끼 발돋움", "작은 발로 이끼를 톡톡 밟으며 주변을 살핀다."],
        ["hatchling-stone-curl", "돌틈 웅크림", "납작한 돌 뒤에 몸을 말고 편안히 쉰다."],
        ["hatchling-seed-puff", "씨앗 흙먼지", "볍씨 같은 씨앗을 톡 튕겨 부드러운 흙먼지를 만든다."],
      )),
      makeStage("terramote", "juvenile", makeBehaviors(
        ["juvenile-root-hop", "뿌리 점프", "뿌리를 디딤돌 삼아 통통 뛰어오른다."],
        ["juvenile-shade-nap", "그늘 낮잠", "잎사귀 그늘에서 눈을 감고 천천히 꼬리를 흔든다."],
        ["juvenile-pebble-bloom", "돌꽃 피우기", "주변 자갈 사이로 작은 돌꽃을 피워낸다."],
      )),
      makeStage("terramote", "evolved", makeBehaviors(
        ["evolved-earth-greeting", "대지 인사", "앞발을 땅에 대고 친구들에게 차분히 인사한다."],
        ["evolved-root-dance", "느긋한 뿌리춤", "긴 뿌리를 천천히 흔들며 여유를 즐긴다."],
        ["evolved-tiny-quake", "작은 지진 리듬", "발구르기로 안전한 리듬 진동을 만들어 모두를 웃긴다."],
      )),
    ],
  },
  {
    key: "ripplekin",
    affinity: "river",
    nameKo: "리플킨",
    visualConcept: "A bright stream-sprite with a ribbon tail, reed ears, and clear pebble eyes.",
    visualConceptKo: "리본 꼬리와 갈대 귀, 맑은 조약돌 눈을 가진 개울 요정.",
    rarity: "common",
    priceTier: "medium",
    randomEggWeight: 20,
    affinityEggWeight: 1,
    stages: [
      makeStage("ripplekin", "egg", makeBehaviors(
        ["egg-water-breathe", "물결 숨", "알 표면의 물결무늬가 잔잔히 오르내린다."],
        ["egg-reed-sway", "갈대 졸음", "강가의 갈대처럼 느릿느릿 몸을 기울인다."],
        ["egg-river-drop", "강물 한 방울", "푸른 물방울 하나가 톡 떨어지며 껍질을 적신다."],
      )),
      makeStage("ripplekin", "hatchling", makeBehaviors(
        ["hatchling-puddle-skip", "웅덩이 첨벙", "작은 발로 웅덩이를 가볍게 건너뛴다."],
        ["hatchling-reed-rest", "갈대 기대기", "갈대에 기대어 물소리를 들으며 쉰다."],
        ["hatchling-ripple-call", "물결 부름", "꼬리로 원을 그려 친구에게 잔물결 신호를 보낸다."],
      )),
      makeStage("ripplekin", "juvenile", makeBehaviors(
        ["juvenile-stream-dash", "시냇물 달리기", "시냇물 위를 물방울처럼 빠르게 달린다."],
        ["juvenile-bank-lounge", "강둑 늘어지기", "강둑에 누워 꼬리 끝만 물에 담근다."],
        ["juvenile-rainbow-loop", "무지개 고리", "물고리와 빛을 겹쳐 작은 무지개 고리를 만든다."],
      )),
      makeStage("ripplekin", "evolved", makeBehaviors(
        ["evolved-river-bow", "강물 큰절", "강의 흐름을 따라 몸을 낮추며 우아하게 인사한다."],
        ["evolved-delta-drift", "삼각주 떠돌기", "느린 물살처럼 편안하게 좌우로 떠다닌다."],
        ["evolved-spring-rise", "샘솟는 춤", "꼬리로 물기둥을 올리고 그 안에서 빙글돈다."],
      )),
    ],
  },
  {
    key: "tidalume",
    affinity: "sea",
    nameKo: "타이달룸",
    visualConcept: "A gentle tide creature with a shell hood, fin-like sleeves, and bioluminescent freckles.",
    visualConceptKo: "조개 후드와 지느러미 소매, 야광 주근깨가 있는 잔잔한 조수 생물.",
    rarity: "common",
    priceTier: "medium",
    randomEggWeight: 17,
    affinityEggWeight: 1,
    stages: [
      makeStage("tidalume", "egg", makeBehaviors(
        ["egg-tide-breathe", "조수 숨결", "조수처럼 표면의 선이 천천히 밝아졌다 어두워진다."],
        ["egg-shell-nod", "조개 끄덕임", "조개껍질이 졸린 듯 살짝 열렸다 닫힌다."],
        ["egg-salt-spark", "소금빛 반짝", "소금 알갱이 같은 빛이 껍질 가장자리를 한 바퀴 돈다."],
      )),
      makeStage("tidalume", "hatchling", makeBehaviors(
        ["hatchling-fin-clap", "지느러미 박수", "작은 지느러미를 마주치며 물거품을 만든다."],
        ["hatchling-shell-hide", "조개 숨기", "후드 같은 껍질 안으로 얼굴을 쏙 숨긴다."],
        ["hatchling-foam-star", "거품 별", "거품 세 개를 모아 별 모양을 띄운다."],
      )),
      makeStage("tidalume", "juvenile", makeBehaviors(
        ["juvenile-wave-glide", "파도 미끄럼", "작은 파도를 타고 수면을 미끄러진다."],
        ["juvenile-reef-rest", "산호 그늘", "산호 그늘에 기대어 조용히 휴식한다."],
        ["juvenile-lumen-trail", "빛꼬리 길", "야광 점을 남기며 바닷속에 반짝이는 길을 낸다."],
      )),
      makeStage("tidalume", "evolved", makeBehaviors(
        ["evolved-tide-welcome", "조수 환영", "큰 지느러미로 밀려오는 파도를 부드럽게 맞이한다."],
        ["evolved-deep-drift", "깊은 바다 유영", "느린 해류를 따라 깊고 편안하게 유영한다."],
        ["evolved-moon-current", "달빛 해류", "달빛 같은 해류를 불러 주변을 은은하게 비춘다."],
      )),
    ],
  },
  {
    key: "cinderhorn",
    affinity: "volcano",
    nameKo: "신더혼",
    visualConcept: "A warm charcoal cub with a glassy ember horn and a soot-soft scarf of smoke.",
    visualConceptKo: "유리처럼 빛나는 잿불 뿔과 연기 목도리를 두른 따뜻한 숯빛 아기 생물.",
    rarity: "rare",
    priceTier: "medium-high",
    randomEggWeight: 13,
    affinityEggWeight: 1,
    stages: [
      makeStage("cinderhorn", "egg", makeBehaviors(
        ["egg-ember-breathe", "잿불 호흡", "알 속 작은 잿불이 일정한 간격으로 숨을 쉰다."],
        ["egg-warm-doze", "따뜻한 졸음", "열기가 포근한 담요처럼 번지며 알이 꾸벅인다."],
        ["egg-lava-thread", "용암 실금", "얇은 주황빛 실금이 잠깐 나타났다가 잦아든다."],
      )),
      makeStage("cinderhorn", "hatchling", makeBehaviors(
        ["hatchling-coal-hop", "숯불 깡충", "숯 조각 사이를 톡톡 뛰며 작은 열기를 남긴다."],
        ["hatchling-ash-curl", "재구름 웅크림", "재구름을 베개 삼아 몸을 둥글게 말고 쉰다."],
        ["hatchling-spark-sneeze", "불씨 재채기", "귀여운 재채기와 함께 불씨 세 개를 내뿜는다."],
      )),
      makeStage("cinderhorn", "juvenile", makeBehaviors(
        ["juvenile-magma-bound", "마그마 탄력", "식은 용암 위를 탄력 있게 뛰어다닌다."],
        ["juvenile-crater-lounge", "분화구 휴식", "안전한 분화구 가장자리에서 열기를 즐긴다."],
        ["juvenile-ember-ring", "잿불 고리", "뿔로 원을 그려 따뜻한 잿불 고리를 만든다."],
      )),
      makeStage("cinderhorn", "evolved", makeBehaviors(
        ["evolved-volcano-bow", "화산 인사", "뿔 끝의 빛을 낮추고 힘차게 고개 숙여 인사한다."],
        ["evolved-lava-lounge", "용암 느긋함", "천천히 흐르는 용암 옆에서 느긋하게 꼬리를 식힌다."],
        ["evolved-heartfire", "심장불꽃", "안전한 심장불꽃을 피워 친구들에게 온기를 나눈다."],
      )),
    ],
  },
  {
    key: "cloudwhisp",
    affinity: "sky",
    nameKo: "클라우드위스프",
    visualConcept: "A buoyant cloud-furred glider with a kite tail and tiny brass wind chimes.",
    visualConceptKo: "연 꼬리와 작은 황동 풍경을 단, 구름 털의 가벼운 활공 생물.",
    rarity: "epic",
    priceTier: "premium",
    randomEggWeight: 10,
    affinityEggWeight: 1,
    stages: [
      makeStage("cloudwhisp", "egg", makeBehaviors(
        ["egg-cloud-breathe", "구름 숨", "알 주변의 구름 테두리가 천천히 부풀었다 가라앉는다."],
        ["egg-drift-doze", "둥실 졸음", "바람을 타듯 아주 느리게 공중에서 흔들린다."],
        ["egg-wind-chime", "바람 풍경", "보이지 않는 바람이 작은 맑은 소리를 낸다."],
      )),
      makeStage("cloudwhisp", "hatchling", makeBehaviors(
        ["hatchling-cloud-step", "구름 발걸음", "발밑에 작은 구름을 만들며 한 칸씩 걷는다."],
        ["hatchling-sky-nest", "하늘 둥지", "구름 둥지에 파묻혀 편하게 눈을 감는다."],
        ["hatchling-breeze-pop", "산들바람 톡", "꼬리를 튕겨 산들바람 한 줄기를 보낸다."],
      )),
      makeStage("cloudwhisp", "juvenile", makeBehaviors(
        ["juvenile-kite-glide", "연 활공", "연처럼 꼬리를 펼치고 교실 위를 부드럽게 난다."],
        ["juvenile-sky-snooze", "하늘 낮잠", "느린 바람에 몸을 맡기고 구름 위에서 낮잠 잔다."],
        ["juvenile-gust-spiral", "돌풍 나선", "작은 돌풍을 나선으로 묶어 종이 리본을 춤추게 한다."],
      )),
      makeStage("cloudwhisp", "evolved", makeBehaviors(
        ["evolved-horizon-loop", "수평선 고리", "넓은 날개로 수평선을 그리며 한 바퀴 돈다."],
        ["evolved-jetstream-rest", "제트기류 쉼", "제트기류에 몸을 싣고 한동안 가만히 떠 있는다."],
        ["evolved-sky-lantern", "하늘 등불", "구름빛 등불을 띄워 모두의 길을 밝혀 준다."],
      )),
    ],
  },
  {
    key: "nocturnib",
    affinity: "darkness",
    nameKo: "녹터니브",
    visualConcept: "A soft midnight companion with crescent ears, ink-blue fur, and a constellation cloak.",
    visualConceptKo: "초승달 귀와 잉크빛 털, 별자리 망토를 두른 부드러운 한밤의 동반자.",
    rarity: "epic",
    priceTier: "premium",
    randomEggWeight: 8,
    affinityEggWeight: 1,
    stages: [
      makeStage("nocturnib", "egg", makeBehaviors(
        ["egg-night-breathe", "밤의 숨", "어두운 껍질에 별점이 천천히 깜박인다."],
        ["egg-moon-doze", "달잠", "달빛이 닿는 쪽으로 알이 살짝 기울어 잠든다."],
        ["egg-shadow-crack", "그림자 금", "그림자 같은 금이 생겼다가 부드럽게 사라진다."],
      )),
      makeStage("nocturnib", "hatchling", makeBehaviors(
        ["hatchling-moon-peek", "달빛 엿보기", "초승달 귀를 내밀고 조심스럽게 주변을 살핀다."],
        ["hatchling-ink-curl", "잉크 웅크림", "잉크빛 꼬리를 몸에 감고 조용히 쉰다."],
        ["hatchling-star-blink", "별눈 깜박임", "눈을 깜박일 때마다 작은 별 하나가 나타난다."],
      )),
      makeStage("nocturnib", "juvenile", makeBehaviors(
        ["juvenile-night-skip", "밤걸음 건너기", "그림자와 그림자 사이를 가볍게 건너뛴다."],
        ["juvenile-quiet-corner", "고요한 구석", "조용한 구석에서 망토를 이불처럼 덮고 쉰다."],
        ["juvenile-constellation", "별자리 펼치기", "망토 위 별을 이어 오늘의 별자리를 만든다."],
      )),
      makeStage("nocturnib", "evolved", makeBehaviors(
        ["evolved-midnight-waltz", "자정 왈츠", "어둠을 해치지 않는 느린 왈츠로 주변을 감싼다."],
        ["evolved-dream-drift", "꿈결 부유", "친구들의 꿈 곁을 조용히 떠다니며 편안히 쉰다."],
        ["evolved-velvet-night", "벨벳 밤", "부드러운 밤막을 펼쳐 모두가 집중할 수 있게 한다."],
      )),
    ],
  },
  {
    key: "dawnlet",
    affinity: "light",
    nameKo: "던릿",
    visualConcept: "A sunrise-colored helper with petal ears, a prism tail, and a warm lantern core.",
    visualConceptKo: "꽃잎 귀와 프리즘 꼬리, 따뜻한 등불 심장을 가진 아침빛 도우미.",
    rarity: "epic",
    priceTier: "premium",
    randomEggWeight: 8,
    affinityEggWeight: 1,
    stages: [
      makeStage("dawnlet", "egg", makeBehaviors(
        ["egg-dawn-breathe", "새벽 숨결", "복숭아빛 껍질이 새벽처럼 천천히 밝아진다."],
        ["egg-sunrise-nod", "해돋이 끄덕임", "따뜻한 빛 속에서 포근하게 고개를 끄덕인다."],
        ["egg-prism-crack", "프리즘 실금", "무지개빛 실금이 나타나며 부화 시간을 알린다."],
      )),
      makeStage("dawnlet", "hatchling", makeBehaviors(
        ["hatchling-petal-open", "꽃잎 펼치기", "꽃잎 귀를 펼쳐 주변에 작은 빛을 나눈다."],
        ["hatchling-lamp-cuddle", "등불 안기", "작은 등불 심장을 꼭 안고 나른하게 쉰다."],
        ["hatchling-prism-pop", "프리즘 팡", "꼬리를 흔들어 세 줄의 색빛을 튕긴다."],
      )),
      makeStage("dawnlet", "juvenile", makeBehaviors(
        ["juvenile-sunbeam-run", "햇살 달리기", "햇살 조각을 밟으며 환하게 달린다."],
        ["juvenile-golden-rest", "황금빛 휴식", "금빛 웅덩이 안에서 눈을 감고 충전한다."],
        ["juvenile-rainbow-arc", "무지개 아치", "프리즘 꼬리로 작은 무지개 아치를 세운다."],
      )),
      makeStage("dawnlet", "evolved", makeBehaviors(
        ["evolved-daybreak-welcome", "아침맞이", "주변을 따뜻하게 밝히며 새로운 하루를 맞이한다."],
        ["evolved-sunlit-pause", "햇빛 멈춤", "빛 한가운데서 느긋하게 쉬며 주변을 포근하게 한다."],
        ["evolved-kindness-beacon", "다정한 등대", "길 잃은 마음을 찾아주는 다정한 빛을 멀리 보낸다."],
      )),
    ],
  },
] as const satisfies readonly CreatureLineDefinition[];

/** Deterministic weights derived from line metadata; do not use Math.random(). */
export const CREATURE_RANDOM_EGG_WEIGHTS: readonly CreatureWeightedLine[] =
  CREATURE_LINES.map((line) => ({
    lineKey: line.key,
    weight: line.randomEggWeight,
  }));

/** The complete v2 shop catalog, priced in classroom currency units. */
export const CREATURE_SHOP_PRODUCTS = [
  {
    key: "egg-random-01",
    kind: "random-egg",
    labelKo: "두근두근 랜덤 알",
    descriptionKo: "모든 종족/계열 중 하나를 가중 무작위로 만나는 알.",
    price: 150,
    effect: { type: "random-egg", weights: CREATURE_RANDOM_EGG_WEIGHTS },
    visible: true,
  },
  {
    key: "egg-earth-01",
    kind: "affinity-egg",
    labelKo: "대지 알",
    descriptionKo: "해당 종족/기운 안의 캐릭터 중 하나를 무작위로 만나는 대지 알.",
    price: 100,
    effect: { type: "affinity-egg", affinity: "earth" },
    visible: true,
  },
  {
    key: "egg-river-01",
    kind: "affinity-egg",
    labelKo: "강물 알",
    descriptionKo: "해당 종족/기운 안의 캐릭터 중 하나를 무작위로 만나는 강물 알.",
    price: 110,
    effect: { type: "affinity-egg", affinity: "river" },
    visible: true,
  },
  {
    key: "egg-sea-01",
    kind: "affinity-egg",
    labelKo: "바다 알",
    descriptionKo: "해당 종족/기운 안의 캐릭터 중 하나를 무작위로 만나는 바다 알.",
    price: 120,
    effect: { type: "affinity-egg", affinity: "sea" },
    visible: true,
  },
  {
    key: "egg-volcano-01",
    kind: "affinity-egg",
    labelKo: "화산 알",
    descriptionKo: "해당 종족/기운 안의 캐릭터 중 하나를 무작위로 만나는 화산 알.",
    price: 180,
    effect: { type: "affinity-egg", affinity: "volcano" },
    visible: true,
  },
  {
    key: "egg-sky-01",
    kind: "affinity-egg",
    labelKo: "하늘 알",
    descriptionKo: "해당 종족/기운 안의 캐릭터 중 하나를 무작위로 만나는 하늘 알.",
    price: 260,
    effect: { type: "affinity-egg", affinity: "sky" },
    visible: true,
  },
  {
    key: "egg-darkness-01",
    kind: "affinity-egg",
    labelKo: "밤그늘 알",
    descriptionKo: "해당 종족/기운 안의 캐릭터 중 하나를 무작위로 만나는 밤그늘 알.",
    price: 280,
    effect: { type: "affinity-egg", affinity: "darkness" },
    visible: true,
  },
  {
    key: "egg-light-01",
    kind: "affinity-egg",
    labelKo: "빛 알",
    descriptionKo: "해당 종족/기운 안의 캐릭터 중 하나를 무작위로 만나는 빛 알.",
    price: 300,
    effect: { type: "affinity-egg", affinity: "light" },
    visible: true,
  },
  {
    key: "food-dew-01",
    kind: "food",
    labelKo: "이슬 사탕",
    descriptionKo: "작은 생물의 배를 채우는 달콤한 이슬 한 방울.",
    price: 30,
    effect: { type: "food", progressPoints: 1, nourishment: 1 },
    visible: true,
  },
  {
    key: "food-sprout-01",
    kind: "food",
    labelKo: "새싹 쿠키",
    descriptionKo: "성장을 돕는 바삭한 새싹 모양 간식.",
    price: 55,
    effect: { type: "food", progressPoints: 2, nourishment: 2 },
    visible: true,
  },
  {
    key: "food-rainbow-01",
    kind: "food",
    labelKo: "무지개 젤리",
    descriptionKo: "기분까지 환하게 해 주는 알록달록 간식.",
    price: 90,
    effect: { type: "food", progressPoints: 4, nourishment: 3 },
    visible: true,
  },
  {
    key: "accelerator-warmth-01",
    kind: "hatch-accelerator",
    labelKo: "포근한 부화 담요",
    descriptionKo: "알이 안정적으로 다음 성장 단계에 가까워진다.",
    price: 70,
    effect: { type: "hatch-accelerator", hatchProgressPoints: 2, uses: 1 },
    visible: true,
  },
  {
    key: "accelerator-spark-01",
    kind: "hatch-accelerator",
    labelKo: "성장 불씨",
    descriptionKo: "알의 부화 에너지를 한 번에 가득 채운다.",
    price: 140,
    effect: { type: "hatch-accelerator", hatchProgressPoints: 3, uses: 1 },
    visible: true,
  },
  {
    key: "background-earth-01",
    kind: "background-effect",
    labelKo: "이끼 바닥 효과",
    descriptionKo: "발밑에 은은한 이끼 빛이 번진다.",
    price: 45,
    effect: { type: "background-effect", affinity: "earth", effectKey: "ground-moss-glow", intensity: 1 },
    visible: true,
  },
  {
    key: "background-river-01",
    kind: "background-effect",
    labelKo: "물결 반짝 효과",
    descriptionKo: "주변에 작은 강물 반짝임이 흐른다.",
    price: 50,
    effect: { type: "background-effect", affinity: "river", effectKey: "river-ripples", intensity: 1 },
    visible: true,
  },
  {
    key: "background-sea-01",
    kind: "background-effect",
    labelKo: "바다 거품 효과",
    descriptionKo: "느린 거품과 푸른 빛이 가장자리를 장식한다.",
    price: 55,
    effect: { type: "background-effect", affinity: "sea", effectKey: "sea-foam", intensity: 1 },
    visible: true,
  },
  {
    key: "background-volcano-01",
    kind: "background-effect",
    labelKo: "잿불 부유 효과",
    descriptionKo: "작은 잿불 조각이 안전하게 떠다닌다.",
    price: 65,
    effect: { type: "background-effect", affinity: "volcano", effectKey: "volcanic-embers", intensity: 1 },
    visible: true,
  },
  {
    key: "background-sky-01",
    kind: "background-effect",
    labelKo: "구름 길 효과",
    descriptionKo: "느린 구름 조각이 하늘을 가로지른다.",
    price: 75,
    effect: { type: "background-effect", affinity: "sky", effectKey: "sky-cloud-trail", intensity: 1 },
    visible: true,
  },
  {
    key: "background-darkness-01",
    kind: "background-effect",
    labelKo: "별그늘 효과",
    descriptionKo: "차분한 별점이 어두운 배경에 반짝인다.",
    price: 80,
    effect: { type: "background-effect", affinity: "darkness", effectKey: "midnight-stars", intensity: 1 },
    visible: true,
  },
  {
    key: "background-light-01",
    kind: "background-effect",
    labelKo: "새벽 오라 효과",
    descriptionKo: "따뜻한 새벽 오라가 화면 가장자리를 감싼다.",
    price: 85,
    effect: { type: "background-effect", affinity: "light", effectKey: "dawn-aura", intensity: 1 },
    visible: true,
  },
] as const satisfies readonly CreatureShopProduct[];
