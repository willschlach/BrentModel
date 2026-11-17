import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { usePendingCount } from "../people/PendingCount";
import type { RunSnapshot } from "../types";

function UserMenu() {
  const { state, signOut } = useAuth();
  if (state.status !== "signedIn") return null;
  return (
    <div className="user-info">
      <span>{state.email} · {state.role}</span>
      <button type="button" className="link-button" onClick={() => void signOut()}>Sign out</button>
    </div>
  );
}

// Links that depend on who you are, not on whether there is run data. Devops and admin get People,
// with the number of pending requests beside it when there are any.
function RoleLinks() {
  const { state } = useAuth();
  const { count } = usePendingCount();
  if (state.status !== "signedIn" || (state.role !== "devops" && state.role !== "admin")) return null;
  return (
    <nav aria-label="Administration" className="role-nav">
      <NavLink to="/people">
        People
        {count > 0 && (
          <>
            <span className="badge" aria-hidden="true">{count}</span>
            <span className="sr-only"> ({count} pending {count === 1 ? "request" : "requests"})</span>
          </>
        )}
      </NavLink>
    </nav>
  );
}

// The header works with or without run data: the run navigation and run info need a snapshot;
// the role links and the user menu (and so sign-out) do not.
export function AppHeader({ snapshot }: { snapshot: RunSnapshot | null }) {
  return (
    <header className="app-header">
      <div className="brand">Brent Hedging Model</div>
      {snapshot && (
        <nav aria-label="Primary">
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/decision">Decision</NavLink>
          <NavLink to="/why">Why</NavLink>
          <NavLink to="/data">Data and audit</NavLink>
        </nav>
      )}
      <RoleLinks />
      {snapshot && (
        <div className="run-info">
          Run {snapshot.meta.runDate} · {snapshot.meta.dataSource}
        </div>
      )}
      <UserMenu />
    </header>
  );
}

// Page frame for screens that do not need run data.
export function Frame({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <AppHeader snapshot={null} />
      <main id="main" tabIndex={-1}>{children}</main>
    </>
  );
}
