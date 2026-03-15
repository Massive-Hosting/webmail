/** Login page with centered card — premium design */

import React, { useState, useCallback } from "react";
import { login } from "@/api/client.ts";
import type { ApiError } from "@/api/client.ts";
import { Mail, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";

interface LoginPageProps {
  onLoginSuccess: () => void;
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateEmail = (value: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  };

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!validateEmail(email)) {
        setError("Please enter a valid email address.");
        return;
      }

      if (!password) {
        setError("Please enter your password.");
        return;
      }

      setIsSubmitting(true);

      try {
        await login({ email, password, rememberMe });
        onLoginSuccess();
      } catch (err) {
        const apiErr = err as ApiError;
        if (apiErr.status === 429) {
          setError("Too many login attempts. Please try again in a few minutes.");
        } else if (apiErr.status === 401) {
          setError("Invalid email or password.");
        } else {
          setError("An error occurred. Please try again.");
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, password, rememberMe, onLoginSuccess],
  );

  return (
    <div
      className="flex items-center justify-center min-h-dvh p-4"
      style={{
        background: "linear-gradient(135deg, var(--color-bg-secondary) 0%, var(--color-bg-primary) 50%, var(--color-bg-secondary) 100%)",
      }}
    >
      {/* Subtle decorative gradient orb */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 pointer-events-none"
        style={{
          width: 600,
          height: 400,
          background: "radial-gradient(ellipse at center, rgba(99, 102, 241, 0.08) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />

      <div
        className="w-full max-w-sm animate-fade-in relative"
        style={{
          backgroundColor: "var(--color-bg-elevated)",
          boxShadow: "var(--shadow-xl)",
          border: "1px solid var(--color-border-primary)",
          borderRadius: "var(--radius-lg)",
          padding: "36px 32px 32px",
        }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="flex items-center justify-center w-12 h-12 mb-4"
            style={{
              backgroundColor: "var(--color-bg-accent)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "0 4px 12px rgba(99, 102, 241, 0.25)",
            }}
          >
            <Mail size={22} style={{ color: "var(--color-text-inverse)" }} />
          </div>
          <h1
            className="text-xl font-semibold"
            style={{ color: "var(--color-text-primary)", letterSpacing: "-0.01em" }}
          >
            Sign in to Webmail
          </h1>
          <p
            className="text-sm mt-1.5"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Enter your credentials to continue
          </p>
        </div>

        {/* Error */}
        {error && (
          <div
            className="flex items-start gap-2.5 px-3.5 py-3 mb-5 text-sm animate-fade-in"
            style={{
              backgroundColor: "rgba(220, 38, 38, 0.06)",
              color: "var(--color-text-danger)",
              border: "1px solid rgba(220, 38, 38, 0.12)",
              borderRadius: "var(--radius-md)",
              lineHeight: "1.4",
            }}
          >
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--color-text-primary)" }}
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full h-10 px-3 text-sm outline-none"
              style={{
                backgroundColor: "var(--color-bg-primary)",
                color: "var(--color-text-primary)",
                border: "1px solid var(--color-border-primary)",
                borderRadius: "var(--radius-md)",
                transition: "border-color 150ms ease, box-shadow 150ms ease",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border-focus)";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(99, 102, 241, 0.1)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border-primary)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--color-text-primary)" }}
            >
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full h-10 px-3 pr-10 text-sm outline-none"
                style={{
                  backgroundColor: "var(--color-bg-primary)",
                  color: "var(--color-text-primary)",
                  border: "1px solid var(--color-border-primary)",
                  borderRadius: "var(--radius-md)",
                  transition: "border-color 150ms ease, box-shadow 150ms ease",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-border-focus)";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(99, 102, 241, 0.1)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-border-primary)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors duration-150 hover:bg-[var(--color-bg-tertiary)]"
                style={{ color: "var(--color-text-tertiary)" }}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Remember me */}
          <div className="flex items-center gap-2.5">
            <input
              id="remember"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded accent-[var(--color-bg-accent)]"
              style={{ borderRadius: "4px" }}
            />
            <label
              htmlFor="remember"
              className="text-sm"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Remember me
            </label>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center justify-center h-10 text-sm font-medium disabled:opacity-60"
            style={{
              backgroundColor: "var(--color-bg-accent)",
              color: "var(--color-text-inverse)",
              borderRadius: "var(--radius-md)",
              transition: "background-color 150ms ease, transform 100ms ease, box-shadow 150ms ease",
              boxShadow: "0 1px 3px rgba(99, 102, 241, 0.2)",
            }}
            onMouseOver={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.backgroundColor = "var(--color-bg-accent-hover)";
                e.currentTarget.style.boxShadow = "0 2px 8px rgba(99, 102, 241, 0.3)";
              }
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-bg-accent)";
              e.currentTarget.style.boxShadow = "0 1px 3px rgba(99, 102, 241, 0.2)";
            }}
            onMouseDown={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.transform = "scale(0.98)";
              }
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            {isSubmitting ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              "Sign in"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
