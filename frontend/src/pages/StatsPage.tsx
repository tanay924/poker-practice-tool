import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getMyStats } from "../api";
import { useAuth } from "../auth/AuthContext";
import type { MyStats, StatsAccuracyRow, StatsCountRow, StatsMistakeRow } from "../types";
import { emptyStatsMessage, formatStatsPercent } from "./statsViews";

export default function StatsPage() {
  const { accessToken, authConfigured, loading: authLoading, user } = useAuth();
  const [stats, setStats] = useState<MyStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStats = () => {
    if (!accessToken || !user) {
      setStats(null);
      return;
    }
    setLoading(true);
    setError(null);
    getMyStats(accessToken)
      .then((next) => setStats(next))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadStats();
  }, [accessToken, user]);

  if (authLoading) {
    return <p className="muted-text">Checking account...</p>;
  }

  if (!user) {
    return (
      <section className="stack stats-page">
        <div className="page-heading">
          <p className="eyebrow">Study dashboard</p>
          <h2>My Stats</h2>
        </div>
        <div className="panel signed-out-panel">
          <h3>Sign in to view stats</h3>
          <p className="muted-text">Stats are built from your saved hands and completed analysis.</p>
          {authConfigured && <Link className="button-link" to="/auth?redirect=/stats">Sign in</Link>}
        </div>
      </section>
    );
  }

  return (
    <section className="stack stats-page">
      <div className="stats-heading-row">
        <div className="page-heading">
          <p className="eyebrow">Study dashboard</p>
          <h2>My Stats</h2>
        </div>
        <button className="secondary compact-button" disabled={loading} onClick={loadStats} type="button">
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="error-box">
          <span className="label">Could not load stats</span>
          <p>{error}</p>
          <button className="compact-button" onClick={loadStats} type="button">Retry</button>
        </div>
      )}

      {loading && !stats && <p className="muted-text">Loading stats...</p>}

      {stats && (
        <>
          {emptyStatsMessage(stats.overall.hands_played, stats.analyzed.hands_analyzed) && (
            <div className="notice-box">
              <span className="label">Next step</span>
              <p>{emptyStatsMessage(stats.overall.hands_played, stats.analyzed.hands_analyzed)}</p>
            </div>
          )}

          <section className="stats-section">
            <h3>Overall</h3>
            <div className="stats-card-grid">
              <MetricCard label="Hands played" value={stats.overall.hands_played} />
              <MetricCard label="Hands analysed" value={stats.analyzed.hands_analyzed} />
              <MetricCard label="Analysis sample" value={stats.analyzed.sample_size} />
              <MetricCard label="Preflop accuracy" value={formatStatsPercent(stats.analyzed.preflop_accuracy)} />
              <MetricCard label="Postflop mistakes" value={stats.analyzed.postflop_mistakes} />
            </div>
            <div className="panel stats-leak-panel">
              <span className="label">Biggest current leak</span>
              <strong>{stats.analyzed.biggest_leak}</strong>
            </div>
          </section>

          <section className="stats-section">
            <h3>Analysed Preflop Accuracy</h3>
            <div className="stats-card-grid compact">
              <MetricCard label="Decisions reviewed" value={stats.analyzed.preflop_decisions_reviewed} />
              <MetricCard label="Correct decisions" value={stats.analyzed.preflop_correct} />
              <MetricCard label="Last 30 days" value={formatStatsPercent(stats.recent.preflop_accuracy_30d)} />
            </div>
            <StatsAccuracyTable rows={stats.preflop_by_position} title="By position" />
            <StatsAccuracyTable rows={stats.preflop_by_spot} title="By spot" />
            <StatsCountList emptyText="No preflop mistakes found yet." rows={stats.preflop_mistake_types} title="Mistake types" />
          </section>

          <section className="stats-section">
            <h3>Postflop Mistake Map</h3>
            <div className="stats-card-grid compact">
              <MetricCard label="Decisions reviewed" value={stats.analyzed.postflop_decisions_reviewed} />
              <MetricCard label="Mistakes flagged" value={stats.analyzed.postflop_mistakes} />
            </div>
            <StatsMistakeTable rows={stats.postflop_by_street} title="By street" />
            <StatsMistakeTable rows={stats.postflop_by_action} title="By hero action" />
            <StatsMistakeTable rows={stats.postflop_by_situation} title="By situation" />
          </section>

          <section className="stats-section">
            <h3>Recent Activity</h3>
            <div className="stats-card-grid compact">
              <MetricCard label="Hands played, 7d" value={stats.recent.hands_played_7d} />
              <MetricCard label="Hands analysed, 7d" value={stats.recent.hands_analyzed_7d} />
              <MetricCard label="Hands played, 30d" value={stats.recent.hands_played_30d} />
              <MetricCard label="Hands analysed, 30d" value={stats.recent.hands_analyzed_30d} />
            </div>
          </section>

          <section className="stats-section">
            <h3>Recommended Study</h3>
            <div className="stats-recommendations">
              {stats.recommendations.map((item) => (
                <article className="panel stats-recommendation" key={`${item.label}-${item.to}`}>
                  <div>
                    <strong>{item.label}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <Link className="button-link compact-button" to={item.to}>Study</Link>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="stats-metric-card">
      <span className="label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatsAccuracyTable({ rows, title }: { rows: StatsAccuracyRow[]; title: string }) {
  return (
    <div className="table-wrap stats-table">
      <h4>{title}</h4>
      <table>
        <thead>
          <tr>
            <th>Group</th>
            <th>Decisions</th>
            <th>Correct</th>
            <th>Accuracy</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{row.decisions}</td>
              <td>{row.correct}</td>
              <td>{formatStatsPercent(row.accuracy)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="empty-table-message">No analysed decisions yet.</p>}
    </div>
  );
}

function StatsMistakeTable({ rows, title }: { rows: StatsMistakeRow[]; title: string }) {
  return (
    <div className="table-wrap stats-table">
      <h4>{title}</h4>
      <table>
        <thead>
          <tr>
            <th>Group</th>
            <th>Decisions</th>
            <th>Mistakes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{row.decisions}</td>
              <td>{row.mistakes}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="empty-table-message">No postflop decisions reviewed yet.</p>}
    </div>
  );
}

function StatsCountList({ emptyText, rows, title }: { emptyText: string; rows: StatsCountRow[]; title: string }) {
  return (
    <div className="panel stats-count-list">
      <h4>{title}</h4>
      {rows.length === 0 && <p className="muted-text">{emptyText}</p>}
      {rows.map((row) => (
        <div className="stats-count-row" key={row.label}>
          <span>{row.label}</span>
          <strong>{row.count}</strong>
        </div>
      ))}
    </div>
  );
}
