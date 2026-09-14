import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import {
  createSongGuessRoom,
  fetchSongGuessRooms,
  fetchSongGuessRoomCatalog,
  type SongGuessRoomCategory,
} from "../../lib/song-guess";
import type { SongGuessSnapshot } from "../../lib/song-guess-contract";
import { AppButton } from "../ui";
import { songGuessRoomsStyles as styles } from "./songGuessRoomsStyles";

const MAX_COUNT = 20;
const MIN_COUNT = 1;
const SEGMENTS = ["intro", "highlight"] as const;

type Segment = (typeof SEGMENTS)[number];
type Step = "home" | "confirm" | "genre" | "detail" | "created";

function segmentLabel(segment: Segment): string {
  return segment === "intro" ? "인트로" : "하이라이트";
}

function roomTitle(room: SongGuessSnapshot, index: number): string {
  if (room.hostDisplayName) return `${room.hostDisplayName}의 음악 퀴즈`;
  return room.roomMode === "student-free"
    ? `${index + 1}번 자유 게임`
    : `${index + 1}번 선생님 게임`;
}

function roomStatus(room: SongGuessSnapshot): { label: string; waiting: boolean } {
  if (room.phase === "lobby") return { label: "대기 중", waiting: true };
  if (room.phase === "finished") return { label: "최종 결과", waiting: false };
  if (room.phase === "draft") return { label: "준비 중", waiting: false };
  return { label: "진행 중", waiting: false };
}

function joinedCount(room: SongGuessSnapshot): number {
  return room.participants.filter((participant) => participant.joined !== false).length;
}

/** Applies the song-guess purple treatment to the shared button primitive. */
function actionProps(kind: "primary" | "secondary") {
  return kind === "primary"
    ? { style: styles.primaryAction, textStyle: styles.primaryActionText }
    : {
        variant: "secondary" as const,
        style: styles.secondaryAction,
        textStyle: styles.secondaryActionText,
      };
}

function StatusChip({ label, selected }: { label: string; selected?: boolean }) {
  return (
    <View
      style={[styles.chip, selected && styles.chipSelected]}
      accessible
      accessibilityLabel={label}
    >
      <Text style={[styles.chipText, selected && styles.chipSelectedText]}>{label}</Text>
    </View>
  );
}

function Header({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

function StepBar({ step }: { step: 1 | 2 }) {
  return (
    <View style={styles.stepRow} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: 2, now: step }}>
      <View style={[styles.stepBar, styles.stepBarActive, { flex: step === 1 ? 2 : 1 }]} />
      <View style={[styles.stepBar, step === 2 && styles.stepBarActive, { flex: step === 1 ? 1 : 2 }]} />
    </View>
  );
}

