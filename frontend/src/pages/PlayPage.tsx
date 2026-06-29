import { useEffect, useMemo, useState } from "react";

import { analyzeHand, getAnalysis, saveHand } from "../api";
import PlayingCard from "../components/PlayingCard";
import type { AnalysisJob, HandRead } from "../types";
import { applyHeroAction, formatActionEntry, legalHeroActions, startNewHand, toHandPayload, type TrainerAction } from "../poker/engine";

export default function PlayPage() {
  const [hand, setHand] = useState(() => startNewHand());
  const [savedHand, setSavedHand] = useState<HandRead | null>(null);
  const [analysisJob, setAnalysisJob] = useState<AnalysisJob | null>(null);
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const legalActions = useMemo(() => legalHeroActions(hand), [hand]);

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
    setHand(startNewHand());
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

  return (
    <section className="page-grid play-grid">
      <div className="table-surface">
        <div className="seat villain-seat">
          <span className="seat-label">BB</span>
          <div className="cards">
            {hand.handOver ? hand.villainCards.map((card) => <PlayingCard key={card} value={card} />) : <><PlayingCard value="??" muted /><PlayingCard value="??" muted /></>}
          </div>
          <span>{hand.villainStack.toFixed(1)}bb</span>
        </div>

        <div className="board-row">
          {hand.visibleBoard.map((card) => <PlayingCard key={card} value={card} />)}
          {Array.from({ length: 5 - hand.visibleBoard.length }).map((_, index) => (
            <PlayingCard key={`empty-${index}`} value="--" muted />
          ))}
        </div>

        <div className="pot-display">
          <span>Pot</span>
          <strong>{hand.pot.toFixed(1)}bb</strong>
        </div>

        <div className="seat hero-seat">
          <span className="seat-label">Hero SB</span>
          <div className="cards">
            {hand.heroCards.map((card) => <PlayingCard key={card} value={card} />)}
          </div>
          <span>{hand.heroStack.toFixed(1)}bb</span>
        </div>
      </div>

      <aside className="control-panel">
        <div className="status-line">
          <span className="status-pill">{hand.street}</span>
          <p>{hand.message}</p>
        </div>

        <div className="action-buttons">
          {legalActions.map((action) => (
            <button key={`${action.action}-${action.amountBb}-${action.targetAmountBb ?? ""}`} type="button" onClick={() => act(action)}>
              {action.label}
            </button>
          ))}
          {hand.handOver && (
            <button type="button" className="secondary" onClick={newHand}>
              New hand
            </button>
          )}
        </div>

        {hand.handOver && (
          <div className="result-box">
            <h2>Hand complete</h2>
            <p>{saving ? "Saving hand..." : savedHand ? `Saved as hand #${savedHand.id}` : "Waiting to save."}</p>
            {savedHand && (
              <button type="button" onClick={requestAnalysis} disabled={analysisJob?.status === "queued" || analysisJob?.status === "solving"}>
                Analyze hand
              </button>
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
                <strong>{entry.actor}</strong>
                {formatActionEntry(entry)}
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </section>
  );
}
