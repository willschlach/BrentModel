import type { RunSnapshot } from "../types";
import { SummaryStrip } from "../components/SummaryStrip";
import { FlagsPanel } from "../components/FlagsPanel";
import { InstrumentChart, LadderChart } from "../components/DecisionCharts";
import { DecisionTable } from "../components/DecisionTable";

export function DecisionPage({ snapshot }: { snapshot: RunSnapshot }) {
  return (
    <>
      <h1>Monthly decision</h1>
      <p className="lede">
        What the model asks for this month, exposure month by exposure month. Hedge ratios are
        percent of expected exposure volume; they are not barrels or lots.
      </p>
      <SummaryStrip snapshot={snapshot} />

      <section aria-labelledby="flags-h">
        <h2 id="flags-h">Flags</h2>
        <p className="note">
          Flags describe how fragile or unusual the output is. They never change the model&apos;s numbers.
        </p>
        <FlagsPanel flags={snapshot.flags} />
      </section>

      <section aria-labelledby="ladder-h">
        <h2 id="ladder-h">Where we are against the target</h2>
        <LadderChart rows={snapshot.rows} />
        <InstrumentChart rows={snapshot.rows} />
      </section>

      <section aria-labelledby="table-h">
        <h2 id="table-h">Decision table</h2>
        <DecisionTable rows={snapshot.rows} runDate={snapshot.meta.runDate} />
      </section>
    </>
  );
}
