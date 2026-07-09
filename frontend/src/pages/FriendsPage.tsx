import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { acceptFriendRequest, declineFriendRequest, listFriendRequests, listFriends, sendFriendRequest } from "../api";
import { profileLabelFromUserMetadata } from "../auth/accountProfile";
import { useAuth } from "../auth/AuthContext";
import type { FriendRead, FriendRequestRead } from "../types";
import { partitionFriendRequests } from "./socialViews";

export default function FriendsPage() {
  const { accessToken, authConfigured, loading: authLoading, user } = useAuth();
  const [friends, setFriends] = useState<FriendRead[]>([]);
  const [requests, setRequests] = useState<FriendRequestRead[]>([]);
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const currentUsername = profileLabelFromUserMetadata(user?.user_metadata);
  const requestBuckets = useMemo(() => partitionFriendRequests(requests, currentUsername), [currentUsername, requests]);

  useEffect(() => {
    if (!accessToken || !user) {
      setFriends([]);
      setRequests([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([listFriends(accessToken), listFriendRequests(accessToken)])
      .then(([nextFriends, nextRequests]) => {
        if (!cancelled) {
          setFriends(nextFriends);
          setRequests(nextRequests);
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
  }, [accessToken, refreshIndex, user]);

  if (authLoading) {
    return <p className="muted-text">Checking account...</p>;
  }

  if (!user) {
    return (
      <section className="stack social-page">
        <div className="page-heading">
          <p className="eyebrow">Social study</p>
          <h2>Manage friends</h2>
        </div>
        <div className="panel signed-out-panel">
          <h3>Sign in to add friends</h3>
          <p className="muted-text">Friend requests and shared hands are tied to your account.</p>
          {authConfigured && <Link className="button-link" to="/auth?redirect=/friends">Sign in</Link>}
        </div>
      </section>
    );
  }

  const submitFriendRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !username.trim()) {
      return;
    }
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await sendFriendRequest(username, accessToken);
      setUsername("");
      setMessage("Friend request sent.");
      setRefreshIndex((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send friend request.");
    } finally {
      setSubmitting(false);
    }
  };

  const respondToRequest = async (requestId: number, action: "accept" | "decline") => {
    if (!accessToken) {
      return;
    }
    setError(null);
    setMessage(null);
    try {
      if (action === "accept") {
        await acceptFriendRequest(requestId, accessToken);
        setMessage("Friend request accepted.");
      } else {
        await declineFriendRequest(requestId, accessToken);
        setMessage("Friend request declined.");
      }
      setRefreshIndex((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update friend request.");
    }
  };

  return (
    <section className="stack social-page">
      <div className="page-heading">
        <p className="eyebrow">Social study</p>
        <h2>Manage friends</h2>
      </div>

      <section className="panel social-panel">
        <div>
          <h3>Add a friend</h3>
          <p className="muted-text">Search by exact username. Requests must be accepted before hands can be shared.</p>
        </div>
        <form className="social-form" onSubmit={submitFriendRequest}>
          <label>
            <span className="label">Username</span>
            <input
              autoComplete="off"
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Pocket Tens"
              value={username}
            />
          </label>
          <button disabled={submitting || !username.trim()} type="submit">
            {submitting ? "Sending..." : "Send request"}
          </button>
        </form>
        {message && <p className="success-text">{message}</p>}
        {error && <p className="error-text">{error}</p>}
      </section>

      <div className="social-columns">
        <section className="panel social-panel">
          <h3>Requests</h3>
          {loading && <p className="muted-text">Loading requests...</p>}
          {!loading && requestBuckets.incoming.length === 0 && requestBuckets.outgoing.length === 0 && (
            <p className="muted-text">No pending friend requests.</p>
          )}
          <div className="social-list">
            {requestBuckets.incoming.map((request) => (
              <article className="social-row" key={request.id}>
                <div>
                  <strong>{request.requester_username}</strong>
                  <span>wants to add you</span>
                </div>
                <div className="social-row-actions">
                  <button className="compact-button" onClick={() => void respondToRequest(request.id, "accept")} type="button">
                    Accept
                  </button>
                  <button className="compact-button secondary" onClick={() => void respondToRequest(request.id, "decline")} type="button">
                    Decline
                  </button>
                </div>
              </article>
            ))}
            {requestBuckets.outgoing.map((request) => (
              <article className="social-row" key={request.id}>
                <div>
                  <strong>{request.recipient_username}</strong>
                  <span>request pending</span>
                </div>
                <span className="status-pill queued">pending</span>
              </article>
            ))}
          </div>
        </section>

        <section className="panel social-panel">
          <h3>Friends</h3>
          {loading && <p className="muted-text">Loading friends...</p>}
          {!loading && friends.length === 0 && <p className="muted-text">Accepted friends will appear here.</p>}
          <div className="social-list">
            {friends.map((friend) => (
              <article className="social-row" key={friend.user_id}>
                <div>
                  <strong>{friend.username}</strong>
                  <span>can receive shared hands</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
