import type React from "react";
import type { SongGuessSnapshot, SongGuessTeacherSetup } from "@/lib/song-guess/contracts";
import { SongGuessClientError } from "@/lib/song-guess/browser-client";
import type { GeneratedClipDraft, RoundDraft } from "./song-guess-board-model";

export function emptyRoundDraft(): RoundDraft {
  return {
    clientId: createClientId(),
    representativeAnswer: "",
    aliasesText: "",
    accessibilityClue: "",
    rightsConfirmed: false,
    existingClipAssetIds: null,
    existingClipSummary: [],
    sourceBuffer: null,
    sourceName: null,
    startSeconds: 0,
    generatedClips: null,
  };
}

export function draftsFromSetup(setup: SongGuessTeacherSetup): RoundDraft[] {
  return setup.rounds.map((round) => {
    const clips = [...round.clips].sort((left, right) => left.tierMs - right.tierMs);
    return {
      clientId: `saved-${round.id}`,
      representativeAnswer: round.representativeAnswer,
      aliasesText: round.aliases.join(", "),
      accessibilityClue: round.accessibilityClue ?? "",
      rightsConfirmed: false,
      existingClipAssetIds: clips.map((clip) => clip.id) as [string, string, string],
      existingClipSummary: clips.map((clip) => ({
        tierMs: clip.tierMs,
        durationMs: clip.durationMs,
        sizeBytes: clip.sizeBytes,
      })),
      sourceBuffer: null,
      sourceName: null,
      startSeconds: 0,
      generatedClips: null,
    };
  });
}

export function updateDraft(
  setDrafts: React.Dispatch<React.SetStateAction<RoundDraft[]>>,
  clientId: string,
  patch: Partial<RoundDraft>,
) {
  setDrafts((current) =>
    current.map((draft) => (draft.clientId === clientId ? { ...draft, ...patch } : draft)),
  );
}

