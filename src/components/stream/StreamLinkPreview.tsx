"use client";

import type { CardData } from "../DraggableCard";

type Props = {
  card: Pick<CardData, "linkUrl" | "linkTitle" | "linkDesc" | "linkImage">;
};

export function StreamLinkPreview({ card }: Props) {
  if (!card.linkUrl) return null;

  const host = getHost(card.linkUrl);
  const hasPreview = Boolean(card.linkTitle || card.linkDesc || card.linkImage);

  return (
    <a
      className={`stream-link-preview${hasPreview ? "" : " is-plain"}`}
      href={card.linkUrl}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
    >
      {card.linkImage && (
        <span className="stream-link-image">
          <img src={card.linkImage} alt="" loading="lazy" decoding="async" />
        </span>
      )}
      <span className="stream-link-copy">
        <span className="stream-link-host">{host}</span>
        {card.linkTitle && <strong>{card.linkTitle}</strong>}
        {card.linkDesc && <span>{card.linkDesc}</span>}
        {!card.linkTitle && !card.linkDesc && <strong>{card.linkUrl}</strong>}
      </span>
    </a>
  );
}

function getHost(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "");
  } catch {
    return rawUrl;
  }
}
