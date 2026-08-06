import "server-only";

import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/llm/encryption";
import {
  AI_FEATURES,
  AI_MODEL_CATALOG,
  DEFAULT_FEATURE_MODELS,
  findCatalogModel,
  isAiFeature,
  isAiProvider,
  type AiFeatureKey,
  type AiProvider,
} from "./model-catalog";

export type ResolvedTeacherAi = {
  teacherId: string;
  feature: AiFeatureKey;
  provider: AiProvider;
  modelId: string;
  apiKey: string;
  baseUrl: string | null;
  verified: boolean;
};

type KeyRow = {
  provider: string;
  apiKeyEnc: string;
  baseUrl: string | null;
  modelId: string | null;
  verified: boolean;
};

function defaultModelForProvider(
  provider: AiProvider,
  feature: AiFeatureKey,
): string | null {
  const recommended = AI_MODEL_CATALOG.find(
    (model) =>
      model.provider === provider && model.recommendedFor?.includes(feature),
  );
  if (recommended) return recommended.id;
  return AI_MODEL_CATALOG.find((model) => model.provider === provider)?.id ?? null;
}

function validSelection(
  feature: AiFeatureKey,
  provider: string,
  modelId: string,
): { provider: AiProvider; modelId: string } | null {
  if (!isAiProvider(provider)) return null;
  if (!findCatalogModel(provider, modelId)) return null;
  return { provider, modelId };
}

async function decryptRuntime(
  teacherId: string,
  feature: AiFeatureKey,
  selection: { provider: AiProvider; modelId: string },
  key: KeyRow,
): Promise<ResolvedTeacherAi | null> {
  try {
    const apiKey = key.apiKeyEnc ? decryptApiKey(key.apiKeyEnc) : "";
    if (!apiKey) return null;
    return {
      teacherId,
      feature,
      provider: selection.provider,
      modelId: selection.modelId,
      apiKey,
      baseUrl: key.baseUrl ?? null,
      verified: key.verified,
    };
  } catch {
    return null;
  }
}

/** Resolve one teacher's provider credential and feature-specific model. */
export async function resolveTeacherAiForUser(
  teacherId: string,
  feature: AiFeatureKey,
): Promise<ResolvedTeacherAi | null> {
  const [config, keys] = await Promise.all([
    db.teacherAiFeatureConfig.findUnique({
      where: { userId_feature: { userId: teacherId, feature } },
      select: { provider: true, modelId: true },
    }),
    db.teacherLlmKey.findMany({
      where: { userId: teacherId },
      select: {
        provider: true,
        apiKeyEnc: true,
        baseUrl: true,
        modelId: true,
        verified: true,
      },
      orderBy: [{ verified: "desc" }, { updatedAt: "desc" }],
    }),
  ]);

  if (config) {
    const selection = validSelection(feature, config.provider, config.modelId);
    if (!selection) return null;
    const key = keys.find((candidate) => candidate.provider === selection.provider);
    return key ? decryptRuntime(teacherId, feature, selection, key) : null;
  }

  const preferred = DEFAULT_FEATURE_MODELS[feature];
  const preferredKey = keys.find((candidate) => candidate.provider === preferred.provider);
  if (preferredKey) {
    return decryptRuntime(teacherId, feature, preferred, preferredKey);
  }

  // Legacy migration path: before feature configs existed, a teacher had one
  // global key. Keep that key working and choose a compatible catalog model.
  const fallbackKey = keys.find((candidate) => isAiProvider(candidate.provider));
  if (!fallbackKey || !isAiProvider(fallbackKey.provider)) return null;
  const legacyModel =
    (fallbackKey.modelId &&
      findCatalogModel(fallbackKey.provider, fallbackKey.modelId)?.id) ||
    defaultModelForProvider(fallbackKey.provider, feature);
  if (!legacyModel) return null;
  return decryptRuntime(
    teacherId,
    feature,
    { provider: fallbackKey.provider, modelId: legacyModel },
    fallbackKey,
  );
}

export async function resolveTeacherAiForBoard(
  boardId: string,
  feature: AiFeatureKey,
): Promise<ResolvedTeacherAi | null> {
  const board = await db.board.findUnique({
    where: { id: boardId },
    select: { classroom: { select: { teacherId: true } } },
  });
  const teacherId = board?.classroom?.teacherId;
  return teacherId ? resolveTeacherAiForUser(teacherId, feature) : null;
}

export async function resolveTeacherAiForClassroom(
  classroomId: string,
  feature: AiFeatureKey,
): Promise<ResolvedTeacherAi | null> {
  const classroom = await db.classroom.findUnique({
    where: { id: classroomId },
    select: { teacherId: true },
  });
  return classroom
    ? resolveTeacherAiForUser(classroom.teacherId, feature)
    : null;
}

export type TeacherAiSettingsSnapshot = {
  keys: Array<{
    provider: AiProvider;
    last4: string;
    verified: boolean;
    verifiedAt: Date | null;
    lastError: string | null;
    updatedAt: Date;
  }>;
  configs: Array<{
    feature: AiFeatureKey;
    provider: AiProvider;
    modelId: string;
  }>;
};

export async function readTeacherAiSettings(
  teacherId: string,
): Promise<TeacherAiSettingsSnapshot> {
  const [keyRows, configRows] = await Promise.all([
    db.teacherLlmKey.findMany({
      where: { userId: teacherId },
      select: {
        provider: true,
        last4: true,
        verified: true,
        verifiedAt: true,
        lastError: true,
        updatedAt: true,
      },
      orderBy: { provider: "asc" },
    }),
    db.teacherAiFeatureConfig.findMany({
      where: { userId: teacherId },
      select: { feature: true, provider: true, modelId: true },
    }),
  ]);

  const keys = keyRows.flatMap((row) =>
    isAiProvider(row.provider)
      ? [
          {
            provider: row.provider,
            last4: row.last4,
            verified: row.verified,
            verifiedAt: row.verifiedAt,
            lastError: row.lastError,
            updatedAt: row.updatedAt,
          },
        ]
      : [],
  );

  const byFeature = new Map(
    configRows.flatMap((row) => {
      if (!isAiFeature(row.feature) || !isAiProvider(row.provider)) return [];
      if (!findCatalogModel(row.provider, row.modelId)) return [];
      return [[row.feature, { feature: row.feature, provider: row.provider, modelId: row.modelId }] as const];
    }),
  );

  const connectedProviders = new Set(keys.map((key) => key.provider));
  const legacyProvider =
    keys.find((key) => key.verified)?.provider ?? keys[0]?.provider ?? null;

  const configs = AI_FEATURES.map((feature) => {
    const saved = byFeature.get(feature);
    if (saved) return saved;

    const preferred = DEFAULT_FEATURE_MODELS[feature];
    if (connectedProviders.size === 0 || connectedProviders.has(preferred.provider)) {
      return { feature, ...preferred };
    }

    if (legacyProvider) {
      const modelId = defaultModelForProvider(legacyProvider, feature);
      if (modelId) return { feature, provider: legacyProvider, modelId };
    }

    return { feature, ...preferred };
  });

  return { keys, configs };
}
