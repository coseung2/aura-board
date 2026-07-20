import { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { colors, controls, spacing, typography } from "../../theme/tokens";
import { AppButton, ControlPressable, TextField } from "../ui";

interface Props {
  nickname: string;
  canEdit?: boolean;
  onSave: (nickname: string) => Promise<void>;
}

/** Inline nickname editor matching the web roadmap's click-to-edit affordance. */
export function PlantNickname({ nickname, canEdit = true, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(nickname);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(nickname);
  }, [editing, nickname]);

  const cancel = useCallback(() => {
    if (saving) return;
    setDraft(nickname);
    setEditing(false);
  }, [nickname, saving]);

  const save = useCallback(async () => {
    const next = draft.trim();
    if (!next) {
      Alert.alert("별명 필요", "식물 별명을 입력해 주세요.");
      return;
    }
    if (next === nickname || saving) {
      if (next === nickname) setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } catch (error) {
      Alert.alert("저장 실패", error instanceof Error ? error.message : "식물 별명을 저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }, [draft, nickname, onSave, saving]);

  if (editing && canEdit) {
    return (
      <View style={styles.editor}>
        <TextField
          autoFocus
          value={draft}
          maxLength={20}
          editable={!saving}
          accessibilityLabel="식물 별명"
          returnKeyType="done"
          onChangeText={setDraft}
          onSubmitEditing={() => void save()}
          style={styles.input}
        />
        <View style={styles.actions}>
          <AppButton
            variant="quiet"
            onPress={cancel}
            disabled={saving}
            style={styles.actionButton}
            textStyle={styles.cancelText}
          >
            취소
          </AppButton>
          <AppButton
            variant="quiet"
            onPress={() => void save()}
            disabled={saving || draft.trim().length === 0}
            loading={saving}
            style={styles.actionButton}
            textStyle={styles.saveText}
          >
            저장
          </AppButton>
        </View>
      </View>
    );
  }

  return (
    <ControlPressable
      onPress={canEdit ? () => setEditing(true) : undefined}
      disabled={!canEdit}
      accessibilityRole={canEdit ? "button" : "text"}
      accessibilityLabel={canEdit ? "식물 별명 편집" : undefined}
      style={styles.display}
    >
      <Text style={styles.nickname} numberOfLines={2}>
        {nickname}
      </Text>
      {canEdit ? <Text style={styles.hint}>탭하여 편집</Text> : null}
    </ControlPressable>
  );
}

const styles = StyleSheet.create({
  display: {
    alignSelf: "flex-start",
    gap: spacing.xxs,
    paddingVertical: spacing.xxs,
  },
  nickname: {
    ...typography.body,
    color: colors.textMuted,
  },
  hint: {
    ...typography.micro,
    color: colors.textFaint,
  },
  editor: { gap: spacing.xs },
  input: {
    minWidth: 160,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  actionButton: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    minHeight: controls.compactChipHeight,
  },
  cancelText: { ...typography.micro, color: colors.textMuted },
  saveText: { ...typography.micro, color: colors.plantActive },
});
