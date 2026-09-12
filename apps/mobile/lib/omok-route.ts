/** Slug prefix used by matchmaking when it creates a live Omok session board
 * (`omok-match-<uuid>`). The `game-hub-omok-*` boards are lobbies, not games. */
export const OMOK_MATCH_SLUG_PREFIX = "omok-match-";

/**
 * True for a live Omok game route. The global bottom tab bar is hidden there:
 * the board is sized to the viewport, and a tab bar would both steal room and
 * let a mis-tap leave a live turn. Lobby and hub routes keep navigation.
 */
export function isActiveOmokRoute(pathname: string): boolean {
  const segments = pathname.split("?")[0].split("/").filter(Boolean);
  const boardIndex = segments.lastIndexOf("board");
  if (boardIndex < 0) return false;
  const slug = segments[boardIndex + 1];
  if (!slug) return false;
  // Only the game itself, not a nested composer or comments route.
  if (segments.length > boardIndex + 2) return false;
  return decodeURIComponent(slug).startsWith(OMOK_MATCH_SLUG_PREFIX);
}
