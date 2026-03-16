/** Premium split-screen login page */

import React, { useState, useCallback } from "react";
import { login } from "@/api/client.ts";
import type { ApiError } from "@/api/client.ts";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  CalendarDays,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { LANGUAGES } from "@/i18n/index.ts";
import { StyledSelect } from "@/components/ui/styled-select.tsx";

interface LoginPageProps {
  onLoginSuccess: () => void;
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shakeError, setShakeError] = useState(false);

  const validateEmail = (value: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  };

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setShakeError(false);

      if (!validateEmail(email)) {
        setError(t("login.invalidEmail"));
        setShakeError(true);
        return;
      }

      if (!password) {
        setError(t("login.enterPassword"));
        setShakeError(true);
        return;
      }

      setIsSubmitting(true);

      try {
        await login({ email, password, rememberMe });
        onLoginSuccess();
      } catch (err) {
        const apiErr = err as ApiError;
        setShakeError(true);
        if (apiErr.status === 429) {
          setError(t("login.rateLimited"));
        } else if (apiErr.status === 401) {
          setError(t("login.invalidCredentials"));
        } else {
          setError(t("login.genericError"));
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, password, rememberMe, onLoginSuccess, t],
  );

  const features = [
    { icon: Sparkles, text: t("login.feature1") },
    { icon: ShieldCheck, text: t("login.feature2") },
    { icon: CalendarDays, text: t("login.feature3") },
  ];

  return (
    <div className="login-page">
      {/* Left hero panel */}
      <div className="login-hero">
        <div className="login-hero__gradient" />
        <div className="login-hero__content">
          {/* Logo */}
          <div className="login-hero__logo">
            <img src="/logo.png" alt="Webmail" className="login-hero__logo-img" />
            <span className="login-hero__logo-text">Webmail</span>
          </div>

          {/* Tagline */}
          <div className="login-hero__tagline-area">
            <h1 className="login-hero__tagline">{t("login.tagline")}</h1>
            <p className="login-hero__tagline-sub">{t("login.subtitle")}</p>
          </div>

          {/* Features */}
          <div className="login-hero__features">
            {features.map((f, i) => (
              <div key={i} className="login-hero__feature">
                <div className="login-hero__feature-icon">
                  <f.icon size={18} />
                </div>
                <span className="login-hero__feature-text">{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="login-form-panel">
        <div className="login-form-card">
          {/* Mobile logo (hidden on desktop) */}
          <div className="login-form-card__mobile-logo">
            <img src="/logo.png" alt="Webmail" className="login-hero__logo-img" />
            <span className="login-hero__logo-text" style={{ color: "var(--color-text-primary)" }}>
              Webmail
            </span>
          </div>

          {/* Heading */}
          <div className="login-form-card__header">
            <h2 className="login-form-card__title">{t("login.welcomeBack")}</h2>
            <p className="login-form-card__subtitle">{t("login.subtitle")}</p>
          </div>

          {/* Error */}
          {error && (
            <div
              className={`login-form-card__error ${shakeError ? "login-shake" : ""}`}
              onAnimationEnd={() => setShakeError(false)}
            >
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="login-form">
            {/* Email */}
            <div className="login-input-group">
              <label htmlFor="login-email" className="login-input-label">
                {t("login.emailLabel")}
              </label>
              <div className="login-input-wrapper">
                <Mail size={18} className="login-input-icon" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("login.emailPlaceholder")}
                  className="login-input"
                />
              </div>
            </div>

            {/* Password */}
            <div className="login-input-group">
              <label htmlFor="login-password" className="login-input-label">
                {t("login.passwordLabel")}
              </label>
              <div className="login-input-wrapper">
                <Lock size={18} className="login-input-icon" />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("login.passwordPlaceholder")}
                  className="login-input login-input--password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="login-input-toggle"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <div className="login-remember">
              <input
                id="login-remember"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="login-remember__checkbox"
              />
              <label htmlFor="login-remember" className="login-remember__label">
                {t("login.rememberMe")}
              </label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="login-submit"
            >
              {isSubmitting ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  <span>{t("login.signInButton")}</span>
                  <ArrowRight size={16} className="login-submit__arrow" />
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="login-form-card__footer">
            <div className="login-form-card__powered">
              {t("login.poweredBy")} &middot; JMAP
            </div>
            <div className="login-form-card__lang">
              <StyledSelect
                value={i18n.language}
                onValueChange={(v) => {
                  i18n.changeLanguage(v);
                  localStorage.setItem("language", v);
                }}
                options={LANGUAGES.map((lang) => ({
                  value: lang.code,
                  label: lang.label,
                }))}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
