import type { EquippedFloor } from "../../lib/slime-assets";
import type { Href } from "expo-router";
import type { MeResponse } from "../../lib/types";
import type { MobileSlimeHome } from "../../lib/slimes";
import type { ReactNode } from "react";
import type { StudentAssignmentTodo } from "../../lib/types";
import type { StudentDailyRewardProgress } from "../../lib/types";
import type { StudentDuty } from "../../lib/types";
import type { WalkingDailyStepRewards } from "../../lib/walking-health";
import type { WalkingMonthlyAttendanceReward } from "../../lib/walking-health";
import type { WalkingWeeklyStepRewards } from "../../lib/walking-health";
import type { WalletSummary } from "../../lib/types";
import { ActivityIndicator } from "react-native";
import { BookOpen } from "lucide-react-native";
import { CalendarCheck } from "lucide-react-native";
import { ChevronRight } from "lucide-react-native";
import { CircleCheck } from "lucide-react-native";
import { ControlPressable } from "../../components/ui";
import { Footprints } from "lucide-react-native";
import { MessageCircle } from "lucide-react-native";
import { Pill } from "../../components/ui";
import { SectionHeader } from "../../components/ui";
import { SectionNav } from "../../components/NavigationTabs";
import { SectionNavItem } from "../../components/NavigationTabs";
import { SlimeSprite } from "../../components/slime/SlimeSprite";
import { Text } from "react-native";
import { View } from "react-native";
import { colors } from "../../theme/tokens";
import { iconSizes } from "../../theme/tokens";
import { isAssignmentReminderVisible } from "../../lib/student-notifications";
import { layout } from "../../theme/tokens";
import { pageChrome } from "../../theme/tokens";
import { resolveEquippedSceneBackground } from "../../lib/slimes";
import { resolveEquippedSlimePropAction } from "../../lib/slime-props";
import { resolveEquippedSlimeWearables } from "../../lib/slimes";
import { resolveEquippedVehicle } from "../../lib/slimes";
import { resolvePetCardSceneGeometry } from "../../components/slime/slime-types";
import { roleEmoji } from "../../lib/student-navigation";
import { selectSceneBackgroundSpritePath } from "../../lib/slimes";
import { slimeUi } from "../../theme/tokens";
import { stageForColor } from "../../lib/slimes";
import { studentDutyTarget } from "../../lib/student-navigation";
import { styles } from "../../components/student-screens/student-home.styles";
import { useMemo } from "react";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useWindowDimensions } from "react-native";
import { visibleEquippedSlimeItemKeys } from "../../lib/slime-item-visibility";

const SLIME_TRAMPOLINE_ITEM_KEY = "slime-blue-trampoline";

