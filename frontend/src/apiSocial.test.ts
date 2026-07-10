import assert from "node:assert/strict";

import { getNotifications, sendFriendRequest, shareHand, syncProfile } from "./api";

const calls: Array<{ init?: RequestInit; url: string }> = [];

globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
  calls.push({ init, url: String(input) });
  return new Response(
    JSON.stringify({
      pending_friend_requests: 2,
      unread_shared_hands: 1,
      username: "Pocket Tens"
    }),
    { headers: { "Content-Type": "application/json" }, status: 200 }
  );
};

await syncProfile("Pocket Tens", "token-123");
assert.equal(calls[0].url.endsWith("/api/social/profile"), true);
assert.equal(calls[0].init?.method, "PUT");
assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { username: "Pocket Tens" });
assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, "Bearer token-123");

await sendFriendRequest("Villain", "token-123");
assert.equal(calls[1].url.endsWith("/api/social/friend-requests"), true);
assert.equal(calls[1].init?.method, "POST");
assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { username: "Villain" });

await shareHand(42, "Villain", "token-123");
assert.equal(calls[2].url.endsWith("/api/social/shared-hands"), true);
assert.equal(calls[2].init?.method, "POST");
assert.deepEqual(JSON.parse(String(calls[2].init?.body)), { hand_id: 42, username: "Villain" });

await getNotifications("token-123");
assert.equal(calls[3].url.endsWith("/api/social/notifications"), true);
assert.equal(calls[3].init?.method, undefined);

console.log("api social tests passed");
