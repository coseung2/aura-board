import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  type StyleProp,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { WebView } from "react-native-webview";
import {
  classifyMediaUrl,
  embedOriginWhitelist,
  extractYouTubeVideoId,
  isAllowedEmbedNavigation,
  isDirectVideoUrl,
  isMobileEmbedUrl,
  MOBILE_EMBED_ORIGIN,
  safeHost,
} from "../lib/media";
import { colors, media, radii, spacing, typography } from "../theme/tokens";
import { AppButton } from "./ui";

type Props = {
  url: string;
  title?: string;
  aspectRatio?: number;
  style?: StyleProp<ViewStyle>;
  hideExternal?: boolean;
};

type EmbedMessage = {
  type?: "ready" | "error";
  kind?: "youtube" | "canva" | "video";
  code?: string | number;
};

const EMBED_LOAD_TIMEOUT_MS = 15_000;

export function EmbeddedMedia({
  url,
  title,
  aspectRatio = media.previewAspectRatio,
  style,
  hideExternal = false,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const { kind, embedUrl, externalUrl } = classifyMediaUrl(url);
  const youtubeId = kind === "youtube" ? extractYouTubeVideoId(url) : null;
  const canEmbed = Boolean(
    embedUrl && kind !== null && (kind !== "youtube" || youtubeId),
  );
  const canOpenExternal = !hideExternal && !isMobileEmbedUrl(externalUrl);

  const source = useMemo(() => {
    const fallbackTitle = title ?? "미디어";
    if (kind === "youtube" && youtubeId) {
      return {
        html: buildYouTubeHtml(youtubeId, fallbackTitle, colors.mediaBackdrop),
        baseUrl: `${MOBILE_EMBED_ORIGIN}/mobile-embed/youtube/`,
      };
    }
    if (kind === "canva" && embedUrl) {
      return {
        html: buildCanvaHtml(embedUrl, fallbackTitle, colors.mediaBackdrop),
        baseUrl: `${MOBILE_EMBED_ORIGIN}/mobile-embed/canva/`,
      };
    }
    if (kind === "video" && embedUrl) {
      return {
        html: buildVideoHtml(embedUrl, fallbackTitle, colors.mediaBackdrop),
        baseUrl: `${MOBILE_EMBED_ORIGIN}/mobile-embed/video/`,
      };
    }
    return { uri: externalUrl };
  }, [embedUrl, externalUrl, kind, title, youtubeId]);
  const originWhitelist = useMemo(
    () => embedOriginWhitelist(kind, embedUrl),
    [embedUrl, kind],
  );

  useEffect(() => {
    setLoading(canEmbed);
    setErrorMessage(null);
    setReloadKey(0);
  }, [canEmbed, embedUrl, url]);

  useEffect(() => {
    if (!canEmbed || !loading || errorMessage) return;
    const timer = setTimeout(() => {
      setLoading(false);
      setErrorMessage(
        kind === "youtube"
          ? "YouTube 응답이 지연되고 있어요. 다시 시도하거나 외부에서 열어 주세요."
          : kind === "canva"
            ? "Canva 응답이 지연되고 있어요. 공개 보기 권한을 확인해 주세요."
            : "미디어 응답이 지연되고 있어요. 다시 시도해 주세요.",
      );
    }, EMBED_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [canEmbed, errorMessage, kind, loading, reloadKey, url]);

  return (
    <View style={[styles.container, { aspectRatio }, style]}>
      {canEmbed ? (
        <>
          <WebView
            key={`${url}:${reloadKey}`}
            originWhitelist={originWhitelist}
            source={source}
            style={styles.webview}
            javaScriptEnabled
            domStorageEnabled
            thirdPartyCookiesEnabled={kind === "canva"}
            sharedCookiesEnabled={kind === "canva"}
            allowsFullscreenVideo
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            setSupportMultipleWindows={false}
            startInLoadingState
            onShouldStartLoadWithRequest={(request) =>
              isAllowedEmbedNavigation(request.url, kind, embedUrl)
            }
            onMessage={(event) => {
              const message = parseEmbedMessage(event.nativeEvent.data);
              if (!message) return;
              if (message.type === "ready") {
                setLoading(false);
                setErrorMessage(null);
              } else if (message.type === "error") {
                setLoading(false);
                setErrorMessage(
                  resolveEmbedErrorMessage(message.kind ?? kind, message.code),
                );
              }
            }}
            onLoadStart={() => {
              setLoading(true);
              setErrorMessage(null);
            }}
            onError={() => {
              setLoading(false);
              setErrorMessage("미디어를 불러올 수 없어요.");
            }}
            onHttpError={({ nativeEvent }) => {
              setLoading(false);
              setErrorMessage(
                `미디어 서버가 응답하지 않았어요. (${nativeEvent.statusCode})`,
              );
            }}
            onContentProcessDidTerminate={() => {
              setLoading(false);
              setErrorMessage("미디어 화면이 종료됐어요. 다시 시도해 주세요.");
            }}
            onRenderProcessGone={() => {
              setLoading(false);
              setErrorMessage("미디어 화면이 종료됐어요. 다시 시도해 주세요.");
            }}
            renderLoading={() => (
              <View style={styles.loading}>
                <ActivityIndicator size="large" color={colors.accent} />
              </View>
            )}
          />
          {loading ? (
            <View style={styles.loadingOverlay} pointerEvents="none">
              <ActivityIndicator size="large" color={colors.accent} />
            </View>
          ) : null}
          {errorMessage ? (
            <View style={styles.errorOverlay}>
              <Text style={styles.errorText}>{errorMessage}</Text>
              <View style={styles.errorActions}>
                <AppButton
                  variant="secondary"
                  style={styles.externalBtn}
                  textStyle={styles.externalBtnText}
                  onPress={() => {
                    setErrorMessage(null);
                    setLoading(true);
                    setReloadKey((value) => value + 1);
                  }}
                >
                  다시 시도
                </AppButton>
                {canOpenExternal ? (
                  <ExternalOpenButton url={externalUrl} />
                ) : null}
              </View>
            </View>
          ) : null}
        </>
      ) : isDirectVideoUrl(url) ? (
        <View style={styles.unsupportedOverlay}>
          <Text style={styles.unsupportedText}>
            이 영상은 앱 안에서 재생할 수 없어요.
          </Text>
          {canOpenExternal ? <ExternalOpenButton url={externalUrl} /> : null}
        </View>
      ) : (
        <View style={styles.unsupportedOverlay}>
          <Text style={styles.unsupportedText} numberOfLines={2}>
            {title ? title : safeHost(externalUrl) || "링크"}
          </Text>
          <Text style={styles.unsupportedHint}>
            공개 임베드 링크가 아니어서 외부 앱에서 열어야 해요.
          </Text>
          {canOpenExternal ? <ExternalOpenButton url={externalUrl} /> : null}
        </View>
      )}
    </View>
  );
}

function ExternalOpenButton({ url }: { url: string }) {
  return (
    <AppButton
      variant="secondary"
      style={styles.externalBtn}
      textStyle={styles.externalBtnText}
      onPress={() => void openExternalUrl(url)}
    >
      외부에서 열기
    </AppButton>
  );
}

async function openExternalUrl(url: string) {
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    }
  } catch {
    // Ignore malformed or unsupported media links from legacy cards.
  }
}

function parseEmbedMessage(raw: string): EmbedMessage | null {
  try {
    const parsed = JSON.parse(raw) as EmbedMessage;
    if (parsed.type !== "ready" && parsed.type !== "error") return null;
    return parsed;
  } catch {
    return null;
  }
}

function resolveEmbedErrorMessage(
  kind: EmbedMessage["kind"] | null,
  code: string | number | undefined,
): string {
  const normalizedCode = String(code ?? "");
  if (kind === "youtube") {
    if (normalizedCode === "2") return "올바르지 않은 YouTube 링크예요.";
    if (normalizedCode === "5") {
      return "이 기기에서 YouTube HTML5 재생을 시작하지 못했어요.";
    }
    if (normalizedCode === "100") {
      return "삭제됐거나 비공개로 전환된 YouTube 영상이에요.";
    }
    if (normalizedCode === "101" || normalizedCode === "150") {
      return "영상 소유자가 앱 안에서의 재생을 허용하지 않았어요.";
    }
    if (normalizedCode === "153") {
      return "YouTube가 앱의 재생 요청 출처를 확인하지 못했어요. 다시 시도하거나 외부에서 열어 주세요.";
    }
    return "YouTube 영상을 재생하지 못했어요.";
  }
  if (kind === "canva") {
    return "Canva 디자인을 앱 안에서 열지 못했어요. 공개 보기 권한을 확인해 주세요.";
  }
  return "미디어를 재생하지 못했어요.";
}

function buildYouTubeHtml(
  videoId: string,
  title: string,
  backgroundColor: string,
): string {
  const serializedVideoId = serializeForInlineScript(videoId);
  const serializedOrigin = serializeForInlineScript(MOBILE_EMBED_ORIGIN);
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <title>${escapeHtml(title)}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body, #player { width: 100%; height: 100%; background: ${backgroundColor}; overflow: hidden; }
      iframe { display: block; width: 100%; height: 100%; border: 0; }
    </style>
  </head>
  <body>
    <div id="player"></div>
    <script>
      (function () {
        var notify = function (payload) {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify(payload));
          }
        };
        var videoId = ${serializedVideoId};
        var origin = ${serializedOrigin};
        window.onYouTubeIframeAPIReady = function () {
          try {
            new YT.Player("player", {
              width: "100%",
              height: "100%",
              videoId: videoId,
              playerVars: {
                autoplay: 0,
                controls: 1,
                fs: 1,
                playsinline: 1,
                rel: 0,
                origin: origin,
                widget_referrer: origin
              },
              events: {
                onReady: function () {
                  notify({ type: "ready", kind: "youtube" });
                },
                onError: function (event) {
                  notify({ type: "error", kind: "youtube", code: event.data });
                }
              }
            });
          } catch (error) {
            notify({ type: "error", kind: "youtube", code: "player-init" });
          }
        };
        var script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.onerror = function () {
          notify({ type: "error", kind: "youtube", code: "api-load" });
        };
        document.head.appendChild(script);
      })();
    </script>
  </body>
