import Link from "next/link";

export const metadata = {
  title: "Canva 앱 연결 안내 · Aura-board",
};

export default function CanvaSetupPage() {
  return (
    <main className="docs-page">
      <article className="docs-article">
        <Link href="/dashboard" className="docs-back">
          ← 대시보드로
        </Link>
        <h1 className="docs-title">Canva 앱 연결 안내</h1>
        <p className="docs-subtitle">
          Canva Content Publisher 앱으로 만든 작품을 Aura-board 보드에 바로
          게시할 수 있어요.
        </p>

        <section className="docs-section">
          <h2 className="docs-h2">1. 학생 — Aura 로그인</h2>
          <p className="docs-p">
            각 학생은 Canva 에디터에서 Aura-board 앱 패널을 열고 학생 코드로
            로그인합니다. 로그인 후에는 본인이 쓴 카드가 부모님께 자동으로
            연결돼요. 교사가 별도로 발급하는 토큰은 필요하지 않아요.
          </p>
          <p className="docs-p docs-note">
            로그인 세션은 Canva 에디터에서만 유효하며, 학생이 다른 학급
            보드에 작품을 올리려 해도 차단됩니다.
          </p>
        </section>

        <section className="docs-section">
          <h2 className="docs-h2">2. 게시</h2>
          <p className="docs-p">
            디자인을 완성한 뒤 Aura 앱 패널에서 보드와 섹션을 고르고
            &ldquo;게시&rdquo;를 누르면 해당 학급 보드에 카드가 올라갑니다.
            제목은 자동으로 디자인 이름이 들어갑니다.
          </p>
        </section>

        <section className="docs-section">
          <h2 className="docs-h2">3. 문제가 생기면</h2>
          <ul className="docs-list">
            <li>
              <strong>&ldquo;학생 로그인이 필요해요&rdquo;</strong>가 뜨면 Canva 앱 패널의
              로그인 버튼을 눌러 학생 세션을 갱신하세요.
            </li>
            <li>
              <strong>&ldquo;학급이 달라요&rdquo;</strong>는 학생의 학급과 보드 학급이
              다를 때 나옵니다. 교사 계정에서 보드 - 학급 연결을 확인하세요.
            </li>
          </ul>
        </section>
      </article>
    </main>
  );
}
