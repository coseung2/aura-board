import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiFetch, ApiError } from "../lib/api";
import { clearSessionToken } from "../lib/session";
import type { MeResponse } from "../lib/types";
import { uploadImage } from "../lib/plant-api";
import {
  inspectionPhotoBlocksSave,
  inspectionPhotoPreviewUri,
  type InspectionPhotoStatus,
} from "../lib/student-inspection";
import {
  borders,
  colors,
  plant,
  radii,
  spacing,
  studentNav,
  tapMin,
  typography,
} from "../theme/tokens";
import {
  AppButton,
  AppHeader,
  ControlPressable,
  EmptyState,
  Pill,
  SurfaceCard,
  SectionHeader,
  TextField,
} from "./ui";

type Mode = "cleaning" | "shoes";
type RosterEntry = {
  student: { id: string; name: string; number: number | null };
  seatLabel?: string | null;
  finding: {
    dirty?: boolean;
    notArranged?: boolean;
    note?: string | null;
    photoUrl?: string | null;
  } | null;
};
type Payload = { date: string; roster: RosterEntry[] };
type Draft = {
  flagged: boolean;
  note: string;
  photoUrl: string | null;
  localPhotoUri: string | null;
  photoStatus: InspectionPhotoStatus;
  photoError: string | null;
};

const EMPTY_DRAFT: Draft = {
  flagged: false,
  note: "",
  photoUrl: null,
  localPhotoUri: null,
  photoStatus: "idle",
  photoError: null,
};

