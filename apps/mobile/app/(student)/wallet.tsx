import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import {
  borders,
  colors,
  radii,
  spacing,
  typography,
  wallet as walletTokens,
} from "../../theme/tokens";
import { apiFetch, ApiError } from "../../lib/api";
import { clearSessionToken } from "../../lib/session";
import type { WalletSummary } from "../../lib/types";
import { AppButton, AppHeader, EmptyState, SurfaceCard } from "../../components/ui";

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

  const cancelFd = useCallback(
    async (fdId: string) => {
      if (!wallet?.classroomId) {
        Alert.alert("오류", "학급 정보를 찾을 수 없어요.");
        return;
      }
      try {
        await apiFetch(
          `/api/classrooms/${encodeURIComponent(wallet.classroomId)}/bank/fixed-deposits/${encodeURIComponent(fdId)}/cancel`,
          { method: "POST" },
        );
        // 통장/FD 다시 로드.
        const res = await apiFetch<WalletSummary>("/api/my/wallet");
        setWallet(res);
      } catch (e) {
        Alert.alert(
          "해지 실패",
          e instanceof Error ? e.message : "적금을 해지하지 못했어요.",
        );
      }
    },
    [wallet?.classroomId],
  );

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
      <AppHeader title="내 통장과 적금" onBack={() => router.back()} />

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
          <SurfaceCard style={styles.summaryCard}>
            <View>
              <Text style={styles.eyebrow}>현재 잔고</Text>
              <Text style={styles.balance}>
                {wallet.balance.toLocaleString()} {wallet.currency.unitLabel}
              </Text>
            </View>
          </SurfaceCard>

          <SurfaceCard style={styles.qrCard}>
            <View style={styles.qrHeader}>
              <View>
                <Text style={styles.eyebrow}>매점 결제</Text>
                <Text style={styles.qrTitle}>학생 QR 지갑</Text>
              </View>
              <AppButton
                variant="secondary"
                onPress={loadQr}
              >
                새로고침
              </AppButton>
            </View>
            <View style={styles.qrFrame}>
              {qr?.token ? (
                <QRCode
                  value={qr.token}
                  size={walletTokens.qrCodeSize}
                  backgroundColor={colors.surface}
                />
              ) : (
                <Text style={styles.muted}>{qrError ?? "QR 준비 중이에요."}</Text>
              )}
            </View>
            {qr?.token ? (
              <Text style={styles.qrTimer}>
                {Math.max(0, qr.expiresAt - qrNow)}초 뒤 새 QR
              </Text>
            ) : null}
          </SurfaceCard>

          <Text style={styles.sectionTitle}>진행 중인 적금</Text>
          {wallet.activeFDs.length === 0 ? (
            <EmptyState title="아직 진행 중인 적금이 없어요." />
          ) : (
            <View style={styles.stack}>
              {wallet.activeFDs.map((fd) => (
                <SurfaceCard key={fd.id} style={styles.listCard}>
                  <Text style={styles.listTitle}>
                    {fd.principal.toLocaleString()} {wallet.currency.unitLabel}
                  </Text>
                  <Text style={styles.muted}>
                    월 {fd.monthlyRate}% · 만기 {formatShortDate(fd.maturityDate)}
                  </Text>
                  <AppButton
                    variant="secondary"
                    style={styles.fdCancelBtn}
                    onPress={() =>
                      Alert.alert(
                        "적금 해지",
                        "원금만 반환돼요. 해지할까요?",
                        [
                          { text: "취소", style: "cancel" },
                          { text: "해지", style: "destructive", onPress: () => void cancelFd(fd.id) },
                        ],
                      )
                    }
                  >
                    해지
                  </AppButton>
                </SurfaceCard>
              ))}
            </View>
          )}

          <Text style={styles.sectionTitle}>최근 거래</Text>
          {wallet.recentTransactions?.length ? (
            <View style={styles.stack}>
              {wallet.recentTransactions.map((tx) => (
                <SurfaceCard key={tx.id} style={styles.txRow}>
                  <View style={styles.txInfo}>
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
                </SurfaceCard>
              ))}
            </View>
          ) : (
            <EmptyState title="최근 거래가 없어요." />
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xxl,
  },
  content: { padding: spacing.xxl, gap: spacing.lg },
  summaryCard: {
    minHeight: walletTokens.summaryMinHeight,
    padding: spacing.xl,
  },
  eyebrow: { ...typography.badge, color: colors.accent, marginBottom: spacing.sm },
  balance: { ...typography.display, color: colors.text },
  qrCard: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  qrHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  qrTitle: { ...typography.title, color: colors.text },
  qrFrame: {
    alignSelf: "center",
    width: walletTokens.qrFrameSize,
    minHeight: walletTokens.qrFrameSize,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    borderRadius: radii.card,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  qrTimer: {
    ...typography.label,
    color: colors.accent,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  sectionTitle: { ...typography.section, color: colors.text, marginTop: spacing.md },
  stack: { gap: spacing.sm },
  listCard: {
    padding: spacing.lg,
  },
  fdCancelBtn: {
    alignSelf: "flex-start",
    marginTop: spacing.sm,
  },
  listTitle: { ...typography.label, color: colors.text },
  txRow: {
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  txInfo: { flex: 1 },
  txAmount: { ...typography.section },
  txPlus: { color: colors.bankPositive },
  txMinus: { color: colors.bankNegative },
  muted: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.danger, textAlign: "center" },
});
