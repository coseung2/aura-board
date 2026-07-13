"use client";

/**
 * BreakoutBoard — teacher pool view for layout="breakout" (BR-3 / BR-4).
 *
 * Renders every group section grouped by 모둠, plus a shared teacher-pool band
 * at the top (if the template has sharedSections). Each card gets a context
 * menu with the "모든 모둠에 복제" bulk-copy action (BR-4), which calls
 * POST /api/breakout/assignments/[id]/copy-card.
 *
 * Student views (own-only / peek-others gating) are out of scope for the
 * foundation agent — handled by BR-5/BR-6 via the existing
 * /board/[id]/s/[sectionId] route (T0-①).
 */
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AddCardButton } from "./AddCardButton";
import { AddCardModal, type AddCardData } from "./AddCardModal";
import { CardDetailModal } from "./cards/CardDetailModal";
import { type MenuItem } from "./ContextMenu";
import { EditCardModal, type EditCardUpdates } from "./EditCardModal";
import type { CardData } from "./DraggableCard";
import { BreakoutAssignmentManager } from "./BreakoutAssignmentManager";
import type {
  BreakoutMembershipData,
  BreakoutRosterStudent,
} from "./BreakoutAssignmentManager";
import { BreakoutHeader } from "./breakout/BreakoutHeader";
import { GroupColumn } from "./breakout/GroupColumn";
import { PoolColumn } from "./breakout/PoolColumn";
import { useCardRealtime } from "@/hooks/useCardRealtime";

type SectionData = {
  id: string;
  title: string;
  order: number;
};

type AssignmentData = {
  id: string;
  templateId: string;
  templateName: string;
  templateKey: string;
  groupCount: number;
  groupCapacity: number;
  visibility: "own-only" | "peek-others";
  deployMode: "link-fixed" | "self-select" | "teacher-assign";
  status: "active" | "archived";
  sharedSectionTitles: string[];
};

type Props = {
  boardId: string;
  boardTitle: string;
  boardSlug: string;
  assignment: AssignmentData;
  initialCards: CardData[];
  initialSections: SectionData[];
  initialMemberships: BreakoutMembershipData[];
  rosterStudents: BreakoutRosterStudent[];
  currentUserId: string;
  currentRole: "owner" | "editor" | "viewer";
  isStudentViewer?: boolean;
};

/**
 * Parse a section title "모둠 3 · K (아는 것)" into { groupIndex: 3, tabTitle: "K (아는 것)" }.
 * Returns null if the title isn't a group section (e.g. teacher-pool).
 */
function parseGroupSection(
  title: string,
): { groupIndex: number; tabTitle: string } | null {
  const match = /^모둠\s+(\d+)\s+·\s+(.+)$/.exec(title);
  if (!match) return null;
  return { groupIndex: Number(match[1]), tabTitle: match[2] };
}

/** Server returns Card rows as plain JSON; map them into our CardData shape. */
function normalizeCopiedCard(
  card: Record<string, unknown>,
  fallbackAuthorId: string,
): CardData {
  return {
    id: String(card.id),
    title: String(card.title ?? ""),
    content: String(card.content ?? ""),
    color: (card.color as string | null) ?? null,
    imageUrl: (card.imageUrl as string | null) ?? null,
    linkUrl: (card.linkUrl as string | null) ?? null,
    linkTitle: (card.linkTitle as string | null) ?? null,
    linkDesc: (card.linkDesc as string | null) ?? null,
    linkImage: (card.linkImage as string | null) ?? null,
    videoUrl: (card.videoUrl as string | null) ?? null,
    fileUrl: (card.fileUrl as string | null) ?? null,
    fileName: (card.fileName as string | null) ?? null,
    fileSize: (card.fileSize as number | null) ?? null,
    fileMimeType: (card.fileMimeType as string | null) ?? null,
    attachments:
      (card.attachments as
        | Array<{
            id: string;
            kind: string;
            url: string;
            previewUrl?: string | null;
            fileName: string | null;
            fileSize: number | null;
            mimeType: string | null;
            order: number;
          }>
        | undefined) ?? [],
    commentVoteOptionCount:
      (card.commentVoteOptionCount as number | null) ?? null,
    commentVoteOptionLabels: Array.isArray(card.commentVoteOptionLabels)
      ? card.commentVoteOptionLabels.filter(
          (label): label is string => typeof label === "string",
        )
      : null,
    x: Number(card.x ?? 0),
    y: Number(card.y ?? 0),
    width: Number(card.width ?? 240),
    height: Number(card.height ?? 160),
    order: Number(card.order ?? 0),
    sectionId: (card.sectionId as string | null) ?? null,
    authorId: String(card.authorId ?? fallbackAuthorId),
  };
}

