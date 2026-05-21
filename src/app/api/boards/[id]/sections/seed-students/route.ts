import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { touchBoardUpdatedAt } from "@/lib/board-touch";

/**
 * POST /api/boards/:id/sections/seed-students
 *
 * classroom-linked columns 보드에서 학급 학생 명단을 출석번호 순으로
 * 섹션(칼럼)을 한 번에 생성한다. 교사(owner/editor) 전용.
 * 생성된 섹션은 기존 섹션 뒤에 append된다.
 *
 * 1회성 시드라는 의미에서 중복 실행 시 기존 섹션과 이름이 겹쳐도
 * 새로 생성한다 (교사가 수동 정리).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: boardId } = await params;
    const user = await getCurrentUser();

    // 교사 권한 확인 + board 존재 + classroomId 검증
    const board = await db.board.findUnique({
      where: { id: boardId },
      select: { classroomId: true, layout: true },
    });
    if (!board) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }
    if (!board.classroomId) {
      return NextResponse.json(
        { error: "학급과 연결된 보드만 학생 시드 칼럼을 추가할 수 있습니다." },
        { status: 400 }
      );
    }
    if (board.layout !== "columns") {
      return NextResponse.json(
        { error: "칼럼 보드(columns)에서만 사용할 수 있습니다." },
        { status: 400 }
      );
    }

    await requirePermission(boardId, user.id, "edit");

    // 학급 학생 조회 — 출석번호 정렬
    const students = await db.student.findMany({
      where: { classroomId: board.classroomId },
      orderBy: { number: { sort: "asc", nulls: "last" } },
      select: { id: true, name: true, number: true },
    });

    if (students.length === 0) {
      return NextResponse.json(
        { error: "이 학급에 등록된 학생이 없습니다." },
        { status: 400 }
      );
    }

    // 현재 최대 섹션 order 확인
    const maxOrder = await db.section.aggregate({
      where: { boardId },
      _max: { order: true },
    });
    let nextOrder = (maxOrder._max.order ?? -1) + 1;

    // 학생별 섹션 생성 (출석번호 이름 형식: "1. 홍길동")
    const created = await db.$transaction(
      students.map((s) =>
        db.section.create({
          data: {
            boardId,
            title: s.number != null ? `${s.number}. ${s.name}` : s.name,
            order: nextOrder++,
          },
        })
      )
    );

    // best-effort touch
    await touchBoardUpdatedAt(boardId);

    return NextResponse.json({ sections: created });
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    console.error("[POST /api/boards/:id/sections/seed-students]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