export function DailyGamePanel({
  petHome,
  dailyRewards,
  dailyWalking,
  weeklyWalking,
  walkingRankRewardCount,
  attendance,
  readingClaimableCount,
  readingRankRewardCount,
  loading,
  error,
  onOpenAttendance,
  onOpenWalkingMissions,
  onOpenWalkingRank,
  onOpenReadingMissions,
  onOpenReadingRank,
  onOpenBoards,
}: {
  petHome: MobileSlimeHome | null;
  dailyRewards: MeResponse["dailyRewards"];
  dailyWalking: WalkingDailyStepRewards | null;
  weeklyWalking: WalkingWeeklyStepRewards | null;
  walkingRankRewardCount: number;
  attendance: WalkingMonthlyAttendanceReward | null;
  readingClaimableCount: number;
  readingRankRewardCount: number;
  loading: boolean;
  error: string | null;
  onOpenAttendance: () => void;
  onOpenWalkingMissions: () => void;
  onOpenWalkingRank: () => void;
  onOpenReadingMissions: () => void;
  onOpenReadingRank: () => void;
  onOpenBoards: () => void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const homePetScene = useMemo(() => {
    const contentWidth = Math.min(windowWidth, layout.readableMaxWidth);
    const bodyWidth = Math.max(
      0,
      contentWidth - pageChrome.horizontalPadding * 2,
    );
    // Home pet pane is authored as 46% of the daily-game row.
    const paneWidth = bodyWidth * 0.46;
    // Phone keeps the authored 120px scene (0.3125 scale) inside the 46% pane.
    // Fill factor is the phone scene width over the phone pane width so compact
    // layouts stay put while wider tablets grow the whole scene uniformly.
    const phoneBodyWidth = Math.max(0, 360 - pageChrome.horizontalPadding * 2);
    const phonePaneWidth = phoneBodyWidth * 0.46;
    const phoneSceneWidth =
      64 * 4 * slimeUi.vehicleSceneScale * slimeUi.homePetSceneDisplayScale;
    const widthFill =
      phonePaneWidth > 0 ? Math.min(1, phoneSceneWidth / phonePaneWidth) : 1;
    return resolvePetCardSceneGeometry({
      cardWidth: paneWidth,
      baseDisplayScale: slimeUi.homePetSceneDisplayScale,
      baseSlotHeight: slimeUi.homePetSceneHeight,
      sceneScale: slimeUi.vehicleSceneScale,
      widthFill,
    });
  }, [windowWidth]);
  const color = petHome?.representativeColor;
  const stage = color && petHome ? stageForColor(petHome, color) : null;
  const equippedItems =
    color && petHome ? (petHome.equippedItemsByColor[color] ?? []) : [];
  const visibleItems = color
    ? visibleEquippedSlimeItemKeys(
        equippedItems,
        petHome?.hiddenItemsByColor[color],
      )
    : [];
  const equippedFloor = visibleItems.reduce<EquippedFloor>(
    (current, itemKey) =>
      petHome?.shopCatalog.find((item) => item.key === itemKey)?.floor ??
      current,
    "none",
  );
  const equippedBackground = resolveEquippedSceneBackground(
    visibleItems,
    petHome?.shopCatalog ?? [],
  );
  const equippedBackgroundPath = equippedBackground
    ? selectSceneBackgroundSpritePath(equippedBackground)
    : null;
  const equippedWearables = resolveEquippedSlimeWearables(
    visibleItems,
    petHome?.shopCatalog ?? [],
  );
  const equippedVehicle = resolveEquippedVehicle(
    visibleItems,
    petHome?.shopCatalog ?? [],
  );
  const usesTrampoline = equippedVehicle?.key === SLIME_TRAMPOLINE_ITEM_KEY;
  const renderedVehicle = usesTrampoline ? null : equippedVehicle;
  const propAction = resolveEquippedSlimePropAction(
    visibleItems,
    petHome?.shopCatalog ?? [],
  );
  const action = usesTrampoline
    ? ("floor-interaction" as const)
    : ("idle" as const);

  return (
    <View style={styles.dailyGamePanel}>
      <View style={styles.dailyGameHeader}>
        <View style={styles.petHeaderTitle}>
          <Text style={styles.dailyGameTitle}>대표 펫</Text>
        </View>
        <View style={styles.rewardHeaderTitle}>
          <Text style={styles.dailyGameTitle}>오늘 보상</Text>
        </View>
      </View>
      <View style={styles.dailyGameBody}>
        <View style={styles.petPane}>
          {color && stage !== null ? (
            <View
              style={[
                styles.representativePetScene,
                { height: homePetScene.slotHeight },
              ]}
            >
              <SlimeSprite
                slimeColor={color}
                growthStage={stage}
                action={action}
                equippedFloor={usesTrampoline ? "trampoline" : equippedFloor}
                repeat={Boolean(propAction) || action !== "idle"}
                propAction={propAction}
                wearables={equippedWearables}
                drinkFlavor={equippedWearables.drink}
                vehicleSpritePath={
                  renderedVehicle?.vehicleSheetPath ??
                  renderedVehicle?.spritePath
                }
                vehicleGroundedSpritePath={
                  renderedVehicle?.vehicleGroundedSpritePath
                }
                vehicleEffectSpritePaths={
                  renderedVehicle?.vehicleEffectSpritePaths
                }
                vehicleFrameCount={renderedVehicle?.vehicleFrameCount}
                vehicleGroundedFrameCount={
                  renderedVehicle?.vehicleGroundedFrameCount
                }
                vehicleGroundedFrameDurationMs={
                  renderedVehicle?.vehicleGroundedFrameDurationMs
                }
                vehicleCanvasHeight={renderedVehicle?.vehicleCanvasHeight}
                vehicleCharacterOffsetY={
                  renderedVehicle?.vehicleCharacterOffsetY
                }
                vehicleBobY={renderedVehicle?.vehicleBobY}
                vehicleRiseY={renderedVehicle?.vehicleRiseY}
                vehicleOffsetX={renderedVehicle?.vehicleOffsetX}
                displayScale={homePetScene.displayScale}
                expandSceneSurfaces
                hostBackground={Boolean(equippedBackgroundPath)}
                backgroundSpritePath={equippedBackgroundPath ?? undefined}
                accessibilityLabel="내 대표 펫"
              />
            </View>
          ) : (
            <View style={styles.petEmptyState} accessibilityRole="text">
              <Text style={styles.petEmptyText}>대표펫이 없어요</Text>
            </View>
          )}
        </View>
        <DailyRewardChecklist
          dailyRewards={dailyRewards}
          dailyWalking={dailyWalking}
          weeklyWalking={weeklyWalking}
          walkingRankRewardCount={walkingRankRewardCount}
          attendance={attendance}
          readingClaimableCount={readingClaimableCount}
          readingRankRewardCount={readingRankRewardCount}
          loading={loading}
          error={error}
          onOpenAttendance={onOpenAttendance}
          onOpenWalkingMissions={onOpenWalkingMissions}
          onOpenWalkingRank={onOpenWalkingRank}
          onOpenReadingMissions={onOpenReadingMissions}
          onOpenReadingRank={onOpenReadingRank}
          onOpenBoards={onOpenBoards}
        />
      </View>
    </View>
  );
}

function DailyRewardChecklist({
  dailyRewards,
  dailyWalking,
  weeklyWalking,
  walkingRankRewardCount,
  attendance,
  readingClaimableCount,
  readingRankRewardCount,
  loading,
  error,
  onOpenAttendance,
  onOpenWalkingMissions,
  onOpenWalkingRank,
  onOpenReadingMissions,
  onOpenReadingRank,
  onOpenBoards,
}: {
  dailyRewards: MeResponse["dailyRewards"];
  dailyWalking: WalkingDailyStepRewards | null;
  weeklyWalking: WalkingWeeklyStepRewards | null;
  walkingRankRewardCount: number;
  attendance: WalkingMonthlyAttendanceReward | null;
  readingClaimableCount: number;
  readingRankRewardCount: number;
  loading: boolean;
  error: string | null;
  onOpenAttendance: () => void;
  onOpenWalkingMissions: () => void;
  onOpenWalkingRank: () => void;
  onOpenReadingMissions: () => void;
  onOpenReadingRank: () => void;
  onOpenBoards: () => void;
}) {
  const today = dailyWalking?.day;
  const attendanceClaimable =
    attendance?.claimableAttendance?.filter(
      (entry) => !today || entry.day <= today,
    ) ?? [];
  const attendanceComplete = Boolean(
    today && attendance?.attendanceDays?.includes(today),
  );
  const walkingClaimable =
    dailyWalking?.tiers.filter((tier) => tier.claimable) ?? [];
  const weeklyWalkingClaimableCount =
    weeklyWalking?.tiers.filter((tier) => tier.achieved && !tier.claimed)
      .length ?? 0;
  const walkingMissionClaimableCount =
    walkingClaimable.length + weeklyWalkingClaimableCount;
  const walkingStatus = rewardSourcesLabel([
    ["일간", walkingClaimable.length],
    ["주간", weeklyWalkingClaimableCount],
    ["Top 5", walkingRankRewardCount],
  ]);
  const readingStatus = rewardSourcesLabel([
    ["주간", readingClaimableCount],
    ["Top 5", readingRankRewardCount],
  ]);

  if (loading && !dailyWalking) {
    return (
      <View
        style={styles.dailyRewardList}
        accessibilityLabel="오늘 보상 불러오는 중"
      >
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={styles.dailyRewardLoading}>현황 확인 중…</Text>
      </View>
    );
  }

  return (
    <View
      style={styles.dailyRewardList}
      accessibilityLabel="오늘 받을 수 있는 보상"
    >
      <DailyRewardRow
        icon={CalendarCheck}
        label="출석"
        status={
          attendanceClaimable.length > 0
            ? `${attendanceClaimable.length}개 받기`
            : attendanceComplete
              ? "오늘 완료"
              : "접속 확인 중"
        }
        complete={attendanceComplete && attendanceClaimable.length === 0}
        claimable={attendanceClaimable.length > 0}
        onPress={onOpenAttendance}
      />
      {walkingMissionClaimableCount + walkingRankRewardCount > 0 ? (
        <DailyRewardRow
          icon={Footprints}
          label="걷기"
          status={walkingStatus}
          claimable
          onPress={
            walkingMissionClaimableCount > 0
              ? onOpenWalkingMissions
              : onOpenWalkingRank
          }
        />
      ) : null}
      <DailyRewardRow
        icon={MessageCircle}
        label="댓글"
        status={progressLabel(dailyRewards?.comment)}
        complete={dailyRewards?.comment.complete === true}
        disabled={dailyRewards?.comment.enabled === false}
        onPress={onOpenBoards}
      />
      {readingClaimableCount + readingRankRewardCount > 0 ? (
        <DailyRewardRow
          icon={BookOpen}
          label="독서"
          status={readingStatus}
          claimable
          onPress={
            readingClaimableCount > 0
              ? onOpenReadingMissions
              : onOpenReadingRank
          }
        />
      ) : null}
      {error ? (
        <Text style={styles.dailyRewardError} numberOfLines={1}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function rewardSourcesLabel(sources: Array<[string, number]>): string {
  return sources
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${label} ${count}`)
    .join(" · ");
}

function progressLabel(progress: StudentDailyRewardProgress | undefined) {
  if (!progress) return "확인 중";
  if (!progress.enabled) return "보상 없음";
  if (progress.complete) return "오늘 완료";
  return `${progress.earnedCount}/${progress.dailyCap} 받음`;
}

type DailyRewardIcon = typeof CalendarCheck;

function DailyRewardRow({
  icon: Icon,
  label,
  status,
  complete = false,
  claimable = false,
  busy = false,
  disabled = false,
  onPress,
}: {
  icon: DailyRewardIcon;
  label: string;
  status: string;
  complete?: boolean;
  claimable?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <ControlPressable
      style={styles.dailyRewardRow}
      onPress={onPress}
      disabled={busy}
      accessibilityLabel={`${label} 보상, ${busy ? "처리 중" : status}`}
      accessibilityState={{ busy, disabled: disabled || busy }}
    >
      <Icon
        size={iconSizes.sm}
        color={
          complete
            ? colors.plantActive
            : claimable
              ? colors.accent
              : colors.textMuted
        }
        strokeWidth={2}
        accessible={false}
      />
      <Text style={styles.dailyRewardLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[
          styles.dailyRewardStatus,
          complete && styles.dailyRewardStatusComplete,
          claimable && styles.dailyRewardStatusClaimable,
          disabled && styles.dailyRewardStatusDisabled,
        ]}
        numberOfLines={1}
      >
        {busy ? "받는 중…" : status}
      </Text>
      {complete ? (
        <CircleCheck
          size={iconSizes.sm}
          color={colors.plantActive}
          strokeWidth={2.4}
          accessible={false}
        />
      ) : (
        <ChevronRight
          size={iconSizes.sm}
          color={colors.textFaint}
          strokeWidth={2}
          accessible={false}
        />
      )}
    </ControlPressable>
  );
}

const ASSIGNMENT_VISIBLE_LIMIT = 4;

function assignmentTarget(item: StudentAssignmentTodo): string | null {
  if (!item.href) return null;
  if (item.href.includes("/check") || item.href.startsWith("/classroom/")) {
    return `/(student)/check?classroomId=${encodeURIComponent(item.boardSlug)}`;
  }
  return `/(student)/board/${encodeURIComponent(item.boardSlug)}`;
}

function formatAssignmentDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function AssignmentPanel({
  assignments,
}: {
  assignments: StudentAssignmentTodo[];
}) {
  const router = useRouter();
  const missingCount = assignments.filter((item) => !item.submitted).length;
  const completedCount = assignments.length - missingCount;
  const [filter, setFilter] = useState<"missing" | "completed">(
    missingCount > 0 ? "missing" : "completed",
  );
  const [showAll, setShowAll] = useState(false);

  if (assignments.length === 0) return null;

  const ordered = [...assignments].sort((a, b) => {
    if (a.submitted !== b.submitted) return a.submitted ? 1 : -1;
    return b.assignedAt.localeCompare(a.assignedAt);
  });
  const filtered = ordered.filter((item) =>
    filter === "missing" ? !item.submitted : item.submitted,
  );
  const visibleItems = showAll
    ? filtered
    : filtered.slice(0, ASSIGNMENT_VISIBLE_LIMIT);
  const hiddenCount = Math.max(filtered.length - visibleItems.length, 0);

  const emptyMessage =
    filter === "missing" ? "미제출 과제가 없어요" : "완료한 과제가 없어요";

  return (
    <View style={styles.assignmentPanel}>
      <SectionHeader
        title="과제 목록"
        right={
          <SectionNav style={styles.sectionNav} accessibilityLabel="과제 필터">
            <FilterChip
              active={filter === "missing"}
              onPress={() => setFilter("missing")}
              tone="danger"
            >
              미제출 {missingCount}
            </FilterChip>
            <FilterChip
              active={filter === "completed"}
              onPress={() => setFilter("completed")}
              tone="neutral"
            >
              완료 {completedCount}
            </FilterChip>
          </SectionNav>
        }
      />

      <View style={styles.assignmentList}>
        <View style={styles.assignmentRows}>
          {filtered.length === 0 ? (
            <Text style={styles.assignmentEmpty}>{emptyMessage}</Text>
          ) : (
            visibleItems.map((item) => {
              const target = assignmentTarget(item);
              return (
                <AssignmentRow
                  key={item.id}
                  item={item}
                  onPress={
                    target ? () => router.push(target as Href) : undefined
                  }
                />
              );
            })
          )}
        </View>
        {filtered.length > ASSIGNMENT_VISIBLE_LIMIT ? (
          <ControlPressable
            style={styles.assignmentExpand}
            onPress={() => setShowAll((current) => !current)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showAll }}
          >
            <Text style={styles.assignmentExpandText}>
              {showAll
                ? "접기 ↑"
                : `${filter === "missing" ? "미제출" : "완료"} 과제 ${hiddenCount}개 더 보기 ↓`}
            </Text>
          </ControlPressable>
        ) : null}
      </View>
    </View>
  );
}

function FilterChip({
  active,
  tone,
  onPress,
  children,
}: {
  active: boolean;
  tone: "danger" | "neutral";
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <SectionNavItem selected={active} tone={tone} onPress={onPress}>
      {children}
    </SectionNavItem>
  );
}

function AssignmentRow({
  item,
  onPress,
}: {
  item: StudentAssignmentTodo;
  onPress?: () => void;
}) {
  const submitted = item.submitted;
  const reminded = isAssignmentReminderVisible(item);

  const dateText = submitted
    ? item.submittedAt
      ? `제출 ${formatAssignmentDate(item.submittedAt)}`
      : "제출 완료"
    : reminded
      ? `알림 ${formatAssignmentDate(item.reminderSentAt)}`
      : item.dueAt
        ? `마감 ${formatAssignmentDate(item.dueAt)}`
        : item.assignedAt
          ? `배부 ${formatAssignmentDate(item.assignedAt)}`
          : "과제 배부됨";

  const content = (
    <View style={styles.assignmentRowInner}>
      <View style={styles.assignmentMain}>
        <Text style={styles.assignmentTitleText} numberOfLines={1}>
          {item.sectionTitle}
        </Text>
        <Text style={styles.assignmentSubtitleText} numberOfLines={1}>
          {item.boardTitle}
        </Text>
      </View>
      <View style={styles.assignmentMeta}>
        <Text
          style={[
            styles.assignmentStatus,
            submitted
              ? styles.assignmentStatusSubmitted
              : styles.assignmentStatusMissing,
          ]}
          numberOfLines={1}
        >
          {submitted ? "제출 완료" : "미제출"}
        </Text>
        <Text style={styles.assignmentDate} numberOfLines={1}>
          {dateText}
        </Text>
      </View>
    </View>
  );

  if (onPress) {
    return (
      <ControlPressable style={styles.assignmentRow} onPress={onPress}>
        {content}
      </ControlPressable>
    );
  }

  return (
    <View style={[styles.assignmentRow, styles.assignmentRowStatic]}>
      {content}
    </View>
  );
}

export function WalletCardCompact({
  wallet,
  loading,
  onDetail,
  duties,
  onOpen,
}: {
  wallet: WalletSummary | null;
  loading: boolean;
  onDetail: () => void;
  duties: StudentDuty[];
  onOpen: (path: Href) => void;
}) {
  const [panel, setPanel] = useState<"wallet" | "duties">("wallet");
  const hasDuties = duties.some((duty) => studentDutyTarget(duty) !== null);
  const showDuties = hasDuties && panel === "duties";

  return (
    <View style={styles.walletCardCompact}>
      <SectionHeader
        title={showDuties ? "내 역할" : "은행"}
        titleAccessory={
          !showDuties ? (
            <ControlPressable
              style={styles.walletDetailLink}
              onPress={onDetail}
              hitSlop={8}
              accessibilityLabel="통장 자세히 보기"
            >
              <Text style={styles.walletDetailLinkText} numberOfLines={1}>
                자세히
              </Text>
              <ChevronRight
                size={iconSizes.sm}
                color={colors.textMuted}
                strokeWidth={2}
                accessible={false}
              />
            </ControlPressable>
          ) : undefined
        }
        right={
          hasDuties ? (
            <SectionNav
              style={styles.sectionNav}
              accessibilityLabel="은행 보기"
            >
              <SectionNavItem
                selected={!showDuties}
                onPress={() => setPanel("wallet")}
              >
                통장
              </SectionNavItem>
              <SectionNavItem
                selected={showDuties}
                onPress={() => setPanel("duties")}
              >
                내 역할
              </SectionNavItem>
            </SectionNav>
          ) : undefined
        }
      />

      {showDuties ? (
        <DutySectionCompact duties={duties} onOpen={onOpen} />
      ) : loading || !wallet ? (
        <Text style={styles.walletEmptyCompact}>
          통장 정보를 불러오는 중이에요.
        </Text>
      ) : (
        <>
          <View style={styles.walletBalanceRowCompact}>
            <Text style={styles.walletBalanceLabelCompact}>현재 잔고</Text>
            <Text style={styles.walletBalanceValueCompact}>
              {wallet.balance.toLocaleString()} {wallet.currency.unitLabel}
            </Text>
          </View>
          {wallet.activeFDs.length > 0 && (
            <Pill tone="accent" textStyle={styles.walletFdPillText}>
              적금 {wallet.activeFDs.length}개
            </Pill>
          )}
        </>
      )}
    </View>
  );
}

function DutySectionCompact({
  duties,
  onOpen,
}: {
  duties: StudentDuty[];
  onOpen: (path: Href) => void;
}) {
  const visible = duties
    .map((duty) => ({ duty, target: studentDutyTarget(duty) }))
    .filter(
      (
        item,
      ): item is {
        duty: StudentDuty;
        target: NonNullable<ReturnType<typeof studentDutyTarget>>;
      } => item.target !== null,
    );
  if (visible.length === 0) return null;

  return (
    <View style={styles.dutyList}>
      {visible.map(({ duty, target }, index) => (
        <ControlPressable
          key={`${duty.classroomId}-${duty.roleKey}`}
          style={[
            styles.dutyRow,
            index === visible.length - 1 && styles.dutyRowLast,
          ]}
          onPress={() => onOpen(target.href as Href)}
          accessibilityLabel={`${duty.classroomName} ${duty.roleLabel} 시작`}
        >
          <Text style={styles.dutyRowEmoji} accessible={false}>
            {duty.emoji ?? roleEmoji(duty.roleKey)}
          </Text>
          <View style={styles.dutyRowCopy}>
            <Text
              style={styles.dutyRowRole}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {duty.roleLabel}
            </Text>
            <Text
              style={styles.dutyRowClassroom}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {duty.classroomName}
            </Text>
          </View>
          <Text style={styles.dutyRowCta} accessible={false}>
            시작
          </Text>
        </ControlPressable>
      ))}
    </View>
  );
}
