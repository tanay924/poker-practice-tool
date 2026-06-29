import { useMemo, useState } from "react";

import PlayingCard from "../components/PlayingCard";
import {
  actionLabel,
  answerCurrentDecision,
  legalActionsForSpot,
  startPreflopRound,
  type ActionOption,
  type Position,
  type PreflopAction,
  type PreflopHistoryEntry,
  type PreflopRoundState
} from "../preflop/engine";
import { listBundledPreflopRanges } from "../preflop/rangeData";

interface SessionStats {
  correctDecisions: number;
  hands: number;
  totalDecisions: number;
}

export default function PreflopPracticePage() {
  const [round, setRound] = useState<PreflopRoundState>(() => startPreflopRound());
  const [stats, setStats] = useState<SessionStats>({ correctDecisions: 0, hands: 0, totalDecisions: 0 });
  const ranges = useMemo(() => listBundledPreflopRanges(), []);
  const legalActions = round.currentDecision ? legalActionsForSpot(round.currentDecision.spotId) : [];
  const accuracy = stats.totalDecisions === 0 ? 0 : Math.round((stats.correctDecisions / stats.totalDecisions) * 100);

  const recordRoundIfComplete = (nextRound: PreflopRoundState, previousRound: PreflopRoundState) => {
    if (!nextRound.isComplete || previousRound.isComplete) {
      return;
    }
    setStats((current) => ({
      correctDecisions: current.correctDecisions + nextRound.correctCount,
      hands: current.hands + 1,
      totalDecisions: current.totalDecisions + nextRound.decisionCount
    }));
  };

  const chooseAction = (action: PreflopAction) => {
    setRound((current) => {
      const nextRound = answerCurrentDecision(current, action);
      recordRoundIfComplete(nextRound, current);
      return nextRound;
    });
  };

  const dealNext = (heroPosition?: Position) => {
    setRound(startPreflopRound({ heroPosition }));
  };

  return (
    <section className="page-grid preflop-grid">
      <div className="preflop-main">
        <div className="page-heading">
          <p className="eyebrow">100bb heads-up cash</p>
          <h2>Opening Range Practice</h2>
        </div>

        <div className="table-surface preflop-table">
          <Seat
            cards={round.isComplete ? round.villainCards : null}
            label={villainPosition(round.heroPosition)}
            muted={!round.isComplete}
            stack="100bb"
          />

          <div className="preflop-center">
            <span className="status-pill">{round.currentDecision?.prompt ?? "Preflop complete"}</span>
            <strong>{round.message}</strong>
          </div>

          <Seat cards={round.heroCards} label={`Hero ${round.heroPosition}`} stack="100bb" />
        </div>
      </div>

      <aside className="control-panel preflop-control">
        <div className="metric-strip">
          <Metric label="Hands" value={String(stats.hands)} />
          <Metric label="Decisions" value={String(stats.totalDecisions)} />
          <Metric label="Accuracy" value={`${accuracy}%`} />
        </div>

        {round.currentDecision && (
          <section className="status-line preflop-decision">
            <span className="label">{round.currentDecision.spotName}</span>
            <h3>{round.currentDecision.handKey}</h3>
            <p>{round.currentDecision.prompt}</p>
          </section>
        )}

        <div className="action-buttons">
          {legalActions.map((action) => (
            <button className={preflopActionButtonClass(action)} key={action} type="button" onClick={() => chooseAction(action)}>
              {actionLabel(action)}
            </button>
          ))}
          {round.isComplete && (
            <button type="button" className="secondary" onClick={() => dealNext()}>
              Next hand
            </button>
          )}
        </div>

        <div className="preflop-deal-row">
          <button type="button" className="secondary compact-button" onClick={() => dealNext("SB")}>
            Deal SB
          </button>
          <button type="button" className="secondary compact-button" onClick={() => dealNext("BB")}>
            Deal BB
          </button>
        </div>

        {round.lastFeedback && (
          <section className={`feedback-box ${round.lastFeedback.correct ? "correct" : "wrong"}`}>
            <div className="range-header">
              <div>
                <span className="label">{round.lastFeedback.correct ? "Correct" : "Wrong"}</span>
                <h3>
                  {actionLabel(round.lastFeedback.action)} at {Math.round(round.lastFeedback.selectedProbability * 100)}%
                </h3>
              </div>
              <span className="status-pill">{round.lastFeedback.handKey}</span>
            </div>
            <OptionBars options={round.lastFeedback.options} selectedAction={round.lastFeedback.action} />
          </section>
        )}

        <section className="panel">
          <div className="range-header">
            <div>
              <h3>Hand History</h3>
              <p>{ranges.length} bundled ranges loaded</p>
            </div>
          </div>
          <ol className="compact-history preflop-history">
            {round.history.map((entry, index) => (
              <HistoryItem entry={entry} isComplete={round.isComplete} key={`${entry.actor}-${entry.action}-${index}`} />
            ))}
          </ol>
          {round.history.length === 0 && <p className="muted-text">No actions yet.</p>}
        </section>
      </aside>
    </section>
  );
}

function Seat({
  cards,
  label,
  muted = false,
  stack
}: {
  cards: [string, string] | null;
  label: string;
  muted?: boolean;
  stack: string;
}) {
  return (
    <div className="seat">
      <span className="seat-label">{label}</span>
      <div className="cards">
        {cards ? (
          cards.map((card) => <PlayingCard key={card} value={card} />)
        ) : (
          <>
            <PlayingCard value="??" muted={muted} />
            <PlayingCard value="??" muted={muted} />
          </>
        )}
      </div>
      <span>{stack}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function OptionBars({ options, selectedAction }: { options: ActionOption[]; selectedAction: PreflopAction }) {
  return (
    <div className="strategy-bars">
      {options.map((option) => (
        <div className={`strategy-row preflop-option ${option.action === selectedAction ? "selected" : ""}`} key={option.action}>
          <span>{actionLabel(option.action)}</span>
          <div className="bar">
            <span style={{ width: `${Math.round(option.probability * 100)}%` }} />
          </div>
          <strong>{Math.round(option.probability * 100)}%</strong>
        </div>
      ))}
    </div>
  );
}

function HistoryItem({ entry, isComplete }: { entry: PreflopHistoryEntry; isComplete: boolean }) {
  const handLabel = entry.automatic && !isComplete ? "--" : entry.handKey;
  return (
    <li>
      <span>{entry.actor}</span>
      <strong>{actionLabel(entry.action)}</strong>
      <em>{handLabel}</em>
      <small>{Math.round(entry.probability * 100)}%</small>
    </li>
  );
}

function villainPosition(heroPosition: Position): Position {
  return heroPosition === "SB" ? "BB" : "SB";
}

function preflopActionButtonClass(action: PreflopAction) {
  if (action === "fold") {
    return "action-danger";
  }
  if (action === "check" || action === "call" || action === "limp") {
    return "action-passive";
  }
  if (action === "allin") {
    return "action-study";
  }
  return "";
}
