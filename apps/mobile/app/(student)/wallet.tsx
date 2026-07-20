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
  pageChrome,
  radii,
  spacing,
  tapMin,
  typography,
  wallet as walletTokens,
} from "../../theme/tokens";
import { apiFetch, ApiError } from "../../lib/api";
import { clearSessionToken } from "../../lib/session";
import type { WalletSummary } from "../../lib/types";
import {
  AppButton,
  AppHeader,
  SectionHeader,
  TextField,
} from "../../components/ui";
export default function StudentWalletScreen() {
  const router = useRouter();
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [qr, setQr] = useState<{ token: string; expiresAt: null } | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fdPrincipal, setFdPrincipal] = useState("");
  const [fdBusy, setFdBusy] = useState(false);

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
      const res = await apiFetch<{ token: string; expiresAt: null }>(
        "/api/my/wallet/card-qr",
      );
      setQr(res);
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

  const openFd = useCallback(async () => {
    if (!wallet?.classroomId || fdBusy) return;
    const principal = Number(fdPrincipal.replace(/,/g, ""));
    if (!Number.isInteger(principal) || principal <= 0) {
      Alert.alert("가입 금액 확인", "1 이상의 정수 금액을 입력해 주세요.");
      return;
    }
    setFdBusy(true);
    try {
      await apiFetch(
        `/api/classrooms/${encodeURIComponent(wallet.classroomId)}/bank/fixed-deposits`,
        { method: "POST", json: { principal } },
      );
      const res = await apiFetch<WalletSummary>("/api/my/wallet");
      setWallet(res);
      setFdPrincipal("");
      Alert.alert("가입 완료", "적금에 가입했어요.");
    } catch (e) {
      if (await handleAuthError(e)) return;
      Alert.alert(
        "가입 실패",
        e instanceof Error ? e.message : "적금에 가입하지 못했어요.",
      );
    } finally {
      setFdBusy(false);
    }
  }, [fdBusy, fdPrincipal, handleAuthError, wallet?.classroomId]);

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

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
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
          <View style={styles.balanceSection}>
            <SectionHeader title="현재 잔고" />
            <View style={styles.balanceRow}>
              <Text style={styles.balance}>
                {wallet.balance.toLocaleString()}
              </Text>
              <Text style={styles.balanceUnit}>{wallet.currency.unitLabel}</Text>
            </View>
          </View>

          <View style={styles.qrSection}>
            <SectionHeader title="매점 결제" />
            <Text style={styles.qrTitle}>학생 QR 지갑</Text>
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
                고정 QR
              </Text>
            ) : null}
          </View>

          <SectionHeader title="적금 가입" />
          {wallet.currency.monthlyInterestRate === null ? (
            <Text style={styles.emptyRow}>현재 가입 가능한 적금 상품이 없어요.</Text>
          ) : (
            <View style={styles.fdOpenSection}>
              <Text style={styles.listTitle}>
                30일 적금 · 월 {wallet.currency.monthlyInterestRate}%
              </Text>
              <TextField
                value={fdPrincipal}
                onChangeText={(value) => setFdPrincipal(value.replace(/[^\d,]/g, ""))}
                keyboardType="number-pad"
                placeholder="가입 금액"
                editable={!fdBusy}
              />
              <AppButton loading={fdBusy} onPress={() => void openFd()}>
                적금 가입
              </AppButton>
            </View>
          )}

          <SectionHeader title="진행 중인 적금" />
          {wallet.activeFDs.length === 0 ? (
            <Text style={styles.emptyRow}>아직 진행 중인 적금이 없어요.</Text>
          ) : (
            <View style={styles.fdList}>
              {wallet.activeFDs.map((fd, index) => (
                <View
                  key={fd.id}
                  style={[
                    styles.fdRow,
                    index === wallet.activeFDs.length - 1 && styles.fdRowLast,
                  ]}
                >
                  <View style={styles.fdCopy}>
                    <Text style={styles.listTitle}>
                      {fd.principal.toLocaleString()} {wallet.currency.unitLabel}
                    </Text>
                    <Text style={styles.muted}>
                      월 {fd.monthlyRate}% · 만기 {formatShortDate(fd.maturityDate)}
                    </Text>
                  </View>
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
                </View>
              ))}
            </View>
          )}

          <SectionHeader title="최근 거래" />
          {wallet.recentTransactions?.length ? (
            <View style={styles.txList}>
              {wallet.recentTransactions.map((tx, index) => (
                <View
                  key={tx.id}
                  style={[
                    styles.txRow,
                    index === wallet.recentTransactions!.length - 1 && styles.txRowLast,
                  ]}
                >
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
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyRow}>최근 거래가 없어요.</Text>
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
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: pageChrome.contentStartGap,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  balanceSection: {
    gap: spacing.none,
  },
  balanceRow: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    columnGap: spacing.xs,
    rowGap: spacing.xxs,
    paddingVertical: spacing.lg,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  balance: { ...typography.display, color: colors.text },
  balanceUnit: { ...typography.label, color: colors.textMuted },
  qrSection: {
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  qrTitle: { ...typography.title, color: colors.text },
  qrFrame: {
    alignSelf: "center",
    width: "100%",
    maxWidth: walletTokens.qrFrameSize,
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
  emptyRow: {
    ...typography.body,
    color: colors.textMuted,
    paddingVertical: spacing.lg,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  fdList: {
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  fdOpenSection: {
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  fdRow: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  fdRowLast: {
    borderBottomWidth: borders.none,
  },
  fdCopy: {
    flex: 1,
    minWidth: 0,
  },
  fdCancelBtn: {
    alignSelf: "center",
  },
  listTitle: { ...typography.label, color: colors.text },
  txList: {
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  txRow: {
    minHeight: tapMin,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.none,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  txRowLast: {
    borderBottomWidth: borders.none,
  },
  txInfo: { flex: 1 },
  txAmount: { ...typography.section },
  txPlus: { color: colors.bankPositive },
  txMinus: { color: colors.bankNegative },
  muted: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.danger, textAlign: "center" },
});
