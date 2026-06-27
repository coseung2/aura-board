import {
  Image,
  Modal,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  cardDetail,
  colors,
  controls,
  plant,
  radii,
  spacing,
  typography,
} from "../../theme/tokens";
import { IconButton, MediaPressable } from "../ui";

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
        <View
          style={[
            styles.container,
            { width, height: height * plant.lightboxHeightRatio },
          ]}
        >
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
        <IconButton
          onPress={onClose}
          style={styles.closeBtn}
          accessibilityLabel="관찰 사진 닫기"
        >
          <View pointerEvents="none" style={styles.closeIcon}>
            <View style={[styles.closeStroke, styles.closeStrokeA]} />
            <View style={[styles.closeStroke, styles.closeStrokeB]} />
          </View>
        </IconButton>
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
    width: controls.iconButton,
    height: controls.iconButton,
    backgroundColor: colors.lightboxControlBg,
    borderRadius: radii.pill,
    borderColor: colors.transparent,
    alignItems: "center",
    justifyContent: "center",
  },
  closeIcon: {
    width: cardDetail.closeIconSize,
    height: cardDetail.closeIconSize,
    alignItems: "center",
    justifyContent: "center",
  },
  closeStroke: {
    position: "absolute",
    width: cardDetail.closeStrokeWidth,
    height: cardDetail.iconStrokeHeight,
    borderRadius: radii.pill,
    backgroundColor: colors.onAccent,
  },
  closeStrokeA: { transform: [{ rotate: "45deg" }] },
  closeStrokeB: { transform: [{ rotate: "-45deg" }] },
});
