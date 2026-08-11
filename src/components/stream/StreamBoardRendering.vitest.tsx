import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CardData } from "../DraggableCard";
import { StreamBreakoutBody } from "./StreamBreakoutBody";
import { StreamGroupedFeed } from "./StreamGroupedFeed";
import type {
  BreakoutState,
  StreamSection,
} from "./stream-board-model";

vi.mock("./StreamPost", () => ({
  StreamPost: ({ card, onOpen }: { card: CardData; onOpen: () => void }) => (
    <button type="button" onClick={onOpen}>
      {card.title}
    </button>
  ),
}));

vi.mock("../SectionActionsPanel", () => ({
  SectionActionsPanel: () => null,
}));

vi.mock("./StreamComposer", () => ({
  StreamComposer: () => <div>작성기</div>,
}));

vi.mock("./StreamActivityTemplatePanel", () => ({
  StreamActivityTemplatePanel: () => <div>활동 템플릿</div>,
}));

function card(id: string, title: string, groupId: string | null): CardData {
  return {
    id,
    title,
    content: "내용",
    color: null,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    order: Number(id.slice(-1)) || 0,
    authorId: "teacher-1",
    sectionId: "section-1",
    groupId,
  };
}

function groupedProps(
  overrides: Partial<ComponentProps<typeof StreamGroupedFeed>> = {},
): ComponentProps<typeof StreamGroupedFeed> {
  return {
    sections: [],
    grouped: { bySection: new Map(), unsectioned: [] },
    viewer: {
      boardId: "board-1",
      canEdit: false,
      currentUserId: "teacher-1",
      currentRole: "owner",
      canAddPost: true,
      isStudentViewer: false,
    },
    sectionCreation: {
      isAdding: false,
      title: "",
      busy: false,
      error: null,
      onStart: vi.fn(),
      onCancel: vi.fn(),
      onTitleChange: vi.fn(),
      onSubmit: vi.fn(),
    },
    sectionUi: {
      onOpenPanel: vi.fn(),
      onOpenPromptModal: vi.fn(),
      onOpenTemplateModal: vi.fn(),
      onOpenBreakoutModal: vi.fn(),
      onOpenComposer: vi.fn(),
    },
    sectionActions: {
      handleSectionSlideshowToggle: vi.fn().mockResolvedValue(undefined),
      handleMoveSection: vi.fn().mockResolvedValue(undefined),
      handleSectionActivityStateChange: vi.fn().mockResolvedValue(true),
      handleMoveSectionContent: vi.fn().mockResolvedValue(undefined),
      handleToggleGuide: vi.fn(),
      handleJoinBreakout: vi.fn().mockResolvedValue(true),
    },
    busy: {
      templateSectionId: null,
      slideshowSectionId: null,
      promptSectionId: null,
      sectionOrder: null,
      contentOrder: null,
      guideCardId: null,
    },
    breakout: {
      stateBySection: {},
      activeGroupBySection: {},
      busySectionId: null,
      onSetActiveGroup: vi.fn(),
      onRemoveMember: vi.fn().mockResolvedValue(true),
    },
    cardActions: {
      handleAdd: vi.fn().mockResolvedValue(undefined),
      handleDelete: vi.fn(),
    },
    cardUi: {
      onEdit: vi.fn(),
      onOpen: vi.fn(),
    },
    ...overrides,
  };
}

describe("stream board extracted rendering", () => {
  it("renders unsectioned posts and preserves the open-card interaction", () => {
    const unsectioned = card("card-1", "섹션 없는 글", null);
    const onOpenCard = vi.fn();
    render(
      <StreamGroupedFeed
        {...groupedProps({
          grouped: { bySection: new Map(), unsectioned: [unsectioned] },
          cardUi: { onEdit: vi.fn(), onOpen: onOpenCard },
        })}
      />,
    );

    expect(screen.getByRole("heading", { name: "섹션 없음" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "섹션 없는 글" }));
    expect(onOpenCard).toHaveBeenCalledWith(unsectioned);
  });

  it("expands collapsed breakout posts and wires the newly revealed post", () => {
    const section: StreamSection = {
      id: "section-1",
      title: "모둠 활동",
      order: 0,
      pinned: false,
      activityTemplate: null,
    };
    const first = card("card-1", "첫 글", "group-1");
    const second = card("card-2", "둘째 글", "group-1");
    const state: BreakoutState = {
      config: {
        groupCount: 1,
        groupCapacity: null,
        joinMode: "teacher_assign",
      },
      groups: [
        { id: "group-1", name: "1모둠", order: 0, memberCount: 2 },
      ],
      membership: null,
      canManage: true,
    };
    const onOpenCard = vi.fn();

    render(
      <StreamBreakoutBody
        section={section}
        bucket={[first, second]}
        guideCards={[]}
        state={state}
        activeGroup="all"
        busy={false}
        boardId="board-1"
        canAddPost
        currentUserId="teacher-1"
        currentRole="owner"
        isStudentViewer={false}
        onSetActiveGroup={vi.fn()}
        onJoin={vi.fn().mockResolvedValue(true)}
        onRemoveMember={vi.fn().mockResolvedValue(true)}
        onCreateCard={vi.fn().mockResolvedValue(undefined)}
        onEditCard={vi.fn()}
        onOpenCard={onOpenCard}
        onDeleteCard={vi.fn()}
        onToggleGuide={vi.fn()}
        guideBusyId={null}
      />,
    );

    expect(screen.getByRole("button", { name: "첫 글" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "둘째 글" })).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "게시글 2개 펼치기" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "둘째 글" }));

    expect(onOpenCard).toHaveBeenCalledWith(second);
    expect(screen.getByRole("button", { name: "접기" })).toBeTruthy();
  });
});
