import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  borders,
  check,
  colors,
  pageChrome,
  radii,
  spacing,
  typography,
} from "../../theme/tokens";
import { apiFetch, ApiError } from "../../lib/api";
import { clearSessionToken, getUnifiedLoginRoute } from "../../lib/session";
import type {
  CheckRosterEntry,
  CheckTask,
  CheckTaskDetailResponse,
  CheckTaskListResponse,
  MeResponse,
} from "../../lib/types";
import {
  AppButton,
  AppHeader,
  ControlPressable,
  EmptyState,
  Pill,
  SectionHeader,
  SurfaceCard,
  SurfacePressable,
} from "../../components/ui";

export default function StudentCheckScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ classroomId?: string | string[] }>();
  const routeClassroomId = firstParam(params.classroomId);
  const [classroomId, setClassroomId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<CheckTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CheckTaskDetailResponse | null>(null);
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const handleAuthError = useCallback(
    async (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        await clearSessionToken();
        router.replace(getUnifiedLoginRoute("student"));
        return true;
      }
      return false;
    },
    [router],
  );

  const resolveClassroomId = useCallback(async () => {
    if (routeClassroomId) return routeClassroomId;
    const me = await apiFetch<MeResponse>("/api/student/me");
    const checkDuty = me.duties?.find(
      (duty) => duty.roleKey === "checker" || duty.href.endsWith("/check"),
    );
    return checkDuty?.classroomId ?? null;
  }, [routeClassroomId]);

  const loadTasks = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setListLoading(true);
      setError(null);
      try {
        const resolved = await resolveClassroomId();
        if (!resolved) {
          setClassroomId(null);
          setTasks([]);
          setSelectedTaskId(null);
          setDetail(null);
          setError("체크할 학급 정보를 찾을 수 없어요.");
          return;
        }

        const res = await apiFetch<CheckTaskListResponse>(
          `/api/classrooms/${encodeURIComponent(resolved)}/checks`,
        );
        setClassroomId(resolved);
        setTasks(res.tasks);
        setSelectedTaskId((current) =>
          current && res.tasks.some((task) => task.id === current)
            ? current
            : (res.tasks[0]?.id ?? null),
        );
        if (res.tasks.length === 0) setDetail(null);
      } catch (e) {
        if (await handleAuthError(e)) return;
        setError(errorText(e, "체크 목록을 불러올 수 없어요."));
      } finally {
        setListLoading(false);
        setRefreshing(false);
      }
    },
    [handleAuthError, resolveClassroomId],
  );

  const loadDetail = useCallback(
    async (taskId = selectedTaskId) => {
      if (!classroomId || !taskId) {
        setDetail(null);
        setDraft({});
        return;
      }
      setDetailLoading(true);
      setDetailError(null);
      setToast(null);
      try {
        const res = await apiFetch<CheckTaskDetailResponse>(
          `/api/classrooms/${encodeURIComponent(classroomId)}/checks/${encodeURIComponent(taskId)}`,
        );
        const nextDraft: Record<string, boolean> = {};
        for (const entry of res.roster) {
          nextDraft[entry.student.id] = entry.submission?.submitted ?? false;
        }
        setDetail(res);
        setDraft(nextDraft);
      } catch (e) {
        if (await handleAuthError(e)) return;
        setDetail(null);
        setDraft({});
        setDetailError(errorText(e, "제출 명단을 불러올 수 없어요."));
      } finally {
        setDetailLoading(false);
      }
    },
    [classroomId, handleAuthError, selectedTaskId],
  );

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks],
  );

  const submittedCount = useMemo(
    () => Object.values(draft).filter(Boolean).length,
    [draft],
  );

  const isDirty = useMemo(() => {
    if (!detail) return false;
    return detail.roster.some(
      (entry) =>
        (entry.submission?.submitted ?? false) !== !!draft[entry.student.id],
    );
  }, [detail, draft]);

  function toggleStudent(studentId: string) {
    setDraft((current) => ({ ...current, [studentId]: !current[studentId] }));
    setToast(null);
  }

  function markAll(value: boolean) {
    if (!detail) return;
    const next: Record<string, boolean> = {};
    for (const entry of detail.roster) {
      next[entry.student.id] = value;
    }
    setDraft(next);
    setToast(null);
  }

  async function saveSubmissions() {
    if (!classroomId || !selectedTaskId || !detail) return;
    setSaving(true);
    setDetailError(null);
    setToast(null);
    try {
      await apiFetch(
        `/api/classrooms/${encodeURIComponent(classroomId)}/checks/${encodeURIComponent(selectedTaskId)}/submissions`,
        {
          method: "PUT",
          json: {
            updates: detail.roster.map((entry) => ({
              studentId: entry.student.id,
              submitted: !!draft[entry.student.id],
            })),
          },
        },
      );
      setToast("저장했어요.");
      await loadTasks(true);
      await loadDetail(selectedTaskId);
    } catch (e) {
      if (await handleAuthError(e)) return;
      setDetailError(errorText(e, "저장하지 못했어요."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader title="제출 체크" onBack={() => router.back()} />

      {listLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.muted}>체크 목록을 불러오는 중이에요.</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <AppButton onPress={() => loadTasks()}>다시 시도</AppButton>
        </View>
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadTasks(true)}
              tintColor={colors.accent}
            />
          }
          contentContainerStyle={styles.content}
        >
          <View style={styles.intro}>
            <SectionHeader
              title="진행 중인 체크"
              right={<Pill tone="accent">{tasks.length}개</Pill>}
            />
            <Text style={styles.screenSub}>
              제출물을 확인하고 학생별 상태를 저장해 주세요.
            </Text>
          </View>

          {tasks.length === 0 ? (
            <EmptyState
              title="진행 중인 체크가 없어요."
              description="선생님이 체크를 추가하면 여기에 나타나요."
            />
          ) : (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.taskRow}
              >
                {tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    selected={task.id === selectedTaskId}
                    onPress={() => setSelectedTaskId(task.id)}
                  />
                ))}
              </ScrollView>

              <RosterPanel
                task={selectedTask}
                roster={detail?.roster ?? []}
                draft={draft}
                submittedCount={submittedCount}
                loading={detailLoading}
                error={detailError}
                saving={saving}
                dirty={isDirty}
                toast={toast}
                onToggle={toggleStudent}
                onMarkAll={markAll}
                onSave={saveSubmissions}
                onRetry={() => loadDetail()}
              />
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function TaskCard({
  task,
  selected,
  onPress,
}: {
  task: CheckTask;
  selected: boolean;
  onPress: () => void;
}) {
  const due = formatDate(task.dueDate);
  const progress =
    task.totalStudents > 0
      ? (`${Math.round((task.submittedCount / task.totalStudents) * 100)}%` as const)
      : "0%";

  return (
    <SurfacePressable
      style={[styles.taskCard, selected && styles.taskCardSelected]}
      onPress={onPress}
      accessibilityState={{ selected }}
    >
      <View style={styles.taskCardTop}>
        <Text style={styles.taskTitle} numberOfLines={2}>
          {task.title}
        </Text>
        {due ? <Pill tone="warning">{due}</Pill> : null}
      </View>
      {task.description ? (
        <Text style={styles.taskDesc} numberOfLines={2}>
          {task.description}
        </Text>
      ) : null}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: progress }]} />
      </View>
      <Text style={styles.taskMeta}>
        {task.submittedCount}/{task.totalStudents} 제출
      </Text>
    </SurfacePressable>
  );
}

