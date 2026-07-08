"use client";

import { useEffect, useMemo, useState } from "react";
import type { BoardSection } from "./types";
import { sortSections, type SortableSection } from "@/lib/sort-sections";
import {
  type SubjectOrder,
  normalizeSubjectOrder,
  subjectOrderLabel,
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
  pinned: boolean;
  title: string;
  accessToken: string | null;
};

const MIN_ORDER = -1_000_000;
const ORDER_STEP = 1_000;

/**
 * 주제 정렬 탭 (2026-07-08) — columns 레이아웃에서 보드 안의 섹션(칼럼) 순서를
 * ↑/↓ 버튼으로 바꾼 뒤 "저장"하면 Section.order가 일괄 PATCH된다.
 *
 * - 정렬 방향(1번부터 / 끝번호부터)은 보드 기본 subjectOrder로 저장되며,
 *   학생이름 시드 모달의 초기 선택값으로도 같이 쓰인다.
 * - 정렬은 unpinned 섹션만 대상으로 한다. pinned는 sortSections 규약상
 *   항상 위에 유지된다.
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
  // 시각 정렬 기준(고정 → 그 외는 order desc) — BoardCanvas에서와 동일한 규약.
  const initialDraft = useMemo(
    () => buildDraftFromSections(sections),
    [sections],
  );
  const [draft, setDraft] = useState<EditableSection[]>(initialDraft);
  const [subjectOrder, setSubjectOrder] = useState<SubjectOrder>(
    normalizeSubjectOrder(initialSubjectOrder),
  );
  const [saveState, setSaveState] = useState<
    | { status: "idle" }
    | { status: "saving" }
    | { status: "saved"; at: number }
    | { status: "error"; message: string }
  >({ status: "idle" });

  // sections prop이 바뀌면(예: 모달 외부에서 카드 정렬 변경 등) draft를
  // 부드럽게 동기화하되, 사용자가 편집 중일 때는 ID 순서를 유지한다.
  useEffect(() => {
    setDraft((current) => {
      if (current.length !== initialDraft.length) return initialDraft;
      const same = current.every((row, idx) => row.id === initialDraft[idx]?.id);
      if (!same) return initialDraft;
      return current.map((row, idx) => ({
        ...row,
        order: initialDraft[idx]?.order ?? row.order,
        pinned: initialDraft[idx]?.pinned ?? row.pinned,
      }));
    });
  }, [initialDraft]);

  useEffect(() => {
    setSubjectOrder(normalizeSubjectOrder(initialSubjectOrder));
  }, [initialSubjectOrder]);

  const split = splitPinnedUnpinned(draft);
  const dirty = isDirty(
    initialDraft,
    draft,
    subjectOrder,
    normalizeSubjectOrder(initialSubjectOrder),
  );

  function moveUnpinned(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= split.unpinned.length) return;
    setDraft((current) => {
      const next = [...current];
      const fromAbs = split.pinned.length + fromIndex;
      const toAbs = split.pinned.length + toIndex;
      const moved = next[fromAbs];
      if (!moved) return current;
      next.splice(fromAbs, 1);
      next.splice(toAbs, 0, moved);
      return renumber(next, split.pinned.length);
    });
  }

  function swapInGroup(group: "pinned" | "unpinned", fromIndex: number, toIndex: number) {
    setDraft((current) => {
      const list = group === "pinned" ? [...split.pinned] : [...split.unpinned];
      if (toIndex < 0 || toIndex >= list.length) return current;
      const fromAbs =
        group === "pinned" ? fromIndex : split.pinned.length + fromIndex;
      const toAbs =
        group === "pinned" ? toIndex : split.pinned.length + toIndex;
      const next = [...current];
      const moved = next[fromAbs];
      if (!moved) return current;
      next.splice(fromAbs, 1);
      next.splice(toAbs, 0, moved);
      return renumber(next, split.pinned.length);
    });
  }

  function togglePin(sectionId: string, pinnedNext: boolean) {
    setDraft((current) => {
      const next = current.map((s) =>
        s.id === sectionId ? { ...s, pinned: pinnedNext } : s,
      );
      return renumber([...next].sort(sortSections), 0);
    });
  }

  async function save() {
    if (!dirty) return;
    setSaveState({ status: "saving" });
    try {
      const fresh = splitPinnedUnpinned(draft);
      const orderedUnpinned = fresh.unpinned;
      const orderedPinned = fresh.pinned.slice().sort((a, b) => a.order - b.order);
      const payload: Array<{
        id: string;
        order: number;
        pinned?: boolean;
      }> = [];

      orderedPinned.forEach((s, idx) => {
        payload.push({ id: s.id, order: idx, pinned: true });
      });
   orderedUnpinned.forEach((s, idx) => {
     payload.push({
       id: s.id,
       order: MIN_ORDER + (orderedPinned.length + (orderedUnpinned.length - 1 - idx)) * ORDER_STEP,
     });
   });

      const res = await fetch(`/api/boards/${boardId}/sections/reorder`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sections: payload, subjectOrder }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        setSaveState({
          status: "error",
          message: msg ? `저장 실패: ${msg}` : "저장 실패",
        });
        return;
      }
      const body = (await res.json().catch(() => null)) as {
        sections?: Array<{ id: string; order: number; pinned: boolean }>;
      } | null;
      const normalized = body?.sections ?? payload;
      // BoardSettingsPanel state와 호환되는 BoardSection[]로 매핑한다.
      const merged: BoardSection[] = sections.map((s) => {
        const found = normalized.find((row) => row.id === s.id);
        return {
          ...s,
          order: found?.order ?? s.order,
          pinned: found?.pinned ?? s.pinned ?? false,
        };
      });
      onSectionsReordered?.(merged);
      onSubjectOrderChange?.(subjectOrder);
      setSaveState({ status: "saved", at: Date.now() });
    } catch (e) {
      console.error("[TopicsTab] save failed", e);
      setSaveState({ status: "error", message: "저장 실패" });
    }
  }

  return (
    <div className="board-settings-control-stack">
      <SettingsSection title="출석번호 정렬 방향">
        <p className="board-settings-row-note">
          학생이름으로 칼럼 만들기를 할 때 기본으로 쓸 방향이에요. 이미 만든
          칼럼에는 영향을 주지 않습니다.
        </p>
        <fieldset
          className="seed-students-modal-fieldset topics-tab-order-fieldset"
          disabled={saveState.status === "saving"}
        >
          <legend className="visually-hidden">정렬 방향 선택</legend>
          <label
            className={`seed-students-option ${
              subjectOrder === "asc" ? "is-selected" : ""
            }`}
          >
            <input
              type="radio"
              name="topics-subject-order"
              value="asc"
              checked={subjectOrder === "asc"}
              onChange={() => setSubjectOrder("asc")}
            />
            <span className="seed-students-option-title">
              {subjectOrderLabel("asc").short} 앞으로
            </span>
            <span className="seed-students-option-desc">
              {subjectOrderLabel("asc").long}
            </span>
          </label>
          <label
            className={`seed-students-option ${
              subjectOrder === "desc" ? "is-selected" : ""
            }`}
          >
            <input
              type="radio"
              name="topics-subject-order"
              value="desc"
              checked={subjectOrder === "desc"}
              onChange={() => setSubjectOrder("desc")}
            />
            <span className="seed-students-option-title">
              {subjectOrderLabel("desc").short}부터 앞으로
            </span>
            <span className="seed-students-option-desc">
              {subjectOrderLabel("desc").long}
            </span>
          </label>
        </fieldset>
      </SettingsSection>

      <SettingsSection title="주제 순서">
        <p className="board-settings-row-note">
          ↑/↓ 버튼으로 칼럼(섹션) 순서를 바꾸세요. 고정한 섹션은 항상
          왼쪽에 남아 있어요.
        </p>
        <ol
          className="topics-tab-list"
          aria-label="보드 주제 순서"
          role="list"
        >
          {split.pinned.map((section, idx, all) => (
            <TopicRow
              key={section.id}
              section={section}
              index={idx}
              pinnedTotal={all.length}
              unpinnedTotal={split.unpinned.length}
              pinned
              onMoveUp={() => swapInGroup("pinned", idx, idx - 1)}
              onMoveDown={() => swapInGroup("pinned", idx, idx + 1)}
              onTogglePin={(next) => togglePin(section.id, next)}
            />
          ))}
          {split.unpinned.map((section, idx, all) => (
            <TopicRow
              key={section.id}
              section={section}
              index={split.pinned.length + idx}
              pinnedTotal={split.pinned.length}
              unpinnedTotal={all.length}
              pinned={false}
              onMoveUp={() => moveUnpinned(idx, idx - 1)}
              onMoveDown={() => moveUnpinned(idx, idx + 1)}
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
  // pinned 그룹 내부: index 0..pinnedTotal-1 사이에서만 이동 가능.
  // unpinned 그룹 내부: index는 pinnedTotal 오프셋이 붙어 있지만 unpinned 안에서의
  //   위치(0..unpinnedTotal-1)만 비교하면 된다.
  const isFirst = pinned ? index === 0 : index - pinnedTotal === 0;
  const isLast = pinned
    ? index === pinnedTotal - 1
    : index - pinnedTotal === unpinnedTotal - 1;

  return (
    <li className="topics-tab-row" data-pinned={pinned ? "true" : "false"}>
      <span className="topics-tab-row-index" aria-hidden="true">
        {index + 1}
      </span>
      <span className="topics-tab-row-name" title={section.title}>
        {section.title}
      </span>
      {pinned && (
        <span
          className="board-settings-row-badge on"
          aria-label="고정됨"
          title="고정됨"
        >
          📌 고정
        </span>
      )}
      <div className="topics-tab-row-actions">
        <button
          type="button"
          aria-label="위로"
          className="modal-attach-reorder-btn"
          onClick={onMoveUp}
          disabled={isFirst}
        >
          ↑
        </button>
        <button
          type="button"
          aria-label="아래로"
          className="modal-attach-reorder-btn"
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
          title={pinned ? "고정 해제" : "고정하기"}
        >
          {pinned ? "고정 해제" : "고정"}
        </button>
      </div>
    </li>
  );
}

function buildDraftFromSections(
  sections: BoardSection[],
): EditableSection[] {
  const sortable: Array<BoardSection & SortableSection & { idx: number }> =
    sections.map((s, idx) => ({
      id: s.id,
      title: s.title,
      accessToken: s.accessToken ?? null,
      order: s.order ?? 0,
      pinned: Boolean(s.pinned),
      idx,
    }));
  sortable.sort(sortSections);
  return sortable.map((s) => ({
    id: s.id,
    title: s.title,
    accessToken: s.accessToken ?? null,
    order: s.order ?? 0,
    pinned: s.pinned,
  }));
}

function splitPinnedUnpinned(draft: EditableSection[]): {
  pinned: EditableSection[];
  unpinned: EditableSection[];
} {
  const pinned: EditableSection[] = [];
  const unpinned: EditableSection[] = [];
  for (const row of draft) {
    (row.pinned ? pinned : unpinned).push(row);
  }
  return { pinned, unpinned };
}

function isDirty(
  initial: EditableSection[],
  current: EditableSection[],
  orderNow: SubjectOrder,
  orderThen: SubjectOrder,
): boolean {
  if (orderNow !== orderThen) return true;
  if (initial.length !== current.length) return true;
  for (let i = 0; i < current.length; i++) {
    const a = current[i];
    const b = initial[i];
    if (!a || !b) return true;
    if (a.id !== b.id) return true;
    if (a.pinned !== b.pinned) return true;
  }
  return false;
}

function renumber(rows: EditableSection[], pinnedCount: number) {
  // pinned 0..pinnedCount-1: order = idx (ascending)
  // unpinned pinnedCount..: order = (total - idx - 1) (descending)
  return rows.map((row, idx) => {
    if (idx < pinnedCount) {
      return { ...row, order: idx };
    }
    return { ...row, order: rows.length - idx - 1 };
  });
}
