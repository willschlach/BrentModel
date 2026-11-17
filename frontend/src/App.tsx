import {
  createHashRouter,
  Navigate,
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
import { SignUpPage } from "./pages/SignUpPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { ResetGate } from "./auth/ResetGate";
import { AuthProvider } from "./auth/AuthContext";
import { PendingCountProvider } from "./people/PendingCount";
import { RequireRole } from "./auth/RequireRole";
import { AppHeader, Frame } from "./components/AppHeader";
import { InvitesPanel } from "./pages/InvitesPanel";
import { PeoplePage } from "./pages/PeoplePage";
import { PeopleTab } from "./pages/PeopleTab";
import { RequireAuth } from "./auth/RequireAuth";

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
  { path: "/signup", element: <SignUpPage /> },
  // Password reset needs working email, so these two exist only while the feature is switched on.
  { path: "/forgot-password", element: <ResetGate><ForgotPasswordPage /></ResetGate> },
  { path: "/reset-password", element: <ResetGate><ResetPasswordPage /></ResetGate> },
  // The old address for the Invites screen.
  { path: "/invites", element: <Navigate to="/people/invites" replace /> },
  {
    // Its own route, not a child of "/": the "/" route only renders its children when run data exists.
    // The tabs are child routes, so each has an address and a third can be added the same way.
    path: "/people",
    element: (
      <RequireAuth>
        <RequireRole roles={["devops", "admin"]}>
          <Frame>
            <PeoplePage />
          </Frame>
        </RequireRole>
      </RequireAuth>
    ),
    children: [
      { index: true, element: <PeopleTab /> },
      { path: "invites", element: <InvitesPanel /> },
    ],
  },
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
      <PendingCountProvider>
        <RouterProvider router={router} />
      </PendingCountProvider>
    </AuthProvider>
  );
}
