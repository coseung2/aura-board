import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { FeedDraft, FeedMediaInput } from "../lib/feed";
import { getApiBase } from "../lib/api";
import { loadSessionToken } from "../lib/session";
import {
  borders,
  colors,
  composer,
  feed,
  radii,
  spacing,
  typography,
} from "../theme/tokens";
import { AppButton, TextField } from "./ui";

const MAX_MEDIA_ITEMS = 10;

type Props = {
  onSubmit: (draft: FeedDraft) => Promise<void>;
  onSuccess: () => void;
  initialDraft?: FeedDraft;
  submitLabel?: string;
};

async function uploadImage(uri: string, name: string, mimeType: string) {
  const token = await loadSessionToken();
  const form = new FormData();
  form.append("file", { uri, name, type: mimeType } as unknown as Blob);
  const response = await fetch(`${getApiBase()}/api/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form as unknown as BodyInit,
  });
  const body = (await response.json().catch(() => null)) as {
    url?: string;
    error?: string;
  } | null;
  if (!response.ok || !body?.url) {
    throw new Error(body?.error ?? "이미지 업로드에 실패했어요.");
  }
  return body.url;
}

/**
 * Shared student feed composer. Used by the full-screen compose page; the
 * fields, media picker, and submit flow live here.
 */
export function FeedComposerForm({ onSubmit, onSuccess, initialDraft, submitLabel = "게시하기" }: Props) {
  const [title, setTitle] = useState(initialDraft?.title ?? "");
  const [body, setBody] = useState(initialDraft?.body ?? "");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [media, setMedia] = useState<FeedMediaInput[]>(initialDraft?.media ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle("");
    setBody("");
    setYoutubeUrl("");
    setMedia([]);
    setError(null);
  }

  async function pickImage() {
    if (busy || media.length >= MAX_MEDIA_ITEMS) return;
    setError(null);
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("사진 선택 권한을 허용해 주세요.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.82,
      });
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;
      setBusy(true);
      const name = asset.fileName ?? `feed-${Date.now()}.jpg`;
      const url = await uploadImage(
        asset.uri,
        name,
        asset.mimeType ?? "image/jpeg",
      );
      setMedia((current) => [
        ...current,
        { kind: "IMAGE", url, altText: name },
      ]);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "이미지를 추가하지 못했어요.",
      );
    } finally {
      setBusy(false);
    }
  }

  function addYoutube() {
    const normalized = youtubeUrl.trim();
    if (!normalized || media.length >= MAX_MEDIA_ITEMS) return;
    setMedia((current) => [
      ...current,
      { kind: "YOUTUBE", url: normalized, altText: null },
    ]);
    setYoutubeUrl("");
    setError(null);
  }

  async function submit() {
    const normalizedTitle = title.trim();
    const normalizedBody = body.trim();
    if (!normalizedTitle && !normalizedBody && media.length === 0) {
      setError("제목, 내용 또는 미디어 중 하나를 입력해 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        title: normalizedTitle || null,
        body: normalizedBody || null,
        media,
      });
      reset();
      onSuccess();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "게시물을 저장하지 못했어요.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.field}>
        <Text style={styles.label}>제목</Text>
        <TextField
          value={title}
          onChangeText={setTitle}
          placeholder="짧은 제목"
          maxLength={160}
          editable={!busy}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>내용</Text>
        <TextField
          value={body}
          onChangeText={setBody}
          placeholder="무슨 이야기를 나누고 싶나요?"
          maxLength={10_000}
          multiline
          numberOfLines={5}
          editable={!busy}
          style={styles.bodyInput}
        />
      </View>

      <View style={styles.mediaActions}>
        <AppButton
          variant="secondary"
          onPress={() => void pickImage()}
          disabled={busy || media.length >= MAX_MEDIA_ITEMS}
        >
          이미지 추가
        </AppButton>
        <Text style={styles.mediaCount}>
          {media.length}/{MAX_MEDIA_ITEMS}
        </Text>
      </View>

      <View style={styles.youtubeRow}>
        <View style={styles.youtubeInput}>
          <TextField
            value={youtubeUrl}
            onChangeText={setYoutubeUrl}
            placeholder="YouTube 주소"
            autoCapitalize="none"
            keyboardType="url"
            editable={!busy && media.length < MAX_MEDIA_ITEMS}
          />
        </View>
        <AppButton
          variant="secondary"
          onPress={addYoutube}
          disabled={
            busy ||
            !youtubeUrl.trim() ||
            media.length >= MAX_MEDIA_ITEMS
          }
        >
          추가
        </AppButton>
      </View>

      {media.length ? (
        <View style={styles.mediaList}>
          {media.map((item, index) => (
            <View
              key={`${item.kind}:${item.url}:${index}`}
              style={styles.mediaItem}
            >
              <Text style={styles.mediaKind}>
                {item.kind === "IMAGE" ? "이미지" : "YouTube"}
              </Text>
              <Text style={styles.mediaName} numberOfLines={1}>
                {item.altText || item.url}
              </Text>
              <AppButton
                variant="quiet"
                onPress={() =>
                  setMedia((current) =>
                    current.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
                disabled={busy}
              >
                제거
              </AppButton>
            </View>
          ))}
        </View>
      ) : null}

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <AppButton onPress={() => void submit()} loading={busy} disabled={busy}>
        {submitLabel}
      </AppButton>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  field: { gap: spacing.xs },
  label: { ...typography.label, color: colors.text },
  bodyInput: {
    minHeight: composer.contentMinHeight,
    textAlignVertical: "top",
  },
  mediaActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  mediaCount: { ...typography.micro, color: colors.textMuted },
  youtubeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  youtubeInput: { flex: 1, minWidth: 0 },
  mediaList: { gap: spacing.xs },
  mediaItem: {
    minHeight: feed.mediaRowMinHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.control,
    borderWidth: borders.hairline,
    borderColor: colors.border,
  },
  mediaKind: {
    ...typography.micro,
    color: colors.accent,
    fontWeight: "700",
  },
  mediaName: { ...typography.micro, color: colors.textMuted, flex: 1 },
  error: { ...typography.micro, color: colors.danger, fontWeight: "700" },
});
