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

const LINE_BY_KEY = new Map<string, CreatureLineDefinition>(
  CREATURE_LINES.map((line) => [line.key, line]),
);
const PRODUCT_BY_KEY = new Map<string, CreatureShopProduct>(
  CREATURE_SHOP_PRODUCTS.map((product) => [product.key, product]),
);

export function getCreatureLine(lineKey: string): CreatureLineDefinition | undefined {
  return LINE_BY_KEY.get(lineKey);
}

export function getCreatureShopProduct(productKey: string): CreatureShopProduct | undefined {
  return PRODUCT_BY_KEY.get(productKey);
}

export function getCreatureStageDefinition(
  lineKey: string,
  stage: CreatureStage,
): CreatureStageDefinition | undefined {
  return getCreatureLine(lineKey)?.stages.find((entry) => entry.stage === stage);
}

export function listCreatureShopProducts(
  kind?: CreatureShopProductKind,
): readonly CreatureShopProduct[] {
  if (kind === undefined) return CREATURE_SHOP_PRODUCTS;
  return CREATURE_SHOP_PRODUCTS.filter((product) => product.kind === kind);
}

/** Build the weighted pool for an affinity egg from every matching line. */
export function buildAffinityEggPool(
  affinity: CreatureAffinity,
  lines: readonly CreatureLineDefinition[] = CREATURE_LINES,
): readonly CreatureWeightedLine[] {
  return lines
    .filter((line) => line.affinity === affinity)
    .map((line) => ({ lineKey: line.key, weight: line.affinityEggWeight }));
}

/**
 * Return unowned lines first. Once every known line is owned, return the full
 * pool so a random egg can still be purchased. Set semantics prevent duplicate
 * owned keys from changing the result.
 */
export function buildEffectiveRandomEggPool(
  ownedLineKeys: readonly string[] = [],
): readonly CreatureWeightedLine[] {
  const owned = new Set<string>();
  if (Array.isArray(ownedLineKeys)) {
    for (const key of ownedLineKeys) if (typeof key === "string") owned.add(key);
  }
  const unowned = CREATURE_RANDOM_EGG_WEIGHTS.filter((entry) => !owned.has(entry.lineKey));
  const source = unowned.length > 0 ? unowned : CREATURE_RANDOM_EGG_WEIGHTS;
  return source.map((entry) => ({ lineKey: entry.lineKey, weight: entry.weight }));
}

/** Choose a line definition from a zero-based integer roll. */
export function chooseWeightedCreatureLine(
  pool: readonly CreatureWeightedLine[],
  roll: number,
): CreatureLineDefinition {
  if (!Array.isArray(pool) || pool.length === 0) {
    throw new RangeError("Creature random egg pool must not be empty");
  }
  if (!Number.isSafeInteger(roll) || roll < 0) {
    throw new RangeError("Creature random egg roll must be a non-negative integer");
  }

  let totalWeight = 0;
  for (const entry of pool) {
    if (
      !entry ||
      typeof entry.lineKey !== "string" ||
      !Number.isSafeInteger(entry.weight) ||
      entry.weight <= 0
    ) {
      throw new RangeError("Creature random egg weights must be positive integers");
    }
    totalWeight += entry.weight;
    if (!Number.isSafeInteger(totalWeight)) {
      throw new RangeError("Creature random egg total weight is out of bounds");
    }
  }
  if (roll >= totalWeight) {
    throw new RangeError(`Creature random egg roll must be less than ${totalWeight}`);
  }

  let cursor = roll;
  for (const entry of pool) {
    if (cursor < entry.weight) {
      const line = getCreatureLine(entry.lineKey);
      if (!line) throw new RangeError(`Unknown creature line: ${entry.lineKey}`);
      return line;
    }
    cursor -= entry.weight;
  }
  // The bounds check above makes this unreachable, but fail closed if data is
  // changed without updating the validation helper.
  throw new RangeError("Creature random egg roll did not select a line");
}

/** Key-only variant for persistence and database payloads. */
export function chooseWeightedCreatureLineKey(
  pool: readonly CreatureWeightedLine[],
  roll: number,
): string {
  return chooseWeightedCreatureLine(pool, roll).key;
}

export function getCreatureStageProgressThreshold(stage: CreatureStage): number {
  return CREATURE_STAGE_PROGRESS_THRESHOLDS[stage];
}

/** Resolve the highest stage reached by cumulative progress. */
export function getCreatureStageForProgress(progress: number): CreatureStage {
  if (!Number.isSafeInteger(progress) || progress < 0) {
    throw new RangeError("Creature progress must be a non-negative integer");
  }
  for (let index = CREATURE_STAGES.length - 1; index >= 0; index -= 1) {
    const stage = CREATURE_STAGES[index];
    if (progress >= getCreatureStageProgressThreshold(stage)) return stage;
  }
  return "egg";
}

