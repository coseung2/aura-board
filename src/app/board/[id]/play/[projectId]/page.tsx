import { loadAuthorizedVibeProject } from "@/lib/vibe-arcade/project-access";
import { notFound } from "next/navigation";
import { PlayClient } from "@/components/agent/PlayClient";

interface Props {
  params: Promise<{ id: string; projectId: string }>;
}

export default async function PlayPage({ params }: Props) {
  const { id, projectId } = await params;

  const access = await loadAuthorizedVibeProject(id, projectId);
  if (!access) notFound();
  const { project } = access;

  return (
    <PlayClient
      boardId={id}
      project={{
        id: project.id,
        title: project.title,
        htmlContent: project.htmlContent,
        cssContent: project.cssContent ?? "",
        jsContent: project.jsContent ?? "",
      }}
    />
  );
}
