import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { listAnalysis } from "../api";
import type { AnalysisListItem } from "../types";
import { analysisStatusCounts, analysisStatusOptions, filterAnalysisItems, type AnalysisStatusFilter } from "./analysisListFilters";

export default function AnalysisPage() {
  const [items, setItems] = useState<AnalysisListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AnalysisStatusFilter>("all");
  const filteredItems = useMemo(() => filterAnalysisItems(items, { query, status: statusFilter }), [items, query, statusFilter]);
  const statusCounts = useMemo(() => analysisStatusCounts(items), [items]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      listAnalysis()
        .then((next) => {
          if (!cancelled) {
            setItems(next);
            setError(null);
          }
        })
        .catch((err: Error) => {
          if (!cancelled) {
            setError(err.message);
          }
        });
    };

    refresh();
    const interval = window.setInterval(refresh, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <section className="stack">
      <div className="page-heading">
        <p className="eyebrow">Background solver jobs</p>
        <h2>Analysis</h2>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="analysis-controls panel">
        <label>
          <span className="label">Search</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Hand, cards, board"
            type="search"
            value={query}
          />
        </label>
        <label>
          <span className="label">Status</span>
          <select onChange={(event) => setStatusFilter(event.target.value as AnalysisStatusFilter)} value={statusFilter}>
            {analysisStatusOptions().map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)} ({statusCounts[status]})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="summary-grid analysis-counts">
        {analysisStatusOptions().map((status) => (
          <button
            className={statusFilter === status ? "active secondary" : "secondary"}
            key={status}
            onClick={() => setStatusFilter(status)}
            type="button"
          >
            <span>{statusLabel(status)}</span>
            <strong>{statusCounts[status]}</strong>
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Hand</th>
              <th>Date</th>
              <th>Hero</th>
              <th>Board</th>
              <th>Status</th>
              <th>Open</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => (
              <tr key={item.job_id}>
                <td>#{item.hand_id}</td>
                <td>{new Date(item.created_at).toLocaleString()}</td>
                <td>{item.hero_hand}</td>
                <td>{item.board.join(" ")}</td>
                <td><span className={`status-pill ${item.status}`}>{item.status}</span></td>
                <td>
                  {item.status === "ready" || item.status === "failed" || item.status === "unsupported" ? (
                    <Link className="button-link compact-button" to={`/analysis/${item.hand_id}`}>
                      {item.status === "ready" ? "Answer sheet" : "Details"}
                    </Link>
                  ) : (
                    <span className="muted-text">Waiting</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredItems.length === 0 && <p className="empty-table-message">No analysis jobs match the current filters.</p>}
      </div>
    </section>
  );
}

function statusLabel(status: AnalysisStatusFilter) {
  if (status === "all") {
    return "All";
  }
  return status[0].toUpperCase() + status.slice(1);
}
