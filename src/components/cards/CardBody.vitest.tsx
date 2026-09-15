import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContextMenu } from "../ContextMenu";
import { CardBody } from "./CardBody";

// 카드 메뉴 토글이 작성자 줄(.card-author-footer) 오른쪽 슬롯으로 들어가는지
// 확인한다 — 예전에는 카드 우상단 절대 배치라 작성자 줄 밖에 있었다.

const card = { title: "제목", content: "본문" };

function cardMenu() {
  return (
    <div className="card-ctx-menu">
      <ContextMenu items={[{ label: "수정", onClick: vi.fn() }]} />
    </div>
  );
}

describe("CardBody card menu slot", () => {
  it("renders the menu inside the author footer row", () => {
    const { container } = render(
      <CardBody
        card={{
          ...card,
          authorName: "김선생",
          createdAt: "2026-01-01T00:00:00.000Z",
        }}
        cardMenu={cardMenu()}
      />,
    );

    const footer = container.querySelector(".card-author-footer");
    expect(footer).not.toBeNull();
    expect(footer?.querySelector(".card-ctx-menu .ctx-menu-trigger")).not.toBeNull();
    expect(footer?.querySelector(".card-author-name")?.textContent).toBe("김선생");
    expect(footer?.classList.contains("is-menu-only")).toBe(false);
  });

  it("keeps a menu-only row when the card has no author info", () => {
    const { container } = render(<CardBody card={card} cardMenu={cardMenu()} />);

    const footer = container.querySelector(".card-author-footer");
    expect(footer?.classList.contains("is-menu-only")).toBe(true);
    expect(footer?.querySelector(".ctx-menu-trigger")).not.toBeNull();
  });

  it("omits the footer when a surface opts out and there is no menu", () => {
    const { container } = render(
      <CardBody card={{ ...card, authorName: "김선생" }} showAuthorFooter={false} />,
    );

    expect(container.querySelector(".card-author-footer")).toBeNull();
  });
});
