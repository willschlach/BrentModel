import type { ReactNode } from "react";

/** Text alternative for a chart: the underlying numbers in a table. */
export function DataDetails({
  summary, headers, rows,
}: { summary: string; headers: string[]; rows: ReactNode[][] }) {
  return (
    <details className="data-details">
      <summary>{summary}</summary>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>{headers.map((h) => <th key={h} scope="col">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
