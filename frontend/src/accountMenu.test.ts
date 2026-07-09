import assert from "node:assert/strict";

import { accountMenuModel } from "./accountMenu";

const guestNoConfig = accountMenuModel({
  authConfigured: false,
  isAuthenticated: false,
  loading: false,
  userLabel: null
});

assert.equal(guestNoConfig.triggerLabel, "Account menu");
assert.equal(guestNoConfig.statusText, "Guest mode");
assert.deepEqual(guestNoConfig.items.map((item) => item.label), ["My library", "Sign in"]);

const signedOut = accountMenuModel({
  authConfigured: true,
  isAuthenticated: false,
  loading: false,
  userLabel: null
});

assert.equal(signedOut.statusText, "Guest mode");
assert.deepEqual(signedOut.items.map((item) => item.label), ["My library", "Sign in"]);

const signedIn = accountMenuModel({
  authConfigured: true,
  isAuthenticated: true,
  loading: false,
  notifications: {
    pending_friend_requests: 2,
    unread_shared_hands: 1
  },
  userLabel: "Pocket Tens"
});

assert.equal(signedIn.statusText, "Pocket Tens");
assert.equal(signedIn.triggerLabel, "Account menu, 3 notifications");
assert.deepEqual(signedIn.items.map((item) => item.label), ["My library", "Shared with me", "Manage friends", "Sign out"]);
assert.deepEqual(signedIn.items.map((item) => item.badge ?? null), [null, "1", "2", null]);

const signedInWithoutUsername = accountMenuModel({
  authConfigured: true,
  isAuthenticated: true,
  loading: false,
  notifications: null,
  userLabel: null
});

assert.equal(signedInWithoutUsername.statusText, "Signed in");
assert.deepEqual(signedInWithoutUsername.items.map((item) => item.label), ["My library", "Shared with me", "Manage friends", "Sign out"]);

console.log("account menu tests passed");
