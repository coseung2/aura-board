import { useState } from "react";
import type { AddCardData } from "../AddCardModal";
import type { CardData } from "../DraggableCard";
import { GroupIcon } from "../icons/UiIcons";
import { StreamComposer } from "./StreamComposer";
import { StreamPost } from "./StreamPost";
import { StreamActivityTemplatePanel } from "./StreamActivityTemplatePanel";
import type { StreamActivityTemplateState } from "@/lib/stream-activity-templates";
import { StreamGuideList } from "./StreamGuideList";
import { canDeleteCard, canToggleGuideCard, cardHasAnyStudentAuthor, cardHasStudentAuthor, formatBreakoutMemberName, getGroupIdForCardAuthors, isGuideCard, resolveCardBreakoutGroupId, type BreakoutGroup, type BreakoutState, type StreamSection } from "./stream-board-model";
type StreamBreakoutBodyProps = {
  section: StreamSection;
  bucket: CardData[];
  guideCards: CardData[];
  state: BreakoutState;
  activeGroup: string;
  busy: boolean;
  boardId: string;
  canAddPost: boolean;
  currentUserId: string;
  currentRole: "owner" | "editor" | "viewer";
  currentStudentName?: string | null;
  isStudentViewer: boolean;
  onSetActiveGroup: (group: string) => void;
  onJoin: (groupId: string) => Promise<boolean>;
  onRemoveMember: (membershipId: string) => Promise<boolean>;
  onCreateCard: (
    data: { title: string; content: string },
    groupId: string | null,
  ) => Promise<void>;
  onSectionActivityStateChange?: (
    sectionId: string,
    activityTemplateState: StreamActivityTemplateState | null,
  ) => Promise<boolean>;
  onEditCard: (card: CardData) => void;
  onOpenCard: (card: CardData) => void;
  onDeleteCard: (card: CardData) => void;
  onToggleGuide: (card: CardData, guidePinned: boolean) => void;
  guideBusyId: string | null;
};

