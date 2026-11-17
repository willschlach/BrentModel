// The password rules the sign-up page can check before anything is sent. Keep the length in step
// with minimum_password_length in supabase/config.toml and the hosted project's Authentication
// settings. If the server enforces more than this, its own message is shown after the attempt.

export const MIN_PASSWORD_LENGTH = 8;

export interface PasswordCheck {
  id: "length" | "match";
  label: string;
  met: boolean;
}

export function passwordChecks(password: string, repeat: string): PasswordCheck[] {
  return [
    { id: "length", label: `At least ${MIN_PASSWORD_LENGTH} characters`, met: password.length >= MIN_PASSWORD_LENGTH },
    { id: "match", label: "Both passwords match", met: password !== "" && password === repeat },
  ];
}

export function passwordIsValid(password: string, repeat: string): boolean {
  return passwordChecks(password, repeat).every((c) => c.met);
}
