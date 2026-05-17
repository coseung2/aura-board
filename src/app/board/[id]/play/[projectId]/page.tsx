import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { PlayClient } from "@/components/agent/PlayClient";

interface Props {
  params: Promise<{ id: string; projectId: string }>;
}

export default async function PlayPage({ params }: Props) {
  const { id, projectId } = await params;

  const project = await db.vibeProject.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      title: true,
      htmlContent: true,
      cssContent: true,
      jsContent: true,
    },
  });

  if (!project) notFound();

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
