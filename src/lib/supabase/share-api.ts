import type { CardData } from "@/components/DraggableCard";
import type { ShareSession } from "@/components/share/ShareSessionContext";
import { createPublicSupabaseClient } from "./client";
import { fetchShareBoard } from "./share-board";

type CardRow = Omit<CardData, "attachments" | "authors" | "createdAt"> & {
  boardId: string;
  createdAt: string;
  updatedAt: string;
  externalAuthorName: string | null;
};

type AttachmentInput = {
  kind: string;
  url: string;
  previewUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
};

const CARD_COLUMNS =
  "id,boardId,title,content,color,imageUrl,thumbUrl,authorId,linkUrl,linkTitle,linkDesc,linkImage,videoUrl,fileUrl,fileName,fileSize,fileMimeType,x,y,width,height,order,sectionId,createdAt,updatedAt,externalAuthorName";

export async function handleShareApiFetch(
  session: ShareSession,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response | null> {
  if (typeof window === "undefined") return null;
  const raw = input instanceof Request ? input.url : input.toString();
  const url = new URL(raw, window.location.origin);
  if (url.origin !== window.location.origin) return null;

  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const cardMatch = url.pathname.match(/^\/api\/cards\/([^/]+)$/);
  const shareEngagementMatch = url.pathname.match(/^\/api\/share\/cards\/([^/]+)\/engagement$/);
  const shareLikeMatch = url.pathname.match(/^\/api\/share\/cards\/([^/]+)\/like$/);
  const shareCommentsMatch = url.pathname.match(/^\/api\/share\/cards\/([^/]+)\/comments$/);
  const boardSnapshotMatch = url.pathname.match(/^\/api\/boards\/([^/]+)\/snapshot$/);

  try {
    if (url.pathname === "/api/cards" && method === "POST") {
      const body = await readJson(init);
      const card = await createShareCard(session, body);
      return jsonResponse({ card });
    }

    if (cardMatch && method === "GET") {
      const card = await getShareCard(session, decodeURIComponent(cardMatch[1]));
      return card ? jsonResponse({ card }) : jsonResponse({ error: "not_found" }, 404);
    }

    if (cardMatch && method === "PATCH") {
      const body = await readJson(init);
      const card = await updateShareCard(session, decodeURIComponent(cardMatch[1]), body);
      return jsonResponse({ card });
    }

    if (cardMatch && method === "DELETE") {
      await deleteShareCard(session, decodeURIComponent(cardMatch[1]));
      return jsonResponse({ ok: true });
    }

    if (boardSnapshotMatch && method === "GET") {
      const payload = await fetchShareBoard({ kind: "shareToken", value: session.shareToken });
      return jsonResponse({
        cards: payload.initialCards,
        sections: payload.initialSections,
      });
    }

    if (shareEngagementMatch && method === "GET") {
      const payload = await getShareEngagement(session, decodeURIComponent(shareEngagementMatch[1]));
      return jsonResponse(payload);
    }

    if (shareLikeMatch && method === "POST") {
      const payload = await toggleShareLike(session, decodeURIComponent(shareLikeMatch[1]));
      return jsonResponse(payload);
    }

    if (shareCommentsMatch && method === "GET") {
      const payload = await listShareComments(session, decodeURIComponent(shareCommentsMatch[1]));
      return jsonResponse(payload);
    }

    if (shareCommentsMatch && method === "POST") {
      const body = await readJson(init);
      const payload = await createShareComment(
        session,
        decodeURIComponent(shareCommentsMatch[1]),
        body,
      );
      return jsonResponse(payload);
    }
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "share_api_failed" }, 400);
  }

  return null;
}

