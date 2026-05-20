import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors, spacing, typography } from "../../theme/tokens";
import { PlantHero } from "../plant/PlantHero";
import { StageRow } from "../plant/StageRow";
import { ImageLightbox } from "../plant/ImageLightbox";
import { ObservationEditor } from "../plant/ObservationEditor";
import { NoPhotoReasonModal } from "../plant/NoPhotoReasonModal";
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

function computeDaysSinceLastObs(observations: ObservationDTO[]): number | null {
  if (observations.length === 0) return null;
  const latest = observations.reduce((a, b) =>
    new Date(a.observedAt) > new Date(b.observedAt) ? a : b,
  );
  const diff = Date.now() - new Date(latest.observedAt).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
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

  // 식물 상태 관리
  const [plant, setPlant] = useState<StudentPlantDTO | null>(
    primaryRaw
      ? {
          id: primaryRaw.id,
          speciesId: primaryRaw.speciesId ?? primaryRaw.species.id,
          nickname: primaryRaw.nickname,
          currentStageId: primaryRaw.currentStageId ?? primaryRaw.currentStage.id,
          species: primaryRaw.species,
          observations: primaryRaw.observations,
        }
      : null,
  );

  // UI 상태
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [busyAdvance, setBusyAdvance] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editorStageId, setEditorStageId] = useState<string | null>(null);
  const [editingObs, setEditingObs] = useState<ObservationDTO | null>(null);
  const [reasonModalVisible, setReasonModalVisible] = useState(false);
  const [reasonBusy, setReasonBusy] = useState(false);

  // ─── 식물 미배정 상태 ───
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

  // ─── 파생 데이터 ───
  const stages = useMemo(
    () => [...plant.species.stages].sort((a, b) => a.order - b.order),
    [plant.species.stages],
  );

  const currentStage = useMemo(
    () => stages.find((s) => s.id === plant.currentStageId) ?? stages[0],
    [stages, plant.currentStageId],
  );

  const observationsByStage = useMemo(
    () => groupObservationsByStage(plant.observations),
    [plant.observations],
  );

  const totalPhotos = useMemo(
    () => plant.observations.reduce((sum, o) => sum + o.images.length, 0),
    [plant.observations],
  );

  const daysSinceLastObs = useMemo(
    () => computeDaysSinceLastObs(plant.observations),
    [plant.observations],
  );

  const progressPercent = useMemo(() => {
    const totalStages = stages.length;
    if (totalStages === 0) return 0;
    return Math.round(((currentStage.order - 1) / totalStages) * 100);
  }, [stages, currentStage]);

  // ─── 뮤테이션 핸들러 ───

  const refreshPlant = useCallback(async () => {
    try {
      const res = await fetchStudentPlant(plant.id);
      setPlant(res.studentPlant);
    } catch {
      // silent
    }
  }, [plant.id]);

  // 관찰 추가 모달 열기
  const handleOpenEditor = useCallback((stageId: string, obs?: ObservationDTO) => {
    setEditorStageId(stageId);
    setEditingObs(obs ?? null);
    setEditorVisible(true);
  }, []);

  // 관찰 추가/수정 제출
  const handleEditorSubmit = useCallback(
    async (payload: { memo: string; images: Array<{ url: string }> }) => {
      if (!editorStageId) return;
      if (editingObs) {
        await apiUpdateObservation(plant.id, editingObs.id, payload);
      } else {
        await createObservation(plant.id, { stageId: editorStageId, ...payload });
      }
      setEditorVisible(false);
      setEditingObs(null);
      setEditorStageId(null);
      await refreshPlant();
      onMutate();
    },
    [plant.id, editorStageId, editingObs, refreshPlant, onMutate],
  );

  // 이미지 선택 (placeholder — 실제로는 expo-image-picker 연동)
  const handlePickImage = useCallback(async (): Promise<string | null> => {
    // TODO: expo-image-picker 연동
    // 현재는 placeholder Alert
    return new Promise((resolve) => {
      Alert.alert(
        "이미지 선택",
        "expo-image-picker 연동이 필요합니다.\n(개발 중)",
        [{ text: "확인", onPress: () => resolve(null) }],
      );
    });
  }, []);

  // 관찰 삭제
  const handleDeleteObservation = useCallback(
    (obs: ObservationDTO) => {
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
    [plant.id, refreshPlant, onMutate],
  );

  // 단계 진행
  const handleAdvance = useCallback(async () => {
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
  }, [plant.id, refreshPlant, onMutate]);

  // 사진 없음 사유 제출
  const handleReasonSubmit = useCallback(
    async (reason: string) => {
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
    [plant.id, refreshPlant, onMutate],
  );

  // ─── 렌더링 ───

  const editorTitle = editingObs
    ? "관찰 기록 수정"
    : editorStageId
      ? (() => {
          const s = stages.find((st) => st.id === editorStageId);
          return s ? `${s.order}단계 · ${s.nameKo} 기록 추가` : "관찰 기록 추가";
        })()
      : "관찰 기록 추가";

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

        {/* 세로 타임라인 */}
        <Text style={styles.sectionTitle}>🛣️ 성장 타임라인</Text>
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
            <StageRow
              key={stage.id}
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
  infoEmoji: { fontSize: 72 },
  infoTitle: { ...typography.title, color: colors.text, textAlign: "center" },
  infoMsg: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  sectionTitle: {
    ...typography.section,
    color: colors.text,
    marginBottom: spacing.md,
  },
});
