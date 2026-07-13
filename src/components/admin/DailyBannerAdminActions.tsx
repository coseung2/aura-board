"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DailyBannerAdminActions({ publicationId }: { publicationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unpublish() {
    if (!confirm("이 배너 게시를 취소할까요? 신청작은 다시 심사 대기로 돌아갑니다.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/daily-banners/${encodeURIComponent(publicationId)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error(`status ${response.status}`);
      router.refresh();
    } catch {
      setError("게시를 취소하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-banner-actions">
      <button type="button" className="admin-banner-unpublish" onClick={unpublish} disabled={busy}>
        {busy ? "취소 중…" : "게시 취소"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
