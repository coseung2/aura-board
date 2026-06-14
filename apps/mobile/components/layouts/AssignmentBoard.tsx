import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { colors, radii, shadows, spacing, tapMin, typography } from "../../theme/tokens";
import { apiFetch, getApiBase } from "../../lib/api";
import { loadSessionToken } from "../../lib/session";
import type { BoardDetailResponse } from "../../lib/types";

// 과제 배부(assignment) — 본인 slot 만 강조해서 보여주고, 나머지는 반 전체 진행 현황 요약.
// 제출: content(텍스트) + 이미지 또는 파일 업로드.

export function AssignmentBoard({
  data,
  onMutate,
}: {
  data: BoardDetailResponse;
  onMutate: () => void;
}) {
  const { width } = useWindowDimensions();
  const slots = data.layoutData.assignment?.slots ?? [];
  const mySlot = useMemo(
    () => slots.find((s) => s.studentId === data.currentStudent.id),
    [slots, data.currentStudent.id],
  );
  const [modalOpen, setModalOpen] = useState(false);
  const peerColumns = width < 560 ? 1 : width < 840 ? 2 : width < 1120 ? 3 : 4;

  const counts = useMemo(() => {
    const s = { assigned: 0, submitted: 0, returned: 0, reviewed: 0 };
    for (const slot of slots) {
      if (slot.submissionStatus === "submitted" || slot.submissionStatus === "viewed") s.submitted += 1;
      else if (slot.submissionStatus === "returned") s.returned += 1;
      else if (slot.submissionStatus === "reviewed") s.reviewed += 1;
      else s.assigned += 1;
    }
    return s;
  }, [slots]);

  if (!mySlot) {
    return (
      <View style={styles.center}>
        <Text style={styles.infoEmoji}>📋</Text>
        <Text style={styles.infoTitle}>이 과제에 배정되지 않았어요</Text>
        <Text style={styles.infoMsg}>
          선생님이 나에게 과제를 배정하면 여기에 보여요.
        </Text>
      </View>
    );
  }

  const statusLabel: Record<string, string> = {
    assigned: "제출 전",
    submitted: "제출 완료",
    viewed: "선생님 확인 중",
    returned: "되돌아왔어요",
    reviewed: "평가 완료",
  };

  return (
    <View style={styles.root}>
      <View style={styles.progressBar}>
        <ProgressPill label="제출 전" count={counts.assigned} color={colors.textFaint} />
        <ProgressPill label="제출함" count={counts.submitted} color={colors.accent} />
        <ProgressPill label="되돌아감" count={counts.returned} color={colors.warning} />
        <ProgressPill label="평가됨" count={counts.reviewed} color={colors.plantActive} />
      </View>

      <View style={styles.mySlotCard}>
        <View style={styles.slotHead}>
          <Text style={styles.slotTitle}>{mySlot.card.title}</Text>
          <View style={[styles.statusPill, pillStyleFor(mySlot.submissionStatus)]}>
            <Text style={[styles.statusText, pillTextFor(mySlot.submissionStatus)]}>
              {statusLabel[mySlot.submissionStatus] ?? mySlot.submissionStatus}
            </Text>
          </View>
        </View>
        {mySlot.card.content ? (
          <Text style={styles.slotBody}>{mySlot.card.content}</Text>
        ) : null}
        {mySlot.returnReason ? (
          <View style={styles.returnNote}>
            <Text style={styles.returnLabel}>선생님 메모</Text>
            <Text style={styles.returnText}>{mySlot.returnReason}</Text>
          </View>
        ) : null}
        {mySlot.submission ? (
          <SubmissionPreview submission={mySlot.submission} />
        ) : null}
        <Pressable
          style={({ pressed }) => [
            styles.submitBtn,
            pressed && styles.submitBtnPressed,
          ]}
          onPress={() => setModalOpen(true)}
        >
          <Text style={styles.submitText}>
            {mySlot.submission ? "다시 제출하기" : "제출하기"}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.allLabel}>반 전체 제출 현황</Text>
      <FlatList
        key={`assignment-peers-${peerColumns}`}
        data={slots}
        keyExtractor={(s) => s.id}
        numColumns={peerColumns}
        columnWrapperStyle={peerColumns > 1 ? styles.peerRow : undefined}
        contentContainerStyle={styles.peerList}
        renderItem={({ item }) => (
          <View
            style={[
              styles.peerCell,
              item.studentId === data.currentStudent.id && styles.peerCellMe,
            ]}
          >
            <Text style={styles.peerName} numberOfLines={1}>
              {item.student.number ? `${item.student.number}. ` : ""}
              {item.student.name}
            </Text>
            <View style={[styles.peerDot, dotColorFor(item.submissionStatus)]} />
          </View>
        )}
      />

      <SubmitModal
        visible={modalOpen}
        slotId={mySlot.id}
        onClose={() => setModalOpen(false)}
        onSubmitted={() => {
          setModalOpen(false);
          onMutate();
        }}
      />
    </View>
  );
}

