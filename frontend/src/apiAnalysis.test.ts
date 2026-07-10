import assert from "node:assert/strict";

import { listAnalysisPage } from "./api";

let calledUrl = "";
globalThis.fetch = async (input: string | URL | Request) => {
  calledUrl = String(input);
  return Response.json({ items: [], next_cursor: "next" });
};

const result = await listAnalysisPage("token-123", "cursor-value", 10);
assert.deepEqual(result, { items: [], next_cursor: "next" });
assert.match(calledUrl, /\/api\/analysis\/page\?limit=10&cursor=cursor-value$/);

console.log("api analysis tests passed");
