import { passwordChecks } from "../lib/passwordRules";

/**
 * The live "what is still missing" list under a new-password field. Shown as words, not only color,
 * and not a live region: that would announce on every keystroke. Used by sign-up and password reset.
 */
export function PasswordChecklist({ id, password, repeat }: { id: string; password: string; repeat: string }) {
  return (
    <ul id={id} className="checks" aria-label="Password requirements">
      {passwordChecks(password, repeat).map((c) => (
        <li key={c.id} className={c.met ? "met" : "unmet"}>
          <span aria-hidden="true">{c.met ? "✓" : "○"}</span> {c.label}
          <span className="sr-only">{c.met ? " (met)" : " (not met)"}</span>
        </li>
      ))}
    </ul>
  );
}
