import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { cancelAnalysis, deleteHand, listAnalysisPage } from "../api";
import { useAuth } from "../auth/AuthContext";
import { getOrCreateGuestSessionId } from "../guestTrial";
import type { AnalysisListItem } from "../types";
import { analysisStatusCounts, analysisStatusOptions, filterAnalysisItems, type AnalysisStatusFilter } from "./analysisListFilters";
import { analysisEmptyState } from "./beginnerUx";

export default function AnalysisPage() {
  const { accessToken, authConfigured, loading: authLoading, user } = useAuth();
  const [items, setItems] = useState<AnalysisListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AnalysisStatusFilter>("all");
  const [actionError, setActionError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadedOlderItems = useRef(false);
  const filteredItems = useMemo(() => filterAnalysisItems(items, { query, status: statusFilter }), [items, query, statusFilter]);
  const statusCounts = useMemo(() => analysisStatusCounts(items), [items]);
  const hasActiveFilters = query.trim().length > 0 || statusFilter !== "all";
  const emptyState = analysisEmptyState({ hasItems: items.length > 0, hasQuery: hasActiveFilters });

  const removeHand = async (handId: number) => {
    if (!window.confirm("Delete this hand and its analysis? This cannot be undone.")) {
      return;
    }
    const auth = accessToken ? accessToken : { guestSessionId: getOrCreateGuestSessionId() };
    try {
      await deleteHand(handId, auth);
      setItems((current) => current.filter((item) => item.hand_id !== handId));
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not delete this hand.");
    }
  };

  const stopAnalysis = async (handId: number) => {
    const auth = accessToken ? accessToken : { guestSessionId: getOrCreateGuestSessionId() };
    try {
      const next = await cancelAnalysis(handId, auth);
      setItems((current) => current.map((item) => item.hand_id === handId ? { ...item, status: next.status } : item));
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not cancel this analysis.");
    }
  };

  useEffect(() => {
    const auth = accessToken ? accessToken : { guestSessionId: getOrCreateGuestSessionId() };
    loadedOlderItems.current = false;
    setNextCursor(null);
    let cancelled = false;
    const refresh = () => {
      listAnalysisPage(auth)
        .then((next) => {
          if (!cancelled) {
            setItems((current) => loadedOlderItems.current ? mergeAnalysisItems(current, next.items) : next.items);
            if (!loadedOlderItems.current) {
              setNextCursor(next.next_cursor);
            }
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
  }, [accessToken]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) {
      return;
    }
    const auth = accessToken ? accessToken : { guestSessionId: getOrCreateGuestSessionId() };
    setLoadingMore(true);
    try {
      const next = await listAnalysisPage(auth, nextCursor);
      loadedOlderItems.current = true;
      setItems((current) => mergeAnalysisItems(current, next.items));
      setNextCursor(next.next_cursor);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not load older hands.");
    } finally {
      setLoadingMore(false);
    }
  };

  if (authLoading) {
    return <p className="muted-text">Checking account...</p>;
  }

  return (
    <section className="stack">
      <div className="page-heading">
        <p className="eyebrow">{user ? "Saved answer sheets" : "Guest trial answer sheets"}</p>
        <h2>Hand Library</h2>
        <p className="page-subtitle">Review completed hands, open answer sheets, and track solver jobs.</p>
      </div>

      {!user && (
        <div className="panel signed-out-panel">
          <h3>Guest analysis trial</h3>
          <p className="muted-text">
            These answer sheets are tied to this browser. Sign in to keep a permanent private library.
          </p>
          {authConfigured && <Link className="button-link" to="/auth?redirect=/analysis">Sign in</Link>}
        </div>
      )}

      {error && <p className="error-text">{error}</p>}
      {actionError && <p className="error-text" role="alert">{actionError}</p>}

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
              <th>Manage</th>
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
                <td>
                  {(item.status === "queued" || item.status === "solving") && (
                    <button className="secondary compact-button" onClick={() => void stopAnalysis(item.hand_id)} type="button">
                      Cancel
                    </button>
                  )}
                  <button className="action-danger compact-button" onClick={() => void removeHand(item.hand_id)} type="button">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredItems.length === 0 && (
          <div className="empty-state">
            <h3>{emptyState.title}</h3>
            <p>{emptyState.message}</p>
            {emptyState.actionTo ? (
              <Link className="button-link compact-button" to={emptyState.actionTo}>{emptyState.actionLabel}</Link>
            ) : (
              <button
                className="secondary compact-button"
                onClick={() => {
                  setQuery("");
                  setStatusFilter("all");
                }}
                type="button"
              >
                {emptyState.actionLabel}
              </button>
            )}
          </div>
        )}
        {nextCursor && (
          <div className="load-more-row">
            <button className="secondary" disabled={loadingMore} onClick={() => void loadMore()} type="button">
              {loadingMore ? "Loading older hands…" : "Load older hands"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function mergeAnalysisItems(primary: AnalysisListItem[], secondary: AnalysisListItem[]): AnalysisListItem[] {
  const byJobId = new Map<number, AnalysisListItem>();
  for (const item of [...primary, ...secondary]) {
    byJobId.set(item.job_id, item);
  }
  return [...byJobId.values()].sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
}

function statusLabel(status: AnalysisStatusFilter) {
  if (status === "all") {
    return "All";
  }
  return status[0].toUpperCase() + status.slice(1);
}
