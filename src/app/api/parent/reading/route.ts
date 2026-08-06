import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withParentScope } from "@/lib/parent-scope";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RECENT_LIMIT_PER_CHILD = 100;

export async function GET(req: Request) {
  return withParentScope(req, async (ctx) => {
    const studentIds = ctx.childLinks.map((link) => link.studentId);

    if (studentIds.length === 0) {
      return NextResponse.json({ children: [] });
    }

    const [students, entries] = await Promise.all([
      db.student.findMany({
        where: { id: { in: studentIds } },
        select: {
          id: true,
          name: true,
          number: true,
          classroom: { select: { id: true, name: true } },
        },
      }),
      db.readingLog.findMany({
        where: { studentId: { in: studentIds } },
        select: {
          id: true,
          studentId: true,
          bookType: true,
          title: true,
          author: true,
          reflection: true,
          aiScore: true,
          aiFeedback: true,
          createdAt: true,
        },
        orderBy: [{ studentId: "asc" }, { createdAt: "desc" }],
      }),
    ]);

    const studentsById = new Map(students.map((student) => [student.id, student]));
    const entriesByStudent = new Map<string, typeof entries>();
    for (const studentId of studentIds) entriesByStudent.set(studentId, []);

    for (const entry of entries) {
      const childEntries = entriesByStudent.get(entry.studentId);
      if (childEntries && childEntries.length < RECENT_LIMIT_PER_CHILD) {
        childEntries.push(entry);
      }
    }

    const children = ctx.childLinks
      .map((link) => {
        const student = studentsById.get(link.studentId);
        if (!student) return null;

        return {
          studentId: student.id,
          name: student.name,
          number: student.number,
          classroom: student.classroom,
          entries: (entriesByStudent.get(student.id) ?? []).map((entry) => ({
            id: entry.id,
            bookType: entry.bookType,
            title: entry.title,
            author: entry.author,
            reflection: entry.reflection,
            aiScore: entry.aiScore,
            aiFeedback: entry.aiFeedback,
            createdAt: entry.createdAt.toISOString(),
          })),
        };
      })
      .filter((child): child is NonNullable<typeof child> => child !== null);

    return NextResponse.json({ children });
  });
}
