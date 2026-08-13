export type ReadingComposerBookType = "comic" | "story";

export type ReadingComposerDraft = {
  bookType: ReadingComposerBookType;
  title: string;
  author: string;
  reflection: string;
};

export type ReadingComposerField = "title" | "author" | "reflection";

export const EMPTY_READING_COMPOSER_DRAFT: ReadingComposerDraft = {
  bookType: "story",
  title: "",
  author: "",
  reflection: "",
};

/** Bump whenever native inputs must resync to React draft state. */
export function nextReadingComposerInstanceId(current: number): number {
  return current + 1;
}

export function readingComposerFieldKeys(instanceId: number) {
  return {
    title: `reading-composer-title-${instanceId}`,
    author: `reading-composer-author-${instanceId}`,
    reflection: `reading-composer-reflection-${instanceId}`,
  } as const;
}

/**
 * Presentation for the reading-record composer modal.
 * Draft values are preserved across close/reopen; field keys must change on
 * open and programmatic clear so RN TextInputs remount instead of keeping
 * stale native text after React state clears.
 */
export function presentReadingComposerDraft(
  draft: ReadingComposerDraft,
  instanceId: number,
) {
  return {
    draft,
    fieldKeys: readingComposerFieldKeys(instanceId),
  };
}
