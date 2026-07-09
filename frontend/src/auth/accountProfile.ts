const MIN_USERNAME_LENGTH = 2;
const MAX_USERNAME_LENGTH = 24;

export function normalizeUsername(username: string): string {
  return username.trim().replace(/\s+/g, " ");
}

export function validateUsername(username: string): string | null {
  const normalized = normalizeUsername(username);
  if (normalized.length < MIN_USERNAME_LENGTH) {
    return "Username must be at least 2 characters.";
  }
  if (normalized.length > MAX_USERNAME_LENGTH) {
    return "Username must be 24 characters or fewer.";
  }
  return null;
}

export function signupUserMetadata(username: string): Record<string, string> {
  const normalized = normalizeUsername(username);
  return {
    display_name: normalized,
    username: normalized
  };
}

export function profileLabelFromUserMetadata(metadata: Record<string, unknown> | undefined | null): string | null {
  return cleanProfileLabel(metadata?.username) ?? cleanProfileLabel(metadata?.display_name);
}

function cleanProfileLabel(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = normalizeUsername(value);
  return normalized ? normalized : null;
}
