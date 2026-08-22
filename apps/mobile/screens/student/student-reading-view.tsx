import { ActivityIndicator } from "react-native";
import { AppButton } from "../../components/ui";
import { AppHeader } from "../../components/ui";
import { AppModal } from "../../components/ui";
import { ChevronDown } from "lucide-react-native";
import { ChevronUp } from "lucide-react-native";
import { ClassroomTopFive } from "../../components/ClassroomTopFive";
import { ContentTab } from "../../components/NavigationTabs";
import { ContentTabs } from "../../components/NavigationTabs";
import { ControlPressable } from "../../components/ui";
import { KeyboardAvoidingView } from "react-native";
import { Platform } from "react-native";
import { ReadingWeeklyMissionPanel } from "./student-reading-presentation";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView } from "react-native";
import { SectionHeader } from "../../components/ui";
import { SectionNav } from "../../components/NavigationTabs";
import { SectionNavItem } from "../../components/NavigationTabs";
import { StudentHeaderActions } from "../../components/StudentHeaderActions";
import { SummaryRow } from "./student-reading-presentation";
import { Text } from "react-native";
import { TextField } from "../../components/ui";
import { TitleCollection } from "../../components/TitleCollection";
import { View } from "react-native";
import { WalkingAttendanceCalendar } from "../../components/walking-attendance-calendar";
import { X } from "lucide-react-native";
import { colors } from "../../theme/tokens";
import { iconSizes } from "../../theme/tokens";
import { styles } from "../../components/student-screens/student-reading.styles";
import type { StudentReadingScreenViewModel } from "./use-student-reading-screen-model";

