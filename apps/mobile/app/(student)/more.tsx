import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { apiFetch, ApiError } from "../../lib/api";
import { clearSessionToken } from "../../lib/session";
import type { MeResponse } from "../../lib/types";
import {
  loadStudentNavPreferences,
  saveStudentNavPreferences,
  studentBaseNavTargets,
  studentDutyTarget,
  studentOptionalNavTargets,
  type StudentNavTarget,
} from "../../lib/student-navigation";
import {
  borders,
  colors,
  dashboard,
  iconSizes,
  layout,
  pageChrome,
  radii,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";
import { studentNavIcon } from "../../lib/student-navigation-icons";
import {
  AppButton,
  AppHeader,
  ControlPressable,
} from "../../components/ui";

export default function StudentMoreScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [enabledIds, setEnabledIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isLandscapeLayout = width > height && width >= dashboard.columns.one;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [response, savedIds] = await Promise.all([
        apiFetch<MeResponse>("/api/student/me"),
        loadStudentNavPreferences(),
      ]);
      setMe(response);
      setEnabledIds(savedIds);
    } catch (nextError) {
      if (nextError instanceof ApiError && nextError.status === 401) {
        await clearSessionToken();
        router.replace("/(student)/login");
        return;
      }
      setError("메뉴를 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const targets = useMemo(
    () => [
      ...studentBaseNavTargets,
      ...studentOptionalNavTargets,
      ...(me?.duties ?? [])
        .map(studentDutyTarget)
        .filter((target): target is StudentNavTarget => target !== null),
    ],
    [me?.duties],
  );

  const orderedTargets = useMemo(() => {
    const rank = new Map(enabledIds.map((id, index) => [id, index]));
    return [...targets].sort((a, b) => {
      const aRank = rank.get(a.id);
      const bRank = rank.get(b.id);
      if (aRank !== undefined && bRank !== undefined) return aRank - bRank;
      if (aRank !== undefined) return -1;
      if (bRank !== undefined) return 1;
      return targets.indexOf(a) - targets.indexOf(b);
    });
  }, [enabledIds, targets]);

  const persist = useCallback(async (ids: string[]) => {
    setEnabledIds(ids);
    setSaveError(null);
    setSaving(true);
    try {
      await saveStudentNavPreferences(ids);
    } catch {
      setSaveError("메뉴 설정을 저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }, []);

  function toggle(targetId: string, enabled: boolean) {
    const next = enabled
      ? [...enabledIds.filter((id) => id !== targetId), targetId]
      : enabledIds.filter((id) => id !== targetId);
    void persist(next);
  }

  function move(targetId: string, direction: -1 | 1) {
    const currentIndex = enabledIds.indexOf(targetId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= enabledIds.length) {
      return;
    }
    const next = [...enabledIds];
    [next[currentIndex], next[nextIndex]] = [
      next[nextIndex],
      next[currentIndex],
    ];
    void persist(next);
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader title="더보기" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          isLandscapeLayout && styles.contentLandscape,
        ]}
      >
        {error ? (
          <View style={styles.errorBanner}>
            <View style={styles.errorCopy}>
              <Text style={styles.errorTitle} accessibilityRole="alert">
                메뉴를 불러오지 못했어요.
              </Text>
              <Text style={styles.errorDescription}>
                연결을 확인한 뒤 다시 시도해 주세요.
              </Text>
            </View>
            <AppButton
              variant="secondary"
              loading={loading}
              onPress={() => void load()}
            >
              다시 시도
            </AppButton>
          </View>
        ) : null}

        <View style={styles.bannerCallout}>
          <View style={styles.bannerCalloutCopy}>
            <Text style={styles.bannerCalloutTitle} selectable>
              오늘의 배너를 제안해 보세요.
            </Text>
            <Text style={styles.bannerCalloutDescription} selectable>
              짧은 문구나 이미지를 제출하면 모두의 화면에 소개될 수 있어요.
            </Text>
          </View>
          <AppButton
            variant="secondary"
            onPress={() => router.push("/(student)/daily-banner-submit")}
          >
            제안하기
          </AppButton>
        </View>

        <View style={styles.menuSection}>
          {saveError ? (
            <Text style={styles.saveError} accessibilityRole="alert">
              {saveError}
            </Text>
          ) : null}

          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.mutedText}>잠시만 기다려 주세요.</Text>
            </View>
          ) : orderedTargets.length ? (
            <View style={styles.settingList}>
              {orderedTargets.map((target, index) => {
                const enabled = enabledIds.includes(target.id);
                const enabledIndex = enabledIds.indexOf(target.id);
                const Icon = studentNavIcon(target);
                return (
                  <View
                    key={target.id}
                    style={[
                      styles.settingRow,
                      index === orderedTargets.length - 1 && styles.rowLast,
                    ]}
                  >
                    <View style={styles.menuIcon} accessible={false}>
                      <Icon
                        size={iconSizes.md}
                        color={colors.textMuted}
                        strokeWidth={2}
                      />
                    </View>
                    <View style={styles.targetCopy}>
                      <Text style={styles.label}>{target.label}</Text>
                      <Text style={styles.targetMeta}>
                        {enabled ? "하단 메뉴에 표시 중" : "더보기에서만 보기"}
                      </Text>
                    </View>
                    <View style={styles.controls}>
                      <View style={styles.orderButtons}>
                        <ControlPressable
                          style={styles.orderButton}
                          disabled={!enabled || enabledIndex === 0}
                          onPress={() => move(target.id, -1)}
                          accessibilityLabel={`${target.label} 위로 이동`}
                        >
                          <ChevronUp
                            size={iconSizes.sm}
                            color={colors.textMuted}
                            strokeWidth={2.25}
                          />
                        </ControlPressable>
                        <ControlPressable
                          style={styles.orderButton}
                          disabled={
                            !enabled || enabledIndex === enabledIds.length - 1
                          }
                          onPress={() => move(target.id, 1)}
                          accessibilityLabel={`${target.label} 아래로 이동`}
                        >
                          <ChevronDown
                            size={iconSizes.sm}
                            color={colors.textMuted}
                            strokeWidth={2.25}
                          />
                        </ControlPressable>
                      </View>
                      <Switch
                        value={enabled}
                        onValueChange={(value) => toggle(target.id, value)}
                        trackColor={{
                          false: colors.border,
                          true: colors.accent,
                        }}
                        thumbColor={colors.surface}
                        accessibilityLabel={`${target.label} 하단 메뉴 ${enabled ? "끄기" : "켜기"}`}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.mutedText}>추가할 메뉴가 없어요.</Text>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: layout.readableMaxWidth,
    alignSelf: "center",
    flexGrow: 1,
    paddingHorizontal: pageChrome.horizontalPadding,
    paddingTop: pageChrome.directContentStartGap,
    paddingBottom: spacing.xxxl + spacing.xl,
    gap: spacing.xl,
  },
  contentLandscape: {
    alignSelf: "center",
    width: "100%",
    maxWidth: dashboard.columns.two,
    paddingHorizontal: spacing.xxl,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: borders.hairline,
    borderBottomWidth: borders.hairline,
    borderColor: colors.danger,
  },
  errorCopy: { flex: 1, gap: spacing.xxs },
  errorTitle: { ...typography.label, color: colors.danger },
  errorDescription: { ...typography.micro, color: colors.textMuted },
  bannerCallout: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: borders.hairline,
    borderBottomWidth: borders.hairline,
    borderColor: colors.border,
  },
  bannerCalloutCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  bannerCalloutTitle: { ...typography.label, color: colors.text },
  bannerCalloutDescription: { ...typography.micro, color: colors.textMuted },
  menuSection: { gap: spacing.sm },
  loadingRow: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  mutedText: { ...typography.body, color: colors.textMuted },
  saveError: { ...typography.micro, color: colors.danger },
  settingList: { gap: spacing.none },
  settingRow: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  rowLast: { borderBottomWidth: borders.none },
  menuIcon: {
    width: tapMin,
    alignItems: "center",
    justifyContent: "center",
  },
  targetCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  label: { ...typography.body, color: colors.text, flexShrink: 1 },
  targetMeta: { ...typography.micro, color: colors.textMuted },
  controls: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  orderButtons: { flexDirection: "row", alignItems: "center" },
  orderButton: {
    width: spacing.xl + spacing.xs,
    minHeight: tapMin,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: borders.none,
    borderColor: colors.transparent,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
});
