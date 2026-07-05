import Link from "next/link";
import { Logo } from "@/components/Logo";

const features = [
  {
    title: "학급 보드",
    body: "교사가 보드를 만들고 섹션, 활동, 자료, 학생 제출물을 한곳에서 정리합니다.",
  },
  {
    title: "학생 참여",
    body: "학생은 QR 코드나 참여 코드로 접속해 글, 이미지, 파일, Canva 링크를 제출합니다.",
  },
  {
    title: "학부모 공유",
    body: "승인된 학부모는 자녀의 작품과 활동 기록을 안전하게 확인할 수 있습니다.",
  },
];

export default function PublicHomePage() {
  return (
    <main className="public-home">
      <section className="public-hero" aria-labelledby="public-home-title">
        <div className="public-hero-bg" aria-hidden="true" />
        <nav className="public-nav" aria-label="홈페이지">
          <Link href="/landing" className="public-brand" aria-label="Aura-board 홈">
            <Logo size={34} withWordmark />
          </Link>
          <div className="public-nav-links">
            <Link href="/privacy">개인정보처리방침</Link>
            <Link href="/terms">이용약관</Link>
            <Link href="/support">지원</Link>
            <Link href="/login" className="public-nav-login">
              로그인
            </Link>
          </div>
        </nav>

        <div className="public-hero-copy">
          <p className="public-kicker">Classroom workspace</p>
          <h1 id="public-home-title">Aura-board</h1>
          <p className="public-hero-lead">
            Aura-board는 교사가 학급 보드를 만들고, 학생 제출물과 Canva 링크,
            이미지, 파일, 피드백을 한곳에서 관리하는 온라인 학급 활동 플랫폼입니다.
          </p>
          <div className="public-hero-actions">
            <Link href="/login" className="public-primary-action">
              Google로 시작하기
            </Link>
            <Link href="/support" className="public-secondary-action">
              문의하기
            </Link>
          </div>
        </div>
      </section>

      <section className="public-purpose" aria-labelledby="public-purpose-title">
        <div className="public-section-inner">
          <div className="public-section-head">
            <p className="public-kicker">Purpose</p>
            <h2 id="public-purpose-title">수업 자료와 학생 활동을 안전하게 모으기 위한 도구</h2>
          </div>
          <p className="public-purpose-text">
            교사는 Google 계정으로 로그인해 학급과 보드를 관리합니다. 학생은 교사가
            제공한 코드로 참여하고, 학부모는 승인된 연결을 통해 자녀의 활동을
            확인합니다. 서비스는 학급 운영, 과제 제출, 포트폴리오 확인, 알림 제공을
            위해 필요한 계정 및 활동 정보를 처리합니다.
          </p>
        </div>
      </section>

      <section className="public-features" aria-label="주요 기능">
        <div className="public-section-inner public-feature-grid">
          {features.map((feature) => (
            <article key={feature.title} className="public-feature">
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
