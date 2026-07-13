import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  borders,
  colors,
  controls,
  radii,
  spacing,
  tapMin,
  typography,
} from "../theme/tokens";
import { ControlPressable, SurfaceCard, TextField } from "./ui";

export type OverviewMetric = {
  label: string;
  value: string | number;
  tone?: "default" | "accent" | "danger";
};

export type FilterOption<T extends string> = {
  value: T;
  label: string;
  count?: number;
};

export function BoardSummaryStrip({
  title,
  description,
  metrics,
}: {
  title: string;
  description?: string;
  metrics: OverviewMetric[];
}) {
  return (
    <SurfaceCard style={styles.summaryCard}>
      <View style={styles.summaryHeading}>
        <Text style={styles.summaryTitle}>{title}</Text>
        {description ? (
          <Text style={styles.summaryDescription}>{description}</Text>
        ) : null}
      </View>
      <View style={styles.metricRow}>
        {metrics.map((metric, index) => (
          <View
            key={metric.label}
            style={[styles.metric, index > 0 && styles.metricBorder]}
          >
            <Text
              style={[
                styles.metricValue,
                metric.tone === "accent" && styles.metricValueAccent,
                metric.tone === "danger" && styles.metricValueDanger,
              ]}
            >
              {metric.value}
            </Text>
            <Text style={styles.metricLabel} numberOfLines={1}>
              {metric.label}
            </Text>
          </View>
        ))}
      </View>
    </SurfaceCard>
  );
}

export function MobileFilterBar<T extends string>({
  query,
  onQueryChange,
  queryPlaceholder = "검색",
  options,
  value,
  onChange,
  trailing,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  queryPlaceholder?: string;
  options: FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  trailing?: ReactNode;
}) {
  return (
    <View style={styles.controls}>
      <View style={styles.searchRow}>
        <TextField
          value={query}
          onChangeText={onQueryChange}
          placeholder={queryPlaceholder}
          returnKeyType="search"
          autoCorrect={false}
          style={styles.searchInput}
          accessibilityLabel={queryPlaceholder}
        />
        {trailing}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <ControlPressable
              key={option.value}
              style={[styles.filterChip, active && styles.filterChipActive]}
              hitSlop={{ top: spacing.xs, bottom: spacing.xs }}
              onPress={() => onChange(option.value)}
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[
                  styles.filterText,
                  active && styles.filterTextActive,
                ]}
                numberOfLines={1}
              >
                {option.label}
                {option.count !== undefined ? ` ${option.count}` : ""}
              </Text>
            </ControlPressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function MobileViewToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.viewToggle} accessibilityRole="tablist">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <ControlPressable
            key={option.value}
            style={[
              styles.viewToggleButton,
              active && styles.viewToggleButtonActive,
            ]}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text
              style={[
                styles.viewToggleText,
                active && styles.viewToggleTextActive,
              ]}
            >
              {option.label}
            </Text>
          </ControlPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  summaryCard: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  summaryHeading: {
    gap: spacing.xs,
  },
  summaryTitle: {
    ...typography.section,
    color: colors.text,
  },
  summaryDescription: {
    ...typography.micro,
    color: colors.textMuted,
  },
  metricRow: {
    flexDirection: "row",
    alignItems: "stretch",
    borderTopWidth: borders.hairline,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  metric: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    minWidth: spacing.none,
  },
  metricBorder: {
    borderLeftWidth: borders.hairline,
    borderLeftColor: colors.border,
  },
  metricValue: {
    ...typography.subtitle,
    color: colors.text,
  },
  metricValueAccent: {
    color: colors.accentTintedText,
  },
  metricValueDanger: {
    color: colors.danger,
  },
  metricLabel: {
    ...typography.micro,
    color: colors.textMuted,
  },
  controls: {
    gap: spacing.sm,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
  },
  filterRow: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  filterChip: {
    minHeight: controls.compactChipHeight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    justifyContent: "center",
  },
  filterChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentTintedBg,
  },
  filterText: {
    ...typography.badge,
    color: colors.textMuted,
  },
  filterTextActive: {
    color: colors.accentTintedText,
  },
  viewToggle: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.control,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  viewToggleButton: {
    minHeight: tapMin,
    borderWidth: borders.none,
    borderRadius: radii.none,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.transparent,
  },
  viewToggleButtonActive: {
    backgroundColor: colors.accentTintedBg,
  },
  viewToggleText: {
    ...typography.micro,
    color: colors.textMuted,
  },
  viewToggleTextActive: {
    color: colors.accentTintedText,
  },
});
