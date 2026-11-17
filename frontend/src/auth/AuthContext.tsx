import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { classifySignInError, type BlockReason, type SignInFailure } from "../lib/authErrors";
import { readAccessClaims, type AppRole } from "../lib/claims";
import { classifySignUpError, type SignUpFailure } from "../lib/inviteErrors";

// loading       : the stored session has not been checked yet
// misconfigured : the Supabase settings are missing from the build
// signedOut     : no session. `notice` says why, when the app ended it (for example a disabled account)
// signedIn      : a session whose token carries an active role
export type AuthState =
  | { status: "loading" }
  | { status: "misconfigured" }
  | { status: "signedOut"; notice: BlockReason | null }
  | { status: "signedIn"; session: Session; email: string; role: AppRole };

export type SignInResult = { ok: true } | { ok: false; reason: SignInFailure };

// signedIn  : a valid invite code created an active account and a session
// submitted : no code; a pending account was created and is waiting for approval
export type SignUpResult =
  | { ok: true; outcome: "signedIn" | "submitted" }
  // `detail` is the server's own wording, kept for a weak password because the project may enforce
  // more than the app checks.
  | { ok: false; reason: SignUpFailure; detail?: string };

interface AuthApi {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  /** `code` is optional. With a valid one the person is signed in; without one the request is pending. */
  signUp: (email: string, password: string, code: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  /** End the session because the account can no longer use the app, and tell the user why. */
  endSession: (reason: BlockReason) => Promise<void>;
}

const Ctx = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(supabase ? { status: "loading" } : { status: "misconfigured" });
  // Why the app is ending the session. Read by the SIGNED_OUT event that follows.
  const pendingNotice = useRef<BlockReason | null>(null);

  const endSession = useCallback(async (reason: BlockReason) => {
    pendingNotice.current = reason;
    // Local scope: end this device's session only. A refused refresh leaves the old session in
    // storage, so this has to be explicit.
    await supabase?.auth.signOut({ scope: "local" });
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;

    const apply = (session: Session | null) => {
      if (!session) {
        const notice = pendingNotice.current;
        pendingNotice.current = null;
        setState({ status: "signedOut", notice });
        return;
      }
      const claims = readAccessClaims(session.access_token);
      if (!claims) {
        // A session without an active role must not get in, even if the hook was misconfigured.
        // Do not call the client from inside its own event callback; defer.
        setState({ status: "signedOut", notice: "no_role" });
        setTimeout(() => void endSession("no_role"), 0);
        return;
      }
      setState({ status: "signedIn", session, email: session.user.email ?? "", role: claims.role });
    };

    // Fires once with the stored session (INITIAL_SESSION), then on sign-in, sign-out,
    // token refresh, and sign-out in another tab.
    const { data } = client.auth.onAuthStateChange((_event, session) => apply(session));
    return () => data.subscription.unsubscribe();
  }, [endSession]);

  const signIn = useCallback(async (email: string, password: string): Promise<SignInResult> => {
    if (!supabase) return { ok: false, reason: "unknown" };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { ok: false, reason: classifySignInError(error) } : { ok: true };
  }, []);

  const signUp = useCallback(async (email: string, password: string, code: string): Promise<SignUpResult> => {
    if (!supabase) return { ok: false, reason: "unknown" };
    // Send whatever was typed; the database normalizes it. A code that is not blank must be
    // judged by the server even if it contains nothing usable, or it would silently become "no code".
    const trimmed = code.trim();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: trimmed ? { data: { invite_code: trimmed } } : undefined,
    });
    if (error) {
      const reason = classifySignUpError(error);
      if (reason === "pending") return { ok: true, outcome: "submitted" };
      return { ok: false, reason, detail: reason === "weak_password" ? error.message : undefined };
    }
    // With email confirmation off, an active account always comes back with a session. No session and
    // no error means the project still requires confirmation, which this flow does not support.
    return data.session ? { ok: true, outcome: "signedIn" } : { ok: false, reason: "unknown" };
  }, []);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut({ scope: "local" });
  }, []);

  const value = useMemo<AuthApi>(() => ({ state, signIn, signUp, signOut, endSession }), [state, signIn, signUp, signOut, endSession]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("useAuth must be used inside <AuthProvider>.");
  return api;
}
