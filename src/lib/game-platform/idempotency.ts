import { createHash } from "crypto";
import { Prisma } from "@prisma/client";

export const GAME_PLATFORM_RECEIPT_SCOPES = [
  "game_result_write",
  "kordle_puzzle_command",
  "kordle_attempt_command",
  "speed_game_run_create",
  "speed_game_run_command",
  "shadow_alliance_session_command",
] as const;
export type GamePlatformReceiptScope =
  (typeof GAME_PLATFORM_RECEIPT_SCOPES)[number];

export class IdempotencyConflictError extends Error {
  readonly status = 409;
  readonly code = "idempotency_key_reuse";

  constructor() {
    super("idempotency_key_reuse");
  }
}

function normalizeJson(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("non_finite_json_number");
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      if (record[key] !== undefined) normalized[key] = normalizeJson(record[key]);
    }
    return normalized;
  }
  throw new TypeError("unsupported_json_value");
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeJson(value));
}

export function hashIdempotencyRequest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function isP2002(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function withPlayRequestReceipt<T extends Prisma.InputJsonValue>(
  tx: Prisma.TransactionClient,
  input: {
    actorSubject: string;
    scopeType: GamePlatformReceiptScope;
    scopeId: string;
    requestId: string;
    requestBody: unknown;
  },
  execute: () => Promise<T>,
): Promise<{ response: T; replayed: boolean }> {
  if (input.requestId.length < 1 || input.requestId.length > 128) {
    throw new TypeError("invalid_request_id");
  }
  if (!input.actorSubject.trim()) throw new TypeError("invalid_actor_subject");
  if (!input.scopeId.trim()) throw new TypeError("invalid_scope_id");

  const requestHash = hashIdempotencyRequest({
    actorSubject: input.actorSubject,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    payload: input.requestBody,
  });
  const where = {
    scopeType_scopeId_requestId: {
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      requestId: input.requestId,
    },
  } as const;
  const existing = await tx.playRequestReceipt.findUnique({ where });
  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new IdempotencyConflictError();
    }
    return { response: existing.response as T, replayed: true };
  }

  const response = await execute();
  try {
    await tx.playRequestReceipt.create({
      data: {
        id: crypto.randomUUID(),
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        requestId: input.requestId,
        requestHash,
        response,
      },
    });
    return { response, replayed: false };
  } catch (error) {
    if (!isP2002(error)) throw error;
    const raced = await tx.playRequestReceipt.findUnique({ where });
    if (!raced || raced.requestHash !== requestHash) {
      throw new IdempotencyConflictError();
    }
    return { response: raced.response as T, replayed: true };
  }
}
