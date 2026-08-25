export type TeacherLibraryCollectionDto = {
  id: string;
  name: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
};

export type TeacherLibraryItemKind = "image" | "canva";
export type TeacherLibraryPdfLayout = "a4-auto" | "a4-fit" | "original";

export type TeacherLibraryItemDto = {
  id: string;
  collectionId: string | null;
  kind: TeacherLibraryItemKind;
  title: string;
  assetUrl: string | null;
  previewUrl: string | null;
  mimeType: string | null;
  fileSize: number | null;
  canvaDesignId: string | null;
  canvaViewUrl: string | null;
  pageCount: number | null;
  sourceBoardId: string | null;
  sourceSectionId: string | null;
  sourceCardId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TeacherLibraryPayload = {
  collections: TeacherLibraryCollectionDto[];
  items: TeacherLibraryItemDto[];
};
