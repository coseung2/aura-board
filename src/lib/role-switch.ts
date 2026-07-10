import "server-only";

import { db } from "./db";
import { normalizeAccountPrincipal } from "./account-principal";

/** Look up the parent role belonging to an authenticated email account. */
export async function findParentRoleByEmail(email: string | null | undefined) {
  const principal = normalizeAccountPrincipal(email);
  if (!principal) return null;

  return db.parent.findFirst({
    where: {
      email: { equals: principal, mode: "insensitive" },
      parentDeletedAt: null,
    },
    select: { id: true, email: true },
  });
}

/** Look up the teacher role belonging to an authenticated email account. */
export async function findTeacherRoleByEmail(email: string | null | undefined) {
  const principal = normalizeAccountPrincipal(email);
  if (!principal) return null;

  return db.user.findFirst({
    where: { email: { equals: principal, mode: "insensitive" } },
    select: { id: true, email: true },
  });
}
