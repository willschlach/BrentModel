import type { ReactNode } from "react";
import {
  createHashRouter,
  Navigate,
  NavLink,
  Outlet,
  RouterProvider,
  ScrollRestoration,
  useOutletContext,
} from "react-router-dom";
import { SnapshotProvider, useSnapshotState } from "./data/SnapshotContext";
import type { RunSnapshot } from "./types";
import { HomePage } from "./pages/HomePage";
import { DecisionPage } from "./pages/DecisionPage";
import { WhyPage } from "./pages/WhyPage";
import { DataAuditPage } from "./pages/DataAuditPage";
import { LoginPage } from "./pages/LoginPage";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { RequireAuth } from "./auth/RequireAuth";

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

// The header works with or without run data: the navigation and run info need a snapshot,
// the user menu (and so sign-out) does not.
function AppHeader({ snapshot }: { snapshot: RunSnapshot | null }) {
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
      {snapshot && (
        <div className="run-info">
          Run {snapshot.meta.runDate} · {snapshot.meta.dataSource}
        </div>
      )}
      <UserMenu />
    </header>
  );
}

// Page frame for the states that have no run data to show.
function Frame({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <AppHeader snapshot={null} />
      <main id="main" tabIndex={-1}>{children}</main>
    </>
  );
}

function Shell({ snapshot }: { snapshot: RunSnapshot }) {
  const critical = snapshot.flags.filter((f) => f.severity === "critical" && f.scope === "run");
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <AppHeader snapshot={snapshot} />
      {critical.map((f) => (
        <div key={f.id} className="banner" role="alert">
          <strong>{f.id === "DATA_SYNTHETIC" ? "Synthetic data." : "Critical."}</strong> {f.message}
        </div>
      ))}
      <main id="main" tabIndex={-1}>
        <Outlet context={snapshot} />
      </main>
      <footer className="app-footer">
        Model output is rule-based, not a market forecast. Backtest figures (when shown) are
        in-sample and exclude trading costs.
      </footer>
      {/* Keyed by path: a page you have scrolled before reopens where you left it;
          a page you have not visited starts at the top. */}
      <ScrollRestoration getKey={(location) => location.pathname} />
    </>
  );
}

function Root() {
  const state = useSnapshotState();
  if (state.status === "loading") {
    return <Frame><p className="status-msg" role="status">Loading run…</p></Frame>;
  }
  if (state.status === "error") {
    return (
      <Frame>
        <p className="status-msg" role="alert">
          Could not load the run: {state.message}
        </p>
      </Frame>
    );
  }
  if (state.status === "empty") {
    return (
      <Frame>
        <h1>No run data yet</h1>
        <p className="lede">Run data will appear here once a model run is published.</p>
      </Frame>
    );
  }
  return <Shell snapshot={state.snapshot} />;
}

const useSnapshot = () => useOutletContext<RunSnapshot>();
const HomeRoute = () => <HomePage snapshot={useSnapshot()} />;
const DecisionRoute = () => <DecisionPage snapshot={useSnapshot()} />;
const WhyRoute = () => <WhyPage snapshot={useSnapshot()} />;
const DataRoute = () => <DataAuditPage snapshot={useSnapshot()} />;

// Data router (required for ScrollRestoration). Hash-based so it works on static hosting.
const router = createHashRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    // The snapshot provider sits inside the guard, so run data is only requested after sign-in.
    element: (
      <RequireAuth>
        <SnapshotProvider>
          <Root />
        </SnapshotProvider>
      </RequireAuth>
    ),
    children: [
      { index: true, element: <HomeRoute /> },
      { path: "decision", element: <DecisionRoute /> },
      { path: "why", element: <WhyRoute /> },
      { path: "data", element: <DataRoute /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
