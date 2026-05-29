"use client";

import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push("/login");
  }

  return (
    <button
      onClick={handleSignOut}
      className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
    >
      Sign out
    </button>
  );
}
