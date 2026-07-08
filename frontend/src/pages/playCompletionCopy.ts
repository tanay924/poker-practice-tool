export interface PlayCompletionState {
  authConfigured: boolean;
  authLoading: boolean;
  isAuthenticated: boolean;
  savedHandId: number | null;
  saving: boolean;
}

export type PlayCompletionPrimaryAction = {
  kind: "auth";
  label: string;
  to: string;
} | null;

export function playCompletionMessage(state: PlayCompletionState): string {
  if (state.authLoading) {
    return "Checking account...";
  }
  if (!state.authConfigured) {
    return "Guest hand complete. Configure Supabase to save hands and run solver analysis.";
  }
  if (!state.isAuthenticated) {
    return "Guest hand complete. Sign in to save this hand and run solver analysis.";
  }
  if (state.saving) {
    return "Saving hand...";
  }
  if (state.savedHandId) {
    return `Saved as hand #${state.savedHandId}`;
  }
  return "Waiting to save.";
}

export function playCompletionPrimaryAction(state: PlayCompletionState): PlayCompletionPrimaryAction {
  if (!state.authConfigured || state.authLoading || state.isAuthenticated) {
    return null;
  }
  return {
    kind: "auth",
    label: "Sign in to save and analyze",
    to: "/auth?redirect=/play"
  };
}
