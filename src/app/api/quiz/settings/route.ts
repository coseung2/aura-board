import { NextResponse } from "next/server";

function retiredResponse() {
  const response = NextResponse.json(
    {
      error: "quiz_ai_settings_moved",
      message: "퀴즈 AI 설정은 교사 설정의 영역별 모델에서 관리합니다.",
      settingsUrl: "/teacher/settings#llm",
    },
    { status: 410 },
  );
  // Remove legacy browser-stored credentials if an older client still calls
  // this endpoint. API keys must never remain in a browser cookie.
  response.cookies.set("llm_provider", "", { path: "/", maxAge: 0 });
  response.cookies.set("llm_api_key", "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
  });
  return response;
}

export async function GET() {
  return retiredResponse();
}

export async function POST() {
  return retiredResponse();
}
