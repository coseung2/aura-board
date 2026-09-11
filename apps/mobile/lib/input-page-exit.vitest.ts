import { beforeEach, describe, expect, it, vi } from "vitest";
import { useInputPageExit } from "../hooks/use-input-page-exit";

const mocks = vi.hoisted(() => ({
  prevent: vi.fn(),
  dispatch: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
  alert: vi.fn(),
  canGoBack: vi.fn(() => true),
}));
vi.mock("react", () => ({ useRef: (value: unknown) => ({ current: value }) }));
vi.mock("react-native", () => ({ Alert: { alert: mocks.alert } }));
vi.mock("expo-router", () => ({
  useNavigation: () => ({ dispatch: mocks.dispatch }),
  useRouter: () => ({
    back: mocks.back,
    replace: mocks.replace,
    canGoBack: mocks.canGoBack,
  }),
}));
vi.mock("@react-navigation/native", () => ({
  usePreventRemove: mocks.prevent,
}));

const action = { type: "GO_BACK" };
function attemptRemoval() {
  mocks.prevent.mock.calls.at(-1)![1]({ data: { action } });
}

describe("native input page exit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canGoBack.mockReturnValue(true);
  });
  it("does not block a clean page", () => {
    const exit = useInputPageExit(false, false);
    expect(mocks.prevent).toHaveBeenCalledWith(false, expect.any(Function));
    exit.back();
    expect(mocks.back).toHaveBeenCalledOnce();
  });
  it("requires explicit discard for header, hardware and swipe Back", () => {
    useInputPageExit(true, false);
    attemptRemoval();
    expect(mocks.dispatch).not.toHaveBeenCalled();
    const actions = mocks.alert.mock.calls[0][2];
    expect(actions[0].style).toBe("cancel");
    actions[1].onPress();
    expect(mocks.dispatch).toHaveBeenCalledWith(action);
  });
  it("keeps the page mounted during a pending save or upload", () => {
    useInputPageExit(true, true);
    attemptRemoval();
    expect(mocks.alert).toHaveBeenCalledWith(
      "처리 중이에요",
      expect.any(String),
    );
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it("allows a successful save to return without discarding confirmation", () => {
    const exit = useInputPageExit(true, true);
    exit.finish();
    attemptRemoval();
    expect(mocks.dispatch).toHaveBeenCalledWith(action);
    expect(mocks.alert).not.toHaveBeenCalled();
  });
  it("returns a direct-entry page to student home when no history exists", () => {
    mocks.canGoBack.mockReturnValue(false);
    useInputPageExit(false, false).finish();
    expect(mocks.replace).toHaveBeenCalledWith("/(student)");
    expect(mocks.back).not.toHaveBeenCalled();
  });
  it("does not block expired-session recovery behind a busy draft", () => {
    useInputPageExit(true, true);
    const login = { type: "REPLACE", payload: { name: "login", params: { role: "student" } } };
    mocks.prevent.mock.calls.at(-1)![1]({ data: { action: login } });
    expect(mocks.dispatch).toHaveBeenCalledWith(login);
    expect(mocks.alert).not.toHaveBeenCalled();
  });
});
