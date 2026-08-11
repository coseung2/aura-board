import type { FormEvent } from "react";
import type { CardData } from "../DraggableCard";
import { ChevronDownIcon, ChevronUpIcon, GroupIcon, PencilIcon, SlideshowIcon, TemplateIcon, TrashIcon, WritingGuideIcon } from "../icons/UiIcons";
import { StreamActivityTemplatePanel } from "./StreamActivityTemplatePanel";
import { StreamPost } from "./StreamPost";
import { StreamGuideList } from "./StreamGuideList";
import { STREAM_ACTIVITY_TEMPLATE_LABELS, type StreamActivityTemplateState } from "@/lib/stream-activity-templates";
import type { StreamBoardCardActions } from "./stream-board-card-actions";
import type { StreamBoardSectionActions } from "./stream-board-section-actions";
import {
  buildBreakoutStateFromSection, buildSectionContentItems, canDeleteCard, canToggleGuideCard,
  isGuideCard, isSectionSlideshowEnabled,
  type BreakoutState, type StreamContentItem, type StreamSection,
} from "./stream-board-model";
import { StreamBreakoutBody } from "./StreamBreakoutBody";

type StreamGroupedFeedViewer = {
  boardId: string;
  canEdit: boolean;
  currentUserId: string;
  currentRole: "owner" | "editor" | "viewer";
  canAddPost: boolean;
  isStudentViewer?: boolean;
  currentStudentName?: string | null;
};