function ProgressPill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <View style={[styles.progressPill, { borderColor: color }]}>
      <Text style={[styles.progressCount, { color }]}>{count}</Text>
      <Text style={styles.progressLabel}>{label}</Text>
    </View>
  );
}

function SubmissionPreview({
  submission,
}: {
  submission: NonNullable<
    BoardDetailResponse["layoutData"]["assignment"]
  >["slots"][number]["submission"];
}) {
  if (!submission) return null;
  return (
    <View style={styles.submissionBox}>
      <Text style={styles.submissionLabel}>지금까지 제출한 내용</Text>
      {submission.content ? (
        <Text style={styles.submissionContent}>{submission.content}</Text>
      ) : null}
      {submission.imageUrl ? (
        <Image source={{ uri: submission.imageUrl }} style={styles.submissionImage} resizeMode="cover" />
      ) : null}
      {submission.fileUrl ? (
        <Text style={styles.submissionFile}>📎 파일 첨부됨</Text>
      ) : null}
    </View>
  );
}

function SubmitModal({
  visible,
  slotId,
  onClose,
  onSubmitted,
}: {
  visible: boolean;
  slotId: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function upload(uri: string, name: string, mime: string): Promise<string> {
    const token = await loadSessionToken();
    const form = new FormData();
    form.append("file", { uri, name, type: mime } as unknown as Blob);
    const res = await fetch(`${getApiBase()}/api/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form as unknown as BodyInit,
    });
    if (!res.ok) throw new Error(`upload ${res.status}`);
    const body = (await res.json()) as { url: string };
    return body.url;
  }

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("권한 필요", "사진 권한을 허용해 주세요.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    setSubmitting(true);
    try {
      const url = await upload(
        asset.uri,
        asset.fileName ?? `image-${Date.now()}.jpg`,
        asset.mimeType ?? "image/jpeg",
      );
      setImageUrl(url);
    } catch (e) {
      Alert.alert("업로드 실패", e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function pickFile() {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    setSubmitting(true);
    try {
      const url = await upload(asset.uri, asset.name, asset.mimeType ?? "application/octet-stream");
      setFileUrl(url);
    } catch (e) {
      Alert.alert("업로드 실패", e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function submit() {
    if (!content.trim() && !imageUrl && !fileUrl) {
      Alert.alert("비어있어요", "내용·이미지·파일 중 하나는 제출해야 해요.");
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {};
      if (content.trim()) payload.content = content.trim();
      if (imageUrl) payload.imageUrl = imageUrl;
      if (fileUrl) payload.fileUrl = fileUrl;
      await apiFetch(`/api/assignment-slots/${encodeURIComponent(slotId)}/submission`, {
        method: "POST",
        json: payload,
      });
      setContent("");
      setImageUrl(null);
      setFileUrl(null);
      onSubmitted();
    } catch (e) {
      Alert.alert("제출 실패", e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>과제 제출</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.contentInput}
            value={content}
            onChangeText={setContent}
            placeholder="내용을 적어주세요"
            placeholderTextColor={colors.textFaint}
            multiline
            editable={!submitting}
          />
          <View style={styles.modalRow}>
            <Pressable
              style={({ pressed }) => [styles.attachBtn, pressed && styles.attachBtnPressed]}
              onPress={pickImage}
              disabled={submitting}
            >
              <Text style={styles.attachText}>🖼️ 이미지 {imageUrl ? "✓" : ""}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.attachBtn, pressed && styles.attachBtnPressed]}
              onPress={pickFile}
              disabled={submitting}
            >
              <Text style={styles.attachText}>📎 파일 {fileUrl ? "✓" : ""}</Text>
            </Pressable>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.modalSubmit,
              submitting && styles.modalSubmitDisabled,
              pressed && !submitting && styles.modalSubmitPressed,
            ]}
            onPress={submit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.modalSubmitText}>제출하기</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function pillStyleFor(status: string) {
  if (status === "submitted" || status === "viewed") return { backgroundColor: colors.statusSubmittedBg };
  if (status === "returned") return { backgroundColor: colors.statusReturnedBg };
  if (status === "reviewed") return { backgroundColor: colors.statusReviewedBg };
  return { backgroundColor: colors.surfaceAlt };
}

function pillTextFor(status: string) {
  if (status === "submitted" || status === "viewed") return { color: colors.statusSubmittedText };
  if (status === "returned") return { color: colors.statusReturnedText };
  if (status === "reviewed") return { color: colors.statusReviewedText };
  return { color: colors.textMuted };
}

function dotColorFor(status: string) {
  if (status === "submitted" || status === "viewed") return { backgroundColor: colors.accent };
  if (status === "returned") return { backgroundColor: colors.warning };
  if (status === "reviewed") return { backgroundColor: colors.plantActive };
  return { backgroundColor: colors.textFaint };
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: spacing.xl, gap: spacing.lg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    gap: spacing.md,
  },
  infoEmoji: { fontSize: 64 },
  infoTitle: { ...typography.title, color: colors.text, textAlign: "center" },
  infoMsg: { ...typography.body, color: colors.textMuted, textAlign: "center" },

  progressBar: {
    flexDirection: "row",
    gap: spacing.md,
  },
  progressPill: {
    flex: 1,
    borderWidth: 2,
    borderRadius: radii.card,
    padding: spacing.md,
    alignItems: "center",
  },
  progressCount: { ...typography.display },
  progressLabel: { ...typography.label, color: colors.textMuted, marginTop: 2 },

  mySlotCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.xl,
    ...shadows.card,
    gap: spacing.md,
  },
  slotHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  slotTitle: { ...typography.title, color: colors.text, flex: 1 },
  statusPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
  statusText: { ...typography.label },
  slotBody: { ...typography.body, color: colors.text },

  returnNote: {
    padding: spacing.md,
    backgroundColor: colors.statusReturnedBg,
    borderRadius: radii.btn,
    gap: 2,
  },
  returnLabel: { ...typography.micro, color: colors.statusReturnedText },
  returnText: { ...typography.body, color: colors.text },

  submissionBox: {
    padding: spacing.md,
    backgroundColor: colors.bg,
    borderRadius: radii.btn,
    gap: spacing.sm,
  },
  submissionLabel: { ...typography.micro, color: colors.textMuted },
  submissionContent: { ...typography.body, color: colors.text },
  submissionImage: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: radii.btn,
  },
  submissionFile: { ...typography.label, color: colors.textMuted },

  submitBtn: {
    padding: spacing.lg,
    backgroundColor: colors.accent,
    borderRadius: radii.card,
    alignItems: "center",
    minHeight: tapMin,
    justifyContent: "center",
    ...shadows.accent,
  },
  submitBtnPressed: { backgroundColor: colors.accentActive },
  submitText: { ...typography.subtitle, color: "#fff" },

  allLabel: { ...typography.section, color: colors.text, marginTop: spacing.md },
  peerList: { gap: spacing.sm, paddingBottom: spacing.lg },
  peerRow: { gap: spacing.sm },
  peerCell: {
    flex: 1,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.btn,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
    ...shadows.card,
  },
  peerCellMe: { borderWidth: 2, borderColor: colors.accent },
  peerName: { ...typography.label, color: colors.text, flex: 1 },
  peerDot: { width: 10, height: 10, borderRadius: 5 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xxl,
  },
  modalSheet: {
    width: "100%",
    maxWidth: 720,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadows.cardHover,
  },
  modalHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: { ...typography.title, color: colors.text },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  closeText: { fontSize: 18, color: colors.textMuted },
  contentInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.btn,
    padding: spacing.md,
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.bg,
    minHeight: 120,
    textAlignVertical: "top",
  },
  modalRow: { flexDirection: "row", gap: spacing.md },
  attachBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.btn,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    minHeight: tapMin,
    justifyContent: "center",
  },
  attachBtnPressed: { backgroundColor: colors.surfaceAlt },
  attachText: { ...typography.label, color: colors.textMuted },
  modalSubmit: {
    paddingVertical: spacing.lg,
    backgroundColor: colors.accent,
    borderRadius: radii.card,
    alignItems: "center",
    minHeight: tapMin,
    ...shadows.accent,
  },
  modalSubmitDisabled: { backgroundColor: colors.border, shadowOpacity: 0, elevation: 0 },
  modalSubmitPressed: { backgroundColor: colors.accentActive },
  modalSubmitText: { ...typography.subtitle, color: "#fff" },
});
