import { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { WebView } from "react-native-webview";
import { classifyMediaUrl, isDirectVideoUrl, safeHost } from "../lib/media";
import { colors, radii, spacing, typography } from "../theme/tokens";

type Props = {
  url: string;
  title?: string;
  aspectRatio?: number;
  style?: ViewStyle;
  hideExternal?: boolean;
};

export function EmbeddedMedia({
  url,
  title,
  aspectRatio = 16 / 9,
  style,
  hideExternal = false,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { kind, embedUrl, externalUrl } = classifyMediaUrl(url);
  const canEmbed = Boolean(embedUrl && kind !== null);

  const source =
    kind === "youtube" || kind === "canva"
      ? { uri: embedUrl! }
      : kind === "video"
        ? { html: buildVideoHtml(embedUrl!, title ?? "영상") }
        : { uri: externalUrl };

  return (
    <View style={[styles.container, { aspectRatio }, style]}>
      {canEmbed ? (
        <>
          <WebView
            originWhitelist={["*"]}
            source={source}
            style={styles.webview}
            javaScriptEnabled
            domStorageEnabled
            allowsFullscreenVideo
            mediaPlaybackRequiresUserAction={false}
            startInLoadingState
            onLoadStart={() => {
              setLoading(true);
              setError(false);
            }}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError(true);
            }}
            renderLoading={() => (
              <View style={styles.loading}>
                <ActivityIndicator size="large" color={colors.accent} />
              </View>
            )}
          />
          {loading ? (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={colors.accent} />
            </View>
          ) : null}
          {error ? (
            <View style={styles.errorOverlay}>
              <Text style={styles.errorText}>미디어를 불러올 수 없어요.</Text>
              {!hideExternal ? <ExternalOpenButton url={externalUrl} /> : null}
            </View>
          ) : null}
        </>
      ) : isDirectVideoUrl(url) ? (
        <View style={styles.unsupportedOverlay}>
          <Text style={styles.unsupportedText}>
            이 영상은 앱 안에서 재생할 수 없어요.
          </Text>
          {!hideExternal ? <ExternalOpenButton url={externalUrl} /> : null}
        </View>
      ) : (
        <View style={styles.unsupportedOverlay}>
          <Text style={styles.unsupportedText} numberOfLines={2}>
            {title ? title : safeHost(externalUrl) || "링크"}
          </Text>
          {!hideExternal ? <ExternalOpenButton url={externalUrl} /> : null}
        </View>
      )}
    </View>
  );
}

function ExternalOpenButton({ url }: { url: string }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.externalBtn,
        pressed && styles.externalBtnPressed,
      ]}
      onPress={() => Linking.openURL(url)}
    >
      <Text style={styles.externalBtnText}>외부에서 열기</Text>
    </Pressable>
  );
}

function buildVideoHtml(videoUrl: string, title: string): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body, html { width: 100%; height: 100%; background: #000; overflow: hidden; }
      video { width: 100%; height: 100%; object-fit: contain; }
    </style>
  </head>
  <body>
    <video src="${escapeHtml(videoUrl)}" controls playsinline preload="metadata" title="${escapeHtml(title)}"></video>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    borderRadius: radii.card,
    backgroundColor: colors.surfaceAlt,
    overflow: "hidden",
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
    padding: spacing.lg,
    gap: spacing.md,
  },
  errorText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
  unsupportedOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  unsupportedText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
  externalBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.pill,
    backgroundColor: colors.accentTintedBg,
  },
  externalBtnPressed: {
    opacity: 0.7,
  },
  externalBtnText: {
    ...typography.label,
    color: colors.accentTintedText,
  },
});
