import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";

export default function AuthCallbackPage() {
  const { loading } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      navigate(safeRedirectPath(searchParams.get("redirect")), { replace: true });
    }
  }, [loading, navigate, searchParams]);

  return <p className="muted-text">Finishing sign in...</p>;
}

function safeRedirectPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/play";
  }
  return value;
}
