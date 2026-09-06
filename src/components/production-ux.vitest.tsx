import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AddCardModal } from "./AddCardModal";
import { EditCardModal } from "./EditCardModal";
import { CreateBoardModal } from "./CreateBoardModal";
import { Dashboard } from "./Dashboard";
import { BillingClient } from "@/app/billing/BillingClient";
import { rollbackCardPatch, saveCardEdit } from "./cards/save-card-edit";
import type { CardData } from "./DraggableCard";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams() }));
vi.mock("./useLinkPreview", () => ({ useLinkPreview: () => ({ preview: null, loading: false, fetchPreview: vi.fn() }) }));
vi.mock("./cards/useCardAttachments", () => ({ useCardAttachments: () => ({
  attachments: [], uploading: false, totalCount: 0, canAddMore: true,
  countByKind: () => 0, uploadMany: vi.fn(),
  removeAttachment: vi.fn(), moveAttachment: vi.fn(), isFirstOfKind: () => true, isLastOfKind: () => true,
}) }));

beforeEach(() => { vi.clearAllMocks(); window.history.replaceState({}, "", "/billing"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const card = { id: "card", title: "원본", content: "기존 내용", attachments: [], color: null, order: 0 } as unknown as CardData;

describe("card draft recovery", () => {
  it("keeps an add draft and unlocks retry after a rejected write", async () => {
    const onAdd = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    const onClose = vi.fn();
    render(<AddCardModal onAdd={onAdd} onClose={onClose} />);
    const title = await screen.findByPlaceholderText("카드 제목") as HTMLInputElement;
    fireEvent.change(title, { target: { value: "저장할 초안" } });
    fireEvent.submit(title.closest("form")!);
    await screen.findByRole("alert");
    expect(title.value).toBe("저장할 초안");
    expect(onClose).not.toHaveBeenCalled();
    expect((title.closest("form")!.querySelector('[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.submit(title.closest("form")!);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onAdd).toHaveBeenCalledTimes(2);
  });
  it("keeps an edit draft when saving fails", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("offline"));
    const onClose = vi.fn();
    render(<EditCardModal card={card} onSave={onSave} onClose={onClose} />);
    const title = screen.getByPlaceholderText("카드 제목") as HTMLInputElement;
    fireEvent.change(title, { target: { value: "수정 초안" } });
    fireEvent.submit(title.closest("form")!);
    await screen.findByRole("alert");
    expect(title.value).toBe("수정 초안");
    expect(onClose).not.toHaveBeenCalled();
    expect((title.closest("form")!.querySelector('[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
  });
  it("does not lock an empty add form", async () => {
    const onAdd = vi.fn();
    render(<AddCardModal onAdd={onAdd} onClose={vi.fn()} />);
    const title = await screen.findByPlaceholderText("카드 제목");
    fireEvent.submit(title.closest("form")!);
    expect(onAdd).not.toHaveBeenCalled();
    fireEvent.change(title, { target: { value: "새 카드" } });
    fireEvent.submit(title.closest("form")!);
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
  });
});

describe("targeted optimistic rollback", () => {
  function state() {
    let cards = [card, { ...card, id: "other", title: "다른 카드" }];
    let open: CardData | null = card;
    const setCards: Parameters<typeof saveCardEdit>[0]["setCards"] = (next) => {
      cards = typeof next === "function" ? next(cards) : next;
    };
    const setOpenCard: Parameters<typeof saveCardEdit>[0]["setOpenCard"] = (next) => {
      open = typeof next === "function" ? next(open) : next;
    };
    return { setCards, setOpenCard, cards: () => cards, open: () => open };
  }
  it("preserves concurrent unrelated changes while restoring the edited card and detail", async () => {
    const s = state();
    vi.stubGlobal("fetch", vi.fn(async () => {
      s.setCards((current) => [...current.map((item) => item.id === "other" ? { ...item, title: "실시간 수정" } : item), { ...card, id: "new" }]);
      throw new Error("offline");
    }));
    await expect(saveCardEdit({ card, updates: { title: "실패할 수정" }, ...s })).rejects.toThrow("offline");
    expect(s.cards().map((item) => item.id)).toEqual(["card", "other", "new"]);
    expect(s.cards()[1].title).toBe("실시간 수정");
    expect(s.cards()[0].title).toBe("원본");
    expect(s.open()?.title).toBe("원본");
  });
  it("keeps a committed edit if reconciliation fails", async () => {
    const s = state();
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 200 })).mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetcher);
    await expect(saveCardEdit({ card, updates: { title: "저장됨" }, ...s })).resolves.toBeUndefined();
    expect(s.cards()[0].title).toBe("저장됨");
    expect(s.open()?.title).toBe("저장됨");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not overwrite a newer change to the same field", () => {
    const current = { ...card, title: "다른 클라이언트 갱신", content: "임시 내용" };
    expect(rollbackCardPatch(current, card, { title: "임시 제목", content: "임시 내용" })).toMatchObject({ title: "다른 클라이언트 갱신", content: "기존 내용" });
  });
});

const billingStatus = {
  tier: "free", plan: "free", status: "active", currentPeriodEnd: null, canceledAt: null, cardLast4: null,
  tossClientKey: null,
  catalog: {
    pro_monthly: { planKey: "pro_monthly", label: "월", amount: 1000, periodDays: 30 },
    pro_yearly: { planKey: "pro_yearly", label: "연", amount: 10000, periodDays: 365 },
  },
};
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });

describe("billing recovery", () => {
  it("replaces permanent loading with an error and retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("", { status: 503 })).mockResolvedValueOnce(json(billingStatus)));
    render(<BillingClient />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await screen.findByText("Free");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/TOSS_SECRET_KEY/)).toBeNull();
  });
  it("reports cancellation network failure and unlocks the control", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ ...billingStatus, tier: "pro", plan: "pro_monthly" })).mockRejectedValueOnce(new Error("offline")));
    render(<BillingClient />);
    const cancel = await screen.findByRole("button", { name: "구독 취소" });
    fireEvent.click(cancel);
    await screen.findByText(/구독 취소 요청에 실패/);
    expect((cancel as HTMLButtonElement).disabled).toBe(false);
  });
  it("shows a failed payment callback instead of silently returning to plans", async () => {
    window.history.replaceState({}, "", "/billing?failed=1");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(billingStatus)));
    render(<BillingClient />);
    await screen.findByText(/결제가 완료되지 않았습니다/);
  });
});

describe("board operation recovery", () => {
  it("offers a classroom entry instead of a dead-end DJ picker", () => {
    render(<CreateBoardModal classrooms={[]} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("DJ"));
    expect(screen.getByRole("link", { name: "학급 만들기" }).getAttribute("href")).toBe("/classroom");
  });
  it("surfaces dashboard operation failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<Dashboard classrooms={[]} boards={[{ id: "board", slug: "board", title: "수업", layout: "freeform", thumbnailMode: null, thumbnailUrl: null, classroomId: null, category: "LESSON", cardCount: 0, memberCount: 1, role: "owner" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "수업 관리 메뉴 열기" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "복제" }));
    await screen.findByRole("alert");
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
