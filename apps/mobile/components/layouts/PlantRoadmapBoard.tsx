import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { colors, iconSizes, spacing, typography } from "../../theme/tokens";
import { ImageLightbox } from "../plant/ImageLightbox";
import { NoPhotoReasonModal } from "../plant/NoPhotoReasonModal";
import { ObservationEditor } from "../plant/ObservationEditor";
import { PlantHero } from "../plant/PlantHero";
import { PlantRoadmapTimeline } from "../plant/PlantRoadmapTimeline";
import { RoadmapStagePicker } from "../plant/RoadmapStagePicker";
import type {
  BoardDetailResponse,
  ObservationDTO,
  StudentPlantDTO,
} from "../../lib/types";
import {
  advanceStage,
  createObservation,
  deleteObservation as apiDeleteObservation,
  fetchStudentPlant,
  updateNickname,
  updateObservation as apiUpdateObservation,
  uploadImage,
} from "../../lib/plant-api";
import {
  calculateProgressPercent,
  computeDaysSinceLastObs,
  groupObservationsByStage,
  normalizePlant,
} from "../plant/plant-roadmap-utils";

/**
 * Mobile plant journal board. Data normalisation and the timeline/picker
 * presentation live in focused children so this component only coordinates
 * server mutations, refreshes, and modal state.
 */
