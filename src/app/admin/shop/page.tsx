import { TopNav } from "@/components/TopNav";
import { AdminFeatureHeader } from "@/components/admin/AdminFeatureHeader";
import { AdminForbidden, requireAdminUser } from "@/lib/admin-auth";
import {
  CREATURE_LINES,
  CREATURE_RANDOM_EGG_WEIGHTS,
  CREATURE_SHOP_PRODUCTS,
} from "@/lib/creatures/catalog";
import { db } from "@/lib/db";

const PURCHASE_TYPES = [
  "creature_egg_purchase",
  "creature_item_purchase",
] as const;

const PRODUCT_KIND_LABELS: Record<string, string> = {
  "random-egg": "랜덤 알",
  "affinity-egg": "전용 알",
  food: "먹이",
  "hatch-accelerator": "부화 촉진",
  "background-effect": "배경 효과",
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

export const metadata = {
  title: "상점 운영 · Aura-board",
};

type PurchaseType = (typeof PURCHASE_TYPES)[number];

type PurchaseRow = {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  note: string | null;
  createdAt: Date;
  account: {
    student: { name: string; number: number | null };
    classroom: {
      name: string;
      teacher: { name: string; email: string };
    };
  };
};

type PurchaseAggregate = {
  type: string;
  _count: { _all: number };
  _sum: { amount: number | null };
};

export default async function AdminShopPage() {
  const auth = await requireAdminUser("/admin/shop");
  if (!auth.authorized) return <AdminForbidden />;

  const [aggregates, purchases] = await Promise.all([
    db.transaction.groupBy({
      by: ["type"],
      where: { type: { in: [...PURCHASE_TYPES] } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    db.transaction.findMany({
      where: { type: { in: [...PURCHASE_TYPES] } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
      select: {
        id: true,
        type: true,
        amount: true,
        balanceAfter: true,
        note: true,
        createdAt: true,
        account: {
          select: {
            student: { select: { name: true, number: true } },
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

  const typedAggregates = aggregates as PurchaseAggregate[];
  const purchaseSummary = summarizePurchases(typedAggregates);
  const typedPurchases = purchases as PurchaseRow[];
  const randomWeightTotal = CREATURE_RANDOM_EGG_WEIGHTS.reduce(
    (sum, entry) => sum + entry.weight,
    0,
  );

  return (
    <>
      <TopNav showAdmin />
      <main className="admin-page">
        <AdminFeatureHeader
          eyebrow="펫 경제 운영"
          description="펫 상점의 고정 카탈로그와 실제 구매 거래를 읽기 전용으로 확인합니다."
          active="shop"
        />

        <section className="admin-metric-grid" aria-label="상점 구매 지표">
          <MetricCard label="전체 구매" value={`${purchaseSummary.total.count}건`} />
          <MetricCard label="전체 매출" value={formatCurrency(purchaseSummary.total.amount)} />
          <MetricCard label="알 구매" value={`${purchaseSummary.egg.count}건`} />
          <MetricCard label="알 매출" value={formatCurrency(purchaseSummary.egg.amount)} />
          <MetricCard label="소모품 구매" value={`${purchaseSummary.item.count}건`} />
          <MetricCard label="소모품 매출" value={formatCurrency(purchaseSummary.item.amount)} />
        </section>

        <section className="admin-section" aria-label="펫 상점 상품 카탈로그">
          <div className="admin-section-head">
            <div>
              <h2>상품 카탈로그</h2>
              <p>현재 서버 카탈로그에 등록된 상품, 가격과 적용 확률 풀입니다.</p>
            </div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table" aria-label="펫 상점 상품 카탈로그 표">
              <thead>
                <tr>
                  <th scope="col">상품</th>
                  <th scope="col">종류</th>
                  <th scope="col">가격</th>
                  <th scope="col">설명</th>
                  <th scope="col">확률 풀</th>
                  <th scope="col">상태</th>
                </tr>
              </thead>
              <tbody>
                {isEmptyList(CREATURE_SHOP_PRODUCTS) ? (
                  <tr>
                    <td colSpan={6} className="admin-empty-cell">
                      등록된 상점 상품이 없습니다.
                    </td>
                  </tr>
                ) : (
                  CREATURE_SHOP_PRODUCTS.map((product) => (
                    <tr key={product.key}>
                      <td>
                        <div className="admin-user-cell">
                          <strong>{product.labelKo}</strong>
                          <code className="admin-code">{product.key}</code>
                        </div>
                      </td>
                      <td>{PRODUCT_KIND_LABELS[product.kind] ?? product.kind}</td>
                      <td>{formatCurrency(product.price)}</td>
                      <td>{product.descriptionKo}</td>
                      <td>{formatProductPool(product)}</td>
                      <td>
                        <span
                          className={
                            product.visible
                              ? "admin-status-pill"
                              : "admin-status-pill admin-status-pill-warning"
                          }
                        >
                          {product.visible ? "판매 중" : "숨김"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-section" aria-label="알 출현 확률">
          <div className="admin-section-head">
            <div>
              <h2>알 출현 확률</h2>
              <p>
                전역 랜덤 가중치 합계 {randomWeightTotal.toLocaleString("ko-KR")} ·
                종족별 전용 알은 해당 affinity 풀 안에서 다시 추첨합니다.
              </p>
            </div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table" aria-label="랜덤 알과 전용 알 출현 확률 표">
              <thead>
                <tr>
                  <th scope="col">종족</th>
                  <th scope="col">affinity</th>
                  <th scope="col">랜덤 알 weight</th>
                  <th scope="col">랜덤 알 확률</th>
                  <th scope="col">전용 알 내부 weight</th>
                  <th scope="col">전용 알 내부 확률</th>
                </tr>
              </thead>
              <tbody>
                {isEmptyList(CREATURE_LINES) ? (
                  <tr>
                    <td colSpan={6} className="admin-empty-cell">
                      등록된 펫 출현 풀이 없습니다.
                    </td>
                  </tr>
                ) : (
                  CREATURE_LINES.map((line) => {
                    const randomWeight =
                      CREATURE_RANDOM_EGG_WEIGHTS.find((entry) => entry.lineKey === line.key)
                        ?.weight ?? line.randomEggWeight;
                    const affinityLines = CREATURE_LINES.filter(
                      (candidate) => candidate.affinity === line.affinity,
                    );
                    const affinityWeightTotal = affinityLines.reduce(
                      (sum, candidate) => sum + candidate.affinityEggWeight,
                      0,
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
                        <td>{randomWeight}</td>
                        <td>{formatProbability(randomWeight, randomWeightTotal)}</td>
                        <td>{line.affinityEggWeight}</td>
                        <td>{formatProbability(line.affinityEggWeight, affinityWeightTotal)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-section" aria-label="최근 펫 상점 구매">
          <div className="admin-section-head">
            <div>
              <h2>최근 구매</h2>
              <p>실제 Transaction 기준 최신 50건입니다. 잔액은 결제 직후 잔액입니다.</p>
            </div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table" aria-label="최근 펫 상점 구매 표">
              <thead>
                <tr>
                  <th scope="col">시간</th>
                  <th scope="col">학생</th>
                  <th scope="col">학급</th>
                  <th scope="col">교사</th>
                  <th scope="col">상품 · note</th>
                  <th scope="col">금액</th>
                  <th scope="col">잔액</th>
                </tr>
              </thead>
              <tbody>
                {typedPurchases.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="admin-empty-cell">
                      펫 상점 구매 내역이 없습니다.
                    </td>
                  </tr>
                ) : (
                  typedPurchases.map((purchase) => (
                    <tr key={purchase.id}>
                      <td>{formatDateTime(purchase.createdAt)}</td>
                      <td>
                        <div className="admin-user-cell">
                          <strong>{formatStudent(purchase.account.student)}</strong>
                          <span>{formatPurchaseType(purchase.type)}</span>
                        </div>
                      </td>
                      <td>{purchase.account.classroom.name}</td>
                      <td>
                        {purchase.account.classroom.teacher.name.trim() ||
                          purchase.account.classroom.teacher.email}
                      </td>
                      <td>
                        <div className="admin-user-cell">
                          <strong>{productLabelFromNote(purchase.note)}</strong>
                          <code className="admin-code">{purchase.note ?? "-"}</code>
                        </div>
                      </td>
                      <td>{formatCurrency(purchase.amount)}</td>
                      <td>{formatCurrency(purchase.balanceAfter)}</td>
                    </tr>
                  ))
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

function summarizePurchases(rows: PurchaseAggregate[]) {
  const summary = {
    total: { count: 0, amount: 0 },
    egg: { count: 0, amount: 0 },
    item: { count: 0, amount: 0 },
  };
  for (const row of rows) {
    const count = row._count?._all ?? 0;
    const amount = row._sum?.amount ?? 0;
    summary.total.count += count;
    summary.total.amount += amount;
    if (row.type === "creature_egg_purchase") {
      summary.egg.count += count;
      summary.egg.amount += amount;
    }
    if (row.type === "creature_item_purchase") {
      summary.item.count += count;
      summary.item.amount += amount;
    }
  }
  return summary;
}

function formatProductPool(product: (typeof CREATURE_SHOP_PRODUCTS)[number]) {
  if (product.kind === "random-egg") {
    return (
      <div className="admin-user-cell">
        <strong>전역 랜덤</strong>
        <span>{CREATURE_LINES.length}종 · 상세 확률 표 참조</span>
      </div>
    );
  }
  if (product.kind === "affinity-egg" && product.effect.type === "affinity-egg") {
    const count = CREATURE_LINES.filter(
      (line) => line.affinity === product.effect.affinity,
    ).length;
    return (
      <div className="admin-user-cell">
        <strong>{AFFINITY_LABELS[product.effect.affinity] ?? product.effect.affinity} 내부</strong>
        <span>{count}종 · 상세 확률 표 참조</span>
      </div>
    );
  }
  return "-";
}

function formatProbability(weight: number, total: number): string {
  if (!Number.isFinite(weight) || !Number.isFinite(total) || total <= 0) return "-";
  return `${((weight / total) * 100).toFixed(1)}%`;
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

function formatPurchaseType(type: string): string {
  return type === "creature_egg_purchase" ? "알 구매" : "소모품 구매";
}

function productLabelFromNote(note: string | null): string {
  if (!note) return "상품 정보 없음";
  const productKey =
    note.match(/^creature-egg-purchase:([^:]+)$/)?.[1] ??
    note.match(/^creature-item-purchase:([^:]+):\d+$/)?.[1];
  const product = productKey
    ? CREATURE_SHOP_PRODUCTS.find((candidate) => candidate.key === productKey)
    : undefined;
  return product?.labelKo ?? "알 수 없는 상품";
}

function isEmptyList(value: readonly unknown[]): boolean {
  return value.length === 0;
}
