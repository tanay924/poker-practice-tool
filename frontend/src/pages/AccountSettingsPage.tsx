import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { deleteAccount, exportAccount } from "../api";
import { useAuth } from "../auth/AuthContext";

export default function AccountSettingsPage() {
  const { accessToken, loading, signOut, user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return <p className="muted-text">Checking account...</p>;
  }
  if (!user || !accessToken) {
    return (
      <section className="stack information-page">
        <div className="page-heading"><p className="eyebrow">Account</p><h2>Account settings</h2></div>
        <div className="notice-box"><p>Sign in to export or delete your account data.</p><Link className="button-link" to="/auth">Sign in</Link></div>
      </section>
    );
  }

  const handleExport = async () => {
    setBusy("export");
    setError(null);
    setMessage(null);
    try {
      const payload = await exportAccount(accessToken);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `poker-trainer-account-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("Your account export is ready.");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Could not export account data.");
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    const confirmation = window.prompt("Type DELETE to remove your locally stored hands, analyses, study spots, and social data.");
    if (confirmation !== "DELETE") {
      return;
    }
    setBusy("delete");
    setError(null);
    setMessage(null);
    try {
      const result = await deleteAccount(accessToken);
      await signOut();
      navigate("/");
      setMessage(result.message);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete account data.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="stack information-page">
      <div className="page-heading">
        <p className="eyebrow">Account</p>
        <h2>Account settings</h2>
        <p className="page-subtitle">Control the data stored by this trainer account.</p>
      </div>

      <section className="panel info-card">
        <h3>Export your data</h3>
        <p>Download your profile, saved hands, analysis jobs, shared hands, and social records as a JSON file.</p>
        <button className="secondary" disabled={busy !== null} onClick={() => void handleExport()} type="button">
          {busy === "export" ? "Preparing export…" : "Download account export"}
        </button>
      </section>

      <section className="panel info-card danger-card">
        <h3>Delete local account data</h3>
        <p>This removes your trainer data from the application database. It does not delete the external Supabase identity automatically.</p>
        <button className="action-danger" disabled={busy !== null} onClick={() => void handleDelete()} type="button">
          {busy === "delete" ? "Deleting…" : "Delete local data"}
        </button>
      </section>

      {message && <p className="success-text" role="status">{message}</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
    </section>
  );
}
