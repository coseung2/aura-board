import { ShadowAllianceGame } from "@/features/shadow-alliance/components/ShadowAllianceGame";

type ShadowAllianceBoardProps = {
  boardId: string;
  boardTitle: string;
  viewer: "teacher" | "student";
};

export function ShadowAllianceBoard({
  boardId,
  boardTitle,
  viewer,
}: ShadowAllianceBoardProps) {
  return (
    <section className="shadow-alliance-board" aria-label={boardTitle}>
      <ShadowAllianceGame boardId={boardId} viewer={viewer} />
    </section>
  );
}
