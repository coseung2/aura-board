import { describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: () => [null, vi.fn()],
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Animated: {},
  Easing: {},
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Modal: "Modal",
  PanResponder: {},
  Platform: { OS: "android" },
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  StyleSheet: { create: (value: unknown) => value, flatten: (value: unknown) => value },
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));
vi.mock("lucide-react-native", () => ({ ArrowLeft: "ArrowLeft" }));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock("../components/DailyBanner", () => ({
  DailyBanner: "DailyBanner",
  useDailyBannerScope: () => null,
}));

import { AppModal } from "../components/ui";

type ElementLike = {
  type?: unknown;
  props: {
    children?: ElementLike | ElementLike[] | string | null;
    onStartShouldSetResponder?: () => boolean;
  };
};

function sheetElement(modal: ElementLike): ElementLike {
  const backdrop = modal.props.children as ElementLike;
  const keyboardWrap = backdrop.props.children as ElementLike;
  const frame = keyboardWrap.props.children as ElementLike;
  return frame.props.children as ElementLike;
}

describe("AppModal touch routing", () => {
  it("keeps the action footer outside the scrolling dialog body", () => {
    const modal = AppModal({ visible: true, onClose: vi.fn(), children: "long body", scrollable: true, footer: "submit" }) as unknown as ElementLike;
    const surface = sheetElement(modal).props.children as ElementLike;
    const fragment = surface.props.children as ElementLike;
    const [body, footer] = fragment.props.children as ElementLike[];
    expect(body.type).toBe("ScrollView");
    expect(body.props.children).toBe("long body");
    expect(footer.type).toBe("ScrollView");
    expect(footer.props.children).toBe("submit");
  });

  it("unmounts hidden native inputs and actions without owning the caller draft", () => {
    const modal = AppModal({ visible: false, onClose: vi.fn(), children: "draft", scrollable: true, footer: "submit" }) as unknown as ElementLike;
    const surface = sheetElement(modal).props.children as ElementLike;
    expect(surface.props.children).toBeNull();
  });

  it("leaves nested controls as responders for ordinary modals", () => {
    const modal = AppModal({
      visible: true,
      onClose: vi.fn(),
      keyboardAvoiding: true,
      children: null,
    }) as unknown as ElementLike;

    expect(sheetElement(modal).props.onStartShouldSetResponder).toBeUndefined();
  });

  it("keeps the sheet responder guard when the backdrop closes on press", () => {
    const modal = AppModal({
      visible: true,
      onClose: vi.fn(),
      closeOnBackdropPress: true,
      keyboardAvoiding: true,
      children: null,
    }) as unknown as ElementLike;
    const responder = sheetElement(modal).props.onStartShouldSetResponder;

    expect(responder).toBeTypeOf("function");
    expect(responder?.()).toBe(true);
  });
});
