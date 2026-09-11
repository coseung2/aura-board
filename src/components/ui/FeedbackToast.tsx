"use client";
import { useEffect } from "react";
import { ToastProvider, useToast, type ToastVariant } from "./Toast";

type Notice = { message: string; variant?: ToastVariant; id?: number } | null;
function Present({ notice }: { notice: Notice }) {
  const toast = useToast();
  useEffect(() => {
    if (!notice) return;
    const id = toast.show({ message: notice.message, variant: notice.variant ?? "info", duration: 6500 });
    return () => toast.dismiss(id);
  }, [notice, toast]);
  return null;
}
export function FeedbackToast({ notice }: { notice: Notice }) {
  return <ToastProvider><Present notice={notice} /></ToastProvider>;
}