function RosterPanel({
  task,
  roster,
  draft,
  submittedCount,
  loading,
  error,
  saving,
  dirty,
  toast,
  onToggle,
  onMarkAll,
  onSave,
  onRetry,
}: {
  task: CheckTask | null;
  roster: CheckRosterEntry[];
  draft: Record<string, boolean>;
  submittedCount: number;
  loading: boolean;
  error: string | null;
  saving: boolean;
  dirty: boolean;
  toast: string | null;
  onToggle: (studentId: string) => void;
  onMarkAll: (value: boolean) => void;
  onSave: () => void;
  onRetry: () => void;
}) {
  if (!task) return null;

  return (
    <SurfaceCard style={styles.rosterCard}>
      <View style={styles.rosterHeader}>
        <View style={styles.rosterTitleBlock}>
          <Text style={styles.rosterTitle} numberOfLines={2}>
            {task.title}
          </Text>
          <Text style={styles.rosterMeta}>
            {submittedCount}/{roster.length} 제출
          </Text>
        </View>
        <View style={styles.bulkRow}>
          <AppButton
            variant="secondary"
            onPress={() => onMarkAll(true)}
            disabled={saving || loading || roster.length === 0}
            textStyle={styles.bulkText}
          >
            전체 제출
          </AppButton>
          <AppButton
            variant="secondary"
            onPress={() => onMarkAll(false)}
            disabled={saving || loading || roster.length === 0}
            textStyle={styles.bulkText}
          >
            전체 미제출
          </AppButton>
        </View>
      </View>

      {loading ? (
        <View style={styles.panelCenter}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.muted}>명단을 불러오는 중이에요.</Text>
        </View>
      ) : error ? (
        <View style={styles.panelCenter}>
          <Text style={styles.error}>{error}</Text>
          <AppButton onPress={onRetry}>다시 시도</AppButton>
        </View>
      ) : roster.length === 0 ? (
        <EmptyState title="학생 명단이 없어요." />
      ) : (
        <>
          <View style={styles.rosterList}>
            {roster.map((entry) => {
              const submitted = !!draft[entry.student.id];
              return (
                <ControlPressable
                  key={entry.student.id}
                  style={[
                    styles.rosterRow,
                    submitted && styles.rosterRowSubmitted,
                  ]}
                  onPress={() => onToggle(entry.student.id)}
                  disabled={saving}
                  accessibilityState={{ selected: submitted }}
                >
                  <Text style={styles.studentNumber}>
                    {entry.student.number ?? "-"}
                  </Text>
                  <Text style={styles.studentName} numberOfLines={1}>
                    {entry.student.name}
                  </Text>
                  <View
                    style={[
                      styles.mark,
                      submitted ? styles.markSubmitted : styles.markPending,
                    ]}
                  >
                    <Text
                      style={[
                        styles.markText,
                        submitted && styles.markTextSubmitted,
                      ]}
                    >
                      {submitted ? "✓" : ""}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.statusText,
                      submitted && styles.statusTextSubmitted,
                    ]}
                  >
                    {submitted ? "제출" : "미제출"}
                  </Text>
                </ControlPressable>
              );
            })}
          </View>

          <View style={styles.saveRow}>
            {toast ? <Text style={styles.toast}>{toast}</Text> : <View />}
            <AppButton
              onPress={onSave}
              loading={saving}
              disabled={saving || !dirty}
            >
              변경사항 저장
            </AppButton>
          </View>
        </>
      )}
    </SurfaceCard>
  );
}

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function errorText(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    const body = e.body as { error?: string } | string | null;
    if (typeof body === "object" && body?.error) return body.error;
    if (typeof body === "string" && body.trim()) return body;
    if (e.status === 403) return "체크원 권한이 필요해요.";
  }
  return fallback;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xxl,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: pageChrome.directContentStartGap,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  screenSub: {
    ...typography.body,
    color: colors.textMuted,
    flexShrink: 1,
  },
  intro: {
    gap: spacing.xs,
  },
  muted: {
    ...typography.body,
    color: colors.textMuted,
  },
  error: {
    ...typography.body,
    color: colors.danger,
    textAlign: "center",
  },
  taskRow: {
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  taskCard: {
    width: check.taskCardWidth,
    minHeight: check.taskCardMinHeight,
    padding: spacing.lg,
    gap: spacing.md,
  },
  taskCardSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentTintedBg,
  },
  taskCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  taskTitle: {
    ...typography.section,
    color: colors.text,
    flex: 1,
  },
  taskDesc: {
    ...typography.label,
    color: colors.textMuted,
  },
  progressTrack: {
    height: check.progressHeight,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
  },
  taskMeta: {
    ...typography.badge,
    color: colors.textMuted,
  },
  rosterCard: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  rosterHeader: {
    gap: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  rosterTitleBlock: {
    gap: spacing.xs,
  },
  rosterTitle: {
    ...typography.title,
    color: colors.text,
  },
  rosterMeta: {
    ...typography.label,
    color: colors.accent,
  },
  bulkRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  bulkText: {
    ...typography.badge,
  },
  panelCenter: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xxl,
  },
  rosterList: {
    gap: spacing.sm,
  },
  rosterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  rosterRowSubmitted: {
    borderColor: colors.statusReviewedText,
    backgroundColor: colors.statusReviewedBg,
  },
  studentNumber: {
    ...typography.badge,
    color: colors.textMuted,
    width: check.rosterNumberWidth,
    textAlign: "center",
  },
  studentName: {
    ...typography.section,
    color: colors.text,
    flex: 1,
  },
  mark: {
    width: check.markSize,
    height: check.markSize,
    borderRadius: radii.pill,
    borderWidth: borders.medium,
    alignItems: "center",
    justifyContent: "center",
  },
  markPending: {
    borderColor: colors.borderHover,
    backgroundColor: colors.surface,
  },
  markSubmitted: {
    borderColor: colors.statusReviewedText,
    backgroundColor: colors.statusReviewedText,
  },
  markText: {
    ...typography.badge,
    color: colors.transparent,
  },
  markTextSubmitted: {
    color: colors.onAccent,
  },
  statusText: {
    ...typography.badge,
    color: colors.textMuted,
  },
  statusTextSubmitted: {
    color: colors.statusReviewedText,
  },
  saveRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    flexWrap: "wrap",
    paddingTop: spacing.sm,
  },
  toast: {
    ...typography.label,
    color: colors.statusReviewedText,
  },
});
