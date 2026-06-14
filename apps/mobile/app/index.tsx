import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  colors,
  radii,
  shadows,
  spacing,
  tapMin,
  typography,
} from "../theme/tokens";
import { loadSessionToken, loadParentToken } from "../lib/session";
import { apiFetch } from "../lib/api";
import { LogoLockup } from "../components/LogoLockup";

// 랜딩 화면 — 학생 / 학부모 역할 선택.
// 기존 세션이 있으면 해당 역할 대시보드로 자동 이동.

export default function Landing() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [booting, setBooting] = useState(true);
  const isNarrow = width < 640;

  useEffect(() => {
    (async () => {
      try {
        // 기존 학생 세션 확인
        const studentToken = await loadSessionToken();
        if (studentToken) {
          await apiFetch("/api/student/me");
          router.replace("/(student)");
          return;
        }
      } catch {
        // 학생 세션 무효
      }

      try {
        // 기존 학부모 세션 확인
        const parentToken = await loadParentToken();
        if (parentToken) {
          // 학부모 API는 아직 mock이므로 세션 존재만으로 이동
          router.replace("/(parent)");
          return;
        }
      } catch {
        // 학부모 세션 무효
      }

      setBooting(false);
    })();
  }, [router]);

  if (booting) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.bootingCenter}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.bootingText}>불러오는 중…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.inner}>
        <View style={styles.brandRow}>
          <LogoLockup size={40} wordmarkStyle={styles.brandTitle} />
        </View>
        <Text style={styles.brandSub}>역할을 선택해 주세요</Text>

        <View style={[styles.cardRow, isNarrow && styles.cardRowNarrow]}>
          <Pressable
            style={({ pressed }) => [
              styles.roleCard,
              pressed && styles.roleCardPressed,
            ]}
            onPress={() => router.push("/(student)/login")}
          >
            <Text style={styles.roleEmoji}>🎒</Text>
            <Text style={styles.roleTitle}>학생</Text>
            <Text style={styles.roleDesc}>
              선생님께 받은{"\n"}6자리 코드로 입장
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.roleCard,
              pressed && styles.roleCardPressed,
            ]}
            onPress={() => router.push("/(parent)/login")}
          >
            <Text style={styles.roleEmoji}>👨‍👩‍👧</Text>
            <Text style={styles.roleTitle}>학부모</Text>
            <Text style={styles.roleDesc}>
              자녀의 학급 활동을{"\n"}확인하세요
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  bootingCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  bootingText: { ...typography.body, color: colors.textMuted },
  inner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    gap: spacing.lg,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  brandTitle: { ...typography.display, color: colors.text },
  brandSub: { ...typography.subtitle, color: colors.textMuted, marginBottom: spacing.xl },
  cardRow: {
    flexDirection: "row",
    gap: spacing.xl,
  },
  cardRowNarrow: {
    flexDirection: "column",
    width: "100%",
    maxWidth: 320,
  },
  roleCard: {
    width: 240,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.xxl,
    alignItems: "center",
    gap: spacing.md,
    minHeight: tapMin,
    ...shadows.card,
  },
  roleCardPressed: {
    backgroundColor: colors.surfaceAlt,
    transform: [{ scale: 0.97 }],
  },
  roleEmoji: { fontSize: 56 },
  roleTitle: { ...typography.title, color: colors.text },
  roleDesc: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
});
