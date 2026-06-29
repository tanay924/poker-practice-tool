import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { analyzeHand, getAnalysis, saveHand } from "../api";
import PlayingCard from "../components/PlayingCard";
import SettlementSummaryPanel from "../components/SettlementSummaryPanel";
import type { AnalysisJob, HandRead } from "../types";
import { applyHeroAction, formatActionEntry, legalHeroActions, startNewHand, toHandPayload, type SeatMode, type TrainerAction } from "../poker/engine";
import { settlementForTrainerState } from "../poker/settlement";
import { shouldRevealOpponentCards } from "../poker/visibility";
import { analysisControlFor } from "./playAnalysisControl";

const SEAT_MODE_STORAGE_KEY = "poker-trainer-seat-mode";
const SEAT_MODES: SeatMode[] = ["random", "SB", "BB"];

export default function PlayPage() {
  const initialSeatMode = readSeatMode();
  const [seatMode, setSeatMode] = useState<SeatMode>(initialSeatMode);
  const [hand, setHand] = useState(() => startNewHand({ seatMode: initialSeatMode }));
  const [savedHand, setSavedHand] = useState<HandRead | null>(null);
  const [analysisJob, setAnalysisJob] = useState<AnalysisJob | null>(null);
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const legalActions = useMemo(() => legalHeroActions(hand), [hand]);
  const analysisControl = analysisControlFor(savedHand, analysisJob);
  const settlement = useMemo(() => settlementForTrainerState(hand), [hand]);
  const revealVillainCards = shouldRevealOpponentCards(hand.result);
  const hiddenBoardSlots = hand.handOver ? 0 : 5 - hand.visibleBoard.length;

  useEffect(() => {
    if (!hand.handOver || saveAttempted) {
      return;
    }

    setSaveAttempted(true);
    setSaving(true);
    saveHand(toHandPayload(hand))
      .then((created) => {
        setSavedHand(created);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setSaving(false));
  }, [hand, saveAttempted]);

  useEffect(() => {
    if (!savedHand) {
      return;
    }

    let cancelled = false;
    const refresh = () => {
      getAnalysis(savedHand.id)
        .then((detail) => {
          if (!cancelled) {
            setAnalysisJob(detail.job);
          }
        })
        .catch(() => undefined);
    };

    refresh();
    const interval = window.setInterval(refresh, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [savedHand]);

  const act = (action: TrainerAction) => {
    setHand((current) => applyHeroAction(current, action));
  };

  const newHand = () => {
    setHand(startNewHand({ seatMode }));
    setSavedHand(null);
    setAnalysisJob(null);
    setSaveAttempted(false);
    setSaving(false);
    setError(null);
  };

  const requestAnalysis = () => {
    if (!savedHand) {
      return;
    }
    analyzeHand(savedHand.id)
      .then(setAnalysisJob)
      .catch((err: Error) => setError(err.message));
  };

  const chooseSeatMode = (mode: SeatMode) => {
    setSeatMode(mode);
    writeSeatMode(mode);
  };

  return (
    <section className="page-grid play-grid">
      <div className="table-surface">
        <div className="seat villain-seat">
          <span className="seat-label">{hand.villainPosition}</span>
          <div className="cards">
            {revealVillainCards ? hand.villainCards.map((card) => <PlayingCard key={card} value={card} />) : <><PlayingCard value="??" muted /><PlayingCard value="??" muted /></>}
          </div>
          <span>{hand.villainStack.toFixed(1)}bb</span>
        </div>

        <div className="board-row">
          {hand.visibleBoard.map((card) => <PlayingCard key={card} value={card} />)}
          {Array.from({ length: hiddenBoardSlots }).map((_, index) => (
            <PlayingCard key={`empty-${index}`} value="--" muted />
          ))}
        </div>

        <div className="pot-display">
          <span>Pot</span>
          <strong>{hand.pot.toFixed(1)}bb</strong>
        </div>

        <div className="seat hero-seat">
          <span className="seat-label">Hero {hand.heroPosition}</span>
          <div className="cards">
            {hand.heroCards.map((card) => <PlayingCard key={card} value={card} />)}
          </div>
          <span>{hand.heroStack.toFixed(1)}bb</span>
        </div>
      </div>

      <aside className="control-panel">
        <div className="seat-mode-control">
          <span className="label">Seat</span>
          <div className="segmented-control" role="group" aria-label="Seat mode">
            {SEAT_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                className={mode === seatMode ? "active" : ""}
                aria-pressed={mode === seatMode}
                onClick={() => chooseSeatMode(mode)}
              >
                {mode === "random" ? "Random" : mode}
              </button>
            ))}
          </div>
        </div>

        <div className="status-line">
          <span className="status-pill">{hand.street}</span>
          <p>{hand.message}</p>
        </div>

        <div className="action-buttons">
          {legalActions.map((action) => (
            <button
              className={actionButtonClass(action.action)}
              key={`${action.action}-${action.amountBb}-${action.targetAmountBb ?? ""}`}
              type="button"
              onClick={() => act(action)}
            >
              {action.label}
            </button>
          ))}
          {hand.handOver && (
            <button type="button" className="secondary" onClick={newHand}>
              New hand
            </button>
          )}
        </div>

        {settlement && <SettlementSummaryPanel settlement={settlement} />}

        {hand.handOver && (
          <div className="result-box">
            <h2>Hand complete</h2>
            <p>{saving ? "Saving hand..." : savedHand ? `Saved as hand #${savedHand.id}` : "Waiting to save."}</p>
            {analysisControl && (
              analysisControl.mode === "view" && analysisControl.href ? (
                <Link className="button-link" to={analysisControl.href}>
                  {analysisControl.label}
                </Link>
              ) : (
                <button type="button" onClick={requestAnalysis} disabled={analysisControl.disabled}>
                  {analysisControl.label}
                </button>
              )
            )}
            {analysisJob && <p className={`status-text ${analysisJob.status}`}>Analysis status: {analysisJob.status}</p>}
          </div>
        )}

        {error && <p className="error-text">{error}</p>}

        <div className="history-list">
          <h2>Hand History</h2>
          <ol>
            {hand.actionHistory.map((entry, index) => (
              <li key={`${entry.street}-${entry.actor}-${entry.action}-${index}`}>
                <span>{entry.street}</span>
                {" "}
                <strong>{entry.actor}</strong>{" "}
                {formatActionEntry(entry)}
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </section>
  );
}

function readSeatMode(): SeatMode {
  if (typeof window === "undefined") {
    return "random";
  }
  const stored = window.localStorage.getItem(SEAT_MODE_STORAGE_KEY);
  return stored === "SB" || stored === "BB" || stored === "random" ? stored : "random";
}

function writeSeatMode(mode: SeatMode) {
  window.localStorage.setItem(SEAT_MODE_STORAGE_KEY, mode);
}

function actionButtonClass(action: TrainerAction["action"]) {
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
