import assert from "node:assert/strict";

import { formatSharedBoard, partitionFriendRequests } from "./socialViews";
import type { FriendRequestRead } from "../types";

const requests: FriendRequestRead[] = [
  {
    created_at: "2026-07-09T10:00:00Z",
    id: 1,
    recipient_username: "Hero",
    requester_username: "Villain",
    status: "pending"
  },
  {
    created_at: "2026-07-09T10:01:00Z",
    id: 2,
    recipient_username: "Button",
    requester_username: "Hero",
    status: "pending"
  }
];

assert.deepEqual(partitionFriendRequests(requests, "Hero").incoming.map((request) => request.id), [1]);
assert.deepEqual(partitionFriendRequests(requests, "Hero").outgoing.map((request) => request.id), [2]);
assert.deepEqual(partitionFriendRequests(requests, null).incoming.map((request) => request.id), [1, 2]);
assert.equal(formatSharedBoard([]), "No board cards");
assert.equal(formatSharedBoard(["Ks", "7d", "2c"]), "Ks 7d 2c");

console.log("social views tests passed");
