"use client";

import { useCallback, useState } from "react";

import type { ColumnsSection } from "./columns-board-types";

type ImportResult = {
  created?: number;
  reused?: number;
  failed?: number;
  error?: string;
};

export function useSectionLibraryImport(sections: ColumnsSection[]) {
  const [libraryAddingSectionId, setLibraryAddingSectionId] = useState<string | null>(null);

  const handleAddToLibrary = useCallback(
    async (sectionId: string) => {
      if (libraryAddingSectionId) return;
      const section = sections.find((item) => item.id === sectionId);
      if (!section) return;
      setLibraryAddingSectionId(sectionId);
      try {
        const response = await fetch("/api/teacher/library/import-section", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sectionId }),
        });
        const body = (await response.json().catch(() => null)) as ImportResult | null;
        if (!response.ok) throw new Error(body?.error || "library_import_failed");

        const created = body?.created ?? 0;
        const reused = body?.reused ?? 0;
        const failed = body?.failed ?? 0;
        if (created === 0 && reused === 0) {
          alert("이 컬럼에서 라이브러리에 추가할 이미지나 Canva 디자인을 찾지 못했습니다.");
          return;
        }
        alert(
          `“${section.title}”을 라이브러리에 추가했습니다.\n새 자료 ${created}개${reused ? ` · 기존 자료 ${reused}개` : ""}${failed ? ` · 실패 ${failed}개` : ""}`,
        );
      } catch (error) {
        console.error("[handleAddToLibrary]", error);
        alert("라이브러리에 추가하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        setLibraryAddingSectionId(null);
      }
    },
    [libraryAddingSectionId, sections],
  );

  return { libraryAddingSectionId, handleAddToLibrary };
}