export function BreakoutBoard({
  boardId,
  boardTitle,
  boardSlug,
  assignment,
  initialCards,
  initialSections,
  initialMemberships,
  rosterStudents,
  currentUserId,
  currentRole,
  isStudentViewer,
}: Props) {
  const router = useRouter();
  const [cards, setCards] = useState<CardData[]>(initialCards);
  const [sections, setSections] = useState<SectionData[]>(
    [...initialSections].sort((a, b) => a.order - b.order),
  );
  const [memberships, setMemberships] =
    useState<BreakoutMembershipData[]>(initialMemberships);
  const [editingCard, setEditingCard] = useState<CardData | null>(null);
  const [openCard, setOpenCard] = useState<CardData | null>(null);
  const [addForSection, setAddForSection] = useState<string | null>(null);
  const [copying, setCopying] = useState<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [localStatus, setLocalStatus] = useState<"active" | "archived">(
    assignment.status,
  );
  const deletingIds = useRef<Set<string>>(new Set());

  // Breakout is a durable content board, not a game lobby: use Broadcast as an
  // invalidation signal and the board snapshot as the source of truth. Presence
  // is intentionally absent.
  useCardRealtime(boardId, setCards, deletingIds, undefined, !!isStudentViewer);

  // sections setter is referenced by the assignment manager's future section
  // edit path; keep it available without adding a separate realtime contract.
  void setSections;
  const canEdit = currentRole === "owner" || currentRole === "editor";
  const canBulkCopy = currentRole === "owner";
  const isOwner = currentRole === "owner";

  const membershipsBySection = useMemo(() => {
    const map = new Map<string, BreakoutMembershipData[]>();
    for (const row of memberships) {
      const current = map.get(row.sectionId);
      if (current) current.push(row);
      else map.set(row.sectionId, [row]);
    }
    return map;
  }, [memberships]);

  async function handleArchive() {
    if (!isOwner) return;
    if (
      !window.confirm(
        "세션을 종료하면 읽기 전용 아카이브로 전환돼요. 계속할까요?",
      )
    ) {
      return;
    }
    setArchiving(true);
    try {
      const response = await fetch(
        `/api/breakout/assignments/${assignment.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "archived" }),
        },
      );
      if (response.ok) {
        setLocalStatus("archived");
        router.replace(`/board/${boardSlug}/archive`);
      } else {
        alert("세션 종료 실패");
      }
    } finally {
      setArchiving(false);
    }
  }

  const poolTitles = useMemo(
    () => new Set(assignment.sharedSectionTitles),
    [assignment.sharedSectionTitles],
  );

  // Split sections into teacher-pool vs group. Group sections are grouped by
  // their "모둠 N" prefix; inside each group, section order is preserved.
  const { poolSections, groupedSections } = useMemo(() => {
    const pool: SectionData[] = [];
    const groups = new Map<number, SectionData[]>();
    for (const section of sections) {
      if (poolTitles.has(section.title)) {
        pool.push(section);
        continue;
      }
      const parsed = parseGroupSection(section.title);
      if (!parsed) {
        // Unrecognised — treat as pool so it still renders.
        pool.push(section);
        continue;
      }
      const current = groups.get(parsed.groupIndex);
      if (current) current.push(section);
      else groups.set(parsed.groupIndex, [section]);
    }
    const sortedGroups = [...groups.entries()].sort((a, b) => a[0] - b[0]);
    return { poolSections: pool, groupedSections: sortedGroups };
  }, [sections, poolTitles]);

  const cardsBySection = useMemo(() => {
    const map = new Map<string, CardData[]>();
    const sorted = [...cards].sort((a, b) => a.order - b.order);
    for (const card of sorted) {
      const key = card.sectionId ?? "";
      const current = map.get(key);
      if (current) current.push(card);
      else map.set(key, [card]);
    }
    return map;
  }, [cards]);

  function getCardsForSection(sectionId: string): CardData[] {
    return cardsBySection.get(sectionId) ?? [];
  }

  async function handleAdd(data: AddCardData) {
    const targetSection =
      data.sectionId ?? addForSection ?? sections[0]?.id ?? null;
    const order = targetSection
      ? getCardsForSection(targetSection).length
      : 0;
    try {
      const response = await fetch("/api/cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          boardId,
          title: data.title,
          content: data.content,
          linkUrl: data.linkUrl || null,
          linkTitle: data.linkTitle || null,
          linkDesc: data.linkDesc || null,
          linkImage: data.linkImage || null,
          attachments: data.attachments,
          authors: data.authors,
          color: data.color || null,
          commentVoteOptionCount: data.commentVoteOptionCount ?? null,
          commentVoteOptionLabels: data.commentVoteOptionLabels ?? null,
          x: 0,
          y: 0,
          order,
          sectionId: targetSection,
        }),
      });
      if (response.ok) {
        const { card } = await response.json();
        setCards((previous) => [...previous, card]);
      } else {
        alert(`카드 추가 실패: ${await response.text()}`);
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function handleDeleteCard(id: string) {
    if (!window.confirm("이 카드를 삭제할까요?")) return;
    deletingIds.current.add(id);
    const previous = [...cards];
    setCards((list) => list.filter((card) => card.id !== id));
    try {
      const response = await fetch(`/api/cards/${id}`, { method: "DELETE" });
      if (!response.ok) {
        deletingIds.current.delete(id);
        setCards(previous);
      }
    } catch {
      deletingIds.current.delete(id);
      setCards(previous);
    }
  }

  async function handleEditCardSave(updates: EditCardUpdates) {
    if (!editingCard) return;
    const previous = [...cards];
    const cardId = editingCard.id;
    const { attachments: updateAttachments, ...restUpdates } = updates;
    const optimisticUpdates: Partial<CardData> = { ...restUpdates };
    if (updateAttachments) {
      optimisticUpdates.attachments = updateAttachments.map(
        (attachment, index) => ({
          id: attachment.tempId,
          kind: attachment.kind,
          url: attachment.url,
          previewUrl: attachment.previewUrl ?? null,
          fileName: attachment.fileName ?? null,
          fileSize: attachment.fileSize ?? null,
          mimeType: attachment.mimeType ?? null,
          order: index,
        }),
      );
    }
    setCards((list) =>
      list.map((card) =>
        card.id === cardId ? { ...card, ...optimisticUpdates } : card,
      ),
    );
    try {
      const response = await fetch(`/api/cards/${cardId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        setCards(previous);
        return;
      }
      const payload = (await response.json()) as { card?: CardData };
      if (payload.card) {
        setCards((list) =>
          list.map((card) =>
            card.id === cardId ? payload.card! : card,
          ),
        );
      }
    } catch {
      setCards(previous);
    }
  }

  async function handleCopyToAllGroups(sourceCard: CardData) {
    if (
      poolTitles.has(
        sections.find((section) => section.id === sourceCard.sectionId)?.title ??
          "",
      )
    ) {
      alert("팀 공용 자료 섹션의 카드는 일괄 복제 대상이 아니에요.");
      return;
    }
    if (
      !window.confirm(
        `"${sourceCard.title}" 카드를 모든 모둠 섹션에 복제할까요?\n(팀 공용 섹션 제외)`,
      )
    ) {
      return;
    }

    setCopying(sourceCard.id);
    try {
      const response = await fetch(
        `/api/breakout/assignments/${assignment.id}/copy-card`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sourceCardId: sourceCard.id }),
        },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(`복제 실패: ${data.error ?? response.statusText}`);
        return;
      }
      const { copiedTo, cards: newCards } = await response.json();

      if (Array.isArray(newCards) && newCards.length > 0) {
        setCards((previous) => [
          ...previous,
          ...newCards.map((card: Record<string, unknown>) =>
            normalizeCopiedCard(card, currentUserId),
          ),
        ]);
      }
      alert(`${copiedTo}개 섹션에 카드가 복제되었어요.`);
    } catch (error) {
      console.error(error);
      alert("복제 중 오류가 발생했습니다.");
    } finally {
      setCopying(null);
    }
  }

  async function handleToggleGuide(card: CardData, guidePinned: boolean) {
    const previous = [...cards];
    setCards((list) =>
      list.map((current) =>
        current.id === card.id ? { ...current, guidePinned } : current,
      ),
    );
    try {
      const response = await fetch(`/api/cards/${card.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ guidePinned }),
      });
      if (!response.ok) {
        setCards(previous);
        alert("가이드 설정에 실패했어요.");
      }
    } catch {
      setCards(previous);
      alert("가이드 설정에 실패했어요.");
    }
  }

  function cardMenuItems(card: CardData, isPoolCard: boolean): MenuItem[] {
    const canModify =
      currentRole === "owner" ||
      (currentRole === "editor" && card.authorId === currentUserId);
    const items: MenuItem[] = [];
    if (canModify) {
      items.push({
        label: "수정",
        icon: "✏️",
        onClick: () => setEditingCard(card),
      });
    }
    if (canEdit && !!card.authorId && !card.studentAuthorId) {
      items.push({
        label: card.guidePinned ? "가이드 해제" : "가이드 고정",
        icon: "📌",
        onClick: () => handleToggleGuide(card, !card.guidePinned),
      });
    }
    if (canBulkCopy && !isPoolCard) {
      items.push({
        label: copying === card.id ? "복제 중…" : "모든 모둠에 복제",
        icon: "🧬",
        onClick: () => handleCopyToAllGroups(card),
      });
    }
    if (canModify) {
      items.push({
        label: "삭제",
        icon: "🗑️",
        danger: true,
        onClick: () => handleDeleteCard(card.id),
      });
    }
    return items;
  }

  const sectionOptions = sections.map((section) => ({
    id: section.id,
    title: section.title,
  }));

  return (
    <div className="board-canvas-wrap">
      <BreakoutHeader
        boardTitle={boardTitle}
        boardSlug={boardSlug}
        templateName={assignment.templateName}
        groupCount={assignment.groupCount}
        visibility={assignment.visibility}
        deployMode={assignment.deployMode}
        localStatus={localStatus}
        isOwner={isOwner}
        archiving={archiving}
        onOpenManager={() => setManagerOpen(true)}
        onArchive={handleArchive}
      />

      {poolSections.length > 0 && (
        <section
          style={{ padding: "8px 16px 16px" }}
          aria-label="팀 공용 자료"
        >
          {poolSections.map((section) => (
            <PoolColumn
              key={section.id}
              sectionId={section.id}
              sectionTitle={section.title}
              sectionCards={getCardsForSection(section.id)}
              canEdit={canEdit}
              cardMenuItems={cardMenuItems}
              onOpenCard={setOpenCard}
              onAddInSection={setAddForSection}
            />
          ))}
        </section>
      )}

      <div className="columns-board" style={{ alignItems: "flex-start" }}>
        {groupedSections.map(([groupIndex, groupSections]) => {
          const groupMembers = groupSections.flatMap(
            (section) => membershipsBySection.get(section.id) ?? [],
          );
          // Per teacher dashboard: show the most recent card updatedAt per group
          // to surface stalled groups. Foundation CardData doesn't carry updatedAt,
          // so we approximate with "has cards" presence.
          const hasAnyCard = groupSections.some(
            (section) => getCardsForSection(section.id).length > 0,
          );
          return (
            <GroupColumn
              key={groupIndex}
              groupIndex={groupIndex}
              groupSections={groupSections}
              groupCapacity={assignment.groupCapacity}
              groupMembers={groupMembers}
              isOwner={isOwner}
              canEdit={canEdit}
              hasAnyCard={hasAnyCard}
              parseSection={parseGroupSection}
              getCardsForSection={getCardsForSection}
              cardMenuItems={cardMenuItems}
              onOpenCard={setOpenCard}
              onAddInSection={setAddForSection}
            />
          );
        })}
      </div>

      {isOwner && managerOpen && (
        <BreakoutAssignmentManager
          assignmentId={assignment.id}
          boardSlug={boardSlug}
          deployMode={assignment.deployMode}
          groupCapacity={assignment.groupCapacity}
          sharedSectionTitles={assignment.sharedSectionTitles}
          sections={sections}
          memberships={memberships}
          roster={rosterStudents}
          onChange={setMemberships}
          onRosterChange={(newStudents) => {
            // Update via parent wouldn't re-render server list; callers refresh.
            if (newStudents && newStudents.length > 0) {
              // Caller will `router.refresh()` in the manager.
            }
          }}
          onClose={() => setManagerOpen(false)}
        />
      )}

      {canEdit && localStatus === "active" && (
        <AddCardButton
          onAdd={handleAdd}
          sections={sectionOptions}
          canConfigurePoll={canEdit}
        />
      )}

      {addForSection && (
        <AddCardModal
          onAdd={handleAdd}
          onClose={() => setAddForSection(null)}
          sections={sectionOptions}
          defaultSectionId={addForSection}
          canConfigurePoll={canEdit}
        />
      )}

      {editingCard && (
        <EditCardModal
          card={editingCard}
          onSave={handleEditCardSave}
          onClose={() => setEditingCard(null)}
          canConfigurePoll={canEdit}
        />
      )}

      <CardDetailModal
        card={openCard}
        onClose={() => setOpenCard(null)}
        boardId={boardId}
      />
    </div>
  );
}
