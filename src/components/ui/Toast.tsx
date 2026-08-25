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

// parent-class-invite-v2 — Toast (promoted to ui/, amendment_v2 §1.1).
// Contract: tasks/2026-04-15-parent-class-invite-v2/phase3_amendment_v2/component_contract.md §1.
//
// Minimal v1 implementation:
//   • variant: success | error | info
//   • role="status" (success/info, polite) or role="alert" (error, assertive)
//   • fixed bottom-right, stack upward
//   • auto-dismiss on duration (default 2500ms) with hover/focus pause
//   • reduced-motion → instant fade (slide disabled)
//   • no queueing, dedupe, or React-node messages (Simplicity First)

export type ToastVariant = "success" | "error" | "info";
export type ToastId = string;
export interface ToastInput {
  variant: ToastVariant;
  message: string;
  duration?: number;
  onClose?: () => void;
  showAccent?: boolean;
}

interface ToastInternal extends ToastInput {
  id: ToastId;
  duration: number;
}

interface ToastApi {
  show: (input: ToastInput) => ToastId;
  dismiss: (id: ToastId) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return ctx;
}

let _idCounter = 0;
function genId(): ToastId {
  _idCounter += 1;
  return `t${Date.now().toString(36)}_${_idCounter}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastInternal[]>([]);
  // Track which toast ids have fired onClose so we never call twice.
  const firedCloseRef = useRef<Set<ToastId>>(new Set());

  const dismiss = useCallback((id: ToastId) => {
    setToasts((prev) => {
      const target = prev.find((t) => t.id === id);
      if (target && !firedCloseRef.current.has(id)) {
        firedCloseRef.current.add(id);
        try {
          target.onClose?.();
        } catch (e) {
          console.error("[Toast] onClose threw", e);
        }
      }
      return prev.filter((t) => t.id !== id);
    });
  }, []);

  const show = useCallback((input: ToastInput) => {
    const id = genId();
    // Runtime guard: duration ≤ 0 is meaningless; clamp to default.
    const duration = input.duration && input.duration > 0 ? input.duration : 2500;
    setToasts((prev) => [...prev, { ...input, id, duration }]);
    return id;
  }, []);

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-hidden={toasts.length === 0}
        style={{
          position: "fixed",
          right: 24,
          bottom: 24,
          display: "flex",
          flexDirection: "column-reverse",
          gap: 8,
          pointerEvents: "none",
          zIndex: 9999,
        }}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastInternal; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const id = setTimeout(onDismiss, toast.duration);
    return () => clearTimeout(id);
  }, [paused, toast.duration, onDismiss]);

  const isError = toast.variant === "error";
  const barColor =
    toast.variant === "success"
      ? "var(--color-accent, #0075de)"
      : isError
        ? "var(--color-danger, #c62828)"
        : "var(--color-text-muted, #615d59)";

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      aria-atomic
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") onDismiss();
      }}
      style={{
        pointerEvents: "auto",
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        maxWidth: 360,
        padding: "12px 16px",
        borderRadius: "var(--radius-card, 12px)",
        boxShadow: "var(--shadow-card-hover, 0 12px 34px rgba(0,0,0,0.06))",
        background: "var(--color-surface, #fff)",
        borderLeft: toast.showAccent === false ? "none" : `3px solid ${barColor}`,
      }}
    >
      <span style={{ flex: 1, fontSize: 14, color: "var(--color-text, #111)" }}>
        {toast.message}
      </span>
      <button
        type="button"
        aria-label="알림 닫기"
        onClick={onDismiss}
        style={{
          width: 44,
          height: 44,
          marginRight: -12,
          marginTop: -12,
          marginBottom: -12,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "var(--color-text-muted, #615d59)",
          fontSize: 18,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
