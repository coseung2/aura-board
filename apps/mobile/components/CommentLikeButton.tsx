import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text } from "react-native";
import { Heart } from "lucide-react-native";
import { ApiError, apiFetch } from "../lib/api";
import {
  colors,
  iconSizes,
  states,
  typography,
} from "../theme/tokens";

type Props = {
  cardId: string;
  commentId: string;
  likeCount?: number;
  isLiked?: boolean;
  onUnauthorized?: (error: unknown) => Promise<boolean>;
  onChanged?: (state: { likeCount: number; isLiked: boolean }) => void;
};

export function CommentLikeButton({
  cardId,
  commentId,
  likeCount: initialLikeCount,
  isLiked: initialIsLiked,
  onUnauthorized,
  onChanged,
}: Props) {
  const [likeCount, setLikeCount] = useState(Math.max(0, initialLikeCount ?? 0));
  const [liked, setLiked] = useState(Boolean(initialIsLiked));
  const [busy, setBusy] = useState(false);
  const pulse = useRef(new Animated.Value(1)).current;
  const countTranslate = useRef(new Animated.Value(0)).current;
  const countOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (busy) return;
    setLikeCount(Math.max(0, initialLikeCount ?? 0));
    setLiked(Boolean(initialIsLiked));
  }, [busy, initialIsLiked, initialLikeCount]);

  function animateChange() {
    pulse.setValue(1);
    countTranslate.setValue(6);
    countOpacity.setValue(0);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.28,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.spring(pulse, {
          toValue: 1,
          friction: 5,
          tension: 180,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(countTranslate, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(countOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }

  async function toggleLike() {
    if (busy) return;
    const previous = { likeCount, liked };
    const nextLiked = !liked;
    const nextCount = Math.max(0, likeCount + (nextLiked ? 1 : -1));
    setBusy(true);
    setLiked(nextLiked);
    setLikeCount(nextCount);
    onChanged?.({ likeCount: nextCount, isLiked: nextLiked });
    animateChange();

    try {
      const response = await apiFetch<{ liked: boolean; count: number }>(
        `/api/cards/${encodeURIComponent(cardId)}/comments/${encodeURIComponent(commentId)}/like`,
        { method: "POST", json: { liked: nextLiked } },
      );
      const nextState = {
        likeCount: Math.max(0, response.count),
        isLiked: response.liked,
      };
      setLiked(nextState.isLiked);
      setLikeCount(nextState.likeCount);
      onChanged?.(nextState);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        if (await onUnauthorized?.(error)) {
          setLiked(previous.liked);
          setLikeCount(previous.likeCount);
          onChanged?.({ likeCount: previous.likeCount, isLiked: previous.liked });
          return;
        }
      }
      setLiked(previous.liked);
      setLikeCount(previous.likeCount);
      onChanged?.({ likeCount: previous.likeCount, isLiked: previous.liked });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable
      android_ripple={{ color: colors.transparent }}
      style={({ pressed }) => [
        styles.button,
        pressed && !busy && styles.buttonPressed,
      ]}
      onPress={() => void toggleLike()}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={liked ? `댓글 좋아요 ${likeCount}, 취소` : `댓글 좋아요 ${likeCount}`}
      accessibilityState={{ selected: liked, busy }}
    >
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <Heart
          size={iconSizes.sm}
          color={liked ? colors.danger : colors.textMuted}
          fill={liked ? colors.danger : colors.transparent}
          strokeWidth={1.75}
          accessible={false}
        />
      </Animated.View>
      <Animated.View
        style={{
          opacity: countOpacity,
          transform: [{ translateY: countTranslate }],
        }}
      >
        <Text style={[styles.count, liked && styles.countActive]}>{likeCount}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: { opacity: states.pressedOpacity },
  count: { ...typography.micro, color: colors.textMuted },
  countActive: { color: colors.danger },
});
