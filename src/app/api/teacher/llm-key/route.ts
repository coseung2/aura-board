// Teacher LLM API Key CRUD (Seed 13 follow-up, 2026-04-22).
//
// GET    /api/teacher/llm-key    — 현재 저장 상태 조회 (provider, last4, verified, verifiedAt, lastError)
// POST   /api/teacher/llm-key    — provider + apiKey 저장 + 즉시 검증 호출
// DELETE /api/teacher/llm-key    — 삭제
//
// 실제 apiKey 원문은 응답으로 내보내지 않고 last4만 돌려준다.

import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { encryptApiKey, last4 } from "@/lib/llm/encryption";
import { verifyApiKey, type LlmProvider } from "@/lib/llm/stream";
import { limitLlmKeyMutation } from "@/lib/rate-limit-routes";

// 2026-07-08: claude/openai/ollama 옵션 제거 — 두 옵션만 지원
const PROVIDERS = ["gemini", "opencode-go"] as const;

// ollama 는 apiKey 선택, baseUrl + modelId 필수. 다른 provider 는 apiKey 필수.
const SaveSchema = z.object({
  provider: z.enum(PROVIDERS),
  apiKey: z.string().trim().max(500).optional().default(""),
  baseUrl: z.string().trim().url().max(500).optional(),
  modelId: z.string().trim().min(1).max(200).optional(),
});function keyShapeOk(provider: LlmProvider, key: string): boolean {
  // 가벼운 sanity check. 형식이 완전하지 않아도 검증은 verifyApiKey가 처리.
  if (provider === "gemini") return key.startsWith("AIza") || key.length >= 30;
  if (provider === "opencode-go") return true; // key 불필요
  return false;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  const row = await db.teacherLlmKey.findUnique({ where: { userId: user.id } });
  if (!row) {
    return new Response(JSON.stringify({ present: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(
    JSON.stringify({
      present: true,
      provider: row.provider,
      last4: row.last4,
      baseUrl: row.baseUrl,
      modelId: row.modelId,
      verified: row.verified,
      verifiedAt: row.verifiedAt,
      lastError: row.lastError,
      updatedAt: row.updatedAt,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const rl = await limitLlmKeyMutation(user.id);
  if (!rl.ok) {
    return new Response(
      JSON.stringify({ error: "rate_limited", retryAfter: rl.retryAfter }),
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = SaveSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "bad_request", detail: parsed.error.issues }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { provider, apiKey, baseUrl, modelId } = parsed.data;

  // 기존 저장된 키 확인 (apiKey 미입력 시 유지용)
  const existingKey = await db.teacherLlmKey.findUnique({ where: { userId: user.id } });
  const hasExistingKey = !!(existingKey?.apiKeyEnc);
  const isNewKey = !!apiKey;

  if (provider === "opencode-go") {
    if (!modelId) {
      return new Response(
        JSON.stringify({ error: "opencode_missing_fields", detail: "modelId 필수" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    if (isNewKey && apiKey.length < 4) {
      return new Response(
        JSON.stringify({ error: "api_key_required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
  } else {
    // gemini: 표준 검증
    if (isNewKey && apiKey.length < 8) {
      return new Response(
        JSON.stringify({ error: "api_key_required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    if (isNewKey && !keyShapeOk(provider, apiKey)) {
      return new Response(
        JSON.stringify({ error: "key_shape_mismatch", detail: `${provider} key prefix not recognized` }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  let verifyResult: { ok: true } | { ok: false; error: string };

  if (!isNewKey && hasExistingKey) {
    // 키 변경 없음 — 기존 검증 상태 유지, 재검증 안 함
    verifyResult = { ok: true };
  } else if (isNewKey) {
    verifyResult = await verifyApiKey(provider, apiKey, { baseUrl, modelId });
  } else {
    // 새 키도 없고 기존 키도 없음
    verifyResult = { ok: false, error: "API Key가 필요합니다." };
  }

  const verified = verifyResult.ok;
  const lastError = verifyResult.ok ? null : verifyResult.error;

  let enc: string;
  let tail: string;

  if (isNewKey) {
    enc = encryptApiKey(apiKey);
    tail = last4(apiKey);
  } else if (hasExistingKey) {
    // 기존 키 유지
    enc = existingKey!.apiKeyEnc;
    tail = existingKey!.last4;
  } else {
    enc = "";
    tail = "";
  }

  const saved = await db.teacherLlmKey.upsert({
    where: { userId: user.id },
    update: {
      provider,
      apiKeyEnc: enc,
      last4: tail,
      baseUrl: baseUrl ?? null,
      modelId: modelId ?? null,
      verified,
      verifiedAt: verified ? new Date() : null,
      lastError,
    },
    create: {
      userId: user.id,
      provider,
      apiKeyEnc: enc,
      last4: tail,
      baseUrl: baseUrl ?? null,
      modelId: modelId ?? null,
      verified,
      verifiedAt: verified ? new Date() : null,
      lastError,
    },
  });

  return new Response(
    JSON.stringify({
      present: true,
      provider: saved.provider,
      last4: saved.last4,
      baseUrl: saved.baseUrl,
      modelId: saved.modelId,
      verified: saved.verified,
      verifiedAt: saved.verifiedAt,
      lastError: saved.lastError,
      updatedAt: saved.updatedAt,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  const rl = await limitLlmKeyMutation(user.id);
  if (!rl.ok) {
    return new Response(
      JSON.stringify({ error: "rate_limited", retryAfter: rl.retryAfter }),
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }
  await db.teacherLlmKey.deleteMany({ where: { userId: user.id } });
  return new Response(JSON.stringify({ present: false }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
