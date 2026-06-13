"use client";

import { useRef, useState } from "react";
import { MAX_ATTACHMENTS_PER_CARD } from "@/lib/file-attachment";
import { uploadFile } from "@/lib/upload-client";

export type AttachmentDraft = {
  /** 클라이언트 전용 식별자(DB id 아님). React key용. */
  tempId: string;
  kind: "image" | "video" | "file" | "link";
  url: string;
  previewUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
};

function mintId(): string {
  return `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useCardAttachments(initialAttachments: AttachmentDraft[] = []) {
  const [attachments, setAttachments] = useState<AttachmentDraft[]>(initialAttachments);
  const [uploading, setUploading] = useState(false);
  // setAttachments는 async 스냅샷이라 for-loop 내부에서 최신 길이 알기 어려움.
  // 상한 체크용 ref로 현재 리스트 동기 스냅샷 유지.
  const attachmentsRef = useRef<AttachmentDraft[]>(initialAttachments);

  function pushAttachment(draft: AttachmentDraft) {
    setAttachments((prev) => {
      const next = [...prev, draft];
      attachmentsRef.current = next;
      return next;
    });
  }

  async function uploadOne(
    file: File,
    kind: AttachmentDraft["kind"]
  ): Promise<
    { ok: true; draft: AttachmentDraft } | { ok: false; reason: string }
  > {
    try {
      const data = await uploadFile(file);
      return {
        ok: true,
        draft: {
          tempId: mintId(),
          kind,
          url: data.url,
          previewUrl: data.previewUrl ?? null,
          fileName: data.name,
          fileSize: data.size,
          mimeType: data.mimeType,
        },
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "업로드 실패";
      console.error(`[upload ${kind}] ${file.name}: ${msg}`);
      return { ok: false, reason: msg };
    }
  }

  // 여러 파일 순차 업로드 — 브라우저 메모리 & 서버 레이트 보수적으로.
  // 입력 파일은 이름순으로 정렬 후 업로드해 attachment 저장 순서도 이름순.
  async function uploadMany(files: File[], kind: AttachmentDraft["kind"]) {
    setUploading(true);
    const failures: string[] = [];
    // 사용자가 선택한 파일을 한글/숫자 혼합 파일명에 대해 자연스럽게 정렬
    // (예: "01차시"<"02차시"<"10차시"). localeCompare + numeric:true가 그 역할.
    const sorted = [...files].sort((a, b) =>
      a.name.localeCompare(b.name, "ko", {
        numeric: true,
        sensitivity: "base",
      })
    );
    for (const f of sorted) {
      if (attachmentsRef.current.length >= MAX_ATTACHMENTS_PER_CARD) {
        failures.push(
          `${f.name}: 첨부 최대 ${MAX_ATTACHMENTS_PER_CARD}개 초과`
        );
        continue;
      }
      const r = await uploadOne(f, kind);
      if (r.ok) pushAttachment(r.draft);
      else failures.push(`${f.name}: ${r.reason}`);
    }
    setUploading(false);
    if (failures.length > 0) {
      alert(
        `일부 업로드 실패 (${failures.length}/${files.length}):\n\n${failures.join("\n")}`
      );
    }
  }

  function addLibraryImage(url: string) {
    if (attachmentsRef.current.length >= MAX_ATTACHMENTS_PER_CARD) {
      alert(
        `첨부는 카드당 최대 ${MAX_ATTACHMENTS_PER_CARD}개까지 가능합니다.`
      );
      return false;
    }
    pushAttachment({ tempId: mintId(), kind: "image", url, previewUrl: url });
    return true;
  }

  // multi-link-attach (2026-06-13): link 첨부 추가. fileName=제목,
  // mimeType=설명, previewUrl=OG 이미지로 재활용. 중복 URL은 거부.
  function addLink(input: {
    url: string;
    title?: string | null;
    description?: string | null;
    image?: string | null;
  }): { ok: true; tempId: string } | { ok: false; reason: string } {
    const url = input.url.trim();
    if (!url) return { ok: false, reason: "URL이 비어있어요" };
    if (attachmentsRef.current.some((a) => a.kind === "link" && a.url === url)) {
      return { ok: false, reason: "이미 추가된 링크예요" };
    }
    if (attachmentsRef.current.length >= MAX_ATTACHMENTS_PER_CARD) {
      return { ok: false, reason: `최대 ${MAX_ATTACHMENTS_PER_CARD}개까지 첨부 가능` };
    }
    const tempId = mintId();
    pushAttachment({
      tempId,
      kind: "link",
      url,
      previewUrl: input.image ?? null,
      fileName: input.title ?? null,
      mimeType: input.description ?? null,
    });
    return { ok: true, tempId };
  }

  function removeAttachment(tempId: string) {
    if (!tempId) return;
    setAttachments((prev) => {
      const next = prev.filter((a) => a.tempId !== tempId);
      attachmentsRef.current = next;
      return next;
    });
  }

  /** 같은 kind 내에서 위/아래로 이동. 카드에 저장되는 최종 order는 서버
   *  트랜잭션이 배열 인덱스로 매긴다(AddCardModal → payloadAttachments →
   *  /api/cards에서 idx를 order로 사용). */
  function moveAttachment(tempId: string, dir: -1 | 1) {
    if (!tempId) return;
    setAttachments((prev) => {
      const idx = prev.findIndex((a) => a.tempId === tempId);
      if (idx < 0) return prev;
      const kind = prev[idx].kind;
      // 같은 kind의 이웃을 찾아 교체. kind 간 순서는 건드리지 않음 —
      // 렌더도 kind별 섹션으로 분리되므로 kind 내 재배치만 의미 있음.
      const sameKindIndices = prev
        .map((a, i) => (a.kind === kind ? i : -1))
        .filter((i) => i >= 0);
      const pos = sameKindIndices.indexOf(idx);
      const swapPos = pos + dir;
      if (swapPos < 0 || swapPos >= sameKindIndices.length) return prev;
      const j = sameKindIndices[swapPos];
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      attachmentsRef.current = next;
      return next;
    });
  }

  function isFirstOfKind(tempId: string): boolean {
    const target = attachments.find((x) => x.tempId === tempId);
    if (!target) return false;
    const sameKind = attachments.filter((a) => a.kind === target.kind);
    return sameKind[0]?.tempId === tempId;
  }

  function isLastOfKind(tempId: string): boolean {
    const target = attachments.find((x) => x.tempId === tempId);
    if (!target) return false;
    const sameKind = attachments.filter((a) => a.kind === target.kind);
    return sameKind[sameKind.length - 1]?.tempId === tempId;
  }

  const totalCount = attachments.length;
  const canAddMore = totalCount < MAX_ATTACHMENTS_PER_CARD;
  const countByKind = (kind: AttachmentDraft["kind"]) =>
    attachments.filter((a) => a.kind === kind).length;

  return {
    attachments,
    uploading,
    totalCount,
    canAddMore,
    countByKind,
    uploadMany,
    addLibraryImage,
    addLink,
    removeAttachment,
    moveAttachment,
    isFirstOfKind,
    isLastOfKind,
  };
}
