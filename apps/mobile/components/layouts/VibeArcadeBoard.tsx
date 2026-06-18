import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import {
  borders,
  colors,
  iconSizes,
  spacing,
  typography,
  vibe,
} from "../../theme/tokens";
import { apiFetch, ApiError, getApiBase, streamSse } from "../../lib/api";
import type { BoardDetailResponse } from "../../lib/types";
import { AppButton, SurfaceCard, SurfacePressable, TextField } from "../ui";

// 코딩 교실(vibe-arcade). 학생이 LLM 과 대화해 HTML 프로젝트 만드는 공간.
// 3 구역 레이아웃:
//   - 좌: 프로젝트 갤러리 (approved + 본인 것)
//   - 중: 채팅 (SSE 스트리밍)
//   - 우: 미리보기 (WebView → /api/vibe/projects/:id/play)

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type PlayProject = {
  id: string;
  title: string;
};

export function VibeArcadeBoard({
  data,
}: {
  data: BoardDetailResponse;
}) {
  const cfg = data.layoutData.vibeArcade?.config;
  const projects = data.layoutData.vibeArcade?.projects ?? [];
  const { width } = useWindowDimensions();
  const compact = width < vibe.compactBreakpoint;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playTarget, setPlayTarget] = useState<PlayProject | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(async () => {
    const msg = input.trim();
    if (!msg || streaming) return;
    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: msg }, { role: "assistant", content: "" }]);
    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await streamSse({
        path: "/api/vibe/sessions",
        body: {
          boardId: data.board.id,
          sessionId: sessionId ?? undefined,
          userMessage: msg,
        },
        signal: ctrl.signal,
        onEvent: (raw: unknown) => {
          const evt = raw as {
            type: string;
            id?: string;
            text?: string;
            message?: string;
          };
          if (evt.type === "session" && evt.id) setSessionId(evt.id);
          if (evt.type === "delta" && evt.text) {
            setMessages((prev) => {
              const copy = prev.slice();
              const last = copy[copy.length - 1];
              if (last && last.role === "assistant") {
                copy[copy.length - 1] = {
                  ...last,
                  content: last.content + (evt.text ?? ""),
                };
              }
              return copy;
            });
          }
          if (evt.type === "error" && evt.message) {
            setError(evt.message);
          }
          if (evt.type === "refusal") {
            setError("요청이 거절되었어요. 학습 목적의 질문으로 다시 시도해주세요.");
          }
        },
      });
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 401) setError("로그인이 만료되었어요.");
        else if (e.status === 403) setError("선생님이 코딩 교실을 아직 열지 않았어요.");
        else if (e.status === 429) setError("토큰 사용량을 모두 썼거나 연속 요청을 초과했어요.");
        else if (e.status === 503) setError("선생님이 AI Key 를 아직 등록하지 않았어요.");
        else setError(`오류 (${e.status})`);
      } else {
        setError(e instanceof Error ? e.message : "오류");
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, sessionId, streaming, data.board.id]);

  function cancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }

  if (cfg && !cfg.enabled) {
    return (
      <View style={styles.gateWrap}>
        <Text style={styles.gateEmoji}>🔒</Text>
        <Text style={styles.gateTitle}>코딩 교실이 아직 열리지 않았어요</Text>
        <Text style={styles.gateMsg}>
          선생님이 이 보드를 열어주셔야 사용할 수 있어요.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, compact && styles.rootCompact]}>
      <SurfaceCard style={[styles.pane, compact && styles.paneCompact]}>
        <Text style={styles.paneTitle}>📚 작품 갤러리</Text>
        <FlatList
          data={projects}
          horizontal={compact}
          keyExtractor={(p) => p.id}
          contentContainerStyle={[styles.galleryList, compact && styles.galleryListCompact]}
          renderItem={({ item }) => (
            <SurfacePressable
              onPress={() => setPlayTarget({ id: item.id, title: item.title })}
              style={[styles.galleryItem, compact && styles.galleryItemCompact]}
            >
              {item.thumbnailUrl ? (
                <Image
                  source={{ uri: item.thumbnailUrl }}
                  style={styles.thumb}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.thumb, styles.thumbFallback]}>
                  <Text style={styles.thumbFallbackEmoji}>💻</Text>
                </View>
              )}
              <Text style={styles.galleryTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.galleryMeta}>
                {item.moderationStatus === "approved" ? "✓ 공개" : "개인"}
              </Text>
            </SurfacePressable>
          )}
          ListEmptyComponent={
            <Text style={styles.galleryEmpty}>아직 공개된 작품이 없어요.</Text>
          }
        />
      </SurfaceCard>

      <SurfaceCard style={styles.chatPane}>
        <Text style={styles.paneTitle}>💬 AI 와 함께 만들기</Text>
        <FlatList
          data={messages}
          keyExtractor={(_, i) => `msg-${i}`}
          contentContainerStyle={styles.chatList}
          renderItem={({ item }) => (
            <View
              style={[
                styles.bubble,
                item.role === "user" ? styles.bubbleUser : styles.bubbleBot,
              ]}
            >
              <Text style={styles.bubbleText}>{item.content || "…"}</Text>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.chatEmpty}>
              <Text style={styles.chatEmptyEmoji}>✨</Text>
              <Text style={styles.chatEmptyText}>
                "계산기 만들어줘" 처럼 자유롭게 말해보세요.
              </Text>
            </View>
          }
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <View style={styles.inputRow}>
          <TextField
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={streaming ? "답변을 받는 중…" : "무엇을 만들까요?"}
            editable={!streaming}
            onSubmitEditing={send}
            multiline
          />
          {streaming ? (
            <AppButton
              variant="danger"
              onPress={cancel}
            >
              중지
            </AppButton>
          ) : (
            <AppButton
              style={styles.sendBtn}
              onPress={send}
              disabled={input.trim().length === 0}
            >
              보내기
            </AppButton>
          )}
        </View>
      </SurfaceCard>

      <PlayModal
        project={playTarget}
        onClose={() => setPlayTarget(null)}
      />
    </View>
  );
}

