/**
 * Zod schemas + shared types for plant journal feature (PJ-1~6).
 */
import { z } from "zod";

export const NicknameSchema = z.string().trim().min(1, "별명을 입력해 주세요").max(20, "별명은 20자 이내");
export const MemoSchema = z.string().max(500, "메모는 500자 이내");
export const ReasonSchema = z.string().trim().max(200, "사유는 200자 이내");

export const ImageRefSchema = z.object({
  url: z.string().min(1),
  thumbnailUrl: z.string().nullable().optional(),
});

export const CreateStudentPlantSchema = z.object({
  boardId: z.string().min(1),
  speciesId: z.string().min(1),
  nickname: NicknameSchema,
});

export const CreateObservationSchema = z.object({
  stageId: z.string().min(1),
  memo: MemoSchema.optional().default(""),
  noPhotoReason: ReasonSchema.optional(),
  images: z.array(ImageRefSchema).max(10, "사진은 10장까지").optional().default([]),
}).refine(
  (d) => (d.memo && d.memo.length > 0) || d.images.length > 0 || (d.noPhotoReason && d.noPhotoReason.length > 0),
  { message: "메모·사진·사유 중 하나는 필요해요" }
);

export const PatchObservationSchema = z.object({
  memo: MemoSchema.optional(),
  images: z.array(ImageRefSchema).max(10).optional(),
});

export const AdvanceStageSchema = z.object({
  noPhotoReason: ReasonSchema.optional(),
});

export const AllowListSchema = z.object({
  speciesIds: z.array(z.string().min(1)),
});

export const PatchStudentPlantSchema = z.object({
  nickname: NicknameSchema,
});

export const STALL_THRESHOLD_DAYS = 7;

export type ParsedStage = {
  id: string;
  order: number;
  key: string;
  nameKo: string;
  description: string;
  icon: string;
  observationPoints: string[];
};

export function parseObservationPoints(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
