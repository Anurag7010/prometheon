"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  closeOnBackdrop?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
  closeOnBackdrop = true,
  className,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);
  const titleId = title ? "modal-title" : undefined;

  // Save the element that opened the modal — we return focus to it on close
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
    }
  }, [open]);

  // Body scroll lock — prevents background scrolling while modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Focus trap — keyboard users must not be able to Tab outside the modal.
  // Without focus trapping: Tab moves focus to elements behind the backdrop,
  // which are visually hidden but still reachable — confusing and inaccessible.
  useEffect(() => {
    if (!open || !panelRef.current) return;

    // Query all focusable elements inside the modal panel
    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    // Move focus into modal on open
    first?.focus();

    function handleTab(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      if (e.shiftKey) {
        // Shift+Tab: if on first element, wrap to last
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        // Tab: if on last element, wrap to first
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }

    document.addEventListener("keydown", handleTab);
    return () => {
      document.removeEventListener("keydown", handleTab);
      // Return focus to the element that opened the modal
      (triggerRef.current as HTMLElement)?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  // createPortal renders into document.body instead of inline in the React tree.
  // Without portal: modal inherits CSS from ancestors — a parent with overflow:hidden
  // or z-index:0 would clip or hide the modal. Portal escapes all ancestor constraints.
  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 40 }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-foreground/50 animate-fade-in"
        style={{ zIndex: 30 }}
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative w-full bg-card rounded-lg shadow-xl",
          "animate-slide-in-bottom",
          sizeClasses[size],
          className,
        )}
        style={{ zIndex: 40 }}
      >
        {/* Header */}
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 p-6 border-b border-border">
            <div>
              {title && (
                <h2
                  id={titleId}
                  className="text-lg font-semibold text-foreground"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-sm text-muted-foreground mt-1">
                  {description}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close modal"
              className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="h-5 w-5"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {/* Body */}
        <div className="p-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
