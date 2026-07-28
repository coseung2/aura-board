import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { SlimePurchaseConfirmDialog } from "./SlimePurchaseConfirmDialog";
import { getSlimeShopItem } from "@/lib/pets/catalog";
import { SLIME_COOKIE_ITEM_KEY } from "./SlimePetModel";

const cookie = getSlimeShopItem(SLIME_COOKIE_ITEM_KEY)!;
const floor = getSlimeShopItem("grass-floor-background")!;

describe("SlimePurchaseConfirmDialog", () => {
  it("offers quantity only for consumables and multiplies the total", () => {
    const onConfirm = vi.fn();
    render(
      <SlimePurchaseConfirmDialog
        item={cookie}
        previewColors={["blue", "red"]}
        balance={10_000}
        unitLabel="원"
        busy={false}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: cookie.labelKo });
    fireEvent.click(within(dialog).getByRole("button", { name: "수량 늘리기" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "수량 늘리기" }));

    expect(within(dialog).getByLabelText("구매 수량").textContent).toBe("3");
    expect(within(dialog).getByText(`${(cookie.price * 3).toLocaleString()}원`)).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "구매하기" }));
    expect(onConfirm).toHaveBeenCalledWith(3);
  });

  it("hides quantity for a one-per-student cosmetic and confirms a single unit", () => {
    const onConfirm = vi.fn();
    render(
      <SlimePurchaseConfirmDialog
        item={floor}
        previewColors={["blue"]}
        balance={10_000}
        unitLabel="원"
        busy={false}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: floor.labelKo });
    expect(within(dialog).queryByRole("button", { name: "수량 늘리기" })).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "구매하기" }));
    expect(onConfirm).toHaveBeenCalledWith(1);
  });

  it("cycles the preview through every owned pet color", () => {
    render(
      <SlimePurchaseConfirmDialog
        item={floor}
        previewColors={["blue", "green", "red"]}
        balance={10_000}
        unitLabel="원"
        busy={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: floor.labelKo });
    expect(within(dialog).getByText("블루 슬라임")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "다음 펫 미리보기" }));
    expect(within(dialog).getByText("그린 슬라임")).toBeTruthy();

    // Wrapping backwards from the first page lands on the last owned color.
    fireEvent.click(within(dialog).getByRole("button", { name: "이전 펫 미리보기" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "이전 펫 미리보기" }));
    expect(within(dialog).getByText("레드 슬라임")).toBeTruthy();
  });

  it("warns when the wallet looks short but still lets the server decide", () => {
    const onConfirm = vi.fn();
    render(
      <SlimePurchaseConfirmDialog
        item={floor}
        previewColors={["blue"]}
        balance={0}
        unitLabel="원"
        busy={false}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: floor.labelKo });
    expect(within(dialog).getByRole("alert").textContent).toContain("잔액이 부족해요");

    fireEvent.click(within(dialog).getByRole("button", { name: "구매하기" }));
    expect(onConfirm).toHaveBeenCalledWith(1);
  });
});
