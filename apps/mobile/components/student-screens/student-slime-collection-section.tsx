import type { EquippedFloor } from "../../lib/slime-assets";
import type { SlimeAction } from "../../lib/slime-assets";
import { Animated } from "react-native";
import { BarePressable } from "../../components/ui";
import { ControlPressable } from "../../components/ui";
import { Fragment } from "react";
import { Image } from "expo-image";
import { SLIME_ASSET_COLORS } from "../../lib/slime-assets";
import { SLIME_COLOR_LABELS } from "../../lib/slimes";
import { SLIME_SHARED_ASSETS } from "../../lib/slime-assets";
import { SlimeSprite } from "../../components/slime/SlimeSprite";
import { Star } from "lucide-react-native";
import { Text } from "react-native";
import { View } from "react-native";
import { calculateGrowthTimeComparison } from "../../lib/slimes";
import { calculateSlimeGrowthPercent } from "../../lib/slimes";
import { colors } from "../../theme/tokens";
import { formatGrowthHours } from "../../lib/slimes";
import { getApiBase } from "../../lib/api";
import { iconSizes } from "../../theme/tokens";
import { resolveEquippedSceneBackground } from "../../lib/slimes";
import { resolveEquippedSlimePropAction } from "../../lib/slime-props";
import { resolveEquippedSlimeWearables } from "../../lib/slimes";
import { resolveEquippedVehicle } from "../../lib/slimes";
import { selectSceneBackgroundSpritePath } from "../../lib/slimes";
import { spacing } from "../../theme/tokens";
import { stageForColor } from "../../lib/slimes";
import { styles } from "./student-slime.styles";
import { visibleEquippedSlimeItemKeys } from "../../lib/slime-item-visibility";
import type { StudentSlimeScreenViewModel } from "../../lib/student-slime-screen/student-slime-screen.types";

