import { formatBb, type SettlementSummary } from "../settlement";

interface SettlementSummaryPanelProps {
  settlement: SettlementSummary;
}

export default function SettlementSummaryPanel({ settlement }: SettlementSummaryPanelProps) {
  const potRecipient = settlement.status === "awarded"
    ? settlement.winner === "hero"
      ? "to Hero"
      : "to Opponent"
    : "not awarded";

  return (
    <section className={`payout-card ${settlement.status}`}>
      <div className="payout-heading">
        <span className="label">Result</span>
        <h3>{settlement.headline}</h3>
        <p>{settlement.detail}</p>
      </div>
      <div className="payout-flow" aria-label="Stack settlement">
        <StackBox
          afterBb={settlement.heroAfterBb}
          beforeBb={settlement.heroBeforeBb}
          isWinner={settlement.winner === "hero"}
          label="Hero stack"
        />
        <div className={`payout-pot-chip ${settlement.winner ?? "neutral"}`}>
          <span>Pot</span>
          <strong>{formatBb(settlement.potBb)}</strong>
          <small>{potRecipient}</small>
        </div>
        <StackBox
          afterBb={settlement.opponentAfterBb}
          beforeBb={settlement.opponentBeforeBb}
          isWinner={settlement.winner === "opponent"}
          label="Opponent stack"
        />
      </div>
    </section>
  );
}

function StackBox({
  afterBb,
  beforeBb,
  isWinner,
  label
}: {
  afterBb: number;
  beforeBb: number;
  isWinner: boolean;
  label: string;
}) {
  const changed = beforeBb !== afterBb;
  return (
    <div className={`payout-stack ${isWinner ? "winner" : ""}`}>
      <span>{label}</span>
      <strong>
        {formatBb(beforeBb)}
        {changed && (
          <>
            <small> to </small>
            {formatBb(afterBb)}
          </>
        )}
      </strong>
    </div>
  );
}

