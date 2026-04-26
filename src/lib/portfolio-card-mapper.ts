import "server-only";
import type { PortfolioCardDTO } from "./portfolio-dto";

// student-portfolio (2026-04-26): Prisma Card row(+include) → PortfolioCardDTO
// 매핑. 포트폴리오 API 라우트들이 공통으로 쓰는 변환 헬퍼라 분리.
//
// Prisma include 모양 가정:
//   include: {
//     board: { select: { id, slug, title, layout, classroomId } },
//     section: { select: { id, title } },
//     attachments: { orderBy: { order: 'asc' } },
//     showcaseEntries: ...   // canonicalize 위에 옵션
//   }

type PrismaCardLike = {
  id: string;
  title: string;
  content: string;
  color: string | null;
  imageUrl: string | null;
  thumbUrl: string | null;
  linkUrl: string | null;
  linkTitle: string | null;
  linkDesc: string | null;
  linkImage: string | null;
  videoUrl: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileMimeType: string | null;
  createdAt: Date;
  board: { id: string; slug: string; title: string; layout: string; anonymousAuthor: boolean };
  section: { id: string; title: string } | null;
  attachments: Array<{
    id: string;
    kind: string;
    url: string;
    fileName: string | null;
    fileSize: number | null;
    mimeType: string | null;
    order: number;
  }>;
  showcaseEntries: Array<{ studentId: string }>;
};

export function mapPortfolioCard(
  card: PrismaCardLike,
  viewerStudentId: string | null
): PortfolioCardDTO {
  const isShowcasedByMe =
    !!viewerStudentId &&
    card.showcaseEntries.some((s) => s.studentId === viewerStudentId);
  const hasAnyShowcase = card.showcaseEntries.length > 0;
  return {
    id: card.id,
    title: card.title,
    content: card.content,
    color: card.color,
    imageUrl: card.imageUrl,
    thumbUrl: card.thumbUrl,
    linkUrl: card.linkUrl,
    linkTitle: card.linkTitle,
    linkDesc: card.linkDesc,
    linkImage: card.linkImage,
    videoUrl: card.videoUrl,
    fileUrl: card.fileUrl,
    fileName: card.fileName,
    fileSize: card.fileSize,
    fileMimeType: card.fileMimeType,
    attachments: card.attachments.map((a) => ({
      id: a.id,
      kind: a.kind,
      url: a.url,
      fileName: a.fileName,
      fileSize: a.fileSize,
      mimeType: a.mimeType,
      order: a.order,
    })),
    sourceBoard: {
      id: card.board.id,
      slug: card.board.slug,
      title: card.board.title,
      layout: card.board.layout,
      anonymousAuthor: card.board.anonymousAuthor,
    },
    sourceSection: card.section
      ? { id: card.section.id, title: card.section.title }
      : null,
    isShowcasedByMe,
    hasAnyShowcase,
    createdAt: card.createdAt.toISOString(),
  };
}
