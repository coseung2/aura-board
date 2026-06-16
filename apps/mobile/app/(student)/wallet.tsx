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
import QRCode from "react-native-qrcode-svg";
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
  const [qr, setQr] = useState<{ token: string; expiresAt: number } | null>(null);
  const [qrNow, setQrNow] = useState(() => Math.floor(Date.now() / 1000));
  const [qrError, setQrError] = useState<string | null>(null);
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

  const loadQr = useCallback(async () => {
    try {
      const res = await apiFetch<{ token: string; expiresAt: number }>(
        "/api/my/wallet/card-qr",
      );
      setQr(res);
      setQrNow(Math.floor(Date.now() / 1000));
      setQrError(null);
    } catch (e) {
      if (await handleAuthError(e)) return;
      setQr(null);
      setQrError("결제 QR을 만들 수 없어요.");
    }
  }, [handleAuthError]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await apiFetch<WalletSummary>("/api/my/wallet");
        setWallet(res);
        setError(null);
        await loadQr();
      } catch (e) {
        if (await handleAuthError(e)) return;
        setError("통장 정보를 불러올 수 없어요.");
      } finally {
        setLoading(false);
      }
    })();
  }, [handleAuthError, loadQr]);

  useEffect(() => {
    const handle = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      setQrNow(now);
      if (qr && qr.expiresAt - now <= 0) {
        loadQr();
      }
    }, 1000);
    return () => clearInterval(handle);
  }, [loadQr, qr]);

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
          </View>

          <View style={styles.qrCard}>
            <View style={styles.qrHeader}>
              <View>
                <Text style={styles.eyebrow}>매점 결제</Text>
                <Text style={styles.qrTitle}>학생 QR 지갑</Text>
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.refreshBtn,
                  pressed && styles.refreshBtnPressed,
                ]}
                onPress={loadQr}
              >
                <Text style={styles.refreshText}>새로고침</Text>
              </Pressable>
            </View>
            <View style={styles.qrFrame}>
              {qr?.token ? (
                <QRCode value={qr.token} size={220} backgroundColor="#ffffff" />
              ) : (
                <Text style={styles.muted}>{qrError ?? "QR 준비 중이에요."}</Text>
              )}
            </View>
            {qr?.token ? (
              <>
                <Text style={styles.qrTimer}>
                  {Math.max(0, qr.expiresAt - qrNow)}초 뒤 새 QR
                </Text>
                <Text selectable style={styles.qrToken} numberOfLines={3}>
                  {qr.token}
                </Text>
              </>
            ) : null}
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
    minHeight: 132,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    ...shadows.card,
  },
  eyebrow: { ...typography.badge, color: colors.accent, marginBottom: spacing.sm },
  balance: { ...typography.display, color: colors.text },
  qrCard: {
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadows.card,
  },
  qrHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  qrTitle: { ...typography.title, color: colors.text },
  refreshBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.btn,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  refreshBtnPressed: { backgroundColor: colors.surfaceAlt },
  refreshText: { ...typography.label, color: colors.text },
  qrFrame: {
    alignSelf: "center",
    width: 252,
    minHeight: 252,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#ffffff",
  },
  qrTimer: {
    ...typography.label,
    color: colors.accent,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  qrToken: {
    ...typography.micro,
    color: colors.textMuted,
    padding: spacing.md,
    borderRadius: radii.btn,
    backgroundColor: colors.bg,
  },
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
