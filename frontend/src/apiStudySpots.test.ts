import assert from "node:assert/strict";

import { listSimilarStudySpots } from "./api";

const calls: Array<{ init?: RequestInit; url: string }> = [];

globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
  calls.push({ init, url: String(input) });
  return new Response(
    JSON.stringify({
      source: { node: "Flop facing bet", street: "flop", tags: ["flop", "facing-bet"] },
      spots: [
        {
          best_action: "fold",
          board: ["Ks", "7d", "2c"],
          confidence: "high",
          hero_action: "call",
          hero_hand: "AhKh",
          id: 12,
          line: ["preflop: SB raise 2.5bb"],
          node: "Flop facing bet",
          solver_strategy: { call: 0.1, fold: 0.9 },
          street: "flop",
          tags: ["flop", "facing-bet", "single-raised-pot"],
          verdict: "mistake"
        }
      ]
    }),
    { headers: { "Content-Type": "application/json" }, status: 200 }
  );
};

const result = await listSimilarStudySpots({ handId: 42, node: "Flop facing bet", street: "flop" }, "token-123");

assert.equal(calls[0].url.includes("/api/study-spots/similar?"), true);
assert.equal(calls[0].url.includes("hand_id=42"), true);
assert.equal(calls[0].url.includes("street=flop"), true);
assert.equal(calls[0].url.includes("node=Flop+facing+bet"), true);
assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, "Bearer token-123");
assert.equal(result.spots[0].hero_hand, "AhKh");

console.log("api study spot tests passed");
