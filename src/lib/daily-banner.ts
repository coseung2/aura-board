import "server-only";

import { isAllowedFileUrl } from "@/lib/file-attachment";
import { db } from "@/lib/db";

export const KST_TIME_ZONE = "Asia/Seoul";
export const DAILY_BANNER_MAX_TEXT_LENGTH = 1_000;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Return the calendar day at the given instant in Korea Standard Time. */
export function getKstDay(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

/** Parse a YYYY-MM-DD day without applying the server's local timezone. */
export function parseKstDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = DAY_RE.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/** Value suitable for Prisma DateTime fields backed by PostgreSQL DATE. */
export function kstDayToDate(day: string): Date {
  const parsed = parseKstDay(day);
  if (!parsed) throw new Error(`Invalid KST day: ${day}`);
  return new Date(`${parsed}T00:00:00.000Z`);
}

/** Convert a Prisma DATE value to the API's stable YYYY-MM-DD representation. */
export function dateToKstDay(value: Date): string {
  // PostgreSQL DATE values are materialized by Prisma at UTC midnight. Use
  // the shared formatter to remain correct if a driver returns another offset.
  return getKstDay(value);
}

export type DailyBannerPayload = {
  id: string;
  day: string;
  kind: "text" | "image";
  text: string | null;
  imageUrl: string | null;
  publishedAt: string;
  submittedByName?: string;
};

export type DailyBannerSubmissionPayload = {
  id: string;
  studentId: string;
  classroomId: string;
  targetDay: string;
  kind: "text" | "image";
  text: string | null;
  imageUrl: string | null;
  status: "pending" | "approved" | "rejected";
  reviewedAt: string | null;
  reviewedById: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  student?: { id: string; name: string; number: number | null };
}

export function serializeDailyBanner(row: {
  id: string;
  day: Date;
  submission: {
    kind: "text" | "image";
    text: string | null;
    imageUrl: string | null;
    student?: { name: string } | null;
  };
  publishedAt: Date;
}): DailyBannerPayload {
  return {
    id: row.id,
    day: dateToKstDay(row.day),
    kind: row.submission.kind,
    text: row.submission.text,
    imageUrl: row.submission.imageUrl,
    publishedAt: row.publishedAt.toISOString(),
    ...(row.submission.student?.name
      ? { submittedByName: row.submission.student.name }
      : {}),
  };
}

export function serializeDailyBannerSubmission(row: {
  id: string;
  studentId: string;
  classroomId: string;
  targetDay: Date;
  kind: "text" | "image";
  text: string | null;
  imageUrl: string | null;
  status: "pending" | "approved" | "rejected";
  reviewedAt: Date | null;
  reviewedById: string | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  student?: { id: string; name: string; number: number | null };
}): DailyBannerSubmissionPayload {
  return {
    id: row.id,
    studentId: row.studentId,
    classroomId: row.classroomId,
    targetDay: dateToKstDay(row.targetDay),
    kind: row.kind,
    text: row.text,
    imageUrl: row.imageUrl,
    status: row.status,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewedById: row.reviewedById,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.student ? { student: row.student } : {}),
  };
}

/** Read the published banner for one classroom and KST day. */
export async function getDailyBanner(
  classroomId: string,
  day = getKstDay(),
) {
  const publication = await db.dailyBannerPublication.findUnique({
    where: {
      classroomId_day: {
        classroomId,
        day: kstDayToDate(day),
      },
    },
    include: {
      submission: {
        select: {
          kind: true,
          text: true,
          imageUrl: true,
          student: { select: { name: true } },
        },
      },
    },
  });
  return publication ? serializeDailyBanner(publication) : null;
}

/** Shared image URL guard for student banner submissions. */
export function isAllowedDailyBannerImageUrl(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && isAllowedFileUrl(value);
}
