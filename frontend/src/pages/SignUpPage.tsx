import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ConfigError } from "../auth/ConfigError";
import { displayInviteCode, isCompleteInviteCode, normalizeInviteCode } from "../lib/inviteCode";
import { signUpMessage, type SignUpFailure } from "../lib/inviteErrors";
import { MIN_PASSWORD_LENGTH, passwordChecks } from "../lib/passwordRules";

type Field = "email" | "password" | "repeat" | "code";

// Which field should get focus for each kind of rejection.
const FOCUS_FOR: Record<SignUpFailure, Field> = {
  no_invite: "email",
  already_registered: "email",
  weak_password: "password",
  signups_closed: "email",
  wrong_code: "code",
  expired: "code",
  used: "code",
  revoked: "code",
  locked: "code",
  invalid: "code",
  unknown: "email",
};

export function SignUpPage() {
  const { state, signUp } = useAuth();

  const refs: Record<Field, React.RefObject<HTMLInputElement | null>> = {
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    repeat: useRef<HTMLInputElement>(null),
    code: useRef<HTMLInputElement>(null),
  };
  const submittedRef = useRef<HTMLHeadingElement>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<Field | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    document.title = "Create an account · Brent Hedging Model";
  }, []);

  useEffect(() => {
    if (submitted) submittedRef.current?.focus();
  }, [submitted]);

  if (state.status === "misconfigured") return <ConfigError />;
  if (state.status === "signedIn") return <Navigate to="/" replace />;

  const checks = passwordChecks(password, repeat);

  function problem(field: Field, message: string) {
    setInvalid(field);
    setError(message);
    refs[field].current?.focus();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setInvalid(null);

    if (!email.trim()) return problem("email", "Enter your email address.");
    if (!password) return problem("password", "Enter a password.");
    if (password.length < MIN_PASSWORD_LENGTH) {
      return problem("password", `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    if (repeat !== password) return problem("repeat", "The passwords do not match.");
    // A code that is started but not finished is a typo; do not spend an attempt on it.
    if (code.trim() && !isCompleteInviteCode(normalizeInviteCode(code))) {
      return problem("code", "An invite code has 8 characters, like K7MQ-2WXA.");
    }

    setBusy(true);
    const result = await signUp(email.trim(), password, code);
    setBusy(false);

    if (result.ok) {
      // "signedIn": the auth state changes and this page redirects.
      if (result.outcome === "submitted") setSubmitted(true);
      return;
    }
    setPassword("");
    setRepeat("");
    problem(FOCUS_FOR[result.reason], result.detail ?? signUpMessage(result.reason));
  }

  if (submitted) {
    return (
      <main id="main" className="login-page">
        <div className="login-card">
          <h1 ref={submittedRef} tabIndex={-1}>Request submitted</h1>
          <p role="status">
            Your request for access is awaiting approval. You will be able to sign in once it has been approved.
          </p>
          <p className="form-alt"><Link to="/login">Back to sign in</Link></p>
        </div>
      </main>
    );
  }

  return (
    <main id="main" className="login-page">
      <form className="login-card" onSubmit={onSubmit} noValidate>
        <h1>Create an account</h1>
        <p className="lede">Brent Hedging Model</p>

        <div className="field">
          <label htmlFor="signup-email">Email</label>
          <input
            id="signup-email" ref={refs.email} type="email" name="email" autoComplete="username"
            value={email} onChange={(e) => setEmail(e.target.value)}
            aria-invalid={invalid === "email"} aria-describedby="signup-error"
          />
        </div>

        <div className="field">
          <label htmlFor="signup-password">Password</label>
          <input
            id="signup-password" ref={refs.password} type="password" name="new-password" autoComplete="new-password"
            value={password} onChange={(e) => setPassword(e.target.value)}
            aria-invalid={invalid === "password"} aria-describedby="signup-password-checks signup-error"
          />
        </div>

        <div className="field">
          <label htmlFor="signup-repeat">Repeat password</label>
          <input
            id="signup-repeat" ref={refs.repeat} type="password" name="repeat-password" autoComplete="new-password"
            value={repeat} onChange={(e) => setRepeat(e.target.value)}
            aria-invalid={invalid === "repeat"} aria-describedby="signup-password-checks signup-error"
          />
        </div>

        {/* Shown as words, not only color. Not a live region: it would announce on every keystroke. */}
        <ul id="signup-password-checks" className="checks" aria-label="Password requirements">
          {checks.map((c) => (
            <li key={c.id} className={c.met ? "met" : "unmet"}>
              <span aria-hidden="true">{c.met ? "✓" : "○"}</span> {c.label}
              <span className="sr-only">{c.met ? " (met)" : " (not met)"}</span>
            </li>
          ))}
        </ul>

        <div className="field">
          <label htmlFor="signup-code">Invite code (optional)</label>
          <input
            id="signup-code" ref={refs.code} type="text" name="invite-code" autoComplete="off"
            autoCapitalize="characters" spellCheck={false} inputMode="text" placeholder="XXXX-XXXX"
            value={code} onChange={(e) => setCode(displayInviteCode(e.target.value))}
            aria-invalid={invalid === "code"} aria-describedby="signup-code-hint signup-error"
          />
          <span id="signup-code-hint" className="note">
            With a code you get access straight away. Without one, your request waits for approval.
          </span>
        </div>

        {/* Always rendered, so assistive technology is already watching it when text appears. */}
        <div id="signup-error" role="alert" className="form-error">{error}</div>

        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>
        <p className="form-alt">Already have an account? <Link to="/login">Sign in</Link></p>
      </form>
    </main>
  );
}
