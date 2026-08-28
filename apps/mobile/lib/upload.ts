import { apiFetch, ApiError } from "./api";

export type MobileUploadResult = {
  url: string;
  previewUrl?: string | null;
  type: "image" | "video" | "file";
  name: string;
  size: number;
  mimeType: string;
};

type UploadResponse = Partial<MobileUploadResult> & {
  error?: string;
  code?: string;
};

/** Shared multipart uploader for picker/document URIs. */
export async function uploadMobileFile(input: {
  uri: string;
  name: string;
  mimeType: string;
  timeoutMs?: number;
}): Promise<MobileUploadResult> {
  const formData = new FormData();
  formData.append("file", {
    uri: input.uri,
    name: input.name,
    type: input.mimeType,
  } as unknown as Blob);

  let body: UploadResponse;
  try {
    body = await apiFetch<UploadResponse>("/api/upload", {
      method: "POST",
      body: formData,
      timeoutMs: input.timeoutMs ?? 30_000,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      const response = error.body as { error?: unknown } | null;
      const message = typeof response?.error === "string" ? response.error : null;
      if (message) throw new Error(message);
    }
    throw error;
  }

  if (!body.url || !body.type || !body.name || !body.mimeType) {
    throw new Error("업로드 응답이 올바르지 않아요. 다시 시도해 주세요.");
  }

  return {
    url: body.url,
    previewUrl: body.previewUrl ?? null,
    type: body.type,
    name: body.name,
    size: body.size ?? 0,
    mimeType: body.mimeType,
  };
}

export async function uploadMobileImage(input: {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
  timeoutMs?: number;
}): Promise<MobileUploadResult> {
  const name = input.name?.trim() || filenameFromUri(input.uri) || `image-${Date.now()}.jpg`;
  return uploadMobileFile({
    uri: input.uri,
    name,
    mimeType: input.mimeType || mimeFromFilename(name),
    timeoutMs: input.timeoutMs,
  });
}

function filenameFromUri(uri: string): string | null {
  const value = uri.split(/[?#]/u)[0]?.split("/").pop()?.trim();
  return value && value.includes(".") ? value : null;
}

function mimeFromFilename(name: string): string {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "gif") return "image/gif";
  if (extension === "webp") return "image/webp";
  if (extension === "heic") return "image/heic";
  if (extension === "heif") return "image/heif";
  return "image/jpeg";
}
