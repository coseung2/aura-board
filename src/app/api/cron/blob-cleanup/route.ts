import { NextResponse } from "next/server";
import { processBlobDeletionQueue } from "@/lib/blob-cleanup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorizeCron(req: Request): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  if (req.headers.get("x-vercel-cron")) return true;
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  return Boolean(secret && process.env.CRON_SECRET && secret === process.env.CRON_SECRET);
}

export async function GET(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await processBlobDeletionQueue(25);
  return NextResponse.json({ ok: true, ...result });
}