async function createShareCard(session: ShareSession, body: any): Promise<CardData> {
  const supabase = createShareClient(session);
  const now = new Date().toISOString();
  const cardId = createClientId();
  const cardRow = sanitizeCardWrite({
    id: cardId,
    boardId: body.boardId,
    title: body.title ?? "",
    content: body.content ?? "",
    color: body.color ?? null,
    imageUrl: body.imageUrl ?? null,
    thumbUrl: body.thumbUrl ?? null,
    authorId: null,
    studentAuthorId: null,
    externalAuthorName: session.authorName || "방문자",
    externalAuthorKey: session.guestId,
    linkUrl: body.linkUrl ?? null,
    linkTitle: body.linkTitle ?? null,
    linkDesc: body.linkDesc ?? null,
    linkImage: body.linkImage ?? null,
    videoUrl: body.videoUrl ?? null,
    fileUrl: body.fileUrl ?? null,
    fileName: body.fileName ?? null,
    fileSize: body.fileSize ?? null,
    fileMimeType: body.fileMimeType ?? null,
    x: body.x ?? 0,
    y: body.y ?? 0,
    width: body.width ?? 240,
    height: body.height ?? 160,
    order: body.order ?? 0,
    sectionId: body.sectionId ?? null,
    createdAt: now,
    updatedAt: now,
  });

  const { data, error } = await supabase
    .from("Card")
    .insert(cardRow)
    .select(CARD_COLUMNS)
    .single<CardRow>();
  if (error) throw error;

  await replaceAttachments(session, cardId, body.attachments ?? []);
  return hydrateCard(session, data);
}

async function getShareCard(
  session: ShareSession,
  cardId: string,
): Promise<CardData | null> {
  const supabase = createShareClient(session);
  const { data, error } = await supabase
    .from("Card")
    .select(CARD_COLUMNS)
    .eq("id", cardId)
    .maybeSingle<CardRow>();
  if (error) throw error;
  return data ? hydrateCard(session, data) : null;
}

async function updateShareCard(
  session: ShareSession,
  cardId: string,
  body: any,
): Promise<CardData> {
  const supabase = createShareClient(session);
  const { attachments, ...rest } = body ?? {};
  const patch = sanitizeCardPatch({
    ...rest,
    updatedAt: new Date().toISOString(),
  });

  const { data, error } = await supabase
    .from("Card")
    .update(patch)
    .eq("id", cardId)
    .select(CARD_COLUMNS)
    .single<CardRow>();
  if (error) throw error;

  if (Array.isArray(attachments)) {
    await replaceAttachments(session, cardId, attachments);
  }
  return hydrateCard(session, data);
}

async function deleteShareCard(session: ShareSession, cardId: string): Promise<void> {
  const supabase = createShareClient(session);
  const { error } = await supabase.from("Card").delete().eq("id", cardId);
  if (error) throw error;
}

async function getShareEngagement(session: ShareSession, cardId: string) {
  const supabase = createShareClient(session);
  const [likes, comments, mine] = await Promise.all([
    supabase
      .from("CardLike")
      .select("id", { count: "exact", head: true })
      .eq("cardId", cardId),
    supabase
      .from("CardComment")
      .select("id", { count: "exact", head: true })
      .eq("cardId", cardId)
      .is("deletedAt", null),
    supabase
      .from("CardLike")
      .select("id")
      .eq("cardId", cardId)
      .eq("externalLikerKey", session.guestId)
      .maybeSingle(),
  ]);
  if (likes.error) throw likes.error;
  if (comments.error) throw comments.error;
  if (mine.error) throw mine.error;

  return {
    likeCount: likes.count ?? 0,
    commentCount: comments.count ?? 0,
    isLiked: Boolean(mine.data),
    canInteract: Boolean(session.guestId),
  };
}

async function toggleShareLike(session: ShareSession, cardId: string) {
  const supabase = createShareClient(session);
  const existing = await supabase
    .from("CardLike")
    .select("id")
    .eq("cardId", cardId)
    .eq("externalLikerKey", session.guestId)
    .maybeSingle<{ id: string }>();
  if (existing.error) throw existing.error;

  if (existing.data) {
    const removed = await supabase.from("CardLike").delete().eq("id", existing.data.id);
    if (removed.error) throw removed.error;
    const count = await countLikes(session, cardId);
    return { liked: false, count };
  }

  const inserted = await supabase.from("CardLike").insert({
    id: createClientId(),
    cardId,
    likerKind: "external",
    externalLikerKey: session.guestId,
    createdAt: new Date().toISOString(),
  });
  if (inserted.error) throw inserted.error;
  const count = await countLikes(session, cardId);
  return { liked: true, count };
}

