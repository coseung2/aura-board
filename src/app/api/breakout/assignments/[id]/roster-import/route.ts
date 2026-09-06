/**
 * POST /api/breakout/assignments/[id]/roster-import (BR-8)
 *
 * Owner-only. Accepts multipart/form-data with field `file` = CSV.
 * CSV must have a header row. Recognised columns (case-insensitive):
 *   - name      required
 *   - number    optional (integer)
 *
 * Rows become Student rows in the board's classroom, upserting by
 * (classroomId, number) when a number is provided. When no number is
 * provided we only insert if no identical (name) row exists yet.
 *
 * Returns: { created, existing, failed }
 */
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBoardRole, ForbiddenError } from "@/lib/rbac";

/**
 * Minimal CSV parser. Handles quoted fields, escaped quotes ("") and CRLF.
 * Enough for typical teacher-exported rosters; not RFC 4180 perfect.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 0 && r.some((cell) => cell.trim() !== ""));
}

function randomAlnum(len: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

import { withProductFeature } from "@/lib/product-release-server";

export const POST = withProductFeature("developmentLayouts", POSTHandler);
async function POSTHandler(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const user = await getCurrentUser();

    const assignment = await db.breakoutAssignment.findUnique({
      where: { id },
      include: { board: { select: { classroomId: true } } },
    });
    if (!assignment) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const role = await getBoardRole(assignment.boardId, user.id);
    if (role !== "owner") throw new ForbiddenError("owner-only");

    if (!assignment.board.classroomId) {
      return NextResponse.json({ error: "no_classroom" }, { status: 400 });
    }
    const classroomId = assignment.board.classroomId;

    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "file_required" }, { status: 400 });
    }
    const text = await (file as File).text();
    const rows = parseCsv(text);
    if (rows.length < 2) {
      return NextResponse.json({ error: "csv_too_short" }, { status: 400 });
    }

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const nameIdx = header.indexOf("name");
    const numberIdx = header.indexOf("number");
    if (nameIdx === -1) {
      return NextResponse.json({ error: "missing_name_column" }, { status: 400 });
    }

    let created = 0;
    let existing = 0;
    let failed = 0;

    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      const name = (cells[nameIdx] ?? "").trim();
      if (!name) {
        failed++;
        continue;
      }
      const numberRaw =
        numberIdx >= 0 ? (cells[numberIdx] ?? "").trim() : "";
      const number = numberRaw ? Number(numberRaw) : null;
      if (numberRaw && (Number.isNaN(number) || number! <= 0)) {
        failed++;
        continue;
      }

      try {
        if (number != null) {
          const dup = await db.student.findFirst({
            where: { classroomId, number },
          });
          if (dup) {
            existing++;
            continue;
          }
        } else {
          const dup = await db.student.findFirst({
            where: { classroomId, name },
          });
          if (dup) {
            existing++;
            continue;
          }
        }
        await db.student.create({
          data: {
            classroomId,
            name,
            number,
            qrToken: randomUUID(),
            textCode: randomAlnum(6),
          },
        });
        created++;
      } catch (e) {
        console.error("[roster-import row]", e);
        failed++;
      }
    }

    return NextResponse.json({ created, existing, failed });
  } catch (e) {
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    console.error("[POST roster-import]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
