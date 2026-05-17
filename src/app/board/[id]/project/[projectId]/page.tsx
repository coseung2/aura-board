import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { ProjectDetailClient } from "@/components/agent/ProjectDetailClient";

function parseTags(tags: string): string[] {
  try {
    const parsed = JSON.parse(tags);
    if (Array.isArray(parsed)) {
      return parsed.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0);
    }
  } catch {
    // fall through
  }
  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string; projectId: string }>;
}) {
  const { id, projectId } = await params;

  const board = await db.board.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    select: { id: true, classroomId: true, title: true },
  });
  if (!board) notFound();

  const student = await getCurrentStudent();
  if (student && board.classroomId && student.classroomId !== board.classroomId) {
    redirect(`/board/${id}`);
  }

  const project = await db.vibeProject.findFirst({
    where: { id: projectId, boardId: board.id },
    include: {
      author: { select: { id: true, name: true } },
      reviews: {
        where: { moderationStatus: "visible" },
        orderBy: { createdAt: "desc" },
        include: { reviewer: { select: { name: true } } },
      },
    },
  });
  if (!project) notFound();

  return (
    <ProjectDetailClient
      boardHref={`/board/${id}`}
      currentStudent={student ? { id: student.id, name: student.name } : null}
      canReview={Boolean(
        student &&
          student.classroomId === project.classroomId &&
          student.id !== project.authorStudentId
      )}
      project={{
        id: project.id,
        boardId: project.boardId,
        title: project.title,
        description: project.description,
        htmlContent: project.htmlContent,
        cssContent: project.cssContent,
        jsContent: project.jsContent,
        tags: parseTags(project.tags),
        authorName: project.author.name,
        playCount: project.playCount,
        reviewCount: project.reviewCount,
        ratingAvg: project.ratingAvg,
        createdAt: project.createdAt.toISOString(),
      }}
      initialReviews={project.reviews.map((review) => ({
        id: review.id,
        reviewerName: review.reviewer.name,
        rating: review.rating,
        content: review.comment,
        createdAt: review.createdAt.toISOString(),
      }))}
    />
  );
}
