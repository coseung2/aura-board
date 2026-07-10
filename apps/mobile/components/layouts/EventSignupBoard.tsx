import { useState } from "react";
import { Image } from "expo-image";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { getApiBase } from "../../lib/api";
import type { BoardDetailResponse } from "../../lib/types";
import { colors, spacing, typography, vibe } from "../../theme/tokens";
import { AppButton, EmptyState, Pill, SurfaceCard } from "../ui";

export function EventSignupBoard({ data }: { data: BoardDetailResponse }) {
  const [signupOpen, setSignupOpen] = useState(false);
  const [webError, setWebError] = useState<string | null>(null);
  const event = data.layoutData.eventSignup;
  if (!event) {
    return <View style={styles.center}><EmptyState title="행사 정보를 불러올 수 없어요" /></View>;
  }

  const now = Date.now();
  const starts = event.applicationStart ? new Date(event.applicationStart).getTime() : null;
  const ends = event.applicationEnd ? new Date(event.applicationEnd).getTime() : null;
  const before = starts !== null && now < starts;
  const closed = ends !== null && now > ends;
  const url = event.accessMode === "public-link" && event.accessToken
    ? `${getApiBase()}/b/${encodeURIComponent(data.board.slug)}?t=${encodeURIComponent(event.accessToken)}`
    : null;

  if (signupOpen && url) {
    const allowedOrigin = new URL(getApiBase()).origin;
    return (
      <View style={styles.webContainer}>
        <View style={styles.webToolbar}>
          <Text style={styles.webTitle}>행사 신청</Text>
          <AppButton variant="quiet" onPress={() => setSignupOpen(false)}>
            닫기
          </AppButton>
        </View>
        {webError ? (
          <View style={styles.center}>
            <EmptyState title={webError} />
            <AppButton onPress={() => setWebError(null)}>다시 시도</AppButton>
          </View>
        ) : (
          <WebView
            source={{ uri: url }}
            originWhitelist={[`${allowedOrigin}/*`]}
            onShouldStartLoadWithRequest={(request) => {
              if (request.url === "about:blank") return true;
              try {
                return new URL(request.url).origin === allowedOrigin;
              } catch {
                return false;
              }
            }}
            onHttpError={() => setWebError("신청 화면을 불러오지 못했어요.")}
            onError={() => setWebError("신청 화면을 불러오지 못했어요.")}
            sharedCookiesEnabled={false}
            thirdPartyCookiesEnabled={false}
          />
        )}
      </View>
    );
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      {event.eventPosterUrl ? (
        <Image
          source={{ uri: event.eventPosterUrl }}
          style={styles.poster}
          contentFit="cover"
          accessibilityLabel="행사 포스터"
        />
      ) : null}
      <SurfaceCard style={styles.card}>
        <View style={styles.heading}>
          <Text style={styles.title} selectable>{data.board.title}</Text>
          <Pill tone={closed ? "neutral" : before ? "warning" : "accent"}>
            {closed ? "신청 종료" : before ? "신청 전" : "신청 가능"}
          </Pill>
        </View>
        <Meta label="장소" value={event.venue ?? "미정"} />
        <Meta label="정원" value={event.maxSelections ? `${event.maxSelections}명` : "미정"} />
        <Meta label="신청 시작" value={formatDate(event.applicationStart)} />
        <Meta label="신청 종료" value={formatDate(event.applicationEnd)} />
      </SurfaceCard>
      {url ? (
        <AppButton
          onPress={() => setSignupOpen(true)}
          disabled={before || closed}
          accessibilityLabel="행사 신청서 열기"
        >
          행사 신청서 열기
        </AppButton>
      ) : (
        <EmptyState
          title="공개 신청 링크가 아직 없어요"
          description="선생님이 QR 신청 링크를 열면 사용할 수 있어요."
        />
      )}
      <Text style={styles.note} selectable>
        신청서는 웹과 동일한 보안 토큰 화면에서 열립니다.
      </Text>
    </ScrollView>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} selectable>{value}</Text>
    </View>
  );
}

function formatDate(value: string | null) {
  if (!value) return "미정";
  return new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  poster: { width: "100%", aspectRatio: vibe.thumbnailAspectRatio, backgroundColor: colors.surfaceAlt },
  card: { padding: spacing.xl, gap: spacing.md },
  heading: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  title: { ...typography.title, color: colors.text, flex: 1 },
  metaRow: { flexDirection: "row", gap: spacing.md },
  label: { ...typography.badge, color: colors.textMuted },
  value: { ...typography.body, color: colors.text, flex: 1, textAlign: "right" },
  note: { ...typography.micro, color: colors.textMuted, textAlign: "center" },
  webContainer: { flex: 1, backgroundColor: colors.bg },
  webToolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  webTitle: { ...typography.section, color: colors.text, flex: 1 },
});
