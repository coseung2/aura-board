"use client";

import { useState } from "react";

export function ErrorLogCopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      className="admin-error-copy-btn"
      onClick={() => void handleCopy()}
      aria-label="오류 메시지 복사"
    >
      {copied ? "복사됨" : "복사"}
    </button>
  );
}
