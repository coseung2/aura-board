import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cardDetailModalMock = vi.fn(
  ({ viewer }: { viewer?: string }) => (
    <div data-testid="card-detail-modal" data-viewer={viewer ?? ""} />
  ),
);

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("./useParentPosts", () => ({
  useParentPosts: () => ({
    data: {
      items: [
        {
          id: "post-1",
          title: "첫 게시물",
          content: "내용",
          color: null,
          width: 1,
          height: 1,
          imageUrl: null,
          thumbUrl: null,
          linkUrl: null,
          linkTitle: null,
          linkDesc: null,
          linkImage: null,
          videoUrl: null,
          fileUrl: null,
          fileName: null,
          fileSize: null,
          fileMimeType: null,
          externalAuthorName: null,
          studentAuthorName: "민수",
          authorName: null,
          likeCount: 0,
          commentCount: 0,
          authors: [],
          attachments: [],
          sourceBoard: {
            id: "board-1",
            slug: "board-1",
            title: "교실 보드",
            layout: "stream",
            anonymousAuthor: false,
          },
          sourceSection: null,
          isShowcasedByMe: false,
          hasAnyShowcase: false,
          createdAt: "2026-07-26T00:00:00.000Z",
          linkedChildren: [{ id: "child-1", name: "민수" }],
          contentKind: "text",
        },
      ],
      nextCursor: null,
    },
    error: null,
    loading: false,
    loadingMore: false,
    loadMore: vi.fn(),
    retry: vi.fn(),
  }),
}));

vi.mock("./ParentPendingLinks", () => ({
  ParentPendingLinks: () => null,
}));

vi.mock("./ParentPostCard", () => ({
  ParentPostCard: ({
    post,
    onOpen,
  }: {
    post: { id: string; title: string };
    onOpen: (post: { id: string; title: string }) => void;
  }) => (
    <button type="button" onClick={() => onOpen(post)}>
      open {post.title}
    </button>
  ),
}));

vi.mock("../cards/CardDetailModal", () => ({
  CardDetailModal: (props: { viewer?: string }) => cardDetailModalMock(props),
}));

vi.mock("../portfolio/portfolio-card-adapter", () => ({
  portfolioCardToCardData: (post: unknown) => post,
}));

import { ParentFeed } from "./ParentFeed";

describe("ParentFeed viewer contract", () => {
  beforeEach(() => {
    cardDetailModalMock.mockClear();
  });

  it("states family like/comment capability and wires viewer=parent", () => {
    render(<ParentFeed childCount={1} />);

    expect(
      screen.getByText(
        "좋아요와 가족 댓글을 남길 수 있어요. 공개 댓글은 읽기 전용입니다.",
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "open 첫 게시물" }));
    expect(cardDetailModalMock).toHaveBeenCalled();
    const props = cardDetailModalMock.mock.calls.at(-1)?.[0] as {
      viewer?: string;
    };
    expect(props.viewer).toBe("parent");
  });
});