export function StreamBreakoutBody({
  section,
  bucket,
  guideCards,
  state,
  activeGroup,
  busy,
  boardId,
  canAddPost,
  currentUserId,
  currentRole,
  currentStudentName,
  isStudentViewer,
  onSetActiveGroup,
  onJoin,
  onRemoveMember,
  onCreateCard,
  onSectionActivityStateChange,
  onEditCard,
  onOpenCard,
  onDeleteCard,
  onToggleGuide,
  guideBusyId,
}: StreamBreakoutBodyProps) {
  const groups = [...state.groups].sort((a, b) => a.order - b.order);
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Record<string, boolean>>({});

  function groupCards(groupId: string | null): CardData[] {
    return bucket.filter((c) => resolveCardBreakoutGroupId(c, groups) === groupId);
  }

  function renderGroupArea(group: BreakoutGroup | null, cards: CardData[]) {
    const groupId = group?.id ?? null;
    const groupKey = group?.id ?? "__unassigned";
    const canCollapsePosts = !section.activityTemplate && cards.length > 1;
    const expanded = expandedGroupKeys[groupKey] === true;
    const visibleCards = canCollapsePosts && !expanded ? cards.slice(0, 1) : cards;
    return (
      <div className="stream-breakout-group-area" key={groupKey}>
        <div className="stream-breakout-group-area-head">
          <div className="stream-breakout-group-title-row">
            <span className="stream-breakout-group-area-name">
              {group?.name ?? "미지정"}
            </span>
            {group && (
              <span className="stream-breakout-group-area-count">
                {group.memberCount}명
              </span>
            )}
            {canCollapsePosts && (
              <button
                type="button"
                className="stream-breakout-group-post-toggle"
                aria-expanded={expanded}
                onClick={() =>
                  setExpandedGroupKeys((prev) => ({
                    ...prev,
                    [groupKey]: !expanded,
                  }))
                }
              >
                {expanded ? "접기" : `게시글 ${cards.length}개 펼치기`}
              </button>
            )}
            {group && group.members && group.members.length > 0 && (
              <div className="stream-breakout-member-list" aria-label={`${group.name} 학생`}>
                {group.members.map((member) => (
                  <span className="stream-breakout-member-chip" key={member.id}>
                    <span>{formatBreakoutMemberName(member)}</span>
                    {state.canManage && (
                      <button
                        type="button"
                        aria-label={`${member.studentName} 모둠에서 내보내기`}
                        onClick={() => void onRemoveMember(member.id)}
                        disabled={busy}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        {section.activityTemplate && (
          <StreamActivityTemplatePanel
            template={section.activityTemplate}
            sectionId={section.id}
            cards={cards}
            canEdit={state.canManage || canAddPost}
            isTeacherView={state.canManage}
            windowMemberCount={group?.memberCount}
            windowMemberNames={group?.members?.map((member) => member.studentName)}
            windowCurrentMemberName={state.canManage ? null : currentStudentName}
            state={section.activityTemplateState ?? null}
            canEditCard={(card) => canDeleteCard(card, currentUserId, currentRole)}
            onEditCard={onEditCard}
            onDeleteCard={onDeleteCard}
            onStateChange={(nextState) =>
              onSectionActivityStateChange?.(section.id, nextState) ??
              Promise.resolve(false)
            }
            onCreateCard={(data) => onCreateCard(data, groupId)}
          />
        )}
        {!section.activityTemplate &&
          (cards.length === 0 ? (
            <div className="stream-section-empty">아직 게시글이 없어요.</div>
          ) : (
            <div
              className={`stream-post-grid${expanded ? " stream-post-masonry" : ""}`}
            >
              {visibleCards.map((card) => (
                <StreamPost
                  key={card.id}
                  card={card}
                  canEdit={canDeleteCard(card, currentUserId, currentRole)}
                  onEdit={() => onEditCard(card)}
                  onOpen={() => onOpenCard(card)}
                  canDelete={canDeleteCard(card, currentUserId, currentRole)}
                  onDelete={() => onDeleteCard(card)}
                  canToggleGuide={canToggleGuideCard(card, state.canManage)}
                  guideBusy={guideBusyId === card.id}
                  onToggleGuide={(guidePinned) => onToggleGuide(card, guidePinned)}
                  boardId={boardId}
                  isStudentViewer={isStudentViewer}
                />
              ))}
            </div>
          ))}
      </div>
    );
  }

  // Student flow: students now enter after teacher assignment. If membership
  // has not arrived yet, show the available section surface without a lock.
  if (!state.canManage) {
    if (!state.membership) {
      const previewCards = groupCards(null);
      const previewMemberCount =
        Math.max(0, ...groups.map((group) => group.memberCount)) || undefined;
      return (
        <div className="stream-breakout-group-view">
          <StreamGuideList
            cards={guideCards}
            boardId={boardId}
            currentUserId={currentUserId}
            currentRole={currentRole}
            canToggleGuide={false}
            isStudentViewer={isStudentViewer}
            guideBusyId={guideBusyId}
            onEditCard={onEditCard}
            onOpenCard={onOpenCard}
            onDeleteCard={onDeleteCard}
            onToggleGuide={onToggleGuide}
          />
          {section.activityTemplate ? (
            <StreamActivityTemplatePanel
              template={section.activityTemplate}
              sectionId={section.id}
              cards={previewCards}
              canEdit={canAddPost}
              isTeacherView={false}
              windowMemberCount={previewMemberCount}
              windowCurrentMemberName={currentStudentName}
              state={section.activityTemplateState ?? null}
              onCreateCard={(data) => onCreateCard(data, null)}
            />
          ) : previewCards.length === 0 ? (
            <div className="stream-section-empty">아직 게시글이 없어요.</div>
          ) : (
            <div className="stream-post-grid">
              {previewCards.map((card) => (
                <StreamPost
                  key={card.id}
                  card={card}
                  canEdit={false}
                  onEdit={() => undefined}
                  onOpen={() => onOpenCard(card)}
                  canDelete={false}
                  onDelete={() => onDeleteCard(card)}
                  boardId={boardId}
                  isStudentViewer={isStudentViewer}
                />
              ))}
            </div>
          )}
        </div>
      );
    }

    const myGroupId = state.membership.groupId;
    const myGroup = groups.find((g) => g.id === myGroupId) ?? null;
    const cards = groupCards(myGroupId);
    const myGroupExpanded = expandedGroupKeys[myGroupId] === true;
    const canCollapseMyGroupPosts = !section.activityTemplate && cards.length > 1;
    const visibleMyGroupCards =
      canCollapseMyGroupPosts && !myGroupExpanded ? cards.slice(0, 1) : cards;
    const myGroupGuideList = (
      <StreamGuideList
        cards={guideCards}
        boardId={boardId}
        currentUserId={currentUserId}
        currentRole={currentRole}
        canToggleGuide={false}
        isStudentViewer={isStudentViewer}
        guideBusyId={guideBusyId}
        onEditCard={onEditCard}
        onOpenCard={onOpenCard}
        onDeleteCard={onDeleteCard}
        onToggleGuide={onToggleGuide}
      />
    );
    return (
      <div className="stream-breakout-group-view">
        {myGroupGuideList}
        <div className="stream-breakout-my-group">
          <span>{myGroup?.name ?? "내 모둠"}</span>
          {myGroup && <span>{myGroup.memberCount}명</span>}
          {canCollapseMyGroupPosts && (
            <button
              type="button"
              className="stream-breakout-group-post-toggle"
              aria-expanded={myGroupExpanded}
              onClick={() =>
                setExpandedGroupKeys((prev) => ({
                  ...prev,
                  [myGroupId]: !myGroupExpanded,
                }))
              }
            >
              {myGroupExpanded ? "접기" : `게시글 ${cards.length}개 펼치기`}
            </button>
          )}
        </div>
        {section.activityTemplate && (
          <StreamActivityTemplatePanel
            template={section.activityTemplate}
            sectionId={section.id}
            cards={cards}
            canEdit={canAddPost}
            isTeacherView={false}
            windowMemberCount={myGroup?.memberCount}
            windowMemberNames={myGroup?.members?.map((member) => member.studentName)}
            windowCurrentMemberName={currentStudentName}
            state={section.activityTemplateState ?? null}
            canEditCard={(card) => canDeleteCard(card, currentUserId, currentRole)}
            onEditCard={onEditCard}
            onDeleteCard={onDeleteCard}
            onCreateCard={(data) => onCreateCard(data, myGroupId)}
          />
        )}
        {!section.activityTemplate &&
          (cards.length === 0 ? (
            <div className="stream-section-empty">아직 게시글이 없어요.</div>
          ) : (
            <div
              className={`stream-post-grid${
                myGroupExpanded ? " stream-post-masonry" : ""
              }`}
            >
              {visibleMyGroupCards.map((card) => (
                <StreamPost
                  key={card.id}
                  card={card}
                  canEdit={canDeleteCard(card, currentUserId, currentRole)}
                  onEdit={() => onEditCard(card)}
                  onOpen={() => onOpenCard(card)}
                  canDelete={canDeleteCard(card, currentUserId, currentRole)}
                  onDelete={() => onDeleteCard(card)}
                  boardId={boardId}
                  isStudentViewer={isStudentViewer}
                />
              ))}
            </div>
          ))}
      </div>
    );
  }

  // Teacher flow: segment bar + compare or single-group view.
  const unassigned = groupCards(null);
  const teacherGuideList = (
    <StreamGuideList
      cards={guideCards}
      boardId={boardId}
      currentUserId={currentUserId}
      currentRole={currentRole}
      canToggleGuide={state.canManage}
      isStudentViewer={isStudentViewer}
      guideBusyId={guideBusyId}
      onEditCard={onEditCard}
      onOpenCard={onOpenCard}
      onDeleteCard={onDeleteCard}
      onToggleGuide={onToggleGuide}
    />
  );
  return (
    <div className="stream-breakout-teacher">
      <div className="stream-breakout-segments" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeGroup === "all"}
          className={activeGroup === "all" ? "is-active" : ""}
          onClick={() => onSetActiveGroup("all")}
        >
          전체
        </button>
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            role="tab"
            aria-selected={activeGroup === group.id}
            className={activeGroup === group.id ? "is-active" : ""}
            onClick={() => onSetActiveGroup(group.id)}
          >
            {group.name}
          </button>
        ))}
      </div>
      {teacherGuideList}
      {activeGroup === "all" ? (
        <div className="stream-breakout-compare">
          {groups.map((group) => renderGroupArea(group, groupCards(group.id)))}
          {unassigned.length > 0 && renderGroupArea(null, unassigned)}
        </div>
      ) : (
        <div className="stream-breakout-group-view">
          {renderGroupArea(
            groups.find((g) => g.id === activeGroup) ?? null,
            groupCards(activeGroup),
          )}
        </div>
      )}
    </div>
  );
}
