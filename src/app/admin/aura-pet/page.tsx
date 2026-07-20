import { TopNav } from "@/components/TopNav";
import { AdminFeatureHeader } from "@/components/admin/AdminFeatureHeader";
import { SlimeCharacterSprite } from "@/components/creatures/SlimeCharacterSprite";
import { AdminForbidden, requireAdminUser } from "@/lib/admin-auth";
import { SLIME_CATALOG, SLIME_SHOP_CATALOG } from "@/lib/pets/catalog";
import type { SlimeShopItem } from "@/lib/pets/types";
import { db } from "@/lib/db";

export const metadata = {
  title: "펫 운영 · Aura-board",
};

export default async function AdminAuraPetPage() {
  const auth = await requireAdminUser("/admin/aura-pet");
  if (!auth.authorized) return <AdminForbidden />;

  const [totalPets, representativePets, studentsWithPets, itemAggregate, colorGroups, pets] =
    await Promise.all([
      db.studentSlime.count(),
      db.studentSlime.count({ where: { isRepresentative: true } }),
      db.studentSlime.groupBy({ by: ["studentId"] }),
      db.studentCreatureItem.aggregate({
        where: { quantity: { gt: 0 } },
        _count: { _all: true },
        _sum: { quantity: true },
      }),
      db.studentSlime.groupBy({ by: ["color"], _count: { _all: true } }),
      db.studentSlime.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 100,
        select: {
          id: true,
          color: true,
          isEquipped: true,
          isRepresentative: true,
          equippedItemKeys: true,
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

  const colorCounts = new Map(
    colorGroups.map((group) => [group.color, group._count._all]),
  );

  return (
    <>
      <TopNav showAdmin />
      <main className="admin-page">
        <AdminFeatureHeader
          eyebrow="펫 운영"
          description="현재 학생 펫의 보유·대표 지정·꾸미기 적용 현황을 확인합니다."
          active="creatures"
        />

        <section className="admin-metric-grid" aria-label="펫 운영 지표">
          <MetricCard label="보유 펫" value={`${totalPets}개`} />
          <MetricCard label="펫 보유 학생" value={`${studentsWithPets.length}명`} />
          <MetricCard label="대표 펫 지정" value={`${representativePets}명`} />
          <MetricCard label="미지정" value={`${Math.max(0, studentsWithPets.length - representativePets)}명`} />
          <MetricCard label="보유 꾸미기 종류" value={`${itemAggregate._count._all}종`} />
          <MetricCard label="보유 꾸미기 수량" value={`${itemAggregate._sum.quantity ?? 0}개`} />
        </section>

        <section className="admin-section" aria-label="펫 종류별 보유 현황">
          <div className="admin-section-head">
            <div>
              <h2>펫 종류별 보유 현황</h2>
            </div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table" aria-label="펫 종류별 보유 현황 표">
              <thead>
                <tr>
                  <th scope="col">펫</th>
                  <th scope="col">효과</th>
                  <th scope="col">가격</th>
                  <th scope="col">보유 수</th>
                </tr>
              </thead>
              <tbody>
                {SLIME_CATALOG.map((pet) => (
                  <tr key={pet.key}>
                    <td>{pet.nameKo}</td>
                    <td>{pet.effectKey} +{pet.baseBuffBps / 100}%</td>
                    <td>{pet.price.toLocaleString("ko-KR")}원</td>
                    <td>{colorCounts.get(pet.color) ?? 0}개</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-section" aria-label="꾸미기 카탈로그">
          <div className="admin-section-head">
            <div>
              <h2>꾸미기 카탈로그</h2>
            </div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table" aria-label="꾸미기 카탈로그 표">
              <thead>
                <tr>
                  <th scope="col">상품</th>
                  <th scope="col">분류</th>
                  <th scope="col">가격</th>
                </tr>
              </thead>
              <tbody>
                {SLIME_SHOP_CATALOG.map((item) => (
                  <tr key={item.key}>
                    <td>{item.labelKo}</td>
                    <td>{item.category}</td>
                    <td>{item.price.toLocaleString("ko-KR")}원</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-section" aria-label="학생별 보유 펫">
          <div className="admin-section-head">
            <div>
              <h2>학생별 보유 펫</h2>
            </div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table" aria-label="학생별 보유 펫 표">
              <thead>
                <tr>
                  <th scope="col">획득 시각</th>
                  <th scope="col">학생</th>
                  <th scope="col">학급</th>
                  <th scope="col">교사</th>
                  <th scope="col">펫</th>
                  <th scope="col">대표</th>
                  <th scope="col">버프 적용</th>
                  <th scope="col">꾸미기</th>
                </tr>
              </thead>
              <tbody>
                {pets.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="admin-empty-cell">보유 중인 펫이 없습니다.</td>
                  </tr>
                ) : (
                  pets.map((pet) => {
                    const definition = SLIME_CATALOG.find((entry) => entry.color === pet.color);
                    const items = pet.equippedItemKeys
                      .map((key) => SLIME_SHOP_CATALOG.find((item) => item.key === key))
                      .filter((item): item is SlimeShopItem => Boolean(item));
                    return (
                      <tr key={pet.id}>
                        <td>{formatDateTime(pet.createdAt)}</td>
                        <td>{formatStudent(pet.student)}</td>
                        <td>{pet.student.classroom.name}</td>
                        <td>{pet.student.classroom.teacher.name.trim() || pet.student.classroom.teacher.email}</td>
                        <td>
                          {definition ? (
                            <div className="admin-user-cell">
                              <div style={{ width: 64, height: 64 }}>
                                <SlimeCharacterSprite slime={definition} items={items} />
                              </div>
                              <strong>{definition.nameKo}</strong>
                            </div>
                          ) : pet.color}
                        </td>
                        <td>{pet.isRepresentative ? "대표" : "-"}</td>
                        <td>{pet.isEquipped ? "적용" : "해제"}</td>
                        <td>{items.length > 0 ? items.map((item) => item.labelKo).join(", ") : "없음"}</td>
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
  return <article className="admin-metric-card"><span>{label}</span><strong>{value}</strong></article>;
}

function formatDateTime(date: Date): string {
  return date.toLocaleString("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    hour12: false, timeZone: "Asia/Seoul",
  });
}

function formatStudent(student: { name: string; number: number | null }): string {
  return `${student.name}${student.number === null ? "" : ` (${student.number}번)`}`;
}
