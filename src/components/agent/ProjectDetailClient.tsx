"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { buildStudioSrcDoc } from "@/lib/vibe-arcade/sandbox-renderer";

type Review = {
  id: string;
  reviewerName: string;
  rating: number;
  content: string;
  createdAt: string;
};

type Project = {
  id: string;
  boardId: string;
  title: string;
  description: string;
  htmlContent: string;
  cssContent: string;
  jsContent: string;
  tags: string[];
  authorName: string;
  playCount: number;
  reviewCount: number;
  ratingAvg: number | null;
  createdAt: string;
};

type Props = {
  boardHref: string;
  project: Project;
  initialReviews: Review[];
  currentStudent: { id: string; name: string } | null;
  canReview: boolean;
};

function Stars({ value }: { value: number }) {
  return (
    <span className="project-detail-stars" aria-label={`${value}점`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <span key={index} className={index < value ? "is-filled" : ""}>★</span>
      ))}
    </span>
  );
}

export function ProjectDetailClient({
  boardHref,
  project,
  initialReviews,
  currentStudent,
  canReview,
}: Props) {
  const [reviews, setReviews] = useState(initialReviews);
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const srcDoc = useMemo(
    () =>
      buildStudioSrcDoc({
        htmlContent: project.htmlContent,
        cssContent: project.cssContent,
        jsContent: project.jsContent,
      }),
    [project.htmlContent, project.cssContent, project.jsContent]
  );

  const averageRating = reviews.length
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : project.ratingAvg;
  const averageText =
    averageRating == null ? "아직 평점 없음" : `${averageRating.toFixed(1)} / 5`;

  async function refreshReviews() {
    const res = await fetch(`/api/projects/${project.id}/reviews`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setReviews(data.reviews ?? []);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentStudent) {
      setError("후기를 작성하려면 학생으로 입장해야 해요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: currentStudent.id,
          rating,
          content: content.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "already_reviewed") {
          throw new Error("이미 이 프로젝트에 후기를 남겼어요.");
        }
        if (data.error === "self_review_forbidden") {
          throw new Error("내 프로젝트에는 후기를 남길 수 없어요.");
        }
        throw new Error("후기 저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
      }
      setContent("");
      setRating(5);
      setSuccess("후기가 등록되었어요!");
      await refreshReviews();
    } catch (err) {
      setError(err instanceof Error ? err.message : "후기 저장 중 오류가 발생했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="project-detail-page">
      <nav className="agent-breadcrumb project-detail-breadcrumb" aria-label="breadcrumb">
        <Link href={boardHref}>갤러리</Link>
        <span className="agent-breadcrumb-sep">&gt;</span>
        <span>{project.title}</span>
      </nav>

      <section className="project-detail-hero">
        <div className="project-detail-hero-copy">
          <p className="project-detail-eyebrow">Steam 스타일 게임 상세</p>
          <h1>{project.title}</h1>
          <p className="project-detail-description">
            {project.description || "아직 게임 설명이 없어요."}
          </p>
          <div className="project-detail-meta">
            <span>제작자: <strong>{project.authorName}</strong></span>
            <span>플레이 {project.playCount.toLocaleString()}회</span>
            <span>{averageText}</span>
          </div>
          <div className="project-detail-tags" aria-label="태그">
            {project.tags.length > 0 ? (
              project.tags.map((tag) => <span key={tag}>#{tag}</span>)
            ) : (
              <span>#기타</span>
            )}
          </div>
        </div>
        <Link href={`${boardHref}/play/${project.id}`} className="project-detail-play-button">
          ▶ 플레이
        </Link>
      </section>

      <section className="project-detail-main">
        <article className="project-detail-preview-card">
          <div className="project-detail-card-head">
            <h2>게임 미리보기</h2>
            <span>작은 썸네일로 먼저 확인해보세요</span>
          </div>
          <div className="project-detail-preview-frame">
            <iframe
              srcDoc={srcDoc}
              sandbox="allow-scripts"
              title={`${project.title} 미리보기`}
              className="project-detail-preview-iframe"
            />
          </div>
        </article>

        <aside className="project-detail-review-summary">
          <h2>후기 요약</h2>
          <div className="project-detail-score">
            <strong>{averageRating == null ? "-" : averageRating.toFixed(1)}</strong>
            <Stars value={Math.round(averageRating ?? 0)} />
          </div>
          <p>{reviews.length}개의 피드백이 등록되었어요.</p>
        </aside>
      </section>

      <section className="project-detail-reviews">
        <div className="project-detail-section-title">
          <h2>후기 / 피드백</h2>
          <span>{reviews.length}개</span>
        </div>

        <form className="project-detail-review-form" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="project-rating">별점</label>
            <select
              id="project-rating"
              value={rating}
              onChange={(event) => setRating(Number(event.target.value))}
              disabled={!canReview || submitting}
            >
              {[5, 4, 3, 2, 1].map((value) => (
                <option key={value} value={value}>{value}점</option>
              ))}
            </select>
          </div>
          <div className="project-detail-review-comment">
            <label htmlFor="project-review-content">댓글</label>
            <textarea
              id="project-review-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={
                canReview
                  ? "친구의 게임을 해보고 좋았던 점과 개선 아이디어를 남겨주세요."
                  : "후기를 작성할 수 없는 프로젝트예요."
              }
              maxLength={500}
              disabled={!canReview || submitting}
            />
          </div>
          <button type="submit" className="ds-btn-primary" disabled={!canReview || submitting || !content.trim()}>
            {submitting ? "저장 중..." : "후기 등록"}
          </button>
          {error && <p className="project-detail-form-error">{error}</p>}
          {success && <p className="project-detail-form-success">{success}</p>}
        </form>

        <div className="project-detail-review-list">
          {reviews.length === 0 ? (
            <p className="project-detail-empty">아직 후기가 없어요. 첫 피드백을 남겨보세요!</p>
          ) : (
            reviews.map((review) => (
              <article key={review.id} className="project-detail-review-card">
                <div className="project-detail-review-head">
                  <strong>{review.reviewerName}</strong>
                  <Stars value={review.rating} />
                </div>
                <p>{review.content || "별점만 남긴 후기예요."}</p>
                <time dateTime={review.createdAt}>
                  {new Date(review.createdAt).toLocaleDateString("ko-KR", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </time>
              </article>
            ))
          )}
        </div>
      </section>

      <Link href={boardHref} className="project-detail-back-link">
        ← 갤러리로 돌아가기
      </Link>
    </div>
  );
}
