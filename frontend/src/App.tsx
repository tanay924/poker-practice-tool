import { useEffect, useId, useRef, useState, type FocusEvent } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";

import { accountMenuModel } from "./accountMenu";
import { profileLabelFromUserMetadata } from "./auth/accountProfile";
import { useAuth } from "./auth/AuthContext";
import AnalysisDetailPage from "./pages/AnalysisDetailPage";
import AnalysisPage from "./pages/AnalysisPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import AuthPage from "./pages/AuthPage";
import PlayPage from "./pages/PlayPage";
import PreflopPracticePage from "./pages/PreflopPracticePage";
import RangesPage from "./pages/RangesPage";

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
          <Route path="/ranges" element={<RangesPage />} />
        </Routes>
      </main>
    </div>
  );
}

function AccountControls() {
  const { authConfigured, loading, signOut, user } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const menu = accountMenuModel({
    authConfigured,
    isAuthenticated: Boolean(user),
    loading,
    userLabel: profileLabelFromUserMetadata(user?.user_metadata)
  });

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
                {item.label}
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}
