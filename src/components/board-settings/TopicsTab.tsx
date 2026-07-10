"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardSection } from "./types";
import { sortSections, type SortableSection } from "@/lib/sort-sections";
import {
  applySectionReorder,
  buildSectionReorderPayload,
  type SectionOrderUpdate,
} from "@/lib/section-reorder";
import {
  type SubjectOrder,
  normalizeSubjectOrder,
} from "@/lib/subject-order";
import { SettingsSection } from "./SettingsSection";

type Props = {
  boardId: string;
  layout: string;
  sections: BoardSection[];
  initialSubjectOrder: SubjectOrder | null;
  onSectionsReordered?: (next: BoardSection[]) => void;
  onSubjectOrderChange?: (next: SubjectOrder) => void;
};

type EditableSection = BoardSection & {
  order: number;
  baseOrder: number;
  pinned: boolean;
  title: string;
  accessToken: string | null;
};

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

/**
 * columns 레이아웃의 섹션 순서를 편집하고 일괄 저장한다.
 * 핀 여부와 시각 순서를 한 draft에서 관리해 이동/저장 규칙이 어긋나지 않게 한다.
 */
export function TopicsTab({
  boardId,
  layout,
  sections,
  initialSubjectOrder,
  onSectionsReordered,
  onSubjectOrderChange,
}: Props) {
  if (layout !== "columns") {
    return (
      <div className="board-settings-empty">
        <p>
          이 레이아웃에는 정렬할 주제가 없어요.
          <br />
          주제별 보드에서만 주제 정렬을 사용할 수 있어요.
        </p>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="board-settings-empty">
        <p>
          아직 만든 주제가 없어요.
          <br />
          보드의 <strong>+ 섹션 추가</strong> 버튼으로 만들 수 있어요.
        </p>
      </div>
    );
  }

  return (
    <TopicsTabBody
      boardId={boardId}
      sections={sections}
      initialSubjectOrder={initialSubjectOrder}
      onSectionsReordered={onSectionsReordered}
      onSubjectOrderChange={onSubjectOrderChange}
    />
  );
}

