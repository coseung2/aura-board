export const AI_PROVIDERS = ["openai", "gemini", "opencode-go"] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number];

export const AI_FEATURES = [
  "feedback",
  "vibe",
  "quiz",
  "agent",
  "kordle",
  "reading",
] as const;

export type AiFeatureKey = (typeof AI_FEATURES)[number];

export type AiFeatureDefinition = {
  key: AiFeatureKey;
  label: string;
  description: string;
};

export const AI_FEATURE_DEFINITIONS: readonly AiFeatureDefinition[] = [
  {
    key: "feedback",
    label: "학생 평어",
    description: "교과·과제 기준에 맞춘 개별 평어와 이미지 기반 피드백",
  },
  {
    key: "vibe",
    label: "바이브 코딩",
    description: "학생 게임·웹 작품 생성과 실시간 코드 수정",
  },
  {
    key: "quiz",
    label: "퀴즈 생성",
    description: "문서와 본문을 바탕으로 객관식 문항 생성",
  },
  {
    key: "agent",
    label: "AI 학습 도우미",
    description: "학생 질문, 코딩, 수업 안내를 위한 대화형 도우미",
  },
  {
    key: "kordle",
    label: "꼬들 단어 생성",
    description: "학생용 안전 단어 후보 생성과 퍼즐 풀 보충",
  },
  {
    key: "reading",
    label: "독서 피드백",
    description: "독서 감상 내용 평가와 10점 피드백 생성",
  },
] as const;

export type AiModelSpeed = "fast" | "balanced" | "quality";

export type AiModelCatalogItem = {
  provider: AiProvider;
  id: string;
  label: string;
  description: string;
  speed: AiModelSpeed;
  recommendedFor?: readonly AiFeatureKey[];
};

/**
 * Aura-board에서 사용하는 텍스트/비전 호출 경로와 호환되는 모델만 노출한다.
 * OpenCode-go는 현재 OpenAI-compatible chat/completions endpoint 모델로 한정한다.
 */
