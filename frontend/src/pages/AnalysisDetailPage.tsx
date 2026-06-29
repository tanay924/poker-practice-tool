import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getAnalysis } from "../api";
import PlayingCard from "../components/PlayingCard";
import { formatActionEntry } from "../poker/engine";
import type { AnalysisDetail } from "../types";

export default function AnalysisDetailPage() {
  const { handId } = useParams();
  const [detail, setDetail] = useState<AnalysisDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!handId) {
      return;
    }
    getAnalysis(handId)
      .then((next) => {
        setDetail(next);
        setError(null);
      })
      .catch((err: Error) => setError(err.message));
  }, [handId]);

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
  const resultText = formatResultText(detail.hand.result_json);

  return (
    <section className="stack">
      <Link className="back-link" to="/analysis">Back to analysis</Link>

      <div className="page-heading">
        <p className="eyebrow">Hand #{detail.hand.id}</p>
        <h2>Answer Sheet</h2>
        <p className="answer-result-line">{resultText}</p>
      </div>

      <section className="hand-table-snapshot" aria-label="Final table state">
        <div className="snapshot-seat snapshot-villain">
          <span className="seat-label">Opponent {detail.hand.villain_position}</span>
          <div className="cards">
            {villainCards.map((card) => <PlayingCard key={`villain-${card}`} value={card} />)}
          </div>
        </div>

        <div className="snapshot-board">
          <span className="label">Final board</span>
          <div className="board-row">
            {detail.hand.board_json.map((card) => <PlayingCard key={`board-${card}`} value={card} />)}
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
        {solverOutput?.summary.largest_mistake === null && <p className="muted-text">No large solver mistake flagged.</p>}
        {solverOutput?.metadata && (
          <p className="muted-text">
            Source: {solverLabel}
            {typeof solverOutput.metadata.duration_seconds === "number" ? ` - ${solverOutput.metadata.duration_seconds.toFixed(2)}s` : ""}
            {solverOutput.metadata.cache ? ` - cache ${solverOutput.metadata.cache.hit ? "hit" : "miss"}` : ""}
          </p>
        )}
        {solverOutput?.postflop_status && solverOutput.postflop_status !== "ready" && (
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
                <p>{result.board.join(" ")} · Hero {result.hero_hand}</p>
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

function formatResultText(result: Record<string, unknown>) {
  const winner = typeof result.winner === "string" ? result.winner : "unknown";
  const reason = typeof result.reason === "string" ? result.reason : "";

  if (winner === "hero") {
    return `Hero won${formatWinningReason(reason, "opponent")}.`;
  }
  if (winner === "villain") {
    return `Opponent won${formatWinningReason(reason, "hero")}.`;
  }
  if (winner === "showdown") {
    return "The hand reached showdown after the river action closed.";
  }
  return "The hand is complete.";
}

function formatWinningReason(reason: string, foldedPlayer: "hero" | "opponent") {
  const foldReasons = new Set([
    "hero_folded",
    "hero_folded_preflop",
    "hero_folded_to_3bet",
    "hero_folded_to_limp_raise",
    "villain_folded",
    "villain_folded_preflop",
    "villain_folded_to_3bet",
    "villain_folded_to_limp_raise"
  ]);
  if (foldReasons.has(reason)) {
    return ` when ${foldedPlayer} folded`;
  }

  const allInReasons = new Set(["bb_allin_preflop", "hero_allin_preflop"]);
  if (allInReasons.has(reason)) {
    return " when the preflop line reached an all-in branch";
  }

  const treeClosedReasons = new Set([
    "preflop_tree_closed",
    "hero_4bet_preflop",
    "hero_limp_reraised_preflop",
    "villain_4bet_preflop",
    "villain_limp_reraised_preflop"
  ]);
  if (treeClosedReasons.has(reason)) {
    return " when the supported preflop tree ended";
  }

  return "";
}
