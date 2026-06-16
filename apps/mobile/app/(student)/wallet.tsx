import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  colors,
  radii,
  shadows,
  spacing,
  typography,
} from "../../theme/tokens";
import { apiFetch, ApiError } from "../../lib/api";
import { clearSessionToken } from "../../lib/session";
import type { WalletSummary } from "../../lib/types";

export default function StudentWalletScreen() {
  const router = useRouter();
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleAuthError = useCallback(
    async (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        await clearSessionToken();
        router.replace("/(student)/login");
        return true;
      }
      return false;
    },
    [router],
  );

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await apiFetch<WalletSummary>("/api/my/wallet");
        setWallet(res);
        setError(null);
      } catch (e) {
        if (await handleAuthError(e)) return;
        setError("통장 정보를 불러올 수 없어요.");
      } finally {
        setLoading(false);
      }
    })();
  }, [handleAuthError]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>내 통장과 적금</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.muted}>불러오는 중이에요.</Text>
        </View>
      ) : error || !wallet ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error ?? "통장 정보를 불러올 수 없어요."}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.summaryCard}>
            <View>
              <Text style={styles.eyebrow}>현재 잔고</Text>
              <Text style={styles.balance}>
                {wallet.balance.toLocaleString()} {wallet.currency.unitLabel}
              </Text>
            </View>
            <View style={styles.accountBox}>
              <Text style={styles.accountLabel}>카드</Text>
              <Text style={styles.accountValue}>
                {wallet.card?.cardNumber ?? "발급 전"}
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>진행 중인 적금</Text>
          {wallet.activeFDs.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.muted}>아직 진행 중인 적금이 없어요.</Text>
            </View>
          ) : (
            <View style={styles.stack}>
              {wallet.activeFDs.map((fd) => (
                <View key={fd.id} style={styles.listCard}>
                  <Text style={styles.listTitle}>
                    {fd.principal.toLocaleString()} {wallet.currency.unitLabel}
                  </Text>
                  <Text style={styles.muted}>
                    월 {fd.monthlyRate}% · 만기 {formatShortDate(fd.maturityDate)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.sectionTitle}>최근 거래</Text>
          {wallet.recentTransactions?.length ? (
            <View style={styles.stack}>
              {wallet.recentTransactions.map((tx) => (
                <View key={tx.id} style={styles.txRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listTitle}>{tx.note ?? tx.type}</Text>
                    <Text style={styles.muted}>{formatShortDate(tx.createdAt)}</Text>
                  </View>
                  <Text
                    style={[
                      styles.txAmount,
                      tx.amount < 0 ? styles.txMinus : styles.txPlus,
                    ]}
                  >
                    {tx.amount > 0 ? "+" : ""}
                    {tx.amount.toLocaleString()}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.muted}>최근 거래가 없어요.</Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function formatShortDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    height: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  backText: { fontSize: 24, color: colors.text },
  title: { ...typography.title, color: colors.text },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xxl,
  },
  content: { padding: spacing.xxl, gap: spacing.lg },
  summaryCard: {
    minHeight: 180,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xl,
    ...shadows.card,
  },
  eyebrow: { ...typography.badge, color: colors.accent, marginBottom: spacing.sm },
  balance: { ...typography.display, color: colors.text },
  accountBox: {
    padding: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.bg,
    minWidth: 180,
    gap: spacing.xs,
  },
  accountLabel: { ...typography.micro, color: colors.textMuted },
  accountValue: { ...typography.label, color: colors.text },
  sectionTitle: { ...typography.section, color: colors.text, marginTop: spacing.md },
  stack: { gap: spacing.sm },
  listCard: {
    padding: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listTitle: { ...typography.label, color: colors.text },
  txRow: {
    padding: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  txAmount: { ...typography.section },
  txPlus: { color: colors.bankPositive },
  txMinus: { color: colors.bankNegative },
  emptyBox: {
    padding: spacing.xl,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  muted: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.danger, textAlign: "center" },
});
