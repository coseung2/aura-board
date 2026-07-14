import { useCallback, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  borders,
  colors,
  controls,
  iconSizes,
  plant,
  radii,
  spacing,
  typography,
} from "../../theme/tokens";
import * as ImagePicker from "expo-image-picker";
import { PlantHero } from "../plant/PlantHero";
import { StageRow } from "../plant/StageRow";
import { ImageLightbox } from "../plant/ImageLightbox";
import { ObservationEditor } from "../plant/ObservationEditor";
import { NoPhotoReasonModal } from "../plant/NoPhotoReasonModal";
import { AppButton, AppModal, ControlPressable } from "../ui";
import type {
  BoardDetailResponse,
  ObservationDTO,
  StageDTO,
  StudentPlantDTO,
} from "../../lib/types";
import {
  fetchStudentPlant,
  createObservation,
  updateObservation as apiUpdateObservation,
  deleteObservation as apiDeleteObservation,
  advanceStage,
  uploadImage,
} from "../../lib/plant-api";

// ─── 유틸 ───

function groupObservationsByStage(observations: ObservationDTO[]) {
  const map = new Map<string, ObservationDTO[]>();
  for (const obs of observations) {
    const list = map.get(obs.stageId) ?? [];
    list.push(obs);
    map.set(obs.stageId, list);
  }
  return map;
}

function computeDaysSinceLastObs(
  observations: ObservationDTO[],
): number | null {
  if (observations.length === 0) return null;
  const latest = observations.reduce((a, b) =>
    new Date(a.observedAt) > new Date(b.observedAt) ? a : b,
  );
  const diff = Date.now() - new Date(latest.observedAt).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function normalizeObservationPoints(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((point): point is string => typeof point === "string")
      .map((point) => point.trim())
      .filter(Boolean);
  }
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    return normalizeObservationPoints(JSON.parse(value));
  } catch {
    return [];
  }
}

// API/raw 데이터를 안전하게 StudentPlantDTO 로 정규화.
function normalizePlant(
  raw:
    | NonNullable<
        BoardDetailResponse["layoutData"]["plantRoadmap"]
      >["plants"][number]
    | StudentPlantDTO,
): StudentPlantDTO | null {
  if (!raw || !raw.species) return null;
  const rawWithStage = raw as Partial<{ currentStage?: StageDTO }>;
  return {
    id: raw.id,
    speciesId: raw.speciesId ?? raw.species.id,
    nickname: raw.nickname,
    currentStageId: raw.currentStageId ?? rawWithStage.currentStage?.id ?? "",
    species: {
      ...raw.species,
      stages: (raw.species.stages ?? []).map((stage) => ({
        ...stage,
        observationPoints: normalizeObservationPoints(
          (stage as { observationPoints?: unknown }).observationPoints,
        ),
      })),
    },
    observations: (raw.observations ?? []).map((obs) => ({
      ...obs,
      images: obs.images ?? [],
    })),
  };
}

// ─── 메인 컴포넌트 ───

/**
 * 식물 관찰일지 학생화면 — 세로형 타임라인 레이아웃.
 *
 * 구조:
 * 1. PlantHero (식물 정보 + 진행률 + 미션)
 * 2. StageRow × N (좌측 레일 + 우측 바디)
 * 3. ObservationEditor 모달 (관찰 추가/수정)
 * 4. NoPhotoReasonModal (사진 없이 단계 진행)
 * 5. ImageLightbox (이미지 원본 보기)
 */
