"use client";

// Hydration mismatch problem:
// Server renders HTML without knowing the user's theme preference (localStorage is browser-only).
// If we render a sun icon on the server and the user has dark mode saved,
// React's client render would show a moon icon — mismatch causes a hydration error.
//
// Solution: render a neutral placeholder until after mount (when we can read localStorage).
// suppressHydrationWarning on <html> suppresses the warning for the class attribute,
// which changes when we apply the theme class. We still avoid the icon mismatch by
// showing nothing until useEffect runs.

import { useSyncExternalStore } from "react";

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

type Theme = "light" | "dark";

// Callbacks subscribed to theme changes (storage events + manual mutations)
const themeListeners = new Set<() => void>();
let _cachedTheme: Theme | null = null;

function getThemeSnapshot(): Theme | null {
  return _cachedTheme;
}

function getThemeServerSnapshot(): null {
  // Server-side: always return null so we render the placeholder
  return null;
}

function subscribeToTheme(callback: () => void): () => void {
  themeListeners.add(callback);
  if (_cachedTheme === null) {
    // Initialize once when the first subscriber attaches
    const saved = localStorage.getItem("theme") as Theme | null;
    const systemPrefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    _cachedTheme = saved ?? (systemPrefersDark ? "dark" : "light");
    applyTheme(_cachedTheme);
  }
  return () => {
    themeListeners.delete(callback);
  };
}

function notifyThemeListeners() {
  themeListeners.forEach((cb) => cb());
}

function applyTheme(next: Theme) {
  const root = document.documentElement;
  if (next === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  localStorage.setItem("theme", next);
  _cachedTheme = next;
}

export default function ThemeToggle() {
  // useSyncExternalStore: subscribes to theme without setState-in-effect
  // Server snapshot returns null → renders placeholder (no hydration mismatch)
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getThemeServerSnapshot,
  );

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    applyTheme(next);
    notifyThemeListeners();
  }

  // Render nothing until mounted — prevents hydration mismatch on the icon
  if (theme === null) {
    return (
      <button
        className="h-9 w-9 rounded-md border border-border flex items-center justify-center"
        aria-label="Toggle theme"
        disabled
      >
        {/* Empty placeholder — same size as the real button to prevent layout shift */}
        <span className="h-4 w-4" />
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      className="h-9 w-9 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-fast"
      aria-label={
        theme === "light" ? "Switch to dark mode" : "Switch to light mode"
      }
    >
      {theme === "light" ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
