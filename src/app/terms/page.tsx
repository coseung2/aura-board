import Link from "next/link";

export const metadata = {
  title: "이용약관 · Aura-board",
};

export default function TermsPage() {
  return (
    <main className="docs-page">
      <article className="docs-article">
        <Link href="/dashboard" className="docs-back">← 홈으로</Link>
        <h1 className="docs-title">이용약관</h1>
        <p className="docs-subtitle">최종 업데이트: 2026-07-13</p>

        <section className="docs-section">
          <h2 className="docs-h2">1. 서비스 개요</h2>
          <p className="docs-p">
            Aura-board(이하 &ldquo;서비스&rdquo;)는 교실에서 사용하는 실시간
            협업 보드 도구입니다. 교사와 학생은 보드에 카드를 만들어 글·이미지·
            링크·Canva 디자인 등을 공유할 수 있습니다.
          </p>
        </section>

        <section className="docs-section">
          <h2 className="docs-h2">2. 계정 및 이용자</h2>
          <p className="docs-p">
            본 서비스는 초·중등 교사와 해당 학급 학생, 그리고 학부모를 대상으로
            합니다. 계정은 이메일 또는 OAuth 로그인을 통해 생성되며, 이용자는
            자신의 로그인 정보 관리 책임을 집니다.
          </p>
        </section>

        <section className="docs-section">
          <h2 className="docs-h2">3. Canva 앱 연동</h2>
          <p className="docs-p">
            교사가 Canva 계정을 연결하면 자신이 접근할 수 있는 Canva
            디자인을 확인해 디자인별 원본 PDF로 각각 내보내거나 보드 섹션
            이름의 Canva 폴더로 정리할 수 있습니다. Canva Connect 연동은
            인증된 교사 계정에만 제공되며, 학생은 Canva 계정을 연결하거나
            Canva Connect 연동에 직접 접근할 수 없습니다. 게시된 Canva 디자인
            카드에는 공개 미리보기 URL과 썸네일 이미지가 저장될 수 있습니다.
            교사는 서비스의 설정에서 Canva 계정 연결을 해제할 수 있으며,
            해제 시 Canva에 토큰 폐기를 요청한 뒤 저장된 Canva OAuth 인증정보와
            계정 연결 식별자를 삭제합니다. 별도의 Canva Content Publisher
            패널에서는 학생이 Aura-board 계정으로 로그인해 자신이 선택한 Canva
            디자인의 공개 링크와 썸네일을 보드 카드로 게시할 수 있습니다. 이
            게시 기능은 학생의 Canva Connect 계정을 연결하거나 Aura 카드
            디자인을 생성하지 않습니다.
          </p>
        </section>

        <section className="docs-section">
          <h2 className="docs-h2">4. 금지 행위</h2>
          <p className="docs-p">
            다음 행위는 금지됩니다:
          </p>
          <ul className="docs-list">
            <li>타인의 권리를 침해하거나 저작권·초상권을 위반하는 콘텐츠 업로드</li>
            <li>다른 사용자의 계정이나 토큰을 탈취·도용</li>
            <li>서비스 인프라에 대한 악의적 자동화 요청</li>
          </ul>
        </section>

        <section className="docs-section">
          <h2 className="docs-h2">5. 서비스 변경 및 중단</h2>
          <p className="docs-p">
            운영자는 사전 공지 없이 서비스의 기능을 변경하거나 일시적으로 중단할
            수 있습니다. 장기 중단이 예정된 경우 보드 데이터 내보내기 안내를
            제공합니다.
          </p>
        </section>

        <section className="docs-section">
          <h2 className="docs-h2">6. 면책</h2>
          <p className="docs-p">
            서비스는 &ldquo;있는 그대로&rdquo; 제공됩니다. 이용자가 업로드한
            콘텐츠로 인해 발생한 분쟁 및 피해에 대해 운영자는 법이 허용하는
            범위 내에서 책임을 지지 않습니다.
          </p>
        </section>

        <section className="docs-section">
          <h2 className="docs-h2">7. 문의</h2>
          <p className="docs-p">
            약관 관련 문의는 <Link href="/support" className="docs-link">지원 페이지</Link>
            를 통해 보내주세요.
          </p>
        </section>
      </article>
    </main>
  );
}
