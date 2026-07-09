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
  userLabel: "Pocket Tens"
});

assert.equal(signedIn.statusText, "Pocket Tens");
assert.deepEqual(signedIn.items.map((item) => item.label), ["My library", "Sign out"]);

const signedInWithoutUsername = accountMenuModel({
  authConfigured: true,
  isAuthenticated: true,
  loading: false,
  userLabel: null
});

assert.equal(signedInWithoutUsername.statusText, "Signed in");
assert.deepEqual(signedInWithoutUsername.items.map((item) => item.label), ["My library", "Sign out"]);

console.log("account menu tests passed");
