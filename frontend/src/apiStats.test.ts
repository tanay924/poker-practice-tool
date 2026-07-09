import assert from "node:assert/strict";

import { getMyStats } from "./api";

const calls: Array<{ init?: RequestInit; url: string }> = [];

globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
  calls.push({ init, url: String(input) });
  return new Response(
    JSON.stringify({
      analyzed: {
        biggest_leak: "BB vs SB open is your lowest preflop spot.",
        hands_analyzed: 1,
        postflop_decisions_reviewed: 2,
        postflop_mistakes: 1,
        preflop_accuracy: 0.5,
        preflop_correct: 1,
        preflop_decisions_reviewed: 2
      },
      overall: { hands_played: 3 },
      postflop_by_action: [],
      postflop_by_situation: [],
      postflop_by_street: [],
      preflop_by_position: [],
      preflop_by_spot: [],
      preflop_mistake_types: [],
      recent: {
        hands_analyzed_7d: 1,
        hands_analyzed_30d: 1,
        hands_played_7d: 2,
        hands_played_30d: 2,
        preflop_accuracy_30d: 0.5
      },
      recommendations: []
    }),
    { headers: { "Content-Type": "application/json" }, status: 200 }
  );
};

const stats = await getMyStats("token-123");

assert.equal(calls[0].url.endsWith("/api/stats/me"), true);
assert.equal(calls[0].init?.method, undefined);
assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, "Bearer token-123");
assert.equal(stats.overall.hands_played, 3);
assert.equal(stats.analyzed.preflop_accuracy, 0.5);

console.log("api stats tests passed");
