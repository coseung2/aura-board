"use client";

import { memo, type ReactNode } from "react";
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
  // false 면 작성자/시간을 건너뛴다 — 스트림 카드처럼 자체 헤더에 작성자
  // 정보가 이미 있는 표면에서 메뉴 슬롯만 쓰고 싶을 때.
  showMeta?: boolean;
  // 작성자 줄 오른쪽 끝에 붙는 슬롯. 카드 메뉴(⋯) 토글이 들어온다.
  menu?: ReactNode;
};

export const CardAuthorFooter = memo(function CardAuthorFooter({
  authors,
  externalAuthorName,
  studentAuthorName,
  authorName,
  createdAt,
  anonymousAuthor,
  showMeta = true,
  menu,
}: Props) {
  // formatAuthorList honours the `authors` array first (CardAuthor rows),
  // falling back to the legacy external/student/author chain when the
  // array is empty — keeps legacy cards rendering the same name pick.
  const resolved = showMeta
    ? formatAuthorList(
        authors ?? null,
        externalAuthorName,
        studentAuthorName,
        authorName
      )
    : null;
  const name = anonymousAuthor && resolved ? "익명" : resolved;

  const iso =
    !showMeta || createdAt == null
      ? null
      : createdAt instanceof Date
      ? createdAt.toISOString()
      : typeof createdAt === "string"
        ? createdAt
        : null;
  const time = iso ? formatRelativeKo(iso) : null;
  // 작성자 정보 없이 메뉴만 있는 카드도 줄을 유지한다 — 토글이 사라지면
  // 카드를 수정/삭제할 방법이 없어진다.
  if (!name && !time && !menu) return null;
  const menuOnly = !name && !time;

  return (
    <footer
      className={`card-author-footer${menuOnly ? " is-menu-only" : ""}`}
    >
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
      {menu}
    </footer>
  );
});
