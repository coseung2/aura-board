import "server-only";

import { randomBytes } from "crypto";
import { db } from "./db";

const PAIR_CODE_TTL_MS = 5 * 60 * 1000;
const PAIR_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export async function issueStudentCanvaPairCode(studentId: string): Promise<{
  code: string;
  expiresAt: string;
}> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = generatePairCode();
    const expiresAt = new Date(Date.now() + PAIR_CODE_TTL_MS);
    try {
      await db.oAuthAuthCode.create({
        data: {
          code,
          studentId,
          clientId: "canva",
          redirectUri: "aura://pair",
          scope: "cards:write",
          codeChallenge: "",
          codeChallengeMethod: "plain",
          state: null,
          expiresAt,
        },
      });
      return { code, expiresAt: expiresAt.toISOString() };
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") continue;
      throw error;
    }
  }
  throw new Error("pair_code_issue_retry_exhausted");
}
function generatePairCode(): string {
  const bytes = randomBytes(8);
  let output = "";
  for (let index = 0; index < 8; index += 1) {
    output += PAIR_ALPHABET[(bytes[index] ?? 0) % PAIR_ALPHABET.length];
  }
  return output;
}
