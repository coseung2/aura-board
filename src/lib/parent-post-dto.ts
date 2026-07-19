import type { PortfolioCardDTO } from "./portfolio-dto";

export type ParentChildSummary = {
  id: string;
  name: string;
  number: number | null;
  classroomId: string;
  classroomName: string;
};

export type ParentPostDTO = PortfolioCardDTO & {
  linkedChildren: ParentChildSummary[];
  contentKind: "media" | "text";
};
