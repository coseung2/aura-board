import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import {
  colors,
  pageChrome,
  spacing,
  typography,
} from "../theme/tokens";
import { apiFetch, parentApiFetch } from "../lib/api";

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
};

const DailyBannerRoleContext = createContext<DailyBannerRole | null>(null);

export function DailyBannerProvider({
  role,
  children,
}: {
  role: DailyBannerRole;
  children: ReactNode;
}) {
  return (
    <DailyBannerRoleContext.Provider value={role}>
      {children}
    </DailyBannerRoleContext.Provider>
  );
}

export function useDailyBannerRole() {
  return useContext(DailyBannerRoleContext);
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
      submittedByName,
    };
  }

  return null;
}

/**
 * One-line, role-aware ticker rendered directly below a page title.
 */
export function DailyBanner({ role }: Props) {
  const [banner, setBanner] = useState<DailyBannerValue | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBanner(null);
    setImageFailed(false);

    const path =
      role === "student"
        ? "/api/student/daily-banner/current"
        : "/api/parent/daily-banner/current";

    const fetchCurrent = role === "student" ? apiFetch : parentApiFetch;
    void fetchCurrent<unknown>(path)
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
  }, [role]);

  const publishedBanner = imageFailed ? null : banner;
  const tickerText =
    publishedBanner?.kind === "marquee" && publishedBanner.text
      ? publishedBanner.text
      : "여러분들의 마음을 전달해보세요 ❤️";

  return (
    <View style={styles.container} accessibilityRole="summary">
      {publishedBanner?.kind === "image" && publishedBanner.imageUrl ? (
        <Image
          source={{ uri: publishedBanner.imageUrl }}
          style={styles.image}
          contentFit="cover"
          accessibilityLabel="오늘의 배너 이미지"
          onError={() => {
            setImageFailed(true);
          }}
        />
      ) : (
        <View style={styles.ticker}>
          <MarqueeText text={tickerText} />
        </View>
      )}
    </View>
  );
}

function MarqueeText({ text }: { text: string }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [viewportWidth, setViewportWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const shouldAnimate = viewportWidth > 0 && textWidth > 0;

  useEffect(() => {
    translateX.stopAnimation();
    translateX.setValue(0);
    if (!shouldAnimate) return;

    const distance = textWidth + spacing.xl;
    const animation = Animated.loop(
      Animated.timing(translateX, {
        toValue: -distance,
        duration: Math.max(6_000, distance * 40),
        easing: (value) => value,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [shouldAnimate, textWidth, translateX]);

  return (
    <View
      style={styles.marqueeViewport}
      onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
      accessibilityLabel={text}
    >
      <Animated.View
        style={[styles.marqueeTrack, { transform: [{ translateX }] }]}
      >
        <Text
          style={styles.marqueeText}
          numberOfLines={1}
          onLayout={(event) => setTextWidth(event.nativeEvent.layout.width)}
        >
          {text}
        </Text>
        {shouldAnimate ? (
          <Text style={styles.marqueeText} numberOfLines={1}>
            {text}
          </Text>
        ) : null}
      </Animated.View>
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
    minHeight: typography.label.lineHeight,
    justifyContent: "center",
  },
  marqueeTrack: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.xl,
  },
  marqueeText: {
    ...typography.label,
    color: colors.onAccent,
    fontFamily: "monospace",
    fontWeight: "700",
    letterSpacing: spacing.xs,
    flexShrink: 0,
  },
  ticker: {
    width: "100%",
    minHeight: pageChrome.bannerTickerMinHeight,
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: colors.accent,
  },
  image: {
    width: "100%",
    aspectRatio: pageChrome.bannerImageAspectRatio,
    maxHeight: pageChrome.bannerImageMaxHeight,
    backgroundColor: colors.surfaceAlt,
  },
});
