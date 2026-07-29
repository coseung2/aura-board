import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextMenu } from "./ContextMenu";

afterEach(cleanup);

describe("ContextMenu keyboard behavior", () => {
  it("focuses the first enabled item and cycles enabled controls", async () => {
    render(
      <ContextMenu
        items={[
          { label: "사용 불가", disabled: true, onClick: vi.fn() },
          { label: "수정", onClick: vi.fn() },
          { label: "삭제", onClick: vi.fn() },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "메뉴" }));

    const edit = await screen.findByRole("menuitem", { name: "수정" });
    const remove = screen.getByRole("menuitem", { name: "삭제" });
    await waitFor(() => expect(edit).toHaveFocus());

    fireEvent.keyDown(edit, { key: "ArrowDown" });
    expect(remove).toHaveFocus();
    fireEvent.keyDown(remove, { key: "ArrowDown" });
    expect(edit).toHaveFocus();
    fireEvent.keyDown(edit, { key: "ArrowUp" });
    expect(remove).toHaveFocus();
    fireEvent.keyDown(remove, { key: "Home" });
    expect(edit).toHaveFocus();
    fireEvent.keyDown(edit, { key: "End" });
    expect(remove).toHaveFocus();
  });

  it("restores trigger focus on Escape and after an action", async () => {
    const onEdit = vi.fn();
    render(<ContextMenu items={[{ label: "수정", onClick: onEdit }]} />);
    const trigger = screen.getByRole("button", { name: "메뉴" });

    fireEvent.click(trigger);
    const edit = await screen.findByRole("menuitem", { name: "수정" });
    await waitFor(() => expect(edit).toHaveFocus());
    fireEvent.keyDown(edit, { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    const reopenedEdit = await screen.findByRole("menuitem", { name: "수정" });
    fireEvent.click(reopenedEdit);

    expect(onEdit).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes on Tab and outside pointer interaction without restoring trigger focus", async () => {
    render(
      <div>
        <ContextMenu items={[{ label: "수정", onClick: vi.fn() }]} />
        <button type="button">다음</button>
      </div>
    );
    const trigger = screen.getByRole("button", { name: "메뉴" });

    fireEvent.click(trigger);
    const edit = await screen.findByRole("menuitem", { name: "수정" });
    await waitFor(() => expect(edit).toHaveFocus());
    fireEvent.keyDown(edit, { key: "Tab" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).not.toHaveFocus();

    fireEvent.click(trigger);
    await screen.findByRole("menuitem", { name: "수정" });
    fireEvent.mouseDown(screen.getByRole("button", { name: "다음" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
