"use client";

import { useEffect } from "react";
import { cn } from "@/lib/cn";
import type { Toast as ToastType } from "@/hooks/useToast";

interface ToastProps {
  toast: ToastType;
  onDismiss: (id: string) => void;
}

const variantClasses = {
  info: "bg-brand-50   border-brand-200   text-brand-800   dark:bg-brand-900/30   dark:border-brand-700   dark:text-brand-200",
  success:
    "bg-success-50 border-success-200 text-success-800 dark:bg-success-900/30 dark:border-success-700 dark:text-success-200",
  warning:
    "bg-warning-50 border-warning-200 text-warning-800 dark:bg-warning-900/30 dark:border-warning-700 dark:text-warning-200",
  error:
    "bg-error-50   border-error-200   text-error-800   dark:bg-error-900/30   dark:border-error-700   dark:text-error-200",
};

const progressClasses = {
  info: "bg-brand-400",
  success: "bg-success-500",
  warning: "bg-warning-500",
  error: "bg-error-500",
};

export function ToastItem({ toast, onDismiss }: ToastProps) {
  const duration = toast.duration ?? 5000;

  // Auto-dismiss after duration
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), duration);
    return () => clearTimeout(timer);
  }, [toast.id, duration, onDismiss]);

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        "relative w-80 rounded-lg border shadow-md overflow-hidden",
        "animate-slide-in-bottom",
        variantClasses[toast.variant],
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{toast.title}</p>
          {toast.description && (
            <p className="text-xs mt-0.5 opacity-80">{toast.description}</p>
          )}
        </div>

        <button
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss notification"
          className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="h-3.5 w-3.5"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Progress bar — CSS animation from full width to zero over duration */}
      <div
        className={cn(
          "h-0.5 w-full origin-left",
          progressClasses[toast.variant],
        )}
        style={{
          animation: `shrink ${duration}ms linear forwards`,
        }}
      />

      <style jsx>{`
        @keyframes shrink {
          from {
            transform: scaleX(1);
          }
          to {
            transform: scaleX(0);
          }
        }
      `}</style>
    </div>
  );
}