</html>`;
}

function buildCanvaHtml(
  embedUrl: string,
  title: string,
  backgroundColor: string,
): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <title>${escapeHtml(title)}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 100%; height: 100%; background: ${backgroundColor}; overflow: hidden; }
      iframe { display: block; width: 100%; height: 100%; border: 0; }
    </style>
  </head>
  <body>
    <iframe
      id="canva-frame"
      src="${escapeHtml(embedUrl)}"
      title="${escapeHtml(title)}"
      loading="eager"
      sandbox="allow-scripts allow-same-origin allow-forms"
      allow="fullscreen"
      referrerpolicy="strict-origin-when-cross-origin"
      allowfullscreen
    ></iframe>
    <script>
      (function () {
        var frame = document.getElementById("canva-frame");
        var notify = function (payload) {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify(payload));
          }
        };
        frame.addEventListener("load", function () {
          notify({ type: "ready", kind: "canva" });
        });
        frame.addEventListener("error", function () {
          notify({ type: "error", kind: "canva", code: "frame-load" });
        });
      })();
    </script>
  </body>
</html>`;
}

function buildVideoHtml(
  videoUrl: string,
  title: string,
  backgroundColor: string,
): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body, html { width: 100%; height: 100%; background: ${backgroundColor}; overflow: hidden; }
      video { width: 100%; height: 100%; object-fit: contain; }
    </style>
  </head>
  <body>
    <video id="video" src="${escapeHtml(videoUrl)}" controls playsinline preload="metadata" title="${escapeHtml(title)}"></video>
    <script>
      (function () {
        var video = document.getElementById("video");
        var notify = function (payload) {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify(payload));
          }
        };
        video.addEventListener("loadedmetadata", function () {
          notify({ type: "ready", kind: "video" });
        });
        video.addEventListener("error", function () {
          notify({ type: "error", kind: "video", code: "video-load" });
        });
      })();
    </script>
  </body>
</html>`;
}

function serializeForInlineScript(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
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
  errorActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
  },
  unsupportedOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.sm,
  },
  unsupportedText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
  unsupportedHint: {
    ...typography.badge,
    color: colors.textFaint,
    textAlign: "center",
  },
  externalBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.accentTintedBg,
  },
  externalBtnText: {
    ...typography.label,
    color: colors.accentTintedText,
  },
});