export function PlantRoadmapBoard({
  data,
  onMutate,
}: {
  data: BoardDetailResponse;
  onMutate: () => void;
}) {
  const primaryRaw = data.layoutData.plantRoadmap?.plants?.[0];
  const normalizedPrimary = useMemo(
    () => normalizePlant(primaryRaw),
    [primaryRaw],
  );
  const [plant, setPlant] = useState<StudentPlantDTO | null>(normalizedPrimary);

  // A board detail screen can receive a new payload without remounting.
  useEffect(() => {
    setPlant(normalizedPrimary);
  }, [normalizedPrimary]);

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [busyAdvance, setBusyAdvance] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editorStageId, setEditorStageId] = useState<string | null>(null);
  const [editingObservation, setEditingObservation] =
    useState<ObservationDTO | null>(null);
  const [reasonModalVisible, setReasonModalVisible] = useState(false);
  const [reasonBusy, setReasonBusy] = useState(false);

  const stages = useMemo(
    () => [...(plant?.species.stages ?? [])].sort((a, b) => a.order - b.order),
    [plant?.species.stages],
  );
  const currentStage = useMemo(
    () =>
      stages.find((stage) => stage.id === plant?.currentStageId) ??
      stages[0] ??
      null,
    [plant?.currentStageId, stages],
  );
  const observationsByStage = useMemo(
    () => groupObservationsByStage(plant?.observations ?? []),
    [plant?.observations],
  );
  const totalPhotos = useMemo(
    () =>
      (plant?.observations ?? []).reduce(
        (total, observation) => total + observation.images.length,
        0,
      ),
    [plant?.observations],
  );
  const daysSinceLastObs = useMemo(
    () => computeDaysSinceLastObs(plant?.observations ?? []),
    [plant?.observations],
  );
  const progressPercent = useMemo(
    () => calculateProgressPercent(stages, currentStage),
    [currentStage, stages],
  );

  const refreshPlant = useCallback(async () => {
    if (!plant) return false;
    try {
      const response = await fetchStudentPlant(plant.id);
      setPlant(normalizePlant(response.studentPlant));
      return true;
    } catch {
      Alert.alert("새로고침 실패", "최신 식물 기록을 불러오지 못했어요.");
      return false;
    }
  }, [plant]);

  const closeEditor = useCallback(() => {
    setEditorVisible(false);
    setEditingObservation(null);
    setEditorStageId(null);
  }, []);

  const handleOpenEditor = useCallback(
    (stageId: string, observation?: ObservationDTO) => {
      setEditorStageId(stageId);
      setEditingObservation(observation ?? null);
      setEditorVisible(true);
    },
    [],
  );

  const handleNicknameSave = useCallback(
    async (nickname: string) => {
      if (!plant) return;
      const updated = await updateNickname(plant.id, nickname);
      setPlant(normalizePlant(updated));
      onMutate();
    },
    [onMutate, plant],
  );

  const handleEditorSubmit = useCallback(
    async (payload: { memo: string; images: Array<{ url: string }> }) => {
      if (!plant || !editorStageId) return;
      if (editingObservation) {
        await apiUpdateObservation(plant.id, editingObservation.id, payload);
      } else {
        await createObservation(plant.id, {
          stageId: editorStageId,
          ...payload,
        });
      }
      closeEditor();
      await refreshPlant();
      onMutate();
    },
    [closeEditor, editingObservation, editorStageId, onMutate, plant, refreshPlant],
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

  const handleDeleteObservation = useCallback(
    (observation: ObservationDTO) => {
      if (!plant) return;
      Alert.alert("관찰 삭제", "이 관찰 기록을 삭제할까요?", [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await apiDeleteObservation(plant.id, observation.id);
                await refreshPlant();
                onMutate();
              } catch {
                Alert.alert("오류", "관찰 기록을 삭제하지 못했어요.");
              }
            })();
          },
        },
      ]);
    },
    [onMutate, plant, refreshPlant],
  );

  const handleAdvance = useCallback(async () => {
    if (!plant) return;
    setBusyAdvance(true);
    try {
      const result = await advanceStage(plant.id);
      if (result.needsReason) {
        setReasonModalVisible(true);
        return;
      }
      const refreshed = await refreshPlant();
      onMutate();
      if (refreshed) {
        Alert.alert("축하해요! 🎉", "다음 단계에 도착했어요!");
      }
    } catch {
      Alert.alert("오류", "다음 단계로 이동하지 못했어요.");
    } finally {
      setBusyAdvance(false);
    }
  }, [onMutate, plant, refreshPlant]);

  const handleReasonSubmit = useCallback(
    async (reason: string) => {
      if (!plant) return;
      setReasonBusy(true);
      try {
        await advanceStage(plant.id, reason);
        setReasonModalVisible(false);
        const refreshed = await refreshPlant();
        onMutate();
        if (refreshed) {
          Alert.alert("축하해요! 🎉", "다음 단계에 도착했어요!");
        }
      } catch {
        Alert.alert("오류", "다음 단계로 이동하지 못했어요.");
      } finally {
        setReasonBusy(false);
        setBusyAdvance(false);
      }
    },
    [onMutate, plant, refreshPlant],
  );

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

  if (!currentStage || stages.length === 0) {
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

  const editorTitle = editingObservation
    ? "관찰 기록 수정"
    : editorStageId
      ? `${stages.find((stage) => stage.id === editorStageId)?.order ?? ""}단계 · 관찰 기록 추가`
      : "관찰 기록 추가";

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <PlantHero
          plant={plant}
          currentStage={currentStage}
          progressPercent={progressPercent}
          totalObservations={plant.observations.length}
          totalPhotos={totalPhotos}
          daysSinceLastObs={daysSinceLastObs}
          onSaveNickname={handleNicknameSave}
          onStartObservation={() => handleOpenEditor(currentStage.id)}
        />
        <RoadmapStagePicker stages={stages} currentStage={currentStage} />
        <PlantRoadmapTimeline
          stages={stages}
          currentStage={currentStage}
          observationsByStage={observationsByStage}
          daysSinceLastObs={daysSinceLastObs}
          busyAdvance={busyAdvance}
          onOpenEditor={handleOpenEditor}
          onDeleteObservation={handleDeleteObservation}
          onAdvance={() => void handleAdvance()}
          onOpenImage={setLightboxUrl}
        />
      </ScrollView>

      <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      <ObservationEditor
        visible={editorVisible}
        title={editorTitle}
        initial={editingObservation}
        onCancel={closeEditor}
        onSubmit={handleEditorSubmit}
        onPickImage={handlePickImage}
      />
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
  infoEmoji: { fontSize: iconSizes.gate },
  infoTitle: { ...typography.title, color: colors.text, textAlign: "center" },
  infoMsg: { ...typography.body, color: colors.textMuted, textAlign: "center" },
});