export function StudentSlimeCollectionSection({
  model,
}: {
  model: StudentSlimeScreenViewModel;
}) {
  const {
    home,
    selectedColor,
    appliedGrowthSpeedBps,
    buffGroupsByColor,
    SLIME_TRAMPOLINE_ITEM_KEY,
    manualActions,
    activeSets,
    SLIME_EFFECT_LABELS,
    formatBuffPercent,
    openEffectColor,
    openGrowthColor,
    petCardScene,
    equippedFloor,
    setManualActions,
    setOpenGrowthColor,
    setOpenEffectColor,
    buffArrowAnimatedStyle,
    busyRepresentative,
    setRepresentative,
    setSelectedColor,
    setWardrobeColor,
    cookieQuantity,
    busyItemKey,
    feedCookie,
    DISABLED_COOKIE_SOURCE,
    localSource,
    buffGroups,
    appliedBuffTotals,
    SLIME_EFFECT_DESCRIPTIONS,
  } = model;

  return (
    <>
      <View
        style={styles.myPetGrid}
        accessibilityRole="radiogroup"
        accessibilityLabel="내 슬라임 목록"
      >
        {SLIME_ASSET_COLORS.map((itemColor, colorIndex) => {
          const isOwned = home?.ownedColors.includes(itemColor) ?? false;
          const selected = selectedColor === itemColor;
          const petStage = home ? stageForColor(home, itemColor) : 1;
          const growth = home?.growthByColor[itemColor];
          const growthPercent = growth
            ? calculateSlimeGrowthPercent(growth)
            : 0;
          const growthTime = growth
            ? calculateGrowthTimeComparison(
                growth.remainingSeconds,
                appliedGrowthSpeedBps,
              )
            : null;
          const petBuffGroup = buffGroupsByColor.get(itemColor);
          const petItems = home?.equippedItemsByColor[itemColor] ?? [];
          const petVisibleItems = visibleEquippedSlimeItemKeys(
            petItems,
            home?.hiddenItemsByColor[itemColor],
          );
          const petWearables = resolveEquippedSlimeWearables(
            petVisibleItems,
            home?.shopCatalog ?? [],
          );
          const petFloor = petVisibleItems.reduce<EquippedFloor>(
            (current, itemKey) =>
              home?.shopCatalog.find((item) => item.key === itemKey)?.floor ??
              current,
            "none",
          );
          const petBackground = resolveEquippedSceneBackground(
            petVisibleItems,
            home?.shopCatalog ?? [],
          );
          const petPropAction = resolveEquippedSlimePropAction(
            petVisibleItems,
            home?.shopCatalog ?? [],
          );
          const petVehicle = resolveEquippedVehicle(
            petVisibleItems,
            home?.shopCatalog ?? [],
          );
          const petUsesTrampoline =
            petVehicle?.key === SLIME_TRAMPOLINE_ITEM_KEY;
          const petRenderedVehicle = petUsesTrampoline ? null : petVehicle;
          const petHasDrink = (home?.shopCatalog ?? []).some(
            (item) =>
              item.category === "drink" && petVisibleItems.includes(item.key),
          );
          const manualAction = manualActions[itemColor];
          const petAction: SlimeAction = manualAction
            ? manualAction
            : petHasDrink
              ? "drink"
              : // The trampoline is a vehicle now, so its jump timeline is keyed
                // off the equipped vehicle rather than a floor value.
                petUsesTrampoline
                ? "floor-interaction"
                : "idle";
          return (
            <Fragment key={itemColor}>
              {/* Five pets fill a three-column grid with one cell to spare. Set
                    bonuses are account-wide rather than per pet, so they take that
                    cell, placed before the final pet so the row reads
                    pet · sets · pet. */}
              {colorIndex === SLIME_ASSET_COLORS.length - 1 ? (
                <View
                  style={styles.myPetSetCard}
                  accessibilityLabel="적용 중인 세트 효과"
                >
                  {/* The heading aligns with the pet names beside it, so it sits at
                        the top of the cell and entries fill downward from there
                        rather than being centred as a block. */}
                  <Text style={styles.myPetSetTitle}>세트 효과</Text>
                  {activeSets.map((set) => (
                    <View key={set.key} style={styles.myPetSetRow}>
                      <Text style={styles.myPetSetName} numberOfLines={2}>
                        {set.label}
                      </Text>
                      <Text style={styles.myPetSetValue}>
                        {SLIME_EFFECT_LABELS[set.effectKey] ?? set.effectKey} +
                        {formatBuffPercent(set.bps)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              <View
                style={[
                  styles.myPetCard,
                  !isOwned && styles.myPetCardDisabled,
                  (openEffectColor === itemColor ||
                    openGrowthColor === itemColor) &&
                    styles.myPetCardEffectOpen,
                ]}
              >
                <View
                  style={[
                    styles.myPetSprite,
                    styles.vehicleSceneSlot,
                    { height: petCardScene.slotHeight },
                    openEffectColor === itemColor &&
                      styles.myPetSpriteEffectOpen,
                  ]}
                >
                  {isOwned ? (
                    <>
                      {openEffectColor === itemColor ? (
                        <View
                          style={styles.myPetEffectPopover}
                          accessibilityRole="summary"
                        >
                          <Text style={styles.myPetEffectPopoverTitle}>
                            버프 내역
                          </Text>
                          {petBuffGroup?.entries.map((effect) => (
                            <View
                              key={`${effect.source}:${effect.key}`}
                              style={styles.myPetEffectPopoverRow}
                            >
                              <Text style={styles.myPetEffectPopoverText}>
                                {effect.label}
                              </Text>
                              <Text style={styles.myPetEffectPopoverValue}>
                                {SLIME_EFFECT_LABELS[effect.effectKey] ??
                                  effect.effectKey}{" "}
                                +{formatBuffPercent(effect.bps)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </>
                  ) : null}
                  {isOwned ? (
                    <SlimeSprite
                      slimeColor={itemColor}
                      growthStage={petStage}
                      action={petAction}
                      equippedFloor={
                        petUsesTrampoline ? "trampoline" : petFloor
                      }
                      displayScale={petCardScene.displayScale}
                      expandSceneSurfaces
                      backgroundSpritePath={
                        petBackground
                          ? selectSceneBackgroundSpritePath(petBackground)
                          : undefined
                      }
                      repeat={
                        !manualAction &&
                        (Boolean(petPropAction) || petAction !== "idle")
                      }
                      propAction={petPropAction}
                      wearables={petWearables}
                      drinkFlavor={petWearables.drink}
                      vehicleSpritePath={
                        petRenderedVehicle?.vehicleSheetPath ??
                        petRenderedVehicle?.spritePath
                      }
                      vehicleGroundedSpritePath={
                        petRenderedVehicle?.vehicleGroundedSpritePath
                      }
                      vehicleEffectSpritePaths={
                        petRenderedVehicle?.vehicleEffectSpritePaths
                      }
                      vehicleFrameCount={petRenderedVehicle?.vehicleFrameCount}
                      vehicleGroundedFrameCount={
                        petRenderedVehicle?.vehicleGroundedFrameCount
                      }
                      vehicleGroundedFrameDurationMs={
                        petRenderedVehicle?.vehicleGroundedFrameDurationMs
                      }
                      vehicleCanvasHeight={
                        petRenderedVehicle?.vehicleCanvasHeight
                      }
                      vehicleCharacterOffsetY={
                        petRenderedVehicle?.vehicleCharacterOffsetY
                      }
                      vehicleBobY={petRenderedVehicle?.vehicleBobY}
                      vehicleRiseY={petRenderedVehicle?.vehicleRiseY}
                      vehicleOffsetX={petRenderedVehicle?.vehicleOffsetX}
                      accessibilityLabel={`${SLIME_COLOR_LABELS[itemColor]} 슬라임`}
                      onComplete={
                        manualAction
                          ? () =>
                              setManualActions((current) => {
                                const next = { ...current };
                                delete next[itemColor];
                                return next;
                              })
                          : undefined
                      }
                    />
                  ) : (
                    <View
                      style={styles.unownedSprite}
                      accessible
                      accessibilityRole="image"
                      accessibilityLabel="아직 보유하지 않은 슬라임"
                    >
                      <Text style={styles.unownedGlyph}>?</Text>
                    </View>
                  )}
                </View>
                <View style={styles.myPetNameRow}>
                  {isOwned ? (
                    <View
                      style={styles.myPetNameActionSlot}
                      pointerEvents="box-none"
                    >
                      <ControlPressable
                        style={styles.myPetEffectButton}
                        onPress={() => {
                          setOpenGrowthColor(null);
                          setOpenEffectColor((current) =>
                            current === itemColor ? null : itemColor,
                          );
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`${SLIME_COLOR_LABELS[itemColor]} 슬라임 버프 상세 보기`}
                        accessibilityState={{
                          expanded: openEffectColor === itemColor,
                        }}
                      >
                        <Animated.View style={buffArrowAnimatedStyle}>
                          <Image
                            source={{
                              uri: `${getApiBase()}/creatures/slimes/ui/growth-buff-arrow.png`,
                            }}
                            style={styles.myPetEffectArrow}
                            contentFit="contain"
                            transition={0}
                            accessible={false}
                          />
                        </Animated.View>
                      </ControlPressable>
                    </View>
                  ) : null}
                  <Text
                    style={[
                      styles.myPetName,
                      selected && styles.myPetNameSelected,
                    ]}
                  >
                    {SLIME_COLOR_LABELS[itemColor]}
                  </Text>
                  {isOwned ? (
                    <View
                      style={styles.myPetNameActionSlot}
                      pointerEvents="box-none"
                    >
                      <ControlPressable
                        style={styles.myPetStarButton}
                        disabled={
                          busyRepresentative !== null ||
                          home?.representativeColor === itemColor
                        }
                        onPress={() => void setRepresentative(itemColor)}
                        accessibilityRole="button"
                        accessibilityLabel={`${SLIME_COLOR_LABELS[itemColor]} 슬라임을 대표로 지정`}
                        accessibilityState={{
                          selected: home?.representativeColor === itemColor,
                          busy: busyRepresentative === itemColor,
                        }}
                      >
                        <Star
                          size={iconSizes.sm}
                          color={
                            home?.representativeColor === itemColor
                              ? colors.warning
                              : colors.textFaint
                          }
                          fill={
                            home?.representativeColor === itemColor
                              ? colors.warning
                              : colors.textFaint
                          }
                          accessible={false}
                        />
                      </ControlPressable>
                    </View>
                  ) : null}
                </View>
                {isOwned ? (
                  <ControlPressable
                    style={styles.myPetGrowth}
                    disabled={!growthTime}
                    onPress={() => {
                      setOpenEffectColor(null);
                      setOpenGrowthColor((current) =>
                        current === itemColor ? null : itemColor,
                      );
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${SLIME_COLOR_LABELS[itemColor]} 성장 경험치`}
                    accessibilityValue={{
                      min: 0,
                      max: 100,
                      now: growthPercent,
                      text: `성장 ${petStage}단계 ${growthPercent}%`,
                    }}
                  >
                    <View style={styles.myPetGrowthMeta}>
                      <Text style={styles.myPetGrowthLabel}>
                        성장 {petStage}단계
                      </Text>
                      <Text style={styles.myPetGrowthPercent}>
                        {growthPercent}%
                      </Text>
                    </View>
                    <View style={styles.myPetGrowthTrack} accessible={false}>
                      <View
                        style={[
                          styles.myPetGrowthFill,
                          { width: `${growthPercent}%` },
                        ]}
                      />
                    </View>
                    {openGrowthColor === itemColor && growthTime ? (
                      <View
                        style={styles.myPetGrowthPopover}
                        accessibilityRole="summary"
                      >
                        <Text style={styles.myPetEffectPopoverTitle}>
                          성장 속도 +{appliedGrowthSpeedBps / 100}% 적용 중
                        </Text>
                        <Text style={styles.myPetEffectPopoverText}>
                          버프 적용 전{" "}
                          {formatGrowthHours(growthTime.withoutBuffSeconds)}
                        </Text>
                        <Text style={styles.myPetEffectPopoverText}>
                          적용 후{" "}
                          {formatGrowthHours(growthTime.withBuffSeconds)}
                        </Text>
                      </View>
                    ) : null}
                  </ControlPressable>
                ) : null}
                <View
                  style={styles.myPetActions}
                  accessibilityLabel={`${SLIME_COLOR_LABELS[itemColor]} 펫 관리`}
                >
                  <BarePressable
                    style={styles.myPetActionLink}
                    disabled={!isOwned}
                    hitSlop={spacing.sm}
                    onPress={() => {
                      setOpenEffectColor(null);
                      setOpenGrowthColor(null);
                      setSelectedColor(itemColor);
                      setWardrobeColor(itemColor);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${SLIME_COLOR_LABELS[itemColor]} 꾸미기`}
                  >
                    <Text style={styles.myPetActionText}>꾸미기</Text>
                  </BarePressable>
                  <ControlPressable
                    style={styles.myPetCookieButton}
                    disabled={
                      !isOwned || cookieQuantity <= 0 || busyItemKey !== null
                    }
                    hitSlop={spacing.xs}
                    onPress={() => void feedCookie(itemColor)}
                    accessibilityLabel={`${SLIME_COLOR_LABELS[itemColor]}에게 쿠키 주기, ${cookieQuantity}개 보유`}
                  >
                    <Image
                      source={
                        cookieQuantity <= 0
                          ? DISABLED_COOKIE_SOURCE
                          : localSource(SLIME_SHARED_ASSETS.cookie.image)
                      }
                      style={styles.myPetCookieIcon}
                      contentFit="contain"
                      allowDownscaling={false}
                      transition={0}
                      accessible={false}
                    />
                    <Text
                      style={[
                        styles.myPetCookieQuantity,
                        cookieQuantity <= 0 &&
                          styles.myPetCookieQuantityDisabled,
                      ]}
                    >
                      {cookieQuantity}
                    </Text>
                  </ControlPressable>
                </View>
              </View>
            </Fragment>
          );
        })}
      </View>
      <View
        style={styles.appliedEffects}
        accessibilityLabel="적용 중인 버프 목록"
      >
        <Text style={styles.appliedEffectsTitle}>적용 중인 버프</Text>
        {buffGroups.length > 0 ? (
          <View style={styles.appliedEffectsList}>
            {appliedBuffTotals.map((effect) => (
              <View key={effect.effectKey} style={styles.appliedEffectRow}>
                <Text style={styles.appliedEffectLabel} numberOfLines={1}>
                  {SLIME_EFFECT_LABELS[effect.effectKey] ?? effect.effectKey}
                </Text>
                <Text
                  style={styles.appliedEffectDescription}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {SLIME_EFFECT_DESCRIPTIONS[effect.effectKey] ?? ""}
                </Text>
                <Text style={styles.appliedEffectValue}>
                  +{formatBuffPercent(effect.bps)}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.appliedEffectsEmpty}>
            현재 적용 중인 버프가 없어요.
          </Text>
        )}
      </View>
    </>
  );
}
