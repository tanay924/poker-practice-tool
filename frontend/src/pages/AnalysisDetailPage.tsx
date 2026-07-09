import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getAnalysis } from "../api";
import { useAuth } from "../auth/AuthContext";
import PlayingCard from "../components/PlayingCard";
import { getOrCreateGuestSessionId } from "../guestTrial";
import { formatActionEntry } from "../poker/engine";
import { visibleBoardForHistory } from "../poker/visibility";
import type { AnalysisDetail, DecisionDetails, EquityDetails, PotOddsDetails } from "../types";
import { decisionDetailsAvailable, formatDetailBb, formatDetailPercent } from "./analysisDecisionDetails";
import { formatPostflopSummaryText, formatResultText } from "./analysisResultText";
import { shouldRevealAnalysisOpponentCards } from "./analysisVisibility";

export default function AnalysisDetailPage() {
  const { handId } = useParams();
  const { accessToken, authConfigured, loading: authLoading, user } = useAuth();
  const [detail, setDetail] = useState<AnalysisDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!handId) {
      return;
    }
    const auth = accessToken ? accessToken : { guestSessionId: getOrCreateGuestSessionId() };
    getAnalysis(handId, auth)
      .then((next) => {
        setDetail(next);
        setError(null);
      })
      .catch((err: Error) => setError(err.message));
  }, [accessToken, handId]);

  if (authLoading) {
    return <p className="muted-text">Checking account...</p>;
  }

  if (error) {
    return <p className="error-text">{error}</p>;
  }

  if (!detail) {
    return <p className="muted-text">Loading analysis...</p>;
  }

  const solverOutput = detail.job?.solver_output_json;
  const solverMetadata = solverOutput?.metadata?.solver;
  const solverLabel = solverMetadata ? formatSolverLabel(solverMetadata) : detail.job?.status === "ready" ? "Unknown" : "Pending";
  const preflopResults = solverOutput?.preflop_results ?? [];
  const preflopBlocksPostflop = solverOutput?.preflop_summary?.blocks_postflop ?? false;
  const heroCards = splitCardString(detail.hand.hero_cards);
  const villainCards = splitCardString(detail.hand.villain_cards);
  const visibleBoard = visibleBoardForHistory(detail.hand.board_json, detail.hand.action_history_json);
  const revealOpponentCards = shouldRevealAnalysisOpponentCards(detail.hand.result_json);
  const resultText = formatResultText(detail.hand.result_json);
  const postflopSummaryText = solverOutput
    ? formatPostflopSummaryText({
        preflopBlocksPostflop,
        solverOutput,
        visibleBoardCardCount: visibleBoard.length
      })
    : null;
  const showSolverMetadata = Boolean(solverOutput?.metadata && solverOutput.postflop_status !== "skipped");

  return (
    <section className="stack">
      <Link className="back-link" to="/analysis">Back to analysis</Link>

      <div className="page-heading">
        <p className="eyebrow">Hand #{detail.hand.id}</p>
        <h2>Answer Sheet</h2>
        <p className="answer-result-line">{resultText}</p>
      </div>

      {!user && authConfigured && (
        <div className="panel signed-out-panel">
          <h3>Guest answer sheet</h3>
          <p className="muted-text">Sign in to keep future answer sheets in a private library.</p>
          <Link className="button-link" to={`/auth?redirect=${encodeURIComponent(`/analysis/${handId ?? ""}`)}`}>Sign in</Link>
        </div>
      )}

      <section className="hand-table-snapshot" aria-label="Final table state">
        <div className="snapshot-seat snapshot-villain">
          <div className="cards">
            {revealOpponentCards ? (
              villainCards.map((card) => <PlayingCard key={`villain-${card}`} value={card} />)
            ) : (
              <>
                <PlayingCard value="??" muted />
                <PlayingCard value="??" muted />
              </>
            )}
          </div>
          <span className="seat-label">Opponent {detail.hand.villain_position}</span>
        </div>

        <div className="snapshot-board">
          <span className="label">Final board</span>
          <div className="board-row">
            {visibleBoard.length > 0 ? (
              visibleBoard.map((card) => <PlayingCard key={`board-${card}`} value={card} />)
            ) : (
              <span className="snapshot-empty-board">No board cards were dealt</span>
            )}
          </div>
          <div className="pot-display snapshot-pot">
            <span>Final pot</span>
            <strong>{formatBb(detail.hand.pot)}</strong>
          </div>
        </div>

        <div className="snapshot-seat snapshot-hero">
          <span className="seat-label">Hero {detail.hand.hero_position}</span>
          <div className="cards">
            {heroCards.map((card) => <PlayingCard key={`hero-${card}`} value={card} />)}
          </div>
        </div>
      </section>

      <section className="panel">
        <h3>Preflop Feedback</h3>
        {preflopResults.length === 0 && (
          <p>
            This hand does not include integrated preflop range metadata, so only postflop feedback is available.
          </p>
        )}
        {preflopBlocksPostflop && (
          <div className="notice-box">
            <span className="label">Shark skipped</span>
            <p>Hero chose a 0% preflop line, so postflop solver analysis was not run for this hand.</p>
          </div>
        )}
        <div className="decision-list">
          {preflopResults.map((result, index) => (
            <article className="decision" key={`${result.spot_id}-${index}`}>
              <div>
                <span className="status-pill">{result.correct ? "valid" : "0%"}</span>
                <h4>{result.spot_name}</h4>
                <p>
                  {result.hand_key} - Hero chose <strong>{result.hero_action}</strong> at{" "}
                  <strong>{formatPercent(result.selected_frequency)}</strong>
                </p>
              </div>
              <div className="strategy-bars">
                {Object.entries(result.options).map(([action, frequency]) => (
                  <div className="strategy-row" key={action}>
                    <span>{action}</span>
                    <div className="bar"><span style={{ width: `${Math.round(frequency * 100)}%` }} /></div>
                    <strong>{formatPercent(frequency)}</strong>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Postflop Solver Feedback</h3>
        {(detail.job?.status === "unsupported" || detail.job?.status === "failed") && (
          <div className={detail.job.status === "unsupported" ? "notice-box" : "error-box"}>
            <span className="label">{detail.job.status === "unsupported" ? "Unsupported" : "Failed"}</span>
            <p>{detail.job.error ?? "No solver detail was provided."}</p>
          </div>
        )}
        {!solverOutput && <p className="muted-text">Analysis is not ready yet.</p>}
        {solverOutput?.summary.largest_mistake && (
          <div className="mistake-box">
            <span className="label">Largest mistake</span>
            <strong>
              {solverOutput.summary.largest_mistake.street}: {solverOutput.summary.largest_mistake.hero_action} instead of{" "}
              {solverOutput.summary.largest_mistake.best_action}
            </strong>
          </div>
        )}
        {postflopSummaryText && <p className="muted-text">{postflopSummaryText}</p>}
        {showSolverMetadata && solverOutput?.metadata && (
          <p className="muted-text">
            Source: {solverLabel}
            {typeof solverOutput.metadata.duration_seconds === "number" ? ` - ${solverOutput.metadata.duration_seconds.toFixed(2)}s` : ""}
            {solverOutput.metadata.cache ? ` - cache ${solverOutput.metadata.cache.hit ? "hit" : "miss"}` : ""}
          </p>
        )}
        {solverOutput?.postflop_status && !["ready", "skipped"].includes(solverOutput.postflop_status) && (
          <p className="muted-text">
            Postflop status: {solverOutput.postflop_status}
            {solverOutput.postflop_error ? ` - ${solverOutput.postflop_error}` : ""}
          </p>
        )}

        <div className="decision-list">
          {solverOutput?.street_results.map((result, index) => (
            <article className="decision" key={`${result.street}-${index}`}>
              <div>
                <span className="status-pill">{result.street}</span>
                <h4>{result.node}</h4>
                <p>{result.board.join(" ")} / Hero {result.hero_hand}</p>
              </div>
              <div className="strategy-bars">
                {Object.entries(result.solver_strategy).map(([action, frequency]) => (
                  <div className="strategy-row" key={action}>
                    <span>{action.replace("_", " ")}</span>
                    <div className="bar"><span style={{ width: `${Math.round(frequency * 100)}%` }} /></div>
                    <strong>{Math.round(frequency * 100)}%</strong>
                  </div>
                ))}
              </div>
              <p>
                Hero chose <strong>{result.hero_action}</strong>. Best action: <strong>{result.best_action}</strong>. Verdict:{" "}
                <strong>{result.verdict}</strong> ({result.confidence} confidence).
              </p>
              <DecisionDetailsPanel details={result.details} />
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Full Hand History</h3>
        <ol className="compact-history">
          {detail.hand.action_history_json.map((entry, index) => (
            <li key={`${entry.street}-${entry.actor}-${index}`}>
              {entry.street}: {entry.actor} {formatActionEntry(entry)}, pot {entry.pot_after}bb
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}

function formatSolverLabel(solver: { name: string; version?: string; commit?: string }) {
  if (solver.name === "shark") {
    return `Shark ${solver.version ?? ""}`.trim();
  }
  return [solver.name, solver.version].filter(Boolean).join(" ");
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function splitCardString(cards: string) {
  const trimmed = cards.trim();
  const result: string[] = [];
  for (let index = 0; index < trimmed.length; index += 2) {
    result.push(trimmed.slice(index, index + 2));
  }
  return result;
}

function formatBb(value: number) {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}bb`;
}

function DecisionDetailsPanel({ details }: { details?: DecisionDetails }) {
  if (!decisionDetailsAvailable(details)) {
    return null;
  }

  return (
    <details className="decision-detail-panel" open>
      <summary>Pot odds and equity</summary>
      <div className="decision-detail-grid">
        <PotOddsCard potOdds={details?.pot_odds} />
        <EquityCard equity={details?.equity} />
      </div>
    </details>
  );
}

function PotOddsCard({ potOdds }: { potOdds?: PotOddsDetails }) {
  if (!potOdds?.available) {
    return (
      <div className="detail-card">
        <span className="label">Pot odds</span>
        <strong>Not facing a call</strong>
        <p>Pot odds appear when Hero calls or folds to a bet.</p>
      </div>
    );
  }

  return (
    <div className="detail-card">
      <span className="label">Pot odds</span>
      <strong>{formatDetailPercent(potOdds.required_equity)} needed</strong>
      <p>
        Call {formatDetailBb(potOdds.call_amount_bb)} into a {formatDetailBb(potOdds.pot_before_call_bb)} pot.
      </p>
      <p>Pot if called: {formatDetailBb(potOdds.pot_if_call_bb)}</p>
    </div>
  );
}

function EquityCard({ equity }: { equity?: EquityDetails }) {
  if (!equity?.available) {
    return (
      <div className="detail-card">
        <span className="label">Equity</span>
        <strong>Hidden this hand</strong>
        <p>Exact card equity is only shown when opponent cards were revealed.</p>
      </div>
    );
  }

  return (
    <div className="detail-card">
      <span className="label">Equity</span>
      <strong>Hero {formatDetailPercent(equity.hero)}</strong>
      <div className="equity-split-bar" aria-label="Hero and opponent equity">
        <span style={{ width: formatDetailPercent(equity.hero) }} />
        <span style={{ width: formatDetailPercent(equity.villain) }} />
      </div>
      <p>Opponent {formatDetailPercent(equity.villain)}</p>
      {typeof equity.total_runouts === "number" && <p>{equity.total_runouts} runouts calculated.</p>}
    </div>
  );
}
