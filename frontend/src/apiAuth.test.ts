import assert from "node:assert/strict";

import { requestInitWithAuth } from "./api";

assert.deepEqual(requestInitWithAuth(undefined).headers, {
  "Content-Type": "application/json"
});

assert.deepEqual(requestInitWithAuth("token-123").headers, {
  Authorization: "Bearer token-123",
  "Content-Type": "application/json"
});

assert.deepEqual(requestInitWithAuth(null, {}, "guest-12345678901234567890").headers, {
  "Content-Type": "application/json",
  "X-Guest-Session": "guest-12345678901234567890"
});

assert.deepEqual(
  requestInitWithAuth("token-123", {
    headers: {
      "X-Test": "yes"
    },
    method: "POST"
  }),
  {
    headers: {
      Authorization: "Bearer token-123",
      "Content-Type": "application/json",
      "X-Test": "yes"
    },
    method: "POST"
  }
);

console.log("api auth tests passed");
