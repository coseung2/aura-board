import { OnboardingShell } from "../_shell";
import { ParentAuthButtons } from "@/components/parent/ParentAuthButtons";

// parent-class-invite-v2 - P1 Signup.
// parent-redesign (2026-04-26): OAuth(Google/Kakao) 버튼만 제공.

export default function ParentSignupPage() {
  return (
    <OnboardingShell step={1} total={4}>
      <h1 style={titleStyle}>학부모 로그인</h1>
      <p style={bodyStyle}>
        Google 또는 Kakao 계정으로 빠르게 시작할 수 있어요.
      </p>
      <div style={{ marginTop: 20 }}>
        <ParentAuthButtons />
      </div>
    </OnboardingShell>
  );
}

const titleStyle: React.CSSProperties = { margin: 0, fontSize: 22, fontWeight: 700 };
const bodyStyle: React.CSSProperties = { margin: "8px 0 0", fontSize: 15, color: "var(--color-text-muted)" };
