import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";

export default function PasswordResetPage() {
  const { authConfigured, session, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await updatePassword(password);
      setNotice("Password updated. You can continue studying.");
      window.setTimeout(() => navigate("/play", { replace: true }), 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update your password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="auth-page">
      <div className="auth-panel panel">
        <p className="eyebrow">Account recovery</p>
        <h2>Choose a new password</h2>
        {!authConfigured && <p className="error-text">Supabase is not configured yet.</p>}
        {!session && authConfigured && <p className="muted-text">Open this page from the reset link in your email.</p>}
        <form className="auth-form" onSubmit={submit}>
          <label>
            <span className="label">New password</span>
            <input autoComplete="new-password" disabled={!authConfigured || !session || submitting} minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>
          <label>
            <span className="label">Confirm password</span>
            <input autoComplete="new-password" disabled={!authConfigured || !session || submitting} minLength={8} onChange={(event) => setConfirmation(event.target.value)} required type="password" value={confirmation} />
          </label>
          <button disabled={!authConfigured || !session || submitting} type="submit">{submitting ? "Updating..." : "Update password"}</button>
        </form>
        {error && <p className="error-text" role="alert">{error}</p>}
        {notice && <p className="status-text ready" role="status">{notice}</p>}
        <Link className="back-link" to="/auth">Back to account</Link>
      </div>
    </section>
  );
}
