"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { handleShareApiFetch } from "@/lib/supabase/share-api";

export type ShareSession = {
  shareToken: string;
  shareMode: "student";
  guestId: string;
  authorName: string;
};

const SHARE_GUEST_ID_KEY = "aura-share-guest-id";
const SHARE_AUTHOR_NAME_KEY = "aura-share-author-name";
const NICKNAME_ADJECTIVES = [
  "맑은",
  "푸른",
  "초록",
  "은빛",
  "따뜻한",
  "반짝",
  "고요한",
  "싱그러운",
  "환한",
  "단단한",
];
const NICKNAME_NOUNS = [
  "새싹",
  "연필",
  "구름",
  "열쇠",
  "노트",
  "햇살",
  "종이",
  "물결",
  "별빛",
  "나무",
];

const ShareSessionContext = createContext<ShareSession | null>(null);

function createGuestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function randomIndex(length: number): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] % length;
  }
  return Math.floor(Math.random() * length);
}

function createAuthorName(): string {
  const adjective = NICKNAME_ADJECTIVES[randomIndex(NICKNAME_ADJECTIVES.length)];
  const noun = NICKNAME_NOUNS[randomIndex(NICKNAME_NOUNS.length)];
  return `${adjective} ${noun}`;
}

export function ShareSessionProvider({
  shareToken,
  shareMode,
  children,
}: {
  shareToken: string;
  shareMode: "student";
  children: ReactNode;
}) {
  const [guestId, setGuestId] = useState(() => getOrCreateStoredGuestId());
  const [authorName, setAuthorName] = useState(() => getOrCreateStoredAuthorName());

  useEffect(() => {
    setGuestId(getOrCreateStoredGuestId());
    setAuthorName(getOrCreateStoredAuthorName());
  }, []);

  const value = useMemo(
    () => ({ shareToken, shareMode, guestId, authorName }),
    [authorName, guestId, shareMode, shareToken],
  );

  return (
    <ShareSessionContext.Provider value={value}>
      <ShareFetchBridge session={value} />
      {children}
    </ShareSessionContext.Provider>
  );
}

export function useShareSession(): ShareSession | null {
  return useContext(ShareSessionContext);
}

export function useShareFetch() {
  const session = useShareSession();
  return useCallback(
    (url: string | URL, init?: RequestInit) => {
      return fetch(url, {
        ...init,
        headers: {
          ...init?.headers,
          ...(session ? { "x-share-token": session.shareToken } : {}),
          ...(session?.guestId ? { "x-share-guest-id": session.guestId } : {}),
        },
      });
    },
    [session],
  );
}

function getOrCreateStoredAuthorName(): string {
  if (typeof window === "undefined") return "방문자";
  const stored = window.localStorage.getItem(SHARE_AUTHOR_NAME_KEY);
  if (stored && stored !== "방문자") return stored;
  const name = createAuthorName();
  window.localStorage.setItem(SHARE_AUTHOR_NAME_KEY, name);
  return name;
}

function getOrCreateStoredGuestId(): string {
  if (typeof window === "undefined") return createGuestId();
  let id = window.localStorage.getItem(SHARE_GUEST_ID_KEY);
  if (!id) {
    id = createGuestId();
    window.localStorage.setItem(SHARE_GUEST_ID_KEY, id);
  }
  return id;
}

function isSameOriginApiRequest(input: RequestInfo | URL): boolean {
  if (typeof window === "undefined") return false;
  const raw = input instanceof Request ? input.url : input.toString();
  try {
    const url = new URL(raw, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

function ShareFetchBridge({ session }: { session: ShareSession }) {
  useEffect(() => {
    const originalFetch = window.fetch;
    if (typeof originalFetch !== "function") return;

    const patchedFetch = (input: RequestInfo | URL, init?: RequestInit) => {
      if (!isSameOriginApiRequest(input)) {
        return originalFetch.call(window, input, init);
      }

      const handled = handleShareApiFetch(session, input, init);
      if (handled) {
        return handled.then((response) => response ?? originalFetch.call(window, input, init));
      }

      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      headers.set("x-share-token", session.shareToken);
      headers.set("x-share-guest-id", session.guestId);
      headers.set("x-share-author-name", encodeURIComponent(session.authorName));

      return originalFetch.call(window, input, {
        ...init,
        headers,
      });
    };

    window.fetch = patchedFetch;

    return () => {
      if (window.fetch === patchedFetch) {
        window.fetch = originalFetch;
      }
    };
  }, [session]);

  return null;
}