function TopicsTabBody({
  boardId,
  sections,
  initialSubjectOrder,
  onSectionsReordered,
  onSubjectOrderChange,
}: Omit<Props, "layout">) {
  const initialDraft = useMemo(
    () => buildDraftFromSections(sections),
    [sections],
  );
  const [draft, setDraft] = useState<EditableSection[]>(initialDraft);
  const [savedDraft, setSavedDraft] =
    useState<EditableSection[]>(initialDraft);
  const savedDraftRef = useRef(initialDraft);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const subjectOrder = normalizeSubjectOrder(initialSubjectOrder);

  useEffect(() => {
    const previousBaseline = savedDraftRef.current;
    setDraft((current) => {
      const hasUnsavedChanges = isDirty(previousBaseline, current);
      if (
        hasUnsavedChanges &&
        containSameSectionIds(current, initialDraft)
      ) {
        return mergeDraftMetadata(current, initialDraft);
      }
      return initialDraft;
    });
    savedDraftRef.current = initialDraft;
    setSavedDraft(initialDraft);
    setSaveState({ status: "idle" });
  }, [initialDraft]);

  const split = splitPinnedUnpinned(draft);
  const dirty = isDirty(savedDraft, draft);
  const saving = saveState.status === "saving";

  function updateDraft(
    updater: (current: EditableSection[]) => EditableSection[],
  ) {
    if (saving) return;
    setDraft(updater);
    setSaveState({ status: "idle" });
  }

  function moveWithinGroup(sectionId: string, offset: -1 | 1) {
    updateDraft((current) => {
      const currentSplit = splitPinnedUnpinned(current);
      const section = current.find((row) => row.id === sectionId);
      if (!section) return current;

      const group = section.pinned
        ? currentSplit.pinned
        : currentSplit.unpinned;
      const fromIndex = group.findIndex((row) => row.id === sectionId);
      const toIndex = fromIndex + offset;
      if (fromIndex < 0 || toIndex < 0 || toIndex >= group.length) {
        return current;
      }

      const movedGroup = moveItem(group, fromIndex, toIndex);
      return normalizeDraftOrder(
        section.pinned
          ? [...movedGroup, ...currentSplit.unpinned]
          : [...currentSplit.pinned, ...movedGroup],
      );
    });
  }

  function togglePin(sectionId: string, pinned: boolean) {
    updateDraft((current) => {
      const next = current.map((section) =>
        section.id === sectionId ? { ...section, pinned } : section,
      );
      const nextSplit = splitPinnedUnpinned(next);
      return normalizeDraftOrder([
        ...nextSplit.pinned,
        ...nextSplit.unpinned,
      ]);
    });
  }

  function sortAllByCreatedAt(direction: "asc" | "desc") {
    updateDraft((current) => {
      const currentSplit = splitPinnedUnpinned(current);
      const unpinned = [...currentSplit.unpinned].sort((a, b) =>
        compareByBaseOrder(a, b, direction),
      );
      return normalizeDraftOrder([...currentSplit.pinned, ...unpinned]);
    });
  }

  async function save() {
    if (!dirty || saving) return;
    setSaveState({ status: "saving" });

    try {
      const updates = buildSectionReorderPayload(draft);
      const response = await fetch(
        `/api/boards/${boardId}/sections/reorder`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sections: updates, subjectOrder }),
        },
      );
      if (!response.ok) {
        throw new Error(
          await readErrorMessage(response, "주제 순서 저장에 실패했어요."),
        );
      }

      const body = (await response.json().catch(() => null)) as {
        sections?: SectionOrderUpdate[];
      } | null;
      const persistedUpdates =
        body?.sections?.length === updates.length ? body.sections : updates;
      const persistedDraft = applySectionReorder(draft, persistedUpdates);
      const mergedSections = mergeBoardSections(sections, persistedDraft);

      savedDraftRef.current = persistedDraft;
      setDraft(persistedDraft);
      setSavedDraft(persistedDraft);
      onSectionsReordered?.(mergedSections);
      onSubjectOrderChange?.(subjectOrder);
      setSaveState({ status: "saved" });
    } catch (error) {
      console.error("[TopicsTab] save failed", error);
      setSaveState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "주제 순서 저장에 실패했어요.",
      });
    }
  }

  return (
    <div className="board-settings-control-stack">
      <SettingsSection
        title="주제 순서"
        actions={
          <>
            <button
              type="button"
              className="topics-tab-sort-btn"
              onClick={() => sortAllByCreatedAt("asc")}
              title="한번에 먼저 만든 순서로 정렬"
              disabled={saving}
            >
              생성 ↑
            </button>
            <button
              type="button"
              className="topics-tab-sort-btn"
              onClick={() => sortAllByCreatedAt("desc")}
              title="한번에 나중에 만든 순서로 정렬"
              disabled={saving}
            >
              생성 ↓
            </button>
          </>
        }
      >
        <p className="board-settings-row-note">
          ↑/↓ 버튼으로 섹션 순서를 바꾸세요.
          <br />
          핀한 섹션은 항상 왼쪽에 남아 있어요.
        </p>
        <ol
          className="topics-tab-list"
          aria-label="보드 주제 순서"
          role="list"
        >
          {split.pinned.map((section, groupIndex) => (
            <TopicRow
              key={section.id}
              section={section}
              displayIndex={groupIndex}
              groupIndex={groupIndex}
              groupLength={split.pinned.length}
              pinned
              disabled={saving}
              onMoveUp={() => moveWithinGroup(section.id, -1)}
              onMoveDown={() => moveWithinGroup(section.id, 1)}
              onTogglePin={(next) => togglePin(section.id, next)}
            />
          ))}
          {split.unpinned.map((section, groupIndex) => (
            <TopicRow
              key={section.id}
              section={section}
              displayIndex={split.pinned.length + groupIndex}
              groupIndex={groupIndex}
              groupLength={split.unpinned.length}
              pinned={false}
              disabled={saving}
              onMoveUp={() => moveWithinGroup(section.id, -1)}
              onMoveDown={() => moveWithinGroup(section.id, 1)}
              onTogglePin={(next) => togglePin(section.id, next)}
            />
          ))}
        </ol>
      </SettingsSection>

      <div className="stream-guidance-actions">
        <button
          type="button"
          className="stream-guidance-save"
          onClick={() => void save()}
          disabled={!dirty || saving}
        >
          {saving ? "저장 중..." : "저장"}
        </button>
        {saveState.status === "saved" && (
          <span className="stream-guidance-status" aria-live="polite">
            저장했어요.
          </span>
        )}
        {saveState.status === "error" && (
          <span className="stream-guidance-error" aria-live="polite">
            {saveState.message}
          </span>
        )}
      </div>
    </div>
  );
}

