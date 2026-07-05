import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { getCurrentUser } from "@/lib/auth";
import { BillingClient } from "./BillingClient";

const ADMIN_EMAIL = "mallagaenge@gmail.com";

export const metadata = {
  title: "결제·구독 · Aura-board",
};

export default async function BillingPage() {
  const user = await getCurrentUser().catch(() => null);

  return (
    <>
      {user && <TopNav showAdmin={user.email.toLowerCase() === ADMIN_EMAIL} />}
      <main className="docs-page">
      <article className="docs-article">
        <Link href="/dashboard" className="docs-back">← 대시보드로</Link>
        <h1 className="docs-title">결제·구독</h1>
        <p className="docs-subtitle">
          Aura-board Pro는 모둠 학습·코딩 교실 등 부가 기능을 풀 해제합니다.
          카드 정보는 Toss Payments에 직접 보관되며 Aura-board 서버에는 빌링키만
          저장됩니다.
        </p>
        <BillingClient />

        <section className="docs-section">
          <h2 className="docs-h2">안내</h2>
          <ul className="docs-list">
            <li>결제 금액은 세금 포함입니다. 세금계산서는 이메일로 요청해 주세요.</li>
            <li>언제든 구독 취소가 가능하며, 현재 결제 기간 종료 시점까지 Pro 기능이 유지됩니다.</li>
            <li>
              관리자용 Toss 키·웹훅 설정 방법은{" "}
              <Link href="/docs/billing-setup" className="docs-link">
                결제 연동 안내 문서
              </Link>
              에서 확인할 수 있어요.
            </li>
          </ul>
        </section>
      </article>
      </main>
    </>
  );
}
