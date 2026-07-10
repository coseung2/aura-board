"use client";

import { useEffect, useMemo, useState } from "react";
import type { BoardSection } from "./types";
import { sortSections } from "@/lib/sort-sections";
import {
  mergeSectionPositions,
  moveSectionToTarget,
  normalizeSectionOrders,
  setSectionPinned,
  toSectionReorderPayload,
  type SectionPosition,
} from "@/lib/section-order";
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

/**
 * 주제 정렬 탭 — columns 레이아웃에서 보드 안의 섹션(칼럼) 순서를
 * ↑/↓ 버튼으로 바꾼 뒤 "저장"하면 Section.order를 한 번에 저장한다.
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
  const [saveState, setSaveState] = useState<
    | { status: "idle" }
    | { status: "saving" }
    | { status: "saved"; at: number }
    | { status: "error"; message: string }
  >({ status: "idle" });
  const subjectOrder = normalizeSubjectOrder(initialSubjectOrder);

  // 외부에서 섹션 메타데이터가 바뀌면 동기화한다. 사용자가 순서를 편집 중인
  // 경우에는 기존과 동일하게 서버가 확정한 섹션 ID 순서를 우선한다.
  useEffect(() => {
    setDraft((current) => {
      if (current.length !== initialDraft.length) return initialDraft;
      const same = current.every(
        (row, index) => row.id === initialDraft[index]?.id,
      );
      if (!same) return initialDraft;

      return current.map((row, index) => {
        const fresh = initialDraft[index];
        return fresh
          ? {
              ...row,
              title: fresh.title,
              accessToken: fresh.accessToken,
              baseOrder: fresh.baseOrder,
              order: fresh.order,
              pinned: fresh.pinned,
            }
          : row;
      });
    });
  }, [initialDraft]);

  const split = splitPinnedUnpinned(draft);
  const dirty = isDirty(initialDraft, draft);

  function moveInGroup(
    group: "pinned" | "unpinned",
    fromIndex: number,
    toIndex: number,
  ) {
    setDraft((current) => {
      const currentSplit = splitPinnedUnpinned(current);
      const list = currentSplit[group];
      if (toIndex < 0 || toIndex >= list.length) return current;
      const from = list[fromIndex];
      const target = list[toIndex];
      if (!from || !target) return current;
      return moveSectionToTarget(current, from.id, target.id) ?? current;
    });
  }

  function togglePin(sectionId: string, pinned: boolean) {
    setDraft((current) =>
      setSectionPinned(current, sectionId, pinned) ?? current,
    );
  }

  function sortAllByCreatedAt(direction: "asc" | "desc") {
    setDraft((current) => {
      const currentSplit = splitPinnedUnpinned(current);
      const unpinned = [...currentSplit.unpinned].sort((a, b) =>
        compareByBaseOrder(a, b, direction),
      );
      return normalizeSectionOrders([...currentSplit.pinned, ...unpinned]);
    });
  }

  async function save() {
    if (!dirty) return;
    setSaveState({ status: "saving" });

    try {
      const payload = toSectionReorderPayload(draft);
      const res = await fetch(`/api/boards/${boardId}/sections/reorder`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sections: payload, subjectOrder }),
      });
      if (!res.ok) {
        const message = await res.text().catch(() => "");
        setSaveState({
          status: "error",
          message: message ? `저장 실패: ${message}` : "저장 실패",
        });
        return;
      }

      const body = (await res.json().catch(() => null)) as {
        sections?: SectionPosition[];
      } | null;
      const confirmed = body?.sections ?? payload;
      const merged = mergeSectionPositions(
        sections.map((section) => ({
          ...section,
          order: section.order ?? 0,
          pinned: section.pinned ?? false,
        })),
        confirmed,
      );

      setDraft((current) => mergeSectionPositions(current, confirmed));
      onSectionsReordered?.(merged);
      onSubjectOrderChange?.(subjectOrder);
      setSaveState({ status: "saved", at: Date.now() });
    } catch (error) {
      console.error("[TopicsTab] save failed", error);
      setSaveState({ status: "error", message: "저장 실패" });
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
            >
              생성 ↑
            </button>
            <button
              type="button"
              className="topics-tab-sort-btn"
              onClick={() => sortAllByCreatedAt("desc")}
              title="한번에 나중에 만든 순서로 정렬"
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
          {split.pinned.map((section, index, all) => (
            <TopicRow
              key={section.id}
              section={section}
              index={index}
              pinnedTotal={all.length}
              unpinnedTotal={split.unpinned.length}
              pinned
              onMoveUp={() => moveInGroup("pinned", index, index - 1)}
              onMoveDown={() => moveInGroup("pinned", index, index + 1)}
              onTogglePin={(next) => togglePin(section.id, next)}
            />
          ))}
          {split.unpinned.map((section, index, all) => (
            <TopicRow
              key={section.id}
              section={section}
              index={split.pinned.length + index}
              pinnedTotal={split.pinned.length}
              unpinnedTotal={all.length}
              pinned={false}
              onMoveUp={() => moveInGroup("unpinned", index, index - 1)}
              onMoveDown={() => moveInGroup("unpinned", index, index + 1)}
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
          disabled={!dirty || saveState.status === "saving"}
        >
          {saveState.status === "saving" ? "저장 중..." : "저장"}
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
  index,
  pinnedTotal,
  unpinnedTotal,
  pinned,
  onMoveUp,
  onMoveDown,
  onTogglePin,
}: {
  section: EditableSection;
  index: number;
  pinnedTotal: number;
  unpinnedTotal: number;
  pinned: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onTogglePin: (next: boolean) => void;
}) {
  const groupIndex = pinned ? index : index - pinnedTotal;
  const groupTotal = pinned ? pinnedTotal : unpinnedTotal;
  const isFirst = groupIndex === 0;
  const isLast = groupIndex === groupTotal - 1;

  return (
    <li className="topics-tab-row" data-pinned={pinned ? "true" : "false"}>
      <span className="topics-tab-row-index" aria-hidden="true">
        {index + 1}
      </span>
      <span className="topics-tab-row-name" title={section.title}>
        {section.title}
      </span>
      <div className="topics-tab-row-actions">
        <button
          type="button"
          aria-label="위로"
          className="modal-attach-reorder-btn topics-tab-reorder-btn"
          onClick={onMoveUp}
          disabled={isFirst}
        >
          ↑
        </button>
        <button
          type="button"
          aria-label="아래로"
          className="modal-attach-reorder-btn topics-tab-reorder-btn"
          onClick={onMoveDown}
          disabled={isLast}
        >
          ↓
        </button>
        <button
          type="button"
          className="topics-tab-row-pin"
          aria-pressed={pinned}
          onClick={() => onTogglePin(!pinned)}
          title={pinned ? "핀 해제" : "핀 고정"}
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
  return sections
    .map((section) => ({
      ...section,
      title: section.title,
      accessToken: section.accessToken ?? null,
      order: section.order ?? 0,
      baseOrder: section.order ?? 0,
      pinned: section.pinned ?? false,
    }))
    .sort(sortSections);
}

function isDirty(
  initial: EditableSection[],
  current: EditableSection[],
): boolean {
  if (initial.length !== current.length) return true;
  for (let index = 0; index < current.length; index++) {
    const before = initial[index];
    const after = current[index];
    if (!before || !after) return true;
    if (before.id !== after.id || before.pinned !== after.pinned) return true;
  }
  return false;
}

function compareByBaseOrder(
  a: EditableSection,
  b: EditableSection,
  direction: "asc" | "desc",
) {
  const byOrder = a.baseOrder - b.baseOrder;
  const result = byOrder || a.id.localeCompare(b.id);
  return direction === "asc" ? result : -result;
}

function splitPinnedUnpinned(draft: readonly EditableSection[]): {
  pinned: EditableSection[];
  unpinned: EditableSection[];
} {
  const pinned: EditableSection[] = [];
  const unpinned: EditableSection[] = [];
  for (const section of draft) {
    (section.pinned ? pinned : unpinned).push(section);
  }
  return { pinned, unpinned };
}