export function StudentReadingScreenView({
  model,
}: {
  model: StudentReadingScreenViewModel;
}) {
  const {
    title,
    activeTab,
    setActiveTab,
    isLandscape,
    summary,
    entries,
    notice,
    openComposer,
    openEditor,
    loading,
    historyBookType,
    setHistoryBookType,
    readingCounts,
    visibleEntries,
    expandedEntryId,
    bookType,
    setExpandedEntryId,
    author,
    reflection,
    requestFeedback,
    classroomTopFive,
    classroomRankRewards,
    rankResetAt,
    rankRewardPending,
    claimClassroomRankReward,
    missionLoading,
    missionError,
    attendanceReward,
    error,
    loadMission,
    attendanceBusy,
    claimAttendance,
    weeklyMissionReward,
    missions,
    load,
    representativeSlime,
    claimingMissionReward,
    missionClaimError,
    claimWeeklyMissionReward,
    titles,
    claimingTitleKey,
    claimReadingTitle,
    composerVisible,
    setComposerVisible,
    composerScrollRef,
    setBookType,
    composerFieldOffsets,
    composerFieldKeys,
    titleInputRef,
    setTitle,
    focusComposerField,
    focusNextComposerField,
    authorInputRef,
    setAuthor,
    reflectionInputRef,
    setReflection,
    saving,
    save,
    editingEntryId,
  } = model;
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader title="독서" right={<StudentHeaderActions />} />
      <ContentTabs accessibilityLabel="독서 보기" style={styles.pageTabs}>
        <ContentTab
          selected={activeTab === "records"}
          onPress={() => setActiveTab("records")}
          accessibilityLabel="독서 기록 보기"
        >
          기록
        </ContentTab>
        <ContentTab
          selected={activeTab === "missions"}
          onPress={() => setActiveTab("missions")}
          accessibilityLabel="독서 미션 보기"
        >
          미션
        </ContentTab>
        <ContentTab
          selected={activeTab === "titles"}
          onPress={() => setActiveTab("titles")}
          accessibilityLabel="독서 칭호 보기"
        >
          칭호
        </ContentTab>
      </ContentTabs>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", android: "height" })}
        style={styles.keyboardWrap}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            isLandscape && styles.contentLandscape,
          ]}
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        >
          <View style={styles.tabContent}>
            {activeTab === "records" ? (
              <>
                <View style={styles.summarySection} accessibilityRole="summary">
                  <SectionHeader title="요약" />
                  <View style={styles.summaryRows}>
                    <SummaryRow
                      label="이번 주"
                      value={`${summary?.weeklyCount ?? 0}권`}
                    />
                    <SummaryRow
                      label="전체"
                      value={`${summary?.totalCount ?? entries.length}권`}
                    />
                    <SummaryRow
                      label="평균 점수"
                      value={
                        summary?.averageScore === null ||
                        summary?.averageScore === undefined
                          ? "-"
                          : `${summary.averageScore}점`
                      }
                    />
                  </View>
                </View>

                {notice ? <Text style={styles.notice}>{notice}</Text> : null}

                <AppButton onPress={openComposer}>독서 기록 작성</AppButton>

                <View
                  style={[
                    styles.historyColumn,
                    isLandscape && styles.landscapeHistoryColumn,
                  ]}
                >
                  <SectionHeader
                    title="내 기록 목록"
                    right={
                      !loading && entries.length > 0 ? (
                        <SectionNav accessibilityLabel="독서 기록 종류">
                          <SectionNavItem
                            style={styles.historyTypeNavItem}
                            selected={historyBookType === "story"}
                            onPress={() => setHistoryBookType("story")}
                            accessibilityLabel={`이야기책 ${readingCounts.story}개`}
                          >
                            {`이야기책 ${readingCounts.story}`}
                          </SectionNavItem>
                          <SectionNavItem
                            style={styles.historyTypeNavItem}
                            selected={historyBookType === "comic"}
                            onPress={() => setHistoryBookType("comic")}
                            accessibilityLabel={`만화책 ${readingCounts.comic}개`}
                          >
                            {`만화책 ${readingCounts.comic}`}
                          </SectionNavItem>
                        </SectionNav>
                      ) : undefined
                    }
                  />

                  {loading ? (
                    <View style={styles.loadingState}>
                      <ActivityIndicator color={colors.accent} />
                      <Text style={styles.muted}>
                        독서 기록을 불러오는 중이에요.
                      </Text>
                    </View>
                  ) : entries.length === 0 ? (
                    <View
                      style={styles.emptyState}
                      accessible
                      accessibilityRole="text"
                    >
                      <Text style={styles.emptyTitle}>아직 기록이 없어요.</Text>
                      <Text style={styles.emptyDescription}>
                        오늘 읽은 책을 첫 번째 기록으로 남겨 보세요.
                      </Text>
                    </View>
                  ) : visibleEntries.length === 0 ? (
                    <Text style={styles.emptyTypeEntry}>
                      아직 {historyBookType === "story" ? "이야기책" : "만화책"}{" "}
                      기록이 없어요.
                    </Text>
                  ) : (
                    visibleEntries.map((entry) => {
                      const expanded = expandedEntryId === entry.id;
                      const typeLabel =
                        entry.bookType === "comic" ? "만화책" : "이야기책";
                      return (
                        <View key={entry.id} style={styles.entry}>
                          <View style={styles.entryIndex} accessible={false} />
                          <View
                            style={[
                              styles.entryContent,
                              expanded && styles.entryExpanded,
                            ]}
                          >
                            <ControlPressable
                              style={styles.entryToggle}
                              onPress={() =>
                                setExpandedEntryId((current) =>
                                  current === entry.id ? null : entry.id,
                                )
                              }
                              accessibilityRole="button"
                              accessibilityLabel={`${entry.title} ${expanded ? "접기" : "펼치기"}`}
                              accessibilityState={{ expanded }}
                            >
                              <Text style={styles.entryTitle} numberOfLines={1}>
                                {entry.title}
                              </Text>
                              {entry.aiFeedbackStatus === "generated" ? (
                                <Text
                                  style={styles.entryScoreCollapsed}
                                  numberOfLines={1}
                                >
                                  {entry.aiScore ?? 0}점
                                </Text>
                              ) : null}
                              {expanded ? (
                                <ChevronUp
                                  size={16}
                                  color={colors.textFaint}
                                  strokeWidth={2}
                                  accessible={false}
                                />
                              ) : (
                                <ChevronDown
                                  size={16}
                                  color={colors.textFaint}
                                  strokeWidth={2}
                                  accessible={false}
                                />
                              )}
                            </ControlPressable>

                            {expanded ? (
                              <View style={styles.entryDetails}>
                                <View style={styles.entryTopline}>
                                  <Text style={styles.entryType}>
                                    {typeLabel}
                                  </Text>
                                  <Text style={styles.entryDate}>
                                    {new Date(
                                      entry.createdAt,
                                    ).toLocaleDateString("ko-KR")}
                                  </Text>
                                </View>
                                <Text style={styles.meta}>{entry.author}</Text>
                                <Text style={styles.body}>
                                  {entry.reflection}
                                </Text>
                                <View style={styles.entryActions}>
                                  <AppButton
                                    variant="primary"
                                    compact
                                    onPress={() => openEditor(entry)}
                                    accessibilityLabel={`${entry.title} 수정`}
                                  >
                                    수정
                                  </AppButton>
                                </View>
                                {entry.aiFeedbackStatus === "generated" &&
                                entry.aiFeedback ? (
                                  <View style={styles.feedbackRow}>
                                    <Text style={styles.feedbackScore}>
                                      {entry.aiScore ?? 0}점
                                    </Text>
                                    <Text style={styles.feedback}>
                                      {entry.aiFeedback}
                                    </Text>
                                  </View>
                                ) : entry.aiFeedbackStatus === "failed" ? (
                                  <View style={styles.feedbackStatusBox}>
                                    <Text style={styles.feedbackStatusText}>
                                      피드백을 준비하지 못했어요. 잠시 후 다시
                                      시도해 주세요.
                                    </Text>
                                  </View>
                                ) : (
                                  <View style={styles.feedbackStatusBox}>
                                    <ActivityIndicator
                                      size="small"
                                      color={colors.accent}
                                    />
                                    <Text style={styles.feedbackStatusText}>
                                      피드백을 기다리는 중...
                                    </Text>
                                  </View>
                                )}
                              </View>
                            ) : null}
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>

                <ClassroomTopFive
                  ranks={classroomTopFive.map((rank) => ({
                    studentId: rank.studentId,
                    studentName: rank.studentName,
                    metricValue: rank.weeklyCount,
                    isCurrent: rank.isCurrent,
                    rewardAmount: Math.max(0, Number(rank.rewardAmount) || 0),
                  }))}
                  rankRewards={classroomRankRewards}
                  nextResetAt={rankResetAt}
                  metricUnit="권"
                  rewardPending={rankRewardPending}
                  onClaimReward={(weekStart) =>
                    void claimClassroomRankReward(weekStart)
                  }
                />
              </>
            ) : activeTab === "missions" ? (
              <View style={styles.missionScreen}>
                {missionLoading || missionError || attendanceReward ? (
                  <View style={styles.missionSection}>
                    {missionLoading ? (
                      <View
                        style={styles.loadingState}
                        accessibilityRole="progressbar"
                      >
                        <ActivityIndicator color={colors.accent} />
                        <Text style={styles.muted}>
                          출석 미션을 불러오는 중이에요.
                        </Text>
                      </View>
                    ) : missionError ? (
                      <View
                        style={styles.missionError}
                        accessibilityRole="alert"
                      >
                        <Text style={styles.error}>{missionError}</Text>
                        <AppButton
                          variant="secondary"
                          onPress={() => void loadMission()}
                        >
                          다시 시도
                        </AppButton>
                      </View>
                    ) : attendanceReward ? (
                      <WalkingAttendanceCalendar
                        reward={attendanceReward}
                        busy={attendanceBusy}
                        onDayPress={(day) => void claimAttendance(day)}
                      />
                    ) : null}
                  </View>
                ) : null}

                <View style={styles.missionSection}>
                  {loading && !weeklyMissionReward && missions.length === 0 ? (
                    <View
                      style={styles.loadingState}
                      accessibilityRole="progressbar"
                    >
                      <ActivityIndicator color={colors.accent} />
                      <Text style={styles.muted}>
                        독서 미션을 불러오는 중이에요.
                      </Text>
                    </View>
                  ) : error && !weeklyMissionReward && missions.length === 0 ? (
                    <View style={styles.missionError} accessibilityRole="alert">
                      <Text style={styles.error}>{error}</Text>
                      <AppButton
                        variant="secondary"
                        onPress={() => void load(true)}
                      >
                        다시 시도
                      </AppButton>
                    </View>
                  ) : (
                    <View style={styles.missionPanelContent}>
                      <Text style={styles.missionNotice} numberOfLines={1}>
                        미션은 피드백 5점 이상을 받은 기록만 인정돼요.
                      </Text>
                      <ReadingWeeklyMissionPanel
                        reward={
                        weeklyMissionReward ?? {
                          weekStart: "",
                          weekEnd: "",
                          amount:
                            missions.reduce(
                              (sum, mission) => sum + (mission.amount || 0),
                              0,
                            ) || 50,
                          completedCount: missions.filter(
                            (mission) => mission.completed,
                          ).length,
                          totalCount: Math.max(1, missions.length || 3),
                          achieved:
                            missions.length > 0 &&
                            missions.every((mission) => mission.completed),
                          claimed:
                            missions.length > 0 &&
                            missions.every((mission) => mission.claimed),
                          claimable: missions.some(
                            (mission) => mission.claimable,
                          ),
                          missions,
                        }
                      }
                      representativeSlime={representativeSlime}
                      claiming={claimingMissionReward}
                      claimError={missionClaimError}
                      onClaim={(missionKey, unit) =>
                        void claimWeeklyMissionReward(missionKey, unit)
                      }
                      />
                    </View>
                  )}
                </View>
              </View>
            ) : (
              <TitleCollection
                titles={titles}
                emptyHint="독서 기록을 쌓으면 칭호를 얻을 수 있어요."
                claimingKey={claimingTitleKey}
                onClaim={(titleKey) => void claimReadingTitle(titleKey)}
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <AppModal
        visible={composerVisible}
        onClose={() => setComposerVisible(false)}
        keyboardAvoiding
        closeOnBackdropPress
        align="center"
        accessibilityLabel={editingEntryId ? "독서 기록 수정" : "독서 기록 작성"}
        sheetStyle={styles.composerSheet}
      >
        <View style={styles.composerHeader}>
          <ControlPressable
            style={styles.composerClose}
            onPress={() => setComposerVisible(false)}
            accessibilityRole="button"
            accessibilityLabel={`${editingEntryId ? "독서 기록 수정" : "독서 기록 작성"} 닫기`}
          >
            <X
              size={iconSizes.md}
              color={colors.textMuted}
              strokeWidth={2}
              accessible={false}
            />
          </ControlPressable>
        </View>

        <ScrollView
          ref={composerScrollRef}
          style={styles.composerScroll}
          contentContainerStyle={styles.composerContent}
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.composerTitle}>
            {editingEntryId ? "독서 기록 수정" : "독서 기록 작성"}
          </Text>
          <SectionNav accessibilityLabel="책 종류">
            <SectionNavItem
              selected={bookType === "story"}
              onPress={() => setBookType("story")}
              accessibilityLabel="이야기책"
            >
              이야기책
            </SectionNavItem>
            <SectionNavItem
              selected={bookType === "comic"}
              onPress={() => setBookType("comic")}
              accessibilityLabel="만화책"
            >
              만화책
            </SectionNavItem>
          </SectionNav>

          <View
            style={styles.fieldGroup}
            onLayout={(event) => {
              composerFieldOffsets.current.title = event.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.fieldLabel}>책 제목</Text>
            <TextField
              key={composerFieldKeys.title}
              ref={titleInputRef}
              value={title}
              onChangeText={setTitle}
              placeholder="책 제목을 입력해 주세요"
              accessibilityLabel="책 제목"
              returnKeyType="next"
              onFocus={() => focusComposerField("title")}
              onSubmitEditing={() => focusNextComposerField("title")}
              maxLength={80}
            />
          </View>

          <View
            style={styles.fieldGroup}
            onLayout={(event) => {
              composerFieldOffsets.current.author = event.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.fieldLabel}>지은이</Text>
            <TextField
              key={composerFieldKeys.author}
              ref={authorInputRef}
              value={author}
              onChangeText={setAuthor}
              placeholder="지은이를 입력해 주세요"
              accessibilityLabel="지은이"
              returnKeyType="next"
              onFocus={() => focusComposerField("author")}
              onSubmitEditing={() => focusNextComposerField("author")}
              maxLength={60}
            />
          </View>

          <View
            style={styles.fieldGroup}
            onLayout={(event) => {
              composerFieldOffsets.current.reflection =
                event.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.fieldLabel}>독서 감상</Text>
            <TextField
              key={composerFieldKeys.reflection}
              ref={reflectionInputRef}
              style={styles.reflectionInput}
              value={reflection}
              onChangeText={setReflection}
              placeholder="재미있었던 점이나 느낀 점"
              accessibilityLabel="독서 감상"
              multiline
              onFocus={() => focusComposerField("reflection")}
              maxLength={600}
            />
          </View>

          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </ScrollView>

        <View style={styles.composerFooter}>
          <AppButton loading={saving} onPress={() => void save()}>
            {editingEntryId ? "수정하기" : "저장하기"}
          </AppButton>
        </View>
      </AppModal>
    </SafeAreaView>
  );
}
