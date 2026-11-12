import type { RunSnapshot } from "../types";
import { pct } from "../lib/format";

function Card({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card">
      <dt>{label}</dt>
      <dd>{value}</dd>
      {note && <p className="card-note">{note}</p>}
    </div>
  );
}

export function SummaryStrip({ snapshot }: { snapshot: RunSnapshot }) {
  const { meta, summary } = snapshot;
  const inc = summary.incrementalByInstrument;
  return (
    <dl className="summary" aria-label="Run summary">
      <Card label="Run date" value={meta.runDate} note={`Data as of ${meta.lastDataDate}`} />
      <Card label="Data source" value={meta.dataSource} note={`Preset: ${meta.preset}`} />
      <Card
        label="Months with a trade"
        value={`${summary.withTrades} of ${summary.exposures}`}
        note="Exposure months where the model asks for an increase"
      />
      <Card
        label="Average hedge: current → target"
        value={`${pct(summary.avgCurrentHr)} → ${pct(summary.avgTargetHr)}`}
        note="Simple average across exposure months"
      />
      <Card
        label="New hedge by instrument"
        value={`F ${pct(inc.futures)} · O ${pct(inc.options)} · C ${pct(inc.collars)}`}
        note="Sum across months, in percent of one month's volume"
      />
    </dl>
  );
}
