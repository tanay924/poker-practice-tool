import assert from "node:assert/strict";

import { deleteHand } from "./api";

let parsedJson = false;
globalThis.fetch = async () => new Response(null, {
  status: 204,
  headers: {
    "Content-Type": "application/json"
  }
});

const originalJson = Response.prototype.json;
Response.prototype.json = async function json() {
  parsedJson = true;
  return originalJson.call(this);
};

await deleteHand(42, "token-123");
assert.equal(parsedJson, false, "204 responses should not be parsed as JSON");

Response.prototype.json = originalJson;
console.log("api lifecycle tests passed");
