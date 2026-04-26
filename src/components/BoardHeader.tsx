import Link from "next/link";
import { AuthHeader } from "./AuthHeader";
import { EditableTitle } from "./EditableTitle";
import { BoardSettingsLauncher } from "./BoardSettingsLauncher";
import type { BoardSection } from "./BoardSettingsPanel";
import { layoutLabel } from "@/lib/layout-meta";

type Props = {
  boardId?: string;
  title: string;
  layout: string;
  userName?: string;
  userRole?: string;
  /** Student identity 로 접근 중이면 true — 뱃지에서 leaked legacy role 숨김. */
  isStudent?: boolean;
  /** ← 버튼 이동 경로. 기본 "/"(교사 대시보드). 학생은 "/student" 로 전달. */
  backHref?: string;
  canEdit: boolean;
  settingsSections?: BoardSection[];
  /** card-comments-likes (2026-04-26): 보드 단위 작성자 익명 토글 초기값. */
  anonymousAuthor?: boolean;
};

export function BoardHeader({
  boardId,
  title,
  layout,
  userName,
  userRole,
  isStudent,
  backHref,
  canEdit,
  settingsSections,
  anonymousAuthor,
}: Props) {
  return (
    <header className="board-header">
      <div className="board-header-left">
        <Link
          href={backHref ?? "/"}
          className="board-back-link"
          aria-label="보드 목록으로"
        >
          ←
        </Link>
        {boardId ? (
          <EditableTitle boardId={boardId} initialTitle={title} canEdit={canEdit} />
        ) : (
          <h1 className="board-title">{title}</h1>
        )}
        {boardId && canEdit && (
          <BoardSettingsLauncher
            boardId={boardId}
            layout={layout}
            sections={settingsSections ?? []}
            anonymousAuthor={anonymousAuthor ?? false}
          />
        )}
        <span className="board-layout-badge">{layoutLabel(layout)}</span>
        {userName && userRole && !isStudent && (
          <span className="board-badge">
            {userName} · {userRole}
          </span>
        )}
        {userName && isStudent && (
          <span className="board-badge">{userName}</span>
        )}
      </div>
      <div className="board-header-right">
        <AuthHeader />
      </div>
    </header>
  );
}
