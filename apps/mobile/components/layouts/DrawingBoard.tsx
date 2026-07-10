import { Image } from "expo-image";
import * as FileSystem from "expo-file-system/legacy";
import { useCallback, useMemo, useRef, useState, type ElementRef } from "react";
import {
  ActivityIndicator,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { apiFetch } from "../../lib/api";
import type { BoardDetailResponse } from "../../lib/types";
import {
  assignment,
  colors,
  radii,
  spacing,
  typography,
} from "../../theme/tokens";
import { AppButton, ControlPressable, EmptyState, SurfaceCard, TextField } from "../ui";

type Asset = {
  id: string;
  title: string;
  fileUrl: string;
  thumbnailUrl: string | null;
  createdAt: string;
};

export function DrawingBoard({ data }: { data: BoardDetailResponse }) {
  const [tab, setTab] = useState<"studio" | "gallery">("studio");
  const [paths, setPaths] = useState<string[]>([]);
  const [current, setCurrent] = useState("");
  const currentRef = useRef("");
  const svgRef = useRef<ElementRef<typeof Svg>>(null);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { width } = useWindowDimensions();

  const pan = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        const { locationX, locationY } = event.nativeEvent;
        const next = `M ${locationX.toFixed(1)} ${locationY.toFixed(1)}`;
        currentRef.current = next;
        setCurrent(next);
      },
      onPanResponderMove: (event) => {
        const { locationX, locationY } = event.nativeEvent;
        const next = `${currentRef.current} L ${locationX.toFixed(1)} ${locationY.toFixed(1)}`;
        currentRef.current = next;
        setCurrent(next);
      },
      onPanResponderRelease: () => {
        const completed = currentRef.current;
        if (completed) setPaths((previous) => [...previous, completed]);
        currentRef.current = "";
        setCurrent("");
      },
    }),
    [],
  );

  const loadGallery = useCallback(async () => {
    setGalleryLoading(true);
    try {
      const result = await apiFetch<{ assets: Asset[] }>(
        `/api/student-assets?scope=shared&classroomId=${encodeURIComponent(data.currentStudent.classroomId)}`,
      );
      setAssets(result.assets);
      setError(null);
    } catch {
      setError("공유 그림을 불러오지 못했어요.");
    } finally {
      setGalleryLoading(false);
    }
  }, [data.currentStudent.classroomId]);

  function openGallery() {
    setTab("gallery");
    void loadGallery();
  }

  async function save() {
    if (paths.length === 0 || !svgRef.current) return;
    setSaving(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("capture_timeout")), 10_000);
        svgRef.current?.toDataURL((value) => {
          clearTimeout(timeout);
          resolve(value);
        });
      });
      const uri = `${FileSystem.cacheDirectory}drawing-${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(uri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const form = new FormData();
      form.append("file", { uri, name: "drawing.png", type: "image/png" } as unknown as Blob);
      form.append("title", title.trim() || "내 그림");
      form.append("source", "mobile-drawing");
      form.append("isSharedToClass", "true");
      await apiFetch("/api/student-assets", { method: "POST", body: form });
      setTitle("");
      setError(null);
      openGallery();
    } catch {
      setError("그림을 저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.tabs} accessibilityRole="tablist">
        <ControlPressable
          onPress={() => setTab("studio")}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === "studio" }}
          style={[styles.tab, tab === "studio" && styles.tabActive]}
        ><Text style={styles.tabText}>🎨 작업실</Text></ControlPressable>
        <ControlPressable
          onPress={openGallery}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === "gallery" }}
          style={[styles.tab, tab === "gallery" && styles.tabActive]}
        ><Text style={styles.tabText}>🖼️ 갤러리</Text></ControlPressable>
      </View>

      {tab === "studio" ? (
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
          <SurfaceCard style={styles.canvasCard}>
            <Svg
              ref={svgRef}
              width="100%"
              height={assignment.contentInputMinHeight * 2}
              viewBox={`0 0 ${Math.max(width - spacing.xl * 4, 1)} ${assignment.contentInputMinHeight * 2}`}
              style={styles.canvas}
              {...pan.panHandlers}
              accessibilityLabel="손가락으로 그리는 캔버스"
            >
              {paths.map((path, index) => <Path key={`${index}-${path.length}`} d={path} stroke={colors.text} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />)}
              {current ? <Path d={current} stroke={colors.text} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
            </Svg>
          </SurfaceCard>
          <View style={styles.actions}>
            <AppButton variant="secondary" onPress={() => setPaths((previous) => previous.slice(0, -1))} disabled={paths.length === 0}>되돌리기</AppButton>
            <AppButton variant="secondary" onPress={() => setPaths([])} disabled={paths.length === 0}>모두 지우기</AppButton>
          </View>
          <TextField value={title} onChangeText={setTitle} placeholder="그림 제목" maxLength={200} accessibilityLabel="그림 제목" />
          {error ? <Text style={styles.error} accessibilityRole="alert" selectable>{error}</Text> : null}
          <AppButton onPress={() => void save()} loading={saving} disabled={paths.length === 0}>저장하고 학급에 공유</AppButton>
        </ScrollView>
      ) : (
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
          {galleryLoading ? <ActivityIndicator color={colors.accent} /> : null}
          {error ? <Text style={styles.error} accessibilityRole="alert" selectable>{error}</Text> : null}
          {!galleryLoading && assets.length === 0 ? <EmptyState title="공유된 그림이 아직 없어요" /> : null}
          <View style={styles.gallery}>
            {assets.map((asset) => (
              <SurfaceCard key={asset.id} style={styles.assetCard}>
                <Image source={{ uri: asset.thumbnailUrl ?? asset.fileUrl }} style={styles.assetImage} contentFit="cover" accessibilityLabel={asset.title || "공유 그림"} />
                <Text style={styles.assetTitle} numberOfLines={2}>{asset.title || "제목 없음"}</Text>
              </SurfaceCard>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabs: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.sm },
  tabActive: { backgroundColor: colors.accentTintedBg, borderColor: colors.accent },
  tabText: { ...typography.label, color: colors.text },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  canvasCard: { padding: spacing.sm, overflow: "hidden" },
  canvas: { backgroundColor: colors.surface, borderRadius: radii.control },
  actions: { flexDirection: "row", gap: spacing.sm },
  error: { ...typography.body, color: colors.danger, textAlign: "center" },
  gallery: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  assetCard: { width: "47%", overflow: "hidden" },
  assetImage: { width: "100%", aspectRatio: 1, backgroundColor: colors.surfaceAlt },
  assetTitle: { ...typography.badge, color: colors.text, padding: spacing.sm },
});