export function PlantRoadmapBoard({
  data,
  onMutate,
}: {
  data: BoardDetailResponse;
  onMutate: () => void;
}) {
  const rawPlants = data.layoutData.plantRoadmap?.plants ?? [];
  const primaryRaw = rawPlants[0];

  // 식물 상태 관리 — 누락된 species/stages/currentStage/observations 를 기본값으로 맞춤.
  const [plant, setPlant] = useState<StudentPlantDTO | null>(() =>
    primaryRaw ? normalizePlant(primaryRaw) : null,
  );

  // UI 상태
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [busyAdvance, setBusyAdvance] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editorStageId, setEditorStageId] = useState<string | null>(null);
  const [editingObs, setEditingObs] = useState<ObservationDTO | null>(null);
  const [reasonModalVisible, setReasonModalVisible] = useState(false);
  const [reasonBusy, setReasonBusy] = useState(false);
  const [selectedRoadmapStage, setSelectedRoadmapStage] =
    useState<StageDTO | null>(null);

  // ─── 파생 데이터 ───
  const stages = useMemo(
    () => [...(plant?.species.stages ?? [])].sort((a, b) => a.order - b.order),
    [plant?.species.stages],
  );

  const currentStage = useMemo(
    () =>
      stages.find((s) => s.id === plant?.currentStageId) ?? stages[0] ?? null,
    [stages, plant?.currentStageId],
  );

  const observationsByStage = useMemo(
    () => groupObservationsByStage(plant?.observations ?? []),
    [plant?.observations],
  );

  const totalPhotos = useMemo(
    () =>
      (plant?.observations ?? []).reduce(
        (sum, o) => sum + (o.images?.length ?? 0),
        0,
      ),
    [plant?.observations],
  );

  const daysSinceLastObs = useMemo(
    () => computeDaysSinceLastObs(plant?.observations ?? []),
    [plant?.observations],
  );

  const progressPercent = useMemo(() => {
    const totalStages = stages.length;
    if (totalStages === 0 || !currentStage) return 0;
    const order = currentStage.order ?? 1;
    return Math.round(((order - 1) / totalStages) * 100);
  }, [stages, currentStage]);

  // ─── 뮤테이션 핸들러 ───

  const refreshPlant = useCallback(async () => {
    if (!plant) return;
    try {
      const res = await fetchStudentPlant(plant.id);
      setPlant(res.studentPlant ? normalizePlant(res.studentPlant) : null);
    } catch {
      // silent
    }
  }, [plant]);

  // 관찰 추가 모달 열기
  const handleOpenEditor = useCallback(
    (stageId: string, obs?: ObservationDTO) => {
      setEditorStageId(stageId);
      setEditingObs(obs ?? null);
      setEditorVisible(true);
    },
    [],
  );

  // 관찰 추가/수정 제출
  const handleEditorSubmit = useCallback(
    async (payload: { memo: string; images: Array<{ url: string }> }) => {
      if (!plant || !editorStageId) return;
      if (editingObs) {
        await apiUpdateObservation(plant.id, editingObs.id, payload);
      } else {
        await createObservation(plant.id, {
          stageId: editorStageId,
          ...payload,
        });
      }
      setEditorVisible(false);
      setEditingObs(null);
      setEditorStageId(null);
      await refreshPlant();
      onMutate();
    },
    [plant, editorStageId, editingObs, refreshPlant, onMutate],
  );

  const handlePickImage = useCallback(async (): Promise<string | null> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "사진 권한 필요",
        "관찰 사진을 올리려면 사진 접근 권한이 필요해요.",
      );
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.82,
      allowsMultipleSelection: false,
    });
    if (result.canceled || !result.assets[0]?.uri) return null;
    return uploadImage(result.assets[0].uri);
  }, []);

  // 관찰 삭제
  const handleDeleteObservation = useCallback(
    (obs: ObservationDTO) => {
      if (!plant) return;
      Alert.alert("관찰 삭제", "이 관찰 기록을 삭제할까요?", [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: async () => {
            try {
              await apiDeleteObservation(plant.id, obs.id);
              await refreshPlant();
              onMutate();
            } catch {
              Alert.alert("오류", "관찰 기록을 삭제하지 못했어요.");
            }
          },
        },
      ]);
    },
    [plant, refreshPlant, onMutate],
  );

  // 단계 진행
  const handleAdvance = useCallback(async () => {
    if (!plant) return;
    setBusyAdvance(true);
    try {
      const result = await advanceStage(plant.id);
      if (result.needsReason) {
        setReasonModalVisible(true);
        return;
      }
      await refreshPlant();
      onMutate();
      Alert.alert("축하해요! 🎉", `다음 단계에 도착했어요!`);
    } catch {
      Alert.alert("오류", "다음 단계로 이동하지 못했어요.");
    } finally {
      setBusyAdvance(false);
    }
  }, [plant, refreshPlant, onMutate]);

  // 사진 없음 사유 제출
  const handleReasonSubmit = useCallback(
    async (reason: string) => {
      if (!plant) return;
      setReasonBusy(true);
      try {
        await advanceStage(plant.id, reason);
        setReasonModalVisible(false);
        await refreshPlant();
        onMutate();
        Alert.alert("축하해요! 🎉", `다음 단계에 도착했어요!`);
      } catch {
        Alert.alert("오류", "다음 단계로 이동하지 못했어요.");
      } finally {
        setReasonBusy(false);
        setBusyAdvance(false);
      }
    },
    [plant, refreshPlant, onMutate],
  );

  // ─── 식물 미배정 / 데이터 불완전 상태 ───
  if (!plant) {
    return (
      <View style={styles.center}>
        <Text style={styles.infoEmoji}>🌱</Text>
        <Text style={styles.infoTitle}>아직 식물이 배정되지 않았어요</Text>
        <Text style={styles.infoMsg}>
          선생님이 식물을 지정하면 여기에 성장 기록이 나타나요.
        </Text>
      </View>
    );
  }

  if (stages.length === 0 || !currentStage) {
    return (
      <View style={styles.center}>
        <Text style={styles.infoEmoji}>🌱</Text>
        <Text style={styles.infoTitle}>식물 성장 단계 정보가 없어요</Text>
        <Text style={styles.infoMsg}>
          선생님이 단계를 설정하면 관찰 기록을 시작할 수 있어요.
        </Text>
      </View>
    );
  }

  // ─── 렌더링 ───

  const editorTitle = editingObs
    ? "관찰 기록 수정"
    : editorStageId
      ? (() => {
          const s = stages.find((st) => st.id === editorStageId);
          return s
            ? `${s.order}단계 · ${s.nameKo} 기록 추가`
            : "관찰 기록 추가";
        })()
      : "관찰 기록 추가";
  const selectedRoadmapPoints = normalizeObservationPoints(
    selectedRoadmapStage?.observationPoints,
  );

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 히어로 섹션 */}
        <PlantHero
          plant={plant}
          currentStage={currentStage}
          progressPercent={progressPercent}
          totalObservations={plant.observations.length}
          totalPhotos={totalPhotos}
          daysSinceLastObs={daysSinceLastObs}
        />

        <View style={styles.roadmapSection}>
          <Text style={styles.sectionTitle}>🛣️ 성장 로드맵</Text>
          <Text style={styles.roadmapHint}>
            단계를 누르면 주요 관찰 포인트를 볼 수 있어요.
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.roadmapTrack}
          >
            {stages.map((stage, index) => {
              const isComplete = stage.order < currentStage.order;
              const isCurrent = stage.id === currentStage.id;
              return (
                <View key={stage.id} style={styles.roadmapStepWrap}>
                  <ControlPressable
                    onPress={() => setSelectedRoadmapStage(stage)}
                    accessibilityLabel={`${stage.order}단계 ${stage.nameKo} 관찰 포인트`}
                    style={[
                      styles.roadmapStep,
                      isComplete && styles.roadmapStepComplete,
                      isCurrent && styles.roadmapStepCurrent,
                    ]}
                  >
                    <Text style={styles.roadmapStepIcon}>{stage.icon}</Text>
                    <Text style={styles.roadmapStepLabel} numberOfLines={1}>
                      {stage.order}단계
                    </Text>
                  </ControlPressable>
                  {index < stages.length - 1 ? (
                    <View
                      style={[
                        styles.roadmapConnector,
                        isComplete && styles.roadmapConnectorComplete,
                      ]}
                    />
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        </View>

        <Text style={styles.sectionTitle}>관찰 기록</Text>
        {stages.map((stage, idx) => {
          const state =
            stage.order < currentStage.order
              ? "visited"
              : stage.order === currentStage.order
                ? "active"
                : "upcoming";
          const observations = observationsByStage.get(stage.id) ?? [];
          const isCurrent = stage.id === currentStage.id;

          return (
            <View key={stage.id} style={styles.stageGroup}>
              <View
                style={[
                  styles.stageHighlight,
                  state === "visited" && styles.stageHighlightVisited,
                  state === "active" && styles.stageHighlightActive,
                ]}
              >
                <Text style={styles.stageHighlightText}>
                  {stage.order}단계 · {stage.nameKo}
                </Text>
              </View>
              <StageRow
                stage={stage}
                state={state}
                isFirst={idx === 0}
                isLast={idx === stages.length - 1}
                isCurrent={isCurrent}
                observations={observations}
                canEdit={state !== "upcoming"}
                onAddObservation={() => handleOpenEditor(stage.id)}
                onEditObservation={(obs) => handleOpenEditor(stage.id, obs)}
                onDeleteObservation={handleDeleteObservation}
                onAdvance={handleAdvance}
                onOpenImage={(url) => setLightboxUrl(url)}
                busyAdvance={busyAdvance}
              />
            </View>
          );
        })}
      </ScrollView>

      {/* 이미지 라이트박스 */}
      <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />

      {/* 관찰 에디터 모달 */}
      <ObservationEditor
        visible={editorVisible}
        title={editorTitle}
        initial={editingObs}
        onCancel={() => {
          setEditorVisible(false);
          setEditingObs(null);
          setEditorStageId(null);
        }}
        onSubmit={handleEditorSubmit}
        onPickImage={handlePickImage}
      />

      {/* 사진 없음 사유 모달 */}
      <NoPhotoReasonModal
        visible={reasonModalVisible}
        onCancel={() => {
          setReasonModalVisible(false);
          setBusyAdvance(false);
        }}
        onSubmit={handleReasonSubmit}
        busy={reasonBusy}
      />

      <AppModal
        visible={selectedRoadmapStage !== null}
        onClose={() => setSelectedRoadmapStage(null)}
        closeOnBackdropPress
        accessibilityLabel="단계별 주요 관찰 포인트"
      >
        {selectedRoadmapStage ? (
          <View style={styles.stagePointModal}>
            <Text style={styles.stagePointTitle}>
              {selectedRoadmapStage.icon} {selectedRoadmapStage.order}단계 ·{" "}
              {selectedRoadmapStage.nameKo}
            </Text>
            {selectedRoadmapStage.description ? (
              <Text style={styles.stagePointDescription}>
                {selectedRoadmapStage.description}
              </Text>
            ) : null}
            <Text style={styles.stagePointLabel}>주요 관찰 포인트</Text>
            {selectedRoadmapPoints.length > 0 ? (
              selectedRoadmapPoints.map((point, index) => (
                <Text
                  key={`${selectedRoadmapStage.id}-${index}`}
                  style={styles.stagePoint}
                >
                  • {point}
                </Text>
              ))
            ) : (
              <Text style={styles.stagePointEmpty}>
                등록된 주요 관찰 포인트가 없어요.
              </Text>
            )}
            <AppButton onPress={() => setSelectedRoadmapStage(null)}>
              닫기
            </AppButton>
          </View>
        ) : null}
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    gap: spacing.md,
  },
  infoEmoji: { fontSize: iconSizes.gate },
  infoTitle: { ...typography.title, color: colors.text, textAlign: "center" },
  infoMsg: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  sectionTitle: {
    ...typography.section,
    color: colors.text,
    marginBottom: spacing.md,
  },
  roadmapSection: { gap: spacing.xs, marginBottom: spacing.xl },
  roadmapHint: { ...typography.micro, color: colors.textMuted },
  roadmapTrack: { alignItems: "center", paddingVertical: spacing.xs },
  roadmapStepWrap: { flexDirection: "row", alignItems: "center" },
  roadmapStep: {
    width: plant.roadmapStepWidth,
    minHeight: plant.roadmapStepMinHeight,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    padding: spacing.xs,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceAlt,
  },
  roadmapStepComplete: { backgroundColor: colors.accentTintedBg },
  roadmapStepCurrent: {
    backgroundColor: colors.accent,
  },
  roadmapStepIcon: { fontSize: iconSizes.md },
  roadmapStepLabel: { ...typography.micro, color: colors.text },
  roadmapConnector: {
    width: spacing.lg,
    height: borders.medium,
    backgroundColor: colors.border,
  },
  roadmapConnectorComplete: { backgroundColor: colors.accent },
  stageGroup: { gap: spacing.sm },
  stageHighlight: {
    minHeight: controls.compactChipHeight,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderLeftWidth: borders.medium,
    borderLeftColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  stageHighlightVisited: { borderLeftColor: colors.plantActive },
  stageHighlightActive: {
    borderLeftColor: colors.accent,
    backgroundColor: colors.accentTintedBg,
  },
  stageHighlightText: { ...typography.label, color: colors.text },
  stagePointModal: { gap: spacing.md, padding: spacing.xl },
  stagePointTitle: { ...typography.title, color: colors.text },
  stagePointDescription: { ...typography.body, color: colors.textMuted },
  stagePointLabel: { ...typography.label, color: colors.text },
  stagePoint: { ...typography.body, color: colors.text },
  stagePointEmpty: { ...typography.body, color: colors.textMuted },
});
