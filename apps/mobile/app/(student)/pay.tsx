import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import type { StoreChargeReceipt, StoreItem } from "../../lib/types";

export default function StudentPayScreen() {
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
        setError("카메라 권한이 필요해요. 토큰 입력은 계속 사용할 수 있어요.");
        return;
      }
    }
    setError(null);
    setScannerOpen(true);
  }

  async function charge() {
    if (!classroomId) return;
    if (cartList.length === 0 || !token.trim()) {
      setError("상품과 학생 QR 토큰을 준비해 주세요.");
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
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>매점 결제</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.muted}>상품을 불러오는 중이에요.</Text>
        </View>
      ) : error && items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.primaryBtn} onPress={load}>
            <Text style={styles.primaryText}>다시 시도</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionTitle}>상품</Text>
          {items.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.muted}>등록된 상품이 없어요.</Text>
            </View>
          ) : (
            <View style={styles.itemGrid}>
              {items.map((item) => (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [
                    styles.itemCard,
                    item.stock === 0 && styles.itemDisabled,
                    pressed && item.stock !== 0 && styles.itemPressed,
                  ]}
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
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.cartCard}>
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
                    <Pressable style={styles.qtyBtn} onPress={() => changeQty(item.id, -1)}>
                      <Text style={styles.qtyText}>-</Text>
                    </Pressable>
                    <Text style={styles.qtyValue}>{item.qty}</Text>
                    <Pressable style={styles.qtyBtn} onPress={() => changeQty(item.id, 1)}>
                      <Text style={styles.qtyText}>+</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.cartSub}>{(item.price * item.qty).toLocaleString()}원</Text>
                </View>
              ))
            )}

            <Pressable style={styles.scanBtn} onPress={openScanner}>
              <Text style={styles.scanText}>QR 스캔</Text>
            </Pressable>
            {scannerOpen ? (
              <View style={styles.scannerBox}>
                <CameraView
                  style={styles.camera}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={({ data }) => {
                    setToken(data);
                    setScannerOpen(false);
                  }}
                />
                <Pressable style={styles.scannerClose} onPress={() => setScannerOpen(false)}>
                  <Text style={styles.scannerCloseText}>닫기</Text>
                </Pressable>
              </View>
            ) : null}

            <TextInput
              style={styles.tokenInput}
              value={token}
              onChangeText={setToken}
              multiline
              placeholder="학생 QR 토큰"
              placeholderTextColor={colors.textFaint}
              editable={!busy}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              style={({ pressed }) => [
                styles.chargeBtn,
                (busy || cartList.length === 0 || !token.trim()) && styles.chargeBtnDisabled,
                pressed && styles.chargeBtnPressed,
              ]}
              disabled={busy || cartList.length === 0 || !token.trim()}
              onPress={charge}
            >
              <Text style={styles.chargeText}>{busy ? "결제 중..." : "결제하기"}</Text>
            </Pressable>
          </View>

          {receipt ? (
            <View style={styles.receipt}>
              <Text style={styles.receiptTitle}>최근 결제</Text>
              <Text style={styles.muted}>
                {receipt.student.name} · {receipt.total.toLocaleString()}원 · 잔액{" "}
                {receipt.balance.toLocaleString()}원
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
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
  muted: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.danger },
  primaryBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.accent,
    ...shadows.accent,
  },
  primaryText: { ...typography.label, color: "#fff" },
  sectionTitle: { ...typography.section, color: colors.text },
  emptyBox: {
    padding: spacing.xl,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  itemCard: {
    width: 160,
    minHeight: 154,
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  itemPressed: { backgroundColor: colors.surfaceAlt },
  itemDisabled: { opacity: 0.45 },
  itemImage: {
    width: "100%",
    height: 72,
    borderRadius: radii.btn,
    backgroundColor: colors.bg,
  },
  itemName: { ...typography.label, color: colors.text },
  itemPrice: { ...typography.section, color: colors.text },
  itemStock: { ...typography.micro, color: colors.textMuted },
  cartCard: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
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
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cartName: { ...typography.label, color: colors.text, flex: 1 },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  qtyBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  qtyText: { ...typography.section, color: colors.text },
  qtyValue: { ...typography.label, color: colors.text, width: 24, textAlign: "center" },
  cartSub: { ...typography.label, color: colors.text },
  scanBtn: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.btn,
    backgroundColor: colors.accent,
  },
  scanText: { ...typography.label, color: "#fff" },
  scannerBox: {
    height: 280,
    overflow: "hidden",
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#000",
  },
  camera: { flex: 1 },
  scannerClose: {
    position: "absolute",
    right: spacing.md,
    top: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  scannerCloseText: { ...typography.label, color: colors.text },
  tokenInput: {
    minHeight: 74,
    borderRadius: radii.btn,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.text,
    backgroundColor: colors.bg,
    textAlignVertical: "top",
  },
  chargeBtn: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.btn,
    backgroundColor: colors.accent,
  },
  chargeBtnPressed: { backgroundColor: colors.accentActive },
  chargeBtnDisabled: { backgroundColor: colors.textFaint },
  chargeText: { ...typography.subtitle, color: "#fff" },
  receipt: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.accentTintedBg,
  },
  receiptTitle: { ...typography.section, color: colors.accentTintedText },
});
