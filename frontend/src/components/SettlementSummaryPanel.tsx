import type { SettlementSummary } from "../settlement";

interface SettlementSummaryPanelProps {
  settlement: SettlementSummary;
}

export default function SettlementSummaryPanel({ settlement }: SettlementSummaryPanelProps) {
  return (
    <section className={`payout-card ${settlement.status}`}>
      <div className="payout-heading">
        <span className="label">Result</span>
        <h3>{settlement.headline}</h3>
        <p>{settlement.detail}</p>
      </div>
    </section>
  );
}
