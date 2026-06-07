"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

const EASING: [number, number, number, number] = [0.86, 0, 0.31, 1];
const TITLE_SHADOW =
  "0 4px 40px rgba(0,0,0,0.98), 0 2px 8px rgba(0,0,0,1), 0 0 60px rgba(0,0,0,0.7)";
const LABEL_SHADOW = "0 1px 12px rgba(0,0,0,0.95)";

interface SplitTextProps {
  text: string;
  color: string;
  shadow?: string;
}

function SplitText({ text, color, shadow = TITLE_SHADOW }: SplitTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px" });

  return (
    <span ref={ref} style={{ overflow: "hidden", display: "block" }}>
      <motion.span
        initial={{ y: "35%", opacity: 0 }}
        animate={inView ? { y: "0%", opacity: 1 } : { y: "35%", opacity: 0 }}
        transition={{
          duration: 0.75,
          ease: EASING,
        }}
        className="inline-block font-cormorant"
        style={{ color, textShadow: shadow, willChange: "transform" }}
      >
        {text}
      </motion.span>
    </span>
  );
}

const TITLE_CSS: React.CSSProperties = {
  textTransform: "uppercase",
  lineHeight: 0.85,
  fontSize: "clamp(4.5rem, 10vw, 9rem)",
  fontWeight: 400,
  letterSpacing: "-0.02em",
};

