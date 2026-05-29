"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Module-level storage — persists across renders, lost on page refresh
// (refresh token cookie handles re-hydration on reload)
let _accessToken: string | null = null;

export function getAccessToken(): string | null {
  return _accessToken;
}

export function setAccessToken(token: string | null): void {
  _accessToken = token;
}

export interface AuthUser {
  id: string;
  email: string;
}

export function useAuth() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function refresh(): Promise<boolean> {
    try {
      const res = await fetch("/api/auth/refresh", { method: "POST" });
      if (!res.ok) return false;
      const data = await res.json();
      setAccessToken(data.accessToken);
      setUser(data.user ?? null);
      return true;
    } catch {
      return false;
    }
  }

  function scheduleRefresh() {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    // Access token expires in 15min — refresh 1min before
    refreshTimer.current = setTimeout(async () => {
      const ok = await refresh();
      if (ok) scheduleRefresh();
    }, 14 * 60 * 1000);
  }

  useEffect(() => {
    // On mount: try to restore session via refresh cookie
    refresh().then((ok) => {
      if (ok) scheduleRefresh();
      setIsLoading(false);
    });

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(email: string, password: string): Promise<void> {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? "Login failed");
    setAccessToken(data.accessToken);
    setUser(data.user);
    scheduleRefresh();
  }

  async function register(email: string, password: string): Promise<void> {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? "Registration failed");
    setAccessToken(data.accessToken);
    setUser(data.user);
    scheduleRefresh();
  }

  async function logout(): Promise<void> {
    await fetch("/api/auth/logout", { method: "POST" });
    setAccessToken(null);
    setUser(null);
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    router.push("/login");
  }

  return {
    user,
    isLoading,
    accessToken: _accessToken,
    login,
    register,
    logout,
  };
}
