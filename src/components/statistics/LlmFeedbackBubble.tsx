"use client";

export function LlmFeedbackBubble({
  feedback,
  loading,
}: {
  feedback: string;
  loading?: boolean;
}) {
  return (
    <div className="llm-feedback-bubble">
      {loading ? (
        "AI가 생각 중..."
      ) : (
        <span role="status" aria-live="polite">
          {feedback}
        </span>
      )}
    </div>
  );
}
