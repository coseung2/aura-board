/**
 * /student/canva-return — 로그인 후 자동으로 닫히는 완료 페이지.
 * Canva 앱의 "Log in" 버튼이 /login?from=/student/canva-return 를
 * 열고, 로그인 폼이 이 경로로 이동하면 여기서 세션 쿠키가 top-level 에
 * 정상으로 설정되어 있는지만 보여주고 0.8s 뒤 자동 종료. Canva 앱은
 * visibilitychange 이벤트로 복귀를 감지해 whoami 를 재조회한다.
 */
import { CanvaAttribution } from "@/components/canva/CanvaAttribution";

export const metadata = { title: "로그인 완료 · Aura-board" };

export default function CanvaReturnPage() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        flexDirection: "column",
        gap: 12,
        fontFamily: "system-ui, sans-serif",
        padding: 24,
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>✓ 로그인 완료</h1>
      <p style={{ color: "#555" }}>
        이 창을 닫으면 Canva 앱으로 돌아갑니다.
      </p>
      <CanvaAttribution />
      <script
        dangerouslySetInnerHTML={{
          __html:
            "setTimeout(() => { try { window.close(); } catch {} }, 800);",
        }}
      />
    </div>
  );
}