function TopicRow({
  section,
  displayIndex,
  groupIndex,
  groupLength,
  pinned,
  disabled,
  onMoveUp,
  onMoveDown,
  onTogglePin,
}: {
  section: EditableSection;
  displayIndex: number;
  groupIndex: number;
  groupLength: number;
  pinned: boolean;
  disabled: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onTogglePin: (next: boolean) => void;
}) {
  const isFirst = groupIndex === 0;
  const isLast = groupIndex === groupLength - 1;

  return (
    <li className="topics-tab-row" data-pinned={pinned ? "true" : "false"}>
      <span className="topics-tab-row-index" aria-hidden="true">
        {displayIndex + 1}
      </span>
      <span className="topics-tab-row-name" title={section.title}>
        {section.title}
      </span>
      <div className="topics-tab-row-actions">
        <button
          type="button"
          aria-label={`${section.title} 위로`}
          className="modal-attach-reorder-btn topics-tab-reorder-btn"
          onClick={onMoveUp}
          disabled={disabled || isFirst}
        >
          ↑
        </button>
        <button
          type="button"
          aria-label={`${section.title} 아래로`}
          className="modal-attach-reorder-btn topics-tab-reorder-btn"
          onClick={onMoveDown}
          disabled={disabled || isLast}
        >
          ↓
        </button>
        <button
          type="button"
          className="topics-tab-row-pin"
          aria-label={pinned ? `${section.title} 핀 해제` : `${section.title} 핀 고정`}
          aria-pressed={pinned}
          onClick={() => onTogglePin(!pinned)}
          title={pinned ? "핀 해제" : "핀 고정"}
          disabled={disabled}
        >
          📌
        </button>
      </div>
    </li>
  );
}

function buildDraftFromSections(
  sections: BoardSection[],
): EditableSection[] {
  const sortable: Array<BoardSection & SortableSection> = sections.map(
    (section) => ({
      ...section,
      order: section.order ?? 0,
      pinned: Boolean(section.pinned),
    }),
  );

  return sortable.sort(sortSections).map((section) => ({
    ...section,
    accessToken: section.accessToken ?? null,
    order: section.order,
    baseOrder: section.order,
    pinned: section.pinned,
  }));
}

function normalizeDraftOrder(
  sections: EditableSection[],
): EditableSection[] {
  const updates = buildSectionReorderPayload(sections);
  const updateById = new Map(updates.map((update) => [update.id, update]));

  return sections.map((section) => ({
    ...section,
    order: updateById.get(section.id)?.order ?? section.order,
  }));
}

function splitPinnedUnpinned(sections: EditableSection[]): {
  pinned: EditableSection[];
  unpinned: EditableSection[];
} {
  const pinned: EditableSection[] = [];
  const unpinned: EditableSection[] = [];

  for (const section of sections) {
    (section.pinned ? pinned : unpinned).push(section);
  }

  return { pinned, unpinned };
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) return items;
  next.splice(toIndex, 0, moved);
  return next;
}

function compareByBaseOrder(
  a: EditableSection,
  b: EditableSection,
  direction: "asc" | "desc",
): number {
  const byOrder = a.baseOrder - b.baseOrder;
  const result = byOrder || a.id.localeCompare(b.id);
  return direction === "asc" ? result : -result;
}

function isDirty(
  initial: EditableSection[],
  current: EditableSection[],
): boolean {
  if (initial.length !== current.length) return true;

  return current.some((section, index) => {
    const original = initial[index];
    return (
      !original ||
      section.id !== original.id ||
      section.pinned !== original.pinned
    );
  });
}

function containSameSectionIds(
  left: EditableSection[],
  right: EditableSection[],
): boolean {
  if (left.length !== right.length) return false;
  const rightIds = new Set(right.map((section) => section.id));
  return left.every((section) => rightIds.has(section.id));
}

function mergeDraftMetadata(
  current: EditableSection[],
  incoming: EditableSection[],
): EditableSection[] {
  const incomingById = new Map(
    incoming.map((section) => [section.id, section] as const),
  );

  return current.map((section) => {
    const next = incomingById.get(section.id);
    return next
      ? {
          ...section,
          title: next.title,
          accessToken: next.accessToken,
          baseOrder: next.baseOrder,
        }
      : section;
  });
}

function mergeBoardSections(
  source: BoardSection[],
  draft: EditableSection[],
): BoardSection[] {
  const sourceById = new Map(
    source.map((section) => [section.id, section] as const),
  );

  return draft.map((section) => ({
    ...sourceById.get(section.id),
    id: section.id,
    title: section.title,
    accessToken: section.accessToken,
    order: section.order,
    pinned: section.pinned,
  }));
}

async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return fallback;

  try {
    const body = JSON.parse(text) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) {
      return body.error;
    }
  } catch {
    // Plain-text responses are returned below.
  }

  return text.trim() || fallback;
}
