import type { Dispatch, SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../DraggableCard";
import { createStreamBoardCardActions } from "./stream-board-card-actions";
import type {
  BreakoutState,
  StreamSection,
} from "./stream-board-model";

function stateBox<T>(initial: T) {
  let value = initial;
  const set: Dispatch<SetStateAction<T>> = (next) => {
    value =
      typeof next === "function"
        ? (next as (previous: T) => T)(value)
        : next;
  };
  return { get value() { return value; }, set };
}

function card(overrides: Partial<CardData> = {}): CardData {
  return {
    id: "card-1",
    title: "기존 글",
    content: "내용",
    color: null,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    order: 0,
    authorId: "teacher-1",
    ...overrides,
  };
}

function setup(options?: {
  cards?: CardData[];
  openCard?: CardData | null;
  editingCard?: CardData | null;
  composerGroupId?: string | null;
  breakoutBySection?: Record<string, BreakoutState>;
}) {
  const cards = stateBox(options?.cards ?? []);
  const sections = stateBox<StreamSection[]>([]);
  const openCard = stateBox<CardData | null>(options?.openCard ?? null);
  const editingCard = stateBox<CardData | null>(options?.editingCard ?? null);
  const composerOpen = stateBox(true);
  const composerSectionId = stateBox<string | null>("section-1");
  const composerGroupId = stateBox<string | null>(
    options?.composerGroupId ?? null,
  );
  const isAddingSection = stateBox(false);
  const newSectionTitle = stateBox("");
  const sectionAddBusy = stateBox(false);
  const sectionAddError = stateBox<string | null>(null);
  const deletingIds = { current: new Set<string>() };

  const actions = createStreamBoardCardActions({
    boardId: "board-1",
    composerSectionId: composerSectionId.value,
    composerGroupId: composerGroupId.value,
    currentUserId: "teacher-1",
    currentStudentName: null,
    isStudentViewer: false,
    anonymousAuthor: false,
    cards: cards.value,
    openCard: openCard.value,
    editingCard: editingCard.value,
    sections: sections.value,
    breakoutBySection: options?.breakoutBySection ?? {},
    newSectionTitle: newSectionTitle.value,
    sectionAddBusy: sectionAddBusy.value,
    deletingIds,
    setCards: cards.set,
    setSections: sections.set,
    setComposerOpen: composerOpen.set,
    setComposerSectionId: composerSectionId.set,
    setComposerGroupId: composerGroupId.set,
    setOpenCard: openCard.set,
    setEditingCard: editingCard.set,
    setIsAddingSection: isAddingSection.set,
    setNewSectionTitle: newSectionTitle.set,
    setSectionAddBusy: sectionAddBusy.set,
    setSectionAddError: sectionAddError.set,
  });

  return { actions, cards, openCard, deletingIds };
}

describe("stream board card actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the resolved section/group payload and inserts the returned card", async () => {
    const existing = card({
      id: "existing",
      sectionId: "section-1",
      groupId: "group-1",
      order: 3,
    });
    const created = card({
      id: "created",
      title: "새 글",
      sectionId: "section-1",
      groupId: null,
      order: 4,
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ card: created }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { actions, cards } = setup({
      cards: [existing],
      composerGroupId: "group-1",
      breakoutBySection: {
        "section-1": {
          config: {
            groupCount: 1,
            groupCapacity: null,
            joinMode: "teacher_assign",
          },
          groups: [
            { id: "group-1", name: "1모둠", order: 0, memberCount: 0 },
          ],
          membership: null,
          canManage: true,
        },
      },
    });

    await actions.handleAdd({
      title: "새 글",
      content: "새 내용",
      sectionId: "section-1",
      linkUrl: "https://example.com",
      commentVoteOptionCount: 2,
      commentVoteOptionLabels: ["찬성", "반대"],
    });

    const [, request] = fetchMock.mock.calls[0];
    expect(JSON.parse(request.body)).toEqual({
      boardId: "board-1",
      title: "새 글",
      content: "새 내용",
      linkUrl: "https://example.com",
      linkTitle: null,
      linkDesc: null,
      linkImage: null,
      commentVoteOptionCount: 2,
      commentVoteOptionLabels: ["찬성", "반대"],
      x: 0,
      y: 0,
      order: 4,
      sectionId: "section-1",
      groupId: "group-1",
    });
    expect(cards.value.map(({ id, groupId }) => ({ id, groupId }))).toEqual([
      { id: "existing", groupId: "group-1" },
      { id: "created", groupId: "group-1" },
    ]);
  });

  it("optimistically removes a card and restores it when deletion fails", async () => {
    const target = card();
    let resolveFetch: ((value: { ok: boolean }) => void) | undefined;
    const fetchMock = vi.fn().mockReturnValue(
      new Promise<{ ok: boolean }>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { actions, cards, openCard, deletingIds } = setup({
      cards: [target],
      openCard: target,
    });

    const pending = actions.handleDelete(target);
    expect(cards.value).toEqual([]);
    expect(openCard.value).toBeNull();
    expect(deletingIds.current.has(target.id)).toBe(true);

    resolveFetch?.({ ok: false });
    await pending;

    expect(cards.value).toEqual([target]);
    expect(openCard.value).toEqual(target);
    expect(deletingIds.current.has(target.id)).toBe(false);
  });
});
