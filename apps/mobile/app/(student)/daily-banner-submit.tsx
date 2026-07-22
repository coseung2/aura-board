import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { ChevronLeft, ChevronRight, X } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiFetch, getApiBase, ApiError } from "../../lib/api";
import {
  clearSessionToken,
  getUnifiedLoginRoute,
  loadSessionToken,
} from "../../lib/session";
import {
  borders,
  colors,
  composer,
  layout,
  pageChrome,
  radii,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";
import {
  AppButton,
  AppHeader,
  AppModal,
  ControlPressable,
  IconButton,
  TextField,
} from "../../components/ui";
import { DailyBannerPreview } from "../../components/DailyBanner";

type BannerMode = "marquee" | "image";

type SelectedImage = {
  uri: string;
  url: string;
  name: string;
};

type Submission = {
  id: string;
  date: string;
  kind: BannerMode;
  text?: string | null;
  imageUrl?: string | null;
  status?: string | null;
};

type CalendarDay = {
  date: string;
  day: number;
};

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function parseOccupiedDays(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const raw = value as Record<string, unknown>;
  const candidates = [raw.occupiedDays, raw.occupiedDates, raw.publicationDays];
  const days = candidates.find(Array.isArray);
  if (!Array.isArray(days)) return [];
  return days.filter(
    (day): day is string =>
      typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day),
  );
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return `${year}년 ${month}월`;
}

function shiftMonth(monthKey: string, offset: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const shifted = new Date(year, month - 1 + offset, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}`;
}

function buildMonthWeeks(monthKey: string): Array<Array<CalendarDay | null>> {
  const [year, month] = monthKey.split("-").map(Number);
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const dayCount = new Date(year, month, 0).getDate();
  const cells: Array<CalendarDay | null> = Array.from(
    { length: firstWeekday },
    () => null,
  );

  for (let day = 1; day <= dayCount; day += 1) {
    cells.push({
      day,
      date: `${monthKey}-${String(day).padStart(2, "0")}`,
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: Array<Array<CalendarDay | null>> = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

function selectedDateLabel(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

function demoReservationDays(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const dayCount = new Date(year, month, 0).getDate();
  const occupied = [
    `${monthKey}-${String(Math.min(18, dayCount)).padStart(2, "0")}`,
    `${monthKey}-${String(Math.min(25, dayCount)).padStart(2, "0")}`,
  ];
  const mine = `${monthKey}-${String(Math.min(22, dayCount)).padStart(2, "0")}`;
  return { occupied, mine };
}

function parseSubmissions(value: unknown): Submission[] {
  if (!value || typeof value !== "object") return [];
  const raw = value as { submissions?: unknown };
  if (!Array.isArray(raw.submissions)) return [];
  return raw.submissions.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    const date =
      typeof entry.targetDay === "string"
        ? entry.targetDay
        : typeof entry.date === "string"
          ? entry.date
          : null;
    const kind = entry.kind === "text" ? "marquee" : entry.kind;
    if (!date || (kind !== "marquee" && kind !== "image")) {
      return [];
    }
    return [
      {
        id: typeof entry.id === "string" ? entry.id : `${date}-${index}`,
        date,
        kind,
        text: typeof entry.text === "string" ? entry.text : null,
        imageUrl: typeof entry.imageUrl === "string" ? entry.imageUrl : null,
        status: typeof entry.status === "string" ? entry.status : null,
      },
    ];
  });
}

function submissionStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "approved":
      return "승인됨";
    case "rejected":
      return "반려됨";
    case "pending":
      return "검토 중";
    default:
      return "접수됨";
  }
}

async function uploadImage(uri: string, name: string, mimeType: string) {
  const token = await loadSessionToken();
  const form = new FormData();
  form.append("file", { uri, name, type: mimeType } as unknown as Blob);
  const response = await fetch(`${getApiBase()}/api/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form as unknown as BodyInit,
  });
  if (!response.ok)
    throw new Error(`이미지를 업로드하지 못했어요. (${response.status})`);
  const body = (await response.json()) as { url?: unknown };
  if (typeof body.url !== "string" || !body.url) {
    throw new Error("업로드된 이미지 주소를 확인하지 못했어요.");
  }
  return body.url;
}

