import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { apiFetch } from "../lib/api";
import type { CardAuthor } from "../lib/types";
import {
  borders,
  colors,
  iconSizes,
  radii,
  spacing,
  tapMin,
  typography,
} from "../theme/tokens";
import { AppBottomSheet, AppButton, ControlPressable } from "./ui";

export type CardAuthorSelection = {
  studentId: string;
  displayName: string;
};

type RosterStudent = {
  id: string;
  name: string;
  number: number | null;
};

type AuthorsResponse = {
  authors: Array<{
    studentId: string | null;
    displayName: string;
  }>;
};

export interface CardAuthorBottomSheetProps {
  cardId: string | null;
  classroomId: string | null;
  initialAuthors?: readonly Pick<CardAuthor, "studentId" | "displayName">[];
  visible: boolean;
  onClose: () => void;
  onSaved: (authors: CardAuthorSelection[]) => void;
}

/** Same-classroom author picker for a card in the student board feed. */
export function CardAuthorBottomSheet({
  cardId,
  classroomId,
  initialAuthors = [],
  visible,
  onClose,
  onSaved,
}: CardAuthorBottomSheetProps) {
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialStudentIds = useMemo(
    () =>
      initialAuthors.flatMap((author) =>
        author.studentId ? [author.studentId] : [],
      ),
    [initialAuthors],
  );

  useEffect(() => {
    if (!visible) return;

    setSelectedIds(initialStudentIds);
    setError(null);
    if (!classroomId) {
      setStudents([]);
      setError("학급 정보를 찾을 수 없어요.");
      return;
    }

    let active = true;
    setLoading(true);
    void apiFetch<{ students: RosterStudent[] }>(
      `/api/classroom/${classroomId}/students`,
    )
      .then((response) => {
        if (active) setStudents(response.students);
      })
      .catch(() => {
        if (active) setError("학생 목록을 불러오지 못했어요.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [classroomId, initialStudentIds, visible]);

  const selectedAuthors = useMemo(() => {
    const byId = new Map(students.map((student) => [student.id, student]));
    return selectedIds.flatMap((studentId) => {
      const student = byId.get(studentId);
      return student
        ? [{ studentId: student.id, displayName: student.name }]
        : [];
    });
  }, [selectedIds, students]);

  function toggleStudent(studentId: string) {
    setSelectedIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId],
    );
  }

  async function save() {
    if (!cardId || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await apiFetch<AuthorsResponse>(
        `/api/cards/${cardId}/authors`,
        {
          method: "PUT",
          json: { authors: selectedAuthors },
        },
      );
      onSaved(
        response.authors.flatMap((author) =>
          author.studentId
            ? [{ studentId: author.studentId, displayName: author.displayName }]
            : [],
        ),
      );
      onClose();
    } catch {
      setError("작성자 저장에 실패했어요. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  const unavailable = !cardId || !classroomId;

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      sheetStyle={styles.sheet}
      accessibilityLabel="작성자 선택"
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>작성자 선택</Text>
          <Text style={styles.summary}>선택 {selectedAuthors.length}명</Text>
        </View>
        <AppButton variant="quiet" onPress={onClose} style={styles.closeButton}>
          닫기
        </AppButton>
      </View>

      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.stateText}>학생 목록을 불러오는 중이에요.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          {students.map((student) => {
            const selected = selectedIds.includes(student.id);
            return (
              <ControlPressable
                key={student.id}
                onPress={() => toggleStudent(student.id)}
                style={[
                  styles.studentRow,
                  selected && styles.studentRowSelected,
                ]}
                accessibilityLabel={`${student.name} ${selected ? "선택됨" : "선택"}`}
                accessibilityState={{ selected }}
              >
                <View style={styles.studentText}>
                  <Text style={styles.studentName}>{student.name}</Text>
                  {student.number !== null ? (
                    <Text style={styles.studentNumber}>{student.number}번</Text>
                  ) : null}
                </View>
                <Text style={[styles.check, selected && styles.checkSelected]}>
                  {selected ? "✓" : "○"}
                </Text>
              </ControlPressable>
            );
          })}
          {!students.length && !error ? (
            <Text style={styles.empty}>등록된 학생이 없어요.</Text>
          ) : null}
        </ScrollView>
      )}

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <AppButton
          variant="secondary"
          onPress={onClose}
          style={styles.actionButton}
        >
          취소
        </AppButton>
        <AppButton
          onPress={save}
          loading={saving}
          disabled={loading || unavailable}
          style={styles.actionButton}
        >
          저장
        </AppButton>
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    maxHeight: "82%",
    minHeight: tapMin * 6,
    paddingBottom: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: { ...typography.title, color: colors.text },
  summary: {
    ...typography.label,
    color: colors.textMuted,
    marginTop: spacing.xxs,
  },
  closeButton: { minWidth: tapMin, paddingHorizontal: spacing.sm },
  state: {
    minHeight: tapMin * 4,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  stateText: { ...typography.body, color: colors.textMuted },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  studentRow: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.btn,
    backgroundColor: colors.surface,
  },
  studentRowSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentTintedBg,
  },
  studentText: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
    flexShrink: 1,
  },
  studentName: { ...typography.body, color: colors.text },
  studentNumber: { ...typography.label, color: colors.textMuted },
  check: { fontSize: iconSizes.lg, color: colors.textFaint },
  checkSelected: { color: colors.accent },
  empty: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: spacing.xl,
  },
  error: {
    ...typography.label,
    color: colors.danger,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  actionButton: { flex: 1 },
});
