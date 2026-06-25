import { NavLink, Navigate, Route, Routes } from "react-router-dom";

import AnalysisDetailPage from "./pages/AnalysisDetailPage";
import AnalysisPage from "./pages/AnalysisPage";
import PlayPage from "./pages/PlayPage";
import RangesPage from "./pages/RangesPage";

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Offline study</p>
          <h1>Local Poker Trainer</h1>
        </div>
        <nav className="nav-links" aria-label="Primary">
          <NavLink to="/play">Play</NavLink>
          <NavLink to="/analysis">Analysis</NavLink>
          <NavLink to="/ranges">Ranges</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/play" replace />} />
          <Route path="/play" element={<PlayPage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
          <Route path="/analysis/:handId" element={<AnalysisDetailPage />} />
          <Route path="/ranges" element={<RangesPage />} />
        </Routes>
      </main>
    </div>
  );
}
