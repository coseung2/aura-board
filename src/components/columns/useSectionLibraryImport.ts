"use client";

import { useCallback, useState } from "react";

import { useToast } from "@/components/ui/Toast";
import type { ColumnsSection } from "./columns-board-types";

type ImportResult = {
  created?: number;
  reused?: number;
  failed?: number;
  error?: string;
};

export function useSectionLibraryImport(sections: ColumnsSection[]) {
  const [libraryAddingSectionId, setLibraryAddingSectionId] = useState<string | null>(null);
  const toast = useToast();

  const handleAddToLibrary = useCallback(
    async (sectionId: string) => {
      if (libraryAddingSectionId) return;
      const section = sections.find((item) => item.id === sectionId);
      if (!section) return;
      setLibraryAddingSectionId(sectionId);
      const pendingToastId = toast.show({
        variant: "info",
        message: `“${section.title}” 자료를 라이브러리에 추가하는 중입니다.`,
        duration: 120_000,
      });
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
          toast.dismiss(pendingToastId);
          toast.show({
            variant: "error",
            message: failed
              ? `추가할 수 있는 자료를 찾지 못했습니다. 이미지 ${failed}개를 처리하지 못했습니다.`
              : "이 컬럼에서 추가할 이미지나 Canva 디자인을 찾지 못했습니다.",
          });
          return;
        }
        toast.dismiss(pendingToastId);
        toast.show({
          variant: failed ? "info" : "success",
          message: `“${section.title}” 추가 완료 · 새 자료 ${created}개${reused ? ` · 기존 자료 ${reused}개` : ""}${failed ? ` · 실패 ${failed}개` : ""}`,
          duration: failed ? 5_000 : 3_000,
        });
      } catch (error) {
        console.error("[handleAddToLibrary]", error);
        toast.dismiss(pendingToastId);
        toast.show({
          variant: "error",
          message: "라이브러리에 추가하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          duration: 5_000,
        });
      } finally {
        setLibraryAddingSectionId(null);
      }
    },
    [libraryAddingSectionId, sections, toast],
  );

  return { libraryAddingSectionId, handleAddToLibrary };
}
