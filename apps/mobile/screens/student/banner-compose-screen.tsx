import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text } from "react-native";
import { DailyBannerPreview } from "../../components/DailyBanner";
import { useInputFeedback } from "../../components/input-feedback-provider";
import { InputPage } from "../../components/input-page";
import { AppButton, TextField } from "../../components/ui";
import { useInputPageExit } from "../../hooks/use-input-page-exit";
import { apiFetch } from "../../lib/api";
import { uploadMobileImage } from "../../lib/upload";
import { colors, spacing, typography } from "../../theme/tokens";

export default function BannerComposeScreen() {
  const { date = "" } = useLocalSearchParams<{ date: string }>();
  const [text, setText] = useState("");
  const [image, setImage] = useState<{
    uri: string;
    url: string;
    name: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exit = useInputPageExit(Boolean(text || image), busy);
  const notify = useInputFeedback();
  const validDate =
    /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date));
  async function pickImage() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("권한 필요", "사진 보관함 권한을 허용해 주세요.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const name = asset.fileName ?? `daily-banner-${Date.now()}.jpg`;
      const uploaded = await uploadMobileImage({
        uri: asset.uri,
        name,
        mimeType: asset.mimeType ?? "image/jpeg",
      });
      setImage({ uri: asset.uri, url: uploaded.url, name });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "이미지를 준비하지 못했어요.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (busy) return;
    if (!validDate) {
      setError("캘린더에서 게시할 날짜를 다시 선택해 주세요.");
      return;
    }
    if (!text.trim()) {
      setError("문구를 입력해 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/student/daily-banner", {
        method: "POST",
        json: image
          ? {
              targetDay: date,
              kind: "image",
              text: text.trim(),
              imageUrl: image.url,
            }
          : { targetDay: date, kind: "text", text: text.trim() },
      });
      notify("배너 제안을 제출했어요.");
      exit.finish();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "제출하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <InputPage title="배너 제안 작성" onBack={exit.back}>
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={styles.label}>
          {validDate ? date : "날짜를 다시 선택해 주세요."}
        </Text>
        <DailyBannerPreview
          text={text.trim() || undefined}
          imageUrl={image?.uri}
        />
        <TextField
          value={text}
          onChangeText={setText}
          placeholder="친구들에게 전할 짧은 소식"
          accessibilityLabel="배너 문구"
          multiline
          maxLength={120}
          editable={!busy}
        />
        <Text style={styles.hint}>{text.length}/120</Text>
        <Text style={styles.hint}>이미지 권장 크기: 1500 × 500px</Text>
        <AppButton
          variant="secondary"
          onPress={() => void pickImage()}
          disabled={busy}
        >
          {image ? "이미지 변경" : "이미지 추가"}
        </AppButton>
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <AppButton
          onPress={() => void submit()}
          loading={busy}
          disabled={!validDate}
        >
          제안 제출
        </AppButton>
      </ScrollView>
    </InputPage>
  );
}
const styles = StyleSheet.create({
  body: { padding: spacing.xl, gap: spacing.md },
  label: { ...typography.label, color: colors.text },
  hint: { ...typography.micro, color: colors.textMuted },
  error: { ...typography.body, color: colors.danger },
});
