import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import {
  colors,
  fontFamilies,
  layers,
  pageChrome,
  spacing,
  typography,
} from "../theme/tokens";
import { apiFetch, parentApiFetch } from "../lib/api";
import {
  loadParentSelectedChild,
  subscribeParentSelectedChild,
} from "../lib/session";

export type DailyBannerKind = "image" | "marquee";

export type DailyBannerValue = {
  kind: DailyBannerKind;
  text?: string;
  imageUrl?: string;
  submittedByName?: string;
};

export type DailyBannerRole = "student" | "parent";

type Props = {
  role: DailyBannerRole;
  studentId?: string | null;
};

type DailyBannerPreviewProps = {
  text?: string;
  imageUrl?: string;
  onImageError?: () => void;
};

type DailyBannerScope = {
  role: DailyBannerRole;
  studentId?: string | null;
};

const DailyBannerScopeContext = createContext<DailyBannerScope | null>(null);

export function DailyBannerProvider({
  role,
  children,
}: {
  role: DailyBannerRole;
  children: ReactNode;
}) {
  const [studentId, setStudentId] = useState<string | null | undefined>(
    role === "parent" ? undefined : null,
  );

  useEffect(() => {
    if (role !== "parent") {
      setStudentId(null);
      return;
    }

    let active = true;
    let receivedSelection = false;
    const unsubscribe = subscribeParentSelectedChild((selectedStudentId) => {
      receivedSelection = true;
      if (active) setStudentId(selectedStudentId);
    });
    void loadParentSelectedChild().then((selectedStudentId) => {
      if (active && !receivedSelection) setStudentId(selectedStudentId);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [role]);

  const scope = useMemo(
    () => ({ role, studentId }),
    [role, studentId],
  );

  return (
    <DailyBannerScopeContext.Provider value={scope}>
      {children}
    </DailyBannerScopeContext.Provider>
  );
}

export function useDailyBannerScope() {
  return useContext(DailyBannerScopeContext);
}

function parseBanner(value: unknown): DailyBannerValue | null {
  if (!value || typeof value !== "object") return null;
  const response = value as { banner?: unknown };
  if (!response.banner || typeof response.banner !== "object") return null;

  const raw = response.banner as Record<string, unknown>;
  const submittedByName =
    typeof raw.submittedByName === "string" && raw.submittedByName.trim()
      ? raw.submittedByName.trim()
      : undefined;

  if (
    (raw.kind === "marquee" || raw.kind === "text") &&
    typeof raw.text === "string" &&
    raw.text.trim()
  ) {
    return {
      kind: "marquee",
      text: raw.text.trim(),
      submittedByName,
    };
  }

  if (
    raw.kind === "image" &&
    typeof raw.imageUrl === "string" &&
    raw.imageUrl.trim()
  ) {
    return {
      kind: "image",
      imageUrl: raw.imageUrl.trim(),
      text:
        typeof raw.text === "string" && raw.text.trim()
          ? raw.text.trim()
          : undefined,
      submittedByName,
    };
  }

  return null;
}

/**
 * One-line, role-aware ticker rendered directly below a page title.
 */
export function DailyBanner({ role, studentId }: Props) {
  const [banner, setBanner] = useState<DailyBannerValue | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBanner(null);
    setImageFailed(false);

    const path =
      role === "student"
        ? "/api/student/daily-banner/current"
        : `/api/parent/daily-banner/current${
            studentId
              ? `?studentId=${encodeURIComponent(studentId)}`
              : ""
          }`;

    const fetchCurrent = role === "student" ? apiFetch : parentApiFetch;
    void fetchCurrent<unknown>(path, { cacheTtlMs: 60_000 })
      .then((response) => {
        if (cancelled) return;
        const next = parseBanner(response);
        setBanner(next);
      })
      .catch(() => {
        if (cancelled) return;
        setBanner(null);
      });

    return () => {
      cancelled = true;
    };
  }, [role, studentId]);

  const publishedBanner = banner;

  return (
    <View style={styles.container} accessibilityRole="summary">
      <DailyBannerPreview
        text={publishedBanner?.text}
        imageUrl={imageFailed ? undefined : publishedBanner?.imageUrl}
        onImageError={() => setImageFailed(true)}
      />
    </View>
  );
}

/** Same 3:1 visual used for the published banner and the proposal preview. */
export function DailyBannerPreview({
  text,
  imageUrl,
  onImageError,
}: DailyBannerPreviewProps) {
  const tickerText = text || "여러분들의 마음을 전달해보세요";

  if (!imageUrl) {
    return (
      <View style={styles.ticker}>
        <MarqueeText text={tickerText} />
      </View>
    );
  }

  return (
    <View style={styles.imageStage}>
      <Image
        source={{ uri: imageUrl }}
        style={styles.image}
        contentFit="cover"
        accessibilityLabel="오늘의 배너 이미지"
        onError={onImageError}
      />
      {text ? (
        <View pointerEvents="none" style={styles.imageOverlay}>
          <MarqueeText text={text} />
        </View>
      ) : null}
    </View>
  );
}

function MarqueeText({ text }: { text: string }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [viewportWidth, setViewportWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const characterCount = Array.from(text).length;
  const shouldAnimate = viewportWidth > 0 && textWidth > 0;
  // Student proposals allow up to 120 characters. Give the off-screen native
  // Text enough room for the full line before reading its real rendered width.
  const measureWidth = Math.max(
    viewportWidth * 4,
    characterCount * (typography.label.fontSize * 2 + spacing.md),
  );

  useEffect(() => {
    translateX.stopAnimation();
    translateX.setValue(viewportWidth);
    if (!shouldAnimate) return;

    const animation = Animated.loop(
      Animated.timing(translateX, {
        // Keep a single native Text node in the moving track. On Android this
        // avoids overlapping duplicate glyph runs from the pixel font.
        toValue: -textWidth,
        duration: Math.max(6_000, characterCount * 550),
        easing: (value) => value,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => {
      animation.stop();
    };
  }, [characterCount, shouldAnimate, textWidth, translateX, viewportWidth]);

  useEffect(() => {
    setTextWidth(0);
  }, [text]);

  return (
    <View
      style={styles.marqueeViewport}
      accessibilityLabel={text}
      onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
    >
      <Text
        pointerEvents="none"
        style={[styles.marqueeMeasure, { left: -measureWidth, width: measureWidth }]}
        numberOfLines={1}
        onTextLayout={(event) => {
          const nextWidth = Math.ceil(event.nativeEvent.lines[0]?.width ?? 0);
          if (nextWidth > 0) {
            setTextWidth((current) => (current === nextWidth ? current : nextWidth));
          }
        }}
      >
        {text}
      </Text>
      {textWidth > 0 ? (
        <Animated.View
          style={[
            styles.marqueeTrack,
            { transform: [{ translateX }] },
          ]}
        >
          <Text
            style={[styles.marqueeText, { width: textWidth }]}
            numberOfLines={1}
            accessible={false}
          >
            {text}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    backgroundColor: colors.accentTintedBg,
  },
  marqueeViewport: {
    width: "100%",
    overflow: "hidden",
    minHeight: typography.label.lineHeight * 2,
    justifyContent: "center",
  },
  marqueeTrack: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    alignSelf: "flex-start",
    flexGrow: 0,
    flexShrink: 0,
    gap: spacing.none,
  },
  marqueeMeasure: {
    ...typography.label,
    position: "absolute",
    top: 0,
    color: colors.transparent,
    fontSize: typography.label.fontSize * 2,
    lineHeight: typography.label.lineHeight * 2,
    fontFamily: fontFamilies.banner,
    letterSpacing: typography.label.letterSpacing,
  },
  marqueeText: {
    ...typography.label,
    fontSize: typography.label.fontSize * 2,
    lineHeight: typography.label.lineHeight * 2,
    color: colors.onAccent,
    fontFamily: fontFamilies.banner,
    letterSpacing: typography.label.letterSpacing,
    flexShrink: 0,
  },
  ticker: {
    width: "100%",
    minHeight: pageChrome.bannerTickerMinHeight,
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: colors.accent,
  },
  imageStage: {
    width: "100%",
    aspectRatio: pageChrome.bannerImageAspectRatio,
    maxHeight: pageChrome.bannerImageMaxHeight,
    position: "relative",
    overflow: "hidden",
    backgroundColor: colors.surfaceAlt,
  },
  image: {
    ...StyleSheet.absoluteFillObject,
  },
  imageOverlay: {
    position: "absolute",
    zIndex: layers.badge,
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: pageChrome.bannerTickerMinHeight,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    backgroundColor: colors.overlay,
  },
});
