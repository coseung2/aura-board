import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check, ChevronDown, ChevronUp } from "lucide-react-native";
import { ParentBottomNav } from "../../components/parent-bottom-nav";
import { ParentHeaderActions } from "../../components/parent-header-actions";
import {
  AppButton,
  AppHeader,
  ControlPressable,
  SectionHeader,
} from "../../components/ui";
import { SectionNav, SectionNavItem } from "../../components/NavigationTabs";
import { ApiError, getApiBase, parentApiFetch } from "../../lib/api";
import {
  PARENT_READING_CACHE_KEY,
  readParentDataCache,
  revalidateParentDataCache,
} from "../../lib/parent-data-cache";
import { resolveParentSelectedChildId } from "../../lib/parent-overview-state";
import {
  clearParentSession,
  getUnifiedLoginRoute,
  loadParentSelectedChild,
  saveParentSelectedChild,
} from "../../lib/session";
import type {
  ParentReadingEntry,
  ParentReadingResponse,
} from "../../lib/types";
import {
  borders,
  colors,
  iconSizes,
  pageChrome,
  radii,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";

type BookType = ParentReadingEntry["bookType"];

function cachedReading(): ParentReadingResponse | null {
  return (
    readParentDataCache<ParentReadingResponse>(PARENT_READING_CACHE_KEY, {
      kind: "reading",
    })?.data ?? null
  );
}

export default function ParentReadingScreen() {
  const router = useRouter();
  const initial = cachedReading();
  const [children, setChildren] = useState<ParentReadingResponse["children"]>(
    initial?.children ?? [],
  );
  const [selectedChildId, setSelectedChildId] = useState<string | null>(
    initial?.children[0]?.studentId ?? null,
  );
  const [selectedChildRestored, setSelectedChildRestored] = useState(false);
  const selectedChildRestoredRef = useRef(false);
  const [bookType, setBookType] = useState<BookType>("story");
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [childMenuOpen, setChildMenuOpen] = useState(false);
  const [loading, setLoading] = useState(!initial);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuthError = useCallback(async (cause: unknown) => {
    if (cause instanceof ApiError && cause.status === 401) {
      await clearParentSession();
      router.replace(getUnifiedLoginRoute("parent"));
      return true;
    }
    return false;
  }, [router]);

  const applyResponse = useCallback((response: ParentReadingResponse) => {
    setChildren(response.children);
    setSelectedChildId((current) =>
      response.children.some((child) => child.studentId === current)
        ? current
        : response.children[0]?.studentId ?? null,
    );
  }, []);

  const load = useCallback(async (refresh = false) => {
    const cached = cachedReading();
    if (cached) {
      applyResponse(cached);
      setLoading(false);
    } else if (!refresh) {
      setLoading(true);
    }
    if (refresh) setRefreshing(true);
    setError(null);

    try {
      await revalidateParentDataCache(
        PARENT_READING_CACHE_KEY,
        () =>
          parentApiFetch<ParentReadingResponse>(
            __DEV__
              ? `${getApiBase()}/api/parent/reading`
              : "/api/parent/reading",
            { forceRefresh: refresh },
          ),
        { kind: "reading", force: refresh },
      );
      const latest = cachedReading();
      if (latest) applyResponse(latest);
    } catch (cause) {
      if (!(await handleAuthError(cause))) {
        setError("자녀 독서 기록을 불러오지 못했어요.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applyResponse, handleAuthError]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    let active = true;
    void loadParentSelectedChild().then((stored) => {
      if (!active) return;
      const preferStored = !selectedChildRestoredRef.current;
      setSelectedChildId((current) =>
        resolveParentSelectedChildId(children, current, stored, preferStored),
      );
      selectedChildRestoredRef.current = true;
      setSelectedChildRestored(true);
    });
    return () => {
      active = false;
    };
  }, [children]);

  useEffect(() => {
    if (selectedChildRestored && selectedChildId) {
      void saveParentSelectedChild(selectedChildId);
    }
  }, [selectedChildId, selectedChildRestored]);

  const selectedChild =
    children.find((child) => child.studentId === selectedChildId) ?? null;
  const counts = useMemo(
    () => ({
      story:
        selectedChild?.entries.filter((entry) => entry.bookType === "story")
          .length ?? 0,
      comic:
        selectedChild?.entries.filter((entry) => entry.bookType === "comic")
          .length ?? 0,
    }),
    [selectedChild],
  );
  const visibleEntries = useMemo(
    () =>
      selectedChild?.entries.filter((entry) => entry.bookType === bookType) ?? [],
    [bookType, selectedChild],
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader title="독서" right={<ParentHeaderActions />} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.accent}
          />
        }
      >
        {loading && children.length === 0 ? (
          <View style={styles.state}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.muted}>독서 기록을 불러오는 중이에요.</Text>
          </View>
        ) : error && children.length === 0 ? (
          <View style={styles.state} accessibilityRole="alert">
            <Text style={styles.stateTitle}>기록을 불러오지 못했어요.</Text>
            <Text style={styles.muted}>{error}</Text>
            <AppButton onPress={() => void load()}>다시 시도</AppButton>
          </View>
        ) : children.length === 0 ? (
          <View style={styles.state}>
            <Text style={styles.stateTitle}>연결된 자녀가 없어요.</Text>
            <Text style={styles.muted}>
              자녀 연결이 승인되면 독서 기록을 볼 수 있어요.
            </Text>
          </View>
        ) : (
          <>
            {selectedChild ? (
              <View style={styles.childSelector}>
                <ControlPressable
                  style={styles.childSelectTrigger}
                  onPress={() => setChildMenuOpen((open) => !open)}
                  accessibilityLabel="자녀 전환"
                  accessibilityState={{ expanded: childMenuOpen }}
                >
                  <Text style={styles.childSelectText} numberOfLines={1}>
                    {selectedChild.name}(
                    {selectedChild.classroom?.name ?? "학급 미배정"})
                  </Text>
                  <ChevronDown
                    size={iconSizes.sm}
                    color={colors.textMuted}
                    accessible={false}
                  />
                </ControlPressable>
                {childMenuOpen ? (
                  <View style={styles.childMenu} accessibilityRole="menu">
                    {children.map((child) => {
                      const selected = child.studentId === selectedChildId;
                      return (
                        <ControlPressable
                          key={child.studentId}
                          style={styles.childOption}
                          onPress={() => {
                            setSelectedChildId(child.studentId);
                            setChildMenuOpen(false);
                          }}
                          accessibilityRole="menuitem"
                          accessibilityState={{ selected }}
                        >
                          <Text style={styles.childOptionText} numberOfLines={1}>
                            {child.name}(
                            {child.classroom?.name ?? "학급 미배정"})
                          </Text>
                          {selected ? (
                            <Check
                              size={iconSizes.sm}
                              color={colors.accent}
                              accessible={false}
                            />
                          ) : null}
                        </ControlPressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={styles.heading}>
              <Text style={styles.childName}>{selectedChild?.name}</Text>
              <Text style={styles.childMeta}>
                {selectedChild?.classroom?.name ?? "학급 미배정"}
                {selectedChild?.number != null
                  ? ` · ${selectedChild.number}번`
                  : ""}
              </Text>
            </View>

            <View style={styles.historyColumn}>
              <SectionHeader
                title="기록 목록"
                right={
                  <SectionNav accessibilityLabel="독서 기록 종류">
                    <SectionNavItem
                      selected={bookType === "story"}
                      onPress={() => setBookType("story")}
                      accessibilityLabel={`이야기책 ${counts.story}개`}
                    >
                      {`이야기책 ${counts.story}`}
                    </SectionNavItem>
                    <SectionNavItem
                      selected={bookType === "comic"}
                      onPress={() => setBookType("comic")}
                      accessibilityLabel={`만화책 ${counts.comic}개`}
                    >
                      {`만화책 ${counts.comic}`}
                    </SectionNavItem>
                  </SectionNav>
                }
              />

              {selectedChild?.entries.length === 0 ? (
                <View style={styles.stateCompact}>
                  <Text style={styles.stateTitle}>아직 독서 기록이 없어요.</Text>
                </View>
              ) : visibleEntries.length === 0 ? (
                <Text style={styles.emptyType}>
                  아직 {bookType === "story" ? "이야기책" : "만화책"} 기록이
                  없어요.
                </Text>
              ) : (
                visibleEntries.map((entry) => {
                  const expanded = expandedEntryId === entry.id;
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
                          {entry.aiFeedback ? (
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
                                {entry.bookType === "comic" ? "만화책" : "이야기책"}
                              </Text>
                              <Text style={styles.entryDate}>
                                {new Date(entry.createdAt).toLocaleDateString("ko-KR")}
                              </Text>
                            </View>
                            <Text style={styles.meta}>{entry.author}</Text>
                            <Text style={styles.body}>{entry.reflection}</Text>
                            {entry.aiFeedback ? (
                              <View style={styles.feedbackRow}>
                                <Text style={styles.feedbackScore}>
                                  {entry.aiScore ?? 0}점
                                </Text>
                                <Text style={styles.feedback}>
                                  {entry.aiFeedback}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </>
        )}
      </ScrollView>
      <ParentBottomNav active="reading" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: pageChrome.contentStartGap + spacing.lg,
    paddingBottom: spacing.xxxl + spacing.xxl,
    gap: spacing.xl,
  },
  childSelector: { alignItems: "center", paddingHorizontal: spacing.lg },
  childSelectTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.transparent,
    borderWidth: borders.none,
  },
  childSelectText: { ...typography.label, color: colors.text },
  childMenu: {
    width: "100%",
    marginTop: spacing.xs,
    borderTopWidth: borders.hairline,
    borderTopColor: colors.border,
  },
  childOption: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: borders.none,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  childOptionText: { ...typography.label, color: colors.text },
  heading: { gap: spacing.xxs },
  childName: { ...typography.title, color: colors.text },
  childMeta: { ...typography.badge, color: colors.textMuted },
  historyColumn: { gap: spacing.md },
  state: {
    flex: 1,
    minHeight: tapMin * 8 + spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  stateCompact: { paddingVertical: spacing.xxl, alignItems: "center" },
  stateTitle: {
    ...typography.section,
    color: colors.text,
    textAlign: "center",
  },
  muted: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  emptyType: {
    ...typography.body,
    color: colors.textMuted,
    paddingVertical: spacing.xl,
    textAlign: "center",
  },
  error: { ...typography.body, color: colors.danger, textAlign: "center" },
  entry: { flexDirection: "row", gap: spacing.sm },
  entryIndex: {
    width: borders.medium,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
  },
  entryContent: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radii.btn,
  },
  entryExpanded: {
    padding: spacing.sm,
    backgroundColor: colors.surfaceAlt,
  },
  entryToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: borders.none,
    borderColor: colors.transparent,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  entryDetails: { gap: spacing.sm },
  entryTopline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  entryTitle: { ...typography.section, color: colors.text, flex: 1 },
  entryScoreCollapsed: {
    ...typography.badge,
    color: colors.accentTintedText,
  },
  entryType: { ...typography.badge, color: colors.accentTintedText },
  entryDate: { ...typography.micro, color: colors.textMuted },
  meta: { ...typography.micro, color: colors.textMuted },
  body: {
    ...typography.body,
    color: colors.text,
  },
  feedbackRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: borders.hairline,
    borderTopColor: colors.border,
  },
  feedbackScore: { ...typography.label, color: colors.accentTintedText },
  feedback: { ...typography.body, color: colors.accentTintedText, flex: 1 },
});
