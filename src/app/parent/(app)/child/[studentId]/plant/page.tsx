import { db } from "@/lib/db";
import { requireParentScopeForStudent } from "@/lib/parent-scope";

// Parent read-only plant journal page. Layout has already verified scope, so
// here we directly query by studentId. We defensively re-check via
// requireParentScopeForStudent too — the layout and the page both run on the
// server so the cost is minimal, and the redundancy protects against any
// future refactor that changes layout semantics.
//
// Rendering strategy: vertical timeline grouped by stage, oldest at top so
// the "growth story" reads naturally. Re-uses OptimizedImage for
// thumbnails (< 200KB budget enforced by component).

import { OptimizedImage } from "@/components/ui/OptimizedImage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ChildPlantPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  await requireParentScopeForStudent(
    new Request("https://internal.local/page"),
    studentId
  );

  const plants = await db.studentPlant.findMany({
    where: { studentId },
    include: {
      species: { include: { stages: { orderBy: { order: "asc" } } } },
      currentStage: true,
      observations: {
        orderBy: { observedAt: "asc" }, // oldest-first timeline
        include: { images: { orderBy: { order: "asc" } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (plants.length === 0) {
    return (
      <EmptyState message="자녀가 아직 식물관찰일지를 시작하지 않았습니다." />
    );
  }

  return (
    <div className="plant-parent-list">
      {plants.map((p) => {
        const stageMap = new Map(p.species.stages.map((s) => [s.id, s] as const));
        const totalStages = p.species.stages.length;
        const progress = totalStages > 0 ? (p.currentStage.order / totalStages) * 100 : 0;
        const daysSinceStart = Math.max(
          1,
          Math.floor((Date.now() - p.createdAt.getTime()) / (1000 * 60 * 60 * 24)) + 1
        );

        return (
          <section key={p.id} className="plant-parent-section">
            <header className="plant-parent-header">
              <span className="plant-parent-header-emoji">{p.species.emoji}</span>
              <h2>{p.nickname || p.species.nameKo}</h2>
              <div className="plant-parent-meta">
                현재 단계: {p.currentStage.nameKo} · 관찰 {p.observations.length}회
              </div>
            </header>

            <div className="plant-growth-summary">
              <div className="plant-growth-row">
                <span className="plant-growth-label">현재 단계 / 전체 단계</span>
                <span className="plant-growth-value">
                  {p.currentStage.order} / {totalStages}
                </span>
              </div>
              <div className="plant-growth-row">
                <span className="plant-growth-label">관찰 총</span>
                <span className="plant-growth-value">{p.observations.length}회</span>
              </div>
              <div className="plant-growth-row">
                <span className="plant-growth-label">시작한 지</span>
                <span className="plant-growth-value">{daysSinceStart}일</span>
              </div>
              <div className="plant-growth-bar-track" aria-hidden="true">
                <div className="plant-growth-bar-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>

            {p.observations.length === 0 ? (
              <p className="plant-parent-empty-note">
                아직 관찰 기록이 없습니다.
              </p>
            ) : (
              <ol className="plant-parent-timeline">
                {p.observations.map((o) => {
                  const stage = stageMap.get(o.stageId);
                  return (
                    <li key={o.id} className="plant-parent-entry">
                      <div className="plant-parent-entry-meta">
                        {new Date(o.observedAt).toLocaleString("ko-KR", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {stage ? ` · ${stage.nameKo}` : ""}
                      </div>
                      {o.memo ? (
                        <p className="plant-parent-entry-memo">{o.memo}</p>
                      ) : null}
                      {o.noPhotoReason ? (
                        <p className="plant-parent-entry-reason">
                          사진 없음: {o.noPhotoReason}
                        </p>
                      ) : null}
                      {o.images.length > 0 ? (
                        <div className="plant-parent-entry-images">
                          {o.images.map((img) => (
                            <div key={img.id} className="plant-parent-entry-image">
                              <OptimizedImage
                                src={img.thumbnailUrl ?? img.url}
                                alt={`관찰 사진 ${img.order + 1}`}
                                fit="cover"
                              />
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        );
      })}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="plant-parent-empty-state">
      {message}
    </div>
  );
}
