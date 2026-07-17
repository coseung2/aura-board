import { TopNav } from "@/components/TopNav";
import { AdminFeatureHeader } from "@/components/admin/AdminFeatureHeader";
import { AdminForbidden, requireAdminUser } from "@/lib/admin-auth";
import {
  CREATURE_LINES,
  CREATURE_RANDOM_EGG_WEIGHTS,
  CREATURE_SHOP_PRODUCTS,
  CREATURE_STAGES,
} from "@/lib/creatures/catalog";
import { db } from "@/lib/db";

const STAGE_LABELS: Record<string, string> = {
  egg: "알",
  hatchling: "부화",
  juvenile: "성장",
  evolved: "진화",
};

const AFFINITY_LABELS: Record<string, string> = {
  earth: "대지",
  river: "강물",
  sea: "바다",
  volcano: "화산",
  sky: "하늘",
  darkness: "밤그늘",
  light: "빛",
};

const RARITY_LABELS: Record<string, string> = {
  common: "일반",
  rare: "희귀",
  epic: "에픽",
};

export const metadata = {
  title: "펫 운영 · Aura-board",
};

type StageAggregate = {
  stage: string;
  _count: { _all: number };
};

type RecentCreature = {
  id: string;
  lineKey: string;
  stage: string;
  progressPoints: number;
  isActive: boolean;
  createdAt: Date;
  student: {
    name: string;
    number: number | null;
    classroom: {
      name: string;
      teacher: { name: string; email: string };
    };
  };
};

type ItemAggregate = {
  _count: { _all: number };
  _sum: { quantity: number | null };
};