async function countLikes(session: ShareSession, cardId: string): Promise<number> {
  const supabase = createShareClient(session);
  const { count, error } = await supabase
    .from("CardLike")
    .select("id", { count: "exact", head: true })
    .eq("cardId", cardId);
  if (error) throw error;
  return count ?? 0;
}

async function listShareComments(session: ShareSession, cardId: string) {
  const supabase = createShareClient(session);
  const { data, error } = await supabase
    .from("CardComment")
    .select("id,content,createdAt,authorKind,externalAuthorName")
    .eq("cardId", cardId)
    .is("deletedAt", null)
    .order("createdAt", { ascending: false });
  if (error) throw error;
  return {
    items: (data ?? []).map((comment) => ({
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      authorKind: comment.authorKind,
      authorLabel: comment.externalAuthorName ?? "익명",
      canDelete: false,
    })),
  };
}

async function createShareComment(session: ShareSession, cardId: string, body: any) {
  const content = String(body?.content ?? "").trim();
  if (!content) throw new Error("invalid_input");
  const authorName = String(body?.authorName ?? session.authorName ?? "방문자").trim() || "방문자";
  const now = new Date().toISOString();
  const { data, error } = await createShareClient(session)
    .from("CardComment")
    .insert({
      id: createClientId(),
      cardId,
      authorKind: "external",
      externalAuthorName: authorName.slice(0, 60),
      content: content.slice(0, 1000),
      createdAt: now,
    })
    .select("id,content,createdAt,authorKind,externalAuthorName")
    .single();
  if (error) throw error;

  const item = {
    id: data.id,
    content: data.content,
    createdAt: data.createdAt,
    authorKind: data.authorKind,
    authorLabel: data.externalAuthorName ?? "익명",
    canDelete: false,
  };
  return { ok: true, item, comment: item };
}

async function replaceAttachments(
  session: ShareSession,
  cardId: string,
  attachments: AttachmentInput[],
): Promise<void> {
  const supabase = createShareClient(session);
  const deleteResult = await supabase.from("CardAttachment").delete().eq("cardId", cardId);
  if (deleteResult.error) throw deleteResult.error;
  if (attachments.length === 0) return;

  const now = new Date().toISOString();
  const rows = attachments.map((attachment, idx) => ({
    id: createClientId(),
    cardId,
    kind: attachment.kind,
    url: attachment.url,
    previewUrl: attachment.previewUrl ?? null,
    fileName: attachment.fileName ?? null,
    fileSize: attachment.fileSize ?? null,
    mimeType: attachment.mimeType ?? null,
    order: idx,
    createdAt: now,
  }));
  const { error } = await supabase.from("CardAttachment").insert(rows);
  if (error) throw error;
}

async function hydrateCard(session: ShareSession, row: CardRow): Promise<CardData> {
  const supabase = createShareClient(session);
  const { data: attachments, error } = await supabase
    .from("CardAttachment")
    .select("id,kind,url,previewUrl,fileName,fileSize,mimeType,order")
    .eq("cardId", row.id)
    .order("order", { ascending: true });
  if (error) throw error;

  return {
    ...row,
    authorName: null,
    studentAuthorName: null,
    attachments: attachments ?? [],
    authors: [],
  };
}

function createShareClient(session: ShareSession) {
  return createPublicSupabaseClient({
    "x-share-token": session.shareToken,
    "x-share-guest-id": session.guestId,
  });
}

function sanitizeCardWrite(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== undefined),
  );
}

function sanitizeCardPatch(input: Record<string, unknown>) {
  const allowed = new Set([
    "title",
    "content",
    "color",
    "imageUrl",
    "thumbUrl",
    "linkUrl",
    "linkTitle",
    "linkDesc",
    "linkImage",
    "videoUrl",
    "fileUrl",
    "fileName",
    "fileSize",
    "fileMimeType",
    "x",
    "y",
    "width",
    "height",
    "order",
    "sectionId",
    "updatedAt",
  ]);
  return Object.fromEntries(
    Object.entries(input).filter(([key, value]) => allowed.has(key) && value !== undefined),
  );
}

async function readJson(init?: RequestInit): Promise<any> {
  if (!init?.body) return {};
  if (typeof init.body === "string") return JSON.parse(init.body || "{}");
  if (init.body instanceof Blob) return JSON.parse(await init.body.text());
  return {};
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
