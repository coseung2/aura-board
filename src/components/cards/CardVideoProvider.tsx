"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type CardVideoSource = {
  key: string;
  kind: "youtube" | "upload";
  src: string;
  youtubeId?: string | null;
  posterUrl?: string | null;
  title?: string | null;
};

type HostSurface = "thumbnail" | "detail";

type HostEntry = {
  sourceKey: string;
  element: HTMLElement;
  surface: HostSurface;
  order: number;
};

type CardVideoContextValue = {
  active: CardVideoSource | null;
  playing: boolean;
  play: (source: CardVideoSource) => void;
  stop: () => void;
  registerHost: (
    sourceKey: string,
    ownerKey: string,
    element: HTMLElement | null,
    surface: HostSurface,
  ) => void;
};

const CardVideoContext = createContext<CardVideoContextValue | null>(null);

/**
 * Returns the shared card video controller when the app is mounted under
 * CardVideoProvider. CardAttachments deliberately treats this as optional so
 * isolated previews and existing tests keep their local fallback behavior.
 */
export function useCardVideoPlayer(): CardVideoContextValue | null {
  return useContext(CardVideoContext);
}

/**
 * Owns one media DOM element for the entire app. The element is moved between
 * registered card/modal hosts imperatively, which keeps YouTube and HTML5
 * playback position intact during a card-detail handoff.
 */
export function CardVideoProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<CardVideoSource | null>(null);
  const [playing, setPlaying] = useState(false);
  const activeRef = useRef<CardVideoSource | null>(null);
  activeRef.current = active;
  const hostsRef = useRef<Map<string, HostEntry>>(new Map());
  const hostOrderRef = useRef(0);
  const [hostVersion, setHostVersion] = useState(0);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const mediaRef = useRef<HTMLIFrameElement | HTMLVideoElement | null>(null);
  const mediaKeyRef = useRef<string | null>(null);
  const mediaKindRef = useRef<CardVideoSource["kind"] | null>(null);

  const registerHost = useCallback(
    (
      sourceKey: string,
      ownerKey: string,
      element: HTMLElement | null,
      surface: HostSurface,
    ) => {
      const registrationKey = `${ownerKey}:${sourceKey}`;
      if (element) {
        hostsRef.current.set(registrationKey, {
          sourceKey,
          element,
          surface,
          order: ++hostOrderRef.current,
        });
      } else {
        hostsRef.current.delete(registrationKey);
      }
      setHostVersion((version) => version + 1);
    },
    [],
  );

  const activeHost = useMemo(() => {
    // hostVersion is intentionally read so registration/cleanup invalidates
    // the derived host even though the entries live in a ref.
    void hostVersion;
    if (!active) return null;
    let latest: HostEntry | null = null;
    for (const entry of hostsRef.current.values()) {
      if (!entry.element.isConnected) continue;
      if (entry.sourceKey !== active.key) continue;
      if (isPreferredHost(entry, latest)) latest = entry;
    }
    // The shared layer is nested inside the host, so it follows the host's
    // layout automatically even while a modal is animating from zero size.
    return latest;
  }, [active, hostVersion]);

  const play = useCallback((source: CardVideoSource) => {
    setActive(source);
    setPlaying(true);
  }, []);

  const stop = useCallback(() => {
    setActive(null);
    setPlaying(false);
  }, []);

  const value = useMemo<CardVideoContextValue>(
    () => ({ active, playing, play, stop, registerHost }),
    [active, playing, play, stop, registerHost],
  );

  useEffect(() => {
    if (!active) {
      clearMedia(mediaRef, mediaKeyRef, mediaKindRef);
      layerRef.current?.remove();
      return;
    }

    if (!activeHost) {
      // Keep the element alive while a card/modal host is between mounts. A
      // later registration can then reattach the same media node and retain
      // its currentTime (or YouTube iframe session).
      layerRef.current?.remove();
      return;
    }

    const layer = ensureLayer(layerRef);
    layer.dataset.surface = activeHost.surface;
    if (layer.parentElement !== activeHost.element) {
      activeHost.element.appendChild(layer);
    }

    const mediaIdentity = `${active.key}:${active.kind}:${active.src}:${active.youtubeId ?? ""}`;

    if (
      !mediaRef.current ||
      mediaKeyRef.current !== mediaIdentity ||
      mediaKindRef.current !== active.kind
    ) {
      clearMedia(mediaRef, mediaKeyRef, mediaKindRef);
      const media = createMediaElement(active, setPlaying, stop);
      mediaRef.current = media;
      mediaKeyRef.current = mediaIdentity;
      mediaKindRef.current = active.kind;
      layer.appendChild(media);
      if (media instanceof HTMLVideoElement) {
        startVideoPlayback(media, setPlaying);
      }
    } else if (active.kind === "upload" && mediaRef.current instanceof HTMLVideoElement) {
      mediaRef.current.poster = active.posterUrl ?? "";
    }
  }, [active, activeHost]);

  useEffect(() => {
    if (!active || activeHost) return;
    // A normal thumbnail → modal handoff keeps the card host mounted. If a
    // surface replacement removes both hosts in one commit, let child effect
    // registrations run before deciding that playback truly left the page.
    const finalize = () => {
      const hasConnectedHost = Array.from(hostsRef.current.values()).some(
        (entry) =>
          entry.sourceKey === active.key && entry.element.isConnected,
      );
      if (hasConnectedHost) return;
      if (activeRef.current?.key !== active.key) return;
      setActive((current) => (current?.key === active.key ? null : current));
      setPlaying(false);
    };
    if (typeof queueMicrotask === "function") {
      queueMicrotask(finalize);
    } else {
      void Promise.resolve().then(finalize);
    }
  }, [active, activeHost]);

  useEffect(() => {
    return () => {
      clearMedia(mediaRef, mediaKeyRef, mediaKindRef);
      layerRef.current?.remove();
    };
  }, []);

  return (
    <CardVideoContext.Provider value={value}>{children}</CardVideoContext.Provider>
  );
}

