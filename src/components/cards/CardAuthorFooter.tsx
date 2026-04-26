"use client";

import { memo } from "react";
import {
  formatAuthorList,
  formatRelativeKo,
  type AuthorLike,
} from "@/lib/card-author";

type Props = {
  authors?: AuthorLike[] | null;
  externalAuthorName?: string | null;
  studentAuthorName?: string | null;
  authorName?: string | null;
  createdAt?: string | Date | null;
  // card-comments-likes (2026-04-26): board.anonymousAuthor=true 면 작성자
  // 라벨을 "익명" 으로 마스킹.
  anonymousAuthor?: boolean;
};

export const CardAuthorFooter = memo(function CardAuthorFooter({
  authors,
  externalAuthorName,
  studentAuthorName,
  authorName,
  createdAt,
  anonymousAuthor,
}: Props) {
  // formatAuthorList honours the `authors` array first (CardAuthor rows),
  // falling back to the legacy external/student/author chain when the
  // array is empty — keeps legacy cards rendering the same name pick.
  const resolved = formatAuthorList(
    authors ?? null,
    externalAuthorName,
    studentAuthorName,
    authorName
  );
  const name = anonymousAuthor && resolved ? "익명" : resolved;
  if (!name && !createdAt) return null;

  const iso =
    createdAt instanceof Date
      ? createdAt.toISOString()
      : typeof createdAt === "string"
        ? createdAt
        : null;
  const time = iso ? formatRelativeKo(iso) : null;

  return (
    <footer className="card-author-footer">
      {name && (
        <span className="card-author-chip" title={name}>
          <span className="sr-only">작성자: </span>
          <span className="card-author-name">{name}</span>
        </span>
      )}
      {time && iso && (
        <time
          dateTime={iso}
          title={time.abs}
          className="card-author-time"
        >
          {time.rel}
        </time>
      )}
    </footer>
  );
});
