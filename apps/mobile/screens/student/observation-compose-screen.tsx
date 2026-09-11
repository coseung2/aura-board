import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Text } from "react-native";
import { useInputFeedback } from "../../components/input-feedback-provider";
import { InputPage } from "../../components/input-page";
import { ObservationEditor } from "../../components/plant/ObservationEditor";
import { normalizePlant } from "../../components/plant/plant-roadmap-utils";
import { AppButton } from "../../components/ui";
import {
  createObservation,
  fetchStudentPlant,
  updateObservation,
  uploadImage,
} from "../../lib/plant-api";
import type { StudentPlantDTO } from "../../lib/types";

export default function ObservationComposeScreen() {
  const {
    id = "",
    stageId,
    observationId,
  } = useLocalSearchParams<{
    id: string;
    stageId?: string;
    observationId?: string;
  }>();
  const router = useRouter();
  const notify = useInputFeedback();
  const [plant, setPlant] = useState<StudentPlantDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setPlant(null);
    setError(null);
    void fetchStudentPlant(id)
      .then((response) => {
        if (active) setPlant(normalizePlant(response.studentPlant));
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "관찰 기록을 불러오지 못했어요.",
          );
      });
    return () => {
      active = false;
    };
  }, [id, attempt]);
  const initial = plant?.observations.find(
    (entry) => entry.id === observationId,
  );
  const stage = plant?.species.stages.find(
    (entry) => entry.id === (initial?.stageId ?? stageId),
  );
  if (!plant || !stage || (observationId && !initial))
    return (
      <InputPage title="관찰 기록" onBack={() => router.back()}>
        {error ? (
          <>
            <Text accessibilityRole="alert">{error}</Text>
            <AppButton onPress={() => setAttempt((value) => value + 1)}>
              다시 시도
            </AppButton>
          </>
        ) : plant ? (
          <Text>작성할 관찰 단계를 찾을 수 없어요.</Text>
        ) : (
          <ActivityIndicator />
        )}
      </InputPage>
    );
  return (
    <ObservationEditor
      key={observationId ?? stage.id}
      title={initial ? "관찰 기록 수정" : "관찰 기록 작성"}
      initial={initial}
      onPickImage={async () => {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert("사진 권한 필요", "사진 접근 권한을 허용해 주세요.");
          return null;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.82,
        });
        return result.canceled || !result.assets[0]
          ? null
          : uploadImage(result.assets[0].uri);
      }}
      onSubmit={async (payload) => {
        if (initial) await updateObservation(id, initial.id, payload);
        else await createObservation(id, { stageId: stage.id, ...payload });
        notify("관찰 기록을 저장했어요.");
      }}
    />
  );
}
