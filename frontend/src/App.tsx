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

function Shell({ snapshot }: { snapshot: RunSnapshot }) {
  const critical = snapshot.flags.filter((f) => f.severity === "critical" && f.scope === "run");
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="app-header">
        <div className="brand">Brent Hedging Model</div>
        <nav aria-label="Primary">
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/decision">Decision</NavLink>
          <NavLink to="/why">Why</NavLink>
          <NavLink to="/data">Data and audit</NavLink>
        </nav>
        <div className="run-info">
          Run {snapshot.meta.runDate} · {snapshot.meta.dataSource}
        </div>
      </header>
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
  if (state.status === "loading") return <p className="status-msg" role="status">Loading run…</p>;
  if (state.status === "error") {
    return (
      <p className="status-msg" role="alert">
        Could not load the run: {state.message}
      </p>
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
  {
    path: "/",
    element: <Root />,
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
    <SnapshotProvider>
      <RouterProvider router={router} />
    </SnapshotProvider>
  );
}
