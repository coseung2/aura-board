"use client";

import { useEffect, useState } from "react";
import type {
  PortfolioCardDTO,
} from "@/lib/portfolio-dto";
import { CardDetailModal } from "../cards/CardDetailModal";
import { PortfolioCardItem } from "./PortfolioCardItem";
import { portfolioCardToCardData } from "./portfolio-card-adapter";

type Props = {
  childId: string;
  childName: string;
};

type Payload = {
  child: { id: string; name: string; number: number | null; classroomId: string };
  ownCards: PortfolioCardDTO[];
};

export function ParentPortfolioView({ childId, childName }: Props) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openCard, setOpenCard] = useState<PortfolioCardDTO | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(
      `/api/parent/portfolio?childId=${encodeURIComponent(childId)}`,
      { cache: "no-store" }
    )
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(res.status === 403 ? "forbidden" : "load_failed");
          setData(null);
          return;
        }
        const body = (await res.json()) as Payload;
        if (!cancelled) setData(body);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [childId]);

  if (loading) {
    return (
      <div className="parent-portfolio is-loading" style={{ padding: 16 }}>
        <p>불러오는 중…</p>
      </div>
    );
  }
  if (error === "forbidden") {
    return (
      <div className="parent-portfolio is-error" style={{ padding: 16 }}>
        <p>🔒 자녀 정보를 볼 권한이 없어요.</p>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="parent-portfolio is-error" style={{ padding: 16 }}>
        <p>잠시 후 다시 시도해 주세요.</p>
      </div>
    );
  }

  const selectedCard = openCard
    ? data.ownCards.find((c) => c.id === openCard.id) ?? openCard
    : null;

  return (
    <div className="parent-portfolio">
      <header className="parent-portfolio-head">
        <h2>📚 {childName}의 작품 ({data.ownCards.length}개)</h2>
      </header>
      {data.ownCards.length === 0 ? (
        <div className="portfolio-empty">
          <p>📭 아직 자녀의 작품이 없어요.</p>
        </div>
      ) : (
        <div className="portfolio-grid">
          {data.ownCards.map((c) => (
            <PortfolioCardItem
              key={c.id}
              card={c}
              onOpen={setOpenCard}
            />
          ))}
        </div>
      )}

      <CardDetailModal
        card={selectedCard ? portfolioCardToCardData(selectedCard) : null}
        onClose={() => setOpenCard(null)}
        boardId={selectedCard?.sourceBoard.id}
      />
    </div>
  );
}
