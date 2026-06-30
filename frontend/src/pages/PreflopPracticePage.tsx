import { useMemo, useState } from "react";

import PlayingCard from "../components/PlayingCard";
import SettlementSummaryPanel from "../components/SettlementSummaryPanel";
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
import {
  DEFAULT_PRACTICE_SETTINGS,
  PRACTICE_MODE_OPTIONS,
  SPOT_FOCUS_OPTIONS,
  practiceSettingsToStartOptions,
  type PreflopPracticeMode,
  type PreflopPracticeSettings
} from "../preflop/practiceModes";
import { listBundledPreflopRanges } from "../preflop/rangeData";
import { settlementForPreflopRound } from "../preflop/settlement";
import { formatBb } from "../settlement";

interface SessionStats {
  correctDecisions: number;
  hands: number;
  totalDecisions: number;
}

export default function PreflopPracticePage() {
  const [practiceSettings, setPracticeSettings] = useState<PreflopPracticeSettings>(DEFAULT_PRACTICE_SETTINGS);
  const [round, setRound] = useState<PreflopRoundState>(() => startPreflopRound(practiceSettingsToStartOptions(DEFAULT_PRACTICE_SETTINGS)));
  const [stats, setStats] = useState<SessionStats>({ correctDecisions: 0, hands: 0, totalDecisions: 0 });
  const ranges = useMemo(() => listBundledPreflopRanges(), []);
  const legalActions = round.currentDecision ? legalActionsForSpot(round.currentDecision.spotId) : [];
  const settlement = useMemo(() => settlementForPreflopRound(round), [round]);
  const accuracy = stats.totalDecisions === 0 ? 0 : Math.round((stats.correctDecisions / stats.totalDecisions) * 100);
  const heroStack = settlement ? formatBb(settlement.heroAfterBb) : "100bb";
  const villainStack = settlement ? formatBb(settlement.opponentAfterBb) : "100bb";
  const activePracticeLabel = practiceLabel(practiceSettings);

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

  const dealNext = (settings = practiceSettings) => {
    setRound(startPreflopRound(practiceSettingsToStartOptions(settings)));
  };

  const applyPracticeSettings = (settings: PreflopPracticeSettings) => {
    setPracticeSettings(settings);
    setStats({ correctDecisions: 0, hands: 0, totalDecisions: 0 });
    dealNext(settings);
  };

  const chooseMode = (mode: PreflopPracticeMode) => {
    applyPracticeSettings({ ...practiceSettings, mode });
  };

  const chooseSeat = (seat: Position) => {
    applyPracticeSettings({ ...practiceSettings, mode: "seat", seat });
  };

  const chooseSpot = (spotId: PreflopPracticeSettings["spotId"]) => {
    applyPracticeSettings({ ...practiceSettings, mode: "spot", spotId });
  };

  return (
    <section className="page-grid preflop-grid">
      <div className="preflop-main">
        <div className="page-heading">
          <p className="eyebrow">100bb heads-up cash · {activePracticeLabel}</p>
          <h2>Opening Range Practice</h2>
        </div>

        <div className="table-surface preflop-table">
          <Seat
            cards={round.isComplete ? round.villainCards : null}
            label={villainPosition(round.heroPosition)}
            muted={!round.isComplete}
            stack={villainStack}
            stackPlacement="above"
          />

          <div className="preflop-center">
            <span className="status-pill">{round.currentDecision?.prompt ?? "Preflop complete"}</span>
            <strong>{round.message}</strong>
          </div>

          <Seat cards={round.heroCards} label={`Hero ${round.heroPosition}`} stack={heroStack} />
        </div>
      </div>

      <aside className="control-panel preflop-control">
        <section className="panel practice-mode-panel">
          <div className="range-header">
            <div>
              <h3>Practice Setup</h3>
              <p>{activePracticeLabel}</p>
            </div>
          </div>

          <div className="practice-mode-grid" role="group" aria-label="Preflop practice mode">
            {PRACTICE_MODE_OPTIONS.map((mode) => (
              <button
                aria-pressed={practiceSettings.mode === mode.id}
                className={`mode-card ${practiceSettings.mode === mode.id ? "active" : ""}`}
                key={mode.id}
                onClick={() => chooseMode(mode.id)}
                type="button"
              >
                <strong>{mode.label}</strong>
                <span>{mode.description}</span>
              </button>
            ))}
          </div>

          {practiceSettings.mode === "seat" && (
            <div className="seat-focus-row">
              <span className="label">Seat</span>
              <div className="segmented-control two-up" role="group" aria-label="Seat focus">
                {(["SB", "BB"] as Position[]).map((seat) => (
                  <button
                    aria-pressed={practiceSettings.seat === seat}
                    className={practiceSettings.seat === seat ? "active" : ""}
                    key={seat}
                    onClick={() => chooseSeat(seat)}
                    type="button"
                  >
                    {seat}
                  </button>
                ))}
              </div>
            </div>
          )}

          {practiceSettings.mode === "spot" && (
            <div className="spot-focus-list">
              {SPOT_FOCUS_OPTIONS.map((spot) => (
                <button
                  aria-pressed={practiceSettings.spotId === spot.spotId}
                  className={`spot-focus-button ${practiceSettings.spotId === spot.spotId ? "active" : ""}`}
                  key={spot.spotId}
                  onClick={() => chooseSpot(spot.spotId)}
                  type="button"
                >
                  <span>{spot.actorPosition}</span>
                  <strong>{spot.title}</strong>
                  <small>{spot.detail}</small>
                </button>
              ))}
            </div>
          )}
        </section>

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

        {settlement && <SettlementSummaryPanel settlement={settlement} />}

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
  stack,
  stackPlacement = "below"
}: {
  cards: [string, string] | null;
  label: string;
  muted?: boolean;
  stack: string;
  stackPlacement?: "above" | "below";
}) {
  return (
    <div className="seat">
      {stackPlacement === "above" && <span className="seat-stack">{stack}</span>}
      <span className="seat-label">{label}</span>
      {stackPlacement !== "above" && <span className="seat-stack">{stack}</span>}
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

function practiceLabel(settings: PreflopPracticeSettings): string {
  if (settings.mode === "seat") {
    return `${settings.seat} focus`;
  }
  if (settings.mode === "spot") {
    return SPOT_FOCUS_OPTIONS.find((spot) => spot.spotId === settings.spotId)?.title ?? "Spot focus";
  }
  return "Mixed drill";
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
