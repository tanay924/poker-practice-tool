import assert from "node:assert/strict";

import { profileLabelFromUserMetadata, signupUserMetadata, validateUsername } from "./accountProfile";

assert.equal(validateUsername("Hero"), null);
assert.equal(validateUsername(" H "), "Username must be at least 2 characters.");
assert.equal(validateUsername("A very very very very long hero name"), "Username must be 24 characters or fewer.");

assert.deepEqual(signupUserMetadata("  Pocket Tens  "), {
  display_name: "Pocket Tens",
  username: "Pocket Tens"
});

assert.equal(profileLabelFromUserMetadata({ username: "Pocket Tens", display_name: "Ignored" }), "Pocket Tens");
assert.equal(profileLabelFromUserMetadata({ display_name: "River Caller" }), "River Caller");
assert.equal(profileLabelFromUserMetadata({ username: "   " }), null);

console.log("account profile tests passed");