/**
 * Return the immediate next stage. If progress is supplied, only return that
 * stage when the cumulative threshold has been reached; the evolved stage is
 * terminal and returns null.
 */
export function getNextCreatureStage(
  stage: CreatureStage,
  progress?: number,
): CreatureStage | null {
  const stageIndex = CREATURE_STAGES.indexOf(stage);
  if (stageIndex < 0 || stageIndex >= CREATURE_STAGES.length - 1) return null;
  const next = CREATURE_STAGES[stageIndex + 1];
  if (progress === undefined) return next;
  if (!Number.isSafeInteger(progress) || progress < 0) {
    throw new RangeError("Creature progress must be a non-negative integer");
  }
  return progress >= getCreatureStageProgressThreshold(next) ? next : null;
}

export type CreatureAssetBehaviorLookup = CreatureBehaviorSequence & {
  readonly lineKey: string;
  readonly affinity: CreatureAffinity;
  readonly stage: CreatureStage;
  readonly packageId: string;
  readonly behaviorSheetId: string;
  readonly behaviorSheetPath: string;
};

/** Resolve a behavior action together with the exact asset sheet references. */
export function getCreatureAssetBehaviorLookup(
  lineKey: string,
  stage: CreatureStage,
  kind: CreatureBehaviorKind,
): CreatureAssetBehaviorLookup | undefined {
  const line = getCreatureLine(lineKey);
  const stageDefinition = getCreatureStageDefinition(lineKey, stage);
  const behavior = stageDefinition?.behaviors.find((entry) => entry.kind === kind);
  if (!line || !stageDefinition || !behavior) return undefined;
  return {
    ...behavior,
    lineKey,
    affinity: line.affinity,
    stage,
    packageId: stageDefinition.packageId,
    behaviorSheetId: stageDefinition.behaviorSheetId,
    behaviorSheetPath: stageDefinition.behaviorSheetPath,
  };
}

const hasUniqueStrings = (values: readonly string[]): boolean =>
  new Set(values).size === values.length;

/**
 * Deterministically validate every catalog invariant. An empty diagnostics
 * array means the catalog is ready for use.
 */
