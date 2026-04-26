"use client";

// parent-redesign (2026-04-26): OAuth 진입 버튼 (Google + Kakao).
// 클릭 시 /api/parent/auth/{provider} 로 redirect. 환경변수 미설정 시
// 버튼 disabled + 안내. 매직링크는 별도 fallback 토글로 보조.

export function ParentAuthButtons() {
  return (
    <div className="parent-oauth-buttons">
      <a
        href="/api/parent/auth/google"
        className="parent-oauth-btn parent-oauth-btn-google"
        aria-label="Google로 로그인"
      >
        <span className="parent-oauth-btn-icon" aria-hidden>
          <GoogleGlyph />
        </span>
        <span>Google로 로그인</span>
      </a>
      <a
        href="/api/parent/auth/kakao"
        className="parent-oauth-btn parent-oauth-btn-kakao"
        aria-label="Kakao로 로그인"
      >
        <span className="parent-oauth-btn-icon" aria-hidden>
          <KakaoGlyph />
        </span>
        <span>Kakao로 로그인</span>
      </a>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="#4285F4"
        d="M21.6 12.227c0-.708-.064-1.39-.182-2.045H12v3.868h5.385a4.604 4.604 0 0 1-1.997 3.022v2.51h3.231c1.891-1.741 2.981-4.307 2.981-7.355z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.964-.895 6.619-2.418l-3.231-2.51c-.895.6-2.04.954-3.388.954-2.605 0-4.81-1.76-5.598-4.123H3.064v2.59A9.996 9.996 0 0 0 12 22z"
      />
      <path
        fill="#FBBC05"
        d="M6.402 13.903a6.005 6.005 0 0 1 0-3.806v-2.59H3.064a9.998 9.998 0 0 0 0 8.987l3.338-2.59z"
      />
      <path
        fill="#EA4335"
        d="M12 5.977c1.469 0 2.786.505 3.823 1.495l2.866-2.866C16.96 2.99 14.696 2 12 2A9.998 9.998 0 0 0 3.064 7.508l3.338 2.59C7.19 7.736 9.395 5.977 12 5.977z"
      />
    </svg>
  );
}

function KakaoGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="#000"
        d="M12 4C7.03 4 3 7.21 3 11.16c0 2.6 1.74 4.87 4.34 6.13l-.83 3.06c-.07.27.22.49.46.34l3.62-2.4c.46.05.93.07 1.41.07 4.97 0 9-3.21 9-7.2C21 7.21 16.97 4 12 4z"
      />
    </svg>
  );
}
