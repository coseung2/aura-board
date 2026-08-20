import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_HEARTBEAT_AGE_SECONDS = 180;

type ReplicationExpectation = "enabled" | "disabled" | "invalid";

function replicationExpectation(): ReplicationExpectation {
  const configured = process.env.AURA_DR_EXPECT_REPLICATION;
  if (configured === undefined || configured === "false" || configured === "0") {
    return "disabled";
  }
  if (configured === "true" || configured === "1") return "enabled";
  return "invalid";
}

function heartbeatAgeSeconds(): number | null {
  const configured = process.env.AURA_DR_MAX_HEARTBEAT_AGE_SECONDS;
  if (configured === undefined) return DEFAULT_HEARTBEAT_AGE_SECONDS;
  if (!/^\d+$/.test(configured)) return null;

  const seconds = Number(configured);
  return Number.isSafeInteger(seconds) && seconds >= 30 && seconds <= 900
    ? seconds
    : null;
}

function noStoreJson(body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    return noStoreJson({ ok: false, database: "unreachable" }, 503);
  }

  const expectation = replicationExpectation();
  if (expectation === "disabled") {
    return noStoreJson({ ok: true, database: "reachable" });
  }
  if (expectation === "invalid") {
    return noStoreJson(
      { ok: false, database: "reachable", replication: "misconfigured" },
      503,
    );
  }

  const maxHeartbeatAgeSeconds = heartbeatAgeSeconds();
  if (maxHeartbeatAgeSeconds === null) {
    return noStoreJson(
      { ok: false, database: "reachable", replication: "misconfigured" },
      503,
    );
  }

  try {
    const rows = await db.$queryRaw<Array<{ source_commit_at: Date }>>`
      SELECT source_commit_at
      FROM private.aura_dr_heartbeat
      WHERE id = 'primary'
    `;

    if (rows.length !== 1) {
      return noStoreJson(
        { ok: false, database: "reachable", replication: "unavailable" },
        503,
      );
    }

    const sourceCommitAt = rows[0]?.source_commit_at;
    if (!(sourceCommitAt instanceof Date) || Number.isNaN(sourceCommitAt.getTime())) {
      return noStoreJson(
        { ok: false, database: "reachable", replication: "unavailable" },
        503,
      );
    }

    const ageMs = Date.now() - sourceCommitAt.getTime();
    if (ageMs < 0 || ageMs > maxHeartbeatAgeSeconds * 1_000) {
      return noStoreJson(
        { ok: false, database: "reachable", replication: "stale" },
        503,
      );
    }

    return noStoreJson({ ok: true, database: "reachable", replication: "fresh" });
  } catch {
    return noStoreJson(
      { ok: false, database: "reachable", replication: "unavailable" },
      503,
    );
  }
}
