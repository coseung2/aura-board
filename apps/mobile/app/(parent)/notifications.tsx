import { useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ParentBottomNav } from "../../components/parent-bottom-nav";
import { ParentHeaderActions } from "../../components/parent-header-actions";
import {
  AppButton,
  AppHeader,
  EmptyState,
  SectionHeader,
} from "../../components/ui";
import { useParentOverview } from "../../hooks/use-parent-overview";
import { clearParentSession } from "../../lib/session";
import type { ParentPendingLink } from "../../lib/types";
import {
  borders,
  colors,
  iconSizes,
  pageChrome,
  parent,
  radii,
  spacing,
  typography,
} from "../../theme/tokens";

export default function ParentNotificationsScreen() {
  const router = useRouter();
  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(parent)/home");
  };
  const handleUnauthorized = useCallback(async () => {
    await clearParentSession();
    router.replace(
      "/?role=parent&error=로그인이 만료되었어요. 다시 로그인해 주세요.",
    );
  }, [router]);
  const overview = useParentOverview(handleUnauthorized);

  const confirmCancel = (link: ParentPendingLink) => {
    Alert.alert(
      "연결 신청 취소",
      `${link.name} 학생 연결 신청을 취소하시겠어요?`,
      [
        { text: "돌아가기", style: "cancel" },
        {
          text: "신청 취소",
          style: "destructive",
          onPress: () => void overview.removeLink(link.id),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader
        title="알림"
        onBack={handleBack}
        right={<ParentHeaderActions showNotifications={false} />}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={overview.refreshing}
            onRefresh={overview.reload}
            tintColor={colors.accent}
          />
        }
      >
        {overview.loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text selectable style={styles.muted}>알림을 불러오는 중이에요.</Text>
          </View>
        ) : overview.error ? (
          <EmptyState
            title="알림을 불러오지 못했어요"
            description={overview.error}
            style={styles.flatSurface}
            action={<AppButton onPress={overview.reload}>다시 시도</AppButton>}
          />
        ) : overview.pendingLinks.length === 0 ? (
          <EmptyState
            icon={<Text style={styles.emptyIcon}>✓</Text>}
            title="새 알림이 없어요"
            description="자녀 연결 신청 상태가 바뀌면 이곳에서 확인할 수 있어요."
            style={styles.flatSurface}
          />
        ) : (
            <View style={styles.list}>
            <View style={styles.intro}>
              <SectionHeader title="승인 대기" />
              <Text selectable style={styles.title}>선생님의 승인을 기다리고 있어요</Text>
              <Text selectable style={styles.muted}>
                잘못 신청했다면 만료 전에 취소하고 다시 연결할 수 있어요.
              </Text>
            </View>
            {overview.pendingLinks.map((link) => (
              <View key={link.id} style={styles.card}>
                <View style={styles.cardMain}>
                  <Text selectable style={styles.studentName}>
                    {link.name}{link.number != null ? ` (${link.number}번)` : ""}
                  </Text>
                  <Text selectable style={styles.meta}>{link.classroom?.name ?? "학급"}</Text>
                  <Text selectable style={styles.meta}>
                    {formatRequestedAt(link.requestedAt)} 신청 · {formatExpiry(link.expiresAt)}
                  </Text>
                </View>
                <AppButton
                  variant="quiet"
                  loading={overview.busyId === link.id}
                  onPress={() => confirmCancel(link)}
                >
                  신청 취소
                </AppButton>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
      <ParentBottomNav
        active="notifications"
        notificationCount={overview.pendingLinks.length}
      />
    </SafeAreaView>
  );
}

function formatRequestedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "최근";
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function formatExpiry(value: string): string {
  const expiresAt = new Date(value).getTime();
  if (!Number.isFinite(expiresAt)) return "곧 자동 만료";
  const days = Math.max(0, Math.ceil((expiresAt - Date.now()) / 86_400_000));
  return days > 0 ? `${days}일 후 자동 만료` : "곧 자동 만료";
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: pageChrome.directContentStartGap,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  center: { minHeight: parent.portfolioEmptyMinHeight, alignItems: "center", justifyContent: "center", gap: spacing.md },
  list: { width: "100%", maxWidth: parent.portfolioCardMinWidth * 2 - spacing.lg, alignSelf: "center", gap: spacing.none },
  intro: { paddingVertical: spacing.sm, gap: spacing.xs },
  title: { ...typography.title, color: colors.text },
  muted: { ...typography.body, color: colors.textMuted },
  card: { paddingVertical: spacing.lg, gap: spacing.md, borderTopWidth: borders.hairline, borderTopColor: colors.border },
  cardMain: { gap: spacing.xs },
  studentName: { ...typography.subtitle, color: colors.text },
  meta: { ...typography.body, color: colors.textMuted },
  emptyIcon: { fontSize: iconSizes.xl, color: colors.accent },
  flatSurface: { backgroundColor: colors.transparent, borderWidth: borders.none, borderRadius: radii.none, boxShadow: "none" },
});
