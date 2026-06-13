"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { setAccessToken } from "@/hooks/useAuth";
import { MagneticButton, WordsPullUp } from "@/components/ui/motion";
import { cn } from "@/lib/cn";
import { HlsVideo } from "@/components/auth/HlsVideo";

const FORM_BG_HLS =
  "https://stream.mux.com/01yW6GoUz01OTXk5w1Rt1MHkJWlCGIwj46SUONJZ4DJUE.m3u8";

interface FormState {
  email: string;
  password: string;
  confirmPassword: string;
}

interface FormErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validate(values: FormState): FormErrors {
  const errs: FormErrors = {};
  if (!values.email) errs.email = "Email is required";
  else if (!validateEmail(values.email))
    errs.email = "Enter a valid email address";
  if (!values.password) errs.password = "Password is required";
  else if (values.password.length < 8)
    errs.password = "Password must be at least 8 characters";
  else if (!/\d/.test(values.password))
    errs.password = "Password must contain at least one number";
  if (!values.confirmPassword)
    errs.confirmPassword = "Please confirm your password";
  else if (values.confirmPassword !== values.password)
    errs.confirmPassword = "Passwords do not match";
  return errs;
}

function MailIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1" y="3" width="14" height="10" rx="1.5" />
      <path d="M1 5l7 5 7-5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="7" width="10" height="8" rx="1.5" />
      <path d="M5 7V5a3 3 0 016 0v2" />
    </svg>
  );
}

function EyeIcon({ off }: { off?: boolean }) {
  return off ? (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 1l14 14M6.5 6.6A2 2 0 0110 10" />
      <path d="M4.4 4.5C2.6 5.7 1 8 1 8s3 5 7 5c1.4 0 2.7-.5 3.8-1.3" />
      <path d="M11 11.3C13 10 15 8 15 8s-3-5-7-5c-.9 0-1.7.2-2.5.5" />
    </svg>
  ) : (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  );
}

function FlameMark() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="w-6 h-6">
      <path
        d="M16 3c0 0-5.5 5.5-5.5 11 0 3.5 2 5.5 2 5.5s-.7-2.8 1.4-4.8c.7 2.8 2.8 4.8 2.8 7.7 1.4-1.4 2.1-3.5 2.1-5.5 1.4 2.1 1.4 4.8 1.4 4.8s2.8-2.8 2.8-5.5C23.1 11 19 6.5 19 6.5s.7 4.2-2.1 5.5C15.5 8.5 16 3 16 3z"
        fill="#F5F1ED"
        opacity="0.95"
      />
      <circle cx="16" cy="27" r="2" fill="#F5F1ED" opacity="0.5" />
    </svg>
  );
}

