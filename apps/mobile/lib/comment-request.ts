export type CommentRequest = { key: string; id: string };

/** Reuse the server idempotency key after an uncertain network result. */
export function commentRequest(previous: CommentRequest | null, key: string): CommentRequest {
  if (previous?.key === key) return previous;
  return { key, id: `comment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}` };
}
