import { useEffect, useId, useRef, useState, type FocusEvent } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";

import { getNotifications } from "./api";
import { accountMenuModel, notificationTotal } from "./accountMenu";
import { profileLabelFromUserMetadata } from "./auth/accountProfile";
import { useAuth } from "./auth/AuthContext";
import type { NotificationCounts } from "./types";
import AnalysisDetailPage from "./pages/AnalysisDetailPage";
import AnalysisPage from "./pages/AnalysisPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import AuthPage from "./pages/AuthPage";
import FriendsPage from "./pages/FriendsPage";
import PlayPage from "./pages/PlayPage";
import PreflopPracticePage from "./pages/PreflopPracticePage";
import RangesPage from "./pages/RangesPage";
import SharedHandsPage from "./pages/SharedHandsPage";
import StatsPage from "./pages/StatsPage";

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">HU</span>
          <div>
            <p className="eyebrow">Offline study</p>
            <h1>Local Poker Trainer</h1>
          </div>
        </div>
        <nav className="nav-links" aria-label="Primary">
          <NavLink to="/play">Play</NavLink>
          <NavLink to="/preflop">Preflop</NavLink>
          <NavLink to="/analysis">Analysis</NavLink>
          <NavLink to="/ranges">Ranges</NavLink>
        </nav>
        <AccountControls />
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/play" replace />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/play" element={<PlayPage />} />
          <Route path="/preflop" element={<PreflopPracticePage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
          <Route path="/analysis/:handId" element={<AnalysisDetailPage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/ranges" element={<RangesPage />} />
          <Route path="/shared" element={<SharedHandsPage />} />
          <Route path="/stats" element={<StatsPage />} />
        </Routes>
      </main>
    </div>
  );
}

function AccountControls() {
  const { accessToken, authConfigured, loading, signOut, user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationCounts | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const menu = accountMenuModel({
    authConfigured,
    isAuthenticated: Boolean(user),
    loading,
    notifications,
    userLabel: profileLabelFromUserMetadata(user?.user_metadata)
  });
  const totalNotifications = notificationTotal(notifications);

  useEffect(() => {
    if (!accessToken || !user) {
      setNotifications(null);
      return;
    }
    let cancelled = false;
    const refreshNotifications = () => {
      getNotifications(accessToken)
        .then((next) => {
          if (!cancelled) {
            setNotifications(next);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setNotifications(null);
          }
        });
    };

    refreshNotifications();
    const interval = window.setInterval(refreshNotifications, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [accessToken, user]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const closeOnBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextFocus = event.relatedTarget;
    if (!containerRef.current?.contains(nextFocus)) {
      setOpen(false);
    }
  };

  return (
    <div className="account-menu" onBlur={closeOnBlur} ref={containerRef}>
      <button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={menu.triggerLabel}
        className="account-icon-button"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="account-avatar-icon" aria-hidden="true" />
        {totalNotifications > 0 && <span className="account-notification-badge">{totalNotifications}</span>}
      </button>

      {open && (
        <div className="account-menu-popover" id={menuId} aria-label="Account panel" role="dialog">
          <p className="account-menu-status">{menu.statusText}</p>
          {menu.items.map((item) => {
            if (item.action === "signOut") {
              return (
                <button
                  className="account-menu-action"
                  key={item.label}
                  onClick={() => {
                    setOpen(false);
                    void signOut();
                  }}
                  type="button"
                >
                  {item.label}
                </button>
              );
            }
            return (
              <NavLink className="account-menu-link" key={item.label} onClick={() => setOpen(false)} to={item.to ?? "/play"}>
                <span>{item.label}</span>
                {item.badge && <span className="menu-item-badge">{item.badge}</span>}
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}
