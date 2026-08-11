import Link from "next/link";
import type { ClassroomHomeSummary } from "@/lib/classroom-home-summary";

const numberFormatter = new Intl.NumberFormat("ko-KR");

type SummaryCard = {
  key: string;
  href: string;
  emoji: string;
  title: string;
  metric: string;
  note: string;
};

type Props = {
  classroomId: string;
  summary: ClassroomHomeSummary;
};

/**
 * Class-home feature grid: one summary card per child page under
 * /classroom/:id/* so the teacher sees every feature's current state and can
 * jump straight into it. Read-only; each page stays the owner of its own
 * management UI.
 */
export function ClassroomHomeFeatureGrid({ classroomId, summary }: Props) {
  const classroomHref = (key: string) => `/classroom/${classroomId}/${key}`;
  const students = summary.students.total;

  const groups: Array<{ title: string; cards: SummaryCard[] }> = [
    {
      title: "학급 관리",
      cards: [
        {
          key: "students",
          href: classroomHref("students"),
          emoji: "👥",
          title: "학생 명단",
          metric: `${students}명`,
          note: "명단 · QR · 학부모 현황",
        },
        {
          key: "groups",
          href: classroomHref("groups"),
          emoji: "🪑",
          title: "자리·모둠",
          metric: `모둠 ${summary.groups.groupCount}개`,
          note: `자리 배정 ${summary.groups.seatedCount}/${students}명`,
        },
        {
          key: "boards",
          href: classroomHref("boards"),
          emoji: "🔗",
          title: "보드 연결",
          metric: `${summary.boards.count}개`,
          note: "수업·놀이 보드 연결",
        },
        {
          key: "parent-access",
          href: classroomHref("parent-access"),
          emoji: "👪",
          title: "학부모 액세스",
          metric: `대기 ${summary.parents.pendingCount}건`,
          note: `연결된 학부모 ${summary.parents.activeCount}명`,
        },
      ],
    },
    {
      title: "학급 운영",
      cards: [
        {
          key: "roles",
          href: classroomHref("roles"),
          emoji: "🎖️",
          title: "1인1역",
          metric: `${summary.roles.assignedCount}/${students}명`,
          note: "역할 배정 현황",
        },
        {
          key: "morning",
          href: classroomHref("morning"),
          emoji: "🧹",
          title: "청소·당번",
          metric: `당번 ${summary.morning.dutyCount}명`,
          note: `오늘 지적 ${summary.morning.findingCount}건`,
        },
        {
          key: "assignments",
          href: classroomHref("assignments"),
          emoji: "📋",
          title: "과제 현황",
          metric: `미제출 ${summary.assignments.missingCount}건`,
          note: "보드·체크 과제",
        },
        {
          key: "check",
          href: classroomHref("check"),
          emoji: "✅",
          title: "제출 체크",
          metric: `진행 ${summary.checks.activeCount}개`,
          note: "활성 체크 목록",
        },
        {
          key: "bank",
          href: classroomHref("bank"),
          emoji: "🏦",
          title: "금융 관리",
          metric: `${numberFormatter.format(summary.bank.totalBalance)}${summary.bank.unitLabel}`,
          note: `계좌 ${summary.bank.accountCount}개 · 거래 ${numberFormatter.format(summary.bank.transactionCount)}건`,
        },
        {
          key: "pay",
          href: classroomHref("pay"),
          emoji: "📲",
          title: "QR결제",
          metric: `오늘 ${summary.pay.todayChargeCount}건`,
          note: "매점 QR 결제",
        },
        {
          key: "store",
          href: classroomHref("store"),
          emoji: "🏪",
          title: "매점",
          metric: `상품 ${summary.store.itemCount}개`,
          note: "매점 상품 관리",
        },
      ],
    },
    {
      title: "활동·기록",
      cards: [
        {
          key: "portfolio",
          href: classroomHref("portfolio"),
          emoji: "🖼️",
          title: "포트폴리오",
          metric: `${numberFormatter.format(summary.portfolio.itemCount)}개`,
          note: "학생 작품 모음",
        },
        {
          key: "reading",
          href: classroomHref("reading"),
          emoji: "📚",
          title: "독서",
          metric: `${summary.reading.logCount}건`,
          note: "독서 기록 · 평가",
        },
        {
          key: "walking",
          href: classroomHref("walking"),
          emoji: "🚶",
          title: "걷기 현황",
          metric: `오늘 ${numberFormatter.format(summary.walking.todaySteps)}걸음`,
          note: `연결 ${summary.walking.connectedCount}/${students}명`,
        },
        {
          key: "daily-banners",
          href: classroomHref("daily-banners"),
          emoji: "📣",
          title: "일일 배너",
          metric: `대기 ${summary.banners.pendingCount}건`,
          note: "학생 제안 승인",
        },
      ],
    },
  ];

  return (
    <nav className="classroom-home-summary" aria-label="학급 기능 요약">
      <h2 className="classroom-home-summary-heading">학급 기능</h2>
      {groups.map((group) => (
        <section
          key={group.cards[0].key}
          className="classroom-home-summary-group"
          aria-labelledby={`classroom-home-summary-group-${group.cards[0].key}`}
        >
          <h3
            id={`classroom-home-summary-group-${group.cards[0].key}`}
            className="classroom-home-summary-group-title"
          >
            {group.title}
          </h3>
          <ul className="classroom-home-summary-grid">
            {group.cards.map((card) => (
              <li key={card.key} className="classroom-home-summary-item">
                <Link
                  href={card.href}
                  className="classroom-home-summary-card"
                  aria-label={`${card.title} · ${card.metric}`}
                >
                  <span className="classroom-home-summary-emoji" aria-hidden="true">
                    {card.emoji}
                  </span>
                  <span className="classroom-home-summary-body">
                    <strong className="classroom-home-summary-title">{card.title}</strong>
                    <span className="classroom-home-summary-metric">{card.metric}</span>
                    <span className="classroom-home-summary-note">{card.note}</span>
                  </span>
                  <span className="classroom-home-summary-arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}
