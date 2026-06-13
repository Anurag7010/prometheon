"use client";

// RelativeTime MUST be a Client Component because:
// 1. It uses setInterval to update every minute — intervals are browser APIs
// 2. It reads Date.now() at render time — Server Components render once at request time,
//    so the relative time would be frozen at when the server rendered the page.
//    A client component re-renders on the interval to keep the time current.
// 3. It uses Tooltip which is also 'use client'

import { useState, useEffect, useMemo } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";

interface RelativeTimeProps {
  date: Date | string;
  className?: string;
}

function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHrs = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60)
    return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
  if (diffHrs < 24) return `${diffHrs} hour${diffHrs === 1 ? "" : "s"} ago`;
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

export function RelativeTime({ date, className }: RelativeTimeProps) {
  const dateObj = useMemo(
    () => (typeof date === "string" ? new Date(date) : date),
    [date]
  );

  const [relative, setRelative] = useState(() => formatRelative(dateObj));

  useEffect(() => {
    // Update every 60 seconds so '2 minutes ago' stays accurate
    const interval = setInterval(() => {
      setRelative(formatRelative(dateObj));
    }, 60_000);

    // Cleanup prevents memory leak and stale intervals after unmount
    return () => clearInterval(interval);
  }, [dateObj]);

  const fullDate = dateObj.toLocaleString();

  return (
    <Tooltip content={fullDate}>
      <time
        dateTime={dateObj.toISOString()}
        className={cn(
          "text-sm text-muted-foreground cursor-default",
          className,
        )}
      >
        {relative}
      </time>
    </Tooltip>
  );
}
