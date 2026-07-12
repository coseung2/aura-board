import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  auth,
  brand,
  colors,
  spacing,
  typography,
} from "../../../theme/tokens";
import { LogoLockup } from "../../../components/LogoLockup";
import { SurfaceCard } from "../../../components/ui";

// 딥링크 매직링크 콜백 진입점.
// 실제 토큰 파싱/네비게이션은 루트 레이아웃의 useParentDeepLink 에서 처리하며,
// 이 파일은 Expo Router 의 파일 기반 라우팅에 매칭되는 경로를 제공하기 위함입니다.

export default function ParentAuthCallback() {
  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.inner}>
        <LogoLockup size={brand.logoSize} wordmarkStyle={styles.brandTitle} />
        <SurfaceCard
          style={styles.card}
          accessibilityLabel="로그인 처리 중"
          accessibilityLiveRegion="polite"
        >
          <ActivityIndicator
            size="large"
            color={colors.accent}
            accessibilityLabel="로그인 처리 중"
          />
          <Text style={styles.text}>로그인 처리 중…</Text>
        </SurfaceCard>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  inner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    gap: spacing.lg,
  },
  brandTitle: { ...typography.display, color: colors.text },
  card: {
    width: "100%",
    maxWidth: auth.cardMaxWidth,
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xxl,
    alignItems: "center",
    gap: spacing.md,
  },
  text: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
});
