import { notFound } from "next/navigation";

import { ClassroomFeatureHeader } from "@/components/classroom/ClassroomFeatureHeader";
import { ReadingLogDeleteButton } from "@/components/classroom/ReadingLogDeleteButton";
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
  aiFeedback: string | null;
  aiFeedbackStatus: string;
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
        aiFeedback: true,
        aiFeedbackStatus: true,
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
        active="reading"
      />

      <section className="classroom-feature-section classroom-reading-section">
        <div className="classroom-feature-section-head">
          <div>
            <h2>학생 독서 기록</h2>
          </div>
          <span>{readingLogs.length}건</span>
        </div>

        <div className="classroom-reading-list" role="table" aria-label="학생 독서 기록">
          <div className="classroom-reading-list-head" role="row">
            <span role="columnheader">학생</span>
            <span role="columnheader">책 제목</span>
            <span role="columnheader">저자</span>
            <span role="columnheader">점수</span>
            <span role="columnheader">작성일</span>
            <span role="columnheader">관리</span>
          </div>

          {readingLogs.map((log) => (
            <details className="classroom-reading-row" key={log.id}>
              <summary className="classroom-reading-summary" role="row">
                <div className="classroom-reading-student" data-label="학생" role="cell">
                  <span className="ds-inline-mark">
                    <span
                      className="ds-inline-mark-icon"
                      data-glyph="chevron"
                      aria-hidden="true"
                    />
                    <strong>
                      {log.student?.number ?? "-"}번 {log.student?.name ?? "알 수 없는 학생"}
                    </strong>
                  </span>
                </div>
                <div className="classroom-reading-book" data-label="책 제목" role="cell">
                  <strong>{log.title}</strong>
                  <small>{bookTypeLabel(log.bookType)}</small>
                </div>
                <div className="classroom-reading-author" data-label="저자" role="cell">
                  {log.author}
                </div>
                <div
                  className="classroom-reading-score"
                  data-label="점수"
                  role="cell"
                  aria-label={`점수 ${
                    log.aiFeedbackStatus === "generated" && log.aiScore !== null
                      ? `${log.aiScore}점`
                      : "—"
                  }`}
                >
                  <strong>
                    {log.aiFeedbackStatus === "generated" && log.aiScore !== null
                      ? `${log.aiScore}점`
                      : "—"}
                  </strong>
                </div>
                <time
                  className="classroom-reading-date"
                  data-label="작성일"
                  dateTime={log.createdAt.toISOString()}
                  role="cell"
                >
                  {formatDate(log.createdAt)}
                </time>
                <ReadingLogDeleteButton
                  classroomId={classroom.id}
                  readingLogId={log.id}
                  studentLabel={log.student?.name ?? "알 수 없는 학생"}
                  title={log.title}
                />
              </summary>
              <div className="classroom-reading-detail-rows">
                <div className="classroom-reading-detail-row" role="row">
                  <div role="cell">
                    <strong>독서 기록</strong>
                    <p className="classroom-reading-reflection">{log.reflection}</p>
                  </div>
                </div>
                <div className="classroom-reading-detail-row" role="row">
                  <div role="cell">
                    <strong>AI 평가</strong>
                    <p className="classroom-reading-ai-feedback">
                      {log.aiFeedbackStatus === "generated" && log.aiFeedback
                        ? log.aiFeedback
                        : log.aiFeedbackStatus === "failed"
                          ? "평가 실패"
                          : "평가 중"}
                    </p>
                  </div>
                </div>
              </div>
            </details>
          ))}

          {readingLogs.length === 0 ? (
            <p className="classroom-feature-empty">등록된 독서 기록이 없습니다.</p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
