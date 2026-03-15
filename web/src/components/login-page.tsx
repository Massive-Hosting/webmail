/** Login page with centered card */

import React, { useState, useCallback } from "react";
import { login } from "@/api/client.ts";
import type { ApiError } from "@/api/client.ts";
import { Mail, Eye, EyeOff, Loader2 } from "lucide-react";

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
      style={{ backgroundColor: "var(--color-bg-secondary)" }}
    >
      <div
        className="w-full max-w-sm rounded-xl p-8"
        style={{
          backgroundColor: "var(--color-bg-elevated)",
          boxShadow: "var(--shadow-lg)",
          border: "1px solid var(--color-border-primary)",
        }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <div
            className="flex items-center justify-center w-12 h-12 rounded-xl mb-3"
            style={{ backgroundColor: "var(--color-bg-accent)" }}
          >
            <Mail size={24} style={{ color: "var(--color-text-inverse)" }} />
          </div>
          <h1
            className="text-xl font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Sign in to Webmail
          </h1>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Enter your credentials to continue
          </p>
        </div>

        {/* Error */}
        {error && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-md mb-4 text-sm"
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              color: "var(--color-text-danger)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
            }}
          >
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium mb-1.5"
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
              className="w-full h-10 px-3 text-sm rounded-md outline-none transition-colors duration-150"
              style={{
                backgroundColor: "var(--color-bg-primary)",
                color: "var(--color-text-primary)",
                border: "1px solid var(--color-border-primary)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border-focus)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border-primary)";
              }}
            />
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium mb-1.5"
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
                className="w-full h-10 px-3 pr-10 text-sm rounded-md outline-none transition-colors duration-150"
                style={{
                  backgroundColor: "var(--color-bg-primary)",
                  color: "var(--color-text-primary)",
                  border: "1px solid var(--color-border-primary)",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-border-focus)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-border-primary)";
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded"
                style={{ color: "var(--color-text-tertiary)" }}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Remember me */}
          <div className="flex items-center gap-2">
            <input
              id="remember"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded accent-[var(--color-bg-accent)]"
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
            className="flex items-center justify-center h-10 rounded-md text-sm font-medium transition-colors duration-150 disabled:opacity-60"
            style={{
              backgroundColor: "var(--color-bg-accent)",
              color: "var(--color-text-inverse)",
            }}
            onMouseOver={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.backgroundColor = "var(--color-bg-accent-hover)";
              }
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-bg-accent)";
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
