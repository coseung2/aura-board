"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type HiddenTarget = {
  targetKind: "card" | "comment";
  targetId: string;
  viaReport: boolean;
  createdAt: string;
};

type HiddenAuthor = {
  studentId: string;
  name: string;
  createdAt: string;
};

type HiddenContentResponse = {
  items: HiddenTarget[];
  authors: HiddenAuthor[];
};

export function HiddenContentManager() {
  const [data, setData] = useState<HiddenContentResponse | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "session">(
    "loading",
  );
  const [restoringKey, setRestoringKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const response = await fetch("/api/student/hidden-content", {
        cache: "no-store",
      });
      if (response.status === 401) {
        setState("session");
        return;
      }
      if (!response.ok) throw new Error("load_failed");
      setData((await response.json()) as HiddenContentResponse);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const restore = async (
    key: string,
    body:
      | { scope: "target"; targetKind: "card" | "comment"; targetId: string }
      | { scope: "author"; hiddenStudentId: string },
  ) => {
    if (restoringKey) return;
    setRestoringKey(key);
    try {
      const response = await fetch("/api/student/hidden-content", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 401) {
        setState("session");
        return;
      }
      if (!response.ok) throw new Error("restore_failed");
      // Do not trust a local filter as persistence proof. Reload the server list
      // after every restore and render only the confirmed response.
      await load();
    } catch {
      setState("error");
    } finally {
      setRestoringKey(null);
    }
  };

  if (state === "loading") {
    return (
      <div className="student-hidden-state" role="status">
        숨긴 콘텐츠를 불러오는 중...
      </div>
    );
  }

  if (state === "session") {
    return (
      <div className="student-hidden-state">
        <strong>로그인이 필요해요</strong>
        <p>학생 세션이 만료되었습니다.</p>
        <Link href="/login?from=/student/hidden-content">다시 로그인</Link>
      </div>
    );
  }

  if (state === "error" || !data) {
    return (
      <div className="student-hidden-state" role="alert">
        <strong>숨긴 콘텐츠를 불러오지 못했어요</strong>
        <button type="button" onClick={() => void load()}>
          다시 시도
        </button>
      </div>
    );
  }

  const cards = data.items.filter((item) => item.targetKind === "card");
  const comments = data.items.filter((item) => item.targetKind === "comment");
  const empty =
    cards.length === 0 && comments.length === 0 && data.authors.length === 0;

  if (empty) {
    return (
      <div className="student-hidden-state">
        <strong>숨긴 콘텐츠가 없어요</strong>
        <p>숨긴 카드, 댓글, 작성자가 여기에 표시됩니다.</p>
      </div>
    );
  }

  return (
    <div className="student-hidden-sections">
      <HiddenTargetSection
        title="카드"
        items={cards}
        restoringKey={restoringKey}
        onRestore={restore}
      />
      <HiddenTargetSection
        title="댓글"
        items={comments}
        restoringKey={restoringKey}
        onRestore={restore}
      />
      <section
        className="student-hidden-section"
        aria-labelledby="hidden-authors-title"
      >
        <div className="student-hidden-section-head">
          <h2 id="hidden-authors-title">작성자</h2>
          <span>{data.authors.length}</span>
        </div>
        {data.authors.length === 0 ? (
          <p className="student-hidden-section-empty">숨긴 작성자가 없어요.</p>
        ) : (
          <ul className="student-hidden-list">
            {data.authors.map((author) => {
              const key = `author:${author.studentId}`;
              return (
                <li key={key}>
                  <div>
                    <strong>{author.name}</strong>
                    <span>{formatHiddenDate(author.createdAt)}</span>
                  </div>
                  <button
                    type="button"
                    disabled={restoringKey !== null}
                    onClick={() =>
                      void restore(key, {
                        scope: "author",
                        hiddenStudentId: author.studentId,
                      })
                    }
                  >
                    {restoringKey === key ? "복원 중..." : "복원"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function HiddenTargetSection({
  title,
  items,
  restoringKey,
  onRestore,
}: {
  title: "카드" | "댓글";
  items: HiddenTarget[];
  restoringKey: string | null;
  onRestore: HiddenContentManagerRestore;
}) {
  const headingId = `hidden-${title === "카드" ? "cards" : "comments"}-title`;
  return (
    <section className="student-hidden-section" aria-labelledby={headingId}>
      <div className="student-hidden-section-head">
        <h2 id={headingId}>{title}</h2>
        <span>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="student-hidden-section-empty">숨긴 {title}가 없어요.</p>
      ) : (
        <ul className="student-hidden-list">
          {items.map((item) => {
            const key = `${item.targetKind}:${item.targetId}`;
            return (
              <li key={key}>
                <div>
                  <strong>
                    {title} #{shortId(item.targetId)}
                  </strong>
                  <span>
                    {item.viaReport ? "신고 후 숨김 · " : ""}
                    {formatHiddenDate(item.createdAt)}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={restoringKey !== null}
                  onClick={() =>
                    void onRestore(key, {
                      scope: "target",
                      targetKind: item.targetKind,
                      targetId: item.targetId,
                    })
                  }
                >
                  {restoringKey === key ? "복원 중..." : "복원"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

type HiddenContentManagerRestore = (
  key: string,
  body:
    | { scope: "target"; targetKind: "card" | "comment"; targetId: string }
    | { scope: "author"; hiddenStudentId: string },
) => Promise<void>;

function shortId(id: string) {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

function formatHiddenDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
