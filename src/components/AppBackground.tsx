"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { uploadFile } from "@/lib/upload-client";

const APP_BACKGROUND_KEY = "aura:app:background";
const APP_BACKGROUND_EVENT = "aura:app-background-change";

type BackgroundChangeEvent = CustomEvent<{ url: string | null }>;

function readBackgroundUrl() {
  try {
    const direct = localStorage.getItem(APP_BACKGROUND_KEY);
    if (direct) return direct;

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (
        key?.startsWith("aura:classroom:") &&
        key.endsWith(":morning-background")
      ) {
        const legacy = localStorage.getItem(key);
        if (legacy) {
          localStorage.setItem(APP_BACKGROUND_KEY, legacy);
          return legacy;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

function isBoardInterior(pathname: string | null) {
  return Boolean(pathname?.startsWith("/board/"));
}

export function AppBackgroundLayer() {
  const pathname = usePathname();
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const active = Boolean(backgroundUrl) && !isBoardInterior(pathname);

  useEffect(() => {
    setBackgroundUrl(readBackgroundUrl());

    function handleChange(event: Event) {
      const nextUrl = (event as BackgroundChangeEvent).detail?.url;
      setBackgroundUrl(nextUrl ?? readBackgroundUrl());
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === APP_BACKGROUND_KEY) setBackgroundUrl(event.newValue);
    }

    window.addEventListener(APP_BACKGROUND_EVENT, handleChange);
    window.addEventListener("storage", handleStorage);
    return () => {
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
      localStorage.setItem(APP_BACKGROUND_KEY, nextUrl);
      window.dispatchEvent(
        new CustomEvent(APP_BACKGROUND_EVENT, { detail: { url: nextUrl } }),
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
