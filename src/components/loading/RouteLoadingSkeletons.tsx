import type { ReactNode } from "react";

function Block({ className = "" }: { className?: string }) {
  return <div className={`route-skeleton-block ${className}`.trim()} />;
}

function RouteSkeleton({ label, children }: { label: string; children: ReactNode }) {
  return (
    <main
      className="route-skeleton-shell"
      role="progressbar"
      aria-label={label}
      aria-busy="true"
    >
      <div className="route-skeleton-content" aria-hidden="true">
        {children}
      </div>
    </main>
  );
}

export function StudentHomeRouteSkeleton() {
  return (
    <RouteSkeleton label="학생 홈을 준비하는 중">
      <section className="route-skeleton-hero">
        <div className="route-skeleton-copy">
          <Block className="is-line is-medium" />
          <Block className="is-line is-wide" />
          <Block className="is-line is-short" />
        </div>
        <Block className="is-illustration" />
      </section>
      <section className="route-skeleton-metrics">
        <Block className="is-metric" />
        <Block className="is-metric" />
        <Block className="is-metric" />
      </section>
      <Block className="is-heading" />
      <section className="route-skeleton-list">
        <Block className="is-row" />
        <Block className="is-row" />
        <Block className="is-row" />
      </section>
    </RouteSkeleton>
  );
}

export function BoardListRouteSkeleton() {
  return (
    <RouteSkeleton label="보드 목록을 준비하는 중">
      <div className="route-skeleton-tabs">
        <Block className="is-chip" />
        <Block className="is-chip" />
        <Block className="is-chip" />
      </div>
      <section className="route-skeleton-grid">
        {Array.from({ length: 6 }, (_, index) => (
          <Block key={index} className="is-board-card" />
        ))}
      </section>
    </RouteSkeleton>
  );
}

export function FeedRouteSkeleton() {
  return (
    <RouteSkeleton label="게시물을 준비하는 중">
      <section className="route-skeleton-feed">
        {Array.from({ length: 2 }, (_, index) => (
          <article key={index} className="route-skeleton-post">
            <div className="route-skeleton-post-head">
              <Block className="is-avatar" />
              <div className="route-skeleton-copy">
                <Block className="is-line is-medium" />
                <Block className="is-line is-short" />
              </div>
            </div>
            <Block className="is-post-media" />
            <div className="route-skeleton-post-copy">
              <Block className="is-line is-wide" />
              <Block className="is-line is-medium" />
            </div>
          </article>
        ))}
      </section>
    </RouteSkeleton>
  );
}

export function ActivityRouteSkeleton({ label }: { label: string }) {
  return (
    <RouteSkeleton label={label}>
      <section className="route-skeleton-activity-summary">
        <Block className="is-summary-main" />
        <Block className="is-summary-side" />
      </section>
      <section className="route-skeleton-list">
        <Block className="is-row is-tall" />
        <Block className="is-row is-tall" />
        <Block className="is-row is-tall" />
      </section>
    </RouteSkeleton>
  );
}

export function ParentHomeRouteSkeleton() {
  return (
    <RouteSkeleton label="학부모 홈을 준비하는 중">
      <section className="route-skeleton-child-card">
        <Block className="is-avatar is-large" />
        <div className="route-skeleton-copy">
          <Block className="is-line is-medium" />
          <Block className="is-line is-short" />
        </div>
      </section>
      <Block className="is-heading" />
      <section className="route-skeleton-grid is-parent-grid">
        {Array.from({ length: 6 }, (_, index) => (
          <Block key={index} className="is-parent-tile" />
        ))}
      </section>
    </RouteSkeleton>
  );
}

export function BoardDetailRouteSkeleton() {
  return (
    <RouteSkeleton label="보드 내용을 준비하는 중">
      <section className="route-skeleton-board-head">
        <Block className="is-line is-medium" />
        <Block className="is-line is-short" />
      </section>
      <section className="route-skeleton-board-canvas">
        <Block className="is-board-note" />
        <Block className="is-board-note is-offset" />
        <Block className="is-board-note is-small" />
      </section>
    </RouteSkeleton>
  );
}
