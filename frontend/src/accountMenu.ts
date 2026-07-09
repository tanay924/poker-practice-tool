export type AccountMenuAction = "signOut";

export interface AccountMenuItem {
  action?: AccountMenuAction;
  badge?: string;
  label: string;
  to?: string;
}

export interface AccountNotificationCounts {
  pending_friend_requests: number;
  unread_shared_hands: number;
}

export interface AccountMenuState {
  authConfigured: boolean;
  isAuthenticated: boolean;
  loading: boolean;
  notifications?: AccountNotificationCounts | null;
  userLabel: string | null;
}

export interface AccountMenuModel {
  items: AccountMenuItem[];
  statusText: string;
  triggerLabel: string;
}

export function accountMenuModel(state: AccountMenuState): AccountMenuModel {
  if (state.loading) {
    return {
      items: [],
      statusText: "Checking account...",
      triggerLabel: "Account menu"
    };
  }

  const items: AccountMenuItem[] = [
    { label: "My library", to: "/analysis" }
  ];

  if (state.isAuthenticated) {
    const pendingFriendRequests = state.notifications?.pending_friend_requests ?? 0;
    const unreadSharedHands = state.notifications?.unread_shared_hands ?? 0;
    items.push(
      { badge: unreadSharedHands > 0 ? String(unreadSharedHands) : undefined, label: "Shared with me", to: "/shared" },
      { badge: pendingFriendRequests > 0 ? String(pendingFriendRequests) : undefined, label: "Manage friends", to: "/friends" }
    );
    items.push({ action: "signOut", label: "Sign out" });
  } else {
    items.push({ label: "Sign in", to: "/auth" });
  }

  const notificationCount = notificationTotal(state.notifications);
  return {
    items,
    statusText: state.isAuthenticated ? state.userLabel ?? "Signed in" : "Guest mode",
    triggerLabel: notificationCount > 0 ? `Account menu, ${notificationCount} notifications` : "Account menu"
  };
}

export function notificationTotal(notifications: AccountNotificationCounts | null | undefined): number {
  return (notifications?.pending_friend_requests ?? 0) + (notifications?.unread_shared_hands ?? 0);
}
