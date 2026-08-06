import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import {
  AI_FEATURES,
  AI_MODEL_CATALOG,
  AI_PROVIDERS,
  findCatalogModel,
} from "@/lib/ai/model-catalog";
import { readTeacherAiSettings } from "@/lib/ai/teacher-ai";
import { db } from "@/lib/db";
import { limitLlmKeyMutation } from "@/lib/rate-limit-routes";

const SaveSchema = z.object({
  feature: z.enum(AI_FEATURES),
  provider: z.enum(AI_PROVIDERS),
  modelId: z.string().trim().min(1).max(200),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const snapshot = await readTeacherAiSettings(user.id);
  return Response.json({ ...snapshot, catalog: AI_MODEL_CATALOG });
}

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = await limitLlmKeyMutation(user.id);
  if (!rl.ok) {
    return Response.json(
      { error: "rate_limited", retryAfter: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const parsed = SaveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "bad_request", detail: parsed.error.issues },
      { status: 400 },
    );
  }

  const { feature, provider, modelId } = parsed.data;
  if (!findCatalogModel(provider, modelId)) {
    return Response.json({ error: "model_not_in_catalog" }, { status: 400 });
  }

  await db.teacherAiFeatureConfig.upsert({
    where: { userId_feature: { userId: user.id, feature } },
    update: { provider, modelId },
    create: { userId: user.id, feature, provider, modelId },
  });

  const snapshot = await readTeacherAiSettings(user.id);
  return Response.json({ ...snapshot, catalog: AI_MODEL_CATALOG });
}
