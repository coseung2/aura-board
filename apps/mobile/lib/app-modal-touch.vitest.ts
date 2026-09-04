import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Animated: {},
  Easing: {},
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Modal: "Modal",
  PanResponder: {},
  Platform: { OS: "android" },
  Pressable: "Pressable",
  StyleSheet: { create: (value: unknown) => value },
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
  props: {
    children?: ElementLike;
    onStartShouldSetResponder?: () => boolean;
  };
};

function sheetElement(modal: ElementLike): ElementLike {
  const backdrop = modal.props.children as ElementLike;
  const keyboardWrap = backdrop.props.children as ElementLike;
  return keyboardWrap.props.children as ElementLike;
}

describe("AppModal touch routing", () => {
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
