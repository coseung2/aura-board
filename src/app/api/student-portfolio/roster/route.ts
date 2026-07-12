import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolvePortfolioViewer } from "@/lib/portfolio-acl";
import type { PortfolioRosterDTO } from "@/lib/portfolio-dto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/student-portfolio/roster?classroomId=:cid
//
// 학급 학생 명단 + 학생당 카드 수 + 자랑해요 수. 포트폴리오 페이지 좌측
// 리스트 + 학부모 다자녀 셀렉터에서 사용.
//
// 권한:
//   - student: 자기 학생만
//   - parent: 자녀가 속한 학급
//   - teacher_owner: 자기 학급
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const classroomId = searchParams.get("classroomId");
  if (!classroomId) {
    return NextResponse.json({ error: "classroomId_required" }, { status: 400 });
  }

  const viewer = await resolvePortfolioViewer();
  if (!viewer) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 학급 접근 가드
  let allowed = false;
  if (viewer.kind === "student") allowed = viewer.classroomId === classroomId;
  else if (viewer.kind === "parent")
    allowed = viewer.childClassroomIds.includes(classroomId);
  else allowed = viewer.classroomIds.includes(classroomId);
  if (!allowed) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const classroom = await db.classroom.findUnique({
    where: { id: classroomId },
    select: { id: true, name: true },
  });
  if (!classroom) {
    return NextResponse.json({ error: "classroom_not_found" }, { status: 404 });
  }

  // 학생 + 카드 수 + 자랑해요 수. 단일 round-trip 으로 묶어 fetch.
  // cardCount = 학생이 작성한 카드(studentAuthorId) + 공동작성한 카드(authors)
  // 의 합집합. 단순 _count 는 두 관계 합 계산이 어려우니 raw 쿼리로 1회.
  const students = await db.student.findMany({
    where:
      viewer.kind === "student"
        ? { id: viewer.id, classroomId }
        : { classroomId },
    orderBy: [{ number: "asc" }, { name: "asc" }],
    select: { id: true, name: true, number: true },
  });

  const studentIds = students.map((s) => s.id);
  if (studentIds.length === 0) {
    return NextResponse.json({
      classroom,
      students: [],
    } satisfies PortfolioRosterDTO);
  }

  // 카드 수: studentAuthorId 가 있거나 CardAuthor.studentId 가 있는 카드의
  // (studentId, count) 매핑. 공동작성자 다 학생이라도 같은 카드는 학생별로
  // 1번만 세야 하므로 distinct cardId.
  // dj-queue 등 EXCLUDED_BOARD_LAYOUTS 카드는 카드 수 카운트에서 제외 —
  // 학생 결과물 컨텍스트 아니라 포트폴리오 그리드와 일치시켜야 함.
  const counts = await db.$queryRaw<
    Array<{ studentId: string; cardCount: bigint }>
  >`
    SELECT s.id AS "studentId", COUNT(DISTINCT c.id) AS "cardCount"
    FROM "Student" s
    LEFT JOIN "Card" c ON (
      (c."studentAuthorId" = s.id
       OR c.id IN (SELECT "cardId" FROM "CardAuthor" WHERE "studentId" = s.id))
      AND c."boardId" IN (SELECT id FROM "Board" WHERE layout != 'dj-queue')
      AND (c."queueStatus" IS NULL OR c."queueStatus" != 'played')
    )
    WHERE s."classroomId" = ${classroomId}
    GROUP BY s.id
  `;
  const cardCountById = new Map(
    counts.map((r) => [r.studentId, Number(r.cardCount)])
  );

  const dto: PortfolioRosterDTO = {
    classroom,
    students: students.map((s) => ({
      id: s.id,
      name: s.name,
      number: s.number,
      cardCount: cardCountById.get(s.id) ?? 0,
    })),
  };
  return NextResponse.json(dto);
}
