export type InspectionPhotoStatus =
  | "idle"
  | "uploading"
  | "error"
  | "permission-denied";

export type InspectionPhotoDraft = {
  photoUrl: string | null;
  localPhotoUri: string | null;
  photoStatus: InspectionPhotoStatus;
};

export function inspectionPhotoPreviewUri(
  draft: Pick<InspectionPhotoDraft, "photoUrl" | "localPhotoUri">,
): string | null {
  return draft.localPhotoUri ?? draft.photoUrl;
}
export function inspectionPhotoBlocksSave(
  draft: Pick<InspectionPhotoDraft, "photoStatus" | "localPhotoUri">,
): boolean {
  return (
    draft.photoStatus === "uploading" ||
    (draft.photoStatus === "error" && draft.localPhotoUri !== null)
  );
}
