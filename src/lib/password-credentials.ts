import "server-only";

import { db } from "./db";
import {
  isValidPasswordUsername,
  normalizePasswordUsername,
  verifyPasswordHash,
} from "./password-credential-core";

export {
  createPasswordHash,
  isValidAccountPassword,
  isValidPasswordUsername,
  localPrincipalEmail,
  normalizePasswordUsername,
  verifyPasswordHash,
} from "./password-credential-core";

export async function verifyPasswordCredential(
  username: string,
  password: string,
): Promise<{ username: string; principalEmail: string } | null> {
  const normalized = normalizePasswordUsername(username);
  const credential = isValidPasswordUsername(normalized)
    ? await db.passwordCredential.findUnique({
        where: { username: normalized },
        select: { username: true, principalEmail: true, passwordHash: true },
      })
    : null;

  const matches = await verifyPasswordHash(password, credential?.passwordHash ?? "");
  if (!credential || !matches) return null;
  return {
    username: credential.username,
    principalEmail: credential.principalEmail,
  };
}
