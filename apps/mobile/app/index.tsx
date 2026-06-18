import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  brand,
  colors,
  iconSizes,
  layout,
  responsive,
  spacing,
  typography,
} from "../theme/tokens";
import {
  clearParentSession,
  loadSessionToken,
  loadParentToken,
  saveParentCache,
} from "../lib/session";
import { apiFetch } from "../lib/api";
import { webSafeWidthStyle } from "../lib/responsive";
import { LogoLockup } from "../components/LogoLockup";
import { SurfacePressable } from "../components/ui";
import type { ParentChildrenResponse } from "../lib/types";

// 랜딩 화면 — 학생 / 학부모 역할 선택.
// 기존 세션이 있으면 해당 역할 대시보드로 자동 이동.

export default function Landing() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [booting, setBooting] = useState(true);
  const isNarrow = width < layout.mobileBreakpoint;
  const webNarrowContentStyle = webSafeWidthStyle(width, {
    enabled: isNarrow,
    inset: responsive.roleWebSafeInset,
    maxWidth: layout.roleCardNarrowMaxWidth,
  });

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
        const parentToken = await loadParentToken();
        if (parentToken) {
          const res = await apiFetch<ParentChildrenResponse>(
            "/api/parent/children",
            { parentAuth: true },
          );
          void saveParentCache({
            id: res.parent.id,
            name: res.parent.name || "학부모",
            email: res.parent.email,
            linkedStudentIds: res.children.map((child) => child.studentId),
          });
          router.replace("/(parent)");
          return;
        }
      } catch {
        await clearParentSession();
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
          <LogoLockup size={brand.logoSize} wordmarkStyle={styles.brandTitle} />
        </View>
        <Text style={styles.brandSub}>역할을 선택해 주세요</Text>

        <View
          style={[
            styles.cardRow,
            isNarrow && styles.cardRowNarrow,
            webNarrowContentStyle,
          ]}
        >
          <SurfacePressable
            style={[styles.roleCard, isNarrow && styles.roleCardNarrow]}
            onPress={() => router.push("/(student)/login")}
          >
            <Text style={styles.roleEmoji}>🎒</Text>
            <Text style={styles.roleTitle}>학생</Text>
            <Text style={styles.roleDesc}>
              선생님께 받은{"\n"}6자리 코드로 입장
            </Text>
          </SurfacePressable>

          <SurfacePressable
            style={[styles.roleCard, isNarrow && styles.roleCardNarrow]}
            onPress={() => router.push("/(parent)/login")}
          >
            <Text style={styles.roleEmoji}>👨‍👩‍👧</Text>
            <Text style={styles.roleTitle}>학부모</Text>
            <Text style={styles.roleDesc}>
              자녀의 학급 활동을{"\n"}확인하세요
            </Text>
          </SurfacePressable>
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
    maxWidth: layout.roleCardNarrowMaxWidth,
  },
  roleCard: {
    width: layout.roleCardWidth,
    padding: spacing.xxl,
    alignItems: "center",
    gap: spacing.md,
  },
  roleCardNarrow: {
    width: "100%",
  },
  roleEmoji: { fontSize: iconSizes.hero },
  roleTitle: { ...typography.title, color: colors.text },
  roleDesc: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
});
