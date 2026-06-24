"use client";

import type { CardData } from "../DraggableCard";

type Props = {
  card: Pick<CardData, "linkUrl" | "linkTitle" | "linkDesc" | "linkImage">;
  variant?: "inline" | "hero";
};

export function StreamLinkPreview({ card, variant = "inline" }: Props) {
  if (!card.linkUrl) return null;

  const host = getHost(card.linkUrl);
  const hasPreview = Boolean(card.linkTitle || card.linkDesc || card.linkImage);
  const fallbackTitle = getFallbackTitle(card.linkUrl);

  return (
    <a
      className={`stream-link-preview stream-link-preview--${variant}${
        hasPreview ? "" : " is-plain"
      }`}
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
        {!card.linkTitle && !card.linkDesc && <strong>{fallbackTitle}</strong>}
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

function getFallbackTitle(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "canva.com" && url.pathname.startsWith("/assignment/access")) {
      return "Canva 활동";
    }
    if (host === "canva.com" || host === "canva.link") {
      return "Canva에서 열기";
    }
    return "링크 열기";
  } catch {
    return "링크 열기";
  }
}
