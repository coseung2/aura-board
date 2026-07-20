// 식물관찰일지 전용 API 클라이언트.
// 웹의 usePlantMutations 훅과 동일한 엔드포인트를 호출한다.
import { apiFetch } from "./api";
import type { PlantJournalResponse, StudentPlantDTO, ObservationDTO } from "./types";

// ─── 조회 ───

/** 보드 기반 식물 일지 전체 조회 (학생 세션) */
export async function fetchPlantJournal(boardId: string): Promise<PlantJournalResponse> {
  return apiFetch<PlantJournalResponse>(`/api/boards/${boardId}/plant-journal`);
}

/** 개별 식물 상세 조회 (refresh용) */
export async function fetchStudentPlant(plantId: string): Promise<{ studentPlant: StudentPlantDTO }> {
  return apiFetch<{ studentPlant: StudentPlantDTO }>(`/api/student-plants/${plantId}`);
}

// ─── 관찰 기록 CRUD ───

export interface CreateObservationPayload {
  stageId: string;
  memo: string;
  images: Array<{ url: string }>;
}

/** 관찰 기록 추가 */
export async function createObservation(
  plantId: string,
  payload: CreateObservationPayload,
): Promise<void> {
  await apiFetch(`/api/student-plants/${plantId}/observations`, {
    method: "POST",
    json: payload,
  });
}

export interface UpdateObservationPayload {
  memo: string;
  images: Array<{ url: string }>;
}

/** 관찰 기록 수정 */
export async function updateObservation(
  plantId: string,
  observationId: string,
  payload: UpdateObservationPayload,
): Promise<void> {
  await apiFetch(`/api/student-plants/${plantId}/observations/${observationId}`, {
    method: "PATCH",
    json: payload,
  });
}

/** 관찰 기록 삭제 */
export async function deleteObservation(
  plantId: string,
  observationId: string,
): Promise<void> {
  await apiFetch(`/api/student-plants/${plantId}/observations/${observationId}`, {
    method: "DELETE",
  });
}

// ─── 단계 진행 ───

export interface AdvanceStageResult {
  needsReason: boolean;
  message?: string;
}

/** 다음 단계로 진행 */
export async function advanceStage(
  plantId: string,
  noPhotoReason?: string,
): Promise<AdvanceStageResult> {
  try {
    await apiFetch(`/api/student-plants/${plantId}/advance-stage`, {
      method: "POST",
      json: noPhotoReason ? { noPhotoReason } : {},
    });
    return { needsReason: false };
  } catch (error: unknown) {
    const err = error as { status?: number; body?: { needsReason?: boolean; message?: string } };
    if (err.status === 422 && err.body?.needsReason) {
      return { needsReason: true, message: err.body.message };
    }
    throw error;
  }
}

// ─── 별명 수정 ───

/** 식물 별명 수정 */
export async function updateNickname(
  plantId: string,
  nickname: string,
): Promise<StudentPlantDTO> {
  const res = await apiFetch<{ studentPlant: StudentPlantDTO }>(
    `/api/student-plants/${plantId}`,
    { method: "PATCH", json: { nickname } },
  );
  return res.studentPlant;
}

// ─── 이미지 업로드 ───

/** 이미지 업로드 (multipart/form-data) → URL 반환 */
export async function uploadImage(uri: string): Promise<string> {
  const formData = new FormData();
  const filename = uri.split("/").pop() ?? "photo.jpg";
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : "image/jpeg";

  formData.append("file", {
    uri,
    name: filename,
    type,
  } as unknown as Blob);

  const res = await apiFetch<{ url: string }>("/api/upload", {
    method: "POST",
    body: formData,
  });
  return res.url;
}
