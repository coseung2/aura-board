import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../../../theme/tokens";

// 딥링크 매직링크 콜백 진입점.
// 실제 토큰 파싱/네비게이션은 루트 레이아웃의 useParentDeepLink 에서 처리하며,
// 이 파일은 Expo Router 의 파일 기반 라우팅에 매칭되는 경로를 제공하기 위함입니다.

export default function ParentAuthCallback() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={styles.text}>로그인 처리 중…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  text: { ...typography.body, color: colors.textMuted },
});
