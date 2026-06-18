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
  useWindowDimensions,
  View,
} from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { borders, cardDetail, colors, controls, layers, radii, shadows, spacing, typography } from "../theme/tokens";
import type { BoardCard } from "../lib/types";
import { apiFetch } from "../lib/api";
import { maskAnonymousLabel, resolveCardAuthorName } from "../lib/card-privacy";
import { EmbeddedMedia } from "./EmbeddedMedia";
import { AppButton, ControlPressable, IconButton, MediaPressable, TextField } from "./ui";
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
  const authorName = resolveCardAuthorName(card);
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
  const compactRailMaxHeight = !isWide && !expanded
    ? Math.min(180, Math.max(118, Math.floor(surfaceMaxHeight * 0.28)))
    : undefined;
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
        <MediaPressable style={styles.backdrop} onPress={onClose} />
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
          <IconButton
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityLabel="카드 상세 닫기"
          >
            <View pointerEvents="none" style={styles.closeIcon}>
              <View style={[styles.closeStroke, styles.closeStrokeA]} />
              <View style={[styles.closeStroke, styles.closeStrokeB]} />
            </View>
          </IconButton>
          <IconButton
            onPress={() => setExpanded((value) => !value)}
            style={styles.fullscreenBtn}
            accessibilityLabel={expanded ? "전체화면 끄기" : "전체화면 켜기"}
          >
            <FullscreenGlyph expanded={expanded} />
          </IconButton>
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
                      <IconButton
                        onPress={() => navigateMedia(-1)}
                        style={[
                          styles.mediaNav,
                          styles.mediaNavPrev,
                          useDarkMediaControls
                            ? styles.mediaNavOnLight
                            : styles.mediaNavOnDark,
                        ]}
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
                      </IconButton>
                      <IconButton
                        onPress={() => navigateMedia(1)}
                        style={[
                          styles.mediaNav,
                          styles.mediaNavNext,
                          useDarkMediaControls
                            ? styles.mediaNavOnLight
                            : styles.mediaNavOnDark,
                        ]}
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
                      </IconButton>
                      <View pointerEvents="box-none" style={styles.mediaDotsWrap}>
                        <View style={styles.mediaDots}>
                          {mediaItems.map((item, index) => (
                            <IconButton
                              key={item.id}
                              onPress={() => setActiveMediaIndex(index)}
                              hitSlop={spacing.sm}
                              style={styles.mediaDotButton}
                              accessibilityLabel={`${index + 1}번째 첨부로 이동`}
                            >
                              <View
                                style={[
                                  styles.mediaDot,
                                  index === mediaIndex && styles.mediaDotActive,
                                ]}
                              />
                            </IconButton>
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
                        <ControlPressable
                          key={item.id}
                          style={styles.fileBox}
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
                        </ControlPressable>
                      ))}
                    </View>
                  ) : null}

                  {hasTextLink && card.linkUrl ? (
                    <ControlPressable
                      style={styles.externalLinkBtn}
		                      onPress={() => void openExternalUrl(card.linkUrl!)}
                      accessibilityRole="link"
                    >
                      <Text style={styles.externalLinkText}>링크 열기</Text>
                    </ControlPressable>
                  ) : null}
                </ScrollView>
              ) : null}
            </View>

            {!expanded ? (
              <ScrollView
                ref={railScrollRef}
                style={[
                  styles.rail,
                  !isWide && styles.railStacked,
                  !isWide &&
                    detailLayout === "media-meta" &&
                    styles.railStackedMediaOnly,
                  isWide && styles.railWide,
                  compactRailMaxHeight ? { maxHeight: compactRailMaxHeight } : null,
                ]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={styles.railContent}
              >
              <View style={styles.metaSection}>
                <Text style={styles.metaLine} numberOfLines={1}>
                  {[
                    authorName || "작성자 정보 없음",
                    formatCardDate(card.createdAt),
                  ].filter(Boolean).join(" · ")}
                </Text>
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
                    <ControlPressable
                      style={[
                        styles.likeButton,
                        displayedEngagement.isLiked && styles.likeButtonLiked,
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
                    </ControlPressable>
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
                        <TextField
                          value={commentText}
                          onChangeText={setCommentText}
                          placeholder="댓글을 입력하세요"
                          maxLength={1000}
                          multiline
                          editable={!commentSubmitting}
                          onFocus={() => {
                            setTimeout(scrollCommentInputIntoView, 80);
                          }}
                          style={styles.commentInput}
                        />
                        <AppButton
                          onPress={submitComment}
                          disabled={commentSubmitting || !commentText.trim()}
                          style={styles.commentSubmit}
                          loading={commentSubmitting}
                        >
                          댓글 달기
                        </AppButton>
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
                              <Text style={styles.commentAuthor}>
                                {maskAnonymousLabel(item.authorLabel, card.anonymousAuthor)}
                              </Text>
                              <Text style={styles.commentTime}>
                                {formatRelativeTime(item.createdAt)}
                              </Text>
                              {item.canDelete ? (
                                <AppButton
                                  variant="quiet"
                                  onPress={() => confirmDeleteComment(item.id)}
                                  style={styles.commentDelete}
                                  textStyle={styles.commentDeleteText}
                                  accessibilityLabel="댓글 삭제"
                                >
                                  삭제
                                </AppButton>
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
      <MediaPressable
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
      </MediaPressable>
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
        <MediaPressable style={styles.lightboxBackdrop} onPress={onClose} />
        <Image
          source={{ uri: current.url }}
          style={styles.lightboxImage}
          resizeMode="contain"
          accessibilityLabel="이미지 원본"
        />
        <IconButton
          onPress={onClose}
          style={styles.lightboxClose}
          accessibilityLabel="닫기"
        >
          <Text style={styles.lightboxCloseText}>X</Text>
        </IconButton>
        {multi ? (
          <>
            <IconButton
              onPress={() => navigate(-1)}
              style={[
                styles.lightboxNav,
                styles.lightboxNavPrev,
              ]}
              accessibilityLabel="이전 이미지"
            >
              <Text style={styles.lightboxNavText}>‹</Text>
            </IconButton>
            <IconButton
              onPress={() => navigate(1)}
              style={[
                styles.lightboxNav,
                styles.lightboxNavNext,
              ]}
              accessibilityLabel="다음 이미지"
            >
              <Text style={styles.lightboxNavText}>›</Text>
            </IconButton>
            <Text style={styles.lightboxCounter}>
              {index + 1} / {images.length}
            </Text>
          </>
        ) : null}
      </View>
    </Modal>
  );
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
    backgroundColor: colors.modalBackdrop,
    padding: spacing.xl,
  },
  rootExpanded: {
    padding: spacing.none,
    backgroundColor: colors.surface,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  surface: {
    overflow: "hidden",
    borderRadius: radii.card,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  surfaceExpanded: {
    borderRadius: radii.none,
    borderWidth: borders.none,
  },
  closeBtn: {
    width: controls.closeButton,
    height: controls.closeButton,
    borderRadius: radii.btn,
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
    top: cardDetail.closeButtonOffset,
    right: cardDetail.closeButtonOffset,
    zIndex: layers.overlayControl,
    backgroundColor: colors.surfaceGlass,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    ...shadows.card,
  },
  closeIcon: {
    width: cardDetail.closeIconSize,
    height: cardDetail.closeIconSize,
    alignItems: "center",
    justifyContent: "center",
  },
  closeStroke: {
    position: "absolute",
    width: cardDetail.closeStrokeWidth,
    height: cardDetail.iconStrokeHeight,
    borderRadius: radii.pill,
    backgroundColor: colors.textMuted,
  },
  closeStrokeA: { transform: [{ rotate: "45deg" }] },
  closeStrokeB: { transform: [{ rotate: "-45deg" }] },
  fullscreenBtn: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.lg,
    zIndex: layers.overlayControl,
    width: cardDetail.iconButtonSize,
    height: cardDetail.iconButtonSize,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceGlassStrong,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    ...shadows.card,
  },
  fullscreenGlyph: {
    width: cardDetail.fullscreenGlyphSize,
    height: cardDetail.fullscreenGlyphSize,
    position: "relative",
  },
  cornerStroke: {
    position: "absolute",
    width: cardDetail.fullscreenCornerSize,
    height: cardDetail.fullscreenCornerSize,
    borderColor: colors.text,
  },
  cornerTop: { top: cardDetail.fullscreenCornerInset, borderTopWidth: cardDetail.iconStrokeWidth },
  cornerBottom: { bottom: cardDetail.fullscreenCornerInset, borderBottomWidth: cardDetail.iconStrokeWidth },
  cornerLeft: { left: cardDetail.fullscreenCornerInset, borderLeftWidth: cardDetail.iconStrokeWidth },
  cornerRight: { right: cardDetail.fullscreenCornerInset, borderRightWidth: cardDetail.iconStrokeWidth },
  cornerInA: { transform: [{ rotate: "180deg" }] },
  cornerInB: { transform: [{ rotate: "180deg" }] },
  body: {
    flex: 1,
    paddingTop: spacing.none,
  },
  bodyHorizontal: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  bodyVertical: {
    flexDirection: "column",
  },
  bodyTextOnly: {
    minHeight: spacing.none,
  },
  main: {
    flex: 1,
    minWidth: 0,
    minHeight: spacing.none,
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
    minHeight: cardDetail.mediaMinHeight,
    backgroundColor: colors.surface,
    alignItems: "stretch",
    justifyContent: "center",
    overflow: "hidden",
  },
  mediaZoneFramed: {
    aspectRatio: cardDetail.mediaAspectRatio,
    maxHeight: cardDetail.mediaMaxHeight,
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
    minHeight: cardDetail.mediaMinHeight,
    backgroundColor: colors.surfaceAlt,
  },
  imagePressable: {
    flex: 1,
    minHeight: cardDetail.mediaMinHeight,
  },
  imageWide: {
    minHeight: cardDetail.mediaWideMinHeight,
  },
  imageMediaOnly: {
    flex: 1,
    minHeight: cardDetail.mediaOnlyMinHeight,
  },
  embed: {
    borderRadius: radii.none,
    backgroundColor: colors.surfaceAlt,
  },
  embedWide: {
    minHeight: cardDetail.mediaWideMinHeight,
  },
  mediaNav: {
    position: "absolute",
    top: "50%",
    zIndex: layers.mediaControl,
    width: cardDetail.mediaNavWidth,
    height: cardDetail.mediaNavHeight,
    marginTop: cardDetail.mediaNavHalfHeight,
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
    opacity: cardDetail.mediaNavLightOpacity,
  },
  mediaNavOnDark: {
    opacity: cardDetail.mediaNavDarkOpacity,
  },
  mediaNavArrow: {
    fontSize: cardDetail.mediaNavArrowFontSize,
    lineHeight: cardDetail.mediaNavArrowLineHeight,
    fontWeight: "300",
  },
  mediaNavArrowDark: {
    color: colors.mediaNavDarkText,
  },
  mediaNavArrowLight: {
    color: colors.onAccent,
  },
  mediaDotsWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    zIndex: layers.mediaControl,
  },
  mediaDots: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: cardDetail.mediaDotsGap,
    paddingHorizontal: spacing.md,
    paddingVertical: cardDetail.mediaDotsPaddingVertical,
    borderRadius: radii.pill,
    backgroundColor: colors.mediaDotsBg,
  },
  mediaDot: {
    width: cardDetail.mediaDotSize,
    height: cardDetail.mediaDotSize,
    borderRadius: radii.pill,
    backgroundColor: colors.mediaDotBg,
  },
  mediaDotButton: {
    width: cardDetail.mediaDotHitSize,
    height: cardDetail.mediaDotHitSize,
    borderRadius: radii.pill,
    backgroundColor: colors.transparent,
  },
  mediaDotActive: {
    width: cardDetail.mediaDotActiveWidth,
    borderRadius: radii.pill,
    backgroundColor: colors.onAccent,
  },
  contentScroll: {
    flex: 1,
    minHeight: spacing.none,
  },
  contentZone: {
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    borderTopWidth: borders.hairline,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  contentTextOnly: {
    borderTopWidth: borders.none,
    paddingTop: spacing.xl,
  },
  bodyText: {
    gap: spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  linkBody: { gap: spacing.xs },
  linkTitle: { ...typography.subtitle, color: colors.text },
  linkDesc: { ...typography.body, color: colors.textMuted },
  contentRich: { gap: spacing.sm },
  contentTitle: { ...typography.body, color: colors.text, fontWeight: "700" },
  content: { ...typography.body, color: colors.text },
  fileList: { gap: spacing.sm },
  fileBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.btn,
    backgroundColor: colors.surface,
    borderWidth: borders.hairline,
    borderColor: colors.border,
  },
  fileIcon: { ...typography.micro, color: colors.accent },
  fileInfo: { flex: 1, gap: spacing.xxs },
  fileName: { ...typography.label, color: colors.text },
  fileMeta: { ...typography.micro, color: colors.textFaint },
  externalLinkBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  externalLinkText: { ...typography.label, color: colors.accentTintedText },
  rail: {
    borderTopWidth: borders.hairline,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  railStacked: {
    flex: 0,
    minHeight: spacing.none,
  },
  railStackedMediaOnly: {
    maxHeight: "34%",
  },
  railContent: {
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  railWide: {
    flex: 0,
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: cardDetail.railWidth,
    width: cardDetail.railWidth,
    maxWidth: cardDetail.railWidth,
    borderTopWidth: borders.none,
    borderLeftWidth: borders.hairline,
    borderLeftColor: colors.border,
  },
  railSection: {
    gap: spacing.sm,
  },
  metaSection: {
    minHeight: cardDetail.metaMinHeight,
    justifyContent: "center",
  },
  metaLine: { ...typography.micro, color: colors.textMuted },
  engagementPanel: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: borders.hairline,
    borderTopColor: colors.border,
  },
  engagementLikeRow: {
    minHeight: cardDetail.engagementLikeMinHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  likeButton: {
    minHeight: cardDetail.likeButtonMinHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: cardDetail.mediaDotsGap,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  likeButtonLiked: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerTintedBg,
  },
  likeIcon: {
    ...typography.subtitle,
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
    gap: cardDetail.mediaDotsGap,
  },
  commentInput: {
    minHeight: cardDetail.commentInputMinHeight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    textAlignVertical: "top",
  },
  commentSubmit: {
    alignSelf: "flex-end",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
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
    gap: spacing.md,
  },
  commentItem: {
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.btn,
    backgroundColor: colors.surfaceAlt,
  },
  commentHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
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
    paddingHorizontal: cardDetail.mediaDotsGap,
    paddingVertical: spacing.xs,
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
    backgroundColor: colors.lightboxOverlay,
    alignItems: "center",
    justifyContent: "center",
  },
  lightboxBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  lightboxImage: {
    width: cardDetail.lightboxImageWidth,
    height: cardDetail.lightboxImageHeight,
  },
  lightboxClose: {
    position: "absolute",
    top: spacing.xxl,
    right: spacing.xxl,
    width: cardDetail.iconButtonSize,
    height: cardDetail.iconButtonSize,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.lightboxControlBg,
  },
  lightboxCloseText: {
    color: colors.onAccent,
    ...typography.section,
    fontWeight: "700",
  },
  lightboxNav: {
    position: "absolute",
    top: "50%",
    width: cardDetail.lightboxNavWidth,
    height: cardDetail.lightboxNavHeight,
    marginTop: cardDetail.lightboxNavHalfHeight,
    borderRadius: radii.btn,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.lightboxControlSoftBg,
  },
  lightboxNavPrev: {
    left: spacing.xxl,
  },
  lightboxNavNext: {
    right: spacing.xxl,
  },
  lightboxNavText: {
    color: colors.onAccent,
    ...typography.display,
  },
  lightboxCounter: {
    position: "absolute",
    bottom: spacing.xxl,
    alignSelf: "center",
    color: colors.onAccent,
    ...typography.label,
  },
});
