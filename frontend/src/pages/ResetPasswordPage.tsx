import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ConfigError } from "../auth/ConfigError";
import { endOtherSessions, requestResetCode, setNewPassword, verifyResetCode } from "../auth/passwordReset";
import { PasswordChecklist } from "../components/PasswordChecklist";
import { MIN_PASSWORD_LENGTH } from "../lib/passwordRules";
import { displayResetCode, isCompleteResetCode, normalizeEmail, normalizeResetCode } from "../lib/resetCode";
import { requestMessage, setPasswordMessage, verifyMessage } from "../lib/resetErrors";

type Field = "email" | "code" | "password" | "repeat";

// Step two: the code and the new password. Order of operations (add-password-reset design, D3):
// check what the browser can check, then use up the code, then save the password. If the server
// rejects the password after the code was accepted, the person is already signed in with a valid
// session, so the page keeps it and asks for another password only; asking for a new code would
// not help, because a code works once.
export function ResetPasswordPage() {
  const { state } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const refs: Record<Field, React.RefObject<HTMLInputElement | null>> = {
    email: useRef<HTMLInputElement>(null),
    code: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    repeat: useRef<HTMLInputElement>(null),
  };
  const inFlight = useRef(false);
  // Verifying the code signs this person in. The pages elsewhere send a signed-in visitor home, so
  // this remembers that the sign-in is this page's own and must not be redirected away from.
  const startedHere = useRef(false);

  const [email, setEmail] = useState(params.get("email") ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [stage, setStage] = useState<"code" | "password">("code");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<Field | null>(null);

  useEffect(() => {
    document.title = "Reset password · Brent Hedging Model";
  }, []);

  if (state.status === "misconfigured") return <ConfigError />;
  if (state.status === "signedIn" && !startedHere.current) return <Navigate to="/" replace />;

  function problem(field: Field, message: string) {
    setInvalid(field);
    setError(message);
    refs[field].current?.focus();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    setError(null);
    setNotice(null);
    setInvalid(null);

    if (stage === "code") {
      if (!normalizeEmail(email)) return problem("email", "Enter your email address.");
      if (!isCompleteResetCode(normalizeResetCode(code))) return problem("code", "Enter the 6-digit code from the email.");
    }
    if (!password) return problem("password", "Enter a new password.");
    if (password.length < MIN_PASSWORD_LENGTH) {
      return problem("password", `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    if (repeat !== password) return problem("repeat", "The passwords do not match.");

    inFlight.current = true;
    setBusy(true);
    try {
      if (stage === "code") {
        startedHere.current = true;
        const verified = await verifyResetCode(email, code);
        if (!verified.ok) {
          startedHere.current = false;
          // A wrong code is the code field's problem; a blocked account is not.
          problem(verified.reason === "bad_code" ? "code" : "email", verifyMessage(verified.reason));
          return;
        }
      }
      const saved = await setNewPassword(password);
      if (!saved.ok) {
        if (saved.reason === "session_lost") {
          startedHere.current = false;
          setStage("code");
          setCode("");
          problem("code", setPasswordMessage(saved.reason));
          return;
        }
        // The code is used up and the session is valid: stay here and ask for another password.
        setStage("password");
        setPassword("");
        setRepeat("");
        problem("password", setPasswordMessage(saved.reason, saved.detail));
        return;
      }
      await endOtherSessions();
      navigate("/", { replace: true });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function onResend() {
    if (inFlight.current) return;
    setError(null);
    setNotice(null);
    setInvalid(null);
    if (!normalizeEmail(email)) return problem("email", "Enter your email address.");
    inFlight.current = true;
    setBusy(true);
    const result = await requestResetCode(email);
    inFlight.current = false;
    setBusy(false);
    if (result.ok) {
      setNotice("If an account exists for that email, a new code has been sent. Use the newest one.");
      refs.code.current?.focus();
    } else {
      problem("email", requestMessage(result.reason));
    }
  }

  const codeStage = stage === "code";
  return (
    <main id="main" className="login-page">
      <form className="login-card" onSubmit={onSubmit} noValidate>
        <h1>{codeStage ? "Reset your password" : "Choose a new password"}</h1>
        {codeStage ? (
          <p className="lede">Enter the 6-digit code from the email and choose a new password.</p>
        ) : (
          <p className="lede">Your code was accepted. Choose a new password to finish.</p>
        )}

        {codeStage && (
          <>
            <div className="field">
              <label htmlFor="reset-email">Email</label>
              <input
                id="reset-email" ref={refs.email} type="email" name="email" autoComplete="username"
                value={email} onChange={(e) => setEmail(e.target.value)}
                aria-invalid={invalid === "email"} aria-describedby="reset-error"
              />
            </div>
            <div className="field">
              <label htmlFor="reset-code">Code</label>
              <input
                id="reset-code" ref={refs.code} type="text" name="one-time-code" inputMode="numeric"
                autoComplete="one-time-code" spellCheck={false} placeholder="123456"
                value={code} onChange={(e) => setCode(displayResetCode(e.target.value))}
                aria-invalid={invalid === "code"} aria-describedby="reset-error"
              />
            </div>
          </>
        )}

        <div className="field">
          <label htmlFor="reset-password">New password</label>
          <input
            id="reset-password" ref={refs.password} type="password" name="new-password" autoComplete="new-password"
            value={password} onChange={(e) => setPassword(e.target.value)}
            aria-invalid={invalid === "password"} aria-describedby="reset-password-checks reset-error"
          />
        </div>
        <div className="field">
          <label htmlFor="reset-repeat">Repeat new password</label>
          <input
            id="reset-repeat" ref={refs.repeat} type="password" name="repeat-password" autoComplete="new-password"
            value={repeat} onChange={(e) => setRepeat(e.target.value)}
            aria-invalid={invalid === "repeat"} aria-describedby="reset-password-checks reset-error"
          />
        </div>
        <PasswordChecklist id="reset-password-checks" password={password} repeat={repeat} />

        {/* Always rendered, so assistive technology is already watching them when text appears. */}
        <div id="reset-error" role="alert" className="form-error">{error}</div>
        <div role="status" className="note">{notice}</div>

        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Saving…" : codeStage ? "Reset password" : "Save password"}
        </button>
        {codeStage && (
          <p className="form-alt">
            Did not get a code?{" "}
            <button type="button" className="link-text" onClick={() => void onResend()} disabled={busy}>Send a new code</button>
          </p>
        )}
        <p className="form-alt"><Link to="/login">Back to sign in</Link></p>
      </form>
    </main>
  );
}
