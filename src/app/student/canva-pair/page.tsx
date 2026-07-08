/**
 * /student/canva-pair
 *
 * 학생이 로그인한 상태에서 이 페이지를 열면 8자 연결 코드를 발급해
 * 화면에 크게 표시한다. 학생은 이 코드를 Canva 앱(특히 태블릿 네이티브
 * 앱)에 입력해 Bearer 인증으로 전환한다. 쿠키가 iframe/웹뷰 공유가
 * 불가능한 상황을 우회하기 위한 짧은 페어링 코드 흐름.
 *
 * 코드는 OAuthAuthCode 테이블을 재사용하며 clientId="canva" +
 * redirectUri="aura://pair" 로 구분되어 저장된다. 5 분 TTL, one-shot
 * 소비. /api/external/pair/exchange 에서 소비 후 aurastu_ 액세스 토큰
 * 을 발급해 Canva 앱에 반환한다.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { randomBytes } from "crypto";
import { getCurrentStudent } from "@/lib/student-auth";
import { getStudentDuties } from "@/lib/role-portals";
import { isAdminEmail } from "@/lib/admin";
import { StudentTopNav } from "@/components/StudentTopNav";
import { db } from "@/lib/db";
import { CopyButton } from "./CopyButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Canva 앱 연결 · Aura-board" };

const PAIR_CODE_TTL_MS = 5 * 60 * 1000;
// Readable charset — no 0/O, 1/I confusion. Uppercase base32-ish.
const PAIR_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function generatePairCode(): string {
  const buf = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += PAIR_ALPHABET[(buf[i] ?? 0) % PAIR_ALPHABET.length];
  }
  return out;
}

async function issuePairCode(studentId: string): Promise<string> {
  // Retry a couple of times in the unlikely event of a collision.
  for (let i = 0; i < 3; i++) {
    const code = generatePairCode();
    try {
      await db.oAuthAuthCode.create({
        data: {
          code,
          studentId,
          clientId: "canva",
          redirectUri: "aura://pair",
          scope: "cards:write",
          codeChallenge: "",
          codeChallengeMethod: "plain",
          state: null,
          expiresAt: new Date(Date.now() + PAIR_CODE_TTL_MS),
        },
      });
      return code;
    } catch (e) {
      const prismaCode = (e as { code?: string }).code;
      if (prismaCode === "P2002") continue; // unique violation → retry
      throw e;
    }
  }
  throw new Error("pair_code_issue_retry_exhausted");
}

export default async function CanvaPairPage() {
  const student = await getCurrentStudent();
  if (!student) {
    redirect("/login?from=/student/canva-pair");
  }

  const [code, duties] = await Promise.all([
    issuePairCode(student.id),
    getStudentDuties(student.id),
  ]);
  // Split into two groups of 4 for easier reading on a tablet ("A3K7-BN9X").
  const pretty = `${code.slice(0, 4)}-${code.slice(4)}`;

  return (
    <>
      <StudentTopNav
        studentName={student.name}
        classroomName={student.classroom.name}
        duties={duties}
        showDevFeatures={isAdminEmail(student.classroom.teacher.email)}
      />
      <main
        style={{
          minHeight: "calc(100vh - 64px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          fontFamily: "system-ui, sans-serif",
          background: "var(--color-surface-alt, #f4f4f6)",
        }}
      >
        <div
          style={{
            maxWidth: 480,
            width: "100%",
            background: "var(--color-surface, white)",
            border: "1px solid var(--color-border, #e2e2ea)",
            borderRadius: 16,
            padding: 28,
            textAlign: "center",
            boxShadow: "0 10px 40px rgba(0,0,0,0.06)",
          }}
        >
          <p style={{ color: "#666", margin: 0, fontSize: 14 }}>
          {student.name} · 5분간 유효 · 한 번만 사용
        </p>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: "14px 0 18px" }}>
          Canva 앱에 아래 연결 코드를 입력하세요
        </h1>

        <div
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
            fontSize: 48,
            fontWeight: 700,
            letterSpacing: 4,
            padding: "20px 16px",
            borderRadius: 12,
            background: "var(--color-surface-alt, #f4f4f6)",
            userSelect: "all",
          }}
        >
          {pretty}
        </div>

        <div style={{ marginTop: 16 }}>
          <CopyButton token={code} />
        </div>

        <p
          style={{
            marginTop: 24,
            color: "#666",
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          Canva 앱으로 돌아가서 &ldquo;연결 코드&rdquo; 칸에 이 8자를
          입력한 뒤 &ldquo;로그인&rdquo; 버튼을 누르세요. 대시(-) 는 생략
          해도 됩니다.
        </p>

        <p style={{ marginTop: 12 }}>
          <Link href="/student/logout" className="docs-link">
            다른 학생으로 로그아웃
          </Link>
        </p>
        </div>
      </main>
    </>
  );
}
