import { useEffect, useRef, useState } from "react";

export type RewardFeedback = { status: "paid" | "excluded" | "pending" | "unavailable"; message: string; amount?: number };
export function useCommentRewardFeedback(request: (path: string) => Promise<RewardFeedback>) {
  const [notice, setNotice] = useState<{ message: string; variant: "success" | "info" | "error"; id: number } | null>(null);
  const sequence = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => () => { sequence.current++; for (const timer of timers.current) clearTimeout(timer); }, []);
  const show = (message: string, variant: "success" | "info" | "error" = "info") => setNotice({ message, variant, id: Date.now() });
  async function track(cardId: string, commentId: string) {
    const version = ++sequence.current;
    show("댓글은 등록됐어요. 보상 지급 여부를 확인 중이에요.");
    const path = `/api/cards/${encodeURIComponent(cardId)}/comments/${encodeURIComponent(commentId)}/reward`;
    const poll = async (attempt: number) => {
      if (version !== sequence.current) return;
      try {
        const result = await request(path);
        if (version !== sequence.current) return;
        if (result.status !== "pending") { show(result.message, result.status === "paid" ? "success" : "info"); return; }
      } catch { /* Reconcile transient failures within the bounded window. */ }
      if (version !== sequence.current) return;
      if (attempt >= 18) { show("보상 확인이 지연되고 있어요. 잠시 후 내 통장을 확인해 주세요."); return; }
      const timer = setTimeout(() => { timers.current.delete(timer); void poll(attempt + 1); }, 5000);
      timers.current.add(timer);
    };
    await poll(0);
  }
  return { notice, show, track };
}