export function validateCreatureCatalog(): readonly CreatureCatalogValidationIssue[] {
  const issues: CreatureCatalogValidationIssue[] = [];
  const issue = (path: string, message: string): void => {
    issues.push({ path, message });
  };

  if (CREATURE_LINES.length < CREATURE_AFFINITIES.length) {
    issue("lines", "There must be at least one line for every affinity");
  }
  const lineKeys = CREATURE_LINES.map((line) => line.key);
  if (!hasUniqueStrings(lineKeys)) issue("lines.key", "Line keys must be unique");
  const lineAffinities = CREATURE_LINES.map((line) => line.affinity);
  if (
    lineAffinities.some((affinity) => !CREATURE_AFFINITIES.includes(affinity)) ||
    CREATURE_AFFINITIES.some((affinity) => !lineAffinities.includes(affinity))
  ) {
    issue("lines.affinity", "Every canonical affinity must have at least one line");
  }

  for (const [lineIndex, line] of CREATURE_LINES.entries()) {
    const path = `lines[${lineIndex}]`;
    if (!Number.isSafeInteger(line.randomEggWeight) || line.randomEggWeight <= 0) {
      issue(`${path}.randomEggWeight`, "Random egg weight must be a positive integer");
    }
    if (!Number.isSafeInteger(line.affinityEggWeight) || line.affinityEggWeight <= 0) {
      issue(`${path}.affinityEggWeight`, "Affinity egg weight must be a positive integer");
    }
    if (!line.nameKo || !line.visualConcept || !line.visualConceptKo) {
      issue(path, "Line name and visual concept are required");
    }
    if (line.stages.length !== CREATURE_STAGES.length) {
      issue(`${path}.stages`, "Every line must define four stages");
    }
    const stages = line.stages.map((entry) => entry.stage);
    if (!hasUniqueStrings(stages) || CREATURE_STAGES.some((stage) => !stages.includes(stage))) {
      issue(`${path}.stages.stage`, "Every canonical stage must appear exactly once");
    }
    for (const [stageIndex, stage] of line.stages.entries()) {
      const stagePath = `${path}.stages[${stageIndex}]`;
      const expectedPackageId = `character.aura.${line.key}.${stage.stage}`;
      if (stage.packageId !== expectedPackageId) {
        issue(`${stagePath}.packageId`, `Expected package ID ${expectedPackageId}`);
      }
      if (!/^behavior\.aura\.[a-z0-9-]+\.(egg|hatchling|juvenile|evolved)\.v1$/.test(stage.behaviorSheetId)) {
        issue(`${stagePath}.behaviorSheetId`, "Behavior sheet ID has an invalid format");
      }
      if (!/^\/creatures\/[a-z0-9-]+\/(egg|hatchling|juvenile|evolved)\/sheet\.json$/.test(stage.behaviorSheetPath)) {
        issue(`${stagePath}.behaviorSheetPath`, "Behavior sheet path has an invalid format");
      }
      if (stage.behaviors.length !== CREATURE_BEHAVIOR_KINDS.length) {
        issue(`${stagePath}.behaviors`, "Every stage must define exactly three behaviors");
      }
      const kinds = stage.behaviors.map((entry) => entry.kind);
      if (!hasUniqueStrings(kinds) || CREATURE_BEHAVIOR_KINDS.some((kind) => !kinds.includes(kind))) {
        issue(`${stagePath}.behaviors.kind`, "Normal, lazy, and signature are required exactly once");
      }
      for (const [behaviorIndex, behavior] of stage.behaviors.entries()) {
        if (!behavior.actionId || !behavior.labelKo || !behavior.descriptionKo) {
          issue(`${stagePath}.behaviors[${behaviorIndex}]`, "Behavior action metadata is required");
        }
      }
    }
  }

  if (CREATURE_RANDOM_EGG_WEIGHTS.length !== CREATURE_LINES.length) {
    issue("randomEggWeights", "Random egg weights must cover every line");
  }
  const weightedKeys = CREATURE_RANDOM_EGG_WEIGHTS.map((entry) => entry.lineKey);
  if (!hasUniqueStrings(weightedKeys) || weightedKeys.some((key) => !LINE_BY_KEY.has(key))) {
    issue("randomEggWeights.lineKey", "Random egg weights must reference each line once");
  }
  for (const [index, entry] of CREATURE_RANDOM_EGG_WEIGHTS.entries()) {
    if (!Number.isSafeInteger(entry.weight) || entry.weight <= 0) {
      issue(`randomEggWeights[${index}].weight`, "Weight must be a positive integer");
    }
    if (LINE_BY_KEY.get(entry.lineKey)?.randomEggWeight !== entry.weight) {
      issue(`randomEggWeights[${index}]`, "Weight must match the line definition");
    }
  }

  const randomWeightByAffinity = new Map<CreatureAffinity, number>(
    CREATURE_AFFINITIES.map((affinity) => [affinity, 0]),
  );
  for (const entry of CREATURE_RANDOM_EGG_WEIGHTS) {
    const affinity = LINE_BY_KEY.get(entry.lineKey)?.affinity;
    if (!affinity) continue;
    randomWeightByAffinity.set(
      affinity,
      (randomWeightByAffinity.get(affinity) ?? 0) + entry.weight,
    );
  }
  const randomAffinityTotals = CREATURE_AFFINITIES.map(
    (affinity) => randomWeightByAffinity.get(affinity) ?? 0,
  );
  for (let index = 1; index <= 4; index += 1) {
    if (!(randomAffinityTotals[index - 1]! > randomAffinityTotals[index]!)) {
      issue(
        "randomEggWeights.affinityOrder",
        "Affinity totals must descend earth, river, sea, volcano, sky",
      );
      break;
    }
  }
  const skyTotal = randomWeightByAffinity.get("sky") ?? 0;
  const darknessTotal = randomWeightByAffinity.get("darkness") ?? 0;
  const lightTotal = randomWeightByAffinity.get("light") ?? 0;
  if (!(skyTotal > darknessTotal && skyTotal > lightTotal)) {
    issue(
      "randomEggWeights.affinityOrder",
      "Darkness and light totals must remain below sky (they may tie)",
    );
  }

  const productKeys = CREATURE_SHOP_PRODUCTS.map((product) => product.key);
  if (!hasUniqueStrings(productKeys)) issue("products.key", "Product keys must be unique");
  for (const [index, product] of CREATURE_SHOP_PRODUCTS.entries()) {
    const path = `products[${index}]`;
    if (!CREATURE_SHOP_PRODUCT_KINDS.includes(product.kind)) issue(`${path}.kind`, "Unknown product kind");
    if (!Number.isSafeInteger(product.price) || product.price <= 0 || product.price > 10_000) {
      issue(`${path}.price`, "Price must be a bounded positive integer");
    }
    if (!product.labelKo || !product.descriptionKo || product.visible !== true) {
      issue(path, "Product label, description, and visibility are required");
    }
    if (product.effect.type !== product.kind) issue(`${path}.effect.type`, "Effect type must match product kind");
    if (product.effect.type === "food" && (!Number.isSafeInteger(product.effect.progressPoints) || product.effect.progressPoints <= 0)) {
      issue(`${path}.effect.progressPoints`, "Food progress must be a positive integer");
    }
    if (product.effect.type === "hatch-accelerator" && (!Number.isSafeInteger(product.effect.hatchProgressPoints) || product.effect.hatchProgressPoints <= 0)) {
      issue(`${path}.effect.hatchProgressPoints`, "Hatch progress must be a positive integer");
    }
    if (product.effect.type === "affinity-egg") {
      const pool = buildAffinityEggPool(product.effect.affinity);
      if (pool.length === 0) {
        issue(`${path}.effect`, "Affinity egg pool must not be empty");
      }
      for (const [poolIndex, entry] of pool.entries()) {
        if (!Number.isSafeInteger(entry.weight) || entry.weight <= 0) {
          issue(
            `${path}.effect.pool[${poolIndex}].weight`,
            "Affinity egg weights must be positive integers",
          );
        }
      }
    }
    if (product.effect.type === "background-effect" && (!product.effect.effectKey || !Number.isSafeInteger(product.effect.intensity) || product.effect.intensity <= 0)) {
      issue(`${path}.effect`, "Background effect key and positive intensity are required");
    }
  }

  const randomProducts = CREATURE_SHOP_PRODUCTS.filter((product) => product.kind === "random-egg");
  const affinityProducts = CREATURE_SHOP_PRODUCTS.filter((product) => product.kind === "affinity-egg");
  const foodProducts = CREATURE_SHOP_PRODUCTS.filter((product) => product.kind === "food");
  const acceleratorProducts = CREATURE_SHOP_PRODUCTS.filter((product) => product.kind === "hatch-accelerator");
  const backgroundProducts = CREATURE_SHOP_PRODUCTS.filter((product) => product.kind === "background-effect");
  if (randomProducts.length !== 1) issue("products.random-egg", "There must be one random egg product");
  if (affinityProducts.length !== CREATURE_AFFINITIES.length) issue("products.affinity-egg", "There must be one egg product per affinity");
  if (foodProducts.length < 3) issue("products.food", "At least three food products are required");
  if (acceleratorProducts.length < 2) issue("products.hatch-accelerator", "At least two hatch accelerators are required");
  if (backgroundProducts.length !== CREATURE_AFFINITIES.length) issue("products.background-effect", "There must be one background effect per affinity");

  const randomPrice = randomProducts[0]?.price;
  const baseAffinities = new Set<CreatureAffinity>(["earth", "river", "sea"]);
  const premiumAffinities = new Set<CreatureAffinity>(["volcano", "sky", "darkness", "light"]);
  const affinityPrices = affinityProducts.flatMap((product) =>
    product.effect.type === "affinity-egg"
      ? [{ affinity: product.effect.affinity, price: product.price }]
      : [],
  );
  const basePrices = affinityPrices
    .filter(({ affinity }) => baseAffinities.has(affinity))
    .map(({ price }) => price);
  const premiumPrices = affinityPrices
    .filter(({ affinity }) => premiumAffinities.has(affinity))
    .map(({ price }) => price);
  if (
    randomPrice !== undefined &&
    (basePrices.length === 0 || premiumPrices.length === 0 ||
      randomPrice <= Math.max(...basePrices) ||
      randomPrice >= Math.min(...premiumPrices))
  ) {
    issue(
      "products.random-egg.price",
      "Random egg price must be above basic affinity eggs and below premium affinity eggs",
    );
  }
  const affinityByKey = new Set<string>();
  for (const product of affinityProducts) {
    if (product.effect.type !== "affinity-egg") continue;
    if (affinityByKey.has(product.effect.affinity)) issue("products.affinity-egg", "Affinity eggs must be unique");
    affinityByKey.add(product.effect.affinity);
    if (!CREATURE_AFFINITIES.includes(product.effect.affinity)) {
      issue("products.affinity-egg.effect", "Affinity egg must reference a canonical affinity");
    }
    if (!CREATURE_LINES.some((line) => line.affinity === product.effect.affinity)) {
      issue("products.affinity-egg.effect", "Affinity egg must reference an affinity with at least one line");
    }
  }
  if (CREATURE_AFFINITIES.some((affinity) => !affinityByKey.has(affinity))) {
    issue("products.affinity-egg", "Affinity eggs must cover every affinity");
  }
  const backgroundAffinities = new Set<string>();
  for (const product of backgroundProducts) {
    if (product.effect.type !== "background-effect") continue;
    if (backgroundAffinities.has(product.effect.affinity)) issue("products.background-effect", "Background affinities must be unique");
    backgroundAffinities.add(product.effect.affinity);
  }
  return issues;
}

/** A snapshot useful to tests and diagnostics; the data itself remains readonly. */
export const CREATURE_CATALOG_VALIDATION = validateCreatureCatalog();
