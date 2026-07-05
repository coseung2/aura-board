import Link from "next/link";

export const metadata = {
  title: "생성형 AI 연결하기 · Aura-board",
};

// 교사가 본인이 쓰는 생성형 AI(제미나이/ChatGPT/Claude)의 API Key를
// Aura-board에 연결해 **코딩 교실**의 바이브 코딩 보드에서 쓰도록 안내.
// 실제 연결 폼·저장 로직은 후속(teacher API Key 암호화 저장소 예정) —
// 본 페이지는 "발급 방법"만 우선 안내. 2026-04-22.

export default function AiSetupPage() {
  return (
    <main className="docs-page">
      <article className="docs-article">
        <Link href="/dashboard" className="docs-back">
          ← 대시보드로
        </Link>
        <h1 className="docs-title">생성형 AI 연결하기</h1>
        <p className="docs-subtitle">
          교사가 보유한 AI API Key를 연결하면 <strong>코딩 교실</strong>의
          바이브 코딩 보드에서 학생들이 이 Key로 AI와 대화해 게임·퀴즈를
          만들게 됩니다. 학생 개인이 별도 가입할 필요 없이 교사 한 명의 쿼터로
          운영되는 구조입니다.
        </p>

        <section className="docs-section">
          <h2 className="docs-h2">연결 전에 알아두세요</h2>
          <ul className="docs-list">
            <li>
              <strong>API Key는 ChatGPT Plus / Claude Max / Gemini Advanced
              같은 웹 구독과 별개</strong>입니다. 각 사의 개발자 콘솔에서 따로
              발급받아야 하며 사용량당 과금이 붙습니다.
            </li>
            <li>
              Aura-board는 학급 풀(일일 150만 토큰) + 학생별 상한(일일 45K
              토큰)으로 쿼터를 나눠 한 학생이 혼자 쓰지 못하게 막습니다.
              설정에서 수치 조정 가능합니다.
            </li>
            <li>
              저장된 Key는 서버 DB에 암호화 보관되며, 학생 클라이언트에는
              절대 노출되지 않습니다 (서버 프록시 전용).
            </li>
          </ul>
        </section>

        <section className="docs-section">
          <h2 className="docs-h2">1. ✨ Claude (Anthropic) — 추천</h2>
          <p className="docs-p">
            코드 생성과 한국어 품질이 가장 안정적이에요. 코딩 교실의
            기본 모델(claude-sonnet)과 정합이 맞아 별도 프롬프트 튜닝이 필요
            없습니다.
          </p>
          <ol className="docs-list">
            <li>
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="docs-link"
              >
                console.anthropic.com
              </a>{" "}
              접속 → 구글/메일로 가입 → &ldquo;Billing&rdquo;에서 카드 등록 (월 최소
              $5 충전).
            </li>
            <li>
              좌측 메뉴 <strong>API Keys → Create Key</strong> →
              이름(예: &ldquo;aura-board&rdquo;)을 지정해 생성.
            </li>
            <li>
              <code className="docs-code">sk-ant-api03-...</code>로 시작하는
              문자열을 복사 (창을 닫으면 다시 볼 수 없으니 바로 Aura-board에
              붙여넣기).
            </li>
            <li>
              이 페이지 하단 &ldquo;Key 저장&rdquo; 폼에 붙여넣고
              &ldquo;Claude&rdquo;를 선택 → 저장.
            </li>
          </ol>
          <p className="docs-p docs-note">
            Claude Sonnet 기준 입력 $3 / 출력 $15 per 1M tokens. 학생 30명이
            주 1회 5K토큰씩 쓰면 한 달 대략 $3~5 수준.
          </p>
        </section>

        <section className="docs-section">
          <h2 className="docs-h2">2. 🧠 ChatGPT (OpenAI)</h2>
          <p className="docs-p">
            가장 보편적이고 진입이 쉽습니다. gpt-4o-mini로 저렴하게 운영
            가능하지만 긴 HTML 생성 품질은 Claude가 한 단계 위라는 점 참고.
          </p>
          <ol className="docs-list">
            <li>
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="docs-link"
              >
                platform.openai.com/api-keys
              </a>{" "}
              접속 → 계정 생성 or 로그인 → 결제 수단 등록 (최소 $5 선결제).
            </li>
            <li>
              <strong>Create new secret key</strong> 클릭 → 이름 지정 →
              <em>All permissions</em> 또는 Restricted(Write only)로 생성.
            </li>
            <li>
              <code className="docs-code">sk-proj-...</code>로 시작하는 키
              복사 — 이 역시 한 번만 보이니 바로 붙여넣기.
            </li>
            <li>
              하단 폼에 붙여넣고 &ldquo;ChatGPT&rdquo; 선택 → 저장.
            </li>
          </ol>
          <p className="docs-p docs-note">
            gpt-4o-mini는 입력 $0.15 / 출력 $0.6 per 1M tokens. Claude Sonnet
            대비 1/20 가격이지만 복잡한 HTML 게임은 실패율 약간 높음.
          </p>
        </section>

        <section className="docs-section">
          <h2 className="docs-h2">3. 💎 Gemini (Google AI Studio)</h2>
          <p className="docs-p">
            무료 티어가 있어 테스트·저학년 반에 적합합니다. 유료 전환 시에도
            OpenAI보다 저렴한 편.
          </p>
          <ol className="docs-list">
            <li>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="docs-link"
              >
                aistudio.google.com/app/apikey
              </a>{" "}
              접속 → Google 계정으로 로그인.
            </li>
            <li>
              <strong>Create API key</strong> → 새 프로젝트 or 기존 Google Cloud
              프로젝트 선택 → 생성.
            </li>
            <li>
              <code className="docs-code">AIza...</code>로 시작하는 키 복사.
              Google AI Studio에서는 키를 나중에 다시 조회할 수 있지만 가능한
              한 외부에 유출되지 않게 보관하세요.
            </li>
            <li>
              하단 폼에 붙여넣고 &ldquo;Gemini&rdquo; 선택 → 저장.
            </li>
          </ol>
          <p className="docs-p docs-note">
            gemini-2.5-flash 무료 티어는 분당 15 RPM, 일일 1500 RPD. 학급 30명
            수업에는 한계가 있어 중장기 운영은 유료 전환(월 $5부터) 권장.
          </p>
        </section>

        <section className="docs-section">
          <h2 className="docs-h2">어떤 걸 고르나</h2>
          <table className="docs-compare-table">
            <thead>
              <tr>
                <th>용도</th>
                <th>추천</th>
                <th>이유</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>고품질 게임·인터랙션 중심</td>
                <td><strong>Claude</strong></td>
                <td>코드·한국어 동시 품질 최상</td>
              </tr>
              <tr>
                <td>비용 최소화 대량 운영</td>
                <td><strong>ChatGPT</strong> (gpt-4o-mini)</td>
                <td>토큰 단가 1/20, 대량 수업에 유리</td>
              </tr>
              <tr>
                <td>초기 테스트·저학년</td>
                <td><strong>Gemini</strong> (무료 티어)</td>
                <td>결제 없이 시작 가능</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="docs-section">
          <h2 className="docs-h2">Key 저장</h2>
          <p className="docs-p">
            발급한 Key는 <strong>교사 설정</strong> 페이지에서 한 번 저장하면
            해당 계정의 모든 <strong>코딩 교실</strong>·
            <strong>코딩 갤러리</strong> 보드에 자동 적용됩니다. 보드별로
            다시 연결할 필요는 없습니다.
          </p>
          <Link href="/teacher/settings#llm" className="docs-cta-btn">
            교사 설정에서 Key 저장하기 →
          </Link>
          <p className="docs-p docs-note">
            Key 유출 시 해당 사 대시보드에서 즉시 <strong>Revoke / Delete</strong>
            처리 후 새 Key를 발급·교체하세요. 교사 설정에서 <strong>삭제</strong>
            또는 <strong>다시 저장</strong>을 누르면 기존 세션이 새 Key로
            전환됩니다.
          </p>
        </section>

        <section className="docs-section">
          <h2 className="docs-h2">문제가 생기면</h2>
          <ul className="docs-list">
            <li>
              <strong>&ldquo;오늘치 소진&rdquo;</strong> 모달이 학생에게 자주 뜨면 학급
              쿼터가 소진된 상태. 설정에서 일일 토큰 풀을 올리거나 각 학생의
              상한을 낮추세요.
            </li>
            <li>
              <strong>401 Unauthorized</strong>가 서버 로그에 보이면 Key가 만료·
              회전됐을 가능성. 각 사 콘솔에서 재발급 후 다시 저장.
            </li>
            <li>
              <strong>결제 실패</strong>로 Key가 비활성이면 AI 응답 없이 &ldquo;잠시
              문제가 있어요&rdquo; 메시지가 학생에게 노출됩니다. 결제 수단을 갱신한
              뒤 동일 Key를 다시 저장하면 복구됩니다.
            </li>
          </ul>
        </section>
      </article>
    </main>
  );
}
