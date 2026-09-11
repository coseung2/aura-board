import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  advanceStage,
  deleteObservation as apiDeleteObservation,
  fetchStudentPlant,
  updateNickname,
} from "../../lib/plant-api";
import type {
  BoardDetailResponse,
  ObservationDTO,
  StudentPlantDTO,
} from "../../lib/types";
import {
  colors,
  iconSizes,
  pageChrome,
  spacing,
  typography,
} from "../../theme/tokens";
import { ImageLightbox } from "../plant/ImageLightbox";
import { NoPhotoReasonModal } from "../plant/NoPhotoReasonModal";
import {
  calculateProgressPercent,
  computeDaysSinceLastObs,
  groupObservationsByStage,
  normalizePlant,
} from "../plant/plant-roadmap-utils";
import { PlantHero } from "../plant/PlantHero";
import { PlantRoadmapTimeline } from "../plant/PlantRoadmapTimeline";
import { RoadmapStagePicker } from "../plant/RoadmapStagePicker";

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
  const router = useRouter();
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

  const handleOpenEditor = useCallback(
    (stageId: string, observation?: ObservationDTO) => {
      if (!plant) return;
      router.push({
        pathname: "/(student)/plant/[id]/compose",
        params: {
          id: plant.id,
          stageId,
          ...(observation ? { observationId: observation.id } : {}),
        },
      });
    },
    [plant, router],
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

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets
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
    paddingHorizontal: spacing.lg,
    paddingTop: pageChrome.directContentStartGap,
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