function PlayModal({ project, onClose }: { project: PlayProject | null; onClose: () => void }) {
  const [playToken, setPlayToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!project) {
      setPlayToken(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setPlayToken(null);
    setError(null);
    (async () => {
      try {
        const res = await apiFetch<{ id: string; playToken: string }>(
          "/api/vibe/play-sessions",
          { method: "POST", json: { projectId: project.id } },
        );
        if (!cancelled) setPlayToken(res.playToken);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError) {
          if (e.status === 404) setError("이 작품은 아직 공개되지 않았어요.");
          else if (e.status === 403) setError("다른 학급의 작품이에요.");
          else setError(`열 수 없어요 (${e.status})`);
        } else {
          setError(e instanceof Error ? e.message : "오류");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project]);

  if (!project) return null;
  const url = playToken
    ? `${getApiBase()}/sandbox/vibe/${encodeURIComponent(project.id)}?pt=${encodeURIComponent(playToken)}`
    : null;

  return (
    <Modal visible={true} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <View style={styles.modalBar}>
          <AppButton
            variant="quiet"
            style={styles.closeBtn}
            textStyle={styles.closeText}
            onPress={onClose}
          >
            닫기
          </AppButton>
          <Text style={styles.modalTitle} numberOfLines={1}>{project.title}</Text>
          <View style={styles.modalSpacer} />
        </View>
        {error ? (
          <View style={styles.modalLoading}>
            <Text style={styles.modalErrorText}>{error}</Text>
          </View>
        ) : !url ? (
          <View style={styles.modalLoading}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : (
          <WebView
            originWhitelist={["*"]}
            source={{ uri: url }}
            style={styles.webview}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            renderLoading={() => (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color={colors.accent} />
              </View>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row",
    padding: spacing.lg,
    gap: spacing.lg,
  },
  rootCompact: {
    flexDirection: "column",
  },
  pane: {
    width: vibe.galleryPaneWidth,
    padding: spacing.md,
  },
  paneCompact: {
    width: "100%",
    maxHeight: vibe.compactGalleryMaxHeight,
  },
  chatPane: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  paneTitle: {
    ...typography.section,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  galleryList: { gap: spacing.md, paddingBottom: spacing.md },
  galleryListCompact: {
    paddingBottom: spacing.none,
    paddingRight: spacing.md,
  },
  galleryItem: {
    padding: spacing.sm,
    backgroundColor: colors.bg,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  galleryItemCompact: {
    width: vibe.compactGalleryItemWidth,
  },
  thumb: {
    width: "100%",
    aspectRatio: vibe.thumbnailAspectRatio,
    backgroundColor: colors.surfaceAlt,
  },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  thumbFallbackEmoji: { fontSize: iconSizes.xl },
  galleryTitle: { ...typography.label, color: colors.text },
  galleryMeta: { ...typography.micro, color: colors.textFaint },
  galleryEmpty: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.lg,
  },

  chatList: { flexGrow: 1, padding: spacing.sm, gap: spacing.sm },
  chatEmpty: {
    alignItems: "center",
    paddingTop: spacing.xl,
    gap: spacing.sm,
  },
  chatEmptyEmoji: { fontSize: iconSizes.hero },
  chatEmptyText: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  bubble: {
    padding: spacing.md,
    maxWidth: "90%",
    marginBottom: spacing.sm,
  },
  bubbleUser: {
    backgroundColor: colors.vibeChatUserBg,
    alignSelf: "flex-end",
  },
  bubbleBot: {
    backgroundColor: colors.bg,
    alignSelf: "flex-start",
    borderWidth: borders.hairline,
    borderColor: colors.border,
  },
  bubbleText: { ...typography.body, color: colors.text },

  errorText: { ...typography.label, color: colors.danger },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    padding: spacing.md,
    backgroundColor: colors.bg,
    maxHeight: vibe.inputMaxHeight,
  },
  sendBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  gateWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    gap: spacing.md,
  },
  gateEmoji: { fontSize: iconSizes.gate },
  gateTitle: { ...typography.title, color: colors.text },
  gateMsg: { ...typography.body, color: colors.textMuted, textAlign: "center" },

  modalRoot: { flex: 1, backgroundColor: colors.vibeSandboxBg },
  modalBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    backgroundColor: colors.vibeModalBackdrop,
  },
  closeBtn: {
    backgroundColor: colors.vibeModalControlBg,
  },
  closeText: { color: colors.onAccent, ...typography.label },
  modalTitle: { color: colors.onAccent, ...typography.subtitle, flex: 1, textAlign: "center" },
  modalSpacer: { width: vibe.modalSpacerWidth },
  modalErrorText: { ...typography.body, color: colors.onAccent },
  modalLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.vibeModalBackdrop,
  },
  webview: { flex: 1, backgroundColor: colors.vibeModalBackdrop },
});
