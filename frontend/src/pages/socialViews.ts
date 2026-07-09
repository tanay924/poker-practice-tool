import type { FriendRequestRead } from "../types";

export interface FriendRequestBuckets {
  incoming: FriendRequestRead[];
  outgoing: FriendRequestRead[];
}

export function partitionFriendRequests(requests: FriendRequestRead[], currentUsername: string | null): FriendRequestBuckets {
  if (!currentUsername) {
    return { incoming: requests, outgoing: [] };
  }
  const normalized = currentUsername.trim().toLocaleLowerCase();
  return requests.reduce<FriendRequestBuckets>(
    (buckets, request) => {
      if (request.recipient_username.trim().toLocaleLowerCase() === normalized) {
        buckets.incoming.push(request);
      } else {
        buckets.outgoing.push(request);
      }
      return buckets;
    },
    { incoming: [], outgoing: [] }
  );
}

export function formatSharedBoard(board: string[]): string {
  return board.length > 0 ? board.join(" ") : "No board cards";
}
