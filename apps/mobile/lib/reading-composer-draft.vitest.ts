import { describe, expect, it } from "vitest";
import {
  EMPTY_READING_COMPOSER_DRAFT,
  nextReadingComposerInstanceId,
  presentReadingComposerDraft,
  readingComposerFieldKeys,
} from "./reading-composer-draft";

describe("reading composer draft presentation", () => {
  it("preserves unfinished draft text across reopen while remounting fields", () => {
    let instanceId = 0;
    const draft = {
      bookType: "comic" as const,
      title: "진행 중 제목",
      author: "지은이",
      reflection: "아직 쓰는 중",
    };

    instanceId = nextReadingComposerInstanceId(instanceId);
    const firstOpen = presentReadingComposerDraft(draft, instanceId);

    // Close without clearing; draft state stays in the parent model.
    instanceId = nextReadingComposerInstanceId(instanceId);
    const secondOpen = presentReadingComposerDraft(draft, instanceId);

    expect(secondOpen.draft).toEqual(draft);
    expect(secondOpen.fieldKeys.title).not.toBe(firstOpen.fieldKeys.title);
    expect(secondOpen.fieldKeys.author).not.toBe(firstOpen.fieldKeys.author);
    expect(secondOpen.fieldKeys.reflection).not.toBe(
      firstOpen.fieldKeys.reflection,
    );
  });

  it("forces new field keys after clear so reopened inputs cannot keep stale text", () => {
    let instanceId = 0;
    let draft: {
      bookType: "comic" | "story";
      title: string;
      author: string;
      reflection: string;
    } = {
      bookType: "story",
      title: "저장 전 제목",
      author: "작가",
      reflection: "오래된 감상",
    };

    instanceId = nextReadingComposerInstanceId(instanceId);
    const opened = presentReadingComposerDraft(draft, instanceId);
    const staleKeys = opened.fieldKeys;

    // Successful save (or explicit clear) empties the draft before reopen.
    draft = { ...EMPTY_READING_COMPOSER_DRAFT };
    instanceId = nextReadingComposerInstanceId(instanceId);
    const cleared = presentReadingComposerDraft(draft, instanceId);

    expect(cleared.draft).toEqual(EMPTY_READING_COMPOSER_DRAFT);
    expect(cleared.fieldKeys.title).not.toBe(staleKeys.title);
    expect(cleared.fieldKeys.author).not.toBe(staleKeys.author);
    expect(cleared.fieldKeys.reflection).not.toBe(staleKeys.reflection);

    // Re-entry with empty draft must present empty values under a fresh remount key.
    instanceId = nextReadingComposerInstanceId(instanceId);
    const reopened = presentReadingComposerDraft(draft, instanceId);

    expect(reopened.draft.title).toBe("");
    expect(reopened.draft.author).toBe("");
    expect(reopened.draft.reflection).toBe("");
    expect(reopened.fieldKeys).toEqual(readingComposerFieldKeys(instanceId));
    expect(reopened.fieldKeys.title).not.toBe(cleared.fieldKeys.title);
  });
});