export default async function AdminAuraPetPage() {
  const auth = await requireAdminUser("/admin/aura-pet");
  if (!auth.authorized) return <AdminForbidden />;

  const [totalCreatures, activeCreatures, evolvedCreatures, itemAggregate, stageGroups, creatures] =
    await Promise.all([
      db.studentCreature.count(),
      db.studentCreature.count({ where: { isActive: true } }),
      db.studentCreature.count({ where: { stage: "evolved" } }),
      db.studentCreatureItem.aggregate({
        where: { quantity: { gt: 0 } },
        _count: { _all: true },
        _sum: { quantity: true },
      }),
      db.studentCreature.groupBy({
        by: ["stage"],
        _count: { _all: true },
      }),
      db.studentCreature.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 50,
        select: {
          id: true,
          lineKey: true,
          stage: true,
          progressPoints: true,
          isActive: true,
          createdAt: true,
          student: {
            select: {
              name: true,
              number: true,
              classroom: {
                select: {
                  name: true,
                  teacher: { select: { name: true, email: true } },
                },
              },
            },
          },
        },
      }),
    ]);

  const typedItems = itemAggregate as ItemAggregate;
  const typedStageGroups = stageGroups as StageAggregate[];
  const typedCreatures = creatures as RecentCreature[];
  const totalRandomWeight = CREATURE_RANDOM_EGG_WEIGHTS.reduce(
    (sum, entry) => sum + entry.weight,
    0,
  );
  const stageCountByName = new Map(
    typedStageGroups.map((row) => [row.stage, row._count?._all ?? 0]),
  );

  return (
    <>
      <TopNav showAdmin />
      <main className="admin-page">
        <AdminFeatureHeader
          eyebrow="펫 운영"
          description="학생 펫의 실DB 보유 현황과 정적 카탈로그를 읽기 전용으로 확인합니다."
          active="creatures"
        />

        <section className="admin-metric-grid" aria-label="펫 보유 지표">
          <MetricCard label="전체 펫" value={`${totalCreatures}개`} />
          <MetricCard label="활성 펫" value={`${activeCreatures}개`} />
          <MetricCard label="진화 완료" value={`${evolvedCreatures}개`} />
          <MetricCard label="보유 아이템 종류" value={`${typedItems._count?._all ?? 0}종`} />
          <MetricCard label="보유 아이템 수량" value={`${typedItems._sum?.quantity ?? 0}개`} />
          <MetricCard label="카탈로그 종족" value={`${CREATURE_LINES.length}종`} />
        </section>

        <section className="admin-section" aria-label="성장 단계별 펫 분포">
          <div className="admin-section-head">
            <div>
              <h2>성장 단계 분포</h2>
              <p>StudentCreature.stage를 groupBy한 전체 보유 분포입니다.</p>
            </div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table" aria-label="성장 단계별 펫 분포 표">
              <thead>
                <tr>
                  <th scope="col">단계</th>
                  <th scope="col">보유 수</th>
                  <th scope="col">전체 대비</th>
                </tr>
              </thead>
              <tbody>
                {totalCreatures <= 0 ? (
                  <tr>
                    <td colSpan={3} className="admin-empty-cell">
                      보유 중인 펫이 없습니다.
                    </td>
                  </tr>
                ) : (
                  CREATURE_STAGES.map((stage) => {
                    const count = stageCountByName.get(stage) ?? 0;
                    return (
                      <tr key={stage}>
                        <td>{STAGE_LABELS[stage] ?? stage}</td>
                        <td>{count}개</td>
                        <td>{formatPercentage(count, totalCreatures)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-section" aria-label="펫 카탈로그">
          <div className="admin-section-head">
            <div>
              <h2>펫 카탈로그</h2>
              <p>
                전역 랜덤 weight 합계 {totalRandomWeight.toLocaleString("ko-KR")} · 각 종족의
                전용 알 가격과 4 stages/3 behaviors를 함께 표시합니다.
              </p>
            </div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table" aria-label="펫 카탈로그 표">
              <thead>
                <tr>
                  <th scope="col">종족</th>
                  <th scope="col">affinity</th>
                  <th scope="col">rarity</th>
                  <th scope="col">전역 랜덤 weight</th>
                  <th scope="col">종족 내부 weight</th>
                  <th scope="col">전용 알 가격</th>
                  <th scope="col">알</th>
                  <th scope="col">부화</th>
                  <th scope="col">성장</th>
                  <th scope="col">진화</th>
                </tr>
              </thead>
              <tbody>
                {isEmptyList(CREATURE_LINES) ? (
                  <tr>
                    <td colSpan={10} className="admin-empty-cell">
                      등록된 펫 카탈로그가 없습니다.
                    </td>
                  </tr>
                ) : (
                  CREATURE_LINES.map((line) => {
                    const randomWeight =
                      CREATURE_RANDOM_EGG_WEIGHTS.find((entry) => entry.lineKey === line.key)
                        ?.weight ?? line.randomEggWeight;
                    const affinityEgg = CREATURE_SHOP_PRODUCTS.find(
                      (product) =>
                        product.kind === "affinity-egg" &&
                        product.effect.type === "affinity-egg" &&
                        product.effect.affinity === line.affinity,
                    );
                    return (
                      <tr key={line.key}>
                        <td>
                          <div className="admin-user-cell">
                            <strong>{line.nameKo}</strong>
                            <code className="admin-code">{line.key}</code>
                          </div>
                        </td>
                        <td>{AFFINITY_LABELS[line.affinity] ?? line.affinity}</td>
                        <td>{RARITY_LABELS[line.rarity] ?? line.rarity}</td>
                        <td>
                          <div className="admin-user-cell">
                            <strong>{randomWeight}</strong>
                            <span>{formatPercentage(randomWeight, totalRandomWeight)}</span>
                          </div>
                        </td>
                        <td>{line.affinityEggWeight}</td>
                        <td>{affinityEgg ? formatCurrency(affinityEgg.price) : "-"}</td>
                        {CREATURE_STAGES.map((stage) => (
                          <td key={`${line.key}-${stage}`}>
                            {renderStageBehaviors(line.stages.find((entry) => entry.stage === stage), stage)}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-section" aria-label="최근 보유 펫">
          <div className="admin-section-head">
            <div>
              <h2>최근 보유 펫</h2>
              <p>StudentCreature 생성 시각 기준 최신 50개입니다.</p>
            </div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table" aria-label="최근 보유 펫 표">
              <thead>
                <tr>
                  <th scope="col">획득시각</th>
                  <th scope="col">학생</th>
                  <th scope="col">학급</th>
                  <th scope="col">교사</th>
                  <th scope="col">펫</th>
                  <th scope="col">단계</th>
                  <th scope="col">진행도</th>
                  <th scope="col">활성</th>
                </tr>
              </thead>
              <tbody>
                {typedCreatures.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="admin-empty-cell">
                      아직 보유 중인 펫이 없습니다.
                    </td>
                  </tr>
                ) : (
                  typedCreatures.map((creature) => {
                    const line = CREATURE_LINES.find((entry) => entry.key === creature.lineKey);
                    return (
                      <tr key={creature.id}>
                        <td>{formatDateTime(creature.createdAt)}</td>
                        <td>{formatStudent(creature.student)}</td>
                        <td>{creature.student.classroom.name}</td>
                        <td>
                          {creature.student.classroom.teacher.name.trim() ||
                            creature.student.classroom.teacher.email}
                        </td>
                        <td>
                          <div className="admin-user-cell">
                            <strong>{line?.nameKo ?? creature.lineKey}</strong>
                            <code className="admin-code">{creature.lineKey}</code>
                          </div>
                        </td>
                        <td>{STAGE_LABELS[creature.stage] ?? creature.stage}</td>
                        <td>{creature.progressPoints}점</td>
                        <td>
                          <span
                            className={
                              creature.isActive
                                ? "admin-status-pill"
                                : "admin-status-pill admin-status-pill-warning"
                            }
                          >
                            {creature.isActive ? "활성" : "보관"}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="admin-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function formatPercentage(value: number, total: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return "0.0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

function formatCurrency(value: number): string {
  return `${Math.max(0, value).toLocaleString("ko-KR")}원`;
}

function formatDateTime(date: Date): string {
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  });
}

function formatStudent(student: { name: string; number: number | null }): string {
  return `${student.name}${student.number === null ? "" : ` (${student.number}번)`}`;
}

function renderStageBehaviors(
  stageDefinition:
    | (typeof CREATURE_LINES)[number]["stages"][number]
    | undefined,
  stage: string,
) {
  if (!stageDefinition) return <span>-</span>;
  return (
    <div className="admin-user-cell">
      <strong>{STAGE_LABELS[stage] ?? stage}</strong>
      <span>{stageDefinition.behaviors.map((behavior) => behavior.labelKo).join(" · ")}</span>
    </div>
  );
}

function isEmptyList(value: readonly unknown[]): boolean {
  return value.length === 0;
}
