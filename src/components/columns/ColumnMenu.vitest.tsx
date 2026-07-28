import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColumnMenu } from "./ColumnMenu";

afterEach(cleanup);

describe("ColumnMenu keyboard behavior", () => {
  it("focuses the selected sort option and cycles radio and action controls", async () => {
    render(
      <ColumnMenu
        sortMode="oldest"
        canSort
        onSetSort={vi.fn()}
        actions={[
          { label: "사용 불가", disabled: true, onClick: vi.fn() },
          { label: "이름 변경", onClick: vi.fn() },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "섹션 메뉴" }));

    const manual = await screen.findByRole("menuitemradio", { name: "수동" });
    const oldest = screen.getByRole("menuitemradio", { name: "오래된 순" });
    const title = screen.getByRole("menuitemradio", { name: "제목순" });
    const rename = screen.getByRole("menuitem", { name: "이름 변경" });
    await waitFor(() => expect(oldest).toHaveFocus());

    fireEvent.keyDown(oldest, { key: "ArrowDown" });
    expect(title).toHaveFocus();
    fireEvent.keyDown(title, { key: "End" });
    expect(rename).toHaveFocus();
    fireEvent.keyDown(rename, { key: "ArrowDown" });
    expect(manual).toHaveFocus();
    fireEvent.keyDown(manual, { key: "ArrowUp" });
    expect(rename).toHaveFocus();
    fireEvent.keyDown(rename, { key: "Home" });
    expect(manual).toHaveFocus();
  });

  it("restores focus on Escape and after selecting a sort option", async () => {
    const onSetSort = vi.fn();
    render(
      <ColumnMenu sortMode="newest" canSort onSetSort={onSetSort} />
    );
    const trigger = screen.getByRole("button", { name: "섹션 메뉴" });

    fireEvent.click(trigger);
    const newest = await screen.findByRole("menuitemradio", { name: "최신순" });
    await waitFor(() => expect(newest).toHaveFocus());
    fireEvent.keyDown(newest, { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    const oldest = await screen.findByRole("menuitemradio", { name: "오래된 순" });
    fireEvent.click(oldest);

    expect(onSetSort).toHaveBeenCalledWith("oldest");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("focuses the first enabled action without sorting and closes on Tab", async () => {
    render(
      <ColumnMenu
        sortMode="manual"
        canSort={false}
        onSetSort={vi.fn()}
        actions={[
          { label: "사용 불가", disabled: true, onClick: vi.fn() },
          { label: "이름 변경", onClick: vi.fn() },
        ]}
      />
    );
    const trigger = screen.getByRole("button", { name: "섹션 메뉴" });

    fireEvent.click(trigger);
    const rename = await screen.findByRole("menuitem", { name: "이름 변경" });
    await waitFor(() => expect(rename).toHaveFocus());
    fireEvent.keyDown(rename, { key: "Tab" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).not.toHaveFocus();
  });
});
