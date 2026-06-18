import { Image, Modal, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { colors, plant, radii, spacing, typography } from "../../theme/tokens";
import { AppButton, MediaPressable } from "../ui";

interface Props {
  url: string | null;
  onClose: () => void;
}

/**
 * 풀스크린 이미지 라이트박스.
 * 관찰 기록의 이미지 썸네일을 탭하면 원본을 보여줌.
 * 향후 react-native-reanimated 기반 pinch-to-zoom 추가 예정.
 */
export function ImageLightbox({ url, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  if (!url) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <MediaPressable style={styles.backdrop} onPress={onClose}>
          <View style={[styles.container, { width, height: height * plant.lightboxHeightRatio }]}>
            <Image
              source={{ uri: url }}
              style={[
                styles.image,
                {
                  width: width * plant.lightboxImageWidthRatio,
                  height: height * plant.lightboxImageHeightRatio,
                },
              ]}
            resizeMode="contain"
            accessibilityLabel="관찰 사진 원본"
          />
        </View>
        <AppButton
          variant="quiet"
          style={styles.closeBtn}
          textStyle={styles.closeText}
          onPress={onClose}
        >
          ✕ 닫기
        </AppButton>
      </MediaPressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.lightboxOverlay,
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  image: {},
  closeBtn: {
    position: "absolute",
    bottom: plant.lightboxCloseBottom,
    alignSelf: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.lightboxControlBg,
    borderRadius: radii.pill,
    borderColor: colors.transparent,
  },
  closeText: {
    ...typography.label,
    color: colors.onAccent,
  },
});
