import { Fragment, useMemo, useState } from "react";
import type { Row } from "../types";
import { instrumentLabel, num, pct, statusLabel, tradeStatus } from "../lib/format";
import { downloadText, rowsToCsv } from "../lib/csv";

type SortKey = "monthsToExposure" | "targetHr" | "currentHr" | "incrementalHr";

const SORT_LABEL: Record<SortKey, string> = {
  monthsToExposure: "Months",
  targetHr: "Target",
  currentHr: "Current",
  incrementalHr: "Incremental",
};

function SortHeader({
  k, active, dir, onSort,
}: { k: SortKey; active: boolean; dir: "asc" | "desc"; onSort: (k: SortKey) => void }) {
  return (
    <th scope="col" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="link-button" onClick={() => onSort(k)}>
        {SORT_LABEL[k]} {active ? (dir === "asc" ? "▲" : "▼") : ""}
      </button>
    </th>
  );
}

function RowDetail({ r }: { r: Row }) {
  const signalPart = Math.max(r.targetHr - r.minHr, 0);
  return (
    <div className="detail">
      <p>
        <strong>How the {pct(r.targetHr)} target is built.</strong> Schedule minimum{" "}
        {pct(r.minHr, 1)} + signal-driven {pct(signalPart, 1)}
        {" "}(raw target {pct(r.rawTargetHr, 1)} before rounding to 5%).
      </p>
      <div className="stack" role="img"
        aria-label={`Schedule-driven ${pct(r.minHr, 0)}, signal-driven ${pct(signalPart, 0)}`}>
        <span className="stack-min" style={{ width: `${r.minHr * 100}%` }}>Schedule</span>
        <span className="stack-sig" style={{ width: `${signalPart * 100}%` }}>Signal</span>
      </div>
      <ul>
        <li>Valuation signal: {pct(r.valuationSignal, 1)} (contract price {num(r.contractPrice)})</li>
        <li>
          IV percentile {num(r.ivPercentile, 1)} → raw futures share{" "}
          {pct(r.futuresFractionRaw, 1)}, rounded to {pct(r.futuresPct)}
        </li>
        <li>
          Skew percentile {num(r.skewPercentile, 1)} → {instrumentLabel(r.instrument)}
        </li>
        <li>
          Exposure month {r.exposureDate.slice(0, 7)} hedged with contract {r.contractMonth}
        </li>
      </ul>
    </div>
  );
}

export function DecisionTable({ rows, runDate }: { rows: Row[]; runDate: string }) {
  const [sortKey, setSortKey] = useState<SortKey>("monthsToExposure");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [onlyTrades, setOnlyTrades] = useState(false);
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());

  const view = useMemo(() => {
    const filtered = onlyTrades ? rows.filter((r) => r.incrementalHr > 1e-9) : rows;
    const sign = dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => sign * (a[sortKey] - b[sortKey]));
  }, [rows, sortKey, dir, onlyTrades]);

  const onSort = (k: SortKey) => {
    if (k === sortKey) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setDir("asc");
    }
  };
  const toggle = (m: number) => {
    const next = new Set(open);
    if (next.has(m)) next.delete(m);
    else next.add(m);
    setOpen(next);
  };

  return (
    <div>
      <div className="toolbar">
        <label>
          <input type="checkbox" checked={onlyTrades} onChange={(e) => setOnlyTrades(e.target.checked)} />{" "}
          Show only months with a trade
        </label>
        <button type="button" onClick={() => downloadText(`brent_signal_${runDate}.csv`, rowsToCsv(rows, runDate))}>
          Export CSV (GS format)
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <caption className="sr-only">Hedge decision by exposure month</caption>
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Details</span></th>
              <SortHeader k="monthsToExposure" active={sortKey === "monthsToExposure"} dir={dir} onSort={onSort} />
              <th scope="col">Exposure</th>
              <th scope="col">Contract</th>
              <th scope="col">Valuation</th>
              <th scope="col">Min</th>
              <th scope="col">Max</th>
              <SortHeader k="targetHr" active={sortKey === "targetHr"} dir={dir} onSort={onSort} />
              <SortHeader k="currentHr" active={sortKey === "currentHr"} dir={dir} onSort={onSort} />
              <SortHeader k="incrementalHr" active={sortKey === "incrementalHr"} dir={dir} onSort={onSort} />
              <th scope="col">Status</th>
              <th scope="col">Instrument</th>
              <th scope="col">Fut %</th>
              <th scope="col">Opt %</th>
              <th scope="col">Col %</th>
              <th scope="col">+Futures</th>
              <th scope="col">+Options</th>
              <th scope="col">+Collars</th>
            </tr>
          </thead>
          <tbody>
            {view.map((r) => {
              const st = tradeStatus(r.currentHr, r.targetHr, r.incrementalHr);
              const isOpen = open.has(r.monthsToExposure);
              return (
                <Fragment key={r.monthsToExposure}>
                  <tr className={st === "trade" ? "row-trade" : undefined}>
                    <td>
                      <button type="button" className="link-button" aria-expanded={isOpen}
                        aria-label={`${isOpen ? "Hide" : "Show"} details for ${r.monthsToExposure} months`}
                        onClick={() => toggle(r.monthsToExposure)}>
                        {isOpen ? "−" : "+"}
                      </button>
                    </td>
                    <td>{r.monthsToExposure}</td>
                    <td>{r.exposureDate.slice(0, 7)}</td>
                    <td>{r.contractMonth}</td>
                    <td>{pct(r.valuationSignal, 1)}</td>
                    <td>{pct(r.minHr, 1)}</td>
                    <td>{pct(r.maxHr)}</td>
                    <td>{pct(r.targetHr)}</td>
                    <td>{pct(r.currentHr)}</td>
                    <td>{pct(r.incrementalHr)}</td>
                    <td><span className={`status status-${st}`}>{statusLabel[st]}</span></td>
                    <td>{instrumentLabel(r.instrument)}</td>
                    <td>{pct(r.futuresPct)}</td>
                    <td>{pct(r.optionsPct)}</td>
                    <td>{pct(r.collarsPct)}</td>
                    <td>{pct(r.incrFutures, 2)}</td>
                    <td>{pct(r.incrOptions, 2)}</td>
                    <td>{pct(r.incrCollars, 2)}</td>
                  </tr>
                  {isOpen && (
                    <tr className="detail-row">
                      <td colSpan={18}><RowDetail r={r} /></td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="note">
        Incremental allocations are shown unrounded, as in the GS format. &quot;Ahead of target&quot; means
        the existing hedge is above the new target; the model does not sell hedges down.
      </p>
    </div>
  );
}
