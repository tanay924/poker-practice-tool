import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getAnalysis } from "../api";
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

  return (
    <section className="stack">
      <Link className="back-link" to="/analysis">Back to analysis</Link>

      <div className="page-heading">
        <p className="eyebrow">Hand #{detail.hand.id}</p>
        <h2>Answer Sheet</h2>
      </div>

      <div className="summary-grid">
        <div>
          <span className="label">Hero</span>
          <strong>{detail.hand.hero_cards}</strong>
        </div>
        <div>
          <span className="label">Board</span>
          <strong>{detail.hand.board_json.join(" ")}</strong>
        </div>
        <div>
          <span className="label">Status</span>
          <strong>{detail.job?.status ?? "not requested"}</strong>
        </div>
        <div>
          <span className="label">Solver</span>
          <strong>{solverLabel}</strong>
        </div>
        <div>
          <span className="label">Result</span>
          <strong>{String(detail.hand.result_json.reason ?? detail.hand.result_json.winner ?? "complete")}</strong>
        </div>
      </div>

      <section className="panel">
        <h3>Preflop Feedback</h3>
        <p>
          V1 scripts this spot as SB opens to 2.5bb and BB calls. Imported preflop ranges are stored for study, but
          preflop decisions are not scored until the range strategy layer is added.
        </p>
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
  if (solver.name === "mock") {
    return "Mock";
  }
  return [solver.name, solver.version].filter(Boolean).join(" ");
}
