export const BOARD_SECTIONS_REORDERED_EVENT = "aura-board:sections-reordered";

export type BoardSectionsReorderedDetail = {
  boardId: string;
  sections: Array<{
    id: string;
    order: number;
    pinned: boolean;
  }>;
};
