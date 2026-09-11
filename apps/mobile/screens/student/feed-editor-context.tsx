import { useRouter } from "expo-router";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";
import type { FeedPostView } from "../../lib/feed";

type FeedEditorState = {
  post: FeedPostView | null;
  open: (post: FeedPostView) => void;
  clear: () => void;
};
const FeedEditorContext = createContext<FeedEditorState | null>(null);

/** Transfer the selected native feed item without putting content in route params. */
export function FeedEditorProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [post, setPost] = useState<FeedPostView | null>(null);
  const clear = useCallback(() => setPost(null), []);
  const open = useCallback(
    (next: FeedPostView) => {
      if (!next.canEdit) return;
      setPost(next);
      router.push("/(student)/feed/edit");
    },
    [router],
  );
  return (
    <FeedEditorContext.Provider value={{ post, open, clear }}>
      {children}
    </FeedEditorContext.Provider>
  );
}
export function useFeedEditor() {
  const context = useContext(FeedEditorContext);
  if (!context) throw new Error("FeedEditorProvider is required");
  return context;
}
