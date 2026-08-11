import { ActivityIndicator } from "react-native";
import { AppButton } from "../../components/ui";
import { AppHeader } from "../../components/ui";
import { AppModal } from "../../components/ui";
import { ClassroomTopFive } from "../../components/ClassroomTopFive";
import { ContentTab } from "../../components/NavigationTabs";
import { ContentTabs } from "../../components/NavigationTabs";
import { ControlPressable } from "../../components/ui";
import { Footprints } from "lucide-react-native";
import { Platform } from "react-native";
import { RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView } from "react-native";
import { SectionHeader } from "../../components/ui";
import { Settings } from "lucide-react-native";
import { StudentHeaderActions } from "../../components/StudentHeaderActions";
import { SummaryRow } from "./student-walking-presentation";
import { Text } from "react-native";
import { TitleCollection } from "../../components/TitleCollection";
import { View } from "react-native";
import { WalkingMissionPanel } from "./student-walking-presentation";
import { colors } from "../../theme/tokens";
import { iconSizes } from "../../theme/tokens";
import { spacing } from "../../theme/tokens";
import { studentRewardNumberFormatter as numberFormatter } from "./student-reward-format";
import { styles } from "../../components/student-screens/student-walking.styles";
import type { StudentWalkingScreenViewModel } from "./use-student-walking-screen-model";

