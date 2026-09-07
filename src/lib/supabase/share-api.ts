import type { ShareSession } from "@/components/share/ShareSessionContext";
import { fetchShareBoard, ShareBoardUnavailableError } from "./share-board";

/**
 * Legacy share-read adapter. All mutations and engagement reads go through the
 * authenticated HTTP API, with the same validation, ownership, cache eviction,
 * activity/reward handling and Broadcast delivery as web/mobile callers.
 * Do not reintroduce direct browser writes to Card/Attachment/Like/Comment.
 */
export async function handleShareApiFetch(
  session: ShareSession,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response | null> {
  if (typeof window === "undefined") return null;
  const raw = input instanceof Request ? input.url : input.toString();
  const url = new URL(raw, window.location.origin);
  if (url.origin !== window.location.origin) return null;
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method !== "GET") return null;

  const cardMatch = url.pathname.match(/^\/api\/cards\/([^/]+)$/);
  const boardMatch = url.pathname.match(/^\/api\/boards\/([^/]+)\/snapshot$/);
  if (!cardMatch && !boardMatch) return null;

  try {
    const payload = await fetchShareBoard({ kind: "shareToken", value: session.shareToken });
    if (cardMatch) {
      const card = payload.initialCards.find((item) => item.id === decodeURIComponent(cardMatch[1]));
      return card ? jsonResponse({ card }) : jsonResponse({ error: "not_found" }, 404);
    }
    const lookup = decodeURIComponent(boardMatch![1]);
    if (lookup !== payload.board.id && lookup !== payload.board.slug) {
      return jsonResponse({ error: "board_mismatch" }, 403);
    }
    return jsonResponse({ cards: payload.initialCards, sections: payload.initialSections });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof ShareBoardUnavailableError ? "not_found" : "share_read_failed" },
      error instanceof ShareBoardUnavailableError ? 404 : 503,
    );
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", "cache-control": "private, no-store" },
  });
}
