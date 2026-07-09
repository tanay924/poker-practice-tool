import assert from "node:assert/strict";

import { playCompletionMessage, playCompletionPrimaryAction } from "./playCompletionCopy";

assert.equal(
  playCompletionMessage({
    authConfigured: true,
    authLoading: false,
    guestTrial: { limit: 5, limitReached: false, remaining: 3, used: 2 },
    isAuthenticated: false,
    savedHandId: null,
    saving: false
  }),
  "Guest hand complete. 3 free analysis hands remaining."
);
assert.deepEqual(
  playCompletionPrimaryAction({
    authConfigured: true,
    authLoading: false,
    guestTrial: { limit: 5, limitReached: false, remaining: 3, used: 2 },
    isAuthenticated: false,
    savedHandId: null,
    saving: false
  }),
  null
);
assert.deepEqual(
  playCompletionPrimaryAction({
    authConfigured: true,
    authLoading: false,
    guestTrial: { limit: 5, limitReached: true, remaining: 0, used: 5 },
    isAuthenticated: false,
    savedHandId: null,
    saving: false
  }),
  { kind: "auth", label: "Sign in to analyze more hands", to: "/auth?redirect=/play" }
);

assert.equal(
  playCompletionMessage({
    authConfigured: true,
    authLoading: false,
    guestTrial: null,
    isAuthenticated: true,
    savedHandId: 42,
    saving: false
  }),
  "Saved as hand #42"
);
assert.equal(
  playCompletionMessage({
    authConfigured: true,
    authLoading: false,
    guestTrial: null,
    isAuthenticated: true,
    savedHandId: null,
    saving: true
  }),
  "Saving hand..."
);
assert.equal(
  playCompletionPrimaryAction({
    authConfigured: false,
    authLoading: false,
    guestTrial: { limit: 5, limitReached: false, remaining: 5, used: 0 },
    isAuthenticated: false,
    savedHandId: null,
    saving: false
  }),
  null
);

console.log("play completion copy tests passed");
