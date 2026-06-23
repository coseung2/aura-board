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

  const chooseGroupForSection = useCallback(
    (sectionId: string, groupId: string) => {
      setPresentationGroupBySection((prev) => ({ ...prev, [sectionId]: groupId }));
    },
    [],
  );

  const confirmPrompt = useCallback(() => {
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
            onChoose={chooseGroupForSection}
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
        (card) => (card.groupId ?? null) === chosen,
      );
      if (filtered.length === 0) continue;
      result.push({ ...slide, cards: filtered });
      continue;
    }
    if (slide.kind === "card" && slide.card) {
      if ((slide.card.groupId ?? null) !== chosen) continue;
      result.push(slide);
      continue;
    }
    result.push(slide);
  }
  const seenNoticeFor = new Set<string>();
  for (let i = 0; i < result.length; i += 1) {
    const slide = result[i];
    if (slide.kind !== "section" || !slide.sectionId) continue;
    const option = optionsById.get(slide.sectionId);
    if (!option || option.groups.length === 0) continue;
    const chosen = groupBySection[option.sectionId];
    if (!chosen || seenNoticeFor.has(option.sectionId)) continue;
    const hasContent = result.some(
      (s, idx) =>
        idx > i &&
        s.sectionId === option.sectionId &&
        (s.kind === "card" || s.kind === "activity"),
    );
    if (!hasContent) {
      seenNoticeFor.add(option.sectionId);
      const groupName =
        option.groups.find((g) => g.groupId === chosen)?.name ??
        "selected group";
      result.splice(i + 1, 0, {
        id: `notice:${option.sectionId}:${chosen}`,
        kind: "section",
        sectionId: option.sectionId,
        sectionTitle: `${option.title} - ${groupName} (no posts)`,
      });
    }
  }
  return result;
}

function PresentationGroupPrompt({
  sections,
  presentationGroupBySection,
  onChoose,
  onConfirm,
  onCancel,
}: {
  sections: SlideshowSectionOption[];
  presentationGroupBySection: Record<string, string>;
  onChoose: (sectionId: string, groupId: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const titleText = "\ubc1c\ud45c \ubaa8\ub4e0 \uc120\ud0dd";
  const descriptionText =
    "\ubaa8\ub4e0\ud65c\ub3d9 \uc139\uc158\uc740 \uc120\ud0dd\ud55c \ubaa8\ub4e0\uc73c\ub85c \ud45c\uc2dc\ub429\ub2c8\ub2e4. \ubc1c\ud45c\ud560 \ubaa8\ub4e0\uc744 \uace8\ub77c \uc11c\ub974\uac8c \ud45c\uc2dc\ud560 \uac83\uc785\ub2c8\uae4c?";
  const cancelText = "\ucde8\uc18c";
  const confirmText = "\uc2e4\ud589";

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
          <p>{descriptionText}</p>
        </header>
        <div className="presentation-prompt-list">
          {sections.map((section) => {
            const chosen =
              presentationGroupBySection[section.sectionId] ??
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
                      onClick={() => onChoose(section.sectionId, group.groupId)}
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
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </footer>
      </div>
    </>
  );
}
