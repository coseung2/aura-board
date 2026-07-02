/**
 * /oauth/authorize - RFC 6749 Authorization Endpoint.
 *
 * Canva registers this URL in the app Developer Portal as "Authorization
 * server URL". Canva opens it in a popup with the standard OAuth query
 * params. We validate the client + redirect_uri + PKCE challenge, then:
 *
 *   - not logged in as a student → bounce to /login with a return
 *     URL that brings the user back here after auth,
 *   - logged in → render an on-device consent screen (this page) that the
 *     student submits to /api/oauth/consent, which issues a code and
 *     redirects back to Canva's redirect_uri.
 */
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { isAuthenticated } from "@/lib/auth";
import { auth as nextAuth } from "@/lib/auth-config";
import { pkceRequiredForClient, subjectKindForClient } from "@/lib/oauth-subject";

type SearchParams = Promise<{
  client_id?: string;
  redirect_uri?: string;
  response_type?: string;
  scope?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  // Short HMAC-signed nonce that carries a verified Canva user id so
  // /api/oauth/consent can create a CanvaAppLink row. The Canva app
  // obtains the nonce via POST /api/external/link-start before calling
  // requestAuthorization and includes it via queryParams.link_nonce.
  link_nonce?: string;
}>;

export const metadata = { title: "Aura-board 앱 권한 요청" };

type ErrorAction = {
  href: string;
  label: string;
  variant: "primary" | "secondary";
};

