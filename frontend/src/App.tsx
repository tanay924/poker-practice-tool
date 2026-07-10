import { lazy, Suspense, useEffect, useId, useRef, useState, type FocusEvent } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";

import { getAnalysisAvailability, getNotifications } from "./api";
import { accountMenuModel, notificationTotal } from "./accountMenu";
import { profileLabelFromUserMetadata } from "./auth/accountProfile";
import { useAuth } from "./auth/AuthContext";
import { applyThemeSelection, loadThemeSelection } from "./theme/customization";
import type { NotificationCounts } from "./types";
import LandingPage from "./pages/LandingPage";
import { primaryNavigationItems } from "./pages/beginnerUx";
import PlayPage from "./pages/PlayPage";

const AnalysisDetailPage = lazy(() => import("./pages/AnalysisDetailPage"));
const AnalysisPage = lazy(() => import("./pages/AnalysisPage"));
const AuthCallbackPage = lazy(() => import("./pages/AuthCallbackPage"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const CustomizePage = lazy(() => import("./pages/CustomizePage"));
const FriendsPage = lazy(() => import("./pages/FriendsPage"));
const MethodologyPage = lazy(() => import("./pages/MethodologyPage"));
const PasswordResetPage = lazy(() => import("./pages/PasswordResetPage"));
const PreflopPracticePage = lazy(() => import("./pages/PreflopPracticePage"));
const RangesPage = lazy(() => import("./pages/RangesPage"));
const AccountSettingsPage = lazy(() => import("./pages/AccountSettingsPage"));
const AccessibilityPage = lazy(() => import("./pages/AccessibilityPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const SharedHandsPage = lazy(() => import("./pages/SharedHandsPage"));
const StatusPage = lazy(() => import("./pages/StatusPage"));
const StatsPage = lazy(() => import("./pages/StatsPage"));
const SupportPage = lazy(() => import("./pages/SupportPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));

export default function App() {
  useEffect(() => {
    applyThemeSelection(document.documentElement, loadThemeSelection());
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">HU</span>
          <div>
            <p className="eyebrow">Local study</p>
            <h1>Local Poker Trainer</h1>
          </div>
        </div>
        <nav className="nav-links" aria-label="Primary">
          {primaryNavigationItems().map((item) => (
            <NavLink key={item.to} to={item.to}>{item.label}</NavLink>
          ))}
        </nav>
        <AccountControls />
      </header>
      <main>
        <AnalysisAvailabilityBanner />
        <Suspense fallback={<div className="page-shell"><p className="muted">Loading study space…</p></div>}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="/auth/reset" element={<PasswordResetPage />} />
            <Route path="/play" element={<PlayPage />} />
            <Route path="/preflop" element={<PreflopPracticePage />} />
            <Route path="/analysis" element={<AnalysisPage />} />
            <Route path="/analysis/:handId" element={<AnalysisDetailPage />} />
            <Route path="/customize" element={<CustomizePage />} />
            <Route path="/friends" element={<FriendsPage />} />
            <Route path="/ranges" element={<RangesPage />} />
            <Route path="/settings" element={<AccountSettingsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/accessibility" element={<AccessibilityPage />} />
            <Route path="/status" element={<StatusPage />} />
            <Route path="/shared" element={<SharedHandsPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/methodology" element={<MethodologyPage />} />
            <Route path="/support" element={<SupportPage />} />
          </Routes>
        </Suspense>
      </main>
      <footer className="app-footer">
        <span>Local Poker Trainer · study tooling, not real-money play</span>
        <nav aria-label="Support and policy">
          <NavLink to="/methodology">Methodology</NavLink>
          <NavLink to="/status">Status</NavLink>
          <NavLink to="/support">Support</NavLink>
          <NavLink to="/privacy">Privacy</NavLink>
          <NavLink to="/terms">Terms</NavLink>
          <NavLink to="/accessibility">Accessibility</NavLink>
        </nav>
      </footer>
    </div>
  );
}

function AnalysisAvailabilityBanner() {
  const [control, setControl] = useState<{ enabled: boolean; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      getAnalysisAvailability()
        .then((next) => {
          if (!cancelled) {
            setControl(next);
          }
        })
        .catch(() => undefined);
    };
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  if (!control || control.enabled) {
    return null;
  }
  return (
    <div className="maintenance-banner" role="status">
      <strong>Analysis paused</strong>
      <span>{control.message}</span>
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
