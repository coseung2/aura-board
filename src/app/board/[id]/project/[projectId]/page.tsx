import { notFound } from "next/navigation";
import { ProjectDetailClient } from "@/components/agent/ProjectDetailClient";
import { loadAuthorizedVibeProject } from "@/lib/vibe-arcade/project-access";

function parseTags(tags: string): string[] {
  try {
    const parsed: unknown = JSON.parse(tags);
    if (Array.isArray(parsed)) return parsed.filter(
      (tag): tag is string => typeof tag === "string" && tag.trim().length > 0,
    );
  } catch { /* Legacy comma-separated tags. */ }
  return tags.split(",").map((tag) => tag.trim()).filter(Boolean);
}

export default async function ProjectDetailPage({ params }: {
  params: Promise<{ id: string; projectId: string }>;
}) {
  const { id, projectId } = await params;
  const access = await loadAuthorizedVibeProject(id, projectId);
  if (!access) notFound();
  const { project, student } = access;
  return (
    <ProjectDetailClient
      boardHref={`/board/${encodeURIComponent(id)}`}
      currentStudent={student ? { id: student.id, name: student.name } : null}
      canReview={access.canReview}
      project={{
        id: project.id,
        boardId: project.boardId,
        title: project.title,
        description: project.description,
        htmlContent: project.htmlContent,
        cssContent: project.cssContent,
        jsContent: project.jsContent,
        tags: parseTags(project.tags),
        authorName: access.authorName,
        playCount: project.playCount,
        reviewCount: project.reviewCount,
        ratingAvg: project.ratingAvg,
        createdAt: project.createdAt.toISOString(),
      }}
      initialReviews={access.reviews}
    />
  );
}
