import type { RunSnapshot } from "../types";

const STATUS_LABEL = { confirmed: "Confirmed", assumed: "Assumed", placeholder: "Placeholder" } as const;
const STATUS_ICON = { confirmed: "✔", assumed: "?", placeholder: "…" } as const;

function show(v: string | number | boolean): string {
  return typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : String(v);
}

export function DataAuditPage({ snapshot }: { snapshot: RunSnapshot }) {
  const { dataHealth, meta, assumptions } = snapshot;
  const series = Object.entries(dataHealth).filter(([, v]) => "start" in v && "n" in v);
  const contracts = dataHealth["contracts"];
  const open = assumptions.filter((a) => a.status !== "confirmed").length;
  const keyCfg = [
    "min_tenor_months", "max_tenor_months", "momentum_weight", "valuation_signal", "ema_mode",
    "ema_length_days", "k_std_devs", "hr_bounds_variant", "min_futures_fraction",
    "options_tenor_cap_months", "iv_lookback_days", "skew_lookback_days", "ratchet_only",
  ];

  return (
    <>
      <h1>Data and audit</h1>
      <p className="lede">
        What data this run used, how complete it is, which settings were applied, and which
        assumptions are still open.
      </p>

      <section aria-labelledby="src-h">
        <h2 id="src-h">Source</h2>
        <p>
          Source: <strong>{meta.dataSource}</strong>. Last data point {meta.lastDataDate}. Snapshot
          generated {meta.generatedAt}.
        </p>
      </section>

      <section aria-labelledby="health-h">
        <h2 id="health-h">Data health</h2>
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Per-series data quality</caption>
            <thead>
              <tr>
                <th scope="col">Series</th><th scope="col">Start</th><th scope="col">End</th>
                <th scope="col">Years</th><th scope="col">Observations</th>
                <th scope="col">Missing business days</th><th scope="col">Longest gap (days)</th>
                <th scope="col">Non-positive</th><th scope="col">Duplicates</th>
              </tr>
            </thead>
            <tbody>
              {series.map(([name, v]) => (
                <tr key={name}>
                  <th scope="row">{name}</th>
                  <td>{show(v.start)}</td><td>{show(v.end)}</td><td>{show(v.years)}</td>
                  <td>{show(v.n)}</td><td>{show(v.missing_vs_bdays)}</td>
                  <td>{show(v.max_gap_days)}</td><td>{show(v.nonpositive)}</td>
                  <td>{show(v.duplicates)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {contracts && (
          <p className="note">
            Contract prices: {show(contracts.n_columns)} contract months, {show(contracts.start)} to{" "}
            {show(contracts.end)}.
          </p>
        )}
      </section>

      <section aria-labelledby="cfg-h">
        <h2 id="cfg-h">Settings used</h2>
        <dl className="kv">
          {keyCfg.filter((k) => k in meta.config).map((k) => (
            <div key={k}><dt>{k}</dt><dd>{String(meta.config[k])}</dd></div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="ass-h">
        <h2 id="ass-h">Assumptions register</h2>
        <p>{open} of {assumptions.length} assumptions are not yet confirmed.</p>
        <ul className="assumptions">
          {assumptions.map((a) => (
            <li key={a.id}>
              <span className={`chip chip-${a.status}`}>
                <span aria-hidden="true">{STATUS_ICON[a.status]}</span> {STATUS_LABEL[a.status]}
              </span>{" "}
              <strong>{a.id}</strong> {a.text}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
