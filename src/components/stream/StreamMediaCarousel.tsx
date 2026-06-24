"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { isYouTubeLink } from "@/lib/card-content-policy";
import { extractVideoId } from "@/lib/youtube";
import type { CardData } from "../DraggableCard";

type MediaItem = {
  id: string;
  kind: "image" | "video" | "youtube";
  url: string;
  previewUrl?: string | null;
  alt: string;
};

type Props = {
  card: CardData;
};

export function StreamMediaCarousel({ card }: Props) {
  const items = useMemo(() => buildMediaItems(card), [card]);
  const [index, setIndex] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (index >= items.length) setIndex(0);
  }, [index, items.length]);

  if (items.length === 0) return null;

  function go(nextIndex: number) {
    const bounded = (nextIndex + items.length) % items.length;
    setIndex(bounded);
    const target = stripRef.current?.children.item(bounded);
    target?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  return (
    <div className="stream-media" data-count={items.length}>
      <div className="stream-media-strip" ref={stripRef} onScroll={syncIndexFromScroll}>
        {items.map((item) => (
          <figure className="stream-media-slide" key={item.id}>
            {item.kind === "image" ? (
              <img src={item.url} alt={item.alt} loading="lazy" decoding="async" />
            ) : item.kind === "youtube" ? (
              <iframe
                src={item.url}
                title={item.alt}
                loading="lazy"
                onClick={(event) => event.stopPropagation()}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : (
              <video
                src={item.url}
                poster={item.previewUrl ?? undefined}
                controls
                preload="metadata"
                playsInline
                onClick={(event) => event.stopPropagation()}
              />
            )}
          </figure>
        ))}
      </div>
      {items.length > 1 && (
        <>
          <button
            type="button"
            className="stream-media-nav stream-media-prev"
            onClick={(event) => {
              event.stopPropagation();
              go(index - 1);
            }}
            aria-label="이전 미디어"
          >
            ‹
          </button>
          <button
            type="button"
            className="stream-media-nav stream-media-next"
            onClick={(event) => {
              event.stopPropagation();
              go(index + 1);
            }}
            aria-label="다음 미디어"
          >
            ›
          </button>
          <div className="stream-media-indicators" aria-label={`${index + 1}/${items.length}`}>
            {items.map((item, i) => (
              <button
                key={item.id}
                type="button"
                className={i === index ? "is-active" : ""}
                aria-label={`${i + 1}번째 미디어 보기`}
                onClick={(event) => {
                  event.stopPropagation();
                  go(i);
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );

  function syncIndexFromScroll() {
    const strip = stripRef.current;
    if (!strip) return;
    const width = strip.clientWidth || 1;
    const nextIndex = Math.round(strip.scrollLeft / width);
    if (nextIndex !== index && nextIndex >= 0 && nextIndex < items.length) {
      setIndex(nextIndex);
    }
  }
}

function buildMediaItems(card: CardData): MediaItem[] {
  const linkedYouTubeId = card.linkUrl ? extractVideoId(card.linkUrl) : null;
  if (linkedYouTubeId) {
    return [
      {
        id: `${card.id}-youtube`,
        kind: "youtube",
        url: `https://www.youtube.com/embed/${linkedYouTubeId}`,
        previewUrl: card.linkImage,
        alt: card.linkTitle ?? card.title ?? "YouTube",
      },
    ];
  }

  const fromAttachments = (card.attachments ?? [])
    .filter((item) => item.kind === "image" || item.kind === "video")
    .map((item) => ({
      id: item.id,
      kind: item.kind as "image" | "video",
      url: item.url,
      previewUrl: item.previewUrl,
      alt: item.fileName ?? card.title,
    }));

  const legacy: MediaItem[] = [];
  if (!fromAttachments.length && card.imageUrl) {
    legacy.push({
      id: `${card.id}-image`,
      kind: "image",
      url: card.imageUrl,
      previewUrl: card.thumbUrl,
      alt: card.title,
    });
  }
  if (!fromAttachments.length && card.videoUrl && !isLinkVideo(card)) {
    legacy.push({
      id: `${card.id}-video`,
      kind: "video",
      url: card.videoUrl,
      previewUrl: card.thumbUrl,
      alt: card.title,
    });
  }

  return fromAttachments.length ? fromAttachments : legacy;
}

function isLinkVideo(card: CardData): boolean {
  return Boolean(card.linkUrl && card.videoUrl === card.linkUrl && isYouTubeLink(card.linkUrl));
}
