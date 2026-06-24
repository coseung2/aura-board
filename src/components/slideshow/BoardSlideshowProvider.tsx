"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { CardData } from "../DraggableCard";
import type {
  StreamActivityTemplate,
  StreamActivityTemplateState,
} from "@/lib/stream-activity-templates";
import { StreamSlideshowOverlay } from "./StreamSlideshowOverlay";

export type SlideshowSlide = {
  id: string;
  kind?: "card" | "section" | "activity";
  card?: CardData;
  cards?: CardData[];
  sectionId?: string | null;
  sectionTitle?: string;
  activityTemplate?: StreamActivityTemplate;
  activityTemplateState?: StreamActivityTemplateState | null;
};

export type SlideshowGroupOption = {
  groupId: string;
  name: string;
  memberStudentIds?: string[];
};

export type SlideshowSectionOption = {
  sectionId: string;
  title: string;
  groups: SlideshowGroupOption[];
};

type SlideshowContextValue = {
  registerSlides: (sourceId: string, slides: SlideshowSlide[]) => void;
  unregisterSlides: (sourceId: string) => void;
  setSectionOptions: (
    sourceId: string,
    options: SlideshowSectionOption[],
  ) => void;
  openSlideshow: (sourceId?: string) => void;
  closeSlideshow: () => void;
  canOpen: boolean;
};

// Default no-op context so consumers rendered outside the provider (e.g.
// the forbidden-access BoardHeader) don't throw and simply see canOpen=false.
const defaultContext: SlideshowContextValue = {
  registerSlides: () => {},
  unregisterSlides: () => {},
  setSectionOptions: () => {},
  openSlideshow: () => {},
  closeSlideshow: () => {},
  canOpen: false,
};

const SlideshowContext = createContext<SlideshowContextValue>(defaultContext);

export function useBoardSlideshow(): SlideshowContextValue {
  return useContext(SlideshowContext);
}