function renderError(
  title: string,
  detail: string,
  actions: ErrorAction[] = [],
) {
  return (
    <main className="oauth-page">
      <div className="oauth-card">
        <h1 className="oauth-title">⚠ 요청을 처리할 수 없어요</h1>
        <p className="oauth-subtitle">{title}</p>
        <pre className="oauth-error-detail">{detail}</pre>
        {actions.length > 0 && (
          <div className="oauth-actions">
            {actions.map((action) => (
              <a
                key={action.href}
                href={action.href}
                className={`oauth-btn oauth-btn-${action.variant}`}
              >
                {action.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const q = await searchParams;
  console.log("[oauth/authorize] incoming query keys:", Object.keys(q), {
    hasLinkNonce: Boolean(q.link_nonce),
    linkNonceLen: q.link_nonce?.length ?? 0,
  });

  const authorizeUrl = `/oauth/authorize?${new URLSearchParams(
    Object.entries(q).filter(([, v]) => v != null) as [string, string][],
  ).toString()}`;

  // [1] Response type must be "code".
  if (q.response_type !== "code") {
    return renderError(
      "response_type가 올바르지 않아요.",
      `response_type=${q.response_type ?? "(없음)"} - 'code'만 지원합니다.`,
    );
  }

  if (!q.client_id || !q.redirect_uri) {
    return renderError(
      "필수 파라미터가 누락됐어요.",
      `client_id=${q.client_id ?? "(없음)"}\nredirect_uri=${q.redirect_uri ?? "(없음)"}`,
    );
  }

  // [2] Client lookup.
  const client = await db.oAuthClient.findUnique({
    where: { id: q.client_id },
  });
  if (!client) {
    return renderError("등록되지 않은 앱이에요.", `client_id=${q.client_id}`, [
      {
        href: `/login?return=${encodeURIComponent("/my/wallet")}`,
        label: "다시 로그인",
        variant: "secondary",
      },
      {
        href: "/my/wallet",
        label: "카드 화면으로 돌아가기",
        variant: "primary",
      },
    ]);
  }

  const allowedRedirects = JSON.parse(client.redirectUris) as string[];
  if (!allowedRedirects.includes(q.redirect_uri)) {
    return renderError(
      "redirect_uri가 등록되지 않았어요.",
      `redirect_uri=${q.redirect_uri}\n허용된 값:\n${allowedRedirects.join("\n")}`,
    );
  }

  const subject = subjectKindForClient(client.id);
  const defaultScope = subject === "user" ? "external:read" : "cards:write";

  const allowedScopes = JSON.parse(client.scopes) as string[];
  const requested = (q.scope ?? defaultScope).trim();
  const requestedList = requested.split(/\s+/).filter(Boolean);
  const unknown = requestedList.filter((s) => !allowedScopes.includes(s));
  if (unknown.length > 0) {
    return renderError(
      "허용되지 않은 scope가 포함됐어요.",
      `허용: ${allowedScopes.join(", ")}\n요청: ${requestedList.join(", ")}`,
    );
  }

  // [3] PKCE enforcement.
  const pkceRequired = pkceRequiredForClient(client.id, client.pkceRequired);

  if (pkceRequired) {
    if (!q.code_challenge || q.code_challenge_method !== "S256") {
      return renderError(
        "PKCE(code_challenge_method=S256)가 필요해요.",
        `code_challenge=${q.code_challenge ?? "(없음)"}\nmethod=${q.code_challenge_method ?? "(없음)"}`,
      );
    }
  } else if (q.code_challenge && q.code_challenge_method !== "S256") {
    return renderError(
      "PKCE(code_challenge_method=S256)가 필요해요.",
      `code_challenge=${q.code_challenge}\nmethod=${q.code_challenge_method ?? "(없음)"}`,
    );
  }

  // [4] Subject session lookup. Teacher (user) clients use NextAuth Google
  // session; student clients use student cookie session. Mismatch = bounce
  // through the right login page with return URL.
  if (subject === "user") {
    if (!(await isAuthenticated())) {
      redirect(`/login?callbackUrl=${encodeURIComponent(authorizeUrl)}`);
    }
    const session = await nextAuth();
    const teacherUser = session?.user
      ? {
          id: session.user.id ?? "",
          name: session.user.name ?? "",
          email: session.user.email ?? "",
        }
      : null;
    if (!teacherUser?.id) {
      redirect(`/login?callbackUrl=${encodeURIComponent(authorizeUrl)}`);
    }

    return (
      <main className="oauth-page">
        <form action="/api/oauth/consent" method="POST" className="oauth-card">
          <input type="hidden" name="client_id" value={q.client_id} />
          <input type="hidden" name="redirect_uri" value={q.redirect_uri} />
          <input type="hidden" name="scope" value={requested} />
          <input type="hidden" name="state" value={q.state ?? ""} />
          <input
            type="hidden"
            name="code_challenge"
            value={q.code_challenge ?? ""}
          />
          <input
            type="hidden"
            name="code_challenge_method"
            value={q.code_challenge_method ?? "S256"}
          />

          <div className="oauth-header">
            <div className="oauth-app-icon" aria-hidden="true">
              ✨
            </div>
            <h1 className="oauth-title">
              {client.name}이 Aura-board 에 연결하려고 해요
            </h1>
          </div>

          <div className="oauth-identity">
            <div className="oauth-identity-label">내 계정 (교사)</div>
            <div className="oauth-identity-value">
              👤 {teacherUser?.name ?? ""}
              {teacherUser?.email && (
                <span className="oauth-identity-email">
                  {" "}
                  · {teacherUser.email}
                </span>
              )}
            </div>
          </div>

          <div className="oauth-scopes">
            <p className="oauth-scopes-head">앱이 할 수 있게 되는 것:</p>
            <ul className="oauth-scopes-list">
              {requestedList.includes("external:read") && (
                <li>
                  📖 회원님의 Aura-board 학급 평어·채점 결과를 읽기 (읽기 전용)
                </li>
              )}
            </ul>
            <p className="oauth-scopes-note">
              앱은 회원님의 비밀번호를 절대 볼 수 없고, 데이터를 수정·삭제하지
              못합니다. 교사 설정 페이지에서 언제든 연결을 끊을 수 있어요.
            </p>
          </div>

          <div className="oauth-actions">
            <button
              type="submit"
              name="decision"
              value="deny"
              className="oauth-btn oauth-btn-secondary"
            >
              거절
            </button>
            <button
              type="submit"
              name="decision"
              value="allow"
              className="oauth-btn oauth-btn-primary"
            >
              허용
            </button>
          </div>
        </form>
      </main>
    );
  }

  // Student subject branch (Canva pairing - unchanged).
  const student = await getCurrentStudent();
  if (!student) {
    redirect(`/login?return=${encodeURIComponent(authorizeUrl)}`);
  }

  // [5] Render consent UI. The student submits the form which POSTs to
  // /api/oauth/consent; that endpoint issues the code and 302-redirects to
  // redirect_uri?code=...&state=....
  return (
    <main className="oauth-page">
      <form action="/api/oauth/consent" method="POST" className="oauth-card">
        <input type="hidden" name="client_id" value={q.client_id} />
        <input type="hidden" name="redirect_uri" value={q.redirect_uri} />
        <input type="hidden" name="scope" value={requested} />
        <input type="hidden" name="state" value={q.state ?? ""} />
        <input
          type="hidden"
          name="code_challenge"
          value={q.code_challenge ?? ""}
        />
        <input
          type="hidden"
          name="code_challenge_method"
          value={q.code_challenge_method ?? "S256"}
        />
        {q.link_nonce && (
          <input type="hidden" name="link_nonce" value={q.link_nonce} />
        )}

        <div className="oauth-header">
          <div className="oauth-app-icon" aria-hidden="true">
            🎨
          </div>
          <h1 className="oauth-title">
            {client.name}이 Aura에 연결하려고 해요
          </h1>
        </div>

        <div className="oauth-identity">
          <div className="oauth-identity-label">내 계정</div>
          <div className="oauth-identity-value">
            👤 {student.name} · {student.classroomId ? "학급 " : ""}
            {/* classroom.name could be fetched; keep minimal for now */}
          </div>
        </div>

        <div className="oauth-scopes">
          <p className="oauth-scopes-head">앱이 할 수 있게 되는 것:</p>
          <ul className="oauth-scopes-list">
            {requestedList.includes("cards:write") && (
              <li>✅ 내가 만든 작품을 Aura-board 보드에 게시</li>
            )}
          </ul>
          <p className="oauth-scopes-note">
            앱은 내 비밀번호/이메일을 절대 볼 수 없어요. 언제든 계정 설정에서
            연결을 끊을 수 있어요.
          </p>
        </div>

        <div className="oauth-actions">
          <button
            type="submit"
            name="decision"
            value="deny"
            className="oauth-btn oauth-btn-secondary"
          >
            거절
          </button>
          <button
            type="submit"
            name="decision"
            value="allow"
            className="oauth-btn oauth-btn-primary"
          >
            허용
          </button>
        </div>
      </form>
    </main>
  );
}