function PetRow({ names }: { names: string[] }) {
  if (!names.length) return null;
  return (
    <View style={styles.petRow}>
      {names.map((name, index) => (
        <View key={`${name}-${index}`} style={styles.petItem}>
          <View style={styles.pet}>
            <Text style={styles.petInitial}>{name.slice(0, 1)}</Text>
          </View>
          <Text style={styles.petName} numberOfLines={1}>
            {name}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function SongGuessRooms({
  boardId,
  onSelect,
}: {
  boardId: string;
  onSelect: (id: string) => void;
}) {
  const [rooms, setRooms] = useState<SongGuessSnapshot[]>([]);
  const [catalog, setCatalog] = useState<SongGuessRoomCategory[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [segment, setSegment] = useState<Segment>("highlight");
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("home");
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [createdRoom, setCreatedRoom] = useState<SongGuessSnapshot | null>(null);
  const request = useRef<{ key: string; id: string } | null>(null);

  const reload = useCallback(async () => {
    try {
      setRooms(await fetchSongGuessRooms(boardId));
      setLoadError(null);
    } catch {
      setLoadError("방 목록을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  const reloadCatalog = useCallback(() => {
    void fetchSongGuessRoomCatalog(boardId)
      .then(setCatalog)
      .catch(() => setError("곡 목록을 불러오지 못했어요."));
  }, [boardId]);

  useEffect(() => {
    void reload();
    reloadCatalog();
    const timer = setInterval(() => void reload(), 5000);
    return () => clearInterval(timer);
  }, [reload, reloadCatalog]);

  const available = useMemo(
    () =>
      catalog
        .filter((item) => categories.includes(item.id))
        .reduce((sum, item) => sum + item.counts[segment], 0),
    [catalog, categories, segment],
  );
  const maxCount = Math.min(MAX_COUNT, available);
  const valid = categories.length > 0 && count >= MIN_COUNT && count <= maxCount;
  const selectedLabels = catalog
    .filter((item) => categories.includes(item.id))
    .map((item) => item.label)
    .join(" + ");
  const summaryText = `${selectedLabels || "장르 미선택"} · ${segmentLabel(segment)} · ${count}문제`;
  const selectedRoom = rooms.find((room) => room.sessionId === selectedRoomId) ?? null;

  /** The created room is shown as its own step so students confirm the room
   * before entering, matching Figma `M5`. */
  async function create() {
    if (busy || !valid) return;
    setBusy(true);
    setError(null);
    const key = JSON.stringify({ categories, segment, count });
    if (request.current?.key !== key) {
      request.current = {
        key,
        id: `song-room-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      };
    }
    try {
      const room = await createSongGuessRoom(boardId, {
        requestId: request.current.id,
        categories,
        segment,
        count,
      });
      request.current = null;
      setCreatedRoom(room);
      setStep("created");
      void reload();
    } catch {
      setError("방을 만들지 못했어요. 같은 설정으로 다시 시도할 수 있어요.");
    } finally {
      setBusy(false);
    }
  }

  function startCreate() {
    setError(null);
    setStep("genre");
  }

  const problem = error ?? loadError;

  if (step === "confirm" && selectedRoom) {
    const status = roomStatus(selectedRoom);
    const index = rooms.findIndex((room) => room.sessionId === selectedRoom.sessionId);
    const names = selectedRoom.participants
      .filter((participant) => participant.joined !== false)
      .map((participant) => participant.displayName)
      .slice(0, 5);
    return (
      <ScrollView contentContainerStyle={styles.container} style={styles.scroll}>
        <Header
          eyebrow="방 입장"
          title={roomTitle(selectedRoom, index < 0 ? 0 : index)}
          subtitle="방 정보를 확인하고 친구들과 함께 입장하세요."
        />
        <View style={styles.panelCard}>
          <View style={styles.readyIcon}>
            <Text style={styles.readyIconText}>♪</Text>
          </View>
          <StatusChip label={status.label} selected={status.waiting} />
          <Text style={styles.centerNote}>
            {selectedRoom.hostDisplayName
              ? `${selectedRoom.hostDisplayName}가 만든 방`
              : selectedRoom.roomMode === "student-free"
                ? "친구가 만든 자유 게임"
                : "선생님이 만든 게임"}
          </Text>
        </View>
        <View style={styles.card}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryKey}>게임 방식</Text>
            <Text style={styles.summaryValue}>
              {selectedRoom.roomMode === "student-free" ? "자유 게임" : "선생님 게임"}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryKey}>답변 방식</Text>
            <Text style={styles.summaryValue}>
              {selectedRoom.answerMode === "multiple-choice" ? "객관식 4지선다" : "직접 입력"}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryKey}>현재 참여</Text>
            <Text style={styles.summaryValue}>{joinedCount(selectedRoom)}명</Text>
          </View>
        </View>
        {names.length ? (
          <View style={styles.card}>
            <Text style={styles.summaryEyebrow}>먼저 들어온 친구</Text>
            <PetRow names={names} />
          </View>
        ) : null}
        <View style={styles.spacer} />
        <View style={styles.footer}>
          <AppButton {...actionProps("primary")} onPress={() => onSelect(selectedRoom.sessionId)}>이 방에 입장하기</AppButton>
          <AppButton
            {...actionProps("secondary")}
            onPress={() => {
              setSelectedRoomId(null);
              setStep("home");
            }}
          >
            열린 방 다시 보기
          </AppButton>
        </View>
      </ScrollView>
    );
  }

  if (step === "genre") {
    return (
      <ScrollView contentContainerStyle={styles.container} style={styles.scroll}>
        <Header
          eyebrow="1 / 2"
          title="어떤 노래로 할까요?"
          subtitle="친구들이 좋아할 장르를 하나 골라 주세요."
        />
        <StepBar step={1} />
        {catalog.map((item) => {
          const selected = categories.includes(item.id);
          return (
            <AppButton
              key={item.id}
              variant="secondary"
              style={[styles.card, selected && styles.cardSelected]}
              disabled={busy}
              accessibilityLabel={`${item.label}, ${item.counts[segment]}곡`}
              accessibilityState={{ selected }}
              onPress={() => setCategories(selected ? [] : [item.id])}
            >
              <View style={styles.genreRow}>
                <View style={styles.genreCopy}>
                  <Text style={[styles.genreName, selected && styles.genreNameSelected]}>
                    {selected ? `✓  ${item.label}` : item.label}
                  </Text>
                  <Text style={styles.genreDesc}>{`${segmentLabel(segment)}로 낼 수 있는 곡`}</Text>
                </View>
                <StatusChip label={`${item.counts[segment]}곡`} selected={selected} />
              </View>
            </AppButton>
          );
        })}
        {!catalog.length ? <Text style={styles.muted}>사용할 수 있는 곡 목록이 없어요.</Text> : null}
        <View style={styles.spacer} />
        {problem ? (
          <Text style={styles.errorText} accessibilityRole="alert">
            {problem}
          </Text>
        ) : null}
        <View style={styles.footer}>
          <AppButton
            {...actionProps("primary")}
            disabled={!categories.length}
            onPress={() => {
              setCount((current) => Math.max(MIN_COUNT, Math.min(current, Math.min(MAX_COUNT, available))));
              setStep("detail");
            }}
          >
            다음
          </AppButton>
          <AppButton {...actionProps("secondary")} onPress={() => setStep("home")}>
            취소
          </AppButton>
        </View>
      </ScrollView>
    );
  }

  if (step === "detail") {
    return (
      <ScrollView contentContainerStyle={styles.container} style={styles.scroll}>
        <Header
          eyebrow="2 / 2"
          title="게임 방 설정"
          subtitle="재생 구간과 문제 수를 정하면 바로 시작할 수 있어요."
        />
        <StepBar step={2} />
        <View style={styles.card}>
          <Text style={styles.summaryValue}>재생 구간</Text>
          <View style={styles.chipRow}>
            {SEGMENTS.map((value) => (
              <AppButton
                key={value}
                variant="secondary"
                style={[styles.chip, segment === value && styles.chipSelected]}
                textStyle={[styles.chipText, segment === value && styles.chipSelectedText]}
                accessibilityState={{ selected: segment === value }}
                disabled={busy}
                onPress={() => setSegment(value)}
              >
                {segmentLabel(value)}
              </AppButton>
            ))}
          </View>
        </View>
        <View style={styles.card}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryValue}>문제 수</Text>
            <Text style={styles.summaryKey}>{`최대 ${maxCount}문제`}</Text>
          </View>
          <View style={styles.counterRow}>
            <AppButton
              variant="secondary"
              style={styles.counterButton}
              textStyle={styles.counterButtonText}
              accessibilityLabel="문제 수 줄이기"
              disabled={busy || count <= MIN_COUNT}
              onPress={() => setCount((current) => Math.max(MIN_COUNT, current - 1))}
            >
              −
            </AppButton>
            <View style={styles.counterValueBox}>
              <Text style={styles.counterValue} accessibilityLabel={`${count}문제`}>
                {count}
              </Text>
              <Text style={styles.counterUnit}>문제</Text>
            </View>
            <AppButton
              style={styles.counterButton}
              textStyle={styles.counterButtonText}
              accessibilityLabel="문제 수 늘리기"
              disabled={busy || count >= maxCount}
              onPress={() => setCount((current) => Math.min(maxCount, current + 1))}
            >
              ＋
            </AppButton>
          </View>
        </View>
        <View style={styles.card}>
          <Text style={styles.summaryEyebrow}>선택한 게임</Text>
          <Text style={styles.summaryTitle}>{summaryText}</Text>
          <Text style={styles.summaryNote}>{`선택한 구간에서 ${available}곡을 사용할 수 있어요`}</Text>
        </View>
        <View style={styles.spacer} />
        {problem ? (
          <Text style={styles.errorText} accessibilityRole="alert">
            {problem}
          </Text>
        ) : null}
        <View style={styles.footer}>
          <AppButton {...actionProps("primary")} disabled={busy || !valid} loading={busy} onPress={() => void create()}>
            게임 방 만들기
          </AppButton>
          <AppButton {...actionProps("secondary")} disabled={busy} onPress={() => setStep("genre")}>
            장르 다시 고르기
          </AppButton>
        </View>
      </ScrollView>
    );
  }

  if (step === "created" && createdRoom) {
    const names = createdRoom.participants
      .filter((participant) => participant.joined !== false)
      .map((participant) => participant.displayName)
      .slice(0, 5);
    return (
      <ScrollView contentContainerStyle={styles.container} style={styles.scroll}>
        <Header
          eyebrow="READY"
          title="방이 만들어졌어요"
          subtitle="친구들이 들어오면 게임을 시작할 수 있어요."
        />
        <View style={styles.panelCard}>
          <View style={styles.readyIcon}>
            <Text style={styles.readyIconText}>♪</Text>
          </View>
          <Text style={styles.readyTitle}>{roomTitle(createdRoom, rooms.length)}</Text>
          <StatusChip label="학생 입장 열림" selected />
        </View>
        <View style={styles.card}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryKey}>카테고리</Text>
            <Text style={styles.summaryValue}>{selectedLabels || "선택한 장르"}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryKey}>재생 구간</Text>
            <Text style={styles.summaryValue}>{segmentLabel(segment)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryKey}>문제 수</Text>
            <Text style={styles.summaryValue}>{`${count}문제`}</Text>
          </View>
        </View>
        <View style={styles.card}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryValue}>들어온 친구</Text>
            <Text style={styles.roomCount}>{`${joinedCount(createdRoom)}명`}</Text>
          </View>
          {names.length ? (
            <PetRow names={names} />
          ) : (
            <Text style={styles.summaryNote}>아직 들어온 친구가 없어요.</Text>
          )}
        </View>
        <View style={styles.spacer} />
        <View style={styles.footer}>
          <AppButton {...actionProps("primary")} onPress={() => onSelect(createdRoom.sessionId)}>음악 퀴즈 시작</AppButton>
          <AppButton
            {...actionProps("secondary")}
            onPress={() => {
              setCreatedRoom(null);
              setStep("detail");
            }}
          >
            방 설정 다시 보기
          </AppButton>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} style={styles.scroll}>
      <Header
        eyebrow="AURA BOARD"
        title="음악 퀴즈"
        subtitle="친구들과 함께할 방을 고르거나 새 게임을 만들어요."
      />
      <AppButton
        variant="secondary"
        style={styles.card}
        accessibilityLabel="내 자유 게임 만들기"
        disabled={busy}
        onPress={startCreate}
      >
        <View style={styles.quickRow}>
          <View style={styles.quickIcon}>
            <Text style={styles.quickIconText}>♪</Text>
          </View>
          <View style={styles.quickCopy}>
            <Text style={styles.quickTitle}>내 자유 게임 만들기</Text>
            <Text style={styles.quickNote}>원하는 장르와 문제 수를 골라요</Text>
          </View>
        </View>
      </AppButton>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>열린 방</Text>
        <AppButton
          variant="quiet"
          compact
          textStyle={styles.sectionAction}
          accessibilityLabel="방 목록 새로고침"
          onPress={() => {
            void reload();
            reloadCatalog();
          }}
        >
          새로고침
        </AppButton>
      </View>

      {loading ? (
        <View style={styles.panelCard} accessibilityLiveRegion="polite">
          <ActivityIndicator />
          <Text style={styles.centerNote}>열린 방을 찾고 있어요…</Text>
        </View>
      ) : loadError ? (
        <View style={styles.panelCard} accessibilityRole="alert">
          <View style={styles.emptyIcon}>
            <Text style={styles.emptyIconText}>!</Text>
          </View>
          <Text style={styles.emptyTitle}>방 목록을 불러오지 못했어요</Text>
          <Text style={styles.emptyBody}>
            {"네트워크를 확인한 뒤 다시 시도해 주세요.\n잠시 후 자동으로 다시 확인해요."}
          </Text>
          <AppButton
            {...actionProps("secondary")}
            onPress={() => {
              void reload();
              reloadCatalog();
            }}
          >
            다시 시도
          </AppButton>
        </View>
      ) : rooms.length === 0 ? (
        <View style={styles.panelCard}>
          <View style={styles.emptyIcon}>
            <Text style={styles.emptyIconText}>♫</Text>
          </View>
          <Text style={styles.emptyTitle}>아직 열린 방이 없어요</Text>
          <Text style={styles.emptyBody}>
            {"친구가 방을 열 때까지 기다리거나\n내가 먼저 게임을 만들어 보세요."}
          </Text>
          <StatusChip label="5초마다 자동 확인" />
        </View>
      ) : (
        rooms.map((room, index) => {
          const status = roomStatus(room);
          return (
            <AppButton
              key={room.sessionId}
              variant="secondary"
              style={styles.roomCard}
              disabled={busy}
              accessibilityLabel={`${roomTitle(room, index)}, ${status.label}, ${joinedCount(room)}명 참여`}
              onPress={() => {
                setSelectedRoomId(room.sessionId);
                setStep("confirm");
              }}
            >
              <View style={styles.roomTopRow}>
                <View style={styles.roomCopy}>
                  <Text style={styles.roomName} numberOfLines={1}>
                    {roomTitle(room, index)}
                  </Text>
                  <Text style={styles.roomMeta}>
                    {`${room.roomMode === "student-free" ? "자유 게임" : "선생님 게임"} · ${
                      room.answerMode === "multiple-choice" ? "객관식" : "직접 입력"
                    }`}
                  </Text>
                </View>
                <StatusChip label={status.label} selected={status.waiting} />
              </View>
              <View style={styles.roomDivider} />
              <View style={styles.roomFootRow}>
                <Text style={styles.roomCount}>{`${joinedCount(room)}명 참여`}</Text>
                <Text style={styles.roomEnter}>입장하기  ›</Text>
              </View>
            </AppButton>
          );
        })
      )}

      <View style={styles.spacer} />
      {error ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={styles.footer}>
        <AppButton {...actionProps("primary")} disabled={busy} onPress={startCreate}>
          새 자유 게임 만들기
        </AppButton>
      </View>
    </ScrollView>
  );
}
