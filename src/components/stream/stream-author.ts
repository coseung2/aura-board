import type { CardData } from "../DraggableCard";

const AVATAR_COLORS = [
  "#0f766e",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#15803d",
  "#be123c",
  "#0369a1",
];

export function getStreamAuthor(card: CardData) {
  const names = (card.authors ?? [])
    .map((author) => author.displayName.trim())
    .filter(Boolean);
  const fallback =
    card.studentAuthorName?.trim() ||
    card.externalAuthorName?.trim() ||
    card.authorName?.trim() ||
    "익명";
  const rawName = card.anonymousAuthor ? "익명" : names[0] || fallback;
  const formattedName = formatDisplayName(rawName);
  const displayName = card.anonymousAuthor
    ? "익명"
    : `${formattedName}${names.length > 1 ? ` 외 ${names.length - 1}명` : ""}`;
  const avatarText = formatAvatarText(formattedName);
  const colorKey = card.studentAuthorId || card.authorId || rawName;

  return {
    displayName,
    avatarText,
    avatarColor: AVATAR_COLORS[hashString(colorKey) % AVATAR_COLORS.length],
  };
}

function formatDisplayName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "익명") return trimmed || "익명";
  if (/^[가-힣]{3,}$/.test(trimmed)) return trimmed.slice(1);
  return trimmed;
}

function formatAvatarText(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "익명") return trimmed || "익";
  if (/^[가-힣]+$/.test(trimmed)) return trimmed.slice(0, 2);
  return trimmed.slice(0, 3).toUpperCase();
}

function hashString(value: string | null | undefined): number {
  const text = value || "anonymous";
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}
