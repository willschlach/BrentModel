import { useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ConfigError } from "../auth/ConfigError";
import { messageFor } from "../lib/authErrors";
import { safeRedirectPath } from "../lib/redirect";

export function LoginPage() {
  const { state, signIn } = useAuth();
  const [params] = useSearchParams();
  const destination = safeRedirectPath(params.get("from"));

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<"email" | "password" | null>(null);

  // If the app ended the session (for example the account was disabled), say why.
  const notice = state.status === "signedOut" && state.notice ? messageFor(state.notice) : null;

  useEffect(() => {
    document.title = "Sign in · Brent Hedging Model";
  }, []);

  if (state.status === "misconfigured") return <ConfigError />;
  if (state.status === "signedIn") return <Navigate to={destination} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!email.trim()) {
      setInvalid("email");
      setError("Enter your email address.");
      emailRef.current?.focus();
      return;
    }
    if (!password) {
      setInvalid("password");
      setError("Enter your password.");
      passwordRef.current?.focus();
      return;
    }
    setBusy(true);
    setInvalid(null);
    setError(null);
    const result = await signIn(email.trim(), password);
    setBusy(false);
    if (!result.ok) {
      setError(messageFor(result.reason));
      setPassword("");
      passwordRef.current?.focus();
    }
    // On success the auth state changes and this page redirects.
  }

  const shown = error ?? notice;
  return (
    <main id="main" className="login-page">
      <form className="login-card" onSubmit={onSubmit} noValidate>
        <h1>Sign in</h1>
        <p className="lede">Brent Hedging Model</p>

        <div className="field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            ref={emailRef}
            type="email"
            name="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={invalid === "email"}
            aria-describedby="login-error"
            disabled={busy}
          />
        </div>

        <div className="field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            ref={passwordRef}
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={invalid === "password"}
            aria-describedby="login-error"
            disabled={busy}
          />
        </div>

        {/* Always rendered, so assistive technology is already watching it when text appears. */}
        <div id="login-error" role="alert" className="form-error">
          {shown}
        </div>

        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
