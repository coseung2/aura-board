import { readFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HTML_PATH = path.join(process.cwd(), "public", "games", "shadow-alliance.html");

function publicSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  return { url, key };
}

function supabaseOrigins(url: string) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const wsProtocol = parsed.protocol === "http:" ? "ws:" : "wss:";
    return `${parsed.origin} ${wsProtocol}//${parsed.host}`;
  } catch {
    return "";
  }
}

function injectConfig(html: string, url: string, key: string) {
  return html
    .replace(/URL:\s*""/, `URL: ${JSON.stringify(url)}`)
    .replace(/KEY:\s*""/, `KEY: ${JSON.stringify(key)}`);
}

export async function GET() {
  const { url, key } = publicSupabaseConfig();
  const html = injectConfig(await readFile(HTML_PATH, "utf8"), url, key);
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    `connect-src 'self' ${supabaseOrigins(url)}`,
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'self'",
  ].join("; ");

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": csp,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
