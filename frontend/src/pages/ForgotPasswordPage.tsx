import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ConfigError } from "../auth/ConfigError";
import { requestResetCode } from "../auth/passwordReset";
import { requestMessage } from "../lib/resetErrors";
import { normalizeEmail } from "../lib/resetCode";

// Step one of a password reset: ask for a code. The answer is the same whether or not the address
// has an account, because the server does not say and neither should this page.
export function ForgotPasswordPage() {
  const { state } = useAuth();
  const [params] = useSearchParams();
  const emailRef = useRef<HTMLInputElement>(null);
  const sentRef = useRef<HTMLHeadingElement>(null);
  const inFlight = useRef(false);

  const [email, setEmail] = useState(params.get("email") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Forgot password · Brent Hedging Model";
  }, []);
  useEffect(() => {
    if (sentTo) sentRef.current?.focus();
  }, [sentTo]);

  if (state.status === "misconfigured") return <ConfigError />;
  if (state.status === "signedIn") return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    const target = normalizeEmail(email);
    if (!target) {
      setError("Enter your email address.");
      emailRef.current?.focus();
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const result = await requestResetCode(target);
    inFlight.current = false;
    setBusy(false);
    if (result.ok) {
      setSentTo(target);
      return;
    }
    setError(requestMessage(result.reason));
    emailRef.current?.focus();
  }

  if (sentTo) {
    return (
      <main id="main" className="login-page">
        <div className="login-card">
          <h1 ref={sentRef} tabIndex={-1}>Check your email</h1>
          <p role="status">
            If an account exists for {sentTo}, a 6-digit code has been sent. It works once and expires in 10 minutes.
          </p>
          <p><Link className="button-link" to={`/reset-password?email=${encodeURIComponent(sentTo)}`}>Enter the code</Link></p>
          <p className="form-alt">
            Wrong address?{" "}
            <button type="button" className="link-text" onClick={() => setSentTo(null)}>Use a different email</button>
          </p>
          <p className="form-alt"><Link to="/login">Back to sign in</Link></p>
        </div>
      </main>
    );
  }

  return (
    <main id="main" className="login-page">
      <form className="login-card" onSubmit={onSubmit} noValidate>
        <h1>Forgot your password?</h1>
        <p className="lede">Enter your email and we will send you a 6-digit code.</p>

        <div className="field">
          <label htmlFor="forgot-email">Email</label>
          <input
            id="forgot-email" ref={emailRef} type="email" name="email" autoComplete="username"
            value={email} onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error !== null} aria-describedby="forgot-error"
          />
        </div>

        {/* Always rendered, so assistive technology is already watching it when text appears. */}
        <div id="forgot-error" role="alert" className="form-error">{error}</div>

        <button type="submit" className="primary" disabled={busy}>{busy ? "Sending…" : "Send code"}</button>
        <p className="form-alt"><Link to="/login">Back to sign in</Link></p>
      </form>
    </main>
  );
}
