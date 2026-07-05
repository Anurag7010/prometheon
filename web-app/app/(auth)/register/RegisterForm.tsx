"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { setAccessToken } from "@/hooks/useAuth";
import { cn } from "@/lib/cn";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthField } from "@/components/auth/AuthField";

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
    <AuthShell>
      <motion.div
        animate={shake ? { x: [0, -8, 8, -4, 4, 0] } : { x: 0 }}
        transition={{ duration: 0.4, ease: "easeInOut" }}
      >
        <h1 className="font-cormorant text-3xl font-light tracking-tight text-parchment">
          Forge your identity
        </h1>
        <p className="mt-2 text-sm text-ash-gray">
          Claim the fire — it&apos;s free.{" "}
          <Link
            href="/login"
            className="font-medium text-ember transition-colors hover:text-ember/80"
          >
            Sign in instead
          </Link>
        </p>

        <AnimatePresence>
          {serverError && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              role="alert"
              className="mt-6 flex items-start gap-2.5 rounded-xl border border-error-500/30 bg-error-500/10 px-3.5 py-3"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-error-500" />
              <p className="text-sm text-error-500">{serverError}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-4">
          <AuthField
            label="Email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange("email")}
            placeholder="you@example.com"
            autoComplete="email"
            icon={Mail}
            error={submitted ? errors.email : undefined}
          />

          <AuthField
            label="Password"
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange("password")}
            placeholder="Min. 8 characters, at least 1 number"
            autoComplete="new-password"
            icon={Lock}
            passwordToggle
            error={submitted ? errors.password : undefined}
          />

          <AuthField
            label="Confirm password"
            name="confirmPassword"
            type="password"
            value={form.confirmPassword}
            onChange={handleChange("confirmPassword")}
            placeholder="Re-enter your password"
            autoComplete="new-password"
            icon={Lock}
            passwordToggle
            error={submitted ? errors.confirmPassword : undefined}
          />

          <button
            type="submit"
            disabled={loading}
            className={cn(
              "group mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ember text-sm font-semibold text-parchment",
              "transition-all duration-200 hover:bg-ember/90 hover:shadow-[0_0_30px_rgba(212,87,42,0.35)]",
              "active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Forging…
              </>
            ) : (
              <>
                Create account
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </form>
      </motion.div>
    </AuthShell>
  );
}
