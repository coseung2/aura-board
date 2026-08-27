"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { signIn, signOut } from "next-auth/react";
import { Logo } from "@/components/Logo";
import { RoleIcon } from "@/components/login/RoleIcon";
import {
  safeStudentLoginReturnTarget,
  safeTeacherLoginReturnTarget,
} from "@/lib/login-return-target";

// Mobile-aligned login hub: content-tab role switch + single flat panel.
// teacher-login-button-unify (2026-04-26): teacher/parent share Google/Kakao
// OAuth button styling. Student stays code-based.

type LoginRole = "teacher" | "student" | "parent";
type PasswordRole = "teacher" | "parent";
type PasswordMode = "social" | "login" | "signup";
type WebOAuthProvider = "google" | "kakao" | "apple";
type AuthCapabilities = {
  teacher: Record<WebOAuthProvider, boolean>;
  parent: Record<WebOAuthProvider, boolean>;
};

const LOGIN_ROLES: Array<{
  id: LoginRole;
  title: string;
  desc: string;
}> = [
  {
    id: "teacher",
    title: "교사",
    desc: "학급과 보드를 관리해요",
  },
  {
    id: "student",
    title: "학생",
    desc: "QR/코드로 학급에 참여해요",
  },
  {
    id: "parent",
    title: "학부모",
    desc: "자녀 작품을 확인해요",
  },
];

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  invalid_link:
    "로그인 링크가 만료되었거나 올바르지 않아요. 다시 로그인해 주세요.",
  internal: "로그인 처리 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.",
  session_required: "다시 로그인하면 학부모 화면으로 이동할 수 있어요.",
  logged_out: "로그아웃되었습니다. 다시 로그인해 주세요.",
  withdrawn: "탈퇴가 완료되었습니다.",
  provider_disabled:
    "현재 OAuth 로그인이 비활성화되어 있어요. 관리자에게 문의해 주세요.",
  invalid_provider: "지원하지 않는 로그인 방식이에요.",
  invalid_state: "로그인 인증이 만료됐어요. 다시 시도해 주세요.",
  missing_params: "로그인 응답이 올바르지 않아요. 다시 시도해 주세요.",
  missing_pkce: "보안 정보가 누락됐어요. 다시 시도해 주세요.",
  token_exchange_failed:
    "로그인 토큰 교환에 실패했어요. 잠시 후 다시 시도해 주세요.",
  userinfo_failed: "사용자 정보 조회에 실패했어요. 잠시 후 다시 시도해 주세요.",
  upsert_failed: "계정 생성에 실패했어요. 잠시 후 다시 시도해 주세요.",
  apple_account_missing:
    "Apple 계정 정보를 확인하지 못했어요. 다시 로그인해 주세요.",
};

function loginErrorMessage(value: string | null): string {
  if (!value) return "";
  return (
    LOGIN_ERROR_MESSAGES[value] ?? `로그인 중 오류가 발생했어요 (${value})`
  );
}

function isLoginRole(value: string | null): value is LoginRole {
  return value === "teacher" || value === "student" || value === "parent";
}

