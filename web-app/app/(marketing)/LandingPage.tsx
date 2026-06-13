"use client";

import { useRef, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  motion,
  useScroll,
  useTransform,
  useInView,
} from "framer-motion";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { getAccessToken } from "@/hooks/useAuth";
import StringPoster from "@/components/marketing/StringPoster";
import { PageReveal } from "@/components/marketing/PageReveal";
import {
  WordsPullUpMultiStyle,
  AnimatedLetter,
  MagneticButton,
  SpotlightCard,
} from "@/components/ui/motion";
import { EASE_CINEMATIC, EASE_ENTRANCE, DURATION } from "@/lib/motion";

const VIDEO_URL = "/prometheon-hero-hd.mp4";
const FEAT_URL = "/philosopher-card.png";
const ZEUS_URL = "/zeus-card.jpeg";
const NAV_SCROLL_ITEMS = ["Manifesto", "How It Works", "Intelligence"];

/* ─── FLAME SVG ─── */
function FlameMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <path
        d="M16 3c0 0-5.5 5.5-5.5 11 0 3.5 2 5.5 2 5.5s-.7-2.8 1.4-4.8c.7 2.8 2.8 4.8 2.8 7.7 1.4-1.4 2.1-3.5 2.1-5.5 1.4 2.1 1.4 4.8 1.4 4.8s2.8-2.8 2.8-5.5C23.1 11 19 6.5 19 6.5s.7 4.2-2.1 5.5C15.5 8.5 16 3 16 3z"
        fill="currentColor"
        opacity="0.95"
      />
      <circle cx="16" cy="27" r="2" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

/* ─── HERO VIDEO — seamless loop ─── */
function HeroVideo() {
  return (
    <video
      src={VIDEO_URL}
      autoPlay
      loop
      muted
      playsInline
      className="absolute inset-0 w-full h-full object-cover"
    />
  );
}

/* ─── MORPHING NAVBAR ─── */
function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const router = useRouter();

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > window.innerHeight * 0.8);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function handleForge() {
    router.push(getAccessToken() ? "/dashboard" : "/login");
  }

  return (
    <motion.nav
      className="fixed top-0 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 sm:gap-4 md:gap-6 px-4 sm:px-6 md:px-10"
      style={{
        paddingTop: scrolled ? 10 : 16,
        paddingBottom: scrolled ? 10 : 16,
        borderRadius: scrolled ? "0 0 16px 16px" : "0 0 24px 24px",
        backgroundColor: scrolled ? "rgba(237,232,224,0.04)" : "#171B1F",
        backdropFilter: scrolled ? "blur(12px)" : "none",
        transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {NAV_SCROLL_ITEMS.map((item) => (
        <a
          key={item}
          href={`#${item.toLowerCase()}`}
          className="text-[10px] sm:text-xs md:text-sm transition-colors duration-200"
          style={{ color: "rgba(237, 232, 224, 0.7)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#EDE8E0")}
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = "rgba(237, 232, 224, 0.7)")
          }
        >
          {item}
        </a>
      ))}
      <Link
        href="/chat"
        className="text-[10px] sm:text-xs md:text-sm transition-colors duration-200"
        style={{ color: "rgba(237, 232, 224, 0.7)" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#EDE8E0")}
        onMouseLeave={(e) =>
          (e.currentTarget.style.color = "rgba(237, 232, 224, 0.7)")
        }
      >
        Ask the Oracle
      </Link>
      <button
        onClick={handleForge}
        className="text-[10px] sm:text-xs md:text-sm font-medium transition-all duration-200 bg-transparent border-none cursor-pointer"
        style={{ color: "#D4572A" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "#EDE8E0";
          e.currentTarget.style.textShadow = "0 0 20px rgba(212,87,42,0.4)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "#D4572A";
          e.currentTarget.style.textShadow = "none";
        }}
      >
        Sign In
      </button>
    </motion.nav>
  );
}

/* ─── SECTION A: HERO ─── */
function HeroSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const videoY = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);

  return (
    <section
      ref={sectionRef}
      className="relative h-screen overflow-hidden p-4 md:p-6"
    >
      <div className="relative w-full h-full rounded-2xl md:rounded-[2rem] overflow-hidden">
        <motion.div className="absolute inset-0" style={{ y: videoY }}>
          <HeroVideo />
        </motion.div>

        {/* Noise overlay */}
        <div className="noise-overlay absolute inset-0 opacity-70 mix-blend-overlay pointer-events-none" />

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60 pointer-events-none" />

        {/* Hero content — bottom aligned */}
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 lg:p-14">
          <div className="grid grid-cols-12 gap-4 items-end">
            {/* Left 8 cols — giant heading */}
            <div className="col-span-12 lg:col-span-8">
              <h1 className="relative overflow-visible">
                <motion.span
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
                  className="block font-cormorant font-semibold leading-[0.9] tracking-[-0.03em] text-[15vw] sm:text-[13vw] md:text-[12vw] lg:text-[10.5vw]"
                  style={{ color: "#EDE8E0" }}
                >
                  Prometheon
                  <sup
                    className="text-[0.2em] align-super"
                    style={{ color: "#D4572A" }}
                  >
                    *
                  </sup>
                </motion.span>
              </h1>
            </div>

            {/* Right 4 cols — copy + CTA */}
            <div className="col-span-12 lg:col-span-4 pb-2">
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: DURATION.slow,
                  delay: 0.6,
                  ease: EASE_CINEMATIC,
                }}
                className="text-parchment/90 text-md sm:text-lg md:text-xl leading-relaxed mb-6 drop-shadow-[0_1px_8px_rgba(0,0,0,0.8)]"
              >
                The oracle has always known the answer. Now it knows yours.
                PrometheonAI ingests your documents, reasons across them, and
                delivers precise answers, with every source cited and every step
                of reasoning visible.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: DURATION.slow,
                  delay: 0.85,
                  ease: EASE_CINEMATIC,
                }}
              >
                <MagneticButton>
                  <button
                    onClick={() =>
                      router.push(getAccessToken() ? "/dashboard" : "/login")
                    }
                    className="group rounded-full flex items-center gap-2 pl-6 pr-2 py-2 font-medium text-sm transition-all duration-300 hover:gap-3 cursor-pointer"
                    style={{
                      background: "#D4572A",
                      color: "#EDE8E0",
                      boxShadow: "0 0 0 0 rgba(212,87,42,0)",
                      border: "none",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.boxShadow =
                        "0 0 30px rgba(212,87,42,0.4)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.boxShadow =
                        "0 0 0 0 rgba(212,87,42,0)";
                    }}
                  >
                    The Forge awaits
                    <span
                      className="rounded-full p-2 transition-transform duration-300 group-hover:scale-110"
                      style={{ background: "rgba(237,232,224,0.15)" }}
                    >
                      <ArrowRight
                        className="w-4 h-4"
                        style={{ color: "#EDE8E0" }}
                      />
                    </span>
                  </button>
                </MagneticButton>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── PAGE NUMBER CHIP ─── */
