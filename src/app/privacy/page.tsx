import Link from "next/link";

export const metadata = {
  title: "개인정보처리방침 · Aura-board",
};

export default function PrivacyPage() {
  return (
    <main className="docs-page">
      <article className="docs-article">
        <Link href="/dashboard" className="docs-back">← 홈으로</Link>
        <h1 className="docs-title">개인정보처리방침</h1>
        <p className="docs-subtitle">최종 수정일: 2026년 7월 13일 | 시행일: 2026년 7월 13일</p>

        <section className="docs-section">
          <h2 className="docs-h2">1. 개인정보 처리자</h2>
          <ul className="docs-list">
            <li><strong>성명</strong>: 심보승</li>
            <li><strong>이메일</strong>: <a href="mailto:mallagaenge@gmail.com" className="docs-link">mallagaenge@gmail.com</a></li>
          </ul>
        </section>

        <section className="docs-section">
          <h2 className="docs-h2">2. 수집하는 개인정보 항목 및 방법</h2>
          <h3 className="docs-h3">2.1 회원(교사·학부모) 정보</h3>
          <ul className="docs-list">
            <li>
              <strong>계정 정보:</strong> 이메일, 이름, 프로필 사진, 로그인 공급자(Google/Kakao 등)
            </li>
            <li>
              <strong>세션 정보:</strong> 세션 토큰, 인증 토큰(로그인 시 자동 생성)
            </li>
            <li>
              <strong>기술 정보:</strong> 접속 IP(일부 해시), User-Agent, 요청 로그
            </li>
          </ul>

          <h3 className="docs-h3">2.2 학급 및 학생 정보</h3>
          <p className="docs-p">교사가 학급을 생성하며 입력하는 정보입니다.</p>
          <ul className="docs-list">
            <li>학급명, 학생 이름, 출석번호</li>
            <li>QR 로그인 토큰, 텍스트 입장 코드</li>
            <li>학부모 초대 코드 및 학부모-자녀 연결 정보</li>
            <li>보드/카드/댓글/좋아요 등 서비스 이용 콘텐츠</li>
          </ul>

          <h3 className="docs-h3">2.3 Canva 연동 정보</h3>
          <ul className="docs-list">
            <li><strong>계정 연결 정보:</strong> Canva 사용자 식별자, 팀 식별자, OAuth 접근·갱신 토큰 및 만료 시각</li>
            <li><strong>기능 처리 정보:</strong> 교사가 선택한 Canva 디자인·폴더의 식별자, 제목, 썸네일 URL 등 기능 수행에 필요한 메타데이터</li>
            <li><strong>내보내기 정보:</strong> PDF 생성에 필요한 디자인 파일은 요청 처리 중 서버 메모리에서 처리하며 Aura-board 데이터베이스에 저장하지 않음</li>
          </ul>

          <h3 className="docs-h3">2.4 모바일 앱에서 수집하는 정보</h3>
          <ul className="docs-list">
            <li><strong>칩/사진:</strong> 카드에 이미지를 첨부할 때 사용자 동의 하에 칩라/갤러리 접근</li>
            <li><strong>문서:</strong> 파일 첨부 시 사용자가 직접 선택한 문서</li>
            <li><strong>푸시 알림 토큰:</strong> 알림 수신을 위해 기기마다 발급되는 자생 토큰</li>
          </ul>
        </section>

        <section className="docs-section">
          <h2 className="docs-h2">3. 개인정보의 이용 목적</h2>
          <ul className="docs-list">
            <li>회원 식별·인증 및 서비스 제공</li>
            <li>학급 운영(보드, 카드, 학생 관리, 학부모 공유)</li>
            <li>컨텐츠 생성 및 공유(영상 임베드 등)</li>
            <li>푸시 알림 발송</li>
            <li>공지사항, 고객 문의 응대</li>
            <li>보안, 부정 이용 방지, 서비스 품질 개선</li>
          </ul>
        </section>

        <section className="docs-section">
          <h2 className="docs-h2">4. 개인정보의 보유 및 파기</h2>
          <p className="docs-p">
            회원 탈퇴 시 수집된 개인정보는 지체 없이 파기합니다. 다만, 관련 법령에 따라 일정 기간 보관이 필요한 경우 해당 기간 동안 보관합니다.
            학생 정보는 교사가 학급을 삭제하거나 탈퇴 시 함께 삭제됩니다.
            교사가 Canva 연결을 해제하면 Canva OAuth 접근·갱신 토큰, Canva 사용자·팀 식별자와 임시 인증 정보는 즉시 폐기하며, Canva에 토큰 폐기를 요청합니다.
            전자적 파일은 복구 불가능한 방법으로 삭제하며, 종이 문서는 분쇄 또는 소각합니다.
          </p>
        </section>

        <section className="docs-section">
          <h2 className="docs-h2">5. 개인정보의 제3자 제공</h2>
          <p className="docs-p">
            원칙적으로 이용자의 동의 없이 제3자에게 개인정보를 제공하지 않습니다. 다만, 이용자가 사전에 동의한 경우 또는 법령에 따른 수사·조사 목적 등 법적 의무가 있는 경우에는 예외로 합니다.
          </p>
        </section>

        <section className="docs-section">
          <h2 className="docs-h2">6. 개인정보 처리 위탁</h2>
          <p className="docs-p">서비스 제공을 위해 다음과 같이 개인정보 처리를 위탁합니다.</p>
          <ul className="docs-list">
            <li><strong>Supabase, Inc.</strong> - 데이터베이스, 인증, 파일 스토리지, 실시간 동기화</li>
            <li><strong>Vercel, Inc.</strong> - 웹/모바일 앱 호스팅, 서버리스 함수 실행</li>
            <li><strong>Resend, Inc.</strong> - 이메일 발송</li>
            <li><strong>Google, Kakao</strong> - OAuth 소셜 로그인</li>
            <li><strong>Canva Pty Ltd</strong> - 교사 Canva OAuth 계정 연결, 디자인·폴더 연동 및 내보내기</li>
            <li><strong>YouTube(Google)</strong> - 영상 임베드 콘텐츠 제공</li>
            <li><strong>Upstash</strong> - 서비스 부하 제어 및 캐싱</li>
          </ul>
          <p className="docs-p">각 수탁업체는 개별 개인정보처리방침에 따라 정보를 처리합니다.</p>
        </section>

        <section className="docs-section">
          <h2 className="docs-h2">7. 이용자의 권리와 행사 방법</h2>
          <p className="docs-p">이용자는 언제든지 다음 권리를 행사할 수 있습니다.</p>
          <ul className="docs-list">
            <li>개인정보 열람·정정·삭제 요청</li>
            <li>개인정보 처리 정지 요청</li>
            <li>동의 철회 및 탈퇴</li>
          </ul>
          <p className="docs-p">
            권리 행사는 서비스 내 설정 또는 이메일(<a href="mailto:mallagaenge@gmail.com" className="docs-link">mallagaenge@gmail.com</a>)로 요청할 수 있으며, 요청 시 지체 없이 조치하겠습니다.
          </p>
        </section>

        <section className="docs-section">
          <h2 className="docs-h2">8. 아동 개인정보 보호</h2>
          <p className="docs-p">
            본 서비스는 학생(만 14세 미만 포함) 정보를 교사의 학급 운영 목적으로 처리합니다. 해당 정보는 교사의 관리 하에 수집·이용되며, 학부모 공유 기능은 교사가 발급한 초대 코드를 통해서만 가능합니다.
          </p>
        </section>

        <section className="docs-section">
          <h2 className="docs-h2">9. 쿠키 및 자동 수집 장치</h2>
          <p className="docs-p">
            서비스는 로그인 세션 유지 및 사용자 환경 개선을 위해 쿠키와 유사한 기술을 사용할 수 있습니다. 이용자는 브라우저 설정을 통해 쿠키 저장을 거부할 수 있으나, 이 경우 일부 서비스 이용이 제한될 수 있습니다.
          </p>
        </section>

        <section className="docs-section">
          <h2 className="docs-h2">10. 개인정보의 안전성 확보 조치</h2>
          <ul className="docs-list">
            <li>Canva OAuth 토큰 등 중요 인증정보의 암호화 저장</li>
            <li>데이터베이스 보호 및 안전한 접근 통로(SSL/TLS) 사용</li>
            <li>접근 권한 최소화 및 감사 로그 기록</li>
            <li>정기적인 보안 점검 및 업데이트</li>
          </ul>
        </section>

        <section className="docs-section">
          <h2 className="docs-h2">11. 개인정보 보호책임자</h2>
          <ul className="docs-list">
            <li><strong>성명</strong>: 심보승</li>
            <li><strong>이메일</strong>: <a href="mailto:mallagaenge@gmail.com" className="docs-link">mallagaenge@gmail.com</a></li>
          </ul>
        </section>

        <section className="docs-section">
          <h2 className="docs-h2">12. 정책 변경</h2>
          <p className="docs-p">
            본 방침은 법령·서비스 변경에 따라 수정될 수 있으며, 변경 시 서비스 내 공지 또는 이메일로 고지합니다.
          </p>
        </section>

      </article>
    </main>
  );
}
