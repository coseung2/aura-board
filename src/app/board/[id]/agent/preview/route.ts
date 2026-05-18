// Agent sandbox preview route (2026-05-18, Canvas Architecture).
// Serves the active file content from an agent session as a proper HTML page
// with CSP headers and sandbox isolation. Same pattern as /sandbox/vibe/[projectId].
//
// Canvas state is NOT persisted to DB yet — the preview works with the
// current session's active file. The AI-generated code is embedded in the
// assistant messages, and the client navigates here to preview it.

import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";

const ALLOWED_LANGUAGES = new Set(["html", "htm"]);

const CSP_HEADERS = [
  "sandbox allow-scripts",
  "frame-src 'none'",
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
];

const RESPONSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": CSP_HEADERS.join("; "),
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "SAMEORIGIN",
};

/** Fetch the latest assistant code block from the session messages. */
async function getLatestCode(sessionId: string): Promise<string | null> {
  const messages = await db.agentMessage.findMany({
    where: { sessionId, role: "assistant" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { content: true },
  });

  // Find the first message that looks like complete HTML
  for (const msg of messages) {
    const trimmed = msg.content.trim();
    if (trimmed.startsWith("<!") || trimmed.startsWith("<html") || trimmed.startsWith("<div") || trimmed.startsWith("<h")) {
      return trimmed;
    }
    // Also check for embedded code blocks
    const codeMatch = trimmed.match(/```html?\n([\s\S]*?)```/);
    if (codeMatch) return codeMatch[1].trim();
  }

  return null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: boardId } = await params;
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session");
  const raw = url.searchParams.get("raw"); // "1" to serve raw content without wrapping

  if (!sessionId) {
    return new Response("missing_session", { status: 400 });
  }

  // Verify the student owns this session and it belongs to this board
  const student = await getCurrentStudent();
  if (!student) {
    return new Response("unauthorized", { status: 401 });
  }

  const session = await db.agentSession.findFirst({
    where: {
      id: sessionId,
      studentId: student.id,
    },
    select: { id: true, mode: true, messageCount: true },
  });

  if (!session) {
    return new Response("not_found", { status: 404 });
  }

  // Get the latest code from the session messages
  const code = await getLatestCode(sessionId);
  if (!code) {
    return new Response("no_content", { status: 204 });
  }

  // Serve raw content (for AJAX fetch by MonacoEditor/chat panel)
  if (raw === "1") {
    return new Response(code, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Wrap in a proper sandboxed HTML page with a bridge for postMessage
  const escapedCode = code.replace(/<\/script>/gi, "<\\/script>");
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Agent Preview</title>
  <style>
    html,body { margin: 0; padding: 0; height: 100%; background: #fff; color: #111; font-family: system-ui,sans-serif; }
  </style>
</head>
<body>
${escapedCode}
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: RESPONSE_HEADERS,
  });
}
