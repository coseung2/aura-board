import Link from "next/link";

export const metadata = {
  title: "지원 · Aura-board",
};

export default function SupportPage() {
  return (
    <main className="docs-page">
      <article className="docs-article">
        <Link href="/landing" className="docs-back">← 홈으로</Link>
        <h1 className="docs-title">지원 안내</h1>
        <p className="docs-subtitle">
          Aura-board 사용 중 문제가 생기거나 기능 제안이 있으시면 아래
          경로로 알려주세요.
        </p>

        <section className="docs-section">
          <h2 className="docs-h2">이메일 문의</h2>
          <p className="docs-p">
            <a href="mailto:mallagaenge@gmail.com" className="docs-link">
              mallagaenge@gmail.com
            </a>
          </p>
          <p className="docs-p docs-note">
            문제 재현 단계와 화면 캡처를 함께 보내주시면 빠르게 확인할 수
            있어요. 평일 기준 24시간 내 1차 답변을 드립니다.
          </p>
        </section>

        <section className="docs-section">
          <h2 className="docs-h2">보안 문제 신고</h2>
          <p className="docs-p">
            계정, 개인정보 또는 연동 보안 문제가 의심되면 제목에
            &ldquo;보안 신고&rdquo;를 적어
            <a href="mailto:mallagaenge@gmail.com" className="docs-link">
              mallagaenge@gmail.com
            </a>
            으로 재현 단계와 영향을 보내주세요. 민감한 토큰이나 비밀번호는
            이메일 본문에 포함하지 마세요.
          </p>
        </section>

        <section className="docs-section">
          <h2 className="docs-h2">자주 묻는 질문</h2>
          <h3 className="docs-h3">Canva 앱에서 &ldquo;보드 목록을 불러오지 못했어요&rdquo; 에러가 나요</h3>
          <p className="docs-p">
            같은 브라우저에서 Aura-board 에 학생 계정으로 먼저 로그인한 뒤
            Canva 에디터를 새로고침하세요. Canva 앱은 학생 세션 쿠키를 통해
            학급 범위의 보드만 나열합니다.
          </p>

          <h3 className="docs-h3">카드 썸네일이 보이지 않아요</h3>
          <p className="docs-p">
            Canva 디자인의 공유 설정이 &ldquo;링크가 있는 누구나 볼 수 있음&rdquo;
            인지 확인해 주세요. 비공개 디자인은 공개 oEmbed 썸네일을 가져오지
            못합니다.
          </p>

        </section>

        <section className="docs-section">
          <h2 className="docs-h2">관련 문서</h2>
          <ul className="docs-list">
            <li>
              <Link href="/docs/canva-setup" className="docs-link">
                Canva 앱 연결 안내
              </Link>
            </li>
            <li>
              <Link href="/teacher/settings#llm" className="docs-link">
                생성형 AI 연결하기 (Claude · ChatGPT · Gemini)
              </Link>
            </li>
            <li>
              <Link href="/terms" className="docs-link">이용약관</Link>
            </li>
            <li>
              <Link href="/privacy" className="docs-link">개인정보처리방침</Link>
            </li>
          </ul>
        </section>
      </article>
    </main>
  );
}
