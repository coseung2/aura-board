/**
 * OAuth client subject dispatch.
 *
 * Each registered OAuthClient is bound to one subject kind. Canva content
 * publisher = student. Aura companion (teacher web app) = user. Adding new
 * teacher-side clients in the future = append to TEACHER_CLIENT_IDS.
 *
 * Scope-based detection은 사용자가 임의 scope 보낼 수 있으니 신뢰 X.
 * client_id allowlist 가 단일 진실.
 */
import "server-only";

export type SubjectKind = "student" | "user";

const TEACHER_CLIENT_IDS = new Set(["aura-companion"]);
const PKCE_OPTIONAL_CLIENT_IDS = new Set(["canva"]);

export function subjectKindForClient(clientId: string): SubjectKind {
  return TEACHER_CLIENT_IDS.has(clientId) ? "user" : "student";
}

export function pkceRequiredForClient(clientId: string, dbRequired: boolean): boolean {
  return dbRequired && !PKCE_OPTIONAL_CLIENT_IDS.has(clientId);
}
