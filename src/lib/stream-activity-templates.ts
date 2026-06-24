export const STREAM_ACTIVITY_TEMPLATES = [
  "window_opening",
  "word_cloud",
  "map",
  "timeline",
] as const;

export type StreamActivityTemplate = (typeof STREAM_ACTIVITY_TEMPLATES)[number];

export type StreamActivityTemplateState = {
  wordCloudPublished?: boolean;
  activityTemplateOrder?: number;
};

export const STREAM_ACTIVITY_TEMPLATE_LABELS: Record<StreamActivityTemplate, string> = {
  window_opening: "창문 열기",
  word_cloud: "워드클라우드",
  map: "지도",
  timeline: "연표",
};

export function isStreamActivityTemplate(
  value: string | null | undefined,
): value is StreamActivityTemplate {
  return STREAM_ACTIVITY_TEMPLATES.includes(value as StreamActivityTemplate);
}

export function normalizeStreamActivityTemplateState(
  value: unknown,
): StreamActivityTemplateState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const row = value as Record<string, unknown>;
  return {
    wordCloudPublished:
      typeof row.wordCloudPublished === "boolean"
        ? row.wordCloudPublished
        : undefined,
    activityTemplateOrder:
      typeof row.activityTemplateOrder === "number" &&
      Number.isFinite(row.activityTemplateOrder)
        ? row.activityTemplateOrder
        : undefined,
  };
}
