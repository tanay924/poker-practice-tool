import { guestTrialMessage, type GuestTrialSnapshot } from "../guestTrial";

export interface PlayCompletionState {
  authConfigured: boolean;
  authLoading: boolean;
  guestTrial: GuestTrialSnapshot | null;
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
    if (state.guestTrial) {
      return `Guest hand complete. ${guestTrialMessage(state.guestTrial, "analysis")}`;
    }
    return "Guest hand complete.";
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
  if (!state.guestTrial?.limitReached) {
    return null;
  }
  return {
    kind: "auth",
    label: "Sign in to analyze more hands",
    to: "/auth?redirect=/play"
  };
}
