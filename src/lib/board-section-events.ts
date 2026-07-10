export const BOARD_SECTIONS_REORDERED_EVENT = "aura-board:sections-reordered";
export const BOARD_SECTIONS_UPDATED_EVENT = "aura-board:sections-updated";

export type BoardSectionsReorderedDetail = {
  boardId: string;
  sections: Array<{
    id: string;
    order: number;
    pinned: boolean;
  }>;
};

export type BoardSectionsUpdatedDetail = {
  boardId: string;
  sections: Array<{
    id: string;
    title: string;
    accessToken: string | null;
    order: number;
    pinned: boolean;
  }>;
};
