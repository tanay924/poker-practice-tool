import assert from "node:assert/strict";

import { playCompletionMessage, playCompletionPrimaryAction } from "./playCompletionCopy";

assert.equal(
  playCompletionMessage({
    authConfigured: true,
    authLoading: false,
    isAuthenticated: false,
    savedHandId: null,
    saving: false
  }),
  "Guest hand complete. Sign in to save this hand and run solver analysis."
);
assert.deepEqual(
  playCompletionPrimaryAction({
    authConfigured: true,
    authLoading: false,
    isAuthenticated: false,
    savedHandId: null,
    saving: false
  }),
  { kind: "auth", label: "Sign in to save and analyze", to: "/auth?redirect=/play" }
);

assert.equal(
  playCompletionMessage({
    authConfigured: true,
    authLoading: false,
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
    isAuthenticated: false,
    savedHandId: null,
    saving: false
  }),
  null
);

console.log("play completion copy tests passed");
