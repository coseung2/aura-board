import { Dimensions, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../../theme/tokens";

interface Props {
  url: string | null;
  onClose: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

/**
 * 풀스크린 이미지 라이트박스.
 * 관찰 기록의 이미지 썸네일을 탭하면 원본을 보여줌.
 * 향후 react-native-reanimated 기반 pinch-to-zoom 추가 예정.
 */
export function ImageLightbox({ url, onClose }: Props) {
  if (!url) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.container}>
          <Image
            source={{ uri: url }}
            style={styles.image}
            resizeMode="contain"
            accessibilityLabel="관찰 사진 원본"
          />
        </View>
        <Pressable style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeText}>✕ 닫기</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.75,
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: SCREEN_WIDTH * 0.92,
    height: SCREEN_HEIGHT * 0.7,
  },
  closeBtn: {
    position: "absolute",
    bottom: 60,
    alignSelf: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20,
  },
  closeText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});
