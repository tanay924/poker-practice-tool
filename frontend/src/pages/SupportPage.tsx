import { Link } from "react-router-dom";

export default function SupportPage() {
  return (
    <section className="stack information-page">
      <div className="page-heading">
        <p className="eyebrow">Help and troubleshooting</p>
        <h2>Support</h2>
        <p className="page-subtitle">Most problems are recoverable without losing the hand you were studying.</p>
      </div>

      <section className="panel info-card">
        <h3>Analysis is taking a while</h3>
        <p>Analysis is asynchronous and can take minutes on the local solver. You can leave the page and return through Hand Library. A queued job can be cancelled; a failed or unsupported job can be retried.</p>
        <Link className="text-link" to="/analysis">Open Hand Library</Link>
      </section>

      <section className="panel info-card">
        <h3>The app is not responding</h3>
        <ol>
          <li>Refresh the page once.</li>
          <li>Check that the frontend is running on port 5173.</li>
          <li>Check the backend health endpoint at <code>/api/health</code>.</li>
          <li>If only analysis is affected, keep playing and retry the job later.</li>
        </ol>
      </section>

      <section className="panel info-card">
        <h3>Account recovery</h3>
        <p>Use “Forgot password?” on the sign-in screen. The reset link opens the password update page.</p>
        <Link className="text-link" to="/auth">Open account screen</Link>
      </section>

      <section className="panel info-card">
        <h3>What to include when reporting a problem</h3>
        <p>Include the page, the visible status/error message, whether you were signed in or a guest, and the approximate time. Never send passwords, access tokens, or the whole database.</p>
      </section>
    </section>
  );
}
