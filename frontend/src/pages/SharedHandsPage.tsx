import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { listSharedHands, markSharedHandRead, reportSocialContent, revokeSharedHand } from "../api";
import { useAuth } from "../auth/AuthContext";
import type { SharedHandRead } from "../types";
import { formatSharedBoard } from "./socialViews";

export default function SharedHandsPage() {
  const { accessToken, authConfigured, loading: authLoading, user } = useAuth();
  const [items, setItems] = useState<SharedHandRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !user) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listSharedHands(accessToken)
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
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, user]);

  if (authLoading) {
    return <p className="muted-text">Checking account...</p>;
  }

  if (!user) {
    return (
      <section className="stack social-page">
        <div className="page-heading">
          <p className="eyebrow">Shared library</p>
          <h2>Shared with me</h2>
        </div>
        <div className="panel signed-out-panel">
          <h3>Sign in to view shared hands</h3>
          <p className="muted-text">Hands shared by friends are private to your account.</p>
          {authConfigured && <Link className="button-link" to="/auth?redirect=/shared">Sign in</Link>}
        </div>
      </section>
    );
  }

  const markRead = (share: SharedHandRead) => {
    if (!accessToken || share.read_at) {
      return;
    }
    void markSharedHandRead(share.id, accessToken).then((updated) => {
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    });
  };

  const revokeShare = async (share: SharedHandRead) => {
    if (!accessToken || !window.confirm("Remove this shared hand from your library?")) {
      return;
    }
    try {
      await revokeSharedHand(share.id, accessToken);
      setItems((current) => current.filter((item) => item.id !== share.id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove shared hand.");
    }
  };

  const reportShare = async (share: SharedHandRead) => {
    if (!accessToken || !window.confirm("Report this shared hand to the administrator?")) {
      return;
    }
    try {
      await reportSocialContent({ share_id: share.id, reason: "shared-hand" }, accessToken);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit report.");
    }
  };

  return (
    <section className="stack social-page">
      <div className="page-heading">
        <p className="eyebrow">Shared library</p>
        <h2>Shared with me</h2>
      </div>

      {error && <p className="error-text">{error}</p>}
      {loading && <p className="muted-text">Loading shared hands...</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Hand</th>
              <th>From</th>
              <th>Hero</th>
              <th>Board</th>
              <th>Status</th>
              <th>Shared</th>
              <th>Open</th>
              <th>Manage</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className={!item.read_at ? "unread-row" : undefined} key={item.id}>
                <td>#{item.hand_id}</td>
                <td>{item.owner_username}</td>
                <td>{item.hero_hand}</td>
                <td>{formatSharedBoard(item.board)}</td>
                <td>{item.status ? <span className={`status-pill ${item.status}`}>{item.status}</span> : "No job"}</td>
                <td>{new Date(item.created_at).toLocaleString()}</td>
                <td>
                  <Link
                    className="button-link compact-button"
                    onClick={() => markRead(item)}
                    to={`/analysis/${item.hand_id}?shared=1`}
                  >
                    {item.status === "ready" ? "Answer sheet" : "Details"}
                  </Link>
                </td>
                <td>
                  <div className="inline-action-row">
                    <button className="action-danger compact-button" onClick={() => void revokeShare(item)} type="button">Remove</button>
                    <button className="secondary compact-button" onClick={() => void reportShare(item)} type="button">Report</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && items.length === 0 && <p className="empty-table-message">No hands have been shared with you yet.</p>}
      </div>
    </section>
  );
}
