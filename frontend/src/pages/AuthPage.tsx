import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";

type AuthMode = "signin" | "signup";

export default function AuthPage() {
  const { authConfigured, signIn, signUp } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const redirectPath = safeRedirectPath(searchParams.get("redirect"));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      if (mode === "signup") {
        await signUp(email, password, `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirectPath)}`);
        setNotice("Check your email to finish creating your account.");
      } else {
        await signIn(email, password);
        navigate(redirectPath, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="auth-page">
      <div className="auth-panel panel">
        <p className="eyebrow">Account</p>
        <h2>{mode === "signin" ? "Sign in" : "Create account"}</h2>
        <p className="muted-text">Play as a guest, or sign in to save hands and run solver analysis.</p>

        {!authConfigured && (
          <p className="error-text">Supabase is not configured yet. Add the Supabase URL and publishable key to enable accounts.</p>
        )}

        <form className="auth-form" onSubmit={submit}>
          <label>
            <span className="label">Email</span>
            <input
              autoComplete="email"
              disabled={!authConfigured || submitting}
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            <span className="label">Password</span>
            <input
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              disabled={!authConfigured || submitting}
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <button disabled={!authConfigured || submitting} type="submit">
            {submitting ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        {error && <p className="error-text" role="alert">{error}</p>}
        {notice && <p className="status-text ready" role="status">{notice}</p>}

        <button className="secondary" onClick={() => setMode(mode === "signin" ? "signup" : "signin")} type="button">
          {mode === "signin" ? "Create an account" : "I already have an account"}
        </button>
        <Link className="back-link" to="/play">Continue as guest</Link>
      </div>
    </section>
  );
}

function safeRedirectPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/play";
  }
  return value;
}
