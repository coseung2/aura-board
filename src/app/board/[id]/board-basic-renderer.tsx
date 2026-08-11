import type { ComponentProps, ReactNode } from "react";
import { GridBoard } from "@/components/GridBoard";
import { StreamBoard } from "@/components/StreamBoard";
import { ColumnsBoard } from "@/components/ColumnsBoard";
import { DJBoard } from "@/components/DJBoard";
import { PlantRoadmapBoard } from "@/components/PlantRoadmapBoard";
import { EventSignupBoard } from "@/components/event/EventSignupBoard";

type CommonBoardProps = Omit<
  ComponentProps<typeof GridBoard>,
  "auraSettings" | "auraEvaluations"
>;

type BasicBoardInput = {
  board: {
    id: string;
    slug: string | null;
    title: string;
    layout: string;
    accessMode: string;
    accessToken: string | null;
    applicationStart: Date | null;
    applicationEnd: Date | null;
    eventPosterUrl: string | null;
    venue: string | null;
    maxSelections: number | null;
    streamSectionsEnabled: boolean;
    streamTitlePrompt: string | null;
    streamContentPrompt: string | null;
  };
  common: CommonBoardProps;
  auraSettings: ComponentProps<typeof GridBoard>["auraSettings"];
  auraEvaluations: ComponentProps<typeof GridBoard>["auraEvaluations"];
  sectionProps: NonNullable<ComponentProps<typeof StreamBoard>["initialSections"]>;
  subjectOrder: ComponentProps<typeof ColumnsBoard>["boardSubjectOrder"];
  classroomStudentCount: number | null;
  currentUserId: string | null;
  currentStudentId: string | null;
  plantJournalInitial: ComponentProps<typeof PlantRoadmapBoard>["initial"] | null;
};

export function renderBasicBoard({
  board,
  common,
  auraSettings,
  auraEvaluations,
  sectionProps,
  subjectOrder,
  classroomStudentCount,
  currentUserId,
  currentStudentId,
  plantJournalInitial,
}: BasicBoardInput): ReactNode | undefined {
  const user = currentUserId ? { id: currentUserId } : null;
  const studentViewer = currentStudentId ? { id: currentStudentId } : null;
  const effectiveRole = common.currentRole;
  switch (board.layout) {
    case "grid":
      return (
        <GridBoard
          {...common}
          auraSettings={auraSettings}
          auraEvaluations={auraEvaluations}
        />
      );
    case "stream":
      return (
        <StreamBoard
          {...common}
          initialSections={sectionProps}
          streamSectionsEnabled={board!.streamSectionsEnabled}
          streamTitlePrompt={board!.streamTitlePrompt ?? ""}
          streamContentPrompt={board!.streamContentPrompt ?? ""}
        />
      );
    case "columns":
      return (
        <ColumnsBoard
          {...common}
          initialSections={sectionProps}
          boardSubjectOrder={subjectOrder}
          classroomStudentCount={classroomStudentCount}
        />
      );
    case "dj-queue":
      return (
        <DJBoard
          boardId={board!.id}
          boardTitle={board!.title}
          initialCards={common.initialCards}
          currentRole={
            (effectiveRole ?? "viewer") as "owner" | "editor" | "viewer"
          }
          currentUserId={user?.id ?? null}
          currentStudentId={studentViewer?.id ?? null}
        />
      );
    case "plant-roadmap":
      return <PlantRoadmapBoard initial={plantJournalInitial!} />;
    case "event-signup":

      return (
        <EventSignupBoard
          boardId={board!.id}
          slug={board!.slug ?? board!.id}
          accessMode={board!.accessMode}
          accessToken={board!.accessToken}
          applicationStart={board!.applicationStart?.toISOString() ?? null}
          applicationEnd={board!.applicationEnd?.toISOString() ?? null}
          eventPosterUrl={board!.eventPosterUrl}
          venue={board!.venue}
          maxSelections={board!.maxSelections}
          canEdit={effectiveRole === "owner" || effectiveRole === "editor"}
        />
      );
    default:
      return undefined;
  }
}
