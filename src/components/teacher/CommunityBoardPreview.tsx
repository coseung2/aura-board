"use client";

import { CardBody } from "@/components/cards/CardBody";

export type CommunityPreviewSection = {
  id: string;
  title: string;
  order: number;
  pinned: boolean;
};

export type CommunityPreviewCard = {
  id: string;
  sectionId: string | null;
  title: string;
  content: string;
  color: string | null;
  imageUrl: string | null;
  thumbUrl: string | null;
  linkUrl: string | null;
  linkTitle: string | null;
  linkDesc: string | null;
  linkImage: string | null;
  videoUrl: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileMimeType: string | null;
  createdAt: string;
  externalAuthorName: string | null;
  studentAuthorName: string | null;
  authorName: string | null;
  authors: Array<{ order: number; displayName: string }>;
  attachments: Array<{
    id: string;
    kind: string;
    url: string;
    previewUrl: string | null;
    fileName: string | null;
    fileSize: number | null;
    mimeType: string | null;
    order: number;
  }>;
  anonymousAuthor: boolean;
};

function PreviewCard({ card }: { card: CommunityPreviewCard }) {
  return (
    <article
      className="community-preview-card padlet-card"
      style={{ backgroundColor: card.color ?? undefined }}
    >
      <CardBody
        card={{ ...card, id: undefined }}
        showEngagement={false}
        contentDisplay="static"
      />
    </article>
  );
}

export function CommunityBoardPreview({
  layout,
  sections,
  cards,
}: {
  layout: string;
  sections: CommunityPreviewSection[];
  cards: CommunityPreviewCard[];
}) {
  if (cards.length === 0) {
    return (
      <div className="community-preview-empty">
        <h2>아직 결과물이 없습니다</h2>
        <p>보드 구조는 복사할 수 있으며, 복사본은 빈 상태로 시작합니다.</p>
      </div>
    );
  }

  if (layout === "columns") {
    const visibleSections = [
      ...sections,
      ...(cards.some((card) => !card.sectionId)
        ? [{ id: "unsectioned", title: "기타", order: Number.MAX_SAFE_INTEGER, pinned: false }]
        : []),
    ];
    return (
      <div className="community-preview-columns">
        {visibleSections.map((section) => {
          const sectionCards = cards.filter((card) =>
            section.id === "unsectioned"
              ? !card.sectionId
              : card.sectionId === section.id,
          );
          return (
            <section key={section.id} className="community-preview-column">
              <h2>{section.title || "제목 없는 주제"}</h2>
              <div className="community-preview-column-cards">
                {sectionCards.map((card) => <PreviewCard key={card.id} card={card} />)}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  if (layout === "stream" && sections.length > 0) {
    return (
      <div className="community-preview-stream">
        {sections.map((section) => {
          const sectionCards = cards.filter((card) => card.sectionId === section.id);
          if (sectionCards.length === 0) return null;
          return (
            <section key={section.id}>
              <h2>{section.title || "제목 없는 주제"}</h2>
              <div className="community-preview-stream-cards">
                {sectionCards.map((card) => <PreviewCard key={card.id} card={card} />)}
              </div>
            </section>
          );
        })}
        {cards.some((card) => !card.sectionId) ? (
          <section>
            <h2>기타</h2>
            <div className="community-preview-stream-cards">
              {cards.filter((card) => !card.sectionId).map((card) => (
                <PreviewCard key={card.id} card={card} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="community-preview-grid">
      {cards.map((card) => <PreviewCard key={card.id} card={card} />)}
    </div>
  );
}