export default function LoginPage() {
  const [studentCode, setStudentCode] = useState("");
  const [studentError, setStudentError] = useState("");
  const [studentBusy, setStudentBusy] = useState(false);
  const [showReviewerLogin, setShowReviewerLogin] = useState(false);
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [reviewerPassword, setReviewerPassword] = useState("");
  const [reviewerError, setReviewerError] = useState("");
  const [reviewerBusy, setReviewerBusy] = useState(false);
  const [activeRole, setActiveRole] = useState<LoginRole>("teacher");
  const [loginError, setLoginError] = useState("");
  const [passwordMode, setPasswordMode] = useState<PasswordMode>("social");
  const [passwordUsername, setPasswordUsername] = useState("");
  const [passwordValue, setPasswordValue] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [authCapabilities, setAuthCapabilities] =
    useState<AuthCapabilities | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const role = params.get("role");
    setActiveRole(isLoginRole(role) ? role : "teacher");
    setLoginError(loginErrorMessage(params.get("error")));
    setShowReviewerLogin(params.get("review") === "canva");
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/capabilities", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("provider_lookup_failed");
        return response.json() as Promise<AuthCapabilities>;
      })
      .then((capabilities) => {
        if (!cancelled) setAuthCapabilities(capabilities);
      })
      .catch(() => {
        if (!cancelled) {
          setAuthCapabilities({
            teacher: { google: false, kakao: false, apple: false },
            parent: { google: false, kakao: false, apple: false },
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleStudentLogin(e: FormEvent) {
    e.preventDefault();
    const trimmed = studentCode.trim().toUpperCase();
    if (trimmed.length !== 6) {
      setStudentError("6자리 코드를 입력해 주세요.");
      return;
    }

    setStudentBusy(true);
    setStudentError("");

    try {
      const res = await fetch("/api/student/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: trimmed }),
      });

      if (res.ok) {
        const data = (await res.json().catch(() => null)) as {
          redirect?: string;
        } | null;
        window.location.assign(safeStudentReturnTarget(data?.redirect));
        return;
      }

      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setStudentError(data?.error ?? "로그인에 실패했습니다");
    } catch {
      setStudentError("네트워크 오류가 발생했습니다");
    } finally {
      setStudentBusy(false);
    }
  }

  function safeStudentReturnTarget(fallback?: string): string {
    const params = new URLSearchParams(window.location.search);
    const raw =
      params.get("from") ??
      params.get("return") ??
      params.get("callbackUrl") ??
      fallback;
    return safeStudentLoginReturnTarget(raw, fallback);
  }

  function safeTeacherReturnTarget(): string {
    const params = new URLSearchParams(window.location.search);
    return safeTeacherLoginReturnTarget(
      params.get("from") ?? params.get("return") ?? params.get("callbackUrl"),
    );
  }

  async function startTeacherSignIn(provider: WebOAuthProvider) {
    await signOut({ redirect: false });
    await signIn(provider, { redirectTo: safeTeacherReturnTarget() });
  }

  async function startParentAppleSignIn() {
    window.location.assign("/api/parent/auth/apple/web");
  }

  async function handleReviewerLogin(e: FormEvent) {
    e.preventDefault();
    if (!reviewerEmail.trim() || reviewerPassword.length < 16) {
      setReviewerError("이메일과 비밀번호를 확인해주세요.");
      return;
    }

    setReviewerBusy(true);
    setReviewerError("");
    try {
      await signOut({ redirect: false });
      const redirectTo = safeTeacherReturnTarget();
      const result = await signIn("canva-reviewer", {
        email: reviewerEmail.trim(),
        password: reviewerPassword,
        redirect: false,
        redirectTo,
      });
      if (result?.error) {
        setReviewerError("이메일 또는 비밀번호가 올바르지 않습니다.");
        return;
      }
      window.location.assign(result?.url ?? redirectTo);
    } catch {
      setReviewerError("로그인에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setReviewerBusy(false);
    }
  }

  async function handlePasswordSubmit(e: FormEvent, role: PasswordRole) {
    e.preventDefault();
    const username = passwordUsername.trim().toLowerCase();
    if (username.length < 4 || passwordValue.length < 8) {
      setPasswordError("아이디는 4자 이상, 비밀번호는 8자 이상 입력해 주세요.");
      return;
    }
    if (passwordMode === "signup" && passwordValue !== passwordConfirm) {
      setPasswordError("비밀번호가 서로 일치하지 않습니다.");
      return;
    }

    setPasswordBusy(true);
    setPasswordError("");
    try {
      if (passwordMode === "signup") {
        const signup = await fetch("/api/account/credentials/signup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ role, username, password: passwordValue }),
        });
        if (!signup.ok) {
          const body = (await signup.json().catch(() => null)) as { error?: string } | null;
          if (signup.status === 409 || body?.error === "username_taken") {
            setPasswordError("이미 사용 중인 아이디입니다.");
          } else if (signup.status === 429) {
            setPasswordError("시도 횟수가 많습니다. 잠시 후 다시 시도해 주세요.");
          } else {
            setPasswordError("회원가입을 완료하지 못했습니다. 입력 내용을 확인해 주세요.");
          }
          return;
        }
      }

      if (role === "teacher") {
        await signOut({ redirect: false });
        const redirectTo = safeTeacherReturnTarget();
        const result = await signIn("password", {
          username,
          password: passwordValue,
          redirect: false,
          redirectTo,
        });
        if (result?.error) {
          setPasswordError("아이디 또는 비밀번호를 확인해 주세요.");
          return;
        }
        window.location.assign(result?.url ?? redirectTo);
        return;
      }

      const response = await fetch("/api/parent/credentials/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password: passwordValue }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        redirect?: string;
      } | null;
      if (!response.ok) {
        setPasswordError(
          response.status === 429
            ? "시도 횟수가 많습니다. 잠시 후 다시 시도해 주세요."
            : "아이디 또는 비밀번호를 확인해 주세요.",
        );
        return;
      }
      window.location.assign(body?.redirect ?? "/parent/feed");
    } catch {
      setPasswordError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPasswordBusy(false);
    }
  }

  function passwordForm(role: PasswordRole) {
    return (
      <form className="login-password-form" onSubmit={(event) => handlePasswordSubmit(event, role)}>
        <label className="login-password-label">
          <span>아이디</span>
          <input
            className="login-password-input"
            value={passwordUsername}
            onChange={(event) => {
              setPasswordUsername(event.target.value.toLowerCase());
              setPasswordError("");
            }}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={32}
            required
          />
        </label>
        <label className="login-password-label">
          <span>비밀번호</span>
          <input
            className="login-password-input"
            type="password"
            value={passwordValue}
            onChange={(event) => {
              setPasswordValue(event.target.value);
              setPasswordError("");
            }}
            autoComplete={passwordMode === "signup" ? "new-password" : "current-password"}
            minLength={8}
            maxLength={72}
            required
          />
        </label>
        {passwordMode === "signup" ? (
          <label className="login-password-label">
            <span>비밀번호 확인</span>
            <input
              className="login-password-input"
              type="password"
              value={passwordConfirm}
              onChange={(event) => {
                setPasswordConfirm(event.target.value);
                setPasswordError("");
              }}
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              required
            />
          </label>
        ) : null}
        {passwordError ? <p className="login-role-error" role="alert">{passwordError}</p> : null}
        <button type="submit" className="login-role-cta" disabled={passwordBusy}>
          {passwordBusy ? "처리 중..." : passwordMode === "signup" ? "회원가입" : "로그인"}
        </button>
        <div className="login-password-switches">
          <button
            type="button"
            className="login-inline-action"
            onClick={() => {
              setPasswordMode(passwordMode === "signup" ? "login" : "signup");
              setPasswordConfirm("");
              setPasswordError("");
            }}
          >
            {passwordMode === "signup" ? "이미 계정이 있나요? 로그인" : "계정이 없나요? 회원가입"}
          </button>
          <button
            type="button"
            className="login-inline-action"
            onClick={() => {
              setPasswordMode("social");
              setPasswordError("");
            }}
          >
            소셜 로그인으로 돌아가기
          </button>
        </div>
      </form>
    );
  }

  const activeRoleMeta =
    LOGIN_ROLES.find((role) => role.id === activeRole) ?? LOGIN_ROLES[0];

  return (
    <main className="login-page" data-login-role={activeRole}>
      <div className="login-hub-card">
        <div className="login-logo">
          <Logo size={56} />
        </div>
        <h1 className="login-title">Aura-board</h1>

        {loginError ? (
          <p
            id="login-error"
            className="login-page-error login-role-error"
            role="alert"
          >
            {loginError}
          </p>
        ) : null}

        <div
          className="login-role-tabs"
          role="tablist"
          aria-label="로그인 역할 선택"
        >
          {LOGIN_ROLES.map((role) => {
            const selected = activeRole === role.id;
            return (
              <button
                key={role.id}
                type="button"
                role="tab"
                id={`login-tab-${role.id}`}
                aria-selected={selected}
                aria-controls={`login-panel-${role.id}`}
                tabIndex={selected ? 0 : -1}
                className={`login-role-tab${selected ? " is-active" : ""}`}
                onClick={() => {
                  setActiveRole(role.id);
                  setPasswordMode("social");
                  setPasswordError("");
                }}
              >
                {role.title}
              </button>
            );
          })}
        </div>

        <section
          className="login-role-panel"
          role="tabpanel"
          id={`login-panel-${activeRole}`}
          aria-labelledby={`login-tab-${activeRole}`}
        >
          <div className="login-role-icon">
            <RoleIcon role={activeRole} />
          </div>
          <div className="login-role-title">{activeRoleMeta.title}</div>
          <div className="login-role-desc">{activeRoleMeta.desc}</div>

          {activeRole === "teacher" ? (
            <>
              {passwordMode === "social" ? <div className="login-role-oauth-actions">
                {authCapabilities?.teacher.google ? (
                  <button
                    type="button"
                    className="login-role-oauth login-role-oauth-google"
                    onClick={() => startTeacherSignIn("google")}
                    aria-label="Google로 교사 로그인"
                  >
                    <GoogleGlyph />
                    <span>Google로 로그인</span>
                  </button>
                ) : null}
                {authCapabilities?.teacher.kakao ? (
                  <button
                    type="button"
                    className="login-role-oauth login-role-oauth-kakao"
                    onClick={() => startTeacherSignIn("kakao")}
                    aria-label="Kakao로 교사 로그인"
                  >
                    <KakaoGlyph />
                    <span>Kakao로 로그인</span>
                  </button>
                ) : null}
                {authCapabilities?.teacher.apple ? (
                  <button
                    type="button"
                    className="login-role-oauth login-role-oauth-apple"
                    onClick={() => startTeacherSignIn("apple")}
                    aria-label="Apple로 교사 로그인"
                  >
                    <AppleGlyph />
                    <span>Apple로 로그인</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  className="login-inline-action"
                  onClick={() => {
                    setPasswordMode("login");
                    setPasswordError("");
                  }}
                >
                  아이디로 로그인
                </button>
              </div> : passwordForm("teacher")}
              {showReviewerLogin ? (
                <>
                  <div className="login-reviewer-separator" role="separator">
                    Canva review
                  </div>
                  <form
                    className="login-reviewer-form"
                    onSubmit={handleReviewerLogin}
                  >
                    <label className="login-reviewer-label">
                      <span>Email</span>
                      <input
                        className="login-reviewer-input"
                        type="email"
                        value={reviewerEmail}
                        onChange={(e) => {
                          setReviewerEmail(e.target.value);
                          setReviewerError("");
                        }}
                        autoComplete="username"
                        maxLength={254}
                        required
                      />
                    </label>
                    <label className="login-reviewer-label">
                      <span>Password</span>
                      <input
                        className="login-reviewer-input"
                        type="password"
                        value={reviewerPassword}
                        onChange={(e) => {
                          setReviewerPassword(e.target.value);
                          setReviewerError("");
                        }}
                        autoComplete="current-password"
                        minLength={16}
                        maxLength={256}
                        required
                      />
                    </label>
                    {reviewerError ? (
                      <p className="login-role-error" role="alert">
                        {reviewerError}
                      </p>
                    ) : null}
                    <button
                      type="submit"
                      className="login-role-cta"
                      disabled={reviewerBusy}
                    >
                      {reviewerBusy ? "Signing in…" : "Reviewer sign in"}
                    </button>
                  </form>
                </>
              ) : null}
            </>
          ) : null}

          {activeRole === "student" ? (
            <form className="login-role-student-form" onSubmit={handleStudentLogin}>
              <input
                className="login-role-code-input"
                value={studentCode}
                onChange={(e) => {
                  setStudentCode(e.target.value.toUpperCase());
                  setStudentError("");
                }}
                placeholder="코드 입력"
                maxLength={6}
                autoComplete="off"
                spellCheck={false}
                aria-label="학생 로그인 코드"
              />
              {studentError ? (
                <p className="login-role-error" role="alert">
                  {studentError}
                </p>
              ) : null}
              <button
                type="submit"
                className="login-role-cta"
                disabled={studentBusy || studentCode.trim().length === 0}
              >
                {studentBusy ? "확인 중..." : "학생 로그인"}
              </button>
            </form>
          ) : null}

          {activeRole === "parent" ? (
            passwordMode === "social" ? <div className="login-role-oauth-actions">
              {authCapabilities?.parent.google ? (
                <a
                  href="/api/parent/auth/google"
                  className="login-role-oauth login-role-oauth-google"
                  aria-label="Google로 학부모 로그인"
                >
                  <GoogleGlyph />
                  <span>Google로 로그인</span>
                </a>
              ) : null}
              {authCapabilities?.parent.kakao ? (
                <a
                  href="/api/parent/auth/kakao"
                  className="login-role-oauth login-role-oauth-kakao"
                  aria-label="Kakao로 학부모 로그인"
                >
                  <KakaoGlyph />
                  <span>Kakao로 로그인</span>
                </a>
              ) : null}
              {authCapabilities?.parent.apple ? (
                <button
                  type="button"
                  className="login-role-oauth login-role-oauth-apple"
                  onClick={startParentAppleSignIn}
                  aria-label="Apple로 학부모 로그인"
                >
                  <AppleGlyph />
                  <span>Apple로 로그인</span>
                </button>
              ) : null}
              <button
                type="button"
                className="login-inline-action"
                onClick={() => {
                  setPasswordMode("login");
                  setPasswordError("");
                }}
              >
                아이디로 로그인
              </button>
            </div> : passwordForm("parent")
          ) : null}
        </section>

        <div className="login-legal">
          <p className="login-consent">
            로그인하면 아래 약관에 동의한 것으로 간주합니다.
          </p>
          <div className="login-legal-links">
            <Link href="/terms">이용약관</Link>
            <span aria-hidden="true" className="login-legal-divider" />
            <Link href="/privacy">개인정보처리방침</Link>
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

function AppleGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        fill="currentColor"
        d="M16.7 12.9c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9-.7 0-1.8-.9-3-.9-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.1 9.2.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3.1-.7 1.4 0 1.9.7 3.1.7 1.3 0 2.1-1.1 2.8-2.2.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.6-1-2.6-3.6ZM14.4 6.1c.6-.8 1.1-1.9 1-3.1-1 .1-2.2.7-2.9 1.5-.6.7-1.1 1.8-1 2.9 1.1.1 2.2-.5 2.9-1.3Z"
      />
    </svg>
  );
}
