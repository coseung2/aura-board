import { useParentPostCollection } from "./use-parent-feed";

type Options = {
  childId: string | null;
  kind: "media" | "text";
  onUnauthorized: () => void | Promise<void>;
};

export function useParentChildPosts({ childId, kind, onUnauthorized }: Options) {
  const endpoint = childId
    ? `/api/parent/children/${encodeURIComponent(childId)}/posts?kind=${kind}`
    : null;
  return useParentPostCollection({ endpoint, onUnauthorized, includeCounts: true });
}