function PageNum({ num, onDark = true }: { num: string; onDark?: boolean }) {
  return (
    <span
      className="font-almarai tracking-[0.3em] uppercase text-xs select-none"
      style={{
        color: onDark ? "rgba(237,232,224,0.4)" : "rgba(23,27,31,0.35)",
      }}
    >
      {num}
    </span>
  );
}

/* ─── SECTION B: ABOUT "THE MYTH" ─── */
function AboutSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({
    target: textRef,
    offset: ["start 0.8", "end 0.2"],
  });

  const bodyText =
    "For too long, organizational knowledge lived in silos—in PDFs no one finished reading, in reports filed and forgotten, in documents that answered questions no one thought to ask. PrometheonAI was built on a simple conviction: if the answer exists anywhere in your organization, you should be able to reach it in seconds—not hours, not days, not after three emails to the right person. We built a platform that ingests your documents, understands their structure and meaning, holds them in memory, and reasons across them on your behalf. Not a search bar. An intelligence that compounds the more you give it.";

  const chars = bodyText.split("");

  return (
    <section
      id="manifesto"
      className="bg-forge-dark py-16 md:py-24 px-6 relative"
      ref={sectionRef}
    >
      <div className="absolute top-6 right-8">
        <PageNum num="02" />
      </div>
      <div className="max-w-6xl mx-auto">
        <div
          className="bg-ember-black rounded-3xl p-12 md:p-20 noise-overlay relative text-center"
          style={{ overflow: "visible" }}
        >
          {/* Label */}
          <p className="text-parchment text-[15px] sm:text-xs tracking-[0.25em] uppercase mb-8 md:mb-12">
            The Prometheus Principle
          </p>

          {/* Multi-style heading */}
          <div className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl max-w-3xl mx-auto leading-[0.95] sm:leading-[0.9] mb-12 md:mb-16">
            <WordsPullUpMultiStyle
              segments={[
                {
                  text: "Prometheus gave humanity fire.",
                  className: "text-parchment font-normal",
                },
                {
                  text: "PrometheonAI",
                  className: "font-serif italic text-ember",
                },
                {
                  text: "gives you organzations the power to read, reason, and remember.",
                  className: "text-parchment font-normal",
                },
              ]}
            />
          </div>

          {/* Scroll-animated body paragraph */}
          <p
            ref={textRef}
            className="text-[#EDE8E0]/90 text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed pb-8"
            style={{ overflow: "visible" }}
          >
            {chars.map((char, i) => (
              <AnimatedLetter
                key={i}
                char={char}
                progress={scrollYProgress}
                index={i}
                total={chars.length}
              />
            ))}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ─── SECTION C: FEATURES "THE FORGE" ─── */
interface FeatureCardData {
  title: string;
  number?: string;
  items?: string[];
  isVideo?: boolean;
  videoText?: string;
  description?: string;
}

const featureCards: FeatureCardData[] = [
  {
    isVideo: true,
    title: "RAG Pipeline",
    videoText: "Knowledge. Summoned instantly.",
  },
  {
    title: "Document Intelligence",
    number: "01",
    items: [
      "Supports PDF, DOCX, and text files",
      "Semantically indexed in under 60 seconds",
      "Answers linked to source passages",
      "Ask follow-up questions naturally",
    ],
    description:
      "Ask anything and receive precise answers with cited sources from your documents.",
  },
  {
    title: "Autonomous Reasoning",
    number: "02",
    items: [
      "Multi-document reasoning in a single query",
      "Live web search when documents aren't enough",
      "Full reasoning trace — every step visible",
      "Calculates, compares, and synthesizes",
    ],
    description:
      "Complex questions are broken into steps and solved transparently using the right tools.",
  },
  {
    title: "Persistent Memory",
    number: "03",
    items: [
      "Remembers facts across sessions automatically",
      "Extracts and stores what matters",
      "Conversation continuity without manual history",
      "Private, deletable memory storage",
    ],
    description:
      "Learns your context over time and continues conversations without repetition.",
  },
];

function FeatureCard({
  card,
  index,
}: {
  card: FeatureCardData;
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-100px", once: true });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 14 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{
        duration: DURATION.slow,
        ease: EASE_ENTRANCE,
        delay: index * 0.1,
      }}
    >
      <SpotlightCard className="rounded-2xl overflow-hidden h-full">
        {card.isVideo ? (
          <div className="relative h-full min-h-[320px] lg:min-h-[480px]">
            <Image
              src={FEAT_URL}
              alt={card.title}
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            <div className="absolute bottom-6 left-6 right-6">
              <p className="text-parchment text-lg sm:text-xl font-medium">
                {card.videoText}
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-ember-black p-5 md:p-6 h-full min-h-[320px] lg:min-h-[480px] flex flex-col">
            <div className="flex items-start justify-between mb-6">
              <div>
                <span className="text-ash-gray text-xs font-mono">
                  {card.number}
                </span>
                <h3 className="text-parchment text-xl sm:text-2xl font-medium mt-1">
                  {card.title}
                </h3>
              </div>
              <button className="text-stone-mid hover:text-parchment transition-colors">
                <ArrowRight className="w-5 h-5 -rotate-45" />
              </button>
            </div>
            <div className="space-y-3 flex-1">
              {card.items?.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-parchment/80 shrink-0 mt-0.5" />
                  <span className="text-ash-gray text-sm">{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </SpotlightCard>
    </motion.div>
  );
}

function FeaturesSection() {
  return (
    <section
      id="capabilities"
      className="bg-forge-dark py-16 md:py-24 px-6 relative"
    >
      <div className="absolute inset-0 bg-noise opacity-[0.15] pointer-events-none" />
      <div className="absolute top-6 right-8 z-10">
        <PageNum num="03" />
      </div>
      <div className="max-w-7xl mx-auto relative">
        {/* Header */}
        <div className="text-center mb-12 md:mb-16">
          <WordsPullUpMultiStyle
            segments={[
              {
                text: "Divine-grade intelligence for mortal problems.",
                className: "text-parchment",
              },
            ]}
            containerClassName="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-normal block"
          />
          <div className="mt-3">
            <WordsPullUpMultiStyle
              segments={[
                {
                  text: "Everything your documents know, finally within reach.",
                  className: "text-ash-gray",
                },
              ]}
              containerClassName="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-normal block"
              delay={0.3}
            />
          </div>
        </div>

        {/* Card grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {featureCards.map((card, i) => (
            <FeatureCard key={i} card={card} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── SECTION D: PHILOSOPHY ─── */
function PhilosophySection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });

  return (
    <section
      className="bg-ember-black py-16 md:py-24 px-6 overflow-hidden relative"
      ref={ref}
    >
      <div className="absolute top-6 right-8">
        <PageNum num="04" />
      </div>
      <div className="max-w-6xl mx-auto">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: DURATION.slow, ease: EASE_CINEMATIC }}
          className="text-stone-mid text-sm tracking-widest uppercase mb-6"
        >
          Our Approach
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 18 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{
            duration: DURATION.slow,
            delay: 0.12,
            ease: EASE_CINEMATIC,
          }}
          className="text-4xl md:text-6xl lg:text-7xl text-parchment leading-[1.1] tracking-tight"
        >
          Pioneering{" "}
          <em className="font-serif italic text-orange-700">ideas</em> for minds
          that
          <br />
          <em className="font-serif italic text-orange-700">
            create, build, and illuminate.
          </em>
        </motion.h2>
      </div>
    </section>
  );
}

