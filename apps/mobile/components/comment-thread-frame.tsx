import type { ReactNode } from "react";
import { useInputPageExit } from "../hooks/use-input-page-exit";
import { styles } from "./comment-bottom-sheet.styles";
import { InputPage } from "./input-page";
import { AppBottomSheet } from "./ui";

export function CommentThreadFrame({
  page,
  dirty,
  busy,
  visible,
  onClose,
  children,
  overlay,
}: {
  page: boolean;
  dirty: boolean;
  busy: boolean;
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  overlay?: ReactNode;
}) {
  const exit = useInputPageExit(page && dirty, page && busy);
  if (page)
    return (
      <InputPage title="댓글" onBack={exit.back}>
        {children}
        {overlay}
      </InputPage>
    );
  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      sheetStyle={styles.sheet}
      accessibilityLabel="댓글"
      keyboardAvoiding
      overlay={overlay}
    >
      {children}
    </AppBottomSheet>
  );
}
