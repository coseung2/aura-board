import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ClassroomDetail } from "@/components/ClassroomDetail";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ClassroomStudentsPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser();

  const classroom = await db.classroom.findUnique({
    where: { id },
    include: {
      students: { orderBy: [{ number: "asc" }, { createdAt: "asc" }] },
      boards: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!classroom || classroom.teacherId !== user.id) {
    notFound();
  }

  const serialized = {
    id: classroom.id,
    name: classroom.name,
    code: classroom.code,
    students: classroom.students.map((s) => ({
      id: s.id,
      number: s.number,
      name: s.name,
      gender: s.gender,
      qrToken: s.qrToken,
      textCode: s.textCode,
      createdAt: s.createdAt.toISOString(),
    })),
    boards: classroom.boards.map((b) => ({
      id: b.id,
      slug: b.slug,
      title: b.title,
      layout: b.layout,
    })),
  };

  return (
    <main className="classroom-page classroom-page-detail">
      <a href="/classroom" className="classroom-back-link">
        &larr; 학급 목록
      </a>
      <ClassroomDetail classroom={serialized} />
    </main>
  );
}