export function moveRound(drafts: RoundDraft[], from: number, to: number): RoundDraft[] {
  if (from === to || to < 0 || to >= drafts.length) return drafts;
  const next = [...drafts];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

export function revokeGenerated(clips: GeneratedClipDraft[] | null): void {
  for (const clip of clips ?? []) URL.revokeObjectURL(clip.url);
}

export function revokeDraftUrls(drafts: readonly RoundDraft[]): void {

  for (const draft of drafts) revokeGenerated(draft.generatedClips);
}

export function createClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `round-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function readLocalAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const audio = new Audio();
    let settled = false;
    const cleanup = () => {
      clearTimeout(timeout);
      audio.removeEventListener("loadedmetadata", handleMetadata);
      audio.removeEventListener("error", handleError);
      audio.removeAttribute("src");
      URL.revokeObjectURL(objectUrl);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const handleMetadata = () => {
      const duration = audio.duration;
      finish(() => {
        if (!Number.isFinite(duration) || duration <= 0) reject(new Error("invalid_source_metadata"));
        else resolve(duration);
      });
    };
    const handleError = () => finish(() => reject(new Error("decode_failed")));
    const timeout = window.setTimeout(
      () => finish(() => reject(new Error("decode_failed"))),
      15_000,
    );
    audio.preload = "metadata";
    audio.addEventListener("loadedmetadata", handleMetadata);
    audio.addEventListener("error", handleError);
    audio.src = objectUrl;
  });
}

export async function getAudioContext(
  reference: React.MutableRefObject<AudioContext | null>,
): Promise<AudioContext> {
  let context = reference.current;
  if (!context) {
    context = new AudioContext({ latencyHint: "interactive" });
    reference.current = context;
  }
  if (context.state === "suspended") await context.resume();
  return context;
}

export function stopSourcePreview(reference: React.MutableRefObject<AudioBufferSourceNode | null>) {
  const node = reference.current;
  reference.current = null;
  if (!node) return;
  try {
    node.stop();
  } catch {
    // The node may already have ended.
  }
  try {
    node.disconnect();
  } catch {
    // No-op after browser cleanup.
  }
}

export function phaseLabel(phase: SongGuessSnapshot["phase"]): string {
  switch (phase) {
    case "draft":
      return "세션 준비";
    case "lobby":
      return "로비";
    case "guessing":
      return "정답 입력";
    case "reveal":
      return "정답 공개";
    case "finished":
      return "종료";
  }
}

export function messageForAudioError(code: string): string {
  switch (code) {
    case "empty_source_file":
      return "빈 음원 파일은 사용할 수 없어요.";
    case "source_file_too_large":
      return "음원 파일이 너무 커요. 30MB 이하 파일을 선택해 주세요.";
    case "source_audio_too_short":
      return "1.5초보다 짧은 음원은 사용할 수 없어요.";
    case "source_audio_too_long":
      return "15분을 넘는 음원은 브라우저 메모리 보호를 위해 사용할 수 없어요.";
    case "invalid_source_metadata":
    case "invalid_decoded_audio":
    case "decode_failed":
      return "브라우저가 이 음원을 해석하지 못했어요. 다른 오디오 파일을 선택해 주세요.";
    case "start_too_close_to_end":
      return "시작 지점 뒤에 1.5초 분량이 남도록 조정해 주세요.";
    default:
      return `파생 클립을 만들지 못했어요 (${code}).`;
  }
}

export function messageForError(error: unknown): string {
  if (error instanceof SongGuessClientError) {
    switch (error.body.error) {
      case "song_guess_setup_locked":
        return "현재 게임 세션이 있어 라운드 편집이 잠겼어요.";
      case "song_guess_clip_assigned":
        return "이미 저장된 라운드의 클립은 개별 정리할 수 없어요.";
      case "song_guess_clip_assignment_conflict":
        return "임시 클립 정리와 저장이 겹쳤어요. 라운드 구성을 다시 확인해 주세요.";
      case "invalid_phase":
      case "domain_rejected":
        return "지금 단계에서는 그 동작을 할 수 없어요. 최신 상태를 확인해 주세요.";
      case "forbidden":
        return "이 음악 퀴즈를 조작할 권한이 없어요.";
      case "play_engine_unavailable":
        return "게임 서버에 연결할 수 없어요. 미확인 요청은 같은 ID로 다시 보낼 수 있어요.";
      case "idempotency_key_reuse":
        return "요청 식별자가 충돌했어요. 최신 상태에서 다시 시도해 주세요.";
      default:
        return `음악 퀴즈 요청을 처리하지 못했어요 (${error.body.error}).`;
    }
  }
  if (error instanceof Error) {
    switch (error.message) {
      case "rights_confirmation_required":
        return "새 파생 클립을 저장하려면 음원 사용 권한을 확인해 주세요.";
      case "clips_not_generated":
        return "선택한 시작 지점으로 세 개의 파생 클립을 먼저 만들어 주세요.";
      case "audio_source_required":
        return "모든 라운드에 음원 또는 저장된 파생 클립이 필요해요.";
      case "representative_answer_required":
        return "모든 라운드의 대표 정답을 입력해 주세요.";
      case "representative_answer_too_long":
      case "alias_too_long":
      case "too_many_aliases":
      case "accessibility_clue_too_long":
        return "정답, 별칭, 접근성 단서의 길이와 개수를 확인해 주세요.";
      case "three_clips_required":
        return "각 라운드에는 0.5초·1.0초·1.5초 WAV 파생 클립이 모두 필요해요.";
      case "round_required":
        return "한 곡 이상 추가해 주세요.";
      case "too_many_rounds":
        return "라운드는 최대 50개까지 저장할 수 있어요.";
      default:
        if (error.message.startsWith("invalid_")) return `입력값을 확인해 주세요 (${error.message}).`;
    }
  }
  return "네트워크 연결을 확인해 주세요. 업로드에 실패한 임시 파생 클립은 정리되고 다시 시도할 수 있어요.";
}
