import type { CardData } from "@/components/DraggableCard";
import type { BoardSection } from "@/components/share/ShareBoardWrapper";
import { createPublicSupabaseClient } from "./client";

export type ShareBoardPayload = {
  board: {
    id: string;
    title: string;
    layout: string;
    description: string | null;
    slug: string | null;
    anonymousAuthor: boolean;
    boardTheme: string | null;
  };
  initialCards: CardData[];
  initialSections: BoardSection[];
  shareMode: "student";
  shareToken: string;
};

type ShareLookup =
  | { kind: "shortCode"; value: string }
  | { kind: "shareToken"; value: string };

type BoardRow = {
  id: string;
  title: string;
  slug: string | null;
  layout: string;
  description: string | null;
  shareMode: string;
  shareToken: string | null;
  anonymousAuthor: boolean;
  boardTheme: string | null;
};

type CardRow = {
  id: string;
  title: string;
  content: string;
  color: string | null;
  imageUrl: string | null;
  thumbUrl: string | null;
  authorId: string | null;
  linkUrl: string | null;
  linkTitle: string | null;
  linkDesc: string | null;
  linkImage: string | null;
  videoUrl: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileMimeType: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  order: number;
  sectionId: string | null;
  createdAt: string;
  externalAuthorName: string | null;
};

type SectionRow = {
  id: string;
  title: string;
  order: number;
  pinned: boolean;
  sortMode: string | null;
};

type AttachmentRow = {
  id: string;
  cardId: string;
  kind: "image" | "video" | "file";
  url: string;
  previewUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  order: number;
};

type AuthorRow = {
  id: string;
  cardId: string;
  studentId: string | null;
  displayName: string;
  order: number;
};

export async function fetchShareBoard(
  lookup: ShareLookup,
): Promise<ShareBoardPayload> {
  const headerName = lookup.kind === "shortCode" ? "x-share-code" : "x-share-token";
  const supabase = createPublicSupabaseClient({ [headerName]: lookup.value });

  const boardFilter =
    lookup.kind === "shortCode"
      ? { column: "shareShortCode", value: lookup.value }
      : { column: "shareToken", value: lookup.value };

  const { data: board, error: boardError } = await supabase
    .from("Board")
    .select("id,title,slug,layout,description,shareMode,shareToken,anonymousAuthor,boardTheme")
    .eq(boardFilter.column, boardFilter.value)
    .eq("shareMode", "student")
    .maybeSingle<BoardRow>();

  if (boardError) throw boardError;
  if (!board?.shareToken) throw new Error("공유 보드를 찾을 수 없어요.");

  const [{ data: cards, error: cardsError }, { data: sections, error: sectionsError }] =
    await Promise.all([
      supabase
        .from("Card")
        .select(
          "id,title,content,color,imageUrl,thumbUrl,authorId,linkUrl,linkTitle,linkDesc,linkImage,videoUrl,fileUrl,fileName,fileSize,fileMimeType,x,y,width,height,order,sectionId,createdAt,externalAuthorName",
        )
        .eq("boardId", board.id)
        .order("order", { ascending: true })
        .returns<CardRow[]>(),
      supabase
        .from("Section")
        .select("id,title,order,pinned,sortMode")
        .eq("boardId", board.id)
        .order("order", { ascending: true })
        .returns<SectionRow[]>(),
    ]);

  if (cardsError) throw cardsError;
  if (sectionsError) throw sectionsError;

  const cardIds = (cards ?? []).map((card) => card.id);
  const [attachmentsResult, authorsResult] =
    cardIds.length > 0
      ? await Promise.all([
          supabase
            .from("CardAttachment")
            .select("id,cardId,kind,url,previewUrl,fileName,fileSize,mimeType,order")
            .in("cardId", cardIds)
            .order("order", { ascending: true })
            .returns<AttachmentRow[]>(),
          supabase
            .from("CardAuthor")
            .select("id,cardId,studentId,displayName,order")
            .in("cardId", cardIds)
            .order("order", { ascending: true })
            .returns<AuthorRow[]>(),
        ])
      : [
          { data: [] as AttachmentRow[], error: null },
          { data: [] as AuthorRow[], error: null },
        ];

  if (attachmentsResult.error) throw attachmentsResult.error;
  if (authorsResult.error) throw authorsResult.error;

  const attachmentsByCard = groupByCardId(attachmentsResult.data ?? []);
  const authorsByCard = groupByCardId(authorsResult.data ?? []);

  return {
    board: {
      id: board.id,
      title: board.title,
      layout: board.layout,
      description: board.description,
      slug: board.slug,
      anonymousAuthor: board.anonymousAuthor,
      boardTheme: board.boardTheme,
    },
    initialCards: (cards ?? []).map((card) => ({
      id: card.id,
      title: card.title,
      content: card.content,
      color: card.color,
      imageUrl: card.imageUrl,
      thumbUrl: card.thumbUrl,
      authorId: card.authorId ?? (card.externalAuthorName ? board.shareToken! : null),
      linkUrl: card.linkUrl,
      linkTitle: card.linkTitle,
      linkDesc: card.linkDesc,
      linkImage: card.linkImage,
      videoUrl: card.videoUrl,
      fileUrl: card.fileUrl,
      fileName: card.fileName,
      fileSize: card.fileSize,
      fileMimeType: card.fileMimeType,
      x: card.x,
      y: card.y,
      width: card.width,
      height: card.height,
      order: card.order,
      sectionId: card.sectionId,
      createdAt: card.createdAt,
      externalAuthorName: card.externalAuthorName,
      studentAuthorName: null,
      authorName: null,
      authors: (authorsByCard.get(card.id) ?? []).map((author) => ({
        id: author.id,
        studentId: author.studentId,
        displayName: author.displayName,
        order: author.order,
      })),
      attachments: attachmentsByCard.get(card.id) ?? [],
      anonymousAuthor: board.anonymousAuthor,
    })),
    initialSections: (sections ?? []).map((section) => ({
      id: section.id,
      title: section.title,
      order: section.order,
      pinned: section.pinned,
      sortMode: section.sortMode,
      accessToken: null,
    })),
    shareMode: "student",
    shareToken: board.shareToken,
  };
}

function groupByCardId<T extends { cardId: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const list = grouped.get(row.cardId) ?? [];
    list.push(row);
    grouped.set(row.cardId, list);
  }
  return grouped;
}