function AuthInput({
  label,
  type,
  name,
  value,
  onChange,
  error,
  placeholder,
  autoComplete,
  icon,
  showToggle,
  onToggle,
  toggleLabel,
}: {
  label: string;
  type: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  placeholder: string;
  autoComplete: string;
  icon: React.ReactNode;
  showToggle?: boolean;
  onToggle?: () => void;
  toggleLabel?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-parchment/80 mb-1.5 block">
        {label}
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ash-gray">
          {icon}
        </span>
        <input
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={cn(
            "w-full bg-forge-dark border border-stone-mid/40 rounded-xl pl-10 py-2.5 text-sm text-parchment placeholder-ash-gray",
            "transition-all duration-200",
            "focus:outline-none",
            showToggle !== undefined ? "pr-10" : "pr-4",
            error && "border-red-500/50",
          )}
          style={{ boxShadow: "none" }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "rgba(212,87,42,0.6)";
            e.currentTarget.style.boxShadow =
              "0 0 0 2px rgba(212,87,42,0.2), 0 0 20px rgba(212,87,42,0.08)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
        {showToggle !== undefined && onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={toggleLabel}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ash-gray hover:text-parchment transition-colors"
          >
            <EyeIcon off={showToggle} />
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [shake, setShake] = useState(false);

  function handleChange(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const updated = { ...form, [field]: e.target.value };
      setForm(updated);
      if (submitted) setErrors(validate(updated));
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setServerError(null);

    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data.message ?? "Registration failed");
        setShake(true);
        setTimeout(() => setShake(false), 500);
        return;
      }
      setAccessToken(data.accessToken);
      router.push("/dashboard");
    } catch {
      setServerError("Network error — please try again");
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-ember-black">
      {/* Left — image panel (desktop only) */}
      <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden">
        <Image
          src="/prometheon-feature-card.jpeg"
          alt=""
          fill
          className="object-cover"
        />
        {/* Right-edge blend */}
        <div
          className="absolute inset-y-0 right-0 w-32 pointer-events-none"
          style={{
            background: "linear-gradient(to right, transparent, #171B1F)",
          }}
        />
        {/* Content — lifted above bottom */}
        <div className="absolute bottom-[0] left-0 right-0 px-10">
          <div className="liquid-glass rounded-2xl p-6 max-w-md">
            <p className="font-serif italic text-[#1a1007]/90 text-lg leading-relaxed">
              <WordsPullUp text="The fire of knowledge was never meant for the few. Forge your identity, claim the flame, and become eternal." />
            </p>
          </div>
          <div className="flex items-center gap-2 mt-6">
            <svg viewBox="0 0 32 32" fill="none" className="w-6 h-6">
              <path
                d="M16 3c0 0-5.5 5.5-5.5 11 0 3.5 2 5.5 2 5.5s-.7-2.8 1.4-4.8c.7 2.8 2.8 4.8 2.8 7.7 1.4-1.4 2.1-3.5 2.1-5.5 1.4 2.1 1.4 4.8 1.4 4.8s2.8-2.8 2.8-5.5C23.1 11 19 6.5 19 6.5s.7 4.2-2.1 5.5C15.5 8.5 16 3 16 3z"
                fill="#1a1007"
                opacity="0.95"
              />
              <circle cx="16" cy="27" r="2" fill="#1a1007" opacity="0.5" />
            </svg>
            <span className="text-[#1a1007] font-bold text-sm">
              PrometheonAI
            </span>
          </div>
        </div>
      </div>

      {/* Right — form panel with video texture */}
      <div className="flex flex-1 items-center justify-center px-6 py-12 relative overflow-hidden">
        <HlsVideo
          src={FORM_BG_HLS}
          className="absolute inset-0 w-full h-full object-cover opacity-[0.70]"
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(to right, #171B1F 0%, rgba(23,27,31,0.85) 25%, rgba(23,27,31,0.75) 100%)",
          }}
        />
        <motion.div
          animate={shake ? { x: [0, -8, 8, -4, 4, 0] } : { x: 0 }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
          className="relative z-10 w-full max-w-sm"
        >
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <FlameMark />
            <span className="text-[#F5F1ED] font-bold text-sm">
              PrometheonAI
            </span>
          </div>

          <h1 className="font-cormorant text-3xl font-light tracking-tight text-parchment">
            Forge Your Identity
          </h1>
          <p className="mt-1.5 text-sm text-ash-gray">
            Claim the fire. Become eternal.{" "}
            <Link
              href="/login"
              className="font-medium text-parchment/80 hover:text-parchment transition-colors"
            >
              Sign in
            </Link>
          </p>

          <AnimatePresence>
            {serverError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                role="alert"
                className="mt-5 flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-3"
              >
                <svg
                  className="size-4 shrink-0 text-red-400 mt-0.5"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm-.75 4.5h1.5v5h-1.5v-5zm.75 7.5a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                </svg>
                <p className="text-sm text-red-400">{serverError}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            <AuthInput
              label="Email"
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange("email")}
              error={submitted ? errors.email : undefined}
              placeholder="you@example.com"
              autoComplete="email"
              icon={<MailIcon />}
            />

            <AuthInput
              label="Password"
              type={showPassword ? "text" : "password"}
              name="password"
              value={form.password}
              onChange={handleChange("password")}
              error={submitted ? errors.password : undefined}
              placeholder="Min. 8 characters, at least 1 number"
              autoComplete="new-password"
              icon={<LockIcon />}
              showToggle={showPassword}
              onToggle={() => setShowPassword((v) => !v)}
              toggleLabel={showPassword ? "Hide password" : "Show password"}
            />

            <AuthInput
              label="Confirm password"
              type={showPassword ? "text" : "password"}
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={handleChange("confirmPassword")}
              error={submitted ? errors.confirmPassword : undefined}
              placeholder="Re-enter your password"
              autoComplete="new-password"
              icon={<LockIcon />}
            />

            <MagneticButton className="w-full">
              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className={cn(
                  "w-full bg-ember text-parchment rounded-full py-3 text-sm font-medium",
                  "transition-all duration-200",
                  "hover:shadow-[0_0_30px_rgba(212,87,42,0.35)]",
                  "disabled:opacity-60 disabled:cursor-not-allowed",
                )}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Forging...
                  </span>
                ) : (
                  "Forge Your Identity"
                )}
              </motion.button>
            </MagneticButton>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
