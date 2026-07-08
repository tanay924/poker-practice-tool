import { NavLink, Navigate, Route, Routes } from "react-router-dom";

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
  if (!authConfigured) {
    return <NavLink className="account-link" to="/auth">Guest</NavLink>;
  }
  if (loading) {
    return <span className="account-status">Checking account...</span>;
  }
  if (!user) {
    return <NavLink className="account-link" to="/auth">Sign in</NavLink>;
  }
  return (
    <div className="account-controls">
      <span>{user.email ?? "Signed in"}</span>
      <button className="secondary compact-button" onClick={() => void signOut()} type="button">
        Sign out
      </button>
    </div>
  );
}
