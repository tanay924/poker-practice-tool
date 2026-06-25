import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { listAnalysis } from "../api";
import type { AnalysisListItem } from "../types";

export default function AnalysisPage() {
  const [items, setItems] = useState<AnalysisListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

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
            {items.map((item) => (
              <tr key={item.job_id}>
                <td>#{item.hand_id}</td>
                <td>{new Date(item.created_at).toLocaleString()}</td>
                <td>{item.hero_hand}</td>
                <td>{item.board.join(" ")}</td>
                <td><span className={`status-pill ${item.status}`}>{item.status}</span></td>
                <td>
                  {item.status === "ready" ? <Link to={`/analysis/${item.hand_id}`}>Answer sheet</Link> : <span className="muted-text">Waiting</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