type StreamGroupedFeedSectionCreation = {
  isAdding: boolean;
  title: string;
  busy: boolean;
  error: string | null;
  onStart: () => void;
  onCancel: () => void;
  onTitleChange: (title: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

type StreamGroupedFeedSectionUi = {
  onOpenPanel: (sectionId: string, tab: "rename" | "delete") => void;
  onOpenPromptModal: (sectionId: string) => void;
  onOpenTemplateModal: (sectionId: string) => void;
  onOpenBreakoutModal: (sectionId: string) => void;
  onOpenComposer: (sectionId: string, groupId?: string | null) => void;
};

type StreamGroupedFeedBusyState = {
  templateSectionId: string | null;
  slideshowSectionId: string | null;
  promptSectionId: string | null;
  sectionOrder: string | null;
  contentOrder: string | null;
  guideCardId: string | null;
};

type StreamGroupedFeedBreakout = {
  stateBySection: Record<string, BreakoutState>;
  activeGroupBySection: Record<string, string>;
  busySectionId: string | null;
  onSetActiveGroup: (sectionId: string, group: string) => void;
  onRemoveMember: (sectionId: string, membershipId: string) => Promise<boolean>;
};

type StreamGroupedFeedCardUi = {
  onEdit: (card: CardData) => void;
  onOpen: (card: CardData) => void;
};

type StreamGroupedFeedProps = {
  sections: StreamSection[];
  grouped: { bySection: Map<string, CardData[]>; unsectioned: CardData[] };
  viewer: StreamGroupedFeedViewer;
  sectionCreation: StreamGroupedFeedSectionCreation;
  sectionUi: StreamGroupedFeedSectionUi;
  sectionActions: Pick<
    StreamBoardSectionActions,
    | "handleSectionSlideshowToggle"
    | "handleMoveSection"
    | "handleSectionActivityStateChange"
    | "handleMoveSectionContent"
    | "handleToggleGuide"
    | "handleJoinBreakout"
  >;
  busy: StreamGroupedFeedBusyState;
  breakout: StreamGroupedFeedBreakout;
  cardActions: Pick<StreamBoardCardActions, "handleAdd" | "handleDelete">;
  cardUi: StreamGroupedFeedCardUi;
};

export function StreamGroupedFeed({
  sections,
  grouped,
  viewer,
  sectionCreation,
  sectionUi,
  sectionActions,
  busy,
  breakout,
  cardActions,
  cardUi,
}: StreamGroupedFeedProps) {
  const { boardId, canEdit, currentUserId, currentRole, canAddPost, isStudentViewer, currentStudentName } = viewer;
  const { isAdding: isAddingSection, title: newSectionTitle, busy: sectionAddBusy, error: sectionAddError, onStart: onStartAddSection, onCancel: onCancelAddSection, onTitleChange: onSectionTitleChange, onSubmit: onSubmitSection } = sectionCreation;
  const { onOpenPanel: onOpenSectionPanel, onOpenPromptModal: onOpenSectionPromptModal, onOpenTemplateModal, onOpenBreakoutModal, onOpenComposer: onOpenComposerForSection } = sectionUi;
  const { handleSectionSlideshowToggle: onToggleSectionSlideshow, handleMoveSection: onMoveSection, handleSectionActivityStateChange: onSectionActivityStateChange, handleMoveSectionContent: onMoveSectionContent, handleToggleGuide: onToggleGuide, handleJoinBreakout: onJoinBreakout } = sectionActions;
  const { templateSectionId: templateBusySectionId, slideshowSectionId: sectionSlideshowBusyId, promptSectionId: sectionPromptBusyId, sectionOrder: sectionOrderBusyId, contentOrder: contentOrderBusyId, guideCardId: guideBusyId } = busy;
  const { stateBySection: breakoutBySection, activeGroupBySection, busySectionId: breakoutBusyId, onSetActiveGroup, onRemoveMember: onRemoveBreakoutMember } = breakout;
  const { handleAdd: addCard, handleDelete: onDeleteCard } = cardActions;
  const { onEdit: onEditCard, onOpen: onOpenCard } = cardUi;

  function onCreateSectionCard(
    sectionId: string,
    data: { title: string; content: string },
    groupId?: string | null,
  ): Promise<void> {
    return addCard({ ...data, sectionId }, groupId);
  }

  return (
    <>
      {canEdit && (
        <div className="stream-section-add-row">
          {isAddingSection ? (
            <form className="stream-section-add-form" onSubmit={onSubmitSection}>
              <input
                type="text"
                value={newSectionTitle}
                onChange={(event) => onSectionTitleChange(event.target.value)}
                placeholder="섹션 이름"
                className="stream-section-add-input"
                maxLength={80}
                autoFocus
                disabled={sectionAddBusy}
              />
              <button
                type="submit"
                className="stream-section-add-submit"
                disabled={sectionAddBusy}
              >
                추가
              </button>
              <button
                type="button"
                className="stream-section-add-cancel"
                onClick={onCancelAddSection}
                disabled={sectionAddBusy}
              >
                취소
              </button>
              {sectionAddError && (
                <span className="stream-section-add-error" role="alert">
                  {sectionAddError}
                </span>
              )}
            </form>
          ) : (
            <button
              type="button"
              className="column-add-btn stream-section-add-btn"
              onClick={onStartAddSection}
            >
              + 섹션 추가
            </button>
          )}
        </div>
      )}

      {sections.map((section, sectionIndex) => {
        const bucket = grouped.bySection.get(section.id) ?? [];
        const breakout =
          breakoutBySection[section.id] ??
          buildBreakoutStateFromSection(section, canEdit);
        const hasBreakout = !!breakout?.config;
        const guideCards = bucket.filter(isGuideCard);
        const sectionCards = bucket.filter((card) => !isGuideCard(card));
	        const contentItems = buildSectionContentItems(section, sectionCards);
	        const orderBusy = sectionOrderBusyId !== null;
	        const slideshowEnabled = isSectionSlideshowEnabled(section);
	        const canMoveUp = sectionIndex > 0;
	        const canMoveDown = sectionIndex < sections.length - 1;
        return (
          <section
            key={section.id}
            className={`stream-section-group${
              section.activityTemplate ? " stream-section-group--activity" : ""
            }`}
          >
            <header className="stream-section-header">
              <div className="stream-section-heading">
                <h2 className="stream-section-title">{section.title}</h2>
                {canEdit && (
	                  <div className="stream-section-inline-actions">
	                    <button
	                      type="button"
	                      className={`ui-icon-action ui-icon-action-soft stream-section-icon-btn stream-section-slideshow-btn${
	                        slideshowEnabled ? " is-active" : ""
	                      }`}
	                      aria-label={
	                        slideshowEnabled
	                          ? `${section.title} 슬라이드쇼에서 제외`
	                          : `${section.title} 슬라이드쇼에 포함`
	                      }
	                      aria-pressed={slideshowEnabled}
	                      title={slideshowEnabled ? "슬라이드쇼 포함" : "슬라이드쇼 제외"}
	                      onClick={() => void onToggleSectionSlideshow(section)}
	                      disabled={sectionSlideshowBusyId === section.id}
	                    >
	                      <SlideshowIcon size={16} />
	                    </button>
	                    <button
	                      type="button"
	                      className="ui-icon-action ui-icon-action-soft stream-section-icon-btn"
	                      aria-label={`${section.title} 글쓰기 안내 설정`}
	                      title="글쓰기 안내"
	                      onClick={() => onOpenSectionPromptModal(section.id)}
	                      disabled={sectionPromptBusyId === section.id}
	                    >
	                      <WritingGuideIcon size={16} />
	                    </button>
	                    <button
	                      type="button"
	                      className="ui-icon-action ui-icon-action-soft stream-section-icon-btn"
                      aria-label={`${section.title} 이름 변경`}
                      title="이름 변경"
                      onClick={() => onOpenSectionPanel(section.id, "rename")}
                    >
                      <PencilIcon size={16} />
                    </button>
                    <button
                      type="button"
                      className="ui-icon-action ui-icon-action-soft stream-section-icon-btn"
                      aria-label={`${section.title} 위로 이동`}
                      title="위로 이동"
                      onClick={() => void onMoveSection(section.id, "up")}
                      disabled={orderBusy || !canMoveUp}
                    >
                      <ChevronUpIcon size={16} />
                    </button>
                    <button
                      type="button"
                      className="ui-icon-action ui-icon-action-soft stream-section-icon-btn"
                      aria-label={`${section.title} 아래로 이동`}
                      title="아래로 이동"
                      onClick={() => void onMoveSection(section.id, "down")}
                      disabled={orderBusy || !canMoveDown}
                    >
                      <ChevronDownIcon size={16} />
                    </button>
                    <button
                      type="button"
                      className="ui-icon-action ui-icon-action-soft ui-icon-action-danger stream-section-icon-btn"
                      aria-label={`${section.title} 삭제`}
                      title="삭제"
                      onClick={() => onOpenSectionPanel(section.id, "delete")}
                    >
                      <TrashIcon size={16} />
                    </button>
                  </div>
                )}
                {section.activityTemplate && (
                  <span className="stream-section-template-badge">
                    {STREAM_ACTIVITY_TEMPLATE_LABELS[section.activityTemplate]}
                  </span>
                )}
              </div>
             {canEdit && (
               <div className="stream-section-menu">
                 <button
                   type="button"
                   className={`stream-section-template-open stream-section-breakout-open${
                     breakout?.config ? " is-active" : ""
                   }`}
                   onClick={() => onOpenBreakoutModal(section.id)}
                   disabled={breakoutBusyId === section.id}
                   aria-label={`${section.title} 모둠 활동 설정`}
                 >
                   <GroupIcon size={16} />
                   {breakout?.config
                     ? `모둠 ${breakout.config.groupCount}`
                     : "모둠활동"}
                 </button>
                 <button
                   type="button"
                   className="stream-section-template-open"
                   onClick={() => onOpenTemplateModal(section.id)}
                   disabled={templateBusySectionId === section.id}
                   aria-label={`${section.title} 활동 템플릿 설정`}
                 >
                   <TemplateIcon size={16} />
                   템플릿
                 </button>
               </div>
             )}
            </header>
            {canAddPost && (
              <div className="stream-section-post-row">
                <button
                  type="button"
                  className="stream-section-post-btn"
                  onClick={() =>
                    onOpenComposerForSection(
                      section.id,
                      breakout?.config && !breakout.canManage
                        ? breakout.membership?.groupId ?? null
                        : null,
                    )
                  }
                >
                  + 게시글 추가
                </button>
              </div>
            )}
            {!hasBreakout && (
              <StreamGuideList
                cards={guideCards}
                boardId={boardId}
                currentUserId={currentUserId}
                currentRole={currentRole}
                canToggleGuide={canEdit}
                isStudentViewer={!!isStudentViewer}
                guideBusyId={guideBusyId}
                onEditCard={onEditCard}
                onOpenCard={onOpenCard}
                onDeleteCard={onDeleteCard}
                onToggleGuide={onToggleGuide}
              />
            )}
            {hasBreakout && breakout ? (
              <StreamBreakoutBody
                section={section}
                bucket={sectionCards}
                guideCards={guideCards}
                state={breakout}
                activeGroup={activeGroupBySection[section.id] ?? "all"}
                busy={breakoutBusyId === section.id}
                boardId={boardId}
                canAddPost={canAddPost}
                currentUserId={currentUserId}
                currentRole={currentRole}
                currentStudentName={currentStudentName}
                isStudentViewer={!!isStudentViewer}
                onSetActiveGroup={(group) => onSetActiveGroup(section.id, group)}
                onJoin={(groupId) => onJoinBreakout(section.id, groupId)}
                onRemoveMember={(membershipId) =>
                  onRemoveBreakoutMember(section.id, membershipId)
                }
                onCreateCard={(data, groupId) =>
                  onCreateSectionCard(section.id, data, groupId)
                }
                onSectionActivityStateChange={onSectionActivityStateChange}
                onEditCard={onEditCard}
                onOpenCard={onOpenCard}
                onDeleteCard={onDeleteCard}
                onToggleGuide={onToggleGuide}
                guideBusyId={guideBusyId}
              />
            ) : contentItems.length === 0 && guideCards.length === 0 ? (
              <div className="stream-section-empty">아직 게시글이 없어요.</div>
            ) : section.activityTemplate ? (
              contentItems.map((item, itemIndex) => (
                <StreamSectionContentItem
                  key={item.id}
                  item={item}
                  itemIndex={itemIndex}
                  itemCount={contentItems.length}
                  section={section}
                  cards={sectionCards}
                  canReorder={canAddPost}
                  canEditTemplate={canAddPost}
                  isTeacherView={canEdit}
                  orderBusyId={contentOrderBusyId}
                  guideBusyId={guideBusyId}
                  boardId={boardId}
                  currentUserId={currentUserId}
                  currentRole={currentRole}
                  currentStudentName={currentStudentName}
                  isStudentViewer={!!isStudentViewer}
                  onMove={(id, direction) =>
                    onMoveSectionContent(section, contentItems, id, direction)
                  }
                  onEditCard={onEditCard}
                  onOpenCard={onOpenCard}
                  onDeleteCard={onDeleteCard}
                  onToggleGuide={onToggleGuide}
                  onSectionActivityStateChange={onSectionActivityStateChange}
                  onCreateSectionCard={onCreateSectionCard}
                />
              ))
            ) : (
              <div className="stream-post-grid">
                {contentItems.map((item, itemIndex) => (
                  <StreamSectionContentItem
                    key={item.id}
                    item={item}
                    itemIndex={itemIndex}
                    itemCount={contentItems.length}
                    section={section}
                    cards={sectionCards}
                    canReorder={canAddPost}
                    canEditTemplate={canAddPost}
                    isTeacherView={canEdit}
                    orderBusyId={contentOrderBusyId}
                    guideBusyId={guideBusyId}
                    boardId={boardId}
                    currentUserId={currentUserId}
                    currentRole={currentRole}
                    currentStudentName={currentStudentName}
                    isStudentViewer={!!isStudentViewer}
                    onMove={(id, direction) =>
                      onMoveSectionContent(section, contentItems, id, direction)
                    }
                    onEditCard={onEditCard}
                    onOpenCard={onOpenCard}
                    onDeleteCard={onDeleteCard}
                    onToggleGuide={onToggleGuide}
                    onSectionActivityStateChange={onSectionActivityStateChange}
                    onCreateSectionCard={onCreateSectionCard}
                  />
                ))}
              </div>
           )}
          </section>
        );
      })}

      {grouped.unsectioned.length > 0 && (
        <section className="stream-section-group stream-section-group-unsectioned">
          <header className="stream-section-header">
            <h2 className="stream-section-title">섹션 없음</h2>
          </header>
          <div className="stream-post-grid">
            {grouped.unsectioned.map((card) => (
              <StreamPost
                key={card.id}
                card={card}
                canEdit={canDeleteCard(card, currentUserId, currentRole)}
                onEdit={() => onEditCard(card)}
                onOpen={() => onOpenCard(card)}
                canDelete={canDeleteCard(card, currentUserId, currentRole)}
                onDelete={() => onDeleteCard(card)}
                boardId={boardId}
                isStudentViewer={!!isStudentViewer}
              />
            ))}
          </div>
        </section>
      )}

    </>
  );
}

function StreamSectionContentItem({
  item,
  itemIndex,
  itemCount,
  section,
  cards,
  canReorder,
  canEditTemplate,
  isTeacherView,
  orderBusyId,
  guideBusyId,
  boardId,
  currentUserId,
  currentRole,
  currentStudentName,
  isStudentViewer,
  onMove,
  onEditCard,
  onOpenCard,
  onDeleteCard,
  onToggleGuide,
  onSectionActivityStateChange,
  onCreateSectionCard,
}: {
  item: StreamContentItem;
  itemIndex: number;
  itemCount: number;
  section: StreamSection;
  cards: CardData[];
  canReorder: boolean;
  canEditTemplate: boolean;
  isTeacherView: boolean;
  orderBusyId: string | null;
  guideBusyId: string | null;
  boardId: string;
  currentUserId: string;
  currentRole: "owner" | "editor" | "viewer";
  currentStudentName?: string | null;
  isStudentViewer: boolean;
  onMove: (itemId: string, direction: "up" | "down") => Promise<void>;
  onEditCard: (card: CardData) => void;
  onOpenCard: (card: CardData) => void;
  onDeleteCard: (card: CardData) => void;
  onToggleGuide: (card: CardData, guidePinned: boolean) => void;
  onSectionActivityStateChange: (
    sectionId: string,
    activityTemplateState: StreamActivityTemplateState | null,
  ) => Promise<boolean>;
  onCreateSectionCard: (
    sectionId: string,
    data: { title: string; content: string },
    groupId?: string | null,
  ) => Promise<void>;
}) {
  const moving = orderBusyId === item.id;
  const label = item.kind === "template" ? "템플릿" : "게시글";
  return (
    <div className="stream-section-content-item">
      {canReorder && itemCount > 1 && (
        <div className="stream-section-content-order">
          <button
            type="button"
            className="ui-icon-action ui-icon-action-soft stream-section-icon-btn"
            aria-label={`${label} 위로 이동`}
            title="위로 이동"
            onClick={() => void onMove(item.id, "up")}
            disabled={moving || itemIndex === 0}
          >
            <ChevronUpIcon size={16} />
          </button>
          <button
            type="button"
            className="ui-icon-action ui-icon-action-soft stream-section-icon-btn"
            aria-label={`${label} 아래로 이동`}
            title="아래로 이동"
            onClick={() => void onMove(item.id, "down")}
            disabled={moving || itemIndex === itemCount - 1}
          >
            <ChevronDownIcon size={16} />
          </button>
        </div>
      )}
      {item.kind === "template" ? (
        <StreamActivityTemplatePanel
          template={section.activityTemplate!}
          sectionId={section.id}
          cards={cards}
          canEdit={canEditTemplate}
          isTeacherView={isTeacherView}
          windowCurrentMemberName={currentStudentName}
          state={section.activityTemplateState ?? null}
          canEditCard={(card) => canDeleteCard(card, currentUserId, currentRole)}
          onEditCard={onEditCard}
          onDeleteCard={onDeleteCard}
          onStateChange={(nextState) =>
            onSectionActivityStateChange(section.id, nextState)
          }
          onCreateCard={(data) => onCreateSectionCard(section.id, data)}
        />
      ) : (
        <StreamPost
          card={item.card}
          canEdit={canDeleteCard(item.card, currentUserId, currentRole)}
          onEdit={() => onEditCard(item.card)}
          onOpen={() => onOpenCard(item.card)}
          canDelete={canDeleteCard(item.card, currentUserId, currentRole)}
          onDelete={() => onDeleteCard(item.card)}
          canToggleGuide={canToggleGuideCard(item.card, isTeacherView)}
          guideBusy={guideBusyId === item.card.id}
          onToggleGuide={(guidePinned) => onToggleGuide(item.card, guidePinned)}
          boardId={boardId}
          isStudentViewer={isStudentViewer}
        />
      )}
    </div>
  );
}