/* ─── SECTION E: SPEED × ACCURACY ─── */
function InnovationSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });

  return (
    <section
      id="intelligence"
      className="bg-forge-dark py-16 md:py-24 px-6 relative"
      ref={ref}
    >
      <div className="absolute top-6 right-8">
        <PageNum num="05" />
      </div>
      <div className="max-w-6xl mx-auto">
        <h2 className="text-5xl md:text-7xl lg:text-8xl text-parchment tracking-tight mb-16">
          Accuracy{" "}
          <em className="font-serif italic text-orange-700">&times;</em> Speed
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Left — video */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: DURATION.slow, ease: EASE_CINEMATIC }}
            className="rounded-3xl overflow-hidden aspect-[4/3]"
          >
            <Image src={ZEUS_URL} alt="Zeus demo" fill className="object-cover" />
          </motion.div>

          {/* Right — text blocks */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : undefined}
            transition={{
              duration: DURATION.slow,
              delay: 0.18,
              ease: EASE_CINEMATIC,
            }}
            className="flex flex-col justify-center gap-8"
          >
            <div>
              <h3 className="text-parchment text-lg font-medium mb-3">
                How the retrieval works
              </h3>
              <p className="text-ash-gray text-sm leading-relaxed">
                When you submit a query, PrometheonAI does not keyword-search
                your documents. It converts your question into a semantic vector
                — a mathematical representation of meaning and finds the
                passages in your document library that are most conceptually
                relevant, regardless of exact wording.
              </p>
              <p className="text-ash-gray text-sm leading-relaxed">
                The result - you can ask &quot;what were the main risks identified&quot;
                and surface every risk-related passage across every document you
                have ever uploaded, even if none of them uses the word &quot;risk.&quot;
              </p>
            </div>
            <div className="w-full h-px bg-[#A99985]/20" />
            <div>
              <h3 className="text-parchment text-lg font-medium mb-3">
                How the memory works{" "}
              </h3>
              <p className="text-ash-gray text-sm leading-relaxed">
                After each conversation, PrometheonAI runs a background process
                that reads what was discussed and extracts durable facts — your
                role, your project context, your preferences, recurring topics.
                These facts are stored as embeddings in a private memory store
                and injected into future conversations automatically. You never
                have to say &ldquo;as I mentioned before.&rdquo; It already knows.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ─── SECTION F: SERVICES ─── */
function ServicesSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });

  const services = [
    {
      tag: "Research",
      title: "Literature and document synthesis",
      description:
        "Upload a library of research papers, reports, or case files. Ask cross-document questions. PrometheonAI reads across all of  them simultaneously and synthesizes a grounded answer — with citations to every source it drew from.",
    },
    {
      tag: "Operations",
      title: "Policy and knowledge base navigation",
      description:
        "Stop sending emails to find out what the policy says. Upload your handbooks, SOPs, and guidelines. Anyone on your team can ask any question in plain language and get the right answer in seconds — with the source attached.",
    },
  ];

  return (
    <section className="bg-ember-black py-16 md:py-24 px-6 relative" ref={ref}>
      <div className="absolute top-6 right-8">
        <PageNum num="06" />
      </div>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between mb-12">
          <h2 className="text-3xl md:text-5xl text-parchment tracking-tight">
            What you can do with it
          </h2>
          <span className="text-ash-gray text-sm hidden sm:block">
            Use cases
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {services.map((svc, i) => (
            <motion.div
              key={svc.tag}
              initial={{ opacity: 0, y: 14 }}
              animate={inView ? { opacity: 1, y: 0 } : undefined}
              transition={{
                duration: DURATION.slow,
                delay: i * 0.12,
                ease: EASE_ENTRANCE,
              }}
            >
              <SpotlightCard className="rounded-2xl bg-forge-dark p-8 md:p-10 h-full">
                <span className="text-stone-mid text-xs tracking-widest uppercase">
                  {svc.tag}
                </span>
                <h3 className="text-parchment text-2xl md:text-3xl font-medium mt-3 mb-4">
                  {svc.title}
                </h3>
                <p className="text-ash-gray text-sm leading-relaxed">
                  {svc.description}
                </p>
              </SpotlightCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── SECTION G: FOOTER ─── */
const footerLinks = {
  PRODUCT: [
    "How It Works",
    "Document Forge",
    "Agent Reasoning",
    "Memory Vault",
    "API Reference",
  ],
  COMPANY: ["Our Approach", "The Team", "Manifesto", "Changelog", "Careers"],
  SUPPORT: [
    "Get in Touch",
    "Documentation",
    "Report an Issue",
    "Privacy Policy",
  ],
};

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function TwitterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function LinkedinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function Footer() {
  return (
    <motion.footer
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
      className="liquid-glass rounded-3xl p-6 md:p-10 text-parchment/70 mx-4 md:mx-6 mt-8 md:mt-12 mb-6"
    >
      <div className="grid grid-cols-1 md:grid-cols-12 gap-10 mb-10">
        {/* Left */}
        <div className="md:col-span-5">
          <div className="flex items-center gap-2 mb-4">
            <FlameMark className="w-6 h-6 text-parchment" />
            <span className="text-parchment font-bold text-sm">
              PrometheonAI
            </span>
          </div>
          <p className="text-sm leading-relaxed max-w-sm">
            PrometheonAI is a RAG-powered document intelligence platform built
            for teams who need answers, not search results. Ingest documents,
            reason across them, and remember what matters — all in one place.
          </p>
        </div>

        {/* Right — link columns */}
        <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-8">
          {Object.entries(footerLinks).map(([heading, links]) => (
            <div key={heading}>
              <p className="text-parchment text-xs font-semibold tracking-widest uppercase mb-4">
                {heading}
              </p>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link}>
                    <span className="text-sm hover:text-parchment transition-colors cursor-pointer">
                      {link}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-stone-mid/20 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-xs">
          &copy; 2024 PrometheonAI — Knowledge, within reach.
        </p>
        <div className="flex items-center gap-3">
          {[GithubIcon, TwitterIcon, LinkedinIcon].map((Icon, i) => (
            <span
              key={i}
              className="liquid-glass rounded-full p-3 hover:bg-[#F5F1ED]/10 transition-colors cursor-pointer"
            >
              <Icon />
            </span>
          ))}
        </div>
      </div>
    </motion.footer>
  );
}

/* ─── SECTION: CTA DOUBLE-BUTTON ─── */
function CtaSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });

  return (
    <section className="bg-forge-dark py-16 px-6 relative" ref={ref}>
      <div className="absolute top-6 right-8">
        <PageNum num="07" />
      </div>
      <div className="max-w-3xl mx-auto text-center">
        <motion.p
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : undefined}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="text-ash-gray text-xs tracking-[0.2em] uppercase mb-4"
        >
          Ready when you are
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 14 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.9, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="font-cormorant text-4xl md:text-5xl font-light text-parchment mb-10 tracking-[-0.02em]"
        >
          Enter the forge or consult the oracle.
        </motion.h2>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.8, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link
            href="/dashboard"
            className="group flex items-center gap-2.5 bg-ember text-parchment rounded-full px-7 py-3.5 text-sm font-medium transition-all duration-300 hover:shadow-[0_0_32px_rgba(212,87,42,0.4)]"
          >
            Go to Dashboard
            <span className="w-6 h-6 rounded-full bg-parchment/15 flex items-center justify-center transition-transform duration-200 group-hover:scale-110">
              <ArrowRight className="w-3 h-3" />
            </span>
          </Link>
          <Link
            href="/agent"
            className="group flex items-center gap-2.5 border border-stone-mid/50 text-parchment/80 rounded-full px-7 py-3.5 text-sm font-medium transition-all duration-300 hover:border-ember/50 hover:text-parchment"
          >
            Try AI Agent
            <span className="w-6 h-6 rounded-full border border-stone-mid/50 flex items-center justify-center transition-all duration-200 group-hover:border-ember/50 group-hover:scale-110">
              <ArrowUpRight className="w-3 h-3" />
            </span>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

/* ─── MAIN LANDING PAGE ─── */
export default function LandingPage() {
  return (
    <main className="bg-ember-black min-h-screen">
      <PageReveal />
      <Navbar />
      <HeroSection />
      <StringPoster />
      <AboutSection />
      <FeaturesSection />
      <PhilosophySection />
      <InnovationSection />
      <ServicesSection />
      <CtaSection />
      <Footer />
    </main>
  );
}
