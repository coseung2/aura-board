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
import type { CardData } from "../DraggableCard";
import { StreamSlideshowOverlay } from "./StreamSlideshowOverlay";

export type SlideshowSlide = {
  id: string;
  kind?: "card" | "section";
  card?: CardData;
  sectionId?: string | null;
  sectionTitle?: string;
};

type SlideshowContextValue = {
  registerSlides: (sourceId: string, slides: SlideshowSlide[]) => void;
  unregisterSlides: (sourceId: string) => void;
  openSlideshow: (sourceId?: string) => void;
  closeSlideshow: () => void;
  canOpen: boolean;
};

// Default no-op context so consumers rendered outside the provider (e.g.
// the forbidden-access BoardHeader) don't throw and simply see canOpen=false.
const defaultContext: SlideshowContextValue = {
  registerSlides: () => {},
  unregisterSlides: () => {},
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
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState(false);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);

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

  const closeSlideshow = useCallback(() => {
    setOpen(false);
    setActiveSourceId(null);
    setIndex(0);
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
    setActiveSourceId(targetId);
    setIndex(0);
    setOpen(true);
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
    return sourcesRef.current.get(activeSourceId) ?? [];
  }, [activeSourceId, version]);

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
      openSlideshow,
      closeSlideshow,
      canOpen,
    }),
    [
      registerSlides,
      unregisterSlides,
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
    </SlideshowContext.Provider>
  );
}
