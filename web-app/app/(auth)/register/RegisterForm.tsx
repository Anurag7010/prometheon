"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Divider } from "@/components/ui/Divider";
import { Stack } from "@/components/ui/Stack";
import { setAccessToken } from "@/hooks/useAuth";

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
        return;
      }

      setAccessToken(data.accessToken);
      router.push("/dashboard");
    } catch {
      setServerError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-start justify-center pt-20 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">AI Product</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create your account
          </p>
        </div>

        <div className="card p-8">
          <h2 className="text-xl font-semibold text-foreground mb-6">
            Create account
          </h2>

          {serverError && (
            <Alert
              variant="error"
              className="mb-6"
              dismissible
              onDismiss={() => setServerError(null)}
            >
              {serverError}
            </Alert>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <Stack direction="column" gap={4}>
              <Input
                label="Email"
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange("email")}
                error={submitted ? errors.email : undefined}
                placeholder="you@example.com"
                autoComplete="email"
                fullWidth
              />

              <Input
                label="Password"
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange("password")}
                error={submitted ? errors.password : undefined}
                placeholder="Min. 8 characters, at least 1 number"
                autoComplete="new-password"
                fullWidth
              />

              <Input
                label="Confirm password"
                type="password"
                name="confirmPassword"
                value={form.confirmPassword}
                onChange={handleChange("confirmPassword")}
                error={submitted ? errors.confirmPassword : undefined}
                placeholder="••••••••"
                autoComplete="new-password"
                fullWidth
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={loading}
                className="w-full mt-2"
              >
                Create account
              </Button>
            </Stack>
          </form>

          <Divider label="or" className="my-6" />

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-primary font-medium hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
