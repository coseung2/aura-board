import type { EquippedFloor } from "../../lib/slime-assets";
import type { SlimeAction } from "../../lib/slime-assets";
import { ActivityIndicator } from "react-native";
import { AppButton } from "../../components/ui";
import { SLIME_COLOR_LABELS } from "../../lib/slimes";
import { SlimeSprite } from "../../components/slime/SlimeSprite";
import { Text } from "react-native";
import { View } from "react-native";
import { WalkingTitleSlot } from "../../components/WalkingTitleSlot";
import { colors } from "../../theme/tokens";
import { resolveEquippedSceneBackground } from "../../lib/slimes";
import { resolveEquippedSlimePropAction } from "../../lib/slime-props";
import { resolveEquippedSlimeWearables } from "../../lib/slimes";
import { resolveEquippedVehicle } from "../../lib/slimes";
import { selectSceneBackgroundSpritePath } from "../../lib/slimes";
import { styles } from "./student-slime.styles";
import { visibleEquippedSlimeItemKeys } from "../../lib/slime-item-visibility";
import type { StudentSlimeScreenViewModel } from "../../lib/student-slime-screen/student-slime-screen.types";

type StudentSlimeClassroomSectionProps = Pick<
  StudentSlimeScreenViewModel,
  | "classroomLoading"
  | "classmates"
  | "classroomError"
  | "loadClassroom"
  | "home"
  | "SLIME_TRAMPOLINE_ITEM_KEY"
  | "petCardScene"
>;

export function StudentSlimeClassroomSection({
  classroomLoading,
  classmates,
  classroomError,
  loadClassroom,
  home,
  SLIME_TRAMPOLINE_ITEM_KEY,
  petCardScene,
}: StudentSlimeClassroomSectionProps) {
  return classroomLoading && classmates === null ? (
    <View style={styles.classroomState}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={styles.classroomText}>우리 반 펫을 불러오는 중…</Text>
    </View>
  ) : classroomError && classmates === null ? (
    <View style={styles.classroomCard}>
      <Text style={styles.classroomEmoji} accessible={false}>
        😵
      </Text>
      <Text style={styles.classroomTitle}>우리 반 펫을 불러오지 못했어요</Text>
      <Text style={styles.classroomText}>{classroomError}</Text>
      <AppButton onPress={() => void loadClassroom()}>다시 시도</AppButton>
    </View>
  ) : classmates?.length === 0 ? (
    <View style={styles.classroomCard}>
      <Text style={styles.classroomEmoji} accessible={false}>
        🫧
      </Text>
      <Text style={styles.classroomTitle}>아직 소개할 펫이 없어요</Text>
      <Text style={styles.classroomText}>
        친구들이 대표 펫을 지정하면 여기에 보여요.
      </Text>
    </View>
  ) : (
    <View
      style={styles.classroomList}
      accessibilityLabel="우리 반 대표 펫 목록"
    >
      {classmates?.map((student) => {
        const representative = student.representative;
        const classVisibleItemKeys = representative
          ? visibleEquippedSlimeItemKeys(
              representative.equippedItemKeys,
              representative.hiddenItemKeys,
            )
          : [];
        const classItems = representative
          ? (home?.shopCatalog.filter((item) =>
              classVisibleItemKeys.includes(item.key),
            ) ?? [])
          : [];
        const classFloor = classItems.reduce<EquippedFloor>(
          (current, item) => item.floor ?? current,
          "none",
        );
        const classVehicleItem = representative
          ? resolveEquippedVehicle(
              classVisibleItemKeys,
              home?.shopCatalog ?? [],
            )
          : null;
        const classUsesTrampoline =
          classVehicleItem?.key === SLIME_TRAMPOLINE_ITEM_KEY;
        const classRenderedVehicle = classUsesTrampoline
          ? null
          : classVehicleItem;
        const classAction: SlimeAction = classUsesTrampoline
          ? "floor-interaction"
          : "idle";
        const classPropAction = representative
          ? resolveEquippedSlimePropAction(
              classVisibleItemKeys,
              home?.shopCatalog ?? [],
            )
          : null;
        const classWearables = representative
          ? resolveEquippedSlimeWearables(
              classVisibleItemKeys,
              home?.shopCatalog ?? [],
            )
          : null;
        const classBackground = representative
          ? resolveEquippedSceneBackground(
              classVisibleItemKeys,
              home?.shopCatalog ?? [],
            )
          : null;
        return (
          <View key={student.id} style={styles.classmateCard}>
            <View
              style={[
                styles.classmateSprite,
                styles.vehicleSceneSlot,
                { height: petCardScene.slotHeight },
              ]}
            >
              {representative ? (
                <SlimeSprite
                  slimeColor={representative.color}
                  growthStage={representative.growthStage}
                  action={classAction}
                  equippedFloor={
                    classUsesTrampoline ? "trampoline" : classFloor
                  }
                  displayScale={petCardScene.displayScale}
                  expandSceneSurfaces
                  backgroundSpritePath={
                    classBackground
                      ? selectSceneBackgroundSpritePath(classBackground)
                      : undefined
                  }
                  repeat={Boolean(classPropAction) || classAction !== "idle"}
                  propAction={classPropAction}
                  wearables={classWearables ?? undefined}
                  drinkFlavor={classWearables?.drink}
                  vehicleSpritePath={
                    classRenderedVehicle?.vehicleSheetPath ??
                    classRenderedVehicle?.spritePath
                  }
                  vehicleGroundedSpritePath={
                    classRenderedVehicle?.vehicleGroundedSpritePath
                  }
                  vehicleEffectSpritePaths={
                    classRenderedVehicle?.vehicleEffectSpritePaths
                  }
                  vehicleFrameCount={classRenderedVehicle?.vehicleFrameCount}
                  vehicleGroundedFrameCount={
                    classRenderedVehicle?.vehicleGroundedFrameCount
                  }
                  vehicleGroundedFrameDurationMs={
                    classRenderedVehicle?.vehicleGroundedFrameDurationMs
                  }
                  vehicleCanvasHeight={
                    classRenderedVehicle?.vehicleCanvasHeight
                  }
                  vehicleCharacterOffsetY={
                    classRenderedVehicle?.vehicleCharacterOffsetY
                  }
                  vehicleBobY={classRenderedVehicle?.vehicleBobY}
                  vehicleRiseY={classRenderedVehicle?.vehicleRiseY}
                  vehicleOffsetX={classRenderedVehicle?.vehicleOffsetX}
                  accessibilityLabel={`${student.name}의 ${SLIME_COLOR_LABELS[representative.color]} 대표 펫`}
                />
              ) : (
                <View style={styles.noRepresentative}>
                  <Text style={styles.classmatePlaceholderText}>
                    대표 펫 미지정
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.classmateBody}>
              {student.walkingTitle ? (
                <WalkingTitleSlot title={student.walkingTitle} />
              ) : (
                <View style={styles.classmateTitleSpacer} />
              )}
              <Text style={styles.classmateName} numberOfLines={1}>
                {student.number !== null ? `${student.number}번 ` : ""}
                {student.name}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