export function StudentInspectionScreen({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useLocalSearchParams<{ classroomId?: string | string[] }>();
  const routeClassroomId = firstParam(params.classroomId);
  const [classroomId, setClassroomId] = useState<string | null>(null);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleAuthError = useCallback(async (nextError: unknown) => {
    if (nextError instanceof ApiError && nextError.status === 401) {
      await clearSessionToken();
      router.replace("/(student)/login");
      return true;
    }
    return false;
  }, [router]);

  const resolveClassroomId = useCallback(async () => {
    if (routeClassroomId) return routeClassroomId;
    const me = await apiFetch<MeResponse>("/api/student/me");
    const roleKey = mode === "cleaning" ? "cleaning-inspector" : "shoe-inspector";
    return me.duties?.find((duty) => duty.roleKey === roleKey)?.classroomId ?? null;
  }, [mode, routeClassroomId]);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const resolved = await resolveClassroomId();
      if (!resolved) {
        setError("검사할 학급 정보를 찾을 수 없어요.");
        return;
      }
      const next = await apiFetch<Payload>(
        `/api/classrooms/${encodeURIComponent(resolved)}/inspections/${mode}`,
      );
      setClassroomId(resolved);
      setPayload(next);
      setDraft(Object.fromEntries(next.roster.map((entry) => [
        entry.student.id,
        {
          flagged: mode === "cleaning"
            ? entry.finding?.dirty === true
            : entry.finding?.notArranged === true,
          note: entry.finding?.note ?? "",
          photoUrl: entry.finding?.photoUrl ?? null,
          localPhotoUri: null,
          photoStatus: "idle",
          photoError: null,
        },
      ])));
    } catch (nextError) {
      if (!(await handleAuthError(nextError))) setError("검사 명단을 불러오지 못했어요.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [handleAuthError, mode, resolveClassroomId]);

  useEffect(() => {
    void load();
  }, [load]);

  const flaggedCount = useMemo(
    () => Object.values(draft).filter((entry) => entry.flagged).length,
    [draft],
  );
  const photoSaveBlocked = useMemo(
    () => Object.values(draft).some(inspectionPhotoBlocksSave),
    [draft],
  );

  function update(studentId: string, patch: Partial<Draft>) {
    setDraft((current) => ({
      ...current,
      [studentId]: {
        ...(current[studentId] ?? EMPTY_DRAFT),
        ...patch,
      },
    }));
    setNotice(null);
  }

  async function pickCleaningPhoto(studentId: string) {
    if (mode !== "cleaning") return;
    setError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        update(studentId, {
          photoStatus: "permission-denied",
          photoError: "사진을 선택하려면 사진 보관함 권한이 필요해요.",
        });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.85,
      });
      const asset = result.assets?.[0];
      if (result.canceled || !asset?.uri) return;
      update(studentId, {
        flagged: true,
        localPhotoUri: asset.uri,
        photoStatus: "uploading",
        photoError: null,
      });
      await uploadCleaningPhoto(studentId, asset.uri);
    } catch (nextError) {
      if (await handleAuthError(nextError)) return;
      update(studentId, {
        photoStatus: "error",
        photoError: "사진을 선택하지 못했어요. 다시 시도해 주세요.",
      });
    }
  }

  async function uploadCleaningPhoto(studentId: string, uri: string) {
    update(studentId, {
      flagged: true,
      localPhotoUri: uri,
      photoStatus: "uploading",
      photoError: null,
    });
    try {
      const url = await uploadImage(uri);
      update(studentId, {
        photoUrl: url,
        localPhotoUri: null,
        photoStatus: "idle",
        photoError: null,
      });
    } catch (nextError) {
      if (await handleAuthError(nextError)) return;
      update(studentId, {
        photoStatus: "error",
        photoError: "사진을 업로드하지 못했어요. 다시 시도해 주세요.",
      });
    }
  }

  function removeCleaningPhoto(studentId: string) {
    update(studentId, {
      photoUrl: null,
      localPhotoUri: null,
      photoStatus: "idle",
      photoError: null,
    });
  }

  async function save() {
    if (!classroomId || !payload) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const findings = payload.roster.map((entry) => {
        const value = draft[entry.student.id] ?? EMPTY_DRAFT;
        return mode === "cleaning"
          ? {
              studentId: entry.student.id,
              dirty: value.flagged,
              note: value.note.trim() || null,
              photoUrl: value.flagged ? value.photoUrl : null,
            }
          : { studentId: entry.student.id, notArranged: value.flagged };
      });
      await apiFetch(
        `/api/classrooms/${encodeURIComponent(classroomId)}/inspections/${mode}`,
        { method: "POST", json: { date: payload.date, findings } },
      );
      setNotice("저장했어요.");
      await load(true);
    } catch (nextError) {
      if (!(await handleAuthError(nextError))) setError("검사 결과를 저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }

  const title = mode === "cleaning" ? "청소 검사" : "실내화 정리 검사";
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader title={title} onBack={() => router.back()} />
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      ) : error && !payload ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <AppButton onPress={() => void load()}>다시 시도</AppButton>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={colors.accent}
            />
          }
        >
          <SectionHeader
            title={title}
            titleAccessory={
              payload?.date ? <Text style={styles.subtitle}>{payload.date}</Text> : undefined
            }
            right={
              <Pill tone={flaggedCount > 0 ? "danger" : "accent"}>
                지적 {flaggedCount}/{payload?.roster.length ?? 0}
              </Pill>
            }
          />
          {!payload?.roster.length ? (
            <EmptyState title="검사할 학생이 없어요." />
          ) : payload.roster.map((entry) => {
            const value = draft[entry.student.id] ?? EMPTY_DRAFT;
            const previewUri = inspectionPhotoPreviewUri(value);
            return (
              <SurfaceCard key={entry.student.id} style={styles.row}>
                <ControlPressable
                  style={styles.toggle}
                  onPress={() => update(entry.student.id, { flagged: !value.flagged })}
                  accessibilityState={{ selected: value.flagged }}
                >
                  <Text style={styles.number}>{entry.student.number ?? "-"}</Text>
                  <View style={styles.studentText}>
                    <Text style={styles.name}>{entry.student.name}</Text>
                    {entry.seatLabel ? <Text style={styles.subtitle}>자리 {entry.seatLabel}</Text> : null}
                  </View>
                  <Pill tone={value.flagged ? "danger" : "submitted"}>
                    {value.flagged ? (mode === "cleaning" ? "지적" : "정리 안 됨") : "정상"}
                  </Pill>
                </ControlPressable>
                {mode === "cleaning" && value.flagged ? (
                  <View style={styles.cleaningEvidence}>
                    <TextField
                      value={value.note}
                      onChangeText={(note) => update(entry.student.id, { note })}
                      placeholder="메모"
                      maxLength={200}
                    />
                    {previewUri ? (
                      <View style={styles.photoPreviewWrap}>
                        <Image
                          source={{ uri: previewUri }}
                          style={styles.photoPreview}
                          resizeMode="cover"
                          accessibilityLabel={`${entry.student.name} 청소 검사 사진`}
                        />
                        {value.photoStatus === "uploading" ? (
                          <View style={styles.photoOverlay}>
                            <ActivityIndicator color={colors.onAccent} />
                            <Text style={styles.photoOverlayText}>업로드 중</Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                    <View style={styles.photoActions}>
                      <AppButton
                        variant="secondary"
                        disabled={value.photoStatus === "uploading"}
                        onPress={() => void pickCleaningPhoto(entry.student.id)}
                      >
                        {previewUri ? "사진 바꾸기" : "사진 선택"}
                      </AppButton>
                      {previewUri ? (
                        <AppButton
                          variant="quiet"
                          disabled={value.photoStatus === "uploading"}
                          onPress={() => removeCleaningPhoto(entry.student.id)}
                        >
                          사진 제거
                        </AppButton>
                      ) : null}
                    </View>
                    {value.photoStatus === "error" ? (
                      <View style={styles.photoStatusRow}>
                        <Text style={styles.photoError}>{value.photoError}</Text>
                        <AppButton
                          variant="secondary"
                          onPress={() => {
                            if (value.localPhotoUri) {
                              void uploadCleaningPhoto(entry.student.id, value.localPhotoUri);
                            } else {
                              void pickCleaningPhoto(entry.student.id);
                            }
                          }}
                        >
                          다시 시도
                        </AppButton>
                      </View>
                    ) : null}
                    {value.photoStatus === "permission-denied" ? (
                      <View style={styles.photoStatusRow}>
                        <Text style={styles.photoError}>{value.photoError}</Text>
                        <AppButton variant="secondary" onPress={() => void Linking.openSettings()}>
                          설정 열기
                        </AppButton>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </SurfaceCard>
            );
          })}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {photoSaveBlocked ? (
            <Text style={styles.photoSaveNotice}>
              사진 업로드를 완료하거나 실패한 사진을 제거한 뒤 저장해 주세요.
            </Text>
          ) : null}
          <AppButton
            loading={saving}
            disabled={photoSaveBlocked}
            onPress={() => void save()}
          >
            검사 결과 저장
          </AppButton>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function firstParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  content: { padding: spacing.xl, gap: spacing.md },
  subtitle: { ...typography.micro, color: colors.textMuted },
  row: { padding: spacing.sm, gap: spacing.sm },
  toggle: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.sm,
  },
  number: { ...typography.label, color: colors.textMuted, width: studentNav.inspectionNumberWidth },
  studentText: { flex: 1 },
  name: { ...typography.section, color: colors.text },
  error: { ...typography.body, color: colors.danger },
  notice: { ...typography.body, color: colors.statusReviewedText },
  cleaningEvidence: { gap: spacing.sm },
  photoPreviewWrap: {
    position: "relative",
    alignSelf: "flex-start",
    width: plant.editorImageSize,
    height: plant.editorImageSize,
    borderRadius: radii.btn,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  photoPreview: {
    width: "100%",
    height: "100%",
    backgroundColor: colors.surfaceAlt,
  },
  photoOverlay: {
    position: "absolute",
    inset: spacing.none,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.overlay,
  },
  photoOverlayText: { ...typography.micro, color: colors.onAccent },
  photoActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  photoStatusRow: { gap: spacing.sm },
  photoError: { ...typography.micro, color: colors.danger },
  photoSaveNotice: { ...typography.micro, color: colors.warningTintedText },
});
