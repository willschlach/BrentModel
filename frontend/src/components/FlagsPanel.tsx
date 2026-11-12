import type { Flag, Severity } from "../types";

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  warn: "Warning",
  info: "Info",
};
const SEVERITY_ICON: Record<Severity, string> = { critical: "■", warn: "▲", info: "●" };
const ORDER: Severity[] = ["critical", "warn", "info"];

const FLAG_TITLE: Record<string, string> = {
  DATA_SYNTHETIC: "Synthetic data",
  DATA_STALE: "Stale data",
  SKEW_NEAR_THRESHOLD: "Calls vs collars could flip",
  IV_NEAR_ROUNDING: "Futures share near a rounding boundary",
  TARGET_NEAR_ROUNDING: "Target near a rounding boundary",
  SCHEDULE_DRIVEN: "Mostly schedule-driven",
  SIGNAL_AT_EXTREME: "Valuation signal at an extreme",
  LARGE_INCREMENT: "Large one-month increase",
  LONG_DATED: "Long-dated exposure",
};

export function SeverityChip({ severity }: { severity: Severity }) {
  return (
    <span className={`chip chip-${severity}`}>
      <span aria-hidden="true">{SEVERITY_ICON[severity]}</span> {SEVERITY_LABEL[severity]}
    </span>
  );
}

export function FlagsPanel({ flags }: { flags: Flag[] }) {
  const runFlags = flags.filter((f) => f.scope === "run");
  const scoped = flags.filter((f) => f.scope !== "run");

  const groups = new Map<string, Flag[]>();
  for (const f of scoped) groups.set(f.id, [...(groups.get(f.id) ?? []), f]);
  const sortedGroups = [...groups.entries()].sort(
    (a, b) => ORDER.indexOf(a[1][0].severity) - ORDER.indexOf(b[1][0].severity),
  );

  if (flags.length === 0) return <p>No flags raised for this run.</p>;

  return (
    <div className="flags">
      {runFlags.length > 0 && (
        <ul className="flag-list">
          {[...runFlags]
            .sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity))
            .map((f) => (
              <li key={f.id}>
                <SeverityChip severity={f.severity} /> <strong>{FLAG_TITLE[f.id] ?? f.id}.</strong>{" "}
                {f.message}
              </li>
            ))}
        </ul>
      )}
      {sortedGroups.map(([id, items]) => (
        <details key={id} className="flag-group">
          <summary>
            <SeverityChip severity={items[0].severity} /> {FLAG_TITLE[id] ?? id} ({items.length}{" "}
            {items.length === 1 ? "month" : "months"})
          </summary>
          <ul>
            {items.map((f) => (
              <li key={`${f.id}-${f.scope}`}>
                <strong>{f.scope}:</strong> {f.message}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
