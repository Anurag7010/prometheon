"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { SignOutButton } from "./SignOutButton";
import { CommandPalette } from "./CommandPalette";
import { cn } from "@/lib/cn";

function IconDashboard() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="2" width="6" height="6" rx="1.5" />
      <rect x="12" y="2" width="6" height="6" rx="1.5" />
      <rect x="2" y="12" width="6" height="6" rx="1.5" />
      <rect x="12" y="12" width="6" height="6" rx="1.5" />
    </svg>
  );
}

function IconDocuments() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 2H5a1 1 0 00-1 1v14a1 1 0 001 1h10a1 1 0 001-1V7l-5-5z" />
      <path d="M11 2v5h5" />
      <line x1="7" y1="11" x2="13" y2="11" />
      <line x1="7" y1="14" x2="11" y2="14" />
    </svg>
  );
}

function IconChat() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.43 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7z" />
    </svg>
  );
}

function IconAgent() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="10" cy="10" r="3" />
      <path d="M10 1v2M10 17v2M1 10h2M17 10h2M3.22 3.22l1.42 1.42M15.36 15.36l1.42 1.42M3.22 16.78l1.42-1.42M15.36 4.64l1.42-1.42" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M17 17l-4-4" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <circle cx="10" cy="10" r="2.5" />
    </svg>
  );
}

function FlameLogo() {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      className="size-6 shrink-0"
      style={{ color: "#D4572A" }}
    >
      <path
        d="M14 3c0 0-5 5-5 10 0 3 1.8 4.8 1.8 4.8s-.6-2.4 1.2-4.2c.6 2.4 2.4 4.2 2.4 6.6 1.2-1.2 1.8-3 1.8-4.8 1.2 1.8 1.2 4.2 1.2 4.2S20 17 20 14c0-3.5-2.5-6.5-2.5-6.5s.6 3.5-1.8 4.8C14.5 9 14 3 14 3z"
        fill="currentColor"
        opacity="0.95"
      />
      <circle cx="14" cy="23" r="1.8" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: IconDashboard },
  { href: "/chat", label: "Neuro AI", icon: IconChat },
  { href: "/documents", label: "Documents", icon: IconDocuments },
  { href: "/agent", label: "Agent", icon: IconAgent },
  { href: "/search", label: "Search", icon: IconSearch },
];

interface NavItemProps {
  href: string;
  label: string;
  icon: React.ComponentType;
}

function NavItem({ href, label, icon: Icon }: NavItemProps) {
  const pathname = usePathname();
  const isActive =
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-2",
        "text-sm font-medium",
        "transition-colors duration-[150ms]",
        isActive
          ? "bg-ember/12 text-parchment"
          : "text-ash-gray hover:bg-stone-mid/15 hover:text-parchment/80",
      )}
      aria-current={isActive ? "page" : undefined}
    >
      <span
        className={cn(
          "size-4 shrink-0",
          isActive ? "text-ember" : "text-ash-gray",
        )}
      >
        <Icon />
      </span>
      {label}
    </Link>
  );
}

function UserAvatar({ email }: { email: string }) {
  const initials = (email.split("@")[0] ?? email).slice(0, 2).toUpperCase();

  return (
    <div
      className="size-7 rounded-full flex items-center justify-center text-xs font-semibold text-ember shrink-0 bg-ember/20"
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}

interface SidebarProps {
  email: string;
}

export function Sidebar({ email }: SidebarProps) {
  return (
    <aside
      className="flex h-full w-56 flex-col bg-forge-dark border-r border-stone-mid/30"
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Wordmark */}
      <div className="flex h-14 items-center gap-2.5 border-b border-stone-mid/30 px-4">
        <FlameLogo />
        <div className="flex items-baseline gap-1">
          <span className="font-cormorant text-lg font-light tracking-tight text-parchment">
            Prometheon
          </span>
          <sup className="text-ember text-xs font-sans">AI</sup>
        </div>
      </div>

      {/* Back-to-landing link */}
      <div className="px-3 pt-2 pb-0">
        <motion.div whileHover={{ x: -2 }} transition={{ duration: 0.15 }}>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 border border-stone-mid/30 hover:border-stone-mid/60 rounded-full px-3 py-1.5 text-xs text-parchment/50 hover:text-parchment/90 transition-colors duration-150"
          >
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
              <path d="M8 2L4 6l4 4" />
            </svg>
            <span>Prometheon</span>
          </Link>
        </motion.div>
      </div>

      {/* Search / command palette */}
      <div className="px-2 pb-1 pt-2">
        <CommandPalette />
      </div>

      {/* Primary navigation */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {navItems.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}
      </nav>

      {/* Settings + user */}
      <div className="border-t border-stone-mid/30 p-2 space-y-0.5">
        <NavItem href="/settings" label="Settings" icon={IconSettings} />

        <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 mt-1">
          <UserAvatar email={email} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-parchment truncate">
              {email}
            </p>
          </div>
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}
