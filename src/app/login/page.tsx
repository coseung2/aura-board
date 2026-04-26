"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { RoleIcon } from "@/components/login/RoleIcon";

// parent-redesign (2026-04-26): 학부모 카드의 단일 "초대 코드 입력" 버튼 →
// Google + Kakao OAuth 두 버튼. 학부모는 OAuth 로그인 후 자녀 코드 입력 단계.

type SimpleRole = {
  id: "teacher" | "student";
  title: string;
  desc: string;
  cta: string;
  onSelect: () => void;
};

export default function LoginPage() {
  const router = useRouter();

  const simpleRoles: SimpleRole[] = [
    {
      id: "teacher",
      title: "교사",
      desc: "학급과 보드를 관리해요",
      cta: "Google로 로그인",
      onSelect: () => signIn("google", { redirectTo: "/" }),
    },
    {
      id: "student",
      title: "학생",
      desc: "QR/코드로 학급에 참여해요",
      cta: "학생 로그인",
      onSelect: () => router.push("/student/login"),
    },
  ];

  return (
    <main className="login-page">
      <div className="login-hub-card">
        <div className="login-logo">
          <Logo size={56} />
        </div>
        <h1 className="login-title">Aura-board</h1>
        <p className="login-subtitle">어떤 역할로 들어가시나요?</p>

        <div className="login-hub-grid">
          {simpleRoles.map((role) => (
            <button
              key={role.id}
              type="button"
              className="login-role-card"
              onClick={role.onSelect}
              aria-label={`${role.title}으로 계속`}
            >
              <div className="login-role-icon">
                <RoleIcon role={role.id} />
              </div>
              <div className="login-role-title">{role.title}</div>
              <div className="login-role-desc">{role.desc}</div>
              <div className="login-role-cta">{role.cta}</div>
            </button>
          ))}

          {/* 학부모 카드 — OAuth 2 진입점 (Google + Kakao). 클릭은 카드
              자체가 아닌 내부 두 OAuth 링크. */}
          <div
            className="login-role-card login-role-card-parent"
            role="group"
            aria-label="학부모 로그인"
          >
            <div className="login-role-icon">
              <RoleIcon role="parent" />
            </div>
            <div className="login-role-title">학부모</div>
            <div className="login-role-desc">자녀 작품을 확인해요</div>
            <div className="login-role-parent-actions">
              <a
                href="/api/parent/auth/google"
                className="login-role-oauth login-role-oauth-google"
                aria-label="Google로 학부모 로그인"
              >
                <GoogleGlyph />
                <span>Google</span>
              </a>
              <a
                href="/api/parent/auth/kakao"
                className="login-role-oauth login-role-oauth-kakao"
                aria-label="Kakao로 학부모 로그인"
              >
                <KakaoGlyph />
                <span>Kakao</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
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
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        fill="#000"
        d="M12 4C7.03 4 3 7.21 3 11.16c0 2.6 1.74 4.87 4.34 6.13l-.83 3.06c-.07.27.22.49.46.34l3.62-2.4c.46.05.93.07 1.41.07 4.97 0 9-3.21 9-7.2C21 7.21 16.97 4 12 4z"
      />
    </svg>
  );
}
