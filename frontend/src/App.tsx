import { NavLink, Navigate, Route, Routes } from "react-router-dom";

import AnalysisDetailPage from "./pages/AnalysisDetailPage";
import AnalysisPage from "./pages/AnalysisPage";
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
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/play" replace />} />
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
