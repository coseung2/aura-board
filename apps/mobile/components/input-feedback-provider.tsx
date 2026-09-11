import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";
import { FeedbackToast } from "./FeedbackToast";

type Notice = {
  message: string;
  variant: "success" | "info" | "error";
  id: number;
};
const InputFeedbackContext = createContext<
  (message: string, variant?: Notice["variant"]) => void
>(() => undefined);

/** Keep save feedback visible after an input route returns to its list. */
export function InputFeedbackProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const notify = useCallback(
    (message: string, variant: Notice["variant"] = "success") => {
      setNotice({ message, variant, id: Date.now() });
    },
    [],
  );
  return (
    <InputFeedbackContext.Provider value={notify}>
      {children}
      <FeedbackToast notice={notice} />
    </InputFeedbackContext.Provider>
  );
}

export function useInputFeedback() {
  return useContext(InputFeedbackContext);
}
