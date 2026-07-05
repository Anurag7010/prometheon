"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { Flame, Upload, MessagesSquare, Quote } from "lucide-react";
import { cn } from "@/lib/cn";

// Shared two-column shell for the login and register pages.
// Left: brand hero over a looping fire video (poster paints instantly).
// Right: the form, passed as children. Keeps both auth pages DRY and identical
// in structure so the only difference between them is the form itself.

const container: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.15 },
  },
};

const rise: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

type Phase = {
  icon: typeof Upload;
  label: string;
  desc: string;
};

const PHASES: readonly Phase[] = [
  {
    icon: Upload,
    label: "Upload your documents",
    desc: "PDFs, reports, notes — ingested into a private vector store.",
  },
  {
    icon: MessagesSquare,
    label: "Ask in plain language",
    desc: "No query syntax. Just ask what you need to know.",
  },
  {
    icon: Quote,
    label: "Answers you can cite",
    desc: "Every response grounded in your sources, with citations.",
  },
];

function StepItem({ phase, active }: { phase: Phase; active?: boolean }) {
  const Icon = phase.icon;
  return (
    <motion.div
      variants={rise}
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3 backdrop-blur-md transition-colors",
        active
          ? "border-ember/50 bg-ember/10"
          : "border-parchment/10 bg-ember-black/40",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          active ? "bg-ember text-parchment" : "bg-parchment/10 text-parchment/50",
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <p
          className={cn(
            "text-sm font-medium leading-snug",
            active ? "text-parchment" : "text-parchment/75",
          )}
        >
          {phase.label}
        </p>
        <p className="mt-0.5 text-xs leading-snug text-parchment/45">
          {phase.desc}
        </p>
      </div>
    </motion.div>
  );
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] w-full bg-ember-black p-2 lg:h-[100dvh] lg:overflow-hidden lg:p-3">
      {/* Left — brand hero (desktop only) */}
      <aside className="relative hidden overflow-hidden rounded-3xl lg:flex lg:w-[52%] lg:flex-col lg:justify-end">
        <video
          className="absolute inset-0 h-full w-full object-cover"
          poster="/prometheon-feature-card.jpeg"
          autoPlay
          muted
          loop
          playsInline
          aria-hidden
        >
          <source src="/prometheon-bg.mp4" type="video/mp4" />
        </video>
        {/* Legibility scrim — bottom-weighted so the fire reads at the top,
            copy reads at the bottom. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgba(23,27,31,0.92) 0%, rgba(23,27,31,0.55) 38%, rgba(23,27,31,0.10) 70%, rgba(23,27,31,0.25) 100%)",
          }}
        />

        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="relative z-10 w-full max-w-md space-y-8 p-10 xl:p-12"
        >
          <motion.div variants={rise} className="flex items-center gap-2.5">
            <Flame className="h-6 w-6 text-ember" fill="currentColor" strokeWidth={1.5} />
            <span className="text-lg font-semibold tracking-tight text-parchment">
              PrometheonAI
            </span>
          </motion.div>

          <motion.div variants={rise} className="space-y-3">
            <h2 className="font-cormorant text-4xl font-light leading-[1.1] tracking-tight text-parchment text-balance">
              The fire of knowledge, in your hands.
            </h2>
            <p className="max-w-sm text-sm leading-relaxed text-parchment/60 text-pretty">
              Prometheon turns your documents into answers you can trust —
              grounded in your sources, every claim cited.
            </p>
          </motion.div>

          <div className="space-y-2.5">
            {PHASES.map((phase, i) => (
              <StepItem key={phase.label} phase={phase} active={i === 0} />
            ))}
          </div>
        </motion.div>
      </aside>

      {/* Right — form column */}
      <div className="relative flex flex-1 items-center justify-center overflow-y-auto px-6 py-10 sm:px-10 lg:px-16">
        {/* Ambient ember glow — gives the form panel depth instead of flat black */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 55% at 75% 15%, rgba(212,87,42,0.12) 0%, transparent 60%)",
          }}
        />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="relative z-10 w-full max-w-md"
        >
          {/* Mobile brand mark — hero is hidden below lg */}
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-2.5 lg:hidden"
          >
            <Flame className="h-6 w-6 text-ember" fill="currentColor" strokeWidth={1.5} />
            <span className="text-base font-semibold tracking-tight text-parchment">
              PrometheonAI
            </span>
          </Link>
          {children}
        </motion.div>
      </div>
    </div>
  );
}
