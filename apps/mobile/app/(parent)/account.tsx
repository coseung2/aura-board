import { useCallback, useState } from "react";
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
import { AppButton, AppHeader, EmptyState, SurfaceCard } from "../../components/ui";
import { useParentOverview } from "../../hooks/use-parent-overview";
import { ApiError, parentApiFetch } from "../../lib/api";
import { logoutParentSession } from "../../lib/parent-session-actions";
import { clearParentSession } from "../../lib/session";
import type { ParentChild, ParentPendingLink } from "../../lib/types";
import { colors, parent, radii, spacing, typography } from "../../theme/tokens";

type AccountLink =
  | { kind: "active"; value: ParentChild }
  | { kind: "pending"; value: ParentPendingLink };

export default function ParentAccountScreen() {
  const router = useRouter();
  const [accountBusy, setAccountBusy] = useState<"logout" | "withdraw" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const handleUnauthorized = useCallback(async () => {
    await clearParentSession();
    router.replace(
      "/(parent)/login?error=로그인이 만료되었어요. 다시 로그인해 주세요.",
    );
  }, [router]);
  const overview = useParentOverview(handleUnauthorized);
  const links: AccountLink[] = [
    ...overview.pendingLinks.map((value) => ({ kind: "pending" as const, value })),
    ...overview.children.map((value) => ({ kind: "active" as const, value })),
  ];

  const confirmRemove = (link: AccountLink) => {
    const action = link.kind === "pending" ? "신청을 취소" : "연결을 해제";
    Alert.alert(
      link.kind === "pending" ? "연결 신청 취소" : "자녀 연결 해제",
      `${link.value.name} 학생 ${action}하시겠어요?`,
      [
        { text: "돌아가기", style: "cancel" },
        {
          text: link.kind === "pending" ? "신청 취소" : "연결 해제",
          style: "destructive",
          onPress: () => void overview.removeLink(link.value.id),
        },
      ],
    );
  };

  const handleLogout = async () => {
    setAccountBusy("logout");
    setActionError(null);
    try {
      await logoutParentSession();
      router.replace("/");
    } catch {
      setActionError("로그아웃에 실패했어요. 네트워크를 확인하고 다시 시도해 주세요.");
      setAccountBusy(null);
    }
  };

  const confirmLogout = () => {
    Alert.alert("로그아웃", "이 기기에서 로그아웃하시겠어요?", [
      { text: "취소", style: "cancel" },
      { text: "로그아웃", onPress: () => void handleLogout() },
    ]);
  };

  const handleWithdraw = async () => {
    setAccountBusy("withdraw");
    setActionError(null);
    try {
      await parentApiFetch("/api/parent/account/withdraw", { method: "POST" });
      await clearParentSession();
      router.replace("/");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        await handleUnauthorized();
        return;
      }
      setActionError("탈퇴 처리에 실패했어요. 잠시 후 다시 시도해 주세요.");
      setAccountBusy(null);
    }
  };

  const confirmWithdraw = () => {
    Alert.alert(
      "학부모 계정 탈퇴",
      "모든 자녀 연결이 즉시 해제됩니다. 탈퇴 후 90일이 지나면 개인정보가 익명화돼요.",
      [
        { text: "돌아가기", style: "cancel" },
        { text: "탈퇴하기", style: "destructive", onPress: () => void handleWithdraw() },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader title="계정" />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
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
          </View>
        ) : overview.error && !overview.parent ? (
          <EmptyState
            title="계정 정보를 불러오지 못했어요"
            description={overview.error}
            action={<AppButton onPress={overview.reload}>다시 시도</AppButton>}
          />
        ) : (
          <View style={styles.sections}>
            <SurfaceCard style={styles.profileCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{overview.parent?.name.slice(0, 1) || "학"}</Text>
              </View>
              <View style={styles.profileCopy}>
                <Text selectable style={styles.profileName}>{overview.parent?.name || "학부모"}</Text>
                <Text selectable style={styles.profileEmail}>{overview.parent?.email || "이메일 정보 없음"}</Text>
              </View>
            </SurfaceCard>

            <SurfaceCard style={styles.sectionCard}>
              <Text selectable style={styles.sectionTitle}>자녀 연결</Text>
              <Text selectable style={styles.help}>
                승인 전에는 신청 취소, 승인 후에는 연결 해제를 할 수 있어요.
              </Text>
              {links.length === 0 ? (
                <Text selectable style={styles.help}>연결된 자녀나 대기 중인 신청이 없어요.</Text>
              ) : (
                <View style={styles.linkList}>
                  {links.map((link) => (
                    <View key={link.value.id} style={styles.linkRow}>
                      <View style={styles.linkCopy}>
                        <Text selectable style={styles.linkName}>
                          {link.value.name}{link.value.number != null ? ` (${link.value.number}번)` : ""}
                        </Text>
                        <Text selectable style={styles.help}>
                          {link.value.classroom?.name ?? "학급"} · {link.kind === "pending" ? "승인 대기" : "연결됨"}
                        </Text>
                      </View>
                      <AppButton
                        variant="quiet"
                        loading={overview.busyId === link.value.id}
                        onPress={() => confirmRemove(link)}
                      >
                        {link.kind === "pending" ? "신청 취소" : "연결 해제"}
                      </AppButton>
                    </View>
                  ))}
                </View>
              )}
            </SurfaceCard>

            <AppButton
              variant="secondary"
              loading={accountBusy === "logout"}
              onPress={confirmLogout}
            >
              로그아웃
            </AppButton>
            <AppButton
              variant="danger"
              loading={accountBusy === "withdraw"}
              onPress={confirmWithdraw}
            >
              학부모 계정 탈퇴
            </AppButton>
            {actionError || overview.error ? (
              <Text selectable style={styles.error}>{actionError || overview.error}</Text>
            ) : null}
          </View>
        )}
      </ScrollView>
      <ParentBottomNav
        active="account"
        notificationCount={overview.pendingLinks.length}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, padding: spacing.lg, paddingBottom: spacing.xxl },
  center: { minHeight: parent.portfolioEmptyMinHeight, alignItems: "center", justifyContent: "center" },
  sections: { width: "100%", maxWidth: parent.portfolioCardMinWidth * 2 - spacing.lg, alignSelf: "center", gap: spacing.lg },
  profileCard: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md },
  avatar: { width: parent.childAvatarSize, height: parent.childAvatarSize, borderRadius: radii.pill, backgroundColor: colors.accentTintedBg, alignItems: "center", justifyContent: "center" },
  avatarText: { ...typography.title, color: colors.accent },
  profileCopy: { flex: 1, gap: spacing.xs },
  profileName: { ...typography.title, color: colors.text },
  profileEmail: { ...typography.body, color: colors.textMuted },
  sectionCard: { padding: spacing.lg, gap: spacing.md },
  sectionTitle: { ...typography.subtitle, color: colors.text },
  help: { ...typography.body, color: colors.textMuted },
  linkList: { gap: spacing.sm },
  linkRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  linkCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  linkName: { ...typography.label, color: colors.text },
  error: { ...typography.body, color: colors.danger, textAlign: "center" },
});