export default function DailyBannerSubmitScreen() {
  const router = useRouter();
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const [date, setDate] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [image, setImage] = useState<SelectedImage | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [occupiedDays, setOccupiedDays] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const loadSubmissions = useCallback(async () => {
    try {
      const response = await apiFetch<unknown>("/api/student/daily-banner");
      setSubmissions(parseSubmissions(response));
    } catch (nextError) {
      if (nextError instanceof ApiError && nextError.status === 401) {
        await clearSessionToken();
        router.replace(getUnifiedLoginRoute("student"));
        return;
      }
      // A list is useful but not required to submit; keep this screen usable
      // when an older server does not expose the optional GET response yet.
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  }, [router]);

  const loadCalendar = useCallback(
    async (monthKey: string) => {
      setCalendarLoading(true);
      setCalendarError(null);
      try {
        const response = await apiFetch<unknown>(
          `/api/student/daily-banner/calendar?month=${encodeURIComponent(monthKey)}`,
        );
        setOccupiedDays(parseOccupiedDays(response));
      } catch (nextError) {
        if (nextError instanceof ApiError && nextError.status === 401) {
          await clearSessionToken();
          router.replace(getUnifiedLoginRoute("student"));
          return;
        }
        setOccupiedDays([]);
        setCalendarError("예약 현황을 불러오지 못했어요.");
      } finally {
        setCalendarLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    void loadSubmissions();
  }, [loadSubmissions]);

  useEffect(() => {
    void loadCalendar(month);
  }, [loadCalendar, month]);

  const calendarWeeks = useMemo(() => buildMonthWeeks(month), [month]);
  const occupiedSet = useMemo(() => new Set(occupiedDays), [occupiedDays]);
  const ownPendingSet = useMemo(
    () =>
      new Set(
        submissions
          .filter(
            (submission) =>
              submission.status === "pending" ||
              submission.status === "approved",
          )
          .map((submission) => submission.date),
      ),
    [submissions],
  );
  const fallbackReservation = useMemo(
    () => demoReservationDays(month),
    [month],
  );
  const displayedOccupiedSet = useMemo(
    () => (calendarError ? new Set(fallbackReservation.occupied) : occupiedSet),
    [calendarError, fallbackReservation.occupied, occupiedSet],
  );
  const displayedOwnSet = useMemo(
    () =>
      calendarError
        ? new Set([...ownPendingSet, fallbackReservation.mine])
        : ownPendingSet,
    [calendarError, fallbackReservation.mine, ownPendingSet],
  );

  function openEditor(targetDay: string) {
    setDate(targetDay);
    setError(null);
    setSuccess(false);
  }

  function closeEditor() {
    if (busy) return;
    setDate(null);
    setError(null);
  }

  async function pickImage() {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "권한 필요",
          "사진을 선택하려면 사진 보관함 권한을 허용해 주세요.",
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      setBusy(true);
      setError(null);
      const name = asset.fileName ?? `daily-banner-${Date.now()}.jpg`;
      const url = await uploadImage(
        asset.uri,
        name,
        asset.mimeType ?? "image/jpeg",
      );
      setImage({ uri: asset.uri, url, name });
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "이미지를 준비하지 못했어요.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    const normalizedDate = date;
    const normalizedText = text.trim();
    if (!normalizedDate) {
      setError("캘린더에서 게시할 날짜를 선택해 주세요.");
      return;
    }
    if (!normalizedText) {
      setError("문구를 입력해 주세요.");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(false);
    try {
      await apiFetch("/api/student/daily-banner", {
        method: "POST",
        json: image
          ? {
              targetDay: normalizedDate,
              kind: "image",
              text: normalizedText,
              imageUrl: image.url,
            }
          : { targetDay: normalizedDate, kind: "text", text: normalizedText },
      });
      setSuccess(true);
      setText("");
      setImage(null);
      setDate(null);
      await Promise.all([loadSubmissions(), loadCalendar(month)]);
    } catch (nextError) {
      if (nextError instanceof ApiError && nextError.status === 401) {
        await clearSessionToken();
        router.replace(getUnifiedLoginRoute("student"));
        return;
      }
      setError(
        nextError instanceof Error ? nextError.message : "제출하지 못했어요.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader title="오늘의 배너 제안" onBack={() => router.back()} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <View style={styles.intro}>
          <Text style={styles.title} selectable>
            모두가 보는 오늘의 소식을 제안해 보세요.
          </Text>
        </View>

        <View style={styles.calendarSection}>
          <View style={styles.calendarHeader}>
            <View style={styles.calendarMonthControls}>
              <IconButton
                onPress={() => setMonth((current) => shiftMonth(current, -1))}
                disabled={month <= todayIso().slice(0, 7)}
                accessibilityLabel="이전 달"
              >
                <ChevronLeft size={20} color={colors.textMuted} />
              </IconButton>
              <Text style={styles.calendarMonth} selectable>
                {monthLabel(month)}
              </Text>
              <IconButton
                onPress={() => setMonth((current) => shiftMonth(current, 1))}
                accessibilityLabel="다음 달"
              >
                <ChevronRight size={20} color={colors.textMuted} />
              </IconButton>
            </View>
          </View>
          <Text style={styles.calendarGuide} selectable>
            비어 있는 날짜를 누르면 제안 작성창이 열려요.
          </Text>

          <View style={styles.weekdayRow} accessibilityRole="header">
            {WEEKDAY_LABELS.map((weekday, index) => (
              <Text
                key={weekday}
                style={[
                  styles.weekday,
                  index === 0 && styles.sundayText,
                  index === 6 && styles.saturdayText,
                ]}
              >
                {weekday}
              </Text>
            ))}
          </View>

          {calendarLoading ? (
            <View style={styles.calendarLoading}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            <View style={styles.calendarGrid}>
              {calendarWeeks.map((week, weekIndex) => (
                <View key={`${month}-${weekIndex}`} style={styles.weekRow}>
                  {week.map((calendarDay, dayIndex) => {
                    if (!calendarDay) {
                      return (
                        <View
                          key={`empty-${dayIndex}`}
                          style={styles.dayCell}
                        />
                      );
                    }
                    const isPast = calendarDay.date < todayIso();
                    const isOccupied = displayedOccupiedSet.has(
                      calendarDay.date,
                    );
                    const isMine = displayedOwnSet.has(calendarDay.date);
                    const disabled = isPast || isOccupied || isMine;
                    const status = isOccupied ? "마감" : isMine ? "신청" : null;

                    return (
                      <ControlPressable
                        key={calendarDay.date}
                        onPress={() => openEditor(calendarDay.date)}
                        disabled={disabled}
                        accessibilityLabel={`${selectedDateLabel(calendarDay.date)}${status ? ` ${status}` : " 신청 가능"}`}
                        accessibilityState={{ disabled }}
                        style={[
                          styles.dayCell,
                          calendarDay.date === todayIso() && styles.todayCell,
                          isOccupied && styles.occupiedCell,
                          isMine && styles.mineCell,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayNumber,
                            dayIndex === 0 && styles.sundayText,
                            dayIndex === 6 && styles.saturdayText,
                            disabled && styles.disabledDayText,
                          ]}
                        >
                          {calendarDay.day}
                        </Text>
                        {status ? (
                          <Text style={styles.dayStatus}>{status}</Text>
                        ) : null}
                      </ControlPressable>
                    );
                  })}
                </View>
              ))}
            </View>
          )}

          {calendarError ? (
            <View style={styles.calendarFallback}>
              <View style={styles.calendarErrorRow}>
                <Text style={styles.fieldError} accessibilityRole="alert">
                  {calendarError}
                </Text>
                <AppButton
                  variant="quiet"
                  onPress={() => void loadCalendar(month)}
                  style={styles.retryButton}
                >
                  다시 시도
                </AppButton>
              </View>
              <Text style={styles.calendarFallbackNote} selectable>
                임시 표시예요. 회색 ‘마감’은 이미 승인된 날짜, 파란 ‘신청’은 내
                제안이에요.
              </Text>
            </View>
          ) : null}
        </View>

        {success ? (
          <Text
            style={styles.success}
            accessibilityLiveRegion="polite"
            selectable
          >
            제안이 접수됐어요. 승인 결과를 기다려 주세요.
          </Text>
        ) : null}

        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>내 제안</Text>
          {loading ? (
            <ActivityIndicator color={colors.accent} />
          ) : submissions.length === 0 ? (
            <Text style={styles.muted} selectable>
              아직 제출한 제안이 없어요.
            </Text>
          ) : (
            <View style={styles.historyList}>
              {submissions.slice(0, 5).map((submission) => (
                <View key={submission.id} style={styles.historyRow}>
                  <View style={styles.historyCopy}>
                    <Text style={styles.historyDate} selectable>
                      {submission.date}
                    </Text>
                    <Text
                      style={styles.historyKind}
                      numberOfLines={1}
                      selectable
                    >
                      {submission.text ?? "이미지 배너"}
                    </Text>
                  </View>
                  <Text style={styles.status} selectable>
                    {submissionStatusLabel(submission.status)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <AppModal
        visible={date !== null}
        onClose={closeEditor}
        keyboardAvoiding
        closeOnBackdropPress={!busy}
        accessibilityLabel="배너 제안 작성"
        sheetStyle={styles.modalSheet}
      >
        <View style={styles.modalHeader}>
          <View style={styles.modalTitleGroup}>
            <Text style={styles.modalTitle} selectable>
              배너 제안 작성
            </Text>
            {date ? (
              <Text style={styles.modalDate} selectable>
                {selectedDateLabel(date)}
              </Text>
            ) : null}
          </View>
          <IconButton
            onPress={closeEditor}
            disabled={busy}
            accessibilityLabel="닫기"
          >
            <X size={20} color={colors.textMuted} />
          </IconButton>
        </View>

        <ScrollView
          style={styles.modalScroll}
          contentContainerStyle={styles.modalContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.form}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>미리보기</Text>
              <DailyBannerPreview
                text={text.trim() || undefined}
                imageUrl={image?.uri}
              />
              {image ? (
                <Text style={styles.fileName} numberOfLines={1} selectable>
                  {image.name}
                </Text>
              ) : null}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>문구</Text>
              <TextField
                value={text}
                onChangeText={(value) => setText(value.slice(0, 120))}
                placeholder="친구들에게 전할 짧은 소식"
                maxLength={120}
                multiline
                editable={!busy}
                accessibilityLabel="배너 문구"
              />
              <Text style={styles.hint}>{text.length}/120</Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>이미지</Text>
              <Text style={styles.imageGuide} selectable>
                권장 제작 크기: 1500 × 500px (가로 3:1)
              </Text>
              <AppButton
                variant="secondary"
                onPress={() => void pickImage()}
                disabled={busy}
              >
                {image ? "이미지 변경" : "이미지 추가"}
              </AppButton>
            </View>

            {error ? (
              <Text style={styles.fieldError} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            <AppButton onPress={() => void submit()} loading={busy}>
              제안 제출
            </AppButton>
          </View>
        </ScrollView>
      </AppModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: {
    width: "100%",
    maxWidth: layout.readableMaxWidth,
    alignSelf: "center",
    flexGrow: 1,
    paddingHorizontal: pageChrome.horizontalPadding,
    paddingTop: pageChrome.directContentStartGap,
    paddingBottom: spacing.xxxl + spacing.xl,
    gap: spacing.xl,
  },
  intro: { gap: spacing.xs },
  title: { ...typography.title, color: colors.text },
  calendarSection: { gap: spacing.md },
  calendarHeader: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  calendarMonthControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  calendarMonth: {
    ...typography.section,
    color: colors.text,
    textAlign: "center",
  },
  calendarGuide: { ...typography.micro, color: colors.textMuted },
  weekdayRow: { flexDirection: "row", alignItems: "center" },
  weekday: {
    ...typography.micro,
    flex: 1,
    color: colors.textMuted,
    textAlign: "center",
  },
  calendarGrid: { gap: spacing.xxs },
  weekRow: { flexDirection: "row" },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: borders.none,
    borderRadius: radii.control,
    gap: spacing.xxs,
  },
  todayCell: {
    borderWidth: borders.hairline,
    borderColor: colors.accent,
  },
  occupiedCell: { backgroundColor: colors.surfaceAlt },
  mineCell: { backgroundColor: colors.accentTintedBg },
  dayNumber: { ...typography.label, color: colors.text },
  dayStatus: { ...typography.micro, color: colors.textMuted },
  disabledDayText: { color: colors.textFaint },
  sundayText: { color: colors.danger },
  saturdayText: { color: colors.accentTintedText },
  calendarLoading: {
    minHeight: tapMin * 5,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  calendarFallback: { gap: spacing.xs },
  calendarFallbackNote: { ...typography.micro, color: colors.textMuted },
  retryButton: { alignSelf: "center" },
  modalSheet: {
    maxHeight: "100%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  modalTitleGroup: { flex: 1, minWidth: 0, gap: spacing.xxs },
  modalTitle: { ...typography.title, color: colors.text },
  modalDate: { ...typography.body, color: colors.textMuted },
  modalScroll: { flexShrink: 1 },
  modalContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  form: { gap: spacing.lg },
  fieldGroup: { gap: spacing.sm },
  label: { ...typography.label, color: colors.text },
  hint: { ...typography.micro, color: colors.textMuted, textAlign: "right" },
  imageGuide: { ...typography.micro, color: colors.textMuted },
  fileName: { ...typography.micro, color: colors.textMuted },
  fieldError: { ...typography.body, color: colors.danger },
  success: { ...typography.body, color: colors.plantActive },
  historySection: { gap: spacing.md },
  sectionTitle: { ...typography.section, color: colors.text },
  muted: { ...typography.body, color: colors.textMuted },
  historyList: {
    borderTopWidth: borders.hairline,
    borderTopColor: colors.border,
  },
  historyRow: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  historyCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  historyDate: { ...typography.label, color: colors.text },
  historyKind: { ...typography.micro, color: colors.textMuted },
  status: { ...typography.micro, color: colors.accentTintedText },
});
