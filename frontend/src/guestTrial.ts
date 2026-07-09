export type GuestTrialKind = "analysis" | "preflop";

export interface GuestTrialSnapshot {
  limit: number;
  limitReached: boolean;
  remaining: number;
  used: number;
}

type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export const GUEST_TRIAL_LIMIT = 5;

const GUEST_SESSION_KEY = "poker-trainer-guest-session-id";
const TRIAL_KEYS: Record<GuestTrialKind, string> = {
  analysis: "poker-trainer-guest-analysis-count",
  preflop: "poker-trainer-guest-preflop-count"
};

export function guestTrialSnapshot(kind: GuestTrialKind, storage: StorageLike = window.localStorage): GuestTrialSnapshot {
  const used = readTrialCount(kind, storage);
  return {
    limit: GUEST_TRIAL_LIMIT,
    limitReached: used >= GUEST_TRIAL_LIMIT,
    remaining: Math.max(GUEST_TRIAL_LIMIT - used, 0),
    used
  };
}

export function recordGuestTrialUse(kind: GuestTrialKind, storage: StorageLike = window.localStorage): GuestTrialSnapshot {
  const current = readTrialCount(kind, storage);
  storage.setItem(TRIAL_KEYS[kind], String(Math.min(current + 1, GUEST_TRIAL_LIMIT)));
  return guestTrialSnapshot(kind, storage);
}

export function guestTrialMessage(snapshot: GuestTrialSnapshot, kind: GuestTrialKind): string {
  if (snapshot.limitReached) {
    return kind === "analysis"
      ? "Free analysis trial used. Sign in to analyze more hands."
      : "Free preflop trial used. Sign in to keep practicing.";
  }
  const noun = kind === "analysis" ? "analysis hands" : "preflop hands";
  return `${snapshot.remaining} free ${noun} remaining.`;
}

export function getOrCreateGuestSessionId(storage: StorageLike = window.localStorage): string {
  const existing = storage.getItem(GUEST_SESSION_KEY);
  if (existing) {
    return existing;
  }
  const next = createGuestSessionId();
  storage.setItem(GUEST_SESSION_KEY, next);
  return next;
}

export function resetGuestTrialForTests(storage: StorageLike): void {
  storage.removeItem(GUEST_SESSION_KEY);
  storage.removeItem(TRIAL_KEYS.analysis);
  storage.removeItem(TRIAL_KEYS.preflop);
}

function readTrialCount(kind: GuestTrialKind, storage: StorageLike): number {
  const parsed = Number.parseInt(storage.getItem(TRIAL_KEYS[kind]) ?? "0", 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.min(parsed, GUEST_TRIAL_LIMIT);
}

function createGuestSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `guest_${crypto.randomUUID().replace(/-/g, "")}`;
  }
  const random = Math.random().toString(36).slice(2);
  return `guest_${Date.now().toString(36)}_${random}`;
}
