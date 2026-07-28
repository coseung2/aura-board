import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_PREFIX = "quiz-player";
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

export type QuizPlayerTokenClaims = {
  playerId: string;
  quizId: string;
  expiresAt: number;
};

function getSecret(): string | null {
  const configured = process.env.AUTH_SECRET?.trim();
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? null : "dev-secret";
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${TOKEN_PREFIX}.${encodedPayload}`)
    .digest("base64url");
}

export function issueQuizPlayerToken(
  playerId: string,
  quizId: string,
): { token: string; expiresAt: number } {
  const secret = getSecret();
  if (!secret) throw new Error("AUTH_SECRET is required in production");

  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const encodedPayload = Buffer.from(
    JSON.stringify({ playerId, quizId, expiresAt }),
  ).toString("base64url");
  const signature = sign(encodedPayload, secret);
  return {
    token: `${TOKEN_PREFIX}.${encodedPayload}.${signature}`,
    expiresAt,
  };
}

export function verifyQuizPlayerToken(
  token: string,
): QuizPlayerTokenClaims | null {
  const secret = getSecret();
  if (!secret) return null;

  const [prefix, encodedPayload, signature, extra] = token.split(".");
  if (prefix !== TOKEN_PREFIX || !encodedPayload || !signature || extra) return null;

  const expected = sign(encodedPayload, secret);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<QuizPlayerTokenClaims>;
    if (
      typeof payload.playerId !== "string" ||
      !payload.playerId ||
      typeof payload.quizId !== "string" ||
      !payload.quizId ||
      typeof payload.expiresAt !== "number" ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }
    return {
      playerId: payload.playerId,
      quizId: payload.quizId,
      expiresAt: payload.expiresAt,
    };
  } catch {
    return null;
  }
}