export function BoardSlideshowProvider({ children }: { children: ReactNode }) {
  // sourceId -> slides. Held in a ref to keep register calls cheap; a
  // version counter triggers re-renders when the registry content changes.
  const sourcesRef = useRef<Map<string, SlideshowSlide[]>>(new Map());
  const sectionOptionsRef = useRef<
    Map<string, SlideshowSectionOption[]>
  >(new Map());
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState(false);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [pendingPrompt, setPendingPrompt] = useState<{
    sourceId: string;
    sections: SlideshowSectionOption[];
  } | null>(null);
  const [presentationGroupBySection, setPresentationGroupBySection] = useState<
    Record<string, string>
  >({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const registerSlides = useCallback(
    (sourceId: string, slides: SlideshowSlide[]) => {
      sourcesRef.current.set(sourceId, slides);
      setVersion((v) => v + 1);
    },
    [],
  );

  const unregisterSlides = useCallback((sourceId: string) => {
    sourcesRef.current.delete(sourceId);
    setVersion((v) => v + 1);
  }, []);

  const setSectionOptions = useCallback(
    (sourceId: string, options: SlideshowSectionOption[]) => {
      sectionOptionsRef.current.set(sourceId, options);
      setVersion((v) => v + 1);
    },
    [],
  );

  const closeSlideshow = useCallback(() => {
    setOpen(false);
    setActiveSourceId(null);
    setIndex(0);
    setPresentationGroupBySection({});
  }, []);

  const openSlideshow = useCallback((sourceId?: string) => {
    const sources = sourcesRef.current;
    let targetId = sourceId;
    if (!targetId) {
      // Pick the first registered source with slides.
      for (const id of sources.keys()) {
        const slides = sources.get(id);
        if (slides && slides.length > 0) {
          targetId = id;
          break;
        }
      }
    }
    if (!targetId) return;
    const slides = sources.get(targetId);
    if (!slides || slides.length === 0) return;
    const sectionOptions = sectionOptionsRef.current.get(targetId) ?? [];
    if (sectionOptions.length > 0) {
      setActiveSourceId(targetId);
      setIndex(0);
      setPendingPrompt({ sourceId: targetId, sections: sectionOptions });
      return;
    }
    setActiveSourceId(targetId);
    setPresentationGroupBySection({});
    setIndex(0);
    setOpen(true);
  }, []);

  const confirmPrompt = useCallback((groupBySection: Record<string, string>) => {
    setPresentationGroupBySection(groupBySection);
    setPendingPrompt(null);
    setIndex(0);
    setOpen(true);
  }, []);

  const cancelPrompt = useCallback(() => {
    setPendingPrompt(null);
    setActiveSourceId(null);
    setPresentationGroupBySection({});
  }, []);

  // Touch version so memo deps recompute when the registry mutates.
  void version;

  const canOpen = useMemo(() => {
    void version;
    for (const slides of sourcesRef.current.values()) {
      if (slides.length > 0) return true;
    }
    return false;
  }, [version]);

  const activeSlides = useMemo(() => {
    void version;
    if (!activeSourceId) return [];
    const slides = sourcesRef.current.get(activeSourceId) ?? [];
    const options = sectionOptionsRef.current.get(activeSourceId) ?? [];
    if (options.length === 0) return slides;
    return applyPresentationFilter(
      slides,
      presentationGroupBySection,
      options,
    );
  }, [activeSourceId, presentationGroupBySection, version]);

  // Clamp index when the active slide list shrinks (realtime deletion).
  // If every slide disappears while open, close the overlay.
  useEffect(() => {
    if (!open) return;
    if (activeSlides.length === 0) {
      closeSlideshow();
      return;
    }
    if (index >= activeSlides.length) {
      setIndex(Math.max(0, activeSlides.length - 1));
    }
  }, [open, activeSlides.length, index, closeSlideshow]);

  const value = useMemo<SlideshowContextValue>(
    () => ({
      registerSlides,
      unregisterSlides,
      setSectionOptions,
      openSlideshow,
      closeSlideshow,
      canOpen,
    }),
    [
      registerSlides,
      unregisterSlides,
      setSectionOptions,
      openSlideshow,
      closeSlideshow,
      canOpen,
    ],
  );

  return (
    <SlideshowContext.Provider value={value}>
      {children}
      {open && activeSlides.length > 0 && (
        <StreamSlideshowOverlay
          slides={activeSlides}
          index={Math.min(index, activeSlides.length - 1)}
          onIndexChange={setIndex}
          onClose={closeSlideshow}
        />
      )}
      {mounted && pendingPrompt &&
        createPortal(
          <PresentationGroupPrompt
            sections={pendingPrompt.sections}
            presentationGroupBySection={presentationGroupBySection}
            onConfirm={confirmPrompt}
            onCancel={cancelPrompt}
          />,
          document.body,
        )}
    </SlideshowContext.Provider>
  );
}

function applyPresentationFilter(
  slides: SlideshowSlide[],
  groupBySection: Record<string, string>,
  options: SlideshowSectionOption[],
): SlideshowSlide[] {
  if (options.length === 0) return slides;
  const optionsById = new Map(options.map((o) => [o.sectionId, o]));
  const result: SlideshowSlide[] = [];
  for (const slide of slides) {
    const option = slide.sectionId
      ? optionsById.get(slide.sectionId)
      : undefined;
    if (!option || option.groups.length === 0) {
      result.push(slide);
      continue;
    }
    const chosen = groupBySection[option.sectionId];
    if (!chosen) {
      result.push(slide);
      continue;
    }
    if (slide.kind === "activity") {
      const filtered = (slide.cards ?? []).filter(
        (card) => cardBelongsToPresentationGroup(card, chosen, option),
      );
      if (filtered.length === 0) continue;
      result.push({ ...slide, cards: filtered });
      continue;
    }
    if (slide.kind === "card" && slide.card) {
      if (!cardBelongsToPresentationGroup(slide.card, chosen, option)) continue;
      result.push(slide);
      continue;
    }
    result.push(slide);
  }
  return result;
}

function cardBelongsToPresentationGroup(
  card: CardData,
  groupId: string,
  option: SlideshowSectionOption,
): boolean {
  if ((card.groupId ?? null) === groupId) return true;
  const group = option.groups.find((item) => item.groupId === groupId);
  const memberIds = new Set(group?.memberStudentIds ?? []);
  if (memberIds.size === 0) return false;
  if (card.studentAuthorId && memberIds.has(card.studentAuthorId)) return true;
  return (card.authors ?? []).some(
    (author) => author.studentId && memberIds.has(author.studentId),
  );
}

function PresentationGroupPrompt({
  sections,
  presentationGroupBySection,
  onConfirm,
  onCancel,
}: {
  sections: SlideshowSectionOption[];
  presentationGroupBySection: Record<string, string>;
  onConfirm: (groupBySection: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const firstGroups = sections[0]?.groups ?? [];
  const initialBaseGroupId =
    presentationGroupBySection[sections[0]?.sectionId ?? ""] ??
    firstGroups[0]?.groupId ??
    "";
  const [baseGroupId, setBaseGroupId] = useState(initialBaseGroupId);
  const [useSectionChoices, setUseSectionChoices] = useState(false);
  const baseGroupIndex = Math.max(
    0,
    firstGroups.findIndex((group) => group.groupId === baseGroupId),
  );
  const [sectionGroupBySection, setSectionGroupBySection] = useState<
    Record<string, string>
  >(() =>
    buildPresentationGroupSelection(
      sections,
      baseGroupIndex,
      presentationGroupBySection,
    ),
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const titleText = "발표 모둠 선택";
  const cancelText = "취소";
  const confirmText = "실행";

  function submit() {
    const groupBySection = useSectionChoices
      ? buildPresentationGroupSelection(
          sections,
          baseGroupIndex,
          sectionGroupBySection,
        )
      : buildPresentationGroupSelection(sections, baseGroupIndex);
    onConfirm(groupBySection);
  }

  function toggleSectionChoices() {
    setUseSectionChoices((current) => {
      const next = !current;
      if (next) {
        setSectionGroupBySection(
          buildPresentationGroupSelection(sections, baseGroupIndex),
        );
      }
      return next;
    });
  }

  return (
    <>
      <div
        className="presentation-prompt-backdrop"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        className="presentation-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="presentation-prompt-title"
      >
        <header className="presentation-prompt-head">
          <h2 id="presentation-prompt-title">{titleText}</h2>
        </header>
        <div className="presentation-prompt-list">
          <div className="presentation-prompt-section">
            <span className="presentation-prompt-section-title">
              발표할 모둠
            </span>
            <div className="presentation-prompt-groups" role="radiogroup">
              {firstGroups.map((group) => (
                <button
                  key={group.groupId}
                  type="button"
                  role="radio"
                  aria-checked={baseGroupId === group.groupId}
                  className={`presentation-prompt-group${
                    baseGroupId === group.groupId ? " is-active" : ""
                  }`}
                  onClick={() => setBaseGroupId(group.groupId)}
                >
                  {group.name}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="presentation-prompt-toggle"
            aria-expanded={useSectionChoices}
            onClick={toggleSectionChoices}
          >
            {useSectionChoices ? "섹션별 선택 접기" : "섹션별로 다르게 선택"}
          </button>
          {useSectionChoices &&
            sections.map((section) => {
              const chosen =
                sectionGroupBySection[section.sectionId] ??
                section.groups[baseGroupIndex]?.groupId ??
                section.groups[0]?.groupId;
              return (
                <div
                  className="presentation-prompt-section"
                  key={section.sectionId}
                >
                  <span className="presentation-prompt-section-title">
                    {section.title}
                  </span>
                  <div
                    className="presentation-prompt-groups"
                    role="radiogroup"
                  >
                    {section.groups.map((group) => (
                      <button
                        key={group.groupId}
                        type="button"
                        role="radio"
                        aria-checked={chosen === group.groupId}
                        className={`presentation-prompt-group${
                          chosen === group.groupId ? " is-active" : ""
                        }`}
                        onClick={() =>
                          setSectionGroupBySection((current) => ({
                            ...current,
                            [section.sectionId]: group.groupId,
                          }))
                        }
                      >
                        {group.name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
        <footer className="presentation-prompt-actions">
          <button type="button" className="ui-icon-action" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            type="button"
            className="ui-icon-action is-accent"
            onClick={submit}
          >
            {confirmText}
          </button>
        </footer>
      </div>
    </>
  );
}

function buildPresentationGroupSelection(
  sections: SlideshowSectionOption[],
  baseGroupIndex: number,
  overrides: Record<string, string> = {},
): Record<string, string> {
  const selection: Record<string, string> = {};
  for (const section of sections) {
    selection[section.sectionId] =
      overrides[section.sectionId] ??
      section.groups[baseGroupIndex]?.groupId ??
      section.groups[0]?.groupId ??
      "";
  }
  return selection;
}
