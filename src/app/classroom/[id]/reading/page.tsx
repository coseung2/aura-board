import { notFound } from "next/navigation";

import { ClassroomFeatureHeader } from "@/components/classroom/ClassroomFeatureHeader";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

type Props = {
  params: Promise<{ id: string }>;
};

type ReadingLogRow = {
  id: string;
  bookType: string;
  title: string;
  author: string;
  reflection: string;
  aiScore: number | null;
  createdAt: Date;
  student: {
    name: string;
    number: number | null;
  } | null;
};

function isMissingReadingLogTable(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (code === "P2021") return true;
  }

  return (
    error instanceof Error &&
    (error.message.includes("ReadingLog") || error.message.includes("readingLog"))
  );
}

async function loadReadingLogs(classroomId: string): Promise<ReadingLogRow[]> {
  if (!db.readingLog) {
    console.warn("[classroom/reading] ReadingLog delegate is not available yet.");
    return [];
  }

  try {
    return await db.readingLog.findMany({
      where: { classroomId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        bookType: true,
        title: true,
        author: true,
        reflection: true,
        aiScore: true,
        createdAt: true,
        student: {
          select: {
            name: true,
            number: true,
          },
        },
      },
    });
  } catch (error) {
    if (isMissingReadingLogTable(error)) {
      console.warn("[classroom/reading] ReadingLog table is not available yet.");
      return [];
    }
    throw error;
  }
}

function formatDate(value: Date): string {
  return value.toLocaleDateString("ko-KR");
}

function bookTypeLabel(bookType: string): string {
  return bookType === "comic" ? "만화책" : "이야기책";
}

export default async function ClassroomReadingPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser().catch(() => null);
  if (!user) notFound();

  const classroom = await db.classroom.findUnique({
    where: { id },
    select: { id: true, name: true, teacherId: true },
  });
  if (!classroom || classroom.teacherId !== user.id) notFound();

  const readingLogs = await loadReadingLogs(classroom.id);

  return (
    <main className="classroom-page classroom-page-detail classroom-feature-page">
      <ClassroomFeatureHeader
        classroomId={classroom.id}
        eyebrow={classroom.name}
        description="학생이 남긴 책 정보와 독서 감상, 채점 결과를 한곳에서 확인합니다."
        active="reading"
      />

      <section className="classroom-feature-section classroom-reading-section">
        <div className="classroom-feature-section-head">
          <div>
            <h2>학생 독서 기록</h2>
            <p>최근 작성된 기록부터 보여줍니다.</p>
          </div>
          <span>{readingLogs.length}건</span>
        </div>

        <div className="classroom-reading-list" role="table" aria-label="학생 독서 기록">
          <div className="classroom-reading-list-head" role="row">
            <span role="columnheader">학생</span>
            <span role="columnheader">책 제목</span>
            <span role="columnheader">저자</span>
            <span role="columnheader">독서 감상</span>
            <span role="columnheader">점수</span>
            <span role="columnheader">작성일</span>
          </div>

          {readingLogs.map((log) => (
            <article className="classroom-reading-row" key={log.id} role="row">
              <div className="classroom-reading-student" data-label="학생" role="cell">
                <strong>
                  {log.student?.number ?? "-"}번 {log.student?.name ?? "알 수 없는 학생"}
                </strong>
              </div>
              <div className="classroom-reading-book" data-label="책 제목" role="cell">
                <strong>{log.title}</strong>
                <small>{bookTypeLabel(log.bookType)}</small>
              </div>
              <div className="classroom-reading-author" data-label="저자" role="cell">
                {log.author}
              </div>
              <p className="classroom-reading-reflection" data-label="독서 감상" role="cell">
                {log.reflection}
              </p>
              <div className="classroom-reading-score" data-label="점수" role="cell">
                <strong>{log.aiScore === null ? "미평가" : `${log.aiScore}점`}</strong>
              </div>
              <time
                className="classroom-reading-date"
                data-label="작성일"
                dateTime={log.createdAt.toISOString()}
                role="cell"
              >
                {formatDate(log.createdAt)}
              </time>
            </article>
          ))}

          {readingLogs.length === 0 ? (
            <p className="classroom-feature-empty">등록된 독서 기록이 없습니다.</p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
