import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { analyzeHand, getAnalysis, saveHand } from "../api";
import { useAuth } from "../auth/AuthContext";
import PlayingCard from "../components/PlayingCard";
import SettlementSummaryPanel from "../components/SettlementSummaryPanel";
import type { AnalysisJob, HandRead } from "../types";
import { applyHeroAction, formatActionEntry, legalHeroActions, startNewHand, toHandPayload, type SeatMode, type TrainerAction } from "../poker/engine";
import { settlementForTrainerState } from "../poker/settlement";
import { shouldRevealOpponentCards } from "../poker/visibility";
import { formatBb } from "../settlement";
import { analysisControlFor, nextPlayAnalysisStateAfterAnalyzeSuccess, nextPlayAnalysisStateAfterRefresh } from "./playAnalysisControl";
import { playShortcutForAction, resolvePlayShortcut } from "./playActionShortcuts";
import { playCompletionMessage, playCompletionPrimaryAction } from "./playCompletionCopy";

const SEAT_MODE_STORAGE_KEY = "poker-trainer-seat-mode";
const SEAT_MODES: SeatMode[] = ["random", "SB", "BB"];

export default function PlayPage() {
  const { accessToken, authConfigured, loading: authLoading, user } = useAuth();
  const initialSeatMode = readSeatMode();
  const [seatMode, setSeatMode] = useState<SeatMode>(initialSeatMode);
  const [hand, setHand] = useState(() => startNewHand({ seatMode: initialSeatMode }));
  const [savedHand, setSavedHand] = useState<HandRead | null>(null);
  const [analysisJob, setAnalysisJob] = useState<AnalysisJob | null>(null);
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const legalActions = useMemo(() => legalHeroActions(hand), [hand]);
  const actionShortcuts = useMemo(
    () => legalActions.map((action, index) => playShortcutForAction(action, index, legalActions)),
    [legalActions]
  );
  const analysisControl = analysisControlFor(savedHand, analysisJob);
  const settlement = useMemo(() => settlementForTrainerState(hand), [hand]);
  const revealVillainCards = shouldRevealOpponentCards(hand.result);
  const hiddenBoardSlots = hand.handOver ? 0 : 5 - hand.visibleBoard.length;
  const displayedHeroStack = settlement ? settlement.heroAfterBb : hand.heroStack;
  const displayedVillainStack = settlement ? settlement.opponentAfterBb : hand.villainStack;
  const displayedPot = settlement && settlement.status !== "showdown" ? 0 : hand.pot;
  const completionState = {
    authConfigured,
    authLoading,
    isAuthenticated: Boolean(user && accessToken),
    savedHandId: savedHand?.id ?? null,
    saving
  };
  const completionAuthAction = playCompletionPrimaryAction(completionState);

  useEffect(() => {
    if (!hand.handOver || saveAttempted || authLoading) {
      return;
    }

    setSaveAttempted(true);
    if (!accessToken) {
      return;
    }

    setSaving(true);
    saveHand(toHandPayload(hand), accessToken)
      .then((created) => {
        setSavedHand(created);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setSaving(false));
  }, [accessToken, authLoading, hand, saveAttempted]);

  useEffect(() => {
    if (!savedHand || !accessToken) {
      return;
    }

    let cancelled = false;
    const refresh = () => {
      getAnalysis(savedHand.id, accessToken)
        .then((detail) => {
          if (!cancelled) {
            const next = nextPlayAnalysisStateAfterRefresh({ analysisJob: null, error: null }, detail);
            setAnalysisJob(next.analysisJob);
            setError(next.error);
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
  }, [accessToken, savedHand]);

  const act = useCallback((action: TrainerAction) => {
    setHand((current) => applyHeroAction(current, action));
  }, []);

  const newHand = useCallback(() => {
    setHand(startNewHand({ seatMode }));
    setSavedHand(null);
    setAnalysisJob(null);
    setSaveAttempted(false);
    setSaving(false);
    setError(null);
  }, [seatMode]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || shortcutTargetIsEditable(event.target)) {
        return;
      }

      if (hand.handOver && event.key.toLowerCase() === "n") {
        event.preventDefault();
        newHand();
        return;
      }

      const shortcutAction = resolvePlayShortcut(event.key, legalActions);
      if (shortcutAction) {
        event.preventDefault();
        act(shortcutAction);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [act, hand.handOver, legalActions, newHand]);

  const requestAnalysis = () => {
    if (!savedHand || !accessToken) {
      return;
    }
    setError(null);
    analyzeHand(savedHand.id, accessToken)
      .then((job) => {
        const next = nextPlayAnalysisStateAfterAnalyzeSuccess({ analysisJob: null, error: null }, job);
        setAnalysisJob(next.analysisJob);
        setError(next.error);
      })
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
          <div className="cards">
            {revealVillainCards ? hand.villainCards.map((card) => <PlayingCard key={card} value={card} />) : <><PlayingCard value="??" muted /><PlayingCard value="??" muted /></>}
          </div>
          <span className="seat-stack">{formatBb(displayedVillainStack)}</span>
          <span className="seat-label">{hand.villainPosition}</span>
        </div>

        <div className="table-center">
          <div className="board-row">
            {hand.visibleBoard.map((card) => <PlayingCard key={card} value={card} />)}
            {Array.from({ length: hiddenBoardSlots }).map((_, index) => (
              <PlayingCard key={`empty-${index}`} value="--" muted />
            ))}
          </div>

          <div className="pot-display">
            <span>Pot</span>
            <strong>{formatBb(displayedPot)}</strong>
          </div>
        </div>

        <div className="seat hero-seat">
          <span className="seat-label">Hero {hand.heroPosition}</span>
          <span className="seat-stack">{formatBb(displayedHeroStack)}</span>
          <div className="cards">
            {hand.heroCards.map((card) => <PlayingCard key={card} value={card} />)}
          </div>
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
          {legalActions.map((action, index) => (
            <button
              aria-keyshortcuts={actionShortcuts[index]?.aria}
              className={actionButtonClass(action.action)}
              key={`${action.action}-${action.amountBb}-${action.targetAmountBb ?? ""}`}
              title={`${action.label} (${actionShortcuts[index]?.label})`}
              type="button"
              onClick={() => act(action)}
            >
              {action.label}
            </button>
          ))}
          {hand.handOver && (
            <button type="button" className="secondary" onClick={newHand} title="New hand (N)" aria-keyshortcuts="n">
              New hand
            </button>
          )}
        </div>

        {settlement && <SettlementSummaryPanel settlement={settlement} />}

        {hand.handOver && (
          <div className="result-box">
            <h2>Hand complete</h2>
            <p>{playCompletionMessage(completionState)}</p>
            {completionAuthAction && (
              <Link className="button-link" to={completionAuthAction.to}>
                {completionAuthAction.label}
              </Link>
            )}
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

function shortcutTargetIsEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === "input" || tagName === "select" || tagName === "textarea";
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
