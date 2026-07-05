"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { uploadFile } from "@/lib/upload-client";

const APP_BACKGROUND_KEY = "aura:app:background";
const APP_BACKGROUND_EVENT = "aura:app-background-change";
const APP_BACKGROUND_API = "/api/teacher/background";

type BackgroundChangeEvent = CustomEvent<{ url: string | null }>;

function readCachedBackgroundUrl() {
  try {
    return localStorage.getItem(APP_BACKGROUND_KEY);
  } catch {
    return null;
  }
}

function cacheBackgroundUrl(url: string | null) {
  try {
    if (url) localStorage.setItem(APP_BACKGROUND_KEY, url);
    else localStorage.removeItem(APP_BACKGROUND_KEY);
  } catch {
    // ignore
  }
}

async function fetchAccountBackgroundUrl(): Promise<string | null | undefined> {
  const res = await fetch(APP_BACKGROUND_API, { cache: "no-store" });
  if (res.status === 401 || res.status === 403) return undefined;
  if (!res.ok) throw new Error(`background_get_failed:${res.status}`);
  const body = (await res.json()) as { url?: string | null };
  return body.url ?? null;
}

async function saveAccountBackgroundUrl(url: string | null): Promise<string | null> {
  const res = await fetch(APP_BACKGROUND_API, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`background_save_failed:${res.status}`);
  const body = (await res.json()) as { url?: string | null };
  return body.url ?? null;
}

function isBoardInterior(pathname: string | null) {
  return Boolean(pathname?.startsWith("/board/"));
}

export function AppBackgroundLayer() {
  const pathname = usePathname();
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const active = Boolean(backgroundUrl) && !isBoardInterior(pathname);

  useEffect(() => {
    let cancelled = false;

    fetchAccountBackgroundUrl()
      .then((serverUrl) => {
        if (cancelled || serverUrl === undefined) return;
        cacheBackgroundUrl(serverUrl);
        setBackgroundUrl(serverUrl);
        window.dispatchEvent(
          new CustomEvent(APP_BACKGROUND_EVENT, { detail: { url: serverUrl } }),
        );
      })
      .catch(() => {
        // Keep the current value when the network/API is temporarily unavailable.
      });

    function handleChange(event: Event) {
      const nextUrl = (event as BackgroundChangeEvent).detail?.url;
      setBackgroundUrl(nextUrl ?? readCachedBackgroundUrl());
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === APP_BACKGROUND_KEY) setBackgroundUrl(event.newValue);
    }

    window.addEventListener(APP_BACKGROUND_EVENT, handleChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      cancelled = true;
      window.removeEventListener(APP_BACKGROUND_EVENT, handleChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("app-background-active", active);
    return () => {
      document.body.classList.remove("app-background-active");
    };
  }, [active]);

  if (!active || !backgroundUrl) return null;

  return (
    <div
      className="app-background-layer"
      style={{ backgroundImage: `url("${backgroundUrl.replace(/"/g, "%22")}")` }}
      aria-hidden="true"
    />
  );
}

type AppBackgroundButtonProps = {
  className?: string;
};

export function AppBackgroundButton({
  className = "app-background-button",
}: AppBackgroundButtonProps) {
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File | null) {
    if (!file || busy) return;
    setBusy(true);
    try {
      const uploaded = await uploadFile(file);
      const nextUrl = uploaded.previewUrl ?? uploaded.url;
      const savedUrl = await saveAccountBackgroundUrl(nextUrl);
      cacheBackgroundUrl(savedUrl);
      window.dispatchEvent(
        new CustomEvent(APP_BACKGROUND_EVENT, { detail: { url: savedUrl } }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className={className} title="배경 설정">
      <input
        type="file"
        accept="image/*"
        onChange={(event) => {
          void handleFile(event.currentTarget.files?.[0] ?? null);
          event.currentTarget.value = "";
        }}
        disabled={busy}
      />
      <span>{busy ? "설정 중..." : "배경 설정"}</span>
    </label>
  );
}
