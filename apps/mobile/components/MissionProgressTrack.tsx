import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import type { WalkingRepresentativeSlime } from "../lib/walking-health";
import { evolutionForStage } from "../lib/slimes";
import {
  borders,
  colors,
  layers,
  spacing,
  walking,
} from "../theme/tokens";
import { SlimeSprite } from "./slime/SlimeSprite";

type MissionProgressTrackProps = {
  value: number;
  max: number;
  markerValues: readonly number[];
  completedMarkerValues?: readonly number[];
  accessibilityLabel: string;
  representativeSlime: WalkingRepresentativeSlime | null;
};

/**
 * Shared mission graph for walking and reading progress.
 *
 * Callers provide semantic boundary values. The graph owns normalization so a
 * repeated target cannot create doubled lines and the final boundary remains
 * visible at the right edge.
 */
export function MissionProgressTrack({
  value,
  max,
  markerValues,
  completedMarkerValues = [],
  accessibilityLabel,
  representativeSlime,
}: MissionProgressTrackProps) {
  const safeMax = Math.max(1, max);
  const safeValue = Math.min(safeMax, Math.max(0, value));
  const progress = safeValue / safeMax;
  const trackHeight = walking.chartBarHeight;
  const markers = useMemo(
    () => Array.from(new Set(markerValues))
      .filter((marker) => Number.isFinite(marker) && marker > 0 && marker <= safeMax)
      .sort((left, right) => left - right),
    [markerValues, safeMax],
  );
  const completedMarkers = useMemo(
    () => new Set(completedMarkerValues),
    [completedMarkerValues],
  );
  const jumpOffset = useRef(new Animated.Value(0)).current;
  const slimeJumpStyle = useMemo(
    () => ({ transform: [{ translateY: jumpOffset }] }),
    [jumpOffset],
  );

  useEffect(() => {
    if (!representativeSlime) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(jumpOffset, {
          toValue: walking.missionSlimeJumpOffset,
          duration: 360,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(jumpOffset, {
          toValue: 0,
          duration: 360,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [jumpOffset, representativeSlime]);

  return (
    <View
      style={[styles.layer, { height: trackHeight }]}
    >
      {representativeSlime ? (
        <View
          pointerEvents="none"
          accessible={false}
          style={[
            styles.slimeMarker,
            {
              left: `${progress * 100}%`,
              top: trackHeight - walking.missionSlimeFootOffset,
            },
          ]}
        >
          <Animated.View style={slimeJumpStyle}>
            <View style={styles.slimeScale}>
              <SlimeSprite
                slimeColor={representativeSlime.color}
                evolution={evolutionForStage(representativeSlime.growthStage)}
                equippedFloor="none"
                displayScale={0.25}
              />
            </View>
          </Animated.View>
        </View>
      ) : null}
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min: 0, max: safeMax, now: safeValue }}
        style={[styles.track, { height: trackHeight }]}
      >
        <View
          style={[styles.fill, { width: `${progress * 100}%` }]}
        />
        {markers.map((marker) => {
          const isFinalBoundary = marker === safeMax;
          const percentage = (marker / safeMax) * 100;
          return (
            <View
              key={marker}
              pointerEvents="none"
              style={[
                styles.marker,
                isFinalBoundary
                  ? styles.finalMarker
                  : { left: `${percentage}%` },
                completedMarkers.has(marker) && styles.completedMarker,
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: "relative",
  },
  track: {
    backgroundColor: colors.accentTintedBg,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    backgroundColor: colors.accent,
  },
  marker: {
    position: "absolute",
    top: spacing.none,
    bottom: spacing.none,
    width: borders.hairline,
    backgroundColor: colors.textMuted,
  },
  finalMarker: {
    right: spacing.none,
  },
  completedMarker: {
    backgroundColor: colors.accentTintedText,
  },
  slimeMarker: {
    position: "absolute",
    marginLeft: -(walking.missionSlimeLayoutSize / 2),
    zIndex: layers.badge,
  },
  slimeScale: {
    transform: [{ scale: walking.missionSlimeScale }],
  },
});
