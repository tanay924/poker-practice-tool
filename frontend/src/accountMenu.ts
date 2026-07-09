export type AccountMenuAction = "signOut";

export interface AccountMenuItem {
  action?: AccountMenuAction;
  label: string;
  to?: string;
}

export interface AccountMenuState {
  authConfigured: boolean;
  isAuthenticated: boolean;
  loading: boolean;
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
    items.push({ action: "signOut", label: "Sign out" });
  } else {
    items.push({ label: "Sign in", to: "/auth" });
  }

  return {
    items,
    statusText: state.isAuthenticated ? state.userLabel ?? "Signed in" : "Guest mode",
    triggerLabel: "Account menu"
  };
}
