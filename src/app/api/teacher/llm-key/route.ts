import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { AI_PROVIDERS, type AiProvider } from "@/lib/ai/model-catalog";
import { db } from "@/lib/db";
import { encryptApiKey, last4 } from "@/lib/llm/encryption";
import { verifyApiKey } from "@/lib/llm/stream";
import { limitLlmKeyMutation } from "@/lib/rate-limit-routes";

const SaveSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  apiKey: z.string().trim().max(500).optional().default(""),
});

function keyShapeOk(provider: AiProvider, key: string): boolean {
  if (provider === "gemini") return key.startsWith("AIza") || key.length >= 30;
  if (provider === "openai") return key.startsWith("sk-") || key.length >= 20;
  return key.length >= 4;
}

function serializeKey(row: {
  provider: string;
  last4: string;
  verified: boolean;
  verifiedAt: Date | null;
  lastError: string | null;
  updatedAt: Date;
}) {
  return {
    provider: row.provider,
    last4: row.last4,
    verified: row.verified,
    verifiedAt: row.verifiedAt,
    lastError: row.lastError,
    updatedAt: row.updatedAt,
  };
}

async function readKeys(userId: string) {
  const rows = await db.teacherLlmKey.findMany({
    where: { userId },
    select: {
      provider: true,
      last4: true,
      verified: true,
      verifiedAt: true,
      lastError: true,
      updatedAt: true,
    },
    orderBy: { provider: "asc" },
  });
  return rows.map(serializeKey);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json({ keys: await readKeys(user.id) });
}

export async function POST(req: Request) {
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

  const { provider, apiKey } = parsed.data;
  const existing = await db.teacherLlmKey.findUnique({
    where: { userId_provider: { userId: user.id, provider } },
  });
  const nextKey = apiKey || "";
  if (!nextKey && !existing?.apiKeyEnc) {
    return Response.json({ error: "api_key_required" }, { status: 400 });
  }
  if (nextKey && !keyShapeOk(provider, nextKey)) {
    return Response.json(
      { error: "key_shape_mismatch", detail: `${provider} key format not recognized` },
      { status: 400 },
    );
  }

  let verified = existing?.verified ?? false;
  let verifiedAt = existing?.verifiedAt ?? null;
  let lastError = existing?.lastError ?? null;
  let apiKeyEnc = existing?.apiKeyEnc ?? "";
  let keyTail = existing?.last4 ?? "";

  if (nextKey) {
    const verification = await verifyApiKey(provider, nextKey);
    verified = verification.ok;
    verifiedAt = verification.ok ? new Date() : null;
    lastError = verification.ok ? null : verification.error;
    apiKeyEnc = encryptApiKey(nextKey);
    keyTail = last4(nextKey);
  }

  const saved = await db.teacherLlmKey.upsert({
    where: { userId_provider: { userId: user.id, provider } },
    update: {
      apiKeyEnc,
      last4: keyTail,
      baseUrl: provider === "opencode-go" ? "https://opencode.ai/zen/go/v1" : null,
      verified,
      verifiedAt,
      lastError,
    },
    create: {
      userId: user.id,
      provider,
      apiKeyEnc,
      last4: keyTail,
      baseUrl: provider === "opencode-go" ? "https://opencode.ai/zen/go/v1" : null,
      modelId: null,
      verified,
      verifiedAt,
      lastError,
    },
  });

  return Response.json({ key: serializeKey(saved), keys: await readKeys(user.id) });
}

export async function DELETE(req: Request) {
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

  const provider = new URL(req.url).searchParams.get("provider");
  if (!provider || !(AI_PROVIDERS as readonly string[]).includes(provider)) {
    return Response.json({ error: "invalid_provider" }, { status: 400 });
  }

  await db.teacherLlmKey.deleteMany({ where: { userId: user.id, provider } });
  return Response.json({ keys: await readKeys(user.id) });
}
