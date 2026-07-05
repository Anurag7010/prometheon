"use client";

import { useState } from "react";
import { Eye, EyeOff, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

// Labeled input with a leading icon and an optional password-visibility toggle.
// Focus state is pure Tailwind (ember ring) — no inline style handlers.

interface AuthFieldProps {
  label: string;
  name: string;
  type: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  autoComplete: string;
  icon: LucideIcon;
  error?: string;
  /** When true, renders a show/hide toggle and swaps type between text/password. */
  passwordToggle?: boolean;
}

export function AuthField({
  label,
  name,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  icon: Icon,
  error,
  passwordToggle = false,
}: AuthFieldProps) {
  const [reveal, setReveal] = useState(false);
  const resolvedType = passwordToggle ? (reveal ? "text" : "password") : type;

  return (
    <div>
      <label
        htmlFor={name}
        className="mb-1.5 block text-xs font-medium text-parchment/80"
      >
        {label}
      </label>
      <div className="group relative">
        <Icon
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ash-gray transition-colors group-focus-within:text-ember"
          strokeWidth={1.75}
        />
        <input
          id={name}
          name={name}
          type={resolvedType}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          className={cn(
            "w-full rounded-xl border bg-forge-dark/80 py-3 pl-11 text-sm text-parchment placeholder-ash-gray outline-none transition-all duration-200",
            passwordToggle ? "pr-11" : "pr-4",
            "focus:border-ember/60 focus:bg-forge-dark focus:shadow-[0_0_0_3px_rgba(212,87,42,0.15)]",
            error
              ? "border-error-500/60"
              : "border-stone-mid/40 hover:border-stone-mid/60",
          )}
        />
        {passwordToggle && (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-ash-gray transition-colors hover:text-parchment focus-visible:text-parchment focus-visible:outline-none"
          >
            {reveal ? (
              <EyeOff className="h-4 w-4" strokeWidth={1.75} />
            ) : (
              <Eye className="h-4 w-4" strokeWidth={1.75} />
            )}
          </button>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-error-500">{error}</p>}
    </div>
  );
}