export default function StringPoster() {

  const words: Array<{
    text: string;
    color: string;
    col: string;
    row: string;
    align: "start" | "end";
    ml?: string;
    mr?: string;
    shadow?: string;
  }> = [
    {
      text: "The",
      color: "#EDE8E0",
      col: "1 / 11",
      row: "4 / 5",
      align: "start",
      ml: "1rem",
    },
    {
      text: "Forge",
      color: "#D4572A",
      col: "1 / 11",
      row: "6 / 7",
      align: "start",
      ml: "1rem",
      shadow: "0 4px 32px rgba(0,0,0,0.95), 0 2px 8px rgba(0,0,0,1)",
    },
    {
      text: "Never",
      color: "#D3D3D3",
      col: "1 / 11",
      row: "6 / 7",
      align: "end",
      mr: "1rem",
    },
    {
      text: "Forgets",
      color: "#EDE8E0",
      col: "1 / 11",
      row: "8 / 9",
      align: "start",
      ml: "1rem",
    },
    {
      text: "The",
      color: "#EDE8E0",
      col: "1 / 11",
      row: "10 / 11",
      align: "end",
      mr: "1rem",
    },
    {
      text: "Oracle",
      color: "#D3D3D3",
      col: "1 / 11",
      row: "12 / 13",
      align: "start",
      ml: "1rem",
    },
    {
      text: "Always",
      color: "#D4572A",
      col: "1 / 11",
      row: "12 / 13",
      align: "end",
      mr: "1rem",
    },
    {
      text: "Remembers",
      color: "#EDE8E0",
      col: "1 / 11",
      row: "14 / 15",
      align: "end",
      mr: "1rem",
      shadow: "0 4px 32px rgba(0,0,0,0.95), 0 2px 8px rgba(0,0,0,1)",
    },
  ];

  return (
    <section
      className="relative overflow-hidden"
      style={{ minHeight: "100vh", backgroundColor: "#171B1F" }}
    >
      {/* Gradient fades */}
      <div
        className="absolute top-0 inset-x-0 z-10 pointer-events-none"
        style={{
          height: 80,
          background: "linear-gradient(to bottom, #171B1F, transparent)",
        }}
      />
      <div
        className="absolute bottom-0 inset-x-0 z-10 pointer-events-none"
        style={{
          height: 80,
          background: "linear-gradient(to top, #171B1F, transparent)",
        }}
      />

      {/* Background */}
      <div className="absolute inset-0 overflow-hidden">
        <img
          src="/StringPosterBG.png"
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.42) 40%, rgba(0,0,0,0.72) 100%)",
          }}
        />
      </div>

      {/* Poster grid */}
      <div
        className="relative z-[1] mx-4 md:mx-8 lg:mx-16"
        style={{ marginTop: "calc(55vh)", marginBottom: "calc(3.815rem * 2)" }}
      >
        {/* Quote — above the grid */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "60px" }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="font-cormorant italic text-center"
          style={{
            color: "rgba(237,232,224,0.92)",
            fontSize: "clamp(2rem, 2vw, 7rem)",
            lineHeight: 1.45,
            letterSpacing: "-0.01em",
            textShadow: TITLE_SHADOW,
            marginBottom: "clamp(2rem, 4vw, 4rem)",
            paddingLeft: "clamp(1rem, 8vw, 10rem)",
            paddingRight: "clamp(1rem, 8vw, 10rem)",
          }}
        >
          &ldquo;Prometheus carried fire across the sky so humanity could see in
          the dark. We built PrometheonAI so your organization never has to
          search in it.&rdquo;
        </motion.p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(10, 1fr)",
            gridTemplateRows: "repeat(17, auto)",
            columnGap: "0.4rem",
            rowGap: "clamp(0.6rem, 1.8vw, 2.2rem)",
            position: "relative",
          }}
        >
          {/* Top centre label */}
          <span
            className="font-almarai tracking-[0.32em] uppercase text-center"
            style={{
              gridColumn: "1 / 11",
              gridRow: "1 / 2",
              marginTop: "5vw",
              color: "rgba(237,232,224,0.55)",
              fontSize: "clamp(0.75rem, 1vw, 0.9rem)",
              textShadow: LABEL_SHADOW,
            }}
          >
            01
          </span>

          {/* Decorative top-left row */}
          <div
            className="flex items-center font-almarai tracking-[0.24em] uppercase"
            style={{
              gridColumn: "1 / 11",
              gridRow: "1 / 2",
              alignSelf: "start",
              marginTop: "5vw",
              paddingLeft: "1rem",
              gap: "clamp(1.2rem, 1.2vw, 1.2rem)",
              color: "rgba(237,232,224,0.75)",
              fontSize: "clamp(0.8rem, 1.1vw, 1rem)",
              textShadow: LABEL_SHADOW,
            }}
          >
            <span>Knowledge</span>
            <span style={{ color: "#D4572A", opacity: 0.9 }}>·</span>
            <span>Reasoning</span>
            <span style={{ color: "#D4572A", opacity: 0.9 }}>·</span>
            <span>Accuracy</span>
          </div>

          {/* 7 horizontal dividers */}
          {[
            "3 / 4",
            "5 / 6",
            "7 / 8",
            "9 / 10",
            "11 / 12",
            "13 / 14",
            "15 / 16",
          ].map((row, i) => (
            <span
              key={i}
              style={{
                gridColumn: "1 / 11",
                gridRow: row,
                borderBottom: "1px solid rgba(237,232,224,0.18)",
                height: 0,
                marginLeft: "1rem",
                marginRight: "1rem",
                alignSelf: "end",
              }}
            />
          ))}

          {/* Giant title words */}
          {words.map((word, i) => {
            return (
              <div
                key={i}
                style={{
                  ...TITLE_CSS,
                  gridColumn: word.col,
                  gridRow: word.row,
                  justifySelf: word.align === "end" ? "right" : "start",
                  marginLeft: word.ml,
                  marginRight: word.mr,
                  paddingTop: "clamp(0.4rem, 1vw, 1.2rem)",
                  paddingBottom: "clamp(0.4rem, 1vw, 1.2rem)",
                }}
              >
                <SplitText
                  text={word.text}
                  color={word.color}
                  shadow={word.shadow}
                />
              </div>
            );
          })}

          {/* Mid decorative label — Fire & Knowledge */}
          <span
            className="font-almarai tracking-[0.24em] uppercase"
            style={{
              gridColumn: "1 / 6",
              gridRow: "10 / 11",
              alignSelf: "center",
              justifySelf: "left",
              paddingLeft: "1rem",
              color: "rgba(237,232,224,0.72)",
              fontSize: "clamp(0.8rem, 1.1vw, 1rem)",
              textShadow: LABEL_SHADOW,
            }}
          ></span>

          {/* Mid decorative label — Forged & Molded */}
          <span
            className="font-almarai tracking-[0.24em] uppercase"
            style={{
              gridColumn: "6 / 11",
              gridRow: "12 / 13",
              alignSelf: "center",
              justifySelf: "left",
              color: "rgba(237,232,224,0.72)",
              fontSize: "clamp(0.8rem, 1.1vw, 1rem)",
              textShadow: LABEL_SHADOW,
            }}
          ></span>

          {/* Bottom centre label */}
          <span
            className="font-almarai tracking-[0.32em] uppercase text-center"
            style={{
              gridColumn: "1 / 11",
              gridRow: "17 / 18",
              marginBottom: "5vw",
              color: "rgba(237,232,224,0.55)",
              fontSize: "clamp(0.75rem, 1vw, 0.9rem)",
              textShadow: LABEL_SHADOW,
            }}
          >
            {" "}
          </span>
        </div>
      </div>
    </section>
  );
}
