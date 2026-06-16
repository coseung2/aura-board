import {
  Alert,
  Image,
  Keyboard,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { colors, radii, shadows, spacing, typography } from "../theme/tokens";
import type { BoardCard } from "../lib/types";
import { apiFetch } from "../lib/api";
import { EmbeddedMedia } from "./EmbeddedMedia";
import {
  buildMediaItems,
  fileAttachments,
  formatFileSize,
  isCanvaDesignUrl,
  isYouTubeVideoUrl,
  mediaAttachments,
  type MediaItem,
} from "../lib/media";

type DetailLayout = "full" | "media-meta" | "text-meta";

interface EngagementState {
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
  canInteract: boolean;
}

interface CommentItem {
  id: string;
  content: string;
  createdAt: string;
  authorKind: "teacher" | "student" | "external";
  authorLabel: string;
  canDelete: boolean;
}

interface Props {
  card: BoardCard | null;
  onClose: () => void;
}

export function CardDetailModal({ card, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [engagement, setEngagement] = useState<EngagementState | null>(null);
  const [comments, setComments] = useState<CommentItem[] | null>(null);
  const [commentText, setCommentText] = useState("");
  const [engagementBusy, setEngagementBusy] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [engagementError, setEngagementError] = useState<string | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [commentOffsets, setCommentOffsets] = useState({
    section: 0,
    panel: 0,
    block: 0,
    form: 0,
  });
  const railScrollRef = useRef<ScrollView>(null);
  const commentOffsetsRef = useRef(commentOffsets);

  const loadEngagement = useCallback(async () => {
    if (!card) return;
    try {
      const state = await apiFetch<EngagementState>(
        `/api/cards/${encodeURIComponent(card.id)}/engagement`,
      );
      setEngagement(state);
      setEngagementError(null);
    } catch {
      setEngagement({
        likeCount: card.likeCount ?? 0,
        commentCount: card.commentCount ?? 0,
        isLiked: false,
        canInteract: false,
      });
    }
  }, [card]);

  const loadComments = useCallback(async () => {
    if (!card) return;
    try {
      const res = await apiFetch<{ items: CommentItem[] }>(
        `/api/cards/${encodeURIComponent(card.id)}/comments`,
      );
      setComments(res.items);
    } catch {
      setComments([]);
    }
  }, [card]);

  const updateCommentOffset = useCallback(
    (key: keyof typeof commentOffsets, value: number) => {
      setCommentOffsets((current) =>
        current[key] === value ? current : { ...current, [key]: value },
      );
    },
    [],
  );

  const scrollCommentInputIntoView = useCallback(() => {
    const offsets = commentOffsetsRef.current;
    const y = Math.max(
      0,
      offsets.section +
        offsets.panel +
        offsets.block +
        offsets.form -
        spacing.md,
    );
    railScrollRef.current?.scrollTo({ y, animated: true });
  }, []);

  useEffect(() => {
    commentOffsetsRef.current = commentOffsets;
  }, [commentOffsets]);

  useEffect(() => {
    setExpanded(false);
    setActiveMediaIndex(0);
    setLightboxIndex(null);
    setCommentText("");
    setEngagement(null);
    setComments(null);
    setEngagementError(null);
    if (!card) return;
    void loadEngagement();
    void loadComments();
  }, [card?.id, card, loadEngagement, loadComments]);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (event) => {
      setKeyboardInset(event.endCoordinates.height);
      setTimeout(scrollCommentInputIntoView, 80);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardInset(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [scrollCommentInputIntoView]);

  if (!card) return null;

  const cardId = card.id;
  const isWide = width >= 1200 && width > height;
  const authorName = resolveAuthorName(card);
  const allItems = buildMediaItems({
    attachments: card.attachments,
    imageUrl: card.imageUrl,
    thumbUrl: card.thumbUrl,
    videoUrl: card.videoUrl,
    linkUrl: card.linkUrl,
    linkTitle: card.linkTitle,
    linkDesc: card.linkDesc,
    linkImage: card.linkImage,
    fileUrl: card.fileUrl,
    fileName: card.fileName,
    fileSize: card.fileSize,
    fileMimeType: card.fileMimeType,
  });
  const fileItems = fileAttachments(allItems);
  const hasEmbeddableLink = Boolean(
    card.linkUrl &&
      (isYouTubeVideoUrl(card.linkUrl) || isCanvaDesignUrl(card.linkUrl)),
  );
  const mediaItems = dedupeMediaItems(
    mediaAttachments(allItems).filter((item) => {
      if (item.kind !== "link") return true;
      return hasEmbeddableLink && item.url === card.linkUrl;
    }),
  );
  const hasTextLink = Boolean(card.linkUrl && !hasEmbeddableLink);
  const title = card.title.trim();
  const content = card.content.trim();
  const displayedEngagement = engagement ?? {
    likeCount: card.likeCount ?? 0,
    commentCount: card.commentCount ?? 0,
    isLiked: false,
    canInteract: false,
  };
  const hasMedia = mediaItems.length > 0;
  const hasTextContent = Boolean(
    title || content || fileItems.length > 0 || hasTextLink,
  );
  const shouldRenderContent = hasTextContent || !hasMedia;
  const detailLayout: DetailLayout = hasMedia
    ? hasTextContent
      ? "full"
      : "media-meta"
    : "text-meta";
  const modalMargin = expanded ? 0 : 24;
  const maxModalWidth = detailLayout === "text-meta" ? 900 : 1400;
  const surfaceWidth = Math.min(width - modalMargin * 2, maxModalWidth);
  const keyboardHeight = keyboardInset > 0
    ? Math.min(keyboardInset, Math.floor(height * 0.45))
    : 0;
  const surfaceMaxHeight = Math.max(320, height - modalMargin * 2 - keyboardHeight);
  const surfaceHeight = expanded
    ? surfaceMaxHeight
    : detailLayout === "text-meta"
      ? Math.min(surfaceMaxHeight, 520)
      : surfaceMaxHeight;
  const mediaIndex = mediaItems.length > 0
    ? Math.min(activeMediaIndex, mediaItems.length - 1)
    : 0;
  const activeMediaItem = mediaItems[mediaIndex] ?? null;
  const imageItems = mediaItems.filter((item) => item.kind === "image");
  const useDarkMediaControls = Boolean(
    activeMediaItem &&
      (activeMediaItem.kind === "image" || isCanvaDesignUrl(activeMediaItem.url)),
  );

  function navigateMedia(delta: -1 | 1) {
    if (mediaItems.length <= 1) return;
    setActiveMediaIndex((index) => (index + delta + mediaItems.length) % mediaItems.length);
  }

  async function toggleLike() {
    if (!displayedEngagement.canInteract || engagementBusy) return;
    const previous = displayedEngagement;
    const nextLiked = !previous.isLiked;
    setEngagement({
      ...previous,
      isLiked: nextLiked,
      likeCount: previous.likeCount + (nextLiked ? 1 : -1),
    });
    setEngagementBusy(true);
    try {
      const res = await apiFetch<{ liked: boolean; count: number }>(
        `/api/cards/${encodeURIComponent(cardId)}/like`,
        { method: "POST" },
      );
      setEngagement((current) => ({
        ...(current ?? previous),
        isLiked: res.liked,
        likeCount: res.count,
      }));
      setEngagementError(null);
    } catch {
      setEngagement(previous);
      setEngagementError("좋아요를 반영하지 못했어요.");
    } finally {
      setEngagementBusy(false);
    }
  }

  async function submitComment() {
    const trimmed = commentText.trim();
    if (!trimmed || !displayedEngagement.canInteract || commentSubmitting) return;
    setCommentSubmitting(true);
    try {
      const res = await apiFetch<{ item?: CommentItem; comment?: CommentItem }>(
        `/api/cards/${encodeURIComponent(cardId)}/comments`,
        { method: "POST", json: { content: trimmed } },
      );
      const item = res.item ?? res.comment;
      if (!item) throw new Error("missing comment");
      setComments((prev) => [item, ...(prev ?? [])]);
      setEngagement((current) => ({
        ...(current ?? displayedEngagement),
        commentCount: (current ?? displayedEngagement).commentCount + 1,
      }));
      setCommentText("");
      setEngagementError(null);
    } catch {
      setEngagementError("댓글 작성에 실패했어요.");
    } finally {
      setCommentSubmitting(false);
    }
  }

  async function deleteComment(commentId: string) {
    try {
      await apiFetch(`/api/cards/${encodeURIComponent(cardId)}/comments/${encodeURIComponent(commentId)}`, {
        method: "DELETE",
      });
      setComments((prev) => prev?.filter((item) => item.id !== commentId) ?? []);
      setEngagement((current) => ({
        ...(current ?? displayedEngagement),
        commentCount: Math.max(0, (current ?? displayedEngagement).commentCount - 1),
      }));
      setEngagementError(null);
    } catch {
      setEngagementError("댓글 삭제에 실패했어요.");
    }
  }

  function confirmDeleteComment(commentId: string) {
    Alert.alert("댓글 삭제", "댓글을 삭제할까요?", [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: () => void deleteComment(commentId) },
    ]);
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.root, expanded && styles.rootExpanded]}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            styles.surface,
            expanded && styles.surfaceExpanded,
            {
              width: surfaceWidth,
              maxHeight: surfaceMaxHeight,
              ...(surfaceHeight ? { height: surfaceHeight } : null),
            },
          ]}
        >
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="카드 상세 닫기"
          >
            <View pointerEvents="none" style={styles.closeIcon}>
              <View style={[styles.closeStroke, styles.closeStrokeA]} />
              <View style={[styles.closeStroke, styles.closeStrokeB]} />
            </View>
          </Pressable>
          <Pressable
            onPress={() => setExpanded((value) => !value)}
            style={({ pressed }) => [
              styles.fullscreenBtn,
              pressed && styles.closeBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={expanded ? "전체화면 끄기" : "전체화면 켜기"}
          >
            <FullscreenGlyph expanded={expanded} />
          </Pressable>
          <View
            style={[
              styles.body,
              isWide ? styles.bodyHorizontal : styles.bodyVertical,
              detailLayout === "text-meta" && styles.bodyTextOnly,
              surfaceHeight ? { minHeight: surfaceHeight } : null,
            ]}
          >
            <View
              style={[
                styles.main,
                isWide && styles.mainWide,
                !isWide &&
                  detailLayout !== "text-meta" &&
                  (detailLayout === "media-meta"
                    ? styles.mainStackedMediaOnly
                    : styles.mainStacked),
                detailLayout === "text-meta" && styles.mainTextOnly,
              ]}
            >
              {hasMedia ? (
                <View
                  style={[
                    styles.mediaZone,
                    detailLayout !== "media-meta" && styles.mediaZoneFramed,
                    isWide && detailLayout === "media-meta" && styles.mediaZoneWide,
                    detailLayout === "media-meta" && styles.mediaOnlyZone,
                  ]}
                >
                  {activeMediaItem ? (
	                    <MediaBlock
	                      item={activeMediaItem}
                      isWide={isWide}
	                      isMediaOnly={!hasTextContent}
	                      onImagePress={() => {
	                        const index = imageItems.findIndex(
	                          (item) => item.url === activeMediaItem.url,
	                        );
	                        if (index >= 0) setLightboxIndex(index);
	                      }}
	                    />
                  ) : null}
                  {mediaItems.length > 1 ? (
                    <>
                      <Pressable
                        onPress={() => navigateMedia(-1)}
                        style={({ pressed }) => [
                          styles.mediaNav,
                          styles.mediaNavPrev,
                          useDarkMediaControls
                            ? styles.mediaNavOnLight
                            : styles.mediaNavOnDark,
                          pressed && styles.mediaNavPressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="이전 첨부"
                      >
                        <Text
                          style={[
                            styles.mediaNavArrow,
                            useDarkMediaControls
                              ? styles.mediaNavArrowDark
                              : styles.mediaNavArrowLight,
                          ]}
                        >
                          ‹
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => navigateMedia(1)}
                        style={({ pressed }) => [
                          styles.mediaNav,
                          styles.mediaNavNext,
                          useDarkMediaControls
                            ? styles.mediaNavOnLight
                            : styles.mediaNavOnDark,
                          pressed && styles.mediaNavPressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="다음 첨부"
                      >
                        <Text
                          style={[
                            styles.mediaNavArrow,
                            useDarkMediaControls
                              ? styles.mediaNavArrowDark
                              : styles.mediaNavArrowLight,
                          ]}
                        >
                          ›
                        </Text>
                      </Pressable>
                      <View pointerEvents="box-none" style={styles.mediaDotsWrap}>
                        <View style={styles.mediaDots}>
                          {mediaItems.map((item, index) => (
                            <Pressable
                              key={item.id}
                              onPress={() => setActiveMediaIndex(index)}
                              style={[
                                styles.mediaDot,
                                index === mediaIndex && styles.mediaDotActive,
                              ]}
                              accessibilityRole="button"
                              accessibilityLabel={`${index + 1}번째 첨부로 이동`}
                            />
                          ))}
                        </View>
                      </View>
                    </>
                  ) : null}
                </View>
              ) : null}

              {shouldRenderContent ? (
                <ScrollView
                  style={styles.contentScroll}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  contentContainerStyle={[
                    styles.contentZone,
                    !hasMedia && styles.contentTextOnly,
                  ]}
                >
                  <View style={styles.bodyText}>
                    {title ? <Text style={styles.title}>{title}</Text> : null}

                    {hasTextLink && (card.linkTitle || card.linkDesc) ? (
                      <View style={styles.linkBody}>
                        {card.linkTitle ? (
                          <Text style={styles.linkTitle}>{card.linkTitle}</Text>
                        ) : null}
                        {card.linkDesc ? (
                          <Text style={styles.linkDesc}>{card.linkDesc}</Text>
                        ) : null}
                      </View>
                    ) : null}

                    {content ? (
		                      <CardBodyContent content={content} />
                    ) : null}
                  </View>

                  {fileItems.length > 0 ? (
                    <View style={styles.fileList}>
                      {fileItems.map((item) => (
                        <Pressable
                          key={item.id}
                          style={({ pressed }) => [
                            styles.fileBox,
                            pressed && styles.fileBoxPressed,
                          ]}
	                          onPress={() => void openExternalUrl(item.url)}
                          accessibilityRole="link"
                        >
                          <Text style={styles.fileIcon}>파일</Text>
                          <View style={styles.fileInfo}>
                            <Text style={styles.fileName} numberOfLines={1}>
                              {item.fileName || "파일 열기"}
                            </Text>
                            {item.fileSize ? (
                              <Text style={styles.fileMeta}>
                                {formatFileSize(item.fileSize)}
                              </Text>
                            ) : null}
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}

                  {hasTextLink && card.linkUrl ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.externalLinkBtn,
                        pressed && styles.externalLinkBtnPressed,
                      ]}
	                      onPress={() => void openExternalUrl(card.linkUrl!)}
                      accessibilityRole="link"
                    >
                      <Text style={styles.externalLinkText}>링크 열기</Text>
                    </Pressable>
                  ) : null}
                </ScrollView>
              ) : null}
            </View>

            {!expanded ? (
              <ScrollView
                ref={railScrollRef}
                style={[
                  styles.rail,
                  !isWide &&
                    detailLayout !== "text-meta" &&
                    styles.railStacked,
                  !isWide &&
                    detailLayout === "media-meta" &&
                    styles.railStackedMediaOnly,
                  isWide && styles.railWide,
                ]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={styles.railContent}
              >
              <View style={styles.railSection}>
                {authorName ? (
                  <Text style={styles.author} numberOfLines={2}>
                    {authorName}
                  </Text>
                ) : (
                  <Text style={styles.authorMuted}>작성자 정보 없음</Text>
                )}
                {formatCardDate(card.createdAt) ? (
                  <Text style={styles.date}>{formatCardDate(card.createdAt)}</Text>
                ) : null}
              </View>

              <View
                style={styles.railSection}
                onLayout={(event) =>
                  updateCommentOffset("section", event.nativeEvent.layout.y)
                }
              >
                <View
                  style={styles.engagementPanel}
                  onLayout={(event) =>
                    updateCommentOffset("panel", event.nativeEvent.layout.y)
                  }
                >
                  <View style={styles.engagementLikeRow}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.likeButton,
                        displayedEngagement.isLiked && styles.likeButtonLiked,
                        (!displayedEngagement.canInteract || engagementBusy) && styles.likeButtonDisabled,
                        pressed && styles.likeButtonPressed,
                      ]}
                      disabled={!displayedEngagement.canInteract || engagementBusy}
                      onPress={toggleLike}
                      accessibilityRole="button"
                      accessibilityState={{
                        disabled: !displayedEngagement.canInteract || engagementBusy,
                        selected: displayedEngagement.isLiked,
                      }}
                      accessibilityLabel={
                        displayedEngagement.isLiked ? "좋아요 취소" : "좋아요"
                      }
                    >
                      <Text style={styles.likeIcon}>
                        {displayedEngagement.isLiked ? "❤️" : "🤍"}
                      </Text>
                      <Text
                        style={[
                          styles.likeText,
                          displayedEngagement.isLiked && styles.likeTextLiked,
                        ]}
                      >
                        좋아요 {displayedEngagement.likeCount}
                      </Text>
                    </Pressable>
                    <Text style={styles.commentMeta}>
                      댓글 {displayedEngagement.commentCount}
                    </Text>
                  </View>
                  <View
                    style={styles.commentsBlock}
                    onLayout={(event) =>
                      updateCommentOffset("block", event.nativeEvent.layout.y)
                    }
                  >
                    {displayedEngagement.canInteract ? (
                      <View
                        style={styles.commentForm}
                        onLayout={(event) =>
                          updateCommentOffset("form", event.nativeEvent.layout.y)
                        }
                      >
                        <TextInput
                          value={commentText}
                          onChangeText={setCommentText}
                          placeholder="댓글을 입력하세요"
                          placeholderTextColor={colors.textFaint}
                          maxLength={1000}
                          multiline
                          editable={!commentSubmitting}
                          onFocus={() => {
                            setTimeout(scrollCommentInputIntoView, 80);
                          }}
                          style={styles.commentInput}
                        />
                        <Pressable
                          onPress={submitComment}
                          disabled={commentSubmitting || !commentText.trim()}
                          style={({ pressed }) => [
                            styles.commentSubmit,
                            (commentSubmitting || !commentText.trim()) && styles.commentSubmitDisabled,
                            pressed && styles.commentSubmitPressed,
                          ]}
                          accessibilityRole="button"
                        >
                          <Text style={styles.commentSubmitText}>
                            {commentSubmitting ? "작성 중..." : "댓글 달기"}
                          </Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Text style={styles.commentReadonly}>읽기 전용이라 댓글을 달 수 없어요</Text>
                    )}

                    {comments === null ? (
                      <Text style={styles.commentEmpty}>불러오는 중...</Text>
                    ) : comments.length === 0 ? (
                      <Text style={styles.commentEmpty}>아직 댓글이 없어요</Text>
                    ) : (
                      <View style={styles.commentList}>
                        {comments.map((item) => (
                          <View key={item.id} style={styles.commentItem}>
                            <View style={styles.commentHead}>
                              <Text style={styles.commentAuthor}>{item.authorLabel}</Text>
                              <Text style={styles.commentTime}>
                                {formatRelativeTime(item.createdAt)}
                              </Text>
                              {item.canDelete ? (
                                <Pressable
                                  onPress={() => confirmDeleteComment(item.id)}
                                  style={({ pressed }) => [
                                    styles.commentDelete,
                                    pressed && styles.commentDeletePressed,
                                  ]}
                                  accessibilityRole="button"
                                  accessibilityLabel="댓글 삭제"
                                >
                                  <Text style={styles.commentDeleteText}>삭제</Text>
                                </Pressable>
                              ) : null}
                            </View>
                            <Text style={styles.commentContent}>{item.content}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {engagementError ? (
                      <Text style={styles.commentError}>{engagementError}</Text>
                    ) : null}
                  </View>
                </View>
              </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
        {lightboxIndex !== null ? (
          <CardImageLightbox
            images={imageItems}
            initialIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        ) : null}
      </View>
    </Modal>
  );
}

function dedupeMediaItems(items: MediaItem[]): MediaItem[] {
  const seen = new Set<string>();
  const result: MediaItem[] = [];
  for (const item of items) {
    const key = item.url;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

async function openExternalUrl(url: string) {
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    }
  } catch {
    // Ignore malformed or unsupported external targets from legacy cards.
  }
}

function FullscreenGlyph({ expanded }: { expanded: boolean }) {
  return (
    <View style={styles.fullscreenGlyph}>
      {expanded ? (
        <>
          <View style={[styles.cornerStroke, styles.cornerTop, styles.cornerLeft, styles.cornerInA]} />
          <View style={[styles.cornerStroke, styles.cornerTop, styles.cornerRight, styles.cornerInB]} />
          <View style={[styles.cornerStroke, styles.cornerBottom, styles.cornerLeft, styles.cornerInB]} />
          <View style={[styles.cornerStroke, styles.cornerBottom, styles.cornerRight, styles.cornerInA]} />
        </>
      ) : (
        <>
          <View style={[styles.cornerStroke, styles.cornerTop, styles.cornerLeft]} />
          <View style={[styles.cornerStroke, styles.cornerTop, styles.cornerRight]} />
          <View style={[styles.cornerStroke, styles.cornerBottom, styles.cornerLeft]} />
          <View style={[styles.cornerStroke, styles.cornerBottom, styles.cornerRight]} />
        </>
      )}
    </View>
  );
}

function MediaBlock({
  item,
  isWide,
  isMediaOnly,
  onImagePress,
}: {
  item: MediaItem;
  isWide: boolean;
  isMediaOnly: boolean;
  onImagePress?: () => void;
}) {
  if (item.kind === "image") {
    return (
      <Pressable
        style={styles.imagePressable}
        onPress={onImagePress}
        accessibilityRole="imagebutton"
        accessibilityLabel="이미지 크게 보기"
      >
        <Image
          source={{ uri: item.previewUrl ?? item.url }}
          style={[
            styles.image,
            isWide && styles.imageWide,
            isMediaOnly && styles.imageMediaOnly,
          ]}
          resizeMode="contain"
        />
      </Pressable>
    );
  }
  if (item.kind === "video" || item.kind === "link") {
    return (
      <EmbeddedMedia
        url={item.url}
        title={item.fileName ?? undefined}
        style={[styles.embed, isWide && styles.embedWide]}
      />
    );
  }
  return null;
}

function CardBodyContent({ content }: { content: string }) {
  const match = content.match(/^\s*\*\*(.+?)\*\*\s*\n\n?([\s\S]*)$/);
  if (match) {
    const [, heading, rest] = match;
    return (
      <View style={styles.contentRich}>
        <Text style={styles.contentTitle}>{heading}</Text>
        {rest.trim() ? <Text style={styles.content}>{rest}</Text> : null}
      </View>
    );
  }
  return <Text style={styles.content}>{content}</Text>;
}

function CardImageLightbox({
  images,
  initialIndex,
  onClose,
}: {
  images: MediaItem[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(() =>
    Math.max(0, Math.min(initialIndex, images.length - 1)),
  );
  useEffect(() => {
    setIndex(Math.max(0, Math.min(initialIndex, images.length - 1)));
  }, [initialIndex, images.length]);

  if (images.length === 0) return null;
  const current = images[index];
  const multi = images.length > 1;
  const navigate = (delta: -1 | 1) => {
    setIndex((value) => (value + delta + images.length) % images.length);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.lightboxRoot}>
        <Pressable style={styles.lightboxBackdrop} onPress={onClose} />
        <Image
          source={{ uri: current.url }}
          style={styles.lightboxImage}
          resizeMode="contain"
          accessibilityLabel="이미지 원본"
        />
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [
            styles.lightboxClose,
            pressed && styles.closeBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="닫기"
        >
          <Text style={styles.lightboxCloseText}>X</Text>
        </Pressable>
        {multi ? (
          <>
            <Pressable
              onPress={() => navigate(-1)}
              style={({ pressed }) => [
                styles.lightboxNav,
                styles.lightboxNavPrev,
                pressed && styles.mediaNavPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="이전 이미지"
            >
              <Text style={styles.lightboxNavText}>‹</Text>
            </Pressable>
            <Pressable
              onPress={() => navigate(1)}
              style={({ pressed }) => [
                styles.lightboxNav,
                styles.lightboxNavNext,
                pressed && styles.mediaNavPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="다음 이미지"
            >
              <Text style={styles.lightboxNavText}>›</Text>
            </Pressable>
            <Text style={styles.lightboxCounter}>
              {index + 1} / {images.length}
            </Text>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

function resolveAuthorName(card: BoardCard): string | null {
  const anonymousAuthor = card.anonymousAuthor === true;
  const resolved = (() => {
  if (card.authors && card.authors.length > 0) {
    const visible = card.authors.slice(0, 3).map((author) => author.displayName);
    const suffix = card.authors.length > 3 ? ` 외 ${card.authors.length - 3}명` : "";
    return visible.join(", ") + suffix;
  }
  return card.externalAuthorName ?? card.studentAuthorName ?? card.authorName ?? null;
  })();
  return anonymousAuthor && resolved ? "익명" : resolved;
}

function formatCardDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const ms = Date.now() - date.getTime();
  const sec = Math.floor(ms / 1000);
  const minutes = Math.floor(sec / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (sec < 30) return "방금";
  if (minutes < 1) return `${sec}초 전`;
  if (hours < 1) return `${minutes}분 전`;
  if (days < 1) return `${hours}시간 전`;
  if (days < 7) return `${days}일 전`;
  return date.toLocaleDateString("ko-KR");
}

function formatRelativeTime(value: string): string {
  const date = new Date(value);
  const ms = Date.now() - date.getTime();
  if (Number.isNaN(ms)) return "";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.48)",
    padding: spacing.xl,
  },
  rootExpanded: {
    padding: 0,
    backgroundColor: colors.surface,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  surface: {
    overflow: "hidden",
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.cardHover,
  },
  surfaceExpanded: {
    borderRadius: 0,
    borderWidth: 0,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.btn,
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
    top: 20,
    right: 20,
    zIndex: 10,
    backgroundColor: "rgba(255, 255, 255, 0.82)",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  closeBtnPressed: { backgroundColor: colors.surfaceAlt },
  closeIcon: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  closeStroke: {
    position: "absolute",
    width: 15,
    height: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.textMuted,
  },
  closeStrokeA: { transform: [{ rotate: "45deg" }] },
  closeStrokeB: { transform: [{ rotate: "-45deg" }] },
  fullscreenBtn: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.lg,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  fullscreenGlyph: {
    width: 20,
    height: 20,
    position: "relative",
  },
  cornerStroke: {
    position: "absolute",
    width: 8,
    height: 8,
    borderColor: colors.text,
  },
  cornerTop: { top: 1, borderTopWidth: 2 },
  cornerBottom: { bottom: 1, borderBottomWidth: 2 },
  cornerLeft: { left: 1, borderLeftWidth: 2 },
  cornerRight: { right: 1, borderRightWidth: 2 },
  cornerInA: { transform: [{ rotate: "180deg" }] },
  cornerInB: { transform: [{ rotate: "180deg" }] },
  body: {
    flex: 1,
    paddingTop: 0,
  },
  bodyHorizontal: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  bodyVertical: {
    flexDirection: "column",
  },
  bodyTextOnly: {
    minHeight: 0,
  },
  main: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    backgroundColor: colors.surface,
  },
  mainWide: {
    flexBasis: 0,
  },
  mainStacked: {
    flex: 0,
    flexBasis: "55%",
  },
  mainStackedMediaOnly: {
    flex: 1,
  },
  mainTextOnly: {
    display: "flex",
  },
  mediaZone: {
    gap: spacing.md,
    minHeight: 260,
    backgroundColor: colors.surface,
    alignItems: "stretch",
    justifyContent: "center",
    overflow: "hidden",
  },
  mediaZoneFramed: {
    aspectRatio: 16 / 9,
    maxHeight: "70%",
  },
  mediaZoneWide: {
    minHeight: "100%",
  },
  mediaOnlyZone: {
    flex: 1,
  },
  image: {
    width: "100%",
    height: "100%",
    minHeight: 260,
    backgroundColor: colors.surfaceAlt,
  },
  imagePressable: {
    flex: 1,
    minHeight: 260,
  },
  imageWide: {
    minHeight: 420,
  },
  imageMediaOnly: {
    flex: 1,
    minHeight: 520,
  },
  embed: {
    borderRadius: 0,
    backgroundColor: colors.surfaceAlt,
  },
  embedWide: {
    minHeight: 420,
  },
  mediaNav: {
    position: "absolute",
    top: "50%",
    zIndex: 12,
    width: 48,
    height: 64,
    marginTop: -32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  mediaNavPrev: {
    left: spacing.md,
  },
  mediaNavNext: {
    right: spacing.md,
  },
  mediaNavOnLight: {
    opacity: 0.62,
  },
  mediaNavOnDark: {
    opacity: 0.72,
  },
  mediaNavPressed: {
    opacity: 1,
    transform: [{ scale: 1.12 }],
  },
  mediaNavArrow: {
    fontSize: 38,
    lineHeight: 44,
    fontWeight: "300",
  },
  mediaNavArrowDark: {
    color: "rgba(20, 18, 15, 0.88)",
    textShadowColor: "rgba(255, 255, 255, 0.62)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  mediaNavArrowLight: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  mediaDotsWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 12,
  },
  mediaDots: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  mediaDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.4)",
  },
  mediaDotActive: {
    width: 18,
    borderRadius: 4,
    backgroundColor: "#fff",
  },
  contentScroll: {
    flex: 1,
    minHeight: 0,
  },
  contentZone: {
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  contentTextOnly: {
    borderTopWidth: 0,
    paddingTop: spacing.xl,
  },
  bodyText: {
    gap: spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.text,
    lineHeight: 30,
  },
  linkBody: { gap: spacing.xs },
  linkTitle: { ...typography.subtitle, color: colors.text },
  linkDesc: { ...typography.body, color: colors.textMuted },
  contentRich: { gap: spacing.sm },
  contentTitle: { ...typography.body, color: colors.text, fontWeight: "700" },
  content: { ...typography.body, color: colors.text, lineHeight: 24 },
  fileList: { gap: spacing.sm },
  fileBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.btn,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fileBoxPressed: { backgroundColor: colors.surfaceAlt },
  fileIcon: { ...typography.micro, color: colors.accent },
  fileInfo: { flex: 1, gap: 2 },
  fileName: { ...typography.label, color: colors.text },
  fileMeta: { ...typography.micro, color: colors.textFaint },
  externalLinkBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.btn,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
  },
  externalLinkBtnPressed: { opacity: 0.7 },
  externalLinkText: { ...typography.label, color: colors.accentTintedText },
  rail: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  railStacked: {
    flex: 0,
    minHeight: 0,
    maxHeight: "45%",
  },
  railStackedMediaOnly: {
    maxHeight: "34%",
  },
  railContent: {
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  railWide: {
    flex: 0,
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 280,
    width: 280,
    maxWidth: 280,
    borderTopWidth: 0,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  railSection: {
    gap: spacing.sm,
  },
  author: { ...typography.body, color: colors.textMuted },
  authorMuted: { ...typography.micro, color: colors.textFaint },
  date: { ...typography.micro, color: colors.textFaint },
  engagementPanel: {
    gap: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  engagementLikeRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  likeButton: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  likeButtonLiked: {
    borderColor: colors.danger,
    backgroundColor: "rgba(198, 40, 40, 0.08)",
  },
  likeButtonDisabled: {
    opacity: 0.7,
  },
  likeButtonPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  likeIcon: {
    fontSize: 16,
  },
  likeText: {
    ...typography.label,
    color: colors.text,
  },
  likeTextLiked: {
    color: colors.danger,
  },
  commentMeta: {
    ...typography.micro,
    color: colors.textMuted,
  },
  commentsBlock: {
    gap: spacing.sm,
  },
  commentForm: {
    gap: 6,
  },
  commentInput: {
    minHeight: 56,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.btn,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 14,
    textAlignVertical: "top",
  },
  commentSubmit: {
    alignSelf: "flex-end",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.btn,
    backgroundColor: colors.accent,
  },
  commentSubmitPressed: {
    backgroundColor: colors.accentActive,
  },
  commentSubmitDisabled: {
    backgroundColor: colors.border,
  },
  commentSubmitText: {
    ...typography.label,
    color: "#fff",
  },
  commentReadonly: {
    ...typography.micro,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: spacing.xs,
  },
  commentEmpty: {
    ...typography.micro,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: spacing.sm,
  },
  commentList: {
    gap: 10,
  },
  commentItem: {
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
  },
  commentHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  commentAuthor: {
    ...typography.label,
    color: colors.text,
    flexShrink: 1,
  },
  commentTime: {
    ...typography.micro,
    color: colors.textMuted,
  },
  commentDelete: {
    marginLeft: "auto",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  commentDeletePressed: {
    backgroundColor: colors.surface,
  },
  commentDeleteText: {
    ...typography.micro,
    color: colors.textMuted,
  },
  commentContent: {
    ...typography.body,
    color: colors.text,
    flexShrink: 1,
  },
  commentError: {
    ...typography.micro,
    color: colors.danger,
  },
  lightboxRoot: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  lightboxBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  lightboxImage: {
    width: "94%",
    height: "82%",
  },
  lightboxClose: {
    position: "absolute",
    top: spacing.xxl,
    right: spacing.xxl,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.16)",
  },
  lightboxCloseText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  lightboxNav: {
    position: "absolute",
    top: "50%",
    width: 52,
    height: 72,
    marginTop: -36,
    borderRadius: radii.btn,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.14)",
  },
  lightboxNavPrev: {
    left: spacing.xxl,
  },
  lightboxNavNext: {
    right: spacing.xxl,
  },
  lightboxNavText: {
    color: "#fff",
    fontSize: 36,
    lineHeight: 40,
  },
  lightboxCounter: {
    position: "absolute",
    bottom: spacing.xxl,
    alignSelf: "center",
    color: "#fff",
    ...typography.label,
  },
});
