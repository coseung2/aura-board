import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  borders,
  colors,
  radii,
  spacing,
  states,
  store,
  typography,
} from "../../theme/tokens";
import { apiFetch, ApiError } from "../../lib/api";
import { clearSessionToken } from "../../lib/session";
import type { StoreChargeReceipt, StoreItem } from "../../lib/types";
import { AppButton, AppHeader, EmptyState, IconButton, SurfaceCard, SurfacePressable } from "../../components/ui";

export default function StoreChargeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ classroomId?: string | string[] }>();
  const classroomId = firstParam(params.classroomId);
  const [permission, requestPermission] = useCameraPermissions();
  const [items, setItems] = useState<StoreItem[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [token, setToken] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<StoreChargeReceipt | null>(null);

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

  const load = useCallback(async () => {
    if (!classroomId) {
      setError("학급 정보를 찾을 수 없어요.");
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await apiFetch<{ items: StoreItem[] }>(
        `/api/classrooms/${encodeURIComponent(classroomId)}/store/items`,
      );
      setItems(res.items);
      setError(null);
    } catch (e) {
      if (await handleAuthError(e)) return;
      if (e instanceof ApiError && e.status === 403) {
        setError("매점원 권한이 필요해요.");
      } else {
        setError("상품 목록을 불러올 수 없어요.");
      }
    } finally {
      setLoading(false);
    }
  }, [classroomId, handleAuthError]);

  useEffect(() => {
    load();
  }, [load]);

  const cartList = useMemo(
    () =>
      items
        .filter((item) => (cart[item.id] ?? 0) > 0)
        .map((item) => ({ ...item, qty: cart[item.id] ?? 0 })),
    [cart, items],
  );
  const total = cartList.reduce((sum, item) => sum + item.price * item.qty, 0);

  function addToCart(item: StoreItem) {
    if (item.stock === 0) return;
    setCart((current) => ({ ...current, [item.id]: (current[item.id] ?? 0) + 1 }));
  }

  function changeQty(itemId: string, delta: number) {
    setCart((current) => {
      const next = (current[itemId] ?? 0) + delta;
      if (next <= 0) {
        const copy = { ...current };
        delete copy[itemId];
        return copy;
      }
      return { ...current, [itemId]: next };
    });
  }

  async function openScanner() {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setError("학생 QR을 스캔하려면 카메라 권한이 필요해요.");
        return;
      }
    }
    setError(null);
    setScannerOpen(true);
  }

  async function charge() {
    if (!classroomId) return;
    if (cartList.length === 0 || !token.trim()) {
      setError("상품과 학생 QR을 준비해 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    setReceipt(null);
    try {
      const res = await apiFetch<StoreChargeReceipt & { ok: boolean }>(
        `/api/classrooms/${encodeURIComponent(classroomId)}/store/charge`,
        {
          method: "POST",
          json: {
            cardQrToken: token.trim(),
            items: cartList.map((item) => ({ itemId: item.id, qty: item.qty })),
          },
        },
      );
      setReceipt(res);
      setCart({});
      setToken("");
      await load();
      Alert.alert("결제 완료", `${res.student.name} 학생 결제를 완료했어요.`);
    } catch (e) {
      if (await handleAuthError(e)) return;
      const body = e instanceof ApiError ? (e.body as { error?: string } | string) : null;
      setError(
        typeof body === "object" && body?.error
          ? body.error
          : typeof body === "string"
            ? body
            : "결제에 실패했어요.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader title="매점 결제" onBack={() => router.back()} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.muted}>상품을 불러오는 중이에요.</Text>
        </View>
      ) : error && items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <AppButton onPress={load}>다시 시도</AppButton>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionTitle}>상품</Text>
          {items.length === 0 ? (
            <EmptyState title="등록된 상품이 없어요." />
          ) : (
            <View style={styles.itemGrid}>
              {items.map((item) => (
                <SurfacePressable
                  key={item.id}
                  style={[styles.itemCard, item.stock === 0 && styles.itemDisabled]}
                  onPress={() => addToCart(item)}
                  disabled={item.stock === 0}
                >
                  {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={styles.itemImage} />
                  ) : null}
                  <Text style={styles.itemName} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={styles.itemPrice}>{item.price.toLocaleString()}원</Text>
                  <Text style={styles.itemStock}>
                    {item.stock === null ? "재고 무제한" : `재고 ${item.stock}`}
                  </Text>
                </SurfacePressable>
              ))}
            </View>
          )}

          <SurfaceCard style={styles.cartCard}>
            <View style={styles.cartHeader}>
              <Text style={styles.sectionTitle}>결제 바구니</Text>
              <Text style={styles.total}>{total.toLocaleString()}원</Text>
            </View>
            {cartList.length === 0 ? (
              <Text style={styles.muted}>상품을 선택해 주세요.</Text>
            ) : (
              cartList.map((item) => (
                <View key={item.id} style={styles.cartRow}>
                  <Text style={styles.cartName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View style={styles.qtyRow}>
                    <IconButton style={styles.qtyBtn} onPress={() => changeQty(item.id, -1)}>
                      <Text style={styles.qtyText}>-</Text>
                    </IconButton>
                    <Text style={styles.qtyValue}>{item.qty}</Text>
                    <IconButton style={styles.qtyBtn} onPress={() => changeQty(item.id, 1)}>
                      <Text style={styles.qtyText}>+</Text>
                    </IconButton>
                  </View>
                  <Text style={styles.cartSub}>{(item.price * item.qty).toLocaleString()}원</Text>
                </View>
              ))
            )}

            <AppButton onPress={openScanner}>
              {token ? "QR 다시 스캔" : "학생 QR 스캔"}
            </AppButton>
            {scannerOpen ? (
              <View style={styles.scannerBox}>
                <CameraView
	                  style={styles.camera}
	                  facing="back"
	                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
	                  onBarcodeScanned={({ data }) => {
	                    const scanned = parseCardQrToken(data);
	                    if (!scanned) {
	                      setError("학생 결제 QR이 아니에요.");
	                      return;
	                    }
	                    setToken(scanned);
	                    setError(null);
	                    setScannerOpen(false);
	                  }}
	                />
                <AppButton
                  variant="secondary"
                  style={styles.scannerClose}
                  onPress={() => setScannerOpen(false)}
                >
                  닫기
                </AppButton>
              </View>
            ) : null}

            <View style={[styles.scanStatus, token && styles.scanStatusReady]}>
              <Text style={[styles.scanStatusText, token && styles.scanStatusReadyText]}>
                {token ? "학생 QR 스캔 완료" : "학생 QR을 스캔해 주세요."}
              </Text>
              {token ? (
                <AppButton
                  variant="secondary"
                  onPress={() => setToken("")}
                  disabled={busy}
                >
                  해제
                </AppButton>
              ) : null}
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <AppButton
              disabled={busy || cartList.length === 0 || !token.trim()}
              loading={busy}
              onPress={charge}
            >
              결제하기
            </AppButton>
          </SurfaceCard>

          {receipt ? (
            <SurfaceCard style={styles.receipt}>
              <Text style={styles.receiptTitle}>최근 결제</Text>
              <Text style={styles.muted}>
                {receipt.student.name} · {receipt.total.toLocaleString()}원 · 잔액{" "}
                {receipt.balance.toLocaleString()}원
              </Text>
            </SurfaceCard>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseCardQrToken(value: string): string | null {
  const raw = value.trim();
  const token = extractTokenFromUrl(raw) ?? raw;
  const parts = token.split(".");
  if (parts.length !== 4 || parts.some((part) => part.length === 0)) {
    return null;
  }
  return token;
}

function extractTokenFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const token = url.searchParams.get("cardQrToken") ?? url.searchParams.get("token");
    if (token) return token.trim();
    return null;
  } catch {
    return null;
  }
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
  muted: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.danger },
  sectionTitle: { ...typography.section, color: colors.text },
  itemGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  itemCard: {
    width: store.itemCardWidth,
    minHeight: store.itemCardMinHeight,
    padding: spacing.md,
    gap: spacing.xs,
  },
  itemDisabled: { opacity: states.disabledOpacity },
  itemImage: {
    width: "100%",
    height: store.itemImageHeight,
    borderRadius: radii.btn,
    backgroundColor: colors.bg,
  },
  itemName: { ...typography.label, color: colors.text },
  itemPrice: { ...typography.section, color: colors.text },
  itemStock: { ...typography.micro, color: colors.textMuted },
  cartCard: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  cartHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  total: { ...typography.title, color: colors.accent },
  cartRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  cartName: { ...typography.label, color: colors.text, flex: 1 },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  qtyBtn: {
    backgroundColor: colors.bg,
    borderWidth: borders.hairline,
    borderColor: colors.border,
  },
  qtyText: { ...typography.section, color: colors.text },
  qtyValue: { ...typography.label, color: colors.text, width: store.qtyValueWidth, textAlign: "center" },
  cartSub: { ...typography.label, color: colors.text },
  scannerBox: {
    height: store.scannerHeight,
    overflow: "hidden",
    borderRadius: radii.card,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    backgroundColor: colors.mediaBackdrop,
  },
  camera: { flex: 1 },
  scannerClose: {
    position: "absolute",
    right: spacing.md,
    top: spacing.md,
    borderRadius: radii.pill,
  },
  scanStatus: {
    minHeight: store.scanStatusMinHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderRadius: radii.btn,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    padding: spacing.md,
    backgroundColor: colors.bg,
  },
  scanStatusReady: {
    borderColor: colors.bankPositive,
    backgroundColor: colors.statusReviewedBg,
  },
  scanStatusText: { ...typography.label, color: colors.textMuted },
  scanStatusReadyText: { color: colors.statusReviewedText },
  receipt: {
    gap: spacing.xs,
    padding: spacing.lg,
    backgroundColor: colors.accentTintedBg,
  },
  receiptTitle: { ...typography.section, color: colors.accentTintedText },
});
