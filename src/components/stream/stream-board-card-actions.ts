import type { Dispatch, FormEvent, MutableRefObject, SetStateAction } from "react";
import type { AddCardData } from "../AddCardModal";
import type { EditCardUpdates } from "../EditCardModal";
import type { CardData } from "../DraggableCard";
import { sortSections } from "@/lib/sort-sections";
import { resolveCardBreakoutGroupId, sortPosts, type BreakoutState, type StreamSection } from "./stream-board-model";

type Context = {
  boardId: string;
  composerGroupId: string | null;
  isStudentViewer?: boolean;
  cards: CardData[];
  openCard: CardData | null;
  editingCard: CardData | null;
  breakoutBySection: Record<string, BreakoutState>;
  newSectionTitle: string;
  sectionAddBusy: boolean;
  deletingIds: MutableRefObject<Set<string>>;
  setCards: Dispatch<SetStateAction<CardData[]>>;
  setSections: Dispatch<SetStateAction<StreamSection[]>>;
  setOpenCard: Dispatch<SetStateAction<CardData | null>>;
  setIsAddingSection: Dispatch<SetStateAction<boolean>>;
  setNewSectionTitle: Dispatch<SetStateAction<string>>;
  setSectionAddBusy: Dispatch<SetStateAction<boolean>>;
  setSectionAddError: Dispatch<SetStateAction<string | null>>;
};

export function createStreamBoardCardActions({
  boardId, composerGroupId, isStudentViewer, cards, openCard, editingCard, breakoutBySection,
  newSectionTitle, sectionAddBusy, deletingIds, setCards, setSections,
  setOpenCard, setIsAddingSection, setNewSectionTitle, setSectionAddBusy,
  setSectionAddError,
}: Context) {
async function handleAdd(data: AddCardData, groupId?: string | null) {
  const sectionId = data.sectionId ?? null;
  const requestedGroupId = groupId === undefined ? composerGroupId : groupId;
  const breakout = sectionId ? breakoutBySection[sectionId] : undefined;
  const effectiveGroupId =
    sectionId && breakout?.config
      ? !breakout.canManage
        ? breakout.membership?.groupId ?? null
        : requestedGroupId &&
            breakout.groups.some((group) => group.id === requestedGroupId)
          ? requestedGroupId
          : null
      : null;
  const siblingOrders = cards
    .filter(
      (card) =>
        (card.sectionId ?? null) === sectionId &&
        (card.groupId ?? null) === (effectiveGroupId ?? null),
    )
    .map((card) => card.order);
  const nextOrder =
    siblingOrders.length > 0 ? Math.max(...siblingOrders) + 1 : 0;
  const res = await fetch("/api/cards", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(isStudentViewer ? { "x-aura-student-viewer": "1" } : {}),
    },
    body: JSON.stringify({
      boardId,
      title: data.title,
      content: data.content,
      linkUrl: data.linkUrl || null,
      linkTitle: data.linkTitle || null,
      linkDesc: data.linkDesc || null,
      linkImage: data.linkImage || null,
      attachments: data.attachments,
      commentVoteOptionCount: data.commentVoteOptionCount ?? null,
      commentVoteOptionLabels: data.commentVoteOptionLabels ?? null,
      x: 0,
      y: 0,
      order: nextOrder,
      sectionId,
      groupId: effectiveGroupId ?? null,
    }),
  });
  if (!res.ok) {
    alert(`게시글 작성에 실패했어요: ${await res.text()}`);
    throw new Error("Failed to create stream post");
  }
  const { card } = (await res.json()) as { card: CardData };
  const visibleCard =
    effectiveGroupId && !card.groupId ? { ...card, groupId: effectiveGroupId } : card;
  setCards((prev) => sortPosts([visibleCard, ...prev]));
}

