import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LogOut } from "lucide-react-native";
import { apiFetch, ApiError } from "../../lib/api";
import { clearSessionToken } from "../../lib/session";
import type { MeResponse } from "../../lib/types";
import {
  loadStudentNavPreferences,
  saveStudentNavPreferences,
  studentDutyTarget,
  studentOptionalNavTargets,
  type StudentNavTarget,
} from "../../lib/student-navigation";
import {
  borders,
  colors,
  dashboard,
  iconSizes,
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
  const [loggingOut, setLoggingOut] = useState(false);
  const loggingOutRef = useRef(false);

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

  const handleLogout = useCallback(async () => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    setLoggingOut(true);
    try {
      await apiFetch("/api/student/logout", { method: "POST" }).catch(
        () => undefined,
      );
      await clearSessionToken();
      router.replace("/(student)/login");
    } finally {
      loggingOutRef.current = false;
      setLoggingOut(false);
    }
  }, [router]);

  const targets = useMemo(
    () => [
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

  const enabledCount = useMemo(
    () => targets.filter((target) => enabledIds.includes(target.id)).length,
    [enabledIds, targets],
  );

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
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= enabledIds.length)
      return;
    const next = [...enabledIds];
    [next[currentIndex], next[nextIndex]] = [
      next[nextIndex],
      next[currentIndex],
    ];
    void persist(next);
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader
        title="더보기"
        right={
          <ControlPressable
            style={styles.logoutButton}
            onPress={() => void handleLogout()}
            disabled={loggingOut}
            accessibilityLabel={loggingOut ? "로그아웃 중" : "로그아웃"}
            accessibilityState={{ disabled: loggingOut }}
          >
            {loggingOut ? (
              <ActivityIndicator color={colors.textMuted} size="small" />
            ) : (
              <LogOut
                size={iconSizes.md}
                color={colors.textMuted}
                strokeWidth={2}
                accessible={false}
              />
            )}
          </ControlPressable>
        }
      />
      <ScrollView
        style={styles.scroll}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.content,
          isLandscapeLayout && styles.contentLandscape,
        ]}
      >
        <View style={styles.intro}>
          <Text style={styles.title}>필요한 메뉴를 하단에 꺼내 두세요.</Text>
          <Text style={styles.subtitle}>
            홈·보드·포트폴리오·독서·걷기·더보기는 항상 표시돼요.
          </Text>
        </View>

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

        <View
          style={[
            styles.sections,
            isLandscapeLayout && styles.sectionsLandscape,
          ]}
        >
          <View style={styles.sectionColumn}>
            <View style={styles.settingsSection}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderCopy}>
                  <Text style={styles.sectionTitle}>하단 메뉴 설정</Text>
                  <Text style={styles.sectionDescription}>
                    {loading
                      ? "메뉴를 불러오는 중…"
                      : saving
                        ? "변경 내용을 저장하는 중…"
                        : `${enabledCount}개 메뉴가 하단에 표시 중`}
                  </Text>
                </View>
              </View>

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
                orderedTargets.map((target, index) => {
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
                        <Text style={styles.label} numberOfLines={1}>
                          {target.label}
                        </Text>
                        <Text style={styles.targetMeta}>
                          {enabled
                            ? "하단 메뉴에 표시 중"
                            : "더보기에서만 열기"}
                        </Text>
                      </View>
                      {enabled ? (
                        <View style={styles.orderButtons}>
                          <AppButton
                            variant="quiet"
                            style={styles.orderButton}
                            textStyle={styles.orderButtonText}
                            disabled={enabledIndex === 0}
                            onPress={() => move(target.id, -1)}
                            accessibilityLabel={`${target.label} 앞으로 이동`}
                          >
                            ↑
                          </AppButton>
                          <AppButton
                            variant="quiet"
                            style={styles.orderButton}
                            textStyle={styles.orderButtonText}
                            disabled={enabledIndex === enabledIds.length - 1}
                            onPress={() => move(target.id, 1)}
                            accessibilityLabel={`${target.label} 뒤로 이동`}
                          >
                            ↓
                          </AppButton>
                        </View>
                      ) : null}
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
                  );
                })
              ) : (
                <Text style={styles.mutedText}>추가할 메뉴가 없어요.</Text>
              )}
            </View>
          </View>

          <View style={styles.sectionColumn}>
            <View style={styles.linksSection}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderCopy}>
                  <Text style={styles.sectionTitle}>전체 메뉴</Text>
                  <Text style={styles.sectionDescription}>
                    하단 메뉴에 추가하지 않아도 여기서 바로 열 수 있어요.
                  </Text>
                </View>
              </View>
              {orderedTargets.length ? (
                <View style={styles.linkList}>
                  {orderedTargets.map((target, index) => {
                    const Icon = studentNavIcon(target);
                    return (
                      <ControlPressable
                        key={target.id}
                        style={[
                          styles.linkRow,
                          index < orderedTargets.length - 1 && styles.rowDivider,
                        ]}
                        onPress={() => router.push(target.href as Href)}
                        accessibilityLabel={`${target.label} 열기`}
                      >
                        <View style={styles.menuIcon} accessible={false}>
                          <Icon
                            size={iconSizes.md}
                            color={colors.textMuted}
                            strokeWidth={2}
                          />
                        </View>
                        <Text style={styles.label} numberOfLines={1}>
                          {target.label}
                        </Text>
                        <Text style={styles.chevron}>›</Text>
                      </ControlPressable>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.mutedText}>
                  추가 메뉴가 준비되면 여기에 표시돼요.
                </Text>
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.xl,
  },
  contentLandscape: {
    alignSelf: "center",
    width: "100%",
    maxWidth: dashboard.columns.two,
    paddingHorizontal: spacing.xxl,
  },
  intro: { gap: spacing.xs },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: borders.hairline,
    borderColor: colors.danger,
    borderRadius: radii.control,
    backgroundColor: colors.dangerTintedBg,
  },
  errorCopy: { flex: 1, gap: spacing.xxs },
  errorTitle: { ...typography.label, color: colors.danger },
  errorDescription: { ...typography.micro, color: colors.textMuted },
  sections: { gap: spacing.xl },
  sectionsLandscape: { flexDirection: "row", alignItems: "flex-start" },
  sectionColumn: { flex: 1, minWidth: 0 },
  settingsSection: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  linksSection: { gap: spacing.sm },
  sectionHeader: { flexDirection: "row", alignItems: "center" },
  sectionHeaderCopy: { flex: 1, gap: spacing.xxs },
  sectionTitle: { ...typography.subtitle, color: colors.text },
  sectionDescription: { ...typography.micro, color: colors.textMuted },
  loadingRow: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  mutedText: { ...typography.body, color: colors.textMuted },
  saveError: { ...typography.micro, color: colors.danger },
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
  orderButtons: { flexDirection: "row", alignItems: "center" },
  orderButton: {
    minWidth: tapMin,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.none,
  },
  orderButtonText: { ...typography.title, color: colors.textMuted },
  linkList: { gap: spacing.none },
  linkRow: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderWidth: borders.none,
    borderRadius: radii.none,
  },
  rowDivider: {
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  chevron: { ...typography.title, color: colors.textMuted },
  logoutButton: {
    width: tapMin,
    height: tapMin,
    borderWidth: borders.none,
    borderColor: colors.transparent,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
});