function ensureLayer(layerRef: React.MutableRefObject<HTMLDivElement | null>): HTMLDivElement {
  if (layerRef.current) return layerRef.current;
  const layer = document.createElement("div");
  layer.className = "card-video-player-layer";
  layerRef.current = layer;
  return layer;
}

function isPreferredHost(candidate: HostEntry, current: HostEntry | null): boolean {
  return Boolean(
    !current ||
      (candidate.surface === "detail" && current.surface !== "detail") ||
      (candidate.surface === current.surface && candidate.order > current.order),
  );
}

function createMediaElement(
  source: CardVideoSource,
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>,
  stop: () => void,
): HTMLIFrameElement | HTMLVideoElement {
  if (source.kind === "youtube" && source.youtubeId) {
    const iframe = document.createElement("iframe");
    iframe.src = buildYouTubeEmbedUrl(source.youtubeId);
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    iframe.title = source.title ?? "YouTube";
    return iframe;
  }

  const video = document.createElement("video");
  video.src = source.src;
  video.poster = source.posterUrl ?? "";
  video.controls = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute("aria-label", source.title ?? "동영상");
  video.addEventListener("play", () => setPlaying(true));
  video.addEventListener("pause", () => setPlaying(false));
  video.addEventListener("ended", stop);
  video.addEventListener("click", (event) => event.stopPropagation());
  video.addEventListener("pointerdown", (event) => event.stopPropagation());
  video.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.stopPropagation();
    }
  });
  return video;
}

function startVideoPlayback(
  video: HTMLVideoElement,
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>,
) {
  try {
    const playback = video.play();
    if (playback && typeof playback.catch === "function") {
      void playback.catch(() => {
        setPlaying(false);
        // The poster click is normally a user activation. If a browser still
        // blocks autoplay, native controls remain available in the same element.
      });
    }
  } catch {
    // Some older browsers throw synchronously when autoplay is rejected.
  }
}

function clearMedia(
  mediaRef: React.MutableRefObject<HTMLIFrameElement | HTMLVideoElement | null>,
  mediaKeyRef: React.MutableRefObject<string | null>,
  mediaKindRef: React.MutableRefObject<CardVideoSource["kind"] | null>,
) {
  const media = mediaRef.current;
  if (media instanceof HTMLVideoElement) {
    media.pause();
    media.removeAttribute("src");
    media.load();
  } else if (media instanceof HTMLIFrameElement) {
    media.src = "about:blank";
  }
  media?.remove();
  mediaRef.current = null;
  mediaKeyRef.current = null;
  mediaKindRef.current = null;
}

function buildYouTubeEmbedUrl(videoId: string): string {
  const params = new URLSearchParams({
    autoplay: "1",
    enablejsapi: "1",
    rel: "0",
    playsinline: "1",
  });
  if (typeof window !== "undefined") {
    params.set("origin", window.location.origin);
  }
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}
