import { useEffect, useState } from "react";

import { getAnalysisAvailability } from "../api";

export default function StatusPage() {
  const [analysis, setAnalysis] = useState<{ enabled: boolean; message: string } | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  useEffect(() => {
    getAnalysisAvailability().then((next) => {
      setAnalysis(next);
      setCheckedAt(new Date().toLocaleTimeString());
    }).catch(() => setAnalysis(null));
  }, []);

  return (
    <section className="stack information-page">
      <div className="page-heading"><p className="eyebrow">Operational status</p><h2>Status</h2><p className="page-subtitle">Practice remains available while expensive analysis can be paused independently.</p></div>
      <div className="status-overview-grid">
        <div className="panel info-card"><span className="status-pill ready">Practice</span><h3>Available</h3><p>Local play, preflop drills, ranges, and existing answer sheets can remain usable during solver maintenance.</p></div>
        <div className="panel info-card"><span className={`status-pill ${analysis?.enabled ? "ready" : "queued"}`}>Analysis</span><h3>{analysis ? (analysis.enabled ? "Available" : "Paused") : "Checking"}</h3><p>{analysis?.message ?? "Checking the analysis admission control."}</p></div>
      </div>
      {checkedAt && <p className="muted-text">Last checked at {checkedAt}.</p>}
    </section>
  );
}