export function StudentWalkingScreenView({
  model,
}: {
  model: StudentWalkingScreenViewModel;
}) {
  const {
    connected,
    compactConnectionLabel,
    setSettingsVisible,
    activeView,
    setActiveView,
    refreshing,
    load,
    status,
    error,
    message,
    loading,
    busy,
    openSettings,
    showInitialLoading,
    showEmptyState,
    hasSyncedData,
    today,
    totalSteps,
    averageSteps,
    displayDays,
    dayLabel,
    weekRange,
    maxSteps,
    classroomTopFive,
    classroomRankRewards,
    classroomRankNextResetAt,
    rankRewardPending,
    claimClassroomRankReward,
    policy,
    dailyStepRewards,
    monthlyAttendanceReward,
    claimAttendance,
    weeklyStepRewards,
    representativeSlime,
    setDailyStepRewards,
    setWeeklyStepRewards,
    titles,
    claimingTitleKey,
    claimWalkingTitle,
    settingsVisible,
    connectionLabel,
    sync,
    connect,
  } = model;
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader
        title="걷기"
        right={
          <View style={styles.headerActions}>
            <View style={styles.headerConnection}>
              <View
                style={[
                  styles.connectionDot,
                  connected && styles.connectionDotConnected,
                ]}
              />
              <Text style={styles.headerConnectionText}>
                {compactConnectionLabel}
              </Text>
            </View>
            <ControlPressable
              style={styles.headerIconButton}
              hitSlop={spacing.sm}
              onPress={() => setSettingsVisible(true)}
              accessibilityLabel="걷기 연동 설정"
            >
              <Settings
                size={iconSizes.md}
                color={colors.textMuted}
                accessible={false}
              />
            </ControlPressable>
            <StudentHeaderActions />
          </View>
        }
        rightStyle={styles.headerActionsWrap}
      />
      <View style={styles.pageTabsRow}>
        <ContentTabs accessibilityLabel="걷기 활동 보기" style={styles.viewNav}>
          <ContentTab
            style={styles.viewNavItem}
            selected={activeView === "record"}
            onPress={() => setActiveView("record")}
            accessibilityLabel="걷기 기록 보기"
          >
            걷기 기록
          </ContentTab>
          <ContentTab
            style={styles.viewNavItem}
            selected={activeView === "missions"}
            onPress={() => setActiveView("missions")}
            accessibilityLabel="걷기 미션 보기"
          >
            미션
          </ContentTab>
          <ContentTab
            style={styles.viewNavItem}
            selected={activeView === "titles"}
            onPress={() => setActiveView("titles")}
            accessibilityLabel="걷기 칭호 보기"
          >
            칭호
          </ContentTab>
        </ContentTabs>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true, true)}
            tintColor={colors.accent}
          />
        }
      >
        {status === "needs_update" || error || message ? (
          <View style={styles.scrollLead}>
            {status === "needs_update" ? (
              <AppButton
                loading={busy === "settings"}
                onPress={() => void openSettings()}
              >
                건강 데이터 업데이트
              </AppButton>
            ) : null}

            {error ? (
              <View
                style={styles.errorSection}
                accessible
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
              >
                <Text style={styles.error}>{error}</Text>
                <AppButton
                  variant="secondary"
                  loading={loading || refreshing}
                  onPress={() => void load(true)}
                  accessibilityLabel="걷기 기록 다시 시도"
                >
                  다시 시도
                </AppButton>
              </View>
            ) : null}

            {message ? (
              <Text
                style={styles.notice}
                accessibilityLiveRegion="polite"
                accessibilityRole="text"
              >
                {message}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.tabContent}>
          {activeView === "record" ? (
            <>
              {showInitialLoading ? (
                <View
                  style={styles.stateSection}
                  accessible
                  accessibilityRole="progressbar"
                  accessibilityLabel="걷기 기록을 불러오는 중"
                >
                  <ActivityIndicator color={colors.accent} />
                  <Text style={styles.stateTitle}>
                    걷기 기록을 불러오는 중…
                  </Text>
                </View>
              ) : null}

              {showEmptyState ? (
                <View
                  style={styles.emptySection}
                  accessible
                  accessibilityRole="text"
                >
                  <Text style={styles.stateTitle}>
                    아직 걷기 기록이 없어요.
                  </Text>
                  <Text style={styles.muted}>
                    Android 앱에서 건강 데이터를 연결하면 이번 주 기록이 여기에
                    표시돼요.
                  </Text>
                </View>
              ) : null}

              {!showInitialLoading && hasSyncedData ? (
                <>
                  <View
                    style={styles.summarySection}
                    accessibilityRole="summary"
                  >
                    <SectionHeader title="요약" />
                    <View style={styles.summaryRows}>
                      <SummaryRow
                        label="오늘"
                        value={`${numberFormatter.format(today.steps)}걸음`}
                      />
                      <SummaryRow
                        label="주간"
                        value={`${numberFormatter.format(totalSteps)}걸음`}
                      />
                      <SummaryRow
                        label="평균"
                        value={`${numberFormatter.format(averageSteps)}걸음`}
                      />
                    </View>
                  </View>

                  <View
                    style={styles.chartSection}
                    accessible
                    accessibilityRole="summary"
                  >
                    <SectionHeader
                      title="이번 주 걸음"
                      right={
                        loading ? (
                          <ActivityIndicator
                            color={colors.accent}
                            accessibilityLabel="걷기 기록을 불러오는 중"
                          />
                        ) : (
                          <Footprints
                            color={colors.accent}
                            accessible={false}
                            size={iconSizes.md}
                          />
                        )
                      }
                    />

                    <View style={styles.chartRows}>
                      {displayDays.map((row) => {
                        const label = dayLabel(row.day, today.day);
                        const isFuture = row.day > weekRange.today;
                        const displaySteps = isFuture ? 0 : row.steps;
                        const value = numberFormatter.format(displaySteps);
                        const barWidth =
                          `${Math.round((displaySteps / maxSteps) * 100)}%` as `${number}%`;
                        return (
                          <View
                            key={row.day}
                            style={styles.chartRow}
                            accessible
                            accessibilityRole="text"
                            accessibilityLabel={`${label}: ${value}걸음${isFuture ? ", 아직 날짜가 오지 않았어요" : row.syncedAt ? "" : ", 미동기화"}`}
                          >
                            <Text
                              accessible={false}
                              style={[
                                styles.dayLabel,
                                isFuture && styles.futureDayLabel,
                              ]}
                            >
                              {label}
                            </Text>
                            <View accessible={false} style={styles.barTrack}>
                              <View
                                style={[styles.barFill, { width: barWidth }]}
                              />
                            </View>
                            <Text accessible={false} style={styles.stepLabel}>
                              {isFuture ? "—" : `${value}걸음`}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>

                  <ClassroomTopFive
                    ranks={classroomTopFive.map((rank) => ({
                      studentId: rank.studentId,
                      studentName: rank.studentName,
                      metricValue: rank.weeklySteps,
                      isCurrent: rank.isCurrent,
                      rewardAmount: rank.rewardAmount,
                    }))}
                    rankRewards={classroomRankRewards}
                    nextResetAt={classroomRankNextResetAt}
                    metricUnit="걸음"
                    rewardPending={rankRewardPending}
                    onClaimReward={(weekStart) =>
                      void claimClassroomRankReward(weekStart)
                    }
                  />
                </>
              ) : null}
            </>
          ) : activeView === "missions" ? (
            <WalkingMissionPanel
              todaySteps={today.steps}
              dailyGoal={policy.stepThreshold}
              dailyRewardAmount={policy.dailyUnitAmount}
              dailyUnitCap={policy.dailyUnitCap}
              dailyStepRewards={dailyStepRewards}
              monthlyAttendanceReward={monthlyAttendanceReward}
              attendanceBusy={busy === "attendance"}
              onClaimAttendance={(day) => void claimAttendance(day)}
              weeklyStepRewards={weeklyStepRewards}
              representativeSlime={representativeSlime}
              onDailyStepRewardsChange={setDailyStepRewards}
              onWeeklyStepRewardsChange={setWeeklyStepRewards}
            />
          ) : (
            <TitleCollection
              titles={titles}
              emptyHint="걸음 기록을 쌓으면 칭호를 얻을 수 있어요."
              claimingKey={claimingTitleKey}
              onClaim={(titleKey) => void claimWalkingTitle(titleKey)}
            />
          )}
        </View>
      </ScrollView>
      <AppModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        closeOnBackdropPress
        accessibilityLabel="걷기 연동 설정"
        sheetStyle={styles.settingsSheet}
      >
        <Text style={styles.settingsTitle}>걷기 연동</Text>
        <Text style={styles.settingsHelp}>상태: {connectionLabel}</Text>
        <Text style={styles.settingsHelp}>
          권한:{" "}
          {Platform.OS === "ios"
            ? "Apple 건강 걸음 수·동작 및 피트니스"
            : "걸음 수 읽기"}
        </Text>
        <Text style={styles.settingsHelp}>목적: 걷기 기록·보상·학급 순위</Text>
        <Text style={styles.settingsHelp}>
          관리:{" "}
          {Platform.OS === "ios"
            ? "Apple 건강·iPhone 설정"
            : "Health Connect 설정"}
        </Text>
        <View style={styles.settingsActions}>
          <AppButton
            variant="secondary"
            onPress={() => setSettingsVisible(false)}
          >
            나중에
          </AppButton>
          {status === "available" ? (
            <AppButton
              loading={busy === (connected ? "sync" : "connect")}
              onPress={() => void (connected ? sync() : connect())}
            >
              연결
            </AppButton>
          ) : null}
        </View>
      </AppModal>
    </SafeAreaView>
  );
}