async function handleDelete(card: CardData) {
  if (!window.confirm("게시글을 삭제할까요?")) return;
  deletingIds.current.add(card.id);
  const prev = cards;
  const wasOpen = openCard?.id === card.id ? openCard : null;
  setCards((list) => list.filter((item) => item.id !== card.id));
  setOpenCard((current) => (current?.id === card.id ? null : current));
  try {
    const res = await fetch(`/api/cards/${card.id}`, { method: "DELETE" });
    if (!res.ok) {
      deletingIds.current.delete(card.id);
      setCards(prev);
      if (wasOpen) setOpenCard(wasOpen);
    }
  } catch {
    deletingIds.current.delete(card.id);
    setCards(prev);
    if (wasOpen) setOpenCard(wasOpen);
  }
}

async function handleEditCardSave(updates: EditCardUpdates) {
  if (!editingCard) return;
  const prev = cards;
  const cardId = editingCard.id;
  const { attachments: updateAttachments, ...restUpdates } = updates;
  const optimisticUpdates: Partial<CardData> = { ...restUpdates };
  if (updateAttachments) {
    optimisticUpdates.attachments = updateAttachments.map((attachment, index) => ({
      id:
        attachment.tempId &&
        !attachment.tempId.startsWith("legacy-") &&
        !attachment.tempId.startsWith("tmp-")
          ? attachment.tempId
          : `opt-${index}-${attachment.kind}`,
      kind: attachment.kind,
      url: attachment.url,
      previewUrl: attachment.previewUrl ?? null,
      fileName: attachment.fileName ?? null,
      fileSize: attachment.fileSize ?? null,
      mimeType: attachment.mimeType ?? null,
      order: index,
    }));
  }
  setCards((list) =>
    sortPosts(
      list.map((card) =>
        card.id === cardId ? { ...card, ...optimisticUpdates } : card,
      ),
    ),
  );
  setOpenCard((card) =>
    card?.id === cardId ? { ...card, ...optimisticUpdates, id: card.id } : card,
  );
  try {
    const res = await fetch(`/api/cards/${cardId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      setCards(prev);
      setOpenCard((card) => (card?.id === cardId ? editingCard : card));
      alert("게시글 수정에 실패했어요.");
      return;
    }
    const refreshed = await fetch(`/api/cards/${cardId}`).catch(() => null);
    if (refreshed?.ok) {
      const data = (await refreshed.json()) as { card?: CardData };
      if (data.card) {
        setCards((list) =>
          sortPosts(list.map((card) => (card.id === cardId ? data.card! : card))),
        );
        setOpenCard((card) => (card?.id === cardId ? data.card! : card));
      }
    }
  } catch {
    setCards(prev);
    setOpenCard((card) => (card?.id === cardId ? editingCard : card));
    alert("게시글 수정에 실패했어요.");
  }
}

function startAddSection() {
  setIsAddingSection(true);
  setSectionAddError(null);
}

function cancelAddSection() {
  if (sectionAddBusy) return;
  setIsAddingSection(false);
  setNewSectionTitle("");
  setSectionAddError(null);
}

async function handleAddSection(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const title = newSectionTitle.trim();
  if (!title) {
    setSectionAddError("섹션 이름을 입력하세요.");
    return;
  }

  setSectionAddBusy(true);
  setSectionAddError(null);
  try {
    const res = await fetch("/api/sections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ boardId, title }),
    });
    if (!res.ok) {
      setSectionAddError("섹션 추가에 실패했어요.");
      return;
    }
    const { section } = (await res.json()) as { section: StreamSection };
    setSections((prev) => [...prev, section].sort(sortSections));
    setNewSectionTitle("");
    setIsAddingSection(false);
  } catch {
    setSectionAddError("섹션 추가에 실패했어요.");
  } finally {
    setSectionAddBusy(false);
  }
}


  return {
    handleAdd,
    handleDelete,
    handleEditCardSave,
    startAddSection,
    cancelAddSection,
    handleAddSection,
  };
}

export type StreamBoardCardActions = ReturnType<typeof createStreamBoardCardActions>;
