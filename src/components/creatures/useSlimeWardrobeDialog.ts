"use client";

import { useEffect, useRef, type RefObject } from "react";

type SlimeWardrobeDialogOptions = {
  open: boolean;
  onRequestClose: () => void;
};

type SlimeWardrobeDialogRefs = {
  triggerRef: RefObject<HTMLButtonElement | null>;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
};

/** Owns modal focus, Escape handling, focus trapping, and scroll locking. */
export function useSlimeWardrobeDialog({
  open,
  onRequestClose,
}: SlimeWardrobeDialogOptions): SlimeWardrobeDialogRefs {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const hadOpenDialog = useRef(false);

  useEffect(() => {
    if (!open) {
      if (hadOpenDialog.current) {
        hadOpenDialog.current = false;
        triggerRef.current?.focus();
      }
      return;
    }

    hadOpenDialog.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() =>
      closeButtonRef.current?.focus(),
    );

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onRequestClose();
        return;
      }
      if (event.key !== "Tab") return;

      const dialog =
        closeButtonRef.current?.closest<HTMLElement>("[role='dialog']");
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onRequestClose, open]);

  return { triggerRef, closeButtonRef };
}
