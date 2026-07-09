import assert from "node:assert/strict";

import {
  GUEST_TRIAL_LIMIT,
  guestTrialMessage,
  guestTrialSnapshot,
  recordGuestTrialUse,
  resetGuestTrialForTests
} from "./guestTrial";

const storage = new Map<string, string>();
const fakeStorage = {
  getItem(key: string) {
    return storage.get(key) ?? null;
  },
  setItem(key: string, value: string) {
    storage.set(key, value);
  },
  removeItem(key: string) {
    storage.delete(key);
  }
};

resetGuestTrialForTests(fakeStorage);

let analysis = guestTrialSnapshot("analysis", fakeStorage);
assert.equal(analysis.used, 0);
assert.equal(analysis.remaining, GUEST_TRIAL_LIMIT);
assert.equal(analysis.limitReached, false);
assert.equal(guestTrialMessage(analysis, "analysis"), "5 free analysis hands remaining.");

for (let index = 0; index < GUEST_TRIAL_LIMIT; index += 1) {
  analysis = recordGuestTrialUse("analysis", fakeStorage);
}

assert.equal(analysis.used, GUEST_TRIAL_LIMIT);
assert.equal(analysis.remaining, 0);
assert.equal(analysis.limitReached, true);
assert.equal(guestTrialMessage(analysis, "analysis"), "Free analysis trial used. Sign in to analyze more hands.");

const preflop = recordGuestTrialUse("preflop", fakeStorage);
assert.equal(preflop.used, 1);
assert.equal(preflop.remaining, GUEST_TRIAL_LIMIT - 1);
assert.equal(guestTrialSnapshot("analysis", fakeStorage).used, GUEST_TRIAL_LIMIT);

console.log("guest trial tests passed");