export const AI_MODEL_CATALOG: readonly AiModelCatalogItem[] = [
  {
    provider: "openai",
    id: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    description: "복잡한 추론·코딩을 위한 최고 성능 모델",
    speed: "quality",
    recommendedFor: ["vibe", "agent"],
  },
  {
    provider: "openai",
    id: "gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    description: "성능과 비용 균형이 좋은 범용 모델",
    speed: "balanced",
    recommendedFor: ["feedback", "vibe", "agent"],
  },
  {
    provider: "openai",
    id: "gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    description: "대량·반복 작업에 적합한 비용 효율 모델",
    speed: "fast",
    recommendedFor: ["quiz", "kordle"],
  },
  {
    provider: "gemini",
    id: "gemini-3.6-flash",
    label: "Gemini 3.6 Flash",
    description: "멀티모달·에이전트 작업의 최신 균형형 모델",
    speed: "balanced",
    recommendedFor: ["feedback", "vibe", "agent"],
  },
  {
    provider: "gemini",
    id: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    description: "지속적인 추론과 코딩에 강한 안정 모델",
    speed: "quality",
    recommendedFor: ["feedback", "vibe"],
  },
  {
    provider: "gemini",
    id: "gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash-Lite",
    description: "대량·저지연 작업용 경량 모델",
    speed: "fast",
    recommendedFor: ["quiz", "kordle"],
  },
  {
    provider: "gemini",
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    description: "검증된 가격 대비 성능의 범용 모델",
    speed: "balanced",
  },
  {
    provider: "gemini",
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    description: "복잡한 분석과 긴 문맥을 위한 고성능 모델",
    speed: "quality",
  },
  {
    provider: "gemini",
    id: "gemma-4-26b-a4b-it",
    label: "Gemma 4 26B A4B",
    description: "무료 호스팅과 속도·품질 균형에 적합한 Gemma 모델",
    speed: "balanced",
    recommendedFor: ["reading"],
  },
  {
    provider: "gemini",
    id: "gemma-4-31b-it",
    label: "Gemma 4 31B",
    description: "Gemma 계열 최고 품질의 dense 모델",
    speed: "quality",
    recommendedFor: ["reading"],
  },
  {
    provider: "opencode-go",
    id: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    description: "빠르고 저렴한 코딩·반복 작업 모델",
    speed: "fast",
    recommendedFor: ["vibe", "quiz", "kordle"],
  },
  {
    provider: "opencode-go",
    id: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    description: "복잡한 코딩과 추론을 위한 상위 모델",
    speed: "quality",
    recommendedFor: ["vibe", "agent"],
  },
  {
    provider: "opencode-go",
    id: "kimi-k2.7-code",
    label: "Kimi K2.7 Code",
    description: "코드 생성과 장문 수정에 특화된 모델",
    speed: "balanced",
    recommendedFor: ["vibe", "agent"],
  },
  {
    provider: "opencode-go",
    id: "kimi-k2.6",
    label: "Kimi K2.6",
    description: "범용 추론과 긴 문맥 처리 모델",
    speed: "balanced",
  },
  {
    provider: "opencode-go",
    id: "kimi-k3",
    label: "Kimi K3",
    description: "고품질 장문 추론 모델",
    speed: "quality",
  },
  {
    provider: "opencode-go",
    id: "glm-5.2",
    label: "GLM-5.2",
    description: "고성능 코딩·에이전트 모델",
    speed: "quality",
  },
  {
    provider: "opencode-go",
    id: "glm-5.1",
    label: "GLM-5.1",
    description: "안정적인 코딩·추론 모델",
    speed: "quality",
  },
  {
    provider: "opencode-go",
    id: "grok-4.5",
    label: "Grok 4.5",
    description: "고난도 범용 추론 모델",
    speed: "quality",
  },
  {
    provider: "opencode-go",
    id: "mimo-v2.5",
    label: "MiMo V2.5",
    description: "비용 효율이 높은 경량 모델",
    speed: "fast",
    recommendedFor: ["quiz", "kordle"],
  },
  {
    provider: "opencode-go",
    id: "mimo-v2.5-pro",
    label: "MiMo V2.5 Pro",
    description: "MiMo 계열 고품질 모델",
    speed: "balanced",
  },
  {
    provider: "opencode-go",
    id: "hy3",
    label: "Hy3",
    description: "저비용 범용 chat-completions 모델",
    speed: "fast",
  },
] as const;

export const DEFAULT_FEATURE_MODELS: Readonly<
  Record<AiFeatureKey, { provider: AiProvider; modelId: string }>
> = {
  feedback: { provider: "gemini", modelId: "gemini-3.6-flash" },
  vibe: { provider: "opencode-go", modelId: "deepseek-v4-flash" },
  quiz: { provider: "gemini", modelId: "gemini-3.5-flash-lite" },
  agent: { provider: "opencode-go", modelId: "kimi-k2.7-code" },
  kordle: { provider: "gemini", modelId: "gemini-3.5-flash-lite" },
  reading: { provider: "gemini", modelId: "gemma-4-26b-a4b-it" },
};

export function modelsForProvider(provider: AiProvider): AiModelCatalogItem[] {
  return AI_MODEL_CATALOG.filter((model) => model.provider === provider);
}

export function findCatalogModel(
  provider: AiProvider,
  modelId: string,
): AiModelCatalogItem | undefined {
  return AI_MODEL_CATALOG.find(
    (model) => model.provider === provider && model.id === modelId,
  );
}

export function isAiProvider(value: string): value is AiProvider {
  return (AI_PROVIDERS as readonly string[]).includes(value);
}

export function isAiFeature(value: string): value is AiFeatureKey {
  return (AI_FEATURES as readonly string[]).includes(value);
}
