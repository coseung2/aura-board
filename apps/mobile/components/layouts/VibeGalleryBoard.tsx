import { Image } from "expo-image";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { apiFetch } from "../../lib/api";
import type { BoardDetailResponse } from "../../lib/types";
import {
  colors,
  iconSizes,
  layout,
  media,
  spacing,
  typography,
} from "../../theme/tokens";
import { AppButton, EmptyState, SurfacePressable } from "../ui";
import {
  VibeProjectPlayModal,
  type PlayProject,
} from "./VibeArcadeBoard";

type GalleryItem = PlayProject & {
  description: string;
  thumbnailUrl: string | null;
  tags: string;
  playCount: number;
  reviewCount: number;
  ratingAvg: number | null;
};

export function VibeGalleryBoard({ data }: { data: BoardDetailResponse }) {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [playing, setPlaying] = useState<PlayProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { width, height } = useWindowDimensions();
  const available = Math.max(0, width - layout.boardGridPadding * 2);
  const columns = width > height ? 4 : 2;
  const cardWidth =
    (available - (columns - 1) * layout.boardGridGap) / columns;

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      const result = await apiFetch<{ items: GalleryItem[] }>(
        `/api/vibe/gallery?classroomId=${encodeURIComponent(data.currentStudent.classroomId)}&take=60`,
      );
      setItems(result.items);
      setError(null);
    } catch {
      setError("코딩 갤러리를 불러오지 못했어요.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [data.currentStudent.classroomId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={items}
        key={`vibe-gallery-${columns}`}
        keyExtractor={(item) => item.id}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? styles.row : undefined}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
        ListHeaderComponent={
          <View style={styles.heading}>
            <Text style={styles.title}>코딩 갤러리</Text>
            <Text style={styles.subtitle}>학급에서 승인된 작품을 직접 실행해 보세요.</Text>
            {error ? (
              <View style={styles.error} accessibilityRole="alert">
                <Text style={styles.errorText} selectable>{error}</Text>
                <AppButton variant="secondary" onPress={() => void load(true)}>다시 시도</AppButton>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <SurfacePressable
            onPress={() => setPlaying({ id: item.id, title: item.title })}
            accessibilityLabel={`${item.title} 실행`}
            style={[styles.card, { width: cardWidth }]}
          >
            {item.thumbnailUrl ? (
              <Image
                source={{ uri: item.thumbnailUrl }}
                style={styles.thumbnail}
                contentFit="cover"
                accessibilityLabel={`${item.title} 썸네일`}
              />
            ) : (
              <View style={styles.thumbnailFallback}>
                <Text style={styles.fallbackIcon}>💻</Text>
              </View>
            )}
            <View style={styles.meta}>
              <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
              {item.description ? <Text style={styles.description} numberOfLines={2}>{item.description}</Text> : null}
              <View style={styles.stats}>
                <Text style={styles.stat}>★ {(item.ratingAvg ?? 0).toFixed(1)}</Text>
                <Text style={styles.stat}>▶ {item.playCount.toLocaleString()}</Text>
              </View>
            </View>
          </SurfacePressable>
        )}
        ListEmptyComponent={
          !error ? (
            <EmptyState
              title="아직 전시된 작품이 없어요"
              description="코딩 교실에서 만든 작품이 승인되면 여기에 나타나요."
            />
          ) : null
        }
      />
      <VibeProjectPlayModal project={playing} onClose={() => setPlaying(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: layout.boardGridPadding, gap: layout.boardGridGap, paddingBottom: spacing.xxxl },
  row: { gap: layout.boardGridGap },
  heading: { gap: spacing.xs, marginBottom: spacing.md },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted },
  error: { gap: spacing.sm, paddingTop: spacing.md },
  errorText: { ...typography.body, color: colors.danger },
  card: { overflow: "hidden", marginBottom: spacing.md },
  thumbnail: { width: "100%", aspectRatio: media.previewAspectRatio, backgroundColor: colors.surfaceAlt },
  thumbnailFallback: {
    width: "100%",
    aspectRatio: media.previewAspectRatio,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackIcon: { fontSize: iconSizes.gate },
  meta: { padding: spacing.sm, gap: spacing.xs },
  cardTitle: { ...typography.section, color: colors.text },
  description: { ...typography.body, color: colors.textMuted },
  stats: { flexDirection: "row", gap: spacing.md },
  stat: { ...typography.badge, color: colors.textMuted, fontVariant: ["tabular-nums"] },
});
