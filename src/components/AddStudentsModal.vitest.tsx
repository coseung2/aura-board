import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddStudentsModal } from "./AddStudentsModal";

vi.mock("@/lib/client-lookup-cache", () => ({
  notifyClassroomListChanged: vi.fn(),
  notifyRosterChanged: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AddStudentsModal", () => {
  it("documents and imports gender from column C", async () => {
    const onAdded = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          students: [
            {
              id: "student-1",
              number: 1,
              name: "홍길동",
              gender: "male",
              qrToken: "qr-1",
              textCode: "ABC123",
              createdAt: "2026-09-16T00:00:00.000Z",
            },
            {
              id: "student-2",
              number: 2,
              name: "김영희",
              gender: "female",
              qrToken: "qr-2",
              textCode: "DEF456",
              createdAt: "2026-09-16T00:00:00.000Z",
            },
          ],
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(
      <AddStudentsModal
        open
        classroomId="classroom-1"
        onClose={vi.fn()}
        onAdded={onAdded}
      />,
    );

    expect(
      screen.getByText("엑셀 또는 CSV 파일 (A열: 번호, B열: 이름, C열: 성별)"),
    ).toBeTruthy();

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const csv = new File(
      ["번호,이름,성별\n1,홍길동,남\n2,김영희,여\n"],
      "students.csv",
      { type: "text/csv" },
    );
    fireEvent.change(input, { target: { files: [csv] } });

    await screen.findByText(/1번 홍길동/);
    expect(screen.getByText(/1번 홍길동.*남/)).toBeTruthy();
    expect(screen.getByText(/2번 김영희.*여/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "2명 추가" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      students: [
        { number: 1, name: "홍길동", gender: "male" },
        { number: 2, name: "김영희", gender: "female" },
      ],
    });
    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
  });

  it("blocks an unsupported gender value instead of silently dropping it", async () => {
    const { container } = render(
      <AddStudentsModal
        open
        classroomId="classroom-1"
        onClose={vi.fn()}
        onAdded={vi.fn()}
      />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [new File(["1,홍길동,기타\n"], "students.csv", { type: "text/csv" })],
      },
    });

    expect(await screen.findByText(/성별은 남\/여 또는 male\/female/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "1명 추가" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
