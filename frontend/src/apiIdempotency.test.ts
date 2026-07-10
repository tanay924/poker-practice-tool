import assert from "node:assert/strict";

import { saveHand } from "./api";
import type { HandCreate } from "./types";

let requestHeaders: Record<string, string> | undefined;
const payload: HandCreate = {
  hero_position: "SB",
  villain_position: "BB",
  hero_cards: "AsKd",
  villain_cards: "QcJh",
  board_json: ["Ks", "7d", "2c", "4h", "9s"],
  stack_bb: 100,
  pot: 2.5,
  action_history_json: [],
  result_json: { winner: "none", reason: "test" }
};

globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit) => {
  requestHeaders = init?.headers as Record<string, string>;
  return Response.json({ ...payload, id: 42, created_at: "2026-07-10T00:00:00Z" });
};

await saveHand(payload, "token-123", "hand-retry-42");
assert.equal(requestHeaders?.["Idempotency-Key"], "hand-retry-42");

console.log("api idempotency tests passed");
