import type { Dispatch, SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../DraggableCard";
import { createStreamBoardSectionActions } from "./stream-board-section-actions";
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
    title: "글",
    content: "내용",
    color: null,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    order: 0,
    authorId: "teacher-1",
    sectionId: "section-1",
    ...overrides,
  };
}

function setup() {
  const originalSection: StreamSection = {
    id: "section-1",
    title: "첫 섹션",
    order: 0,
    pinned: false,
    activityTemplate: null,
    activityTemplateState: { slideshowEnabled: true },
  };
  const sections = stateBox([originalSection]);
  const cards = stateBox([card()]);
  const templateBusy = stateBox<string | null>(null);
  const slideshowBusy = stateBox<string | null>(null);
  const promptBusy = stateBox<string | null>(null);
  const sectionOrderBusy = stateBox<string | null>(null);
  const contentOrderBusy = stateBox<string | null>(null);
  const guideBusy = stateBox<string | null>(null);
  const breakoutBusy = stateBox<string | null>(null);
  const breakout = stateBox<Record<string, BreakoutState>>({});
  const activeGroup = stateBox<Record<string, string>>({});

  const actions = createStreamBoardSectionActions({
    currentUserId: "teacher-1",
    isStudentViewer: false,
    cards: cards.value,
    sections: sections.value,
    breakoutBySection: breakout.value,
    sectionSlideshowBusyId: slideshowBusy.value,
    sectionPromptBusyId: promptBusy.value,
    setCards: cards.set,
    setSections: sections.set,
    setTemplateBusySectionId: templateBusy.set,
    setSectionSlideshowBusyId: slideshowBusy.set,
    setSectionPromptBusyId: promptBusy.set,
    setSectionOrderBusyId: sectionOrderBusy.set,
    setContentOrderBusyId: contentOrderBusy.set,
    setGuideBusyId: guideBusy.set,
    setBreakoutBusyId: breakoutBusy.set,
    setBreakoutBySection: breakout.set,
    setActiveGroupBySection: activeGroup.set,
  });

  return { actions, cards, sections, templateBusy, originalSection };
}

describe("stream board section actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("removes a deleted section and all of its visible cards", () => {
    const { actions, cards, sections } = setup();

    actions.handleSectionDeleted("section-1");

    expect(sections.value).toEqual([]);
    expect(cards.value).toEqual([]);
  });

  it("optimistically updates a template payload and rolls back a failed save", async () => {
    let resolveFetch: ((value: { ok: boolean }) => void) | undefined;
    const fetchMock = vi.fn().mockReturnValue(
      new Promise<{ ok: boolean }>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("alert", vi.fn());
    const { actions, sections, templateBusy, originalSection } = setup();

    const pending = actions.handleSectionTemplateChange(
      "section-1",
      "word_cloud",
    );

    expect(sections.value[0]).toMatchObject({
      activityTemplate: "word_cloud",
      activityTemplateState: {
        slideshowEnabled: true,
        wordCloudPublished: false,
      },
    });
    expect(templateBusy.value).toBe("section-1");
    const [, request] = fetchMock.mock.calls[0];
    expect(JSON.parse(request.body)).toEqual({
      activityTemplate: "word_cloud",
      activityTemplateState: {
        slideshowEnabled: true,
        wordCloudPublished: false,
      },
    });

    resolveFetch?.({ ok: false });
    await expect(pending).resolves.toBe(false);

    expect(sections.value).toEqual([originalSection]);
    expect(templateBusy.value).toBeNull();
  });
});
